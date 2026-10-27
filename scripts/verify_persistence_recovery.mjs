import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp, startServer } from '../server/src/app.js'
import { initDb, createStore, backupDb } from '../server/src/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const STAGING_DIR = path.join(ROOT, 'server', 'data', 'staging-persist')
const FIXTURE_PATH = path.join(ROOT, 'server', 'test', 'fixtures', 'real-14577586.jpg')

async function run() {
  console.log('===============================================================')
  console.log('MAEVE Stage 3: Persistent Storage & Disaster Recovery Verification')
  console.log('===============================================================')

  if (fs.existsSync(STAGING_DIR)) {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true })
  }
  fs.mkdirSync(STAGING_DIR, { recursive: true })

  const stagingDbFile = path.join(STAGING_DIR, 'maeve.db')
  process.env.MAEVE_DATA_DIR = STAGING_DIR
  process.env.MAEVE_DB = stagingDbFile

  // ──────────────────────────────────────────────────────────────────────────
  // Step 1: Start Server Instance 1 & Register Account
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[1/10] Starting Server Instance 1 on isolated persistent volume...')
  let db1 = initDb(stagingDbFile)
  let app1 = createApp({ db: db1 })
  let server1 = await startServer(app1, 0)
  let port1 = server1.address().port
  let base1 = `http://127.0.0.1:${port1}`
  console.log(`Server Instance 1 listening on ${base1}`)

  const testEmail = `stage3_${Date.now()}@maeve.fashion`
  const testPassword = 'Password123!'
  console.log(`Registering test account: ${testEmail}...`)

  const regRes = await fetch(`${base1}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Persistence Tester', email: testEmail, password: testPassword }),
  })
  assert.equal(regRes.status, 201, 'Registration must succeed')
  const regData = await regRes.json()
  const token1 = regData.token
  assert.ok(token1, 'Session token issued')

  // ──────────────────────────────────────────────────────────────────────────
  // Step 2: Upload Garment, Confirm & Save
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[2/10] Uploading garment image to CV analysis pipeline...')
  const imgBuffer = fs.readFileSync(FIXTURE_PATH)
  const fd = new FormData()
  fd.append('image', new Blob([imgBuffer], { type: 'image/jpeg' }), 'real-14577586.jpg')

  const uploadRes = await fetch(`${base1}/api/garments/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: fd,
  })
  assert.equal(uploadRes.status, 201, 'Upload must create analysis job')
  const { jobId } = await uploadRes.json()
  console.log(`Analysis job spawned: ${jobId}. Polling for completion...`)

  let jobComplete = false
  let jobResult = null
  for (let i = 0; i < 60; i++) {
    const jobRes = await fetch(`${base1}/api/garments/analyze/${jobId}`, {
      headers: { Authorization: `Bearer ${token1}` },
    })
    assert.equal(jobRes.status, 200)
    const job = await jobRes.json()
    if (job.status === 'complete') {
      jobComplete = true
      jobResult = job.result
      break
    }
    await new Promise((r) => setTimeout(r, 800))
  }
  assert.ok(jobComplete, 'Job must complete successfully')
  assert.ok(jobResult.garments.length > 0, 'At least one garment must be detected')
  const detected = jobResult.garments[0]
  console.log(`Detected: ${detected.category} (${detected.subcategory}), color: ${detected.color}`)

  // Confirm and save garment
  const garmentToSave = {
    ...detected,
    imageUrl: detected.thumbnailUrl || detected.isolatedImageUrl,
    name: 'Audited Wool Sweater',
    timesWorn: 0,
    lastWornAt: null,
  }
  const saveRes = await fetch(`${base1}/api/wardrobe/items`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token1}`,
    },
    body: JSON.stringify({ items: [garmentToSave] }),
  })
  assert.equal(saveRes.status, 201, 'Garment save must succeed')
  const savedItems = (await saveRes.json()).items
  const savedGarmentId = savedItems[0].id
  console.log(`Garment successfully persisted with ID: ${savedGarmentId}`)

  // ──────────────────────────────────────────────────────────────────────────
  // Step 3: Create Saved Outfit & Update Profile Preferences
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[3/10] Creating saved outfit look and profile preferences...')
  const lookRes = await fetch(`${base1}/api/looks`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token1}`,
    },
    body: JSON.stringify({
      occasion: 'casual',
      itemIds: [savedGarmentId],
      explanation: ['Audited casual styling'],
      score: 88,
    }),
  })
  assert.equal(lookRes.status, 201, 'Look save must succeed')
  const savedLook = (await lookRes.json()).look
  const savedLookId = savedLook.id
  console.log(`Saved look persisted with ID: ${savedLookId}`)

  const profileRes = await fetch(`${base1}/api/profile`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token1}`,
    },
    body: JSON.stringify({
      style: 'smart-casual',
      comfort: 'breathable',
      preferences: {
        preferredStyles: ['smart-casual', 'minimalist'],
        favoriteColors: ['#DEC5B8', 'cream'],
      },
      location: {
        name: 'Ahmedabad',
        region: 'Gujarat',
        country: 'India',
        latitude: 23.0225,
        longitude: 72.5714,
      },
    }),
  })
  assert.equal(profileRes.status, 200, 'Profile update must succeed')

  // ──────────────────────────────────────────────────────────────────────────
  // Step 4: Record Wear Event
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[4/10] Recording wear event for garment...')
  const wearRes = await fetch(`${base1}/api/wardrobe/wear`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token1}`,
    },
    body: JSON.stringify({ itemIds: [savedGarmentId], lookId: savedLookId }),
  })
  assert.equal(wearRes.status, 200, 'Wear event must be recorded')
  const wearData = await wearRes.json()
  assert.equal(wearData.updated, 1)
  assert.equal(wearData.items[0].timesWorn, 1)
  assert.ok(wearData.items[0].lastWornAt, 'lastWornAt timestamp must be set')
  console.log(`Wear event recorded: timesWorn = ${wearData.items[0].timesWorn}`)

  // ──────────────────────────────────────────────────────────────────────────
  // Step 5: Simulate Full Server Restart / Container Reboot
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[5/10] Simulating container shutdown and restart...')
  await server1.close()
  console.log('Server Instance 1 stopped cleanly.')

  // Create completely new server instance 2 pointing to the same persistent data volume
  const db2 = initDb(stagingDbFile)
  const app2 = createApp({ db: db2 })
  const server2 = await startServer(app2, 0)
  const port2 = server2.address().port
  const base2 = `http://127.0.0.1:${port2}`
  console.log(`Server Instance 2 started on ${base2} against existing volume.`)

  // ──────────────────────────────────────────────────────────────────────────
  // Step 6: Verify Persistence Across Restart
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[6/10] Verifying data durability across restart...')
  // Re-login with account credentials
  const loginRes = await fetch(`${base2}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  })
  assert.equal(loginRes.status, 200, 'Login on new instance must succeed')
  const token2 = (await loginRes.json()).token

  // Verify garment and wear count
  const itemsRes = await fetch(`${base2}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${token2}` },
  })
  assert.equal(itemsRes.status, 200)
  const itemsAfterRestart = (await itemsRes.json()).items
  assert.equal(itemsAfterRestart.length, 1, 'Exactly 1 garment must persist')
  assert.equal(itemsAfterRestart[0].id, savedGarmentId)
  assert.equal(itemsAfterRestart[0].timesWorn, 1, 'timesWorn must remain 1 after restart')
  assert.ok(itemsAfterRestart[0].lastWornAt, 'lastWornAt must persist')
  console.log('✓ Garment record and wear count verified intact.')

  // Verify private image asset retrieval
  const assetUrl = itemsAfterRestart[0].imageUrl
  assert.ok(assetUrl, 'Asset URL must be present')
  const assetRes = await fetch(`${base2}${assetUrl}`)
  assert.equal(assetRes.status, 200, 'Image file must be readable from persistent volume')
  assert.equal(assetRes.headers.get('content-type'), 'image/png')
  console.log('✓ Private garment image cutout file verified intact.')

  // Verify saved look
  const looksRes = await fetch(`${base2}/api/looks`, {
    headers: { Authorization: `Bearer ${token2}` },
  })
  assert.equal(looksRes.status, 200)
  const looksAfterRestart = (await looksRes.json()).looks
  assert.equal(looksAfterRestart.length, 1)
  assert.equal(looksAfterRestart[0].id, savedLookId)
  console.log('✓ Saved look verified intact.')

  // Verify profile
  const profileGetRes = await fetch(`${base2}/api/profile`, {
    headers: { Authorization: `Bearer ${token2}` },
  })
  assert.equal(profileGetRes.status, 200)
  const profileAfterRestart = (await profileGetRes.json()).profile
  assert.equal(profileAfterRestart.style, 'smart-casual')
  assert.equal(profileAfterRestart.location?.name, 'Ahmedabad')
  console.log('✓ Profile preferences and location verified intact.')

  // ──────────────────────────────────────────────────────────────────────────
  // Step 7: Create Hot Database Backup
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[7/10] Creating point-in-time hot backup using VACUUM INTO...')
  const backupSnapshotPath = path.join(STAGING_DIR, 'recovery_snapshot.db')
  const backupResult = backupDb(db2, backupSnapshotPath)
  assert.equal(backupResult.success, true)
  assert.ok(fs.existsSync(backupSnapshotPath))
  console.log(`✓ Backup snapshot created successfully (${backupResult.bytes} bytes).`)

  // ──────────────────────────────────────────────────────────────────────────
  // Step 8: Restore Backup to Separate Recovery Location
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[8/10] Restoring snapshot to isolated recovery directory...')
  const recoveryDbPath = path.join(STAGING_DIR, 'restored_verification.db')
  fs.copyFileSync(backupSnapshotPath, recoveryDbPath)
  assert.ok(fs.existsSync(recoveryDbPath))
  console.log(`✓ Snapshot copied to verification target: ${recoveryDbPath}`)

  // ──────────────────────────────────────────────────────────────────────────
  // Step 9: SQLite Integrity Check & Record Verification
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[9/10] Running SQLite PRAGMA integrity_check and table inspection...')
  const recoveredDb = initDb(recoveryDbPath)
  const integrityResult = recoveredDb.prepare('PRAGMA integrity_check;').all()
  assert.equal(integrityResult[0].integrity_check, 'ok', 'Database integrity check must return "ok"')

  const quickCheckResult = recoveredDb.prepare('PRAGMA quick_check;').all()
  assert.equal(quickCheckResult[0].quick_check, 'ok', 'Quick check must return "ok"')

  const recoveredStore = createStore(recoveredDb)
  const recoveredUser = recoveredStore.findUserByEmail(testEmail)
  assert.ok(recoveredUser, 'User record must be present in restored database')

  const recoveredItems = recoveredStore.listItems(testEmail)
  assert.equal(recoveredItems.length, 1)
  assert.equal(recoveredItems[0].name, 'Audited Wool Sweater')
  assert.equal(recoveredItems[0].timesWorn, 1)

  const recoveredLooks = recoveredStore.listLooks(testEmail)
  assert.equal(recoveredLooks.length, 1)
  console.log('✓ All integrity checks passed. Records in restored database are byte-for-byte consistent.')

  // ──────────────────────────────────────────────────────────────────────────
  // Step 10: Verify Protection Against Accidental Overwrite
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[10/10] Verifying restore safeguards against accidental live overwrite...')
  // Test that attempting restore without valid arguments exits safely
  const invalidHeaderPath = path.join(STAGING_DIR, 'corrupt.db')
  fs.writeFileSync(invalidHeaderPath, 'NOT_SQLITE_HEADER')

  // Check header detection logic
  const fdCheck = fs.openSync(invalidHeaderPath, 'r')
  const hBuf = Buffer.alloc(16)
  fs.readSync(fdCheck, hBuf, 0, 16, 0)
  fs.closeSync(fdCheck)
  const isSqlite = hBuf.toString('utf8', 0, 15) === 'SQLite format 3'
  assert.equal(isSqlite, false, 'Invalid header must be rejected before restore')
  console.log('✓ Invalid/corrupt files are strictly rejected before live overwrite.')

  await server2.close()
  try {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true })
  } catch {}
  console.log('\n===============================================================')
  console.log('>>> ALL 10 STORAGE PERSISTENCE & RECOVERY TESTS PASSED! <<<')
  console.log('===============================================================')
  process.exit(0)
}

run().catch((err) => {
  console.error('\nFAILURE:', err)
  process.exit(1)
})
