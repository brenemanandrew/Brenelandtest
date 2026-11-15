// The Missing Pie's part of the table-game overlay (game-waves SPEC section 3). The board region is the town map (paths with
// their steps, the nine places as little buildings, the pawns, the places in reach glowing after a roll: tap one to walk
// there), or your detective notebook (tap a square to mark it; what is certain is filled in for you), or the Ask / Solve picker.
// The hand region holds your cards; when someone asks you and you hold more than one of their three, the matching cards
// light up: tap the one to show. Everything reads only the view the server sent (yours, or the public one).
import { el } from '../util.js';
import { SEAT_COLORS } from './dominoes.js';
import { LOOK } from './tg-state.js';

const INK = '#2b2340';
const S = `stroke="${INK}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"`;
const svg = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;

// ---- the cards: ids as the engine has them, names and pictures here (all static markup)
const face = (col, extra = '', skin = '#ffd9b3') => svg(`<circle cx="12" cy="13.5" r="7.5" fill="${skin}" ${S}/><circle cx="9.4" cy="13" r="1.1" fill="${INK}"/><circle cx="14.6" cy="13" r="1.1" fill="${INK}"/><path d="M9.5 16.4c1.4 1.2 3.6 1.2 5 0" fill="none" ${S}/>${extra}<circle cx="12" cy="13.5" r="10.6" fill="none" stroke="${col}" stroke-width="2.2"/>`);
export const WHO = [
  { id: 'pudding', name: 'Mayor Pudding', short: 'Pudding', col: '#e0463c', line: 'Cuts every ribbon in town, and most of the cakes.',
    icon: face('#e0463c', `<rect x="8" y="1.5" width="8" height="5.5" rx="1" fill="${INK}"/><rect x="5.5" y="6.4" width="13" height="2" rx="1" fill="${INK}"/><rect x="8" y="5" width="8" height="1.2" fill="#e0463c"/>`) },
  { id: 'sprocket', name: 'Coach Sprocket', short: 'Sprocket', col: '#3f8fd9', line: 'Blows the whistle at breakfast and never stops jogging.',
    icon: face('#3f8fd9', `<path d="M5 9.5c0-4 3-6.5 7-6.5s7 2.5 7 6.5z" fill="#3f8fd9" ${S}/><path d="M17 9.5h4" ${S} stroke-width="2.4"/><circle cx="16.5" cy="19.6" r="1.4" fill="#ffd34d" ${S}/>`) },
  { id: 'fig', name: 'Granny Fig', short: 'Fig', col: '#b48cff', line: 'Knits faster than you can run. Big sweet tooth.',
    icon: face('#b48cff', `<circle cx="12" cy="4.6" r="3" fill="#e8e4f0" ${S}/><path d="M4.8 11c1-4 4-5.4 7.2-5.4S18.2 7 19.2 11" fill="#e8e4f0" ${S}/><circle cx="9.4" cy="13" r="2.2" fill="none" ${S}/><circle cx="14.6" cy="13" r="2.2" fill="none" ${S}/>`) },
  { id: 'quill', name: 'Professor Quill', short: 'Quill', col: '#4fa45a', line: 'Knows a fact about everything, especially pie.',
    icon: face('#4fa45a', `<path d="M3.5 6.5L12 3l8.5 3.5L12 10z" fill="${INK}"/><path d="M19 7v5" ${S}/><circle cx="19" cy="12.5" r="1.1" fill="#ffd34d" ${S}/>`) },
  { id: 'brine', name: 'Captain Brine', short: 'Brine', col: '#f0862f', line: 'Sails round the Fountain in a teacup boat.',
    icon: face('#f0862f', `<path d="M4.5 9c1-3.5 4-5 7.5-5s6.5 1.5 7.5 5z" fill="#fff8ec" ${S}/><rect x="4" y="8.3" width="16" height="2.2" rx="1" fill="#2c5aa0" ${S}/><path d="M6 15c1 5 11 5 12 0-2 1.6-10 1.6-12 0z" fill="#e8e0d0" ${S}/>`) },
  { id: 'marmalade', name: 'DJ Marmalade', short: 'Marmalade', col: '#ff8fb8', line: 'Plays the loudest tunes at the Bus Stop.',
    icon: face('#ff8fb8', `<path d="M4.5 13a7.5 7.5 0 0 1 15 0" fill="none" ${S} stroke-width="2.2"/><rect x="2.8" y="11.5" width="3.6" height="5.5" rx="1.5" fill="#ff8fb8" ${S}/><rect x="17.6" y="11.5" width="3.6" height="5.5" rx="1.5" fill="#ff8fb8" ${S}/>`) },
];
export const WHAT = [
  { id: 'basket', name: 'Picnic Basket', short: 'Basket', icon: svg(`<path d="M7 10a5 5 0 0 1 10 0" fill="none" ${S} stroke-width="2.2"/><path d="M3.5 10h17l-2 10h-13z" fill="#d9a35b" ${S}/><path d="M6 13.5h12M6.8 17h10.4M10 10.5l-.6 9M14 10.5l.6 9" fill="none" stroke="#e0463c" stroke-width="1.4"/>`) },
  { id: 'net', name: 'Fishing Net', short: 'Net', icon: svg(`<path d="M3 21l7-7" ${S} stroke-width="2.6"/><circle cx="14.5" cy="9.5" r="6.5" fill="#cfe8f0" ${S}/><path d="M10 7l9 5M10.5 12.5l8-6M12 4l2.5 12M16.5 3.5l-3 12" fill="none" stroke="${INK}" stroke-width="0.9"/>`) },
  { id: 'barrow', name: 'Wheelbarrow', short: 'Barrow', icon: svg(`<path d="M3 9h13l-2.5 6.5H6z" fill="#4fa45a" ${S}/><path d="M16 9l5-2.5M6.5 15.5L5 20M13 15.5l1.5 2" fill="none" ${S}/><circle cx="16" cy="19" r="2.5" fill="#fff8ec" ${S}/>`) },
  { id: 'kite', name: 'Kite', short: 'Kite', icon: svg(`<path d="M13 2l6 7-6 9-6-9z" fill="#ffd34d" ${S}/><path d="M13 2v16M7 9h12" stroke="${INK}" stroke-width="1.2"/><path d="M13 18c-2 2-1 3-3 4M10.5 20l1.5-.5M9 22.2l1.6.2" fill="none" ${S}/><path d="M13 2l6 7h-6z" fill="#e0463c"/>`) },
  { id: 'lunchbox', name: 'Lunchbox', short: 'Lunchbox', icon: svg(`<path d="M9 7V5h6v2" fill="none" ${S} stroke-width="2.2"/><rect x="3.5" y="7" width="17" height="12" rx="2.5" fill="#3f8fd9" ${S}/><path d="M3.5 11.5h17" stroke="${INK}" stroke-width="1.6"/><rect x="10" y="10" width="4" height="3" rx="1" fill="#ffd34d" ${S}/>`) },
  { id: 'umbrella', name: 'Umbrella', short: 'Umbrella', icon: svg(`<path d="M2.5 12a9.5 8 0 0 1 19 0c-1.6-1.4-3.2-1.4-4.8 0-1.6-1.4-3.2-1.4-4.7 0-1.6-1.4-3.2-1.4-4.8 0-1.6-1.4-3.1-1.4-4.7 0z" fill="#b48cff" ${S}/><path d="M12 12v7.5a2 2 0 0 1-4 0" fill="none" ${S} stroke-width="2"/>`) },
];
export const WHERE = [
  { id: 'games', name: 'Game Store', short: 'Game Store', roof: '#e0463c', icon: svg(`<rect x="3" y="9" width="18" height="12" fill="#fff1d6" ${S}/><path d="M2 9l2-5h16l2 5z" fill="#e0463c" ${S}/><path d="M5 4.2v4.6M9 4v5M13 4v5M17 4v5" stroke="#fff8ec" stroke-width="1.2"/><rect x="5" y="12" width="6" height="9" fill="#9a6538" ${S}/><rect x="13" y="12" width="6" height="5" rx="1" fill="#fff8ec" ${S}/><circle cx="15" cy="13.8" r=".8" fill="${INK}"/><circle cx="17" cy="15.4" r=".8" fill="${INK}"/>`) },
  { id: 'fish', name: 'Fish Shack', short: 'Fish Shack', roof: '#3f8fd9', icon: svg(`<rect x="4" y="10" width="16" height="11" fill="#d9a35b" ${S}/><path d="M2.5 10.5L12 3l9.5 7.5z" fill="#3f8fd9" ${S}/><path d="M4 14h16M4 17.5h16" stroke="${INK}" stroke-width="0.9"/><path d="M8 12.5c2-2 5-2 7 0-2 2-5 2-7 0zM15 12.5l2-1.5v3z" fill="#f0862f" ${S}/>`) },
  { id: 'post', name: 'Post Office', short: 'Post Office', roof: '#4fa45a', icon: svg(`<rect x="3" y="8" width="18" height="13" fill="#fff1d6" ${S}/><path d="M2 8.5L12 3l10 5.5z" fill="#4fa45a" ${S}/><rect x="6" y="11" width="12" height="7.5" rx="1" fill="#fff8ec" ${S}/><path d="M6.3 11.4L12 15.5l5.7-4.1" fill="none" ${S}/>`) },
  { id: 'crib', name: 'Tool Crib', short: 'Tool Crib', roof: '#6e4224', icon: svg(`<rect x="3.5" y="9" width="17" height="12" fill="#c98b52" ${S}/><path d="M2 9.5L12 4l10 5.5z" fill="#6e4224" ${S}/><path d="M8.5 19l6-6" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><circle cx="15.5" cy="12" r="2.6" fill="none" ${S} stroke-width="2.2"/>`) },
  { id: 'tower', name: 'Water Tower', short: 'Water Tower', roof: '#2fb5a8', icon: svg(`<path d="M7 13l-2 9M17 13l2 9M7.5 17.5h9" fill="none" ${S}/><rect x="4.5" y="5" width="15" height="8.5" rx="2" fill="#2fb5a8" ${S}/><path d="M4.5 5.5L12 1.5l7.5 4z" fill="#1f7f77" ${S}/><path d="M8 9.5c1.3-1 2.7 1 4 0s2.7 1 4 0" fill="none" stroke="#fff8ec" stroke-width="1.3" stroke-linecap="round"/>`) },
  { id: 'fountain', name: 'Fountain', short: 'Fountain', roof: '#7fc7ef', icon: svg(`<path d="M3 17h18l-2 4H5z" fill="#cfc6b8" ${S}/><path d="M3 17c3-1.5 15-1.5 18 0" fill="#7fc7ef" ${S}/><rect x="11" y="10" width="2" height="6.5" fill="#cfc6b8" ${S}/><path d="M12 10c0-4-4-5-6-3M12 10c0-4 4-5 6-3M12 9V3" fill="none" stroke="#3f8fd9" stroke-width="1.8" stroke-linecap="round"/>`) },
  { id: 'lovecraft', name: 'Lovecraft House', short: 'Lovecraft', roof: '#6b4fa0', icon: svg(`<rect x="5" y="9" width="14" height="12" fill="#b9a6d9" ${S}/><path d="M3.5 9.5L12 2l8.5 7.5z" fill="#6b4fa0" ${S}/><circle cx="12" cy="7" r="1.6" fill="#ffd34d" ${S}/><rect x="10" y="15" width="4" height="6" rx="2" fill="#6e4224" ${S}/><rect x="6.5" y="11" width="3" height="3" fill="#ffd34d" ${S}/><rect x="14.5" y="11" width="3" height="3" fill="#ffd34d" ${S}/>`) },
  { id: 'bus', name: 'Bus Stop', short: 'Bus Stop', roof: '#f2b630', icon: svg(`<path d="M5 22V4" ${S} stroke-width="2.2"/><circle cx="5" cy="4.5" r="3.2" fill="#f2b630" ${S}/><rect x="9" y="9" width="12.5" height="9" rx="2" fill="#f2b630" ${S}/><rect x="10.6" y="10.6" width="4" height="3" rx=".6" fill="#cfe8f0" ${S}/><rect x="15.8" y="10.6" width="4" height="3" rx=".6" fill="#cfe8f0" ${S}/><circle cx="12" cy="18.5" r="1.6" fill="${INK}"/><circle cx="18.5" cy="18.5" r="1.6" fill="${INK}"/>`) },
  { id: 'lawn', name: 'Picnic Lawn', short: 'Picnic Lawn', roof: '#e0463c', icon: svg(`<path d="M2 18l5-7h10l5 7z" fill="#fff8ec" ${S}/><path d="M4.5 14.5h15M7 11l-2.5 7M12 11v7M17 11l2.5 7" stroke="#e0463c" stroke-width="1.3"/><path d="M8 11c0-3 8-3 8 0z" fill="#f2b630" ${S}/><path d="M9 9.7l1.4.6M12 9l.1.9M15 9.7l-1.4.6" stroke="#9a6538" stroke-width="1"/>`) },
];
const CARD = {}; for (const [cat, list] of [['who', WHO], ['what', WHAT], ['where', WHERE]]) for (const c of list) CARD[c.id] = { ...c, cat };
const theName = id => { const c = CARD[id]; if (!c) return '?'; return c.cat === 'who' ? c.name : 'the ' + c.name; };
const PIE = svg(`<path d="M2.5 13c0-4 4.2-7 9.5-7s9.5 3 9.5 7z" fill="#f2b630" ${S}/><path d="M2 13h20l-1.5 5h-17z" fill="#d9a35b" ${S}/><path d="M7 9.5l1 1.2M12 8.5v1.4M17 9.5l-1 1.2" stroke="#9a6538" stroke-width="1.3" stroke-linecap="round"/>`);

// ---- the town map (the engine's missing-pie-bot.js PATHS and BUS; where each place sits on a 3 x 3 grid)
const PATHS = [[0, 1, 3], [1, 2, 3], [2, 3, 2], [3, 4, 3], [4, 5, 3], [5, 6, 2], [6, 7, 3], [7, 0, 2], [8, 1, 3], [8, 3, 3], [8, 5, 3], [8, 7, 3]];
const BUS = { 0: 4, 4: 0, 2: 6, 6: 2 };
const GRID = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1], [1, 1]];
const placeIdx = id => WHERE.findIndex(p => p.id === id);

const ICON = {
  roll: svg(`<rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="#fff8ec" ${S}/><circle cx="8.2" cy="8.2" r="1.6" fill="${INK}"/><circle cx="12" cy="12" r="1.6" fill="${INK}"/><circle cx="15.8" cy="15.8" r="1.6" fill="${INK}"/>`),
  bus: WHERE[7].icon,
  ask: svg(`<circle cx="10" cy="10" r="6.5" fill="#fff8ec" ${S} stroke-width="2.2"/><path d="M15 15l5.5 5.5" ${S} stroke-width="3"/><path d="M8 8.5a2.1 2.1 0 1 1 2.9 1.9c-.6.3-.9.7-.9 1.4" fill="none" ${S}/><circle cx="10" cy="13.6" r=".9" fill="${INK}"/>`),
  accuse: PIE,
  end: svg(`<path d="M6 21V4" fill="none" ${S} stroke-width="2.4"/><path d="M6 4h11l-2.5 4L17 12H6" fill="#f2b630" ${S}/>`),
  notebook: svg(`<rect x="5" y="3" width="14" height="18" rx="2" fill="#fff8ec" ${S}/><path d="M5 7H3.5M5 11H3.5M5 15H3.5M5 19H3.5" ${S}/><path d="M8.5 8l1.3 1.3L12 7M8.5 13l1.3 1.3L12 12M14 8.3h2.5M14 13.3h2.5" fill="none" ${S} stroke-width="1.5"/>`),
  map: svg(`<path d="M3 6l6-2.5 6 2.5 6-2.5v14.5L15 20.5 9 18l-6 2.5z" fill="#bfe3a8" ${S}/><path d="M9 3.5V18M15 6v14.5" ${S}/><circle cx="12" cy="11" r="1.8" fill="#e0463c" ${S}/>`),
  show: svg(`<rect x="5" y="4" width="11" height="15" rx="2" fill="#fff8ec" ${S} transform="rotate(-10 10 11)"/><rect x="9" y="5" width="11" height="15" rx="2" fill="#ffd34d" ${S}/><path d="M12.5 12.5h4M14.5 10.5v4" ${S}/>`),
  out: svg(`<circle cx="12" cy="12" r="9" fill="#e0463c" ${S}/><path d="M8 8l8 8M16 8l-8 8" stroke="#fff8ec" stroke-width="2.6" stroke-linecap="round"/>`),
};
const iconEl = (markup, cls = '') => { const s = el('span', 'mp-ico ' + cls); s.innerHTML = markup; return s; }; // (static markup only)

// ---- seats
const seatOf = (T, k) => { const chair = T.order ? T.order[k] : k, s = (T.seats && T.seats[chair]) || {}; return { name: s.name || 'Seat ' + (k + 1), color: SEAT_COLORS[(chair ?? k) % 8] }; };
const nm = (T, k, me) => (k === me ? 'You' : seatOf(T, k).name);
const verb = (k, me, a, b) => (k === me ? a : b);

// ---- what you know for sure (your cards, cards shown to you, and with the helper the engine's notes): mark per card/column
// columns 0..n-1 are the players, n the Pie Tin. 1 holds it, 0 does not, null not known.
function certain(v) {
  const n = v.n, all = [...WHO, ...WHAT, ...WHERE], out = {};
  for (const c of all) out[c.id] = new Array(n + 1).fill(null);
  const me = v.seat;
  const hold = (id, o) => { const r = out[id]; for (let i = 0; i <= n; i++) r[i] = i === o ? 1 : 0; };
  if (me !== null && me !== undefined && v.hand) {
    for (const c of all) out[c.id][me] = 0;
    for (const id of v.hand) hold(id, me);
    for (const x of v.seen || []) hold(x.card, x.by);
  }
  if (v.notes) all.forEach((c, i) => { const row = v.notes[i]; if (row) row.forEach((x, o) => { if (x !== null && out[c.id][o] === null) out[c.id][o] = x; }); });
  if (v.solution) for (const id of Object.values(v.solution)) hold(id, n);
  for (const list of [WHO, WHAT, WHERE]) { // the last one standing in a group is in the tin
    const open = list.filter(c => out[c.id][n] !== 0 && !out[c.id].slice(0, n).includes(1));
    if (open.length === 1) hold(open[0].id, n);
  }
  return out;
}

// ---------------------------------------------------------------- drawing
function cardEl(id, { tag = 'div', cls = '', label } = {}) {
  const c = CARD[id];
  const e = el(tag, `mp-card mp-${c ? c.cat : 'who'} ${cls}`, '', tag === 'button' ? { type: 'button', 'aria-label': label || theName(id) } : { 'aria-label': theName(id) });
  e.append(el('span', 'mp-ctag', c ? (c.cat === 'who' ? 'Who' : c.cat === 'what' ? 'What' : 'Where') : ''), iconEl(c ? c.icon : '', 'mp-cico'), el('span', 'mp-cname' + (c && c.short.length > 8 ? ' long' : ''), c ? c.short : '?'));
  return e;
}

function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const h01 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// the places on a 3 x 3 grid: a band at the top for the banner, room at the foot for the pawns standing under each place
function mapLayout(W, H) {
  const m = 6, top = H < 260 ? 20 : 26, pr = Math.max(9, Math.min(15, Math.min(W, H) * 0.04)), bot = pr * 1.7 + 4 + (H >= 280 ? 24 : 0); // (and the moment's slip, where there is room)
  const bw = Math.max(58, Math.min(W * 0.25, 160)), bh = Math.max(40, Math.min((H - top - bot) * 0.27, 108));
  const pts = GRID.map(([c, r]) => ({ x: m + bw / 2 + c * (W - bw - 2 * m) / 2, y: top + bh / 2 + r * (H - bh - top - bot) / 2 }));
  return { W, H, bw, bh, pts, pr, side: bw / bh > 1.9 };
}

function drawMap(g, L) {
  const { W, H, pts } = L;
  // grass, with a few darker tufts
  rr(g, 0, 0, W, H, 12);
  const gr = g.createRadialGradient(W * 0.5, H * 0.45, 10, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
  gr.addColorStop(0, '#9fd17a'); gr.addColorStop(1, '#6fae55'); g.fillStyle = gr; g.fill();
  for (let i = 0; i < 70; i++) { const x = h01(i, 1) * W, y = h01(i, 2) * H; g.fillStyle = 'rgba(47,107,79,0.25)'; g.beginPath(); g.ellipse(x, y, 3 + h01(i, 3) * 5, 2 + h01(i, 4) * 2, 0, 0, Math.PI * 2); g.fill(); }
  // the Bus Route shortcuts: dashed lines corner to corner
  g.save(); g.setLineDash([7, 6]); g.lineCap = 'round';
  for (const [a, b] of [[0, 4], [2, 6]]) { g.beginPath(); g.moveTo(pts[a].x, pts[a].y); g.lineTo(pts[b].x, pts[b].y); g.lineWidth = 5; g.strokeStyle = 'rgba(43,35,64,0.55)'; g.stroke(); g.lineWidth = 2.5; g.strokeStyle = '#ffd34d'; g.stroke(); }
  g.restore();
  // the paths: sand with an ink edge, the steps as stones, the count in a badge
  const pw = Math.max(9, Math.min(16, Math.min(W, H) * 0.04));
  for (const [a, b] of PATHS) { g.beginPath(); g.moveTo(pts[a].x, pts[a].y); g.lineTo(pts[b].x, pts[b].y); g.lineCap = 'round'; g.lineWidth = pw + 4; g.strokeStyle = INK; g.stroke(); g.lineWidth = pw; g.strokeStyle = '#ecd9a6'; g.stroke(); }
  for (const [a, b, s] of PATHS) {
    const A = pts[a], B = pts[b];
    for (let i = 1; i < s * 2; i++) { if (i === s) continue; const t = i / (s * 2); g.beginPath(); g.arc(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t, pw * 0.18, 0, Math.PI * 2); g.fillStyle = 'rgba(154,101,56,0.55)'; g.fill(); }
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, r = Math.max(8, pw * 0.75);
    g.beginPath(); g.arc(mx, my, r, 0, Math.PI * 2); g.fillStyle = '#fff8ec'; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
    g.fillStyle = INK; g.font = `700 ${Math.round(r * 1.25)}px Fredoka, "Trebuchet MS", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(s), mx, my + 1);
  }
}

function renderMap(root, s) {
  const { T, v, me, moves, ui } = s;
  const W = root.clientWidth || 600, H = root.clientHeight || 300, L = mapLayout(W, H);
  const c = el('canvas', 'mp-canvas'); const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  const g = c.getContext('2d'); g.scale(dpr, dpr); drawMap(g, L); root.append(c);
  if (document.fonts && !document.fonts.check('700 12px Fredoka') && !ui.fontWait) { ui.fontWait = true; document.fonts.load('700 12px Fredoka').then(() => s.rerender()).catch(() => {}); }
  // bus badges near each corner, pointing along the route
  for (const a of [0, 2, 4, 6]) {
    const A = L.pts[a], B = L.pts[BUS[a]], t = Math.min(0.3, (Math.max(L.bw, L.bh) * 0.62) / Math.hypot(B.x - A.x, B.y - A.y));
    const b = el('span', 'mp-busbadge', 'BUS', { title: `Bus Route to the ${WHERE[BUS[a]].name}` });
    Object.assign(b.style, { left: Math.round(A.x + (B.x - A.x) * t) + 'px', top: Math.round(A.y + (B.y - A.y) * t) + 'px' });
    root.append(b);
  }
  const goTo = new Map(moves.filter(m => m.type === 'go').map(m => [m.place, m]));
  const mine = me !== null && me !== undefined ? placeIdx(v.pos[me]) : -1;
  WHERE.forEach((p, i) => {
    const P = L.pts[i], go = goTo.get(p.id);
    const b = el('button', 'mp-place' + (go ? ' can' : '') + (i === mine ? ' here' : '') + (L.side ? ' side' : ''), '', { type: 'button', 'aria-label': p.name + (go ? ': walk here' : i === mine ? ': you are here' : ''), 'data-place': p.id });
    Object.assign(b.style, { left: Math.round(P.x - L.bw / 2) + 'px', top: Math.round(P.y - L.bh / 2) + 'px', width: Math.round(L.bw) + 'px', height: Math.round(L.bh) + 'px', '--roof': p.roof });
    b.append(iconEl(p.icon, 'mp-bico'), el('span', 'mp-pname', p.name));
    if (go) b.onclick = e => { e.stopPropagation(); s.send(go); };
    else b.onclick = e => { e.stopPropagation(); if (moves.some(m => m.type === 'roll')) s.toast('Roll first, then tap a glowing place.'); };
    root.append(b);
  });
  // the pawns: one per suspect, along the foot of the place they are in
  const at = new Map();
  WHO.forEach((w, i) => { const p = placeIdx(v.pos[i]); if (!at.has(p)) at.set(p, []); at.get(p).push(i); });
  const pr = L.pr;
  for (const [p, list] of at) {
    const P = L.pts[p];
    list.forEach((i, j) => {
      const w = WHO[i], seat = i < v.n ? i : null;
      const tok = el('span', 'mp-pawn' + (seat !== null && seat === v.active ? ' go' : '') + (seat === null ? ' npc' : '') + (seat !== null && v.out[seat] ? ' isout' : ''), '', { title: w.name + (seat !== null ? ' (' + nm(T, seat, me) + ')' : ''), 'aria-label': w.name + (seat !== null ? ', played by ' + nm(T, seat, me) : '') });
      tok.append(iconEl(w.icon));
      const x = P.x + (j - (list.length - 1) / 2) * pr * 1.8, y = P.y + L.bh / 2 + pr * 0.6;
      Object.assign(tok.style, { left: Math.round(x - pr) + 'px', top: Math.round(y - pr) + 'px', width: Math.round(pr * 2) + 'px', height: Math.round(pr * 2) + 'px', background: w.col });
      if (seat !== null) tok.style.setProperty('--seat', seatOf(T, seat).color);
      root.append(tok);
    });
  }
  // what is going on, at the top: your roll, someone choosing a card, the card shown to you
  const top = el('div', 'mp-banner');
  const P = v.pending;
  if (v.stage === 'show' && P) {
    if (P.by === me) { top.classList.add('hot'); top.textContent = `Tap a glowing card to show ${P.asker === me ? 'you' : nm(T, P.asker, me)}.`; }
    else top.textContent = `${nm(T, P.by, me)} ${verb(P.by, me, 'are', 'is')} picking a card for ${P.asker === me ? 'you' : nm(T, P.asker, me)}...`;
  } else if (v.active === me && v.stage === 'move') top.textContent = goTo.size ? `You rolled ${v.roll}: tap a glowing place.` : `You rolled ${v.roll}.`;
  else if (v.active === me && v.stage === 'ask') { top.classList.add('hot'); top.textContent = `At the ${WHERE[mine].name}: tap Ask!`; }
  else if (v.active === me && v.stage === 'roll') top.textContent = moves.some(m => m.type === 'ask') ? 'Brought here: Ask now, or Roll.' : 'Your turn: Roll!';
  else if (v.active === me && v.stage === 'done') top.textContent = 'Solve it, or End your turn.';
  if (top.textContent) root.append(top);
  // the card shown to you, until you tap it away
  if (v.shown && v.active === me && ui.seenAsk !== v.shown.ask) {
    const pop = el('button', 'mp-shown', '', { type: 'button', 'aria-label': `${nm(T, v.shown.by, me)} showed you ${theName(v.shown.card)}. Tap to close.` });
    pop.append(el('b', '', `${nm(T, v.shown.by, me)} showed you:`), cardEl(v.shown.card), el('small', '', 'It goes in your notebook. Tap to close.'));
    pop.onclick = e => { e.stopPropagation(); ui.seenAsk = v.shown.ask; s.rerender(); };
    root.append(pop);
  }
}

// ---------------------------------------------------------------- the notebook
const MARKS = ['', 'no', 'yes', 'maybe'];
function markEl(m) {
  if (m === 'yes') return iconEl(svg(`<path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="#2f7a45" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`), 'mp-mk');
  if (m === 'no') return iconEl(svg(`<path d="M7 7l10 10M17 7L7 17" stroke="#e0463c" stroke-width="3" stroke-linecap="round"/>`), 'mp-mk');
  if (m === 'maybe') return el('span', 'mp-mk mp-q', '?');
  if (m === 'tin') return iconEl(PIE, 'mp-mk');
  return el('span', 'mp-mk');
}
function renderNotebook(root, s) {
  const { T, v, me, ui } = s;
  const W = root.clientWidth || 600, H = root.clientHeight || 300;
  const nb = el('div', 'mp-nb');
  const all = W >= 760 && H >= 330; // (a big board: the three groups side by side, one tab)
  if (all && ui.tab !== 'asks') ui.tab = 'all';
  if (!all && ui.tab === 'all') ui.tab = 'who';
  const tabs = el('div', 'mp-tabs', '', { role: 'tablist' });
  for (const [k, label] of all ? [['all', 'Notebook'], ['asks', 'Asks']] : [['who', 'Who'], ['what', 'What'], ['where', 'Where'], ['asks', 'Asks']]) {
    const t = el('button', 'mp-tab' + (ui.tab === k ? ' on' : ''), label, { type: 'button', role: 'tab', 'aria-selected': ui.tab === k ? 'true' : 'false' });
    t.onclick = e => { e.stopPropagation(); ui.tab = k; s.rerender(); };
    tabs.append(t);
  }
  nb.append(tabs);
  if (ui.tab === 'asks') { nb.append(asksList(s)); root.append(nb); return; }
  const n = v.n, known = certain(v);
  const cols = [...Array(n).keys()].map(k => ({ k, label: k === me ? 'You' : seatOf(T, k).name, color: seatOf(T, k).color }));
  let blocks;
  if (all) blocks = [WHO, WHAT, WHERE];
  else {
    const list = ui.tab === 'what' ? WHAT : ui.tab === 'where' ? WHERE : WHO, halves = W > 2.1 * H ? 2 : 1, per = Math.ceil(list.length / halves);
    blocks = [...Array(halves).keys()].map(h => list.slice(h * per, (h + 1) * per));
  }
  const wrap = el('div', 'mp-grids' + (blocks.length > 1 ? ' two' : ''));
  wrap.style.gridTemplateColumns = `repeat(${blocks.length}, 1fr)`;
  for (const part of blocks) {
    const grid = el('div', 'mp-grid');
    grid.style.gridTemplateColumns = `minmax(4.8rem, 2fr) repeat(${n + 1}, minmax(22px, 1fr))`;
    grid.append(el('span', 'mp-gh'));
    for (const c of cols) { const hd = el('span', 'mp-gh mp-gp', c.label === 'You' ? 'You' : c.label.slice(0, 3), { title: c.label }); hd.style.setProperty('--seat', c.color); grid.append(hd); }
    const th = el('span', 'mp-gh mp-gt', '', { title: 'The Pie Tin (the answer)' }); th.append(iconEl(PIE)); grid.append(th);
    for (const card of part) {
      const row = known[card.id], gone = row.slice(0, n).includes(1), tin = row[n] === 1;
      const nmEl = el('span', 'mp-gn' + (gone ? ' gone' : '') + (tin ? ' tin' : ''));
      nmEl.append(iconEl(card.icon), el('span', '', card.short));
      grid.append(nmEl);
      for (let o = 0; o <= n; o++) {
        const auto = row[o], key = card.id + ':' + o, man = ui.marks[key] || '';
        const m = auto === 1 ? (o === n ? 'tin' : 'yes') : auto === 0 ? 'no' : man;
        const label = `${card.name}, ${o === n ? 'the Pie Tin' : cols[o].label}: ${m === 'tin' || m === 'yes' ? 'yes' : m === 'no' ? 'no' : m === 'maybe' ? 'maybe' : 'not marked'}${auto !== null ? ' (certain)' : ''}`;
        const cell = el('button', 'mp-cell' + (auto !== null ? ' auto' : '') + (o === n ? ' tincol' : ''), '', { type: 'button', 'aria-label': label });
        cell.append(markEl(m));
        if (auto === null) cell.onclick = e => { e.stopPropagation(); ui.marks[key] = MARKS[(MARKS.indexOf(man) + 1) % MARKS.length]; s.rerender(); };
        grid.append(cell);
      }
    }
    wrap.append(grid);
  }
  const solved = [WHO, WHAT, WHERE].map(l => l.find(c => known[c.id][n] === 1));
  nb.append(el('p', 'mp-nbfoot', solved.every(Boolean) ? `Solved? ${solved.map(c => c.name).join(', ')}. Tap Solve it!` : v.settings && v.settings.reveal ? 'Helper on: hints fill in for you. Tap a square to mark it.' : 'Tap a square: no, yes, maybe. Your cards and cards shown to you fill in.'), wrap);
  root.append(nb);
}
function asksList(s) {
  const { T, v, me } = s;
  const box = el('div', 'mp-asks');
  const log = (v.log || []).slice().reverse();
  if (!log.length) box.append(el('p', 'mp-nbfoot', 'No asks yet. Walk to a place and Ask.'));
  for (const e of log.slice(0, 30)) {
    const row = el('div', 'mp-arow');
    const who = el('b', 'mp-aw', nm(T, e.seat, me)); who.style.setProperty('--seat', seatOf(T, e.seat).color);
    row.append(who);
    for (const id of [e.who, e.what, e.where]) { const m = el('span', 'mp-amini', '', { title: theName(id) }); m.append(iconEl(CARD[id].icon), el('span', '', CARD[id].short)); row.append(m); }
    const res = e.by === null || e.by === undefined ? (e.passed && e.passed.length === v.n - 1 ? 'nobody showed' : '...') : `${nm(T, e.by, me)} showed`;
    const mineSeen = (v.seen || []).find(x => x.ask === v.log.indexOf(e));
    row.append(el('span', 'mp-ares' + (mineSeen ? ' you' : ''), mineSeen ? `${res}: ${CARD[mineSeen.card].short}` : res));
    box.append(row);
  }
  return box;
}

// ---------------------------------------------------------------- the Ask and Solve pickers
function renderPicker(root, s) {
  const { v, me, moves, ui } = s, acc = ui.picker === 'accuse';
  const pk = ui.pick || (ui.pick = {});
  const box = el('div', 'mp-pick' + (acc ? ' acc' : ''));
  const here = me !== null && me !== undefined ? v.pos[me] : null;
  const head = el('div', 'mp-phead');
  const cancel = el('button', 'mp-btn', 'Back', { type: 'button', 'aria-label': 'Back to the map' });
  cancel.onclick = e => { e.stopPropagation(); ui.picker = null; s.rerender(); };
  const m = acc ? moves.find(x => x.type === 'accuse' && x.who === pk.who && x.what === pk.what && x.where === pk.where) : moves.find(x => x.type === 'ask' && x.who === pk.who && x.what === pk.what);
  const go = el('button', 'mp-btn go' + (acc ? ' red' : ''), acc ? 'Solve it!' : 'Ask!', { type: 'button', 'aria-label': acc ? 'Make the accusation' : 'Ask' });
  if (!m) go.disabled = true;
  go.onclick = e => { e.stopPropagation(); if (!m) return; ui.picker = null; ui.pick = {}; s.send(m); };
  head.append(cancel, el('div', 'mp-ph', acc ? 'Who took the pie, with what, and where?' : `At the ${CARD[here] ? CARD[here].name : '?'}: who, with what?`), go);
  box.append(head);
  const hand = new Set(v.hand || []), known = certain(v);
  const row = (key, list) => {
    const r = el('div', 'mp-prow mp-n' + list.length);
    for (const c of list) {
      const ruled = known[c.id].slice(0, v.n).includes(1);
      const b = el('button', 'mp-ptile' + (pk[key] === c.id ? ' on' : '') + (ruled ? ' ruled' : ''), '', { type: 'button', 'aria-pressed': pk[key] === c.id ? 'true' : 'false', 'aria-label': c.name + (hand.has(c.id) ? ' (your card)' : ruled ? ' (ruled out)' : '') });
      if (c.col) b.style.setProperty('--sc', c.col);
      b.append(iconEl(c.icon), el('span', '', c.short));
      if (hand.has(c.id)) b.append(el('i', 'mp-yours', '', { title: 'Your card' }));
      b.onclick = e => { e.stopPropagation(); pk[key] = c.id; s.rerender(); };
      r.append(b);
    }
    box.append(r);
  };
  row('who', WHO); row('what', WHAT); if (acc) row('where', WHERE);
  if (acc) box.append(el('p', 'mp-warn', 'If you are wrong, you are out of the running (you still show cards).'));
  root.append(box);
}

// ---------------------------------------------------------------- your hand
function renderHand(hand, s) {
  const { T, v, me, moves } = s;
  if (!v || !v.hand) return;
  const showing = moves.filter(m => m.type === 'show');
  const box = el('div', 'mp-hand' + (showing.length ? ' showing' : ''));
  const W = hand.clientWidth || 400, Hh = hand.clientHeight || 100, n = v.hand.length;
  let ch = Math.max(44, Math.min(Hh - 12, 136)), cw = Math.round(ch * 0.74);
  if (n * (cw + 6) > W - 10) { cw = Math.floor((W - 10) / n) - 6; ch = Math.min(ch, Math.round(cw / 0.62)); }
  box.style.setProperty('--cw', cw + 'px'); box.style.setProperty('--ch', ch + 'px');
  for (const id of v.hand) {
    const sm = showing.find(m => m.card === id);
    const c = cardEl(id, { tag: sm ? 'button' : 'div', cls: sm ? 'lit' : showing.length ? 'dim' : '', label: sm ? `Show ${theName(id)} to ${nm(T, v.pending ? v.pending.asker : -1, me)}` : undefined });
    if (sm) c.onclick = e => { e.stopPropagation(); s.send(sm); };
    box.append(c);
  }
  hand.append(box);
}

// ---------------------------------------------------------------- the module
// the map and the cards are laid out in pixels: when a region changes size (the frame's layout settling, a turned phone) draw again
const SIZE = new WeakMap(), AGAIN = new WeakMap();
const sizeKey = e => e.clientWidth + 'x' + e.clientHeight;
const RO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(list => {
  for (const r of list) { const f = AGAIN.get(r.target); if (f && SIZE.get(r.target) !== sizeKey(r.target)) { f(); return; } }
}) : null;
function watchSize(e, s) {
  if (!RO) return;
  if (!AGAIN.has(e)) RO.observe(e);
  AGAIN.set(e, () => s.rerender());
  SIZE.set(e, sizeKey(e));
}
function render(board, hand, s) {
  const { v, moves, ui } = s;
  board.textContent = ''; hand.textContent = '';
  watchSize(board, s); watchSize(hand, s);
  if (!v) return;
  if (!ui.marks) { ui.marks = {}; ui.tab = 'who'; ui.nb = false; ui.picker = null; ui.pick = {}; }
  if (ui.picker === 'ask' && !moves.some(m => m.type === 'ask')) ui.picker = null;
  if (ui.picker === 'accuse' && !moves.some(m => m.type === 'accuse')) ui.picker = null;
  const root = el('div', 'mp-root' + (board.clientHeight >= 280 ? ' roomy' : ''));
  board.append(root);
  if (ui.picker) renderPicker(root, s);
  else if (ui.nb && v.hand) renderNotebook(root, s);
  else renderMap(root, s);
  renderHand(hand, s);
}

function buttons(s) {
  const { v, moves, ui, me } = s;
  if (!v || v.phase !== 'play') return [];
  const out = [], has = t => moves.find(m => m.type === t);
  if (has('show')) out.push({ id: 'show', icon: ICON.show, label: 'Tap a glowing card in your hand to show it', word: 'Show', hot: true, run: () => s.toast('Tap one of your glowing cards to show it.') });
  if (has('roll')) out.push({ id: 'roll', icon: ICON.roll, label: 'Roll the die', word: 'Roll', key: 'R', hot: true, move: has('roll') });
  if (has('bus')) { const here = placeIdx(v.pos[me]); out.push({ id: 'bus', icon: ICON.bus, label: `Ride the Bus Route to the ${WHERE[BUS[here]].name} (instead of rolling)`, word: 'Bus', move: has('bus') }); }
  if (has('ask')) out.push({ id: 'ask', icon: ICON.ask, label: 'Ask about a who and a what, here', word: 'Ask', hot: v.stage === 'ask', run: () => { ui.picker = ui.picker === 'ask' ? null : 'ask'; s.rerender(); } });
  if (has('accuse')) out.push({ id: 'accuse', icon: ICON.accuse, label: 'Solve it: name who, what and where', word: 'Solve', run: () => { ui.picker = ui.picker === 'accuse' ? null : 'accuse'; s.rerender(); } });
  if (has('end')) out.push({ id: 'end', icon: ICON.end, label: 'End my turn', word: 'End', key: 'E', hot: v.stage === 'done', move: has('end') });
  if (v.hand) out.push({ id: 'notebook', icon: ui.nb ? ICON.map : ICON.notebook, label: ui.nb ? 'Back to the map' : 'Open my notebook', key: 'N', run: () => { ui.nb = !ui.nb; ui.picker = null; s.rerender(); } });
  return out;
}

function chip(T, v, k) {
  const extra = [];
  const w = WHO[k];
  if (w) { const p = el('span', 'mp-chpawn', '', { title: 'Plays ' + w.name }); p.style.background = w.col; extra.push(p); }
  if (v.out && v.out[k]) extra.push(el('span', 'mp-chout', 'out', { title: 'Guessed wrong: out of the running (still shows cards)' }));
  return { count: v.counts ? v.counts[k] : null, extra };
}

function pill(T, v) {
  if (!v || v.phase !== 'play') return null;
  const k = v.active, who = k === v.seat ? 'You' : seatOf(T, k).name;
  if (v.stage === 'roll') return k === v.seat ? 'Your turn' : `${who}'s turn`;
  if (v.roll && (v.stage === 'move' || v.stage === 'ask' || v.stage === 'done' || v.stage === 'show')) return `${who} rolled ${v.roll}`;
  return `${who}'s turn`;
}

function describe(T, v, b, me) {
  const who = k => nm(T, k, me);
  switch (b.kind) {
    case 'start': return 'The prize pie is missing! Who took it, with what, and where?';
    case 'deal': return 'The cards are dealt. Three are hidden in the Pie Tin.';
    case 'turn': return b.seat === me ? 'Your turn: roll the die.' : null;
    case 'roll': return `${who(b.seat)} rolled a ${b.value}${b.hop ? ': too short to reach a place, so a hop next door' : ''}.`;
    case 'move': return b.bus ? `${who(b.seat)} rode the Bus Route to the ${CARD[b.place].name}.` : `${who(b.seat)} ${verb(b.seat, me, 'walk', 'walks')} to the ${CARD[b.place].name}.`;
    case 'ask': return `${who(b.seat)} ${verb(b.seat, me, 'ask', 'asks')}: was it ${theName(b.who)} with ${theName(b.what)} at ${theName(b.where)}?`;
    case 'shown': return b.to === me ? `${who(b.by)} showed you a card.` : `${who(b.by)} showed a card to ${b.to === me ? 'You' : who(b.to)}.`;
    case 'noneShown': return 'Nobody could show a card!';
    case 'accuse': return `${who(b.seat)} ${verb(b.seat, me, 'say', 'says')}: ${theName(b.who)}, with ${theName(b.what)}, at ${theName(b.where)}! ${b.right ? 'Right!' : 'Not quite.'}`;
    case 'out': return `${who(b.seat)} ${verb(b.seat, me, 'are', 'is')} out of the running, but still ${verb(b.seat, me, 'show', 'shows')} cards.`;
    case 'gameOver': return b.why === 'solved' ? `${who(b.winners[0])} solved the case of the missing pie!` : b.why === 'allOut' ? 'Nobody solved it. Here is what happened...' : 'Time is up! Here is what happened...';
    default: return null;
  }
}

function overPanel(T, res, me) {
  const box = el('div', 'tg-round over mp-over');
  const v = T.view || {}, sol = v.solution || (res && res.solution) || null, win = (res && res.winners) || v.winners || [];
  const rib = el('div', 'tg-ribbon gold', '', { 'aria-hidden': 'true' }); rib.append(el('b', '', 'Case closed'));
  const names = win.map(k => nm(T, k, me));
  box.append(rib, el('div', 'tg-h', names.length ? `${names.join(' and ')} solved it!` : 'Nobody solved it'));
  if (sol) {
    const row = el('div', 'mp-sol');
    for (const id of [sol.who, sol.what, sol.where]) row.append(cardEl(id));
    box.append(row);
    box.append(el('p', 'tg-sub', `${theName(sol.who)} took the pie with ${theName(sol.what)} to ${theName(sol.where)}... to share it with the whole town!`));
  }
  box.append(el('p', 'tg-note', res && res.counted ? 'On the store window leaderboard.' : 'A bot played, so this one is just for fun.'));
  let done = false;
  box.onShow = () => {
    if (done) return; done = true; rib.classList.add('in');
    if (win.length) LOOK.eye?.confetti();
    LOOK.sound?.(me != null && win.includes(me) ? 'tg-fanfare' : 'tg-cheer');
  };
  return box;
}

function rulesCard() {
  const c = el('div', 'tg-rules mp-rules');
  c.append(el('div', 'tg-h', 'The Missing Pie'));
  const row = (pics, text) => { const r = el('div', 'tg-rrow'); const p = el('div', 'tg-rpic'); for (const x of pics) p.append(typeof x === 'string' ? iconEl(x) : x); r.append(p, el('p', '', text)); c.append(r); };
  row([PIE], 'The prize pie is gone! Three secret cards are in the Pie Tin: who took it, with what, and where. Everyone else holds the rest.');
  row([ICON.roll, WHERE[1].icon], 'Roll and walk to a place within that many steps. From a corner you can ride the Bus Route instead.');
  row([ICON.ask, WHO[2].icon, WHAT[3].icon], 'In a place, Ask: name a who and a what. The first player to your left with one of the three shows you one card, just you.');
  row([ICON.notebook], 'Mark your notebook. Cards you hold and cards shown to you cannot be in the tin.');
  row([ICON.accuse], 'Sure? Solve it on your turn. Right: you win! Wrong: you are out, but you still show cards.');
  return c;
}

function moments(b, c) {
  const { play, eye, me } = c;
  switch (b.kind) {
    case 'start': case 'deal': play('tg-deal'); break;
    case 'turn': if (me != null && b.seat === me) { if (eye) eye.turn(() => play('tg-yourturn')); else play('tg-yourturn'); } break;
    case 'roll': play('tg-draw'); break;
    case 'move': play('tg-tile', 200); break;
    case 'ask': play('tg-lift'); break;
    case 'shown': if (me != null && b.to === me) play('tg-ring', 150); else play('tg-back', 150); break;
    case 'noneShown': play('tg-answer', 150); break;
    case 'accuse':
      if (b.right) { if (eye) eye.stamp('Solved!', 'The pie is found', { color: '#4fa45a', sound: () => play('tg-stamp') }); else play('tg-fanfare', 300); }
      else if (eye) eye.stamp('Not quite!', 'Out of the running', { color: '#e0463c', sound: () => play('tg-stamp') });
      break;
    case 'gameOver': if (!c.open) play('tg-cheer', 900); break; // (at the table the end card cheers, with confetti)
    default: break;
  }
}

function setupLine(settings, n) {
  const k = Math.max(3, Math.min(6, n || 3)), lo = Math.floor(18 / k), hi = Math.ceil(18 / k);
  return `${k} players: ${lo === hi ? lo : lo + ' or ' + hi} cards each, 3 in the Pie Tin${settings && settings.reveal ? '. Helper notebook on.' : '.'}`;
}

function onKey(code, s) {
  const { moves, ui } = s, has = t => moves.find(m => m.type === t);
  if (code === 'Escape' && ui.picker) { ui.picker = null; s.rerender(); return true; }
  if (code === 'KeyR' && has('roll')) { s.send(has('roll')); return true; }
  if (code === 'KeyE' && has('end')) { s.send(has('end')); return true; }
  if (code === 'KeyN' && s.v && s.v.hand) { ui.nb = !ui.nb; ui.picker = null; s.rerender(); return true; }
  return false;
}

const css = `
.tg-missing-pie .tg-boardwrap { background: #6fae55; }
.tg-missing-pie .mp-root { position: absolute; inset: 0; overflow: hidden; }
.tg-missing-pie .mp-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.tg-missing-pie .mp-ico { display: inline-grid; place-items: center; }
.tg-missing-pie .mp-ico svg { width: 100%; height: 100%; display: block; }
.tg-missing-pie .mp-place { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 3px 3px 4px; border-radius: 12px; border: 2.5px solid ${INK}; background: #fff8ec; box-shadow: 0 3px 0 rgba(43,35,64,0.85), inset 0 5px 0 var(--roof); color: ${INK}; z-index: 1; }
.tg-missing-pie .mp-place .mp-bico { flex: 1 1 auto; width: 100%; min-height: 0; }
.tg-missing-pie .mp-place .mp-pname { flex: 0 0 auto; font-size: 12px; font-weight: 700; line-height: 1.05; text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tg-missing-pie .mp-place.side { flex-direction: row; gap: 4px; padding: 4px 6px 4px 4px; }
.tg-missing-pie .mp-place.side .mp-bico { flex: 0 0 auto; width: auto; height: 100%; aspect-ratio: 1; }
.tg-missing-pie .mp-place.side .mp-pname { white-space: normal; text-align: left; font-size: 13px; }
.tg-missing-pie .mp-place.here { box-shadow: 0 0 0 3px #fff8ec, 0 0 0 5.5px ${INK}, inset 0 5px 0 var(--roof); }
.tg-missing-pie .mp-place.can { background: #fff1b8; border-color: ${INK}; box-shadow: 0 0 0 3px #ffd34d, 0 0 16px 6px rgba(255,211,77,0.9), inset 0 5px 0 var(--roof); animation: mp-glow 1s ease-in-out infinite; cursor: pointer; }
.tg-missing-pie .mp-place.can:hover { background: #ffe58a; }
@keyframes mp-glow { 50% { box-shadow: 0 0 0 3px #ffe58a, 0 0 24px 10px rgba(255,211,77,1), inset 0 5px 0 var(--roof); } }
.tg-missing-pie .mp-busbadge { position: absolute; transform: translate(-50%, -50%) rotate(-8deg); padding: 0 4px; border-radius: 5px; background: #ffd34d; border: 2px solid ${INK}; font-size: 10px; font-weight: 700; line-height: 14px; color: ${INK}; z-index: 0; pointer-events: none; }
.tg-missing-pie .mp-pawn { position: absolute; z-index: 2; box-sizing: border-box; display: grid; place-items: center; border-radius: 50%; border: 2px solid ${INK}; box-shadow: 0 0 0 2.5px var(--seat, transparent), 0 2px 0 2px rgba(43,35,64,0.8); pointer-events: auto; }
.tg-missing-pie .mp-pawn .mp-ico { width: 118%; height: 118%; }
.tg-missing-pie .mp-pawn.npc { opacity: 0.8; box-shadow: 0 2px 0 rgba(43,35,64,0.8); }
.tg-missing-pie .mp-pawn.isout { filter: grayscale(0.7); }
.tg-missing-pie .mp-pawn.go { animation: mp-hop 0.9s ease-in-out infinite; z-index: 3; }
@keyframes mp-hop { 50% { transform: translateY(-5px); } }
.tg-missing-pie .mp-banner { position: absolute; left: 50%; top: 6px; transform: translateX(-50%); z-index: 4; max-width: 92%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-sizing: border-box; padding: 2px 12px; border-radius: 12px; background: #fff8ec; border: 2.5px solid ${INK}; box-shadow: 0 3px 0 rgba(43,35,64,0.85); font-size: 13px; font-weight: 600; text-align: center; pointer-events: none; }
.tg-missing-pie .mp-banner.hot { background: #ffd34d; }
.tg-missing-pie .mp-shown { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-2deg); z-index: 5; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 16px; border-radius: 16px; background: #fff8ec; border: 3px solid ${INK}; box-shadow: 0 0 0 4px #ffd34d, 0 5px 0 4px ${INK}; font-family: inherit; color: ${INK}; animation: mp-pop 0.4s cubic-bezier(.3,1.6,.5,1); }
.tg-missing-pie .mp-shown b { font-size: 15px; }
.tg-missing-pie .mp-shown small { font-size: 11px; font-weight: 600; }
.tg-missing-pie .mp-shown .mp-card { --cw: 74px; --ch: 100px; }
@keyframes mp-pop { from { transform: translate(-50%, -50%) scale(0.4); } to { transform: translate(-50%, -50%) rotate(-2deg); } }

/* the cards */
.tg-missing-pie .mp-card { --cc: #3f8fd9; --sc: #3f8fd9; flex: 0 0 auto; box-sizing: border-box; width: var(--cw, 70px); height: var(--ch, 96px); display: flex; flex-direction: column; align-items: center; padding: 0 0 3px; border-radius: 10px; border: 2.5px solid ${INK}; background: #fffdf6; box-shadow: 0 3px 0 rgba(43,35,64,0.85); overflow: hidden; color: ${INK}; font-family: inherit; position: relative; }
.tg-missing-pie .mp-card.mp-what { --cc: #f0862f; }
.tg-missing-pie .mp-card.mp-where { --cc: #4fa45a; }
.tg-missing-pie .mp-ctag { align-self: stretch; background: var(--cc); color: #fff; font-size: calc(var(--ch, 96px) * 0.11); font-weight: 700; text-align: center; line-height: 1.35; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${INK}; text-shadow: 0 1px 0 rgba(43,35,64,0.7); }
.tg-missing-pie .mp-cico { flex: 1 1 auto; min-height: 0; width: 82%; padding: 2px 0; }
.tg-missing-pie .mp-cname { font-size: max(10px, calc(var(--ch, 96px) * 0.13)); font-weight: 700; line-height: 1.05; text-align: center; padding: 0 2px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tg-missing-pie .mp-cname.long { font-size: max(9px, calc(var(--ch, 96px) * 0.105)); white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1; }
.tg-missing-pie .mp-hand { display: flex; gap: 6px; align-items: center; justify-content: center; padding: 0 4px; }
.tg-missing-pie .mp-hand .mp-card.lit { cursor: pointer; transform: translateY(-4px); box-shadow: 0 0 0 3px #ffd34d, 0 0 16px 6px rgba(255,211,77,0.9); animation: mp-glow2 1s ease-in-out infinite; padding-top: 0; }
@keyframes mp-glow2 { 50% { box-shadow: 0 0 0 3px #ffe58a, 0 0 24px 9px rgba(255,211,77,1); } }
.tg-missing-pie .mp-hand .mp-card.dim { opacity: 0.45; }
.tg-missing-pie .mp-sol { display: flex; gap: 10px; justify-content: center; margin: 6px 0; }
.tg-missing-pie .mp-sol .mp-card { --cw: 78px; --ch: 106px; }
.tg-missing-pie[data-form="phone"] .mp-sol .mp-card { --cw: 56px; --ch: 76px; }
.tg-missing-pie[data-form="phone"] .mp-sol { margin: 2px 0; }
.tg-missing-pie .mp-over .tg-sub { max-width: 26rem; margin-left: auto; margin-right: auto; }

/* the notebook */
.tg-missing-pie .mp-root.roomy .mp-nb, .tg-missing-pie .mp-root.roomy .mp-pick { padding-bottom: 34px; }
.tg-missing-pie .mp-nb { position: absolute; inset: 0; display: flex; flex-direction: column; background: #fbf6ea; background-image: repeating-linear-gradient(#fbf6ea 0 23px, #dfe8f2 23px 24px); padding: 5px 6px 4px; box-sizing: border-box; }
.tg-missing-pie .mp-tabs { display: flex; gap: 4px; justify-content: center; flex: 0 0 auto; margin-bottom: 4px; }
.tg-missing-pie .mp-tab { min-height: 30px; min-width: 56px; padding: 0 10px; border-radius: 15px; border: 2.5px solid ${INK}; background: #fff8ec; color: ${INK}; font-weight: 700; font-size: 13px; }
.tg-missing-pie .mp-tab.on { background: #ffd34d; }
.tg-missing-pie .mp-grids { flex: 1 1 auto; min-height: 0; overflow: auto; }
.tg-missing-pie .mp-grids.two { display: grid; gap: 12px; align-content: start; }
.tg-missing-pie .mp-grid { display: grid; gap: 2px; align-items: center; align-content: start; }
.tg-missing-pie .mp-gh { font-size: 11px; font-weight: 700; text-align: center; overflow: hidden; white-space: nowrap; }
.tg-missing-pie .mp-gp { border-radius: 8px; background: var(--seat); color: #fff; border: 2px solid ${INK}; text-shadow: 0 1px 0 rgba(43,35,64,0.8); line-height: 16px; }
.tg-missing-pie .mp-gt .mp-ico { width: 20px; height: 18px; }
.tg-missing-pie .mp-gn { display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; min-width: 0; }
.tg-missing-pie .mp-gn .mp-ico { flex: 0 0 auto; width: 22px; height: 22px; }
.tg-missing-pie .mp-gn > span:last-child { overflow: hidden; text-overflow: ellipsis; }
.tg-missing-pie .mp-gn.gone > span:last-child { text-decoration: line-through; text-decoration-thickness: 2px; opacity: 0.55; }
.tg-missing-pie .mp-gn.tin > span:last-child { background: #ffd34d; border-radius: 6px; padding: 0 3px; }
.tg-missing-pie .mp-cell { height: 26px; padding: 0; border-radius: 6px; border: 2px solid rgba(43,35,64,0.6); background: #fff; display: grid; place-items: center; }
.tg-missing-pie .mp-cell.auto { background: #eef3e6; border-style: solid; cursor: default; }
.tg-missing-pie .mp-cell.tincol { background: #fff4d6; }
.tg-missing-pie .mp-mk { width: 18px; height: 18px; font-weight: 700; font-size: 15px; color: #3f8fd9; line-height: 18px; text-align: center; }
.tg-missing-pie .mp-nbfoot { flex: 0 0 auto; margin: 0 0 3px; font-size: 12px; font-weight: 600; text-align: center; }
.tg-missing-pie .mp-asks { flex: 1 1 auto; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 3px; }
.tg-missing-pie .mp-arow { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; font-size: 12px; font-weight: 600; padding: 2px 4px; border-radius: 8px; background: rgba(255,255,255,0.7); }
.tg-missing-pie .mp-aw { padding: 0 6px; border-radius: 8px; background: var(--seat); color: #fff; border: 2px solid ${INK}; text-shadow: 0 1px 0 rgba(43,35,64,0.8); max-width: 6rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tg-missing-pie .mp-amini { display: inline-flex; align-items: center; gap: 2px; }
.tg-missing-pie .mp-amini .mp-ico { width: 18px; height: 18px; }
.tg-missing-pie .mp-ares { margin-left: auto; color: #6e4224; }
.tg-missing-pie .mp-ares.you { color: #2f7a45; font-weight: 700; }

/* the pickers */
.tg-missing-pie .mp-pick { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 4px; padding: 6px; box-sizing: border-box; background: #fbf6ea; overflow: auto; }
.tg-missing-pie .mp-pick.acc { background: #fff0e6; }
.tg-missing-pie .mp-phead { display: flex; align-items: center; gap: 8px; }
.tg-missing-pie .mp-ph { flex: 1 1 auto; font-size: 15px; font-weight: 700; text-align: center; line-height: 1.1; }
.tg-missing-pie .mp-prow { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
.tg-missing-pie .mp-prow.mp-n9 { grid-template-columns: repeat(9, 1fr); }
.tg-missing-pie .mp-ptile { --sc: ${INK}; position: relative; min-height: 46px; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 2px 1px; border-radius: 10px; border: 2.5px solid ${INK}; background: #fff; color: ${INK}; font-size: 11px; font-weight: 700; box-shadow: 0 2px 0 rgba(43,35,64,0.8); }
.tg-missing-pie .mp-ptile .mp-ico { width: 26px; height: 26px; }
.tg-missing-pie .mp-ptile span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tg-missing-pie .mp-ptile.ruled { background: #ece6da; }
.tg-missing-pie .mp-ptile.ruled span { text-decoration: line-through; opacity: 0.6; }
.tg-missing-pie .mp-ptile.on { background: #ffd34d; box-shadow: 0 0 0 3px #fff8ec, 0 0 0 5px ${INK}; }
.tg-missing-pie .mp-yours { position: absolute; right: 3px; top: 3px; width: 8px; height: 8px; border-radius: 50%; background: #3f8fd9; border: 1.5px solid ${INK}; }
.tg-missing-pie .mp-warn { margin: 0; font-size: 12px; font-weight: 700; color: #b8322a; text-align: center; }
.tg-missing-pie .mp-btn { flex: 0 0 auto; min-height: 38px; padding: 0 14px; border-radius: 19px; border: 2.5px solid ${INK}; background: #fff8ec; color: ${INK}; font-size: 15px; font-weight: 700; box-shadow: 0 3px 0 rgba(43,35,64,0.85); }
.tg-missing-pie .mp-btn.go { background: #7ddc7a; }
.tg-missing-pie .mp-btn.go.red { background: #ff9a8a; }
.tg-missing-pie .mp-btn:disabled { opacity: 0.5; cursor: default; }

/* the players strip and the buttons */
.tg-missing-pie .mp-chpawn { display: inline-block; width: 12px; height: 12px; border-radius: 50%; border: 2px solid ${INK}; }
.tg-missing-pie .mp-chout { padding: 0 5px; border-radius: 8px; background: #e0463c; color: #fff; font-size: 11px; font-weight: 700; }
/* a word on the hot button only (the one to press now); the rest stay round */
.tg-missing-pie .tg-act-word { display: none; font-size: 16px; font-weight: 700; color: ${INK}; }
.tg-missing-pie .tg-act.hot:has(.tg-act-word) { width: auto; min-width: 52px; padding: 0 13px 0 8px; border-radius: 26px; display: inline-flex; gap: 5px; }
.tg-missing-pie .tg-act.hot .tg-act-word { display: inline; }
.tg-missing-pie[data-form="pc"] .tg-acts { gap: 6px; }
.tg-missing-pie[data-form="pc"] .tg-act { width: 46px; height: 46px; }
.tg-missing-pie[data-form="pc"] .tg-act .tg-ico { width: 26px; height: 26px; }
.tg-missing-pie.portrait .tg-act.hot:has(.tg-act-word), .tg-missing-pie[data-form="phone"] .tg-act.hot:has(.tg-act-word) { padding: 0 10px 0 6px; }
.tg-missing-pie.portrait .tg-act-word, .tg-missing-pie[data-form="phone"] .tg-act-word { font-size: 14px; }
.tg-missing-pie .mp-rules .tg-rpic .mp-ico { width: 28px; height: 28px; }
.tg.portrait.tg-missing-pie .mp-place .mp-pname, .tg-missing-pie[data-form="phone"] .mp-place .mp-pname { font-size: 10.5px; }
.tg.portrait.tg-missing-pie .mp-banner, .tg-missing-pie[data-form="phone"] .mp-banner { font-size: 11.5px; padding: 2px 8px; }
.tg.portrait.tg-missing-pie .mp-ptile .mp-ico { width: 22px; height: 22px; }
.tg.portrait.tg-missing-pie .mp-ptile { min-height: 40px; font-size: 10px; }
@media (prefers-reduced-motion: reduce) { .tg-missing-pie .mp-place.can, .tg-missing-pie .mp-pawn.go, .tg-missing-pie .mp-card.lit, .tg-missing-pie .mp-shown { animation: none !important; } }
`;

export default {
  id: 'missing-pie',
  lid: 'a pie mystery for 3 to 6',
  tip: 'Roll, tap a glowing place, then Ask. Keep track in your Notebook.',
  render, buttons, chip, pill, describe, overPanel, rulesCard, setupLine, onKey, moments, css,
};
