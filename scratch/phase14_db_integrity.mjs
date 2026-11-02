import assert from 'node:assert'
import { createApp, startServer } from '../server/src/app.js'
import { initDb } from '../server/src/db.js'

console.log('=== PHASE 14: DATABASE & DATA INTEGRITY TESTING ===')

const db = initDb(':memory:')
const app = createApp({ db })
const server = await startServer(app, 0)
const port = server.address().port
const base = `http://127.0.0.1:${port}`

const results = []
function record(id, name, pass, detail) {
  results.push({ id, name, pass, detail })
  console.log(`${pass ? '✔ PASS' : '✖ FAIL'} [${id}/12]: ${name} (${detail})`)
}

try {
  // Setup 2 distinct users
  const reg1 = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Integrity User 1', email: `int1_${Date.now()}@test.com`, password: 'Password123!' }),
  })
  const { token: token1, user: u1 } = await reg1.json()

  const reg2 = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Integrity User 2', email: `int2_${Date.now()}@test.com`, password: 'Password123!' }),
  })
  const { token: token2, user: u2 } = await reg2.json()

  // 1. User records
  const userRow = db.prepare('SELECT id, email, name, password_hash, created_at FROM users WHERE id = ?').get(u1.id)
  record(1, 'User record persistence & schema', Boolean(userRow && userRow.email === u1.email), 'Fields: id, email, name, password_hash, created_at')

  // 2. Wardrobe records
  const item1 = { id: 'int_item_1', name: 'Silk Shirt', category: 'tops', subcategory: 'shirt', color: 'White', colorHex: '#FFFFFF' }
  const item2 = { id: 'int_item_2', name: 'Wool Trousers', category: 'bottoms', subcategory: 'trousers', color: 'Navy', colorHex: '#000080' }
  await fetch(`${base}/api/wardrobe/items`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [item1, item2] }),
  })
  const itemRow = db.prepare('SELECT id, user_id, name, category, color FROM wardrobe_items WHERE id = ?').get('int_item_1')
  record(2, 'Wardrobe record persistence', itemRow?.user_id === u1.id, `User ID: ${itemRow?.user_id}`)

  // 3. Garment metadata integrity
  record(3, 'Garment metadata fidelity', itemRow?.name === 'Silk Shirt' && itemRow?.category === 'tops', 'Metadata matches inserted values')

  // 4. Image references
  const imageItem = { id: 'int_img_1', name: 'Test Cutout', category: 'tops', imageUrl: '/api/files/test/job1/cutout.png', isolatedImageUrl: '/api/files/test/job1/cutout.png' }
  await fetch(`${base}/api/wardrobe/items`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [imageItem] }),
  })
  const imgRow = db.prepare('SELECT image_url, isolated_image_url FROM wardrobe_items WHERE id = ?').get('int_img_1')
  record(4, 'Image references schema integrity', imgRow?.image_url === '/api/files/test/job1/cutout.png', 'URLs stored cleanly')

  // 5. Saved outfits (looks table)
  const saveLook = await fetch(`${base}/api/looks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ occasion: 'formal', itemIds: ['int_item_1', 'int_item_2'], score: 90 }),
  })
  const { look } = await saveLook.json()
  const lookRow = db.prepare('SELECT id, user_id, occasion, score FROM looks WHERE id = ?').get(look.id)
  record(5, 'Saved outfit records (looks table)', Boolean(lookRow && lookRow.user_id === u1.id), `Look ID: ${lookRow?.id}`)

  // 6. Feedback & rating persistence
  await fetch(`${base}/api/looks/${look.id}/feedback`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token1}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating: 5, feedback: 'like' }),
  })
  const feedbackRow = db.prepare('SELECT rating, feedback FROM looks WHERE id = ?').get(look.id)
  record(6, 'Feedback and star ratings persistence', feedbackRow?.rating === 5 && feedbackRow?.feedback === 'like', `Rating: ${feedbackRow?.rating}`)

  // 7. Weather/recommendation records in profiles
  const profRes = await fetch(`${base}/api/profile`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token1}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: { name: 'Tokyo', latitude: 35.6762, longitude: 139.6503 },
      style: 'minimalist',
      preferences: { preferredStyles: ['minimalist'] }
    }),
  })
  assert.equal(profRes.status, 200, `Profile update expected 200, got ${profRes.status}`)
  const profileRow = db.prepare('SELECT location_name, style, preferences FROM profiles WHERE user_id = ?').get(u1.id)
  const profileJson = JSON.parse(profileRow.preferences)
  record(7, 'Profile preferences & location storage', profileJson.preferredStyles?.includes('minimalist') && profileRow.location_name === 'Tokyo', 'Stored in profiles table')

  // 8. Foreign-key relationships & constraints
  const pragmaFk = db.prepare('PRAGMA foreign_keys').get()
  record(8, 'Foreign-key enforcement pragma', pragmaFk.foreign_keys === 1, 'PRAGMA foreign_keys = ON')

  // 9. Deletion propagation (deleting garment keeps history renderable via snapshot)
  await fetch(`${base}/api/wardrobe/items/int_item_1`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token1}` },
  })
  const lookAfterGarmentDel = await fetch(`${base}/api/looks/${look.id}`, {
    headers: { Authorization: `Bearer ${token1}` },
  })
  const lookAfterDelJson = await lookAfterGarmentDel.json()
  record(9, 'Deletion propagation safety', lookAfterDelJson.success === true && lookAfterDelJson.look.items.length === 2, 'Snapshot in look preserves look integrity')

  // 10. User isolation (User 2 queries items and looks)
  const u2Items = await fetch(`${base}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${token2}` },
  })
  const u2ItemsJson = await u2Items.json()
  const u2Looks = await fetch(`${base}/api/looks`, {
    headers: { Authorization: `Bearer ${token2}` },
  })
  const u2LooksJson = await u2Looks.json()
  record(10, 'Strict user isolation in DB', u2ItemsJson.items.length === 0 && u2LooksJson.looks.length === 0, 'User 2 cannot see User 1 rows')

  // 11. Persistence after refresh
  const refreshItems = await fetch(`${base}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${token1}` },
  })
  const refreshJson = await refreshItems.json()
  record(11, 'Persistence across page refreshes', refreshJson.items.some(i => i.id === 'int_item_2'), 'Remaining items intact')

  // 12. Persistence after logout/login
  await fetch(`${base}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
  })
  const relogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u1.email, password: 'Password123!' }),
  })
  const { token: t1New } = await relogin.json()
  const reloginItems = await fetch(`${base}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${t1New}` },
  })
  const reloginJson = await reloginItems.json()
  record(12, 'Persistence across logout/re-login', reloginJson.items.length === 2, 'Wardrobe records persistent across sessions')

  const passed = results.filter(r => r.pass).length
  console.log(`\nPHASE 14 SUMMARY: ${passed}/${results.length} PASSED (${Math.round((passed / results.length) * 100)}%)`)
} finally {
  server.close()
}
