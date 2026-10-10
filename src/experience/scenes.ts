// The scene table from docs/05-scroll-timeline.md, encoded as data.
// Everything that differs per beat lives here. The master timeline, the
// presence weights, the ground grade, fog, lights and post values are all
// generated from this table. Do not hand-copy these numbers elsewhere.

export type SceneId =
  | 'opening'
  | 'hero'
  | 'cap'
  | 'ionized'
  | 'alkaline'
  | 'clean'
  | 'minerals'
  | 'standard'
  | 'spotlight'
  | 'tomorrow'
  | 'pack'
  | 'waterfall'
  | 'facets'
  | 'underwater'
  | 'closing'

/**
 * Generated backdrops (scripts/gen-assets.mjs). Served as /bg/<id>-2560.webp and
 * /bg/<id>-1440.webp, all 2752x1536. A beat whose file is missing holds its ground.
 */
export type BackdropId =
  | 'hero'
  | 'cap'
  | 'ionized'
  | 'alkaline'
  | 'clean'
  | 'minerals'
  | 'standard'
  | 'spotlight'
  | 'tomorrow'
  | 'pack'
  | 'waterfall'
  | 'facets'
  | 'underwater'
  | 'closing'

/** Which environment map the glass reflects in this beat. */
export type EnvLook = 'void' | 'mountain' | 'teal' | 'pale' | 'highkey' | 'spotlight' | 'studio' | 'underwater'

export type BottleMode = 'hidden' | 'live'

export type TypeSide = 'left' | 'right' | 'center' | null

/**
 * Cover fit of a backdrop in a layout: the backdrop point `uv` (origin top-left)
 * is pinned at `at` (fraction of the fitted frame, origin top-left), magnified by
 * `zoom` (>= 1). The fit is clamped so the picture always covers the frame, so a
 * pin near an edge may not land exactly. Ken Burns adds up to +6% across the beat.
 */
export type Framing = {
  uv: readonly [number, number]
  at: readonly [number, number]
  zoom: number
}

const fr = (uv: readonly [number, number], at: readonly [number, number] = [0.5, 0.5], zoom = 1): Framing => ({ uv, at, zoom })
const CENTER = fr([0.5, 0.5])

export type SceneLook = {
  /** Clear color, fog color and grade ground. sRGB hex, identical to the CSS token. */
  ground: string
  /** THREE.FogExp2 density. */
  fog: number
  /** Multipliers on the hero light rig (06-bottle-3d.md). */
  key: number
  rim: number
  fill: number
  /** Tone mapping exposure. */
  exposure: number
  /** Bloom intensity (threshold 0.85, radius 0.4 are global). */
  bloom: number
  /** Chromatic aberration offset. */
  aberration: number
  /** Vignette darkness 0..1. */
  vignette: number
  /** Global dust density multiplier 0..1 (1 = 180 motes on high). */
  dust: number
  /** Fog card opacity multiplier (1 = the baseline 0.08–0.16). */
  fogCards: number
  env: EnvLook
}

export type SceneDef = {
  id: SceneId
  /** "01"…"13", null for opening and closing. */
  index: string | null
  t0: number
  dur: number
  vh: { desktop: number; mobile: number }
  /** Local progress of the hold frame that must match the reference. */
  hold: number
  bottle: BottleMode
  /** Generated backdrop drawn behind this beat, if any. */
  backdrop: BackdropId | null
  /** Cover fit of the backdrop per layout (tablet uses desktop). */
  framing: { desktop: Framing; mobile: Framing }
  typeColor: 'white' | 'ink'
  typeSide: TypeSide
  hasType: boolean
  /** Pointer gains on the bottle (radians at full deflection). */
  gainYaw: number
  gainPitch: number
  /** Local progress where this beat starts dissolving into the next (default 0.82). */
  outStart: number
  /** Local progress where this beat has fully arrived from the previous one (default 0.18). */
  inEnd: number
  look: SceneLook
  /** Reference image, for the debug overlay and QA only. */
  reference: string | null
  /** Accessible title announced once when the scene becomes active. */
  title: string
}

const DARK: Omit<SceneLook, 'ground' | 'fog' | 'key' | 'rim' | 'fill' | 'env'> = {
  exposure: 1,
  bloom: 0.32,
  aberration: 0.0006,
  vignette: 0.45,
  dust: 1,
  fogCards: 1,
}

const DEFS: readonly Omit<SceneDef, 't0'>[] = [
  {
    id: 'opening',
    index: null,
    dur: 8,
    // No scroll of its own: the landing viewport is the hero hold, so the film starts at hero.t0.
    // The drop and ripple assets stay reachable through ?t= for the lookdev and the harness.
    vh: { desktop: 0, mobile: 0 },
    hold: 0.5,
    bottle: 'hidden',
    backdrop: null,
    framing: { desktop: CENTER, mobile: CENTER },
    typeColor: 'white',
    typeSide: null,
    hasType: false,
    gainYaw: 0.06,
    gainPitch: 0.04,
    // the dissolve into the hero is complete at hero.t0, so scroll 0 shows the hero at full presence
    outStart: 1,
    inEnd: 0.18,
    look: { ...DARK, ground: '#070E14', fog: 0.06, key: 0.1, rim: 0.2, fill: 0, vignette: 0.7, dust: 0.5, env: 'void' },
    reference: null,
    title: 'Opening',
  },
  {
    id: 'hero',
    index: '01',
    dur: 14,
    // a short hold, then straight on: the first fifth holds the landing frame, the rest is the move to the cap
    vh: { desktop: 75, mobile: 65 },
    hold: 0.1,
    bottle: 'live',
    backdrop: 'hero',
    // the wet slab top in the right third carries the bottle; the mountains and sky stay behind the type
    framing: { desktop: fr([0.74, 0.66], [0.74, 0.7], 1.2), mobile: fr([0.72, 0.66], [0.5, 0.75], 1.15) },
    typeColor: 'white',
    typeSide: 'left',
    hasType: true,
    gainYaw: 0.05,
    gainPitch: 0.03,
    outStart: 0.25,
    inEnd: 0,
    look: { ...DARK, ground: '#070E14', fog: 0.045, key: 1, rim: 1, fill: 1, env: 'mountain' },
    reference: '01-hero.png',
    title: 'IONA. Water, reimagined. You choose what fills your day. Give a little thought to what fills your glass.',
  },
  {
    id: 'cap',
    index: '02',
    dur: 8,
    vh: { desktop: 100, mobile: 90 },
    hold: 0.55,
    bottle: 'live',
    backdrop: 'cap',
    framing: { desktop: fr([0.5, 0.45]), mobile: fr([0.5, 0.45]) },
    typeColor: 'white',
    typeSide: 'left',
    hasType: true,
    gainYaw: 0.03,
    gainPitch: 0.02,
    outStart: 0.75,
    inEnd: 0.12,
    look: { ...DARK, ground: '#070E14', fog: 0.08, key: 0.6, rim: 1.6, fill: 0.2, vignette: 0.7, dust: 0.6, fogCards: 0.8, env: 'void' },
    reference: '02-cap-closeup.png',
    title: 'Before the first sip, there’s a first impression.',
  },
  {
    id: 'ionized',
    index: '03',
    dur: 9,
    vh: { desktop: 100, mobile: 90 },
    hold: 0.55,
    bottle: 'hidden',
    backdrop: 'ionized',
    // the picture is mirrored on derive (gen-assets `flop`): the bubble column sits at uv x ≈ 0.8
    framing: { desktop: fr([0.6, 0.5]), mobile: fr([0.8, 0.42], [0.5, 0.36]) },
    typeColor: 'white',
    typeSide: 'left',
    hasType: true,
    gainYaw: 0.06,
    gainPitch: 0.04,
    outStart: 0.8,
    inEnd: 0.22,
    look: { ...DARK, ground: '#01151E', fog: 0.03, key: 0.4, rim: 0.8, fill: 0.3, fogCards: 0.5, env: 'teal' },
    reference: '03-ionized.png',
    title: 'Look closer. There’s a story inside.',
  },
  {
    id: 'alkaline',
    index: '04',
    dur: 12,
    vh: { desktop: 160, mobile: 125 },
    hold: 0.55,
    bottle: 'live',
    backdrop: 'alkaline',
    framing: { desktop: CENTER, mobile: CENTER },
    typeColor: 'ink',
    typeSide: 'left',
    hasType: true,
    gainYaw: 0.05,
    gainPitch: 0.035,
    outStart: 0.82,
    inEnd: 0.18,
    look: {
      ...DARK,
      ground: '#C9D6DE',
      fog: 0.012,
      key: 1.4,
      rim: 1.3,
      fill: 1.2,
      exposure: 1.08,
      bloom: 0.22,
      dust: 0.22,
      fogCards: 0.15,
      // a white studio with black flags (env.ts): on the pale ground the glass needs dark edges and the cap
      // must stay black, as in a high-key product photograph
      env: 'highkey',
    },
    reference: '04-alkaline.png',
    title: 'Alkaline, pH 8.5+, for natural balance.',
  },
  {
    id: 'clean',
    index: '05',
    dur: 9,
    vh: { desktop: 120, mobile: 100 },
    hold: 0.55,
    bottle: 'hidden',
    backdrop: 'clean',
    framing: { desktop: fr([0.45, 0.5]), mobile: fr([0.3, 0.45]) },
    typeColor: 'white',
    typeSide: 'right',
    hasType: true,
    gainYaw: 0.06,
    gainPitch: 0.04,
    outStart: 0.82,
    inEnd: 0.22,
    look: { ...DARK, ground: '#031820', fog: 0.035, key: 0.7, rim: 1.1, fill: 0.4, fogCards: 0.6, env: 'teal' },
    reference: '05-clean-pure.png',
    title: 'Clean and pure. Multi-stage purification.',
  },
  {
    id: 'minerals',
    index: '06',
    dur: 11,
    vh: { desktop: 150, mobile: 117 },
    hold: 0.5,
    bottle: 'hidden',
    backdrop: 'minerals',
    framing: { desktop: fr([0.5, 0.45]), mobile: fr([0.5, 0.4]) },
    typeColor: 'white',
    typeSide: 'left',
    hasType: true,
    gainYaw: 0.06,
    gainPitch: 0.04,
    outStart: 0.82,
    inEnd: 0.25,
    look: { ...DARK, ground: '#0D1A22', fog: 0.04, key: 0.5, rim: 0.4, fill: 0.5, dust: 0.4, fogCards: 1.2, env: 'mountain' },
    reference: '06-essential-minerals.png',
    title: 'Essential minerals, naturally balanced for a healthier you.',
  },
  {
    id: 'standard',
    index: '07',
    dur: 8,
    vh: { desktop: 110, mobile: 100 },
    hold: 0.5,
    bottle: 'hidden',
    backdrop: 'standard',
    // the new plate (storyboard slide 8): one smooth wave curling in from the right; its crest catches the light
    framing: { desktop: fr([0.66, 0.5], [0.64, 0.5]), mobile: fr([0.74, 0.47], [0.5, 0.36], 1.05) },
    typeColor: 'white',
    typeSide: 'left',
    hasType: true,
    gainYaw: 0.06,
    gainPitch: 0.04,
    outStart: 0.85,
    inEnd: 0.18,
    look: { ...DARK, ground: '#041016', fog: 0.04, key: 0.4, rim: 0.6, fill: 0.3, dust: 0.3, fogCards: 0.4, env: 'void' },
    reference: '07-higher-standard.png',
    title: 'A higher standard of water.',
  },
  {
    id: 'spotlight',
    index: '08',
    dur: 8,
    vh: { desktop: 100, mobile: 90 },
    hold: 0.55,
    bottle: 'live',
    backdrop: 'spotlight',
    framing: { desktop: CENTER, mobile: fr([0.5, 0.4]) },
    typeColor: 'white',
    typeSide: 'left',
    hasType: true,
    gainYaw: 0.03,
    gainPitch: 0.02,
    outStart: 0.82,
    inEnd: 0.2,
    look: {
      ...DARK,
      ground: '#05070C',
      fog: 0.05,
      key: 0.2,
      rim: 0.5,
      fill: 0.1,
      bloom: 0.5,
      vignette: 0.6,
      dust: 0.3,
      fogCards: 0.3,
      env: 'spotlight',
    },
    reference: '08-spotlight-cap.png',
    title: 'Made to catch the light. Designed to hold your attention.',
  },
  {
    id: 'tomorrow',
    index: '09',
    dur: 10,
    vh: { desktop: 110, mobile: 95 },
    hold: 0.55,
    bottle: 'live',
    backdrop: 'tomorrow',
    framing: { desktop: fr([0.55, 0.5]), mobile: CENTER },
    typeColor: 'white',
    typeSide: 'right',
    hasType: true,
    gainYaw: 0.06,
    gainPitch: 0.04,
    outStart: 0.82,
    inEnd: 0.2,
    look: { ...DARK, ground: '#0B1220', fog: 0.03, key: 0.8, rim: 1.4, fill: 0.4, dust: 0.8, fogCards: 0.5, env: 'void' },
    reference: '09-brighter-tomorrow.png',
    title: 'Some moments deserve your full attention.',
  },
  {
    id: 'pack',
    index: '10',
    dur: 10,
    vh: { desktop: 80, mobile: 75 },
    hold: 0.5,
    bottle: 'live',
    backdrop: 'pack',
    framing: { desktop: fr([0.5, 0.55]), mobile: fr([0.35, 0.5]) },
    typeColor: 'white',
    typeSide: 'left',
    hasType: true,
    gainYaw: 0.04,
    gainPitch: 0.025,
    outStart: 0.82,
    inEnd: 0.18,
    // the carton picture is a dark navy studio, so the set is dark too (the pale studio of the storyboard is gone)
    look: {
      ...DARK,
      ground: '#0B1220',
      fog: 0.03,
      key: 1.0,
      rim: 1.2,
      fill: 0.4,
      exposure: 1,
      bloom: 0.3,
      vignette: 0.45,
      dust: 0.4,
      fogCards: 0.3,
      env: 'studio',
    },
    reference: '10-product-pack.png',
    title: 'The IONA carton and bottle.',
  },
  {
    id: 'waterfall',
    index: '11',
    dur: 9,
    vh: { desktop: 80, mobile: 75 },
    hold: 0.5,
    bottle: 'live',
    backdrop: 'waterfall',
    // the bottle stands on the slab top at the center; the thin falls stay below it
    framing: { desktop: fr([0.5, 0.62], [0.5, 0.7], 1.15), mobile: fr([0.5, 0.62], [0.5, 0.75], 1.15) },
    typeColor: 'white',
    typeSide: 'left',
    hasType: true,
    gainYaw: 0.02,
    gainPitch: 0.015,
    outStart: 0.8,
    inEnd: 0.25,
    look: { ...DARK, ground: '#070E14', fog: 0.045, key: 0.9, rim: 1.2, fill: 0.4, env: 'mountain' },
    reference: '11-waterfall-bottle.png',
    title: 'The bottle on wet black rock, under falling water.',
  },
  {
    id: 'facets',
    index: '12',
    dur: 7,
    vh: { desktop: 70, mobile: 70 },
    hold: 0.5,
    bottle: 'live',
    backdrop: 'facets',
    framing: { desktop: CENTER, mobile: CENTER },
    typeColor: 'white',
    typeSide: 'right',
    hasType: true,
    gainYaw: 0.06,
    gainPitch: 0.04,
    outStart: 0.8,
    inEnd: 0.3,
    look: {
      ...DARK,
      ground: '#9AA8B2',
      fog: 0.02,
      key: 0.6,
      rim: 1.4,
      fill: 0.5,
      bloom: 0.5,
      aberration: 0.0016,
      dust: 0.07,
      fogCards: 0.1,
      env: 'pale',
    },
    reference: '12-crystal-facets.png',
    title: 'Crystal facets. A pause.',
  },
  {
    id: 'underwater',
    index: '13',
    dur: 12,
    vh: { desktop: 85, mobile: 80 },
    hold: 0.55,
    bottle: 'live',
    backdrop: 'underwater',
    // the god rays fall from the top center; the bottle hangs center-right below them
    framing: { desktop: fr([0.52, 0.5]), mobile: fr([0.5, 0.45]) },
    typeColor: 'white',
    typeSide: 'left',
    hasType: true,
    gainYaw: 0.06,
    gainPitch: 0.04,
    outStart: 0.78,
    inEnd: 0.2,
    look: {
      ...DARK,
      ground: '#022332',
      fog: 0.08,
      key: 0.3,
      rim: 1.1,
      fill: 0.2,
      bloom: 0.4,
      vignette: 0.55,
      dust: 0.3,
      fogCards: 0.2,
      env: 'underwater',
    },
    reference: '13-underwater.png',
    title: 'Submerged. Bubbles rise toward the light.',
  },
  {
    id: 'closing',
    index: null,
    dur: 8,
    vh: { desktop: 120, mobile: 100 },
    hold: 0.6,
    bottle: 'hidden',
    backdrop: 'closing',
    framing: { desktop: CENTER, mobile: CENTER },
    typeColor: 'white',
    typeSide: 'center',
    hasType: true,
    gainYaw: 0.06,
    gainPitch: 0.04,
    outStart: 1,
    inEnd: 0.2,
    look: { ...DARK, ground: '#070E14', fog: 0.02, key: 0.15, rim: 0.2, fill: 0, vignette: 0.7, dust: 0.5, env: 'void' },
    reference: null,
    title: 'IONA. Water, reimagined.',
  },
]

/**
 * Beats left out of the film. The story copy of 10 October 2026 holds the water-detail sections
 * (alkaline, clarity and purification, minerals) until the formulation, testing and mineral details
 * they link to are confirmed; the wave ("a higher standard") has no part in that story, and the
 * closing moved to the final scene after the range (dom/Invitation.tsx). Each keeps its definition,
 * so publishing one again is removing it from this list.
 */
const UNPUBLISHED: ReadonlySet<SceneId> = new Set<SceneId>(['alkaline', 'clean', 'minerals', 'standard', 'closing'])

/** The film: the published beats, back to back on the virtual clock. */
export const SCENES: readonly SceneDef[] = (() => {
  let t0 = 0
  return DEFS.filter((s) => !UNPUBLISHED.has(s.id)).map((s) => {
    const scene = { ...s, t0 }
    t0 += s.dur
    return scene
  })
})()

export const FILM_DURATION = SCENES.reduce((t, s) => t + s.dur, 0)

/** True when a beat is in the film. */
export const isPublished = (id: SceneId): boolean => !UNPUBLISHED.has(id)

/** Every beat id, published or not (film.presence keeps a 0 for the unpublished). */
export const SCENE_IDS = DEFS.map((s) => s.id) as readonly SceneId[]

/** Index of the first beat that owns scroll: where the film stands at scroll 0. */
export const FIRST_SCENE_INDEX = Math.max(
  0,
  SCENES.findIndex((s) => s.vh.desktop > 0 || s.vh.mobile > 0),
)

/** An unpublished beat starts at infinity: nothing on the clock ever reaches it. */
export const SCENE_BY_ID: Readonly<Record<SceneId, SceneDef>> = Object.fromEntries(
  DEFS.map((s) => [s.id, SCENES.find((p) => p.id === s.id) ?? { ...s, t0: Number.POSITIVE_INFINITY }]),
) as Record<SceneId, SceneDef>

export const t1 = (s: SceneDef): number => s.t0 + s.dur

/** The framing a scene uses in a layout (tablet uses the desktop column). */
export function sceneFraming(id: SceneId, mobile: boolean): Framing {
  const f = SCENE_BY_ID[id].framing
  return mobile ? f.mobile : f.desktop
}

/** Sum of the vh column for a layout. Desktop and tablet use the desktop column. */
export function storyVh(mobile: boolean): number {
  return SCENES.reduce((sum, s) => sum + (mobile ? s.vh.mobile : s.vh.desktop), 0)
}

/** Scene index (0..14) containing virtual time t. */
export function sceneIndexAt(t: number): number {
  for (let i = SCENES.length - 1; i >= 0; i--) if (t >= SCENES[i].t0) return i
  return 0
}

export function sceneAt(t: number): SceneDef {
  return SCENES[sceneIndexAt(t)]
}

/** Unclamped local progress of scene `id` at virtual time t. */
export function localOf(id: SceneId, t: number): number {
  const s = SCENE_BY_ID[id]
  return (t - s.t0) / s.dur
}

/**
 * Piecewise-linear scroll mapping. Each scene owns its own vh of scroll, so the
 * edit timing in 05-scroll-timeline.md holds on desktop and on mobile.
 * `progress` is scroll progress through #story (0..1).
 */
export function progressToTime(progress: number, mobile: boolean): number {
  const total = storyVh(mobile)
  let at = Math.min(Math.max(progress, 0), 1) * total
  for (const s of SCENES) {
    const vh = mobile ? s.vh.mobile : s.vh.desktop
    // a beat without scroll of its own (the opening) is skipped: scroll 0 lands on the next beat
    if (vh <= 0) continue
    if (at <= vh) return s.t0 + (at / vh) * s.dur
    at -= vh
  }
  return FILM_DURATION
}

/** Inverse of progressToTime. */
export function timeToProgress(t: number, mobile: boolean): number {
  const total = storyVh(mobile)
  let acc = 0
  for (const s of SCENES) {
    const vh = mobile ? s.vh.mobile : s.vh.desktop
    if (vh <= 0) continue
    if (t <= s.t0 + s.dur) return (acc + (Math.max(t - s.t0, 0) / s.dur) * vh) / total
    acc += vh
  }
  return 1
}

/**
 * Dissolve window between scene i and scene i+1, in virtual seconds:
 * from outStart of the outgoing scene to inEnd of the incoming one.
 */
export function dissolveWindow(i: number): readonly [number, number] {
  const a = SCENES[i]
  const b = SCENES[i + 1]
  return [a.t0 + a.outStart * a.dur, b.t0 + b.inEnd * b.dur]
}
