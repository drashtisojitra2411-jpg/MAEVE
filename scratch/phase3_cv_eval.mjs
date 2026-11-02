import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { createApp, startServer } from '../server/src/app.js'
import { initDb } from '../server/src/db.js'

console.log('=== PHASE 3, 4, 5, 6: COMPREHENSIVE CV EVALUATION ===')

const db = initDb(':memory:')
const app = createApp({ db })
const server = await startServer(app, 0)
const port = server.address().port
const base = `http://127.0.0.1:${port}`

// Register user
const regRes = await fetch(`${base}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'CV Evaluator', email: `cveval_${Date.now()}@maeve.fashion`, password: 'TestPassword123!' }),
})
const { token } = await regRes.json()

async function uploadAndPoll(filePath, customName = null) {
  const fileName = customName || path.basename(filePath)
  const fileBytes = fs.readFileSync(filePath)
  const ext = path.extname(fileName).toLowerCase()
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'text/plain'

  const fd = new FormData()
  fd.append('image', new Blob([fileBytes], { type: mime }), fileName)

  const t0 = Date.now()
  const uploadRes = await fetch(`${base}/api/garments/analyze`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: fd,
  })
  const uploadMs = Date.now() - t0

  if (!uploadRes.ok) {
    let err = {}
    try { err = await uploadRes.json() } catch {}
    return {
      accepted: false,
      status: uploadRes.status,
      code: err.code || 'HTTP_' + uploadRes.status,
      message: err.message,
      uploadMs,
    }
  }

  const { jobId } = await uploadRes.json()
  const pollStart = Date.now()
  let job
  while (true) {
    await new Promise((r) => setTimeout(r, 600))
    const res = await fetch(`${base}/api/garments/analyze/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    job = await res.json()
    if (job.status === 'complete' || job.status === 'failed') break
    if (Date.now() - pollStart > 180000) {
      throw new Error(`Timeout waiting for job ${jobId}`)
    }
  }
  const totalMs = Date.now() - t0
  const processingMs = job.result?.processedInMs || (Date.now() - pollStart)

  return {
    accepted: true,
    status: 201,
    jobId,
    jobStatus: job.status,
    result: job.result,
    uploadMs,
    processingMs,
    totalMs,
  }
}

// 1. Non-garment file (invalid text)
console.log('\n[1/7] Testing Non-garment file (invalid.txt)...')
const resInvalid = await uploadAndPoll('server/test/fixtures/invalid.txt')
console.log('Result:', resInvalid.accepted ? 'Accepted' : `Rejected with code ${resInvalid.code} (status ${resInvalid.status})`)

// 2. Tiny image (16x16)
console.log('\n[2/7] Testing Tiny/low-quality image (16x16)...')
const resTiny = await uploadAndPoll('scratch/tiny_image.jpg')
console.log('Result:', resTiny.accepted ? `Accepted, garments detected: ${resTiny.result?.garments?.length}` : `Rejected with code ${resTiny.code}`)

// 3. Garment on bed / bedsheet (real-6347605.jpg)
console.log('\n[3/7] Testing Garment on bed / bedsheet (real-6347605.jpg)...')
const resBed = await uploadAndPoll('server/test/fixtures/real-6347605.jpg')
console.log('Result:', resBed.accepted ? `Accepted, garments: ${resBed.result?.garments?.length}, time: ${resBed.processingMs}ms` : 'Rejected')

// 4. Flat-lay garment (real-14577586.jpg)
console.log('\n[4/7] Testing Flat-lay jacket (real-14577586.jpg)...')
const resFlat = await uploadAndPoll('server/test/fixtures/real-14577586.jpg')
console.log('Result:', resFlat.accepted ? `Accepted, garments: ${resFlat.result?.garments?.length}, time: ${resFlat.processingMs}ms` : 'Rejected')
if (resFlat.result?.garments) {
  for (const g of resFlat.result.garments) {
    console.log(`  -> Detected: ${g.category} (${g.subcategory}), Color: ${g.color} (${g.colorHex}), Conf: ${Math.round(g.confidence*100)}%`)
  }
}

// 5. Cluttered background & multiple garments (real-18533674.jpg)
console.log('\n[5/7] Testing Cluttered background & multiple garments (real-18533674.jpg)...')
const resMulti = await uploadAndPoll('server/test/fixtures/real-18533674.jpg')
console.log('Result:', resMulti.accepted ? `Accepted, garments: ${resMulti.result?.garments?.length}, time: ${resMulti.processingMs}ms` : 'Rejected')
if (resMulti.result?.garments) {
  for (const g of resMulti.result.garments) {
    console.log(`  -> Detected: ${g.category} (${g.subcategory}), Color: ${g.color} (${g.colorHex}), Conf: ${Math.round(g.confidence*100)}%`)
  }
}

// 6. Real shirt upload (public/g-shirt.jpg)
console.log('\n[6/7] Testing Real cotton shirt (public/g-shirt.jpg)...')
const resShirt = await uploadAndPoll('public/g-shirt.jpg')
console.log('Result:', resShirt.accepted ? `Accepted, garments: ${resShirt.result?.garments?.length}, time: ${resShirt.processingMs}ms` : 'Rejected')
if (resShirt.result?.garments) {
  for (const g of resShirt.result.garments) {
    console.log(`  -> Detected: ${g.category} (${g.subcategory}), Color: ${g.color} (${g.colorHex}), Conf: ${Math.round(g.confidence*100)}%`)
  }
}

// 7. Duplicate upload of shirt
console.log('\n[7/7] Testing Duplicate garment upload (public/g-shirt.jpg)...')
const resDup = await uploadAndPoll('public/g-shirt.jpg')
console.log('Result:', resDup.accepted ? `Accepted, garments: ${resDup.result?.garments?.length}, time: ${resDup.processingMs}ms` : 'Rejected')

const fullResults = {
  resInvalid,
  resTiny,
  resBed,
  resFlat,
  resMulti,
  resShirt,
  resDup,
}
fs.writeFileSync('scratch/live_cv_eval_results.json', JSON.stringify(fullResults, null, 2))
console.log('\nAll test outputs saved to scratch/live_cv_eval_results.json')
server.close()
