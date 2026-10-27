import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Emblem } from '../ui/Emblem'
import { ThemeToggle } from '../ui/ThemeToggle'

interface AuthLayoutProps {
  children: ReactNode
}

/**
 * Minimal, centered auth layout — no split screen, no editorial photography.
 * Feels like entering a private luxury studio.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen flex-col bg-bg">
      {/* Atmospheric light leak */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% -10%, var(--maeve-leak), transparent 70%)',
        }}
      />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6 lg:px-12">
        <Link to="/" className="flex items-center gap-3 group" aria-label="MAEVE home">
          <Emblem size="sm" className="opacity-90" />
          <span
            className="text-[11px] uppercase tracking-[0.5em] transition-colors duration-500 group-hover:text-accent"
            style={{ color: 'var(--maeve-subdued)' }}
          >
            MAEVE
          </span>
        </Link>
        <ThemeToggle />
      </header>

      {/* Centre content */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">

          {/* Thin gold accent line above */}
          <div className="mb-10 h-px w-12 bg-gradient-to-r from-accent to-accent-strong opacity-70" aria-hidden="true" />

          {children}

          {/* Bottom note */}
          <p
            className="mt-16 text-center text-[9px] uppercase tracking-[0.28em]"
            style={{ color: 'var(--maeve-subdued)' }}
          >
            Private · Secure · Yours
          </p>
        </div>
      </main>
    </div>
  )
}