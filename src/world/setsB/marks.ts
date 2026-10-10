import { SCENES, SCENE_BY_ID, dissolveWindow, type SceneId } from '../../experience/scenes'

// Scene marks of the spotlight and underwater sets (docs/scenes/07, 08, 09,
// 12, 13, 14). Every envelope is a pure function of the film time, so a
// backward scrub reverses it exactly.

/** Virtual time of a scene's local progress mark. */
export const at = (id: SceneId, local: number): number => SCENE_BY_ID[id].t0 + local * SCENE_BY_ID[id].dur

export function smooth(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

const indexOf = (id: SceneId): number => SCENES.findIndex((s) => s.id === id)

// --- Spotlight beams --------------------------------------------------------

/** Born at the end of the beat before (ionized local 0.85) at intensity 0, full by spotlight local 0.25. */
const BEAM_BORN = at('ionized', 0.85)
const BEAM_FULL = at('spotlight', 0.25)
/** Fade with the spotlight → tomorrow dissolve; gone by tomorrow local 0.2. */
const BEAM_FADE = at('spotlight', 0.82)
const BEAM_GONE = at('tomorrow', 0.2)

export function beamEnvelope(t: number): number {
  // a slow start, so the beams are a rumour at the end of the wave and strengthen in the spotlight
  const born = smooth(BEAM_BORN, BEAM_FULL, t)
  return born * born * (3 - 2 * born) * (1 - smooth(BEAM_FADE, BEAM_GONE, t))
}

/** Beam light sources (docs/07 Beams): y = 6, x positions, aimed at the cap. */
export const BEAM_Y = 6
export const BEAM_X: readonly [number, number, number] = [-0.9, 0, 0.7]
/** The beams stand behind the bottle: the cap picks them up from above and behind. */
export const BEAM_Z = -1.1
/** Target sway: ±0.15 on x, periods 7 / 9 / 11 s, phases offset. */
export const SWAY_AMP = 0.15
export const SWAY_PERIOD: readonly [number, number, number] = [7, 9, 11]
export const SWAY_PHASE: readonly [number, number, number] = [0, 2.2, 4.1]

/** Slow intensity drift of beam i, 0.72..1 (two incommensurate sines; it never blinks). */
export function beamDrift(i: number, elapsed: number): number {
  const a = Math.sin((elapsed / (6.3 + i * 1.7)) * Math.PI * 2 + SWAY_PHASE[i] * 1.3)
  const b = Math.sin((elapsed / (10.9 + i * 2.3)) * Math.PI * 2 + SWAY_PHASE[i] * 0.7)
  return 0.86 + 0.09 * a + 0.05 * b
}

export function beamSway(i: number, elapsed: number): number {
  return SWAY_AMP * Math.sin((elapsed / SWAY_PERIOD[i]) * Math.PI * 2 + SWAY_PHASE[i])
}

// --- Underwater --------------------------------------------------------------

/** The waterline: the surface plane (docs/scenes/13). */
export const SURFACE_Y = 1.15

const [UW_IN_A, UW_IN_B] = dissolveWindow(indexOf('facets'))

/** Facets → underwater dissolve weight: the surface fades in as the facets darken. */
export function underwaterIn(t: number): number {
  return smooth(UW_IN_A, UW_IN_B, t)
}

/**
 * The exit, in underwater local progress (docs/scenes/13 Transition): the bubbles fade first, then the
 * shafts and the caustics, then the surface. Underwater is the film's last beat now (the closing moved to
 * the final scene after the range), so it stays whole to the end of the scroll: the exit starts past it.
 */
export const UW_OUT = {
  bubbles: [1, 1.15],
  shafts: [1, 1.19],
  caustics: [1, 1.19],
  surface: [1.02, 1.22],
  highlight: [1.18, 1.32],
} as const

export function underwaterOut(local: number, mark: keyof typeof UW_OUT): number {
  const [a, b] = UW_OUT[mark]
  return 1 - smooth(a, b, local)
}
