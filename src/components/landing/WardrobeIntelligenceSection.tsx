import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  modelCollege,
  modelOffice,
  modelTraditional,
  modelEvening,
  modelHotWeather,
  modelCasual,
} from '../../data/images'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { Reveal } from '../ui/Reveal'

const categories = [
  {
    id: 'tops-layers',
    title: 'Shirts, Tops & Layers',
    count: 'Automatic Taxonomy',
    tag: 'Tops & Knits',
    description: 'Cotton-ribs, poplins, knits, and light outerwear catalogued by sleeve length and collar.',
    image: modelCollege,
  },
  {
    id: 'tailored-formal',
    title: 'Tailored Suits & Trousers',
    count: 'Structured Fit',
    tag: 'Formalwear',
    description: 'Precision wool blazers, pleated trousers, and suiting separates indexed for executive wear.',
    image: modelOffice,
  },
  {
    id: 'traditional-festive',
    title: 'Traditional & Ethnic Sets',
    count: 'Artisanal Weaves',
    tag: 'Festive & Ethnic',
    description: 'Chanderi silk kurtas, palazzos, and festive dupattas filed with embroidery and fabric details.',
    image: modelTraditional,
  },
  {
    id: 'evening-cocktail',
    title: 'Dresses & Evening Silhouettes',
    count: 'Occasion Ready',
    tag: 'Evening & Gala',
    description: 'Fluid bias silk slip dresses and velvet cocktail layers prepared for nighttime events.',
    image: modelEvening,
  },
  {
    id: 'summer-linens',
    title: 'High-Summer Breathable Linens',
    count: 'Thermal Rated',
    tag: 'Warm Climate',
    description: 'Zero-synthetic open-weave linens and wide-leg silhouettes built for high temperatures.',
    image: modelHotWeather,
  },
  {
    id: 'casual-denim',
    title: 'Contemporary Casual & Denim',
    count: 'Daily Rotation',
    tag: 'Weekend & Casual',
    description: 'Structured cotton denims, relaxed poplin shirts, and leather staples for everyday life.',
    image: modelCasual,
  },
]

export function WardrobeIntelligenceSection() {
  const reducedMotion = useReducedMotion()

  return (
    <section id="wardrobe" className="relative flex min-h-[100svh] flex-col justify-center border-t border-line bg-bg py-20 lg:py-28">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col px-6 lg:px-16">
        {/* Section Header */}
        <div className="grid grid-cols-1 items-end gap-8 border-b border-line pb-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Reveal>
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-accent/60" aria-hidden="true" />
                <p className="text-[10px] font-medium uppercase tracking-[0.45em] text-accent">
                  Wardrobe Archive
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="mt-3 font-display text-3xl font-light tracking-tight text-ink md:text-5xl lg:text-6xl">
                Every category, <span className="italic text-muted">elegantly structured.</span>
              </h2>
            </Reveal>
          </div>
          <div className="lg:col-span-4">
            <Reveal delay={0.2}>
              <p className="text-sm leading-relaxed text-muted">
                MAEVE categorizes every garment with precision. Experience how complete looks in your
                personal collection organize into a curated, searchable fashion archive.
              </p>
            </Reveal>
          </div>
        </div>

        {/* ── 6-Card Category Showcase Grid (Uniform Aspect Ratios & Heights) ── */}
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat, idx) => (
            <motion.div
              key={cat.id}
              initial={reducedMotion ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.6, delay: idx * 0.08 }}
              className="group relative flex flex-col overflow-hidden rounded-sm border border-line bg-surface transition-all duration-300 hover:border-accent/60 hover:shadow-xl hover:shadow-black/5"
            >
              {/* Image Container with Consistent Aspect Ratio */}
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-raised">
                <img
                  src={cat.image.url}
                  alt={cat.image.alt}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-espresso/80 via-transparent to-transparent opacity-80 transition-opacity group-hover:opacity-90" />

                {/* Floating Category Tag */}
                <span className="absolute left-4 top-4 rounded-full border border-white/20 bg-black/40 px-2.5 py-1 text-[8px] uppercase tracking-[0.2em] text-white/90 backdrop-blur-md">
                  {cat.tag}
                </span>

                {/* Bottom Overlay Title */}
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <p className="text-[9px] uppercase tracking-[0.25em] text-accent font-medium">
                    {cat.count}
                  </p>
                  <h3 className="mt-1 font-display text-xl font-light text-ivory">
                    {cat.title}
                  </h3>
                </div>
              </div>

              {/* Card Meta Content */}
              <div className="flex flex-1 flex-col justify-between p-5 bg-surface/90">
                <p className="text-xs leading-relaxed text-muted">
                  {cat.description}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-muted">
                    Catalogued in MAEVE
                  </span>
                  <Link
                    to="/signin"
                    className="text-[9px] font-medium uppercase tracking-[0.25em] text-ink transition-colors group-hover:text-accent"
                  >
                    View in studio →
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom Banner */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 rounded-sm border border-line bg-raised/40 p-6 sm:flex-row">
          <div>
            <p className="font-editorial text-lg italic text-ink md:text-xl">
              "Your wardrobe is an archive waiting to be discovered."
            </p>
            <p className="text-xs text-muted">
              Built on the pieces you own. Zero synthetic styling or catalogue stock.
            </p>
          </div>
          <Link
            to="/signin"
            className="shrink-0 border border-ink bg-ink px-6 py-3 text-[10px] font-medium uppercase tracking-[0.3em] text-ivory transition-colors hover:border-accent hover:bg-accent hover:text-espresso"
          >
            Start Your Archive
          </Link>
        </div>
      </div>
    </section>
  )
}