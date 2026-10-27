/**
 * Normalised weather model for MAEVE.
 *
 * All weather data flowing through the UI uses this shape. Consumers never
 * see the upstream provider (Open-Meteo) response — the service layer maps
 * it here and the WeatherProvider enriches it with the user's chosen
 * location.
 */

export type WeatherIconKey =
  | 'sun'
  | 'cloud-sun'
  | 'cloud'
  | 'cloud-fog'
  | 'cloud-drizzle'
  | 'cloud-rain'
  | 'cloud-snow'
  | 'cloud-lightning'
  | 'wind'

export interface WeatherLocation {
  name: string
  region: string
  country: string
  latitude: number
  longitude: number
}

export interface WeatherCurrent {
  temperature: number
  feelsLike: number
  humidity: number
  precipitationProbability: number
  windSpeed: number
  condition: string
  icon: WeatherIconKey
}

export interface WeatherHour {
  /** Epoch ms */
  time: number
  temperature: number
  precipitationProbability: number
  icon: WeatherIconKey
}

export interface WeatherDay {
  /** Epoch ms at the start of the day */
  date: number
  temperatureMax: number
  temperatureMin: number
  precipitationProbability: number
  condition: string
  icon: WeatherIconKey
}

export interface WeatherData {
  location: WeatherLocation
  current: WeatherCurrent
  hourly: WeatherHour[]
  daily: WeatherDay[]
  /** Epoch ms when this data was last fetched from the live source. */
  updatedAt: number
}

/** How fresh live data may be before it is treated as a stale cache. */
export const WEATHER_FRESH_MS = 10 * 60 * 1000

interface WmoEntry {
  condition: string
  icon: WeatherIconKey
}

/** WMO weather codes → human condition + minimal thin icon. */
const WMO_TABLE: Record<number, WmoEntry> = {
  0: { condition: 'Clear', icon: 'sun' },
  1: { condition: 'Mainly clear', icon: 'sun' },
  2: { condition: 'Partly cloudy', icon: 'cloud-sun' },
  3: { condition: 'Overcast', icon: 'cloud' },
  45: { condition: 'Foggy', icon: 'cloud-fog' },
  48: { condition: 'Icy fog', icon: 'cloud-fog' },
  51: { condition: 'Drizzle', icon: 'cloud-drizzle' },
  53: { condition: 'Drizzle', icon: 'cloud-drizzle' },
  55: { condition: 'Drizzle', icon: 'cloud-drizzle' },
  56: { condition: 'Freezing drizzle', icon: 'cloud-drizzle' },
  57: { condition: 'Freezing drizzle', icon: 'cloud-drizzle' },
  61: { condition: 'Light rain', icon: 'cloud-rain' },
  63: { condition: 'Rain', icon: 'cloud-rain' },
  65: { condition: 'Heavy rain', icon: 'cloud-rain' },
  66: { condition: 'Freezing rain', icon: 'cloud-rain' },
  67: { condition: 'Freezing rain', icon: 'cloud-rain' },
  71: { condition: 'Light snow', icon: 'cloud-snow' },
  73: { condition: 'Snow', icon: 'cloud-snow' },
  75: { condition: 'Heavy snow', icon: 'cloud-snow' },
  77: { condition: 'Snow grains', icon: 'cloud-snow' },
  80: { condition: 'Rain showers', icon: 'cloud-rain' },
  81: { condition: 'Rain showers', icon: 'cloud-rain' },
  82: { condition: 'Violent showers', icon: 'cloud-rain' },
  85: { condition: 'Snow showers', icon: 'cloud-snow' },
  86: { condition: 'Snow showers', icon: 'cloud-snow' },
  95: { condition: 'Thunderstorm', icon: 'cloud-lightning' },
  96: { condition: 'Thunderstorm', icon: 'cloud-lightning' },
  99: { condition: 'Thunderstorm', icon: 'cloud-lightning' },
}

const fallbackEntry: WmoEntry = { condition: 'Weather', icon: 'cloud' }

export function weatherFromCode(code: number | undefined | null): WmoEntry {
  if (code == null) return fallbackEntry
  return WMO_TABLE[code] ?? fallbackEntry
}

export function formatTemperature(value: number | undefined | null): string {
  const rounded = Math.round(value ?? 0)
  return String(rounded)
}

/** "UPDATED 4 MIN AGO" style label for a fetch timestamp. */
export function ageLabel(updatedAt: number, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - updatedAt) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function isWeatherStale(updatedAt: number, now: number = Date.now()): boolean {
  return now - updatedAt > WEATHER_FRESH_MS
}

export function roundHumidity(value: number | undefined | null): string {
  return String(Math.round(value ?? 0))
}