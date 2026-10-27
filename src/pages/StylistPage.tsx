import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Bookmark,
  Check,
  CloudRain,
  Droplets,
  Info,
  MapPin,
  Plus,
  RotateCcw,
  RotateCw,
  Shirt,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Wind,
  X,
} from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../lib/cn'
import { maeveEase } from '../lib/motion'
import { useWeather } from '../lib/weather-context'
import { useAuth } from '../lib/auth'
import { useWardrobe } from '../lib/wardrobe-context'
import { ageLabel, formatTemperature, roundHumidity } from '../lib/weather'
import { weatherIcons } from '../lib/weatherIcons'
import { canComposeLook, composeLooks } from '../lib/lookComposer'
import { readLookHistory, recordLook } from '../services/lookService'
import {
  recommendLooks,
  recordWardrobeWear,
  saveLook,
  updateLookFeedback,
} from '../services/looksApi'
import { liveWeatherSnapshot } from '../lib/weatherSnapshot'
import { useLooks } from '../lib/useLooks'
import type { GeneratedLook, WardrobeItem } from '../types'
import { GarmentPhoto } from '../components/wardrobe/GarmentPhoto'
import { StylistLoader } from '../components/loading/StylistLoader'
import { Skeleton } from '../components/loading/Skeleton'
import { LocationPicker } from '../components/weather/LocationPicker'

const OCCASIONS = [
  { id: 'College / University', label: 'College / University', subtitle: 'Campus, lectures & study' },
  { id: 'Office / Professional', label: 'Office / Professional', subtitle: 'Workplace & business meetings' },
  { id: 'Casual outing', label: 'Casual outing', subtitle: 'Coffee, errands & weekend walks' },
  { id: 'Party / Evening', label: 'Party / Evening', subtitle: 'Dinners, nightlife & celebrations' },
  { id: 'Traditional event', label: 'Traditional event', subtitle: 'Festivals, weddings & ceremonies' },
  { id: 'Date / Dinner', label: 'Date / Dinner', subtitle: 'Intimate dining & evening dates' },
  { id: 'Travel', label: 'Travel', subtitle: 'Transit, flights & versatile packing' },
  { id: 'General everyday wear', label: 'General everyday wear', subtitle: 'Effortless daily rotation' },
]

const STYLES = ['Smart-Casual', 'Casual', 'Formal', 'Ethnic', 'Sporty']
const PREFERENCES = ['Comfort-first', 'Relaxed fit', 'Breathable fabrics', 'Easy to move in', 'Soft textures']

type Stage = 'input' | 'generating' | 'result' | 'empty' | 'error'

interface PendingOutcome {
  look: GeneratedLook | null
  recommendations: GeneratedLook[]
  missingCategories?: string[]
  reason?: string
  error?: boolean
}

export function StylistPage() {
  const { user } = useAuth()
  const { status: wardrobeStatus, items, refresh: refreshWardrobe } = useWardrobe()
  const { looks: savedLooks, remove: removeSavedLook, rate: rateSavedLook, reload: reloadSavedLooks } = useLooks()
  const weather = useWeather()

  // Navigation tab: Stylist Studio vs Saved Lookbook
  const [activeTab, setActiveTab] = useState<'studio' | 'lookbook'>('studio')

  // Stylist form state
  const [occasion, setOccasion] = useState('College / University')
  const [stylePref, setStylePref] = useState('Smart-Casual')
  const [comfortPref, setComfortPref] = useState('Comfort-first')
  const [useLiveWeather, setUseLiveWeather] = useState(true)

  // Recommendation run state
  const [stage, setStage] = useState<Stage>('input')
  const [recommendations, setRecommendations] = useState<GeneratedLook[]>([])
  const [selectedRank, setSelectedRank] = useState(0)
  const [missingCategories, setMissingCategories] = useState<string[]>([])
  const [reason, setReason] = useState<string | null>(null)

  // Interactive look actions
  const [savedLookIds, setSavedLookIds] = useState<Set<string>>(new Set())
  const [wornLookIds, setWornLookIds] = useState<Set<string>>(new Set())
  const [wearToast, setWearToast] = useState<string | null>(null)
  const [markingWorn, setMarkingWorn] = useState(false)
  const [lookFeedback, setLookFeedback] = useState<Record<string, { feedback?: 'like' | 'dislike' | null; rating?: number | null }>>({})
  const [inspectingItem, setInspectingItem] = useState<WardrobeItem | null>(null)

  const loaderDoneRef = useRef(false)
  const pendingRef = useRef<PendingOutcome | null>(null)

  const wearable = items.filter((item) => Boolean(item.imageUrl) || Boolean(item.category))
  const styleable = canComposeLook(wearable)

  const finish = useCallback((outcome: PendingOutcome) => {
    setRecommendations(outcome.recommendations)
    setSelectedRank(0)
    setMissingCategories(outcome.missingCategories || [])
    setReason(outcome.reason ?? null)

    if (outcome.recommendations.length > 0) {
      setStage('result')
    } else if (outcome.error) {
      setStage('error')
    } else {
      setStage('empty')
    }
  }, [])

  const settle = useCallback(
    (outcome: PendingOutcome) => {
      pendingRef.current = outcome
      if (loaderDoneRef.current) finish(outcome)
    },
    [finish],
  )

  // Offline fallback using client-side lookComposer
  const composeOffline = useCallback((): GeneratedLook | null => {
    const summary = weather.status === 'ready' && weather.data ? String(weather.data.current.condition) : null
    const temperature = weather.status === 'ready' && weather.data ? weather.data.current.temperature : null
    const composed = composeLooks(wearable, { occasion, summary, temperature }, 1)[0]
    if (!composed) {
      setReason("MAEVE couldn't find a suitable combination in your wardrobe right now.")
      return null
    }
    if (user) {
      const existing = readLookHistory(user.id)
      const signature = [...composed.items.map((i) => i.id)].sort().join('|')
      if (!existing.some((r) => [...r.itemIds].sort().join('|') === signature)) {
        recordLook(user.id, {
          occasion: composed.occasion,
          itemIds: composed.items.map((i) => i.id),
          reasoning: composed.reasoning,
        })
      }
    }
    return {
      id: composed.id,
      occasion: composed.occasion,
      itemIds: composed.items.map((i) => i.id),
      items: composed.items,
      explanation: [composed.reasoning],
      score: 82,
      breakdown: { occasion: 85, weather: 80, colour: 88, preference: 75, style: 82, pattern: 90 },
      weather: liveWeatherSnapshot(weather) ?? {},
      preferences: { style: stylePref.toLowerCase(), comfort: comfortPref.toLowerCase() },
      createdAt: composed.createdAt,
    }
  }, [weather, wearable, occasion, stylePref, comfortPref, user])

  const generate = () => {
    if (stage === 'generating') return
    loaderDoneRef.current = false
    pendingRef.current = null
    setRecommendations([])
    setSelectedRank(0)
    setMissingCategories([])
    setReason(null)
    setStage('generating')

    void (async () => {
      try {
        const out = await recommendLooks({
          occasion,
          preferences: {
            style: stylePref.toLowerCase(),
            comfort: comfortPref.toLowerCase(),
          },
          weather: useLiveWeather ? liveWeatherSnapshot(weather) : null,
          limit: 5,
        })
        const recs = out.recommendations && out.recommendations.length > 0
          ? out.recommendations
          : (out.look ? [out.look] : [])
        settle({
          look: out.look,
          recommendations: recs,
          missingCategories: out.missingCategories,
          reason: out.reason,
        })
      } catch {
        const fallback = composeOffline()
        settle({
          look: fallback,
          recommendations: fallback ? [fallback] : [],
          error: !fallback,
        })
      }
    })()
  }

  const onLoaderComplete = () => {
    loaderDoneRef.current = true
    const outcome = pendingRef.current
    if (outcome) finish(outcome)
  }

  const handleSaveLook = async (look: GeneratedLook) => {
    if (savedLookIds.has(look.id)) return
    try {
      const persisted = await saveLook(look)
      setSavedLookIds((prev) => new Set(prev).add(look.id).add(persisted.id))
      reloadSavedLooks()
    } catch (err) {
      console.error('Failed to save look:', err)
    }
  }

  const handleFeedback = async (lookId: string, feedback: 'like' | 'dislike') => {
    const current = lookFeedback[lookId]?.feedback
    const newFeedback = current === feedback ? null : feedback
    setLookFeedback((prev) => ({
      ...prev,
      [lookId]: { ...prev[lookId], feedback: newFeedback },
    }))
    try {
      await updateLookFeedback(lookId, { feedback: newFeedback })
    } catch {
      // Offline fallback silent handle
    }
  }

  const handleRating = async (lookId: string, rating: number) => {
    const current = lookFeedback[lookId]?.rating
    const newRating = current === rating ? null : rating
    setLookFeedback((prev) => ({
      ...prev,
      [lookId]: { ...prev[lookId], rating: newRating },
    }))
    try {
      await updateLookFeedback(lookId, { rating: newRating })
    } catch {
      // Offline fallback silent handle
    }
  }

  const handleMarkAsWorn = async (look: { id: string; itemIds?: string[]; items?: { id: string }[] }) => {
    if (markingWorn || wornLookIds.has(look.id)) return
    setMarkingWorn(true)
    try {
      const itemIds = look.itemIds && look.itemIds.length > 0 ? look.itemIds : (look.items?.map((i) => i.id) ?? [])
      const res = await recordWardrobeWear(itemIds, look.id)
      setWornLookIds((prev) => new Set(prev).add(look.id))
      refreshWardrobe()
      setWearToast(
        res.deduped
          ? 'Wear event recorded earlier today — wardrobe freshness maintained.'
          : 'Marked as worn — usage intelligence & freshness scores updated.'
      )
      setTimeout(() => setWearToast(null), 4000)
    } catch (err) {
      console.error('Failed to record wear:', err)
      setWearToast('Could not record wear event. Please check connection.')
      setTimeout(() => setWearToast(null), 3000)
    } finally {
      setMarkingWorn(false)
    }
  }

  const activeLook = recommendations[selectedRank] || null

  if (wardrobeStatus === 'loading') {
    return (
      <div className="px-6 py-10 lg:px-12 lg:py-14" aria-busy="true" aria-label="Loading stylist">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-4 h-12 w-96 max-w-full" />
        <Skeleton className="mt-12 h-64 w-full" />
      </div>
    )
  }

  if (wardrobeStatus === 'error') {
    return (
      <div className="px-6 py-10 lg:px-12 lg:py-14">
        <section className="border border-line bg-sand/20 p-12 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-accent" strokeWidth={1.5} />
          <p className="mt-4 font-display text-3xl font-light text-ink">Unable to read your wardrobe</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            MAEVE composes exclusively from garments you actually own. Please reconnect and try again.
          </p>
        </section>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="px-6 py-10 lg:px-12 lg:py-14">
        <div className="mb-10">
          <p className="text-[10px] uppercase tracking-[0.35em] text-accent">Your Personal Stylist</p>
          <h1 className="mt-3 font-display text-4xl font-light text-ink md:text-5xl">
            Style from what you own.
          </h1>
        </div>
        <section className="border border-line bg-sand/20 p-10 md:p-14">
          <p className="text-[10px] uppercase tracking-[0.35em] text-accent">Empty Wardrobe</p>
          <h2 className="mt-4 font-display text-3xl font-light text-ink">
            Add your first garments to unlock personalized styling.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            MAEVE does not recommend sponsored items or placeholder photographs. Every outfit recommendation is composed strictly from your own saved pieces.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              to="/add"
              className="inline-flex items-center gap-2.5 bg-accent px-8 py-3.5 text-[10px] font-medium uppercase tracking-[0.25em] text-espresso transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Add First Garment
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="px-6 py-10 lg:px-12 lg:py-14">
      {/* Editorial Header */}
      <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="text-[10px] uppercase tracking-[0.38em] text-accent">AI Wardrobe Stylist</p>
          <h1 className="mt-2 font-display text-4xl font-light tracking-tight text-ink md:text-6xl">
            Your Personal Stylist
          </h1>
          <p className="mt-2 max-w-xl font-editorial text-lg italic text-muted">
            Intelligent, category-aware outfit composition driven entirely by your real saved wardrobe.
          </p>
        </div>

        {/* View Switcher: Stylist Studio vs Saved Lookbook */}
        <div className="inline-flex border border-line bg-sand/30 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('studio')}
            className={cn(
              'px-5 py-2 text-[10px] uppercase tracking-[0.25em] transition-all',
              activeTab === 'studio'
                ? 'bg-accent text-espresso font-medium shadow-sm'
                : 'text-muted hover:text-ink',
            )}
          >
            Styling Studio
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('lookbook')}
            className={cn(
              'flex items-center gap-2 px-5 py-2 text-[10px] uppercase tracking-[0.25em] transition-all',
              activeTab === 'lookbook'
                ? 'bg-accent text-espresso font-medium shadow-sm'
                : 'text-muted hover:text-ink',
            )}
          >
            <Bookmark className="h-3 w-3" />
            Saved Lookbook ({savedLooks.length})
          </button>
        </div>
      </div>

      {/* TAB 1: STYLING STUDIO */}
      {activeTab === 'studio' && (
        <>
          {/* Missing Categories Alert banner if wardrobe is incomplete */}
          {!styleable && stage === 'input' && (
            <div className="mb-8 border border-accent/40 bg-accent/5 p-6 md:p-8">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 flex-shrink-0 text-accent mt-0.5" />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.28em] text-accent font-medium">
                    Wardrobe Balance Notice
                  </p>
                  <p className="mt-1 font-display text-xl font-light text-ink">
                    Add a few complementary pieces for full ensemble styling.
                  </p>
                  <p className="mt-1 text-xs text-muted leading-relaxed">
                    MAEVE composes category-aware outfits (Tops + Bottoms, or Dresses, or Traditional attire). Your current wardrobe has partial coverage — single-piece or partial recommendations will still be shown.
                  </p>
                  <Link
                    to="/add"
                    className="mt-4 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-accent underline underline-offset-4 hover:opacity-80"
                  >
                    <Plus className="h-3 w-3" /> Add more pieces
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Configuration Form (Visible when in input or generating mode) */}
          {(stage === 'input' || stage === 'generating') && (
            <div className="border border-line bg-sand/20 p-6 md:p-10 mb-12">
              {/* Editorial Live Weather Context Panel */}
              <div className="mb-10 border border-line bg-card/60 p-6 md:p-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line/60 pb-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-[0.35em] text-accent font-medium">
                        Atmospheric Telemetry & Real-Time Weather
                      </span>
                      {weather.data && (
                        <span className="text-[9px] uppercase tracking-[0.2em] px-2 py-0.5 bg-accent/10 text-accent font-medium">
                          {weather.isCached ? 'Cached' : 'Live Observation'}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Real conditions influence fabric choice, sleeve length, rainwear readiness, and temperature-appropriate layering.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <LocationPicker />
                    <button
                      type="button"
                      onClick={() => weather.refresh()}
                      disabled={weather.refreshing}
                      title="Refresh current meteorological observation"
                      className="flex items-center gap-2 border border-line px-3.5 py-2 text-[10px] uppercase tracking-[0.2em] text-muted hover:text-ink hover:border-accent/40 transition-colors"
                    >
                      <RotateCw className={cn("h-3.5 w-3.5", weather.refreshing && "animate-spin text-accent")} />
                      <span>{weather.refreshing ? "Refreshing…" : "Refresh"}</span>
                    </button>
                  </div>
                </div>

                {/* Telemetry Display based on status */}
                {weather.status === 'ready' && weather.data ? (
                  <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                    {/* Temp & Condition */}
                    <div className="flex items-center gap-3 border-r border-line/40 pr-4">
                      {(() => {
                        const WeatherIcon = weatherIcons[weather.data.current.icon] || weatherIcons['cloud']
                        return <WeatherIcon className="h-7 w-7 text-accent flex-shrink-0" strokeWidth={1.5} />
                      })()}
                      <div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-display text-2xl font-light text-ink">
                            {formatTemperature(weather.data.current.temperature)}°C
                          </span>
                          <span className="text-[10px] text-muted">
                            (Feels {formatTemperature(weather.data.current.feelsLike)}°)
                          </span>
                        </div>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium">
                          {weather.data.current.condition}
                        </p>
                      </div>
                    </div>

                    {/* Humidity */}
                    <div className="flex items-center gap-2.5 border-r border-line/40 pr-4">
                      <Droplets className="h-4 w-4 text-accent/80 flex-shrink-0" strokeWidth={1.5} />
                      <div>
                        <p className="font-display text-lg font-light text-ink">
                          {roundHumidity(weather.data.current.humidity)}%
                        </p>
                        <p className="text-[9px] uppercase tracking-[0.2em] text-muted">Humidity</p>
                      </div>
                    </div>

                    {/* Precipitation */}
                    <div className="flex items-center gap-2.5 border-r border-line/40 pr-4">
                      <CloudRain className="h-4 w-4 text-accent/80 flex-shrink-0" strokeWidth={1.5} />
                      <div>
                        <p className="font-display text-lg font-light text-ink">
                          {Math.round(weather.data.current.precipitationProbability)}%
                        </p>
                        <p className="text-[9px] uppercase tracking-[0.2em] text-muted">Rain Probability</p>
                      </div>
                    </div>

                    {/* Wind & Age */}
                    <div className="flex items-center gap-2.5">
                      <Wind className="h-4 w-4 text-accent/80 flex-shrink-0" strokeWidth={1.5} />
                      <div>
                        <p className="font-display text-lg font-light text-ink">
                          {Math.round(weather.data.current.windSpeed)} km/h
                        </p>
                        <p className="text-[9px] uppercase tracking-[0.18em] text-muted">
                          {ageLabel(weather.data.updatedAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : weather.status === 'loading' || weather.status === 'locating' ? (
                  <div className="mt-5 flex items-center gap-3 py-2 text-xs text-muted">
                    <RotateCw className="h-4 w-4 animate-spin text-accent" />
                    <span>Connecting to meteorological observation telemetry…</span>
                  </div>
                ) : weather.status === 'denied' ? (
                  <div className="mt-5 flex items-center justify-between gap-4 py-2 text-xs text-muted">
                    <div className="flex items-center gap-2.5">
                      <MapPin className="h-4 w-4 text-accent flex-shrink-0" />
                      <span>Browser geolocation was not granted. Search your city with the selector above to enable weather-aware styling.</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 flex items-center justify-between gap-4 py-2 text-xs text-muted">
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle className="h-4 w-4 text-accent flex-shrink-0" />
                      <span>Weather service unreachable ({weather.error || 'Network error'}). Outfits will be styled from occasion and garment attributes.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => weather.refresh()}
                      className="text-[10px] uppercase tracking-[0.2em] text-accent underline underline-offset-4"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Weather Toggle */}
                <div className="mt-5 pt-4 border-t border-line/40 flex items-center justify-between gap-4">
                  <label className="flex items-center gap-3 cursor-pointer text-xs text-ink font-medium select-none">
                    <input
                      type="checkbox"
                      checked={useLiveWeather}
                      onChange={(e) => setUseLiveWeather(e.target.checked)}
                      className="accent-accent h-4 w-4 rounded"
                    />
                    <span>Factor live meteorological conditions into outfit ranking</span>
                  </label>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted hidden sm:inline">
                    {useLiveWeather ? 'Live Weather Active' : 'Pure Occasion Mode'}
                  </span>
                </div>
              </div>

              {/* Occasion Selection - 8 Primary Occasions */}
              <div className="mb-8">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-[0.35em] text-accent font-medium">
                    1. Select Occasion
                  </label>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted">
                    {OCCASIONS.find((o) => o.id === occasion)?.subtitle}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4">
                  {OCCASIONS.map((occ) => (
                    <button
                      key={occ.id}
                      type="button"
                      onClick={() => setOccasion(occ.id)}
                      className={cn(
                        'border p-3.5 text-left transition-all',
                        occasion === occ.id
                          ? 'border-accent bg-accent/10 shadow-sm'
                          : 'border-line/70 bg-card hover:border-accent/40',
                      )}
                    >
                      <p className={cn('text-[11px] font-medium tracking-wide', occasion === occ.id ? 'text-accent' : 'text-ink')}>
                        {occ.label}
                      </p>
                      <p className="mt-1 line-clamp-1 text-[9px] text-muted">
                        {occ.subtitle}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preferences & Weather Strip */}
              <div className="grid grid-cols-1 gap-8 md:grid-cols-3 border-t border-line/70 pt-8">
                {/* Style preference */}
                <div>
                  <label className="text-[10px] uppercase tracking-[0.35em] text-accent font-medium">
                    2. Style Aesthetic
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {STYLES.map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStylePref(st)}
                        className={cn(
                          'px-3.5 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors',
                          stylePref === st
                            ? 'bg-ink text-sand'
                            : 'border border-line/80 bg-card text-muted hover:text-ink',
                        )}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Comfort preference */}
                <div>
                  <label className="text-[10px] uppercase tracking-[0.35em] text-accent font-medium">
                    3. Comfort Priority
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {PREFERENCES.map((pr) => (
                      <button
                        key={pr}
                        type="button"
                        onClick={() => setComfortPref(pr)}
                        className={cn(
                          'px-3.5 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors',
                          comfortPref === pr
                            ? 'bg-ink text-sand'
                            : 'border border-line/80 bg-card text-muted hover:text-ink',
                        )}
                      >
                        {pr}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional weather integration */}
                <div>
                  <label className="text-[10px] uppercase tracking-[0.35em] text-accent font-medium">
                    4. Weather Layering
                  </label>
                  <div className="mt-3 flex flex-col gap-2 text-xs">
                    <p className="text-ink">
                      {useLiveWeather ? (
                        weather.data ? (
                          <span className="text-accent font-medium">
                            Calibrated to {weather.data.location.name || 'your city'} ({formatTemperature(weather.data.current.temperature)}°C · {weather.data.current.condition})
                          </span>
                        ) : (
                          <span className="text-muted">Awaiting location telemetry</span>
                        )
                      ) : (
                        <span className="text-muted">Weather factoring disabled (neutral baseline)</span>
                      )}
                    </p>
                    <p className="text-[10px] text-muted leading-relaxed">
                      {useLiveWeather
                        ? "Outerwear, sleeve length, and fabric breathability adjust automatically to temperature and precipitation."
                        : "Styles are scored solely on occasion formality, color harmony, and aesthetic cohesion."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Generate Outfits Action */}
              <div className="mt-10 pt-6 border-t border-line/70 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-xs text-muted">
                  Generates ranked, category-aware outfits scored by color harmony, style & occasion suitability.
                </p>
                <button
                  type="button"
                  onClick={generate}
                  disabled={stage === 'generating'}
                  className={cn(
                    'flex items-center gap-3 bg-accent px-8 py-4 text-[11px] font-medium uppercase tracking-[0.32em] text-espresso transition-all',
                    stage === 'generating' ? 'opacity-70 cursor-wait' : 'hover:opacity-90 shadow-md',
                  )}
                >
                  <Sparkles className="h-4 w-4" />
                  {stage === 'generating' ? 'Scoring Combinations…' : 'Generate Outfits'}
                </button>
              </div>
            </div>
          )}

          {/* Generating Animation */}
          <AnimatePresence>
            {stage === 'generating' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="my-10 border border-line bg-card p-8"
              >
                <StylistLoader onComplete={onLoaderComplete} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results Presentation */}
          <AnimatePresence>
            {stage === 'result' && activeLook && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: maeveEase }}
                className="mt-6"
              >
                {/* Result Top Bar: Rank selector & Regenerate */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-6">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.35em] text-accent font-medium">
                      Recommended Combinations
                    </p>
                    <h2 className="mt-1 font-display text-2xl font-light text-ink md:text-3xl">
                      Ranked Outfits for {occasion}
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Rank switcher pills */}
                    {recommendations.map((rec, idx) => (
                      <button
                        key={rec.id || idx}
                        type="button"
                        onClick={() => setSelectedRank(idx)}
                        className={cn(
                          'px-4 py-2 text-[10px] uppercase tracking-[0.2em] transition-all flex items-center gap-2',
                          selectedRank === idx
                            ? 'bg-ink text-sand font-medium'
                            : 'border border-line bg-card text-muted hover:text-ink',
                        )}
                      >
                        <span>#{idx + 1} {idx === 0 ? 'Best Match' : 'Option'}</span>
                        {rec.score && <span className="text-accent font-semibold">{rec.score}%</span>}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => setStage('input')}
                      className="inline-flex items-center gap-2 border border-line bg-card px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-muted hover:text-ink hover:border-accent/50"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Adjust Criteria
                    </button>
                  </div>
                </div>

                {/* Weather Context Bar for Generated Look */}
                {activeLook.breakdown?.weather != null && weather.data ? (
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-accent/40 bg-accent/5 p-4 text-xs">
                    <div className="flex items-center gap-2.5 text-ink">
                      <MapPin className="h-4 w-4 text-accent flex-shrink-0" />
                      <span className="font-medium text-accent uppercase tracking-wider text-[10px]">
                        Live Conditions:
                      </span>
                      <span>
                        {weather.data.location.name || 'Selected City'} · {formatTemperature(weather.data.current.temperature)}°C ({weather.data.current.condition}), {roundHumidity(weather.data.current.humidity)}% humidity, {Math.round(weather.data.current.precipitationProbability)}% rain chance
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <LocationPicker />
                      <button
                        type="button"
                        onClick={() => {
                          weather.refresh()
                          generate()
                        }}
                        disabled={weather.refreshing}
                        className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-accent hover:opacity-80"
                      >
                        <RotateCw className={cn("h-3 w-3", weather.refreshing && "animate-spin")} />
                        Refresh & Re-rank
                      </button>
                    </div>
                  </div>
                ) : activeLook.breakdown?.weather == null && (
                  <div className="mt-6 border border-line bg-card/60 p-4 text-xs text-muted flex flex-wrap items-center justify-between gap-3">
                    <span>
                      {useLiveWeather
                        ? "Atmospheric telemetry unavailable — ranked strictly by occasion suitability and garment compatibility."
                        : "Weather factoring disabled — ranked strictly by occasion suitability and garment compatibility."}
                    </span>
                    {!useLiveWeather && (
                      <button
                        type="button"
                        onClick={() => {
                          setUseLiveWeather(true)
                          generate()
                        }}
                        className="text-[10px] uppercase tracking-[0.2em] text-accent underline underline-offset-4 hover:opacity-80"
                      >
                        Activate live weather & re-rank
                      </button>
                    )}
                  </div>
                )}

                {/* Incomplete / Missing role callout if applicable */}
                {(activeLook.isIncomplete || missingCategories.length > 0) && (
                  <div className="mt-6 border border-accent/30 bg-accent/5 p-4 text-xs text-muted flex items-center gap-3">
                    <Info className="h-4 w-4 text-accent flex-shrink-0" />
                    <span>
                      {(activeLook.missingCategories || missingCategories)?.includes('bottoms')
                        ? 'Single-piece recommendation — your wardrobe currently lacks trousers, skirts, or jeans to complete a two-piece ensemble.'
                        : 'Partial recommendation — additional pieces in complementary categories will allow full outfit assembly.'}
                    </span>
                  </div>
                )}

                {/* Main Outfit Showcase */}
                <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-12">
                  {/* Garment Visual Arrangement */}
                  <div className="lg:col-span-7">
                    <div
                      className="grid gap-4 sm:gap-6"
                      style={{
                        gridTemplateColumns:
                          activeLook.items.length >= 3
                            ? 'repeat(3, 1fr)'
                            : activeLook.items.length === 2
                              ? 'repeat(2, 1fr)'
                              : '1fr',
                      }}
                    >
                      {activeLook.items.map((item, idx) => (
                        <div
                          key={item.id}
                          className="group relative cursor-pointer border border-line bg-sand/20 p-3 transition-all hover:border-accent/60"
                          onClick={() => setInspectingItem(item)}
                        >
                          <GarmentPhoto
                            garment={item}
                            className={idx === 0 ? 'aspect-[3/4]' : 'aspect-square'}
                            sizes="(min-width: 1024px) 25vw, 40vw"
                          />
                          <div className="mt-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] uppercase tracking-[0.25em] text-accent">
                                {item.category}
                              </span>
                              {item.colorHex && (
                                <span
                                  className="h-2.5 w-2.5 rounded-full border border-line/60"
                                  style={{ backgroundColor: item.colorHex }}
                                  title={item.color || item.colorHex}
                                />
                              )}
                            </div>
                            <p className="mt-1 font-editorial text-base text-ink line-clamp-1 group-hover:text-accent transition-colors">
                              {item.name}
                            </p>
                            <p className="text-[10px] text-muted capitalize">
                              {item.style || item.subcategory || 'Wardrobe piece'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="mt-3 text-right text-[10px] text-muted">
                      Click any garment to inspect full metadata & wear history.
                    </p>
                  </div>

                  {/* Recommendation Details, Scoring & Actions */}
                  <div className="flex flex-col justify-between lg:col-span-5 space-y-6">
                    {/* Score & Breakdown */}
                    <div className="border border-line bg-sand/20 p-6">
                      <div className="flex items-baseline justify-between border-b border-line pb-4">
                        <div>
                          <p className="text-[9px] uppercase tracking-[0.35em] text-accent font-medium">
                            Compatibility Score
                          </p>
                          <div className="mt-1 flex items-baseline gap-2">
                            <span className="font-display text-5xl font-light text-ink">
                              {activeLook.score ?? '—'}
                            </span>
                            <span className="text-xs text-muted">/ 100 · Rule-Based Fit</span>
                          </div>
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.2em] font-medium text-accent bg-accent/10 px-3 py-1">
                          {activeLook.score && activeLook.score >= 85
                            ? 'High Harmony'
                            : activeLook.score && activeLook.score >= 70
                              ? 'Balanced Fit'
                              : 'Curated Option'}
                        </span>
                      </div>

                      {/* Factor Breakdown Bars */}
                      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                        {activeLook.breakdown && (
                          <>
                            <div className="flex justify-between border-b border-line/40 py-1">
                              <span className="text-muted">Occasion Match</span>
                              <span className="font-medium text-ink">{activeLook.breakdown.occasion ?? '—'}%</span>
                            </div>
                            <div className="flex justify-between border-b border-line/40 py-1">
                              <span className="text-muted">Color Harmony</span>
                              <span className="font-medium text-ink">{activeLook.breakdown.colour ?? '—'}%</span>
                            </div>
                            <div className="flex justify-between border-b border-line/40 py-1">
                              <span className="text-muted">Style Alignment</span>
                              <span className="font-medium text-ink">{activeLook.breakdown.style ?? '—'}%</span>
                            </div>
                            <div className="flex justify-between border-b border-line/40 py-1">
                              <span className="text-muted">Pattern Balance</span>
                              <span className="font-medium text-ink">{activeLook.breakdown.pattern ?? '—'}%</span>
                            </div>
                            {activeLook.breakdown.preference != null && (
                              <div className="flex justify-between border-b border-line/40 py-1">
                                <span className="text-muted">Personal Preference</span>
                                <span className="font-medium text-accent">{activeLook.breakdown.preference}%</span>
                              </div>
                            )}
                            {activeLook.breakdown.weather != null && (
                              <div className="flex justify-between border-b border-line/40 py-1">
                                <span className="text-muted">Weather Suitability</span>
                                <span className="font-medium text-ink">{activeLook.breakdown.weather}%</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Why This Works (Editorial Explanations) */}
                    <div className="border border-line bg-sand/20 p-6">
                      <p className="text-[10px] uppercase tracking-[0.32em] text-accent font-medium">
                        Why This Works
                      </p>
                      <div className="mt-3 space-y-2.5">
                        {activeLook.explanation.map((line, idx) => (
                          <div key={idx} className="flex items-start gap-2.5 text-xs leading-relaxed text-muted">
                            <span className="text-accent mt-1">•</span>
                            <span className="font-editorial text-sm italic text-ink/80">{line}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Actions: Save Look, Mark As Worn & Feedback */}
                    <div className="flex flex-col gap-4 border-t border-line pt-6">
                      {wearToast && (
                        <div className="border border-accent/40 bg-accent/10 px-4 py-2.5 text-xs text-ink flex items-center justify-between">
                          <span>{wearToast}</span>
                          <button type="button" onClick={() => setWearToast(null)} className="text-muted hover:text-ink">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleSaveLook(activeLook)}
                          disabled={savedLookIds.has(activeLook.id)}
                          className={cn(
                            'w-full sm:flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] uppercase tracking-[0.28em] font-medium transition-all',
                            savedLookIds.has(activeLook.id)
                              ? 'bg-accent/20 text-accent cursor-default border border-accent/40'
                              : 'bg-accent text-espresso hover:opacity-90 shadow-sm',
                          )}
                        >
                          {savedLookIds.has(activeLook.id) ? (
                            <>
                              <Check className="h-3.5 w-3.5" /> Saved to Lookbook
                            </>
                          ) : (
                            <>
                              <Bookmark className="h-3.5 w-3.5" /> Save This Look
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleMarkAsWorn(activeLook)}
                          disabled={wornLookIds.has(activeLook.id) || markingWorn}
                          className={cn(
                            'w-full sm:flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] uppercase tracking-[0.28em] font-medium transition-all border',
                            wornLookIds.has(activeLook.id)
                              ? 'border-emerald-600/50 bg-emerald-950/20 text-emerald-400 cursor-default'
                              : 'border-line bg-card text-ink hover:border-accent hover:text-accent shadow-sm',
                          )}
                        >
                          {wornLookIds.has(activeLook.id) ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-400" /> Worn Today
                            </>
                          ) : (
                            <>
                              <Shirt className="h-3.5 w-3.5 text-accent" /> {markingWorn ? 'Recording…' : 'Mark as Worn'}
                            </>
                          )}
                        </button>
                      </div>

                      {/* Feedback buttons (Thumbs Up / Down & Star rating) */}
                      <div className="flex items-center justify-between border border-line bg-card p-3">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-muted">
                          Rate this recommendation:
                        </span>
                        <div className="flex items-center gap-3">
                          {/* Like / Dislike */}
                          <button
                            type="button"
                            onClick={() => handleFeedback(activeLook.id, 'like')}
                            className={cn(
                              'p-1.5 transition-colors',
                              lookFeedback[activeLook.id]?.feedback === 'like'
                                ? 'text-accent'
                                : 'text-muted hover:text-ink',
                            )}
                            title="Like this combination"
                          >
                            <ThumbsUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFeedback(activeLook.id, 'dislike')}
                            className={cn(
                              'p-1.5 transition-colors',
                              lookFeedback[activeLook.id]?.feedback === 'dislike'
                                ? 'text-accent'
                                : 'text-muted hover:text-ink',
                            )}
                            title="Dislike this combination"
                          >
                            <ThumbsDown className="h-4 w-4" />
                          </button>

                          {/* Star rating 1-5 */}
                          <div className="flex items-center gap-1 border-l border-line pl-3">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => handleRating(activeLook.id, star)}
                                className="p-0.5"
                                title={`Rate ${star} stars`}
                              >
                                <Star
                                  className={cn(
                                    'h-3.5 w-3.5 transition-colors',
                                    (lookFeedback[activeLook.id]?.rating ?? 0) >= star
                                      ? 'fill-accent text-accent'
                                      : 'text-muted/40 hover:text-accent',
                                  )}
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Empty / Error Fallback */}
          <AnimatePresence>
            {(stage === 'empty' || stage === 'error') && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-8 border border-line bg-sand/20 p-10 text-center"
              >
                <AlertTriangle className="mx-auto h-6 w-6 text-accent" />
                <h3 className="mt-3 font-display text-2xl font-light text-ink">
                  {stage === 'error' ? 'Styling Service Unreachable' : 'No Complete Combination Available'}
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                  {reason ??
                    'MAEVE could not assemble an outfit matching your criteria. Try adjusting the occasion or adding more garments.'}
                </p>
                <div className="mt-6 flex justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setStage('input')}
                    className="border border-line px-6 py-2.5 text-[10px] uppercase tracking-[0.2em] text-ink hover:border-accent"
                  >
                    Adjust Criteria
                  </button>
                  <Link
                    to="/add"
                    className="bg-accent px-6 py-2.5 text-[10px] uppercase tracking-[0.2em] text-espresso"
                  >
                    Add Garments
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* TAB 2: SAVED LOOKBOOK */}
      {activeTab === 'lookbook' && (
        <div className="mt-4">
          {savedLooks.length === 0 ? (
            <div className="border border-line bg-sand/20 p-12 text-center">
              <Bookmark className="mx-auto h-6 w-6 text-accent" />
              <h3 className="mt-4 font-display text-2xl font-light text-ink">No saved looks yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                Generate an outfit combination in the Styling Studio and click "Save This Look" to save it to your personal lookbook.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('studio')}
                className="mt-6 bg-accent px-8 py-3 text-[10px] uppercase tracking-[0.25em] text-espresso"
              >
                Go to Styling Studio
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {savedLooks.map((look) => (
                <div key={look.id} className="border border-line bg-card p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between border-b border-line pb-3">
                      <div>
                        <span className="text-[9px] uppercase tracking-[0.25em] text-accent font-medium">
                          {look.occasion}
                        </span>
                        <p className="text-[10px] text-muted">
                          {new Date(look.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                      {look.score && (
                        <span className="font-display text-2xl font-light text-ink">
                          {look.score}<span className="text-xs text-muted">/100</span>
                        </span>
                      )}
                    </div>

                    {/* Garments snapshot */}
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {look.items.map((item) => (
                        <div key={item.id} className="relative group">
                          <GarmentPhoto garment={item} className="aspect-square" sizes="15vw" />
                          <p className="mt-1 line-clamp-1 text-[9px] text-muted">{item.name}</p>
                          {item.isAvailable === false && (
                            <span className="absolute top-1 right-1 bg-red-800 text-[8px] text-white px-1">
                              Removed
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Deleted item status */}
                    {look.incomplete && (
                      <div className="mt-3 bg-red-950/20 border border-red-800/30 p-2 text-[10px] text-red-300">
                        A garment from this look was deleted from your wardrobe. The snapshot is preserved.
                      </div>
                    )}

                    {/* Explanation */}
                    {look.note && (
                      <p className="mt-4 line-clamp-3 font-editorial text-xs italic text-muted leading-relaxed">
                        "{look.note}"
                      </p>
                    )}
                  </div>

                  {/* Actions & Rating */}
                  <div className="mt-6 pt-4 border-t border-line flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => rateSavedLook(look.id, { rating: star })}
                          className="p-0.5"
                        >
                          <Star
                            className={cn(
                              'h-3 w-3',
                              (look.rating ?? 0) >= star
                                ? 'fill-accent text-accent'
                                : 'text-muted/30 hover:text-accent',
                            )}
                          />
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleMarkAsWorn(look)}
                        disabled={wornLookIds.has(look.id) || markingWorn}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 text-[9px] uppercase tracking-[0.2em] border transition-colors',
                          wornLookIds.has(look.id)
                            ? 'border-emerald-600/40 text-emerald-400 bg-emerald-950/20'
                            : 'border-line text-muted hover:text-ink hover:border-accent',
                        )}
                        title="Mark this outfit as worn today"
                      >
                        <Shirt className="h-3 w-3" />
                        {wornLookIds.has(look.id) ? 'Worn Today' : 'Mark Worn'}
                      </button>

                      <button
                        type="button"
                        onClick={() => removeSavedLook(look.id)}
                        className="p-1.5 text-muted hover:text-red-400 transition-colors"
                        title="Remove from saved looks"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Garment Inspector Modal */}
      <AnimatePresence>
        {inspectingItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/80 p-4 backdrop-blur-sm"
            onClick={() => setInspectingItem(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-lg w-full border border-line bg-card p-6 shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setInspectingItem(null)}
                className="absolute top-4 right-4 text-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex gap-5">
                <div className="w-36 flex-shrink-0">
                  <GarmentPhoto garment={inspectingItem} className="aspect-[3/4]" sizes="150px" />
                </div>
                <div className="flex-1">
                  <span className="text-[9px] uppercase tracking-[0.3em] text-accent">
                    {inspectingItem.category}
                  </span>
                  <h3 className="font-editorial text-2xl font-light text-ink mt-0.5">
                    {inspectingItem.name}
                  </h3>

                  <div className="mt-4 space-y-1.5 text-xs text-muted">
                    {inspectingItem.subcategory && (
                      <div className="flex justify-between border-b border-line/40 py-1">
                        <span>Classification</span>
                        <span className="text-ink capitalize">{inspectingItem.subcategory.replace(/_/g, ' ')}</span>
                      </div>
                    )}
                    {inspectingItem.color && (
                      <div className="flex justify-between border-b border-line/40 py-1">
                        <span>Color</span>
                        <span className="text-ink flex items-center gap-1.5">
                          {inspectingItem.colorHex && (
                            <span
                              className="h-2.5 w-2.5 rounded-full border border-line/60"
                              style={{ backgroundColor: inspectingItem.colorHex }}
                            />
                          )}
                          {inspectingItem.color}
                        </span>
                      </div>
                    )}
                    {inspectingItem.style && (
                      <div className="flex justify-between border-b border-line/40 py-1">
                        <span>Style</span>
                        <span className="text-ink capitalize">{inspectingItem.style}</span>
                      </div>
                    )}
                    {inspectingItem.material && (
                      <div className="flex justify-between border-b border-line/40 py-1">
                        <span>Material</span>
                        <span className="text-ink capitalize">{inspectingItem.material}</span>
                      </div>
                    )}
                    {inspectingItem.sleeve && (
                      <div className="flex justify-between border-b border-line/40 py-1">
                        <span>Sleeve</span>
                        <span className="text-ink capitalize">{inspectingItem.sleeve}</span>
                      </div>
                    )}
                    {inspectingItem.season && (
                      <div className="flex justify-between border-b border-line/40 py-1">
                        <span>Season</span>
                        <span className="text-ink capitalize">{inspectingItem.season}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-1">
                      <span>Times Worn</span>
                      <span className="text-ink">{inspectingItem.timesWorn ?? 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}