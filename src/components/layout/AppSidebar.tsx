import { motion } from 'framer-motion'
import { BarChart3, Clock, LayoutDashboard, LogOut, Plus, Shirt, Sparkles, User, X } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { useAuth } from '../../lib/auth'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/wardrobe', label: 'Wardrobe', icon: Shirt },
  { to: '/add', label: 'Add to Wardrobe', icon: Plus },
  { to: '/stylist', label: 'Stylist', icon: Sparkles },
  { to: '/history', label: 'History', icon: Clock },
  { to: '/analytics', label: 'Insights', icon: BarChart3 },
  { to: '/profile', label: 'Profile', icon: User },
]

export function AppSidebar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = () => {
    void signOut()
    window.setTimeout(() => navigate('/', { replace: true }), 0)
  }

  return (
    <>
      {/* ── Desktop Sidebar ─────────────────────────────────────── */}
      <aside className="relative hidden w-52 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        {/* Thin gold vertical accent on right edge */}
        <div className="hairline-gold-v absolute inset-y-0 right-0 w-px" aria-hidden="true" />

        {/* MAEVE wordmark */}
        <div className="px-7 pb-4 pt-8">
          <span className="font-display text-2xl font-light text-ink">MAEVE</span>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-px flex-1 bg-line" />
            <span className="text-[8px] uppercase tracking-[0.35em] text-muted/50">
              Studio
            </span>
          </div>
        </div>

        {/* Navigation — pure text, no icons */}
        <nav className="flex-1 px-4 pt-4" aria-label="App navigation">
          <ul className="space-y-0.5">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center gap-0 py-2.5 pl-5 pr-3 text-[10px] uppercase tracking-[0.25em] transition-colors duration-500',
                      isActive
                        ? 'text-ink'
                        : 'text-muted hover:text-ink/80',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <>
                          <motion.div
                            layoutId="sidebar-active"
                            className="absolute inset-0 bg-accent-soft"
                            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                          />
                          <motion.div
                            layoutId="sidebar-active-bar"
                            className="absolute left-0 inset-y-0 w-0.5 bg-accent"
                            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                          />
                        </>
                      )}
                      <span className="relative z-10">{item.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Bottom: user + sign out */}
        <div className="border-t border-line px-7 py-6">
          <div className="mb-4">
            <p className="truncate font-display text-lg font-light text-ink">
              {user?.name ?? 'Your wardrobe'}
            </p>
            {user?.email && (
              <p className="mt-0.5 truncate text-[10px] text-muted/60">{user.email}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-2 text-[9px] uppercase tracking-[0.28em] text-muted/60 transition-colors hover:text-ink"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Mobile hamburger trigger (rendered in AppHeader via onMenuOpen) ── */}
      {/* Mobile drawer is controlled from AppShell which passes onMenuOpen to AppHeader */}
    </>
  )
}

/** Mobile drawer — called directly from AppShell to avoid prop drilling */
export function AppMobileDrawer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = () => {
    void signOut()
    window.setTimeout(() => navigate('/', { replace: true }), 0)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-bg/90 backdrop-blur-xl" onClick={onClose} />

      {/* Drawer */}
      <motion.aside
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-y-0 left-0 flex w-72 flex-col bg-surface"
      >
        <div className="flex items-center justify-between px-7 py-6">
          <span className="font-display text-2xl font-light text-ink">MAEVE</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center border border-line"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 px-4" aria-label="App navigation">
          <ul className="space-y-0.5">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-4 px-3 py-4 text-sm transition-colors',
                      isActive ? 'border-l-2 border-accent pl-4 text-ink' : 'text-muted hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={cn('h-4 w-4 shrink-0', isActive ? 'text-accent' : 'text-muted')}
                        strokeWidth={1.5}
                      />
                      <span className="text-[10px] uppercase tracking-[0.2em]">{item.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-line px-7 py-6">
          <p className="truncate font-display text-lg font-light text-ink">
            {user?.name ?? 'Your wardrobe'}
          </p>
          {user?.email && (
            <p className="mt-0.5 truncate text-[10px] text-muted/60">{user.email}</p>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-4 flex items-center gap-2 text-[9px] uppercase tracking-[0.28em] text-muted transition-colors hover:text-ink"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
            Sign out
          </button>
        </div>
      </motion.aside>
    </div>
  )
}