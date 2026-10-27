import { getApiToken } from '../services/apiClient'

const API_BASE = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '')

/**
 * Ensures an image URL pointing to an isolated/thumbnail asset on the backend
 * (/api/files/...) is stamped with the caller's active session token.
 */
export function resolveAssetUrl(url?: string | null): string | undefined {
  if (!url || typeof url !== 'string') return undefined
  if (!url.startsWith('/api/files/')) return url
  const clean = url.split('?')[0]
  let existingToken: string | null = null
  if (url.includes('token=')) {
    try {
      const qIdx = url.indexOf('?')
      if (qIdx !== -1) {
        existingToken = new URLSearchParams(url.slice(qIdx)).get('token')
      }
    } catch {
      /* ignore */
    }
  }
  const token = getApiToken() || existingToken
  const prefix = API_BASE ? `${API_BASE}${clean}` : clean
  return token ? `${prefix}?token=${encodeURIComponent(token)}` : prefix
}
