import * as THREE from 'three'
import { SATOSHI_STACK, fillTracked, trackedWidth } from './fonts'
import { CAP_BAND_TOP_Y, CAP_BOTTOM_Y, CAP_R } from './geometry'

// Cap canvases (docs/06 "Deboss").
// - Top: IONA cut into the top face. A blurred height canvas drives the base
//   bump; a normal map derived from the same height drives the clearcoat, so
//   the gloss layer (which is what a black cap really shows) follows the cut.
// - Side band: one IONA printed on the front of the band, white paint under
//   the clear coat (the plates show it light on the black cap).

const TOP = 1024
const SIDE_W = 2048
/** The band's height in the same px per unit as its circumference: square texels, so the word keeps its shape. */
const SIDE_H = Math.round((SIDE_W * (CAP_BAND_TOP_Y - CAP_BOTTOM_Y)) / (2 * Math.PI * CAP_R))

export type CapTextures = {
  /** height: letters white on black, used with a negative bumpScale so they sink */
  topBump: THREE.CanvasTexture
  /** tangent-space normals of the same cut, for the clear coat */
  topNormal: THREE.CanvasTexture
  /** G = roughness, B = metalness (letter floors slightly satin) */
  topOrm: THREE.CanvasTexture
  sideColor: THREE.CanvasTexture
  /** G = roughness, B = metalness */
  sideOrm: THREE.CanvasTexture
  /** True once draw() has run. */
  readonly drawn: boolean
  draw(): void
  dispose(): void
}

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d', { willReadFrequently: true })!]
}

/**
 * One running-sum box pass along lines of `n` samples spaced `step` apart, `m` lines whose starts
 * are `stride` apart; edges clamp. Plain index arithmetic in the hot loop (a closure and two
 * Math.min/max per sample made the cap textures cost a second of main thread).
 */
function boxPass(a: Float32Array, b: Float32Array, n: number, m: number, step: number, stride: number, r: number): void {
  const inv = 1 / (2 * r + 1)
  const last = n - 1
  for (let j = 0; j < m; j++) {
    const base = j * stride
    let acc = 0
    for (let i = -r; i <= r; i++) acc += a[base + (i < 0 ? 0 : i > last ? last : i) * step]
    for (let i = 0; i < n; i++) {
      b[base + i * step] = acc * inv
      const add = i + r + 1
      const sub = i - r
      acc += a[base + (add > last ? last : add) * step] - a[base + (sub < 0 ? 0 : sub) * step]
    }
  }
}

/** Three box passes ≈ a gaussian; single channel, in place. */
function blur(src: Float32Array, w: number, h: number, r: number): void {
  const tmp = new Float32Array(src.length)
  for (let k = 0; k < 3; k++) {
    boxPass(src, tmp, w, h, 1, w, r) // rows
    boxPass(tmp, src, h, w, w, 1, r) // columns
  }
}

function drawWord(ctx: CanvasRenderingContext2D, w: number, h: number, widthFrac: number, track: number, weight: 300 | 400): void {
  ctx.font = `${weight} 100px ${SATOSHI_STACK}`
  const capRatio = (ctx.measureText('H').actualBoundingBoxAscent || 70) / 100
  const size = (100 * widthFrac * w) / trackedWidth(ctx, 'IONA', 100, track)
  ctx.font = `${weight} ${size.toFixed(2)}px ${SATOSHI_STACK}`
  ctx.textBaseline = 'alphabetic'
  fillTracked(ctx, 'IONA', w / 2, h / 2 + (capRatio * size) / 2, track * size)
}

export function createCapTextures(): CapTextures {
  const [bumpC, bumpX] = canvas2d(TOP, TOP)
  const [normC, normX] = canvas2d(TOP, TOP)
  const [ormC, ormX] = canvas2d(TOP, TOP)
  const [sideC, sideX] = canvas2d(SIDE_W, SIDE_H)
  const [sOrmC, sOrmX] = canvas2d(SIDE_W, SIDE_H)

  const linear = (c: HTMLCanvasElement, name: string) => {
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.NoColorSpace
    t.anisotropy = 8
    t.name = name
    return t
  }
  const topBump = linear(bumpC, 'iona-cap-bump')
  const topNormal = linear(normC, 'iona-cap-normal')
  const topOrm = linear(ormC, 'iona-cap-orm')
  const sideColor = new THREE.CanvasTexture(sideC)
  sideColor.colorSpace = THREE.SRGBColorSpace
  sideColor.anisotropy = 8
  sideColor.name = 'iona-cap-side'
  const sideOrm = linear(sOrmC, 'iona-cap-side-orm')

  const draw = () => {
    // --- top: mask of the word, tracked like the hero wordmark
    bumpX.setTransform(1, 0, 0, 1, 0, 0)
    bumpX.fillStyle = '#000'
    bumpX.fillRect(0, 0, TOP, TOP)
    bumpX.fillStyle = '#fff'
    drawWord(bumpX, TOP, TOP, 0.62, 0.34, 300)
    const mask = bumpX.getImageData(0, 0, TOP, TOP)
    const hgt = new Float32Array(TOP * TOP)
    for (let i = 0; i < hgt.length; i++) hgt[i] = mask.data[i * 4] / 255
    const crisp = hgt.slice()
    blur(hgt, TOP, TOP, 2)

    // bump: blurred height (letters white, sunk by the negative bumpScale)
    const out = bumpX.createImageData(TOP, TOP)
    for (let i = 0; i < hgt.length; i++) {
      const v = Math.round(hgt[i] * 255)
      out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v
      out.data[i * 4 + 3] = 255
    }
    bumpX.putImageData(out, 0, 0)

    // clear-coat normals of the sunk letters: h = -mask
    const nrm = normX.createImageData(TOP, TOP)
    const nd = nrm.data
    const S = 5.5
    for (let y = 0; y < TOP; y++) {
      const row = y * TOP
      const up = (y > 0 ? y - 1 : 0) * TOP
      const down = (y < TOP - 1 ? y + 1 : TOP - 1) * TOP
      for (let x = 0; x < TOP; x++) {
        const i = row + x
        const hl = hgt[row + (x > 0 ? x - 1 : 0)]
        const hr = hgt[row + (x < TOP - 1 ? x + 1 : TOP - 1)]
        // height is -mask; canvas y runs against texture v
        const nx = (hr - hl) * 0.5 * S
        const ny = -(hgt[down + x] - hgt[up + x]) * 0.5 * S
        const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1)
        // Uint8ClampedArray rounds and clamps on assignment
        nd[i * 4] = (nx * inv * 0.5 + 0.5) * 255
        nd[i * 4 + 1] = (ny * inv * 0.5 + 0.5) * 255
        nd[i * 4 + 2] = (inv * 0.5 + 0.5) * 255
        nd[i * 4 + 3] = 255
      }
    }
    normX.putImageData(nrm, 0, 0)

    // letter floors: a touch rougher, so the cut reads even where the coat mirrors black
    const orm = ormX.createImageData(TOP, TOP)
    for (let i = 0; i < crisp.length; i++) {
      const m = crisp[i]
      orm.data[i * 4] = 255
      orm.data[i * 4 + 1] = Math.round((0.2 + 0.22 * m) * 255)
      orm.data[i * 4 + 2] = Math.round((1 - 0.35 * m) * 255)
      orm.data[i * 4 + 3] = 255
    }
    ormX.putImageData(orm, 0, 0)

    // --- side band: u = 0.5 faces the front, v runs up the band
    sideX.setTransform(1, 0, 0, 1, 0, 0)
    sideX.fillStyle = '#070708'
    sideX.fillRect(0, 0, SIDE_W, SIDE_H)
    sideX.fillStyle = '#DCE1E4'
    // IONA across about a sixth of the band, as on the reference cap
    drawWord(sideX, SIDE_W, SIDE_H, 0.16, 0.36, 300)
    const sm = sideX.getImageData(0, 0, SIDE_W, SIDE_H)
    const sOrm = sOrmX.createImageData(SIDE_W, SIDE_H)
    for (let i = 0; i < SIDE_W * SIDE_H; i++) {
      const m = Math.min(1, Math.max(0, (sm.data[i * 4] - 7) / (220 - 7)))
      sOrm.data[i * 4] = 255
      sOrm.data[i * 4 + 1] = Math.round((0.2 + 0.3 * m) * 255)
      sOrm.data[i * 4 + 2] = Math.round((1 - m) * 255)
      sOrm.data[i * 4 + 3] = 255
    }
    sOrmX.putImageData(sOrm, 0, 0)

    drawn = true
    topBump.needsUpdate = true
    topNormal.needsUpdate = true
    topOrm.needsUpdate = true
    sideColor.needsUpdate = true
    sideOrm.needsUpdate = true
  }
  // drawn once, by the bottle, when Satoshi is in (a draw with the fallback font would be thrown away)
  let drawn = false

  return {
    get drawn() {
      return drawn
    },
    topBump,
    topNormal,
    topOrm,
    sideColor,
    sideOrm,
    draw,
    dispose() {
      for (const t of [topBump, topNormal, topOrm, sideColor, sideOrm]) t.dispose()
      for (const c of [bumpC, normC, ormC, sideC, sOrmC]) c.width = c.height = 0
    },
  }
}
