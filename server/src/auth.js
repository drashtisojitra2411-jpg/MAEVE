import crypto from 'node:crypto'

/**
 * Server-authoritative authentication.
 *
 * Passwords are stored only as salted scrypt digests; sessions are opaque
 * random tokens whose SHA-256 hash is persisted in the `sessions` table. The
 * backend alone decides who you are: a token is valid only while its session
 * row exists and has not expired, and `logout` deletes that row so a token
 * cannot be replayed. Nothing about identity is trusted from the client beyond
 * the bearer token itself.
 */

const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const KEYLEN = 64

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Hash a password with a fresh random salt. Format: scrypt$N$r$p$salt$hash. */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const derived = crypto.scryptSync(String(password), salt, KEYLEN, SCRYPT)
  return [
    'scrypt',
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$')
}

/** Constant-time verification of a password against a stored digest. */
export function verifyPassword(password, stored) {
  try {
    const parts = String(stored ?? '').split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false
    const [, n, r, p, saltB64, hashB64] = parts
    const salt = Buffer.from(saltB64, 'base64url')
    const expected = Buffer.from(hashB64, 'base64url')
    const derived = crypto.scryptSync(String(password), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT.maxmem,
    })
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/** A cryptographically random, opaque session token (never guessable). */
export function generateSessionToken() {
  return crypto.randomBytes(32).toString('base64url')
}

/** Sessions store only the hash, so a DB leak cannot be replayed as a token. */
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

export function sessionExpiry(now = Date.now()) {
  return now + TTL_MS
}

export function extractToken(req) {
  const header = req.headers.authorization || ''
  if (header.startsWith('Bearer ')) return header.slice(7)
  // Image URLs carry the token as ?token=... so they can be rendered in
  // <img src> (where request headers cannot be set). The token is still
  // verified against the sessions table and ownership-checked every request.
  const q = req.query && req.query.token
  return typeof q === 'string' && q.length > 0 ? q : null
}

/** Resolve a raw token to `{ id, name, email }`, or null if it is not valid. */
export function resolveIdentity(store, token) {
  if (!token) return null
  const row = store.findSession(hashToken(token))
  if (!row) return null
  if (typeof row.expires_at === 'number' && row.expires_at <= Date.now()) {
    store.deleteSession(row.token_hash)
    return null
  }
  const user = store.findUserById(row.user_id)
  if (!user) return null
  return { id: user.id, name: user.name, email: user.email }
}

/** Build the auth middleware bound to a specific store (DB-backed sessions). */
export function createRequireAuth(store) {
  return function requireAuth(req, res, next) {
    const token = extractToken(req)
    const identity = resolveIdentity(store, token)
    if (!identity) {
      res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'A valid session is required.',
      })
      return
    }
    req.identity = identity
    req.sessionTokenHash = hashToken(token)
    next()
  }
}

/** Restrict file access to the token's own user. */
export function requireOwnership(req, res, next) {
  if (!req.identity || req.identity.id !== req.params.userId) {
    res.status(403).json({
      success: false,
      code: 'FORBIDDEN',
      message: "You can't access another user's files.",
    })
    return
  }
  next()
}
