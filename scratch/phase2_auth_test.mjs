import assert from 'node:assert'
import { createApp, startServer } from '../server/src/app.js'
import { initDb } from '../server/src/db.js'

console.log('=== PHASE 2: AUTHENTICATION & USER SECURITY TESTING ===')

// Use an isolated in-memory or staging DB so we don't pollute existing user data
const db = initDb(':memory:')
const app = createApp({ db })
const server = await startServer(app, 0)
const port = server.address().port
const base = `http://127.0.0.1:${port}`

const results = []
function record(name, pass, details = '') {
  results.push({ name, pass, details })
  console.log(`${pass ? '✔ PASS' : '✖ FAIL'}: ${name} ${details ? '(' + details + ')' : ''}`)
}

try {
  // Test 1: User Registration with valid credentials
  const userAEmail = `usera_${Date.now()}@example.com`
  const userAPass = 'Password123!'
  const regARes = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'User A', email: userAEmail, password: userAPass }),
  })
  const regAJson = await regARes.json()
  record('1. User registration (valid credentials)', regARes.status === 201 && Boolean(regAJson.token), `Status: ${regARes.status}`)
  const tokenA = regAJson.token
  const userA = regAJson.user

  // Test 2: Duplicate email registration
  const dupRes = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'User A Dup', email: userAEmail.toUpperCase(), password: 'AnotherPassword123' }),
  })
  const dupJson = await dupRes.json()
  record('2. Duplicate email registration rejected (409)', dupRes.status === 409 && dupJson.code === 'EMAIL_TAKEN', `Code: ${dupJson.code}`)

  // Test 3: Login with valid credentials
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userAEmail, password: userAPass }),
  })
  const loginJson = await loginRes.json()
  record('3. Login with valid credentials (200 OK)', loginRes.status === 200 && Boolean(loginJson.token), `Status: ${loginRes.status}`)
  const loginTokenA = loginJson.token

  // Test 4: Login with invalid credentials
  const badLoginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userAEmail, password: 'WrongPassword999' }),
  })
  const badLoginJson = await badLoginRes.json()
  record('4. Login with invalid credentials rejected (401)', badLoginRes.status === 401 && badLoginJson.code === 'INVALID_CREDENTIALS', `Code: ${badLoginJson.code}`)

  // Test 5: Empty/invalid form validation
  const emptyRes = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '', email: 'not-an-email', password: '123' }),
  })
  const emptyJson = await emptyRes.json()
  record('5. Empty/invalid form validation (400 Bad Request)', emptyRes.status === 400, `Code: ${emptyJson.code}`)

  // Test 6: Session creation
  record('6. Session creation (token issued)', typeof loginTokenA === 'string' && loginTokenA.length > 20, `Token len: ${loginTokenA.length}`)

  // Test 7: Session persistence during navigation (/api/auth/session)
  const sessRes = await fetch(`${base}/api/auth/session`, {
    headers: { Authorization: `Bearer ${loginTokenA}` },
  })
  const sessJson = await sessRes.json()
  record('7. Session persistence (/api/auth/session)', sessRes.status === 200 && sessJson.user?.email === userAEmail, `User: ${sessJson.user?.email}`)

  // Test 8: Logout
  const logoutRes = await fetch(`${base}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${loginTokenA}` },
  })
  const logoutJson = await logoutRes.json()
  const postLogoutSess = await fetch(`${base}/api/auth/session`, {
    headers: { Authorization: `Bearer ${loginTokenA}` },
  })
  record('8. Logout invalidates session token', logoutRes.status === 200 && postLogoutSess.status === 401, `Post-logout session status: ${postLogoutSess.status}`)

  // Test 9: Access protected pages/endpoints without authentication
  const noAuthWardrobe = await fetch(`${base}/api/wardrobe/items`)
  record('9. Access protected wardrobe endpoint without auth (401)', noAuthWardrobe.status === 401, `Status: ${noAuthWardrobe.status}`)

  // Test 10: Access protected looks endpoint without auth
  const noAuthLooks = await fetch(`${base}/api/looks`)
  record('10. Access protected looks endpoint without auth (401)', noAuthLooks.status === 401, `Status: ${noAuthLooks.status}`)

  // Test 11: Login again after logout
  const reloginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userAEmail, password: userAPass }),
  })
  const reloginJson = await reloginRes.json()
  const tokenA2 = reloginJson.token
  record('11. Login again after logout (fresh session)', reloginRes.status === 200 && tokenA2 !== loginTokenA, `New token received`)

  // Test 12: Remember-me behavior
  // Client stores token in localStorage and re-authenticates on next boot
  const rememberSess = await fetch(`${base}/api/auth/session`, {
    headers: { Authorization: `Bearer ${tokenA2}` },
  })
  record('12. Remember-me token validity verification', rememberSess.status === 200, `Status: ${rememberSess.status}`)

  // Test 13: Closing/reopening session simulation (session survives server restart / separate request)
  const separateReq = await fetch(`${base}/api/auth/session`, {
    headers: { Authorization: `Bearer ${tokenA2}` },
  })
  record('13. Session persistence across independent requests', separateReq.status === 200, `Status: ${separateReq.status}`)

  // Create User B for cross-user isolation tests
  const userBEmail = `userb_${Date.now()}@example.com`
  const userBPass = 'PasswordB456!'
  const regBRes = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'User B', email: userBEmail, password: userBPass }),
  })
  const regBJson = await regBRes.json()
  const tokenB = regBJson.token
  const userB = regBJson.user

  // Populate User B's wardrobe with an item
  const itemBId = 'item_b_test_01'
  const saveItemB = await fetch(`${base}/api/wardrobe/items`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenB}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{
        id: itemBId,
        name: 'User B Silk Shirt',
        category: 'tops',
        color: 'Ivory',
        style: 'formal',
      }],
    }),
  })
  assert.equal(saveItemB.status, 201)

  // Test 14: User A cannot access User B's wardrobe
  const userAWardrobe = await fetch(`${base}/api/wardrobe/items`, {
    headers: { Authorization: `Bearer ${tokenA2}` },
  })
  const userAWardrobeJson = await userAWardrobe.json()
  const userASeesItemB = (userAWardrobeJson.items || []).some(item => item.id === itemBId)
  record('14. User A cannot access User B wardrobe', userAWardrobe.status === 200 && !userASeesItemB, `User A items count: ${userAWardrobeJson.items.length}`)

  // Create a look for User B
  const saveLookB = await fetch(`${base}/api/looks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenB}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      occasion: 'formal',
      garmentIds: [itemBId],
      score: 95,
      explanation: 'User B formal look',
    }),
  })
  const lookBJson = await saveLookB.json()
  const lookBId = lookBJson.look?.id

  // Test 15: User A cannot access User B's saved outfits/history
  const userALooks = await fetch(`${base}/api/looks`, {
    headers: { Authorization: `Bearer ${tokenA2}` },
  })
  const userALooksJson = await userALooks.json()
  const userASeesLookB = (userALooksJson.looks || []).some(l => l.id === lookBId)
  record('15. User A cannot access User B looks/history', userALooks.status === 200 && !userASeesLookB, `User A looks count: ${userALooksJson.looks.length}`)

  // Test 16: User A cannot modify/delete User B's data
  const editAttempt = await fetch(`${base}/api/wardrobe/items/${itemBId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${tokenA2}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'Hacked by User A' }),
  })
  const deleteAttempt = await fetch(`${base}/api/wardrobe/items/${itemBId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenA2}` },
  })
  const isolationHolds = (editAttempt.status === 404 || editAttempt.status === 403) &&
                        (deleteAttempt.status === 404 || deleteAttempt.status === 403)
  record('16. User A cannot modify or delete User B data', isolationHolds, `Edit status: ${editAttempt.status}, Delete status: ${deleteAttempt.status}`)

  const passed = results.filter(r => r.pass).length
  const total = results.length
  console.log(`\nPHASE 2 SUMMARY: ${passed}/${total} PASSED (${Math.round(passed/total*100)}%)`)
} finally {
  server.close()
}

