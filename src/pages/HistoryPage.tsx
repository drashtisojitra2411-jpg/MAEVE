import { Clock, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useLooks } from '../lib/useLooks'
import { StatusError } from '../components/status/StatusError'
import { GarmentPhoto } from '../components/wardrobe/GarmentPhoto'
import { Skeleton } from '../components/loading/Skeleton'

export function HistoryPage() {
  const { user } = useAuth()
  const { looks, status, reload } = useLooks()

  if (!user) return null

  if (status === 'loading' && looks.length === 0) {
    return (
      <div className="px-6 py-10 lg:px-10 lg:py-14" aria-busy="true" aria-label="Loading history">
        <div className="mb-14">
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="mt-3 h-12 w-80 max-w-full" />
        </div>
        <div className="space-y-10">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    )
  }

  const header = (
    <div className="mb-16">
      <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Style History</p>
      <h2
        className="mt-4 font-display font-light leading-[0.88] tracking-tight text-ink"
        style={{ fontSize: 'clamp(3rem, 8vw, 8rem)' }}
      >
        <span className="block">Style</span>
        <span className="block italic text-muted">Journal.</span>
      </h2>
      <p className="mt-8 max-w-xl text-sm leading-relaxed text-muted">
        Looks MAEVE composed for you are kept here — one record per generation, styled around the
        real weather of the moment. Nothing is pre-recorded.
      </p>
    </div>
  )

  if (status === 'error' && looks.length === 0) {
    return (
      <div className="px-6 py-10 lg:px-10 lg:py-14">
        {header}
        <StatusError
          title="We couldn't load your history"
          message="MAEVE did not reach the styling service. Your recorded looks are safe on the server — reconnect and try again."
          onRetry={reload}
        />
      </div>
    )
  }

  if (looks.length === 0) {
    return (
      <div className="px-6 py-10 lg:px-10 lg:py-14">
        {header}
        <section className="border border-line py-24 text-center md:py-40">
          <p className="text-[9px] uppercase tracking-[0.45em] text-accent">
            Your style journal starts here
          </p>
          <h3
            className="mx-auto mt-6 max-w-2xl font-display font-light leading-tight text-ink"
            style={{ fontSize: 'clamp(2rem, 4vw, 4rem)' }}
          >
            Your generated looks will appear here.
          </h3>
          <p className="mx-auto mt-4 max-w-sm text-sm text-muted">
            Head to the stylist once you have enough pieces in your wardrobe.
          </p>
          <Link
            to="/stylist"
            className="mt-10 inline-flex items-center gap-3 bg-accent px-8 py-4 text-[10px] uppercase tracking-[0.28em] text-espresso transition-opacity hover:opacity-90"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
            Open the Stylist
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-14">
      {header}

      {/* Style journal entries — editorial horizontal spreads */}
      <div className="space-y-0">
        {looks.map((entry, entryIndex) => {
          const entryItems = entry.items ?? []
          const date = new Date(entry.createdAt)
          const dateFormatted = date.toLocaleDateString(undefined, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })
          const timeFormatted = date.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          })

          return (
            <div
              key={entry.id}
              className="grid grid-cols-1 gap-8 border-t border-line py-12 md:grid-cols-12 md:gap-10"
            >
              {/* Date column */}
              <div className="md:col-span-3">
                <div className="flex items-start gap-4 md:flex-col md:gap-2">
                  {/* Entry number */}
                  <span className="font-display text-3xl font-light italic text-muted/30">
                    {String(looks.length - entryIndex).padStart(2, '0')}
                  </span>
                  <div>
                    <p className="font-editorial text-xl text-ink">{dateFormatted}</p>
                    <p className="mt-1 text-[9px] uppercase tracking-[0.3em] text-accent">
                      {entry.occasion}
                    </p>
                    <p className="mt-1 text-[10px] text-muted/60">{timeFormatted}</p>
                    {typeof entry.weather?.temperature === 'number' && (
                      <p className="mt-3 text-[9px] uppercase tracking-[0.25em] text-muted/50">
                        {Math.round(entry.weather.temperature)}° · {entry.weather.condition ?? 'live conditions'}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Garment image strip */}
              <div className="md:col-span-7">
                {entryItems.length === 0 ? (
                  <p className="text-sm italic text-muted">
                    These pieces are no longer in your wardrobe — their record is kept.
                  </p>
                ) : (
                  <div
                    className="grid gap-3"
                    style={{ gridTemplateColumns: `repeat(${Math.min(entryItems.length, 4)}, 1fr)` }}
                  >
                    {entryItems.slice(0, 4).map((item) => (
                      <div key={item.id}>
                        <GarmentPhoto
                          garment={item}
                          className="aspect-[3/4]"
                          sizes="(min-width: 768px) 20vw, 30vw"
                        />
                      </div>
                    ))}
                  </div>
                )}
                {entry.note && (
                  <p className="mt-5 border-l border-line pl-4 font-editorial text-sm italic leading-relaxed text-muted">
                    {entry.note}
                  </p>
                )}
              </div>

              {/* Meta column */}
              <div className="md:col-span-2 md:text-right">
                <p className="text-[9px] uppercase tracking-[0.25em] text-muted/60">
                  {entry.itemIds.length} {entry.itemIds.length === 1 ? 'piece' : 'pieces'}
                </p>
                <p className="mt-3 flex items-center gap-2 text-[9px] uppercase tracking-[0.22em] text-accent md:justify-end">
                  <Clock className="h-3 w-3" strokeWidth={1.5} />
                  Recorded
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}