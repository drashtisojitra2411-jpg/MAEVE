import { Skeleton } from './Skeleton'

/** Weather loading state — a visible label with restrained placeholder lines. */
export function WeatherSkeleton() {
  return (
    <div className="flex w-full max-w-xs flex-col items-end gap-2 text-right" aria-label="Loading weather">
      <Skeleton className="h-2.5 w-28" />
      <p className="text-[10px] uppercase tracking-[0.3em] text-accent">Weather</p>
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted/80">Loading&hellip;</p>
      <Skeleton className="mt-1 h-8 w-44" />
      <Skeleton className="h-3 w-36" />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}