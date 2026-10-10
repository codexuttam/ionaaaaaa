import { openContact } from './contact'
import { FINAL, HOSPITALITY } from './copy'
import { useReveal } from './reveal'

// "The invitation" (story copy 10 and 11), after the range: the hospitality
// section, then the final scene with the launch signup over the film's closing
// ripple (public/stills/closing.webp, the frame scripts/stills.mjs rendered when
// the closing was a beat of the film). Both rise in when they enter the viewport;
// reduced motion and the still sequence show them complete and still.

const BASE = import.meta.env.BASE_URL

type Props = { mode: 'film' | 'stills' }

export function Invitation({ mode }: Props) {
  const trade = useReveal<HTMLElement>(mode)
  const final = useReveal<HTMLElement>(mode)
  return (
    <>
      <section id="hospitality" className="trade" ref={trade} aria-labelledby="trade-title">
        <div className="trade__inner">
          <p className="trade__eyebrow">{HOSPITALITY.eyebrow}</p>
          <h2 id="trade-title" className="trade__title">
            {HOSPITALITY.title.map((l) => (
              <span className="line" key={l}>
                {l}
              </span>
            ))}
          </h2>
          <div className="trade__side">
            <p className="trade__body">
              {HOSPITALITY.body.map((l) => (
                <span className="line" key={l}>
                  {l}
                </span>
              ))}
            </p>
            <button type="button" className="btn btn--primary trade__action" onClick={(e) => openContact(e.currentTarget, { kind: 'hospitality' })}>
              {HOSPITALITY.action}
            </button>
          </div>
        </div>
      </section>

      <section id="launch" className="final" ref={final} aria-labelledby="final-title">
        <picture className="final__plate" aria-hidden="true">
          <source media="(max-width: 759px)" srcSet={`${BASE}stills/closing-m.webp`} type="image/webp" />
          <img src={`${BASE}stills/closing.webp`} width={1440} height={900} alt="" loading="lazy" decoding="async" />
        </picture>
        <div className="final__inner">
          <h2 id="final-title" className="final__title">
            {FINAL.title.map((l) => (
              <span className="line" key={l}>
                {l}
              </span>
            ))}
          </h2>
          <p className="final__body">{FINAL.body}</p>
          <button type="button" className="btn btn--primary final__action" onClick={(e) => openContact(e.currentTarget, { kind: 'launch' })}>
            {FINAL.action}
          </button>
          <p className="final__wordmark" translate="no">
            {FINAL.wordmark}
          </p>
          <p className="final__subline">{FINAL.subline}</p>
        </div>
      </section>
    </>
  )
}
