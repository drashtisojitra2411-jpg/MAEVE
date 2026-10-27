import type { WeatherData } from './weather'
import type { WeatherSnapshot } from '../types'

/**
 * Collapse live weather into the compact snapshot the styling engine accepts.
 * Returns null while weather is loading/errored/denied — the engine then
 * simply styles by occasion and preference (honestly, without weather data).
 */
export function liveWeatherSnapshot(weather: {
  status: string
  data: WeatherData | null
}): WeatherSnapshot | null {
  if (weather.status !== 'ready' || !weather.data) return null
  const { data } = weather
  return {
    locationName: data.location?.name ?? null,
    temperature: data.current?.temperature ?? null,
    feelsLike: data.current?.feelsLike ?? null,
    humidity: data.current?.humidity ?? null,
    precipitationProbability: data.current?.precipitationProbability ?? null,
    windSpeed: data.current?.windSpeed ?? null,
    condition: data.current?.condition ?? null,
    icon: data.current?.icon ?? null,
    updatedAt: data.updatedAt ?? null,
  }
}