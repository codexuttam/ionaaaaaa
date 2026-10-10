import * as THREE from 'three'
import { SATOSHI_STACK, fillTracked, trackedWidth } from './fonts'
import { LABEL, LABEL_BACK } from '../dom/copy'

// The two labels, after the client's reference renders ("FRONT DESIGN" and
// "BACK DESIGN"): a frosted white print over each window of the cut glass (the
// label meshes cover the windows' outlines, geometry.ts buildLabel), drawn once on
// a canvas shaped like its window and redrawn when Satoshi arrives. Positions and
// sizes are fractions of the label's height (down) and width (across), measured
// off the references.

const CW = 768
const FROST = '#F5F8F9'
const INK = '#16181B'
const INK_SOFT = '#3A3E43'

export type LabelSide = 'front' | 'back'

export type LabelTexture = {
  texture: THREE.CanvasTexture
  draw(): void
  dispose(): void
  /** True once draw() has run. */
  readonly drawn: boolean
}

type Ctx = CanvasRenderingContext2D & { fontKerning?: string; letterSpacing?: string }

function grain(ctx: Ctx, w: number, h: number): void {
  // fine frost grain, a couple of percent, deterministic
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  let s = 1234567
  for (let i = 0; i < d.length; i += 4) {
    s = (Math.imul(s, 1103515245) + 12345) | 0
    const k = (((s >>> 16) & 255) / 255 - 0.5) * 4
    // ImageData is a Uint8ClampedArray: assignment rounds and clamps
    d[i] += k
    d[i + 1] += k
    d[i + 2] += k
  }
  ctx.putImageData(img, 0, 0)
}

function frost(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = FROST
  ctx.fillRect(0, 0, w, h)
  // the print falls off a little toward the window's edges, where the glass turns away
  const side = ctx.createLinearGradient(0, 0, w, 0)
  side.addColorStop(0, 'rgba(120, 140, 155, 0.18)')
  side.addColorStop(0.1, 'rgba(120, 140, 155, 0.03)')
  side.addColorStop(0.9, 'rgba(120, 140, 155, 0.03)')
  side.addColorStop(1, 'rgba(120, 140, 155, 0.18)')
  ctx.fillStyle = side
  ctx.fillRect(0, 0, w, h)
  const ends = ctx.createLinearGradient(0, 0, 0, h)
  ends.addColorStop(0, 'rgba(120, 140, 155, 0.12)')
  ends.addColorStop(0.04, 'rgba(120, 140, 155, 0)')
  ends.addColorStop(0.97, 'rgba(120, 140, 155, 0)')
  ends.addColorStop(1, 'rgba(120, 140, 155, 0.12)')
  ctx.fillStyle = ends
  ctx.fillRect(0, 0, w, h)
}

/** Cap height of the face at `px`, measured once per weight. */
function capRatio(ctx: Ctx, weight: number): number {
  ctx.font = `${weight} 100px ${SATOSHI_STACK}`
  return (ctx.measureText('H').actualBoundingBoxAscent || 70) / 100
}

/** A centred line of tracked capitals: `size` is either its cap height or the width it fits (fractions of the label width). */
function centred(ctx: Ctx, w: number, text: string, y: number, opts: { weight: 300 | 400 | 500; cap?: number; fit?: number; track: number }): void {
  const ratio = capRatio(ctx, opts.weight)
  let size: number
  if (opts.fit !== undefined) size = (100 * opts.fit * w) / trackedWidth(ctx, text, 100, opts.track)
  else size = ((opts.cap ?? 0.04) * w) / ratio
  ctx.font = `${opts.weight} ${size.toFixed(2)}px ${SATOSHI_STACK}`
  fillTracked(ctx, text, w / 2, y + (ratio * size) / 2, opts.track * size)
}

function drawFront(ctx: Ctx, w: number, h: number, volume: string): void {
  frost(ctx, w, h)
  grain(ctx, w, h)
  ctx.fillStyle = INK
  ctx.textBaseline = 'alphabetic'
  ctx.fontKerning = 'normal'
  centred(ctx, w, LABEL.wordmark, 0.25 * h, { weight: 400, fit: 0.72, track: 0.2 })
  LABEL.type.forEach((l, i) => centred(ctx, w, l, (0.338 + i * 0.031) * h, { weight: 400, cap: 0.047, track: 0.2 }))
  LABEL.promise.forEach((l, i) => centred(ctx, w, l, (0.76 + i * 0.038) * h, { weight: 400, cap: 0.054, track: 0.2 }))
  centred(ctx, w, volume, 0.935 * h, { weight: 400, cap: 0.047, track: 0.12 })
}

// --- back: the reference's information side

/** Left-aligned text: `size` the font size as a fraction of the label width. */
function left(ctx: Ctx, w: number, text: string, x: number, y: number, size: number, weight: 400 | 500 | 600, color = INK, track = 0): void {
  ctx.font = `${weight} ${(size * w).toFixed(2)}px ${SATOSHI_STACK}`
  ctx.fillStyle = color
  if (track) {
    let cx = x * w
    for (const ch of text) {
      ctx.fillText(ch, cx, y)
      cx += ctx.measureText(ch).width + track * size * w
    }
  } else ctx.fillText(text, x * w, y)
}

function rule(ctx: Ctx, w: number, y: number, x0 = 0.05, x1 = 0.95): void {
  ctx.fillStyle = 'rgba(22, 24, 27, 0.32)'
  ctx.fillRect(x0 * w, y, (x1 - x0) * w, Math.max(1, w * 0.002))
}

/** The benefit icons, drawn as thin strokes: a drop, pH in a ring, a leaf, a sun. */
function icon(ctx: Ctx, kind: 'drop' | 'ph' | 'leaf' | 'sun', cx: number, cy: number, r: number): void {
  ctx.save()
  ctx.strokeStyle = INK
  ctx.lineWidth = Math.max(1, r * 0.12)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (kind === 'drop') {
    ctx.moveTo(cx, cy - r)
    ctx.bezierCurveTo(cx + r * 0.9, cy - r * 0.1, cx + r * 0.75, cy + r, cx, cy + r)
    ctx.bezierCurveTo(cx - r * 0.75, cy + r, cx - r * 0.9, cy - r * 0.1, cx, cy - r)
    ctx.stroke()
  } else if (kind === 'ph') {
    ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = INK
    ctx.font = `500 ${(r * 0.85).toFixed(1)}px ${SATOSHI_STACK}`
    ctx.textAlign = 'center'
    ctx.fillText('pH', cx, cy + r * 0.3)
  } else if (kind === 'leaf') {
    ctx.moveTo(cx - r * 0.85, cy + r * 0.85)
    ctx.bezierCurveTo(cx - r * 0.9, cy - r * 0.4, cx + r * 0.2, cy - r * 0.95, cx + r * 0.9, cy - r * 0.9)
    ctx.bezierCurveTo(cx + r * 0.95, cy - r * 0.1, cx + r * 0.3, cy + r * 0.9, cx - r * 0.85, cy + r * 0.85)
    ctx.moveTo(cx - r * 0.85, cy + r * 0.85)
    ctx.lineTo(cx + r * 0.55, cy - r * 0.55)
    ctx.stroke()
  } else {
    ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      ctx.moveTo(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62)
      ctx.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95)
    }
    ctx.stroke()
  }
  ctx.restore()
}

/** Bars for the printed barcode: a fixed pattern from its digits (a picture of a barcode, not a scannable one). */
function barcode(ctx: Ctx, digits: string, x: number, y: number, bw: number, bh: number): void {
  const bits: number[] = [1, 0, 1]
  for (const ch of digits.replace(/\D/g, '')) {
    const v = Number(ch)
    for (let k = 0; k < 7; k++) bits.push((v * 37 + k * 11 + (v >> 1)) % 3 === 0 ? 1 : (k + v) % 2)
  }
  bits.push(1, 0, 1)
  const unit = bw / bits.length
  ctx.fillStyle = INK
  bits.forEach((b, i) => {
    if (b) ctx.fillRect(x + i * unit, y, unit * 0.92, bh)
  })
}

function drawBack(ctx: Ctx, w: number, h: number): void {
  frost(ctx, w, h)
  grain(ctx, w, h)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fontKerning = 'normal'
  const B = LABEL_BACK
  const X = 0.06
  const Y = (f: number) => f * h
  ctx.fillStyle = INK
  centred(ctx, w, B.wordmark, Y(0.04), { weight: 300, fit: 0.5, track: 0.24 })
  ctx.fillStyle = INK_SOFT
  B.promise.forEach((l, i) => centred(ctx, w, l, Y(0.072 + i * 0.019), { weight: 500, cap: 0.028, track: 0.16 }))
  ctx.fillStyle = 'rgba(22, 24, 27, 0.4)'
  ctx.fillRect(0.43 * w, Y(0.112), 0.14 * w, Math.max(1, w * 0.002))

  left(ctx, w, B.story.title, X, Y(0.148), 0.05, 600, INK, 0.08)
  B.story.text.forEach((l, i) => left(ctx, w, l, X, Y(0.172 + i * 0.02), 0.047, 400, INK_SOFT))
  rule(ctx, w, Y(0.232))

  left(ctx, w, B.benefits.title, X, Y(0.26), 0.05, 600, INK, 0.08)
  const rows = [0.287, 0.332, 0.377, 0.422]
  B.benefits.items.forEach((it, i) => {
    const y = Y(rows[i])
    icon(ctx, it.icon, 0.17 * w, y + 0.006 * h, 0.06 * w)
    const titles = it.title.split('\n')
    titles.forEach((t, k) => left(ctx, w, t, 0.32, y + k * 0.018 * h, 0.046, 600, INK, 0.06))
    left(ctx, w, it.text, 0.32, y + titles.length * 0.018 * h, 0.043, 400, INK_SOFT)
  })
  rule(ctx, w, Y(0.476))

  left(ctx, w, B.details.title, X, Y(0.503), 0.05, 600, INK, 0.08)
  B.details.rows.forEach(([k, v], i) => {
    const y = Y(0.528 + i * 0.02)
    left(ctx, w, k, X, y, 0.042, 400, INK_SOFT)
    left(ctx, w, ':', 0.43, y, 0.042, 400, INK_SOFT)
    left(ctx, w, v, 0.48, y, 0.042, 400, INK_SOFT)
  })
  rule(ctx, w, Y(0.62))

  left(ctx, w, B.storage.title, X, Y(0.646), 0.05, 600, INK, 0.08)
  B.storage.text.forEach((l, i) => left(ctx, w, l, X, Y(0.67 + i * 0.02), 0.043, 400, INK_SOFT))
  rule(ctx, w, Y(0.73))

  B.batch.rows.forEach(([k, v], i) => {
    const y = Y(0.755 + i * 0.02)
    left(ctx, w, k, X, y, 0.042, 400, INK_SOFT)
    left(ctx, w, ':', 0.43, y, 0.042, 400, INK_SOFT)
    left(ctx, w, v, 0.48, y, 0.042, 400, INK_SOFT)
  })
  left(ctx, w, B.batch.note, X, Y(0.812), 0.032, 400, INK_SOFT)

  const by = Y(0.828)
  barcode(ctx, B.barcode, X * w, by, 0.46 * w, 0.055 * h)
  left(ctx, w, B.barcode, X, by + 0.072 * h, 0.04, 400, INK, 0.12)
  // the recycling mark and the green vegetarian mark
  ctx.save()
  ctx.strokeStyle = INK
  ctx.lineWidth = Math.max(1, w * 0.006)
  const rx = 0.66 * w
  const ry = by + 0.03 * h
  const rr = 0.045 * w
  ctx.beginPath()
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3
    const b = a + (Math.PI * 2) / 3
    ctx.moveTo(rx + Math.cos(a + 0.35) * rr, ry + Math.sin(a + 0.35) * rr)
    ctx.lineTo(rx + Math.cos(b - 0.35) * rr, ry + Math.sin(b - 0.35) * rr)
  }
  ctx.stroke()
  const vx = 0.8 * w
  const vs = 0.075 * w
  ctx.strokeStyle = '#2E7D32'
  ctx.strokeRect(vx, ry - vs / 2, vs, vs)
  ctx.fillStyle = '#2E7D32'
  ctx.beginPath()
  ctx.arc(vx + vs / 2, ry, vs * 0.28, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  B.maker.forEach((l, i) => left(ctx, w, l, X, Y(0.92 + i * 0.018), i === 0 || i === B.maker.length - 1 ? 0.04 : 0.04, i === 0 || i === 1 ? 600 : 400, i < 2 ? INK : INK_SOFT))
}

/**
 * One label's canvas: `aspect` is its window's height over its width (the canvas takes the same shape, so
 * type keeps its proportions); `volume` is the size printed at the foot of the front (the product shots set theirs).
 */
export function createLabelTexture(side: LabelSide, aspect: number, volume: string = LABEL.volume): LabelTexture {
  const canvas = document.createElement('canvas')
  canvas.width = CW
  canvas.height = Math.round(CW * aspect)
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.name = `iona-label-${side}`
  let drawn = false
  const draw = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.textAlign = 'left'
    if (side === 'front') drawFront(ctx, canvas.width, canvas.height, volume)
    else drawBack(ctx, canvas.width, canvas.height)
    drawn = true
    texture.needsUpdate = true
  }
  // drawn once, by the bottle, when Satoshi is in
  return {
    get drawn() {
      return drawn
    },
    texture,
    draw,
    dispose() {
      texture.dispose()
      canvas.width = canvas.height = 0
    },
  }
}
