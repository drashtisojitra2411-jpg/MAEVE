import { cn } from '../../lib/cn'
import { Emblem } from '../ui/Emblem'

interface MaeveLoaderProps {
  label?: string
  className?: string
}

/**
 * The official MAEVE loading mark: emblem, wordmark, and a thin champagne
 * progress line. Communicates state in text so it never relies on motion.
 */
export function MaeveLoader({ label, className }: MaeveLoaderProps) {

  return (
    <div
      className={cn('flex flex-col items-center gap-5', className)}
      role="status"
      aria-live="polite"
    >
      <Emblem size="sm" className="opacity-90" />
      <p className="text-[10px] uppercase tracking-[0.4em] text-muted">MAEVE</p>
      {label ? (
        <p className="text-[9px] uppercase tracking-[0.3em] text-accent">{label}</p>
      ) : null}
      <div className="loading-line" aria-hidden="true" />
    </div>
  )
}