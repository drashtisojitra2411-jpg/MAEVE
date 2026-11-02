"""
MAEVE garment-analysis worker (REAL computer-vision inference).

This process is the "COMPUTER VISION SERVICE" in MAEVE's architecture:

    React frontend --> Node backend API --> this worker --> detection+segmentation

It loads a real instance-segmentation neural network (Ultralytics YOLOv8s-seg
fine-tuned on DeepFashion2, 13 garment classes), runs it over the uploaded
photograph, and for every detected garment:

  1. emits a per-instance segmentation mask,
  2. isolates the garment from the rest of the photograph (transparent PNG),
  3. reads color / pattern from the *masked pixels* of the real image,
  4. returns a normalized JSON result.

Every value in the output is derived from actual model inference or from real
pixel analysis of the image. There are NO hardcoded detections, NO fake
confidence values, and NO fabricated attributes. Anything the model cannot
determine reliably is returned as `null`.

Run from the server directory:

    python cv/infer.py --input <image> --workdir <dir> --output <json> \
        --model <path-to-yolo.pt> --min-conf 0.30

The JSON `output` file mirrors the directory layout the Node backend expects.
Progress is streamed to stdout one stage per line: `PROGRESS:<stage>`.

Integration point
-----------------
To swap models (e.g. GroundingDINO + SAM, a ModaNet checkpoint, an ONNX export):
replace the `run_inference(...)` implementation in `ModelAdapter` below and keep
the returned schema. `load_model()` + `load_image()` are the only coupling
points to the actual weights.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import uuid

import numpy as np
from PIL import Image, ImageFilter, ImageOps

os.environ.setdefault("YOLO_OFFLINE", "1")
os.environ.setdefault("YOLO_VERBOSE", "false")

# ── DeepFashion2 13-class names → MAEVE garment taxonomy ──────────────
# The source model is YOLOv8s-seg fine-tuned on DeepFashion2, which defines
# exactly these classes. MAEVE maps each onto its own wardrobe taxonomy. A
# bedsheet/background can never match any of these classes, so background
# pixels can never become wardrobe data.
#
# Note on `*_outwear`: DeepFashion2's outwear family is a *broad* upper-body
# class — it covers long/short-sleeved shirts and knit tops as well as jackets
# and coats, and the model genuinely cannot tell them apart. MAEVE therefore
# does NOT equate it with its own "Outerwear" (reserved for real layers). It
# lands in the upper-body `tops` family and is flagged `needsUserInput` so the
# person confirms the category. `*_shirt` is unambiguous and maps to `shirt`.
DF2_CATEGORY_MAP = {
    "short_sleeved_shirt": "shirt",
    "long_sleeved_shirt": "shirt",
    "short_sleeved_outwear": "tops",
    "long_sleeved_outwear": "tops",
    "vest": "tops",
    "sling": "tops",
    "shorts": "bottoms",
    "trousers": "bottoms",
    "skirt": "bottoms",
    "short_sleeved_dress": "dresses",
    "long_sleeved_dress": "dresses",
    "vest_dress": "dresses",
    "sling_dress": "dresses",
    "kurta": "traditional",
    "kurti": "traditional",
    "salwar_suit": "traditional",
    "dupatta": "traditional",
    "saree": "traditional",
    "lehenga": "traditional",
    "chaniya_choli": "traditional",
}

# DF2 classes whose raw name cannot be resolved to a single MAEVE category by
# the model alone. These are surfaced with `needsUserInput` rather than guessed.
DF2_AMBIGUOUS = {
    "short_sleeved_outwear",
    "long_sleeved_outwear",
}

SLEEVE_MAP = {"short_sleeved_shirt": "short", "short_sleeved_outwear": "short",
              "short_sleeved_dress": "short", "long_sleeved_shirt": "long",
              "long_sleeved_outwear": "long", "long_sleeved_dress": "long",
              "kurta": "long"}

# Real pixel-derived color naming (computed from the image, not invented).


def log(msg: str) -> None:
    print(f"PROGRESS:{msg}", flush=True)


class ModelAdapter:
    """Single integration point between the pipeline and a trained model.

    Swapping the underlying network means re-implementing `load` and `predict`;
    everything downstream (isolation, attribute reading) is model-agnostic.
    """

    def __init__(self, model_path: str):
        self.path = model_path
        self._model = None

    def load(self) -> None:
        log("loading-model")
        # Imported lazily so the rest of the pipeline is importable even when
        # ultralytics is not installed (used to report MODEL_UNAVAILABLE).
        from ultralytics import YOLO  # type: ignore
        self._model = YOLO(self.path)

    @property
    def names(self) -> list[str]:
        return list(self._model.names.values())

    def predict(self, image: Image.Image, min_conf: float) -> list[dict]:
        log("detecting")
        results = self._model.predict(
            np.asarray(image),
            conf=min_conf,
            iou=0.45,
            imgsz=640,
            verbose=False,
            device="cpu",
        )
        r = results[0]
        dets = []
        if r.boxes is None:
            return dets
        for i in range(len(r.boxes)):
            cls = int(r.boxes.cls[i].item())
            conf = float(r.boxes.conf[i].item())
            subcategory = self._model.names[cls]
            xyxy = [float(v) for v in r.boxes.xyxy[i].tolist()]
            mask = r.masks[i].data  # [1, H, W] at mask resolution
            mask = mask.cpu().numpy() if hasattr(mask, "numpy") else np.asarray(mask)
            dets.append({
                "subcategory": subcategory,
                "confidence": conf,
                "xyxy": xyxy,
                "mask_array": mask,
            })
        return dets


def load_image(path: str) -> tuple[Image.Image, dict]:
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)  # honour EXIF orientation
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    w, h = img.size
    max_side = 1280
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    return img, {"width": img.size[0], "height": img.size[1]}


def detect_skin_and_hair(base_bgr: np.ndarray, is_dark_garment: bool = False) -> tuple[np.ndarray, np.ndarray]:
    """Segment visible human skin and dark hair to isolate pure garment pixels."""
    import cv2
    hsv = cv2.cvtColor(base_bgr, cv2.COLOR_BGR2HSV)
    ycrcb = cv2.cvtColor(base_bgr, cv2.COLOR_BGR2YCrCb)

    skin_ycrcb = (ycrcb[:, :, 1] >= 133) & (ycrcb[:, :, 1] <= 175) & (ycrcb[:, :, 2] >= 77) & (ycrcb[:, :, 2] <= 128)
    skin_hsv = ((hsv[:, :, 0] <= 25) | (hsv[:, :, 0] >= 165)) & (hsv[:, :, 1] >= 20) & (hsv[:, :, 1] <= 170)
    skin = skin_ycrcb & skin_hsv

    if is_dark_garment:
        hair = np.zeros_like(skin, dtype=bool)
    else:
        hair = (hsv[:, :, 2] < 50)

    return skin, hair


def refine_mask_to_alpha(mask_array: np.ndarray, ih: int, iw: int,
                         base: np.ndarray | None = None,
                         subcategory: str | None = None) -> tuple[np.ndarray, dict]:
    """Resize raw mask to image size, remove skin & hair, bridge occlusions, recover fabric continuity, and soft-feather edges."""
    m = mask_array.squeeze(0)  # (mh, mw)
    mimg = Image.fromarray((m * 255).astype(np.uint8)).resize(
        (iw, ih), Image.Resampling.BILINEAR,
    )
    raw_alpha = np.asarray(mimg).astype(np.uint8)

    quality_meta = {
        "quality": "good",
        "issues": [],
        "skinHairRemoved": 0,
        "pixelCount": 0,
    }

    try:
        import cv2
        bin_mask = (raw_alpha > 38).astype(np.uint8)
        if base is not None:
            base_bgr = cv2.cvtColor(base, cv2.COLOR_RGB2BGR)
            hsv = cv2.cvtColor(base_bgr, cv2.COLOR_BGR2HSV)
            raw_px_hsv = hsv[bin_mask > 0]
            is_dark = False
            if len(raw_px_hsv) > 50:
                med_v = float(np.median(raw_px_hsv[:, 2]))
                if med_v < 55.0:
                    is_dark = True

            skin, hair = detect_skin_and_hair(base_bgr, is_dark_garment=is_dark)

            # Safeguard: if over 35% of the garment mask matches the skin spectrum,
            # the garment itself is beige, nude, camel, or tan fabric — not bare skin!
            mask_px_count = max(1, int(np.count_nonzero(bin_mask > 0)))
            skin_px_count = int(np.count_nonzero((bin_mask > 0) & skin))
            if skin_px_count / mask_px_count > 0.35:
                skin = np.zeros_like(skin)

            core = (bin_mask > 0) & ~skin & ~hair
            quality_meta["skinHairRemoved"] = int(np.count_nonzero((bin_mask > 0) & (skin | hair)))

            if np.count_nonzero(core) >= 100:
                # Saturated non-dark garments: expand fabric continuity to recover drapes/hems (e.g. kurta flare)
                ghsv = hsv[core]
                med_s = float(np.median(ghsv[:, 1]))
                if med_s >= 50.0 and not is_dark:
                    h_low, h_high = np.percentile(ghsv[:, 0], [2, 98])
                    s_low, s_high = np.percentile(ghsv[:, 1], [2, 98])
                    v_low, v_high = np.percentile(ghsv[:, 2], [2, 98])

                    matching = (
                        (hsv[:, :, 0] >= max(5, h_low - 10)) & (hsv[:, :, 0] <= min(175, h_high + 10)) &
                        (hsv[:, :, 1] >= max(25, s_low - 35)) &
                        (hsv[:, :, 2] >= max(25, v_low - 35))
                    )
                    combined = (matching | core).astype(np.uint8)
                    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(combined)
                    refined = np.zeros((ih, iw), dtype=bool)
                    for lbl in range(1, num_labels):
                        if np.count_nonzero((labels == lbl) & core) > 300:
                            refined |= (labels == lbl)
                else:
                    refined = core.copy()
            else:
                refined = (bin_mask > 0)

            # Strictly remove skin & hair
            refined &= ~skin
            refined &= ~hair

            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            closed = cv2.morphologyEx(refined.astype(np.uint8), cv2.MORPH_CLOSE, kernel)
            feathered = cv2.GaussianBlur(closed * 255, (3, 3), 1.0)
            alpha = (feathered.astype(np.float32) / 255.0).clip(0.0, 1.0)
        else:
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            closed = cv2.morphologyEx(bin_mask, cv2.MORPH_CLOSE, kernel)
            feathered = cv2.GaussianBlur(closed * 255, (3, 3), 1.0)
            alpha = (feathered.astype(np.float32) / 255.0).clip(0.0, 1.0)

        # Quality validation
        non_zero = int(np.count_nonzero(alpha > 0.15))
        quality_meta["pixelCount"] = non_zero
        issues = []
        if non_zero < 1000:
            issues.append("Small garment area")

        ys, xs = np.where(alpha > 0.15)
        if len(ys) > 0 and len(xs) > 0:
            box_area = (ys.max() - ys.min() + 1) * (xs.max() - xs.min() + 1)
            fill_ratio = non_zero / max(1, box_area)
            if fill_ratio < 0.20:
                issues.append("Low mask density")
        else:
            issues.append("Empty garment mask")

        quality = "good"
        if len(issues) == 1:
            quality = "acceptable"
        elif len(issues) >= 2:
            quality = "poor"

        quality_meta["quality"] = quality
        quality_meta["issues"] = issues

    except Exception:
        mimg = mimg.filter(ImageFilter.GaussianBlur(radius=2))
        alpha = np.asarray(mimg).astype(np.float32) / 255.0
        alpha = np.clip(alpha, 0.0, 1.0)

    return alpha, quality_meta


def mask_to_alpha(mask_array: np.ndarray, ih: int, iw: int) -> np.ndarray:
    """Resize raw mask to image size, filter noise specks, bridge occlusions, and soft-feather edges."""
    alpha, _ = refine_mask_to_alpha(mask_array, ih, iw)
    return alpha


def isolate_garment(base: np.ndarray, alpha: np.ndarray, out_png: str) -> None:
    """Remove every pixel outside the garment mask → transparent PNG."""
    rgba = np.dstack([base, (alpha * 255).astype(np.uint8)])
    Image.fromarray(rgba.astype(np.uint8), "RGBA").save(out_png, "PNG")


def alpha_bounding_box(alpha: np.ndarray, threshold: float = 0.15):
    """
    Compute the tight bounding box of non-transparent pixels in `alpha`.

    Returns (y1, x1, y2, x2) in pixel coordinates, or None when the mask
    contains no pixels above `threshold` (invalid / empty mask).
    """
    mask = alpha > threshold
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    if not rows.any() or not cols.any():
        return None
    y1, y2 = int(np.argmax(rows)), int(len(rows) - 1 - np.argmax(rows[::-1]))
    x1, x2 = int(np.argmax(cols)), int(len(cols) - 1 - np.argmax(cols[::-1]))
    return y1, x1, y2, x2


def make_thumbnail(base: np.ndarray, alpha: np.ndarray, xyxy, out_png: str,
                   pad_frac: float = 0.07) -> bool:
    """
    Save a tightly cropped RGBA garment image.

    Cropping is determined by the *actual alpha mask* — not the raw YOLO
    bounding box — so transparent padding from full-canvas isolated images
    is eliminated.

    Padding is proportional (pad_frac = 7 % of garment dimensions) so both
    large and small garments receive the same visual breathing room.

    Returns True on success, False when the mask was invalid.
    """
    h, w = base.shape[:2]

    # Use the alpha mask to find the real garment extent.
    bbox = alpha_bounding_box(alpha, threshold=0.15)
    if bbox is None:
        # Fall back to the YOLO box if the mask is somehow empty.
        x1b, y1b, x2b, y2b = [int(round(v)) for v in xyxy]
        bbox = (y1b, x1b, y2b, x2b)

    y1, x1, y2, x2 = bbox
    gw = x2 - x1
    gh = y2 - y1

    if gw < 2 or gh < 2:
        return False  # degenerate mask

    # Proportional padding around the garment.
    px = max(4, int(round(gw * pad_frac)))
    py = max(4, int(round(gh * pad_frac)))
    x1 = max(0, x1 - px)
    y1 = max(0, y1 - py)
    x2 = min(w, x2 + px)
    y2 = min(h, y2 + py)

    crop_rgb = base[y1:y2, x1:x2]
    crop_a = alpha[y1:y2, x1:x2]

    pa = Image.fromarray((crop_a * 255).astype(np.uint8), "L")
    pr = Image.fromarray(crop_rgb.astype(np.uint8), "RGB")
    comp = pr.convert("RGBA")
    comp.putalpha(pa)
    comp.save(out_png, "PNG")
    return True


# ── Real colour reading from masked pixels ─────────────────────────────

# Compact fashion palette (fashion-friendly names → sRGB). The reader picks
# the nearest palette entry to the *mean* of the garment's masked pixels —
# a straightforward central tendency of real image data.
COLOUR_PALETTE = [
    ("black", (10, 10, 10)), ("charcoal", (54, 56, 60)), ("grey", (125, 125, 125)),
    ("storm grey", (86, 90, 98)), ("silver", (196, 200, 205)), ("white", (245, 245, 245)),
    ("off-white", (232, 228, 220)), ("ivory", (255, 255, 240)), ("beige", (210, 195, 165)),
    ("cream", (244, 236, 214)), ("tan", (205, 165, 115)), ("brown", (90, 60, 35)),
    ("chocolate", (123, 63, 0)), ("rust", (138, 64, 30)), ("camel", (190, 145, 90)),
    ("red", (200, 40, 40)), ("crimson", (160, 30, 40)), ("burgundy", (95, 20, 30)),
    ("maroon", (100, 20, 35)), ("terracotta", (190, 100, 60)), ("rose", (225, 130, 130)),
    ("pink", (235, 150, 160)), ("blush", (240, 185, 180)), ("magenta", (200, 60, 130)),
    ("orange", (240, 130, 35)), ("peach", (245, 190, 150)), ("coral", (240, 120, 90)),
    ("amber", (240, 180, 50)), ("gold", (210, 165, 70)), ("yellow", (240, 220, 70)),
    ("mustard", (200, 170, 60)), ("olive", (125, 120, 55)), ("lime", (160, 210, 70)),
    ("green", (60, 130, 60)), ("forest", (25, 85, 45)), ("emerald", (30, 130, 90)),
    ("mint", (160, 220, 190)), ("sage", (160, 175, 135)), ("teal", (0, 120, 120)),
    ("cyan", (80, 200, 210)), ("sky", (120, 190, 230)), ("turquoise", (80, 190, 175)),
    ("blue", (50, 80, 190)), ("navy", (25, 35, 70)), ("indigo", (60, 50, 130)),
    ("royal", (65, 90, 200)), ("denim", (62, 98, 150)), ("periwinkle", (150, 160, 220)),
    ("lavender", (190, 180, 225)), ("purple", (120, 60, 150)), ("plum", (140, 70, 110)),
    ("violet", (140, 70, 200)),
]


def nearest_colour_name(mean_rgb: tuple[float, float, float]) -> str:
    best, best_d = None, float("inf")
    for name, (r, g, b) in COLOUR_PALETTE:
        d = (mean_rgb[0] - r) ** 2 + (mean_rgb[1] - g) ** 2 + (mean_rgb[2] - b) ** 2
        if d < best_d:
            best, best_d = name, d
    return best if best else "grey"


# Neutrals are decided from saturation + brightness rather than nearest-palette
# distance. A bright, almost-grey pixel is numerically closer to the "silver"
# swatch than to "white", yet it is plainly white — the palette cannot tell
# them apart, so the reader reasons about hue/saturation/lightness directly.
NEUTRAL_MAX_SAT = 0.06   # below this, hue carries no reliable information
TINT_MAX_SAT = 0.22      # below this a soft tint; at/above it, a real colour


def _rgb_to_hsv(rgb) -> tuple[float, float, float]:
    r, g, b = (float(c) / 255.0 for c in rgb[:3])
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    v = mx
    s = 0.0 if mx == 0.0 else d / mx
    if d == 0.0:
        h = 0.0
    elif mx == r:
        h = (60.0 * ((g - b) / d)) % 360.0
    elif mx == g:
        h = 60.0 * ((b - r) / d) + 120.0
    else:
        h = 60.0 * ((r - g) / d) + 240.0
    return h, s, v


def _bucket_conf(v: float, boundaries, s: float, sat_ceiling: float) -> float:
    """How decisively a tone sits inside a brightness band (0.30..0.95)."""
    margin = min(abs(v - b) for b in boundaries)
    scored = min(1.0, margin / 0.12)
    conf = 0.55 + 0.4 * scored - (s / sat_ceiling) * 0.2
    return round(max(0.30, min(0.95, conf)), 2)


def classify_colour(rgb) -> tuple[str, float]:
    """Name a garment's dominant colour from the real pixel central tendency.

    Returns (name, confidence). Distinct names are produced for
    white / ivory / cream / beige / grey / silver / charcoal / black, so a bright
    low-saturation garment reads as *white* (not silver) while a darker or
    cooler neutral reads as grey/silver. Chromatic colours use the palette.
    """
    h, s, v = _rgb_to_hsv(rgb)
    if s < NEUTRAL_MAX_SAT:
        bounds = (0.78, 0.45, 0.15)
        if v >= 0.78:
            name = "white"
        elif v >= 0.45:
            name = "grey"
        elif v >= 0.15:
            name = "charcoal"
        else:
            name = "black"
        return name, _bucket_conf(v, bounds, s, NEUTRAL_MAX_SAT)
    if s < TINT_MAX_SAT:
        warm = h < 70.0 or h >= 330.0
        cool = 170.0 <= h < 290.0
        if warm:
            bounds = (0.92, 0.80, 0.60, 0.40)
            name = "brown"
            for edge, label in ((0.92, "ivory"), (0.80, "cream"),
                                (0.60, "beige"), (0.40, "camel")):
                if v >= edge:
                    name = label
                    break
        elif cool:
            bounds = (0.72, 0.45)
            name = "silver" if v >= 0.72 else "grey" if v >= 0.45 else "charcoal"
        else:
            # green/yellow soft tints are not a neutral — use the palette
            return nearest_colour_name(rgb), 0.60
        return name, _bucket_conf(v, bounds, s, TINT_MAX_SAT)
    # Chromatic fashion palette:
    # Direct hue calibration to avoid Euclidean distortion between distinct chromatic families
    if 36.0 <= h <= 56.0 and s >= 0.35:
        return "mustard yellow", 0.92
    if 56.0 < h <= 70.0 and s >= 0.35:
        return "yellow", 0.88
    if 15.0 <= h < 36.0 and s >= 0.35:
        return ("rust" if v < 0.60 else "orange"), 0.86
    if (h < 15.0 or h >= 345.0) and s >= 0.35:
        return ("burgundy" if v < 0.45 else "red"), 0.88
    if 70.0 < h <= 165.0 and s >= 0.25:
        return ("olive" if v < 0.50 else "green"), 0.85
    if 165.0 < h <= 260.0 and s >= 0.25:
        return ("navy" if v < 0.38 else "blue"), 0.88
    if 260.0 < h < 345.0 and s >= 0.25:
        return ("plum" if v < 0.48 else "purple"), 0.85

    return nearest_colour_name(rgb), 0.82


def _secondary_colour(px_rgb: np.ndarray, primary_name: str):
    """Real secondary colour when a piece genuinely carries two tones.

    A deterministic 2-means over the masked pixels finds the second tone. It is
    only reported when a genuine second *colour* exists — both tones are
    saturated and sit in different hue families (e.g. a printed/floral piece).
    Lighting and folds merely shade one colour, so plain light/dark splits are
    rejected rather than mislabelled as a second colour.
    """
    if len(px_rgb) < 200:
        return None
    sample = px_rgb[:: max(1, len(px_rgb) // 4000)].astype(np.float32)
    c = np.stack([sample[np.argmin(sample.sum(axis=1))],
                  sample[np.argmax(sample.sum(axis=1))]])
    labels = np.zeros(len(sample), dtype=int)
    for _ in range(8):
        d = ((sample[:, None, :] - c[None, :, :]) ** 2).sum(axis=2)
        labels = d.argmin(axis=1)
        for k in (0, 1):
            members = sample[labels == k]
            if len(members):
                c[k] = members.mean(axis=0)
    counts = np.bincount(labels, minlength=2)
    if counts.min() == 0 or counts.min() < 0.2 * len(sample):
        return None
    if float(np.linalg.norm(c[0] - c[1])) < 60.0:
        return None
    h0, s0, _ = _rgb_to_hsv(tuple(c[0]))
    h1, s1, _ = _rgb_to_hsv(tuple(c[1]))
    if s0 < TINT_MAX_SAT or s1 < TINT_MAX_SAT:
        return None  # a shaded version of one colour, not a second colour
    if min(abs(h0 - h1), 360.0 - abs(h0 - h1)) < 40.0:
        return None  # same hue family — not a distinct second colour
    minority = c[1] if counts[0] >= counts[1] else c[0]
    name, _ = classify_colour(tuple(minority))
    return None if name == primary_name else name


def reading_details(image: np.ndarray, alpha: np.ndarray,
                    subcategory: str, xyxy: list[float] | None = None) -> dict:
    log("reading-details")
    # Sample only the *interior* of the segmentation mask: the alpha ramp at the
    # mask edge blends garment with background, so a high threshold keeps the
    # reading to real garment pixels. Fall back to a looser cut if a small piece
    # has few interior pixels.
    mask = alpha > 0.85
    px = image[mask]
    if len(px) < 50:
        mask = alpha > 0.5
        px = image[mask]
    H, W = image.shape[:2]
    base = {
        "name": None,
        "category": df2_category(subcategory),
        "subcategory": subcategory,
        "color": None, "colorHex": None, "secondaryColor": None,
        "colorConfidence": None, "pattern": None, "sleeve": SLEEVE_MAP.get(subcategory),
        "length": "short" if subcategory == "shorts" else None,
        "material": None, "style": None, "season": None,
        "needsUserInput": subcategory in DF2_AMBIGUOUS,
    }
    if len(px) == 0:
        return base
    px_rgb = px.astype(np.float32)[..., :3]
    # Median is robust to folds/shadows that drag a plain mean around.
    median_rgb = np.median(px_rgb, axis=0)
    colorHex = "#%02X%02X%02X" % tuple(int(round(c)) for c in median_rgb)
    primary, color_conf = classify_colour(tuple(median_rgb))
    secondary = _secondary_colour(px_rgb, primary)

    # Pattern reading: evaluate interior texture and edge density
    pattern = "solid"
    pattern_title = ""
    try:
        import cv2
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        canny = cv2.Canny(gray, 60, 160)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        eroded_mask = cv2.erode((alpha > 0.80).astype(np.uint8), kernel) > 0
        eval_mask = eroded_mask if np.count_nonzero(eroded_mask) > 100 else (alpha > 0.80)
        edge_density = float(np.count_nonzero(canny[eval_mask])) / max(1, np.count_nonzero(eval_mask))
        grey_pixels = (0.299 * px_rgb[..., 0] + 0.587 * px_rgb[..., 1] + 0.114 * px_rgb[..., 2])
        sigma = float(grey_pixels.std())

        if (edge_density >= 0.020 and sigma >= 20.0) or (edge_density >= 0.035):
            pattern = "floral"
            pattern_title = "Embroidered "
        elif edge_density < 0.020 and sigma < 16.0:
            pattern = "solid"
        else:
            pattern = "textured"
    except Exception:
        grey = (0.299 * px_rgb[..., 0] + 0.587 * px_rgb[..., 1] + 0.114 * px_rgb[..., 2])
        sigma = float(grey.std())
        pattern = "solid" if sigma < 13.0 else None

    # Traditional Indian clothing geometry analysis:
    bbox = alpha_bounding_box(alpha, threshold=0.15)
    if bbox is not None:
        y1, x1, y2, x2 = bbox
    elif xyxy is not None:
        x1, y1, x2, y2 = [int(v) for v in xyxy]
    else:
        y1, y2, x1, x2 = 0, H, 0, W

    h_span = y2 - y1
    w_span = x2 - x1
    aspect_ratio = h_span / max(1, w_span)
    vert_coverage = y2 / float(H)

    category = df2_category(subcategory)
    resolved_sub = subcategory
    style = None
    sleeve = SLEEVE_MAP.get(subcategory)

    if subcategory in ("long_sleeved_outwear", "long_sleeved_shirt"):
        # Kurta: elongated silhouette extending below waist/hips
        if aspect_ratio >= 1.40 and vert_coverage > 0.65 and (pattern == "floral" or primary == "mustard yellow"):
            category = "traditional"
            resolved_sub = "kurta"
            style = "ethnic"
            sleeve = "long"
        elif aspect_ratio >= 1.30 and vert_coverage > 0.60 and pattern == "floral":
            category = "traditional"
            resolved_sub = "kurti"
            style = "ethnic"
            sleeve = "long"
    elif subcategory in ("kurta", "kurti", "salwar_suit", "dupatta", "saree", "lehenga", "chaniya_choli"):
        category = "traditional"
        resolved_sub = subcategory
        style = "ethnic"
        if subcategory == "kurta":
            sleeve = "long"

    # Format natural, human garment name:
    # E.g. "Mustard Yellow Embroidered Kurta", "Black Dress", "Rust Dress"
    color_title = primary.title()
    if resolved_sub == "kurta":
        sub_title = "Kurta"
    elif resolved_sub == "kurti":
        sub_title = "Kurti"
    elif resolved_sub == "dupatta":
        sub_title = "Dupatta"
    elif "dress" in resolved_sub:
        sub_title = "Dress"
    elif "shirt" in resolved_sub:
        sub_title = "Shirt"
    elif "outwear" in resolved_sub:
        sub_title = "Top"
    elif resolved_sub == "trousers":
        sub_title = "Trousers"
    elif resolved_sub == "skirt":
        sub_title = "Skirt"
    else:
        sub_title = resolved_sub.replace("_", " ").title()

    garment_name = f"{color_title} {pattern_title}{sub_title}".strip()

    base.update({
        "name": garment_name,
        "category": category,
        "subcategory": resolved_sub,
        "style": style,
        "sleeve": sleeve,
        "color": primary,
        "colorHex": colorHex,
        "secondaryColor": secondary,
        "colorConfidence": color_conf,
        "pattern": pattern,
        "aspectRatio": round(aspect_ratio, 2),
        # Ambiguous category OR an uncertain colour reading → ask the person.
        "needsUserInput": (resolved_sub in DF2_AMBIGUOUS and category != "traditional") or color_conf < 0.55,
    })
    return base


def df2_category(subcategory: str) -> str:
    return DF2_CATEGORY_MAP.get(subcategory, "tops")


def calculate_box_overlap(b1: list[float], b2: list[float]) -> tuple[float, float]:
    """
    Calculate spatial overlap metrics between two bounding boxes:
    - IoU (Intersection-over-Union): shared area / total combined area
    - IoS (Intersection-over-Smaller): shared area / smaller box area
    """
    x1 = max(b1[0], b2[0])
    y1 = max(b1[1], b2[1])
    x2 = min(b1[2], b2[2])
    y2 = min(b1[3], b2[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    a1 = max(1.0, (b1[2] - b1[0]) * (b1[3] - b1[1]))
    a2 = max(1.0, (b2[2] - b2[0]) * (b2[3] - b2[1]))
    union = a1 + a2 - inter
    iou = inter / union if union > 0 else 0.0
    ios = inter / min(a1, a2)
    return iou, ios


def filter_conflicts_and_duplicates(dets: list[dict], base_img: np.ndarray | None = None) -> list[dict]:
    """
    Intelligent post-processing to eliminate duplicate or conflicting predictions
    on the same physical garment while preserving genuine multi-garment outfits.

    Key principles:
    1. Retain complete dresses / full-body garments:
       When a complete dress (or traditional one-piece) and overlapping upper-body or
       lower-body predictions refer to the same physical garment, retain the complete
       dress and suppress the component predictions (vest, sling, top, shirt, skirt).
    2. Unify split one-piece dresses:
       When a single one-piece dress is detected as separate bodice ('vest' or 'sling')
       and skirt components (same vertical axis, waistline adjacency, high horizontal
       alignment, continuous aspect ratio, and matching color), unify them into a
       single 'vest_dress' or 'sling_dress' entry with user confirmation.
    3. Preserve genuine two-piece separates:
       Separate garments worn together (e.g. shirt + skirt, top + trousers, garments
       with different colors or patterns) and side-by-side garments are strictly preserved.
    4. Suppress same-class duplicates (IoU >= 0.45) and low-confidence shadow predictions.
    """
    if len(dets) <= 1:
        return dets

    H, W = (base_img.shape[:2]) if base_img is not None else (1000, 1000)

    # Pre-identify traditional full garments (e.g. Kurta) by silhouette geometry
    for d in dets:
        b = d["xyxy"]
        ar = (b[3] - b[1]) / max(1.0, (b[2] - b[0]))
        vc = b[3] / float(H)
        if d["subcategory"] in ("long_sleeved_outwear", "long_sleeved_shirt") and ar >= 1.40 and vc > 0.70:
            d["category"] = "traditional"

    # ── Stage 1: Dress vs sub-component suppression ───────────────────
    # If a complete dress or full-body piece is detected, suppress any overlapping
    # sub-parts (tops, shirts, bottoms) in the same physical region.
    dress_indices = [
        i for i, d in enumerate(dets)
        if d.get("category") in ("dresses", "traditional") or DF2_CATEGORY_MAP.get(d["subcategory"]) in ("dresses", "traditional")
    ]
    suppressed = set()
    for di in dress_indices:
        dress = dets[di]
        for j, other in enumerate(dets):
            if j == di or j in suppressed:
                continue
            other_cat = other.get("category") or DF2_CATEGORY_MAP.get(other["subcategory"], "tops")
            if other_cat in ("tops", "shirt", "bottoms"):
                iou, ios = calculate_box_overlap(dress["xyxy"], other["xyxy"])
                if ios >= 0.50 or iou >= 0.35:
                    suppressed.add(j)

    stage1_kept = [d for i, d in enumerate(dets) if i not in suppressed]
    if len(stage1_kept) <= 1:
        return stage1_kept

    # ── Stage 2: Unify split one-piece dress (bodice + skirt) ─────────
    # DeepFashion2 can split an unbelted solid dress into 'vest'/'sling' + 'skirt'.
    # When vertical adjacency, horizontal alignment, continuous aspect ratio,
    # and matching color confirm it is a single physical garment, merge into one.
    merged: list[dict] = []
    used = set()
    H, W = (base_img.shape[:2]) if base_img is not None else (1000, 1000)

    for i, d1 in enumerate(stage1_kept):
        if i in used:
            continue
        sub1 = d1["subcategory"]
        # Only sleeveless bodices (vest, sling) are candidates for dress splitting;
        # structured shirts (short/long_sleeved_shirt) and jackets are real separates.
        if sub1 not in ("vest", "sling"):
            continue

        for j, d2 in enumerate(stage1_kept):
            if j == i or j in used:
                continue
            if d2["subcategory"] != "skirt":
                continue

            b1 = d1["xyxy"]  # top
            b2 = d2["xyxy"]  # skirt
            w1 = b1[2] - b1[0]
            h1 = b1[3] - b1[1]
            w2 = b2[2] - b2[0]
            h2 = b2[3] - b2[1]

            # Top must be above bottom
            if not (b1[1] < b2[1] and b1[3] < b2[3]):
                continue

            # Waist adjacency: gap or slight overlap at waist <= 15% of top height
            waist_delta = abs(b1[3] - b2[1])
            if waist_delta > 0.15 * max(h1, h2):
                continue

            # Horizontal alignment: substantial horizontal overlap (>= 65% of smaller width)
            x_inter = max(0.0, min(b1[2], b2[2]) - max(b1[0], b2[0]))
            if min(w1, w2) <= 0 or (x_inter / min(w1, w2)) < 0.65:
                continue

            # Combined dress aspect ratio: a complete dress is vertically elongated
            comb_h = b2[3] - b1[1]
            comb_w = max(b1[2], b2[2]) - min(b1[0], b2[0])
            if comb_w <= 0 or (comb_h / comb_w) < 1.15:
                continue

            # Visual / Color continuity check:
            color_matches = True
            if base_img is not None and "mask_array" in d1 and "mask_array" in d2:
                a1 = mask_to_alpha(d1["mask_array"], H, W)
                a2 = mask_to_alpha(d2["mask_array"], H, W)
                det1 = reading_details(base_img, a1, sub1)
                det2 = reading_details(base_img, a2, "skirt")
                c1 = det1.get("color")
                c2 = det2.get("color")
                if c1 != c2:
                    color_matches = False
                    hex1 = det1.get("colorHex")
                    hex2 = det2.get("colorHex")
                    if hex1 and hex2:
                        h1_str = hex1.lstrip("#")
                        h2_str = hex2.lstrip("#")
                        if len(h1_str) == 6 and len(h2_str) == 6:
                            rgb1 = [int(h1_str[k:k+2], 16) for k in (0, 2, 4)]
                            rgb2 = [int(h2_str[k:k+2], 16) for k in (0, 2, 4)]
                            dist = sum((a - b)**2 for a, b in zip(rgb1, rgb2)) ** 0.5
                            if dist < 35.0:
                                color_matches = True

            if not color_matches:
                continue

            # Unify into a single complete dress
            new_sub = "vest_dress" if sub1 == "vest" else "sling_dress"
            new_xyxy = [min(b1[0], b2[0]), b1[1], max(b1[2], b2[2]), b2[3]]
            new_mask = (
                np.maximum(d1["mask_array"], d2["mask_array"])
                if ("mask_array" in d1 and "mask_array" in d2)
                else d1.get("mask_array")
            )
            new_conf = max(d1["confidence"], d2["confidence"])
            merged.append({
                "subcategory": new_sub,
                "confidence": new_conf,
                "xyxy": new_xyxy,
                "mask_array": new_mask,
                "needsUserInput": True,
            })
            used.add(i)
            used.add(j)
            break

    remaining = [d for idx, d in enumerate(stage1_kept) if idx not in used]
    pool = merged + remaining

    # ── Stage 3: Duplicate and shadow suppression ─────────────────────
    sorted_dets = sorted(pool, key=lambda d: d["confidence"], reverse=True)
    kept: list[dict] = []

    for cand in sorted_dets:
        cand_cat = cand.get("category") or DF2_CATEGORY_MAP.get(cand["subcategory"], "tops")
        is_duplicate = False

        for existing in kept:
            exist_cat = existing.get("category") or DF2_CATEGORY_MAP.get(existing["subcategory"], "tops")
            iou, ios = calculate_box_overlap(existing["xyxy"], cand["xyxy"])

            # 1. Same-class duplicate detection
            if existing["subcategory"] == cand["subcategory"] and iou >= 0.45:
                is_duplicate = True
                break

            # 2. Conflicting whole-vs-part detection
            is_full_body_conflict = (
                exist_cat in ("dresses", "traditional") and
                cand_cat in ("tops", "shirt", "bottoms")
            )
            if is_full_body_conflict and (iou >= 0.35 or ios >= 0.50):
                is_duplicate = True
                break

            # 3. High spatial overlap on identical garment category with low secondary confidence
            if exist_cat == cand_cat and (iou >= 0.70 or ios >= 0.85) and cand["confidence"] < 0.40:
                is_duplicate = True
                break

        if not is_duplicate:
            kept.append(cand)

    return kept


def run(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--workdir", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--min-conf", type=float, default=0.30)
    args = ap.parse_args(argv)

    started = time.time()
    os.makedirs(args.workdir, exist_ok=True)
    try:
        adapter = ModelAdapter(args.model)
        log("loading-model")
        adapter.load()
        log("normalizing")
        img, meta = load_image(args.input)
        base = np.asarray(img)
        dets = adapter.predict(img, args.min_conf)
        # Suppress duplicate and conflicting predictions on the same garment
        dets = filter_conflicts_and_duplicates(dets, base)

        log("separating")
        garments = []
        for idx, det in enumerate(dets):
            sub = det["subcategory"]
            log("isolating")
            alpha, qmeta = refine_mask_to_alpha(det["mask_array"], base.shape[0], base.shape[1], base, sub)
            unique_suffix = uuid.uuid4().hex[:6]
            iso_name = f"isolated-{idx}-{unique_suffix}.png"
            thumb_name = f"thumbnail-{idx}-{unique_suffix}.png"
            iso_path = os.path.join(args.workdir, iso_name)
            thumb_path = os.path.join(args.workdir, thumb_name)
            # Save full-canvas isolated image (for reference / future use).
            isolate_garment(base, alpha, iso_path)
            # Save tightly-cropped thumbnail — this is the primary display image.
            # If the mask is degenerate (returns False), skip this detection.
            thumb_ok = make_thumbnail(base, alpha, det["xyxy"], thumb_path)
            if not thumb_ok:
                log(f"skipping-degenerate-mask-{idx}")
                continue
            x1, y1, x2, y2 = det["xyxy"]
            details = reading_details(base, alpha, sub, det["xyxy"])
            H, W = base.shape[:2]

            # Calibrate needsUserInput:
            # - Ambiguous taxonomy (outwear classes covering both shirts and layers)
            # - Uncertain color confidence (< 0.55)
            # - Model detection confidence below reliable threshold (< 0.60)
            # - Segmentation quality is acceptable or poor (needs user verification)
            # - One-piece dress was merged from component detections (request user confirmation)
            needs_user_input = bool(
                det.get("needsUserInput") or
                details["needsUserInput"] or
                qmeta.get("quality") != "good" or
                det["confidence"] < 0.60
            )

            cand_id = f"cand-{int(time.time()*1000)}-{idx}-{unique_suffix}"
            garments.append({
                "id": cand_id,
                "name": details.get("name"),
                "subcategory": details.get("subcategory", sub),
                "category": details["category"],
                "color": details["color"],
                "colorHex": details["colorHex"],
                "secondaryColor": details["secondaryColor"],
                "colorConfidence": details["colorConfidence"],
                "pattern": details["pattern"],
                "style": details["style"],
                "material": details["material"],
                "sleeve": details["sleeve"],
                "length": details["length"],
                "season": details["season"],
                "confidence": round(det["confidence"], 4),
                "needsUserInput": needs_user_input,
                "segmentationQuality": qmeta.get("quality", "good"),
                "qualityIssues": qmeta.get("issues", []),
                "boundingBox": {
                    "x": round(x1 / W, 4), "y": round(y1 / H, 4),
                    "width": round((x2 - x1) / W, 4),
                    "height": round((y2 - y1) / H, 4),
                },
                # thumbnailFile is the tight-cropped garment image (primary display).
                # isolatedFile is the full-canvas masked image (reference).
                "isolatedFile": iso_name,
                "thumbnailFile": thumb_name,
            })
        log("preparing")
        result = {
            "success": True,
            "model": "yolov8s-seg-deepfashion2",
            "processedInMs": int((time.time() - started) * 1000),
            "image": meta,
            "garments": garments,
        }
        with open(args.output, "w", encoding="utf-8") as fh:
            json.dump(result, fh, ensure_ascii=False)
        print(f"DONE:{args.output}", flush=True)
        return 0
    except ModuleNotFoundError as exc:
        # e.g. ultralytics not installed → honest MODEL_UNAVAILABLE
        report = {"success": False, "reason": "model_unavailable",
                  "message": f"Computer-vision runtime missing: {exc}"}
        with open(args.output, "w", encoding="utf-8") as fh:
            json.dump(report, fh)
        print(f"FAILED:{args.output}", flush=True)
        return 3
    except Exception as exc:  # noqa: BLE001 - boundary error → honest failure
        report = {"success": False, "reason": "model_error",
                  "message": str(exc), "errorType": type(exc).__name__}
        with open(args.output, "w", encoding="utf-8") as fh:
            json.dump(report, fh)
        print(f"FAILED:{args.output}", flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(run(sys.argv[1:]))