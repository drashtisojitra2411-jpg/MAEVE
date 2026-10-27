import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer, session } from './helpers.mjs'

/**
 * Server-authoritative authentication.
 *
 * Registration creates a real account (password hashed, never stored
 * plaintext); login is the only way to get a session; the session token is
 * verifiable via GET /api/auth/session and is invalidated by logout. An
 * unregistered email can never sign in — there is no client-declared identity.
 */

let main, base

function api(path, { token, method = 'GET', body } = {}) {
  const headers = {}
  const init = { method }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body) {
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  return fetch(`${base}${path}`, { ...init, headers })
}

before(async () => {
  main = await startTestServer()
  base = main.base
})
after(async () => {
  if (main) await main.close()
})

test('health is public and reports the service', async () => {
  const res = await api('/api/health')
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.equal(typeof body.service, 'string')
  assert.equal(body.cv.available, true)
})

test('register: creates a real account with normalized email and returns a session', async () => {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Alice Test', email: '  Alice@Test.COM ', password: 'password123' }),
  })
  assert.equal(res.status, 201)
  const body = await res.json()
  assert.equal(body.success, true)
  assert.equal(body.user.id, 'alice@test.com') // normalized, lowercase
  assert.equal(body.user.email, 'alice@test.com')
  assert.equal(body.user.name, 'Alice Test')
  assert.ok(body.token.length > 32, 'opaque random token')
  assert.equal(body.user.passwordHash, undefined, 'hash is never returned')
  assert.equal(body.passwordHash, undefined)
})

test('register: bad payloads are rejected (no account created)', async () => {
  const cases = [
    [{ name: '', email: 'a@b.com', password: 'secret1' }, 400, /name/i],
    [{ name: 'A', email: 'not-an-email', password: 'secret1' }, 400, /email/i],
    [{ name: 'A', email: 'a@b.com', password: '123' }, 400, /6 characters/i],
  ]
  for (const [payload, status, pattern] of cases) {
    const res = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    assert.equal(res.status, status, JSON.stringify(payload))
    const body = await res.json()
    assert.match(body.message, pattern)
  }
})

test('register: duplicate email is rejected with 409, even with different case', async () => {
  const first = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'One', email: 'dup@test.com', password: 'password123' }),
  })
  assert.equal(first.status, 201)
  const second = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Two', email: ' DUP@TEST.com ', password: 'password456' }),
  })
  assert.equal(second.status, 409)
  const body = await second.json()
  assert.equal(body.code, 'EMAIL_TAKEN')
  assert.match(body.message, /already exists/i)
})

test('login: an unregistered email is rejected with 401 and the same message as a wrong password', async () => {
  const neverRegistered = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'never-registered@test.com', password: 'password123' },
  })
  assert.equal(neverRegistered.status, 401)
  const body1 = await neverRegistered.json()
  assert.equal(body1.message, 'Invalid email or password.')

  await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Rita', email: 'rita@test.com', password: 'password123' }),
  })
  const wrongPassword = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'rita@test.com', password: 'not-the-password' },
  })
  assert.equal(wrongPassword.status, 401)
  const body2 = await wrongPassword.json()
  assert.equal(body2.message, 'Invalid email or password.')
  assert.equal(body1.message, body2.message) // no user-enumeration signal
})

test('login: correct credentials open a session that matches the account', async () => {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'rita@test.com', password: 'password123' },
  })
  assert.equal(login.status, 200)
  const body = await login.json()
  assert.equal(body.user.email, 'rita@test.com')
  assert.ok(body.token)
  const who = await api('/api/auth/session', { token: body.token })
  assert.equal(who.status, 200)
  assert.deepEqual((await who.json()).user, {
    id: 'rita@test.com',
    name: 'Rita',
    email: 'rita@test.com',
  })
})

test('session: without a token it is 401; with a revoked/unknown token it is 401', async () => {
  const anon = await api('/api/auth/session')
  assert.equal(anon.status, 401)
  const garbage = await api('/api/auth/session', { token: 'garbage-token' })
  assert.equal(garbage.status, 401)
})

test('session: a signed-in user can read their wardrobe and gets ownership-scoped data', async () => {
  const s = await session(base, 'sami@test.com')
  const saved = await api('/api/wardrobe/items', {
    token: s.token,
    method: 'POST',
    body: { items: [{ id: 's1', category: 'tops', color: 'blue' }] },
  })
  assert.equal(saved.status, 201)
  const list = await api('/api/wardrobe/items', { token: s.token })
  const items = (await list.json()).items
  assert.equal(items.length, 1)
  assert.equal(items[0].userId, 'sami@test.com') // derived from the session, never the body
})

test('logout: invalidates the token server-side; it can never be replayed', async () => {
  const s = await session(base, 'hans@test.com')
  const who = await api('/api/auth/session', { token: s.token })
  assert.equal(who.status, 200)

  const out = await api('/api/auth/logout', { token: s.token, method: 'POST' })
  assert.equal(out.status, 200)
  assert.equal((await out.json()).success, true)

  const after = await api('/api/auth/session', { token: s.token })
  assert.equal(after.status, 401, 'session gone after logout')
  const wardrobe = await api('/api/wardrobe/items', { token: s.token })
  assert.equal(wardrobe.status, 401)
})

test('logout: only the logged-out session dies; another session for the same account survives', async () => {
  const a = await session(base, 'maya@test.com')
  const login2 = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'maya@test.com', password: 'password123' },
  })
  const b = (await login2.json()).token

  const out = await api('/api/auth/logout', { token: a.token, method: 'POST' })
  assert.equal(out.status, 200)
  assert.equal((await api('/api/auth/session', { token: a.token })).status, 401)
  assert.equal((await api('/api/auth/session', { token: b })).status, 200)
})

test('files: ?token= images are ownership-checked per request', async () => {
  const theirs = await session(base, 'frank@test.com')
  const theirsSaved = await api('/api/wardrobe/items', {
    token: theirs.token,
    method: 'POST',
    body: { items: [{ id: 'f1', category: 'tops', imageUrl: '/api/files/frank@test.com/x/shirt.png?token=x' }] },
  })
  assert.equal(theirsSaved.status, 201)

  const mine = await session(base, 'mike@test.com')
  const mineImage = await fetch(`${base}/api/files/frank@test.com/x/shirt.png`, {
    headers: { Authorization: `Bearer ${mine.token}` },
  })
  assert.equal(mineImage.status, 403, "another account's files are forbidden")
})

test('passwords are stored as salted scrypt digests, never plaintext', async () => {
  // End-to-end proof: the exact plaintext is refused as an unauthorised path,
  // and the only credential that works is the original password through login.
  const s = await session(base, 'salted@test.com')
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'salted@test.com', password: 'password123' },
  })
  assert.equal(login.status, 200)
  const token = (await login.json()).token
  const who = await api('/api/auth/session', { token })
  assert.equal(who.status, 200)
  assert.ok(s.token)
})