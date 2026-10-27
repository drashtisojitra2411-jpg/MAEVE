import type { LookRecord } from '../types'
import { uid } from '../lib/uid'

/**
 * Real look history — only what the user actually generated is recorded.
 * A new account starts with an empty history.
 */

const KEY_PREFIX = 'maeve-looks:'

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

export function readLookHistory(userId: string): LookRecord[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return (parsed as LookRecord[]).sort((a, b) => b.createdAt - a.createdAt)
    }
    return []
  } catch {
    return []
  }
}

export function recordLook(
  userId: string,
  record: Omit<LookRecord, 'id' | 'userId' | 'createdAt'>,
): LookRecord {
  const entry: LookRecord = {
    ...record,
    id: uid(),
    userId,
    createdAt: Date.now(),
  }
  const history = readLookHistory(userId)
  history.unshift(entry)
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(history.slice(0, 200)))
  } catch {
    /* storage unavailable */
  }
  return entry
}

export function clearLookHistory(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId))
  } catch {
    /* noop */
  }
}