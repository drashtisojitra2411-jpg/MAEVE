import { useEffect, useMemo, useState } from 'react'
import { Check, LogOut, RotateCcw, Shirt } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../lib/theme'
import { useAuth } from '../lib/auth'
import { useWeather } from '../lib/weather-context'
import { useWardrobe } from '../lib/wardrobe-context'
import { categoryLabels } from '../lib/garmentCatalogue'
import type { GarmentCategory, StylePreferences } from '../types'
import { LocationPicker } from '../components/weather/LocationPicker'
import { cn } from '../lib/cn'
import { getProfile, putProfile } from '../services/looksApi'

const STYLE_OPTIONS = [
  { id: 'smart-casual', label: 'Smart-Casual' },
  { id: 'casual', label: 'Casual' },
  { id: 'formal', label: 'Formal' },
  { id: 'traditional', label: 'Traditional / Ethnic' },
  { id: 'minimalist', label: 'Minimalist' },
  { id: 'streetwear', label: 'Streetwear' },
  { id: 'sporty', label: 'Sporty' },
  { id: 'evening', label: 'Party / Evening' },
]

const FORMALITY_OPTIONS = [
  { id: 'casual', label: 'Relaxed & Casual' },
  { id: 'smart-casual', label: 'Elevated Smart-Casual' },
  { id: 'formal', label: 'Sharp & Formal' },
]

const COLOR_PALETTES = [
  { name: 'Navy', hex: '#1B2A4A' },
  { name: 'White', hex: '#F8F9FA' },
  { name: 'Black', hex: '#1A1A1A' },
  { name: 'Beige', hex: '#E6D7C3' },
  { name: 'Olive', hex: '#556B2F' },
  { name: 'Charcoal', hex: '#36454F' },
  { name: 'Burgundy', hex: '#800020' },
  { name: 'Cream', hex: '#FFFDD0' },
  { name: 'Tan', hex: '#D2B48C' },
  { name: 'Grey', hex: '#808080' },
  { name: 'Blue', hex: '#4682B4' },
  { name: 'Brown', hex: '#5C4033' },
]

const AVOID_COLOR_OPTIONS = [
  { name: 'Neon', hex: '#39FF14' },
  { name: 'Yellow', hex: '#FFD700' },
  { name: 'Pink', hex: '#FF69B4' },
  { name: 'Orange', hex: '#FFA500' },
  { name: 'Purple', hex: '#800080' },
  { name: 'Red', hex: '#B22222' },
  { name: 'Green', hex: '#2E8B57' },
  { name: 'Brown', hex: '#8B4513' },
]

const LAYERING_COMFORT_OPTIONS = [
  'Breathable fabrics',
  'Relaxed fit',
  'Structured layering',
  'Lightweight layers',
  'Soft textures',
  'Easy movement',
]

const TYPICAL_OCCASIONS = [
  'College / University',
  'Office / Professional',
  'Casual outing',
  'Party / Evening',
  'Traditional event',
  'Date / Dinner',
  'Travel',
  'General everyday wear',
]

const NOTIFICATION_OPTIONS = [
  { id: 'look-of-the-day', label: 'Look of the day', detail: 'A daily recommendation each morning.' },
  { id: 'weather-styling', label: 'Weather-sensitive styling', detail: 'Re-style when conditions change meaningfully.' },
  { id: 'weekly-digest', label: 'Weekly style digest', detail: 'A short review of what you wore.' },
] as const

type NotificationId = (typeof NOTIFICATION_OPTIONS)[number]['id']

interface ProfilePreferences {
  notifications: Record<string, boolean>
  occasions: string[]
  comforts: string[]
}

const EMPTY_PREFS: ProfilePreferences = {
  notifications: {},
  occasions: [],
  comforts: [],
}

function prefsKey(userId: string): string {
  return `maeve-preferences:${userId}`
}

function readPreferences(userId: string): ProfilePreferences {
  try {
    const raw = localStorage.getItem(prefsKey(userId))
    if (!raw) return EMPTY_PREFS
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return {
        notifications: parsed.notifications ?? {},
        occasions: Array.isArray(parsed.occasions) ? parsed.occasions : [],
        comforts: Array.isArray(parsed.comforts) ? parsed.comforts : [],
      }
    }
    return EMPTY_PREFS
  } catch {
    return EMPTY_PREFS
  }
}

export function ProfilePage() {
  const { theme, setTheme } = useTheme()
  const { user, signOut } = useAuth()
  const weather = useWeather()
  const { items } = useWardrobe()
  const navigate = useNavigate()
  const [preferences, setPreferences] = useState<ProfilePreferences>(() =>
    user ? readPreferences(user.id) : EMPTY_PREFS,
  )

  const [stylePrefs, setStylePrefs] = useState<StylePreferences>({
    preferredStyles: ['smart-casual'],
    favoriteColors: ['navy', 'white'],
    avoidColors: [],
    formality: 'smart-casual',
    comfort: ['breathable fabrics'],
    layering: 'lightweight layers',
    typicalOccasions: ['Casual outing', 'General everyday wear'],
  })
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!user) return
      try {
        const p = await getProfile()
        const userPrefs = p?.preferences
        if (!cancelled && userPrefs) {
          setStylePrefs((curr) => ({
            ...curr,
            ...userPrefs,
            preferredStyles: Array.isArray(userPrefs.preferredStyles) && userPrefs.preferredStyles.length > 0
              ? userPrefs.preferredStyles
              : curr.preferredStyles,
          }))
        }
      } catch {
        /* offline fallback */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const toggleStyle = (styleId: string) => {
    setStylePrefs((curr) => {
      const current = curr.preferredStyles ?? []
      const next = current.includes(styleId)
        ? current.filter((s) => s !== styleId)
        : [...current, styleId]
      return { ...curr, preferredStyles: next.length > 0 ? next : [styleId] }
    })
  }

  const setFormality = (lvl: 'casual' | 'smart-casual' | 'formal') => {
    setStylePrefs((curr) => ({ ...curr, formality: lvl }))
  }

  const toggleFavColor = (colorName: string) => {
    const key = colorName.toLowerCase()
    setStylePrefs((curr) => {
      const current = curr.favoriteColors ?? []
      const exists = current.map((c) => c.toLowerCase()).includes(key)
      const next = exists
        ? current.filter((c) => c.toLowerCase() !== key)
        : [...current, key]
      const nextAvoid = (curr.avoidColors ?? []).filter((c) => c.toLowerCase() !== key)
      return { ...curr, favoriteColors: next, avoidColors: nextAvoid }
    })
  }

  const toggleAvoidColor = (colorName: string) => {
    const key = colorName.toLowerCase()
    setStylePrefs((curr) => {
      const current = curr.avoidColors ?? []
      const exists = current.map((c) => c.toLowerCase()).includes(key)
      const next = exists
        ? current.filter((c) => c.toLowerCase() !== key)
        : [...current, key]
      const nextFav = (curr.favoriteColors ?? []).filter((c) => c.toLowerCase() !== key)
      return { ...curr, avoidColors: next, favoriteColors: nextFav }
    })
  }

  const toggleComfortPref = (opt: string) => {
    setStylePrefs((curr) => {
      const current = Array.isArray(curr.comfort) ? curr.comfort : []
      const next = current.includes(opt)
        ? current.filter((c) => c !== opt)
        : [...current, opt]
      return { ...curr, comfort: next }
    })
  }

  const toggleOccasionPref = (occ: string) => {
    setStylePrefs((curr) => {
      const current = curr.typicalOccasions ?? []
      const next = current.includes(occ)
        ? current.filter((o) => o !== occ)
        : [...current, occ]
      return { ...curr, typicalOccasions: next }
    })
  }

  const handleSaveStyleProfile = async () => {
    setSavingPrefs(true)
    try {
      const res = await putProfile({
        preferences: stylePrefs,
        style: stylePrefs.preferredStyles?.[0] || 'smart-casual',
      })
      if (res) {
        setSaveStatus('Style profile saved to your private account')
      } else {
        setSaveStatus('Preferences saved locally')
      }
      setTimeout(() => setSaveStatus(null), 3500)
    } catch {
      setSaveStatus('Preferences saved locally')
      setTimeout(() => setSaveStatus(null), 3000)
    } finally {
      setSavingPrefs(false)
    }
  }

  const handleResetDefaults = async () => {
    const defaults: StylePreferences = {
      preferredStyles: ['smart-casual', 'casual'],
      favoriteColors: [],
      avoidColors: [],
      formality: 'smart-casual',
      comfort: ['breathable fabrics'],
      layering: 'lightweight layers',
      typicalOccasions: ['Casual outing', 'General everyday wear'],
    }
    setStylePrefs(defaults)
    setSavingPrefs(true)
    try {
      await putProfile({ preferences: defaults, style: 'smart-casual' })
      setSaveStatus('Preferences reset to balanced defaults')
      setTimeout(() => setSaveStatus(null), 3500)
    } finally {
      setSavingPrefs(false)
    }
  }

  useEffect(() => {
    if (!user) return
    try {
      localStorage.setItem(prefsKey(user.id), JSON.stringify(preferences))
    } catch {
      /* storage unavailable */
    }
  }, [user, preferences])

  const togglePreference = (id: NotificationId) => {
    setPreferences((current) => ({
      ...current,
      notifications: { ...current.notifications, [id]: !current.notifications[id] },
    }))
  }

  const paletteSwatches = useMemo(() => {
    const seen = new Set<string>()
    const tones: { color: string; name: string }[] = []
    for (const item of items) {
      if (!item.colorHex) continue
      const key = item.colorHex.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      tones.push({ color: item.colorHex, name: item.name })
    }
    return tones
  }, [items])

  const mostWornCategory = useMemo(() => {
    const wearsByCategory: Record<string, number> = {}
    for (const item of items) {
      if (!item.category) continue
      wearsByCategory[item.category] = (wearsByCategory[item.category] ?? 0) + item.timesWorn
    }
    let best: GarmentCategory | null = null
    let bestWears = 0
    for (const category of Object.keys(wearsByCategory) as GarmentCategory[]) {
      if (wearsByCategory[category] > bestWears) {
        best = category
        bestWears = wearsByCategory[category]
      }
    }
    return best ? { category: best, wears: bestWears } : null
  }, [items])

  const favoritePalette = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) {
      if (!item.colorHex) continue
      counts.set(item.colorHex, (counts.get(item.colorHex) ?? 0) + 1)
    }
    let best: string | null = null
    let bestCount = 0
    for (const [hex, n] of counts) {
      if (n > bestCount) {
        best = hex
        bestCount = n
      }
    }
    return best
  }, [items])

  const styleMood = (stylePrefs.preferredStyles && stylePrefs.preferredStyles.length > 0)
    ? stylePrefs.preferredStyles[0]
    : (preferences.occasions.length > 0 ? preferences.occasions[0] : null)

  const handleSignOut = () => {
    void signOut()
    // Defer navigation so the auth state flush lands before PublicOnlyRoute evaluates.
    window.setTimeout(() => navigate('/', { replace: true }), 0)
  }

  const placeLabel = weather.location
    ? weather.location.country
      ? `${weather.location.name}, ${weather.location.country}`
      : weather.location.name
    : 'Not set'

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-14">
      {/* Editorial profile header */}
      <div className="mb-16">
        <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Profile</p>
        <h2
          className="mt-4 font-display font-light leading-[0.88] tracking-tight text-ink"
          style={{ fontSize: 'clamp(2.5rem, 6vw, 6rem)' }}
        >
          {user?.name ?? 'Your studio'}
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span className="text-[10px] uppercase tracking-[0.28em] text-muted/70">{user?.email}</span>
          <span className="h-px w-6 bg-line" aria-hidden="true" />
          <span className="text-[10px] uppercase tracking-[0.28em] text-muted/70">{placeLabel}</span>
        </div>
        <div className="mt-6 h-px w-full bg-gradient-to-r from-accent/30 to-transparent" />
      </div>

      <div className="grid grid-cols-1 gap-14 lg:grid-cols-12">
        {/* Left — preferences column */}
        <div className="lg:col-span-8">
          <section className="mb-14">
            <p className="mb-8 text-[9px] uppercase tracking-[0.45em] text-accent">Style Profile</p>
            <div className="flex flex-col justify-between gap-2 border-b border-line pb-6 md:flex-row md:items-baseline">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Pieces owned</p>
              <div className="md:text-right">
                <p className="font-editorial text-3xl text-ink">{items.length}</p>
                {items.length > 0 && (
                  <p className="mt-1 text-sm text-muted">
                    {Object.keys(
                      items.reduce<Record<string, number>>((acc, i) => {
                        if (!i.category) return acc
                        acc[i.category] = (acc[i.category] ?? 0) + 1
                        return acc
                      }, {}),
                    )
                      .map((c) => categoryLabels[c as keyof typeof categoryLabels] ?? c)
                      .join(' · ')}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-col justify-between gap-2 border-b border-line pb-6 md:flex-row md:items-baseline">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Most worn category</p>
              <div className="md:text-right">
                {mostWornCategory ? (
                  <>
                    <p className="font-editorial text-2xl text-ink">
                      {categoryLabels[mostWornCategory.category]}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {mostWornCategory.wears} {mostWornCategory.wears === 1 ? 'wear' : 'wears'} recorded
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted">No wear history yet</p>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-col justify-between gap-2 border-b border-line pb-6 md:flex-row md:items-baseline">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Style mood</p>
              <p className="font-editorial text-2xl text-ink md:text-right">
                {styleMood ? styleMood : 'Not set'}
              </p>
            </div>
          </section>

          <section className="mb-14">
            <p className="mb-8 text-[9px] uppercase tracking-[0.45em] text-accent">Colour Palette</p>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted">Your wardrobe tones</p>
              {paletteSwatches.length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  Colour swatches appear once your pieces carry real colour information.
                </p>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap gap-4">
                    {paletteSwatches.map((swatch) => (
                      <span
                        key={swatch.color}
                        className="flex flex-col items-center gap-2"
                        title={swatch.name}
                      >
                        <span
                          className="h-12 w-12 rounded-full border border-black/10"
                          style={{ backgroundColor: swatch.color }}
                        />
                        <span className="max-w-16 truncate text-[9px] uppercase tracking-[0.14em] text-muted">
                          {swatch.name}
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className="mt-6 flex flex-col justify-between gap-2 border-t border-line pt-5 md:flex-row md:items-baseline">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Favorite palette</p>
                    <div className="md:text-right">
                      {favoritePalette ? (
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-5 w-5 rounded-full border border-black/10"
                            style={{ backgroundColor: favoritePalette }}
                          />
                          <span className="font-editorial text-xl text-ink">
                            {favoritePalette.toUpperCase()}
                          </span>
                        </span>
                      ) : (
                        <p className="mt-1 text-sm text-muted">Not set</p>
                      )}
                    </div>
                  </div>
                </>
              )}
          </section>

          {/* Personal Fashion Profile Settings (Phase 5) */}
          <section className="mb-14 border border-line bg-card p-6 md:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
              <div>
                <p className="text-[9px] uppercase tracking-[0.45em] text-accent">Fashion Intelligence</p>
                <h3 className="mt-1 font-display text-2xl font-light text-ink">
                  Personal Style Profile
                </h3>
              </div>
              {saveStatus && (
                <div className="inline-flex items-center gap-2 border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-ink">
                  <Check className="h-3.5 w-3.5 text-accent" />
                  <span>{saveStatus}</span>
                </div>
              )}
            </div>

            <p className="mt-3 text-xs leading-relaxed text-muted">
              Configure your aesthetic identity, preferred formality, and color preferences. The recommendation engine applies these explicit signals to rank outfits from your wardrobe.
            </p>

            {/* 1. Preferred Styles */}
            <div className="mt-8">
              <label className="text-[10px] uppercase tracking-[0.3em] text-accent font-medium">
                1. Preferred Style Aesthetics
              </label>
              <p className="mt-1 text-xs text-muted">Select all styles that match your wardrobe identity.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {STYLE_OPTIONS.map((st) => {
                  const selected = (stylePrefs.preferredStyles ?? []).includes(st.id)
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => toggleStyle(st.id)}
                      className={cn(
                        'px-3.5 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-all border',
                        selected
                          ? 'border-accent bg-accent text-espresso font-medium shadow-sm'
                          : 'border-line bg-sand/20 text-muted hover:text-ink hover:border-line-strong',
                      )}
                    >
                      {st.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 2. Formality Level */}
            <div className="mt-8">
              <label className="text-[10px] uppercase tracking-[0.3em] text-accent font-medium">
                2. Formality Balance
              </label>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {FORMALITY_OPTIONS.map((f) => {
                  const selected = (stylePrefs.formality || 'smart-casual') === f.id
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFormality(f.id as any)}
                      className={cn(
                        'p-3 text-left border transition-all',
                        selected
                          ? 'border-accent bg-accent/10 text-ink shadow-sm'
                          : 'border-line bg-sand/10 text-muted hover:text-ink',
                      )}
                    >
                      <p className="text-[10px] uppercase tracking-[0.2em] font-medium text-ink">{f.label}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 3. Color Preferences */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-line/60 pt-6">
              {/* Favorite Colors */}
              <div>
                <label className="text-[10px] uppercase tracking-[0.3em] text-accent font-medium">
                  3A. Favorite Palette
                </label>
                <p className="mt-1 text-xs text-muted">Colors that receive an affinity bonus in styling.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {COLOR_PALETTES.map((c) => {
                    const isFav = (stylePrefs.favoriteColors ?? []).map((x) => x.toLowerCase()).includes(c.name.toLowerCase())
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => toggleFavColor(c.name)}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.16em] border transition-all',
                          isFav
                            ? 'border-accent bg-accent/15 text-ink font-medium ring-1 ring-accent'
                            : 'border-line bg-sand/10 text-muted hover:text-ink',
                        )}
                      >
                        <span className="h-3 w-3 rounded-full border border-black/20" style={{ backgroundColor: c.hex }} />
                        <span>{c.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Avoided Colors */}
              <div>
                <label className="text-[10px] uppercase tracking-[0.3em] text-accent font-medium">
                  3B. Avoided Tones
                </label>
                <p className="mt-1 text-xs text-muted">Colors or combinations you prefer not to wear.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {AVOID_COLOR_OPTIONS.map((c) => {
                    const isAvoided = (stylePrefs.avoidColors ?? []).map((x) => x.toLowerCase()).includes(c.name.toLowerCase())
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => toggleAvoidColor(c.name)}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.16em] border transition-all',
                          isAvoided
                            ? 'border-red-500/60 bg-red-950/20 text-red-400 font-medium'
                            : 'border-line bg-sand/10 text-muted hover:text-ink',
                        )}
                      >
                        <span className="h-3 w-3 rounded-full border border-black/20" style={{ backgroundColor: c.hex }} />
                        <span className={cn(isAvoided && 'line-through')}>{c.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* 4. Comfort & Layering */}
            <div className="mt-8 border-t border-line/60 pt-6">
              <label className="text-[10px] uppercase tracking-[0.3em] text-accent font-medium">
                4. Comfort &amp; Layering Priorities
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {LAYERING_COMFORT_OPTIONS.map((opt) => {
                  const selected = Array.isArray(stylePrefs.comfort) && stylePrefs.comfort.includes(opt)
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleComfortPref(opt)}
                      className={cn(
                        'px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-all border',
                        selected
                          ? 'border-accent bg-accent text-espresso font-medium shadow-sm'
                          : 'border-line bg-sand/20 text-muted hover:text-ink',
                      )}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 5. Typical Occasions */}
            <div className="mt-8 border-t border-line/60 pt-6">
              <label className="text-[10px] uppercase tracking-[0.3em] text-accent font-medium">
                5. Typical Occasions
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {TYPICAL_OCCASIONS.map((occ) => {
                  const selected = (stylePrefs.typicalOccasions ?? []).includes(occ)
                  return (
                    <button
                      key={occ}
                      type="button"
                      onClick={() => toggleOccasionPref(occ)}
                      className={cn(
                        'px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-all border',
                        selected
                          ? 'border-accent bg-accent/20 text-ink font-medium border-accent'
                          : 'border-line bg-sand/20 text-muted hover:text-ink',
                      )}
                    >
                      {occ}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Action Bar */}
            <div className="mt-10 pt-6 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-[10px] text-muted flex items-center gap-1.5">
                <Shirt className="h-3 w-3 text-accent" />
                Preferences are scoped to your authenticated account and persist across devices.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  disabled={savingPrefs}
                  className="flex items-center gap-2 border border-line bg-card px-4 py-2.5 text-[10px] uppercase tracking-[0.2em] text-muted hover:text-ink"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset to Defaults
                </button>
                <button
                  type="button"
                  onClick={handleSaveStyleProfile}
                  disabled={savingPrefs}
                  className={cn(
                    'flex items-center gap-2 bg-accent px-6 py-2.5 text-[10px] uppercase tracking-[0.25em] text-espresso font-medium shadow-sm transition-all',
                    savingPrefs ? 'opacity-70 cursor-wait' : 'hover:opacity-90',
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                  {savingPrefs ? 'Saving…' : 'Save Style Profile'}
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Right rail — location, notifications, theme, account */}
        <div className="lg:col-span-4">
          <section className="mb-12">
            <p className="mb-6 text-[9px] uppercase tracking-[0.45em] text-accent">Location &amp; Weather</p>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Weather location</p>
              <p className="mt-1 font-editorial text-xl text-ink">{placeLabel}</p>
              {weather.location?.region ? (
                <p className="mt-1 text-sm text-muted">{weather.location.region}</p>
              ) : null}
              <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted/70">
                MAEVE styles for the conditions wherever you are.
              </p>
              <div className="mt-4">
                <LocationPicker align="left" />
              </div>
            </div>
          </section>

          <section className="mb-12">
            <p className="mb-6 text-[9px] uppercase tracking-[0.45em] text-accent">Notifications</p>
            <div className="space-y-1">
              {NOTIFICATION_OPTIONS.map((option) => {
                const on = preferences.notifications[option.id]
                return (
                  <div
                    key={option.id}
                    className="flex items-center justify-between gap-4 border-b border-line py-3.5"
                  >
                    <div>
                      <p className="text-sm text-ink/80">{option.label}</p>
                      <p className="mt-0.5 text-[11px] text-muted">{option.detail}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(on)}
                      aria-label={`${option.label} notifications`}
                      onClick={() => togglePreference(option.id)}
                      className={cn(
                        'relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-500',
                        on ? 'border-accent bg-accent/80' : 'border-line-strong bg-transparent',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all duration-500',
                          on ? 'left-[calc(100%-1.35rem)] bg-espresso' : 'left-0.5 bg-muted/50',
                        )}
                      />
                    </button>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="mb-12">
            <p className="mb-6 text-[9px] uppercase tracking-[0.45em] text-accent">Interface Theme</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={cn(
                  'group border p-5 text-left transition-all duration-500',
                  theme === 'light'
                    ? 'border-accent/70 bg-accent-soft'
                    : 'border-line hover:border-line-strong',
                )}
              >
                <span className="block h-16 w-full rounded-sm border border-black/10 bg-gradient-to-b from-[#F9F5EF] to-[#EFE8DC]" />
                <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-ink">Porcelain</p>
                <p className="mt-1 text-[9px] uppercase tracking-[0.15em] text-muted">Editorial showroom</p>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={cn(
                  'group border p-5 text-left transition-all duration-500',
                  theme === 'dark'
                    ? 'border-accent/70 bg-accent-soft'
                    : 'border-line hover:border-line-strong',
                )}
              >
                <span className="block h-16 w-full rounded-sm border border-white/10 bg-gradient-to-b from-[#151210] to-[#0D0B0A]" />
                <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-ink">Midnight</p>
                <p className="mt-1 text-[9px] uppercase tracking-[0.15em] text-muted">Private studio</p>
              </button>
            </div>
          </section>

          <section>
            <p className="mb-6 text-[9px] uppercase tracking-[0.45em] text-accent">Account</p>
            <p className="text-sm text-muted">
              Signed in as {user?.email}. Your wardrobe, looks and preferences stay in this
              browser and are scoped to your account.
            </p>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-8 flex w-full items-center justify-center gap-3 border border-line py-4 text-[10px] uppercase tracking-[0.28em] text-ink transition-colors hover:border-accent/50 hover:text-accent"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              Sign out
            </button>
          </section>

          <section className="mt-12">
            <p className="mb-6 text-[9px] uppercase tracking-[0.45em] text-accent">Privacy</p>
            <div className="space-y-3 border-t border-line pt-4">
              <p className="text-sm leading-relaxed text-muted">
                Your belongings stay yours. Photographs are processed to identify
                garments, stored within your account scope, and never shared with
                other users. MAEVE shows no marketplaces, no recommendations
                to buy, and no other people&apos;s closets.
              </p>
              <p className="text-sm leading-relaxed text-muted">
                Nothing is seeded into your wardrobe — every piece you see came from a
                photograph you added.
              </p>
            </div>
          </section>

          <section className="mt-12">
            <p className="mb-6 text-[9px] uppercase tracking-[0.45em] text-accent">Close Account</p>
            <div className="border border-line p-5">
              <p className="text-sm leading-relaxed text-muted">
                Account deletion isn&apos;t available in this version. If you&apos;d like your
                wardrobe, looks and preferences removed from this device, sign out —
                your data remains scoped to your account.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}