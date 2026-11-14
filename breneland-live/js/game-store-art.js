// The game store's printed things (game-store.js): one canvas atlas for the game box fronts, one for the posters, signs and the
// events chalkboard, and the window leaderboard. Plain fills only (no canvas filters or shadowBlur while the game loads). Each
// atlas is one texture, so every face cut from it joins one draw call.
import * as THREE from 'three';
import { redrawWhenFontsLoad } from './toon.js';

const F = (w, px, fam = 'Fredoka') => `${w} ${px}px "${fam}", "Trebuchet MS", sans-serif`;
const tex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
// fit a line in `maxW` (shrinking from `px`)
function fit(g, text, weight, px, maxW, fam, min = 10) { let s = px; g.font = F(weight, s, fam); while (g.measureText(text).width > maxW && s > min) { s -= 1; g.font = F(weight, s, fam); } return s; }
function round(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// An atlas of cells (cols x rows of `cell` px). `uv(i)` = [u0, v0, u1, v1] of cell i (v up, as three.js reads it).
function atlas(cols, rows, cell) {
  const c = document.createElement('canvas'); c.width = cols * cell; c.height = rows * cell;
  const g = c.getContext('2d');
  const uv = i => { const cx = i % cols, cy = Math.floor(i / cols); return [cx / cols, 1 - (cy + 1) / rows, (cx + 1) / cols, 1 - cy / rows]; };
  const at = i => [(i % cols) * cell, Math.floor(i / cols) * cell];
  return { c, g, uv, at, cell, tex: tex(c) };
}

// A plane w x h (facing +z) whose UVs cover the rectangle [u0, v0, u1, v1] of an atlas. Optional inset in UV units.
export function cellPlane(w, h, [u0, v0, u1, v1]) {
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
  return geo;
}

// ---- game boxes: the front of each box (name, a band, the footer) in its game's palette
const PAL = { arkham: ['#1f2a22', '#8fb08a', '#e8d9b0'], unicorns: ['#ff8fb8', '#ffffff', '#6fd3ff'], bookwyrm: ['#18202d', '#f3e3c3', '#e3aa45'], soon: ['#3f6fa8', '#fff4dc', '#f0c24f'] };
function drawBox(g, x0, y0, S, name, theme, foot) {
  const pal = PAL[theme] || PAL.soon;
  g.fillStyle = pal[0]; g.fillRect(x0, y0, S, S);
  g.fillStyle = pal[2];
  for (let i = 0; i < 9; i++) { g.globalAlpha = 0.18; g.beginPath(); g.arc(x0 + 30 + (i * 67) % 230, y0 + 40 + (i * 91) % 200, 18 + (i % 3) * 10, 0, 6.3); g.fill(); }
  g.globalAlpha = 1; g.fillStyle = pal[1]; g.fillRect(x0 + 16, y0 + 96, S - 32, 76);
  g.fillStyle = pal[0]; g.textAlign = 'center'; g.textBaseline = 'middle';
  fit(g, name, 700, 34, 210, 'Fredoka', 16); g.fillText(name, x0 + S / 2, y0 + 134);
  const sub = foot || (theme === 'soon' ? 'COMING SOON' : 'A BRENELAND GAME');
  fit(g, sub, 600, 16, 236, 'Nunito', 9); g.fillStyle = pal[2]; g.fillText(sub, x0 + S / 2, y0 + 215);
}
// items: [{ name, theme, foot }] -> { tex, uv(i) }
export function boxAtlas(items) {
  const cols = 4, rows = Math.max(1, Math.ceil(items.length / cols));
  const A = atlas(cols, rows, 256);
  const draw = () => { items.forEach((it, i) => { const [x, y] = A.at(i); drawBox(A.g, x, y, 256, it.name, it.theme, it.foot); }); A.tex.needsUpdate = true; };
  draw(); redrawWhenFontsLoad(draw, [F(700, 34), F(600, 16, 'Nunito')]);
  return { tex: A.tex, uv: A.uv };
}

// ---- posters, signs and the chalkboard: 4 x 4 cells of 256 px. Each entry draws itself into its cell; `cells` names them.
export const POSTERS = ['roll', 'meeple', 'unicorn', 'arkham', 'dragon', 'bookwyrm', 'staff', 'loft', 'events', 'events2', 'paint', 'puzzle', 'quiet', 'hours', 'dice', 'thanks'];
export function posterAtlas({ events = [], name = 'Breneland Games & Hobbies' } = {}) {
  const A = atlas(4, 4, 256), g = A.g, S = 256;
  const C = (i, bg, frame = '#2b2340') => { const [x, y] = A.at(i); g.fillStyle = frame; g.fillRect(x, y, S, S); g.fillStyle = bg; g.fillRect(x + 10, y + 10, S - 20, S - 20); return [x, y]; };
  const text = (x, y, t, w, px, col, fam = 'Fredoka', maxW = 220) => { g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; fit(g, t, w, px, maxW, fam, 10); g.fillText(t, x, y); };
  const meeple = (cx, cy, s, col) => {
    g.fillStyle = col; g.beginPath(); g.arc(cx, cy - 34 * s, 18 * s, 0, 6.3); g.fill();
    g.beginPath(); g.moveTo(cx - 14 * s, cy - 18 * s); g.lineTo(cx + 14 * s, cy - 18 * s); g.lineTo(cx + 44 * s, cy - 4 * s); g.lineTo(cx + 40 * s, cy + 8 * s);
    g.lineTo(cx + 16 * s, cy + 6 * s); g.lineTo(cx + 30 * s, cy + 44 * s); g.lineTo(cx + 6 * s, cy + 44 * s); g.lineTo(cx, cy + 26 * s); g.lineTo(cx - 6 * s, cy + 44 * s);
    g.lineTo(cx - 30 * s, cy + 44 * s); g.lineTo(cx - 16 * s, cy + 6 * s); g.lineTo(cx - 40 * s, cy + 8 * s); g.lineTo(cx - 44 * s, cy - 4 * s); g.closePath(); g.fill();
  };
  const die = (cx, cy, s, rot, bg, pip, n) => {
    g.save(); g.translate(cx, cy); g.rotate(rot); g.fillStyle = bg; round(g, -s, -s, 2 * s, 2 * s, s * 0.28); g.fill();
    g.lineWidth = 4; g.strokeStyle = '#2b2340'; g.stroke(); g.fillStyle = pip;
    const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[n];
    for (const [px, py] of P) { g.beginPath(); g.arc(px * s * 0.5, py * s * 0.5, s * 0.16, 0, 6.3); g.fill(); }
    g.restore();
  };
  const draw = () => {
    let x, y;
    // 0: roll for initiative (two dice)
    [x, y] = C(0, '#f0c24f'); die(x + 90, y + 110, 44, -0.3, '#ffffff', '#e0463c', 5); die(x + 170, y + 120, 40, 0.25, '#e0463c', '#ffffff', 6);
    text(x + 128, y + 205, 'ROLL FOR IT!', 700, 40, '#2b2340');
    // 1: meeple crossing (a road sign)
    [x, y] = C(1, '#7ddc7a', '#2f6b4f'); g.fillStyle = '#ffe14f'; g.save(); g.translate(x + 128, y + 108); g.rotate(Math.PI / 4); g.fillRect(-64, -64, 128, 128); g.lineWidth = 8; g.strokeStyle = '#2b2340'; g.strokeRect(-64, -64, 128, 128); g.restore();
    meeple(x + 128, y + 116, 1.1, '#2b2340'); text(x + 128, y + 222, 'MEEPLE CROSSING', 700, 30, '#ffffff');
    // 2: a unicorn party poster
    [x, y] = C(2, '#ff8fb8', '#ffffff');
    for (let i = 0; i < 6; i++) { g.fillStyle = ['#e0463c', '#f0b33f', '#ffe14f', '#7ddc7a', '#6fd3ff', '#b48cff'][i]; g.beginPath(); g.arc(x + 128, y + 150, 100 - i * 12, Math.PI, 0); g.lineTo(x + 128 + 88 - i * 12, y + 150); g.arc(x + 128, y + 150, 88 - i * 12, 0, Math.PI, true); g.closePath(); g.fill(); }
    text(x + 128, y + 60, 'UNSTABLE', 700, 40, '#ffffff'); text(x + 128, y + 200, 'UNICORNS', 700, 44, '#2b2340');
    // 3: Arkham (a lantern in the fog)
    [x, y] = C(3, '#1f2a22', '#8fb08a'); g.fillStyle = '#3a4a3c'; for (let i = 0; i < 5; i++) g.fillRect(x + 20 + i * 46, y + 150 - (i % 2) * 30, 30, 90);
    g.fillStyle = '#f0c24f'; g.beginPath(); g.arc(x + 128, y + 112, 26, 0, 6.3); g.fill(); g.fillStyle = '#fff4c4'; g.beginPath(); g.arc(x + 128, y + 112, 12, 0, 6.3); g.fill();
    text(x + 128, y + 44, 'ARKHAM HORROR', 700, 30, '#e8d9b0'); text(x + 128, y + 218, 'Lock your doors', 600, 22, '#8fb08a', 'Nunito');
    // 4: dragon (a green dragon on a scroll)
    [x, y] = C(4, '#f3e3c3', '#7a2140'); g.fillStyle = '#3fae5a'; g.beginPath(); g.ellipse(x + 128, y + 130, 62, 40, 0, 0, 6.3); g.fill();
    g.beginPath(); g.moveTo(x + 90, y + 110); g.lineTo(x + 40, y + 60); g.lineTo(x + 100, y + 90); g.fill(); g.beginPath(); g.moveTo(x + 166, y + 110); g.lineTo(x + 216, y + 60); g.lineTo(x + 156, y + 90); g.fill();
    g.beginPath(); g.arc(x + 186, y + 112, 22, 0, 6.3); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + 194, y + 106, 6, 0, 6.3); g.fill(); g.fillStyle = '#2b2340'; g.beginPath(); g.arc(x + 196, y + 106, 3, 0, 6.3); g.fill();
    text(x + 128, y + 205, 'HERE BE DRAGONS', 700, 30, '#7a2140');
    // 5: Bookwyrm
    [x, y] = C(5, '#18202d', '#e3aa45'); const SP = ['#7a2140', '#e3aa45', '#3f8fd9', '#7fb36a', '#e0564a', '#f3e3c3'];
    for (let i = 0; i < 9; i++) { g.fillStyle = SP[i % SP.length]; g.fillRect(x + 36 + i * 21, y + 80 + (i % 3) * 8, 17, 90 - (i % 3) * 8); }
    text(x + 128, y + 48, 'BOOKWYRM', 700, 44, '#e3aa45'); text(x + 128, y + 210, 'Mind the cat', 600, 24, '#f3e3c3', 'Nunito');
    // 6: STAFF ONLY (the stockroom door)
    [x, y] = C(6, '#ffffff', '#e0463c'); text(x + 128, y + 100, 'STAFF', 700, 64, '#e0463c'); text(x + 128, y + 165, 'ONLY', 700, 64, '#e0463c'); text(x + 128, y + 222, '(and the cat)', 600, 22, '#2b2340', 'Nunito');
    // 7: THE LOFT (on the loft's railing)
    [x, y] = C(7, '#2f6b4f', '#f3e3c3'); text(x + 128, y + 90, 'THE LOFT', 700, 54, '#fff4dc'); text(x + 128, y + 150, 'games library', 600, 28, '#ffe14f', 'Nunito'); text(x + 128, y + 190, 'painting . puzzles', 600, 26, '#ffe14f', 'Nunito');
    // 8 + 9: the events chalkboard, two halves side by side (one wide board)
    for (const [k, i] of [[0, 8], [1, 9]]) {
      [x, y] = A.at(i); g.fillStyle = '#8a6240'; g.fillRect(x, y, S, S); g.fillStyle = '#2e3b35'; g.fillRect(x + (k ? 0 : 12), y + 12, S - 12, S - 24);
      g.globalAlpha = 0.06; g.fillStyle = '#ffffff'; for (let j = 0; j < 4; j++) g.fillRect(x + 20 + j * 60, y + 18, 26, 220); g.globalAlpha = 1;
    }
    [x, y] = A.at(8);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = '#f4f1e6'; fit(g, 'THIS WEEK', 700, 40, 440); g.fillText('THIS WEEK', x + 34, y + 44);
    events.slice(0, 5).forEach(([day, what], i) => {
      const yy = y + 92 + i * 36, dw = day.length > 5 ? 190 : 96; // a long day ("Sun Tue Wed Sat") takes more room
      g.fillStyle = '#e9d98f'; fit(g, day, 700, 24, dw - 10); g.fillText(day, x + 34, yy);
      g.fillStyle = '#f4f1e6'; fit(g, what, 600, 24, 424 - dw, 'Nunito'); g.fillText(what, x + 34 + dw, yy);
    });
    // 10: paint night (the miniatures corner)
    [x, y] = C(10, '#b48cff'); for (let i = 0; i < 5; i++) { g.fillStyle = ['#e0463c', '#f0c24f', '#7ddc7a', '#3f8fd9', '#ffffff'][i]; g.beginPath(); g.arc(x + 48 + i * 40, y + 120, 16, 0, 6.3); g.fill(); }
    text(x + 128, y + 60, 'PAINT NIGHT', 700, 40, '#2b2340'); text(x + 128, y + 190, 'Thursdays upstairs', 600, 24, '#2b2340', 'Nunito');
    // 11: puzzle swap
    [x, y] = C(11, '#6fd3ff'); g.fillStyle = '#f0b33f'; g.fillRect(x + 70, y + 76, 50, 50); g.fillStyle = '#e0463c'; g.fillRect(x + 120, y + 76, 50, 50); g.fillStyle = '#7ddc7a'; g.fillRect(x + 70, y + 126, 50, 50); g.fillStyle = '#ffffff'; g.fillRect(x + 120, y + 126, 50, 50);
    g.fillStyle = '#6fd3ff'; g.beginPath(); g.arc(x + 145, y + 126, 9, 0, 6.3); g.fill();
    text(x + 128, y + 46, 'PUZZLE SWAP', 700, 38, '#2b2340'); text(x + 128, y + 212, 'Bring one, take one', 600, 24, '#2b2340', 'Nunito');
    // 12: shh (the library)
    [x, y] = C(12, '#fff4dc', '#2f6b4f'); text(x + 128, y + 100, 'Shh!', 700, 80, '#2f6b4f'); text(x + 128, y + 180, 'Strategy in progress', 600, 24, '#2b2340', 'Nunito');
    // 13: the hours (by the door): the shop 9 to 9, and the back room's late night in smaller gold
    [x, y] = C(13, '#2b2340', '#f0c24f'); text(x + 128, y + 70, 'OPEN 9 am to 9 pm', 700, 40, '#f0c24f', 'Fredoka', 232); text(x + 128, y + 132, 'every day', 600, 34, '#fff4dc', 'Nunito');
    text(x + 128, y + 196, 'D&D back room till midnight', 700, 26, '#f0c24f', 'Fredoka', 234);
    // 14: dice (for the boxes' backs and the shelves)
    [x, y] = C(14, '#3f8fd9', '#ffffff'); die(x + 80, y + 90, 36, 0.2, '#ffffff', '#3f8fd9', 3); die(x + 170, y + 110, 36, -0.4, '#f0c24f', '#2b2340', 4); die(x + 120, y + 180, 36, 0.1, '#e0463c', '#ffffff', 1);
    // 15: thanks for playing (over the stockroom door, inside)
    [x, y] = C(15, '#f0c24f', '#e0463c'); text(x + 128, y + 96, 'THANKS', 700, 52, '#e0463c'); text(x + 128, y + 150, 'FOR PLAYING!', 700, 38, '#2b2340'); meeple(x + 128, y + 210, 0.5, '#e0463c');
    A.tex.needsUpdate = true;
  };
  draw(); redrawWhenFontsLoad(draw, [F(700, 40), F(600, 24, 'Nunito')]);
  return { tex: A.tex, uv: i => A.uv(typeof i === 'number' ? i : POSTERS.indexOf(i)), uv2: (i, j) => { const a = A.uv(POSTERS.indexOf(i)), b = A.uv(POSTERS.indexOf(j)); return [a[0], a[1], b[2], b[3]]; } };
}

// ---- the window leaderboard: "Top players" for every game in the shop. rows: [{ name, label, top: [{ n, v }], color }]
// Redrawn only when the rows change (draw() returns false when nothing did).
export function leaderboard() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 576;
  const g = c.getContext('2d'), t = tex(c);
  let last = '', rows = [];
  const draw = () => {
    g.fillStyle = '#6b4a2b'; g.fillRect(0, 0, 1024, 576);      // the frame
    g.fillStyle = '#2e3b35'; g.fillRect(16, 16, 992, 544);     // a chalkboard
    g.globalAlpha = 0.05; g.fillStyle = '#ffffff'; for (let i = 0; i < 9; i++) g.fillRect(40 + i * 110, 24, 50, 528); g.globalAlpha = 1;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffe14f'; fit(g, 'HALL OF FAME', 700, 60, 600); g.fillText('HALL OF FAME', 512, 62);
    g.fillStyle = '#f4f1e6'; fit(g, 'top players in Breneland', 600, 26, 600, 'Nunito'); g.fillText('top players in Breneland', 512, 106);
    // up to six cards: three on a row
    const n = Math.min(6, rows.length), perRow = n > 4 ? 3 : Math.max(1, Math.min(n, 3)), lines = Math.ceil(n / perRow);
    const cw = 312, ch = lines > 1 ? 206 : 300, gap = 12, top = 132;
    rows.slice(0, n).forEach((r, i) => {
      const row = Math.floor(i / perRow), inRow = row === lines - 1 ? n - row * perRow : perRow, col = i - row * perRow;
      const x = 512 - (inRow * cw + (inRow - 1) * gap) / 2 + col * (cw + gap), y = top + row * (ch + gap);
      g.fillStyle = 'rgba(255,255,255,0.07)'; round(g, x, y, cw, ch, 16); g.fill();
      g.fillStyle = r.color || '#ffe14f'; round(g, x, y, cw, 46, 16); g.fill(); g.fillRect(x, y + 30, cw, 16);
      g.fillStyle = '#2b2340'; g.textAlign = 'center'; fit(g, r.name, 700, 30, cw - 24); g.fillText(r.name, x + cw / 2, y + 24);
      g.fillStyle = '#e9d98f'; fit(g, r.label, 600, 18, cw - 24, 'Nunito'); g.fillText(r.label, x + cw / 2, y + 62);
      if (!r.top.length) {
        g.fillStyle = '#f4f1e6'; fit(g, 'Be the first!', 700, 32, cw - 30); g.fillText('Be the first!', x + cw / 2, y + ch / 2 + 22);
        g.fillStyle = '#c9d6cf'; fit(g, r.empty || 'No scores yet', 600, 18, cw - 30, 'Nunito'); g.fillText(r.empty || 'No scores yet', x + cw / 2, y + ch / 2 + 56);
        return;
      }
      r.top.slice(0, 3).forEach((p, k) => {
        const yy = y + 100 + k * 40;
        g.fillStyle = ['#ffd54a', '#e3e7ea', '#e3a26a'][k]; g.beginPath(); g.arc(x + 30, yy, 15, 0, 6.3); g.fill();
        g.fillStyle = '#2b2340'; g.font = F(700, 20); g.textAlign = 'center'; g.fillText(String(k + 1), x + 30, yy + 1);
        g.fillStyle = '#f4f1e6'; g.textAlign = 'left'; fit(g, p.n, 700, 26, cw - 140); g.fillText(p.n, x + 54, yy);
        g.fillStyle = '#ffe14f'; g.textAlign = 'right'; fit(g, String(p.v), 700, 26, 84); g.fillText(String(p.v), x + cw - 16, yy);
      });
    });
    t.needsUpdate = true;
  };
  draw(); redrawWhenFontsLoad(draw, [F(700, 60), F(600, 26, 'Nunito')]);
  return {
    tex: t, canvas: c,
    get rows() { return rows; },
    set(next) { const k = JSON.stringify(next); if (k === last) return false; last = k; rows = next; draw(); return true; },
  };
}
