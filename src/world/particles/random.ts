// Deterministic randomness for particle layouts. The same seed gives the same
// field on every load, so scrubs and screenshots are repeatable.

export type Rand = () => number

/** mulberry32: small and fast, plenty for layouts. */
export function rng(seed: number): Rand {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Stateless hash of (i, k, salt) to [0, 1). A particle that respawns every
 * cycle k draws its new start from hash3(i, k, …), so a looping emitter is a
 * pure function of the clock and needs no per-particle state.
 */
export function hash3(i: number, k: number, salt: number): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul((k | 0) + 0x3c6ef372, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Smoothstep, same shape as GLSL. */
export function smooth(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
