import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { fadeUp, fadeIn, scaleReveal, clipReveal } from '../../lib/motion'

type Variant = 'fadeUp' | 'fadeIn' | 'scaleReveal' | 'clipReveal'

interface RevealProps {
  children: React.ReactNode
  className?: string
  delay?: number
  variant?: Variant
  /** Extra margin for inView detection */
  margin?: string
  as?: React.ElementType
}

const variants = {
  fadeUp,
  fadeIn,
  scaleReveal,
  clipReveal,
}

export function Reveal({
  children,
  className,
  delay = 0,
  variant = 'fadeUp',
  margin = '-60px',
  as = 'div',
}: RevealProps) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: margin as never })
  const reducedMotion = useReducedMotion()
  const Component = as

  if (reducedMotion) {
    return <Component className={className}>{children}</Component>
  }

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={variants[variant]}
      custom={delay}
      className={className}
    >
      <Component>{children}</Component>
    </motion.div>
  )
}