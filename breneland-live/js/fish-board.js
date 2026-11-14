// The Fish Shack's leaderboard: a painted noticeboard on the shack's west wall with the top three fishers. The server
// ranks them (lib/fishing.js, fish-regions.js trophyPoints) and pushes { t: 'fishboard', top: [{ n, v, k, face }] }
// when the top three change. Each portrait is the fisher's own avatar, rendered once into a canvas. Nothing happens per
// frame, only a repaint when the top three (or a look) change. Plain fills only (no canvas filters).
import * as THREE from 'three';
import { Human, avatarLook } from './human.js';
import { redrawWhenFontsLoad } from './toon.js';
import { Batcher, GEO } from './batch.js';

const INK = '#2b2340';
const F = (w, px, fam = 'Fredoka') => `${w} ${px}px "${fam}", "Trebuchet MS", sans-serif`;
const MEDALS = [['#ffd23f', '#b8860b', '1'], ['#dfe6ec', '#8a96a3', '2'], ['#e8a165', '#9a5b2a', '3']];
const PORTRAIT = 192;   // px, square

// ------------------------------------------------------------------ portraits
let rt = null, scene = null, cam = null;
function portraitRig() {
  if (rt) return;
  rt = new THREE.WebGLRenderTarget(PORTRAIT, PORTRAIT, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;   // so the pixels read back are what the screen would show
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e6', '#8fa3b8', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 2.0); sun.position.set(1.2, 2, 2.4); scene.add(sun);
  cam = new THREE.PerspectiveCamera(24, 1, 0.05, 20);
  cam.layers.enableAll();   // the face and the soft bits live on other layers (toon.js soft)
}
const _c = new THREE.Vector3();
// One avatar's head and shoulders as a canvas (transparent round it). face = { color, hat, skin, look } (server.js cleanProfile).
export function renderPortrait(renderer, face) {
  portraitRig();
  const h = new Human(avatarLook(face || {}));
  scene.add(h.root);
  for (let i = 0; i < 4; i++) h.update(1 / 30, i / 30, 0, 'idle');   // settle the pose and the springs
  h.root.updateMatrixWorld(true);
  h.headC.getWorldPosition(_c);
  cam.position.set(_c.x + 0.6, _c.y + 0.16, _c.z + 2.5);
  cam.lookAt(_c.x, _c.y - 0.02, _c.z);
  const prevT = renderer.getRenderTarget(), prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevAuto = renderer.autoClear;
  const px = new Uint8Array(PORTRAIT * PORTRAIT * 4);
  try {
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.autoClear = true;
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, PORTRAIT, PORTRAIT, px);
  } finally {
    renderer.setRenderTarget(prevT); renderer.setClearColor(prevC, prevA); renderer.autoClear = prevAuto;
    scene.remove(h.root); h.dispose?.();
  }
  const c = document.createElement('canvas'); c.width = c.height = PORTRAIT;
  const g = c.getContext('2d'), img = g.createImageData(PORTRAIT, PORTRAIT);
  for (let y = 0; y < PORTRAIT; y++) img.data.set(px.subarray((PORTRAIT - 1 - y) * PORTRAIT * 4, (PORTRAIT - y) * PORTRAIT * 4), y * PORTRAIT * 4);   // GL rows are bottom-up
  g.putImageData(img, 0, 0);
  return c;
}

// ------------------------------------------------------------------ the board face
function round(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function fit(g, text, weight, px, maxW, min = 14) { let s = px; g.font = F(weight, s); while (g.measureText(text).width > maxW && s > min) { s -= 2; g.font = F(weight, s); } return s; }
function fishGlyph(g, x, y, s, col) {   // a little cartoon fish for the header
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = col; g.strokeStyle = INK; g.lineWidth = 3 / s * 1.2; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(-14, 0); g.lineTo(-26, -9); g.lineTo(-24, 0); g.lineTo(-26, 9); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(2, 0, 18, 10, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(10, -2, 3.4, 0, Math.PI * 2); g.fill();
  g.fillStyle = INK; g.beginPath(); g.arc(10.8, -2, 1.8, 0, Math.PI * 2); g.fill();
  g.restore();
}
// W x H px; rows = [{ n, v, k, pic }]
function paint(g, W, H, rows) {
  // painted boards, a dark frame, a blue header like the shack's sign
  g.fillStyle = '#d9c9a3'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(122, 82, 52, 0.18)'; for (let y = 0; y < H; y += 44) g.fillRect(0, y + 40, W, 4);
  g.fillStyle = '#2f5da8'; round(g, 18, 16, W - 36, 104, 18); g.fill();
  g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
  g.fillStyle = '#fff4dc'; g.textAlign = 'center'; g.textBaseline = 'middle';
  fit(g, 'TOP FISHERS', 700, 64, W - 200); g.fillText('TOP FISHERS', W / 2, 70);
  fishGlyph(g, 64, 68, 1.4, '#ffc933'); fishGlyph(g, W - 64, 68, -1.4, '#7fb85a');
  const top = 138, rowH = (H - top - 58) / 3;
  for (let i = 0; i < 3; i++) {
    const r = rows[i], y = top + i * rowH, cy = y + rowH / 2;
    g.fillStyle = i % 2 ? 'rgba(255, 250, 235, 0.55)' : 'rgba(255, 250, 235, 0.8)'; round(g, 18, y + 6, W - 36, rowH - 12, 18); g.fill();
    g.lineWidth = 4; g.strokeStyle = 'rgba(43, 35, 64, 0.5)'; g.stroke();
    // the medal
    const [mc, ml, num] = MEDALS[i];
    g.fillStyle = ml; g.beginPath(); g.arc(68, cy, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = mc; g.beginPath(); g.arc(68, cy, 28, 0, Math.PI * 2); g.fill();
    g.lineWidth = 5; g.strokeStyle = INK; g.beginPath(); g.arc(68, cy, 34, 0, Math.PI * 2); g.stroke();
    g.fillStyle = INK; g.font = F(700, 40); g.fillText(num, 68, cy + 2);
    // the portrait in a round frame (sky behind it)
    const px = 116, pr = rowH / 2 - 9, pcx = px + pr + 6;
    g.save(); g.beginPath(); g.arc(pcx, cy, pr, 0, Math.PI * 2); g.closePath();
    g.fillStyle = r ? '#bfe6f7' : '#e9dfc8'; g.fill(); g.clip();
    if (r && r.pic) g.drawImage(r.pic, pcx - pr * 1.08, cy - pr * 1.08, pr * 2.16, pr * 2.16);
    else { g.fillStyle = 'rgba(43, 35, 64, 0.3)'; g.font = F(700, pr * 1.2); g.fillText('?', pcx, cy + 4); }
    g.restore();
    g.lineWidth = 6; g.strokeStyle = INK; g.beginPath(); g.arc(pcx, cy, pr, 0, Math.PI * 2); g.stroke();
    // the name and the points
    const tx = pcx + pr + 22, tw = W - 36 - tx;
    g.textAlign = 'left'; g.fillStyle = INK;
    if (r) {
      fit(g, r.n, 700, 52, tw); g.fillText(r.n, tx, cy - 20);
      g.fillStyle = '#7a4a1e'; g.font = F(600, 32);
      g.fillText(`${r.v} points  ·  ${r.k} ${r.k === 1 ? 'kind' : 'kinds'}`, tx, cy + 28);
    } else { g.fillStyle = 'rgba(43, 35, 64, 0.55)'; g.font = F(700, 40); g.fillText('Be the first!', tx, cy); }
    g.textAlign = 'center';
  }
  g.fillStyle = '#5a3a20'; fit(g, 'Points for your biggest fish of every kind. Rare and big score more!', 600, 28, W - 60);
  g.fillText('Points for your biggest fish of every kind. Rare and big score more!', W / 2, H - 30);
}

// ------------------------------------------------------------------ the 3D board
// Builds the board on a wall that faces west (-x): `x` is the wall's outside face, (z) the board's middle along it, y0 the
// ground. Baked in world coordinates (weather-cover and prop-merge expect baked meshes at the origin). Returns the api.
export function buildFishBoard({ group, renderer, x, y0, z, w = 1.84, h = 1.5, lift = 0.95, frame = true }) {
  const W = 736, H = Math.round(W * h / w);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // the frame: a back plank, four rails and a little tin hood (out of the wall = toward -x)
  const b = new Batcher({ vertexColors: true });
  const WOOD = '#7a5234', DARK = '#5a3a20', z0 = z - w / 2, z1 = z + w / 2, yb = y0 + lift, yt = y0 + lift + h;
  b.boxMinMax(x - 0.05, yb - 0.08, z0 - 0.08, x, yt + 0.08, z1 + 0.08, DARK);
  b.boxMinMax(x - 0.12, yb - 0.12, z0 - 0.1, x - 0.05, yb - 0.02, z1 + 0.1, WOOD);
  b.boxMinMax(x - 0.12, yt + 0.02, z0 - 0.1, x - 0.05, yt + 0.12, z1 + 0.1, WOOD);
  b.boxMinMax(x - 0.12, yb - 0.02, z0 - 0.1, x - 0.05, yt + 0.02, z0, WOOD);
  b.boxMinMax(x - 0.12, yb - 0.02, z1, x - 0.05, yt + 0.02, z1 + 0.1, WOOD);
  b.add(GEO.box, '#5b6168', { x: x - 0.16, y: yt + 0.2, z, sx: 0.36, sy: 0.05, sz: w + 0.42, rz: 0.32 });   // the tin hood, sloping out and down
  if (frame) b.build(group, 'fish-board-frame');   // (fish-shack-setpiece: the Blender shack has its own window frame, ledge and hood round the face)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, fog: true }));
  face.position.set(x - 0.06, yb + h / 2, z); face.rotation.y = -Math.PI / 2; face.name = 'fish-board-face'; group.add(face);
  const pics = new Map();   // face key -> portrait canvas
  let rows = [], key = '';
  const draw = () => { paint(g, W, H, rows); tex.needsUpdate = true; };
  function set(top) {
    const list = Array.isArray(top) ? top.slice(0, 3) : [];
    const k = JSON.stringify(list);
    if (k === key) return false;
    key = k;
    rows = list.map(r => {
      const fk = JSON.stringify(r.face || null);
      let pic = pics.get(fk);
      if (pic === undefined) { try { pic = renderPortrait(renderer, r.face || { color: '#8fa3b8' }); } catch (e) { console.error('[fish-board] portrait', e); pic = null; } pics.set(fk, pic); }
      return { n: String(r.n || '').slice(0, 24), v: r.v | 0, k: r.k | 0, pic };
    });
    if (pics.size > 12) for (const fk of [...pics.keys()].slice(0, pics.size - 12)) pics.delete(fk);   // only recent looks
    draw();
    return true;
  }
  draw();
  redrawWhenFontsLoad(draw, [F(700, 64), F(600, 32)]);
  return { face, canvas, set, get rows() { return rows; }, get key() { return key; } };
}
