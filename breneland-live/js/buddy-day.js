// Buddy and Carol's day, a pure function of the shared clock (hash01 / mulberry32 only, no Math.random), so every visitor sees
// them in the same place doing the same thing (docs/briefs/buddy-carol.md). Eastern time:
//   7:00-9:00    laps of town and the park together, Buddy on his cane
//   9:00-15:30   crafting in the garage
//   15:30        the pickup to Strickler Park (reversed into layout.js TRUCK_BAY), the walk over, and the setup
//   15:45-20:00  the booth. Now and then a neighbour who's home by their own timetable comes by and may buy the tripod wreath
//                (it hangs on their door for two weeks)
//   20:00        pack up and drive home
// familyAt(t) -> { phase, buddy, carol, truck, booth, garage } (see the bottom). Positions are world metres; a person's
// state is { x, z, yaw, speed, anim, hidden, seatY, cane, carry }. boothXZ / boothYaw turn the booth's own frame into the world.
import { hash01, mulberry32, alongPolyline, polylineLength, wrapAngle } from './util.js';
import { hourAt, sinceHour } from './npcs-day.js';
import { BOOTH, CAROL_HOME, TRUCK_BAY, PARK_LOT, ROADS, LANE_OFFSET, SIDEWALK_W } from './layout.js';
import { TOWN_HOUSES } from './world-town.js';
import { residentStates } from './town-life.js';
import { NPCS, TOWN_RESIDENTS } from './npc-looks.js';
import { easternDay, tripodDesign, N_DESIGNS } from './wreath-data.js';

export const HOURS = { walk: 7, craft: 9, leave: 15.5, open: 15.75, pack: 20 };
const WALK_V = 0.8;          // the morning walk: gentle, Buddy has his cane
const STEP_V = 1.05;         // about the house, the truck and the booth
const SIDE = 0.42;           // side by side: each this far either side of the path
const TAU = Math.PI * 2;
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const clamp01 = u => (u < 0 ? 0 : u > 1 ? 1 : u);

// ------------------------------------------------------------------ the booth's own frame (layout.js BOOTH)
// local +z = the front (toward the path), local +x = the right hand of someone standing in front looking at the booth
const BC = Math.cos(BOOTH.yaw), BS = Math.sin(BOOTH.yaw);
export function boothXZ(lx, lz) { return [BOOTH.x + lx * BC + lz * BS, BOOTH.z - lx * BS + lz * BC]; }
export const boothYaw = ly => ly + BOOTH.yaw;
export function boothLocal(x, z) { const dx = x - BOOTH.x, dz = z - BOOTH.z; return [dx * BC - dz * BS, dx * BS + dz * BC]; }
export const TRIPOD = boothXZ(BOOTH.tripod.x, BOOTH.tripod.z);
// Buddy's camp chair, in the booth's frame: its seat top (seatY), half width (W, to the side tubes), the front and back rails
// (zf, zb, from lx/lz) and the armrests' top (armY). Low and roomy enough for his short legs (bodies-poses.js chairLegs /
// chairArms, params.chair).
export const CHAIR = { lx: 2.15, lz: 0.55, seatY: 0.3, W: 0.48, zf: 0.18, zb: -0.2, armY: 0.705, armZ: [-0.25, 0.32] };
// The chair's solid parts as boxes in its own frame (x across, y up from the ground, z forward; add lx / lz for the booth's
// frame): the tests check that none of Buddy's leg or arm bones passes through them.
export function chairBoxes() {
  const { W, zf: F, zb: B, seatY: S, armY: A, armZ: Z } = CHAIR, t = 0.03, out = [];
  out.push({ name: 'front X', x0: -W - t, x1: W + t, y0: 0, y1: S, z0: F - t, z1: F + t }, { name: 'back X', x0: -W - t, x1: W + t, y0: 0, y1: S, z0: B - t, z1: B + t });
  out.push({ name: 'seat', x0: -W, x1: W, y0: S - 0.07, y1: S - 0.005, z0: B, z1: F }, { name: 'back', x0: -W, x1: W, y0: S + 0.05, y1: S + 0.62, z0: B - 0.22, z1: B - 0.05 });
  for (const s of [-1, 1]) {
    const x0 = s * W - t, x1 = s * W + t;
    out.push({ name: 'side X', x0, x1, y0: 0, y1: S, z0: B, z1: F }, { name: 'front post', x0, x1, y0: 0, y1: A - 0.05, z0: F - t, z1: F + t },
      { name: 'back post', x0, x1, y0: 0, y1: 1.0, z0: B - 0.15, z1: B + t }, { name: 'armrest', x0: s * W - 0.045, x1: s * W + 0.045, y0: A - 0.065, y1: A - 0.005, z0: Z[0], z1: Z[1] });
  }
  return out;
}
export const POST = { lx: 0.1, lz: 1.95 };

// The day the booth belongs to (an Eastern calendar day, from noon to noon: the booth runs in the afternoon and evening)
export const boothDay = t => easternDay(sinceHour(t, 12) * 1000);

// ------------------------------------------------------------------ their house (world-town.js TOWN_HOUSES)
let HOME = null;
export function homeOf() {
  if (HOME) return HOME;
  const row = TOWN_HOUSES.filter(h => h.facing === -1);
  if (!row.length) return null;
  const H = row.slice().sort((a, b) => Math.abs(a.x - CAROL_HOME.x) - Math.abs(b.x - CAROL_HOME.x))[0];
  const fz = H.z - H.d / 2;                       // the front wall (the door looks north onto Summit Rd)
  const gx1 = H.x - H.w / 2 - 0.05, gx0 = gx1 - 4.4, gz0 = fz, gz1 = fz + 6.6; // the garage, against the west wall
  const walkZ = -126.5 + 4.5 + SIDEWALK_W;       // the back of Summit Rd's south sidewalk
  const bay = { x: gx0 - 1.0, z: fz - 2.7, yaw: 0 }; // the pickup: nose toward the house, beside the garage door
  HOME = {
    house: H, index: TOWN_HOUSES.indexOf(H), fz, walkZ,
    garage: { x0: gx0, x1: gx1, z0: gz0, z1: gz1, cx: (gx0 + gx1) / 2 },
    drive: { x0: gx0 - 2.4, x1: gx1, z0: walkZ, z1: fz },
    door: [H.door.x, H.door.z], curb: [H.door.x, -120.5], bay,
    bench: { buddy: [gx0 + 1.25, gz1 - 1.15], carol: [gx0 + 3.05, gz1 - 1.15] },
    shelf: [gx0 + 0.75, gz0 + 2.6], pegs: [gx0 + 2.2, gz1 - 1.0],
    driverDoor: [bay.x + 1.2, bay.z + 0.45], passDoor: [bay.x - 1.2, bay.z + 0.45],
  };
  return HOME;
}

// ------------------------------------------------------------------ lanes (the same idea as cars.js: right-hand traffic)
export function offsetRight(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)];
    let d0x = p[0] - a[0], d0z = p[1] - a[1], d1x = c[0] - p[0], d1z = c[1] - p[1];
    const L0 = Math.hypot(d0x, d0z) || 1, L1 = Math.hypot(d1x, d1z) || 1;
    d0x /= L0; d0z /= L0; d1x /= L1; d1z /= L1;
    if (i === 0) { d0x = d1x; d0z = d1z; } if (i === pts.length - 1) { d1x = d0x; d1z = d0z; }
    let nx = -(d0z + d1z), nz = d0x + d1x;
    const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const cosHalf = Math.max(0.4, nx * -d0z + nz * d0x);
    out.push([p[0] + nx * d / cosHalf, p[1] + nz * d / cosHalf]);
  }
  return out;
}
export function roundCorners(pts, R = 5.5) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], p = pts[i], c = pts[i + 1];
    const L0 = Math.hypot(p[0] - a[0], p[1] - a[1]), L1 = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const ang = Math.abs(wrapAngle(Math.atan2(c[0] - p[0], c[1] - p[1]) - Math.atan2(p[0] - a[0], p[1] - a[1])));
    if (ang < 0.12) { out.push(p); continue; }
    const r = Math.min(R, L0 * 0.45, L1 * 0.45), n = ang > 1.2 ? 8 : 4;
    const s = [p[0] + (a[0] - p[0]) * r / L0, p[1] + (a[1] - p[1]) * r / L0], e = [p[0] + (c[0] - p[0]) * r / L1, p[1] + (c[1] - p[1]) * r / L1];
    for (let k = 0; k <= n; k++) {
      const u = k / n, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
      out.push([w0 * s[0] + w1 * p[0] + w2 * e[0], w0 * s[1] + w1 * p[1] + w2 * e[1]]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// A drive along pts with a speed profile (cruise, slower in corners, smooth starts and stops): { pts, cum, tv, L, T, rev }
export function drive(pts, { V = 6.2, rev = false, vAt = null } = {}) {
  const n = pts.length, cum = [0], v = new Array(n).fill(rev ? 1.4 : V);
  if (vAt) for (let i = 0; i < n; i++) v[i] = Math.min(v[i], vAt(pts[i][0], pts[i][1]));
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  for (let i = 1; i < n - 1; i++) {
    const h0 = Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]), h1 = Math.atan2(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    const curv = Math.abs(wrapAngle(h1 - h0)) / Math.max(0.3, (cum[i + 1] - cum[i - 1]) / 2);
    v[i] = Math.min(v[i], Math.sqrt(2.0 / Math.max(curv, 1e-3)));
  }
  v[0] = 0; v[n - 1] = 0;
  for (let i = 1; i < n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * 1.6 * (cum[i] - cum[i - 1])));
  for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * 2.6 * (cum[i + 1] - cum[i])));
  const tv = [0];
  for (let i = 1; i < n; i++) tv.push(tv[i - 1] + (cum[i] - cum[i - 1]) / Math.max(0.35, (v[i] + v[i - 1]) / 2));
  return { pts, cum, v, tv, L: cum[n - 1], T: tv[n - 1], rev };
}
// where a drive is u seconds in: { x, z, yaw, v, rev }
export function driveAt(D, u) {
  const n = D.pts.length;
  if (u <= 0) u = 0;
  if (u >= D.T) u = D.T;
  let lo = 0, hi = n - 1;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (D.tv[m] <= u) lo = m; else hi = m; }
  const dt = D.tv[hi] - D.tv[lo], k = dt > 1e-6 ? (u - D.tv[lo]) / dt : 1;
  // constant acceleration inside the segment: distance s = v0 t + (v1 - v0) t^2 / (2 dt)
  const v0 = D.v[lo], v1 = D.v[hi], tt = k * dt, ds = D.cum[hi] - D.cum[lo];
  let s = dt > 1e-6 ? v0 * tt + (v1 - v0) * tt * tt / (2 * dt) : ds;
  const sAvg = dt > 1e-6 ? (v0 + v1) / 2 * dt : ds;
  s = sAvg > 1e-6 ? s * ds / sAvg : ds * k;
  const a = D.pts[lo], b = D.pts[hi], f = ds > 1e-6 ? Math.min(1, Math.max(0, s / ds)) : 1;
  const x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
  let yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
  if (D.rev) yaw += Math.PI;
  return { x, z, yaw, v: v0 + (v1 - v0) * k, rev: D.rev, s: D.cum[lo] + s };
}

let ROUTES = null;
// points every `step` metres along a polyline (the speed profile needs them on a straight)
export function dense(pts, step = 1) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  return out;
}
// a circular arc about (cx, cz): the points (cx + r cos a, cz + r sin a) for a from a0 to a1
function arc(cx, cz, r, a0, a1, n = 8) { const out = []; for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } return out; }
// in the lot and its driveway: walking pace
const lotSlow = (x, z) => (z > -45 && x > PARK_LOT.minX - 2 && x < PARK_LOT.maxX + 2 ? 2.4 : 99);
// The drives: back (reverse out of the drive at home), out (round Breneland Rd to the park lot, swinging into the keep-clear bay's
// mouth), park (straight back into TRUCK_BAY), and home (nose first out of the bay, up Maple Ave, Summit Rd west, in at the
// drive). Every turn across traffic is a right turn into or out of the nearest lane, and the parked truck is off the road.
export function routes() {
  if (ROUTES) return ROUTES;
  const H = homeOf(); if (!H) return null;
  const b = H.bay, bren = ROADS.find(r => r.id === 'breneland-rd').pts, SZ = -126.5, BZ = -48.5;
  const laneN = SZ - LANE_OFFSET, laneE = BZ + LANE_OFFSET, AX = PARK_LOT.aisleX, TB = TRUCK_BAY;
  const back = drive([[b.x, b.z], [b.x, H.walkZ - 0.4], [b.x + 0.4, -122.4], [b.x + 1.8, -125.6], [b.x + 3.8, -127.9], [b.x + 5.6, laneN]], { rev: true });
  const centre = [[b.x + 5.6, SZ], ...bren.slice().reverse().slice(0, -1).filter(p => p[0] < -60), [-50, BZ]];
  const bend = roundCorners(offsetRight(centre, LANE_OFFSET)).filter(p => !(p[1] > BZ && p[0] > -86.5));
  // round Pat's van (parked by the curb at x = -78 most of the working day): ease toward the centre line and back
  const straight = [];
  for (let x = bend[bend.length - 1][0] + 2; x < -68.6; x += 2) straight.push([x, laneE - 1.5 * smooth(-89, -84, x) * (1 - smooth(-75, -71, x))]);
  const R1 = 4, R2 = 3, zs = TB.z - R2;
  const turnIn = arc(-68.5, laneE + R1, R1, -Math.PI / 2, 0);                          // east -> south, into the driveway
  const swing = arc(AX - R2, zs, R2, 0, Math.PI / 2);                                  // south -> west, into the keep-clear bay
  const out = drive([...bend, ...straight, ...turnIn, ...dense([[AX, laneE + R1], [AX, zs]], 1.5).slice(1), ...swing.slice(1)], { vAt: lotSlow });
  const park = drive(dense([swing[swing.length - 1], [TB.x, TB.z]], 0.7), { rev: true });
  const R3 = 3.5, R4 = 4;
  const exitArc = arc(AX + R3, TB.z - R3, R3, Math.PI / 2, Math.PI);                   // west -> north, out of the bay
  const toRoad = arc(AX + R4, laneE + R4, R4, Math.PI, Math.PI * 1.5);                 // north -> east, into the eastbound lane
  const homeCentre = [[-53, BZ], [-20, BZ], [-20, SZ], [b.x + 6.5, SZ]];
  const hl = roundCorners(offsetRight(homeCentre, LANE_OFFSET));
  const home = drive([...dense([[TB.x, TB.z], exitArc[0]], 0.8), ...exitArc.slice(1), ...dense([[AX, TB.z - R3], [AX, laneE + R4]], 1.5).slice(1), ...toRoad.slice(1), ...hl,
    [b.x + 4.2, laneN + 0.45], [b.x + 2.0, -126.7], [b.x + 0.6, -124.2], [b.x + 0.1, -121.6], [b.x, H.walkZ + 0.6], [b.x, b.z]], { vAt: lotSlow });
  ROUTES = { back, out, park, home };
  return ROUTES;
}

// ------------------------------------------------------------------ plans: segments over u (seconds since the plan's hour)
//   walk  { pts, len, v, lat }       along a path (lat: metres to the right of it, for walking side by side)
//   still { x, z, yaw, anim, seatY }  standing (or sitting) doing something
//   gone  { }                         out of sight (indoors, in the truck)
function planner() {
  const segs = []; let u = 0;
  const P = {
    segs,
    get u() { return u; }, set u(v) { u = v; },
    walk(pts, o = {}) { const len = polylineLength(pts), v = o.v || STEP_V; segs.push({ kind: 'walk', t0: u, t1: u + len / v, pts, len, v, lat: 0, ...o }); u += len / v; return pts[pts.length - 1]; },
    still(dur, x, z, yaw, anim, o = {}) { segs.push({ kind: 'still', t0: u, t1: u + dur, x, z, yaw, anim, ...o }); u += dur; },
    gone(dur, o = {}) { segs.push({ kind: 'gone', t0: u, t1: u + dur, ...o }); u += dur; },
    until(t1, x, z, yaw, anim, o) { if (t1 > u) P.still(t1 - u, x, z, yaw, anim, o); },
  };
  return P;
}
function segAt(segs, u) {
  let lo = 0, hi = segs.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (segs[m].t0 <= u) lo = m; else hi = m - 1; }
  return segs[lo];
}
function personAt(segs, u, extra) {
  const s = segAt(segs, u);
  if (!s || s.kind === 'gone') return { hidden: true, x: 0, z: 0, yaw: 0, speed: 0, anim: 'idle', ...extra };
  if (s.kind === 'walk') {
    const d = Math.min(s.len, Math.max(0, (u - s.t0) * s.v));
    const [x, z, dx, dz] = alongPolyline(s.pts, d), moving = d < s.len - 1e-6;
    return { x: x - dz * s.lat, z: z + dx * s.lat, yaw: Math.atan2(dx, dz), speed: moving ? s.v : 0, anim: moving ? null : (s.endAnim || 'idle'), cane: !!s.cane, carry: s.carry || null, seatY: 0, ...extra };
  }
  return { x: s.x, z: s.z, yaw: s.yaw, speed: 0, anim: s.anim, cane: !!s.cane, carry: s.carry || null, seatY: s.seatY || 0, line: s.line || null, ...extra };
}
const loc = (lx, lz) => boothXZ(lx, lz);
const cache = (m, key, make) => { let v = m.get(key); if (!v) { v = make(); m.set(key, v); if (m.size > 6) m.delete(m.keys().next().value); } return v; };

// ---- the morning walk (from 7:00): out of the front door, laps of town and the park, home by 8:55
const LOOP_PARK = [[-89, -54.4], [-91, -54.5], [-91.6, -42.6], [-92, -41.4], [-87, -33], [-82, -27], [-64, -19], [-52, -13], [-57, -2], [-60, 11]];
let LOOP = null;
function walkLoop() {
  if (LOOP) return LOOP;
  const H = homeOf();
  const bren = ROADS.find(r => r.id === 'breneland-rd').pts;
  // the inner (north and east) sidewalk round Breneland Rd's bend, up to Summit Rd
  const inner = roundCorners(offsetRight(bren.filter(p => p[0] < -80), 4.5 + 1.6)).filter(p => p[1] > -120.5 && p[1] < -54.5);
  const there = LOOP_PARK, back = LOOP_PARK.slice(0, -1).reverse();
  LOOP = [H.curb, [-26.4, -121.0], [-26.4, -54.0], ...there, ...back, ...inner, [-101.4, -120.5], H.curb];
  return LOOP;
}
const morningCache = new Map();
function morning(day) {
  return cache(morningCache, day, () => {
    const H = homeOf(), loop = walkLoop(), rnd = mulberry32(Math.floor(hash01('bc-walk', day) * 4294967296));
    const B = planner(), C = planner();
    const both = (fn) => { fn(B, SIDE); fn(C, -SIDE); };
    both((P, lat) => { P.still(6, H.door[0] + lat, H.door[1], Math.PI, 'idle', { cane: P === B }); P.walk([H.door, H.curb], { v: WALK_V, lat, cane: P === B }); });
    const len = polylineLength(loop), END = 6900 - polylineLength([H.curb, H.door]) / WALK_V - 30;
    let lap = 0;
    while (B.u + len / WALK_V + 120 < END && lap < 30) {
      // a lap in three legs with a chat stop between them (a neighbour, the view, a breather on the park path)
      const cuts = [0.22 + rnd() * 0.2, 0.55 + rnd() * 0.2].map(f => f * len);
      let d0 = 0;
      for (let k = 0; k <= cuts.length; k++) {
        const d1 = k < cuts.length ? cuts[k] : len;
        const pts = [];
        for (let d = d0; d < d1; d += 2) pts.push(alongPolyline(loop, d).slice(0, 2));
        pts.push(alongPolyline(loop, d1).slice(0, 2));
        both((P, lat) => P.walk(pts, { v: WALK_V, lat, cane: P === B }));
        if (k < cuts.length) {
          const [x, z, dx, dz] = alongPolyline(loop, d1), dur = 18 + rnd() * 30, yaw = Math.atan2(dx, dz);
          const banter = rnd();
          B.still(dur, x - dz * SIDE, z + dx * SIDE, yaw + 0.6, banter < 0.5 ? 'talk' : 'laugh', { cane: true });
          C.still(dur, x + dz * SIDE, z - dx * SIDE, yaw - 0.6, banter < 0.5 ? 'laugh' : 'wave');
        }
        d0 = d1;
      }
      lap++;
    }
    both((P, lat) => P.walk([H.curb, H.door], { v: WALK_V, lat, cane: P === B }));
    const end = Math.max(B.u, C.u);
    both(P => P.gone(99999));
    return { b: B.segs, c: C.segs, end, laps: lap };
  });
}

// ---- the garage (9:00 to 15:30): small jobs at the bench in 20 s beats (their own pick of jobs each beat)
const BENCH_B = ['read', 'read', 'point', 'talk', 'drink', 'read', 'laugh', 'look'];
const BENCH_C = ['read', 'read', 'talk', 'point', 'laugh', 'read', 'look', 'garden'];
function craftAt(u, t) {
  const H = homeOf(), g = H.garage, k = Math.floor(t / 20);
  const yawB = Math.PI * 0, B0 = H.bench.buddy, C0 = H.bench.carol;
  const pick = (who, list, kk) => list[Math.floor(hash01('bc-bench', who, kk) * list.length)];
  // now and then Carol fetches ribbon from the shelf or a form off the pegboard, Buddy wanders to the door for the air
  const away = (who, kk) => hash01('bc-away', who, kk) < (who === 'c' ? 0.16 : 0.08);
  const spot = (who, kk) => {
    if (!away(who, kk)) return who === 'c' ? [C0[0], C0[1], 0] : [B0[0], B0[1], yawB];
    return who === 'c' ? [H.shelf[0] + 0.55, H.shelf[1], -Math.PI / 2] : [g.cx, g.z0 + 0.9, Math.PI];
  };
  const one = (who, list) => {
    const a = spot(who, k - 1), b = spot(who, k), uu = t - k * 20, d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (u < 8) return { x: b[0], z: b[1], yaw: b[2], speed: 0, anim: 'idle' };   // (the door is going up)
    if (d > 0.05 && uu < d / 0.9) { const f = uu / (d / 0.9); return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, yaw: faceTo(a[0], a[1], b[0], b[1]), speed: 0.9, anim: null }; }
    const anim = away(who, k) ? (who === 'c' ? 'point' : 'look') : pick(who, list, k);
    return { x: b[0], z: b[1], yaw: b[2], speed: 0, anim };
  };
  return { buddy: { ...one('b', BENCH_B), seatY: 0 }, carol: { ...one('c', BENCH_C), seatY: 0 } };
}

// ---- the booth: the setup and the pack-up are one list of stages, each with its time (seconds from the plan's start)
export const STAGES = ['post', 'canopyL', 'canopyR', 'walls', 'table', 'banner', 'wreaths', 'signs', 'towerL', 'towerR', 'chair', 'tripod', 'lights'];
const leaveCache = new Map(), packCache = new Map();
// from 15:30: out to the truck, the drive, the walk over, the setup
function leave(day) {
  return cache(leaveCache, day, () => {
    const H = homeOf(), R = routes(), B = planner(), C = planner(), rnd = mulberry32(Math.floor(hash01('bc-leave', day) * 4294967296));
    const g = H.garage;
    // out of the garage to the doors (Carol with a box of bows), in, and off
    B.walk([H.bench.buddy, [g.cx - 0.6, g.z0 + 0.4], [g.cx - 0.8, g.z0 - 1.2], H.driverDoor]);
    C.walk([H.bench.carol, [g.cx + 0.4, g.z0 + 0.4], [g.x0 - 0.2, g.z0 - 0.4], [H.passDoor[0], H.passDoor[1] + 1.0], H.passDoor], { carry: 'box' });
    const tDoor = Math.max(B.u, C.u) + 1.5;
    B.until(tDoor, H.driverDoor[0], H.driverDoor[1], -Math.PI / 2, 'idle');
    C.until(tDoor, H.passDoor[0], H.passDoor[1], Math.PI / 2, 'idle', { carry: 'box' });
    const tGarage = Math.max(B.segs[0].t1, C.segs[0].t1) - 4; // the garage door comes down once they are out
    const tDrive = tDoor + 2.5, tOut = tDrive + R.back.T + 0.8, tRev = tOut + R.out.T + 0.8, tPark = tRev + R.park.T;
    B.gone(tPark + 2 - B.u); C.gone(tPark + 2 - C.u);
    // out in the lot (the truck nose west): Buddy from the driver's door (south side) straight off the lot's south edge, Carol
    // from the passenger's door round the nose through the aisle; across the grass to the park path and the booth
    const { dS, dN, bWalk, cWalk } = truckWalks();
    const front = loc(0, 3.2), postSpot = loc(POST.lx, POST.lz + 0.55);
    B.walk([dS, ...bWalk, front, postSpot]);
    C.walk([dN, ...cWalk, front, loc(-0.9, 2.6)], { carry: 'box' });
    const S0 = Math.max(B.u, C.u) + 1;
    const T = { post: S0 + 3, canopyL: S0 + 14, canopyR: S0 + 32, walls: S0 + 50, table: S0 + 112, banner: S0 + 130, wreaths: S0 + 150, signs: S0 + 150, towerL: S0 + 395, towerR: S0 + 415, chair: S0 + 440, tripod: S0 + 455, lights: S0 + 470 };
    const by = (lx, lz, ly) => [...loc(lx, lz), boothYaw(ly)];
    const job = (P, t1, [x, z, yaw], anim, o) => { P.walk([P.segs.length ? lastXZ(P) : [x, z], [x, z]], { v: 1.0 }); P.until(t1, x, z, yaw, anim, o); };
    // Buddy: pulls his post, the two canopies with Carol, the dog-sign wall, the corner towers, his chair
    job(B, T.post + 4, by(POST.lx, POST.lz + 0.5, Math.PI), 'garden');
    job(B, T.canopyL + 6, by(-2.95, 1.45, Math.PI / 4), 'cheer');
    job(B, T.canopyR + 6, by(2.95, 1.45, -Math.PI / 4), 'cheer');
    job(B, T.walls + 55, by(1.4, -0.9, Math.PI), 'read');
    job(B, T.signs + 120, by(1.0, -0.75, Math.PI), 'point');
    job(B, T.signs + 236, by(2.2, -0.7, Math.PI), 'read');
    job(B, T.towerL + 10, by(-2.55, 2.25, Math.PI * 0.85), 'garden');
    job(B, T.towerR + 10, by(2.55, 2.25, -Math.PI * 0.85), 'garden');
    job(B, T.chair + 8, by(CHAIR.lx - 0.6, CHAIR.lz + 0.4, Math.PI / 2), 'garden');
    // Carol: the back legs of the canopies, the table and its cloth, the wreaths, the tripod
    C.walk([lastXZ(C), loc(-0.9, 2.6)]);
    job(C, T.canopyL + 6, by(-2.95, -1.4, Math.PI * 0.75), 'cheer', { carry: null });
    job(C, T.canopyR + 6, by(2.95, -1.4, -Math.PI * 0.75), 'cheer');
    job(C, T.walls + 55, by(-1.4, -0.9, Math.PI), 'read');
    job(C, T.banner + 12, by(-1.5, 0.35, Math.PI), 'garden');
    job(C, T.wreaths + 70, by(-1.6, -0.75, Math.PI), 'point');
    job(C, T.wreaths + 150, by(-2.3, -0.2, -Math.PI / 2), 'read');
    job(C, T.wreaths + 225, by(-1.5, -0.3, Math.PI), 'point');
    job(C, T.tripod + 8, by(BOOTH.tripod.x + 0.55, BOOTH.tripod.z - 0.45, -Math.PI * 0.7), 'garden');
    const end = Math.max(B.u, C.u, T.lights + 2);
    void rnd;
    return { b: B.segs, c: C.segs, T, tGarage, tDrive, tOut, tRev, tPark, S0, end };
  });
}
// from 20:00: the setup backwards, the walk to the truck, the drive home, in at the front door
function pack(day) {
  return cache(packCache, day, () => {
    const H = homeOf(), R = routes(), B = planner(), C = planner();
    const T = { lights: 4, tripod: 18, chair: 34, towerR: 52, towerL: 70, signs: 96, wreaths: 96, banner: 300, table: 318, walls: 340, canopyR: 405, canopyL: 425, post: 445 };
    const by = (lx, lz, ly) => [...loc(lx, lz), boothYaw(ly)];
    const first = (P, [x, z, yaw], t1, anim, o) => { P.still(t1, x, z, yaw, anim, o); };
    const job = (P, t1, [x, z, yaw], anim, o) => { P.walk([lastXZ(P), [x, z]], { v: 1.0 }); P.until(t1, x, z, yaw, anim, o); };
    first(B, by(CHAIR.lx - 0.6, CHAIR.lz + 0.4, Math.PI / 2), T.chair + 2, 'garden');
    job(B, T.towerR + 6, by(2.55, 2.25, -Math.PI * 0.85), 'garden');
    job(B, T.towerL + 6, by(-2.55, 2.25, Math.PI * 0.85), 'garden');
    job(B, T.signs + 100, by(2.2, -0.7, Math.PI), 'read');
    job(B, T.signs + 196, by(1.0, -0.75, Math.PI), 'read');
    job(B, T.walls + 50, by(1.4, -0.9, Math.PI), 'read');
    job(B, T.canopyR + 5, by(2.95, 1.45, -Math.PI / 4), 'point');
    job(B, T.canopyL + 5, by(-2.95, 1.45, Math.PI / 4), 'point');
    job(B, T.post + 6, by(POST.lx, POST.lz + 0.5, Math.PI), 'garden');
    first(C, by(BOOTH.tripod.x + 0.55, BOOTH.tripod.z - 0.45, -Math.PI * 0.7), T.tripod + 3, 'garden');
    job(C, T.wreaths + 80, by(-1.5, -0.3, Math.PI), 'read');
    job(C, T.wreaths + 150, by(-2.3, -0.2, -Math.PI / 2), 'read');
    job(C, T.wreaths + 200, by(-1.6, -0.75, Math.PI), 'read');
    job(C, T.table + 10, by(-1.5, 0.35, Math.PI), 'garden');
    job(C, T.walls + 50, by(-1.4, -0.9, Math.PI), 'read');
    job(C, T.canopyR + 5, by(2.95, -1.4, -Math.PI * 0.75), 'point');
    job(C, T.canopyL + 5, by(-2.95, -1.4, Math.PI * 0.75), 'point', { carry: 'box' });
    const tAll = Math.max(B.u, C.u) + 1;
    B.until(tAll, ...lastXZ(B), lastSeg(B).yaw ?? 0, 'idle'); C.until(tAll, ...lastXZ(C), lastSeg(C).yaw ?? 0, 'idle', { carry: 'box' });
    // back to the truck (the way they came) and home
    const { dS, dN, bWalk, cWalk } = truckWalks();
    B.walk([lastXZ(B), loc(0, 3.2), ...bWalk.slice().reverse(), dS]);
    C.walk([lastXZ(C), loc(0, 3.2), ...cWalk.slice().reverse(), dN], { carry: 'box' });
    const tIn = Math.max(B.u, C.u) + 1.5;
    B.until(tIn, dS[0], dS[1], Math.PI, 'idle'); C.until(tIn, dN[0], dN[1], 0, 'idle', { carry: 'box' });
    const tDrive = tIn + 2, tHome = tDrive + R.home.T;
    B.gone(tHome + 2 - B.u); C.gone(tHome + 2 - C.u);
    B.walk([H.driverDoor, [H.bay.x + 1.4, H.bay.z - 2.6], [H.door[0] - 1.2, H.door[1] - 0.6], H.door]);
    C.walk([H.passDoor, [H.bay.x - 1.3, H.bay.z - 2.8], [H.bay.x + 1.0, H.walkZ + 0.8], [H.door[0] - 1.8, H.door[1] - 1.0], H.door], { carry: 'box' });
    const end = Math.max(B.u, C.u) + 1;
    B.gone(99999); C.gone(99999);
    return { b: B.segs, c: C.segs, T, tDrive, tHome, end };
  });
}
// Between the parked truck (TRUCK_BAY, nose west) and the park path: the two doors and the two walks (off the lot's south
// edge and across the grass, never across the road)
function truckWalks() {
  const T = TRUCK_BAY, fx = Math.sin(T.yaw), fz = Math.cos(T.yaw), lx = fz, lz = -fx; // forward, and the driver's (left) side
  const dS = [T.x + fx * 0.4 + lx * 1.25, T.z + fz * 0.4 + lz * 1.25], dN = [T.x + fx * 0.4 - lx * 1.25, T.z + fz * 0.4 - lz * 1.25];
  const edge = PARK_LOT.maxZ;
  return {
    dS, dN,
    bWalk: [[dS[0] - 0.2, edge + 1.0], [-61.2, -23.2], [-62.3, -21.5]],
    cWalk: [[T.x + fx * 2.9 - lx * 1.1, dN[1]], [T.x + fx * 3.1, edge + 1.0], [-62.3, -23.0], [-62.5, -21.4]],
  };
}
function lastSeg(P) { return P.segs[P.segs.length - 1] || {}; }
function lastXZ(P) {
  const s = lastSeg(P);
  if (s.kind === 'walk') return s.pts[s.pts.length - 1].slice();
  if (s.kind === 'still') return [s.x, s.z];
  return [0, 0];
}
// how far each stage is up (0 = packed, 1 = out), a quick pop over POP seconds
const POP = 2.2;
function stagesSetup(T, u) { const o = {}; for (const k of STAGES) o[k] = k === 'post' ? 1 - clamp01((u - T.post) / 1.2) : clamp01((u - T[k]) / POP); return o; }
function stagesPack(T, u) { const o = {}; for (const k of STAGES) o[k] = k === 'post' ? clamp01((u - T.post) / 1.2) : 1 - clamp01((u - T[k]) / POP); return o; }
const ALL_OUT = Object.fromEntries(STAGES.map(k => [k, k === 'post' ? 0 : 1]));
const ALL_IN = Object.fromEntries(STAGES.map(k => [k, k === 'post' ? 1 : 0]));
// the wreaths and the dog signs go up one at a time: item i of n during the stage's own window (wall + table = 15, signs = 21)
export function itemShown(stage, u, i, n, packing) {
  const span = 230, a = stage + (i / n) * span;
  return packing ? 1 - clamp01((u - (stage + ((n - 1 - i) / n) * 190)) / 1.2) : clamp01((u - a) / 1.2);
}

// ---- the booth while it is open (15:45 to 20:00): Buddy in his chair, Carol about the booth, neighbours browsing
const CAROL_SPOTS = [
  [-1.5, -0.75, 0, ['talk', 'read', 'look']],          // behind the table
  [-2.05, -0.6, Math.PI, ['point', 'read']],             // straightening the back wall
  [-2.35, 0.25, -Math.PI / 2, ['read', 'point']],        // the side wall
  [-1.2, 1.1, 0, ['wave', 'talk', 'laugh']],              // in front of the table, saying hello
  [1.0, -0.6, Math.PI, ['point', 'look']],               // the dog signs
  [0.05, 1.3, 0, ['wave', 'talk', 'look']],               // out front in the middle
  [-3.2, 1.45, -Math.PI * 0.75, ['point', 'look']],       // the tripod
];
export const BUDDY_SEAT = ['idle', 'wave', 'talk', 'laugh', 'point', 'drink', 'wave', 'idle', 'laugh', 'talk'];
const BEAT = 16;
function carolSpot(k, vis) {
  if (vis) return vis;
  const i = Math.floor(hash01('bc-carol', k) * CAROL_SPOTS.length), s = CAROL_SPOTS[i];
  return { lx: s[0], lz: s[1], ly: s[2], anim: s[3][Math.floor(hash01('bc-canim', k) * s[3].length)] };
}

// ---- neighbours at the booth: a 300 s slot from 15:50, one visitor at most, picked from the residents who are at home
// all slot long by their own timetable (town-life.js), so nobody is in two places at once
const SLOT = 300, SLOTS = 48;
const VISIT_P = 0.55, BUY_P = 0.42;
// in from Breneland Rd's sidewalk down the lot's driveway and aisle (clear of the bays), then across the grass to the booth
const ENTRY = [[-63.0, -42.6], [-63.6, -40.2], [-63.8, -37], [-63.8, -30], [-63.5, -26.0], [-62.8, -22.6]];
const LEAVE_TO = [...ENTRY.slice().reverse(), [-27.2, -42.8]];   // (off along the sidewalk toward Maple Ave and home)
const BROWSE = [
  { lx: -1.6, lz: 2.35, ly: Math.PI, anim: 'look', cl: [-1.55, 1.2, 0] },      // the wreath wall from the front
  { lx: 1.35, lz: 2.45, ly: Math.PI, anim: 'point', cl: [1.25, 1.3, 0] },     // the dog signs
  { lx: -2.25, lz: 1.05, ly: -Math.PI / 2, anim: 'look', cl: [-1.4, 0.55, Math.PI / 2] }, // under the left canopy, the side wall
];
const BUY = { lx: BOOTH.tripod.x + 0.45, lz: BOOTH.tripod.z + 0.75, cl: [-2.75, 1.4, -Math.PI * 0.6] };
const slotCache = new Map();
// The visit in slot j of a booth day whose doors open at tOpen: null or { npc, name, a, buy, segs, tTake, tEnd, carolAt[] }
export function visitOf(day, tOpen, j) {
  const key = day + ':' + tOpen + ':' + j;
  let v = slotCache.get(key);
  if (v !== undefined) return v;
  v = null;
  if (j >= 0 && j < SLOTS && hash01('bc-visit', day, j) < VISIT_P) {
    const a = tOpen + 300 + j * SLOT, n = TOWN_RESIDENTS.length;
    const order = TOWN_RESIDENTS.map((id, i) => [hash01('bc-who', day, j, i), i]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
    const st = [a + 5, a + 150, a + SLOT - 5].map(tt => residentStates(tt));
    const pickI = order.find(i => st.every(s => s[i] && s[i].hidden));
    if (pickI !== undefined) {
      const id = TOWN_RESIDENTS[pickI], rnd = mulberry32(Math.floor(hash01('bc-route', day, j) * 4294967296));
      const P = planner(), v1 = 1.2;
      const nB = 1 + Math.floor(rnd() * 3), buy = hash01('bc-buy', day, j) < BUY_P;
      const stations = [];
      const order2 = [0, 1, 2].slice(0, nB);
      P.walk([...ENTRY, loc(rnd() < 0.5 ? -1 : 1, 3.4)], { v: v1 });
      for (const bi of order2) {
        const s = BROWSE[bi], p = loc(s.lx, s.lz);
        P.walk([lastXZ(P), p], { v: 0.9 });
        const dur = 24 + rnd() * 16;
        stations.push({ t0: P.u, t1: P.u + dur, cl: s.cl });
        P.still(dur, p[0], p[1], boothYaw(s.ly), s.anim);
      }
      let tTake = null;
      if (buy) {
        const p = loc(BUY.lx, BUY.lz);
        P.walk([lastXZ(P), p], { v: 0.9 });
        const yaw = faceTo(p[0], p[1], TRIPOD[0], TRIPOD[1]);
        stations.push({ t0: P.u, t1: P.u + 16, cl: BUY.cl });
        P.still(3, p[0], p[1], yaw, 'pet');
        tTake = a + P.u;
        P.still(5, p[0], p[1], yaw, 'look', { carry: 'wreath' });
        const cl = loc(BUY.cl[0], BUY.cl[1]);
        P.still(8, p[0], p[1], faceTo(p[0], p[1], cl[0], cl[1]), 'laugh', { carry: 'wreath' });
        P.walk([p, loc(-2.2, 3.6), ...LEAVE_TO], { v: v1, carry: 'wreath' });
      } else {
        const last = lastXZ(P);
        P.still(3, last[0], last[1], boothYaw(Math.PI), 'wave');
        P.walk([last, loc(0.5, 3.6), ...LEAVE_TO], { v: v1 });
      }
      const endU = P.u;
      P.gone(99999);
      v = { npc: id, name: NPCS[id].name, index: pickI, a, buy, segs: P.segs, tTake, end: a + endU, stations };
    }
  }
  slotCache.set(key, v);
  if (slotCache.size > 2000) slotCache.delete(slotCache.keys().next().value);
  return v;
}
// the booth day and its doors-open time seen from t (k days back)
function dayAt(t, k = 0) {
  // (whole minutes: the same numbers from any moment of the day, and a pinned test hour only moves them once a minute)
  const noon = Math.floor((sinceHour(t, 12) - k * 86400) / 60) * 60;
  return { day: easternDay(noon * 1000), tOpen: noon + (HOURS.open - 12) * 3600, noon };
}
// the visitor at the booth at time t (or null): { npc, name, x, z, yaw, speed, anim, carry, design }
export function visitorAt(t, playerSales = []) {
  const { day, tOpen } = dayAt(t), j = Math.floor((t - tOpen - 300) / SLOT);
  for (const jj of [j - 1, j]) { // a visit can run a little past its slot on the way out (the next visitor waits out of sight)
    const v = visitOf(day, tOpen, jj);
    if (!v || t < v.a || t > v.end) continue;
    const s = personAt(v.segs, t - v.a);
    if (s.hidden) continue;
    return { ...s, npc: v.npc, name: v.name, index: v.index, buy: v.buy, design: v.buy && t >= v.tTake ? designOfSale(day, tOpen, v, playerSales) : null, visit: v };
  }
  return null;
}
// the neighbours' purchases on a booth day: [{ at, npc, house, j }] in order
const salesCache = new Map();
export function npcSales(day, tOpen) {
  return cache(salesCache, day + ':' + tOpen, () => {
    const out = [];
    for (let j = 0; j < SLOTS; j++) { const v = visitOf(day, tOpen, j); if (v && v.buy) out.push({ at: v.tTake, npc: v.npc, index: v.index, j }); }
    return out;
  });
}
const playerSalesIn = (sales, t0, t1) => sales.filter(s => s.at / 1000 >= t0 && s.at / 1000 < t1).length;
function designOfSale(day, tOpen, v, playerSales) {
  const n = npcSales(day, tOpen).filter(s => s.at < v.tTake).length + playerSalesIn(playerSales, tOpen - 3600 * 4, v.tTake);
  return tripodDesign(day, n);
}
// What stands on the tripod at t: { design | null (just sold, Carol is fetching another), sold: how many today }
export function tripodAt(t, playerSales = []) {
  const { day, tOpen, noon } = dayAt(t);
  const npc = npcSales(day, tOpen).filter(s => s.at <= t);
  const pl = playerSales.filter(s => s.at / 1000 >= noon && s.at / 1000 <= t);
  const n = npc.length + pl.length;
  const lastAt = Math.max(npc.length ? npc[npc.length - 1].at : -1e9, pl.length ? Math.max(...pl.map(s => s.at / 1000)) : -1e9);
  return { design: t - lastAt < 18 ? null : tripodDesign(day, n), sold: n, day };
}
// The neighbours' doors: the newest wreath each buyer took home in the last ~two weeks, as of t:
// Map(house index -> { design, at, npc, name })
export const DOOR_DAYS = 14;
export function doorWreaths(t, playerSales = []) {
  const out = new Map(), houses = TOWN_HOUSES.length;
  if (!houses) return out;
  for (let k = DOOR_DAYS - 1; k >= 0; k--) {
    const { day, tOpen } = dayAt(t, k);
    const sales = npcSales(day, tOpen);
    sales.forEach((s, i) => {
      if (s.at > t) return;
      const name = NPCS[s.npc].name, house = Math.floor(hash01('home', name) * houses);  // (town-life.js's homes)
      const n = i + playerSalesIn(playerSales, tOpen - 3600 * 4, s.at);
      out.set(house, { design: tripodDesign(day, n), at: s.at, npc: s.npc, name });
    });
  }
  return out;
}

// ------------------------------------------------------------------ everything at once
const HOME_STATE = { x: 0, z: 0, yaw: 0, speed: 0, anim: 'idle', hidden: true, seatY: 0 };
// familyAt(t, playerSales?) -> {
//   phase: 'night' | 'walk' | 'craft' | 'leave' | 'setup' | 'booth' | 'pack',
//   buddy, carol: person states,
//   truck: { x, z, yaw, v, rev, moving, where: 'home' | 'road' (driving, in the lot too) | 'bay' (parked in the lot) },
//   booth: { stages: { post, canopyL, ... } 0..1, u (seconds into the setup / pack-up), packing, open, T (stage times) },
//   garage: { door 0..1 (1 = up) } }
export function familyAt(t, playerSales = []) {
  const H = homeOf(), R = routes();
  if (!H || !R) return null;
  const park = { x: H.bay.x, z: H.bay.z, yaw: H.bay.yaw, v: 0, rev: false, moving: false, where: 'home' };
  const bay = { x: TRUCK_BAY.x, z: TRUCK_BAY.z, yaw: TRUCK_BAY.yaw, v: 0, rev: false, moving: false, where: 'bay' };
  const day = boothDay(t);
  // 20:00: packing up and home
  const tP = sinceHour(t, HOURS.pack), uP = t - tP;
  const pk = pack(day);
  if (uP < pk.end) {
    const truck = uP < pk.tDrive ? bay : uP < pk.tHome ? { ...driveAt(R.home, uP - pk.tDrive), moving: true, where: 'road' } : park;
    return {
      phase: 'pack', u: uP, buddy: personAt(pk.b, uP), carol: personAt(pk.c, uP), truck,
      booth: { stages: stagesPack(pk.T, uP), u: uP, packing: true, open: false, T: pk.T }, garage: { door: 0 },
    };
  }
  // 15:30 to 20:00: off to the park, the setup, the booth
  const tL = sinceHour(t, HOURS.leave), uL = t - tL;
  if (uL < (HOURS.pack - HOURS.leave) * 3600) {
    const lv = leave(day);
    if (uL < lv.end) {
      const truck = uL < lv.tDrive ? park : uL < lv.tOut ? (uL - lv.tDrive < R.back.T ? { ...driveAt(R.back, uL - lv.tDrive), moving: true, where: 'road' } : { ...driveAt(R.back, R.back.T), moving: true, where: 'road' })
        : uL < lv.tRev ? { ...driveAt(R.out, uL - lv.tOut), moving: true, where: 'road' }
        : uL < lv.tPark ? { ...driveAt(R.park, uL - lv.tRev), moving: true, where: 'road' } : bay;
      const door = uL < lv.tGarage ? 1 : 1 - clamp01((uL - lv.tGarage) / 6);
      return {
        phase: uL < lv.S0 ? 'leave' : 'setup', u: uL, buddy: personAt(lv.b, uL), carol: personAt(lv.c, uL), truck,
        booth: { stages: stagesSetup(lv.T, uL), u: uL, packing: false, open: false, T: lv.T }, garage: { door },
      };
    }
    // open (from the end of the setup; customers from 15:45)
    const k = Math.floor(t / BEAT), uu = t - k * BEAT;
    const ch = { ...boothXZpos(CHAIR.lx, CHAIR.lz), yaw: boothYaw(0), speed: 0, anim: BUDDY_SEAT[Math.floor(hash01('bc-buddy', k) * BUDDY_SEAT.length)], seatY: CHAIR.seatY, seated: true, chair: true };
    const vis = visitorAt(t, playerSales);
    // Carol: her beat's spot, or beside the visitor's station while someone browses (she walks over when it changes)
    const attend = vis && vis.visit ? vis.visit.stations.find(s => t - vis.visit.a >= s.t0 - 2 && t - vis.visit.a < s.t1) : null;
    const target = (tt) => {
      if (vis && vis.visit) { const s = vis.visit.stations.find(q => tt - vis.visit.a >= q.t0 - 2 && tt - vis.visit.a < q.t1); if (s) return { lx: s.cl[0], lz: s.cl[1], ly: s.cl[2], anim: 'talk', since: vis.visit.a + s.t0 - 2 }; }
      const kk = Math.floor(tt / BEAT); return { ...carolSpot(kk), since: kk * BEAT };
    };
    const cur = target(t), prev = target(cur.since - 0.01);
    const a = boothXZ(prev.lx, prev.lz), b = boothXZ(cur.lx, cur.lz), d = Math.hypot(b[0] - a[0], b[1] - a[1]), w = d / 0.85, since = t - cur.since;
    let carol;
    if (d > 0.05 && since < w) { const f = since / w; carol = { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, yaw: faceTo(a[0], a[1], b[0], b[1]), speed: 0.85, anim: null, seatY: 0 }; }
    else carol = { x: b[0], z: b[1], yaw: attend && vis ? faceTo(b[0], b[1], vis.x, vis.z) : boothYaw(cur.ly), speed: 0, anim: cur.anim, seatY: 0 };
    void uu;
    return { phase: 'booth', u: uL, buddy: ch, carol, truck: bay, visitor: vis, booth: { stages: ALL_OUT, u: uL, packing: false, open: t - tL >= (HOURS.open - HOURS.leave) * 3600 }, garage: { door: 0 } };
  }
  // 9:00 to 15:30: the garage
  const tC = sinceHour(t, HOURS.craft), uC = t - tC;
  if (uC < (HOURS.leave - HOURS.craft) * 3600) {
    const s = craftAt(uC, t);
    return { phase: 'craft', u: uC, buddy: s.buddy, carol: s.carol, truck: park, booth: { stages: ALL_IN, u: 0, packing: false, open: false }, garage: { door: clamp01(uC / 6) } };
  }
  // 7:00: the walk
  const tW = sinceHour(t, HOURS.walk), uW = t - tW;
  const m = morning(day);
  if (uW < m.end) return { phase: 'walk', u: uW, buddy: personAt(m.b, uW), carol: personAt(m.c, uW), truck: park, booth: { stages: ALL_IN, u: 0, packing: false, open: false }, garage: { door: 0 } };
  return { phase: 'night', u: 0, buddy: { ...HOME_STATE, x: H.door[0], z: H.door[1] }, carol: { ...HOME_STATE, x: H.door[0], z: H.door[1] }, truck: park, booth: { stages: ALL_IN, u: 0, packing: false, open: false }, garage: { door: 0 } };
}
function boothXZpos(lx, lz) { const [x, z] = boothXZ(lx, lz); return { x, z }; }
// Where the pickup is (cars.js follows it while it drives on the road and yields while it pulls out of the lot). Pure.
export function truckAt(t) { const f = familyAt(t); return f ? f.truck : null; }
// Forget the cached plans and visits (a pinned test hour changes what the residents' timetables say)
export function resetBuddyCaches() { for (const m of [morningCache, leaveCache, packCache, slotCache, salesCache]) m.clear(); }
// For tests: the day's plans
export function plansAt(t) { const day = boothDay(t); return { day, morning: morning(day), leave: leave(day), pack: pack(day), routes: routes(), home: homeOf(), loop: walkLoop() }; }
export { N_DESIGNS };
void TAU;
