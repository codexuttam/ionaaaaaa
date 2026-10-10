import { useState } from 'react'
import { SCENES, type SceneDef } from '../experience/scenes'
import { ContactDialog } from './ContactDialog'
import { Footer } from './Footer'
import { Nav } from './Nav'
import { Invitation } from './Invitation'
import { Range } from './Range'
import { openContact } from './contact'
import { BLOCKS, hasTypeBlock } from './typeBlocks'

// The still sequence (docs/04 "Noscript and WebGL failure", docs/10): a normal
// scrolling document with every line of copy, in order, on the generated
// backdrops. Shown for prefers-reduced-motion and when WebGL is unavailable.
// Backdrops: public/bg/<sceneId>-1440.webp; a missing one leaves the ground color.

/** The beats of the film that own scroll (the opening is the drop before the hero). */
const STILL_SCENES: readonly SceneDef[] = SCENES.filter((s) => s.vh.desktop > 0)

const BASE = import.meta.env.BASE_URL

/**
 * The beat's picture. First choice: the film's own hold frame, rendered by
 * scripts/stills.mjs (public/stills/<id>.webp, and <id>-m.webp framed for
 * phones), which carries the live bottle and the set. Fallback: the bare
 * backdrop. A beat with neither keeps its ground colour.
 */
function Plate({ scene }: { scene: SceneDef }) {
  const [stage, setStage] = useState<'frame' | 'backdrop' | 'none'>('frame')
  if (stage === 'none') return null
  if (stage === 'frame') {
    return (
      <picture>
        <source media="(max-width: 759px)" srcSet={`${BASE}stills/${scene.id}-m.webp`} type="image/webp" />
        <img
          className="stills__plate stills__plate--frame"
          width={1440}
          height={900}
          src={`${BASE}stills/${scene.id}.webp`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setStage(scene.backdrop ? 'backdrop' : 'none')}
        />
      </picture>
    )
  }
  // object-position pins the framing's backdrop point near the same screen fraction
  const { uv } = scene.framing.desktop
  return (
    <img
      className="stills__plate"
      width={1440}
      height={804}
      src={`${BASE}bg/${scene.backdrop}-1440.webp`}
      alt=""
      loading="lazy"
      decoding="async"
      style={{ objectPosition: `${(uv[0] * 100).toFixed(1)}% ${(uv[1] * 100).toFixed(1)}%` }}
      onError={() => setStage('none')}
    />
  )
}

function StillScene({ scene }: { scene: SceneDef }) {
  const Block = hasTypeBlock(scene.id) ? BLOCKS[scene.id] : null
  return (
    <section
      className={`stills__scene stills__scene--${scene.id}`}
      id={scene.id}
      data-side={scene.typeSide ?? 'left'}
      data-color={scene.typeColor}
      style={{ background: scene.look.ground }}
      aria-label={scene.title}
    >
      <Plate scene={scene} />
      {Block && <div className="stills__scrim" aria-hidden="true" />}
      {Block ? (
        <div className="type stills__type" data-scene={scene.id} data-side={scene.typeSide ?? 'left'} data-color={scene.typeColor}>
          <div className="type__box">
            <Block anim={false} onNext={() => document.getElementById('cap')?.scrollIntoView({ behavior: 'smooth' })} onJoin={(el) => openContact(el, { kind: 'launch' })} />
          </div>
        </div>
      ) : (
        <h2 className="sr-only">{scene.title}</h2>
      )}
    </section>
  )
}

export function Stills() {
  return (
    <>
      <a className="skip" href="#footer">
        Skip to footer
      </a>
      <Nav mode="stills" />
      <main id="stills" className="stills">
        {STILL_SCENES.map((scene) => (
          <StillScene key={scene.id} scene={scene} />
        ))}
        <Range mode="stills" />
        <Invitation mode="stills" />
      </main>
      <Footer mode="stills" />
      <ContactDialog />
    </>
  )
}
