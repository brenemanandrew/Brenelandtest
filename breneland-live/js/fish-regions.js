// Where the fish are: three regions of water, each with its own fish, a few commons everywhere, and the trophy points the
// Fish Shack's leaderboard ranks by. Only the water highlighted yellow on docs/refs/andrew-b2-map.png fishes.
//
// Plain data, no imports: lib/fishing.js loads this file too (as a data: URL), so client and server agree on the regions.
//
// The polygons are traced from the map (world x -192..66, z -172..60, 1.93 px a metre) and checked against layout.js LAKES.
// Oyster Cove and the water by the Old Swing Tree have no fish. The regions reach out to x 150 so Kevin's boat anchorages
// (kevin-day.js SPOTS) are inside one.

export const REGIONS = [
  { id: 'north', name: 'North Shore', where: 'the north shore, past Maple Row', color: '#5fa8e6',
    poly: [[50, -122], [150, -122], [150, -46], [50, -46]] },
  { id: 'east', name: 'East Shore', where: 'the shore by the Fish Shack', color: '#3fb58a',
    poly: [[46, -46], [150, -46], [150, 36], [31, 36], [31, 33], [27, 5.5], [46, 5.5]] },
  { id: 'south', name: 'South Shore', where: 'the south shore, past the Old Swing Tree', color: '#f0a23a',
    poly: [[-132, 40], [-36, 38], [-14, 50], [3, 55], [8, 100], [-132, 100]] },
];
export const REGION = Object.fromEntries(REGIONS.map(r => [r.id, r]));

function inPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// The region a point of water is in (null: no fish there). Land inside a polygon counts too; callers check for water.
export function regionAt(x, z) {
  if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  for (const r of REGIONS) if (inPoly(x, z, r.poly)) return r;
  return null;
}
// The nearest region to a point and how far away its edge is (0 inside): for the "try over there" hint.
export function nearestRegion(x, z) {
  let best = null, bd = Infinity;
  for (const r of REGIONS) {
    if (inPoly(x, z, r.poly)) return { region: r, d: 0 };
    const p = r.poly;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const ax = p[j][0], az = p[j][1], dx = p[i][0] - ax, dz = p[i][1] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < bd) { bd = d; best = r; }
    }
  }
  return { region: best, d: bd };
}

// How rare each kind is. Every region has the two commons (minnow, perch), a common, an uncommon and a rare of its own,
// and the golden fish.
export const TIER = {
  minnow: 'common', perch: 'common',
  trout: 'common', pike: 'uncommon', sturgeon: 'rare',          // north: cold, deep Tamakiya water
  mackerel: 'common', flounder: 'uncommon', puffer: 'rare',     // east: by the shack and the pier
  sunfish: 'common', bass: 'uncommon', catfish: 'rare',         // south: the warm, weedy south shore
  golden: 'legend',
};
const W = { common: 3, uncommon: 2, rare: 0.7, legend: 0.1 };   // how often each tier bites, relative
const OWN = { north: ['trout', 'pike', 'sturgeon'], east: ['mackerel', 'flounder', 'puffer'], south: ['sunfish', 'bass', 'catfish'] };
// region id -> { species id: weight } (fish-data.js ZONES take their weights from here; lib/fishing.js checks a catch against it)
export const POOLS = Object.fromEntries(Object.entries(OWN).map(([id, own]) => [id, Object.fromEntries(
  ['minnow', 'perch', ...own, 'golden'].map(k => [k, k === 'perch' ? 2 : W[TIER[k]]]))]));
// May a fish of kind k come out of region id's water?
export const inPool = (id, k) => !!(POOLS[id] && POOLS[id][k] > 0);

// Trophy points: your biggest fish of each kind is worth its tier's points, doubled at the top of the kind's size range.
// `big` = { kind: cm } (record.fishing.big), `ranges` = { kind: [lo, hi] }. Tops out at 280 with every kind at its biggest,
// so grinding one spot doesn't run it up.
export const TIER_POINTS = { common: 5, uncommon: 10, rare: 20, legend: 25 };
export function trophyPoints(big, ranges) {
  let sum = 0;
  if (!big || typeof big !== 'object') return 0;
  for (const k of Object.keys(TIER)) {
    const cm = big[k], rg = ranges[k];
    if (!rg || typeof cm !== 'number' || !(cm > 0)) continue;
    const f = Math.max(0, Math.min(1, (cm - rg[0]) / Math.max(1, rg[1] - rg[0])));
    sum += Math.round(TIER_POINTS[TIER[k]] * (1 + f));
  }
  return sum;
}
