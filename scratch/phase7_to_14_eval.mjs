import assert from 'node:assert'
import fs from 'node:fs'
import { createApp, startServer } from '../server/src/app.js'
import { initDb } from '../server/src/db.js'
import { recommendOutfits } from '../server/src/styling.js'

console.log('=== PHASE 7 TO 14: WARDROBE CRUD, WEATHER, STYLING & E2E EVALUATION ===')

const db = initDb(':memory:')
const app = createApp({ db })
const server = await startServer(app, 0)
const port = server.address().port
const base = `http://127.0.0.1:${port}`

const timingStats = {
  apiResponseTimes: [],
  dbTimes: [],
  recommendationTimes: [],
}

function timeCall(fn) {
  const start = performance.now()
  const res = fn()
  const duration = performance.now() - start
  return { res, duration }
}

async function asyncTimeCall(fn) {
  const start = performance.now()
  const res = await fn()
  const duration = performance.now() - start
  return { res, duration }
}

try {
  // ==========================================
  // PHASE 7: WARDROBE CRUD & PERSISTENCE
  // ==========================================
  console.log('\n--- EXECUTING PHASE 7: WARDROBE CRUD & PERSISTENCE ---')
  const userEmail = `crud_tester_${Date.now()}@maeve.fashion`
  const userPass = 'CrudSecret123!'
  const reg = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'CRUD Tester', email: userEmail, password: userPass }),
  })
  const { token, user } = await reg.json()

  // 1. Initial list (Empty wardrobe)
  const initList = await fetch(`${base}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const initJson = await initList.json()
  assert.equal(initJson.items.length, 0, 'Initial wardrobe must be empty')
  console.log('✔ Empty wardrobe verified (0 items)')

  // 2. Save garments (Create)
  const item1 = {
    id: `item_${Date.now()}_1`,
    name: 'Merino Wool Crewneck',
    category: 'tops',
    subcategory: 'sweater',
    color: 'Charcoal',
    colorHex: '#333333',
    style: 'casual',
    season: 'cold',
    confidence: 0.92,
  }
  const item2 = {
    id: `item_${Date.now()}_2`,
    name: 'Tailored Wool Trousers',
    category: 'bottoms',
    subcategory: 'trousers',
    color: 'Navy',
    colorHex: '#1B2A4A',
    style: 'formal',
    season: 'all',
    confidence: 0.89,
  }
  const item3 = {
    id: `item_${Date.now()}_3`,
    name: 'Classic Trench Coat',
    category: 'outerwear',
    subcategory: 'coat',
    color: 'Beige',
    colorHex: '#D4C4A8',
    style: 'smart-casual',
    season: 'rainy',
    confidence: 0.95,
  }

  const { duration: saveDur } = await asyncTimeCall(async () => {
    return fetch(`${base}/api/wardrobe/items`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items: [item1, item2, item3] }),
    })
  })
  timingStats.dbTimes.push(saveDur)
  console.log(`✔ Saved 3 garments in ${saveDur.toFixed(2)}ms`)

  // 3. Display garments (Read)
  const listAfterSave = await fetch(`${base}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const listJson = await listAfterSave.json()
  assert.equal(listJson.items.length, 3, 'Wardrobe must contain 3 items')
  console.log('✔ Display wardrobe verified (3 items retrieved)')

  // 4. Search and Filter simulation
  const topsFiltered = listJson.items.filter((i) => i.category === 'tops')
  assert.equal(topsFiltered.length, 1)
  const searchResults = listJson.items.filter((i) => i.name.toLowerCase().includes('trench'))
  assert.equal(searchResults.length, 1)
  console.log('✔ Wardrobe search and filtering verified')

  // 5. Edit garment (Update)
  const { duration: editDur } = await asyncTimeCall(async () => {
    return fetch(`${base}/api/wardrobe/items/${item1.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Cashmere-Merino Blend Crewneck', color: 'Midnight Black' }),
    })
  })
  timingStats.dbTimes.push(editDur)
  console.log(`✔ Edited garment metadata in ${editDur.toFixed(2)}ms`)

  // Verify edit in DB
  const listAfterEdit = await fetch(`${base}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const editJson = await listAfterEdit.json()
  const updatedItem = editJson.items.find((i) => i.id === item1.id)
  assert.equal(updatedItem.name, 'Cashmere-Merino Blend Crewneck')
  assert.equal(updatedItem.color, 'Midnight Black')
  console.log('✔ Edit persistence verified')

  // 6. Delete garment (Delete)
  const { duration: delDur } = await asyncTimeCall(async () => {
    return fetch(`${base}/api/wardrobe/items/${item3.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  })
  timingStats.dbTimes.push(delDur)
  console.log(`✔ Deleted garment in ${delDur.toFixed(2)}ms`)

  // Verify deletion persists
  const listAfterDel = await fetch(`${base}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const delJson = await listAfterDel.json()
  assert.equal(delJson.items.length, 2, 'Wardrobe must contain 2 items after delete')
  assert.equal(delJson.items.some((i) => i.id === item3.id), false)
  console.log('✔ Deletion verification: PASS')

  // 7. Logout and re-login persistence
  await fetch(`${base}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const loginAgain = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, password: userPass }),
  })
  const { token: freshToken } = await loginAgain.json()
  const listAfterRelogin = await fetch(`${base}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${freshToken}` },
  })
  const reloginJson = await listAfterRelogin.json()
  assert.equal(reloginJson.items.length, 2, 'Items persist after re-login')
  console.log('✔ Persistence across re-login verified: 2 items intact')

  // ==========================================
  // PHASE 8: WEATHER INTEGRATION TESTING
  // ==========================================
  console.log('\n--- EXECUTING PHASE 8: WEATHER INTEGRATION ---')
  // 1. Valid coordinates (London: 51.5074, -0.1278)
  const { res: weatherRes, duration: weatherMs } = await asyncTimeCall(async () => {
    return fetch(`${base}/api/weather?latitude=51.5074&longitude=-0.1278`)
  })
  timingStats.apiResponseTimes.push(weatherMs)
  const weatherJson = await weatherRes.json()
  console.log(`Weather response (${weatherMs.toFixed(2)}ms):`, {
    success: weatherJson.success,
    temp: weatherJson.weather?.current?.temperature,
    humidity: weatherJson.weather?.current?.humidity,
    code: weatherJson.weather?.current?.weatherCode,
  })
  assert.equal(weatherRes.status, 200)
  assert.equal(weatherJson.success, true)
  assert.ok(typeof weatherJson.weather?.current?.temperature === 'number')
  assert.ok(typeof weatherJson.weather?.current?.humidity === 'number')
  console.log('✔ Live weather API connection & data extraction verified')

  // 2. Location Search (/api/weather/search?q=Paris)
  const searchRes = await fetch(`${base}/api/weather/search?q=Paris`)
  const searchJson = await searchRes.json()
  assert.equal(searchRes.status, 200)
  assert.ok(searchJson.results.length > 0)
  console.log(`✔ Weather location search returned ${searchJson.results.length} results for "Paris"`)

  // 3. Invalid location handling (latitude > 90)
  const invalidLocRes = await fetch(`${base}/api/weather?latitude=999&longitude=999`)
  assert.equal(invalidLocRes.status, 400)
  const invalidJson = await invalidLocRes.json()
  assert.equal(invalidJson.code, 'INVALID_COORDINATES')
  console.log('✔ Invalid coordinates rejected with 400 INVALID_COORDINATES')

  // ==========================================
  // PHASE 9: OUTFIT RECOMMENDATION TESTING
  // ==========================================
  console.log('\n--- EXECUTING PHASE 9: OUTFIT RECOMMENDATION TESTING ---')

  const testWardrobe = [
    { id: 'g1', name: 'Linen Casual Shirt', category: 'tops', subcategory: 'short_sleeved_shirt', sleeve: 'short', material: 'linen', color: 'White', colorHex: '#FFFFFF', style: 'casual' },
    { id: 'g2', name: 'Cotton Chinos', category: 'bottoms', subcategory: 'trousers', length: 'full', material: 'cotton', color: 'Khaki', colorHex: '#C3B091', style: 'casual' },
    { id: 'g3', name: 'Heavy Wool Blazer', category: 'outerwear', subcategory: 'long_sleeved_outwear', sleeve: 'long', material: 'wool', color: 'Navy', colorHex: '#1B2A4A', style: 'formal' },
    { id: 'g4', name: 'Formal Silk Dress Shirt', category: 'tops', subcategory: 'long_sleeved_shirt', sleeve: 'long', material: 'silk', color: 'Light Blue', colorHex: '#ADD8E6', style: 'formal' },
    { id: 'g5', name: 'Dress Trousers', category: 'bottoms', subcategory: 'trousers', length: 'full', material: 'wool', color: 'Black', colorHex: '#000000', style: 'formal' },
    { id: 'g6', name: 'Summer Linen Dress', category: 'dresses', subcategory: 'vest_dress', sleeve: 'sleeveless', length: 'midi', material: 'linen', color: 'Yellow', colorHex: '#FFFF00', style: 'casual' },
    { id: 'g7', name: 'Embroidered Silk Kurta', category: 'traditional', subcategory: 'long_sleeved_outwear', sleeve: 'long', material: 'silk', color: 'Maroon', colorHex: '#800000', style: 'ethnic' },
    { id: 'g8', name: 'Waterproof Rain Parka', category: 'outerwear', subcategory: 'long_sleeved_outwear', sleeve: 'long', material: 'synthetic', color: 'Forest Green', colorHex: '#228B22', style: 'casual' },
    { id: 'g9', name: 'Thermal Knit Sweater', category: 'tops', subcategory: 'long_sleeved_outwear', sleeve: 'long', material: 'wool', color: 'Burgundy', colorHex: '#800020', style: 'casual' },
    { id: 'g10', name: 'Denim Jeans', category: 'bottoms', subcategory: 'trousers', length: 'full', material: 'denim', color: 'Dark Indigo', colorHex: '#000080', style: 'casual' },
  ]

  const scenarios = [
    { id: 1, name: 'Hot weather + casual occasion', weather: { current: { temperature: 32, humidity: 45, weatherCode: 0, rainProbability: 0 } }, occasion: 'casual' },
    { id: 2, name: 'Hot weather + formal occasion', weather: { current: { temperature: 32, humidity: 45, weatherCode: 0, rainProbability: 0 } }, occasion: 'formal' },
    { id: 3, name: 'Cold weather + casual occasion', weather: { current: { temperature: 4, humidity: 60, weatherCode: 3, rainProbability: 10 } }, occasion: 'casual' },
    { id: 4, name: 'Rainy weather', weather: { current: { temperature: 14, humidity: 85, weatherCode: 61, rainProbability: 90 } }, occasion: 'casual' },
    { id: 5, name: 'High humidity', weather: { current: { temperature: 28, humidity: 92, weatherCode: 2, rainProbability: 20 } }, occasion: 'casual' },
    { id: 6, name: 'Low humidity / dry weather', weather: { current: { temperature: 22, humidity: 18, weatherCode: 0, rainProbability: 0 } }, occasion: 'casual' },
    { id: 7, name: 'Traditional occasion', weather: { current: { temperature: 25, humidity: 50, weatherCode: 0, rainProbability: 0 } }, occasion: 'traditional' },
    { id: 8, name: 'Formal business occasion', weather: { current: { temperature: 20, humidity: 50, weatherCode: 0, rainProbability: 0 } }, occasion: 'formal' },
    { id: 9, name: 'Party / Evening event', weather: { current: { temperature: 19, humidity: 55, weatherCode: 0, rainProbability: 0 } }, occasion: 'party' },
    { id: 10, name: 'Everyday / Casual use', weather: { current: { temperature: 21, humidity: 50, weatherCode: 1, rainProbability: 5 } }, occasion: 'everyday' },
  ]

  let acceptableRecommendations = 0
  const scenarioResults = []

  for (const s of scenarios) {
    const { res: rec, duration: recMs } = timeCall(() => {
      return recommendOutfits({ wardrobe: testWardrobe, occasion: s.occasion, weather: s.weather })
    })
    timingStats.recommendationTimes.push(recMs)

    const outfit = rec.recommendations?.[0]
    const isAcceptable = Boolean(outfit && outfit.itemIds?.length > 0 && outfit.score >= 40)
    if (isAcceptable) acceptableRecommendations++

    scenarioResults.push({
      scenario: s.name,
      occasion: s.occasion,
      temp: s.weather?.current?.temperature,
      recGenerated: Boolean(outfit),
      garmentsSelected: outfit?.itemIds?.length || 0,
      score: outfit?.score || 0,
      recTimeMs: Number(recMs.toFixed(2)),
      isAcceptable,
    })
    console.log(`✔ Scenario [${s.id}/10] ${s.name}: Score ${outfit?.score}, Items: ${outfit?.itemIds?.length}, Time: ${recMs.toFixed(2)}ms`)
  }

  const recSuccessRate = (acceptableRecommendations / scenarios.length) * 100
  console.log(`Recommendation Success Rate: ${acceptableRecommendations}/${scenarios.length} (${recSuccessRate}%)`)

  // ==========================================
  // PHASE 10: SAVED OUTFITS / LOOKS
  // ==========================================
  console.log('\n--- EXECUTING PHASE 10: SAVED OUTFITS / LOOKS ---')
  // 1. Save Outfit
  const saveLookRes = await fetch(`${base}/api/looks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${freshToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      occasion: 'casual',
      itemIds: [item1.id, item2.id],
      score: 88,
      explanation: 'Relaxed wool crewneck with tailored navy trousers',
    }),
  })
  assert.equal(saveLookRes.status, 201, `saveLookRes expected 201, got ${saveLookRes.status}`)
  const { look: savedLook } = await saveLookRes.json()
  console.log('✔ Outfit saved successfully (ID:', savedLook.id, ')')

  // 2. View Saved Outfits
  const getLooksRes = await fetch(`${base}/api/looks`, {
    headers: { Authorization: `Bearer ${freshToken}` },
  })
  const looksJson = await getLooksRes.json()
  assert.equal(looksJson.looks.length, 1)
  console.log('✔ Saved outfits listed (count: 1)')

  // 3. User feedback / rating on look
  const feedbackRes = await fetch(`${base}/api/looks/${savedLook.id}/feedback`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${freshToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rating: 5, liked: true }),
  })
  assert.equal(feedbackRes.status, 200)
  console.log('✔ Feedback rating (5 stars) saved to look')

  // 4. Delete saved outfit
  const delLookRes = await fetch(`${base}/api/looks/${savedLook.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${freshToken}` },
  })
  assert.equal(delLookRes.status, 200)
  const getLooksAfterDel = await fetch(`${base}/api/looks`, {
    headers: { Authorization: `Bearer ${freshToken}` },
  })
  const looksAfterDelJson = await getLooksAfterDel.json()
  assert.equal(looksAfterDelJson.looks.length, 0)
  console.log('✔ Saved outfit deleted and verified (count: 0)')

  // ==========================================
  // PHASE 11: END-TO-END USER JOURNEY
  // ==========================================
  console.log('\n--- EXECUTING PHASE 11: END-TO-END USER JOURNEY ---')
  const e2eEmail = `e2e_complete_${Date.now()}@maeve.fashion`
  const e2ePass = 'E2EPassword123!'
  const e2eStart = performance.now()

  // Register
  const e2eReg = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'E2E User', email: e2eEmail, password: e2ePass }),
  })
  const { token: e2eToken } = await e2eReg.json()

  // Add 4 garments
  const e2eItems = [
    { id: 'e2e_g1', name: 'E2E White Shirt', category: 'tops', subcategory: 'long_sleeved_shirt', style: 'formal', color: 'White' },
    { id: 'e2e_g2', name: 'E2E Chino Pants', category: 'bottoms', subcategory: 'trousers', style: 'formal', color: 'Khaki' },
    { id: 'e2e_g3', name: 'E2E Leather Jacket', category: 'outerwear', subcategory: 'long_sleeved_outwear', style: 'casual', color: 'Black' },
    { id: 'e2e_g4', name: 'E2E Summer Dress', category: 'dresses', subcategory: 'vest_dress', style: 'casual', color: 'Floral' },
  ]
  await fetch(`${base}/api/wardrobe/items`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${e2eToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ items: e2eItems }),
  })

  // Get Weather
  const e2eWeather = await fetch(`${base}/api/weather?latitude=40.7128&longitude=-74.0060`)
  const e2eWeatherJson = await e2eWeather.json()

  // Recommend Outfit
  const e2eRec = recommendOutfits({ wardrobe: e2eItems, occasion: 'formal', weather: e2eWeatherJson.weather })
  assert.ok(e2eRec.recommendations.length > 0)

  // Save recommended outfit
  const e2eSaveLook = await fetch(`${base}/api/looks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${e2eToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      occasion: 'formal',
      itemIds: e2eRec.recommendations[0].itemIds,
      score: e2eRec.recommendations[0].score,
      explanation: e2eRec.recommendations[0].explanation,
    }),
  })
  assert.equal(e2eSaveLook.status, 201)

  // Record wear event
  await fetch(`${base}/api/wardrobe/wear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${e2eToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ itemIds: ['e2e_g1', 'e2e_g2'] }),
  })

  // Logout
  await fetch(`${base}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${e2eToken}` },
  })

  // Re-login
  const e2eRelogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: e2eEmail, password: e2ePass }),
  })
  const { token: e2eFreshToken } = await e2eRelogin.json()

  // Verify all data intact
  const e2eFinalWardrobe = await fetch(`${base}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${e2eFreshToken}` },
  })
  const e2eFinalWardrobeJson = await e2eFinalWardrobe.json()
  assert.equal(e2eFinalWardrobeJson.items.length, 4)
  const wornItem = e2eFinalWardrobeJson.items.find((i) => i.id === 'e2e_g1')
  assert.equal(wornItem.timesWorn, 1)

  const e2eFinalLooks = await fetch(`${base}/api/looks`, {
    headers: { Authorization: `Bearer ${e2eFreshToken}` },
  })
  const e2eFinalLooksJson = await e2eFinalLooks.json()
  assert.equal(e2eFinalLooksJson.looks.length, 1)

  const e2eDurationMs = performance.now() - e2eStart
  console.log(`✔ Complete End-to-End User Journey PASSED in ${e2eDurationMs.toFixed(2)}ms`)

  // Save report artifact
  const finalSummary = {
    crudTestsPassed: 7,
    crudTestsTotal: 7,
    weatherTestsPassed: 3,
    weatherTestsTotal: 3,
    scenariosTested: scenarios.length,
    acceptableRecommendations,
    recSuccessRate,
    scenarioDetails: scenarioResults,
    e2eDurationMs: Number(e2eDurationMs.toFixed(2)),
    performanceMetrics: {
      avgDbOperationMs: Number((timingStats.dbTimes.reduce((a,b)=>a+b,0) / timingStats.dbTimes.length).toFixed(2)),
      avgRecommendationMs: Number((timingStats.recommendationTimes.reduce((a,b)=>a+b,0) / timingStats.recommendationTimes.length).toFixed(2)),
      avgWeatherApiMs: Number((timingStats.apiResponseTimes.reduce((a,b)=>a+b,0) / timingStats.apiResponseTimes.length).toFixed(2)),
    }
  }
  fs.writeFileSync('scratch/phase7_to_14_results.json', JSON.stringify(finalSummary, null, 2))
  console.log('\nResults saved to scratch/phase7_to_14_results.json')
} finally {
  server.close()
}
