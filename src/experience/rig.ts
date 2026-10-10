// The scroll pose. The master timeline (timeline.ts) owns every value here and
// writes it as the playhead moves. The frame loop reads it, adds the damped
// pointer offset and loops on top, and writes the sum into the Three objects.
// Nothing else writes to the rig. That is how the timeline and the pointer
// never fight over the same property.

export type CameraPose = {
  x: number
  y: number
  z: number
  /** look-at target */
  tx: number
  ty: number
  tz: number
  fov: number
}

export type BottlePose = {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
  /** uniform scale, 0.85..1.35 */
  s: number
  /** 0 = gone (group hidden, no transmission pass), 1 = fully present */
  fade: number
  /** 0..1 amplitude multiplier of the idle float sine (hero 0.03 @ 5.5s, tomorrow 0.04) */
  float: number
}

export type LightPose = {
  /** glint spot loop strength 0..1 (hero = 1 with peak 8; other beats ≤ 0.5) */
  glint: number
  /** scrubbed spot sweeping the cap top in the cap beat, 0..1 position, -1 = off */
  capSweep: number
  /** scrubbed light sweep across the carton front in the pack beat, 0..1 position, -1 = off */
  cartonSweep: number
}

export const rig = {
  camera: { x: 0, y: 0.4, z: 4.2, tx: 0, ty: 0.1, tz: 0, fov: 28 } as CameraPose,
  bottle: { x: 1.15, y: -0.35, z: 0, rx: 0.02, ry: 0.12, rz: 0, s: 1, fade: 0, float: 0 } as BottlePose,
  light: { glint: 0, capSweep: -1, cartonSweep: -1 } as LightPose,
}

export type Rig = typeof rig
