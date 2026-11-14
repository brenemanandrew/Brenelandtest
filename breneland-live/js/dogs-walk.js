// A dog walking round town with a visitor, no lead drawn. Part of the dogs' shared simulation (dogs-brain.js), so it's a pure
// function of the state and the relayed events: no Math.random, no frame times, no local player. It all lives in
// `S.dogs[id].walk`, plain data that snapshots and late joiners carry:
//   { ph: 'walk' | 'home', sid, name (the walker), t0, x, z, yaw (absolute, not an offset from the plan), side (which side
//     it heels on), crumbs (the walker's recent spots, so it goes through the gates they went through), trail (the way home,
//     thinned to its corners), wx, wz, wyaw, wv (the walker's last known whereabouts), still, sniff, joy, stuckT }
// Events (lib/dogs.js relays them, the server decides who walks each dog):
//   { e: 'walk', dog, on: 1, sid, name, x, z }  take (ignored if someone else has it, or from further than TAKE_REACH)
//   { e: 'walk', dog, on: 0, sid }              let go (by the walker, or by the server when they leave or after an hour)
// The walker's whereabouts come from their 'att' events. The dog keeps out of the water and out of buildings and waits
// for them at the edge. Let go, it walks its trail back and dogs-brain.js eases it to wherever the plan has it now.
import { hash01 } from './util.js';
import { MAP, HOUSE, GATES, FISH_SHACK, GAME_STORE, inHouseBox } from './layout.js';
import { coastSigned, onSurface, groundHeight } from './terrain.js';

export const WALK_HOLD = 4;        // s of holding E to take a dog for a walk, and again to let it go (dog-walk.js)
export const TAKE_REACH = 5.5;     // m: a take from further than this is a stale one
const TPS = 20, ATT_FRESH = 4 * TPS;   // (dogs-brain.js: a visitor's whereabouts count this long)
const CRUMB_GAP = 0.6;             // m between the walker's recorded spots
const CRUMBS_MAX = 30;
const TRAIL_GAP = 4;               // m between the dog's own recorded spots on the way out
const TRAIL_MAX = 80;              // the way home is thinned to its corners beyond this
const HEEL_BACK = 0.95, HEEL_SIDE = 0.8;   // the heel spot: just behind the walker, on the dog's side
const BESIDE = 2.8;                // m: this close the dog keeps to the heel spot instead of the crumbs
const SNIFF_WIN = 9;               // s: at most one sniff a window while standing about

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const q5 = v => Math.round(v * 1e5) / 1e5;
const inBox = (b, x, z, pad) => x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad;
const inShed = (s, x, z, pad) => Math.abs(x - s.x) < s.w / 2 + pad && Math.abs(z - s.z) < s.d / 2 + pad;

// Where a walking dog may stand: anywhere on the map that is land (the pier's boards count), not inside the house, the
// Fish Shack or the game store. Everything else the walker went round, the crumbs go round too.
export function townWalkable(x, z) {
  if (x < MAP.minX + 1 || x > MAP.maxX - 1 || z < MAP.minZ + 1 || z > MAP.maxZ - 1) return false;
  if (inHouseBox(x, z, 0.35) || inShed(FISH_SHACK, x, z, 0.25) || inShed(GAME_STORE, x, z, 0.25)) return false;
  if (coastSigned(x, z) > -0.35 && !onSurface(x, z)) return false;
  return true;
}
// A spot in (or right at) the water moved up the shore a little (the way home is a chain of straight legs; one may clip a bay).
function landward(x, z) {
  for (let i = 0; i < 6 && coastSigned(x, z) > -0.5; i++) {
    const e = 0.5, gx = coastSigned(x + e, z) - coastSigned(x - e, z), gz = coastSigned(x, z + e) - coastSigned(x, z - e), L = Math.hypot(gx, gz) || 1;
    x -= gx / L * 0.7; z -= gz / L * 0.7;
  }
  return [x, z];
}
const nearGate = (x, z) => GATES.some(g => Math.hypot(g.x - x, g.z - z) < 3);
function pushTrail(trail, x, z, force) {
  const last = trail[trail.length - 1];
  if (!force && last && Math.hypot(last[0] - x, last[1] - z) < TRAIL_GAP) return;
  trail.push([q5(x), q5(z)]);
  if (trail.length <= TRAIL_MAX) return;
  // thin: drop the interior point that bends the way home the least (never one at a gate: the way through the fence)
  let best = -1, bd = Infinity;
  for (let i = 1; i < trail.length - 1; i++) {
    const [ax, az] = trail[i - 1], [bx, bz] = trail[i + 1], [px, pz] = trail[i];
    if (nearGate(px, pz)) continue;
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6;
    const u = clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1);
    const d = Math.hypot(ax + dx * u - px, az + dz * u - pz);
    if (d < bd) { bd = d; best = i; }
  }
  trail.splice(best > 0 ? best : 1, 1);
}

// ---------------------------------------------------------------- events
export function applyWalk(B, ev, t) {
  const id = ev.dog, b = B.S.dogs[id];
  if (!b) return;
  if (ev.on) take(B, id, b, ev, t); else letGo(B, id, b, ev, t);
}
function take(B, id, b, ev, t) {
  const w = b.walk;
  if (w && w.ph === 'walk') return;                                       // already walking (with them, or first come first served)
  const p = B.posOf(id);
  if (!p || Math.hypot(ev.x - p.x, ev.z - p.z) > TAKE_REACH) return;      // a take from across the yard is a stale one
  const trail = w ? w.trail : [];                                         // (let go in town and taken again: the way home stays)
  pushTrail(trail, p.x, p.z, true);
  b.walk = { ph: 'walk', sid: ev.sid, name: String(ev.name || '').slice(0, 24), t0: t, x: q5(p.x), z: q5(p.z), yaw: q5(p.yaw || 0),
    side: hash01('walkside', id, B.k) < 0.5 ? -1 : 1, crumbs: [], trail, wx: null, wz: null, wyaw: q5(p.yaw || 0), wv: 0,
    still: 0, sniff: null, joy: t + 1.5, stuckT: 0 };
  // whatever it was doing is over: the walk comes first
  b.treat = null; b.fetch = null; b.react = null; b.zz = null; b.queue.length = 0; b.y.phase = 'idle'; b.y.wait = 0;
  for (const key in B.S.balls) {   // a toy in its mouth is dropped where it stands
    const ball = B.S.balls[key];
    if (ball.holder !== id) continue;
    ball.holder = null; ball.ready = true; ball.flying = false; ball.moving = false; ball.vx = ball.vz = ball.vy = 0;
    ball.x = q5(p.x); ball.z = q5(p.z); ball.y = q5(groundHeight(p.x, p.z) + 0.13); ball.px = ball.x; ball.py = ball.y; ball.pz = ball.z;
  }
  B.say(id, id === 'nala' ? 'Walkies!! BORK!' : id === 'molly' ? '*a dignified little hop* Walkies.' : '*happy yip!*', 3, false, id === 'nala' ? 'excited' : 'happy');
}
function letGo(B, id, b, ev, t) {
  const w = b.walk;
  if (!w || w.ph !== 'walk' || String(w.sid) !== String(ev.sid)) return;
  w.ph = 'home'; w.sid = null; w.name = ''; w.crumbs.length = 0; w.t0 = t; w.stuckT = 0;
  B.say(id, id === 'nala' ? '*wag wag* Bye!' : id === 'molly' ? '*soft wuff* (back to Joyce)' : '*soft wuff*', 2.5, false, id === 'nala' ? 'happy' : 'calm');
}

// ---------------------------------------------------------------- one tick of a walk
// Returns dogs-brain.js update()'s result shape { x, z, yaw, speed, anim, at, look, worry }, or null once the dog is back
// where the walk began (b.walk is then null and the usual easing takes over).
export function walkStep(B, id, b, s, dt, t) {
  const w = b.walk;
  if (w.ph === 'home') return homeStep(B, id, b, s, dt, t);
  const W0 = B.S.att[w.sid], W = W0 && B.k - W0.k <= 3 * ATT_FRESH ? W0 : null;   // the walker's whereabouts (kept 12 s)
  if (W) {
    if (w.wx === null || Math.hypot(W.x - w.wx, W.z - w.wz) > CRUMB_GAP) {
      w.crumbs.push([q5(W.x), q5(W.z)]);
      if (w.crumbs.length > CRUMBS_MAX) w.crumbs.shift();
      w.wx = q5(W.x); w.wz = q5(W.z);
    }
    w.wyaw = q5(W.yaw || 0); w.wv = W.v || 0;
  }
  const cx = w.x, cz = w.z;
  while (w.crumbs.length && Math.hypot(w.crumbs[0][0] - cx, w.crumbs[0][1] - cz) < 0.8) w.crumbs.shift();        // reached
  while (w.crumbs.length && !townWalkable(w.crumbs[0][0], w.crumbs[0][1])) w.crumbs.shift();                      // in the water, indoors: not for a dog
  const dW = W ? Math.hypot(W.x - cx, W.z - cz) : Infinity;
  const wOK = W ? townWalkable(W.x, W.z) : false;
  const moving = W ? W.v > 0.4 : false;
  const run = id === 'nala' ? 7.6 : id === 'molly' ? 4.6 : 6.6;   // (Molly's older, so she's slower)
  const heel = () => { const ya = w.wyaw, sx = Math.cos(ya) * w.side * HEEL_SIDE, sz = -Math.sin(ya) * w.side * HEEL_SIDE; return { x: W.x - Math.sin(ya) * HEEL_BACK + sx, z: W.z - Math.cos(ya) * HEEL_BACK + sz }; };
  let goal = null, spd = 2.5, soft = false;
  if (W && dW < BESIDE) {                       // beside them: the heel spot, just behind on its side
    w.crumbs.length = 0;
    const h = heel(), dh = Math.hypot(h.x - cx, h.z - cz);
    if (townWalkable(h.x, h.z) && dh > (moving ? 0.25 : 0.45)) { goal = h; soft = true; spd = Math.max(2.4, w.wv * 1.35 + 0.6); }
  } else if (w.crumbs.length) {                 // behind: along their footsteps (through the gate, round the bench)
    goal = { x: w.crumbs[0][0], z: w.crumbs[0][1] };
    spd = dW > 7 ? run : clamp(w.wv * 1.4 + 1.2, 2.8, run);
  } else if (W && wOK) {                        // no footsteps to follow (back out of the water, or a long way off): straight to them
    const h = heel(); goal = townWalkable(h.x, h.z) ? h : { x: W.x, z: W.z }; spd = dW > 8 ? run : 3.5; soft = true;
  }                                             // else: they are in the water or indoors (or gone quiet): wait here
  let nx = cx, nz = cz, vel = 0;
  if (goal) {
    const dx = goal.x - cx, dz = goal.z - cz, el = Math.hypot(dx, dz);
    if (el > 1e-4) {
      const slow = soft ? clamp(0.3 + el / 1.6, 0.3, 1) : 1;
      const step = Math.min(el, spd * slow * dt);
      let tx = cx + dx / el * step, tz = cz + dz / el * step;
      if (!townWalkable(tx, tz)) { if (townWalkable(tx, cz)) tz = cz; else if (townWalkable(cx, tz)) tx = cx; else { tx = cx; tz = cz; } }   // slide along the shore
      nx = tx; nz = tz; vel = Math.hypot(nx - cx, nz - cz) / dt;
    }
  }
  let yaw = w.yaw, anim = null, at = null;
  if (vel > 0.5) { yaw = Math.atan2(nx - cx, nz - cz); anim = vel > 5.2 ? 'lope' : null; w.still = 0; w.sniff = null; }
  else {
    vel = 0; w.still = q5(w.still + dt);
    if (W && dW < 3.2) yaw = w.wyaw; else if (W) yaw = Math.atan2(W.x - cx, W.z - cz);
    if (t < w.joy) { anim = 'happy'; at = t - (w.joy - 1.5); }
    else if (w.sniff !== null && t < w.sniff) anim = 'sniff';
    else {
      const j = Math.floor(t / SNIFF_WIN), tt = j * SNIFF_WIN + 1 + hash01('wsn', id, j) * (SNIFF_WIN - 3);
      if (w.still > 1.2 && t >= tt && t - dt < tt && hash01('wsniff', id, j) < 0.7) {   // a sniff about (once in a window, at a hashed moment)
        w.sniff = q5(t + 1.4); anim = 'sniff';
        B.sound('dogsniff', cx, groundHeight(cx, cz) + 0.3, cz);
        if (hash01('wsnl', id, j) < 0.4) B.say(id, '*sniff sniff*', 1.4, true);
      } else if (w.sniff !== null) w.sniff = null;
      if (!anim) {
        if (w.still > 6 && hash01('wsit', id, Math.floor(t / 12)) < 0.45) anim = 'sit';          // a long wait: sits
        else if (W && !wOK) anim = w.still > 2 ? 'sitlook' : null;                              // waiting at the shore or the door
        else anim = w.still < 0.8 ? 'wag' : null;
      }
    }
  }
  w.x = q5(nx); w.z = q5(nz); w.yaw = q5(yaw);
  pushTrail(w.trail, w.x, w.z, false);
  return { x: w.x, z: w.z, yaw, speed: vel, anim, at, look: W ? { x: W.x, z: W.z } : null, worry: 0 };
}

// Let go: back along its own trail to where the walk began (the last trail point is the nearest), then the plan's business.
function homeStep(B, id, b, s, dt, t) {
  const w = b.walk, tr = w.trail, cx = w.x, cz = w.z;
  while (tr.length && Math.hypot(tr[tr.length - 1][0] - cx, tr[tr.length - 1][1] - cz) < 0.9) tr.pop();
  if (!tr.length) { b.walk = null; b.off.x = q5(cx - s.x); b.off.z = q5(cz - s.z); return null; }
  const g = tr[tr.length - 1], dx = g[0] - cx, dz = g[1] - cz, el = Math.hypot(dx, dz) || 1e-6;
  const step = Math.min(el, (id === 'nala' ? 3.6 : id === 'molly' ? 2.6 : 3.0) * dt);
  let nx = cx + dx / el * step, nz = cz + dz / el * step;
  if (!townWalkable(nx, nz)) { [nx, nz] = landward(nx, nz); if (!townWalkable(nx, nz)) { nx = cx; nz = cz; } }
  const vel = Math.hypot(nx - cx, nz - cz) / dt;
  if (vel < 0.3) { w.stuckT = q5(w.stuckT + dt); if (w.stuckT > 4) { tr.pop(); w.stuckT = 0; } } else w.stuckT = 0;   // (a leg it cannot walk: skip the point)
  w.x = q5(nx); w.z = q5(nz);
  const yaw = vel > 0.3 ? Math.atan2(nx - cx, nz - cz) : w.yaw;
  w.yaw = q5(yaw);
  return { x: w.x, z: w.z, yaw, speed: vel, anim: vel > 0.3 ? null : 'sniff', at: null, look: null, worry: 0 };
}
