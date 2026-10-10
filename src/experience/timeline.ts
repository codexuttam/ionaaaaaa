import gsap from 'gsap'
import { FILM_DURATION, SCENES, SCENE_BY_ID, isPublished, type SceneId } from './scenes'
import { film } from './film'
import { rig, type BottlePose, type CameraPose, type LightPose } from './rig'
import { placeBottle, type Placement } from './plateSpace'

// The master timeline: one film, 143 virtual seconds, generated from the scene
// table and the shot list below. It is never played; the transport scrubs it.
//
// Camera and bottle are keyframe tracks. Each key names a scene and a local
// progress mark, so the edit reads as a list of shots. A shot gives the full
// pose at its first and last mark, so holds hold and only dissolves move.
// Values may be functions; they are re-evaluated on refresh (resize, layout
// change), which is how the registered bottle follows the cover-fit of a plate.
// Type reveals hang off the same timeline, on the shared local marks of docs/05.

type Num = number | (() => number)
type Values<T> = Partial<Record<keyof T, Num>>
type Key<T> = { scene: SceneId; at: number; ease?: string; v: Values<T> }

const at = (scene: SceneId, local: number): number => {
  const s = SCENE_BY_ID[scene]
  return s.t0 + local * s.dur
}

const mob = (desktop: number, mobile: number): Num => () => (film.mobile ? mobile : desktop)

// ---------------------------------------------------------------------------
// Placement of the live bottle on the beats where it stands on the backdrop
// (hero, waterfall): a screen composition per layout, solved into a world pose
// for the beat's camera. Resolved once per layout and viewport size.

type Reg = { x: number; y: number; z: number; s: number }
const regCache = new Map<string, Reg>()

export function clearRegistration(): void {
  regCache.clear()
}

export const HERO_CAM: Record<'desktop' | 'mobile', CameraPose> = {
  desktop: { x: 0.35, y: 0.15, z: 5.4, tx: 0.85, ty: -0.05, tz: 0, fov: 28 },
  mobile: { x: 0.45, y: 0.15, z: 6.4, tx: 0.8, ty: -0.05, tz: 0, fov: 28 },
}
export const WATERFALL_CAM: Record<'desktop' | 'mobile', CameraPose> = {
  desktop: { x: 0, y: 0.2, z: 5.3, tx: 0, ty: 0, tz: 0, fov: 28 },
  mobile: { x: 0, y: 0.2, z: 6.2, tx: 0, ty: 0, tz: 0, fov: 28 },
}

/**
 * Where the bottle stands, as a fraction of the viewport (scenes.ts framing puts
 * the slab top of each backdrop under these points). Hero: on the wet slab in the
 * right third, 62% of the viewport tall. Waterfall: centered on the slab.
 */
export const PLACEMENTS: Record<'hero' | 'waterfall', Record<'desktop' | 'mobile', Placement>> = {
  // 0.58 tall leaves air between the cap and the navigation bar
  hero: { desktop: { base: [0.74, 0.7], height: 0.58 }, mobile: { base: [0.5, 0.58], height: 0.46 } },
  waterfall: { desktop: { base: [0.5, 0.7], height: 0.6 }, mobile: { base: [0.5, 0.6], height: 0.48 } },
}

const lay = (): 'desktop' | 'mobile' => (film.mobile ? 'mobile' : 'desktop')

/**
 * Phones shorter than the 19.5:9 class (iPhone SE, small Androids) get a smaller, higher hero
 * bottle, so the lockup in the bottom band keeps clear of the glass. 2.1 and taller: the table value.
 */
function heroPhonePlacement(width: number, height: number): Placement {
  const tall = Math.min(Math.max((height / width - 1.75) / (2.1 - 1.75), 0), 1)
  const p = PLACEMENTS.hero.mobile
  return { base: [p.base[0], 0.46 + (p.base[1] - 0.46) * tall], height: 0.35 + (p.height - 0.35) * tall }
}

export function placed(scene: 'hero' | 'waterfall'): Reg {
  const key = `${scene}:${film.layout}:${film.width}x${film.height}`
  const hit = regCache.get(key)
  if (hit) return hit
  const reg = placeBottle({
    placement: scene === 'hero' && lay() === 'mobile' ? heroPhonePlacement(film.width, film.height) : PLACEMENTS[scene][lay()],
    pose: (scene === 'hero' ? HERO_CAM : WATERFALL_CAM)[lay()],
    layout: film.layout,
    width: film.width,
    height: film.height,
  })
  regCache.set(key, reg)
  return reg
}

const heroB = (p: keyof Reg) => () => placed('hero')[p]
const fallB = (p: keyof Reg) => () => placed('waterfall')[p]

/** Wide screens: the cap macro stands this far left of the cap (a parallel move), so the cap sits right of centre and the words have the left. */
const CAP_PAN = 0.11

/** Cap macro: the camera goes to the bottle, not the other way round (docs/scenes/02). */
function capCam(p: keyof CameraPose, drift = 0): () => number {
  return () => {
    const r = placed('hero')
    const ty = r.y + 1.3 * r.s // a hair under the cap top so the top face sits slightly above center
    const tx = r.x + 0.01 - (film.mobile ? 0 : CAP_PAN)
    const dist = film.mobile ? 1.2 : 0.98
    const pose: CameraPose = {
      x: tx + 0.1 * dist + drift,
      y: ty + 0.55 * dist,
      z: r.z + 0.83 * dist,
      tx,
      ty,
      tz: r.z,
      fov: 22,
    }
    return pose[p]
  }
}

const camPose = (v: CameraPose | Record<keyof CameraPose, Num>): Values<CameraPose> => v

// ---------------------------------------------------------------------------
// Camera shot list. Desktop values from docs/scenes; `mob(d, m)` where mobile differs.

const HERO_HOLD = camPose({
  x: () => HERO_CAM[lay()].x,
  y: () => HERO_CAM[lay()].y,
  z: () => HERO_CAM[lay()].z,
  tx: () => HERO_CAM[lay()].tx,
  ty: () => HERO_CAM[lay()].ty,
  tz: 0,
  fov: 28,
})
const CAP_HOLD = (drift: number) =>
  camPose({ x: capCam('x', drift), y: capCam('y'), z: capCam('z'), tx: capCam('tx'), ty: capCam('ty'), tz: capCam('tz'), fov: 22 })
const FALL_HOLD = camPose({
  x: () => WATERFALL_CAM[lay()].x,
  y: () => WATERFALL_CAM[lay()].y,
  z: () => WATERFALL_CAM[lay()].z,
  tx: 0,
  ty: 0,
  tz: 0,
  fov: 28,
})

const CAM: Key<CameraPose>[] = [
  { scene: 'opening', at: 0, v: { x: 0, y: 0.4, z: 4.2, tx: 0, ty: 0.1, tz: 0, fov: 28 } },
  { scene: 'opening', at: 0.55, ease: 'sine.inOut', v: { y: 0.4, z: 4.09 } },
  { scene: 'opening', at: 0.58, ease: 'power2.out', v: { y: 0.39 } },
  { scene: 'opening', at: 0.7, ease: 'sine.inOut', v: { y: 0.4, z: 4.03 } },
  // the landing viewport: scroll 0 is hero local 0, already on the hold
  { scene: 'hero', at: 0, v: HERO_HOLD },
  { scene: 'hero', at: 0.1, ease: 'none', v: HERO_HOLD },
  { scene: 'hero', at: 0.2, ease: 'none', v: HERO_HOLD },
  // every hold keeps moving: a slow orbit or push from the beat's arrival to its exit, so each scroll moves the picture
  { scene: 'cap', at: 0.35, v: CAP_HOLD(0) },
  { scene: 'cap', at: 0.85, ease: 'sine.inOut', v: CAP_HOLD(0.09) },
  { scene: 'ionized', at: 0.12, v: { x: -0.1, y: 0.05, z: 6.3, tx: -0.1, ty: 0.05, tz: 0, fov: 28 } },
  { scene: 'ionized', at: 0.88, ease: 'sine.inOut', v: { x: 0.3, y: -0.15, z: 5.2, tx: 0.25, ty: -0.12, tz: 0, fov: 28 } },
  { scene: 'alkaline', at: 0.15, v: { x: mob(-0.4, 0.1), y: 0.1, z: mob(6, 7.1), tx: mob(0.35, 0.05), ty: 0.05, tz: 0, fov: 28 } },
  { scene: 'alkaline', at: 0.82, ease: 'sine.inOut', v: { x: mob(-0.45, 0.1), y: 0.1, z: mob(5.85, 6.95), tx: mob(0.35, 0.05), ty: 0.05, tz: 0, fov: 28 } },
  { scene: 'clean', at: 0.18, v: { x: 0, y: 0, z: 6.2, tx: 0, ty: 0, tz: 0, fov: 28 } },
  { scene: 'clean', at: 0.82, ease: 'none', v: { x: 0, y: 0, z: 5.85, tx: 0, ty: 0, tz: 0, fov: 28 } },
  { scene: 'minerals', at: 0.2, v: { x: 0, y: 0, z: 6, tx: 0, ty: 0, tz: 0, fov: 28 } },
  { scene: 'minerals', at: 0.82, ease: 'none', v: { x: 0, y: 0, z: 5.83, tx: 0, ty: 0, tz: 0, fov: 28 } },
  { scene: 'standard', at: 0.15, v: { x: 0, y: 0, z: 6, tx: 0, ty: 0, tz: 0, fov: 28 } },
  { scene: 'standard', at: 0.85, ease: 'none', v: { x: 0.1, y: 0, z: 6, tx: 0.1, ty: 0, tz: 0, fov: 28 } },
  // the spotlight's shafts are matched to the plate's painted beams: the camera only leans in, the bottle turns under them
  { scene: 'spotlight', at: 0.25, v: { x: 0.12, y: 2.38, z: mob(2.78, 3.45), tx: 0, ty: 1.15, tz: 0, fov: 24 } },
  { scene: 'spotlight', at: 0.85, ease: 'sine.inOut', v: { x: 0.26, y: 2.28, z: mob(2.55, 3.3), tx: 0, ty: 1.14, tz: 0, fov: 24 } },
  { scene: 'tomorrow', at: 0.22, v: { x: mob(-0.1, -0.3), y: 0.25, z: mob(5.4, 6.2), tx: mob(-0.15, -0.35), ty: 0, tz: 0, fov: 28 } },
  { scene: 'tomorrow', at: 0.85, ease: 'sine.inOut', v: { x: mob(-0.32, -0.4), y: 0.12, z: mob(4.85, 5.8), tx: mob(-0.18, -0.35), ty: 0, tz: 0, fov: 28 } },
  { scene: 'pack', at: 0.3, v: { x: mob(0.24, 0.2), y: 0.38, z: mob(5.75, 7.5), tx: mob(0.1, 0.15), ty: -0.2, tz: 0, fov: 28 } },
  { scene: 'pack', at: 0.85, ease: 'sine.inOut', v: { x: mob(0.16, 0.1), y: 0.3, z: mob(5.35, 7.1), tx: mob(0.1, 0.15), ty: -0.2, tz: 0, fov: 28 } },
  { scene: 'waterfall', at: 0.25, v: FALL_HOLD },
  { scene: 'waterfall', at: 0.8, ease: 'none', v: FALL_HOLD },
  // the top of the bottle: the last facets of the body softening into the smooth shoulder, the neck and the
  // whole cap clear of the navigation; a slow drift across it. Phones stand further back and keep the bottle
  // centred above the caption (a portrait frame is narrow, so its sides crop first).
  { scene: 'facets', at: 0.3, v: { x: mob(0.62, 0.3), y: mob(1.4, 1.2), z: mob(2.3, 3), tx: 0.1, ty: mob(1.08, 0.92), tz: 0, fov: 24 } },
  { scene: 'facets', at: 0.8, ease: 'none', v: { x: mob(-0.42, -0.2), y: mob(1.44, 1.24), z: mob(2.36, 3.05), tx: 0.12, ty: mob(1.12, 0.95), tz: 0, fov: 24 } },
  // the last beat of the film: one long dive with the sinking bottle, to the end of the scroll
  { scene: 'underwater', at: 0.1, v: { x: 0.25, y: 0.75, z: mob(5.4, 6.2), tx: 0.1, ty: 0.25, tz: 0, fov: 28 } },
  { scene: 'underwater', at: 1, ease: 'sine.inOut', v: { x: 0.05, y: -0.25, z: mob(4.5, 5.3), tx: 0.08, ty: -0.35, tz: 0, fov: 28 } },
  { scene: 'closing', at: 0.2, v: { x: 0, y: 0.2, z: 4.5, tx: 0, ty: 0, tz: 0, fov: 28 } },
]

// ---------------------------------------------------------------------------
// Bottle shot list. `fade` is presence: the group hides at 0, so no transmission cost.

export const FLOOR_Y = -1.35
const PACK_S = (): number => (film.mobile ? 0.66 : 0.85)

const HERO_BOTTLE: Values<BottlePose> = { x: heroB('x'), y: heroB('y'), z: heroB('z'), s: heroB('s'), rx: 0.02, rz: 0 }
const FALL_BOTTLE: Values<BottlePose> = { x: fallB('x'), y: fallB('y'), z: fallB('z'), s: fallB('s'), rx: 0, ry: 0.08, rz: 0 }
const SPOT_BOTTLE: Values<BottlePose> = { x: 0, y: -0.45, z: 0, rx: 0.04, rz: 0, s: mob(1.35, 1.15) }
const TOMORROW_BOTTLE: Values<BottlePose> = { x: -0.35, y: 0.05, z: 0, rx: 0.15, s: mob(0.95, 0.8) }
const PACK_BOTTLE: Values<BottlePose> = {
  x: mob(1.15, 0.72),
  y: () => FLOOR_Y + 1.2 * PACK_S(),
  z: 0.1,
  rx: 0,
  ry: 0.15,
  rz: 0,
  s: PACK_S,
}

const BOTTLE: Key<BottlePose>[] = [
  { scene: 'opening', at: 0, v: { ...HERO_BOTTLE, ry: 0.12, fade: 0, float: 1 } },
  // present from the first frame of the landing viewport
  { scene: 'hero', at: 0, ease: 'none', v: { ...HERO_BOTTLE, ry: 0.12, fade: 1, float: 1 } },
  { scene: 'hero', at: 0.2, ease: 'none', v: { ...HERO_BOTTLE, ry: 0.12, fade: 1, float: 1 } },
  { scene: 'cap', at: 0.35, v: { float: 0.2 } },
  { scene: 'cap', at: 0.85, ease: 'none', v: { ...HERO_BOTTLE, ry: 0.5, fade: 1, float: 0.2 } },
  { scene: 'ionized', at: 0.12, ease: 'power2.in', v: { fade: 0 } },
  // 0.86 of full size: the cap clears the navigation bar with air above it (the bar arrived after the shot list)
  { scene: 'alkaline', at: 0, ease: 'none', v: { x: mob(0.55, 0), y: 0.25, z: 0, rx: 0, ry: -0.05, rz: 0, s: mob(0.86, 0.74), fade: 0, float: 0.5 } },
  { scene: 'alkaline', at: 0.25, ease: 'power2.out', v: { y: mob(-0.14, -0.2), fade: 1 } },
  { scene: 'alkaline', at: 0.82, ease: 'sine.inOut', v: { x: mob(0.55, 0), y: mob(-0.14, -0.2), ry: 0.3, s: mob(0.86, 0.74), fade: 1 } },
  { scene: 'clean', at: 0.12, ease: 'power2.in', v: { y: 0.35, ry: 0.34, fade: 0 } },
  // the bottle turns with the scroll on every beat it stands or floats in: its label shows the motion
  { scene: 'spotlight', at: 0, ease: 'none', v: { ...SPOT_BOTTLE, ry: -0.5, fade: 0, float: 0.2 } },
  { scene: 'spotlight', at: 0.3, ease: 'power2.out', v: { fade: 1 } },
  { scene: 'spotlight', at: 0.85, ease: 'none', v: { ...SPOT_BOTTLE, ry: 0.5, fade: 1, float: 0.2 } },
  { scene: 'tomorrow', at: 0.15, v: { ...TOMORROW_BOTTLE, ry: -0.1, rz: mob(0.18, 0.12), float: 1.33 } },
  { scene: 'tomorrow', at: 0.85, ease: 'none', v: { ...TOMORROW_BOTTLE, ry: 0.75, rz: mob(0.38, 0.18), float: 1.33 } },
  { scene: 'pack', at: 0.35, ease: 'power2.out', v: { ...PACK_BOTTLE, ry: -0.15, float: 0 } },
  { scene: 'pack', at: 0.85, ease: 'none', v: { ...PACK_BOTTLE, ry: 0.55, float: 0 } },
  // standing on the rock: the base stays where the picture puts it, the bottle turns on it
  { scene: 'waterfall', at: 0.25, v: { ...FALL_BOTTLE, ry: -0.3, float: 0 } },
  { scene: 'waterfall', at: 0.85, ease: 'none', v: { ...FALL_BOTTLE, ry: 0.4, fade: 1, float: 0 } },
  { scene: 'facets', at: 0.3, ease: 'power2.in', v: { ry: -0.25, fade: 1 } },
  { scene: 'facets', at: 0.85, ease: 'none', v: { x: 0.1, y: 0.15, z: 0, rx: -0.16, ry: 0.15, rz: 0.06, s: mob(1, 0.85), fade: 1, float: 0.15 } },
  { scene: 'underwater', at: 0.2, ease: 'power2.out', v: { fade: 1 } },
  { scene: 'underwater', at: 1, ease: 'sine.inOut', v: { y: -0.55, rx: -0.05, ry: 0.95, fade: 1 } },
  { scene: 'closing', at: 0.05, ease: 'power2.in', v: { y: -0.5, fade: 0 } },
]

const LIGHT: Key<LightPose>[] = [
  { scene: 'opening', at: 0, v: { glint: 0, capSweep: -1, cartonSweep: -1 } },
  { scene: 'hero', at: 0, v: { glint: 1 } },
  { scene: 'hero', at: 0.1, ease: 'none', v: { glint: 1 } },
  { scene: 'hero', at: 0.2, ease: 'none', v: { glint: 1 } },
  { scene: 'cap', at: 0.08, ease: 'none', v: { capSweep: -1 } },
  { scene: 'cap', at: 0.1, ease: 'none', v: { glint: 0.3, capSweep: 0 } },
  { scene: 'cap', at: 0.9, ease: 'none', v: { capSweep: 1 } },
  { scene: 'cap', at: 0.92, ease: 'none', v: { capSweep: -1 } },
  { scene: 'alkaline', at: 0.2, v: { glint: 0.45 } },
  // later beats: a spot on the round neck finish reads as a blob, so the sweep stays near zero where the neck is in frame
  { scene: 'spotlight', at: 0.2, v: { glint: 0 } },
  { scene: 'tomorrow', at: 0.2, v: { glint: 0 } },
  { scene: 'pack', at: 0.35, v: { glint: 0.15 } },
  { scene: 'waterfall', at: 0.25, v: { glint: 0.3 } },
  { scene: 'facets', at: 0.3, v: { glint: 0 } },
  { scene: 'underwater', at: 0.2, v: { glint: 0 } },
  { scene: 'pack', at: 0.38, ease: 'none', v: { cartonSweep: -1 } },
  { scene: 'pack', at: 0.4, ease: 'none', v: { cartonSweep: 0 } },
  { scene: 'pack', at: 0.7, ease: 'none', v: { cartonSweep: 1 } },
  { scene: 'pack', at: 0.72, ease: 'none', v: { cartonSweep: -1 } },
]

function addTracks<T extends object>(tl: gsap.core.Timeline, target: T, keys: Key<T>[]): void {
  const props = new Set<keyof T>()
  keys.forEach((k) => (Object.keys(k.v) as (keyof T)[]).forEach((p) => props.add(p)))
  props.forEach((prop) => {
    // keys on an unpublished beat stay in the shot list for when it returns; the film skips them
    const track = keys
      .filter((k) => k.v[prop] !== undefined && isPublished(k.scene))
      .map((k) => ({ t: at(k.scene, k.at), v: k.v[prop] as Num, ease: k.ease ?? 'power2.inOut' }))
      .sort((a, b) => a.t - b.t)
    if (!track.length) return
    tl.set(target, { [prop]: track[0].v }, 0)
    for (let i = 1; i < track.length; i++) {
      const a = track[i - 1]
      const b = track[i]
      const dur = Math.max(b.t - a.t, 0.0001)
      tl.fromTo(target, { [prop]: a.v }, { [prop]: b.v, duration: dur, ease: b.ease, immediateRender: false }, a.t)
    }
  })
}

// ---------------------------------------------------------------------------
// Type. DOM contract: section.type[data-scene] with [data-anim] children
// (see TypeRoot.tsx). Marks are local progress, docs/05 "Local progress".

const qa = <E extends Element = HTMLElement>(root: ParentNode, sel: string): E[] => Array.from(root.querySelectorAll<E>(sel))

function addTypeTweens(tl: gsap.core.Timeline): void {
  const root = document.getElementById('type-root')
  if (!root) return
  for (const scene of SCENES) {
    const section = root.querySelector<HTMLElement>(`.type[data-scene="${scene.id}"]`)
    if (!section) continue
    const T = (l: number) => at(scene.id, l)
    const D = (l: number) => l * scene.dur
    // the lines slide in from the side the lockup stands on (phones: from below)
    const sideX = scene.typeSide === 'right' ? 20 : -20
    const enterX = () => (film.mobile ? 0 : sideX)
    const enterY = () => (film.mobile ? 18 : 0)
    // The hero is the landing viewport: visible from the first frame. Its entrance is the one-shot,
    // time-based intro in TypeRoot.tsx; the scroll owns only its exit.
    const hero = scene.id === 'hero'

    tl.set(section, { autoAlpha: hero ? 1 : 0 }, 0)
    // The hero's children belong to the intro, which must never share a property with a scroll tween
    // (the loser's start values leak into the other's reversal). The section as a whole dissolves instead.
    if (hero) {
      tl.fromTo(section, { autoAlpha: 1 }, { autoAlpha: 0, duration: D(0.12), ease: 'power2.in', immediateRender: false }, T(0.2))
      continue
    }
    // the last beat ends the film: its words come in late and stay to the end of the scroll
    const last = scene === SCENES[SCENES.length - 1]
    tl.set(section, { autoAlpha: 1 }, T(0.14))
    if (!last) tl.set(section, { autoAlpha: 0 }, T(0.9))

    // the section name, then the headline line by line, then the body line by line
    const eyebrow = qa(section, '[data-anim="eyebrow"]')
    if (eyebrow.length) tl.fromTo(eyebrow, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: D(0.1), ease: 'power2.out', immediateRender: false }, T(0.15))
    const reveal = (lines: HTMLElement[], l0: number, l1: number) => {
      if (!lines.length) return
      const each = D(l1 - l0) / (lines.length + 1)
      lines.forEach((l, i) =>
        tl.fromTo(
          l,
          { autoAlpha: 0, x: enterX, y: enterY },
          { autoAlpha: 1, x: 0, y: 0, duration: each * 2, ease: 'power2.out', immediateRender: false },
          T(l0) + i * each,
        ),
      )
    }
    reveal(qa(section, '[data-anim="title"] .line'), 0.19, 0.36)
    reveal(qa(section, '[data-anim="support"] .line'), 0.3, 0.48)

    // the short rule under a title draws out from its edge
    const rule = qa(section, '[data-anim="rule"]')
    if (rule.length) tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: D(0.2), ease: 'power2.out', immediateRender: false }, T(0.3))

    // a wordmark rises letter by letter, its tagline after it (the film's last frame)
    const chars = qa(section, '[data-anim="wordmark"] .char')
    const [c0, c1] = last ? [0.3, 0.52] : [0.2, 0.42]
    if (chars.length) {
      const each = D(c1 - c0) / (chars.length + 1.5)
      chars.forEach((c, i) =>
        tl.fromTo(c, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: each * 2.5, ease: 'power2.out', immediateRender: false }, T(c0) + i * each),
      )
    }
    const subline = qa(section, '[data-anim="subline"]')
    if (subline.length) tl.fromTo(subline, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: D(0.12), ease: 'power2.out', immediateRender: false }, T(c1))

    if (last) continue
    const groups = qa(section, '[data-anim="eyebrow"],[data-anim="title"],[data-anim="support"],[data-anim="rule"]')
    if (groups.length) tl.fromTo(groups, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -8, duration: D(0.1), ease: 'power2.in', immediateRender: false }, T(0.78))
  }
}

export function buildMasterTimeline(): gsap.core.Timeline {
  const tl = gsap.timeline({ paused: true, defaults: { overwrite: false } })
  for (const s of SCENES) tl.addLabel(s.id, s.t0)
  addTracks(tl, rig.camera, CAM)
  addTracks(tl, rig.bottle, BOTTLE)
  addTracks(tl, rig.light, LIGHT)
  addTypeTweens(tl)
  tl.set({}, {}, FILM_DURATION)
  return tl
}
