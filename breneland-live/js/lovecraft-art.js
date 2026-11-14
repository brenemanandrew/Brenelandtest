// The Lovecraft house's printed things: Victorian wallpapers, the floorboards, the parlour rug, the portrait of Whipple Van Buren
// Phillips over the fireplace (Lovecraft's grandfather, who built 454 Angell Street), the star chart in the study, the brass plaque
// by the gate and the card on the Arkham table. Small canvases with plain fills and strokes only (no 2D-canvas filters or shadowBlur).
import * as THREE from 'three';
import { redrawWhenFontsLoad } from './toon.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

// A damask-ish repeat: a ground, a motif on a diamond lattice, a fine stripe. One tile = 0.8 m of wall.
export function wallpaper(bg, fg, stripe) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  if (stripe) { g.fillStyle = stripe; for (let x = 0; x < 128; x += 32) g.fillRect(x + 14, 0, 4, 128); }
  g.fillStyle = fg;
  const motif = (x, y, s) => {
    g.beginPath(); g.ellipse(x, y, 7 * s, 11 * s, 0, 0, Math.PI * 2); g.fill();
    for (const k of [-1, 1]) { g.beginPath(); g.ellipse(x + k * 9 * s, y + 4 * s, 5 * s, 3 * s, k * 0.6, 0, Math.PI * 2); g.fill(); }
    g.beginPath(); g.moveTo(x, y - 18 * s); g.lineTo(x + 4 * s, y - 11 * s); g.lineTo(x - 4 * s, y - 11 * s); g.closePath(); g.fill();
    g.fillRect(x - 1.5 * s, y + 10 * s, 3 * s, 8 * s);
  };
  for (const [x, y] of [[32, 32], [96, 96], [96, -32], [32, 160], [-32, 96], [160, 32]]) motif(x, y, stripe ? 0.75 : 1);
  return tex(c, true);
}

export function planks() {
  const [c, g] = canvas(256, 256);
  const tones = ['#6b4128', '#734630', '#5f3a24', '#7a4c31'];
  for (let i = 0; i < 8; i++) {
    g.fillStyle = tones[i % 4]; g.fillRect(0, i * 32, 256, 32);
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, i * 32, 256, 2);
    const off = (i * 97) % 256; g.fillRect(off, i * 32, 2, 32); g.fillRect((off + 140) % 256, i * 32, 2, 32);
    g.fillStyle = 'rgba(255,230,190,0.06)'; g.fillRect(0, i * 32 + 8, 256, 3);
  }
  return tex(c, true);
}

// The parlour rug: a deep red field, a navy border, a medallion
export function rug() {
  const [c, g] = canvas(256, 192);
  g.fillStyle = '#2a2f55'; g.fillRect(0, 0, 256, 192);
  g.fillStyle = '#e3c27a'; g.fillRect(10, 10, 236, 172);
  g.fillStyle = '#8e2430'; g.fillRect(16, 16, 224, 160);
  g.strokeStyle = '#e3c27a'; g.lineWidth = 3; g.strokeRect(28, 28, 200, 136);
  g.fillStyle = '#2a2f55'; g.beginPath(); g.ellipse(128, 96, 54, 38, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e3c27a'; g.beginPath(); g.ellipse(128, 96, 30, 20, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8e2430'; g.beginPath(); g.ellipse(128, 96, 14, 9, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d9a35a';
  for (const [x, y] of [[44, 44], [212, 44], [44, 148], [212, 148]]) { g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 9, y); g.lineTo(x, y + 9); g.lineTo(x - 9, y); g.closePath(); g.fill(); }
  for (let x = 20; x < 240; x += 12) { g.fillRect(x, 4, 5, 3); g.fillRect(x, 185, 5, 3); }
  return tex(c);
}

// Whipple Van Buren Phillips: a stern Victorian gentleman with white mutton chops and a black coat (the gilt frame is modelled,
// this is the canvas)
export function portrait() {
  const [c, g] = canvas(128, 160);
  const bgG = g.createLinearGradient(0, 0, 0, 160); bgG.addColorStop(0, '#4a3a2a'); bgG.addColorStop(1, '#1e1812');
  g.fillStyle = bgG; g.fillRect(0, 0, 128, 160);
  g.fillStyle = '#16141a'; g.beginPath(); g.moveTo(14, 160); g.quadraticCurveTo(20, 104, 64, 100); g.quadraticCurveTo(108, 104, 114, 160); g.closePath(); g.fill(); // coat
  g.fillStyle = '#efe8dc'; g.beginPath(); g.moveTo(54, 112); g.lineTo(64, 132); g.lineTo(74, 112); g.closePath(); g.fill(); // collar
  g.fillStyle = '#e8c4a0'; g.beginPath(); g.ellipse(64, 70, 22, 28, 0, 0, Math.PI * 2); g.fill(); // face
  g.fillStyle = '#f2efe8'; // white hair and whiskers
  g.beginPath(); g.ellipse(64, 48, 22, 10, 0, Math.PI, 0); g.fill();
  for (const k of [-1, 1]) { g.beginPath(); g.ellipse(64 + k * 20, 82, 9, 18, k * 0.25, 0, Math.PI * 2); g.fill(); }
  g.beginPath(); g.ellipse(64, 92, 16, 9, 0, 0, Math.PI); g.fill();
  g.fillStyle = '#2b2320'; for (const k of [-1, 1]) g.fillRect(64 + k * 9 - 3, 64, 6, 3); // eyes, stern
  g.fillRect(56, 58, 7, 2); g.fillRect(65, 58, 7, 2);
  g.fillStyle = '#c99a7a'; g.fillRect(62, 70, 4, 9); // nose
  return tex(c);
}

// The study's star chart (he loved astronomy)
export function starChart() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#1a2240'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#c9b77a'; g.lineWidth = 2; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1; g.beginPath(); g.arc(64, 64, 36, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(8, 64); g.lineTo(120, 64); g.moveTo(64, 8); g.lineTo(64, 120); g.stroke();
  g.fillStyle = '#fff4c8';
  const stars = [[40, 30], [52, 38], [66, 34], [78, 44], [90, 40], [30, 80], [44, 92], [58, 86], [84, 90], [96, 76], [70, 70], [48, 58]];
  for (const [x, y] of stars) { g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(255,244,200,0.6)'; g.beginPath(); g.moveTo(40, 30); g.lineTo(52, 38); g.lineTo(66, 34); g.lineTo(78, 44); g.lineTo(90, 40); g.moveTo(30, 80); g.lineTo(44, 92); g.lineTo(58, 86); g.stroke();
  return tex(c);
}

// A printed board with a few lines of text (the plaque, the table's card, the house number)
export function printed(lines, { w = 512, h = 256, bg = '#2a2530', fg = '#e8d9b0', sub = null, font = 'Special Elite', frame = null } = {}) {
  const [c, g] = canvas(w, h);
  const t = tex(c);
  const draw = () => {
    g.fillStyle = frame || bg; g.fillRect(0, 0, w, h);
    if (frame) { g.fillStyle = bg; g.fillRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const n = lines.length, step = h * 0.8 / n;
    lines.forEach((ln, i) => {
      let size = Math.round(i === 0 ? step * 0.78 : step * 0.6);
      const set = () => { g.font = `${i === 0 ? 700 : 500} ${size}px "${font}", Georgia, serif`; };
      set(); while (g.measureText(ln).width > w * 0.88 && size > 10) { size -= 2; set(); }
      g.fillStyle = i === 0 || !sub ? fg : sub;
      g.fillText(ln, w / 2, h * 0.1 + step * (i + 0.5));
    });
    t.needsUpdate = true;
  };
  draw(); redrawWhenFontsLoad(draw, [`700 40px "${font}"`, `500 30px "${font}"`]);
  return t;
}
