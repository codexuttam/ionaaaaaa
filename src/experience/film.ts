import * as THREE from 'three'
import { FILM_DURATION, FIRST_SCENE_INDEX, SCENES, SCENE_IDS, dissolveWindow, sceneIndexAt, type SceneDef, type SceneId } from './scenes'

// The film runtime. One mutable singleton read by every frame consumer.
// The driver (timeline.ts / Experience.tsx) calls `advanceFilm` once per frame,
// before any scene component runs. Components never write to it.

export type Layout = 'desktop' | 'tablet' | 'mobile'
export type Tier = 'high' | 'med' | 'low'

export type BlendedLook = {
  /** Linear-RGB ground (clear color and fog color), lerped through dissolves. */
  ground: THREE.Color
  /** Linear-RGB legibility colour behind the type, lerped through dissolves. */
  scrim: THREE.Color
  fog: number
  key: number
  rim: number
  fill: number
  exposure: number
  bloom: number
  aberration: number
  vignette: number
  dust: number
  fogCards: number
  gainYaw: number
  gainPitch: number
}

type SceneListener = (next: SceneDef, prev: SceneDef | null) => void

const smooth = (a: number, b: number, x: number): number => {
  if (b <= a) return x >= b ? 1 : 0
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

const groundLinear = SCENES.map((s) => new THREE.Color(s.look.ground)) // THREE.Color parses hex as sRGB and stores linear

/**
 * The colour the legibility scrims fade toward in each beat (dom/Legibility.tsx, the phone
 * scrim, the hero notes). Ink beats keep their pale ground. White-type beats use their ground
 * darkened until its luminance is at most 0.012, so white text on it clears 4.5:1 with room to
 * spare (the facets ground is a pale grey on which white type only reaches 2.3:1).
 */
const MAX_SCRIM_LUMINANCE = 0.012
const scrimLinear = SCENES.map((s, i) => {
  const c = groundLinear[i].clone()
  if (s.typeColor === 'ink') return c
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  return l > MAX_SCRIM_LUMINANCE ? c.multiplyScalar(MAX_SCRIM_LUMINANCE / l) : c
})

export const film = {
  /** Smoothed virtual time on the master timeline, seconds 0..143. Scroll owns it. */
  time: 0,
  /** Unsmoothed virtual time implied by the current scroll position. */
  targetTime: 0,
  /** time / 143 */
  progress: 0,
  /** Clock for loops (water, bubbles, glints). Pauses while the tab is hidden. */
  elapsed: 0,
  /** Clamped frame delta in seconds (max 1/20). */
  delta: 1 / 60,
  sceneIndex: FIRST_SCENE_INDEX,
  scene: SCENES[FIRST_SCENE_INDEX] as SceneDef,
  /** 0..1 visibility weight of each scene; the two sides of a dissolve sum to 1. */
  presence: Object.fromEntries(SCENE_IDS.map((id) => [id, id === SCENES[FIRST_SCENE_INDEX].id ? 1 : 0])) as Record<SceneId, number>,
  /** Unclamped local progress of each scene: (time - t0) / dur. */
  local: Object.fromEntries(SCENE_IDS.map((id) => [id, 0])) as Record<SceneId, number>,
  look: {
    ground: groundLinear[0].clone(),
    scrim: scrimLinear[0].clone(),
    fog: SCENES[0].look.fog,
    key: SCENES[0].look.key,
    rim: SCENES[0].look.rim,
    fill: SCENES[0].look.fill,
    exposure: 1,
    bloom: SCENES[0].look.bloom,
    aberration: SCENES[0].look.aberration,
    vignette: SCENES[0].look.vignette,
    dust: SCENES[0].look.dust,
    fogCards: SCENES[0].look.fogCards,
    gainYaw: SCENES[0].gainYaw,
    gainPitch: SCENES[0].gainPitch,
  } as BlendedLook,
  layout: 'desktop' as Layout,
  /** True below 760px wide. */
  mobile: false,
  width: typeof window === 'undefined' ? 1440 : window.innerWidth,
  height: typeof window === 'undefined' ? 900 : window.innerHeight,
  tier: 'high' as Tier,
  debug: false,
  /** ?debug=1 registration sliders: multipliers on plate opacity and bottle presence. */
  debugPlate: 1,
  debugBottle: 1,
  /** A/B switches for measuring (?flow=0, ?wet=0): the moving water in the pictures, the water on the glass. */
  liveWater: { flow: true, wet: true },
  /** True once materials are compiled and the first frame has rendered. */
  ready: false,
  /** Assets still loading (plates, label fonts). Loaders increment and decrement it. */
  pending: 0,
  /** How far the loading has come, 0..1, raised by the warm-up as it passes each step (dom/Loader.tsx draws it). */
  load: { target: 0 },
  /** True once the loader has lifted (landing.ts REVEAL_EVENT). */
  revealed: false,
  /**
   * 0..1: the bottle coming in after the loader (Experience.tsx BottleRig). 1 = in place. A hero landing
   * starts at 0; deep links, the harness and the still renders start at 1.
   */
  entrance: 1,
  /** True when the visitor arrived by deep link: the opening drop sound is skipped. */
  arrivedMidFilm: false,
}

const listeners = new Set<SceneListener>()

export function onSceneChange(fn: SceneListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

type FrameListener = () => void
const frameListeners = new Set<FrameListener>()

/**
 * Per-frame hook for DOM layers that move with the film (kinetic captions, the hero
 * word rotator). Called by the driver after the film state and the pointer are
 * advanced, before the render. Listeners write styles directly, never React state.
 */
export function onFrame(fn: FrameListener): () => void {
  frameListeners.add(fn)
  return () => frameListeners.delete(fn)
}

export function runFrameListeners(): void {
  frameListeners.forEach((fn) => fn())
}

export function setLayout(width: number, height: number): void {
  film.width = width
  film.height = height
  film.mobile = width <= 759
  film.layout = width <= 759 ? 'mobile' : width <= 1099 ? 'tablet' : 'desktop'
}

/** Presence weight of scene i at time t. */
export function presenceAt(i: number, t: number): number {
  const rampIn = i === 0 ? 1 : smooth(...dissolveWindow(i - 1), t)
  const rampOut = i === SCENES.length - 1 ? 1 : 1 - smooth(...dissolveWindow(i), t)
  return rampIn * rampOut
}

/**
 * Advance the film by one frame. `time` is the smoothed timeline playhead,
 * `dt` the raw frame delta in seconds. Called by the driver only.
 */
export function advanceFilm(time: number, dt: number, hidden = false): void {
  const t = Math.min(Math.max(time, 0), FILM_DURATION)
  film.time = t
  film.progress = t / FILM_DURATION
  film.delta = Math.min(Math.max(dt, 0), 1 / 20)
  if (!hidden) film.elapsed += film.delta

  const look = film.look
  look.ground.setRGB(0, 0, 0)
  look.scrim.setRGB(0, 0, 0)
  look.fog = look.key = look.rim = look.fill = 0
  look.exposure = look.bloom = look.aberration = look.vignette = look.dust = look.fogCards = 0
  look.gainYaw = look.gainPitch = 0

  for (let i = 0; i < SCENES.length; i++) {
    const s = SCENES[i]
    const p = presenceAt(i, t)
    film.presence[s.id] = p
    film.local[s.id] = (t - s.t0) / s.dur
    if (p <= 0) continue
    const g = groundLinear[i]
    look.ground.r += g.r * p
    look.ground.g += g.g * p
    look.ground.b += g.b * p
    const sc = scrimLinear[i]
    look.scrim.r += sc.r * p
    look.scrim.g += sc.g * p
    look.scrim.b += sc.b * p
    look.fog += s.look.fog * p
    look.key += s.look.key * p
    look.rim += s.look.rim * p
    look.fill += s.look.fill * p
    look.exposure += s.look.exposure * p
    look.bloom += s.look.bloom * p
    look.aberration += s.look.aberration * p
    look.vignette += s.look.vignette * p
    look.dust += s.look.dust * p
    look.fogCards += s.look.fogCards * p
    look.gainYaw += s.gainYaw * p
    look.gainPitch += s.gainPitch * p
  }

  const idx = sceneIndexAt(t)
  if (idx !== film.sceneIndex) {
    const prev = film.scene
    film.sceneIndex = idx
    film.scene = SCENES[idx]
    listeners.forEach((fn) => fn(film.scene, prev))
  }
}

/** Clamp01 local progress of a scene. */
export const local01 = (id: SceneId): number => Math.min(Math.max(film.local[id], 0), 1)

/** Smoothstep-ramped value of `x` between a and b. Shared easing for scene components. */
export const ramp = smooth

/** True when scene `id` contributes anything to the current frame. */
export const isLive = (id: SceneId): boolean => film.presence[id] > 0.0001
