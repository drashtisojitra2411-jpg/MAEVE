import { motion, AnimatePresence } from 'framer-motion'
import { CloudRain, Sun, ThermometerSnowflake, Compass, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { modelHotWeather, modelRainy, modelCold, type EditorialImage } from '../../data/images'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { cn } from '../../lib/cn'
import { maeveEase } from '../../lib/motion'
import { Reveal } from '../ui/Reveal'

interface WeatherScenario {
  id: string
  label: string
  icon: typeof Sun
  temp: string
  contextLabel: string
  title: string
  description: string
  fabricRule: string
  layeringTip: string
  image: EditorialImage
  pieces: string[]
}

const scenarios: WeatherScenario[] = [
  {
    id: 'warm',
    label: 'Warm Climate',
    icon: Sun,
    temp: '28°C – 36°C · High Sun',
    contextLabel: 'Warm-weather styling example',
    title: 'High-Heat Breathable Linen',
    description:
      'Engineered for intense sunlight and humidity. Zero synthetic fibers. Open-weave Belgian linen maximizes thermal release while maintaining an effortless editorial silhouette.',
    fabricRule: 'Pure open-weave linen, raw raffia, unlined natural cotton',
    layeringTip: 'Single-tier breathable shell with wide-leg airflow design',
    image: modelHotWeather,
    pieces: ['Linen Shell Top', 'Terracotta Wide-Leg Trousers', 'Flat Slide Sandals', 'Raffia Tote'],
  },
  {
    id: 'rain',
    label: 'Rainy Conditions',
    icon: CloudRain,
    temp: '16°C – 21°C · Precipitation',
    contextLabel: 'Rain-ready inspiration example',
    title: 'Sage Water-Repellent Trench',
    description:
      'Technical water-repellent cotton keeps storm moisture out, while the jersey interior lining prevents humidity clamminess during wet city commutes.',
    fabricRule: 'Hydrophobic technical cotton, treated gabardine, waterproof leather',
    layeringTip: 'Mid-length belted shell with water-resistant tapered trouser cuffs',
    image: modelRainy,
    pieces: ['Belted Technical Trench', 'Fine Charcoal Knit', 'Navy Tapered Pants', 'Chelsea Rain Boots'],
  },
  {
    id: 'cold',
    label: 'Cold & Wintry',
    icon: ThermometerSnowflake,
    temp: '6°C – 14°C · Crisp Chill',
    contextLabel: 'Cool-weather layering example',
    title: 'Double-Faced Camel Wool & Knit',
    description:
      'Three-tier thermal gradation: an ivory ribbed turtleneck base, charcoal wool flannel mid-layer, and a heavyweight camel wool overcoat topped with a taupe cashmere scarf.',
    fabricRule: 'Double-faced cashmere wool, ribbed thermal cotton, flannel wool',
    layeringTip: 'Tri-level thermal trap with breathable natural fiber graduation',
    image: modelCold,
    pieces: ['Camel Wool Overcoat', 'Ivory Ribbed Turtleneck', 'Charcoal Flannel Trousers', 'Cashmere Scarf'],
  },
]

export function StylistPreviewSection() {
  const [activeId, setActiveId] = useState('warm')
  const reducedMotion = useReducedMotion()

  const current = scenarios.find((s) => s.id === activeId) ?? scenarios[0]

  return (
    <section id="weather" className="relative flex min-h-[100svh] flex-col justify-center border-t border-line bg-surface py-20 lg:py-28">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col px-6 lg:px-16">
        {/* Section Header */}
        <div className="grid grid-cols-1 items-end gap-8 border-b border-line pb-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Reveal>
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-accent/60" aria-hidden="true" />
                <p className="text-[10px] font-medium uppercase tracking-[0.45em] text-accent">
                  Weather-Aware Styling
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="mt-3 font-display text-3xl font-light tracking-tight text-ink md:text-5xl lg:text-6xl">
                The sky outside <span className="italic text-muted">shapes your look.</span>
              </h2>
            </Reveal>
          </div>
          <div className="lg:col-span-4">
            <Reveal delay={0.2}>
              <p className="text-sm leading-relaxed text-muted">
                MAEVE is aware of conditions in your city. It calculates thermal comfort, precipitation
                probability, and wind chill to assemble complete looks suited to the real world.
              </p>
            </Reveal>
          </div>
        </div>

        {/* ── Climate Scenario Selector Tabs ───────────────────────────── */}
        <div className="mt-8 flex flex-wrap gap-3">
          {scenarios.map((scenario) => {
            const Icon = scenario.icon
            const isActive = scenario.id === activeId
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => setActiveId(scenario.id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-sm border px-5 py-3 text-[10px] font-medium uppercase tracking-[0.25em] transition-all',
                  isActive
                    ? 'border-accent bg-accent text-espresso shadow-md'
                    : 'border-line bg-raised text-muted hover:border-accent/50 hover:text-ink',
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{scenario.label}</span>
              </button>
            )
          })}
        </div>

        {/* ── Interactive Weather Showcase Display ────────────────────── */}
        <div className="mt-8 grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12 lg:gap-12">
          {/* LEFT: Model Wearing Climate-Adapted Complete Outfit */}
          <div className="relative lg:col-span-6">
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-sm border border-line bg-raised shadow-xl shadow-black/5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, scale: 1.02 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: reducedMotion ? 0.2 : 0.5, ease: maeveEase }}
                  className="absolute inset-0 h-full w-full"
                >
                  <img
                    src={current.image.url}
                    alt={current.image.alt}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover object-top"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-espresso/80 via-transparent to-transparent" />

                  {/* Overlaid Badges */}
                  <div className="absolute left-6 top-6">
                    <span className="rounded-full border border-white/20 bg-black/50 px-3 py-1 text-[9px] uppercase tracking-[0.25em] text-accent backdrop-blur-md">
                      {current.contextLabel}
                    </span>
                  </div>

                  <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-accent font-medium">
                      {current.temp}
                    </p>
                    <h3 className="mt-1 font-display text-2xl font-light text-ivory md:text-3xl">
                      {current.title}
                    </h3>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* RIGHT: Weather Styling Intelligence Details */}
          <div className="flex flex-col justify-between rounded-sm border border-line bg-raised/50 p-6 lg:col-span-6 lg:p-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: reducedMotion ? 0.15 : 0.35, ease: maeveEase }}
                className="space-y-6"
              >
                <div>
                  <span className="text-[9px] uppercase tracking-[0.3em] text-accent font-semibold">
                    Condition Analysis
                  </span>
                  <h3 className="mt-2 font-display text-2xl font-light text-ink lg:text-3xl">
                    {current.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    {current.description}
                  </p>
                </div>

                {/* Fabric & Breathability Rule */}
                <div className="border-t border-line/70 pt-4">
                  <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.25em] text-ink">
                    <Compass className="h-3.5 w-3.5 text-accent" />
                    Fabric & Thermal Grading
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {current.fabricRule}
                  </p>
                </div>

                {/* Layering Rule */}
                <div className="border-t border-line/70 pt-4">
                  <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.25em] text-ink">
                    <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                    Layering & Comfort Architecture
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {current.layeringTip}
                  </p>
                </div>

                {/* Items in Ensemble */}
                <div className="border-t border-line/70 pt-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-ink">
                    Coordinated Outfit Pieces
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {current.pieces.map((piece) => (
                      <span
                        key={piece}
                        className="rounded-sm border border-line bg-surface px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-muted"
                      >
                        {piece}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="mt-8 border-t border-line pt-6">
              <Link
                to="/signin"
                className="group flex w-full items-center justify-between border border-ink bg-ink px-6 py-3.5 text-[10px] font-medium uppercase tracking-[0.3em] text-ivory transition-all hover:border-accent hover:bg-accent hover:text-espresso"
              >
                <span>Check Weather Styling For Your City</span>
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}