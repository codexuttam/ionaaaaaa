import { SCENES } from '../experience/scenes'

// The readable story (docs/04 "Accessibility tree"): one entry per scene, in
// order, visually hidden inside #story. Scene ids double as the hash ids from
// docs/02; the entries sit at the top of the spacer so a native hash jump lands
// at scroll 0 and the film's own deep link does the real seek.
export function BeatList() {
  return (
    <ol className="beats">
      {SCENES.map((s) =>
        s.index ? (
          <li key={s.id} id={s.id}>
            <h2>{s.title}</h2>
          </li>
        ) : (
          <li key={s.id}>{s.title}</li>
        ),
      )}
    </ol>
  )
}
