import * as THREE from 'three'

// Beads of water on the black cap (docs/scenes/02). Small glassy particles do not get
// three's transmission (it only refracts opaque objects, and the cap is not one), so
// the bead is drawn the way the plate shows it: clear over the black lacquer, a bright
// fresnel rim from the studio, crisp specular dots from the key, the rim light and the
// cap sweep, and the ball-lens caustic just inside the rim on the side away from the key.
// Output is premultiplied: rgb is the light the bead adds, alpha how much of the cap it hides.

const VERT = /* glsl */ `
attribute float aTail;
attribute float aSeed;
varying vec3 vNormalW;
varying float vSeed;
varying vec3 vPosW;
varying float vHeight;
void main() {
  vec3 p = position;
  // a sliding bead: the uphill half (-z) narrows into a short wet tail
  float up = max(-p.z, 0.0) * aTail;
  p.x *= 1.0 - 0.55 * up;
  p.y *= 1.0 - 0.45 * up;
  p.z *= 1.0 + 0.9 * step(p.z, 0.0) * aTail;
  #ifdef USE_INSTANCING
    mat4 im = instanceMatrix;
  #else
    mat4 im = mat4(1.0);
  #endif
  // inverse transpose of the instance's scaled basis: column c -> c / |c|^2
  vec3 c0 = im[0].xyz;
  vec3 c1 = im[1].xyz;
  vec3 c2 = im[2].xyz;
  vec3 n = c0 * (normal.x / max(dot(c0, c0), 1e-12)) + c1 * (normal.y / max(dot(c1, c1), 1e-12)) + c2 * (normal.z / max(dot(c2, c2), 1e-12));
  vNormalW = normalize(mat3(modelMatrix) * n);
  vec4 wp = modelMatrix * im * vec4(p, 1.0);
  vPosW = wp.xyz;
  vHeight = position.y;
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const FRAG = /* glsl */ `
uniform float uOpacity;
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uRimDir;
uniform vec3 uRimCol;
uniform vec3 uSweepPos;
uniform vec3 uSweepCol;
uniform vec3 uEnvTop;
uniform vec3 uEnvLow;
varying vec3 vNormalW;
varying vec3 vPosW;
varying float vHeight;
varying float vSeed;

float dotSpec(vec3 n, vec3 v, vec3 l, float power) {
  vec3 h = normalize(l + v);
  return pow(max(dot(n, h), 0.0), power) * smoothstep(0.0, 0.08, dot(n, l));
}

void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vPosW);
  float nv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
  vec3 r = reflect(-v, n);

  // what the bead mirrors: a dim cool studio above, the dark set below, the key and rim as small soft boxes
  vec3 env = mix(uEnvLow, uEnvTop, smoothstep(-0.2, 0.8, r.y));
  env += uKeyCol * 0.6 * pow(max(dot(r, uKeyDir), 0.0), 90.0);
  env += uRimCol * 0.5 * pow(max(dot(r, uRimDir), 0.0), 90.0);
  vec3 col = env * fres;

  // crisp specular dots; no two beads catch the light quite alike
  float catchLight = mix(0.7, 1.35, fract(vSeed * 7.13));
  vec3 ls = normalize(uSweepPos - vPosW);
  col += uKeyCol * dotSpec(n, v, uKeyDir, 360.0) * 4.0 * catchLight;
  col += uRimCol * dotSpec(n, v, uRimDir, 360.0) * 3.0;
  col += uSweepCol * dotSpec(n, v, ls, 260.0) * 4.0;

  // ball-lens caustic: a crescent inside the rim, opposite the key as seen on screen
  vec3 nV = normalize((viewMatrix * vec4(n, 0.0)).xyz);
  vec3 kV = normalize((viewMatrix * vec4(uKeyDir, 0.0)).xyz);
  float rho = length(nV.xy);
  vec2 away = normalize(-kV.xy + vec2(0.0, -1e-3));
  float side = pow(clamp(dot(nV.xy / max(rho, 1e-4), away), 0.0, 1.0), 2.0);
  float crescent = smoothstep(0.58, 0.8, rho) * (1.0 - smoothstep(0.88, 0.98, rho)) * side;
  col += (uKeyCol + uRimCol * 0.3) * crescent * 0.2 * mix(0.35, 1.0, vSeed);

  // the bead is clear: it hides a little of the lacquer toward its rim, where it refracts the dark set
  float hide = 0.12 + 0.55 * pow(1.0 - nv, 2.0);
  // feather the contact line so the bead sits in the surface rather than on it
  float foot = smoothstep(0.0, 0.18, vHeight);
  gl_FragColor = vec4(col * foot, hide * foot) * uOpacity;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export type DropletUniforms = {
  uOpacity: THREE.IUniform<number>
  uKeyDir: THREE.IUniform<THREE.Vector3>
  uKeyCol: THREE.IUniform<THREE.Color>
  uRimDir: THREE.IUniform<THREE.Vector3>
  uRimCol: THREE.IUniform<THREE.Color>
  uSweepPos: THREE.IUniform<THREE.Vector3>
  uSweepCol: THREE.IUniform<THREE.Color>
  uEnvTop: THREE.IUniform<THREE.Color>
  uEnvLow: THREE.IUniform<THREE.Color>
}

export function createDropletMaterial(): THREE.ShaderMaterial & { uniforms: DropletUniforms } {
  const uniforms: DropletUniforms = {
    uOpacity: { value: 0 },
    uKeyDir: { value: new THREE.Vector3(-4, 5, 3).normalize() },
    uKeyCol: { value: new THREE.Color() },
    uRimDir: { value: new THREE.Vector3(3.5, 2.2, -4).normalize() },
    uRimCol: { value: new THREE.Color() },
    uSweepPos: { value: new THREE.Vector3(0, 10, 0) },
    uSweepCol: { value: new THREE.Color(0, 0, 0) },
    uEnvTop: { value: new THREE.Color() },
    uEnvLow: { value: new THREE.Color() },
  }
  return new THREE.ShaderMaterial({
    name: 'iona-cap-droplets',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    fog: false,
  }) as THREE.ShaderMaterial & { uniforms: DropletUniforms }
}

/** A unit dome: the bead's footprint on the xz plane, its crown at +y. */
export function createDropletGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2)
  g.deleteAttribute('uv')
  return g
}
