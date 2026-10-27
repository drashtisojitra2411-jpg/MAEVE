import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp, startServer } from '../src/app.js'
import { initDb, createStore, backupDb } from '../src/db.js'
import { validateUpload } from '../src/validation.js'
import { validateConfig } from '../src/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TMP_DIR = path.join(__dirname, 'fixtures', 'tmp-prod-test')

let server
let base
let db

before(async () => {
  fs.mkdirSync(TMP_DIR, { recursive: true })
  const testDbFile = path.join(TMP_DIR, 'prod_test.db')
  if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile)
  db = initDb(testDbFile)
  const app = createApp({ db })
  server = await startServer(app, 0)
  const port = server.address().port
  base = `http://127.0.0.1:${port}`
})

after(async () => {
  if (server) await server.close()
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true })
  } catch {}
})

test('production: config validator inspects configuration integrity', () => {
  const result = validateConfig()
  assert.equal(typeof result.valid, 'boolean')
  assert.ok(Array.isArray(result.issues))
  assert.equal(typeof result.summary.port, 'number')
})

test('security: magic bytes validation strictly rejects non-image RIFF files (WAV audio)', () => {
  // A WAV audio file starts with RIFF (bytes 0..3) but has "WAVE" at offset 8..11 instead of "WEBP"
  const fakeWav = Buffer.alloc(32)
  fakeWav.write('RIFF', 0, 'ascii')
  fakeWav.writeUInt32LE(24, 4) // file size
  fakeWav.write('WAVE', 8, 'ascii') // NOT "WEBP"

  const result = validateUpload(fakeWav, 'image/webp')
  assert.equal(result.ok, false, 'WAV audio file must NOT be accepted as image/webp')
  assert.equal(result.code, 'UNSUPPORTED_FILE')
})

test('security: valid WebP image with both RIFF and WEBP signature is accepted', () => {
  const validWebp = Buffer.alloc(32)
  validWebp.write('RIFF', 0, 'ascii')
  validWebp.writeUInt32LE(24, 4)
  validWebp.write('WEBP', 8, 'ascii')

  const result = validateUpload(validWebp, 'image/webp')
  assert.equal(result.ok, true, 'Genuine WebP signature must be accepted')
  assert.equal(result.probe.type, 'image/webp')
})

test('security: HTTP security headers are enforced on all responses', async () => {
  const res = await fetch(`${base}/api/health`)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(res.headers.get('x-frame-options'), 'DENY')
  assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
  assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin')
})

test('security: unauthorized file access and forbidden file extensions are blocked', async () => {
  // Unauthenticated file access
  const unauthRes = await fetch(`${base}/api/files/anyuser/job123/original.jpg`)
  assert.equal(unauthRes.status, 401)

  // Register user and get session
  const regRes = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Sec User', email: 'sec_file_test@maeve.com', password: 'password123' }),
  })
  const { token, user } = await regRes.json()

  // Forbidden extension (.json or .exe)
  const forbiddenExtRes = await fetch(`${base}/api/files/${encodeURIComponent(user.id)}/job123/secret.json`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  assert.equal(forbiddenExtRes.status, 403, 'Forbidden extensions must be rejected with 403')
  const forbiddenBody = await forbiddenExtRes.json()
  assert.equal(forbiddenBody.code, 'FORBIDDEN')
})

test('security: rate limiting protects authentication endpoints from brute force', async () => {
  // Rapid burst of 35 login attempts with bad credentials
  const attempts = []
  for (let i = 0; i < 35; i++) {
    attempts.push(
      fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'sec_file_test@maeve.com', password: `wrong_${i}` }),
      }),
    )
  }
  const results = await Promise.all(attempts)
  const statuses = results.map((r) => r.status)

  // With a max limit of 30, later requests must receive 429 Too Many Requests
  const hasRateLimited = statuses.some((s) => s === 429)
  assert.ok(hasRateLimited, 'Rate limiter must return 429 after threshold is exceeded')

  const rateLimitedRes = results.find((r) => r.status === 429)
  assert.ok(rateLimitedRes.headers.get('retry-after'), '429 response must include Retry-After header')
})

test('database: multi-record operations are wrapped in transactions', () => {
  const store = createStore(db)
  const userId = 'tx_user_test@maeve.com'

  const items = [
    { id: 'tx_1', name: 'Item 1', category: 'tops', color: 'White' },
    { id: 'tx_2', name: 'Item 2', category: 'bottoms', color: 'Black' },
    { id: 'tx_3', name: 'Item 3', category: 'footwear', color: 'Brown' },
  ]

  store.saveItems(userId, items)
  const persisted = store.listItems(userId)
  assert.equal(persisted.length, 3, 'All items must be committed atomically')

  // Test atomic wear recording
  const wearResult = store.recordWear(userId, { itemIds: ['tx_1', 'tx_2'] })
  assert.equal(wearResult.updated, 2)
  assert.equal(wearResult.items.length, 2)
  assert.equal(wearResult.items[0].timesWorn, 1)
  assert.equal(wearResult.items[1].timesWorn, 1)
})

test('database: hot backup creates a valid point-in-time SQLite snapshot', () => {
  const backupFile = path.join(TMP_DIR, 'snapshot_test.db')
  const backup = backupDb(db, backupFile)

  assert.equal(backup.success, true)
  assert.ok(fs.existsSync(backupFile), 'Backup file must exist')
  assert.ok(backup.bytes > 0, 'Backup file must be non-empty')

  // Verify file has valid SQLite format 3 magic bytes
  const fd = fs.openSync(backupFile, 'r')
  const header = Buffer.alloc(16)
  fs.readSync(fd, header, 0, 16, 0)
  fs.closeSync(fd)
  assert.equal(header.toString('utf8', 0, 15), 'SQLite format 3')

  // Verify snapshot can be mounted and read independently
  const snapshotDb = initDb(backupFile)
  const snapshotStore = createStore(snapshotDb)
  const items = snapshotStore.listItems('tx_user_test@maeve.com')
  assert.equal(items.length, 3, 'Snapshot must preserve persisted records')
})
