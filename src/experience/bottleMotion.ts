import * as THREE from 'three'
import type { BottlePose } from './rig'

// Secondary motion of the bottle: the timeline's pose is where the bottle should
// be; this is how a real object gets there. Uniforms of the film only, no
// allocation per frame.
//
//  - Inertia: position and turn follow the timeline through springs, so a move
//    starts and lands with weight (critically damped in air, slower and softer in
//    water, where the bottle drifts toward its mark).
//  - Lean: the bottle's own acceleration tips it the way a carried glass tips (the
//    top lags behind the move), on an underdamped spring that settles in about a
//    second. Scrolling turns it a little in the direction of travel, so the facets
//    catch new light while the page moves; it eases back when the scroll stops.
//  - Standing: on the slab, the rock and the carton floor (hero, cap, pack,
//    waterfall) there is no bob, and every lean pivots on the base, so the glass
//    never lifts off the ground or sinks into it.
//  - Air: a slow bob and two incommensurate precessions keep a floating bottle alive.
//
// Holds stay exact: every spring rests on the timeline's value, so the bottle the
// backdrop was registered to is the bottle on screen once the scroll stops.

/** Group-space height of the base (geometry BASE_Y). */
export const BOTTLE_BASE_Y = -1.2

const FLOAT_AMP = 0.03
export const FLOAT_PERIOD = 5.5

type Spring = { x: number; v: number }
const spring = (x = 0): Spring => ({ x, v: 0 })

/** Semi-implicit Euler on a damped spring toward `to`, sub-stepped for stability at low frame rates. */
function step(s: Spring, to: number, dt: number, omega: number, zeta: number, drive = 0): void {
  const n = Math.max(1, Math.ceil(dt / (1 / 120)))
  const h = dt / n
  for (let i = 0; i < n; i++) {
    const a = -omega * omega * (s.x - to) - 2 * zeta * omega * s.v + drive
    s.v += a * h
    s.x += s.v * h
  }
}

/** The rendered pose, written by the bottle rig every frame (world layers read it: the water at the base, shadows). */
export const bottleLive = {
  x: 0,
  y: 0,
  z: 0,
  rx: 0,
  ry: 0,
  rz: 0,
  /** world scale (timeline scale × tablet trim) */
  s: 1,
  /** world position of the centre of the base */
  base: new THREE.Vector3(),
  /** 0..1: how much the bottle stands on a surface in the beats on screen */
  standing: 0,
  /** the idle bob in world units (0 while standing) */
  float: 0,
}

export type MotionInput = {
  target: BottlePose
  /** world scale multiplier on top of target.s (tablet trim) */
  scaleTrim: number
  dt: number
  elapsed: number
  /** film playhead velocity, virtual seconds per second */
  filmVelocity: number
  /** 0..1 standing weight of the beats on screen */
  standing: number
  /** 0..1 underwater presence: slower, floatier springs */
  water: number
  /** pointer tilt and hero sway, radians (pivot on the base while standing) */
  pointerPitch: number
  pointerYaw: number
  sway: number
  /** jump straight to the target (deep link, seek, first frame) */
  snap: boolean
}

export function createBottleMotion() {
  const px = spring()
  const py = spring()
  const pz = spring()
  const yaw = spring()
  const leanX = spring()
  const leanZ = spring()
  const turn = spring()
  // the target's velocity, low-passed, to read its acceleration
  let lastX = 0
  let lastZ = 0
  let velX = 0
  let velZ = 0
  let first = true
  const v = new THREE.Vector3()
  const e = new THREE.Euler()

  return {
    step(m: MotionInput): void {
      const t = m.target
      const dt = Math.max(m.dt, 1e-4)
      if (m.snap || first) {
        first = false
        px.x = t.x
        py.x = t.y
        pz.x = t.z
        yaw.x = t.ry
        px.v = py.v = pz.v = yaw.v = 0
        leanX.x = leanZ.x = turn.x = 0
        leanX.v = leanZ.v = turn.v = 0
        lastX = t.x
        lastZ = t.z
        velX = velZ = 0
      }

      // the target's acceleration (smoothed: the playhead is a scrub, its steps are uneven)
      const k = 1 - Math.exp(-dt / 0.08)
      const prevX = velX
      const prevZ = velZ
      velX += ((t.x - lastX) / dt - velX) * k
      velZ += ((t.z - lastZ) / dt - velZ) * k
      const ax = (velX - prevX) / dt
      const az = (velZ - prevZ) / dt
      lastX = t.x
      lastZ = t.z

      // inertia: brisk in air, slow and soft in water
      const w = THREE.MathUtils.lerp(9, 3.2, m.water)
      const z = THREE.MathUtils.lerp(1, 0.75, m.water)
      step(px, t.x, dt, w, z)
      step(py, t.y, dt, w, z)
      step(pz, t.z, dt, w, z)
      step(yaw, t.ry, dt, w * 0.8, z)

      // lean: the top lags the move (a push to +x tips the top toward -x: +z rotation)
      const lean = 0.012 * (1 - 0.6 * m.standing)
      step(leanZ, 0, dt, 6.5, 0.32, THREE.MathUtils.clamp(ax * lean, -3, 3))
      step(leanX, 0, dt, 6.5, 0.32, THREE.MathUtils.clamp(-az * lean, -3, 3))
      leanZ.x = THREE.MathUtils.clamp(leanZ.x, -0.08, 0.08)
      leanX.x = THREE.MathUtils.clamp(leanX.x, -0.08, 0.08)
      // scroll turns it in the direction of travel and lets go when the scroll stops
      const want = THREE.MathUtils.clamp(m.filmVelocity * 0.0065, -0.11, 0.11)
      step(turn, want, dt, 5, 0.55)

      // life in the air: a bob and two slow precessions that never line up
      const air = 1 - m.standing
      const el = m.elapsed
      const bob = Math.sin((el / FLOAT_PERIOD) * Math.PI * 2) * FLOAT_AMP * t.float * air
      const drift = 1 + 1.6 * m.water
      const precessX = (0.012 * Math.sin(el * 0.71) + 0.006 * Math.sin(el * 1.37 + 0.6)) * air * drift
      const precessZ = (0.01 * Math.sin(el * 0.53 + 1.1) + 0.005 * Math.sin(el * 1.13 + 2.3)) * air * drift

      const s = t.s * m.scaleTrim
      const rx = t.rx - m.pointerPitch + leanX.x + precessX
      // in the air it also turns slowly back and forth, showing its facets to the light
      const show = (0.13 * Math.sin(el * 0.37) + 0.05 * Math.sin(el * 0.83 + 1.9)) * air
      const ry = yaw.x + m.sway + m.pointerYaw + turn.x + show
      const rz = t.rz + leanZ.x + precessZ

      // standing: the dynamic tilt (pointer, lean) pivots on the base, not on the centre
      let x = px.x
      let y = py.x + bob
      let zz = pz.x
      if (m.standing > 0) {
        const h = -BOTTLE_BASE_Y * s
        e.set(-m.pointerPitch + leanX.x, 0, leanZ.x)
        v.set(0, h, 0).applyEuler(e)
        x += m.standing * (v.x - 0)
        y += m.standing * (v.y - h)
        zz += m.standing * (v.z - 0)
      }

      bottleLive.x = x
      bottleLive.y = y
      bottleLive.z = zz
      bottleLive.rx = rx
      bottleLive.ry = ry
      bottleLive.rz = rz
      bottleLive.s = s
      bottleLive.standing = m.standing
      bottleLive.float = bob
      // the base centre: the group origin stepped down the bottle's own axis
      e.set(rx, ry, rz)
      v.set(0, BOTTLE_BASE_Y * s, 0).applyEuler(e)
      bottleLive.base.set(x + v.x, y + v.y, zz + v.z)
    },
  }
}
