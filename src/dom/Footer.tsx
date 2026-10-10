import type { MouseEvent } from 'react'
import { scrollToBeat, scrollToSection, scrollToTop } from '../experience/scroller'
import type { SceneId } from '../experience/scenes'
import { openContact } from './contact'
import { FOOTER } from './copy'

type Props = {
  /** Film: links seek the film. Stills: plain anchors to the sections. */
  mode: 'film' | 'stills'
}

// The legal pages ship as plain documents in public/; a host that keeps them elsewhere points
// the links there through VITE_PRIVACY_URL / VITE_TERMS_URL (see .env.example). Social links
// render only when their URL is configured.
const BASE = import.meta.env.BASE_URL
const PRIVACY_URL = import.meta.env.VITE_PRIVACY_URL || `${BASE}privacy.html`
const TERMS_URL = import.meta.env.VITE_TERMS_URL || `${BASE}terms.html`
const SOCIAL: readonly { label: string; url: string | undefined }[] = [
  { label: FOOTER.instagram, url: import.meta.env.VITE_INSTAGRAM_URL },
  { label: FOOTER.x, url: import.meta.env.VITE_X_URL },
  { label: FOOTER.youtube, url: import.meta.env.VITE_YOUTUBE_URL },
]

/** The footer after #story: wordmark, the two controls, the story and company columns, the legal line. */
export function Footer({ mode }: Props) {
  const film = mode === 'film'
  const social = SOCIAL.filter((s): s is { label: string; url: string } => Boolean(s.url))
  const toTop = () => (film ? scrollToTop() : window.scrollTo({ top: 0, behavior: 'smooth' }))
  const go = (e: MouseEvent<HTMLAnchorElement>, id: SceneId) => {
    if (!film) return
    e.preventDefault()
    scrollToBeat(id)
  }
  const toRange = (e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById('range')
    if (!film || !el) return
    e.preventDefault()
    scrollToSection(el)
  }
  const year = new Date().getFullYear()

  return (
    <footer id="footer" className="footer">
      <div className="footer__inner">
        <div className="footer__top">
          <div>
            <p className="footer__wordmark" translate="no">
              {FOOTER.wordmark}
            </p>
            <p className="footer__subline">{FOOTER.subline}</p>
          </div>
          <div className="footer__cta">
            <button type="button" className="btn" onClick={toTop}>
              {FOOTER.explore}
            </button>
            <button type="button" className="btn btn--primary" onClick={(e) => openContact(e.currentTarget)}>
              {FOOTER.contact}
            </button>
          </div>
        </div>

        <div className="footer__grid">
          <div className="footer__col footer__col--story">
            <h3 className="footer__heading">{FOOTER.story}</h3>
            <ul className="footer__list">
              {FOOTER.links.map((l) => (
                <li key={l.id}>
                  <a className="footer__link" href={`#${l.id}`} onClick={(e) => go(e, l.id)}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="footer__col">
            <h3 className="footer__heading">{FOOTER.company}</h3>
            <ul className="footer__list">
              <li>
                <a className="footer__link" href="#range" onClick={toRange}>
                  {FOOTER.range}
                </a>
              </li>
              <li>
                <button type="button" className="footer__link" onClick={(e) => openContact(e.currentTarget, { kind: 'hospitality' })}>
                  {FOOTER.hospitality}
                </button>
              </li>
              <li>
                <button type="button" className="footer__link" onClick={(e) => openContact(e.currentTarget)}>
                  {FOOTER.contact}
                </button>
              </li>
              <li>
                <a className="footer__link" href={PRIVACY_URL}>
                  {FOOTER.privacy}
                </a>
              </li>
              <li>
                <a className="footer__link" href={TERMS_URL}>
                  {FOOTER.terms}
                </a>
              </li>
            </ul>
          </div>
          {social.length > 0 && (
            <div className="footer__col">
              <h3 className="footer__heading">{FOOTER.follow}</h3>
              <ul className="footer__list">
                {social.map((s) => (
                  <li key={s.label}>
                    <a className="footer__link" href={s.url} rel="noopener noreferrer" target="_blank">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="footer__bottom">
          <p className="footer__copyright">
            {FOOTER.copyright} {year}
          </p>
          <p className="footer__tag">{FOOTER.subline}</p>
          <button type="button" className="control footer__top-link" onClick={toTop}>
            {FOOTER.top}
          </button>
        </div>
      </div>
    </footer>
  )
}
