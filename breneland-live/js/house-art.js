// The ranch house's printed surfaces: red brick on the front and the crawl-space skirt, light green lap siding on the sides and
// back, dark architectural shingles, the living room's carpet and rug, the kitchen tile. Small canvases with plain fills only (no
// 2D-canvas filters or shadowBlur, see docs/CONTRACTS.md), tiled in metres by house.js (worldUV). Each is made once and shared.
import * as THREE from 'three';
import { GRADIENT_3 } from './toon.js';
import { mulberry32 } from './util.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
// a toon material over one of these maps (its UVs are metres / TILE)
export const artMat = (k, f) => once('m:' + k, () => new THREE.MeshToonMaterial({ map: once(k, f), gradientMap: GRADIENT_3 }));
export const TILE = { brick: [1.2, 0.6], siding: [1.6, 1.0], shingle: [1.6, 1.2], carpet: [1.5, 1.5], tile: [0.9, 0.9] };

// 4 bricks x 8 courses per tile (a brick 0.3 x 0.075 m, chunky as the house style likes), warm reds with a few dark ones
export function brick() {
  const [c, g] = canvas(256, 256), rnd = mulberry32(11);
  g.fillStyle = '#c9bfae'; g.fillRect(0, 0, 256, 256);
  const rows = 8, cols = 4, bh = 256 / rows, bw = 256 / cols;
  for (let r = 0; r < rows; r++) for (let k = -1; k <= cols; k++) {
    const x = k * bw + (r % 2 ? bw / 2 : 0), y = r * bh, v = (rnd() - 0.5) * 30, d = rnd() < 0.12 ? -26 : 0;
    g.fillStyle = `rgb(${Math.round(172 + v + d)},${Math.round(78 + v * 0.5 + d)},${Math.round(58 + v * 0.4 + d)})`;
    g.fillRect(x + 4, y + 4, bw - 8, bh - 8);
    g.fillStyle = 'rgba(60,20,10,0.16)'; g.fillRect(x + 4, y + bh - 9, bw - 8, 5);
  }
  return tex(c);
}
// five boards a metre, each lighter at its foot, a shadow line under each lap
export function siding() {
  const [c, g] = canvas(128, 160);
  const bh = 160 / 5;
  for (let i = 0; i < 5; i++) {
    g.fillStyle = '#b3c3a2'; g.fillRect(0, i * bh, 128, bh);
    g.fillStyle = '#c3d1b2'; g.fillRect(0, i * bh + bh * 0.45, 128, bh * 0.55);
    g.fillStyle = '#7e8f6f'; g.fillRect(0, i * bh, 128, 4);
  }
  return tex(c);
}
// dark architectural shingles: staggered tabs of greys, a shadow under each course
export function shingle() {
  const [c, g] = canvas(256, 192), rnd = mulberry32(5);
  g.fillStyle = '#3a3a3c'; g.fillRect(0, 0, 256, 192);
  const rows = 6, rh = 192 / rows;
  for (let r = 0; r < rows; r++) {
    let x = (r % 2) * 22 - 30;
    while (x < 256) {
      const tw = 30 + rnd() * 34, v = Math.round(64 + rnd() * 28);
      g.fillStyle = `rgb(${v},${v - 2},${v - 5})`; g.fillRect(x, r * rh, tw - 3, rh - 6);
      x += tw;
    }
    g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(0, r * rh + rh - 6, 256, 6);
  }
  return tex(c);
}
// the living room's wall-to-wall carpet: oatmeal with a soft fleck
export function carpet() {
  const [c, g] = canvas(128, 128), rnd = mulberry32(7);
  g.fillStyle = '#d4c6ae'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) { g.fillStyle = rnd() < 0.5 ? '#c4b59c' : '#e0d3bd'; g.fillRect(rnd() * 128, rnd() * 128, 2, 2); }
  return tex(c);
}
// the kitchen's big beige tiles (two by two per tile), grout lines
export function tile() {
  const [c, g] = canvas(128, 128), rnd = mulberry32(3);
  g.fillStyle = '#a99c86'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const v = Math.round((rnd() - 0.5) * 14); g.fillStyle = `rgb(${222 + v},${210 + v},${190 + v})`; g.fillRect(i * 64 + 2, j * 64 + 2, 60, 60); }
  return tex(c);
}
// the area rug under the coffee table: slate blue with a cream double border
export function areaRug() {
  return once('rug', () => {
    const [c, g] = canvas(256, 192);
    g.fillStyle = '#5b6a73'; g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#d6cbb4'; g.fillRect(12, 12, 232, 168);
    g.fillStyle = '#5b6a73'; g.fillRect(20, 20, 216, 152);
    g.fillStyle = '#d6cbb4'; g.fillRect(30, 30, 196, 132);
    g.fillStyle = '#6b7a83'; g.fillRect(34, 34, 188, 124);
    g.fillStyle = '#8fa1aa'; for (const [x, y, r] of [[80, 70, 22], [170, 120, 28], [130, 90, 12], [60, 130, 14], [190, 60, 16]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.fillStyle = '#6b7a83'; g.beginPath(); g.arc(x, y, r - 5, 0, Math.PI * 2); g.fill(); g.fillStyle = '#8fa1aa'; }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return new THREE.MeshToonMaterial({ map: t, gradientMap: GRADIENT_3 });
  });
}

// Planar UVs in metres for a merged mesh in world space: each vertex projected along its face's main axis (walls on x or z,
// floors on y; roofs: u along the eave, v up the slope), divided by the tile's size.
export function worldUV(geo, [tu, tv], roof = false) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (roof) { if (ax > az) { u = z; v = x * Math.sign(n.getX(i)) * -1; } else { u = x; v = z * Math.sign(n.getZ(i)) * -1; } }
    else if (ay > 0.7) { u = x; v = z; }
    else if (ax > az) { u = z; v = y; }
    else { u = x; v = y; }
    uv.setXY(i, u / tu, v / tv);
  }
  uv.needsUpdate = true;
}
