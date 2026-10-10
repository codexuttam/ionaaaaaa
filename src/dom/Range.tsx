import { useEffect, useRef, type CSSProperties, type PointerEvent } from 'react'
import { openContact } from './contact'
import { RANGE } from './copy'
import { useReveal } from './reveal'

// "The Range" (story copy 09): the two planned sizes after the film, as two equal
// product cards. IONA is in development, so the section says so and every card
// leads to the launch list. Each bottle is a render of the film's 3D
// bottle with its own size on the label (scripts/products.mjs); it stands on a
// shared baseline at its real height relative to the tallest (millimetres from the
// specification), floats on its own phase like the film's bottle, and catches a
// highlight that sweeps across the glass as the card arrives; on a fine pointer the
// highlight follows the cursor. The highlight is a gradient masked by the render's
// own alpha, so light only lands on the bottle. The section rises in sequence when
// it enters the viewport (one IntersectionObserver, CSS transitions staggered by
// --i); reduced motion and the still sequence show it complete and still.

const BASE = import.meta.env.BASE_URL
/** Rendered width of a bottle frame: about 240 px on wide screens, 200 px on phones. */
const SIZES = '(max-width: 759px) 200px, 240px'
const TALLEST = Math.max(...RANGE.items.map((p) => p.mm))

type Item = (typeof RANGE.items)[number]
type Props = { mode: 'film' | 'stills' }

const fill = (s: string, size: string, name: string) => s.replace('{size}', size).replace('{name}', name)

export function Range({ mode }: Props) {
  const root = useReveal<HTMLElement>(mode)

  return (
    <section id="range" className="range" ref={root} aria-labelledby="range-title">
      <div className="range__inner">
        <header className="range__head">
          <p className="range__eyebrow">{RANGE.eyebrow}</p>
          <h2 id="range-title" className="range__title">
            {RANGE.title.map((l) => (
              <span className="line" key={l}>
                {l}
              </span>
            ))}
          </h2>
          <div className="range__intro">
            <p className="range__status">{RANGE.status}</p>
          </div>
        </header>
        <ul className="range__grid">
          {RANGE.items.map((p, i) => (
            <Product key={p.size + p.unit} item={p} index={i} />
          ))}
        </ul>
      </div>
    </section>
  )
}

function Product({ item, index }: { item: Item; index: number }) {
  const card = useRef<HTMLLIElement>(null)
  const frame = useRef(0)
  const size = `${item.size} ${item.unit}`
  const small = `${BASE}products/iona-${item.image}-480.webp`
  const large = `${BASE}products/iona-${item.image}-960.webp`
  const mask: CSSProperties = { WebkitMaskImage: `url("${small}")`, maskImage: `url("${small}")` }

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  // the highlight follows a mouse across the card; the card's own custom property only, one write a frame
  const onMove = (e: PointerEvent<HTMLLIElement>) => {
    if (e.pointerType !== 'mouse') return
    const el = card.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1)
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => el.style.setProperty('--light', x.toFixed(3)))
  }
  const onLeave = () => {
    cancelAnimationFrame(frame.current)
    card.current?.style.removeProperty('--light')
  }

  return (
    <li
      className="product"
      ref={card}
      style={{ '--i': index, '--h': (item.mm / TALLEST).toFixed(3) } as CSSProperties}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <div className="product__stage">
        <span className="product__pool" aria-hidden="true" />
        <span className="product__shadow" aria-hidden="true" />
        <div className="product__float">
          <div className="product__bottle">
            <img
              className="product__img"
              src={small}
              srcSet={`${small} 320w, ${large} 640w`}
              sizes={SIZES}
              width={320}
              height={480}
              alt={fill(RANGE.alt, size, item.name)}
              loading="lazy"
              decoding="async"
            />
            <span className="product__glint" style={mask} aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="product__body">
        <p className="product__tag">{RANGE.planned}</p>
        <h3 className="product__size">
          {item.size}
          <span className="product__unit">{item.unit}</span>
        </h3>
        <p className="product__name">{item.name}</p>
        <p className="product__text">{item.text}</p>
        <dl className="product__specs">
          <div className="product__spec">
            <dt>{RANGE.specs.height}</dt>
            <dd>{item.height}</dd>
          </div>
          <div className="product__spec">
            <dt>{RANGE.specs.weight}</dt>
            <dd>{item.weight}</dd>
          </div>
          <div className="product__spec">
            <dt>{RANGE.specs.cap}</dt>
            <dd>{item.cap}</dd>
          </div>
        </dl>
        <button
          type="button"
          className="btn btn--primary product__join"
          aria-label={fill(RANGE.joinLabel, size, item.name)}
          onClick={(e) => openContact(e.currentTarget, { kind: 'launch' })}
        >
          {RANGE.join}
        </button>
      </div>
    </li>
  )
}
