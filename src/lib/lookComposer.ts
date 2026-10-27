import type { ComposedLook, GarmentCategory, WardrobeItem } from '../types'
import { uid } from '../lib/uid'

export interface LookContext {
  occasion: string
  summary?: string | null
  temperature?: number | null
}

/**
 * Assembles looks exclusively from a user's real wardrobe records.
 * No percentages, no invented accessories, no fabricated similarity — the
 * compositions and their reasoning reference only actual owned items.
 */

function likes(category: GarmentCategory): (item: WardrobeItem) => boolean {
  return (item) => item.category === category
}

/** Rotation counter so successive looks feature different pieces. */
function pickFrom(candidates: WardrobeItem[], offset: number): WardrobeItem | undefined {
  if (candidates.length === 0) return undefined
  const sorted = [...candidates].sort((a, b) => a.createdAt - b.createdAt)
  return sorted[offset % sorted.length]
}

/** True when the wardrobe can produce at least one complete outfit. */
export function canComposeLook(items: WardrobeItem[]): boolean {
  const wearable = items.filter((item) => Boolean(item.imageUrl) || Boolean(item.category))
  const hasCover = wearable.some((i) => i.category === 'tops' || i.category === 'shirt' || i.category === 'dresses')
  const hasBase = wearable.some((i) => i.category === 'bottoms' || i.category === 'dresses')
  const hasFeet = wearable.some((i) => i.category === 'footwear')
  return hasCover && hasBase && hasFeet
}

export function composeLooks(
  items: WardrobeItem[],
  ctx: LookContext,
  count = 3,
): ComposedLook[] {
  const wearable = items.filter((item) => Boolean(item.category))
  const looks: ComposedLook[] = []

  for (let index = 0; index < count; index += 1) {
    const chosen: WardrobeItem[] = []

    const cover =
      pickFrom(wearable.filter((i) => i.category === 'tops' || i.category === 'shirt'), index) ??
      pickFrom(wearable.filter(likes('dresses')), index)
    if (cover) chosen.push(cover)

    const usedCoverIsDress = cover?.category === 'dresses'
    const base =
      (usedCoverIsDress
        ? undefined
        : pickFrom(wearable.filter(likes('bottoms')), index)) ??
      pickFrom(wearable.filter(likes('dresses')), index)
    if (base && !chosen.some((i) => i.id === base.id)) chosen.push(base)

    const feet = pickFrom(wearable.filter(likes('footwear')), index)
    if (feet && !chosen.some((i) => i.id === feet.id)) chosen.push(feet)

    const layer = pickFrom(wearable.filter(likes('outerwear')), index)
    if (layer && !chosen.some((i) => i.id === layer.id)) chosen.push(layer)

    if (chosen.length === 0) continue

    const key = chosen.map((i) => i.id).sort().join('|')
    if (looks.some((look) => look.items.map((i) => i.id).sort().join('|') === key)) continue

    const names = chosen.map((item) => item.name).join(' · ')
    const weatherLine = ctx.summary
      ? ` ${ctx.summary}${typeof ctx.temperature === 'number' ? `, ${ctx.temperature}\u00B0` : ''}.`
      : ''

    looks.push({
      id: uid(),
      items: chosen,
      occasion: ctx.occasion,
      createdAt: Date.now(),
      reasoning: `${names} — drawn from your wardrobe for ${ctx.occasion.toLowerCase()}.${weatherLine}`,
    })
  }

  return looks
}