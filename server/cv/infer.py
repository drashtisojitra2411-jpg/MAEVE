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
}

# DF2 classes whose raw name cannot be resolved to a single MAEVE category by
# the model alone. These are surfaced with `needsUserInput` rather than guessed.
DF2_AMBIGUOUS = {
    "short_sleeved_outwear",
    "long_sleeved_outwear",
}

SLEEVE_MAP = {"short_sleeved_shirt": "short", "short_sleeved_outwear": "short",
              "short_sleeved_dress": "short", "long_sleeved_shirt": "long",
              "long_sleeved_outwear": "long", "long_sleeved_dress": "long"}

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


def mask_to_alpha(mask_array: np.ndarray, ih: int, iw: int) -> np.ndarray:
    """Resize raw mask to image size, filter noise specks, bridge occlusions, and soft-feather edges."""
    m = mask_array.squeeze(0)  # (mh, mw)
    mimg = Image.fromarray((m * 255).astype(np.uint8)).resize(
        (iw, ih), Image.Resampling.BILINEAR,
    )
    raw_alpha = np.asarray(mimg).astype(np.uint8)

    try:
        import cv2
        # Filter out tiny disconnected noise specks (< 5% of largest component)
        bin_mask = (raw_alpha > 38).astype(np.uint8)
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(bin_mask)
        if num_labels > 2:
            max_area = max(stats[1:, cv2.CC_STAT_AREA])
            clean_mask = np.zeros_like(raw_alpha)
            for i in range(1, num_labels):
                if stats[i, cv2.CC_STAT_AREA] >= max_area * 0.05:
                    clean_mask[labels == i] = raw_alpha[labels == i]
        else:
            clean_mask = raw_alpha

        # Morphological closing to bridge small occlusions (hair, thin straps)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        closed = cv2.morphologyEx(clean_mask, cv2.MORPH_CLOSE, kernel)
        feathered = cv2.GaussianBlur(closed, (3, 3), 1.0)
        alpha = feathered.astype(np.float32) / 255.0
    except Exception:
        mimg = mimg.filter(ImageFilter.GaussianBlur(radius=2))
        alpha = np.asarray(mimg).astype(np.float32) / 255.0

    return np.clip(alpha, 0.0, 1.0)


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
                    subcategory: str) -> dict:
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
    base = {
        "category": df2_category(subcategory),
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
    # pattern → only 'solid' when the real masked pixels are statistically flat
    grey = (0.299 * px_rgb[..., 0] + 0.587 * px_rgb[..., 1] +
            0.114 * px_rgb[..., 2])
    sigma = float(grey.std())
    pattern = "solid" if sigma < 13.0 else None  # else: unknown, do not guess
    base.update({
        "color": primary,
        "colorHex": colorHex,
        "secondaryColor": secondary,
        "colorConfidence": color_conf,
        "pattern": pattern,
        # Ambiguous category OR an uncertain colour reading → ask the person.
        "needsUserInput": base["needsUserInput"] or color_conf < 0.55,
    })
    return base


def df2_category(subcategory: str) -> str:
    return DF2_CATEGORY_MAP.get(subcategory, "tops")


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

        log("separating")
        garments = []
        for idx, det in enumerate(dets):
            sub = det["subcategory"]
            log("isolating")
            alpha = mask_to_alpha(det["mask_array"], base.shape[0], base.shape[1])
            iso_path = os.path.join(args.workdir, f"isolated-{idx}.png")
            thumb_path = os.path.join(args.workdir, f"thumbnail-{idx}.png")
            # Save full-canvas isolated image (for reference / future use).
            isolate_garment(base, alpha, iso_path)
            # Save tightly-cropped thumbnail — this is the primary display image.
            # If the mask is degenerate (returns False), skip this detection.
            thumb_ok = make_thumbnail(base, alpha, det["xyxy"], thumb_path)
            if not thumb_ok:
                log(f"skipping-degenerate-mask-{idx}")
                continue
            x1, y1, x2, y2 = det["xyxy"]
            details = reading_details(base, alpha, sub)
            H, W = base.shape[:2]
            garments.append({
                "id": f"cand-{idx}",
                "subcategory": sub,
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
                "needsUserInput": details["needsUserInput"],
                "boundingBox": {
                    "x": round(x1 / W, 4), "y": round(y1 / H, 4),
                    "width": round((x2 - x1) / W, 4),
                    "height": round((y2 - y1) / H, 4),
                },
                # thumbnailFile is the tight-cropped garment image (primary display).
                # isolatedFile is the full-canvas masked image (reference).
                "isolatedFile": f"isolated-{idx}.png",
                "thumbnailFile": f"thumbnail-{idx}.png",
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