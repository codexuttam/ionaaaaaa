// Pointer, touch and gyro share one normalized vector, origin at the viewport
// center, x right / y up, range about -1..1. Last input wins. Handlers only
// write here; nothing calls setState. Three objects damp toward it per frame.

export const input = {
  /** Raw target vector, -1..1. */
  x: 0,
  y: 0,
  /** Damped with lambda 3.5 (the heavy feel). Updated by `dampInput` once per frame. */
  dx: 0,
  dy: 0,
  /** Damped with lambda 2 (facets beat). */
  sx: 0,
  sy: 0,
  /** Pointer position in CSS pixels (for hit tests such as the carton hover). */
  px: 0,
  py: 0,
  /** True while a mouse is inside the window or a finger is down. */
  inside: false,
  /** True while a finger is down on the visual field. */
  touching: false,
  /** Seconds since the last pointer/touch movement, for repulsion falloff. */
  idle: 0,
  /** Gyro is delivering events. */
  gyro: false,
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}

/** Advance the damped copies. Called by the frame driver once per frame. */
export function dampInput(dt: number): void {
  input.idle += dt
  if (input.touching === false && !input.gyro && input.inside === false) {
    // ease back toward rest when the pointer leaves or the finger lifts
    input.x = damp(input.x, 0, 1.5, dt)
    input.y = damp(input.y, 0, 1.5, dt)
  }
  input.dx = damp(input.dx, input.x, 3.5, dt)
  input.dy = damp(input.dy, input.y, 3.5, dt)
  input.sx = damp(input.sx, input.x, 2, dt)
  input.sy = damp(input.sy, input.y, 2, dt)
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v))

function setFromClient(cx: number, cy: number): void {
  const w = window.innerWidth || 1
  const h = window.innerHeight || 1
  input.px = cx
  input.py = cy
  input.x = clamp1((cx / w) * 2 - 1)
  input.y = clamp1(-((cy / h) * 2 - 1))
  input.idle = 0
}

let gyroBase: { beta: number; gamma: number } | null = null
const GYRO_SCALE = 0.35
const GYRO_MOBILE_GAIN = 0.7

function onOrientation(e: DeviceOrientationEvent): void {
  if (e.beta == null || e.gamma == null) return
  if (!gyroBase) gyroBase = { beta: e.beta, gamma: e.gamma }
  input.gyro = true
  // gamma: left/right tilt, beta: front/back, in degrees, relative to the first reading.
  // 0.35 per 10 degrees, clamped, then the mobile gain: a real tilt never throws the bottle.
  const gx = clamp1(((e.gamma - gyroBase.gamma) * GYRO_SCALE) / 10) * GYRO_MOBILE_GAIN
  const gy = clamp1(((e.beta - gyroBase.beta) * GYRO_SCALE) / 10) * GYRO_MOBILE_GAIN
  input.x = gx
  input.y = -gy
  input.idle = 0
}

type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }

/** True when iOS needs a gesture-gated permission request for orientation. */
export function gyroNeedsPermission(): boolean {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return false
  return typeof (DeviceOrientationEvent as OrientationCtor).requestPermission === 'function'
}

let gyroAsked = false
let gyroAttached = false

function attachGyro(): void {
  if (gyroAttached) return
  gyroAttached = true
  window.addEventListener('deviceorientation', onOrientation)
}

/** Called by the Motion control (iOS). Asks once per session. Resolves true when granted. */
export async function requestGyro(): Promise<boolean> {
  if (!gyroNeedsPermission()) {
    attachGyro()
    return true
  }
  if (gyroAsked) return gyroAttached
  gyroAsked = true
  try {
    const res = await (DeviceOrientationEvent as OrientationCtor).requestPermission!()
    if (res === 'granted') {
      attachGyro()
      return true
    }
  } catch {
    // declined or unavailable: drag still works
  }
  return false
}

/** Attach pointer/touch listeners (and orientation where no permission is needed). Returns detach. */
export function attachInput(): () => void {
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && !input.touching) return
    input.inside = true
    setFromClient(e.clientX, e.clientY)
  }
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      input.touching = true
      input.inside = true
      setFromClient(e.clientX, e.clientY)
    }
  }
  const onUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      input.touching = false
      input.inside = false
    }
  }
  const onLeave = () => {
    input.inside = false
  }
  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerdown', onDown, { passive: true })
  window.addEventListener('pointerup', onUp, { passive: true })
  window.addEventListener('pointercancel', onUp, { passive: true })
  document.documentElement.addEventListener('mouseleave', onLeave)
  if (!gyroNeedsPermission() && typeof DeviceOrientationEvent !== 'undefined' && matchMedia('(pointer: coarse)').matches) {
    attachGyro()
  }
  return () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    document.documentElement.removeEventListener('mouseleave', onLeave)
    if (gyroAttached) {
      window.removeEventListener('deviceorientation', onOrientation)
      gyroAttached = false
    }
  }
}
