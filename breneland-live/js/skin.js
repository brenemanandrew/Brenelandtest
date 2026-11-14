// Smooth cartoon skins: the unicorns' technique, shared with the dogs and anything else that should read as one animal
// instead of a pile of primitives.
//
//  - A shape is a list of ellipsoids blended with a smooth minimum (a signed distance field). `sdfMesh` samples it by
//    pushing the vertices of a sphere out along rays to the surface, so the result is one closed skin with soft
//    normals (bent a little toward a centre so the toon ramp shades it as one soft body and the ink pass draws no
//    creases). Vertex colours and UVs are kept, so markings can be vertex-painted or texture-mapped along the body.
//  - `sweep` builds a tube through rings (legs, necks, tails, ears), optionally skinned on bones, with UVs.
//  - `decal` / `band` lay flat marks on a skin's surface with the skin's own normals (they shade identically and
//    get no outline), `mount` finds where to attach eyes and ears.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
export const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color();

export const merge = list => mergeGeometries(list, false);

// Vertex-paint a geometry: one colour, or a function of the vertex position (x, y, z) -> colour.
export function paint(g, color) {
  const P = g.attributes.position, n = P.count, a = new Float32Array(n * 3);
  const fn = typeof color === 'function' ? color : null;
  if (!fn) _c.set(color);
  for (let i = 0; i < n; i++) {
    if (fn) _c.set(fn(P.getX(i), P.getY(i), P.getZ(i)));
    a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!g.attributes.uv) {
    const uv = new Float32Array(n * 2);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  return g;
}

const SPH = new THREE.SphereGeometry(1, 14, 10), SPH_MID = new THREE.SphereGeometry(1, 10, 7), SPH_LO = new THREE.SphereGeometry(1, 8, 6), SPH_TINY = new THREE.SphereGeometry(1, 6, 4);
const LOD = { mid: SPH_MID, lo: SPH_LO, tiny: SPH_TINY };
// An ellipsoid: colour, centre, radii, optional rotation (x, y, z, YXZ order), optional detail ('mid', 'lo', 'tiny';
// by default big blobs get the full sphere and small ones the low one).
export function blob(color, p, r, rot = null, lod = null) {
  const g = (LOD[lod] || (Math.max(r[0], r[1], r[2]) < 0.05 ? SPH_LO : SPH)).clone();
  _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ'); _q.setFromEuler(_e);
  g.applyMatrix4(_m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(r[0], r[1], r[2])));
  return paint(g, color);
}

// A tube swept through rings. ring = { c:[x,y,z], a:[..], b:[..], ra, rb, col, colf(angle), mod(angle), cup, w:[w0,w1,w2] (bone
// weights when skinned), v (texture coordinate along the tube, else the ring index fraction) }.
// A ring with ra = rb = 0 is a single pole vertex. u runs around the ring from angle `u0` (radians).
export function sweep(rings, seg = 12, { skinned = false, u0 = 0, uScale = 1 } = {}) {
  const pos = [], colr = [], uv = [], si = [], sw = [], idx = [], start = [];
  rings.forEach((r, ri) => {
    start.push(pos.length / 3);
    const pole = r.ra < 1e-5 && r.rb < 1e-5;
    const n = pole ? 1 : seg + 1;             // one duplicated column so the texture does not pinch at the seam
    const v = r.v !== undefined ? r.v : ri / (rings.length - 1);
    for (let j = 0; j < n; j++) {
      const ang = (j / seg) * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
      const k = r.mod ? r.mod(ang) : 1, cup = r.cup ? r.cup * ca * ca : 0;   // cup: the ring's edges bend along b (a curled leaf)
      pos.push(
        r.c[0] + (r.a[0] * ca * r.ra + r.b[0] * sa * r.rb) * k + r.b[0] * cup,
        r.c[1] + (r.a[1] * ca * r.ra + r.b[1] * sa * r.rb) * k + r.b[1] * cup,
        r.c[2] + (r.a[2] * ca * r.ra + r.b[2] * sa * r.rb) * k + r.b[2] * cup);
      _c.set(r.colf ? r.colf(ang) : r.col);
      colr.push(_c.r, _c.g, _c.b);
      uv.push(pole ? 0.5 : (((ang - u0) / TAU) % 1 + 1) % 1 * uScale, v);
      if (skinned) { const w = r.w; si.push(0, 1, 2, 3); sw.push(w[0], w[1], w[2], w[3] || 0); }
    }
  });
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    const ap = A.ra < 1e-5 && A.rb < 1e-5, bp = B.ra < 1e-5 && B.rb < 1e-5;
    if (ap && bp) continue;
    for (let j = 0; j < seg; j++) {
      const j1 = j + 1;
      const a0 = start[i] + (ap ? 0 : j), a1 = start[i] + (ap ? 0 : j1);
      const b0 = start[i + 1] + (bp ? 0 : j), b1 = start[i + 1] + (bp ? 0 : j1);
      if (!ap) idx.push(a0, b0, a1);
      if (!bp) idx.push(a1, b0, b1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (skinned) {
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  }
  // make the faces point outwards (cheap test on a middle triangle)
  const mid = Math.floor(rings.length / 2), R = rings[mid];
  const vi = start[mid];
  let flip = false;
  for (let t = 0; t < idx.length; t += 3) {
    if (idx[t] === vi || idx[t + 1] === vi) {
      const a = new THREE.Vector3(pos[idx[t] * 3], pos[idx[t] * 3 + 1], pos[idx[t] * 3 + 2]);
      const b = new THREE.Vector3(pos[idx[t + 1] * 3], pos[idx[t + 1] * 3 + 1], pos[idx[t + 1] * 3 + 2]);
      const c = new THREE.Vector3(pos[idx[t + 2] * 3], pos[idx[t + 2] * 3 + 1], pos[idx[t + 2] * 3 + 2]);
      const n = b.sub(a).cross(c.sub(a));
      const out = a.set(pos[vi * 3] - R.c[0], pos[vi * 3 + 1] - R.c[1], pos[vi * 3 + 2] - R.c[2]);
      flip = n.dot(out) < 0;
      break;
    }
  }
  if (flip) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  g.setIndex(idx);
  g.computeVertexNormals();
  // the seam column shares its normal with the first column
  const N = g.attributes.normal;
  rings.forEach((r, ri) => {
    if (r.ra < 1e-5 && r.rb < 1e-5) return;
    const s0 = start[ri], s1 = start[ri] + seg;
    N.setXYZ(s1, N.getX(s0), N.getY(s0), N.getZ(s0));
  });
  return g;
}

// A capsule hanging down from y = 0 to y = -len, radius r0 at the top and r1 at the bottom. `split` = y below which
// the colour changes (a sock), or null. `taper(s)` can shape the radius along the way. Rounded top and bottom.
export function limb(len, r0, r1, colTop, colBot = colTop, split = null, { flat = 0.95, shape = null, uScale = 1, vScale = 1, seg = 10, steps = 6 } = {}) {
  const R = (y, r, cl) => ({ c: [0, y, 0], a: X, b: Z, ra: r, rb: r * flat, col: cl, v: (-y / len) * vScale });
  const pole = (y, cl) => ({ c: [0, y, 0], a: X, b: Z, ra: 0, rb: 0, col: cl, v: (-y / len) * vScale });
  const N = 4;
  const rings = [pole(r0, colTop)];
  for (let k = 1; k <= N; k++) { const f = (k / N) * Math.PI / 2; rings.push(R(r0 * Math.cos(f), r0 * Math.sin(f) * (shape ? shape(0) : 1), colTop)); }
  const taper = s => (r0 + (r1 - r0) * s) * (shape ? shape(s) : 1);
  let sockOn = false;
  for (let k = 1; k <= steps; k++) {
    const s = k / steps, y = -len * s;
    if (split !== null && !sockOn && y <= split) {
      const sp = -split / len;
      rings.push(R(split, taper(sp), colTop), R(split, taper(sp), colBot));
      sockOn = true;
    }
    rings.push(R(y, taper(s), sockOn ? colBot : colTop));
  }
  const cb = sockOn ? colBot : colTop;
  for (let k = 1; k <= N; k++) {
    const f = (k / N) * Math.PI / 2;
    rings.push(k === N ? pole(-len - r1, cb) : R(-len - r1 * Math.sin(f), r1 * Math.cos(f), cb));
  }
  return sweep(rings, seg, { uScale });
}

// ------------------------------------------------------------------ smooth surfaces (signed distance fields)
// A shape is a list of ellipsoids [cx, cy, cz, rx, ry, rz, k]; each one after the first is blended in with a
// smooth minimum of width k. The mesh is a sphere whose vertices are pushed out along rays to the outermost surface.

function sdEll(x, y, z, e) {       // Inigo Quilez's ellipsoid distance (a good bound near the surface)
  const qx = (x - e[0]) / e[3], qy = (y - e[1]) / e[4], qz = (z - e[2]) / e[5];
  const ax = qx / e[3], ay = qy / e[4], az = qz / e[5];
  const k0 = Math.sqrt(qx * qx + qy * qy + qz * qz), k1 = Math.sqrt(ax * ax + ay * ay + az * az);
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(e[3], e[4], e[5]);
}
// A rounded box (exact distance): [cx, cy, cz, hx, hy, hz, k, BOX, round, pitch] - half sizes, corner radius, and an
// optional tilt about x (radians, + tips the front down). Made by `rbox`; blocky heads (Dax's) are built from these.
const BOX = -1;
// taper: toward +z the box narrows (x) and its top comes down (y) by that fraction at the front face (a muzzle that
// narrows and slopes toward the nose); a bound rather than an exact distance there, which the ray search tolerates
export const rbox = (c, h, k, round, pitch = 0, taper = 0) => [c[0], c[1], c[2], h[0], h[1], h[2], k, BOX, round, pitch, taper];
function sdBox(x, y, z, e) {
  let px = Math.abs(x - e[0]), py = y - e[1], pz = z - e[2];
  if (e[9]) { const c = Math.cos(e[9]), s = Math.sin(e[9]), ty = py * c + pz * s; pz = -py * s + pz * c; py = ty; }
  let hx = e[3], hy = e[4];
  if (e[10]) {
    const u = Math.min(1, Math.max(0, (pz / e[5] + 1) / 2)) * e[10];   // 0 at the back face .. taper at the front
    hx *= 1 - u; py += hy * u * 0.5; hy *= 1 - 0.5 * u;                // narrower, and the top slopes down (the bottom stays)
  }
  py = Math.abs(py); pz = Math.abs(pz);
  const r = e[8], qx = px - hx + r, qy = py - hy + r, qz = pz - e[5] + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
const prim = (x, y, z, e) => (e[7] === BOX ? sdBox(x, y, z, e) : sdEll(x, y, z, e));
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
export function sdf(S, x, y, z) {
  let d = prim(x, y, z, S[0]);
  for (let i = 1; i < S.length; i++) d = smin(d, prim(x, y, z, S[i]), S[i][6]);
  return d;
}
// Outermost surface point along the ray o + d t (0 < t < maxT), and its normal: the field's gradient, bent a
// little toward the direction from `ro` (radial) so a body shades like one soft shape instead of in bands.
export const _sp = [0, 0, 0], _sn = [0, 0, 0];
export function surf(S, o, dx, dy, dz, maxT, ro, radial) {
  const n = 32, at = t => sdf(S, o[0] + dx * t, o[1] + dy * t, o[2] + dz * t);
  let a = 0, b = maxT / n;
  for (let i = n; i > 0; i--) { const t = (maxT * (i - 1)) / n; if (at(t) < 0) { a = t; b = (maxT * i) / n; break; } }
  for (let i = 0; i < 14; i++) { const m = (a + b) / 2; if (at(m) < 0) a = m; else b = m; }
  const t = (a + b) / 2, px = o[0] + dx * t, py = o[1] + dy * t, pz = o[2] + dz * t, e = 0.0015;
  let gx = sdf(S, px + e, py, pz) - sdf(S, px - e, py, pz), gy = sdf(S, px, py + e, pz) - sdf(S, px, py - e, pz), gz = sdf(S, px, py, pz + e) - sdf(S, px, py, pz - e);
  let l = Math.hypot(gx, gy, gz) || 1; gx /= l; gy /= l; gz /= l;
  let rx = px - ro[0], ry = py - ro[1], rz = pz - ro[2];
  l = Math.hypot(rx, ry, rz) || 1;
  let nx = gx * (1 - radial) + (rx / l) * radial, ny = gy * (1 - radial) + (ry / l) * radial, nz = gz * (1 - radial) + (rz / l) * radial;
  l = Math.hypot(nx, ny, nz) || 1;
  _sp[0] = px; _sp[1] = py; _sp[2] = pz; _sn[0] = nx / l; _sn[1] = ny / l; _sn[2] = nz / l;
  return _sp;
}
// shape descriptor: { S, o (ray origin inside), ro (radial origin), radial, stretch (ray spread), maxT, axis ('y' or 'z':
// the sphere's poles lie on this axis), uv (fn(x,y,z) -> [u,v], else u around the axis and v along it) }
export function surfTo(sh, x, y, z, fromO = sh.o) {   // the surface under a point, looking from fromO
  let dx = x - fromO[0], dy = y - fromO[1], dz = z - fromO[2];
  const l = Math.hypot(dx, dy, dz) || 1;
  return surf(sh.S, fromO, dx / l, dy / l, dz / l, sh.maxT, sh.ro, sh.radial);
}
export function sdfMesh(sh, color, wSeg, hSeg) {
  const g = new THREE.SphereGeometry(1, wSeg, hSeg);
  if (sh.axis === 'z') g.rotateX(Math.PI / 2);     // poles on the z axis (nose and tail)
  const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv, n = P.count, st = sh.stretch;
  let zmin = 1e9, zmax = -1e9;
  for (let i = 0; i < n; i++) {
    let dx = P.getX(i) * st[0], dy = P.getY(i) * st[1], dz = P.getZ(i) * st[2];
    const l = Math.hypot(dx, dy, dz);
    surf(sh.S, sh.o, dx / l, dy / l, dz / l, sh.maxT, sh.ro, sh.radial);
    P.setXYZ(i, _sp[0], _sp[1], _sp[2]); N.setXYZ(i, _sn[0], _sn[1], _sn[2]);
    if (_sp[2] < zmin) zmin = _sp[2]; if (_sp[2] > zmax) zmax = _sp[2];
  }
  if (sh.uv) for (let i = 0; i < n; i++) { const t = sh.uv(P.getX(i), P.getY(i), P.getZ(i)); UV.setXY(i, t[0], t[1]); }
  else if (sh.axis === 'z') {
    // u: around the body: 0.25 on the spine, 0.5 on the right flank, 0.75 under the belly, 0 (= 1) on the left flank,
    // which is where the sphere's own seam column sits; v: along the body, 0 at the tail end, 1 at the nose
    for (let i = 0; i < n; i++) {
      const x = P.getX(i) - sh.o[0], y = P.getY(i) - sh.o[1];
      const ang = Math.atan2(x, y);               // 0 on top, +pi/2 on the right (+x), pi below
      const u = (((ang + Math.PI / 2) / TAU) % 1 + 1) % 1;
      // the sphere's seam is a doubled column on the left flank (u = 0 = 1). Its own u runs the other way round (first
      // column old u = 0, next to the belly side where u is near 1; last column old u = 1, next to the spine side where
      // u is near 0), so the first copy must read 1 and the last 0, or one strip of triangles smears the whole texture
      const old = UV.getX(i);
      const uu = old < 1e-6 ? (u < 0.5 ? u + 1 : u) : old > 1 - 1e-6 ? (u > 0.5 ? u - 1 : u) : u;
      UV.setXY(i, uu, (P.getZ(i) - zmin) / (zmax - zmin));
    }
  }
  return paint(g, color);
}
// A flat mark laid on the surface: an ellipse (or a shape r(angle)) of half-size w x h around the surface point under
// `c`, rotated by `rot` in the tangent plane, lifted by `lift`. Same normals as the skin, so it shades identically.
export function decal(sh, c, w, h, color, { rot = 0, lift = 0.0016, shape = null, seg = 18, fromO, rings = 1 } = {}) {
  surfTo(sh, c[0], c[1], c[2], fromO);
  const p0 = [..._sp], n0 = [..._sn];
  const up = Math.abs(n0[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
  const d = up[0] * n0[0] + up[1] * n0[1] + up[2] * n0[2];
  const U = new THREE.Vector3(up[0] - n0[0] * d, up[1] - n0[1] * d, up[2] - n0[2] * d).normalize();
  const R = new THREE.Vector3().crossVectors(U, new THREE.Vector3(n0[0], n0[1], n0[2]));
  const pos = [], nor = [], idx = [];
  const put = (x, y, z) => {
    surfTo(sh, x, y, z, fromO);
    pos.push(_sp[0] + _sn[0] * lift, _sp[1] + _sn[1] * lift, _sp[2] + _sn[2] * lift); nor.push(_sn[0], _sn[1], _sn[2]);
  };
  put(p0[0], p0[1], p0[2]);
  // concentric rings so a big mark follows the curve of the body instead of sinking under it
  for (let r = 1; r <= rings; r++) {
    const f = r / rings;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * TAU, k = (shape ? shape(a) : 1) * f;
      const ca = Math.cos(a) * w * k, sa = Math.sin(a) * h * k, cr = Math.cos(rot), sr = Math.sin(rot);
      const u = ca * cr - sa * sr, v = ca * sr + sa * cr;
      put(p0[0] + R.x * u + U.x * v, p0[1] + R.y * u + U.y * v, p0[2] + R.z * u + U.z * v);
      const me = 1 + (r - 1) * seg + i, next = 1 + (r - 1) * seg + ((i + 1) % seg);
      if (r === 1) idx.push(0, me, next);
      else { const inA = me - seg, inB = next - seg; idx.push(inA, me, next, inA, next, inB); }
    }
  }
  return finishDecal(pos, nor, idx, color, n0);
}
// A painted band through points near the surface, `w` wide (a number, or an array of widths per point), optionally
// thinner at the ends (taper). Points are projected from `fromO` (or the shape's origin).
export function band(sh, pts, w, color, { lift = 0.0018, fromO, taper = true, sub = 1 } = {}) {
  // subdivide the polyline so the band hugs the curve
  const src = [];
  for (let i = 0; i < pts.length; i++) {
    src.push({ p: pts[i], w: Array.isArray(w) ? w[i] : w });
    if (sub > 1 && i < pts.length - 1) for (let k = 1; k < sub; k++) {
      const f = k / sub, a = pts[i], b = pts[i + 1], wa = Array.isArray(w) ? w[i] : w, wb = Array.isArray(w) ? w[i + 1] : w;
      src.push({ p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], w: wa + (wb - wa) * f });
    }
  }
  const S = src.map(s => { surfTo(sh, s.p[0], s.p[1], s.p[2], fromO); return { p: new THREE.Vector3(..._sp), n: new THREE.Vector3(..._sn), w: s.w }; });
  const pos = [], nor = [], idx = [], T = new THREE.Vector3(), side = new THREE.Vector3();
  S.forEach((s, i) => {
    T.subVectors(S[Math.min(S.length - 1, i + 1)].p, S[Math.max(0, i - 1)].p).normalize();
    side.crossVectors(s.n, T).normalize();
    const f = taper ? (0.45 + 0.55 * Math.sin(Math.PI * (0.08 + 0.84 * i / (S.length - 1)))) : 1;
    const hw = s.w * 0.5 * f;
    for (const sg of [-1, 1]) {
      pos.push(s.p.x + side.x * hw * sg + s.n.x * lift, s.p.y + side.y * hw * sg + s.n.y * lift, s.p.z + side.z * hw * sg + s.n.z * lift);
      nor.push(s.n.x, s.n.y, s.n.z);
    }
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  return finishDecal(pos, nor, idx, color, [S[1].n.x, S[1].n.y, S[1].n.z]);
}
function finishDecal(pos, nor, idx, color, n0) {
  // wind the triangles to face along the normal
  const a = new THREE.Vector3(pos[idx[0] * 3], pos[idx[0] * 3 + 1], pos[idx[0] * 3 + 2]);
  const b = new THREE.Vector3(pos[idx[1] * 3], pos[idx[1] * 3 + 1], pos[idx[1] * 3 + 2]).sub(a);
  const c = new THREE.Vector3(pos[idx[2] * 3], pos[idx[2] * 3 + 1], pos[idx[2] * 3 + 2]).sub(a);
  if (b.cross(c).dot(new THREE.Vector3(...n0)) < 0) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return paint(g, color);
}
// Place something on the surface: position (sunk by `sink`) and a quaternion whose +z is the surface normal bent
// toward `lean` (a direction) and whose +y points up.
export function mount(sh, c, sink = 0, lean = null, leanAmt = 0, fromO) {
  surfTo(sh, c[0], c[1], c[2], fromO);
  const n = new THREE.Vector3(..._sn);
  if (lean) n.lerp(new THREE.Vector3(...lean).normalize(), leanAmt).normalize();
  const p = new THREE.Vector3(..._sp).addScaledVector(new THREE.Vector3(..._sn), -sink);
  const y = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
  const x = new THREE.Vector3().crossVectors(y, n);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n));
  return { p, q, n: new THREE.Vector3(..._sn) };
}
// Scale every UV of a geometry (to tile a texture at a different density on a smaller part).
export function uvScale(g, su, sv, du = 0, dv = 0) {
  const UV = g.attributes.uv;
  if (!UV) return g;
  for (let i = 0; i < UV.count; i++) UV.setXY(i, UV.getX(i) * su + du, UV.getY(i) * sv + dv);
  return g;
}
// Recompute every UV from the vertex position and its current uv: fn(x, y, z, u, v) -> [u, v].
export function uvMap(g, fn) {
  const UV = g.attributes.uv, P = g.attributes.position;
  if (!UV) return g;
  for (let i = 0; i < UV.count; i++) { const t = fn(P.getX(i), P.getY(i), P.getZ(i), UV.getX(i), UV.getY(i)); UV.setXY(i, t[0], t[1]); }
  return g;
}
