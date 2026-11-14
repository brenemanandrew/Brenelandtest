// Where you can sit and lie in our house (house-rest.js, lib/house-rest.js): the living room's sofa and loveseat (a spot per
// cushion) and the three bedrooms' beds (a side per pillow). Pure numbers and no imports, so the server reads the same list
// (lib/house-rest.js loads this file as a data: module). The furniture itself is house-rooms.js's: these numbers are its own
// (sofa(cx, cz, len, ry), bed(x0, z0, x1, z1, head)) and tools/house-rest-test.mjs checks the two agree.
// yaw: the way a sitter faces, or the way a lier's feet point (forward = (sin yaw, cos yaw), the usual convention).
export const REST_FLOOR = 0.9;            // HOUSE.floorY
// house-scale (2026-11-07): the couches and beds fitted to our people (tools/house-scale-body.mjs measures them: the cast's legs are
// 0.49-0.61 m, the feet reach the floor from a seat 0.26-0.31 m high and the knee joint sits 0.2-0.27 m in front of the hips). The
// sofa was 0.56 high and 0.48 deep in front of the hips: the feet hung 27-30 cm up and the shins went down through the cushion.
export const SEAT_TOP = 0.34;             // a sofa cushion's top above the floor (the feet on or within 10 cm of the floor, every player)
export const SEAT_FRONT = 0.3;            // the seat cushions' front edge, front (+) to back (-) across the sofa from its middle line
export const KNEE_PAST = 0.12;            // m the knee joint stands past that edge (the back of the knee on it, the calf hanging clear)
export const SIT_V = 0.19;                // where the hips sit (a middling build; house-rest.js fits each body: SEAT_FRONT + KNEE_PAST - thigh)
export const BACK_V = -0.1;               // the back cushions' face (the frame behind them to -0.4)
export const COUCH = { base: 0.24, armTop: 0.52, backTop: 0.78, frameTop: 0.72, back: -0.4, armW: 0.22, armFront: 0.32 }; // house-rooms.js draws these
export const BED_TOP = 0.5;               // the quilt's top above the floor (the Tool Crib's loft bed is 0.5)
export const BED_MATTRESS = 0.46;         // the mattress's top (HOUSE_PLAN.bed.top is the floor plus this)
export const PILLOW_IN = 0.33;            // the pillows' middle in from the headboard
export const SNUG_IN = 0.055;             // m each of a snuggling pair slides toward the other (the sofa's cushions are 0.81 apart; our people's heads are big)
export const SNUG_IN_BED = 0.1;           // ...and on a bed

export const REST_FURNITURE = [
  { id: 'sofa', kind: 'couch', name: 'sofa', cx: -0.9, cz: 1.05, len: 2.5, ry: 0 },
  { id: 'loveseat', kind: 'couch', name: 'loveseat', cx: 1.57, cz: 2.55, len: 1.6, ry: 'w' },
  { id: 'bed-main', kind: 'bed', name: 'bed', x0: 5.9, z0: 3.3, x1: 7.5, z1: 5.39, head: 'z+', main: true },
  { id: 'bed-2', kind: 'bed', name: 'bed', x0: 4.37, z0: -3.1, x1: 6.3, z1: -1.6, head: 'x-' },
  { id: 'bed-3', kind: 'bed', name: 'bed', x0: 2.17, z0: 3.0, x1: 4.15, z1: 4.1, head: 'x-' },
];

// Every spot: { id 'sofa:1', furn, i, kind, x, z (the hips on a couch; the pillow's middle on a bed), yaw, top (above the floor),
// out: { x, z } where you stand up to, side: { x, z } the unit vector from the furniture's middle line toward this spot's end }
export const REST_SPOTS = [];
for (const f of REST_FURNITURE) {
  if (f.kind === 'couch') {
    const n = Math.round(f.len / 0.8), w = (f.len - 0.06) / n;
    for (let i = 0; i < n; i++) {
      const u = -f.len / 2 + 0.03 + i * w + (w - 0.03) / 2, v = SIT_V;
      // ry 0: u along +x, the front toward +z; 'w': u along +z, the front toward -x
      const x = f.ry === 0 ? f.cx + u : f.cx - v, z = f.ry === 0 ? f.cz + v : f.cz + u, yaw = f.ry === 0 ? 0 : -Math.PI / 2;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      REST_SPOTS.push({ id: f.id + ':' + i, furn: f.id, i, n, kind: 'couch', name: f.name, x, z, yaw, top: SEAT_TOP, u,
        out: { x: x + fx * 0.85, z: z + fz * 0.85 }, along: f.ry === 0 ? { x: 1, z: 0 } : { x: 0, z: 1 } });
    }
  } else {
    const across = f.head === 'z+' ? f.x1 - f.x0 : f.z1 - f.z0, n = across > 1.2 ? 2 : 1, ks = n === 2 ? [0.3, 0.7] : [0.5];
    ks.forEach((k, i) => {
      let x, z, yaw, out;
      if (f.head === 'z+') { x = f.x0 + (f.x1 - f.x0) * k; z = f.z1 - PILLOW_IN; yaw = Math.PI; out = { x: n === 1 || i === 0 ? f.x0 - 0.45 : f.x1 + 0.4, z: (f.z0 + f.z1) / 2 - 0.2 }; }
      else { x = f.x0 + PILLOW_IN; z = f.z0 + (f.z1 - f.z0) * k; yaw = Math.PI / 2; out = { x: (f.x0 + f.x1) / 2 + 0.3, z: n === 1 || i === 0 ? f.z0 - 0.42 : f.z1 + 0.42 }; }
      REST_SPOTS.push({ id: f.id + ':' + i, furn: f.id, i, n, kind: 'bed', name: f.name, main: !!f.main, x, z, yaw, top: BED_TOP, out,
        along: f.head === 'z+' ? { x: 1, z: 0 } : { x: 0, z: 1 }, rect: { x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1 } });
    });
  }
}
export const restSpot = id => REST_SPOTS.find(s => s.id === id) || null;
export const spotsOf = furn => REST_SPOTS.filter(s => s.furn === furn);

// The owner (the server knows him) and a player named Whitney, any case: the first word, like Molly's friends (molly-brain.js).
export const isWhitney = name => String(name || '').trim().toLowerCase().split(/\s+/)[0] === 'whitney';

// Where a snuggling pair sits on one piece of furniture: the two neighbouring spots nearest its middle that are free or theirs,
// the one who sat further along keeping that end. at: Map(spotId -> sid) of everyone on it. Returns [spotA, spotB] for
// (sidA, sidB) or null when no two neighbours are free (a third person in the middle of the sofa).
export function snugSpots(furn, at, sidA, sidB) {
  const S = spotsOf(furn), n = S.length;
  if (n < 2) return null;
  const mine = id => { const o = at.get(id); return o === undefined || o === sidA || o === sidB; };
  const iA = S.findIndex(s => at.get(s.id) === sidA), iB = S.findIndex(s => at.get(s.id) === sidB);
  let best = null, bc = Infinity;
  for (let i = 0; i + 1 < n; i++) {
    if (!mine(S[i].id) || !mine(S[i + 1].id)) continue;
    const lo = iA <= iB ? [i, i + 1] : [i + 1, i];      // (A keeps the lower end if A sat lower)
    const moves = (lo[0] !== iA) + (lo[1] !== iB), mid = Math.abs(i + 0.5 - (n - 1) / 2);
    const c = moves * 10 + mid;
    if (c < bc) { bc = c; best = [S[lo[0]].id, S[lo[1]].id]; }
  }
  return best;
}
