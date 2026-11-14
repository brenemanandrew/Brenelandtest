// Dominoes, drawn our own way (table-games: Mexican Train's pieces): where the pips sit for 0 to 12, a colour per number like a
// real double-12 set, a tile as an SVG for the overlay, and one canvas atlas of the thirteen half-faces for the 3D tiles.
// Plain data and drawing, no game rules.

// one colour per number (0 has no pips): bright, told apart at a glance, dark enough on ivory
export const PIP = ['#000000', '#1f9fc4', '#2f9e44', '#e03131', '#8a5a2b', '#1c5fd6', '#d99a00', '#8e44c9', '#0b3d6b', '#c2255c', '#e8590c', '#2b2b2b', '#5c940d'];
export const IVORY = '#fbf6ea', IVORY_EDGE = '#d9cdb4', INK = '#2b2340', BACK = '#2f6b4f';
// each chair's colour round a table (the players strip, the rows, the little engines), and the Mexican Train's gold
export const SEAT_COLORS = ['#e0463c', '#3f8fd9', '#f2b630', '#4fa45a', '#b48cff', '#ff8fb8', '#f0862f', '#2fb5a8'];
export const MEX_COLOR = '#e3aa45';

// where the pips sit in a half (a 3 x 4 grid: columns 0..2, rows 0..3; up to 9 on the middle three rows' 3 x 3)
const G9 = { tl: [0, 0.5], tc: [1, 0.5], tr: [2, 0.5], ml: [0, 1.5], mc: [1, 1.5], mr: [2, 1.5], bl: [0, 2.5], bc: [1, 2.5], br: [2, 2.5] };
const SPOTS = {
  0: [], 1: ['mc'], 2: ['tl', 'br'], 3: ['tl', 'mc', 'br'], 4: ['tl', 'tr', 'bl', 'br'], 5: ['tl', 'tr', 'mc', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'], 7: ['tl', 'tr', 'ml', 'mc', 'mr', 'bl', 'br'], 8: ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br'],
  9: ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'],
};
// pip centres for n in a unit half (x, y in 0..1)
export function pipsAt(n) {
  if (n <= 9) return SPOTS[n].map(k => { const [c, r] = G9[k]; return [(c + 0.5) / 3, (r + 0.5) / 3]; });
  const all = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) all.push([(c + 0.5) / 3, (r + 0.5) / 4]);
  if (n === 12) return all;
  const drop = n === 11 ? [7] : [4, 7]; // 11: the middle of the third row out, 10: the middle two
  return all.filter((_, i) => !drop.includes(i));
}

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
// a tile as an SVG (a, b: the two numbers; vertical: a on top, else a on the left). Face down shows the back.
export function tileSvg(a, b, { vertical = false, down = false, cls = '' } = {}) {
  const W = vertical ? 50 : 100, H = vertical ? 100 : 50;
  const s = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'tg-tile ' + cls, 'aria-hidden': 'true' });
  s.append(svgEl('rect', { x: 1.5, y: 1.5, width: W - 3, height: H - 3, rx: 8, fill: down ? BACK : IVORY, stroke: INK, 'stroke-width': 3 }));
  if (down) { s.append(svgEl('rect', { x: 9, y: 9, width: W - 18, height: H - 18, rx: 4, fill: 'none', stroke: '#f3e3c3', 'stroke-width': 2, opacity: 0.6 })); return s; }
  s.append(vertical ? svgEl('line', { x1: 8, y1: 50, x2: 42, y2: 50, stroke: INK, 'stroke-width': 2.5, 'stroke-linecap': 'round' }) : svgEl('line', { x1: 50, y1: 8, x2: 50, y2: 42, stroke: INK, 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
  for (const [n, ox, oy] of [[a, 0, 0], [b, vertical ? 0 : 50, vertical ? 50 : 0]]) {
    const r = n >= 10 ? 4.2 : 5;
    for (const [px, py] of pipsAt(n)) s.append(svgEl('circle', { cx: ox + 7 + px * 36, cy: oy + 7 + py * 36, r, fill: PIP[n] }));
  }
  s.dataset.a = a; s.dataset.b = b;
  return s;
}

// ---- the 3D: one canvas, a strip of the thirteen half-faces (0..12) plus the back, each 128 x 128 px; uv(n) -> [u0, u1]
export const ATLAS_N = 14; // 0..12, then 13 = the back
export function faceAtlas() {
  const c = document.createElement('canvas'); c.width = 128 * ATLAS_N; c.height = 128;
  const g = c.getContext('2d');
  for (let n = 0; n < ATLAS_N; n++) {
    const x0 = n * 128;
    g.fillStyle = n === 13 ? BACK : IVORY; g.fillRect(x0, 0, 128, 128);
    if (n === 13) { g.strokeStyle = 'rgba(243,227,195,0.55)'; g.lineWidth = 6; g.strokeRect(x0 + 18, 18, 92, 92); continue; }
    const r = n >= 10 ? 10 : 12.5;
    for (const [px, py] of pipsAt(n)) { // (an inset domed pip: the dimple's rim, the colour, a glint)
      const cx = x0 + 16 + px * 96, cy = 16 + py * 96;
      g.fillStyle = '#d4c6a8'; g.beginPath(); g.arc(cx, cy, r * 1.22, 0, Math.PI * 2); g.fill();
      g.fillStyle = PIP[n]; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.arc(cx - r * 0.3, cy - r * 0.32, r * 0.32, 0, Math.PI * 2); g.fill();
    }
  }
  return c;
}
export const atlasU = n => [n / ATLAS_N + 0.002, (n + 1) / ATLAS_N - 0.002];
