import * as THREE from 'three'
import { OUTPUT } from '../particles/glsl'
import { softMaterial } from '../particles/material'
import { SB_BILLBOARD, SB_NOISE } from './glsl'

// Underwater bubbles (docs/07 Particles, docs/scenes/13): camera-facing quads,
// one instanced draw. Each bubble rises from below the bottle to the surface
// and dies there; its whole life is a pure function of the loop clock (a new
// lane offset is hashed every cycle), so there is no per-particle state.
//
// Like the plate: glassy rims lit from above with a highlight and a crescent of
// refracted light inside the bottom, varied sizes, and fizz streams hugging the
// sides of the bottle. A "cluster" instance draws a few micro-bubbles in one quad.

export type BubbleUniforms = {
  uTime: THREE.IUniform<number>
  /** bottle body center (world) */
  uBottle: THREE.IUniform<THREE.Vector3>
  /** bottle up axis (world, unit) */
  uUp: THREE.IUniform<THREE.Vector3>
  /** x birth y, y surface y */
  uSpan: THREE.IUniform<THREE.Vector2>
  uFade: THREE.IUniform<number>
  uPixel: THREE.IUniform<number>
  uColor: THREE.IUniform<THREE.Color>
}

type Kind = 'stream' | 'single' | 'cluster' | 'big' | 'front'

const BUBBLE_VERT = /* glsl */ `
attribute vec2 aCorner;   // quad corner, -1..1
attribute vec4 aLane;     // x lane offset across, y lane offset in depth, z per-cycle jitter, w rise speed
attribute vec4 aSeed;     // x id hash, y phase, z size (world radius), w kind (0 single, 1 cluster)
uniform float uTime;
uniform vec3 uBottle;
uniform vec3 uUp;
uniform vec2 uSpan;
uniform float uFade;
uniform float uPixel;
uniform float fogDensity;
varying vec2 vQ;
varying float vPx;
varying float vLight;
varying float vKind;
varying vec2 vSeed;

${SB_NOISE}
${SB_BILLBOARD}

void main() {
  float span = uSpan.y - uSpan.x;
  float life = span / aLane.w;
  float tt = uTime / life + aSeed.y;
  float k = floor(tt);
  float f = fract(tt);

  // a fresh lane offset each cycle, around the lane
  vec2 h = sbHash22(vec2(aSeed.x * 113.0 + k * 1.618, aSeed.y * 71.0 + k * 0.731));
  vec2 lane = aLane.xy + (h - 0.5) * aLane.z;
  float y = uSpan.x + f * span;
  // lanes follow the bottle's tilt: offsets are taken from its axis at this height
  vec3 axisPt = uBottle + uUp * ((y - uBottle.y) / max(uUp.y, 0.3));
  vec3 c = vec3(axisPt.x + lane.x, y, axisPt.z + lane.y);

  float size = aSeed.z;
  float big = smoothstep(0.012, 0.05, size);
  float wf = mix(2.4, 0.9, big);
  float wa = mix(0.005, 0.028, big) + 0.006 * aSeed.w;
  c.x += sin(uTime * wf + aSeed.x * 31.0) * wa;
  c.z += cos(uTime * wf * 0.83 + aSeed.x * 17.0) * wa;

  vec4 mvC = viewMatrix * vec4(c, 1.0);
  float depth = max(-mvC.z, 0.05);
  float px = size * uPixel / depth;
  // below ~1.5 px radius a bubble dims instead of shrinking (no shimmer)
  float minPx = 1.5;
  float grow = max(minPx / max(px, 1e-3), 1.0);
  vPx = px * grow;

  // larger bubbles flatten a little as they rise
  vec2 shape = vec2(1.0 + 0.08 * big, 1.0 - 0.08 * big);
  vec3 wp = c + (sbCamRight() * aCorner.x * shape.x + sbCamUp() * aCorner.y * shape.y) * size * grow;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  vQ = aCorner;

  float born = smoothstep(0.0, 0.07, f);
  float pop = 1.0 - smoothstep(0.92, 1.0, f);
  float fog = 1.0 - exp(-fogDensity * fogDensity * depth * depth);
  vLight = uFade * born * pop * (1.0 - fog) / (grow * grow);
  vKind = aSeed.w;
  vSeed = vec2(aSeed.x, k);
}
`

const BUBBLE_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vQ;
varying float vPx;
varying float vLight;
varying float vKind;
varying vec2 vSeed;

${SB_NOISE}

// one bubble in its own unit disc: rim light lit from above, the window highlight,
// a crescent of refracted light in the lower inside; cover = how much it veils what is behind
void bubble(vec2 q, float px, out float light, out float cover) {
  float r = length(q);
  float aa = clamp(1.4 / max(px, 1.0), 0.02, 0.6);
  float disc = 1.0 - smoothstep(1.0 - aa, 1.0, r);
  // tiny ones are a soft bright point
  float dotL = exp(-r * r * 3.0) * 1.15;
  float rimW = clamp(1.8 / max(px, 1.0), 0.06, 0.4);
  float ring = smoothstep(1.0 - rimW * 2.2, 1.0 - rimW * 0.4, r) * disc;
  float top = 0.35 + 0.85 * smoothstep(-0.4, 0.95, q.y);
  vec2 hq = q - vec2(-0.34, 0.4);
  float spec = exp(-dot(hq, hq) * 26.0) * 1.7;
  float crescent = smoothstep(0.42, 0.9, r) * smoothstep(0.05, -0.9, q.y) * disc * 0.6;
  float full = ring * top + crescent + spec * disc;
  float detail = smoothstep(2.0, 6.0, px);
  light = mix(dotL, full, detail);
  cover = disc * 0.3 * detail;
}

void main() {
  float light = 0.0;
  float cover = 0.0;
  if (vKind < 0.5) {
    bubble(vQ, vPx, light, cover);
  } else {
    // a little fizz: micro-bubbles scattered through the quad
    for (int j = 0; j < 6; j++) {
      vec2 h = sbHash22(vec2(vSeed.x * 57.0 + float(j) * 7.31, vSeed.y * 0.37 + float(j) * 1.93));
      vec2 c = (h - 0.5) * 1.25;
      float rj = mix(0.1, 0.26, sbHash12(h * 31.0 + vSeed.x));
      float l;
      float cv;
      bubble((vQ - c) / rj, vPx * rj, l, cv);
      light += l * 0.8;
      cover = max(cover, cv);
    }
  }
  float a = cover * vLight;
  gl_FragColor = vec4(uColor * light * vLight, a);
  ${OUTPUT}
}
`

export type Bubbles = {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>
  uniforms: BubbleUniforms
  dispose(): void
}

/**
 * Layout of `count` bubbles. On high (50): four fizz streams hugging the
 * bottle's sides, loose bubbles of mixed sizes around it, two large slow ones
 * and a few small ones in front of the glass. Low keeps the same mix, smaller.
 */
export function createBubbles(count: number, rand: () => number): Bubbles {
  const kinds: Kind[] = []
  const nStream = Math.round(count * 0.44)
  const nBig = count >= 30 ? 2 : 1
  const nFront = Math.max(1, Math.round(count * 0.08))
  const nCluster = Math.round(count * 0.14)
  for (let i = 0; i < nStream; i++) kinds.push('stream')
  for (let i = 0; i < nBig; i++) kinds.push('big')
  for (let i = 0; i < nFront; i++) kinds.push('front')
  for (let i = 0; i < nCluster; i++) kinds.push('cluster')
  while (kinds.length < count) kinds.push('single')
  kinds.length = count

  // the streams: just outside the glass, left and right of the bottle, slightly behind its face
  const streams: readonly (readonly [number, number])[] = [
    [-0.56, -0.05],
    [-0.66, -0.3],
    [0.58, -0.08],
    [0.7, -0.32],
  ]

  const lane = new Float32Array(count * 4)
  const seed = new Float32Array(count * 4)
  let s = 0
  for (let i = 0; i < count; i++) {
    const kind = kinds[i]
    const o = i * 4
    let lx = 0
    let lz = 0
    let jitter = 0
    let speed = 0.3
    let size = 0.008
    let cluster = 0
    const side = rand() < 0.5 ? -1 : 1
    switch (kind) {
      case 'stream': {
        const st = streams[s++ % streams.length]
        lx = st[0] + (rand() - 0.5) * 0.05
        lz = st[1] + (rand() - 0.5) * 0.05
        jitter = 0.05
        cluster = rand() < 0.55 ? 1 : 0
        size = cluster ? 0.035 + rand() * 0.03 : 0.004 + rand() * rand() * 0.012
        speed = 0.3 + rand() * 0.12
        break
      }
      case 'big':
        lx = side * (0.85 + rand() * 0.35)
        lz = -0.2 + rand() * 0.5
        jitter = 0.5
        size = 0.045 + rand() * 0.02
        speed = 0.2 + rand() * 0.05
        break
      case 'front':
        lx = side * (0.28 + rand() * 0.3)
        lz = 0.58 + rand() * 0.25
        jitter = 0.2
        size = 0.004 + rand() * 0.006
        speed = 0.26 + rand() * 0.1
        break
      case 'cluster':
        lx = side * (0.75 + rand() * 0.9)
        lz = -0.9 + rand() * 1.2
        jitter = 0.7
        cluster = 1
        size = 0.04 + rand() * 0.035
        speed = 0.28 + rand() * 0.1
        break
      default:
        lx = side * (0.62 + rand() * 1.3)
        lz = -1.2 + rand() * 1.6
        jitter = 0.9
        size = 0.004 + rand() * rand() * 0.024
        speed = 0.24 + rand() * 0.16 + size * 3
    }
    lane[o] = lx
    lane[o + 1] = lz
    lane[o + 2] = jitter
    lane[o + 3] = speed
    seed[o] = rand()
    seed[o + 1] = rand()
    seed[o + 2] = size
    seed[o + 3] = cluster
  }

  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2))
  // three needs a position attribute to size the draw; the shader places every vertex
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  geometry.setAttribute('aLane', new THREE.InstancedBufferAttribute(lane, 4))
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4))
  geometry.instanceCount = count

  const uniforms: BubbleUniforms = {
    uTime: { value: 0 },
    uBottle: { value: new THREE.Vector3() },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uSpan: { value: new THREE.Vector2(-2.4, 1.15) },
    uFade: { value: 0 },
    uPixel: { value: 1000 },
    uColor: { value: new THREE.Color('#d5e4ee') },
  }
  const material = softMaterial({ vertexShader: BUBBLE_VERT, fragmentShader: BUBBLE_FRAG, uniforms, fog: true })
  material.name = 'iona-underwater-bubbles'
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'underwater-bubbles'
  mesh.frustumCulled = false
  return {
    mesh,
    uniforms: material.uniforms as unknown as BubbleUniforms,
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
