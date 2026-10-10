import * as THREE from 'three'
import { rng } from './random'

// A seamless fbm field, generated once on the CPU (no image is fetched).
// Four channels of periodic gradient noise, each wrapping exactly at the tile
// edge, so a card can sample it at any offset without a seam:
//   r  main mist body      (period 4, 5 octaves)
//   g  finer wisps          (period 6, 4 octaves)
//   b,a slow domain warp    (period 2, 3 octaves each)
// Values are normalized per channel to the full 0..1 range.

const SIZE = 256

type Grad = { perm: Uint8Array; gx: Float32Array; gy: Float32Array }

function gradients(seed: number): Grad {
  const r = rng(seed)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    const t = p[i]
    p[i] = p[j]
    p[j] = t
  }
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  const gx = new Float32Array(256)
  const gy = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const a = r() * Math.PI * 2
    gx[i] = Math.cos(a)
    gy[i] = Math.sin(a)
  }
  return { perm, gx, gy }
}

/** Perlin gradient noise that repeats every `period` lattice cells (period ≤ 256). */
function pnoise(x: number, y: number, period: number, g: Grad): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const x0 = ((xi % period) + period) % period
  const y0 = ((yi % period) + period) % period
  const x1 = (x0 + 1) % period
  const y1 = (y0 + 1) % period
  const { perm, gx, gy } = g
  const h00 = perm[perm[x0] + y0]
  const h10 = perm[perm[x1] + y0]
  const h01 = perm[perm[x0] + y1]
  const h11 = perm[perm[x1] + y1]
  const n00 = gx[h00] * fx + gy[h00] * fy
  const n10 = gx[h10] * (fx - 1) + gy[h10] * fy
  const n01 = gx[h01] * fx + gy[h01] * (fy - 1)
  const n11 = gx[h11] * (fx - 1) + gy[h11] * (fy - 1)
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
  const a = n00 + (n10 - n00) * u
  const b = n01 + (n11 - n01) * u
  return a + (b - a) * v
}

function fbmChannel(out: Float32Array, base: number, octaves: number, seed: number): void {
  const g = gradients(seed)
  for (let j = 0; j < SIZE; j++) {
    const v = j / SIZE
    for (let i = 0; i < SIZE; i++) {
      const u = i / SIZE
      let sum = 0
      let amp = 0.5
      let period = base
      for (let o = 0; o < octaves; o++) {
        sum += amp * pnoise(u * period, v * period, period, g)
        amp *= 0.5
        period *= 2
      }
      out[j * SIZE + i] = sum
    }
  }
}

/** Four normalized fbm channels, each [period, octaves, seed]. */
function noiseData(channels: readonly [number, number, number][]): Uint8Array {
  const data = new Uint8Array(SIZE * SIZE * 4)
  const tmp = new Float32Array(SIZE * SIZE)
  channels.forEach(([base, octaves, seed], c) => {
    fbmChannel(tmp, base, octaves, seed)
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < tmp.length; i++) {
      if (tmp[i] < lo) lo = tmp[i]
      if (tmp[i] > hi) hi = tmp[i]
    }
    const k = 255 / Math.max(hi - lo, 1e-6)
    for (let i = 0; i < tmp.length; i++) data[i * 4 + c] = Math.round((tmp[i] - lo) * k)
  })
  return data
}

function createFogNoise(): THREE.DataTexture {
  const data = noiseData([
    [4, 5, 1971],
    [6, 4, 2207],
    [2, 3, 3313],
    [2, 3, 4421],
  ])
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  // The cards only ever magnify this tile, so no mipmaps (they would also seam at the wrap).
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

let shared: THREE.DataTexture | null = null
let users = 0

/** The shared fog field. Pair every acquire with a release. */
export function acquireFogNoise(): THREE.DataTexture {
  if (!shared) shared = createFogNoise()
  users++
  return shared
}

export function releaseFogNoise(): void {
  users = Math.max(0, users - 1)
  if (users === 0 && shared) {
    shared.dispose()
    shared = null
  }
}

/**
 * The water field for moving water drawn into the pictures (falling streaks, sheets, glints).
 * Unlike the fog tile it is minified (fine streaks across a narrow fall), so it carries mipmaps.
 *   r  streak body      (period 8, 4 octaves)
 *   g  fine streaks      (period 16, 3 octaves)
 *   b  clumps and swells (period 4, 3 octaves)
 *   a  glints            (period 32, 2 octaves)
 */
export function createWaterNoise(): THREE.DataTexture {
  const data = noiseData([
    [8, 4, 5101],
    [16, 3, 6211],
    [4, 3, 7307],
    [32, 2, 8419],
  ])
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.name = 'water-noise'
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}
