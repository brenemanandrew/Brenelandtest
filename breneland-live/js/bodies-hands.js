// Hands for human.js, in the style of PEAK's (Andrew's reference docs/refs/andrew-peak-hands.png, read not copied). Each hand is ONE
// smooth unbroken piece, like a gingerbread hand: a soft rounded palm with three short chunky fingers and a stubby thumb, no knuckles,
// spread with clear V gaps so the fingers can be counted. Flat colour, only the outline inked. Built from a signed distance field
// (each digit a chain of round cones melted into the pad on its own, so the gaps stay open), polygonised once (surface nets), cut to
// TRIS triangles by quadric edge collapse, with normals from the field so the cel bands follow a round form.
//
// In the wrist's frame (human.js makeArm): the hand hangs down -y, the thumb forward (+z), the palm facing in toward the body
// (-side x, side +1 the left arm, -1 the right). Each shape (open, relaxed, grip, point) is its own closed mesh, one visible at a
// time. Made once per shape and side at a standard size and coloured per person. rigid-merge draws every shape with the body, the
// hidden ones collapsed, so no extra draw calls.
//
// Which shape: the pose's channels lgrip / rgrip (0 open .. 1 a fist) and lpoint / rpoint (bodies-poses.js), and anything held
// (human.js closes the hand round whatever hangs from its anchor, which sits inside the gripping fingers' curl: gripAt).
import * as THREE from 'three';
import { Part } from './bodies-geo.js';

export const HAND_SIZE = 1.45; // a little oversized against the arm, as cartoon hands are
// where held things sit: the hollow the closed hand makes on its palm side (wrist frame, before the person's hand size)
export const gripAt = side => [-side * 0.024 * HAND_SIZE, -0.078 * HAND_SIZE, 0.004 * HAND_SIZE]; // inside the curl of the gripping fingers
export const HAND_SHAPES = ['open', 'relaxed', 'grip', 'point'];

// ---------------------------------------------------------------- the field
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
// a capsule whose radius runs from r1 at a to r2 at b (iq's round cone)
function roundCone(px, py, pz, a, b, r1, r2) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], l2 = bx * bx + by * by + bz * bz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const qx = px - a[0], qy = py - a[1], qz = pz - a[2];
  const y = qx * bx + qy * by + qz * bz, z = y - l2;
  const xx = (qx * l2 - bx * y) ** 2 + (qy * l2 - by * y) ** 2 + (qz * l2 - bz * y) ** 2, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * xx;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(xx + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(xx + y2) * il2 - r1;
  return (Math.sqrt(xx * a2 * il2) + y * rr) * il2 - r1;
}
function ellipsoid(px, py, pz, c, r) {
  const x = (px - c[0]) / r[0], y = (py - c[1]) / r[1], z = (pz - c[2]) / r[2], k0 = Math.hypot(x, y, z), k1 = Math.hypot(x / r[0], y / r[1], z / r[2]);
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(...r);
}

// The hand as a list of pieces for one shape and side. Units: metres at HAND_SIZE (handK 1). PEAK's read: a soft rounded pad of a
// palm, three short chunky tapered fingers and a stubby thumb flowing out of it with no joints, spread apart with clear V gaps.
const FINGERS = [ // z on the pad's bottom edge, length, base radius
  [0.031, 0.05, 0.0198], [0.0, 0.055, 0.0205], [-0.031, 0.047, 0.019],
];
const SHAPE = { // per finger: splay (rad, fanned in the pad's plane), curl (rad, toward the palm, spread along the finger); the thumb
  open: { splay: [0.42, 0.02, -0.4], curl: [0.05, 0.05, 0.05], thumb: [0.12, -0.35, 1.0], tcurl: 0 },
  relaxed: { splay: [0.16, 0.02, -0.15], curl: [1.35, 1.45, 1.55], thumb: [0.6, -0.6, 0.6], tcurl: 0.5 }, // cupped, the fingers gently curled
  grip: { splay: [0.14, 0.0, -0.14], curl: [2.5, 2.6, 2.6], thumb: [0.9, -0.35, 0.45], tcurl: 0.5 },
  point: { splay: [0.06, 0.0, -0.1], curl: [0.0, 2.7, 2.7], thumb: [0.95, -0.4, 0.3], tcurl: 0.6 },
  // the intro's hand shading the eyes, fingers together and relaxed, the thumb alongside. Not in HAND_SHAPES: only the intro's
  // copy of your arm builds it (handGeo('shade', side)), so nobody else's hand carries it.
  shade: { splay: [0.1, 0.0, -0.1], curl: [0.22, 0.2, 0.2], thumb: [0.3, -0.75, 0.5], tcurl: 0.15 },
  // the tower climber's first-person hands only (buildHand's `extra`, not in HAND_SHAPES). wrap: round a bar (a ladder rung, the
  // catwalk rail) or over a hold's edge, each finger an even arc centred on wrapAt, so a bar of about WRAP_R through that point has
  // the fingers over and round it and the thumb under. strain: a wet hold, half open.
  wrap: { splay: [0.1, 0.0, -0.1], curl: [1.72, 1.78, 1.84], thumb: [0.9, -0.55, 0.25], tcurl: 0.7 },
  strain: { splay: [0.26, 0.02, -0.24], curl: [0.85, 0.9, 0.95], thumb: [0.5, -0.5, 0.6], tcurl: 0.3 },
  // a book held on the hand (qol-fixes, human.js addAccessory 'book'; only a book holder's hands build it: buildHand's `extra`): the
  // fingers together and straight along its back cover, the thumb along the fore-edge
  book: { splay: [0.12, 0.0, -0.12], curl: [0.08, 0.08, 0.08], thumb: [0.08, -0.3, 1.0], tcurl: 0.05 },
};
// where the bar runs through the wrap shape's curled fingers (the middle finger's arc centre: its root plus its length over
// its curl, toward the palm), in the wrist's frame at the standard size, and the bar's radius that fills it (the arc's radius less the
// finger's own); the bar runs along z (the thumb's way)
const WRAP_RC = (0.055 * HAND_SIZE) / 1.78;
export const wrapAt = side => [-side * WRAP_RC, -0.082 * HAND_SIZE, 0];
export const WRAP_R = WRAP_RC - 0.0205 * HAND_SIZE * 0.85;
function pieces(shape, side) {
  const S = HAND_SIZE, s = -side, P = typeof shape === 'string' ? SHAPE[shape] : shape; // s: the way the palm faces (x). (pose-editor: a spec object too)
  const out = { palm: { c: [0, -0.055 * S, 0.002 * S], r: [0.024 * S, 0.046 * S, 0.047 * S] }, heel: { c: [s * 0.002, -0.026 * S, 0], r: [0.025 * S, 0.028 * S, 0.04 * S] }, fingers: [] };
  // each finger a smooth tapered tube along a curve: four short round cones, its direction turning toward the palm as it goes
  FINGERS.forEach(([z, len, r0], i) => {
    const segs = [], n = 4, sp = P.splay[i], cu = P.curl[i];
    let p = [0, -0.082 * S, z * S];
    for (let k = 0; k < n; k++) {
      const a = (cu * (k + 0.5)) / n; // (bent evenly along its length: no knuckle)
      const d = [s * Math.sin(a), -Math.cos(a) * Math.cos(sp), Math.cos(a) * Math.sin(sp)], l = (len * S) / n;
      const q = [p[0] + d[0] * l, p[1] + d[1] * l, p[2] + d[2] * l];
      const ra = r0 * S * (1 - 0.24 * (k / n)), rb = r0 * S * (1 - 0.24 * ((k + 1) / n)); // (chunky, tapering to a round tip)
      segs.push([p, q, ra, rb]); p = q;
    }
    out.fingers.push(segs);
  });
  // the stubby thumb off the pad's front edge, curving in a little in a grip
  const t = [s * P.thumb[0], P.thumb[1], P.thumb[2]], tl = Math.hypot(...t), td = t.map(v => v / tl), segs = [];
  let p = [s * 0.006 * S, -0.04 * S, 0.036 * S];
  for (let k = 0; k < 3; k++) {
    const b = (P.tcurl * (k + 0.5)) / 3, d = [td[0] * Math.cos(b) + s * Math.sin(b) * 0.6, td[1], td[2] * Math.cos(b)], dl = Math.hypot(...d), l = (0.05 * S) / 3;
    const q = [p[0] + (d[0] / dl) * l, p[1] + (d[1] / dl) * l, p[2] + (d[2] / dl) * l];
    segs.push([p, q, 0.021 * S * (1 - 0.11 * k), 0.021 * S * (1 - 0.11 * (k + 1)) * (k === 2 ? 0.85 : 1)]); p = q;
  }
  out.thumb = segs;
  return out;
}
function field(P) {
  const { palm, heel, fingers, thumb } = P;
  const tube = (segs, x, y, z) => { let d = 9; for (const [a, b, r1, r2] of segs) d = smin(d, roundCone(x, y, z, a, b, r1, r2), 0.004); return d; };
  return (x, y, z) => {
    const pad = smin(ellipsoid(x, y, z, palm.c, palm.r), ellipsoid(x, y, z, heel.c, heel.r), 0.02);
    // each digit melts into the pad on its own (a soft web at the root), but the digits are only joined to each other through the
    // pad: the V gaps between them stay open
    let d = pad;
    for (const segs of fingers) d = Math.min(d, smin(pad, tube(segs, x, y, z), 0.016));
    return Math.min(d, smin(pad, tube(thumb, x, y, z), 0.016));
  };
}

// ---------------------------------------------------------------- surface nets
const CELL = 0.0075; // (fine enough to keep the gaps between the fingers open; the collapse below takes it down to TRIS)
function polygonise(F, lo, hi) {
  const nx = Math.ceil((hi[0] - lo[0]) / CELL) + 1, ny = Math.ceil((hi[1] - lo[1]) / CELL) + 1, nz = Math.ceil((hi[2] - lo[2]) / CELL) + 1;
  const at = (i, j, k) => i + nx * (j + ny * k), val = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) val[at(i, j, k)] = F(lo[0] + i * CELL, lo[1] + j * CELL, lo[2] + k * CELL);
  const vid = new Int32Array(nx * ny * nz).fill(-1), pos = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const corner = c => [c & 1, (c >> 1) & 1, (c >> 2) & 1];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const v = []; let inside = 0;
    for (let c = 0; c < 8; c++) { const [a, b, d] = corner(c); const f = val[at(i + a, j + b, k + d)]; v.push(f); if (f < 0) inside++; }
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [p, q] of E) {
      if ((v[p] < 0) === (v[q] < 0)) continue;
      const t = v[p] / (v[p] - v[q]), A = corner(p), B = corner(q);
      sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t; n++;
    }
    let x = lo[0] + (i + sx / n) * CELL, y = lo[1] + (j + sy / n) * CELL, z = lo[2] + (k + sz / n) * CELL;
    for (let it = 0; it < 2; it++) { // (settle onto the surface along the field's gradient)
      const f = F(x, y, z), h = 1e-4, gx = (F(x + h, y, z) - f) / h, gy = (F(x, y + h, z) - f) / h, gz = (F(x, y, z + h) - f) / h, g2 = gx * gx + gy * gy + gz * gz || 1;
      const st = Math.max(-0.25 * CELL, Math.min(0.25 * CELL, f)) / Math.sqrt(g2); // (no more than half a cell a step: no folding over)
      x -= st * gx; y -= st * gy; z -= st * gz;
    }
    vid[at(i, j, k)] = pos.length / 3; pos.push(x, y, z);
  }
  const idx = [];
  const d2 = (a, b) => (pos[a * 3] - pos[b * 3]) ** 2 + (pos[a * 3 + 1] - pos[b * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[b * 3 + 2]) ** 2;
  const quad = (a, b, c, d, flip) => { // (split along the shorter diagonal: a bent quad cut the long way folds over)
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (d2(a, c) > d2(b, d)) { const t = a; a = b; b = c; c = d; d = t; }
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { // x edges
    const a = val[at(i, j, k)] < 0, b = val[at(i + 1, j, k)] < 0; if (a === b) continue;
    quad(vid[at(i, j - 1, k - 1)], vid[at(i, j, k - 1)], vid[at(i, j, k)], vid[at(i, j - 1, k)], b);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { // y edges
    const a = val[at(i, j, k)] < 0, b = val[at(i, j + 1, k)] < 0; if (a === b) continue;
    quad(vid[at(i - 1, j, k - 1)], vid[at(i - 1, j, k)], vid[at(i, j, k)], vid[at(i, j, k - 1)], b);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { // z edges
    const a = val[at(i, j, k)] < 0, b = val[at(i, j, k + 1)] < 0; if (a === b) continue;
    quad(vid[at(i - 1, j - 1, k)], vid[at(i, j - 1, k)], vid[at(i, j, k)], vid[at(i - 1, j, k)], b);
  }
  const dec = decimate(pos, idx, TRIS);
  pos.length = 0; pos.push(...dec.pos); idx.length = 0; idx.push(...dec.idx);
  for (let v = 0; v < pos.length; v += 3) { // (back onto the surface after the collapses)
    const x = pos[v], y = pos[v + 1], z = pos[v + 2], f = F(x, y, z), h = 1e-4, gx = (F(x + h, y, z) - f) / h, gy = (F(x, y + h, z) - f) / h, gz = (F(x, y, z + h) - f) / h, g2 = gx * gx + gy * gy + gz * gz || 1;
    const st = Math.max(-0.25 * CELL, Math.min(0.25 * CELL, f)) / Math.sqrt(g2);
    pos[v] = x - st * gx; pos[v + 1] = y - st * gy; pos[v + 2] = z - st * gz;
  }
  const nor = new Float32Array(pos.length);
  for (let v = 0; v < pos.length; v += 3) {
    const x = pos[v], y = pos[v + 1], z = pos[v + 2], h = 1e-4, f = F(x, y, z);
    const gx = F(x + h, y, z) - f, gy = F(x, y + h, z) - f, gz = F(x, y, z + h) - f, l = Math.hypot(gx, gy, gz) || 1;
    nor[v] = gx / l; nor[v + 1] = gy / l; nor[v + 2] = gz / l;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- fewer triangles (the hand is small on screen; four shapes a hand)
// Quadric edge collapse (Garland-Heckbert) with a heap: the edge whose collapse moves the surface least goes first, never one that
// would turn a triangle over, until `target` triangles are left. Build time only (once a shape and side), some tens of ms.
const TRIS = 250;
function decimate(P, I, target) {
  const nv = P.length / 3, Q = new Float64Array(nv * 10), alive = new Uint8Array(I.length / 3).fill(1), F = I.slice(), ver = new Uint32Array(nv);
  const vf = Array.from({ length: nv }, () => []), dead = new Uint8Array(nv);
  const plane = (f, out) => { const a = F[f * 3] * 3, b = F[f * 3 + 1] * 3, c = F[f * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1e-12;
    out[0] = nx / l; out[1] = ny / l; out[2] = nz / l; out[3] = -(out[0] * P[a] + out[1] * P[a + 1] + out[2] * P[a + 2]); return out; };
  const pl = [0, 0, 0, 0], n0 = [0, 0, 0, 0], n1 = [0, 0, 0, 0];
  for (let f = 0; f < alive.length; f++) {
    const [a, b, c, d] = plane(f, pl), q = [a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d];
    for (let k = 0; k < 3; k++) { const v = F[f * 3 + k]; vf[v].push(f); for (let j = 0; j < 10; j++) Q[v * 10 + j] += q[j]; }
  }
  const err = (q, x, y, z) => q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
  const q = new Float64Array(10);
  // a binary heap of [cost, u, v, verU, verV, t]
  const H = [];
  const push = e => { H.push(e); let i = H.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
  const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return top; };
  const cost = (u, v) => {
    for (let j = 0; j < 10; j++) q[j] = Q[u * 10 + j] + Q[v * 10 + j];
    let best = Infinity, bt = 0;
    for (const t of [0, 0.5, 1]) { const e = err(q, P[u * 3] + (P[v * 3] - P[u * 3]) * t, P[u * 3 + 1] + (P[v * 3 + 1] - P[u * 3 + 1]) * t, P[u * 3 + 2] + (P[v * 3 + 2] - P[u * 3 + 2]) * t); if (e < best) { best = e; bt = t; } }
    push([best, u, v, ver[u], ver[v], bt]);
  };
  const edgesOf = v => { const set = new Set(); for (const f of vf[v]) if (alive[f]) for (let k = 0; k < 3; k++) { const w = F[f * 3 + k]; if (w !== v) set.add(w); } return set; };
  for (let v = 0; v < nv; v++) for (const w of edgesOf(v)) if (v < w) cost(v, w);
  let count = alive.length;
  while (count > target && H.length) {
    const [, u, v, vu, vv, t] = pop();
    if (dead[u] || dead[v] || ver[u] !== vu || ver[v] !== vv) continue; // (stale)
    const x = P[u * 3] + (P[v * 3] - P[u * 3]) * t, y = P[u * 3 + 1] + (P[v * 3 + 1] - P[u * 3 + 1]) * t, z = P[u * 3 + 2] + (P[v * 3 + 2] - P[u * 3 + 2]) * t;
    // the link condition (a collapse must not pinch the surface) and no triangle turned over
    const eu = edgesOf(u), ev = edgesOf(v); let shared = 0; for (const w of eu) if (ev.has(w)) shared++;
    let ok = shared === 2;
    const keep = [P[u * 3], P[u * 3 + 1], P[u * 3 + 2], P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
    for (const w of [u, v]) { if (!ok) break; for (const f of vf[w]) {
      if (!alive[f]) continue;
      const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2];
      if ((a === u || b === u || c === u) && (a === v || b === v || c === v)) continue;
      plane(f, n0); P[w * 3] = x; P[w * 3 + 1] = y; P[w * 3 + 2] = z; plane(f, n1);
      P[u * 3] = keep[0]; P[u * 3 + 1] = keep[1]; P[u * 3 + 2] = keep[2]; P[v * 3] = keep[3]; P[v * 3 + 1] = keep[4]; P[v * 3 + 2] = keep[5];
      if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < 0.35) { ok = false; break; }
    } }
    if (!ok) continue;
    P[u * 3] = x; P[u * 3 + 1] = y; P[u * 3 + 2] = z;
    for (let j = 0; j < 10; j++) Q[u * 10 + j] += Q[v * 10 + j];
    for (const f of vf[v]) {
      if (!alive[f]) continue;
      for (let k = 0; k < 3; k++) if (F[f * 3 + k] === v) F[f * 3 + k] = u;
      if (F[f * 3] === F[f * 3 + 1] || F[f * 3 + 1] === F[f * 3 + 2] || F[f * 3] === F[f * 3 + 2]) { alive[f] = 0; count--; } else vf[u].push(f);
    }
    vf[v] = []; dead[v] = 1; ver[u]++;
    for (const w of edgesOf(u)) { ver[w]++; }
    for (const w of edgesOf(u)) { cost(u, w); for (const w2 of edgesOf(w)) if (w2 !== u) cost(Math.min(w, w2), Math.max(w, w2)); }
  }
  const map = new Int32Array(nv).fill(-1), pos = [], idx = [];
  for (let f = 0; f < alive.length; f++) if (alive[f]) for (let k = 0; k < 3; k++) {
    const v = F[f * 3 + k];
    if (map[v] < 0) { map[v] = pos.length / 3; pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); }
    idx.push(map[v]);
  }
  return { pos, idx };
}

const cache = new Map();
export function handGeo(shape, side) {
  const key = shape + (side > 0 ? 'L' : 'R');
  let g = cache.get(key);
  if (!g) { g = polygonise(field(pieces(shape, side)), [-0.08, -0.19, -0.075].map(v => v * HAND_SIZE), [0.08, 0.035, 0.105].map(v => v * HAND_SIZE)); cache.set(key, g); }
  return g;
}

// (pose-editor) a hand shape's numbers (a copy: splay, curl per finger, thumb, tcurl) and a hand built from such numbers, uncached
// (the Pose Editor's curl per finger). Same bounds as handGeo.
export const handSpec = name => { const P = SHAPE[name] || SHAPE.relaxed; return { splay: P.splay.slice(), curl: P.curl.slice(), thumb: P.thumb.slice(), tcurl: P.tcurl }; };
export const handGeoFor = (spec, side) => polygonise(field(pieces(spec, side)), [-0.08, -0.19, -0.075].map(v => v * HAND_SIZE), [0.08, 0.035, 0.105].map(v => v * HAND_SIZE));

// Build one hand on `wrist`: the four shapes, each its own closed mesh, the relaxed one showing. hw, hl: the body type's hand width
// and length (D.shape.handK). Returns the bits Human switches.
export function buildHand(wrist, side, skin, hw = 1, hl = 1, extra = null) {
  const shapes = {};
  for (const name of extra ? HAND_SHAPES.concat(extra) : HAND_SHAPES) { // `extra` shapes: the tower's wrap and strain
    const p = new Part();
    p.add(handGeo(name, side), skin, { sx: hw, sy: hl, sz: hw });
    const g = p.build();
    g.userData.handShape = name;
    g.visible = name === 'relaxed';
    wrist.add(g);
    shapes[name] = g;
  }
  return { shapes, shape: 'relaxed', side };
}

// The shape for a grip (0 open .. 1 a fist) and a point (0..1): only the meshes' visibility changes, and only when it does.
export function poseHand(H, grip, point) {
  const want = point > 0.5 ? 'point' : grip < 0.12 ? 'open' : grip < 0.5 ? 'relaxed' : 'grip';
  if (want === H.shape) return;
  H.shapes[H.shape].visible = false; H.shapes[want].visible = true; H.shape = want;
}
// one named shape (the tower's hands pick theirs directly: open reaching, wrap on a bar or a hold, strain on a wet hold)
export function setHandShape(H, want) {
  if (want === H.shape || !H.shapes[want]) return;
  H.shapes[H.shape].visible = false; H.shapes[want].visible = true; H.shape = want;
}
