// The mobile split (docs/03, docs/10): under 760px a gradient of the beat's
// legibility colour rises from the bottom, transparent at 58% of the height and
// opaque from 78% down, and the type lives in that band. The legibility layer
// (Legibility.tsx) writes the blended colour into --scrim every frame, and
// raises the band (--lift) under the hero's taller lockup.
export function MobileScrim() {
  return <div id="mobile-scrim" aria-hidden="true" />
}
