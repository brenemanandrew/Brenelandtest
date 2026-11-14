// A fire in a fireplace: an iron grate in the firebox, three logs on it and a bed of coals under them. The houses build it into
// their own inside batches (the grate, the logs and the coals cost no draw of their own); the glowing bed under them is a small
// batch of its own with one glowing material (one draw, colour only), so fires.js can cool it when the fire is put out. The flames,
// the glow and the light are fires.js's.
//
// A fireplace is a spec, world metres: { id, x, y, z, nx, nz, w, h, d }: (x, y, z) the bottom middle of the opening, on the
// plane of its face (y is the firebox's floor); (nx, nz) the way it faces, out into the room; w the opening's half width, h its
// height, d the firebox's depth behind the face.
//   buildHearth(b, spec, eb?) -> eb   adds the grate, logs and coals to b and the glowing bed to eb (made if not given; one per
//                                     house), returned: buildEmbers(eb, group, name) builds it into the same group
//   firebox(b, spec, floor, wall)     the firebox's lining (for an opening cut through a surround)
//   TONGUES, GLOWS                    where fires.js puts the flames and the glow, in the fireplace's own frame
import { Batcher, GEO } from './batch.js';
import { toon, LAYER_SOFT } from './toon.js';

// a fireplace's own frame: u across the opening, v up from the firebox floor, w back into the firebox (0 = the face)
export function hearthFrame(s) {
  const tx = s.nz, tz = -s.nx; // across (right as you face the fire is -t; it does not matter, it is all symmetric)
  return {
    yaw: Math.atan2(s.nx, s.nz),
    at: (u, v, w) => [s.x + tx * u - s.nx * w, s.y + v, s.z + tz * u - s.nz * w],
  };
}

// the flames in a fireplace: [u, w (share of the depth), half width, height, when it catches (0 first .. 1 last)], for the 0.42 m
// opening of our living room (fires.js scales them to the opening)
export const TONGUES = [
  [0, 0.52, 0.13, 0.5, 0], [-0.14, 0.58, 0.095, 0.38, 0.12], [0.15, 0.46, 0.1, 0.4, 0.08],
  [-0.26, 0.5, 0.06, 0.24, 0.35], [0.27, 0.56, 0.055, 0.22, 0.42], [0.05, 0.3, 0.07, 0.26, 0.25],
];
// the glow: on the hearth in front, on the face round the opening, and on the firebox's back (kind, u, v, w, half sizes, facing)
export const GLOWS = [
  { on: 'hearth', w: -0.3, half: [1.7, 0.42] },  // (w: in front of the face; half: x the opening's half width, metres deep)
  { on: 'face', w: -0.012, half: [1.55, 0.78] },  // (half: x the opening's half width, x its height)
  { on: 'back', w: 0.97, half: [0.95, 0.7] },    // (w: share of the depth)
];

const IRON = '#26262b', BARK = '#4a2c1c', BARK2 = '#5c3a24', WOOD = '#8a5a34';
export function buildHearth(b, s, eb = null) {
  const F = hearthFrame(s), k = s.w / 0.42, D = s.d;
  const put = (geo, c, u, v, w, o = {}) => { const [x, y, z] = F.at(u, v, w); b.add(geo, c, { x, y, z, ...o, ry: F.yaw + (o.ry || 0) }); };
  // the grate: a front bar with five short uprights, two side rails back into the firebox, four little legs
  const gw = s.w - 0.07, g0 = D * 0.18, g1 = D * 0.86;
  put(GEO.box, IRON, 0, 0.1, g0, { sx: gw * 2, sy: 0.025, sz: 0.025 });
  for (let i = 0; i < 5; i++) put(GEO.box, IRON, -gw + 0.02 + i * (gw * 2 - 0.04) / 4, 0.13, g0, { sx: 0.016, sy: 0.09, sz: 0.016 });
  for (const sg of [-1, 1]) {
    put(GEO.box, IRON, sg * gw, 0.07, (g0 + g1) / 2, { sx: 0.022, sy: 0.022, sz: g1 - g0 });
    for (const w of [g0, g1]) put(GEO.box, IRON, sg * gw, 0.035, w, { sx: 0.022, sy: 0.07, sz: 0.022 });
  }
  put(GEO.box, IRON, 0, 0.07, g1, { sx: gw * 2, sy: 0.02, sz: 0.02 });
  // the logs: two across the grate, one laid over them at a slant, cut ends paler
  const lr = 0.055 * Math.min(1.1, k), len = gw * 1.75;
  const log = (u, v, w, ry, c, r = lr, l = len) => {
    put(GEO.cyl8, c, u, v, w, { sx: r, sy: l, sz: r, rz: Math.PI / 2, ry });
    for (const e of [-1, 1]) put(GEO.cyl8, WOOD, u + Math.cos(ry) * e * (l / 2 + 0.002), v, w + Math.sin(ry) * e * (l / 2 + 0.002), { sx: r * 0.82, sy: 0.006, sz: r * 0.82, rz: Math.PI / 2, ry });
  };
  log(0, 0.1 + lr, D * 0.36, 0.06, BARK);
  log(0.02, 0.1 + lr, D * 0.66, -0.08, BARK2);
  log(-0.03, 0.1 + lr * 2.6, D * 0.5, 0.42, BARK, lr * 0.92, len * 0.82);
  // the coals: a glowing bed under the grate, a few coals, glowing spots under the logs (fires.js cools them)
  if (!eb) {
    eb = new Batcher({ castShadow: false, receiveShadow: false });
    eb.emberMat = toon('#e8561a', { emissive: '#ff5e16', emissiveIntensity: 0.6 }).clone(); eb.emberMat.name = 'hearth-embers-' + s.id;
  }
  const { emberMat } = eb;
  const ep = (geo, m, u, v, w, o) => { const [x, y, z] = F.at(u, v, w); eb.add(geo, m, { x, y, z, ...o, ry: F.yaw + (o.ry || 0) }); };
  ep(GEO.ico1, emberMat, 0, 0.012, D * 0.52, { sx: gw * 0.9, sy: 0.03, sz: D * 0.34 });
  for (let i = 0; i < 7; i++) put(GEO.dodec, i % 2 ? '#2e2622' : '#3a2c26', -gw * 0.75 + i * gw * 0.25, 0.035, D * (0.3 + (i % 3) * 0.17), { sx: 0.035, sy: 0.025, sz: 0.032, ry: i });
  for (const [u, w] of [[-0.12, 0.36], [0.1, 0.36], [-0.06, 0.66], [0.15, 0.66]]) ep(GEO.sphere, emberMat, u * k, 0.1 + lr * 0.35, D * w, { sx: 0.035 * k, sy: 0.018, sz: 0.03 });
  return eb;
}

// the firebox's lining in an opening cut through a surround (axis-aligned specs only: facing along x or z): its floor, sooty back,
// sides and top, each a thin slab just inside the cut so no face lies on another
export function firebox(b, s, floor, wall) {
  const F = hearthFrame(s), t = 0.012;
  const box = (u0, v0, w0, u1, v1, w1, c) => {
    const p = F.at(u0, v0, w0), q = F.at(u1, v1, w1);
    b.boxMinMax(Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.min(p[2], q[2]), Math.max(p[0], q[0]), Math.max(p[1], q[1]), Math.max(p[2], q[2]), c);
  };
  const lo = s.y0 ?? (s.y - 0.06);
  box(-s.w, lo - s.y, 0, s.w, 0, s.d, floor);
  box(-s.w, 0, s.d - t, s.w, s.h, s.d, wall);
  for (const sg of [-1, 1]) box(sg * s.w, 0, 0, sg * (s.w - t), s.h, s.d - t, wall);
  box(-s.w, s.h - t, 0, s.w, s.h, s.d - t, wall);
}

// the glowing bed built into a group: a mesh that never merges and keeps its own material (weather-cover copies the materials of
// baked meshes, and a copy would never cool), on the soft layer (a glow needs no ink line: one draw, not two)
export function buildEmbers(eb, group, name) {
  const out = eb.build(group, name);
  for (const m of out) { m.matrixAutoUpdate = true; m.userData.noMerge = true; m.castShadow = m.receiveShadow = false; m.layers.set(LAYER_SOFT); }
  return { meshes: out, emberMat: eb.emberMat };
}
