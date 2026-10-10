import { useEffect, useRef, type RefObject } from 'react'
import { film, local01, onFrame, ramp } from '../experience/film'
import { SCENES } from '../experience/scenes'
import { INTRO_EVENT, REVEAL_EVENT, landsOnHero } from '../experience/landing'
import { scrollToBeat } from '../experience/scroller'
import { openContact } from './contact'
import { HERO } from './copy'
import { BLOCKS, hasTypeBlock } from './typeBlocks'

// Every lockup is in the DOM from the start (docs/04 "Type root"). The master
// timeline owns visibility through autoAlpha; CSS hides each section until the
// timeline's first set so nothing flashes before the film is ready.
//
// The hero is the landing viewport. Its entrance is a one-shot intro that
// starts when the loader lifts (dom/Loader.tsx, REVEAL_EVENT): the water is
// moving, the bottle is coming down into the stream, and the words rise in
// beside it. The intro is CSS (styles.css, html[data-intro]); the scroll
// timeline owns only the exit (the whole section dissolves).
//
// aria: the hero section is the page's readable headline and holds the primary
// controls; the other lockups duplicate the beat list and stay hidden from AT.

/** The words rise in this long after the loader starts to lift, while the bottle comes down. */
const INTRO_AFTER_REVEAL = 500

function useHeroIntro(section: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = section.current
    if (!root) return
    const html = document.documentElement
    let started = false
    const start = () => {
      if (started) return
      started = true
      // arrived by deep link past the hero: no entrance, the lockup is simply complete when scrolled back to
      if (!landsOnHero()) {
        html.dataset.intro = 'done'
        return
      }
      html.dataset.intro = 'play'
      document.dispatchEvent(new CustomEvent(INTRO_EVENT))
    }
    // everything waits for the loader to lift (dom/Loader.tsx)
    let fallback = 0
    const onReveal = () => {
      fallback = window.setTimeout(start, landsOnHero() ? INTRO_AFTER_REVEAL : 0)
    }
    document.addEventListener(REVEAL_EVENT, onReveal, { once: true })
    // the screenshot harness has no loader: its lockup is complete by the time the film is ready
    const harness = new URLSearchParams(location.search).get('shot') === '1'
    if (film.revealed || harness) onReveal()

    // the scroll cue fades as soon as the visitor starts moving
    const cue = root.querySelector<HTMLElement>('.type__scrollcue')
    const offFrame = onFrame(() => {
      if (cue) cue.style.opacity = (1 - ramp(0.01, 0.12, local01('hero'))).toFixed(2)
    })

    return () => {
      window.clearTimeout(fallback)
      document.removeEventListener(REVEAL_EVENT, onReveal)
      offFrame()
    }
  }, [section])
}

export function TypeRoot() {
  const hero = useRef<HTMLElement>(null)
  useHeroIntro(hero)
  return (
    <div id="type-root">
      {SCENES.filter((s) => hasTypeBlock(s.id)).map((s) => {
        if (!hasTypeBlock(s.id)) return null
        const Block = BLOCKS[s.id]
        const isHero = s.id === 'hero'
        return (
          <section
            key={s.id}
            ref={isHero ? hero : undefined}
            className={`type type--${s.id}`}
            data-scene={s.id}
            data-side={s.typeSide ?? 'left'}
            data-color={s.typeColor}
            aria-hidden={isHero ? undefined : 'true'}
          >
            <div className="type__box">
              <Block anim onNext={() => scrollToBeat('cap')} onJoin={(el) => openContact(el, { kind: 'launch' })} />
            </div>
            {isHero && (
              <div className="type__cue" data-anim="cue" aria-hidden="true">
                <div className="type__scrollcue">
                  <span>{HERO.scroll}</span>
                  <i />
                </div>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
