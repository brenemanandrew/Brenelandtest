// Where a voice is heard: how loud at a distance, what muffles it, and the room it rings in (voice.js uses these).
//
//   falloff(d, loud)      0..1: full within NEAR m, fading out by FAR m (a shout by FAR_LOUD), silent beyond
//   zoneAt(x, y, z, env)  the listener's acoustic zone id (ZONES below), env = { woods, storm, underwater }
//   makeIR(ctx, id)       a synthesised impulse response for a zone (noise, early reflections, a comb for metal)
//   wallsFrom(colliders)  the building boxes; hitsWall(walls, ax, az, bx, bz) = the line between crosses one
//   muffleBetween(walls, ax, ay, az, bx, by, bz)  how many walls are between (0 clear, 0.5 an open door, 1 a wall, 2 two),
//                         rooms inside buildings counted (the game store's back room); muffleGain / muffleLp turn it into sound
import { HOUSE, WATER_TOWER, DOCK, NEIGHBORHOODS, SHOPS, ROADS, SWIM_ZONE, FISH_SHACK, GAME_STORE } from './layout.js';
import { coastSigned } from './terrain.js';
import { pointInPoly } from './util.js';

export const NEAR = 3, FAR = 28, FAR_LOUD = 42;
export function falloff(d, loud = false) {
  const far = loud ? FAR_LOUD : FAR;
  if (d <= NEAR) return 1;
  if (d >= far) return 0;
  const t = 1 - (d - NEAR) / (far - NEAR);
  return t * t; // half way out is about -12 dB
}

// wet: reverb send; lp: a low-pass on everything you hear there (Hz); the IR recipe for makeIR
export const ZONES = {
  open: { name: 'the open yard', wet: 0.04, lp: 20000, ir: { len: 0.25, decay: 18, tone: 0.9 } },
  room: { name: 'a small room (the house, the shack, the store)', wet: 0.3, lp: 20000, ir: { len: 0.5, decay: 11, tone: 0.7, early: [0.007, 0.011, 0.017, 0.023, 0.031] } },
  tower: { name: 'the water tower', wet: 0.42, lp: 20000, ir: { len: 2.4, decay: 2.6, tone: 0.8, comb: 0.0093, early: [0.021, 0.043] } },
  woods: { name: 'the deep woods', wet: 0.16, lp: 4200, ir: { len: 0.8, decay: 7, tone: 0.25 } },
  storm: { name: 'the Arkham storm', wet: 0.18, lp: 3200, ir: { len: 0.9, decay: 6, tone: 0.2 } },
  lake: { name: 'the lake shore', wet: 0.26, lp: 20000, ir: { len: 1.0, decay: 6, tone: 0.6, slap: [0.19, 0.38, 0.57] } },
  town: { name: 'the town', wet: 0.15, lp: 20000, ir: { len: 0.8, decay: 7, tone: 0.75, early: [0.034, 0.061, 0.088] } },
  underwater: { name: 'under water', wet: 0.3, lp: 480, ir: { len: 0.6, decay: 8, tone: 0.15 } },
};

// the buildings you can stand inside (the house in the morning walk; Kevin's shack and the game store any time)
const box = b => ({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 });
const ROOMS = [HOUSE, box(FISH_SHACK), box(GAME_STORE)];
// Rooms inside a building: their own shell (a voice in the back room is muffled in the shop and, through the shop's walls as
// well, silent outside). The game store's back room: under the loft (its floor is the room's ceiling, so someone up on the loft
// isn't in it), behind the half-glass door (open: `door()`, game-store.js sets it, lets a little more through).
export const BACK_ROOM = (() => {
  const G = GAME_STORE, T = 0.25, zL = G.z + G.d / 2 - G.loftD;
  return { minX: G.x - G.w / 2 + T, maxX: G.x + G.w / 2 - T, minZ: zL, maxZ: G.z + G.d / 2 - T, maxY: G.loftY - 0.5, shell: true, inner: true, door: null };
})();
const inBox = (b, x, z, pad = 0) => x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad;
const nearRoad = (x, z) => ROADS.some(r => {
  for (let i = 1; i < r.pts.length; i++) {
    const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    if (Math.hypot(ax + dx * t - x, az + dz * t - z) < r.width / 2 + 4) return true;
  }
  return false;
});

export function zoneAt(x, y, z, env = {}) {
  if (env.underwater) return 'underwater';
  if (ROOMS.some(b => inBox(b, x, z)) && y < HOUSE.floorY + 3.5) return 'room';
  if (Math.hypot(x - WATER_TOWER.x, z - WATER_TOWER.z) < 9 || (y > 6 && Math.hypot(x - WATER_TOWER.x, z - WATER_TOWER.z) < 14)) return 'tower';
  if ((env.storm || 0) > 0.4) return 'storm';
  if ((env.woods || 0) > 0.45) return 'woods';
  if (inBox(DOCK, x, z, 1) || coastSigned(x, z) > -7 || pointInPoly(x, z, SWIM_ZONE)) return 'lake';
  if (inBox(SHOPS, x, z, 2) || NEIGHBORHOODS.some(n => inBox(n, x, z)) || (z < -40 && nearRoad(x, z))) return 'town';
  return 'open';
}

// Impulse responses: decaying stereo noise (exp(-decay * t), `tone` = how bright: a one-pole low-pass on the noise),
// discrete early reflections, slap echoes (a lake's far shore), and a feedback comb that makes metal ring.
const irCache = new WeakMap();
export function makeIR(ctx, id) {
  let byCtx = irCache.get(ctx);
  if (!byCtx) irCache.set(ctx, byCtx = {});
  if (byCtx[id]) return byCtx[id];
  const z = ZONES[id] || ZONES.open, R = z.ir, sr = ctx.sampleRate, n = Math.max(1, Math.floor(R.len * sr));
  const buf = ctx.createBuffer(2, n, sr);
  let seed = 1234567 + id.length * 7919;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 1073741823.5 - 1);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    const k = 0.05 + 0.95 * R.tone;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      lp += (rnd() - lp) * k;
      d[i] = lp * Math.exp(-R.decay * t) * Math.min(1, t / 0.004); // a few ms before the tail builds
    }
    for (const [j, e] of (R.early || []).entries()) { const i = Math.floor((e + c * 0.0013) * sr); if (i < n) d[i] += (0.7 - j * 0.1) * (c ? -1 : 1); }
    for (const [j, e] of (R.slap || []).entries()) { const i = Math.floor((e + c * 0.004) * sr); for (let q = 0; q < 40 && i + q < n; q++) d[i + q] += 0.5 * Math.pow(0.55, j) * Math.exp(-q / 9) * (q % 2 ? -0.4 : 1); }
    if (R.comb) { const L = Math.floor(R.comb * sr * (1 + c * 0.03)); for (let i = L; i < n; i++) d[i] += d[i - L] * 0.62; }
    // unit energy: the convolution adds no power of its own, so a zone's wet number is its reverb level next to the dry
    // voice (and the stereo image comes from the panner, not the random impulse response)
    let e = 0;
    for (let i = 0; i < n; i++) e += d[i] * d[i];
    const g = 1 / Math.sqrt(e + 1e-9);
    for (let i = 0; i < n; i++) d[i] *= g;
  }
  return (byCtx[id] = buf);
}

// time for an IR's energy to fall 20 dB (Schroeder integration), seconds: the tests compare zones with it
export function decayTime(buf, drop = 20) {
  const d = buf.getChannelData(0), n = d.length;
  let total = 0;
  for (let i = 0; i < n; i++) total += d[i] * d[i];
  let rest = total;
  for (let i = 0; i < n; i++) { rest -= d[i] * d[i]; if (10 * Math.log10(rest / total + 1e-12) < -drop) return i / buf.sampleRate; }
  return n / buf.sampleRate;
}

// Buildings that muffle a voice through them: the house's walls (`house: true` boxes), every solid box at least
// 2.5 m both ways (the town's houses, the shops, the shack), plus the layout's buildings.
export function wallsFrom(colliders) {
  const out = [];
  for (const c of colliders || []) {
    if (c.type !== 'box' || c.off) continue;
    if (c.house || (c.maxX - c.minX >= 2.5 && c.maxZ - c.minZ >= 2.5)) out.push({ minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ });
  }
  out.push({ minX: HOUSE.minX, maxX: HOUSE.maxX, minZ: HOUSE.minZ, maxZ: HOUSE.maxZ, shell: true });
  for (const b of ROOMS.slice(1)) out.push({ ...b, shell: true });
  out.push(BACK_ROOM);
  return out;
}
// How muffled a voice is between two points: each wall crossed counts 1 (a shell, a room inside a building, a solid building),
// an inner room's open door 0.5. Heights count for a room under a floor (maxY). hitsWall (above) is the plain yes or no.
const inShell = (w, x, y, z) => x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ && (w.maxY === undefined || y < w.maxY);
export function muffleBetween(walls, ax, ay, az, bx, by, bz) {
  let m = 0;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (w.inner) { if (inShell(w, ax, ay, az) !== inShell(w, bx, by, bz)) m += w.door && w.door() ? 0.5 : 1; continue; }
    if (w.shell) { if (inShell(w, ax, ay, az) !== inShell(w, bx, by, bz)) m += 1; continue; }
    if (hitsWall(SOLO, ax, az, bx, bz, w)) m += 1;
  }
  return m;
}
const SOLO = [null];
// what a muffle does: the gain kept and the low-pass (Hz). 0: clear; an open door: a little; a wall: muffled; two: silent
export const muffleGain = m => (m <= 0 ? 1 : m < 1 ? 0.8 : m < 1.5 ? 0.7 : 0);
export const muffleLp = m => (m <= 0 ? 18000 : m < 1 ? 2600 : 1100);
// Does the segment a -> b pass through a wall? A shell (a building you can go into) only counts when exactly one end
// is inside it: two people both in the house talk freely. Slab test, no allocation.
export function hitsWall(walls, ax, az, bx, bz, only = null) {
  const minX = Math.min(ax, bx), maxX = Math.max(ax, bx), minZ = Math.min(az, bz), maxZ = Math.max(az, bz);
  const dx = bx - ax, dz = bz - az;
  for (let i = 0; i < walls.length; i++) {
    const w = only || walls[i];
    if (w.inner) continue; // (a room inside a building: muffleBetween counts it)
    if (w.maxX < minX || w.minX > maxX || w.maxZ < minZ || w.minZ > maxZ) continue;
    const ia = ax >= w.minX && ax <= w.maxX && az >= w.minZ && az <= w.maxZ, ib = bx >= w.minX && bx <= w.maxX && bz >= w.minZ && bz <= w.maxZ;
    if (w.shell) { if (ia !== ib) return true; continue; }
    if (ia || ib) continue; // standing against (or in) a collider box: not "through" it
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (ax < w.minX || ax > w.maxX) continue; } else {
      let u = (w.minX - ax) / dx, v = (w.maxX - ax) / dx; if (u > v) { const s = u; u = v; v = s; }
      t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) { if (az < w.minZ || az > w.maxZ) continue; } else {
      let u = (w.minZ - az) / dz, v = (w.maxZ - az) / dz; if (u > v) { const s = u; u = v; v = s; }
      t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) continue;
    }
    return true;
  }
  return false;
}
