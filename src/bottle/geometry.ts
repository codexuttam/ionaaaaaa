import * as THREE from 'three'

// Procedural geometry for the IONA bottle, after the client's reference renders
// (a cut-crystal bottle, front and back design): ten long facets round the body,
// each band offset a little more than half a side from the one below so the facet
// lines run diagonally; a flat front window and a flat back window, cut as true
// planes, that carry the two labels; a crown of kite facets from the body up to a
// round collar; a short cut foot under a punted base; a round neck with a clear lip
// under a black cap. The facets are flat and polished, every real edge softened by a
// narrow bevel that catches the light (bevelFacets). Group origin = body centre;
// base at y = -1.20, cap top at y = +1.38.

export const BASE_Y = -1.2
/** Top of the cut foot: from here up the sides stand vertical. */
const FOOT_Y = -1.125
/** Top of the body: the crown starts here. */
export const SHOULDER_Y = 0.856
/** Middle ring of the crown, turned half a side. */
const CROWN_MID_Y = 1.02
/** Top of the crown: the collar the round neck rises from. */
const COLLAR_Y = 1.147
export const NECK_R = 0.208
/** The clear lip ring under the cap. */
export const LIP_Y = 1.18
const LIP_R = 0.234
export const CAP_BOTTOM_Y = 1.2135
export const CAP_TOP_Y = 1.38
export const CAP_R = 0.244
/** Radius of the flat top face, inside the rounded top edge. */
export const CAP_TOP_R = 0.212
/** Top of the straight band of the cap, where the rounded top edge starts. */
export const CAP_BAND_TOP_Y = 1.348
/** Front and back window planes (z = ±WINDOW_Z): the labels sit on them. */
export const WINDOW_Z = 0.376
/** Glass wall thickness used for the liquid. */
const WALL = 0.034
/** Fill line, in the neck under the lip: a sealed bottle is full. */
export const WATER_LINE_Y = 1.165

/** Long facets round the body. */
export const GEM_SIDES = 10
/** Offset of each band against the band below, in sides: 0.5 is a plain zigzag, the rest is the twist. */
const GEM_BAND_OFFSET = 0.62
/** Width of the soft bevel on every facet edge, world units at scale 1. */
const GEM_BEVEL = 0.009
/** Body rings [y, apothem], foot to shoulder: the sides stand vertical, the foot is cut in. */
const BODY_RINGS: readonly (readonly [number, number])[] = [
  [BASE_Y, 0.348],
  [FOOT_Y, 0.425],
  [-0.62, 0.436],
  [-0.12, 0.436],
  [0.38, 0.436],
  [SHOULDER_Y, 0.436],
]
/** Crown rings [y, apothem, extra turn in sides]: kites from the body's top ring to the collar. */
const CROWN_RINGS: readonly (readonly [number, number, number])[] = [
  [CROWN_MID_Y, 0.322, 0.5],
  [COLLAR_Y, NECK_R + 0.004, 0],
]

// ---------------------------------------------------------------------------
// Mesh helpers

type V3 = [number, number, number]

type MeshBuild = {
  positions: number[]
  normals: number[]
  /** rim ring at the bottom, ordered by angle, for closing the base */
  bottomRing: V3[]
  maxRadius: number
}

const emptyBuild = (): MeshBuild => ({ positions: [], normals: [], bottomRing: [], maxRadius: 0 })

function pushTri(out: MeshBuild, a: V3, b: V3, c: V3): void {
  const e1x = b[0] - a[0]
  const e1y = b[1] - a[1]
  const e1z = b[2] - a[2]
  const e2x = c[0] - a[0]
  const e2y = c[1] - a[1]
  const e2z = c[2] - a[2]
  let nx = e1y * e2z - e1z * e2y
  let ny = e1z * e2x - e1x * e2z
  let nz = e1x * e2y - e1y * e2x
  const l = Math.hypot(nx, ny, nz)
  if (l < 1e-9) return // degenerate (clamped) triangle
  nx /= l
  ny /= l
  nz /= l
  // orient outward: the facet normal must point away from the axis
  const cx = (a[0] + b[0] + c[0]) / 3
  const cz = (a[2] + b[2] + c[2]) / 3
  const flip = nx * cx + nz * cz < 0
  const tri = flip ? [a, c, b] : [a, b, c]
  if (flip) {
    nx = -nx
    ny = -ny
    nz = -nz
  }
  for (const p of tri) {
    out.positions.push(p[0], p[1], p[2])
    out.normals.push(nx, ny, nz)
  }
}

/** A fan closing the bottom ring, facing down. */
function pushBase(out: MeshBuild, ring: V3[], y: number): void {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    // (centre, b, a) winds clockwise seen from above: the face looks down
    for (const p of [[0, y, 0], [b[0], y, b[2]], [a[0], y, a[2]]] as V3[]) {
      out.positions.push(p[0], p[1], p[2])
      out.normals.push(0, -1, 0)
    }
  }
}

function toGeometry(b: MeshBuild): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3))
  return g
}

/** Merge geometries that carry position + normal only (indexed parts are expanded first). */
function mergeSimple(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  // the buffers are sized by the expanded count (a typed array silently drops writes past its end)
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p))
  let count = 0
  for (const p of flat) count += p.getAttribute('position').count
  const pos = new Float32Array(count * 3)
  const nor = new Float32Array(count * 3)
  let o = 0
  for (let k = 0; k < flat.length; k++) {
    const p = flat[k]
    const pa = p.getAttribute('position')
    const na = p.getAttribute('normal')
    for (let i = 0; i < pa.count; i++) {
      pos[(o + i) * 3] = pa.getX(i)
      pos[(o + i) * 3 + 1] = pa.getY(i)
      pos[(o + i) * 3 + 2] = pa.getZ(i)
      nor[(o + i) * 3] = na.getX(i)
      nor[(o + i) * 3 + 1] = na.getY(i)
      nor[(o + i) * 3 + 2] = na.getZ(i)
    }
    o += pa.count
    if (p !== parts[k]) p.dispose()
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  return g
}

// ---------------------------------------------------------------------------
// The cut

type RingPoint = { p: V3; a: number }

/** Triangulate the band between two rings: walk both rings by angle, always advancing the one whose next point comes first. */
function zipRings(out: MeshBuild, A: RingPoint[], B: RingPoint[], offsetA: number, offsetB: number, step: number): void {
  const n = A.length
  const at = (ring: RingPoint[], i: number): V3 => ring[((i % n) + n) % n].p
  let i = 0
  const j0 = Math.floor(offsetA - offsetB)
  let j = j0
  while (i < n || j < j0 + n) {
    const nextA = i < n ? (i + 1 + offsetA) * step : Number.POSITIVE_INFINITY
    const nextB = j < j0 + n ? (j + 1 + offsetB) * step : Number.POSITIVE_INFINITY
    if (nextA <= nextB) {
      pushTri(out, at(A, i), at(A, i + 1), at(B, j))
      i++
    } else {
      pushTri(out, at(A, i), at(B, j + 1), at(B, j))
      j++
    }
  }
}

/** A ring of GEM_SIDES points at height y, circumscribed about `apothem` (facet middles touch it), turned by `offset` sides. */
function ring(y: number, apothem: number, offset: number): RingPoint[] {
  const step = (Math.PI * 2) / GEM_SIDES
  const r = apothem / Math.cos(Math.PI / GEM_SIDES)
  return Array.from({ length: GEM_SIDES }, (_, i) => {
    const a = (i + offset) * step
    return { p: [r * Math.sin(a), y, r * Math.cos(a)] as V3, a }
  })
}

/** The cut glass, foot to collar: the body bands, then the crown. */
function buildGem(): MeshBuild {
  const out = emptyBuild()
  const step = (Math.PI * 2) / GEM_SIDES
  const offsets: number[] = BODY_RINGS.map((_, k) => k * GEM_BAND_OFFSET)
  const rings = BODY_RINGS.map(([y, ap], k) => ring(y, ap, offsets[k]))
  const top = offsets[offsets.length - 1]
  for (const [y, ap, turn] of CROWN_RINGS) {
    offsets.push(top + turn)
    rings.push(ring(y, ap, top + turn))
  }
  for (let k = 0; k < rings.length - 1; k++) zipRings(out, rings[k], rings[k + 1], offsets[k], offsets[k + 1], step)
  out.bottomRing = rings[0].map((q) => q.p).sort((a, b) => Math.atan2(a[0], a[2]) - Math.atan2(b[0], b[2]))
  return out
}

/**
 * Cut the glass with the window plane on one side (side = 1: the front, z = WINDOW_Z; -1: the back,
 * z = -WINDOW_Z) and keep what lies inside it. The crossing points are collected in `cut`: the outline
 * of that window's face.
 */
function clipToWindow(b: MeshBuild, side: 1 | -1, cut: [number, number][]): MeshBuild {
  const out: MeshBuild = { ...emptyBuild(), bottomRing: b.bottomRing }
  const zPlane = side * WINDOW_Z
  const emit = (p: V3, n: V3) => {
    out.positions.push(p[0], p[1], p[2])
    out.normals.push(n[0], n[1], n[2])
    out.maxRadius = Math.max(out.maxRadius, Math.hypot(p[0], p[2]))
  }
  const read = (arr: number[], i: number): V3 => [arr[i], arr[i + 1], arr[i + 2]]
  for (let t = 0; t < b.positions.length; t += 9) {
    const P = [read(b.positions, t), read(b.positions, t + 3), read(b.positions, t + 6)]
    const N = [read(b.normals, t), read(b.normals, t + 3), read(b.normals, t + 6)]
    const d = P.map((p) => side * (p[2] - zPlane))
    if (d.every((v) => v <= 1e-9)) {
      for (let k = 0; k < 3; k++) emit(P[k], N[k])
      continue
    }
    if (d.every((v) => v >= -1e-9)) continue
    const poly: { p: V3; n: V3 }[] = []
    for (let k = 0; k < 3; k++) {
      const k1 = (k + 1) % 3
      if (d[k] <= 0) poly.push({ p: P[k], n: N[k] })
      if (d[k] <= 0 !== d[k1] <= 0) {
        const s = d[k] / (d[k] - d[k1])
        const q: V3 = [P[k][0] + (P[k1][0] - P[k][0]) * s, P[k][1] + (P[k1][1] - P[k][1]) * s, zPlane]
        const m: V3 = [N[k][0] + (N[k1][0] - N[k][0]) * s, N[k][1] + (N[k1][1] - N[k][1]) * s, N[k][2] + (N[k1][2] - N[k][2]) * s]
        const l = Math.hypot(m[0], m[1], m[2]) || 1
        poly.push({ p: q, n: [m[0] / l, m[1] / l, m[2] / l] })
        cut.push([q[0], q[1]])
      }
    }
    for (let k = 1; k < poly.length - 1; k++) {
      emit(poly[0].p, poly[0].n)
      emit(poly[k].p, poly[k].n)
      emit(poly[k + 1].p, poly[k + 1].n)
    }
  }
  return out
}

/** Convex hull of the cut points, counter-clockwise seen from +z (monotone chain). */
function hull(cut: [number, number][]): [number, number][] {
  const pts = [...cut].sort((a, c) => a[0] - c[0] || a[1] - c[1])
  const cross = (o: [number, number], a: [number, number], c: [number, number]) => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0])
  const lower: [number, number][] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-12) lower.pop()
    lower.push(p)
  }
  const upper: [number, number][] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-12) upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

/** A window: one flat face over its outline, fanned from its centre, facing out of its side. */
function windowFace(outline: [number, number][], side: 1 | -1): MeshBuild {
  const out = emptyBuild()
  if (outline.length < 3) return out
  const z = side * WINDOW_Z
  const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length
  const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const c = outline[(i + 1) % outline.length]
    // the outline runs counter-clockwise seen from +z: the back face takes it the other way round
    const tri: number[] = side === 1 ? [cx, cy, z, a[0], a[1], z, c[0], c[1], z] : [cx, cy, z, c[0], c[1], z, a[0], a[1], z]
    out.positions.push(...tri)
    out.normals.push(0, 0, side, 0, 0, side, 0, 0, side)
  }
  return out
}

/**
 * Soften every edge of a flat-faceted mesh: each triangle keeps a flat inner copy (inset toward its incentre
 * by `width`) and gets a band to its outline whose normals run from the facet's own normal to the averaged
 * normal of every facet meeting at the corner, so a real edge turns into a narrow rounded bevel that catches
 * light. An edge between coplanar triangles (a facet split by the window cut, the window's own fan) is not
 * an edge of the glass: its band keeps the facet's normal, so the face stays one clean plane.
 */
function bevelFacets(b: MeshBuild, width: number): MeshBuild {
  const out: MeshBuild = { ...emptyBuild(), bottomRing: b.bottomRing, maxRadius: b.maxRadius }
  const key = (x: number, y: number, z: number) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`
  const ids = new Map<string, number>()
  const acc: number[] = []
  const idOf = (x: number, y: number, z: number): number => {
    const k = key(x, y, z)
    let id = ids.get(k)
    if (id === undefined) {
      id = ids.size
      ids.set(k, id)
      acc.push(0, 0, 0)
    }
    return id
  }
  type Tri = { P: V3[]; N: V3; id: number[] }
  const tris: Tri[] = []
  const edges = new Map<number, V3[]>()
  const edgeKey = (a: number, c: number) => (a < c ? a * 1e6 + c : c * 1e6 + a)
  for (let t = 0; t < b.positions.length; t += 9) {
    const P: V3[] = [0, 1, 2].map((k) => [b.positions[t + k * 3], b.positions[t + k * 3 + 1], b.positions[t + k * 3 + 2]] as V3)
    const N: V3 = [b.normals[t], b.normals[t + 1], b.normals[t + 2]]
    const id = P.map((p) => idOf(p[0], p[1], p[2]))
    tris.push({ P, N, id })
    for (let k = 0; k < 3; k++) {
      const e = edgeKey(id[k], id[(k + 1) % 3])
      const list = edges.get(e)
      if (list) list.push(N)
      else edges.set(e, [N])
    }
    // angle-weighted vertex normals: a facet split into several triangles weighs the same as an uncut one
    for (let k = 0; k < 3; k++) {
      const o = P[k]
      const u = P[(k + 1) % 3]
      const v = P[(k + 2) % 3]
      const ux = u[0] - o[0]
      const uy = u[1] - o[1]
      const uz = u[2] - o[2]
      const vx = v[0] - o[0]
      const vy = v[1] - o[1]
      const vz = v[2] - o[2]
      const lu = Math.hypot(ux, uy, uz)
      const lv = Math.hypot(vx, vy, vz)
      if (lu < 1e-12 || lv < 1e-12) continue
      const ang = Math.acos(Math.min(Math.max((ux * vx + uy * vy + uz * vz) / (lu * lv), -1), 1))
      acc[id[k] * 3] += N[0] * ang
      acc[id[k] * 3 + 1] += N[1] * ang
      acc[id[k] * 3 + 2] += N[2] * ang
    }
  }
  const vn = (id: number): V3 => {
    const x = acc[id * 3]
    const y = acc[id * 3 + 1]
    const z = acc[id * 3 + 2]
    const l = Math.hypot(x, y, z) || 1
    return [x / l, y / l, z / l]
  }
  /** an edge of the glass: a neighbour across it turns away, or there is none (the rim of the cut) */
  const realEdge = (a: number, c: number, N: V3): boolean => {
    const list = edges.get(edgeKey(a, c)) ?? []
    if (list.length < 2) return true
    return list.some((M) => M[0] * N[0] + M[1] * N[1] + M[2] * N[2] < 0.99999)
  }
  const emit = (p: V3, n: V3) => {
    out.positions.push(p[0], p[1], p[2])
    out.normals.push(n[0], n[1], n[2])
  }
  for (const { P, N, id } of tris) {
    const la = Math.hypot(P[1][0] - P[2][0], P[1][1] - P[2][1], P[1][2] - P[2][2])
    const lb = Math.hypot(P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2])
    const lc = Math.hypot(P[0][0] - P[1][0], P[0][1] - P[1][1], P[0][2] - P[1][2])
    const per = la + lb + lc
    if (per < 1e-9) continue
    const I: V3 = [
      (la * P[0][0] + lb * P[1][0] + lc * P[2][0]) / per,
      (la * P[0][1] + lb * P[1][1] + lc * P[2][1]) / per,
      (la * P[0][2] + lb * P[1][2] + lc * P[2][2]) / per,
    ]
    const e1: V3 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]]
    const e2: V3 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]]
    const area = 0.5 * Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
    const inradius = (2 * area) / per
    if (inradius < 1e-7) continue
    const s = Math.max(0.2, (inradius - width) / inradius)
    const Q: V3[] = P.map((p) => [I[0] + (p[0] - I[0]) * s, I[1] + (p[1] - I[1]) * s, I[2] + (p[2] - I[2]) * s] as V3)
    emit(Q[0], N)
    emit(Q[1], N)
    emit(Q[2], N)
    for (let k = 0; k < 3; k++) {
      const a = k
      const c = (k + 1) % 3
      const real = realEdge(id[a], id[c], N)
      const na = real ? vn(id[a]) : N
      const nc = real ? vn(id[c]) : N
      emit(P[a], na)
      emit(P[c], nc)
      emit(Q[c], N)
      emit(P[a], na)
      emit(Q[c], N)
      emit(Q[a], N)
    }
  }
  return out
}

/** Round neck from the collar: a small round lip over the facets' last ring, the neck, the clear lip ring, the mouth under the cap. */
function neckGeometry(segments: number): THREE.BufferGeometry {
  const collar = (NECK_R + 0.004) / Math.cos(Math.PI / GEM_SIDES) + 0.003
  const pts: [number, number][] = [
    [collar, COLLAR_Y - 0.004],
    [collar, COLLAR_Y + 0.002],
    [NECK_R + 0.004, COLLAR_Y + 0.008],
    [NECK_R, COLLAR_Y + 0.014],
    [NECK_R, LIP_Y - 0.012],
    [LIP_R - 0.004, LIP_Y - 0.008],
    [LIP_R, LIP_Y - 0.002],
    [LIP_R, LIP_Y + 0.018],
    [LIP_R - 0.006, LIP_Y + 0.024],
    [0.2, CAP_BOTTOM_Y + 0.004],
    [0.2, CAP_BOTTOM_Y + 0.03],
    [0.17, CAP_BOTTOM_Y + 0.03],
  ]
  return new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
    Math.PI,
    Math.PI * 2,
  )
}

/** One window's outline: the hull of its cut, for the label that covers it. */
export type WindowOutline = [number, number][]

export type GlassParts = {
  glass: THREE.BufferGeometry
  /** widest outer radius of the cut */
  maxRadius: number
  /** the outlines of the front and back windows, in (x, y) on their planes */
  front: WindowOutline
  back: WindowOutline
}

export function buildGlass(segments: number): GlassParts {
  const gem = buildGem()
  pushBase(gem, gem.bottomRing, BASE_Y)
  const frontCut: [number, number][] = []
  const backCut: [number, number][] = []
  const cutFront = clipToWindow(gem, 1, frontCut)
  const cut = clipToWindow(cutFront, -1, backCut)
  const front = hull(frontCut)
  const back = hull(backCut)
  const faces = [windowFace(front, 1), windowFace(back, -1)]
  const soft = bevelFacets(
    {
      ...cut,
      positions: cut.positions.concat(...faces.map((f) => f.positions)),
      normals: cut.normals.concat(...faces.map((f) => f.normals)),
    },
    GEM_BEVEL,
  )
  const parts = [toGeometry(soft), neckGeometry(segments)]
  const glass = mergeSimple(parts)
  for (const p of parts) p.dispose()
  glass.computeBoundingSphere()
  return { glass, maxRadius: cut.maxRadius, front, back }
}

// ---------------------------------------------------------------------------
// Labels: one flat print over each window, just in front of it, inset so the window's bevel still shines
// round it. UVs map the outline's bounds; the back label is mirrored so it reads from behind.

export type LabelBounds = { x0: number; x1: number; y0: number; y1: number }

export function labelBounds(outline: WindowOutline, inset: number): LabelBounds {
  const xs = outline.map((p) => p[0])
  const ys = outline.map((p) => p[1])
  return { x0: Math.min(...xs) + inset, x1: Math.max(...xs) - inset, y0: Math.min(...ys) + inset, y1: Math.max(...ys) - inset }
}

/** The outline moved inward by `d` along its edge normals (convex, counter-clockwise). */
function insetOutline(outline: WindowOutline, d: number): WindowOutline {
  const n = outline.length
  const edgeNormal = (i: number): [number, number] => {
    const a = outline[i]
    const b = outline[(i + 1) % n]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const l = Math.hypot(dx, dy) || 1
    // counter-clockwise: the inside is to the left
    return [-dy / l, dx / l]
  }
  return outline.map((p, i) => {
    const n0 = edgeNormal((i - 1 + n) % n)
    const n1 = edgeNormal(i)
    const mx = n0[0] + n1[0]
    const my = n0[1] + n1[1]
    const dot = 1 + n0[0] * n1[0] + n0[1] * n1[1]
    const k = dot > 0.2 ? d / dot : d / 0.2
    return [p[0] + mx * k, p[1] + my * k]
  })
}

export function buildLabel(outline: WindowOutline, side: 1 | -1, inset: number): { geometry: THREE.BufferGeometry; bounds: LabelBounds } {
  const poly = insetOutline(outline, inset)
  const bounds = labelBounds(poly, 0)
  const z = side * (WINDOW_Z + 0.0025)
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length
  const pos: number[] = []
  const uv: number[] = []
  const nor: number[] = []
  const w = bounds.x1 - bounds.x0
  const h = bounds.y1 - bounds.y0
  const put = (x: number, y: number) => {
    pos.push(x, y, z)
    // the back label reads from behind: its u runs the other way
    uv.push(side === 1 ? (x - bounds.x0) / w : (bounds.x1 - x) / w, (y - bounds.y0) / h)
    nor.push(0, 0, side)
  }
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const c = poly[(i + 1) % poly.length]
    put(cx, cy)
    if (side === 1) {
      put(a[0], a[1])
      put(c[0], c[1])
    } else {
      put(c[0], c[1])
      put(a[0], a[1])
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.computeBoundingSphere()
  return { geometry, bounds }
}

// ---------------------------------------------------------------------------
// Liquid: a smooth surface of revolution one wall in from the cut, flattened at both windows, filled into the neck.

/** Inner radius of the water [y, r], base to the fill line. */
const LIQUID_PROFILE: readonly (readonly [number, number])[] = [
  [BASE_Y + 0.05, 0.3],
  [FOOT_Y + 0.02, 0.385],
  [SHOULDER_Y - 0.02, 0.396],
  [CROWN_MID_Y, 0.282],
  [COLLAR_Y, NECK_R - WALL + 0.012],
  [WATER_LINE_Y, NECK_R - WALL + 0.012],
]

function liquidR(y: number): number {
  const p = LIQUID_PROFILE
  if (y <= p[0][0]) return p[0][1]
  for (let i = 1; i < p.length; i++) {
    if (y <= p[i][0]) return p[i - 1][1] + ((p[i][1] - p[i - 1][1]) * (y - p[i - 1][0])) / (p[i][0] - p[i - 1][0])
  }
  return p[p.length - 1][1]
}

/** Heights from y0 to y1, at most `step` apart. */
function heights(y0: number, y1: number, step: number): number[] {
  const n = Math.max(1, Math.ceil((y1 - y0) / step))
  return Array.from({ length: n + 1 }, (_, j) => y0 + ((y1 - y0) * j) / n)
}

/** radius(y) at the given heights, flattened onto z = ±zFlat. Indexed, with averaged normals. */
function revolve(radius: (y: number) => number, ys: readonly number[], cols: number, zFlat: number): THREE.BufferGeometry {
  const pos: number[] = []
  for (const y of ys) {
    const r = radius(y)
    for (let i = 0; i < cols; i++) {
      const a = (i / cols) * Math.PI * 2
      pos.push(r * Math.sin(a), y, Math.max(Math.min(r * Math.cos(a), zFlat), -zFlat))
    }
  }
  const index: number[] = []
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * cols + i
      const b = j * cols + ((i + 1) % cols)
      index.push(a, b, a + cols, b, b + cols, a + cols)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

/** A flat disc of radius r at height y facing up or down, flattened like the part it closes. */
function flatDisc(r: number, y: number, up: boolean, cols: number, zFlat: number): THREE.BufferGeometry {
  const b = emptyBuild()
  const at = (i: number): V3 => {
    const a = (i / cols) * Math.PI * 2
    return [r * Math.sin(a), y, Math.max(Math.min(r * Math.cos(a), zFlat), -zFlat)]
  }
  for (let i = 0; i < cols; i++) {
    const tri: V3[] = up ? [[0, y, 0], at(i), at(i + 1)] : [[0, y, 0], at(i + 1), at(i)]
    for (const p of tri) {
      b.positions.push(p[0], p[1], p[2])
      b.normals.push(0, up ? 1 : -1, 0)
    }
  }
  return toGeometry(b)
}

const LIQUID_COLS = 64

export function buildLiquid(): THREE.BufferGeometry {
  const zFlat = WINDOW_Z - WALL
  const y0 = LIQUID_PROFILE[0][0]
  const parts = [
    revolve(liquidR, heights(y0, WATER_LINE_Y, 0.02), LIQUID_COLS, zFlat),
    flatDisc(liquidR(WATER_LINE_Y), WATER_LINE_Y, true, LIQUID_COLS, zFlat),
    flatDisc(liquidR(y0), y0, false, LIQUID_COLS, zFlat),
  ]
  const g = mergeSimple(parts)
  for (const p of parts) p.dispose()
  g.computeBoundingSphere()
  return g
}

/** The water line: a thin band hugging the inside of the neck just under the surface. */
export function buildMeniscus(): THREE.BufferGeometry {
  const g = revolve((y) => liquidR(y) - 0.003, [WATER_LINE_Y - 0.008, WATER_LINE_Y], LIQUID_COLS, WINDOW_Z - WALL - 0.003)
  const flat = g.toNonIndexed()
  g.dispose()
  flat.computeBoundingSphere()
  return flat
}

// ---------------------------------------------------------------------------
// Cap: round, never faceted. Side band with lathe UVs (u = 0.5 faces front),
// rounded top edge, top disc with planar UVs for the deboss.

const lathe = (pts: readonly (readonly [number, number])[], segments: number): THREE.LatheGeometry =>
  new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
    Math.PI,
    Math.PI * 2,
  )

export function buildCapBody(segments: number): THREE.BufferGeometry {
  return lathe(
    [
      [0.2, CAP_BOTTOM_Y + 0.004],
      [CAP_R - 0.006, CAP_BOTTOM_Y],
      [CAP_R - 0.001, CAP_BOTTOM_Y + 0.003],
      [CAP_R, CAP_BOTTOM_Y + 0.008],
      [CAP_R, CAP_BAND_TOP_Y],
    ],
    segments,
  )
}

/** Top: the rounded edge (lathe) plus a flat face with planar UVs. */
export function buildCapTop(segments: number): { rim: THREE.BufferGeometry; face: THREE.BufferGeometry } {
  const f = CAP_TOP_Y - CAP_BAND_TOP_Y // fillet radius: the band top to the face
  const pts: [number, number][] = []
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2)
    pts.push([CAP_R - f + Math.cos(a) * f, CAP_BAND_TOP_Y + Math.sin(a) * f])
  }
  pts.push([CAP_TOP_R, CAP_TOP_Y])
  const rim = lathe(pts, segments)
  const face = new THREE.CircleGeometry(CAP_TOP_R, segments)
  face.rotateX(-Math.PI / 2)
  face.translate(0, CAP_TOP_Y, 0)
  // planar UVs: u along +x, v along -z (so the word reads from the front)
  const p = face.getAttribute('position')
  const uv = face.getAttribute('uv')
  const D = CAP_TOP_R * 2
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / D, 0.5 - p.getZ(i) / D)
  uv.needsUpdate = true
  return { rim, face }
}
