import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Schema compatibility: a real wardrobe created by the previous MAEVE version
 * (v3, no colour-provenance columns) must upgrade in place — every existing
 * row preserved, new columns present and nullable, and new writes accepted.
 */

function makeV3Db(file) {
  const db = new DatabaseSync(file)
  db.exec(`
    CREATE TABLE wardrobe_items (
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
      pattern            TEXT,
      style              TEXT,
      material           TEXT,
      sleeve             TEXT,
      length             TEXT,
      season             TEXT,
      confidence         REAL,
      needs_user_input   INTEGER NOT NULL DEFAULT 0,
      times_worn         INTEGER NOT NULL DEFAULT 0,
      last_worn_at       TEXT,
      created_at         INTEGER NOT NULL,
      updated_at         INTEGER NOT NULL,
      PRIMARY KEY (user_id, id)
    );
    INSERT INTO wardrobe_items
      (id, user_id, name, category, subcategory, color, color_hex,
       confidence, needs_user_input, times_worn, created_at, updated_at)
    VALUES
      ('old-1', 'legacy@test.com', 'Navy trousers', 'bottoms', 'trousers',
       'navy', '#1B2A4A', 0.91, 0, 3, 1, 1);
    PRAGMA user_version = 3;
  `)
  db.close()
}

test('migration: v3 database upgrades to v5 and keeps every existing row', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maeve-migrate-'))
  const file = path.join(dir, 'maeve.db')
  makeV3Db(file)
  process.env.MAEVE_DB = file
  process.env.MAEVE_DATA_DIR = path.join(dir, 'data')

  const { initDb, createStore } = await import('../src/db.js')
  const db = initDb()
  const store = createStore(db)

  const { user_version: version } = db.prepare('PRAGMA user_version').get()
  assert.ok(version >= 5, `expected version >= 5, got ${version}`)

  const cols = new Set(
    db.prepare('PRAGMA table_info(wardrobe_items)').all().map((c) => c.name),
  )
  for (const c of ['secondary_color', 'color_confidence', 'user_corrected', 'weather_suitability']) {
    assert.ok(cols.has(c), `missing migrated column ${c}`)
  }

  const lookCols = new Set(
    db.prepare('PRAGMA table_info(looks)').all().map((c) => c.name),
  )
  for (const c of ['feedback', 'rating']) {
    assert.ok(lookCols.has(c), `missing migrated looks column ${c}`)
  }

  // The pre-existing row survives untouched; new fields are honestly null/false.
  const legacy = store.getItem('legacy@test.com', 'old-1')
  assert.equal(legacy.category, 'bottoms')
  assert.equal(legacy.subcategory, 'trousers')
  assert.equal(legacy.color, 'navy')
  assert.equal(legacy.colorHex, '#1B2A4A')
  assert.equal(legacy.timesWorn, 3)
  assert.equal(legacy.secondaryColor, null)
  assert.equal(legacy.colorConfidence, null)
  assert.equal(legacy.userCorrected, false)
  assert.equal(legacy.weatherSuitability, null)

  // New writes (including the new Shirt category and colour provenance) work.
  store.saveItems('legacy@test.com', [{
    id: 'new-1',
    category: 'shirt',
    subcategory: 'long_sleeved_shirt',
    color: 'white',
    colorHex: '#F2F2F2',
    secondaryColor: null,
    colorConfidence: 0.9,
    weatherSuitability: 'mild',
    needsUserInput: false,
    userCorrected: true,
    createdAt: 2,
    updatedAt: 2,
  }])
  const fresh = store.getItem('legacy@test.com', 'new-1')
  assert.equal(fresh.category, 'shirt')
  assert.equal(fresh.colorConfidence, 0.9)
  assert.equal(fresh.userCorrected, true)
  assert.equal(fresh.needsUserInput, false)
  assert.equal(fresh.weatherSuitability, 'mild')

  // Look write with feedback and rating works.
  const look = store.saveLook({
    userId: 'legacy@test.com',
    id: 'look-1',
    occasion: 'work',
    feedback: 'Loved the linen shirt pairing',
    rating: 5,
  })
  assert.equal(look.feedback, 'Loved the linen shirt pairing')
  assert.equal(look.rating, 5)

  db.close()
  fs.rmSync(dir, { recursive: true, force: true })
})
