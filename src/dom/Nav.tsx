import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { getSoundState, initSoundPreference, onSoundChange, toggleSound } from '../experience/audio'
import { film, onSceneChange } from '../experience/film'
import { gyroNeedsPermission, requestGyro } from '../experience/input'
import { scrollToBeat, scrollToSection, transport } from '../experience/scroller'
import type { SceneId } from '../experience/scenes'
import { openContact } from './contact'
import { CHROME, NAV } from './copy'

// The navigation bar: wordmark, section links, Motion (iOS only), Sound, a
// Contact call to action, and the progress hairline the frame driver writes
// (#film-progress scaleX). Below 1024px the links fold into a full-screen
// menu; while it is open the rest of the page is inert and the film holds. In
// film mode a link glides the film to the beat's hold frame; in the still
// sequence it is a plain anchor to the section with that id.

type Props = { mode: 'film' | 'stills' }

/** At and above this width the section links sit in the bar (styles.css uses the same value). */
const WIDE = '(min-width: 1024px)'

export function Nav({ mode }: Props) {
  const filmMode = mode === 'film'
  const [sound, setSound] = useState(getSoundState())
  const [current, setCurrent] = useState<SceneId | null>(filmMode ? film.scene.id : null)
  const [open, setOpen] = useState(false)
  // iOS only: the permission function exists there; a coarse pointer keeps the control off desktops that expose it
  const [motion, setMotion] = useState<'hidden' | 'ask' | 'on'>(() =>
    filmMode && gyroNeedsPermission() && matchMedia('(pointer: coarse)').matches ? 'ask' : 'hidden',
  )
  const header = useRef<HTMLElement>(null)
  const burger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => (filmMode ? onSoundChange(setSound) : undefined), [filmMode])
  // a stored "on" from a past visit resumes on the first gesture (docs/08)
  useEffect(() => (filmMode ? initSoundPreference() : undefined), [filmMode])
  useEffect(() => (filmMode ? onSceneChange((next) => setCurrent(next.id)) : undefined), [filmMode])

  // over the page after the film (the water, the range, the footer) the bar gets a frosted ground, so their
  // headings never run under the links: one observer on those sections, watching a band as tall as the bar
  useEffect(() => {
    if (!filmMode || !('IntersectionObserver' in window)) return
    const root = document.documentElement
    const under = new Set<Element>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) under.add(e.target)
          else under.delete(e.target)
        }
        if (under.size) root.dataset.bar = 'solid'
        else delete root.dataset.bar
      },
      { rootMargin: '0px 0px -92% 0px' },
    )
    for (const id of ['range', 'hospitality', 'launch', 'footer']) {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    }
    return () => {
      io.disconnect()
      delete root.dataset.bar
    }
  }, [filmMode])

  // the menu closes by itself when the window grows past the breakpoint (its button disappears)
  useEffect(() => {
    const wide = matchMedia(WIDE)
    const onChange = () => {
      if (wide.matches) setOpen(false)
    }
    wide.addEventListener('change', onChange)
    return () => wide.removeEventListener('change', onChange)
  }, [])

  // the open menu: Escape closes, focus moves into it and back to the button, the page behind is inert
  useEffect(() => {
    if (!open) return
    document.documentElement.dataset.menu = 'open'
    if (filmMode) transport.lenis?.stop()
    const rootEl = document.getElementById('root')
    const behind = rootEl ? Array.from(rootEl.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el !== header.current) : []
    behind.forEach((el) => (el.inert = true))
    menu.current?.querySelector<HTMLElement>('a, button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      behind.forEach((el) => (el.inert = false))
      delete document.documentElement.dataset.menu
      if (filmMode) transport.lenis?.start()
      burger.current?.focus()
    }
  }, [open, filmMode])

  const go = (e: MouseEvent<HTMLAnchorElement>, id: SceneId | 'range') => {
    setOpen(false)
    if (!filmMode) return
    e.preventDefault()
    if (id !== 'range') return scrollToBeat(id)
    const el = document.getElementById('range')
    if (el) scrollToSection(el)
  }

  const contactFromMenu = () => {
    // close first: the dialog opens once the page behind the menu is no longer inert
    setOpen(false)
    const opener = burger.current
    requestAnimationFrame(() => openContact(opener))
  }

  const onMotion = async () => {
    const ok = await requestGyro()
    setMotion(ok ? 'on' : 'hidden')
  }

  const soundButton = (cls: string) =>
    filmMode && (
      <button type="button" className={`control ${cls}`} aria-pressed={sound === 'on'} onClick={() => void toggleSound()}>
        {sound === 'on' ? CHROME.soundOn : CHROME.sound}
      </button>
    )
  const motionButton = (cls: string) =>
    motion !== 'hidden' && (
      <button type="button" className={`control ${cls}`} aria-pressed={motion === 'on'} onClick={onMotion}>
        {motion === 'on' ? CHROME.motionOn : CHROME.motion}
      </button>
    )

  return (
    <header className="nav" data-mode={mode} ref={header}>
      <div className="nav__bar">
        <a className="nav__wordmark" href="#hero" translate="no" onClick={(e) => go(e, 'hero')}>
          {NAV.wordmark}
        </a>
        <nav className="nav__links" aria-label={NAV.primaryLabel}>
          {NAV.links.map((l) => (
            <a key={l.id} className="nav__link" href={`#${l.id}`} data-current={l.id === current ? 'true' : undefined} onClick={(e) => go(e, l.id)}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="nav__actions">
          {motionButton('nav__control nav__control--motion')}
          {soundButton('nav__control')}
          <button type="button" className="btn btn--primary btn--small nav__cta" onClick={(e) => openContact(e.currentTarget)}>
            {NAV.contact}
          </button>
          <button
            ref={burger}
            type="button"
            className="control nav__burger"
            aria-expanded={open}
            aria-controls="nav-menu"
            aria-label={open ? NAV.close : NAV.menuLabel}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="nav__burger-lines" aria-hidden="true">
              <i />
              <i />
            </span>
            <span className="nav__burger-word">{open ? NAV.close : NAV.menu}</span>
          </button>
        </div>
        <div id="film-progress" className="nav__progress" aria-hidden="true" />
      </div>

      {/* always mounted: CSS fades it and staggers the rows (--i); visibility keeps it out of the tab order when closed */}
      <div id="nav-menu" className="nav__menu" ref={menu} data-open={open ? 'true' : 'false'}>
        <nav className="nav__menu-links" aria-label={NAV.primaryLabel}>
          <a className="nav__menu-link" href="#hero" translate="no" style={{ '--i': 0 } as CSSProperties} data-current={current === 'hero' ? 'true' : undefined} onClick={(e) => go(e, 'hero')}>
            {NAV.wordmark}
          </a>
          {NAV.links.map((l, i) => (
            <a
              key={l.id}
              className="nav__menu-link"
              href={`#${l.id}`}
              style={{ '--i': i + 1 } as CSSProperties}
              data-current={l.id === current ? 'true' : undefined}
              onClick={(e) => go(e, l.id)}
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="nav__menu-actions" style={{ '--i': NAV.links.length + 1 } as CSSProperties}>
          <button type="button" className="btn btn--primary" onClick={contactFromMenu}>
            {NAV.contact}
          </button>
          <div className="nav__menu-controls">
            {motionButton('')}
            {soundButton('')}
          </div>
        </div>
      </div>
    </header>
  )
}
