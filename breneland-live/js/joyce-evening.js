// Joyce's evenings (Andrew: "Joyce is very social"): a weekly pattern (joyce-house-plan.js EVENING), a PURE function of the
// shared clock like every NPC, so every player sees the same evening. Most nights two to four of her girlfriends (townswomen of
// the cast, town-life.js residents) walk over from their houses and sit with her round the gas firepit on the patio or in the sun
// room, chatting, then walk home; Tuesday is a group walk round the town, Thursday bocce in Strickler Park, Sunday Joyce sits out by
// the fire alone with Molly.
//   joyceEveAt(seg, s, day, o)   Joyce's state in the evening segment of her day (joyce-day.js calls it; fills o like joyceAt)
//   guestAt(id, t, home)         a girlfriend's state at shared second t while the evening has her, else null (town-life.js)
//   firepitAt(ms)                { lit, k } the gas firepit (on while Joyce sits out back in the evening)
//   eveningAt(ms)                { kind, friends, day, T: the evening's times (seconds of the day), ... } (tests, the feature)
//   bocceAt(ms)                  the bocce balls at the court on a Thursday evening: [{ x, y, z, i }] or null
import { hash01, alongPolyline, polylineLength } from './util.js';
import { hourAt } from './npcs-day.js';
import { easternDay } from './wreath-data.js';
import { JH, EVENING, eveningOfDay, ROOM_SPOTS } from './joyce-house-plan.js';
import { joyceLoops, joyceRoute } from './joyce-day.js';
import * as LAYOUT from './layout.js';
import { COURT, standZ, releaseZ } from './bocce-rules.js';

const { BOCCE } = LAYOUT;
const P = JH.pts, PI = Math.PI;
const FOOT_V = 1.1, STROLL_V = 1.0;
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
// the court's frame (bocce-court.js toWorldXZ, without its THREE import)
const BC = Math.cos(BOCCE.rot), BS = Math.sin(BOCCE.rot);
const court = (lx, lz) => [BOCCE.x + lx * BC + lz * BS, BOCCE.z - lx * BS + lz * BC];
const courtYaw = ly => ly + BOCCE.rot;
const COURT_Y = 0.45 + 0.035;   // bocce-court.js GROUND_Y + SURF

// ---------------------------------------------------------------- the evening of a day (cached per day)
const cache = new Map();
export function eveningOfDayPlan(day) {
  let E = cache.get(day);
  if (E) return E;
  const w = eveningOfDay(day), t0 = EVENING.start * 3600, t1 = EVENING.end * 3600;
  E = { day, kind: w.kind, friends: w.friends.slice(), t0, t1, from: EVENING.from * 3600, to: EVENING.to * 3600 };
  if (E.kind === 'firepit' || E.kind === 'quiet') {
    const c0 = JH.chairs[0], pitEdge = [JH.pit.x + (c0.x - JH.pit.x) * 0.62, JH.pit.z + (c0.z - JH.pit.z) * 0.62];
    E.pitEdge = pitEdge;
    E.out = [P.sunDoorIn, P.sunDoorOut, pitEdge];            // Joyce out to the fire
    E.tAt = t0 + 32;                                          // at the pit's edge (she sets off from her spot in time for it)
    E.tLight = E.tAt + 2;                                     // the gas catches as she reaches in
    E.tOff = t1 - 55;
    E.seats = E.friends.map((id, k) => JH.chairs[k + 1]);
    E.end = P.sunDoorIn;
  } else if (E.kind === 'sunroom') {
    E.seats = E.friends.map((id, k) => JH.sunSeats[k + 1]);
    E.end = [JH.sunSeats[0].x, JH.sunSeats[0].z];
  } else {
    // out: everyone meets on the sidewalk at her front walk, then the walk (one lap of the town at a stroll) or bocce in the park
    const c = P.curb;
    E.meet = [c, ...E.friends.map((id, k) => [c[0] + 2.4 * (k + 1), c[1]])];
    E.tGo = t0 + 300;
    if (E.kind === 'walk') {
      const lap = joyceLoops().lap;   // twice round the town at a stroll (about 20 minutes)
      E.path = [c, ...lap.slice(1, -1), ...lap.slice(0, -1), lap[0], c];
    } else {
      const cross = LAYOUT.CROSSINGS.find(q => q.road === 'breneland-rd' && q.x < -80) || { x: -92 };
      const zS = c[1] + 2 * (4.5 + 1.6), tr = court(COURT.W / 2 + 2.6, 0);
      const r = joyceRoute([cross.x, zS], tr);
      E.path = [c, [cross.x, c[1]], [cross.x, zS], ...r.slice(1)];
    }
    E.len = polylineLength(E.path);
    E.rpath = E.path.slice().reverse();
    E.v = STROLL_V;
    if (E.kind === 'walk') {
      const room = t1 - 140 - E.tGo;   // back by about 21:01 at the latest
      if (E.len / E.v > room) E.v = E.len / room;
      E.tBack = E.tGo + E.len / E.v;
      E.tHome = E.tBack + 70;           // a chat at the front walk, then in
    } else {
      E.tArrive = E.tGo + E.len / E.v;
      E.tBackGo = t1 - 160 - E.len / E.v;
      E.tBack = E.tBackGo + E.len / E.v;
      E.tHome = E.tBack + 60;
      E.rounds = bocceRounds(E);
    }
    E.end = [ROOM_SPOTS.couch.x, ROOM_SPOTS.couch.z];
  }
  cache.set(day, E);
  if (cache.size > 8) cache.delete(cache.keys().next().value);
  return E;
}
export function eveningAt(ms) { return eveningOfDayPlan(easternDay(ms)); }

// ---------------------------------------------------------------- walking a path between two times
function walkOn(pts, d, o, v) {
  const L = polylineLength(pts);
  if (d >= L) { const a = pts[pts.length - 2] || pts[0], b = pts[pts.length - 1]; o.x = b[0]; o.z = b[1]; o.yaw = faceTo(a[0], a[1], b[0], b[1]); o.speed = 0; return true; }
  const [x, z, dx, dz] = alongPolyline(pts, Math.max(0, d));
  o.x = x; o.z = z; o.yaw = Math.atan2(dx, dz); o.speed = v; o.anim = null;
  return false;
}
// a group walking a path: the leader d metres along it, follower k behind and a little to one side
function inGroup(E, d, k, o, v, path = E.path) {
  const back = k < 0 ? 0 : 1.15 * (Math.floor(k / 2) + 1) - (k % 2 ? 0.35 : 0), side = k < 0 ? 0.32 : k % 2 ? 0.32 : -0.42;
  const dd = Math.max(0, Math.min(E.len, d - back));
  const [x, z, dx, dz] = alongPolyline(path, dd);
  const L = Math.hypot(dx, dz) || 1;
  o.x = x + (dz / L) * -side; o.z = z + (dx / L) * side; o.yaw = Math.atan2(dx, dz); o.speed = v; o.anim = null;
}

// ---------------------------------------------------------------- Joyce
// o: joyceAt's state (x, z, yaw, mode, anim, ...). from: where she was when the evening began (her room spot). Returns o.
export function joyceEveAt(seg, s, day, o, from) {
  const E = eveningOfDayPlan(day);
  o.mode = 'home'; o.phase = 'evening'; o.eve = E.kind; o.speed = 0; o.hidden = false;
  const u = s - E.t0;
  if (E.kind === 'firepit' || E.kind === 'quiet') {
    const goPath = [from, ...E.out], wGo = polylineLength(goPath) / FOOT_V, c0 = JH.chairs[0];
    const tL = E.tAt, tS = Math.max(E.t0, tL - wGo);   // at the pit's edge at tAt (setting off in time for it)
    const back = [E.pitEdge, P.sunDoorOut, P.sunDoorIn];
    if (s < tS) { o.x = from[0]; o.z = from[1]; o.anim = 'idle'; o.phase = 'to-fire'; return o; }
    if (s < tL) { walkOn(goPath, (s - tS) * Math.max(FOOT_V, polylineLength(goPath) / Math.max(1, tL - tS)), o, FOOT_V); o.phase = 'to-fire'; return o; }
    if (s < tL + 4) { o.x = E.pitEdge[0]; o.z = E.pitEdge[1]; o.yaw = faceTo(o.x, o.z, JH.pit.x, JH.pit.z); o.anim = 'reach'; o.phase = 'light'; return o; }
    if (s < tL + 5.5) { walkOn([E.pitEdge, [c0.x, c0.z]], (s - tL - 4) * FOOT_V, o, FOOT_V); return o; }
    if (s < E.tOff) { seated(o, c0, s, day, 'joyce'); o.phase = 'fire'; o.mollySpot = mollyByChair(c0); return o; }
    if (s < E.tOff + 1.5) { walkOn([[c0.x, c0.z], E.pitEdge], (s - E.tOff) * FOOT_V, o, FOOT_V); return o; }
    if (s < E.tOff + 4.5) { o.x = E.pitEdge[0]; o.z = E.pitEdge[1]; o.yaw = faceTo(o.x, o.z, JH.pit.x, JH.pit.z); o.anim = 'reach'; o.phase = 'fire-off'; return o; }
    if (!walkOn(back, (s - E.tOff - 4.5) * FOOT_V, o, FOOT_V)) return o;
    o.anim = 'idle'; o.phase = 'in';
    return o;
  }
  if (E.kind === 'sunroom') {
    const st = JH.sunSeats[0], pts = [from, [st.x, st.z]];
    if (!walkOn(pts, u * FOOT_V, o, FOOT_V)) return o;
    seated(o, st, s, day, 'joyce'); o.phase = 'tea'; o.mollySpot = ROOM_SPOTS.sunroom.molly;
    return o;
  }
  // out: the walk or bocce
  const outPts = [from, P.frontIn, P.front, P.step, P.curb], wOut = polylineLength(outPts) / FOOT_V;
  o.mode = 'walk'; o.power = 0;
  if (s < E.t0 + wOut) { o.mode = 'home'; walkOn(outPts, u * FOOT_V, o, FOOT_V); o.phase = 'out'; return o; }
  if (s < E.tGo) { o.x = P.curb[0]; o.z = P.curb[1]; o.yaw = PI / 2; o.anim = chatAnim(day, 'joyce', s); o.phase = 'meet'; return o; }
  if (E.kind === 'walk') {
    if (s < E.tBack) { inGroup(E, (s - E.tGo) * E.v, -1, o, E.v); o.phase = 'group-walk'; return o; }
  } else {
    if (s < E.tArrive) { inGroup(E, (s - E.tGo) * E.v, -1, o, E.v); o.phase = 'to-bocce'; return o; }
    if (s < E.tBackGo) { bocceSpot(E, s, 0, o); o.phase = 'bocce'; return o; }
    if (s < E.tBack) { inGroup(E, (s - E.tBackGo) * E.v, -1, o, E.v, E.rpath); o.phase = 'from-bocce'; return o; }
  }
  if (s < E.tHome) { o.x = P.curb[0]; o.z = P.curb[1]; o.yaw = PI / 2; o.anim = chatAnim(day, 'joyce', s); o.phase = 'goodnight'; return o; }
  o.mode = 'home';
  const sp = ROOM_SPOTS.couch, inPts = [P.curb, P.step, P.front, P.frontIn, [sp.x, sp.z]];
  if (!walkOn(inPts, (s - E.tHome) * FOOT_V, o, FOOT_V)) { o.phase = 'in'; return o; }
  o.x = sp.x; o.z = sp.z; o.yaw = sp.yaw; o.anim = 'sit'; o.seatY = sp.seatY; o.seated = true; o.phase = 'couch'; o.inside = true; o.mollySpot = sp.molly;
  return o;
}
const SEAT_ANIMS = ['talk', 'laugh', 'talk', 'look', 'sit', 'talk', 'drink', 'laugh'];
function seated(o, seat, s, day, who) {
  o.x = seat.x; o.z = seat.z; o.yaw = seat.yaw; o.seatY = seat.seatY; o.seated = true; o.speed = 0;
  o.anim = SEAT_ANIMS[Math.floor(hash01('jh-seat', who, day, Math.floor(s / 7)) * SEAT_ANIMS.length)];
}
function chatAnim(day, who, s) { return ['talk', 'idle', 'laugh', 'look', 'talk', 'wave'][Math.floor(hash01('jh-chat', who, day, Math.floor(s / 6)) * 6)]; }
// Molly lies beside Joyce's firepit chair, on the side away from the fire
function mollyByChair(c) { const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw); return { x: c.x + rx * 0.75 - fx * 0.15, z: c.z + rz * 0.75 - fz * 0.15, yaw: c.yaw + 0.6, anim: 'lie' }; }

// ---------------------------------------------------------------- the girlfriends (town-life.js asks for each of its residents)
const walks = new Map();
// home: { door: [x, z], toRoad: [[x, z]...] } the resident's way from their door to Breneland Rd's north sidewalk at Maple Ave
// (town-life.js's own route), sp: their walking speed. Returns { x, z, yaw, speed, anim, seatY?, hidden } or null (their own day).
export function guestAt(id, t, home, sp) {
  const h = hourAt(t), s = h * 3600;
  if (s < EVENING.from * 3600 || s >= EVENING.to * 3600) return null;
  const day = easternDay(t * 1000), E = eveningOfDayPlan(day), k = E.friends.indexOf(id);
  if (k < 0) return null;
  const o = { hidden: false, speed: 0, anim: 'idle', yaw: 0, x: 0, z: 0, guest: E.kind };
  const road = home.toRoad, key = id + ':' + day, w = walks.get(key);   // (their way there and back, built once a day)
  let there = w?.there, arrive, leave, atSpot;
  if (E.kind === 'firepit' || E.kind === 'sunroom') {
    const seat = E.seats[k], round = [P.sideYard, P.gateOut, P.gateIn, [JH.sun.maxX + 0.8, JH.sun.minZ - 0.75], [JH.sun.minX - 0.4, JH.sun.minZ - 0.9]];
    const approach = E.kind === 'firepit' ? [[seat.x + Math.sin(seat.yaw) * 0.7, seat.z + Math.cos(seat.yaw) * 0.7]] : [[JH.patio.maxX - 0.5, JH.sun.minZ - 0.55], P.sunDoorOut, P.sunDoorIn];
    // (the seat's front for the firepit: the walk ends at the seat after stepping round to its front)
    there = there || [...road, [P.sideYard[0], road[road.length - 1][1]], ...round, ...approach, [seat.x, seat.z]];
    arrive = E.t0 + 110 + k * 45;
    leave = E.t1 - 230 + k * 35;
    atSpot = () => { seated(o, seat, s, day, id); };
  } else {
    const m = E.meet[k + 1];
    there = there || [...road, [m[0], road[road.length - 1][1]], m];
    arrive = E.t0 + 150 + k * 40;
    const homeAt = E.tHome - 8 + k * 6;
    leave = homeAt;
    atSpot = () => {
      if (s < E.tGo) { o.x = m[0]; o.z = m[1]; o.yaw = -PI / 2; o.anim = chatAnim(day, id, s); return; }
      if (E.kind === 'walk') { if (s < E.tBack) { inGroup(E, (s - E.tGo) * E.v, k, o, E.v); return; } }
      else if (s < E.tArrive) { inGroup(E, (s - E.tGo) * E.v, k, o, E.v); return; }
      else if (s < E.tBackGo) { bocceSpot(E, s, k + 1, o); return; }
      else if (s < E.tBack) { inGroup(E, (s - E.tBackGo) * E.v, k, o, E.v, E.rpath); return; }
      o.x = m[0]; o.z = m[1]; o.yaw = -PI / 2; o.anim = chatAnim(day, id, s);
    };
  }
  let W = w;
  if (!W) { W = { there, back: there.slice().reverse(), L: polylineLength(there) }; walks.set(key, W); if (walks.size > 40) walks.delete(walks.keys().next().value); }
  const L = W.L, tGo = arrive - L / sp, tIn = leave + L / sp;
  if (s < tGo || s >= tIn) return { hidden: true, guest: E.kind };
  if (s < arrive) { walkOn(W.there, (s - tGo) * sp, o, sp); return o; }
  if (s < leave) { atSpot(); return o; }
  walkOn(W.back, (s - leave) * sp, o, sp);
  return o;
}

// ---------------------------------------------------------------- the firepit
const FIRE_IN = 2.5;   // s for the gas flame to come up (and down)
export function firepitAt(ms, out = {}) {
  const t = ms / 1000, s = hourAt(t) * 3600, E = eveningOfDayPlan(easternDay(ms));
  out.lit = false; out.k = 0; out.kind = E.kind;
  if (E.kind !== 'firepit' && E.kind !== 'quiet') return out;
  const on = E.tLight, off = E.tOff + 3;
  if (s < on || s > off + FIRE_IN) return out;
  out.lit = s < off;
  out.k = Math.max(0, Math.min(1, Math.min((s - on) / FIRE_IN, (off + FIRE_IN - s) / FIRE_IN)));
  return out;
}

// ---------------------------------------------------------------- bocce (Thursday): two against two at the court in the park
// Rounds alternate ends; a round is the pallino and eight balls (two each), thrown in turn from behind the foul line, then the four
// walk down the court's side to the other end and pick them up. Players 0 (Joyce) and 1 against 2 and 3.
const ORDER = [0, 0, 2, 1, 3, 0, 2, 1, 3];
const THROW = 7.5, ROUND_REST = 8, WALK_V = 1.0, WALK_T = (COURT.L + 7) / WALK_V;
function bocceRounds(E) {
  const out = []; let t = E.tArrive + 12, r = 0;
  const walkT = WALK_T;
  while (t + ORDER.length * THROW + ROUND_REST + walkT < E.tBackGo) {
    const e = r % 2 ? -1 : 1;   // the end they throw from (court z sign)
    out.push({ r, e, t0: t, tWalk: t + ORDER.length * THROW + ROUND_REST, t1: t + ORDER.length * THROW + ROUND_REST + walkT });
    t = out[out.length - 1].t1; r++;
  }
  return out;
}
const roundAt = (E, s) => { for (const R of E.rounds) if (s >= R.t0 && s < R.t1) return R; return null; };
// where player p (0 Joyce, 1..3 her friends) is at s
function bocceSpot(E, s, p, o) {
  const R = roundAt(E, s) || (E.rounds[0] && s < E.rounds[0].t0 ? { e: 1, t0: E.rounds[0].t0, tWalk: Infinity, t1: Infinity, pre: true } : { e: (E.rounds.length % 2) ? -1 : 1, t0: -1, tWalk: -1, t1: Infinity, post: true });
  const e = R.e, back = e * (standZ(1) + 1.3), wait = [-1.65, -0.55, 0.55, 1.65][p];
  const yawFwd = courtYaw(e > 0 ? PI : 0);   // looking down the court, toward the far end
  const stand = court(wait, back);
  o.speed = 0; o.anim = 'look'; o.yaw = yawFwd;
  if (R.pre || R.post) { o.x = stand[0]; o.z = stand[1]; o.anim = chatAnim(E.day, 'b' + p, s); return; }
  if (s >= R.tWalk) {   // down the side to the other end
    const side = COURT.W / 2 + 0.75 + (p % 2) * 0.55, a = court(side, back), b = court(side, -back), c = court(wait, -back);
    const pts = [stand, a, b, c];
    if (!walkOn(pts, (s - R.tWalk) * WALK_V, o, WALK_V)) return;
    o.yaw = courtYaw(e > 0 ? 0 : PI); o.anim = 'idle'; return;
  }
  const i = Math.floor((s - R.t0) / THROW), u = s - R.t0 - i * THROW;
  if (ORDER[i] === p) {
    const line = court(0, e * standZ(1)), pp = [stand, line];
    if (u < 1.6) { walkOn(pp, u * 1.2, o, 1.2); return; }
    if (u < 3.4) { o.x = line[0]; o.z = line[1]; o.yaw = yawFwd; o.anim = 'bowl'; return; }
    if (u < 5.0) { o.x = line[0]; o.z = line[1]; o.yaw = yawFwd; o.anim = hash01('jh-cheer', E.day, R.r, i) < 0.5 ? 'cheer' : 'look'; return; }
    walkOn(pp.slice().reverse(), (u - 5.0) * 1.2, o, 1.2); if (o.speed === 0) o.yaw = yawFwd; return;
  }
  o.x = stand[0]; o.z = stand[1];
  o.anim = u > 3 && u < 5 ? (hash01('jh-react', E.day, R.r, i, p) < 0.4 ? 'cheer' : 'look') : 'look';
}
// the balls: [{ i (0 pallino, 1-4 red, 5-8 green), x, y, z }] while a game is on, else null
const RELEASE = 2.3, FLY = 1.15;
export function bocceAt(ms) {
  const t = ms / 1000, s = hourAt(t) * 3600, E = eveningOfDayPlan(easternDay(ms));
  if (E.kind !== 'bocce' || !E.rounds.length) return null;
  const R = roundAt(E, s);
  if (!R) return null;
  const e = R.e, out = [];
  const pal = [(hash01('jh-pal', E.day, R.r) - 0.5) * 1.6, -e * (COURT.L / 4 + hash01('jh-pal2', E.day, R.r) * 2.5)];
  const red = [0, 0, 0, 0], green = [0, 0, 0, 0];
  for (let i = 0; i < ORDER.length; i++) {
    const tr = R.t0 + i * THROW + RELEASE;
    if (s < tr) break;
    const p = ORDER[i], team = p === 0 || p === 1 ? 0 : 1;
    const id = i === 0 ? 0 : team === 0 ? 1 + red.indexOf(0) : 5 + green.indexOf(0);
    if (i > 0) (team === 0 ? red : green)[id - (team === 0 ? 1 : 5)] = 1;
    const land = i === 0 ? pal : [pal[0] + (hash01('jh-bx', E.day, R.r, i) - 0.5) * 2.2, pal[1] + (hash01('jh-bz', E.day, R.r, i) - 0.5) * 2.4];
    if (s >= R.tWalk + (COURT.L * 0.85) / WALK_V) continue;   // picked up at the far end
    const f = Math.min(1, (s - tr) / FLY), from = [0.12, e * releaseZ(1)];
    const lx = from[0] + (land[0] - from[0]) * f, lz = from[1] + (land[1] - from[1]) * f;
    const [x, z] = court(lx, lz);
    out.push({ i: id, x, z, y: COURT_Y + (id === 0 ? 0.055 : 0.09) + Math.sin(Math.PI * f) * 0.5 });
  }
  return out;
}
export const EVE_ROOM = ROOM_SPOTS;
