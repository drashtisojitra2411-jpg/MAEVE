import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer, session, saveItems } from './helpers.mjs'
import { scoreItem, recommendOutfits } from '../src/styling.js'

let main, base

before(async () => {
  main = await startTestServer()
  base = main.base
})

after(async () => {
  if (main) await main.close()
})

// ── 1. Saving and Retrieving Personal Preferences ──────────────────────
test('personalization: profile persists structured style preferences across requests', async () => {
  const s = await session(base, 'pref-user@test.com')

  const prefs = {
    preferredStyles: ['smart-casual', 'minimalist', 'casual'],
    favoriteColors: ['#1B2A4A', '#D4C4A8', 'navy'],
    avoidColors: ['#FF0000', 'neon'],
    formality: 'smart-casual',
    comfort: ['relaxed fit', 'breathable fabrics'],
    layering: 'moderate',
    typicalOccasions: ['college', 'office'],
    silhouettes: ['tailored', 'relaxed'],
  }

  const putRes = await fetch(`${base}/api/profile`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${s.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      preferences: prefs,
      theme: 'sonnet',
    }),
  })
  assert.equal(putRes.status, 200)
  const putBody = await putRes.json()
  assert.equal(putBody.success, true)
  assert.deepEqual(putBody.profile.preferences.preferredStyles, ['smart-casual', 'minimalist', 'casual'])
  assert.deepEqual(putBody.profile.preferences.favoriteColors, ['#1B2A4A', '#D4C4A8', 'navy'])
  assert.deepEqual(putBody.profile.preferences.avoidColors, ['#FF0000', 'neon'])
  assert.equal(putBody.profile.preferences.formality, 'smart-casual')

  // Retrieve on fresh GET request
  const getRes = await fetch(`${base}/api/profile`, {
    headers: { Authorization: `Bearer ${s.token}` },
  })
  assert.equal(getRes.status, 200)
  const getBody = await getRes.json()
  assert.deepEqual(getBody.profile.preferences.preferredStyles, prefs.preferredStyles)
  assert.deepEqual(getBody.profile.preferences.favoriteColors, prefs.favoriteColors)
  assert.equal(getBody.profile.preferences.formality, 'smart-casual')
})

// ── 2. Updating and Resetting Preferences ──────────────────────────────
test('personalization: updating and resetting profile preferences to defaults', async () => {
  const s = await session(base, 'pref-reset@test.com')

  // Set initial
  await fetch(`${base}/api/profile`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${s.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ preferences: { preferredStyles: ['formal'] } }),
  })

  // Reset to empty
  const resetRes = await fetch(`${base}/api/profile`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${s.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ preferences: {} }),
  })
  assert.equal(resetRes.status, 200)
  const resetBody = await resetRes.json()
  assert.deepEqual(resetBody.profile.preferences.preferredStyles, [])
  assert.deepEqual(resetBody.profile.preferences.favoriteColors, [])
})

// ── 3. Preference-Aware Ranking (Styles and Colors) ────────────────────
test('personalization: preferred style and favorite color boost outfit score', () => {
  const blueCasualShirt = {
    id: 't-blue',
    name: 'Blue Linen Shirt',
    category: 'tops',
    style: 'casual',
    colorHex: '#1B2A4A',
    color: 'Navy',
  }
  const redFormalShirt = {
    id: 't-red',
    name: 'Red Stiff Shirt',
    category: 'tops',
    style: 'formal',
    colorHex: '#FF0000',
    color: 'Red',
  }

  const prefs = {
    preferredStyles: ['casual'],
    favoriteColors: ['#1B2A4A'],
    avoidColors: ['#FF0000'],
  }

  const scoreBlue = scoreItem(blueCasualShirt, { occasion: 'casual', preferences: prefs })
  const scoreRed = scoreItem(redFormalShirt, { occasion: 'casual', preferences: prefs })

  assert.ok(scoreBlue.prefPts > scoreRed.prefPts, 'preferred casual navy piece must outscore avoided formal red piece')
  assert.ok(scoreBlue.prefPts >= 8, 'matching style and favorite color must gain significant preference points')
  assert.ok(scoreRed.prefPts <= 0, 'avoided color must suffer penalty')
})

// ── 4. Formality Level Match ───────────────────────────────────────────
test('personalization: formality level preference influences scoring', () => {
  const formalSuit = { id: 's1', category: 'tops', style: 'formal' }
  const sportyTee = { id: 's2', category: 'tops', style: 'sporty' }

  const formalPref = { formality: 'formal' }
  const casualPref = { formality: 'casual' }

  const formalInFormal = scoreItem(formalSuit, { occasion: 'casual', preferences: formalPref })
  const formalInCasual = scoreItem(formalSuit, { occasion: 'casual', preferences: casualPref })
  const sportyInCasual = scoreItem(sportyTee, { occasion: 'casual', preferences: casualPref })
  const sportyInFormal = scoreItem(sportyTee, { occasion: 'casual', preferences: formalPref })

  assert.ok(formalInFormal.prefPts > formalInCasual.prefPts, 'formal item should score higher under formal preference than casual preference')
  assert.ok(sportyInCasual.prefPts > sportyInFormal.prefPts, 'sporty item should score higher under casual preference than formal preference')
})

// ── 5. Feedback-Aware Ranking (Likes, Dislikes & 1-5 Star Ratings) ─────
test('personalization: past liked looks and star ratings elevate similar garments and combinations', () => {
  const itemFav = { id: 'fav-1', name: 'Loved Top', category: 'tops', style: 'smart-casual', colorHex: '#112233' }
  const itemDisliked = { id: 'dis-1', name: 'Disliked Top', category: 'tops', style: 'smart-casual', colorHex: '#445566' }
  const bottom = { id: 'bot-1', name: 'Neutral Pant', category: 'bottoms', style: 'smart-casual', colorHex: '#CCCCCC' }

  // User previously gave 5 stars and liked itemFav + bottom, and disliked itemDisliked
  const pastLooks = [
    {
      id: 'l-liked',
      itemIds: ['fav-1', 'bot-1'],
      feedback: 'like',
      rating: 5,
      items: [itemFav, bottom],
    },
    {
      id: 'l-disliked',
      itemIds: ['dis-1', 'bot-1'],
      feedback: 'dislike',
      rating: 1,
      items: [itemDisliked, bottom],
    },
  ]

  const wardrobe = [itemFav, itemDisliked, bottom]
  const res = recommendOutfits({ wardrobe, occasion: 'casual', userLooks: pastLooks })

  assert.equal(res.success, true)
  assert.ok(res.recommendations.length >= 2)
  const topRanked = res.recommendations[0]
  assert.ok(topRanked.items.some((i) => i.id === 'fav-1'), 'liked and 5-star pieces must rank above disliked pieces')
  assert.ok(topRanked.explanation.some((e) => /loved and rated highly|highly rated/i.test(e)))
})

// ── 6. Disliked Looks Suffer Synergy Penalty ───────────────────────────
test('personalization: disliked pairing receives ranking penalty', () => {
  const topA = { id: 'ta', category: 'tops', style: 'casual' }
  const botA = { id: 'ba', category: 'bottoms', style: 'casual' }
  const botB = { id: 'bb', category: 'bottoms', style: 'casual' }

  const pastLooks = [
    {
      id: 'bad-combo',
      itemIds: ['ta', 'ba'],
      feedback: 'dislike',
      rating: 1,
    },
  ]

  const rec = recommendOutfits({
    wardrobe: [topA, botA, botB],
    occasion: 'casual',
    userLooks: pastLooks,
  })

  // The combination [ta, bb] should rank higher than [ta, ba]
  assert.equal(rec.success, true)
  assert.ok(rec.recommendations[0].items.some((i) => i.id === 'bb'), 'non-disliked combo must rank first')
})

// ── 7. Bounded Scoring and Determinism ─────────────────────────────────
test('personalization: composite score remains strictly bounded between 35 and 100 and deterministic', () => {
  const wardrobe = [
    { id: 't1', category: 'tops', style: 'casual', colorHex: '#111111' },
    { id: 'b1', category: 'bottoms', style: 'casual', colorHex: '#222222' },
  ]
  const prefs = {
    preferredStyles: ['casual'],
    favoriteColors: ['#111111'],
  }

  const run1 = recommendOutfits({ wardrobe, occasion: 'casual', preferences: prefs })
  const run2 = recommendOutfits({ wardrobe, occasion: 'casual', preferences: prefs })

  assert.equal(run1.look.score, run2.look.score)
  assert.deepEqual(run1.look.breakdown, run2.look.breakdown)
  assert.ok(run1.look.score >= 35 && run1.look.score <= 100)
  assert.ok(run1.look.breakdown.preference >= 0 && run1.look.breakdown.preference <= 100)
})

// ── 8. New Users With Sparse Metadata / No Feedback ────────────────────
test('personalization: handles new users with zero feedback and no preferences gracefully', () => {
  const wardrobe = [
    { id: 'bare-1', category: 'tops' },
    { id: 'bare-2', category: 'bottoms' },
  ]
  const out = recommendOutfits({ wardrobe, occasion: 'casual', preferences: {}, userLooks: [] })
  assert.equal(out.success, true)
  assert.ok(out.look)
  assert.equal(out.look.breakdown.preference, null, 'preference breakdown must be null when no preferences configured')
})

// ── 9. Wear Event Recording via POST /api/wardrobe/wear ─────────────────
test('personalization: POST /api/wardrobe/wear truthfully increments wear count and updates last_worn_at', async () => {
  const s = await session(base, 'wear-tracker@test.com')

  // Save an item
  const item = {
    id: `wear-item-${Date.now()}`,
    name: 'Oxford Cotton Shirt',
    category: 'tops',
    style: 'smart-casual',
    timesWorn: 0,
  }
  await saveItems(base, s.token, [item])

  // Record wear event
  const wearRes = await fetch(`${base}/api/wardrobe/wear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${s.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ itemIds: [item.id] }),
  })
  assert.equal(wearRes.status, 200)
  const wearJson = await wearRes.json()
  assert.equal(wearJson.success, true)
  assert.equal(wearJson.updated, 1)
  assert.equal(wearJson.items[0].timesWorn, 1)
  assert.ok(wearJson.items[0].lastWornAt)

  // Verify in GET /api/wardrobe/items/:id
  const getRes = await fetch(`${base}/api/wardrobe/items/${item.id}`, {
    headers: { Authorization: `Bearer ${s.token}` },
  })
  const getJson = await getRes.json()
  assert.equal(getJson.item.timesWorn, 1)
  assert.ok(getJson.item.lastWornAt)
})

// ── 10. Duplicate Wear-Event Prevention ────────────────────────────────
test('personalization: prevents accidental duplicate wear events on rapid clicks', async () => {
  const s = await session(base, 'wear-dedup@test.com')

  const item = {
    id: `dedup-item-${Date.now()}`,
    name: 'Denim Jacket',
    category: 'outerwear',
    timesWorn: 2,
  }
  await saveItems(base, s.token, [item])

  // First wear
  const first = await (await fetch(`${base}/api/wardrobe/wear`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ itemIds: [item.id] }),
  })).json()
  assert.equal(first.items[0].timesWorn, 3)

  // Immediate second wear call within 60s
  const second = await (await fetch(`${base}/api/wardrobe/wear`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ itemIds: [item.id] }),
  })).json()
  assert.equal(second.duplicatePrevented, true, 'rapid repeated wear request must be debounced')
  assert.equal(second.items[0].timesWorn, 3, 'times_worn must NOT be double-incremented')
})

// ── 11. Cross-User Isolation on Wear Events ───────────────────────────
test('personalization: user cannot record wear event on another users garments', async () => {
  const alice = await session(base, 'alice-wear@test.com')
  const bob = await session(base, 'bob-wear@test.com')

  const aliceItem = { id: `alice-piece-${Date.now()}`, name: 'A Dress', category: 'dresses' }
  await saveItems(base, alice.token, [aliceItem])

  // Bob tries to mark Alice's garment as worn
  const crossWear = await fetch(`${base}/api/wardrobe/wear`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bob.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ itemIds: [aliceItem.id] }),
  })
  assert.equal(crossWear.status, 403, 'cross-user wear event must be rejected with 403')
})

// ── 12. Freshness Rotation Bonus ──────────────────────────────────────
test('personalization: unworn pieces receive freshness bonus over heavily worn pieces', () => {
  const unwornShirt = { id: 'unworn', category: 'tops', style: 'casual', timesWorn: 0 }
  const overwornShirt = { id: 'overworn', category: 'tops', style: 'casual', timesWorn: 12 }

  const scoreUnworn = scoreItem(unwornShirt, { occasion: 'casual' })
  const scoreOverworn = scoreItem(overwornShirt, { occasion: 'casual' })

  assert.ok(scoreUnworn.feedbackPts > scoreOverworn.feedbackPts, 'unworn piece must receive freshness rotation bonus')
})
