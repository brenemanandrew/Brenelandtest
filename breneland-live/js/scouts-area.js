// The cub scouts' patch of Strickler woods: Andrew's green doodle (layout.js SCOUT_WOODS) where they hide, and one lead-in path
// from the loop toward the camp: from the loop's point nearest the camp straight in toward the fire, ending at the camp itself
// (the fire, its benches and Gene, CAMP_R). No ring round the camp, no tent trail. A found scout runs home along the loop and the
// lead-in and never leaves them. Pure functions of the layout (read when called, so a World Editor move of the camp is followed).
//   inScoutWoods(x, z)          inside the doodle (where they may hide)
//   inScoutArea(x, z)           the doodle, the lead-in or the camp itself (where a scout may ever be)
//   scoutRoute(x, z, tx, tz)    the way home from a hiding spot to (tx, tz) by the fire: [[x, z], ...] ending there
import { SCOUT_WOODS, SCOUT_CAMP } from './layout.js';
import { pointInPoly } from './util.js';

export const CAMP_R = 3.5;  // the camp itself: the fire, the benches 2.7 m out, Gene 3.1 m out (where the lead-in ends)
export const LEAD_R = 2;    // half the lead-in path's width
// Way points along the middle of the loop: the route home threads through those it needs (a visibility graph per destination).
const NODES = [[-130, -62], [-140, -50], [-150, -44], [-160, -50], [-150, -70], [-168, -62], [-180, -46], [-181, -30], [-181, -10], [-181, 8],
  [-181, 28], [-170, 34], [-150, 34], [-130, 33], [-117, 36]];

export const inScoutWoods = (x, z) => pointInPoly(x, z, SCOUT_WOODS);

// the lead-in: from the camp to the loop's nearest point, carried 2.5 m on into the woods (its far end = the gate)
let neckKey = '', neck = null;
export function scoutNeck() {
  const key = SCOUT_CAMP.x + ',' + SCOUT_CAMP.z;
  if (key === neckKey) return neck;
  let best = null;
  for (let i = 0, j = SCOUT_WOODS.length - 1; i < SCOUT_WOODS.length; j = i++) {
    const [ax, az] = SCOUT_WOODS[j], [bx, bz] = SCOUT_WOODS[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((SCOUT_CAMP.x - ax) * dx + (SCOUT_CAMP.z - az) * dz) / (dx * dx + dz * dz || 1)));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - SCOUT_CAMP.x, pz - SCOUT_CAMP.z);
    if (!best || d < best.d) best = { px, pz, d };
  }
  const ux = (best.px - SCOUT_CAMP.x) / (best.d || 1), uz = (best.pz - SCOUT_CAMP.z) / (best.d || 1);
  neck = { ax: SCOUT_CAMP.x, az: SCOUT_CAMP.z, gx: best.px + ux * 2.5, gz: best.pz + uz * 2.5 };
  neckKey = key; graphs.clear();
  return neck;
}
function inLeadIn(x, z) {
  const n = scoutNeck(), dx = n.gx - n.ax, dz = n.gz - n.az;
  const t = Math.max(0, Math.min(1, ((x - n.ax) * dx + (z - n.az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - (n.ax + dx * t), z - (n.az + dz * t)) <= LEAD_R;
}
export function inScoutArea(x, z) {
  return Math.hypot(x - SCOUT_CAMP.x, z - SCOUT_CAMP.z) <= CAMP_R || inScoutWoods(x, z) || inLeadIn(x, z);
}
/** True when the straight line a-b stays in the area (checked every 0.5 m). */
export function clearLine(ax, az, bx, bz, test = inScoutArea) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
  for (let i = 0; i <= n; i++) if (!test(ax + (bx - ax) * i / n, az + (bz - az) * i / n)) return false;
  return true;
}

// shortest ways from every way point to a destination by the fire (Dijkstra over the points that see each other; one graph
// per destination, built the first time a scout runs to it)
const graphs = new Map();
function buildGraph(tx, tz) {
  const n = scoutNeck(), pts = [...NODES.filter(p => inScoutWoods(p[0], p[1])), [n.gx, n.gz], [tx, tz]], G = pts.length - 1;
  const dist = pts.map(() => Infinity), next = pts.map(() => -1), done = pts.map(() => false);
  const see = pts.map((p, i) => pts.map((q, j) => i !== j && clearLine(p[0], p[1], q[0], q[1])));
  dist[G] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < pts.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    for (let v = 0; v < pts.length; v++) {
      if (!see[u][v]) continue;
      const d = dist[u] + Math.hypot(pts[u][0] - pts[v][0], pts[u][1] - pts[v][1]);
      if (d < dist[v]) { dist[v] = d; next[v] = u; }
    }
  }
  return { pts, dist, next, G };
}
/** From (x, z) to (tx, tz) (a bench by the fire): the points to run through, the start not included, the end included.
 *  Falls back to a straight line when nothing better is found. */
export function scoutRoute(x, z, tx = SCOUT_CAMP.x, tz = SCOUT_CAMP.z) {
  scoutNeck();
  if (clearLine(x, z, tx, tz)) return aroundFire([[tx, tz]], x, z);
  const key = tx.toFixed(2) + ',' + tz.toFixed(2);
  if (!graphs.has(key)) graphs.set(key, buildGraph(tx, tz));
  const { pts, dist, next, G } = graphs.get(key);
  let best = -1, bd = Infinity;
  for (let i = 0; i < G; i++) {
    if (dist[i] === Infinity) continue;
    const d = Math.hypot(pts[i][0] - x, pts[i][1] - z) + dist[i];
    if (d < bd && clearLine(x, z, pts[i][0], pts[i][1])) { bd = d; best = i; }
  }
  if (best < 0) return [[tx, tz]];
  const out = [];
  for (let i = best; i >= 0; i = next[i]) { out.push([pts[i][0], pts[i][1]]); if (i === G) break; }
  return aroundFire(out, x, z);
}
// The last leg in along the lead-in would cut through the fire to a bench on its far side: in the camp, step round the fire
// to the bench instead (points 2.6 m from it, every 50 degrees; all inside the camp itself, CAMP_R).
function aroundFire(out, x, z) {
  const n = out.length, [tx, tz] = out[n - 1], [px, pz] = n > 1 ? out[n - 2] : [x, z], cx = SCOUT_CAMP.x, cz = SCOUT_CAMP.z;
  const dx = tx - px, dz = tz - pz, t = Math.max(0, Math.min(1, ((cx - px) * dx + (cz - pz) * dz) / (dx * dx + dz * dz || 1)));
  if (Math.hypot(px + dx * t - cx, pz + dz * t - cz) > 1.5) return out;
  const a0 = Math.atan2(pz - cz, px - cx), a1 = Math.atan2(tz - cz, tx - cx);
  let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  const steps = Math.max(1, Math.ceil(Math.abs(da) / 0.87)), arc = [];
  for (let k = 0; k < steps; k++) { const a = a0 + da * k / steps; arc.push([cx + Math.cos(a) * (k ? 2.6 : 3.2), cz + Math.sin(a) * (k ? 2.6 : 3.2)]); }
  return [...out.slice(0, n - 1), ...arc, [tx, tz]];
}
