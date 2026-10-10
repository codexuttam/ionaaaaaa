import type { Tier } from './film'

// Quality tiers (docs/09 + docs/10). The tier is chosen once at load.
// At runtime only the DPR adapts (see AdaptiveDpr in Experience.tsx).

export type TierSettings = {
  dprCap: number
  /** lowest DPR the runtime monitor may fall back to (never under the device's own: min(native, floor)) */
  dprFloor: number
  antialias: boolean
  composer: 'full' | 'basic' | 'none'
  /** particle budget multiplier against the "high" counts in docs/07 */
  particles: number
  /** plate blur taps; 0 = blur off (fade opacity instead) */
  blurTaps: 0 | 5 | 9
  /** chromatic fringe allowed */
  aberration: boolean
  /** planar reflection under the pack */
  planarReflection: boolean
  /** bottle facet sides / transmission settings (see bottle/createBottle.ts) */
  bottleSides: 8 | 10
  capDroplets: number
  /**
   * Resolution of three's transmission buffer (the scene rendered once more behind the glass, plus
   * its mip chain, every frame). It is the single largest cost of a bottle beat: 1.0 halves the
   * frame rate of an integrated GPU against 0.5, and at roughness 0.045 the refraction reads the
   * same. The runtime monitor may step down to the floor.
   */
  transmissionScale: number
  transmissionFloor: number
}

export const TIERS: Readonly<Record<Tier, TierSettings>> = {
  high: {
    dprCap: 1.75,
    dprFloor: 1,
    antialias: true,
    composer: 'full',
    particles: 1,
    blurTaps: 9,
    aberration: true,
    planarReflection: true,
    bottleSides: 10,
    capDroplets: 12,
    transmissionScale: 0.75,
    transmissionFloor: 0.5,
  },
  med: {
    // tablets at 2x get 1.5; laptops at 1x never drop below their native resolution (the glass blurred at 0.9)
    dprCap: 1.5,
    dprFloor: 1,
    antialias: true,
    composer: 'basic',
    particles: 0.5,
    blurTaps: 5,
    aberration: true,
    planarReflection: false,
    bottleSides: 10,
    capDroplets: 8,
    transmissionScale: 0.5,
    transmissionFloor: 0.35,
  },
  low: {
    // Every phone lands here (max-width 759px). Phones are 2x-3x screens: at the old cap of 1 (and a floor of
    // 0.75) the canvas was a quarter of the screen resolution, and the faceted glass and the label went soft
    // and jagged next to razor-sharp text. 2x is sharp at arm's length; under load the governor lowers the
    // glass refraction before it ever goes under 1.5. MSAA is close to free on tile-based mobile GPUs.
    dprCap: 2,
    dprFloor: 1.5,
    antialias: true,
    composer: 'none',
    particles: 0.22,
    blurTaps: 0,
    aberration: false,
    planarReflection: false,
    bottleSides: 8,
    capDroplets: 4,
    transmissionScale: 0.6,
    transmissionFloor: 0.5,
  },
}

/** Particle count for a tier: `high` and `low` come straight from docs/07; `med` sits between. */
export function count(high: number, low: number, tier: Tier): number {
  if (tier === 'high') return high
  if (tier === 'low') return low
  return Math.round((high + low) / 2)
}

type NavigatorExtras = Navigator & {
  deviceMemory?: number
  connection?: { saveData?: boolean }
}

type GpuProbe = { webgl: boolean; renderer: string }
let probe: GpuProbe | null = null

/**
 * One throwaway WebGL context answers both startup questions (is WebGL there, which GPU): each
 * context costs 100-200 ms on ANGLE, and main.tsx used to make two.
 */
export function gpuProbe(): GpuProbe {
  if (probe) return probe
  probe = { webgl: false, renderer: '' }
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (gl) {
      const info = gl.getExtension('WEBGL_debug_renderer_info')
      probe = { webgl: true, renderer: info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '' }
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  } catch {
    probe = { webgl: false, renderer: '' }
  }
  return probe
}

/** True for GPUs that cannot hold 60 fps at full quality: integrated and software renderers (the strings
 *  Chrome exposes through WEBGL_debug_renderer_info). Apple and discrete GPUs stay on the high tier. */
function integratedGpu(): boolean {
  const p = gpuProbe()
  if (!p.webgl) return true
  return /\b(Intel|Iris|UHD|Radeon\(TM\) Graphics|Vega|SwiftShader|llvmpipe|Mesa|Mali|Adreno|PowerVR)\b/i.test(p.renderer)
}

export function detectTier(search: string = typeof location === 'undefined' ? '' : location.search): Tier {
  const forced = new URLSearchParams(search).get('quality')
  if (forced === 'high' || forced === 'med' || forced === 'low') return forced
  if (typeof window === 'undefined') return 'med'
  const nav = navigator as NavigatorExtras
  const cores = nav.hardwareConcurrency ?? 4
  const saveData = nav.connection?.saveData === true
  const mem = nav.deviceMemory
  const small = window.matchMedia('(max-width: 759px)').matches
  if (small || cores <= 4 || saveData || (mem !== undefined && mem <= 4)) return 'low'
  if (window.innerWidth >= 1200 && cores >= 8 && !saveData && !integratedGpu()) return 'high'
  return 'med'
}
