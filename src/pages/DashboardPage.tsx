import { ArrowRight, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useWeather } from '../lib/weather-context'
import { useWardrobe } from '../lib/wardrobe-context'
import { formatTemperature } from '../lib/weather'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { canComposeLook, composeLooks } from '../lib/lookComposer'
import { getApiToken } from '../services/apiClient'
import { recommendLook } from '../services/looksApi'
import { liveWeatherSnapshot } from '../lib/weatherSnapshot'
import { categoryLabels } from '../lib/garmentCatalogue'
import type { ComposedLook, GeneratedLook } from '../types'
import { GarmentPhoto } from '../components/wardrobe/GarmentPhoto'
import { DashboardSkeleton } from '../components/loading/DashboardSkeleton'

function CategoryStrip({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0)
  if (entries.length === 0) return null
  return (
    <div className="mt-6">
      {entries.map(([category, count]) => (
        <div
          key={category}
          className="flex items-baseline justify-between gap-8 border-b border-line py-5"
        >
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted">
            {categoryLabels[category as keyof typeof categoryLabels] ?? category}
          </p>
          <p className="font-display text-2xl font-light text-ink">{count}</p>
        </div>
      ))}
    </div>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const weather = useWeather()
  const { status: wardrobeStatus, items } = useWardrobe()
  const reducedMotion = useReducedMotion()
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), reducedMotion ? 80 : 520)
    return () => window.clearTimeout(timer)
  }, [reducedMotion])

  const wearable = useMemo(
    () => items.filter((item) => Boolean(item.imageUrl) || Boolean(item.category)),
    [items],
  )

  const counts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const item of items) {
      if (!item.category) continue
      result[item.category] = (result[item.category] ?? 0) + 1
    }
    return result
  }, [items])

  const haveWearData = useMemo(() => items.some((i) => i.timesWorn > 0), [items])
  const rarelyWornPieces = useMemo(() => {
    if (!haveWearData) return []
    return [...items]
      .filter((i) => i.timesWorn > 0)
      .sort((a, b) => a.timesWorn - b.timesWorn)
      .slice(0, 3)
  }, [items, haveWearData])

  const [serverToday, setServerToday] = useState<{ sig: string; look: GeneratedLook | null } | null>(
    null,
  )

  const wardrobeSig = useMemo(
    () =>
      wearable
        .map((item) => item.id)
        .sort()
        .join('|'),
    [wearable],
  )

  useEffect(() => {
    if (!getApiToken()) return
    if (!canComposeLook(wearable)) return
    let cancelled = false
    recommendLook({
      occasion: 'today',
      preferences: {},
      weather: liveWeatherSnapshot(weather),
    })
      .then((out) => {
        if (!cancelled) setServerToday({ sig: wardrobeSig, look: out.look })
      })
      .catch(() => {
        /* keep the honest offline composition */
      })
    return () => {
      cancelled = true
    }
  }, [wardrobeSig, wearable, weather])

  const activeServerToday =
    serverToday && serverToday.sig === wardrobeSig ? serverToday.look : null

  const look = useMemo<ComposedLook | null>(() => {
    if (activeServerToday) {
      return {
        id: activeServerToday.id,
        items: activeServerToday.items,
        reasoning: activeServerToday.explanation.join(' '),
        occasion: activeServerToday.occasion,
        createdAt: activeServerToday.createdAt,
      }
    }
    if (!canComposeLook(wearable)) return null
    const summary = weather.status === 'ready' && weather.data ? String(weather.data.current.condition) : null
    const temperature =
      weather.status === 'ready' && weather.data ? weather.data.current.temperature : null
    return composeLooks(wearable, { occasion: 'today', summary, temperature }, 1)[0] ?? null
  }, [activeServerToday, wearable, weather])

  if (booting || wardrobeStatus === 'loading') return <DashboardSkeleton />

  const firstName = user ? user.name.split(' ')[0] : 'You'

  const weatherStrip =
    weather.status === 'ready' && weather.data
      ? `${weather.data.location.name} · ${formatTemperature(weather.data.current.temperature)}° · ${weather.data.current.condition}`
      : null

  if (wardrobeStatus === 'error') {
    return (
      <div className="px-6 py-10 lg:px-10 lg:py-14">
        <section className="border border-line bg-surface p-8 md:p-12">
          <p className="text-[9px] uppercase tracking-[0.35em] text-accent">Offline</p>
          <p className="mt-4 font-display text-4xl font-light text-ink">
            We couldn't read your wardrobe
          </p>
          <p className="mt-4 max-w-md text-sm text-muted">
            Storage isn't available right now. Re-opening MAEVE in the same browser should
            restore your pieces.
          </p>
        </section>
      </div>
    )
  }

  /* ── Empty state — new user ──────────────────────────────── */
  if (items.length === 0) {
    return (
      <div className="px-6 py-10 lg:px-10 lg:py-16">
        {/* Editorial greeting */}
        <div className="mb-16">
          <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Good morning</p>
          <h2 className="mt-4 font-display font-light leading-[0.9] tracking-tight text-ink">
            <span className="block text-5xl md:text-6xl lg:text-7xl">{firstName}.</span>
          </h2>
          {weatherStrip && (
            <p className="mt-5 text-[10px] uppercase tracking-[0.35em] text-muted/70">
              {weatherStrip}
            </p>
          )}
        </div>

        {/* Empty state callout */}
        <section className="border border-line p-10 md:p-16">
          <p className="text-[9px] uppercase tracking-[0.45em] text-accent">
            Your wardrobe is waiting
          </p>
          <h3 className="mt-6 max-w-2xl font-display text-4xl font-light leading-tight text-ink md:text-5xl">
            Add your first piece and let MAEVE begin learning your style.
          </h3>
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted">
            Photograph what you own — pieces on a bed, on hangers, or on you. Once
            MAEVE can identify enough of your own clothes, it composes complete
            outfits and reads the weather for you. Nothing is invented; everything
            comes from what you add.
          </p>
          <div className="mt-12 flex flex-wrap gap-6">
            <Link
              to="/add"
              className="text-cta inline-flex items-center gap-3 bg-accent px-8 py-4 text-[10px] uppercase tracking-[0.28em] text-espresso transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
              Add your first piece
            </Link>
            <Link
              to="/wardrobe"
              className="text-cta inline-flex items-center gap-3 border border-line px-8 py-4 text-[10px] uppercase tracking-[0.28em] text-ink transition-colors hover:border-accent/50 hover:text-accent"
            >
              Browse your wardrobe
            </Link>
          </div>
        </section>

        {/* Steps */}
        <section className="mt-20 grid grid-cols-1 gap-0 md:grid-cols-3">
          {[
            {
              num: '01',
              title: 'Photograph',
              body: 'One piece or several in a single shot — a shirt on a bed, clothes on a hanger.',
            },
            {
              num: '02',
              title: 'Confirm',
              body: 'Review the attributes MAEVE identifies and confirm each piece before it is saved.',
            },
            {
              num: '03',
              title: 'Get styled',
              body: 'Complete outfits surface once you have enough tops, bottoms and shoes.',
            },
          ].map((step) => (
            <div key={step.title} className="border-t border-line py-8 pr-8">
              <span className="font-display text-2xl font-light italic text-accent/60">{step.num}</span>
              <p className="mt-3 font-editorial text-xl text-ink">{step.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </div>
          ))}
        </section>
      </div>
    )
  }

  /* ── Active state — wardrobe populated ─────────────────── */
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-16">

      {/* Editorial greeting — enormous type */}
      <div className="mb-4">
        <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Good morning</p>
        <h2
          className="mt-3 font-display font-light leading-[0.88] tracking-tight text-ink"
          style={{ fontSize: 'clamp(3rem, 7vw, 7rem)' }}
        >
          {firstName}.
        </h2>
      </div>

      {/* Live weather strip — thin horizontal bar */}
      {weatherStrip && (
        <p className="mb-16 text-[10px] uppercase tracking-[0.38em] text-muted/70">
          {weatherStrip}
        </p>
      )}

      {/* Today's Look */}
      {look && (
        <section className="mb-24">
          <div className="mb-8 flex items-baseline justify-between">
            <div>
              <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Today's Edit</p>
              <p className="mt-2 font-display text-2xl font-light italic text-muted">
                {weather.status === 'ready' && weather.data
                  ? `Composed for ${weather.data.location.name}, ${formatTemperature(weather.data.current.temperature)}°`
                  : 'Composed for your day.'}
              </p>
            </div>
            <Link
              to="/stylist"
              className="nav-link flex items-center gap-2 text-[9px] uppercase tracking-[0.3em] text-muted transition-colors hover:text-accent"
            >
              Open stylist
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
            {/* Garment images — asymmetric arrangement */}
            <div className="lg:col-span-8">
              <div className="grid gap-3 sm:gap-5"
                style={{ gridTemplateColumns: look.items.length === 3 ? '5fr 4fr 4fr' : `repeat(${Math.min(look.items.length, 3)}, 1fr)` }}
              >
                {look.items.slice(0, 3).map((item, index) => (
                  <div key={item.id}>
                    <GarmentPhoto
                      garment={item}
                      className={index === 0 ? 'aspect-[3/5]' : 'aspect-[3/4]'}
                      sizes="(min-width: 1024px) 30vw, 45vw"
                    />
                    <p className="mt-3 text-[9px] uppercase tracking-[0.22em] text-muted">
                      {item.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Reasoning + manifest — right rail */}
            <div className="flex flex-col justify-center lg:col-span-4">
              <p className="text-[9px] uppercase tracking-[0.35em] text-accent">Your pieces</p>
              <p className="mt-5 border-l border-line pl-5 font-editorial text-lg italic leading-relaxed text-muted">
                &ldquo;{look.reasoning}&rdquo;
              </p>
              <ul className="mt-8 space-y-0">
                {look.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between border-b border-line py-4"
                  >
                    <span className="text-[10px] uppercase tracking-[0.22em] text-muted">
                      {item.name}
                    </span>
                    <span className="h-1 w-1 rounded-full bg-accent" aria-hidden="true" />
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-[9px] uppercase tracking-[0.25em] text-muted/50">
                Every piece is already in your wardrobe
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Not enough pieces to style */}
      {!look && (
        <section className="mb-20 border border-line p-10 md:p-14">
          <p className="text-[9px] uppercase tracking-[0.45em] text-accent">
            Your wardrobe is still growing
          </p>
          <h3 className="mt-5 max-w-2xl font-display text-4xl font-light leading-tight text-ink">
            Add tops, bottoms and shoes to unlock complete outfits.
          </h3>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted">
            MAEVE needs at least a top (or dress), bottoms and footwear from your
            own pieces before it can assemble a full outfit honestly.
          </p>
          <Link
            to="/add"
            className="mt-8 inline-flex items-center gap-3 bg-accent px-7 py-3.5 text-[10px] uppercase tracking-[0.25em] text-espresso transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            Add more pieces
          </Link>
        </section>
      )}

      {/* Rarely worn pieces */}
      {haveWearData && rarelyWornPieces.length > 0 && (
        <section className="mb-24">
          <div className="mb-8 flex items-baseline justify-between">
            <div>
              <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Wear Something Different</p>
              <p className="mt-2 font-editorial text-lg italic text-muted">Pieces you haven't given a turn lately.</p>
            </div>
            <p className="text-[9px] uppercase tracking-[0.25em] text-muted/50">Least worn</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-5">
            {rarelyWornPieces.map((item) => (
              <div key={item.id} className="group relative">
                <GarmentPhoto
                  garment={item}
                  className="aspect-[3/4]"
                  sizes="(min-width: 640px) 30vw, 90vw"
                />
                <span className="absolute right-3 top-3 border border-white/20 bg-black/40 px-2.5 py-1 text-[9px] uppercase tracking-[0.15em] text-white backdrop-blur-sm">
                  Worn {item.timesWorn}×
                </span>
                <p className="mt-3 text-[9px] uppercase tracking-[0.22em] text-muted">{item.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Wardrobe summary — editorial number treatment */}
      <section className="grid grid-cols-1 gap-12 border-t border-line pt-16 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Link
            to="/wardrobe"
            className="group flex flex-col gap-4"
          >
            <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Your Wardrobe</p>
            <div className="relative">
              <span
                className="editorial-number absolute -left-3 -top-6 select-none"
                style={{ fontSize: 'clamp(5rem, 12vw, 10rem)' }}
                aria-hidden="true"
              >
                {items.length}
              </span>
              <div className="relative z-10 pt-10">
                <p className="text-[10px] uppercase tracking-[0.3em] text-muted">
                  Pieces catalogued
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted/70">
                  {Object.values(counts).reduce((a, b) => a + b, 0)} items across{' '}
                  {categoryOrderPresent(counts).join(', ')}.
                </p>
              </div>
            </div>
            <span className="flex items-center gap-2 text-[9px] uppercase tracking-[0.28em] text-muted transition-colors group-hover:text-accent">
              View archive
              <ArrowRight className="h-3 w-3 transition-transform duration-500 group-hover:translate-x-1" />
            </span>
          </Link>
        </div>

        <div className="lg:col-span-7">
          <div className="border-t border-line pt-8">
            <p className="text-[9px] uppercase tracking-[0.45em] text-accent">By Category</p>
            <CategoryStrip counts={counts} />
          </div>
        </div>
      </section>
    </div>
  )
}

function categoryOrderPresent(counts: Record<string, number>): string[] {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([category]) => categoryLabels[category as keyof typeof categoryLabels] ?? category)
}