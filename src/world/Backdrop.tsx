import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { UNDERWATER_MODE } from '../experience/config'
import { film, type Layout } from '../experience/film'
import { input } from '../experience/input'
import { BACKDROP_ASPECT } from '../experience/plateMeta'
import { coverFit, plateFrame } from '../experience/plateSpace'
import { rig } from '../experience/rig'
import { BOTTLE_BASE_Y, bottleLive } from '../experience/bottleMotion'
import { SCENES, sceneFraming, type SceneDef } from '../experience/scenes'
import { FLOOR_Y } from '../experience/timeline'
import { createBackdrop, type BackdropUniforms, type SlotUniforms } from './backdrop/material'
import { loadBackdrops, type BackdropStore } from './backdrop/loader'
import {
  ALKALINE_GLOW,
  BOTTLE_WATER,
  BACKDROP_LOAD_ORDER,
  BACKDROP_SCENES,
  DARKEN,
  DISSOLVE_TINT,
  FLOW_BACKDROPS,
  FLOW_CLOCK_WRAP,
  FLOW_GLINT,
  FLOW_TURB,
  WAVE,
  KEN_BURNS,
  MOBILE_FEATHER,
  PACK_KEY,
  PACK_WALL_Z,
  SCRIMS,
} from './backdrop/table'

// The screen-space backdrop behind everything (docs/07 "Plate shader", docs/03
// cover fit and scrims, docs/05 "Dissolves"). One opaque full-screen triangle
// drawn first, so the glass bottle's transmission pass refracts it. Each frame
// the two most present picture beats take the two slots; a beat whose picture
// is missing or still loading paints its built ground instead. Uniforms only:
// nothing here allocates per frame.

type Beat = {
  scene: SceneDef
  /** the beat's scene-table ground, linear */
  flat: THREE.Color
  /** cover fit for the current layout: screen uv → texture uv */
  fit: THREE.Vector4
  /** texture uv of the pinned point (Ken Burns center) */
  anchor: THREE.Vector2
  /** side, strength, plateau, feather (strength 0 on mobile) */
  scrim: THREE.Vector4
  darken: number
}

/**
 * Screen uv (origin bottom-left) → texture uv (flipY, origin bottom-left) of a
 * beat's picture, with the same cover fit as plateSpace (the world layers agree).
 */
function coverToTexture(scene: SceneDef, layout: Layout, width: number, height: number, out: THREE.Vector4, anchor: THREE.Vector2): void {
  const frame = plateFrame(layout, width, height)
  const framing = sceneFraming(scene.id, layout === 'mobile')
  const fit = coverFit(frame, BACKDROP_ASPECT, framing)
  out.set(width / fit.dw, height / fit.dh, -(frame.x + fit.ox) / fit.dw, 1 - (height - frame.y - fit.oy) / fit.dh)
  anchor.set(framing.uv[0], 1 - framing.uv[1])
}

/** Project a world point with the live camera into screen uv (origin bottom-left), loosely clamped. */
function toScreen(v: THREE.Vector3, camera: THREE.Camera, out: THREE.Vector2): void {
  v.project(camera)
  out.set(THREE.MathUtils.clamp(v.x * 0.5 + 0.5, -0.5, 1.5), THREE.MathUtils.clamp(v.y * 0.5 + 0.5, -0.5, 1.5))
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Radius of the glass where the stream meets the cut foot (bottle/geometry.ts BODY_RINGS), group space. */
const BASE_R = 0.39
/** Base to cap top, group space. */
const BOTTLE_HEIGHT = 1.38 - BOTTLE_BASE_Y

export function Backdrop() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const parts = useMemo(() => createBackdrop(), [])
  const store = useRef<BackdropStore | null>(null)

  const beats = useMemo<Beat[]>(
    () =>
      BACKDROP_SCENES.map((scene) => ({
        scene,
        flat: new THREE.Color(scene.look.ground),
        fit: new THREE.Vector4(1, 1, 0, 0),
        anchor: new THREE.Vector2(0.5, 0.5),
        scrim: new THREE.Vector4(),
        darken: DARKEN[scene.id] ?? 0,
      })),
    [],
  )

  useEffect(() => {
    // the beat on screen at mount (and its neighbours) block the first frame; the rest stream in
    const i = film.sceneIndex
    const hold = [SCENES[i], SCENES[i + 1], SCENES[i - 1]].flatMap((s) => (s?.backdrop ? [s.backdrop] : []))
    const backdrops = loadBackdrops(gl, BACKDROP_LOAD_ORDER, hold, film.tier, FLOW_BACKDROPS)
    store.current = backdrops
    return () => {
      store.current = null
      backdrops.dispose()
    }
  }, [gl])

  useEffect(() => () => parts.dispose(), [parts])

  const state = useMemo(
    () => ({
      width: -1,
      height: -1,
      layout: '' as Layout | '',
      v: new THREE.Vector3(),
      h: new THREE.Vector2(),
      w: new THREE.Vector3(),
      right: new THREE.Vector3(),
      toCam: new THREE.Vector3(),
      axis: new THREE.Vector3(),
      e: new THREE.Euler(),
    }),
    [],
  )

  useFrame(() => {
    const u = parts.uniforms
    const pictures = store.current
    pictures?.step(film.delta)

    if (film.width !== state.width || film.height !== state.height || film.layout !== state.layout) {
      state.width = film.width
      state.height = film.height
      state.layout = film.layout
      const mobile = film.layout === 'mobile'
      u.uAspect.value = film.width / Math.max(film.height, 1)
      if (mobile) u.uFeather.value.set(MOBILE_FEATHER[0], MOBILE_FEATHER[1])
      else u.uFeather.value.set(2, 3)
      for (const beat of beats) {
        coverToTexture(beat.scene, film.layout, film.width, film.height, beat.fit, beat.anchor)
        const scrim = SCRIMS[beat.scene.id]
        if (scrim && !mobile) beat.scrim.set(scrim.side === 'left' ? 1 : -1, scrim.strength, scrim.plateau, scrim.feather)
        else beat.scrim.set(1, 0, 0.2, 0.5)
      }
    }

    u.uGround.value.copy(film.look.ground)
    u.uPointer.value.set(input.dx, input.dy)
    u.uTime.value = film.elapsed % FLOW_CLOCK_WRAP

    // the next beats stream in ahead of the playhead
    if (pictures) {
      const next = SCENES[film.sceneIndex + 1]
      if (next?.backdrop) pictures.want(next.backdrop)
      const after = SCENES[film.sceneIndex + 2]
      if (after?.backdrop) pictures.want(after.backdrop)
    }

    // built sets paint their own ground by presence, only while their picture is absent
    const P = film.presence
    const has = (id: SceneDef['backdrop']): number => (id && pictures ? pictures.ready(id) : 0)
    u.uBuiltA.value.set(
      P.alkaline * (1 - has('alkaline')),
      P.tomorrow * (1 - has('tomorrow')),
      P.pack * (1 - has('pack')),
      P.spotlight * (1 - has('spotlight')),
    )
    u.uBuiltB.value.set(UNDERWATER_MODE === 'live' ? P.underwater : 0, P.opening + P.closing * (1 - has('closing')))
    if (P.alkaline > 0 || P.tomorrow > 0 || P.spotlight > 0 || P.pack > 0) {
      const b = rig.bottle
      const v = state.v
      camera.updateMatrixWorld()
      if (P.alkaline > 0) {
        toScreen(v.set(b.x, b.y + 0.9 * b.s, b.z), camera, u.uGlow.value)
        u.uGlow.value.x += ALKALINE_GLOW[0]
        u.uGlow.value.y += ALKALINE_GLOW[1]
      }
      if (P.tomorrow > 0) toScreen(v.set(b.x, b.y + 0.1 * b.s, b.z), camera, u.uPool.value)
      if (P.spotlight > 0) toScreen(v.set(b.x, b.y + 0.95 * b.s, b.z), camera, u.uLift.value)
      if (P.pack > 0) {
        toScreen(v.set(camera.position.x, FLOOR_Y, PACK_WALL_Z), camera, state.h)
        u.uHorizon.value = THREE.MathUtils.clamp(state.h.y, 0.05, 0.95)
        toScreen(v.set(film.mobile ? PACK_KEY.x.mobile : PACK_KEY.x.desktop, PACK_KEY.y, PACK_WALL_Z), camera, u.uKey.value)
      }
    }

    // the water at the base of the bottle where it stands in a picture: its footprint on screen
    // the bottle has to stand in the water before the water shows it (film.entrance: it comes down after the loader)
    const landed = THREE.MathUtils.smoothstep(film.entrance, 0.82, 1)
    const hero = P.hero * rig.bottle.fade * landed
    const fall = P.waterfall * rig.bottle.fade * landed
    if (hero + fall > 0.002 && film.liveWater.flow) {
      const L = bottleLive
      const s = L.s
      camera.updateMatrixWorld()
      const base = state.w.copy(L.base)
      state.v.copy(base).project(camera)
      const bx = state.v.x * 0.5 + 0.5
      const by = state.v.y * 0.5 + 0.5
      // half-width of the base along the camera's right (the shader scales it to the body for the reflection)
      state.right.set(1, 0, 0).applyQuaternion(camera.quaternion)
      state.v.copy(base).addScaledVector(state.right, BASE_R * s).project(camera)
      const halfW = Math.abs(state.v.x * 0.5 + 0.5 - bx)
      // the base ellipse: a step toward the camera over the ground
      state.toCam.set(camera.position.x - base.x, 0, camera.position.z - base.z).normalize()
      state.v.copy(base).addScaledVector(state.toCam, BASE_R * s).project(camera)
      const ellH = Math.abs(state.v.y * 0.5 + 0.5 - by)
      // up the bottle to the cap top
      state.e.set(L.rx, L.ry, L.rz)
      state.axis.set(0, 1, 0).applyEuler(state.e)
      state.v.copy(base).addScaledVector(state.axis, BOTTLE_HEIGHT * s).project(camera)
      const tx = (state.v.x * 0.5 + 0.5 - bx) * u.uAspect.value
      const ty = state.v.y * 0.5 + 0.5 - by
      const len = Math.hypot(tx, ty) || 1
      const H = BOTTLE_WATER.hero
      const F = BOTTLE_WATER.waterfall
      const sum = hero + fall
      u.uBW0.value.set(bx, by, halfW, Math.max(ellH, halfW * 0.08))
      u.uBW1.value.set(len, tx / len, ty / len, hero >= fall ? H.mask : F.mask)
      u.uBW2.value.set(
        H.strength[0] * hero + F.strength[0] * fall,
        H.strength[1] * hero + F.strength[1] * fall,
        H.strength[2] * hero + F.strength[2] * fall,
        H.strength[3] * hero + F.strength[3] * fall,
      )
      const dx = (H.down[0] * hero + F.down[0] * fall) / sum
      const dy = (H.down[1] * hero + F.down[1] * fall) / sum
      const dl = Math.hypot(dx, dy) || 1
      u.uBW3.value.set(dx / dl, dy / dl, (H.foamSpeed * hero + F.foamSpeed * fall) / sum, (H.ripple * hero + F.ripple * fall) / sum)
    } else u.uBW2.value.set(0, 0, 0, 0)

    // the two most present picture beats take the slots
    let a = -1
    let b = -1
    let pa = 0
    let pb = 0
    for (let i = 0; i < beats.length; i++) {
      const p = P[beats[i].scene.id]
      if (p <= 1e-4) continue
      if (p > pa) {
        b = a
        pb = pa
        a = i
        pa = p
      } else if (p > pb) {
        b = i
        pb = p
      }
    }
    fillSlot(parts.slots[0], a >= 0 ? beats[a] : null, pa, pictures, u, 0)
    fillSlot(parts.slots[1], b >= 0 ? beats[b] : null, pb, pictures, u, 1)
  })

  return <primitive object={parts.mesh} />
}

function fillSlot(slot: SlotUniforms, beat: Beat | null, presence: number, pictures: BackdropStore | null, u: BackdropUniforms, i: 0 | 1): void {
  const texture = beat && pictures ? pictures.texture(beat.scene.backdrop!) : null
  if (!beat || !texture || !pictures) {
    slot.mix.set(0, 0, 0, 1)
    u.uFlowOn.value.setComponent(i, 0)
    ;(i === 0 ? u.uWave0.value : u.uWave1.value).set(0, 0, 0, 0)
    return
  }
  slot.map.value = texture
  // moving water: the picture's flow map, or still water (the slot keeps its neutral texel)
  const flow = film.liveWater.flow ? pictures.flow(beat.scene.backdrop!) : null
  if (flow) slot.flow.value = flow
  u.uFlowOn.value.setComponent(i, flow ? pictures.flowReady(beat.scene.backdrop!) : 0)
  const turb = FLOW_TURB[beat.scene.backdrop!]
  u.uTurb.value.setComponent(i * 2, turb ? turb[0] : 0)
  u.uTurb.value.setComponent(i * 2 + 1, turb ? turb[1] : 0)
  const glint = FLOW_GLINT[beat.scene.backdrop!]
  u.uGlint.value.setComponent(i * 2, glint ? glint[0] : 0)
  u.uGlint.value.setComponent(i * 2 + 1, glint ? glint[1] : 0)
  // the macro wave breathes and its crest catches travelling light (storyboard slide 8)
  const wave = film.liveWater.flow ? WAVE[beat.scene.backdrop!] : undefined
  const wv = i === 0 ? u.uWave0.value : u.uWave1.value
  if (wave) wv.set(wave.breathe, wave.light, wave.sparkle, wave.swell)
  else wv.set(0, 0, 0, 0)
  const opacity = presence * pictures.ready(beat.scene.backdrop!) * film.debugPlate
  const kb = 1 + KEN_BURNS * clamp01(film.local[beat.scene.id])
  slot.mix.set(opacity, DISSOLVE_TINT * (1 - presence), beat.darken, kb)
  slot.flat.copy(beat.flat)
  slot.scrim.copy(beat.scrim)
  slot.fit.copy(beat.fit)
  slot.anchor.copy(beat.anchor)
}
