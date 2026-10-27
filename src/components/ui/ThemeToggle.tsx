import { motion } from 'framer-motion'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../lib/theme'
import { cn } from '../../lib/cn'

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={cn(
        'group relative flex h-8 w-14 items-center rounded-full border border-line bg-surface transition-colors duration-500',
        className,
      )}
    >
      <Sun
        aria-hidden="true"
        className={cn(
          'absolute left-[7px] h-3 w-3 transition-opacity duration-500',
          isDark ? 'text-muted opacity-60' : 'text-accent opacity-80',
        )}
        strokeWidth={1.5}
      />
      <Moon
        aria-hidden="true"
        className={cn(
          'absolute right-[7px] h-3 w-3 transition-opacity duration-500',
          isDark ? 'text-accent opacity-80' : 'text-muted opacity-60',
        )}
        strokeWidth={1.5}
      />
      <motion.span
        initial={false}
        animate={{ x: isDark ? 24 : 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="absolute left-[3px] top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-accent shadow-sm"
      />
    </button>
  )
}