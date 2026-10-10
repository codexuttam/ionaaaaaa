import * as THREE from 'three'

// Ring shaders for the two ripples. Both write premultiplied linear light: rgb is the
// light a crest adds, alpha how much of what lies behind it the trough dims.
// A crest is kept about a pixel wide at any angle; a crest thinner than a pixel gets
// dimmer instead of fatter, so the far side of a grazing ellipse fades the way water does.

const ICE = new THREE.Color('#d5e4ee')

// Water is never a perfect ring: a slow variation of the crest along its length.
// sin(k * angle) with integer k stays continuous across the atan seam.
const RING_COMMON = /* glsl */ `
float ringVary(vec2 dir) {
  float a = atan(dir.y, dir.x);
  return 0.84 + 0.16 * sin(3.0 * a + 1.3) * sin(5.0 * a + 0.4) + 0.06 * sin(7.0 * a + 2.1);
}
`

const PLANE_VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const PLANE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uRadius;
uniform float uWidth;
uniform float uOpacity;
uniform float uTrail;
uniform float uTrough;
uniform float uGlow;
uniform float uExtent;
varying vec2 vP;
${RING_COMMON}

float crestLine(float d, float width, float px) {
  float w = max(width, px * 0.8);
  return exp(-(d * d) / (w * w)) * (width / w);
}

void main() {
  float r = length(vP);
  // plane units per pixel along r (isotropic, so a grazing ellipse keeps an even line)
  float px = max(length(vec2(dFdx(r), dFdy(r))), 1e-6);
  vec2 dir = vP / max(r, 1e-5);
  // the near half (plane y < 0 is world +z, toward the camera) catches more of the drop light
  float facing = 0.8 + 0.32 * smoothstep(0.4, -0.9, dir.y);
  float vary = ringVary(dir);

  float crest = crestLine(r - uRadius, uWidth, px) * facing * vary;
  // the trough the crest leaves behind it, and the soft wake inside that
  float troughW = max(uWidth * 1.8, px);
  float dt = r - (uRadius - uWidth * 2.8);
  float trough = exp(-(dt * dt) / (troughW * troughW)) * step(r, uRadius);
  float wake = step(r, uRadius) * exp(-(uRadius - r) / (uWidth * 9.0 + 0.015)) * 0.16;
  // one faint trailing crest of the same ripple
  float second = crestLine(r - uRadius * 0.62, uWidth * 1.4, px) * uTrail * facing;
  float glow = (1.0 - smoothstep(0.0, max(uRadius, 1e-3), r)) * uGlow;

  float add = (crest + second + wake) * uOpacity + glow;
  float dim = trough * uTrough * uOpacity;
  float edge = 1.0 - smoothstep(uExtent * 0.86, uExtent, r);
  gl_FragColor = vec4(uColor * add, dim) * edge;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export type RingUniforms = {
  uColor: THREE.IUniform<THREE.Color>
  uRadius: THREE.IUniform<number>
  uWidth: THREE.IUniform<number>
  uOpacity: THREE.IUniform<number>
  uTrail: THREE.IUniform<number>
  uTrough: THREE.IUniform<number>
  uGlow: THREE.IUniform<number>
  uExtent: THREE.IUniform<number>
}

/** A ring on a horizontal plane in world space (the opening ripple). Plane coordinates are world units. */
export function createPlaneRingMaterial(extent: number): THREE.ShaderMaterial & { uniforms: RingUniforms } {
  const uniforms: RingUniforms = {
    uColor: { value: ICE.clone() },
    uRadius: { value: 0 },
    uWidth: { value: 0.006 },
    uOpacity: { value: 0 },
    uTrail: { value: 0 },
    uTrough: { value: 0 },
    uGlow: { value: 0 },
    uExtent: { value: extent },
  }
  return new THREE.ShaderMaterial({
    name: 'iona-ripple-plane',
    uniforms,
    vertexShader: PLANE_VERT,
    fragmentShader: PLANE_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    premultipliedAlpha: true,
    fog: false,
  }) as THREE.ShaderMaterial & { uniforms: RingUniforms }
}

const SCREEN_VERT = /* glsl */ `
uniform vec2 uCenter;
uniform vec2 uHalfNdc;
uniform vec2 uHalfPx;
varying vec2 vPx;
void main() {
  vPx = position.xy * uHalfPx;
  gl_Position = vec4(uCenter + position.xy * uHalfNdc, 0.0, 1.0);
}
`

const SCREEN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec2 uAxes;
uniform float uRadius;
uniform float uOpacity;
uniform float uWidth;
uniform float uHalo;
uniform float uDpr;
varying vec2 vPx;
${RING_COMMON}

void main() {
  // ring space: the settled ring is r = 1; vPx is device px from the center, y up
  vec2 q = vPx / uAxes;
  float r = length(q);
  // distance to the current ellipse in px: (r - R) / |grad r|
  vec2 grad = vPx / (uAxes * uAxes) / max(r, 1e-5);
  float d = (r - uRadius) / max(length(grad), 1e-5);
  vec2 dir = q / max(r, 1e-5);

  float core = exp(-(d * d) / (uWidth * uWidth));
  float halo = exp(-abs(d) / (2.6 * uDpr)) * uHalo;
  // a ring on water seen from the front: the near (lower) arc carries the light, the far arc thins
  float facing = 0.6 + 0.4 * smoothstep(0.55, -0.8, dir.y);
  float a = (core + halo) * facing * ringVary(dir) * uOpacity;
  // nothing at the very center while the ring is still a point
  a *= smoothstep(0.0, 0.02, uRadius);
  gl_FragColor = vec4(uColor * a, 0.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export type ScreenRingUniforms = {
  uColor: THREE.IUniform<THREE.Color>
  uCenter: THREE.IUniform<THREE.Vector2>
  uHalfNdc: THREE.IUniform<THREE.Vector2>
  uHalfPx: THREE.IUniform<THREE.Vector2>
  uAxes: THREE.IUniform<THREE.Vector2>
  uRadius: THREE.IUniform<number>
  uOpacity: THREE.IUniform<number>
  uWidth: THREE.IUniform<number>
  uHalo: THREE.IUniform<number>
  uDpr: THREE.IUniform<number>
}

/** A ring drawn straight in clip space over a DOM slot (the closing ripple). */
export function createScreenRingMaterial(): THREE.ShaderMaterial & { uniforms: ScreenRingUniforms } {
  const uniforms: ScreenRingUniforms = {
    uColor: { value: ICE.clone() },
    uCenter: { value: new THREE.Vector2(0, 0) },
    uHalfNdc: { value: new THREE.Vector2(0.1, 0.03) },
    uHalfPx: { value: new THREE.Vector2(72, 26) },
    uAxes: { value: new THREE.Vector2(60, 14.4) },
    uRadius: { value: 0 },
    uOpacity: { value: 0 },
    uWidth: { value: 0.8 },
    uHalo: { value: 0.12 },
    uDpr: { value: 1 },
  }
  return new THREE.ShaderMaterial({
    name: 'iona-ripple-screen',
    uniforms,
    vertexShader: SCREEN_VERT,
    fragmentShader: SCREEN_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    premultipliedAlpha: true,
    fog: false,
  }) as THREE.ShaderMaterial & { uniforms: ScreenRingUniforms }
}
