import type { IonaBottle } from './types'

// The one live bottle of the film. Experience.tsx creates it once and sets it here.
// World layers that ride on the bottle (cap droplets, helix, caustics) read it.
export const bottleInstance: { current: IonaBottle | null } = { current: null }
