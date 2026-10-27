function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function hexToRgb(hex: string): [number, number, number] {
  let normalized = hex.replace('#', '')
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const num = parseInt(normalized, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(clamp01(n) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Mix two hex colors. t=0 → a, t=1 → b */
export function mix(hexA: string, hexB: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(hexA)
  const [br, bg, bb] = hexToRgb(hexB)
  const k = clamp01(t)
  return rgbToHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k)
}

/** Shade toward black. amount 0..1 */
export function shade(hex: string, amount: number): string {
  return mix(hex, '#000000', clamp01(amount))
}

/** Tint toward white. amount 0..1 */
export function tint(hex: string, amount: number): string {
  return mix(hex, '#FFFFFF', clamp01(amount))
}

/** Adjust lightness by a signed percentage-like factor. */
export function tone(hex: string, factor: number): string {
  if (factor >= 0) return tint(hex, factor)
  return shade(hex, -factor)
}