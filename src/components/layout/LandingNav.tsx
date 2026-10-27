import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useScrollProgress } from '../../hooks/useScrollProgress'
import { cn } from '../../lib/cn'
import { maeveEase } from '../../lib/motion'
import { ThemeToggle } from '../ui/ThemeToggle'

const navLinks = [
  { label: 'Gallery', href: '#gallery' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Wardrobe', href: '#wardrobe' },
  { label: 'Weather', href: '#weather' },
]

export function LandingNav() {
  const scrolled = useScrollProgress(60)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  const isHash = (href: string) => href.startsWith('#')

  const resolveHref = (href: string) => {
    if (isHash(href)) return href
    return href
  }

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-all duration-700',
          scrolled
            ? 'border-b border-line bg-glass backdrop-blur-2xl'
            : 'bg-transparent',
        )}
      >
        <nav
          className="mx-auto flex max-w-[1600px] items-center justify-between px-8 py-5 lg:px-16"
          aria-label="Main navigation"
        >
          {/* MAEVE Wordmark */}
          <Link to="/" className="group flex items-center" aria-label="MAEVE home">
            <span className="font-sans text-[11px] font-medium uppercase tracking-[0.55em] text-ink transition-colors duration-500 group-hover:text-accent">
              MAEVE
            </span>
          </Link>

          {/* Desktop nav links */}
          <ul className="hidden items-center gap-12 lg:flex">
            {navLinks.map((link) => (
              <li key={link.label}>
                <a
                  href={resolveHref(link.href)}
                  onClick={(e) => {
                    if (isHash(link.href)) return
                    if (location.pathname === link.href) {
                      e.preventDefault()
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }
                  }}
                  className="nav-link text-[10px] font-medium uppercase tracking-[0.3em] transition-colors duration-500 hover:text-ink"
                  style={{ color: 'var(--maeve-muted)' }}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          {/* Desktop right controls */}
          <div className="hidden items-center gap-8 lg:flex">
            <ThemeToggle />
            <div className="h-4 w-px bg-line" aria-hidden="true" />
            <Link
              to="/signin"
              className="text-cta text-[10px] font-medium uppercase tracking-[0.3em] transition-colors duration-500 hover:text-ink"
              style={{ color: 'var(--maeve-muted)' }}
            >
              Sign In
            </Link>
            <Link
              to="/signin"
              className="text-cta text-[10px] font-medium uppercase tracking-[0.3em] text-accent transition-colors duration-500"
            >
              Enter MAEVE →
            </Link>
          </div>

          {/* Mobile controls */}
          <div className="flex items-center gap-4 lg:hidden">
            <ThemeToggle className="scale-90" />
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center border border-line text-ink"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <span className="font-sans text-[8px] uppercase tracking-[0.15em]">Menu</span>
            </button>
          </div>
        </nav>
      </header>

      {/* Fullscreen mobile menu — editorial overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-[60] bg-bg/98 backdrop-blur-2xl lg:hidden"
          >
            <div className="flex h-full flex-col px-8 py-6">
              <div className="flex items-center justify-between">
                <span className="font-sans text-[11px] font-medium uppercase tracking-[0.55em] text-ink">
                  MAEVE
                </span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-9 w-9 items-center justify-center border border-line"
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <motion.ul
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.09 } } }}
                className="mt-24 flex flex-col gap-2"
              >
                {navLinks.map((link, i) => (
                  <motion.li
                    key={link.label}
                    variants={{
                      hidden: { opacity: 0, x: -24 },
                      visible: { opacity: 1, x: 0, transition: { ease: maeveEase, duration: 0.7 } },
                    }}
                  >
                    <div className="border-b border-line py-6">
                      <span className="mr-5 font-editorial text-[9px] italic text-accent">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <a
                        href={resolveHref(link.href)}
                        onClick={() => setMobileOpen(false)}
                        className="font-editorial text-4xl text-ink transition-colors hover:text-accent"
                      >
                        {link.label}
                      </a>
                    </div>
                  </motion.li>
                ))}
              </motion.ul>

              <div className="mt-auto flex flex-col gap-4 pb-8">
                <Link
                  to="/signin"
                  onClick={() => setMobileOpen(false)}
                  className="border border-line px-6 py-4 text-center text-[10px] uppercase tracking-[0.3em] text-muted transition-colors hover:border-accent/60 hover:text-ink"
                >
                  Sign In
                </Link>
                <Link
                  to="/signin"
                  onClick={() => setMobileOpen(false)}
                  className="bg-accent px-6 py-4 text-center text-[10px] uppercase tracking-[0.3em] text-espresso transition-opacity hover:opacity-90"
                >
                  Enter MAEVE
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}