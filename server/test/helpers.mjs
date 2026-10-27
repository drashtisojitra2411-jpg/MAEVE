import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../src/app.js'

const FIXTURES = path.join(import.meta.dirname, 'fixtures')

export function fixtures(name) {
  return path.join(FIXTURES, name)
}

export function readFixture(name) {
  return fs.readFileSync(fixtures(name))
}

export function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `maeve-test-${label}-`))
  return dir
}

/**
 * Boot an isolated test server. Every server instance gets its own data dir
 * and sqlite db. `config.pythonBin` resolves the project venv automatically
 * (server/cv/.venv); set MAEVE_PYTHON explicitly only to override it.
 */
export async function startTestServer({ baseDir, failAnalysis = false } = {}) {
  const dir = baseDir ?? tempDir('app')
  const overrides = {
    MAEVE_DATA_DIR: path.join(dir, 'data'),
    MAEVE_DB: path.join(dir, 'maeve.db'),
    MAEVE_FAV_FAIL: failAnalysis ? '1' : '',
    MAEVE_SESSION_SECRET: 'test-secret',
  }
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v

  const app = createApp()
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const base = `http://127.0.0.1:${server.address().port}`
  const close = () =>
    new Promise((resolve) => {
      // fetch() keep-alive sockets would otherwise hold the event loop open.
      server.closeAllConnections?.()
      server.close(() => {
        app.locals.database.close()
        resolve()
      })
    })
  return { server, base, dir, close }
}

/**
 * Ensure `identity` has a real account and return a fresh session token for
 * it. Registers when the account does not exist yet, otherwise signs in — so
 * reuse across tests is fine while a brand-new email always works.
 */
export async function session(base, identity = 'alice@test.com', password = 'password123') {
  const name = (identity.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())) || 'MAEVE'
  let res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email: identity, password }),
  })
  if (res.status === 409) {
    res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: identity, password }),
    })
  }
  const body = await res.json()
  if (!res.ok) {
    throw new Error(`session failed for ${identity}: ${res.status} ${JSON.stringify(body)}`)
  }
  return { token: body.token, user: body.user, userId: body.user.id, status: res.status }
}

export async function uploadPhoto(base, token, bufOrName, type = 'image/jpeg') {
  const buf =
    typeof bufOrName === 'string' ? readFixture(bufOrName) : bufOrName
  const fd = new FormData()
  fd.append('image', new Blob([buf], { type }), typeof bufOrName === 'string' ? bufOrName : 'upload.jpg')
  return fetch(`${base}/api/garments/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  })
}

/** Poll a job until terminal, with a sane cap. */
export async function waitForJob(base, token, jobId, { timeoutMs = 180_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/api/garments/analyze/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const job = await res.json()
    if (job.status === 'complete' || job.status === 'failed') return job
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`job ${jobId} did not finish within ${timeoutMs}ms`)
}

export async function listItems(base, token) {
  const res = await fetch(`${base}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return { status: res.status, items: (await res.json()).items }
}

export async function saveItems(base, token, items) {
  const res = await fetch(`${base}/api/wardrobe/items`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  return { status: res.status, body: await res.json() }
}

export async function deleteItem(base, token, id) {
  const res = await fetch(`${base}/api/wardrobe/items/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  return { status: res.status, body: await res.json() }
}