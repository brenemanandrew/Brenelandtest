// The D&D back room's printed things: one atlas for the posters, the DM screen and the credits, the gold lettering on the
// door's glass, and the battle mat (a grid until dnd.js swaps a module's map in). Plain fills only, no filters while the
// game loads. The serif is the device's own (Georgia / Times), so no font is fetched.
import * as THREE from 'three';
import { redrawWhenFontsLoad } from './toon.js';

const SERIF = 'Georgia, "Times New Roman", serif';
const F = (w, px, fam = SERIF) => `${w} ${px}px ${fam}`;
const tex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
function fit(g, text, weight, px, maxW, fam = SERIF, min = 9) { let s = px; g.font = F(weight, s, fam); while (g.measureText(text).width > maxW && s > min) { s -= 1; g.font = F(weight, s, fam); } return s; }
// wrap words into lines of at most maxW px at the current font
function wrap(g, text, maxW) {
  const out = []; let line = '';
  for (const w of String(text).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line);
  return out;
}
export const MDOT = ' ' + String.fromCharCode(183) + ' '; // a middle dot (built, not typed: CLAUDE.md on escapes)

// The SRD's required credit (CC BY 4.0), word for word as Wizards of the Coast asks for it.
export const SRD_CREDIT = 'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.';

// The atlas: 1024 x 1024, regions by pixel rectangle. uv(name) -> [u0, v0, u1, v1] (v up, as three.js reads it).
const R = {
  dragon: [0, 0, 256, 320], map: [256, 0, 384, 256], credits: [640, 0, 384, 704], screen: [0, 320, 640, 200],
  party: [256, 256, 384, 64], tuesday: [0, 520, 320, 184], spines: [320, 520, 320, 184],
};
export function backroomAtlas() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
  const g = c.getContext('2d'), T = tex(c);
  let credits = [];
  const text = (x, y, t, w, px, col, maxW, fam = SERIF, align = 'center') => { g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle'; fit(g, t, w, px, maxW, fam); g.fillText(t, x, y); };
  const frame = ([x, y, w, h], bg, fr = '#5a2a1a', b = 10) => { g.fillStyle = fr; g.fillRect(x, y, w, h); g.fillStyle = bg; g.fillRect(x + b, y + b, w - 2 * b, h - 2 * b); };
  const d20 = (cx, cy, r, col, ink = '#2b2340', num = '20') => {
    g.fillStyle = col; g.beginPath();
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    g.closePath(); g.fill(); g.lineWidth = Math.max(2, r * 0.08); g.strokeStyle = ink; g.stroke();
    g.beginPath(); for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 3; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a + Math.PI / 3) * r * 0.55, cy + Math.sin(a + Math.PI / 3) * r * 0.55); } g.closePath(); g.stroke();
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = F(700, r * 0.5); g.fillText(num, cx, cy + r * 0.05);
  };
  const draw = () => {
    g.clearRect(0, 0, 1024, 1024);
    // the red dragon over the mountains (poster, portrait)
    { const r = R.dragon, [x, y] = r; frame(r, '#f3e3c3', '#7a2140');
      g.fillStyle = '#8a9aa8'; g.beginPath(); g.moveTo(x + 10, y + 250); g.lineTo(x + 70, y + 160); g.lineTo(x + 120, y + 220); g.lineTo(x + 180, y + 140); g.lineTo(x + 246, y + 250); g.closePath(); g.fill();
      g.fillStyle = '#c0392b'; g.beginPath(); g.ellipse(x + 128, y + 120, 54, 26, -0.2, 0, 6.3); g.fill();
      g.beginPath(); g.moveTo(x + 110, y + 104); g.lineTo(x + 40, y + 40); g.lineTo(x + 70, y + 110); g.fill();
      g.beginPath(); g.moveTo(x + 140, y + 100); g.lineTo(x + 200, y + 30); g.lineTo(x + 170, y + 106); g.fill();
      g.beginPath(); g.moveTo(x + 176, y + 110); g.quadraticCurveTo(x + 210, y + 96, x + 214, y + 76); g.lineTo(x + 196, y + 118); g.fill(); // the neck and head
      g.fillStyle = '#ffb347'; g.beginPath(); g.moveTo(x + 214, y + 78); g.lineTo(x + 246, y + 60); g.lineTo(x + 236, y + 90); g.closePath(); g.fill(); // fire
      g.fillStyle = '#c0392b'; g.beginPath(); g.moveTo(x + 80, y + 126); g.quadraticCurveTo(x + 40, y + 150, x + 30, y + 120); g.lineTo(x + 84, y + 136); g.fill(); // the tail
      text(x + 128, y + 282, 'BEWARE THE DRAGON', 700, 26, '#7a2140', 220);
    }
    // a world map (poster, landscape): coasts, a forest, a road with a dotted path, an X
    { const r = R.map, [x, y, w, h] = r; frame(r, '#ead7a8', '#6b4a2b', 8);
      g.fillStyle = '#9fc7d6'; g.fillRect(x + 8, y + 8, w - 16, h - 16);
      g.fillStyle = '#ead7a8'; g.beginPath(); g.moveTo(x + 40, y + 30); g.bezierCurveTo(x + 160, y + 10, x + 300, y + 40, x + 350, y + 70); g.bezierCurveTo(x + 370, y + 150, x + 320, y + 230, x + 200, y + 236); g.bezierCurveTo(x + 90, y + 230, x + 20, y + 170, x + 40, y + 30); g.fill();
      g.fillStyle = '#5f8f4a'; for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(x + 90 + (i % 5) * 18, y + 80 + Math.floor(i / 5) * 18, 9, 0, 6.3); g.fill(); }
      g.fillStyle = '#8a7a6a'; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x + 230 + i * 26, y + 120); g.lineTo(x + 243 + i * 26, y + 92); g.lineTo(x + 256 + i * 26, y + 120); g.fill(); }
      g.strokeStyle = '#7a2140'; g.lineWidth = 4; g.setLineDash([8, 7]); g.beginPath(); g.moveTo(x + 70, y + 190); g.bezierCurveTo(x + 150, y + 150, x + 200, y + 200, x + 280, y + 170); g.stroke(); g.setLineDash([]);
      g.lineWidth = 6; g.beginPath(); g.moveTo(x + 272, y + 160); g.lineTo(x + 292, y + 180); g.moveTo(x + 292, y + 160); g.lineTo(x + 272, y + 180); g.stroke();
      text(x + w / 2, y + 30, 'THE REALM', 700, 24, '#5a2a1a', 200);
    }
    // the party strip over the door inside: "Adventurers welcome"
    { const r = R.party, [x, y, w, h] = r; frame(r, '#7a2140', '#e3b04a', 5); text(x + w / 2, y + h / 2 + 1, 'ADVENTURERS WELCOME', 700, 32, '#f6d77a', w - 30); }
    // the DM screen's three panels (one strip, each panel a third): a castle, a d20, a dragon's eye on wine with gold
    { const r = R.screen, [x, y, w, h] = r; const pw = w / 3;
      for (let i = 0; i < 3; i++) { frame([x + i * pw, y, pw, h], '#7a2140', '#e3b04a', 7); }
      g.fillStyle = '#e3b04a';
      g.fillRect(x + 60, y + 90, 100, 70); for (let i = 0; i < 5; i++) g.fillRect(x + 60 + i * 22, y + 76, 12, 16); g.fillRect(x + 90, y + 50, 40, 44); g.fillStyle = '#7a2140'; g.fillRect(x + 100, y + 120, 20, 40);
      d20(x + pw * 1.5, y + h / 2, 62, '#e3b04a', '#7a2140');
      g.fillStyle = '#e3b04a'; g.beginPath(); g.ellipse(x + pw * 2.5, y + h / 2, 70, 38, 0, 0, 6.3); g.fill(); g.fillStyle = '#7a2140'; g.beginPath(); g.ellipse(x + pw * 2.5, y + h / 2, 12, 34, 0, 0, 6.3); g.fill();
      text(x + pw * 0.5, y + 178, 'THE REALM', 700, 20, '#f6d77a', pw - 30); text(x + pw * 1.5, y + 22, 'DUNGEON MASTER', 700, 20, '#f6d77a', pw - 30); text(x + pw * 2.5, y + 178, 'ROLL WELL', 700, 20, '#f6d77a', pw - 30);
    }
    // the events card: D&D night on Tuesdays
    { const r = R.tuesday, [x, y, w, h] = r; frame(r, '#1d1b2e', '#e3b04a', 8); d20(x + 54, y + h / 2, 34, '#c0392b', '#f6d77a');
      text(x + 196, y + 60, 'D&D NIGHT', 700, 40, '#f6d77a', 200); text(x + 196, y + 108, 'TUESDAYS', 700, 30, '#ffffff', 200); text(x + 196, y + 148, 'in the back room', 600, 22, '#e3c9a0', 200);
    }
    // rulebook spines (for the shelves' printed faces)
    { const [x, y, w, h] = R.spines; const C = ['#7a2140', '#2b3a4e', '#2f6b4f', '#5a2a1a', '#3f3a6e', '#8a3b12'];
      for (let i = 0; i < 8; i++) { const sx = x + i * (w / 8); g.fillStyle = C[i % C.length]; g.fillRect(sx, y, w / 8 - 2, h); g.fillStyle = '#e3b04a'; g.fillRect(sx + 4, y + 18, w / 8 - 10, 4); g.fillRect(sx + 4, y + h - 22, w / 8 - 10, 4);
        g.save(); g.translate(sx + w / 16, y + h / 2); g.rotate(-Math.PI / 2); g.fillStyle = '#f6d77a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = F(700, 16); g.fillText(['PLAYER', 'MONSTERS', 'MASTER', 'BESTIARY', 'SPELLS', 'TALES', 'MAPS', 'LORE'][i], 0, 0); g.restore(); }
    }
    // the credits poster: the SRD, then each module with its rating line and attribution
    { const r = R.credits, [x, y, w, h] = r; frame(r, '#f3e3c3', '#5a2a1a', 12);
      text(x + w / 2, y + 44, 'D&D NIGHT CREDITS', 700, 30, '#7a2140', w - 40);
      g.fillStyle = '#e3b04a'; g.fillRect(x + 40, y + 66, w - 80, 3);
      let yy = y + 92;
      const para = (t, px, col, weight = 500) => { g.fillStyle = col; g.textAlign = 'left'; g.textBaseline = 'top'; g.font = F(weight, px); for (const ln of wrap(g, t, w - 56)) { if (yy > y + h - 30) return; g.fillText(ln, x + 28, yy); yy += px * 1.22; } yy += 6; };
      para('Rules: the 5e System Reference Document 5.1', 16, '#2b2340', 700);
      para(SRD_CREDIT, 12, '#3a3226');
      for (const m of credits) {
        para(m.title + MDOT + m.rating, 16, '#7a2140', 700);
        if (m.contentNotes) para('Content: ' + m.contentNotes, 12, '#3a3226');
        para(m.attribution, 12, '#3a3226');
      }
      para('Our own one-shot, The Lantern at Mossbrook, is by Breneland. The DM is Claude (Anthropic), unless Andrew takes the chair.', 12, '#3a3226');
    }
    T.needsUpdate = true;
  };
  draw(); redrawWhenFontsLoad(draw, [F(700, 30, '"Fredoka"')]);
  const uv = name => { const [x, y, w, h] = R[name]; return [x / 1024, 1 - (y + h) / 1024, (x + w) / 1024, 1 - y / 1024]; };
  return { tex: T, uv, aspect: name => R[name][2] / R[name][3], setCredits(list) { credits = Array.isArray(list) ? list : []; draw(); }, get credits() { return credits; } };
}

// The gold lettering on the door's glass ("D&D NIGHT · TUESDAYS"): a transparent canvas (the shop shows through around it).
export function doorLettering(day = 'TUESDAYS') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d'), T = tex(c);
  const draw = () => {
    g.clearRect(0, 0, 512, 256);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const gold = (t, y, px) => { fit(g, t, 700, px, 470); g.lineWidth = 7; g.strokeStyle = '#3a1f0a'; g.strokeText(t, 256, y); g.fillStyle = '#f2c14e'; g.fillText(t, 256, y); g.fillStyle = '#fff1b8'; g.globalAlpha = 0.35; g.fillText(t, 256, y - 2); g.globalAlpha = 1; };
    gold('D&D NIGHT', 92, 92);
    g.fillStyle = '#f2c14e'; g.fillRect(96, 146, 320, 5);
    gold(day, 196, 58);
    T.needsUpdate = true;
  };
  draw(); redrawWhenFontsLoad(draw, [F(700, 92)]);
  return { tex: T, set(d) { day = d; draw(); } };
}

// The battle mat on the table: a green grid with a compass rose (until a map is chosen) - 1024 x 512.
export function battleMat() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d'), T = tex(c);
  g.fillStyle = '#3d6b4a'; g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 2;
  for (let x = 0; x <= 1024; x += 512 / 10) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
  for (let y = 0; y <= 512; y += 512 / 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.moveTo(512, 196); g.lineTo(530, 256); g.lineTo(512, 316); g.lineTo(494, 256); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = F(700, 28); g.textAlign = 'center'; g.fillText('N', 512, 184);
  T.needsUpdate = true;
  return T;
}
