// Mexican Train on tg-board (tg-look): the board's layout, its printed art and its pieces. A wooden table edge round a green
// baize; printed on it the station hub (the engine double sits in it), a lane per train fanning out from the hub, each with its
// seat's colour band, rails and a name plate with the score (the Mexican Train's lane in gold with its star), and the boneyard
// tray under the hub. The trains' tiles, the hub's engine, the open trains' little engines and the boneyard's face-down tiles
// are the 3D pieces; a legal spot is the next place on a lane. The rack under it: your tiles leaning on a wooden rack.
// Plain layout maths and 2D drawing; mt-ui.js feeds the result to tg-board.
import { SEAT_COLORS, MEX_COLOR, INK } from './dominoes.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FONT = 'Fredoka, "Trebuchet MS", sans-serif';
const h01 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
export const LANE_ROT = -Math.PI / 2; // a tile lying along a lane, its first number toward the hub

// the lanes top to bottom: the Mexican Train first, then the seats, yours last (nearest your rack)
export function laneOrder(v, me) {
  const n = v.n, seats = [...Array(n).keys()];
  const order = me != null ? [...seats.slice(me + 1), ...seats.slice(0, me + 1)] : seats;
  return [n, ...order].filter(i => v.trains[i]);
}

// W, H: the board region (px); v: the view; info(k) -> { name, color } for engine seat k; me: your seat or null
export function boardLayout(W, H, v, info, me) {
  const rim = Math.round(clamp(Math.min(W, H) * 0.035, 7, 16));
  const felt = { x: rim, y: rim, w: W - 2 * rim, h: H - 2 * rim };
  const p = Math.round(clamp(Math.min(W, H) * 0.022, 5, 12));
  const hc = Math.round(clamp(Math.min(felt.h * 0.38, felt.w * 0.2), 62, 150));
  const trayH = Math.round(clamp(felt.h * 0.22, 30, 86)), compactTray = felt.h < 210;
  const tray = { x: felt.x + p, y: felt.y + felt.h - p - trayH, w: hc - p * 1.5, h: trayH };
  const hubSpace = compactTray ? felt.h - 2 * p : felt.h - trayH - 3 * p;
  const hubR = Math.round(clamp(Math.min(hc * 0.44, hubSpace * 0.42), 22, 70));
  const hub = { cx: felt.x + p * 0.5 + hc / 2, cy: compactTray ? felt.y + felt.h / 2 : felt.y + p + hubSpace / 2, r: hubR };
  if (compactTray) { tray.h = Math.min(trayH, felt.h * 0.26); tray.y = felt.y + felt.h - p - tray.h; tray.w = Math.min(tray.w, hc * 0.7); tray.x = felt.x + p * 0.6; hub.cy = felt.y + (felt.h - tray.h) / 2; hub.r = Math.min(hub.r, (felt.h - tray.h - p * 2) * 0.46); }
  const order = laneOrder(v, me), m = order.length;
  const lx0 = felt.x + hc + p * 0.5, lx1 = felt.x + felt.w - p, ly0 = felt.y + p * 0.6, ly1 = felt.y + felt.h - p * 0.6;
  const laneH = (ly1 - ly0) / m, gap = Math.max(2, Math.round(laneH * 0.06));
  const Lt = Math.round(clamp(Math.min((laneH - gap) * 0.86, (lx1 - lx0) / 5.2, 76), 18, 76));
  const plateW = Math.round(clamp((lx1 - lx0) * 0.17, 30, 138)), compact = plateW < 76;
  const engW = Math.round(Lt * 0.92);
  const lanes = order.map((train, row) => {
    const t = v.trains[train], mex = !!t.mexican || train >= v.n, k = mex ? null : train;
    const s = mex ? { name: 'Mexican Train', color: MEX_COLOR } : info(train);
    const top = ly0 + row * laneH, cy = top + laneH / 2;
    return {
      train, row, top: top + gap / 2, h: laneH - gap, cy, x0: lx0, x1: lx1, mex, mine: k != null && k === me, seat: k,
      color: s.color, name: k === me ? 'You' : s.name, score: k != null ? (v.scores?.totals?.[k] ?? 0) : null,
      open: !!t.open || mex, turn: v.turn === train && v.phase === 'play' && !mex, pending: !!(v.pending && v.pending.train === train),
      plate: { x: lx0 + 3, y: cy - Math.min(laneH - gap, Lt * 0.9) / 2, w: plateW, h: Math.min(laneH - gap, Lt * 0.9) },
      engine: { x: lx0 + 3 + plateW + engW / 2 + 2, y: cy },
      tilesX: lx0 + 3 + plateW + engW + 6,
    };
  });
  // the tiles on each lane: the newest that fit, room left for the next one
  const g = Math.max(2, Math.round(Lt * 0.06));
  for (const L of lanes) {
    const tiles = v.trains[L.train].tiles || [];
    const room = L.x1 - L.tilesX - (Lt + g) - 4;
    let used = 0, first = tiles.length;
    for (let j = tiles.length - 1; j >= 0; j--) { const d = tiles[j][0] === tiles[j][1], w = (d ? Lt / 2 : Lt) + g; if (used + w > room - (j > 0 ? 26 : 0)) break; used += w; first = j; }
    L.hidden = first; L.shown = [];
    let x = L.tilesX + (first > 0 ? 26 : 0);
    for (let j = first; j < tiles.length; j++) {
      const tile = tiles[j], d = tile[0] === tile[1], w = d ? Lt / 2 : Lt;
      L.shown.push({ j, tile, dbl: d, x: x + w / 2, y: L.cy, rot: d ? 0 : LANE_ROT, w: d ? Lt / 2 : Lt, h: d ? Lt : Lt / 2 });
      x += w + g;
    }
    L.more = first > 0 ? { x: L.tilesX, y: L.cy - 11, w: 24, h: 22, n: first } : null;
    L.next = { x: x + Lt / 2, y: L.cy, w: Lt, h: Lt / 2 };
  }
  return { W, H, rim, felt, p, hc, hub, tray, lanes, Lt, g, compact, laneH };
}

// ---- the printed board
function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function star(g, cx, cy, r, fill) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.46 : r; g.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); } g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = Math.max(1.2, r * 0.18); g.strokeStyle = INK; g.stroke(); }
function fitText(g, text, w, size, weight = 700) { let s = size; g.font = `${weight} ${s}px ${FONT}`; while (s > 8 && g.measureText(text).width > w) { s -= 1; g.font = `${weight} ${s}px ${FONT}`; } if (g.measureText(text).width > w) { let t = text; while (t.length > 2 && g.measureText(t + '.').width > w) t = t.slice(0, -1); return t + '.'; } return text; }

export function drawBoard(g, B) {
  const { W, H, rim, felt, hub, tray, lanes, Lt } = B;
  // the wooden table edge, ink outlined
  rr(g, 1.5, 1.5, W - 3, H - 3, 16);
  const wood = g.createLinearGradient(0, 0, 0, H); wood.addColorStop(0, '#9a6538'); wood.addColorStop(1, '#6e4224');
  g.fillStyle = wood; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
  g.save(); rr(g, 1.5, 1.5, W - 3, H - 3, 16); g.clip();
  g.strokeStyle = 'rgba(60, 32, 14, 0.35)'; g.lineWidth = 1;
  for (let i = 0; i < 26; i++) { const y = h01(i, 4) * H, x = h01(i, 5) * W; g.beginPath(); g.moveTo(x - 60, y); g.bezierCurveTo(x - 20, y + 3, x + 20, y - 3, x + 70, y + 1); g.stroke(); }
  g.restore();
  // the baize, with a soft shade at its edges and a bead of light along the rim
  rr(g, felt.x, felt.y, felt.w, felt.h, 10);
  const fg = g.createRadialGradient(felt.x + felt.w * 0.55, felt.y + felt.h * 0.4, 10, felt.x + felt.w / 2, felt.y + felt.h / 2, Math.max(felt.w, felt.h) * 0.75);
  fg.addColorStop(0, '#3b8a63'); fg.addColorStop(0.65, '#2f6b4f'); fg.addColorStop(1, '#1f4d39');
  g.fillStyle = fg; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
  g.save(); rr(g, felt.x, felt.y, felt.w, felt.h, 10); g.clip();
  for (let i = 0; i < 900; i++) { g.fillStyle = h01(i, 1) > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)'; g.fillRect(felt.x + h01(i, 2) * felt.w, felt.y + h01(i, 3) * felt.h, 1.5, 1.5); }
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.18)'; rr(g, felt.x - 2, felt.y - 2, felt.w + 4, felt.h + 4, 12); g.stroke();
  // a big faint printed engine on the cloth, the game's own mark
  g.globalAlpha = 0.06; g.fillStyle = '#fff4dc'; const mx = felt.x + felt.w * 0.62, my = felt.y + felt.h * 0.52, ms = Math.min(felt.w, felt.h) * 0.42;
  g.fillRect(mx - ms * 0.6, my - ms * 0.05, ms * 1.1, ms * 0.32); g.fillRect(mx - ms * 0.6, my - ms * 0.4, ms * 0.36, ms * 0.36); g.fillRect(mx + ms * 0.2, my - ms * 0.3, ms * 0.12, ms * 0.26);
  for (const k of [-0.42, -0.1, 0.25]) { g.beginPath(); g.arc(mx + k * ms, my + ms * 0.34, ms * 0.11, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
  g.restore();
  g.strokeStyle = 'rgba(255, 244, 220, 0.25)'; g.lineWidth = 1.2; rr(g, felt.x + 4, felt.y + 4, felt.w - 8, felt.h - 8, 8); g.stroke();

  // the rails from the hub to each lane
  for (const L of lanes) {
    const a = Math.atan2(L.cy - hub.cy, L.x0 - hub.cx), sx = hub.cx + Math.cos(a) * hub.r * 0.92, sy = hub.cy + Math.sin(a) * hub.r * 0.92;
    const path = () => { g.beginPath(); g.moveTo(sx, sy); g.bezierCurveTo(sx + (L.x0 - sx) * 0.55, sy, L.x0 - (L.x0 - sx) * 0.35, L.cy, L.x0 + 4, L.cy); };
    path(); g.lineWidth = 7; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke();
    path(); g.lineWidth = 3.5; g.strokeStyle = L.color; g.stroke();
  }
  // the lanes: a band in the seat's colour, the rails and ties printed on it, the plate with the name and the score
  for (const L of lanes) {
    const bandY = L.cy - Math.min(L.h, Lt * 0.62) / 2, bandH = Math.min(L.h, Lt * 0.62);
    rr(g, L.x0, bandY, L.x1 - L.x0, bandH, bandH / 2);
    g.fillStyle = rgba(L.color, L.open ? 0.3 : 0.17); g.fill();
    g.lineWidth = L.mine ? 2.2 : 1.4; g.strokeStyle = L.mine ? 'rgba(255, 244, 220, 0.75)' : rgba(L.color, 0.7); g.stroke();
    g.save(); rr(g, L.x0, bandY, L.x1 - L.x0, bandH, bandH / 2); g.clip();
    g.strokeStyle = 'rgba(255, 244, 220, 0.22)'; g.lineWidth = 1.2;
    for (let x = L.tilesX; x < L.x1; x += Math.max(9, Lt * 0.22)) { g.beginPath(); g.moveTo(x, bandY + bandH * 0.18); g.lineTo(x, bandY + bandH * 0.82); g.stroke(); }
    g.lineWidth = 1.6; g.strokeStyle = 'rgba(255, 244, 220, 0.3)';
    for (const k of [0.3, 0.7]) { g.beginPath(); g.moveTo(L.tilesX - 4, bandY + bandH * k); g.lineTo(L.x1, bandY + bandH * k); g.stroke(); }
    g.restore();
    // the plate
    const P = L.plate;
    if (L.turn) { g.save(); g.shadowColor = 'rgba(255, 211, 77, 0.95)'; g.shadowBlur = 14; rr(g, P.x, P.y, P.w, P.h, P.h * 0.3); g.fillStyle = '#ffd34d'; g.fill(); g.restore(); }
    rr(g, P.x, P.y + 2, P.w, P.h, P.h * 0.3); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill();
    rr(g, P.x, P.y, P.w, P.h, P.h * 0.3); g.fillStyle = L.color; g.fill(); g.lineWidth = 2.2; g.strokeStyle = INK; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.2; rr(g, P.x + 2.5, P.y + 2.5, P.w - 5, P.h - 5, P.h * 0.24); g.stroke();
    const fs = clamp(P.h * 0.36, 9, 16), pad = Math.max(4, P.h * 0.16);
    let tx = P.x + pad;
    if (L.mex) { const r = Math.min(P.h * 0.3, 11); star(g, tx + r, P.y + P.h / 2, r, '#fff4dc'); tx += r * 2 + 3; }
    const scoreW = L.score != null && !B.compact ? Math.max(20, fs * 1.9) : 0;
    if (scoreW) { rr(g, P.x + P.w - pad - scoreW, P.y + P.h / 2 - fs * 0.72, scoreW, fs * 1.44, fs * 0.72); g.fillStyle = INK; g.fill(); g.fillStyle = '#fff4dc'; g.font = `700 ${Math.round(fs * 0.9)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(L.score), P.x + P.w - pad - scoreW / 2, P.y + P.h / 2 + 1); }
    let text = B.compact ? (L.mex ? '' : (L.name || '?')[0]) : L.name; const tw = P.x + P.w - pad - scoreW - 3 - tx;
    if (L.mex && text) { g.font = `700 ${Math.round(fs)}px ${FONT}`; const w1 = g.measureText(text).width * 11 / Math.round(fs); if (w1 > tw) text = 'Mexican'; g.font = `700 11px ${FONT}`; if (g.measureText(text).width > tw) text = ''; }
    if (text && tw > 6) {
      const t2 = fitText(g, text, tw, Math.round(fs));
      g.textAlign = B.compact ? 'center' : 'left'; g.textBaseline = 'middle';
      const x = B.compact ? (L.mex ? tx : P.x + P.w / 2) : tx;
      g.lineWidth = 3; g.strokeStyle = 'rgba(43, 35, 64, 0.85)'; g.strokeText(t2, x, P.y + P.h / 2 + 1);
      g.fillStyle = '#ffffff'; g.fillText(t2, x, P.y + P.h / 2 + 1);
    }
  }
  // the station hub: a round brass-edged plate with eight slots
  g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
  g.beginPath(); g.arc(hub.cx, hub.cy, hub.r, 0, Math.PI * 2); g.fillStyle = '#8a6240'; g.fill(); g.restore();
  g.lineWidth = 2.5; g.strokeStyle = INK; g.beginPath(); g.arc(hub.cx, hub.cy, hub.r, 0, Math.PI * 2); g.stroke();
  const hg = g.createRadialGradient(hub.cx - hub.r * 0.3, hub.cy - hub.r * 0.3, 2, hub.cx, hub.cy, hub.r * 0.8);
  hg.addColorStop(0, '#e9cf93'); hg.addColorStop(1, '#c9a66a');
  g.beginPath(); g.arc(hub.cx, hub.cy, hub.r * 0.78, 0, Math.PI * 2); g.fillStyle = hg; g.fill(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(43,35,64,0.6)'; g.stroke();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; g.save(); g.translate(hub.cx + Math.cos(a) * hub.r * 0.89, hub.cy + Math.sin(a) * hub.r * 0.89); g.rotate(a); rr(g, -hub.r * 0.07, -hub.r * 0.11, hub.r * 0.14, hub.r * 0.22, 2); g.fillStyle = '#5a3c26'; g.fill(); g.restore(); }
  // the boneyard tray
  rr(g, tray.x, tray.y + 2, tray.w, tray.h, 9); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill();
  rr(g, tray.x, tray.y, tray.w, tray.h, 9); const tg = g.createLinearGradient(0, tray.y, 0, tray.y + tray.h); tg.addColorStop(0, '#5a3820'); tg.addColorStop(1, '#7c5130');
  g.fillStyle = tg; g.fill(); g.lineWidth = 2.2; g.strokeStyle = INK; g.stroke();
  rr(g, tray.x + 4, tray.y + 4, tray.w - 8, tray.h - 8, 6); g.fillStyle = '#3b2416'; g.fill();
}

// the 3D pieces on the board: [{ id, kind, x, y, rot, size, data, down, lift }]
export function boardPieces(B, v, info) {
  const out = [];
  const { hub, tray, lanes, Lt } = B;
  out.push({ id: 'hub', kind: 'domino', x: hub.cx, y: hub.cy, rot: LANE_ROT, size: Math.min(Lt * 1.08, hub.r * 1.55), data: { a: v.engine, b: v.engine } });
  for (const L of lanes) {
    for (const s of L.shown) out.push({ id: `t${L.train}:${s.j}`, kind: 'domino', x: s.x, y: s.y, rot: s.rot, size: Lt, data: { a: s.tile[0], b: s.tile[1] }, train: L.train, tile: s.tile });
    if (L.open) out.push({ id: 'eng' + L.train, kind: 'engine', x: L.engine.x, y: L.engine.y, rot: LANE_ROT, size: Lt * 0.98, data: { color: L.mex ? MEX_COLOR : L.color }, pop: L.mex ? 0 : 1 });
  }
  const nb = Math.min(v.boneyard || 0, 9), ts = Math.min(Lt * 0.9, tray.h * 0.62, tray.w * 0.42);
  for (let j = 0; j < nb; j++) {
    const x = tray.x + tray.w * (0.25 + 0.5 * h01(j, 7)), y = tray.y + tray.h * (0.32 + 0.36 * h01(j, 8));
    out.push({ id: 'bone' + j, kind: 'domino', x, y, rot: (h01(j, 9) - 0.5) * 2.4, size: ts, data: { a: 0, b: 0 }, down: true, lift: (j % 3) * ts * 0.12 });
  }
  void info;
  return out;
}
export const SEATS = SEAT_COLORS;

// ---- the rack: your tiles leaning on a little wooden rack
export function rackLayout(W, H, n) {
  const padX = Math.round(clamp(W * 0.025, 8, 22)), ledge = Math.round(clamp(H * 0.16, 9, 22));
  let L = Math.round(clamp((H - ledge - 10) / 1.16, 34, 120)), gap = Math.round(clamp(L * 0.1, 4, 10));
  const room = W - padX * 2;
  if (n * (L / 2 + gap) - gap > room) { L = Math.max(34, Math.floor(((room + gap) / n - gap) * 2)); gap = Math.round(clamp(L * 0.1, 3, 8)); }
  let step = L / 2 + gap; if (n * step - gap > room) step = (room - L / 2) / Math.max(1, n - 1);
  const total = (n - 1) * step + L / 2, x0 = W / 2 - total / 2 + L / 4;
  const y = H - ledge - L * 0.56 - 2; // (its foot on the ledge: the lean puts the bottom end a little lower)
  return { W, H, L, step, x0, y, ledge, padX };
}
export function drawRack(g, R) {
  const { W, H, ledge } = R;
  rr(g, 1.5, 1.5, W - 3, H - 3, 14);
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#b07a46'); bg.addColorStop(1, '#8a5a32');
  g.fillStyle = bg; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
  g.save(); rr(g, 1.5, 1.5, W - 3, H - 3, 14); g.clip();
  g.strokeStyle = 'rgba(70, 40, 18, 0.28)'; g.lineWidth = 1;
  for (let i = 0; i < 14; i++) { const y = 6 + h01(i, 11) * (H - ledge - 10), x = h01(i, 12) * W; g.beginPath(); g.moveTo(x - 80, y); g.bezierCurveTo(x - 30, y + 2, x + 30, y - 2, x + 90, y); g.stroke(); }
  // the back board's shade where the tiles lean, and the ledge in front
  const sh = g.createLinearGradient(0, H * 0.2, 0, H - ledge); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(40,20,8,0.28)');
  g.fillStyle = sh; g.fillRect(0, 0, W, H - ledge);
  g.restore();
  rr(g, 6, H - ledge - 3, W - 12, ledge, ledge * 0.45);
  const lg = g.createLinearGradient(0, H - ledge - 3, 0, H - 3); lg.addColorStop(0, '#d79b5e'); lg.addColorStop(1, '#a8703f');
  g.fillStyle = lg; g.fill(); g.lineWidth = 2.2; g.strokeStyle = INK; g.stroke();
  g.strokeStyle = 'rgba(255, 240, 210, 0.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(14, H - ledge); g.lineTo(W - 14, H - ledge); g.stroke();
}
