import { AnimatePresence, motion } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { maeveEase } from '../../lib/motion'
import { Emblem } from '../ui/Emblem'

interface PageLoaderProps {
  /** When true the full-screen loader is on screen. */
  visible: boolean
  label?: string
}

/**
 * Full-screen route loader: porcelain background → official emblem reveal →
 * thin champagne progress line. Used for the global page-load moment.
 */
export function PageLoader({ visible, label = 'Preparing your studio' }: PageLoaderProps) {
  const reducedMotion = useReducedMotion()

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0.01 : 0.35, ease: maeveEase }}
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-bg"
          role="status"
          aria-live="assertive"
        >
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: maeveEase }}
            className="flex flex-col items-center gap-6"
          >
            <Emblem size="md" className="opacity-90" />
          </motion.div>
          <motion.p
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05, ease: maeveEase }}
            className="mt-6 text-[9px] uppercase tracking-[0.35em] text-muted"
          >
            MAEVE
          </motion.p>
          <motion.p
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.12, ease: maeveEase }}
            className="mt-2 text-[10px] uppercase tracking-[0.3em] text-accent"
          >
            {label}
          </motion.p>
          <div
            className="loading-line mt-10"
            style={{ width: '9rem' }}
            aria-hidden="true"
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}