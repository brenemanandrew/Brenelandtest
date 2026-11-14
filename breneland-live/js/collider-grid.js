// The colliders in a spatial grid, so player.js and camera-fade.js test only the ones near them instead of all ~2250 every
// frame (reading a collider's x or z boxes a number, so the full walk made garbage). No per-frame allocation.
// Colliders pushed later are indexed when the list grows. A collider that moves must carry `moves: true`. Others are
// audited round-robin, and one caught moving is re-filed (`api.caught` counts them, and collider-grid-test wants none).
// `off`, `house` and the rest are still the caller's to read. A query returns indices in the list's order. A collider
// over MAX_CELLS cells, or with non-finite bounds, is in every query.
//   const g = colliderGrid(colliders); const n = g.query(minX, minZ, maxX, maxZ); for (i < n) colliders[g.hits[i]] ...
export const CELL = 4;          // m
const MAX_CELLS = 256;          // a collider over this many cells is in every query (a long wall)
const AUDIT = 2;                // colliders checked for a move per query (a safety net; reading a collider here boxes a few numbers, so only two)
const SPAN = 4096, HALF = 2048; // cell keys: (ix + HALF) * SPAN + (iz + HALF), small integers (no boxed numbers)

const grids = new WeakMap();    // colliders array -> its grid (player.js and camera-fade.js share one)
export function colliderGrid(colliders) {
  let g = grids.get(colliders);
  if (!g) grids.set(colliders, g = createColliderGrid(colliders));
  return g;
}

const cellOf = v => { const i = Math.floor(v / CELL); return i < -HALF + 1 ? -HALF + 1 : i > HALF - 2 ? HALF - 2 : i; };

export function createColliderGrid(colliders) {
  const cells = new Map();      // key -> ascending collider indices
  const wide = [];              // ascending indices of colliders in every query
  const movers = [];            // indices checked at every query
  let n = 0;                    // colliders indexed so far
  let bx = new Float64Array(64); // per collider, as filed: minX, minZ, maxX, maxZ
  let flag = new Uint8Array(16); // 1 = in `wide`, 2 = a mover
  let stamp = new Uint32Array(16), q = 0;
  let audit = 0, caught = 0, refiled = 0, rebuilt = 0;
  const hits = [];              // the last query's indices, ascending (hits.length may be larger than the count)
  const cellList = k => { let a = cells.get(k); if (!a) cells.set(k, a = []); return a; };

  function insertSorted(a, i) {
    let j = a.length;
    a.push(i);
    while (j > 0 && a[j - 1] > i) { a[j] = a[j - 1]; j--; }
    a[j] = i;
  }
  function removeFrom(a, i) {
    const j = a.indexOf(i);
    if (j >= 0) a.splice(j, 1);
  }
  // the collider's footprint now (a circle's square round it)
  function bounds(c, o) {
    if (c.type === 'circle') { o[0] = c.x - c.r; o[1] = c.z - c.r; o[2] = c.x + c.r; o[3] = c.z + c.r; }
    else { o[0] = c.minX; o[1] = c.minZ; o[2] = c.maxX; o[3] = c.maxZ; }
  }
  const tmp = new Float64Array(4);
  function file(i) {
    const o = i * 4;
    bounds(colliders[i], tmp);
    bx[o] = tmp[0]; bx[o + 1] = tmp[1]; bx[o + 2] = tmp[2]; bx[o + 3] = tmp[3];
    const finite = Number.isFinite(tmp[0]) && Number.isFinite(tmp[1]) && Number.isFinite(tmp[2]) && Number.isFinite(tmp[3]) && tmp[0] <= tmp[2] && tmp[1] <= tmp[3];
    const x0 = finite ? cellOf(tmp[0]) : 0, x1 = finite ? cellOf(tmp[2]) : 0, z0 = finite ? cellOf(tmp[1]) : 0, z1 = finite ? cellOf(tmp[3]) : 0;
    if (!finite || (x1 - x0 + 1) * (z1 - z0 + 1) > MAX_CELLS) { flag[i] |= 1; insertSorted(wide, i); return; }
    flag[i] &= ~1;
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) insertSorted(cellList((ix + HALF) * SPAN + iz + HALF), i);
  }
  function unfile(i) {
    if (flag[i] & 1) { removeFrom(wide, i); return; }
    const o = i * 4;
    const x0 = cellOf(bx[o]), z0 = cellOf(bx[o + 1]), x1 = cellOf(bx[o + 2]), z1 = cellOf(bx[o + 3]);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) { const a = cells.get((ix + HALF) * SPAN + iz + HALF); if (a) removeFrom(a, i); }
  }
  // moved since it was filed? then file it again (true)
  function check(i) {
    const o = i * 4;
    bounds(colliders[i], tmp);
    return moved(i, o);
  }
  // the movers' own copy of check(): only a few shapes of collider pass here, so reading them boxes nothing (check() sees
  // every shape there is)
  function checkMover(i) {
    const o = i * 4, c = colliders[i];
    if (c.type === 'circle') { tmp[0] = c.x - c.r; tmp[1] = c.z - c.r; tmp[2] = c.x + c.r; tmp[3] = c.z + c.r; }
    else { tmp[0] = c.minX; tmp[1] = c.minZ; tmp[2] = c.maxX; tmp[3] = c.maxZ; }
    return moved(i, o);
  }
  function moved(i, o) {
    if (tmp[0] === bx[o] && tmp[1] === bx[o + 1] && tmp[2] === bx[o + 2] && tmp[3] === bx[o + 3]) return false;
    if ((flag[i] & 1) && !(tmp[0] === tmp[0] && tmp[1] === tmp[1] && tmp[2] === tmp[2] && tmp[3] === tmp[3]) &&
      !(bx[o] === bx[o] && bx[o + 1] === bx[o + 1] && bx[o + 2] === bx[o + 2] && bx[o + 3] === bx[o + 3])) return false; // (NaN then and now)
    unfile(i); file(i); refiled++;
    return true;
  }
  function grow(len) {
    if (len * 4 > bx.length) { const b = new Float64Array(Math.max(len * 4, bx.length * 2)); b.set(bx); bx = b; }
    if (len > flag.length) {
      const m = Math.max(len, flag.length * 2);
      const f = new Uint8Array(m); f.set(flag); flag = f;
      const s = new Uint32Array(m); s.set(stamp); stamp = s;
    }
  }
  function sync() {
    const len = colliders.length;
    if (len < n) { // (the list shrank: index it again)
      cells.clear(); wide.length = 0; movers.length = 0; flag.fill(0); n = 0; rebuilt++;
    }
    if (len > n) {
      grow(len);
      for (; n < len; n++) { flag[n] = 0; file(n); if (colliders[n].moves) { flag[n] |= 2; movers.push(n); } }
    }
    for (let k = 0; k < movers.length; k++) checkMover(movers[k]);
    if (n) for (let k = 0, m = AUDIT < n ? AUDIT : n; k < m; k++) {
      if (audit >= n) audit = 0;
      const i = audit++;
      if (!(flag[i] & 2) && check(i)) { flag[i] |= 2; movers.push(i); caught++; }
    }
  }
  // every collider whose footprint may reach the box (minX..maxX, minZ..maxZ), as indices in the list's order: the count
  // (they are hits[0 .. count - 1])
  function query(minX, minZ, maxX, maxZ) {
    sync();
    if (++q >= 0xffffffff) { stamp.fill(0); q = 1; }
    let cnt = 0;
    for (let k = 0; k < wide.length; k++) { const i = wide[k]; stamp[i] = q; hits[cnt++] = i; }
    if (!(minX <= maxX && minZ <= maxZ)) { // (not a box: everything)
      for (let i = 0; i < n; i++) if (stamp[i] !== q) hits[cnt++] = i;
      return sortHits(cnt);
    }
    const x0 = cellOf(minX), x1 = cellOf(maxX), z0 = cellOf(minZ), z1 = cellOf(maxZ);
    for (let ix = x0; ix <= x1; ix++) {
      const base = (ix + HALF) * SPAN + HALF;
      for (let iz = z0; iz <= z1; iz++) {
        const a = cells.get(base + iz);
        if (a === undefined) continue;
        for (let k = 0; k < a.length; k++) { const i = a[k]; if (stamp[i] !== q) { stamp[i] = q; hits[cnt++] = i; } }
      }
    }
    return sortHits(cnt);
  }
  function sortHits(cnt) { // insertion sort: a few dozen, mostly in order already
    for (let a = 1; a < cnt; a++) {
      const v = hits[a];
      let b = a - 1;
      while (b >= 0 && hits[b] > v) { hits[b + 1] = hits[b]; b--; }
      hits[b + 1] = v;
    }
    return cnt;
  }

  return {
    hits,
    query,
    sync,
    api: {
      CELL, MAX_CELLS, AUDIT,
      get size() { return n; },
      get cells() { return cells.size; },
      get wide() { return wide.length; },
      get movers() { return movers.map(i => colliders[i]); },
      get caught() { return caught; },
      get refiled() { return refiled; },
      get rebuilt() { return rebuilt; },
      // (tests) the query as a list of colliders
      near: (minX, minZ, maxX, maxZ) => { const c = query(minX, minZ, maxX, maxZ); return hits.slice(0, c).map(i => colliders[i]); },
      // (tests) every collider checked for a move now, not round-robin
      auditAll: () => { let found = 0; for (let i = 0; i < n; i++) if (!(flag[i] & 2) && check(i)) { flag[i] |= 2; movers.push(i); caught++; found++; } return found; },
    },
  };
}
