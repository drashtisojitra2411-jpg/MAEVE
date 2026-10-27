import type { GarmentCategory, GarmentPattern, GarmentStyle } from '../types'

/**
 * Shared taxonomy labels used across authenticated surfaces.
 * These describe MAEVE's vocabulary — never user data.
 */

export const categoryLabels: Record<GarmentCategory, string> = {
  shirt: 'Shirts',
  tops: 'Tops',
  bottoms: 'Bottoms',
  dresses: 'Dresses',
  traditional: 'Traditional',
  outerwear: 'Outerwear',
  footwear: 'Footwear',
}

export const categoryOrder: GarmentCategory[] = [
  'shirt',
  'tops',
  'bottoms',
  'dresses',
  'traditional',
  'outerwear',
  'footwear',
]

export const patternLabels: Record<GarmentPattern, string> = {
  solid: 'Solid',
  striped: 'Striped',
  floral: 'Floral',
  check: 'Checked',
  printed: 'Printed',
  textured: 'Textured',
}

export const styleLabels: Record<GarmentStyle, string> = {
  casual: 'Casual',
  formal: 'Formal',
  ethnic: 'Ethnic',
  sporty: 'Sporty',
  evening: 'Evening',
  'smart-casual': 'Smart Casual',
}

/** Category → short human label used by the look composer. */
export const categoryNoun: Record<GarmentCategory, string> = {
  shirt: 'a shirt',
  tops: 'a top',
  bottoms: 'bottoms',
  dresses: 'a dress',
  traditional: 'a traditional piece',
  outerwear: 'a layer',
  footwear: 'shoes',
}

/** The roles MAEVE fills when assembling a complete look. */
export const lookRoles: { role: string; category: GarmentCategory }[] = [
  { role: 'optic', category: 'shirt' },
  { role: 'optic', category: 'tops' },
  { role: 'base', category: 'bottoms' },
  { role: 'base', category: 'footwear' },
  { role: 'layer', category: 'outerwear' },
  { role: 'focus', category: 'traditional' },
  { role: 'statement', category: 'dresses' },
]

/**
 * Natural, human label for a piece. New rows carry a natural subcategory
 * ("shirt", "trousers"); older rows stored the model's raw class name
 * ("long_sleeved_outwear"), which is translated here — raw model terms must
 * never reach the UI.
 */
const SUBCATEGORY_LABELS: Record<string, string> = {
  short_sleeved_shirt: 'Shirt',
  long_sleeved_shirt: 'Shirt',
  short_sleeved_outwear: 'Short-sleeve top',
  long_sleeved_outwear: 'Long-sleeve top',
  vest: 'Vest',
  sling: 'Camisole',
  shorts: 'Shorts',
  trousers: 'Trousers',
  skirt: 'Skirt',
  short_sleeved_dress: 'Dress',
  long_sleeved_dress: 'Dress',
  vest_dress: 'Dress',
  sling_dress: 'Dress',
  shirt: 'Shirt',
  top: 'Top',
  camisole: 'Camisole',
  dress: 'Dress',
}

export function garmentSubcategoryLabel(subcategory?: string | null): string | null {
  if (!subcategory) return null
  const key = subcategory.trim()
  if (!key) return null
  if (SUBCATEGORY_LABELS[key]) return SUBCATEGORY_LABELS[key]
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}