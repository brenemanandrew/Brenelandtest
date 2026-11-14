// Beneath Angell Street, the sound below: the SPACE of real stone tunnels, where every sound you make comes back to you and the
// walls are alive with small things you never see. Procedural (no files), positional where it comes from a place, all under the
// existing sliders.
//
//   the echo         a convolution reverb for stone, generated (maze-acoustics.js): two convolvers holding fixed stone tails (a
//                    short one; a long dark one with a low boom), filled once on the way down, and in front of them what makes a
//                    place itself, all AudioParams that glide as you move (the sends crossfade between the two tails, a darkening,
//                    three early reflections, a flutter, the far ends' echoes): a corridor (a tight slapback, a flutter between the
//                    close walls, a longer echo off the far ends of a long straight run, measured on the grid ahead and behind), a
//                    room (bigger and wetter: the cistern biggest and boomy, the library deadened by books, the crypt dry and close),
//                    the stair's shaft (tight). Nothing is swapped as you move: no click, no stalled frame (a ConvolverNode's buffer
//                    costs ~12 ms of main thread a second of response to set). EVERYTHING below goes through it: the bed, the rats,
//                    your steps and splashes, breath and the lantern's creak, your friends' steps and lanterns, the drone, and
//                    anything played with `play()` / `at()` / `send()` (the ghoul's sounds: see below).
//   the walls        a sound round a corner or behind a wall is muffled by the stone in the way (a lowpass by the path round the
//                    walls against the straight line) and comes from the opening it leaks through, not through the stone; what has
//                    no way round comes through the rock as a dull thump (maze-acoustics.js createField, a few Hz, not per frame)
//   the rats         never seen: claws scurrying along inside a wall beside you (a short run that moves past you), a squeak or two,
//                    a pause, another run further off; sometimes a patter of several across the ceiling. They go quiet when
//                    something is near (fx.hush, fx.threat) and stay quiet a while after: something scared them
//   and so on        sparse and placed, each room its own: drips at different pitches (a tick on stone, a plink in a puddle, a
//                    deeper plop in the pools), water trickling in the cistern and the flooded cells, a pebble falling and
//                    skittering, a chain clinking far off, a gate creaking on its hinge, a far muffled thud, wind moaning through
//                    a grate, moths ticking on the lantern's glass, the ossuary's bones settling, pages and a shelf in the library,
//                    dust trickling in the crypt, the yard far above near the stairs (a muffled bird, the wind), the torches, the
//                    sigil's hum, a far rumble, a stone settling; and the dread drone (cello, bowed metal, a detuned piano)
//   silence          long quiet stretches: a slow "mood" drifts between near silence and a little life, notable sounds keep a few
//                    seconds apart, the louder things are rare; the small things go quiet first when the ghoul is near
//
// The buses go into the engine's own nodes: the bed and the rats -> ambDuck (Ambience), you and your friends -> sfx (Effects), the
// drone -> musicDuck (Music); the echo's sends follow the same sliders (mirrored) and its return goes into the master, so the
// master and the mute reach it all. The yard's own two reverbs (audio.verbIn, audio.ambVerbIn) are turned down while below, so
// at most two convolvers run (ours). Budget: BUDGET below (voices, convolvers, how often the walls between are worked out).
//
// The ghoul's sounds: `scene.atmos.aud.play(name, x, y, z, opts)` is a drop-in for `audio.play` that muffles a sound by the stone
// in the way, sends it from the opening and through the echo (its loudness stays the caller's: the ghoul already scales by the
// path). `aud.at(x, y, z)` is a node with the stone's full say (the way round's distance and loss too), `aud.send(node, amount)`
// puts any node of your own into the echo, `aud.engine` is the engine as seen from below (its at(), atAmb(), sfx, amb, verbIn lead
// here), and `aud.occlude(x, y, z)` says where a world position sounds from. docs/CONTRACTS.md, "Changes by w16-sound".
import { spaceAt, spaceParams, irData, BASE_IRS, createField, CELLM, CEIL } from './maze-acoustics.js';

// voices: one-shots and loops sounding at once (a quiet one is dropped at the cap, yours and the drone take the oldest's place);
// convolvers: ours (the yard's two rest below); fieldHz: how often the loops' walls-between are worked out again
export const BUDGET = { voices: { phone: 24, pc: 48 }, convolvers: 2, fieldHz: 4 };
const rand = (a, b) => a + Math.random() * (b - a);
const BIT = [1, 2, 4, 8];
// the "small things": they go quiet first when something is near
export const SMALL = new Set(['rat-run', 'rat-squeak', 'pebble', 'chain', 'moths', 'bones', 'pages', 'shelf', 'dust', 'bird', 'settle']);
// each room's own sounds: only ever from inside that room (the yard above: the stair's shaft or the exit's daylight)
export const ROOM_SOUNDS = { bones: 'ossuary', pages: 'library', shelf: 'library', dust: 'crypt', bird: 'above', hum: 'ritual' };
const NOTABLE = new Set(['rumble', 'settle', 'pebble', 'chain', 'gate', 'thud', 'moan', 'moths', 'bones', 'pages', 'shelf', 'dust', 'bird', 'rats']);

// ---------------------------------------------------------------- the schedule: time in, events out (pure; the live sound and
// the tests' ten-minute simulation each run one). Positions in the maze's frame, y from the floor.
export function createSchedule(maze, kit, field, emit, { cracks = [] } = {}) {
  const { W, H, cells } = maze;
  const by = {}; for (const r of maze.rooms) (by[r.kind] || (by[r.kind] = [])).push(r); // (every room of a kind: a week's maze may have two libraries, w16-phase4)
  const realTorches = (kit.torches || []).filter(t => t.color === '#ffb060');
  const st0 = kit.stair ? { x: kit.stair.cx, z: kit.stair.cz } : { x: (maze.startRoom.x0 + 1) * CELLM, z: (maze.startRoom.y0 + 1) * CELLM };
  const door = kit.exitStair?.door ? { x: kit.exitStair.door.x, z: kit.exitStair.door.z } : { x: (maze.exitRoom.x0 + 1) * CELLM, z: (maze.exitRoom.y0 + 1) * CELLM };
  const next = { drip: 0, rumble: 0, settle: 0, pebble: 0, chain: 0, gate: 0, thud: 0, moan: 0, moths: 0, bones: 0, pages: 0, shelf: 0, dust: 0, bird: 0, crackle: 0, rats: 0, cello: 0, metal: 0, piano: 0, mood: 0 };
  const queue = [];      // future parts of a rats' bout (cleared when something scares them)
  let inited = false, mood = 0.6, moodAim = 0.6, lastNotable = -99, scaredUntil = -99, T = 0;
  const S = { x: 0, z: 0, yaw: 0, lit: 0, hush: 0, threat: 0 };

  const cellC = c => { const x = c % W; return { x: x * CELLM + CELLM / 2, z: (c - x) / W * CELLM + CELLM / 2 }; };
  const nearRoom = (kind, max) => {
    let best = 1e9, room = null; // (the nearest of its kind by path)
    for (const r of by[kind] || []) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { const d = field.pathTo(y * W + x); if (d >= 0 && d < best) { best = d; room = r; } }
    return best <= max ? room : null;
  };
  const inRoom = (r, y0, y1) => ({ x: rand(r.x0 * CELLM + 0.9, (r.x1 + 1) * CELLM - 0.9), y: rand(y0, y1), z: rand(r.y0 * CELLM + 0.9, (r.y1 + 1) * CELLM - 0.9) });
  // a cell between min and max cells away by path (a few tries in a box round you)
  function spotAt(min, max) {
    const lc = field.cell, lx = lc % W, ly = (lc - lx) / W;
    for (let k = 0; k < 24; k++) {
      const x = lx + Math.round(rand(-max, max)), y = ly + Math.round(rand(-max, max));
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = field.pathTo(y * W + x); if (d >= min && d <= max) return y * W + x;
    }
    let pick = -1, n = 0; // (a corner of the maze: look at the whole box)
    for (let y = Math.max(0, ly - max); y <= Math.min(H - 1, ly + max); y++) for (let x = Math.max(0, lx - max); x <= Math.min(W - 1, lx + max); x++) { const d = field.pathTo(y * W + x); if (d >= min && d <= max && Math.random() * ++n < 1) pick = y * W + x; }
    return pick;
  }
  const quiet = () => S.hush > 0.12 || S.threat > 0.3;
  const ev = (name, t, x, y, z, p = null) => ({ name, t, x, y, z, p });
  const out = e => { if (e) emit(e); return e; };

  // ---- the spawners (each returns its event, or null when it has no place here)
  function drip(t, near) {
    const lc = field.cell, lx = lc % W, ly = (lc - lx) / W;
    for (let k = 0; k < 12; k++) { // 12 tries, not 4: by the maze's edge most random cells fall outside it, and a drip there failed one time in six
      const x = lx + Math.round(rand(-5, 5)), y = ly + Math.round(rand(-5, 5));
      if (x < 0 || y < 0 || x >= W || y >= H || (!near && Math.abs(x - lx) + Math.abs(y - ly) < 2)) continue;
      const wet = maze.water[y * W + x], r = Math.random();
      const kind = wet ? (r < 0.6 ? 'plop' : 'plink') : (r < 0.22 ? 'plink' : 'tick');
      const f = kind === 'plop' ? rand(340, 680) : kind === 'plink' ? rand(1200, 2500) : rand(1700, 2900);
      return ev('drip', t, x * CELLM + rand(0.6, 3.4), wet ? -0.3 : 0, y * CELLM + rand(0.6, 3.4), { kind, f, near: false });
    }
    return null;
  }
  const around = (r0, r1, y0, y1) => { const a = rand(0, 6.28), r = rand(r0, r1); return [S.x + Math.cos(a) * r, rand(y0, y1), S.z + Math.sin(a) * r]; };
  const SPAWN = {
    drip: t => drip(t, false),
    rumble: t => { const [x, y, z] = around(16, 26, 1, 1); return ev('rumble', t, x, y, z, { dur: rand(4, 6.5), f: rand(70, 110), low: rand(34, 44) }); },
    settle: t => { const [x, y, z] = around(6, 14, 1.5, 3); return ev('settle', t, x, y, z, { n: 4 + Math.floor(rand(0, 5)), f: rand(60, 85) }); },
    pebble: t => { const c = spotAt(1, 3); if (c < 0) return null; const p = cellC(c); return ev('pebble', t, p.x + rand(-1.4, 1.4), rand(0, 0.2), p.z + rand(-1.4, 1.4), { n: 3 + Math.floor(rand(0, 4)), gap: rand(0.16, 0.26), skit: 4 + Math.floor(rand(0, 6)) }); },
    chain: t => { const c = spotAt(4, 8); if (c < 0) return null; const p = cellC(c); return ev('chain', t, p.x, rand(1.2, 2.6), p.z, { n: 2 + Math.floor(rand(0, 3)), f: rand(900, 1700) }); },
    gate: t => {
      let best = null, bd = 13;
      for (const g of maze.gates) { const d = field.pathTo(g.cy * W + g.cx); if (d >= 0 && d < bd) { bd = d; best = g; } }
      if (!best) return null;
      const DXg = [0, 1, 0, -1][best.dir], DZg = [-1, 0, 1, 0][best.dir];
      return ev('gate', t, best.cx * CELLM + 2 + DXg * 2, 1.4, best.cy * CELLM + 2 + DZg * 2, { two: Math.random() < 0.5, k: rand(0.7, 1), gap: rand(0.6, 1.4), f: rand(140, 220) });
    },
    thud: t => { const c = spotAt(6, 12); if (c < 0) return null; const p = cellC(c); return ev('thud', t, p.x, rand(0.5, 2.5), p.z, { f: rand(42, 58) }); },
    moan: t => {
      let best = null, bd = 8;
      for (const c of cracks) { const d = field.pathTo(field.cellOf(c.x, c.z)); if (d >= 0 && d < bd) { bd = d; best = c; } }
      return best ? ev('moan', t, best.x, best.y, best.z, { f: rand(170, 230), top: rand(260, 380), dur: rand(4, 7) }) : null;
    },
    moths: t => { if (S.lit < 0.5) return null; const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw), rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw); return ev('moths', t, S.x + fx * 0.62 + rx * 0.27, 1.25, S.z + fz * 0.62 + rz * 0.27, { n: 3 + Math.floor(rand(0, 6)), wing: rand(26, 36), d: rand(0.4, 0.9) }); },
    bones: t => { const r = nearRoom('ossuary', 4); if (!r) return null; const p = inRoom(r, 0.1, 1.6); return ev('bones', t, p.x, p.y, p.z, { n: 2 + Math.floor(rand(0, 3)), roll: Math.random() < 0.3, f: rand(600, 1100) }); },
    pages: t => { const r = nearRoom('library', 4); if (!r) return null; const p = inRoom(r, 0.4, 2.0); return ev('pages', t, p.x, p.y, p.z, { n: 1 + Math.floor(rand(0, 3)), f: rand(2800, 4200) }); },
    shelf: t => { const r = nearRoom('library', 4); if (!r) return null; const p = inRoom(r, 1.0, 2.4); return ev('shelf', t, p.x, p.y, p.z, { k: rand(0.45, 0.65), knock: rand(0.4, 0.8), f: rand(80, 105) }); },
    dust: t => { const r = nearRoom('crypt', 4); if (!r) return null; const p = inRoom(r, 2.0, 2.6); return ev('dust', t, p.x, p.y, p.z, { dur: rand(1, 2.4) }); },
    bird: t => {
      const a = nearRoom('start', 3), b = nearRoom('exit', 3); if (!a && !b) return null;
      const up = a && (!b || Math.hypot(S.x - st0.x, S.z - st0.z) < Math.hypot(S.x - door.x, S.z - door.z));
      return up ? ev('bird', t, st0.x, 7.4, st0.z, { n: 2 + Math.floor(rand(0, 3)), f: rand(2600, 3800), where: 'stair' }) : ev('bird', t, door.x, 4.5, door.z, { n: 2 + Math.floor(rand(0, 3)), f: rand(2600, 3800), where: 'exit' });
    },
    crackle: t => {
      let tn = null, td = 9; for (const q of realTorches) { const d = Math.hypot(q.x - S.x, q.z - S.z); if (d < td) { td = d; tn = q; } }
      return tn ? ev('crackle', t, tn.x, tn.y + 0.1, tn.z, { f: rand(1800, 5200), d: rand(0.006, 0.02), pop: Math.random() < 0.15 }) : null;
    },
    cello: t => ev('cello', t + 0.05, S.x, 0, S.z, { f: [55, 58.27, 65.41, 73.42, 61.74][Math.floor(rand(0, 5))], hold: rand(4, 7), att: rand(2.8, 4), rel: rand(4, 6), vib: rand(4.2, 5.2) }),
    metal: t => ev('metal', t + 0.05, S.x, 0, S.z, { f: rand(380, 520), att: rand(2, 3.5), hold: rand(2, 4), rel: rand(3.5, 5) }),
    piano: t => ev('piano', t + 0.05, S.x, 0, S.z, { f: [146.83, 155.56, 110, 116.54, 185][Math.floor(rand(0, 5))], v: rand(0.75, 1), det: rand(7, 13) }),
    rats: t => bout(t, forceOpt),
  };
  const GAP = { // seconds to the next one; `m` true: thinned by the mood (the long quiet stretches)
    drip: [0.9, 3.4], rumble: [28, 90], settle: [20, 70, 1], pebble: [40, 130, 1], chain: [70, 220, 1], gate: [60, 200], thud: [70, 240],
    moan: [40, 140], moths: [30, 100, 1], bones: [8, 30, 1], pages: [10, 34, 1], shelf: [25, 85, 1], dust: [12, 40, 1], bird: [12, 42, 1],
    crackle: [0.06, 0.45], rats: [20, 65, 1], cello: [12, 36], metal: [20, 64], piano: [16, 56],
  };
  const KEYS = Object.keys(GAP);

  // ---- the rats: a bout is a run along the wall beside you, a squeak or two, a pause, another run further off; or a ceiling patter
  function wallRun(c, beside) {
    const cx = c % W, cy = (c - cx) / W, cl = cells[c];
    const rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw);
    let side = -1, best = -1;
    for (let k = 0; k < 4; k++) { if (!(cl & BIT[k])) continue; const nx = [0, 1, 0, -1][k], nz = [-1, 0, 1, 0][k], sc = (beside ? Math.abs(nx * rx + nz * rz) : 0.5) + Math.random() * 0.3; if (sc > best) { best = sc; side = k; } }
    if (side < 0) return null;
    const alongX = side === 0 || side === 2; // a north or south wall runs east-west
    let lo = alongX ? cx : cy, hi = lo;
    const has = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (cells[y * W + x] & BIT[side]);
    while (lo > 0 && hi - lo < 4 && (alongX ? has(lo - 1, cy) : has(cx, lo - 1))) lo--;
    while (hi - lo < 4 && (alongX ? has(hi + 1, cy) : has(cx, hi + 1))) hi++;
    const line = side === 0 ? cy * CELLM : side === 2 ? (cy + 1) * CELLM : side === 1 ? (cx + 1) * CELLM : cx * CELLM;
    const a0 = lo * CELLM + 0.4, a1 = (hi + 1) * CELLM - 0.4, me = alongX ? S.x : S.z;
    const dir = Math.random() < 0.5 ? 1 : -1;
    let s = Math.max(a0, Math.min(a1, me - dir * rand(2.5, 4))), e = Math.max(a0, Math.min(a1, me + dir * rand(2.5, 4)));
    if (Math.abs(e - s) < 2) { s = dir > 0 ? a0 : a1; e = dir > 0 ? a1 : a0; }
    const off = rand(-0.12, 0.12), y = Math.random() < 0.75 ? rand(0.2, 1.4) : rand(2.1, 2.9);
    return alongX ? { x: s, z: line + off, x1: e, z1: line + off, y } : { x: line + off, z: s, x1: line + off, z1: e, y };
  }
  function runEv(t, w, far) {
    const len = Math.hypot(w.x1 - w.x, w.z1 - w.z), dur = Math.max(0.6, Math.min(2.2, len / rand(2.4, 3.6)));
    return { name: 'rat-run', t, x: w.x, y: w.y, z: w.z, x1: w.x1, z1: w.z1, dur, p: { clip: Math.floor(rand(0, 4)), rate: rand(0.88, 1.14), far, ceiling: false } };
  }
  let forceOpt = null; // (tests: { ceiling: true } or { wall: true })
  function bout(t, opt = null) {
    if (quiet() || t < scaredUntil) return null;
    queue.length = 0;
    const lc = field.cell, fx = Math.sin(S.yaw), fz = Math.cos(S.yaw), rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw);
    let first = null;
    if (!opt?.wall && (opt?.ceiling || Math.random() < 0.22 || !(cells[lc] & 15))) { // a patter of several across the ceiling, crossing over you
      const n = 2 + (Math.random() < 0.4 ? 1 : 0), sgn = Math.random() < 0.5 ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const a = rand(2, 4) * sgn, b = rand(-2, 2), a2 = rand(2, 4) * sgn, b2 = rand(-2, 2), w = { x: S.x + rx * a + fx * b, z: S.z + rz * a + fz * b, x1: S.x - rx * a2 + fx * b2, z1: S.z - rz * a2 + fz * b2, y: CEIL + 0.3 };
        const e = runEv(t + i * rand(0.08, 0.4), w, false); e.p.ceiling = true; e.dur = Math.max(0.7, e.dur * 0.8);
        queue.push(e); if (!first) first = e;
      }
    } else {
      const w = wallRun(lc, true); if (!w) return null;
      first = runEv(t, w, false); queue.push(first);
      let tt = t + first.dur + rand(0.2, 0.8);
      const sq = Math.random() < 0.4 ? 0 : Math.random() < 0.67 ? 1 : 2;
      for (let i = 0; i < sq; i++) { queue.push({ name: 'rat-squeak', t: tt, x: w.x1, y: w.y, z: w.z1, p: { n: 1 + Math.floor(rand(0, 3)), f: rand(3800, 6000) } }); tt += rand(0.25, 0.9); }
      tt += rand(1.5, 5);
      if (Math.random() < 0.55) { const c = spotAt(2, 4); const w2 = c >= 0 ? wallRun(c, false) : null; if (w2) queue.push(runEv(tt, w2, true)); }
    }
    queue.sort((a, b) => a.t - b.t);
    return first;
  }

  function init(t) {
    inited = true;
    for (const k of KEYS) next[k] = t + rand(GAP[k][0], GAP[k][1]) * (k === 'drip' ? 0.5 : k === 'cello' ? 0.3 : k === 'rats' ? 0.4 : 0.6);
    next.drip = t + 1.5; next.crackle = t; next.mood = t + rand(20, 60);
  }
  function fire(k, t) {
    const e = SPAWN[k](t);
    if (k === 'rats') { if (!e) return false; lastNotable = t; return true; } // (its parts come out of the queue)
    if (!e) return false;
    out(e); if (NOTABLE.has(k)) lastNotable = t;
    return true;
  }
  // one step of the clock (st: { me: { x, z, yaw, inShaft }, lit, hush, threat })
  function tick(t, st) {
    T = t; S.x = st.me.x; S.z = st.me.z; S.yaw = st.me.yaw || 0; S.lit = st.lit ?? 1; S.hush = st.hush || 0; S.threat = st.threat || 0;
    if (!inited) init(t);
    // the mood: a slow drift between near silence and a little life
    if (t > next.mood) { next.mood = t + rand(25, 80); moodAim = Math.random() < 0.35 ? rand(0.2, 0.4) : rand(0.55, 1); }
    mood += (moodAim - mood) * 0.02;
    const q = quiet();
    if (q) { scaredUntil = Math.max(scaredUntil, t + rand(15, 30)); if (queue.length) queue.length = 0; }
    // the rats' bout, part by part
    while (queue.length && queue[0].t <= t + 0.05) out(queue.shift());
    for (let i = 0; i < KEYS.length; i++) {
      const k = KEYS[i];
      if (t < next[k]) continue;
      const g = GAP[k], thin = g[2] ? 1 / Math.max(0.2, mood) : 1;
      next[k] = t + rand(g[0], g[1]) * thin * (k === 'drip' ? 1 + 0.4 * (1 - mood) : 1) * (k === 'cello' || k === 'metal' ? 1 - 0.45 * S.threat : 1);
      if ((k === 'cello' || k === 'metal' || k === 'piano') && S.lit < 0.5) continue;
      if (SMALL.has(k === 'rats' ? 'rat-run' : k) && q) { next[k] = t + rand(4, 10); continue; }  // the small things wait
      if (NOTABLE.has(k) && t - lastNotable < 3) { next[k] = t + rand(2, 6); continue; } // never two notable things at once
      fire(k, t);
    }
  }
  return {
    tick, next, queue,
    drain(t, st) { S.hush = st.hush || 0; S.threat = st.threat || 0; if (quiet()) { queue.length = 0; return; } while (queue.length && queue[0].t <= t + 0.05) out(queue.shift()); },
    force(k, t, st, opt = null) { forceOpt = opt; if (st) { S.x = st.me.x; S.z = st.me.z; S.yaw = st.me.yaw || 0; S.lit = st.lit ?? 1; S.hush = st.hush || 0; S.threat = st.threat || 0; } if (!inited) init(t); if (SMALL.has(k === 'rats' ? 'rat-run' : k) && quiet()) return false; const ok = SPAWN[k] ? fire(k, t) : false; if (k === 'rats') while (queue.length && queue[0].t <= t + 0.05) out(queue.shift()); forceOpt = null; return ok; },
    get mood() { return mood; }, get scared() { return T < scaredUntil; },
  };
}

// ---------------------------------------------------------------- the live sound
export function createMazeAudio(audio, { maze, kit, origin, phone = false, remotes = null }) {
  const { W, H } = maze;
  const CAP = phone ? BUDGET.voices.phone : BUDGET.voices.pc;
  const live = new Set();
  const routes = {};
  const stat = { drips: 0, nearDrips: 0, rumbles: 0, settles: 0, crackles: 0, cello: 0, metal: 0, piano: 0, steps: 0, splashes: 0, creaks: 0, breaths: 0,
    rats: 0, squeaks: 0, pebbles: 0, chains: 0, gates: 0, thuds: 0, moans: 0, moths: 0, bones: 0, pages: 0, shelves: 0, dust: 0, birds: 0, friendSteps: 0, friendCreaks: 0,
    played: 0, sent: 0, dropped: 0, spaces: 0, convolvers: 0, maxVoices: 0 };
  const events = []; // the last 300 (tests)
  let ctx = null, disposed = false, echoIn = null, echoOut = null, verbSaved = null;
  const B = {};
  const field = createField(maze), Q = {}, SP = {};
  const cur = { want: null, wantAt: 0, kind: null, key: null };
  const voiceEnd = new Float64Array(CAP);
  const emitters = [];
  let fieldAt = 0, inRoomK = 1, lastSt = null, toneLoop = null, fire = null, hum = null;
  const aim = { drone: -1, hum: -1 };
  const winds = new Map(), trickles = new Map(), aboves = new Map();
  const friends = new Map();
  const cells = maze.cells;

  // deterministic cracks: about one wall in thirty, the wind in it at head height (the same on every screen)
  const cracks = [];
  { let h = maze.seed >>> 0; const rnd = () => { h = (h + 0x6d2b79f5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) { const c = cells[cy * W + cx]; if (rnd() > 0.035) continue; for (let s = 0; s < 4; s++) if (c & BIT[s]) { const dx = [0, 1, 0, -1][s], dz = [-1, 0, 1, 0][s]; cracks.push({ x: cx * CELLM + 2 + dx * 1.7, y: 2.1, z: cy * CELLM + 2 + dz * 1.7, f: 520 + rnd() * 700 }); break; } } }
  const realTorches = (kit.torches || []).filter(t => t.color === '#ffb060');
  const roomCell = new Uint8Array(W * H); for (const r of maze.rooms) if (r.kind !== 'start') for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) roomCell[y * W + x] = 1;
  const ritual = maze.rooms.find(r => r.kind === 'ritual'), sigilAt = ritual ? { x: (ritual.x0 + ritual.x1 + 1) * 2, z: (ritual.y0 + ritual.y1 + 1) * 2 } : null;
  // water to trickle: the cistern (one spot, its middle) and each flooded corridor cell
  const cis = maze.rooms.find(r => r.kind === 'cistern');
  const waters = []; if (cis) waters.push({ x: (cis.x0 + cis.x1 + 1) * 2, z: (cis.y0 + cis.y1 + 1) * 2, big: true });
  for (let i = 0; i < W * H; i++) if (maze.water[i] && !(cis && i % W >= cis.x0 && i % W <= cis.x1 && Math.floor(i / W) >= cis.y0 && Math.floor(i / W) <= cis.y1)) waters.push({ x: (i % W) * CELLM + 2, z: Math.floor(i / W) * CELLM + 2, big: false });
  // the yard far above: up the stair's shaft and down the exit flight
  const aboveAt = [kit.stair ? { x: kit.stair.cx, y: 6.6, z: kit.stair.cz } : null, kit.exitStair?.door ? { x: kit.exitStair.door.x, y: 4.2, z: kit.exitStair.door.z } : null].filter(Boolean);

  const sched = createSchedule(maze, kit, field, e => play(e), { cracks });
  const clip = (kind, i) => clipFor(ctx, kind, i);

  // ---- small helpers
  const gain = v => audio.gain(v);
  function track(src, stopAt = null) { live.add(src); src.addEventListener?.('ended', () => live.delete(src)); if (stopAt !== null) src.stop(stopAt); return src; }
  const later = (ms, ...nodes) => setTimeout(() => { for (const n of nodes) { try { n.disconnect(); } catch { /* gone */ } } }, ms);
  function admit(dur, prio = false) {
    const t = ctx.currentTime; let free = -1, soon = 0, n = 0;
    for (let i = 0; i < CAP; i++) { if (voiceEnd[i] > t) { n++; if (voiceEnd[i] < voiceEnd[soon] || voiceEnd[soon] <= t) soon = i; } else if (free < 0) free = i; }
    if (free < 0) { if (!prio) { stat.dropped++; return -1; } free = soon; n--; }
    voiceEnd[free] = t + dur; if (n + 1 > stat.maxVoices) stat.maxVoices = n + 1;
    return free;
  }
  const release = i => { if (i >= 0) voiceEnd[i] = 0; };
  const voices = () => { if (!ctx) return 0; const t = ctx.currentTime; let n = 0; for (let i = 0; i < CAP; i++) if (voiceEnd[i] > t) n++; return n; };

  // a bus: dry into the engine's node, wet into the echo (the wet follows the same slider, mirrored, since the echo's return
  // goes straight to the master)
  function bus(dest, slider, base) { const g = gain(0), wet = gain(0); g.connect(dest); wet.connect(echoIn); return { g, wet, slider, base, k: 0, aimG: -1, aimW: -1, lv: 1 }; }
  function aimBus(b, k, tau, t) {
    b.k = k;
    if (Math.abs(k - b.aimG) > 0.005) { b.aimG = k; b.g.gain.setTargetAtTime(k, t, tau); }
    const lv = b.slider ? audio.levelGain(b.slider) : 1, w = k * b.base * lv;
    if (Math.abs(w - b.aimW) > 0.005) { b.aimW = w; b.wet.gain.setTargetAtTime(w, t, lv !== b.lv ? 0.05 : tau); } // (a slider: at once, as the dry)
    b.lv = lv;
  }

  function start() {
    ctx = audio.ctx;
    const t = ctx.currentTime;
    makeEcho(); echoOut.gain.setTargetAtTime(1, t, 0.3);
    B.bed = bus(audio.ambDuck || audio.levelNodes.amb, 'amb', 1); routes.bed = 'amb';
    B.small = { g: gain(0), wet: gain(0), slider: null, base: 1, k: 0, aimG: -1, aimW: -1 }; B.small.g.connect(B.bed.g); B.small.wet.connect(B.bed.wet); routes.small = 'amb';
    B.fx = bus(audio.sfx, 'sfx', 1); routes.fx = 'sfx';
    B.drone = bus(audio.musicDuck || audio.levelNodes.music, 'music', 0.8); routes.drone = 'music';
    aimBus(B.fx, 1, 0.05, t); aimBus(B.small, 1, 0.5, t); aimBus(B.drone, 0, 0.05, t);
    B.bed.aimG = 0; B.bed.g.gain.setTargetAtTime(1, t + 0.3, 1.2); B.bed.aimG = 1; aimBus(B.bed, 1, 1.2, t + 0.3);
    // the yard's two reverbs rest while you are below (at most two convolvers run: ours)
    if (audio.verbIn && audio.ambVerbIn) { verbSaved = [audio.verbIn.gain.value, audio.ambVerbIn.gain.value]; audio.verbIn.gain.setTargetAtTime(0, t, 0.2); audio.ambVerbIn.gain.setTargetAtTime(0, t, 0.2); }
    // the room tone: the weight of the earth overhead, barely there (a breath of it in the echo)
    toneLoop = { g: gain(0.05) };
    const tone = audio.noise('brown', true), tlp = audio.filter('lowpass', 150, 0.5), tw = gain(0.25);
    tone.connect(tlp).connect(toneLoop.g).connect(B.bed.g); toneLoop.g.connect(tw).connect(B.bed.wet); tone.start(); track(tone);
  }
  // ---- the echo. Two convolvers with fixed stone tails (a short one, a long dark boomy one), filled once on the way down while
  // the screen is black; everything about the space you are in is an AudioParam that glides when you move: the sends to the two
  // tails (the crossfade), a darkening lowpass, three early reflections (delay taps), a flutter (a delay feeding back through a
  // lowpass), two echoes off the far ends of a straight run. Nothing is ever swapped, so nothing clicks and no frame stalls.
  //   echoIn -> taps, flutter, far ends -> erSum -> (heard as they are) -> echoOut
  //   echoIn + erSum -> dark -> sendShort -> short tail -> echoOut;  -> sendLong -> long tail -> echoOut;  echoOut -> master
  const E = { conv: [], send: [], er: [], run: [], flut: null, dark: null, erSum: null, nodes: [], P: { kind: null, key: null, short: 0, long: 0, dark: 0, er: [], flut: null, run: [] } };
  const PP = spaceParams({ kind: 'corridor', key: 'corridor:1:1', a: 1, b: 1 });
  function makeEcho() {
    if (E.dark) return;
    const c = audio.ctx, sr = c.sampleRate, keep = n => { E.nodes.push(n); return n; };
    echoIn = keep(gain(1)); echoOut = keep(gain(0)); echoOut.connect(audio.master); routes.echo = 'master';
    E.erSum = keep(gain(1)); E.dark = keep(audio.filter('lowpass', 6000, 0.5));
    for (let i = 0; i < 3; i++) { const d = keep(c.createDelay(0.1)), g = keep(gain(0)); echoIn.connect(d).connect(g).connect(E.erSum); E.er.push({ d, g }); }
    { const d = keep(c.createDelay(0.1)), lp = keep(audio.filter('lowpass', 3500, 0.5)), fb = keep(gain(0)), out = keep(gain(0)); echoIn.connect(d); d.connect(lp).connect(fb).connect(d); d.connect(out).connect(E.erSum); E.flut = { d, fb, out }; }
    for (let i = 0; i < 2; i++) { const d = keep(c.createDelay(0.5)), lp = keep(audio.filter('lowpass', 2400, 0.6)), g = keep(gain(0)); d.delayTime.value = 0.05; echoIn.connect(d).connect(lp).connect(g).connect(E.erSum); E.run.push({ d, g }); }
    E.erSum.connect(echoOut); echoIn.connect(E.dark); E.erSum.connect(E.dark);
    for (const [k, seed] of [['short', 11], ['long', 23]]) {
      const conv = keep(c.createConvolver()); conv.normalize = false; stat.convolvers++;
      const [L, R] = irData(sr, BASE_IRS[k], seed), b = c.createBuffer(2, L.length, sr); b.copyToChannel(L, 0); b.copyToChannel(R, 1);
      conv.buffer = b; // (the one costly step, ~12 ms a second of response on this PC: done here, once)
      const s = keep(gain(0)); E.dark.connect(s).connect(conv).connect(echoOut); E.conv.push(conv); E.send.push(s);
    }
  }
  if (audio.ctx && audio.master) makeEcho(); // (on the way down: maze.js builds the scene behind a black fade)
  function applySpace(P, t, tau) {
    E.send[0].gain.setTargetAtTime(P.short, t, tau); E.send[1].gain.setTargetAtTime(P.long, t, tau);
    E.dark.frequency.setTargetAtTime(P.dark, t, tau);
    for (let i = 0; i < 3; i++) { E.er[i].d.delayTime.setTargetAtTime(P.er[i][0], t, tau * 0.4); E.er[i].g.gain.setTargetAtTime(P.er[i][1], t, tau); }
    E.flut.d.delayTime.setTargetAtTime(P.flut.d, t, tau * 0.4); E.flut.fb.gain.setTargetAtTime(P.flut.fb, t, tau); E.flut.out.gain.setTargetAtTime(P.flut.g, t, tau);
    for (let i = 0; i < 2; i++) { E.run[i].d.delayTime.setTargetAtTime(P.run[i][0], t, tau * 0.6); E.run[i].g.gain.setTargetAtTime(P.run[i][1], t, tau); }
    const Q2 = E.P; Q2.kind = P.kind; Q2.key = P.key; Q2.short = P.short; Q2.long = P.long; Q2.dark = P.dark; Q2.er = P.er.map(q => q.slice()); Q2.flut = { ...P.flut }; Q2.run = P.run.map(q => q.slice());
  }
  function setSpace(t, me) {
    spaceAt(maze, me.x, me.z, !!me.inShaft, SP);
    if (SP.key !== cur.want) { cur.want = SP.key; cur.wantAt = t; }
    if (cur.want === cur.key || (cur.key && t - cur.wantAt < 0.2)) return;
    spaceParams(SP, PP);
    applySpace(PP, t, cur.key ? 0.22 : 0.02);
    cur.key = SP.key; cur.kind = SP.kind; stat.spaces++;
  }


  // ---- placing a sound: the stone in the way (a lowpass, the loss round the corners), from the opening it leaks through, the
  // echo (more of it the farther it is). `foreign`: someone else's sound (it judges its own loudness): the lowpass and the
  // direction only, at its straight distance. Positions in the maze's frame. Returns the node to connect the sound into.
  const wetBy = d => 1 / (1 + d / 20);
  function place(x, y, z, b, ref = 4, roll = 1.2, wet = 0.8, hold = 7000, foreign = false, cutMax = 20000) {
    field.query(x, z, Q, foreign ? 'straight' : 'path');
    const lp = audio.filter('lowpass', Math.min(cutMax, Q.cut), 0.6), g = gain(foreign ? 1 : Q.k), p = audio.panner(Q.x + origin.x, y + origin.y, Q.z + origin.z, ref, roll), w = gain(wet * wetBy(Q.path));
    lp.connect(g).connect(p).connect(b.g); lp.connect(w).connect(b.wet);
    lp.verbDest = w; // (audio.tone's own reverb sends land in the echo too)
    if (hold) later(hold, lp, g, p, w);
    return lp;
  }
  // a loop that lives at a place: its lowpass and direction follow you round the walls (refreshed a few times a second)
  function emitter(x, y, z, b, ref, roll, wet) {
    const e = { x, y, z, b, wet, lp: null, g: null, p: null, w: null, cut: 0, k: 0, ax: 0, az: 0, vi: -1 };
    field.query(x, z, Q);
    e.lp = audio.filter('lowpass', Q.cut, 0.6); e.g = gain(Q.k); e.p = audio.panner(Q.x + origin.x, y + origin.y, Q.z + origin.z, ref, roll); e.w = gain(wet * wetBy(Q.path));
    e.lp.connect(e.g).connect(e.p).connect(b.g); e.lp.connect(e.w).connect(b.wet);
    e.cut = Q.cut; e.k = Q.k; e.ax = Q.x; e.az = Q.z; e.vi = admit(1e9, true);
    emitters.push(e);
    return e;
  }
  function moveEmitter(e, x, y, z) { e.x = x; e.y = y; e.z = z; refreshOne(e, ctx.currentTime, true); }
  function refreshOne(e, t, now = false) {
    field.query(e.x, e.z, Q);
    if (Math.abs(Q.cut - e.cut) > e.cut * 0.06) { e.cut = Q.cut; e.lp.frequency.setTargetAtTime(Q.cut, t, 0.18); }
    if (Math.abs(Q.k - e.k) > 0.03) { e.k = Q.k; e.g.gain.setTargetAtTime(Q.k, t, 0.18); e.w.gain.setTargetAtTime(e.wet * wetBy(Q.path), t, 0.18); }
    if (now || Math.abs(Q.x - e.ax) + Math.abs(Q.z - e.az) > 0.3) { e.ax = Q.x; e.az = Q.z; audio.movePanner(e.p, Q.x + origin.x, e.y + origin.y, Q.z + origin.z, now); }
  }
  function dropEmitter(e, fade = 0.4) {
    const i = emitters.indexOf(e); if (i >= 0) emitters.splice(i, 1);
    release(e.vi);
    later((fade + 0.3) * 1000, e.lp, e.g, e.p, e.w);
  }
  // a dry voice of your own (Effects): straight to the bus and into the echo
  function own(b, wet, hold = 3000) { const g = gain(1), w = gain(wet); g.connect(b.g); g.connect(w).connect(b.wet); g.verbDest = w; later(hold, g, w); return g; }

  // ---- the voices
  const V = {};
  V.drip = e => {
    const near = e.p.near, o = place(e.x, e.y, e.z, B.bed, near ? 3 : 5, 1.1, 0.9, 4000), t = e.t, f = e.p.f;
    if (e.p.kind === 'plop') { // a deeper drop into a pool: the bubble's pitch rises
      audio.tone(o, { f, glide: f * rand(1.6, 2.1), t, a: 0.003, d: 0.09, peak: near ? 0.09 : 0.06, type: 'sine' });
      audio.burst(o, { t, dur: 0.04, type: 'lowpass', f: 600, peak: 0.025, brown: true });
    } else if (e.p.kind === 'plink') { // a small bright one into a puddle
      audio.tone(o, { f, glide: f * rand(1.35, 1.7), t, a: 0.002, d: 0.06, peak: near ? 0.08 : 0.055, type: 'sine' });
      audio.tone(o, { f: f * 2.02, glide: f * 2.6, t: t + 0.004, a: 0.002, d: 0.03, peak: 0.012, type: 'sine' });
    } else { // a tick on stone
      audio.tone(o, { f, glide: f * rand(0.3, 0.45), t, d: 0.07, peak: near ? 0.08 : 0.055, type: 'sine' });
      audio.tone(o, { f: rand(380, 520), glide: 300, t: t + 0.04, d: 0.2, peak: near ? 0.022 : 0.014, type: 'sine' });
    }
    if (near) stat.nearDrips++; else stat.drips++;
  };
  V.rumble = e => {
    const o = place(e.x, e.y, e.z, B.bed, 8, 0.6, 1.1, 9000), t = e.t, dur = e.p.dur;
    const s = audio.noise('brown', false), lp = audio.filter('lowpass', e.p.f, 0.8), g = gain(0);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(rand(0.22, 0.32), t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(lp).connect(g).connect(o); s.start(t, rand(0, 1.5)); track(s, t + dur + 0.1);
    audio.tone(o, { f: e.p.low, glide: 30, t, a: dur * 0.35, d: dur * 0.6, peak: 0.08, type: 'sine' });
    stat.rumbles++;
  };
  V.settle = e => {
    const o = place(e.x, e.y, e.z, B.small, 5, 1, 1, 6000), t = e.t;
    audio.tone(o, { f: e.p.f, glide: 45, t, a: 0.004, d: 0.3, peak: 0.12, type: 'sine' });
    audio.burst(o, { t, dur: 0.12, type: 'lowpass', f: 500, peak: 0.08, brown: true });
    const n = e.p.n;
    for (let i = 0; i < n; i++) audio.burst(o, { t: t + 0.15 + i * rand(0.05, 0.16) + i * i * 0.01, dur: 0.02, type: 'bandpass', f: rand(2200, 4800), Q: 3, peak: 0.05 * (1 - i / (n + 1)) });
    stat.settles++;
  };
  V.crackle = e => {
    const o = place(e.x, e.y, e.z, B.bed, 2.5, 1.3, 0.5, 2000), t = e.t;
    audio.burst(o, { t, dur: e.p.d, type: 'bandpass', f: e.p.f, Q: rand(1.5, 4), peak: rand(0.04, 0.12) });
    if (e.p.pop) audio.burst(o, { t: t + 0.01, dur: 0.05, type: 'lowpass', f: 700, peak: 0.05, brown: true });
    stat.crackles++;
  };
  V.pebble = e => { // a click, bounces closing up, then a skitter
    const o = place(e.x, e.y, e.z, B.small, 4, 1.1, 0.9, 5000);
    let tt = e.t, gap = e.p.gap, amp = 0.1;
    for (let i = 0; i < e.p.n; i++) {
      audio.burst(o, { t: tt, dur: 0.012, type: 'bandpass', f: rand(2200, 4200), Q: 4, peak: amp });
      audio.tone(o, { f: rand(1800, 3200), glide: rand(1500, 2600), t: tt, a: 0.001, d: 0.025, peak: amp * 0.45, type: 'sine' });
      tt += gap; gap *= rand(0.55, 0.75); amp *= 0.72;
    }
    for (let i = 0; i < e.p.skit; i++) { audio.burst(o, { t: tt, dur: 0.006, type: 'bandpass', f: rand(4000, 6500), Q: 3, peak: 0.025 * (1 - i / (e.p.skit + 2)) }); tt += rand(0.02, 0.06); }
    stat.pebbles++;
  };
  V.chain = e => { // somewhere far: a few links knocking, inharmonic and bright, smeared by the stone
    const o = place(e.x, e.y, e.z, B.small, 6, 1, 1.1, 6000);
    let tt = e.t;
    for (let i = 0; i < e.p.n; i++) {
      const f0 = e.p.f * rand(0.9, 1.1);
      for (const [r, k] of [[1, 1], [2.76, 0.55], [5.4, 0.3]]) audio.tone(o, { f: f0 * r, t: tt, a: 0.001, d: rand(0.1, 0.3) / Math.sqrt(r), peak: 0.032 * k, type: 'sine' });
      audio.burst(o, { t: tt, dur: 0.008, type: 'bandpass', f: 3000, Q: 2, peak: 0.02 });
      tt += rand(0.08, 0.35);
    }
    stat.chains++;
  };
  V.gate = e => { // a gate on its hinge in the distance, and the iron settling
    const o = place(e.x, e.y, e.z, B.bed, 5, 1, 1, 7000);
    audio.creak(o, e.t, e.p.k, true);
    if (e.p.two) audio.creak(o, e.t + e.p.gap, e.p.k * 0.65, true);
    audio.tone(o, { f: e.p.f, t: e.t + 0.9, d: 0.6, peak: 0.028, type: 'triangle' });
    audio.burst(o, { t: e.t + 0.9, dur: 0.02, type: 'bandpass', f: 1200, Q: 6, peak: 0.035 });
    stat.gates++;
  };
  V.thud = e => {
    const o = place(e.x, e.y, e.z, B.bed, 8, 0.8, 1.2, 6000), t = e.t;
    audio.tone(o, { f: e.p.f, glide: 32, t, a: 0.006, d: 0.7, peak: 0.16, type: 'sine' });
    audio.burst(o, { t, dur: 0.18, type: 'lowpass', f: 220, peak: 0.1, brown: true });
    stat.thuds++;
  };
  V.moan = e => { // wind through a grate: a narrow band that slides up and back, a ghost of a second one above it
    const o = place(e.x, e.y, e.z, B.bed, 4, 1.1, 1.1, (e.p.dur + 1) * 1000), t = e.t, d = e.p.dur;
    for (const [k, lvl] of [[1, 0.05], [2.01, 0.018]]) {
      const s = audio.noise('white', true), bp = audio.filter('bandpass', e.p.f * k, 11), g = gain(0);
      bp.frequency.setValueAtTime(e.p.f * k, t); bp.frequency.linearRampToValueAtTime(e.p.top * k, t + d * 0.45); bp.frequency.linearRampToValueAtTime(e.p.f * 0.9 * k, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(lvl, t + d * 0.35); g.gain.setValueAtTime(lvl, t + d * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(bp).connect(g).connect(o); s.start(t); track(s, t + d + 0.05);
    }
    stat.moans++;
  };
  V.moths = e => { // ticking against the lantern's glass, a flutter of wings
    const o = place(e.x, e.y, e.z, B.small, 1.2, 1.4, 0.4, 3000);
    let tt = e.t;
    for (let i = 0; i < e.p.n; i++) { audio.burst(o, { t: tt, dur: 0.004, type: 'highpass', f: rand(3500, 6000), Q: 0.7, peak: rand(0.02, 0.05) }); tt += rand(0.04, 0.35); }
    const s = audio.noise('white', false), bp = audio.filter('bandpass', 280, 1.2), am = gain(0.5), env = gain(0), lfo = ctx.createOscillator(), lg = gain(0.5), d = e.p.d;
    lfo.frequency.value = e.p.wing; lfo.connect(lg).connect(am.gain);
    env.gain.setValueAtTime(0.0001, e.t); env.gain.exponentialRampToValueAtTime(0.018, e.t + d * 0.3); env.gain.exponentialRampToValueAtTime(0.0001, e.t + d);
    s.connect(bp).connect(am).connect(env).connect(o); s.start(e.t, rand(0, 1)); lfo.start(e.t); track(s, e.t + d + 0.05); track(lfo, e.t + d + 0.05);
    stat.moths++;
  };
  V.bones = e => { // the ossuary settling: dry clicks, now and then a little roll down the pile
    const o = place(e.x, e.y, e.z, B.small, 4, 1.1, 1, 5000);
    let tt = e.t;
    const n = e.p.n + (e.p.roll ? 5 : 0);
    for (let i = 0; i < n; i++) {
      const roll = i >= e.p.n, k = roll ? 0.5 * (1 - (i - e.p.n) / 6) : 1;
      audio.burst(o, { t: tt, dur: 0.006, type: 'bandpass', f: rand(1200, 2800), Q: 7, peak: rand(0.05, 0.09) * k });
      audio.tone(o, { f: e.p.f * rand(0.85, 1.15), glide: e.p.f * rand(0.75, 0.85), t: tt, a: 0.001, d: 0.04, peak: 0.025 * k, type: 'triangle' });
      tt += roll ? rand(0.04, 0.09) : rand(0.05, 0.4);
    }
    stat.bones++;
  };
  V.pages = e => { // a page turning over by itself, or a few
    const o = place(e.x, e.y, e.z, B.small, 4, 1.1, 0.8, 5000);
    let tt = e.t;
    for (let i = 0; i < e.p.n; i++) {
      const m = 4 + Math.floor(rand(0, 6)), span = rand(0.12, 0.3);
      for (let j = 0; j < m; j++) audio.burst(o, { t: tt + span * j / m + rand(0, 0.02), dur: rand(0.02, 0.05), type: j % 2 ? 'bandpass' : 'highpass', f: j % 2 ? e.p.f * rand(0.9, 1.1) : e.p.f * rand(0.45, 0.6), Q: 0.8, peak: rand(0.015, 0.035), attack: 0.004 });
      tt += span + rand(0.2, 0.6);
    }
    stat.pages++;
  };
  V.shelf = e => {
    const o = place(e.x, e.y, e.z, B.small, 4, 1.1, 0.9, 5000);
    audio.creak(o, e.t, e.p.k, true);
    audio.tone(o, { f: e.p.f, glide: 60, t: e.t + e.p.knock, a: 0.004, d: 0.18, peak: 0.05, type: 'sine' });
    stat.shelves++;
  };
  V.dust = e => { // a trickle of grit and dust from the vault
    const o = place(e.x, e.y, e.z, B.small, 3, 1.2, 0.9, (e.p.dur + 1) * 1000), d = e.p.dur;
    audio.burst(o, { t: e.t, dur: d, type: 'bandpass', f: 4500, Q: 0.6, peak: 0.012, attack: d * 0.3 });
    const n = 10 + Math.floor(rand(0, 14));
    for (let i = 0; i < n; i++) audio.burst(o, { t: e.t + Math.pow(Math.random(), 1.4) * d, dur: 0.002, type: 'bandpass', f: rand(3000, 7000), Q: 2, peak: rand(0.006, 0.015) });
    stat.dust++;
  };
  V.bird = e => { // the yard far above: a bird, muffled by the stone and the height
    const o = place(e.x, e.y, e.z, B.small, 6, 1, 1.4, 4000, false, 1100);
    let tt = e.t;
    for (let i = 0; i < e.p.n; i++) { const f = e.p.f * rand(0.9, 1.1); audio.tone(o, { f, glide: f * rand(0.7, 1.3), t: tt, a: 0.01, d: 0.08, peak: 0.03, type: 'sine' }); tt += rand(0.12, 0.3); }
    stat.birds++;
  };
  // the rats: inside the wall (the stone between is the wall's own: a fixed muffle), a far run also through the walls between
  function inWall(e, cut) {
    let c = cut, k = 1;
    if (e.p?.far) { field.query((e.x + e.x1) / 2, (e.z + e.z1) / 2, Q); c = Math.min(cut, Q.cut); k = Q.k; }
    const lp = audio.filter('lowpass', c, 0.7), g = gain(k), p = audio.panner(e.x + origin.x, e.y + origin.y, e.z + origin.z, 2.2, 1.3), w = gain(0.55);
    lp.connect(g).connect(p).connect(B.small.g); lp.connect(w).connect(B.small.wet);
    return { lp, g, p, w };
  }
  V['rat-run'] = e => {
    const n = inWall(e, e.p.ceiling ? 3200 : 2600), t = e.t, d = e.dur;
    if (n.p.positionX) { n.p.positionX.setValueAtTime(e.x + origin.x, t); n.p.positionX.linearRampToValueAtTime(e.x1 + origin.x, t + d); n.p.positionZ.setValueAtTime(e.z + origin.z, t); n.p.positionZ.linearRampToValueAtTime(e.z1 + origin.z, t + d); }
    const src = ctx.createBufferSource(); src.buffer = clip('scurry', e.p.clip); src.playbackRate.value = e.p.rate;
    const env = gain(0); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(e.p.far ? 0.35 : 0.5, t + 0.06); env.gain.setValueAtTime(e.p.far ? 0.35 : 0.5, t + d - 0.12); env.gain.linearRampToValueAtTime(0, t + d);
    src.connect(env).connect(n.lp); src.start(t, rand(0, 0.3)); track(src, t + d + 0.05);
    later((d + 1.5) * 1000, n.lp, n.g, n.p, n.w, env);
    stat.rats++;
  };
  V['rat-squeak'] = e => {
    const n = inWall(e, 5200);
    let tt = e.t;
    for (let i = 0; i < e.p.n; i++) {
      const f = e.p.f * rand(0.92, 1.08), d = rand(0.05, 0.1), o = ctx.createOscillator(), vib = ctx.createOscillator(), vg = gain(f * 0.04), g = gain(0);
      o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * rand(0.75, 0.88), tt + d);
      vib.frequency.value = rand(30, 42); vib.connect(vg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.03, tt + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, tt + d);
      o.connect(g).connect(n.lp); o.start(tt); vib.start(tt); track(o, tt + d + 0.02); track(vib, tt + d + 0.02);
      tt += d + rand(0.03, 0.12);
    }
    later((tt - e.t + 1.5) * 1000, n.lp, n.g, n.p, n.w);
    stat.squeaks++;
  };
  // the dread drone (Music), into the echo with a long send
  V.cello = e => {
    const t = e.t, f = e.p.f, hold = e.p.hold, att = e.p.att, rel = e.p.rel, end = t + att + hold + rel;
    const g = gain(0), lp = audio.filter('lowpass', 260, 0.8);
    lp.frequency.setValueAtTime(220, t); lp.frequency.linearRampToValueAtTime(520, t + att + hold * 0.5); lp.frequency.linearRampToValueAtTime(240, end);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + att); g.gain.setValueAtTime(0.05, t + att + hold); g.gain.exponentialRampToValueAtTime(0.0001, end);
    lp.connect(g); g.connect(B.drone.g); const send = gain(0.6); g.connect(send).connect(B.drone.wet);
    const vib = ctx.createOscillator(); vib.frequency.value = e.p.vib; const vg = gain(0); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.007, t + att); vib.start(t); track(vib, end + 0.1);
    for (const [type, k, det] of [['sawtooth', 1, -5], ['sawtooth', 1, 6], ['sine', 0.5, 0]]) { const o = osc(type, f * k, lp, t, end + 0.1); o.detune.value = det; vib.connect(vg).connect(o.frequency); }
    later((end - ctx.currentTime + 1) * 1000, g, send, lp);
    stat.cello++;
  };
  V.metal = e => { // bowed metal: inharmonic partials beating slowly
    const t = e.t, base = e.p.f, att = e.p.att, hold = e.p.hold, rel = e.p.rel, end = t + att + hold + rel;
    const g = gain(0), hp = audio.filter('highpass', 300, 0.7); hp.connect(g); g.connect(B.drone.g); const send = gain(0.9); g.connect(send).connect(B.drone.wet);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.012, t + att); g.gain.setValueAtTime(0.012, t + att + hold); g.gain.exponentialRampToValueAtTime(0.0001, end);
    for (const [r, k] of [[1, 1], [2.76, 0.6], [5.4, 0.35], [8.93, 0.2]]) { const pg = gain(k); pg.connect(hp); const o = osc('sine', base * r, pg, t, end + 0.1); o.detune.value = rand(-9, 9); }
    later((end - ctx.currentTime + 1) * 1000, g, send, hp);
    stat.metal++;
  };
  V.piano = e => { // a detuned low piano note: two strings a little apart, a quick strike, a long decay into the echo
    const t = e.t, f = e.p.f, end = t + 4.2;
    const g = gain(0); g.connect(B.drone.g); const send = gain(1); g.connect(send).connect(B.drone.wet);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035 * e.p.v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.008, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, end);
    for (const [type, k, det, v] of [['triangle', 1, -e.p.det, 1], ['triangle', 1, e.p.det * 0.8, 1], ['sine', 2, 4, 0.35], ['sine', 3.01, 0, 0.12]]) { const pg = gain(v); pg.connect(g); const o = osc(type, f * k, pg, t, end + 0.1); o.detune.value = det; }
    later((end - ctx.currentTime + 1) * 1000, g, send);
    stat.piano++;
  };
  function osc(type, f, dest, t, stopAt) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); return track(o, stopAt); }
  const DUR = { drip: 0.4, rumble: 7, settle: 1.2, crackle: 0.08, pebble: 1.6, chain: 1.5, gate: 2.5, thud: 1, moan: 7, moths: 2.5, bones: 1.5, pages: 2, shelf: 1.5, dust: 2.5, bird: 1.2, 'rat-run': 2.3, 'rat-squeak': 1, cello: 17, metal: 13, piano: 4.3 };
  const PRIO = { cello: 1, metal: 1, piano: 1 };

  function log(e) { events.push({ n: e.name, t: +e.t.toFixed(3), x: +e.x.toFixed(2), z: +e.z.toFixed(2), y: +(e.y || 0).toFixed(2), x1: e.x1 !== undefined ? +e.x1.toFixed(2) : undefined, z1: e.z1 !== undefined ? +e.z1.toFixed(2) : undefined, dur: e.dur, p: e.p }); if (events.length > 300) events.shift(); }
  function play(e) {
    if (!ctx || disposed) return;
    const t = ctx.currentTime; if (e.t < t) e.t = t;
    const vi = admit(e.dur || DUR[e.name] || 1, !!PRIO[e.name]); if (vi < 0) return;
    log(e);
    try { V[e.name]?.(e); } catch (err) { console.error('[maze-audio]', e.name, err); }
  }

  // ---- the loops near places: wind in a crack, a torch's hiss, the sigil's hum, trickling water, the yard far above
  function windLoop(c) {
    const e = emitter(c.x, c.y, c.z, B.bed, 2.5, 1.4, 0.8);
    const g = gain(0), bp = audio.filter('bandpass', c.f, 5), lfo = ctx.createOscillator(), lg = gain(0.012);
    lfo.frequency.value = rand(0.05, 0.12); lfo.connect(lg).connect(g.gain); lfo.start(); track(lfo);
    g.gain.setValueAtTime(0, ctx.currentTime); g.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 2);
    const s = audio.noise('white', true); s.connect(bp).connect(g).connect(e.lp); s.start(); track(s);
    return { s, lfo, g, e };
  }
  function stopLoop(L, fade = 0.4) {
    if (!L) return; const t = ctx.currentTime;
    try { L.g.gain.cancelScheduledValues(t); L.g.gain.setTargetAtTime(0, t, fade / 3); } catch { /* */ }
    for (const n of [L.s, L.lfo, ...(L.more || [])]) if (n) { try { n.stop(t + fade + 0.05); } catch { /* stopped */ } live.delete(n); }
    if (L.e) dropEmitter(L.e, fade);
  }
  function fireLoop(q) { const e = emitter(q.x, q.y, q.z, B.bed, 2.2, 1.3, 0.6), g = gain(0); const s = audio.noise('brown', true); s.connect(audio.filter('bandpass', 850, 0.6)).connect(g).connect(e.lp); s.start(); track(s); return { s, g, e }; }
  function humLoop() {
    const e = emitter(sigilAt.x, 0.6, sigilAt.z, B.bed, 3, 1.1, 1), g = gain(0), lp = audio.filter('lowpass', 280, 0.7);
    lp.connect(g).connect(e.lp);
    const t = ctx.currentTime, more = [osc('sine', 55, lp, t), osc('triangle', 82.6, lp, t), osc('sine', 110.4, lp, t)];
    more[1].detune.value = 4; return { s: null, g, e, more };
  }
  // a slow random modulator (brown noise crawling at a hundredth of its speed: never a period you notice)
  function crawl(dest, depth, rate = 0.012) { const m = ctx.createBufferSource(); m.buffer = audio.brown; m.loop = true; m.playbackRate.value = rate; const g = gain(depth); m.connect(g).connect(dest); m.start(ctx.currentTime, rand(0, 1.9)); return track(m); }
  function trickleLoop(w) {
    const e = emitter(w.x, -0.2, w.z, B.bed, w.big ? 3.5 : 2.5, 1.2, 0.9), g = gain(0), lvl = w.big ? 0.06 : 0.035;
    g.gain.setTargetAtTime(lvl, ctx.currentTime, 0.8);
    const a = ctx.createBufferSource(), b = ctx.createBufferSource(); a.buffer = clip('trickle', 0); b.buffer = clip('trickle', 1); a.loop = b.loop = true;
    a.playbackRate.value = rand(0.92, 1.08); b.playbackRate.value = rand(0.9, 1.1) * (w.big ? 0.8 : 1);
    const bg = gain(w.big ? 0.8 : 0.45), hp = audio.filter('highpass', w.big ? 200 : 350, 0.7);
    a.connect(hp); b.connect(bg).connect(hp); hp.connect(g).connect(e.lp);
    a.start(ctx.currentTime, rand(0, 3)); b.start(ctx.currentTime, rand(0, 3)); track(a); track(b);
    const m = crawl(g.gain, lvl * 1.5); // (a slow swell and ebb on top)
    return { s: a, more: [b, m], g, e };
  }
  function aboveLoop(at) { // the wind in the yard, far up: low, gusting
    const e = emitter(at.x, at.y, at.z, B.small, 5, 1, 1.2), g = gain(0), lp = audio.filter('lowpass', 300, 0.6), gust = gain(0.5);
    g.gain.setTargetAtTime(0.05, ctx.currentTime, 1.5);
    const s = audio.noise('brown', true); s.connect(lp).connect(gust).connect(g).connect(e.lp); s.start(); track(s);
    const m = crawl(gust.gain, 1.2, 0.02);
    return { s, more: [m], g, e };
  }

  // ---- each frame (maze-fx.js calls it with what it knows)
  function update(dt, now, st) {
    lastSt = st;
    if (disposed) return;
    if (!ctx) { if (audio.ctx && audio.sfx && audio.master && audio.brown) start(); else return; }
    const t = ctx.currentTime, { me, phase, lit, sigil, hush, threat } = st;
    field.setListener(me.x, me.z); // (a flood only when you step into another cell)
    setSpace(t, me);
    const cx = Math.floor(me.x / CELLM), cy = Math.floor(me.z / CELLM);
    const room = cx >= 0 && cy >= 0 && cx < W && cy < H && roomCell[cy * W + cx] === 1;
    inRoomK += ((room ? 1.45 : 1) - inRoomK) * Math.min(1, dt * 0.5);
    const out = phase === 'out';
    // (a gain is only touched when its target moves: an automation event a frame for nothing is garbage and work)
    aimBus(B.bed, out ? 0 : 1 - 0.6 * hush, out ? 0.3 : 0.6, t);
    const sk = out ? 0 : Math.max(0, 1 - hush * 3 - Math.max(0, threat - 0.2) * 2);
    aimBus(B.small, sk, sk < B.small.aimG ? 0.25 : 1.0, t); // (the small things go quiet first, and come back slowly)
    aimBus(B.fx, out ? 0 : 1, 0.3, t);
    aimBus(B.drone, out || lit < 0.5 ? 0 : inRoomK * (1 - 0.85 * hush) * (1 + 0.3 * threat), out ? 0.3 : 1.5, t);
    if (out) return;
    // the walls between: the loops' lowpass and direction, a few times a second
    if (now - fieldAt > 1 / BUDGET.fieldHz || now < fieldAt) { fieldAt = now; for (let i = 0; i < emitters.length; i++) refreshOne(emitters[i], t); }
    // wind in the cracks within 14 m (two at most), out past 18 m
    for (let i = 0; i < cracks.length; i++) {
      const c = cracks[i], d = Math.hypot(c.x - me.x, c.z - me.z), on = winds.get(i);
      if (!on && d < 14 && winds.size < 2) winds.set(i, windLoop(c));
      else if (on && d > 18) { stopLoop(on, 1); winds.delete(i); }
    }
    // the nearest torch: its hiss follows it (crackles come from the schedule)
    let tn = null, td = 1e9;
    for (let i = 0; i < realTorches.length; i++) { const q = realTorches[i], d = Math.hypot(q.x - me.x, q.z - me.z); if (d < td) { td = d; tn = q; } }
    if (tn && td < 9) {
      if (!fire) { fire = fireLoop(tn); fire.g.gain.setTargetAtTime(0.03, t, 0.4); fire.at = tn; }
      if (fire.at !== tn) { fire.at = tn; moveEmitter(fire.e, tn.x, tn.y, tn.z); }
    } else if (fire) { stopLoop(fire, 0.6); fire = null; }
    // the sigil's hum, pulsing with its glow
    const sd = sigilAt ? Math.hypot(sigilAt.x - me.x, sigilAt.z - me.z) : 1e9;
    if (sd < 18 && !hum) hum = humLoop();
    if (hum) { const hg = sd < 22 ? 0.02 + 0.03 * sigil : 0; if (Math.abs(hg - aim.hum) > 0.003) { aim.hum = hg; hum.g.gain.setTargetAtTime(hg, t, 0.3); } if (sd > 24) { stopLoop(hum, 0.6); hum = null; aim.hum = -1; } }
    // water trickling: the two nearest pools within 12 m
    for (let i = 0; i < waters.length; i++) {
      const w = waters[i], d = Math.hypot(w.x - me.x, w.z - me.z) - (w.big ? 6 : 0), on = trickles.get(i);
      if (!on && d < 12 && trickles.size < 2) trickles.set(i, trickleLoop(w));
      else if (on && d > 16) { stopLoop(on, 1); trickles.delete(i); }
    }
    // the yard far above, near the stair and the exit
    for (let i = 0; i < aboveAt.length; i++) {
      const a = aboveAt[i], d = Math.hypot(a.x - me.x, a.z - me.z), on = aboves.get(i);
      if (!on && d < 12) aboves.set(i, aboveLoop(a));
      else if (on && d > 16) { stopLoop(on, 1.5); aboves.delete(i); }
    }
    // your friends: their steps (stone or water) and their lanterns' creak, through the walls like everything else
    if (remotes && remotes.size) { stepT = t; stepDt = dt; remotes.forEach(friendStep); }
    // the schedule: drips, rats, the room's own things, the drone
    schedSt.me = me; schedSt.lit = lit; schedSt.hush = hush; schedSt.threat = threat;
    if ((phase === 'maze' || phase === 'stair') && !held) sched.tick(t, schedSt);
    else if (held) sched.drain(t, schedSt);
  }
  const schedSt = { me: null, lit: 0, hush: 0, threat: 0 };
  let held = false; // (renders and tests: the schedule held, only what they ask for plays)
  let stepT = 0, stepDt = 0;
  function friendStep(r, sid) {
    let f = friends.get(sid);
    if (!f) { f = { step: 0, creak: rand(2, 5) }; friends.set(sid, f); }
    if (!(r.speed > 0.3)) return;
    const before = f.step; f.step += stepDt * (1.1 + r.speed * 0.42);
    if (Math.floor(before) !== Math.floor(f.step)) {
      const cx = Math.max(0, Math.min(W - 1, Math.floor(r.ax / CELLM))), cy = Math.max(0, Math.min(H - 1, Math.floor(r.az / CELLM)));
      const wet = !!maze.water[cy * W + cx], run = r.speed > 4.6, k = run ? 1.2 : 1;
      if (admit(0.4) < 0) return;
      const o = place(r.ax, 0.05, r.az, B.fx, 3, 1.2, 0.9, 3000), tt = stepT;
      if (wet) { audio.burst(o, { t: tt, dur: 0.14, type: 'bandpass', f: rand(1100, 1600), Q: 0.9, peak: 0.09 * k, sweep: 500, attack: 0.008 }); audio.burst(o, { t: tt + 0.03, dur: 0.2, type: 'lowpass', f: 600, peak: 0.06 * k, brown: true, attack: 0.02 }); }
      else { audio.burst(o, { t: tt, dur: 0.06, type: 'lowpass', f: rand(700, 1000), Q: 0.7, peak: 0.11 * k }); audio.burst(o, { t: tt + 0.008, dur: 0.03, type: 'bandpass', f: rand(3000, 4600), Q: 1.2, peak: 0.02 * k }); }
      stat.friendSteps++;
    }
    f.creak -= stepDt;
    if (f.creak <= 0) { f.creak = rand(2.5, 6); if (admit(0.8) >= 0) { const o = place(r.ax, 1.0, r.az, B.fx, 2.5, 1.2, 0.8, 2500), g = gain(0.3); g.connect(o); audio.creak(g, stepT, 0.35, false); later(2500, g); stat.friendCreaks++; } }
  }

  // ---- you: steps, splashes, the lantern's creak, your breath (Effects, and every one comes back to you off the stone)
  // soft: a crouched step, near silent (a quarter of a walk's, the splash a third)
  function step(wet, run, soft = false) {
    if (!ctx || disposed) return;
    const t = ctx.currentTime, k = soft ? (wet ? 0.33 : 0.25) : run ? 1.25 : 1;
    if (soft) stat.softSteps = (stat.softSteps || 0) + 1; stat.stepK = k; // tests
    admit(0.4, true);
    if (wet) {
      const o = own(B.fx, 0.7);
      audio.burst(o, { t, dur: 0.14, type: 'bandpass', f: rand(1100, 1600), Q: 0.9, peak: 0.11 * k, sweep: 500, attack: 0.008 });
      audio.burst(o, { t: t + 0.03, dur: 0.22, type: 'lowpass', f: 600, peak: 0.07 * k, brown: true, attack: 0.02 });
      audio.tone(o, { f: rand(500, 700), glide: rand(900, 1200), t: t + 0.06, d: 0.07, peak: 0.02, type: 'sine' });
      stat.splashes++;
    } else {
      const o = own(B.fx, 0.6);
      audio.burst(o, { t, dur: 0.06, type: 'lowpass', f: rand(700, 1000), Q: 0.7, peak: 0.13 * k });
      audio.burst(o, { t: t + 0.008, dur: 0.03, type: 'bandpass', f: rand(3000, 4600), Q: 1.2, peak: 0.025 * k });
      stat.steps++;
    }
  }
  let creakAt = 0;
  function creak(k) { if (!ctx || disposed || ctx.currentTime - creakAt < 0.4) return; creakAt = ctx.currentTime; const g = gain(0.25 + 0.3 * k), o = own(B.fx, 0.6, 2000); g.connect(o); audio.creak(g, ctx.currentTime, 0.4 * k, false); later(2000, g); stat.creaks++; }
  // your breath, in your investigator's voice (maze-sneak.js breathPlan and VOICES): calm and slow with breath to spare, quicker
  // and louder as it drains, ragged gasps when winded (a gasp in with a catch of the voice, a short hard breath out). A plan
  // { ex, peak, ragged, period } (or just how hard you're breathing, 0..1). at: a friend's place (maze frame), else yours.
  function breathe(plan, voice = myVoice, at = null) {
    if (!ctx || disposed) return;
    if (typeof plan === 'number') plan = { ex: plan, peak: 0.009 + 0.034 * plan, ragged: plan > 0.9 ? 0.6 : 0, period: 4.2 - 2.75 * plan };
    const v = voice || myVoice, t = ctx.currentTime, o = vout(at, 3000), pk = plan.peak, rg = plan.ragged || 0, ex = plan.ex;
    const inh = Math.min(0.42 * plan.period, (0.35 + 0.3 * (1 - ex)) * (1 - 0.45 * rg)), exh = Math.min(0.5 * plan.period, (0.5 + 0.2 * (1 - ex)) * (1 - 0.35 * rg));
    audio.burst(o, { t, dur: inh, type: 'bandpass', f: v.formant * (1.05 + 0.3 * rg), Q: 0.8 + rg, peak: pk * (0.5 + 0.4 * v.air), attack: inh * (0.6 - 0.4 * rg) });
    if (rg > 0.05) cry(o, v, t + inh * 0.55, v.f0 * 1.7, v.f0 * 2.0, 0.09, pk * 0.35 * rg); // (the catch in a gasp)
    const t2 = t + inh + 0.06 + 0.04 * (1 - rg);
    audio.burst(o, { t: t2, dur: exh, type: 'lowpass', f: v.lowF, Q: 0.6, peak: pk, attack: 0.04 + 0.04 * (1 - rg), brown: true });
    if (v.rasp > 0.05) audio.burst(o, { t: t2, dur: exh * 0.8, type: 'lowpass', f: 260, Q: 0.9, peak: pk * 0.6 * v.rasp, attack: 0.05, brown: true });
    if (rg > 0.3) cry(o, v, t2 + 0.01, v.f0 * 1.15, v.f0 * 0.9, 0.12, pk * 0.3 * rg); // (a hard "huh" out)
    stat.breaths++;
    logV('breath', v, pk, at, rg);
  }
  // a voiced sound in a voice: a buzz (two detuned saws) through the mouth's two resonances, some air, some rasp
  function cry(o, v, t, f1, f2, d, peak) {
    const fm = ctx.createBiquadFilter(), fm2 = ctx.createBiquadFilter(), g = gain(0), mix = gain(0.4);
    fm.type = 'bandpass'; fm.frequency.value = v.formant; fm.Q.value = 2.2;
    fm2.type = 'bandpass'; fm2.frequency.value = v.formant * 2.4; fm2.Q.value = 3;
    fm.connect(g); fm2.connect(mix).connect(g); g.connect(o);
    audio.env(g, t, Math.min(0.04, d * 0.3), peak * (1 - 0.5 * v.air), d);
    for (const det of [1, 1.012]) {
      const osc = ctx.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f1 * det, t); osc.frequency.exponentialRampToValueAtTime(f2 * det, t + d);
      osc.connect(fm); osc.connect(fm2); osc.start(t); osc.stop(t + d + 0.08); live.add(osc); osc.addEventListener?.('ended', () => live.delete(osc));
    }
    audio.burst(o, { t, dur: d, type: 'bandpass', f: v.formant * 1.2, Q: 1, peak: peak * 0.5 * v.air, attack: Math.min(0.03, d * 0.3) });
    if (v.rasp > 0.05) audio.burst(o, { t, dur: d, type: 'lowpass', f: 300, Q: 1.2, peak: peak * 0.55 * v.rasp, attack: 0.01, brown: true });
    later((d + 0.5) * 1000 + 200, fm, fm2, g, mix);
  }
  // the voice when it has you: 'yelp' (the grab), 'struggle' (grunts while it holds you, over secs), 'scream' (the third:
  // a cry, never loud: the ghoul's own shriek is three times it). Kid-safe: no words. at: a friend's place (maze frame), else yours.
  function vocal(kind, voice = myVoice, at = null, secs = 2.4) {
    if (!ctx || disposed) return;
    const v = voice || myVoice, t = ctx.currentTime, r = v.rate, o = vout(at, (secs + 2) * 1000);
    admit(kind === 'struggle' ? secs : 1.2, true);
    if (kind === 'yelp') { cry(o, v, t, v.f0 * 2.0, v.f0 * 2.7, 0.22 / r, 0.05); cry(o, v, t + 0.24 / r, v.f0 * 2.4, v.f0 * 1.7, 0.18 / r, 0.03); }
    else if (kind === 'struggle') { for (let a = 0.35; a < secs - 0.2; a += (0.34 + Math.random() * 0.16) / r) cry(o, v, t + a, v.f0 * (1.1 + Math.random() * 0.15), v.f0 * 0.92, 0.13 / r, 0.03 + Math.random() * 0.008); }
    else if (kind === 'scream') { cry(o, v, t, v.f0 * 2.1, v.f0 * 3.0, 0.3 / r, 0.055); cry(o, v, t + 0.28 / r, v.f0 * 3.0, v.f0 * 1.9, 0.75 / r, 0.05); }
    else return;
    logV(kind, v, kind === 'struggle' ? 0.038 : 0.055, at, 0);
  }
  const vlog = []; // (tests: the last 40 voiced things { kind, f0, formant, lowF, rasp, peak, at, t })
  function logV(kind, v, peak, at, ragged) { vlog.push({ kind, f0: v.f0, formant: v.formant, lowF: v.lowF, rasp: v.rasp, air: v.air, peak: +peak.toFixed(4), ragged: +ragged.toFixed(2), at: at ? { x: +at.x.toFixed(2), z: +at.z.toFixed(2) } : null, t: +ctx.currentTime.toFixed(3) }); if (vlog.length > 40) vlog.shift(); }
  function vout(at, hold) { return at ? place(at.x, 1.45, at.z, B.fx, 2.5, 1.2, 0.7, hold) : own(B.fx, 0.5, hold); }
  let myVoice = { f0: 150, formant: 1000, lowF: 780, air: 0.55, rasp: 0.15, rate: 1 };
  // a drip maze-fx.js shows landing near you (world position)
  function drip(x, y, z, near) { if (!ctx || disposed) return; play({ name: 'drip', t: ctx.currentTime, x: x - origin.x, y: y - origin.y, z: z - origin.z, p: { kind: 'tick', f: rand(1700, 2900), near: !!near } }); }

  // ---- for the ghoul (and anything else below): the engine as seen from here
  let eng = null;
  function engine() {
    if (eng || !ctx) return eng || audio;
    const fxIn = gain(1), fxW = gain(0.7), ambIn = gain(1), ambW = gain(0.6);
    fxIn.connect(B.fx.g); fxIn.connect(fxW).connect(B.fx.wet); fxIn.verbDest = B.fx.wet;
    ambIn.connect(B.bed.g); ambIn.connect(ambW).connect(B.bed.wet); ambIn.verbDest = B.bed.wet;
    eng = Object.create(audio);
    const at = (x, y, z, ref = 5, roll = 1.2) => place(x - origin.x, y - origin.y, z - origin.z, B.fx, ref, roll, 0.8, 6000, true);
    Object.defineProperties(eng, {
      at: { value: at, configurable: true }, atVoice: { value: (x, y, z) => at(x, y, z, 3, 1.2), configurable: true },
      atAmb: { value: (x, y, z, ref = 5, roll = 1.2) => place(x - origin.x, y - origin.y, z - origin.z, B.bed, ref, roll, 0.8, 6000, true), configurable: true },
      sfx: { value: fxIn, configurable: true, writable: true }, amb: { value: ambIn, configurable: true, writable: true }, verbIn: { value: B.fx.wet, configurable: true, writable: true }, ambVerbIn: { value: B.bed.wet, configurable: true, writable: true },
      lastSfx: { get: () => audio.lastSfx, set: v => { audio.lastSfx = v; } },
    });
    return eng;
  }
  // aud.play: the engine's own play (and whatever wraps it: haptics.js buzzes on some sounds) with its outputs pointed here for
  // the length of the call. The builders run synchronously inside it, so the engine is back as it was before anything else runs.
  let below = null;
  function playFx(name, x, y, z, opts = {}) {
    if (!ctx || disposed) return audio.play(name, x, y, z, opts);
    admit(2, true); stat.played++;
    const e = engine();
    if (!below) { below = {}; for (const k of ['at', 'atAmb', 'atVoice', 'sfx', 'amb', 'verbIn', 'ambVerbIn']) below[k] = Object.getOwnPropertyDescriptor(e, k); }
    const saved = {};
    for (const k in below) { saved[k] = Object.getOwnPropertyDescriptor(audio, k); Object.defineProperty(audio, k, { ...below[k], configurable: true }); }
    try { return audio.play(name, x, y, z, opts); }
    finally { for (const k in saved) { if (saved[k]) Object.defineProperty(audio, k, saved[k]); else delete audio[k]; } }
  }
  // a node at a world position with the stone's full say: the way round's distance and its loss as well as the lowpass and the
  // opening (aud.play and engine.at leave the loudness to the sound's owner)
  function at(x, y, z, ref = 4, roll = 1.2) { if (!ctx || disposed) return audio.at(x, y, z, ref, roll); return place(x - origin.x, y - origin.y, z - origin.z, B.fx, ref, roll, 0.8, 6000, false); }
  function send(node, amount = 1) { if (!ctx || disposed) return null; const g = gain(amount); node.connect(g); g.connect(B.fx.wet); stat.sent++; return g; }
  function occlude(x, y, z, o = {}) { field.query(x - origin.x, z - origin.z, Q, 'straight'); o.x = Q.x + origin.x; o.y = y; o.z = Q.z + origin.z; o.cut = Q.cut; o.k = Q.k; o.open = Q.open; o.rock = Q.rock; o.path = Q.path; o.straight = Q.straight; return o; }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const b of [B.bed, B.small, B.fx, B.drone]) { try { b.g.gain.cancelScheduledValues(t); b.g.gain.setTargetAtTime(0, t, 0.12); b.wet.gain.cancelScheduledValues(t); b.wet.gain.setTargetAtTime(0, t, 0.12); } catch { /* */ } }
    try { echoIn.gain.setTargetAtTime(0, t, 0.05); echoOut.gain.cancelScheduledValues(t); echoOut.gain.setTargetAtTime(0, t, 0.25); } catch { /* */ }
    for (const s of live) { try { s.stop(t + 0.6); } catch { /* already stopped */ } }
    live.clear(); winds.clear(); trickles.clear(); aboves.clear(); fire = hum = null; sched.queue.length = 0; emitters.length = 0; voiceEnd.fill(0);
    if (verbSaved) { audio.verbIn.gain.cancelScheduledValues(t); audio.verbIn.gain.setTargetAtTime(verbSaved[0], t + 0.5, 0.3); audio.ambVerbIn.gain.cancelScheduledValues(t); audio.ambVerbIn.gain.setTargetAtTime(verbSaved[1], t + 0.5, 0.3); }
    setTimeout(() => {
      for (const b of [B.bed, B.small, B.fx, B.drone]) { try { b.g.disconnect(); b.wet.disconnect(); } catch { /* */ } }
      for (const n of E.nodes) { try { n.disconnect(); } catch { /* */ } }
      E.nodes.length = 0; E.released = true;
    }, 1200);
  }

  // tests: run the schedule on a clock of its own (nothing plays), a walk given as walk(t, st) filling st.me
  function simulate(seconds, walk, step = 0.1) {
    const f2 = createField(maze), out = [], st = { me: { x: 0, z: 0, yaw: 0, inShaft: false }, lit: 1, hush: 0, threat: 0 };
    const s2 = createSchedule(maze, kit, f2, e => out.push({ n: e.name, t: +(e.t - 1000).toFixed(2), x: +e.x.toFixed(2), z: +e.z.toFixed(2), y: +(e.y || 0).toFixed(2), x1: e.x1, z1: e.z1, p: e.p, hush: st.hush }), { cracks });
    for (let t = 0; t < seconds; t += step) { walk(t, st); f2.setListener(st.me.x, st.me.z); s2.tick(1000 + t, st); }
    return out;
  }

  return {
    update, step, creak, breathe, drip, dispose, live, routes, stat, events, cracksAt: cracks,
    vocal, vlog, get voice() { return myVoice; }, set voice(v) { if (v) myVoice = v; }, // your investigator's voice
    play: playFx, send, at, occlude, get engine() { return engine(); },
    // tests: play one of the schedule's voices now (respects the hush for the small things: false when they would not)
    force(name, opt = null) { if (!ctx || disposed || !lastSt) return false; return sched.force(name, ctx.currentTime, { me: lastSt.me, lit: 1, hush: lastSt.hush, threat: lastSt.threat }, opt); },
    get hold() { return held; }, set hold(v) { held = !!v; },
    simulate, field, sched,
    get buses() { return { bed: B.bed?.g, fx: B.fx?.g, drone: B.drone?.g, small: B.small?.g, wet: { bed: B.bed?.wet, fx: B.fx?.wet, drone: B.drone?.wet, small: B.small?.wet } }; },
    get echo() { return { in: echoIn, out: echoOut, convs: E.conv.slice(), released: !!E.released, sends: E.send.map(g => +g.gain.value.toFixed(3)), dark: E.dark ? Math.round(E.dark.frequency.value) : 0, P: E.P }; },
    get space() { return { kind: cur.kind, key: cur.key, want: cur.want, short: E.P.short, long: E.P.long, dark: E.P.dark }; },
    get voices() { return voices(); }, cap: CAP, phone,
    get started() { return !!ctx; },
    get loops() { return { winds: winds.size, fire: !!fire, hum: !!hum, tone: !!toneLoop, trickles: trickles.size, above: aboves.size, emitters: emitters.length }; },
    get cracks() { return cracks.length; },
  };
}

// ---------------------------------------------------------------- the clips made once (procedural sample buffers)
const clips = new WeakMap(); // (per audio context: made once, kept while the context lives)
function clipFor(ctx, kind, i) {
  let m = clips.get(ctx); if (!m) { m = new Map(); clips.set(ctx, m); }
  const k = kind + i; let b = m.get(k); if (b) return b;
  if (kind === 'scurry') { const sr = 32000, d = scurryData(sr, 101 + i * 7919); b = ctx.createBuffer(1, d.length, sr); b.copyToChannel(d, 0); }
  else { const sr = 22050, d = trickleData(sr, i ? 9.1 : 7.3, 301 + i * 104729); b = ctx.createBuffer(1, d.length, sr); b.copyToChannel(d, 0); }
  m.set(k, b);
  return b;
}
const xs = seed => { let h = seed >>> 0 || 1; return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; }; };
// a rat running: strides of four footfalls at nine to thirteen a second, each a click or two of claws, now and then a stutter, a
// soft rustle of the body under it all
export function scurryData(sr, seed) {
  const n = Math.floor(2.6 * sr), d = new Float32Array(n), r = xs(seed);
  let t = 0.03;
  while (t < 2.5) {
    const f = 9 + r() * 4;
    if (r() < 0.07) { t += 0.12 + r() * 0.2; continue; }
    for (let foot = 0; foot < 4; foot++) {
      const ft = t + foot * (0.008 + r() * 0.01), amp = 0.3 + 0.7 * r(), m = 1 + Math.floor(r() * 3);
      for (let c = 0; c < m; c++) {
        const i0 = Math.floor((ft + c * 0.0021) * sr), L = Math.max(4, Math.floor(sr * (0.0004 + r() * 0.0011)));
        for (let j = 0; j < L && i0 + j < n; j++) d[i0 + j] += amp * (r() * 2 - 1) * Math.exp(-j / (L * 0.35));
      }
    }
    t += 1 / f;
  }
  let y = 0;
  for (let i = 0; i < n; i++) { y += 0.06 * ((r() * 2 - 1) - y); d[i] += y * 0.5 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 11 * i / sr)); }
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
  for (let i = 0; i < n; i++) d[i] *= 0.9 / (pk || 1);
  return d;
}
// water trickling: a babble of tiny bubbles (each a short sine whose pitch rises), at a rate that wanders, over a faint hiss;
// written round the buffer's end so it loops without a seam
export function trickleData(sr, secs, seed) {
  const n = Math.floor(secs * sr), d = new Float32Array(n), r = xs(seed);
  let t = 0, rate = 30;
  while (t < secs) {
    rate += (r() - 0.5) * 6; rate = Math.max(12, Math.min(70, rate));
    t += -Math.log(1 - r() * 0.999) / rate;
    const f0 = 380 * Math.pow(7, r()), tau = 0.004 + r() * 0.009, amp = 0.15 + r() * 0.35, L = Math.floor(tau * 5 * sr), i0 = Math.floor(t * sr);
    let ph = 0;
    for (let j = 0; j < L; j++) { const tt = j / sr; ph += 2 * Math.PI * f0 * (1 + 2.5 * tt / (tau * 5)) / sr; d[(i0 + j) % n] += amp * Math.sin(ph) * Math.exp(-tt / tau); }
  }
  let a = 0, b = 0;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { a += 0.3 * ((r() * 2 - 1) - a); b += 0.05 * (a - b); if (pass) d[i] += (a - b) * 0.12; }
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
  for (let i = 0; i < n; i++) d[i] *= 0.8 / (pk || 1);
  return d;
}
