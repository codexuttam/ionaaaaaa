import * as THREE from 'three'
import { OUTPUT } from '../particles/glsl'
import { softMaterial } from '../particles/material'
import { SB_NOISE } from './glsl'

// The spotlight set's volumetric beams and the dust that lives in them
// (docs/07 Beams, docs/scenes/08).
//
// A beam is drawn on a cone mesh, but the light is not painted on the cone's
// surface: each back-face fragment solves the closest approach of its view ray
// to the beam axis and integrates a soft Gaussian tube there. The cone is only
// a rasterization proxy a few sigmas wide, so the beam has no hard edge from
// any angle, and the light hangs in the air at its true depth.
//
// Measured on 08-spotlight-cap.png (linear light, frame top ≈ just above the cap):
// peaks 0.25 / 0.6 / 0.34, widths σ ≈ 0.09 / 0.03 / 0.035 world, a fall length
// of ≈ 0.3 below the cap, the outer beams leaning ~6° outward, a cool steel tint.

export type BeamShape = {
  /** sigma (world) of the Gaussian tube at the anchor height */
  sigma: number
  /** sigma growth per world unit below the anchor */
  grow: number
  /** peak added light at the anchor, linear, before the tint */
  gain: number
}

export const BEAM_SHAPES: readonly [BeamShape, BeamShape, BeamShape] = [
  { sigma: 0.085, grow: 0.034, gain: 0.22 },
  { sigma: 0.028, grow: 0.03, gain: 0.62 },
  { sigma: 0.035, grow: 0.032, gain: 0.34 },
]

/** Vertical fall length below the anchor, world units. */
export const BEAM_FALL = 0.22
/** The tint of the light in the air (the plate's steel blue, not the lamp's white), linear, G = 1. */
export const BEAM_TINT = new THREE.Color().setRGB(0.56, 1, 1.32, THREE.LinearSRGBColorSpace)

export type BeamUniforms = {
  uApex: THREE.IUniform<THREE.Vector3>
  uAxis: THREE.IUniform<THREE.Vector3>
  uAnchorY: THREE.IUniform<number>
  /** x sigma at the anchor, y growth below, z fall length, w (unused) */
  uShape: THREE.IUniform<THREE.Vector4>
  uColor: THREE.IUniform<THREE.Color>
  uTime: THREE.IUniform<number>
}

const CONE_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const CONE_FRAG = /* glsl */ `
uniform vec3 uApex;
uniform vec3 uAxis;
uniform float uAnchorY;
uniform vec4 uShape;
uniform vec3 uColor;
uniform float uTime;
varying vec3 vWorld;

${SB_NOISE}

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  // closest approach of the view ray (ro + s·rd) to the beam axis (apex + t·axis)
  vec3 w0 = ro - uApex;
  float b = dot(rd, uAxis);
  float d = dot(rd, w0);
  float e = dot(uAxis, w0);
  float den = max(1.0 - b * b, 1e-4);
  float s = (b * e - d) / den;
  float t = (e - b * d) / den;
  vec3 pr = ro + rd * s;
  vec3 pa = uApex + uAxis * t;
  float dist = length(pr - pa);

  // the tube narrows toward the source and opens below the cap
  float drop = uApex.y - uAnchorY;
  float below = uAnchorY - pa.y;
  float sigma = below > 0.0 ? uShape.x + uShape.y * below : uShape.x * clamp((uApex.y - pa.y) / max(drop, 1e-3), 0.0, 1.0);
  sigma = max(sigma, 2e-3);
  float radial = exp(-0.5 * dist * dist / (sigma * sigma));

  // vertical: transparent at the source, full at the cap, falling away below it
  float rise = 1.0 - smoothstep(uAnchorY + 0.3, uAnchorY + drop * 0.9, pa.y);
  float fall = exp(-max(below, 0.0) / uShape.z);

  // the air in the beam is never perfectly clean: slow density drift, sinking with the dust
  float n = sbNoise3(vec3(pr.x * 5.0, pr.y * 1.6 + uTime * 0.09, pr.z * 5.0));
  float n2 = sbNoise3(vec3(pr.x * 11.0 + 3.1, pr.y * 3.4 + uTime * 0.05, pr.z * 11.0));
  float dens = 0.84 + 0.2 * n + 0.08 * n2;

  float k = radial * rise * fall * dens * step(0.0, s);
  gl_FragColor = vec4(uColor * k, 0.0);
  ${OUTPUT}
}
`

/**
 * The cone proxy: a lathe hanging down from the origin (the apex) along -Y,
 * radius = 3.4 sigma (+ margin) of the beam it carries, so the Gaussian is gone
 * well before the silhouette. Rotated per frame onto the beam axis.
 */
export function createBeamProxy(shape: BeamShape, drop: number, length: number): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = []
  const rings = 18
  // bottom to top, so the lathe's normals face outward and BackSide draws the far wall
  for (let i = rings; i >= 0; i--) {
    const y = (i / rings) * length
    const sigma = y < drop ? shape.sigma * (y / drop) : shape.sigma + shape.grow * (y - drop)
    pts.push(new THREE.Vector2(sigma * 3.4 * 1.2 + 0.05, -y))
  }
  return new THREE.LatheGeometry(pts, 28)
}

export function createBeamMaterial(): THREE.ShaderMaterial & { uniforms: BeamUniforms } {
  const uniforms: BeamUniforms = {
    uApex: { value: new THREE.Vector3() },
    uAxis: { value: new THREE.Vector3(0, -1, 0) },
    uAnchorY: { value: 1.5 },
    uShape: { value: new THREE.Vector4(0.05, 0.03, BEAM_FALL, 0) },
    uColor: { value: new THREE.Color(0, 0, 0) },
    uTime: { value: 0 },
  }
  const material = new THREE.ShaderMaterial({
    name: 'iona-beam',
    uniforms,
    vertexShader: CONE_VERT,
    fragmentShader: CONE_FRAG,
    side: THREE.BackSide,
    // Opaque list on purpose: the bottle's transmission pass renders opaque
    // objects only, so the glass refracts the beams behind it. Additive, no depth write.
    transparent: false,
    depthWrite: false,
    depthTest: true,
    fog: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  })
  return material as THREE.ShaderMaterial & { uniforms: BeamUniforms }
}

// --- Dust in the beams ------------------------------------------------------

export type DustUniforms = {
  uApex: THREE.IUniform<THREE.Vector3[]>
  uAxis: THREE.IUniform<THREE.Vector3[]>
  /** per beam: x sigma, y grow, z light (gain × drift × envelope) */
  uBeam: THREE.IUniform<THREE.Vector3[]>
  uAnchorY: THREE.IUniform<number>
  uFall: THREE.IUniform<number>
  uTime: THREE.IUniform<number>
  /** device px per world unit at view depth 1 */
  uPixel: THREE.IUniform<number>
  /** x span above the anchor, y total span */
  uSpan: THREE.IUniform<THREE.Vector2>
  uColor: THREE.IUniform<THREE.Color>
}

const DUST_VERT = /* glsl */ `
attribute vec4 aSeed;   // x radial, y angle, z phase, w size
attribute vec2 aBeam;   // x beam index, y fall speed
uniform vec3 uApex[3];
uniform vec3 uAxis[3];
uniform vec3 uBeam[3];
uniform float uAnchorY;
uniform float uFall;
uniform float uTime;
uniform float uPixel;
uniform vec2 uSpan;
varying float vLight;
varying float vSoft;

void main() {
  int bi = int(aBeam.x + 0.5);
  vec3 apex = uApex[bi];
  vec3 axis = uAxis[bi];
  vec3 beam = uBeam[bi];

  // sink slowly through the visible length of the beam and wrap
  float f = fract(aSeed.z + uTime * aBeam.y / uSpan.y);
  float y = uAnchorY + uSpan.x - f * uSpan.y;
  float t = (apex.y - y) / max(-axis.y, 0.2);
  vec3 onAxis = apex + axis * t;
  float drop = apex.y - uAnchorY;
  float below = uAnchorY - y;
  float sigma = below > 0.0 ? beam.x + beam.y * below : beam.x * clamp((apex.y - y) / max(drop, 1e-3), 0.0, 1.0);

  // a disc across the beam, slowly turning, with a little lateral wander
  float r = sigma * 1.9 * sqrt(aSeed.x);
  float a = aSeed.y * 6.2831853 + uTime * (0.05 + 0.04 * aSeed.w);
  vec3 p = onAxis + vec3(cos(a) * r, 0.0, sin(a) * r);
  p.x += sin(uTime * 0.21 + aSeed.z * 17.0) * 0.012;
  p.z += cos(uTime * 0.17 + aSeed.y * 11.0) * 0.012;

  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 0.05);

  // light it receives: where it sits in the beam, the beam's vertical profile, a slow glitter
  float radial = exp(-0.5 * (r * r) / max(sigma * sigma, 1e-6));
  float fall = exp(-max(below, 0.0) / (uFall * 1.6));
  float ends = smoothstep(0.0, 0.12, f) * (1.0 - smoothstep(0.86, 1.0, f));
  float glitter = 0.62 + 0.38 * sin(uTime * (0.7 + aSeed.w * 1.1) + aSeed.z * 40.0);
  vLight = beam.z * radial * fall * ends * glitter;

  // mostly fine motes, a few soft out-of-focus ones nearer the lens
  float sizeW = mix(0.0035, 0.009, aSeed.w * aSeed.w);
  float px = sizeW * uPixel / depth;
  vSoft = smoothstep(4.0, 9.0, px);
  // below ~1.6 px a mote dims instead of shrinking, so it never shimmers
  float minPx = 1.6;
  vLight *= min(px * px / (minPx * minPx), 1.0);
  vLight /= max(1.0, px * px / 30.0);
  gl_PointSize = max(px, minPx);
}
`

const DUST_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vLight;
varying float vSoft;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  float sharp = exp(-d * 3.6);
  float soft = (1.0 - smoothstep(0.55, 1.0, d)) * 0.55;
  float a = mix(sharp, soft, vSoft) * (1.0 - smoothstep(0.85, 1.0, d));
  gl_FragColor = vec4(uColor * vLight * a, 0.0);
  ${OUTPUT}
}
`

export type Dust = {
  points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  uniforms: DustUniforms
  dispose(): void
}

/** `count` motes shared across the three beams (more in the wide left beam). */
export function createBeamDust(count: number, rand: () => number): Dust {
  const geometry = new THREE.BufferGeometry()
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count * 4)
  const beam = new Float32Array(count * 2)
  const share = [0.44, 0.22, 0.34]
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count
    const b = u < share[0] ? 0 : u < share[0] + share[1] ? 1 : 2
    seed[i * 4] = rand()
    seed[i * 4 + 1] = rand()
    seed[i * 4 + 2] = rand()
    seed[i * 4 + 3] = rand()
    beam[i * 2] = b
    beam[i * 2 + 1] = 0.022 + 0.03 * rand()
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
  geometry.setAttribute('aBeam', new THREE.BufferAttribute(beam, 2))

  const uniforms: DustUniforms = {
    uApex: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uAxis: { value: [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0)] },
    uBeam: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uAnchorY: { value: 1.5 },
    uFall: { value: BEAM_FALL },
    uTime: { value: 0 },
    uPixel: { value: 1000 },
    uSpan: { value: new THREE.Vector2(0.9, 2.6) },
    uColor: { value: new THREE.Color() },
  }
  const material = softMaterial({ vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, uniforms })
  material.name = 'iona-beam-dust'
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.name = 'beam-dust'
  return {
    points,
    uniforms: material.uniforms as unknown as DustUniforms,
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
