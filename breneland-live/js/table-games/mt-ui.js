// Mexican Train's part of the table-game overlay (table-games, tg-look): the board and your rack drawn by tg-board (a printed
// board with the 3D tiles on it: mt-board.js lays it out and paints it), drag a tile onto a glowing spot or tap it and then the
// spot, the buttons (draw, pass, stop the first run, knock, catch, next round), the words for each moment and what each beat
// sounds and looks like (MOMENTS), the round's end counted seat by seat, the end of the game, the host's settings line and the
// rules on a ? card with pictures. The frame (overlay.js) gives each a region and calls these; everything here reads only the
// view the server sent (public, or your seat's). Where there is no tg-board (the HUD Editor's preview) the flat SVG board draws.
import { el } from '../util.js';
import { tileSvg, PIP, SEAT_COLORS, MEX_COLOR } from './dominoes.js';
import { boardLayout, drawBoard, boardPieces, rackLayout, drawRack, LANE_ROT } from './mt-board.js';
import { LOOK, boardOf } from './tg-state.js';

const SVG = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const S = 'stroke="#2b2340" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
export const ICON = {
  draw: SVG(`<rect x="4" y="9" width="11" height="12" rx="2" fill="#2f6b4f" ${S}/><rect x="8" y="5" width="11" height="12" rx="2" fill="#fbf6ea" ${S}/><path d="M13.5 8v6m-2.5-2.5 2.5 2.5 2.5-2.5" fill="none" ${S}/>`),
  pass: SVG(`<path d="M4 15c2-6 11-8 15-3" fill="none" ${S} stroke-width="2.6"/><path d="M19 7v5h-5" fill="none" ${S} stroke-width="2.6"/><rect x="3" y="17" width="9" height="4" rx="1.5" fill="#e0463c" ${S}/>`),
  end: SVG(`<path d="M6 21V4" fill="none" ${S} stroke-width="2.4"/><path d="M6 4h11l-2.5 4L17 12H6" fill="#f2b630" ${S}/>`),
  knock: SVG(`<path d="M3 5h13a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-6l-4 4v-4H3z" fill="#fff8ec" ${S}/><text x="11" y="14" text-anchor="middle" font-size="9" font-weight="700" fill="#2b2340" font-family="Fredoka, sans-serif">1</text>`),
  catch: SVG(`<circle cx="12" cy="12" r="9" fill="#ffd34d" ${S}/><path d="M12 7v6" ${S} stroke-width="2.8"/><circle cx="12" cy="16.6" r="1.4" fill="#2b2340"/>`),
  next: SVG(`<circle cx="12" cy="12" r="9" fill="#7ddc7a" ${S}/><path d="M10 8l5 4-5 4z" fill="#2b2340"/>`),
  rules: SVG(`<circle cx="12" cy="12" r="9" fill="#fff8ec" ${S}/><path d="M9.5 9.5a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1.9-1.1 1.8" fill="none" ${S}/><circle cx="12" cy="16.8" r="1.2" fill="#2b2340"/>`),
  stand: SVG(`<path d="M6 4v9h8v7M6 13v7M6 9h8" fill="none" ${S} stroke-width="2.4"/><path d="M16 8h5m-2-2 2 2-2 2" fill="none" ${S}/>`),
  view: SVG(`<path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7z" fill="#fff8ec" ${S}/><circle cx="12" cy="12" r="3.4" fill="#2b2340"/>`),
  view3: SVG(`<rect x="3" y="6" width="14" height="12" rx="2" fill="#ffd34d" ${S}/><path d="M17 10l4-2.5v9L17 14" fill="#ffd34d" ${S}/>`),
  hurry: SVG(`<path d="M4 6l7 6-7 6zM12 6l7 6-7 6z" fill="#fff8ec" ${S}/>`),
  close: SVG(`<path d="M6 6l12 12M18 6L6 18" fill="none" ${S} stroke-width="2.8"/>`),
  train: SVG(`<rect x="3" y="9" width="11" height="7" rx="1.5" fill="currentColor" ${S}/><rect x="11" y="5" width="7" height="11" rx="1.5" fill="currentColor" ${S}/><circle cx="7" cy="18" r="2" fill="#2b2340"/><circle cx="15" cy="18" r="2" fill="#2b2340"/>`),
  bot: SVG(`<rect x="5" y="7" width="14" height="11" rx="3" fill="#c9d7e6" ${S}/><circle cx="9.5" cy="12" r="1.6" fill="#2b2340"/><circle cx="14.5" cy="12" r="1.6" fill="#2b2340"/><path d="M12 7V4" ${S}/><circle cx="12" cy="3.5" r="1.3" fill="#e0463c"/>`),
  folk: SVG(`<circle cx="12" cy="8" r="4" fill="#ffb347" ${S}/><path d="M4 21c1-5 4-7 8-7s7 2 8 7" fill="#7ddc7a" ${S}/>`),
  tiles: SVG(`<rect x="7" y="3" width="10" height="18" rx="2" fill="#fbf6ea" ${S}/><path d="M8.5 12h7" ${S}/>`, '0 0 24 24'),
};
const ico = (k, cls = '') => { const s = el('span', 'tg-ico ' + cls); s.innerHTML = ICON[k]; return s; }; // (static markup only, never a player's words)
export { ico };

// the deal: tiles in each hand by set and players (lib/table-games/mexican-train.js DEAL, shown in the host's settings line)
const DEAL = { 6: { 2: 7, 3: 7, 4: 5, 5: 4, 6: 3, 7: 3, 8: 3 }, 12: { 2: 15, 3: 15, 4: 15, 5: 12, 6: 12, 7: 10, 8: 10 } };
export const dealLine = (settings, n) => { const set = settings && settings.length === 'full' ? 12 : 6, k = DEAL[set][Math.max(2, Math.min(8, n))]; return `${set === 12 ? 'Double-12, 13 rounds' : 'Double-6, 7 rounds'}: ${k} tiles each for ${Math.max(2, n)} players`; };

const key = t => t[0] + '-' + t[1];
const sameTile = (a, b) => (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
// who is engine seat k at this table: { name, chair, color, kind }
export const seatInfo = (T, k) => { const chair = T.order ? T.order[k] : k, s = T.seats[chair] || {}; return { name: s.name || 'Seat ' + (k + 1), chair, color: SEAT_COLORS[chair % 8], kind: s.kind, sid: s.sid, away: s.away }; };
const trainName = (T, v, i, me) => (i >= v.n || v.trains[i]?.mexican ? 'the Mexican Train' : i === me ? 'your train' : seatInfo(T, i).name + "'s train");

// ---------------------------------------------------------------- the board
// S: { T (the table), v (the view: yours or the public one), me (your engine seat or null), sel (the picked tile or null), spots
//      (train indexes it may go on), onSpot(train) }
export function renderBoard(box, S) {
  const tb = boardOf(box); if (tb) return renderBoard3(tb, box, S);
  // no 3D here (the HUD Editor's preview): the same printed board, the tiles drawn flat on it
  const { T, v, me } = S;
  box.textContent = '';
  if (!v) return;
  const W = box.clientWidth || 600, H = box.clientHeight || 300, B = boardLayout(W, H, v, k => seatInfo(T, k), me);
  box.closest('.tg')?.classList.add('b3');
  const c = el('canvas', 'tg-b2'); const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = W * dpr; c.height = H * dpr; Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  const g = c.getContext('2d'); g.scale(dpr, dpr); drawBoard(g, B); box.append(c);
  for (const p of boardPieces(B, v, k => seatInfo(T, k))) {
    let e;
    if (p.kind === 'engine') { e = ico('train', 'tg-marker'); e.style.color = p.data.color; }
    else { const vert = Math.abs(Math.sin(p.rot)) < 0.5; e = tileSvg(p.data.a, p.data.b, { vertical: vert, down: !!p.down }); }
    const vert = p.kind !== 'engine' && Math.abs(Math.sin(p.rot)) < 0.5, w = p.kind === 'engine' ? p.size * 0.8 : vert ? p.size / 2 : p.size, h = p.kind === 'engine' ? p.size * 0.8 : vert ? p.size : p.size / 2;
    Object.assign(e.style, { position: 'absolute', left: Math.round(p.x - w / 2) + 'px', top: Math.round(p.y - h / 2) + 'px', width: Math.round(w) + 'px', height: Math.round(h) + 'px' });
    box.append(e);
  }
  for (const i of S.spots || []) { const L = B.lanes.find(x => x.train === i); if (!L) continue; const sp = el('span', 'tg-spot'); Object.assign(sp.style, { position: 'absolute', left: Math.round(L.next.x - B.Lt / 2) + 'px', top: Math.round(L.next.y - B.Lt / 4) + 'px', width: B.Lt + 'px', height: Math.round(B.Lt / 2) + 'px' }); box.append(sp); }
}

// ---------------------------------------------------------------- your hand
// H: { tiles (in your order), playable (keys with a play), sel (key), drawn (the tile just drawn), onPick(tile, i), onDrag... }
export function renderHand(box, H) {
  const tb = boardOf(box); if (tb) return renderHand3(tb, box, H);
  box.textContent = '';
  const tiles = H.tiles || [];
  if (!tiles.length) { box.append(el('div', 'tg-hand-empty', H.note || '')); return; }
  // no 3D here (the HUD Editor's preview): the rack, the tiles drawn flat on it
  const W = box.clientWidth || 500, Hh = box.clientHeight || 90, R = rackLayout(W, Hh, tiles.length);
  box.closest('.tg')?.classList.add('b3hand');
  const c = el('canvas', 'tg-b2'); const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = W * dpr; c.height = Hh * dpr; Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  const g = c.getContext('2d'); g.scale(dpr, dpr); drawRack(g, R); box.append(c);
  tiles.forEach((t, i) => { const e = tileSvg(t[0], t[1], { vertical: true }), sel = H.sel === key(t); Object.assign(e.style, { position: 'absolute', left: Math.round(R.x0 + i * R.step - R.L / 4) + 'px', top: Math.round(R.y - R.L / 2 - (sel ? R.L * 0.12 : 0)) + 'px', width: Math.round(R.L / 2) + 'px', height: Math.round(R.L) + 'px' }); box.append(e); });
}

// ---------------------------------------------------------------- the board and the rack on tg-board
// Each region keeps a little memory: the tiles it showed (a new one slides in from whoever played it, your own from where it
// left your rack), the trains that were open (one that opens lights its lane), your own order of the rack.
const MEM = new WeakMap();
const memOf = e => { let m = MEM.get(e); if (!m) MEM.set(e, m = { ids: new Map(), round: -1, table: null, order: [], known: new Set(), B: null, H: null }); return m; };
let lastB = null; // the board as last laid out (the rack's draws fly in from its boneyard)
const px = v => Math.round(v) + 'px';
const box4 = (e, x, y, w, h) => { e.style.left = px(x); e.style.top = px(y); e.style.width = px(w); e.style.height = px(h); };
function renderBoard3(tb, box, S) {
  const { T, v, me } = S;
  box.textContent = '';
  LOOK.openId = T.id;
  if (!v) { tb.setBoard(null); return; }
  const W = box.clientWidth, H = box.clientHeight; if (!W || !H) return;
  const info = k => seatInfo(T, k);
  const B = boardLayout(W, H, v, info, me), mem = memOf(box), fresh = mem.round !== v.round || mem.table !== T.id;
  lastB = B; LOOK.layout = B;
  const laneOf = i => B.lanes.find(L => L.train === i);
  const pieces = boardPieces(B, v, info);
  const lp = LOOK.lastPlace && LOOK.lastPlace.table === T.id && Date.now() - LOOK.lastPlace.at < 4000 ? LOOK.lastPlace : null;
  for (const p of pieces) {
    if (p.train == null) continue;
    const k = tileKey(p.tile); if (fresh || mem.ids.get(p.id) === k) continue;
    const mine = tb.lastPose('h:' + k);
    if (mine) { const flip = p.tile[0] !== Number(k.split('-')[0]) && p.tile[0] !== p.tile[1]; p.from = { pose: { ...mine.pose, rot: mine.pose.rot } }; if (flip) p.from.pose.rot += Math.PI; p.dur = 0.26; p.arc = 6; }
    else if (lp && lp.train === p.train) { const src = laneOf(lp.seat) || laneOf(p.train); p.from = { at: 'board', x: src.plate.x + src.plate.w / 2, y: src.plate.y + src.plate.h / 2, rot: p.rot, size: B.Lt * 0.9, lift: 8 }; }
  }
  mem.ids = new Map(pieces.filter(p => p.train != null).map(p => [p.id, tileKey(p.tile)])); mem.round = v.round; mem.table = T.id; mem.B = B;
  // the spots the picked tile may go: the next place on those lanes, the tile turned the way it will lie
  const sel = S.sel, selDbl = sel && sel[0] === sel[1];
  const spots = (S.spots || []).map(i => {
    const L = laneOf(i); if (!L) return null;
    const end = v.trains[i].end ?? v.engine, n = L.next;
    const rot = selDbl ? 0 : sel && sel[0] === end ? LANE_ROT : LANE_ROT + Math.PI;
    return { id: 'train' + i, train: i, x: selDbl ? n.x - B.Lt / 4 : n.x, y: n.y, rot, size: B.Lt, w: selDbl ? B.Lt / 2 : B.Lt, h: selDbl ? B.Lt : B.Lt / 2, for: sel ? ['h:' + tileKey(sel)] : null };
  }).filter(Boolean);
  // the proxies over the pieces: what a tap, a key and a screen reader find (the 3D is a picture)
  const P = el('div', 'tg-b3');
  for (const L of [...B.lanes].sort((a, b) => a.train - b.train)) { // (in train order for keys and readers; placed where the board shows them)
    const row = el('div', 'tg-row' + (L.mex ? ' mex' : '') + (L.mine ? ' mine' : '') + (L.turn ? ' turn' : '') + (L.pending ? ' pending' : ''), '', { 'data-train': L.train, 'aria-label': trainName(T, v, L.train, me) + (L.open && !L.mex ? ', open to all' : '') });
    box4(row, L.x0, L.top, L.x1 - L.x0, L.h); row.style.setProperty('--seat', L.color);
    const lit = LOOK.lit && LOOK.lit.table === T.id && LOOK.lit.train === L.train && Date.now() - LOOK.lit.at < 1800;
    if (lit) row.classList.add('lit');
    for (const s of L.shown) { const t = el('span', 'tg-tile', '', { 'aria-label': `${s.tile[0]} and ${s.tile[1]}` }); box4(t, s.x - s.w / 2 - L.x0, s.y - s.h / 2 - L.top, s.w, s.h); row.append(t); }
    if (L.more) { const m = el('span', 'tg-more', '+' + L.more.n, { title: `${L.more.n} more on this train` }); box4(m, L.more.x - L.x0, L.more.y - L.top, L.more.w, L.more.h); row.append(m); }
    P.append(row);
    if (L.pending && L.shown.length) { const d = L.shown[L.shown.length - 1], r = el('div', 'tg-ring', '', { 'aria-hidden': 'true' }); const s2 = Math.max(d.w, d.h) * 1.35; box4(r, d.x - s2 / 2, d.y - s2 / 2, s2, s2); P.append(r); }
  }
  for (const sp of spots) {
    const b = el('button', 'tg-spot', '', { type: 'button', 'data-train': sp.train, 'data-spot': sp.id, 'aria-label': 'Play it on ' + trainName(T, v, sp.train, me) });
    box4(b, sp.x - sp.w / 2 - 3, sp.y - sp.h / 2 - 3, sp.w + 6, sp.h + 6);
    b.onclick = e => { e.stopPropagation(); S.onSpot(sp.train); };
    P.append(b);
  }
  if (v.boneyard != null) { const c = el('span', 'tg-bone', String(v.boneyard), { title: `${v.boneyard} left in the boneyard`, 'aria-label': `${v.boneyard} tiles in the boneyard` }); box4(c, B.tray.x + B.tray.w - 18, B.tray.y - 9, 30, 20); P.append(c); }
  box.append(P);
  const fonts = !document.fonts || document.fonts.check('700 12px Fredoka');
  const key = JSON.stringify([W, H, fonts, B.Lt, B.lanes.map(L => [L.train, L.name, L.color, L.score, L.open, L.turn, L.mine, L.row])]);
  if (!fonts && document.fonts && !mem.fontWait) { mem.fontWait = true; document.fonts.load('700 12px Fredoka').then(() => { mem.fontWait = false; if (mem.last) renderBoard3(tb, box, mem.last); }).catch(() => {}); }
  mem.last = S;
  tb.setBoard({
    key, w: W, h: H, art: g => drawBoard(g, B), pieces, spots, tile: B.Lt,
    hooks: {
      onDrop: (id, spotId) => { const sp = spots.find(x => x.id === spotId); if (!sp) return false; LOOK.dropAt = Date.now(); S.onSpot(sp.train); return true; },
      onHover: spotId => { for (const e of box.querySelectorAll('.tg-spot')) e.classList.toggle('hot', e.dataset.spot === spotId); },
    },
  });
}
function renderHand3(tb, box, H) {
  box.textContent = '';
  const mem = memOf(box); mem.H = H;
  const all = H.tiles || [];
  if (!all.length) { // out of tiles: the rack stays, empty
    mem.known = new Set(); const W0 = box.clientWidth, H0 = box.clientHeight; if (!W0 || !H0) return;
    box.append(el('div', 'tg-hrow b3')); const R0 = rackLayout(W0, H0, 1);
    tb.setRack({ key: W0 + 'x' + H0, w: W0, h: H0, art: g => drawRack(g, R0), pieces: [], hooks: {} }); return;
  }
  // your order (a drag along the rack moves a tile), new tiles at the end
  const keys = all.map(tileKey), order = mem.order.filter(k => keys.includes(k));
  for (const k of keys) if (!order.includes(k)) order.push(k);
  mem.order = order;
  const tiles = order.map(k => all.find(t => tileKey(t) === k));
  const W = box.clientWidth, Hh = box.clientHeight; if (!W || !Hh) return;
  const R = rackLayout(W, Hh, tiles.length), dealt = tiles.filter(t => !mem.known.has(tileKey(t))).length;
  const B = lastB;
  const pieces = tiles.map((t, i) => {
    const k = tileKey(t), sel = H.sel === k;
    const p = { id: 'h:' + k, kind: 'domino', x: R.x0 + i * R.step, y: sel ? R.y - R.L * 0.1 : R.y, rot: 0, lean: sel ? 0.2 : 0.36, size: R.L, lift: sel ? R.L * 0.2 : 0, data: { a: t[0], b: t[1] }, drag: true };
    if (!mem.known.has(k) && B && mem.dealing) { // (a draw, or a new round's deal; not the tiles you had when the overlay opened)
      p.from = { at: 'board', x: B.tray.x + B.tray.w / 2, y: B.tray.y + B.tray.h / 2, rot: 0.6, size: B.Lt * 0.9, down: true };
      p.dur = 0.5; p.arc = 40; if (dealt > 2) p.delay = 0.05 * i;
    }
    return p;
  });
  mem.known = new Set(order); mem.dealing = true;
  const row = el('div', 'tg-hrow b3');
  tiles.forEach((t, i) => {
    const k = tileKey(t), can = H.playable.has(k), p = pieces[i];
    const b = el('button', 'tg-htile' + (H.sel === k ? ' sel' : '') + (can ? ' can' : ' cant') + (H.drawn && sameTile(H.drawn, t) ? ' new' : ''), '', { type: 'button', 'data-tile': k, 'data-i': i, 'aria-label': `${t[0]} and ${t[1]}${can ? '' : ' (no place for it now)'}`, 'aria-pressed': H.sel === k ? 'true' : 'false' });
    const w = R.L / 2, h = Math.min(Hh - 4, R.L * 1.02);
    box4(b, Math.max(0, Math.min(W - w, R.x0 + i * R.step - w / 2)), Math.max(2, Math.min(Hh - h - 2, R.y - h / 2)), w, h);
    b.addEventListener('pointerdown', e => tb.press(e, p.id));
    b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); H.onPick(t, i); } });
    b.addEventListener('click', e => e.stopPropagation());
    row.append(b);
  });
  box.append(row);
  const tileOf = id => tiles.find(t => 'h:' + tileKey(t) === id);
  const SND = { lift: 'tg-lift', back: 'tg-back', hover: 'tg-hover' };
  tb.setRack({
    key: W + 'x' + Hh, w: W, h: Hh, art: g => drawRack(g, R), pieces,
    hooks: {
      onTap: id => { const t = tileOf(id); if (t) mem.H.onPick(t); },
      onLift: id => { const t = tileOf(id), k = t && tileKey(t); if (t && mem.H.sel !== k && mem.H.playable.has(k)) mem.H.onPick(t); },
      onCancel: id => { const t = tileOf(id); if (t && mem.H.sel === tileKey(t)) mem.H.onPick(t); },
      onReorder: (id, at) => { const k = id.slice(2), o = mem.order.filter(x => x !== k); o.splice(Math.max(0, Math.min(o.length, at)), 0, k); mem.order = o; mem.H.onOrder?.(o); renderHand3(tb, box, mem.H); },
      sound: kind => SND[kind] && LOOK.sound(SND[kind]),
    },
  });
}
// a face-down tile from the boneyard to another player's plate (their draw)
function drawFlight(tb, seat, count = 1) {
  const B = lastB; if (!B) return;
  const L = B.lanes.find(x => x.train === seat); if (!L) return;
  for (let i = 0; i < Math.min(3, count); i++) setTimeout(() => tb.flight({ data: { a: 0, b: 0 }, from: { at: 'board', x: B.tray.x + B.tray.w / 2, y: B.tray.y + B.tray.h / 2, rot: 0.5, size: B.Lt * 0.9, down: true }, to: { at: 'board', x: L.plate.x + L.plate.w / 2, y: L.plate.y + L.plate.h / 2, rot: -0.3, size: B.Lt * 0.5, down: true }, dur: 0.45, arc: 36 }), i * 140);
}

// ---------------------------------------------------------------- what each beat sounds and looks like (tg-look.js routes them)
// c: { T, open (your overlay is on this table), me (your seat, or null), play(sound, delayMs), eye (the eyecatches, open only),
//      tb (the board, open only), look }
const who = (c, k) => (k === c.me ? 'You' : seatInfo(c.T, k).name);
export function MOMENTS(b, c) {
  const { play, eye, me, T, look } = c;
  const land = c.open ? 330 : 450; // (the slide on the board, or on the real table for a passer-by)
  switch (b.kind) {
    case 'start': case 'deal': play('tg-deal'); break;
    case 'turn': if (me != null && b.seat === me) { if (eye) eye.turn(() => play('tg-yourturn')); else play('tg-yourturn'); } break;
    case 'place': {
      look.lastPlace = { table: T.id, train: b.train, seat: b.seat, tile: b.tile, at: Date.now() };
      const held = me != null && b.seat === me && Date.now() - look.dropAt < 4000;
      play('tg-tile', held ? 40 : land);
      if (b.answers) play('tg-answer', (held ? 40 : land) + 170);
      break;
    }
    case 'double': play('tg-ring', land + 90); if (eye) { look.stampAt = Date.now(); eye.stamp('Double!', b.seat === me ? 'Answer it yourself if you can' : 'It must be answered first', { color: '#e3aa45', sound: () => play('tg-stamp') }); } break;
    case 'draw': play('tg-draw'); if (c.tb && b.seat !== me) drawFlight(c.tb, b.seat, b.count); break;
    case 'pass': play('tg-chuff', 120); break;
    case 'marker': if (b.up) look.lit = { table: T.id, train: b.seat, at: Date.now() }; break;
    case 'knock': play('tg-onetile'); break;
    case 'caught': if (eye) eye.stamp('Caught!', `${who(c, b.seat)} forgot to knock: draw two`, { color: '#e0463c', sound: () => play('tg-stamp') }); break;
    case 'out': if (eye) eye.stamp('Domino!', `${who(c, b.seat)} ${b.seat === me ? 'are' : 'is'} out`, { color: '#4fa45a', sound: () => play('tg-stamp') }); else play('tg-cheer'); break;
    case 'blocked': if (eye) eye.stamp('Blocked!', 'Nobody can go', { color: '#3f8fd9', sound: () => play('tg-stamp') }); break;
    default: break;
  }
}

// ---------------------------------------------------------------- the buttons for your seat (a move each), in a fixed order
export function moveButtons(T, v, moves, me) {
  const out = [];
  const has = t => moves.find(m => m.type === t);
  if (has('next')) out.push({ id: 'next', icon: 'next', label: 'Next round', key: 'Enter', move: has('next'), hot: true });
  if (has('draw')) out.push({ id: 'draw', icon: 'draw', label: 'Draw a tile', key: 'D', move: has('draw'), hot: true });
  if (has('pass')) out.push({ id: 'pass', icon: 'pass', label: 'Pass (your train opens)', key: 'P', move: has('pass'), hot: true });
  if (has('end')) out.push({ id: 'end', icon: 'end', label: 'Stop my first run', key: 'S', move: has('end') });
  if (has('knock')) out.push({ id: 'knock', icon: 'knock', label: 'One tile left!', key: 'K', move: has('knock'), hot: (v.hand || []).length <= 2 });
  for (const m of moves.filter(x => x.type === 'catch')) out.push({ id: 'catch-' + m.seat, icon: 'catch', label: `Catch ${seatInfo(T, m.seat).name}: they forgot to knock!`, key: 'C', move: m, hot: true });
  void me;
  return out;
}
// where a tile may go (train indexes) from your moves
export const spotsFor = (moves, tile) => (tile ? moves.filter(m => m.type === 'play' && sameTile(m.tile, tile)).map(m => m.train) : []);
export const playableKeys = moves => new Set(moves.filter(m => m.type === 'play').map(m => key(m.tile[0] <= m.tile[1] ? m.tile : [m.tile[1], m.tile[0]])));
export const tileKey = t => key(t[0] <= t[1] ? t : [t[1], t[0]]);

// ---------------------------------------------------------------- the words for each moment (the slip), and what it shows
export function describe(T, v, b, me) {
  const who = k => (k === me ? 'You' : seatInfo(T, k).name);
  const t = b.tile ? `${b.tile[0]}|${b.tile[1]}` : '';
  switch (b.kind) {
    case 'start': return 'The game is on!';
    case 'deal': return v ? `Round ${v.round + 1} of ${v.rounds}: the ${v.engine}-${v.engine} engine. First turns: lay all you can on your own train.` : 'Dealing...';
    case 'place': return `${who(b.seat)} ${b.seat === me ? 'play' : 'plays'} ${t} on ${b.train === b.seat ? (b.seat === me ? 'your train' : 'their train') : trainName(T, v, b.train, me)}${b.answers ? ', answering the double' : ''}.`;
    case 'double': return `A double! ${b.seat === me ? 'Answer it yourself if you can.' : 'It must be answered first.'}`;
    case 'draw': return b.why === 'caught' ? `${who(b.seat)} ${b.seat === me ? 'draw' : 'draws'} ${b.count}.` : `${who(b.seat)} ${b.seat === me ? 'draw' : 'draws'} a tile.`;
    case 'pass': return `${who(b.seat)} can't go. ${b.seat === me ? 'Your' : 'Their'} train is open to all.`;
    case 'marker': return b.up ? '' : `${who(b.seat)} ${b.seat === me ? 'close' : 'closes'} ${b.seat === me ? 'your' : 'their'} train again.`;
    case 'runEnd': return b.count ? `${who(b.seat)} laid ${b.count} on the first run.` : '';
    case 'knock': return `${who(b.seat)}: one tile left!`;
    case 'caught': return `${who(b.by)} caught ${b.seat === me ? 'you' : who(b.seat)} not knocking! Draw two.`;
    case 'out': return `${who(b.seat)} ${b.seat === me ? 'are' : 'is'} out! Domino!`;
    case 'blocked': return 'Nobody can go. The round is blocked.';
    case 'roundEnd': return `Round over. Count the pips!`;
    case 'gameOver': return 'Game over!';
    default: return '';
  }
}

// ---------------------------------------------------------------- the round's end: every hand shown and the pips counted seat by seat
// The card counts when it shows (overlay.js calls onShow): a tick a pip or two, a thunk as each seat is done, a ribbon for the
// round's winner (who went out, or the fewest pips).
export function roundPanel(T, b, me) {
  const box = el('div', 'tg-round');
  const pips = b.pips || [], lo = pips.length ? Math.min(...pips) : 0, won = b.out != null ? b.out : pips.indexOf(lo);
  const wn = won >= 0 ? (won === me ? 'You' : seatInfo(T, won).name) : '';
  const rib = el('div', 'tg-ribbon', '', { 'aria-hidden': 'true' }); rib.append(el('b', '', wn ? `${wn} ${won === me ? 'win' : 'wins'} the round` : 'Round over'));
  if (won >= 0) rib.style.setProperty('--seat', seatInfo(T, won).color);
  box.append(rib, el('div', 'tg-h', `Round ${(b.round ?? -1) + 1 || ''} over`), el('p', 'tg-sub', b.why === 'blocked' ? 'Blocked: nobody could go.' : b.out != null ? `${b.out === me ? 'You' : seatInfo(T, b.out).name} went out.` : ''));
  const list = el('div', 'tg-count');
  pips.forEach((p, k) => {
    const s = seatInfo(T, k), row = el('div', 'tg-crow' + (k === won ? ' won' : '')); row.style.setProperty('--seat', s.color); row.style.setProperty('--i', k);
    const tiles = el('span', 'tg-cmini');
    for (const t of (b.hands && b.hands[k]) || []) { const sv = tileSvg(t[0], t[1], { vertical: true }); tiles.append(sv); }
    const pp = el('b', 'tg-cpips', '0'); pp.dataset.to = p;
    row.append(el('i', 'tg-dot'), el('span', 'tg-cname', k === me ? 'You' : s.name), tiles, pp, el('span', 'tg-ctot', String((b.totals || [])[k] ?? '')));
    list.append(row);
  });
  box.append(list);
  // count up, one seat after the other, a tick as the number climbs
  const rows = [...list.children]; let i = 0, started = false;
  const step = () => {
    const r = rows[i++]; if (!r || !box.isConnected) return;
    r.classList.add('on');
    const p = r.querySelector('.tg-cpips'), to = Number(p.dataset.to) || 0, t0 = performance.now(), d = Math.min(900, 250 + to * 25);
    let shown = 0;
    const tick = () => { const k = Math.min(1, (performance.now() - t0) / d), n = Math.round(to * k); if (n !== shown) { if (n - shown >= 1 && (n % 2 === 0 || to < 12)) LOOK.sound('tg-tick'); shown = n; p.textContent = String(n); } if (k < 1 && box.isConnected) requestAnimationFrame(tick); else { LOOK.sound('tg-tally'); setTimeout(step, 180); } };
    tick();
  };
  box.onShow = () => { if (started) return; started = true; rib.classList.add('in'); setTimeout(step, 300); };
  return box;
}
export function overPanel(T, res, me) {
  const box = el('div', 'tg-round over');
  const totals = (res && res.totals) || [], win = (res && res.winners) || [];
  const names = win.map(k => (k === me ? 'You' : seatInfo(T, k).name));
  const rib = el('div', 'tg-ribbon gold', '', { 'aria-hidden': 'true' }); rib.append(el('b', '', 'Game won'));
  box.append(rib, el('div', 'tg-h', names.length ? `${names.join(' and ')} ${names.length > 1 || names[0] === 'You' ? 'win' : 'wins'}!` : 'Game over'), el('p', 'tg-sub', 'Lowest total wins.'));
  const order = totals.map((v, k) => k).sort((a, b) => totals[a] - totals[b]);
  const list = el('div', 'tg-count');
  for (const k of order) { const s = seatInfo(T, k), row = el('div', 'tg-crow on' + (win.includes(k) ? ' win' : '')); row.style.setProperty('--seat', s.color); row.append(el('i', 'tg-dot'), el('span', 'tg-cname', k === me ? 'You' : s.name), el('b', 'tg-ctot', String(totals[k]))); list.append(row); }
  box.append(list, el('p', 'tg-note', res && res.counted ? 'On the store window leaderboard.' : 'A bot played, so this one is just for fun (not on the leaderboard).'));
  // shown: confetti in the store's colours and a fanfare for the winner (a friendly cadence for everyone else)
  let done = false;
  box.onShow = () => { if (done) return; done = true; rib.classList.add('in'); LOOK.eye?.confetti(); LOOK.sound(me != null && win.includes(me) ? 'tg-fanfare' : 'tg-cheer'); };
  return box;
}

// ---------------------------------------------------------------- the rules on a card, with pictures
export function rulesCard() {
  const c = el('div', 'tg-rules');
  c.append(el('div', 'tg-h', 'Mexican Train'));
  const row = (pic, text) => { const r = el('div', 'tg-rrow'); const p = el('div', 'tg-rpic'); for (const x of pic) p.append(x); r.append(p, el('p', '', text)); c.append(r); };
  const T = (a, b, o) => tileSvg(a, b, o);
  const train = col => { const s = ico('train', 'tg-marker'); s.style.color = col; return s; };
  row([T(6, 6, { vertical: true }), T(6, 3), T(3, 5)], 'Match the open end. On your turn play one tile on your own train, on the Mexican Train, or on any train with an engine on it.');
  row([T(0, 0, { down: true, vertical: true }), train('#e0463c')], 'Nothing fits? Draw one. Still nothing? Pass: your engine goes up and anyone may play on your train until you play on it again.');
  row([T(4, 4, { vertical: true }), el('b', 'tg-rarrow', '!'), T(4, 1)], 'A double must be answered first, by you or the next player along, before anything else is played.');
  row([T(6, 2), T(2, 2, { vertical: true }), T(2, 5)], 'Your first turn of a round: lay as many as fit, one after another, on your own train.');
  row([ico('knock')], 'Down to one tile? Tap the speech bubble. Forget, and anyone can catch you: you draw two.');
  row([T(3, 4, { vertical: true }), el('b', 'tg-rarrow', '= 7')], 'A round ends when someone plays their last tile. The pips left in your hand count against you. Lowest total wins.');
  return c;
}
export const PIPCOL = PIP;
