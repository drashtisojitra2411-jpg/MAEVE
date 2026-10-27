import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { maeveEase } from '../lib/motion'
import { AuthLayout } from '../components/auth/AuthLayout'
import { Button } from '../components/ui/Button'
import { SectionLabel } from '../components/ui/SectionLabel'

export function SignInPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="w-full max-w-md">
        <SectionLabel>Sign in</SectionLabel>
        <h1 className="mt-4 font-editorial text-4xl text-ink md:text-5xl">
          Welcome back.
        </h1>
        <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--maeve-muted)' }}>
          Your wardrobe has missed you. Sign in to see today&apos;s look.
        </p>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: maeveEase }}
              className="mt-6 border border-oxblood/40 bg-oxblood/10 px-4 py-3 text-sm text-ink"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.25em]" style={{ color: 'var(--maeve-muted)' }}>
              Email address
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="auth-input mt-2"
            />
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.25em]" style={{ color: 'var(--maeve-muted)' }}>
              Password
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="auth-input mt-2"
            />
          </label>

          <Button type="submit" className="w-full" size="lg" arrow disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-10 text-center text-sm" style={{ color: 'var(--maeve-muted)' }}>
          New to MAEVE?{' '}
          <Link
            to="/register"
            className="nav-link text-accent hover:text-accent-strong"
          >
            Create an account
          </Link>
          <span aria-hidden="true" className="ml-1.5 inline-block align-middle">
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </span>
        </p>
      </div>
    </AuthLayout>
  )
}