import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { film } from '../experience/film'
import { REVEAL_EVENT, landsOnHero } from '../experience/landing'

// The loader: the film waits until everything it opens on is in. A dark field
// with the wordmark and a hairline across the top of the page that fills as the
// film loads (the pictures and their water, the bottle's label and cap, every
// shader program, the first frame). Then the bar completes, the field lifts off
// the film with the water already moving, the bottle comes in (film.entrance)
// and the hero lockup plays (TypeRoot.tsx listens for REVEAL_EVENT).
//
// The bar eases toward the warm-up's progress and creeps on its own while a long
// step runs (a shader compile stalls the page for a second or two), so it never
// looks stuck. The screenshot harness (?shot=1) gets no field and no entrance:
// its frames are the film at rest the moment it is ready.

/** However long loading takes, the film shows after this long. */
const LOADER_MAX = 25000
/** The bottle comes down into its place over this long, after the field has started to lift. */
const ENTRANCE_S = 2.2
const ENTRANCE_DELAY_S = 0.25

export function Loader() {
  const root = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLElement>(null)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const harness = params.get('shot') === '1'
    const html = document.documentElement
    // a hero landing brings the bottle in; any other first frame shows it where it stands
    film.entrance = landsOnHero() && !harness ? 0 : 1

    let shown = 0
    let raf = 0
    let last = performance.now()
    const t0 = last
    let done = false
    const reveal = () => {
      if (done) return
      done = true
      film.revealed = true
      html.dataset.loaded = '1'
      document.dispatchEvent(new CustomEvent(REVEAL_EVENT))
      if (film.entrance < 1) gsap.to(film, { entrance: 1, duration: ENTRANCE_S, delay: ENTRANCE_DELAY_S, ease: 'power2.out' })
    }
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const ready = film.ready && film.pending === 0
      const waited = now - t0
      // the warm-up's own steps, and a slow creep toward 0.9 between them
      const creep = 0.9 * (1 - Math.exp(-waited / 9000))
      const target = ready || waited > LOADER_MAX ? 1 : Math.min(0.97, Math.max(film.load.target, creep))
      shown += (target - shown) * (1 - Math.exp(-dt / (target === 1 ? 0.12 : 0.35)))
      if (bar.current) bar.current.style.transform = `scaleX(${shown.toFixed(4)})`
      if (target === 1 && shown > 0.985) {
        if (bar.current) bar.current.style.transform = 'scaleX(1)'
        reveal()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      gsap.killTweensOf(film)
    }
  }, [])

  const harness = typeof location !== 'undefined' && new URLSearchParams(location.search).get('shot') === '1'
  if (harness) return null
  return (
    <div id="loader" ref={root} aria-hidden="true">
      <span className="loader__bar">
        <i ref={bar} />
      </span>
      <span className="loader__word" translate="no">
        IONA
      </span>
    </div>
  )
}
