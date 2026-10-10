import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { film } from '../experience/film'
import { count } from '../experience/quality'
import { OUTPUT } from './particles/glsl'
import { CameraFrame } from './particles/frame'
import { softMaterial } from './particles/material'
import { rng } from './particles/random'

// Ambient dust (docs/07 "Particles"): motes drifting in the air between the
// camera and the set, lit like the scene. One instanced draw. The volume rides
// with the camera (view-space positions, wrapped), so every beat has motes
// without placing them; `film.look.dust` scales how many are visible.

const VERT = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aSeed;   // x,y,z unit position in the volume, w size
attribute vec2 aPhase;  // drift phase, speed
uniform float uTime;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform vec3 uOrigin;
uniform vec3 uHalf;     // half extents per unit depth (x, y) and the depth range (z)
uniform float uPixel;
uniform float uDensity;
uniform float fogDensity;
varying vec2 vQ;
varying float vLight;
varying float vPx;

void main() {
  // slow drift, wrapped inside the unit volume
  float t = uTime * aPhase.y;
  vec3 p = aSeed.xyz;
  p.x = fract(p.x + t * 0.012 + 0.02 * sin(t * 0.7 + aPhase.x * 6.2832));
  p.y = fract(p.y + t * 0.0075 + 0.015 * cos(t * 0.53 + aPhase.x * 4.1));
  p.z = fract(p.z + 0.004 * sin(t * 0.41 + aPhase.x * 2.7));
  // which motes are on: the density threshold cuts the field by seed, not by fading everything
  float on = step(fract(aPhase.x * 7.31), uDensity);
  float depth = 1.2 + p.z * uHalf.z;
  vec3 world = uOrigin + uFwd * depth + uRight * ((p.x * 2.0 - 1.0) * uHalf.x * depth) + uUp * ((p.y * 2.0 - 1.0) * uHalf.y * depth);
  float size = aSeed.w;
  float px = size * uPixel / depth;
  float grow = max(1.2 / max(px, 1e-3), 1.0);
  vPx = px * grow;
  vec3 wp = world + (uRight * aCorner.x + uUp * aCorner.y) * size * grow;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  vQ = aCorner;
  float fog = 1.0 - exp(-fogDensity * fogDensity * depth * depth);
  // nearer motes read brighter and softer; far ones are faint points
  vLight = on * (1.0 - fog * 0.6) / (grow * grow) * mix(0.35, 1.0, 1.0 - p.z);
}
`

const FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vQ;
varying float vLight;
varying float vPx;
void main() {
  float r2 = dot(vQ, vQ);
  float soft = exp(-r2 * 3.2) * (1.0 - smoothstep(0.7, 1.0, sqrt(r2)));
  float light = soft * vLight;
  gl_FragColor = vec4(uColor * light, 0.0);
  ${OUTPUT}
}
`

export function Dust() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const n = count(180, 60, film.tier)

  const built = useMemo(() => {
    const rand = rng(8081)
    const seed = new Float32Array(n * 4)
    const phase = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      seed[i * 4] = rand()
      seed[i * 4 + 1] = rand()
      seed[i * 4 + 2] = rand()
      seed[i * 4 + 3] = 0.0015 + rand() * rand() * 0.006
      phase[i * 2] = rand()
      phase[i * 2 + 1] = 0.6 + rand() * 0.9
    }
    const geometry = new THREE.InstancedBufferGeometry()
    geometry.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2))
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3))
    geometry.setIndex([0, 1, 2, 0, 2, 3])
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4))
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 2))
    geometry.instanceCount = n
    const uniforms = {
      uTime: { value: 0 },
      uRight: { value: new THREE.Vector3(1, 0, 0) },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uFwd: { value: new THREE.Vector3(0, 0, -1) },
      uOrigin: { value: new THREE.Vector3() },
      uHalf: { value: new THREE.Vector3(0.6, 0.4, 5) },
      uPixel: { value: 1000 },
      uDensity: { value: 1 },
      uColor: { value: new THREE.Color('#d5e4ee').multiplyScalar(0.32) },
    }
    const material = softMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, fog: true, depthTest: true })
    material.name = 'iona-dust'
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'DUST'
    mesh.frustumCulled = false
    mesh.renderOrder = 5
    const frame = new CameraFrame()
    const dispose = () => {
      geometry.dispose()
      material.dispose()
    }
    return { mesh, uniforms, frame, dispose }
  }, [n])

  useEffect(() => () => built.dispose(), [built])

  useFrame(() => {
    const u = built.uniforms
    const f = built.frame.update(camera)
    u.uTime.value = film.elapsed
    u.uRight.value.copy(f.right)
    u.uUp.value.copy(f.up)
    u.uFwd.value.copy(f.fwd)
    u.uOrigin.value.copy(f.pos)
    // the visible half extents per unit depth, a little wider than the frame
    u.uHalf.value.set(1.15 / f.sx, 1.15 / f.sy, 5)
    u.uPixel.value = (film.height * f.sy) / 2
    u.uDensity.value = Math.min(Math.max(film.look.dust, 0), 1)
    built.mesh.visible = film.look.dust > 0.01
  }, -1)

  return <primitive object={built.mesh} />
}
