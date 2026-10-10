import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { FILM_DURATION, SCENE_BY_ID, progressToTime, storyVh, timeToProgress, type SceneId } from './scenes'
import { film } from './film'

gsap.registerPlugin(ScrollTrigger)
// Mobile toolbars resize the viewport while scrolling; refreshing then would jump the film.
ScrollTrigger.config({ ignoreMobileResize: true })

// The transport. Lenis smooths the wheel, one ScrollTrigger observes #story,
// and the playhead catches up to the scroll position with the master scrub
// (0.65 s). The frame driver reads `transport.playhead` every tick.

/** Seconds the playhead takes to catch up with the scroll (the master scrub). */
export const SCRUB = 0.65

export const transport = {
  lenis: null as Lenis | null,
  trigger: null as ScrollTrigger | null,
  /** Smoothed virtual time. */
  playhead: 0,
  /** Virtual time implied by the scroll position right now. */
  target: 0,
  /** When true the playhead jumps to the target on the next tick (deep links, debug seeks). */
  snap: true,
}

export function storyElement(): HTMLElement | null {
  return document.getElementById('story')
}

/** Apply the vh column for the current layout to #story (100vh + sum). */
export function sizeStory(): void {
  const el = storyElement()
  if (!el) return
  el.style.setProperty('--story-vh', String(storyVh(film.mobile)))
}

/** Scroll distance of the film in px (top of #story to the moment its bottom meets the viewport bottom). */
function filmScrollRange(): { start: number; distance: number } {
  const el = storyElement()
  if (!el) return { start: 0, distance: 1 }
  const top = el.getBoundingClientRect().top + window.scrollY
  return { start: top, distance: Math.max(1, el.offsetHeight - window.innerHeight) }
}

export function timeToScrollY(t: number): number {
  const { start, distance } = filmScrollRange()
  return start + timeToProgress(Math.min(Math.max(t, 0), FILM_DURATION), film.mobile) * distance
}

export function scrollToTime(t: number, opts: { immediate?: boolean; duration?: number } = {}): void {
  const y = timeToScrollY(t)
  if (opts.immediate) {
    transport.snap = true
    transport.target = t
  }
  if (transport.lenis) {
    transport.lenis.scrollTo(y, {
      immediate: opts.immediate ?? false,
      duration: opts.duration ?? 2.4,
      easing: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
      force: true,
    })
  } else {
    window.scrollTo({ top: y, behavior: opts.immediate ? 'auto' : 'smooth' })
  }
}

/** Scroll to a scene's start (local 0.02 by default, docs/04 deep link). */
export function scrollToScene(id: SceneId, local = 0.02, opts: { immediate?: boolean; duration?: number } = {}): void {
  const s = SCENE_BY_ID[id]
  scrollToTime(s.t0 + local * s.dur, opts)
}

/**
 * Navigation links (bar, menu, footer): the hero is the top of the page; any other beat lands on
 * its hold frame, where its picture and its words are complete.
 */
export function scrollToBeat(id: SceneId): void {
  if (id === 'hero') scrollToTop()
  else scrollToScene(id, SCENE_BY_ID[id].hold)
}

export function scrollToTop(): void {
  if (transport.lenis) transport.lenis.scrollTo(0, { duration: 2.4, force: true })
  else window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** Scroll to one of the sections after the film ("The Water", "The Range"). */
export function scrollToSection(el: HTMLElement): void {
  if (transport.lenis) transport.lenis.scrollTo(el, { duration: 1.8, force: true })
  else el.scrollIntoView({ behavior: 'smooth' })
}

/**
 * Create Lenis and the single ScrollTrigger. `onTick` runs on the GSAP ticker
 * after Lenis has advanced, which is where the frame driver renders.
 */
export function startTransport(onTick: (time: number, dtSeconds: number) => void): () => void {
  sizeStory()
  const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true, syncTouch: false })
  transport.lenis = lenis
  lenis.on('scroll', ScrollTrigger.update)

  transport.trigger = ScrollTrigger.create({
    trigger: '#story',
    start: 'top top',
    end: 'bottom bottom',
    markers: film.debug,
    invalidateOnRefresh: true,
    onUpdate(self) {
      transport.target = progressToTime(self.progress, film.mobile)
    },
    onRefresh(self) {
      transport.target = progressToTime(self.progress, film.mobile)
    },
  })

  const tick = (time: number, deltaMs: number) => {
    lenis.raf(time * 1000)
    onTick(time, deltaMs / 1000)
  }
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)

  return () => {
    gsap.ticker.remove(tick)
    transport.trigger?.kill()
    transport.trigger = null
    lenis.destroy()
    transport.lenis = null
  }
}

/** Advance the playhead toward the scroll target (frame-rate independent exponential scrub). */
export function stepPlayhead(dt: number): number {
  if (transport.snap) {
    transport.playhead = transport.target
    transport.snap = false
    return transport.playhead
  }
  // ~95% of the way in SCRUB seconds
  const k = 1 - Math.exp((-3 * dt) / SCRUB)
  const next = transport.playhead + (transport.target - transport.playhead) * k
  transport.playhead = Math.abs(transport.target - next) < 1e-4 ? transport.target : next
  return transport.playhead
}
