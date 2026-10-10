// Shared GLSL for the built-set water layers (drop, ripples, cap droplets, helix, ribbons).
// Everything is computed in linear light; materials end with the tonemapping and
// colorspace chunks so the output follows the current render target.

/** Hashes, value noise, fbm and a cellular field (with the offset to the nearest feature). */
export const NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm3(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.07 + vec2(17.13, 3.71);
    a *= 0.5;
  }
  return s / 0.875;
}
// Nearest feature of a jittered grid: xy = offset from p to the feature, z = distance, w = cell hash.
vec4 cellular(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec4 best = vec4(0.0, 0.0, 8.0, 0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash22(i + g);
      vec2 r = g + 0.15 + 0.7 * o - f;
      float d = dot(r, r);
      if (d < best.z) best = vec4(r, d, hash12(i + g + 7.31));
    }
  }
  best.z = sqrt(best.z);
  return best;
}
`

/**
 * Bottle silhouette for the analytic occlusion of water passing behind the glass.
 * Radius of the outer glass at group-space height y (docs/06 profile), 0 outside.
 */
export const BOTTLE_PROFILE = /* glsl */ `
float bottleRadius(float y) {
  if (y < -1.22 || y > 1.39) return 0.0;
  if (y > 1.17) return 0.19;
  if (y > 0.97) return 0.17;
  if (y > 0.6) return mix(0.41, 0.16, smoothstep(0.6, 0.98, y));
  return mix(0.35, 0.43, smoothstep(-1.2, -0.7, y));
}
`
