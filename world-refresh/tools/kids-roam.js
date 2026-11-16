// Tess and Rudy, the two kids who used to play catch on the old unicorn lawn, now roam Breneland together (world-refresh test game,
// tools/patch_kids_roam.py copies this file in). Out of Tess's front door in Maple Row after breakfast, over the zebra at the front
// gate and along the trails to the fun spots: the frisbee field, the beach, the fountain, the swing hill, the meadow, the picnic lawn
// and the green over the road. At each they play a game for a few minutes (catch, tag, jump rope, rock-paper-scissors, hide-and-seek
// round a tree), then move on. Home again before dark.
//
// Everything is a pure function of the shared clock (net.serverNow(), the NPC rule): a day's plan comes from hash01 of the day,
// routes from the trails (the same graph on every client), every game's moves from the time into it. Nothing is stored or sent, so
// every visitor sees the same kids in the same place, the ball in the same spot of its arc and the same rope turning.
//   kidsAt(t) -> { hidden } or { A, B, ball?, rope?, seg }  (A Tess, B Rudy: { x, z, yaw, anim, lift, line? })
// The bodies are only drawn and animated near the camera. crowd.js keeps them out of players and props (they opt in), and the
// push fades as they carry on.
import * as THREE from 'three';
import { Human } from './human.js';
import { hash01, polylineLength, alongPolyline } from './util.js';
import { groundHeight } from './terrain.js';
import { hourAt, sinceHour, pinned } from './npcs-day.js';
import { GEO } from './batch.js';
import { toon } from './toon.js';

const OUT_H = 8.75, HOME_H = 19.5;          // out of the door after breakfast, home before dark (Eastern time)
const SPAN = (HOME_H - OUT_H) * 3600;
const WALK = 1.45, RUN = 2.7;                // m/s: side by side, or racing each other
const SIDE = 0.45;                           // each kid's offset from the walk's centre line
const TS = 4;                                // s: the walk-in to a game's start places, and back out to the walk at the end
const LOOK = {
  tess: { shirt: '#fff27a', pants: '#3f5f8f', hair: '#c9873a', hairStyle: 'pony', skin: '#f6d3b3', height: 0.72, shape: 0.9, eyeStyle: 'hooded', scale: 0.78 },
  rudy: { shirt: '#6fd3ff', pants: '#2e2e36', hair: '#1e1a18', hairStyle: 'spiky', skin: '#a86b45', height: 0.76, eyeStyle: 'hooded', scale: 0.8 },
};
const VOICE = { tess: { pitch: 340, rate: 1.3, formant: 1.25 }, rudy: { pitch: 300, rate: 1.3, formant: 1.2 } };
const HI = ['Hi! We are playing!', 'Wanna play? Just kidding, you are too tall.', 'Hiii!', 'Rudy cheats at tag.', 'Tess always wins rock-paper-scissors.', 'We are going to the beach next!'];

// ---- where they go. Each spot: its way in from the trails (`entry`, a trail point) and the games it suits. A game's `at` is where
// the walk ends (they walk from there to the game's places). Measured on the test game's top view; tools/kids_roam_test.cjs checks
// that every place, walk and game stays off the roads and clear of every collider.
const HOME = { door: [4, -112.6], name: 'home' };
// the walks that aren't trails: the gate to the zebra and over Breneland Rd, along the north sidewalk, round the house to the door
const LINKS = [
  [[2.5, -42], [2.5, -48.5], [2.5, -54.6]],
  [[2.5, -54.6], [18, -54.6], [22, -59]],
  [[2.5, -54.6], [-4.5, -54.6], [-4.5, -100], [-4.5, -114.6], [4, -114.6], [4, -112.6]],
];
export const SPOTS = [
  { id: 'frisbee', name: 'the frisbee field', entry: [22, -34.1], games: [
    { kind: 'catch', c: [24, -26], ang: 0, half: 4.2, at: [23, -30] },
    { kind: 'tag', c: [16.5, -26.5], R: 4.2, th: -1.4, at: [16.5, -30.7] },
    { kind: 'hide', tree: { x: 22, z: -17, r: 0.57 }, beta: -Math.PI / 2, at: [22, -24] }] },
  { id: 'beach', name: 'the beach', entry: [13.8, 6.1], games: [
    { kind: 'catch', c: [24, 4], ang: 0, half: 3.6, at: [17, 3.6] },
    { kind: 'tag', c: [24.5, 3], R: 3, th: Math.PI, at: [17, 3.6] },
    { kind: 'rope', c: [21, 4], ang: 0, at: [17, 3.6] }] },
  { id: 'fountain', name: 'the fountain', entry: [-57, -2], games: [
    { kind: 'tag', c: [-62.5, -1], R: 5.4, th: -0.15, at: [-57.2, -1.8], ring: true },
    { kind: 'rps', c: [-59.6, -7.2], ang: 0.4, at: [-57.8, -5.6] }] },
  { id: 'swing', name: 'the swing hill', entry: [-60, 11], games: [
    { kind: 'rope', c: [-67, 6.6], ang: 0.2, at: [-63, 8.6] },
    { kind: 'rps', c: [-66.5, 6.8], ang: 0.2, at: [-63, 8.6] }] },   // (on the flat by the swing tree, off the sand pit's rim)
  { id: 'meadow', name: 'the meadow', entry: [-92, 11], games: [
    { kind: 'hide', tree: { x: -95.7, z: 27.7, r: 0.65 }, beta: -1.35, at: [-93, 18] },
    { kind: 'catch', c: [-86, 20], ang: 0, half: 4.2, at: [-88, 15] }] },
  { id: 'picnic', name: 'the picnic lawn', entry: [-27, -10.6], games: [
    { kind: 'rps', c: [-28, -18.5], ang: 0, at: [-27.5, -15] },
    { kind: 'rope', c: [-27, -19], ang: 0, at: [-27.5, -15] },
    { kind: 'hide', tree: { x: -19, z: -19.5, r: 0.64 }, beta: Math.PI / 2, at: [-20.5, -13.6] }] },
  { id: 'green', name: 'the green over the road', entry: [22, -59], w: 0.6, games: [
    { kind: 'catch', c: [24, -61.5], ang: 0, half: 3.8, at: [22, -59] },
    { kind: 'tag', c: [24.5, -61], R: 3.2, th: Math.PI, at: [22, -59] }] },
];

// ---- the walking graph: every trail's points (as npcs.js NavGraph reads them) plus LINKS, joined where points meet (0.1 m)
function makeGraph(trails) {
  const nodes = [], adj = [], index = new Map();
  const id = p => { const k = Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10); if (!index.has(k)) { index.set(k, nodes.length); nodes.push([p[0], p[1]]); adj.push([]); } return index.get(k); };
  for (const pts of [...trails.map(t => t.pts), ...LINKS]) for (let i = 1; i < pts.length; i++) {
    const a = id(pts[i - 1]), b = id(pts[i]), d = Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1]);
    adj[a].push([b, d]); adj[b].push([a, d]);
  }
  const nearest = (x, z) => { let best = 0, bd = Infinity; nodes.forEach((n, i) => { const d = (n[0] - x) ** 2 + (n[1] - z) ** 2; if (d < bd) { bd = d; best = i; } }); return best; };
  function path(a, b) { // node points from the one nearest a to the one nearest b (Dijkstra)
    const s = nearest(a[0], a[1]), g = nearest(b[0], b[1]);
    const dist = new Array(nodes.length).fill(Infinity), prev = new Array(nodes.length).fill(-1), done = new Array(nodes.length).fill(false);
    dist[s] = 0;
    for (;;) {
      let u = -1, ud = Infinity;
      for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
      if (u < 0 || u === g) break;
      done[u] = true;
      for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
    const out = [];
    for (let c = g; c >= 0; c = prev[c]) out.unshift(nodes[c]);
    return out;
  }
  return { nodes, path };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
const polar = (c, a, r) => [c.x + Math.cos(a) * r, c.z + Math.sin(a) * r];
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const dedupe = pts => pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.05);

// ---- the games: g(τ, Q, game, seed) -> { A, B, ball?, rope?, line? } for τ in [0, Q] seconds of play. A kid: [x, z, yaw, anim, lift]
const RPS = ['Rock!', 'Paper!', 'Scissors!'];
const GAMES = {
  // catch: 2*half m apart, the ball A -> B -> A, one throw every 2.4 s
  catch(τ, Q, g) {
    const ux = Math.cos(g.ang), uz = Math.sin(g.ang), A = [g.c[0] - ux * g.half, g.c[1] - uz * g.half], B = [g.c[0] + ux * g.half, g.c[1] + uz * g.half];
    const T = 2.4, k = Math.floor(τ / T), u = τ / T - k, aThrows = k % 2 === 0;
    const P = aThrows ? A : B, R = aThrows ? B : A, h = 0.95 + Math.sin(u * Math.PI) * (1.6 + 0.6 * hash01('arc', k));
    const ball = τ > 0 && τ < Q ? [lerp(P[0], R[0], u), h, lerp(P[1], R[1], u)] : null;
    const anim = mine => (!ball ? 'idle' : mine === aThrows ? (u < 0.25 ? 'throw' : 'idle') : (u > 0.78 ? 'catch' : 'idle'));
    const lines = ['Catch!', 'Got it!', 'Throw it high!', 'Nice one!', 'Butterfingers!'];
    const line = k % 5 === 1 && u < 0.4 ? { who: aThrows ? 0 : 1, text: lines[Math.floor(hash01('cl', k) * lines.length)], key: 'c' + k } : null;
    return { A: [A[0], A[1], faceTo(A[0], A[1], B[0], B[1]), anim(true), 0], B: [B[0], B[1], faceTo(B[0], B[1], A[0], A[1]), anim(false), 0], ball, line };
  },
  // tag round a ring: rounds of 10 s, whoever is "it" chases the other round the ring; a tag at the end of each round swaps them and
  // the new runner turns and flees the other way. Each round starts where the last ended, so nobody jumps.
  tag(τ, Q, g) {
    const c = { x: g.c[0], z: g.c[1] }, Tr = 10, Om = 2.2 / g.R, G0 = 0.13;
    const r = Math.floor(τ / Tr), s = τ / Tr - r, dir = r % 2 ? -1 : 1;
    const A0 = g.th + (r % 2 ? Om * Tr + G0 : 0);                // the chaser's angle at the round's start
    const chase = A0 + dir * Om * Tr * s, run = chase + dir * (G0 + Math.min(1.1, 4.5 / g.R) * Math.sin(Math.PI * s));
    const itIsA = r % 2 === 0;                                    // round 0: Tess is it
    const wob = k => g.R + 0.35 * Math.sin(τ * 0.9 + k * 2.1);
    const pc = polar(c, chase, wob(itIsA ? 0 : 1)), pr = polar(c, run, wob(itIsA ? 1 : 0));
    const along = a => Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);   // facing along the ring, the way they run (yaw = atan2(dx, dz))
    const C = [pc[0], pc[1], along(chase), null, 0], Rn = [pr[0], pr[1], along(run), null, 0];
    const line = r > 0 && s < 0.25 ? { who: itIsA ? 1 : 0, text: ['Tag! You\'re it!', 'Got you!', 'Tag!', 'Can\'t catch me!'][r % 4], key: 't' + r } : null;
    return itIsA ? { A: C, B: Rn, line } : { A: Rn, B: C, line };
  },
  // jump rope: one jumps, the other counts; they swap every 14 s (1.5 s to trade places)
  rope(τ, Q, g) {
    const ux = Math.cos(g.ang), uz = Math.sin(g.ang), mid = g.c, side = [g.c[0] - uz * 1.7, g.c[1] + ux * 1.7];
    const Tr = 14, r = Math.floor(τ / Tr), v = τ - r * Tr, jA = r % 2 === 0;   // round 0: Tess jumps
    let J = mid, Cn = side, swapping = false;
    if (r > 0 && v < 1.6) {   // trading places: the last jumper steps out, the counter steps in, each round the other
      const k = smooth(0, 1.6, v), bulge = Math.sin(Math.PI * k) * 0.7;
      J = [lerp(side[0], mid[0], k) + ux * bulge, lerp(side[1], mid[1], k) + uz * bulge];
      Cn = [lerp(mid[0], side[0], k) - ux * bulge, lerp(mid[1], side[1], k) - uz * bulge]; swapping = true;
    }
    const spin = !swapping && τ > 0 && τ < Q;
    const ph = spin ? (v - 1.6) / 0.72 : 0, f = ph - Math.floor(ph);
    const lift = spin ? 0.2 * Math.max(0, (Math.cos(2 * Math.PI * (f - 0.5)) - 0.35) / 0.65) : 0;
    const jumper = [J[0], J[1], swapping ? null : faceTo(J[0], J[1], Cn[0], Cn[1]), swapping ? null : 'idle', lift];
    const count = Math.max(0, Math.floor(ph));
    const counter = [Cn[0], Cn[1], faceTo(Cn[0], Cn[1], J[0], J[1]), swapping ? null : count % 6 === 5 ? 'cheer' : 'talk', 0];
    const line = spin && count > 0 && count % 4 === 0 && f < 0.5 ? { who: jA ? 1 : 0, text: count + '!', quiet: true, key: 'j' + r + ':' + count } : null;
    return { A: jA ? jumper : counter, B: jA ? counter : jumper, rope: spin ? { who: jA ? 0 : 1, ang: 2 * Math.PI * f } : null, line };
  },
  // rock-paper-scissors: 1.4 m apart, a round every 4.5 s: shake, show, the winner cheers
  rps(τ, Q, g, seed) {
    const ux = Math.cos(g.ang), uz = Math.sin(g.ang), A = [g.c[0] - ux * 0.7, g.c[1] - uz * 0.7], B = [g.c[0] + ux * 0.7, g.c[1] + uz * 0.7];
    const T = 4.5, k = Math.floor(τ / T), v = τ - k * T, live = τ > 0 && τ < Q;
    const a = Math.floor(hash01('rpsA', seed, k) * 3), b = Math.floor(hash01('rpsB', seed, k) * 3), w = a === b ? 0 : (a - b + 3) % 3 === 1 ? 1 : 2; // 1: Tess wins
    const anim = me => !live ? 'idle' : v < 1.8 ? 'think' : v < 2.6 ? 'point' : w === 0 ? 'laugh' : w === me ? 'cheer' : 'shrug';
    let line = null;
    if (live && v < 1.8 && k % 3 === 0) line = { who: k % 2, text: 'Rock... paper... scissors...', key: 'r' + k };
    else if (live && v >= 1.8 && v < 2.6) line = { who: 2, text: [RPS[a], RPS[b]], key: 's' + k };
    return { A: [A[0], A[1], faceTo(A[0], A[1], B[0], B[1]), anim(1), 0], B: [B[0], B[1], faceTo(B[0], B[1], A[0], A[1]), anim(2), 0], line };
  },
  // hide-and-seek round a tree: the seeker counts at the base looking away, the hider runs behind the trunk and crouches, the seeker
  // comes round the tree and finds them, both walk back to the base with the roles swapped. Every move is an arc round the trunk
  // (angle and radius eased together), so nobody walks through it.
  hide(τ, Q, g) {
    const tr = g.tree, R0 = tr.r, b = g.beta, live = τ > 0 && τ < Q, Tr = 24;
    const S = [b, R0 + 5.5], S2 = [b + Math.atan2(1.2, R0 + 5.5), Math.hypot(1.2, R0 + 5.5)];
    const r = Math.floor(τ / Tr), v = τ - r * Tr, seekA = r % 2 === 0;   // round 0: Tess seeks
    const key = (fr, list) => { // list: [[t, angle, radius], ...] -> [angle, radius] at v
      if (fr <= list[0][0]) return [list[0][1], list[0][2]];
      for (let i = 1; i < list.length; i++) if (fr <= list[i][0]) { const k = smooth(list[i - 1][0], list[i][0], fr); return [lerp(list[i - 1][1], list[i][1], k), lerp(list[i - 1][2], list[i][2], k)]; }
      const L = list[list.length - 1]; return [L[1], L[2]];
    };
    const hidA = b + Math.PI, near = R0 + 0.75;
    const seeker = key(v, [[0, ...S], [9, ...S], [10.5, b + 0.45, R0 + 2.3], [16, hidA - 0.75, R0 + 2.3], [18, hidA - 0.75, R0 + 2.3], [21, b + Math.PI / 2 + 0.25, R0 + 2.7], [24, ...S2]]);
    const hider = key(v, [[0, ...S2], [2.2, b + Math.PI / 2, R0 + 1.8], [3.6, hidA, near], [18, hidA, near], [21, b + Math.PI / 2, R0 + 1.8], [24, ...S]]);
    const ps = polar(tr, seeker[0], seeker[1]), ph = polar(tr, hider[0], hider[1]);
    const out = ang => Math.atan2(Math.cos(ang), Math.sin(ang)); // facing straight out from the trunk
    let sA = null, hA = null, sY = null, hY = null;
    if (live) {
      if (v < 9) { sA = 'think'; sY = out(seeker[0]); }
      else if (v >= 16 && v < 18) { sA = v < 17 ? 'point' : 'laugh'; sY = faceTo(ps[0], ps[1], ph[0], ph[1]); }
      if (v >= 3 && v < 16) { hA = 'crouch'; hY = out(hider[0]); }
      else if (v >= 16 && v < 18) { hA = 'laugh'; hY = faceTo(ph[0], ph[1], ps[0], ps[1]); }
    }
    const SE = [ps[0], ps[1], sY, sA, 0], HI2 = [ph[0], ph[1], hY, hA, 0];
    let line = null;
    if (live) {
      if (v < 2.5) line = { who: seekA ? 0 : 1, text: 'One... two... three...', key: 'h' + r };
      else if (v >= 8 && v < 10) line = { who: seekA ? 0 : 1, text: '...ten! Ready or not, here I come!', key: 'hr' + r };
      else if (v >= 16 && v < 18) line = { who: seekA ? 0 : 1, text: 'Found you!', key: 'hf' + r, giggle: true };
    }
    return seekA ? { A: SE, B: HI2, line } : { A: HI2, B: SE, line };
  },
};
const atOf = g => g.at;
// each game's round (s): catch two throws, tag and jump rope two turns each, hide-and-seek two hides
const ROUND = { catch: 4.8, tag: 20, rope: 28, rps: 4.5, hide: 48 };

// ---- a day: walk, play, walk, play... and home. Built once per day from hash01(day, k), cached.
export function createPlanner(trails) {
  const graph = makeGraph(trails);
  const routes = new Map();
  const spotOf = g => SPOTS.find(s => s.games.includes(g));
  function route(a, b) { // from game a (or HOME) to game b (or HOME): the game's place, its spot's way in, the trails, the way out
    const k = (a.id || a.door) + '>' + (b.id || b.door);
    let r = routes.get(k);
    if (r) return r;
    const pa = a === HOME ? HOME.door : atOf(a), pb = b === HOME ? HOME.door : atOf(b);
    const ea = a === HOME ? HOME.door : spotOf(a).entry, eb = b === HOME ? HOME.door : spotOf(b).entry;
    const sa = a === HOME ? null : spotOf(a), sb = b === HOME ? null : spotOf(b);
    if (sa && sa === sb) r = dedupe([pa, pb]);
    else r = dedupe([pa, ...graph.path(ea, eb), pb]);
    routes.set(k, r);
    return r;
  }
  let gid = 0; for (const s of SPOTS) for (const g of s.games) g.id = 'g' + gid++;
  const all = SPOTS.flatMap(s => s.games.map(g => ({ s, g })));
  const days = new Map();
  function day(t0, t1, key) {
    let d = days.get(key);
    if (d) return d;
    const segs = [];
    let t = t0, from = HOME, prevSpot = null, last = null;
    for (let k = 0; k < 400; k++) {
      // the next spot: weighted draw, never the one they just left
      const opts = SPOTS.filter(s => s !== prevSpot), tot = opts.reduce((a, s) => a + (s.w || 1), 0);
      let x = hash01('kids-spot', key, k) * tot, s = opts[opts.length - 1];
      for (const o of opts) { x -= o.w || 1; if (x < 0) { s = o; break; } }
      const g = s.games[Math.floor(hash01('kids-game', key, k) * s.games.length)];
      const r1 = route(from, g), L1 = polylineLength(r1), race = L1 > 25 && L1 < 120 && hash01('kids-race', key, k) < 0.22, sp = race ? RUN : WALK;
      const RD = ROUND[g.kind], P = 2 * TS + RD * Math.round((170 + hash01('kids-play', key, k) * 200) / RD);   // (whole rounds: a game ends where it began)
      const back = polylineLength(route(g, HOME)) / WALK;
      if (t + L1 / sp + P + back > t1) break;
      segs.push({ kind: 'walk', t0: t, t1: t + L1 / sp, route: r1, len: L1, sp, race, k });
      t += L1 / sp;
      segs.push({ kind: 'play', t0: t, t1: t + P, g, spot: s, seed: key * 1000 + k, k });
      t += P; from = g; prevSpot = s; last = g;
    }
    if (last) { const r = route(last, HOME), L = polylineLength(r); segs.push({ kind: 'walk', t0: t, t1: t + L / WALK, route: r, len: L, sp: WALK, home: true }); }
    // each game's arrival and leaving places: where the walks into and out of it end and start
    for (let i = 0; i < segs.length; i++) if (segs[i].kind === 'play') { segs[i].arrive = walkAt(segs[i - 1], segs[i - 1].len); segs[i].leave = walkAt(segs[i + 1], 0); }
    d = { t0, t1, segs, key };
    days.set(key, d);
    if (days.size > 3) days.delete(days.keys().next().value);
    return d;
  }
  // the day for shared time t. On the real clock: out at OUT_H (Eastern), home by HOME_H. With the clock pinned (?hour=, tests) the
  // kids play through one day plan after another, back to back, while the pinned hour is a daytime one.
  function dayAt(t) {
    if (pinned()) {
      const h = hourAt(t); if (h < OUT_H || h >= HOME_H) return null;
      const n = Math.floor(t / SPAN); return day(n * SPAN, (n + 1) * SPAN, n);
    }
    const t0 = sinceHour(t, OUT_H);
    return day(t0, t0 + SPAN, Math.round(t0 / 3600));
  }
  return { route, day, dayAt, graph };
}

// the two kids on a walk, d metres along it: side by side across the direction of a 2 m chord (smooth through the corners)
function walkAt(seg, d) {
  const R = seg.route, L = seg.len;
  d = Math.min(L, Math.max(0, d));
  const [x, z] = alongPolyline(R, d), p0 = alongPolyline(R, Math.max(0, d - 1)), p1 = alongPolyline(R, Math.min(L, d + 1));
  let dx = p1[0] - p0[0], dz = p1[1] - p0[1]; const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;
  const yaw = Math.atan2(dx, dz);
  return { A: [x - dz * SIDE, z + dx * SIDE, yaw], B: [x + dz * SIDE, z - dx * SIDE, yaw] };
}

const HIDDEN = { hidden: true };
// the kids at shared time t (pure)
export function kidsAt(P, t) {
  const d = P.dayAt(t);
  if (!d || t < d.t0 || !d.segs.length || t >= d.segs[d.segs.length - 1].t1) return HIDDEN;
  const S = d.segs;
  let lo = 0, hi = S.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S[m].t0 <= t) lo = m; else hi = m - 1; }
  const seg = S[lo];
  if (seg.kind === 'walk') {
    const w = walkAt(seg, (t - seg.t0) * seg.sp);
    let line = null;
    if (seg.race && t - seg.t0 < 2.5) line = { who: seg.k % 2, text: 'Race you!', key: 'race' + d.key + ':' + seg.k };
    else if (seg.home && t - seg.t0 < 3) line = { who: 0, text: 'Dinner time! Bye!', key: 'home' + d.key };
    return { A: [...w.A, null, 0], B: [...w.B, null, 0], seg, line, run: seg.sp > 2 };
  }
  const u = t - seg.t0, Pd = seg.t1 - seg.t0, Q = Pd - 2 * TS, tau = Math.min(Q, Math.max(0, u - TS));
  const G = GAMES[seg.g.kind](tau, Q, seg.g, seg.seed);
  const kIn = smooth(0, TS, u), kOut = smooth(Pd - TS, Pd, u);
  // in from the walk and back out to it: a game round a ring or a tree eases angle and radius about its middle (an arc, never
  // through the fountain or the trunk), the others go straight
  const pv = seg.g.kind === 'hide' ? seg.g.tree : seg.g.ring ? { x: seg.g.c[0], z: seg.g.c[1] } : null;
  const go = (p, q, k) => {
    if (k <= 0) return p; if (k >= 1) return q;
    if (!pv) return [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
    const a0 = Math.atan2(p[1] - pv.z, p[0] - pv.x), r0 = Math.hypot(p[0] - pv.x, p[1] - pv.z), r1 = Math.hypot(q[0] - pv.x, q[1] - pv.z);
    let da = Math.atan2(q[1] - pv.z, q[0] - pv.x) - a0; da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI;
    return polar(pv, a0 + da * k, lerp(r0, r1, k));
  };
  const moving = (kIn > 0 && kIn < 1) || (kOut > 0 && kOut < 1);
  const mix = (g, a, l) => { const [x, z] = go(go(a, g, kIn), l, kOut); return [x, z, moving ? null : g[2], moving ? null : g[3], moving ? 0 : g[4]]; };
  const A = mix(G.A, seg.arrive.A, seg.leave.A), B = mix(G.B, seg.arrive.B, seg.leave.B);
  if (moving) apart(A, B, 0.6, seg.arrive.A, seg.arrive.B);   // (trading sides on the way in or out: they pass, not through each other)
  return { A, B, ball: G.ball, rope: G.rope, seg, line: G.line ? { ...G.line, key: d.key + ':' + seg.k + ':' + G.line.key } : null };
}
// two kids nearer than m: each pushed out half the shortfall, along the line between them (or across the way they came, a and b,
// when they're on one spot). Zero at m, so nothing jumps.
function apart(A, B, m, a, b) {
  let dx = B[0] - A[0], dz = B[1] - A[1], d = Math.hypot(dx, dz);
  if (d >= m) return;
  if (d < 1e-3) { dx = b[0] - a[0]; dz = b[1] - a[1]; d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; d = 0; } else { dx /= d; dz /= d; }
  const h = (m - d) / 2; A[0] -= dx * h; A[1] -= dz * h; B[0] += dx * h; B[1] += dz * h;
}

// ---- the scene side
export function createKidsRoam(ctx) {
  const { scene, ui, net, camera, audio, player, world } = ctx;
  const planner = createPlanner(world.trailPaths);
  const api = { planner, offset: 0, SPOTS, stateAt: t => kidsAt(planner, t), shown: false };
  const kids = ['tess', 'rudy'].map((id, i) => {
    const h = new Human({ ...LOOK[id] });
    h.root.visible = false; scene.add(h.root);
    h.root.userData.crowd = { r: 0.28 };   // (crowd.js: they give way to everyone else)
    const tag = ui.nameTag(h.root, i ? 'Rudy' : 'Tess', '#ffffff'); tag.max = 16; tag.fade = 11; tag.dy = 1.85;
    return { id, h, tag, name: i ? 'Rudy' : 'Tess', tgt: [0, 0], off: [0, 0], have: false, lastLine: null, local: null };
  });
  const ball = new THREE.Mesh(GEO.sphere, toon('#ff6b6b')); ball.scale.setScalar(0.11); ball.castShadow = true; ball.visible = false; scene.add(ball);
  // the rope: a loop from hand to hand, turned about the line between the hands (rebuilt never: the loop's shape is fixed)
  const ropeCurve = new THREE.CatmullRomCurve3(Array.from({ length: 17 }, (_, i) => { const s = -1 + i / 8, w = Math.sqrt(Math.max(0, 1 - s * s)); return new THREE.Vector3(s * 0.32, -w * 0.72, 0); }));
  const rope = new THREE.Mesh(new THREE.TubeGeometry(ropeCurve, 32, 0.012, 5, false), toon('#e8e2d0')); rope.visible = false; scene.add(rope);
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _x = new THREE.Vector3(1, 0, 0);
  let far = true;
  ctx.kidsRoam = api;   // (gates.js, patched: the yard's gates swing open for them)
  api.walkers = () => kids.filter(k => k.h.root.visible).map(k => k.h.root.position);

  return {
    name: 'kids-roam',
    api,
    update(dt, now) {
      const t = net.serverNow() / 1000 + api.offset;
      const s = kidsAt(planner, t);
      const cam = camera.position;
      if (s.hidden) { for (const k of kids) { k.h.root.visible = false; k.have = false; } ball.visible = rope.visible = false; api.shown = false; return; }
      // only near the camera: two radii so they don't flicker on the line
      const mx = (s.A[0] + s.B[0]) / 2, mz = (s.A[1] + s.B[1]) / 2, cd = Math.hypot(cam.x - mx, cam.z - mz);
      far = far ? cd > 72 : cd > 78;
      api.shown = !far;
      if (far) { for (const k of kids) { k.h.root.visible = false; k.have = false; } ball.visible = rope.visible = false; return; }
      const ahead = kidsAt(planner, t + 0.15);
      kids.forEach((k, i) => {
        const q = i ? s.B : s.A, q2 = ahead.hidden ? q : (i ? ahead.B : ahead.A), r = k.h.root;
        const vx = (q2[0] - q[0]) / 0.15, vz = (q2[1] - q[1]) / 0.15, speed = Math.hypot(vx, vz);
        // crowd.js pushes the root off a player or a prop after this; the push (the difference from where the clock put them last
        // frame) fades over a second, the schedule itself is never late
        if (k.have) { const ex = r.position.x - k.tgt[0], ez = r.position.z - k.tgt[1], f = Math.exp(-dt * 4); k.off[0] = Math.abs(ex) < 2 ? ex * f : 0; k.off[1] = Math.abs(ez) < 2 ? ez * f : 0; }
        else k.off[0] = k.off[1] = 0;
        k.tgt[0] = q[0]; k.tgt[1] = q[1]; k.have = true;
        const x = q[0] + k.off[0], z = q[1] + k.off[1];
        r.position.set(x, groundHeight(x, z) + (q[4] || 0) * r.scale.y, z);
        r.visible = true;
        let yaw = q[2] !== null && q[2] !== undefined ? q[2] : speed > 0.2 ? Math.atan2(vx, vz) : r.rotation.y, anim = q[3];
        if (k.local && now < k.local.until && speed < 0.3) { anim = k.local.anim; yaw = Math.atan2(player.pos.x - x, player.pos.z - z); }
        let dy = yaw - r.rotation.y; dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2; r.rotation.y += dy * Math.min(1, dt * (speed > 2 ? 12 : 8));
        k.h.update(dt, now, speed, anim === 'idle' ? null : anim);
      });
      // the ball and the rope
      if (s.ball) { ball.visible = true; ball.position.set(s.ball[0], groundHeight(s.ball[0], s.ball[2]) + s.ball[1], s.ball[2]); } else ball.visible = false;
      if (s.rope) {
        const j = kids[s.rope.who].h; j.handL.getWorldPosition(_a); j.handR.getWorldPosition(_b);
        rope.visible = true; rope.position.copy(_a).add(_b).multiplyScalar(0.5);
        const ax = _b.sub(_a); const w = ax.length(); ax.normalize();
        _q.setFromUnitVectors(_x, ax); rope.quaternion.copy(_q); rope.rotateX(s.rope.ang); rope.scale.set(Math.max(0.5, w / 0.64), 1, 1);
      } else rope.visible = false;
      // what they say: once per line, only when you're near enough to hear
      if (s.line && cd < 24) {
        const L = s.line;
        if (L.who === 2) { kids.forEach((k, i) => { if (k.lastLine !== L.key) { k.lastLine = L.key; ui.say(k.h.root, L.text[i], 1.6, 1.9); } }); }
        else {
          const k = kids[L.who];
          if (k.lastLine !== L.key) {
            k.lastLine = L.key; ui.say(k.h.root, L.text, 2.4, 1.9);
            const p = k.h.root.position; if (cd < 16 && !L.quiet) audio.speak?.(p.x, p.y + 1.2, p.z, L.text, VOICE[k.id]);
            if (L.giggle) audio.play?.('uni-giggle', p.x, p.y + 1.1, p.z);
          }
        }
      }
    },
    target(px, pz) {
      let best = null, bd = 2.6;
      for (const k of kids) { if (!k.h.root.visible) continue; const d = Math.hypot(px - k.h.root.position.x, pz - k.h.root.position.z); if (d < bd) { bd = d; best = k; } }
      if (!best) return null;
      return { hint: `E  Say hi to ${best.name}`, prio: 3, run: () => {
        const now = performance.now() / 1000;
        best.local = { anim: 'wave', until: now + 2.4 };
        const line = HI[Math.floor(hash01('kid-hi', best.id, Math.floor(now / 15)) * HI.length)];
        ui.say(best.h.root, line, 3.2, 1.9); const q = best.h.root.position; audio.speak?.(q.x, q.y + 1.2, q.z, line, VOICE[best.id]);
        player.playEmote?.('wave', now);
      } };
    },
    bodies() { const out = []; for (const k of kids) if (k.h.root.visible) out.push({ x: k.h.root.position.x, z: k.h.root.position.z, r: 0.28 }); return out; },
  };
}
