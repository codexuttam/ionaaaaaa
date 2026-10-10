// Satoshi for the bottle canvases. The page may already declare the faces via
// @font-face; otherwise they are registered here from the vendored woff2 files,
// so the label never falls through to a random sans while the CSS is loading.

export const SATOSHI_STACK = '"Satoshi", "Helvetica Neue", Helvetica, Arial, sans-serif'

const FACES: readonly { weight: '300' | '400'; file: string }[] = [
  { weight: '300', file: 'Satoshi-Light.woff2' },
  { weight: '400', file: 'Satoshi-Regular.woff2' },
]

let ready: Promise<void> | null = null

const unquote = (s: string): string => s.replace(/["']/g, '').trim()

function findFace(weight: string): FontFace | undefined {
  let hit: FontFace | undefined
  document.fonts.forEach((f) => {
    if (!hit && unquote(f.family) === 'Satoshi' && f.weight === weight) hit = f
  })
  return hit
}

/** Resolves when Satoshi 300 and 400 are usable (or after a timeout; the fallback stack then draws). */
export function loadBottleFonts(): Promise<void> {
  if (ready) return ready
  if (typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined') {
    ready = Promise.resolve()
    return ready
  }
  const base = import.meta.env.BASE_URL
  const loads = FACES.map(async ({ weight, file }) => {
    let face = findFace(weight)
    if (!face) {
      face = new FontFace('Satoshi', `url(${base}fonts/${file}) format("woff2")`, { weight, style: 'normal' })
      document.fonts.add(face)
    }
    await face.load()
  })
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 5000))
  ready = Promise.race([
    Promise.allSettled(loads).then(() => document.fonts.load(`300 64px ${SATOSHI_STACK}`).then(() => undefined, () => undefined)),
    timeout,
  ])
  return ready
}

/** Draws `text` centred on `cx` with letter tracking in px (no trailing space after the last glyph). */
export function fillTracked(ctx: CanvasRenderingContext2D, text: string, cx: number, baseline: number, tracking: number): number {
  const glyphs = [...text]
  const widths = glyphs.map((g) => ctx.measureText(g).width)
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (glyphs.length - 1)
  let x = cx - total / 2
  ctx.textAlign = 'left'
  glyphs.forEach((g, i) => {
    ctx.fillText(g, x, baseline)
    x += widths[i] + tracking
  })
  return total
}

/** Width of `text` at the current font with tracking `trackEm` (em units). */
export function trackedWidth(ctx: CanvasRenderingContext2D, text: string, sizePx: number, trackEm: number): number {
  const glyphs = [...text]
  let w = 0
  for (const g of glyphs) w += ctx.measureText(g).width
  return w + trackEm * sizePx * (glyphs.length - 1)
}
