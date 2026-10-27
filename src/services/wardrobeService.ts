import type { WardrobeItem } from '../types'

/**
 * Wardrobe persistence for a single user.
 *
 * Data is keyed by the user's stable id so one account can never see
 * another's pieces. There is deliberately no fallback/seed data anywhere in
 * this module — a new user's wardrobe is simply empty.
 */

const KEY_PREFIX = 'maeve-wardrobe:'

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

export function readWardrobe(userId: string): WardrobeItem[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as WardrobeItem[]
    return []
  } catch {
    return []
  }
}

export function writeWardrobe(userId: string, items: WardrobeItem[]): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(items))
  } catch {
    /* storage unavailable — caller surfaces an error state */
  }
}

export function addToWardrobe(userId: string, items: WardrobeItem[]): WardrobeItem[] {
  const current = readWardrobe(userId)
  const map = new Map(current.map((item) => [item.id, item]))
  for (const item of items) {
    map.set(item.id, item)
  }
  const next = Array.from(map.values())
  writeWardrobe(userId, next)
  return next
}

export function updateInWardrobe(userId: string, item: WardrobeItem): WardrobeItem[] {
  const current = readWardrobe(userId)
  const next = current.map((i) => (i.id === item.id ? item : i))
  writeWardrobe(userId, next)
  return next
}

export function removeFromWardrobe(userId: string, itemId: string): WardrobeItem[] {
  const next = readWardrobe(userId).filter((item) => item.id !== itemId)
  writeWardrobe(userId, next)
  return next
}

/**
 * Potential duplicate of a newly analysed garment, if one already exists in
 * this user's wardrobe.
 *
 * This intentionally returns `null` today: duplicate detection is only shown
 * after a REAL extraction + similarity comparison against the current user's
 * wardrobe. Until a CV backend runs that comparison, MAEVE never suggests
 * duplicates.
 */
export function findPotentialDuplicate(
  _item: WardrobeItem,
  _wardrobe: WardrobeItem[],
): WardrobeItem | null {
  return null
}