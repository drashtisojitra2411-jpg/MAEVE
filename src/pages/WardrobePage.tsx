import { Check, Plus, Search, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  categoryLabels,
  categoryOrder,
  patternLabels,
  styleLabels,
} from '../lib/garmentCatalogue'
import { useWardrobe } from '../lib/wardrobe-context'
import type { GarmentCategory, GarmentPattern, GarmentStyle, WardrobeItem } from '../types'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { StatusError } from '../components/status/StatusError'
import { GarmentTile } from '../components/wardrobe/GarmentTile'
import { GarmentPhoto } from '../components/wardrobe/GarmentPhoto'
import { Skeleton } from '../components/loading/Skeleton'
import { WardrobeSkeleton } from '../components/loading/WardrobeSkeleton'
import { cn } from '../lib/cn'

const categories: (GarmentCategory | 'all')[] = [
  'all',
  'shirt',
  'tops',
  'bottoms',
  'dresses',
  'traditional',
  'outerwear',
  'footwear',
]

const categoryOptions = categoryOrder as GarmentCategory[]
const patternOptions: GarmentPattern[] = ['solid', 'striped', 'floral', 'check', 'printed', 'textured']
const styleOptions: GarmentStyle[] = ['casual', 'formal', 'ethnic', 'sporty', 'evening', 'smart-casual']

export function WardrobePage() {
  const reducedMotion = useReducedMotion()
  const { status, items, updateItem, removeItem, refresh } = useWardrobe()
  const [booting, setBooting] = useState(true)
  const [activeCategory, setActiveCategory] = useState<GarmentCategory | 'all'>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'worn' | 'name'>('recent')
  const [editingGarment, setEditingGarment] = useState<WardrobeItem | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), reducedMotion ? 60 : 460)
    return () => window.clearTimeout(timer)
  }, [reducedMotion])

  const haveWearData = useMemo(() => items.some((i) => i.timesWorn > 0), [items])

  const filtered = useMemo(() => {
    let list =
      activeCategory === 'all' ? [...items] : items.filter((g) => g.category === activeCategory)

    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.color ?? '').toLowerCase().includes(q) ||
          (g.pattern ?? '').toLowerCase().includes(q) ||
          (g.style ?? '').toLowerCase().includes(q) ||
          (g.category ? categoryLabels[g.category].toLowerCase().includes(q) : false),
      )
    }

    switch (sort) {
      case 'worn':
        list.sort((a, b) => b.timesWorn - a.timesWorn)
        break
      case 'name':
        list.sort((a, b) => a.name.localeCompare(b.name))
        break
      default:
        list.sort((a, b) => b.createdAt - a.createdAt)
    }
    return list
  }, [activeCategory, query, sort, items])

  const cataloguedCount = useMemo(
    () => items.filter((i) => Boolean(i.category) || Boolean(i.imageUrl)).length,
    [items],
  )

  if (booting || status === 'loading') {
    return (
      <div className="px-6 py-10 lg:px-10 lg:py-14" aria-busy="true" aria-label="Loading wardrobe">
        <div className="mb-12">
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="mt-3 h-9 w-72 max-w-full" />
          <Skeleton className="mt-3 h-3 w-48" />
        </div>
        <WardrobeSkeleton count={12} />
      </div>
    )
  }

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-14">
      {/* Editorial header — heading + count */}
      <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-baseline md:justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Wardrobe</p>
          <h2
            className="mt-3 font-display font-light leading-[0.92] tracking-tight text-ink"
            style={{ fontSize: 'clamp(2.5rem, 6vw, 6rem)' }}
          >
            Your Archive
          </h2>
        </div>
        <div className="text-right">
          <p className="font-display text-5xl font-light text-ink">{items.length}</p>
          <p className="mt-1 text-[9px] uppercase tracking-[0.3em] text-muted">
            {items.length === 1 ? 'Piece' : 'Pieces'}
            {items.length > 0 && ` · ${cataloguedCount} catalogued`}
          </p>
        </div>
      </div>

      {status === 'error' ? (
        <StatusError onRetry={refresh} />
      ) : items.length === 0 ? (
        /* ── Empty state ─────────────────────────────────── */
        <section className="border border-line py-24 text-center md:py-40">
          <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Your Archive Awaits</p>
          <h3
            className="mx-auto mt-6 max-w-2xl font-display font-light leading-tight text-ink"
            style={{ fontSize: 'clamp(2.5rem, 5vw, 5rem)' }}
          >
            Add the pieces you own,
            <span className="italic text-muted"> and MAEVE begins styling from them.</span>
          </h3>
          <p className="mx-auto mt-6 max-w-md text-sm text-muted">
            Your pieces live only in your account — nothing is seeded, nothing is shared.
          </p>
          <Link
            to="/add"
            className="mt-10 inline-flex items-center gap-3 bg-accent px-8 py-4 text-[10px] uppercase tracking-[0.28em] text-espresso transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            Add your first piece
          </Link>
        </section>
      ) : (
        <>
          {/* Category filter rail — text links with animated underline active state */}
          <div className="mb-8 border-y border-line py-4">
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    'relative pb-1 text-[10px] uppercase tracking-[0.28em] transition-colors duration-500',
                    activeCategory === cat ? 'text-ink' : 'text-muted hover:text-ink/80',
                  )}
                >
                  {cat === 'all' ? 'All' : categoryLabels[cat]}
                  {activeCategory === cat && (
                    <span className="absolute inset-x-0 bottom-0 h-px bg-accent" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Search + sort — refined, minimal */}
          <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
            <label className="flex items-center gap-3 border-b border-line pb-2 transition-colors focus-within:border-accent/60">
              <Search className="h-3.5 w-3.5 text-muted/60" strokeWidth={1.5} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your archive…"
                className="w-52 bg-transparent text-sm text-ink placeholder:text-muted/50 focus:outline-none md:w-72"
              />
            </label>
            <div className="flex gap-1">
              {(
                [
                  ['recent', 'Recent'],
                  ...(haveWearData ? ([['worn', 'Most worn']] as const) : []),
                  ['name', 'Name'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSort(key)}
                  className={cn(
                    'px-4 py-2 text-[9px] uppercase tracking-[0.25em] transition-colors duration-500',
                    sort === key ? 'text-accent' : 'text-muted hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Grid — editorial archive with hover-reveal metadata */}
          {filtered.length === 0 ? (
            <div className="border border-line py-24 text-center">
              <p className="font-display text-3xl font-light text-ink">Nothing found</p>
              <p className="mt-3 text-sm text-muted">Try another category or search term.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4">
              {filtered.map((garment) => (
                <GarmentTile
                  key={garment.id}
                  garment={garment}
                  onEdit={() => setEditingGarment(garment)}
                  onDelete={() => removeItem(garment.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {editingGarment && (
        <EditGarmentModal
          garment={editingGarment}
          onClose={() => setEditingGarment(null)}
          onSave={(updated) => {
            updateItem(updated)
            setEditingGarment(null)
          }}
        />
      )}
    </div>
  )
}

interface EditModalProps {
  garment: WardrobeItem
  onClose: () => void
  onSave: (updated: WardrobeItem) => void
}

function EditGarmentModal({ garment, onClose, onSave }: EditModalProps) {
  const [name, setName] = useState(garment.name ?? '')
  const [category, setCategory] = useState<GarmentCategory | ''>(garment.category ?? '')
  const [style, setStyle] = useState<GarmentStyle | ''>(garment.style ?? '')
  const [color, setColor] = useState(garment.color ?? '')
  const [pattern, setPattern] = useState<GarmentPattern | ''>(garment.pattern ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      ...garment,
      name: name.trim() || garment.name,
      category: (category || null) as GarmentCategory | null,
      style: (style || null) as GarmentStyle | null,
      color: color.trim() || null,
      pattern: (pattern || null) as GarmentPattern | null,
      userCorrected: true,
      updatedAt: Date.now(),
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-garment-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl border border-line bg-surface p-6 shadow-2xl md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-4 top-4 text-muted transition-colors hover:text-ink"
        >
          <X className="h-5 w-5" strokeWidth={1.5} />
        </button>

        <div className="mb-6">
          <p className="text-[9px] uppercase tracking-[0.35em] text-accent">Piece Details</p>
          <h3 id="edit-garment-title" className="mt-2 font-display text-2xl font-light text-ink">
            Edit Wardrobe Piece
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            <div className="md:col-span-5">
              <div className="aspect-[3/4] w-full overflow-hidden border border-line">
                <GarmentPhoto garment={garment} className="h-full w-full" />
              </div>
              <div className="mt-3 space-y-1 text-[9px] uppercase tracking-[0.2em] text-muted">
                {garment.confidence !== null && garment.confidence !== undefined && (
                  <p>Model confidence: {Math.round(garment.confidence * 100)}%</p>
                )}
                {garment.userCorrected && (
                  <p className="text-accent flex items-center gap-1">
                    <Check className="h-2.5 w-2.5" /> Verified by you
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-4 md:col-span-7">
              <label className="flex flex-col gap-1.5">
                <span className="text-[9px] uppercase tracking-[0.2em] text-muted">
                  Garment Name
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border border-line bg-bg px-3 py-2 text-xs text-ink outline-none focus:border-accent/60"
                  required
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[9px] uppercase tracking-[0.2em] text-muted">
                  Category
                </span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as GarmentCategory | '')}
                  className="border border-line bg-bg px-3 py-2 text-xs text-ink outline-none focus:border-accent/60"
                >
                  <option value="">— Select Category —</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabels[c]}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-muted">
                    Colour
                  </span>
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="border border-line bg-bg px-3 py-2 text-xs text-ink outline-none focus:border-accent/60"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-muted">
                    Style
                  </span>
                  <select
                    value={style}
                    onChange={(e) => setStyle(e.target.value as GarmentStyle | '')}
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
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-[9px] uppercase tracking-[0.2em] text-muted">
                  Pattern
                </span>
                <select
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value as GarmentPattern | '')}
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

          <div className="flex items-center justify-end gap-3 border-t border-line pt-5">
            <button
              type="button"
              onClick={onClose}
              className="border border-line px-5 py-2.5 text-[9px] uppercase tracking-[0.2em] text-muted transition-colors hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 bg-accent px-6 py-2.5 text-[9px] uppercase tracking-[0.2em] text-espresso transition-opacity hover:opacity-90"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} /> Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}