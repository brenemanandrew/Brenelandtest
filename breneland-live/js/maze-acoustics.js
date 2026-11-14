// Beneath Angell Street, the sound below: the acoustics of stone tunnels. Pure and import-free (tools load it in Node as a data:
// URL), all in the maze's own frame (metres, x east, z south, cells of 4 m; maze-gen.js):
//   spaceAt(maze, x, z, inShaft, out)  the kind of space a spot is: a corridor by its free run ahead and behind on the grid (a
//                                      short one, or a long straight run whose far ends answer), a room by its kind (the
//                                      cistern, the crypt, the library, the ossuary, the ritual chamber, the start and exit
//                                      rooms), the stair's shaft. `out.key` names it (a corridor's key carries its run's ends)
//   spaceParams(space, out)            how that space sounds, as settings of the echo (maze-audio.js): how much goes to the short
//                                      stone tail and to the long dark one, a darkening, three early reflections (the slapback
//                                      off the floor, the walls and the vault), a flutter between close walls, and two echoes off
//                                      the far ends of a straight run. All of them are AudioParams: a space changes by gliding,
//                                      never by swapping an impulse response (a ConvolverNode's buffer costs ~12 ms of main
//                                      thread a second of response to set: a hitch at every corner)
//   BASE_IRS, irData(sr, spec, seed)   the two stone tails, generated once on the way down: two decorrelated channels of dark
//                                      diffuse decay (the long one with the cistern's low boom); Float32Arrays
//   createField(maze)                  the stone between you and a sound: the path round the walls against the straight line,
//                                      the opening it leaks through, a lowpass by how much stone is in the way (for a few Hz,
//                                      not per frame: one breadth-first flood per cell you step into, typed arrays, no garbage)
//   t60(channel, sampleRate)           a tail's decay time (Schroeder's backward integral, -5 to -25 dB, times three): tests
export const C = 343, CELLM = 4, WIDTH = 3.4, CEIL = 3.2, EAR = 1.5;
const BIT = [1, 2, 4, 8], DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

// the two tails (rt: -60 dB, s; damp: the tail's lowpass from its start to its end, Hz; tail: its energy against the dry sound)
export const BASE_IRS = {
  short: { rt: 1.15, pre: 0.002, damp0: 6200, damp1: 1500, tail: 0.14, build: 0.015 },
  long: { rt: 4.4, pre: 0.016, damp0: 4300, damp1: 600, tail: 0.5, build: 0.06, boom: { rt: 5.4, f: 105, g: 0.45 } },
};
BASE_IRS.short.len = BASE_IRS.short.pre + BASE_IRS.short.rt * 1.05;
BASE_IRS.long.len = BASE_IRS.long.pre + BASE_IRS.long.boom.rt * 0.95;

// The places: short / long (the sends to the two tails), dark (Hz), fb / fg (the flutter's feedback and level), er (the early
// reflections' strength), run (the far ends' echoes' strength)
export const SPACES = {
  crypt:    { short: 0.28, long: 0,    dark: 3000, fb: 0.32, fg: 0.18, er: 0.3,  run: 0 },    // dry and close: a low vault, sarcophagi everywhere
  library:  { short: 0.22, long: 0,    dark: 1900, fb: 0.12, fg: 0.05, er: 0.11, run: 0 },    // deadened by books: dull and short
  stair:    { short: 0.6,  long: 0.02, dark: 5200, fb: 0.62, fg: 0.4,  er: 0.34, run: 0 },    // tight: a round shaft, a column at arm's length
  corridor: { short: 0.85, long: 0.03, dark: 6200, fb: 0.55, fg: 0.35, er: 0.3,  run: 1 },    // a tight slapback, a flutter between the walls
  long:     { short: 0.95, long: 0.1,  dark: 6000, fb: 0.58, fg: 0.36, er: 0.3,  run: 1.25 }, // the same, and the far ends answer
  ossuary:  { short: 0.7,  long: 0.14, dark: 3800, fb: 0.3,  fg: 0.15, er: 0.24, run: 0 },    // a room of bones: scattered, a little dull
  room:     { short: 0.7,  long: 0.3,  dark: 5000, fb: 0.3,  fg: 0.15, er: 0.26, run: 0 },    // the start and exit rooms
  ritual:   { short: 0.55, long: 0.45, dark: 4800, fb: 0.32, fg: 0.16, er: 0.26, run: 0 },    // the sigil's chamber: big and wet
  cistern:  { short: 0.4,  long: 1,    dark: 4300, fb: 0.5,  fg: 0.28, er: 0.42, run: 0 },    // the biggest: water under a high vault, boomy
};
export const ORDER = ['crypt', 'library', 'stair', 'corridor', 'long', 'room', 'cistern']; // tail lengths, shortest first (the test)

const rooms = new WeakMap();
function roomOf(maze) {
  let r = rooms.get(maze);
  if (r) return r;
  r = new Int8Array(maze.W * maze.H).fill(-1);
  maze.rooms.forEach((q, i) => { for (let y = q.y0; y <= q.y1; y++) for (let x = q.x0; x <= q.x1; x++) r[y * maze.W + x] = i; });
  rooms.set(maze, r);
  return r;
}
// the free run along a direction: open cells (rooms count: the far wall is what answers), at most 12
function run(maze, cx, cy, d) {
  const { W, H, cells } = maze; let n = 0, x = cx, y = cy;
  while (n < 12 && !(cells[y * W + x] & BIT[d])) { x += DX[d]; y += DY[d]; if (x < 0 || y < 0 || x >= W || y >= H) break; n++; }
  return n;
}
const qRun = n => (n <= 0 ? 0 : n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 7 ? 7 : 11); // buckets: the far ends' echoes move in steps, not every metre

export function spaceAt(maze, x, z, inShaft = false, out = {}) {
  const { W, H } = maze, cx = Math.max(0, Math.min(W - 1, Math.floor(x / CELLM))), cy = Math.max(0, Math.min(H - 1, Math.floor(z / CELLM)));
  out.cell = cy * W + cx; out.a = 0; out.b = 0; out.w = WIDTH; out.d = WIDTH; out.room = -1;
  if (inShaft) { out.kind = 'stair'; out.key = 'stair'; return out; }
  const ri = roomOf(maze)[out.cell];
  if (ri >= 0) {
    const r = maze.rooms[ri]; out.room = ri;
    out.kind = SPACES[r.kind] ? r.kind : 'room';
    out.w = (r.x1 - r.x0 + 1) * CELLM - 0.6; out.d = (r.y1 - r.y0 + 1) * CELLM - 0.6;
    out.key = out.kind === 'room' ? 'room' : out.kind;
    return out;
  }
  // a corridor: the free length ahead and behind along its longer axis (a junction takes the longer of its two)
  const e = run(maze, cx, cy, 1), w = run(maze, cx, cy, 3), s = run(maze, cx, cy, 2), n = run(maze, cx, cy, 0);
  const [a, b] = e + w >= n + s ? [e, w] : [s, n];
  const qa = qRun(Math.min(a, b)), qb = qRun(Math.max(a, b));
  out.kind = a + b + 1 >= 6 ? 'long' : 'corridor';
  out.a = qa; out.b = qb;
  out.key = `${out.kind}:${qa}:${qb}`;
  return out;
}

// How a space sounds (out is reused: er [[delay s, gain] x3], flut { d, fb, g }, run [[delay s, gain] x2])
export function spaceParams(sp, out = { er: [[0, 0], [0, 0], [0, 0]], flut: { d: 0, fb: 0, g: 0 }, run: [[0, 0], [0, 0]] }) {
  const q = SPACES[sp.kind] || SPACES.corridor, E = q.er;
  out.kind = sp.kind; out.key = sp.key; out.short = q.short; out.long = q.long; out.dark = q.dark;
  const set = (a, d, g) => { a[0] = d; a[1] = g; };
  if (sp.kind === 'corridor' || sp.kind === 'long') {
    // the slapback: the floor, both walls and the vault within ten milliseconds; the walls answering each other
    set(out.er[0], 2 * EAR / C, E * 1.05); set(out.er[1], WIDTH / C, E); set(out.er[2], 2 * (CEIL - EAR) / C + 0.0006, E * 0.7);
    out.flut.d = 2 * WIDTH / C;
  } else if (sp.kind === 'stair') {
    set(out.er[0], 2 * 0.9 / C, E); set(out.er[1], 2 * 1.5 / C, E * 0.9); set(out.er[2], 2 * 1.2 / C, E * 0.65);
    out.flut.d = 2 * 1.68 / C;
  } else if (sp.kind === 'crypt') {
    set(out.er[0], 0.004, E); set(out.er[1], 0.0062, E * 0.85); set(out.er[2], 0.0085, E * 0.65);
    out.flut.d = 2 * 2.6 / C;
  } else {
    // a room: off the floor, and the walls either side of you near the middle; the cistern's high vault for its flutter
    // (a library answers off the shelves along both its long walls, the same distance each side, whichever way it lies: with a
    // 2x4 one the two reflections came apart and its click rang as long as the stair's; w16-phase4)
    const lib = sp.kind === 'library' ? Math.min(sp.w || 7.4, sp.d || 7.4) : 0, w = lib || sp.w || 7.4, d = lib || sp.d || 7.4;
    set(out.er[0], 2 * EAR / C, E * (sp.kind === 'cistern' ? 1.1 : 0.9)); set(out.er[1], w / C, E); set(out.er[2], d / C, E * 0.9);
    out.flut.d = sp.kind === 'cistern' ? 2 * 4.6 / C : sp.kind === 'library' ? 0.03 : Math.min(w, d) / C;
  }
  out.flut.fb = q.fb; out.flut.g = q.fg;
  // the far ends of a straight run: an echo each way (from the cell's middle to the far wall and back), the second one quieter
  for (let i = 0; i < 2; i++) {
    const n = i ? sp.b : sp.a, m = (n + 0.5) * CELLM + 0.3, t = 2 * m / C;
    if (!q.run || t < 0.03) set(out.run[i], 0.05, 0);
    else set(out.run[i], Math.min(0.38, t), 0.42 * q.run / (1 + m / 16));
  }
  return out;
}

// a stone tail: noise under an exponential decay (-60 dB at rt), filling in over `build`, darkening as it goes; the boom (the
// long one's) a low band ringing on longer; two decorrelated channels, energy `tail` against the dry sound
export function irData(sr, spec, seed = 1) {
  const n = Math.max(64, Math.ceil(spec.len * sr)), out = [new Float32Array(n), new Float32Array(n)], tmp = spec.boom ? new Float32Array(n) : null;
  for (let ch = 0; ch < 2; ch++) {
    const d = out[ch];
    let h = ((seed * 2654435761) ^ (ch + 1) * 40503) >>> 0 || 1;
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296 * 2 - 1; };
    const p0 = Math.floor(spec.pre * sr), dec = Math.pow(10, -3 / (spec.rt * sr)), build = Math.max(1, spec.build * sr);
    let env = 1, y = 0, y2 = 0, k = 0, e = 0;
    for (let i = p0; i < n; i++) {
      if (((i - p0) & 63) === 0) { const tt = (i - p0) / sr, fc = spec.damp0 * Math.pow(spec.damp1 / spec.damp0, Math.min(1, tt / spec.rt)); k = 1 - Math.exp(-2 * Math.PI * fc / sr); }
      y += k * (rnd() - y); y2 += k * (y - y2);
      const v = y2 * env * (i - p0 < build ? (i - p0) / build : 1);
      d[i] = v; e += v * v; env *= dec;
    }
    const tk = e > 0 ? Math.sqrt(spec.tail / e) : 0;
    for (let i = p0; i < n; i++) d[i] *= tk;
    if (spec.boom) {
      const b = spec.boom, bd = Math.pow(10, -3 / (b.rt * sr)), kb = 1 - Math.exp(-2 * Math.PI * b.f / sr);
      let be = 1, l1 = 0, l2 = 0, l3 = 0, eb = 0;
      for (let i = p0; i < n; i++) { l1 += kb * (rnd() - l1); l2 += kb * (l1 - l2); l3 += kb * (l2 - l3); const v = l3 * be * (i - p0 < build * 2 ? (i - p0) / (build * 2) : 1); tmp[i] = v; eb += v * v; be *= bd; }
      const kk = eb > 0 ? Math.sqrt(spec.tail * b.g / eb) : 0;
      for (let i = p0; i < n; i++) d[i] += tmp[i] * kk;
    }
  }
  return out;
}

// the decay time of one channel: Schroeder's integral, the -5..-25 dB slope extrapolated to -60
export function t60(d, sr) {
  const n = d.length, edc = new Float64Array(n);
  let s = 0; for (let i = n - 1; i >= 0; i--) { s += d[i] * d[i]; edc[i] = s; }
  if (s <= 0) return 0;
  const db = i => 10 * Math.log10(edc[i] / s);
  let i5 = 0; while (i5 < n - 1 && db(i5) > -5) i5++;
  let i25 = i5; while (i25 < n - 1 && db(i25) > -25) i25++;
  return ((i25 - i5) / sr) * 3;
}

// ---- the stone between: a flood from your cell (per cell you step into), a line of sight on the grid, the opening it leaks through
export function createField(maze) {
  const { W, H, cells } = maze, N = W * H;
  const dist = new Int16Array(N).fill(-1), next = new Int32Array(N), q = new Int32Array(N);
  let lc = -1, lx = 0, lz = 0, floods = 0;
  const cellOf = (x, z) => Math.max(0, Math.min(H - 1, Math.floor(z / CELLM))) * W + Math.max(0, Math.min(W - 1, Math.floor(x / CELLM)));
  function flood(c) {
    dist.fill(-1); dist[c] = 0; next[c] = c; let hd = 0, tl = 0; q[tl++] = c; floods++;
    while (hd < tl) {
      const u = q[hd++], ux = u % W, uy = (u - ux) / W;
      for (let k = 0; k < 4; k++) {
        if (cells[u] & BIT[k]) continue;
        const nx = ux + DX[k], ny = uy + DY[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const v = ny * W + nx; if (dist[v] >= 0) continue;
        dist[v] = dist[u] + 1; next[v] = u; q[tl++] = v;
      }
    }
  }
  function setListener(x, z) { lx = x; lz = z; const c = cellOf(x, z); if (c !== lc) { lc = c; flood(c); } }
  const wallAt = (cx, cy, k) => (cx < 0 || cy < 0 || cx >= W || cy >= H) ? true : (cells[cy * W + cx] & BIT[k]) !== 0;
  // a line on the grid (Amanatides-Woo): blocked by any wall edge it crosses; through a corner either way round will do
  function los(ax, az, bx, bz) {
    let cx = Math.floor(ax / CELLM), cy = Math.floor(az / CELLM);
    const tx = Math.floor(bx / CELLM), ty = Math.floor(bz / CELLM), dx = bx - ax, dz = bz - az;
    const sx = dx > 0 ? 1 : -1, sy = dz > 0 ? 1 : -1, kx = dx > 0 ? 1 : 3, ky = dz > 0 ? 2 : 0;
    let tmx = dx !== 0 ? (sx > 0 ? (cx + 1) * CELLM - ax : ax - cx * CELLM) / Math.abs(dx) : Infinity;
    let tmy = dz !== 0 ? (sy > 0 ? (cy + 1) * CELLM - az : az - cy * CELLM) / Math.abs(dz) : Infinity;
    const tdx = dx !== 0 ? CELLM / Math.abs(dx) : Infinity, tdy = dz !== 0 ? CELLM / Math.abs(dz) : Infinity;
    for (let g = 0; g < 80; g++) {
      if (cx === tx && cy === ty) return true;
      if (tmx > 1 && tmy > 1) return true;
      if (Math.abs(tmx - tmy) < 1e-9) {
        const a = !wallAt(cx, cy, kx) && !wallAt(cx + sx, cy, ky), b = !wallAt(cx, cy, ky) && !wallAt(cx, cy + sy, kx);
        if (!a && !b) return false;
        cx += sx; cy += sy; tmx += tdx; tmy += tdy;
      } else if (tmx < tmy) { if (wallAt(cx, cy, kx)) return false; cx += sx; tmx += tdx; }
      else { if (wallAt(cx, cy, ky)) return false; cy += sy; tmy += tdy; }
    }
    return false;
  }
  const midX = c => (c % W) * CELLM + CELLM / 2, midZ = c => Math.floor(c / W) * CELLM + CELLM / 2; // (no arrays: this runs a few times a second)
  // where a sound at (sx, sz) seems to come from: out.x/z (the opening's direction, at `use` 'path' or 'straight' distance),
  // out.cut (Hz), out.k (the loss round the corners), out.path / out.straight (m), out.open (in sight), out.rock (through the stone)
  function query(sx, sz, out = {}, use = 'path') {
    const st = Math.hypot(sx - lx, sz - lz);
    out.straight = st; out.rock = false; out.via = -1;
    if (lc < 0 || los(lx, lz, sx, sz)) { out.open = true; out.x = sx; out.z = sz; out.path = st; out.cut = 16000 / (1 + st / 45); out.k = 1; return out; }
    out.open = false;
    const sc = cellOf(sx, sz), dc = dist[sc];
    const scx = midX(sc), scz = midZ(sc), lcx = midX(lc), lcz = midZ(lc);
    const P = dc < 0 ? Infinity : Math.max(st, dc * CELLM + Math.hypot(sx - scx, sz - scz) * 0.7 + Math.hypot(lx - lcx, lz - lcz) * 0.7);
    if (!(P <= 5 * st + 10)) { // round about a long way or not at all: what you hear comes through the rock, a dull thump
      out.rock = true; out.x = sx; out.z = sz; out.path = P; out.cut = 240; out.k = 0.3; return out;
    }
    // walk back along the way from the source toward you until a cell you can see: the sound comes out of that opening
    let c = sc, prev = sc, ox = scx, oz = scz;
    for (let g = 0; g < 64 && c !== lc; g++) {
      if (los(lx, lz, midX(c), midZ(c))) break;
      prev = c; c = next[c];
    }
    if (c !== sc) { ox = (midX(prev) + midX(c)) / 2; oz = (midZ(prev) + midZ(c)) / 2; out.via = c; }
    let ddx = ox - lx, ddz = oz - lz, dl = Math.hypot(ddx, ddz);
    if (dl < 0.3) { ddx = sx - lx; ddz = sz - lz; dl = Math.max(1e-6, Math.hypot(ddx, ddz)); }
    const D = use === 'straight' ? st : P;
    out.x = lx + ddx / dl * D; out.z = lz + ddz / dl * D; out.path = P;
    const excess = Math.max(0, P - st);
    out.cut = Math.max(280, Math.min(14000, 14000 * Math.exp(-excess / 6)));
    out.k = Math.max(0.3, Math.min(1, Math.sqrt(st / P) * 1.1));
    return out;
  }
  return {
    setListener, query, los, cellOf,
    get cell() { return lc; }, get floods() { return floods; },
    pathTo(c) { return lc < 0 ? -1 : dist[c]; },   // cells by path from your cell (-1 unreachable)
  };
}
