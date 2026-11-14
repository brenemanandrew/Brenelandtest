// What the dogs do about people, treats, thrown toys and unicorns. The day plan is the shared clock's business. This layer
// moves a dog off the plan by an offset `off`, then eases it back to zero so the dog always rejoins its day.
// Priorities: treat > fetch > poke reaction > unicorn scare > yipe for attention > getting to know you.
// Shared, not local: a fixed-step simulation (dogs-sync.js steps it, k = tick, t = k / TPS) whose only inputs are the
// schedule and relayed events. No Math.random, no frame times, no local player. Choices are hash01 of the tick and the event.
// All state is plain data in `this.S` (snapshots, rollbacks, late joiners). Speech and sounds go out through `this.fx`.
// Only bond (how well your player knows each dog) is per browser, and it travels inside your events.
import { hash01, pointInPoly, wrapAngle, closestOnSeg } from './util.js';
import { YARD as WALK, HOUSE, GARAGE, inHouseBox } from './layout.js'; // the dogs' world is the fenced yard (they cannot open gates)
import { groundHeight, coastSigned, WATER_Y } from './terrain.js';
import { EAT_DUR, YIP_DUR } from './dogs.js';
import { TOY_FLIGHT } from './dog-toys.js';
import { applyWalk, walkStep, townWalkable } from './dogs-walk.js';   // a dog walking round town with a visitor
import { mollyRest, mollyPre, mollyStep, mollyFetch, mollyReact, mollyPost, yardHold, mollyFree, mollyCan, mollyOK, inYard, MOLLY_SPEED } from './molly-brain.js';   // Molly, Joyce's dog

export const TPS = 20, DT = 1 / TPS;   // simulation ticks per second of shared time
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const q5 = v => Math.round(v * 1e5) / 1e5;   // the state is rounded every tick: an engine's last-bit difference in sin/hypot never grows
const HIT = new Set(['slam', 'tumble', 'flop', 'snap']);   // poses where the choreography means the dogs to touch
const YIPE_WAIT = [10, 14, 20];       // pause after the 1st, 2nd, 3rd yipe pair
const YIPE_TRIES = 3;
const ATT_FRESH = 4 * TPS;            // a visitor's whereabouts count this long (they are refreshed every 1.5 s nearby)
const BALL_R = 0.13;
const DOGS = ['nala', 'dax'];                // the yard dogs
const ALL = ['nala', 'dax', 'molly'];        // ...and Molly (molly-brain.js, she lives outside the fence with Joyce)
// ---- naps: the plan (npcs.js) puts a dog to sleep at a nap spot outside its lively hours (`s.nap`). This layer keeps it
// asleep, wakes it for a hello, perks it up for a new arrival and lets it drift back off. Its state is `zz` per dog:
// null (awake, no nap going on) or { ph, t0, stir, ... } with ph one of
//   settle  back at its spot, lying down        sleep  asleep (the plan's pose: curled up or on its side)
//   perk    head up for a new arrival (go: then it gets up to say hi)
//   wake    the get-up (dogs.js 'wake': head up, a stretch front and back, a yawn, a sleepy wag), then the greeting
//   awake   up at nap time; back to sleep AWAKE_S after the last thing that stirred it
export const NAPS = new Set(['sleep', 'sleepside', 'loaf']);
export const WAKE_DUR = 4.8, YAWN_AT = 3.0, PERK_DUR = 2.6;
const AWAKE_S = 45, SETTLE_LIE = 1.4;
const SEEN_FORGET = 300 * TPS;        // a visitor not near the dogs for five minutes arrives anew
const ZZZ = { nala: ['Zzz...', '*snore*', 'Zzz... ball...', '*sleepy grumble*'], dax: ['Zzz...', '*soft snore*', '*dream wuff*'], molly: ['Zzz...', '*old-dog snore*', '*sleepy sigh*'] };
const DAX_QUIET = new Set(['Zzz...', '*soft snore*']);   // (his calm voice is a soft woof: only the dream wuff is heard)

const MOLLY_HI = ['*slow happy wag*', '*soft wuff*', '*leans on your legs*', '*a wise old wag*'];
const BOND_KEY = { dax: 'breneland.bond.dax', nala: 'breneland.bond.nala' };

function walkable(x, z) {
  if (inHouseBox(x, z, 0.5)) return false; // (the house and the garage)
  return pointInPoly(x, z, WALK);
}
export { walkable as dogWalkable };

// ---- getting round the house and the tables instead of through them (treat runs)
const HOUSE_PAD = 0.5, CORNER = 1.4;
function inHouse(x, z) { return inHouseBox(x, z, HOUSE_PAD); } // (the garage too)
function segHitsHouse(x0, z0, x1, z1) {
  for (let i = 1; i < 16; i++) { const t = i / 16; if (inHouse(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return true; }
  return false;
}
// Waypoints from (x0,z0) to (x1,z1), the last one being the goal.
export function routeAround(sys, x0, z0, x1, z1) {
  const pts = [];
  let sx = x0, sz = z0;
  for (let iter = 0; iter < 4; iter++) {
    let wp = null;
    if (segHitsHouse(sx, sz, x1, z1)) {
      const cs = [[GARAGE.minX - CORNER, GARAGE.minZ - CORNER], [HOUSE.maxX + CORNER, HOUSE.minZ - CORNER], [HOUSE.minX - CORNER, GARAGE.minZ - CORNER], // (round the garage's front too)
        [GARAGE.minX - CORNER, HOUSE.maxZ + CORNER], [HOUSE.maxX + CORNER, HOUSE.maxZ + CORNER]];
      let best = Infinity;
      for (const c of cs) {
        if (segHitsHouse(sx, sz, c[0], c[1])) continue;
        const len = Math.hypot(c[0] - sx, c[1] - sz) + Math.hypot(x1 - c[0], z1 - c[1]) + (segHitsHouse(c[0], c[1], x1, z1) ? 60 : 0);
        if (len < best) { best = len; wp = c; }
      }
    } else {
      for (const a of sys.areas) {
        if (!a.tableR) continue;
        const R = a.tableR + 0.9, dx = x1 - sx, dz = z1 - sz, L2 = dx * dx + dz * dz || 1e-6;
        let t = ((a.x - sx) * dx + (a.z - sz) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = sx + dx * t, qz = sz + dz * t, d = Math.hypot(qx - a.x, qz - a.z);
        if (d < R && t > 0.02 && t < 0.98) {
          const k = (R + 0.4) / (d || 1e-3);
          wp = d < 1e-3 ? [a.x - dz / Math.sqrt(L2) * (R + 0.4), a.z + dx / Math.sqrt(L2) * (R + 0.4)] : [a.x + (qx - a.x) * k, a.z + (qz - a.z) * k];
          break;
        }
      }
    }
    if (!wp) break;
    pts.push(wp); sx = wp[0]; sz = wp[1];
  }
  pts.push([x1, z1]);
  return pts;
}

// ---- a greeting spot that is not in the lens
// A dog coming to say hello stops `dist` from you on the side it comes from. If that's within GREET_CONE of the camera
// (on a phone it'd fill the screen), the spot swings to the edge of the cone. cam = { x, z } is that visitor's follow
// camera, from their 'att' event. Pure, so tests can ask it anywhere.
export const GREET_CONE = 0.8; // rad, about 45 degrees either side of the line
// greetSpot's spot, or if a solid prop is there (the porch swing, a trunk, the toy basket) the nearest clear angle round
// the visitor at the same distance.
function clearOf(props, x, z, r) {
  for (const c of props) {
    if (c.r !== undefined) { if (Math.hypot(x - c.x, z - c.z) < c.r + r) return false; }
    else if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return false;
  }
  return true;
}
export function greetClear(P, fromX, fromZ, cam, dist, props, ok = () => true) {
  const fine = (x, z) => ok(x, z) && clearOf(props, x, z, 0.45);
  const s = greetSpot(P, fromX, fromZ, cam, dist, fine);
  if (fine(s.x, s.z)) return s;
  const a0 = Math.atan2(s.x - P.x, s.z - P.z);
  for (let i = 1; i <= 12; i++) for (const sg of [1, -1]) {
    const a = a0 + sg * i * 0.26, x = P.x + Math.sin(a) * dist, z = P.z + Math.cos(a) * dist;
    if (fine(x, z)) return { x, z, moved: true };
  }
  return s;
}
export function greetSpot(P, fromX, fromZ, cam, dist, ok = () => true) {
  let a = Math.atan2(fromX - P.x, fromZ - P.z), moved = false;
  if (cam) {
    const c = Math.atan2(cam.x - P.x, cam.z - P.z), off = wrapAngle(a - c);
    if (Math.abs(off) < GREET_CONE) {
      const side = off >= 0 ? 1 : -1;
      for (const b of [c + side * GREET_CONE, c - side * GREET_CONE]) {
        if (ok(P.x + Math.sin(b) * dist, P.z + Math.cos(b) * dist)) { a = b; moved = true; break; }
      }
    }
  }
  return { x: P.x + Math.sin(a) * dist, z: P.z + Math.cos(a) * dist, moved };
}

const dogRest = () => ({
  off: { x: 0, z: 0 }, react: null, warm: 0, startleAt: -99, sayAt: -99, lastU: null,
  treat: null, fetch: null, queue: [], y: { phase: 'idle', wait: 0, limit: 30, n: 0, pt: 0, next: 10, far: 0, gaveUp: false },
  out: null, prev: null, zz: null, walk: null,   // (walk: walking with a visitor, or on the way home after; dogs-walk.js)
});
// The whole simulation state at rest (every dog on its plan): plain data only (structuredClone / JSON).
export function restState() {
  return { k: 0, dogs: { nala: dogRest(), dax: dogRest(), molly: dogRest() }, treats: [], balls: {}, att: {}, friend: {}, yipeCount: 0,
    sep: { marginNow: 0.6, margin: 0, contactMargin: 0, contact: false }, seen: {}, molly: mollyRest() };   // (seen: sid -> the last tick a visitor was near)
}
// A snapshot from an old tab still open across a deploy may not have Molly: give it her rest state.
export function fixState(S) {
  if (S && S.dogs && !S.dogs.molly) S.dogs.molly = dogRest();
  if (S && !S.molly) S.molly = mollyRest();
  return S;
}

export class DogBrain {
  constructor(sys) {
    this.sys = sys;
    this.bond = { dax: 0, nala: 0 };   // YOUR bond with each dog (this browser); sent along in your events
    try {
      for (const k of ['dax', 'nala']) {
        const v = parseFloat(localStorage.getItem(BOND_KEY[k]));
        if (Number.isFinite(v)) this.bond[k] = clamp(v, 0, 1);
      }
    } catch { /* private window: bonds just last this visit */ }
    this.S = restState();
    this.walls = [];      // the fence, the gates and the house as boxes (dog-toys.js hands them over): toys bounce off them
    this.props = [];      // the yard's fixed solid props (dog-toys.js): greeting spots step clear of them
    this.fx = () => {};   // (kind, ...args): speech, sounds, bond (dogs-sync.js plays each once)
    this.t = 0; this.k = 0;
  }

  addBond(id, amt) {
    if (!(id in this.bond)) return;
    this.bond[id] = clamp(this.bond[id] + amt, 0, 1);
    try { localStorage.setItem(BOND_KEY[id], String(this.bond[id])); } catch { /* ignore */ }
  }

  // (older tools read these)
  state(d) { return this.S.dogs[d.id || d]; }
  get sep() { return this.S.sep; }
  get friendUntil() { return this.S.friend; }
  get treats() { return this.sync ? this.sync.treatViews() : []; }
  say(id, text, secs, silent = false, mood = null) { this.fx('say', id, text, secs, silent, mood); }
  sound(name, x, y, z, opts) { this.fx('sound', name, x, y, z, opts); }

  // Where the dog is in the simulation right now (last tick's result, or the plan's spot).
  posOf(id) {
    const o = this.S.dogs[id].out;
    if (o) return o;
    const d = this.sys.dog(id); if (!d) return null;
    const s = this.sys.stateOf(d, this.t);
    return s.hidden ? null : s;
  }

  // The visitor a dog pays attention to: the nearest one whose whereabouts are fresh (shared 'att' events), or null.
  // { sid, x, z, yaw, v (speed), st (seconds standing still when sent), cx, cz (their camera), bn, bd (their bonds), k }
  visitor(cx, cz) {
    let best = null, bd = Infinity;
    for (const sid in this.S.att) {   // (integer-like keys: the same order in every engine)
      const a = this.S.att[sid];
      if (this.k - a.k > ATT_FRESH) continue;
      const d = Math.hypot(a.x - cx, a.z - cz);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  stillFor(P) { return P && P.v < 0.3 ? P.st + (this.k - P.k) / TPS : 0; }
  bondOf(P, id) { return P ? (id === 'dax' ? P.bd : P.bn) || 0 : 0; }

  trust(id, P, t) {
    const b = this.S.dogs[id];
    let tr = clamp(this.bondOf(P, id) + b.warm * 0.45, 0, 1);
    if (P && (this.S.friend[P.sid] || 0) > t) tr = Math.max(tr, 0.7);
    return tr;
  }

  // ---------------------------------------------------------------- events (dogs-sync.js applies them at their tick)

  // Someone said hi (E). ev = { dog, sid, bn, bd, bf (bond with this dog before the hello) }. Choices: hash of the tick.
  // A napping dog gets up first (napStep: the stretch, the yawn, the wag) and greets them after that.
  poke(ev, t) {
    const id = ev.dog, b = this.S.dogs[id];
    if (!b) return;
    if (this.asleep(b) || (b.zz && b.zz.ph === 'wake')) {
      if (!b.zz || b.zz.ph !== 'wake') b.zz = { ph: 'wake', t0: t, stir: t, greet: null };
      b.zz.greet = { dog: id, sid: ev.sid, bn: ev.bn || 0, bd: ev.bd || 0, bf: ev.bf || 0 };
      return;
    }
    if (b.zz) b.zz.stir = t;
    this.greet(ev, t);
  }
  greet(ev, t) {
    const id = ev.dog, b = this.S.dogs[id];
    const h = (salt) => hash01('poke', salt, id, this.k, ev.sid);
    let anim, line;
    if (id === 'molly') {   // happy to see people, in her calm, dignified way
      anim = h('a') < 0.6 ? 'wag' : 'happy';
      line = MOLLY_HI[Math.floor(h('l') * MOLLY_HI.length)];
      b.react = { anim, until: t + 3, t0: t };
      this.say(id, line, 3.5, false, 'happy');
      return;
    }
    if (id === 'nala') {
      const happy = (ev.bn || 0) > 0.6;
      anim = happy ? 'happy' : h('a') < 0.5 ? 'playbow' : 'bounce';
      line = happy ? (h('l') < 0.5 ? '*wiggle wiggle*' : 'BORK!') : (h('l') < 0.5 ? 'BORK!' : 'Play with me!');
    } else {
      this.S.friend[ev.sid] = t + 90;
      const P = { sid: ev.sid, bn: ev.bn, bd: ev.bd };
      const tr = this.trust(id, P, t);
      if ((ev.bf || 0) < 0.12) { anim = 'sniff'; line = '*sniff sniff* ...okay.'; }
      else if (tr < 0.55) { anim = 'wag'; line = '*tiny happy wag*'; }
      else { anim = 'happy'; line = h('l') < 0.5 ? '*happy wuff!*' : '*wiggle wiggle*'; }
      const y = b.y;
      y.wait = 0; y.n = 0; y.gaveUp = false; y.phase = 'idle'; y.limit = 25 + hash01('yl', ++this.S.yipeCount) * 15; y.far = 0;
    }
    b.react = { anim, until: t + (anim === 'happy' ? 3.6 : 2.6), t0: t };
    this.say(id, line, 3.5);
  }

  // Someone took a dog for a walk or let it go. ev = { dog, on, sid, name, x, z }.
  applyWalk(ev, t) { applyWalk(this, ev, t); }

  // Would a dog go for a treat landing here? (no side effects: fishing.js asks before the event's tick)
  wantsTreat(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (mollyCan(this, x, z) && !this.sleepsThrough('molly', x, z)) return true;   // (Molly, outside the fence)
    if (!walkable(x, z)) return false;
    for (const id of DOGS) {
      if (this.S.dogs[id].walk) continue;   // (out on a walk: not its business)
      const p = this.posOf(id); if (!p) continue;
      if (Math.hypot(p.x - x, p.z - z) > 70) continue;
      if (id === 'dax' && this.nearUnicorn(x, z, 4.5)) continue;
      if (this.sleepsThrough(id, x, z)) continue;
      return true;
    }
    return false;
  }
  // A napping dog only wakes for a treat it can smell (close by) and, Nala only, a toy landing near her.
  sleepsThrough(id, x, z, toy = false) {
    if (!this.asleep(this.S.dogs[id])) return false;
    const p = this.posOf(id);
    if (!p) return true;
    if (inHouseBox(p.x, p.z)) return true;   // (in the big bed indoors, the yard's treats and toys go unnoticed)
    const d = Math.hypot(p.x - x, p.z - z);
    return toy ? id !== 'nala' || d > 14 : d > (id === 'nala' ? 28 : id === 'molly' ? 10 : 12);
  }
  asleep(b) { const z = b && b.zz; return !!z && (z.ph === 'sleep' || z.ph === 'settle' || z.ph === 'perk'); }

  // A treat landed: { id, x, z, by (thrower's name), sid }. The nearest dogs race for it.
  dropTreat(ev, t) {
    const { x, z } = ev;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    const yard = walkable(x, z), molly = mollyCan(this, x, z) && !this.sleepsThrough('molly', x, z);   // (Molly: a treat near her outside the fence)
    if (!yard && !molly) return false;
    // ignore duplicates of the same landing (two relays of one throw)
    for (const tr of this.S.treats) if (tr.id === ev.id || (!tr.gone && Math.hypot(tr.x - x, tr.z - z) < 0.3 && t - tr.born < 1.5)) return false;
    const go = [];
    if (molly) { const p = this.posOf('molly'), dist = Math.hypot(p.x - x, p.z - z); go.push({ id: 'molly', dist, eta: dist / MOLLY_SPEED + 0.3 }); }
    for (const id of yard ? DOGS : []) {
      if (this.S.dogs[id].walk) continue;   // (out on a walk: not its business)
      const p = this.posOf(id); if (!p) continue;
      const dist = Math.hypot(p.x - x, p.z - z);
      if (dist > 70) continue;
      if (id === 'dax' && this.nearUnicorn(x, z, 4.5)) continue;   // too scary, he stays put
      if (this.sleepsThrough(id, x, z)) continue;                    // napping too far off to notice
      go.push({ id, dist, eta: dist / (id === 'nala' ? 6.5 : 4.4) + (id === 'dax' ? 0.35 : 0.1) });
    }
    if (!go.length) return false;
    const best = Math.min(...go.map(g => g.eta));
    const tr = { id: ev.id, x, z, born: t, by: ev.by || '', sid: ev.sid ?? null, gone: false, goneAt: 0, eater: null, fade: 1 };
    let n = 0;
    for (const g of go) {
      if (g.eta > best + 6) continue;   // a far dog stays out of a race it cannot win by much
      const b = this.S.dogs[g.id];
      if (b.treat) b.queue.push(tr.id); else b.treat = { id: tr.id, phase: 'run', pt: 0, route: null, wi: 0, ate: false };
      if (b.y.phase !== 'idle' && b.y.phase !== 'gaveup') b.y.phase = 'idle'; // treats win over yipes
      n++;
    }
    if (!n) return false;
    this.S.treats.push(tr);
    if (this.S.treats.filter(q => !q.gone).length > 6) { const old = this.S.treats.find(q => !q.gone); old.gone = true; old.goneAt = t; }
    return true;
  }
  treatById(id) { for (const tr of this.S.treats) if (tr.id === id) return tr; return null; }

  // ---------------------------------------------------------------- toys (one per visitor, keyed by their sid)

  // A toy left someone's hand: ev = { sid, kind, x, y, z, vx, vy, vz }. Returns how many dogs chase it.
  throwToy(ev, t) {
    const key = String(ev.sid);
    const B = this.S.balls[key] = { key, kind: TOY_FLIGHT[ev.kind] ? ev.kind : 'ball', x: ev.x, y: ev.y, z: ev.z, vx: ev.vx, vy: ev.vy, vz: ev.vz,
      px: ev.x, py: ev.y, pz: ev.z, holder: null, ready: false, flying: true, moving: true, lay: 0, wet: false, cv: Number.isFinite(ev.cv) ? Math.max(-1, Math.min(1, ev.cv)) : 0, age: 0, skips: 0 };   // (cv, age, skips: a frisbee's curve, time up and skips)
    for (const id of ALL) { const f = this.S.dogs[id].fetch; if (f && f.ball === key) this.S.dogs[id].fetch = null; }
    return this.chaseBall(B, t);
  }
  // The thrower picked it up again (or put it back in the basket).
  pickToy(ev) {
    const key = String(ev.sid);
    delete this.S.balls[key];
    for (const id of ALL) { const f = this.S.dogs[id].fetch; if (f && f.ball === key) { f.phase = 'back'; f.pt = 0; f.route = null; } }
  }
  // Someone caught (or picked up) another visitor's thrown toy: it's out of the game like a picked-up one.
  catchToy(ev) { if (ev.from != null && String(ev.from) !== String(ev.sid)) this.pickToy({ sid: ev.from }); }
  kick(B, dx, dz, up = 1.2, sp = 2) { const L = Math.hypot(dx, dz) || 1; B.vx = dx / L * sp; B.vz = dz / L * sp; B.vy = up; B.moving = true; B.ready = false; B.wet = false; }

  ballStep(B, dt) {
    if (B.holder || !B.moving) return;
    const F = TOY_FLIGHT[B.kind] || TOY_FLIGHT.ball;
    if (F.disc && B.flying) this.discStep(B, F, dt);   // (a frisbee flies like a disc: lift, drag, a curve, a fade)
    else {
      // the frisbee floats while it still has speed, then drops like anything else
      const glide = F.glide && B.flying ? Math.min(1, Math.hypot(B.vx, B.vz) / 9) : 0;
      B.vy -= (F.glide ? F.g + (16 - F.g) * (1 - glide) : F.g) * dt;
      if (glide) { const k = Math.pow(0.86, dt); B.vx *= k; B.vz *= k; }
    }
    const nx = B.x + B.vx * dt, nz = B.z + B.vz * dt;
    // the fence, the gates and the house send it back (an open gate too: the same on every screen)
    for (const c of this.walls) {
      if (nx > c.minX - BALL_R && nx < c.maxX + BALL_R && nz > c.minZ - BALL_R && nz < c.maxZ + BALL_R && B.y < 1.6) {
        const dxl = Math.min(Math.abs(nx - c.minX), Math.abs(nx - c.maxX)), dzl = Math.min(Math.abs(nz - c.minZ), Math.abs(nz - c.maxZ));
        if (dxl < dzl) B.vx = -B.vx * 0.6; else B.vz = -B.vz * 0.6;
        this.sound('ballbounce', B.x, B.y, B.z, { kind: B.kind });
        break;
      }
    }
    B.x += B.vx * dt; B.z += B.vz * dt; B.y += B.vy * dt;
    const wet = coastSigned(B.x, B.z) > 0.2;
    const floor = (wet ? WATER_Y : groundHeight(B.x, B.z)) + BALL_R;
    if (B.y <= floor) {
      B.y = floor;
      if (wet) { // plop: it floats and stops
        if (!B.wet) { this.sound('splash', B.x, WATER_Y, B.z, { size: 0.6 }); B.wet = true; }
        B.vx *= 0.7; B.vz *= 0.7; B.vy = 0;
      } else if (F.disc && (B.skips || 0) < F.disc.maxSkips && Math.hypot(B.vx, B.vz) > F.disc.skip && B.vy > -7) {   // a fast flat landing skips
        B.vy = Math.abs(B.vy) * 0.3 + 0.85; B.vx *= 0.66; B.vz *= 0.66; B.skips = (B.skips || 0) + 1;
        this.sound('ballbounce', B.x, B.y, B.z, { kind: B.kind });
      } else if (B.vy < -1.2) {
        B.vy = -B.vy * F.bounce; B.vx *= 0.85; B.vz *= 0.85;
        this.sound('ballbounce', B.x, B.y, B.z, { kind: B.kind });
        if (B.kind === 'duck') this.sound('squeak', B.x, B.y, B.z);
      } else { B.vy = 0; const f = Math.pow(F.roll, dt * 6); B.vx *= f; B.vz *= f; }
    }
    B.flying = B.y > floor + 0.05;
    if (!B.flying && Math.hypot(B.vx, B.vz) < 0.12) { B.vx = B.vz = 0; B.moving = false; B.ready = true; B.lay = 0; }
  }

  // A frisbee in the air: lift grows with the square of its speed, so it floats while fast and drops as it slows. It curves
  // by the throw's cv (-1 right to 1 left) and fades left as it slows, like a backhand. Pure in its state.
  discStep(B, F, dt) {
    const D = F.disc, vh = Math.hypot(B.vx, B.vz) || 1e-6;
    const lift = Math.min(D.liftMax * F.g, D.lift * vh * vh) * (B.skips ? 0.25 : 1);
    B.vy += (lift - F.g) * dt;
    const k = Math.pow(D.drag, dt); B.vx *= k; B.vz *= k; B.vy *= Math.pow(0.85, dt);
    const slow = 1 - Math.min(1, vh / 10), side = ((B.cv || 0) * D.turn + D.fade * slow * slow) * vh;
    const lx = B.vz / vh, lz = -B.vx / vh;   // (the left of the way it travels)
    B.vx += lx * side * dt; B.vz += lz * side * dt;
    B.age = (B.age || 0) + dt;
  }

  // ---------------------------------------------------------------- fetch
  // Nala brings it back to the thrower's feet; Dax chases it, keeps it, trots off a little way and bats it about.
  chaseBall(B, now) {
    let n = 0;
    const mb = this.S.dogs.molly;   // (Molly fetches a toy landing near her outside the fence, at an old dog's pace)
    if (mb && !mb.treat && mollyCan(this, B.x, B.z, 16) && !this.sleepsThrough('molly', B.x, B.z, true)) {
      mb.fetch = { ball: B.key, phase: 'run', pt: 0, route: null, wi: 0, aim: null, bats: 0, spot: null };
      n++;
    }
    if (!walkable(B.x, B.z)) return n;
    for (const id of DOGS) {
      const p = this.posOf(id); if (!p) continue;
      if (Math.hypot(p.x - B.x, p.z - B.z) > 70) continue;
      if (id === 'dax' && this.nearUnicorn(B.x, B.z, 4.5)) continue;
      const b = this.S.dogs[id];
      if (b.treat || b.walk) continue;   // (walk: out with a visitor)
      if (this.sleepsThrough(id, B.x, B.z, true)) continue;
      if (id === 'dax' && hash01('daxcares', Math.floor(now / 5)) < 0.4) { this.say(id, '*watches it go*', 2.2); continue; } // Dax only bothers when he feels like it
      b.fetch = { ball: B.key, phase: 'run', pt: 0, route: null, wi: 0, aim: null, bats: 0, spot: null };
      if (b.y.phase !== 'idle' && b.y.phase !== 'gaveup') b.y.phase = 'idle';
      n++;
    }
    return n;
  }

  fetchStep(id, b, s, dt, now, cx, cz, trust) {
    const f = b.fetch, isDax = id === 'dax', ball = this.S.balls[f.ball];
    const r = { want: null, maxSpd: 5, moveAnim: null, anim: null, yaw: null, look: null, at: null, worry: 0 };
    f.pt += dt;
    const goTo = (x, z, spd) => {
      if (!f.route) { f.route = routeAround(this.sys, cx, cz, x, z); f.wi = 0; }
      const wp = f.route[Math.min(f.wi, f.route.length - 1)], last = f.wi >= f.route.length - 1;
      if (!last && Math.hypot(wp[0] - cx, wp[1] - cz) < 0.9) f.wi++;
      r.want = { x: last ? x : wp[0], z: last ? z : wp[1], soft: last }; r.maxSpd = spd;
    };
    if (!ball && f.phase !== 'back') { f.phase = 'back'; f.pt = 0; f.route = null; }   // picked up again by its thrower
    const myYaw = b.out ? b.out.yaw : s.yaw;
    const dist = ball ? Math.hypot(ball.x - cx, ball.z - cz) : 0;
    // the thrower: Nala brings it back to them (their shared whereabouts, else where they threw it from)
    const thrower = ball ? this.S.att[ball.key] : null;
    const P = thrower && this.k - thrower.k <= ATT_FRESH ? thrower : null;
    switch (f.phase) {
      case 'run': {
        if (ball.holder && ball.holder !== id) { f.phase = 'consol'; f.pt = 0; break; }
        // chase where the ball is going, not where it is; re-aim as it moves; dart about under it while it flies
        const ax = ball.x + ball.vx * 0.35, az = ball.z + ball.vz * 0.35;
        if (!f.aim || Math.hypot(f.aim[0] - ax, f.aim[1] - az) > 1.2) { f.aim = [ax, az]; f.route = null; }
        goTo(f.aim[0], f.aim[1], isDax ? 5.2 : 7);
        r.moveAnim = isDax ? 'lope' : null; r.look = ball;
        if (ball.flying && dist < 2.2) { r.anim = 'bounce'; r.want = { x: cx + (ball.x - cx) * 0.5, z: cz + (ball.z - cz) * 0.5, soft: true }; } // jumps for it
        if (dist < 0.85 && !ball.holder && ball.y - groundHeight(ball.x, ball.z) < 1.3) {
          const sp = Math.hypot(ball.vx, ball.vz);
          if (sp > 2.2 && hash01('fumble', id, Math.floor(now * 4)) < 0.45) { // a fumble: it skips off the nose
            this.kick(ball, ball.x - cx + (hash01('fk', Math.floor(now * 3)) - 0.5), ball.z - cz + (hash01('fz', Math.floor(now * 3)) - 0.5), 1.6, 2.6);
            r.anim = 'startle'; f.route = null; f.aim = null;
            if (!isDax) this.say(id, '*BORK* almost!', 1.6);
          } else { ball.holder = id; ball.ready = false; ball.moving = false; ball.vx = ball.vz = ball.vy = 0; f.phase = 'grab'; f.pt = 0; }
        }
        if (f.pt > 40) { f.phase = 'back'; f.pt = 0; f.route = null; } // gave up
        break;
      }
      case 'grab':
        r.want = { x: cx, z: cz }; r.anim = 'sniff';
        if (f.pt > 0.45) {
          f.pt = 0; f.route = null;
          if (isDax) { // off with it a few metres, then he plays with it by himself
            let best = null;
            for (let i = 0; i < 12 && !best; i++) {
              const a = hash01('daxball', Math.round(ball.x * 7), Math.round(ball.z * 7), i) * 6.283, R = 3 + i * 0.4;
              const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
              if (walkable(x, z) && (!P || Math.hypot(P.x - x, P.z - z) > Math.hypot(P.x - cx, P.z - cz))) best = [x, z];
            }
            f.spot = best || [cx, cz]; f.phase = 'carry';
            this.say(id, '*proud wuff*', 2.5);
          } else { f.phase = 'return'; this.say(id, 'Got it!!', 2); }
        }
        break;
      case 'return': { // Nala: all the way back to the thrower
        if (!P) { f.phase = 'drop'; f.pt = 0; break; }
        const fx = P.x + Math.sin(P.yaw || 0) * 1.1, fz = P.z + Math.cos(P.yaw || 0) * 1.1;
        if (f.pt > 0.8) { f.route = null; f.pt = 0.001; }
        goTo(fx, fz, 7);
        r.look = P;
        if (Math.hypot(P.x - cx, P.z - cz) < 1.6) { f.phase = 'drop'; f.pt = 0; }
        if (f.pt > 25) { f.phase = 'drop'; f.pt = 0; }
        break;
      }
      case 'drop':
        r.want = { x: cx, z: cz }; r.anim = 'wag'; r.look = P;
        if (P) r.yaw = faceTo(cx, cz, P.x, P.z);
        if (f.pt > 0.5 && ball.holder === id) {
          ball.holder = null; ball.ready = true; ball.moving = false; ball.flying = false;   // (caught in the air it was still 'flying': no pick-up prompt)
          const y = r.yaw ?? myYaw;
          ball.x = cx + Math.sin(y) * 0.55; ball.z = cz + Math.cos(y) * 0.55; ball.y = groundHeight(ball.x, ball.z) + BALL_R;
          ball.px = ball.x; ball.py = ball.y; ball.pz = ball.z;
        }
        if (f.pt > 1.8) { f.phase = 'back'; f.pt = 0; f.route = null; }
        break;
      case 'carry': // Dax: trot to his spot with it
        goTo(f.spot[0], f.spot[1], 3.2); r.moveAnim = trust > 0.3 ? 'lope' : null;
        if (Math.hypot(f.spot[0] - cx, f.spot[1] - cz) < 0.6 || f.pt > 10) {
          ball.holder = null; ball.flying = false; ball.x = cx + Math.sin(myYaw) * 0.6; ball.z = cz + Math.cos(myYaw) * 0.6; ball.y = groundHeight(ball.x, ball.z) + BALL_R; ball.moving = false;
          ball.px = ball.x; ball.py = ball.y; ball.pz = ball.z;
          f.phase = 'bat'; f.pt = 0; f.bats = 0; f.route = null;
        }
        break;
      case 'bat': { // Dax bats it with his front paws, chases the roll, bats again, three or four times
        if (ball.holder && ball.holder !== id) { f.phase = 'consol'; f.pt = 0; break; }
        r.look = ball;
        if (ball.moving) { f.aim = null; goTo(ball.x, ball.z, 3.4); r.moveAnim = 'lope'; f.pt = 0; break; }
        if (dist > 1.0) { goTo(ball.x, ball.z, 3.0); break; }
        r.want = { x: cx, z: cz }; r.yaw = faceTo(cx, cz, ball.x, ball.z);
        r.anim = f.pt < 0.55 ? 'playbow' : 'bounce'; r.at = f.pt;
        if (f.pt > 0.9) {
          f.bats++; f.pt = 0; f.route = null;
          const ang = hash01('bat', id, f.bats, Math.floor(now)) * 1.2 - 0.6;
          const dx = Math.sin(r.yaw + ang), dz = Math.cos(r.yaw + ang);
          this.kick(ball, dx, dz, 1.4, 2.4 + hash01('batsp', f.bats, Math.floor(now)) * 2);
          this.sound('ballbounce', ball.x, ball.y, ball.z, { kind: ball.kind });
          if (f.bats === 1) this.say(id, '*bap*', 1.2); else if (f.bats === 3) this.say(id, '*bap bap*', 1.2);
          if (f.bats >= 3 + Math.floor(hash01('nbats', Math.floor(now / 10)) * 2)) { f.phase = 'forget'; f.pt = 0; }
        }
        break;
      }
      case 'forget': // ...and he is done with it: a sniff at nothing much, then off he wanders
        r.want = { x: cx, z: cz }; r.anim = f.pt < 1.2 ? 'sniff' : 'shake';
        if (f.pt > 2.2) { this.say(id, '*wanders off*', 2); f.phase = 'back'; f.pt = 0; f.route = null; }
        break;
      case 'consol':
        r.want = { x: cx, z: cz }; r.anim = isDax ? 'sit' : 'bark'; r.look = ball.holder ? this.posOf(ball.holder) : ball;
        if (f.pt > 1.4) { f.phase = 'back'; f.pt = 0; f.route = null; }
        break;
      case 'back':
        r.maxSpd = isDax ? 3.4 : 6;
        if (!f.route) { f.route = routeAround(this.sys, cx, cz, s.x, s.z); f.wi = 0; }
        if (f.wi < f.route.length - 1) { const wp = f.route[f.wi]; if (Math.hypot(wp[0] - cx, wp[1] - cz) < 0.9) f.wi++; r.want = { x: wp[0], z: wp[1] }; }
        if (Math.hypot(b.off.x, b.off.z) < 0.35) b.fetch = null;
        break;
    }
    return r;
  }

  // ---------------------------------------------------------------- unicorns (from their schedule: the same everywhere)
  nearestUnicorn(x, z) {
    let best = null;
    const sys = this.sys;
    for (const d of sys.npcs) {
      if (d.kind !== 'unicorn') continue;
      const p = sys.stateOf(d, this.t);
      if (p.hidden) continue;
      const dd = Math.hypot(p.x - x, p.z - z);
      if (!best || dd < best.d) best = { d: dd, x: p.x, z: p.z };
    }
    return best;
  }
  nearUnicorn(x, z, r) { const u = this.nearestUnicorn(x, z); return !!u && u.d < r; }

  updateTreats(dt, t) {
    const T = this.S.treats;
    for (let i = T.length - 1; i >= 0; i--) {
      const tr = T[i];
      if (tr.gone) { if (t - tr.goneAt > 5) T.splice(i, 1); continue; }   // (kept a little while: a dog still racing for it sees who ate it)
      if (t - tr.born > 50) { // nobody wanted it
        tr.fade -= dt * 2;
        if (tr.fade <= 0) { tr.gone = true; tr.goneAt = t; }
      }
    }
  }

  // ---------------------------------------------------------------- one tick

  // Everything for tick k (t = k / TPS): the dogs, their spacing, the treats, the toys. dogs-sync.js applies the
  // tick's events first. The result of each dog is S.dogs[id].out = { x, z, yaw, speed, anim, at, lx, lz, worry, ep }.
  tick(k) {
    const S = this.S, sys = this.sys, t = k / TPS;
    this.k = k; this.t = t; S.k = k;
    this.arrivals(k, t);
    const frames = [];
    for (const id of ALL) {
      const d = sys.dog(id), b = S.dogs[id];
      b.prev = b.out;
      if (!d) { b.out = null; continue; }
      const s = sys.stateOf(d, t);
      if (s.hidden) { b.out = null; continue; }
      const r = this.update(id, s, DT, t, !!s.ep);
      frames.push({ id, d, s, r });
    }
    this.separate(frames, DT);
    for (const f of frames) if (f.id === 'molly') mollyPost(this, f); else yardHold(this, f);   // (her fence, her ride in the cart, the swat. Dax and Nala stay inside theirs)
    for (const f of frames) {
      const r = f.r, b = S.dogs[f.id];
      b.out = { x: q5(r.x), z: q5(r.z), yaw: q5(r.yaw), speed: q5(r.speed), anim: r.anim || null, at: r.at == null ? null : q5(r.at),
        lx: r.look ? q5(r.look.x) : null, lz: r.look ? q5(r.look.z) : null, worry: r.worry || 0, ep: !!f.s.ep };
      if (r.y != null) b.out.y = q5(r.y);   // (Molly up on the cart's seat, and her goggles)
      if (r.gog) b.out.gog = 1;
      if (b.walk) { b.walk.x = b.out.x; b.walk.z = b.out.z; b.off.x = b.out.x - f.s.x; b.off.z = b.out.z - f.s.z; }   // (a walking dog's spot is absolute: a push by separate() sticks)
      b.off.x = q5(b.off.x); b.off.z = q5(b.off.z);
    }
    this.updateTreats(DT, t);
    for (const key in S.balls) {
      const B = S.balls[key];
      B.px = B.x; B.py = B.y; B.pz = B.z;
      if (B.holder) {
        const o = S.dogs[B.holder] && S.dogs[B.holder].out;
        if (o) { B.x = o.x + Math.sin(o.yaw) * 0.5; B.z = o.z + Math.cos(o.yaw) * 0.5; B.y = groundHeight(B.x, B.z) + 0.45; }
      } else {
        this.ballStep(B, DT / 2); this.ballStep(B, DT / 2);
        if (!B.moving) B.lay += DT;
        if (B.lay > 120) { this.pickToy({ sid: key }); continue; }   // tidied away (back in the basket)
      }
      for (const f of ['x', 'y', 'z', 'vx', 'vy', 'vz']) B[f] = q5(B[f]);
    }
    for (const sid in S.att) if (k - S.att[sid].k > 3 * ATT_FRESH) delete S.att[sid];
    for (const sid in S.friend) if (S.friend[sid] < t) delete S.friend[sid];
  }

  // ---------------------------------------------------------------- naps

  // Someone new near the dogs (first time, or back after five minutes away): a napping dog lifts its head and looks.
  // Nala often trots over to say hi, Dax only to someone he knows.
  arrivals(k, t) {
    const S = this.S, seen = S.seen || (S.seen = {});
    for (const sid in S.att) {
      const a = S.att[sid];
      if (k - a.k > ATT_FRESH) continue;
      const last = seen[sid];
      seen[sid] = k;
      if (last != null && k - last < SEEN_FORGET) continue;
      for (const id of ALL) {
        const b = S.dogs[id], p = this.posOf(id);
        if (b.walk || !p || Math.hypot(p.x - a.x, p.z - a.z) > 22) continue;   // (a walking dog has company already)
        if (inHouseBox(p.x, p.z) !== inHouseBox(a.x, a.z)) continue;   // (indoors and outdoors don't notice each other)
        if (!this.asleep(b)) {   // up and resting: head up, a look (then the usual: Nala runs over, Dax makes up his mind)
          const o = b.out;
          if (o && !o.ep && o.speed < 0.3 && !b.treat && !b.fetch && !(b.react && t < b.react.until) && !(b.zz && b.zz.ph === 'wake')) b.react = { anim: 'look', until: t + 2.2, t0: t };
          continue;
        }
        if (b.zz.ph === 'perk') continue;
        const h = hash01('perkgo', id, k, a.sid);
        const go = id === 'nala' ? h < 0.7 : id === 'molly' ? h < 0.4 : (a.bd || 0) > 0.35 ? h < 0.55 : h < 0.1;
        b.zz = { ph: 'perk', t0: t, stir: t, sid: a.sid, go };
      }
    }
    for (const sid in seen) if (k - seen[sid] > SEEN_FORGET) delete seen[sid];
  }

  // The nap layer for one dog this tick: a result like the other steps', or null when the dog is simply awake (the
  // usual reactions then apply; at a nap spot they stand in for its plan). Changes b.zz.
  napStep(id, b, s, t, cx, cz, P, dp) {
    let z = b.zz;
    if (!s.nap) {
      if (!z) return null;
      if (z.ph === 'awake') { b.zz = null; return null; }
      if (z.ph !== 'wake') z = b.zz = { ph: 'wake', t0: t, stir: t, greet: null };   // the plan moves on: up it gets
    } else if (!z) z = b.zz = { ph: 'settle', t0: t, stir: t };
    if (z.ph === 'wake' && t - z.t0 >= WAKE_DUR) {
      const g = z.greet;
      z = b.zz = s.nap ? { ph: 'awake', t0: t, stir: t } : null;
      if (g) this.greet(g, t);
      if (!z) return null;
    }
    if (z.ph === 'perk' && t - z.t0 >= PERK_DUR) {
      z = b.zz = z.go ? { ph: 'awake', t0: t, stir: t, hi: z.sid, hiUntil: t + 12 } : { ph: 'sleep', t0: t, stir: t };
    }
    if (z.ph === 'awake') {
      if ((P && dp < 6 && P.v > 0.5) || (b.react && t < b.react.until)) z.stir = t;
      // off to say hi to whoever just arrived (a sleepy trot), a wag when there
      const A = z.hi != null ? this.S.att[z.hi] : null;
      if (A && t < z.hiUntil && this.k - A.k <= ATT_FRESH) {
        const d = Math.hypot(A.x - cx, A.z - cz);
        if (d > 1.9) {
          const cam = Number.isFinite(A.cx) ? { x: A.cx, z: A.cz } : null, spot = greetClear(A, cx, cz, cam, id === 'nala' ? 1.4 : 1.7, this.props, walkable);
          return { want: { x: spot.x, z: spot.z, soft: true }, maxSpd: id === 'nala' ? 3.4 : 2.4, moveAnim: null, anim: null, yaw: null, look: A, at: null, worry: 0 };
        }
        z.hi = null;
        b.react = { anim: id === 'nala' ? 'happy' : 'wag', until: t + 2.6, t0: t };
        this.say(id, id === 'nala' ? '*sleepy wiggle* Hi!' : '*sleepy wag*', 3);
      } else z.hi = null;
      if (t - z.stir < AWAKE_S) return null;
      z = b.zz = { ph: 'settle', t0: t, stir: t };   // nothing going on any more: back to sleep
    }
    const offL = Math.hypot(b.off.x, b.off.z);
    if (z.ph === 'settle') {
      if (offL > 0.3) z.t0 = t;   // (still on the way back to its spot: lying down waits)
      else if (t - z.t0 >= SETTLE_LIE) z = b.zz = { ph: 'sleep', t0: t, stir: t };
    }
    const u = t - z.t0;
    const r = { want: { x: cx, z: cz }, maxSpd: 2.2, moveAnim: null, anim: null, yaw: null, look: null, at: null, worry: 0 };
    switch (z.ph) {
      case 'wake': {
        r.anim = 'wake'; r.at = u;
        const G = z.greet ? this.S.att[z.greet.sid] : null;
        if (G) { r.look = G; if (u > YAWN_AT + 0.6) r.yaw = faceTo(cx, cz, G.x, G.z); }   // (the wag is for you)
        if (u >= YAWN_AT && u - DT < YAWN_AT) this.say(id, '*yaaawn*', 2.2, id === 'dax', 'calm');
        break;
      }
      case 'perk': {
        r.anim = 'perk'; r.at = u; r.yaw = s.yaw;
        const A = this.S.att[z.sid];
        if (A) r.look = A;
        break;
      }
      case 'settle':
        r.want = null; r.maxSpd = 1.6;
        if (offL <= 0.3) { r.anim = 'lie'; r.yaw = s.yaw; }
        break;
      case 'sleep': {
        r.want = null; r.anim = NAPS.has(s.anim) ? s.anim : 'sleep'; r.yaw = s.yaw; r.at = u;
        // a sleepy balloon now and then (once in an 18 s window, at a hashed moment, not every window)
        const W = 18, j = Math.floor(t / W), tt = j * W + 1 + hash01('zzzt', id, j) * (W - 4);
        if (u > 6 && t >= tt && t - DT < tt && hash01('zzz', id, j) < 0.45) {
          const L = ZZZ[id], line = L[Math.floor(hash01('zzzl', id, j) * L.length)];
          this.say(id, line, 2.6, id === 'dax' && DAX_QUIET.has(line), 'calm');
        }
        break;
      }
    }
    return r;
  }

  // One dog, one tick: returns { x, z, yaw, speed, anim, at, look, worry }.
  update(id, s, dt, t, inEpisode) {
    const b = this.S.dogs[id];
    const isDax = id === 'dax', isMolly = id === 'molly', now = t;
    if (isMolly) mollyPre(this, b, s);   // (her plan follows Joyce: a jump of it moves the spot, not Molly)
    // ---- a dog out on a walk, or on its way home after, is the walk's business alone. The offset from the plan is kept
    // up so the usual easing takes over the moment the walk is done.
    if (b.walk) {
      if (!isMolly) mollyFree(this, id, b, t, true);   // (out on a walk: no bout with Molly)
      const r = walkStep(this, id, b, s, dt, t);
      if (r) { b.off.x = r.x - s.x; b.off.z = r.z - s.z; return r; }
    }
    const off = b.off;
    const cx = s.x + off.x, cz = s.z + off.z;             // where the dog is now (before moving)
    const P = this.visitor(cx, cz);
    const dp = P ? Math.hypot(P.x - cx, P.z - cz) : Infinity;
    const trust = this.trust(id, P, now);
    const resting = s.speed < 0.2;

    let want = null;                  // absolute target position, or null = follow the schedule
    let maxSpd = 2.2, moveAnim = null, anim = null, yaw = null, look = null, worryT = 0, at = null;

    // ---- warm-up: Dax gets used to a calm visitor nearby
    if (isDax) {
      const calm = P && dp < 9 && P.v < 1.7;
      b.warm = clamp(b.warm + (calm ? dt / 45 : -dt / 90), 0, 1);
    }

    // ---- naps: a treat or a toy wakes a dog right up, and there's no nap during a play scene (or the mail)
    if (b.zz && b.zz.ph !== 'awake' && (b.treat || (b.fetch && !inEpisode))) b.zz = { ph: 'awake', t0: t, stir: t };
    if (inEpisode) b.zz = null;
    const nap = !b.treat && !b.fetch && !inEpisode ? this.napStep(id, b, s, t, cx, cz, P, dp) : null;
    // (a yard dog courts Molly only with nothing better to do. Nala runs to a visitor in the yard first)
    const molly = !isMolly && mollyFree(this, id, b, t, !!(b.treat || b.fetch || inEpisode || (b.react && now < b.react.until) || (P && dp < (isDax ? 12 : 20))));

    // ---- 1. treats win over everything
    if (b.treat) {
      const r = this.treatStep(id, b, s, dt, now, cx, cz, trust);
      want = r.want; maxSpd = r.maxSpd; moveAnim = r.moveAnim; anim = r.anim; yaw = r.yaw; look = r.look; at = r.at;
      worryT = r.worry || 0;
    } else if (b.fetch && !inEpisode) {
      const r = isMolly ? mollyFetch(this, b, s, dt, now, cx, cz, trust) : this.fetchStep(id, b, s, dt, now, cx, cz, trust);
      want = r.want; maxSpd = r.maxSpd; moveAnim = r.moveAnim; anim = r.anim; yaw = r.yaw; look = r.look; at = r.at;
    } else if (inEpisode) {
      // a fetch waits out the scene: whoever held it drops it, and the chase starts over once the scene is done
      if (b.fetch) {
        const f = b.fetch, ball = this.S.balls[f.ball], held = ball && ball.holder === id;
        if (held) { ball.holder = null; ball.ready = true; ball.flying = false; ball.x = cx; ball.z = cz; ball.px = cx; ball.pz = cz; }
        if (ball && (held || f.phase === 'run' || f.phase === 'grab')) { f.phase = 'run'; f.pt = 0; f.route = null; f.aim = null; }
        else b.fetch = null;                                  // (already on the way back or done with it)
      }
      // the play scene (or barking at the mail carrier) owns the dogs: just ease any leftover offset home
      maxSpd = 5;
      look = s.lookAt || null;
      if (b.y.phase !== 'idle') b.y.phase = 'idle';
    } else if (nap) {
      want = nap.want; maxSpd = nap.maxSpd; moveAnim = nap.moveAnim; anim = nap.anim; yaw = nap.yaw; look = nap.look; at = nap.at;
    } else if (b.react && now < b.react.until) {
      want = { x: cx, z: cz };      // stay put and enjoy the attention
      anim = b.react.anim; at = now - b.react.t0;
      if (P) yaw = faceTo(cx, cz, P.x, P.z);
      look = P;
    } else {
      b.react = null;
      const r = isMolly ? mollyStep(this, b, s, dt, now, cx, cz, P, dp)
        : (molly ? mollyReact(this, id, b, s, dt, now, cx, cz) : null) || (isDax ? this.daxStep(b, s, dt, now, cx, cz, P, dp, trust, resting) : this.nalaStep(b, s, dt, now, cx, cz, P, dp, trust, resting));   // (Molly near the fence)
      want = r.want; maxSpd = r.maxSpd ?? 2.2; moveAnim = r.moveAnim ?? null; anim = r.anim ?? null; yaw = r.yaw ?? null; look = r.look ?? null;
      worryT = r.worry || 0; at = r.at ?? null;
    }

    // ---- move the offset toward what we want
    // (the way there goes round the house, never through it: follow a waypoint when the straight line hits a wall)
    let gx = want ? want.x : s.x, gz = want ? want.z : s.z, soft = !!(want && want.soft);
    if ((want || off.x || off.z) && !inHouse(cx, cz) && segHitsHouse(cx, cz, gx, gz)) {
      const w0 = routeAround(this.sys, cx, cz, gx, gz)[0]; gx = w0[0]; gz = w0[1]; soft = false;
    }
    // ...and round the firepit's ring of seats (npcs.js nav.keepOuts): a line that would cross one aims along its rim
    // instead, a little further round each tick (unless the dog or its goal is inside it)
    const K = this.sys.nav?.keepOuts;
    if (K && K.length && (want || off.x || off.z)) for (const k of K) {
      if (Math.hypot(cx - k.x, cz - k.z) < k.r || Math.hypot(gx - k.x, gz - k.z) < k.r || closestOnSeg(k.x, k.z, cx, cz, gx, gz)[2] >= k.r * k.r) continue;
      const a0 = Math.atan2(cz - k.z, cx - k.x), da = wrapAngle(Math.atan2(gz - k.z, gx - k.x) - a0);
      const a = a0 + Math.sign(da) * Math.min(Math.abs(da), 0.6), R = k.r + 0.6;
      gx = k.x + Math.cos(a) * R; gz = k.z + Math.sin(a) * R; soft = false;
      break;
    }
    if (isMolly && b.treat) maxSpd = Math.min(maxSpd, MOLLY_SPEED);   // (an older dog's pace)
    if (isMolly && !want && Math.hypot(off.x, off.z) > 6) maxSpd = Math.max(maxSpd, MOLLY_SPEED);   // (a long way behind Joyce: she hurries)
    const tx = gx - s.x, tz = gz - s.z;
    const ex = tx - off.x, ez = tz - off.z, el = Math.hypot(ex, ez);
    const slow = soft ? clamp(0.3 + el / 2.2, 0.3, 1) : 1;
    const step = Math.min(el, maxSpd * slow * dt);
    let ovx = 0, ovz = 0;
    if (el > 1e-4 && dt > 0) { off.x += ex / el * step; off.z += ez / el * step; ovx = ex / el * step / dt; ovz = ez / el * step / dt; }
    const fx = s.x + off.x, fz = s.z + off.z;

    // total velocity = the schedule's plus our own; that is what the legs should do
    const svx = s.speed * Math.sin(s.yaw), svz = s.speed * Math.cos(s.yaw);
    const vx = svx + ovx, vz = svz + ovz, vel = Math.hypot(vx, vz);
    const speed = vel > 0.25 ? vel : 0;
    let outYaw = s.yaw;
    if (speed > 0.5) outYaw = Math.atan2(vx, vz);
    else if (yaw !== null) outYaw = yaw;
    // up at a nap spot with nothing in particular to do: lying there awake, not in the plan's sleeping pose
    if (anim == null && NAPS.has(s.anim) && b.zz && b.zz.ph === 'awake') anim = 'lie';
    let outAnim = anim ?? s.anim;
    if (speed > 0.5) outAnim = moveAnim ?? (s.speed > 0.2 ? s.anim : null);
    // the head follows `look`. With nothing in particular, dogs-sync.js has it glance at whoever's near, locally
    return { x: fx, z: fz, yaw: outYaw, speed, anim: outAnim, at, look, worry: worryT };
  }

  // ---------------------------------------------------------------- never the same spot
  // A post-step on this tick's final positions: if Nala and Dax would overlap they're pushed apart, the lighter Dax giving
  // way more. Contact is wanted (slams, tumbles, the tug of war), so the margin shrinks while either is in a hitting pose,
  // easing so nothing pops. The dogs also give way to people, unicorns and visitors. A pure function of shared positions.
  // Nobody is pushed off the lawn.
  separate(frames, dt) {
    const sep = this.S.sep, t = this.t;
    const R = d => d.body.halfLen || 0.34 * (d.body.sc || 1);     // half a body length
    // the people and unicorns first, then the two dogs. The other way round, two dogs pushed off the same person can
    // land on the same spot and stay inside each other
    const people = this.people || (this.people = []);
    people.length = 0;
    if (frames.length) {
      for (const o of this.sys.npcs) {   // (where their schedules put them: the same on every screen, drawn or not)
        if (o.kind === 'dog' || !o.body) continue;
        const p = this.sys.stateOf(o, t);
        if (!p.hidden) people.push(p.x, p.z, o.kind === 'unicorn' ? 0.5 * (o.body.sc || 1) : 0.3);
      }
    }
    for (const f of frames) {
      for (let i = 0; i < people.length; i += 3) {
        if (Math.abs(people[i] - f.r.x) > 3 || Math.abs(people[i + 1] - f.r.z) > 3) continue;
        this.pushOff(f, people[i], people[i + 1], (R(f.d) + people[i + 2]) * 0.85);
      }
      for (const sid in this.S.att) {
        const a = this.S.att[sid];
        if (this.k - a.k <= ATT_FRESH) this.pushOff(f, a.x, a.z, (R(f.d) + 0.3) * 0.85);
      }
    }
    const A = frames.find(f => f.id === 'nala'), B = frames.find(f => f.id === 'dax');   // (the yard pair; Molly has her own: molly-brain.js mollyPost)
    if (A && B) {
      const hit = f => HIT.has(f.r.anim) || HIT.has(f.s.anim);
      const contact = hit(A) || hit(B);
      const full = (R(A.d) + R(B.d)) * 0.85, close = full * 0.55;
      sep.margin = full; sep.contactMargin = close; sep.contact = contact;
      sep.marginNow += ((contact ? close : full) - sep.marginNow) * Math.min(1, dt * (contact ? 10 : 4));
      let dx = B.r.x - A.r.x, dz = B.r.z - A.r.z, d = Math.hypot(dx, dz);
      if (d < sep.marginNow) {
        const push = sep.marginNow - d;               // (before d is replaced below: on the exact spot the push is the whole margin)
        if (d < 1e-4) { dx = 1; dz = 0; d = 1; }   // exactly on top of each other: a fixed direction, the same everywhere
        const ux = dx / d, uz = dz / d;
        const wA = A.id === 'dax' ? 0.65 : 0.35;
        this.nudge(A, B, -ux * push, -uz * push, wA, 1 - wA);
      }
      sep.marginNow = q5(sep.marginNow);
    }
  }
  pushOff(f, x, z, m) {
    let dx = f.r.x - x, dz = f.r.z - z, d = Math.hypot(dx, dz);
    if (d >= m) return;
    const push = m - d;                          // (before d is replaced below: on the exact spot the push is the whole margin)
    if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
    const nx = f.r.x + dx / d * push, nz = f.r.z + dz / d * push;
    if (this.okAt(f, nx, nz)) { f.r.x = nx; f.r.z = nz; }
  }
  // where this dog may be pushed to: the lawn, or (out on a walk) anywhere in town a dog can stand
  okAt(f, x, z) { return this.S.dogs[f.id].walk ? townWalkable(x, z) : f.id === 'molly' ? mollyOK(x, z, inYard(f.r.x, f.r.z)) : walkable(x, z); }
  // The drawn bodies ease toward their spots, so a fast move (a slam's leap) could leave them inside each other for a
  // frame after the spots were pushed apart: hold the drawn pair to the margin as well (a pure function of positions).
  separateDrawn() {
    const sep = this.S.sep, a = this.sys.dog('nala'), b = this.sys.dog('dax');
    if (!sep || !a || !b || !a.body.root.visible || !b.body.root.visible) return;
    const pa = a.body.root.position, pb = b.body.root.position;
    let dx = pb.x - pa.x, dz = pb.z - pa.z, d = Math.hypot(dx, dz);
    const m = sep.marginNow - 0.01;
    if (d >= m) return;
    const push = m - d;
    if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
    const ux = dx / d, uz = dz / d;
    pa.x -= ux * push * 0.35; pa.z -= uz * push * 0.35; pb.x += ux * push * 0.65; pb.z += uz * push * 0.65;
  }
  // A moves by wA of the push, B by wB the other way; what one cannot take (it would leave the lawn) the other takes.
  nudge(A, B, px, pz, wA, wB) {
    const ax = A.r.x + px * wA, az = A.r.z + pz * wA, bx = B.r.x - px * wB, bz = B.r.z - pz * wB;
    // (a dog already off the lawn, at a scheduled spot just past its edge, may still be pushed, or two dogs scheduled
    // onto one such spot would stay inside each other)
    const offA = !this.okAt(A, A.r.x, A.r.z), offB = !this.okAt(B, B.r.x, B.r.z);
    const okA = offA || this.okAt(A, ax, az), okB = offB || this.okAt(B, bx, bz);
    if (okA && okB) { A.r.x = ax; A.r.z = az; B.r.x = bx; B.r.z = bz; return; }
    if (okA && (offA || this.okAt(A, A.r.x + px, A.r.z + pz))) { A.r.x += px; A.r.z += pz; return; }
    if (okB && (offB || this.okAt(B, B.r.x - px, B.r.z - pz))) { B.r.x -= px; B.r.z -= pz; }
  }
  sepInfo() { const s = this.S.sep || {}; return { margin: s.margin || 0, contactMargin: s.contactMargin || 0, marginNow: s.marginNow || 0, contact: !!s.contact }; }

  // ---------------------------------------------------------------- Nala

  nalaStep(b, s, dt, now, cx, cz, P, dp, trust, resting) {
    const r = {};
    if (!resting || !P || dp > 11 || dp < 0.01) return r;
    // she runs over to the nearest visitor, then plays: 1.4 m from them, beside their camera's line rather than on it
    const cam = Number.isFinite(P.cx) ? { x: P.cx, z: P.cz } : null;
    const spot = greetClear(P, cx, cz, cam, 1.4, this.props, walkable);
    const goal = dp < 1.4 && !spot.moved ? { x: cx, z: cz } : spot; // (already close, and not in the lens: stay)
    r.want = { x: goal.x, z: goal.z, soft: true };
    r.maxSpd = 6.5; r.look = P;
    if (dp < 2.4) {
      const bond = P.bn || 0;
      const c = Math.floor(now / 2.5) % 3;
      r.anim = c === 2 ? 'playbow' : bond > 0.6 ? 'happy' : 'bounce';
      r.yaw = faceTo(cx, cz, P.x, P.z);
    }
    return r;
  }

  // ---------------------------------------------------------------- Dax

  daxStep(b, s, dt, now, cx, cz, P, dp, trust, resting) {
    const r = { look: null };
    const id = 'dax';

    // ---- other animals (not Nala): calm retreat, a real startle only when one gets very close
    const u = this.nearestUnicorn(cx, cz);
    const homeUni = this.nearestUnicorn(s.x, s.z);
    if (u && u.d < 6.5) {
      const away = { x: (cx - u.x) / (u.d || 1), z: (cz - u.z) / (u.d || 1) };
      let gx = u.x + away.x * 9, gz = u.z + away.z * 9;
      for (let i = 0; i < 6 && !walkable(gx, gz); i++) { gx = cx + (gx - cx) * 0.5; gz = cz + (gz - cz) * 0.5; }
      r.want = { x: gx, z: gz }; r.maxSpd = 2.1; r.moveAnim = 'tuck'; r.look = u; r.worry = 0.8;
      // a real startle (something suddenly very close): freeze, then cower, then retreat
      const sudden = u.d < 2.6 || (b.lastU !== null && b.lastU - u.d > 0.08 && u.d < 3.8);
      if (sudden && now - b.startleAt > 9) b.startleAt = now;
      b.lastU = q5(u.d);
      const since = now - b.startleAt;
      if (since < 0.35) { r.anim = 'startle'; r.want = { x: cx, z: cz }; r.worry = 1; }
      else if (since < 1.9) { r.anim = 'cower'; r.want = { x: cx, z: cz }; r.worry = 1; }
      if (now - b.sayAt > 14) { b.sayAt = now; this.say(id, '*tail tuck*', 3); }
      return r;
    }
    b.lastU = null;
    if (homeUni && homeUni.d < 8.8 && Math.hypot(b.off.x, b.off.z) > 0.6) { // the coast is not clear at home yet: stay put
      r.want = { x: cx, z: cz }; r.worry = 0.5; r.anim = 'tuck'; r.look = homeUni;
      return r;
    }

    // ---- attention seeking (yipe yipe) needs a friend who is close and quiet
    const y = b.y;
    const wants = trust >= 0.55 && P && dp < 12 && resting;
    if (!P || dp > 16) { y.far += dt; if (y.far > 4 && y.phase !== 'idle') { y.phase = 'idle'; } if (y.far > 8) { y.wait = 0; y.n = 0; y.gaveUp = false; } }
    else y.far = 0;
    if (wants && !y.gaveUp && y.phase === 'idle') y.wait += dt;
    if (y.phase === 'idle' && wants && !y.gaveUp && y.wait >= y.limit) { y.phase = 'go'; y.pt = 0; }
    if (y.phase !== 'idle' && !wants && y.phase !== 'gaveup') { if (!P || dp > 15) y.phase = 'idle'; }
    if (y.phase !== 'idle') {
      y.pt += dt;
      const face = P ? faceTo(cx, cz, P.x, P.z) : s.yaw;
      r.look = P; r.yaw = face;
      switch (y.phase) {
        case 'go': {
          const dir = dp > 0.01 ? { x: (cx - P.x) / dp, z: (cz - P.z) / dp } : { x: 0, z: 1 };
          const cam = Number.isFinite(P.cx) ? { x: P.cx, z: P.cz } : null;
          const spot = greetClear(P, P.x + dir.x, P.z + dir.z, cam, 1.7, this.props, walkable); // (1.7 m off, beside the camera's line, clear of props)
          let gx = spot.x, gz = spot.z;
          if (!walkable(gx, gz)) { gx = P.x - dir.x * 1.7; gz = P.z - dir.z * 1.7; }
          r.want = { x: gx, z: gz, soft: true }; r.maxSpd = 3.2; r.moveAnim = 'lope';
          if (dp < 2.1 || y.pt > 9) { y.phase = 'stare'; y.pt = 0; }
          break;
        }
        case 'stare':
          r.anim = 'sitlook'; r.want = { x: cx, z: cz };
          if (y.pt > 1.3) this.yipe(y, cx, cz);
          break;
        case 'yip':
          r.anim = 'yip'; r.at = y.pt; r.want = { x: cx, z: cz };
          if (y.pt > YIP_DUR) { y.phase = 'wait'; y.pt = 0; }
          break;
        case 'wait':
          r.anim = 'sitlook'; r.want = { x: cx, z: cz };
          if (y.pt > y.next) {
            if (y.n >= YIPE_TRIES) { y.phase = 'gaveup'; y.gaveUp = true; y.pt = 0; this.say(id, '*sigh*', 3, true); }
            else this.yipe(y, cx, cz);
          }
          break;
        case 'gaveup':
          r.anim = 'lie'; r.want = { x: cx, z: cz };
          if (y.pt > 25) y.phase = 'idle';   // sulk over: back to the day's plan (gaveUp stays set, so no more yipes until someone says hi or leaves)
          break;
      }
      return r;
    }

    // ---- getting to know the visitor
    if (!P || !resting) return r;
    const keep = lerp(3.4, 0.95, smooth(0.1, 0.65, trust));
    const reach = lerp(5.5, 14, trust);
    if (dp > reach) return r;
    r.look = P;
    const dir = dp > 0.01 ? { x: (cx - P.x) / dp, z: (cz - P.z) / dp } : { x: 0, z: 1 };
    const goal = { x: P.x + dir.x * keep, z: P.z + dir.z * keep };
    const maxOff = 3 + trust * 11;
    const fromHome = () => {
      const ox = goal.x - s.x, oz = goal.z - s.z, ol = Math.hypot(ox, oz);
      if (ol > maxOff) { goal.x = s.x + ox / ol * maxOff; goal.z = s.z + oz / ol * maxOff; }
      for (let i = 0; i < 6 && !walkable(goal.x, goal.z); i++) { goal.x = cx + (goal.x - cx) * 0.5; goal.z = cz + (goal.z - cz) * 0.5; }
    };
    if (dp < keep - 0.15) { // a bit close for comfort: step back, calmly
      if (P.v > 4.5 && dp < 3.2 && trust < 0.5) { b.startleAt = now; }
      fromHome();
      r.want = { x: goal.x, z: goal.z }; r.maxSpd = 1.7; r.moveAnim = trust < 0.35 ? 'tuck' : null;
      r.worry = trust < 0.3 ? 0.5 : 0;
      if (now - b.startleAt < 1.1 && Math.hypot(b.off.x, b.off.z) < 0.4) { r.anim = 'startle'; r.worry = 1; r.want = { x: cx, z: cz }; }
      r.yaw = faceTo(cx, cz, P.x, P.z);
    } else if (dp > keep + 0.7 && trust > 0.32) { // curious: come a little closer; a friend comes running
      fromHome();
      r.want = { x: goal.x, z: goal.z, soft: true }; r.maxSpd = 1.3 + trust * 2.6; r.moveAnim = trust > 0.6 ? 'lope' : null;
    } else {
      r.want = { x: cx, z: cz };
      r.yaw = faceTo(cx, cz, P.x, P.z);
      if (trust > 0.75 && this.stillFor(P) > 3) r.anim = 'rest';          // lies at your feet when you stop
      else if (trust > 0.55) r.anim = dp < 3 ? 'wag' : 'sitlook';
      else if (trust > 0.3) r.anim = dp < keep + 0.5 ? 'sniff' : 'wag';
      else r.anim = 'look';
    }
    return r;
  }

  yipe(y, x, z) {
    y.phase = 'yip'; y.pt = 0; y.n++;
    y.next = YIPE_WAIT[Math.min(y.n - 1, YIPE_WAIT.length - 1)] + hash01('yn', this.S.yipeCount, y.n) * 3;
    this.say('dax', 'Yipe! Yipe!', 2.6, true);
    this.sound('yipe', x, groundHeight(x, z) + 0.7, z);
  }

  // ---------------------------------------------------------------- treat routine

  treatStep(id, b, s, dt, now, cx, cz, trust) {
    const tt = b.treat, isDax = id === 'dax';
    const tr = this.treatById(tt.id) || { x: cx, z: cz, gone: true, eater: null };
    const r = { want: null, maxSpd: 5, moveAnim: null, anim: null, yaw: null, look: null, at: null, worry: 0 };
    const dist = Math.hypot(tr.x - cx, tr.z - cz);
    tt.pt += dt;
    const ta = tr.sid != null ? this.S.att[tr.sid] : null;
    const thrower = ta && this.k - ta.k <= ATT_FRESH ? ta : this.visitor(cx, cz);
    const nextTreat = () => { for (const q of b.queue) { const n = this.treatById(q); if (n && !n.gone && !n.eater) return n; } return null; };
    switch (tt.phase) {
      case 'run': {
        if (tr.gone && !tr.eater) { tt.phase = 'back'; tt.pt = 0; tt.route = null; break; }
        if (!tt.route) { tt.route = routeAround(this.sys, cx, cz, tr.x, tr.z); tt.wi = 0; }
        const wp = tt.route[tt.wi], lastWp = tt.wi === tt.route.length - 1;
        if (!lastWp && Math.hypot(wp[0] - cx, wp[1] - cz) < 0.9) tt.wi++;
        r.want = { x: wp[0], z: wp[1], soft: lastWp };
        r.maxSpd = isDax ? (trust > 0.3 ? 5.0 : trust > 0.12 ? 4.2 : 3.2) : 6.6;
        r.moveAnim = isDax && trust > 0.3 ? 'lope' : null;
        r.look = tr; r.worry = isDax && trust < 0.12 ? 0.4 : 0;
        if (dist < 0.6) {
          if (!tr.eater && !tr.gone) { tr.eater = id; tt.phase = 'sniff'; }
          else tt.phase = 'consol';
          tt.pt = 0;
        }
        break;
      }
      case 'sniff':
        r.want = { x: cx, z: cz }; r.anim = 'sniff'; r.yaw = faceTo(cx, cz, tr.x, tr.z);
        if (tt.pt > 0.4) { tt.phase = 'eat'; tt.pt = 0; tt.ate = false; }
        break;
      case 'eat':
        r.want = { x: cx, z: cz }; r.anim = 'eat'; r.at = tt.pt; r.yaw = faceTo(cx, cz, tr.x, tr.z);
        if (!tt.ate && tt.pt > 0.12) {
          tt.ate = true;
          tr.gone = true; tr.goneAt = now;
          this.sound('crunch', cx, groundHeight(cx, cz) + 0.15, cz);
          this.fx('ate', id, tr.sid, isDax ? 0.06 : 0.03, tr.x, tr.z);   // (the thrower's own bond grows: dogs-sync.js)
        }
        if (tt.pt > EAT_DUR) { tt.phase = 'happy'; tt.pt = 0; }
        break;
      case 'happy':
        r.want = { x: cx, z: cz }; r.anim = 'happy'; r.at = tt.pt; r.look = thrower;
        if (thrower) r.yaw = faceTo(cx, cz, thrower.x, thrower.z);
        if (tt.pt > 1.1) {
          const next = nextTreat();
          b.queue.length = 0;
          if (next && Math.hypot(next.x - cx, next.z - cz) < 45) { b.treat = { id: next.id, phase: 'run', pt: 0, route: null, wi: 0, ate: false }; return r; }
          tt.phase = 'look'; tt.pt = 0;
          this.say(id, isDax ? '*happy wuff!*' : ['BORK!', '*happy yip*', 'More? MORE?'][Math.floor(hash01('tl', Math.floor(now)) * 3)], 3.2);
        }
        break;
      case 'look':
        r.want = { x: cx, z: cz }; r.anim = 'wag'; r.look = thrower;
        if (thrower) r.yaw = faceTo(cx, cz, thrower.x, thrower.z);
        if (tt.pt > 1.6) { tt.phase = 'back'; tt.pt = 0; tt.route = null; }
        break;
      case 'consol': // lost the race: a sniff of the empty spot and a small sigh
        r.want = { x: cx, z: cz }; r.anim = 'sniff'; r.worry = 0.5; r.yaw = faceTo(cx, cz, tr.x, tr.z);
        if (tt.pt > 1.3) { tt.phase = 'back'; tt.pt = 0; tt.route = null; if (!isDax) this.say(id, '*sniff sniff*', 2.5); }
        break;
      case 'back': {
        const next = nextTreat();
        b.queue.length = 0;
        if (next) { b.treat = { id: next.id, phase: 'run', pt: 0, route: null, wi: 0, ate: false }; return r; } // a new treat: off again
        r.maxSpd = isDax ? 3.4 : 6; r.moveAnim = isDax && trust > 0.3 ? 'lope' : null;
        if (!tt.route) { tt.route = routeAround(this.sys, cx, cz, s.x, s.z); tt.wi = 0; }
        const wp = tt.route[tt.wi], lastWp = tt.wi >= tt.route.length - 1;
        if (!lastWp) { // round the house first, then straight back to wherever the day has put them
          if (Math.hypot(wp[0] - cx, wp[1] - cz) < 0.9) tt.wi++;
          r.want = { x: wp[0], z: wp[1] };
        } else r.want = null;
        if (Math.hypot(b.off.x, b.off.z) < 0.35) { b.treat = null; }
        break;
      }
    }
    return r;
  }
}
