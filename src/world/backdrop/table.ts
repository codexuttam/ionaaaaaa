import { UNDERWATER_MODE } from '../../experience/config'
import { SCENES, type BackdropId, type SceneDef, type SceneId } from '../../experience/scenes'

// What the backdrop does per beat (docs/03 scrims, docs/07 plate shader,
// docs/scenes/*). Times and grounds come from the scene table; this file only
// holds the backdrop's own treatment of each beat.

/** Beats that draw a picture. Underwater draws its picture unless the built tank is live. */
export const BACKDROP_SCENES: readonly SceneDef[] = SCENES.filter(
  (s) => s.backdrop !== null && !(s.id === 'underwater' && UNDERWATER_MODE === 'live'),
)

/** Every backdrop the film draws, once, in film order (hero first). */
export const BACKDROP_LOAD_ORDER: readonly BackdropId[] = BACKDROP_SCENES.reduce<BackdropId[]>((ids, s) => {
  if (s.backdrop && !ids.includes(s.backdrop)) ids.push(s.backdrop)
  return ids
}, [])

/**
 * Side scrim in the scene ground behind the type (desktop and tablet).
 * Full strength from the type edge to `plateau`, feathered to 0 by `feather`
 * (fractions of the viewport width measured from that edge). Enough for crisp
 * type over a photograph, never a dark card.
 */
export type Scrim = { side: 'left' | 'right'; strength: number; plateau: number; feather: number }

export const SCRIMS: Partial<Record<SceneId, Scrim>> = {
  // strengths set by scripts/contrast.mjs: every lockup line clears WCAG AA over the hold frame
  hero: { side: 'left', strength: 0.66, plateau: 0.32, feather: 0.6 },
  cap: { side: 'left', strength: 0.62, plateau: 0.24, feather: 0.5 },
  ionized: { side: 'left', strength: 0.6, plateau: 0.22, feather: 0.52 },
  spotlight: { side: 'left', strength: 0.5, plateau: 0.2, feather: 0.42 },
  alkaline: { side: 'left', strength: 0.5, plateau: 0.2, feather: 0.48 },
  clean: { side: 'right', strength: 0.58, plateau: 0.22, feather: 0.5 },
  minerals: { side: 'left', strength: 0.56, plateau: 0.2, feather: 0.5 },
  standard: { side: 'left', strength: 0.56, plateau: 0.22, feather: 0.54 },
  tomorrow: { side: 'right', strength: 0.56, plateau: 0.2, feather: 0.5 },
  waterfall: { side: 'left', strength: 0.58, plateau: 0.22, feather: 0.52 },
  // the close-up's crystal ground is pale and the underwater light bright: wider, deeper shades (portrait tablets need the width)
  facets: { side: 'right', strength: 0.74, plateau: 0.34, feather: 0.64 },
  underwater: { side: 'left', strength: 0.7, plateau: 0.34, feather: 0.64 },
}

/** How far a picture leans toward the blended ground as its presence falls (dissolve through mist). */
export const DISSOLVE_TINT = 0.5

/** Pointer parallax of the whole picture, backdrop UV at full deflection (docs/scenes/01). */
export const POINTER_UV = 0.005
/** Extra parallax of the bottom of the frame against the top: the ground is near, the sky far. */
export const DEPTH_UV = 0.006
/** A hint of relief from the picture's own tones (very small: edges must never double). */
export const DEPTH_LUM_UV = 0.0012

/** Ken Burns: magnification added across a beat's local progress 0..1. */
export const KEN_BURNS = 0.1

/** Pictures whose water moves: each has public/bg/<id>-flow.png (scripts/flowmaps.mjs). */
export const FLOW_BACKDROPS: readonly BackdropId[] = ['hero', 'waterfall', 'underwater', 'minerals', 'clean', 'tomorrow']

/**
 * Turbulence per picture: [amplitude in picture uv, rate]. A slow boil of the moving parts on top of their
 * flow: a choppy sheet undulates, the underwater ceiling rolls, a river glitters, rays shimmer.
 */
export const FLOW_TURB: Partial<Record<BackdropId, readonly [number, number]>> = {
  hero: [0.0013, 1],
  waterfall: [0.0009, 1],
  underwater: [0.0042, 1.6],
  minerals: [0.0009, 1.2],
  clean: [0.0012, 0.6],
}

/** Moving water in the pictures (material.ts flowingPicture). */
export const FLOW = {
  /** full-scale velocity of a flow map, picture uv per second (VMAX in scripts/flowmaps.mjs) */
  vmax: 0.1,
  /** the farthest a copy travels over one cycle, picture uv (small: a copy never drifts far from the picture) */
  disp: 0.016,
  /** one flow cycle, seconds */
  period: 2.2,
  /** turbulence feature size: water-field tiles per picture height */
  turbScale: 2.2,
  /** glint size: water-field tiles per picture unit across and along the flow (finer across, stretched along) */
  glintK: [26, 9] as const,
  /** speeds (uv/s) across which water counts as falling */
  fallSpeed: [0.022, 0.034] as const,
  /** time-of-flight change per picture height, for the mip level of the streaks */
  tauSlope: 2.6,
  /** streak layers: [across, along] frequency in water-field tiles; along runs on the time of flight */
  k1: [6, 0.5] as const,
  k2: [10, 0.8] as const,
  k3: [3, 0.35] as const,
  /** fall rate of each layer, tiles per second */
  rate: [0.44, 0.9, 0.24] as const,
  /** a streak multiplies the water by shade[0] + shade[1]·streak */
  shade: [0.62, 0.8] as const,
  /** linear light added on the brightest streaks */
  tint: '#7d93ad',
  tintScale: 0.06,
} as const

/**
 * The water at the bottle's base where it stands in a picture (material.ts bottleWater). Strengths per
 * beat: [contact shade, reflection, bow and wake foam, waterline]; mask: only on the picture's moving
 * water (the hero stands in the stream; the waterfall bottle stands on wet rock, shaded everywhere round it).
 */
export const BOTTLE_WATER = {
  // the hero stream runs right to left and toward the camera (scripts/flowmaps.mjs, the slab sheet)
  hero: { strength: [0.75, 0.34, 1, 0.45] as const, mask: 1, down: [-0.86, 0.5] as const, foamSpeed: 0.32, ripple: 1 },
  // on wet rock: only the shade where the glass meets the stone (a reflection would run down the rock face below)
  waterfall: { strength: [0.85, 0, 0, 0] as const, mask: 0, down: [0, 1] as const, foamSpeed: 0, ripple: 0 },
  /** widest body radius over the base radius (geometry BODY_RINGS: the body 0.436 / the foot 0.39 at the waterline) */
  bodyOverBase: 0.436 / 0.39,
  /** the glass, label and cap as the water sees them (sRGB) */
  glass: '#8fa5b6',
  label: '#d9dcdc',
  cap: '#0b0d10',
  foam: '#dfe8ee',
  foamScale: 0.6,
  waterline: '#e8f0f5',
  waterlineScale: 0.3,
} as const

/**
 * Glints on the slow water per picture: [strength, speed along the flow in tiles of the water field per
 * second]. Sparkles that travel down a river or a ribbon read as flowing water while the picture stays sharp.
 */
export const FLOW_GLINT: Partial<Record<BackdropId, readonly [number, number]>> = {
  hero: [0.55, 0.9],
  minerals: [1.5, 0.7],
  tomorrow: [1.1, 0.55],
  underwater: [0.5, 0.4],
}

/**
 * Macro wave pictures (material.ts wavePicture), storyboard slide 8: how far the slow sines carry the
 * picture (picture uv), the light that travels the crest, the sparkle on it, the swells on the calm water.
 */
export const WAVE: Partial<Record<BackdropId, { breathe: number; light: number; sparkle: number; swell: number }>> = {
  standard: { breathe: 0.0042, light: 0.55, sparkle: 0.9, swell: 0.05 },
}

/** Seconds for the light to travel the crest once (docs/scenes/07: about nine). */
export const WAVE_LIGHT_PERIOD = 9

/** Seconds the film clock wraps at in the backdrop shader (float precision). */
export const FLOW_CLOCK_WRAP = 4096

/** Mobile: the picture fills the top 80% and fades into the ground across these viewport heights. */
export const MOBILE_FEATHER: readonly [number, number] = [0.62, 0.8]

/** Per-beat darkening of the picture (the live cap must stay the brightest thing in the macro). */
export const DARKEN: Partial<Record<SceneId, number>> = {
  cap: 0.22,
  spotlight: 0.1,
  // the crystal photograph behind the facet detail would compete with the glass; held down, the bottle's own
  // facets and polished edges carry the frame
  facets: 0.38,
}

/**
 * Alkaline beat: the backlight sits this far (screen uv) right of and above the
 * bottle's shoulder, as the glow around the cap in 04-alkaline.png.
 */
export const ALKALINE_GLOW: readonly [number, number] = [0.04, 0.15]

/**
 * Pack beat: the studio wall stands this far behind the set (world z). The sweep
 * reaches the horizon tone where the floor (y = FLOOR_Y, drawn by the carton)
 * meets it, so the seam follows the live camera.
 */
export const PACK_WALL_Z = -4

/**
 * Pack beat: where the softbox lights the wall (world x, y on PACK_WALL_Z), just
 * left of the bottle at the hold as in 10-product-pack.png. Mobile frames the pair
 * differently, so it has its own x.
 */
export const PACK_KEY = { x: { desktop: 1.35, mobile: 0.75 }, y: 1.6 } as const
