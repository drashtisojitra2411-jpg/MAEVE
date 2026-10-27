import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, LocateFixed, MapPin, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '../../lib/cn'
import { maeveEase } from '../../lib/motion'
import { useWeather } from '../../lib/weather-context'
import type { WeatherLocation } from '../../lib/weather'

interface LocationPickerProps {
  align?: 'left' | 'right'
}

/**
 * Persisted-location control: shows the active location and opens the
 * city-search chooser plus the "use my current location" action.
 */
export function LocationPicker({ align = 'left' }: LocationPickerProps) {
  const { location, searchLocations, selectLocation, enableCurrentLocation } = useWeather()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<WeatherLocation[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    const trimmed = query.trim()
    const timer = window.setTimeout(async () => {
      if (trimmed.length < 2) {
        setResults([])
        setSearched(false)
        setSearching(false)
        return
      }
      setSearching(true)
      try {
        const found = await searchLocations(trimmed)
        setResults(found)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
        setSearched(true)
      }
    }, trimmed.length < 2 ? 0 : 350)
    return () => window.clearTimeout(timer)
  }, [query, searchLocations])

  const triggerLabel = location
    ? location.country
      ? `${location.name}, ${location.country}`
      : location.name
    : 'Choose your location'

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 border border-accent/50 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent-soft"
      >
        <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        <span className="max-w-48 truncate">{triggerLabel}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform duration-500', open && 'rotate-180')}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.35, ease: maeveEase }}
            role="dialog"
            aria-label="Choose your location"
            className={cn(
              'absolute z-40 mt-2 w-80 max-w-[calc(100vw-3rem)] border border-line bg-surface p-5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.35)]',
              align === 'right' ? 'right-0' : 'left-0',
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.25em] text-accent">
                Choose your location
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close location picker"
                className="flex h-7 w-7 items-center justify-center text-muted hover:text-ink"
              >
                <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setOpen(false)
                enableCurrentLocation()
              }}
              className="mt-4 flex w-full items-center gap-2 border border-line px-3 py-2.5 text-[10px] uppercase tracking-[0.18em] text-ink/80 transition-colors hover:border-accent/50 hover:text-accent"
            >
              <LocateFixed className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              Use my current location
            </button>

            <label className="mt-4 block">
              <span className="text-[9px] uppercase tracking-[0.2em] text-muted">
                Search for a city
              </span>
              <span className="mt-2 flex items-center gap-2 border-b border-line-strong pb-2 focus-within:border-accent/60">
                <Search className="h-3.5 w-3.5 text-muted" strokeWidth={1.5} aria-hidden="true" />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ahmedabad, London, New York…"
                  className="w-full bg-transparent text-sm text-ink placeholder:text-muted/50 focus:outline-none"
                  autoFocus
                />
              </span>
            </label>

            <div className="mt-3 max-h-56 overflow-y-auto">
              {searching ? (
                <p className="px-1 py-3 text-[10px] uppercase tracking-[0.2em] text-muted/60">
                  Searching…
                </p>
              ) : results.length > 0 ? (
                <ul className="space-y-1">
                  {results.map((result) => (
                    <li key={`${result.latitude}-${result.longitude}`}>
                      <button
                        type="button"
                        onClick={() => {
                          selectLocation(result)
                          setOpen(false)
                        }}
                        className="flex w-full items-baseline justify-between gap-2 border-b border-line py-2.5 text-left transition-colors hover:text-accent"
                      >
                        <span className="text-sm text-ink">{result.name}</span>
                        <span className="text-[10px] uppercase tracking-[0.15em] text-muted">
                          {[result.region, result.country].filter(Boolean).join(', ')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : searched ? (
                <p className="px-1 py-3 text-[10px] uppercase tracking-[0.2em] text-muted/60">
                  No places found. Try another name.
                </p>
              ) : (
                <p className="px-1 py-3 text-[10px] uppercase tracking-[0.2em] text-muted/40">
                  Type at least two characters.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}