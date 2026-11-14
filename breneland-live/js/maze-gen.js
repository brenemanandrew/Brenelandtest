// Beneath Angell Street: the maze generator. Pure and import-free, so the server (lib/maze.js, a data: URL import like
// bocce-rules.js) and every client build the same maze from a seed. No level data travels, only the seed.
//
// A grid of 4 m cells (W x H, about 30 x 30): a recursive backtracker (long corridors), then braided (some dead ends opened into
// loops, so a chase can go round), then rooms carved in (2x2 to 4x4: a crypt, an ossuary, a flooded cistern, a ritual chamber with
// a glowing sigil, a collapsed library), a start room under the stair and an exit room as far from it as the paths go. Then the
// dressing: flooded cells, locked gates on a few dead ends, torches, glyphs, Elder Signs, roots, niches, candles, a leaning door
// frame. `dist` is the path distance (cells) from every cell to the exit (the HUD's "N m to the stair", the board's number).
//
//   generate(seed, W, H, plan) -> { W, H, seed, cells, rooms, start, exit, water, gates, torches, glyphs, signs, roots, niches, candles,
//                                   lean, dist, startRoom, exitRoom, hides, props, furniture, path, braids, plan }
//   cells[cy * W + cx]: wall bits N 1 (cy - 1), E 2 (cx + 1), S 4 (cy + 1), W 8 (cx - 1). A wall bit is set on BOTH sides.
//
// One maze a week (w16-phase4; Andrew: one a week, five at most): the week is the Eastern week, Monday to Sunday, counted from
// Monday 1970-01-05 (`weekOf(easternDayNumber)`), and week w plays POOL[w mod 5]: five seeds the quality gate found from POOL_BASE
// (the first five that pass every check; `findPool` is how, the checker and the test prove the constant is still what it finds;
// nothing is searched at runtime). `mazeForWeek(week)` builds that week's maze with `week`, `slot` and its gate report on it;
// `seedForDay(day)` is the week's seed for a day (the server and the clients both go through it: one definition of the week).
// The three curated SEEDS stay as the tests' fixtures (walked; their layouts never change: `planFor` gives them the classic plan).
// The variety (`planFor(seed)`, from its own rng so the main draw is untouched): room sizes, one kind twice, a long gallery or a
// crossroads hall, the start room's doors, the exit's side of the map, the water, the braiding, the gates and the alcoves.
// The gate (`gateReport`): each check a named function returning a reason or null; `difficultyOf` scores a maze and names it
// (Easy / Fair / Hard / Dire: the board by the door says it). `mainPath(m)` is the shortest route start -> exit (the goal placer
// to come picks cells from it, from `rooms`, the dead ends and `dist`, all from the same seed).
export const CELL = 4;         // m per cell
export const N = 1, E = 2, S = 4, W = 8;
export const DIRS = [[0, -1, N, S], [1, 0, E, W], [0, 1, S, N], [-1, 0, W, E]]; // dx, dy, bit, the bit on the far side
export const ROOM_KINDS = ['crypt', 'ossuary', 'cistern', 'ritual', 'library'];
// three curated seeds (walked: a clear long way to the exit with loops to double back on, every room reachable, the cistern off the main way)
export const SEEDS = [20261030, 454, 1890];

// ---- the week and the pool
export const WEEK_EPOCH_DAY = 4; // Monday 1970-01-05 as an Eastern day number (days since 1970-01-01): weeks run Monday to Sunday
export const weekOf = day => Math.floor((day - WEEK_EPOCH_DAY) / 7);
export const weekStart = week => week * 7 + WEEK_EPOCH_DAY; // the Monday's day number
// POOL: the first five seeds from POOL_BASE that pass the gate, found by findPool(POOL_BASE, 5) on 2026-11-02 (w16-phase4: the
// five came out consecutive, tries 1 to 5, reading Fair, Hard, Dire, Hard, Easy), kept as a constant so the server and every
// client agree without a search. tools/w16-maze-check.mjs and w16-maze-test prove it still is what findPool finds (so a change to
// the generator or the gate that moves them is caught). Change POOL_BASE and rerun findPool to pick a new five.
export const POOL_BASE = 20261116;
export const POOL = [20261116, 20261117, 20261118, 20261119, 20261120];
export const seedForWeek = week => POOL[((week % POOL.length) + POOL.length) % POOL.length];
export const seedForDay = day => seedForWeek(weekOf(day)); // the week's seed, for a day
export function mazeForWeek(week, W = 30, H = 30) {
  const slot = ((week % POOL.length) + POOL.length) % POOL.length, m = generate(POOL[slot], W, H);
  m.week = week; m.slot = slot; m.report = gateReport(m);
  return m;
}
export const mazeForDay = (day, W, H) => mazeForWeek(weekOf(day), W, H);
// the first n seeds from `base` that pass every check (base, base + 1, ...; the same order everywhere)
export function findPool(base = POOL_BASE, n = POOL.length, maxTries = 400, W = 30, H = 30) {
  const seeds = [], tries = []; let k = 0;
  for (; k < maxTries && seeds.length < n; k++) { const r = gateReport(generate(base + k, W, H)); if (r.ok) { seeds.push(base + k); tries.push(k + 1); } }
  return { seeds, tries, scanned: k };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the plan: what varies from maze to maze. The fixtures get the classic plan (every draw as it always was).
const CLASSIC = Object.freeze({ classic: true, sizes: { crypt: [3, 3], ossuary: [2, 3], cistern: [4, 3], ritual: [3, 3], library: [4, 2] },
  extra: null, gallery: 0, hall: false, exitSide: -1, startDoors: 0, water: 7, puddles: 0, braid: 0.35, gates: 4, alcoves: 4 });
export function planFor(seed) {
  if (SEEDS.includes(seed)) return CLASSIC;
  const r = mulberry32((seed ^ 0x5eed1e55) >>> 0), pick = a => a[Math.floor(r() * a.length)];
  return {
    classic: false,
    sizes: { crypt: [3, 3], ossuary: pick([[2, 3], [3, 3], [2, 4]]), cistern: pick([[4, 3], [3, 3], [3, 4]]), ritual: pick([[3, 3], [3, 4]]), library: pick([[4, 2], [3, 4], [4, 4], [4, 3]]) },
    extra: r() < 0.45 ? pick(['ossuary', 'crypt', 'ritual', 'library']) : null, // one kind twice
    gallery: r() < 0.45 ? 7 + Math.floor(r() * 3) : 0,                         // a long straight gallery, this many cells
    hall: r() < 0.45,                                                           // a crossroads hall: a 3 x 3 open floor
    exitSide: Math.floor(r() * 4),                                              // the exit's side of the map: N E S W; the start across from it
    startDoors: 1 + Math.floor(r() * 3),                                        // the start room's doorways
    water: 5 + Math.floor(r() * 8), puddles: Math.floor(r() * 3),               // flooded corridor cells, and runs of them
    braid: 0.28 + r() * 0.17,                                                   // the share of dead ends opened into loops
    gates: 3 + Math.floor(r() * 3),
    alcoves: 4 + Math.floor(r() * 3),                                           // at least; more if the main path needs them
    pathTarget: 74 + Math.floor(r() * 34),                                      // the exit is the cell on its side whose path is nearest this
  };
}

export function generate(seed = SEEDS[0], W = 30, H = 30, plan = planFor(seed)) {
  const rnd = mulberry32(seed);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const idx = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const cells = new Uint8Array(W * H).fill(15);
  const open = (x, y, d) => { const [dx, dy, bit, far] = DIRS[d]; const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) return false; cells[idx(x, y)] &= ~bit; cells[idx(nx, ny)] &= ~far; return true; };
  const shut = (x, y, d) => { const [dx, dy, bit, far] = DIRS[d]; const nx = x + dx, ny = y + dy; cells[idx(x, y)] |= bit; if (inb(nx, ny)) cells[idx(nx, ny)] |= far; };
  const walls = (x, y) => { let n = 0; for (let d = 0; d < 4; d++) if (cells[idx(x, y)] & DIRS[d][2]) n++; return n; };

  // ---- the backtracker: long corridors, every cell reached
  {
    const seen = new Uint8Array(W * H), stack = [[Math.floor(rnd() * W), Math.floor(rnd() * H)]];
    seen[idx(stack[0][0], stack[0][1])] = 1;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const opts = [];
      for (let d = 0; d < 4; d++) { const nx = x + DIRS[d][0], ny = y + DIRS[d][1]; if (inb(nx, ny) && !seen[idx(nx, ny)]) opts.push(d); }
      if (!opts.length) { stack.pop(); continue; }
      // a bias to carry straight on: longer corridors, fewer wiggles
      const last = stack.length > 1 ? stack[stack.length - 2] : null;
      let d = pick(opts);
      if (last && rnd() < 0.5) { const sd = DIRS.findIndex(q => q[0] === x - last[0] && q[1] === y - last[1]); if (opts.includes(sd)) d = sd; }
      open(x, y, d);
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      seen[idx(nx, ny)] = 1; stack.push([nx, ny]);
    }
  }
  // ---- braid: about a third of the dead ends opened into a loop (the plan's share)
  const deadEnds = [];
  let braids = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (walls(x, y) === 3) deadEnds.push([x, y]);
  for (const [x, y] of deadEnds) {
    if (rnd() > plan.braid || walls(x, y) !== 3) continue;
    const opts = [];
    for (let d = 0; d < 4; d++) { const nx = x + DIRS[d][0], ny = y + DIRS[d][1]; if (inb(nx, ny) && (cells[idx(x, y)] & DIRS[d][2])) opts.push(d); }
    if (opts.length) { open(x, y, pick(opts)); braids++; }
  }
  // ---- rooms: carved in, never overlapping, a cell off the border and off each other
  const rooms = [];
  const carved = []; // open floors that are not rooms (a gallery, a hall): nothing else lands on them either
  const overlaps = (x0, y0, x1, y1, pad = 1) => rooms.some(r => !(x1 + pad < r.x0 || x0 - pad > r.x1 || y1 + pad < r.y0 || y0 - pad > r.y1)) || carved.some(r => !(x1 + pad < r.x0 || x0 - pad > r.x1 || y1 + pad < r.y0 || y0 - pad > r.y1));
  const carve = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { if (x < x1) open(x, y, 1); if (y < y1) open(x, y, 2); } };
  const room = kind => {
    let [w, h] = plan.sizes[kind]; if (rnd() < 0.5) [w, h] = [h, w];
    for (let tries = 0; tries < 60; tries++) {
      const x0 = 1 + Math.floor(rnd() * (W - w - 2)), y0 = 1 + Math.floor(rnd() * (H - h - 2)), x1 = x0 + w - 1, y1 = y0 + h - 1;
      if (overlaps(x0, y0, x1, y1)) continue;
      carve(x0, y0, x1, y1);
      rooms.push({ kind, x0, y0, x1, y1 });
      break;
    }
  };
  for (const kind of ROOM_KINDS) room(kind);
  if (plan.extra) room(plan.extra);
  // a room carved over the corridors has a doorway wherever one ran through it: with a plan the extra ones are shut, two or three
  // kept (never one that cuts the maze in two), so a room is a room with walls for its shelves and its desk
  if (!plan.classic) for (const r of rooms) {
    const doors = [];
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) for (let d = 0; d < 4; d++) { const nx = x + DIRS[d][0], ny = y + DIRS[d][1]; if (!inb(nx, ny) || (cells[idx(x, y)] & DIRS[d][2]) || (nx >= r.x0 && nx <= r.x1 && ny >= r.y0 && ny <= r.y1)) continue; doors.push([x, y, d]); }
    for (let i = doors.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [doors[i], doors[j]] = [doors[j], doors[i]]; }
    let left = doors.length;
    const keep = 2 + Math.floor(rnd() * 2);
    for (const [x, y, d] of doors) {
      if (left <= keep) break;
      shut(x, y, d);
      const q = [idx(r.x0, r.y0)], seen = new Uint8Array(W * H); seen[q[0]] = 1;
      for (let i = 0; i < q.length; i++) { const c = q[i], cx = c % W, cy = (c - cx) / W; for (let k = 0; k < 4; k++) { if (cells[c] & DIRS[k][2]) continue; const n = idx(cx + DIRS[k][0], cy + DIRS[k][1]); if (!seen[n]) { seen[n] = 1; q.push(n); } } }
      if (q.length < W * H) open(x, y, d); else left--;
    }
  }
  // a long gallery: a straight run of cells with the walls between them opened (its sides stay); a crossroads hall: a 3 x 3 open floor.
  // Neither is a room: the kit draws them as the corridor cells they are
  if (plan.gallery) for (let tries = 0; tries < 40; tries++) {
    const n = plan.gallery, horiz = rnd() < 0.5, x0 = 1 + Math.floor(rnd() * (W - (horiz ? n : 1) - 2)), y0 = 1 + Math.floor(rnd() * (H - (horiz ? 1 : n) - 2));
    const x1 = horiz ? x0 + n - 1 : x0, y1 = horiz ? y0 : y0 + n - 1;
    if (overlaps(x0, y0, x1, y1)) continue;
    for (let k = 0; k < n - 1; k++) open(horiz ? x0 + k : x0, horiz ? y0 : y0 + k, horiz ? 1 : 2);
    carved.push({ kind: 'gallery', x0, y0, x1, y1 });
    break;
  }
  if (plan.hall) for (let tries = 0; tries < 40; tries++) {
    const x0 = 1 + Math.floor(rnd() * (W - 5)), y0 = 1 + Math.floor(rnd() * (H - 5));
    if (overlaps(x0, y0, x0 + 2, y0 + 2)) continue;
    carve(x0, y0, x0 + 2, y0 + 2);
    carved.push({ kind: 'hall', x0, y0, x1: x0 + 2, y1: y0 + 2 });
    break;
  }
  // ---- the start (north-west quarter; with a plan, across the map from the exit's side) and the exit (the farthest cell by path,
  // on its side of the map), each a 2x2 room
  const bfs = (sx, sy) => {
    const d = new Int32Array(W * H).fill(-1), q = [idx(sx, sy)]; d[q[0]] = 0;
    for (let i = 0; i < q.length; i++) { const c = q[i], x = c % W, y = (c - x) / W; for (let k = 0; k < 4; k++) { if (cells[c] & DIRS[k][2]) continue; const n = idx(x + DIRS[k][0], y + DIRS[k][1]); if (d[n] < 0) { d[n] = d[c] + 1; q.push(n); } } }
    return d;
  };
  const side = plan.exitSide; // -1 classic; 0 N 1 E 2 S 3 W
  const third = Math.floor(W / 3), thirdH = Math.floor(H / 3);
  // the start's range (x, y) and whether a cell is on the exit's side
  const half = Math.floor(W / 2), halfH = Math.floor(H / 2);
  const sx0 = side === 3 ? half : 1, sxn = side === 1 ? half - 2 : side === 3 ? half - 2 : side < 0 ? W / 2 - 3 : W - 3;
  const sy0 = side === 0 ? halfH : 1, syn = side === 2 ? halfH - 2 : side === 0 ? halfH - 2 : side < 0 ? H / 2 - 3 : H - 3;
  const onSide = (x, y) => side < 0 || (side === 0 ? y < thirdH : side === 1 ? x >= W - third : side === 2 ? y >= H - thirdH : x < third);
  let start = null;
  for (let tries = 0; tries < 80 && !start; tries++) { const x = sx0 + Math.floor(rnd() * sxn), y = sy0 + Math.floor(rnd() * syn); if (!overlaps(x, y, x + 1, y + 1)) start = { cx: x, cy: y }; }
  if (!start) start = { cx: 1, cy: 1 };
  const startRoom = { kind: 'start', x0: start.cx, y0: start.cy, x1: start.cx + 1, y1: start.cy + 1 };
  const inRoom = (x, y) => rooms.find(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) || null;
  // with a plan the start room is carved first and its extra doorways shut (never one that cuts the maze in two), so the way
  // from it is settled before the exit is chosen by it
  if (!plan.classic) {
    carve(startRoom.x0, startRoom.y0, startRoom.x1, startRoom.y1); rooms.push(startRoom);
    const doors = [];
    for (let y = startRoom.y0; y <= startRoom.y1; y++) for (let x = startRoom.x0; x <= startRoom.x1; x++) for (let d = 0; d < 4; d++) { const nx = x + DIRS[d][0], ny = y + DIRS[d][1]; if (!inb(nx, ny) || (cells[idx(x, y)] & DIRS[d][2]) || inRoom(nx, ny) === startRoom) continue; doors.push([x, y, d]); }
    for (let i = doors.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [doors[i], doors[j]] = [doors[j], doors[i]]; }
    let left = doors.length;
    for (const [x, y, d] of doors) {
      if (left <= plan.startDoors) break;
      shut(x, y, d);
      if (bfs(start.cx, start.cy).some(v => v < 0)) open(x, y, d); else left--;
    }
  }
  let d0 = bfs(start.cx, start.cy);
  let exit = null, best = -1;
  // classic: the farthest cell by path; with a plan: on its side, the cell whose path is nearest the plan's target (the farther on a
  // tie), a cell off the border, and one whose room would have stone across from the doorway the way in comes by (the flight
  // rises away from that doorway to the arched door in the far wall: maze-kit.js mainEntrance)
  const score = v => (side < 0 ? v : 1000 - Math.abs(v - plan.pathTarget) * 4 + v / 1000);
  const farWallSolid = (x0, y0) => {
    let ent = -1, ed = 1e9;
    for (let y = y0; y <= y0 + 1; y++) for (let x = x0; x <= x0 + 1; x++) for (let k = 0; k < 4; k++) { const nx = x + DIRS[k][0], ny = y + DIRS[k][1]; if ((cells[idx(x, y)] & DIRS[k][2]) || !inb(nx, ny) || (nx >= x0 && nx <= x0 + 1 && ny >= y0 && ny <= y0 + 1)) continue; const d = d0[idx(nx, ny)]; if (d >= 0 && d < ed) { ed = d; ent = k; } }
    if (ent < 0) return false;
    const far = (ent + 2) % 4;
    for (let y = y0; y <= y0 + 1; y++) for (let x = x0; x <= x0 + 1; x++) { const nx = x + DIRS[far][0], ny = y + DIRS[far][1]; if (nx >= x0 && nx <= x0 + 1 && ny >= y0 && ny <= y0 + 1) continue; if (!(cells[idx(x, y)] & DIRS[far][2])) return false; }
    return true;
  };
  for (let y = 1; y < (side < 0 ? H - 1 : H - 2); y++) for (let x = 1; x < (side < 0 ? W - 1 : W - 2); x++) { const v = d0[idx(x, y)]; if (v >= 0 && score(v) > best && onSide(x, y) && !overlaps(x, y, x + 1, y + 1, 0) && (side < 0 || farWallSolid(x, y))) { best = score(v); exit = { cx: x, cy: y }; } }
  if (!exit) exit = { cx: W - 2, cy: H - 2 };
  const exitRoom = { kind: 'exit', x0: exit.cx, y0: exit.cy, x1: exit.cx + 1, y1: exit.cy + 1 };
  if (plan.classic) { carve(startRoom.x0, startRoom.y0, startRoom.x1, startRoom.y1); rooms.push(startRoom); }
  carve(exitRoom.x0, exitRoom.y0, exitRoom.x1, exitRoom.y1);
  rooms.push(exitRoom);
  if (!plan.classic) {
    // after a wall is shut: if the maze came apart, open one other wall between the part the start still reaches and the rest
    // (never a stair room's wall, never the cell just made a dead end): the way round goes on somewhere else. Only a small piece
    // may be cut off, never the exit's, and the wall opened is one that does not shorten the way from the start to the exit,
    // among a dozen tried (else the one that shortens it least)
    const stairRoom = (x, y) => { const r = inRoom(x, y); return r === startRoom || r === exitRoom; };
    const whole = () => !bfs(start.cx, start.cy).some(v => v < 0);
    const exitCell = idx(exit.cx, exit.cy);
    const reroute = (except, undo, keep) => {
      for (let t = 0; t < 3; t++) {
        const d = bfs(start.cx, start.cy);
        if (!d.some(v => v < 0)) return true;
        let cut = 0; for (let i = 0; i < d.length; i++) if (d[i] < 0) cut++;
        if (cut > 15 || d[exitCell] < 0) return false;
        const opts = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = idx(x, y); if (d[c] < 0 || c === except || stairRoom(x, y)) continue; for (let k = 0; k < 4; k++) { const nx = x + DIRS[k][0], ny = y + DIRS[k][1]; if (!inb(nx, ny) || !(cells[c] & DIRS[k][2]) || d[idx(nx, ny)] >= 0 || stairRoom(nx, ny)) continue; opts.push([x, y, k]); } }
        if (!opts.length) return false;
        for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
        let bestO = null, bl = -1;
        for (let i = 0; i < Math.min(12, opts.length); i++) { const [x, y, k] = opts[i]; open(x, y, k); const l = bfs(start.cx, start.cy)[exitCell]; shut(x, y, k); if (l > bl) { bl = l; bestO = opts[i]; } if (l >= keep) break; }
        const [x, y, k] = bestO; open(x, y, k); undo?.push(() => shut(x, y, k));
      }
      return whole();
    };
    // the exit room's far wall shut, should the room have come out with an opening there after all (the flight rises away from
    // the doorway nearest the start, maze-kit.js mainEntrance, to the wall across from it, where the arched door to the garden goes)
    d0 = bfs(start.cx, start.cy);
    let ent = -1, ed = 1e9;
    for (let y = exitRoom.y0; y <= exitRoom.y1; y++) for (let x = exitRoom.x0; x <= exitRoom.x1; x++) for (let k = 0; k < 4; k++) { const nx = x + DIRS[k][0], ny = y + DIRS[k][1]; if ((cells[idx(x, y)] & DIRS[k][2]) || !inb(nx, ny) || inRoom(nx, ny) === exitRoom) continue; if (d0[idx(nx, ny)] >= 0 && d0[idx(nx, ny)] < ed) { ed = d0[idx(nx, ny)]; ent = k; } }
    if (ent >= 0) {
      const far = (ent + 2) % 4;
      for (let y = exitRoom.y0; y <= exitRoom.y1; y++) for (let x = exitRoom.x0; x <= exitRoom.x1; x++) { const nx = x + DIRS[far][0], ny = y + DIRS[far][1]; if ((cells[idx(x, y)] & DIRS[far][2]) || !inb(nx, ny) || inRoom(nx, ny) === exitRoom) continue; const undo = [], keep = d0[exitCell]; shut(x, y, far); if (!reroute(-1, undo, keep)) { for (const u of undo.reverse()) u(); open(x, y, far); } }
    }
    // alcoves along the main path: every dozen cells or so with no dead end near, a dead end is made beside the path, so a hiding
    // spot's curtain (maze-ghoul) is always a few steps away: a dead end already next to the path through a wall is moved onto it
    // (opened to the path, shut from where it hung), else a corridor cell beside the path is opened to it and shut at its far side,
    // the way round that was cut going on through a wall opened elsewhere (reroute). That can move the shortest route: so three
    // passes, each on the route as it is
    const inCarved = (x, y) => carved.some(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
    const deadEndNear = (c, depth) => { // a dead end (not a room's cell) within `depth` cells' walk of cell c
      const seen = new Set([c]), q = [[c, 0]];
      for (let i = 0; i < q.length; i++) { const [cc, d] = q[i], x = cc % W, y = (cc - x) / W; if (walls(x, y) === 3 && !inRoom(x, y)) return true; if (d >= depth) continue; for (let k = 0; k < 4; k++) { if (cells[cc] & DIRS[k][2]) continue; const n = idx(x + DIRS[k][0], y + DIRS[k][1]); if (!seen.has(n)) { seen.add(n); q.push([n, d + 1]); } } }
      return false;
    };
    for (let pass = 0; pass < 3; pass++) {
      const pathP = mainPath({ W, H, cells, rooms, start, exit, dist: bfs(exit.cx, exit.cy) }), onP = new Set(pathP), keep = pathP.length - 1;
      for (let i = 7; i < pathP.length - 3; i += 12) {
        if (deadEndNear(pathP[i], 3)) continue;
        let made = false;
        for (const want of [3, 2]) for (const j of [i, i + 1, i - 1, i + 2, i - 2, i + 3, i - 3]) { // (a dead end to move first, then a corridor cell to cut)
          if (made || j < 1 || j >= pathP.length - 1) continue;
          const p = pathP[j], px = p % W, py = (p - px) / W;
          for (let k = 0; k < 4 && !made; k++) {
            const nx = px + DIRS[k][0], ny = py + DIRS[k][1], n = idx(nx, ny), back = (k + 2) % 4;
            if (!inb(nx, ny) || onP.has(n) || inRoom(nx, ny) || inCarved(nx, ny) || walls(nx, ny) !== want) continue;
            const undo = [], wasWall = !!(cells[p] & DIRS[k][2]);
            if (wasWall) { open(px, py, k); undo.push(() => shut(px, py, k)); }
            for (let d = 0; d < 4; d++) if (d !== back && !(cells[n] & DIRS[d][2])) { shut(nx, ny, d); undo.push(() => open(nx, ny, d)); }
            if (reroute(n, undo, keep)) made = true; else for (const u of undo.reverse()) u();
          }
        }
      }
    }
  }
  const dist = bfs(exit.cx, exit.cy);
  d0 = bfs(start.cx, start.cy);
  const path = mainPath({ W, H, cells, rooms, start, exit, dist });

  // ---- the dressing (all from the same rng, so every screen agrees)
  const water = new Uint8Array(W * H);
  for (const cistern of rooms) if (cistern.kind === 'cistern') for (let y = cistern.y0; y <= cistern.y1; y++) for (let x = cistern.x0; x <= cistern.x1; x++) water[idx(x, y)] = 1;
  const keepDry = (x, y) => !plan.classic && walls(x, y) === 3; // (with a plan the dead ends stay dry: they are the alcoves)
  for (let k = 0, n = 0; k < 200 && n < plan.water; k++) { const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H); if (inRoom(x, y) || water[idx(x, y)] || keepDry(x, y)) continue; water[idx(x, y)] = 1; n++; }
  // a puddle's run: a flooded cell and the one or two past it along an open way
  for (let p = 0; p < plan.puddles; p++) for (let k = 0; k < 60; k++) {
    const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H), d = Math.floor(rnd() * 4), n = 2 + Math.floor(rnd() * 2);
    if (inRoom(x, y) || water[idx(x, y)] || keepDry(x, y)) continue;
    let cx = x, cy = y, ok = true;
    for (let i = 1; i < n; i++) { if (cells[idx(cx, cy)] & DIRS[d][2]) { ok = false; break; } cx += DIRS[d][0]; cy += DIRS[d][1]; if (!inb(cx, cy) || inRoom(cx, cy) || keepDry(cx, cy)) { ok = false; break; } }
    if (!ok) continue;
    cx = x; cy = y; for (let i = 0; i < n; i++) { water[idx(cx, cy)] = 1; cx += DIRS[d][0]; cy += DIRS[d][1]; }
    break;
  }
  // locked gates: a few dead ends away from the start, the gate across their one opening (a visual dead end, one cell shorter)
  const gates = [];
  const ends = [];
  const onPath = new Set(path), byPath = (x, y) => !plan.classic && [0, 1, 2, 3].some(d => !(cells[idx(x, y)] & DIRS[d][2]) && onPath.has(idx(x + DIRS[d][0], y + DIRS[d][1]))); // (a dead end off the main path is an alcove, not a gate)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (walls(x, y) === 3 && !inRoom(x, y) && d0[idx(x, y)] > 6 && dist[idx(x, y)] > 3 && !byPath(x, y)) ends.push([x, y]);
  for (let k = 0; k < plan.gates && ends.length; k++) { const i = Math.floor(rnd() * ends.length), [x, y] = ends.splice(i, 1)[0]; const d = DIRS.findIndex(q => !(cells[idx(x, y)] & q[2])); gates.push({ cx: x, cy: y, dir: d }); }
  // wall spots: [cx, cy, side] where that side is a wall of a corridor cell (not a room's inside)
  const wallSpots = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (inRoom(x, y)) continue; for (let d = 0; d < 4; d++) if (cells[idx(x, y)] & DIRS[d][2]) wallSpots.push({ cx: x, cy: y, side: d }); }
  const takeSpots = (n, minGap = 3) => {
    const out = [];
    for (let k = 0; k < 400 && out.length < n && wallSpots.length; k++) {
      const s = wallSpots[Math.floor(rnd() * wallSpots.length)];
      if (out.some(o => Math.abs(o.cx - s.cx) + Math.abs(o.cy - s.cy) < minGap)) continue;
      out.push(s);
    }
    return out;
  };
  const torches = takeSpots(5, 7);
  const glyphs = takeSpots(7, 4);
  const signs = takeSpots(5, 5);
  const niches = takeSpots(6, 4);
  const candles = takeSpots(8, 3);
  const roots = [];
  for (let k = 0, n = 0; k < 200 && n < 10; k++) { const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H); if (inRoom(x, y) || water[idx(x, y)]) continue; roots.push({ cx: x, cy: y, r: rnd() }); n++; }
  // a leaning door frame at one room's doorway: the first opening found round the library (or the crypt)
  let lean = null;
  for (const r of [rooms.find(q => q.kind === 'library'), rooms.find(q => q.kind === 'crypt')]) {
    if (!r || lean) continue;
    for (let x = r.x0; x <= r.x1 && !lean; x++) { if (!(cells[idx(x, r.y0)] & N)) lean = { cx: x, cy: r.y0, side: 0 }; else if (!(cells[idx(x, r.y1)] & S)) lean = { cx: x, cy: r.y1, side: 2 }; }
  }
  const hides = hidingSpots({ W, H, seed, cells, rooms, gates, water, dist, d0, inRoom, plan, path });
  const things = props({ W, H, seed, cells, rooms, gates, water, hides, inRoom, taken: [torches, glyphs, signs, niches, candles] });
  return { W, H, seed, cells, rooms, start, exit, startRoom, exitRoom, water, gates, torches, glyphs, signs, roots, niches, candles, lean, dist, hides, props: things,
    furniture: [...furniture(rooms), ...things.filter(t => t.box).map(t => ({ ...t.box, kind: t.kind, room: t.room, prop: true }))],
    path, braids, carved, plan };
}

// the main path: the shortest route from the start to the exit as cells, the one that keeps out of the cistern when a route as
// short does (each step to a neighbour one closer by the distance used)
export function mainPath(m) {
  const { W, H, cells, dist } = m, cistern = new Uint8Array(W * H);
  for (const r of m.rooms) if (r.kind === 'cistern') for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) cistern[y * W + x] = 1;
  const dry = bfsFrom(m, m.exit.cx, m.exit.cy, cells, cistern), s = m.start.cy * W + m.start.cx;
  const d = dry[s] === dist[s] ? dry : dist;
  const out = [s]; let c = s;
  while (d[c] > 0) {
    const x = c % W, y = (c - x) / W; let next = -1;
    for (let k = 0; k < 4; k++) { if (cells[c] & DIRS[k][2]) continue; const n = (y + DIRS[k][1]) * W + x + DIRS[k][0]; if (d[n] === d[c] - 1) { next = n; break; } }
    if (next < 0) break;
    c = next; out.push(c);
  }
  return out;
}

// ---- hiding spots: where a still player is passed by. From their own rng (seed-derived), so nothing above changes.
//   alcove       a dead end with a tattered curtain across it: stand behind the curtain (4 a fixture, spread out; a plan's
//                along the main path first, then spread)
//   sarcophagus  the gaps between the crypt's three sarcophagi (maze-kit.js puts them 2.6 m apart): crouch between them
//   curtain      a curtain hung along a library wall, clear of the shelves (the kit's library boxes, mirrored here)
// Each { kind, x, z, r, nx, nz, cx, cy }: metres in the maze's frame, r the radius that counts as in it, (nx, nz) the way out (where the
// ghoul goes by), the cell. The curtain hangs across (nx, nz) at `cur` metres from the spot, `w` wide (the client draws it).
// With a plan the alcoves are chosen to cover the main path first (one within a few cells of every stretch of it), then spread.
function hidingSpots({ W, H, seed, cells, rooms, gates, water, dist, d0, inRoom, plan = CLASSIC, path = [] }) {
  const rnd = mulberry32((seed ^ 0x9e3779b9) >>> 0), idx = (x, y) => y * W + x, out = [];
  const gated = new Set();
  for (const g of gates) { gated.add(idx(g.cx, g.cy)); const nx = g.cx + DIRS[g.dir][0], ny = g.cy + DIRS[g.dir][1]; if (nx >= 0 && ny >= 0 && nx < W && ny < H) gated.add(idx(nx, ny)); }
  const ends = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = cells[idx(x, y)];
    let n = 0, open = -1;
    for (let d = 0; d < 4; d++) if (c & DIRS[d][2]) n++; else open = d;
    if (n !== 3 || inRoom(x, y) || gated.has(idx(x, y)) || water[idx(x, y)] || d0[idx(x, y)] < 5 || dist[idx(x, y)] < 3) continue;
    ends.push([x, y, open]);
  }
  for (let i = ends.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ends[i], ends[j]] = [ends[j], ends[i]]; }
  const alcove = ([x, y, d]) => { const [dx, dy] = DIRS[d]; out.push({ kind: 'alcove', x: x * CELL + 2 - dx * 0.75, z: y * CELL + 2 - dy * 0.75, r: 1.0, nx: dx, nz: dy, cx: x, cy: y, cur: 1.55, w: 3.4 }); };
  const apart = (x, y, gap = 6) => !out.some(o => Math.abs(o.cx - x) + Math.abs(o.cy - y) < gap);
  if (!plan.classic && path.length) {
    // each dead end's place along the main path (the nearest path cell within three cells' walk), then a greedy sweep along it:
    // from the last one's reach, the farthest next one that leaves no stretch of twenty cells uncovered
    const at = new Map(); path.forEach((c, i) => at.set(c, i));
    const near = e => { const d = nearPath(cells, W, H, idx(e[0], e[1]), at, 3); return d < 0 ? -1 : d; };
    const cand = ends.map(e => [e, near(e)]).filter(q => q[1] >= 0).sort((a, b) => a[1] - b[1]);
    let cur = 0;
    while (out.length < 9 && cur < path.length) { // (as many as the path needs: none of it more than a few cells from one)
      let best = null;
      for (const [e, i] of cand) if (i >= cur - 2 && i <= cur + 21 && apart(e[0], e[1], 2) && (!best || i > best[1])) best = [e, i];
      if (!best) break;
      alcove(best[0]); cur = best[1] + 3;
    }
  }
  for (const e of ends) {
    if (out.length >= plan.alcoves) break;
    if (!apart(e[0], e[1])) continue;
    alcove(e);
  }
  const crypt = rooms.find(r => r.kind === 'crypt');
  if (crypt) {
    const rw = (crypt.x1 - crypt.x0 + 1) * CELL, rd = (crypt.y1 - crypt.y0 + 1) * CELL, mx = crypt.x0 * CELL + rw / 2, mz = crypt.y0 * CELL + rd / 2;
    for (const s of [-1, 1]) { const x = mx + s * 1.3; out.push({ kind: 'sarcophagus', x, z: mz, r: 0.55, nx: 0, nz: 1, cx: Math.floor(x / CELL), cy: Math.floor(mz / CELL), cur: 0, w: 0 }); }
  }
  const lib = rooms.find(r => r.kind === 'library');
  if (lib) {
    // the kit's library boxes (maze-kit.js): two standing shelves on the west side, two toppled on the east, a reading stand in the middle
    const x0 = lib.x0 * CELL, z0 = lib.y0 * CELL, rw = (lib.x1 - lib.x0 + 1) * CELL, rd = (lib.y1 - lib.y0 + 1) * CELL, boxes = [];
    for (let k = 0; k < 4; k++) { const x = x0 + 0.9 + (k % 2) * (rw - 1.8), z = z0 + rd * (0.3 + 0.4 * (k >> 1)); boxes.push(k % 2 === 0 ? [x - 0.3, z - 1.3, x + 0.3, z + 1.3] : [x - 1.2, z - 1.3, x + 1.2, z + 1.3]); }
    boxes.push([x0 + rw / 2 - 0.65, z0 + rd / 2 - 0.4, x0 + rw / 2 + 0.65, z0 + rd / 2 + 0.4]);
    const gap = (x, z) => { let m = 9; for (const b of boxes) m = Math.min(m, Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - z, 0, z - b[3]))); return m; };
    let best = null, bs = -1;
    // along each wall of the room (0.85 m in from the cell edge), where the wall is solid, the curtain's whole strip clear of furniture
    for (let d = 0; d < 4; d++) for (let t = 1.2; t <= (d % 2 ? rd : rw) - 1.2; t += 0.4) {
      const [dx, dy] = DIRS[d], inX = -dx, inZ = -dy;
      const x = d === 1 ? x0 + rw - 0.85 : d === 3 ? x0 + 0.85 : x0 + t, z = d === 2 ? z0 + rd - 0.85 : d === 0 ? z0 + 0.85 : z0 + t;
      const cx = Math.floor((x - dx * 0.9) / CELL), cy = Math.floor((z - dy * 0.9) / CELL);
      if (!(cells[idx(Math.min(W - 1, Math.max(0, cx)), Math.min(H - 1, Math.max(0, cy)))] & DIRS[d][2])) continue;
      const ax = dx ? 0 : 1, az = dx ? 1 : 0; // along the wall
      let clear = 9;
      for (let a = -1; a <= 1; a += 0.5) for (let o = 0; o <= 1.3; o += 0.65) clear = Math.min(clear, gap(x + inX * o + ax * a * 0.9, z + inZ * o + az * a * 0.9));
      if (clear < 0.5) continue;
      const score = clear + rnd() * 0.3;
      if (score > bs) { bs = score; best = { kind: 'curtain', x, z, r: 0.7, nx: inX, nz: inZ, cx, cy, cur: 0.75, w: 1.9 }; }
    }
    if (best) out.push(best);
  }
  return out;
}
// the index along the path of the nearest path cell within `depth` cells' walk of cell c (-1: none)
function nearPath(cells, W, H, c, at, depth) {
  const seen = new Set([c]), q = [[c, 0]];
  for (let i = 0; i < q.length; i++) {
    const [cc, d] = q[i];
    if (at.has(cc)) return at.get(cc);
    if (d >= depth) continue;
    const x = cc % W, y = (cc - x) / W;
    for (let k = 0; k < 4; k++) { if (cells[cc] & DIRS[k][2]) continue; const nx = x + DIRS[k][0], ny = y + DIRS[k][1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (!seen.has(n)) { seen.add(n); q.push([n, d + 1]); } }
  }
  return -1;
}

// ---- the dressing that tells a story: old crates and barrels, rubble and fallen bricks at a wall's foot, rotted planks, rusted
// chains and rings, an iron grate, a rope, broken pots, a toppled chair, in the library scattered paper and a desk with a guttered
// candle, stores left in the stair rooms. From their own rng (seed-derived: every screen the same, nothing above changes), sparse
// (about one corridor cell in twelve, a few a room), never in a hiding spot, a gate's cells or on a wall that already holds a
// torch, a candle, a glyph, a sign or a niche, and only against a solid wall (never across an opening).
//   -> [{ kind, x, z, yaw, k, cx, cy, side, room, box? }]   x, z metres in the maze's frame; yaw faces away from the wall it stands
//      against (side -1: on the open floor); k 0..1 its own variation; box { minX, minZ, maxX, maxZ } for the things you'd walk
//      into: the kit's colliders, and generate() adds them to `furniture`, so the ghoul goes round them too.
export const PROP_KINDS = ['crate', 'barrel', 'rubble', 'planks', 'pots', 'chains', 'grate', 'rope', 'chair', 'bones', 'desk', 'papers'];
const FACE = CELL / 2 - 0.3; // a wall's face from its cell's middle (the kit's WALL_T / 2)
const SIDE_YAW = [0, -Math.PI / 2, Math.PI, Math.PI / 2]; // facing away from the wall: (sin, cos) = minus the side's way out
// the corridor kinds: weight, how far its middle stands out from the wall, its half size along the wall and out (null: no collider)
const PROP_AT = [['rubble', 3, 0.36, [0.5, 0.34]], ['crate', 2.2, 0.4, [0.48, 0.42]], ['barrel', 2, 0.36, [0.36, 0.36]], ['planks', 1.4, 0.3, [0.42, 0.32]],
  ['pots', 1.6, 0.3, null], ['chains', 2, 0, null], ['rope', 1, 0.36, null], ['chair', 1, 0.6, [0.45, 0.45]], ['grate', 1, 0, null]];
function props({ W, H, seed, cells, rooms, gates, water, hides, inRoom, taken }) {
  const rnd = mulberry32((seed ^ 0x2c1b3c6d) >>> 0), idx = (x, y) => y * W + x, out = [];
  const solid = (x, y, d) => x >= 0 && y >= 0 && x < W && y < H && !!(cells[idx(x, y)] & DIRS[d][2]);
  const used = new Set(); for (const list of taken) for (const t of list) used.add(`${t.cx},${t.cy},${t.side}`);
  const skip = new Set();
  for (const g of gates) { skip.add(idx(g.cx, g.cy)); const nx = g.cx + DIRS[g.dir][0], ny = g.cy + DIRS[g.dir][1]; if (nx >= 0 && ny >= 0 && nx < W && ny < H) skip.add(idx(nx, ny)); }
  for (const h of hides) if (h.kind === 'alcove') { skip.add(idx(h.cx, h.cy)); const nx = h.cx + h.nx, ny = h.cy + h.nz; if (nx >= 0 && ny >= 0 && nx < W && ny < H) skip.add(idx(nx, ny)); }
  const nearHide = (x, z, r) => hides.some(h => Math.hypot(h.x - x, h.z - z) < h.r + r + 0.4);
  // a thing against wall `side` of cell (cx, cy), `u` metres along the wall (left to right as you face it), its middle `out0`
  // metres from the face; half: its half size along the wall and out from it (the collider), or null
  const atWall = (kind, cx, cy, side, u, out0, k, room, half) => {
    const [dx, dy] = DIRS[side], ax = -dy, ay = dx; // along the wall
    const x = cx * CELL + CELL / 2 + dx * (FACE - out0) + ax * u, z = cy * CELL + CELL / 2 + dy * (FACE - out0) + ay * u;
    const t = { kind, x, z, yaw: SIDE_YAW[side], k, cx, cy, side, room };
    if (half) { const hx = Math.abs(ax) * half[0] + Math.abs(dx) * half[1], hz = Math.abs(ay) * half[0] + Math.abs(dy) * half[1]; t.box = { minX: x - hx, minZ: z - hz, maxX: x + hx, maxZ: z + hz }; }
    return t;
  };
  const total = PROP_AT.reduce((a, q) => a + q[1], 0);
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
    const roll = rnd(), kr = rnd() * total, sr = rnd(), u = (rnd() - 0.5) * 2, k = rnd(); // five draws a cell, always, so one cell's luck never moves another's
    if (roll > 0.085 || inRoom(cx, cy) || water[idx(cx, cy)] || skip.has(idx(cx, cy))) continue;
    let acc = 0, K = PROP_AT[0]; for (const q of PROP_AT) { acc += q[1]; if (kr < acc) { K = q; break; } }
    if (K[0] === 'grate') { // in the floor, off the middle a little (you walk over it)
      const x = cx * CELL + CELL / 2 + u * 0.6, z = cy * CELL + CELL / 2 + (k - 0.5) * 1.2;
      if (!nearHide(x, z, 0.5)) out.push({ kind: 'grate', x, z, yaw: Math.floor(k * 4) * Math.PI / 2, k, cx, cy, side: -1, room: null });
      continue;
    }
    const sides = [0, 1, 2, 3].filter(d => solid(cx, cy, d) && !used.has(`${cx},${cy},${d}`));
    if (!sides.length) continue;
    const side = sides[Math.floor(sr * sides.length)];
    const t = atWall(K[0], cx, cy, side, u * 1.0, K[2], k, null, K[3]);
    if (nearHide(t.x, t.z, 0.6)) continue;
    used.add(`${cx},${cy},${side}`);
    out.push(t);
  }
  // ---- a few a room, by kind (each against a solid stretch of the room's wall, clear of its furniture)
  const furn = furniture(rooms);
  const clear = t => !t.box || !furn.some(f => !(t.box.maxX < f.minX - 0.3 || t.box.minX > f.maxX + 0.3 || t.box.maxZ < f.minZ - 0.3 || t.box.minZ > f.maxZ + 0.3));
  for (const r of rooms) {
    const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
    // the room's wall `side` at fraction f along it (0 its west or north end, 1 the other): the cell on it and where in that cell
    const onWall = (kind, side, f, out0, half, k = rnd()) => {
      const n = side % 2 ? h : w, pos = Math.min(n - 0.001, Math.max(0.001, f * n)), i = Math.floor(pos);
      const cx = side === 1 ? r.x1 : side === 3 ? r.x0 : r.x0 + i, cy = side === 0 ? r.y0 : side === 2 ? r.y1 : r.y0 + i;
      if (!solid(cx, cy, side) || used.has(`${cx},${cy},${side}`)) return null;
      const along = (pos - i - 0.5) * CELL * 0.82, u = side === 0 || side === 1 ? along : -along; // u runs left to right as you face the wall
      const t = atWall(kind, cx, cy, side, u, out0, k, r.kind, half);
      if (!clear(t) || nearHide(t.x, t.z, 0.6) || out.some(o => o.room === r.kind && Math.hypot(o.x - t.x, o.z - t.z) < 1.4)) return null;
      used.add(`${cx},${cy},${side}`);
      out.push(t); return t;
    };
    const any = (kind, tries = 8) => { const K = PROP_AT.find(q => q[0] === kind) || ROOM_AT[kind]; for (let q = 0; q < tries; q++) if (onWall(kind, Math.floor(rnd() * 4), 0.08 + rnd() * 0.84, K[2], K[3])) return true; return false; };
    if (r.kind === 'crypt') { any('rubble'); any('pots'); any('pots'); any('chains'); }
    else if (r.kind === 'ossuary') { any('bones'); any('bones'); }
    else if (r.kind === 'cistern') { any('chains'); any('chains'); }
    else if (r.kind === 'ritual') { any('pots'); any('chair'); any('chains'); }
    else if (r.kind === 'library') {
      any('desk', 16);
      const x0 = r.x0 * CELL, z0 = r.y0 * CELL, rw = w * CELL, rd = h * CELL;
      for (let q = 0, n = 0; q < 40 && n < 2; q++) { // the scattered paper: a couple of drifts on the open floor
        const x = x0 + 1 + rnd() * (rw - 2), z = z0 + 1 + rnd() * (rd - 2), k = rnd();
        if (furn.some(f => x > f.minX - 0.6 && x < f.maxX + 0.6 && z > f.minZ - 0.6 && z < f.maxZ + 0.6) || out.some(o => o.box && x > o.box.minX - 0.6 && x < o.box.maxX + 0.6 && z > o.box.minZ - 0.6 && z < o.box.maxZ + 0.6) || nearHide(x, z, 0.3)) continue;
        out.push({ kind: 'papers', x, z, yaw: k * 6.28, k, cx: Math.floor(x / CELL), cy: Math.floor(z / CELL), side: -1, room: r.kind }); n++;
      }
    } else if (r.kind === 'start' || r.kind === 'exit') {
      // stores somebody left, in the corners away from the stairs' feet (the helix opens to the north; the flight runs east)
      const corners = r.kind === 'start' ? [[2, 0.12, 'crate'], [2, 0.88, 'barrel'], [3, 0.88, 'rope']] : [[0, 0.88, 'crate'], [2, 0.12, 'barrel']];
      for (const [side, f, kind] of corners) { const K = PROP_AT.find(q => q[0] === kind); onWall(kind, side, f, K[2], K[3]); }
    }
  }
  return out;
}
const ROOM_AT = { bones: ['bones', 0, 0.75, null], desk: ['desk', 0, 0.42, [0.72, 0.44]] };

// the rooms' furniture as boxes in the maze's frame (metres): the crypt's three sarcophagi, the ossuary's bone heap, the cistern's
// two columns, the ritual altar, the library's shelves (standing west, toppled east) and its reading stand. maze-kit.js builds its
// colliders from these (you bump into them) and the ghoul's steering goes round them (lib/maze-ghoul.js), so one list.
//   -> [{ minX, minZ, maxX, maxZ, kind, room }]
export function furniture(rooms) {
  const out = [];
  for (const r of rooms) {
    const rw = (r.x1 - r.x0 + 1) * CELL, rd = (r.y1 - r.y0 + 1) * CELL, x0 = r.x0 * CELL, z0 = r.y0 * CELL, mx = x0 + rw / 2, mz = z0 + rd / 2;
    const add = (kind, minX, minZ, maxX, maxZ) => out.push({ minX, minZ, maxX, maxZ, kind, room: r.kind });
    if (r.kind === 'crypt') for (let k = 0; k < 3; k++) { const x = mx + (k - 1) * 2.6; add('sarcophagus', x - 0.6, mz - 1.2, x + 0.6, mz + 1.2); }
    else if (r.kind === 'ossuary') add('bones', mx - 1.7, mz - 0.6, mx + 1.7, mz + 0.6);
    else if (r.kind === 'cistern') for (const kx of [0.33, 0.67]) { const x = x0 + rw * kx; add('column', x - 0.55, mz - 0.55, x + 0.55, mz + 0.55); }
    else if (r.kind === 'ritual') add('altar', mx - 0.85, mz - 0.55, mx + 0.85, mz + 0.55);
    else if (r.kind === 'library') {
      for (let k = 0; k < 4; k++) { const x = x0 + 0.9 + (k % 2) * (rw - 1.8), z = z0 + rd * (0.3 + 0.4 * (k >> 1)); if (k % 2 === 0) add('shelf', x - 0.3, z - 1.3, x + 0.3, z + 1.3); else add('toppled', x - 1.2, z - 1.3, x + 1.2, z + 1.3); }
      add('stand', mx - 0.65, mz - 0.4, mx + 0.65, mz + 0.4);
    }
  }
  return out;
}

// every cell reachable from the start, and the exit reachable: the generator's own proof (tests call it too)
export function connected(m) {
  const { W, H, cells } = m;
  const seen = new Uint8Array(W * H), q = [m.start.cy * W + m.start.cx]; seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) { const c = q[i], x = c % W, y = (c - x) / W; for (let k = 0; k < 4; k++) { if (cells[c] & DIRS[k][2]) continue; const n = (y + DIRS[k][1]) * W + x + DIRS[k][0]; if (!seen[n]) { seen[n] = 1; q.push(n); } } }
  return { all: q.length === W * H, exit: seen[m.exit.cy * W + m.exit.cx] === 1, reached: q.length };
}

// a short signature of a maze (cell for cell): two screens compare these
export function signature(m) {
  let h = 2166136261;
  for (let i = 0; i < m.cells.length; i++) { h ^= m.cells[i] | (m.water[i] << 4); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 0).toString(16) + ':' + m.start.cx + ',' + m.start.cy + ':' + m.exit.cx + ',' + m.exit.cy;
}

// ================================================================ the quality gate (w16-phase4)
// What a good maze is, as numbers: the main path's length in cells (a long clear way), how many dead ends the braiding opened
// into loops, the share of corridor cells that are dead ends, how far a hiding spot ever is from the main path, and what the
// kit expects to find. Every check is a named function of the maze and its stats, returning why it fails or null.
export const PATH_BAND = [68, 112];   // cells of path from the start to the exit (~70 to ~110)
export const LOOPS_MIN = 14;          // dead ends opened into loops (a chase can go round)
export const DEAD_RATIO_MAX = 0.14;   // dead ends over corridor cells
export const HIDE_STRETCH_MAX = 20;   // the longest run of main-path cells with no hiding spot within HIDE_REACH cells' walk
export const HIDE_REACH = 3;
export const SPAWN_CELLS = 14;        // lib/maze-ghoul.js T.spawnCells: the ghoul needs a cell this far from the start by path
export const KIT_COUNTS = { torches: 5, glyphs: 7, signs: 5, niches: 6, candles: 8, roots: 10 }; // what takeSpots is asked for
export const PROP_MIN = 40, PROP_KINDS_MIN = ['crate', 'barrel', 'rubble', 'chains', 'pots', 'desk', 'papers'];

// the numbers behind the checks and the difficulty
export function mazeStats(m) {
  const { W, H, cells, dist, water } = m, idx = (x, y) => y * W + x;
  const inRoom = (x, y) => m.rooms.some(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  const path = m.path || mainPath(m), at = new Map(); path.forEach((c, i) => at.set(c, i));
  let edges = 0, corridor = 0, dead = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = cells[idx(x, y)];
    if (x < W - 1 && !(c & E)) edges++; if (y < H - 1 && !(c & S)) edges++;
    if (inRoom(x, y)) continue;
    corridor++;
    let n = 0; for (let d = 0; d < 4; d++) if (c & DIRS[d][2]) n++;
    if (n === 3) dead++;
  }
  // the main path's cover by hiding spots: each spot marks the path cells within HIDE_REACH cells' walk of its cell
  const covered = new Uint8Array(path.length);
  for (const h of m.hides) {
    const c0 = idx(Math.max(0, Math.min(W - 1, h.cx)), Math.max(0, Math.min(H - 1, h.cy)));
    const seen = new Set([c0]), q = [[c0, 0]];
    for (let i = 0; i < q.length; i++) {
      const [c, d] = q[i];
      if (at.has(c)) covered[at.get(c)] = 1;
      if (d >= HIDE_REACH) continue;
      const x = c % W, y = (c - x) / W;
      for (let k = 0; k < 4; k++) { if (cells[c] & DIRS[k][2]) continue; const nx = x + DIRS[k][0], ny = y + DIRS[k][1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = idx(nx, ny); if (!seen.has(n)) { seen.add(n); q.push([n, d + 1]); } }
    }
  }
  let stretch = 0, run = 0, coveredN = 0;
  for (let i = 0; i < path.length; i++) { if (covered[i]) { coveredN++; run = 0; } else { run++; stretch = Math.max(stretch, run); } }
  const d0 = bfsFrom(m, m.start.cx, m.start.cy);
  let ecc = 0, spawnable = 0;
  for (let i = 0; i < d0.length; i++) { ecc = Math.max(ecc, d0[i]); const x = i % W, y = (i - x) / W; if (d0[i] >= SPAWN_CELLS && !inRoomOf(m.startRoom, x, y) && !inRoomOf(m.exitRoom, x, y)) spawnable++; }
  const waterOnPath = path.filter(c => water[c]).length;
  const rooms = m.rooms.map(r => `${r.kind} ${r.x1 - r.x0 + 1}x${r.y1 - r.y0 + 1}`);
  return { path: path.length - 1, loops: edges - (W * H - 1), braids: m.braids ?? -1, corridor, dead, deadRatio: dead / Math.max(1, corridor),
    hides: { alcove: m.hides.filter(h => h.kind === 'alcove').length, sarcophagus: m.hides.filter(h => h.kind === 'sarcophagus').length, curtain: m.hides.filter(h => h.kind === 'curtain').length },
    hideStretch: stretch, hideCover: coveredN / Math.max(1, path.length), water: water.reduce((a, b) => a + b, 0), waterOnPath, ecc, spawnable, rooms,
    props: m.props.length, gates: m.gates.length, extras: (m.carved || []).map(c => c.kind) };
}
const inRoomOf = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
// path distances from a cell (blocked: cells not walked through, the cistern for the main path)
function bfsFrom(m, sx, sy, cells = m.cells, blocked = null) {
  const { W, H } = m, d = new Int32Array(W * H).fill(-1), q = [sy * W + sx]; d[q[0]] = 0;
  for (let i = 0; i < q.length; i++) { const c = q[i], x = c % W, y = (c - x) / W; for (let k = 0; k < 4; k++) { if (cells[c] & DIRS[k][2]) continue; const nx = x + DIRS[k][0], ny = y + DIRS[k][1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (d[n] < 0 && !(blocked && blocked[n])) { d[n] = d[c] + 1; q.push(n); } } }
  return d;
}
// the doorway into the exit room the path from the start comes in by (maze-kit.js mainEntrance): the side the flight rises away from
function exitEntrance(m) {
  const { W, H, cells, exitRoom: r } = m, d0 = bfsFrom(m, m.start.cx, m.start.cy);
  let best = null;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) for (let k = 0; k < 4; k++) {
    const ox = x + DIRS[k][0], oy = y + DIRS[k][1];
    if (inRoomOf(r, ox, oy) || (cells[y * W + x] & DIRS[k][2]) || ox < 0 || oy < 0 || ox >= W || oy >= H) continue;
    const d = d0[oy * W + ox]; if (d >= 0 && (!best || d < best.d)) best = { d, k };
  }
  return best ? best.k : -1;
}
export const CHECKS = [
  ['connected', m => { const c = connected(m); return c.all ? null : `${m.W * m.H - c.reached} cells cut off from the start`; }],
  ['exit reachable', m => (connected(m).exit ? null : 'no way from the start to the exit')],
  ['path length', (m, s) => (s.path >= PATH_BAND[0] && s.path <= PATH_BAND[1] ? null : `${s.path} cells of path (${PATH_BAND[0]} to ${PATH_BAND[1]})`)],
  ['loops', (m, s) => (s.braids >= LOOPS_MIN ? null : `${s.braids} dead ends opened into loops (${LOOPS_MIN} at least)`)],
  ['dead ends', (m, s) => (s.deadRatio <= DEAD_RATIO_MAX ? null : `${s.dead} dead ends in ${s.corridor} corridor cells (${(s.deadRatio * 100).toFixed(0)}%, ${DEAD_RATIO_MAX * 100}% at most)`)],
  ['rooms carved', m => { const miss = ROOM_KINDS.filter(k => !m.rooms.some(r => r.kind === k)); return miss.length ? `no ${miss.join(', ')}` : null; }],
  ['rooms open', m => { // every inner wall of a room open, and a doorway out of it
    for (const r of m.rooms) {
      let doors = 0;
      for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
        const c = m.cells[y * m.W + x];
        if ((x < r.x1 && (c & E)) || (y < r.y1 && (c & S))) return `a wall inside the ${r.kind}`;
        for (let k = 0; k < 4; k++) { const nx = x + DIRS[k][0], ny = y + DIRS[k][1]; if (!(c & DIRS[k][2]) && !inRoomOf(r, nx, ny)) doors++; }
      }
      if (!doors) return `the ${r.kind} has no doorway`;
    }
    return null;
  }],
  ['start room clear', m => { const s = m.startRoom; const t = m.rooms.find(r => r !== s && !(r.x0 > s.x1 + 1 || r.x1 < s.x0 - 1 || r.y0 > s.y1 + 1 || r.y1 < s.y0 - 1)); return t ? `the ${t.kind} touches the start room` : null; }],
  ['cistern off the main path', m => { const path = m.path || mainPath(m); const on = m.rooms.filter(r => r.kind === 'cistern').some(r => path.some(c => inRoomOf(r, c % m.W, Math.floor(c / m.W)))); return on ? 'every shortest route runs through the cistern' : null; }],
  ['exit far from the start', (m, s) => { const dx = m.exit.cx - m.start.cx, dy = m.exit.cy - m.start.cy; if (Math.hypot(dx, dy) < 8) return `the exit room is ${Math.hypot(dx, dy).toFixed(1)} cells from the start room (8 at least: the garden set past the door must stay clear of the stair's shaft)`; return s.path >= 60 ? null : `${s.path} cells of path (the farthest cell is ${s.ecc} away)`; }],
  ['gates', m => {
    if (m.gates.length < 3) return `${m.gates.length} gates (3 at least)`;
    const d0 = bfsFrom(m, m.start.cx, m.start.cy), shut = m.cells.slice();
    for (const g of m.gates) {
      const c = g.cy * m.W + g.cx; let n = 0; for (let d = 0; d < 4; d++) if (m.cells[c] & DIRS[d][2]) n++;
      if (n !== 3 || (m.cells[c] & DIRS[g.dir][2])) return `the gate at ${g.cx},${g.cy} is not across a dead end's one opening`;
      if (m.rooms.some(r => inRoomOf(r, g.cx, g.cy))) return `the gate at ${g.cx},${g.cy} is in a room`;
      if (d0[c] <= 6 || m.dist[c] <= 3) return `the gate at ${g.cx},${g.cy} is too near the start or the exit`;
      shut[c] |= DIRS[g.dir][2]; const nx = g.cx + DIRS[g.dir][0], ny = g.cy + DIRS[g.dir][1]; if (nx >= 0 && ny >= 0 && nx < m.W && ny < m.H) shut[ny * m.W + nx] |= DIRS[g.dir][3];
    }
    const dd = bfsFrom(m, m.start.cx, m.start.cy, shut); // the gates stand (the hunt's cells): every room and the exit still reached
    for (const r of m.rooms) if (dd[r.y0 * m.W + r.x0] < 0) return `with the gates shut the ${r.kind} is cut off`;
    return dd[m.exit.cy * m.W + m.exit.cx] < 0 ? 'with the gates shut the exit is cut off' : null;
  }],
  ['dressing', m => { const short = Object.entries(KIT_COUNTS).filter(([k, n]) => m[k].length < n).map(([k, n]) => `${k} ${m[k].length} of ${n}`); if (short.length) return short.join(', '); if (!m.lean) return 'no leaning frame'; return null; }],
  ['water', (m, s) => (s.water >= 8 ? null : `${s.water} flooded cells (8 at least)`)],
  ['hiding spots', (m, s) => (s.hides.alcove >= 3 && s.hides.sarcophagus === 2 && s.hides.curtain === 1 ? null : `alcoves ${s.hides.alcove}, sarcophagus gaps ${s.hides.sarcophagus}, curtains ${s.hides.curtain}`)],
  ['hiding spots spread', (m, s) => (s.hideStretch < HIDE_STRETCH_MAX ? null : `${s.hideStretch} cells of the main path with no hiding spot within ${HIDE_REACH} cells (${HIDE_STRETCH_MAX} at most)`)],
  ['props', m => { if (m.props.length < PROP_MIN) return `${m.props.length} props (${PROP_MIN} at least)`; const miss = PROP_KINDS_MIN.filter(k => !m.props.some(p => p.kind === k)); return miss.length ? `no ${miss.join(', ')}` : null; }],
  ['stairs fit', m => {
    const s = m.startRoom, r = m.exitRoom;
    for (const q of [s, r]) if (q.x1 - q.x0 !== 1 || q.y1 - q.y0 !== 1 || q.x0 < 1 || q.y0 < 1 || q.x1 > m.W - 2 || q.y1 > m.H - 2) return `the ${q.kind} room is not a 2x2 a cell off the border`;
    const k = exitEntrance(m); if (k < 0) return 'no doorway into the exit room';
    const far = (k + 2) % 4; // the flight rises away from the doorway to the wall across from it: the arched door needs stone there
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { const fx = x + DIRS[far][0], fy = y + DIRS[far][1]; if (!inRoomOf(r, fx, fy) && !(m.cells[y * m.W + x] & DIRS[far][2])) return 'an opening in the exit room\'s far wall, where the door to the garden goes'; }
    return null;
  }],
  ['ghoul can spawn', (m, s) => (s.spawnable > 0 ? null : `no cell ${SPAWN_CELLS} cells of path from the start outside the stair rooms`)],
];
export function gateReport(seedOrMaze, W = 30, H = 30) {
  const m = typeof seedOrMaze === 'number' ? generate(seedOrMaze, W, H) : seedOrMaze;
  const stats = mazeStats(m);
  const checks = CHECKS.map(([name, fn]) => { let why = null; try { why = fn(m, stats); } catch (e) { why = 'threw: ' + (e && e.message); } return { name, ok: !why, why: why || '' }; });
  return { seed: m.seed, ok: checks.every(c => c.ok), checks, stats, difficulty: difficultyOf(m, stats) };
}

// ---- difficulty: a score 0..100 and its word. Longer path, fewer loops, more dead ends, thinner hiding spots along the way and
// water on the main path all make a maze harder
export const DIFFICULTY = ['Easy', 'Fair', 'Hard', 'Dire'], DIFFICULTY_CUTS = [38, 55, 72];
export function difficultyOf(m, s = mazeStats(m)) {
  const u = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
  const parts = {
    path: 30 * u(s.path, PATH_BAND[0], PATH_BAND[1]),
    loops: 20 * (1 - u(s.braids, 16, 36)),
    dead: 15 * u(s.deadRatio, 0.03, 0.1),
    hides: 20 * (1 - u(s.hideCover, 0.15, 0.6)),
    water: Math.min(15, s.waterOnPath * 4),
  };
  const score = Math.round(Object.values(parts).reduce((a, b) => a + b, 0));
  const word = DIFFICULTY[DIFFICULTY_CUTS.filter(c => score >= c).length];
  return { score, word, parts };
}

// ================================================================ the weekly goals (w16-goals)
// One goal a week, picked from six by the week: the six in a fixed shuffled order (GOAL_ORDER, from its own seed), one every six
// weeks, so with the five mazes (week mod 5) a maze-and-goal pair comes round every thirty weeks. The server and every client go
// through goalForWeek, so they agree; a run keeps the goal it started with. The placer (placeGoal) picks cells from the same seed
// as the maze (its own salt: nothing in generate() moves) among the rooms, the dead ends (the gated and the alcoves left out) and
// the cistern, off the main path where the goal says so. Everything it places is a real thing on a reachable cell you walk to.
//   escape  just find the way out (as always)
//   signs   three Elder Sign stones in three different rooms or deep dead ends, far apart, 4 cells off the main path at least
//   oil     an oil cask in the farthest room from the exit by path; carry it to the beacon over the door
//   scout   a lost scout hiding in a hiding spot in the room farthest from the start (a sarcophagus gap or the library's curtain)
//   book    the Professor's book on a lectern in the library
//   pages   five pages: dead ends and rooms, one in the cistern's shallows; any four open the door
export const GOALS = ['escape', 'signs', 'oil', 'scout', 'book', 'pages'];
export const GOAL_NEED = { escape: 0, signs: 3, oil: 1, scout: 1, book: 1, pages: 4 };
export const GOAL_SALT = 0x60a24;
// the order the six come round in (a shuffle from GOAL_SALT, a constant: week 2965, Monday 2026-11-02, is the plain escape, then
// the pages, the signs, the scout, the oil, the book)
export const GOAL_ORDER = (() => { const r = mulberry32(GOAL_SALT), o = [0, 1, 2, 3, 4, 5]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; })();
export const goalForWeek = week => GOALS[GOAL_ORDER[((week % GOALS.length) + GOALS.length) % GOALS.length]];
export const goalForDay = day => goalForWeek(weekOf(day));
export const SIGN_OFF = 4;   // cells of walk off the main path an Elder Sign is at least (a deep dead end, a room off the way)
export const SIGN_APART = 8; // cells apart (as the crow flies) the three are at least
export const PAGE_OFF = 2, PAGE_APART = 6;
// the walk, in cells, from every cell to the nearest main-path cell
function offPathField(m) {
  const { W, H, cells } = m, path = m.path || mainPath(m), d = new Int32Array(W * H).fill(-1), q = [];
  for (const c of path) { d[c] = 0; q.push(c); }
  for (let i = 0; i < q.length; i++) { const c = q[i], x = c % W, y = (c - x) / W; for (let k = 0; k < 4; k++) { if (cells[c] & DIRS[k][2]) continue; const nx = x + DIRS[k][0], ny = y + DIRS[k][1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (d[n] < 0) { d[n] = d[c] + 1; q.push(n); } } }
  return d;
}
// a spot in a cell clear of the room furniture and the props' boxes (the cell's middle, else a few nudges), metres
function clearSpot(m, cx, cy, boxes) {
  const mx = cx * CELL + CELL / 2, mz = cy * CELL + CELL / 2, M = 0.75;
  const hit = (x, z) => boxes.some(b => x > b.minX - M && x < b.maxX + M && z > b.minZ - M && z < b.maxZ + M);
  for (const [ox, oz] of [[0, 0], [1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1], [1.1, 1.1], [-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1]]) if (!hit(mx + ox, mz + oz)) return { x: mx + ox, z: mz + oz };
  return { x: mx, z: mz };
}
// a dead end's spot: against its back wall (across from its one opening), facing out
function endSpot(m, cx, cy) {
  const c = m.cells[cy * m.W + cx], open = DIRS.findIndex(q => !(c & q[2])), [dx, dy] = open >= 0 ? DIRS[open] : [0, 1];
  return { x: cx * CELL + CELL / 2 - dx * 1.25, z: cy * CELL + CELL / 2 - dy * 1.25, yaw: Math.atan2(dx, dy) };
}
export function placeGoal(m, goal = 'escape') {
  const { W, H, cells } = m, rnd = mulberry32((m.seed ^ GOAL_SALT) >>> 0), idx = (x, y) => y * W + x;
  const roomOf = (x, y) => m.rooms.find(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) || null;
  const d0 = bfsFrom(m, m.start.cx, m.start.cy), off = offPathField(m), boxes = m.furniture || [];
  const out = { goal, need: GOAL_NEED[goal] || 0, things: [], hide: -1, relaxed: 0 };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // the dead ends you can reach: three walls, not a room's, not behind a gate, not an alcove (a hiding spot stays one), dry
  const gated = new Set(m.gates.map(g => idx(g.cx, g.cy))), alcoves = new Set(m.hides.filter(h => h.kind === 'alcove').map(h => idx(h.cx, h.cy)));
  const ends = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = idx(x, y); let n = 0; for (let k = 0; k < 4; k++) if (cells[c] & DIRS[k][2]) n++; if (n === 3 && !roomOf(x, y) && !gated.has(c) && !alcoves.has(c) && !m.water[c] && d0[c] > 4) ends.push(c); }
  const rooms = m.rooms.filter(r => r.kind !== 'start' && r.kind !== 'exit');
  const roomCells = r => { const o = []; for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) o.push(idx(x, y)); return o; };
  const apart = (c, list, gap) => list.every(t => Math.abs(t.cx - c % W) + Math.abs(t.cy - Math.floor(c / W)) >= gap);
  const thing = (kind, c, spot, extra) => ({ i: out.things.length, kind, cx: c % W, cy: Math.floor(c / W), x: +spot.x.toFixed(2), z: +spot.z.toFixed(2), yaw: +(spot.yaw || 0).toFixed(3), off: off[c], room: roomOf(c % W, Math.floor(c / W))?.kind || null, ...extra });
  // a thing's spot for a cell: a dead end against its back wall, a room cell clear of the furniture
  const spotOf = c => (roomOf(c % W, Math.floor(c / W)) ? clearSpot(m, c % W, Math.floor(c / W), boxes) : endSpot(m, c % W, Math.floor(c / W)));
  // n things far apart and off the path (the rule relaxed a cell at a time only if the maze has no other way; `relaxed` says so),
  // each in a different room when `oneRoom`
  const spread = (kind, n, offMin, gap, oneRoom) => {
    for (let o = offMin; o >= 0 && out.things.length < n; o--) {
      const cand = shuffle([...ends, ...rooms.flatMap(roomCells)].filter(c => off[c] >= o && !out.things.some(t => t.cx === c % W && t.cy === Math.floor(c / W))));
      for (const c of cand) {
        if (out.things.length >= n) break;
        const r = roomOf(c % W, Math.floor(c / W));
        if (!apart(c, out.things, gap) || (oneRoom && r && out.things.some(t => t.room === r.kind && Math.abs(t.cx - c % W) + Math.abs(t.cy - Math.floor(c / W)) < 6))) continue;
        if (o < offMin) out.relaxed = Math.max(out.relaxed, offMin - o);
        out.things.push(thing(kind, c, spotOf(c)));
      }
    }
  };
  if (goal === 'signs') spread('sign', 3, SIGN_OFF, SIGN_APART, true);
  else if (goal === 'oil') {
    // the farthest room from the exit by path (the room's nearest cell), its cell farthest from the exit
    let best = null, bd = -1;
    for (const r of rooms) { const d = Math.min(...roomCells(r).map(c => m.dist[c]).filter(v => v >= 0)); if (d > bd) { bd = d; best = r; } }
    if (best) { const c = roomCells(best).sort((a, b) => m.dist[b] - m.dist[a])[0]; out.things.push(thing('cask', c, spotOf(c))); }
  } else if (goal === 'scout') {
    // the hiding spot in a room farthest from the start by path: a sarcophagus gap or the library's curtain
    let best = -1, bd = -1;
    m.hides.forEach((h, i) => { if (h.kind === 'alcove') return; const d = d0[idx(Math.max(0, Math.min(W - 1, h.cx)), Math.max(0, Math.min(H - 1, h.cy)))]; if (d > bd) { bd = d; best = i; } });
    if (best >= 0) { const h = m.hides[best]; out.hide = best; out.things.push(thing('scout', idx(Math.max(0, Math.min(W - 1, h.cx)), Math.max(0, Math.min(H - 1, h.cy))), { x: h.x, z: h.z, yaw: Math.atan2(h.nx, h.nz) }, { hide: best })); }
  } else if (goal === 'book') {
    const lib = rooms.find(r => r.kind === 'library');
    if (lib) {
      // a lectern standing clear of the shelves and the toppled stand: the room's middle, nudged
      const rw = (lib.x1 - lib.x0 + 1) * CELL, rd = (lib.y1 - lib.y0 + 1) * CELL, mx = lib.x0 * CELL + rw / 2, mz = lib.y0 * CELL + rd / 2, Mg = 0.9;
      const all = [...boxes, ...(m.props || []).filter(p => p.box).map(p => p.box)];
      const hit = (x, z) => all.some(b => x > b.minX - Mg && x < b.maxX + Mg && z > b.minZ - Mg && z < b.maxZ + Mg) || x < lib.x0 * CELL + 1.2 || x > (lib.x1 + 1) * CELL - 1.2 || z < lib.y0 * CELL + 1.2 || z > (lib.y1 + 1) * CELL - 1.2;
      let sp = null;
      for (const [ox, oz] of [[0, 1.6], [0, -1.6], [1.6, 0], [-1.6, 0], [0, 2.4], [0, -2.4], [2.4, 0], [-2.4, 0], [1.6, 1.6], [-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [0, 0]]) if (!hit(mx + ox, mz + oz)) { sp = { x: mx + ox, z: mz + oz, yaw: Math.atan2(-ox, -oz) }; break; }
      if (!sp) sp = { x: mx, z: mz + 1.6, yaw: Math.PI };
      out.things.push(thing('book', idx(Math.floor(sp.x / CELL), Math.floor(sp.z / CELL)), sp));
    }
  } else if (goal === 'pages') {
    // one in the cistern's shallows first (the flooded room), then four more spread over dead ends and rooms
    const cis = rooms.find(r => r.kind === 'cistern');
    if (cis) { const cc = shuffle(roomCells(cis).filter(c => off[c] >= 1))[0] ?? roomCells(cis)[0]; out.things.push(thing('page', cc, clearSpot(m, cc % W, Math.floor(cc / W), boxes))); }
    spread('page', 5, PAGE_OFF, PAGE_APART, false);
  }
  // the door: the exit room's far wall, where the arched door to the garden is (maze-kit.js buildFlight: the room's edge, uMid)
  const k = exitEntrance(m), r = m.exitRoom, dir = k >= 0 ? [-DIRS[k][0], -DIRS[k][1]] : [1, 0], half = (r.x1 - r.x0 + 1) * CELL / 2;
  const cx = (r.x0 + r.x1 + 1) * CELL / 2, cz = (r.y0 + r.y1 + 1) * CELL / 2;
  out.door = { x: +(cx + dir[0] * half).toFixed(2), z: +(cz + dir[1] * half).toFixed(2), dx: dir[0], dz: dir[1], yaw: +Math.atan2(dir[0], dir[1]).toFixed(3) };
  return out;
}
