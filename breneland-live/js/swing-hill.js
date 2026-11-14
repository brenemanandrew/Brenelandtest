// The swing hill's shape, pure: the swing's frame (where the rope hangs, the way the rider faces), the hill's
// extra height over the lawn and the sand pit at its foot. terrain.js adds hillHeight() to the ground, so the mesh, the grass,
// the trails, the shadows and everyone's feet follow it; swing-tree.js, swing-rig.js, swing.js and the pit's props read the
// frame from here. Only layout.js is imported (no THREE), so tools can load it in Node.
import { SWING_TREE, SWING_HILL } from './layout.js';

const H = SWING_HILL;
const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// The swing's frame: F = the way the rider faces, R = the rider's right (the branch runs from the trunk that way), the pivot's
// ground spot. With yaw = PI the tire hangs 3.2 m east of the trunk and the rider faces north.
export const SWING_FRAME = (() => {
  const fx = Math.sin(H.yaw), fz = Math.cos(H.yaw);
  const rx = -fz, rz = fx;
  return { yaw: H.yaw, fx, fz, rx, rz, x: SWING_TREE.x + rx * H.hang, z: SWING_TREE.z + rz * H.hang, hang: H.hang };
})();
const P = SWING_FRAME;

// (x, z) -> the swing's frame: u metres ahead of the pivot, v metres to its right
export function hillUV(x, z, out = { u: 0, v: 0 }) {
  const dx = x - P.x, dz = z - P.z;
  out.u = dx * P.fx + dz * P.fz; out.v = dx * P.rx + dz * P.rz;
  return out;
}
// the frame -> world
export function hillXZ(u, v, out = { x: 0, z: 0 }) {
  out.x = P.x + P.fx * u + P.rx * v; out.z = P.z + P.fz * u + P.rz * v;
  return out;
}

// The box round everything the hill touches (a cheap early out: terrainHeight runs a few hundred times a frame).
const REACH = Math.max(H.top.f + H.fall.f, H.top.b + H.fall.b, H.top.s + Math.max(H.fall.r, H.fall.l)) + 1;
const BOX = { minX: P.x - REACH, maxX: P.x + REACH, minZ: P.z - REACH, maxZ: P.z + REACH };

// How far up the hill (0 on the lawn .. 1 on the top) a point in the frame is: a flat top, then a rounded fall on each side,
// longest down the slope the swing faces. The two directions combine as a distance (rounded corners, no ridges).
export function hillK(u, v) {
  const a = u > H.top.f ? (u - H.top.f) / H.fall.f : u < -H.top.b ? (-H.top.b - u) / H.fall.b : 0;
  const b = v > H.top.s ? (v - H.top.s) / H.fall.r : v < -H.top.s ? (-H.top.s - v) / H.fall.l : 0;
  const d = Math.sqrt(a * a + b * b);
  if (d >= 1) return 0;
  return 0.5 + 0.5 * Math.cos(Math.PI * d); // flat at the top's edge and at the foot: a cartoon mound, never a crease
}

// The hill's extra height at (x, z) in metres. `coast` = coastSigned(x, z): nothing changes within 9 m of any water (the tests
// fingerprint the lakes' shores and beds), easing in from 13 m.
export function hillHeight(x, z, coast = -60) {
  if (x < BOX.minX || x > BOX.maxX || z < BOX.minZ || z > BOX.maxZ || coast > -9) return 0;
  const dx = x - P.x, dz = z - P.z;
  const k = hillK(dx * P.fx + dz * P.fz, dx * P.rx + dz * P.rz);
  if (k <= 0) return 0;
  return H.h * k * (coast > -13 ? smooth((-9 - coast) / 4) : 1);
}

// The sand pit: a rectangle along the slope's line with rounded corners. Signed distance to its edge (< 0 inside), in metres.
export function sandSigned(x, z) {
  const S = H.sand, r = S.r;
  const dx = x - P.x, dz = z - P.z;
  const u = dx * P.fx + dz * P.fz, v = dx * P.rx + dz * P.rz;
  const qu = Math.abs(u - (S.u0 + S.u1) / 2) - (S.u1 - S.u0) / 2 + r, qv = Math.abs(v) - S.w + r;
  const ou = qu > 0 ? qu : 0, ov = qv > 0 ? qv : 0;
  return Math.sqrt(ou * ou + ov * ov) + Math.min(Math.max(qu, qv), 0) - r;
}
export const inSand = (x, z, pad = 0) => sandSigned(x, z) < pad;
// the pit's middle and its long axis, for the props and the tests
export const SAND = (() => {
  const S = H.sand, m = (S.u0 + S.u1) / 2;
  return { u0: S.u0, u1: S.u1, w: S.w, r: S.r, x: P.x + P.fx * m, z: P.z + P.fz * m, len: S.u1 - S.u0 };
})();

// the pit's outline in the swing's frame, about every `step` metres: [{ u, v }] round the rounded rectangle (anticlockwise in
// u, v: the far right corner, the near right, the near left, the far left, each arc then the straight on to the next)
export function pitOutline(step = 0.9) {
  const { u0, u1, w, r } = SAND;
  const C = [[u1 - r, w - r, 0], [u0 + r, w - r, Math.PI / 2], [u0 + r, -w + r, Math.PI], [u1 - r, -w + r, Math.PI * 1.5]];
  const out = [], arcN = Math.max(2, Math.round((Math.PI / 2 * r) / step));
  C.forEach(([cu, cv, a0], i) => {
    for (let k = 0; k < arcN; k++) { const a = a0 + (k / arcN) * Math.PI / 2; out.push({ u: cu + Math.cos(a) * r, v: cv + Math.sin(a) * r }); }
    const [nu, nv, na] = C[(i + 1) % 4];
    const su = cu + Math.cos(a0 + Math.PI / 2) * r, sv = cv + Math.sin(a0 + Math.PI / 2) * r, eu = nu + Math.cos(na) * r, ev = nv + Math.sin(na) * r;
    const n = Math.max(1, Math.round(Math.hypot(eu - su, ev - sv) / step));
    for (let k = 0; k < n; k++) out.push({ u: su + (eu - su) * k / n, v: sv + (ev - sv) * k / n });
  });
  return out;
}
