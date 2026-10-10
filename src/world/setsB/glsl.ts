// Shared GLSL for the spotlight and underwater sets (beams, beam dust, water
// surface, light shafts, bubbles). Everything is computed in linear light.

/** Hashes (Dave Hoskins' hash-without-sine) and value noise, 1D / 2D (with derivatives) / 3D. */
export const SB_NOISE = /* glsl */ `
float sbHash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float sbHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float sbHash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 sbHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float sbNoise1(float x) {
  float i = floor(x);
  float f = fract(x);
  return mix(sbHash11(i), sbHash11(i + 1.0), f * f * (3.0 - 2.0 * f));
}
// value noise with its analytic gradient: (value, d/dx, d/dy)
vec3 sbNoised(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f * (1.0 - f);
  float a = sbHash12(i);
  float b = sbHash12(i + vec2(1.0, 0.0));
  float c = sbHash12(i + vec2(0.0, 1.0));
  float d = sbHash12(i + vec2(1.0, 1.0));
  float k1 = b - a;
  float k2 = c - a;
  float k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}
float sbNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = sbHash13(i);
  float n100 = sbHash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = sbHash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = sbHash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = sbHash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = sbHash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = sbHash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = sbHash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}
`

/** World-space billboard basis from the view matrix (camera right / up). */
export const SB_BILLBOARD = /* glsl */ `
vec3 sbCamRight() { return vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); }
vec3 sbCamUp() { return vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }
`
