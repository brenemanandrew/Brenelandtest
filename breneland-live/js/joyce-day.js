// Joyce's day, a PURE FUNCTION of the shared clock like every NPC (hash01 and mulberry32 only, no Math.random), so every visitor,
// and Molly, sees her in the same place doing the same thing. US Eastern time:
//   night - 6:00    at home asleep, the pink golf cart parked in her garage (joyce-house: the cart lives in the garage)
//   6:00            out of the front door for her power walk: brisk, arms pumping, laps of the town's sidewalks (every other
//                   lap a detour across the zebra into Strickler Park and back), about 40 minutes, then home
//   ~7:50           out to the cart, Molly hops on the seat beside her, a short drive on Breneland Rd (right-hand lane) to
//                   the garden's parking spot, a walk into the garden: there by 8:00
//   8:00 - 12:00    working in the Community Garden (beats of 24 s round her spots, in her chair now and then)
//   12:00           back to the cart and home; home all afternoon (now and then out front tending her flower bed)
//   ~18:20          the cart again: in the garden 18:30 - 19:30, then home
//   19:45 - ~21:05  her evening (joyce-evening.js: girlfriends round the firepit or in the sun room, a group walk, bocce, or
//                   by the fire alone with Molly), then indoors; to bed at 22:30
// At home she is seen, not hidden (joyce-house): 15-minute slots in her rooms (joyce-house-plan.js ROOM_SPOTS: the kitchen,
// the dining table, the sun room, the living room by the front window), now and then out front at her flower bed; she comes
// and goes by the garage's inner door when she takes the cart and by the front door on foot. Hidden only in bed.
// Where the garden is comes from the game slot at runtime (games.json via areas.js, after the World Editor's moves: npcs.js calls
// setJoyceWorld with the garden area), and layout.js GARDEN_SPOTS (see gardenSpots()). Nothing here hard-codes the garden. Her
// house is one of the street houses across Breneland Rd from our fence (layout.js JOYCE_HOME, world.js STREET_HOUSES).
//
// The contract (Molly writes against it; docs/CONTRACTS.md "Changes by w3-joyce"):
//   joyceAt(ms) -> { x, z, yaw, mode: 'home'|'walk'|'cart'|'garden', cart: { x, z, yaw, v, rev, moving }, seat: { x, z, yaw, y } | null,
//                    hidden, speed, anim, phase, y, seatY, power }
//   ms = the shared clock (net.serverNow()). x, z, yaw = Joyce (Three.js yaw: forward = (sin yaw, cos yaw)); mode 'cart' = she
//   sits in the driver's seat (driving, or seated a moment before or after); `cart` is the cart's pose all the time (parked or
//   driving); `seat` (only in mode 'cart') is the passenger seat Molly sits on, y = the cushion's top in world metres.
//   hidden: indoors. phase: a finer name for what she's doing (tests, Molly may use it).
import { hash01, mulberry32, alongPolyline, polylineLength, wrapAngle, pointInPoly } from './util.js';
import { hourAt, moodAt, areaLines, isDark } from './npcs-day.js';
import { easternDay } from './wreath-data.js';
import * as LAYOUT from './layout.js';
import { STREET_HOUSES } from './world.js';
import { streetY } from './mailman-route.js';
import { JH, ROOM_SPOTS, ROOM_POOLS, BED_H, EVENING } from './joyce-house-plan.js';
import { joyceEveAt, eveningOfDayPlan } from './joyce-evening.js';

const { ROADS, LANE_OFFSET, YARD, GATES, JOYCE_HOME } = LAYOUT;

export const JOYCE_HOURS = { walk: 6, walkMin: 40, garden: [[8, 12], [18.5, 19.5]] };
// The pink golf cart, in its own frame (forward = +z, +x = the driver's (left) side; y up from the ground under it).
export const CART = {
  L: 2.4, W: 1.24, wheelR: 0.23, axles: [0.8, -0.76], track: 0.56,
  floorY: 0.36,            // the footwell's floor (Joyce's root stands on it)
  seatY: 0.66,             // the bench cushion's top (seat-height: 0.3 over the footwell, was 0.7)
  seatZ: -0.32,            // the bench's middle, front to back
  driverX: 0.3, passX: -0.3,
  roofY: 2.16,
};
const BEAT = 24;            // garden beats (s)
const GROUP = 3;            // beats at one spot
const FOOT_V = 1.1;         // walking about (m/s)
const ROAD_V = 4.6;         // the cart on the road
const SLOW_V = 2.2;         // the cart off the road (her drive, the lot, the grass)
const REV_V = 1.4;          // backing up
const BZ = -48.5;           // Breneland Rd's centre line along the straight
const LANE_W = BZ - LANE_OFFSET, LANE_E = BZ + LANE_OFFSET;   // westbound lane (north half), eastbound lane (south half)
const WALK_N = BZ - 4.5 - 1.6, WALK_S = BZ + 4.5 + 1.6;       // the middle of the north and south sidewalks
const TAU = Math.PI * 2;
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const clamp01 = u => (u < 0 ? 0 : u > 1 ? 1 : u);

// ------------------------------------------------------------------ the world (set by npcs.js; layout.js for the rest)
let WORLD = { garden: null, route: null, spots: undefined };
let PLAN = null;
// npcs.js: setJoyceWorld({ garden: { x, z, radius }, route(ax, az, bx, bz) -> [[x, z]...] }). Tests may pass `spots` (a stand-in
// for layout.js GARDEN_SPOTS). Everything is rebuilt from it.
export function setJoyceWorld(w = {}) {
  WORLD = { garden: w.garden ? { x: w.garden.x, z: w.garden.z, r: w.garden.radius || 7 } : null, route: w.route || null, spots: w.spots };
  PLAN = null; HOME = null; WV++;
}
export function resetJoyceCaches() { PLAN = null; HOME = null; dayCache.clear(); }

// The garden's spots: layout.js GARDEN_SPOTS (relative to the slot, { u, v, yaw }, read the way layout.js gardenSpot() reads
// them), also accepted absolute { x, z } or { dx, dz }, or a function of the slot. Shape: { joyce: spot, cart?: { ..., yaw },
// chair?: { ..., yaw }, work? (or stops?): [spot], cartVia?: [spot] }. Without it: Joyce's spot is the plot's middle (with a few
// stops on the plot's walkways) and the cart parks on the grass verge across the road at the garden's x.
let SPOTS = null;
export function gardenSpots() {
  if (SPOTS && SPOTS.key === PLAN_KEY()) return SPOTS.v;   // (asked every frame: built once per world)
  SPOTS = { key: PLAN_KEY(), v: spotsNow() };
  return SPOTS.v;
}
function spotsNow() {
  const g = WORLD.garden;
  if (!g) return null;
  let S = WORLD.spots !== undefined ? WORLD.spots : LAYOUT.GARDEN_SPOTS;
  if (typeof S === 'function') S = S(g);
  const abs = p => (p == null ? null : p.u !== undefined ? { ...p, x: g.x + p.u, z: g.z + (p.v || 0), yaw: p.yaw || 0 } : p.dx !== undefined ? { ...p, x: g.x + p.dx, z: g.z + (p.dz || 0) } : { ...p });
  const joyce = abs(S?.joyce) || { x: g.x, z: g.z + 0.3, yaw: Math.PI };
  // (the plot's walkways as the garden draws them: a cross between the four beds and the ends of the rows)
  const list = S?.stops || S?.work;
  const stops = list ? list.map(abs) : S ? [] : [[0, 0.3, Math.PI], [-2.2, 0.3, Math.PI], [2.2, 0.3, Math.PI], [0, 3.4, Math.PI], [2.4, -2.7, 0], [-2.0, -2.7, 0]].map(([dx, dz, yaw]) => ({ x: g.x + dx, z: g.z + dz, yaw }));
  return { joyce, cart: abs(S?.cart), chair: abs(S?.chair), stops: [joyce, ...stops], via: (S?.cartVia || []).map(abs), given: !!S };
}

// ------------------------------------------------------------------ her house (joyce-house-plan.js; the street row's spot, facing Breneland Rd)
// The cart lives in her garage (joyce-house): parked nose out in the east bay, and the driveway runs from the garage door down to
// the sidewalk. `strip` is the garage and the driveway (the cart's own ground), `park` the spot in the garage.
let HOME = null;
export function homeOf() {
  if (HOME && HOME.wv === STREET_HOUSES.length) return HOME;
  LOOPS = null;
  const fromRow = STREET_HOUSES.find(h => Math.abs(h.x - JOYCE_HOME.x) < 1);
  const H = fromRow || { x: JOYCE_HOME.x, z: (JH.FZ + JH.BZ) / 2, w: JH.maxX - JH.minX, d: JH.FZ - JH.BZ, facing: 1, door: { x: JH.pts.front[0], z: JH.pts.front[1] } };
  const front = JH.FZ, P = JH.pts;
  HOME = {
    wv: STREET_HOUSES.length,
    house: H, x: JOYCE_HOME.x, front, side: -1, px: JH.park.x, pz: JH.park.z,
    strip: { x0: JH.drive.minX, x1: JH.drive.maxX, z0: JH.garage.in.minZ, z1: BZ - 4.5 - 3 },   // the garage and the driveway
    park: { x: JH.park.x, z: JH.park.z, yaw: JH.park.yaw },
    door: [P.front[0], P.front[1]], step: [P.step[0], P.step[1]],
    curb: [P.curb[0], WALK_N],
    bed: { x: JOYCE_HOME.x + 3.0, z: front + 0.55 },               // her flower bed, along the front wall under the living room's window
    gnome: { x: JOYCE_HOME.x + 1.85, z: front + 1.9 },              // the gnome beside the front walk
    flamingo: { x: JOYCE_HOME.x + 4.6, z: front + 4.4 },            // the pink flamingo on the east lawn
    potter: [JOYCE_HOME.x + 3.0, front + 1.5],
  };
  HOME.driver = driverSpot(HOME.park);   // (the driver sits on the left: facing the street that is the east side, by the inner door)
  return HOME;
}

// ------------------------------------------------------------------ lanes, drives (the same speed profile as buddy-day.js)
function roundCorners(pts, R = 4) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], p = pts[i], c = pts[i + 1];
    const L0 = Math.hypot(p[0] - a[0], p[1] - a[1]), L1 = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const ang = Math.abs(wrapAngle(Math.atan2(c[0] - p[0], c[1] - p[1]) - Math.atan2(p[0] - a[0], p[1] - a[1])));
    if (ang < 0.08 || L0 < 1e-3 || L1 < 1e-3) { out.push(p); continue; }
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
function dense(pts, step = 1) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  return out;
}
// a circular arc about (cx, cz): (cx + r cos a, cz + r sin a) for a from a0 to a1
function arc(cx, cz, r, a0, a1, n = 9) { const out = []; for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } return out; }
const join = (...parts) => { const out = []; for (const p of parts) for (const q of p) { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 0.05) out.push(q); } return out; };
const onTar = (x, z) => z > BZ - 4.5 && z < BZ + 4.5;
// A drive along pts: { pts, cum, v, tv, L, T, rev } (cruise, slower in corners and off the road, smooth starts and stops)
function drive(pts, { rev = false } = {}) {
  const n = pts.length, cum = [0], v = new Array(n);
  for (let i = 0; i < n; i++) v[i] = rev ? REV_V : onTar(pts[i][0], pts[i][1]) ? ROAD_V : SLOW_V;
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  for (let i = 1; i < n - 1; i++) {
    const h0 = Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]), h1 = Math.atan2(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    const curv = Math.abs(wrapAngle(h1 - h0)) / Math.max(0.3, (cum[i + 1] - cum[i - 1]) / 2);
    v[i] = Math.min(v[i], Math.sqrt(1.6 / Math.max(curv, 1e-3)));
  }
  v[0] = 0; v[n - 1] = 0;
  for (let i = 1; i < n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * 1.3 * (cum[i] - cum[i - 1])));
  for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * 2.0 * (cum[i + 1] - cum[i])));
  const tv = [0];
  for (let i = 1; i < n; i++) tv.push(tv[i - 1] + (cum[i] - cum[i - 1]) / Math.max(0.3, (v[i] + v[i - 1]) / 2));
  return { pts, cum, v, tv, L: cum[n - 1], T: tv[n - 1], rev };
}
// where a drive is u seconds in: { x, z, yaw, v, rev }
function driveAt(D, u, out = {}) {
  const n = D.pts.length;
  u = u <= 0 ? 0 : u >= D.T ? D.T : u;
  let lo = 0, hi = n - 1;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (D.tv[m] <= u) lo = m; else hi = m; }
  const dt = D.tv[hi] - D.tv[lo], k = dt > 1e-6 ? (u - D.tv[lo]) / dt : 1;
  const v0 = D.v[lo], v1 = D.v[hi], tt = k * dt, ds = D.cum[hi] - D.cum[lo];
  let s = dt > 1e-6 ? v0 * tt + (v1 - v0) * tt * tt / (2 * dt) : ds;
  const sAvg = dt > 1e-6 ? (v0 + v1) / 2 * dt : ds;
  s = sAvg > 1e-6 ? s * ds / sAvg : ds * k;
  const a = D.pts[lo], b = D.pts[hi], f = ds > 1e-6 ? clamp01(s / ds) : 1;
  out.x = a[0] + (b[0] - a[0]) * f; out.z = a[1] + (b[1] - a[1]) * f;
  // the heading eases across each corner point (no snap from one segment's heading to the next)
  const h = i => { const p = D.pts[Math.max(0, i - 1)], q = D.pts[Math.min(n - 1, i)]; return Math.atan2(q[0] - p[0], q[1] - p[1]); };
  const hs = Math.atan2(b[0] - a[0], b[1] - a[1]), hPrev = lo > 0 ? h(lo) : hs, hNext = hi < n - 1 ? Math.atan2(D.pts[hi + 1][0] - b[0], D.pts[hi + 1][1] - b[1]) : hs;
  let yaw = f < 0.5 ? hs + wrapAngle(hPrev - hs) * 0.5 * (1 - 2 * f) : hs + wrapAngle(hNext - hs) * 0.5 * (2 * f - 1);
  if (ds < 1e-6) yaw = hs;
  if (D.rev) yaw += Math.PI;
  out.yaw = wrapAngle(yaw); out.v = v0 + (v1 - v0) * k; out.rev = D.rev;
  return out;
}

// ------------------------------------------------------------------ the routes
// A route is a list of legs: { D } a drive, or { gate } where the cart stops and waits until the way is clear: at the kerb before
// it pulls out, at the lot's driveway before it turns onto the road, and in its lane before it turns across the other one. The
// wait itself is decided in cars.js's lockstep traffic simulation (the same on every client: cartClear below) and read back here
// through setCartDelay, so the cart, Joyce in it and Molly beside her all wait together.
const GATE_N = BZ - 4.5 - 3 - 1.2 + 0.3;   // the cart's middle when it waits at a north-side kerb (its nose just onto the sidewalk)
const GATE_S = BZ + 4.5 + 3 + 1.2 - 0.3;   // ...at a south-side kerb (the lot's driveway, the park side)
const ON_ROAD = (x, z) => Math.abs(z - BZ) < 7.5;
// the part of a drive a gate waits for: all of it on or by Breneland Rd (up to ~26 m of it: a long lane run is not the crossing)
function gateZone(D) { const out = []; for (let i = 0; i < D.pts.length && D.cum[i] < 26; i++) if (ON_ROAD(D.pts[i][0], D.pts[i][1])) out.push(D.pts[i]); return out; }
// the turn from a lane (heading dir) south into the park side at xT, and the points before it in the lane from x0
function laneTo(dir, x0, xT, R = 4) { return dense([[x0, dir < 0 ? LANE_W : LANE_E], [xT - dir * R, dir < 0 ? LANE_W : LANE_E]], 2); }
function turnSouthAt(dir, xT, R = 4) {
  const laneZ = dir < 0 ? LANE_W : LANE_E;
  return dir < 0 ? arc(xT + R, laneZ + R, R, -Math.PI / 2, -Math.PI) : arc(xT - R, laneZ + R, R, -Math.PI / 2, 0);   // west: a left turn (across); east: a right turn
}
// Leaving home for a spot on the park side at xT, `inPts` from the turn's end on: down the strip to the kerb (wait), out into the
// lane (a right turn heading west, a left turn across heading east) and along it to the turn (wait there if it crosses the other
// lane), the turn and on.
function fromHome(H, xT, inPts) {
  const dir = xT < H.px ? -1 : 1, R = 3.6, laneZ = dir < 0 ? LANE_W : LANE_E;
  const down = drive(dense([[H.px, H.pz], [H.px, GATE_N]], 1.2));
  const out = dir < 0 ? arc(H.px - R, laneZ - R, R, 0, Math.PI / 2) : arc(H.px + R, laneZ - R, R, Math.PI, Math.PI / 2);
  const legs = [{ D: down }];
  const lane = join(dense([[H.px, GATE_N], [H.px, laneZ - R]], 1.2), out, laneTo(dir, H.px + dir * R, xT));
  if (dir < 0) {   // the left turn across the eastbound lane: wait for it in the lane
    const a = drive(lane), b = drive(join([lane[lane.length - 1]], turnSouthAt(dir, xT), inPts));
    legs.push({ gate: gateZone(a) }, { D: a }, { gate: gateZone(b) }, { D: b });
  } else {
    const a = drive(join(lane, turnSouthAt(dir, xT), inPts));
    legs.push({ gate: gateZone(a) }, { D: a });
  }
  return legs;
}
// Coming home from the park side: from (xS, zS) heading north up to the kerb at xS (wait), onto the lane toward home (a right turn
// heading east, a left turn across heading west), along to her driveway (wait there if turning in crosses the other lane), in, up
// the driveway, a three-point turn on it (forward round to the west, then backing round) and backwards into the garage, so she is
// parked nose out again.
function toHomeFrom(H, xS, zS) {
  const dir = H.px > xS ? 1 : -1, R = 4, laneZ = dir < 0 ? LANE_W : LANE_E;
  const up = drive(dense([[xS, zS], [xS, GATE_S]], 1.2));
  const onto = dir > 0 ? arc(xS + R, laneZ + R, R, Math.PI, Math.PI * 1.5) : arc(xS - R, laneZ + R, R, 0, -Math.PI / 2);
  const inTurn = dir > 0 ? arc(H.px - R, laneZ - R, R, Math.PI / 2, 0) : arc(H.px + R, laneZ - R, R, Math.PI / 2, Math.PI);
  const lane = join(dense([[xS, GATE_S], [xS, laneZ + R]], 1.2), onto, dense([[xS + dir * R, laneZ], [H.px - dir * R, laneZ]], 2));
  const kz = H.front + 0.3, R2 = 2.6;   // the three-point turn on the driveway, just out from the garage door
  const rest = join(inTurn, dense([[H.px, laneZ - R], [H.px, kz + 2 * R2]], 1.2), arc(H.px - R2, kz + 2 * R2, R2, 0, -Math.PI / 2, 8));
  const backIn = drive(join(arc(H.px - R2, kz, R2, Math.PI / 2, 0, 8), dense([[H.px, kz], [H.px, H.pz]], 0.8)), { rev: true });
  if (dir > 0) {   // turning left into her driveway, across the westbound lane: wait for it in the lane
    const a = drive(lane), b = drive(join([lane[lane.length - 1]], rest));
    return [{ D: up }, { gate: gateZone(a) }, { D: a }, { gate: gateZone(b) }, { D: b }, { D: backIn }];
  }
  const a = drive(join(lane, rest));
  return [{ D: up }, { gate: gateZone(a) }, { D: a }, { D: backIn }];
}
// The cart's routes for this session: { toGarden: [legs], toHome: [legs], gardenPark, homePark }
let ROUTES = null;
function routes() {
  if (ROUTES && ROUTES.key === PLAN_KEY()) return ROUTES;
  const H = homeOf(), S = gardenSpots();
  if (!S) return (ROUTES = null);
  let toGarden, toHome, gp;
  // (a garden without a cart spot: the grass verge behind the road's south sidewalk at the garden's x, nose in)
  const spot = S.cart || { x: Math.max(-88, Math.min(48, WORLD.garden.x)), z: BZ + 4.5 + 3 + 1.8, yaw: 0 };
  if (Math.abs(spot.x - H.px) < 14) {
    // the garden's cart spot is just across the road from her strip: down the strip to the kerb (wait for both lanes), straight
    // over the road on a gentle S, through the garden's cart gate and nose in. Home: back out through the gate to the sidewalk
    // (wait), back over the road and up her strip, so she is parked facing the street again.
    const xT = spot.x, zK = GATE_S + 0.3;
    const across = roundCorners([[H.px, GATE_N], [H.px, BZ - 3.2], [xT, BZ + 3.4], [xT, spot.z]], 3);
    const over = drive(dense(across, 0.8));
    toGarden = [{ D: drive(dense([[H.px, H.pz], [H.px, GATE_N]], 1.2)) }, { gate: gateZone(over) }, { D: over }];
    const backOver = drive(dense(roundCorners([[xT, zK], [xT, BZ + 3.4], [H.px, BZ - 3.2], [H.px, H.pz]], 3), 0.8), { rev: true });
    toHome = [{ D: drive(dense([[xT, spot.z], [xT, zK]], 0.6), { rev: true }) }, { gate: gateZone(backOver) }, { D: backOver }];
    gp = { x: spot.x, z: spot.z, yaw: spot.yaw || 0 };
  } else {
    // the garden piece's own spot (south of Breneland Rd, the park side): off the road at the spot's x, over the kerb and across
    // the grass to it (through its `cartVia` points), nose first along its yaw; home: back out a few metres and up to the kerb
    const xT = Math.max(-88, Math.min(48, spot.x));
    const fx = Math.sin(spot.yaw || 0), fz = Math.cos(spot.yaw || 0), pre = [spot.x - fx * 2.4, spot.z - fz * 2.4];
    const offRoad = roundCorners(join([[xT, BZ + LANE_OFFSET + 4]], [[xT, BZ + 6.2]], S.via.map(p => [p.x, p.z]), [pre, [spot.x, spot.z]]), 3);
    toGarden = fromHome(H, xT, dense(offRoad, 1));
    const back = [spot.x - fx * 3.2, spot.z - fz * 3.2];
    const outPts = roundCorners(join([back], S.via.slice().reverse().map(p => [p.x, p.z]), [[xT, GATE_S + 1.6]]), 3);
    toHome = [{ D: drive(dense([[spot.x, spot.z], back], 0.6), { rev: true }) }, { D: drive(dense(outPts, 1)) }, ...toHomeFrom(H, xT, GATE_S + 1.6)];
    gp = { x: spot.x, z: spot.z, yaw: spot.yaw || 0 };
  }
  ROUTES = { key: PLAN_KEY(), toGarden, toHome, gardenPark: gp, homePark: H.park };
  return ROUTES;
}
let WV = 0;   // (bumped by setJoyceWorld: the plan and routes are rebuilt)
const PLAN_KEY = () => WV * 1000 + STREET_HOUSES.length;

// where the driver gets in and out, beside a parked cart (the left side, a metre out, level with the seat)
function driverSpot(p) { return cartXZ(p, 1.05, CART.seatZ); }
// a point in the cart's frame (lx to the driver's side, lz forward) in the world
export function cartXZ(p, lx, lz) { const c = Math.cos(p.yaw), s = Math.sin(p.yaw); return [p.x + c * lx + s * lz, p.z - s * lx + c * lz]; }

// on foot between two places: the trails when they help (npcs.js's NavGraph), through a gate when one end is in the yard
function footPath(a, b) {
  const inA = pointInPoly(a[0], a[1], YARD), inB = pointInPoly(b[0], b[1], YARD);
  const r = (p, q) => (WORLD.route ? WORLD.route(p[0], p[1], q[0], q[1]) : [p, q]);
  if (inA === inB) return r(a, b);
  // through the nearer gate: the front gate (to the road side) or the park gate
  const gates = GATES.map(g => (g.axis === 'x' ? { o: [g.x, g.z - 1.6], i: [g.x, g.z + 1.4] } : { o: [g.x - 1.6, g.z], i: [g.x + 1.4, g.z] }));
  const out = inA ? b : a;
  const G = gates.slice().sort((p, q) => Math.hypot(p.o[0] - out[0], p.o[1] - out[1]) - Math.hypot(q.o[0] - out[0], q.o[1] - out[1]))[0];
  return inA ? join(r(a, G.i), [G.o], r(G.o, b)) : join(r(a, G.o), [G.i], r(G.i, b));
}

// for joyce-evening.js: the walk's loops, and a way on foot between two places (the trails when they help)
export function joyceLoops() { return walkLoops(); }
export function joyceRoute(a, b) { return footPath(a, b); }

// ------------------------------------------------------------------ the power walk (the town's sidewalks, a park detour)
let LOOPS = null;
function walkLoops() {
  if (LOOPS) return LOOPS;   // (homeOf() forgets it when the street is built)
  const H = homeOf();
  const bren = ROADS.find(r => r.id === 'breneland-rd').pts;
  const maple = ROADS.find(r => r.id === 'maple-ave'), summit = ROADS.find(r => r.id === 'summit-rd');
  const mW = maple.pts[0][0] - maple.width / 2 - 1.6, sS = summit.pts[0][1] + summit.width / 2 + 1.6, sN0 = summit.pts[0][1];
  // the inner sidewalk round Breneland Rd's bend, from Summit Rd down to the straight (the right-hand offset of the road's line)
  const inner = offsetRight(bren.filter(p => p[0] < -80), 4.5 + 1.6).filter(p => p[1] < WALK_N + 0.2 && p[1] > sS - 0.2).reverse();
  const start = [H.x, WALK_N];
  const lap = join([start, [50, WALK_N], [mW, WALK_N], [mW, sS], [52, sS], [-101.4, sS]], roundCorners(inner, 6), [[-89, WALK_N], start]);
  // the park detour: over the zebra at x -92 (layout.js CROSSINGS), the park-north trail, the park trail to the park gate, back
  const cross = LAYOUT.CROSSINGS.find(c => c.road === 'breneland-rd' && c.x < -80) || { x: -92 };
  const trail = (LAYOUT.TRAILS.find(t => t.name === 'park-north')?.pts || []).filter(Array.isArray).slice().reverse();
  const park = [[cross.x, WALK_N], [cross.x, WALK_S - 0.4], ...trail.slice(1), [-64, -19], [-52, -13]];
  const parkLap = join([start, [50, WALK_N], [mW, WALK_N], [mW, sS], [52, sS], [-101.4, sS]], roundCorners(inner, 6), [[cross.x, WALK_N]], park, park.slice(0, -1).reverse(), [[-89, WALK_N], start]);
  void sN0;
  LOOPS = { lap, parkLap, start };
  return LOOPS;
}
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
    const cosHalf = Math.max(0.4, nx * -d0z + nz * d0x);
    out.push([p[0] + nx * d / cosHalf, p[1] + nz * d / cosHalf]);
  }
  return out;
}

// ------------------------------------------------------------------ the day plan: segments over s (seconds since Eastern midnight)
//   in      indoors (hidden); home: true = she may step out to her flower bed in this stretch
//   walk    { pts, len, v, mode, power }
//   still   { x, z, yaw, anim, mode }
//   ride    seated in the cart: { D } driving, or { D: null } sitting in the parked cart
//   garden  her beats round the garden's spots
function planner() {
  const segs = []; let u = 0;
  const P = {
    segs, get u() { return u; },
    in(t1, o = {}) { if (t1 > u) { segs.push({ kind: 'in', t0: u, t1, ...o }); u = t1; } },
    walk(pts, o = {}) { const len = polylineLength(pts), v = o.v || FOOT_V; segs.push({ kind: 'walk', t0: u, t1: u + len / v, pts, len, v, ...o }); u += len / v; },
    still(dur, x, z, yaw, anim, o = {}) { segs.push({ kind: 'still', t0: u, t1: u + dur, x, z, yaw, anim, ...o }); u += dur; },
    ride(D, dur = D ? D.T : 1, o = {}) { segs.push({ kind: 'ride', t0: u, t1: u + dur, D, ...o }); u += dur; },
    legs(L) { for (const l of L) { if (l.gate) P.ride(null, GATE_WAIT, { gate: l.gate }); else { P.ride(l.D); P.ride(null, 0.6); } } },
    garden(t1) { if (t1 > u) { segs.push({ kind: 'garden', t0: u, t1 }); u = t1; } },
  };
  return P;
}
function segAt(segs, u) {
  let lo = 0, hi = segs.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (segs[m].t0 <= u) lo = m; else hi = m - 1; }
  return segs[lo];
}

function buildPlan() {
  const H = homeOf(), R = routes(), S = gardenSpots();
  const P = planner();
  const out = H.step;
  // ---- the power walk: laps sized so the whole walk takes about 40 minutes at a brisk 1.4-1.9 m/s
  const L = walkLoops(), lens = [polylineLength(L.lap), polylineLength(L.parkLap)];
  const legs = polylineLength([H.door, out, [H.x, WALK_N]]) * 2;
  const budget = JOYCE_HOURS.walkMin * 60 - 12;
  let n = 1;
  for (let k = 1; k < 30; k++) { const tot = lapsLen(k, lens) + legs; if (tot / budget > 1.9) break; n = k; if (tot / budget >= 1.45) break; }
  const walkV = (lapsLen(n, lens) + legs) / budget;
  P.in(JOYCE_HOURS.walk * 3600, { sleep: true, from: 'hall', to: 'front' });   // asleep; up and out of the front door at 6
  P.still(3, out[0], out[1], 0, 'stretch', { mode: 'walk', phase: 'walk-out' });
  P.walk([H.door, out, [H.x, WALK_N]], { v: walkV, mode: 'walk', power: 1, phase: 'walk' });
  for (let k = 0; k < n; k++) P.walk(k % 2 ? L.parkLap : L.lap, { v: walkV, mode: 'walk', power: 1, phase: 'walk', lap: k });
  P.walk([[H.x, WALK_N], out, H.door], { v: walkV, mode: 'walk', power: 1, phase: 'walk' });
  P.still(3, H.door[0], H.door[1], Math.PI, 'stretch', { mode: 'walk', phase: 'walk-in' });
  const walkEnd = P.u;
  if (!R || !S) { evening(P, 'front'); return { segs: P.segs, walkEnd, laps: n, walkV }; }
  // ---- to the garden and back (built once; placed at each visit's hours)
  const gp = R.gardenPark, gDoor = driverSpot(gp), hDoor = driverSpot(H.park);
  const atJoyce = [S.joyce.x, S.joyce.z];
  const walkIn = footPath(gDoor, atJoyce), walkOut = walkIn.slice().reverse();
  const inner = JH.pts.innerIn, toCart = [inner, JH.pts.innerOut, H.driver];   // through the garage's inner door to the cart
  // A trip: from getting in to arriving at her spot in the garden (go) or indoors (back). Inside one the cart may wait at its gates
  // (cars.js decides; setCartDelay): everything from then until the trip's end runs that much later, then she is back on the plan.
  const trips = [];
  const go = (P) => {
    P.still(2.5, inner[0], inner[1], -Math.PI / 2, 'idle', { mode: 'home', phase: 'out' });
    P.walk(toCart, { mode: 'home', phase: 'to-cart' });
    P.still(3, hDoor[0], hDoor[1], faceTo(hDoor[0], hDoor[1], H.park.x, H.park.z), 'idle', { mode: 'home', phase: 'board' });   // (Molly hops on)
    const t0 = P.u;
    P.ride(null, 2.5);
    P.legs(R.toGarden);
    P.ride(null, 1.5);
    P.still(2, gDoor[0], gDoor[1], faceTo(gDoor[0], gDoor[1], gp.x, gp.z), 'idle', { mode: 'garden', phase: 'alight' });
    P.walk(walkIn, { mode: 'garden', phase: 'walk-in' });
    trips.push({ t0, tFree: P.u, go: true });
  };
  const back = (P) => {
    P.walk(walkOut, { mode: 'garden', phase: 'walk-out' });
    P.still(3, gDoor[0], gDoor[1], faceTo(gDoor[0], gDoor[1], gp.x, gp.z), 'idle', { mode: 'garden', phase: 'board' });
    const t0 = P.u;
    P.ride(null, 2.5);
    P.legs(R.toHome);
    P.ride(null, 1.5);
    P.still(2, hDoor[0], hDoor[1], faceTo(hDoor[0], hDoor[1], H.park.x, H.park.z), 'idle', { mode: 'home', phase: 'alight' });
    P.walk(toCart.slice().reverse(), { mode: 'home', phase: 'to-door' });
    P.still(2, inner[0], inner[1], Math.PI / 2, 'idle', { mode: 'home', phase: 'in' });
    trips.push({ t0, tFree: P.u, go: false });
  };
  // how long "go" takes (a dry run), so she is in the garden by the hour (with room for the cart to wait at its gates)
  const dry = planner(); go(dry); trips.length = 0; const G = dry.u;
  let from = 'front';
  for (const [a, b] of JOYCE_HOURS.garden) {
    P.in(a * 3600 - G - HOLD_MAX - 20, { home: true, from, to: 'inner' });
    go(P);
    P.garden(b * 3600);
    back(P);
    from = 'inner';
  }
  evening(P, from);
  return { segs: P.segs, walkEnd, laps: n, walkV, goT: G, walkIn, toCart, trips };
}
// home after the garden: her rooms until the evening (joyce-evening.js), the evening, then her rooms until bed (22:30) and asleep
function evening(P, from) {
  P.in(EVENING.start * 3600, { home: true, from });
  P.segs.push({ kind: 'eve', t0: EVENING.start * 3600, t1: EVENING.end * 3600, phase: 'evening' });
  P.in(EVENING.end * 3600);
  P.segs.pop(); P.segs.push({ kind: 'eve', t0: EVENING.start * 3600, t1: EVENING.end * 3600, phase: 'evening' });
  P.in(86400, { home: true, from: 'eve' });
}
function lapsLen(k, lens) { let s = 0; for (let i = 0; i < k; i++) s += lens[i % 2]; return s; }
function plan() {
  if (PLAN && PLAN.key === PLAN_KEY()) return PLAN;
  ROUTES = null;
  PLAN = { key: PLAN_KEY(), ...buildPlan() };
  // the cart's drives in day order (its pose between them is where the last one ended)
  PLAN.drives = PLAN.segs.filter(s => s.kind === 'ride' && s.D);
  PLAN.gates = PLAN.segs.filter(s => s.gate);
  PLAN.trips = PLAN.trips || [];
  return PLAN;
}

// ------------------------------------------------------------------ evaluating the plan
const dayCache = new Map();
const GARDEN_ANIMS = ['garden', 'garden', 'garden', 'look', 'stretch', 'garden'];
// her spot in garden group g of day `day` (stop 0 = her own spot; now and then her chair)
function gardenStop(S, day, g) {
  if (S.chair && hash01('joyce-chair', day, g) < 0.14) return { ...S.chair, chair: true };
  return S.stops[Math.floor(hash01('joyce-stop', day, g) * S.stops.length)];
}
function gardenAt(seg, s, day, S, o) {
  const G = BEAT * GROUP, g = Math.floor(s / G), g0 = Math.floor(seg.t0 / G), g1 = Math.floor((seg.t1 - 50) / G);
  const at = gg => (gg <= g0 + 1 || gg >= g1 ? S.stops[0] : gardenStop(S, day, gg));   // (stop 0 a while after arriving: a cart that waited arrives late)
  const cur = at(g), prev = at(g - 1), u = s - g * G;
  const d = Math.hypot(cur.x - prev.x, cur.z - prev.z), w = d / 0.9;
  const k = Math.floor(s / BEAT);
  o.k = k; o.u = s - k * BEAT; o.arrived = 0;
  if (d > 0.05 && u < w) {
    const f = u / w;
    o.x = prev.x + (cur.x - prev.x) * f; o.z = prev.z + (cur.z - prev.z) * f; o.yaw = faceTo(prev.x, prev.z, cur.x, cur.z); o.speed = 0.9; o.anim = null;
    o.arrived = w; return o;
  }
  o.x = cur.x; o.z = cur.z; o.yaw = cur.yaw ?? 0; o.speed = 0;
  if (cur.chair) { o.anim = 'sit'; o.seatY = cur.seatY ?? 0.3; o.seated = true; } // (her rocking chair's cushion, garden-build.js: 0.3, seat-height)
  else o.anim = GARDEN_ANIMS[Math.floor(hash01('joyce-anim', day, k) * GARDEN_ANIMS.length)];
  if (k * BEAT < g * G + w) o.arrived = g * G + w - k * BEAT;
  return o;
}
// At home: 15-minute slots, each a place: one of her rooms (ROOM_SPOTS, by hash from the hour's pool), now and then (daytime, a
// 30% chance) out front at her flower bed, or bed (hidden: after 22:30 and before her walk). Between slots she walks from one
// place to the next (the house's east half is open plan); a segment starts where she came in (the front door, the garage's inner
// door, the hall from bed, or where the evening left her) and ends walking to where she goes out (seg.to).
const POTTER = 900;
const BED = { kind: 'bed' }, POTTER_PLACE = { kind: 'potter' };
function placeAt(seg, day, j) {
  const a = j * POTTER, b = a + POTTER, h = (a + b) / 2 / 3600;
  if (seg.sleep || h < JOYCE_HOURS.walk || h >= BED_H) return BED;
  if (seg.home && a >= seg.t0 + 30 && b <= seg.t1 - 30 && a >= 7 * 3600 && b <= 20.5 * 3600 && hash01('joyce-potter', day, j) < 0.3) return POTTER_PLACE;
  const pool = h < 9 ? ROOM_POOLS.morning : h >= 21 ? ROOM_POOLS.late : ROOM_POOLS.day;
  const name = pool[Math.floor(hash01('joyce-room', day, j) * pool.length)];
  return { kind: 'room', name, spot: ROOM_SPOTS[name] };
}
const placeIn = pl => (pl.kind === 'room' ? [pl.spot.x, pl.spot.z] : pl.kind === 'bed' ? JH.pts.hall : JH.pts.frontIn);
// where a segment starts: a short path ending inside
function segFrom(seg, day) {
  const P = JH.pts;
  if (seg.from === 'front') return [P.front, P.frontIn];
  if (seg.from === 'inner') return [P.innerIn];
  if (seg.from === 'eve') return [eveningOfDayPlan(day).end];
  return [P.hall];
}
function segTo(seg) { const P = JH.pts; return seg.to === 'front' ? [P.frontIn, P.front] : seg.to === 'inner' ? [P.innerIn] : null; }
const slotFirst = (seg, j) => Math.max(j * POTTER, seg.t0) === seg.t0;
// the point she is at, at the end of slot j of seg (where the next slot or the evening starts from)
function placeEnd(seg, day, j) { return placeIn(placeAt(seg, day, j)); }
function walkPts(pts, d, o, v) {
  const L = polylineLength(pts);
  if (L < 1e-6) { o.x = pts[0][0]; o.z = pts[0][1]; return true; }
  const [x, z, dx, dz] = alongPolyline(pts, Math.min(L, Math.max(0, d)));
  o.x = x; o.z = z; o.yaw = Math.atan2(dx, dz); o.speed = d < L ? v : 0; o.anim = d < L ? null : 'idle';
  return d >= L;
}
function inAt(seg, s, day, H, o) {
  const j = Math.floor(s / POTTER), a = Math.max(j * POTTER, seg.t0), b = Math.min((j + 1) * POTTER, seg.t1);
  const pl = placeAt(seg, day, j);
  const start = slotFirst(seg, j) ? segFrom(seg, day) : [placeEnd(seg, day, j - 1)];
  o.mode = 'home'; o.inside = true; o.phase = pl.kind === 'bed' ? 'indoors' : 'home';
  // leaving the segment: the last stretch walks from this place to the way out
  const to = b === seg.t1 ? segTo(seg) : null;
  if (to) {
    const out = [placeIn(pl), ...to], w = polylineLength(out) / FOOT_V + 0.5;
    if (s >= seg.t1 - w) { walkPts(out, (s - (seg.t1 - w)) * FOOT_V, o, FOOT_V); o.phase = 'going'; return o; }
  }
  if (pl.kind === 'bed') {
    const path = [...start, JH.pts.hall], w = polylineLength(path) / FOOT_V;
    if (s - a < w && start.length && Math.hypot(start[0][0] - JH.pts.hall[0], start[0][1] - JH.pts.hall[1]) > 0.1) { walkPts(path, (s - a) * FOOT_V, o, FOOT_V); o.phase = 'to-bed'; return o; }
    o.hidden = true; o.x = JH.pts.hall[0]; o.z = JH.pts.hall[1]; o.yaw = -Math.PI / 2; o.phase = 'indoors';
    return o;
  }
  if (pl.kind === 'potter') {
    const P = JH.pts, outPath = [...start, P.frontIn, P.front, P.step, H.potter], back = [H.potter, P.step, P.front, P.frontIn];
    const wOut = polylineLength(outPath) / FOOT_V, wBack = polylineLength(back) / FOOT_V, u = s - a;
    o.phase = 'potter';
    if (u < wOut) { walkPts(outPath, u * FOOT_V, o, FOOT_V); o.inside = false; return o; }
    if (s > b - wBack) { walkPts(back, (s - (b - wBack)) * FOOT_V, o, FOOT_V); o.inside = false; return o; }
    const k = Math.floor(s / BEAT);
    o.x = H.potter[0]; o.z = H.potter[1]; o.yaw = faceTo(H.potter[0], H.potter[1], H.bed.x, H.bed.z); o.speed = 0; o.inside = false;
    o.anim = ['garden', 'garden', 'look', 'garden'][Math.floor(hash01('joyce-pot', day, k) * 4)]; o.k = k; o.u = s - k * BEAT; o.arrived = 0;
    return o;
  }
  const sp = pl.spot, path = [...start, [sp.x, sp.z]], w = polylineLength(path) / FOOT_V;
  if (s - a < w) { walkPts(path, (s - a) * FOOT_V, o, FOOT_V); return o; }
  o.x = sp.x; o.z = sp.z; o.yaw = sp.yaw; o.speed = 0; o.anim = sp.anim; o.room = sp.room; o.spot = pl.name; o.mollySpot = sp.molly;
  if (sp.seatY) { o.seatY = sp.seatY; o.seated = true; }
  return o;
}
// where she is when the evening starts (the place of the home segment's last slot before it)
function eveFrom(PL, seg, day) {
  const i = PL.segs.indexOf(seg), prev = PL.segs[i - 1];
  if (!prev || prev.kind !== 'in') return JH.pts.frontIn;
  return placeEnd(prev, day, Math.floor((prev.t1 - 1) / POTTER));
}

// The cart at s (seconds since Eastern midnight): driving, or parked where its last drive ended (at home before the first).
// Fills `out` = { x, z, yaw, v, rev, moving }.
function cartOn(PL, s, out) {
  let found = false;
  for (const sg of PL.drives) {
    if (sg.t0 > s) break;
    found = true;
    if (s < sg.t1) { driveAt(sg.D, s - sg.t0, out); out.moving = true; return out; }
    driveAt(sg.D, sg.D.T, out); out.v = 0; out.rev = false; out.moving = false;
  }
  if (!found) { const p = ROUTES ? ROUTES.homePark : homeOf().park; out.x = p.x; out.z = p.z; out.yaw = p.yaw; out.v = 0; out.rev = false; out.moving = false; }
  return out;
}
// ------------------------------------------------------------------ waiting at the gates (cars.js decides, here it is applied)
const GATE_WAIT = 1.2;      // every gate is a short stop (a look both ways); the traffic may make it longer
export const HOLD_MAX = 40; // the longest the cart waits in one trip (then it goes, and the cars hold back for it)
let DELAY = null;
// cars.js: setCartDelay(t -> seconds the cart has waited so far in the trip under way at shared time t)
export function setCartDelay(fn) { DELAY = fn; }
function tripIndexAt(PL, s) { const T = PL.trips; for (let i = 0; i < T.length; i++) if (s >= T[i].t0 && s <= T[i].tFree + HOLD_MAX + 1) return i; return -1; }
// the plan's time for shared time t (s = its Eastern seconds): inside a trip, the wait behind until the trip is over
function planTime(PL, t, s) {
  if (!DELAY) return s;
  const i = tripIndexAt(PL, s);
  if (i < 0) return s;
  const d = DELAY(t) || 0;
  return s <= PL.trips[i].tFree + d ? s - d : s;
}
// For cars.js's simulation: which trip is under way at ms (-1: none), the gate the cart is waiting at (the points it is about to
// drive through) when `d` seconds behind the plan, and whether those points are clear of the cars ([{ x, z, yaw, v }]).
export function cartTripIndex(ms) { const PL = plan(); return tripIndexAt(PL, hourAt(ms / 1000) * 3600); }
// The crossing the cart is waiting for or driving through at ms: { pts (its whole road part), held (still waiting at the gate) },
// or null. cars.js: while it is held a car stops short of all of it if it can, and one already in the way drives on out of it.
export function cartZone(ms) {
  const PL = plan(), t = ms / 1000, p = planTime(PL, t, hourAt(t) * 3600), S = PL.segs;
  for (const g of PL.gates) {
    if (p < g.t0 - 0.65) break;   // (from the pause before it: the traffic is stepped a step ahead of the frame, so a held cart reads just short of its gate)
    let i = S.indexOf(g) + 1;
    while (i < S.length && !(S[i].kind === 'ride' && S[i].D)) i++;
    if (i < S.length && p < S[i].t1) return { pts: g.gate, held: p < g.t1 };
  }
  return null;
}
export function cartGateAt(ms, d) {
  const PL = plan(), p = hourAt(ms / 1000) * 3600 - d;
  for (const g of PL.gates) if (p >= g.t0 - 1e-6 && p < g.t0 + 0.2 + 1e-6) return g.gate;
  return null;
}
// (a car already stopped and waiting for the cart, `yc`, only counts when it is in the way itself: else the two would wait for
// each other)
export function cartClear(zone, cars) {
  for (const c of cars) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), waiting = c.yc && c.v < 0.5, r = (waiting ? 4.2 : 6.5) + (c.half ? c.half - 2 : 0); // c.half: the bus's half length
    for (const [x, z] of zone) {
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < r * r) return false;
      if (c.v > 0.3) { const along = dx * fx + dz * fz, lat = dx * fz - dz * fx; if (along > 0 && along < 40 && Math.abs(lat) < 3.2) return false; }
    }
  }
  return true;
}
// Where the cart is at ms, cheaply (no Joyce): for cars.js, which also looks a few seconds ahead with it (the cart's schedule
// is known, so the traffic can yield to where it is about to go). Fills and returns `out`.
export function cartAt(ms, out = {}) { const PL = plan(), t = ms / 1000; return cartOn(PL, planTime(PL, t, hourAt(t) * 3600), out); }

// joyceAt(ms): see the header. Returns a new object each call (Molly and the tests keep them).
export function joyceAt(ms) {
  const t = ms / 1000, H = homeOf(), PL = plan(), S = gardenSpots(), s = planTime(PL, t, hourAt(t) * 3600), day = easternDay(ms);
  const seg = segAt(PL.segs, s);
  const o = { x: H.door[0], z: H.door[1], yaw: 0, mode: 'home', hidden: false, speed: 0, anim: 'idle', phase: seg.phase || seg.kind, seatY: 0, power: 0, y: 0, cart: null, seat: null, day };
  const cp = cartOn(PL, s, {}), moving = cp.moving;
  o.cart = cp;
  switch (seg.kind) {
    case 'in': o.mode = 'home'; inAt(seg, s, day, H, o); break;
    case 'eve': joyceEveAt(seg, s, day, o, eveFrom(PL, seg, day)); break;
    case 'walk': {
      const d = Math.min(seg.len, Math.max(0, (s - seg.t0) * seg.v));
      const [x, z, dx, dz] = alongPolyline(seg.pts, d), go = d < seg.len - 1e-6;
      o.x = x; o.z = z; o.yaw = Math.atan2(dx, dz); o.speed = go ? seg.v : 0; o.anim = go ? null : 'idle'; o.mode = seg.mode; o.power = seg.power || 0;
      break;
    }
    case 'still': o.x = seg.x; o.z = seg.z; o.yaw = seg.yaw; o.anim = seg.anim; o.mode = seg.mode; break;
    case 'ride': {
      o.mode = 'cart'; o.anim = 'drive'; o.speed = 0; o.seatY = CART.seatY - CART.floorY;
      const [x, z] = cartXZ(cp, CART.driverX, CART.seatZ), [mx, mz] = cartXZ(cp, CART.passX, CART.seatZ);
      o.x = x; o.z = z; o.yaw = cp.yaw; o.phase = moving ? 'driving' : 'seated';
      const gy = streetY(cp.x, cp.z);
      o.y = gy + CART.floorY;
      o.seat = { x: mx, z: mz, yaw: cp.yaw, y: gy + CART.seatY };
      break;
    }
    case 'garden': o.mode = 'garden'; o.phase = 'garden'; gardenAt(seg, s, day, S, o); break;
  }
  if (seg.kind !== 'ride') o.y = streetY(o.x, o.z);
  if (seg.kind !== 'in' && seg.kind !== 'eve') o.inside = false;
  else if (o.inside === undefined) o.inside = o.x > JH.minX && o.x < JH.maxX && o.z > JH.sun.minZ && o.z < JH.FZ;
  return o;
}
// Is Joyce in the garden at ms (her hours there; she may be walking between her spots)? For the garden game.
export function joyceInGarden(ms) { const j = joyceAt(ms); return j.mode === 'garden' && j.phase === 'garden'; }
// For tests and pictures: the day's plan and routes
export function joycePlan() { return { plan: plan(), routes: routes(), home: homeOf(), spots: gardenSpots(), loops: walkLoops() }; }

// ------------------------------------------------------------------ npcs.js glue: her state as an NPC (lines, the seat)
// d = her npcs def (lines from areas.js). The state npcs.js draws: x, z, y, yaw, speed, anim, hidden, snap (in the cart: no
// easing, she sits exactly in the seat), seatY / power (joyceDress), entry (a line to say once a beat).
export function joyceState(d, t) {
  const j = joyceAt(t * 1000);
  const s = { x: j.x, z: j.z, y: j.y, yaw: j.yaw, speed: j.speed, anim: j.anim, hidden: j.hidden, seatY: j.seatY, power: j.power, joyce: j };
  if (j.mode === 'cart') { s.snap = true; s.seated = true; s.riding = true; }
  if (j.seated) s.seated = true;
  if (j.k !== undefined && !j.speed) {
    const k = j.k, mood = moodAt(t), dark = isDark(mood), al = j.phase === 'garden' ? areaLines('garden', mood) : null;
    const pool = al ? (al.replace ? al.lines : d.lines.concat(al.lines)) : j.phase === 'potter' ? POTTER_LINES : j.inside || j.phase === 'evening' ? [] : d.lines;   // (no bubbles through her walls: the evening's chatter is joyce-house.js's)
    const talk = hash01('joyce-line', j.day, k) < (dark ? 0.12 : 0.3);
    s.entry = { line: talk && pool.length ? pool[Math.floor(hash01('joyce-pick', j.day, k) * pool.length)] : null, lineDelay: hash01('joyce-delay', j.day, k) * 4 };
    s.k = k; s.u = j.u; s.arrived = j.arrived;
  }
  return s;
}
const POTTER_LINES = ['These petunias need a drink.', 'Hello, neighbor!', 'Gnome sweet gnome.', 'Lovely day for it.'];
// the seat height and the power walk's arms (bodies-poses.js params)
export function joyceDress(body, s) {
  const p = body.params;
  if (!p) return;
  p.seatY = s.seatY || 0;
  p.power = s.power || 0;
}
void mulberry32; void TAU;
