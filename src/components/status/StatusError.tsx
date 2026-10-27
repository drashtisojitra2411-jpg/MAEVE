import { RefreshCw, WifiOff } from 'lucide-react'

interface StatusErrorProps {
  onRetry?: () => void
  title?: string
  message?: string
}

/**
 * Honest failure state: MAEVE could not reach the service that powers the page.
 * Nothing is shown in its place — never an invented "empty" state.
 */
export function StatusError({
  onRetry,
  title = "We couldn't load your wardrobe",
  message = 'MAEVE could not reach the styling service. Anything already on this device stays here until it reconnects — nothing was lost.',
}: StatusErrorProps) {
  return (
    <section className="border border-line bg-surface p-10 text-center md:p-14">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-line">
        <WifiOff className="h-5 w-5 text-accent" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <p className="mt-6 text-[10px] uppercase tracking-[0.35em] text-accent">Unreachable</p>
      <h3 className="mx-auto mt-4 max-w-xl font-editorial text-3xl leading-snug text-ink">
        {title}
      </h3>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-8 inline-flex items-center gap-2 rounded-full border border-line px-6 py-3 text-[10px] uppercase tracking-[0.22em] text-ink transition-colors hover:border-line-strong"
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          Try again
        </button>
      )}
    </section>
  )
}