// Film-wide switches that more than one module reads.

/**
 * docs/scenes/13-underwater.md. 'plate': the backdrop draws the generated
 * underwater picture (surface and god rays baked in); the live set adds moving
 * light shafts, bubbles and the caustic flicker on the glass. 'live': the built
 * tank draws its own water surface as well and the backdrop holds the ground.
 */
export const UNDERWATER_MODE: 'live' | 'plate' = 'plate'
