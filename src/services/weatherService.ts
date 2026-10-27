/**
 * Live weather service — Open-Meteo (public, no API key required).
 *
 * MAEVE components never touch this layer directly; they consume the
 * normalised model through the WeatherProvider/useWeather hook. No secret
 * keys live in the frontend.
 */

import {
  isWeatherStale,
  weatherFromCode,
} from '../lib/weather'
import type {
  WeatherData,
  WeatherHour,
  WeatherDay,
  WeatherCurrent,
  WeatherLocation,
} from '../lib/weather'

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const REVERSE_GEOCODING_URL =
  'https://api.bigdatacloud.net/data/reverse-geocode-client'

const CURRENT_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'precipitation_probability',
  'weather_code',
  'wind_speed_10m',
].join(',')

const HOURLY_FIELDS = ['temperature_2m', 'precipitation_probability'].join(',')
const DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
].join(',')

interface OpenMeteoCurrent {
  time?: string
  temperature_2m?: number
  apparent_temperature?: number
  relative_humidity_2m?: number
  precipitation_probability?: number
  weather_code?: number
  wind_speed_10m?: number
}

interface OpenMeteoResponse {
  current?: OpenMeteoCurrent
  hourly?: {
    time: string[]
    temperature_2m: number[]
    precipitation_probability: number[]
  }
  daily?: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: number[]
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'omit', headers: { accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`Weather request failed (${response.status}).`)
  }
  return (await response.json()) as T
}

function parseTime(iso: string | undefined, fallback: number): number {
  if (!iso) return fallback
  const parsed = Date.parse(iso)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toCurrent(current: OpenMeteoCurrent | undefined): WeatherCurrent {
  const entry = weatherFromCode(current?.weather_code)
  return {
    temperature: current?.temperature_2m ?? 0,
    feelsLike: current?.apparent_temperature ?? current?.temperature_2m ?? 0,
    humidity: current?.relative_humidity_2m ?? 0,
    precipitationProbability: current?.precipitation_probability ?? 0,
    windSpeed: current?.wind_speed_10m ?? 0,
    condition: entry.condition,
    icon: entry.icon,
  }
}

function toHourly(payload: OpenMeteoResponse, now: number): WeatherHour[] {
  const hourly = payload.hourly
  if (!hourly) return []
  const firstDayCodes = payload.daily?.weather_code ?? []
  return hourly.time.slice(0, 12).map((time, index) => ({
    time: parseTime(time, now),
    temperature: hourly.temperature_2m[index] ?? 0,
    precipitationProbability: hourly.precipitation_probability[index] ?? 0,
    icon: weatherFromCode(firstDayCodes[0]).icon,
  }))
}

function toDaily(payload: OpenMeteoResponse, now: number): WeatherDay[] {
  const daily = payload.daily
  if (!daily) return []
  return daily.time.slice(0, 7).map((date, index) => {
    const entry = weatherFromCode(daily.weather_code[index])
    return {
      date: parseTime(date, now),
      temperatureMax: daily.temperature_2m_max[index] ?? 0,
      temperatureMin: daily.temperature_2m_min[index] ?? 0,
      precipitationProbability: daily.precipitation_probability_max[index] ?? 0,
      condition: entry.condition,
      icon: entry.icon,
    }
  })
}

function coordsOnlyLocation(latitude: number, longitude: number): WeatherLocation {
  return { name: '', region: '', country: '', latitude, longitude }
}

async function fetchForecast(latitude: number, longitude: number): Promise<OpenMeteoResponse> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: CURRENT_FIELDS,
    hourly: HOURLY_FIELDS,
    daily: DAILY_FIELDS,
    forecast_hours: '24',
    forecast_days: '7',
    timezone: 'auto',
  })
  return fetchJson<OpenMeteoResponse>(`${FORECAST_URL}?${params.toString()}`)
}

/**
 * Full normalised forecast for coordinates. Hourly is the next 12 hours,
 * daily is the next 7 days. Location fields are left blank — the provider
 * merges the user's chosen location on top.
 */
export async function getForecast(
  latitude: number,
  longitude: number,
  now: number = Date.now(),
): Promise<WeatherData> {
  // First try backend weather proxy with server-side caching and normalization
  try {
    const res = await fetch(
      `/api/weather?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`,
      {
        credentials: 'omit',
        headers: { accept: 'application/json' },
      },
    )
    if (res.ok) {
      const json = await res.json()
      if (json?.success && json?.weather) {
        return json.weather as WeatherData
      }
    }
  } catch {
    // Backend unreachable, fallback to direct Open-Meteo
  }

  const payload = await fetchForecast(latitude, longitude)
  return {
    location: coordsOnlyLocation(latitude, longitude),
    current: toCurrent(payload.current),
    hourly: toHourly(payload, now),
    daily: toDaily(payload, now),
    updatedAt: now,
  }
}

/**
 * Just the current conditions for coordinates. Uses the same upstream
 * endpoint so the weather controls are identical.
 */
export async function getCurrentWeather(
  latitude: number,
  longitude: number,
): Promise<WeatherCurrent> {
  const payload = await fetchForecast(latitude, longitude)
  return toCurrent(payload.current)
}

/** City search backing the "Choose your location" flow. */
export async function searchLocations(query: string): Promise<WeatherLocation[]> {
  const trimmed = query.trim()
  if (!trimmed || trimmed.length < 2) return []

  // Try backend proxy first
  try {
    const res = await fetch(`/api/weather/search?q=${encodeURIComponent(trimmed)}`, {
      credentials: 'omit',
      headers: { accept: 'application/json' },
    })
    if (res.ok) {
      const json = await res.json()
      if (json?.success && Array.isArray(json?.results)) {
        return json.results as WeatherLocation[]
      }
    }
  } catch {
    // Backend proxy unavailable, fallback to direct Open-Meteo
  }

  const params = new URLSearchParams({
    name: trimmed,
    count: '6',
    language: 'en',
    format: 'json',
  })
  const payload = await fetchJson<{ results?: Array<Record<string, unknown>> }>(
    `${GEOCODING_URL}?${params.toString()}`,
  )
  if (!payload.results) return []
  return payload.results
    .map((row) => ({
      name: typeof row.name === 'string' ? row.name : String(row.id ?? ''),
      region:
        typeof row.admin1 === 'string'
          ? row.admin1
          : typeof row.admin2 === 'string'
            ? row.admin2
            : '',
      country: typeof row.country === 'string' ? row.country : '',
      latitude: typeof row.latitude === 'number' ? row.latitude : 0,
      longitude: typeof row.longitude === 'number' ? row.longitude : 0,
    }))
    .filter((candidate) => candidate.name && candidate.latitude && candidate.longitude)
}

/** Reverse geocoding used when the user grants browser location. */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<{ name: string; region: string; country: string }> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    localityLanguage: 'en',
  })
  const payload = await fetchJson<{
    city?: string
    locality?: string
    principalSubdivision?: string
    countryName?: string
  }>(`${REVERSE_GEOCODING_URL}?${params.toString()}`)
  return {
    name: payload.city || payload.locality || 'Current location',
    region: payload.principalSubdivision || '',
    country: payload.countryName || '',
  }
}

/** Whether an existing cache entry is still fresh enough to trust. */
export { isWeatherStale }