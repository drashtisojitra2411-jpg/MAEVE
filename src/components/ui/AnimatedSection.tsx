import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { fadeUp } from '../../lib/motion'

interface AnimatedSectionProps {
  children: React.ReactNode
  className?: string
  delay?: number
}

export function AnimatedSection({ children, className, delay = 0 }: AnimatedSectionProps) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const reducedMotion = useReducedMotion()

  if (reducedMotion) {
    return <section className={className}>{children}</section>
  }

  return (
    <motion.section
      ref={ref}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={fadeUp}
      custom={delay}
      className={className}
    >
      {children}
    </motion.section>
  )
}
