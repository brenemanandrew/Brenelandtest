// Molly in the dogs' shared simulation. Joyce's older dog is the third dog of dogs-brain.js, with the same rules as Dax and Nala:
// a fixed-step simulation on the shared clock, fed only by her plan (molly-day.js, a pure function of the clock) and the
// server-relayed events. No Math.random, no frame times, no drawn positions, no local player, and choices are hash01 of the tick,
// so every screen and every late joiner sees the same Molly. Her state lives in S.dogs.molly (treats, toys, hellos, naps and walks
// use dogs-brain.js's own steps, as theirs do) and in S.molly:
//   mf     a visit to a player named Whitney or Shy... ({ sid, t0, until, at }): she leaves Joyce for a while to sit by them
//   cool   sid -> the time she may visit them again
//   kv     a visit to Kevin ({ t0, until, at }): she likes him; out and about in town within her reach, she trots over for a
//          pat (kevinAt: his pure state, set on the brain by tool-crib.js), then back to Joyce. kcool: not again before
//   ps     her plan's spot last tick (a jump of the plan, Joyce getting into the cart, keeps her where she is: she walks over)
//   fv     a visit to the yard fence to see Dax and Nala ({ ph, t0, x, z })
//   dd     per yard dog: its bout of trying to get her attention ({ on, t0, until, cool, hit, said })
//   irk    how many times Nala pounced at her. At three she swats (swat: { t0 }), and Nala is calm until after her next nap
//   calm, calmNap   (Nala's calm, and whether that nap has begun)
// The yard dogs never leave their fence for her. Molly never goes into the yard unless someone walks her in (walk with me).
import { hash01, pointInPoly, closestOnSeg } from './util.js';
import { YARD } from './layout.js';
import { townWalkable } from './dogs-walk.js';
import { greetClear, dogWalkable } from './dogs-brain.js';
import { SEAT_Y, joyceSpots } from './molly-day.js';
import { SWAT_DUR } from './dogs.js';

const TPS = 20, DT = 1 / TPS, ATT_FRESH = 4 * TPS;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const q5 = v => Math.round(v * 1e5) / 1e5;
export const MOLLY_SPEED = 4.2;          // m/s: an older dog's best run (treats, toys, catching up)
export const FRIEND_REACH = 25;          // m: a Whitney / Shy... this close draws her over
export const SWAT_AT = 3;                // Nala's pounces before Molly has had enough
const BOUT_NEAR = 14, BOUT_FAR = 18;     // Molly this close to the fence starts a yard dog's bout; this far ends it

export const inYard = (x, z) => pointInPoly(x, z, YARD);
// The names that draw Molly over: players named Whitney or whose name starts with Shy, any case. The server stamps `mf` on such
// a player's whereabouts (lib/dogs.js), and this client stamps its own the same way (dogs-sync.js).
export function mollyFriend(name) {
  const n = String(name || '').trim().toLowerCase();
  return n.startsWith('shy') || n.split(/\s+/)[0] === 'whitney';
}
export function mollyRest() {
  return { mf: null, cool: {}, kv: null, kcool: 0, ps: null, fv: null, fvCool: 0, irk: 0, swat: null, calm: false, calmNap: false,
    dd: { nala: { on: false, t0: 0, until: 0, cool: 0, hit: -1, said: false, ease: 0 }, dax: { on: false, t0: 0, until: 0, cool: 0, hit: -1, said: false, ease: 0 } } };
}
// Where Molly may stand when nobody walks her: anywhere a dog can in town, but not inside the yard (unless she is in it already)
export function mollyOK(x, z, already = false) { return townWalkable(x, z) && (already || !inYard(x, z)); }

// The yard fence seen from (x, z): the nearest point on it, a spot just inside it (for Dax and Nala) and just outside (for
// Molly), the distance, and the fence's direction there.
export function fenceGap(x, z) {
  let best = null;
  for (let i = 0, j = YARD.length - 1; i < YARD.length; j = i++) {
    const [ax, az] = YARD[j], [bx, bz] = YARD[i], c = closestOnSeg(x, z, ax, az, bx, bz);
    if (!best || c[2] < best.d2) best = { x: c[0], z: c[1], d2: c[2], tx: bx - ax, tz: bz - az };
  }
  const inside = inYard(x, z), d = Math.sqrt(best.d2), tl = Math.hypot(best.tx, best.tz) || 1;
  const tx = best.tx / tl, tz = best.tz / tl;
  // the way into the yard across the fence there: toward the point if it is inside, else away from it (or the edge's normal)
  let nx, nz;
  if (d > 0.05) { nx = (x - best.x) / d * (inside ? 1 : -1); nz = (z - best.z) / d * (inside ? 1 : -1); }
  else { nx = -tz; nz = tx; if (!inYard(best.x + nx * 0.5, best.z + nz * 0.5)) { nx = -nx; nz = -nz; } }
  const fi = { x: best.x + nx * 0.9, z: best.z + nz * 0.9 }, fo = { x: best.x - nx * 0.75, z: best.z - nz * 0.75 };
  return { x: best.x, z: best.z, d, inside, tx, tz, nx, nz, fi, fo };
}

// ---------------------------------------------------------------- the plan (called by dogs-brain.js update() before anything)
// A jump of her plan (Joyce stepping out of the cart, the cart setting off from the garden) moves the spot, not Molly: she
// keeps her place and walks over to it.
export function mollyPre(B, b, s) {
  const M = B.S.molly;
  if (M.ps && Math.hypot(s.x - M.ps.x, s.z - M.ps.z) > 1.0 && !b.walk) { b.off.x = q5(b.off.x - (s.x - M.ps.x)); b.off.z = q5(b.off.z - (s.z - M.ps.z)); }
  M.ps = { x: q5(s.x), z: q5(s.z) };
}

// Would Molly go for a treat or a toy landing at (x, z)? Not from the cart's seat, not on a walk, not across the fence.
export function mollyCan(B, x, z, r = 14) {
  const b = B.S.dogs.molly;
  if (!b || b.walk) return false;
  const p = B.posOf('molly');
  if (!p || p.ride || (b.out && b.out.gog)) return false;
  if (!townWalkable(x, z) || inYard(x, z) !== inYard(p.x, p.z)) return false;
  return Math.hypot(p.x - x, p.z - z) <= r;
}

// ---------------------------------------------------------------- her own step (when no treat, toy, nap or hello has her)
export function mollyStep(B, b, s, dt, t, cx, cz, P, dp) {
  const M = B.S.molly, r = {};
  const offL = Math.hypot(b.off.x, b.off.z);
  if (s.ride && offL < 3 && !M.mf) { if (M.fv) { M.fv = null; M.fvCool = q5(t + 45); } r.maxSpd = 7; return r; }   // into the cart: nothing beats a ride with Joyce
  // ---- a Whitney or a Shy...: over to them for a while, then back to Joyce
  if (M.mf) {
    const A = B.S.att[M.mf.sid];
    const gone = !A || B.k - A.k > ATT_FRESH || Math.hypot(A.x - cx, A.z - cz) > FRIEND_REACH + 12;
    if (gone || t > M.mf.until) {
      M.cool[M.mf.sid] = q5(t + 150 + hash01('molly-cool', M.mf.sid, B.k) * 120);
      M.mf = null;
      B.say('molly', '*ambles back to Joyce*', 2.6, true);
    } else {
      const cam = Number.isFinite(A.cx) ? { x: A.cx, z: A.cz } : null, here = inYard(cx, cz);
      const spot = greetClear(A, cx, cz, cam, 1.9, B.props, (x, z) => mollyOK(x, z, here));
      const d = Math.hypot(A.x - cx, A.z - cz);
      r.look = A;
      if (d > 2.7 || (spot.moved && Math.hypot(spot.x - cx, spot.z - cz) > 0.6)) {
        r.want = { x: spot.x, z: spot.z, soft: true }; r.maxSpd = d > 7 ? 3.4 : 2.2; M.mf.at = null;
      } else {
        r.want = { x: cx, z: cz }; r.yaw = faceTo(cx, cz, A.x, A.z);
        if (M.mf.at == null) M.mf.at = q5(t);
        const u = t - M.mf.at;
        r.anim = u < 2.5 ? 'wag' : B.stillFor(A) > 12 && u > 14 ? 'lie' : 'sit';
      }
      return r;
    }
  }
  if (!s.ride && !s.nap) for (const sid in B.S.att) {
    const a = B.S.att[sid];
    if (!a.mf || B.k - a.k > ATT_FRESH || (M.cool[sid] || 0) > t) continue;
    if (Math.hypot(a.x - cx, a.z - cz) > FRIEND_REACH) continue;
    M.mf = { sid: a.sid, t0: q5(t), until: q5(t + 75 + hash01('molly-mf', sid, B.k) * 60), at: null };
    B.say('molly', '*perks up and trots over*', 2.8, false, 'happy');
    return mollyStep(B, b, s, dt, t, cx, cz, P, dp);
  }
  for (const sid in M.cool) if (M.cool[sid] < t) delete M.cool[sid];
  // ---- Kevin (she likes him): out and about in town within her reach, over to him for a pat, then back to Joyce
  const K = B.kevinAt ? B.kevinAt(t) : null, here = inYard(cx, cz);
  if (M.kv) {
    if (!K || t > M.kv.until || Math.hypot(K.x - cx, K.z - cz) > FRIEND_REACH + 12) {
      M.kv = null; M.kcool = q5(t + 600 + hash01('molly-kc', B.k) * 600);
      B.say('molly', '*ambles back to Joyce*', 2.6, true);
    } else {
      let sx = K.x + Math.sin(K.yaw) * 0.85 + Math.cos(K.yaw) * 0.35, sz = K.z + Math.cos(K.yaw) * 0.85 - Math.sin(K.yaw) * 0.35; // (in front of him, a little to his right)
      if (!mollyOK(sx, sz, here)) { sx = K.x - Math.cos(K.yaw) * 0.9; sz = K.z + Math.sin(K.yaw) * 0.9; }
      const d = Math.hypot(sx - cx, sz - cz);
      r.look = K;
      if (d > 0.45) { r.want = { x: q5(sx), z: q5(sz), soft: true }; r.maxSpd = d > 6 ? 3.4 : 2.2; if (d > 1.2) M.kv.at = null; }
      else {
        r.want = { x: cx, z: cz }; r.yaw = faceTo(cx, cz, K.x, K.z);
        if (M.kv.at == null) M.kv.at = q5(t);
        r.anim = t - M.kv.at < 4 ? 'wag' : 'sit';
      }
      return r;
    }
  } else if (K && !s.ride && !s.nap && t >= (M.kcool || 0) && mollyOK(K.x, K.z, here) && Math.hypot(K.x - cx, K.z - cz) < FRIEND_REACH) {
    M.kv = { t0: q5(t), until: q5(t + 50 + hash01('molly-kv', B.k) * 40), at: null };
    B.say('molly', '*spots Kevin and trots over*', 2.8, false, 'happy');
    return mollyStep(B, b, s, dt, t, cx, cz, P, dp);
  }
  // ---- Dax and Nala calling her from the yard: now and then she goes over to the fence to see them (and to have a word
  // with Nala, if Nala has been pouncing)
  const dd = M.dd, bout = dd.nala.on || dd.dax.on;
  if (M.fv) {
    const u = t - M.fv.t0;
    if (M.fv.ph === 'go') {
      r.want = { x: M.fv.x, z: M.fv.z, soft: true }; r.maxSpd = 2.4;
      if (Math.hypot(M.fv.x - cx, M.fv.z - cz) < 0.4) { M.fv.ph = 'at'; M.fv.t0 = q5(t); }
      else if (u > 20) M.fv.ph = 'back';
    } else if (M.fv.ph === 'at') {
      const near = yardDogNear(B, cx, cz, 3.5);
      r.want = { x: cx, z: cz }; r.look = near; if (near) r.yaw = faceTo(cx, cz, near.x, near.z);
      r.anim = M.swat ? null : u < 3 ? 'sniff' : u < 6 ? 'wag' : 'sit';
      const rough = dd.nala.on && !M.calm;   // Nala pouncing: she stays until she's had enough of it
      if (u > (M.swat ? 9 : rough ? 30 : 11) || (!bout && u > 4)) { M.fv.ph = 'back'; M.fv.t0 = q5(t); B.say('molly', M.swat ? '*hmph*' : '*soft wuff*', 2.2); }
    } else { r.maxSpd = 2.2; if (offL < 0.5 || u > 25) { M.fv = null; M.fvCool = q5(t + 45); } }   // then a while with Joyce before the next visit
    return r;
  }
  if (bout && !s.ride && !s.nap && s.mode !== 'cart') {
    const g = fenceGap(cx, cz), who = dd.nala.on ? 'nala' : 'dax', D = dd[who];
    const rough = who === 'nala' && !M.calm;
    if (g.d < 12 && D.t0 + 6 < t && t >= (M.fvCool || 0) && hash01('molly-fv', who, Math.round(D.t0 * TPS)) < (rough ? 0.95 : 0.55) && Math.hypot(s.x - g.fo.x, s.z - g.fo.z) < 14 && mollyOK(g.fo.x, g.fo.z)) {
      M.fv = { ph: 'go', t0: q5(t), x: q5(g.fo.x), z: q5(g.fo.z) };
      return mollyStep(B, b, s, dt, t, cx, cz, P, dp);
    }
    const near = yardDogNear(B, cx, cz, 25);
    if (near) r.look = near;   // she watches them, with an old lady's patience
  }
  // ---- someone she knows nearby: a look, a slow wag now and then (she stays with Joyce)
  if (P && dp < 4.5 && s.speed < 0.2 && !s.nap) {
    r.look = P;
    if (P.v < 0.3 && hash01('molly-wag', Math.floor(t / 6)) < 0.35) r.anim = 'wag';
  }
  // ---- by Joyce in the garden or at home: never sitting in a flower bed or on a chair
  if (s.speed < 0.2 && (s.mode === 'garden' || s.mode === 'home')) { const c = clearSpot(B, s.x, s.z, inYard(s.x, s.z)); if (c) r.want = { x: c.x, z: c.z, soft: true }; }
  return r;
}
// The props round Joyce's garden and house (beds, chairs, the wheelbarrow...): Molly's resting spot by Joyce steps clear of them.
// From dog-toys.js's fixed props (the same on every screen), kept within 16 m of the garden and the house.
let PROPS = null, PROPS_SRC = null, PROPS_KEY = '';
function mollyProps(B) {
  const src = B.fixedProps;
  if (!src) return [];
  const { garden, home } = joyceSpots(), key = garden.x + ',' + garden.z + ',' + home.x + ',' + home.z;
  if (src !== PROPS_SRC || key !== PROPS_KEY) {
    const near = (x, z) => Math.hypot(x - garden.x, z - garden.z) < 16 || Math.hypot(x - home.x, z - home.z) < 16;
    PROPS = src.filter(c => (c.type === 'circle' ? near(c.x, c.z) : near((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2)));
    PROPS_SRC = src; PROPS_KEY = key;
  }
  return PROPS;
}
const blocked = (P, x, z, m) => P.some(c => (c.type === 'circle' ? Math.hypot(x - c.x, z - c.z) < c.r + m : x > c.minX - m && x < c.maxX + m && z > c.minZ - m && z < c.maxZ + m));
// A clear spot for her near (x, z) (the nearest on rings round it), or null when (x, z) is clear already.
export function clearSpot(B, x, z, already = false) {
  const P = mollyProps(B);
  if (!P.length || !blocked(P, x, z, 0.4)) return null;
  for (let i = 1; i <= 8; i++) for (let j = 0; j < 12; j++) {
    const a = j / 12 * Math.PI * 2, px = x + Math.sin(a) * i * 0.45, pz = z + Math.cos(a) * i * 0.45;
    if (!blocked(P, px, pz, 0.4) && mollyOK(px, pz, already)) return { x: px, z: pz };
  }
  return null;
}
function yardDogNear(B, x, z, R) {
  let best = null, bd = R;
  for (const id of ['nala', 'dax']) { const o = B.S.dogs[id].out; if (!o) continue; const d = Math.hypot(o.x - x, o.z - z); if (d < bd) { bd = d; best = o; } }
  return best;
}

// A toy: Molly runs (at an old dog's pace) and brings it back like Nala, and with the rope, or now and then with anything, she
// has a little tug with you first (head down, pulling back, a shake or two) before she lets you have it.
export function mollyFetch(B, b, s, dt, t, cx, cz, trust) {
  const f = b.fetch, ball = B.S.balls[f.ball];
  if (f.phase === 'tug') {
    f.pt += dt;
    const P = ball ? B.S.att[ball.key] : null, r = { want: { x: cx, z: cz }, maxSpd: 2, moveAnim: null, anim: 'tug', yaw: null, look: P, at: f.pt, worry: 0 };
    if (P) r.yaw = faceTo(cx, cz, P.x, P.z);
    if (f.pt > 2.8 || !ball) { f.phase = 'drop'; f.pt = 0; }
    return r;
  }
  const r = B.fetchStep('molly', b, s, dt, t, cx, cz, trust);
  if (f.phase === 'drop' && !f.tugged && ball && ball.holder === 'molly') {
    f.tugged = true;
    if (ball.kind === 'rope' || hash01('molly-tug', f.ball, Math.floor(t)) < 0.4) { f.phase = 'tug'; f.pt = 0; B.say('molly', '*grrr* (a polite tug)', 2.4, false, 'happy'); }
  }
  r.maxSpd = Math.min(r.maxSpd ?? 2.2, MOLLY_SPEED);
  if (r.moveAnim === 'lope') r.moveAnim = null;
  return r;
}

// ---------------------------------------------------------------- Dax and Nala: a bout of trying to get her attention
// Called for each yard dog before its usual step (dogs-brain.js update). Returns that step's result shape, or null. Always
// inside the fence: every spot is the yard's (dogWalkable), the fence line, play bows, zoomies along it, a yip, and Nala
// pouncing at Molly when she comes close... until Molly swats her down. Nala is calm after that, until after her next nap.
export function mollyReact(B, id, b, s, dt, t, cx, cz) {
  const M = B.S.molly, D = M.dd[id], mb = B.S.dogs.molly, mo = mb && mb.out;
  if (!M || !D) return null;
  if (!mo || b.walk || B.asleep(b) || (b.zz && b.zz.ph === 'wake')) { if (D.on) endBout(D, id, t); return null; }
  // Nala after the swat: down she goes (a startle, a play bow, then lying low, ears back)
  if (id === 'nala' && M.swat && t - M.swat.t0 < 7) {
    const u = t - M.swat.t0;
    if (u >= 0.5 && u - DT < 0.5) B.say('nala', '*whimper* ...okay, okay.', 2.6, false, 'sad');
    return { want: { x: cx, z: cz }, maxSpd: 7, moveAnim: null, anim: u < 0.35 ? 'startle' : u < 1.8 ? 'playbow' : 'lie', yaw: faceTo(cx, cz, mo.x, mo.z), look: mo, at: u, worry: u < 1.8 ? 0.8 : 0.4 };
  }
  const g = fenceGap(mo.x, mo.z), myD = Math.hypot(cx - mo.x, cz - mo.z);
  const near = g.inside ? myD < 12 : g.d < BOUT_NEAR, far = g.inside ? myD > 16 : g.d > BOUT_FAR;
  if (!D.on) {
    if (!near || t < D.cool || myD > (id === 'nala' ? 100 : 60)) return null;   // Nala hears her from anywhere in the yard
    if (Math.hypot(b.off.x, b.off.z) > 2) { D.ease = 0; return null; }   // only a dog at ease on its plan notices, not one on its way back from a walk or a treat...
    if (!D.ease) D.ease = q5(t);
    if (t - D.ease < 30) return null;   // ...and only once it's been at ease half a minute
    Object.assign(D, { on: true, t0: q5(t), until: q5(t + 35 + hash01('molly-bout', id, B.k) * 20), hit: -1, said: false });
    B.say(id, id === 'nala' ? (M.calm ? '*polite wag*' : 'MOLLY!! Play with me!') : '*curious wuff?*', 2.6, false, 'excited');
  }
  if (t > D.until || far) { endBout(D, id, t); return null; }
  const u = t - D.t0, isNala = id === 'nala', rough = isNala && !M.calm;
  // the spot: just inside the fence nearest her (in the yard with her, a play bow's length from her)
  let gx, gz;
  if (g.inside) { const k = Math.max(0.01, myD); gx = mo.x + (cx - mo.x) / k * 1.2; gz = mo.z + (cz - mo.z) / k * 1.2; }
  else { gx = g.fi.x + g.tx * (isNala ? 0.6 : -0.6); gz = g.fi.z + g.tz * (isNala ? 0.6 : -0.6); }
  [gx, gz] = inYardSpot(gx, gz, g.fi);
  const r = { want: { x: gx, z: gz, soft: true }, maxSpd: isNala ? 6.5 : 4.4, moveAnim: isNala ? null : 'lope', anim: null, yaw: null, look: mo, at: null, worry: 0 };
  if (Math.hypot(gx - cx, gz - cz) > 1.1) return r;   // on the way over
  const SLOT = 2.2, j = Math.floor(u / SLOT), su = u - j * SLOT, face = faceTo(cx, cz, mo.x, mo.z);
  const seq = rough ? ['playbow', 'zoom', 'slam', 'bark', 'slam', 'slam'] : isNala ? ['playbow', 'zoom', 'wag', 'sit'] : ['playbow', 'yip', 'zoom', 'wag', 'sitlook', 'zoom'];
  const step = seq[(j + (isNala ? 0 : 1)) % seq.length];
  r.yaw = face;
  if (step === 'zoom') {   // zoomies along the fence and back
    const side = j % 2 ? 1 : -1, zx = gx + g.tx * side * 4, zz = gz + g.tz * side * 4, [px, pz] = inYardSpot(zx, zz, g.fi);
    r.want = { x: px, z: pz }; r.maxSpd = isNala ? 7 : 5; r.moveAnim = 'lope'; r.yaw = null;
    return r;
  }
  r.want = { x: cx, z: cz };
  r.anim = step; r.at = su;
  if (step === 'slam' && D.hit !== j) {   // a pounce at her: it counts when she is right there
    D.hit = j;
    if (Math.hypot(cx - mo.x, cz - mo.z) < 3.6 && ((M.fv && M.fv.ph === 'at') || g.inside)) { M.irk = Math.min(SWAT_AT, M.irk + 1); B.sound('dogthump', cx, 0.6, cz, { size: 0.6 }); }   // she's at the fence for it, or in the yard with her
  }
  if (step === 'bark' && !D.said) { D.said = true; B.say(id, isNala ? 'BORK! BORK! Molly!' : '*yip!*', 2.2, false, 'excited'); }
  if (step === 'yip' && su < DT * 1.5) B.say(id, 'Yip!', 1.4, true);
  if (step === 'yip' && su < DT * 1.5) B.sound('yipe', cx, 0.7, cz);
  return r;
}
function endBout(D, id, t) { D.on = false; D.cool = q5(t + 240 + hash01('molly-cool', id, Math.round(t)) * 240); }
// A yard dog with something better to do (a treat, a toy, a walk, a hello, a play scene, a visitor by it) drops its bout at once
// (dogs-brain.js update, before the steps). Returns whether it is free for one.
export function mollyFree(B, id, b, t, busy) {
  const D = B.S.molly && B.S.molly.dd[id];
  if (!D) return false;
  if (busy) { if (D.on) endBout(D, id, t); D.ease = 0; }
  return !busy;
}
// a spot kept inside the yard: pulled toward the inside point by the fence until it is one a yard dog may stand on
function inYardSpot(x, z, fi) {
  for (let i = 0; i < 8 && !dogWalkable(x, z); i++) { x = fi.x + (x - fi.x) * 0.6; z = fi.z + (z - fi.z) * 0.6; }
  return dogWalkable(x, z) ? [x, z] : [fi.x, fi.z];
}

// A yard dog in a bout stays inside its fence: a step that would carry it out (its plan walking on under it while it holds the
// fence line) is not taken, slid along the fence if it can be (dogs-brain.js tick, for Dax and Nala).
export function yardHold(B, f) {
  const M = B.S.molly, b = B.S.dogs[f.id], D = M && M.dd[f.id], prev = b.out, r = f.r;
  if (!D || !prev || b.walk || !(D.on || (f.id === 'nala' && M.swat))) return;
  const u = M.swat ? B.t - M.swat.t0 : 99;
  if (f.id === 'nala' && u < 7 && !b.treat && !b.fetch && !f.s.ep) {   // swatted: she stays down where she is (whatever her plan is doing under her)
    r.x = prev.x; r.z = prev.z; r.speed = 0; r.anim = u < 0.35 ? 'startle' : u < 1.8 ? 'playbow' : 'lie'; r.at = u;
    b.off.x = q5(r.x - f.s.x); b.off.z = q5(r.z - f.s.z);
    return;
  }
  if (dogWalkable(r.x, r.z) || !dogWalkable(prev.x, prev.z)) return;
  if (dogWalkable(r.x, prev.z)) r.z = prev.z; else if (dogWalkable(prev.x, r.z)) r.x = prev.x; else { r.x = prev.x; r.z = prev.z; }
  b.off.x = q5(r.x - f.s.x); b.off.z = q5(r.z - f.s.z);
  const v = Math.hypot(r.x - prev.x, r.z - prev.z) / DT;
  if (v < r.speed) r.speed = v > 0.25 ? v : 0;
}

// ---------------------------------------------------------------- after the tick's moves (dogs-brain.js tick)
// The fence (no way into the yard unless walked), the ride (on the seat, the goggles on), the swat, Nala's calm and her naps.
export function mollyPost(B, f) {
  const S = B.S, M = S.molly, b = S.dogs.molly, r = f.r, s = f.s, t = B.t, prev = b.out;
  // 1. the fence: a step that would take her into the yard isn't taken (slid along it if it can be), unless someone walks her in
  // or Joyce herself is in there
  if (!b.walk && prev && !inYard(s.x, s.z) && !inYard(prev.x, prev.z) && inYard(r.x, r.z)) {
    if (!inYard(r.x, prev.z)) r.z = prev.z; else if (!inYard(prev.x, r.z)) r.x = prev.x; else { r.x = prev.x; r.z = prev.z; }
    b.off.x = q5(r.x - s.x); b.off.z = q5(r.z - s.z);
    const v = Math.hypot(r.x - prev.x, r.z - prev.z) / DT;   // held at the fence: no walking on the spot
    if (v < r.speed) { r.speed = v > 0.25 ? v : 0; if (!r.speed && r.anim == null) r.anim = 'sitlook'; }
  }
  // 2. riding in Joyce's cart: up on the seat as she reaches it, sitting with her goggles on while it drives
  const offL = Math.hypot(b.off.x, b.off.z), free = !b.walk && !b.treat && !b.fetch && !M.mf && !M.fv && !M.kv;
  if (s.ride && free && offL < 1.2) {
    r.y = (s.seatH ?? SEAT_Y) * smooth(1.2, 0.35, offL);
    if (offL < 0.35) { r.anim = 'sit'; r.speed = 0; r.yaw = s.yaw; r.gog = 1; r.at = null; }
  }
  // 3. the swat: Nala has pounced three times and is right there
  const nala = S.dogs.nala && S.dogs.nala.out;
  if (!M.swat && M.irk >= SWAT_AT && nala && !r.gog && ((M.fv && M.fv.ph === 'at') || inYard(r.x, r.z)) && Math.hypot(nala.x - r.x, nala.z - r.z) < 3.8) {
    M.swat = { t0: q5(t) }; M.calm = true; M.calmNap = false; M.irk = 0;
    B.say('molly', '*SWAT* Grrr. Enough, young lady.', 3, false, 'alert');
    B.sound('dogthump', r.x, 0.5, r.z, { size: 0.5 });
  }
  if (M.swat) {
    const u = t - M.swat.t0;
    if (u < SWAT_DUR + 0.6 && nala) { r.anim = u < SWAT_DUR ? 'swat' : 'sit'; r.at = u; r.yaw = faceTo(r.x, r.z, nala.x, nala.z); r.speed = 0; r.x = prev ? prev.x : r.x; r.z = prev ? prev.z : r.z; b.off.x = q5(r.x - s.x); b.off.z = q5(r.z - s.z); }
    if (u > 12) M.swat = null;
  }
  // 4. Nala calm until after her next nap
  const nb = S.dogs.nala;
  if (M.calm && nb) {
    if (B.asleep(nb)) M.calmNap = true;
    else if (M.calmNap && (!nb.zz || nb.zz.ph === 'awake')) { M.calm = false; M.calmNap = false; M.irk = 0; }
  }
  // 5. with Dax or Nala in the yard (walked in): she is pushed off them, not through them
  if (inYard(r.x, r.z)) for (const id of ['nala', 'dax']) {
    const o = S.dogs[id].out; if (!o) continue;
    let dx = r.x - o.x, dz = r.z - o.z, d = Math.hypot(dx, dz);
    const m = (id === 'nala' && (o.anim === 'slam' || o.anim === 'playbow')) ? 0.45 : 0.75;
    if (d >= m) continue;
    if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
    const nx = r.x + dx / d * (m - d), nz = r.z + dz / d * (m - d);
    if (townWalkable(nx, nz)) { r.x = nx; r.z = nz; }
  }
}
