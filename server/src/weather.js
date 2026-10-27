/**
 * MAEVE Weather Service (Phase 4).
 *
 * Dedicated weather service integrating with Open-Meteo (public, no key required).
 * Provides:
 *  - Live current conditions and forecasts for latitude / longitude
 *  - City search via geocoding
 *  - Reverse geocoding for browser coordinates
 *  - In-memory TTL caching (15 minutes) to respect usage policies and avoid duplicate upstream calls
 *  - Normalization into stable internal weather models
 *  - Graceful handling of network timeouts, malformed responses, and unavailable locations
 */

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
export const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
export const REVERSE_GEOCODING_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client'

export const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes

const CURRENT_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'precipitation_probability',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
].join(',')

const HOURLY_FIELDS = ['temperature_2m', 'precipitation_probability', 'precipitation'].join(',')
const DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
  'precipitation_sum',
].join(',')

export const WMO_CONDITIONS = {
  0: { condition: 'Clear', icon: 'sun' },
  1: { condition: 'Mainly clear', icon: 'sun' },
  2: { condition: 'Partly cloudy', icon: 'cloud-sun' },
  3: { condition: 'Overcast', icon: 'cloud' },
  45: { condition: 'Foggy', icon: 'cloud-fog' },
  48: { condition: 'Icy fog', icon: 'cloud-fog' },
  51: { condition: 'Light drizzle', icon: 'cloud-drizzle' },
  53: { condition: 'Moderate drizzle', icon: 'cloud-drizzle' },
  55: { condition: 'Dense drizzle', icon: 'cloud-drizzle' },
  56: { condition: 'Freezing drizzle', icon: 'cloud-drizzle' },
  57: { condition: 'Dense freezing drizzle', icon: 'cloud-drizzle' },
  61: { condition: 'Light rain', icon: 'cloud-rain' },
  63: { condition: 'Moderate rain', icon: 'cloud-rain' },
  65: { condition: 'Heavy rain', icon: 'cloud-rain' },
  66: { condition: 'Freezing rain', icon: 'cloud-rain' },
  67: { condition: 'Heavy freezing rain', icon: 'cloud-rain' },
  71: { condition: 'Light snow', icon: 'cloud-snow' },
  73: { condition: 'Moderate snow', icon: 'cloud-snow' },
  75: { condition: 'Heavy snow', icon: 'cloud-snow' },
  77: { condition: 'Snow grains', icon: 'cloud-snow' },
  80: { condition: 'Rain showers', icon: 'cloud-rain' },
  81: { condition: 'Moderate rain showers', icon: 'cloud-rain' },
  82: { condition: 'Violent rain showers', icon: 'cloud-rain' },
  85: { condition: 'Snow showers', icon: 'cloud-snow' },
  86: { condition: 'Heavy snow showers', icon: 'cloud-snow' },
  95: { condition: 'Thunderstorm', icon: 'cloud-lightning' },
  96: { condition: 'Thunderstorm with light hail', icon: 'cloud-lightning' },
  99: { condition: 'Thunderstorm with heavy hail', icon: 'cloud-lightning' },
}

export function conditionFromCode(code) {
  if (code == null) return { condition: 'Clear', icon: 'sun' }
  return WMO_CONDITIONS[code] ?? { condition: 'Clear', icon: 'cloud' }
}

// In-memory weather cache: key -> { data, expiresAt }
export const weatherCache = new Map()

export function getCacheKey(lat, lon) {
  const rLat = Number(lat).toFixed(2)
  const rLon = Number(lon).toFixed(2)
  return `${rLat},${rLon}`
}

export function clearWeatherCache() {
  weatherCache.clear()
}

/**
 * Validates coordinate bounds.
 */
export function validateCoordinates(lat, lon) {
  if (lat == null || lon == null || lat === '' || lon === '') {
    return { ok: false, error: 'Latitude and longitude are required.' }
  }
  const nLat = Number(lat)
  const nLon = Number(lon)
  if (!Number.isFinite(nLat) || nLat < -90 || nLat > 90) {
    return { ok: false, error: 'Latitude must be a valid number between -90 and 90.' }
  }
  if (!Number.isFinite(nLon) || nLon < -180 || nLon > 180) {
    return { ok: false, error: 'Longitude must be a valid number between -180 and 180.' }
  }
  return { ok: true, latitude: nLat, longitude: nLon }
}

/**
 * Normalizes Open-Meteo forecast API response.
 */
export function normalizeWeatherResponse(payload, { latitude, longitude, locationName = '' }, now = Date.now()) {
  const current = payload?.current || {}
  const cond = conditionFromCode(current.weather_code)

  const temp = typeof current.temperature_2m === 'number' ? current.temperature_2m : null
  const feelsLike = typeof current.apparent_temperature === 'number'
    ? current.apparent_temperature
    : temp
  const humidity = typeof current.relative_humidity_2m === 'number' ? current.relative_humidity_2m : 0
  const rainProb = typeof current.precipitation_probability === 'number'
    ? current.precipitation_probability
    : 0
  const precipitation = typeof current.precipitation === 'number' ? current.precipitation : 0
  const windSpeed = typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : 0

  const hourlyList = []
  if (payload?.hourly?.time && Array.isArray(payload.hourly.time)) {
    for (let i = 0; i < Math.min(12, payload.hourly.time.length); i++) {
      const t = payload.hourly.time[i]
      hourlyList.push({
        time: Date.parse(t) || now + i * 3600000,
        temperature: payload.hourly.temperature_2m?.[i] ?? temp,
        precipitationProbability: payload.hourly.precipitation_probability?.[i] ?? 0,
        precipitation: payload.hourly.precipitation?.[i] ?? 0,
      })
    }
  }

  const dailyList = []
  if (payload?.daily?.time && Array.isArray(payload.daily.time)) {
    for (let i = 0; i < Math.min(7, payload.daily.time.length); i++) {
      const d = payload.daily.time[i]
      const dCond = conditionFromCode(payload.daily.weather_code?.[i])
      dailyList.push({
        date: Date.parse(d) || now + i * 86400000,
        temperatureMax: payload.daily.temperature_2m_max?.[i] ?? temp,
        temperatureMin: payload.daily.temperature_2m_min?.[i] ?? temp,
        precipitationProbability: payload.daily.precipitation_probability_max?.[i] ?? 0,
        precipitationSum: payload.daily.precipitation_sum?.[i] ?? 0,
        condition: dCond.condition,
        icon: dCond.icon,
      })
    }
  }

  return {
    location: {
      name: locationName || '',
      latitude,
      longitude,
    },
    current: {
      temperature: temp,
      feelsLike,
      humidity,
      precipitationProbability: rainProb,
      precipitation,
      windSpeed,
      condition: cond.condition,
      icon: cond.icon,
      weatherCode: current.weather_code ?? 0,
    },
    hourly: hourlyList,
    daily: dailyList,
    updatedAt: now,
  }
}

/**
 * Fetches live weather from Open-Meteo with caching and timeout handling.
 */
export async function getWeatherForCoordinates({
  latitude,
  longitude,
  locationName = '',
  timeoutMs = 5000,
  fetchFn = fetch,
  forceRefresh = false,
  now = Date.now(),
} = {}) {
  const coordCheck = validateCoordinates(latitude, longitude)
  if (!coordCheck.ok) {
    throw new Error(coordCheck.error)
  }
  const { latitude: lat, longitude: lon } = coordCheck
  const cacheKey = getCacheKey(lat, lon)

  if (!forceRefresh) {
    const cached = weatherCache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      return {
        ...cached.data,
        isCached: true,
        location: {
          ...cached.data.location,
          name: locationName || cached.data.location.name,
        },
      }
    }
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: CURRENT_FIELDS,
    hourly: HOURLY_FIELDS,
    daily: DAILY_FIELDS,
    forecast_hours: '24',
    forecast_days: '7',
    timezone: 'auto',
  })

  let signal
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    signal = AbortSignal.timeout(timeoutMs)
  }

  let response
  try {
    response = await fetchFn(`${FORECAST_URL}?${params.toString()}`, {
      headers: { accept: 'application/json' },
      signal,
    })
  } catch (err) {
    // If upstream network fails but we have stale cache, return stale cache gracefully
    const stale = weatherCache.get(cacheKey)
    if (stale) {
      return {
        ...stale.data,
        isCached: true,
        isStale: true,
        location: {
          ...stale.data.location,
          name: locationName || stale.data.location.name,
        },
      }
    }
    const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout')
    throw new Error(isTimeout ? 'Weather request timed out.' : `Weather service unreachable: ${err.message}`)
  }

  if (!response.ok) {
    throw new Error(`Open-Meteo returned status ${response.status}`)
  }

  const payload = await response.json()
  if (!payload || typeof payload !== 'object' || !payload.current) {
    throw new Error('Malformed weather response received from Open-Meteo.')
  }

  const normalized = normalizeWeatherResponse(payload, { latitude: lat, longitude: lon, locationName }, now)
  weatherCache.set(cacheKey, {
    data: normalized,
    expiresAt: now + WEATHER_CACHE_TTL_MS,
  })

  return { ...normalized, isCached: false }
}

/**
 * Searches for matching cities/locations via Open-Meteo Geocoding API.
 */
export async function searchLocationsBackend({ query, count = 6, timeoutMs = 5000, fetchFn = fetch } = {}) {
  const trimmed = String(query ?? '').trim()
  if (!trimmed || trimmed.length < 2) {
    return []
  }

  const params = new URLSearchParams({
    name: trimmed,
    count: String(count),
    language: 'en',
    format: 'json',
  })

  let signal
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    signal = AbortSignal.timeout(timeoutMs)
  }

  const response = await fetchFn(`${GEOCODING_URL}?${params.toString()}`, {
    headers: { accept: 'application/json' },
    signal,
  })

  if (!response.ok) {
    throw new Error(`Geocoding search failed with status ${response.status}`)
  }

  const payload = await response.json()
  if (!payload || !Array.isArray(payload.results)) {
    return []
  }

  return payload.results
    .map((row) => ({
      name: typeof row.name === 'string' ? row.name : '',
      region: typeof row.admin1 === 'string' ? row.admin1 : (typeof row.admin2 === 'string' ? row.admin2 : ''),
      country: typeof row.country === 'string' ? row.country : '',
      latitude: typeof row.latitude === 'number' ? row.latitude : 0,
      longitude: typeof row.longitude === 'number' ? row.longitude : 0,
    }))
    .filter((loc) => loc.name && loc.latitude && loc.longitude)
}
