import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  BackendUnreachableError,
  fetchSession,
  getApiToken,
  loginAccount,
  logoutAccount,
  registerAccount,
  type AuthUser,
} from '../services/apiClient'

export type { AuthUser }

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  user: AuthUser | null
  /** Server-issued session token (null when signed out). */
  token: string | null
  status: AuthStatus
  isAuthenticated: boolean
  /** Set when the backend could not be reached while checking the session. */
  serviceError: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const UNREACHABLE_MESSAGE = 'MAEVE’s service is temporarily unavailable. Please try again.'

function toAuthError(err: unknown): Error {
  if (err instanceof BackendUnreachableError) return new Error(UNREACHABLE_MESSAGE)
  if (err instanceof ApiError) return new Error(err.message)
  return new Error('Something went wrong. Please try again.')
}

/**
 * Identity comes from the backend, never from localStorage or a form submit.
 * On boot we ask `GET /api/auth/session` who the stored token belongs to; a
 * missing/invalid token leaves the user signed out, and an unreachable backend
 * is surfaced as an outage rather than being papered over with a local session.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(() => getApiToken())
  const [status, setStatus] = useState<AuthStatus>(() =>
    getApiToken() ? 'loading' : 'unauthenticated',
  )
  const [serviceError, setServiceError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!getApiToken()) return // initial status is already 'unauthenticated'
    fetchSession()
      .then((next) => {
        if (cancelled) return
        if (next) {
          setUser(next)
          setToken(getApiToken())
          setStatus('authenticated')
        } else {
          setUser(null)
          setToken(null)
          setStatus('unauthenticated')
        }
      })
      .catch(() => {
        if (cancelled) return
        // Cannot verify the session — stay signed out and say so honestly.
        setUser(null)
        setToken(null)
        setStatus('unauthenticated')
        setServiceError(UNREACHABLE_MESSAGE)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    setServiceError(null)
    if (!email.trim() || !password) {
      throw new Error('Please enter your email and password.')
    }
    try {
      const { user: next, token: nextToken } = await loginAccount(email.trim(), password)
      setUser(next)
      setToken(nextToken)
      setStatus('authenticated')
    } catch (err) {
      throw toAuthError(err)
    }
  }, [])

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    setServiceError(null)
    if (!name.trim()) throw new Error('Please tell us your name.')
    if (!email.trim()) throw new Error('Please enter a valid email address.')
    if (password.length < 6) throw new Error('Your password needs at least 6 characters.')
    try {
      const { user: next, token: nextToken } = await registerAccount(name.trim(), email.trim(), password)
      setUser(next)
      setToken(nextToken)
      setStatus('authenticated')
    } catch (err) {
      throw toAuthError(err)
    }
  }, [])

  const signOut = useCallback(async () => {
    await logoutAccount()
    setUser(null)
    setToken(null)
    setStatus('unauthenticated')
    setServiceError(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      token,
      status,
      isAuthenticated: status === 'authenticated',
      serviceError,
      signIn,
      signUp,
      signOut,
    }),
    [user, token, status, serviceError, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
