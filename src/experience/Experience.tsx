import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { advanceFilm, film, onSceneChange, runFrameListeners, setLayout } from './film'
import { rig } from './rig'
import { dampInput, input, attachInput } from './input'
import { TIERS } from './quality'
import { buildMasterTimeline, clearRegistration } from './timeline'
import { sizeStory, startTransport, stepPlayhead, transport, scrollToTime } from './scroller'
import { applyLayoutProjection } from './plateSpace'
import { createEnvRig, ENV_LOOKS, type EnvWeights } from './env'
import { SCENES } from './scenes'
import { Post } from './Post'
import { setHidden, setUnderwater } from './audio'
import { createIonaBottle } from '../bottle/createBottle'
import { BOTTLE_BASE_Y, bottleLive, createBottleMotion } from './bottleMotion'
import { bottleInstance } from '../bottle/instance'
import { loadBottleFonts } from '../bottle/fonts'
import { Backdrop } from '../world/Backdrop'
import { FogCards } from '../world/FogCards'
import { Dust } from '../world/Dust'
import { Bubbles } from '../world/Bubbles'
import { Spray } from '../world/Spray'
import { WaterfallDrops } from '../world/WaterfallDrops'
import { Drop } from '../world/Drop'
import { Ripple } from '../world/Ripple'
import { CapDroplets } from '../world/CapDroplets'
import { WaterHelix } from '../world/WaterHelix'
import { Ribbon } from '../world/Ribbon'
import { Beams } from '../world/Beams'
import { Carton } from '../world/Carton'
import { Underwater } from '../world/Underwater'
import { ContactShadow } from '../world/ContactShadow'

// The canvas and the frame driver. One loop: the GSAP ticker advances Lenis,
// the playhead, the film state, the camera, and then renders R3F manually
// (frameloop "never"), so scroll and picture are always on the same frame.

export type FilmApi = {
  timeline: gsap.core.Timeline
  /** Seek the film to virtual time t immediately (debug and deep links). */
  seek(t: number): void
}

export const filmApi: { current: FilmApi | null } = { current: null }

const CAMERA_POINTER_GAIN = 0.06

/** Harness only (?shot=1): stops the loop clock (float, sway, bob, drift) so measurements see a still frame. */
let frozen = false

function FilmDriver() {
  const { advance, camera, gl, scene, setDpr } = useThree()
  const cam = camera as THREE.PerspectiveCamera

  useLayoutEffect(() => {
    const tl = buildMasterTimeline()
    let hidden = document.hidden
    let lastFov = -1
    let lastLayoutKey = ''
    const progressEl = document.getElementById('film-progress')
    let lastProgress = -1

    // adaptive DPR: step down when frames are slow, never below the tier floor
    const tier = TIERS[film.tier]
    let dpr = Math.min(window.devicePixelRatio || 1, tier.dprCap)
    gl.transmissionResolutionScale = tier.transmissionScale
    let slowTime = 0
    let sampleTime = 0
    let sampleFrames = 0

    const applyCamera = () => {
      const c = rig.camera
      const px = input.dx * CAMERA_POINTER_GAIN
      const py = input.dy * CAMERA_POINTER_GAIN * 0.5
      cam.position.set(c.x + px, c.y + py, c.z)
      cam.lookAt(c.tx + px * 0.35, c.ty + py * 0.35, c.tz)
      const layoutKey = `${film.layout}:${film.width}x${film.height}`
      if (c.fov !== lastFov || layoutKey !== lastLayoutKey) {
        applyLayoutProjection(cam, film.layout, c.fov, film.width, film.height)
        lastFov = c.fov
        lastLayoutKey = layoutKey
      }
    }

    const onTick = (time: number, dt: number) => {
      if (hidden) return
      const t = stepPlayhead(dt)
      film.targetTime = transport.target
      if (Math.abs(tl.time() - t) > 1e-5) tl.time(t)
      advanceFilm(t, dt, frozen)
      dampInput(film.delta)
      applyCamera()
      setUnderwater(film.presence.underwater)

      if (progressEl && Math.abs(film.progress - lastProgress) > 0.0005) {
        lastProgress = film.progress
        progressEl.style.transform = `scaleX(${film.progress.toFixed(4)})`
      }

      // adaptive DPR
      sampleTime += dt
      sampleFrames++
      if (sampleTime >= 1) {
        const fps = sampleFrames / sampleTime
        slowTime = fps < 44 ? slowTime + sampleTime : 0
        if (slowTime >= 2 && dpr > tier.dprFloor + 0.01) {
          dpr = Math.max(tier.dprFloor, dpr - 0.25)
          setDpr(dpr)
          slowTime = 0
        } else if (slowTime >= 2 && gl.transmissionResolutionScale > tier.transmissionFloor + 0.01) {
          // DPR sits at the floor and frames are still slow: the glass refraction pass (a second scene
          // render plus a mip chain every frame) steps down toward the tier's floor
          gl.transmissionResolutionScale = Math.max(tier.transmissionFloor, gl.transmissionResolutionScale - 0.25)
          slowTime = 0
        }
        sampleTime = 0
        sampleFrames = 0
      }

      // Nothing is drawn until the warm-up has compiled every program. The canvas is still invisible
      // (the poster frame holds the landing), and a render now would compile the hero's glass
      // synchronously: seconds of main thread on ANGLE/D3D11, with no paint at all meanwhile. The DOM
      // layers still follow the film, so the type and its scrims are right when the picture arrives.
      if (!film.ready) {
        runFrameListeners()
        return
      }

      // Once the story has scrolled above the viewport, the Water section and the footer cover the
      // film completely: skip the render and the layers that only show over it (GPU and battery
      // while the visitor reads). The film state above still advances, so scrolling back is seamless.
      const trigger = transport.trigger
      if (trigger && window.scrollY > trigger.end + film.height + 2) return

      advance(time)
      // DOM layers that move with the film (captions, the hero word rotator, the callouts pinned to the
      // bottle) run after the render, so they read this frame's bottle projection; the browser paints
      // canvas and DOM together
      runFrameListeners()
    }

    const stop = startTransport(onTick)

    const seek = (t: number) => {
      scrollToTime(t, { immediate: true })
      transport.snap = true
      transport.target = t
    }
    filmApi.current = { timeline: tl, seek }

    // Deep links: #hash (production) and ?scene= / ?t= (debug and screenshot harness).
    const params = new URLSearchParams(location.search)
    const bridge = film.debug || params.get('shot') === '1'
    const hashId = location.hash.replace('#', '')
    const sceneParam = params.get('scene') ?? hashId
    const deep = SCENES.find((s) => s.id === sceneParam && s.id !== 'opening')
    const tParam = bridge ? Number.parseFloat(params.get('t') ?? '') : Number.NaN
    const deepTime = Number.isFinite(tParam) ? tParam : deep ? deep.t0 + 0.02 * deep.dur : null
    let deepTimer = 0
    if (deepTime !== null) {
      film.arrivedMidFilm = true
      deepTimer = window.setTimeout(() => {
        ScrollTrigger.refresh()
        seek(deepTime)
      }, 60)
    }
    if (bridge) {
      ;(window as unknown as { __IONA__: unknown }).__IONA__ = {
        timeline: tl,
        film,
        rig,
        seek,
        freeze(on: boolean) {
          frozen = on
        },
        sceneAt: (t: number) => SCENES.find((s) => t >= s.t0 && t < s.t0 + s.dur)?.id ?? 'closing',
        get bottle() {
          return bottleInstance.current
        },
        get ready() {
          return film.ready && film.pending === 0 && Math.abs(transport.playhead - transport.target) < 0.01
        },
      }
    }

    // resize: layout, spacer, registration, timeline function values
    let resizeTimer = 0
    const onResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        const wasMobile = film.mobile
        const keep = film.time
        setLayout(window.innerWidth, window.innerHeight)
        clearRegistration()
        sizeStory()
        tl.invalidate()
        ScrollTrigger.refresh()
        if (wasMobile !== film.mobile) scrollToTime(keep, { immediate: true })
        // invalidate() keeps the playhead; nudge it so the active tweens re-initialize with the new values
        tl.time(transport.playhead + 1e-4, false)
        tl.time(transport.playhead, false)
      }, 150)
    }
    window.addEventListener('resize', onResize)
    const onVis = () => {
      hidden = document.hidden
      setHidden(hidden)
      transport.lenis?.[hidden ? 'stop' : 'start']()
    }
    document.addEventListener('visibilitychange', onVis)
    const detachInput = attachInput()
    document.fonts?.ready.then(() => ScrollTrigger.refresh())

    return () => {
      window.clearTimeout(deepTimer)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVis)
      detachInput()
      stop()
      tl.kill()
      filmApi.current = null
    }
  }, [advance, cam, gl, setDpr])

  // Warm-up: compile every shader variant the film will ask for, in parallel
  // (KHR_parallel_shader_compile) and before the bottle first appears. The
  // program cache key includes the colour space of the active render target,
  // so the compile runs with a target bound (the composer renders the scene
  // into a linear buffer, never straight to the canvas). The glass and the
  // liquid also need their back-face variant (three renders double-sided
  // transmissive meshes a second time with BackSide for the transmission
  // buffer) and the label its blending variant (transparent while the bottle
  // fades). Anything missed here compiles synchronously on first use: one to
  // three seconds per physical material on ANGLE/D3D11.
  useEffect(() => {
    let cancelled = false
    const id = window.setTimeout(async () => {
      const hiddenObjs: THREE.Object3D[] = []
      scene.traverse((o) => {
        if (!o.visible) {
          hiddenObjs.push(o)
          o.visible = true
        }
      })
      const target = TIERS[film.tier].composer === 'none' ? null : new THREE.WebGLRenderTarget(4, 4)
      const compile = async () => {
        // compileAsync creates the programs synchronously (with the target bound) and only waits asynchronously
        gl.setRenderTarget(target)
        const done = gl.compileAsync(scene, cam)
        gl.setRenderTarget(null)
        await done
      }
      const bottle = bottleInstance.current
      const flipped: THREE.MeshPhysicalMaterial[] = []
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material
        if (!(o as THREE.Mesh).isMesh || Array.isArray(m) || !(m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) return
        const pm = m as THREE.MeshPhysicalMaterial
        if (pm.transmission > 0 && pm.side === THREE.DoubleSide && !flipped.includes(pm)) flipped.push(pm)
      })
      const loaded = (v: number) => (film.load.target = Math.max(film.load.target, v))
      loaded(0.15)
      try {
        bottle?.setFade(1)
        await compile()
        loaded(0.4)
        bottle?.setFade(0.5)
        await compile()
        loaded(0.55)
        for (const m of flipped) {
          m.side = THREE.BackSide
          m.needsUpdate = true
        }
        await compile()
        loaded(0.7)
      } catch {
        // compileAsync is best effort
      }
      for (const m of flipped) {
        m.side = THREE.DoubleSide
        m.needsUpdate = true
      }

      // Upload every texture the scene holds and read each program's uniforms now, one per task. three
      // does both lazily on the first draw: the label and cap canvases (about 0.8 s of uploads) and the
      // uniform reflection of 30 programs (about 1 s on ANGLE) would land in the first visible frame.
      const nextTask = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      try {
        await loadBottleFonts() // the label and cap canvases are drawn when Satoshi is in
        const textures = new Set<THREE.Texture>()
        const collect = (v: unknown) => {
          if (v instanceof THREE.Texture && !(v instanceof THREE.CubeTexture) && v.image) textures.add(v)
        }
        scene.traverse((o) => {
          const mat = (o as THREE.Mesh).material
          for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
            for (const v of Object.values(m)) collect(v)
            const uniforms = (m as THREE.ShaderMaterial).uniforms
            if (uniforms) for (const u of Object.values(uniforms)) collect(u?.value)
          }
        })
        for (const t of textures) {
          if (cancelled) break
          const img = t.image as { complete?: boolean; width?: number }
          if (img.complete === false || img.width === 0) continue
          gl.initTexture(t)
          await nextTask()
        }
        loaded(0.8)
        type Reflectable = { getUniforms(): unknown; getAttributes(): unknown }
        for (const p of gl.info.programs ?? []) {
          if (cancelled) break
          ;(p as unknown as Reflectable).getUniforms()
          ;(p as unknown as Reflectable).getAttributes()
          await nextTask()
        }
      } catch {
        // best effort, as the compile
      }
      loaded(0.9)
      bottle?.setFade(0)
      target?.dispose()
      hiddenObjs.forEach((o) => (o.visible = false))
      // The first full frame (the post chain compiles its own passes here) is drawn while the canvas is
      // still invisible, so the fade-in never reveals an empty canvas.
      if (!cancelled) {
        try {
          advance(performance.now() / 1000)
        } catch {
          // the next tick draws
        }
      }
      if (!cancelled) {
        loaded(0.95)
        film.ready = true
        // the picture fades in (styles.css) and the hero intro may start (TypeRoot.tsx)
        document.documentElement.dataset.ready = '1'
        document.dispatchEvent(new CustomEvent('iona:ready'))
      }
    }, 50)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [advance, gl, scene, cam])

  return null
}

/** Clear color, fog and exposure follow the blended scene look. */
function SceneGrade() {
  const { gl, scene } = useThree()
  const fog = useMemo(() => new THREE.FogExp2('#070E14', 0.06), [])
  useLayoutEffect(() => {
    scene.fog = fog
    scene.background = null
    return () => {
      scene.fog = null
    }
  }, [scene, fog])
  useFrame(() => {
    gl.setClearColor(film.look.ground, 1)
    fog.color.copy(film.look.ground)
    fog.density = film.look.fog
  }, -5)
  return null
}

const KEY = { pos: new THREE.Vector3(-4, 5, 3), color: '#e7eef5', intensity: 2.4 }
const RIM = { pos: new THREE.Vector3(3.5, 2.2, -4), color: '#9fd0e0', intensity: 3.2 }
const FILL = { pos: new THREE.Vector3(0, 0.5, 6), color: '#245062', intensity: 0.35 }
const UNDERWATER_KEY = new THREE.Vector3(0, 6, 2)

/** The bottle's light rig: key, rim, fill and the glint spot (docs/06). */
function Lights() {
  const key = useRef<THREE.DirectionalLight>(null)
  const rim = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const glint = useRef<THREE.SpotLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  const keyColor = useMemo(() => new THREE.Color(KEY.color), [])
  const waterColor = useMemo(() => new THREE.Color('#d5e4ee'), [])

  useFrame(() => {
    const look = film.look
    const uw = film.presence.underwater
    if (key.current) {
      key.current.intensity = KEY.intensity * look.key
      key.current.position.lerpVectors(KEY.pos, UNDERWATER_KEY, uw)
      key.current.color.copy(keyColor).lerp(waterColor, uw)
    }
    if (rim.current) rim.current.intensity = RIM.intensity * look.rim
    if (fill.current) fill.current.intensity = FILL.intensity * look.fill

    const b = rig.bottle
    target.position.set(b.x, b.y + 0.2 * b.s, b.z)
    target.updateMatrixWorld()
    if (glint.current) {
      // one slow glint every ~4 s crossing the facets; peak 8 in the hero, dimmer elsewhere
      const period = 4.2
      const ph = (film.elapsed % period) / period
      const sweep = Math.sin(Math.PI * Math.min(Math.max((ph - 0.1) / 0.7, 0), 1))
      const peak = rig.light.glint >= 0.99 ? 8 : 4
      glint.current.intensity = peak * rig.light.glint * sweep * sweep * b.fade
      glint.current.position.set(b.x + 2 - 3.2 * ph, b.y + 3, b.z + 2)
      // never toggle the light's visibility: the spot-light count is part of every lit material's
      // program cache key, so a toggle recompiles the whole set (seconds on ANGLE/D3D11). Intensity 0 is free.
    }
  })

  return (
    <>
      <directionalLight ref={key} position={KEY.pos} color={KEY.color} intensity={KEY.intensity} />
      <directionalLight ref={rim} position={RIM.pos} color={RIM.color} intensity={RIM.intensity} />
      <directionalLight ref={fill} position={FILL.pos} color={FILL.color} intensity={FILL.intensity} />
      <primitive object={target} />
      <spotLight ref={glint} color="#ffffff" angle={0.14} penumbra={0.7} distance={9} decay={1.2} target={target} intensity={0} />
    </>
  )
}

/** Environment maps per look (env.ts); the dominant beat's map is handed to the scene when it changes. */
function EnvironmentRig() {
  const { gl, scene } = useThree()
  const envRig = useMemo(() => createEnvRig(gl), [gl])
  const weights = useMemo(() => Object.fromEntries(ENV_LOOKS.map((l) => [l, 0])) as EnvWeights, [])
  useLayoutEffect(() => {
    scene.environment = envRig.texture
    // the procedural studios (spotlight, the alkaline high-key set) are built once the film is up, not mid-scroll
    const prewarm = () => window.setTimeout(() => envRig.prewarm(), 2500)
    if (film.ready) prewarm()
    else document.addEventListener('iona:ready', prewarm, { once: true })
    return () => {
      document.removeEventListener('iona:ready', prewarm)
      scene.environment = null
      envRig.dispose()
    }
  }, [scene, envRig])
  useFrame(() => {
    for (const l of ENV_LOOKS) weights[l] = 0
    for (const s of SCENES) weights[s.look.env] += film.presence[s.id]
    envRig.update(gl, weights)
    if (scene.environment !== envRig.texture) scene.environment = envRig.texture
  }, -4)
  return null
}

/** Water on the glass per beat (materials.ts WET_GLSL); every other beat is dry. */
const WET = { hero: 0.55, cap: 0.5, waterfall: 1 } as const
/** The hero bottle comes down from this far above its place (bottle heights of group space) and this far turned. */
const ENTER_DROP = 1.1
const ENTER_TURN = 0.55
/** Depth of the stream round the hero bottle's foot, group space (the base bevel is about 0.08 tall). */
const WATER_DEPTH = 0.045

/** The one live bottle. Timeline owns the base pose; this adds its motion (bottleMotion.ts), pointer, fade. */
function BottleRig() {
  const bottle = useMemo(() => createIonaBottle({ tier: film.tier }), [])
  const motion = useMemo(() => createBottleMotion(), [])
  const clock = useMemo(() => ({ time: -1, velocity: 0 }), [])
  const entering = useMemo(() => ({ ...rig.bottle }), [])
  useLayoutEffect(() => {
    bottleInstance.current = bottle
    document.fonts?.ready.then(() => bottle.refreshTextures())
    return () => {
      bottleInstance.current = null
      bottle.dispose()
    }
  }, [bottle])

  useFrame(() => {
    const b = rig.bottle
    const g = bottle.group
    const P = film.presence
    // the playhead's velocity (a deep link or a seek jumps: the motion snaps instead of flying in)
    const dt = Math.max(film.delta, 1e-4)
    const jump = clock.time < 0 || Math.abs(film.time - clock.time) > 1.5
    const v = jump ? 0 : (film.time - clock.time) / dt
    clock.velocity += (v - clock.velocity) * (1 - Math.exp(-dt / 0.12))
    if (jump) clock.velocity = 0
    clock.time = film.time
    // after the loader the hero bottle comes down into the stream, turning into its pose, and lands softly
    // (the springs give it its weight); film.entrance runs 0 to 1 (dom/Loader.tsx)
    const away = 1 - film.entrance
    Object.assign(entering, b)
    entering.y = b.y + ENTER_DROP * away * b.s
    entering.ry = b.ry - ENTER_TURN * away
    entering.fade = b.fade * THREE.MathUtils.smoothstep(film.entrance, 0, 0.45)
    motion.step({
      target: entering,
      scaleTrim: film.layout === 'tablet' ? 0.92 : 1,
      dt,
      elapsed: film.elapsed,
      filmVelocity: clock.velocity,
      // on the slab, the rock, the carton floor: no bob, and leans pivot on the base
      standing: Math.min(1, P.hero + P.cap + P.pack + P.waterfall),
      water: P.underwater,
      pointerPitch: input.dy * film.look.gainPitch,
      pointerYaw: input.dx * film.look.gainYaw,
      // the landing hero turns the bottle a few degrees back and forth so the facets keep catching light while
      // the visitor reads; a slow period keeps it under the "slow weather" rule
      sway: Math.sin(film.elapsed * 0.33) * 0.055 * P.hero,
      snap: jump,
    })
    const L = bottleLive
    g.position.set(L.x, L.y, L.z)
    g.rotation.set(L.rx, L.ry, L.rz)
    g.scale.setScalar(L.s)
    bottle.setFade(entering.fade * film.debugBottle)
    // the high-key set gives the alkaline glass its own contrast (black flags): only a light lift there
    bottle.setEnvIntensity(1 + 0.15 * film.presence.alkaline + 0.25 * film.presence.pack)
    // on the white ground the glass is drawn by its dark rim (materials.ts edgeInk)
    bottle.setEdgeInk(film.presence.alkaline)
    // water on the glass: a mist from the falls in the hero and its cap close-up, running drops under the
    // falling water; the studio beats, the facet close-up and the dive stay dry and clean
    bottle.setWet(film.liveWater.wet ? WET.hero * P.hero + WET.cap * P.cap + WET.waterfall * P.waterfall : 0)
    // the water inside moves in every beat; the facet close-up keeps it calmer (the glass is the subject there)
    bottle.setInnerFlow(1 - 0.6 * P.facets)
    // the hero bottle stands in the stream on the slab: its foot is under water
    // the stream is where the bottle stands, not where it is while it comes down
    bottle.setWater(b.y + (BOTTLE_BASE_Y + WATER_DEPTH) * bottleLive.s, P.hero)
    bottle.update(film.elapsed, film.delta)

  }, -3)

  return <primitive object={bottle.group} />
}

function SceneChangeEffects() {
  useEffect(
    () =>
      onSceneChange((next) => {
        document.documentElement.dataset.scene = next.id
      }),
    [],
  )
  return null
}

export function Experience() {
  const tier = TIERS[film.tier]
  const dpr = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, tier.dprCap)
  return (
    <Canvas
      frameloop="never"
      dpr={dpr}
      flat={false}
      gl={(defaults) => {
        const renderer = new THREE.WebGLRenderer({ ...defaults, antialias: tier.antialias, powerPreference: 'high-performance', alpha: false, stencil: false })
        // Post.tsx owns tone mapping (a highlight-only roll-off that leaves the plates untouched)
        renderer.toneMapping = THREE.NoToneMapping
        renderer.toneMappingExposure = 1
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.setClearColor('#070E14', 1)
        // The D3D compiler's info log (precision notes on the PMREM and glass shaders) is dev-only noise in
        // the console, and reading it forces a synchronous link. It has to be off before the first program
        // compiles: the env rig builds its PMREM shaders during the first render, before onCreated would run.
        renderer.debug.checkShaderErrors = import.meta.env.DEV
        return renderer
      }}
      camera={{ fov: 28, near: 0.05, far: 80, position: [0, 0.4, 4.2] }}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', touchAction: 'auto' }}
      aria-hidden="true"
    >
      <FilmDriver />
      <SceneChangeEffects />
      <SceneGrade />
      <EnvironmentRig />
      <Lights />
      <Backdrop />
      <BottleRig />
      <ContactShadow />
      <FogCards />
      <Dust />
      <Bubbles />
      <Spray />
      <WaterfallDrops />
      <Drop />
      <Ripple />
      <CapDroplets />
      <WaterHelix />
      <Ribbon />
      <Beams />
      <Carton />
      <Underwater />
      <Post />
    </Canvas>
  )
}
