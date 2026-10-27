import { MapPin, RotateCw } from 'lucide-react'
import { useWeather } from '../../lib/weather-context'
import { ageLabel, formatTemperature, roundHumidity } from '../../lib/weather'
import { weatherIcons } from '../../lib/weatherIcons'
import { WeatherSkeleton } from '../loading/WeatherSkeleton'
import { LocationPicker } from './LocationPicker'

/**
 * The dashboard/weather column. Owns every weather state — live read,
 * skeletons, cached-with-last-updated, unavailable, and the location prompt.
 */
export function WeatherBlock() {
  const { status, data, location, isCached, refreshing, error, refresh } = useWeather()

  if ((status === 'loading' || status === 'locating') && !data) {
    return <WeatherSkeleton />
  }

  if (!data && status === 'denied') {
    return (
      <div className="w-full max-w-sm border border-line bg-surface/70 p-6 text-left">
        <p className="text-[10px] uppercase tracking-[0.25em] text-accent">
          Choose your location
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          MAEVE needs to know where you are to style you for today&apos;s conditions.
        </p>
        <div className="mt-5">
          <LocationPicker />
        </div>
      </div>
    )
  }

  if (!data && status === 'error') {
    return (
      <div className="w-full max-w-sm border border-line bg-surface/70 p-6 text-left">
        <p className="text-[10px] uppercase tracking-[0.25em] text-accent">
          Weather unavailable
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          MAEVE couldn&apos;t retrieve the latest conditions.
        </p>
        <button
          type="button"
          onClick={refresh}
          className="mt-4 inline-flex items-center gap-2 border border-accent/50 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent-soft"
        >
          <RotateCw className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          Try again
        </button>
        {error ? <p className="mt-3 text-[10px] text-muted/60">{error}</p> : null}
      </div>
    )
  }

  if (!data) return <WeatherSkeleton />

  const current = data.current
  const WeatherIcon = weatherIcons[current.icon]
  const placeName = location?.name || data.location.name || 'Your location'
  const updatedLabel = isCached ? 'Last updated' : 'Updated'

  return (
    <div className="flex flex-col items-end gap-2 text-right">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.3em] text-accent">
        <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        {placeName}.
      </p>

      <p className="flex items-center justify-end gap-2">
        <WeatherIcon className="h-4 w-4 text-accent" strokeWidth={1.5} aria-hidden="true" />
        <span className="text-sm">
          <span className="font-editorial text-ink">TODAY {formatTemperature(current.temperature)}°</span>
          <span className="text-muted"> · {current.condition}</span>
        </span>
      </p>

      <p className="text-[10px] uppercase tracking-[0.22em] text-muted">
        Feels like {formatTemperature(current.feelsLike)}°
      </p>
      <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted">
        {roundHumidity(current.humidity)}% humidity
      </p>
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted">
        {Math.round(current.precipitationProbability)}% chance of rain
      </p>

      <div className="mt-3 flex items-center gap-2">
        <span className={cnAgeLabel(isCached, refreshing)}>
          {updatedLabel} {ageLabel(data.updatedAt)}
        </span>
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh weather"
          className="flex h-6 w-6 items-center justify-center text-muted transition-colors hover:text-accent"
        >
          <RotateCw
            className={`h-3.5 w-3.5 transition-transform duration-700 ${refreshing ? 'rotate-180 text-accent' : ''}`}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  )
}

function cnAgeLabel(isCached: boolean, refreshing: boolean): string {
  const base =
    'text-[9px] uppercase tracking-[0.2em] transition-colors duration-500 '
  if (refreshing) return base + 'text-accent'
  return base + (isCached ? 'text-muted/70' : 'text-muted')
}