// Geometry helpers for the people (human.js): merged parts, head shapes and the shells that hair and hats
// are cut from. Everything here runs at build time, never per frame.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from '../vendor/three/addons/BufferGeometryUtils.js';
import { toon, LAYER_SOFT } from './toon.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

const _c = new THREE.Color(), _d = new THREE.Color();
export function darker(hex, f = 0.7) { return '#' + _c.set(hex).multiplyScalar(f).getHexString(); }
export function mixHex(a, b, t) { return '#' + _c.set(a).lerp(_d.set(b), t).getHexString(); }
export function lighter(hex, t = 0.3) { return mixHex(hex, '#ffffff', t); }

// ------------------------------------------------------------------ shared unit geometries

const cache = new Map();
function memo(key, make) { let g = cache.get(key); if (!g) { g = make(); cache.set(key, g); } return g; }
export const sphere = (w = 18, h = 12) => memo('s' + w + 'x' + h, () => new THREE.SphereGeometry(1, w, h));
export const capsuleGeo = (r, len, cs = 5, rs = 12) => memo(`c${r.toFixed(3)}|${len.toFixed(3)}|${cs}|${rs}`, () => new THREE.CapsuleGeometry(r, len, cs, rs));
export const cylGeo = (rt, rb, h, seg = 12, open = false) => memo(`y${rt.toFixed(3)}|${rb.toFixed(3)}|${h.toFixed(3)}|${seg}|${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
export const coneGeo = (seg = 8) => memo('n' + seg, () => new THREE.ConeGeometry(1, 1, seg));
export const boxGeo = () => memo('b', () => new THREE.BoxGeometry(1, 1, 1));
export const torusGeo = (r, tube, arc = TAU, rs = 6, ts = 16) => memo(`t${r.toFixed(3)}|${tube.toFixed(3)}|${arc.toFixed(3)}|${rs}|${ts}`, () => new THREE.TorusGeometry(r, tube, rs, ts, arc));
export const lathe = (key, pts, seg = 18) => memo('l' + key, () => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg));

// A smooth profile through control points [r, y] (Catmull-Rom), for torso and skirt lathes.
export function smoothProfile(pts, n = 28) {
  const curve = new THREE.SplineCurve(pts.map(p => new THREE.Vector2(p[0], p[1])));
  return curve.getPoints(n).map(v => [Math.max(0.0005, v.x), v.y]);
}

// ------------------------------------------------------------------ parts: many primitives, one mesh per material

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// Colours are baked into vertex colours, so a whole rigid piece (a torso with its collar and buttons, a head with
// its hair) is ONE mesh with one shared material. Pass opts (side, emissive...) to use a normal toon material instead.
const VC = () => toon('#ffffff', { vertexColors: true });
const _col = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3(), _mid = new THREE.Vector3();

export class Part {
  constructor() { this.by = new Map(); }
  // (tests, tools/collar-fit-lib.mjs) while Part.tagged is an array, every piece added to any Part is recorded in it: { part, tag, name,
  // geo }; a piece may carry o.tag ('inner' / 'outer': a garment under or over another at the neck) and o.name
  static tagged = null;

  // add(geometry, colour | material, { x, y, z, sx, sy, sz, rx, ry, rz (YXZ), matrix, opts })
  add(geo, color, o = {}) {
    let mat, vc = null;
    if (typeof color !== 'string') mat = color;
    else if (o.opts) mat = toon(color, o.opts);
    else { mat = VC(); vc = _col.set(color); }
    const g = geo.clone();
    if (o.matrix) g.applyMatrix4(o.matrix);
    else {
      _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e);
      g.applyMatrix4(_m.compose(_p.set(o.x || 0, o.y || 0, o.z || 0), _q, _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1)));
    }
    if (vc) {
      const n = g.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = vc.r; arr[i * 3 + 1] = vc.g; arr[i * 3 + 2] = vc.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    let list = this.by.get(mat);
    if (!list) this.by.set(mat, list = []);
    list.push(g);
    if (Part.tagged) Part.tagged.push({ part: this, tag: o.tag || null, name: o.name || null, geo: g }); // (tests: every piece, as later warped)
    return this;
  }

  // A capsule stretched between two points (a strand of hair, a glasses arm, a strap).
  rod(a, b, r, color, o = {}) {
    _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _dir.length();
    if (len < 1e-5) return this;
    _dir.multiplyScalar(1 / len);
    _q.setFromUnitVectors(_up, _dir);
    _mid.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    return this.add(capsuleGeo(r, Math.max(0.001, len - 2 * r), 3, 6), color, { matrix: new THREE.Matrix4().compose(_mid, _q, _s.set(1, 1, 1)), ...o });
  }

  // Bend everything added so far through a smooth space warp fn(x, y, z, out) -> out = [x', y', z'] (the body-type
  // shaping of a torso and what lies on it). Normals follow through the warp's Jacobian (finite differences), so the
  // shading and the ink stay as smooth as before and nothing laid on the cloth comes off it.
  warp(fn) {
    if (!fn) return this;
    const o = [0, 0, 0], a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], h = 0.002;
    for (const list of this.by.values()) for (const g of list) {
      const pos = g.attributes.position, nor = g.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        fn(x, y, z, o);
        if (nor) {
          fn(x + h, y, z, a); fn(x, y + h, z, b); fn(x, y, z + h, c);
          // J columns = d(out)/dx, dy, dz; the normal goes through the inverse transpose (the cofactor matrix)
          const j00 = (a[0] - o[0]) / h, j10 = (a[1] - o[1]) / h, j20 = (a[2] - o[2]) / h;
          const j01 = (b[0] - o[0]) / h, j11 = (b[1] - o[1]) / h, j21 = (b[2] - o[2]) / h;
          const j02 = (c[0] - o[0]) / h, j12 = (c[1] - o[1]) / h, j22 = (c[2] - o[2]) / h;
          const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
          const cx = (j11 * j22 - j12 * j21) * nx + (j12 * j20 - j10 * j22) * ny + (j10 * j21 - j11 * j20) * nz;
          const cy = (j02 * j21 - j01 * j22) * nx + (j00 * j22 - j02 * j20) * ny + (j01 * j20 - j00 * j21) * nz;
          const cz = (j01 * j12 - j02 * j11) * nx + (j02 * j10 - j00 * j12) * ny + (j00 * j11 - j01 * j10) * nz;
          const l = Math.hypot(cx, cy, cz) || 1;
          nor.setXYZ(i, cx / l, cy / l, cz / l);
        }
        pos.setXYZ(i, o[0], o[1], o[2]);
      }
    }
    return this;
  }

  // Merge into a Group of meshes (one per material). onSoft: drawn in colour but never ink-outlined (flat printed details).
  build({ onSoft = false, cast = true, receive = false } = {}) {
    const g = new THREE.Group();
    for (const [mat, geos] of this.by) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (geos.length > 1) geos.forEach(x => x.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = cast && !onSoft; m.receiveShadow = receive;
      if (onSoft) m.layers.set(LAYER_SOFT);
      g.add(m);
    }
    this.by.clear();
    return g;
  }
}

// ------------------------------------------------------------------ head shapes
// Each head is a superellipsoid, narrowed or widened toward the chin. `F(x, y, z) = 1` is the skin.
// Face features are placed on that surface exactly (faceMatrix) so they sit right on every shape.

export const HEAD_SHAPES = {
  round:  { rx: 0.368, ry: 0.335, rz: 0.335, n: 2.15, taper: 0.06 },
  oval:   { rx: 0.325, ry: 0.375, rz: 0.322, n: 2.1, taper: 0.2 },
  square: { rx: 0.355, ry: 0.325, rz: 0.335, n: 3.3, taper: 0.03 },
  heart:  { rx: 0.365, ry: 0.345, rz: 0.33, n: 2.1, taper: 0.4 },
  chubby: { rx: 0.385, ry: 0.322, rz: 0.345, n: 2.05, taper: -0.1 },
};
export const shapeOf = id => HEAD_SHAPES[id] || HEAD_SHAPES.round;

function F(sh, x, y, z) {
  const t = clamp(-y / sh.ry, 0, 1);
  const w = 1 - sh.taper * Math.pow(t, 1.4);
  return Math.pow(Math.abs(x) / (sh.rx * w), sh.n) + Math.pow(Math.abs(y) / sh.ry, sh.n) + Math.pow(Math.abs(z) / sh.rz, sh.n);
}

// radius along a unit direction where the skin is
export function radiusAlong(sh, dx, dy, dz) {
  let lo = 0.02, hi = 1.6;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (F(sh, dx * mid, dy * mid, dz * mid) < 1) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// front surface z at (x, y), or 0 when off the head
export function faceZ(sh, x, y) {
  if (F(sh, x, y, 0) >= 1) return 0;
  let lo = 0, hi = sh.rz * 1.4;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (F(sh, x, y, mid) < 1) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

const _n = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _qa = new THREE.Quaternion(), _qr = new THREE.Quaternion();
export function faceNormal(sh, x, y, z, out = _n) {
  const h = 0.002;
  out.set(F(sh, x + h, y, z) - F(sh, x - h, y, z), F(sh, x, y + h, z) - F(sh, x, y - h, z), F(sh, x, y, z + h) - F(sh, x, y, z - h));
  return out.normalize();
}

// Matrix that lays a unit shape on the face at (x, y): its +z along the surface normal, `lift` out along it, then scaled.
export function faceMatrix(sh, x, y, { lift = 0, sx = 1, sy = 1, sz = 1, roll = 0, oy = 0, m = new THREE.Matrix4() } = {}) {
  const z = faceZ(sh, x, y);
  const n = faceNormal(sh, x, y, z, _n);
  _qa.setFromUnitVectors(_z, n);
  if (roll) { _qr.setFromAxisAngle(_z, roll); _qa.multiply(_qr); }
  _p.set(x + n.x * lift, y + n.y * lift - oy, z + n.z * lift);
  return m.compose(_p, _qa, _s.set(sx, sy, sz));
}

// A cap of the head for hair and hats. Azimuth phi runs from the front (0) round to the back (pi);
// rim = [front, side, back] are polar angles from the crown where the shell stops, so the hairline can dip at the
// back and rise at the forehead. scale grows it over the skin (thickness), puff/back/side add volume.
// The polar angle (from the crown) of a rim given as [front, side, back] at azimuth phi (0 = front).
// A rim may also be a table of [azimuth, polar] pairs, azimuth rising from 0 (the front) to pi (the back), eased
// between them: a hairline that rises over the ear, drops in front of it as a sideburn and comes down to the nape behind it.
export function rimAt(rim, phi) {
  const a = Math.abs(((phi + Math.PI) % TAU + TAU) % TAU - Math.PI); // 0 at the front .. pi at the back
  if (Array.isArray(rim[0])) {
    if (a <= rim[0][0]) return rim[0][1];
    for (let i = 1; i < rim.length; i++) if (a <= rim[i][0]) { const p = rim[i - 1], q = rim[i]; return lerp(p[1], q[1], smooth((a - p[0]) / Math.max(1e-6, q[0] - p[0]))); }
    return rim[rim.length - 1][1];
  }
  return a < Math.PI / 2 ? lerp(rim[0], rim[1], smooth(a / (Math.PI / 2))) : lerp(rim[1], rim[2], smooth((a - Math.PI / 2) / (Math.PI / 2)));
}

// cap / capScale: hair under a hat. Inside the hat's rim (polar angles [front, side, back]) the shell is held to
// capScale times the skull, so no volume (bob, back puff, afro) pushes through; below the rim it eases back out.
// The azimuths a shell is cut at: nPhi even steps, plus (a hairline given as a table) each of its turning points and the middle
// between two that differ, on both sides, so a sideburn or the notch over an ear is drawn where it is and not between two columns.
function shellPhis(nPhi, rim, from, jagged) {
  const ph = [], n = Array.isArray(rim[0]) && !jagged ? Math.round(nPhi * 0.6) : nPhi; // (a table's own turning points carry the detail: fewer even steps; a ragged rim needs them all)
  for (let i = 0; i <= n; i++) ph.push((i / n) * TAU);
  for (const tb of [rim, from]) {
    if (!tb || !Array.isArray(tb[0])) continue;
    for (let i = 0; i < tb.length; i++) {
      const add = a => { if (a > 1e-3 && a < Math.PI - 1e-3) ph.push(a, TAU - a); };
      add(tb[i][0]);
      if (i && Math.abs(tb[i][1] - tb[i - 1][1]) > 0.08) for (const f of [0.33, 0.67]) add(lerp(tb[i - 1][0], tb[i][0], f));
    }
  }
  ph.sort((a, b) => a - b);
  const out = [];
  for (const a of ph) if (!out.length || a - out[out.length - 1] > 0.035) out.push(a); else if (a === TAU) out[out.length - 1] = TAU;
  return out;
}

// hug: [front, side, back] polar bands (radians) over the rim in which the hair's thickness eases down to LIP_K of a head, so it
// lies flat at the nape and over the ears instead of standing off like a bowl. lip: close the open edges (the rim, and the top
// edge of a shell that starts below the crown) with a strip in to just off the skin, so the hair sits ON the head from every
// angle, below included.
export const LIP_K = 0.014;
export function shellGeo(shapeId, { scale = 1.07, rim = [1.0, 1.4, 1.6], start = 0, puff = 0, back = 0, side = 0, lift = 0, nPhi = 26, nTh = 10, flat = 0, invert = false, cap = null, capScale = 1.08, capFlat = 0, from = null, cut = 0, jag = 0, hug = null, lip = false, rimJag = null } = {}) {
  // from: [front, side, back] polar angles where the shell starts (instead of `start`, a fraction of the rim)
  const key = `sh|${shapeId}|${scale}|${rim}|${start}|${puff}|${back}|${side}|${lift}|${nPhi}|${nTh}|${flat}|${invert}|${cap}|${capScale}|${capFlat}|${from}|${cut}|${jag}|${hug}|${lip}|${rimJag}`;
  return memo(key, () => {
    const sh = shapeOf(shapeId);
    const pos = [], idx = [], edge = [[], []]; // edge[0]: the top edge's rows (when the shell starts below the crown), edge[1]: the rim's
    const startsLow = !!from || start > 0;
    const phis = shellPhis(nPhi, rim, from, !!rimJag);
    for (let i = 0; i < phis.length; i++) {
      const phi = phis[i];
      // rimJag [amount, points]: a ragged rim, `points` locks of hair hanging `amount` (polar) below it all round (a shag, a fringe)
      const th = rimAt(rim, phi) + (rimJag ? rimJag[0] * (1 - Math.abs(((phi * rimJag[1] / Math.PI) % 2) - 1)) : 0);
      const tc = cap ? rimAt(cap, phi) : 0;
      const hg = hug ? Math.max(1e-3, rimAt(hug, phi)) : 0;
      for (let j = 0; j <= nTh; j++) {
        let t0 = (from ? rimAt(from, phi) : th * start) + jag * Math.sin(phi * 11) * Math.sin(phi * 3 + 1); // jag: a ragged top edge
        if (cut) t0 = th - (th - t0) * smooth((Math.abs(((phi + Math.PI) % TAU + TAU) % TAU - Math.PI) - cut) / 0.4); // nothing in front of azimuth `cut`
        const t = t0 + (th - t0) * (j / nTh);
        const dx = Math.sin(t) * Math.sin(phi), dy = (invert ? -1 : 1) * Math.cos(t), dz = Math.sin(t) * Math.cos(phi);
        const r0 = radiusAlong(sh, dx, dy, dz);
        let r = r0 * scale;
        r *= 1 + puff * Math.max(0, invert ? -dy : dy) ** 2 + back * Math.max(0, -dz) ** 1.5 + side * dx * dx;
        if (hug) { const k = smooth((th - t) / hg), rl = r0 * (1 + LIP_K); if (r > rl) r = rl + (r - rl) * k; }
        if (cap) { const rc = r0 * capScale * (1 - capFlat * Math.max(0, dy) ** 2); if (r > rc) r = rc + (r - rc) * smooth((t - tc + 0.02) / 0.34); }
        let y = dy * r;
        if (flat && y > 0) y *= 1 - flat;
        const yl = y + lift * Math.max(0, dy); // lifted on top only, so a lifted shell still comes down to its rim
        pos.push(dx * r, yl, dz * r);
        if (lip && (j === nTh || (j === 0 && startsLow))) { // the lip: from the edge straight in toward the head's centre, to just off the skin
          const l = Math.hypot(dx * r, yl, dz * r), ux = dx * r / l, uy = yl / l, uz = dz * r / l, sk = radiusAlong(sh, ux, uy, uz) * (1 + LIP_K);
          edge[j ? 1 : 0].push([dx * r, yl, dz * r, ux * sk, uy * sk, uz * sk]);
        }
      }
    }
    for (let i = 0; i < phis.length - 1; i++) for (let j = 0; j < nTh; j++) {
      const a = i * (nTh + 1) + j, b = (i + 1) * (nTh + 1) + j;
      if (invert) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g = mergeVertices(g, 1e-4);
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!lip) return g;
    // the lips: their own vertices (a crisp crease for the ink where they meet the shell), wound to face away from the hair's inside
    const parts = [g];
    for (const [k, rows] of edge.entries()) {
      if (!rows.length || rows.every(q => Math.hypot(q[0] - q[3], q[1] - q[4], q[2] - q[5]) < 1e-4)) continue;
      const lp = [], li = [];
      for (const q of rows) lp.push(...q);
      for (let i = 0; i < rows.length - 1; i++) { const a = i * 2, b = a + 2; if (k) li.push(a, b, a + 1, a + 1, b, b + 1); else li.push(a, a + 1, b, a + 1, b + 1, b); }
      // wind it so it faces away from the hair: the rim's lip toward growing polar angle (down and out), a top edge's toward the
      // crown. Checked per strip, not assumed.
      let s = 0;
      for (let f = 0; f < li.length; f += 3) {
        const A = li[f] * 3, B = li[f + 1] * 3, C = li[f + 2] * 3;
        const ux = lp[B] - lp[A], uy = lp[B + 1] - lp[A + 1], uz = lp[B + 2] - lp[A + 2], vx = lp[C] - lp[A], vy = lp[C + 1] - lp[A + 1], vz = lp[C + 2] - lp[A + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const cx = lp[A], cy = lp[A + 1], cz = lp[A + 2], l = Math.hypot(cx, cy, cz) || 1, hx = Math.hypot(cx, cz) || 1;
        const dwx = (cy / l) * (cx / hx), dwy = -hx / l, dwz = (cy / l) * (cz / hx); // the direction of growing polar angle here
        s += (k ? 1 : -1) * (nx * dwx + ny * dwy + nz * dwz);
      }
      if (s < 0) for (let f = 0; f < li.length; f += 3) { const t = li[f + 1]; li[f + 1] = li[f + 2]; li[f + 2] = t; }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      lg.setIndex(li);
      lg.computeVertexNormals();
      lg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(lp.length / 3 * 2), 2));
      parts.push(lg);
    }
    const m = mergeGeometries(parts, false);
    parts.forEach(p => p.dispose());
    return m;
  });
}

// Winding check: grid is (phi outward, theta downward); indices above wind so normals point out. Flip if not.
export function fullHeadGeo(shapeId) {
  return memo('head|' + shapeId, () => {
    const g = shellGeo(shapeId, { scale: 1, rim: [Math.PI, Math.PI, Math.PI], nPhi: 28, nTh: 16 });
    return g;
  });
}

// A point on the (scaled) head surface in a direction, for hooking bows, pom-poms and knots to the hair.
export function surfacePoint(shapeId, dx, dy, dz, scale = 1, out = new THREE.Vector3()) {
  const sh = shapeOf(shapeId);
  const l = Math.hypot(dx, dy, dz) || 1;
  dx /= l; dy /= l; dz /= l;
  const r = radiusAlong(sh, dx, dy, dz) * scale;
  return out.set(dx * r, dy * r, dz * r);
}

// The polar angle (from the crown, seen from the side) at which the covered head is `w` wide.
export function polarAtWidth(shapeId, w, scale = 1) {
  const sh = shapeOf(shapeId);
  let lo = 0.02, hi = Math.PI / 2;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    const r = radiusAlong(sh, Math.sin(t), Math.cos(t), 0) * scale;
    if (r * Math.sin(t) < w) lo = t; else hi = t;
  }
  return (lo + hi) / 2;
}
// The height (above the head centre) at which the covered head is `w` wide: where a hat brim or crown ring sits.
export function yAtWidth(shapeId, w, scale = 1) {
  const t = polarAtWidth(shapeId, w, scale);
  return radiusAlong(shapeOf(shapeId), Math.sin(t), Math.cos(t), 0) * scale * Math.cos(t);
}

// ------------------------------------------------------------------ open lathes (jackets, lapels, waistcoats)

// The radius of a lathe profile ([[r, y], ...], y rising) at height v (same units), clamped to its ends.
export function profileAt(pts, v) {
  if (v <= pts[0][1]) return pts[0][0];
  for (let i = 1; i < pts.length; i++) if (v <= pts[i][1]) { const a = pts[i - 1], b = pts[i]; return lerp(a[0], b[0], (v - a[1]) / Math.max(1e-6, b[1] - a[1])); }
  return pts[pts.length - 1][0];
}

// A lathe that only goes part of the way round, the same on both sides of the front (azimuth 0 = +z, the front):
// at profile height y it spans azimuths a0(y)..a1(y) on the left and -a0..-a1 on the right. For open jackets
// (a0 = half the opening, a1 = pi) and lapel strips. Faces are wound outward.
export function openLathe(key, pts, a0, a1, seg = 14) {
  return memo('ol|' + key, () => {
    const pos = [], idx = [];
    for (const side of [1, -1]) {
      const base = pos.length / 3;
      for (let i = 0; i < pts.length; i++) {
        const [r, y] = pts[i], p0 = a0(y), p1 = a1(y);
        for (let j = 0; j <= seg; j++) { const phi = side * lerp(p0, p1, j / seg); pos.push(r * Math.sin(phi), y, r * Math.cos(phi)); }
      }
      for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < seg; j++) {
        const a = base + i * (seg + 1) + j, b = a + seg + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    // wind every face outward (away from the axis)
    const v = (k, o) => pos[k * 3 + o];
    for (let f = 0; f < idx.length; f += 3) {
      const [a, b, c] = [idx[f], idx[f + 1], idx[f + 2]];
      const ux = v(b, 0) - v(a, 0), uy = v(b, 1) - v(a, 1), uz = v(b, 2) - v(a, 2), wx = v(c, 0) - v(a, 0), wy = v(c, 1) - v(a, 1), wz = v(c, 2) - v(a, 2);
      const nx = uy * wz - uz * wy, nz = ux * wy - uy * wx;
      const cx = v(a, 0) + v(b, 0) + v(c, 0), cz = v(a, 2) + v(b, 2) + v(c, 2);
      if (nx * cx + nz * cz < 0) { idx[f + 1] = c; idx[f + 2] = b; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    return g;
  });
}
