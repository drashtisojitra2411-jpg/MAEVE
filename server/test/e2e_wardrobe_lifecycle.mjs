import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startTestServer } from './helpers.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let BASE = process.env.MAEVE_API_URL
let mainServer

before(async () => {
  if (!BASE) {
    mainServer = await startTestServer()
    BASE = mainServer.base
  }
})

after(async () => {
  if (mainServer) await mainServer.close()
})

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'real-14577586.jpg')

async function register(email, password = 'password123', name = 'Audit Tester') {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  })
  assert.equal(res.status, 201, `Failed to register ${email}`)
  return res.json()
}

async function login(email, password = 'password123') {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  assert.equal(res.status, 200, `Failed to login ${email}`)
  return res.json()
}

async function logout(token) {
  const res = await fetch(`${BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

async function uploadGarment(token, filePath) {
  const buffer = fs.readFileSync(filePath)
  const fd = new FormData()
  fd.append('image', new Blob([buffer], { type: 'image/jpeg' }), path.basename(filePath))

  const res = await fetch(`${BASE}/api/garments/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  })
  assert.equal(res.status, 201, 'Upload failed')
  return res.json()
}

async function waitForJob(token, jobId, timeoutMs = 120000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${BASE}/api/garments/analyze/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.status, 200)
    const job = await res.json()
    if (job.status === 'complete') return job
    if (job.status === 'failed') throw new Error(`Job failed: ${JSON.stringify(job.error)}`)
    await new Promise((r) => setTimeout(r, 600))
  }
  throw new Error(`Job timed out after ${timeoutMs}ms`)
}

test('MAEVE Phase 2: Complete End-to-End Wardrobe Lifecycle Verification', async () => {
  const testEmail = `e2e_${Date.now()}@test.com`
  console.log(`\n[1/12] Registering fresh user: ${testEmail}...`)
  const reg = await register(testEmail)
  const token1 = reg.token
  assert.ok(token1, 'Session token 1 issued')

  console.log('[2/12] Verifying initial empty wardrobe...')
  const initList = await fetch(`${BASE}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${token1}` },
  }).then((r) => r.json())
  assert.equal(initList.success, true)
  assert.equal(initList.items.length, 0, 'Initial wardrobe must be empty')

  console.log('[3/12] Uploading real garment photo to CV worker...')
  const upload = await uploadGarment(token1, FIXTURE_PATH)
  const jobId = upload.jobId
  assert.ok(jobId, 'Analysis job created')

  console.log(`[4/12] Waiting for CV segmentation and attribute isolation (Job: ${jobId})...`)
  const job = await waitForJob(token1, jobId)
  assert.equal(job.status, 'complete')
  assert.ok(job.result.garments.length >= 1, 'At least 1 garment detected')
  const detected = job.result.garments[0]
  console.log(`  -> Detected category: ${detected.category}, subcategory: ${detected.subcategory}, color: ${detected.color} (${detected.colorHex}), confidence: ${Math.round(detected.confidence * 100)}%`)
  assert.ok(detected.isolatedImageUrl, 'Isolated image URL generated')
  assert.ok(detected.thumbnailUrl, 'Thumbnail image URL generated')

  console.log('[5/12] User confirms and edits attributes before saving...')
  const confirmedItem = {
    id: `item_${Date.now()}`,
    name: 'Audited Silk Shirt',
    category: detected.category || 'tops',
    subcategory: detected.subcategory || null,
    color: detected.color || 'blue',
    colorHex: detected.colorHex || null,
    style: 'formal',
    pattern: 'solid',
    imageUrl: detected.thumbnailUrl,
    isolatedImageUrl: detected.isolatedImageUrl,
    originalImageUrl: detected.originalImageUrl,
    confidence: detected.confidence,
    needsUserInput: false,
    userCorrected: true,
  }

  const saveRes = await fetch(`${BASE}/api/wardrobe/items`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token1}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ items: [confirmedItem] }),
  })
  assert.equal(saveRes.status, 201)
  const saveBody = await saveRes.json()
  assert.equal(saveBody.items.length, 1)
  console.log('  -> Garment saved successfully.')

  console.log('[6/12] Verifying wardrobe list and asset URL accessibility...')
  const wardrobe = await fetch(`${BASE}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${token1}` },
  }).then((r) => r.json())
  assert.equal(wardrobe.items.length, 1, 'Wardrobe count is 1')
  const savedGarment = wardrobe.items[0]
  assert.equal(savedGarment.name, 'Audited Silk Shirt')
  assert.equal(savedGarment.style, 'formal')
  assert.equal(savedGarment.pattern, 'solid')
  assert.equal(savedGarment.userCorrected, true)

  // Verify image loads with token
  const imgRes = await fetch(`${BASE}${savedGarment.imageUrl}`)
  assert.equal(imgRes.status, 200, 'Garment image fetched successfully')
  assert.match(imgRes.headers.get('content-type'), /image\//)

  console.log('[7/12] Testing token rotation across re-login...')
  // Logout token1
  await logout(token1)
  const postLogout = await fetch(`${BASE}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${token1}` },
  })
  assert.equal(postLogout.status, 401, 'Old session token correctly revoked')

  // Login fresh session
  const loginRes = await login(testEmail)
  const token2 = loginRes.token
  assert.notEqual(token2, token1, 'New session token generated')

  const wardrobe2 = await fetch(`${BASE}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${token2}` },
  }).then((r) => r.json())
  assert.equal(wardrobe2.items.length, 1, 'Garment persisted across re-login')
  const reloadedItem = wardrobe2.items[0]
  assert.ok(reloadedItem.imageUrl.includes(`token=${encodeURIComponent(token2)}`), 'Image URL updated with active token')

  const imgRes2 = await fetch(`${BASE}${reloadedItem.imageUrl}`)
  assert.equal(imgRes2.status, 200, 'Image remains accessible with new session token')

  console.log('[8/12] Testing upload retry and upsert deduplication...')
  // Save same item ID again with an updated attribute
  const retrySave = await fetch(`${BASE}/api/wardrobe/items`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token2}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ items: [{ ...confirmedItem, timesWorn: 1 }] }),
  })
  assert.equal(retrySave.status, 201)
  const retryList = await fetch(`${BASE}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${token2}` },
  }).then((r) => r.json())
  assert.equal(retryList.items.length, 1, 'No duplicate created on retry')
  assert.equal(retryList.items[0].timesWorn, 1, 'Existing record updated')

  console.log('[9/12] Testing metadata editing via PUT /api/wardrobe/items/:id...')
  const putRes = await fetch(`${BASE}/api/wardrobe/items/${confirmedItem.id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token2}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Audited Silk Shirt - Tailored',
      style: 'smart-casual',
      color: 'navy',
    }),
  })
  assert.equal(putRes.status, 200)
  const putBody = await putRes.json()
  assert.equal(putBody.item.name, 'Audited Silk Shirt - Tailored')
  assert.equal(putBody.item.style, 'smart-casual')
  assert.equal(putBody.item.color, 'navy')

  // Verify persistence via GET
  const getSingle = await fetch(`${BASE}/api/wardrobe/items/${confirmedItem.id}`, {
    headers: { Authorization: `Bearer ${token2}` },
  }).then((r) => r.json())
  assert.equal(getSingle.item.name, 'Audited Silk Shirt - Tailored')

  console.log('[10/12] Testing cross-user isolation and security...')
  const otherUser = await register(`other_${Date.now()}@test.com`)
  const otherToken = otherUser.token

  // Other user cannot GET or PUT this item
  const crossGet = await fetch(`${BASE}/api/wardrobe/items/${confirmedItem.id}`, {
    headers: { Authorization: `Bearer ${otherToken}` },
  })
  assert.equal(crossGet.status, 404, 'Cross-user GET blocked')

  const crossPut = await fetch(`${BASE}/api/wardrobe/items/${confirmedItem.id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${otherToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name: 'Tampered Name' }),
  })
  assert.equal(crossPut.status, 404, 'Cross-user PUT blocked')

  // Other user cannot access this image file
  const crossFile = await fetch(`${BASE}${savedGarment.imageUrl}`, {
    headers: { Authorization: `Bearer ${otherToken}` },
  })
  assert.equal(crossFile.status, 403, 'Cross-user file access blocked')

  console.log('[11/12] Testing garment deletion and persistence...')
  const delRes = await fetch(`${BASE}/api/wardrobe/items/${confirmedItem.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token2}` },
  })
  assert.equal(delRes.status, 200, 'Deletion succeeded')

  const afterDel = await fetch(`${BASE}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${token2}` },
  }).then((r) => r.json())
  assert.equal(afterDel.items.length, 0, 'Wardrobe is empty after deletion')

  console.log('[12/12] Verifying deletion persists on reload/new query...')
  const reloadAfterDel = await fetch(`${BASE}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${token2}` },
  }).then((r) => r.json())
  assert.equal(reloadAfterDel.items.length, 0, 'Wardrobe remains empty after reload')

  console.log('\n>>> ALL 12 END-TO-END VALIDATION STAGES PASSED SUCCESSFULLY! <<<\n')
})
