import fs from 'node:fs'
import { createApp } from '../src/app.js'

// config.pythonBin resolves the project venv automatically; only the data
// location is redirected to scratch.
process.env.MAEVE_DATA_DIR = 'C:\\Users\\drashti\\AppData\\Local\\Temp\\opencode\\maeve-cv\\data-smoke'
process.env.MAEVE_DB = 'C:\\Users\\drashti\\AppData\\Local\\Temp\\opencode\\maeve-cv\\data-smoke\\maeve.db'

const port = 8793
const app = createApp()
const server = app.listen(port)
await new Promise((r) => server.once('listening', r))
const BASE = `http://localhost:${port}`

const sess = await (await fetch(`${BASE}/api/auth/session`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userId: 'a@test.com' }),
})).json()

const buf = fs.readFileSync(new URL('../test/fixtures/real-14577586.jpg', import.meta.url))
const fd = new FormData()
fd.append('image', new Blob([buf], { type: 'image/jpeg' }), 'real-14577586.jpg')
const up = await fetch(`${BASE}/api/garments/analyze`, {
  method: 'POST', headers: { Authorization: `Bearer ${sess.token}` }, body: fd,
})
const upJson = await up.json()
console.log('upload status', up.status, 'jobId', upJson.jobId)

const poll = async () => {
  const resp = await fetch(`${BASE}/api/garments/analyze/${upJson.jobId}`, {
    headers: { Authorization: `Bearer ${sess.token}` },
  })
  console.log('poll status', resp.status, JSON.stringify(await resp.json()))
}
await new Promise((r) => setTimeout(r, 4000))
await poll()
await new Promise((r) => setTimeout(r, 16000))
await poll()
await new Promise((r) => setTimeout(r, 5000))
await poll()
await new Promise((r) => server.close(r))