import { useEffect, useRef } from 'react'
import { film, onFrame } from '../experience/film'
import { SCENES } from '../experience/scenes'

// The legibility layer: soft bands between the picture and the type, in the
// beat's own legibility colour (film.look.scrim: the scene ground, darkened
// for white type, pale for the ink beat), never a black card.
//   top     under the navigation bar, every beat
//   bottom  under the captions and the ticker (desktop and tablet;
//           phones have the ground scrim that carries the lockups)
//   center  behind centred type (the closing), weighted by its presence
// Side scrims behind the lockups live in the backdrop shader (world/backdrop/table.ts),
// where they fade the picture toward its own ground. Every frame this writes the
// blended colour into --scrim on the layers that use it: this one and the phone
// scrim. scripts/contrast.mjs measures the result.

const CENTER_SCENES = SCENES.filter((s) => s.typeSide === 'center').map((s) => s.id)

export function Legibility() {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const center = el.querySelector<HTMLElement>('.legibility__center')!
    const targets = [el, document.getElementById('mobile-scrim')].filter(
      (t): t is HTMLElement => t !== null,
    )
    let lastHex = ''
    let lastCenter = -1
    let lastLift = -1
    let lastBand = -1
    const phoneScrim = document.getElementById('mobile-scrim')
    return onFrame(() => {
      // getHexString converts from the linear working space to sRGB itself (no convertLinearToSRGB first)
      const hex = `#${film.look.scrim.getHexString()}`
      if (hex !== lastHex) {
        lastHex = hex
        for (const t of targets) t.style.setProperty('--scrim', hex)
      }
      // the hero's lockup is the tallest: the phone band rises under it, further on short phones (SE class)
      const lift = Math.round(film.presence.hero * (film.height / film.width < 1.9 ? 22 : 16))
      if (phoneScrim && lift !== lastLift) {
        lastLift = lift
        phoneScrim.style.setProperty('--lift', `${lift}%`)
      }
      // portrait tablets show the phones' band only under the close-up and the underwater words (styles.css)
      const band = Math.round(Math.min(film.presence.facets + film.presence.underwater, 1) * 100) / 100
      if (phoneScrim && band !== lastBand) {
        lastBand = band
        phoneScrim.style.setProperty('--band', String(band))
      }
      let weight = 0
      for (const id of CENTER_SCENES) weight += film.presence[id]
      weight = Math.round(Math.min(weight, 1) * 100) / 100
      if (weight !== lastCenter) {
        lastCenter = weight
        center.style.opacity = String(weight)
      }
    })
  }, [])

  return (
    <div id="legibility" ref={root} aria-hidden="true">
      <div className="legibility__top" />
      <div className="legibility__bottom" />
      <div className="legibility__center" />
    </div>
  )
}
