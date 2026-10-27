import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '../../lib/cn'
import { useReducedMotion } from '../../hooks/useReducedMotion'

const STAGES = [
  'COMPOSING YOUR LOOK',
  'READING YOUR STYLE',
  'CHECKING THE WEATHER',
  'SELECTING FROM YOUR WARDROBE',
  'BALANCING THE LOOK',
  'YOUR LOOK IS READY',
] as const

interface StylistLoaderProps {
  onComplete: () => void
}

/**
 * The AI stylist's composition sequence. Each stage is announced in text so
 * loading is legible even with reduced motion.
 */
export function StylistLoader({ onComplete }: StylistLoaderProps) {
  const reducedMotion = useReducedMotion()
  const total = STAGES.length
  const [stage, setStage] = useState(0)

  useEffect(() => {
    if (stage >= total) {
      const settle = window.setTimeout(onComplete, reducedMotion ? 50 : 650)
      return () => window.clearTimeout(settle)
    }
    const tick = window.setTimeout(
      () => setStage((current) => current + 1),
      reducedMotion ? 120 : 480,
    )
    return () => window.clearTimeout(tick)
  }, [stage, total, onComplete, reducedMotion])

  return (
    <div
      className="flex flex-col items-center py-24 text-center"
      role="status"
      aria-live="polite"
    >
      <p className="text-[9px] uppercase tracking-[0.35em] text-accent">Stylist</p>

      <div className="mt-10 flex w-80 max-w-full flex-col items-center gap-2">
        {STAGES.map((label, index) => {
          const isDone = index < stage
          const isActive = index === stage && stage < total
          return (
            <p
              key={label}
              className={cn(
                'flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] transition-colors duration-700',
                isActive ? 'text-ink' : isDone ? 'text-accent/55' : 'text-muted/30',
              )}
            >
              {isDone ? (
                <Check className="h-3 w-3 text-accent" strokeWidth={1.75} aria-hidden="true" />
              ) : null}
              {label}
            </p>
          )
        })}
      </div>

      <p className="mt-8 font-editorial text-sm italic text-muted">
        {Math.min(stage + 1, total).toString().padStart(2, '0')} / {total.toString().padStart(2, '0')}
      </p>
      <div className="loading-line mt-6" aria-hidden="true" />
    </div>
  )
}