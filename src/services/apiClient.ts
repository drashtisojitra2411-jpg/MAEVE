/**
 * Thin HTTP client for MAEVE's backend, plus the session token.
 *
 * The token is issued by the backend on register/login and stored in
 * localStorage; it is sent as `Authorization: Bearer <token>` on API calls and
 * embedded as `?token=` in image URLs so `<img>` can load them. Identity is
 * never asserted by the client — `fetchSession` asks the server who the token
 * actually belongs to, and the server is the only authority on that.
 */

const TOKEN_KEY = 'maeve-session-token'

let token: string | null = null

export interface AuthUser {
  id: string
  name: string
  email: string
}

export function setApiToken(next: string | null): void {
  token = next
  try {
    if (next) localStorage.setItem(TOKEN_KEY, next)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable */
  }
}

export function getApiToken(): string | null {
  if (token === null) {
    try {
      token = localStorage.getItem(TOKEN_KEY)
    } catch {
      token = null
    }
  }
  return token
}

export class BackendUnreachableError extends Error {
  constructor(message = 'The MAEVE service could not be reached.') {
    super(message)
    this.name = 'BackendUnreachableError'
  }
}

/** A non-2xx response from a reachable backend, carrying the server message. */
export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

interface ApiResult {
  ok: boolean
  status: number
  body: unknown
}

const API_BASE = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '')

/** fetch against the API with the session token attached. */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult> {
  const headers = new Headers(init.headers)
  const bearer = getApiToken()
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`)
  let response: Response
  const targetUrl = API_BASE ? `${API_BASE}/api${path}` : `/api${path}`
  try {
    response = await fetch(targetUrl, { ...init, headers })
  } catch {
    throw new BackendUnreachableError()
  }
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    /* non-JSON response body */
  }
  return { ok: response.ok, status: response.status, body }
}

function readSession(res: ApiResult): { user: AuthUser; token: string } {
  if (res.ok) {
    const body = res.body as { user?: AuthUser; token?: string } | null
    if (body?.user && typeof body.token === 'string' && body.token) {
      setApiToken(body.token)
      return { user: body.user, token: body.token }
    }
    throw new ApiError('The server returned an unexpected response.', res.status)
  }
  const body = res.body as { message?: string; code?: string } | null
  throw new ApiError(
    body?.message ?? 'Something went wrong. Please try again.',
    res.status,
    body?.code,
  )
}

/** Create a real account (server hashes the password and opens a session). */
export async function registerAccount(
  name: string,
  email: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> {
  const res = await apiFetch('/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  })
  return readSession(res)
}

/** Sign in with an existing account. Rejects unknown emails / wrong passwords. */
export async function loginAccount(
  email: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return readSession(res)
}

/**
 * Ask the server who the stored token belongs to. Returns null when the token
 * is missing/expired/revoked (401). Throws BackendUnreachableError when the
 * backend cannot be reached at all — callers must not treat that as "logged in".
 */
export async function fetchSession(): Promise<AuthUser | null> {
  if (!getApiToken()) return null
  const res = await apiFetch('/auth/session')
  if (res.status === 401) {
    setApiToken(null)
    return null
  }
  if (!res.ok) {
    const body = res.body as { message?: string } | null
    throw new ApiError(body?.message ?? 'Unable to verify your session.', res.status)
  }
  const body = res.body as { user?: AuthUser } | null
  if (!body?.user) throw new ApiError('The server returned an unexpected response.', res.status)
  return body.user
}

/** Invalidate the session server-side (best-effort) and forget the token. */
export async function logoutAccount(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' })
  } catch {
    /* network failure — the local token is cleared regardless */
  }
  setApiToken(null)
}

/** True when the backend answered its health endpoint with a live model. */
export async function isBackendReachable(): Promise<boolean> {
  try {
    const res = await apiFetch('/health')
    if (!res.ok) return false
    const body = res.body as { cv?: { available?: boolean } }
    return body?.cv?.available === true
  } catch {
    return false
  }
}
