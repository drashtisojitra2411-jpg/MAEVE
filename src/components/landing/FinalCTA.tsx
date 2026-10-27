import { motion } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { Reveal } from '../ui/Reveal'

export function FinalCTA() {
  const reducedMotion = useReducedMotion()

  return (
    <section className="relative flex min-h-[90svh] flex-col justify-center overflow-hidden border-t border-line bg-bg py-20 lg:py-28">
      {/* Champagne bloom ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-1/4 top-0 h-[80%] w-[70%] bg-[radial-gradient(ellipse_at_left,rgba(181,138,74,0.12),transparent_65%)]" />
        <div className="absolute -right-1/4 bottom-0 h-[60%] w-[60%] bg-[radial-gradient(ellipse_at_right,rgba(74,17,26,0.18),transparent_65%)]" />
        <div className="light-leak absolute inset-0" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col justify-center px-6 lg:px-16">
        {/* Eyebrow Label */}
        <Reveal>
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-accent/60" aria-hidden="true" />
            <p className="text-[10px] font-medium uppercase tracking-[0.45em] text-accent">
              Are you ready?
            </p>
          </div>
        </Reveal>

        {/* Brand Display Wordmark — fluid clamp without clipping */}
        <div className="mt-8 overflow-hidden">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2
              className="font-display font-light leading-[0.88] tracking-tight text-ink"
              style={{ fontSize: 'clamp(4.5rem, 14vw, 13rem)' }}
            >
              MAEVE
            </h2>
          </motion.div>
        </div>

        {/* Narrative & Action Block */}
        <div className="mt-8 grid grid-cols-1 items-end gap-10 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Reveal delay={0.1}>
              <p className="font-display text-2xl font-light italic text-muted sm:text-3xl md:text-4xl">
                Your next look is already in your wardrobe.
              </p>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
                Photograph your clothes once. Wake up to personalized styling tuned to your day,
                your taste, and the live sky outside.
              </p>
            </Reveal>
            <Reveal delay={0.3}>
              <div className="mt-8 flex flex-wrap items-center gap-6">
                <Link
                  to="/signin"
                  className="group flex items-center gap-3 border border-ink bg-ink px-8 py-4 text-[10px] font-medium uppercase tracking-[0.3em] text-ivory transition-all hover:border-accent hover:bg-accent hover:text-espresso"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Enter the Studio</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </Link>
                <span className="text-[10px] uppercase tracking-[0.25em] text-muted">
                  Private Archive · Zero Catalogues · Free Access
                </span>
              </div>
            </Reveal>
          </div>

          <div className="hidden lg:col-span-4 lg:flex lg:flex-col lg:items-end lg:text-right">
            <span className="text-[9px] uppercase tracking-[0.3em] text-accent font-semibold">
              Private AI Styling Studio
            </span>
            <span className="mt-1 font-editorial text-xs italic text-muted">
              Designed for elevated wardrobe longevity
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}