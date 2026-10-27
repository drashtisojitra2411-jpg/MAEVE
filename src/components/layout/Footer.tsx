import { Link } from 'react-router-dom'

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-line bg-ink" style={{ color: 'var(--color-ivory)' }}>
      <div className="mx-auto max-w-[1600px] px-8 py-14 lg:px-16">
        {/* Gold hairline */}
        <div className="mb-12 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

        <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
          {/* Wordmark */}
          <div className="md:col-span-4">
            <span className="font-display text-3xl font-light" style={{ color: 'var(--color-ivory)' }}>MAEVE</span>
            <p className="mt-3 text-[10px] uppercase tracking-[0.3em]" style={{ color: 'rgba(244,239,231,0.55)' }}>
              Your wardrobe. Intelligently styled.
            </p>
          </div>

          {/* Links */}
          <nav
            className="flex flex-wrap gap-x-10 gap-y-4 md:col-span-4 md:items-start md:justify-center md:pt-1"
            aria-label="Footer navigation"
          >
            {[
              ['Privacy', '/'] as const,
              ['Terms', '/'] as const,
              ['Sign In', '/signin'] as const,
              ['Register', '/register'] as const,
            ].map(([label, href]) => (
              <Link
                key={label}
                to={href}
                className="nav-link text-[9px] uppercase tracking-[0.3em] transition-colors"
                style={{ color: 'rgba(244,239,231,0.55)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(244,239,231,0.9)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(244,239,231,0.55)' }}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Copyright */}
          <div className="flex flex-col gap-2 md:col-span-4 md:items-end md:text-right">
            <span className="text-[9px] uppercase tracking-[0.3em]" style={{ color: 'rgba(244,239,231,0.45)' }}>
              Private Styling Studio
            </span>
            <span className="text-[9px] uppercase tracking-[0.25em]" style={{ color: 'rgba(244,239,231,0.35)' }}>
              © {year} MAEVE
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}