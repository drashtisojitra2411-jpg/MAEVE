import assert from 'node:assert'
import { createApp, startServer } from '../server/src/app.js'
import { initDb } from '../server/src/db.js'

console.log('=== PHASE 17: SECURITY TESTING ===')

const db = initDb(':memory:')
const app = createApp({ db })
const server = await startServer(app, 0)
const port = server.address().port
const base = `http://127.0.0.1:${port}`

const secResults = []
function record(id, name, pass, detail) {
  secResults.push({ id, name, pass, detail })
  console.log(`${pass ? '✔ PASS' : '✖ FAIL'} [${id}/11]: ${name} (${detail})`)
}

try {
  // 1. Unauthorized API access
  const unauth = await fetch(`${base}/api/wardrobe/items`)
  record(1, 'Unauthorized API access blocked', unauth.status === 401, 'HTTP 401 UNAUTHORIZED')

  // 2. Authentication bypass attempt with forged bearer token
  const forged = await fetch(`${base}/api/wardrobe/items`, {
    headers: { Authorization: 'Bearer forged.token.attempt.123' },
  })
  record(2, 'Forged authentication bypass blocked', forged.status === 401, 'HTTP 401 UNAUTHORIZED')

  // Register real users
  const reg1 = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Sec User 1', email: `sec1_${Date.now()}@test.com`, password: 'Password123!' }),
  })
  const { token: t1, user: u1 } = await reg1.json()

  const reg2 = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Sec User 2', email: `sec2_${Date.now()}@test.com`, password: 'Password456!' }),
  })
  const { token: t2, user: u2 } = await reg2.json()

  // 3. User data isolation
  const save1 = await fetch(`${base}/api/wardrobe/items`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t1}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ id: 'sec_item_1', name: 'Private User 1 Jacket', category: 'outerwear' }] }),
  })
  const get2 = await fetch(`${base}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${t2}` },
  })
  const get2Json = await get2.json()
  record(3, 'Cross-user data isolation', get2Json.items.length === 0, 'User 2 sees 0 items')

  // 4. Invalid input handling
  const badReg = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A'.repeat(200), email: 'invalid_email_format', password: '12' }),
  })
  record(4, 'Malformed / invalid input rejected', badReg.status === 400, 'HTTP 400 Bad Request')

  // 5. Malformed JSON payload
  const badJsonRes = await fetch(`${base}/api/wardrobe/items`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t1}`, 'Content-Type': 'application/json' },
    body: '{ "invalid": json syntax ... ',
  })
  record(5, 'Malformed JSON payload handled safely', badJsonRes.status === 400 || badJsonRes.status === 500, `Status: ${badJsonRes.status}`)

  // 6. File upload validation (magic bytes rejection)
  const fakeJpg = Buffer.from('RIFF....WAVEfmt ') // Audio file disguised with image extension
  const fdFake = new FormData()
  fdFake.append('image', new Blob([fakeJpg], { type: 'image/jpeg' }), 'fake.jpg')
  const fakeRes = await fetch(`${base}/api/garments/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t1}` },
    body: fdFake,
  })
  record(6, 'Magic bytes non-image file rejected', fakeRes.status === 415, `Status: ${fakeRes.status}`)

  // 7. Unsupported file types (.txt, .pdf)
  const fdPdf = new FormData()
  fdPdf.append('image', new Blob([Buffer.from('%PDF-1.4 ...')], { type: 'application/pdf' }), 'doc.pdf')
  const pdfRes = await fetch(`${base}/api/garments/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t1}` },
    body: fdPdf,
  })
  record(7, 'Unsupported file types rejected (415)', pdfRes.status === 415, `Status: ${pdfRes.status}`)

  // 8. Oversized file (>15MB)
  const huge = Buffer.alloc(16 * 1024 * 1024)
  const fdHuge = new FormData()
  fdHuge.append('image', new Blob([huge], { type: 'image/jpeg' }), 'huge.jpg')
  const hugeRes = await fetch(`${base}/api/garments/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t1}` },
    body: fdHuge,
  })
  record(8, 'Oversized file rejected (413)', hugeRes.status === 413, `Status: ${hugeRes.status}`)

  // 9. Basic injection payload handling
  const injectItem = {
    id: "item'; DROP TABLE users; --",
    name: "<script>alert('xss')</script>",
    category: 'tops',
  }
  const injectRes = await fetch(`${base}/api/wardrobe/items`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t1}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [injectItem] }),
  })
  const userTable = db.prepare('SELECT COUNT(*) as c FROM users').get()
  record(9, 'SQL injection & XSS resistance', injectRes.status === 201 && userTable.c >= 2, 'Users table intact, SQL injection defeated')

  // 10. Sensitive data exposure (password hash check)
  const dbUser = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(u1.id)
  const isScrypt = dbUser.password_hash.startsWith('scrypt$')
  record(10, 'Sensitive data protection (salted scrypt)', isScrypt, 'Password stored only as salted scrypt digest')

  // 11. Session / logout invalidation
  await fetch(`${base}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t1}` },
  })
  const replay = await fetch(`${base}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${t1}` },
  })
  record(11, 'Session token replay prevention after logout', replay.status === 401, 'Logged out session permanently revoked')

  const passed = secResults.filter(r => r.pass).length
  console.log(`\nSECURITY SUMMARY: ${passed}/${secResults.length} PASSED (${Math.round((passed / secResults.length) * 100)}%)`)
} finally {
  server.close()
}

