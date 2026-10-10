import type { BackdropId } from './scenes'

// Eyeballed facts about each generated backdrop, for the world layers that sit
// on a feature of the picture (spray on the hero lip, drops on the waterfall
// rocks, mist bands, the underwater surface). All values are backdrop UV:
// origin top-left, 0..1 of the full picture. Every backdrop is 2752x1536.

export type UV = readonly [number, number]
/** [x0, y0, x1, y1] in backdrop UV */
export type UVRect = readonly [number, number, number, number]

export type BackdropMeta = {
  id: BackdropId
  aspect: number
  points: Partial<Record<BackdropPoint, UV>>
  regions: Partial<Record<BackdropRegion, UVRect>>
}

export type BackdropPoint =
  | 'crystalCore' // clean: brightest face of the crystal
  | 'crystalTip'
  | 'shaft' // ionized / clean: origin of the bright water / light rays
  | 'riverBend' // minerals

export type BackdropRegion =
  | 'water' // hero: moving water band over the slab
  | 'lip' // hero: the slab edge where the sheets of water fall
  | 'mist' // minerals / waterfall: where mist sits
  | 'sky' // minerals: sky band for cloud drift
  | 'river' // minerals: river shimmer area
  | 'impact' // waterfall: band where falling drops hit rock
  | 'cartonFront' // pack: carton front face bounds
  | 'cartonSide' // pack: carton left side face bounds
  | 'waterline' // underwater: the surface band

export const BACKDROP_ASPECT = 2752 / 1536

const meta = (id: BackdropId, points: BackdropMeta['points'] = {}, regions: BackdropMeta['regions'] = {}): BackdropMeta => ({
  id,
  aspect: BACKDROP_ASPECT,
  points,
  regions,
})

export const BACKDROPS: Readonly<Record<BackdropId, BackdropMeta>> = {
  hero: meta('hero', {}, { water: [0.25, 0.56, 1, 0.78], lip: [0.27, 0.66, 0.58, 0.74] }),
  cap: meta('cap'),
  ionized: meta('ionized', { shaft: [0.5, 0.05] }),
  alkaline: meta('alkaline'),
  clean: meta('clean', { crystalCore: [0.3, 0.5], crystalTip: [0.35, 0.2], shaft: [0.45, 0.08] }),
  minerals: meta('minerals', { riverBend: [0.5, 0.62] }, { sky: [0, 0, 1, 0.3], mist: [0, 0.55, 1, 0.85], river: [0.3, 0.5, 0.7, 1] }),
  standard: meta('standard'),
  spotlight: meta('spotlight'),
  tomorrow: meta('tomorrow'),
  pack: meta('pack', {}, { cartonFront: [0.12, 0.3, 0.42, 0.78], cartonSide: [0.05, 0.32, 0.12, 0.76] }),
  waterfall: meta('waterfall', {}, { impact: [0, 0.8, 1, 1], mist: [0, 0.45, 1, 0.8] }),
  facets: meta('facets'),
  underwater: meta('underwater', {}, { waterline: [0, 0, 1, 0.32] }),
  closing: meta('closing'),
}
