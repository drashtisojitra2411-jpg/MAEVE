import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

/**
 * Persistence layer — SQLite (`wardrobe_items`, `looks`, `profiles`).
 *
 * Only *confirmed* garments are ever stored here (the analysis result itself
 * is ephemeral job data; nothing is written until the user confirms). Every
 * row belongs to `user_id`, and every query filters by it, so cross-user
 * access is impossible server-side regardless of what the client asks for.
 * Looks snapshot the selected items (so history stays renderable even if a
 * piece is later deleted); profiles hold the user's saved preferences.
 */

export function initDb(dbPath = config.dbFile) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  }
  const db = new DatabaseSync(dbPath)
  try {
    db.exec('PRAGMA journal_mode = WAL;')
    db.exec('PRAGMA synchronous = NORMAL;')
    db.exec('PRAGMA foreign_keys = ON;')
    db.exec('PRAGMA busy_timeout = 5000;')
  } catch {
    /* fallback if restricted or memory db */
  }
  migrateSchema(db)
  db.exec(`
    CREATE TABLE IF NOT EXISTS wardrobe_items (
      id                 TEXT NOT NULL,
      user_id            TEXT NOT NULL,
      name               TEXT,
      original_image_url TEXT,
      isolated_image_url TEXT,
      image_url          TEXT,
      category           TEXT,
      subcategory        TEXT,
      color              TEXT,
      color_hex          TEXT,
      secondary_color    TEXT,
      color_confidence   REAL,
      pattern            TEXT,
      style              TEXT,
      material           TEXT,
      sleeve             TEXT,
      length             TEXT,
      season             TEXT,
      weather_suitability TEXT,
      confidence         REAL,
      needs_user_input   INTEGER NOT NULL DEFAULT 0,
      user_corrected     INTEGER NOT NULL DEFAULT 0,
      times_worn         INTEGER NOT NULL DEFAULT 0,
      last_worn_at       TEXT,
      created_at         INTEGER NOT NULL,
      updated_at         INTEGER NOT NULL,
      PRIMARY KEY (user_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_wardrobe_user ON wardrobe_items(user_id);

    CREATE TABLE IF NOT EXISTS looks (
      id              TEXT NOT NULL,
      user_id         TEXT NOT NULL,
      occasion        TEXT NOT NULL,
      preferences     TEXT NOT NULL DEFAULT '{}',
      weather         TEXT NOT NULL DEFAULT '{}',
      items           TEXT NOT NULL DEFAULT '[]',
      item_ids        TEXT NOT NULL DEFAULT '[]',
      explanation     TEXT NOT NULL DEFAULT '[]',
      score           REAL,
      breakdown       TEXT NOT NULL DEFAULT '{}',
      piece_scores    TEXT NOT NULL DEFAULT '[]',
      feedback        TEXT,
      rating          INTEGER,
      created_at      INTEGER NOT NULL,
      PRIMARY KEY (user_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_looks_user ON looks(user_id);

    CREATE TABLE IF NOT EXISTS profiles (
      user_id           TEXT PRIMARY KEY,
      location_name     TEXT,
      location_region   TEXT,
      location_country  TEXT,
      location_latitude REAL,
      location_longitude REAL,
      style             TEXT,
      comfort           TEXT,
      theme             TEXT,
      preferences       TEXT NOT NULL DEFAULT '{}',
      updated_at        INTEGER NOT NULL
    );

    -- Accounts. 'id' is the normalized email so existing per-user data and
    -- image directories keep their identity. Passwords are only ever stored
    -- as a salted scrypt digest - never plaintext.
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

    -- Server-side sessions. Logout deletes the row, so a token cannot be
    -- replayed after the user signs out. Only the token *hash* is stored.
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `)
  return db
}

const SCHEMA_VERSION = 7

/**
 * Migrate database files created by an earlier MAEVE version. Version 2 makes
 * every row's primary key per-user (user_id, id) so an id collision between two
 * accounts can never re-own another user's garment — per-user isolation is
 * structural, not just a WHERE clause. Version 3 adds the `users`/`sessions`
 * tables for real server-authoritative authentication. Version 4 adds real
 * colour provenance (`secondary_color`, `color_confidence`) and a
 * `user_corrected` flag. Version 5 adds `weather_suitability` to garments and
 * `feedback`/`rating` to looks. Version 6 strips stale query tokens from stored
 * wardrobe image URLs so asset references remain permanent and stable across
 * session lifecycles. Version 7 adds structured personal style `preferences`
 * to profiles.
 */
function migrateSchema(db) {
  try {
    const { user_version: version } = db.prepare('PRAGMA user_version').get()
    if (version >= SCHEMA_VERSION) return
    if (version < 2) {
      db.exec('DROP TABLE IF EXISTS wardrobe_items; DROP TABLE IF EXISTS looks; DROP TABLE IF EXISTS profiles;')
    } else {
      ensureWardrobeColumns(db)
      ensureLooksColumns(db)
      ensureProfilesColumns(db)
      cleanDbUrls(db)
    }
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  } catch {
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  }
}

function cleanDbUrls(db) {
  try {
    const rows = db.prepare('SELECT id, user_id, original_image_url, isolated_image_url, image_url FROM wardrobe_items').all()
    const update = db.prepare(`
      UPDATE wardrobe_items SET
        original_image_url = @original_image_url,
        isolated_image_url = @isolated_image_url,
        image_url = @image_url
      WHERE id = @id AND user_id = @user_id
    `)
    for (const r of rows) {
      const cleanOrig = r.original_image_url ? r.original_image_url.split('?')[0] : r.original_image_url
      const cleanIso = r.isolated_image_url ? r.isolated_image_url.split('?')[0] : r.isolated_image_url
      const cleanImg = r.image_url ? r.image_url.split('?')[0] : r.image_url
      if (cleanOrig !== r.original_image_url || cleanIso !== r.isolated_image_url || cleanImg !== r.image_url) {
        update.run({
          id: r.id,
          user_id: r.user_id,
          original_image_url: cleanOrig,
          isolated_image_url: cleanIso,
          image_url: cleanImg,
        })
      }
    }
  } catch {
    // ignore if table not ready
  }
}

// Columns added after the original schema. Each is additive so an existing
// wardrobe keeps every row and simply gains the new attributes (null for old
// rows, which is honest — those values were never measured).
const WARDROBE_ADDED_COLUMNS = [
  ['secondary_color', 'TEXT'],
  ['color_confidence', 'REAL'],
  ['user_corrected', 'INTEGER NOT NULL DEFAULT 0'],
  ['weather_suitability', 'TEXT'],
]

function ensureWardrobeColumns(db) {
  let existing
  try {
    existing = new Set(db.prepare('PRAGMA table_info(wardrobe_items)').all().map((c) => c.name))
  } catch {
    return
  }
  if (existing.size === 0) return
  for (const [name, decl] of WARDROBE_ADDED_COLUMNS) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE wardrobe_items ADD COLUMN ${name} ${decl}`)
    }
  }
}

const LOOKS_ADDED_COLUMNS = [
  ['feedback', 'TEXT'],
  ['rating', 'INTEGER'],
]

function ensureLooksColumns(db) {
  let existing
  try {
    existing = new Set(db.prepare('PRAGMA table_info(looks)').all().map((c) => c.name))
  } catch {
    return
  }
  if (existing.size === 0) return
  for (const [name, decl] of LOOKS_ADDED_COLUMNS) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE looks ADD COLUMN ${name} ${decl}`)
    }
  }
}

const PROFILES_ADDED_COLUMNS = [
  ['preferences', "TEXT NOT NULL DEFAULT '{}'"],
]

function ensureProfilesColumns(db) {
  let existing
  try {
    existing = new Set(db.prepare('PRAGMA table_info(profiles)').all().map((c) => c.name))
  } catch {
    return
  }
  if (existing.size === 0) return
  for (const [name, decl] of PROFILES_ADDED_COLUMNS) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE profiles ADD COLUMN ${name} ${decl}`)
    }
  }
}

const ROW_COLS = [
  'id', 'user_id', 'name', 'original_image_url', 'isolated_image_url',
  'image_url', 'category', 'subcategory', 'color', 'color_hex',
  'secondary_color', 'color_confidence', 'pattern',
  'style', 'material', 'sleeve', 'length', 'season', 'weather_suitability', 'confidence',
  'needs_user_input', 'user_corrected', 'times_worn', 'last_worn_at',
  'created_at', 'updated_at',
]

function toRow(item) {
  return {
    id: String(item.id),
    user_id: item.userId,
    name: item.name ?? null,
    original_image_url: item.originalImageUrl ?? null,
    isolated_image_url: item.isolatedImageUrl ?? null,
    image_url: item.imageUrl ?? null,
    category: item.category ?? null,
    subcategory: item.subcategory ?? null,
    color: item.color ?? null,
    color_hex: item.colorHex ?? null,
    secondary_color: item.secondaryColor ?? null,
    color_confidence: item.colorConfidence ?? null,
    pattern: item.pattern ?? null,
    style: item.style ?? null,
    material: item.material ?? null,
    sleeve: item.sleeve ?? null,
    length: item.length ?? null,
    season: item.season ?? null,
    weather_suitability: item.weatherSuitability ?? item.weather_suitability ?? null,
    confidence: item.confidence ?? null,
    needs_user_input: item.needsUserInput ? 1 : 0,
    user_corrected: item.userCorrected ? 1 : 0,
    times_worn: item.timesWorn ?? 0,
    last_worn_at: item.lastWornAt ?? null,
    created_at: item.createdAt ?? Date.now(),
    updated_at: item.updatedAt ?? Date.now(),
  }
}

function fromRow(row) {
  if (!row) return null
  const cleanImg = row.image_url ? row.image_url.split('?')[0] : null
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    originalImageUrl: row.original_image_url ? row.original_image_url.split('?')[0] : null,
    isolatedImageUrl: row.isolated_image_url ? row.isolated_image_url.split('?')[0] : null,
    imageUrl: cleanImg,
    thumbnailUrl: cleanImg,
    category: row.category,
    subcategory: row.subcategory,
    color: row.color,
    colorHex: row.color_hex,
    secondaryColor: row.secondary_color,
    colorConfidence: row.color_confidence,
    pattern: row.pattern,
    style: row.style,
    material: row.material,
    sleeve: row.sleeve,
    length: row.length,
    season: row.season,
    weatherSuitability: row.weather_suitability,
    confidence: row.confidence,
    needsUserInput: row.needs_user_input === 1,
    userCorrected: row.user_corrected === 1,
    timesWorn: row.times_worn,
    lastWornAt: row.last_worn_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createStore(db) {
  const insert = db.prepare(`
    INSERT INTO wardrobe_items (${ROW_COLS.join(',')})
    VALUES (${ROW_COLS.map((c) => `@${c}`).join(',')})
    ON CONFLICT(user_id, id) DO UPDATE SET
      name=@name, original_image_url=@original_image_url,
      isolated_image_url=@isolated_image_url, image_url=@image_url,
      category=@category, subcategory=@subcategory, color=@color,
      color_hex=@color_hex, secondary_color=@secondary_color,
      color_confidence=@color_confidence, pattern=@pattern, style=@style,
      material=@material, sleeve=@sleeve, length=@length, season=@season,
      weather_suitability=@weather_suitability,
      confidence=@confidence, needs_user_input=@needs_user_input,
      user_corrected=@user_corrected,
      times_worn=@times_worn, last_worn_at=@last_worn_at,
      updated_at=@updated_at
  `)
  const selectAll = db.prepare(
    'SELECT * FROM wardrobe_items WHERE user_id = ? ORDER BY created_at DESC',
  )
  const selectOne = db.prepare(
    'SELECT * FROM wardrobe_items WHERE id = ? AND user_id = ?',
  )
  const remove = db.prepare('DELETE FROM wardrobe_items WHERE id = ? AND user_id = ?')
  const removeAll = db.prepare('DELETE FROM wardrobe_items WHERE user_id = ?')
  const insertLook = db.prepare(`
    INSERT INTO looks (${LOOK_COLS.join(',')})
    VALUES (${LOOK_COLS.map((c) => `@${c}`).join(',')})
    ON CONFLICT(user_id, id) DO UPDATE SET
      occasion=@occasion, preferences=@preferences, weather=@weather,
      items=@items, item_ids=@item_ids, explanation=@explanation,
      score=@score, breakdown=@breakdown, piece_scores=@piece_scores,
      feedback=@feedback, rating=@rating
  `)
  const selectLooks = db.prepare(
    'SELECT * FROM looks WHERE user_id = ? ORDER BY created_at DESC',
  )
  const selectOneLook = db.prepare('SELECT * FROM looks WHERE id = ? AND user_id = ?')
  const updateFeedbackStmt = db.prepare(`
    UPDATE looks SET
      feedback = @feedback,
      rating = @rating
    WHERE id = @id AND user_id = @user_id
  `)
  const removeLookStmt = db.prepare('DELETE FROM looks WHERE id = ? AND user_id = ?')
  const clearLooks = db.prepare('DELETE FROM looks WHERE user_id = ?')
  const selectProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?')
  const removeProfile = db.prepare('DELETE FROM profiles WHERE user_id = ?')
  const saveProfileStmt = db.prepare(`
    INSERT INTO profiles (user_id, location_name, location_region, location_country,
      location_latitude, location_longitude, style, comfort, theme, preferences, updated_at)
    VALUES (@user_id, @location_name, @location_region, @location_country,
      @location_latitude, @location_longitude, @style, @comfort, @theme, @preferences, @updated_at)
    ON CONFLICT(user_id) DO UPDATE SET
      location_name=@location_name, location_region=@location_region,
      location_country=@location_country, location_latitude=@location_latitude,
      location_longitude=@location_longitude, style=@style, comfort=@comfort,
      theme=@theme, preferences=@preferences, updated_at=@updated_at
  `)
  const insertUser = db.prepare(`
    INSERT INTO users (id, email, name, password_hash, created_at)
    VALUES (@id, @email, @name, @password_hash, @created_at)
  `)
  const selectUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?')
  const selectUserById = db.prepare('SELECT * FROM users WHERE id = ?')
  const insertSession = db.prepare(`
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
    VALUES (@token_hash, @user_id, @created_at, @expires_at)
  `)
  const selectSession = db.prepare('SELECT * FROM sessions WHERE token_hash = ?')
  const deleteSessionStmt = db.prepare('DELETE FROM sessions WHERE token_hash = ?')
  const deleteUserSessionsStmt = db.prepare('DELETE FROM sessions WHERE user_id = ?')
  const deleteExpiredSessionsStmt = db.prepare('DELETE FROM sessions WHERE expires_at <= ?')

  return {
    saveItems(userId, items) {
      if (!items || items.length === 0) return
      db.exec('BEGIN IMMEDIATE')
      try {
        for (const item of items) {
          const row = toRow({ ...item, userId })
          insert.run(row)
        }
        db.exec('COMMIT')
      } catch (err) {
        try { db.exec('ROLLBACK') } catch { /* ignore rollback error */ }
        throw err
      }
    },
    listItems(userId) {
      return selectAll.all(userId).map(fromRow)
    },
    getItem(userId, id) {
      return fromRow(selectOne.get(id, userId))
    },
    removeItem(userId, id) {
      const res = remove.run(id, userId)
      return res.changes > 0
    },
    clearUser(userId) {
      db.exec('BEGIN IMMEDIATE')
      try {
        removeAll.run(userId)
        clearLooks.run(userId)
        removeProfile.run(userId)
        db.exec('COMMIT')
      } catch (err) {
        try { db.exec('ROLLBACK') } catch { /* ignore rollback error */ }
        throw err
      }
    },
    saveLook({ userId, id, occasion, preferences, weather, items, itemIds, explanation, score, breakdown, pieceScores, feedback, rating, createdAt }) {
      const ids = Array.isArray(itemIds) ? itemIds : (Array.isArray(items) ? items.map((i) => i.id) : [])
      // Duplicate prevention: If a look with identical item set and occasion exists for this user, reuse it
      const existing = selectLooks.all(userId).map(fromLookRow)
      const targetSig = [...ids].sort().join('|')
      const duplicate = existing.find(
        (l) => l.occasion === occasion && [...(l.itemIds || [])].sort().join('|') === targetSig,
      )
      if (duplicate && duplicate.id !== id) {
        return duplicate
      }

      const row = {
        id: String(id),
        user_id: userId,
        occasion,
        preferences: JSON.stringify(preferences ?? {}),
        weather: JSON.stringify(weather ?? {}),
        items: JSON.stringify(items ?? []),
        item_ids: JSON.stringify(ids),
        explanation: JSON.stringify(explanation ?? []),
        score: score ?? null,
        breakdown: JSON.stringify(breakdown ?? {}),
        piece_scores: JSON.stringify(pieceScores ?? []),
        feedback: feedback ?? null,
        rating: typeof rating === 'number' ? rating : null,
        created_at: createdAt ?? Date.now(),
      }
      insertLook.run(row)
      return fromLookRow(row)
    },
    getLook(userId, id) {
      const look = fromLookRow(selectOneLook.get(id, userId))
      if (!look) return null
      const activeIds = new Set(selectAll.all(userId).map((r) => r.id))
      const missing = (look.itemIds ?? []).filter((itemId) => !activeIds.has(itemId))
      return {
        ...look,
        incomplete: missing.length > 0,
        missingItemIds: missing,
        items: (look.items ?? []).map((it) => ({
          ...it,
          isAvailable: activeIds.has(it.id),
        })),
      }
    },
    updateLookFeedback(userId, id, { feedback, rating }) {
      const existing = selectOneLook.get(id, userId)
      if (!existing) return null
      const newFeedback = feedback !== undefined ? feedback : existing.feedback
      const newRating = rating !== undefined ? (typeof rating === 'number' ? rating : null) : existing.rating
      updateFeedbackStmt.run({
        id,
        user_id: userId,
        feedback: newFeedback ?? null,
        rating: newRating ?? null,
      })
      return this.getLook(userId, id)
    },
    listLooks(userId) {
      const rows = selectLooks.all(userId).map(fromLookRow)
      const activeIds = new Set(selectAll.all(userId).map((r) => r.id))
      return rows.map((look) => {
        const missing = (look.itemIds ?? []).filter((itemId) => !activeIds.has(itemId))
        return {
          ...look,
          incomplete: missing.length > 0,
          missingItemIds: missing,
          items: (look.items ?? []).map((it) => ({
            ...it,
            isAvailable: activeIds.has(it.id),
          })),
        }
      })
    },
    removeLook(userId, id) {
      const res = removeLookStmt.run(id, userId)
      return res.changes > 0
    },
    getProfile(userId) {
      return fromProfileRow(selectProfile.get(userId))
    },
    saveProfile(userId, profile) {
      saveProfileStmt.run({
        user_id: userId,
        location_name: profile.location?.name ?? null,
        location_region: profile.location?.region ?? null,
        location_country: profile.location?.country ?? null,
        location_latitude: profile.location?.latitude ?? null,
        location_longitude: profile.location?.longitude ?? null,
        style: profile.style ?? null,
        comfort: profile.comfort ?? null,
        theme: profile.theme ?? null,
        preferences: JSON.stringify(profile.preferences ?? {}),
        updated_at: Date.now(),
      })
      return this.getProfile(userId)
    },
    recordWear(userId, { itemIds, _lookId, timestamp = Date.now() }) {
      const ids = Array.isArray(itemIds) ? itemIds : []
      if (ids.length === 0) return { updated: 0, items: [] }
      const nowIso = new Date(timestamp).toISOString()
      const updatedItems = []

      const updateWearStmt = db.prepare(`
        UPDATE wardrobe_items SET
          times_worn = times_worn + 1,
          last_worn_at = @last_worn_at,
          updated_at = @updated_at
        WHERE id = @id AND user_id = @user_id
      `)

      db.exec('BEGIN IMMEDIATE')
      try {
        for (const id of ids) {
          const existing = selectOne.get(id, userId)
          if (existing) {
            updateWearStmt.run({
              id,
              user_id: userId,
              last_worn_at: nowIso,
              updated_at: timestamp,
            })
            const fresh = selectOne.get(id, userId)
            if (fresh) updatedItems.push(fromRow(fresh))
          }
        }
        db.exec('COMMIT')
      } catch (err) {
        try { db.exec('ROLLBACK') } catch { /* ignore rollback error */ }
        throw err
      }

      return { updated: updatedItems.length, items: updatedItems, wornAt: nowIso }
    },

    // ── Accounts ────────────────────────────────────────────────────────
    createUser({ id, email, name, passwordHash }) {
      const now = Date.now()
      insertUser.run({ id, email, name, password_hash: passwordHash, created_at: now })
      return { id, email, name, createdAt: now }
    },
    findUserByEmail(email) {
      return fromUserRow(selectUserByEmail.get(email))
    },
    findUserById(id) {
      return fromUserRow(selectUserById.get(id))
    },

    // ── Sessions ────────────────────────────────────────────────────────
    createSession({ tokenHash, userId, expiresAt }) {
      insertSession.run({
        token_hash: tokenHash,
        user_id: userId,
        created_at: Date.now(),
        expires_at: expiresAt,
      })
    },
    findSession(tokenHash) {
      return selectSession.get(tokenHash) ?? null
    },
    deleteSession(tokenHash) {
      return deleteSessionStmt.run(tokenHash).changes > 0
    },
    deleteUserSessions(userId) {
      deleteUserSessionsStmt.run(userId)
    },
    deleteExpiredSessions(now = Date.now()) {
      return deleteExpiredSessionsStmt.run(now).changes
    },
  }
}

function fromUserRow(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  }
}

const LOOK_COLS = ['id', 'user_id', 'occasion', 'preferences', 'weather', 'items', 'item_ids', 'explanation', 'score', 'breakdown', 'piece_scores', 'feedback', 'rating', 'created_at']

function fromLookRow(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    occasion: row.occasion,
    preferences: safeJson(row.preferences, {}),
    weather: safeJson(row.weather, {}),
    items: safeJson(row.items, []),
    itemIds: safeJson(row.item_ids, []),
    explanation: safeJson(row.explanation, []),
    score: row.score,
    breakdown: safeJson(row.breakdown, {}),
    pieceScores: safeJson(row.piece_scores, []),
    feedback: row.feedback ?? null,
    rating: row.rating ?? null,
    createdAt: row.created_at,
  }
}

function fromProfileRow(row) {
  if (!row) return null
  const location = row.location_name
    ? {
        name: row.location_name,
        region: row.location_region ?? '',
        country: row.location_country ?? '',
        latitude: row.location_latitude,
        longitude: row.location_longitude,
      }
    : null
  return {
    location,
    style: row.style ?? null,
    comfort: row.comfort ?? null,
    theme: row.theme ?? null,
    preferences: safeJson(row.preferences, {}),
    updatedAt: row.updated_at,
  }
}

function safeJson(raw, fallback) {
  if (raw == null) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

/**
 * Creates a point-in-time, consistent hot backup of the SQLite database using VACUUM INTO.
 * Safe to execute concurrently while the server is actively handling requests.
 */
export function backupDb(db, destinationPath) {
  if (!db) throw new Error('Database instance required for backup.')
  if (!destinationPath) throw new Error('Destination path required for backup.')
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
  if (fs.existsSync(destinationPath)) {
    fs.unlinkSync(destinationPath)
  }
  const escaped = destinationPath.replace(/'/g, "''")
  db.exec(`VACUUM INTO '${escaped}'`)
  return {
    success: true,
    destination: destinationPath,
    bytes: fs.statSync(destinationPath).size,
    timestamp: Date.now(),
  }
}