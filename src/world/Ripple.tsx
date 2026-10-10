import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { film, ramp } from '../experience/film'
import {
  CLOSING_RIPPLE_ASPECT,
  CLOSING_RIPPLE_END,
  CLOSING_RIPPLE_HOLD,
  CLOSING_RIPPLE_START,
  CLOSING_RIPPLE_WIDTH,
  DROP_IMPACT,
  OPENING_IMPACT,
  RIPPLE_END,
  RIPPLE_MAX_RADIUS,
  RIPPLE_PEAK_OPACITY,
  clamp01,
  power2Out,
} from './setsA/constants'
import { createPlaneRingMaterial, createScreenRingMaterial } from './setsA/ringMaterials'

// The two ripples (docs/scenes/00, 14, docs/07 "Ripples").
// Opening: one ring on a horizontal plane at the impact point, 0 -> 1.6 units across
// opening local .55-.75, fading out as the hero plate opens from the same point.
// Closing: one ring under the closing line, drawn in screen space over the DOM slot
// [data-anchor="closing-ripple"], expanding across closing local .42-.62 and held at .35.
// Both are scrubbed: a pure function of local progress, never a loop.

const PLANE_SIZE = 4
const SLOT_SELECTOR = '[data-anchor="closing-ripple"]'
/** CSS px of room around the settled closing ring for its halo. */
const SCREEN_MARGIN = 10
/** Re-read the slot this often while the closing is live (the lockup may still be settling). */
const SLOT_REFRESH = 1

type Slot = { cx: number; cy: number; width: number; dirty: boolean; since: number; live: boolean }

export function Ripple() {
  const parts = useMemo(() => {
    const root = new THREE.Group()
    root.name = 'ripples'

    const planeGeometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, 1, 1)
    const planeMaterial = createPlaneRingMaterial(PLANE_SIZE / 2)
    const opening = new THREE.Mesh(planeGeometry, planeMaterial)
    opening.name = 'opening-ripple'
    opening.rotation.x = -Math.PI / 2
    opening.position.set(OPENING_IMPACT.x, OPENING_IMPACT.y, OPENING_IMPACT.z)
    opening.renderOrder = 3
    opening.visible = false

    const quadGeometry = new THREE.PlaneGeometry(2, 2)
    const screenMaterial = createScreenRingMaterial()
    const closing = new THREE.Mesh(quadGeometry, screenMaterial)
    closing.name = 'closing-ripple'
    closing.frustumCulled = false
    closing.renderOrder = 60
    closing.visible = false

    root.add(opening, closing)
    const slot: Slot = { cx: 0.5, cy: 0.508, width: CLOSING_RIPPLE_WIDTH, dirty: true, since: 0, live: false }
    return { root, opening, closing, planeGeometry, planeMaterial, quadGeometry, screenMaterial, slot }
  }, [])

  useEffect(() => {
    const slot = parts.slot
    let timer = 0
    const mark = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => (slot.dirty = true), 160)
    }
    window.addEventListener('resize', mark)
    document.fonts?.ready.then(() => (slot.dirty = true))
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', mark)
      parts.planeGeometry.dispose()
      parts.planeMaterial.dispose()
      parts.quadGeometry.dispose()
      parts.screenMaterial.dispose()
    }
  }, [parts])

  useFrame((state) => {
    const { opening, closing, slot } = parts

    // ---- opening ripple
    const lo = film.local.opening
    const showOpening = lo >= DROP_IMPACT && lo < RIPPLE_END && film.presence.opening > 0.0001
    opening.visible = showOpening
    if (showOpening) {
      const p = clamp01((lo - DROP_IMPACT) / (RIPPLE_END - DROP_IMPACT))
      const u = parts.planeMaterial.uniforms
      u.uRadius.value = RIPPLE_MAX_RADIUS * power2Out(p)
      u.uWidth.value = 0.0045 + 0.011 * p
      u.uOpacity.value = RIPPLE_PEAK_OPACITY * ramp(0, 0.035, p) * Math.pow(1 - p, 1.25)
      u.uTrail.value = 0.32 * ramp(0.06, 0.24, p) * (1 - ramp(0.55, 0.95, p))
      u.uTrough.value = 0.5
      // the brightness the hero plate opens from: a faint light inside the ring, handed to the plate reveal
      u.uGlow.value = 0.045 * ramp(0.15, 0.55, p) * (1 - ramp(0.72, 1, p))
    }

    // ---- closing ripple
    const lc = film.local.closing
    const showClosing = lc >= CLOSING_RIPPLE_START && film.presence.closing > 0.0001
    closing.visible = showClosing
    if (!showClosing) {
      slot.live = false
      return
    }
    // read the DOM slot as the beat becomes live, after a resize, and once a second while live
    slot.since += film.delta
    if (!slot.live || slot.dirty || slot.since > SLOT_REFRESH) readSlot(slot)
    slot.live = true

    const W = Math.max(film.width, 1)
    const H = Math.max(film.height, 1)
    const dpr = state.gl.getPixelRatio()
    const a = slot.width / 2
    const b = a * CLOSING_RIPPLE_ASPECT
    const u = parts.screenMaterial.uniforms
    u.uCenter.value.set(slot.cx * 2 - 1, 1 - slot.cy * 2)
    u.uHalfNdc.value.set(((a + SCREEN_MARGIN) / W) * 2, ((b + SCREEN_MARGIN) / H) * 2)
    u.uHalfPx.value.set((a + SCREEN_MARGIN) * dpr, (b + SCREEN_MARGIN) * dpr)
    u.uAxes.value.set(a * dpr, b * dpr)
    u.uDpr.value = dpr

    const p = clamp01((lc - CLOSING_RIPPLE_START) / (CLOSING_RIPPLE_END - CLOSING_RIPPLE_START))
    const e = power2Out(p)
    const fresh = (1 - e) * (1 - e)
    u.uRadius.value = e
    u.uWidth.value = (0.78 + 0.5 * fresh) * dpr
    u.uHalo.value = 0.1 + 0.16 * fresh
    u.uOpacity.value = ramp(0, 0.05, p) * (CLOSING_RIPPLE_HOLD + 0.32 * fresh) * film.presence.closing
  })

  return <primitive object={parts.root} />
}

function readSlot(slot: Slot): void {
  slot.dirty = false
  slot.since = 0
  const W = window.innerWidth || 1
  const H = window.innerHeight || 1
  const el = document.querySelector<HTMLElement>(SLOT_SELECTOR)
  const r = el?.getBoundingClientRect()
  if (r && r.width + r.height > 2) {
    slot.cx = (r.left + r.width / 2) / W
    slot.cy = (r.top + r.height / 2) / H
    slot.width = r.width >= 40 ? r.width : CLOSING_RIPPLE_WIDTH
    return
  }
  // No slot yet: where the centered closing lockup places it (top 46%, 36px under the subline).
  slot.cx = 0.5
  slot.cy = W <= 759 ? 0.48 : 0.508
  slot.width = CLOSING_RIPPLE_WIDTH
}
