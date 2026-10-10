// Shared marks of the opening, cap and closing beats (docs/scenes/00, 02, 14).
// The backdrop's radial reveal of the hero plate is centered on OPENING_IMPACT.

/** World point where the opening drop lands; the opening ripple is centered here. */
export const OPENING_IMPACT = { x: 0, y: 0, z: 0 } as const

/** Opening local progress marks. */
export const DROP_BORN = 0.28
export const DROP_IMPACT = 0.55
export const DROP_START_Y = 2.2
export const DROP_RADIUS = 0.045
export const RIPPLE_END = 0.75
export const RIPPLE_MAX_RADIUS = 1.6
export const RIPPLE_PEAK_OPACITY = 0.45
/** Seconds the film must rest above the drop's birth before an arrival counts as "from the top". */
export const DROP_ARM_AFTER = 0.35

/** Closing local progress marks and the held ring. */
export const CLOSING_RIPPLE_START = 0.42
export const CLOSING_RIPPLE_END = 0.62
export const CLOSING_RIPPLE_HOLD = 0.35
/** On-screen width of the closing ring in CSS px when the DOM slot does not size it. */
export const CLOSING_RIPPLE_WIDTH = 120
/** Height / width of the closing ellipse (a ring on water seen from a low angle). */
export const CLOSING_RIPPLE_ASPECT = 0.24

/** Cap droplets: visible from hero local IN to cap local OUT (docs/scenes/02). */
export const CAP_DROPLETS_IN: readonly [number, number] = [0.78, 0.9]
export const CAP_DROPLETS_OUT: readonly [number, number] = [0.8, 0.9]

/** Cap light sweep (rig.light.capSweep 0..1): cap-space x from SWEEP_X[0] to SWEEP_X[1]. */
export const SWEEP_X: readonly [number, number] = [-0.4, 0.4]
/**
 * Height above the cap top and distance behind it, cap space. The macro camera sits about
 * 30 degrees above the top face, so a light at the mirror angle behind the cap puts its
 * reflection on the top face, just beyond the deboss; far enough back that the lacquer
 * shows a streak rather than a blown disc.
 */
export const SWEEP_HEIGHT = 1.0
export const SWEEP_BACK = 2.08
export const SWEEP_PEAK = 6
/** The timeline drops capSweep back to -1 across cap local .90-.92; past this mark the sweep is spent. */
export const SWEEP_LAST_LOCAL = 0.9

/** power2.in / power2.out on 0..1, matching the GSAP eases named in docs/03. */
export const power2In = (t: number): number => t * t
export const power2Out = (t: number): number => 1 - (1 - t) * (1 - t)
export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)
export const smooth01 = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
