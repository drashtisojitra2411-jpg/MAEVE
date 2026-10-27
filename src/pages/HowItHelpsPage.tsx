import {
  authEditorial,
  heroEditorial,
  howItWorksClean,
  howItWorksCapture,
  ideaEditorial,
  stylistEditorial,
  wardrobeEditorial,
} from '../data/images'
import { Emblem } from '../components/ui/Emblem'
import { Reveal } from '../components/ui/Reveal'
import { SectionLabel } from '../components/ui/SectionLabel'

interface HelpFeatureProps {
  eyebrow: string
  title: string
  description: string
}

function HelpFeature({ eyebrow, title, description }: HelpFeatureProps) {
  return (
    <div className="max-w-3xl">
      <SectionLabel>{eyebrow}</SectionLabel>
      <h3 className="mt-5 font-editorial text-3xl leading-tight text-ink md:text-4xl">{title}</h3>
      <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">{description}</p>
    </div>
  )
}

const features = [
  {
    eyebrow: 'Smart wardrobe',
    title: 'Every piece, catalogued once',
    description:
      'Photograph your clothes — a shirt on a bed, a kurta on a hanger, a mirror selfie. MAEVE detects each garment, isolates it on a clean background, and files it with attributes: category, color, pattern, fabric and fit.',
    image: ideaEditorial,
  },
  {
    eyebrow: 'Messy photo understanding',
    title: 'Real photos, not catalogs',
    description:
      "No tidied-up product shots required. MAEVE's vision pipeline is built for how clothes actually exist — crumpled on a chair, folded in a pile, stacked three deep in a drawer.",
    image: howItWorksCapture,
  },
  {
    eyebrow: 'AI outfit styling',
    title: 'Looks composed from what you own',
    description:
      'Instead of shopping suggestions, MAEVE builds outfits entirely from pieces already in your wardrobe, ranked by match — with the reasoning behind every look.',
    image: stylistEditorial,
  },
  {
    eyebrow: 'Weather-aware',
    title: 'Styled for the day outside',
    description:
      'Rain, humidity and a sharp temperature swing change what you should wear. MAEVE reads the real forecast and steers every suggestion toward what is genuinely comfortable today.',
    image: heroEditorial,
  },
  {
    eyebrow: 'Occasion-aware',
    title: 'College, office or evening — in mind',
    description:
      "Tell MAEVE where you're going and it styles accordingly: occasion shapes silhouette, layering, and how adventurous the palette can be.",
    image: authEditorial,
  },
  {
    eyebrow: 'Wardrobe utilization',
    title: 'Surface the pieces you forgot',
    description:
      'The average garment is worn a handful of times a year. MAEVE tracks wear, spotlights the rarely worn, and brings them back into rotation.',
    image: wardrobeEditorial,
  },
  {
    eyebrow: 'Personalization',
    title: 'A stylist that learns your taste',
    description:
      'Every look you accept — and every one you skip — teaches MAEVE how you like to dress. Preferences become a quiet brief that sharpens with every choice.',
    image: howItWorksClean,
  },
]

export function HowItHelpsPage() {
  return (
    <div className="bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <a href="/" className="flex items-center gap-3" aria-label="MAEVE home">
            <Emblem size="sm" className="opacity-90" />
            <span className="text-[10px] uppercase tracking-[0.4em] text-muted">MAEVE</span>
          </a>
          <a
            href="/"
            className="nav-link text-[10px] uppercase tracking-[0.25em] text-muted hover:text-ink"
          >
            Back home
          </a>
        </div>
      </header>

      <main>
        {/* Page hero */}
        <section className="relative overflow-hidden py-28 md:py-40">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-1/4 top-0 h-[80%] w-[80%] bg-[radial-gradient(ellipse_at_left,rgba(74,17,26,0.22),transparent_70%)]" />
            <div className="light-leak absolute inset-0" />
          </div>
          <div className="relative mx-auto max-w-4xl px-6 text-center lg:px-10">
            <Reveal>
              <SectionLabel>How MAEVE helps</SectionLabel>
            </Reveal>
            <Reveal delay={0.15}>
              <h1 className="mt-8 font-editorial text-4xl font-light leading-[1.1] text-ink md:text-6xl">
                MAEVE is your wardrobe&apos;s
                <br />
                <span className="italic text-muted">quiet intelligence.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.3}>
              <p className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-muted md:text-lg">
                One photograph at a time, MAEVE learns what you own, notices how you
                live, and turns two hundred hanging pieces into thirty great outfits.
              </p>
            </Reveal>
          </div>
        </section>

        {/* Feature sequence */}
        <section className="mx-auto max-w-7xl space-y-28 px-6 pb-32 lg:px-10 md:space-y-36">
          {features.map((feature, index) => (
            <div
              key={feature.eyebrow}
              className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16"
            >
              <Reveal className="lg:col-span-6">
                <div className="flex items-baseline gap-4">
                  <span className="font-editorial text-4xl text-accent">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <HelpFeature
                    eyebrow={feature.eyebrow}
                    title={feature.title}
                    description={feature.description}
                  />
                </div>
              </Reveal>
              <Reveal delay={0.1} className="lg:col-span-6">
                <div className="media-frame aspect-[4/3]">
                  <img
                    src={feature.image.url}
                    alt={feature.image.alt}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
              </Reveal>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}