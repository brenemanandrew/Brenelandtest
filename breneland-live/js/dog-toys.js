// Dax and Nala's toys: the wicker basket on the lawn in front of the house, the toy scenes, and throwing a toy for them.
//
// TOY SCENES are a PURE FUNCTION of the shared clock (hash01 only, no Math.random), so every visitor sees the same dog run
// off with the same toy. Time is cut into 75 s slots, each with at most one scene: Nala plays with a toy on her own, or Dax
// has one until Nala takes it, and then he cowers or they tug of war. npcs.js stateOf() asks toyState(sys, t).
//
// YOUR TOY: grab one from the basket with E, hold E longer for a longer throw, and the dogs race for it. Nala brings it
// back, Dax keeps it (dogs-brain.js). The object is still called `ball` whatever the toy. In your hand it's yours alone.
// Once thrown it's part of the dogs' shared simulation (dogs-sync.js 'toy' and 'pick' events), so everyone sees it.
import * as THREE from 'three';
import { hash01, pointInPoly, alongPolyline, polylineLength, loadCss, el } from './util.js';
import { YARD, HOUSE, PORCH, STEPS, TOY_BASKET, inHouseBox } from './layout.js';
import { groundHeight, coastSigned } from './terrain.js';
import { signTexture } from './areas.js';
import { toon } from './toon.js';
import { GEO } from './batch.js';
import { episodeOf, EP_SLOT } from './dogs-play.js';
import { TUMBLE_DUR } from './dogs.js';

export const TOY_SLOT = 75;
const P_SCENE = 0.55;
const TOYS = ['ball', 'rope', 'duck', 'frisbee', 'bone'];
const TOY_NAME = { ball: 'tennis ball', rope: 'rope tug', duck: 'squeaky duck', frisbee: 'frisbee', bone: 'chew bone' };
const B_STAND = [TOY_BASKET.x + 0.2, TOY_BASKET.z - 1.05];    // on the lawn, nose to the basket
const STEPS_PATH = [[-0.4, -7.05], [-0.4, -9.0]];              // down the porch steps
const LIE_AROUND = 90;                                          // s a dropped toy stays on the lawn

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const onPorch = (x, z) => x > PORCH.minX - 0.9 && x < PORCH.maxX + 0.9 && z > STEPS.minZ - 0.6 && z < HOUSE.minZ + 0.5;

function okLawn(sys, x, z) {
  if (!pointInPoly(x, z, YARD)) return false;
  if (inHouseBox(x, z, 1.5)) return false; // (the house and the garage)
  if (onPorch(x, z)) return false;
  for (const a of sys.areas) if (a.tableR && Math.hypot(x - a.x, z - a.z) < a.tableR + 1.5) return false;
  if (sys.avoidUnicorns && sys.avoidUnicorns(x, z, 8)) return false;
  return coastSigned(x, z) < -3;
}
function lawnSpot(sys, salt, near, rMin, rMax) {
  for (let i = 0; i < 16; i++) {
    const a = hash01('toyspot', salt, i) * 6.283, r = rMin + hash01('toyr', salt, i) * (rMax - rMin);
    const x = near[0] + Math.cos(a) * r, z = near[1] + Math.sin(a) * r;
    if (okLawn(sys, x, z)) return [x, z];
  }
  return null;
}
// the way from a dog's spot to the basket (down the steps first if she was on the porch) and back out to the lawn
const toBasket = (x, z) => (onPorch(x, z) ? [[x, z], STEPS_PATH[0], STEPS_PATH[1], B_STAND] : [[x, z], B_STAND]);
const fromBasket = L => [B_STAND, L];
// how each toy flies when you throw it: launch angle, speed for a tap and for a full wind-up, gravity, bounce, roll
// (the frisbee glides: little gravity while it is up, a flat launch, hardly a bounce)
export const TOY_FLIGHT = {
  ball: { a: 0.55, v0: 6.4, v1: 14.5, g: 16, bounce: 0.58, roll: 0.75 },
  duck: { a: 0.6, v0: 6.0, v1: 13.0, g: 16, bounce: 0.45, roll: 0.55 },
  rope: { a: 0.5, v0: 5.6, v1: 12.5, g: 17, bounce: 0.16, roll: 0.3 },
  frisbee: { a: 0.11, v0: 7.5, v1: 14.5, g: 9.8, bounce: 0.12, roll: 0.3, glide: true, disc: { lift: 0.066, liftMax: 0.8, drag: 0.76, turn: 0.2, fade: 0.55, skip: 2.4, maxSkips: 2 } }, // (a real disc's flight, dogs-brain.js discStep)
  bone: { a: 0.52, v0: 5.8, v1: 12.8, g: 17, bounce: 0.3, roll: 0.35 },
};
export const WIND_UP = 1.1;    // seconds of holding for a full-power throw

// ---------------------------------------------------------------- the scene of slot j

const cache = new Map();
export function toyEpisodeOf(sys, j) {
  if (cache.has(j)) return cache.get(j);
  const ep = build(sys, j);
  cache.set(j, ep);
  if (cache.size > 12) cache.delete(cache.keys().next().value);
  return ep;
}

function build(sys, j) {
  if (hash01('toy', j) > P_SCENE) return null;
  const nala = sys.dog('nala'), dax = sys.dog('dax');
  if (!nala || !dax) return null;
  const ts = j * TOY_SLOT + 3 + hash01('toyts', j) * (TOY_SLOT - 55);
  const SPAN = 58;
  if (sys.dogsAsleep?.(ts) || sys.dogsAsleep?.(ts + SPAN) || sys.mailBusy?.(ts - 2, ts + SPAN)) return null;
  if (sys.dogNap?.(ts) || sys.dogNap?.(ts + SPAN)) return null;   // (nor while either naps)
  // (a scene ends at most ~70 s into its slot, before the next slot can start one)
  for (let k = Math.floor((ts - 45) / EP_SLOT); k <= Math.floor((ts + SPAN) / EP_SLOT); k++) {
    const e = episodeOf(sys, k);
    if (e && e.ts < ts + SPAN && e.ts + e.te > ts - 3) return null;
  }
  const who = hash01('toywho', j) < 0.45 ? 'dax' : 'nala';
  const kind = TOYS[Math.floor(hash01('toykind', j) * TOYS.length)];
  const carrier = who === 'dax' ? dax : nala;
  const S0 = sys.baseState(carrier, ts);
  if (S0.hidden) return null;
  const L = lawnSpot(sys, j, [0, -16], 5, 13);
  if (!L) return null;
  const segs = { nala: [], dax: [] }, lines = [], holder = []; // holder: [u, id | null, x, z]
  const push = (id, s) => { segs[id].push(s); return s.t1; };
  const pathSeg = (id, t0, pts, sp, anim = null) => { if (sys.nav?.skirt) pts = sys.nav.skirt(pts); const len = polylineLength(pts);   // (round the firepit's seats)
    return push(id, { type: 'path', t0, t1: t0 + Math.max(0.3, len / sp), pts, len, anim }); };
  const still = (id, t0, dur, x, z, yaw, anim) => push(id, { type: 'still', t0, t1: t0 + dur, x, z, yaw, anim });
  const home = (id, t0, x, z, dur = 4) => push(id, { type: 'home', t0, t1: t0 + dur, x, z, dog: id });

  let t = 0;
  if (who === 'nala') {
    const v = 6.5, R = 3.2;
    t = pathSeg('nala', t, toBasket(S0.x, S0.z), v);
    lines.push([t, 'nala', 'Toy!!']);
    t = still('nala', t, 1.2, B_STAND[0], B_STAND[1], faceTo(B_STAND[0], B_STAND[1], TOY_BASKET.x, TOY_BASKET.z), 'sniffup');
    holder.push([t, 'nala']);
    const C0 = [L[0] + R, L[1]];
    t = pathSeg('nala', t, fromBasket(C0), v);
    const w = 7 / R * (hash01('toydir', j) < 0.5 ? 1 : -1), dur = 6.5;
    push('nala', { type: 'circle', t0: t, t1: t + dur, c: L, R, th0: 0, w, anim: null }); t += dur;
    const E = [L[0] + Math.cos(w * dur) * R, L[1] + Math.sin(w * dur) * R];
    lines.push([t, 'nala', '*rrrr-shake-shake*']);
    t = still('nala', t, 1.5, E[0], E[1], null, 'shake');
    t = still('nala', t, 6, E[0], E[1], null, 'lie');
    holder.push([t, null, E[0] + 0.5, E[1]]);
    t = still('nala', t, 1, E[0], E[1], null, 'wag');
    t = home('nala', t, E[0], E[1], 3.5);
    return finish({ j, ts, who, kind, segs, lines, holder, L, outcome: 'nala' });
  }
  // Dax gets it... not for long
  const vD = 2.8;
  t = pathSeg('dax', t, toBasket(S0.x, S0.z), vD);
  lines.push([t, 'dax', '*happy wuff*']);
  t = still('dax', t, 1.4, B_STAND[0], B_STAND[1], faceTo(B_STAND[0], B_STAND[1], TOY_BASKET.x, TOY_BASKET.z), 'sniffup');
  holder.push([t, 'dax']);
  t = pathSeg('dax', t, fromBasket(L), 3.1, 'happy');
  const tL = t;
  const tN = tL + 2.5;
  const NS = sys.baseState(nala, ts + tN);
  if (NS.hidden || NS.x == null) return null;
  let dir = [NS.x - L[0], NS.z - L[1]]; const dl = Math.hypot(dir[0], dir[1]) || 1; dir = [dir[0] / dl, dir[1] / dl];
  const I = [L[0] + dir[0] * 0.9, L[1] + dir[1] * 0.9];
  const D1 = [L[0] - dir[0] * 0.9, L[1] - dir[1] * 0.9];
  if (!okLawn(sys, D1[0], D1[1])) return null;
  const faceI = faceTo(L[0], L[1], I[0], I[1]);
  lines.push([tN, 'nala', 'Is that a ' + TOY_NAME[kind] + '?!']);
  let tI = pathSeg('nala', tN, [[NS.x, NS.z], I], 7.2);
  still('dax', tL, tI - tL, L[0], L[1], faceI, 'lie');
  // the slam: Nala hits, Dax tumbles, the toy is hers
  lines.push([tI, 'nala', 'MINE!']);
  still('nala', tI, 0.62, I[0], I[1], faceI + Math.PI, 'slam');
  push('dax', { type: 'slide', t0: tI, t1: tI + TUMBLE_DUR, a: L, b: D1, yaw: faceI, anim: 'tumble' });
  holder.push([tI + 0.3, 'nala']);
  const L2 = lawnSpot(sys, j + 0.5, L, 6, 11) || L;
  const cower = hash01('toyfight', j) < 0.5;
  let outcome = 'nala';
  if (cower) {
    lines.push([tI + TUMBLE_DUR, 'dax', '*whimper*']);
    const tc = still('dax', tI + TUMBLE_DUR, 5, D1[0], D1[1], faceTo(D1[0], D1[1], I[0], I[1]), 'cower');
    home('dax', tc, D1[0], D1[1], 5);
    let tn = still('nala', tI + 0.62, 2, I[0], I[1], faceI + Math.PI, 'shake');
    tn = pathSeg('nala', tn, [I, L2], 5);
    tn = still('nala', tn, 6, L2[0], L2[1], null, 'lie');
    holder.push([tn, null, L2[0] + 0.5, L2[1]]);
    home('nala', tn, L2[0], L2[1], 3.5);
  } else {
    // tug of war: face to face with the toy between them, growling, dust flying
    const tf = tI + TUMBLE_DUR;
    still('nala', tI + 0.62, tf - tI - 0.62, I[0], I[1], faceI + Math.PI, 'bounce');
    const mid = [(I[0] + D1[0]) / 2, (I[1] + D1[1]) / 2];
    const A = [mid[0] + dir[0] * 0.66, mid[1] + dir[1] * 0.66], Bp = [mid[0] - dir[0] * 0.66, mid[1] - dir[1] * 0.66];   // (the muzzles got longer: nose to nose with the toy between)
    lines.push([tf, 'nala', '*grrrRRR*'], [tf + 0.6, 'dax', '*grrr!*'], [tf + 2.8, 'nala', '*RRRRR*']);
    push('nala', { type: 'osc', t0: tf, t1: tf + 4, x: A[0], z: A[1], ax: dir[0], az: dir[1], amp: 0.28, f: 5, yaw: faceTo(A[0], A[1], Bp[0], Bp[1]), anim: 'shake' });
    push('dax', { type: 'osc', t0: tf, t1: tf + 4, x: Bp[0], z: Bp[1], ax: dir[0], az: dir[1], amp: 0.28, f: 5, yaw: faceTo(Bp[0], Bp[1], A[0], A[1]), anim: 'bark' });
    holder.push([tf, 'tug', mid[0], mid[1]]);
    const ts2 = tf + 4;
    still('nala', ts2, 1.3, A[0], A[1], null, 'spin');
    still('dax', ts2, 1.3, Bp[0], Bp[1], null, 'spin');
    const daxWins = hash01('toywin', j) < 0.35;
    outcome = daxWins ? 'dax' : 'nala';
    const W = daxWins ? 'dax' : 'nala', Lo = daxWins ? 'nala' : 'dax', WP = daxWins ? Bp : A, LP = daxWins ? A : Bp;
    holder.push([ts2 + 1.3, W]);
    lines.push([ts2 + 1.4, W, W === 'dax' ? '*victorious wuff!*' : 'Bork! BORK!'], [ts2 + 1.6, Lo, Lo === 'dax' ? '*sigh*' : '*huff*']);
    let tw = pathSeg(W, ts2 + 1.3, [WP, L2], W === 'dax' ? 3.4 : 5);
    tw = still(W, tw, 6, L2[0], L2[1], null, 'lie');
    holder.push([tw, null, L2[0] + 0.5, L2[1]]);
    home(W, tw, L2[0], L2[1], 4);
    const tl = still(Lo, ts2 + 1.3, 1.4, LP[0], LP[1], null, 'shake');
    home(Lo, tl, LP[0], LP[1], 4.5);
  }
  return finish({ j, ts, who, kind, segs, lines, holder, L, outcome, dust: cower ? null : { t0: tI + TUMBLE_DUR, t1: tI + TUMBLE_DUR + 5.3 } });
}
function finish(ep) {
  ep.te = Math.max(...ep.segs.nala.map(s => s.t1), ...ep.segs.dax.map(s => s.t1), 0);
  ep.holder.sort((a, b) => a[0] - b[0]);
  return ep;
}

function segAt(sys, s, u, t) {
  const k = u - s.t0, dur = s.t1 - s.t0;
  switch (s.type) {
    case 'path': {
      const d = Math.min(s.len, (k / dur) * s.len), [x, z, dx, dz] = alongPolyline(s.pts, d);
      const moving = k < dur;
      return { x, z, yaw: Math.atan2(dx, dz), speed: moving ? s.len / dur : 0, anim: moving ? s.anim : 'wag', at: null };
    }
    case 'still': return { x: s.x, z: s.z, yaw: s.yaw ?? null, speed: 0, anim: s.anim, at: k };
    case 'slide': { const q = 1 - (1 - clamp(k / 0.55, 0, 1)) ** 2; return { x: s.a[0] + (s.b[0] - s.a[0]) * q, z: s.a[1] + (s.b[1] - s.a[1]) * q, yaw: s.yaw, speed: 0, anim: s.anim, at: k }; }
    case 'circle': {
      const th = s.th0 + s.w * k, x = s.c[0] + Math.cos(th) * s.R, z = s.c[1] + Math.sin(th) * s.R;
      const vx = -Math.sin(th) * s.w, vz = Math.cos(th) * s.w;
      return { x, z, yaw: Math.atan2(vx, vz), speed: Math.abs(s.w) * s.R, anim: s.anim, at: null };
    }
    case 'osc': { const o = Math.sin(k * s.f) * s.amp; return { x: s.x + s.ax * o, z: s.z + s.az * o, yaw: s.yaw, speed: 0, anim: s.anim, at: k }; }
    case 'home': {
      const base = sys.baseState(sys.dog(s.dog), t), q = ease(k / dur), dx = base.x - s.x, dz = base.z - s.z, moving = k < dur;
      const pts = sys.nav?.skirt ? sys.nav.skirt([[s.x, s.z], [base.x, base.z]]) : null;   // (round the firepit's seats)
      if (pts && pts.length > 2) { const len = polylineLength(pts), [x, z, ex, ez] = alongPolyline(pts, len * q); return { x, z, yaw: moving ? Math.atan2(ex, ez) : base.yaw, speed: moving ? len / dur * 1.4 : 0, anim: moving ? null : base.anim, at: null }; }
      return { x: s.x + dx * q, z: s.z + dz * q, yaw: moving ? Math.atan2(dx, dz) : base.yaw, speed: moving ? Math.hypot(dx, dz) / dur * 1.4 : 0, anim: moving ? null : base.anim, at: null };
    }
  }
  return null;
}
function dogAt(sys, ep, id, u, t) {
  const list = ep.segs[id];
  if (!list.length || u < list[0].t0 || u > list[list.length - 1].t1) return null;
  let s = list[0];
  for (const q of list) if (u >= q.t0) s = q;
  const r = segAt(sys, s, u, t);
  if (r && r.yaw == null) r.yaw = 0;
  return r;
}

// The dogs at shared time t while a toy scene runs, else null. { ep, u, nala: state | null, dax: state | null }
export function toyState(sys, t) {
  const j = Math.floor(t / TOY_SLOT);
  for (const jj of [j, j - 1]) {
    const ep = toyEpisodeOf(sys, jj);
    if (!ep) continue;
    const u = t - ep.ts;
    if (u < 0 || u > ep.te) continue;
    return { ep, u, nala: dogAt(sys, ep, 'nala', u, t), dax: dogAt(sys, ep, 'dax', u, t) };
  }
  return null;
}

// ---------------------------------------------------------------- the feature

function toyMesh(kind) {
  const g = new THREE.Group();
  const m = (geo, col, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, toon(col)); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; g.add(o); return o; };
  const sph = new THREE.SphereGeometry(1, 12, 8), cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
  if (kind === 'ball') { m(sph, '#c8e84a', 0, 0, 0, 0.075, 0.075, 0.075); m(new THREE.TorusGeometry(0.075, 0.008, 4, 16), '#ffffff'); }
  if (kind === 'rope') { m(cyl, '#d9534f', 0, 0, 0, 0.035, 0.34, 0.035).rotation.z = Math.PI / 2; for (const x of [-0.19, 0.19]) m(sph, '#3f8fd9', x, 0, 0, 0.06, 0.06, 0.06); }
  if (kind === 'duck') { m(sph, '#ffd84a', 0, 0, 0, 0.09, 0.07, 0.11); m(sph, '#ffd84a', 0, 0.07, 0.07, 0.055, 0.055, 0.055); m(new THREE.ConeGeometry(1, 1, 6), '#ff8a3a', 0, 0.065, 0.13, 0.025, 0.05, 0.025).rotation.x = Math.PI / 2; }
  if (kind === 'frisbee') { m(cyl, '#e0463c', 0, 0, 0, 0.15, 0.025, 0.15); m(cyl, '#ffffff', 0, 0.014, 0, 0.08, 0.004, 0.08); }
  if (kind === 'bone') { m(cyl, '#f3ead8', 0, 0, 0, 0.03, 0.22, 0.03).rotation.z = Math.PI / 2; for (const x of [-0.12, 0.12]) for (const z of [-0.03, 0.03]) m(sph, '#f3ead8', x, 0, z, 0.04, 0.04, 0.04); }
  g.scale.setScalar(1.7);
  return g;
}

export function createDogToys(ctx) {
  const { scene, npcs, player, colliders, audio } = ctx;
  const sys = npcs;
  const V = new THREE.Vector3(), V2 = new THREE.Vector3();
  // the basket on the lawn by the porch steps
  const bx = TOY_BASKET.x, bz = TOY_BASKET.z, by = groundHeight(TOY_BASKET.x, TOY_BASKET.z);
  const basket = new THREE.Group(); basket.position.set(bx, by, bz);
  const wick = toon('#b8874a'), wickD = toon('#8a6232');
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.36, 16, 1, true), wick); body.position.y = 0.18; body.material.side = THREE.DoubleSide;
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 16), wickD); floor.position.y = 0.02;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 24), wickD); rim.rotation.x = Math.PI / 2; rim.position.y = 0.36;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 6, 20, Math.PI), wickD); handle.position.y = 0.36;
  for (let i = 0; i < 3; i++) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.36 + i * 0.03, 0.012, 4, 24), wickD); band.rotation.x = Math.PI / 2; band.position.y = 0.08 + i * 0.1; basket.add(band); }
  basket.add(body, floor, rim, handle);
  basket.scale.setScalar(1.5);
  basket.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(basket);
  colliders.push({ type: 'circle', x: bx, z: bz, r: 0.68 });
  // a little painted sign on a stick by the basket. The stick stands behind the board, and only the front is painted
  // (a double-sided plane reads backwards from behind)
  const SIGN_YAW = Math.PI * 1.15, snx = Math.sin(SIGN_YAW), snz = Math.cos(SIGN_YAW); // faces the yard
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.02), (() => { const e = toon('#f2c230'); return [e, e, e, e, new THREE.MeshBasicMaterial({ map: signTexture(['DOG TOYS', 'help yourself'], { bg: '#f2c230', fg: '#2b2340', w: 256, h: 120 }), fog: true }), e]; })());
  const sgx = bx + 1.16, sgz = bz + 0.3; // far enough out that the basket's handle doesn't cover the corner
  signBoard.position.set(sgx, by + 0.86, sgz); signBoard.rotation.y = SIGN_YAW; scene.add(signBoard);
  const signPost = new THREE.Mesh(GEO.cyl6, toon('#7a5234')); signPost.scale.set(0.03, 0.98, 0.03); signPost.position.set(sgx - snx * 0.045, by + 0.49, sgz - snz * 0.045); scene.add(signPost);

  // one of each toy; where each sits in the basket
  const toys = {};
  TOYS.forEach((k, i) => {
    const mesh = toyMesh(k);
    const a = (i / TOYS.length) * Math.PI * 2;
    toys[k] = { mesh, home: new THREE.Vector3(bx + Math.cos(a) * 0.3, by + 0.5 + (i % 2) * 0.08, bz + Math.sin(a) * 0.3), tilt: a };
    scene.add(mesh);
  });

  // your toy (local)
  // { x, y, z } and { vx, vy, vz } are the toy's own physics (below): it flies, bounces, rolls, rebounds off the fence,
  // and plops into the lagoon. moving = still rolling or in the air; holder = the dog carrying it. kind = which toy.
  const held = {};   // one mesh per toy kind, built the first time your hand finds it
  const meshFor = kind => { if (!held[kind]) { const m = toyMesh(kind); m.scale.setScalar(kind === 'ball' ? 1.7 * 1.5 : 1.7 * 1.15); m.visible = false; scene.add(m); held[kind] = m; } return held[kind]; };
  const ball = { kind: 'ball', mesh: meshFor('ball'), state: 'basket', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, holder: null, ready: false, flying: false, moving: false, lay: 0, wet: false, lastBounce: 0 };
  ball.mesh.visible = true;
  // the fence, the gates and the house: what a thrown toy bounces off, in the shared simulation (dogs-brain.js ballStep)
  let wallsN = -1;
  const walls = () => {
    if (colliders.length === wallsN) return;
    wallsN = colliders.length;
    sys.brain.walls = colliders.filter(c => c.type === 'box' && (c.fence || c.gate || c.house || c.hedge)).map(c => ({ minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ }));
    // ...and the yard's solid props (the porch swing, the toy basket, the trunks, chairs): a dog's greeting spot steps clear
    // of them. Only fixed ones (no `off` switch: the same on every screen) inside the yard's box.
    sys.brain.props = colliders.filter(c => !c.fence && !c.gate && !c.house && (!c.noCrowd || c.bed) && !('off' in c) && (c.type === 'circle'
      ? c.x > -45 && c.x < 70 && c.z > -42 && c.z < 42 : c.maxX > -45 && c.minX < 70 && c.maxZ > -42 && c.minZ < 42 && (c.maxX - c.minX) * (c.maxZ - c.minZ) < 400))
      .map(c => (c.type === 'circle' ? { x: c.x, z: c.z, r: c.r } : { minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ }));
    // (every fixed small prop on the map; molly-brain.js keeps the ones by Joyce's garden and house, so Molly never sits in a bed)
    sys.brain.fixedProps = colliders.filter(c => !c.fence && !c.gate && !c.house && !c.noCrowd && !('off' in c) && (c.type === 'circle' ? c.r < 3 : (c.maxX - c.minX) * (c.maxZ - c.minZ) < 60));
  };
  walls();
  const sync = sys.dogSync;
  const fl = () => TOY_FLIGHT[ball.kind] || TOY_FLIGHT.ball;
  const ballHome = new THREE.Vector3(bx + 0.05, by + 0.62, bz - 0.05);
  // which toy your hand finds in the basket (local, so Math.random is fine); tests may pin it with api.forceKind
  const api = { forceKind: null, charge: null, lastPower: 0, lastCurve: 0 };
  let tipped = false;
  function setKind(kind) {
    if (ball.kind === kind) return;
    ball.mesh.visible = false;
    ball.kind = kind; ball.mesh = meshFor(kind); ball.mesh.visible = true;
  }
  function takeToy() {
    const kind = api.forceKind || TOYS[Math.floor(Math.random() * TOYS.length)];
    setKind(kind);
    ball.state = 'held'; ball.ready = false;
    audio.play?.('basket', bx, by + 0.5, bz);
    if (kind === 'duck') audio.play?.('squeak', bx, by + 0.4, bz);
    if (!tipped) { tipped = true; const key = ctx.input?.lastDevice === 'touch' ? 'the E button' : ctx.input?.glyph?.('E') || 'E'; ctx.ui.toast(`The ${TOY_NAME[kind]}! Hold ${key} longer to throw it further.`, 3400); }
    else ctx.ui.toast(`You found the ${TOY_NAME[kind]}.`, 1600);
  }

  // a toy put in your hand by something else (the frisbee rack by the field)
  api.take = (kind, say = true) => {
    setKind(kind); ball.state = 'held'; ball.ready = false; api.charge = null; meter.hidden = true;
    audio.play?.('pickup', player.pos.x, player.pos.y + 1, player.pos.z);
    if (say) ctx.ui.toast(kind === 'frisbee' ? (ctx.input?.lastDevice === 'touch' ? 'A frisbee! Hold the E button to throw it further.' : `A frisbee! Hold ${ctx.input?.glyph?.('E') || 'E'} to throw it further, lean left or right as you let go to curve it.`) : `You found the ${TOY_NAME[kind]}.`, 3600);
  };
  // someone else's thrown frisbee near you: catch it out of the air, or pick it up off the grass (it is yours to throw then)
  const nearOther = (px, pz) => {
    let best = null, bd = Infinity;
    for (const key in sync.S.balls) {
      if (key === sync.myKey) continue;
      const B = sync.S.balls[key];
      if (B.kind !== 'frisbee' || B.holder) continue;
      const d = Math.hypot(B.x - px, B.z - pz), up = B.y - groundHeight(B.x, B.z);
      const ok = B.flying ? d < 1.9 && up > 0.15 && up < 2.6 : d < 1.8;
      if (ok && d < bd) { bd = d; best = { key, B }; }
    }
    return best;
  };
  api.nearOther = nearOther;
  api.throwFor = power => { if (ball.state === 'held') throwBall(Math.max(0, Math.min(1, power))); };   // (tests: a throw at this wind-up, 0..1)
  api.catchOther = key => { sync.catchToy(key); api.take('frisbee', false); ctx.ui.toast('Caught it!', 1400); };
  audio.registerSfx?.('squeak', (a, x, y, z) => { const o = a.at(x, y, z, 3); const t = a.ctx.currentTime; a.tone(o, { f: 1400, glide: 2100, t, d: 0.12, peak: 0.08, type: 'triangle' }); a.tone(o, { f: 1900, glide: 1300, t: t + 0.13, d: 0.1, peak: 0.06, type: 'triangle' }); });
  // a throw whooshes longer and higher the harder it goes (opts.power 0..1); each toy lands with its own sound
  audio.registerSfx?.('ballthrow', (a, x, y, z, o = {}) => { const out = a.at(x, y, z, 3), p = o.power ?? 0.35; a.burst(out, { dur: 0.2 + p * 0.25, f: 500 + p * 300, sweep: 2000 + p * 1600, Q: 1, peak: 0.1 + p * 0.06, attack: 0.04 + p * 0.04 }); });
  audio.registerSfx?.('ballbounce', (a, x, y, z, o = {}) => {
    const out = a.at(x, y, z, 4), k = o.kind || 'ball';
    if (k === 'frisbee') { a.tone(out, { f: 520, glide: 380, d: 0.05, peak: 0.07, type: 'triangle' }); a.burst(out, { dur: 0.05, f: 1800, Q: 2, peak: 0.05 }); }
    else if (k === 'rope' || k === 'bone') a.burst(out, { dur: 0.09, type: 'lowpass', f: 600, peak: 0.13, brown: true });
    else a.tone(out, { f: k === 'duck' ? 300 : 220, glide: 120, d: 0.08, peak: 0.12 });
  });
  audio.registerSfx?.('dust', (a, x, y, z) => { const o = a.at(x, y, z, 5); a.burst(o, { dur: 0.35, f: 500, Q: 0.7, peak: 0.12, brown: true }); });

  // little dust puffs for the tug of war
  const puffGeo = new THREE.SphereGeometry(1, 8, 6), puffMat = toon('#d9c9a6', { transparent: true, opacity: 0.8 });
  const puffs = []; for (let i = 0; i < 8; i++) { const p = new THREE.Mesh(puffGeo, puffMat); p.visible = false; scene.add(p); puffs.push(p); }

  const mouth = (id, out) => {
    const d = sys.dog(id); if (!d) return null;
    const jaw = d.body.jawG || d.body.head;
    jaw.updateWorldMatrix(true, false);
    return jaw.localToWorld(out.set(0, -0.02, d.body.mouthZ || 0.13));
  };
  const said = new Set();

  function placeToys(t) {
    // which toy is where, from the scenes of this slot and the last few
    const where = {};
    const j = Math.floor(t / TOY_SLOT);
    for (let jj = j - 3; jj <= j; jj++) {
      const ep = toyEpisodeOf(sys, jj);
      if (!ep) continue;
      const u = t - ep.ts;
      if (u < 0) continue;
      let h = null;
      for (const e of ep.holder) if (u >= e[0]) h = e;
      if (!h) continue;
      if (h[1] === null) { if (u < ep.te + LIE_AROUND) where[ep.kind] = { ground: [h[2], h[3]] }; else delete where[ep.kind]; }
      else if (u <= ep.te) where[ep.kind] = h[1] === 'tug' ? { tug: true } : { dog: h[1] };
      else delete where[ep.kind];
      // the scene's lines, once each, as they happen
      for (const [lu, id, text] of ep.lines) {
        const key = ep.j + ':' + lu;
        if (u >= lu && u < lu + 2 && !said.has(key)) {
          said.add(key); const d = sys.dog(id); if (d) sys.say(d, text, 2.8);
          if (ep.kind === 'duck' && id === ep.who) { const p = d.body.root.position; audio.play?.('squeak', p.x, p.y + 0.5, p.z); }
        }
      }
      if (said.size > 60) said.clear();
      // dust while they fight over it
      if (ep.dust && u >= ep.dust.t0 && u <= ep.dust.t1) {
        const n = sys.dog('nala').body.root.position, x = sys.dog('dax').body.root.position;
        puffs.forEach((p, i) => {
          const ph = (u * 1.7 + i / puffs.length) % 1, a = i * 2.4 + u;
          p.visible = true;
          p.position.set((n.x + x.x) / 2 + Math.cos(a) * (0.4 + ph), 0.2 + ph * 0.7 + groundHeight(n.x, n.z), (n.z + x.z) / 2 + Math.sin(a) * (0.4 + ph));
          p.scale.setScalar(0.18 + ph * 0.3); p.material.opacity = 0.8 * (1 - ph);
        });
        if (Math.floor(u * 2) !== Math.floor((u - 0.05) * 2)) audio.play?.('dust', n.x, 0.5, n.z);
      } else if (ep.dust && u > ep.dust.t1 && u < ep.dust.t1 + 1) puffs.forEach(p => { p.visible = false; });
    }
    for (const k of TOYS) {
      const T = toys[k], w = where[k], m = T.mesh;
      if (!w) { m.position.copy(T.home); m.rotation.set(0.5, T.tilt, 0.3); continue; }
      if (w.dog) { if (mouth(w.dog, V)) { m.position.copy(V); m.rotation.set(0, sys.dog(w.dog).body.root.rotation.y + Math.PI / 2, 0); } continue; }
      if (w.tug) { if (mouth('nala', V) && mouth('dax', V2)) { m.position.copy(V).lerp(V2, 0.5); m.rotation.set(0, Math.atan2(V2.x - V.x, V2.z - V.z) + Math.PI / 2, 0); } continue; }
      m.position.set(w.ground[0], groundHeight(w.ground[0], w.ground[1]) + 0.08, w.ground[1]); m.rotation.set(0, hash01(k) * 6, 0);
    }
  }

  // ---- the wind-up: E (the key, the pad's X, the phone's E button) starts it, letting go throws; longer = further
  loadCss('/css/qol.css');
  const meter = el('div', 'toy-meter', '', { 'aria-hidden': 'true', hidden: '' });
  const fill = el('i', 'toy-meter-fill'), word = el('b', 'toy-meter-word', 'Hold!');
  const bar = el('span', 'toy-meter-bar'); bar.append(fill);
  meter.append(bar, word);
  ctx.hud?.append(meter);
  const eDown = () => !!ctx.input?.down?.has('KeyE');
  function startCharge() {
    if (api.charge) return;
    api.charge = { t: 0, ticks: 0 };
    audio.play?.('toy-windup', player.pos.x, player.pos.y + 1.4, player.pos.z, { k: 0 });
  }
  function release() {
    const c = api.charge; api.charge = null;
    meter.hidden = true;
    if (!c || ball.state !== 'held') return;
    const p = Math.min(1, c.t / WIND_UP);
    throwBall(p * p * (3 - 2 * p));
  }
  function throwBall(power = 0.35) {
    const F = fl(), disc = !!F.disc;
    // a frisbee goes where the camera looks, a little higher when you look up, and curves the way you lean as you let go.
    // Any other toy goes the way you face.
    const aim = disc && Number.isFinite(player.cam?.yaw) ? player.cam.yaw + Math.PI : player.yaw;
    if (disc) player.yaw = aim;
    const yaw = aim, mv = disc ? ctx.input?.move?.() || { x: 0 } : { x: 0 }, cv = disc ? Math.max(-1, Math.min(1, -mv.x)) * 0.9 : 0;
    api.lastCurve = cv;
    player.character.handR?.updateWorldMatrix(true, false);
    const from = new THREE.Vector3();
    if (player.character.handR) player.character.handR.getWorldPosition(from); else from.set(player.pos.x, player.pos.y + 1.4, player.pos.z);
    ball.x = from.x; ball.y = from.y + 0.1; ball.z = from.z;
    const v = F.v0 + (F.v1 - F.v0) * power, a = F.a + (disc && Number.isFinite(player.cam?.pitch) ? Math.max(-0.08, Math.min(0.22, (0.32 - player.cam.pitch) * 0.5)) : 0);
    ball.vx = Math.sin(yaw) * v * Math.cos(a); ball.vz = Math.cos(yaw) * v * Math.cos(a); ball.vy = v * Math.sin(a);
    ball.state = 'loose'; ball.moving = true; ball.flying = true; ball.holder = null; ball.ready = false; ball.wet = false;
    api.lastPower = power;
    player.playEmote?.(power > 0.6 ? 'throw' : 'point', performance.now() / 1000);
    audio.play?.('ballthrow', from.x, from.y, from.z, { power });
    if (power > 0.6) ctx.haptics?.buzz?.('throw');
    const n = sync.throwToy(ball.kind, ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz, cv);   // (on everyone's screen from the next tick)
    if (!n && !pointInPoly(player.pos.x, player.pos.z, YARD)) ctx.ui.toast('The dogs can only fetch inside the yard.', 2600);
  }
  const head = new THREE.Vector3();
  const FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'holder', 'ready', 'flying', 'moving', 'lay', 'wet'];
  const others = new Map();   // key (their sid) -> { kind, mesh }
  // a thrown toy where the simulation has it: in a dog's mouth, or between the last two ticks
  function drawLoose(m, B, dt) {
    if (B.holder && mouth(B.holder, V)) { m.position.copy(V); return; }
    const a = sync.alpha;
    m.position.set(B.px + (B.x - B.px) * a, B.py + (B.y - B.py) * a, B.pz + (B.z - B.pz) * a);
    if (B.moving) {
      if (B.kind === 'frisbee' && B.flying) { const age = B.age || 0, wob = 0.22 * Math.exp(-age * 1.4) + (B.skips ? 0.12 : 0), ph = age * 17; m.rotation.set(wob * Math.sin(ph), m.rotation.y + dt * 14, -(B.cv || 0) * 0.35 + 0.18 * Math.min(1, age / 2.5) + wob * Math.cos(ph)); } // (banked into its curve, the fade, a wobble)
      else { m.rotation.x += B.vz * dt * 6; m.rotation.z -= B.vx * dt * 6; }
    }
  }

  return {
    name: 'dogtoys',
    ball,
    api,
    get kind() { return ball.kind; },
    update(dt, now) {
      const t = ctx.net.serverNow() / 1000;
      sys.playerYaw = player.yaw;
      placeToys(t);
      // the wind-up while E is held
      const c = api.charge;
      if (c) {
        if (ball.state !== 'held') { api.charge = null; meter.hidden = true; }
        else if (!eDown()) release();
        else {
          c.t += dt;
          const p = Math.min(1, c.t / WIND_UP);
          if (Math.floor(c.t / 0.14) > c.ticks && p < 1) { c.ticks = Math.floor(c.t / 0.14); audio.play?.('toy-windup', player.pos.x, player.pos.y + 1.4, player.pos.z, { k: p }); }
          if (c.t > 0.12) {
            head.set(player.pos.x, player.pos.y + 1.25, player.pos.z).project(ctx.camera);
            meter.style.transform = `translate(${((head.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - head.y) / 2 * innerHeight).toFixed(1)}px)`;
            meter.style.setProperty('--p', p.toFixed(3));
            meter.classList.toggle('full', p >= 1);
            word.textContent = p >= 1 ? 'Far!' : p > 0.55 ? 'Further...' : 'Hold!';
            meter.hidden = false;
          }
        }
      }
      // your toy: in the basket or your hand (yours alone), or thrown (the shared simulation's)
      walls();
      const m = ball.mesh, S = sync.S, mine = S.balls[sync.myKey];
      if (ball.state === 'loose') {
        if (mine) {
          for (const f of FIELDS) ball[f] = mine[f];
          drawLoose(m, mine, dt);
        } else if (!sync.pending('toy')) ball.state = 'basket';   // tidied away after two minutes on the grass
        else m.position.set(ball.x, ball.y, ball.z);              // (leaving your hand: on the lawn from the next tick)
      } else if (mine && !sync.pending('pick')) sync.pickToy();   // picked up again (or put back): off the lawn on every screen
      if (ball.state === 'basket') { m.position.copy(ballHome); m.visible = true; }
      else if (ball.state === 'held') {
        const hnd = player.character.handR;
        if (hnd) { hnd.updateWorldMatrix(true, false); hnd.getWorldPosition(m.position); m.position.y -= 0.05; } else m.position.set(player.pos.x, player.pos.y + 1.1, player.pos.z);
        if (c && c.t > 0.12) m.position.y += Math.min(0.25, c.t * 0.3); // drawn up and back as you wind up
      }
      // everyone else's thrown toys
      for (const key in S.balls) {
        if (key === sync.myKey) continue;
        const B = S.balls[key];
        let o = others.get(key);
        if (o && o.kind !== B.kind) { scene.remove(o.mesh); o = null; }
        if (!o) { o = { kind: B.kind, mesh: toyMesh(B.kind) }; o.mesh.scale.setScalar(B.kind === 'ball' ? 1.7 * 1.5 : 1.7 * 1.15); scene.add(o.mesh); others.set(key, o); }
        drawLoose(o.mesh, B, dt);
      }
      for (const [key, o] of others) if (!S.balls[key] || key === sync.myKey) { scene.remove(o.mesh); others.delete(key); }
    },
    target(px, pz) {
      const name = TOY_NAME[ball.kind];
      const other = ball.state !== 'held' ? nearOther(px, pz) : null;   // (playing catch)
      if (other) return other.B.flying ? { hint: 'E  Catch the frisbee!', prio: 8, run: () => api.catchOther(other.key) } : { hint: 'E  Pick up the frisbee', prio: 6, run: () => api.catchOther(other.key) };
      if (ball.state === 'held') return { hint: `E  Throw the ${name}`, prio: 6, run: startCharge };
      // not from up on the porch, where the basket would beat the porch swing's prompt
      if (ball.state === 'basket' && Math.hypot(px - bx, pz - bz) < 2.2 && !(px > PORCH.minX && px < PORCH.maxX && pz > PORCH.minZ && pz < PORCH.maxZ)) return { hint: 'E  Grab a toy from the basket', prio: 5, run: takeToy };
      if (ball.state === 'loose' && !ball.holder && !ball.flying && Math.hypot(px - ball.x, pz - ball.z) < 1.8) return { hint: `E  Pick up the ${name}`, prio: 6, run: () => { ball.state = 'held'; ball.ready = false; audio.play?.('pickup', ball.x, ball.y, ball.z); } };
      return null;
    },
    onKey(code) {
      if (code === 'Escape' && ball.state === 'held') {
        api.charge = null; meter.hidden = true;
        ball.state = 'basket'; audio.play?.('basket', bx, by + 0.5, bz);
        ctx.ui.toast(`The ${TOY_NAME[ball.kind]} is back in the basket.`, 1500); return true;
      }
      return false;
    },
    help: [[['E'], 'grab a toy from the basket in front of the house, then hold E and let go to throw it for the dogs (longer = further)']],
  };
}
