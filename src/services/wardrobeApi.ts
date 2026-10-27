import type { WardrobeItem } from '../types'
import { apiFetch, getApiToken } from './apiClient'

/**
 * Best-effort mirror of the wardrobe to the backend.
 *
 * `WardrobeProvider` treats the backend as the source of truth when it is
 * reachable (fetch on boot, push on change). localStorage remains an offline
 * cache: when the service is down the app falls back to the local snapshot.
 * All of this is safe either way — a missing backend never breaks saving.
 */

/**
 * Load the signed-in user's wardrobe from the backend.
 * Returns `null` when there is no token or the service is unreachable (the
 * caller then keeps the local cache). Returns `[]` when reachable and empty.
 */
export async function fetchWardrobeFromServer(): Promise<WardrobeItem[] | null> {
  if (!getApiToken()) return null
  try {
    const res = await apiFetch('/wardrobe/items')
    if (!res.ok) return null
    const body = res.body as { items?: WardrobeItem[] }
    return Array.isArray(body.items) ? body.items : []
  } catch {
    return null
  }
}

const itemsToPut = (items: WardrobeItem[]) =>
  items.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    subcategory: i.subcategory ?? null,
    color: i.color,
    colorHex: i.colorHex ?? null,
    secondaryColor: i.secondaryColor ?? null,
    colorConfidence: i.colorConfidence ?? null,
    pattern: i.pattern ?? null,
    style: i.style ?? null,
    material: i.material ?? null,
    sleeve: i.sleeve ?? null,
    length: i.length ?? null,
    season: i.season ?? null,
    confidence: i.confidence,
    needsUserInput: i.needsUserInput ?? (i.confidence !== null && i.confidence < 0.6),
    userCorrected: i.userCorrected === true,
    originalImageUrl: i.originalImageUrl ?? null,
    // imageUrl is the primary display image (tight-cropped thumbnail or isolated).
    // isolatedImageUrl tracks the full-canvas masked image separately.
    isolatedImageUrl: i.isolatedImageUrl ?? (i.imageUrl ?? null),
    imageUrl: i.imageUrl ?? null,
    timesWorn: i.timesWorn ?? 0,
    lastWornAt: null,
    createdAt: i.createdAt ?? Date.now(),
    updatedAt: i.updatedAt ?? Date.now(),
  }))

/** Push the full local snapshot for the signed-in user. Best-effort. */
export async function pushWardrobeToServer(items: WardrobeItem[]): Promise<void> {
  if (!getApiToken() || items.length === 0) return
  try {
    await apiFetch('/wardrobe/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: itemsToPut(items) }),
    })
  } catch {
    /* offline — local state already reflects the change */
  }
}

/** Update one garment's metadata on the server. */
export async function updateRemoteWardrobeItem(item: WardrobeItem): Promise<WardrobeItem | null> {
  if (!getApiToken()) return null
  try {
    const res = await apiFetch(`/wardrobe/items/${encodeURIComponent(item.id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(item),
    })
    if (!res.ok) return null
    const body = res.body as { item?: WardrobeItem }
    return body?.item ?? null
  } catch {
    return null
  }
}

/** Delete one mirrored item server-side. Best-effort. */
export async function deleteRemoteWardrobeItem(itemId: string): Promise<void> {
  if (!getApiToken()) return
  try {
    await apiFetch(`/wardrobe/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' })
  } catch {
    /* offline — local state already reflects the change */
  }
}