import { motion } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { maeveEase } from '../../lib/motion'
import { modelTraditional, modelOffice } from '../../data/images'
import { Reveal } from '../ui/Reveal'

const pillars = [
  { index: '01', title: 'Wardrobe Archive', text: 'A private, structured digital archive of the garments you actually own.' },
  { index: '02', title: 'CV Intelligence', text: 'Every garment detected, isolated, and understood from real smartphone photos.' },
  { index: '03', title: 'Personalized Style', text: 'Looks composed exclusively from your pieces — never from generic catalogues.' },
  { index: '04', title: 'Live Weather', text: 'The sky outside your window shapes temperature, breathability, and layering.' },
]

export function DiscoverSection() {
  const reducedMotion = useReducedMotion()

  return (
    <section className="relative border-t border-line bg-surface py-20 lg:py-28" id="discover-pillars">
      <div className="mx-auto max-w-[1600px] px-6 lg:px-16">

        {/* Header with rotated vertical label */}
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-12">
          {/* Vertical label */}
          <div className="hidden lg:col-span-1 lg:flex lg:items-start lg:pt-4">
            <span className="vertical-label text-[8px] uppercase tracking-[0.4em]" style={{ color: 'var(--maeve-subdued)' }}>
              — DISCOVER —
            </span>
          </div>

          {/* Main heading block */}
          <div className="lg:col-span-7">
            <Reveal>
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-accent/60" aria-hidden="true" />
                <p className="text-[10px] font-medium uppercase tracking-[0.45em] text-accent">Discover MAEVE</p>
              </div>
            </Reveal>
            <Reveal delay={0.12}>
              <h2 className="mt-4 font-display font-light leading-[0.95] tracking-tight text-ink">
                <span className="fluid-display block">One photograph</span>
                <span className="fluid-display block italic text-muted">at a time,</span>
                <span className="mt-2 block font-display text-xl font-light not-italic tracking-wide text-muted sm:text-2xl">
                  your closet becomes a personal studio.
                </span>
              </h2>
            </Reveal>
            <Reveal delay={0.25}>
              <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
                MAEVE is a private fashion archive with an AI stylist inside it. You photograph
                what you own — a shirt laid on a bed, trousers on a hanger — and MAEVE catalogs each
                piece, reads the weather outside, and composes real ways you can wear them every day.
              </p>
            </Reveal>
          </div>

          {/* Model imagery — editorial composition */}
          <div className="relative lg:col-span-4">
            <Reveal variant="scaleReveal" delay={0.15}>
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-sm border border-line bg-raised shadow-lg shadow-black/5">
                <img
                  src={modelTraditional.url}
                  alt={modelTraditional.alt}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover object-top"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-espresso/70 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <span className="rounded-full bg-black/40 px-2.5 py-1 text-[8px] uppercase tracking-[0.25em] text-white/90 backdrop-blur-md border border-white/10">
                    Artisanal Festive Styling
                  </span>
                </div>
              </div>
            </Reveal>

            {/* Offset small floating look */}
            <motion.div
              className="absolute -bottom-8 -left-6 hidden w-36 sm:block sm:w-44"
              style={{ transform: 'rotate(-2.5deg)' }}
              initial={reducedMotion ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.8, ease: maeveEase, delay: 0.3 }}
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-sm border border-line bg-raised shadow-md">
                <img
                  src={modelOffice.url}
                  alt={modelOffice.alt}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover object-top"
                />
              </div>
              <p className="mt-1.5 text-[8px] uppercase tracking-[0.25em] text-muted">
                Executive Tailoring
              </p>
            </motion.div>
          </div>
        </div>

        {/* Pillars — editorial numbered rows */}
        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p, i) => (
            <Reveal key={p.index} delay={0.05 + i * 0.05}>
              <div className="border-t border-line pt-6">
                <span className="font-display text-2xl font-light italic text-accent">
                  {p.index}
                </span>
                <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.28em] text-ink">
                  {p.title}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted">{p.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}