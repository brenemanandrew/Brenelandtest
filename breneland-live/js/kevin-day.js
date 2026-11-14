// Kevin's week, a PURE FUNCTION of the shared clock (hash01 only, no Math.random), so every visitor sees him in the same place
// doing the same thing. He lives in the loft over his shop, Kevin's Tool Crib on Summit Rd (tool-crib-plan.js, tool-crib.js):
//   night        asleep in the loft (hidden), the loft's lamp on for a while after he comes in
//   Mon-Fri      up at 7:30 (the kettle, a look out of the window, the apron on), down the stair at 7:50, the card turned at 8;
//                the shop 8 to 5: on his stool behind the counter, tidying a shelf, sorting the springs, hanging a tool on the
//                pegboard, the paint wall, the broom, and a word with each customer who drops in (tool-crib-plan.js cribVisits).
//                5 pm the card turned again, cashing up, up the stair to change (5:05), down in his fishing things (5:20), out
//                and along the sidewalks to the pier, where he fishes till 7 (the usual plan in npcs.js: kevinState() is null)
//   Saturday     up at 6:15, down the stair at 6:55, the shop 7 to 11 (as a weekday, customers too), the card turned at 11, a
//                quick cash-up, the apron off, out with his toolbox to two odd jobs (as Sunday's, fewer), from about 2:20 the pier
//   Sunday       a lie-in, out at 8, three odd jobs round town (the day's seed picks them: the yard fence, the front gate, a
//                mailbox, a gutter from a ladder, the bench outside the pizza place, a new slat for the bus shelter's bench), each a walk there,
//                a while at it with the tool in hand and a word for anyone near; back at the shop by about 1:30 to polish his
//                motorcycle; 1:50 the helmet on, the roll-up door up, the bike wheeled out onto its pad, and from about 2 till 5
//                the Sunday ride (crib-move, Andrew: "take his motorcycle out for a spin (Sundays from 2 to 5)"): laps of the
//                town's roads in the right-hand lane (east along Summit Rd, down Maple Ave, west along Breneland Rd and up round
//                the bend, back along Summit Rd), home up the drive, the bike wheeled back into its corner, the door down, the helmet
//                hung up, then the rod from the loft and the pier as on a weekday
//   7 pm         stands his "Gone fishing 7pm-11pm" sign up and packs his fishing stuff at the pier (rod, tackle box,
//                cooler). Then, carrying his rod and tackle box, wanders round the yard and the park for 10-25 minutes
//                looking for company. He finds one of the always-present residents (the day's seed picks who: crewPick),
//                asks them along (an invitation, a yes, in balloons) and they walk back to the pier together. Both board
//                (Kevin at the tiller in the stern, the companion on the bow seat), he waits a little for anyone else
//                (players: kevin-crew.js, a server-held seat claim), pushes off, turns the boat round in open water,
//                unfurls the sail and sails ~60 m out. Then he furls it, takes a beer and fishes, loosely, all evening.
//   11 pm        sails back, the companion walks home, Kevin packs up, takes the sign in and walks home to the loft
// kevinState(t) -> null (at the pier, the usual plan) or { x, z, y?, yaw, speed, anim, hidden, snap, seatY, rod, beer, broom,
// tackle, apron, tool, toolbox, plank, loft, job, helmet, onBike, bike: { x, z, heading, lean, speed, riding, wheel } (his
// motorcycle whenever it is out of its corner: tool-crib.js draws it there), boat: { x, z, yaw, sail 0..1, moored, out, speed }, sign } where boat/sign are
// also returned while he is at the pier (kevinBoat(t) gives just those). rod: 'hand' | 'off' | 'holder' (in the boat's rod
// holder); beer: 'cooler' | 'hand' | 'bench'. y: his floor in the shop, on the stair or in the loft (or a ladder's rung).
// crewMateState(d, t, ...) is the companion's state while Kevin has them. Kevin is a man of few words: his lines are short.
import { hash01, alongPolyline, polylineLength, mulberry32 } from './util.js';
import { sinceHour, hourAt } from './npcs-day.js';
import { DOCK, KEVIN_LOOKOUTS, LANE_OFFSET, CRIB_PAD, STRIP_MALL } from './layout.js';
import { TOWN_HOUSES, TOWN_MAILBOXES } from './world-town.js';
import { CRIB, cribFloorY, cribVisits, cribWeekday, isSaturday, CRIB_HOURS, SAT_HOURS, toWorld, worldYaw } from './tool-crib-plan.js';
import { offsetRight, roundCorners, drive, driveAt } from './buddy-day.js';

export const KEVIN_HOURS = { wake: 7.5, open: 8, close: 17, sail: 19, back: 23, satWake: 6.25, satOpen: 7, satClose: 11 };
const WALK = 1.15;                                   // an old man's pace (m/s)
const SAIL_V = 1.7;                                  // the boat under sail
const PUSH_V = 0.9;                                  // pushing off the pier (backing out, before he turns her round)
export const PIER_SEAT = { x: DOCK.maxX - 1.2, z: (DOCK.minZ + DOCK.maxZ) / 2, yaw: Math.PI / 2 };
export const SIGN = { x: 50.2, z: -20.55, yaw: -Math.PI / 2 };  // the sign at the head of the pier, facing the trail (west)
const SIGN_STAND = [50.95, -20.3];                    // where he crouches to stand it up
const PIER_HEAD = [51.4, -19.2];

// ---- the boat (kevin-boat.js builds it to these numbers): room for three
export const BOAT = { HL: 4.7, HB: 1.84, SHEER: 0.66, DEPTH: 1.0, FLOOR: 0.06 }; // half-length, half-beam, gunwale, bilge, floor
export const OLD_BOAT = { HL: 2.35, HB: 0.92 };                                  // the old boat, for the tests
// The seats in the boat's own frame (bow +z, +x = the side he fishes over): Kevin at the tiller in the stern, a crew
// seat on the thwart and one on the bow seat, each with its own rod holder. `side` is the way that sitter faces to fish.
export const BOAT_SEATS = [
  { id: 'kevin', x: 0, z: -3.35, seat: 0.3, side: 1 },   // (seat-height: every seat 0.3 over the cockpit floor, were 0.44: the feet hung 13 cm)
  { id: 'crew1', x: 0.45, z: -0.95, seat: 0.3, side: 1 },
  { id: 'crew2', x: -0.4, z: 1.05, seat: 0.3, side: -1 },
];
export const BOAT_SEAT = { z: BOAT_SEATS[0].z, floor: BOAT.FLOOR, seat: BOAT_SEATS[0].seat }; // Kevin's, the older name
// alongside the pier's north edge, bow toward the shore (west): she comes in bow first from the lake and pushes off
// stern first, so she never has to turn round beside the boards
export const MOOR = { x: 60.0, z: DOCK.minZ - 0.12 - BOAT.HB, yaw: -Math.PI / 2 };
const PIVOT = [MOOR.x + 11.5, MOOR.z - 0.7];           // clear of the pier's end: where she is turned round
const RETURN_VIA = [MOOR.x + 15, MOOR.z - 0.25];        // lined up with the berth, coming in
// spots ~55-70 m out on Lake Tamakiya (all open water)
export const SPOTS = [[118, -30], [114, -12], [111, -46], [123, -21], [108, -2], [116, -56], [127, -38]];
export const BOB = t => 0.06 * Math.sin(t * 1.3);   // the boat and everyone in it share it

// A seat (or any point in the boat's frame) in the world, for the boat pose B: { x, z, yaw }
export function boatToWorld(B, lx, lz) {
  const c = Math.cos(B.yaw), s = Math.sin(B.yaw);
  return { x: B.x + c * lx + s * lz, z: B.z - s * lx + c * lz };
}
export function seatWorld(B, i, t) {
  const S = BOAT_SEATS[i], p = boatToWorld(B, S.x, S.z);
  return { x: p.x, z: p.z, y: BOB(t) + BOAT.FLOOR, yaw: B.yaw, seatY: S.seat, side: S.side };
}
// where you stand on the pier to climb into seat i of the moored boat
export const BOARD_SPOTS = BOAT_SEATS.map(S => { const p = boatToWorld(MOOR, S.x, S.z); return [p.x, DOCK.minZ + 0.32]; });
const BOARD = BOARD_SPOTS[0];
const PACK = [MOOR.x + 1.6, DOCK.minZ + 0.65];         // where he packs, on the boards beside the boat

const ARRIVE = [36, -25.5];   // where the trails reach the dock lawn

const ease = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const dayKey = t0 => Math.floor((t0 + 43200) / 86400);
const angLerp = (a, b, k) => { let d = b - a; d -= Math.PI * 2 * Math.round(d / (Math.PI * 2)); return a + d * k; };

// ---- who may come fishing: the always-present residents of the park and the yard (npcs.js tells us who exists in
// this lobby, in this fixed order). Never Buddy or Carol (their booth), never the mail carrier, Mabel or the town folk
// (the phone's town cast could leave them unbuilt). The Reporter is out from 8 am to 1 am, the rest never leave.
export const CREW_POOL = ['Detective', 'Professor', 'Reporter', 'Sam', 'Riley', 'Jo', 'Scout Remy', 'Priya'];
// (the Detective, the Professor and the Reporter live in the Lovecraft house and aren't npcs.js folk. Priya from the picnic lawn
// by the dock is home until 23:12, after the boat is back)
let POOL = [];            // [{ name, x, z, r }] present in this lobby (their area's middle and radius)
let ROUTE = null;         // (ax, az, bx, bz) -> polyline along the trails (npcs.js NavGraph)
// npcs.js calls this once it has built everyone (the evening plans depend on it, so their caches are cleared)
export function setKevinWorld({ pool, route }) {
  POOL = (pool || []).filter(p => CREW_POOL.includes(p.name)).sort((a, b) => CREW_POOL.indexOf(a.name) - CREW_POOL.indexOf(b.name));
  ROUTE = route || null;
  eveningCache.clear();
}
const route = (a, b) => (ROUTE ? ROUTE(a[0], a[1], b[0], b[1]) : [a, b]).map(p => [p[0], p[1]]);
// the companion of the evening that starts at t0 (null when nobody is about)
export function crewPick(key) { return POOL.length ? POOL[Math.floor(hash01('kevin-crew', key) * POOL.length)] : null; }

// ---- the shop and the loft (tool-crib-plan.js): walks inside go out from the door along spokes, so a walk from one spot to
// another is the one spoke back and the other out (their shared start dropped)
// (crib-move) the plan's spots and walk points are in the crib's own frame; Kevin walks the world, so every one is turned to it
// here (toWorld, worldYaw), once. KEVIN_SPOTS / KEVIN_WALK are the world copies (tool-crib.js walks the customers by them).
const C = CRIB, S = C.stair;
const wp = (x, z) => toWorld(x, z);
const W = Object.fromEntries(Object.entries(C.W).map(([k, p]) => [k, wp(p[0], p[1])]));
const K = Object.fromEntries(Object.entries(C.K).map(([k, [x, z, yaw]]) => [k, [...wp(x, z), worldYaw(yaw)]]));
export const KEVIN_SPOTS = K, KEVIN_WALK = W;
const STREET_Z = -120.5;                                       // Summit Rd's south sidewalk: the town's walks run along it (Maple Ave, the shops)
const WALK_Z = C.world.walkZ, FRONT = C.front;                 // the crib's own sidewalk (the north one since crib-move) and which way its front faces (+1: +z)
const sp = k => [K[k][0], K[k][1]];
const SPOKES = (() => {
  const shop = [W.in, W.hub], loft = [...shop, W.west, wp(C.W.west[0] + 0.2, S.z0 - 0.85), W.foot, W.top, W.landing, W.loftMid];
  const behind = [...shop, wp(C.counter.minX - 0.25, C.counter.maxZ + 0.6), W.behind];
  // out of the door, down the steps and the walk to the crib's own sidewalk; `street` goes on over Summit Rd (the zebra at the
  // crib's walk, layout.js CROSSINGS) to the south sidewalk, where every town route starts
  const walk = [W.in, W.porch, W.out, wp(C.sx, C.steps[0].minZ - 0.4), [C.sx, WALK_Z]];
  return {
    in: [W.in], hub: shop, walk, street: WALK_Z === STREET_Z ? walk : [...walk, [C.sx, STREET_Z]],
    stool: [...behind, sp('stool')], till: [...behind, sp('till')],
    shelfA: [...shop, sp('shelfA')], shelfB: [...shop, sp('shelfB')], shelfC: [...shop, sp('shelfC')],   // (the shelves stop short of the roll-up door since crib-clutter)
    springs: [...shop, wp(C.W.hub[0], C.K.springs[1]), sp('springs')], peg: [...shop, sp('peg')], peg2: [...shop, sp('peg2')],
    paint: [...shop, W.back, sp('paint')], sign: [W.in, sp('sign')], sweep: [W.in, sp('sweep')],
    moto: [...shop, sp('shelfC'), sp('moto')],   // (crib-move) to his motorcycle's side past the east shelves, clear of the tyre stack and the bargain table
    top: loft.slice(0, -2), landing: loft.slice(0, -1), loftMid: loft,
    wardrobe: [...loft, sp('wardrobe')], kettle: [...loft, sp('kettle')], window: [...loft, wp(C.K.kettle[0] + 0.5, C.K.kettle[1] + 0.05), sp('window')],
    rack: [...loft.slice(0, -1), sp('rack')], bed: [...loft, sp('bed')],
    // the customers' spots (tool-crib.js walks them)
    cust: [W.in, sp('cust')], custPay: [W.in, wp(C.K.cust[0], C.counter.maxZ - 0.4)], custShelf: [...shop, sp('custShelf')], custPeg: [...shop, sp('custPeg')],
    custPaint: [...shop, W.back, sp('custPaint')], custTable: [...shop, sp('custTable')],
  };
})();
// the walk from spot a to spot b inside (names of SPOKES)
export function cribPath(a, b) {
  const A = SPOKES[a], B = SPOKES[b];
  let k = 0;
  while (k < A.length && k < B.length && A[k] === B[k]) k++;
  return [...A.slice(Math.max(0, k - 1)).reverse(), ...B.slice(k)];
}
export const CRIB_SPOKES = SPOKES;
const STAIR_V = 0.5;                                           // up and down the stair: one tread at a time
const sameP = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
const isStair = (q, p) => (sameP(q, W.foot) && sameP(p, W.top)) || (sameP(q, W.top) && sameP(p, W.foot));
// the town: Summit Rd's sidewalk to Maple Ave, down it and over Breneland Rd to its south sidewalk, in at our front gate
const MAPLE = [[-25.5, STREET_Z], [-25.5, -50]];
const GATE_IN = [[2.5, -42.2], [2.5, -39.4], [3.4, -35], [4.2, -29], [12, -30.5], [19, -30], [27, -27.5], ARRIVE];
const BREN_Z = -43.2;                                          // Breneland Rd's south sidewalk
// from a street spot { st: 'summit' | 'bren', x } to another (both on the sidewalks)
function streetRoute(a, b) {
  const pa = [a.x, a.st === 'summit' ? STREET_Z : BREN_Z], pb = [b.x, b.st === 'summit' ? STREET_Z : BREN_Z];
  if (a.st === b.st) return [pa, pb];
  const bren = a.st === 'bren' ? a : b, corner = [bren.x < -25.5 ? -30 : -18, BREN_Z];
  return a.st === 'summit' ? [pa, ...MAPLE, corner, pb] : [pa, corner, ...MAPLE.slice().reverse(), pb];
}
const PIER_WALK = [ARRIVE, [PIER_HEAD[0] - 0.6, -20.9], PIER_HEAD, [PIER_SEAT.x, PIER_SEAT.z]];
const CRIB_ST = { st: 'summit', x: C.sx }, GATE_ST = { st: 'bren', x: 2.5 };
export const KEVIN_ROUTES = { CRIB_ST, GATE_ST, GATE_IN, PIER_WALK, streetRoute }; // (tests)

// ---- the odd jobs at the weekend: each a walk there, a while at it with the tool in hand (a step back now and then to look),
// a line for anyone near (tool-crib.js says it). at: where he stands [x, z, yaw], y: off the ground (a ladder), via: from the
// sidewalk to the spot, prop: what stands there while he works (tool-crib.js draws it). Never at Joyce's place (they don't get
// along): not her house across Breneland Rd, not her garden.
export const LUMBER_RACK = { x: C.maxX + 0.75, z: C.zL - 5.75 };  // the boards on the shop's maxX wall (tool-crib-build.js builds to this, in the plan's frame), between the roll-up door and the front (crib-clutter)
const RACK_W = (() => { const [x, z] = wp(LUMBER_RACK.x, LUMBER_RACK.z); return { x, z }; })();   // where it stands in the world (the wall toward the post office since crib-move)
const SHELTER = { x: -117.0, z: -94.2 };                          // in front of the bus shelter's bench (BUS_STOP.shelter faces east)
function jobList() {
  const jobs = [];
  jobs.push({ id: 'fence', title: 'mending the yard fence', st: 'bren', x: 14, at: [14, -41.05, 0], anim: 'hammer', tool: 'hammer', prop: { kind: 'toolbox', x: 14.8, z: -41.55 }, line: 'Loose picket. Two nails and she is good as new.' });
  jobs.push({ id: 'gate', title: 'oiling the front gate', st: 'bren', x: 3.75, at: [3.75, -41.0, -0.25], anim: 'garden', tool: 'oilcan', prop: { kind: 'toolbox', x: 4.65, z: -41.5 }, line: 'A drop of oil and she swings like new.' });
  const row = TOWN_HOUSES.filter(h => h.facing === -1).sort((a, b) => a.x - b.x);
  const boxes = TOWN_MAILBOXES.filter(m => m.house.facing === -1).sort((a, b) => a.x - b.x);
  if (boxes.length) jobs.push({ id: 'mailbox', title: 'straightening a mailbox', pick: boxes, make: m => ({ st: 'summit', x: m.x, at: [m.x, m.z - 1.0, 0], anim: 'tinker', tool: 'wrench', prop: { kind: 'toolbox', x: m.x + 0.85, z: m.z - 1.25 }, where: m.name || null }), line: 'This one was leaning like a tired sailor.' });
  if (row.length) jobs.push({ id: 'gutter', title: 'clearing a gutter', pick: row, make: h => {
    const front = h.z - h.d / 2, lx = h.x + 2.0, eave = 0.3 + (h.h || 4.2), foot = front - 1.3, top = front - 0.55, rung = 1.25, k = rung / (eave - 0.34);
    return { st: 'summit', x: lx, at: [lx, foot + (top - foot) * k - 0.32, 0], y: 0.34 + rung, anim: 'reach', tool: 'scoop', prop: { kind: 'ladder', x: lx, z: foot, z1: top, y1: eave - 0.1 } };
  }, line: 'Leaves in the gutter again. Every autumn!' });
  jobs.push({ id: 'bench', title: 'painting the bench outside the pizza place', st: 'summit', x: STRIP_MALL.bench.x, at: [STRIP_MALL.bench.x, STRIP_MALL.bench.z - 0.95, 0], anim: 'paint', tool: 'brush', prop: { kind: 'paintcan', x: STRIP_MALL.bench.x + 1.2, z: STRIP_MALL.bench.z - 0.8 }, line: 'Fresh coat of green. Mind, it is wet!' }); // (strip-mall: the bench on the mall's walkway, layout.js STRIP_MALL.bench; it was the bakery's)
  // the boards: from the rack on the shop's east wall to the bus shelter, then a new slat on its bench
  jobs.push({ id: 'lumber', title: 'fixing the bus shelter bench', st: 'summit', x: -120.2, carry: true,
    via: [[-120.2, STREET_Z], [-120.2, -105], [-118.4, -100], [SHELTER.x, SHELTER.z - 2.4], [SHELTER.x, SHELTER.z]],
    at: [SHELTER.x, SHELTER.z, -Math.PI / 2], anim: 'hammer', tool: 'hammer', prop: { kind: 'lumber', x: SHELTER.x + 0.2, z: SHELTER.z + 1.3 }, line: 'New slat for the bench. Nobody likes a splinter.' });
  return jobs;
}
// a job made concrete for the day (a house or a mailbox picked by the day's seed)
function jobFor(j, key) {
  if (!j.pick) return j;
  const o = j.pick[Math.floor(hash01('kevin-job-at', key, j.id) * j.pick.length)];
  return { ...j, ...j.make(o), pick: null, make: null };
}
// the spot's walk from the sidewalk
const viaOf = j => j.via || [[j.x, j.st === 'summit' ? STREET_Z : BREN_Z], [j.at[0], j.at[1]]];

// ---- a plan: a list of segments over u (seconds since the plan's hour); each has t0, t1 and a kind
//   walk { pts, len, v }       on foot along a path (rod in hand unless said otherwise)
//   still { x, z, yaw, anim }  standing (or crouching, or sitting) doing something
//   boat { pts | at, sail0, sail1, act }   in the boat: travelling along pts, or anchored at `at` doing act
function planner() {
  const segs = []; let u = 0;
  const walk = (pts, o = {}) => {
    const clean = pts.filter((p, i) => i === 0 || !sameP(p, pts[i - 1])), v = o.v || WALK, len = polylineLength(clean);
    if (clean.length < 2 || len < 1e-6) return null;
    segs.push({ kind: 'walk', t0: u, t1: u + len / v, pts: clean, len, ...o, v }); u += len / v; return segs[segs.length - 1];
  };
  const still = (dur, x, z, yaw, anim, o = {}) => { segs.push({ kind: 'still', t0: u, t1: u + dur, x, z, yaw, anim, ...o }); u += dur; return segs[segs.length - 1]; };
  const boat = (dur, o) => { segs.push({ kind: 'boat', t0: u, t1: u + dur, ...o }); u += dur; return segs[segs.length - 1]; };
  // a walk inside the shop from spot a to spot b, slowly on the stair
  const inside = (a, b, o = {}, extra = null) => {
    const pts = cribPath(a, b).concat(extra || []), out = [];
    let cur = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (isStair(pts[i - 1], pts[i])) { if (cur.length > 1) out.push([cur, 0]); out.push([[pts[i - 1], pts[i]], STAIR_V]); cur = [pts[i]]; } else cur.push(pts[i]);
    }
    if (cur.length > 1) out.push([cur, 0]);
    for (const [ps, v] of out) walk(ps, { ...o, v: v || o.v, stair: !!v });
  };
  return { segs, walk, still, boat, inside, get u() { return u; }, set u(v) { u = v; } };
}
// a walk inside that takes the stair: linger at `spot` first so he is on the treads at plan time `at`
function stairBy(P, from, to, at, spot, o, extra) {
  const pts = cribPath(from, to), i = pts.findIndex((p, k) => k && isStair(pts[k - 1], p));
  const before = polylineLength(pts.slice(0, i)) / WALK, wait = at - 4 - before - P.u;
  if (wait > 0) P.still(wait, spot[0], spot[1], spot[2], 'look', o);
  P.inside(from, to, o, extra);
}

const H = (key, ...s) => hash01('kevin-day', key, ...s);

// The day from his wake-up (u = 0: 7:30, 6:15 on Saturday) until he reaches his spot on the pier. A weekday: the loft, down the
// stair before 8, the shop 8 to 5 (the counter, the shelves, the springs, the pegboard, the paint, the broom, the customers), the
// card turned at 5, up to change, down in his fishing things, off to the pier. Saturday: up early, down the stair before 7, the
// shop 7 to 11, the card turned, out with his toolbox to two odd jobs (the time left before the pier), the pier from about 2:20.
// Sunday: a lie-in, out at 8, four odd jobs, the pier from about 2:20.
const dayCache = new Map();
function dayPlan(key, t0) {
  let d = dayCache.get(key);
  if (d) return d;
  const P = planner(), wd = cribWeekday(t0 + 3600), work = wd >= 1 && wd <= 5, sat = wd === 6, says = [];
  const wakeH = sat ? KEVIN_HOURS.satWake : KEVIN_HOURS.wake, atH = h => (h - wakeH) * 3600; // (u at an hour of the day)
  const o = (x = {}) => ({ rod: 'off', ...x });
  const at = (k, dur, anim, x = {}) => P.still(dur, K[k][0], K[k][1], K[k][2], anim, o(x));
  let where = 'bed', jobs = null, ride = null;
  const go = (k, x = {}) => { if (where !== k) P.inside(where, k, o(x)); where = k; };
  const late = work || sat ? 0 : 15 * 60;                    // (a lie-in on Sunday)
  const shopDay = work || sat, hrs = sat ? SAT_HOURS : CRIB_HOURS;
  at('bed', 120 + late, 'idle', { hidden: true, loft: true, asleep: true });
  go('kettle', { loft: true }); at('kettle', 270, 'tinker', { loft: true });
  go('window', { loft: true }); at('window', 150, 'look', { loft: true });
  go('wardrobe', { loft: true }); at('wardrobe', 100, 'reach', { loft: true, apron: shopDay });
  const walkT = (a, b) => (a === b ? 0 : polylineLength(cribPath(a, b)) / WALK);
  let tOpen = 0;
  if (shopDay) {
    // down the stair ten minutes before opening (five on Saturday: 7:50, 6:55; on the treads then), the card turned at opening
    tOpen = atH(hrs[0]);
    stairBy(P, 'wardrobe', 'sign', tOpen - (sat ? 5 : 10) * 60, K.wardrobe, o({ loft: true, apron: true }));
    where = 'sign';
    if (P.u < tOpen - 12) at('sign', tOpen - 12 - P.u, 'look', { apron: true });
    at('sign', 12, 'reach', { apron: true, turn: true });
    // the shop: blocks of work between the customers' visits (at the counter while they talk and pay)
    const t8 = t0 + tOpen, visits = cribVisits(t8), close = atH(hrs[1]);
    const busy = visits.flatMap(v => [[tOpen + v.u0 + v.chat0 - 6, tOpen + v.u0 + v.chat1, 'stool', 'talk', v], [tOpen + v.u0 + v.pay0 - 4, tOpen + v.u0 + v.pay1, 'till', 'tinker', v]]);
    const TASKS = [['stool', 'sit'], ['stool', 'sit'], ['stool', 'sit'], ['shelfA', 'reach'], ['shelfB', 'tinker'], ['shelfC', 'reach'], ['springs', 'tinker'], ['springs', 'tinker'],
      ['peg', 'reach', 'hammer'], ['peg2', 'reach', 'wrench'], ['paint', 'reach'], ['sweep', 'sweep']];
    const SIT = ['sit', 'look', 'think', 'sit', 'sit', 'look']; // (on the stool: sit, or a seated look round or think)
    let j = 0, bi = 0;
    while (P.u < close - 0.5) {
      const nb = busy[bi], until = nb ? Math.min(nb[0], close) : close;
      if (nb && P.u >= nb[0] - 0.5) { // a customer at the counter
        go(nb[2], { apron: true });
        at(nb[2], Math.max(0.5, nb[1] - P.u), nb[3], { apron: true, seatY: nb[2] === 'stool' ? C.stool.seatY - C.stool.rung : 0, rung: nb[2] === 'stool' ? C.stool.rung : 0, cust: nb[4].i, task: nb[2] === 'stool' ? 'chat' : 'pay' });
        bi++; continue;
      }
      const tk = TASKS[Math.floor(H(key, 'task', j) * TASKS.length)], dur = 150 + 180 * H(key, 'dur', j); j++;
      if (tk[0] !== 'stool' && walkT(where, tk[0]) + dur + walkT(tk[0], 'stool') + 4 < until - P.u) {
        go(tk[0], { apron: true });
        const n = Math.max(1, Math.round(dur / 45));
        for (let i = 0; i < n; i++) at(tk[0], dur / n, i % 3 === 2 ? 'look' : tk[1], { apron: true, tool: tk[2] || null, broom: tk[0] === 'sweep', task: tk[0] });
        continue;
      }
      // the counter: on his stool till the next thing (a look round, a think)
      go('stool', { apron: true });
      for (let i = 0; P.u < until - 1e-3; i++) at('stool', Math.min(60, until - P.u), SIT[(j + i) % SIT.length], { apron: true, seatY: C.stool.seatY - C.stool.rung, rung: C.stool.rung, task: 'counter' }); // (seat-height: stood on the foot ring, the seat over it)
    }
    // closing: the card turned, cashing up at the register
    go('sign', { apron: true }); at('sign', 10, 'reach', { apron: true, turn: true });
    go('till', { apron: true });
    if (work) {
      // 5 pm: up to the loft to change (on the treads at 5:05)
      at('till', Math.max(20, close + 5 * 60 - 30 - P.u - walkT('till', 'top')), 'tinker', { apron: true, cashUp: true });
      stairBy(P, 'till', 'wardrobe', close + 5 * 60, K.till, o({ apron: true }));
      where = 'wardrobe';
      at('wardrobe', 130, 'reach', { loft: true, apron: true });
      go('rack', { loft: true }); at('rack', 45, 'reach', { loft: true, rod: 'hand' });
      go('window', { loft: true, rod: 'hand' }); at('window', 40, 'look', { loft: true, rod: 'hand' });
      // down at 5:20 in his fishing things, out, the pier
      stairBy(P, 'window', 'street', close + 20 * 60, K.window, { rod: 'hand', loft: true });
      P.walk([...streetRoute(CRIB_ST, GATE_ST), ...GATE_IN.slice(1), ...PIER_WALK.slice(1)], { rod: 'hand' });
    } else {
      // Saturday 11 am: a quick cash-up, the apron off on its hook behind the counter, out with his toolbox
      at('till', 50, 'tinker', { apron: true, cashUp: true });
      at('till', 15, 'reach', {});
      P.inside('till', 'street', o({ toolbox: true }));
      jobs = oddJobs(P, key, [12.75, 14.25].map(atH), says);
    }
  } else {
    // Sunday: out by 8, three odd jobs from the list (the day's seed), back to the shop with the toolbox, the ride 2 to 5 (crib-move),
    // then the rod from the loft and off to the pier
    stairBy(P, 'wardrobe', 'street', 30 * 60 - 40, K.wardrobe, { rod: 'off', loft: true, toolbox: true });
    jobs = oddJobs(P, key, [9.75, 11.25, 12.75].map(atH), says, true);
    P.inside('street', 'moto', o({ toolbox: true }));
    where = 'moto';
    ride = sundayRide(P, at, atH);
    go('rack', { loft: true }); at('rack', 45, 'reach', { loft: true, rod: 'hand' });
    P.inside('rack', 'street', { rod: 'hand', loft: true });
    P.walk([...streetRoute(CRIB_ST, GATE_ST), ...GATE_IN.slice(1), ...PIER_WALK.slice(1)], { rod: 'hand' });
  }
  d = { segs: P.segs, end: P.u, work, sat, shop: shopDay, open: tOpen, says, key, t0, jobs, ride };
  dayCache.set(key, d);
  if (dayCache.size > 4) dayCache.delete(dayCache.keys().next().value);
  return d;
}
// ---- the Sunday ride (crib-move): the numbers. helmet: the hour he puts it on (Eastern); back: when he means to be home on the
// pad (the last lap ends before it); V the cruise (an old cruiser, puttered); wheelV walking the bike; doorS the roll-up door's
// time up or down; side: he walks the bike from its kickstand side this far from its middle; seat: his seat behind the bike's
// middle; seatY his hips over the floorboards, lift the floorboards over the road (kevin-boat.js stands his root on them)
export const RIDE = { helmet: 13 + 57 / 60, back: 16 + 56 / 60, V: 6.5, wheelV: 0.7, doorS: 6, side: 0.8, seat: -0.22, seatY: 0.62, lift: 0.3, parkLean: -0.12 };
const BIKE_HOME = (() => { const M = CRIB.moto, [x, z] = wp(M.x, M.z); return { x, z, heading: worldYaw(M.heading), lean: M.lean }; })();
// (town-fixes: every pad and drive point from CRIB_PAD, so a moved crib or pad carries the ride with it)
const PAD_STOP = CRIB_PAD.stop, PAD_ROAD = CRIB_PAD.drive.roadZ, PAD_MOUTH = [(CRIB_PAD.drive.minX + CRIB_PAD.drive.maxX) / 2, PAD_ROAD - 1.4];
// the bike's middle on its way out of the door onto the pad, nose first (reversed, tail first, on the way back in)
const BIKE_OUT = (() => { const d = Math.sign(PAD_STOP.x - BIKE_HOME.x) || -1; return [[BIKE_HOME.x, BIKE_HOME.z], [BIKE_HOME.x + d * 1.0, PAD_STOP.z + (BIKE_HOME.z - PAD_STOP.z) * 0.4], [BIKE_HOME.x + d * 2.2, PAD_STOP.z], [PAD_STOP.x, PAD_STOP.z]]; })();
// where he stands beside a bike at (x, z) heading h: on its kickstand side (its own frame's -z)
const besideBike = (x, z, h) => [x + RIDE.side * Math.cos(h), z - RIDE.side * Math.sin(h)];
// the ride as one drive (buddy-day.js's lane maths): off the pad down the drive, left into Summit Rd's eastbound lane, the loop
// n times (right down Maple Ave, right along Breneland Rd, up round the bend, right at the T along Summit Rd: the opposite way round
// to the bus, which would otherwise crawl behind him), left up the drive, round the pad to stand at the stop nose west; slow on the
// pad and the drive. n: as many laps as fit `avail` seconds
const rideCache = new Map();
function rideDrive(avail) {
  const key = Math.round(avail);
  let D = rideCache.get(key);
  if (D) return D;
  const S = PAD_STOP, M = PAD_MOUTH, wall = CRIB_PAD.maxX;
  const zD = CRIB_PAD.maxZ + 3, zW = CRIB_PAD.maxZ - 1.5;   // (down the drive; up it along the wall's side)
  const out = [[S.x, S.z], [S.x - 0.9, S.z + 1.0], [S.x - 1.2, S.z + 3.6], [M[0] - 0.5, S.z + 7.6], [M[0], zD], M];
  const back = [M, [M[0] + 0.1, zD], [wall - 1.0, zW], [wall - 1.0, S.z + 1.9], [S.x + 1.0, S.z], [S.x, S.z]];
  // (the loop runs the other way round from the bus's, so neither is ever stuck behind the other: east out of the drive)
  const loop = [[M[0], -126.5], [-20, -126.5], [-20, -48.5], [-92, -48.5], [-101, -53], [-106.5, -66], [-107.5, -84], [-107.5, -126.5]];
  const lane = n => { const pts = [loop[0]]; for (let i = 0; i < n; i++) pts.push(...loop.slice(1), loop[0]); return offsetRight(pts, LANE_OFFSET); };
  const vAt = (x, z) => (z < PAD_ROAD - 1.7 ? 2.2 : RIDE.V);
  const make = n => drive(roundCorners([...out, ...lane(n), ...back], 4), { V: RIDE.V, vAt });
  const d1 = make(1), d2 = make(2), lapT = d2.T - d1.T;
  const n = Math.max(1, 1 + Math.floor((avail - d1.T) / lapT));
  D = n === 1 ? d1 : n === 2 ? d2 : make(n);
  D.laps = n; D.lapT = lapT;
  rideCache.set(key, D);
  if (rideCache.size > 3) rideCache.delete(rideCache.keys().next().value);
  return D;
}
// Sunday afternoon at the shop: polish the bike, the helmet on, the door up, the bike wheeled out, the ride, back in, the door down,
// the helmet hung up. P.u is at the bike's side ('moto') when this starts. at(k, dur, anim, x) and atH(h) are the plan's.
function sundayRide(P, at, atH) {
  const tHelmet = atH(RIDE.helmet), door = [];
  if (P.u < tHelmet - 1) at('moto', tHelmet - P.u, 'tinker', { task: 'bike' });               // a polish while he waits
  at('moto', 6, 'reach', { task: 'bike', helmet: true });                                       // the helmet off the mirror, on
  const up = at('moto', RIDE.doorS, 'look', { task: 'door', helmet: true }); door.push([up.t0, up.t1, 1]);
  const stop = { x: PAD_STOP.x, z: PAD_STOP.z, heading: worldYaw(CRIB.moto.heading), lean: RIDE.parkLean };
  P.walk(BIKE_OUT, { v: RIDE.wheelV, wheel: 1, helmet: true, anim: 'push', rod: 'off' });      // the bike wheeled out, nose first
  const [kx, kz] = besideBike(stop.x, stop.z, stop.heading);
  P.still(4, kx, kz, stop.heading + Math.PI / 2, 'reach', { helmet: true, task: 'mount', bikeStill: stop, rod: 'off' });   // the kickstand up, a leg over
  const avail = atH(RIDE.back) - P.u;
  const D = rideDrive(avail);
  const ride = { kind: 'ride', t0: P.u, t1: P.u + D.T, D, helmet: true }; P.segs.push(ride); P.u += D.T;
  P.still(4, kx, kz, stop.heading + Math.PI / 2, 'reach', { helmet: true, task: 'dismount', bikeStill: stop, rod: 'off' });
  P.walk(BIKE_OUT.slice().reverse(), { v: RIDE.wheelV, wheel: -1, helmet: true, anim: 'push', rod: 'off' });   // and back in, tail first
  at('moto', 5, 'reach', { task: 'bike' });                                                     // the helmet back on its mirror
  const dn = at('moto', RIDE.doorS, 'look', { task: 'door' }); door.push([dn.t0, dn.t1, -1]);
  return { door, ride, laps: D.laps, lapT: D.lapT };
}

// the odd jobs from the shop's front step: as many as `ends` has blocks (each ends at that u), picked by the day's seed, then the
// pier (or, `home`, back to the shop's door); returns the jobs (with their t0, t1)
function oddJobs(P, key, ends, says, home = false) {
  const all = jobList(), rnd = mulberry32(Math.floor(H(key, 'jobs') * 4294967296));
  for (let i = all.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [all[i], all[k]] = [all[k], all[i]]; }
  const jobs = all.slice(0, ends.length).map(j => jobFor(j, key));
  let st = CRIB_ST, here = null;
  jobs.forEach((jb, n) => {
    const end = ends[n];
    const back = here ? viaOf(here).slice().reverse() : [];
    if (jb.carry) { // the boards first, from the rack on the shop's side wall (from the south sidewalk over the road to the crib's own, then along the wall from its front end)
      const rack = [[RACK_W.x, STREET_Z], ...(WALK_Z === STREET_Z ? [] : [[RACK_W.x, WALK_Z]]), [RACK_W.x, RACK_W.z + FRONT * 1.2], [RACK_W.x, RACK_W.z + FRONT * 0.55]];
      P.walk([...back, ...streetRoute(st, { st: 'summit', x: RACK_W.x }), ...rack.slice(1)], { rod: 'off', toolbox: true });
      P.still(20, rack[rack.length - 1][0], rack[rack.length - 1][1], FRONT > 0 ? 0 : Math.PI, 'garden', { rod: 'off', job: jb.id, toolbox: true });
      P.walk([...rack.slice().reverse(), ...streetRoute({ st: 'summit', x: RACK_W.x }, jb).slice(1), ...viaOf(jb).slice(1)], { rod: 'off', plank: true, anim: 'carry', job: jb.id });
    } else P.walk([...back, ...streetRoute(st, jb), ...viaOf(jb).slice(1)], { rod: 'off', toolbox: true });
    const t0j = P.u, dur = Math.max(60, end - P.u), n2 = Math.max(1, Math.round(dur / 240));
    jb.t0 = t0j; jb.t1 = t0j + dur;
    says.push({ u: t0j + 3, job: jb.id, text: jb.line });
    const x = { rod: 'off', tool: jb.tool, job: jb.id, y: jb.y, jobProp: jb.prop || null };
    for (let i = 0; i < n2; i++) { P.still(dur / n2 - 18, jb.at[0], jb.at[1], jb.at[2], jb.anim, x); P.still(18, jb.at[0], jb.at[1], jb.at[2], jb.y ? jb.anim : 'look', x); }
    st = jb; here = jb;
  });
  if (home) P.walk([...viaOf(here).slice().reverse(), ...streetRoute(st, CRIB_ST)], { rod: 'off', toolbox: true });
  else P.walk([...viaOf(here).slice().reverse(), ...streetRoute(st, GATE_ST), ...GATE_IN.slice(1), ...PIER_WALK.slice(1)], { rod: 'hand' });
  return jobs;
}
// the walk home at the end of the evening, from the head of the pier: the trails to our front gate, Breneland Rd, Maple Ave,
// Summit Rd's sidewalk, in at the Tool Crib's door, up the stair, to bed
function loftWalk(P, from) {
  P.walk([...from, ...GATE_IN.slice().reverse().slice(0, -1), ...streetRoute(GATE_ST, CRIB_ST)], { rod: 'hand', tackle: true });
  P.inside('street', 'bed', { rod: 'hand', tackle: true, loft: true });
}

const LOOK_LINES = ['Fishing, anyone?', 'Room in the boat!', 'Fish are rising.', 'Evening! Sail?'];
const ASK = ['Fishing? Room in the boat.', 'Coming fishing?', 'Spare rod. Cold one. Fishing?'];
const YES = ['Count me in!', 'Oh, go on then!', 'I thought you would never ask!', 'Lead the way, Kevin.'];
const WAIT_S = 50;   // seconds at the berth, both aboard, before he pushes off: anyone else may still hop in

// the evening, from 7 pm (u = 0) to his front door
const eveningCache = new Map();
function evening(key) {
  let e = eveningCache.get(key);
  if (e) return e;
  const P = planner(), H = (...s) => hash01('kevin-pm', key, ...s), says = [];
  const say = (u, who, text) => says.push({ u, who, text });
  // the sign, then pack at the pier: the rod reeled in, the tackle box filled, beer into the cooler in the boat
  P.walk([[PIER_SEAT.x, PIER_SEAT.z], PIER_HEAD, SIGN_STAND], { rod: 'hand' });
  P.still(4, SIGN_STAND[0], SIGN_STAND[1], faceTo(SIGN_STAND[0], SIGN_STAND[1], SIGN.x, SIGN.z), 'garden', { rod: 'hand', signAt: 2.5 });
  const tSignUp = P.segs[1].t0 + 2.5;
  P.walk([SIGN_STAND, PIER_HEAD, PACK], { rod: 'hand' });
  const tPack0 = P.u, packDur = 330 + 60 * H('pack'), toBoat = faceTo(PACK[0], PACK[1], MOOR.x + 1.6, MOOR.z);
  const steps = [['reel', 0.14, 'hand', false], ['garden', 0.3, 'off', false], ['pet', 0.2, 'off', true], ['look', 0.08, 'off', true], ['garden', 0.18, 'off', true], ['reel', 0.1, 'hand', true]];
  for (const [anim, k, rod, tackle] of steps) P.still(packDur * k, PACK[0], PACK[1], toBoat, anim, { rod, tackle, packing: true });
  say(tPack0 + 3, 'k', 'Rod. Tackle. Cold one.');
  // the wander: a few spots round the yard and the park, a look round at each, then the companion's patch
  const tWander0 = P.u, rnd = mulberry32(Math.floor(H('wander') * 4294967296));
  const pool = KEVIN_LOOKOUTS.map((p, i) => i), stops = [];
  const n = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) stops.push(KEVIN_LOOKOUTS[pool.splice(Math.floor(rnd() * pool.length), 1)[0]]);
  const mate = crewPick(key);
  let meetK = null, meetC = null, toMeet = null;
  if (mate) {
    // meet at the edge of their patch, on the side he walks in from
    const last = stops[stops.length - 1], r = route(last, [mate.x, mate.z]);
    const dx = r.length > 1 ? r[r.length - 2][0] - mate.x : 1, dz = r.length > 1 ? r[r.length - 2][1] - mate.z : 0, dl = Math.hypot(dx, dz) || 1;
    const rr = Math.max(2.6, (mate.r || 7) - 0.8);
    meetK = [mate.x + dx / dl * rr, mate.z + dz / dl * rr];
    meetC = [mate.x + dx / dl * (rr - 1.3), mate.z + dz / dl * (rr - 1.3)];
    toMeet = [...r.slice(0, -1), meetK];
    if (toMeet.length > 2 && Math.hypot(toMeet[toMeet.length - 2][0] - meetK[0], toMeet[toMeet.length - 2][1] - meetK[1]) < 0.5) toMeet.splice(toMeet.length - 2, 1);
  }
  const legs = []; let at = PACK;
  legs.push(route(PIER_HEAD, stops[0]).slice(), ...stops.slice(1).map((s, i) => route(stops[i], s)));
  legs[0].unshift(PACK);
  const walkSecs = legs.reduce((s, l) => s + polylineLength(l), 0) / WALK + (toMeet ? polylineLength(toMeet) / WALK : 0);
  const budget = 600 + 900 * H('budget');
  const linger = Math.max(25, (budget - walkSecs) / n);
  legs.forEach((leg, i) => {
    P.walk(leg, { rod: 'hand', tackle: true, wander: true });
    const s = stops[i], yaw = H('lookyaw', i) * Math.PI * 2;
    const st = P.still(linger, s[0], s[1], yaw, 'look', { rod: 'hand', tackle: true, wander: true });
    say(st.t0 + 2 + 4 * H('ls', i), 'k', LOOK_LINES[Math.floor(H('ll', i) * LOOK_LINES.length)]);
    at = s;
  });
  let m = null;
  if (mate) {
    const w = P.walk(toMeet, { rod: 'hand', tackle: true, wander: true });
    const meet = P.still(24, meetK[0], meetK[1], faceTo(meetK[0], meetK[1], meetC[0], meetC[1]), 'talk', { rod: 'hand', tackle: true, meet: true });
    say(meet.t0 + 1, 'k', ASK[Math.floor(H('ask') * ASK.length)]);
    say(meet.t0 + 7, 'c', YES[Math.floor(H('yes') * YES.length)]);
    say(meet.t0 + 13, 'k', 'Grand. This way.');
    m = { name: mate.name, area: mate, meetK, meetC, tApproach: w.t1 - 18, tMeet: meet.t0, tYes: meet.t0 + 7, tMeetEnd: meet.t1 };
    at = meetK;
  }
  const tWanderEnd = m ? m.tMeet : P.u;
  // back to the pier (together), into the boat
  const back = P.walk([...route(at, PIER_HEAD), BOARD], { rod: 'hand', tackle: true, back: true });
  const tBoard = P.u;
  P.boat(1.5, { at: [MOOR.x, MOOR.z], yaw: MOOR.yaw, act: 'board', sail0: 0, sail1: 0, moored: true });
  P.boat(WAIT_S, { at: [MOOR.x, MOOR.z], yaw: MOOR.yaw, act: 'wait', sail0: 0, sail1: 0, moored: true });
  say(tBoard + 6, 'k', m ? 'Last call!' : 'Anyone? Fishing?');
  say(tBoard + WAIT_S - 6, 'k', 'Cast off!');
  const tDepart = P.u;
  // push off stern first, turn her round in open water, up with the sail, away
  const out = [[MOOR.x, MOOR.z], PIVOT], outLen = polylineLength(out);
  P.boat(outLen / PUSH_V + 3, { pts: out, len: outLen, v: PUSH_V, reverse: true, act: 'tiller', sail0: 0, sail1: 0 });
  let spot = Math.floor(H('first') * SPOTS.length);
  const head = faceTo(PIVOT[0], PIVOT[1], SPOTS[spot][0], SPOTS[spot][1]);
  P.boat(9, { at: PIVOT, yaw0: MOOR.yaw, yaw1: head, act: 'tiller', sail0: 0, sail1: 0 });
  P.boat(5, { at: PIVOT, yaw: head, act: 'tiller', sail0: 0, sail1: 1 });   // unfurls the sail
  const sailTo = (from, to, via) => {
    const pts = via ? [from, via, to] : [from, to], len = polylineLength(pts);
    P.boat(len / SAIL_V + 3, { pts, len, act: 'tiller', sail0: 1, sail1: 1 });
  };
  sailTo(PIVOT, SPOTS[spot]);
  const tAnchor = P.u;
  const yawAt = s => (H('yaw', s) - 0.5) * 2.4 + Math.PI / 2;
  P.boat(4, { at: SPOTS[spot], yaw: null, act: 'tiller', sail0: 1, sail1: 0 });                         // furls it
  P.boat(15, { at: SPOTS[spot], yaw: null, act: 'beer', sail0: 0, sail1: 0 });                          // the first beer
  // blocks of five minutes until 11: mostly fishing, now and then another spot
  const END = (KEVIN_HOURS.back - KEVIN_HOURS.sail) * 3600;
  let b = 0;
  while (P.u < END - 1) {
    const dur = Math.min(300, END - P.u);
    const next = (spot + 1 + Math.floor(H('next', b) * (SPOTS.length - 1))) % SPOTS.length;
    const trip = Math.hypot(SPOTS[next][0] - SPOTS[spot][0], SPOTS[next][1] - SPOTS[spot][1]) / SAIL_V + 3 + 8;
    if (b > 0 && H('move', b) < 0.22 && trip < dur - 30) {
      P.boat(4, { at: SPOTS[spot], yaw: null, act: 'tiller', sail0: 0, sail1: 1 });
      sailTo(SPOTS[spot], SPOTS[next]);
      spot = next;
      P.boat(4, { at: SPOTS[spot], yaw: null, act: 'tiller', sail0: 1, sail1: 0 });
      P.boat(Math.max(1, dur - trip), { at: SPOTS[spot], yaw: null, act: 'fish', sail0: 0, sail1: 0 });
    } else P.boat(dur, { at: SPOTS[spot], yaw: null, act: 'fish', sail0: 0, sail1: 0 });
    b++;
  }
  // 11 pm: back to the pier bow first, the companion off and home, pack up, the sign in, home
  P.boat(4, { at: SPOTS[spot], yaw: null, act: 'tiller', sail0: 0, sail1: 1 });
  sailTo(SPOTS[spot], [MOOR.x, MOOR.z], RETURN_VIA);
  const tMoored = P.u;
  P.boat(4, { at: [MOOR.x, MOOR.z], yaw: MOOR.yaw, act: 'tiller', sail0: 1, sail1: 0, moored: true });
  P.boat(8, { at: [MOOR.x, MOOR.z], yaw: MOOR.yaw, act: 'pack', sail0: 0, sail1: 0, moored: true });
  const tDisembark = tMoored + 5;
  say(tMoored + 6, 'k', 'Good night for it.');
  P.walk([BOARD, PIER_HEAD, SIGN_STAND], { rod: 'hand', tackle: true });
  P.still(4, SIGN_STAND[0], SIGN_STAND[1], faceTo(SIGN_STAND[0], SIGN_STAND[1], SIGN.x, SIGN.z), 'garden', { rod: 'hand', tackle: true });
  const tSignIn = P.u - 1.5;
  loftWalk(P, [SIGN_STAND, PIER_HEAD, [44, -19], [37, -19.4]]); // home to the loft over the shop
  const tHome = P.u;
  // the boat's yaw at each anchorage: a lazy swing at its mooring line, different per spot
  for (const s of P.segs) if (s.kind === 'boat' && s.at && s.yaw === null) s.yawBase = yawAt(s.at[0] * 7 + s.at[1]);
  if (m) Object.assign(m, { back, tBoard, tDepart, tDisembark });
  says.sort((a, b2) => a.u - b2.u);
  e = { segs: P.segs, end: P.u, tHome, tSignUp, tSignIn, tPack0, tWander0, tWanderEnd, tBoard, tDepart, tAnchor, tMoored, tDisembark, mate: m, says, key };
  eveningCache.set(key, e);
  if (eveningCache.size > 4) eveningCache.delete(eveningCache.keys().next().value);
  return e;
}

function segAt(segs, u) {
  let lo = 0, hi = segs.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (segs[mid].t0 <= u) lo = mid; else hi = mid - 1; }
  return segs[lo];
}

// where the boat is on segment s at u: { x, z, yaw, speed }
function boatPose(s, u, t) {
  if (s.pts) {
    const k = (u - s.t0) / (s.t1 - s.t0);
    // ease in and out over the first and last 1.5 s (the +3 s in the duration), cruise in between
    const T = s.t1 - s.t0, a = 1.5 / T, q = k < a ? (k * k) / (2 * a * (1 - a)) : k > 1 - a ? 1 - ((1 - k) * (1 - k)) / (2 * a * (1 - a)) : (k - a / 2) / (1 - a);
    const [x, z, dx, dz] = alongPolyline(s.pts, Math.max(0, Math.min(1, q)) * s.len);
    return { x, z, yaw: Math.atan2(dx, dz) + (s.reverse ? Math.PI : 0), speed: s.v || SAIL_V };
  }
  if (s.yaw0 !== undefined) return { x: s.at[0], z: s.at[1], yaw: angLerp(s.yaw0, s.yaw1, ease((u - s.t0) / (s.t1 - s.t0))), speed: 0, turning: true };
  const yaw = s.yaw !== null && s.yaw !== undefined ? s.yaw : s.yawBase + 0.35 * Math.sin(t * 0.045 + s.at[0]);
  return { x: s.at[0], z: s.at[1], yaw, speed: 0 };
}

// the evening's last-known boat pose before u (an anchorage between segments keeps the yaw of its swing)
function boatOf(e, u, t) {
  const s = segAt(e.segs, u);
  if (s.kind === 'boat') {
    const k = Math.max(0, Math.min(1, (u - s.t0) / (s.t1 - s.t0)));
    return { ...boatPose(s, u, t), sail: s.sail0 + (s.sail1 - s.sail0) * ease(k), moored: !!s.moored, out: true };
  }
  return null;
}
const MOORED = { x: MOOR.x, z: MOOR.z, yaw: MOOR.yaw, speed: 0, sail: 0, moored: true, out: false };

const READ_S = 1200;   // the loft's lamp stays on this long after he comes in at night (a read in bed)
const NIGHT = { hidden: true, loft: true, asleep: true, anim: 'idle', speed: 0, rod: 'off', beer: 'cooler' };
function night(t, reading) { const [x, z, yaw] = K.bed; return { ...NIGHT, x, z, y: CRIB.LY, yaw, boat: MOORED, sign: false, reading }; }

// his wake-up hour on the day t falls in (Saturday he is up early to open at 7)
const wakeOf = t => (isSaturday(t) ? KEVIN_HOURS.satWake : KEVIN_HOURS.wake);
// the start of the day plan t falls in: that day's wake-up, or before it yesterday's
function dayStartOf(t) {
  const h = hourAt(t), w = wakeOf(t);
  if (h >= w) return sinceHour(t, w);
  const y = t - (h + 1) * 3600;                       // (yesterday, 11 pm)
  return sinceHour(y, wakeOf(y));
}
// the plan of the day that starts at tD (Saturday's key apart: its 6:15 start and Friday's 7:30 share a dayKey)
const planOf = tD => dayPlan(isSaturday(tD + 3600) ? 'sat' + dayKey(tD) : dayKey(tD), tD);

// What Kevin is doing at shared time t (see the top of the file).
export function kevinState(t) {
  const tE = sinceHour(t, KEVIN_HOURS.sail), uE = t - tE;
  const e = evening(dayKey(tE));
  if (uE < e.end) return eveningState(e, uE, t);
  const h = hourAt(t);
  if (h >= KEVIN_HOURS.sail || h < wakeOf(t)) return night(t, h >= KEVIN_HOURS.sail && uE < e.end + READ_S); // in bed in the loft
  const tD = dayStartOf(t), uD = t - tD, d = planOf(tD);
  if (uD < d.end) { const s = segAt(d.segs, uD); return s.hidden ? night(t, false) : { ...(s.kind === 'ride' ? rideState(s, uD) : walkOrStill(s, uD)), boat: MOORED, sign: false }; }
  return null;   // at the end of the pier: the usual plan
}
// (crib-move) his motorcycle when it is out of its corner: { x, z, heading, lean, speed, riding, wheel } in the world, else null
export function kevinRideAt(t) { const s = kevinState(t); return s && s.bike ? s.bike : null; }
// (crib-move) the roll-up door, 0 down .. 1 up: it rolls up before the Sunday ride and down after it (the plan's `door` times)
export function kevinDoorOpen(t) {
  const h = hourAt(t);
  if (h < 12 || h >= KEVIN_HOURS.sail) return 0;
  const tD = dayStartOf(t), d = planOf(tD), u = t - tD;
  if (!d.ride) return 0;
  const [up, dn] = d.ride.door;
  if (u < up[0]) return 0;
  if (u < up[1]) return (u - up[0]) / (up[1] - up[0]);
  if (u < dn[0]) return 1;
  if (u < dn[1]) return 1 - (u - dn[0]) / (dn[1] - dn[0]);
  return 0;
}
// on the ride: Kevin on the saddle (kevin-boat.js lifts his root onto the floorboards; the pose is 'ride'), the bike under him
function rideState(s, u) {
  const p = driveAt(s.D, u - s.t0);
  return { x: p.x + RIDE.seat * Math.sin(p.yaw), z: p.z + RIDE.seat * Math.cos(p.yaw), yaw: p.yaw, speed: 0, anim: 'ride', snap: true, onBike: true, helmet: true, seatY: RIDE.seatY,
    rod: 'off', beer: 'cooler', bike: { x: p.x, z: p.z, heading: p.yaw, lean: 0, speed: p.v, riding: true } };
}
// Is the loft's lamp on (Kevin up there awake, or reading in bed after he comes in at night)?
export function kevinLoftLight(t) { const s = kevinState(t); return !!(s && s.loft && (!s.hidden || s.reading)); }
// Only the boat and the sign (dock.js draws them whatever Kevin is up to).
export function kevinBoat(t) {
  const s = kevinState(t);
  return s ? { boat: s.boat, sign: s.sign } : { boat: MOORED, sign: false };
}

function walkOrStill(s, u) {
  let out;
  if (s.kind === 'walk' && s.wheel) {
    // (crib-move) walking his motorcycle: the points are the bike's middle; he is beside it on its kickstand side, the bike's nose
    // the way they go (wheel 1) or the other way, pulled in tail first (-1: he faces the bike's way and steps back with it)
    const v = s.v || WALK, dd = Math.min(s.len, (u - s.t0) * v), [bx, bz, dx, dz] = alongPolyline(s.pts, dd), moving = dd < s.len - 1e-6;
    const ht = Math.atan2(dx, dz), hb = s.wheel > 0 ? ht : ht + Math.PI, [x, z] = besideBike(bx, bz, hb);
    // (town-fixes) snap: he is drawn exactly beside the bike (crowd.js would otherwise hold him off the door's low ramp while the
    // bike rolled out alone); the bike's speed is signed (its wheels turn back as it goes in tail first)
    out = { x, z, yaw: hb, speed: moving && s.wheel > 0 ? v : 0, anim: s.anim || null, rod: s.rod || 'off', beer: 'cooler', snap: true, bike: { x: bx, z: bz, heading: hb, lean: 0, speed: moving ? v * Math.sign(s.wheel) : 0, wheel: true } };
  } else if (s.kind === 'walk') {
    const v = s.v || WALK, dd = Math.min(s.len, (u - s.t0) * v), [x, z, dx, dz] = alongPolyline(s.pts, dd), moving = dd < s.len - 1e-6;
    out = { x, z, yaw: Math.atan2(dx, dz), speed: moving ? v : 0, anim: s.anim || null, rod: s.rod || 'hand', beer: 'cooler', tackle: !!s.tackle, wander: !!s.wander, stair: !!s.stair };
  } else out = { x: s.x, z: s.z, yaw: s.yaw, speed: 0, anim: s.anim, rod: s.rod || 'hand', broom: !!s.broom, beer: 'cooler', tackle: !!s.tackle, packing: !!s.packing, wander: !!s.wander, meet: !!s.meet, seatY: s.seatY || 0, task: s.task || null, cust: s.cust ?? null, turn: !!s.turn, bike: s.bikeStill ? { ...s.bikeStill, speed: 0 } : undefined };
  out.apron = !!s.apron; out.tool = s.tool || null; out.toolbox = !!s.toolbox; out.plank = !!s.plank; out.loft = !!s.loft; out.job = s.job || null; out.jobProp = s.jobProp || null; out.helmet = !!s.helmet;
  const fy = s.y ?? cribFloorY(out.x, out.z);
  if (fy !== null && fy !== undefined) { out.y = fy + (s.rung || 0); out.inCrib = s.y === undefined; } // (s.rung: on his stool, the root on its foot ring)
  return out;
}

function eveningState(e, u, t) {
  const s = segAt(e.segs, u);
  const sign = u >= e.tSignUp && u < e.tSignIn;
  if (s.kind !== 'boat') return { ...walkOrStill(s, u), boat: boatOf(e, u, t) || MOORED, sign };
  const B = boatOf(e, u, t);
  // Kevin on the stern seat at the tiller: the boat's frame turned into the world
  const p = seatWorld(B, 0, t);
  const out = { x: p.x, z: p.z, y: p.y, yaw: B.yaw, speed: 0, snap: true, inBoat: true, seatY: p.seatY, boat: B, sign, rod: 'holder', beer: 'bench', anim: 'tiller' };
  const k = u - s.t0;
  switch (s.act) {
    case 'board': out.anim = 'sit'; out.beer = 'cooler'; break;
    case 'wait': out.anim = k % 20 < 6 ? 'look' : 'tiller'; out.beer = 'cooler'; out.yaw = B.yaw + (k % 20 < 6 ? 0.9 : 0); break;
    case 'pack': out.anim = k < 4 ? 'pet' : 'sit'; out.beer = k < 3 ? 'bench' : 'cooler'; break;
    case 'beer': { // reach into the cooler, drink, set it down, then out with the rod
      out.beer = k < 2.5 ? 'cooler' : k < 12 ? 'hand' : 'bench';
      out.anim = k < 2.5 ? 'pet' : k < 10 ? 'drink' : k < 12 ? 'pet' : 'fish';
      if (k >= 12) out.rod = 'hand';
      break;
    }
    case 'fish': Object.assign(out, fishRoutine(t)); break;
    default: out.beer = 'bench';
  }
  // at anchor he turns on his seat to fish over the side
  if (!s.pts && s.yaw0 === undefined && (s.act === 'fish' || s.act === 'beer')) out.yaw = B.yaw + Math.PI / 2;
  return out;
}

// The loose evening routine while anchored: 40 s turns on the shared clock, each a fish, a sip or a look round.
export function fishRoutine(t) {
  const c = Math.floor(t / 40), k = t - c * 40, r = hash01('kevin-turn', c);
  if (r < 0.2) { // a sip
    return { rod: 'holder', beer: k < 2 || k > 11 ? 'bench' : 'hand', anim: k < 2 || (k > 9 && k < 11) ? 'pet' : k < 9 ? 'drink' : 'fish', turn: 'drink' };
  }
  if (r < 0.38 && k < 14) return { rod: 'holder', beer: 'bench', anim: 'look', turn: 'look' };
  const reel = hash01('kevin-reel', c) < 0.3 && k > 33;
  return { rod: 'hand', beer: 'bench', anim: reel ? 'reel' : 'fish', turn: 'fish' };
}
// The companion's own routine at anchor (35 s turns, offset from Kevin's): fishing, a chat, now and then a catch (a cheer)
export function mateRoutine(t) {
  const c = Math.floor((t + 13) / 35), k = t + 13 - c * 35, r = hash01('kevin-mate', c);
  if (r < 0.22) return { anim: k < 24 ? 'reel' : k < 30 ? 'cheer' : 'fish', rod: 'hand', caught: k >= 24, cycle: c, say: k >= 24 && k < 25 ? 'Got one!' : null };
  if (r < 0.42 && k < 16) return { anim: k < 8 ? 'talk' : 'laugh', rod: 'holder', cycle: c };
  if (r < 0.52 && k < 10) return { anim: 'look', rod: 'holder', cycle: c };
  return { anim: 'fish', rod: 'hand', cycle: c };
}

// ---- the evening as the crew sees it (kevin-crew.js): the day key, where in the evening we are, who may join or board
export function crewPlan(t) {
  const tE = sinceHour(t, KEVIN_HOURS.sail), u = t - tE, e = evening(dayKey(tE));
  const on = u < e.end;
  return {
    key: e.key, tE, u, e, on,
    canJoin: on && u < e.tDepart - 3,                    // from 7 pm until he pushes off
    canBoard: on && u < e.tDepart - 3,
    moored: !on || u < e.tDepart || u >= e.tMoored,
    out: on && u >= e.tDepart && u < e.tDisembark,       // riders stay seated
    disembark: on && u >= e.tDisembark,
    departIn: e.tDepart - u,
    mate: e.mate ? e.mate.name : null,
  };
}

// ---- the companion: a pure function of t too (bumped = both crew seats taken by players at the berth: they stay ashore)
// areaState(d, t) is npcs.js's usual schedule for them (where to fetch them from and where to go back to).
export function crewMateState(d, t, areaState, bumped = false) {
  const tE = sinceHour(t, KEVIN_HOURS.sail), u = t - tE, e = evening(dayKey(tE)), m = e.mate;
  if (!m || m.name !== d.name || u < m.tApproach || u >= e.end + 600) return null;
  const C = m.meetC, K = m.meetK, toK = faceTo(C[0], C[1], K[0], K[1]);
  if (u < m.tMeet) { // over to where Kevin will stand
    const from = m.from || (m.from = (() => { const s = areaState(d, tE + m.tApproach); return [s.x, s.z]; })());
    const len = Math.hypot(C[0] - from[0], C[1] - from[1]), sp = Math.max(1.1, len / 16), dd = (u - m.tApproach) * sp;
    if (dd < len) { const [x, z, dx, dz] = alongPolyline([from, C], dd); return { x, z, yaw: Math.atan2(dx, dz), speed: sp, anim: null, crew: 'fetch' }; }
    return { x: C[0], z: C[1], yaw: toK, speed: 0, anim: u > m.tMeet - 4 ? 'wave' : 'look', crew: 'fetch' };
  }
  if (u < m.tMeetEnd) {
    const k = u - m.tMeet;
    return { x: C[0], z: C[1], yaw: toK, speed: 0, anim: k < 2.5 ? 'wave' : u >= m.tYes && u < m.tYes + 2.5 ? 'cheer' : 'talk', crew: 'meet' };
  }
  const bk = m.back;
  if (u < m.tBoard) { // behind Kevin, back to the pier
    const path = m.followPath || (m.followPath = [C, ...bk.pts]), len = m.followLen || (m.followLen = polylineLength(path));
    const stop = len - polylineLength([C, K]), go = Math.max(0, (u - bk.t0) * WALK), dd = Math.min(stop, go), [x, z, dx, dz] = alongPolyline(path, dd);
    return { x, z, yaw: Math.atan2(dx, dz), speed: go < stop ? WALK : 0, anim: null, crew: 'follow' };
  }
  const endF = m.followEnd || (m.followEnd = alongPolyline(m.followPath || [C, ...bk.pts], polylineLength([C, ...bk.pts]) - polylineLength([C, K])));
  const seatSpot = BOARD_SPOTS[2];
  const walkIn = [[endF[0], endF[1]], seatSpot], wl = polylineLength(walkIn), tAt = m.tBoard + 1.5 + wl / WALK;
  const homeFrom = bumped ? m.tDepart + 6 : m.tDisembark;
  if (u < m.tBoard + 1.5) return { x: endF[0], z: endF[1], yaw: faceTo(endF[0], endF[1], MOOR.x, MOOR.z), speed: 0, anim: 'look', crew: 'pier' };
  if (u < tAt) { const [x, z, dx, dz] = alongPolyline(walkIn, (u - m.tBoard - 1.5) * WALK); return { x, z, yaw: Math.atan2(dx, dz), speed: WALK, anim: null, crew: 'pier' }; }
  if (bumped && u < homeFrom) { // two players took the seats: wave them off from the boards
    const k = u - m.tDepart;
    return { x: seatSpot[0], z: seatSpot[1] + 0.45, yaw: Math.PI, speed: 0, anim: k > -2 && k < 5 ? 'wave' : 'idle', crew: 'ashore' };
  }
  if (!bumped && u < tAt + 0.6) return { x: seatSpot[0], z: seatSpot[1], yaw: Math.PI, speed: 0, anim: 'idle', crew: 'pier' };
  if (!bumped && u < m.tDisembark) { // in the boat, on the bow seat
    const B = boatOf(e, u, t) || MOORED;
    const p = seatWorld(B, 2, t), s = segAt(e.segs, u), anchored = s.kind === 'boat' && !s.pts && s.yaw0 === undefined && (s.act === 'fish' || s.act === 'beer');
    const out = { x: p.x, z: p.z, y: p.y, yaw: B.yaw, speed: 0, snap: true, inBoat: true, seatY: p.seatY, anim: 'sit', rod: 'holder', crew: 'aboard' };
    if (anchored) { Object.assign(out, mateRoutine(t)); out.yaw = B.yaw - Math.PI / 2; }
    else if (s.act === 'wait' || s.act === 'board') out.anim = 'look';
    return out;
  }
  // home again: off the boards, the trails back to their patch (to where their usual day wants them by then)
  const hm = bumped ? (m.homeB || (m.homeB = homeWalk(d, m, tE + homeFrom, areaState))) : (m.home || (m.home = homeWalk(d, m, tE + homeFrom, areaState)));
  const k = u - homeFrom;
  if (k < hm.dur) { const [x, z, dx, dz] = alongPolyline(hm.path, k * WALK); return { x, z, yaw: Math.atan2(dx, dz), speed: WALK, anim: null, crew: 'home' }; }
  if (k < hm.dur + 20) { const p = hm.path[hm.path.length - 1]; return { x: p[0], z: p[1], yaw: faceTo(p[0], p[1], m.area.x, m.area.z), speed: 0, anim: 'look', crew: 'home' }; }
  return null;
}
function homeWalk(d, m, tAbs, areaState) {
  const a = m.area, start = BOARD_SPOTS[2];
  const est = polylineLength([start, PIER_HEAD, ...route(PIER_HEAD, [a.x, a.z])]) / WALK;
  const s = areaState(d, tAbs + est + 20);
  const path = [start, PIER_HEAD, ...route(PIER_HEAD, [s.x, s.z])];
  return { path, dur: polylineLength(path) / WALK };
}

// For tests and pictures: the plans seen from shared time t: the evening (from 7 pm), the day (from his wake-up: 7:30, 6:15 on Saturday) with its segments, says
// and jobs, whether it is a working day.
export function kevinPlans(t) {
  const tE = sinceHour(t, KEVIN_HOURS.sail), tD = dayStartOf(t), day = planOf(tD);
  return { evening: evening(dayKey(tE)), eveningStart: tE, day, dayStart: tD, workday: day.work };
}
// Kevin's day's segment at shared time t (the shop's feature reads the task, the customer and the job from it)
export function kevinDayAt(t) {
  const tD = dayStartOf(t), d = planOf(tD), u = t - tD;
  return { day: d, u, seg: u < d.end ? segAt(d.segs, u) : null, t0: tD };
}
// tests: the odd-job list as it would be today, in full
export const kevinJobList = () => jobList().map(j => (j.pick ? { ...j, ...j.make(j.pick[0]), pick: null, make: null } : j));
