import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { film, ramp } from '../experience/film'
import { rig } from '../experience/rig'
import { TIERS } from '../experience/quality'
import { bottleInstance } from '../bottle/instance'
import type { IonaBottle } from '../bottle/types'
import {
  CAP_DROPLETS_IN,
  CAP_DROPLETS_OUT,
  SWEEP_BACK,
  SWEEP_HEIGHT,
  SWEEP_LAST_LOCAL,
  SWEEP_PEAK,
  SWEEP_X,
  smooth01,
} from './setsA/constants'
import { capDims, layoutBeads, placeBead, type CapDims } from './setsA/capDroplets'
import { createDropletGeometry, createDropletMaterial } from './setsA/dropletMaterial'

// The cap macro's water and light (docs/scenes/02).
// Droplets: TIERS[tier].capDroplets beads parented to the live bottle's capSocket, so
// they ride every pose, float and pointer tilt of the bottle. They slide on the loop
// clock and show from the hero's dolly (hero local ~.8) until the cap leaves (local ~.9).
// Sweep: a narrow spot crossing the cap top from x -0.4 to 0.4 in cap space, scrubbed
// by rig.light.capSweep. The light lives in its own always-visible group and only its
// intensity moves, so the light count (and every compiled program) never changes.

const KEY_COLOR = new THREE.Color('#e7eef5')
const RIM_COLOR = new THREE.Color('#9fd0e0')
const SWEEP_COLOR = new THREE.Color('#f4f8fb')
const ENV_TOP = new THREE.Color('#9eb4c4').multiplyScalar(0.22)
/** Base intensities of the bottle rig (docs/06), scaled by film.look like Experience's Lights. */
const KEY_INTENSITY = 2.4
const RIM_INTENSITY = 3.2

export function CapDroplets() {
  const parts = useMemo(() => {
    const count = TIERS[film.tier].capDroplets
    const beads = layoutBeads(count)
    const geometry = createDropletGeometry()
    const tails = new Float32Array(Math.max(count, 1))
    const tailAttr = new THREE.InstancedBufferAttribute(tails, 1)
    tailAttr.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aTail', tailAttr)
    const seeds = new Float32Array(Math.max(count, 1))
    beads.forEach((b, i) => (seeds[i] = b.seed))
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
    const material = createDropletMaterial()
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(count, 1))
    mesh.name = 'cap-droplets'
    mesh.count = count
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    // after the cap (and the glass) so the beads composite over the lacquer
    mesh.renderOrder = 12
    mesh.visible = false

    const lights = new THREE.Group()
    lights.name = 'cap-sweep-rig'
    const sweep = new THREE.SpotLight(SWEEP_COLOR, 0, 6, 0.14, 0.7, 2)
    sweep.name = 'cap-sweep'
    sweep.position.set(0, 50, 0)
    const target = new THREE.Object3D()
    target.name = 'cap-sweep-target'
    sweep.target = target
    lights.add(sweep, target)

    return {
      beads,
      geometry,
      material,
      mesh,
      tailAttr,
      lights,
      sweep,
      target,
      matrix: new THREE.Matrix4(),
      tmp: new THREE.Vector3(),
      attached: null as IonaBottle | null,
      dims: null as CapDims | null,
    }
  }, [])

  // attach to the live bottle before the shader warm-up runs (Experience.tsx compiles what is in the
  // scene; nothing renders before it, so the first frame callback would come too late)
  useLayoutEffect(() => {
    const bottle = bottleInstance.current
    if (bottle && parts.attached !== bottle) {
      bottle.capSocket.add(parts.mesh)
      parts.dims = capDims(bottle.anchors)
      parts.attached = bottle
    }
  }, [parts])

  useEffect(
    () => () => {
      parts.mesh.removeFromParent()
      parts.geometry.dispose()
      parts.material.dispose()
      parts.sweep.dispose()
    },
    [parts],
  )

  useFrame(() => {
    const { mesh, sweep, target, tmp } = parts
    const bottle = bottleInstance.current

    // follow the one live bottle (it is rebuilt on hot reload)
    if (bottle !== parts.attached) {
      if (bottle) {
        bottle.capSocket.add(mesh)
        parts.dims = capDims(bottle.anchors)
      } else {
        mesh.removeFromParent()
        parts.dims = null
      }
      parts.attached = bottle
    }

    const fade = rig.bottle.fade
    const lh = film.local.hero
    const lc = film.local.cap

    // ---- sweep: scrubbed position, intensity enveloped so it never pops
    const s = rig.light.capSweep
    let env = 0
    if (s >= 0 && lc < SWEEP_LAST_LOCAL) env = smooth01(0, 0.12, s) * (1 - smooth01(0.86, 1, s))
    env *= fade
    sweep.intensity = SWEEP_PEAK * env
    if (bottle && env > 0) {
      const socket = bottle.capSocket
      socket.updateWorldMatrix(true, false)
      const x = SWEEP_X[0] + (SWEEP_X[1] - SWEEP_X[0]) * s
      sweep.position.copy(tmp.set(x, SWEEP_HEIGHT, -SWEEP_BACK).applyMatrix4(socket.matrixWorld))
      // aim at where the reflection lands on the top face (about halfway between camera and light in x)
      target.position.copy(tmp.set(x * 0.45, 0, -0.06).applyMatrix4(socket.matrixWorld))
      target.updateMatrixWorld()
    }

    // ---- droplets
    const w =
      ramp(CAP_DROPLETS_IN[0], CAP_DROPLETS_IN[1], lh) *
      (1 - ramp(CAP_DROPLETS_OUT[0], CAP_DROPLETS_OUT[1], lc)) *
      Math.min(film.presence.hero + film.presence.cap, 1) *
      fade
    const dims = parts.dims
    mesh.visible = w > 0.002 && dims !== null && mesh.count > 0
    if (!mesh.visible || !dims) return

    const t = film.elapsed
    const tails = parts.tailAttr.array as Float32Array
    for (let i = 0; i < mesh.count; i++) {
      tails[i] = placeBead(parts.beads[i], t, dims, parts.matrix)
      mesh.setMatrixAt(i, parts.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    parts.tailAttr.needsUpdate = true

    const u = parts.material.uniforms
    const look = film.look
    u.uOpacity.value = w
    u.uKeyCol.value.copy(KEY_COLOR).multiplyScalar(KEY_INTENSITY * look.key * 0.5)
    u.uRimCol.value.copy(RIM_COLOR).multiplyScalar(RIM_INTENSITY * look.rim * 0.32)
    u.uSweepCol.value.copy(SWEEP_COLOR).multiplyScalar(sweep.intensity * 0.22)
    u.uSweepPos.value.copy(sweep.position)
    u.uEnvTop.value.copy(ENV_TOP)
    u.uEnvLow.value.copy(look.ground).multiplyScalar(0.6)
  })

  return <primitive object={parts.lights} />
}
