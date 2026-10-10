import * as THREE from 'three'
import { fogUniforms } from '../particles/material'
import { OUTPUT } from '../particles/glsl'
import { SB_NOISE } from './glsl'

// The underwater tank's water (docs/07 "Underwater surface", docs/scenes/13).
//
// Surface: a plane at the waterline seen from below. Three Gerstner waves
// (amplitude 0.04 in all) displace it; the shading uses their analytic normal
// plus two octaves of fine ripples. From below, a surface is a window where it
// is seen steeply and a mirror of the dark water at grazing angles, so the
// near water is a bright rippled underside (crest #C8D6E1) that darkens toward
// the horizon and fades into the deep (#022332). A highlight term carries the
// glitter of the crests; it is the last thing to leave at the exit.
//
// Shafts: soft additive rays fanning down from a point above the surface,
// drawn in screen space behind the set, starting under the waterline, slowly
// shimmering. Both layers sit in the opaque list (additive / premultiplied
// blending, no depth write) so the glass bottle refracts them.

export const CREST = new THREE.Color('#C8D6E1')
export const DEEP = new THREE.Color('#022332')
/** Sky through the surface, tinted by the water (the plate's under-surface blue, sampled ~(95,135,158)). */
const THROUGH = new THREE.Color().setRGB(0.12, 0.25, 0.34, THREE.LinearSRGBColorSpace)

/** Gerstner waves: direction xy, steepness, wavelength; amplitude and phase speed (slow weather). */
const WAVES: readonly { dir: readonly [number, number]; q: number; length: number; amp: number; speed: number }[] = [
  { dir: [0.82, 0.57], q: 0.55, length: 2.8, amp: 0.02, speed: 0.42 },
  { dir: [-0.38, 0.92], q: 0.5, length: 1.55, amp: 0.012, speed: 0.33 },
  { dir: [0.96, -0.28], q: 0.45, length: 0.95, amp: 0.008, speed: 0.27 },
]

const GERSTNER = /* glsl */ `
uniform vec4 uWave[3];   // dir.xy (unit), steepness, wavelength
uniform vec2 uWaveAS[3]; // amplitude, phase speed
uniform float uTime;
vec3 gerstnerOffset(vec2 p) {
  vec3 o = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    vec4 w = uWave[i];
    float k = 6.2831853 / w.w;
    float f = k * (dot(w.xy, p) - uWaveAS[i].y * uTime);
    float a = uWaveAS[i].x;
    o += vec3(w.z * a * w.x * cos(f), a * sin(f), w.z * a * w.y * cos(f));
  }
  return o;
}
// slope of the wave field (unnormalized up-normal)
vec3 gerstnerNormal(vec2 p) {
  vec3 n = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < 3; i++) {
    vec4 w = uWave[i];
    float k = 6.2831853 / w.w;
    float f = k * (dot(w.xy, p) - uWaveAS[i].y * uTime);
    float ka = k * uWaveAS[i].x;
    n.x -= w.x * ka * cos(f);
    n.z -= w.y * ka * cos(f);
    n.y -= w.z * ka * sin(f);
  }
  return n;
}
`

const SURFACE_VERT = /* glsl */ `
${GERSTNER}
varying vec3 vWorld;
varying vec2 vFlat;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vFlat = wp.xz;
  wp.xyz += gerstnerOffset(wp.xz);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const SURFACE_FRAG = /* glsl */ `
${GERSTNER}
uniform vec3 fogColor;
uniform float fogDensity;
uniform vec3 uCrest;
uniform vec3 uDeep;
uniform vec3 uThrough;    // the light that comes through the window, already water-tinted
uniform float uBody;      // surface opacity (enter / exit)
uniform float uGlint;     // glitter strength (lingers longest at the exit)
uniform vec4 uWindow;     // x,y window ramp on cos(incidence); z,w alpha ramp on sin(elevation)
varying vec3 vWorld;
varying vec2 vFlat;

${SB_NOISE}

// one ripple octave: value and slope (w.r.t. the water plane) of rotated, drifting noise
vec3 ripple(vec2 q, float freq, float ang, vec2 drift) {
  mat2 r = mat2(cos(ang), sin(ang), -sin(ang), cos(ang));
  vec3 n = sbNoised(r * q * freq + drift);
  return vec3(n.x, freq * (transpose(r) * n.yz));
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float sinE = max(-V.y, 0.0);  // elevation of the view ray above the horizontal

  // ripples on the swell, each octave faded out where a pixel's footprint would alias it
  float foot = length(fwidth(vFlat));
  vec3 r1 = ripple(vFlat, 1.35, 0.4, vec2(uTime * 0.05, -uTime * 0.032));
  vec3 r2 = ripple(vFlat, 3.1, -0.9, vec2(-uTime * 0.07, uTime * 0.045) + 17.0);
  vec3 r3 = ripple(vFlat, 6.8, 1.7, vec2(uTime * 0.09, uTime * 0.06) + 41.0);
  float f1 = 1.0 - smoothstep(0.14, 0.4, foot);
  float f2 = 1.0 - smoothstep(0.06, 0.18, foot);
  float f3 = 1.0 - smoothstep(0.03, 0.08, foot);
  vec3 n = gerstnerNormal(vFlat);
  n.xz -= r1.yz * 0.045 * f1 + r2.yz * 0.022 * f2 + r3.yz * 0.009 * f3;
  n = normalize(n);

  // seen from below the face toward the water is -n: a window where the view is steep,
  // a mirror of the dark water where it grazes (darkening toward the horizon)
  float cosI = dot(V, -n);
  float win = smoothstep(uWindow.x, uWindow.y, cosI);
  vec3 col = mix(uDeep * 0.7, uThrough * (0.55 + 0.75 * win), win);

  // glitter: the ridges of the ripple field catch the sky
  float g1 = pow(1.0 - abs(2.0 * r1.x - 1.0), 7.0) * f1;
  float g2 = pow(1.0 - abs(2.0 * r2.x - 1.0), 10.0) * f2;
  float g3 = pow(1.0 - abs(2.0 * r3.x - 1.0), 14.0) * f3;
  float glit = (g1 * 0.75 + g2 * 0.75 + g3 * 0.55) * smoothstep(uWindow.x * 0.8, uWindow.y * 1.1, cosI);

  // the water between camera and surface tints everything toward the deep
  float fogAmt = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
  col = mix(col, fogColor, fogAmt);
  glit *= 1.0 - fogAmt;

  // grazing water fades into the backdrop's depth well before the horizon
  float edge = smoothstep(uWindow.z, uWindow.w, sinE);
  float a = edge * uBody;
  gl_FragColor = vec4(col * a + uCrest * glit * 1.5 * uGlint * edge, a);
  ${OUTPUT}
}
`

export type SurfaceUniforms = {
  uWave: THREE.IUniform<THREE.Vector4[]>
  uWaveAS: THREE.IUniform<THREE.Vector2[]>
  uTime: THREE.IUniform<number>
  uCrest: THREE.IUniform<THREE.Color>
  uDeep: THREE.IUniform<THREE.Color>
  uThrough: THREE.IUniform<THREE.Color>
  uBody: THREE.IUniform<number>
  uGlint: THREE.IUniform<number>
  uWindow: THREE.IUniform<THREE.Vector4>
}

/**
 * The surface mesh: a horizontal grid over the camera's whole underwater path,
 * denser toward the camera (+z) where the waves are seen largest.
 */
export function createSurfaceGeometry(): THREE.BufferGeometry {
  const segX = 120
  const segZ = 132
  const x0 = -16
  const x1 = 16
  const zNear = 7
  const zFar = -42
  const pos = new Float32Array((segX + 1) * (segZ + 1) * 3)
  let k = 0
  for (let j = 0; j <= segZ; j++) {
    const v = j / segZ
    const z = zNear + (zFar - zNear) * Math.pow(v, 1.7)
    for (let i = 0; i <= segX; i++) {
      const u = i / segX
      const s = u * 2 - 1
      const x = (Math.sign(s) * Math.pow(Math.abs(s), 1.35) * (x1 - x0)) / 2
      pos[k++] = x
      pos[k++] = 0
      pos[k++] = z
    }
  }
  const index: number[] = []
  for (let j = 0; j < segZ; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * (segX + 1) + i
      const b = a + 1
      const c = a + segX + 1
      const d = c + 1
      index.push(a, c, b, b, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setIndex(index)
  return g
}

export function createSurfaceMaterial(): THREE.ShaderMaterial & { uniforms: SurfaceUniforms } {
  const uniforms: SurfaceUniforms = {
    uWave: { value: WAVES.map((w) => new THREE.Vector4(w.dir[0], w.dir[1], w.q, w.length)) },
    uWaveAS: { value: WAVES.map((w) => new THREE.Vector2(w.amp, w.speed)) },
    uTime: { value: 0 },
    uCrest: { value: CREST.clone() },
    uDeep: { value: DEEP.clone() },
    uThrough: { value: THROUGH.clone() },
    uBody: { value: 0 },
    uGlint: { value: 0 },
    // window: bright above ~8° of elevation; the water ends by ~5° (upper fifth at the hold)
    uWindow: { value: new THREE.Vector4(0.105, 0.17, 0.082, 0.112) },
  }
  const material = new THREE.ShaderMaterial({
    name: 'iona-water-surface',
    uniforms: { ...fogUniforms(), ...uniforms },
    vertexShader: SURFACE_VERT,
    fragmentShader: SURFACE_FRAG,
    side: THREE.DoubleSide,
    fog: true,
    transparent: false,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  })
  return material as THREE.ShaderMaterial & { uniforms: SurfaceUniforms }
}

// --- Light shafts --------------------------------------------------------------

export type ShaftUniforms = {
  uSun: THREE.IUniform<THREE.Vector2>
  uAspect: THREE.IUniform<number>
  uWaterline: THREE.IUniform<number>
  uTime: THREE.IUniform<number>
  uColor: THREE.IUniform<THREE.Color>
  uReach: THREE.IUniform<number>
}

const SHAFT_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const SHAFT_FRAG = /* glsl */ `
uniform vec2 uSun;
uniform float uAspect;
uniform float uWaterline;
uniform float uTime;
uniform vec3 uColor;
uniform float uReach;
varying vec2 vUv;

${SB_NOISE}

void main() {
  vec2 d = (vUv - uSun) * vec2(uAspect, 1.0);
  float r = length(d);
  float ang = atan(d.x, -d.y);

  // rays: an angular field at two scales, drifting slowly so the shafts wander and breathe
  float a = ang * 21.0;
  float n1 = sbNoise1(a + uTime * 0.045);
  float n2 = sbNoise1(a * 2.6 - uTime * 0.08 + 13.0);
  float n3 = sbNoise1(a * 0.45 + uTime * 0.03 + 5.0);
  float rays = smoothstep(0.4, 0.95, n1 * 0.62 + n2 * 0.38) * (0.45 + 0.55 * n3);
  // shimmer travelling down the rays, as the surface above them moves
  float along = sbNoise1(r * 2.4 - uTime * 0.32 + a * 0.29);
  rays *= 0.7 + 0.3 * along;

  // from just under the waterline, fading with depth
  float below = uWaterline - vUv.y;
  float env = smoothstep(-0.02, 0.07, below) * exp(-max(below, 0.0) / uReach);
  // broadest under the light, thinning toward the sides
  float spread = exp(-ang * ang / 0.32);

  gl_FragColor = vec4(uColor * rays * env * (0.3 + 0.7 * spread), 0.0);
  ${OUTPUT}
}
`

export function createShaftMaterial(): THREE.ShaderMaterial & { uniforms: ShaftUniforms } {
  const uniforms: ShaftUniforms = {
    uSun: { value: new THREE.Vector2(0.42, 1.9) },
    uAspect: { value: 1.6 },
    uWaterline: { value: 0.8 },
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0, 0, 0) },
    uReach: { value: 0.4 },
  }
  const material = new THREE.ShaderMaterial({
    name: 'iona-water-shafts',
    uniforms,
    vertexShader: SHAFT_VERT,
    fragmentShader: SHAFT_FRAG,
    transparent: false,
    depthWrite: false,
    depthTest: false,
    fog: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  })
  return material as THREE.ShaderMaterial & { uniforms: ShaftUniforms }
}

/** One full-screen triangle (clip space), like the backdrop. */
export function createScreenTriangle(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
  return g
}
