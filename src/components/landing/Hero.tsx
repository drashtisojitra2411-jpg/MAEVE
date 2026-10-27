import { motion, type Variants } from 'framer-motion'
import { Sparkles, ArrowRight, ShieldCheck, CloudSun, Eye } from 'lucide-react'
import { Link } from 'react-router-dom'
import { modelHero } from '../../data/images'
import { useReducedMotion } from '../../hooks/useReducedMotion'

const fadeIn: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1], delay },
  }),
}

export function Hero() {
  const reducedMotion = useReducedMotion()
  const animate = !reducedMotion

  return (
    <section
      id="hero"
      className="relative flex min-h-[100svh] flex-col justify-center overflow-hidden bg-bg pt-20 pb-12 lg:pt-24 lg:pb-16"
      aria-label="MAEVE — Your wardrobe. Intelligently styled."
    >
      {/* Subtle atmospheric ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-20 top-20 h-96 w-96 rounded-full bg-accent/[0.04] blur-3xl" />
        <div className="absolute right-0 bottom-10 h-80 w-80 rounded-full bg-champagne/[0.06] blur-3xl" />
        <div className="light-leak pointer-events-none absolute inset-0" />
      </div>

      {/* Decorative backdrop editorial letter */}
      <span
        className="editorial-number pointer-events-none absolute -right-6 top-10 select-none leading-none opacity-25"
        style={{ fontSize: 'clamp(12rem, 30vw, 36rem)' }}
        aria-hidden="true"
      >
        M
      </span>

      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col justify-center px-6 lg:px-16">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-14">

          {/* ── LEFT: Typography and Action Column (lg:col-span-6) ────── */}
          <div className="relative z-10 flex flex-col justify-center lg:col-span-6">
            {/* Eyebrow */}
            <motion.div
              className="flex items-center gap-3"
              initial={animate ? 'hidden' : false}
              animate="visible"
              variants={fadeIn}
              custom={0.15}
            >
              <span className="h-px w-8 bg-accent/70" aria-hidden="true" />
              <p className="text-[10px] font-medium uppercase tracking-[0.45em] text-accent">
                Personal Wardrobe Intelligence
              </p>
            </motion.div>

            {/* Main Editorial Headline — Guaranteed No Clipping */}
            <h1 className="mt-6 font-display font-light tracking-tight text-ink">
              <span className="fluid-display-hero block font-normal leading-[0.96]">
                YOUR WARDROBE.
              </span>
              <span className="fluid-display-hero block italic font-light leading-[0.96] text-muted">
                INTELLIGENTLY
              </span>
              <span className="fluid-display-hero block font-normal leading-[0.96] text-ink">
                STYLED.
              </span>
            </h1>

            {/* Brand Tagline & Supporting Copy */}
            <motion.div
              className="mt-6 max-w-xl space-y-3"
              initial={animate ? 'hidden' : false}
              animate="visible"
              variants={fadeIn}
              custom={0.35}
            >
              <p className="font-editorial text-lg italic text-ink md:text-xl">
                Your wardrobe. Intelligently styled.
              </p>
              <p className="text-sm leading-relaxed text-muted md:text-base">
                MAEVE is your private AI stylist and personal fashion archive. It photographs and catalogs
                the pieces you actually own, analyzes the weather outside, and composes elevated looks
                strictly from your existing wardrobe.
              </p>
            </motion.div>

            {/* Primary CTAs */}
            <motion.div
              className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center"
              initial={animate ? 'hidden' : false}
              animate="visible"
              variants={fadeIn}
              custom={0.5}
            >
              <Link
                to="/signin"
                className="group flex items-center justify-center gap-3 border border-ink bg-ink px-7 py-3.5 text-[10px] font-medium uppercase tracking-[0.3em] text-ivory transition-all hover:border-accent hover:bg-accent hover:text-espresso"
              >
                <span>Enter the Studio</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </Link>

              <a
                href="#gallery"
                className="flex items-center justify-center gap-2 border border-line bg-surface/80 px-6 py-3.5 text-[10px] uppercase tracking-[0.3em] text-ink transition-colors hover:border-accent/60 hover:text-accent"
              >
                <span>Explore Gallery</span>
                <span className="text-xs">↓</span>
              </a>
            </motion.div>

            {/* Trust & Capability Badges */}
            <motion.div
              className="mt-10 grid grid-cols-3 gap-4 border-t border-line/80 pt-6"
              initial={animate ? 'hidden' : false}
              animate="visible"
              variants={fadeIn}
              custom={0.65}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-accent">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span className="text-[9px] uppercase tracking-[0.2em] font-semibold text-ink">Private Archive</span>
                </div>
                <span className="text-[10px] text-muted">Only your real clothes</span>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-accent">
                  <CloudSun className="h-3.5 w-3.5" />
                  <span className="text-[9px] uppercase tracking-[0.2em] font-semibold text-ink">Weather-Aware</span>
                </div>
                <span className="text-[10px] text-muted">Adapted to your sky</span>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-accent">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="text-[9px] uppercase tracking-[0.2em] font-semibold text-ink">Zero Catalogues</span>
                </div>
                <span className="text-[10px] text-muted">Never borrowed</span>
              </div>
            </motion.div>
          </div>

          {/* ── RIGHT: Editorial Model Portrait Column (lg:col-span-6) ── */}
          <div className="relative flex items-center justify-center lg:col-span-6">
            <motion.div
              initial={animate ? { opacity: 0, scale: 0.98 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
              className="relative w-full max-w-[540px]"
            >
              {/* Outer decorative borders and shadow */}
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-sm border border-line bg-raised shadow-2xl shadow-black/10">
                <img
                  src={modelHero.url}
                  alt={modelHero.alt}
                  loading="eager"
                  decoding="async"
                  className="h-full w-full object-cover object-top transition-transform duration-1000 ease-out hover:scale-[1.02]"
                />

                {/* Subtle gradient overlay at bottom */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-espresso/80 via-transparent to-transparent" />

                {/* Bottom editorial badge */}
                <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.3em] text-accent font-medium">
                        MAEVE Brand Editorial
                      </p>
                      <p className="mt-1 font-display text-xl font-light text-ivory">
                        Tailored Ivory Blazer Ensemble
                      </p>
                    </div>
                    <span className="rounded-full border border-white/20 bg-black/40 px-3 py-1 text-[8px] uppercase tracking-[0.25em] text-white/90 backdrop-blur-md">
                      Signature Look
                    </span>
                  </div>
                </div>
              </div>

              {/* Decorative accent card overlapping bottom right */}
              <div className="absolute -bottom-5 -left-4 sm:-left-6 hidden sm:flex items-center gap-3 rounded-sm border border-line bg-surface/95 p-3.5 shadow-lg backdrop-blur-md">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <Eye className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-ink">
                    Intelligently Styled
                  </p>
                  <p className="text-[9px] text-muted">
                    8 Weather-Aware Gallery Looks
                  </p>
                </div>
              </div>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  )
}