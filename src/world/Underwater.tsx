import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { bottleInstance } from '../bottle/instance'
import { UNDERWATER_MODE } from '../experience/config'
import { film } from '../experience/film'
import { count } from '../experience/quality'
import { rng } from './particles/random'
import { createBubbles } from './setsB/bubbles'
import { SURFACE_Y, underwaterIn, underwaterOut } from './setsB/marks'
import { createScreenTriangle, createShaftMaterial, createSurfaceGeometry, createSurfaceMaterial } from './setsB/water'

// The underwater tank (docs/scenes/13, docs/07 Underwater surface). Live mode:
// the waterline plane at y 1.15 seen from below, light shafts from above,
// bubbles rising past the bottle, and the caustic flicker on the glass. The
// camera descends on the timeline, so the waterline climbs the upper third.
// Plate mode (config.ts): the backdrop draws the generated picture (surface and god
// rays baked in); the live shafts, bubbles and caustics stay, at a lighter touch.
//
// In: the surface fades in with the facets → underwater dissolve. Out (local
// 0.78–1.0): bubbles go first, then the shafts and caustics, then the surface;
// a faint highlight on the water is the last thing to leave.

/** The light's direction above the water (its rays converge on screen toward it): up, ahead, a touch left. */
const SUN_DIR = new THREE.Vector3(-0.08, 0.84, -1).normalize()
/** Shafts begin just under the water seen at this elevation (radians above the horizontal). */
const WATERLINE_ELEVATION = 0.09
/** Peak added light of the shafts, linear (the plate's under-surface teal glow). */
const SHAFT_COLOR = new THREE.Color().setRGB(0.03, 0.15, 0.23, THREE.LinearSRGBColorSpace)
/** Bubbles are born out of frame below the bottle and die at the surface. */
const BUBBLE_BIRTH_Y = -2.4
/**
 * Caustic flicker on the glass (bottle/materials.ts). Off until the caustic term is
 * tamed: with world-space uv the iterative function overflows and paints the whole
 * bottle white (see the underwater hold in .shots/bg2).
 */
const CAUSTICS = 1

export function Underwater() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const live = UNDERWATER_MODE === 'live'
  const bubbleCount = count(50, 16, film.tier)

  const built = useMemo(() => {
    const root = new THREE.Group()
    root.name = 'UNDERWATER'
    root.visible = false

    let surface: THREE.Mesh<THREE.BufferGeometry, ReturnType<typeof createSurfaceMaterial>> | null = null
    let shafts: THREE.Mesh<THREE.BufferGeometry, ReturnType<typeof createShaftMaterial>> | null = null
    if (live) {
      surface = new THREE.Mesh(createSurfaceGeometry(), createSurfaceMaterial())
      surface.name = 'water-surface'
      surface.position.y = SURFACE_Y
      surface.frustumCulled = false
      // after the backdrop (-1000) and the shafts, before the lit set: the glass refracts it
      surface.renderOrder = -980
      root.add(surface)
    }

    shafts = new THREE.Mesh(createScreenTriangle(), createShaftMaterial())
    shafts.name = 'water-shafts'
    shafts.frustumCulled = false
    shafts.renderOrder = -990
    root.add(shafts)

    const bubbles = createBubbles(bubbleCount, rng(0x13b0bb1e))
    bubbles.mesh.renderOrder = 3
    bubbles.uniforms.uSpan.value.set(BUBBLE_BIRTH_Y, SURFACE_Y)
    root.add(bubbles.mesh)

    return { root, surface, shafts, bubbles }
  }, [live, bubbleCount])

  useEffect(
    () => () => {
      for (const m of [built.surface, built.shafts]) {
        if (!m) continue
        m.geometry.dispose()
        m.material.dispose()
      }
      built.bubbles.dispose()
      bottleInstance.current?.setCaustics(0)
    },
    [built],
  )

  const state = useMemo(
    () => ({
      caustics: -1,
      up: new THREE.Vector3(),
      v: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
    }),
    [],
  )

  useFrame(() => {
    const local = film.local.underwater
    const enter = underwaterIn(film.time)
    const body = enter * underwaterOut(local, 'surface')
    const glint = enter * underwaterOut(local, 'highlight')
    const rays = enter * underwaterOut(local, 'shafts')
    const fizz = enter * underwaterOut(local, 'bubbles')
    const caustics = CAUSTICS * enter * underwaterOut(local, 'caustics')

    // the bottle owns the flicker; only tell it when the value moves
    const bottle = bottleInstance.current
    if (bottle && Math.abs(caustics - state.caustics) > 1e-4) {
      state.caustics = caustics
      bottle.setCaustics(caustics)
    }

    const visible = Math.max(body, glint, rays, fizz) > 0.0005
    built.root.visible = visible
    if (!visible) return

    const el = film.elapsed
    camera.updateMatrixWorld()
    const pixel = 0.5 * camera.projectionMatrix.elements[5] * film.height * gl.getPixelRatio()

    if (built.surface) {
      const u = built.surface.material.uniforms
      u.uTime.value = el
      u.uBody.value = body
      u.uGlint.value = glint
      built.surface.visible = body > 0.0005 || glint > 0.0005
    }

    if (built.shafts) {
      const u = built.shafts.material.uniforms
      built.shafts.visible = rays > 0.0005
      u.uTime.value = el
      u.uAspect.value = film.width / Math.max(film.height, 1)
      u.uColor.value.copy(SHAFT_COLOR).multiplyScalar(rays * (live ? 1 : 0.6))
      // the rays converge toward the light's direction (a point at infinity)
      const v = state.v.copy(SUN_DIR).multiplyScalar(60).add(camera.position).project(camera)
      u.uSun.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5)
      // and begin just under the water seen at a low elevation, straight ahead
      const h = SURFACE_Y - camera.position.y
      camera.getWorldDirection(state.fwd)
      state.fwd.y = 0
      if (state.fwd.lengthSq() < 1e-6) state.fwd.set(0, 0, -1)
      state.fwd.normalize()
      const reach = Math.max(h, 0.05) / Math.tan(WATERLINE_ELEVATION)
      v.copy(camera.position).addScaledVector(state.fwd, reach)
      v.y = SURFACE_Y
      v.project(camera)
      u.uWaterline.value = v.y * 0.5 + 0.5
    }

    const bu = built.bubbles.uniforms
    bu.uTime.value = el
    bu.uFade.value = fizz
    bu.uPixel.value = pixel
    if (bottle) {
      const g = bottle.group
      bu.uBottle.value.copy(g.position)
      bu.uUp.value.set(0, 1, 0).applyEuler(g.rotation)
    }
  })

  return <primitive object={built.root} />
}
