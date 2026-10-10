import * as THREE from 'three'
import { SCENE_BY_ID } from '../../experience/scenes'
import { BACKDROP_ASPECT } from '../../experience/plateMeta'
import { createWaterNoise } from '../particles/noiseTexture'
import { BOTTLE_WATER, DEPTH_LUM_UV, DEPTH_UV, FLOW, POINTER_UV, WAVE_LIGHT_PERIOD } from './table'

// The backdrop: one opaque full-screen triangle, composited per pixel.
//
//   ground   = film.look.ground, with each built set's own ground swapped in by
//              presence (alkaline light, tomorrow pool, pack studio wall, spotlight
//              lift, underwater depth, opening/closing vignette) while that beat
//              has no picture
//   pictures = up to two generated backdrops; each replaces its beat's share of
//              the ground: color += alpha · (picture′ − flatGround)
//   picture′ = cover-fit sample (Ken Burns about the pinned point, pointer parallax
//              with a near/far split) → moving water (flow map) → side scrim in the
//              scene ground → darken → tint toward the blended ground while it dissolves
//
// Moving water: a picture with a flow map (scripts/flowmaps.mjs) is sampled twice
// along its local velocity, half a cycle apart, and the two copies cross-fade so
// neither ever jumps (the flow-map method of animating a still). Each area restarts
// its cycle at its own moment, so no pulse runs across the frame. Falling water
// (the fast part of the field) also carries streaks of a tiling water field that
// fall on the time of flight from the lip: they start slow at the edge, stretch
// and accelerate as they drop.
//
// Screen UVs come from clip space, never gl_FragCoord, so the transmission pass
// (another render target size) sees the same picture behind the glass.

/** GLSL literal of a color token in linear light (THREE.Color parses sRGB and stores linear). */
function lin(hex: string, scale = 1): string {
  const c = new THREE.Color(hex).multiplyScalar(scale)
  return `vec3(${c.r.toFixed(7)}, ${c.g.toFixed(7)}, ${c.b.toFixed(7)})`
}

const ground = (id: keyof typeof SCENE_BY_ID): string => SCENE_BY_ID[id].look.ground

/** GLSL float / vec2 literals. */
const f = (x: number): string => x.toFixed(5)
const v2 = (v: readonly [number, number]): string => `vec2(${f(v[0])}, ${f(v[1])})`

// Built-set grounds, tokens from docs/03. The flat value of each is the scene-table
// ground, so a set only adds the difference between its ground and that flat color.
const PALETTE = /* glsl */ `
const vec3 ALK_FLAT = ${lin(ground('alkaline'))};
const vec3 ALK_CORE = ${lin('#F5F7F8')};
const vec3 ALK_LIGHT = ${lin('#E4EEF3')};
const vec3 ALK_MID = ${lin('#C9D6DE')};
const vec3 ALK_EDGE = ${lin('#8EA6B6')};
const vec3 TOM_FLAT = ${lin(ground('tomorrow'))};
const vec3 TOM_POOL = ${lin('#152433')};
const vec3 TOM_HAZE = ${lin('#4F6E80')};
const vec3 PACK_FLAT = ${lin(ground('pack'))};
const vec3 PACK_SHADE = ${lin('#8EA6B6', 0.3)};
const vec3 PACK_HORIZON = ${lin('#8EA6B6')};
const vec3 PACK_TOP = ${lin('#D5DEE6')};
const vec3 PACK_HOT = ${lin('#F5F7F8')};
const vec3 SPOT_FLAT = ${lin(ground('spotlight'))};
const vec3 SPOT_LIFT = ${lin('#0B1220')};
const vec3 UW_FLAT = ${lin(ground('underwater'))};
const vec3 UW_TOP = ${lin('#022332', 3.4)};
const vec3 UW_DEEP = ${lin('#022332', 0.3)};
const vec3 VOID_FLAT = ${lin(ground('opening'))};
const float POINTER_UV = ${POINTER_UV.toFixed(5)};
const float DEPTH_UV = ${DEPTH_UV.toFixed(5)};
const float DEPTH_LUM_UV = ${DEPTH_LUM_UV.toFixed(5)};
const float PICTURE_ASPECT = ${BACKDROP_ASPECT.toFixed(5)};
const float FLOW_VMAX = ${f(FLOW.vmax)};
const float FLOW_DISP = ${f(FLOW.disp)};
const float FLOW_PERIOD = ${f(FLOW.period)};
const float TURB_SCALE = ${f(FLOW.turbScale)};
const vec2 GLINT_K = ${v2(FLOW.glintK)};
const float WAVE_PERIOD = ${f(WAVE_LIGHT_PERIOD)};
const vec2 FALL_SPEED = ${v2(FLOW.fallSpeed)};
const float FALL_TAU_SLOPE = ${f(FLOW.tauSlope)};
const vec2 FALL_K1 = ${v2(FLOW.k1)};
const vec2 FALL_K2 = ${v2(FLOW.k2)};
const vec2 FALL_K3 = ${v2(FLOW.k3)};
const vec3 FALL_RATE = vec3(${FLOW.rate.map(f).join(', ')});
const vec2 FALL_SHADE = ${v2(FLOW.shade)};
const vec3 FALL_TINT = ${lin(FLOW.tint, FLOW.tintScale)};
const vec3 REFL_GLASS = ${lin(BOTTLE_WATER.glass)};
const float BODY_OVER_BASE = ${f(BOTTLE_WATER.bodyOverBase)};
const vec3 REFL_LABEL = ${lin(BOTTLE_WATER.label)};
const vec3 REFL_CAP = ${lin(BOTTLE_WATER.cap)};
const vec3 FOAM_TINT = ${lin(BOTTLE_WATER.foam, BOTTLE_WATER.foamScale)};
const vec3 WATERLINE_TINT = ${lin(BOTTLE_WATER.waterline, BOTTLE_WATER.waterlineScale)};
`

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FRAG = /* glsl */ `
uniform vec3 uGround;
uniform vec4 uBuiltA;   // presence without a picture: alkaline, tomorrow, pack, spotlight
uniform vec2 uBuiltB;   // presence without a picture: underwater (live tank), opening + closing
uniform float uAspect;  // viewport width / height
uniform vec2 uPointer;  // damped pointer, -1..1
uniform vec2 uGlow;     // alkaline: the backlight above the bottle's shoulder (uv)
uniform vec2 uPool;     // tomorrow: the bottle on screen (uv)
uniform vec2 uLift;     // spotlight: the shoulder on screen (uv)
uniform vec2 uKey;      // pack: the light on the studio wall (uv)
uniform float uHorizon; // pack: the floor meets the wall (uv y)
uniform vec2 uFeather;  // mobile: the picture fades into the ground across these heights from the top

uniform sampler2D uMap0;
uniform vec4 uFit0;     // screen uv -> texture uv: uv * xy + zw
uniform vec4 uMix0;     // x opacity, y tint toward the ground, z darken, w Ken Burns magnification (>= 1)
uniform vec3 uFlat0;    // the beat's flat ground (its share of uGround, and the scrim color)
uniform vec4 uScrim0;   // x side (1 left, -1 right), y strength, z plateau, w feather
uniform vec2 uAnchor0;  // texture uv of the pinned point (Ken Burns center)
uniform sampler2D uMap1;
uniform vec4 uFit1;
uniform vec4 uMix1;
uniform vec3 uFlat1;
uniform vec4 uScrim1;
uniform vec2 uAnchor1;

uniform float uTime;           // film clock, seconds (wrapped)
uniform sampler2D uWaterNoise; // tiling water field (particles/noiseTexture.ts)
uniform sampler2D uFlow0;      // slot flow maps: rg velocity, b moving mask
uniform sampler2D uFlow1;
uniform vec2 uFlowOn;          // per slot 0..1: the flow map's presence (0 = none or still arriving)
uniform vec4 uTurb;            // per slot: turbulence amplitude (picture uv) and rate
uniform vec4 uGlint;           // per slot: glints on the slow water (strength, speed along the flow)
uniform vec4 uWave0;           // slot 0 macro wave: breathing (picture uv), light along the crest, sparkle, swell
uniform vec4 uWave1;

// The water at the bottle's base, where it stands in a picture (hero, waterfall). Screen uv, origin bottom-left.
uniform vec4 uBW0;  // base centre, half-width of the base (uv x), half-height of the base ellipse (uv y)
uniform vec4 uBW1;  // bottle height (uv y), axis on screen (aspect-corrected, unit), 1 = only on slot 0's moving water
uniform vec4 uBW2;  // contact shade, reflection, bow and wake foam, waterline
uniform vec4 uBW3;  // downstream on the water plane (x right, y toward the camera; unit), foam speed (base radii/s), ripple strength

varying vec2 vUv;

${PALETTE}

float sq(float x) {
  return x * x;
}

// 0 at the center, 1 in the corners (follows the frame, not a circle)
float cornerDist(vec2 uv) {
  return length(uv * 2.0 - 1.0) * 0.70710678;
}

float gauss(vec2 uv, vec2 c, float k) {
  vec2 d = (uv - c) * vec2(uAspect, 1.0);
  return exp(-dot(d, d) * k);
}

// 04-alkaline.png: the light pools low and left of center, behind the type, and
// falls off with height and toward the right; a backlight glows behind the top of
// the bottle. The top corners and the right edge reach the edge token while the
// type side stays the palest part of the frame.
vec3 alkalineGround(vec2 uv) {
  float floorLight = 0.28 + 1.04 * exp(-sq((uv.x - 0.36) / 0.41));
  float falloff = 0.25 + 0.88 * exp(-sq((uv.x - 0.36) / 0.47));
  float l = floorLight - falloff * uv.y;
  l += 0.32 * exp(-sq((uv.x - uGlow.x) / 0.22) - sq((uv.y - uGlow.y) / 0.35));
  l = clamp(l, 0.0, 1.0);
  return l < 0.4 ? mix(ALK_EDGE, ALK_MID, l / 0.4)
    : l < 0.75 ? mix(ALK_MID, ALK_LIGHT, (l - 0.4) / 0.35)
    : mix(ALK_LIGHT, ALK_CORE, (l - 0.75) / 0.25);
}

// 09-brighter-tomorrow.png: navy, a soft pool behind the bottle, a haze down the
// right edge that is strongest a little above the middle.
vec3 tomorrowGround(vec2 uv) {
  vec3 c = mix(TOM_FLAT, TOM_POOL, gauss(uv, uPool, 4.0));
  float haze = exp(-sq((1.0 - uv.x) / 0.105)) * (0.15 + 0.85 * exp(-sq((uv.y - 0.64) / 0.42)));
  return mix(c, TOM_HAZE, 0.55 * haze);
}

// 10-product-pack.png: a softbox stripe on the wall just left of the bottle, near
// white at the top, slate toward the left and a slower fall to the right edge,
// settling toward the floor tone at the horizon. Below the horizon the carton's
// floor takes over; the wall holds its horizon value so a short floor never shows a seam.
vec3 packGround(vec2 uv) {
  float dx = uv.x - uKey.x;
  float stripe = exp(-sq(dx / (dx < 0.0 ? 0.25 : 0.4)));
  float rise = smoothstep(uHorizon, 1.0, uv.y);
  float l = 0.95 * stripe * mix(0.72, 1.0, rise);
  vec3 c = l < 0.35 ? mix(PACK_SHADE, PACK_HORIZON, l / 0.35)
    : l < 0.7 ? mix(PACK_HORIZON, PACK_TOP, (l - 0.35) / 0.35)
    : mix(PACK_TOP, PACK_HOT, (l - 0.7) / 0.3);
  return mix(c, PACK_HORIZON, 0.25 * (1.0 - smoothstep(uHorizon - 0.02, uHorizon + 0.3, uv.y)));
}

vec3 spotlightGround(vec2 uv) {
  return mix(SPOT_FLAT, SPOT_LIFT, 0.6 * gauss(uv, uLift, 2.2));
}

// 13-underwater.png: lighter toward the surface, deep toward the floor, the sides darker than the shafts.
vec3 underwaterGround(vec2 uv) {
  vec3 c = mix(UW_FLAT, UW_TOP, smoothstep(0.45, 1.0, uv.y));
  c = mix(c, UW_DEEP, smoothstep(0.65, 0.0, uv.y));
  return c * (1.0 - 0.32 * sq(uv.x * 2.0 - 1.0));
}

vec3 voidGround(vec2 uv) {
  return VOID_FLAT * (1.0 - 0.38 * smoothstep(0.3, 1.0, cornerDist(uv)));
}

vec3 groundAt(vec2 uv) {
  vec3 g = uGround;
  if (uBuiltA.x > 0.0) g += uBuiltA.x * (alkalineGround(uv) - ALK_FLAT);
  if (uBuiltA.y > 0.0) g += uBuiltA.y * (tomorrowGround(uv) - TOM_FLAT);
  if (uBuiltA.z > 0.0) g += uBuiltA.z * (packGround(uv) - PACK_FLAT);
  if (uBuiltA.w > 0.0) g += uBuiltA.w * (spotlightGround(uv) - SPOT_FLAT);
  if (uBuiltB.x > 0.0) g += uBuiltB.x * (underwaterGround(uv) - UW_FLAT);
  if (uBuiltB.y > 0.0) g += uBuiltB.y * (voidGround(uv) - VOID_FLAT);
  return g;
}

// Cover-fit texture uv of a picture: Ken Burns about the pinned point, then the
// pointer parallax (the whole picture, more at the bottom of the frame than the
// top, and a hint of relief from a very blurred read of the picture's own tones).
vec2 pictureUv(sampler2D map, vec2 uv, vec4 fit, vec2 anchor, float kb) {
  vec2 t = anchor + (uv * fit.xy + fit.zw - anchor) / kb;
  float lum = dot(texture2DLodEXT(map, t, 5.0).rgb, vec3(0.3, 0.59, 0.11));
  return t + uPointer * (POINTER_UV + DEPTH_UV * (0.5 - uv.y) + DEPTH_LUM_UV * (lum - 0.5));
}

// A slow offset of the flow cycle across the picture, so the restart sweeps over the frame instead of
// pulsing everywhere at once. It must stay smooth and small: wherever the cycle differs, the copies sit
// at different offsets, and a fast change in that offset would bend the picture.
float flowPhase(vec2 t) {
  return 0.22 * sin(t.x * 5.0 + 1.3 * sin(t.y * 4.0)) + 0.22 * sin(t.y * 6.0 + 1.1 * sin(t.x * 3.0));
}

// The moving water of a picture at texture uv t (see the header). Explicit gradients throughout: the
// caller skips the work for a picture without a flow map, and the sampling stays defined in that branch.
// The macro wave of "A higher standard of water" (storyboard slide 8: "surface ripples in slow motion,
// highlights slide along the curves"). One sample of the picture, carried a little by a few slow sines, so
// the curl breathes and nothing doubles or smears. Long low swells cross the calm water and catch a little
// more or less of the sky; a soft band of light travels the bright crest from left to right, then again;
// fine sparkles ride the crest with the water. Everything is in picture space, so phones and desktops
// see the same water at their own framing.
vec3 wavePicture(sampler2D map, vec2 t, vec2 gx, vec2 gy, vec4 wv) {
  vec2 pc = t * vec2(PICTURE_ASPECT, 1.0);
  float tt = uTime;
  vec2 off = wv.x * vec2(
    sin(pc.y * 4.7 + tt * 0.52) + 0.55 * sin(pc.x * 3.1 - tt * 0.37 + 1.2),
    sin(pc.x * 3.9 + tt * 0.44 + 0.7) + 0.55 * sin(pc.y * 2.7 - tt * 0.29 + 2.1)
  );
  vec3 c = texture2DGradEXT(map, t + off, gx, gy).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float crest = smoothstep(0.04, 0.32, lum);
  // swells from beyond the top left, arriving slowly across the calm water
  float swell = sin(length(pc - vec2(-0.25, 1.35)) * 38.0 - tt * 0.85);
  c *= 1.0 + wv.w * swell * (1.0 - crest);
  // the light along the crest: a soft band crossing the picture left to right every WAVE_PERIOD seconds
  float ph = fract(tt / WAVE_PERIOD);
  float band = exp(-pow((t.x - mix(0.3, 1.12, ph)) / 0.075, 2.0)) * smoothstep(0.0, 0.1, ph) * (1.0 - smoothstep(0.86, 1.0, ph));
  c *= 1.0 + wv.y * band * crest;
  // sparkles riding the crest down its length
  vec2 dirc = vec2(0.97, -0.24);
  vec2 gq = vec2(dot(pc, vec2(-dirc.y, dirc.x)) * 34.0, dot(pc, dirc) * 12.0 - tt * 1.3);
  float sparkle = smoothstep(0.66, 0.92, texture2DLodEXT(uWaterNoise, gq, 0.0).a);
  c *= 1.0 + wv.z * sparkle * smoothstep(0.12, 0.45, lum);
  return c;
}

vec3 flowingPicture(sampler2D map, sampler2D flow, vec2 t, vec3 still, vec2 gx, vec2 gy, vec2 turb, vec2 glint) {
  vec3 F = texture2DGradEXT(flow, t, gx, gy).rgb;
  // b: half how much moves, half how much of it is water (scripts/flowmaps.mjs)
  float moving = min(1.0, 2.0 * F.b);
  float wet = max(0.0, 2.0 * F.b - 1.0);
  // rock, mountains, the carton: nothing here moves, and most of a frame is that
  if (moving < 0.004) return still;
  vec2 vel = (F.rg * 2.0 - 1.0) * FLOW_VMAX;
  float speed = length(vel);

  // the boil: the water field drifting under the picture, read as a small offset of both copies
  vec2 boil = vec2(0.0);
  if (turb.x > 0.0) {
    vec2 q = t * vec2(PICTURE_ASPECT, 1.0) * TURB_SCALE + vec2(0.031, -0.022) * (uTime * turb.y);
    boil = (texture2DLodEXT(uWaterNoise, q, 0.0).rg * 2.0 - 1.0) * turb.x;
  }

  // two copies half a cycle apart; each is weighted out as it restarts. One cycle for the whole picture
  // (a cycle that varied with the speed would drift out of step between neighbours and tear the water);
  // fast water is capped in how far a copy travels, its speed shows in the falling streaks below.
  float ph = uTime / FLOW_PERIOD + flowPhase(t);
  float f0 = fract(ph);
  float f1 = fract(ph + 0.5);
  float w0 = 1.0 - abs(2.0 * f0 - 1.0);
  vec2 d = vel * min(FLOW_PERIOD, FLOW_DISP / max(speed, 1e-5));
  vec3 a = texture2DGradEXT(map, t - d * (f0 - 0.5) + boil, gx, gy).rgb;
  vec3 b = texture2DGradEXT(map, t - d * (f1 - 0.5) + boil, gx, gy).rgb;
  vec3 c = mix(b, a, w0);

  // falling water: the fast part of the field. Its speed grows with the square root of the drop, so it
  // doubles as the time of flight from the lip: streaks laid out along it start slow, then stretch and race.
  float fall = smoothstep(FALL_SPEED.x, FALL_SPEED.y, speed);
  if (fall > 0.0) {
    vec2 dir = vel / max(speed, 1e-5);
    vec2 across = vec2(-dir.y, dir.x) * vec2(PICTURE_ASPECT, 1.0);
    float x = dot(t, across);
    float tau = speed / FLOW_VMAX;
    vec2 dx = vec2(dot(gx, across), -gx.y * FALL_TAU_SLOPE);
    vec2 dy = vec2(dot(gy, across), -gy.y * FALL_TAU_SLOPE);
    // long streaks, fine threads and slow clumps, each falling at its own rate
    float n1 = texture2DGradEXT(uWaterNoise, vec2(x * FALL_K1.x, tau * FALL_K1.y - uTime * FALL_RATE.x), dx * FALL_K1, dy * FALL_K1).r;
    float n2 = texture2DGradEXT(uWaterNoise, vec2(x * FALL_K2.x + 0.37, tau * FALL_K2.y - uTime * FALL_RATE.y), dx * FALL_K2, dy * FALL_K2).g;
    float n3 = texture2DGradEXT(uWaterNoise, vec2(x * FALL_K3.x + 0.71, tau * FALL_K3.y - uTime * FALL_RATE.z), dx * FALL_K3, dy * FALL_K3).b;
    float s = smoothstep(0.38, 0.78, n1 * 0.5 + n2 * 0.25 + n3 * 0.35);
    // only where the picture already has water: the dark rock behind a thin sheet stays dark
    float water = smoothstep(0.004, 0.05, dot(c, vec3(0.2126, 0.7152, 0.0722)));
    vec3 lit = c * (FALL_SHADE.x + FALL_SHADE.y * s) + FALL_TINT * (s * s * water);
    c = mix(c, lit, fall * water);
  }
  // glints on the slow water (a river, a sheet, a ribbon): fine sparkles stretched along the flow and carried
  // with it, only on the water the picture already lights; they multiply the picture, so it stays sharp
  if (glint.x > 0.0 && speed > 1e-4 && wet > 0.0) {
    vec2 dc = normalize(vec2(vel.x * PICTURE_ASPECT, vel.y));
    vec2 pc = t * vec2(PICTURE_ASPECT, 1.0);
    float along = dot(pc, dc);
    float across = dot(pc, vec2(-dc.y, dc.x));
    vec2 gq = vec2(across * GLINT_K.x, along * GLINT_K.y + uTime * glint.y * GLINT_K.y);
    vec4 gn = texture2DLodEXT(uWaterNoise, gq, 0.0);
    // the sparkle field also twinkles in place: two layers sliding across each other
    float sparkle = smoothstep(0.58, 0.88, gn.a * 0.65 + texture2DLodEXT(uWaterNoise, gq * 0.61 + vec2(uTime * 0.05, 0.0), 0.0).g * 0.35);
    float lit = smoothstep(0.02, 0.2, dot(c, vec3(0.2126, 0.7152, 0.0722)));
    c *= 1.0 + glint.x * sparkle * lit * wet * (1.0 - fall);
  }
  return mix(still, c, moving);
}

// The picture's replacement of its beat's ground share, before opacity.
vec3 pictureDelta(vec3 p, vec4 mixv, vec3 flatGround, vec4 scrim, vec3 ground, vec2 uv) {
  float fromEdge = scrim.x > 0.0 ? uv.x : 1.0 - uv.x;
  p = mix(p, flatGround, scrim.y * (1.0 - smoothstep(scrim.z, scrim.w, fromEdge)));
  p *= 1.0 - mixv.z;
  p = mix(p, ground, mixv.y);
  return p - flatGround;
}

// Half-width of the bottle's silhouette at height fraction h (0 base, 1 cap top), relative to the body
// (bottle/geometry.ts BODY_RINGS and CROWN_RINGS, the neck and the cap).
float bottleProfile(float h) {
  float r = mix(0.77, 1.0, smoothstep(0.0, 0.07, h));
  r = mix(r, 0.76, smoothstep(0.7, 0.82, h));
  r = mix(r, 0.48, smoothstep(0.82, 0.88, h));
  return mix(r, 0.53, smoothstep(0.905, 0.92, h));
}

// The bottle standing in the water of a picture: the glass shades the water against it, its reflection
// hangs below it (broken up by the ripples), the stream piles up on its upstream side and trails a wake,
// and the meniscus along the front of the glass catches the sky. All in screen space, over the picture.
vec3 bottleWater(vec3 c, vec2 uv, vec2 t0, vec2 g0x, vec2 g0y, float feather) {
  vec2 P = vec2((uv.x - uBW0.x) * uAspect, uv.y - uBW0.y);
  float baseW = max(uBW0.z * uAspect, 1e-4);
  float halfW = baseW * BODY_OVER_BASE;
  float ellH = max(uBW0.w, 1e-4);
  float H = max(uBW1.x, 1e-4);
  // the water plane in base radii (x right, y toward the camera): the waterline is the unit circle
  vec2 W = vec2(P.x / baseW, -P.y / ellH);
  vec2 axm = vec2(uBW1.y, -uBW1.z);
  float along0 = dot(P, axm) / H;
  float across0 = dot(P, vec2(-axm.y, axm.x));
  // all of it lives round the base and, for the reflection, under the bottle: everywhere else leaves at once
  bool nearBase = abs(W.x) < 6.0 && W.y > -2.5 && W.y < 7.0;
  bool under = uBW2.y > 0.0 && along0 > -0.05 && along0 < 1.1 && abs(across0) < 2.4 * halfW;
  if (!nearBase && !under) return c;
  float water = feather;
  if (uBW1.w > 0.5) water *= uFlowOn.x > 0.0 ? smoothstep(0.15, 0.7, max(0.0, 2.0 * texture2DGradEXT(uFlow0, t0, g0x, g0y).b - 1.0)) : 0.0;
  if (water <= 0.0) return c;
  // ripples: a small, slowly rolling offset from the water field
  vec2 rip = vec2(0.0);
  if (uBW3.w > 0.0) {
    vec2 rq = vec2(uv.x * uAspect, uv.y) * vec2(9.0, 26.0) + vec2(uTime * 0.11, -uTime * 0.07);
    rip = texture2DLodEXT(uWaterNoise, rq, 0.0).rg * 2.0 - 1.0;
  }
  float e = length(W);
  float front = smoothstep(-0.2, 0.4, W.y);

  // contact shade
  float contact = uBW2.x * exp(-pow(max(e - 1.0, 0.0) / 0.6, 2.0)) * smoothstep(0.45, 0.95, e);
  c *= 1.0 - 0.55 * contact * water;

  // the reflection: the bottle mirrored about the waterline, along its own axis flipped on screen
  if (under) {
  float along = along0;
  float across = across0;
  across += rip.x * halfW * uBW3.w * (0.25 + 2.5 * along);
  along += rip.y * 0.03 * uBW3.w;
  float soft = halfW * (0.1 + 0.9 * along);
  float hw = halfW * bottleProfile(along);
  float inside = smoothstep(soft, -soft, abs(across) - hw) * smoothstep(-0.02, 0.04, along) * smoothstep(1.06, 0.96, along);
  float inLabel = smoothstep(soft, -soft, abs(across) - halfW * 0.53) * smoothstep(0.11, 0.16, along) * smoothstep(0.73, 0.68, along);
  float inCap = smoothstep(0.9, 0.93, along);
  vec3 tone = mix(REFL_GLASS, REFL_LABEL, inLabel);
  tone = mix(tone, REFL_CAP, inCap);
  // fresnel on rough water: strongest at the glass, gone a bottle's height away; broken where the ripples tilt away
  float broken = 0.55 + 0.45 * smoothstep(-0.25, 0.35, rip.x + rip.y * 0.5);
  float refl = uBW2.y * inside * exp(-along * 2.2) * broken * water;
  c = mix(c, tone, refl);
  }

  // the stream round the glass, on the water plane: white water piled against the upstream face, two
  // wake lines opening downstream from its sides and churn right behind it, all carried downstream
  if (uBW2.z > 0.0 && nearBase) {
  vec2 down = uBW3.xy;
  float d = dot(W, down);
  float s = dot(W, vec2(-down.y, down.x));
  float bow = smoothstep(0.2, -0.45, d / max(e, 1e-3)) * smoothstep(0.94, 1.04, e) * (1.0 - smoothstep(1.12, 1.75, e));
  float wakeLine = abs(s) - (0.95 + 0.45 * max(d, 0.0));
  float wake = smoothstep(-0.2, 0.3, d) * exp(-pow(wakeLine / 0.38, 2.0)) * exp(-max(d, 0.0) / 1.7);
  float churn = smoothstep(0.2, 0.9, d) * exp(-pow(s / 0.8, 2.0)) * exp(-max(d, 0.0) / 1.2);
  vec2 fq = vec2(d * 0.42 - uTime * uBW3.z, s * 0.85);
  vec4 fn = texture2DLodEXT(uWaterNoise, fq, 0.0);
  float foamN = fn.g * 0.6 + fn.a * 0.4;
  float foam = smoothstep(0.42, 0.78, foamN) * (1.25 * bow + 0.8 * wake + 0.45 * churn);
  c += FOAM_TINT * (foam * uBW2.z * water);
  }

  // the meniscus along the front of the glass
  c += WATERLINE_TINT * (uBW2.w * exp(-pow((e - 1.0) / 0.06, 2.0)) * front * water);
  return c;
}

// Interleaved gradient noise: breaks 8-bit banding in the dark gradients.
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec2 uv = vUv;
  vec3 ground = groundAt(uv);
  vec3 color = ground;

  // both slots sample outside any branch (the gradients stay defined); an idle slot has opacity 0
  vec2 t0 = pictureUv(uMap0, uv, uFit0, uAnchor0, max(uMix0.w, 1.0));
  vec2 t1 = pictureUv(uMap1, uv, uFit1, uAnchor1, max(uMix1.w, 1.0));
  vec2 g0x = dFdx(t0);
  vec2 g0y = dFdy(t0);
  vec2 g1x = dFdx(t1);
  vec2 g1y = dFdy(t1);
  vec3 p0 = texture2DGradEXT(uMap0, t0, g0x, g0y).rgb;
  vec3 p1 = texture2DGradEXT(uMap1, t1, g1x, g1y).rgb;
  if (uWave0.x > 0.0 && uMix0.x > 0.0) p0 = wavePicture(uMap0, t0, g0x, g0y, uWave0);
  if (uWave1.x > 0.0 && uMix1.x > 0.0) p1 = wavePicture(uMap1, t1, g1x, g1y, uWave1);
  if (uFlowOn.x > 0.0 && uMix0.x > 0.0) p0 = mix(p0, flowingPicture(uMap0, uFlow0, t0, p0, g0x, g0y, uTurb.xy, uGlint.xy), uFlowOn.x);
  if (uFlowOn.y > 0.0 && uMix1.x > 0.0) p1 = mix(p1, flowingPicture(uMap1, uFlow1, t1, p1, g1x, g1y, uTurb.zw, uGlint.zw), uFlowOn.y);
  float feather = 1.0 - smoothstep(uFeather.x, uFeather.y, 1.0 - uv.y);
  if (uMix0.x > 0.0) color += uMix0.x * feather * pictureDelta(p0, uMix0, uFlat0, uScrim0, ground, uv);
  if (uMix1.x > 0.0) color += uMix1.x * feather * pictureDelta(p1, uMix1, uFlat1, uScrim1, ground, uv);

  // the bottle standing in the water of the picture (or on its wet rock)
  if (uBW2.x + uBW2.y + uBW2.z + uBW2.w > 0.0) color = bottleWater(color, uv, t0, g0x, g0y, feather);

  // dither about half a display step, in a gamma-2 encoding of the linear color
  vec3 s = sqrt(max(color, 0.0)) + (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(s * s, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export type SlotUniforms = {
  map: THREE.IUniform<THREE.Texture | null>
  /** the picture's flow map (a neutral texel when it has none) */
  flow: THREE.IUniform<THREE.Texture | null>
  fit: THREE.Vector4
  mix: THREE.Vector4
  flat: THREE.Color
  scrim: THREE.Vector4
  anchor: THREE.Vector2
}

export type BackdropUniforms = {
  uGround: THREE.IUniform<THREE.Color>
  uBuiltA: THREE.IUniform<THREE.Vector4>
  uBuiltB: THREE.IUniform<THREE.Vector2>
  uAspect: THREE.IUniform<number>
  uPointer: THREE.IUniform<THREE.Vector2>
  uGlow: THREE.IUniform<THREE.Vector2>
  uPool: THREE.IUniform<THREE.Vector2>
  uLift: THREE.IUniform<THREE.Vector2>
  uKey: THREE.IUniform<THREE.Vector2>
  uHorizon: THREE.IUniform<number>
  uFeather: THREE.IUniform<THREE.Vector2>
  uMap0: THREE.IUniform<THREE.Texture | null>
  uFit0: THREE.IUniform<THREE.Vector4>
  uMix0: THREE.IUniform<THREE.Vector4>
  uFlat0: THREE.IUniform<THREE.Color>
  uScrim0: THREE.IUniform<THREE.Vector4>
  uAnchor0: THREE.IUniform<THREE.Vector2>
  uMap1: THREE.IUniform<THREE.Texture | null>
  uFit1: THREE.IUniform<THREE.Vector4>
  uMix1: THREE.IUniform<THREE.Vector4>
  uFlat1: THREE.IUniform<THREE.Color>
  uScrim1: THREE.IUniform<THREE.Vector4>
  uAnchor1: THREE.IUniform<THREE.Vector2>
  uTime: THREE.IUniform<number>
  uWaterNoise: THREE.IUniform<THREE.Texture>
  uFlow0: THREE.IUniform<THREE.Texture | null>
  uFlow1: THREE.IUniform<THREE.Texture | null>
  uFlowOn: THREE.IUniform<THREE.Vector2>
  uTurb: THREE.IUniform<THREE.Vector4>
  uGlint: THREE.IUniform<THREE.Vector4>
  uWave0: THREE.IUniform<THREE.Vector4>
  uWave1: THREE.IUniform<THREE.Vector4>
  uBW0: THREE.IUniform<THREE.Vector4>
  uBW1: THREE.IUniform<THREE.Vector4>
  uBW2: THREE.IUniform<THREE.Vector4>
  uBW3: THREE.IUniform<THREE.Vector4>
}

export type BackdropParts = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  uniforms: BackdropUniforms
  slots: readonly [SlotUniforms, SlotUniforms]
  dispose(): void
}

/** A 1x1 black texture for idle slots, so every sampler is bound. */
function blackTexture(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  t.needsUpdate = true
  return t
}

/** A 1x1 flow map texel: no velocity, nothing moves. */
function stillFlowTexture(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 0, 255]), 1, 1)
  t.needsUpdate = true
  return t
}

export function createBackdrop(): BackdropParts {
  const black = blackTexture()
  const still = stillFlowTexture()
  const water = createWaterNoise()
  const uniforms: BackdropUniforms = {
    uGround: { value: new THREE.Color(ground('opening')) },
    uBuiltA: { value: new THREE.Vector4() },
    uBuiltB: { value: new THREE.Vector2(0, 1) },
    uAspect: { value: 1.6 },
    uPointer: { value: new THREE.Vector2() },
    uGlow: { value: new THREE.Vector2(0.6, 1) },
    uPool: { value: new THREE.Vector2(0.4, 0.5) },
    uLift: { value: new THREE.Vector2(0.5, 0.5) },
    uKey: { value: new THREE.Vector2(0.7, 1) },
    uHorizon: { value: 0.35 },
    uFeather: { value: new THREE.Vector2(2, 3) },
    uMap0: { value: black },
    uFit0: { value: new THREE.Vector4(1, 1, 0, 0) },
    uMix0: { value: new THREE.Vector4(0, 0, 0, 1) },
    uFlat0: { value: new THREE.Color() },
    uScrim0: { value: new THREE.Vector4(1, 0, 0.2, 0.5) },
    uAnchor0: { value: new THREE.Vector2(0.5, 0.5) },
    uMap1: { value: black },
    uFit1: { value: new THREE.Vector4(1, 1, 0, 0) },
    uMix1: { value: new THREE.Vector4(0, 0, 0, 1) },
    uFlat1: { value: new THREE.Color() },
    uScrim1: { value: new THREE.Vector4(1, 0, 0.2, 0.5) },
    uAnchor1: { value: new THREE.Vector2(0.5, 0.5) },
    uTime: { value: 0 },
    uWaterNoise: { value: water },
    uFlow0: { value: still },
    uFlow1: { value: still },
    uFlowOn: { value: new THREE.Vector2() },
    uTurb: { value: new THREE.Vector4() },
    uGlint: { value: new THREE.Vector4() },
    uWave0: { value: new THREE.Vector4() },
    uWave1: { value: new THREE.Vector4() },
    uBW0: { value: new THREE.Vector4(0.5, 0.3, 0.05, 0.01) },
    uBW1: { value: new THREE.Vector4(0.6, 0, 1, 0) },
    uBW2: { value: new THREE.Vector4() },
    uBW3: { value: new THREE.Vector4(-1, 0, 0.05, 1) },
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))

  const material = new THREE.ShaderMaterial({
    name: 'IonaBackdrop',
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    depthTest: false,
    depthWrite: false,
    fog: false,
    transparent: false,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'BACKDROP'
  mesh.frustumCulled = false
  mesh.renderOrder = -1000
  mesh.matrixAutoUpdate = false

  const slots: readonly [SlotUniforms, SlotUniforms] = [
    { map: uniforms.uMap0, flow: uniforms.uFlow0, fit: uniforms.uFit0.value, mix: uniforms.uMix0.value, flat: uniforms.uFlat0.value, scrim: uniforms.uScrim0.value, anchor: uniforms.uAnchor0.value },
    { map: uniforms.uMap1, flow: uniforms.uFlow1, fit: uniforms.uFit1.value, mix: uniforms.uMix1.value, flat: uniforms.uFlat1.value, scrim: uniforms.uScrim1.value, anchor: uniforms.uAnchor1.value },
  ]

  return {
    mesh,
    uniforms,
    slots,
    dispose() {
      geometry.dispose()
      material.dispose()
      black.dispose()
      still.dispose()
      water.dispose()
    },
  }
}

export { blackTexture, stillFlowTexture }
