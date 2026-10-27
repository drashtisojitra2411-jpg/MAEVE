import { cn } from '../../lib/cn'

interface EmblemProps {
  className?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero'
  alt?: string
}

const sizeMap = {
  xs: 'h-6 w-6',
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
  xl: 'h-24 w-24',
  hero: 'h-32 w-32 md:h-40 md:w-40',
}

/**
 * The MAEVE monogram — a single, consistent brand mark used everywhere:
 * a thin editorial ring carrying a serif "M" and a single gold jewel.
 * Drawn as strokes of `--maeve-accent` so it adapts to both themes.
 */
export function Emblem({ className, size = 'md', alt = 'MAEVE emblem' }: EmblemProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label={alt}
      focusable="false"
      className={cn('select-none', sizeMap[size], className)}
      fill="none"
    >
      <circle
        cx="24"
        cy="24"
        r="20.75"
        stroke="var(--maeve-accent)"
        strokeOpacity="0.28"
        strokeWidth="1.1"
      />
      <path
        d="M11 35.5 L15 13 L24 29 L33 13 L37 35.5"
        stroke="var(--maeve-accent)"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 39.5 L37 39.5"
        stroke="var(--maeve-accent)"
        strokeOpacity="0.5"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <circle cx="24" cy="40.8" r="1.6" fill="var(--maeve-accent)" />
    </svg>
  )
}