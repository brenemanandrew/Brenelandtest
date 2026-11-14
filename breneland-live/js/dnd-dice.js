// D&D night's 3D dice (d4 to d20) and the throw: a tumble across the felt that lands showing the server's number (lib/dnd.js
// rolls it). The throw's power, aim and seed travel with the roll, and throwPath is pure, so every client sees the same path.
//
//   makeDie(sides)                 -> { sides, geo, faces: [{ n, num, up }], r, rest }   (r: its rough radius, rest: centre to a face)
//   dieMaterial(color)             -> a new toon material for one die mesh (setDieColor changes its colour later)
//   setDieColor(mat, color)         its colour, and numbers that contrast with it (light on a dark die, dark on a light one)
//   dieGlow(mat, k, face)           the landed glow (0..1) on one face (face 0: the whole die)
//   restingQuat(die, value, yaw, q) the orientation that shows `value` (up, its number's top toward `yaw`; a d4: the face it
//                                   rests on, read at the bottom edges)
//   shownBy(die, q)                -> the number the die shows in orientation q (the test's check)
//   throwPath(plan, seat, thr, size, rest) -> { from, hit, to, bounced, dur, inTray, yaw } (the path a throw takes; see below)
import * as THREE from 'three';
import { toon } from './toon.js';

// ---- the faces: one atlas, a 128 px cell per face of every die (4 + 6 + 8 + 10 + 12 + 20 = 60 of 64). It is a mask, not a
// picture: green is the face's shade (1 the face, darker in the bevel band round it, darkest at the very edge), red the
// number, blue the number's outline. The material colours them, so one atlas serves every colour.
const CELL = 128, COLS = 8, ROWS = 8, FIRST = { 4: 0, 6: 4, 8: 10, 10: 18, 12: 28, 20: 40 };
const FONT = '"Fredoka", "Trebuchet MS", "Segoe UI", Roboto, Arial, sans-serif';
const SHADE = { face: 255, bevel: 196, edge: 112 }; // (green: x / 255 is the shade)
let atlas = null, canvas = null;
const cellUV = i => { const cx = i % COLS, cy = Math.floor(i / COLS); return [cx / COLS, 1 - (cy + 1) / ROWS, (cx + 1) / COLS, 1 - cy / ROWS]; };

// a convex polygon (local coords, counter-clockwise) moved in by d along every edge
function inset(poly, d) {
  const n = poly.length, lines = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % n], L = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / L, ny = (bx - ax) / L;
    lines.push([ax + nx * d, ay + ny * d, bx - ax, by - ay]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const [px, py, rx, ry] = lines[(i + n - 1) % n], [qx, qy, sx, sy] = lines[i], den = rx * sy - ry * sx;
    const t = ((qx - px) * sy - (qy - py) * sx) / den;
    out.push([px + rx * t, py + ry * t]);
  }
  return out;
}
const inside = (poly, x, y) => { for (let i = 0; i < poly.length; i++) { const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length]; if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) < 0) return false; } return true; };

// the biggest number (a w x h box per px of font, centred on x = 0) that fits in poly, and where (its middle's y)
function fit(poly, w, h) {
  let best = { px: 0, cy: 0 };
  for (let cy = -0.5; cy <= 0.5; cy += 0.02) {
    let lo = 0, hi = 3;
    for (let k = 0; k < 18; k++) {
      const s = (lo + hi) / 2, hw = w * s / 2, hh = h * s / 2;
      if (inside(poly, -hw, cy - hh) && inside(poly, hw, cy - hh) && inside(poly, hw, cy + hh) && inside(poly, -hw, cy + hh)) lo = s; else hi = s;
    }
    if (lo > best.px) best = { px: lo, cy };
  }
  return best;
}

function drawFace(g, cell, F, sides) {
  const ox = (cell % COLS) * CELL, oy = Math.floor(cell / COLS) * CELL, H = CELL / 2;
  const P = ([x, y]) => [ox + H + x * H, oy + H - y * H]; // (local to canvas: y up to y down)
  const path = poly => { g.beginPath(); poly.forEach((p, i) => { const [x, y] = P(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); };
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = `rgb(0,${SHADE.edge},0)`; g.fillRect(ox, oy, CELL, CELL);
  // the edge line, the bevel band, then the face with rounded corners (moved in by its radius, stroked round)
  const e = 0.035, b = 0.11, rr = 0.08;
  g.fillStyle = `rgb(0,${SHADE.bevel},0)`; path(inset(F.poly, e)); g.fill();
  g.fillStyle = g.strokeStyle = `rgb(0,${SHADE.face},0)`; g.lineJoin = 'round'; g.lineWidth = rr * 2 * H;
  path(inset(F.poly, b + rr)); g.fill(); g.stroke();
  // the numbers: red the fill, blue the outline round it (added, so the channels stay apart)
  g.globalCompositeOperation = 'lighter'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  const glyph = (text, x, y, ang, px, under) => {
    g.save(); g.translate(...P([x, y])); g.rotate(ang); if (text.length > 1) g.scale(NARROW, 1); g.font = `600 ${px}px ${FONT}`;
    const cap = px * 0.7, uh = Math.max(2, px * 0.09), uy = cap * 0.5 + px * 0.07;
    g.lineWidth = Math.max(2, px * 0.16); g.strokeStyle = 'rgb(0,0,255)'; g.fillStyle = 'rgb(255,0,0)';
    g.strokeText(text, 0, cap / 2); if (under) g.strokeRect(-px * 0.22, uy, px * 0.44, uh);
    g.fillText(text, 0, cap / 2); if (under) g.fillRect(-px * 0.22, uy, px * 0.44, uh);
    g.restore();
  };
  if (sides === 4) { for (const E of F.edges) glyph(String(E.num), E.mid[0], E.mid[1], E.angle, F.px, false); return; }
  glyph(label(sides, F.num), 0, F.cy, 0, F.px, F.num === 6 || F.num === 9);
}
const NARROW = 0.84; // (two digits a little condensed, as dice print them)
const label = (sides, n) => (sides === 10 && n === 10 ? '0' : String(n)); // (a d10 says 0 for its 10, as a real one does)

function drawAtlas() {
  if (!canvas) { canvas = document.createElement('canvas'); canvas.width = CELL * COLS; canvas.height = CELL * ROWS; }
  const g = canvas.getContext('2d');
  g.globalCompositeOperation = 'source-over'; g.fillStyle = `rgb(0,${SHADE.edge},0)`; g.fillRect(0, 0, canvas.width, canvas.height);
  for (const die of dieCache.values()) {
    // one size of number for the whole die: the widest label in the tightest face, a little room to spare
    if (die.sides !== 4) {
      g.font = `600 100px ${FONT}`;
      let w = 0; for (const f of die.faces) { const t = label(die.sides, f.num); w = Math.max(w, g.measureText(t).width / 100 * (t.length > 1 ? NARROW : 1)); }
      const hBox = 0.87; // (the digits' height, and room for the 6 / 9 underline below)
      let px = Infinity; const fits = die.faces.map(f => fit(inset(f.F.poly, 0.08), w, hBox));
      for (const q of fits) px = Math.min(px, q.px);
      const k = die.sides === 6 ? 0.8 : 0.94; // (a d6's square would take a number edge to edge)
      die.faces.forEach((f, i) => { f.F.px = px * k * CELL / 2; f.F.cy = fits[i].cy + 0.085 * px * k; });
    } else for (const f of die.faces) f.F.px = 0.44 * CELL / 2; // (a d4: three smaller numbers a face)
    for (const f of die.faces) drawFace(g, FIRST[die.sides] + f.num - 1, f.F, die.sides);
  }
  if (atlas) atlas.needsUpdate = true;
}
function atlasTex() {
  if (atlas) return atlas;
  drawAtlas();
  atlas = new THREE.CanvasTexture(canvas); atlas.colorSpace = THREE.NoColorSpace; atlas.anisotropy = 4;
  // the numbers' font may still be on its way: draw again once it is here
  if (typeof document !== 'undefined' && document.fonts?.load) document.fonts.load(`600 64px ${FONT}`).then(fs => { if (fs && fs.length) drawAtlas(); }).catch(() => {});
  return atlas;
}

// ---- the shapes: a non-indexed geometry, its triangles grouped into faces by their normal; each face gets a number, an "up"
// across it (toward a corner; a d6 toward an edge; a d10 toward its point) and its triangles' UVs map the face into its cell
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _v = new THREE.Vector3();
// a pentagonal trapezohedron: ten flat kites, two points. The belt's zigzag (z0) sets how tall it is: h = z0 (1 + cos 36) /
// (1 - cos 36) keeps every kite flat; z0 0.125 gives a point 1.18 x the belt's radius, about a real d10's shape
function d10Geometry() {
  const z0 = 0.125, h = z0 * (1 + Math.cos(Math.PI / 5)) / (1 - Math.cos(Math.PI / 5)), T = [0, h, 0], B = [0, -h, 0];
  const U = k => [Math.cos(k * 2 * Math.PI / 5), z0, Math.sin(k * 2 * Math.PI / 5)], L = k => [Math.cos((k + 0.5) * 2 * Math.PI / 5), -z0, Math.sin((k + 0.5) * 2 * Math.PI / 5)];
  const tris = [];
  for (let k = 0; k < 5; k++) {
    tris.push(T, U(k + 1), L(k), T, L(k), U(k));          // the upper kite (T, U k, L k, U k+1)
    tris.push(B, L(k), U(k + 1), B, L(k + 1), U(k + 1));  // the lower kite (B, L k, U k+1, L k+1)
  }
  const pos = new Float32Array(tris.length * 3); tris.forEach((v, i) => pos.set(v, i * 3));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return fixWinding(g);
}
function fixWinding(g) { // every triangle wound so its normal points away from the middle
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i += 3) {
    _a.fromBufferAttribute(p, i); _b.fromBufferAttribute(p, i + 1); _c.fromBufferAttribute(p, i + 2);
    _n.subVectors(_b, _a).cross(_v.subVectors(_c, _a));
    if (_n.dot(_v.copy(_a).add(_b).add(_c)) < 0) { p.setXYZ(i + 1, _c.x, _c.y, _c.z); p.setXYZ(i + 2, _b.x, _b.y, _b.z); }
  }
  return g;
}
const SHAPES = {
  4: () => new THREE.TetrahedronGeometry(1, 0),
  6: () => new THREE.BoxGeometry(1.25, 1.25, 1.25),
  8: () => new THREE.OctahedronGeometry(1, 0),
  10: d10Geometry,
  12: () => new THREE.DodecahedronGeometry(1, 0),
  20: () => new THREE.IcosahedronGeometry(1, 0),
};
const dieCache = new Map();
function buildDie(sides) {
  let g = SHAPES[sides](); if (g.index) g = g.toNonIndexed();
  const p = g.attributes.position, nTri = p.count / 3;
  const groups = [];
  for (let t = 0; t < nTri; t++) {
    _a.fromBufferAttribute(p, t * 3); _b.fromBufferAttribute(p, t * 3 + 1); _c.fromBufferAttribute(p, t * 3 + 2);
    const n = _b.clone().sub(_a).cross(_c.clone().sub(_a)).normalize();
    let G = groups.find(x => x.n.dot(n) > 0.999);
    if (!G) { G = { n, tris: [] }; groups.push(G); }
    G.tris.push(t);
  }
  const faces = groups.map((G, i) => ({ n: G.n, num: i + 1, tris: G.tris }));
  const uv = new Float32Array(p.count * 2), fid = new Float32Array(p.count);
  let rest = Infinity, R0 = 0;
  for (const f of faces) {
    const verts = []; for (const t of f.tris) for (let j = 0; j < 3; j++) verts.push(new THREE.Vector3().fromBufferAttribute(p, t * 3 + j));
    const uniq = verts.filter((v, i) => verts.findIndex(w => w.distanceTo(v) < 1e-5) === i);
    const cen = uniq.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / uniq.length);
    rest = Math.min(rest, cen.dot(f.n)); R0 = Math.max(R0, ...uniq.map(v => v.length()));
    // its up: toward its farthest corner (a d10's point), else the highest corner; a d6 toward the middle of an edge
    const far = Math.max(...uniq.map(v => v.distanceTo(cen)));
    const key = v => (v.distanceTo(cen) > far - 1e-4 ? 10 : 0) + v.y + v.x * 1e-3 + v.z * 1e-6;
    const top = uniq.reduce((a, v) => (key(v) > key(a) ? v : a));
    const V = top.clone().sub(cen);
    if (sides === 6) { const o = uniq.filter(v => v !== top).sort((a, b2) => a.distanceTo(top) - b2.distanceTo(top))[0]; V.copy(top).add(o).multiplyScalar(0.5).sub(cen); }
    V.sub(f.n.clone().multiplyScalar(V.dot(f.n))).normalize();
    const U = V.clone().cross(f.n).normalize();
    f.up = V;
    // the face as big as its cell allows (its box's middle at the cell's middle, a little room round it)
    const flat = v => [_v.copy(v).sub(cen).dot(U), _v.copy(v).sub(cen).dot(V)], fl = uniq.map(flat);
    const bx = (Math.min(...fl.map(q => q[0])) + Math.max(...fl.map(q => q[0]))) / 2, by = (Math.min(...fl.map(q => q[1])) + Math.max(...fl.map(q => q[1]))) / 2;
    const S = Math.max(...fl.map(q => Math.max(Math.abs(q[0] - bx), Math.abs(q[1] - by)))) * 1.06;
    const loc = v => { const [x, y] = flat(v); return [(x - bx) / S, (y - by) / S]; };
    const poly = fl.slice().sort((a, b2) => Math.atan2(a[1], a[0]) - Math.atan2(b2[1], b2[0])).map(([x, y]) => [(x - bx) / S, (y - by) / S]);
    f.F = { poly, num: f.num };
    const [u0, v0, u1, v1] = cellUV(FIRST[sides] + f.num - 1);
    for (const t of f.tris) for (let j = 0; j < 3; j++) {
      const k = t * 3 + j; _a.fromBufferAttribute(p, k); const [lx, ly] = loc(_a);
      uv[k * 2] = u0 + (lx * 0.5 + 0.5) * (u1 - u0); uv[k * 2 + 1] = v0 + (ly * 0.5 + 0.5) * (v1 - v0); fid[k] = f.num;
    }
    f.loc = loc; f.uniq = uniq; f.mid = [-bx / S, -by / S]; // (its middle, in the cell)
  }
  // the d4: on each face, near each edge, the number of the face across that edge (a d4 is read at the bottom: the number along
  // the edges it rests on), its foot toward that edge
  if (sides === 4) for (const f of faces) {
    f.F.edges = [];
    for (let a = 0; a < 3; a++) {
      const A = f.uniq[a], Bv = f.uniq[(a + 1) % 3];
      const other = faces.find(o => o !== f && o.uniq.filter(v => v.distanceTo(A) < 1e-5 || v.distanceTo(Bv) < 1e-5).length === 2);
      const la = f.loc(A), lb = f.loc(Bv), [cx, cy] = f.mid, mx = (la[0] + lb[0]) / 2 - cx, my = (la[1] + lb[1]) / 2 - cy;
      // the number's up points from the edge to the middle (canvas y runs down: its angle is atan2(ux, uy))
      f.F.edges.push({ mid: [cx + mx * 0.6, cy + my * 0.6], angle: Math.atan2(-mx, -my), num: other ? other.num : 1 });
    }
  }
  for (const f of faces) { delete f.tris; delete f.loc; delete f.uniq; delete f.mid; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('fid', new THREE.BufferAttribute(fid, 1));
  g.computeVertexNormals(); g.computeBoundingSphere();
  return { sides, geo: g, faces, r: R0, rest };
}
export function makeDie(sides) {
  sides = SHAPES[sides] ? sides : 20;
  if (!dieCache.size) { for (const s of [4, 6, 8, 10, 12, 20]) dieCache.set(s, buildDie(s)); if (typeof document !== 'undefined') atlasTex(); }
  return dieCache.get(sides);
}

// ---- the material: the toon colour, the bevel's shade and the numbers from the atlas, a glow on the face that came up.
// One material per die mesh (its uniforms are its own: three uploads a material's uniforms only when the material changes).
const DIE_GLSL_V = 'attribute float fid;\nvarying float vFid;\n';
const DIE_GLSL_F = 'uniform vec3 uDieNum, uDieOut;\nuniform float uDieLit, uDieOutK, uGlow, uGlowFace;\nvarying float vFid;\n';
export function dieMaterial(color = '#e0463c') {
  const tex = atlasTex();
  const m = toon('#ffffff').clone(); m.map = tex;
  const U = { uDieNum: { value: new THREE.Color() }, uDieOut: { value: new THREE.Color() }, uDieLit: { value: 0 }, uDieOutK: { value: 0 }, uGlow: { value: 0 }, uGlowFace: { value: 0 } };
  m.userData.die = U;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + DIE_GLSL_V).replace('#include <uv_vertex>', '#include <uv_vertex>\n  vFid = fid;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + DIE_GLSL_F)
      .replace('#include <map_fragment>', `vec3 dieM = texture2D( map, vMapUv ).rgb;
  float dieG = uGlow * ( uGlowFace < 0.5 ? 1.0 : 1.0 - step( 0.5, abs( vFid - uGlowFace ) ) );
  float dieRim = smoothstep( 0.97, 0.8, dieM.g ) * dieG; // (the landed face's bevel turns gold)
  diffuseColor.rgb *= mix( dieM.g, 1.0, dieRim );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0, 0.72, 0.16 ), dieRim );
  diffuseColor.rgb = mix( diffuseColor.rgb, uDieOut, dieM.b * uDieOutK );
  diffuseColor.rgb = mix( diffuseColor.rgb, uDieNum, dieM.r );`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += uDieNum * dieM.r * uDieLit + vec3( 0.9, 0.6, 0.12 ) * dieRim + diffuseColor.rgb * 0.35 * dieG;`);
  };
  m.customProgramCacheKey = () => 'dnd-die-2';
  setDieColor(m, color);
  return m;
}
const _col = new THREE.Color();
export function setDieColor(m, color) {
  m.color.set(color);
  _col.set(color);
  const lum = 0.299 * _col.r + 0.587 * _col.g + 0.114 * _col.b; // (linear: under about 0.3 reads as a dark die)
  const U = m.userData.die, dark = lum < 0.3;
  U.uDieNum.value.set(dark ? '#fff6e2' : '#22151c');
  U.uDieOut.value.set('#1a1018'); U.uDieOutK.value = dark ? 1 : 0; // (light numbers are inked round; dark ones need no outline)
  U.uDieLit.value = dark ? 0.35 : 0;
}
export function dieGlow(m, k, face = 0) { const U = m.userData.die; U.uGlow.value = k; U.uGlowFace.value = face; }

// ---- which way up
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), _q = new THREE.Quaternion();
export function restingQuat(die, value, yaw, q = new THREE.Quaternion()) {
  const f = die.faces.find(x => x.num === value) || die.faces[0];
  q.setFromUnitVectors(f.n, die.sides === 4 ? DOWN : UP);
  let turn = yaw;
  if (die.sides !== 4 && f.up) { _v.copy(f.up).applyQuaternion(q); turn = yaw - Math.atan2(_v.x, _v.z); } // (its number's top toward yaw)
  _q.setFromAxisAngle(UP, turn);
  return q.premultiply(_q);
}
export function shownBy(die, q) {
  let best = null, bd = -2;
  for (const f of die.faces) { const d = _n.copy(f.n).applyQuaternion(q).dot(die.sides === 4 ? DOWN : UP); if (d > bd) { bd = d; best = f; } }
  return best ? best.num : 0;
}

// ---- the throw. From above the thrower's tray (the DM: in front of the screen), along the seat's facing turned by the aim: a
// short hold (p near 0) drops it in the tray, a long one sends it across the felt; past the felt's edge it bounces off the rail
// (mirrored back in) and settles on the felt. size: the die's radius (m), rest: its middle's height when it lies on a face (m).
// yaw: which way the number's top points, away from the thrower (so it reads upright from their chair), give or take a little.
export function throwPath(BP, seat, thr, size, rest = size * 0.82) {
  const t = BP.trays.find(x => x.i === seat), F = BP.felt;
  const p = Math.max(0, Math.min(1, Number(thr && thr.p) || 0)), a = Math.max(-0.5, Math.min(0.5, Number(thr && thr.a) || 0));
  let sx, sz, fx, fz;
  if (t) { sx = t.x; sz = t.z; fx = t.fx; fz = t.fz; }
  else { sx = BP.screen.x - 0.3; sz = BP.screen.z; fx = -1; fz = 0; } // (the DM rolls in front of the screen, toward the players)
  const c = Math.cos(a), s = Math.sin(a), dx = fx * c + fz * s, dz = -fx * s + fz * c;
  const dist = 0.03 + p * 1.25;
  let x = sx + dx * dist, z = sz + dz * dist, bounced = null;
  const m = size + 0.01, x0 = F.minX + m, x1 = F.maxX - m, z0 = F.minZ + m, z1 = F.maxZ - m;
  for (let k = 0; k < 3; k++) { // (off the rail: mirrored back in, at most a few times)
    if (x > x1) { bounced = bounced || [x1, z]; x = 2 * x1 - x; } else if (x < x0) { bounced = bounced || [x0, z]; x = 2 * x0 - x; }
    if (z > z1) { bounced = bounced || [x, z1]; z = 2 * z1 - z; } else if (z < z0) { bounced = bounced || [x, z0]; z = 2 * z0 - z; }
  }
  x = Math.max(x0, Math.min(x1, x)); z = Math.max(z0, Math.min(z1, z));
  const inTray = !!t && Math.abs((x - t.x) * Math.cos(t.yaw) - (z - t.z) * Math.sin(t.yaw)) < t.w / 2 - 0.02 - size && Math.abs((x - t.x) * Math.sin(t.yaw) + (z - t.z) * Math.cos(t.yaw)) < t.d / 2 - 0.02 - size;
  const y = (inTray ? t.floor : BP.mat.y + 0.0005) + rest;
  const from = [sx - dx * 0.05, (t ? t.floor : F.y) + 0.32, sz - dz * 0.05];
  const jit = ((((thr && thr.s) || 0) % 628) / 100 - 3.14) * 0.06; // (about 11 degrees either way)
  return { from, hit: bounced, to: [x, y, z], bounced: !!bounced, dur: 0.75 + p * 0.55, inTray, yaw: Math.atan2(fx, fz) + jit, ground: y - rest };
}
