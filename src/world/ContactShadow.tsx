import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { film } from '../experience/film'
import { rig } from '../experience/rig'
import { FLOAT_PERIOD, bottleLive } from '../experience/bottleMotion'

// A soft contact shadow under the floating bottle on the white alkaline ground,
// as under a product shot on a white sweep: it grounds the bottle and keeps its
// base from melting into the white. It tightens and darkens as the bottle's idle
// float brings it closer. One transparent plane with a baked radial falloff; it
// sits in the scene from the start (so the shader warm-up compiles it) and is
// only drawn while the alkaline beat is on screen.

/** Gap between the base and the shadow plane, world units at scale 1. */
const GAP = 0.2

function shadowTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(34, 46, 56, 1)')
  g.addColorStop(0.35, 'rgba(34, 46, 56, 0.55)')
  g.addColorStop(0.7, 'rgba(34, 46, 56, 0.14)')
  g.addColorStop(1, 'rgba(34, 46, 56, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.name = 'iona-contact-shadow'
  return texture
}

export function ContactShadow() {
  const parts = useMemo(() => {
    const map = shadowTexture()
    const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: 0, fog: false, toneMapped: false })
    material.name = 'iona-contact-shadow'
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
    mesh.name = 'contact-shadow'
    mesh.rotation.x = -Math.PI / 2
    // drawn before the glass, which refracts the ground it stands over
    mesh.renderOrder = -1
    mesh.visible = false
    return { map, material, mesh }
  }, [])

  useEffect(
    () => () => {
      parts.map.dispose()
      parts.material.dispose()
      parts.mesh.geometry.dispose()
    },
    [parts],
  )

  useFrame(() => {
    const p = film.presence.alkaline * rig.bottle.fade
    parts.mesh.visible = p > 0.002
    if (!parts.mesh.visible) return
    const b = rig.bottle
    const L = bottleLive
    // closer to the ground (float down): a tighter, darker shadow
    const lift = 0.5 + 0.5 * Math.sin((film.elapsed / FLOAT_PERIOD) * Math.PI * 2)
    const s = L.s
    // on the ground under the rendered bottle (its bob only tightens and darkens the shadow)
    parts.mesh.position.set(L.base.x, L.base.y - L.float - GAP * s, L.base.z)
    parts.mesh.scale.set(1.5 * s * (1 + 0.08 * lift), 0.5 * s * (1 + 0.08 * lift), 1)
    parts.material.opacity = 0.5 * p * (1 - 0.25 * lift * b.float)
  })

  return <primitive object={parts.mesh} />
}
