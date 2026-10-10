import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { film, ramp } from '../experience/film'
import { playDrop } from '../experience/audio'
import { DROP_ARM_AFTER, DROP_BORN, DROP_IMPACT, DROP_RADIUS, DROP_START_Y, OPENING_IMPACT, clamp01, power2In } from './setsA/constants'
import { createDropGate, stepDropGate } from './setsA/dropSound'

// The opening drop (docs/scenes/00). One water droplet is born above the frame,
// falls with power2.in and lands at the impact point, where the ripple takes over.
// The fall is a pure function of opening local progress, so scrubbing back reverses it.
// A faint cool point light rides above it; the light object never leaves the scene
// (only its intensity moves) so the light count, and every compiled program, stays put.

const LIGHT_PEAK = 2
/** Light offset from the drop: above, a little left and toward the camera, so the highlight sits upper left. */
const LIGHT_OFFSET = new THREE.Vector3(-0.32, 0.95, 0.75)

export function Drop() {
  const parts = useMemo(() => {
    const root = new THREE.Group()
    root.name = 'opening-drop'

    const geometry = new THREE.SphereGeometry(DROP_RADIUS, 48, 32)
    const material = new THREE.MeshPhysicalMaterial({
      color: '#e7f1f6',
      metalness: 0,
      roughness: 0.02,
      transmission: 1,
      thickness: DROP_RADIUS * 2,
      ior: 1.33,
      specularIntensity: 1,
      envMapIntensity: 1.1,
    })
    // Water, not chrome. The body stays dark (it refracts the dark set). Light that enters
    // the top focuses into a thin crescent just inside the rim opposite the light, the
    // silhouette carries a faint refracted outline, and the drop light leaves one crisp glint.
    const glow = { value: 0 }
    const lightPos = { value: new THREE.Vector3() }
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uDropGlow = glow
      shader.uniforms.uDropLight = lightPos
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform float uDropGlow;\nuniform vec3 uDropLight;\nvoid main() {')
        .replace(
          '#include <opaque_fragment>',
          /* glsl */ `
          {
            vec3 n = geometryNormal;
            vec3 lW = normalize(uDropLight - vWorldPosition);
            vec3 lV = normalize((viewMatrix * vec4(lW, 0.0)).xyz);
            vec2 axis = normalize(-lV.xy + vec2(0.0, -1e-3));
            float rho = length(n.xy);
            float side = pow(saturate(dot(n.xy / max(rho, 1e-4), axis)), 2.2);
            float crescent = smoothstep(0.52, 0.76, rho) * (1.0 - smoothstep(0.86, 0.97, rho)) * side;
            float outline = smoothstep(0.88, 0.99, rho) * (0.3 + 0.7 * side);
            float glint = pow(saturate(dot(n, normalize(lV + geometryViewDir))), 300.0);
            outgoingLight += uDropGlow * (vec3(0.86, 0.92, 0.96) * 1.15 * crescent + vec3(0.62, 0.72, 0.80) * 0.2 * outline + vec3(2.6) * glint);
          }
          #include <opaque_fragment>`,
        )
    }
    material.customProgramCacheKey = () => 'iona-opening-drop'

    const drop = new THREE.Mesh(geometry, material)
    drop.name = 'opening-drop-mesh'
    drop.visible = false
    drop.renderOrder = 2

    const light = new THREE.PointLight('#d5e4ee', 0, 6, 2)
    light.name = 'opening-drop-light'
    light.position.set(OPENING_IMPACT.x + LIGHT_OFFSET.x, DROP_START_Y + LIGHT_OFFSET.y, OPENING_IMPACT.z + LIGHT_OFFSET.z)

    root.add(drop, light)
    return { root, drop, light, geometry, material, glow, lightPos, gate: createDropGate() }
  }, [])

  useEffect(
    () => () => {
      parts.geometry.dispose()
      parts.material.dispose()
      parts.light.dispose()
    },
    [parts],
  )

  const gateOpts = useMemo(
    () => ({ ready: false, midFilm: false, born: DROP_BORN, impact: DROP_IMPACT, armAfter: DROP_ARM_AFTER }),
    [],
  )

  useFrame(() => {
    const l = film.local.opening
    const { drop, light, glow } = parts

    // the drop sound: once per arrival from the top, forward crossings only, never on a deep link
    gateOpts.ready = film.ready
    gateOpts.midFilm = film.arrivedMidFilm
    if (stepDropGate(parts.gate, l, film.delta, gateOpts)) playDrop()

    const falling = l >= DROP_BORN && l < DROP_IMPACT
    drop.visible = falling
    const p = clamp01((l - DROP_BORN) / (DROP_IMPACT - DROP_BORN))
    const y = OPENING_IMPACT.y + DROP_START_Y * (1 - power2In(p))
    if (falling) drop.position.set(OPENING_IMPACT.x, y, OPENING_IMPACT.z)
    glow.value = falling ? 1 : 0

    // Light: present for the fall, gone shortly after the impact (the hero bottle must not catch it).
    const env = ramp(DROP_BORN - 0.05, DROP_BORN + 0.02, l) * (1 - ramp(DROP_IMPACT, DROP_IMPACT + 0.12, l))
    light.intensity = LIGHT_PEAK * env
    light.position.set(OPENING_IMPACT.x + LIGHT_OFFSET.x, Math.max(y, OPENING_IMPACT.y) + LIGHT_OFFSET.y, OPENING_IMPACT.z + LIGHT_OFFSET.z)
    parts.lightPos.value.copy(light.position)
  })

  return <primitive object={parts.root} />
}
