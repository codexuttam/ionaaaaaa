import type { CSSProperties, ReactNode } from 'react'
import { CAP, CLOSING, EVERYDAY, HERO, IONIZED, QUALITIES, REVEAL, STANDARD, TOMORROW, type StoryCopy } from './copy'
import type { SceneId } from '../experience/scenes'

// The lockups, shared by the film (#type-root, animated by the timeline) and
// the still sequence (static). Markup contract with timeline.ts addTypeTweens:
//   [data-anim="eyebrow"], [data-anim="wordmark"] .char, [data-anim="subline"],
//   [data-anim="title"] .line, [data-anim="support"] .line, [data-anim="rule"], [data-anim="lede"], [data-anim="cta"].
// With `anim` false the data-anim hooks are omitted so nothing is ever hidden.

export type TypeSceneId = 'hero' | 'cap' | 'ionized' | 'spotlight' | 'tomorrow' | 'pack' | 'waterfall' | 'facets' | 'underwater'

export const TYPE_SCENES: readonly TypeSceneId[] = ['hero', 'cap', 'ionized', 'spotlight', 'tomorrow', 'pack', 'waterfall', 'facets', 'underwater']

export function hasTypeBlock(id: SceneId): id is TypeSceneId {
  return (TYPE_SCENES as readonly string[]).includes(id)
}

type BlockProps = {
  anim: boolean
  /** hero: on into the story */
  onNext?: () => void
  /** hero: the launch list */
  onJoin?: (el: HTMLElement) => void
}

const a = (anim: boolean, name: string): string | undefined => (anim ? name : undefined)

function Lines({ lines, anim, kind }: { lines: readonly string[]; anim: boolean; kind: 'title' | 'support' }) {
  const Tag = kind === 'title' ? 'h2' : 'p'
  return (
    <Tag className={`type__${kind}`} data-anim={a(anim, kind)}>
      {lines.map((l) => (
        <span className="line" key={l}>
          {l}
        </span>
      ))}
    </Tag>
  )
}

/** The landing hero: the wordmark, the tagline, the story's opening lines and the two controls. */
export function HeroBlock({ anim, onNext, onJoin }: BlockProps) {
  return (
    <>
      <h1 className="type__wordmark" data-anim={a(anim, 'wordmark')} translate="no">
        {HERO.wordmark.split('').map((c, i) => (
          <span className="char" key={`${c}${i}`} style={{ '--ci': i } as CSSProperties}>
            {c}
          </span>
        ))}
      </h1>
      <p className="type__subline" data-anim={a(anim, 'subline')}>
        {HERO.subline}
      </p>
      <p className="type__lede" data-anim={a(anim, 'lede')}>
        {HERO.lede.map((l) => (
          <span className="line" key={l}>
            {l}
          </span>
        ))}
      </p>
      <div className="type__cta" data-anim={a(anim, 'cta')}>
        <button type="button" className="btn btn--primary" onClick={onNext}>
          {HERO.discover}
        </button>
        <button type="button" className="btn" onClick={(e) => onJoin?.(e.currentTarget)}>
          {HERO.join}
        </button>
      </div>
    </>
  )
}

/** A story beat: the section name, the headline, the body. */
function Story({ copy, anim }: { copy: StoryCopy; anim: boolean }) {
  return (
    <>
      <p className="type__eyebrow" data-anim={a(anim, 'eyebrow')}>
        {copy.eyebrow}
      </p>
      <Lines lines={copy.title} anim={anim} kind="title" />
      <Lines lines={copy.body} anim={anim} kind="support" />
    </>
  )
}

/** One of the film's earlier lines: a title in spaced capitals, and the short rule under it. */
function Caps({ lines, anim, rule = true }: { lines: readonly string[]; anim: boolean; rule?: boolean }) {
  return (
    <>
      <h2 className="type__title type__title--caps" data-anim={a(anim, 'title')}>
        {lines.map((l) => (
          <span className="line" key={l}>
            {l}
          </span>
        ))}
      </h2>
      {rule && <span className="type__rule" data-anim={a(anim, 'rule')} aria-hidden="true" />}
    </>
  )
}

/** The film's last frame: the wordmark and the tagline. */
function ClosingBlock({ anim }: BlockProps) {
  return (
    <>
      <p className="type__wordmark type__wordmark--closing" data-anim={a(anim, 'wordmark')} translate="no">
        {CLOSING.wordmark.split('').map((c, i) => (
          <span className="char" key={`${c}${i}`}>
            {c}
          </span>
        ))}
      </p>
      <p className="type__subline" data-anim={a(anim, 'subline')}>
        {CLOSING.subline}
      </p>
    </>
  )
}

export const BLOCKS: Record<TypeSceneId, (p: BlockProps) => ReactNode> = {
  hero: HeroBlock,
  cap: ({ anim }) => <Story copy={CAP} anim={anim} />,
  ionized: ({ anim }) => <Story copy={IONIZED} anim={anim} />,
  spotlight: ({ anim }) => <Story copy={REVEAL} anim={anim} />,
  tomorrow: ({ anim }) => <Story copy={EVERYDAY} anim={anim} />,
  pack: ({ anim }) => <Caps lines={QUALITIES.title} anim={anim} rule={false} />,
  waterfall: ({ anim }) => <Caps lines={STANDARD.title} anim={anim} />,
  facets: ({ anim }) => <Caps lines={TOMORROW.title} anim={anim} />,
  underwater: ClosingBlock,
}
