import { Check } from 'lucide-react'
import { cn } from '../../lib/cn'
import { CAPTURE_STAGES } from '../../lib/captureStages'

interface CaptureLoaderProps {
  previewUrl: string
  fileName?: string
  /** Zero-based index of the stage currently being worked through. */
  stageIndex: number
  total: number
}

const FRAMES = [
  { label: 'Original', filter: 'none' },
  { label: 'Outline', filter: 'grayscale(1) contrast(1.25) brightness(1.05)' },
  { label: 'Isolated', filter: 'sepia(0.12) saturate(0.65) contrast(1.08)' },
  { label: 'Clean', filter: 'none' },
] as const

/**
 * The wardrobe capture pipeline: photographic → outline → isolated → clean,
 * with MAEVE's numbered analysis stages beside it.
 */
export function CaptureLoader({ previewUrl, fileName, stageIndex, total }: CaptureLoaderProps) {
  return (
    <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
      {/* Photograph progress */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted">
          Your photograph
        </p>
        <div className="mt-4 grid grid-cols-4 gap-2" aria-hidden="true">
          {FRAMES.map((frame, index) => {
            const isComplete = stageIndex > index
            const isActive = stageIndex === index
            return (
              <div
                key={frame.label}
                className={cn(
                  'relative aspect-[3/4] overflow-hidden border transition-all duration-700',
                  isComplete
                    ? 'border-accent/60'
                    : isActive
                      ? 'border-line-strong'
                      : 'border-line opacity-50 blur-[1.5px]',
                )}
              >
                <img
                  src={previewUrl}
                  alt=""
                  className="h-full w-full object-cover transition-[filter] duration-700"
                  style={{ filter: frame.filter }}
                />
                {isComplete ? (
                  <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center bg-accent text-espresso">
                    <Check className="h-3 w-3" strokeWidth={2} />
                  </span>
                ) : null}
                <span className="absolute bottom-1 left-1.5 text-[8px] uppercase tracking-[0.18em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                  {frame.label}
                </span>
              </div>
            )
          })}
        </div>
        {fileName ? <p className="mt-3 text-xs text-muted/70">{fileName}</p> : null}
      </div>

      {/* Numbered stages */}
      <div className="flex flex-col justify-center">
        <p className="text-[10px] uppercase tracking-[0.3em] text-accent" role="status" aria-live="polite">
          Analyzing your photograph
        </p>
        <p className="mt-1 text-[9px] uppercase tracking-[0.22em] text-muted">
          MAEVE is learning each piece from the image
        </p>
        <div className="mt-6 space-y-4">
          {CAPTURE_STAGES.map((label, index) => {
            const done = index < stageIndex
            const active = index === stageIndex && stageIndex < total
            return (
              <div key={label} className="flex items-center gap-4">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center border text-[9px] tracking-[0.15em] transition-all duration-700',
                    done
                      ? 'border-accent bg-accent-soft text-accent'
                      : active
                        ? 'border-line-strong text-ink/80'
                        : 'border-line text-muted/30',
                  )}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
                  ) : (
                    String(index + 1).padStart(2, '0')
                  )}
                </span>
                <p
                  className={cn(
                    'text-[10px] uppercase tracking-[0.18em] transition-colors duration-500',
                    done ? 'text-ink' : active ? 'text-ink/75' : 'text-muted/40',
                  )}
                >
                  {label}
                </p>
                {active ? (
                  <span className="h-px flex-1 overflow-hidden bg-line">
                    <span className="loading-line !w-full" />
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}