import type { GeneratedLook, LookPreferences, WeatherSnapshot } from '../types'
import { apiFetch } from './apiClient'

/**
 * Backend look + profile APIs.
 *
 * Looks are computed by the server's rule-based `recommendOutfit` against the
 * caller's own wardrobe. `generate` persists exactly one history record per
 * call; `recommend` computes without persisting (used by the dashboard's
 * "today"). All calls throw BackendUnreachableError when the service is down,
 * so callers can fall back to honest offline behavior.
 */

export interface LookRequest {
  occasion: string
  preferences?: LookPreferences
  weather?: WeatherSnapshot | null
}

export interface GenerateResult {
  /** The composed look, or null when the engine honestly found no fit. */
  look: GeneratedLook | null
  recommendations?: GeneratedLook[]
  missingCategories?: string[]
  reason?: string
}

async function runLook(path: '/looks/recommend' | '/looks/generate', request: LookRequest & { limit?: number }): Promise<GenerateResult> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      occasion: request.occasion,
      preferences: request.preferences ?? {},
      weather: request.weather ?? null,
      limit: request.limit,
    }),
  })
  const body = (res.body ?? {}) as {
    look?: GeneratedLook | null
    recommendations?: GeneratedLook[]
    missingCategories?: string[]
    reason?: string
  }
  return {
    look: body.look ?? null,
    recommendations: body.recommendations ?? (body.look ? [body.look] : []),
    missingCategories: body.missingCategories,
    reason: body.reason,
  }
}

export function recommendLook(request: LookRequest): Promise<GenerateResult> {
  return runLook('/looks/recommend', request)
}

export function recommendLooks(request: LookRequest & { limit?: number }): Promise<GenerateResult> {
  return runLook('/looks/recommend', request)
}

export function generateLook(request: LookRequest): Promise<GenerateResult> {
  return runLook('/looks/generate', request)
}

export async function saveLook(look: Partial<GeneratedLook>): Promise<GeneratedLook> {
  const res = await apiFetch('/looks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: look.id,
      occasion: look.occasion,
      itemIds: look.itemIds ?? look.items?.map((i) => i.id) ?? [],
      explanation: look.explanation ?? [],
      score: look.score ?? null,
      breakdown: look.breakdown ?? {},
      pieceScores: look.pieceScores ?? [],
      weather: look.weather ?? {},
      preferences: look.preferences ?? {},
    }),
  })
  if (!res.ok) throw new Error('Failed to save look.')
  const body = res.body as { look: GeneratedLook }
  return body.look
}

export async function updateLookFeedback(
  lookId: string,
  feedback: { feedback?: 'like' | 'dislike' | null; rating?: number | null },
): Promise<GeneratedLook> {
  const res = await apiFetch(`/looks/${encodeURIComponent(lookId)}/feedback`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(feedback),
  })
  if (!res.ok) throw new Error('Failed to update feedback.')
  const body = res.body as { look: GeneratedLook }
  return body.look
}

export async function listLooks(): Promise<GeneratedLook[]> {
  const res = await apiFetch('/looks')
  if (!res.ok) throw new Error('Unable to load look history.')
  const body = res.body as { looks?: GeneratedLook[] }
  return Array.isArray(body.looks) ? body.looks : []
}

export async function deleteLook(lookId: string): Promise<void> {
  await apiFetch(`/looks/${encodeURIComponent(lookId)}`, { method: 'DELETE' })
}

export async function getProfile(): Promise<import('../types').ProfileSettings | null> {
  const res = await apiFetch('/profile')
  if (!res.ok) return null
  const body = res.body as { profile?: import('../types').ProfileSettings }
  return body.profile ?? null
}

export async function putProfile(
  patch: Partial<import('../types').ProfileSettings>,
): Promise<import('../types').ProfileSettings | null> {
  const res = await apiFetch('/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) return null
  const body = res.body as { profile?: import('../types').ProfileSettings }
  return body.profile ?? null
}

export async function recordWardrobeWear(
  itemIds: string[],
  lookId?: string,
): Promise<import('../types').WearEventResult> {
  const res = await apiFetch('/wardrobe/wear', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ itemIds, lookId }),
  })
  if (!res.ok) throw new Error('Failed to record wardrobe wear.')
  return res.body as import('../types').WearEventResult
}

export async function markLookAsWorn(lookId: string): Promise<import('../types').WearEventResult> {
  const res = await apiFetch(`/looks/${encodeURIComponent(lookId)}/wear`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to mark look as worn.')
  return res.body as import('../types').WearEventResult
}