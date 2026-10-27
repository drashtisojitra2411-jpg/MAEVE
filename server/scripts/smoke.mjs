import { createApp } from '../src/app.js'

// config.pythonBin resolves the project venv (server/cv/.venv) automatically.
// Only MAEVE_DATA_DIR / MAEVE_DB are redirected to a scratch location.
process.env.MAEVE_DATA_DIR = 'C:\\Users\\drashti\\AppData\\Local\\Temp\\opencode\\maeve-cv\\data-smoke'
process.env.MAEVE_DB = 'C:\\Users\\drashti\\AppData\\Local\\Temp\\opencode\\maeve-cv\\data-smoke\\maeve.db'

const port = 8791
const app = createApp()
const server = app.listen(port)
await new Promise((r) => server.once('listening', r))

const BASE = `http://localhost:${port}`

// 1. session
const sessRes = await fetch(`${BASE}/api/auth/session`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userId: 'a@test.com', email: 'a@test.com' }),
})
const { token } = await sessRes.json()
console.log('session token ok:', token ? token.slice(0, 24) + '…' : 'NONE')

// 2. health
const health = await (await fetch(`${BASE}/api/health`)).json()
console.log('health:', JSON.stringify(health.cv))

// 3. upload real photo
const fs = await import('node:fs')
const buf = fs.readFileSync(
  new URL('../test/fixtures/real-14577586.jpg', import.meta.url),
)
const fd = new FormData()
fd.append('image', new Blob([buf], { type: 'image/jpeg' }), 'real-14577586.jpg')
const uploadRes = await fetch(`${BASE}/api/garments/analyze`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: fd,
})
const { jobId } = await uploadRes.json()
console.log('upload → job', jobId)

// 4. poll
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 500))
  const job = await (await fetch(`${BASE}/api/garments/analyze/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json()
  if (job.status === 'complete') {
    console.log(`done (stage ${job.stageIndex})`)
    console.log(JSON.stringify(job.result, null, 2).slice(0, 1400))
    break
  }
  if (job.status === 'failed') {
    console.log('FAILED:', JSON.stringify(job.error))
    break
  }
  process.stdout.write(`  ${job.stage} `)
}

server.close()