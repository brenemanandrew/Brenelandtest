// Traffic: a handful of cars that live in the empty driveways on Summit Rd and the shops' lot, pull out, drive a loop of
// the town's roads and come home. Lamps, turning wheels, a lean into corners, an engine hum and a horn. The town bus too.
//
// DETERMINISM. Everything shared is a pure function of the shared clock. Trips and routes come from hash01, and the motion
// is a small lockstep simulation stepped every DT seconds on an absolute grid of the clock. Its inputs are pure too (the
// residents, the mail and pizza routes, the van, the pickup, the golf cart, and the other cars one step back), so two
// clients get the same floats. A late joiner replays from EPOCH_BACK, and GAP > MAX_TRIP keeps trips apart, so where
// the epoch sits never matters.
//
// The LOCAL player is the one thing that isn't shared: a car with you in its lane stops short as an eased offset BEHIND
// its shared position, and catches up when you step aside. Other visitors see it drive on. The horn is local too.
import * as THREE from 'three';
import { ROADS, CAR_LOT, LANE_OFFSET, SIDEWALK_W, PARK_LOT, BUS_STOP, BUS_TUNNEL, VAN_STOP, CRIB_PAD } from './layout.js';
import { busParts, BUS, BUS_SCHEDULE } from './bus-model.js';
import { TOWN_DRIVEWAYS } from './world-town.js';
import { roadEdgeDist } from './terrain.js';
import { streetY, routeAt } from './mailman-route.js';
import { hash01, angleLerp, wrapAngle, clamp, smoothstep } from './util.js';
import { Batcher } from './batch.js';
import { carParts, partMatrix, CAR_COLORS as COLORS } from './car-models.js';
import { LIGHT } from './daynight-mats.js';
import { LAYER_SOFT } from './toon.js';
import { hourAt } from './npcs-day.js';
import { kevinRideAt } from './kevin-day.js';   // (crib-move) Kevin's Sunday ride on his motorcycle
import { residentStates } from './town-life.js';
import { familyAt } from './buddy-day.js';
import { vanAt, VAN } from './mail-van.js';
import { joyceAt, cartAt, cartZone, cartTripIndex, cartGateAt, cartClear, setCartDelay, HOLD_MAX } from './joyce-day.js';
import { registerTownSfx, engineLoop } from './town-sfx.js';

const DT = 0.2;                 // the simulation grid (s)
const MAX_TRIP = 150;           // a trip longer than this is sent home (never seen in practice; it bounds the replay)
const GAP = 170;                // trips of one car start at least this far apart (> MAX_TRIP)
const EPOCH_BACK = 520;         // how far back a joining client replays (> longest cycle + GAP)
const LANE = LANE_OFFSET;
const ACC = 2.4, BRAKE = 4.6, ALAT = 2.4, REV_V = 1.7; // m/s2, m/s2, lateral m/s2 in corners, reversing speed
const NOSE = 2.0, HALF_W = 0.88, LEN = 4.0;              // the car: centre to bumper, half width, length
const JUNCTION_R = 8, WAIT_MAX = 10;
const SUMMIT_Z = -126.5, BREN_Z = -48.5, MAPLE_X = -20;
// (the mail van: parked in its lay-by in Pat's hours, driving between there and the post office's bay at either end of them: mail-van.js)
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ the road graph (centre lines)

const bren = ROADS.find(r => r.id === 'breneland-rd').pts;
const NODES = { A: [57.5, BREN_Z], B: [MAPLE_X, BREN_Z], D: bren[bren.length - 1], E: [MAPLE_X, SUMMIT_Z], F: [59, SUMMIT_Z], W: [-192, SUMMIT_Z] };
const DEAD = { A: 52, F: 53, W: -186 }; // dead ends: x of the U-turn
const EDGES = { AB: [NODES.A, NODES.B], BD: [NODES.B, ...bren.slice(1)], DE: [NODES.D, NODES.E], EF: [NODES.E, NODES.F], DW: [NODES.D, NODES.W], BE: [NODES.B, NODES.E] };
const ADJ = { A: ['B'], B: ['A', 'D', 'E'], D: ['B', 'E', 'W'], E: ['D', 'F', 'B'], F: ['E'], W: ['D'] };
function edgePts(a, b) { return EDGES[a + b] ? EDGES[a + b] : EDGES[b + a].slice().reverse(); }
function edgeLen(a, b) { const p = edgePts(a, b); let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }
// shortest node path from (cur, prev) to `goal` that never turns straight back on the road it came by (no U-turns mid-road)
function bfs(cur, prev, goal) {
  if (cur === goal) { // already there: the shortest loop out and back again
    let best = null;
    for (const m of ADJ[cur]) {
      if (m === prev && !DEAD[cur]) continue;
      const p = bfs(m, cur, goal);
      if (p && (!best || p.length < best.length - 1)) best = [cur, ...p];
    }
    return best;
  }
  const q = [[cur, prev, [cur]]], seen = new Set([cur + '|' + prev]);
  while (q.length) {
    const [n, p, path] = q.shift();
    for (const m of ADJ[n]) {
      if (m === p && !DEAD[n]) continue;
      const key = m + '|' + n;
      if (seen.has(key)) continue;
      seen.add(key);
      const np = [...path, m];
      if (m === goal) return np;
      q.push([m, n, np]);
    }
  }
  return null;
}

// ------------------------------------------------------------------ lane paths

// the centre polyline moved to the right-hand lane (right of the direction of travel = (-dz, dx) with +x east, +z south)
function offsetRight(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)];
    let d0x = p[0] - a[0], d0z = p[1] - a[1], d1x = c[0] - p[0], d1z = c[1] - p[1];
    const L0 = Math.hypot(d0x, d0z) || 1, L1 = Math.hypot(d1x, d1z) || 1;
    d0x /= L0; d0z /= L0; d1x /= L1; d1z /= L1;
    if (i === 0) { d0x = d1x; d0z = d1z; } if (i === pts.length - 1) { d1x = d0x; d1z = d0z; }
    let nx = -(d0z + d1z), nz = d0x + d1x;
    const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const cosHalf = Math.max(0.4, nx * -d0z + nz * d0x); // the mitre: a sharper corner pushes the vertex further out
    out.push([p[0] + nx * d / cosHalf, p[1] + nz * d / cosHalf]);
  }
  return out;
}
// replace every real corner with a quadratic arc R metres either side (R shrinks on short segments)
function roundCorners(pts, R = 5.5) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], p = pts[i], c = pts[i + 1];
    const L0 = Math.hypot(p[0] - a[0], p[1] - a[1]), L1 = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const ang = Math.abs(wrapAngle(Math.atan2(c[0] - p[0], c[1] - p[1]) - Math.atan2(p[0] - a[0], p[1] - a[1])));
    if (ang < 0.12) { out.push(p); continue; }
    const r = Math.min(R, L0 * 0.45, L1 * 0.45), n = ang > 1.2 ? 7 : 4;
    const s = [p[0] + (a[0] - p[0]) * r / L0, p[1] + (a[1] - p[1]) * r / L0], e = [p[0] + (c[0] - p[0]) * r / L1, p[1] + (c[1] - p[1]) * r / L1];
    for (let k = 0; k <= n; k++) {
      const u = k / n, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
      out.push([w0 * s[0] + w1 * p[0] + w2 * e[0], w0 * s[1] + w1 * p[1] + w2 * e[1]]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
// the U-turn at a dead end: a semicircle of radius 3 bulging past x = xu, from the near lane to the far lane
function uturn(xu, c, east) {
  const pts = [[xu - (east ? 3 : -3), c + (east ? LANE : -LANE)]];
  for (let k = 0; k <= 8; k++) { const f = (k / 8) * Math.PI; pts.push(east ? [xu + 3 * Math.sin(f), c + 3 * Math.cos(f)] : [xu - 3 * Math.sin(f), c - 3 * Math.cos(f)]); }
  pts.push([xu - (east ? 3 : -3), c - (east ? LANE : -LANE)]);
  return pts;
}

// A finished path: vertex arrays with cumulative distance, a smoothed heading, curvature, ground height, the fold
// where reversing ends, and the junction windows (where the path runs through a junction box).
function finishPath(pts, foldIndex, home) {
  const n = pts.length, x = new Float64Array(n), z = new Float64Array(n), cum = new Float64Array(n), head = new Float64Array(n), curv = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = pts[i][0]; z[i] = pts[i][1]; }
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
  const segH = i => Math.atan2(x[i + 1] - x[i], z[i + 1] - z[i]);
  for (let i = 0; i < n; i++) {
    const h0 = i > 0 ? segH(i - 1) : segH(0), h1 = i < n - 1 ? segH(i) : segH(n - 2);
    const oneSided = i === 0 || i === n - 1 || i === foldIndex || i === foldIndex + 1;
    head[i] = oneSided ? (i <= foldIndex ? h0 : h1) : h0 + wrapAngle(h1 - h0) / 2;
    if (i === foldIndex) head[i] = h0; if (i === foldIndex + 1) head[i] = h1;
    const L = i > 0 && i < n - 1 ? (cum[i] - cum[i - 1] + cum[i + 1] - cum[i]) / 2 : 1;
    curv[i] = oneSided ? 0 : Math.abs(wrapAngle(h1 - h0)) / Math.max(0.3, L);
    y[i] = streetY(x[i], z[i]);
  }
  for (let i = 1; i < n - 1; i++) y[i] = (y[i - 1] + y[i] * 2 + y[i + 1]) / 4; // soften the curb steps a little
  // junction windows
  const windows = [];
  for (const id of ['B', 'D', 'E']) {
    const J = NODES[id];
    let inside = false, sIn = 0, i0 = 0;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(x[i] - J[0], z[i] - J[1]) < JUNCTION_R;
      if (d && !inside) { inside = true; sIn = cum[i]; i0 = i; }
      if (!d && inside) { inside = false; const turn = wrapAngle(head[i] - head[i0]); windows.push({ id, sIn, sOut: cum[i], turn: Math.abs(turn) > 0.5 ? Math.sign(turn) : 0 }); }
    }
  }
  windows.sort((a, b) => a.sIn - b.sIn);
  return { x, z, cum, head, curv, y, n, L: cum[n - 1], foldIndex, sFold: cum[foldIndex], sCurb: cum[2], windows, home }; // vertex 2 of the reverse-out is the road's edge
}

// Where a path is at distance s: fills `o` with x, z, yaw, y, curvature; keeps a segment cursor in o.i.
function pathAt(P, s, o) {
  s = clamp(s, 0, P.L);
  let i = clamp(o.i | 0, 0, P.n - 2);
  while (i > 0 && P.cum[i] > s) i--;
  while (i < P.n - 2 && P.cum[i + 1] < s) i++;
  const L = P.cum[i + 1] - P.cum[i], t = L > 1e-6 ? (s - P.cum[i]) / L : 0;
  o.i = i;
  o.x = P.x[i] + (P.x[i + 1] - P.x[i]) * t; o.z = P.z[i] + (P.z[i + 1] - P.z[i]) * t;
  o.y = P.y[i] + (P.y[i + 1] - P.y[i]) * t;
  o.yaw = angleLerp(P.head[i], P.head[i + 1], t);
  o.curv = P.curv[i] + (P.curv[i + 1] - P.curv[i]) * t;
  return o;
}
// Project a point onto the path near s: along (metres ahead of s, negative = behind) and lat (metres to the LEFT of the
// path, i.e. toward the road's centre line). Searches the segments from `back` behind to `range` ahead.
function project(P, s, px, pz, back, range, out) {
  let best = Infinity;
  out.hit = false;
  const lo = s - back, hi = s + range;
  let a = 0, b = P.n - 2; // the first segment that reaches lo
  while (a < b) { const m = (a + b) >> 1; if (P.cum[m + 1] < lo) a = m + 1; else b = m; }
  for (let i = a; i < P.n - 1 && P.cum[i] <= hi; i++) {
    const ax = P.x[i], az = P.z[i], dx = P.x[i + 1] - ax, dz = P.z[i + 1] - az, L2 = dx * dx + dz * dz || 1e-9;
    let t = ((px - ax) * dx + (pz - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + dx * t, cz = az + dz * t, ex = px - cx, ez = pz - cz, d2 = ex * ex + ez * ez;
    if (d2 < best) {
      best = d2; const L = Math.sqrt(L2);
      out.hit = true; out.along = P.cum[i] + t * L - s; out.lat = (ex * dz - ez * dx) / L; out.seg = i; // left of travel = (dz, -dx)
      out.dist = Math.sqrt(d2);
    }
  }
  return out;
}

// ------------------------------------------------------------------ homes and trips

function homesList() {
  const homes = [];
  for (const d of TOWN_DRIVEWAYS) if (!d.parked) homes.push({ x: d.x, bayZ: d.bayZ, curbZ: d.curbZ, side: d.facing === -1 ? 1 : -1 }); // side: +1 the house is south of the road
  for (const [bx, bz] of CAR_LOT.bays) homes.push({ x: bx, bayZ: bz, curbZ: CAR_LOT.minZ + 2, side: 1, lot: true });
  for (const h of homes) {
    h.dir = h.side === 1 ? 1 : -1;                        // leaving: south-side homes join the eastbound lane, north-side the westbound
    h.laneZ = SUMMIT_Z + LANE * h.side;
    h.edge = h.x > MAPLE_X ? ['E', 'F'] : h.x > NODES.D[0] ? ['D', 'E'] : ['W', 'D']; // the Summit Rd edge it sits on, west node first
    h.exitTo = h.dir === 1 ? h.edge[1] : h.edge[0];
    h.arriveFrom = h.dir === 1 ? h.edge[0] : h.edge[1];
    h.p0 = [h.x - 5 * h.dir, h.laneZ];                   // the lane point it reverses out to and turns in from
  }
  return homes;
}

// A trip's route for (car, trip j): a hash-chosen walk of the graph, then the shortest way back to the home edge.
function routeNodes(home, i, j) {
  const seq = [home.exitTo];
  let cur = home.exitTo, prev = home.arriveFrom, dist = edgeLen(home.arriveFrom, home.exitTo) / 2;
  const n = 2 + Math.floor(hash01('carwalk', i, j) * 4);
  for (let k = 0; k < n; k++) {
    const opts = ADJ[cur].filter(m => m !== prev || DEAD[cur]);
    const next = opts[Math.floor(hash01('carturn', i, j, k) * opts.length)];
    const back = bfs(next, cur, home.arriveFrom);
    let extra = edgeLen(cur, next);
    for (let q = 1; q < back.length; q++) extra += edgeLen(back[q - 1], back[q]);
    if (dist + extra + edgeLen(home.arriveFrom, home.exitTo) > 560) break; // keep the trip inside its time box
    dist += edgeLen(cur, next); prev = cur; cur = next; seq.push(cur);
  }
  const back = bfs(cur, prev, home.arriveFrom);
  for (let q = 1; q < back.length; q++) seq.push(back[q]);
  seq.push(home.exitTo);
  return seq;
}

function buildPath(home, seq) {
  // centre-line runs between U-turns, from the home's centre-line point (its lane point once offset) to exitTo and on
  const c0 = [home.x - 5 * home.dir, SUMMIT_Z];
  const runs = [[c0.slice()]];
  let prev = home.arriveFrom, cur = home.exitTo;
  { const pts = edgePts(prev, cur); for (let k = 1; k < pts.length; k++) runs[0].push(pts[k].slice()); }
  for (let q = 1; q < seq.length; q++) {
    const next = seq[q];
    if (DEAD[cur] && next === prev) { // a U-turn at a dead end: close this run at the turn, start the next one after it
      const run = runs[runs.length - 1], east = cur !== 'W', xu = DEAD[cur], c = NODES[cur][1];
      run[run.length - 1] = [xu - (east ? 3 : -3), c];
      runs.push([[xu - (east ? 3 : -3), c]]);
      runs[runs.length - 1].uturn = { xu, c, east };
    }
    const last = q === seq.length - 1;
    const pts = edgePts(cur, next), run = runs[runs.length - 1];
    for (let k = 1; k < pts.length; k++) run.push(pts[k].slice());
    if (last) run[run.length - 1] = c0.slice(); // the final edge stops at the home point
    prev = cur; cur = next;
  }
  // lanes: offset each run, round its corners, and splice the U-turn arcs in between
  let lane = [];
  runs.forEach((run, ri) => {
    const o = roundCorners(offsetRight(run, LANE));
    if (ri === 0) lane = o;
    else { const u = run.uturn; lane.push(...uturn(u.xu, u.c, u.east).slice(1, -1), ...o.slice(1)); }
  });
  // the reverse-out from the bay to the lane point (heading flipped on these), and the turn-in at the end
  const { x: hx, side, dir, laneZ: zL, bayZ, curbZ } = home;
  const pre = [[hx, bayZ], [hx, curbZ + 0.8 * side], [hx, zL + 2.9 * side], [hx - 0.5 * dir, zL + 1.3 * side], [hx - 1.6 * dir, zL + 0.1 * side], [hx - 3.2 * dir, zL - 0.5 * side]];
  const post = [[hx - 3.6 * dir, zL + 0.25 * side], [hx - 2.2 * dir, zL + 1.0 * side], [hx - 1.0 * dir, zL + 2.2 * side], [hx - 0.3 * dir, zL + 3.6 * side], [hx, zL + 5 * side], [hx, curbZ + 0.8 * side], [hx, bayZ]];
  const all = [...pre, ...lane, ...post];
  return finishPath(all, pre.length, home); // the fold is the lane point (lane[0] == home.p0)
}

// ------------------------------------------------------------------ the bus's route
// Out of the tunnel, down Breneland Rd, into the bay to the stop (P.sStop), back out, along Breneland Rd to Maple Ave, up Maple
// Ave, along Summit Rd's westbound lane and into the tunnel. The same path every trip. The bay's S curves are slow (P.sSlow).
const BUS_HOME = { x: BUS_TUNNEL.endX, bayZ: SUMMIT_Z - LANE, side: 0, bus: true };
let busPathCache = null;
function busPath() {
  if (busPathCache) return busPathCache;
  const T = BUS_TUNNEL, st = BUS_STOP.stop, xs = st.x, zs = st.z, Dx = NODES.D[0], laneX = Dx - LANE;
  const S = (x0, z0, x1, z1, n) => { const o = []; for (let k = 1; k <= n; k++) { const u = k / n, e = u * u * (3 - 2 * u); o.push([x0 + (x1 - x0) * e, z0 + (z1 - z0) * u]); } return o; };
  const zIn = zs - 24, zFull = zs - 10, zOut0 = zs + 2.5, zOut1 = zs + 15;
  const arr = roundCorners(offsetRight([[T.endX, SUMMIT_Z], [Dx, SUMMIT_Z], [Dx, zIn]], LANE), 9);
  const pullIn = S(laneX, zIn, xs, zFull, 12);
  const stopI = arr.length + pullIn.length;
  // (bren runs from the lake end to the junction: its last bend point bren[4] is north of where the bus rejoins the lane)
  const [b1, b2] = [bren[bren.length - 2], bren[bren.length - 3]], cx = b1[0] + (b2[0] - b1[0]) * (zOut1 - b1[1]) / (b2[1] - b1[1]);
  const pullOut = S(xs, zOut0, cx - LANE, zOut1, 12);
  const loop = roundCorners(offsetRight([[cx, zOut1], ...bren.slice(1, bren.length - 2).reverse(), [MAPLE_X, BREN_Z], [MAPLE_X, SUMMIT_Z], [T.endX, SUMMIT_Z]], LANE), 9);
  const pts = [...arr, ...pullIn, [xs, zs], [xs, zOut0], ...pullOut, ...loop.slice(1)];
  const P = finishPath(pts, 0, BUS_HOME);
  P.sStop = P.cum[stopI];
  P.sSlow = [P.cum[arr.length - 1] - 4, P.cum[stopI + 2 + pullOut.length] + 2];
  busPathCache = P;
  return P;
}

// ------------------------------------------------------------------ the car model (car-models.js; faces +z, the nose at +z)

const KIND_OF = ['hatch', 'pickup', 'van', 'beetle', 'sedan', 'beetle', 'hatch'];
const LAMP = { // [off, on] colours; the HDR values burn under the tone mapping like the street lamps do
  head: [[0.86, 0.84, 0.72], [2.6, 2.45, 1.9]], tail: [[0.5, 0.14, 0.12], [1.5, 0.22, 0.18]], brake: [2.8, 0.3, 0.2],
  ind: [[0.88, 0.56, 0.2], [3.2, 1.9, 0.3]], rev: [[0.8, 0.8, 0.78], [2.4, 2.4, 2.2]], glassDay: [0.6, 0.82, 0.93], glassNight: [0.24, 0.32, 0.5],
};
const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
// the glow sprites that sit on a car's lamps (see `glows` in createCars): [lamp name, kind, outward push x, z]
const GLOW_LAMPS = [['indFL', 'ind', 0.07, 0.07], ['indFR', 'ind', -0.07, 0.07], ['indRL', 'ind', 0.07, -0.07], ['indRR', 'ind', -0.07, -0.07],
  ['indSL', 'side', 0.05, 0], ['indSR', 'side', -0.05, 0], ['tailL', 'tail', 0, -0.06], ['tailR', 'tail', 0, -0.06], ['headL', 'head', 0, 0.08], ['headR', 'head', 0, 0.08]];
const IND_L = ['indFL', 'indRL', 'indSL'], IND_R = ['indFR', 'indRR', 'indSR'];
const vcount = geo => (geo.index ? geo.index.count : geo.attributes.position.count);

function buildCar(i, parts = null) {
  const g = new THREE.Group(); g.name = parts ? 'bus' : 'car-' + i;
  const col = COLORS[i % COLORS.length], kind = parts ? parts.kind : KIND_OF[i % KIND_OF.length], model = parts || carParts(kind);
  const b = new Batcher({ vertexColors: true }), lb = new Batcher({ vertexColors: true, castShadow: false });
  const wbs = [new Batcher({ vertexColors: true, receiveShadow: false }), new Batcher({ vertexColors: true, receiveShadow: false })];
  const ranges = {}, glowAt = {}, m = new THREE.Matrix4();
  let nv = 0;
  for (const p of model.parts) {
    partMatrix(p.o, m);
    if (p.wheel !== undefined) { wbs[p.wheel].add(p.geo, p.color, { matrix: m }); continue; }
    if (p.lamp || p.glass) {
      const name = p.lamp || 'glass', n = vcount(p.geo);
      (ranges[name] || (ranges[name] = [])).push(nv, n); nv += n;
      lb.add(p.geo, '#ffffff', { matrix: m });
      if (p.lamp) glowAt[p.lamp] = [p.o.x || 0, p.o.y || 0, p.o.z || 0];
      continue;
    }
    b.add(p.geo, p.color === 'body' ? col : p.color === 'top' ? '#f6f0de' : p.color, { matrix: m });
  }
  const body = b.build(g, 'car-body')[0];
  body.castShadow = true; body.receiveShadow = false;
  const lamps = lb.build(g, 'car-lamps')[0];
  lamps.material = lampMat;
  const colAttr = lamps.geometry.attributes.color;
  const setLamp = (name, c) => { const r = ranges[name]; for (let k = 0; k < r.length; k += 2) for (let v = r[k], e = r[k] + r[k + 1]; v < e; v++) colAttr.setXYZ(v, c[0], c[1], c[2]); };
  // wheels: two axles (steer, then roll), each with both wheels so a pair is one mesh
  const axles = model.axles.map((az, ai) => {
    const steer = new THREE.Group(); steer.position.set(0, model.wheelR, az);
    const roll = new THREE.Group(); steer.add(roll);
    wbs[ai].build(roll, 'car-wheels').forEach(w => { w.castShadow = true; });
    g.add(steer);
    return { steer, roll };
  });
  const glows = GLOW_LAMPS.map(([name, k, ox, oz]) => { const p = glowAt[name]; return [p[0] + ox, p[1], p[2] + oz, k]; });
  const car = { g, body, lamps, colAttr, setLamp, axles, kind, color: col, wheelR: model.wheelR, glows, state: {} };
  applyLamps(car, { night: false, brake: false, rev: false, ind: 0, blink: false, on: false }, true);
  return car;
}
function applyLamps(car, L, force) {
  const S = car.state, same = !force && S.night === L.night && S.brake === L.brake && S.rev === L.rev && S.ind === L.ind && S.blink === L.blink && S.on === L.on;
  if (same) return;
  Object.assign(S, L);
  const headOn = L.on && L.night;
  car.setLamp('headL', LAMP.head[headOn ? 1 : 0]); car.setLamp('headR', LAMP.head[headOn ? 1 : 0]);
  const tail = L.brake ? LAMP.brake : LAMP.tail[headOn ? 1 : 0];
  car.setLamp('tailL', tail); car.setLamp('tailR', tail);
  const li = L.ind > 0 && L.blink ? 1 : 0, ri = L.ind < 0 && L.blink ? 1 : 0; // a positive heading change is a left turn
  for (const n of IND_L) car.setLamp(n, LAMP.ind[li]);
  for (const n of IND_R) car.setLamp(n, LAMP.ind[ri]);
  car.setLamp('revL', LAMP.rev[L.rev ? 1 : 0]); car.setLamp('revR', LAMP.rev[L.rev ? 1 : 0]);
  car.setLamp('glass', L.night ? LAMP.glassNight : LAMP.glassDay);
  car.colAttr.needsUpdate = true;
}

function poolTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 40, 2, 32, 56, 70);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.35, 'rgba(255,255,255,0.55)'); grad.addColorStop(0.7, 'rgba(255,255,255,0.18)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ------------------------------------------------------------------ the feature

export function createCars(ctx) {
  const { scene, player, audio, net, npcs, renderer, camera } = ctx;
  const homes = homesList();
  if (!homes.length) return null;
  registerTownSfx(audio);
  const group = new THREE.Group(); group.name = 'cars'; scene.add(group);
  const street = npcs.street;

  // one car per home (up to 7): its home, its cycle, its look
  const cars = homes.slice(0, 7).map((home, i) => {
    const model = buildCar(i);
    model.g.position.set(home.x, streetY(home.x, home.bayZ), home.bayZ);
    model.g.rotation.y = home.side === 1 ? Math.PI : 0; // nose toward the house
    group.add(model.g);
    const cruise = 6.6 + hash01('carspeed', i) * 1.8;
    return {
      i, home, model, cruise, cycle: 240 + i * 17, pathCache: new Map(), cur: null, prev: null, lastTrip: null,
      cursor: { i: 0 }, rcur: { i: 0 }, back: 0, backV: 0, hornAt: 0, blockT: 0, lat: 0, wheel: 0, bob: 0, engine: null,
      nose: NOSE, len: LEN, halfW: HALF_W, maxTrip: MAX_TRIP,
    };
  });
  // the town bus: one more car, the last, on its own schedule (BUS_SCHEDULE) and route (busPath). Parked means in the tunnel.
  const bus = (() => {
    const i = cars.length, model = buildCar(i, busParts());
    model.g.visible = false; group.add(model.g);
    return {
      i, home: BUS_HOME, model, cruise: 6.4, cycle: BUS_SCHEDULE.period, pathCache: new Map(), cur: null, prev: null, lastTrip: null,
      cursor: { i: 0 }, rcur: { i: 0 }, back: 0, backV: 0, hornAt: 0, blockT: 0, lat: 0, wheel: 0, bob: 0, engine: null,
      nose: BUS.nose, len: BUS.L, halfW: BUS.halfW, maxTrip: BUS_SCHEDULE.maxTrip, bus: true,
    };
  })();
  cars.push(bus);
  const parkedState = () => ({ trip: null, s: 0, v: 0, lat: 0, wait: 0, since: 0, why: '', braking: false, x: 0, z: 0, yaw: 0, path: null });

  // ---------------------------------------------------------------- the lockstep simulation
  let simK = null; // the step whose state every car's `cur` holds (time simK * DT)
  const tmpP = { hit: false, along: 0, lat: 0, dist: 0 }, tmpA = { i: 0 }, peds = [], obstacles = [], exitPed = { x: 0, z: 0 }, vanPeds = [{ x: 0, z: 0 }, { x: 0, z: 0 }], bikePed = { x: 0, z: 0 };
  const cartPeds = [{ x: 0, z: 0 }, { x: 0, z: 0 }], cartObs = { x: 0, z: 0, halfW: 0.7, moving: true, v: 0 };
  const CART_AHEAD = Array.from({ length: 13 }, (_, i) => 0.8 * (i + 1)), cartSoon = [], cartTmp = {}, cartPool = CART_AHEAD.map(() => ({ x: 0, z: 0 }));
  const cartSoft = [], softPool = [];
  const KEV_AHEAD = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5], kevSoon = [], kevPool = KEV_AHEAD.map(() => ({ x: 0, z: 0, h: 0, tau: 0 })), kev = { on: false, x: 0, z: 0, h: 0, v: 0 };   // (town-fixes: Kevin's ride)   // (the crossing the cart is waiting at a gate to make: see gather)
  // Joyce's golf cart waits at its gates until the way is clear of cars. Decided here in the lockstep, from the cars one step
  // back, so every client agrees. cartD is how long it has waited this trip, cartHist keeps it per step for joyce-day.js.
  let cartD = 0, cartTrip = -1, inStep = false;
  const cartHist = new Map(), carNow = [];
  function cartHold(k, t) {
    const ms = t * 1000, ti = cartTripIndex(ms);
    if (ti !== cartTrip) { cartTrip = ti; cartD = 0; }
    if (ti >= 0 && cartD < HOLD_MAX) {
      const g = cartGateAt(ms, cartD);
      if (g) {
        carNow.length = 0;
        for (const c of cars) if (c.cur.trip !== null) carNow.push(c.cur);
        if (!cartClear(g, carNow)) cartD = Math.round((cartD + DT) * 1e6) / 1e6;
      }
    }
    cartHist.set(k, cartD);
    if (cartHist.size > 1200) cartHist.delete(cartHist.keys().next().value);
  }
  setCartDelay(t => {
    const k = Math.floor(t / DT + 1e-9);
    const h = cartHist.get(k);
    if (h !== undefined) return h;
    if (simK === null || k < simK) return 0;   // (older than the history: that trip is long over)
    if (inStep || k - simK > 25) return k - simK > 25 ? 0 : cartD;   // (a look ahead: as it stands now)
    ensure(k);   // (asked a frame before the traffic is stepped: step it now)
    return cartHist.get(k) ?? cartD;
  });

  function pathFor(car, j) {
    if (car.bus) return busPath();
    let p = car.pathCache.get(j);
    if (!p) {
      p = buildPath(car.home, routeNodes(car.home, car.i, j));
      car.pathCache.set(j, p);
      if (car.pathCache.size > 4) car.pathCache.delete(car.pathCache.keys().next().value);
    }
    return p;
  }
  // trip j of car i starts at T0 inside its cycle; some are skipped (fewer cars out at night)
  function tripStart(car, j) {
    if (car.bus) return j * car.cycle + BUS_SCHEDULE.offset;   // (every period, day and night: the server clock decides)
    const T0 = j * car.cycle + hash01('cartrip', car.i, j) * (car.cycle - GAP);
    const h = hourAt(T0), quiet = h < 6.5 || h >= 22;
    const p = hash01('cargo', car.i, j);
    return p < (quiet ? 0.3 : 0.92) ? T0 : null;
  }
  function reset(t) {
    const tE = t - EPOCH_BACK;
    simK = Math.floor(tE / DT);
    cartD = 0; cartTrip = -1; cartHist.clear();
    for (const c of cars) {
      c.cur = parkedState(); c.prev = c.cur;
      const j = Math.floor(tE / c.cycle), T0 = tripStart(c, j);
      c.lastTrip = T0 !== null && T0 <= tE ? j : j - 1; // a trip that began before the epoch is long over by now (GAP > MAX_TRIP)
    }
  }
  // what is on the roads at time t besides the cars: people on the tar, the scooter, the mail van, the pickup, the golf cart
  function gather(t) {
    peds.length = 0; obstacles.length = 0;
    for (const s of residentStates(t)) if (!s.hidden && roadEdgeDist(s.x, s.z) < 0.5) peds.push(s);
    for (const role of ['pat', 'pizza']) {
      const d = street.defs[role]; if (!d) continue;
      const s = street.stateOf(d, t);
      if (!s.hidden && !s.riding && !s.seated && roadEdgeDist(s.x, s.z) < 0.5) peds.push(s);
    }
    const pz = street.slotAt('pizza', t), sc = street.scooterAt(pz, t);
    if (sc) { const r = routeAt(pz.route, t); obstacles.push({ x: sc.x, z: sc.z, halfW: 0.35, moving: r.riding, v: 6.5 }); }
    // the mail van (mail-van.js): parked in its lay-by (clear of the lane, passed like anything at the kerb), followed on the road.
    // Nosing out of the post office's drive, backing into its bay or pulling out of the lay-by, it's treated as a person in the lane
    // so the cars wait. In its bay it's off the road.
    const vn = vanAt(street, t);
    if (vn.phase === 'curb') obstacles.push({ x: vn.x, z: vn.z, halfW: VAN.halfW, moving: false, v: 0 });
    else if (vn.moving) {
      if (vn.phase === 'home' && vn.z > BREN_Z + LANE + 0.4 && vn.x < VAN_STOP.bay[3][0] + 2) {
        vanPeds[0].x = vn.x - 3; vanPeds[0].z = BREN_Z + LANE; peds.push(vanPeds[0]);   // (just behind it: what's coming waits there)
      } else if (vn.phase === 'out' && vn.z < SUMMIT_Z - 1) {
        vanPeds[0].x = vn.x; vanPeds[0].z = SUMMIT_Z - LANE; peds.push(vanPeds[0]);
        if (vn.z > -137.5) { vanPeds[1].x = vn.x + 2; vanPeds[1].z = SUMMIT_Z + LANE; peds.push(vanPeds[1]); }
      } else if (vn.phase === 'back') { vanPeds[0].x = vn.x; vanPeds[0].z = vn.z; peds.push(vanPeds[0]); }
      else if (roadEdgeDist(vn.x, vn.z) < 0.6) obstacles.push({ x: vn.x, z: vn.z, halfW: VAN.halfW, moving: true, v: vn.v });
    }
    // (crib-move) Kevin's motorcycle on its Sunday ride (kevin-day.js): followed on the road like the scooter; coming down the Tool
    // Crib's drive to the road or turning up it, the lane it joins or crosses waits as for a person
    // (town-fixes) he is a vehicle to the cars: step() follows him when he rides their way and keeps clear of where he will be in
    // the next few seconds (`kevSoon`, his ride is pure so every client agrees) when he crosses or turns into their path
    const kb = kevinRideAt(t);
    kev.on = false; kevSoon.length = 0;
    if (kb && kb.riding) {
      if (roadEdgeDist(kb.x, kb.z) < SIDEWALK_W + 1.5) { kev.on = true; kev.x = kb.x; kev.z = kb.z; kev.h = kb.heading; kev.v = kb.speed; }
      if (kb.z > CRIB_PAD.drive.roadZ - 5.2 && kb.z < CRIB_PAD.drive.roadZ - 0.2) { bikePed.x = kb.x; bikePed.z = SUMMIT_Z - LANE; peds.push(bikePed); }   // (on the Tool Crib's drive)
      for (let i = 0; i < KEV_AHEAD.length; i++) {
        const q = kevinRideAt(t + KEV_AHEAD[i]);
        if (!q || !q.riding || roadEdgeDist(q.x, q.z) > 0.6) continue;
        const p = kevPool[i]; p.x = q.x; p.z = q.z; p.h = q.heading; p.tau = KEV_AHEAD[i]; kevSoon.push(p);
      }
    }
    // Buddy and Carol's pickup (buddy-day.js): followed on the road, and the lane is held like a crossing while it pulls out of
    // the park lot. Buddy and Carol themselves when they cross on their morning walk.
    const bc = familyAt(t);
    if (bc) {
      const tr = bc.truck;
      if (tr.moving) {
        const e = roadEdgeDist(tr.x, tr.z);
        const nosingOut = Math.cos(tr.yaw) < -0.5 && tr.z > BREN_Z + LANE + 1.2 && e < SIDEWALK_W + 1.5 && tr.x > PARK_LOT.minX - 3 && tr.x < PARK_LOT.maxX + 3;
        if (nosingOut) { exitPed.x = tr.x + Math.sin(tr.yaw) * 2.6; exitPed.z = tr.z + Math.cos(tr.yaw) * 2.6; peds.push(exitPed); }
        else if (e < 0.6) obstacles.push({ x: tr.x, z: tr.z, halfW: 1.0, moving: true, v: tr.v || 0 });
      }
      for (const s of [bc.buddy, bc.carol]) if (!s.hidden && roadEdgeDist(s.x, s.z) < 0.5) peds.push(s);
    }
    // Joyce's golf cart (joyce-day.js): followed along a lane, and the lanes hold back while it turns across, backs out or comes
    // up a drive. Its schedule is known ahead, so cars also yield to where it'll be in the next ten seconds (`cartSoon`). A car
    // too close to stop carries on through, since it's gone before the cart gets there.
    cartSoon.length = 0; cartSoft.length = 0;
    const ms = t * 1000, near = q => roadEdgeDist(q.x, q.z) < SIDEWALK_W + 1.5;
    // While the cart waits at a gate, the crossing it wants is `cartSoft`: a car stops short of it if it can, otherwise drives
    // on out of it. Stopping inside would leave the car and the cart each waiting for the other.
    const zn = cartZone(ms);
    if (zn && zn.held) {
      for (let i = 0; i < zn.pts.length; i++) { const p = softPool[i] || (softPool[i] = { x: 0, z: 0 }); p.x = zn.pts[i][0]; p.z = zn.pts[i][1]; cartSoft.push(p); }
    }
    const c = cartAt(ms, cartTmp);
    if (near(c)) {
      const along = c.moving && !c.rev && roadEdgeDist(c.x, c.z) < 0 && Math.abs(Math.sin(c.yaw)) > 0.94;
      if (along || roadEdgeDist(c.x, c.z) < 0) { cartObs.x = c.x; cartObs.z = c.z; cartObs.v = along ? c.v : 0; obstacles.push(cartObs); }   // (followed along a lane; crossing or stopped in it: wait behind it)
      if (!along && !cartSoft.length) {
        const k = c.rev ? -2 : 2.2;
        cartPeds[0].x = c.x; cartPeds[0].z = c.z; cartPeds[1].x = c.x + Math.sin(c.yaw) * k; cartPeds[1].z = c.z + Math.cos(c.yaw) * k;
        cartSoon.push(cartPeds[0], cartPeds[1]);
      }
    }
    for (let i = 0; i < CART_AHEAD.length && !cartSoft.length; i++) {
      const q = cartAt(ms + CART_AHEAD[i] * 1000, cartTmp);
      if ((q.moving || roadEdgeDist(q.x, q.z) < 0) && near(q)) { const p = cartPool[i]; p.x = q.x; p.z = q.z; cartSoon.push(p); }
    }
    cartAt(ms, cartTmp);
    if (!cartTmp.moving) { const jy = joyceAt(ms); if (!jy.hidden && jy.mode !== 'cart' && roadEdgeDist(jy.x, jy.z) < 0.5) peds.push(jy); }
  }
  const stopSpeed = d => Math.sqrt(2 * BRAKE * Math.max(0, d));            // the fastest you may go and still stop in d metres
  const followSpeed = (v2, gap) => Math.sqrt(Math.max(0, v2 * v2 + 2 * BRAKE * gap)); // behind something doing v2, `gap` metres of room
  function step() {
    const k = simK + 1, t = k * DT;
    inStep = true;
    cartHold(k, t);
    gather(t);
    const prevs = cars.map(c => c.cur);
    for (const car of cars) {
      const S = car.cur, N = { ...S };
      if (S.trip === null) {
        // parked: time for the next trip?
        const j = Math.floor(t / car.cycle);
        if (j > car.lastTrip) {
          const T0 = tripStart(car, j);
          if (T0 === null) car.lastTrip = j;
          else if (t >= T0) { car.lastTrip = j; Object.assign(N, { trip: j, s: 0, v: 0, lat: 0, wait: 0, since: t, why: 'go', braking: false, path: pathFor(car, j), arr: null, dep: null, left: false }); }
        }
        if (N.trip === null) { const h = car.home; N.x = h.x; N.z = h.bayZ; N.yaw = h.side === 1 ? Math.PI : 0; if (car.bus) N.half = BUS.nose; car.cur = N; continue; }
      }
      const P = N.path, s = N.s, v = N.v, rev = s < P.sFold;
      pathAt(P, s, tmpA);
      const myHead = rev ? tmpA.yaw + Math.PI : tmpA.yaw;
      let vT = rev ? REV_V : car.cruise, why = 'cruise', swerve = 0;
      // corners ahead (and the one under the wheels)
      vT = Math.min(vT, Math.sqrt(ALAT / Math.max(tmpA.curv, 1e-3)));
      for (let i = tmpA.i + 1; i < P.n && P.cum[i] < s + 32; i++) if (P.curv[i] > 0.02) vT = Math.min(vT, followSpeed(Math.sqrt(ALAT / P.curv[i]), P.cum[i] - s));
      // the fold (switch from reversing to driving) and the end of the trip are full stops
      if (rev) vT = Math.min(vT, stopSpeed(P.sFold - s));
      vT = Math.min(vT, stopSpeed(P.L - s));
      // people on the tar ahead: stop with the nose short of them
      for (const p of peds) {
        project(P, s, p.x, p.z, 1, 18, tmpP);
        if (tmpP.hit && Math.abs(tmpP.lat) < 3.4 && tmpP.along > -1) { const a = stopSpeed(tmpP.along - car.nose - 1.6); if (a < vT) { vT = a; why = 'pedestrian'; } }
      }
      // where Joyce's cart is about to be (gather): stop short of the nearest spot if there's room for all of them, else carry on
      // through. A car already stopping for it may use all its brakes. `yc`: this car is yielding to the cart.
      let cartRoom = Infinity, committed = false;
      for (const p of cartSoon) {
        project(P, s, p.x, p.z, 1, 24, tmpP);
        if (!tmpP.hit || Math.abs(tmpP.lat) > 2.7 || tmpP.along < -LEN / 2) continue;
        const room = tmpP.along - car.nose - 3.4;   // (the spots are the cart's middle: half its length, a gap and a braking step)
        if (v > 2 && room < (S.yc ? -2 : v * v / (2 * BRAKE) - 0.2)) committed = true;   // (a slow or stopped car never goes on into it)
        else if (room < cartRoom) cartRoom = room;
      }
      for (const p of cartSoft) {   // (the waiting cart's crossing: short of it if it can stop there, else on through and out)
        project(P, s, p.x, p.z, 1, 30, tmpP);
        if (!tmpP.hit || Math.abs(tmpP.lat) > 4.5 || tmpP.along < -LEN / 2) continue;   // (wide: a car that stays put is then clear of
        const room = tmpP.along - car.nose - 3.4;                                        //  every point by more than cartClear's 4.2 m)
        if (room < (S.yc ? -0.5 : v * v / (2 * BRAKE) - 0.2)) committed = true;
        else if (room < cartRoom) cartRoom = room;
      }
      N.yc = !committed && cartRoom < Infinity;
      if (N.yc) { const a = stopSpeed(cartRoom); if (a < vT) { vT = a; why = 'cart'; } }
      // the scooter and the van: a parked one is passed with a bend toward the centre line, a moving one is followed
      for (const o of obstacles) {
        project(P, s, o.x, o.z, 8, 20, tmpP);
        if (!tmpP.hit) continue;
        if (o.moving) {
          // (followed until it's clear of my side: the van pulling into its lay-by is still half in the lane at 1.6 m)
          if (Math.abs(tmpP.lat) < Math.max(1.6, o.halfW + car.halfW + 0.3) && tmpP.along > 0) { const a = followSpeed(o.v, tmpP.along - car.len / 2 - 2 - 1 - (2.5 + v * 0.8)); if (a < vT) { vT = a; why = 'scooter'; } }
        } else {
          const need = o.halfW + car.halfW + 0.35 - Math.abs(tmpP.lat);
          if (need > 0 && tmpP.along > -8 && tmpP.along < 16) swerve = Math.max(swerve, need * smoothstep(-8, -4, tmpP.along) * (1 - smoothstep(10, 16, tmpP.along)));
        }
      }
      // (town-fixes) Kevin on his motorcycle, like any vehicle (his ride is pure: he cannot wait, so the cars do). Riding my way
      // ahead of me in my lane: followed. Across my path or turning into it ahead of my nose: a stop short of him. And where he will
      // be in the next few seconds (`kevSoon`, crossing or turning, not going my way): if I would still be over that spot when he
      // gets there, I stop short of it, or, already too close to stop or standing in his way, drive on out of it.
      N.yk = false; N.yj = false;
      if (kev.on) {
        const mh = tmpA.yaw;   // (the way I move along my path: reversing out of a drive too)
        const mine = Math.abs(wrapAngle(kev.h - mh)) < 0.6;   // (he rides my way now: his next few seconds my way too are followed, not yielded to)
        let ahead = false, cross = Infinity;
        project(P, s, kev.x, kev.z, 2, 30, tmpP);
        if (tmpP.hit && tmpP.along > -car.len / 2) {
          const dh = Math.abs(wrapAngle(kev.h - mh)), al = tmpP.along, la = Math.abs(tmpP.lat);
          if (dh < 0.7 && la < 1.6) {
            ahead = al > 0;
            if (ahead) { const a = followSpeed(kev.v, al - car.len / 2 - 1 - (2.5 + v * 0.8)); if (a < vT) { vT = a; why = 'kevin'; } }
          } else if (dh < 2.4 && la < car.halfW + 1.3 && al - car.nose - 1.6 > -0.5) cross = al - car.nose - 1.6;
        }
        if (!ahead) {
          let room = Infinity, through = false;
          const clr = car.len / 2 + 1.4;
          for (const q of kevSoon) {
            project(P, s, q.x, q.z, car.len, 34, tmpP);
            const qh = tmpP.hit ? Math.abs(wrapAngle(q.h - P.head[tmpP.seg])) : 0;   // (against my path's way there: past a fold too)
            if (qh > 2.4 || (qh < 0.6 && mine)) continue;   // (coming the other way: his own lane; riding my way: behind me, or followed above)
            if (!tmpP.hit || Math.abs(tmpP.lat) > car.halfW + (car.bus ? 3.3 : 1.3) || tmpP.along < -clr) continue;   // (the bus's long nose swings wide in a corner)
            if ((tmpP.along + clr) / Math.max(v, 1) < q.tau - 0.8) continue;   // (going on as I am, I am well clear of it before he gets there)
            const r = tmpP.along - car.nose - 1.8;
            const stopD = v > 0.5 ? v * v / (2 * BRAKE) - 0.2 : -1.5;   // (standing still: I hold short of anything not under my nose)
            if (r < (S.yk ? Math.min(-0.5, stopD) : stopD)) through = true;
            else if (r < room) room = r;
          }
          room = through ? Infinity : Math.min(room, cross);   // (too close to stop for where he will be: on out of his way)
          if (room < Infinity) { N.yk = !through; const a = stopSpeed(room); if (a < vT) { vT = a; why = 'kevin'; } }
          // a junction I am about to enter while he is in it or will be in the next few seconds: I wait at its edge (he turns at
          // them, and a long nose, the bus's, swings across his lane as it turns)
          const wj = P.windows.find(w => s > w.sIn - 16 && s < w.sIn + 1.5);
          if (wj) {
            const J = NODES[wj.id], R2 = (JUNCTION_R + 2) ** 2;
            let inJ = (kev.x - J[0]) ** 2 + (kev.z - J[1]) ** 2 < R2;
            for (let i = 0; i < kevSoon.length && !inJ; i++) inJ = (kevSoon[i].x - J[0]) ** 2 + (kevSoon[i].z - J[1]) ** 2 < R2;
            const r = wj.sIn - car.nose - 0.8 - s;
            if (inJ && r > (S.yj ? -1 : v > 0.5 ? v * v / (2 * BRAKE) - 0.4 : -1)) { N.yj = true; const a = stopSpeed(r); if (a < vT) { vT = a; why = 'kevin'; } }
          }
        }
      }
      // other cars: follow the one ahead in my lane; give way at junctions; yield to the lane before reversing into it
      const win = P.windows.find(w => s > w.sIn - 16 && s < w.sIn + 1.5);
      for (const other of cars) {
        if (other === car) continue;
        const O = prevs[other.i];
        if (O.trip === null) continue;
        project(P, s, O.x, O.z, 2, 26, tmpP);
        const sameWay = Math.abs(wrapAngle(O.yaw - myHead)) < 0.7;
        if (tmpP.hit && sameWay && Math.abs(tmpP.lat) < car.halfW + other.halfW - 0.16 && tmpP.along > 0) {
          const a = followSpeed(O.v, tmpP.along - (car.len + other.len) / 2 - 0.8 - (2.0 + v * 0.8)); if (a < vT) { vT = a; why = 'follow'; }
        }
        if (win && !sameWay && N.wait < WAIT_MAX) {
          // right of way: a car already committed through this junction goes; among the ones still arriving, the lower index goes first
          const ow = O.path?.windows.find(w => w.id === win.id && O.s > w.sIn - 16 && O.s < w.sOut);
          if (ow) {
            const committed = O.s >= ow.sIn + 1.5;
            if (committed || other.i < car.i) { const a = stopSpeed(win.sIn - car.nose - 0.8 - s); if (a < vT) { vT = a; why = 'junction'; } }
          }
        }
        if (rev && s > P.sCurb - 6 && s < P.sCurb && N.wait < 25) { // about to back onto the road: anyone coming along the lane?
          const p0 = P.home.p0, d = Math.hypot(O.x - p0[0], O.z - p0[1]), exitH = Math.atan2(P.home.dir, 0);
          const coming = O.v > 0.4 && Math.abs(wrapAngle(O.yaw - exitH)) < 0.8 && (O.x - p0[0]) * P.home.dir < 2 && Math.abs(O.z - P.home.laneZ) < 1.8;
          if (d < 20 && coming) { const a = stopSpeed(P.sCurb - 1.2 - s); if (a < vT) { vT = a; why = 'yield'; } }
        }
      }
      if (rev && kev.on && s > P.sCurb - 6 && s < P.sCurb && N.wait < 25) {   // (town-fixes: and Kevin on his motorcycle coming either way)
        const p0 = P.home.p0, fx = Math.sin(kev.h), fz = Math.cos(kev.h), hx = P.home.x - kev.x, hz = P.home.laneZ - kev.z, ex = p0[0] - kev.x, ez = p0[1] - kev.z;   // (till he is 4 m past the whole stretch I back over)
        if (Math.hypot(ex, ez) < 40 && Math.max(ex * fx + ez * fz, hx * fx + hz * fz) > -4) { const a = stopSpeed(P.sCurb - 1.2 - s); if (a < vT) { vT = a; why = 'yield'; } }
      }
      // the bus crawls the bay's S curves, waits at the stop until BUS_SCHEDULE.depart (at least minDwell), then pulls out once
      // nothing is coming down the lane behind it
      if (car.bus) {
        if (s > P.sSlow[0] && s < P.sSlow[1]) vT = Math.min(vT, 3.4);
        if (!N.left) {
          vT = Math.min(vT, stopSpeed(P.sStop - s));
          if (N.arr !== null) {
            if (t < N.dep) { vT = 0; why = 'dwell'; }
            else {
              const laneX = NODES.D[0] - LANE;
              let clear = true;
              for (const other of cars) {
                if (other === car) continue;
                const O = prevs[other.i];
                if (O.trip === null || O.v < 0.3 || Math.abs(wrapAngle(O.yaw)) > 0.7) continue;
                if (Math.abs(O.x - laneX) < 2.2 && O.z > BUS_STOP.stop.z - 32 && O.z < BUS_STOP.stop.z + 6) clear = false;
              }
              if (clear) { N.left = true; why = 'go'; } else { vT = 0; why = 'dwell'; }
            }
          }
        }
      }
      N.wait = (why === 'junction' || why === 'yield') && v < 0.3 ? N.wait + DT : (win || rev ? N.wait : 0);
      if (t - N.since > car.maxTrip) { why = 'home'; } // overran its box: straight home (GAP keeps the schedule honest)
      // integrate
      const dv = why === 'home' ? car.cruise - v : vT - v;
      const nv = Math.max(0, v + clamp(dv, -BRAKE * DT, ACC * DT));
      let ns = s + (v + nv) / 2 * DT;
      if (why === 'home' && t - N.since > car.maxTrip + 20) ns = P.L;
      let nvv = nv;
      if (car.bus && !N.left && why !== 'home') {   // (onto the stop exactly, and never past it before it leaves)
        if (ns > P.sStop - 0.15 && nv < 0.7) { ns = P.sStop; nvv = 0; if (N.arr === null) { N.arr = t; N.dep = Math.max(N.trip * car.cycle + BUS_SCHEDULE.offset + BUS_SCHEDULE.depart, t + BUS_SCHEDULE.minDwell); } }
        if (ns > P.sStop) ns = P.sStop;
      }
      N.braking = dv < -0.6 && v > 0.2;
      N.v = nvv; N.s = ns; N.why = why;
      if (car.bus) N.half = BUS.nose;
      N.lat = S.lat + (swerve - S.lat) * Math.min(1, DT * 1.6);
      if (ns >= P.L - 0.01) { const h = car.home; Object.assign(N, { trip: null, s: 0, v: 0, lat: 0, x: h.x, z: h.bayZ, yaw: h.side === 1 ? Math.PI : 0, path: null, why: 'parked' }); car.cur = N; continue; }
      pathAt(P, ns, tmpA);
      const lx = Math.cos(tmpA.yaw), lz = -Math.sin(tmpA.yaw); // left of travel
      N.x = tmpA.x + lx * N.lat; N.z = tmpA.z + lz * N.lat; N.yaw = ns < P.sFold ? tmpA.yaw + Math.PI : tmpA.yaw;
      car.cur = N;
    }
    for (let i = 0; i < cars.length; i++) cars[i].prev = prevs[i];
    simK = k;
    inStep = false;
  }
  function ensure(k) {
    const t = k * DT;
    if (simK === null || k < simK - 1 || k - simK > (EPOCH_BACK + 120) / DT) reset(t);
    while (simK < k) step();
  }

  // ---------------------------------------------------------------- rendering
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: poolTexture(), color: '#ffe3a8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), cars.length);
  pools.layers.set(LAYER_SOFT); pools.frustumCulled = false; pools.renderOrder = 2; pools.name = 'headlight-pools';
  group.add(pools);
  // ---- lamp glows: a soft additive sprite on every indicator, tail and headlight, so a blink reads from down the street
  // (indicators always; brake lights; tails and headlights at night). Sprites keep a minimum size on screen.
  const NG = GLOW_LAMPS.length, gN = cars.length * NG;
  const gGeo = new THREE.BufferGeometry();
  const gPos = new Float32Array(gN * 3), gCol = new Float32Array(gN * 3), gOn = new Float32Array(gN), gSize = new Float32Array(gN);
  const GLOW = { ind: [[1, 0.5, 0.06], 1.0], side: [[1, 0.5, 0.06], 0.7], tail: [[1, 0.16, 0.1], 0.75], head: [[1, 0.92, 0.7], 1.3] };
  cars.forEach((c, ci) => c.model.glows.forEach((gl, k) => { const j = ci * NG + k, G = GLOW[gl[3]]; gCol.set(G[0], j * 3); gSize[j] = G[1]; }));
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute('aCol', new THREE.BufferAttribute(gCol, 3));
  gGeo.setAttribute('aOn', new THREE.BufferAttribute(gOn, 1).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute('aSize', new THREE.BufferAttribute(gSize, 1));
  const gMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 500 }, uMin: { value: 7 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute vec3 aCol; attribute float aOn, aSize; uniform float uScale, uMin; varying vec3 vCol; varying float vOn; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float px = aSize * uScale / max(0.2, -mv.z); gl_PointSize = aOn > 0.01 ? max(px, uMin) * (0.75 + 0.25 * aOn) : 0.0; vCol = aCol; vOn = aOn; }',
    fragmentShader: 'varying vec3 vCol; varying float vOn; void main() { float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard; float core = 1.0 - smoothstep(0.22, 0.36, r), halo = pow(1.0 - r, 1.6); gl_FragColor = vec4(vCol * (core * 2.6 + halo * 1.5) * vOn, 1.0); }',
  });
  const glowPts = new THREE.Points(gGeo, gMat);
  glowPts.frustumCulled = false; glowPts.layers.set(LAYER_SOFT); glowPts.renderOrder = 3; glowPts.name = 'car-lamp-glows';
  group.add(glowPts);
  const GV = new THREE.Vector3(), DB = new THREE.Vector2();
  const forced = [];
  // the lamp state handed to applyLamps and glowCar (both copy what they need, so one scratch object serves every car)
  const LS = { night: false, brake: false, rev: false, ind: 0, blink: false, on: false };
  const lampState = (night, brake, rev, ind, blink, on) => { LS.night = night; LS.brake = brake; LS.rev = rev; LS.ind = ind; LS.blink = blink; LS.on = on; return LS; };
  // write one car's glow sprites from its lamp state (call after the car is placed)
  function glowCar(car, L) {
    const g = car.model.g, base = car.i * NG, G = car.model.glows;
    g.updateMatrix();
    const headOn = L.on && L.night, li = L.ind > 0 && L.blink ? 1 : 0, ri = L.ind < 0 && L.blink ? 1 : 0;
    for (let k = 0; k < NG; k++) {
      const gl = G[k], j = base + k;
      GV.set(gl[0], gl[1], gl[2]).applyMatrix4(g.matrix);
      gPos[j * 3] = GV.x; gPos[j * 3 + 1] = GV.y; gPos[j * 3 + 2] = GV.z;
      const left = (k & 1) === 0; // GLOW_LAMPS alternates left, right
      gOn[j] = gl[3] === 'ind' || gl[3] === 'side' ? (left ? li : ri) : gl[3] === 'tail' ? (L.brake ? 1 : headOn ? 0.32 : 0) : headOn ? 0.55 : 0;
    }
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V3 = new THREE.Vector3(), SC = new THREE.Vector3(), E = new THREE.Euler();
  const rA = { i: 0 }, rP = { hit: false, along: 0, lat: 0, dist: 0 };
  const engines = []; // a pool of three engine loops for the nearest moving cars
  let lastHornT = 0;

  function update(dt, now) {
    const t = net.serverNow() / 1000, k = Math.floor(t / DT);
    ensure(k + 1);
    const u = (t - k * DT) / DT;
    const night = LIGHT.night, lampK = smoothstep(0.15, 0.6, night);
    const blink = (now * 1.5) % 1 < 0.55; // 1.5 Hz, a little longer on than off
    renderer.getDrawingBufferSize(DB);
    gMat.uniforms.uScale.value = DB.y / (2 * Math.tan(camera.fov * Math.PI / 360));
    gMat.uniforms.uMin.value = 13 * renderer.getPixelRatio(); // a blink stays a visible dot far down the street
    const px = player.pos.x, pz = player.pos.z;
    pools.visible = lampK > 0.02;
    pools.material.opacity = lampK * 0.5;
    for (const car of cars) {
      const A = car.prev, B = car.cur, g = car.model.g;
      if (car.bus) g.visible = B.trip !== null;   // (in the tunnel between trips: out of sight; bus.js hides it in the dark too)
      if (B.trip === null || A.trip !== B.trip) {
        // parked (or the first/last step of a trip): sit exactly where the state says
        g.position.set(B.x, streetY(B.x, B.z), B.z); g.rotation.set(0, B.yaw, 0);
        car.back = 0; car.backV = 0; car.blockT = 0;
        const Lp = lampState(night > 0.5, false, false, forced[car.i] || 0, blink, B.trip !== null);
        applyLamps(car.model, Lp); glowCar(car, Lp);
        SC.set(0, 0, 0); pools.setMatrixAt(car.i, M.compose(V3.set(0, -5, 0), Q.identity(), SC));
        continue;
      }
      const P = B.path;
      const sShared = A.s + (B.s - A.s) * u, vShared = A.v + (B.v - A.v) * u, lat = A.lat + (B.lat - A.lat) * u;
      // ---- the local brake: if you stand in this car's lane ahead, it stops short of you (and leans on the horn)
      let backT = 0;
      project(P, sShared - car.back, px, pz, 1, 16, rP);
      const rev = sShared - car.back < P.sFold, docked = car.bus && !B.left && A.arr !== null && B.arr !== null;   // (a bus at its stop never backs off)
      if (rP.hit && !rev && !docked && Math.abs(rP.lat - lat) < 1.5 && rP.along > -1) {
        const room = rP.along - car.nose - 1.5; // how far the rendered car may still go
        backT = clamp(car.back - room, 0, 45);
        car.blockT += dt;
      } else car.blockT = 0;
      // ease: the car can lose ground only as fast as it is moving (so it decelerates) and catch up at a gentle pace
      if (backT > car.back) car.back = Math.min(backT, car.back + Math.max(0.3, vShared) * dt);
      else car.back = Math.max(backT, car.back - (3.0 + vShared * 0.5) * dt);
      if (car.back >= 45 && car.blockT > 6) car.back = Math.max(0, car.back - 0.6 * dt); // past the bound (six seconds of patience) it creeps on through
      const sR = clamp(sShared - car.back, 0, P.L);
      const vR = Math.max(0, vShared - (car.back > car.backV ? (car.back - car.backV) / Math.max(dt, 1e-3) : 0));
      const localBrake = car.back - car.backV > 0.01 * dt;
      car.backV = car.back;
      if (car.blockT > 1.1 && now - car.hornAt > 3.5 && now - lastHornT > 0.6) { car.hornAt = now; lastHornT = now; audio.play?.('car-horn', g.position.x, 0.8, g.position.z, { long: car.blockT > 4 }); }
      if (localBrake && car.blockT > 0 && car.blockT < dt * 1.5 && vShared > 3) audio.play?.('car-brake', g.position.x, 0.4, g.position.z);
      // ---- place it
      pathAt(P, sR, rA);
      const reversing = sR < P.sFold;
      const yaw = reversing ? rA.yaw + Math.PI : rA.yaw;
      const lx = Math.cos(rA.yaw), lz = -Math.sin(rA.yaw);
      const bob = Math.sin(sR * 2.1) * 0.012 + Math.sin(sR * 5.3 + car.i) * 0.006;
      g.position.set(rA.x + lx * lat, rA.y + bob, rA.z + lz * lat);
      // lean into the corner, dip the nose when braking, lift it when pulling away
      const turnDir = Math.sign(wrapAngle(P.head[Math.min(P.n - 1, rA.i + 2)] - P.head[rA.i]) || 0);
      const roll = turnDir * rA.curv * vR * vR * 0.045, pitch = (B.braking || localBrake ? 0.035 : 0) - Math.max(0, B.v - A.v) * 0.12;
      E.set(pitch, yaw, roll, 'YXZ'); g.rotation.copy(E);
      // wheels: roll with the ground covered, the front axle steers with the path's curvature
      const ds = vR * dt * (reversing ? -1 : 1);
      car.wheel += ds / car.model.wheelR;
      const steer = Math.atan(2.6 * rA.curv) * turnDir * (reversing ? -1 : 1);
      car.model.axles[0].steer.rotation.y = steer;
      for (const ax of car.model.axles) ax.roll.rotation.x = car.wheel;
      // lamps: headlights at night, brake lights, indicators before a turn, reversing lamps
      const nextTurn = P.windows.find(w => w.turn && sR > w.sIn - 14 && sR < w.sOut - 4);
      const Ld = lampState(night > 0.5, B.braking || localBrake || (B.v < 0.05 && !reversing && sR < P.L - 0.5), reversing, forced[car.i] || (nextTurn ? nextTurn.turn : 0), blink, true);
      applyLamps(car.model, Ld); glowCar(car, Ld);
      // the headlight pool on the road ahead (none while reversing: those are the little white lamps)
      if (pools.visible && !reversing) {
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        E.set(0, yaw, 0, 'YXZ'); Q.setFromEuler(E);
        pools.setMatrixAt(car.i, M.compose(V3.set(g.position.x + fx * (car.nose + 2.4), rA.y + 0.05, g.position.z + fz * (car.nose + 2.4)), Q, SC.set(3.6, 1, 6.4)));
      } else pools.setMatrixAt(car.i, M.compose(V3.set(0, -5, 0), Q.identity(), SC.set(0, 0, 0)));
      car.vR = vR;
      // the bus deep in the tunnel: its back end past the last dark veil, out of sight, lamps and all
      if (car.bus && g.position.x + BUS.L / 2 < BUS_TUNNEL.x - 13.5) { g.visible = false; for (let k = 0; k < NG; k++) gOn[car.i * NG + k] = 0; pools.setMatrixAt(car.i, M.compose(V3.set(0, -5, 0), Q.identity(), SC.set(0, 0, 0))); }
    }
    pools.instanceMatrix.needsUpdate = true;
    gGeo.attributes.position.needsUpdate = true; gGeo.attributes.aOn.needsUpdate = true;
    // ---- engines: the three nearest moving cars hum (ambience bus), louder and higher as they go faster
    if (audio.ctx && audio.amb) {
      const moving = cars.filter(c => c.cur.trip !== null).map(c => [Math.hypot(c.model.g.position.x - px, c.model.g.position.z - pz), c]).filter(e => e[0] < 48).sort((a, b) => a[0] - b[0]).slice(0, 3);
      for (const e of engines) if (!moving.some(m => m[1] === e.car)) { e.loop.stop(); e.car.engine = null; }
      engines.length = 0;
      for (const [, c] of moving) {
        if (!c.engine) c.engine = engineLoop(audio, c.model.g.position.x, 0.5, c.model.g.position.z);
        const sp = c.vR || 0, k2 = clamp(sp / 8, 0, 1);
        c.engine.set(c.model.g.position.x, 0.5, c.model.g.position.z, k2, 0.035 + k2 * 0.06); // (a bed: about -31 dBFS RMS at 6 m, tools/audio-levels.mjs --only town)
        engines.push({ car: c, loop: c.engine });
      }
    }
  }

  // run the replay once now, inside the loading screen, so the first frame of play does not pay for it
  try { ensure(Math.floor(net.serverNow() / 1000 / DT) + 1); } catch (e) { console.error('[cars] first replay', e); }

  const bodiesOut = [];
  return {
    name: 'cars',
    update,
    bodies() {
      bodiesOut.length = 0;
      const px = player.pos.x, pz = player.pos.z;
      for (const c of cars) {
        const p = c.model.g.position;
        if (c.bus) {   // (the bus: a row of bigger circles; at its stop bus.js makes its walls solid instead, so you can walk in)
          if (!c.model.g.visible || c.docked || Math.abs(p.x - px) > 9 || Math.abs(p.z - pz) > 9) continue;
          const fx = Math.sin(c.model.g.rotation.y), fz = Math.cos(c.model.g.rotation.y);
          for (const k of [-4.1, -2.75, -1.4, 0, 1.4, 2.75, 4.1]) bodiesOut.push({ x: p.x + fx * k, z: p.z + fz * k, r: 1.3 });
          continue;
        }
        if (Math.abs(p.x - px) > 7 || Math.abs(p.z - pz) > 7) continue;
        const fx = Math.sin(c.model.g.rotation.y), fz = Math.cos(c.model.g.rotation.y);
        for (const k of [-1.05, 0, 1.05]) bodiesOut.push({ x: p.x + fx * k, z: p.z + fz * k, r: 0.98 });
      }
      street.vehicleBodies?.(bodiesOut, px, pz); // the mail van and the pizza scooter (mailman.js) are solid too
      return bodiesOut;
    },
    // for the tests (tools/cars-*.mjs): the shared state of every car at the last simulated step, and a few knobs
    api: {
      DT, cars, homes,
      bus,                     // (the town bus, cars' last; bus.js reads its state and model)
      busPath,
      snapshot() { return cars.map(c => ({ i: c.i, trip: c.cur.trip, s: +c.cur.s.toFixed(6), v: +c.cur.v.toFixed(6), lat: +c.cur.lat.toFixed(6), x: +c.cur.x.toFixed(5), z: +c.cur.z.toFixed(5), yaw: +c.cur.yaw.toFixed(6), why: c.cur.why, rx: +c.model.g.position.x.toFixed(4), rz: +c.model.g.position.z.toFixed(4), back: +c.back.toFixed(3) })); },
      get simK() { return simK; },
      resetNow() { simK = null; },
      cartSoon: () => cartSoon.map(p => [+p.x.toFixed(2), +p.z.toFixed(2)]),   // (where the cars yield to Joyce's cart this step)
      cartWait: () => cartD,                                                    // (how long the cart has waited at its gates this trip)
      forceInd(i, dir) { forced[i] = dir; }, // tests: hold car i's indicator on (+1 left, -1 right, 0 as driven)
      showLamps(i, L) { const c = cars[i], st = { ...c.model.state, ...L }; applyLamps(c.model, st, true); glowCar(c, st); gGeo.attributes.position.needsUpdate = true; gGeo.attributes.aOn.needsUpdate = true; }, // tests: after moving a car by hand
    },
  };
}
void TAU;
