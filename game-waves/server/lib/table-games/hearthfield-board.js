// Hearthfield's meadow as plain geometry (shared by the engine and its bots; the UI and 3D files carry a copy of makeGeo).
// A long meadow of hex fields in three rows (6, 7, 6) with Breneland town in the middle of the middle row. Pointy-top hexes of
// side 1, centred on (0, 0): x across, y down. Vertices are the corners where homes go, edges the sides where lanes go.
//   hex[i]: { r, c, x, y, v: [6 vertex ids, clockwise from the top], e: [6 edge ids], nb: [neighbour hexes] }
//   v[i]:   { x, y, hexes: [..], adj: [vertices one lane away], edges: [..] }
//   e[i]:   { a, b, hexes: [..] }  (a < b)
//   ports:  [edge ids] the market carts' spots round the meadow's rim (8, evenly spaced)
export const ROWS = [6, 7, 6];

export function makeGeo(rows = ROWS) {
  const R3 = Math.sqrt(3), mid = (rows.length - 1) / 2, hex = [];
  rows.forEach((cnt, r) => { for (let c = 0; c < cnt; c++) hex.push({ r, c, x: (c - (cnt - 1) / 2) * R3, y: (r - mid) * 1.5 }); });
  const key = (x, y) => Math.round(x * 1000) + ',' + Math.round(y * 1000);
  const vm = new Map();
  for (const h of hex) {
    h.vk = [];
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 180 * (60 * k - 90), x = h.x + Math.cos(a), y = h.y + Math.sin(a), kk = key(x, y);
      if (!vm.has(kk)) vm.set(kk, { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
      h.vk.push(kk);
    }
  }
  const vkeys = [...vm.keys()].sort((p, q) => vm.get(p).y - vm.get(q).y || vm.get(p).x - vm.get(q).x);
  const vi = new Map(vkeys.map((k, i) => [k, i]));
  const v = vkeys.map(k => ({ x: vm.get(k).x, y: vm.get(k).y, hexes: [], adj: [], edges: [] }));
  const em = new Map();
  hex.forEach((h, i) => {
    h.v = h.vk.map(k => vi.get(k)); delete h.vk;
    for (const id of h.v) v[id].hexes.push(i);
    for (let k = 0; k < 6; k++) {
      const a = h.v[k], b = h.v[(k + 1) % 6], lo = Math.min(a, b), hi = Math.max(a, b), kk = lo + '-' + hi;
      if (!em.has(kk)) em.set(kk, { a: lo, b: hi, hexes: [] });
      em.get(kk).hexes.push(i);
    }
  });
  const mpt = x => ({ x: (v[x.a].x + v[x.b].x) / 2, y: (v[x.a].y + v[x.b].y) / 2 });
  const e = [...em.values()].sort((p, q) => Math.round(mpt(p).y * 1000) - Math.round(mpt(q).y * 1000) || mpt(p).x - mpt(q).x);
  const ei = new Map(e.map((x, i) => [x.a + '-' + x.b, i]));
  e.forEach((x, i) => { v[x.a].adj.push(x.b); v[x.b].adj.push(x.a); v[x.a].edges.push(i); v[x.b].edges.push(i); });
  hex.forEach(h => { h.e = h.v.map((a, k) => { const b = h.v[(k + 1) % 6]; return ei.get(Math.min(a, b) + '-' + Math.max(a, b)); }); });
  hex.forEach((h, i) => { h.nb = []; for (const id of h.e) for (const j of e[id].hexes) if (j !== i) h.nb.push(j); });
  for (const x of v) { x.hexes.sort((p, q) => p - q); x.adj.sort((p, q) => p - q); x.edges.sort((p, q) => p - q); }
  // the rim: edges with one field, walked round in order from the top-left, then 8 spots evenly spaced
  const rim = e.map((x, i) => i).filter(i => e[i].hexes.length === 1);
  const walk = [rim[0]], used = new Set(walk);
  let at = e[rim[0]].b;
  while (walk.length < rim.length) {
    const nx = rim.find(i => !used.has(i) && (e[i].a === at || e[i].b === at));
    if (nx === undefined) break;
    walk.push(nx); used.add(nx); at = e[nx].a === at ? e[nx].b : e[nx].a;
  }
  const ports = [];
  for (let k = 0; k < 8; k++) ports.push(walk[Math.floor((k + 0.5) * walk.length / 8)]);
  const town = hex.findIndex(h => h.r === Math.floor(mid) && h.c === Math.floor(rows[Math.floor(mid)] / 2));
  return { rows: rows.slice(), hex, v, e, ports, town, rim: walk };
}

export const GEO = makeGeo(ROWS);
