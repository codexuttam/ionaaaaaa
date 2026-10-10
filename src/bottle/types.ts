import type * as THREE from 'three'
import type { Tier } from '../experience/film'

// Contract for the IONA bottle. createIonaBottle() in createBottle.ts returns this.
// Units: world units. Group origin = body center. Base at y = -1.20, cap top at y = +1.38.

export type BottleAnchors = {
  /** cap top face center, group space (y ≈ 1.38) */
  capTop: THREE.Vector3
  /** cap body center, group space */
  capCenter: THREE.Vector3
  capRadius: number
  capTopRadius: number
  capHeight: number
  /** neck / lip */
  lipY: number
  shoulderY: number
  baseY: number
  /** widest outer radius of the glass */
  maxRadius: number
}

export type IonaBottle = {
  /** name: 'IONA_BOTTLE' */
  group: THREE.Group
  anchors: BottleAnchors
  /** Empty object parented at the cap top center; scene layers (droplets) parent here. */
  capSocket: THREE.Object3D
  /**
   * 0 = gone: the group is hidden so the transmission pass is skipped.
   * 0..1 = materials fade (opacity) with a slight sink into the fog.
   * 1 = fully present.
   */
  setFade(v: number): void
  /** Underwater caustic flicker on the glass, 0..1. */
  setCaustics(v: number): void
  /** Dark rim on the glass, 0..1 (the high-key alkaline beat, where the ground is white). */
  setEdgeInk(v: number): void
  /** Currents in the water inside, 0..1: the view through the bottle bends gently, as through moving water. */
  setInnerFlow(v: number): void
  /** Water on the glass, 0..1: condensation and drops running down it (0 = dry). */
  setWet(v: number): void
  /** The stream the bottle stands in: world y of its surface and 0..1 strength (0 = dry). */
  setWater(surfaceY: number, amount: number): void
  /** Multiplier on envMapIntensity of every bottle material (pale beats need more). */
  setEnvIntensity(mult: number): void
  /** Per-frame loops (caustics phase, any shader time). */
  update(elapsed: number, delta: number): void
  /** Re-draw the label and deboss canvases once fonts are ready. Idempotent. */
  refreshTextures(): void
  dispose(): void
}

export type CreateBottleOptions = {
  tier: Tier
}
