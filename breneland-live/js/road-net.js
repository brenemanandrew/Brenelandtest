// The town's paving as one signed distance field: negative on the tar, 0..KERB_W on the kerb top,
// KERB_W..SIDEWALK_W on the sidewalk, more than SIDEWALK_W off it. world-town.js cuts its road, kerb and sidewalk
// meshes out of this field, terrain.js flattens the ground with it and stands people on it, mailman-route.js
// (streetY) and cars.js ask it what is tar. Because every surface comes from the same field, roads can never overlap,
// a sidewalk can never cross a carriageway, kerbs run unbroken round every corner, and the ground agrees with the
// geometry.
//
//   * Roads are joined with a smooth minimum (FILLET): the kerb and the sidewalk's back edge turn each corner in one
//     rounded sweep.
//   * A road that ends inside another road (a T junction) is cut flat at the other road's centre line (`join`).
//   * A road that ends anywhere else (the lake, the map edge) is cut off square (`edge`): nothing is paved past it.
//
// Plain data and maths only (layout.js is its one import), so tests can load it too.
import { ROADS, SIDEWALK_W, PARK_LOT, BUS_STOP, MAIL_OFFICE, VAN_STOP, CRIB_PAD } from './layout.js';

export const KERB_W = 0.18;      // the kerb's top, inside SIDEWALK_W (the sidewalk is flush with it)
export const TAR_Y = 0.375;      // the carriageway's top
export const WALK_Y = 0.44;      // kerb top and sidewalk (flush)
export const FILLET = 5;         // smooth-min reach where two roads meet (the corner kerb's radius is roughly 0.6 of it)

// The centre line with every corner rounded by a circular arc (tangent to both legs, radius up to BEND_R, never using more than
// half of either leg), so straights stay dead straight and bends are true arcs. (A uniform Catmull-Rom overshoots by metres
// where a short bend sits next to a long straight, throwing the tar and sidewalks out sideways.)
const BEND_R = 30;
function smooth(pts) {
  if (pts.length < 3) return pts.map(p => p.slice());
  const out = [pts[0].slice()];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], p = pts[i], c = pts[i + 1];
    const L0 = Math.hypot(p[0] - a[0], p[1] - a[1]), L1 = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const u0 = [(p[0] - a[0]) / L0, (p[1] - a[1]) / L0], u1 = [(c[0] - p[0]) / L1, (c[1] - p[1]) / L1];
    const turn = Math.atan2(u0[0] * u1[1] - u0[1] * u1[0], u0[0] * u1[0] + u0[1] * u1[1]); // signed
    if (Math.abs(turn) < 0.01) { out.push(p.slice()); continue; }
    const T = Math.min(BEND_R * Math.tan(Math.abs(turn) / 2), L0 / 2, L1 / 2), r = T / Math.tan(Math.abs(turn) / 2);
    const s0 = [p[0] - u0[0] * T, p[1] - u0[1] * T];
    const side = Math.sign(turn), nx = -u0[1] * side, nz = u0[0] * side; // toward the arc's centre
    const cx = s0[0] + nx * r, cz = s0[1] + nz * r, a0 = Math.atan2(s0[1] - cz, s0[0] - cx);
    const steps = Math.max(2, Math.ceil(r * Math.abs(turn) / 1.0));
    for (let k = 0; k <= steps; k++) {
      const ang = a0 + turn * (k / steps);
      out.push([cx + Math.cos(ang) * r, cz + Math.sin(ang) * r]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return simplify(out, 0.005);
}
// Ramer-Douglas-Peucker: drop the points that sit within eps of a straight run (the long straights become one segment).
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, az] = pts[0], [bx, bz] = pts[pts.length - 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
  let worst = -1, wi = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L;
    if (d > worst) { worst = d; wi = i; }
  }
  if (worst <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, wi + 1), eps).slice(0, -1), ...simplify(pts.slice(wi), eps)];
}

// Distance from (x, z) to a centre line given as raw points (no smoothing), for finding where ends land.
function rawDist(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    let t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

// Every road: its smoothed centre line as flat segments (ax, az, dx, dz, len2), a bounding box, and its two ends.
// end: { kind: 'join' | 'edge', x, z, ux, uz (pointing out of the road, along it), into (the road it joins) }
function netOf(r) {
  const path = smooth(r.pts);
  const segs = new Float64Array((path.length - 1) * 5);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    segs.set([ax, az, bx - ax, bz - az, (bx - ax) ** 2 + (bz - az) ** 2], i * 5);
  }
  for (const [x, z] of path) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const ends = [0, path.length - 1].map(i => {
    const p = path[i], q = path[i === 0 ? 1 : i - 1];
    let ux = p[0] - q[0], uz = p[1] - q[1]; const L = Math.hypot(ux, uz) || 1; ux /= L; uz /= L;
    const into = ROADS.find(o => o !== r && rawDist(o.pts, p[0], p[1]) < o.width / 2 - 0.5);
    return { kind: into ? 'join' : 'edge', x: p[0], z: p[1], ux, uz, into: into ? into.id : null };
  });
  return { id: r.id, name: r.name, hw: r.width / 2, path, segs, ends, minX, maxX, minZ, maxZ, road: r };
}
export const NET = [];
// The whole paved area's box (+ the sidewalks): a quick "nowhere near a road" test.
export const PAVED_BOX = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
// Square ends (`edge`): past the end line, within the road's paved width (and a margin), nothing is paved.
export const HARD_ENDS = [];
export const CUTS = [];
// Driveway aprons: a driveway's tar runs from inside the road across the sidewalk (a dropped kerb, with kerb
// returns rounded by a small fillet) and is cut off square at the sidewalk's back edge, where the lot's own pad takes over.
// The field inside the paving is smin(road, apron box); past the cut line nothing of the apron (or its would-be sidewalk) is
// paved. APRON_CUTS work like HARD_ENDS (same exact clipping in world-town.js) but are not road ends.
const APRON_K = 2;               // the kerb returns' fillet
export const APRONS = [];
export const APRON_CUTS = [];
if (PARK_LOT && PARK_LOT.drive) {
  const d = PARK_LOT.drive, cx = (d.minX + d.maxX) / 2, hw = (d.maxX - d.minX) / 2;
  // a box in world axes: x within cx +- hw, z from minZ (inside the road) to well past the cut (the lot side)
  APRONS.push({ cx, hw, z0: d.minZ, z1: d.cutZ + 6 });
  APRON_CUTS.push({ road: PARK_LOT.road, apron: true, x: cx, z: d.cutZ, ux: 0, uz: 1, lat: hw + SIDEWALK_W + 4, depth: 13 });
}
// the post office's bay: the same kind of apron off Summit Rd's north side, running north (the cut faces -z)
if (MAIL_OFFICE && MAIL_OFFICE.drive) {
  const d = MAIL_OFFICE.drive, cx = (d.minX + d.maxX) / 2, hw = (d.maxX - d.minX) / 2;
  APRONS.push({ cx, hw, z0: d.cutZ - 6, z1: d.roadZ });
  APRON_CUTS.push({ road: 'summit-rd', apron: true, x: cx, z: d.cutZ, ux: 0, uz: -1, lat: hw + SIDEWALK_W + 4, depth: 13 });
}
// Kevin's motorcycle pad beside the Tool Crib (crib-move): the same, off Summit Rd's north side
if (CRIB_PAD && CRIB_PAD.drive) {
  const d = CRIB_PAD.drive, cx = (d.minX + d.maxX) / 2, hw = (d.maxX - d.minX) / 2;
  APRONS.push({ cx, hw, z0: d.cutZ - 6, z1: d.roadZ });
  APRON_CUTS.push({ road: 'summit-rd', apron: true, x: cx, z: d.cutZ, ux: 0, uz: -1, lat: hw + SIDEWALK_W + 4, depth: 13 });
}
/**
 * (Re)build the network from ROADS, in place: the exported arrays and box keep their identity, so a module that imported
 * them sees the new roads. world-edits.js calls this after it has pushed the editor's roads into ROADS (before the town is
 * built); nothing reads NET at import time.
 */
export function rebuildNet() {
  NET.length = 0; for (const r of ROADS) NET.push(netOf(r));
  Object.assign(PAVED_BOX, NET.reduce((b, n) => ({
    minX: Math.min(b.minX, n.minX - n.hw - SIDEWALK_W - 1), maxX: Math.max(b.maxX, n.maxX + n.hw + SIDEWALK_W + 1),
    minZ: Math.min(b.minZ, n.minZ - n.hw - SIDEWALK_W - 1), maxZ: Math.max(b.maxZ, n.maxZ + n.hw + SIDEWALK_W + 1),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }));
  HARD_ENDS.length = 0;
  for (const n of NET) for (const e of n.ends) if (e.kind === 'edge') HARD_ENDS.push({ road: n.id, x: e.x, z: e.z, ux: e.ux, uz: e.uz, lat: n.hw + SIDEWALK_W + 3, depth: 12 });
  CUTS.length = 0; CUTS.push(...HARD_ENDS, ...APRON_CUTS);
}
rebuildNet();
function apronField(x, z) {
  let g = 99;
  for (let i = 0; i < APRONS.length; i++) {
    const a = APRONS[i], zc = (a.z0 + a.z1) / 2, hz = (a.z1 - a.z0) / 2;
    const qx = Math.abs(x - a.cx) - a.hw, qz = Math.abs(z - zc) - hz;
    const ox = qx > 0 ? qx : 0, oz = qz > 0 ? qz : 0;
    const d = Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(qx, qz), 0);
    if (d < g) g = d;
  }
  return g;
}
// Lay-bys: a convex outline of tar that overlaps a road (the bus bay and the mail van's stop off Breneland Rd), joined to it
// with a fillet (BAY_K) so its tapers meet the kerb in a smooth sweep; the kerb and the sidewalk run round behind it like any other edge.
const BAY_K = 2.5;
export const BAYS = [];
if (BUS_STOP && BUS_STOP.bay) BAYS.push(BUS_STOP.bay.map(p => p.slice()));
if (VAN_STOP && VAN_STOP.bay) BAYS.push(VAN_STOP.bay.map(p => p.slice()));
// exact signed distance to a convex polygon (negative inside)
function bayField(x, z) {
  let g = 99;
  for (let b = 0; b < BAYS.length; b++) {
    const P = BAYS[b], n = P.length;
    let inside = true, best = Infinity;
    for (let i = 0; i < n; i++) {
      const p = P[i], q = P[(i + 1) % n], ax = p[0], az = p[1], dx = q[0] - ax, dz = q[1] - az, L2 = dx * dx + dz * dz;   // (no destructuring: hot)
      if ((x - ax) * dz - (z - az) * dx < 0) inside = false;   // (the outline runs clockwise seen from above: +z south)
      let t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - ax - dx * t, ez = z - az - dz * t, d2 = ex * ex + ez * ez;
      if (d2 < best) best = d2;
    }
    const d = Math.sqrt(best) * (inside ? -1 : 1);
    if (d < g) g = d;
  }
  return g;
}
// Is (x, z) in a lay-by's outline (pad: metres round it)? (tests skip its mouth: its tar runs where the sidewalk was, on purpose)
export function inBay(x, z, pad = 0) { return BAYS.length > 0 && bayField(x, z) < pad; }
// Is (x, z) past a square end or an apron's cut? (along > 0 means beyond the line)
export function pastEnd(x, z) {
  for (let i = 0; i < CUTS.length; i++) {
    const e = CUTS[i], rx = x - e.x, rz = z - e.z, along = rx * e.ux + rz * e.uz;
    if (along > 0 && along < e.depth && Math.abs(rx * -e.uz + rz * e.ux) < e.lat) return true;
  }
  return false;
}

// One road's own field: distance to its centre line minus the half width, cut flat at its `join` ends.
export function roadField(n, x, z) {
  const S = n.segs;
  let best = Infinity;
  for (let k = 0; k < S.length; k += 5) {
    const ax = S[k], az = S[k + 1], dx = S[k + 2], dz = S[k + 3];
    let t = ((x - ax) * dx + (z - az) * dz) / S[k + 4];
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - ax - dx * t, ez = z - az - dz * t, d2 = ex * ex + ez * ez;
    if (d2 < best) best = d2;
  }
  let f = Math.sqrt(best) - n.hw;
  for (let i = 0; i < 2; i++) {
    const e = n.ends[i];
    if (e.kind !== 'join') continue;
    const s = (x - e.x) * e.ux + (z - e.z) * e.uz; // past the other road's centre line
    if (s > f) f = s;
  }
  return f;
}
function boxDist(n, x, z) { return Math.max(n.minX - x, x - n.maxX, n.minZ - z, z - n.maxZ, 0); }

// The field without the square ends (world-town.js cuts those exactly; everyone else should call paveField).
export function paveFieldRaw(x, z) {
  let f = Infinity;
  for (let i = 0; i < NET.length; i++) {
    const n = NET[i];
    const lower = boxDist(n, x, z) - n.hw; // the road's field is at least this
    if (lower > f + FILLET || lower > 40) continue;
    const g = roadField(n, x, z);
    const h = Math.max(FILLET - Math.abs(f - g), 0) / FILLET; // smooth minimum: rounds the corners where roads meet
    f = Math.min(f, g) - h * h * FILLET * 0.25;
  }
  if (APRONS.length && f < 40) { // a driveway apron: joined to the road with a small fillet (rounded kerb returns)
    const g = apronField(x, z);
    if (g < f + APRON_K) { const h = Math.max(APRON_K - Math.abs(f - g), 0) / APRON_K; f = Math.min(f, g) - h * h * APRON_K * 0.25; }
  }
  if (BAYS.length && f < 40) { // a lay-by: its outline joined to the road with a fillet
    const g = bayField(x, z);
    if (g < f + BAY_K) { const h = Math.max(BAY_K - Math.abs(f - g), 0) / BAY_K; f = Math.min(f, g) - h * h * BAY_K * 0.25; }
  }
  return f === Infinity ? 99 : Math.min(f, 99);
}
// < 0 on the tar, 0..SIDEWALK_W on kerb and sidewalk, 99 past a square end. (terrain.js exports it as roadEdgeDist.)
export function paveField(x, z) {
  if (x < PAVED_BOX.minX - 40 || x > PAVED_BOX.maxX + 40 || z < PAVED_BOX.minZ - 40 || z > PAVED_BOX.maxZ + 40) return 99;
  if (pastEnd(x, z)) return 99;
  return paveFieldRaw(x, z);
}
// The paved surface's height at (x, z), or null off the paving.
export function pavedY(x, z) {
  if (x < PAVED_BOX.minX || x > PAVED_BOX.maxX || z < PAVED_BOX.minZ || z > PAVED_BOX.maxZ) return null;
  const f = paveField(x, z);
  return f < 0 ? TAR_Y : f <= SIDEWALK_W ? WALK_Y : null;
}
// Which band: 'tar' | 'kerb' | 'walk' | null.
export function pavedBand(x, z) {
  const f = paveField(x, z);
  return f < 0 ? 'tar' : f < KERB_W ? 'kerb' : f <= SIDEWALK_W ? 'walk' : null;
}
// The other roads' field at (x, z) (the junction test for lane lines and lamps).
export function othersField(n, x, z) {
  let f = 99;
  for (const o of NET) if (o !== n) f = Math.min(f, roadField(o, x, z));
  return f;
}
