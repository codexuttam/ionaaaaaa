import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { bottleLive } from '../experience/bottleMotion'
import { film } from '../experience/film'
import { count } from '../experience/quality'
import { rig } from '../experience/rig'
import { OUTPUT } from './particles/glsl'
import { softMaterial } from './particles/material'
import { rng } from './particles/random'

// Water falling through the waterfall beat (docs/scenes/11): drops come down out
// of the top of the frame round the bottle, in front of it and behind it, hit the
// wet rock it stands on and splash: a bright hit and a ring that opens and fades
// on the stone. One instanced draw, all of it in the vertex
// shader on the film clock (no per-frame writes): each drop runs its own cycle of
// fall, splash and a random wait, so they never fall in step.
//
// A falling drop is drawn as the streak it leaves in one frame (motion blur), its
// length set by its speed; near drops are larger and softer than far ones.

const VERT = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aSeed;   // x, z in -1..1 round the bottle, speed 0..1, phase 0..1
uniform float uTime;
uniform vec3 uCenter;   // the base of the bottle (the rock under it)
uniform vec3 uSpread;   // half extents x, z, and the fall height
uniform float uScale;
varying vec2 vQ;
varying float vMode;    // 0 streak, 1 splash, 3 waiting
varying float vAge;
varying float vFade;

const float RING_T = 0.36;

void main() {
  // a touch slower than life (a drop past a bottle this size takes a twentieth of a second): the fall still reads
  float speed = mix(9.0, 14.0, aSeed.z) * uScale;
  float fallT = uSpread.z / speed;
  float wait = 0.15 + fract(aSeed.w * 7.13) * 1.4;
  float cycle = fallT + RING_T + wait;
  float t = mod(uTime + aSeed.w * 23.0, cycle);
  // a drop lands somewhere new on every cycle
  float k = floor((uTime + aSeed.w * 23.0) / cycle);
  vec2 jitter = vec2(fract(sin(k * 12.9898 + aSeed.w * 78.233) * 43758.5453), fract(sin(k * 39.346 + aSeed.x * 11.135) * 23421.631)) - 0.5;
  vec3 at = uCenter + vec3((aSeed.x + jitter.x * 0.35) * uSpread.x, 0.0, (aSeed.y + jitter.y * 0.35) * uSpread.y);
  // the bottle itself stands in the way: drops behind its footprint land on its far side instead
  vec2 off = at.xz - uCenter.xz;
  float clear = 0.42 * uScale;
  if (length(off) < clear) at.xz = uCenter.xz + normalize(off + vec2(1e-3)) * clear;

  vec3 viewDir = normalize(cameraPosition - at);
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), viewDir));
  vec3 wp;
  vFade = 1.0;
  if (t < fallT) {
    // the streak: thin, as long as the drop travels in about a frame and a half
    vec3 head = at + vec3(0.0, uSpread.z - speed * t, 0.0);
    float len = speed * 0.02;
    float width = (0.0035 + 0.003 * aSeed.z) * uScale;
    wp = head + side * (aCorner.x * width) + vec3(0.0, (aCorner.y * 0.5 + 0.5) * len, 0.0);
    vMode = 0.0;
    vAge = t / fallT;
    // they come out of the top of the frame, already falling
    vFade = smoothstep(0.0, 0.08, vAge);
  } else if (t < fallT + RING_T) {
    float age = (t - fallT) / RING_T;
    vAge = age;
    // a ring on the stone, flat, opening fast and slowing
    float r = mix(0.015, 0.11, sqrt(age)) * uScale;
    vec3 fwd = normalize(vec3(viewDir.x, 0.0, viewDir.z));
    vec3 rgt = vec3(fwd.z, 0.0, -fwd.x);
    wp = at + vec3(0.0, 0.003, 0.0) + rgt * (aCorner.x * r) + fwd * (aCorner.y * r);
    vMode = 1.0;
  } else {
    // waiting above the frame: degenerate, never drawn
    wp = vec3(0.0, -1000.0, 0.0);
    vMode = 3.0;
    vAge = 0.0;
  }
  vQ = aCorner;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  // far drops fade into the air
  vFade *= 1.0 - smoothstep(4.0, 9.0, distance(cameraPosition, at));
}
`

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vQ;
varying float vMode;
varying float vAge;
varying float vFade;
void main() {
  float a = 0.0;
  if (vMode < 0.5) {
    // a soft line, brightest at the drop (its lower end), thinning into its blur above
    float x = abs(vQ.x);
    float y = vQ.y * 0.5 + 0.5;
    a = (1.0 - smoothstep(0.25, 1.0, x)) * mix(1.0, 0.25, y) * smoothstep(1.0, 0.85, y);
  } else if (vMode < 1.5) {
    // the splash: a thin ring that opens and fades, and a brighter hit in its first moment
    float r = length(vQ);
    float ring = exp(-pow((r - 0.82) / 0.1, 2.0)) * (1.0 - vAge) * (1.0 - vAge);
    float hit = exp(-r * r * 9.0) * (1.0 - smoothstep(0.0, 0.25, vAge));
    a = ring * 0.8 + hit * 0.9;
  } else {
    discard;
  }
  a *= uOpacity * vFade;
  gl_FragColor = vec4(uColor * a, 0.0);
  ${OUTPUT}
}
`

/** Drops on the high tier; fewer on smaller GPUs. */
const HIGH = 150
const LOW = 50

export function WaterfallDrops() {
  const n = count(HIGH, LOW, film.tier)

  const built = useMemo(() => {
    const rand = rng(1107)
    const seed = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      // more of them near the bottle than far out to the sides
      const r = rand()
      seed[i * 4] = (rand() < 0.5 ? -1 : 1) * Math.pow(r, 0.75)
      seed[i * 4 + 1] = rand() * 2 - 1
      seed[i * 4 + 2] = rand()
      seed[i * 4 + 3] = rand()
    }
    const geometry = new THREE.InstancedBufferGeometry()
    geometry.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2))
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3))
    geometry.setIndex([0, 1, 2, 0, 2, 3])
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4))
    geometry.instanceCount = n
    const uniforms = {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uSpread: { value: new THREE.Vector3(2.4, 1.6, 4.2) },
      uScale: { value: 1 },
      uColor: { value: new THREE.Color('#dce8f0').multiplyScalar(0.55) },
      uOpacity: { value: 0 },
    }
    const material = softMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: true })
    material.name = 'iona-waterfall-drops'
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'WATERFALL_DROPS'
    mesh.frustumCulled = false
    // after the glass: the drops in front of it fall over it
    mesh.renderOrder = 6
    mesh.visible = false
    return { mesh, uniforms, dispose: () => (geometry.dispose(), material.dispose()) }
  }, [n])

  useEffect(() => () => built.dispose(), [built])

  useFrame(() => {
    const p = film.presence.waterfall
    built.mesh.visible = p > 0.002
    if (!built.mesh.visible) return
    const u = built.uniforms
    u.uTime.value = film.elapsed
    u.uOpacity.value = p * Math.max(rig.bottle.fade, 0.4)
    u.uCenter.value.copy(bottleLive.base)
    // the fall starts well above the frame (the camera looks at the bottle from 5 to 6 units away)
    const s = bottleLive.s
    u.uScale.value = s
    u.uSpread.value.set(2.6 * s, 1.7 * s, 4.4 * s)
  })

  return <primitive object={built.mesh} />
}
