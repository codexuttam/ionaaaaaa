// Shader chunks shared by the atmosphere layers.

/** FogExp2 (or linear fog) amount at a view depth. Needs <fog_pars_fragment>. */
export const FOG_AMOUNT = /* glsl */ `
float ionaFog(float depth) {
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      return 1.0 - exp(-fogDensity * fogDensity * depth * depth);
    #else
      return smoothstep(fogNear, fogFar, depth);
    #endif
  #else
    return 0.0;
  #endif
}
`

/** Interleaved-gradient noise in [0, 1): dithers soft gradients so mist never bands. */
export const DITHER = /* glsl */ `
float ionaDither(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
`

/**
 * Ends every atmosphere fragment shader. The color written before it is
 * premultiplied linear light; alpha is how much of the background it covers.
 */
export const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`
