import { Reveal } from '../ui/Reveal'
import { modelCasual } from '../../data/images'

export function IdeaSection() {
  return (
    <section id="the-idea" className="relative flex min-h-[100svh] flex-col justify-center overflow-hidden border-t border-line bg-bg py-20 lg:py-28">
      {/* Decorative watermark number */}
      <span
        className="editorial-number pointer-events-none absolute -right-4 top-1/2 -translate-y-1/2 select-none text-[22vw] leading-none opacity-20"
        aria-hidden="true"
      >
        02
      </span>

      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col justify-center px-6 lg:px-16">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">

          {/* Model Fashion Portrait — Left Column */}
          <div className="lg:col-span-5">
            <Reveal variant="scaleReveal">
              <div className="group relative aspect-[3/4] w-full overflow-hidden rounded-sm border border-line bg-raised shadow-xl shadow-black/5">
                <img
                  src={modelCasual.url}
                  alt={modelCasual.alt}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-espresso/80 via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                  <span className="rounded-full bg-black/40 px-2.5 py-0.5 text-[8px] uppercase tracking-[0.2em] text-accent backdrop-blur-md border border-white/10">
                    The MAEVE Philosophy
                  </span>
                  <p className="mt-2 font-display text-xl font-light text-ivory">
                    Your Wardrobe Re-Imagined
                  </p>
                  <p className="mt-0.5 text-[10px] text-white/70">
                    Styled from denim, cotton poplin & suede already owned
                  </p>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Hairline Divider */}
          <div className="hidden lg:col-span-1 lg:flex lg:items-center lg:justify-center" aria-hidden="true">
            <div className="h-64 w-px bg-gradient-to-b from-transparent via-accent/40 to-transparent" />
          </div>

          {/* Philosophy Text — Right Column */}
          <div className="lg:col-span-6">
            <Reveal>
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-accent/60" aria-hidden="true" />
                <p className="text-[10px] font-medium uppercase tracking-[0.45em] text-accent">The Idea</p>
              </div>
            </Reveal>
            <Reveal delay={0.12}>
              <h2 className="mt-6 font-display font-light leading-[0.95] tracking-tight text-ink">
                <span className="fluid-display block">You don't</span>
                <span className="fluid-display block italic text-muted">need more</span>
                <span className="fluid-display block">clothes.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.25}>
              <div className="mt-6 h-px w-16 bg-gradient-to-r from-accent/60 to-transparent" />
            </Reveal>
            <Reveal delay={0.35}>
              <h3 className="mt-6 font-display text-xl font-light italic leading-relaxed text-muted sm:text-2xl">
                You need to know what you already have.
              </h3>
            </Reveal>
            <Reveal delay={0.45}>
              <p className="mt-6 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
                Most wardrobes hold over a hundred garments and still feel empty every morning. MAEVE turns
                yours into an active, intelligent archive. Photograph your pieces once, and every shirt,
                trouser, and jacket becomes an asset ready to be dynamically styled.
              </p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}