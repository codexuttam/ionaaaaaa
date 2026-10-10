import * as THREE from 'three'
import type { Layout } from './film'
import type { CameraPose } from './rig'
import type { Framing } from './scenes'

// Cover-fit math shared by the backdrop shader, the placement of the live
// bottle on the screen composition, and any component that must sit on a
// feature of a backdrop (spray on the hero lip, drops on the waterfall rocks).
//
// Conventions
// - Backdrop UV: origin top-left, x right, y down, 0..1 across the picture.
// - Screen px: CSS pixels, origin top-left of the viewport.
// - The backdrop is cover-fitted inside a frame rect. Desktop and tablet: the
//   whole viewport. Mobile: the top 80% (the bottom scrim is opaque from 78% down).
// - Framing (scenes.ts): the backdrop point `uv` is pinned at `at` (fraction of
//   the frame), magnified by `zoom`; the offset is then clamped so the picture
//   always covers the frame.

export type Rect = { x: number; y: number; w: number; h: number }

export type CoverFit = {
  /** displayed backdrop size in px */
  dw: number
  dh: number
  /** backdrop top-left in px, relative to the frame's top-left */
  ox: number
  oy: number
}

export const MOBILE_PLATE_FRAME = 0.8

export function plateFrame(layout: Layout, width: number, height: number): Rect {
  if (layout === 'mobile') return { x: 0, y: 0, w: width, h: height * MOBILE_PLATE_FRAME }
  return { x: 0, y: 0, w: width, h: height }
}

/**
 * @param aspect backdrop width / height
 * @param framing which backdrop point sits where in the frame, and the base magnification
 * @param extraZoom further magnification about the pinned point (Ken Burns), >= 1
 */
export function coverFit(frame: Rect, aspect: number, framing: Framing, extraZoom = 1): CoverFit {
  const s = Math.max(frame.w / aspect, frame.h) * framing.zoom * extraZoom
  const dw = aspect * s
  const dh = s
  const ox = Math.min(0, Math.max(frame.w - dw, frame.w * framing.at[0] - framing.uv[0] * dw))
  const oy = Math.min(0, Math.max(frame.h - dh, frame.h * framing.at[1] - framing.uv[1] * dh))
  return { dw, dh, ox, oy }
}

export function plateUvToScreen(uv: readonly [number, number], frame: Rect, fit: CoverFit): [number, number] {
  return [frame.x + fit.ox + uv[0] * fit.dw, frame.y + fit.oy + uv[1] * fit.dh]
}

export function screenToPlateUv(px: readonly [number, number], frame: Rect, fit: CoverFit): [number, number] {
  return [(px[0] - frame.x - fit.ox) / fit.dw, (px[1] - frame.y - fit.oy) / fit.dh]
}

export function screenToNdc(px: readonly [number, number], width: number, height: number): [number, number] {
  return [(px[0] / width) * 2 - 1, -((px[1] / height) * 2 - 1)]
}

/**
 * Mobile lens shift: the projection center moves up so a subject placed at the
 * camera target lands in the middle of the top 62% band (docs/10). Fraction of
 * the viewport height.
 */
export const MOBILE_LENS_SHIFT = 0.19

/** Authored fovs are desktop. Tablet uses 30/28, mobile 32/28 (docs/10). */
export function fovFor(layout: Layout, fov: number): number {
  if (layout === 'mobile') return (fov * 32) / 28
  if (layout === 'tablet') return (fov * 30) / 28
  return fov
}

/** Apply the layout's projection to a camera: fov scaling and the mobile lens shift. */
export function applyLayoutProjection(cam: THREE.PerspectiveCamera, layout: Layout, fov: number, width: number, height: number): void {
  cam.fov = fovFor(layout, fov)
  cam.aspect = width / height
  if (layout === 'mobile') cam.setViewOffset(width, height, 0, height * MOBILE_LENS_SHIFT, width, height)
  else if (cam.view) cam.clearViewOffset()
  cam.updateProjectionMatrix()
}

const tmpCam = new THREE.PerspectiveCamera()
const tmpV = new THREE.Vector3()
const tmpDir = new THREE.Vector3()

/** A camera configured to a timeline pose and layout, for projection math off the render loop. */
export function poseCamera(
  pose: CameraPose,
  layout: Layout,
  width: number,
  height: number,
  out: THREE.PerspectiveCamera = tmpCam,
): THREE.PerspectiveCamera {
  out.near = 0.05
  out.far = 80
  out.position.set(pose.x, pose.y, pose.z)
  out.up.set(0, 1, 0)
  out.lookAt(pose.tx, pose.ty, pose.tz)
  applyLayoutProjection(out, layout, pose.fov, width, height)
  out.updateMatrixWorld(true)
  return out
}

/** Intersect the ray through `ndc` with the plane z = planeZ. */
export function ndcToWorldOnZ(camera: THREE.PerspectiveCamera, ndc: readonly [number, number], planeZ: number, out = new THREE.Vector3()): THREE.Vector3 {
  tmpV.set(ndc[0], ndc[1], 0.5).unproject(camera)
  tmpDir.copy(tmpV).sub(camera.position).normalize()
  const t = (planeZ - camera.position.z) / (tmpDir.z || 1e-6)
  return out.copy(camera.position).addScaledVector(tmpDir, t)
}

/** Bottle extents in group space (docs/06): base at -1.20, cap top at +1.38. */
export const BOTTLE_BASE_Y = -1.2
export const BOTTLE_TOP_Y = 1.38
export const BOTTLE_HEIGHT = BOTTLE_TOP_Y - BOTTLE_BASE_Y

/** Where the bottle stands on the screen composition of a beat. */
export type Placement = {
  /** base center, viewport fraction (origin top-left) */
  base: readonly [number, number]
  /** bottle height, fraction of the viewport height */
  height: number
}

/**
 * Solve the bottle pose that stands the live bottle on a screen composition:
 * its base center at `placement.base` and its cap top `placement.height` above
 * it, for the given camera pose and layout (the mobile lens shift included).
 * Returns group position (body center) and uniform scale.
 */
export function placeBottle(opts: {
  placement: Placement
  pose: CameraPose
  layout: Layout
  width: number
  height: number
  planeZ?: number
}): { x: number; y: number; z: number; s: number } {
  const { width, height, placement } = opts
  const cam = poseCamera(opts.pose, opts.layout, width, height)
  const z = opts.planeZ ?? 0
  const bx = placement.base[0] * width
  const by = placement.base[1] * height
  const ty = (placement.base[1] - placement.height) * height
  const b = ndcToWorldOnZ(cam, screenToNdc([bx, by], width, height), z)
  const t = ndcToWorldOnZ(cam, screenToNdc([bx, ty], width, height), z, new THREE.Vector3())
  const s = (t.y - b.y) / BOTTLE_HEIGHT
  return { x: (b.x + t.x) / 2, y: b.y - BOTTLE_BASE_Y * s, z, s }
}
