import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Check, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { maeveEase } from '../lib/motion'
import { AuthLayout } from '../components/auth/AuthLayout'
import { Button } from '../components/ui/Button'
import { SectionLabel } from '../components/ui/SectionLabel'

type Stage = 'form' | 'success'

const onboardingChoices = [
  { id: 'ethnic', label: 'Ethnic & elegant' },
  { id: 'casual', label: 'Casual & comfortable' },
  { id: 'formal', label: 'Polished & formal' },
  { id: 'experimental', label: 'Bold & experimental' },
]

export function RegisterPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState<Stage>('form')
  const [selected, setSelected] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Your passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await signUp(name, email, password)
      try {
        localStorage.setItem('maeve-onboarding-pending', '1')
      } catch {
        /* storage unavailable */
      }
      setStage('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create your account.')
    } finally {
      setLoading(false)
    }
  }

  const finishOnboarding = () => {
    try {
      localStorage.removeItem('maeve-onboarding-pending')
    } catch {
      /* storage unavailable */
    }
    navigate('/dashboard', { replace: true })
  }

  return (
    <AuthLayout>
      <div className="w-full max-w-md">
        {stage === 'form' ? (
          <>
            <SectionLabel>Create an account</SectionLabel>
            <h1 className="mt-4 font-editorial text-4xl text-ink md:text-5xl">
              Begin your wardrobe archive.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Photograph your clothes once, and let MAEVE learn the rest.
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
                  Full name
                </span>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className="auth-input mt-2"
                />
              </label>

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

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.25em]" style={{ color: 'var(--maeve-muted)' }}>
                    Password
                  </span>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="auth-input mt-2"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.25em]" style={{ color: 'var(--maeve-muted)' }}>
                    Confirm password
                  </span>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="auth-input mt-2"
                  />
                </label>
              </div>

              <Button type="submit" className="w-full" size="lg" arrow disabled={loading}>
                {loading ? 'Creating my account…' : 'Create my account'}
              </Button>
            </form>

            <p className="mt-10 text-center text-sm text-muted">
              Already have an account?{' '}
              <Link to="/signin" className="nav-link text-accent hover:text-accent-strong">
                Sign in
              </Link>
              <span aria-hidden="true" className="ml-1.5 inline-block align-middle">
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              </span>
            </p>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: maeveEase }}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-espresso">
              <Check className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <h1 className="mt-6 font-editorial text-4xl text-ink md:text-5xl">
              Welcome, {name.split(' ')[0]}.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Your wardrobe is ready to be built. One quick preference, and MAEVE
              will style you even better.
            </p>

            <p className="mt-8 text-[10px] uppercase tracking-[0.25em] text-muted">
              How would you describe your style?
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {onboardingChoices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => setSelected(choice.id)}
                  className={`flex items-center gap-3 rounded-full border px-5 py-3 text-left text-[11px] uppercase tracking-[0.15em] transition-all duration-500 ${
                    selected === choice.id
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line-strong text-muted hover:border-accent/50 hover:text-ink'
                  }`}
                >
                  {choice.label}
                </button>
              ))}
            </div>

            <Button
              className="mt-10 w-full"
              size="lg"
              arrow
              onClick={finishOnboarding}
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              Enter MAEVE
            </Button>
          </motion.div>
        )}
      </div>
    </AuthLayout>
  )
}