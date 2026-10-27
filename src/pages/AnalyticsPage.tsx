import {
  CheckCircle2,
  Info,
  Plus,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../lib/cn'
import { categoryLabels } from '../lib/garmentCatalogue'
import { useWardrobe } from '../lib/wardrobe-context'
import { useLooks } from '../lib/useLooks'
import type { GarmentCategory } from '../types'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { GarmentPhoto } from '../components/wardrobe/GarmentPhoto'
import { Skeleton } from '../components/loading/Skeleton'

const categoryColors: Record<GarmentCategory, string> = {
  shirt: '#A8895C',
  tops: '#C6A15B',
  bottoms: '#8A6A38',
  dresses: '#8B4A5E',
  traditional: '#2C4A7C',
  outerwear: '#3D5A80',
  footwear: '#B98A5A',
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(startAngle: number, endAngle: number, r = 42) {
  const start = polar(50, 50, r, startAngle)
  const end = polar(50, 50, r, endAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

export function AnalyticsPage() {
  const reducedMotion = useReducedMotion()
  const { status, items } = useWardrobe()
  const { looks } = useLooks()
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), reducedMotion ? 60 : 460)
    return () => window.clearTimeout(timer)
  }, [reducedMotion])

  const catalogued = useMemo(
    () => items.filter((item) => Boolean(item.category) && Boolean(item.imageUrl)),
    [items],
  )

  const byCategory = useMemo(() => {
    const rows = (Object.keys(categoryLabels) as GarmentCategory[])
      .map((category) => ({
        category,
        pieces: items.filter((i) => i.category === category).length,
      }))
      .filter((row) => row.pieces > 0)
    return rows
  }, [items])

  const totalWears = useMemo(() => items.reduce((sum, i) => sum + i.timesWorn, 0), [items])
  const haveWearData = useMemo(() => items.some((i) => i.timesWorn > 0), [items])

  const mostWorn = useMemo(() => {
    if (!haveWearData) return []
    return [...items]
      .filter((i) => i.timesWorn > 0)
      .sort((a, b) => b.timesWorn - a.timesWorn)
      .slice(0, 5)
  }, [items, haveWearData])
  const maxWears = mostWorn[0]?.timesWorn ?? 1

  const neverWorn = useMemo(
    () => (haveWearData ? items.filter((i) => i.timesWorn === 0) : []),
    [items, haveWearData],
  )
  const rarelyWorn = useMemo(
    () => (haveWearData ? items.filter((i) => i.timesWorn > 0 && i.timesWorn <= 2) : []),
    [items, haveWearData],
  )

  const hasPalette = useMemo(() => items.some((i) => Boolean(i.colorHex)), [items])

  const byStyle = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const item of items) {
      const s = item.style?.trim().toLowerCase() || 'unspecified'
      counts[s] = (counts[s] || 0) + 1
    }
    return Object.entries(counts)
      .map(([style, count]) => ({ style, count }))
      .sort((a, b) => b.count - a.count)
  }, [items])

  const bySeason = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const item of items) {
      const s = item.season?.trim().toLowerCase() || 'all-season'
      counts[s] = (counts[s] || 0) + 1
    }
    return Object.entries(counts)
      .map(([season, count]) => ({ season, count }))
      .sort((a, b) => b.count - a.count)
  }, [items])

  const wardrobeGaps = useMemo(() => {
    const topsCount = items.filter((i) => i.category === 'shirt' || i.category === 'tops').length
    const bottomsCount = items.filter((i) => i.category === 'bottoms').length
    const outerwearCount = items.filter((i) => i.category === 'outerwear').length
    const footwearCount = items.filter((i) => i.category === 'footwear').length
    const dressesCount = items.filter((i) => i.category === 'dresses').length
    const traditionalCount = items.filter((i) => i.category === 'traditional').length

    return [
      {
        role: 'Tops / Shirts',
        count: topsCount,
        status: topsCount >= 2 ? 'Strong Foundation' : topsCount === 1 ? 'Minimal Base' : 'Wardrobe Gap',
        recommendation: topsCount === 0 ? 'Add a versatile neutral shirt or tee' : 'Good layering versatility',
      },
      {
        role: 'Bottoms',
        count: bottomsCount,
        status: bottomsCount >= 2 ? 'Strong Foundation' : bottomsCount === 1 ? 'Minimal Base' : 'Wardrobe Gap',
        recommendation: bottomsCount === 0 ? 'Add trousers or dark denim to complete two-piece pairings' : 'Enables clean silhouettes',
      },
      {
        role: 'Outerwear',
        count: outerwearCount,
        status: outerwearCount >= 1 ? 'Seasonal Ready' : 'Wardrobe Gap',
        recommendation: outerwearCount === 0 ? 'Add a tailored blazer or light jacket for rain/temperature drops' : 'Protective layering active',
      },
      {
        role: 'Footwear',
        count: footwearCount,
        status: footwearCount >= 1 ? 'Foundation Set' : 'Wardrobe Gap',
        recommendation: footwearCount === 0 ? 'Add versatile leather or minimal sneakers' : 'Anchors occasion formality',
      },
      {
        role: 'One-Piece / Ethnic',
        count: dressesCount + traditionalCount,
        status: (dressesCount + traditionalCount) >= 1 ? 'Event Ready' : 'Optional',
        recommendation: 'Enables quick standalone outfits for events or festive occasions',
      },
    ]
  }, [items])

  const feedbackIntelligence = useMemo(() => {
    const rated = looks.filter((l) => typeof l.rating === 'number' && (l.rating ?? 0) > 0)
    const avgRating = rated.length > 0
      ? (rated.reduce((sum, l) => sum + (l.rating || 0), 0) / rated.length).toFixed(1)
      : null
    const likesCount = looks.filter((l) => l.feedback === 'like').length
    const dislikesCount = looks.filter((l) => l.feedback === 'dislike').length

    const likedStyles: Record<string, number> = {}
    for (const l of looks) {
      if (l.feedback === 'like' || (l.rating && l.rating >= 4)) {
        for (const item of l.items) {
          if (item.style) {
            const st = item.style.toLowerCase()
            likedStyles[st] = (likedStyles[st] || 0) + 1
          }
        }
      }
    }
    const topAffirmedStyle = Object.entries(likedStyles).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    return {
      totalSaved: looks.length,
      likesCount,
      dislikesCount,
      avgRating,
      topAffirmedStyle,
    }
  }, [looks])

  const occasionVersatility = useMemo(() => {
    const hasTops = items.some((i) => i.category === 'shirt' || i.category === 'tops' || i.category === 'dresses')
    const hasBottoms = items.some((i) => i.category === 'bottoms' || i.category === 'dresses')
    const canAssemble = hasTops && hasBottoms

    const occasions = [
      { name: 'College / University', formality: 'Casual' },
      { name: 'Office / Professional', formality: 'Smart-Casual' },
      { name: 'Casual outing', formality: 'Relaxed' },
      { name: 'Party / Evening', formality: 'Elevated' },
      { name: 'Traditional event', formality: 'Ethnic / Formal' },
      { name: 'Date / Dinner', formality: 'Smart-Casual' },
      { name: 'Travel', formality: 'Comfort-first' },
      { name: 'General everyday wear', formality: 'Daily Rotation' },
    ]

    return occasions.map((occ) => ({
      ...occ,
      status: canAssemble ? 'Ready to Style' : 'Awaiting Bottoms/Tops',
      ready: canAssemble,
    }))
  }, [items])

  /* Donut geometry */
  let angle = 0
  const segments = byCategory.map((row) => {
    const fraction = row.pieces / Math.max(1, items.length)
    const start = angle
    const end = angle + fraction * 360
    angle = end
    return { ...row, start, end }
  })

  if (booting || status === 'loading') {
    return (
      <div className="px-6 py-10 lg:px-10 lg:py-14" aria-busy="true" aria-label="Loading analytics">
        <div className="mb-14">
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="mt-3 h-12 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="mt-8 h-64 w-full" />
      </div>
    )
  }

  const header = (
    <div className="mb-16">
      <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Style Intelligence</p>
      <h2
        className="mt-4 font-display font-light leading-[0.88] tracking-tight text-ink"
        style={{ fontSize: 'clamp(3rem, 8vw, 8rem)' }}
      >
        <span className="block">Style</span>
        <span className="block italic text-muted">Measured.</span>
      </h2>
      <p className="mt-8 max-w-xl text-sm leading-relaxed text-muted">
        Every figure here is computed from your own pieces — never estimated.
      </p>
    </div>
  )

  if (items.length === 0 && status !== 'error') {
    return (
      <div className="px-6 py-10 lg:px-10 lg:py-14">
        {header}
        <section className="border border-line py-24 text-center md:py-40">
          <p className="text-[9px] uppercase tracking-[0.45em] text-accent">
            Your insights will grow with your wardrobe
          </p>
          <h3
            className="mx-auto mt-6 max-w-2xl font-display font-light leading-tight text-ink"
            style={{ fontSize: 'clamp(2rem, 4vw, 4rem)' }}
          >
            Insights appear once there's something to measure.
          </h3>
          <p className="mx-auto mt-4 max-w-sm text-sm text-muted">
            Add your first pieces — MAEVE will begin cataloguing the moment they're saved.
          </p>
          <Link
            to="/add"
            className="mt-10 inline-flex items-center gap-3 bg-accent px-8 py-4 text-[10px] uppercase tracking-[0.28em] text-espresso transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            Add your first piece
          </Link>
        </section>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="px-6 py-10 lg:px-10 lg:py-14">
        {header}
        <section className="border border-line p-10 text-center">
          <p className="font-display text-3xl font-light text-ink">Can't read your wardrobe</p>
          <p className="mt-3 text-sm text-muted">
            Storage isn't available right now. Re-open MAEVE in the same browser to try again.
          </p>
        </section>
      </div>
    )
  }

  if (catalogued.length < 3) {
    return (
      <div className="px-6 py-10 lg:px-10 lg:py-14">
        {header}
        <section className="border border-line p-10 md:p-14">
          <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Not enough data</p>
          <h3 className="mt-5 max-w-2xl font-display text-4xl font-light leading-tight text-ink">
            MAEVE needs at least three catalogued pieces before measurements mean anything.
          </h3>
          <p className="mt-4 max-w-md text-sm text-muted">
            {items.length > 0
              ? `You have ${items.length} ${items.length === 1 ? 'piece' : 'pieces'} in your wardrobe — keep adding.`
              : 'Nothing has been added yet.'}
          </p>
          <Link
            to="/add"
            className="mt-8 inline-flex items-center gap-3 bg-accent px-7 py-3.5 text-[10px] uppercase tracking-[0.25em] text-espresso transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            Add more pieces
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-14">
      {header}

      {/* Stats — editorial horizontal strip */}
      <section className="mb-20">
        <div className="grid grid-cols-2 divide-x divide-line border border-line lg:grid-cols-4">
          {[
            { label: 'Wardrobe Pieces', value: items.length },
            { label: 'Catalogued', value: catalogued.length },
            { label: 'Wears Recorded', value: totalWears },
            { label: 'Categories', value: byCategory.length },
          ].map((stat) => (
            <div key={stat.label} className="p-8 text-center">
              <p className="font-display font-light text-ink" style={{ fontSize: 'clamp(3rem, 5vw, 5rem)' }}>
                {stat.value}
              </p>
              <p className="mt-2 text-[9px] uppercase tracking-[0.3em] text-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Category breakdown + most worn */}
      <div className="mb-20 grid grid-cols-1 gap-12 lg:grid-cols-12">
        {/* Category donut */}
        <section className="lg:col-span-5">
          <p className="text-[9px] uppercase tracking-[0.45em] text-accent">By Category</p>
          <div className="mt-8 flex flex-col items-center gap-8 sm:flex-row">
            <div className="relative h-52 w-52 shrink-0">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                {segments.map((seg) =>
                  seg.start === seg.end ? null : (
                    <path
                      key={seg.category}
                      d={arcPath(seg.start, seg.end)}
                      stroke={categoryColors[seg.category]}
                      strokeWidth="8"
                      fill="none"
                    />
                  ),
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-4xl font-light text-ink">{items.length}</span>
                <span className="text-[9px] uppercase tracking-[0.25em] text-muted">Pieces</span>
              </div>
            </div>
            <ul className="w-full space-y-0">
              {byCategory.map((row) => (
                <li key={row.category} className="flex items-center gap-3 border-b border-line py-3.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryColors[row.category] }}
                  />
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted">
                    {categoryLabels[row.category]}
                  </span>
                  <span className="ml-auto font-display text-xl font-light text-ink">{row.pieces}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Most worn */}
        <section className="lg:col-span-7">
          <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Most Worn</p>
          {mostWorn.length === 0 ? (
            <p className="mt-6 text-sm leading-relaxed text-muted">
              Wear counts appear here once MAEVE records how often you actually wear each piece.
            </p>
          ) : (
            <div className="mt-8 space-y-5">
              {mostWorn.map((item, index) => (
                <div key={item.id} className="group flex items-center gap-4">
                  <span className="w-8 font-display text-2xl font-light italic text-accent/50">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-ink">{item.name}</p>
                      <p className="text-[9px] uppercase tracking-[0.2em] text-muted">{item.timesWorn}×</p>
                    </div>
                    <div className="mt-2 h-px w-full overflow-hidden bg-line">
                      <div
                        className="h-full transition-all duration-700"
                        style={{
                          width: `${(item.timesWorn / maxWears) * 100}%`,
                          backgroundColor:
                            item.category && categoryColors[item.category]
                              ? categoryColors[item.category]
                              : '#C6A15B',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Ready for comeback */}
      {haveWearData && (
        <section className="mb-20">
          <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Ready for a Comeback</p>
          <p className="mt-3 text-sm text-muted">
            Pieces that deserve more outings — and ones still waiting for their first.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {[...rarelyWorn, ...neverWorn].slice(0, 8).map((item) => (
              <div key={item.id} className="group">
                <GarmentPhoto
                  garment={item}
                  className="aspect-[3/4]"
                  sizes="(min-width: 1024px) 18vw, 40vw"
                />
                <div className="mt-2">
                  <p className="text-[9px] uppercase tracking-[0.18em] text-ink">{item.name}</p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-[0.18em] text-accent">
                    {item.timesWorn === 0 ? 'Never worn' : `Worn ${item.timesWorn}×`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Palette */}
      <section className="mb-20">
        <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Your Palette</p>
        {!hasPalette ? (
          <p className="mt-4 text-sm text-muted">
            Colour swatches will appear once your pieces have colour information from real analysis.
          </p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {byCategory.map((row) => {
              const pieces = items.filter((i) => i.category === row.category && Boolean(i.colorHex))
              if (pieces.length === 0) return null
              return (
                <div key={row.category} className="border border-line p-4">
                  <p className="text-[9px] uppercase tracking-[0.25em] text-muted">
                    {categoryLabels[row.category]}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pieces.map((i) => (
                      <span
                        key={i.id}
                        className="h-7 w-7 rounded-full border border-black/10"
                        style={{ backgroundColor: i.colorHex ?? '#E4DFD3' }}
                        title={i.name}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Style & Aesthetic Distribution */}
      <section className="mb-20">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Aesthetic Breakdown</p>
            <h3 className="mt-1 font-display text-2xl font-light text-ink">Style Distribution</h3>
          </div>
          <span className="text-[9px] uppercase tracking-[0.2em] px-2.5 py-1 border border-line text-muted">
            Measured Data
          </span>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {byStyle.map((s) => (
            <div key={s.style} className="border border-line bg-card p-5">
              <span className="text-[9px] uppercase tracking-[0.25em] text-accent font-medium capitalize">
                {s.style}
              </span>
              <p className="mt-2 font-display text-3xl font-light text-ink">{s.count}</p>
              <p className="mt-1 text-[10px] text-muted">
                {Math.round((s.count / Math.max(1, items.length)) * 100)}% of wardrobe
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Seasonal Coverage */}
      <section className="mb-20">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Climate Adaptation</p>
            <h3 className="mt-1 font-display text-2xl font-light text-ink">Seasonal Coverage</h3>
          </div>
          <span className="text-[9px] uppercase tracking-[0.2em] px-2.5 py-1 border border-line text-muted">
            Measured Data
          </span>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {bySeason.map((season) => (
            <div key={season.season} className="border border-line bg-card p-5">
              <span className="text-[9px] uppercase tracking-[0.25em] text-accent font-medium capitalize">
                {season.season}
              </span>
              <p className="mt-2 font-display text-3xl font-light text-ink">{season.count}</p>
              <p className="mt-1 text-[10px] text-muted">
                {season.count === 1 ? '1 piece available' : `${season.count} pieces available`}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Wardrobe Balance & Gap Intelligence */}
      <section className="mb-20">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Curatorial Balance</p>
            <h3 className="mt-1 font-display text-2xl font-light text-ink">Wardrobe Gaps &amp; Opportunities</h3>
          </div>
          <span className="text-[9px] uppercase tracking-[0.2em] px-2.5 py-1 border border-line text-muted">
            Structural Analysis
          </span>
        </div>
        <p className="mt-3 text-xs text-muted max-w-xl">
          Actionable insight into categories that complete daily pairings or unlock multi-layer weather ensembles.
        </p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {wardrobeGaps.map((gap) => (
            <div key={gap.role} className="border border-line bg-card p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.25em] text-ink font-medium">
                    {gap.role}
                  </span>
                  <span
                    className={cn(
                      'text-[9px] uppercase tracking-[0.2em] px-2 py-0.5 border',
                      gap.count >= 2
                        ? 'border-emerald-600/40 text-emerald-400 bg-emerald-950/20'
                        : gap.count === 1
                          ? 'border-accent/40 text-accent bg-accent/10'
                          : 'border-amber-600/40 text-amber-400 bg-amber-950/20',
                    )}
                  >
                    {gap.status}
                  </span>
                </div>
                <p className="mt-3 font-display text-2xl font-light text-ink">
                  {gap.count} {gap.count === 1 ? 'piece' : 'pieces'}
                </p>
                <p className="mt-2 text-xs text-muted leading-relaxed">{gap.recommendation}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Style Affinity & Feedback Intelligence */}
      <section className="mb-20 border border-line bg-sand/15 p-6 md:p-8">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Feedback Affinity</p>
            <h3 className="mt-1 font-display text-2xl font-light text-ink">Learned Taste &amp; Ratings</h3>
          </div>
          <span className="text-[9px] uppercase tracking-[0.2em] px-2.5 py-1 border border-line text-muted">
            User Feedback Affinity
          </span>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="border border-line bg-card p-5">
            <span className="text-[9px] uppercase tracking-[0.25em] text-muted">Saved Lookbook</span>
            <p className="mt-2 font-display text-3xl font-light text-ink">
              {feedbackIntelligence.totalSaved}
            </p>
            <p className="mt-1 text-[10px] text-muted">Curated outfits saved</p>
          </div>
          <div className="border border-line bg-card p-5">
            <span className="text-[9px] uppercase tracking-[0.25em] text-muted">Average Rating</span>
            <p className="mt-2 font-display text-3xl font-light text-ink">
              {feedbackIntelligence.avgRating ? `${feedbackIntelligence.avgRating} ★` : '—'}
            </p>
            <p className="mt-1 text-[10px] text-muted">
              {feedbackIntelligence.avgRating ? 'Based on real ratings' : 'Awaiting star ratings'}
            </p>
          </div>
          <div className="border border-line bg-card p-5">
            <span className="text-[9px] uppercase tracking-[0.25em] text-muted">Affirmed Combos</span>
            <p className="mt-2 font-display text-3xl font-light text-ink">
              {feedbackIntelligence.likesCount}
            </p>
            <p className="mt-1 text-[10px] text-muted">
              {feedbackIntelligence.likesCount > 0 ? 'Positively boosted' : 'No likes yet'}
            </p>
          </div>
          <div className="border border-line bg-card p-5">
            <span className="text-[9px] uppercase tracking-[0.25em] text-muted">Top Affinity Style</span>
            <p className="mt-2 font-display text-2xl font-light text-accent capitalize truncate">
              {feedbackIntelligence.topAffirmedStyle ?? 'Neutral'}
            </p>
            <p className="mt-1 text-[10px] text-muted">
              {feedbackIntelligence.topAffirmedStyle ? 'Boosted in scoring' : 'Awaiting liked looks'}
            </p>
          </div>
        </div>
      </section>

      {/* Occasion Versatility */}
      <section className="mb-20">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Occasion Readiness</p>
            <h3 className="mt-1 font-display text-2xl font-light text-ink">Wardrobe Versatility</h3>
          </div>
          <span className="text-[9px] uppercase tracking-[0.2em] px-2.5 py-1 border border-line text-muted">
            Combinatorial Coverage
          </span>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {occasionVersatility.map((occ) => (
            <div key={occ.name} className="border border-line bg-card p-4">
              <span className="text-[9px] uppercase tracking-[0.2em] text-accent">{occ.formality}</span>
              <p className="mt-1 font-editorial text-sm text-ink">{occ.name}</p>
              <div className="mt-3 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.16em] text-muted">
                {occ.ready ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-accent" />
                    <span>Styling Ready</span>
                  </>
                ) : (
                  <>
                    <Info className="h-3 w-3 text-muted" />
                    <span>Incomplete</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Look history preview */}
      {looks.length > 0 && (
        <section className="mb-20">
          <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Styling History</p>
          <p className="mt-2 text-sm text-muted">
            Every real generation MAEVE composed for you.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {looks.slice(0, 6).map((entry) => (
              <div key={entry.id} className="border border-line p-5">
                <p className="font-editorial text-xl text-ink">{entry.occasion}</p>
                <p className="mt-1 text-[9px] uppercase tracking-[0.22em] text-muted">
                  {new Date(entry.createdAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                  })}{' '}
                  · {entry.itemIds.length} pieces
                </p>
                {entry.items.length > 0 && (
                  <div className="mt-4 flex gap-2 overflow-hidden">
                    {entry.items.slice(0, 4).map((item) => (
                      <div key={item.id} className="w-12 shrink-0">
                        <GarmentPhoto garment={item} className="aspect-[3/4]" sizes="64px" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Action CTA */}
      <section className="border border-line p-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-[0.45em] text-accent">What's Next</p>
            <p className="mt-3 max-w-xl font-editorial text-2xl text-ink">
              Your wardrobe has {items.length} {items.length === 1 ? 'piece' : 'pieces'} across{' '}
              {byCategory.length} {byCategory.length === 1 ? 'category' : 'categories'} —
              ready for a fresh combination.
            </p>
          </div>
          <Link
            to="/stylist"
            className="shrink-0 text-cta inline-flex items-center gap-3 text-[10px] uppercase tracking-[0.3em] text-ink transition-colors hover:text-accent"
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.5} />
            Open the Stylist →
          </Link>
        </div>
      </section>
    </div>
  )
}