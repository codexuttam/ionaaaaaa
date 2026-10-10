import * as THREE from 'three'
import { film, type Tier } from '../../experience/film'
import type { BackdropId } from '../../experience/scenes'

// Backdrop textures (public/bg/<id>-<2560|1440>.webp). The first beats on screen
// hold film.pending until they are decoded and on the GPU (gl.initTexture),
// which is what the screenshot harness waits for. The rest load two at a time
// in film order; `want(id)` moves a beat the playhead is approaching to the
// front. A file that is missing (404) is logged once and its beat holds the
// ground. A texture that arrives while its beat is on screen fades in.

const ANISOTROPY: Readonly<Record<Tier, number>> = { high: 8, med: 4, low: 2 }
/** The beats nobody is near yet start streaming this long after the film is ready (the hero intro runs first). */
const STREAM_AFTER_READY = 1200
/** ...or after this long whatever happens. */
const STREAM_FALLBACK = 8000
/** Seconds a freshly loaded backdrop takes to reach full opacity. */
const ARRIVAL = 0.6
const CONCURRENCY = 2

type State = 'queued' | 'loading' | 'done' | 'failed'
type Entry = {
  id: BackdropId
  texture: THREE.Texture | null
  ready: number
  state: State
  holds: boolean
  /** the picture's flow map (moving water), when it has one */
  flow: THREE.Texture | null
  /** 0..1: the flow map fades in once it is on the GPU, so the water starts moving without a jump */
  flowReady: number
  wantsFlow: boolean
}

export type BackdropStore = {
  texture(id: BackdropId): THREE.Texture | null
  /** The picture's flow map, or null (no moving water, or not loaded yet). */
  flow(id: BackdropId): THREE.Texture | null
  /** 0..1: presence of the flow map. */
  flowReady(id: BackdropId): number
  /** 0..1: absent, arriving, present */
  ready(id: BackdropId): number
  /** Ask for a beat ahead of the queue. */
  want(id: BackdropId): void
  /** Advance arrival fades by dt seconds. */
  step(dt: number): void
  dispose(): void
}

/** 2560 for viewports that need it at their DPR, else 1440. */
export function backdropWidth(width: number, dpr: number): 2560 | 1440 {
  return width * dpr >= 1600 ? 2560 : 1440
}

export function backdropUrl(id: BackdropId, size: 2560 | 1440): string {
  return `${import.meta.env.BASE_URL}bg/${id}-${size}.webp`
}

export function flowUrl(id: BackdropId): string {
  return `${import.meta.env.BASE_URL}bg/${id}-flow.png`
}

const missing = new Set<string>()

/**
 * @param ids every backdrop the film draws, in film order
 * @param hold ids that block film.pending (the beat on screen at mount)
 */
export function loadBackdrops(
  gl: THREE.WebGLRenderer,
  ids: readonly BackdropId[],
  hold: readonly BackdropId[],
  tier: Tier,
  flows: readonly BackdropId[],
): BackdropStore {
  const loader = new THREE.TextureLoader()
  const anisotropy = Math.min(ANISOTROPY[tier], gl.capabilities.getMaxAnisotropy())
  const size = backdropWidth(film.width, gl.getPixelRatio())
  const entries = new Map<BackdropId, Entry>()
  const queue: Entry[] = []
  let active = 0
  let disposed = false

  // Uploads run one per animation frame, each after the image is decoded off the main thread:
  // texImage2D on an undecoded 2560 picture decoded it synchronously (100-200 ms of main thread
  // each), and two arriving together stacked into one long task.
  const uploads: (() => void)[] = []
  let uploading = false
  const runUpload = () => {
    const job = uploads.shift()
    if (job && !disposed) job()
    if (uploads.length && !disposed) requestAnimationFrame(runUpload)
    else uploading = false
  }
  const enqueueUpload = (job: () => void) => {
    uploads.push(job)
    if (!uploading) {
      uploading = true
      requestAnimationFrame(runUpload)
    }
  }

  // Only the beats on screen (and the ones the playhead asks for) load until the film is ready and
  // its intro has started; the rest of the film streams after that.
  let streaming = false
  const startStreaming = () => {
    if (streaming) return
    streaming = true
    pump()
  }
  const onReady = () => window.setTimeout(startStreaming, STREAM_AFTER_READY)
  document.addEventListener('iona:ready', onReady, { once: true })
  const streamFallback = window.setTimeout(startStreaming, STREAM_FALLBACK)

  for (const id of ids) {
    const entry: Entry = { id, texture: null, ready: 0, state: 'queued', holds: hold.includes(id), flow: null, flowReady: 0, wantsFlow: flows.includes(id) }
    entries.set(id, entry)
    queue.push(entry)
    if (entry.holds) film.pending++
  }
  // the held beats go first
  queue.sort((a, b) => Number(b.holds) - Number(a.holds))

  const release = (entry: Entry) => {
    if (entry.holds) {
      entry.holds = false
      film.pending = Math.max(0, film.pending - 1)
    }
  }

  const start = (entry: Entry) => {
    entry.state = 'loading'
    active++
    loader.load(
      backdropUrl(entry.id, size),
      (texture) => {
        active--
        if (disposed) {
          texture.dispose()
          return
        }
        texture.name = entry.id
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = anisotropy
        // mirrored edges: parallax and Ken Burns never smear an edge row where the cover fit is tight
        texture.wrapS = THREE.MirroredRepeatWrapping
        texture.wrapT = THREE.MirroredRepeatWrapping
        texture.generateMipmaps = true
        texture.minFilter = THREE.LinearMipmapLinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.needsUpdate = true
        const image = texture.image as HTMLImageElement
        const decoded = typeof image.decode === 'function' ? image.decode().catch(() => undefined) : Promise.resolve()
        void decoded.then(() =>
          enqueueUpload(() => {
            gl.initTexture(texture)
            entry.texture = texture
            entry.state = 'done'
            if (entry.wantsFlow) loadFlow(entry)
            else release(entry)
          }),
        )
        // the next download starts while this one decodes
        pump()
      },
      undefined,
      () => {
        active--
        entry.state = 'failed'
        if (!missing.has(entry.id)) {
          missing.add(entry.id)
          console.info(`[backdrop] ${entry.id} is not generated yet; its beat holds the ground`)
        }
        release(entry)
        pump()
      },
    )
  }

  // The flow map follows its picture; a held beat is released once both are up (the harness then
  // sees the water moving). A missing map only means still water.
  const loadFlow = (entry: Entry) => {
    loader.load(
      flowUrl(entry.id),
      (flow) => {
        if (disposed) {
          flow.dispose()
          return
        }
        flow.name = `${entry.id}-flow`
        flow.colorSpace = THREE.NoColorSpace
        flow.wrapS = THREE.MirroredRepeatWrapping
        flow.wrapT = THREE.MirroredRepeatWrapping
        flow.generateMipmaps = false
        flow.minFilter = THREE.LinearFilter
        flow.magFilter = THREE.LinearFilter
        flow.needsUpdate = true
        const image = flow.image as HTMLImageElement
        const decoded = typeof image.decode === 'function' ? image.decode().catch(() => undefined) : Promise.resolve()
        void decoded.then(() =>
          enqueueUpload(() => {
            gl.initTexture(flow)
            entry.flow = flow
            release(entry)
          }),
        )
      },
      undefined,
      () => release(entry),
    )
  }

  const pump = () => {
    if (disposed) return
    while (active < CONCURRENCY) {
      const next = queue.find((e) => e.state === 'queued' && (e.holds || streaming))
      if (!next) return
      start(next)
    }
  }
  pump()

  return {
    texture: (id) => entries.get(id)?.texture ?? null,
    flow: (id) => entries.get(id)?.flow ?? null,
    flowReady: (id) => entries.get(id)?.flowReady ?? 0,
    ready: (id) => entries.get(id)?.ready ?? 0,
    want(id) {
      const entry = entries.get(id)
      if (!entry || entry.state === 'done' || entry.state === 'failed') return
      // the playhead is at or next to this beat: the harness waits for its picture too
      if (!entry.holds) {
        entry.holds = true
        film.pending++
      }
      if (entry.state !== 'queued') return
      const i = queue.indexOf(entry)
      if (i > 0) {
        queue.splice(i, 1)
        queue.unshift(entry)
      }
      pump()
    },
    step(dt) {
      for (const e of entries.values()) {
        if (e.texture && e.ready < 1) e.ready = Math.min(1, e.ready + dt / ARRIVAL)
        if (e.flow && e.flowReady < 1) e.flowReady = Math.min(1, e.flowReady + dt / ARRIVAL)
      }
    },
    dispose() {
      disposed = true
      document.removeEventListener('iona:ready', onReady)
      window.clearTimeout(streamFallback)
      for (const e of entries.values()) {
        release(e)
        e.texture?.dispose()
        e.texture = null
        e.ready = 0
        e.flow?.dispose()
        e.flow = null
        e.flowReady = 0
      }
    },
  }
}
