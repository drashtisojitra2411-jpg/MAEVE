import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/auth'

/**
 * Rendered while the backend verifies the stored session token. Without this
 * gate the app would flash the sign-in page to every returning user; with it,
 * navigation only continues once identity is actually known.
 */
function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <p className="animate-pulse font-editorial text-2xl uppercase tracking-[0.3em] text-muted">
        MAEVE
      </p>
    </div>
  )
}

export function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <AuthLoading />

  if (status !== 'authenticated') {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

export function PublicOnlyRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <AuthLoading />

  if (status !== 'authenticated') return <Outlet />

  if (location.pathname !== '/register') {
    return <Navigate to="/dashboard" replace />
  }

  // Allow /register to stay put during the post-sign-up success/onboarding stage.
  let pendingOnboarding = false
  try {
    pendingOnboarding = localStorage.getItem('maeve-onboarding-pending') === '1'
  } catch {
    /* storage unavailable */
  }
  if (!pendingOnboarding) return <Navigate to="/dashboard" replace />

  return <Outlet />
}