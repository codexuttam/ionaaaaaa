import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { bottleInstance } from '../bottle/instance'
import { film, type Layout } from '../experience/film'
import { fovFor } from '../experience/plateSpace'
import { count } from '../experience/quality'
import { rig } from '../experience/rig'
import { rng } from './particles/random'
import { BEAM_FALL, BEAM_SHAPES, BEAM_TINT, createBeamDust, createBeamMaterial, createBeamProxy } from './setsB/beams'
import { BEAM_X, BEAM_Y, BEAM_Z, beamDrift, beamEnvelope, beamSway } from './setsB/marks'

// Spotlight beams (docs/07 Beams, docs/scenes/07, 08, 09). Three spot lights
// from y = 6 aimed at the cap give the black cap and the facets their light;
// three soft volumetric shafts stand behind the bottle where the plate shows
// them, and dust drifts down inside them. Born at standard local 0.85 at zero,
// strongest in the spotlight hold, gone by tomorrow local 0.2.
//
// The lights never leave the scene and are never hidden (only their intensity
// moves), so the light count and every compiled program stay put.

/** Peak candela of one spot at full strength (distance 12, decay 2). */
const LIGHT_PEAK = 14
/** The visible shafts pivot on a point above, closer together than at the cap, so they open downward like the plate's. */
const APEX_PULL = 0.45
const APEX_Y = BEAM_Y + 0.2
/** Shaft x at the anchor height on desktop: the plate's left / middle / right beams relative to the cap. */
const SHAFT_X: readonly [number, number, number] = [-0.9, -0.2, 0.72]
/** The beams' brightest band sits just above the cap top. */
const ANCHOR_ABOVE_CAP = 0.15
/** Spotlight hold camera distance to the bottle (timeline.ts), used to fit the shafts to narrow frames. */
const HOLD_DIST: Readonly<Record<Layout, number>> = { desktop: 2.4, tablet: 2.4, mobile: 3.1 }
const DOWN = new THREE.Vector3(0, -1, 0)
const DUST_COLOR = new THREE.Color('#e4eef5')

/** Horizontal spread of the shafts for this frame shape, 1 at 16:10 desktop (the plate's spacing). */
function shaftSpread(layout: Layout, width: number, height: number): number {
  const deg = THREE.MathUtils.degToRad
  const half = Math.tan(deg(fovFor(layout, 24) / 2)) * (HOLD_DIST[layout] - BEAM_Z) * (width / Math.max(height, 1))
  const ref = Math.tan(deg(12)) * (HOLD_DIST.desktop - BEAM_Z) * 1.6
  return THREE.MathUtils.clamp(half / ref, 0.38, 1.12)
}

export function Beams() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const dustCount = count(60, 16, film.tier)

  const built = useMemo(() => {
    const root = new THREE.Group()
    root.name = 'SPOTLIGHT_BEAMS'

    const lights = BEAM_X.map((x, i) => {
      const light = new THREE.SpotLight('#f7fbff', 0, 12, 0.16, 0.55, 2)
      light.name = `beam-light-${i}`
      light.position.set(x, BEAM_Y, BEAM_Z)
      const target = new THREE.Object3D()
      target.name = `beam-target-${i}`
      light.target = target
      root.add(light, target)
      return { light, target }
    })

    const visuals = new THREE.Group()
    visuals.name = 'beam-visuals'
    visuals.visible = false
    root.add(visuals)

    const cones = BEAM_SHAPES.map((shape, i) => {
      const geometry = createBeamProxy(shape, APEX_Y - 1.5, APEX_Y + 2.6)
      const material = createBeamMaterial()
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = `beam-shaft-${i}`
      mesh.frustumCulled = false
      // after the backdrop (-1000), before everything lit
      mesh.renderOrder = -900
      visuals.add(mesh)
      return { mesh, geometry, material, shape }
    })

    const dust = createBeamDust(dustCount, rng(0x5b0f1d))
    dust.points.renderOrder = 2
    visuals.add(dust.points)

    return { root, visuals, lights, cones, dust }
  }, [dustCount])

  useEffect(
    () => () => {
      built.lights.forEach(({ light }) => light.dispose())
      built.cones.forEach(({ geometry, material }) => {
        geometry.dispose()
        material.dispose()
      })
      built.dust.dispose()
    },
    [built],
  )

  const state = useMemo(
    () => ({
      key: '',
      spread: 1,
      cap: new THREE.Vector3(),
      apex: new THREE.Vector3(),
      through: new THREE.Vector3(),
      axis: new THREE.Vector3(),
    }),
    [],
  )

  useFrame(() => {
    const strength = beamEnvelope(film.time)
    const el = film.elapsed
    const b = rig.bottle
    const tablet = film.layout === 'tablet' ? 0.92 : 1
    const bottle = bottleInstance.current
    const capCenter = bottle?.anchors.capCenter.y ?? 1.28
    const capTop = bottle?.anchors.capTop.y ?? 1.38

    // the lights aim at the live cap (pose + pointer, as BottleRig placed it this frame)
    const cap = state.cap
    if (bottle) {
      const g = bottle.group
      cap.set(0, capCenter, 0).multiplyScalar(g.scale.y).applyEuler(g.rotation).add(g.position)
    } else {
      cap.set(b.x, b.y + capCenter * b.s * tablet, b.z)
    }
    for (let i = 0; i < 3; i++) {
      const { light, target } = built.lights[i]
      light.intensity = LIGHT_PEAK * strength * beamDrift(i, el)
      target.position.set(cap.x + beamSway(i, el), cap.y, cap.z)
    }

    const visible = strength > 0.0005
    built.visuals.visible = visible
    if (!visible) return

    const key = `${film.layout}:${film.width}x${film.height}`
    if (key !== state.key) {
      state.key = key
      state.spread = shaftSpread(film.layout, film.width, film.height)
    }
    const spread = state.spread
    const sigmaScale = 0.55 + 0.45 * spread
    // world-anchored: the scroll pose of the cap, not the float or the pointer
    const anchorY = b.y + capTop * b.s * tablet + ANCHOR_ABOVE_CAP

    const du = built.dust.uniforms
    du.uAnchorY.value = anchorY
    du.uTime.value = el
    du.uColor.value.copy(DUST_COLOR)
    du.uPixel.value = 0.5 * camera.projectionMatrix.elements[5] * film.height * gl.getPixelRatio()

    for (let i = 0; i < 3; i++) {
      const { mesh, material, shape } = built.cones[i]
      const u = material.uniforms
      const sway = beamSway(i, el)
      const x = SHAFT_X[i] * spread
      state.apex.set(x * APEX_PULL, APEX_Y, BEAM_Z)
      state.through.set(x + sway, anchorY, BEAM_Z)
      state.axis.subVectors(state.through, state.apex).normalize()
      mesh.position.copy(state.apex)
      mesh.quaternion.setFromUnitVectors(DOWN, state.axis)

      const light = shape.gain * strength * beamDrift(i, el)
      u.uApex.value.copy(state.apex)
      u.uAxis.value.copy(state.axis)
      u.uAnchorY.value = anchorY
      u.uShape.value.set(shape.sigma * sigmaScale, shape.grow * sigmaScale, BEAM_FALL, 0)
      u.uColor.value.copy(BEAM_TINT).multiplyScalar(light)
      u.uTime.value = el

      du.uApex.value[i].copy(state.apex)
      du.uAxis.value[i].copy(state.axis)
      du.uBeam.value[i].set(shape.sigma * sigmaScale, shape.grow * sigmaScale, light * 2.4)
    }
  })

  return <primitive object={built.root} />
}
