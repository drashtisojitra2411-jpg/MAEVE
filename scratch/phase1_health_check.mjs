import assert from 'node:assert'
import { createApp, startServer } from '../server/src/app.js'
import { config, validateConfig } from '../server/src/config.js'

console.log('=== PHASE 1: CONFIGURATION & HEALTH CHECK ===')

// 1. Config validation
const check = validateConfig()
console.log('Config valid:', check.valid)
console.log('Config issues:', check.issues)
console.log('Config summary:', check.summary)

// 2. Start server on ephemeral port
process.env.MAEVE_CORS_ORIGIN = 'https://*.vercel.app,https://maeve.fashion'
const app = createApp()
const server = await startServer(app, 0)
const port = server.address().port
const baseUrl = `http://127.0.0.1:${port}`

try {
  // 3. Health check
  const healthRes = await fetch(`${baseUrl}/api/health`)
  assert.equal(healthRes.status, 200, 'Health endpoint status must be 200')
  const healthJson = await healthRes.json()
  console.log('Health JSON:', JSON.stringify(healthJson, null, 2))
  assert.equal(healthJson.ok, true, 'Health ok must be true')
  assert.equal(healthJson.service, 'maeve-server', 'Service must be maeve-server')
  assert.equal(healthJson.cv.backend, 'python-worker', 'CV backend must be python-worker')
  assert.equal(healthJson.cv.model, 'yolov8s-seg-deepfashion2', 'Model name matches')
  assert.equal(healthJson.cv.available, true, 'Model weights must be available')

  // 4. Security headers
  assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(healthRes.headers.get('x-frame-options'), 'DENY')
  assert.equal(healthRes.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
  console.log('Security headers verified: PASS')

  // 5. CORS check
  const corsRes = await fetch(`${baseUrl}/api/health`, {
    headers: { origin: 'https://preview-123.vercel.app' },
  })
  assert.equal(corsRes.headers.get('access-control-allow-origin'), 'https://preview-123.vercel.app')
  assert.equal(corsRes.headers.get('access-control-allow-credentials'), 'true')

  const badCorsRes = await fetch(`${baseUrl}/api/health`, {
    headers: { origin: 'https://unauthorized-domain.com' },
  })
  assert.equal(badCorsRes.headers.get('access-control-allow-origin'), null)

  const preflightRes = await fetch(`${baseUrl}/api/health`, {
    method: 'OPTIONS',
    headers: { origin: 'https://maeve.fashion' },
  })
  assert.equal(preflightRes.status, 204)
  assert.equal(preflightRes.headers.get('access-control-allow-origin'), 'https://maeve.fashion')
  console.log('CORS and Preflight verification: PASS')

  console.log('>>> PHASE 1 AUTOMATED HEALTH CHECKS: ALL PASSED <<<')
} finally {
  server.close()
}

