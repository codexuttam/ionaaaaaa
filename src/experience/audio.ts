// Synthesized sound (docs/08 "Sound"). Muted by default; the Sound control is
// the gesture that creates the AudioContext. Nothing is fetched: a wind bed of
// brown noise through a slow-breathing lowpass, one drop on the opening impact,
// and an underwater bed (the wind lowpassed to 180 Hz plus bubble ticks) while
// the underwater beat is on screen. Every level change is a ramp, never a set.

export type SoundState = 'off' | 'on'

const STORAGE_KEY = 'iona-sound'
const WIND_GAIN = 0.045
const WIND_FILTER_HZ = 420
const WIND_LFO_SECONDS = 11
/** LFO swing: 280–520 Hz around the base. */
const WIND_LFO_DEPTH = 120
const UNDERWATER_FILTER_HZ = 180
const DROP_GAIN = 0.08
const TICK_GAIN = 0.03
const DUCK_LEVEL = 0.3
const FADE = 0.3

type Listener = (s: SoundState) => void
const listeners = new Set<Listener>()
let state: SoundState = 'off'

type Graph = {
  ctx: AudioContext
  master: GainNode
  duck: GainNode
  windFilter: BiquadFilterNode
  windGain: GainNode
  lfo: OscillatorNode
  lfoGain: GainNode
  noise: AudioBuffer
}

let graph: Graph | null = null
let hidden = false
let ducked = false
let underwater = 0
let tickTimer = 0

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

function emit(): void {
  listeners.forEach((fn) => fn(state))
}

function setState(next: SoundState): void {
  if (next === state) return
  state = next
  emit()
}

function persist(value: SoundState): void {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // storage unavailable: the choice lives for this page only
  }
}

function stored(): SoundState | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'on' || v === 'off' ? v : null
  } catch {
    return null
  }
}

/** Two seconds of brown noise (a leaky integral of white noise), normalised. */
function brownNoise(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 2)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  let peak = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[i] = last
    peak = Math.max(peak, Math.abs(last))
  }
  // fade the loop seam so it never clicks
  const seam = Math.floor(ctx.sampleRate * 0.05)
  for (let i = 0; i < seam; i++) {
    const k = i / seam
    data[i] *= k
    data[length - 1 - i] *= k
  }
  const norm = peak > 0 ? 1 / peak : 1
  for (let i = 0; i < length; i++) data[i] *= norm
  return buffer
}

/** Ramp an AudioParam from where it is to `value` over `seconds` (no pops). */
function ramp(param: AudioParam, value: number, seconds: number, ctx: AudioContext): void {
  const now = ctx.currentTime
  param.cancelScheduledValues(now)
  param.setValueAtTime(param.value, now)
  param.linearRampToValueAtTime(value, now + seconds)
}

function windFrequency(): number {
  return WIND_FILTER_HZ + (UNDERWATER_FILTER_HZ - WIND_FILTER_HZ) * underwater
}

function build(): Graph | null {
  if (graph) return graph
  const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined
  if (!Ctor) return null
  const ctx = new Ctor()
  const master = ctx.createGain()
  master.gain.value = 0
  const duck = ctx.createGain()
  duck.gain.value = 1
  duck.connect(master)
  master.connect(ctx.destination)

  const noise = brownNoise(ctx)
  const wind = ctx.createBufferSource()
  wind.buffer = noise
  wind.loop = true
  const windFilter = ctx.createBiquadFilter()
  windFilter.type = 'lowpass'
  windFilter.frequency.value = WIND_FILTER_HZ
  windFilter.Q.value = 0.7
  const windGain = ctx.createGain()
  windGain.gain.value = WIND_GAIN
  wind.connect(windFilter)
  windFilter.connect(windGain)
  windGain.connect(duck)
  wind.start()

  // the filter breathes: 280–520 Hz over 11 s
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 1 / WIND_LFO_SECONDS
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = WIND_LFO_DEPTH
  lfo.connect(lfoGain)
  lfoGain.connect(windFilter.frequency)
  lfo.start()

  graph = { ctx, master, duck, windFilter, windGain, lfo, lfoGain, noise }
  return graph
}

function running(): boolean {
  return graph !== null && graph.ctx.state === 'running'
}

/** A short burst of the noise buffer through a filter and an envelope. */
function burst(g: Graph, opts: { filter: BiquadFilterType; hz: number; q?: number; peak: number; attack: number; decay: number }): void {
  const { ctx } = g
  const src = ctx.createBufferSource()
  src.buffer = g.noise
  src.loop = true
  src.loopStart = Math.random() * 1.5
  src.loopEnd = src.loopStart + 0.4
  const filter = ctx.createBiquadFilter()
  filter.type = opts.filter
  filter.frequency.value = opts.hz
  filter.Q.value = opts.q ?? 1
  const env = ctx.createGain()
  const now = ctx.currentTime
  env.gain.setValueAtTime(0, now)
  env.gain.linearRampToValueAtTime(opts.peak, now + opts.attack)
  env.gain.exponentialRampToValueAtTime(0.0005, now + opts.attack + opts.decay)
  src.connect(filter)
  filter.connect(env)
  env.connect(g.duck)
  src.start(now, src.loopStart)
  src.stop(now + opts.attack + opts.decay + 0.05)
}

function scheduleTick(): void {
  window.clearTimeout(tickTimer)
  tickTimer = 0
  if (!graph || underwater < 0.3 || state !== 'on') return
  const wait = 600 + Math.random() * 1200
  tickTimer = window.setTimeout(() => {
    if (graph && running() && underwater >= 0.3 && state === 'on' && !hidden) {
      burst(graph, { filter: 'highpass', hz: 2000, q: 0.8, peak: TICK_GAIN * (0.6 + Math.random() * 0.4), attack: 0.004, decay: 0.05 + Math.random() * 0.06 })
    }
    scheduleTick()
  }, wait)
}

async function unmute(): Promise<void> {
  if (reducedMotion()) return
  const g = build()
  if (!g) return
  try {
    if (g.ctx.state !== 'running') await g.ctx.resume()
  } catch {
    // the browser refused (no gesture yet): stay muted, the control reads "Sound"
  }
  if (g.ctx.state !== 'running') return
  ramp(g.master.gain, 1, FADE, g.ctx)
  ramp(g.windFilter.frequency, windFrequency(), FADE, g.ctx)
  setState('on')
  persist('on')
  scheduleTick()
}

function mute(): void {
  setState('off')
  persist('off')
  window.clearTimeout(tickTimer)
  tickTimer = 0
  const g = graph
  if (!g) return
  ramp(g.master.gain, 0, FADE, g.ctx)
  const ctx = g.ctx
  window.setTimeout(() => {
    if (state === 'off' && graph === g) void ctx.suspend().catch(() => undefined)
  }, FADE * 1000 + 50)
}

export function getSoundState(): SoundState {
  return state
}

export function onSoundChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The Sound control. Creates/resumes the AudioContext on this gesture. */
export async function toggleSound(): Promise<void> {
  if (state === 'on') mute()
  else await unmute()
}

/**
 * Call once at film mount. A stored "on" from a past visit still waits for the
 * first pointer or key gesture before the context is resumed. Returns detach.
 */
export function initSoundPreference(): () => void {
  if (typeof window === 'undefined' || stored() !== 'on' || reducedMotion()) return () => {}
  let done = false
  const onGesture = () => {
    if (done) return
    done = true
    detach()
    void unmute()
  }
  const detach = () => {
    window.removeEventListener('pointerdown', onGesture)
    window.removeEventListener('keydown', onGesture)
  }
  window.addEventListener('pointerdown', onGesture, { passive: true })
  window.addEventListener('keydown', onGesture)
  return detach
}

/** Duck to 30% while the contact dialog is open. */
export function duck(on: boolean): void {
  ducked = on
  if (!graph) return
  ramp(graph.duck.gain, ducked ? DUCK_LEVEL : 1, FADE, graph.ctx)
}

/** The opening impact. No-op unless the context is running. */
export function playDrop(): void {
  if (!graph || !running() || state !== 'on' || hidden) return
  const g = graph
  // the splash: 180 ms of noise around 900 Hz
  burst(g, { filter: 'bandpass', hz: 900, q: 1.2, peak: DROP_GAIN, attack: 0.008, decay: 0.18 })
  // the body: a 160 Hz sine decaying over 400 ms
  const { ctx } = g
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = 160
  const env = ctx.createGain()
  const now = ctx.currentTime
  env.gain.setValueAtTime(0, now)
  env.gain.linearRampToValueAtTime(DROP_GAIN * 0.8, now + 0.01)
  env.gain.exponentialRampToValueAtTime(0.0005, now + 0.4)
  osc.connect(env)
  env.connect(g.duck)
  osc.start(now)
  osc.stop(now + 0.45)
}

/** 0..1: lowpass the wind toward 180 Hz and add bubble ticks while underwater. */
export function setUnderwater(amount: number): void {
  const next = Math.min(Math.max(amount, 0), 1)
  if (Math.abs(next - underwater) < 0.005) return
  const wasTicking = underwater >= 0.3
  underwater = next
  if (graph && running()) {
    const { ctx } = graph
    const now = ctx.currentTime
    // a short time constant keeps the filter following the dissolve without zipper noise
    graph.windFilter.frequency.setTargetAtTime(windFrequency(), now, 0.12)
    graph.lfoGain.gain.setTargetAtTime(WIND_LFO_DEPTH * (1 - 0.7 * underwater), now, 0.12)
  }
  const ticking = underwater >= 0.3
  if (ticking !== wasTicking) scheduleTick()
}

/** Suspend/resume with page visibility. */
export function setHidden(next: boolean): void {
  hidden = next
  const g = graph
  if (!g) return
  if (hidden) {
    window.clearTimeout(tickTimer)
    tickTimer = 0
    void g.ctx.suspend().catch(() => undefined)
  } else if (state === 'on') {
    void g.ctx.resume().then(scheduleTick, () => undefined)
  }
}

export function disposeAudio(): void {
  window.clearTimeout(tickTimer)
  tickTimer = 0
  const g = graph
  graph = null
  if (!g) return
  try {
    g.lfo.stop()
  } catch {
    // already stopped
  }
  void g.ctx.close().catch(() => undefined)
}
