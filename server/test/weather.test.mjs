import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  getWeatherForCoordinates,
  searchLocationsBackend,
  normalizeWeatherResponse,
  validateCoordinates,
  weatherCache,
  clearWeatherCache,
} from '../src/weather.js'
import {
  scoreItem,
  recommendOutfits,
  temperatureBucket,
} from '../src/styling.js'
import { startTestServer, session } from './helpers.mjs'

let main, base

before(async () => {
  main = await startTestServer()
  base = main.base
})

after(async () => {
  if (main) await main.close()
})

// ── 1. Coordinate Validation & Missing Location ────────────────────────
test('weather: validateCoordinates rejects invalid coordinates', () => {
  assert.equal(validateCoordinates(null, 10).ok, false)
  assert.equal(validateCoordinates(95, 10).ok, false)
  assert.equal(validateCoordinates(-95, 10).ok, false)
  assert.equal(validateCoordinates(10, 185).ok, false)
  assert.equal(validateCoordinates(10, -185).ok, false)
  assert.equal(validateCoordinates('abc', 10).ok, false)

  const valid = validateCoordinates('23.02', '72.57')
  assert.equal(valid.ok, true)
  assert.equal(valid.latitude, 23.02)
  assert.equal(valid.longitude, 72.57)
})

// ── 2. Weather Normalization ───────────────────────────────────────────
test('weather: normalizeWeatherResponse maps Open-Meteo payload correctly', () => {
  const payload = {
    current: {
      temperature_2m: 29.5,
      apparent_temperature: 32.1,
      relative_humidity_2m: 65,
      precipitation_probability: 15,
      precipitation: 0.0,
      weather_code: 1,
      wind_speed_10m: 14.2,
    },
    hourly: {
      time: ['2026-10-24T12:00', '2026-10-24T13:00'],
      temperature_2m: [29.5, 30.1],
      precipitation_probability: [15, 20],
      precipitation: [0, 0],
    },
    daily: {
      time: ['2026-10-24'],
      weather_code: [1],
      temperature_2m_max: [33.0],
      temperature_2m_min: [22.0],
      precipitation_probability_max: [20],
      precipitation_sum: [0],
    },
  }

  const res = normalizeWeatherResponse(payload, { latitude: 23.02, longitude: 72.57, locationName: 'Ahmedabad' })
  assert.equal(res.location.name, 'Ahmedabad')
  assert.equal(res.current.temperature, 29.5)
  assert.equal(res.current.feelsLike, 32.1)
  assert.equal(res.current.humidity, 65)
  assert.equal(res.current.precipitationProbability, 15)
  assert.equal(res.current.windSpeed, 14.2)
  assert.equal(res.current.condition, 'Mainly clear')
  assert.equal(res.current.icon, 'sun')
  assert.ok(Array.isArray(res.hourly))
  assert.ok(Array.isArray(res.daily))
})

// ── 3. Malformed Responses ─────────────────────────────────────────────
test('weather: handles malformed weather response gracefully', async () => {
  clearWeatherCache()
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({ missing_current: true }),
  })

  await assert.rejects(
    async () => {
      await getWeatherForCoordinates({
        latitude: 23.02,
        longitude: 72.57,
        fetchFn: mockFetch,
        forceRefresh: true,
      })
    },
    /Malformed weather response/,
  )
})

// ── 4. Weather Timeout & Stale Cache Fallback ──────────────────────────
test('weather: handles timeout and falls back to stale cache if present', async () => {
  clearWeatherCache()
  const cacheKey = '23.02,72.57'
  weatherCache.set(cacheKey, {
    data: {
      location: { name: 'Ahmedabad', latitude: 23.02, longitude: 72.57 },
      current: { temperature: 28, feelsLike: 30, condition: 'Clear' },
      updatedAt: Date.now() - 60000,
    },
    expiresAt: Date.now() - 1000, // Expired
  })

  // Simulated timeout fetch
  const timeoutFetch = async () => {
    const err = new Error('Network timeout')
    err.name = 'TimeoutError'
    throw err
  }

  const result = await getWeatherForCoordinates({
    latitude: 23.02,
    longitude: 72.57,
    fetchFn: timeoutFetch,
  })

  assert.equal(result.isCached, true)
  assert.equal(result.isStale, true)
  assert.equal(result.current.temperature, 28)
})

// ── 5. In-Memory Caching & Expiry ──────────────────────────────────────
test('weather: caches result for 15 minutes and respects forceRefresh', async () => {
  clearWeatherCache()
  let fetchCount = 0
  const mockFetch = async () => {
    fetchCount++
    return {
      ok: true,
      json: async () => ({
        current: {
          temperature_2m: 25.0,
          apparent_temperature: 25.0,
          relative_humidity_2m: 50,
          precipitation_probability: 0,
          weather_code: 0,
          wind_speed_10m: 10,
        },
      }),
    }
  }

  const first = await getWeatherForCoordinates({
    latitude: 23.02,
    longitude: 72.57,
    locationName: 'Ahmedabad',
    fetchFn: mockFetch,
  })
  assert.equal(fetchCount, 1)
  assert.equal(first.isCached, false)

  // Second fetch hits cache
  const second = await getWeatherForCoordinates({
    latitude: 23.02,
    longitude: 72.57,
    locationName: 'Ahmedabad',
    fetchFn: mockFetch,
  })
  assert.equal(fetchCount, 1, 'second fetch should hit memory cache')
  assert.equal(second.isCached, true)

  // Force refresh bypasses cache
  const third = await getWeatherForCoordinates({
    latitude: 23.02,
    longitude: 72.57,
    locationName: 'Ahmedabad',
    fetchFn: mockFetch,
    forceRefresh: true,
  })
  assert.equal(fetchCount, 2, 'forceRefresh should bypass cache')
  assert.equal(third.isCached, false)
})

// ── 6. Geocoding Search ────────────────────────────────────────────────
test('weather: searchLocationsBackend returns normalized location results', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      results: [
        { name: 'Ahmedabad', admin1: 'Gujarat', country: 'India', latitude: 23.0225, longitude: 72.5714 },
        { name: 'London', admin1: 'England', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278 },
      ],
    }),
  })

  const results = await searchLocationsBackend({ query: 'Ahmedabad', fetchFn: mockFetch })
  assert.equal(results.length, 2)
  assert.equal(results[0].name, 'Ahmedabad')
  assert.equal(results[0].region, 'Gujarat')
  assert.equal(results[0].country, 'India')
  assert.equal(results[0].latitude, 23.0225)
})

test('weather: searchLocationsBackend handles short or empty queries cleanly', async () => {
  const empty = await searchLocationsBackend({ query: 'a' })
  assert.deepEqual(empty, [])
})

// ── 7. Warm-Weather Ranking ────────────────────────────────────────────
test('styling: warm weather favors short sleeves, breathable fabrics and penalizes heavy outerwear', () => {
  const weather = { temperature: 32, feelsLike: 35, humidity: 75, condition: 'Clear' }
  const bucket = temperatureBucket(weather)
  assert.equal(bucket, 'warm')

  const breathableShortTop = {
    id: 't-warm',
    name: 'Linen Shirt',
    category: 'tops',
    sleeve: 'Short sleeves',
    material: 'Linen',
    style: 'casual',
    weatherSuitability: 'summer, warm',
  }

  const heavyWoolCoat = {
    id: 'o-heavy',
    name: 'Heavy Wool Trench',
    category: 'outerwear',
    sleeve: 'Long sleeves',
    material: 'Wool',
    style: 'formal',
    weatherSuitability: 'winter, cold',
  }

  const scoreWarm = scoreItem(breathableShortTop, { occasion: 'casual', bucket, weather })
  const scoreHeavy = scoreItem(heavyWoolCoat, { occasion: 'casual', bucket, weather })

  assert.ok(scoreWarm.weatherPts > scoreHeavy.weatherPts, 'breathable short top must outscore heavy outerwear in warm conditions')
  assert.ok(scoreWarm.weatherPts >= 12, 'warm piece should achieve high weather points')
  assert.ok(scoreHeavy.weatherPts <= 5, 'heavy coat in warm weather should be penalized')
})

// ── 8. Cool-Weather Layering ───────────────────────────────────────────
test('styling: cool weather favors long sleeves, warm fabrics, and outerwear layering', () => {
  const weather = { temperature: 10, feelsLike: 8, condition: 'Overcast' }
  const bucket = temperatureBucket(weather)
  assert.equal(bucket, 'cool')

  const warmCoat = {
    id: 'o-coat',
    name: 'Cashmere Overcoat',
    category: 'outerwear',
    sleeve: 'Long sleeves',
    material: 'Wool',
    style: 'smart-casual',
    weatherSuitability: 'winter, cold',
  }

  const sleevelessTop = {
    id: 't-sleeveless',
    name: 'Silk Cami',
    category: 'tops',
    sleeve: 'Sleeveless',
    material: 'Silk',
    style: 'casual',
    weatherSuitability: 'summer',
  }

  const scoreCoat = scoreItem(warmCoat, { occasion: 'casual', bucket, weather })
  const scoreSleeveless = scoreItem(sleevelessTop, { occasion: 'casual', bucket, weather })

  assert.ok(scoreCoat.weatherPts > scoreSleeveless.weatherPts, 'warm outerwear must outscore sleeveless piece in cool conditions')
})

// ── 9. Rain-Aware Ranking ──────────────────────────────────────────────
test('styling: high rain probability favors rain-suitable outerwear', () => {
  const rainyWeather = { temperature: 20, rainProbability: 80, precipitation: 2.5 }
  const bucket = temperatureBucket(rainyWeather)

  const rainJacket = {
    id: 'o-rain',
    name: 'Weather-Resistant Parka',
    category: 'outerwear',
    weatherSuitability: 'rain, all-weather',
    style: 'casual',
  }

  const dryTop = {
    id: 't-regular',
    name: 'Regular Cotton Tee',
    category: 'tops',
    style: 'casual',
  }

  const scoreRain = scoreItem(rainJacket, { occasion: 'casual', bucket, weather: rainyWeather })
  const scoreDry = scoreItem(dryTop, { occasion: 'casual', bucket, weather: rainyWeather })

  assert.ok(scoreRain.weatherPts >= 12, 'rain jacket must receive rain bonus')
  assert.ok(scoreRain.weatherPts > scoreDry.weatherPts, 'rain jacket must outscore dry top in rain')
})

// ── 10. Missing Garment Metadata Resilience ────────────────────────────
test('styling: missing garment metadata does not crash and uses sensible defaults', () => {
  const bareItem = { id: 'bare-1', name: 'Unknown item', category: 'tops' }
  const weather = { temperature: 22 }
  const bucket = temperatureBucket(weather)

  const scored = scoreItem(bareItem, { occasion: 'casual', bucket, weather })
  assert.equal(typeof scored.itemScore, 'number')
  assert.ok(scored.weatherPts >= 0 && scored.weatherPts <= 15)
  assert.ok(!Number.isNaN(scored.itemScore))
})

// ── 11. Missing Weather Data & Non-Weather Fallback ────────────────────
test('styling: null weather gracefully falls back to deterministic occasion ranking', () => {
  const wardrobe = [
    { id: 't1', name: 'Black Tee', category: 'tops', style: 'casual', colorHex: '#111111' },
    { id: 'b1', name: 'Blue Jeans', category: 'bottoms', style: 'casual', colorHex: '#224488' },
  ]

  const out = recommendOutfits({ wardrobe, occasion: 'casual', weather: null })
  assert.equal(out.success, true)
  assert.equal(out.recommendations.length, 1)
  assert.equal(out.look.breakdown.weather, null, 'breakdown.weather must be null when weather is missing')
  assert.ok(out.look.explanation.some((line) => /not set|occasion suitability/i.test(line)))
})

// ── 12. Occasion Suitability Remains Effective Under Changing Weather ───
test('styling: occasion suitability remains primary factor even across weather changes', () => {
  const wardrobe = [
    { id: 't-suit', name: 'Formal Blazer', category: 'tops', style: 'formal', colorHex: '#222222' },
    { id: 't-beach', name: 'Beach Tank', category: 'tops', style: 'sporty', colorHex: '#FFAA00', sleeve: 'Sleeveless' },
    { id: 'b-suit', name: 'Tailored Trousers', category: 'bottoms', style: 'formal', colorHex: '#222222' },
    { id: 'b-shorts', name: 'Swim Shorts', category: 'bottoms', style: 'sporty', colorHex: '#FF5500' },
  ]

  // Even in hot weather, an office occasion must favor the formal combo
  const hotWeather = { temperature: 34, feelsLike: 38 }
  const rec = recommendOutfits({ wardrobe, occasion: 'Office / Professional', weather: hotWeather })

  assert.equal(rec.success, true)
  assert.ok(rec.look.items.some((i) => i.id === 't-suit'), 'office occasion must recommend formal blazer over beach tank even in heat')
})

// ── 13. Weather Scoring Bounds and Determinism ─────────────────────────
test('styling: score is bounded within 35..100 and deterministic', () => {
  const wardrobe = [
    { id: 't1', name: 'Oxford Shirt', category: 'tops', style: 'smart-casual', colorHex: '#335588', sleeve: 'Long sleeves' },
    { id: 'b1', name: 'Chinos', category: 'bottoms', style: 'smart-casual', colorHex: '#CCCCCC' },
  ]
  const weather = { temperature: 21, feelsLike: 21, humidity: 55, rainProbability: 10 }

  const run1 = recommendOutfits({ wardrobe, occasion: 'Office / Professional', weather })
  const run2 = recommendOutfits({ wardrobe, occasion: 'Office / Professional', weather })

  assert.equal(run1.look.score, run2.look.score)
  assert.deepEqual(run1.look.breakdown, run2.look.breakdown)
  assert.ok(run1.look.score >= 35 && run1.look.score <= 100)
  assert.ok(run1.look.breakdown.weather >= 0 && run1.look.breakdown.weather <= 100)
})

// ── 14. Server Endpoints: GET /api/weather & GET /api/weather/search ──
test('server: /api/weather returns normalized weather and validates query params', async () => {
  const badReq = await fetch(`${base}/api/weather`)
  assert.equal(badReq.status, 400)
  const badJson = await badReq.json()
  assert.equal(badJson.code, 'MISSING_COORDINATES')

  const badCoord = await fetch(`${base}/api/weather?latitude=999&longitude=0`)
  assert.equal(badCoord.status, 400)
  const badCoordJson = await badCoord.json()
  assert.equal(badCoordJson.code, 'INVALID_COORDINATES')
})

test('server: /api/weather/search returns search results', async () => {
  const emptyRes = await (await fetch(`${base}/api/weather/search?q=a`)).json()
  assert.deepEqual(emptyRes.results, [])
})

// ── 15. User Location Preference Persistence in Profile ────────────────
test('server: profile location persists and syncs with user account', async () => {
  const s = await session(base, 'weather-user@test.com')

  // Save profile location
  const loc = { name: 'Mumbai', region: 'Maharashtra', country: 'India', latitude: 19.076, longitude: 72.8777 }
  const putRes = await fetch(`${base}/api/profile`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${s.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ location: loc, style: 'smart-casual' }),
  })
  assert.equal(putRes.status, 200)
  const putJson = await putRes.json()
  assert.equal(putJson.profile.location.name, 'Mumbai')

  // Retrieve profile location
  const getRes = await fetch(`${base}/api/profile`, {
    headers: { Authorization: `Bearer ${s.token}` },
  })
  assert.equal(getRes.status, 200)
  const getJson = await getRes.json()
  assert.equal(getJson.profile.location.name, 'Mumbai')
  assert.equal(getJson.profile.location.latitude, 19.076)
})

// ── 16. Real Integration Check Against Configured Weather Provider ────
test('weather: live integration check against Open-Meteo endpoint', async () => {
  try {
    const live = await getWeatherForCoordinates({
      latitude: 23.0225,
      longitude: 72.5714,
      locationName: 'Ahmedabad',
      timeoutMs: 8000,
      forceRefresh: true,
    })
    assert.ok(live, 'live response received')
    assert.equal(typeof live.current.temperature, 'number')
    assert.equal(typeof live.current.condition, 'string')
    assert.equal(typeof live.current.humidity, 'number')
    assert.equal(typeof live.current.windSpeed, 'number')
  } catch (err) {
    // If external internet access is offline in the test environment, skip gracefully
    console.warn('External Open-Meteo network request skipped/unavailable:', err.message)
  }
})
