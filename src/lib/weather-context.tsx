import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  getForecast,
  reverseGeocode,
  searchLocations as searchLocationsService,
} from '../services/weatherService'
import { getProfile, putProfile } from '../services/looksApi'
import { isWeatherStale, WEATHER_FRESH_MS } from './weather'
import type { WeatherData, WeatherLocation } from './weather'

export type SavedLocation = WeatherLocation

export type WeatherStatus = 'loading' | 'ready' | 'error' | 'locating' | 'denied'

interface WeatherContextValue {
  status: WeatherStatus
  data: WeatherData | null
  location: SavedLocation | null
  /** True when the view is showing locally cached data because live refresh failed or is pending. */
  isCached: boolean
  refreshing: boolean
  error: string | null
  refresh: () => void
  selectLocation: (location: SavedLocation) => void
  enableCurrentLocation: () => void
  searchLocations: (query: string) => Promise<WeatherLocation[]>
}

const WeatherContext = createContext<WeatherContextValue | undefined>(undefined)

const LOCATION_KEY = 'maeve-location'
const CACHE_KEY = 'maeve-weather-cache'

function readSavedLocation(): SavedLocation | null {
  try {
    const raw = localStorage.getItem(LOCATION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.name === 'string' &&
      typeof parsed.latitude === 'number' &&
      typeof parsed.longitude === 'number'
    ) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

function persistSavedLocation(location: SavedLocation | null) {
  try {
    if (location) localStorage.setItem(LOCATION_KEY, JSON.stringify(location))
    else localStorage.removeItem(LOCATION_KEY)
  } catch {
    /* storage unavailable */
  }
}

function readCachedWeather(): WeatherData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WeatherData
    if (parsed && parsed.current && typeof parsed.updatedAt === 'number') return parsed
    return null
  } catch {
    return null
  }
}

function persistCachedWeather(data: WeatherData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    /* storage unavailable */
  }
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to reach the weather service.'
}

/**
 * Best-effort mirror of the chosen location onto the user's backend profile,
 * so the selection survives a different device/browser. Merges the existing
 * profile (which may already hold style/comfort/theme) instead of clobbering it.
 */
function persistProfileLocation(location: SavedLocation | null): void {
  void (async () => {
    try {
      const existing = (await getProfile()) ?? {}
      await putProfile({
        ...existing,
        location: location
          ? {
              name: location.name,
              region: location.region ?? '',
              country: location.country ?? '',
              latitude: location.latitude,
              longitude: location.longitude,
            }
          : null,
      })
    } catch {
      /* offline — the location stays on this device */
    }
  })()
}

export function WeatherProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WeatherStatus>('loading')
  const [data, setData] = useState<WeatherData | null>(null)
  const [location, setLocation] = useState<SavedLocation | null>(null)
  const [isCached, setIsCached] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dataRef = useRef<WeatherData | null>(null)
  const locationRef = useRef<SavedLocation | null>(null)
  const requestCounter = useRef(0)
  const staleTimer = useRef<number | null>(null)
  const booted = useRef(false)
  const scheduleStaleRefreshRef = useRef<((target: SavedLocation) => void) | null>(null)

  const updateData = useCallback((next: WeatherData | null) => {
    dataRef.current = next
    setData(next)
    if (next) {
      locationRef.current = next.location
      persistCachedWeather(next)
    }
  }, [])

  const fetchWeather = useCallback(
    async (target: SavedLocation, mode: 'background' | 'replace') => {
      const requestId = ++requestCounter.current
      if (staleTimer.current) {
        window.clearTimeout(staleTimer.current)
        staleTimer.current = null
      }
      setRefreshing(true)
      setError(null)
      if (mode === 'replace') {
        setIsCached(false)
        setStatus('loading')
      }
      try {
        const forecast = await getForecast(target.latitude, target.longitude)
        if (requestId !== requestCounter.current) return
        updateData({ ...forecast, location: { ...target } })
        setIsCached(false)
        setStatus('ready')
        scheduleStaleRefreshRef.current?.(target)
      } catch (err) {
        if (requestId !== requestCounter.current) return
        setError(safeErrorMessage(err))
        if (dataRef.current) {
          setIsCached(true)
          setStatus('ready')
        } else {
          setIsCached(false)
          setStatus('error')
        }
      } finally {
        if (requestId === requestCounter.current) setRefreshing(false)
      }
    },
    [updateData],
  )

  const scheduleStaleRefresh = useCallback((target: SavedLocation) => {
    if (staleTimer.current) window.clearTimeout(staleTimer.current)
    staleTimer.current = window.setTimeout(() => {
      staleTimer.current = null
      void fetchWeather(target, 'background')
    }, WEATHER_FRESH_MS + 1_000)
  }, [fetchWeather])

  useEffect(() => {
    scheduleStaleRefreshRef.current = scheduleStaleRefresh
  }, [scheduleStaleRefresh])

  const attemptGeolocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('denied')
      return
    }
    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        let resolved: { name: string; region: string; country: string } = {
          name: 'Current location',
          region: '',
          country: '',
        }
        try {
          resolved = await reverseGeocode(latitude, longitude)
        } catch {
          /* naming is best-effort */
        }
        const located: SavedLocation = {
          ...resolved,
          latitude,
          longitude,
        }
        persistSavedLocation(located)
        persistProfileLocation(located)
        locationRef.current = located
        setLocation(located)
        await fetchWeather(located, 'replace')
      },
      () => setStatus('denied'),
      { maximumAge: 600_000, timeout: 15_000 },
    )
  }, [fetchWeather])

  const boot = useCallback(async () => {
    const saved = readSavedLocation()
    const cached = readCachedWeather()
    let startingLocation = saved ?? (cached ? { ...cached.location } : null)

    // No location on this device yet — ask the backend for the one saved on
    // the user's profile before falling back to device geolocation.
    if (!startingLocation) {
      try {
        const profile = await getProfile()
        const p = profile?.location
        if (p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) {
          startingLocation = {
            name: p.name,
            region: p.region ?? '',
            country: p.country ?? '',
            latitude: p.latitude,
            longitude: p.longitude,
          }
          persistSavedLocation(startingLocation)
        }
      } catch {
        /* service unreachable — geolocate instead */
      }
    }

    if (!startingLocation) {
      attemptGeolocation()
      return
    }
    if (cached && (!saved || cached.location.latitude === startingLocation.latitude)) {
      updateData({ ...cached, location: { ...(saved ?? cached.location) } })
      locationRef.current = saved ?? cached.location
      setLocation(saved ?? cached.location)
      if (!isWeatherStale(cached.updatedAt)) {
        setStatus('ready')
        setIsCached(false)
        scheduleStaleRefresh(saved ?? cached.location)
        return
      }
      setIsCached(true)
      setStatus('ready')
      await fetchWeather(saved ?? cached.location, 'background')
      return
    }
    setLocation(startingLocation)
    locationRef.current = startingLocation
    await fetchWeather(startingLocation, 'replace')
  }, [attemptGeolocation, fetchWeather, scheduleStaleRefresh, updateData])

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    void boot()
  }, [boot])

  useEffect(() => {
    return () => {
      if (staleTimer.current) window.clearTimeout(staleTimer.current)
    }
  }, [])

  const refresh = useCallback(() => {
    const target = locationRef.current
    if (!target) {
      attemptGeolocation()
      return
    }
    void fetchWeather(target, dataRef.current ? 'background' : 'replace')
  }, [attemptGeolocation, fetchWeather])

  const selectLocation = useCallback(
    (next: SavedLocation) => {
      persistSavedLocation(next)
      persistProfileLocation(next)
      locationRef.current = next
      setLocation(next)
      void fetchWeather(next, 'replace')
    },
    [fetchWeather],
  )

  const enableCurrentLocation = useCallback(() => {
    persistSavedLocation(null)
    persistProfileLocation(null)
    locationRef.current = null
    setLocation(null)
    attemptGeolocation()
  }, [attemptGeolocation])

  const searchLocations = useCallback(
    (query: string) => searchLocationsService(query),
    [],
  )

  const value = useMemo<WeatherContextValue>(
    () => ({
      status,
      data,
      location,
      isCached,
      refreshing,
      error,
      refresh,
      selectLocation,
      enableCurrentLocation,
      searchLocations,
    }),
    [status, data, location, isCached, refreshing, error, refresh, selectLocation, enableCurrentLocation, searchLocations],
  )

  return <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>
}

export function useWeather(): WeatherContextValue {
  const context = useContext(WeatherContext)
  if (!context) {
    throw new Error('useWeather must be used within WeatherProvider')
  }
  return context
}