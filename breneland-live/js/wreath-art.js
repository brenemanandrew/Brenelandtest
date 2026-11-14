// How Carol's wreaths and signs look: a design from wreath-data.js turned into one vertex-coloured geometry (cached per
// design, so a wreath that hangs twice is drawn as instances of one mesh), a small 2D picture of it for the buy card, and
// one canvas atlas for every printed thing at the booth (the banner, the word plaques, the dog "Welcome" signs, the post's
// sign, the price card). Plain fills and strokes only: no 2D-canvas filter or shadowBlur (CONTRACTS.md: they crash Andrew's
// phone), small canvases. A wreath faces +z, centred on its middle, ring radius 0.3 m at scale 1.
import * as THREE from 'three';
import { Batcher, GEO } from './batch.js';
import { redrawWhenFontsLoad } from './toon.js';
import { DESIGNS, PALETTES, WORDS, BREEDS } from './wreath-data.js';
import { mulberry32 } from './util.js';

export const R = 0.3;
const TAU = Math.PI * 2;
const torus = (r, t, a = 4, b = 22) => new THREE.TorusGeometry(r, t, a, b);
const TORI = new Map();
const torusC = (r, t, a, b) => { const k = [r, t, a, b].join(); let g = TORI.get(k); if (!g) TORI.set(k, g = torus(r, t, a, b)); return g; };

// ------------------------------------------------------------------ the atlas (one 1024 x 512 canvas)
export const ATLAS = { w: 1024, h: 512 };
// cells in pixels [x, y, w, h]
export const CELLS = {
  banner: [0, 0, 512, 128], post: [512, 0, 256, 128], price: [768, 0, 256, 64], wood: [768, 64, 64, 64], silver: [832, 64, 64, 64], cloth: [896, 64, 64, 64], grid: [960, 64, 64, 64],
};
WORDS.forEach((w, i) => { CELLS['word' + i] = [(i % 2) * 256, 128 + Math.floor(i / 2) * 64, 256, 64]; });
BREEDS.forEach((b, i) => { CELLS['sign-' + b.id] = [512 + (i % 4) * 128, 128 + Math.floor(i / 4) * 128, 128, 128]; });
// a cell as UV corners (u0, v0) bottom-left and (u1, v1) top-right, for flipY textures
export function cellUV(name) { const [x, y, w, h] = CELLS[name]; return [x / ATLAS.w, 1 - (y + h) / ATLAS.h, (x + w) / ATLAS.w, 1 - y / ATLAS.h]; }

let atlasTex = null;
export function atlasTexture() {
  if (atlasTex) return atlasTex;
  const c = document.createElement('canvas'); c.width = ATLAS.w; c.height = ATLAS.h;
  const g = c.getContext('2d');
  atlasTex = new THREE.CanvasTexture(c);
  atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 4;
  const draw = () => { paintAtlas(g); atlasTex.needsUpdate = true; };
  draw();
  redrawWhenFontsLoad(draw, ['700 64px "Fredoka"', '500 30px "Fredoka"']);
  return atlasTex;
}
const FONT = (w, px) => `${w} ${px}px "Fredoka", "Trebuchet MS", sans-serif`;
function fitText(g, text, maxW, w, px) { let s = px; g.font = FONT(w, s); while (g.measureText(text).width > maxW && s > 10) { s -= 2; g.font = FONT(w, s); } return s; }

function paintAtlas(g) {
  g.clearRect(0, 0, ATLAS.w, ATLAS.h);
  // ---- the banner on the table's front: white vinyl, script-ish title, a splash of colour along the bottom
  {
    const [x, y, w, h] = CELLS.banner;
    g.fillStyle = '#fbfaf5'; g.fillRect(x, y, w, h);
    const bands = ['#e0463c', '#f0b33f', '#7ac143', '#3f8fd9', '#8e5bd0'];
    bands.forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.moveTo(x + i * w / 5, y + h); g.lineTo(x + (i + 1) * w / 5 + 30, y + h); g.lineTo(x + (i + 1) * w / 5 + 10, y + h - 26 - (i % 2) * 8); g.lineTo(x + i * w / 5 - 10, y + h - 20); g.closePath(); g.fill(); });
    g.fillStyle = '#7a2230'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, 'Wreaths by Mama Carol', w - 40, 700, 52); g.fillText('Wreaths by Mama Carol', x + w / 2, y + 46);
    g.fillStyle = '#3a3226'; fitText(g, 'Handmade with love', w - 80, 500, 26); g.fillText('Handmade with love', x + w / 2, y + 84);
    g.strokeStyle = '#d8d2c4'; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
  }
  // ---- the post's little sign
  {
    const [x, y, w, h] = CELLS.post;
    g.fillStyle = '#c9965a'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(90,55,25,0.25)'; for (let k = 10; k < h; k += 18) g.fillRect(x, y + k, w, 3);
    g.strokeStyle = '#6b4424'; g.lineWidth = 8; g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    g.fillStyle = '#3a2412'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, 'Mama Carol\'s spot', w - 30, 700, 34); g.fillText('Mama Carol\'s spot', x + w / 2, y + 44);
    fitText(g, 'back at 3:30', w - 40, 500, 30); g.fillText('back at 3:30', x + w / 2, y + 88);
  }
  // ---- the tripod's price card
  {
    const [x, y, w, h] = CELLS.price;
    g.fillStyle = '#fff6dc'; g.fillRect(x, y, w, h); g.strokeStyle = '#c8302c'; g.lineWidth = 5; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    g.fillStyle = '#2b2b2f'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, 'This wreath: 10 fish', w - 24, 700, 30); g.fillText('This wreath: 10 fish', x + w / 2, y + h / 2 + 1);
  }
  // ---- swatches (wood grain, the silver backdrop, black cloth, white grid) for the merged booth parts that use the atlas
  {
    let [x, y, w, h] = CELLS.wood; g.fillStyle = '#a8703c'; g.fillRect(x, y, w, h); g.fillStyle = '#8a5a2e'; for (let k = 4; k < h; k += 9) g.fillRect(x, y + k, w, 2);
    [x, y, w, h] = CELLS.silver; g.fillStyle = '#c9ccd2'; g.fillRect(x, y, w, h); g.fillStyle = '#e8eaee'; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(x + k * 12, y); g.lineTo(x + k * 12 + 18, y + h); g.lineTo(x + k * 12 + 24, y + h); g.lineTo(x + k * 12 + 6, y); g.fill(); }
    [x, y, w, h] = CELLS.cloth; g.fillStyle = '#1f1f24'; g.fillRect(x, y, w, h);
    [x, y, w, h] = CELLS.grid; g.fillStyle = '#f4f4f0'; g.fillRect(x, y, w, h);
  }
  // ---- the word plaques
  WORDS.forEach((word, i) => {
    const [x, y, w, h] = CELLS['word' + i];
    const halloween = word === 'BEWARE' || word === 'Boo!';
    g.fillStyle = halloween ? '#2b2340' : word === 'Game Day' ? '#2f7a3f' : '#fbf7ee'; g.fillRect(x, y, w, h);
    g.strokeStyle = halloween ? '#f07a1e' : '#7a5232'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (word === 'BEWARE') { // the photo's patchwork letters
      const cols = ['#f07a1e', '#7ac143', '#b48cff', '#f2c230', '#f07a1e', '#7ac143'];
      [...word].forEach((ch, k) => { const cx = x + 26 + k * 41; g.fillStyle = cols[k]; g.fillRect(cx - 18, y + 10, 36, 44); g.fillStyle = '#1f1f24'; g.font = FONT(700, 36); g.fillText(ch, cx, y + 33); });
      return;
    }
    g.fillStyle = halloween ? '#f07a1e' : word === 'Game Day' ? '#ffffff' : '#7a2230';
    fitText(g, word, w - 26, 700, 40); g.fillText(word, x + w / 2, y + h / 2 + 2);
  });
  // ---- the dog signs
  BREEDS.forEach(b => paintDogSign(g, CELLS['sign-' + b.id], b));
}

// A paw print (the "o" in Welcome)
function paw(g, x, y, s, col) {
  g.fillStyle = col;
  g.beginPath(); g.ellipse(x, y + s * 0.25, s * 0.42, s * 0.34, 0, 0, TAU); g.fill();
  for (const [dx, dy] of [[-0.42, -0.2], [-0.15, -0.45], [0.15, -0.45], [0.42, -0.2]]) { g.beginPath(); g.ellipse(x + dx * s, y + dy * s, s * 0.14, s * 0.18, 0, 0, TAU); g.fill(); }
}
function welcome(g, cx, y, px, col) {
  g.font = FONT(700, px); g.textBaseline = 'middle'; g.textAlign = 'left';
  const a = 'Welc', b = 'me', wa = g.measureText(a).width, wb = g.measureText(b).width, wo = px * 0.62;
  const x0 = cx - (wa + wo + wb) / 2;
  g.fillStyle = col; g.fillText(a, x0, y); paw(g, x0 + wa + wo / 2, y + px * 0.04, px * 0.42, col); g.fillStyle = col; g.fillText(b, x0 + wa + wo, y);
  g.textAlign = 'center';
}
function paintDogSign(g, [x, y, w, h], b) {
  const cx = x + w / 2, cy = y + h / 2, r = w / 2 - 2;
  g.clearRect(x, y, w, h);
  g.fillStyle = '#8a5a30'; g.fillRect(x, y, w, h);          // (the rim and back of the disc sample the edge)
  g.fillStyle = '#dca46a'; g.beginPath(); g.arc(cx, cy, r - 3, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(110,60,25,0.35)'; g.lineWidth = 2;
  for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(x + 8, cy + k * 15 + 3); g.bezierCurveTo(cx - 20, cy + k * 15 - 4, cx + 20, cy + k * 15 + 7, x + w - 8, cy + k * 15); g.stroke(); }
  const ink = '#1f1a17', line = cy + 10;
  g.fillStyle = ink; g.fillRect(x + 16, line, w - 32, 3);   // the line the dog peeks over
  // the dog, peeking over the line
  const head = (hx, hy, rx, ry, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(hx, hy, rx, ry, 0, 0, TAU); g.fill(); };
  const ear = (pts, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]); g.closePath(); g.fill(); };
  const eyes = (ex, ey, d, col = '#f4f2ea') => { g.fillStyle = col; for (const s of [-1, 1]) { g.beginPath(); g.arc(ex + s * d, ey, 2.6, 0, TAU); g.fill(); } };
  const hx = cx, hy = line - 16;
  switch (b.id) {
    case 'boston': ear([hx - 15, hy - 6, hx - 22, hy - 30, hx - 6, hy - 12], ink); ear([hx + 15, hy - 6, hx + 22, hy - 30, hx + 6, hy - 12], ink); head(hx, hy, 17, 15, ink); g.fillStyle = '#f4f2ea'; g.fillRect(hx - 3, hy - 14, 6, 26); head(hx, hy + 8, 9, 6, '#f4f2ea'); eyes(hx, hy - 3, 8); break;
    case 'frenchie': ear([hx - 13, hy - 8, hx - 20, hy - 30, hx - 3, hy - 14], '#5a5560'); ear([hx + 13, hy - 8, hx + 20, hy - 30, hx + 3, hy - 14], '#5a5560'); head(hx, hy, 18, 15, '#5a5560'); head(hx, hy + 6, 8, 5, ink); eyes(hx, hy - 3, 8); break;
    case 'dachshund': { // the long dog in profile, standing on the line
      g.fillStyle = ink; g.beginPath(); g.ellipse(hx, line - 9, 26, 8, 0, 0, TAU); g.fill();
      g.fillRect(hx - 22, line - 4, 4, 5); g.fillRect(hx + 18, line - 4, 4, 5);
      head(hx + 30, line - 17, 9, 7, ink); g.beginPath(); g.ellipse(hx + 37, line - 14, 6, 4, 0.3, 0, TAU); g.fill();
      ear([hx + 27, line - 21, hx + 22, line - 8, hx + 30, line - 12], '#2a2420'); g.fillStyle = '#c8302c'; g.beginPath(); g.arc(hx + 2, line - 10, 4, 0, TAU); g.fill();
      g.strokeStyle = ink; g.lineWidth = 3; g.beginPath(); g.moveTo(hx - 25, line - 11); g.lineTo(hx - 34, line - 18); g.stroke(); break;
    }
    case 'shepherd': ear([hx - 14, hy - 4, hx - 18, hy - 34, hx - 3, hy - 12], ink); ear([hx + 14, hy - 4, hx + 18, hy - 34, hx + 3, hy - 12], ink); head(hx, hy, 16, 15, '#8a5a2e'); head(hx, hy - 7, 12, 7, ink); head(hx, hy + 9, 7, 6, ink); g.fillStyle = '#e85a6a'; g.fillRect(hx - 3, hy + 13, 6, 7); eyes(hx, hy - 2, 7); break;
    case 'lab': head(hx, hy, 17, 15, ink); ear([hx - 15, hy - 10, hx - 24, hy + 6, hx - 14, hy + 10], '#0f0d0c'); ear([hx + 15, hy - 10, hx + 24, hy + 6, hx + 14, hy + 10], '#0f0d0c'); eyes(hx, hy - 3, 7, '#c9a35a'); break;
    case 'pug': head(hx, hy, 18, 15, '#d9b07a'); head(hx, hy + 5, 10, 7, ink); ear([hx - 15, hy - 11, hx - 23, hy - 3, hx - 12, hy - 4], ink); ear([hx + 15, hy - 11, hx + 23, hy - 3, hx + 12, hy - 4], ink); eyes(hx, hy - 4, 8, ink); break;
    case 'basset': head(hx, hy - 2, 14, 16, '#a8703c'); ear([hx - 12, hy - 12, hx - 24, hy + 14, hx - 13, hy + 14], '#5a3418'); ear([hx + 12, hy - 12, hx + 24, hy + 14, hx + 13, hy + 14], '#5a3418'); head(hx, hy + 9, 8, 6, ink); eyes(hx, hy - 5, 6, ink); break;
    case 'dax': { // Andrew's brindle lab: grey-fawn with darker stripes, soft drop ears, a pale muzzle
      head(hx, hy, 17, 15, '#8a6a4e');
      g.strokeStyle = '#4a3828'; g.lineWidth = 2; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(hx + k * 6 - 3, hy - 13); g.lineTo(hx + k * 6 + 2, hy + 4); g.stroke(); }
      ear([hx - 15, hy - 10, hx - 25, hy + 7, hx - 14, hy + 10], '#5a4432'); ear([hx + 15, hy - 10, hx + 25, hy + 7, hx + 14, hy + 10], '#5a4432');
      head(hx, hy + 7, 9, 6, '#c9b29a'); head(hx, hy + 4, 4, 3, ink); eyes(hx, hy - 4, 7, ink); break;
    }
    default: head(hx, hy, 16, 14, ink);
  }
  // the words under the line, and the check bow painted on top (a 3D bow sits over it too)
  if (b.caption[0] === 'Welcome') welcome(g, cx, line + 22, 22, ink);
  else { g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, b.caption[0], w - 30, 700, 18); g.fillText(b.caption[0], cx, line + 18); }
  if (b.caption[1]) { g.fillStyle = ink; fitText(g, b.caption[1], w - 34, 500, 12); g.fillText(b.caption[1], cx, line + 37); }
  if (b.id === 'dax') { g.fillStyle = '#7a2230'; fitText(g, 'Dax', 40, 700, 12); g.fillText('Dax', cx + 30, line - 6); }
}

// ------------------------------------------------------------------ the 3D wreath of a design
const GEOS = new Map();
// { geo (vertex colours, one material), plaque: { y, w, h, word } | null } for design id (cached)
export function wreathGeometry(id) {
  let e = GEOS.get(id);
  if (e) return e;
  const d = DESIGNS[id], pal = PALETTES[d.pal], rnd = mulberry32(1000 + id * 7919);
  const b = new Batcher({ vertexColors: true, castShadow: false });
  const at = (a, r = R) => [Math.cos(a) * r, Math.sin(a) * r];
  const ring = pal.ring;
  switch (d.base) {
    case 'grapevine':
      for (let k = 0; k < 3; k++) b.add(torusC(R + (k - 1) * 0.014, 0.03, 4, 22), ['#7a5232', '#8f6844', '#634226'][k], { rz: k * 0.7, rx: (k - 1) * 0.08 });
      for (let k = 0; k < 9; k++) { const a = rnd() * TAU, [x, y] = at(a, R + (rnd() - 0.5) * 0.05); b.add(GEO.box, '#5a3a22', { x, y, z: 0.02, sx: 0.12, sy: 0.012, sz: 0.012, rz: a + 1.2 + rnd() }); }
      break;
    case 'burlap':
      b.add(torusC(R, 0.05, 4, 18), '#b89a6a');
      for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU, [x, y] = at(a); b.add(GEO.ico0, k % 2 ? ring[0] : ring[1], { x, y, z: 0.03, sx: 0.09, sy: 0.075, sz: 0.055, rz: a }); }
      break;
    case 'mesh':
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU + rnd() * 0.1, [x, y] = at(a, R + (rnd() - 0.5) * 0.03); b.add(GEO.ico0, ring[k % 3], { x, y, z: 0.03, sx: 0.1, sy: 0.085, sz: 0.07, rz: a + rnd() }); }
      for (let k = 0; k < 8; k++) { const a = rnd() * TAU, [x, y] = at(a, R + 0.06); b.add(GEO.box, pal.acc[k % 3], { x, y, z: 0.06, sx: 0.07, sy: 0.018, sz: 0.01, rz: a + 0.8 }); }
      break;
    case 'evergreen':
      b.add(torusC(R, 0.06, 4, 20), '#24583a');
      for (let k = 0; k < 26; k++) { const a = (k / 26) * TAU, out = k % 2 ? 0.1 : 0.03, [x, y] = at(a, R + out * 0.6); b.add(GEO.cone6, k % 2 ? ring[0] : ring[1], { x, y, z: 0.02 + (k % 3) * 0.015, sx: 0.035, sy: 0.12, sz: 0.035, rz: a - Math.PI / 2, rx: 0.3 }); }
      break;
    case 'floral':
      b.add(torusC(R, 0.032, 4, 20), '#4f8a3a');
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU + 0.2, [x, y] = at(a, R + (k % 2 ? 0.04 : -0.04)); b.add(GEO.ico0, k % 2 ? '#5a9a45' : '#3f7a35', { x, y, z: 0.015, sx: 0.06, sy: 0.03, sz: 0.012, rz: a + 0.9 }); }
      break;
  }
  // accents, spread over the ring (the bow's spot, the bottom, is kept for it)
  const bowA = -Math.PI / 2 + 0.05;
  const slots = []; const total = d.acc.reduce((s, [, n]) => s + n, 0);
  for (let i = 0; i < total; i++) slots.push(bowA + 0.55 + (i / Math.max(1, total)) * (TAU - 1.1) + (rnd() - 0.5) * 0.15);
  let si = 0;
  for (const [kind, n] of d.acc) {
    for (let i = 0; i < n; i++) {
      const a = slots[si++], [x, y] = at(a), c = pal.acc[i % pal.acc.length];
      const z = 0.07;
      switch (kind) {
        case 'flower': b.add(GEO.cyl8, c, { x, y, z, sx: 0.05, sy: 0.012, sz: 0.05, rx: Math.PI / 2 }); b.add(GEO.ico0, '#f2c230', { x, y, z: z + 0.01, sx: 0.018, sy: 0.018, sz: 0.012 }); break;
        case 'sunflower': b.add(GEO.cyl12, '#f2b618', { x, y, z, sx: 0.075, sy: 0.012, sz: 0.075, rx: Math.PI / 2 }); b.add(GEO.cyl8, '#5a3a1e', { x, y, z: z + 0.01, sx: 0.034, sy: 0.014, sz: 0.034, rx: Math.PI / 2 }); break;
        case 'pumpkin': b.add(GEO.ico0, i % 2 && d.theme === 'halloween' ? '#f4f2ea' : '#f07a1e', { x, y, z, sx: 0.062, sy: 0.05, sz: 0.055 }); b.add(GEO.box, '#4f7a2a', { x, y: y + 0.05, z, sx: 0.012, sy: 0.03, sz: 0.012 }); break;
        case 'scarecrow': {
          const sx = 0, sy = -R + 0.02, zz = 0.09;
          b.add(GEO.box, '#c8302c', { x: sx, y: sy, z: zz, sx: 0.08, sy: 0.09, sz: 0.035 });
          b.add(GEO.box, '#f2c230', { x: sx, y: sy, z: zz + 0.02, sx: 0.08, sy: 0.015, sz: 0.01 });
          b.add(GEO.box, '#6b4a8f', { x: sx, y: sy - 0.07, z: zz, sx: 0.07, sy: 0.06, sz: 0.03 });
          b.add(GEO.box, '#c8302c', { x: sx, y: sy + 0.02, z: zz, sx: 0.16, sy: 0.022, sz: 0.022 });
          b.add(GEO.ico0, '#e8c48a', { x: sx, y: sy + 0.08, z: zz, sx: 0.04, sy: 0.042, sz: 0.035 });
          b.add(GEO.cone6, '#7a5232', { x: sx, y: sy + 0.135, z: zz, sx: 0.05, sy: 0.05, sz: 0.05 });
          b.add(GEO.cyl8, '#7a5232', { x: sx, y: sy + 0.11, z: zz, sx: 0.065, sy: 0.008, sz: 0.065 });
          break;
        }
        case 'ornament': b.add(GEO.ico0, c, { x, y, z, sx: 0.034, sy: 0.034, sz: 0.034 }); break;
        case 'pinecone': b.add(GEO.cone6, '#6b4a2b', { x, y, z, sx: 0.03, sy: 0.075, sz: 0.03, rz: Math.PI + a * 0.2 }); break;
        case 'leaf': b.add(GEO.box, ['#e07a2a', '#c8302c', '#f2c230'][i % 3], { x, y, z: 0.05, sx: 0.065, sy: 0.035, sz: 0.008, rz: a + 0.7 }); break;
        case 'football': b.add(GEO.ico0, '#7a4a2a', { x, y, z, sx: 0.075, sy: 0.045, sz: 0.045, rz: a }); b.add(GEO.box, '#ffffff', { x, y, z: z + 0.04, sx: 0.04, sy: 0.006, sz: 0.004, rz: a }); break;
        case 'star': b.add(GEO.ico0, i % 2 ? '#f4f2ea' : c, { x, y, z, sx: 0.035, sy: 0.035, sz: 0.012, rz: a }); break;
        case 'berry': for (let q = 0; q < 3; q++) b.add(GEO.ico0, '#c8302c', { x: x + (q - 1) * 0.02, y: y + (q % 2) * 0.018, z, sx: 0.016, sy: 0.016, sz: 0.016 }); break;
      }
    }
  }
  if (d.bigFlower) { b.add(GEO.cyl12, '#f2b618', { z: 0.05, sx: 0.17, sy: 0.02, sz: 0.17, rx: Math.PI / 2 }); b.add(GEO.cyl12, '#5a3a1e', { z: 0.065, sx: 0.08, sy: 0.02, sz: 0.08, rx: Math.PI / 2 }); }
  // the bow at the bottom (a check bow is a 2 x 2 chequer on each loop)
  if (d.bow) {
    const [bx, by] = at(bowA), bz = 0.1;
    if (d.bow === 'check') {
      for (const s of [-1, 1]) for (let q = 0; q < 4; q++) b.add(GEO.box, (q + (s > 0 ? 1 : 0)) % 2 ? '#1f1f24' : '#f4f2ea', { x: bx + s * (0.045 + (q % 2) * 0.04), y: by + 0.02 + Math.floor(q / 2) * 0.035 - 0.02, z: bz, sx: 0.04, sy: 0.035, sz: 0.02, rz: s * 0.25 });
      for (const s of [-1, 1]) for (let q = 0; q < 2; q++) b.add(GEO.box, q % 2 ? '#1f1f24' : '#f4f2ea', { x: bx + s * (0.03 + q * 0.015), y: by - 0.06 - q * 0.035, z: bz - 0.01, sx: 0.03, sy: 0.04, sz: 0.012, rz: s * 0.35 });
    } else {
      for (const s of [-1, 1]) b.add(GEO.ico0, pal.bow, { x: bx + s * 0.065, y: by + 0.012, z: bz, sx: 0.07, sy: 0.045, sz: 0.03, rz: s * 0.3 });
      for (const s of [-1, 1]) b.add(GEO.box, pal.bow, { x: bx + s * 0.035, y: by - 0.07, z: bz - 0.01, sx: 0.028, sy: 0.1, sz: 0.01, rz: s * 0.35 });
    }
    b.add(GEO.ico0, d.bow === 'check' ? '#1f1f24' : pal.bow, { x: bx, y: by + 0.01, z: bz + 0.01, sx: 0.03, sy: 0.03, sz: 0.025 });
  }
  let plaque = null;
  if (d.word !== null && d.word !== undefined) {
    const w = 0.3, h = 0.075;
    b.add(GEO.box, '#6b4424', { y: -0.02, z: 0.06, sx: w + 0.02, sy: h + 0.02, sz: 0.02 });
    plaque = { y: -0.02, z: 0.072, w, h, word: d.word };
  }
  const tmp = new THREE.Group();
  const meshes = b.build(tmp, 'wreath');
  const geo = meshes[0].geometry;
  geo.computeBoundingSphere();
  e = { geo, plaque, tris: geo.attributes.position.count / 3 };
  GEOS.set(id, e);
  return e;
}

// ------------------------------------------------------------------ a little picture of a design (the buy card)
export function wreathIcon(id, size = 160) {
  const d = DESIGNS[id], pal = PALETTES[d.pal];
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), cx = size / 2, cy = size / 2, r = size * 0.33, rnd = mulberry32(500 + id);
  const dot = (x, y, rr, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); };
  const base = { grapevine: ['#7a5232', '#8f6844', '#634226'], burlap: [pal.ring[0], pal.ring[1], '#b89a6a'], mesh: pal.ring, evergreen: [pal.ring[0], pal.ring[1], '#24583a'], floral: ['#4f8a3a', '#5a9a45', '#3f7a35'] }[d.base];
  g.lineWidth = size * 0.1; g.strokeStyle = base[2] || base[0]; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
  const n = d.base === 'grapevine' ? 40 : 18;
  for (let k = 0; k < n; k++) { const a = (k / n) * TAU + rnd() * 0.2, rr = r + (rnd() - 0.5) * size * 0.05; dot(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, size * (d.base === 'grapevine' ? 0.03 : 0.07), base[k % base.length]); }
  const total = d.acc.reduce((s, [, k]) => s + k, 0); let i = 0;
  for (const [kind, k] of d.acc) for (let q = 0; q < k; q++, i++) {
    const a = Math.PI / 2 + 0.55 + (i / Math.max(1, total)) * (TAU - 1.1), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; // canvas y is down: the bottom is +pi/2
    const col = pal.acc[q % pal.acc.length];
    if (kind === 'sunflower') { dot(x, y, size * 0.075, '#f2b618'); dot(x, y, size * 0.035, '#5a3a1e'); }
    else if (kind === 'pumpkin') dot(x, y, size * 0.06, '#f07a1e');
    else if (kind === 'flower') { for (let p = 0; p < 5; p++) dot(x + Math.cos(p * 1.26) * size * 0.03, y + Math.sin(p * 1.26) * size * 0.03, size * 0.025, col); dot(x, y, size * 0.018, '#f2c230'); }
    else if (kind === 'football') { g.fillStyle = '#7a4a2a'; g.beginPath(); g.ellipse(x, y, size * 0.07, size * 0.04, a, 0, TAU); g.fill(); }
    else if (kind === 'scarecrow') { dot(cx, cy + r, size * 0.06, '#c8302c'); dot(cx, cy + r - size * 0.07, size * 0.04, '#e8c48a'); }
    else dot(x, y, size * 0.03, kind === 'pinecone' ? '#6b4a2b' : col);
  }
  if (d.bigFlower) { dot(cx, cy, size * 0.17, '#f2b618'); dot(cx, cy, size * 0.08, '#5a3a1e'); }
  if (d.bow) { const by = cy + r, col = d.bow === 'check' ? '#1f1f24' : pal.bow; for (const s of [-1, 1]) { g.fillStyle = col; g.beginPath(); g.ellipse(cx + s * size * 0.06, by, size * 0.06, size * 0.04, s * 0.3, 0, TAU); g.fill(); } if (d.bow === 'check') { g.fillStyle = '#f4f2ea'; for (const s of [-1, 1]) g.fillRect(cx + s * size * 0.06 - size * 0.02, by - size * 0.02, size * 0.02, size * 0.02); } dot(cx, by, size * 0.025, col); }
  if (d.word !== null && d.word !== undefined) {
    g.fillStyle = '#fbf7ee'; g.fillRect(cx - size * 0.24, cy - size * 0.07, size * 0.48, size * 0.12); g.strokeStyle = '#6b4424'; g.lineWidth = 2; g.strokeRect(cx - size * 0.24, cy - size * 0.07, size * 0.48, size * 0.12);
    g.fillStyle = '#7a2230'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, WORDS[d.word], size * 0.44, 700, size * 0.085); g.fillText(WORDS[d.word], cx, cy - size * 0.01);
  }
  return c;
}
