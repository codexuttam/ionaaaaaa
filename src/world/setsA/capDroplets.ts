import * as THREE from 'three'
import type { BottleAnchors } from '../../bottle/types'

// Where the water sits on the cap (docs/scenes/02, 02-cap-closeup.png).
// Cap space is the bottle's capSocket: origin at the top face center, +y up,
// +z the bottle's front. Angles run from +z toward +x.
//
//   top   beads resting on the top face, clear of the deboss, almost still
//   edge  beads caught on the rim of the top face
//   side  beads sliding down the cap band over 3-6 s, a slight sideways sine,
//         re-forming at the top of the band each cycle
//
// Placement is a pure function of the loop clock, so nothing is stored per bead.

export const Kind = { Top: 0, Edge: 1, Side: 2 } as const
export type Kind = (typeof Kind)[keyof typeof Kind]

export type Bead = {
  kind: Kind
  /** radius, world units at bottle scale 1 */
  r: number
  /** top/edge: fraction of the top radius; side: unused */
  rho: number
  /** angle from +z toward +x */
  phi: number
  /** side: seconds per slide, and the cycle phase */
  period: number
  phase: number
  seed: number
}

export type CapDims = { top: number; body: number; height: number; band: number }

export function capDims(a: BottleAnchors): CapDims {
  return {
    top: a.capTopRadius,
    body: a.capRadius,
    height: a.capHeight,
    // thickness of the top disc above the band (docs/06: 0.028 on a 0.178 cap)
    band: THREE.MathUtils.clamp(a.capHeight * 0.16, 0.02, 0.035),
  }
}

// Designed, not random: the hold frame is composed. Top beads stay out of the
// deboss band (|x| < 0.7, |z| < 0.24 of the top radius) and favor the front arc.
const TOP: readonly Omit<Bead, 'kind' | 'period' | 'phase'>[] = [
  { r: 0.0095, rho: 0.72, phi: -1.05, seed: 0.13 },
  { r: 0.0125, rho: 0.8, phi: 1.08, seed: 0.57 },
  { r: 0.0085, rho: 0.78, phi: 2.35, seed: 0.91 },
  { r: 0.008, rho: 0.62, phi: -2.5, seed: 0.33 },
]
const EDGE: readonly Omit<Bead, 'kind' | 'period' | 'phase'>[] = [
  { r: 0.009, rho: 1, phi: 0.12, seed: 0.27 },
  { r: 0.008, rho: 1, phi: -0.42, seed: 0.71 },
  { r: 0.0085, rho: 1, phi: 1.5, seed: 0.45 },
]
/** The side band seen by the macro camera: the front arc, a little wider on the left. */
const SIDE_ARC: readonly [number, number] = [-1.2, 1.12]

export function layoutBeads(n: number): Bead[] {
  const top = Math.max(1, Math.round(n * 0.25))
  const edge = n >= 3 ? Math.max(1, Math.round(n * 0.16)) : 0
  const side = Math.max(0, n - top - edge)
  const beads: Bead[] = []
  for (let i = 0; i < top; i++) beads.push({ ...TOP[i % TOP.length], kind: Kind.Top, period: 1, phase: 0 })
  for (let i = 0; i < edge; i++) beads.push({ ...EDGE[i % EDGE.length], kind: Kind.Edge, period: 1, phase: 0 })
  for (let i = 0; i < side; i++) {
    const f = side === 1 ? 0.5 : i / (side - 1)
    const h = hash(i, 0, 11)
    beads.push({
      kind: Kind.Side,
      r: 0.008 + 0.003 * hash(i, 0, 3),
      rho: 1,
      phi: SIDE_ARC[0] + (SIDE_ARC[1] - SIDE_ARC[0]) * f + (h - 0.5) * 0.12,
      period: 3 + 3 * hash(i, 0, 5),
      // spread the cycles so the band never empties or fills at once
      phase: (i * 0.618034) % 1,
      seed: hash(i, 0, 7),
    })
  }
  return beads.slice(0, n)
}

const X = new THREE.Vector3()
const Y = new THREE.Vector3()
const Z = new THREE.Vector3()
const P = new THREE.Vector3()

/**
 * Write bead `b`'s instance matrix at loop time `t` into `out` (dome axis +y = surface
 * normal, +z = downhill, scaled to the bead). Returns the bead's tail amount (0..1).
 */
export function placeBead(b: Bead, t: number, d: CapDims, out: THREE.Matrix4): number {
  if (b.kind === Kind.Side) {
    const u = t / b.period + b.phase
    const k = Math.floor(u)
    const s = u - k
    // each cycle re-forms a little to the side, so the paths do not repeat exactly
    const phi = b.phi + (hash(b.seed * 997, k, 13) - 0.5) * 0.14 + 0.02 * Math.sin(Math.PI * 2 * 1.3 * s + b.seed * 6.28)
    // the band starts under the lip of the top disc, where a running bead first shows
    const top = -(d.band + 0.022)
    const bottom = -(d.height - 0.014)
    // slow to break free, then running: a bead gathering water as it goes
    const y = top + (bottom - top) * Math.pow(s, 1.4)
    const life = smooth(0, 0.1, s) * (1 - smooth(0.86, 1, s))
    const r = b.r * (0.85 + 0.3 * hash(b.seed * 997, k, 17)) * life
    const sp = Math.sin(phi)
    const cp = Math.cos(phi)
    Y.set(sp, 0, cp)
    Z.set(0, -1, 0)
    X.set(cp, 0, -sp)
    P.set(sp * (d.body + 0.0006), y, cp * (d.body + 0.0006))
    compose(out, X, Y, Z, P, r, r * 0.52, r * 1.3)
    return 1
  }
  const sp = Math.sin(b.phi)
  const cp = Math.cos(b.phi)
  if (b.kind === Kind.Top) {
    // almost still: a creep of a millimetre or two
    const rho = b.rho * d.top + 0.0018 * Math.sin(0.23 * t + b.seed * 6.28)
    Y.set(0, 1, 0)
    Z.set(sp, 0, cp)
    X.set(cp, 0, -sp)
    P.set(sp * rho, 0.0006, cp * rho)
    compose(out, X, Y, Z, P, b.r, b.r * 0.62, b.r)
    return 0
  }
  // edge: the bead has run to the rim of the top face and waits there, leaning a little outward
  const lean = 0.16
  const cl = Math.cos(lean)
  const sl = Math.sin(lean)
  Y.set(sp * sl, cl, cp * sl)
  Z.set(sp * cl, -sl, cp * cl)
  X.set(cp, 0, -sp)
  const rr = d.top - b.r * 1.08 + 0.0012 * Math.sin(0.17 * t + b.seed * 6.28)
  P.set(sp * rr, 0.0006, cp * rr)
  compose(out, X, Y, Z, P, b.r, b.r * 0.66, b.r * 1.15)
  return 0.2
}

function compose(out: THREE.Matrix4, x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3, p: THREE.Vector3, sx: number, sy: number, sz: number): void {
  out.set(x.x * sx, y.x * sy, z.x * sz, p.x, x.y * sx, y.y * sy, z.y * sz, p.y, x.z * sx, y.z * sy, z.z * sz, p.z, 0, 0, 0, 1)
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/** Stateless hash of (i, k, salt) to [0, 1). */
function hash(i: number, k: number, salt: number): number {
  let h = Math.imul(Math.floor(i) | 0, 0x27d4eb2d) ^ Math.imul((k | 0) + 0x3c6ef372, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
