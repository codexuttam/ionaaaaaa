import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { film } from '../experience/film'
import { input } from '../experience/input'
import { BACKDROPS, type UVRect } from '../experience/plateMeta'
import { fovFor } from '../experience/plateSpace'
import { SCENES, type SceneId } from '../experience/scenes'
import { CameraFrame, layoutKey, scenePlateYToViewport } from './particles/frame'
import { OUTPUT } from './particles/glsl'
import { luminance, softMaterial } from './particles/material'
import { acquireFogNoise, releaseFogNoise } from './particles/noiseTexture'

// "Fog rolls in layers" (docs/07 Fog, docs/scenes/01). Up to four large planes
// that live in camera space: each frame they are re-centered on the visible
// rectangle at their depth, so they always frame the shot, from in front of the
// subject to well behind it. The mist itself is sampled in world space from one
// seamless fbm field, so camera moves give true depth parallax, while each layer
// drifts on X at its own speed (one tile per 18–28 s) with a slow domain warp
// for internal evolution. Pointer parallax on X: 0.15 / 0.35 / 0.6 (docs/08).
// Each scene shapes the layers (opacity and a soft vertical band, in plate UV
// for plate scenes); profiles are blended by scene presence, so the mist morphs
// through every dissolve and never resets.

type Layer = {
  /** view depth of the card */
  depth: number
  /** pointer parallax on X, world units at full deflection */
  gain: number
  /** seconds for the mist to drift one tile */
  cycle: number
  /** drift direction on screen */
  dir: 1 | -1
  /** tile height in frame heights (feature size) */
  tile: number
  seed: number
}

const LAYERS: readonly Layer[] = [
  { depth: 7.2, gain: 0.15, cycle: 28, dir: -1, tile: 1.35, seed: 0.13 },
  { depth: 5.9, gain: 0.35, cycle: 24, dir: 1, tile: 1.2, seed: 0.57 },
  { depth: 3.3, gain: 0.6, cycle: 20, dir: 1, tile: 1.1, seed: 0.31 },
  { depth: 2.4, gain: 0.6, cycle: 18, dir: 1, tile: 1.0, seed: 0.79 },
]

/** Card size over the visible rectangle at its depth; the overflow hides every edge. */
const MARGIN = 1.22
/** Perceptual gain on the docs' card opacities (linear-light blending reads stronger than the spec's numbers). */
const FOG_GAIN = 1
const FOG_BASE = new THREE.Color('#9eb4c4')

/** [opacity, band center, band half-height]; band in plate UV y for plate scenes, viewport y otherwise (0 = top). */
type Card = readonly [number, number, number]
type Profile = { cards: readonly [Card, Card, Card, Card]; rise?: number }

const quiet: Card = [0, 0.9, 0.1]

const OPENING: Profile = { cards: [[0.05, 0.46, 0.5], [0.08, 0.6, 0.34], [0.1, 0.74, 0.24], quiet] }

const DEFAULT: Profile = { cards: [[0.1, 0.45, 0.45], [0.08, 0.64, 0.3], [0.06, 0.85, 0.18], quiet] }

/** Bands for the plates that mark where their mist sits. */
function mistBand(region: UVRect | undefined, fallback: readonly [number, number]): readonly [number, number] {
  return region ? [(region[1] + region[3]) / 2, (region[3] - region[1]) / 2] : fallback
}

function profileFor(id: SceneId): Profile {
  switch (id) {
    case 'opening':
    case 'closing':
      return OPENING
    case 'hero':
      // high mist over the ridges, a bank on the horizon, ground mist over the moving water
      return { cards: [[0.12, 0.4, 0.3], [0.12, 0.62, 0.12], [0.08, 0.86, 0.12], [0.08, 0.97, 0.08]] }
    case 'cap':
      return { cards: [[0.12, 0.5, 0.6], [0.1, 0.55, 0.5], [0.08, 0.62, 0.4], [0.06, 0.8, 0.25]] }
    case 'ionized':
      return { cards: [[0.12, 0.3, 0.4], [0.08, 0.6, 0.4], [0.04, 0.8, 0.2], quiet] }
    case 'alkaline':
      // the pale frame keeps one very faint card
      return { cards: [[0.08, 0.5, 0.6], quiet, quiet, quiet] }
    case 'clean':
      return { cards: [[0.12, 0.25, 0.3], [0.1, 0.72, 0.2], [0.06, 0.88, 0.14], quiet] }
    case 'minerals': {
      const [c, h] = mistBand(BACKDROPS.minerals.regions.mist, [0.7, 0.15])
      return { cards: [[0.1, c - 0.06, h * 1.5], [0.1, c, h], [0.07, c + 0.08, h * 0.7], quiet] }
    }
    case 'waterfall': {
      // mist off the rocks: banks in the lower third, rising slowly
      const [c, h] = mistBand(BACKDROPS.waterfall.regions.mist, [0.72, 0.18])
      return { rise: 0.028, cards: [[0.08, c - 0.1, h], [0.1, c + 0.02, h * 0.9], [0.1, c + 0.12, h * 0.7], [0.08, 0.95, 0.08]] }
    }
    case 'spotlight':
      return { cards: [[0.12, 0.4, 0.5], [0.08, 0.6, 0.4], quiet, quiet] }
    default:
      return DEFAULT
  }
}

const FOG_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const FOG_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform vec3 uColor;
uniform float uOpacity;
uniform vec2 uScale;
uniform vec2 uDrift;
uniform vec2 uDrift2;
uniform vec2 uWarp;
uniform float uPointer;
uniform vec3 uBand;
uniform float uMargin;
uniform vec2 uContrast;
uniform float uSeed;
varying vec3 vWorld;
varying vec2 vUv;

void main() {
  // world-anchored sample: camera moves give depth parallax; x is stretched so banks are wider than tall
  vec2 p = vec2(vWorld.x + uPointer, vWorld.y) * uScale + uSeed;
  vec4 w = texture2D(uNoise, p * 0.41 + uWarp);
  vec2 q = p + (w.zw - 0.5) * 0.7 + uDrift;
  float n1 = texture2D(uNoise, q).x;
  float n2 = texture2D(uNoise, q * 1.93 + uDrift2).y;
  float mist = smoothstep(uContrast.x, uContrast.y, mix(n1, n2, 0.32));

  // soft vertical band in viewport space (0 = top)
  float vy = 0.5 - (vUv.y - 0.5) * uMargin;
  float band = 1.0 - smoothstep(max(uBand.y - uBand.z, 0.0), uBand.y + uBand.z, abs(vy - uBand.x));

  // feathered card edges (outside the frame, a safety net)
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = smoothstep(0.0, 0.05, e.x) * smoothstep(0.0, 0.05, e.y);

  float a = mist * band * edge * uOpacity;
  gl_FragColor = vec4(uColor * a, a);
  ${OUTPUT}
}
`

type CardState = { dx: number; dy: number; d2x: number; d2y: number; wx: number; wy: number }

const mod1 = (x: number): number => x - Math.floor(x)

export function FogCards() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const count = film.tier === 'low' ? 3 : 4

  const built = useMemo(() => {
    const noise = acquireFogNoise()
    const geometry = new THREE.PlaneGeometry(1, 1)
    const group = new THREE.Group()
    group.name = 'FOG_CARDS'
    const color = new THREE.Color()
    const cards = LAYERS.slice(0, count).map((layer) => {
      const material = softMaterial({
        vertexShader: FOG_VERT,
        fragmentShader: FOG_FRAG,
        uniforms: {
          uNoise: { value: noise },
          uColor: { value: color },
          uOpacity: { value: 0 },
          uScale: { value: new THREE.Vector2(0.2, 0.4) },
          uDrift: { value: new THREE.Vector2() },
          uDrift2: { value: new THREE.Vector2() },
          uWarp: { value: new THREE.Vector2() },
          uPointer: { value: 0 },
          uBand: { value: new THREE.Vector3(0.5, 0.5, 0.2) },
          uMargin: { value: MARGIN },
          uContrast: { value: new THREE.Vector2(0.34, 0.86) },
          uSeed: { value: layer.seed },
        },
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.frustumCulled = false
      mesh.matrixAutoUpdate = true
      group.add(mesh)
      const state: CardState = { dx: layer.seed, dy: layer.seed * 0.7, d2x: 0.5, d2y: 0.25, wx: layer.seed, wy: 0 }
      return { layer, mesh, material, state }
    })
    return { group, geometry, cards, color }
  }, [count])

  useEffect(
    () => () => {
      built.cards.forEach((c) => c.material.dispose())
      built.geometry.dispose()
      releaseFogNoise()
    },
    [built],
  )

  const frame = useMemo(() => new CameraFrame(), [])
  // per scene × layer: opacity, center, half (viewport units), resolved for the current layout
  const table = useMemo(() => ({ key: '', data: new Float32Array(SCENES.length * 4 * 3), rise: new Float32Array(SCENES.length) }), [])
  const mix = useMemo(() => ({ o: new Float32Array(4), c: new Float32Array(4), h: new Float32Array(4) }), [])

  useFrame(() => {
    const key = layoutKey(film.layout, film.width, film.height)
    if (key !== table.key) {
      table.key = key
      SCENES.forEach((s, si) => {
        const p = profileFor(s.id)
        table.rise[si] = p.rise ?? 0
        p.cards.forEach(([o, c, h], li) => {
          const top = scenePlateYToViewport(s.id, c - h, film.layout, film.width, film.height)
          const bottom = scenePlateYToViewport(s.id, c + h, film.layout, film.width, film.height)
          const k = (si * 4 + li) * 3
          table.data[k] = o
          table.data[k + 1] = (top + bottom) / 2
          table.data[k + 2] = Math.abs(bottom - top) / 2
        })
      })
      // world scale of the mist: one tile spans `tile` frame heights at the card's depth (nominal fov)
      const tan = Math.tan(THREE.MathUtils.degToRad(fovFor(film.layout, 28)) / 2)
      built.cards.forEach(({ layer, material }) => {
        const sy = 1 / (layer.tile * 2 * layer.depth * tan)
        ;(material.uniforms.uScale.value as THREE.Vector2).set(0.45 * sy, sy)
      })
    }

    // blend the scene profiles by presence (band weighted by each scene's opacity)
    mix.o.fill(0)
    mix.c.fill(0)
    mix.h.fill(0)
    let rise = 0
    for (let si = 0; si < SCENES.length; si++) {
      const w = film.presence[SCENES[si].id]
      if (w <= 0) continue
      rise += table.rise[si] * w
      for (let li = 0; li < 4; li++) {
        const k = (si * 4 + li) * 3
        const ow = table.data[k] * w
        mix.o[li] += ow
        mix.c[li] += table.data[k + 1] * ow
        mix.h[li] += table.data[k + 2] * ow
      }
    }
    // the cap dissolve thickens: full-frame banks swell through the cap → ionized window
    const thick = 4 * film.presence.cap * film.presence.ionized

    // #9eb4c4, pulled toward the ground in dark scenes so the mist never reads as a flat gray-blue veil
    const ground = film.look.ground
    const dark = 1 - THREE.MathUtils.smoothstep(luminance(ground), 0.03, 0.25)
    built.color.copy(FOG_BASE).lerp(ground, 0.45 * dark)

    frame.update(camera)
    const dt = film.delta
    const fogCards = film.look.fogCards

    for (let li = 0; li < built.cards.length; li++) {
      const { layer, mesh, material, state } = built.cards[li]
      const u = material.uniforms
      const o = mix.o[li]
      let center = o > 1e-5 ? mix.c[li] / o : 0.5
      let half = o > 1e-5 ? mix.h[li] / o : 0.5
      center += (0.5 - center) * 0.8 * thick
      half += (0.7 - half) * thick
      const opacity = o * (1 + 1.5 * thick) * fogCards * FOG_GAIN
      mesh.visible = opacity > 0.0005
      // drift and evolution run even while hidden so a layer never resumes from a reset
      state.dx = mod1(state.dx - (dt * layer.dir) / layer.cycle)
      state.dy = mod1(state.dy - dt * rise)
      state.d2x = mod1(state.d2x - (dt * layer.dir * 0.55) / layer.cycle)
      state.d2y = mod1(state.d2y + dt * 0.004 - dt * rise * 1.4)
      state.wx = mod1(state.wx + dt * 0.009)
      state.wy = mod1(state.wy - dt * 0.006)
      if (!mesh.visible) continue

      const d = layer.depth
      frame.ndcToWorld(0, 0, d, mesh.position)
      mesh.quaternion.copy(camera.quaternion)
      mesh.scale.set(2 * frame.halfW(d) * MARGIN, 2 * frame.halfH(d) * MARGIN, 1)

      u.uOpacity.value = opacity
      ;(u.uDrift.value as THREE.Vector2).set(state.dx, state.dy)
      ;(u.uDrift2.value as THREE.Vector2).set(state.d2x, state.d2y)
      ;(u.uWarp.value as THREE.Vector2).set(state.wx, state.wy)
      u.uPointer.value = input.dx * layer.gain
      ;(u.uBand.value as THREE.Vector3).set(center, half, 0.06 + half * 0.55)
    }
  })

  return <primitive object={built.group} />
}
