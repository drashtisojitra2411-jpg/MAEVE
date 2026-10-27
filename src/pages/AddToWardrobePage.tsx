import { Check, ImagePlus, RefreshCw, Sparkles, UploadCloud, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  categoryLabels,
  categoryOrder,
  garmentSubcategoryLabel,
  patternLabels,
  styleLabels,
} from '../lib/garmentCatalogue'
import { CAPTURE_STAGES } from '../lib/captureStages'
import { cn } from '../lib/cn'
import { uid } from '../lib/uid'
import { analyzeGarments } from '../services/garmentAnalysisService'
import { useAuth } from '../lib/auth'
import { useWardrobe } from '../lib/wardrobe-context'
import type {
  DetectedGarment,
  GarmentAnalysisResult,
  GarmentCategory,
  GarmentPattern,
  GarmentStyle,
  WardrobeItem,
} from '../types'
import { SectionLabel } from '../components/ui/SectionLabel'
import { CaptureLoader } from '../components/loading/CaptureLoader'

type Phase = 'idle' | 'processing' | 'result' | 'saved'

interface ReviewGarment extends DetectedGarment {
  key: string
  name?: string
  accepted: boolean
  /** True once the user edits a model-suggested attribute. */
  touched?: boolean
}

const categoryOptions = categoryOrder as GarmentCategory[]
const patternOptions: GarmentPattern[] = ['solid', 'striped', 'floral', 'check', 'printed', 'textured']
const styleOptions: GarmentStyle[] = ['casual', 'formal', 'ethnic', 'sporty', 'evening', 'smart-casual']

function garmentTitle(g: ReviewGarment): string {
  if (g.name && g.name.trim()) return g.name.trim()
  const base =
    garmentSubcategoryLabel(g.subcategory) ??
    (g.category && g.category in categoryLabels ? categoryLabels[g.category] : 'Garment')
  if (g.color) return `${g.color[0].toUpperCase()}${g.color.slice(1)} ${base}`
  return `Untitled ${base}`
}

export function AddToWardrobePage() {
  const { user } = useAuth()
  const { addItems } = useWardrobe()
  const inputRef = useRef<HTMLInputElement>(null)
  const lastAttempt = useRef<{ file: File; url: string } | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [pipelineStep, setPipelineStep] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<GarmentAnalysisResult | null>(null)
  const [reviews, setReviews] = useState<ReviewGarment[]>([])
  const [dragging, setDragging] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const totalStages = CAPTURE_STAGES.length

  const reset = () => {
    setPhase('idle')
    setPreviewUrl(null)
    setFileName(null)
    setResult(null)
    setReviews([])
    setPipelineStep(0)
    setIsSaving(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const retry = () => {
    const last = lastAttempt.current
    if (last) startAnalysis(last.file, last.url)
    else reset()
  }

  const startAnalysis = (file: File, url: string) => {
    lastAttempt.current = { file, url }
    setPreviewUrl(url)
    setFileName(file.name)
    setResult(null)
    setReviews([])
    setPipelineStep(0)
    setPhase('processing')
    analyzeGarments(file, {
      onProgress: (index) => setPipelineStep(Math.max(0, index)),
    })
      .then((analysis) => {
        const hasGarments =
          analysis.status === 'complete' || analysis.status === 'low-confidence'
        const reveal = () => {
          setResult(analysis)
          if (hasGarments) {
            setReviews(
              analysis.garments.map((g, idx) => {
                const stableId = g.id || `g_${Date.now()}_${idx}`
                return {
                  ...g,
                  id: stableId,
                  key: stableId,
                  name: garmentTitle(g as ReviewGarment),
                  accepted: true,
                }
              }) as ReviewGarment[],
            )
          }
          setPhase('result')
        }
        // A short beat so the loader never flashes.
        window.setTimeout(reveal, hasGarments ? 450 : 250)
      })
      .catch(() => {
        setResult({
          status: 'unreachable',
          message:
            "MAEVE's garment-analysis service isn't reachable. Nothing was added — your photo stays on this device.",
          garments: [],
        })
        setPhase('result')
      })
  }

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    startAnalysis(file, url)
  }

  const patchReview = (key: string, patch: Partial<ReviewGarment>) => {
    setReviews((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch, touched: true } : r)),
    )
  }

  const toggleAccepted = (key: string) => {
    setReviews((prev) => prev.map((r) => (r.key === key ? { ...r, accepted: !r.accepted } : r)))
  }

  const saveToWardrobe = () => {
    if (!user || !previewUrl || isSaving) return
    setIsSaving(true)
    const items: WardrobeItem[] = reviews
      .filter((r) => r.accepted)
      .map((r) => ({
        id: r.id || r.key || uid(),
        userId: user.id,
        name: (r.name && r.name.trim()) ? r.name.trim() : garmentTitle(r),
        // Prefer the tight-cropped thumbnail; fall back to the full-canvas isolated
        // image; only use the original blob URL as a last resort.
        imageUrl: r.thumbnailUrl ?? r.imageUrl ?? previewUrl,
        isolatedImageUrl: r.imageUrl ?? r.thumbnailUrl ?? previewUrl,
        originalImageUrl: r.originalImageUrl ?? previewUrl,
        category: r.category ?? null,
        subcategory: r.subcategory ?? null,
        color: r.color?.trim() || null,
        colorHex: r.colorHex ?? null,
        secondaryColor: r.secondaryColor ?? null,
        colorConfidence: r.colorConfidence ?? null,
        pattern: r.pattern ?? null,
        style: r.style ?? null,
        material: r.material?.trim() || null,
        confidence: r.confidence ?? null,
        // A user edit resolves the uncertainty; an untouched model guess keeps it.
        needsUserInput: r.touched ? false : (r.needsUserInput ?? false),
        userCorrected: r.touched === true,
        timesWorn: 0,
        lastWornAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }))
    if (items.length === 0) {
      setIsSaving(false)
      return
    }
    addItems(items)
    setIsSaving(false)
    setPhase('saved')
  }

  const acceptedCount = reviews.filter((r) => r.accepted).length
  const hasReviews = reviews.length > 0

  const banner = (() => {
    if (!result) return null
    switch (result.status) {
      case 'complete':
        return {
          eyebrow: 'Analysis complete',
          headline: `${result.garments.length} ${result.garments.length === 1 ? 'garment' : 'garments'} detected`,
          sub: 'Review the attributes before anything is saved',
          tone: 'text-accent',
        }
      case 'low-confidence':
        return {
          eyebrow: 'MAEVE needs your input',
          headline: 'These pieces need a second look',
          sub: 'The model found these pieces but needs you to confirm at least one attribute before they\u2019re saved.',
          tone: 'text-amber-600',
        }
      case 'no-detection':
        return {
          eyebrow: 'No garments found',
          headline: 'Nothing was identified',
          sub: 'Try another photograph — a clearer shot with clothes laid flat on a contrasting background.',
          tone: 'text-muted',
        }
      case 'failed':
        return {
          eyebrow: "We couldn\u2019t analyze this photograph",
          headline: 'The analysis service ran into a problem',
          sub: result.message ?? 'Please try again.',
          tone: 'text-accent',
        }
      case 'cv-unavailable':
        return {
          eyebrow: 'Analysis unavailable',
          headline: "Garment analysis isn't available right now",
          sub: result.message ?? 'Please try again in a moment.',
          tone: 'text-muted',
        }
      case 'unreachable':
        return {
          eyebrow: 'Service unavailable',
          headline: 'MAEVE\u2019s wardrobe service is temporarily unavailable',
          sub: 'Nothing was added, and your photo stays on this device. Please try again.',
          tone: 'text-muted',
        }
      case 'unauthenticated':
        return {
          eyebrow: 'Sign in required',
          headline: 'Sign in to continue',
          sub: 'Your wardrobe is scoped to your account. Sign in, then try your photograph again.',
          tone: 'text-accent',
        }
    }
  })()
  const isSuccessStatus =
    result?.status === 'complete' || result?.status === 'low-confidence'

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-14">
      <div className="mb-12">
        <SectionLabel>Wardrobe intake</SectionLabel>
        <h2 className="mt-3 font-editorial text-4xl text-ink md:text-5xl">Add to wardrobe</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Bring a piece into your private archive. MAEVE runs a real
          computer-vision model over the photograph, isolates every garment it
          can identify, and asks you to confirm before anything is saved. If the
          model is unsure, it will say so.
        </p>
      </div>

      {/* Upload / pipeline stage */}
      <section className="mb-16 border border-line bg-surface p-6 md:p-12">
        {phase === 'idle' && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              handleFiles(e.dataTransfer.files)
            }}
            className={cn(
              'flex min-h-[300px] cursor-pointer flex-col items-center justify-center gap-5 border border-dashed p-8 text-center transition-all duration-500',
              dragging
                ? 'border-accent bg-accent-soft'
                : 'border-line-strong hover:border-accent/50 hover:bg-accent-soft/50',
            )}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-bg">
              <UploadCloud className="h-6 w-6 text-accent" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-ink">
                Drop your photo here
              </p>
              <p className="mt-2 text-sm text-muted">
                One or several pieces in a single shot. A shirt on a bed, clothes
                on a hanger, a mirror selfie.
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                inputRef.current?.click()
              }}
              className="inline-flex items-center gap-2 border border-line px-5 py-2.5 text-[10px] uppercase tracking-[0.2em] text-ink transition-colors hover:border-line-strong"
            >
              <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.5} />
              Choose a photograph
            </button>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted/70">
              The photograph is processed by a real detection + segmentation model
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        )}

        {phase === 'processing' && previewUrl && (
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted">
                Original photograph
              </p>
              <div className="mt-4 overflow-hidden border border-line">
                <img
                  src={previewUrl}
                  alt="Uploaded clothing photo"
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
              <p className="mt-3 text-xs text-muted/70">{fileName}</p>
            </div>

            <div className="flex flex-col justify-center">
              <CaptureLoader
                previewUrl={previewUrl}
                fileName={fileName ?? undefined}
                stageIndex={Math.min(pipelineStep, totalStages - 1)}
                total={totalStages}
              />
            </div>
          </div>
        )}

        {phase === 'result' && result && banner && (
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
            <div className="flex items-center gap-5">
              {isSuccessStatus && previewUrl && (
                <div className="h-24 w-28 shrink-0 overflow-hidden border border-line">
                  <img
                    src={previewUrl}
                    alt="Original photograph"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <div>
                <p className={`text-[10px] uppercase tracking-[0.25em] ${banner.tone}`}>
                  {banner.eyebrow}
                </p>
                <p className="mt-2 max-w-md font-editorial text-2xl text-ink">
                  {banner.headline}
                </p>
                <p className="mt-1 text-sm text-muted">{banner.sub}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={reset}
              className="border border-line px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              Start over
            </button>
          </div>
        )}
      </section>

      {/* Truthful states: no garments, failed, unreachable, cv unavailable, unauthenticated */}
      {(result?.status === 'no-detection' ||
        result?.status === 'failed' ||
        result?.status === 'unreachable' ||
        result?.status === 'cv-unavailable' ||
        result?.status === 'unauthenticated') &&
        phase === 'result' && (
          <section className="border border-line bg-surface p-8 md:p-12">
            <div className="flex flex-col items-start gap-6 md:flex-row md:items-center">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-line bg-bg">
                <X className="h-5 w-5 text-muted" strokeWidth={1.5} />
              </div>
              <div className="max-w-xl">
                <p className="text-[10px] uppercase tracking-[0.25em] text-accent">
                  Truthful by design
                </p>
                <p className="mt-2 font-editorial text-2xl text-ink">
                  {result.status === 'unauthenticated'
                    ? 'Sign in to continue'
                    : 'No garments were added'}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {result.status === 'no-detection'
                    ? "The model ran over the whole photograph and found no clothing it could identify — so nothing was fabricated, and nothing was added to your wardrobe. Try a clearer shot with the pieces laid flat."
                    : result.status === 'unauthenticated'
                      ? "MAEVE couldn't verify your session, so nothing was analyzed or added. Sign in, then try the photograph again."
                      : `${result.message ?? "We couldn't analyze this photograph."} Nothing was added to your wardrobe.`}
                </p>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              {result.status === 'unauthenticated' ? (
                <Link
                  to="/signin"
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[10px] uppercase tracking-[0.2em] text-espresso transition-all hover:brightness-95"
                >
                  <Sparkles className="h-4 w-4" strokeWidth={1.5} /> Sign in to continue
                </Link>
              ) : result.status === 'no-detection' ? (
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[10px] uppercase tracking-[0.2em] text-espresso transition-all hover:brightness-95"
                >
                  <UploadCloud className="h-4 w-4" strokeWidth={1.5} /> Try another photo
                </button>
              ) : (
                <button
                  type="button"
                  onClick={retry}
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[10px] uppercase tracking-[0.2em] text-espresso transition-all hover:brightness-95"
                >
                  <RefreshCw className="h-4 w-4" strokeWidth={1.5} /> Try again
                </button>
              )}
              {result.status !== 'unauthenticated' && (
                <Link
                  to="/wardrobe"
                  className="inline-flex items-center gap-2 border border-line px-6 py-3 text-[10px] uppercase tracking-[0.2em] text-ink transition-colors hover:border-line-strong"
                >
                  Back to wardrobe
                </Link>
              )}
            </div>
          </section>
        )}

      {/* Review step — real model output, user confirms before saving */}
      {phase === 'result' && hasReviews && (
        <section>
          <div className="mb-8 flex items-center justify-between">
            <SectionLabel>Prepared for your wardrobe</SectionLabel>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted">
              Confirm before saving
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.map((review) => (
              <div
                key={review.key}
                className={cn(
                  'border border-line bg-bg p-5 transition-colors',
                  review.accepted ? '' : 'opacity-50',
                )}
              >
                <div
                  className="relative aspect-[3/4] overflow-hidden"
                  style={{
                    background: `linear-gradient(160deg, #faf9f7, ${review.colorHex ?? '#EDE6D9'} 180%)`,
                  }}
                >
                  {(review.thumbnailUrl || review.imageUrl) ? (
                    <img
                      src={review.thumbnailUrl ?? review.imageUrl}
                      alt={garmentTitle(review)}
                      className="absolute inset-0 h-full w-full object-contain p-3"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-muted">
                        No image
                      </span>
                    </div>
                  )}
                  {review.needsUserInput && (
                    <span className="absolute left-2 top-2 bg-amber-200/90 px-2 py-1 text-[8px] uppercase tracking-[0.18em] text-amber-900">
                      Check this piece
                    </span>
                  )}
                </div>

                <div className="mt-4">
                  <p className="font-editorial text-lg text-ink">{garmentTitle(review)}</p>
                  {typeof review.confidence === 'number' && (
                    <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted">
                      Model confidence {Math.round(review.confidence * 100)}%
                    </p>
                  )}
                  {review.touched ? (
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-accent">
                      Edited by you
                    </p>
                  ) : (
                    review.needsUserInput && (
                      <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-amber-700">
                        {review.subcategory?.includes('outwear')
                          ? 'Model suggested a layer — please confirm the category'
                          : "The model wasn't certain — please confirm"}
                      </p>
                    )
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <label className="col-span-2 flex flex-col gap-1.5">
                      <span className="text-[9px] uppercase tracking-[0.2em] text-muted">
                        Garment Name
                      </span>
                      <input
                        type="text"
                        value={review.name ?? ''}
                        placeholder={garmentTitle(review)}
                        onChange={(e) => patchReview(review.key, { name: e.target.value })}
                        className="border border-line bg-bg px-3 py-2 text-xs text-ink outline-none focus:border-accent/60"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[9px] uppercase tracking-[0.2em] text-muted">
                        Category
                      </span>
                      <select
                        value={review.category ?? ''}
                        onChange={(e) =>
                          patchReview(review.key, {
                            category: (e.target.value || null) as GarmentCategory | null,
                          })
                        }
                        className="border border-line bg-bg px-3 py-2 text-xs text-ink outline-none focus:border-accent/60"
                      >
                        <option value="">—</option>
                        {categoryOptions.map((c) => (
                          <option key={c} value={c}>
                            {categoryLabels[c]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[9px] uppercase tracking-[0.2em] text-muted">
                        Style
                      </span>
                      <select
                        value={review.style ?? ''}
                        onChange={(e) =>
                          patchReview(review.key, {
                            style: (e.target.value || null) as GarmentStyle | null,
                          })
                        }
                        className="border border-line bg-bg px-3 py-2 text-xs text-ink outline-none focus:border-accent/60"
                      >
                        <option value="">—</option>
                        {styleOptions.map((s) => (
                          <option key={s} value={s}>
                            {styleLabels[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[9px] uppercase tracking-[0.2em] text-muted">
                        Colour
                      </span>
                      <input
                        type="text"
                        value={review.color ?? ''}
                        onChange={(e) => patchReview(review.key, { color: e.target.value })}
                        className="border border-line bg-bg px-3 py-2 text-xs text-ink outline-none focus:border-accent/60"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[9px] uppercase tracking-[0.2em] text-muted">
                        Pattern
                      </span>
                      <select
                        value={review.pattern ?? ''}
                        onChange={(e) =>
                          patchReview(review.key, {
                            pattern: (e.target.value || null) as GarmentPattern | null,
                          })
                        }
                        className="border border-line bg-bg px-3 py-2 text-xs text-ink outline-none focus:border-accent/60"
                      >
                        <option value="">—</option>
                        {patternOptions.map((p) => (
                          <option key={p} value={p}>
                            {patternLabels[p]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleAccepted(review.key)}
                  className={cn(
                    'mt-4 flex w-full items-center justify-center gap-2 border px-4 py-2.5 text-[10px] uppercase tracking-[0.2em] transition-all duration-500',
                    review.accepted
                      ? 'border-accent/60 bg-accent-soft text-accent'
                      : 'border-line text-muted hover:border-line-strong hover:text-ink',
                  )}
                >
                  {review.accepted ? (
                    <>
                      <X className="h-3.5 w-3.5" strokeWidth={1.5} /> Remove
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" strokeWidth={1.5} /> Add to save
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8">
            <p className="text-sm text-muted">
              {acceptedCount} of {reviews.length} pieces will be added to your wardrobe
            </p>
            <button
              type="button"
              disabled={acceptedCount === 0 || isSaving}
              onClick={saveToWardrobe}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[10px] uppercase tracking-[0.2em] text-espresso transition-all disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.5} /> {isSaving ? 'Saving…' : 'Save to wardrobe'}
            </button>
          </div>
        </section>
      )}

      {/* Saved confirmation */}
      {phase === 'saved' && (
        <div>
          <div className="flex flex-row items-center gap-5 border border-accent/40 bg-accent-soft/50 p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-espresso">
              <Check className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-editorial text-2xl text-ink">
                {acceptedCount} {acceptedCount === 1 ? 'piece' : 'pieces'} added to your wardrobe
              </p>
              <p className="mt-1 text-sm text-muted">
                They now appear in your wardrobe, dashboard and stylist.
              </p>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/wardrobe"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[10px] uppercase tracking-[0.2em] text-espresso transition-all hover:brightness-95"
            >
              <Check className="h-4 w-4" strokeWidth={1.5} /> View your wardrobe
            </Link>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 border border-line px-6 py-3 text-[10px] uppercase tracking-[0.2em] text-ink transition-colors hover:border-line-strong"
            >
              <UploadCloud className="h-4 w-4" strokeWidth={1.5} /> Add another piece
            </button>
          </div>
        </div>
      )}
    </div>
  )
}