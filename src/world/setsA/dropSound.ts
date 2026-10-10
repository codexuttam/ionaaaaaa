// When the opening drop may sound (docs/08 "Drop", docs/scenes/00).
// Once per arrival from the top: the gate arms only after the film has rested above
// the drop's birth (so a restored scroll position that sweeps through the opening
// never counts), fires on the forward crossing of the impact, then waits for the
// next arrival. Backward scrubs never fire. Deep links never arm it.

export type DropGate = { armed: boolean; rest: number; prev: number }

export const createDropGate = (): DropGate => ({ armed: false, rest: 0, prev: 0 })

/**
 * Advance the gate one frame. `local` is the opening's local progress, `dt` the
 * frame delta in seconds. Returns true on the frame the drop sound should play.
 */
export function stepDropGate(
  g: DropGate,
  local: number,
  dt: number,
  opts: { ready: boolean; midFilm: boolean; born: number; impact: number; armAfter: number },
): boolean {
  let fire = false
  if (opts.midFilm) {
    g.armed = false
    g.rest = 0
  } else if (local < opts.born) {
    if (opts.ready) g.rest += dt
    if (g.rest >= opts.armAfter) g.armed = true
  } else {
    g.rest = 0
  }
  if (g.armed && g.prev < opts.impact && local >= opts.impact) {
    g.armed = false
    // a jump far past the impact in one frame (scrollbar drag, restored position) shows no impact: stay silent
    fire = local < opts.impact + LATE
  }
  g.prev = local
  return fire
}

/** How far past the impact (opening local) a crossing may land and still sound. */
const LATE = 0.08
