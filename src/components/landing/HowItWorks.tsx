import { motion } from 'framer-motion'
import { Camera, Layers, Sparkles, CloudSun, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { modelCollege, modelOffice } from '../../data/images'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { Reveal } from '../ui/Reveal'

const steps = [
  {
    number: '01',
    icon: Camera,
    title: 'Photograph What You Own',
    subtitle: 'Zero professional setup needed',
    description:
      'Photograph your clothes naturally at home — a shirt laid on a bed, trousers on a hanger, or a mirror selfie. MAEVE works with real-life lighting and natural smartphone photos.',
  },
  {
    number: '02',
    icon: Layers,
    title: 'AI Detects & Isolates',
    subtitle: 'Sub-pixel contour segmentation',
    description:
      'Our DeepFashion2 segmentation neural network detects individual pieces in frame, separates overlapping layers, and isolates each garment cleanly on an archival canvas.',
  },
  {
    number: '03',
    icon: Sparkles,
    title: 'Reads Full Attributes',
    subtitle: 'Color, fit, fabric & season',
    description:
      'The model identifies precise primary and secondary color hexes, category, neckline, sleeve length, pattern, material feel, and seasonal weather suitability.',
  },
  {
    number: '04',
    icon: CloudSun,
    title: 'Weather-Aware Outfits',
    subtitle: 'Styled for your real sky',
    description:
      'Every morning, MAEVE factors in live temperature, rain probability, and your scheduled occasion to compose polished complete outfits strictly from your own wardrobe.',
  },
]

export function HowItWorks() {
  const reducedMotion = useReducedMotion()

  return (
    <section id="how-it-works" className="relative flex min-h-[100svh] flex-col justify-center border-t border-line bg-surface py-20 lg:py-28">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col px-6 lg:px-16">
        {/* Section Header */}
        <div className="grid grid-cols-1 items-end gap-8 border-b border-line pb-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Reveal>
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-accent/60" aria-hidden="true" />
                <p className="text-[10px] font-medium uppercase tracking-[0.45em] text-accent">
                  How MAEVE Works
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="mt-3 font-display text-3xl font-light tracking-tight text-ink md:text-5xl lg:text-6xl">
                From a snapshot to an <span className="italic text-muted">intelligent wardrobe.</span>
              </h2>
            </Reveal>
          </div>
          <div className="lg:col-span-4">
            <Reveal delay={0.2}>
              <p className="text-sm leading-relaxed text-muted">
                MAEVE bridges computer vision and editorial fashion styling. In four automated steps,
                your personal wardrobe transforms into an intelligent daily studio.
              </p>
            </Reveal>
          </div>
        </div>

        {/* ── Visual Architecture: Side-by-Side Model & Pipeline ──────── */}
        <div className="mt-12 grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12 lg:gap-12">
          {/* Left Column: Visual Demonstration with Model Outfits */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-5">
            {/* Visual 1: Everyday Staged Look */}
            <div className="group relative overflow-hidden rounded-sm border border-line bg-raised aspect-[3/4]">
              <img
                src={modelCollege.url}
                alt={modelCollege.alt}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-espresso/80 via-transparent to-black/20" />
              <div className="absolute bottom-4 left-4 right-4 text-white">
                <span className="rounded-full bg-black/40 px-2.5 py-0.5 text-[8px] uppercase tracking-[0.2em] text-accent border border-white/10 backdrop-blur-md">
                  Input & Detection
                </span>
                <p className="mt-1 font-display text-lg font-light text-ivory">
                  Casual Wardrobe Archive
                </p>
              </div>
            </div>

            {/* Visual 2: Formal Styled Look */}
            <div className="group relative overflow-hidden rounded-sm border border-line bg-raised aspect-[3/4]">
              <img
                src={modelOffice.url}
                alt={modelOffice.alt}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-espresso/80 via-transparent to-black/20" />
              <div className="absolute bottom-4 left-4 right-4 text-white">
                <span className="rounded-full bg-black/40 px-2.5 py-0.5 text-[8px] uppercase tracking-[0.2em] text-accent border border-white/10 backdrop-blur-md">
                  Weather Composition
                </span>
                <p className="mt-1 font-display text-lg font-light text-ivory">
                  Tailored Executive Look
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: 4-Step Narrative Cards */}
          <div className="flex flex-col justify-between gap-4 lg:col-span-7">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {steps.map((step, idx) => {
                const Icon = step.icon
                return (
                  <motion.div
                    key={step.number}
                    initial={reducedMotion ? false : { opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.6, delay: idx * 0.1 }}
                    className="flex flex-col justify-between rounded-sm border border-line bg-raised/60 p-6 transition-all hover:border-accent/50 hover:bg-raised"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-display text-2xl font-light italic text-accent">
                          {step.number}
                        </span>
                        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line/60 bg-surface text-accent">
                          <Icon className="h-4 w-4" />
                        </span>
                      </div>
                      <h3 className="mt-4 font-editorial text-xl font-normal text-ink">
                        {step.title}
                      </h3>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-accent/90">
                        {step.subtitle}
                      </p>
                      <p className="mt-3 text-xs leading-relaxed text-muted">
                        {step.description}
                      </p>
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {/* Bottom Callout */}
            <div className="flex flex-col items-start justify-between gap-4 rounded-sm border border-line/70 bg-raised/30 p-5 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink">
                  Ready to catalogue your own garments?
                </p>
                <p className="text-xs text-muted">
                  Takes less than two minutes. No subscription or credit card needed.
                </p>
              </div>
              <Link
                to="/signin"
                className="group flex shrink-0 items-center gap-2 border border-ink bg-ink px-5 py-2.5 text-[9px] font-medium uppercase tracking-[0.25em] text-ivory transition-colors hover:border-accent hover:bg-accent hover:text-espresso"
              >
                <span>Upload First Garment</span>
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}