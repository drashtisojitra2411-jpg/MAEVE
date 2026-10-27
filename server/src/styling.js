/**
 * MAEVE's AI Outfit Recommendation Engine (Phase 3).
 *
 * Deterministic, rule-based fashion recommendation and compatibility scoring.
 * Honesty contract:
 *  - Only ever composes from real garments owned by the authenticated user.
 *  - Never invents garments, accessories, or fake attributes.
 *  - Category-aware outfit composition (Top + Bottom, Dress, Traditional, plus optional Outerwear/Footwear).
 *  - Transparent 0..100 normalized scoring system with explainable factor breakdowns.
 *  - Missing metadata is handled gracefully without crashing or false penalties.
 *  - Bounded candidate generation and deduplication.
 *  - Personalization incorporates user preferences and past saved look feedback.
 */

export const OCCASION_STYLES = {
  college: ['casual', 'smart-casual', 'sporty'],
  office: ['formal', 'smart-casual'],
  casual: ['casual', 'smart-casual'],
  party: ['evening', 'formal', 'smart-casual'],
  traditional: ['ethnic', 'traditional', 'formal'],
  date: ['smart-casual', 'evening', 'formal'],
  travel: ['casual', 'sporty', 'smart-casual'],
  everyday: ['casual', 'smart-casual'],
  // Legacy aliases
  work: ['formal', 'smart-casual'],
  weekend: ['casual', 'sporty'],
  formal: ['formal', 'smart-casual', 'evening'],
  evening: ['evening', 'formal', 'smart-casual'],
  ethnic: ['ethnic', 'traditional', 'formal'],
  'smart-casual': ['smart-casual', 'formal'],
  lounge: ['casual'],
}

export const OCCASION_LABELS = {
  college: 'College / University',
  office: 'Office / Professional',
  casual: 'Casual outing',
  party: 'Party / Evening',
  traditional: 'Traditional event',
  date: 'Date / Dinner',
  travel: 'Travel',
  everyday: 'General everyday wear',
}

const COMFORT_STYLES = {
  'relaxed fit': ['casual', 'smart-casual'],
  'breathable fabrics': ['casual', 'sporty', 'smart-casual'],
  'easy to move in': ['casual', 'sporty'],
  'soft textures': ['casual', 'lounge'],
}

/**
 * Normalizes user-supplied occasion string into a canonical key.
 */
export function normalizeOccasion(occasion) {
  if (!occasion || typeof occasion !== 'string') return 'everyday'
  const raw = occasion.trim().toLowerCase()
  if (OCCASION_STYLES[raw]) return raw
  if (raw.includes('college') || raw.includes('uni')) return 'college'
  if (raw.includes('office') || raw.includes('work') || raw.includes('prof')) return 'office'
  if (raw.includes('trad') || raw.includes('ethnic') || raw.includes('fest')) return 'traditional'
  if (raw.includes('party') || raw.includes('night') || raw.includes('event')) return 'party'
  if (raw.includes('date') || raw.includes('dinner')) return 'date'
  if (raw.includes('travel') || raw.includes('flight') || raw.includes('commute')) return 'travel'
  if (raw.includes('casual') || raw.includes('outing')) return 'casual'
  if (raw.includes('everyday') || raw.includes('daily') || raw.includes('regular')) return 'everyday'
  return 'casual'
}

/** Real temperature → layering bucket. null when no real weather was supplied. */
export function temperatureBucket(weather) {
  const t = typeof weather?.feelsLike === 'number' && !Number.isNaN(weather.feelsLike)
    ? weather.feelsLike
    : weather?.temperature
  if (typeof t !== 'number' || Number.isNaN(t)) return null
  if (t <= 15) return 'cool'
  if (t >= 25) return 'warm'
  return 'mild'
}

export function rainSignal(weather) {
  if (!weather || typeof weather !== 'object') return { isRainy: false, prob: 0, precip: 0 }
  const prob = typeof weather.precipitationProbability === 'number'
    ? weather.precipitationProbability
    : (typeof weather.rainProbability === 'number' ? weather.rainProbability : 0)
  const precip = typeof weather.precipitation === 'number' ? weather.precipitation : 0
  return {
    isRainy: prob >= 40 || precip > 0.5,
    prob,
    precip,
  }
}

export function weatherSuitabilitySignal(item) {
  return String(item?.weatherSuitability || item?.weather_suitability || '').toLowerCase()
}

function sleeveSignal(item) {
  const s = (item.sleeve || '').toLowerCase()
  if (s.includes('long') || s.includes('three-quarter')) return 'long'
  if (s.includes('short') || s.includes('sleeveless') || s === 'none') return 'short'
  const sub = (item.subcategory || '').toLowerCase()
  if (/long_sleeved/.test(sub)) return 'long'
  if (/short_sleeved|sling|^vest/.test(sub)) return 'short'
  return null
}

function seasonSignal(item) {
  const s = (item.season || '').toLowerCase()
  if (!s) return null
  if (/(summer|warm|hot)/.test(s)) return 'warm'
  if (/(winter|cold|cool)/.test(s)) return 'cool'
  if (/(spring|autumn|fall|transition|mild)/.test(s)) return 'mild'
  return null
}

function materialSignal(item) {
  const s = (item.material || '').toLowerCase()
  if (!s) return null
  if (/(cotton|linen|lightweight|gauze|chiffon|silk)/.test(s)) return 'breathable'
  if (/(wool|knit|denim|fleece|corduroy|leather|tweed)/.test(s)) return 'warm'
  return null
}

export function hueFamily(hex) {
  if (typeof hex !== 'string') return null
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const v = m[1]
  const r = parseInt(v.slice(0, 2), 16) / 255
  const g = parseInt(v.slice(2, 4), 16) / 255
  const b = parseInt(v.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d < 0.08) return l < 0.45 ? 'dark-neutral' : 'light-neutral'
  let h = 0
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h = ((h * 60) + 360) % 360
  if (h < 40 || h >= 330) return 'warm-red'
  if (h < 75) return 'warm-yellow'
  if (h < 165) return 'cool-green'
  if (h < 260) return 'cool-blue'
  return 'cool-purple'
}

/**
 * Color harmony between two items (0..20 scale).
 * - Exact hex match: 20
 * - Monochrome / same hue family: 18
 * - Neutral anchor + accent: 17
 * - Double neutral: 18
 * - Harmonious complementary / analogous: 15
 * - Contrasting / Unknown: 12
 */
export function pairColorHarmony(a, b) {
  const hexA = a?.colorHex || a?.color_hex
  const hexB = b?.colorHex || b?.color_hex
  const fa = hueFamily(hexA)
  const fb = hueFamily(hexB)
  if (!fa || !fb) return 12 // Unknown color is treated with neutral baseline

  if (hexA && hexB && hexA.toLowerCase() === hexB.toLowerCase()) return 20
  if (fa === fb) return 18

  const aNeutral = fa.includes('neutral')
  const bNeutral = fb.includes('neutral')
  if (aNeutral && bNeutral) return 18
  if (aNeutral || bNeutral) return 17

  // Warm vs Cool contrast
  const aWarm = fa.startsWith('warm')
  const bWarm = fb.startsWith('warm')
  if (aWarm === bWarm) return 15
  return 14
}

/**
 * Classifies an item into one or more fashion roles.
 */
export function roleSet(item) {
  const c = String(item?.category || '').trim().toLowerCase()
  const roles = new Set()
  if (c === 'tops' || c === 'shirt') roles.add('top')
  else if (c === 'bottoms') roles.add('bottom')
  else if (c === 'dresses') roles.add('dress')
  else if (c === 'traditional') roles.add('traditional')
  else if (c === 'outerwear') roles.add('outerwear')
  else if (c === 'footwear') roles.add('footwear')
  else if (c === 'accessories') roles.add('accessory')
  return roles
}

/**
 * Evaluates an individual item's suitability for occasion, weather, and preferences.
 */
export function scoreItem(item, { occasion, bucket, weather, preferences, feedbackStats }) {
  const occ = normalizeOccasion(occasion)
  const occStyles = OCCASION_STYLES[occ] || ['casual']
  const styleKey = (item.style || '').trim().toLowerCase()

  // 1. Occasion suitability (0..25)
  let occasionPts = 14 // default when style is unassigned
  if (styleKey) {
    if (occStyles.includes(styleKey)) occasionPts = 25
    else if (styleKey === 'smart-casual') occasionPts = 20
    else if (occ === 'casual' || occ === 'everyday') occasionPts = 18
    else occasionPts = 8
  }

  // 2. Weather suitability (0..15)
  let weatherPts = 0
  if (bucket) {
    // In mild weather (temperate 16-24°C), everyday clothing starts with baseline comfort
    if (bucket === 'mild') {
      weatherPts = 5
    }

    const sleeve = sleeveSignal(item)
    if (sleeve === 'long' && bucket === 'cool') weatherPts += 5
    else if (sleeve === 'short' && bucket === 'warm') weatherPts += 5
    else if (sleeve && bucket === 'mild') weatherPts += 3

    const seas = seasonSignal(item)
    if (seas === bucket) weatherPts += 4
    else if (seas === 'mild') weatherPts += 2

    const mat = materialSignal(item)
    if (mat === 'breathable' && bucket === 'warm') weatherPts += 4
    else if (mat === 'warm' && bucket === 'cool') weatherPts += 4
    else if (mat) weatherPts += 2

    const ws = weatherSuitabilitySignal(item)
    if (ws) {
      if (bucket === 'warm' && (ws.includes('warm') || ws.includes('summer') || ws.includes('hot'))) weatherPts += 2
      if (bucket === 'cool' && (ws.includes('cool') || ws.includes('cold') || ws.includes('winter'))) weatherPts += 2
      if (ws.includes('all-weather') || ws.includes('all weather')) weatherPts += 1
    }

    const { isRainy } = rainSignal(weather)
    if (isRainy) {
      if (item.category === 'outerwear') weatherPts += 3
      if (ws.includes('rain') || ws.includes('waterproof')) weatherPts += 4
    }

    const humidity = typeof weather?.humidity === 'number' ? weather.humidity : 0
    if (humidity >= 70 && mat === 'breathable') {
      weatherPts += 2
    }

    const windSpeed = typeof weather?.windSpeed === 'number' ? weather.windSpeed : 0
    if (windSpeed >= 20 && (item.category === 'outerwear' || sleeve === 'long')) {
      weatherPts += 2
    }

    // Heavy outerwear penalty in warm weather
    if (bucket === 'warm' && item.category === 'outerwear') {
      weatherPts = Math.max(0, weatherPts - 4)
    }

    // Outerwear bonus in cool weather
    if (bucket === 'cool' && item.category === 'outerwear') {
      weatherPts += 3
    }
  } else {
    // If no weather provided, neutral baseline
    weatherPts = 10
  }
  weatherPts = Math.min(15, Math.max(0, weatherPts))

  // 3. User preferences (-6..+15)
  let prefPts = 0
  const stylePref = String(preferences?.style || '').trim().toLowerCase()
  const preferredStyles = Array.isArray(preferences?.preferredStyles)
    ? preferences.preferredStyles.map((s) => String(s).trim().toLowerCase())
    : (stylePref ? [stylePref] : [])

  if (styleKey) {
    if (stylePref && styleKey === stylePref) {
      prefPts += 8
    } else if (preferredStyles.includes(styleKey)) {
      prefPts += 6
    } else if (preferredStyles.length > 0 && occStyles.some((s) => preferredStyles.includes(s))) {
      prefPts += 3
    }
  }

  // Favorite and avoided colors
  const favColors = Array.isArray(preferences?.favoriteColors)
    ? preferences.favoriteColors.map((c) => String(c).trim().toLowerCase())
    : []
  const avoidColors = Array.isArray(preferences?.avoidColors)
    ? preferences.avoidColors.map((c) => String(c).trim().toLowerCase())
    : []

  const itemHex = (item.colorHex || item.color_hex || '').toLowerCase()
  const itemName = (item.color || '').toLowerCase()
  const itemFamily = hueFamily(itemHex)

  if (favColors.length > 0) {
    const isFav = favColors.some((fc) => fc === itemHex || fc === itemName || (itemFamily && hueFamily(fc) === itemFamily))
    if (isFav) prefPts += 4
  }

  if (avoidColors.length > 0) {
    const isAvoid = avoidColors.some((ac) => ac === itemHex || ac === itemName || (itemFamily && hueFamily(ac) === itemFamily))
    if (isAvoid) prefPts -= 5
  }

  // Formality preference match
  const formalityPref = String(preferences?.formality || '').trim().toLowerCase()
  if (formalityPref && styleKey) {
    if (formalityPref === 'formal') {
      if (styleKey === 'formal' || styleKey === 'evening') prefPts += 3
      else if (styleKey === 'sporty') prefPts -= 3
    } else if (formalityPref === 'casual') {
      if (styleKey === 'casual' || styleKey === 'sporty') prefPts += 3
      else if (styleKey === 'formal') prefPts -= 3
    } else if (formalityPref === 'smart-casual') {
      if (styleKey === 'smart-casual') prefPts += 3
    }
  }

  // Comfort preferences
  const comfortRaw = preferences?.comfort
  const comfortList = Array.isArray(comfortRaw)
    ? comfortRaw.map((c) => String(c).trim().toLowerCase())
    : [String(comfortRaw || '').trim().toLowerCase()]

  for (const cPref of comfortList) {
    const comfortStyles = COMFORT_STYLES[cPref]
    if (comfortStyles && styleKey && comfortStyles.includes(styleKey)) {
      prefPts += 4
      break
    }
  }
  prefPts = Math.min(15, Math.max(-6, prefPts))

  // 4. Past Feedback & Wear frequency adjustments (-6..+8)
  let feedbackPts = 0
  if (feedbackStats) {
    // Proportional rating influence (1..5 stars)
    const itemRating = feedbackStats.itemRatings?.get(item.id)
    if (typeof itemRating === 'number') {
      if (itemRating >= 4.5) feedbackPts += 4
      else if (itemRating >= 3.5) feedbackPts += 2
      else if (itemRating <= 1.5) feedbackPts -= 4
      else if (itemRating <= 2.5) feedbackPts -= 2
    } else {
      if (feedbackStats.likedItemIds?.has(item.id)) feedbackPts += 3
      if (feedbackStats.dislikedItemIds?.has(item.id)) feedbackPts -= 4
    }

    if (styleKey) {
      if (feedbackStats.likedStyles?.has(styleKey)) feedbackPts += 2
      if (feedbackStats.dislikedStyles?.has(styleKey)) feedbackPts -= 2
    }
  }

  // Freshness & usage intelligence (from genuine wear events only)
  const worn = typeof item.timesWorn === 'number'
    ? item.timesWorn
    : (typeof item.times_worn === 'number' ? item.times_worn : 0)

  if (worn === 0) {
    feedbackPts += 2 // Freshness bonus for unworn pieces
  } else if (worn <= 2) {
    feedbackPts += 1 // Rotation bonus for rarely worn pieces
  } else if (worn >= 7) {
    feedbackPts -= 1 // Gentle rotation to encourage other pieces
  }

  // Cooldown if worn within the last 24 hours
  const lastWorn = item.lastWornAt || item.last_worn_at
  if (lastWorn) {
    const elapsed = Date.now() - new Date(lastWorn).getTime()
    if (elapsed >= 0 && elapsed < 86_400_000) {
      feedbackPts -= 2 // Cooldown for outfit worn yesterday
    }
  }

  feedbackPts = Math.min(8, Math.max(-6, feedbackPts))

  return {
    itemScore: occasionPts + weatherPts + prefPts + feedbackPts,
    occasionPts,
    weatherPts,
    prefPts,
    feedbackPts,
  }
}

/**
 * Evaluates pattern harmony across a list of items (0..10).
 */
function scorePattern(items) {
  const patterns = items.map((i) => (i.pattern || '').trim().toLowerCase()).filter(Boolean)
  if (patterns.length <= 1) return 10
  const nonSolids = patterns.filter((p) => p !== 'solid')
  if (nonSolids.length === 0) return 10 // Solid + Solid
  if (nonSolids.length === 1) return 9 // One patterned focal piece + solid
  // If multiple patterned items
  const unique = new Set(nonSolids)
  if (unique.size === 1 && (unique.has('textured') || unique.has('check'))) return 7
  return 4 // Clashing prints
}

/**
 * Evaluates overall style consistency across items (0..15).
 */
function scoreStyleHarmony(items) {
  const styles = items.map((i) => (i.style || '').trim().toLowerCase()).filter(Boolean)
  if (styles.length <= 1) return 12
  const unique = new Set(styles)
  if (unique.size === 1) return 15
  if (unique.has('smart-casual') && (unique.has('casual') || unique.has('formal'))) return 13
  if (unique.has('formal') && unique.has('sporty')) return 4
  return 10
}

/**
 * Builds candidate outfits and scores each candidate.
 */
export function recommendOutfits({ wardrobe, occasion, weather, preferences, userLooks, limit = 5 } = {}) {
  const items = Array.isArray(wardrobe) ? wardrobe : []
  if (items.length === 0) {
    return {
      success: false,
      reason: 'Your wardrobe is empty — add garments to start styling.',
      missingCategories: ['tops', 'bottoms', 'dresses'],
      recommendations: [],
    }
  }

  // Pre-process feedback stats from previous looks
  const feedbackStats = {
    likedItemIds: new Set(),
    dislikedItemIds: new Set(),
    likedStyles: new Set(),
    dislikedStyles: new Set(),
    likedPairings: new Set(),
    dislikedPairings: new Set(),
    itemRatings: new Map(),
  }
  if (Array.isArray(userLooks)) {
    for (const l of userLooks) {
      const isLiked = l.feedback === 'like' || (typeof l.rating === 'number' && l.rating >= 4)
      const isDisliked = l.feedback === 'dislike' || (typeof l.rating === 'number' && l.rating <= 2)
      const ids = Array.isArray(l.itemIds) ? l.itemIds : (Array.isArray(l.items) ? l.items.map((i) => i.id) : [])
      for (const id of ids) {
        if (typeof l.rating === 'number') {
          const currentRating = feedbackStats.itemRatings.get(id) ?? l.rating
          feedbackStats.itemRatings.set(id, (currentRating + l.rating) / 2)
        }
        if (isLiked) feedbackStats.likedItemIds.add(id)
        if (isDisliked) feedbackStats.dislikedItemIds.add(id)
      }

      // Track liked / disliked item pairings (synergy)
      if (ids.length > 1) {
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const pairSig = [ids[i], ids[j]].sort().join(':')
            if (isLiked) feedbackStats.likedPairings.add(pairSig)
            if (isDisliked) feedbackStats.dislikedPairings.add(pairSig)
          }
        }
      }

      if (Array.isArray(l.items)) {
        for (const it of l.items) {
          const st = (it?.style || '').trim().toLowerCase()
          if (st) {
            if (isLiked) feedbackStats.likedStyles.add(st)
            if (isDisliked) feedbackStats.dislikedStyles.add(st)
          }
        }
      }
    }
  }

  const bucket = temperatureBucket(weather)
  const scoredItems = items.map((item) => ({
    item,
    ...scoreItem(item, { occasion, bucket, weather, preferences, feedbackStats }),
  }))

  // Group items by fashion role
  const pools = {
    top: [],
    bottom: [],
    dress: [],
    traditional: [],
    outerwear: [],
    footwear: [],
    other: [],
  }

  for (const entry of scoredItems) {
    const roles = roleSet(entry.item)
    for (const r of roles) {
      if (pools[r]) pools[r].push(entry)
    }
    if (roles.size === 0) pools.other.push(entry)
  }

  // Sort each pool by individual suitability score descending, then by id for stability
  for (const key of Object.keys(pools)) {
    pools[key].sort((a, b) => b.itemScore - a.itemScore || (a.item.id < b.item.id ? -1 : 1))
  }

  // Check if complete outfits can be composed
  const hasTop = pools.top.length > 0
  const hasBottom = pools.bottom.length > 0
  const hasDress = pools.dress.length > 0
  const hasTraditional = pools.traditional.length > 0

  const canFormTwoPiece = hasTop && hasBottom
  const canFormDressLook = hasDress
  const canFormTraditional = hasTraditional

  const missing = []
  if (!hasTop && !hasDress && !hasTraditional) missing.push('tops')
  if (!hasBottom && !hasDress && !hasTraditional) missing.push('bottoms')

  // Bounded candidate generation (limit pool depth to avoid combinatorial explosion)
  const maxPoolDepth = 6
  const topCandidates = pools.top.slice(0, maxPoolDepth)
  const bottomCandidates = pools.bottom.slice(0, maxPoolDepth)
  const dressCandidates = pools.dress.slice(0, maxPoolDepth)
  const traditionalCandidates = pools.traditional.slice(0, maxPoolDepth)
  const outerwearCandidates = pools.outerwear.slice(0, 3)
  const footwearCandidates = pools.footwear.slice(0, 3)

  const rawCombos = []

  const { isRainy } = rainSignal(weather)
  const isWindy = typeof weather?.windSpeed === 'number' && weather.windSpeed >= 20

  if (canFormTwoPiece || canFormDressLook || canFormTraditional) {
    // 1. Two-piece combos (top + bottom)
    for (const t of topCandidates) {
      for (const b of bottomCandidates) {
        // Pick best matching optional footwear
        const bestFoot = footwearCandidates[0]
        // Pick best matching optional outerwear if cool weather, rainy, windy, or formal, but avoid in warm
        const wantsOuter = (bucket === 'cool' || isRainy || isWindy || normalizeOccasion(occasion) === 'office') && bucket !== 'warm'
        const bestOuter = wantsOuter ? outerwearCandidates[0] : undefined

        const pieces = [t, b]
        if (bestOuter && bestOuter.item.id !== t.item.id && bestOuter.item.id !== b.item.id) {
          pieces.push(bestOuter)
        }
        if (bestFoot && bestFoot.item.id !== t.item.id && bestFoot.item.id !== b.item.id) {
          pieces.push(bestFoot)
        }
        rawCombos.push(pieces)

        // Also allow clean two-piece without outerwear
        if (bestFoot) {
          rawCombos.push([t, b, bestFoot])
        } else {
          rawCombos.push([t, b])
        }
      }
    }

    // 2. Dress combos
    for (const d of dressCandidates) {
      const bestFoot = footwearCandidates[0]
      const wantsOuter = (bucket === 'cool' || isRainy || normalizeOccasion(occasion) === 'party') && bucket !== 'warm'
      const bestOuter = wantsOuter ? outerwearCandidates[0] : undefined

      const pieces = [d]
      if (bestOuter && bestOuter.item.id !== d.item.id) pieces.push(bestOuter)
      if (bestFoot && bestFoot.item.id !== d.item.id) pieces.push(bestFoot)
      rawCombos.push(pieces)
      if (bestFoot) rawCombos.push([d, bestFoot])
      rawCombos.push([d])
    }

    // 3. Traditional combos
    for (const tr of traditionalCandidates) {
      const bestFoot = footwearCandidates[0]
      const pieces = [tr]
      if (bestFoot && bestFoot.item.id !== tr.item.id) pieces.push(bestFoot)
      rawCombos.push(pieces)
      rawCombos.push([tr])
    }
  } else {
    // Insufficient pieces for a full outfit: produce genuine partial combinations
    // while explicitly annotating missing categories.
    for (const t of topCandidates) {
      if (outerwearCandidates.length > 0) rawCombos.push([t, outerwearCandidates[0]])
      if (footwearCandidates.length > 0) rawCombos.push([t, footwearCandidates[0]])
      rawCombos.push([t])
    }
    for (const b of bottomCandidates) {
      if (outerwearCandidates.length > 0) rawCombos.push([b, outerwearCandidates[0]])
      if (footwearCandidates.length > 0) rawCombos.push([b, footwearCandidates[0]])
      rawCombos.push([b])
    }
    for (const o of outerwearCandidates) rawCombos.push([o])
    for (const f of footwearCandidates) rawCombos.push([f])
  }

  // Deduplicate and score each candidate combination
  const seenSignatures = new Set()
  const scoredCombos = []

  for (const combo of rawCombos) {
    const items = combo.map((e) => e.item)
    const sig = items.map((i) => i.id).sort().join('|')
    if (seenSignatures.has(sig)) continue
    seenSignatures.add(sig)

    const scored = evaluateCombination({
      combo,
      occasion,
      bucket,
      weather,
      preferences,
      feedbackStats,
      userLooks,
      missingCategories: missing,
    })
    scoredCombos.push(scored)
  }

  // Sort by overall score descending, then by id for stability
  scoredCombos.sort((a, b) => b.score - a.score || (a.itemIds[0] < b.itemIds[0] ? -1 : 1))

  const recommendations = scoredCombos.slice(0, Math.max(1, limit))

  return {
    success: true,
    recommendations,
    look: recommendations[0] || null,
    totalCandidates: scoredCombos.length,
    missingCategories: missing.length ? missing : undefined,
    reason: missing.length ? `Wardrobe lacks ${missing.join(' and ')} for a complete outfit.` : undefined,
  }
}

/**
 * Backward-compatible single-outfit recommender.
 */
export function recommendOutfit(params = {}) {
  const res = recommendOutfits(params)
  if (!res.success || !res.look) {
    return { success: false, reason: res.reason || "MAEVE couldn't find a suitable combination." }
  }
  return {
    success: true,
    items: res.look.items,
    score: res.look.score,
    breakdown: res.look.breakdown,
    pieceScores: res.look.pieceScores,
    explanation: res.look.explanation,
  }
}

/**
 * Evaluates an entire outfit combination across all aesthetic and functional dimensions.
 */
function evaluateCombination({ combo, occasion, bucket, weather, preferences, feedbackStats, userLooks, missingCategories = [] }) {
  const items = combo.map((e) => e.item)
  const occ = normalizeOccasion(occasion)

  // 1. Occasion factor (0..25)
  const avgOccasion = combo.reduce((sum, e) => sum + e.occasionPts, 0) / combo.length

  // 2. Structural & Category cohesion (0..15)
  let structurePts = 10
  const hasFoot = items.some((i) => i.category === 'footwear')
  const hasOuter = items.some((i) => i.category === 'outerwear')
  if (hasFoot) structurePts += 3
  if (hasOuter) structurePts += 2
  structurePts = Math.min(structurePts, 15)

  // 3. Color Harmony (0..20)
  let colorHarmony = 14
  if (items.length > 1) {
    let pairSum = 0
    let pairCount = 0
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        pairSum += pairColorHarmony(items[i], items[j])
        pairCount++
      }
    }
    colorHarmony = pairCount > 0 ? pairSum / pairCount : 14
  } else {
    colorHarmony = 18 // Single piece (dress/traditional) holds its own color unity
  }

  // 4. Style & Formality Harmony (0..15)
  const styleHarmony = scoreStyleHarmony(items)

  // 5. Pattern Coordination (0..10)
  const patternHarmony = scorePattern(items)

  // 6. Weather & Seasonal Suitability (0..15)
  let weatherFactor = 10
  if (bucket) {
    const avgWeather = combo.reduce((sum, e) => sum + e.weatherPts, 0) / combo.length
    weatherFactor = avgWeather
  }

  // 7. Preferences & Feedback (0..10)
  const avgPref = combo.reduce((sum, e) => sum + e.prefPts, 0) / combo.length
  const avgFeedback = combo.reduce((sum, e) => sum + e.feedbackPts, 0) / combo.length

  // Pair synergy / clash from past liked / disliked looks
  let pairSynergy = 0
  if (feedbackStats && items.length > 1) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const pairSig = [items[i].id, items[j].id].sort().join(':')
        if (feedbackStats.likedPairings?.has(pairSig)) pairSynergy += 1.5
        if (feedbackStats.dislikedPairings?.has(pairSig)) pairSynergy -= 2.5
      }
    }
  }

  const prefFactor = Math.max(0, Math.min(10, (avgPref / 15) * 8 + (avgFeedback + pairSynergy)))

  // Compute Total Overall Score (0..100)
  // Occasion(25) + Structure(15) + Color(20) + Style(15) + Pattern(10) + Weather(10) + Pref(5)
  const rawTotal = (
    avgOccasion * 1.0 +
    structurePts * 0.9 +
    colorHarmony * 0.9 +
    styleHarmony * 0.8 +
    patternHarmony * 0.7 +
    weatherFactor * 0.7 +
    prefFactor * 0.6
  )
  const score = Math.min(100, Math.max(35, Math.round(rawTotal)))

  const hasExplicitPrefs = Boolean(
    preferences?.style ||
    preferences?.preferredStyles?.length ||
    preferences?.favoriteColors?.length ||
    preferences?.avoidColors?.length ||
    preferences?.formality ||
    preferences?.comfort
  )

  const breakdown = {
    occasion: Math.min(100, Math.round((avgOccasion / 25) * 100)),
    weather: bucket ? Math.min(100, Math.round((weatherFactor / 15) * 100)) : null,
    colour: Math.min(100, Math.round((colorHarmony / 20) * 100)),
    preference: (hasExplicitPrefs || (userLooks && userLooks.length > 0))
      ? Math.min(100, Math.round((prefFactor / 10) * 100))
      : null,
    style: Math.min(100, Math.round((styleHarmony / 15) * 100)),
    pattern: Math.min(100, Math.round((patternHarmony / 10) * 100)),
  }

  const pieceScores = combo.map((e) => ({
    itemId: e.item.id,
    score: Math.min(100, Math.round(30 + e.itemScore * 1.2)),
    occasion: Math.round((e.occasionPts / 25) * 100),
    weather: bucket ? Math.round((e.weatherPts / 15) * 100) : null,
    preference: e.prefPts ? Math.round((Math.max(0, e.prefPts) / 15) * 100) : null,
  }))

  const explanation = buildExplanations({
    items,
    occasion: occ,
    bucket,
    weather,
    preferences,
    feedbackStats,
    colorHarmony,
    styleHarmony,
    patternHarmony,
    missingCategories,
  })

  return {
    items,
    itemIds: items.map((i) => i.id),
    score,
    breakdown,
    pieceScores,
    explanation,
    occasion: occasion || OCCASION_LABELS[occ] || occ,
    missingCategories: missingCategories.length ? missingCategories : undefined,
    isIncomplete: missingCategories.length > 0,
  }
}

/**
 * Builds plain-English, transparent recommendation rationale.
 */
function buildExplanations({ items, occasion, bucket, weather, preferences, feedbackStats, colorHarmony, styleHarmony, patternHarmony, missingCategories = [] }) {
  const lines = []
  const occLabel = OCCASION_LABELS[occasion] || occasion

  // 1. Occasion
  lines.push(`Composed for ${occLabel} — strictly selecting pieces from your saved wardrobe.`)

  // Incomplete / missing roles explanation
  if (missingCategories.length > 0) {
    if (missingCategories.includes('bottoms')) {
      lines.push('Your wardrobe is missing bottoms — trousers, skirts, or jeans are needed for a complete two-piece outfit.')
    } else if (missingCategories.includes('tops')) {
      lines.push('Your wardrobe is missing tops — shirts or blouses are needed for a complete two-piece outfit.')
    } else {
      lines.push(`Wardrobe is currently missing ${missingCategories.join(', ')} to assemble a full ensemble.`)
    }
  }

  // 2. Color harmony
  if (items.length > 1) {
    if (colorHarmony >= 17) {
      lines.push('Coordinated color palette with high harmony and complementary tonal balance.')
    } else if (colorHarmony >= 14) {
      lines.push('Versatile color pairing using grounded neutral tones.')
    }
  }

  // 3. Style & Formality
  if (styleHarmony >= 12) {
    const primaryStyle = items[0]?.style
    if (primaryStyle) {
      lines.push(`Harmonious ${primaryStyle} styling across the pieces creates a cohesive silhouette.`)
    } else {
      lines.push('Consistent level of formality across all selected pieces.')
    }
  }

  // 4. Pattern
  if (patternHarmony >= 9 && items.length > 1) {
    const hasPattern = items.some((i) => i.pattern && i.pattern !== 'solid')
    if (hasPattern) {
      lines.push('Solid foundational pieces balance the patterned focal garment cleanly.')
    } else {
      lines.push('Clean solid textures create a timeless, minimalist aesthetic.')
    }
  }

  // 5. Weather / Layering
  const effectiveTemp = typeof weather?.feelsLike === 'number' && !Number.isNaN(weather.feelsLike)
    ? weather.feelsLike
    : weather?.temperature

  if (typeof effectiveTemp === 'number' && bucket) {
    const roundedTemp = Math.round(weather.temperature ?? effectiveTemp)
    const feelsText = typeof weather?.feelsLike === 'number' && Math.round(weather.feelsLike) !== roundedTemp
      ? ` (feels like ${Math.round(weather.feelsLike)}°)`
      : ''

    if (bucket === 'warm') {
      const hasBreathable = items.some((i) => materialSignal(i) === 'breathable')
      const hasShort = items.some((i) => sleeveSignal(i) === 'short')
      if (hasBreathable) {
        lines.push(`Breathable, lightweight pieces suit the current warm conditions at ${roundedTemp}°C${feelsText}.`)
      } else if (hasShort) {
        lines.push(`Short-sleeved silhouette optimized for warm ${roundedTemp}°C${feelsText} conditions.`)
      } else {
        lines.push(`Warm-weather styling selected for ${roundedTemp}°C${feelsText} conditions.`)
      }
    } else if (bucket === 'cool') {
      const hasWarmMat = items.some((i) => materialSignal(i) === 'warm')
      const hasLong = items.some((i) => sleeveSignal(i) === 'long')
      const hasOuter = items.some((i) => i.category === 'outerwear')
      if (hasOuter) {
        lines.push(`Structured outerwear and insulating layers prioritized for cool ${roundedTemp}°C${feelsText} temperatures.`)
      } else if (hasWarmMat || hasLong) {
        lines.push(`Longer coverage and warm fabric construction suit cooler ${roundedTemp}°C${feelsText} weather.`)
      } else {
        lines.push(`Layering selected for cooler ${roundedTemp}°C${feelsText} weather.`)
      }
    } else {
      lines.push(`Transitional styling calibrated for mild ${roundedTemp}°C${feelsText} conditions.`)
    }

    // Rain signal
    const { isRainy, prob } = rainSignal(weather)
    if (isRainy) {
      const hasRainSuit = items.some((i) => {
        const ws = weatherSuitabilitySignal(i)
        return i.category === 'outerwear' || ws.includes('rain') || ws.includes('waterproof')
      })
      if (hasRainSuit) {
        lines.push(`Weather-resistant layers included in consideration of ${Math.round(prob)}% precipitation forecast.`)
      } else {
        lines.push(`Forecast precipitation (${Math.round(prob)}% chance) considered in the weather-aware ranking.`)
      }
    }

    // Humidity signal
    const humidity = typeof weather?.humidity === 'number' ? weather.humidity : 0
    if (humidity >= 70 && items.some((i) => materialSignal(i) === 'breathable')) {
      lines.push(`Breathable natural fabrics help maintain comfort in high humidity (${Math.round(humidity)}%).`)
    }

    // Wind signal
    const windSpeed = typeof weather?.windSpeed === 'number' ? weather.windSpeed : 0
    if (windSpeed >= 20 && items.some((i) => i.category === 'outerwear' || sleeveSignal(i) === 'long')) {
      lines.push(`Secure layering accommodates brisk wind speeds (${Math.round(windSpeed)} km/h).`)
    }
  } else {
    // Honest fallback explanation when weather is null/unavailable
    lines.push('Live weather data is currently not set; recommendation is prioritized by occasion suitability and garment compatibility.')
  }

  // 6. Outerwear / Footwear presence
  if (items.some((i) => i.category === 'outerwear')) {
    lines.push('Includes structured outerwear for versatile layering.')
  }

  // 7. Personalization & User Preferences (Phase 5)
  if (preferences) {
    if (preferences.preferredStyles?.length > 0) {
      const matchStyle = items.find((i) => i.style && preferences.preferredStyles.includes(i.style.toLowerCase()))
      if (matchStyle) {
        lines.push(`Tailored to your saved preference for ${matchStyle.style} styling.`)
      }
    } else if (preferences.style) {
      const match = items.find((i) => i.style?.toLowerCase() === preferences.style.toLowerCase())
      if (match) {
        lines.push(`Matches your requested ${preferences.style} aesthetic.`)
      }
    }

    if (preferences.favoriteColors?.length > 0) {
      const favMatch = items.find((i) => {
        const hex = (i.colorHex || '').toLowerCase()
        const name = (i.color || '').toLowerCase()
        const fam = hueFamily(hex)
        return preferences.favoriteColors.some((fc) => fc.toLowerCase() === hex || fc.toLowerCase() === name || (fam && hueFamily(fc) === fam))
      })
      if (favMatch) {
        lines.push(`Features your favorite ${favMatch.color || 'color'} palette.`)
      }
    }

    if (preferences.formality) {
      lines.push(`Calibrated to your preferred ${preferences.formality} formality level.`)
    }
  }

  // 8. Saved Look Feedback & Wardrobe Freshness (Phase 5)
  if (feedbackStats) {
    const hasLikedItem = items.some((i) => feedbackStats.likedItemIds?.has(i.id))
    if (hasLikedItem) {
      lines.push('Incorporates pieces you previously loved and rated highly.')
    }
    const hasUnworn = items.some((i) => (i.timesWorn === 0 || i.times_worn === 0))
    if (hasUnworn) {
      lines.push('Includes unworn wardrobe pieces to promote fresh rotation.')
    }
  }

  return lines
}