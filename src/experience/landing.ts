import { SCENE_BY_ID } from './scenes'

// Where this visit lands, decided once from the address: the hero (the landing viewport) or another
// beat (a #scene link, ?scene=, or the screenshot harness's ?t= outside the hero). The poster frame,
// the hero intro and the moment the 3D canvas mounts all depend on it.

/** True when the first frame of this visit is the hero. */
export function landsOnHero(search: string = location.search, hash: string = location.hash): boolean {
  const params = new URLSearchParams(search)
  const t = Number.parseFloat(params.get('t') ?? '')
  const hero = SCENE_BY_ID.hero
  if (Number.isFinite(t)) return t >= hero.t0 && t < hero.t0 + hero.outStart * hero.dur
  const id = params.get('scene') ?? hash.slice(1)
  // no target, the hero itself, the opening (no scroll of its own), the contact dialog or an unknown hash
  return !id || id === 'hero' || id === 'opening' || !(id in SCENE_BY_ID)
}

/** Fired by TypeRoot.tsx when the hero intro starts. */
export const INTRO_EVENT = 'iona:intro'

/**
 * Fired by dom/Loader.tsx when everything is loaded and the loader lifts off the film: the water is
 * already moving, the bottle comes in (film.entrance), then the hero lockup plays.
 */
export const REVEAL_EVENT = 'iona:reveal'
