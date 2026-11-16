// The unicorns: chunky toy ponies with a big round head, big eyes, short sturdy legs, a puffy mane and tail and a bold horn.
// (world-refresh 2026-11-16, tools/unicorn-toy.js copied over js/unicorn.js by tools/patch_unicorns_new.py. Andrew: "The unicorn
// models broke. Make new ones that look even more cartoony.")
//
//   new Unicorn({ color, accent, scale, mane, mark, eye, socks, blaze, build, tail, horn, hornLen })
//   (the same keys as before, so the NPC Editor and the saved looks still work. A pale coat is turned into a strong colour of
//   the same hue: pastels washed out under the ink pass's vibrance grade and bloom.)
//   .root  .update(dt, t, speed, anim)  .lookYaw  .kind === 'unicorn'
//   build: 'classic' (default) | 'lean' (a little taller) | 'chunky' (rounder) | 'foal' (small, even bigger head)
//
// What changed from the pastel ponies:
//  - Toy proportions: the head is about as big as the barrel, the legs are short thick capsules ending in big round hooves
//    (no thin shins, no gaps at the knees), the neck is short and thick.
//  - Solid colours: the coat, the muzzle, the hooves, every puff of the mane and tail are vertex colours on ONE toon material
//    with a three-step ramp, so rigid-merge.js draws the whole animal (minus its skinned neck) as one mesh, and it is inked as
//    one solid (inkSolid: only its silhouette and where a part stands in front of another).
//  - The mane, forelock and tail are spring chains of round puffs (the same springs as before), not thin ribbons.
//  - The rig, the gait, the poses and the idle life are the old ones (npcs.js drives them the same way).
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { shadows, soft } from './toon.js';
import { hashStr, mulberry32, clamp, smoothstep } from './util.js';
import { dayPhase } from './daytime.js';
// how dark it is (0 day .. 1 night), looked up every couple of seconds: the horn's glow is a night thing (by day the additive
// halo read as a white smudge over the head)
let nightK = 0, nightAt = -1;
function nightNow(T) { if (T - nightAt > 2 || T < nightAt) { nightAt = T; try { nightK = dayPhase(Date.now()).night; } catch { nightK = 0; } } return nightK; }

const TAU = Math.PI * 2;
const PI = Math.PI;

// ------------------------------------------------------------------ colour helpers

const col = c => new THREE.Color(c);
function darker(hex, f = 0.7) { return '#' + col(hex).multiplyScalar(f).getHexString(); }
function mix(a, b, t) { return '#' + col(a).lerp(col(b), t).getHexString(); }
function hsl(hex) { const o = {}; col(hex).getHSL(o); return o; }
// a strong colour of the same hue: pastels get their saturation up and their lightness down; greys and dark coats stay
// A strong colour of the same hue: a pastel gets its saturation up, and nothing is brighter than vMax (HSV value). The game's
// noon sun and sky light are strong: a channel near full goes past the vibrant grade's bloom threshold and the whole animal
// glows into a pale haze (what the old pastel ponies did). Greys stay grey, dark coats stay dark.
function vivid(hex, vMax = 0.86, sMin = 0.58) {
  const c = col(hex).convertLinearToSRGB(), mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
  const o = hsl(hex);
  if (mx - mn < 0.1) return mx > 0.85 ? '#ece6f4' : hex;
  const s = Math.max((mx - mn) / mx, sMin), v = Math.min(mx, vMax);
  // HSV to RGB at hue o.h
  const f = (n) => { const k = (n + o.h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return '#' + new THREE.Color().setRGB(f(5), f(3), f(1), THREE.SRGBColorSpace).getHexString();
}
// how far apart two colours are, mostly by hue (a red mark on a pink coat does not read)
function hueGap(a, b) { const A = hsl(a), B = hsl(b); let d = Math.abs(A.h - B.h); d = Math.min(d, 1 - d); return d * Math.min(A.s, B.s) * 2 + Math.abs(A.l - B.l); }

// ------------------------------------------------------------------ material (one, vertex coloured)

// three cel steps, the shade a little lighter than the world's (0.38) so a coloured face does not go muddy
const TOY_RAMP = [0.56, 0.82, 1.0];
let rampTex = null;
function ramp() {
  if (rampTex) return rampTex;
  const data = new Uint8Array(TOY_RAMP.map(v => Math.round(v * 255)));
  rampTex = new THREE.DataTexture(data, TOY_RAMP.length, 1, THREE.RedFormat);
  rampTex.minFilter = rampTex.magFilter = THREE.NearestFilter;
  rampTex.generateMipmaps = false;
  rampTex.needsUpdate = true;
  return rampTex;
}
let vcMat = null;
function toyMat() {
  if (!vcMat) { vcMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: ramp(), vertexColors: true }); vcMat.name = 'unicorn-toy'; }
  return vcMat;
}

// ------------------------------------------------------------------ geometry builders

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

function paint(g, color) {
  const c = col(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

const SPH = new THREE.SphereGeometry(1, 14, 10), SPH_LO = new THREE.SphereGeometry(1, 8, 6);
// An ellipsoid: colour, centre, radii, optional rotation (x, y, z, YXZ order).
function blob(color, p, r, rot = null) {
  const g = (Math.max(r[0], r[1], r[2]) < 0.07 ? SPH_LO : SPH).clone();
  _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ'); _q.setFromEuler(_e);
  g.applyMatrix4(_m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(r[0], r[1], r[2])));
  return paint(g, color);
}

// A tube swept through rings. ring = { c:[x,y,z], a:[..], b:[..], ra, rb, col, colf(angle), mod(angle), w:[w0,w1,w2] }.
// A ring with ra = rb = 0 is a single pole vertex (a rounded or pointed end).
function sweep(rings, seg = 12, skinned = false) {
  const pos = [], colr = [], si = [], sw = [], idx = [], start = [];
  const cc = new THREE.Color();
  for (const r of rings) {
    start.push(pos.length / 3);
    const pole = r.ra < 1e-5 && r.rb < 1e-5;
    const n = pole ? 1 : seg;
    for (let j = 0; j < n; j++) {
      const ang = (j / seg) * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
      const k = r.mod ? r.mod(ang) : 1;
      pos.push(
        r.c[0] + (r.a[0] * ca * r.ra + r.b[0] * sa * r.rb) * k,
        r.c[1] + (r.a[1] * ca * r.ra + r.b[1] * sa * r.rb) * k,
        r.c[2] + (r.a[2] * ca * r.ra + r.b[2] * sa * r.rb) * k);
      cc.set(r.colf ? r.colf(ang) : r.col);
      colr.push(cc.r, cc.g, cc.b);
      if (skinned) { const w = r.w; si.push(0, 1, 2, 0); sw.push(w[0], w[1], w[2], 0); }
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    const ap = A.ra < 1e-5 && A.rb < 1e-5, bp = B.ra < 1e-5 && B.rb < 1e-5;
    if (ap && bp) continue;
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      const a0 = start[i] + (ap ? 0 : j), a1 = start[i] + (ap ? 0 : j1);
      const b0 = start[i + 1] + (bp ? 0 : j), b1 = start[i + 1] + (bp ? 0 : j1);
      if (!ap) idx.push(a0, b0, a1);
      if (!bp) idx.push(a1, b0, b1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  if (skinned) {
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  }
  g.setIndex(idx);
  // make the faces point outwards (cheap test on a middle triangle)
  const mid = Math.floor(rings.length / 2), R = rings[mid];
  const vi = start[mid], P = g.attributes.position;
  let flip = false;
  for (let t = 0; t < idx.length; t += 3) {
    if (idx[t] === vi || idx[t + 1] === vi) {
      const a = new THREE.Vector3().fromBufferAttribute(P, idx[t]), b = new THREE.Vector3().fromBufferAttribute(P, idx[t + 1]), c = new THREE.Vector3().fromBufferAttribute(P, idx[t + 2]);
      const n = b.sub(a).cross(c.sub(a));
      const out = a.set(P.getX(vi) - R.c[0], P.getY(vi) - R.c[1], P.getZ(vi) - R.c[2]);
      flip = n.dot(out) < 0;
      break;
    }
  }
  if (flip) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const merge = list => mergeGeometries(list, false);

// A capsule hanging down from y = 0 to y = -len, radius r0 at the top and r1 at the bottom. `split` = y below
// which the colour changes (a sock), or null. Rings are duplicated at the split for a hard edge.
function limb(len, r0, r1, colTop, colBot = colTop, split = null) {
  const R = (y, r, cl) => ({ c: [0, y, 0], a: X, b: Z, ra: r, rb: r * 0.95, col: cl });
  const pole = (y, cl) => ({ c: [0, y, 0], a: X, b: Z, ra: 0, rb: 0, col: cl });
  const N = 4, steps = 5;
  const rings = [pole(r0, colTop)];
  for (let k = 1; k <= N; k++) { const f = (k / N) * PI / 2; rings.push(R(r0 * Math.cos(f), r0 * Math.sin(f), colTop)); }
  const taper = s => r0 + (r1 - r0) * s;
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
    const f = (k / N) * PI / 2;
    rings.push(k === N ? pole(-len - r1, cb) : R(-len - r1 * Math.sin(f), r1 * Math.cos(f), cb));
  }
  return sweep(rings, 10);
}

// A puffy lock: n round puffs along a short curling line hanging down from (0,0,0), radius r0 to r1, one colour (or a
// list, one per puff). Sets userData.end = [y, z] and endAngle, so a chain of them hangs one off the other.
const PUFF = new THREE.SphereGeometry(1, 12, 9);
function puffGeo(color, { len, r0, r1, curl = 0.5, n = 3, squash = 0.86 }) {
  const parts = [];
  let y = 0, z = 0, th = 0;
  const ds = len / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const s = n > 1 ? i / (n - 1) : 0;
    if (i > 0) { th = curl * s; y -= Math.cos(th) * ds; z -= Math.sin(th) * ds; }
    const r = r0 + (r1 - r0) * s;
    const g = PUFF.clone();
    g.applyMatrix4(_m.compose(_p.set(0, y, z), _q.identity(), _s.set(r, r * squash, r)));
    parts.push(paint(g, Array.isArray(color) ? color[i % color.length] : color));
  }
  const g = merge(parts);
  g.userData = { end: [y - Math.cos(th) * ds * 0.25, z - Math.sin(th) * ds * 0.25], endAngle: th };
  return g;
}

// ------------------------------------------------------------------ smooth surfaces (signed distance fields)
// A shape is a list of ellipsoids [cx, cy, cz, rx, ry, rz, k]; each one after the first is blended in with a
// smooth minimum of width k. The mesh is a sphere whose vertices are pushed out along rays to the outermost surface.

function sdEll(x, y, z, e) {       // Inigo Quilez's ellipsoid distance (a good bound near the surface)
  const qx = (x - e[0]) / e[3], qy = (y - e[1]) / e[4], qz = (z - e[2]) / e[5];
  const ax = qx / e[3], ay = qy / e[4], az = qz / e[5];
  const k0 = Math.sqrt(qx * qx + qy * qy + qz * qz), k1 = Math.sqrt(ax * ax + ay * ay + az * az);   // (Math.hypot is slow)
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(e[3], e[4], e[5]);
}
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function sdf(S, x, y, z) {
  let d = sdEll(x, y, z, S[0]);
  for (let i = 1; i < S.length; i++) d = smin(d, sdEll(x, y, z, S[i]), S[i][6]);
  return d;
}
// Outermost surface point along the ray o + d t (0 < t < maxT), and its normal: the field's gradient, bent a
// little toward the direction from `ro` (radial) so a face shades like one soft ball instead of in bands.
const _sp = [0, 0, 0], _sn = [0, 0, 0];
function surf(S, o, dx, dy, dz, maxT, ro, radial) {
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
// shape descriptor: { S, o (ray origin inside), ro (radial origin), radial, stretch (ray spread), maxT }
function surfTo(sh, x, y, z, fromO = sh.o) {   // the surface under a point, looking from fromO
  let dx = x - fromO[0], dy = y - fromO[1], dz = z - fromO[2];
  const l = Math.hypot(dx, dy, dz) || 1;
  return surf(sh.S, fromO, dx / l, dy / l, dz / l, sh.maxT, sh.ro, sh.radial);
}
function sdfMesh(sh, color, wSeg, hSeg) {
  const g = new THREE.SphereGeometry(1, wSeg, hSeg);
  g.deleteAttribute('uv');
  const P = g.attributes.position, N = g.attributes.normal, n = P.count, st = sh.stretch;
  for (let i = 0; i < n; i++) {
    let dx = P.getX(i) * st[0], dy = P.getY(i) * st[1], dz = P.getZ(i) * st[2];
    const l = Math.hypot(dx, dy, dz);
    surf(sh.S, sh.o, dx / l, dy / l, dz / l, sh.maxT, sh.ro, sh.radial);
    P.setXYZ(i, _sp[0], _sp[1], _sp[2]); N.setXYZ(i, _sn[0], _sn[1], _sn[2]);
  }
  return paint(g, color);
}
// A flat mark laid on the surface: an ellipse (or a shape r(angle)) of half-size w x h around the surface point under
// `c`, rotated by `rot` in the tangent plane, lifted by `lift`. Same normals as the skin, so it shades identically.
function decal(sh, c, w, h, color, { rot = 0, lift = 0.0016, shape = null, seg = 18, fromO } = {}) {
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
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU, k = shape ? shape(a) : 1;
    const ca = Math.cos(a) * w * k, sa = Math.sin(a) * h * k, cr = Math.cos(rot), sr = Math.sin(rot);
    const u = ca * cr - sa * sr, v = ca * sr + sa * cr;
    put(p0[0] + R.x * u + U.x * v, p0[1] + R.y * u + U.y * v, p0[2] + R.z * u + U.z * v);
    idx.push(0, 1 + i, 1 + ((i + 1) % seg));
  }
  return finishDecal(pos, nor, idx, color, n0, p0);
}
// A painted line through points near the surface (the smile), `w` wide, thinner at the ends.
function stripe(sh, pts, w, color, { lift = 0.0018, fromO } = {}) {
  const S = pts.map(p => { surfTo(sh, p[0], p[1], p[2], fromO); return { p: new THREE.Vector3(..._sp), n: new THREE.Vector3(..._sn) }; });
  const pos = [], nor = [], idx = [], T = new THREE.Vector3(), side = new THREE.Vector3();
  S.forEach((s, i) => {
    T.subVectors(S[Math.min(S.length - 1, i + 1)].p, S[Math.max(0, i - 1)].p).normalize();
    side.crossVectors(s.n, T).normalize();
    const hw = w * 0.5 * (0.45 + 0.55 * Math.sin(PI * (0.08 + 0.84 * i / (S.length - 1))));
    for (const sg of [-1, 1]) {
      pos.push(s.p.x + side.x * hw * sg + s.n.x * lift, s.p.y + side.y * hw * sg + s.n.y * lift, s.p.z + side.z * hw * sg + s.n.z * lift);
      nor.push(s.n.x, s.n.y, s.n.z);
    }
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  return finishDecal(pos, nor, idx, color, [S[1].n.x, S[1].n.y, S[1].n.z], [S[1].p.x, S[1].p.y, S[1].p.z]);
}
function finishDecal(pos, nor, idx, color, n0, p0) {
  // wind the triangles to face along the normal
  const a = new THREE.Vector3(pos[idx[0] * 3], pos[idx[0] * 3 + 1], pos[idx[0] * 3 + 2]);
  const b = new THREE.Vector3(pos[idx[1] * 3], pos[idx[1] * 3 + 1], pos[idx[1] * 3 + 2]).sub(a);
  const c = new THREE.Vector3(pos[idx[2] * 3], pos[idx[2] * 3 + 1], pos[idx[2] * 3 + 2]).sub(a);
  if (b.cross(c).dot(new THREE.Vector3(...n0)) < 0) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  void p0;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return paint(g, color);
}
// Place something on the surface: position (sunk by `sink`) and a quaternion whose +z is the surface normal bent
// toward `lean` (a direction) and whose +y points up.
function mount(sh, c, sink = 0, lean = null, leanAmt = 0) {
  surfTo(sh, c[0], c[1], c[2]);
  const n = new THREE.Vector3(..._sn);
  if (lean) n.lerp(new THREE.Vector3(...lean).normalize(), leanAmt).normalize();
  const p = new THREE.Vector3(..._sp).addScaledVector(new THREE.Vector3(..._sn), -sink);
  const y = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
  const x = new THREE.Vector3().crossVectors(y, n);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n));
  return { p, q, n: new THREE.Vector3(..._sn) };
}

// ------------------------------------------------------------------ cutie marks (flat decals)

function markShape(kind) {
  const s = new THREE.Shape();
  switch (kind) {
    case 'moon': {
      const N = 14;
      for (let i = 0; i <= N; i++) { const t = (60 + (240 * i) / N) * PI / 180; (i ? s.lineTo : s.moveTo).call(s, Math.cos(t), Math.sin(t)); }
      for (let i = 1; i <= N; i++) { const t = (266.7 - (173.4 * i) / N) * PI / 180; s.lineTo(0.55 + 0.867 * Math.cos(t), 0.867 * Math.sin(t)); }
      break;
    }
    case 'heart':
      s.moveTo(0, -0.9);
      s.bezierCurveTo(-0.15, -0.75, -1.0, -0.2, -1.0, 0.3);
      s.bezierCurveTo(-1.0, 0.95, -0.3, 1.0, 0, 0.5);
      s.bezierCurveTo(0.3, 1.0, 1.0, 0.95, 1.0, 0.3);
      s.bezierCurveTo(1.0, -0.2, 0.15, -0.75, 0, -0.9);
      break;
    case 'bolt':
      [[0.2, 1], [-0.55, 0.0], [-0.1, 0.0], [-0.3, -1], [0.55, -0.15], [0.1, -0.15], [0.55, 1]].slice(0, 6).forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
      break;
    default: // star
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.42 : 1, a = -PI / 2 + (i * PI) / 5;
        (i ? s.lineTo : s.moveTo).call(s, Math.cos(a) * r, Math.sin(a) * r);
      }
  }
  return s;
}
const markCache = new Map();
function markGeo(kind) {
  let g = markCache.get(kind);
  if (g) return g;
  if (kind === 'clover') {
    const parts = [[-0.48, 0.0], [0.48, 0.0], [0, 0.5], [0, -0.5]].map(([x, y]) => new THREE.CircleGeometry(0.55, 14).translate(x, y, 0));
    parts.push(new THREE.PlaneGeometry(0.18, 0.9).translate(0.1, -0.85, 0));
    g = mergeGeometries(parts.map(p => (p.deleteAttribute('uv'), p.toNonIndexed())), false);
  } else g = new THREE.ShapeGeometry(markShape(kind), 8);
  markCache.set(kind, g);
  return g;
}

// ------------------------------------------------------------------ palette and markings

// (exported for the NPC Editor, which shows what a unicorn gets when a key is left to choose itself)
export const MARKS = ['star', 'heart', 'clover', 'bolt', 'moon'];
export function makePalette(o) {
  const coat = vivid(o.color || '#ff7fb6');
  const h = hashStr(o.color || coat);
  const C = hsl(coat);
  const variant = h % 4;
  const mane = (o.mane && o.mane.length ? o.mane : ['#ff4f6b', '#ffa424', '#ffe14a', '#5fd36a', '#4aa8ff', '#9a6bff']).map(c => vivid(c, 0.9, 0.62));
  const mark = o.mark || MARKS[Math.floor(((C.h + 0.08) % 1) * 5)];
  // socks: none / front / hind / all, blaze: a pale star on the forehead
  const socks = o.socks || ['front', 'none', 'all', 'hind'][variant];
  const blaze = o.blaze !== undefined ? o.blaze : (variant === 0 || variant === 3);
  // eyes: a rich blue or violet from the mane if there is one (bright, friendly), else the coat's opposite hue
  const eye = o.eye || (() => {
    const m = mane.map(hsl).find(c => c.h > 0.5 && c.h < 0.83 && c.s > 0.4);
    const c = new THREE.Color().setHSL(m ? m.h : (C.h + 0.5) % 1, 0.8, 0.42);
    return '#' + c.getHexString();
  })();
  const dark = C.l < 0.35;   // a dark coat (Midnight) gets light-on-dark face details
  const tail = o.tail && o.tail.length ? o.tail.map(c => vivid(c, 0.9, 0.62)) : null, horn = o.horn ? vivid(o.horn, 0.9) : null, hornLen = Number.isFinite(o.hornLen) && o.hornLen !== 1 ? o.hornLen : null;
  return {
    coat, mane, socks, blaze, mark, eye, ...(tail ? { tail } : {}), ...(horn ? { horn } : {}), ...(hornLen ? { hornLen } : {}),
    light: mix(coat, '#ffffff', 0.62),
    muzzle: mix(coat, '#f2e2e2', 0.42),
    sock: o.accent ? vivid(o.accent, 0.9, 0.3) : mix(coat, '#f4eef8', 0.45),
    blush: mix(coat, '#ff2f78', dark ? 0.6 : 0.55),
    nostril: dark ? mix(coat, '#ffffff', 0.35) : mix(darker(coat, 0.45), '#7a2048', 0.4),
    smile: dark ? mix(coat, '#ffffff', 0.55) : '#2a1830',
    hoof: dark ? '#e8c46a' : mix(darker(coat, 0.42), '#3a2048', 0.35),
    ear: mix(coat, '#ff4f8b', 0.55),
    ink: '#1e1426',
    mark1: mane.slice().sort((a, b) => hueGap(b, coat) - hueGap(a, coat))[0],
    key: [coat, mane.join(), o.accent || '', mark, socks, blaze, eye].join('|') + (tail ? '|t' + tail.join() : '') + (horn ? '|h' + horn : '') + (hornLen ? '|l' + hornLen : ''),   // (the extras only when set: the key seeds the hair's motion)
  };
}

// ------------------------------------------------------------------ builds and dimensions (metres, body space)

// Multipliers on the classic toy. len: barrel length, girth: barrel thickness, leg: leg length, legR: leg thickness,
// neck/neckR: neck length/thickness, head: head scale, headW: head width, scale: the whole animal.
const BUILDS = {
  classic: { len: 1, girth: 1, leg: 1, legR: 1, neck: 1, neckR: 1, head: 1, headW: 1, hoof: 1, hair: 1, horn: 1, scale: 1.1 },
  lean: { len: 1.04, girth: 0.9, leg: 1.22, legR: 0.86, neck: 1.25, neckR: 0.9, head: 0.94, headW: 0.94, hoof: 0.92, hair: 0.95, horn: 1.1, scale: 1.08, graze: 1.15 },
  chunky: { len: 0.94, girth: 1.14, leg: 0.88, legR: 1.15, neck: 0.85, neckR: 1.12, head: 1.05, headW: 1.06, hoof: 1.1, hair: 1.12, horn: 0.92, scale: 1.06 },
  foal: { len: 0.86, girth: 0.92, leg: 0.95, legR: 0.92, neck: 0.9, neckR: 0.92, head: 1.16, headW: 1.0, hoof: 0.95, hair: 0.9, horn: 0.6, scale: 0.8 },
};
const BUILD_ALIAS = { skinny: 'lean', slim: 'lean', thin: 'lean', tall: 'lean', chubby: 'chunky', round: 'chunky', stout: 'chunky', pony: 'chunky', baby: 'foal', small: 'foal' };
function buildName(b) {
  const s = typeof b === 'string' ? b.toLowerCase() : 'classic';
  return BUILDS[s] ? s : BUILD_ALIAS[s] || 'classic';
}

const HIPS0 = [                          // FL, FR, HL, HR: x, y, z of the hip joint in body space
  [0.165, -0.13, 0.24], [-0.165, -0.13, 0.24], [0.17, -0.11, -0.24], [-0.17, -0.11, -0.24],
];
const FRONT = [true, true, false, false];
const REST_Z0 = [0.25, 0.25, -0.26, -0.26];   // where hooves stand (z, in root space)
const NECK0 = [ // y, z, rx, ry (body space): short and thick
  [0.08, 0.2, 0.215, 0.225], [0.17, 0.25, 0.195, 0.205], [0.26, 0.29, 0.175, 0.185], [0.34, 0.33, 0.16, 0.168],
];
// the barrel: a round bean with a chest, a rump, shoulders and haunches blended in
const BODY0 = [
  [0, 0.0, 0.0, 0.3, 0.27, 0.38],
  [0, 0.01, 0.19, 0.29, 0.28, 0.23, 0.12],
  [0, 0.03, -0.19, 0.3, 0.28, 0.23, 0.12],
  [0.15, -0.03, -0.2, 0.17, 0.2, 0.19, 0.1], [-0.15, -0.03, -0.2, 0.17, 0.2, 0.19, 0.1],
  [0.15, -0.04, 0.19, 0.16, 0.19, 0.17, 0.1], [-0.15, -0.04, 0.19, 0.16, 0.19, 0.17, 0.1],
];
// the head (poll at the origin, faces +z): a big round cranium, round cheeks, a short soft muzzle in a lighter colour
const HEAD_S = [
  [0, 0.1, 0.07, 0.25, 0.235, 0.24],
  [0.095, -0.02, 0.13, 0.15, 0.135, 0.15, 0.08], [-0.095, -0.02, 0.13, 0.15, 0.135, 0.15, 0.08],
  [0, -0.055, 0.24, 0.165, 0.13, 0.15, 0.1],
];
const HEAD = { S: HEAD_S, o: [0, 0.03, 0.12], ro: [0, 0.03, 0.12], radial: 0.35, stretch: [0.27, 0.27, 0.3], maxT: 0.6 };
const MUZ_O = [0, -0.05, 0.22];       // features on the muzzle are projected from inside it
// is a head vertex on the muzzle (the front and underside of the nose)
const onMuzzle = (x, y, z) => z - 0.235 + Math.max(0, y + 0.02) * 0.9 - Math.abs(x) * 0.15 > 0;

const dimCache = new Map();
function dims(name) {
  let D = dimCache.get(name);
  if (D) return D;
  const B = BUILDS[name], g = B.girth, l = B.len;
  const L1 = 0.21 * B.leg, L2 = 0.2 * B.leg, FOOT_Y = 0.085 * B.hoof;
  const NECK = NECK0.map(([y, z, rx, ry], i) => {
    const f = i / (NECK0.length - 1), r = g + (B.neckR - g) * f;
    return [0.08 * g + (y - 0.08) * B.neck, 0.2 * l + (z - 0.2) * B.neck, rx * r, ry * r];
  });
  D = {
    name, B, L1, L2, FOOT_Y, graze: B.graze || 1,
    HIPS: HIPS0.map(([x, y, z]) => [x * g, y * g, z * l]),
    REST_Z: REST_Z0.map(z => z * l),
    HB: FOOT_Y + 0.13 * g + (L1 + L2) * 0.94,
    NECK,
    neckCurve: new THREE.CatmullRomCurve3(NECK.map(([y, z]) => new THREE.Vector3(0, y, z)), false, 'centripetal'),
    BODY: { S: BODY0.map(([x, y, z, rx, ry, rz, k]) => [x * g, y * g, z * l, rx * g, ry * g, rz * l, k * Math.min(g, l)]), o: [0, 0, 0], ro: [0, 0, 0], radial: 0.2, stretch: [0.32 * g, 0.3 * g, 0.44 * l], maxT: 0.8 * Math.max(g, l) },
    tail: [0, 0.13 * g, -0.4 * l],
    markX: 0.3 * g, markZ: -0.2 * l, markS: 0.085 * Math.min(1, g * 1.05),
  };
  dimCache.set(name, D);
  return D;
}

// a flat mark (markGeo's outline) laid on a skin: each vertex dropped onto the surface, lifted, with the skin's normals
function markOn(sh, kind, c, size, side, color) {
  const src = markGeo(kind), P = src.attributes.position, pos = [], nor = [], idx = [];
  for (let i = 0; i < P.count; i++) {
    const u = P.getX(i) * size * side, v = P.getY(i) * size;   // on the flank: u along the body (+z on the right side), v up
    surfTo(sh, c[0], c[1] + v, c[2] + u);
    pos.push(_sp[0] + _sn[0] * 0.006, _sp[1] + _sn[1] * 0.006, _sp[2] + _sn[2] * 0.006); nor.push(_sn[0], _sn[1], _sn[2]);
  }
  if (src.index) for (let i = 0; i < src.index.count; i++) idx.push(src.index.getX(i)); else for (let i = 0; i < P.count; i++) idx.push(i);
  surfTo(sh, c[0], c[1], c[2]);
  return finishDecal(pos, nor, idx, color, [..._sn], [..._sp]);
}

// ------------------------------------------------------------------ cached parts per palette and build

const cache = new Map();
function partsFor(P, D) {
  const key = P.key + '|' + D.name;
  let c = cache.get(key);
  if (c) return c;
  c = {};
  const B = D.B;

  // the barrel, with the mark on both flanks
  c.barrel = merge([sdfMesh(D.BODY, P.coat, 34, 24), ...[-1, 1].map(s => markOn(D.BODY, P.mark, [s * D.markX * 1.4, 0.03 * B.girth, D.markZ], D.markS, s, P.mark1))]);

  // neck (skinned on three bones), rings from the base to the poll
  {
    const NECK = D.NECK, curve = D.neckCurve;
    const rings = [];
    const n = 10;
    const rr = (t) => { const f = t * (NECK.length - 1), i = Math.min(NECK.length - 2, Math.floor(f)), u = f - i; return [NECK[i][2] + (NECK[i + 1][2] - NECK[i][2]) * u, NECK[i][3] + (NECK[i + 1][3] - NECK[i][3]) * u]; };
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = curve.getPointAt(t), T = curve.getTangentAt(t);
      const N = new THREE.Vector3(0, T.z, -T.y).normalize();       // crest direction (perpendicular to the neck)
      const [rx, ry] = rr(t);
      const a1 = smoothstep(0.05, 0.55, t), b1 = smoothstep(0.5, 0.95, t);
      rings.push({ c: [0, p.y, p.z], a: X, b: [0, N.y, N.z], ra: rx, rb: ry, col: P.coat, w: [1 - a1, a1 * (1 - b1), a1 * b1] });
    }
    const cap = rings[n];
    rings.push({ c: [0, cap.c[1] + 0.03, cap.c[2] + 0.02], a: X, b: Y, ra: 0, rb: 0, col: P.coat, w: [0, 0, 1] });
    c.neck = sweep(rings, 16, true);
  }

  // head: one smooth skin, coat above and a lighter muzzle, with painted details
  {
    const skin = sdfMesh(HEAD, P.coat, 40, 30);
    { const Pp = skin.attributes.position, Cc = skin.attributes.color, m = col(P.muzzle);
      for (let i = 0; i < Pp.count; i++) if (onMuzzle(Pp.getX(i), Pp.getY(i), Pp.getZ(i))) Cc.setXYZ(i, m.r, m.g, m.b); }
    const parts = [skin];
    for (const s of [-1, 1]) {
      // round rosy cheeks under the eyes, nostrils like little beans on the soft nose
      parts.push(decal(HEAD, [s * 0.17, -0.03, 0.25], 0.045, 0.032, P.blush, { rot: s * -0.3 }));
      parts.push(decal(HEAD, [s * 0.045, -0.035, 0.4], 0.013, 0.019, P.nostril, { rot: s * -0.45, fromO: MUZ_O, lift: 0.002 }));
    }
    // a wide, happy smile under the nose that curls up at the corners
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const u = -1 + (2 * i) / 14, x = u * 0.07;
      pts.push([x, -0.105 - 0.02 * (1 - u * u) + 0.014 * Math.pow(Math.abs(u), 6), 0.4 - 0.06 * u * u]);
    }
    parts.push(stripe(HEAD, pts, 0.013, P.smile, { fromO: MUZ_O, lift: 0.0025 }));
    if (P.blaze) parts.push(decal(HEAD, [0, 0.2, 0.3], 0.045, 0.045, P.light, { shape: a => 0.5 + 0.5 * Math.pow(Math.abs(Math.cos(2.5 * (a - PI / 2))), 2.5), seg: 40 }));
    c.head = merge(parts);
  }

  // lower jaw (pivots at the hinge, hidden inside the muzzle while the mouth is shut): chin, dark mouth, tongue
  c.jaw = merge([
    blob(P.muzzle, [0, -0.02, 0.09], [0.1, 0.055, 0.105]),
    blob('#6a1f3c', [0, 0.016, 0.1], [0.085, 0.024, 0.09]),
    blob('#ff6f96', [0, 0.024, 0.09], [0.055, 0.014, 0.065]),
  ]);

  // eye: a dark rim, a white oval, a big iris looking a little forward (+x), a pupil, a lighter lower iris and two glints;
  // lashes flick out at the outer corner (-x). Built facing +z.
  {
    const EW = 0.07, EH = 0.09, ED = 0.028;
    const parts = [
      blob(P.ink, [0.002, 0.002, -0.006], [EW * 1.16, EH * 1.12, ED * 0.9]),
      blob('#ffffff', [0, 0, 0], [EW, EH, ED]),
      blob(P.eye, [0.009, -0.007, 0.009], [0.052, 0.07, 0.022]),
      blob(mix(P.eye, '#ffffff', 0.5), [0.01, -0.042, 0.014], [0.032, 0.02, 0.017]),
      blob('#140c1c', [0.01, 0.0, 0.016], [0.03, 0.04, 0.017]),
      blob('#ffffff', [0.034, 0.03, 0.031], [0.019, 0.023, 0.009]),
      blob('#ffffff', [-0.006, -0.036, 0.03], [0.009, 0.009, 0.006]),
    ];
    for (let i = 0; i < 3; i++) {
      const a = PI * (0.66 + i * 0.11);
      const cone = new THREE.ConeGeometry(0.009, 0.042 - i * 0.007, 5);
      cone.translate(0, 0.019, 0);
      cone.rotateZ(a - PI / 2 + 0.4);
      cone.translate(Math.cos(a) * EW * 1.08, Math.sin(a) * EH * 1.06, -0.002);
      parts.push(paint(cone, P.ink));
    }
    c.eye = merge(parts);
    c.eyeAt = [-1, 1].map(s => mount(HEAD, [s * 0.115, 0.08, 0.3], 0.013, [s * 0.3, 0.05, 1], 0.45));
  }

  // ear: a short rounded leaf with a pink inside
  {
    const rings = [];
    for (let i = 0; i <= 6; i++) {
      const s = i / 6;
      const r = 0.06 * (1 - Math.pow(s, 1.8)) * (1 + 0.2 * Math.sin(PI * s)) + 0.003;
      rings.push(i === 6 ? { c: [0, 0.13, -0.005], a: X, b: Z, ra: 0, rb: 0, col: P.coat } : { c: [0, s * 0.12, s * s * -0.012], a: X, b: Z, ra: r, rb: r * 0.55, col: P.coat });
    }
    c.ear = merge([sweep(rings, 10), blob(P.ear, [0, 0.055, 0.018], [0.033, 0.048, 0.013])]);
    c.earAt = [-1, 1].map(s => { surfTo(HEAD, s * 0.15, 0.31, 0.0); return [..._sp]; });
  }

  // horn: a bold twisted cone, gold with cream ridges (or the look's horn colour), on a collar
  {
    const rings = [], n = 18, gold = P.horn || '#f2b81c', cream = P.horn ? mix(P.horn, '#f4f0e8', 0.55) : '#f6e7a8', hl = (P.hornLen ? P.hornLen : 1) * 0.3 * B.horn, hr = 0.074 * (0.7 + 0.3 * B.horn);
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const r = hr * Math.pow(1 - s, 0.8) + 0.002;
      const ph = s * 8;
      rings.push(i === n ? { c: [0, hl + 0.012, 0], a: X, b: Z, ra: 0, rb: 0, col: gold } : {
        c: [0, s * hl, 0], a: X, b: Z, ra: r, rb: r,
        mod: a => 1 + 0.2 * Math.cos(3 * a - ph) * Math.min(1, s * 6),
        colf: a => (Math.cos(3 * a - ph) > 0.2 ? cream : gold),
      });
    }
    c.horn = merge([sweep(rings, 15), blob(darker(gold, 0.82), [0, 0.0, 0], [hr * 1.18, 0.03, hr * 1.18])]);
    c.hornLen = hl;
    c.hornAt = mount(HEAD, [0, 0.36, 0.16], 0.012);
  }

  // hooves: a round sock-coloured ankle into a big round hoof with a flat sole
  const hf = B.hoof;
  for (const sock of [false, true]) {
    const cl = sock ? P.sock : P.coat;
    const rings = [
      { c: [0, 0.06 * hf, 0], a: X, b: Z, ra: 0, rb: 0, col: cl },
      { c: [0, 0.05 * hf, 0], a: X, b: Z, ra: 0.06 * hf, rb: 0.06 * hf, col: cl },
      { c: [0, 0.02 * hf, 0], a: X, b: Z, ra: 0.088 * hf, rb: 0.088 * hf, col: cl },
      { c: [0, -0.005 * hf, 0], a: X, b: Z, ra: 0.09 * hf, rb: 0.092 * hf, col: cl },
      { c: [0, -0.012 * hf, 0], a: X, b: Z, ra: 0.094 * hf, rb: 0.097 * hf, col: P.hoof },
      { c: [0, -0.05 * hf, 0.006], a: X, b: Z, ra: 0.104 * hf, rb: 0.11 * hf, col: P.hoof },
      { c: [0, -0.08 * hf, 0.008], a: X, b: Z, ra: 0.1 * hf, rb: 0.106 * hf, col: P.hoof },
      { c: [0, -0.085 * hf, 0.008], a: X, b: Z, ra: 0, rb: 0, col: P.hoof },
    ];
    c[sock ? 'footSock' : 'foot'] = sweep(rings, 14);
  }
  // lower and upper legs: thick capsules whose round ends hide the joints
  const lr = B.legR, ur = (B.legR + B.girth) / 2;
  for (const sock of [false, true]) {
    c[sock ? 'lowerSock' : 'lower'] = limb(D.L2 - 0.01, 0.085 * lr, 0.075 * lr, P.coat, sock ? P.sock : P.coat, sock ? -D.L2 * 0.35 : null);
  }
  c.upperFront = merge([limb(D.L1 - 0.01, 0.1 * ur, 0.085 * lr, P.coat), blob(P.coat, [0, -0.02, 0.0], [0.12 * ur, 0.13 * ur, 0.12 * ur])]);
  c.upperHind = merge([limb(D.L1 - 0.01, 0.105 * ur, 0.085 * lr, P.coat), blob(P.coat, [0, -0.03 * B.leg, -0.01], [0.13 * ur, 0.15 * B.leg, 0.135 * ur])]);

  cache.set(key, c);
  // the NPC Editor builds a new palette at every colour change: keep the last few (the lobby only ever has a handful)
  if (cache.size > 16) { const [k0, old] = cache.entries().next().value; cache.delete(k0); for (const g of Object.values(old)) if (g && g.isBufferGeometry) g.dispose(); }
  return c;
}

// a copy mirrored in x (positions and normals, winding flipped so it still faces out)
function mirrorX(src) {
  const g = src.clone(), P = g.attributes.position, N = g.attributes.normal;
  for (let i = 0; i < P.count; i++) { P.setX(i, -P.getX(i)); if (N) N.setX(i, -N.getX(i)); }
  const I = g.index;
  if (I) for (let t = 0; t < I.count; t += 3) { const s = I.getX(t + 1); I.setX(t + 1, I.getX(t + 2)); I.setX(t + 2, s); }
  return g;
}

let haloTex = null;
function halo() {
  if (haloTex || typeof document === 'undefined') return haloTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,244,190,0.95)'); gr.addColorStop(0.3, 'rgba(255,226,140,0.5)'); gr.addColorStop(1, 'rgba(255,220,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(cv);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  return haloTex;
}

// ------------------------------------------------------------------ poses

const POSES = ['graze', 'prance', 'look', 'talk', 'nuzzle', 'neigh', 'hop', 'sleep'];
const ALIAS = {
  graze: 'graze', sniff: 'graze', prance: 'prance', dance: 'prance', look: 'look', point: 'look', read: 'look', talk: 'talk',
  shrug: 'talk', nuzzle: 'nuzzle', whisper: 'nuzzle', pet: 'nuzzle', neigh: 'neigh', startle: 'neigh', bark: 'neigh',
  hop: 'hop', wag: 'hop', wave: 'hop', cheer: 'hop', laugh: 'hop', highfive: 'hop', jump: 'hop', bounce: 'hop',
  sleep: 'sleep', doze: 'sleep', lie: 'sleep', rest: 'sleep',
};
const I = { graze: 0, prance: 1, look: 2, talk: 3, nuzzle: 4, neigh: 5, hop: 6, sleep: 7 };

const _v = new THREE.Vector3(), _qi = new THREE.Quaternion(), _t3 = new THREE.Vector3();
const wrapPi = a => a - TAU * Math.floor((a + PI) / TAU);

export const UNICORN_BUILDS = Object.keys(BUILDS);

export class Unicorn {
  constructor({ species = 'unicorn', color = '#ff7fb6', accent = null, scale = 1, mane = null, mark = null, eye = null, socks = null, blaze, build = null, variety = null, tail: tailCols = null, horn: hornCol = null, hornLen = null } = {}) {
    void species;
    this.kind = 'unicorn';
    this.lookYaw = 0;
    const D = this.D = dims(buildName(build || variety));
    const B = D.B;
    this.build = D.name;
    const P = this.palette = makePalette({ color, accent, mane, mark, eye, socks, blaze, tail: tailCols, horn: hornCol, hornLen });
    const C = partsFor(P, D);
    const VC = toyMat();
    const seed = hashStr(P.key + D.name);
    this.rng = mulberry32(seed);

    this.root = new THREE.Group();
    this.root.userData.inkSolid = true;   // (rigid-merge.js: inked round its silhouette only, no crease lines inside the toy)
    this.sc = (+scale || 1) * B.scale;
    this.root.scale.setScalar(this.sc);
    const body = this.body = new THREE.Group();
    this.root.add(body);
    body.position.y = D.HB;

    const barrel = this.barrel = new THREE.Mesh(C.barrel, VC);
    body.add(barrel);

    // ---- neck: three bones, skinned tube
    const curve = D.neckCurve;
    const bones = this.bones = [new THREE.Bone(), new THREE.Bone(), new THREE.Bone()];
    const at = t => curve.getPointAt(t);
    const p0 = at(0), p1 = at(0.5), p2 = at(1);
    bones[0].position.copy(p0);
    bones[1].position.copy(p1).sub(p0);
    bones[2].position.copy(p2).sub(p1);
    for (const b of bones) b.rotation.order = 'YXZ';
    body.add(bones[0]); bones[0].add(bones[1]); bones[1].add(bones[2]);
    const neck = this.neck = new THREE.SkinnedMesh(C.neck, VC);
    neck.frustumCulled = false;
    body.add(neck);
    this.root.updateMatrixWorld(true);
    neck.bind(new THREE.Skeleton(bones));

    // ---- head
    const head = this.head = new THREE.Group();
    head.rotation.order = 'YXZ';
    head.scale.set(B.head * B.headW, B.head, B.head);
    bones[2].add(head);
    head.add(new THREE.Mesh(C.head, VC));
    const jaw = this.jaw = new THREE.Mesh(C.jaw, VC);
    jaw.position.set(0, -0.1, 0.15);
    head.add(jaw);

    this.eyes = [];
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1, A = C.eyeAt[i];
      const g = new THREE.Group();
      g.position.copy(A.p);
      g.quaternion.copy(A.q);
      const inner = new THREE.Group();          // the part that blinks (squashes toward the lower lid)
      const eye = new THREE.Mesh(C.eye, VC);
      // the mesh is built with "forward" on +x; on the right-hand eye forward is -x, so mirror it (a mirrored copy of the
      // geometry, not a negative scale: rigid-merge.js would draw a negative scale inside out)
      eye.geometry = s > 0 ? (C.eyeR || (C.eyeR = mirrorX(C.eye))) : C.eye;
      inner.add(eye);
      g.add(inner);
      head.add(g);
      this.eyes.push(inner);
    }
    this.ears = [];
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      const g = new THREE.Group();
      const ep = C.earAt[i];
      g.position.set(ep[0] - s * 0.01, ep[1] - 0.025, ep[2]);
      g.rotation.set(-0.05, 0, -s * 0.34, 'YXZ');
      g.add(new THREE.Mesh(C.ear, VC));
      head.add(g);
      this.ears.push({ g, s });
    }
    const horn = this.horn = new THREE.Group();
    horn.position.copy(C.hornAt.p);
    horn.rotation.x = 0.3;
    horn.add(new THREE.Mesh(C.horn, VC));
    head.add(horn);
    const ht = halo();
    if (ht) {
      const sp = this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: ht, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true }));
      sp.position.set(0, C.hornLen, 0);
      sp.scale.setScalar(0.42);
      horn.add(soft(sp));
    }

    // ---- hair: puffy mane on the neck bones, a forelock tuft on the head, a cloud of a tail on the rump (spring chains)
    this.hair = [];       // { pivots[], base[], a[], va[], b[], vb[], drive, k, c, ph, wind }
    const M = P.mane, hs = B.hair;
    const mk = (parent, color, segs, pos, rot, drive, opts = {}) => {
      const lock = { pivots: [], base: [], a: [], va: [], b: [], vb: [], drive, k: opts.k || 70, c: opts.c || 7.5, ph: this.rng() * TAU, wind: opts.wind ?? 1, stream: opts.stream ?? 0, grav: opts.grav ?? 0.7 };
      let par = parent, endY = 0, endZ = 0, endA = 0;
      segs.forEach((sg, i) => {
        const g = puffGeo(sg.col || color, sg);
        const piv = new THREE.Group();
        piv.rotation.order = 'YXZ';
        if (i === 0) { piv.position.set(pos[0], pos[1], pos[2]); piv.rotation.set(rot[0], rot[1], rot[2]); lock.base.push([rot[0], rot[1], rot[2]]); }
        else { piv.position.set(0, endY, endZ); piv.rotation.set(endA * 0.5, 0, 0); lock.base.push([endA * 0.5, 0, 0]); }
        piv.add(new THREE.Mesh(g, VC));
        par.add(piv);
        par = piv;
        endY = g.userData.end[0]; endZ = g.userData.end[1]; endA = g.userData.endAngle;
        lock.pivots.push(piv); lock.a.push(0); lock.va.push(0); lock.b.push(0); lock.vb.push(0);
      });
      this.hair.push(lock);
      return lock;
    };
    // mane: big puffs along the crest, alternating a little side to side, each hanging a second, smaller puff
    const NECK = D.NECK;
    const CR = [0.0, 0.2, 0.4, 0.6, 0.8, 0.97];
    CR.forEach((t0, j) => {
      const s = j % 2 ? 1 : -1;
      const t = clamp(t0, 0, 0.98);
      const p = curve.getPointAt(t), T = curve.getTangentAt(t);
      const N = _v.set(0, T.z, -T.y).normalize();
      const idx = NECK.length - 1, f = t * idx, ii = Math.min(idx - 1, Math.floor(f)), u = f - ii;
      const ry = NECK[ii][3] + (NECK[ii + 1][3] - NECK[ii][3]) * u;
      const bi = t < 0.3 ? 0 : t < 0.72 ? 1 : 2;
      const bp = bi === 0 ? p0 : bi === 1 ? p1 : p2;
      const size = (1.05 - 0.05 * Math.abs(j - 2)) * hs, c1 = M[j % M.length], c2 = M[(j + 1) % M.length];
      mk(bones[bi], c1,
        [{ len: 0.1 * size, r0: 0.13 * size, r1: 0.11 * size, n: 2, curl: 0.3 }, { len: 0.1 * size, r0: 0.1 * size, r1: 0.07 * size, n: 2, curl: 0.5, col: c2 }],
        [p.x - bp.x + s * 0.07, p.y - bp.y + N.y * (ry * 1.0), p.z - bp.z + N.z * (ry * 1.0)],
        [0.5, 0, s * 0.75], Math.min(bi, 1) + 1, { k: 60, c: 7, grav: 0.92 });
    });
    // down the back of the head, behind the ears, into the mane
    [[-0.08, 0.25, -0.1, 2], [0.08, 0.25, -0.1, 3], [0, 0.16, -0.17, 4]].forEach(([x, y, z, j]) => {
      surfTo(HEAD, x, y, z);
      mk(head, M[j % M.length], [{ len: 0.09 * hs, r0: 0.12 * hs, r1: 0.1 * hs, n: 2, curl: 0.4 }],
        [_sp[0], _sp[1], _sp[2]], [0.9, 0, Math.sign(x) * 0.5], 3, { k: 70, c: 8, wind: 0.8, grav: 0.6 });
    });
    // forelock: a round tuft between the ears, puffs falling forward to both sides of the horn
    [[-0.075, 0, 0.5], [0.075, 1, -0.5], [0, 2, 0]].forEach(([x, j, rz]) => {
      surfTo(HEAD, x, 0.36, 0.06);
      mk(head, M[(j + 1) % M.length], [{ len: 0.08 * hs, r0: 0.085 * hs, r1: 0.065 * hs, n: 2, curl: 1.2 }],
        [_sp[0] + _sn[0] * 0.02, _sp[1] + _sn[1] * 0.02 - 0.02, _sp[2] + _sn[2] * 0.02 - (j === 2 ? 0.06 : 0)], [-2.0, 0, rz], 3, { k: 90, c: 9, wind: 0.6, grav: 0.5 });
    });
    // tail: three puffy plumes, each a chain of puffs from big to small
    const tail = this.tail = new THREE.Group();
    tail.position.set(...D.tail);
    tail.rotation.order = 'YXZ';
    body.add(tail);
    const TL = [-0.5, 0, 0.5], tl = hs * (0.9 + 0.1 * B.len), TM = P.tail || M;
    TL.forEach((rz, j) => {
      const c0 = TM[(j + 1) % TM.length], c1 = TM[(j + 2) % TM.length], c2 = TM[(j + 3) % TM.length];
      mk(tail, c0,
        [{ len: 0.13 * tl, r0: 0.13 * hs, r1: 0.12 * hs, n: 2, curl: 0.3 }, { len: 0.13 * tl, r0: 0.115 * hs, r1: 0.1 * hs, n: 2, curl: 0.4, col: c1 }, { len: 0.12 * tl, r0: 0.09 * hs, r1: 0.06 * hs, n: 2, curl: 0.6, col: c2 }],
        [rz * 0.06, 0, 0], [0.0, 0, rz * 0.6], 0, { k: 50, c: 6, stream: 1, grav: 0.2 });
    });

    // ---- legs: hip group on the body, upper -> lower -> foot
    this.legs = [];
    for (let i = 0; i < 4; i++) {
      const [hx, hy, hz] = D.HIPS[i];
      const front = FRONT[i];
      const sock = (P.socks === 'all') || (P.socks === 'front' && front) || (P.socks === 'hind' && !front);
      const hip = new THREE.Group();
      hip.position.set(hx, hy, hz);
      const upper = new THREE.Group();
      upper.add(new THREE.Mesh(front ? C.upperFront : C.upperHind, VC));
      const lower = new THREE.Group();
      lower.position.y = -D.L1;
      lower.add(new THREE.Mesh(sock ? C.lowerSock : C.lower, VC));
      const foot = new THREE.Group();
      foot.position.y = -D.L2;
      foot.add(new THREE.Mesh(sock ? C.footSock : C.foot, VC));
      lower.add(foot); upper.add(lower); hip.add(upper); body.add(hip);
      this.legs.push({ hip, upper, lower, foot, front, x: hx, hy, hz, restZ: D.REST_Z[i], lift: 0, fx: 0, extraLift: 0, extraFwd: 0, footY: D.FOOT_Y, dz: 0 });
    }

    const tag = new THREE.Object3D();
    tag.position.y = D.HB + D.NECK[D.NECK.length - 1][0] + 0.5 * B.head;
    this.root.add(tag); this.root.userData.tagAnchor = tag;

    shadows(this.root, true, false);

    // ---- state
    this.t = 0;
    this.w = new Float32Array(POSES.length);   // pose weights
    this.pt = 0;                                 // time in the current pose
    this.pose = -1;
    this.sp = 0;                                 // smoothed ground speed
    this.wm = 0;                                 // gait weight
    this.wTurn = 0;
    this.phase = this.rng();
    this.prevYaw = null; this.yawRate = 0; this.yawAcc = 0;
    this.by = D.HB;
    // idle life
    this.nextBlink = 1 + this.rng() * 3; this.blinkT = -1;
    this.earT = [0.5 + this.rng() * 3, 1.5 + this.rng() * 3]; this.earF = [0, 0];
    this.nextGlance = 1 + this.rng() * 2; this.gy = 0; this.gp = 0; this.gyT = 0; this.gpT = 0;
    this.nextSwish = 2 + this.rng() * 3; this.swish = 0;
    this.rest = { leg: -1, until: 0, next: 5 + this.rng() * 5, amt: 0 };
    this.stamp = { leg: -1, t: 0, n: 0, next: 12 + this.rng() * 10 };
    this.shiftX = 0;
  }

  update(dt, t, speed = 0, anim = null) {
    dt = Math.min(dt, 0.05);
    if (!(dt > 0)) return;
    speed = (+speed || 0) / this.sc;   // a NaN here would poison the smoothed gait state for good; a small foal takes more steps
    this.t += dt;
    const T = this.t, rng = this.rng, D = this.D, L1 = D.L1, L2 = D.L2;
    const k = (rate) => 1 - Math.exp(-dt * rate);
    const root = this.root, body = this.body, bones = this.bones, head = this.head;

    // -- yaw rate (for leaning, head lead, stepping in place when turning)
    const yaw = root.rotation.y;
    if (this.prevYaw === null) this.prevYaw = yaw;
    const dyaw = wrapPi(yaw - this.prevYaw);
    this.prevYaw = yaw; this.yawAcc += dyaw;
    this.yawRate += (dyaw / dt - this.yawRate) * k(6);
    const yr = clamp(this.yawRate, -4, 4);

    // -- which pose
    const moving = speed > 0.15;
    const name = typeof anim === 'string' && Object.hasOwn(ALIAS, anim) ? ALIAS[anim] : null;
    const want = !moving && name ? POSES.indexOf(name) : -1;
    if (want !== this.pose) { this.pose = want; this.pt = 0; }
    this.pt += dt;
    const w = this.w;
    let sum = 0;
    for (let i = 0; i < w.length; i++) { w[i] += ((i === want ? 1 : 0) - w[i]) * k(7); sum += w[i]; }
    const wG = w[I.graze], wPr = w[I.prance], wL = w[I.look], wT = w[I.talk], wN = w[I.nuzzle], wE = w[I.neigh], wH = w[I.hop], wS = w[I.sleep];
    const pt = this.pt;

    // -- gait
    this.sp += (speed - this.sp) * k(10);
    const turning = Math.abs(yr) > 0.7 && !moving;
    this.wTurn += ((turning ? 1 : 0) - this.wTurn) * k(8);
    const veff = Math.max(this.sp, Math.abs(yr) * 0.42 * this.wTurn);
    const wgTarget = moving || turning ? 1 : 0;
    this.wm += (wgTarget - this.wm) * k(9);
    const wg = Math.max(this.wm, wPr);
    const trot = Math.max(smoothstep(1.9, 3.0, this.sp), wPr);
    const legK = 1 / Math.sqrt(D.B.leg);         // longer legs step a little slower (and farther)
    let f = clamp(1.0 + 0.32 * veff * legK, 1.05, 2.6);
    f += (2.05 - f) * wPr;
    const duty = 0.66 + (0.5 - 0.66) * trot;
    const sweepD = Math.min(0.9 * D.B.leg, veff * duty / f);
    if (wg > 0.01) this.phase = (this.phase + dt * f) % 1;
    const ph = this.phase;
    const hOff = -0.25 + (-0.5 + 0.25) * trot;
    const offs = [0, 0.5, hOff + 0, 0.5 + hOff];
    const liftH = (0.06 + 0.05 * trot + 0.11 * wPr) * D.B.leg;

    // -- idle events
    const wI = clamp(1 - sum - this.wm, 0, 1);
    this.idleEvents(dt, T, wI, rng);

    // -- neck, head
    const bobW = this.wm * (1 - wPr);
    const pw = 2 * PI * ph;
    let nB = 0.012 * Math.sin(T * 1.6) * wI + (0.05 * Math.sin(pw + 0.6) + 0.02 - 0.06 * trot) * bobW;
    let nM = -0.03 * Math.sin(T * 1.6) * wI + (0.04 * Math.sin(pw + 1.2)) * bobW;
    let hP = -0.16 + (-0.03 * bobW) + this.gp * wI * 0.6;
    let hY = this.gy * wI + this.lookYaw;
    let hR = 0;
    let mouth = 0, earsBack = 0, alert = 0, shut = 0;
    let bPitchPose = 0, bLift = 0;
    let xlF = 0;                        // extra lift for the front feet (rearing, hopping)
    let tailUp = 0;

    // graze: neck arcs down, head bobs while it chews (long legs need a deeper bend to reach the grass)
    if (wG > 0.001) {
      const chew = Math.sin(T * 8.5), bob = Math.sin(T * 1.7), reach = D.graze || 1;
      nB += wG * (1.15 * reach + 0.05 * bob); nM += wG * (0.28 + 0.04 * bob); hP += wG * (0.1 + 0.05 * chew * 0.3);
      mouth += wG * (0.1 + 0.09 * chew);
      bPitchPose += wG * 0.09 * reach * reach; earsBack += wG * 0.15;
      hY += wG * 0.08 * Math.sin(T * 0.6);
    }
    // prance: head high, proud, tail up, bouncy
    if (wPr > 0.001) {
      nB += wPr * (-0.1 + 0.05 * Math.sin(pw * 2)); nM += wPr * (-0.06);
      hP += wPr * (0.06 + 0.05 * Math.sin(pw * 2 + 0.8));
      bLift += wPr * 0.03; tailUp += wPr * 1.0; alert += wPr * 0.6; mouth += wPr * 0.06;
      hY += wPr * 0.2 * Math.sin(pw);
    }
    // look: a slow, curious sweep
    if (wL > 0.001) {
      hY += wL * (0.75 * Math.sin(pt * 0.9 + 0.3));
      nB += wL * (-0.03); hP += wL * 0.02 * Math.sin(pt * 1.7);
      alert += wL * 0.8;
      hR += wL * 0.06 * Math.sin(pt * 0.9 + 0.3);
    }
    // talk: nods and a wagging jaw
    if (wT > 0.001) {
      const burst = smoothstep(0.2, 0.6, Math.sin(T * 2.3) * 0.5 + 0.5);
      hP += wT * (0.05 + 0.1 * Math.sin(T * 6.3) * burst);
      hY += wT * 0.22 * Math.sin(T * 1.3);
      hR += wT * 0.05 * Math.sin(T * 2.1);
      mouth += wT * burst * (0.1 + 0.16 * Math.abs(Math.sin(T * 8.4)));
      nB += wT * 0.03 * Math.sin(T * 3.1); alert += wT * 0.4;
      bLift += wT * 0.006 * Math.abs(Math.sin(T * 6.3)) * burst;
    }
    // nuzzle: neck curls, head dips and tilts, eyes squeezed happy
    if (wN > 0.001) {
      const s = Math.sin(pt * 2.3);
      nB += wN * (0.36 + 0.06 * s); nM += wN * (0.36 + 0.05 * s); hP += wN * (0.28 + 0.06 * s);
      hY += wN * 0.3 * Math.sin(pt * 1.1);
      hR += wN * 0.16 * Math.sin(pt * 2.3 + 1);
      shut += wN * 0.85; earsBack += wN * 0.3;
      bPitchPose += wN * 0.02;
    }
    // neigh: head thrown back, mouth open, front hooves off the ground
    if (wE > 0.001) {
      const c = (pt % 2.6) / 2.6;
      const env = smoothstep(0, 0.1, c) * (1 - smoothstep(0.36, 0.5, c));
      const shake = Math.sin(T * 38) * 0.012 * env;
      nB += wE * (-0.42 * env); nM += wE * (-0.25 * env); hP += wE * (-0.6 * env + shake);
      mouth += wE * 0.62 * env; earsBack += wE * 0.55 * env; shut += wE * 0.5 * env;
      bPitchPose += wE * -0.2 * env; xlF += wE * 0.17 * env; tailUp += wE * 0.9 * env;
    }
    // hop: a happy little jump, all four feet off the ground
    let hopLift = 0;
    if (wH > 0.001) {
      const c = (pt * 2.2) % 1;
      const air = Math.sin(PI * clamp(c / 0.6, 0, 1)) * (c < 0.6 ? 1 : 0);
      hopLift = wH * air * 0.16;
      bPitchPose += wH * (-0.12 * air);
      nB += wH * -0.08 * air; hP += wH * 0.1 * air;
      mouth += wH * 0.14; alert += wH * 0.7; tailUp += wH * 0.7 * air;
      earsBack += wH * -0.1;
    }

    // sleep: dozing on its feet (the night schedule in npcs-day.js): head low, eyes shut, ears drooping, slow deep breaths
    if (wS > 0.001) {
      const br = Math.sin(T * 0.9);
      nB += wS * (0.42 + 0.03 * br); nM += wS * (0.18 + 0.02 * br); hP += wS * (0.22 + 0.02 * br);
      shut += wS * 1.0; earsBack += wS * 0.45;
      hY += wS * 0.12 * Math.sin(T * 0.23);
      bPitchPose += wS * 0.03;
    }

    // blink, ears
    const blinkK = this.blinkT >= 0 ? Math.sin(clamp(this.blinkT / 0.16, 0, 1) * PI) : 0;
    const eyeShut = clamp(Math.max(shut, blinkK), 0, 1);
    for (let i = 0; i < 2; i++) { const e = this.eyes[i]; e.scale.y = 1 - 0.9 * eyeShut; e.position.y = -0.05 * eyeShut; }

    // turning: the head leads, the body leans into the curve
    hY += clamp(yr * 0.22, -0.3, 0.3) * (this.wm > 0.05 ? 1 : 0.4);
    const lean = clamp(-yr * (0.05 + 0.03 * this.sp), -0.16, 0.16);

    // apply neck and head
    const nY = hY * 0.35;
    bones[0].rotation.set(nB, nY * 0.6, hR * 0.2);
    bones[1].rotation.set(nM, nY * 0.5, hR * 0.3);
    head.rotation.set(hP, hY - nY * 1.1, hR * 0.6);
    this.jaw.rotation.x = clamp(mouth, 0, 0.75);
    for (let i = 0; i < 2; i++) {
      const { g: e, s } = this.ears[i];
      const fl = this.earF[i];
      e.rotation.x = -0.05 + alert * 0.16 - earsBack * 0.55 + Math.sin(fl * 20) * fl * 0.25;
      e.rotation.z = -s * (0.34 + earsBack * 0.35 - alert * 0.1) + Math.sin(fl * 26 + 1) * fl * 0.3 * s;
    }

    // -- body motion
    const wobble = Math.sin(pw);
    const roll = (0.03 * wobble * bobW + lean + 0.012 * Math.sin(T * 0.45) * wI) * 1;
    const pitchGait = (0.012 * Math.sin(pw * 2 + 0.4) + 0.02 * trot) * bobW;
    const breathe = Math.sin(T * 1.9);
    const bodyPitch = bPitchPose + pitchGait;
    body.rotation.set(bodyPitch, 0.04 * Math.sin(pw + 0.5) * bobW, roll, 'YXZ');
    this.barrel.scale.set(1 + 0.008 * breathe, 1 + 0.014 * breathe, 1);
    const rest = this.rest;
    this.shiftX += ((rest.amt * (rest.leg === 2 ? -1 : 1) * 0.025) - this.shiftX) * k(3);

    // -- feet targets
    const legs = this.legs;
    const wgs = wg;
    const pulse = wPr;
    let maxBody = 10;
    const cosP = Math.cos(bodyPitch), sinP = Math.sin(bodyPitch);
    for (let i = 0; i < 4; i++) {
      const L = legs[i];
      const u = (ph + offs[i] + 8) % 1;
      let zoff, lift = 0, swingS = 0;
      if (u < duty) {
        zoff = 0.5 * sweepD - sweepD * (u / duty);
      } else {
        const s = (u - duty) / (1 - duty);
        swingS = s;
        const e = s * s * (3 - 2 * s);
        zoff = -0.5 * sweepD + sweepD * e;
        lift = liftH * Math.sin(PI * Math.pow(s, 0.85));
        if (L.front && pulse > 0) zoff += 0.07 * pulse * Math.sin(PI * s);
      }
      zoff *= wgs; lift *= wgs;
      L.swingS = swingS * wgs;
      // extras: rearing, hopping, resting hoof, stamping
      let xl = hopLift, xf = 0;
      if (L.front) xl += xlF;
      if (rest.leg === i) { xl += 0.045 * rest.amt; xf += -0.12 * rest.amt; }
      if (this.stamp.leg === i) { const st = this.stamp.t; xl += 0.13 * Math.max(0, Math.sin(st * 13)) * (st < 0.5 ? 1 : 0); xf += 0.04; }
      L.extraLift += (xl - L.extraLift) * k(24);
      L.extraFwd += (xf - L.extraFwd) * k(10);
      L.footY = D.FOOT_Y + (L.front ? -0.005 : 0.007) + lift + L.extraLift;
      L.fz = L.restZ + zoff + L.extraFwd;
      L.dz = L.fz - L.hz;
      // how high can the body be before this leg overstretches?
      const reach = (L1 + L2) * 0.985;
      const cap = L.footY + Math.sqrt(Math.max(0.01, reach * reach - L.dz * L.dz)) - (L.hy * cosP - L.hz * sinP);
      if (cap < maxBody) maxBody = cap;
    }
    // body height: wanted height, but never so high that a planted hoof is dragged off the ground
    const trotBounce = (Math.abs(Math.sin(pw * 2 + 0.3)) * 0.02) * trot * bobW + 0.014 * wPr * Math.abs(Math.sin(pw * 2));
    const wantY = D.HB + bLift + trotBounce + hopLift * 0.9 - 0.32 * Math.sin(bPitchPose) + wG * -0.01 + 0.006 * breathe * wI;
    const target = Math.min(wantY, maxBody);
    this.by += (target - this.by) * k(target < this.by ? 60 : 30);
    body.position.set(this.shiftX + 0.012 * Math.sin(pw + 0.3) * bobW, this.by, 0);

    // -- IK for the legs (in body space)
    _qi.copy(body.quaternion).invert();
    for (let i = 0; i < 4; i++) {
      const L = legs[i];
      _t3.set(L.x, L.footY, L.fz).sub(body.position).applyQuaternion(_qi);
      const dx = _t3.x - L.x;
      const psi = Math.atan2(dx, -(_t3.y - L.hy));               // splay sideways so the hoof reaches its spot
      let dz = _t3.z - L.hz, dy = -Math.hypot(dx, _t3.y - L.hy);
      let dist = Math.hypot(dz, dy);
      const maxR = (L1 + L2) * 0.999;
      if (dist > maxR) { dz *= maxR / dist; dy *= maxR / dist; dist = maxR; }
      const phi = Math.atan2(dz, -dy);
      const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
      const alpha = Math.acos(cosA);
      const phi1 = L.front ? phi + alpha : phi - alpha;
      const kz = L.hz + Math.sin(phi1) * L1, ky = L.hy - Math.cos(phi1) * L1;
      const fz = L.hz + dz, fy = L.hy + dy;
      const phi2 = Math.atan2(fz - kz, -(fy - ky));
      const flat = bodyPitch;                                   // hoof flat on the ground in body space
      const toeDown = L.swingS > 0 ? Math.sin(PI * L.swingS) : 0;
      const phi3 = flat + (phi2 - flat) * clamp(0.75 * toeDown + (L.extraLift > 0.02 ? 0.5 : 0), 0, 0.95);
      L.hip.rotation.z = psi; L.foot.rotation.z = -psi;
      L.upper.rotation.x = -phi1;
      L.lower.rotation.x = -(phi2 - phi1);
      L.foot.rotation.x = -(phi3 - phi2);
    }

    // -- hair and tail follow-through
    this.animateHair(dt, T, body, bones, head, this.wm, tailUp, trot, wPr + wH);

    // horn glow breathes
    if (this.glow) {
      const g = (0.5 + 0.06 * Math.sin(T * 2.3) + 0.03 * Math.sin(T * 5.1)) * (0.6 + 0.4 * D.B.horn);
      this.glow.scale.setScalar(g);
      this.glow.material.opacity = (0.75 + 0.2 * Math.sin(T * 1.7)) * (1 - 0.75 * wG) * (1 + 0.35 * wS) * (0.08 + 0.92 * nightNow(T));   // no blob in the grass while grazing; brighter asleep
    }
  }

  idleEvents(dt, T, wI, rng) {
    // blinks
    if (this.blinkT >= 0) { this.blinkT += dt; if (this.blinkT > 0.16) { this.blinkT = -1; if (rng() < 0.2) this.nextBlink = T + 0.15; } }
    if (this.blinkT < 0 && T > this.nextBlink) { this.blinkT = 0; this.nextBlink = T + 2 + rng() * 4; }
    // ear flicks
    for (let i = 0; i < 2; i++) {
      if (this.earF[i] > 0) this.earF[i] = Math.max(0, this.earF[i] - dt * 2.6);
      if (T > this.earT[i]) { this.earF[i] = 1; this.earT[i] = T + 1.5 + rng() * 5; }
    }
    // glances
    if (T > this.nextGlance) { this.gyT = (rng() - 0.5) * 1.1; this.gpT = (rng() - 0.5) * 0.3; this.nextGlance = T + 1.5 + rng() * 3.5; }
    const kk = 1 - Math.exp(-dt * 3.2);
    this.gy += (this.gyT - this.gy) * kk; this.gp += (this.gpT - this.gp) * kk;
    // tail swish
    if (T > this.nextSwish) { this.swish = 1; this.nextSwish = T + 2 + rng() * 5; }
    if (this.swish > 0) this.swish = Math.max(0, this.swish - dt * 0.9);
    // rest a hind hoof, now and then (only while standing about)
    const r = this.rest;
    if (r.leg < 0) {
      r.amt += (0 - r.amt) * (1 - Math.exp(-dt * 8));
      if (T > r.next && wI > 0.95 && this.wm < 0.05) { r.leg = 2 + (rng() < 0.5 ? 0 : 1); r.until = T + 3.5 + rng() * 4; }
    } else {
      const on = T < r.until && wI > 0.6 && this.wm < 0.1;
      r.amt += ((on ? 1 : 0) - r.amt) * (1 - Math.exp(-dt * (on ? 4 : 6)));
      if (!on && r.amt < 0.02) { r.leg = -1; r.amt = 0; r.next = T + 6 + rng() * 9; }
    }
    // stamp a front hoof a couple of times
    const s = this.stamp;
    if (s.leg < 0) {
      if (T > s.next && wI > 0.95 && this.wm < 0.05) { s.leg = rng() < 0.5 ? 0 : 1; s.t = 0; }
    } else {
      s.t += dt;
      if (s.t > 0.55) { s.leg = -1; s.next = T + 10 + rng() * 14; }
    }
  }

  animateHair(dt, T, body, bones, head, wmv, tailUp, trot, lively) {
    const bp = body.rotation.x, by = this.yawAcc;
    const n0 = bones[0].rotation, n1 = bones[1].rotation, hd = head.rotation;
    // drives: 0 tail (body only), 1 lower neck, 2 upper neck, 3 head
    const P0 = bp, P1 = bp + n0.x, P2 = P1 + n1.x, P3 = P2 + hd.x;
    const Y0 = by, Y1 = by + n0.y, Y2 = Y1 + n1.y, Y3 = Y2 + hd.y;
    // tail carriage
    this.tail.rotation.set(0.42 + tailUp * 0.55 + trot * 0.5 * wmv + 0.05 * Math.sin(T * 1.3), 0.05 * Math.sin(T * 0.8) + this.swish * 0.5 * Math.sin(T * 7.5), 0, 'YXZ');
    const dt2 = Math.min(dt, 1 / 40), steps = Math.max(1, Math.round(dt / dt2));
    const h = dt / steps;
    const gust = 1 + 1.2 * wmv + 1.2 * lively;
    for (const lock of this.hair) {
      const dv = lock.drive;
      let Pd = dv === 0 ? P0 : dv === 1 ? P1 : dv === 2 ? P2 : P3;
      let Yd = dv === 0 ? Y0 : dv === 1 ? Y1 : dv === 2 ? Y2 : Y3;
      // the tail and forelock move as part of the body chain
      if (lock.drive === 0) { Pd += this.tail.rotation.x - 0.42; Yd += this.tail.rotation.y; }
      const n = lock.pivots.length;
      for (let s = 0; s < steps; s++) {
        let pp = Pd, py = Yd;
        for (let i = 0; i < n; i++) {
          const wind = lock.wind * 0.07 * gust;
          const tp = pp * (1 - lock.grav) + wind * Math.sin(T * 2.1 + lock.ph + i * 0.9);   // gravity: hair hangs, it does not follow the neck all the way
          const ty = py + wind * 1.3 * Math.sin(T * 1.6 + lock.ph * 1.7 + i * 0.7);
          let a = lock.a[i], va = lock.va[i], b = lock.b[i], vb = lock.vb[i];
          const kk = lock.k * (1 - i * 0.12), cc = lock.c * (1 - i * 0.08);
          va += (kk * (tp - a) - cc * va) * h; a += va * h;
          vb += (kk * (ty - b) - cc * vb) * h; b += vb * h;
          lock.a[i] = a; lock.va[i] = va; lock.b[i] = b; lock.vb[i] = vb;
          pp = a; py = b;
        }
      }
      let pp = Pd, py = Yd;
      for (let i = 0; i < n; i++) {
        const base = lock.base[i];
        const a = lock.a[i], b = lock.b[i];
        const stream = i === 0 ? lock.stream * 0.45 * wmv * (1 + trot) : 0;
        lock.pivots[i].rotation.set(base[0] + clamp(a - pp, -1.9, 1.9) + stream * 0.5, base[1] + clamp(b - py, -1.2, 1.2), base[2]);
        pp = a; py = b;
      }
    }
  }
}
