// Shared bits for the game-waves games' pieces on a real table (word-weave-3d.js, missing-pie-3d.js, town-tycoon-3d.js):
// the root group, where each chair is, a printed board (a canvas texture on a wooden tray), chunky pawns, card fans and
// the clean-up. Every game builds from the public view only, into one vertex-colour batch (one draw) plus its textures.
import * as THREE from 'three';
import { Batcher, GEO } from '../batch.js';
import { GRADIENT_3, redrawWhenFontsLoad } from '../toon.js';
import { SEAT_COLORS } from './dominoes.js';
export { Batcher, GEO, SEAT_COLORS, THREE };

export const INK = '#2b2340';
export const FONT = '"Fredoka", "Trebuchet MS", sans-serif';
export const WOOD = '#9a6538', WOOD_D = '#6e4224', CREAM = '#fff8ec';
export const h01 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// the root on the table top, the board's side S (m) and where each chair is (atan2 angle, how far the top reaches toward it)
export function tableBase(parent, table, name, { min = 0.22, max = 0.5, k = 1.15 } = {}) {
  const root = new THREE.Group(); root.name = name + '-' + table.id; root.position.set(table.x, table.top, table.z); parent.add(root);
  const S = Math.max(min, Math.min(max, table.R * k));
  const dirOf = chair => { const s = table.seats && table.seats[chair]; return s ? Math.atan2(s.x - table.x, s.z - table.z) : chair * 1.3; };
  const edgeOf = chair => (table.edge ? table.edge(dirOf(chair)) : table.R + 0.1);
  return { root, S, dirOf, edgeOf };
}

// a canvas texture on a toon material (redrawn by the caller; call .dirty() after drawing)
export function canvasMat(w, h, { alpha = false } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: GRADIENT_3 });
  if (alpha) { mat.transparent = false; mat.alphaTest = 0.5; }
  return { canvas, g, tex, mat, dirty() { tex.needsUpdate = true; }, dispose() { tex.dispose(); mat.dispose(); } };
}
// redraw once the game's font has arrived (canvas text drawn before falls back to Trebuchet)
export const whenFonts = draw => redrawWhenFontsLoad(draw, [`700 20px ${FONT}`, `600 20px ${FONT}`]);

// an svg string as an image, drawn once loaded (cb then redraws whatever uses it)
const imgs = new Map();
export function svgImg(svg, cb) {
  let r = imgs.get(svg);
  if (!r) {
    r = { img: new Image(), ok: false, cbs: [] }; imgs.set(svg, r);
    const src = svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    r.img.onload = () => { r.ok = true; for (const f of r.cbs.splice(0)) f(); };
    r.img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  }
  if (!r.ok && cb) r.cbs.push(cb);
  return r.ok ? r.img : null;
}

export function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// the wooden tray under a printed board: a chunky dark frame and a lighter lip (board top at y = top)
export const TRAY_TOP = 0.016;
export function tray(b, S, { frame = WOOD_D, lip = WOOD } = {}) {
  b.add(GEO.box, frame, { y: 0.006, sx: S + 0.034, sy: 0.012, sz: S + 0.034 });
  b.add(GEO.box, lip, { y: 0.0125, sx: S + 0.014, sy: 0.003, sz: S + 0.014 });
}
// the printed face of the board: a plane at the tray's top, turned flat (canvas top = -z)
export function facePlane(root, mat, S, name) {
  const g = new THREE.PlaneGeometry(S, S); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.position.y = TRAY_TOP; m.name = name; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
  root.add(m); return m;
}

// a chunky game pawn standing on (x, z), h tall: a wide foot, a tapered body, a round head; ring: a band in another colour
export function pawn(b, x, z, col, { h = 0.04, y = 0, ring = null, lie = 0 } = {}) {
  if (lie) { // knocked over: lying along angle lie
    const dx = Math.sin(lie), dz = Math.cos(lie);
    b.add(GEO.cyl12, col, { x: x - dx * h * 0.05, y: y + h * 0.17, z: z - dz * h * 0.05, sx: h * 0.2, sy: h * 0.6, sz: h * 0.2, rx: Math.PI / 2, ry: lie });
    b.add(GEO.sphere, col, { x: x + dx * h * 0.45, y: y + h * 0.18, z: z + dz * h * 0.45, sx: h * 0.2, sy: h * 0.2, sz: h * 0.2 });
    b.add(GEO.cyl12, ring || col, { x: x - dx * h * 0.4, y: y + h * 0.2, z: z - dz * h * 0.4, sx: h * 0.3, sy: h * 0.1, sz: h * 0.3, rx: Math.PI / 2, ry: lie });
    return;
  }
  b.add(GEO.cyl12, ring || col, { x, y: y + h * 0.06, z, sx: h * 0.3, sy: h * 0.12, sz: h * 0.3 });
  b.add(GEO.cone8, col, { x, y: y + h * 0.42, z, sx: h * 0.24, sy: h * 0.7, sz: h * 0.24 });
  b.add(GEO.sphere, col, { x, y: y + h * 0.8, z, sx: h * 0.19, sy: h * 0.19, sz: h * 0.19 });
}

// n cards held in a fan, backs toward the middle of the table, at (x, z) in front of a chair facing angle a (toward the chair)
export function cardFan(b, x, z, a, n, back, { w = 0.034, h = 0.05, trim = CREAM, y = 0.012 } = {}) {
  n = Math.min(n, 9); if (n <= 0) return;
  const spread = Math.min(1.1, 0.16 * (n - 1)), tx = Math.cos(a), tz = -Math.sin(a);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5, rz = -t * spread, off = t * w * 0.55 * Math.min(n, 6);
    const cx = x + tx * off - Math.sin(a) * i * 0.0012, cz = z + tz * off - Math.cos(a) * i * 0.0012;
    // stood up, leaning back toward the chair a little, fanned about its foot
    const yy = y + h * 0.5 * Math.cos(rz);
    b.add(GEO.box, trim, { x: cx, y: yy, z: cz, sx: w, sy: h, sz: 0.0016, rz, rx: 0.35, ry: a });
    b.add(GEO.box, back, { x: cx - Math.sin(a) * 0.0011, y: yy, z: cz - Math.cos(a) * 0.0011, sx: w * 0.8, sy: h * 0.84, sz: 0.0012, rz, rx: 0.35, ry: a });
  }
}

// a die (side s) resting on y, turned by yaw, showing `top` (and two consistent side faces): a cream cube with ink pips
const FACE = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
export function die(b, x, z, s, top, { y = 0, yaw = 0, body = '#fff8ec', pip = INK } = {}) {
  top = Math.max(1, Math.min(6, top | 0));
  const f = [1, 2, 3, 4, 5, 6].find(n => n !== top && n !== 7 - top), r = [1, 2, 3, 4, 5, 6].find(n => n !== top && n !== 7 - top && n !== f && n !== 7 - f);
  b.add(GEO.box, body, { x, y: y + s / 2, z, sx: s, sy: s, sz: s, ry: yaw });
  const c = Math.cos(yaw), sn = Math.sin(yaw), at = (u, w) => [x + u * c + w * sn, z - u * sn + w * c], q = s * 0.27, pr = s * 0.1;
  for (const [u, w] of FACE[top]) { const [px, pz] = at(u * q, w * q); b.add(GEO.cyl8, pip, { x: px, y: y + s + 0.0004, z: pz, sx: pr, sy: 0.001, sz: pr }); }
  for (const [u, w] of FACE[f]) { const [px, pz] = at(u * q, s / 2 + 0.0004); b.add(GEO.cyl8, pip, { x: px, y: y + s / 2 - w * q, z: pz, sx: pr, sy: 0.001, sz: pr, rx: Math.PI / 2, ry: yaw }); }
  for (const [u, w] of FACE[r]) { const [px, pz] = at(s / 2 + 0.0004, u * q); b.add(GEO.cyl8, pip, { x: px, y: y + s / 2 - w * q, z: pz, sx: pr, sy: 0.001, sz: pr, rz: Math.PI / 2, ry: yaw }); }
}

// a gable roof: a triangular prism (unit: 1 wide in x, 1 tall in y from its foot, 1 long in z), eaves at y
const PRISM = (() => {
  const sh = new THREE.Shape(); sh.moveTo(-0.5, 0); sh.lineTo(0.5, 0); sh.lineTo(0, 1); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g;
})();
export function roof(b, col, x, y, z, w, l, h, yaw = 0) { b.add(PRISM, col, { x, y, z, sx: w, sy: h, sz: l, ry: yaw }); }

// dispose a list of built meshes
export function drop(list) { for (const m of list) { m.removeFromParent(); m.geometry && m.geometry.dispose(); } return []; }
export { GRADIENT_3 };
