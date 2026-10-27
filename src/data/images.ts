/**
 * Centralised editorial image and fashion gallery data layer for MAEVE.
 *
 * All public homepage imagery features the same consistent female fashion
 * model wearing complete, curated outfits across distinct real-world occasions
 * and weather contexts.
 */

export interface EditorialImage {
  url: string
  alt: string
  ratio?: number
}

export interface PaletteColor {
  name: string
  hex: string
}

export interface EditorialOutfit {
  id: string
  number: string
  title: string
  concept: string
  occasion: string
  weatherScenario: string
  weatherContext: string
  description: string
  categories: string[]
  colorPalette: PaletteColor[]
  layeringComfort: string
  image: EditorialImage
}

/* ── Consistent Model Editorial Photography Assets ────────────────────── */

export const modelHero: EditorialImage = {
  url: '/editorial/model-hero.jpg',
  alt: 'MAEVE brand ambassador in tailored ivory blazer with fine-knit top — editorial portrait',
  ratio: 0.75,
}

export const modelCollege: EditorialImage = {
  url: '/editorial/model-college.jpg',
  alt: 'College and everyday look: beige pleated trousers, rib-knit top, olive utility jacket and tote bag',
  ratio: 0.75,
}

export const modelOffice: EditorialImage = {
  url: '/editorial/model-office.jpg',
  alt: 'Office formal look: structured navy wool blazer, silk button-down blouse, tailored trousers and loafers',
  ratio: 0.75,
}

export const modelHotWeather: EditorialImage = {
  url: '/editorial/model-hot-weather.jpg',
  alt: 'Hot-weather look: sleeveless ecru linen top, terracotta wide-leg linen pants, woven raffia bag',
  ratio: 0.75,
}

export const modelRainy: EditorialImage = {
  url: '/editorial/model-rainy.jpg',
  alt: 'Rainy-weather look: sage green belted trench coat, charcoal knit, navy water-repellent trousers and umbrella',
  ratio: 0.75,
}

export const modelCold: EditorialImage = {
  url: '/editorial/model-cold.jpg',
  alt: 'Cold-weather look: double-faced camel wool coat, ivory cable-knit turtleneck, charcoal wool trousers and scarf',
  ratio: 0.75,
}

export const modelTraditional: EditorialImage = {
  url: '/editorial/model-traditional.jpg',
  alt: 'Traditional occasion look: teal and emerald silk chanderi kurta set with gold zardozi embroidery and organza dupatta',
  ratio: 0.75,
}

export const modelEvening: EditorialImage = {
  url: '/editorial/model-evening.jpg',
  alt: 'Party and evening look: champagne silk satin slip dress, draped black velvet tuxedo blazer and strappy heels',
  ratio: 0.75,
}

export const modelCasual: EditorialImage = {
  url: '/editorial/model-casual.jpg',
  alt: 'Casual outing look: French blue striped poplin shirt, straight-leg washed indigo denim and suede mules',
  ratio: 0.75,
}

/* ── Complete 8-Outfit Editorial Slideshow Gallery Data ───────────────── */

export const EDITORIAL_OUTFITS: EditorialOutfit[] = [
  {
    id: 'college-everyday',
    number: '01',
    title: 'Campus & Everyday Ease',
    concept: 'College / Everyday',
    occasion: 'Everyday Practical',
    weatherScenario: 'Mild & Breezy (18°C – 24°C)',
    weatherContext: 'Breezy-day styling',
    description:
      'An effortless silhouette balancing tailored comfort and mobility. A breathable cotton-rib knit top paired with high-waisted neutral beige trousers, layered with an olive utility jacket for lecture halls and city streets.',
    categories: ['Utility Jacket', 'Rib-Knit Top', 'Pleated Trousers', 'Sneakers', 'Tote Bag'],
    colorPalette: [
      { name: 'Olive Canvas', hex: '#636B4F' },
      { name: 'Warm Ivory', hex: '#F5F2EB' },
      { name: 'Oatmeal Beige', hex: '#D6C7B2' },
      { name: 'Saddle Tan', hex: '#9E643C' },
    ],
    layeringComfort:
      'Breathable cotton-rib base with a durable unlined cotton-twill shell. Adapts effortlessly between indoor AC and outdoor temperature shifts.',
    image: modelCollege,
  },
  {
    id: 'office-formal',
    number: '02',
    title: 'Tailored Executive Poise',
    concept: 'Office / Formal',
    occasion: 'Executive & Formal',
    weatherScenario: 'Climate-Controlled (20°C – 22°C)',
    weatherContext: 'Office-ready inspiration',
    description:
      'Sharp, architectural tailoring in rich midnight navy wool. Layered with a fluid ivory silk crepe button-down shirt and finished with almond-toe leather loafers for commanding boardroom presence.',
    categories: ['Wool Blazer', 'Silk Blouse', 'Tailored Trousers', 'Leather Loafers'],
    colorPalette: [
      { name: 'Midnight Navy', hex: '#1D2436' },
      { name: 'Silk Crepe', hex: '#FAF7EE' },
      { name: 'Obsidian Leather', hex: '#141416' },
      { name: 'Champagne Gold', hex: '#C5A880' },
    ],
    layeringComfort:
      'Structured single-breasted jacket lined in cupro for smooth frictionless movement over delicate silk.',
    image: modelOffice,
  },
  {
    id: 'hot-weather',
    number: '03',
    title: 'Sun-Drenched Terracotta',
    concept: 'Hot Weather',
    occasion: 'High Heat & Summer',
    weatherScenario: 'Intense Sun & Warmth (28°C – 36°C)',
    weatherContext: 'Warm-weather styling',
    description:
      'Pure airy linen separates engineered for high humidity and intense sunshine. An unlined ecru shell top complements billowing wide-leg terracotta trousers and a hand-woven natural raffia tote.',
    categories: ['Linen Shell', 'Wide-Leg Trousers', 'Slide Sandals', 'Raffia Tote'],
    colorPalette: [
      { name: 'Terracotta', hex: '#B85D3D' },
      { name: 'Bleached Ecru', hex: '#EFECE4' },
      { name: 'Raw Raffia', hex: '#D1B88B' },
      { name: 'Cognac Leather', hex: '#8F4E24' },
    ],
    layeringComfort:
      'Zero synthetic fibers. Pure open-weave Belgian linen maximizes thermal release and skin breathability in peak heat.',
    image: modelHotWeather,
  },
  {
    id: 'rainy-weather',
    number: '04',
    title: 'Rain-Ready Minimalist',
    concept: 'Rainy Weather',
    occasion: 'Rain & Inclement Weather',
    weatherScenario: 'Precipitation & Overcast (16°C – 21°C)',
    weatherContext: 'Rain-ready inspiration',
    description:
      'A water-resistant technical cotton midi trench coat in calming sage green, belted over dark slate tailored separates and sealed with waterproof Chelsea leather boots for storm resilience.',
    categories: ['Belted Trench', 'Fine-Knit Top', 'Weatherproof Pants', 'Chelsea Boots', 'Umbrella'],
    colorPalette: [
      { name: 'Sage Mist', hex: '#849B89' },
      { name: 'Dark Slate', hex: '#3A3F47' },
      { name: 'Deep Navy', hex: '#1C2433' },
      { name: 'Polished Wood', hex: '#5C3A21' },
    ],
    layeringComfort:
      'Double-weave hydrophobic trench shell keeps external wetness out; soft jersey interior eliminates clammy moisture build-up.',
    image: modelRainy,
  },
  {
    id: 'cold-weather',
    number: '05',
    title: 'Cashmere & Camel Architecture',
    concept: 'Cold Weather',
    occasion: 'Autumn / Winter',
    weatherScenario: 'Chilly & Wintry (6°C – 14°C)',
    weatherContext: 'Cool-weather layering',
    description:
      'An exquisite study in thermal elegance: double-faced camel wool coat worn over an ivory ribbed turtleneck knit, grounded by charcoal flannel wool trousers and a fringed cashmere scarf.',
    categories: ['Camel Overcoat', 'Ribbed Turtleneck', 'Flannel Trousers', 'Cashmere Scarf', 'Boots'],
    colorPalette: [
      { name: 'Camel Wool', hex: '#B8874E' },
      { name: 'Ivory Knit', hex: '#FAF8F2' },
      { name: 'Charcoal Flannel', hex: '#42474D' },
      { name: 'Taupe Cashmere', hex: '#9C9286' },
    ],
    layeringComfort:
      'Three-tier thermal grading: fine knit inner, flannel mid, and structured double-faced wool outer that traps insulating warmth without bulk.',
    image: modelCold,
  },
  {
    id: 'traditional-occasion',
    number: '06',
    title: 'Emerald Chanderi Splendour',
    concept: 'Traditional Occasion',
    occasion: 'Indian Festive & Wedding',
    weatherScenario: 'Evening Celebrations (20°C – 26°C)',
    weatherContext: 'Festive occasion ensemble',
    description:
      'Pure silk chanderi kurta set in radiant jewel emerald, finished with hand-embroidered antique gold zardozi along the split neckline and sleeves. Paired with fluid palazzos and a sheer scalloped organza dupatta.',
    categories: ['Silk Kurta', 'Silk Palazzos', 'Organza Dupatta', 'Antique Jhumkas', 'Juttis'],
    colorPalette: [
      { name: 'Jewel Emerald', hex: '#156350' },
      { name: 'Deep Teal', hex: '#0D4238' },
      { name: 'Antique Zardozi', hex: '#D4AF37' },
      { name: 'Gilded Sand', hex: '#DECBA4' },
    ],
    layeringComfort:
      'Pure natural silk and gossamer organza breathe naturally in crowded evening halls, offering royal comfort with fluid grace.',
    image: modelTraditional,
  },
  {
    id: 'party-evening',
    number: '07',
    title: 'Champagne Slip & Velvet Tux',
    concept: 'Party / Evening',
    occasion: 'Cocktail & Evening Gala',
    weatherScenario: 'Nighttime Glamour (18°C – 24°C)',
    weatherContext: 'Evening-ready inspiration',
    description:
      'A liquid champagne gold silk satin cowl-neck slip dress offset with a structured black velvet tuxedo blazer draped over shoulders. Completed with minimalist black strappy heels and a polished evening minaudiere.',
    categories: ['Silk Slip Dress', 'Velvet Tuxedo', 'Strap Heels', 'Evening Minaudiere'],
    colorPalette: [
      { name: 'Champagne Gold', hex: '#D9C3A0' },
      { name: 'Black Velvet', hex: '#121214' },
      { name: 'Liquid Silk', hex: '#F0E4D2' },
      { name: 'Polished Brass', hex: '#E5C158' },
    ],
    layeringComfort:
      'Bias-cut silk satin contours naturally to the body, while the velvet blazer provides instant elegance and cozy evening warmth.',
    image: modelEvening,
  },
  {
    id: 'casual-outing',
    number: '08',
    title: 'Poplin Stripe & Indigo Denim',
    concept: 'Casual Outing',
    occasion: 'Weekend & Casual Leisure',
    weatherScenario: 'Sunny Temperate (21°C – 27°C)',
    weatherContext: 'Weekend leisure styling',
    description:
      'A timeless contemporary classic: French blue striped crisp cotton poplin shirt effortlessly half-tucked into straight-leg washed indigo denim, anchored by a cognac leather belt and camel suede mules.',
    categories: ['Poplin Shirt', 'Indigo Denim', 'Leather Belt', 'Suede Mules', 'Crossbody Bag'],
    colorPalette: [
      { name: 'French Blue', hex: '#5C85C0' },
      { name: 'Crisp White', hex: '#FFFFFF' },
      { name: 'Washed Indigo', hex: '#3A567D' },
      { name: 'Cognac Leather', hex: '#8F4E24' },
    ],
    layeringComfort:
      'High-thread-count 100% cotton poplin stays crisp and airy all day; 13oz structured cotton denim softens with every wear.',
    image: modelCasual,
  },
]

/* ── Backward-compatible Aliases ───────────────────────────────────────── */
export const garmentShirt: EditorialImage = modelHero
export const garmentBlazer: EditorialImage = modelOffice
export const garmentJeans: EditorialImage = modelCasual
export const garmentDress: EditorialImage = modelEvening
export const garmentKurta: EditorialImage = modelTraditional
export const garmentTrousers: EditorialImage = modelCollege

export const heroEditorial: EditorialImage = modelHero
export const ideaEditorial: EditorialImage = modelTraditional
export const stylistEditorial: EditorialImage = modelOffice
export const wardrobeEditorial: EditorialImage = modelHotWeather
export const howItWorksCapture: EditorialImage = modelCollege
export const howItWorksClean: EditorialImage = modelOffice
export const authEditorial: EditorialImage = modelHero