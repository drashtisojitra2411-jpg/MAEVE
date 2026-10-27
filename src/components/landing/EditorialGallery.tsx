import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  CloudSun,
  Layers,
  Pause,
  Play,
  Sparkles,
  Tag,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { EDITORIAL_OUTFITS, type EditorialOutfit } from '../../data/images'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { cn } from '../../lib/cn'
import { maeveEase } from '../../lib/motion'

interface EditorialGalleryProps {
  className?: string
}

const AUTOPLAY_INTERVAL_MS = 6500

export function EditorialGallery({ className }: EditorialGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const reducedMotion = useReducedMotion()
  const galleryRef = useRef<HTMLDivElement>(null)

  const currentOutfit: EditorialOutfit = EDITORIAL_OUTFITS[currentIndex]
  const total = EDITORIAL_OUTFITS.length

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index)
  }, [])

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % total)
  }, [total])

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + total) % total)
  }, [total])

  // Autoplay with pause-on-hover / reduced motion support
  useEffect(() => {
    if (!isPlaying || reducedMotion) return
    const timer = setInterval(() => {
      nextSlide()
    }, AUTOPLAY_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [isPlaying, nextSlide, reducedMotion])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      nextSlide()
    } else if (e.key === 'ArrowLeft') {
      prevSlide()
    }
  }

  // Preload next image
  useEffect(() => {
    const nextIdx = (currentIndex + 1) % total
    const prevIdx = (currentIndex - 1 + total) % total
    const preload = (url: string) => {
      const img = new Image()
      img.src = url
    }
    preload(EDITORIAL_OUTFITS[nextIdx].image.url)
    preload(EDITORIAL_OUTFITS[prevIdx].image.url)
  }, [currentIndex, total])

  return (
    <section
      id="gallery"
      ref={galleryRef}
      onMouseEnter={() => setIsPlaying(false)}
      onMouseLeave={() => setIsPlaying(true)}
      onFocusCapture={() => setIsPlaying(false)}
      onBlurCapture={() => setIsPlaying(true)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-roledescription="carousel"
      aria-label="Editorial Fashion Gallery — Complete Model Outfits"
      className={cn(
        'relative flex min-h-[100svh] flex-col justify-center border-t border-line bg-surface py-20 lg:py-24 outline-none focus-visible:ring-1 focus-visible:ring-accent/40',
        className,
      )}
    >
      {/* Background glow and subtle editorial grid lines */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute right-0 top-1/4 h-[500px] w-[500px] rounded-full bg-accent/[0.04] blur-3xl" />
        <div className="absolute left-0 bottom-1/4 h-[400px] w-[400px] rounded-full bg-champagne/[0.06] blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col px-6 lg:px-16">
        {/* Section Header */}
        <div className="flex flex-col justify-between gap-4 border-b border-line pb-6 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-accent/60" aria-hidden="true" />
              <p className="text-[10px] font-medium uppercase tracking-[0.45em] text-accent">
                Editorial Fashion Gallery
              </p>
            </div>
            <h2 className="mt-2 font-display text-3xl font-light tracking-tight text-ink md:text-5xl lg:text-6xl">
              Styled <span className="italic text-muted">Looks,</span> Living Intelligence.
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-[10px] uppercase tracking-[0.3em] text-muted">
              Slide {String(currentIndex + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </span>

            {/* Play/Pause Button */}
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              aria-label={isPlaying ? 'Pause slideshow auto-rotation' : 'Play slideshow auto-rotation'}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface/80 text-ink transition-colors hover:border-accent hover:text-accent"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* ── Main Two-Column Editorial Display ────────────────────────── */}
        <div className="mt-8 grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12 lg:gap-12">
          {/* LEFT: Large Fashion Photography of Model Wearing Complete Outfit */}
          <div className="relative lg:col-span-7">
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-sm border border-line bg-raised shadow-xl shadow-black/5">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={currentOutfit.id}
                  initial={{ opacity: 0, scale: 1.02 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  transition={{ duration: reducedMotion ? 0.2 : 0.65, ease: maeveEase }}
                  className="absolute inset-0 h-full w-full"
                >
                  <img
                    src={currentOutfit.image.url}
                    alt={currentOutfit.image.alt}
                    loading="eager"
                    decoding="async"
                    className="h-full w-full object-cover object-top transition-transform duration-1000 ease-out"
                  />
                  {/* Subtle vignette gradient */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />

                  {/* Watermark slide number on image */}
                  <div className="absolute left-6 top-6 select-none font-display text-4xl font-light text-white/70">
                    {currentOutfit.number}
                  </div>

                  {/* Bottom caption overlay */}
                  <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                    <span className="inline-block rounded-full bg-black/40 px-3 py-1 text-[9px] uppercase tracking-[0.25em] text-accent backdrop-blur-md border border-white/10">
                      {currentOutfit.concept}
                    </span>
                    <h3 className="mt-2 font-display text-2xl font-light tracking-wide text-white drop-shadow-sm md:text-3xl">
                      {currentOutfit.title}
                    </h3>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Prev / Next arrows overlaid on desktop edges */}
              <div className="pointer-events-none absolute inset-y-0 inset-x-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevSlide}
                  aria-label="Previous outfit look"
                  className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md transition-all hover:bg-black/70 hover:scale-105 active:scale-95"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={nextSlide}
                  aria-label="Next outfit look"
                  className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md transition-all hover:bg-black/70 hover:scale-105 active:scale-95"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: Sophisticated Information Panel */}
          <div className="flex flex-col justify-between rounded-sm border border-line bg-raised/50 p-6 lg:col-span-5 lg:p-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentOutfit.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: reducedMotion ? 0.15 : 0.45, ease: maeveEase }}
                className="flex flex-col space-y-6"
              >
                {/* Occasion & Weather Context Header */}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[9px] uppercase tracking-[0.2em] text-accent">
                      <Sparkles className="h-3 w-3" />
                      {currentOutfit.occasion}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[9px] uppercase tracking-[0.2em] text-muted">
                      <CloudSun className="h-3 w-3 text-accent" />
                      {currentOutfit.weatherContext}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-2xl font-light text-ink lg:text-3xl">
                    {currentOutfit.title}
                  </h3>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-accent">
                    Weather context: {currentOutfit.weatherScenario}
                  </p>
                </div>

                {/* Narrative Description */}
                <p className="text-sm leading-relaxed text-muted lg:text-base">
                  {currentOutfit.description}
                </p>

                {/* Garment Categories Represented */}
                <div className="border-t border-line/80 pt-4">
                  <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.25em] text-ink">
                    <Tag className="h-3.5 w-3.5 text-accent" />
                    Garments in this ensemble
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {currentOutfit.categories.map((cat) => (
                      <span
                        key={cat}
                        className="rounded-sm border border-line/60 bg-surface px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-muted"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Colour Palette Swatches */}
                <div className="border-t border-line/80 pt-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-ink">
                    Harmonized Color Palette
                  </p>
                  <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {currentOutfit.colorPalette.map((col) => (
                      <div
                        key={col.name}
                        className="flex items-center gap-2 rounded-sm border border-line/60 bg-surface p-1.5"
                      >
                        <span
                          className="h-4 w-4 shrink-0 rounded-full border border-black/10 shadow-sm"
                          style={{ backgroundColor: col.hex }}
                          aria-hidden="true"
                        />
                        <span className="truncate text-[9px] uppercase tracking-[0.1em] text-muted">
                          {col.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Layering & Comfort Explanation */}
                <div className="border-t border-line/80 pt-4">
                  <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.25em] text-ink">
                    <Layers className="h-3.5 w-3.5 text-accent" />
                    Layering & Comfort Intelligence
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">
                    {currentOutfit.layeringComfort}
                  </p>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Interactive Call to Action */}
            <div className="mt-6 border-t border-line pt-6">
              <Link
                to="/signin"
                className="group flex w-full items-center justify-between border border-ink bg-ink px-6 py-3.5 text-[10px] font-medium uppercase tracking-[0.3em] text-ivory transition-all hover:border-accent hover:bg-accent hover:text-espresso"
              >
                <span>Discover this look in your wardrobe</span>
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <p className="mt-2 text-center text-[9px] uppercase tracking-[0.2em] text-muted/60">
                Editorial demonstration · Your wardrobe builds from pieces you own
              </p>
            </div>
          </div>
        </div>

        {/* ── Slide Indicator Navigation Bar (8 Outfits) ────────────────── */}
        <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {EDITORIAL_OUTFITS.map((outfit, index) => {
            const isActive = index === currentIndex
            return (
              <button
                key={outfit.id}
                type="button"
                onClick={() => goToSlide(index)}
                aria-label={`Go to slide ${index + 1}: ${outfit.concept}`}
                className={cn(
                  'group flex flex-col items-start rounded-sm border p-2.5 text-left transition-all',
                  isActive
                    ? 'border-accent bg-accent/10 shadow-sm'
                    : 'border-line bg-surface hover:border-accent/50 hover:bg-raised',
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span
                    className={cn(
                      'text-[9px] font-semibold uppercase tracking-[0.2em]',
                      isActive ? 'text-accent' : 'text-muted group-hover:text-ink',
                    )}
                  >
                    {outfit.number}
                  </span>
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full transition-colors',
                      isActive ? 'bg-accent' : 'bg-line group-hover:bg-accent/40',
                    )}
                  />
                </div>
                <span className="mt-1 line-clamp-1 text-[10px] uppercase tracking-[0.12em] text-ink">
                  {outfit.concept}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
