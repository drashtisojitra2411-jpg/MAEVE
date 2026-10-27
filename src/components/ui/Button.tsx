import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { maeveEase } from '../../lib/motion'

interface ButtonProps {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  href?: string
  to?: string
  onClick?: () => void
  className?: string
  type?: 'button' | 'submit'
  disabled?: boolean
  /** Appends an arrow glyph for CTA affordance */
  arrow?: boolean
}

const variants = {
  primary:
    'bg-accent text-espresso border border-accent hover:bg-accent-strong hover:border-accent-strong',
  secondary:
    'bg-transparent text-ink border border-line-strong hover:border-accent/60 hover:text-accent',
  ghost: 'bg-transparent text-muted border border-transparent hover:text-accent',
}

const sizes = {
  sm: 'px-5 py-2.5 text-[9px] tracking-[0.22em] uppercase gap-2',
  md: 'px-7 py-3 text-[10px] tracking-[0.22em] uppercase gap-2.5',
  lg: 'px-9 py-4 text-[11px] tracking-[0.24em] uppercase gap-3',
}

const useContainer = 'inline-flex items-center justify-center rounded-full'

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  href,
  to,
  onClick,
  className,
  type = 'button',
  disabled,
  arrow = false,
}: ButtonProps) {
  const classes = cn(
    useContainer,
    variants[variant],
    sizes[size],
    'group relative overflow-hidden font-sans font-medium transition-all duration-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-45',
    className,
  )

  const motionProps = {
    whileHover: { y: -1 },
    whileTap: { y: 0 },
    transition: { duration: 0.4, ease: maeveEase },
  }

  const inner = (
    <>
      <span className="relative z-10">{children}</span>
      {arrow && (
        <ArrowUpRight
          className="relative z-10 h-3.5 w-3.5 transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      )}
      {/* Animated champagne bloom */}
      <span className="pointer-events-none absolute inset-0 -z-0 translate-y-full bg-accent-soft transition-transform duration-700 ease-out group-hover:translate-y-0" />
    </>
  )

  if (to) {
    if (to.startsWith('#')) {
      return (
        <motion.a href={to} className={classes} {...motionProps}>
          {inner}
        </motion.a>
      )
    }
    return (
      <motion.div {...motionProps} className="inline-block">
        <Link to={to} className={classes}>
          {inner}
        </Link>
      </motion.div>
    )
  }

  if (href) {
    return (
      <motion.a href={href} className={classes} {...motionProps}>
        {inner}
      </motion.a>
    )
  }

  return (
    <motion.button type={type} onClick={onClick} disabled={disabled} className={classes} {...motionProps}>
      {inner}
    </motion.button>
  )
}