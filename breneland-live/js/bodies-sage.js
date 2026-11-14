// The Dungeon Master's head piece (npc-looks.js 'dm': hat 'sagehood', an NPC-only hat like the Cultist's 'hood'). One shape made on
// purpose: a deep hood of the robe's cloth with a gold edge round the face, and the white hair and the long beard as ONE mass that
// fills the hood round the face and flows out of it down the chest (Elminster: the sage's hood, the big beard, a kindly face).
// Everything goes into the head's own Part (one mesh, one draw call). The geometry is cached per head shape and chest; colours are
// per character.
import * as THREE from 'three';
import { mergeVertices } from '../vendor/three/addons/BufferGeometryUtils.js';
import { shapeOf, radiusAlong, faceNormal, rimAt, clamp, lerp, smooth, darker, TAU } from './bodies-geo.js';
import { facetR, moustacheGeo, mouthYOf } from './bodies-face.js';
import { toon } from './toon.js';

const cache = new Map();
const memo = (k, f) => { let g = cache.get(k); if (!g) cache.set(k, g = f()); return g; };
const dirAt = (t, phi) => [Math.sin(t) * Math.sin(phi), Math.cos(t), Math.sin(t) * Math.cos(phi)];

// A geometry from a grid of points; wound so its faces point along out(x, y, z) on the whole.
function grid(pos, rows, cols, out, weld = false) {
  const idx = [];
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = a + cols;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return geo(pos, idx, out, weld);
}
function geo(pos, idx, out, weld = false) {
  let s = 0;
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f] * 3, b = idx[f + 1] * 3, c = idx[f + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const o = out(pos[a], pos[a + 1], pos[a + 2]);
    s += (uy * vz - uz * vy) * o[0] + (uz * vx - ux * vz) * o[1] + (ux * vy - uy * vx) * o[2];
  }
  if (s < 0) for (let f = 0; f < idx.length; f += 3) { const t = idx[f + 1]; idx[f + 1] = idx[f + 2]; idx[f + 2] = t; }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  if (weld) g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

// ------------------------------------------------------------------ the hood
// Its profile, azimuth by azimuth: a dome over the head (polar angle t from the crown) to just under the head's equator (T_EQ), then a
// skirt falling to the hem, which rests round the robe's collar and capelet. The window for the face (half-width a in azimuth) opens
// under a rounded arch over the brows (A_TOP .. A_FULL), runs down the sides of the face and stays open to the hem for the beard.
const H = { top: 1.05, full: 1.38, a: 0.92, aHem: 0.86, tEq: 1.7, hem: -0.44, hemR: [0.25, 0.235], cloth: 0.05, fwd: 0.03 };
const DOME = [0, 0.3, 0.55, 0.75, 0.92, H.top, 1.065, 1.09, 1.12, 1.16, 1.21, 1.27, 1.33, H.full, 1.48, 1.6, H.tEq];
const SKIRT = [0.2, 0.4, 0.6, 0.8, 1];
const NC = 36;
const scaleAt = (t, phi) => 1.17 + 0.07 * Math.abs(Math.sin(phi)) * Math.sin(t) + 0.11 * Math.max(0, -Math.cos(phi)) ** 1.5 * smooth((t - 0.3) / 0.9);
const winAt = row => row.q !== undefined ? lerp(H.a, H.aHem, smooth(row.q)) : row.t <= H.top ? 0 : row.t >= H.full ? H.a : H.a * Math.sqrt(1 - ((H.full - row.t) / (H.full - H.top)) ** 2);
// a point of the hood's outside (lin 0) or its lining (lin 1)
function hoodPt(sh, row, phi, lin, out) {
  const tq = row.q !== undefined ? H.tEq : row.t, d = dirAt(tq, phi), r = radiusAlong(sh, ...d) * (scaleAt(tq, phi) - lin * H.cloth);
  let x = d[0] * r, y = d[1] * r, z = d[2] * r;
  if (row.q !== undefined) { // the skirt: down to the hem, in to its (nearly round) ring
    const rho = Math.hypot(x, z), hr = 1 / Math.hypot(Math.sin(phi) / H.hemR[0], Math.cos(phi) / H.hemR[1]) - lin * H.cloth * 0.32, k = lerp(rho, hr, smooth(row.q)) / (rho || 1);
    x *= k; z *= k; y = lerp(y, H.hem, row.q);
  }
  out.push(x, y, z + H.fwd * (row.q !== undefined ? 1 - 0.7 * row.q : 1)); // (set forward round the face: a deep hood)
}
function hoodGeos(shapeId) {
  return memo('hood|' + shapeId, () => {
    const sh = shapeOf(shapeId), rows = DOME.map(t => ({ t })).concat(SKIRT.map(q => ({ q })));
    const sides = [[], []];
    for (const lin of [0, 1]) for (const row of rows) {
      const a = winAt(row);
      for (let j = 0; j <= NC; j++) hoodPt(sh, row, a + (TAU - 2 * a) * (j / NC), lin, sides[lin]);
    }
    const n = rows.length, outside = grid(sides[0].slice(), n, NC + 1, (x, y, z) => [x, y * 0.5, z], true);
    const lining = grid(sides[1].slice(), n, NC + 1, (x, y, z) => [-x, -y * 0.5, -z], true);
    // the hem: the outside's last row to the lining's
    const hp = [], last = (n - 1) * (NC + 1) * 3;
    for (const s of sides) hp.push(...s.slice(last, last + (NC + 1) * 3));
    const hem = grid(hp, 2, NC + 1, () => [0, -1, 0]);
    // the gold edge: a round cord along the window's edge, half way through the cloth (it covers the cut), from the hem up one side,
    // over the arch and down the other
    const edge = [], mid = (row, phi) => { const a = [], b = []; hoodPt(sh, row, phi, 0, a); hoodPt(sh, row, phi, 1, b); return new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); };
    const open = rows.filter(r => winAt(r) > 0);
    for (let i = open.length - 1; i >= 0; i--) edge.push(mid(open[i], winAt(open[i])));
    edge.push(mid({ t: H.top }, 0));
    for (const r of open) edge.push(mid(r, -winAt(r)));
    const curve = new THREE.CatmullRomCurve3(edge, false, 'centripetal');
    const cord = new THREE.TubeGeometry(curve, 72, 0.013, 6, false);
    cord.deleteAttribute('uv'); cord.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(cord.attributes.position.count * 2), 2));
    return { outside, lining, hem, cord };
  });
}

// ------------------------------------------------------------------ the hair and beard: one mass
// One grid of columns across the face and round the sides under the hood (azimuth, both signs) and rows down each column: on the head
// from its top line (the cheek line in front, rising past the eyes' outer corners to the temples, up under the hood at the sides) to
// under the jaw, then on into the air as the long beard down the chest. The beard's back closes it off in front of the chest (front:
// the chest's cloth by height in the head's frame, from human.js) and meets the front at its edges and its tip.
const AZ = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.58, 0.65, 0.72, 0.8, 0.88, 0.97, 1.08, 1.2, 1.34, 1.48, 1.62]; // (AH must be one of them)
const TOP = [[0, 1.93], [0.3, 1.95], [0.55, 1.86], [0.65, 1.6], [0.72, 1.3], [0.8, 1.08], [0.9, 0.9], [1.62, 0.86]];
const NR = 12, NH = 12, AH = 0.88; // (rows on the head, rows hanging; the beard's columns: |azimuth| up to AH)
function maneGeos(shapeId, front, key) {
  return memo('mane|' + shapeId + '|' + key, () => {
    const sh = shapeOf(shapeId), k = sh.rx / 0.368, my = mouthYOf(sh);
    const cols = [...AZ.slice(1).reverse().map(a => -a), ...AZ], nc = cols.length;
    const bot = a => lerp(2.5, 2.42, smooth((a - 0.8) / 0.4)); // (the chin's front: the beard leaves it going down)
    const yTip = -sh.ry - 0.38, n = new THREE.Vector3(), pos = [], idx = [], bp = [];
    // on the head: every column
    for (let r = 0; r <= NR; r++) for (let c = 0; c < nc; c++) {
      const phi = cols[c], a = Math.abs(phi), v = r / NR, t = lerp(rimAt(TOP, a), bot(a), v), d = dirAt(t, phi);
      const r0 = radiusAlong(sh, ...d), rf = facetR(shapeId, ...d), x = d[0] * r0, y = d[1] * r0, z = d[2] * r0;
      faceNormal(sh, x, y, z, n);
      const side = smooth((a - 0.62) / 0.4), lower = smooth((-0.1 - y) / 0.17), fr = clamp(z / 0.3, 0, 1);
      const mouth = smooth((Math.hypot(x / 0.075, (y - my - 0.003) / 0.044) - 0.85) / 0.55);
      const faceT = (0.1 + 0.9 * mouth) * (0.014 + 0.04 * lower + 0.045 * lower * fr * fr);
      const sideT = (0.058 + 0.022 * smooth(-y / 0.3)) * (1 - 0.4 * smooth((a - 1.25) / 0.3)) * (1 - 0.45 * smooth((-0.14 - y) / 0.12)); // (thinner round the back and down at the jaw, in the hood)
      const lock = 0.006 * Math.cos(phi * 15) * smooth(v / 0.35) * Math.max(lower, side); // (locks running down it)
      const tuck = 1 - smooth((a - AH) / 0.09) * smooth((v - 0.45) / 0.4); // (past the beard it tucks in under the jaw, in the hood)
      const h = 0.003 + (0.65 * smooth(v / 0.06) + 0.35 * smooth(v / 0.22)) * (lerp(faceT, sideT, side) + lock) * tuck; // (a soft lip along its top: the face's edge)
      pos.push(d[0] * rf + n.x * h, d[1] * rf + n.y * h, d[2] * rf + n.z * h);
    }
    for (let r = 0; r < NR; r++) for (let c = 0; c < nc - 1; c++) { const a = r * nc + c, b = a + nc; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    // on into the air, the middle columns (the beard): a curve from the chin down to the beard's lower edge (three points: the middle
    // lock longest), its back in front of the chest; the columns at the jaw's corners hang least and close it off at the sides
    const mid = [];
    for (let c = 0; c < nc; c++) if (Math.abs(cols[c]) <= AH + 1e-6) mid.push(c);
    const base = pos.length / 3, nm = mid.length;
    for (let s = 0; s <= NH; s++) for (let m = 0; m < nm; m++) {
      const c = mid[m], phi = cols[c], a = Math.abs(phi), sg = Math.sign(phi), q = a / AH;
      const A = pos.slice((NR * nc + c) * 3, (NR * nc + c) * 3 + 3), P = pos.slice(((NR - 1) * nc + c) * 3, ((NR - 1) * nc + c) * 3 + 3);
      let dx = A[0] - P[0], dy = A[1] - P[1], dz = A[2] - P[2], dl = Math.hypot(dx, dy, dz) || 1;
      dx = dx / dl; dy = dy / dl - 0.6; dz = dz / dl + 0.35 * (1 - q * q); dl = Math.hypot(dx, dy, dz); // (down and a little forward off the chin)
      const ey = lerp(yTip, A[1] - 0.06, smooth(q) ** 1.2) - 0.035 * Math.max(0, Math.cos(q * Math.PI * 2.6)) ** 2 * (1 - q);
      const ex = lerp(sg * 0.25 * k * Math.sin(q * Math.PI / 2) ** 0.8, A[0], q ** 4), ez = lerp(Math.max(A[2] - 0.02 * q, front(ey) + 0.085 - 0.03 * q), A[2], smooth((q - 0.65) / 0.35)); // (the jaw's corners hang in, inside the hood)
      const L = Math.hypot(ex - A[0], ey - A[1], ez - A[2]), E = [ex, ey, ez];
      const p1 = [A[0] + dx / dl * L * 0.42, A[1] + dy / dl * L * 0.42, A[2] + dz / dl * L * 0.42], p2 = [ex, ey + L * 0.4, ez + 0.02];
      const u = s / NH, w = 1 - u, open = 1 - q ** 3;
      const p = [0, 1, 2].map(i => w * w * w * A[i] + 3 * w * w * u * p1[i] + 3 * w * u * u * p2[i] + u * u * u * E[i]);
      p[2] += 0.008 * Math.cos(phi * 15) * smooth(u / 0.25) * (1 - u * u) * open; // (the locks on down the beard)
      const dep = (0.06 + 0.08 * w) * Math.sqrt(w) * open + (s ? 0 : 0.07 * open);
      const bz = Math.max(p[2] - dep, s >= NH / 4 && q < 0.7 ? front(p[1]) + 0.022 : -1);
      if (s && q < 0.7 && p[2] < bz + dep * 0.4) p[2] = bz + dep * 0.4; // (the front stays clear of the back by a share of the beard's depth)
      if (s) pos.push(...p);
      bp.push(p[0], p[1] + (s ? 0.25 : 0.1) * (p[2] - bz), bz);
    }
    const at = (s, m) => (s ? base + (s - 1) * nm + m : NR * nc + mid[m]);
    for (let s = 0; s < NH; s++) for (let m = 0; m < nm - 1; m++) idx.push(at(s, m), at(s + 1, m), at(s, m + 1), at(s, m + 1), at(s + 1, m), at(s + 1, m + 1));
    // the mass faces out: away from the head on it, forward below it; the back faces the chest
    const mass = geo(pos, idx, (x, y, z) => (y > -sh.ry * 0.85 ? [x, y, z] : [x * 0.3, 0, 1]));
    const back = grid(bp, NH + 1, nm, () => [0, 0.2, -1]);
    return { mass, back, shade: strands(mass), shadeB: strands(back) };
  });
}

// Per vertex, how light the hair is: strands down it (a little lighter and darker by azimuth) and a cooler shade deep in the hood.
function strands(g) {
  const P = g.attributes.position, out = new Float32Array(P.count);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), a = Math.atan2(x, z);
    out[i] = 0.9 + 0.1 * Math.cos(a * 15 + y * 9) - 0.08 * smooth((Math.abs(a) - 0.9) / 0.4);
  }
  return out;
}
const _c0 = new THREE.Color(), _c1 = new THREE.Color();
function tinted(g, shade, col, cool) {
  const c = g.clone(), n = shade.length, arr = new Float32Array(n * 3), a = _c0.set(col), b = _c1.set(cool);
  for (let i = 0; i < n; i++) { const k = shade[i], r = a.r * k + b.r * (1 - k), gg = a.g * k + b.g * (1 - k), bb = a.b * k + b.b * (1 - k); arr[i * 3] = r; arr[i * 3 + 1] = gg; arr[i * 3 + 2] = bb; }
  c.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return c;
}

// Adds the head piece to the head's Part. front(y): how far forward the chest's cloth reaches at height y in the head's frame (and
// key: what it depends on, for the cache).
export function addSageHead(part, o, front, key) {
  const id = o.faceShape, cloth = o.hatColor || o.shirt || '#26305e', gold = o.tieColor || '#e3b04a', white = o.facialHairColor || o.hair || '#f4f2ec';
  const h = hoodGeos(id);
  part.add(h.outside, cloth);
  part.add(h.lining, darker(cloth, 0.55));
  part.add(h.hem, darker(cloth, 0.8));
  part.add(h.cord, gold);
  const m = maneGeos(id, front, key);
  const vc = toon('#ffffff', { vertexColors: true }), cool = '#9aa3c0'; // (the head's own material: no new draw call)
  part.add(tinted(m.mass, m.shade, white, cool), vc);
  part.add(tinted(m.back, m.shadeB.map(k => k - 0.06), white, cool), vc);
  part.add(moustacheGeo(id, 'b'), white, { sx: 1.35, y: 0.006, z: 0.004 }); // (a big one, its ends in the beard)
}
export const SAGE_HOOD = H;
