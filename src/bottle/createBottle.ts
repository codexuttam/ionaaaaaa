import * as THREE from 'three'
import type { CreateBottleOptions, IonaBottle } from './types'
import { film } from '../experience/film'
import {
  BASE_Y,
  CAP_BAND_TOP_Y,
  CAP_BOTTOM_Y,
  CAP_R,
  CAP_TOP_R,
  CAP_TOP_Y,
  LIP_Y,
  SHOULDER_Y,
  buildCapBody,
  buildCapTop,
  buildGlass,
  buildLabel,
  buildLiquid,
  buildMeniscus,
} from './geometry'
import { createLabelTexture } from './labelTexture'
import { createCapTextures } from './capTextures'
import { loadBottleFonts } from './fonts'
import { createBottleMaterials, createBottleUniforms, transmissionOnly } from './materials'

// The IONA bottle (geometry.ts), after the client's reference renders: cut crystal
// in transmission glass with the water filled into the neck, a frosted print over
// the front window and another over the back window, a dark punt in the base, and a
// round black cap with IONA cut into the top and printed on the band.
// Group origin = body centre; base at y = -1.20, cap top at y = +1.38.

export type BottleBuildOptions = CreateBottleOptions & {
  /** lookdev only: the size printed at the foot of the front label (the product shots) */
  volume?: string
}

/** How far each label stays inside its window's outline, so the window's polished bevel still frames it. */
const LABEL_INSET = 0.016

export function createIonaBottle(opts: BottleBuildOptions): IonaBottle {
  const tier = opts.tier
  const low = tier === 'low'
  /** segments round the neck and the cap lathes */
  const seg = low ? 48 : 64

  const group = new THREE.Group()
  group.name = 'IONA_BOTTLE'

  // --- glass first: the labels take the shapes of its windows
  const built = buildGlass(seg)
  const front = buildLabel(built.front, 1, LABEL_INSET)
  const back = buildLabel(built.back, -1, LABEL_INSET)
  const aspect = (b: { x0: number; x1: number; y0: number; y1: number }) => (b.y1 - b.y0) / (b.x1 - b.x0)
  const frontTex = createLabelTexture('front', aspect(front.bounds), opts.volume)
  const backTex = createLabelTexture('back', aspect(back.bounds))

  const uniforms = createBottleUniforms()
  const capTex = createCapTextures()
  const mats = createBottleMaterials(tier, uniforms, { front: frontTex.texture, back: backTex.texture }, capTex)

  const glass = new THREE.Mesh(built.glass, mats.glass)
  glass.name = 'IONA_GLASS'
  glass.renderOrder = 2
  group.add(glass)

  // --- liquid, seen only through the glass (drawn into the transmission buffer)
  if (mats.liquid) {
    const liquid = new THREE.Mesh(buildLiquid(), mats.liquid)
    liquid.name = 'IONA_LIQUID'
    liquid.renderOrder = 1
    transmissionOnly(liquid, mats.glassUniforms)
    group.add(liquid)
  }

  if (!low) {
    const meniscus = new THREE.Mesh(buildMeniscus(), mats.meniscus)
    meniscus.name = 'IONA_MENISCUS'
    transmissionOnly(meniscus, mats.glassUniforms)
    group.add(meniscus)
  }

  // --- the two labels, just in front of their windows
  const labelFront = new THREE.Mesh(front.geometry, mats.label)
  labelFront.name = 'IONA_LABEL'
  const labelBack = new THREE.Mesh(back.geometry, mats.labelBack)
  labelBack.name = 'IONA_LABEL_BACK'
  for (const m of [labelFront, labelBack]) {
    m.renderOrder = 3
    group.add(m)
  }

  // --- the punt: a dark ring in the base, seen through the glass
  const puntGeo = new THREE.TorusGeometry(0.12, 0.012, 10, low ? 40 : 64)
  puntGeo.rotateX(Math.PI / 2)
  const punt = new THREE.Mesh(puntGeo, mats.punt)
  punt.name = 'IONA_PUNT'
  punt.position.y = BASE_Y + 0.028
  transmissionOnly(punt, mats.glassUniforms)
  group.add(punt)

  // --- cap
  const capBodyGeo = buildCapBody(seg)
  {
    // v runs up the band so the printed word keeps its proportions
    const p = capBodyGeo.getAttribute('position')
    const uv = capBodyGeo.getAttribute('uv')
    for (let i = 0; i < p.count; i++) uv.setY(i, Math.min(Math.max((p.getY(i) - CAP_BOTTOM_Y) / (CAP_BAND_TOP_Y - CAP_BOTTOM_Y), 0), 1))
    uv.needsUpdate = true
  }
  const capTopGeo = buildCapTop(seg)
  const capBody = new THREE.Mesh(capBodyGeo, mats.capSide)
  const capRim = new THREE.Mesh(capTopGeo.rim, mats.capRim)
  const capFace = new THREE.Mesh(capTopGeo.face, mats.capTop)
  capBody.name = 'IONA_CAP'
  capRim.name = 'IONA_CAP_RIM'
  capFace.name = 'IONA_CAP_TOP'
  for (const m of [capBody, capRim, capFace]) {
    m.renderOrder = 3
    group.add(m)
  }
  // opaque stand-in so the glass and the cap droplets refract a cap
  for (const g of [capBodyGeo, capTopGeo.rim, capTopGeo.face]) {
    const proxy = new THREE.Mesh(g.clone(), mats.capProxy)
    proxy.name = 'IONA_CAP_PROXY'
    transmissionOnly(proxy, mats.glassUniforms)
    group.add(proxy)
  }

  const capSocket = new THREE.Object3D()
  capSocket.name = 'IONA_CAP_SOCKET'
  capSocket.position.set(0, CAP_TOP_Y, 0)
  group.add(capSocket)

  // --- textures: drawn once Satoshi is in (the screenshot harness waits on film.pending)
  let disposed = false
  // One draw of the label and cap canvases, once Satoshi is in (or the font loader has given up);
  // later calls only redraw if the face arrived after that first draw. The canvases stay blank until
  // then, which nothing shows: the film draws nothing before its warm-up (Experience.tsx).
  let drawnWithSatoshi = false
  const satoshiIn = () => typeof document !== 'undefined' && document.fonts?.check?.('300 64px Satoshi') === true
  const canvases = [frontTex, backTex, capTex]
  const refreshTextures = () => {
    if (disposed) return
    if (canvases.every((c) => c.drawn) && (drawnWithSatoshi || !satoshiIn())) return
    for (const c of canvases) c.draw()
    drawnWithSatoshi = satoshiIn()
  }
  film.pending++
  let settled = false
  const settle = () => {
    if (settled) return
    settled = true
    film.pending = Math.max(0, film.pending - 1)
  }
  loadBottleFonts()
    .then(refreshTextures)
    .finally(settle)

  // --- runtime
  const labels = [mats.label, mats.labelBack]
  const fadeMats = [mats.glass, mats.capSide, mats.capTop, mats.capRim, ...labels]
  const envMats: THREE.MeshStandardMaterial[] = []
  const envBase: number[] = []
  mats.envBase.forEach((base, m) => {
    if (labels.includes(m as THREE.MeshPhysicalMaterial)) return // the frost keeps its own level on pale grounds
    envMats.push(m as THREE.MeshStandardMaterial)
    envBase.push(base)
  })
  let lastFade = -1
  let lastEnv = -1

  const bottle: IonaBottle = {
    group,
    capSocket,
    anchors: {
      capTop: new THREE.Vector3(0, CAP_TOP_Y, 0),
      capCenter: new THREE.Vector3(0, (CAP_BOTTOM_Y + CAP_TOP_Y) / 2, 0),
      capRadius: CAP_R,
      capTopRadius: CAP_TOP_R,
      capHeight: CAP_TOP_Y - CAP_BOTTOM_Y,
      lipY: LIP_Y,
      shoulderY: SHOULDER_Y,
      baseY: BASE_Y,
      maxRadius: built.maxRadius,
    },
    setFade(v) {
      const f = Math.min(Math.max(v, 0), 1)
      group.visible = f > 0.001
      if (!group.visible || f === lastFade) return
      lastFade = f
      const solid = f > 0.98
      for (let i = 0; i < fadeMats.length; i++) {
        fadeMats[i].opacity = f
        fadeMats[i].depthWrite = solid
      }
      // the labels are opaque when solid (so the glass refracts them from behind) and blend only while fading
      for (const m of labels) {
        if (m.transparent === solid) {
          m.transparent = !solid
          m.needsUpdate = true
        }
      }
      if (mats.liquid) mats.liquid.opacity = f
      // a slight sink into the scene fog while it fades
      uniforms.uIonaFogBoost.value = (1 - f) * 0.55
    },
    setCaustics(v) {
      uniforms.uIonaCaustics.value = Math.min(Math.max(v, 0), 1)
    },
    setEdgeInk(v) {
      uniforms.uIonaEdgeInk.value = Math.min(Math.max(v, 0), 1)
    },
    setInnerFlow(v) {
      uniforms.uIonaInner.value = Math.min(Math.max(v, 0), 1)
    },
    setWet(v) {
      uniforms.uIonaWet.value = Math.min(Math.max(v, 0), 1)
    },
    setWater(surfaceY, amount) {
      uniforms.uIonaWater.value.set(surfaceY, Math.min(Math.max(amount, 0), 1))
    },
    setEnvIntensity(mult) {
      if (mult === lastEnv) return
      lastEnv = mult
      for (let i = 0; i < envMats.length; i++) envMats[i].envMapIntensity = envBase[i] * mult
    },
    update(elapsed) {
      uniforms.uIonaTime.value = elapsed
    },
    refreshTextures,
    dispose() {
      disposed = true
      settle()
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose()
      })
      for (const m of [mats.glass, mats.liquid, mats.capSide, mats.capTop, mats.capRim, mats.capProxy, mats.label, mats.labelBack, mats.meniscus, mats.punt]) m?.dispose()
      for (const c of canvases) c.dispose()
    },
  }
  return bottle
}
