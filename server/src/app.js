import express from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config, ensureDirectories, imagesDir, pythonInfo, userDir } from './config.js'
import {
  createRequireAuth,
  requireOwnership,
  hashPassword,
  verifyPassword,
  normalizeEmail,
  isValidEmail,
  generateSessionToken,
  hashToken,
  sessionExpiry,
  extractToken,
} from './auth.js'
import { createStore, initDb } from './db.js'
import { validateUpload } from './validation.js'
import { getJob, stageList, startAnalysisJob, shutdownWorkers } from './garmentService.js'
import { recommendOutfits } from './styling.js'
import { getWeatherForCoordinates, searchLocationsBackend } from './weather.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
})

const ITEM_FIELDS = [
  'id', 'name', 'originalImageUrl', 'isolatedImageUrl', 'imageUrl',
  'category', 'subcategory', 'color', 'colorHex', 'secondaryColor',
  'colorConfidence', 'pattern', 'style',
  'material', 'sleeve', 'length', 'season', 'weatherSuitability', 'confidence', 'needsUserInput',
  'userCorrected', 'timesWorn', 'lastWornAt', 'createdAt', 'updatedAt',
]

function cleanFileUrl(url) {
  if (!url || typeof url !== 'string') return url
  if (!url.startsWith('/api/files/')) return url
  return url.split('?')[0]
}

function normalizeFileUrl(url, token) {
  if (!url || typeof url !== 'string') return url
  if (!url.startsWith('/api/files/')) return url
  const clean = url.split('?')[0]
  return token ? `${clean}?token=${encodeURIComponent(token)}` : clean
}

export function attachTokenToItem(item, token) {
  if (!item) return item
  const thumb = item.thumbnailUrl ?? item.imageUrl
  return {
    ...item,
    imageUrl: normalizeFileUrl(item.imageUrl, token),
    isolatedImageUrl: normalizeFileUrl(item.isolatedImageUrl, token),
    originalImageUrl: normalizeFileUrl(item.originalImageUrl, token),
    thumbnailUrl: normalizeFileUrl(thumb, token),
  }
}

function sanitizeItem(item) {
  const out = {}
  for (const f of ITEM_FIELDS) {
    if (item[f] !== undefined) out[f] = item[f]
  }
  out.id = String(item.id ?? cryptoRandomId())
  if (!out.imageUrl) out.imageUrl = out.thumbnailUrl || out.isolatedImageUrl || null
  if (out.imageUrl) out.imageUrl = cleanFileUrl(out.imageUrl)
  if (out.isolatedImageUrl) out.isolatedImageUrl = cleanFileUrl(out.isolatedImageUrl)
  if (out.originalImageUrl) out.originalImageUrl = cleanFileUrl(out.originalImageUrl)
  if (out.thumbnailUrl) out.thumbnailUrl = cleanFileUrl(out.thumbnailUrl)
  return out
}

function cryptoRandomId() {
  return crypto.randomBytes(12).toString('hex')
}

// Compared against when a login email is unknown, so both branches pay the
// same scrypt cost and account existence cannot be inferred from timing.
const DUMMY_PASSWORD_HASH = hashPassword('maeve-nonexistent-account')

function createRateLimiter({ windowMs, max, message, code = 'TOO_MANY_REQUESTS' }) {
  const hits = new Map()
  return function rateLimit(req, res, next) {
    if (!config.rateLimitEnabled) return next()
    const ip = req.ip || req.socket?.remoteAddress || 'unknown'
    const now = Date.now()
    const record = hits.get(ip) || []
    const windowStart = now - windowMs
    const activeHits = record.filter((t) => t > windowStart)
    if (activeHits.length >= max) {
      const oldest = activeHits[0]
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
      res.setHeader('Retry-After', String(retryAfterSec))
      res.status(429).json({
        success: false,
        code,
        message,
        retryAfter: retryAfterSec,
      })
      return
    }
    activeHits.push(now)
    hits.set(ip, activeHits)
    if (hits.size > 500) {
      for (const [key, timestamps] of hits.entries()) {
        const valid = timestamps.filter((t) => t > windowStart)
        if (valid.length === 0) hits.delete(key)
        else hits.set(key, valid)
      }
    }
    next()
  }
}

export function createApp({ db } = {}) {
  ensureDirectories()
  const database = db ?? initDb()
  const store = createStore(database)
  const requireAuth = createRequireAuth(store)

  const loginLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Too many login attempts. Please wait before trying again.',
    code: 'TOO_MANY_ATTEMPTS',
  })

  const registerLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 30,
    message: 'Too many account registrations. Please try again later.',
    code: 'REGISTRATION_LIMIT',
  })

  const app = express()
  if (config.isProduction || process.env.TRUST_PROXY) {
    app.set('trust proxy', process.env.TRUST_PROXY ? (Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY) : 1)
  }

  // ── Security Headers ────────────────────────────────────────────────
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('X-XSS-Protection', '0')
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    if (config.isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
    next()
  })

  // ── CORS ────────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    const origin = req.headers.origin
    const allowed = config.corsOrigin
    if (allowed) {
      if (allowed === '*' || allowed.split(',').map((s) => s.trim()).includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin || allowed)
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        res.setHeader('Access-Control-Allow-Credentials', 'true')
        res.setHeader('Access-Control-Max-Age', '86400')
      }
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  })

  app.use(express.json({ limit: '1mb' }))
  app.locals.database = database

  // ── Health & Readiness ──────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'maeve-server',
      cv: {
        backend: 'python-worker',
        model: 'yolov8s-seg-deepfashion2',
        available: fs.existsSync(config.modelPath),
        minConfidence: config.minConfidence,
        stages: stageList(),
        runtime: pythonInfo(),
      },
    })
  })

  // ── Authentication ──────────────────────────────────────────────────
  // Identity is server-authoritative: accounts live in the `users` table with
  // salted scrypt password digests, and sessions are opaque random tokens whose
  // hash is stored in `sessions`. The client is never trusted to assert who it
  // is — only a live session row grants access to a user's resources.
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email })

  const issueSession = (res, user, status) => {
    const token = generateSessionToken()
    store.createSession({
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: sessionExpiry(),
    })
    store.deleteExpiredSessions()
    res.status(status).json({ success: true, token, user: publicUser(user) })
  }

  app.post('/api/auth/register', registerLimiter, (req, res) => {
    const body = req.body ?? {}
    const name = String(body.name ?? '').trim()
    const email = normalizeEmail(body.email)
    const password = String(body.password ?? '')
    if (!name || name.length > 80) {
      res.status(400).json({ success: false, code: 'INVALID_NAME', message: 'Please tell us your name.' })
      return
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ success: false, code: 'INVALID_EMAIL', message: 'Please enter a valid email address.' })
      return
    }
    if (password.length < 6) {
      res.status(400).json({ success: false, code: 'WEAK_PASSWORD', message: 'Your password needs at least 6 characters.' })
      return
    }
    if (store.findUserByEmail(email)) {
      res.status(409).json({ success: false, code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' })
      return
    }
    let user
    try {
      user = store.createUser({ id: email, email, name, passwordHash: hashPassword(password) })
    } catch {
      res.status(409).json({ success: false, code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' })
      return
    }
    issueSession(res, user, 201)
  })

  app.post('/api/auth/login', loginLimiter, (req, res) => {
    const body = req.body ?? {}
    const email = normalizeEmail(body.email)
    const password = String(body.password ?? '')
    const user = store.findUserByEmail(email)
    // Always run the password check (against a dummy digest when the account
    // does not exist) so response timing cannot be used to enumerate accounts.
    const ok = verifyPassword(password, user ? user.passwordHash : DUMMY_PASSWORD_HASH)
    if (!user || !ok) {
      res.status(401).json({ success: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' })
      return
    }
    issueSession(res, user, 200)
  })

  app.get('/api/auth/session', requireAuth, (req, res) => {
    res.json({ success: true, user: publicUser(req.identity) })
  })

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    store.deleteSession(req.sessionTokenHash)
    res.json({ success: true })
  })

  // ── Garment analysis ────────────────────────────────────────────────
  app.post(
    '/api/garments/analyze',
    requireAuth,
    upload.single('image'),
    (req, res) => {
      const file = req.file
      if (!file) {
        res.status(400).json({ success: false, code: 'NO_FILE', message: 'Attach a photograph as multipart field "image".' })
        return
      }
      const check = validateUpload(file.buffer, file.mimetype)
      if (!check.ok) {
        res.status(check.status).json({ success: false, code: check.code, message: check.message })
        return
      }
      const token = extractBearer(req)
      const jobId = startAnalysisJob({
        userId: req.identity.id,
        buffer: file.buffer,
        probe: check.probe,
        originalName: file.originalname,
        token,
      })
      res.status(201).json({ success: true, jobId, totalStages: stageList().length })
    },
  )

  app.get('/api/garments/analyze/:jobId', requireAuth, (req, res) => {
    const job = getJob(req.params.jobId)
    if (!job) {
      res.status(404).json({ success: false, code: 'JOB_NOT_FOUND', message: 'Unknown or expired analysis job.' })
      return
    }
    if (job.userId !== req.identity.id) {
      res.status(403).json({ success: false, code: 'FORBIDDEN', message: "You can't inspect another user's job." })
      return
    }
    res.json(job)
  })

  // ── Wardrobe items (confirmed garments only) ───────────────────────
  app.get('/api/wardrobe/items', requireAuth, (req, res) => {
    const token = extractToken(req)
    const items = store.listItems(req.identity.id).map((it) => attachTokenToItem(it, token))
    res.json({ success: true, items })
  })

  app.post('/api/wardrobe/items', requireAuth, (req, res) => {
    const list = Array.isArray(req.body?.items) ? req.body.items : []
    if (list.length === 0) {
      res.status(400).json({ success: false, code: 'EMPTY', message: 'Provide at least one item.' })
      return
    }
    const token = extractToken(req)
    const items = list.map((it) => ({ ...sanitizeItem(it), userId: req.identity.id }))
    try {
      store.saveItems(req.identity.id, items)
      const persisted = store.listItems(req.identity.id).map((it) => attachTokenToItem(it, token))
      res.status(201).json({ success: true, items: persisted })
    } catch (err) {
      console.error('[maeve-server] saveItems error:', err)
      res.status(500).json({ success: false, code: 'DB_ERROR', message: 'Failed to save wardrobe items.' })
    }
  })

  app.get('/api/wardrobe/items/:id', requireAuth, (req, res) => {
    const item = store.getItem(req.identity.id, req.params.id)
    if (!item) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Item not found in this account.' })
      return
    }
    const token = extractToken(req)
    res.json({ success: true, item: attachTokenToItem(item, token) })
  })

  app.put('/api/wardrobe/items/:id', requireAuth, (req, res) => {
    const existing = store.getItem(req.identity.id, req.params.id)
    if (!existing) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Item not found in this account.' })
      return
    }
    const token = extractToken(req)
    const patch = sanitizeItem({
      ...existing,
      ...req.body,
      id: req.params.id,
      userCorrected: true,
      updatedAt: Date.now(),
    })
    try {
      store.saveItems(req.identity.id, [{ ...patch, userId: req.identity.id }])
      const updated = store.getItem(req.identity.id, req.params.id)
      res.json({ success: true, item: attachTokenToItem(updated, token) })
    } catch (err) {
      console.error('[maeve-server] updateItem error:', err)
      res.status(500).json({ success: false, code: 'DB_ERROR', message: 'Failed to update wardrobe item.' })
    }
  })

  app.delete('/api/wardrobe/items/:id', requireAuth, (req, res) => {
    const removed = store.removeItem(req.identity.id, req.params.id)
    if (!removed) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Item not found in this account.' })
      return
    }
    res.json({ success: true })
  })

  // ── Garment usage & wear events (Phase 5) ───────────────────────────
  app.post('/api/wardrobe/wear', requireAuth, (req, res) => {
    const body = req.body ?? {}
    const itemIds = Array.isArray(body.itemIds) ? body.itemIds : []
    if (itemIds.length === 0) {
      res.status(400).json({ success: false, code: 'EMPTY_ITEMS', message: 'Provide at least one garment ID.' })
      return
    }

    const userItems = store.listItems(req.identity.id)
    const userItemMap = new Map(userItems.map((i) => [i.id, i]))
    for (const id of itemIds) {
      if (!userItemMap.has(id)) {
        res.status(403).json({ success: false, code: 'FORBIDDEN', message: "Cannot mark another user's garments as worn." })
        return
      }
    }

    // Duplicate wear event prevention (debounce window: 60s for identical item set)
    const now = Date.now()
    const isDuplicate = itemIds.every((id) => {
      const it = userItemMap.get(id)
      if (!it?.lastWornAt) return false
      const diff = now - new Date(it.lastWornAt).getTime()
      return diff >= 0 && diff < 60_000
    })

    const token = extractToken(req)
    if (isDuplicate) {
      const current = itemIds.map((id) => attachTokenToItem(userItemMap.get(id), token))
      res.json({ success: true, updated: current.length, items: current, duplicatePrevented: true })
      return
    }

    const result = store.recordWear(req.identity.id, {
      itemIds,
      lookId: body.lookId || null,
      timestamp: now,
    })
    const itemsWithTokens = result.items.map((it) => attachTokenToItem(it, token))
    res.json({ success: true, updated: result.updated, items: itemsWithTokens, wornAt: result.wornAt })
  })

  app.post('/api/looks/:id/wear', requireAuth, (req, res) => {
    const look = store.getLook(req.identity.id, req.params.id)
    if (!look) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Look not found in this account.' })
      return
    }
    const itemIds = look.itemIds ?? (Array.isArray(look.items) ? look.items.map((i) => i.id) : [])
    if (itemIds.length === 0) {
      res.status(400).json({ success: false, code: 'EMPTY_ITEMS', message: 'Look has no garments to wear.' })
      return
    }

    const userItems = store.listItems(req.identity.id)
    const userItemMap = new Map(userItems.map((i) => [i.id, i]))
    const now = Date.now()
    const isDuplicate = itemIds.every((id) => {
      const it = userItemMap.get(id)
      if (!it?.lastWornAt) return false
      const diff = now - new Date(it.lastWornAt).getTime()
      return diff >= 0 && diff < 60_000
    })

    const token = extractToken(req)
    if (isDuplicate) {
      const current = itemIds.map((id) => attachTokenToItem(userItemMap.get(id), token))
      res.json({ success: true, updated: current.length, items: current, duplicatePrevented: true })
      return
    }

    const result = store.recordWear(req.identity.id, {
      itemIds,
      lookId: req.params.id,
      timestamp: now,
    })
    const itemsWithTokens = result.items.map((it) => attachTokenToItem(it, token))
    res.json({ success: true, updated: result.updated, items: itemsWithTokens, wornAt: result.wornAt })
  })

  // ── Looks (rule-based stylist, persisted per user) ─────────────────────
  // ── Looks (rule-based stylist, persisted per user) ─────────────────────
  // `recommend` computes ranked candidate looks without persisting; `generate`
  // persists the top look per call. Both run against the caller's own wardrobe
  // only — never another user's items.
  const runStylist = (req, res, { persist }) => {
    const token = extractToken(req)
    const { occasion, preferences, weather, limit } = req.body ?? {}
    const userProfile = store.getProfile(req.identity.id)
    const profilePrefs = userProfile?.preferences ?? {}
    const mergedPreferences = {
      ...profilePrefs,
      style: preferences?.style || userProfile?.style || profilePrefs.preferredStyles?.[0] || null,
      comfort: preferences?.comfort || userProfile?.comfort || (Array.isArray(profilePrefs.comfort) ? profilePrefs.comfort[0] : null) || null,
      ...(preferences ?? {}),
    }
    const userLooks = store.listLooks(req.identity.id)
    const result = recommendOutfits({
      wardrobe: store.listItems(req.identity.id),
      occasion,
      preferences: mergedPreferences,
      weather,
      userLooks,
      limit: limit ? Number(limit) : 5,
    })
    if (!result.success) {
      res.status(200).json({
        success: true,
        look: null,
        recommendations: [],
        reason: result.reason,
        missingCategories: result.missingCategories || [],
      })
      return
    }

    const now = Date.now()
    const recommendations = result.recommendations.map((rec) => {
      const items = rec.items.map((it) => attachTokenToItem(it, token))
      return {
        id: cryptoRandomId(),
        itemIds: items.map((i) => i.id),
        items,
        occasion: occasion ? String(occasion).trim() : (rec.occasion || 'casual'),
        preferences: mergedPreferences,
        weather: weather ?? {},
        explanation: rec.explanation,
        score: rec.score,
        breakdown: rec.breakdown,
        pieceScores: rec.pieceScores,
        createdAt: now,
        missingCategories: rec.missingCategories,
        isIncomplete: rec.isIncomplete,
      }
    })

    const primaryLook = recommendations[0] || null

    if (persist && primaryLook) {
      const saved = store.saveLook({ ...primaryLook, userId: req.identity.id })
      const returnLook = {
        ...saved,
        items: Array.isArray(saved.items) ? saved.items.map((it) => attachTokenToItem(it, token)) : [],
      }
      res.status(201).json({
        success: true,
        look: returnLook,
        recommendations,
        saved: true,
        missingCategories: result.missingCategories,
      })
      return
    }

    res.status(200).json({
      success: true,
      look: primaryLook,
      recommendations,
      saved: false,
      missingCategories: result.missingCategories,
    })
  }

  app.post('/api/looks/recommend', requireAuth, (req, res) => runStylist(req, res, { persist: false }))
  app.post('/api/looks/generate', requireAuth, (req, res) => runStylist(req, res, { persist: true }))

  // Save a specific chosen look
  app.post('/api/looks', requireAuth, (req, res) => {
    const token = extractToken(req)
    const body = req.body ?? {}
    const itemIds = Array.isArray(body.itemIds) ? body.itemIds : []
    if (itemIds.length === 0) {
      res.status(400).json({ success: false, code: 'EMPTY', message: 'Look must reference at least one garment.' })
      return
    }
    // Verify that every referenced item belongs to the authenticated user
    const userItems = store.listItems(req.identity.id)
    const userItemMap = new Map(userItems.map((i) => [i.id, i]))
    for (const id of itemIds) {
      if (!userItemMap.has(id)) {
        res.status(403).json({ success: false, code: 'FORBIDDEN', message: "Cannot save look referencing another user's garments." })
        return
      }
    }
    const fullItems = itemIds.map((id) => userItemMap.get(id))
    const lookData = {
      id: body.id || cryptoRandomId(),
      userId: req.identity.id,
      occasion: String(body.occasion ?? 'casual').trim() || 'casual',
      preferences: body.preferences ?? {},
      weather: body.weather ?? {},
      items: fullItems,
      itemIds,
      explanation: Array.isArray(body.explanation) ? body.explanation : [],
      score: typeof body.score === 'number' ? body.score : null,
      breakdown: body.breakdown ?? {},
      pieceScores: body.pieceScores ?? [],
      feedback: body.feedback ?? null,
      rating: typeof body.rating === 'number' ? body.rating : null,
      createdAt: body.createdAt || Date.now(),
    }
    const saved = store.saveLook(lookData)
    const returnLook = {
      ...saved,
      items: Array.isArray(saved.items) ? saved.items.map((it) => attachTokenToItem(it, token)) : [],
    }
    res.status(201).json({ success: true, look: returnLook, saved: true })
  })

  app.get('/api/looks', requireAuth, (req, res) => {
    const token = extractToken(req)
    const looks = store.listLooks(req.identity.id).map((look) => ({
      ...look,
      items: Array.isArray(look.items) ? look.items.map((it) => attachTokenToItem(it, token)) : [],
    }))
    res.json({ success: true, looks })
  })

  app.get('/api/looks/:id', requireAuth, (req, res) => {
    const token = extractToken(req)
    const look = store.getLook(req.identity.id, req.params.id)
    if (!look) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Look not found in this account.' })
      return
    }
    res.json({
      success: true,
      look: {
        ...look,
        items: Array.isArray(look.items) ? look.items.map((it) => attachTokenToItem(it, token)) : [],
      },
    })
  })

  app.patch('/api/looks/:id/feedback', requireAuth, (req, res) => {
    const { feedback, rating } = req.body ?? {}
    if (feedback !== undefined && feedback !== 'like' && feedback !== 'dislike' && feedback !== null) {
      res.status(400).json({ success: false, code: 'INVALID_FEEDBACK', message: 'Feedback must be "like", "dislike", or null.' })
      return
    }
    if (rating !== undefined && rating !== null && (typeof rating !== 'number' || rating < 1 || rating > 5)) {
      res.status(400).json({ success: false, code: 'INVALID_RATING', message: 'Rating must be an integer between 1 and 5.' })
      return
    }
    const updated = store.updateLookFeedback(req.identity.id, req.params.id, { feedback, rating })
    if (!updated) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Look not found in this account.' })
      return
    }
    const token = extractToken(req)
    res.json({
      success: true,
      look: {
        ...updated,
        items: Array.isArray(updated.items) ? updated.items.map((it) => attachTokenToItem(it, token)) : [],
      },
    })
  })

  app.delete('/api/looks/:id', requireAuth, (req, res) => {
    const removed = store.removeLook(req.identity.id, req.params.id)
    if (!removed) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Look not found in this account.' })
      return
    }
    res.json({ success: true })
  })

  // ── Profile (user's saved location + preferences) ─────────────────────
  app.get('/api/profile', requireAuth, (_req, res) => {
    const profile = store.getProfile(_req.identity.id) ?? {
      location: null, style: null, comfort: null, theme: null, preferences: {},
    }
    res.json({ success: true, profile })
  })

  app.put('/api/profile', requireAuth, (req, res) => {
    const body = req.body ?? {}
    const location = body.location && typeof body.location === 'object'
      ? {
          name: String(body.location.name ?? '').trim(),
          region: String(body.location.region ?? ''),
          country: String(body.location.country ?? ''),
          latitude: Number(body.location.latitude),
          longitude: Number(body.location.longitude),
        }
      : null
    if (location && (!location.name || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude))) {
      res.status(400).json({ success: false, code: 'BAD_LOCATION', message: 'A saved location needs a name and valid coordinates.' })
      return
    }

    // Sanitize and validate structured personal style preferences
    const rawPrefs = body.preferences && typeof body.preferences === 'object' ? body.preferences : {}
    const preferences = {
      preferredStyles: Array.isArray(rawPrefs.preferredStyles)
        ? rawPrefs.preferredStyles.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
        : [],
      favoriteColors: Array.isArray(rawPrefs.favoriteColors)
        ? rawPrefs.favoriteColors.map((c) => String(c).trim()).filter(Boolean)
        : [],
      avoidColors: Array.isArray(rawPrefs.avoidColors)
        ? rawPrefs.avoidColors.map((c) => String(c).trim()).filter(Boolean)
        : [],
      formality: typeof rawPrefs.formality === 'string' ? rawPrefs.formality.trim().toLowerCase() || null : null,
      comfort: Array.isArray(rawPrefs.comfort)
        ? rawPrefs.comfort.map((c) => String(c).trim().toLowerCase()).filter(Boolean)
        : (typeof rawPrefs.comfort === 'string' && rawPrefs.comfort.trim() ? [rawPrefs.comfort.trim().toLowerCase()] : []),
      layering: typeof rawPrefs.layering === 'string' ? rawPrefs.layering.trim().toLowerCase() || null : null,
      typicalOccasions: Array.isArray(rawPrefs.typicalOccasions)
        ? rawPrefs.typicalOccasions.map((o) => String(o).trim()).filter(Boolean)
        : [],
      silhouettes: Array.isArray(rawPrefs.silhouettes)
        ? rawPrefs.silhouettes.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
        : [],
    }

    const style = typeof body.style === 'string'
      ? body.style.trim() || null
      : (preferences.preferredStyles[0] || null)

    const comfort = typeof body.comfort === 'string'
      ? body.comfort.trim() || null
      : (preferences.comfort[0] || null)

    const saved = store.saveProfile(req.identity.id, {
      location,
      style,
      comfort,
      theme: typeof body.theme === 'string' ? body.theme.trim() || null : null,
      preferences,
    })
    res.json({ success: true, profile: saved })
  })

  // ── Weather (Phase 4) ──────────────────────────────────────────────
  app.get('/api/weather', async (req, res) => {
    try {
      const { latitude, longitude, city, name, forceRefresh } = req.query
      if (latitude === undefined || longitude === undefined) {
        res.status(400).json({
          success: false,
          code: 'MISSING_COORDINATES',
          message: 'Latitude and longitude query parameters are required.',
        })
        return
      }
      const weather = await getWeatherForCoordinates({
        latitude,
        longitude,
        locationName: city || name || '',
        forceRefresh: forceRefresh === 'true' || forceRefresh === '1',
      })
      res.json({ success: true, weather })
    } catch (err) {
      const isBadCoord = err.message?.includes('Latitude') || err.message?.includes('Longitude')
      res.status(isBadCoord ? 400 : 502).json({
        success: false,
        code: isBadCoord ? 'INVALID_COORDINATES' : 'WEATHER_SERVICE_ERROR',
        message: err.message || 'Unable to retrieve weather data.',
      })
    }
  })

  app.get('/api/weather/search', async (req, res) => {
    try {
      const query = req.query.q || req.query.query
      if (!query || String(query).trim().length < 2) {
        res.json({ success: true, results: [] })
        return
      }
      const results = await searchLocationsBackend({ query: String(query).trim() })
      res.json({ success: true, results })
    } catch (err) {
      res.status(502).json({
        success: false,
        code: 'GEOCODING_ERROR',
        message: err.message || 'Geocoding service unavailable.',
      })
    }
  })

  // ── Files (ownership enforced) ─────────────────────────────────────
  app.get(
    '/api/files/:userId/:jobId/:file',
    requireAuth,
    requireOwnership,
    (req, res) => {
      const ext = path.extname(req.params.file).toLowerCase()
      const allowedExts = ['.png', '.webp', '.jpg', '.jpeg']
      if (!allowedExts.includes(ext)) {
        res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Forbidden file extension.' })
        return
      }
      const target = path.join(userDir(req.params.userId), req.params.jobId, req.params.file)
      const base = path.resolve(userDir(req.params.userId))
      if (!path.resolve(target).startsWith(base + path.sep) || !fs.existsSync(target)) {
        res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'File not found.' })
        return
      }
      const type = mimeFor(req.params.file)
      res.setHeader('Content-Type', type)
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Cache-Control', 'private, max-age=3600')
      res.sendFile(path.resolve(target))
    },
  )

  // ── Production Frontend Static Serving ──────────────────────────────
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist')
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false }))
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next()
      const indexFile = path.join(clientDist, 'index.html')
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile)
      } else {
        next()
      }
    })
  }

  // ── Errors ──────────────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ success: false, code: 'FILE_TOO_LARGE', message: 'Photograph exceeds the size limit.' })
      return
    }
    console.error('[maeve-server] error:', err)
    res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Internal server error.' })
  })

  return app
}

function extractBearer(req) {
  const header = req.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7) : null
}

function mimeFor(name) {
  const ext = path.extname(name).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

export function startServer(app, port = config.port) {
  return new Promise((resolve) => {
    const server = app.listen(port, () => resolve(server))
    server.on('close', () => shutdownWorkers())
    return server
  })
}

export { imagesDir }