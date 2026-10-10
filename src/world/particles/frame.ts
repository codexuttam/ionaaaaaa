import * as THREE from 'three'
import type { Layout } from '../../experience/film'
import { coverFit, plateFrame, plateUvToScreen, screenToNdc } from '../../experience/plateSpace'
import { BACKDROP_ASPECT, type UV } from '../../experience/plateMeta'
import { SCENE_BY_ID, sceneFraming, type SceneId } from '../../experience/scenes'

/**
 * The live camera's basis and projection terms, sampled once per frame.
 * Everything that lives in camera space (fog cards, the dust volume, emitters
 * locked to a feature of a backdrop) is placed through this, including the mobile
 * lens shift (a view offset), without allocating.
 *
 * View-space position at depth d under NDC (x, y): ( d·(x + ax)/sx , d·(y + ay)/sy , −d ).
 */
export class CameraFrame {
  readonly pos = new THREE.Vector3()
  readonly right = new THREE.Vector3()
  readonly up = new THREE.Vector3()
  readonly fwd = new THREE.Vector3()
  sx = 1
  sy = 1
  ax = 0
  ay = 0

  update(cam: THREE.PerspectiveCamera): this {
    this.pos.copy(cam.position)
    this.right.set(1, 0, 0).applyQuaternion(cam.quaternion)
    this.up.set(0, 1, 0).applyQuaternion(cam.quaternion)
    this.fwd.set(0, 0, -1).applyQuaternion(cam.quaternion)
    const e = cam.projectionMatrix.elements
    this.sx = e[0]
    this.sy = e[5]
    this.ax = e[8]
    this.ay = e[9]
    return this
  }

  /** Half width / height of the visible rectangle at view depth d, world units. */
  halfW(d: number): number {
    return d / this.sx
  }

  halfH(d: number): number {
    return d / this.sy
  }

  /** View-space x / y of NDC (x, y) at depth d. */
  viewX(ndcX: number, d: number): number {
    return (d * (ndcX + this.ax)) / this.sx
  }

  viewY(ndcY: number, d: number): number {
    return (d * (ndcY + this.ay)) / this.sy
  }

  /** World point from view-space (x, y) at depth d. */
  fromView(x: number, y: number, d: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.pos).addScaledVector(this.fwd, d).addScaledVector(this.right, x).addScaledVector(this.up, y)
  }

  /** World point under NDC (x, y) at view depth d. */
  ndcToWorld(ndcX: number, ndcY: number, d: number, out: THREE.Vector3): THREE.Vector3 {
    return this.fromView(this.viewX(ndcX, d), this.viewY(ndcY, d), d, out)
  }

  /** Unit direction of the ray through NDC (x, y). */
  ray(ndcX: number, ndcY: number, out: THREE.Vector3): THREE.Vector3 {
    return out
      .copy(this.fwd)
      .addScaledVector(this.right, (ndcX + this.ax) / this.sx)
      .addScaledVector(this.up, (ndcY + this.ay) / this.sy)
      .normalize()
  }
}

/**
 * Backdrop UV of a scene's picture → NDC, for the given layout and viewport
 * (the beat's base framing, before Ken Burns). Called on resize only
 * (plateUvToScreen allocates).
 */
export function scenePlateUvToNdc(scene: SceneId, uv: UV, layout: Layout, width: number, height: number, out: [number, number]): [number, number] {
  if (!SCENE_BY_ID[scene].backdrop) {
    out[0] = uv[0] * 2 - 1
    out[1] = 1 - uv[1] * 2
    return out
  }
  const frame = plateFrame(layout, width, height)
  const fit = coverFit(frame, BACKDROP_ASPECT, sceneFraming(scene, layout === 'mobile'))
  const ndc = screenToNdc(plateUvToScreen(uv, frame, fit), width, height)
  out[0] = ndc[0]
  out[1] = ndc[1]
  return out
}

/** Viewport y (0 top … 1 bottom) of a backdrop-UV y in a scene's cover fit; built scenes pass through. */
export function scenePlateYToViewport(scene: SceneId, uvY: number, layout: Layout, width: number, height: number): number {
  if (!SCENE_BY_ID[scene].backdrop) return uvY
  const frame = plateFrame(layout, width, height)
  const fit = coverFit(frame, BACKDROP_ASPECT, sceneFraming(scene, layout === 'mobile'))
  return (frame.y + fit.oy + uvY * fit.dh) / height
}

/** A cheap key that changes whenever cover-fit results can change. */
export function layoutKey(layout: Layout, width: number, height: number): string {
  return `${layout}:${width}x${height}`
}
