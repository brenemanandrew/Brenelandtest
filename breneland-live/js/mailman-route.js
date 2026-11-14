// Timed routes for the people who work the street (Pat the mail carrier, the pizza driver): segments laid end to end in shared-clock
// time. Everything comes from hash01 / mulberry32, so a route and where its walker is at any moment (routeAt) match on every client.
//
//   walk  { path, len, sp }                   walking a polyline
//   ride  { path, len, sp }                   riding the scooter along a polyline (seated)
//   hold  { x, z, yaw, acts, say, fly, hands, seated }  standing still doing things; acts = [[u, anim], ...],
//         say = [[u, text]], fly = [{ u, dur, kind, from, to, h }] (a letter or biscuit in the air), hands = [[u, item]]
//   hide  { x, z }                            not in the scene (in the van, gone home)
import { polylineLength, alongPolyline } from './util.js';
import { groundHeight } from './terrain.js';
import { STREET } from './layout.js';

// Street geometry (world.js buildNeighborhood): the street runs x -170..57.5; sidewalks are raised to 0.44.
export const STREET_X0 = -95, STREET_X1 = 57.5;
export const SIDEWALK_S = [STREET.z0, -40.9];            // our side, between the curb and the verge by the fence
export const SIDEWALK_N = [STREET.sidewalkN, STREET.z1];  // across the street
export const Z_S = -43.2, Z_N = -54.1;                   // where people walk on each sidewalk (clear of the lamp posts)

// Height of the ground a street walker stands on: the tar and the sidewalks sit above the lawn, and groundHeight knows
// them (terrain.js asks road-net.js, the same field world-town.js builds the roads from).
export function streetY(x, z) {
  return groundHeight(x, z);
}

export class Route {
  constructor(t0) { this.t0 = t0; this.t = t0; this.segs = []; this.x = 0; this.z = 0; }
  at(x, z) { this.x = x; this.z = z; return this; }
  move(kind, pts, sp, extra) {
    const path = [[this.x, this.z], ...pts], len = polylineLength(path);
    const e = pts[pts.length - 1];
    if (len > 0.01) { const dur = len / sp; this.segs.push({ kind, t0: this.t, dur, path, len, sp, ...extra }); this.t += dur; }
    this.x = e[0]; this.z = e[1];
    return this;
  }
  walk(pts, sp = 1.45, extra = null) { return this.move('walk', pts, sp, extra); }
  ride(pts, sp = 6.5, extra = null) { return this.move('ride', pts, sp, extra); }
  hold(dur, yaw, acts, extra = null) { this.segs.push({ kind: 'hold', t0: this.t, dur, x: this.x, z: this.z, yaw, acts, ...extra }); this.t += dur; return this; }
  hide(dur) { if (dur > 0) this.segs.push({ kind: 'hide', t0: this.t, dur, x: this.x, z: this.z }); this.t += Math.max(0, dur); return this; }
  end() { return this.t; }
}

// Index of the segment running at time t (clamped to the first/last).
export function segIndex(route, t) {
  const s = route.segs;
  let lo = 0, hi = s.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s[m].t0 <= t) lo = m; else hi = m - 1; }
  return lo;
}

const lastAt = (list, u, def) => { let v = def; if (list) for (const e of list) if (e[0] <= u) v = e[1]; return v; };

// Where the walker is at time t: { x, z, yaw, speed, anim, hidden, seated, riding, hand, seg, i, u }.
export function routeAt(route, t, defHand = null) {
  const i = segIndex(route, t), g = route.segs[i];
  const u = Math.max(0, Math.min(g.dur, t - g.t0));
  if (g.kind === 'hide') return { x: g.x, z: g.z, yaw: 0, speed: 0, anim: 'idle', hidden: true, seated: false, riding: false, hand: null, seg: g, i, u };
  if (g.kind === 'hold') {
    return { x: g.x, z: g.z, yaw: g.yaw, speed: 0, anim: lastAt(g.acts, u, 'idle'), hidden: false, seated: !!g.seated, riding: false,
      hand: g.hands ? lastAt(g.hands, u, defHand) : g.hand !== undefined ? g.hand : defHand, seg: g, i, u };
  }
  const [x, z, dx, dz] = alongPolyline(g.path, u * g.sp);
  const moving = t < g.t0 + g.dur;
  return { x, z, yaw: Math.atan2(dx, dz), speed: moving ? g.sp : 0, anim: null, hidden: false, seated: g.kind === 'ride', riding: g.kind === 'ride',
    hand: g.hand !== undefined ? g.hand : g.kind === 'ride' ? null : defHand, seg: g, i, u };
}

// Split a polyline at distance d -> [first part, second part].
function splitPath(path, d) {
  const a = [path[0]];
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const p = path[i - 1], q = path[i], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (acc + L >= d) {
      const k = L > 1e-6 ? (d - acc) / L : 0, m = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
      a.push(m);
      return [a, [m, ...path.slice(i)]];
    }
    acc += L; a.push(q);
  }
  const e = path[path.length - 1];
  return [a, [e, e]];
}

export function cloneRoute(r) {
  const c = new Route(r.t0);
  c.segs = r.segs.map(s => ({ ...s }));
  c.t = r.t; c.x = r.x; c.z = r.z; c.minHide = r.minHide;
  return c;
}

// Stop the walker at time t for `dur` seconds (everything later happens that much later, the final hide shrinks to make room).
// Walk segments only. Returns the new hold, or null when it doesn't fit.
export function insertHold(route, t, dur, yaw, acts, extra = null) {
  const i = segIndex(route, t), g = route.segs[i];
  if (!g || g.kind !== 'walk' || t < g.t0 || t > g.t0 + g.dur) return null;
  const last = route.segs[route.segs.length - 1];
  if (last.kind !== 'hide' || last.dur - dur < (route.minHide || 1)) return null;
  const d = (t - g.t0) * g.sp, [p1, p2] = splitPath(g.path, d);
  const [x, z] = p1[p1.length - 1];
  const a = { ...g, path: p1, len: d, dur: t - g.t0 };
  const h = { kind: 'hold', t0: t, dur, x, z, yaw, acts, ...extra };
  const b = { ...g, t0: t + dur, path: p2, len: g.len - d, dur: g.dur - (t - g.t0) };
  const out = [];
  if (a.dur > 1e-3) out.push(a);
  out.push(h);
  if (b.dur > 1e-3) out.push(b);
  route.segs.splice(i, 1, ...out);
  for (let j = i + out.length; j < route.segs.length; j++) route.segs[j].t0 += dur;
  last.dur -= dur;
  return h;
}

// Every absolute moment a hold says something: [{ t, text, key }]
export function sayings(route, tag) {
  const out = [];
  route.segs.forEach((g, i) => { if (g.say) g.say.forEach((s, j) => out.push({ t: g.t0 + s[0], text: s[1], key: tag + ':' + i + ':' + j })); });
  return out;
}
// Every flying thing: [{ t0, dur, kind, from, to, h }]
export function flights(route) {
  const out = [];
  for (const g of route.segs) if (g.fly) for (const f of g.fly) out.push({ ...f, t0: g.t0 + f.u });
  return out;
}
