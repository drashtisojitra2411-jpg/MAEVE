import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer, session, saveItems, listItems } from './helpers.mjs'

// The styling engine must only ever return pieces that exist in the caller's
// wardrobe, persist exactly one honest record per generate, and never fabricate
// a look when the wardrobe is empty. Scores are rule-based and deterministic.

let main, base

function api(path, { token, method = 'GET', body } = {}) {
  const headers = {}; const init = { method }
  if (token) { headers.Authorization = `Bearer ${token}`; headers['content-type'] = 'application/json' }
  if (body) init.body = JSON.stringify(body)
  return fetch(`${base}${path}`, { ...init, headers })
}

async function seed(userToken) {
  return saveItems(base, userToken, [
    { id: 'w-top', name: 'Blue shirt', category: 'tops', subcategory: 'short_sleeved_shirt', style: 'smart-casual', colorHex: '#1F3A93', sleeve: 'Short sleeves' },
    { id: 'w-bot', name: 'Navy trousers', category: 'bottoms', subcategory: 'trousers', style: 'smart-casual', colorHex: '#1B2A4A' },
    { id: 'w-foot', name: 'White sneakers', category: 'footwear', style: 'casual', colorHex: '#F5F5F5' },
  ])
}

before(async () => { main = await startTestServer(); base = main.base })
after(async () => { if (main) await main.close() })

test('styling: empty wardrobe -> honest no-suitable reason, nothing persisted', async () => {
  const s = await session(base, 'empty@test.com')
  const res = await api('/api/looks/generate', { token: s.token, method: 'POST', body: { occasion: 'casual', preferences: { style: 'casual' } } })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.success, true)
  assert.equal(body.look, null)
  assert.ok(/empty/i.test(body.reason))
  const looks = await (await api('/api/looks', { token: s.token })).json()
  assert.deepEqual(looks.looks, [])
})

test('styling: recommend returns only real items, deterministically, and persists nothing', async () => {
  const s = await session(base, 'rule@test.com')
  await seed(s.token)
  const options = { occasion: 'work', preferences: { style: 'smart-casual', comfort: 'relaxed fit' }, weather: { temperature: 22, condition: 'Partly cloudy', locationName: 'Ahmedabad' } }

  const a = await (await api('/api/looks/recommend', { token: s.token, method: 'POST', body: options })).json()
  const b = await (await api('/api/looks/recommend', { token: s.token, method: 'POST', body: options })).json()

  assert.equal(a.success, true)
  assert.ok(a.look.items.length >= 1)
  const owned = new Set((await listItems(base, s.token)).items.map((i) => i.id))
  for (const item of a.look.items) assert.ok(owned.has(item.id), 'every item is real wardrobe')
  assert.deepEqual(a.look.itemIds, a.look.items.map((i) => i.id))
  assert.deepEqual(b.look.itemIds, a.look.itemIds)
  assert.equal(b.look.score, a.look.score)
  assert.deepEqual(b.look.breakdown, a.look.breakdown)
  assert.ok(Number.isInteger(a.look.score) && a.look.score >= 40 && a.look.score <= 100)
  assert.equal(typeof a.look.breakdown.occasion, 'number')
  assert.equal(typeof a.look.breakdown.colour, 'number')
  const looks = await (await api('/api/looks', { token: s.token })).json()
  assert.deepEqual(looks.looks, [])
})

test('styling: generate persists exactly one real look; history lists it with snapshot', async () => {
  const s = await session(base, 'gen@test.com')
  await seed(s.token)
  const body = { occasion: 'College', preferences: { style: 'casual' }, weather: { temperature: 31, condition: 'Sunny', locationName: 'Ahmedabad' } }
  const created = (await (await api('/api/looks/generate', { token: s.token, method: 'POST', body })).json()).look
  assert.ok(created.id, 'created look has id')
  assert.equal(created.occasion, 'College')
  assert.deepEqual(created.weather, body.weather)
  assert.ok(Array.isArray(created.items) && created.items.every((i) => i.id))
  assert.match(created.explanation[0], /college/i)

  const looks = await (await api('/api/looks', { token: s.token })).json()
  assert.equal(looks.looks.length, 1, 'exactly one history record per generate')
  assert.equal(looks.looks[0].id, created.id)
  assert.equal(looks.looks[0].weather.locationName, 'Ahmedabad')
  assert.ok(Number.isInteger(looks.looks[0].createdAt))
})

test('styling: looks are per-user - isolation holds end to end', async () => {
  const alice = await session(base, 'iso-a@test.com')
  const bob = await session(base, 'iso-b@test.com')
  await seed(alice.token)
  await saveItems(base, bob.token, [{ id: 'b-top', category: 'tops', colorHex: '#B22222', subcategory: 'long_sleeved_shirt', style: 'evening' }])

  const gA = await (await api('/api/looks/generate', { token: alice.token, method: 'POST', body: { occasion: 'Weekend' } })).json()
  const gB = await (await api('/api/looks/generate', { token: bob.token, method: 'POST', body: { occasion: 'Weekend' } })).json()
  assert.ok(gA.look && gB.look)

  const aLooks = await (await api('/api/looks', { token: alice.token })).json()
  const bLooks = await (await api('/api/looks', { token: bob.token })).json()
  assert.equal(aLooks.looks.length, 1)
  assert.equal(bLooks.looks.length, 1)
  assert.notEqual(aLooks.looks[0].id, bLooks.looks[0].id)
  assert.ok(aLooks.looks[0].items.every((i) => ['w-top', 'w-bot', 'w-foot'].includes(i.id)))
  assert.ok(bLooks.looks[0].items.every((i) => i.id === 'b-top'))

  const crossDel = await api(`/api/looks/${bLooks.looks[0].id}`, { token: alice.token, method: 'DELETE' })
  assert.equal(crossDel.status, 404)
  const bAfter = await (await api('/api/looks', { token: bob.token })).json()
  assert.equal(bAfter.looks.length, 1)
})

test('profile: defaults are null; PUT persists location + preferences; bad location rejected', async () => {
  const s = await session(base, 'prof@test.com')
  const fresh = await (await api('/api/profile', { token: s.token })).json()
  assert.deepEqual(fresh.profile, { location: null, style: null, comfort: null, theme: null, preferences: {} })

  const bad = await api('/api/profile', { token: s.token, method: 'PUT', body: { location: { name: '', latitude: 100, longitude: -999 } } })
  assert.equal(bad.status, 400)

  const upd = await (await api('/api/profile', { token: s.token, method: 'PUT', body: {
    location: { name: 'Ahmedabad', region: 'GJ', country: 'India', latitude: 23.03, longitude: 72.58 },
    style: 'smart-casual', comfort: 'relaxed fit', theme: 'sonnet',
  } })).json()
  assert.equal(upd.profile.location.name, 'Ahmedabad')
  assert.equal(upd.profile.location.latitude, 23.03)
  assert.equal(upd.profile.style, 'smart-casual')

  const reread = await (await api('/api/profile', { token: s.token })).json()
  assert.equal(reread.profile.location.name, 'Ahmedabad')
  assert.equal(reread.profile.comfort, 'relaxed fit')
})

test('styling: dress-based outfits stand alone and compose with optional footwear', async () => {
  const s = await session(base, 'dress@test.com')
  await saveItems(base, s.token, [
    { id: 'd-1', name: 'Silk Midi Dress', category: 'dresses', style: 'smart-casual', colorHex: '#C5A059' },
    { id: 'f-1', name: 'Nude Heels', category: 'footwear', style: 'smart-casual', colorHex: '#E8D8C8' },
  ])
  const res = await (await api('/api/looks/recommend', {
    token: s.token,
    method: 'POST',
    body: { occasion: 'Date / Dinner' },
  })).json()
  assert.equal(res.success, true)
  assert.ok(res.look, 'found dress-based look')
  assert.ok(res.look.items.some((i) => i.id === 'd-1'), 'contains dress')
  assert.ok(!res.look.items.some((i) => i.category === 'bottoms'), 'dress stands alone without bottoms')
  assert.ok(res.recommendations.length >= 1)
})

test('styling: traditional outfit combinations compose without requiring western top+bottom', async () => {
  const s = await session(base, 'trad@test.com')
  await saveItems(base, s.token, [
    { id: 'tr-1', name: 'Embroidered Kurta Set', category: 'traditional', style: 'ethnic', colorHex: '#8B0000' },
    { id: 'f-tr', name: 'Juttis', category: 'footwear', style: 'ethnic', colorHex: '#D4AF37' },
  ])
  const res = await (await api('/api/looks/recommend', {
    token: s.token,
    method: 'POST',
    body: { occasion: 'Traditional event' },
  })).json()
  assert.equal(res.success, true)
  assert.ok(res.look)
  assert.ok(res.look.items.some((i) => i.id === 'tr-1'))
})

test('styling: outerwear is layering piece and does not substitute for trousers', async () => {
  const s = await session(base, 'outer@test.com')
  await saveItems(base, s.token, [
    { id: 'top-1', name: 'White Oxford Shirt', category: 'tops', style: 'formal', colorHex: '#FFFFFF' },
    { id: 'blazer-1', name: 'Navy Wool Blazer', category: 'outerwear', style: 'formal', colorHex: '#1B2A4A' },
  ])
  // Wardrobe has top + outerwear, but NO bottoms. It must explain missing bottoms and NOT treat blazer as bottom.
  const res = await (await api('/api/looks/recommend', {
    token: s.token,
    method: 'POST',
    body: { occasion: 'Office / Professional' },
  })).json()
  assert.equal(res.success, true)
  assert.ok(res.missingCategories?.includes('bottoms'), 'correctly identifies missing bottoms')
  assert.ok(/missing bottoms/i.test(res.look.explanation.join(' ')))
})

test('styling: handles missing metadata gracefully without crashing or false penalties', async () => {
  const s = await session(base, 'nometadata@test.com')
  await saveItems(base, s.token, [
    { id: 'raw-1', name: 'Mystery Top', category: 'tops', color: null, colorHex: null, style: null, pattern: null, sleeve: null },
    { id: 'raw-2', name: 'Mystery Pants', category: 'bottoms', color: null, colorHex: null, style: null, pattern: null },
  ])
  const res = await (await api('/api/looks/recommend', {
    token: s.token,
    method: 'POST',
    body: { occasion: 'College / University' },
  })).json()
  assert.equal(res.success, true)
  assert.ok(res.look)
  assert.equal(res.look.items.length, 2)
  assert.ok(Number.isInteger(res.look.score) && res.look.score >= 40)
})

test('styling: occasion-based ranking favors appropriate styles', async () => {
  const s = await session(base, 'ranking@test.com')
  await saveItems(base, s.token, [
    { id: 'formal-shirt', category: 'tops', style: 'formal', colorHex: '#FFFFFF' },
    { id: 'formal-pants', category: 'bottoms', style: 'formal', colorHex: '#111111' },
    { id: 'gym-tee', category: 'tops', style: 'sporty', colorHex: '#FF0000' },
    { id: 'sweatpants', category: 'bottoms', style: 'sporty', colorHex: '#888888' },
  ])
  const officeRes = await (await api('/api/looks/recommend', {
    token: s.token,
    method: 'POST',
    body: { occasion: 'Office / Professional' },
  })).json()
  assert.equal(officeRes.look.items[0].id, 'formal-shirt')

  const casualRes = await (await api('/api/looks/recommend', {
    token: s.token,
    method: 'POST',
    body: { occasion: 'Casual outing' },
  })).json()
  assert.ok(casualRes.look)
})

test('styling: prevents duplicate candidate combinations and duplicate look saves', async () => {
  const s = await session(base, 'dup@test.com')
  await seed(s.token)
  const rec = await (await api('/api/looks/recommend', {
    token: s.token,
    method: 'POST',
    body: { occasion: 'College' },
  })).json()
  // Ensure all candidate recommendations in array are distinct item sets
  const signatures = rec.recommendations.map((r) => [...r.itemIds].sort().join('|'))
  const uniqueSigs = new Set(signatures)
  assert.equal(signatures.length, uniqueSigs.size, 'no duplicate recommendations returned')

  // Explicit look save via POST /api/looks
  const lookToSave = rec.recommendations[0]
  const save1 = await (await api('/api/looks', {
    token: s.token,
    method: 'POST',
    body: {
      occasion: 'College',
      itemIds: lookToSave.itemIds,
      explanation: lookToSave.explanation,
      score: lookToSave.score,
    },
  })).json()
  assert.equal(save1.success, true)

  // Saving the same outfit again does not create a duplicate row
  const save2 = await (await api('/api/looks', {
    token: s.token,
    method: 'POST',
    body: {
      occasion: 'College',
      itemIds: lookToSave.itemIds,
      explanation: lookToSave.explanation,
      score: lookToSave.score,
    },
  })).json()
  assert.equal(save2.success, true)
  assert.equal(save1.look.id, save2.look.id, 'duplicate save returns existing record')

  const allLooks = await (await api('/api/looks', { token: s.token })).json()
  assert.equal(allLooks.looks.length, 1, 'only one look persisted')
})

test('styling: feedback persistence and rating update endpoint', async () => {
  const s = await session(base, 'feedback@test.com')
  await seed(s.token)
  const gen = await (await api('/api/looks/generate', {
    token: s.token,
    method: 'POST',
    body: { occasion: 'Casual' },
  })).json()
  const lookId = gen.look.id

  // Submit feedback
  const patchRes = await api(`/api/looks/${lookId}/feedback`, {
    token: s.token,
    method: 'PATCH',
    body: { feedback: 'like', rating: 5 },
  })
  assert.equal(patchRes.status, 200)
  const updated = (await patchRes.json()).look
  assert.equal(updated.feedback, 'like')
  assert.equal(updated.rating, 5)

  // Verify it persists in GET /api/looks/:id
  const getRes = await (await api(`/api/looks/${lookId}`, { token: s.token })).json()
  assert.equal(getRes.look.feedback, 'like')
  assert.equal(getRes.look.rating, 5)
})

test('styling: safe handling of deleted garment references in saved looks', async () => {
  const s = await session(base, 'delitem@test.com')
  await seed(s.token)
  const gen = await (await api('/api/looks/generate', {
    token: s.token,
    method: 'POST',
    body: { occasion: 'College' },
  })).json()
  const lookId = gen.look.id

  // Delete 'w-bot' from the wardrobe
  const delItem = await api('/api/wardrobe/items/w-bot', { token: s.token, method: 'DELETE' })
  assert.equal(delItem.status, 200)

  // Saved look is still fetchable; snapshot is preserved and incomplete flag is set
  const lookRes = await (await api(`/api/looks/${lookId}`, { token: s.token })).json()
  assert.equal(lookRes.success, true)
  assert.equal(lookRes.look.incomplete, true, 'look marked incomplete after item deletion')
  assert.ok(lookRes.look.missingItemIds.includes('w-bot'))
  const botItem = lookRes.look.items.find((i) => i.id === 'w-bot')
  assert.equal(botItem.isAvailable, false)
})

test('styling: unauthorized look save or cross-user garment reference rejected', async () => {
  const u1 = await session(base, 'u1@test.com')
  const u2 = await session(base, 'u2@test.com')
  await saveItems(base, u1.token, [{ id: 'u1-item', category: 'tops', colorHex: '#111111' }])

  // u2 tries to save a look referencing u1's item -> rejected with 403 Forbidden
  const res = await api('/api/looks', {
    token: u2.token,
    method: 'POST',
    body: { occasion: 'Casual', itemIds: ['u1-item'] },
  })
  assert.equal(res.status, 403)
})