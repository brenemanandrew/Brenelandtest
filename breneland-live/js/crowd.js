// Politeness physics: people, unicorns and dogs never stand inside each other, a player or a solid prop. They slide apart
// gently instead.
//
// Once a frame, after every body is placed, the drawn bodies are pushed apart in a fixed order (pairs, then props, twice).
// Owners ease their NPCs back toward their scheduled spots, so the push is a small offset that fades when the overlap ends.
// The schedules stay pure functions of the clock, and the push is a pure function of the positions (solve(), for tests),
// so two clients push the same way.
//
// Who moves: walking or standing NPCs, plus a feature's people that opt in with root.userData.crowd = { r }. Everyone else
// with a body, players included, is an obstacle that stays put. The dogs stay in the yard unless an escapade lets one out
// (d._escape), and nobody is pushed into the lake.
import { pointInPoly } from './util.js';
import { YARD } from './layout.js';
import { coastSigned, onSurface } from './terrain.js';

const CELL = 6;
const SEATED = new Set(['sit', 'warm']);

// ---- the pure part: bodies [{ x, z, r, w (0 = doesn't move, else how readily it gives way), dog?, keep? }] pushed apart in
// place, `passes` times. keep(b, x, z) may refuse a spot. Two dogs keep `dogMargin` (dogs-brain's), or are left alone when
// it's null. Returns the number of pushes.
export function solve(bodies, passes = 2, margin = 0.95, dogMargin = null) {
  let n = 0;
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      const A = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const B = bodies[j];
        if (!A.w && !B.w) continue;
        const dd = A.dog && B.dog;
        if (dd && dogMargin === null) continue;
        if ((A.dog && B.pl) || (A.pl && B.dog)) continue;   // (a dog keeps clear of the visitors in the shared simulation, dogs-brain.js separate(): never pushed on one screen only)
        const m = dd ? dogMargin : (A.r + B.r) * margin;
        let dx = B.x - A.x, dz = B.z - A.z;
        if (dx > m || dx < -m || dz > m || dz < -m) continue;
        let d = Math.hypot(dx, dz);
        if (d >= m) continue;
        const push = m - d;
        if (d < 1e-4) { dx = 1; dz = 0; d = 1; }   // exactly on one spot: the same way on every client
        const ux = dx / d, uz = dz / d, wa = A.w / (A.w + B.w), wb = 1 - wa;
        const ax = A.x - ux * push * wa, az = A.z - uz * push * wa, bx = B.x + ux * push * wb, bz = B.z + uz * push * wb;
        const okA = !A.w || !A.keep || A.keep(A, ax, az), okB = !B.w || !B.keep || B.keep(B, bx, bz);
        if (okA && okB) { A.x = ax; A.z = az; B.x = bx; B.z = bz; n++; }
        else if (okA && A.w) { const x = A.x - ux * push, z = A.z - uz * push; if (!A.keep || A.keep(A, x, z)) { A.x = x; A.z = z; n++; } }
        else if (okB && B.w) { const x = B.x + ux * push, z = B.z + uz * push; if (!B.keep || B.keep(B, x, z)) { B.x = x; B.z = z; n++; } }
      }
    }
  }
  return n;
}

// out of a prop: the nearest way out of a circle or a box (null when not inside)
function outOf(c, x, z, r) {
  if (c.type === 'circle') {
    const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
    if (d >= m) return null;
    if (d < 1e-4) return [c.x + m, c.z];
    return [c.x + dx / d * m, c.z + dz / d * m];
  }
  if (x < c.minX - r || x > c.maxX + r || z < c.minZ - r || z > c.maxZ + r) return null;
  const l = x - (c.minX - r), rr = (c.maxX + r) - x, t = z - (c.minZ - r), b = (c.maxZ + r) - z, k = Math.min(l, rr, t, b);
  if (k === l) return [c.minX - r, z];
  if (k === rr) return [c.maxX + r, z];
  if (k === t) return [x, c.minZ - r];
  return [x, c.maxZ + r];
}

export function createCrowd(ctx) {
  const { npcs, player, remotes, colliders, ui } = ctx;
  // the props in a grid (rebuilt when colliders are added; the fence, the gates and the house are left out: the paths
  // go through the gates and nobody walks into the house)
  let grid = new Map(), seen = -1;
  const solid = c => !c.fence && !c.gate && !c.house && !c.noCrowd;
  function rebuild() {
    grid = new Map(); seen = colliders.length;
    for (const c of colliders) {
      if (!solid(c)) continue;
      const x0 = c.type === 'circle' ? c.x - c.r : c.minX, x1 = c.type === 'circle' ? c.x + c.r : c.maxX;
      const z0 = c.type === 'circle' ? c.z - c.r : c.minZ, z1 = c.type === 'circle' ? c.z + c.r : c.maxZ;
      if ((x1 - x0) * (z1 - z0) > 400) continue;   // (a giant box is a building wall: the owners route round those)
      for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const k = gx * 4096 + gz; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(c);
      }
    }
  }
  const dry = (x, z) => coastSigned(x, z) < -0.2 || onSurface(x, z);
  const keepDog = (b, x, z) => dry(x, z) && (b.free || pointInPoly(x, z, YARD) || !pointInPoly(b.x, b.z, YARD));
  const keepOne = (b, x, z) => dry(x, z) || !dry(b.x, b.z);

  const bodies = [], pool = [];
  const body = () => pool.pop() || {};
  const stats = { bodies: 0, pushes: 0, props: 0 };
  function gather() {
    for (const b of bodies) pool.push(b);
    bodies.length = 0;
    const npcRoots = new Set();
    for (const d of npcs.npcs) {
      const root = d.body.root;
      npcRoots.add(root);
      if (!root.visible) continue;
      const s = d._s || {};
      // (seated, riding, on an exact round, or a 'fixed' NPC standing at his post: they stay where they are)
      const fixed = !!(s.snap || s.seated || SEATED.has(s.anim) || d.behavior === 'street' || (d.behavior === 'fixed' && !s.speed) || (d.behavior === 'sit' && !s.speed && s.anim === d.seat?.anim));
      const r = d.kind === 'unicorn' ? 0.5 * (d.body.sc || 1) : d.kind === 'dog' ? Math.max(0.36, (d.body.halfLen || 0.45) * 0.9) : 0.34 * (d.look?.scale || 1); // (a person: the shoulders, and the big cartoon heads clear each other)
      const b = body();
      b.x = root.position.x; b.z = root.position.z; b.r = r; b.root = root; b.dog = d.kind === 'dog'; b.free = !!d._escape; b.pl = false;
      b.w = fixed ? 0 : d.kind === 'unicorn' ? 0.5 : d.kind === 'dog' ? 1.4 : 1;
      b.keep = b.dog ? keepDog : keepOne;
      bodies.push(b);
    }
    // a feature's own people (opted in) and everyone else with a name tag (an obstacle)
    const me = player.character.root;
    for (const it of ui.items) {
      const o = it.obj;
      if (!it.tag || !o || o === me || npcRoots.has(o) || !o.visible) continue;
      if (remoteRoots.has(o)) continue;
      const opt = o.userData.crowd;
      const b = body();
      b.x = o.position.x; b.z = o.position.z; b.r = opt?.r || 0.34; b.root = opt ? o : null; b.dog = false; b.free = false; b.pl = false;
      b.w = opt ? 1 : 0; b.keep = keepOne;
      bodies.push(b);
    }
    // the players: everyone gives way to them (you, and the others as this screen draws them)
    { const b = body(); b.x = player.pos.x; b.z = player.pos.z; b.r = 0.3; b.root = null; b.w = 0; b.dog = false; b.pl = true; b.keep = null; bodies.push(b); }
    for (const r of remotes.map.values()) { const p = r.ch.root.position, b = body(); b.x = p.x; b.z = p.z; b.r = 0.3; b.root = null; b.w = 0; b.dog = false; b.pl = true; b.keep = null; bodies.push(b); }
  }
  const remoteRoots = new Set();

  function props() {
    if (colliders.length !== seen) rebuild();
    let n = 0;
    for (const b of bodies) {
      if (!b.w || !b.root) continue;
      const a = grid.get(Math.floor(b.x / CELL) * 4096 + Math.floor(b.z / CELL));
      if (!a) continue;
      for (const c of a) {
        if (c.off) continue;
        const o = outOf(c, b.x, b.z, b.r * 0.8);
        if (o && (!b.keep || b.keep(b, o[0], o[1]))) { b.x = o[0]; b.z = o[1]; n++; }
      }
    }
    return n;
  }

  return {
    update() {
      remoteRoots.clear(); for (const r of remotes.map.values()) remoteRoots.add(r.ch.root);
      gather();
      stats.bodies = bodies.length;
      // (the two dogs keep dogs-brain's margin between them here too, so a push off someone never shoves one into the other)
      const dm = npcs.brain?.sep ? npcs.brain.sep.marginNow : null;
      stats.pushes = solve(bodies, 1, 0.95, dm);
      stats.props = props();
      stats.pushes += solve(bodies, 1, 0.95, dm);
      for (const b of bodies) if (b.w && b.root && (b.root.position.x !== b.x || b.root.position.z !== b.z)) { b.root.position.x = b.x; b.root.position.z = b.z; }
    },
    api: { solve, stats, outOf, get bodies() { return bodies; } },
  };
}
