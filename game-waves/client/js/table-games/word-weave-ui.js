// Word Weave's part of the table-game overlay (game-waves, SPEC section 3): the board drawn flat (a wooden frame, cream squares,
// the bonus squares in warm colours), your rack of seven, placing (tap a rack tile then a square, or drag it there; tap a tile
// you put down to take it back; a blank asks for its letter), zoom on a small board, the buttons, the words for each moment,
// the sounds, the end card and the rules. It reads only the view the server sent. The dictionary lives on the server: here a
// local shape check (one line, no gaps, joined to the board) and the score preview; a word not in the list comes back as a toast.
import { el } from '../util.js';
import { seatInfo } from './mt-ui.js';
import { LOOK } from './tg-state.js';

const N = 15;
const SVG = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const S = 'stroke="#2b2340" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
const ICON = {
  play: SVG(`<rect x="3" y="11" width="8" height="9" rx="1.8" fill="#fbf6ea" ${S}/><rect x="13" y="11" width="8" height="9" rx="1.8" fill="#fbf6ea" ${S}/><path d="M7 3.5l5 4.5 5-4.5" fill="none" ${S} stroke-width="2.6"/><path d="M12 8V2.5" ${S} stroke-width="2.6"/>`),
  recall: SVG(`<path d="M9 5L4 10l5 5" fill="none" ${S} stroke-width="2.6"/><path d="M4 10h10a6 6 0 0 1 0 12h-3" fill="none" ${S} stroke-width="2.6"/>`),
  shuffle: SVG(`<path d="M3 7h4c5 0 6 10 11 10h3M3 17h4c2 0 3-1.5 4-3.5M14 9.5c1-1.5 2-2.5 4-2.5h3" fill="none" ${S} stroke-width="2.4"/><path d="M18.5 4.5L21 7l-2.5 2.5M18.5 14.5L21 17l-2.5 2.5" fill="none" ${S} stroke-width="2.4"/>`),
  swap: SVG(`<path d="M6 9c0-3 2.5-5 6-5s6 2 6 5" fill="none" ${S}/><path d="M4 9h16l-1.6 11H5.6z" fill="#c98a4b" ${S}/><path d="M9.5 13.5h5m-1.8-1.8 1.8 1.8-1.8 1.8M14.5 17.2h-5m1.8-1.8-1.8 1.8 1.8 1.8" fill="none" ${S} stroke-width="1.7"/>`),
  pass: SVG(`<path d="M4 15c2-6 11-8 15-3" fill="none" ${S} stroke-width="2.6"/><path d="M19 7v5h-5" fill="none" ${S} stroke-width="2.6"/>`),
  ok: SVG(`<circle cx="12" cy="12" r="9" fill="#7ddc7a" ${S}/><path d="M7.5 12.5l3 3 6-6.5" fill="none" ${S} stroke-width="2.8"/>`),
  cancel: SVG(`<path d="M6 6l12 12M18 6L6 18" fill="none" ${S} stroke-width="2.8"/>`),
  zoomout: SVG(`<circle cx="10" cy="10" r="6.5" fill="#fff8ec" ${S}/><path d="M7 10h6M15 15l5.5 5.5" fill="none" ${S} stroke-width="2.6"/>`),
  star: SVG(`<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="#ffd34d" ${S} stroke-width="1.6"/>`),
};
const ico = (k, cls = '') => { const s = el('span', 'tg-ico ' + cls); s.innerHTML = ICON[k]; return s; }; // (static markup only)
const BONUS = { d: ['2L', 'Double Letter'], t: ['3L', 'Triple Letter'], D: ['2W', 'Double Word'], T: ['3W', 'Triple Word'], '*': ['', 'Start (Double Word)'] };
const LMUL = { d: 2, t: 3 }, WMUL = { D: 2, T: 3, '*': 2 };
const who = (T, k, me) => (k === me ? 'You' : seatInfo(T, k).name);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- the local check: shape and score (no dictionary here)
export function shapeCheck(board, tiles, layout, values) {
  if (!tiles.length) return { error: 'Put some tiles on the board first.' };
  const cellAt = (r, c) => (r < 0 || c < 0 || r >= N || c >= N ? '.' : board[r][c]);
  const nw = new Map(tiles.map(t => [t.r * N + t.c, t]));
  const get = (r, c) => { const t = nw.get(r * N + c); return t ? (t.blank ? t.letter.toLowerCase() : t.letter) : cellAt(r, c); };
  const rows = new Set(tiles.map(t => t.r)), cols = new Set(tiles.map(t => t.c));
  if (rows.size > 1 && cols.size > 1) return { error: 'Tiles must be in one row or one column.' };
  let across = rows.size === 1 && cols.size > 1;
  if (tiles.length === 1) { const t = tiles[0]; across = cellAt(t.r, t.c - 1) !== '.' || cellAt(t.r, t.c + 1) !== '.'; }
  const dr = across ? 0 : 1, dc = across ? 1 : 0;
  const sorted = tiles.slice().sort((a, b) => (a.r - b.r) || (a.c - b.c)), f = sorted[0], l = sorted[sorted.length - 1];
  for (let r = f.r, c = f.c; r <= l.r && c <= l.c; r += dr, c += dc) if (get(r, c) === '.') return { error: 'No gaps: the tiles must join up in one line.' };
  const first = board.every(row => !/[A-Za-z]/.test(row));
  if (first && !nw.has(7 * N + 7)) return { error: 'The first word must cover the star in the middle.' };
  if (first && tiles.length < 2) return { error: 'Words need at least 2 letters.' };
  const wordAt = (r, c, wr, wc) => { while (get(r - wr, c - wc) !== '.') { r -= wr; c -= wc; } const out = []; while (get(r, c) !== '.') { out.push([r, c]); r += wr; c += wc; } return out; };
  const score = cells => {
    let sum = 0, mul = 1, text = '';
    for (const [r, c] of cells) {
      const ch = get(r, c); text += ch.toUpperCase();
      let v = ch >= 'A' && ch <= 'Z' ? values[ch] || 0 : 0;
      if (nw.has(r * N + c)) { const sq = layout[r][c]; v *= LMUL[sq] || 1; mul *= WMUL[sq] || 1; }
      sum += v;
    }
    return { word: text, score: sum * mul };
  };
  const words = [], main = wordAt(f.r, f.c, dr, dc);
  if (main.length >= 2) words.push(score(main));
  for (const t of sorted) { const cw = wordAt(t.r, t.c, dc, dr); if (cw.length >= 2) words.push(score(cw)); }
  if (!words.length || (!first && main.length === tiles.length && words.length === 1)) return { error: first ? 'Words need at least 2 letters.' : 'Your word must join the tiles already on the board.' };
  const total = words.reduce((s, w) => s + w.score, 0) + (tiles.length === 7 ? 50 : 0);
  return { score: total, words, word: words[0].word };
}

// ---------------------------------------------------------------- your local state (s.ui): the rack order, what you put down
function local(s) {
  const u = s.ui, v = s.v, rack = (v && v.rack) || [];
  const key = rack.join('');
  if (u.rackKey !== key) {
    const same = u.rackKey && [...u.rackKey].sort().join('') === [...key].sort().join('');
    u.rackKey = key; u.placed = []; u.sel = null; u.swap = null; u.picker = null;
    if (!same || !u.order || u.order.length !== rack.length) u.order = rack.map((_, i) => i);
  }
  if (!u.placed) u.placed = [];
  // a square someone else just filled: that tile comes back
  if (v) u.placed = u.placed.filter(p => v.board[p.r][p.c] === '.');
  return u;
}
const used = u => new Set(u.placed.map(p => p.idx));
const myTurn = s => !!(s.seated && s.v && s.v.phase === 'play' && s.v.turn === s.me);
let CUR = null; // the latest s (a drag lives across re-renders)
// draw again when a region changes size (the first draw can come before the frame's CSS has sized it)
const SEEN = new WeakMap();
function watchSize(box) {
  if (SEEN.has(box) || typeof ResizeObserver === 'undefined') return;
  const ro = new ResizeObserver(() => { const k = box.clientWidth + 'x' + box.clientHeight; if (SEEN.get(box).k !== k) { SEEN.get(box).k = k; if (CUR) CUR.rerender(); } });
  SEEN.set(box, { k: box.clientWidth + 'x' + box.clientHeight }); ro.observe(box);
}

function placeAt(s, idx, r, c) {
  const u = local(s), v = s.v;
  if (!v || v.board[r][c] !== '.' || u.placed.some(p => p.r === r && p.c === c) || used(u).has(idx)) return;
  const letter = v.rack[idx];
  if (letter === '?') { u.picker = { r, c, idx }; u.sel = null; s.rerender(); return; }
  u.placed.push({ r, c, letter, blank: false, idx }); u.sel = null;
  LOOK.sound?.('tg-tile');
  s.rerender();
}
function takeBack(s, r, c) {
  const u = local(s);
  const i = u.placed.findIndex(p => p.r === r && p.c === c); if (i < 0) return;
  u.placed.splice(i, 1); LOOK.sound?.('tg-back'); s.rerender();
}
function recall(s) { const u = local(s); if (!u.placed.length && !u.picker) return; u.placed = []; u.picker = null; u.sel = null; LOOK.sound?.('tg-back'); s.rerender(); }
function shuffle(s) {
  const u = local(s), o = u.order.slice();
  for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
  u.order = o; s.rerender();
}
function play(s) {
  const u = local(s), v = s.v;
  if (!myTurn(s)) { s.toast('Wait for your turn.'); return; }
  const tiles = u.placed.map(p => (p.blank ? { r: p.r, c: p.c, letter: p.letter, blank: true } : { r: p.r, c: p.c, letter: p.letter }));
  const chk = shapeCheck(v.board, tiles, v.layout, v.values);
  if (chk.error) { s.toast(chk.error); return; }
  s.send({ type: 'place', tiles });
}
function cellClick(s, r, c) {
  const u = local(s), v = s.v; if (!v) return;
  if (u.placed.some(p => p.r === r && p.c === c)) { takeBack(s, r, c); return; }
  if (u.sel != null && v.board[r][c] === '.') { placeAt(s, u.sel, r, c); return; }
  // nothing picked: on a small board, zoom to that corner; zoomed, look round from there
  if (u.small) { u.zoom = { r, c }; s.rerender(); }
}

// ---------------------------------------------------------------- drag from the rack (pointer events; a tap picks the tile)
function startDrag(e, s, idx, tileEl) {
  if (e.button > 0) return;
  const x0 = e.clientX, y0 = e.clientY;
  let ghost = null;
  const move = ev => {
    if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 7) {
      ghost = tileEl.cloneNode(true); ghost.className = 'ww-t ww-ghost'; ghost.removeAttribute('aria-label');
      const rc = tileEl.getBoundingClientRect(); Object.assign(ghost.style, { width: rc.width + 'px', height: rc.height + 'px', fontSize: getComputedStyle(tileEl).fontSize });
      (tileEl.closest('.tg') || document.body).append(ghost); LOOK.sound?.('tg-lift');
    }
    if (ghost) { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; ev.preventDefault(); }
  };
  const up = ev => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    const cur = CUR || s;
    if (!ghost) { const u = local(cur); if (u.swap) { if (u.swap.has(idx)) u.swap.delete(idx); else u.swap.add(idx); } else u.sel = u.sel === idx ? null : idx; cur.rerender(); return; }
    ghost.remove();
    if (ev.type === 'pointercancel') return;
    const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-sq]');
    if (hit) placeAt(cur, idx, Number(hit.dataset.r), Number(hit.dataset.c));
  };
  addEventListener('pointermove', move, { passive: false }); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

// ---------------------------------------------------------------- a tile (on the board, the rack, the rules card)
function tileEl(letter, value, opts = {}) {
  const t = el('span', 'ww-t' + (opts.blank ? ' blank' : '') + (opts.cls ? ' ' + opts.cls : ''));
  t.append(el('b', '', letter === '?' ? '' : letter));
  if (!opts.blank && letter !== '?') t.append(el('i', '', String(value)));
  return t;
}

// ---------------------------------------------------------------- the board
function renderBoard(box, s) {
  const v = s.v; box.textContent = '';
  if (!v || !v.board) return;
  const u = s.seated ? local(s) : (s.ui.placed = [], s.ui);
  const W = box.clientWidth || 600, H = box.clientHeight || 300, pad = 6;
  const wrap = el('div', 'ww-wrap');
  // the side panel when there is room beside the board
  const fullCell = Math.floor((Math.min(W, H) - 2 * pad - 12) / N);
  const side = W - (fullCell * N + 12 + 2 * pad) >= 150;
  const small = fullCell < 24;
  u.small = small; u.side = side;
  if (!small) u.zoom = null;
  let cell = fullCell, rows = N, cols = N;
  if (u.zoom) {
    const availW = (side ? W - 170 : W) - 2 * pad - 12, availH = H - 2 * pad - 12;
    cell = Math.max(fullCell, Math.floor(Math.min(availW, availH) / 9));
    rows = clamp(Math.floor(availH / cell), 9, N); cols = clamp(Math.floor(availW / cell), 9, N);
  }
  const r0 = u.zoom ? clamp(u.zoom.r - (rows >> 1), 0, N - rows) : 0, c0 = u.zoom ? clamp(u.zoom.c - (cols >> 1), 0, N - cols) : 0;
  const frame = el('div', 'ww-frame' + (cell < 19 ? ' tiny' : ''));
  frame.style.setProperty('--cs', cell + 'px');
  const view = el('div', 'ww-view'); view.style.width = cols * cell + 'px'; view.style.height = rows * cell + 'px';
  const grid = el('div', 'ww-grid'); grid.style.transform = `translate(${-c0 * cell}px, ${-r0 * cell}px)`;
  const placed = new Map(u.placed.map(p => [p.r * N + p.c, p]));
  const last = new Set(((v.last && v.last.tiles) || []).map(t => t.r * N + t.c));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (u.zoom && (r < r0 || r >= r0 + rows || c < c0 || c >= c0 + cols)) continue;
    const ch = v.board[r][c], sq = v.layout[r][c], p = placed.get(r * N + c);
    const b = el('button', 'ww-sq b-' + (sq === '*' ? 'star' : sq === '.' ? 'n' : sq === sq.toUpperCase() ? 'w' + sq : 'l' + sq), '', { type: 'button', 'data-sq': '1', 'data-r': r, 'data-c': c });
    b.style.left = c * cell + 'px'; b.style.top = r * cell + 'px';
    const pos = `row ${r + 1}, column ${c + 1}`;
    if (ch !== '.') {
      const up = ch.toUpperCase(), bl = ch !== up;
      b.append(tileEl(up, v.values[up], { blank: bl, cls: last.has(r * N + c) ? 'last' : '' }));
      b.setAttribute('aria-label', `${up}${bl ? ' (blank)' : ''}, ${pos}`); b.tabIndex = -1;
    } else if (p) {
      b.append(tileEl(p.letter, v.values[p.letter], { blank: p.blank, cls: 'new' }));
      b.setAttribute('aria-label', `Your ${p.letter} on ${pos}: tap to take it back`);
    } else {
      if (sq === '*') b.append(ico('star', 'ww-star'));
      else if (BONUS[sq]) b.append(el('span', 'ww-bl', BONUS[sq][0]));
      b.setAttribute('aria-label', `${BONUS[sq] ? BONUS[sq][1] + ', ' : ''}${pos}${u.sel != null ? ': put it here' : ''}`);
    }
    if (s.seated) b.onclick = e => { e.stopPropagation(); cellClick(CUR || s, r, c); };
    grid.append(b);
  }
  view.append(grid); frame.append(view);
  if (u.zoom) {
    const zb = el('button', 'ww-zoom', '', { type: 'button', 'aria-label': 'Show the whole board' }); zb.append(ico('zoomout'));
    zb.onclick = e => { e.stopPropagation(); u.zoom = null; s.rerender(); };
    frame.append(zb);
  }
  wrap.append(frame);
  if (side) wrap.append(sidePanel(s, u, H));
  // the blank's letter
  if (u.picker) wrap.append(picker(s, u));
  box.append(wrap);
}

function sidePanel(s, u, H) {
  const v = s.v, T = s.T, p = el('div', 'ww-side' + (H < 300 ? ' short' : ''));
  const pv = preview(s, u);
  if (pv) p.append(pv);
  const L = v.last;
  if (L) {
    const row = el('div', 'ww-last');
    const name = el('span', 'ww-who', who(T, L.seat, s.me)); name.style.setProperty('--seat', seatInfo(T, L.seat).color);
    row.append(name);
    if (L.type === 'place') { row.append(el('b', 'ww-word', L.word), el('span', 'ww-pts', '+' + L.score)); }
    else row.append(el('span', 'ww-pts', L.type === 'exchange' ? `swapped ${L.count}` : 'passed'));
    p.append(row);
  }
  const bag = el('div', 'ww-bag'); bag.append(ico('swap'), el('span', '', v.bag ? `${v.bag} in the bag` : 'The bag is empty')); p.append(bag);
  const leg = el('div', 'ww-legend');
  for (const k of ['d', 't', 'D', 'T']) { const r = el('div', 'ww-lg'); r.append(el('span', 'ww-sw b-' + (k === k.toUpperCase() ? 'w' + k : 'l' + k), BONUS[k][0]), el('span', 'ww-lgl', BONUS[k][1]), el('span', 'ww-lgs', { d: 'letter x2', t: 'letter x3', D: 'word x2', T: 'word x3' }[k])); leg.append(r); }
  p.append(leg);
  return p;
}
// what your tiles would score (or the hint)
function preview(s, u) {
  const v = s.v;
  if (!s.seated || !v.rack) return null;
  if (u.placed.length) {
    const tiles = u.placed.map(x => ({ r: x.r, c: x.c, letter: x.letter, blank: x.blank }));
    const chk = shapeCheck(v.board, tiles, v.layout, v.values);
    return el('div', 'ww-pv' + (chk.error ? ' bad' : ''), chk.error ? 'Not a line yet' : `${chk.word}: ${chk.score} points`);
  }
  if (v.hint != null && myTurn(s)) return el('div', 'ww-pv ww-hint', v.hint ? `Your best now: ${v.hint}` : 'No word fits: swap or pass');
  return null;
}

function picker(s, u) {
  const box = el('div', 'ww-pick', '', { role: 'dialog', 'aria-label': 'Pick the letter for your blank' });
  box.append(el('div', 'ww-pick-h', 'Blank tile: which letter?'));
  const g = el('div', 'ww-pick-g');
  for (let i = 0; i < 26; i++) {
    const L = String.fromCharCode(65 + i), b = el('button', 'ww-pick-b', L, { type: 'button', 'aria-label': 'Letter ' + L });
    b.onclick = e => { e.stopPropagation(); const cur = CUR || s, uu = local(cur), pk = uu.picker; if (!pk) return; uu.placed.push({ r: pk.r, c: pk.c, letter: L, blank: true, idx: pk.idx }); uu.picker = null; LOOK.sound?.('tg-tile'); cur.rerender(); };
    g.append(b);
  }
  const x = el('button', 'ww-pick-x', '', { type: 'button', 'aria-label': 'Cancel' }); x.append(ico('cancel'));
  x.onclick = e => { e.stopPropagation(); u.picker = null; s.rerender(); };
  box.append(g, x);
  return box;
}

// ---------------------------------------------------------------- your rack
function renderHand(box, s) {
  box.textContent = '';
  const v = s.v;
  if (!s.seated || !v || !v.rack) return;
  const u = local(s), taken = used(u);
  const W = box.clientWidth || 400, H = box.clientHeight || 90;
  // a small line under the rack: the swap prompt, or the score preview / hint when the board has no side panel for it
  let note = null;
  if (u.swap) note = el('div', 'ww-note', u.swap.size ? `Swap ${u.swap.size} tile${u.swap.size > 1 ? 's' : ''}: tap the tick` : 'Tap the tiles to swap');
  else if (!u.side) note = preview(s, u);
  const n = Math.max(7, v.rack.length);
  const ts = Math.floor(clamp(Math.min((note ? H - 34 : H) * 0.7, (W - 30) / (n + 0.9)), 24, 64));
  const wrap = el('div', 'ww-hand' + (u.swap ? ' swapping' : ''));
  wrap.style.setProperty('--ts', ts + 'px');
  const rack = el('div', 'ww-rack');
  for (const idx of u.order) {
    const L = v.rack[idx]; if (L === undefined) continue;
    if (taken.has(idx) || (u.picker && u.picker.idx === idx)) { rack.append(el('span', 'ww-slot', '', { 'aria-hidden': 'true' })); continue; }
    const b = el('button', 'ww-rt' + (u.sel === idx ? ' sel' : '') + (u.swap && u.swap.has(idx) ? ' marked' : ''), '', { type: 'button', 'aria-label': (L === '?' ? 'Blank tile' : `${L}, ${v.values[L]} point${v.values[L] === 1 ? "" : "s"}`) + (u.swap ? (u.swap.has(idx) ? ': swapping it' : ': tap to swap it') : ''), 'aria-pressed': u.sel === idx || (u.swap && u.swap.has(idx)) ? 'true' : 'false' });
    const t = tileEl(L, v.values[L] ?? 0, { blank: L === '?' });
    b.append(t);
    b.addEventListener('pointerdown', e => startDrag(e, s, idx, t));
    b.addEventListener('click', e => { e.stopPropagation(); if (e.detail === 0) { const uu = local(CUR || s); if (uu.swap) { if (uu.swap.has(idx)) uu.swap.delete(idx); else uu.swap.add(idx); } else uu.sel = uu.sel === idx ? null : idx; (CUR || s).rerender(); } });
    rack.append(b);
  }
  wrap.append(rack);
  if (note) wrap.append(note);
  box.append(wrap);
}

// ---------------------------------------------------------------- the module
export default {
  id: 'word-weave',
  lid: 'words for 2 to 4',
  tip: 'Tap a letter, then a square (or drag it). Make words, then Play.',
  css: `
.tg-word-weave .ww-wrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 12px; padding: 6px; box-sizing: border-box; }
.tg-word-weave .ww-frame { --cs: 20px; position: relative; flex: 0 0 auto; padding: 6px; border-radius: 10px; background: linear-gradient(145deg, #b47a46, #9a6538 45%, #6e4224); border: 3px solid #2b2340; box-shadow: 0 4px 0 rgba(43, 35, 64, 0.85), inset 0 0 0 2px rgba(255, 230, 190, 0.35); }
.tg-word-weave .ww-view { position: relative; overflow: hidden; border-radius: 4px; background: #e9dcc0; box-shadow: 0 0 0 2px #2b2340; }
.tg-word-weave .ww-grid { position: absolute; left: 0; top: 0; width: calc(var(--cs) * 15); height: calc(var(--cs) * 15); }
.tg-word-weave .ww-sq { position: absolute; width: var(--cs); height: var(--cs); padding: 0; margin: 0; border: 0; box-sizing: border-box; background: #fff8ec; box-shadow: inset 0 0 0 0.5px #d8c7a6; display: grid; place-items: center; font-family: inherit; color: #2b2340; touch-action: manipulation; }
.tg-word-weave .ww-sq.b-ld { background: #ffe08a; }
.tg-word-weave .ww-sq.b-lt { background: #f6a95a; }
.tg-word-weave .ww-sq.b-wD { background: #ffaec4; }
.tg-word-weave .ww-sq.b-wT { background: #e8574d; color: #fff8ec; }
.tg-word-weave .ww-sq.b-star { background: #ffaec4; }
.tg-word-weave .ww-sq:hover:not(:has(.ww-t)) { filter: brightness(1.06); box-shadow: inset 0 0 0 2px #ffd34d; }
.tg-word-weave .ww-sq:focus-visible { outline: 3px solid #ffd34d; outline-offset: -2px; z-index: 2; }
.tg-word-weave .ww-bl { font-size: calc(var(--cs) * 0.36); font-weight: 700; letter-spacing: -0.02em; opacity: 0.85; pointer-events: none; }
.tg-word-weave .ww-frame.tiny .ww-bl { display: none; }
.tg-word-weave .ww-star { width: 78%; height: 78%; pointer-events: none; }
.tg-word-weave .ww-t { position: relative; display: grid; place-items: center; box-sizing: border-box; width: calc(100% - 1px); height: calc(100% - 1px); border-radius: 18%; background: linear-gradient(160deg, #fffdf6, #fbf6ea 60%, #efe3c8); border: 1.5px solid #2b2340; box-shadow: 0 1.5px 0 #b9a47e; font-size: calc(var(--cs) * 0.62); line-height: 1; color: #2b2340; pointer-events: none; }
.tg-word-weave .ww-t b { font-weight: 700; transform: translateY(-3%); }
.tg-word-weave .ww-t i { position: absolute; right: 7%; bottom: 3%; font-style: normal; font-weight: 600; font-size: 0.42em; }
.tg-word-weave .ww-frame.tiny .ww-t i { display: none; }
.tg-word-weave .ww-t.blank b { color: #8a5a2b; }
.tg-word-weave .ww-t.last { background: linear-gradient(160deg, #fff7c9, #ffe9a0); }
.tg-word-weave .ww-t.new { background: linear-gradient(160deg, #fffbe6, #ffe69a); border-color: #2b2340; box-shadow: 0 0 0 2px #ffd34d, 0 1.5px 0 #b9a47e; animation: ww-pop 0.25s cubic-bezier(.3, 1.6, .5, 1); }
.tg-word-weave .ww-zoom { position: absolute; right: -12px; top: -12px; width: 40px; height: 40px; padding: 6px; border-radius: 50%; border: 2.5px solid #2b2340; background: #fff8ec; box-shadow: 0 3px 0 rgba(43, 35, 64, 0.85); z-index: 3; }
.tg-word-weave .ww-zoom .tg-ico { width: 100%; height: 100%; }
.tg-word-weave .ww-side { flex: 0 1 220px; min-width: 140px; max-height: 100%; display: flex; flex-direction: column; gap: 7px; color: #2b2340; overflow: hidden; }
.tg-word-weave .ww-last, .tg-word-weave .ww-bag, .tg-word-weave .ww-pv, .tg-word-weave .ww-legend { background: #fff8ec; border: 2.5px solid #2b2340; border-radius: 12px; padding: 5px 9px; box-shadow: 0 3px 0 rgba(43, 35, 64, 0.85); font-size: 14px; font-weight: 600; }
.tg-word-weave .ww-last { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 7px; }
.tg-word-weave .ww-who { --seat: #888; display: inline-flex; align-items: center; gap: 4px; max-width: 8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tg-word-weave .ww-who::before { content: ''; flex: 0 0 auto; width: 11px; height: 11px; border-radius: 50%; background: var(--seat); border: 2px solid #2b2340; }
.tg-word-weave .ww-word { letter-spacing: 0.06em; }
.tg-word-weave .ww-pts { padding: 0 6px; border-radius: 9px; background: #2b2340; color: #fff8ec; font-size: 13px; }
.tg-word-weave .ww-bag { display: flex; align-items: center; gap: 6px; }
.tg-word-weave .ww-bag .tg-ico { width: 22px; height: 22px; }
.tg-word-weave .ww-pv { background: #fff1b8; }
.tg-word-weave .ww-pv.bad { background: #f3e3c3; color: #7a6f63; }
.tg-word-weave .ww-legend { display: grid; grid-template-columns: 1fr; gap: 3px; font-size: 12.5px; }
.tg-word-weave .ww-lg { display: flex; align-items: center; gap: 6px; }
.tg-word-weave .ww-lgs { display: none; }
.tg-word-weave .ww-side.short { gap: 5px; }
.tg-word-weave .ww-side.short .ww-legend { grid-template-columns: 1fr 1fr; gap: 3px 8px; font-size: 12px; }
.tg-word-weave .ww-side.short .ww-lgl { display: none; }
.tg-word-weave .ww-side.short .ww-lgs { display: inline; }
.tg-word-weave .ww-side.short .ww-last, .tg-word-weave .ww-side.short .ww-bag, .tg-word-weave .ww-side.short .ww-pv { padding: 3px 9px; font-size: 13px; }
.tg-word-weave .ww-sw { display: inline-grid; place-items: center; width: 24px; height: 20px; border-radius: 4px; border: 1.5px solid #2b2340; font-size: 10.5px; font-weight: 700; }
.tg-word-weave .ww-sw.b-ld { background: #ffe08a; } .tg-word-weave .ww-sw.b-lt { background: #f6a95a; }
.tg-word-weave .ww-sw.b-wD { background: #ffaec4; } .tg-word-weave .ww-sw.b-wT { background: #e8574d; color: #fff8ec; }
.tg-word-weave .ww-pick { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 6; width: min(94%, 340px); padding: 8px 10px 10px; border-radius: 14px; background: #fff8ec; border: 3px solid #2b2340; box-shadow: 0 4px 0 rgba(43, 35, 64, 0.85); box-sizing: border-box; }
.tg-word-weave .ww-pick-h { font-weight: 700; font-size: 15px; text-align: center; margin: 0 26px 6px; }
.tg-word-weave .ww-pick-g { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.tg-word-weave .ww-pick-b { min-height: 34px; padding: 0; border-radius: 8px; border: 2px solid #2b2340; background: #fbf6ea; font-weight: 700; font-size: 17px; color: #2b2340; box-shadow: 0 2px 0 #b9a47e; }
.tg-word-weave .ww-pick-b:hover { background: #ffe08a; }
.tg-word-weave .ww-pick-x { position: absolute; right: 4px; top: 4px; width: 32px; height: 32px; padding: 5px; border-radius: 50%; border: 2px solid #2b2340; background: #fff8ec; }
.tg-word-weave .ww-pick-x .tg-ico { width: 100%; height: 100%; }
.tg-word-weave .ww-hand { --ts: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; width: 100%; height: 100%; padding: 4px; box-sizing: border-box; }
.tg-word-weave .ww-rack { display: flex; align-items: flex-end; justify-content: center; gap: calc(var(--ts) * 0.1); padding: calc(var(--ts) * 0.1) calc(var(--ts) * 0.22) calc(var(--ts) * 0.16); border-radius: 10px; background: linear-gradient(#b47a46, #9a6538 55%, #6e4224); border: 2.5px solid #2b2340; box-shadow: 0 3px 0 rgba(43, 35, 64, 0.85); }
.tg-word-weave .ww-rt, .tg-word-weave .ww-slot { position: relative; flex: 0 0 auto; width: var(--ts); height: var(--ts); padding: 0; border: 0; background: none; touch-action: none; transition: transform 0.12s; font-family: inherit; --cs: var(--ts); }
.tg-word-weave .ww-slot { border-radius: 18%; background: rgba(43, 35, 64, 0.25); box-shadow: inset 0 2px 0 rgba(0, 0, 0, 0.25); }
.tg-word-weave .ww-rt .ww-t { width: 100%; height: 100%; border-width: 2.5px; box-shadow: 0 3px 0 #b9a47e; }
.tg-word-weave .ww-rt.sel { transform: translateY(-22%); }
.tg-word-weave .ww-rt.sel .ww-t { box-shadow: 0 0 0 3px #ffd34d, 0 0 12px 3px rgba(255, 211, 77, 0.8); }
.tg-word-weave .ww-rt.marked { transform: translateY(14%); }
.tg-word-weave .ww-rt.marked .ww-t { background: #f3c1b5; box-shadow: 0 0 0 3px #e0463c; }
.tg-word-weave .ww-rt:focus-visible { outline: 3px solid #ffd34d; outline-offset: 2px; border-radius: 8px; }
.tg-word-weave .ww-note, .tg-word-weave .ww-hand .ww-pv { padding: 1px 10px; border-radius: 10px; border: 2px solid #2b2340; background: #fff1b8; font-size: 13px; font-weight: 600; box-shadow: none; }
.tg-word-weave .ww-hand .ww-pv.bad { background: #f3e3c3; }
.tg-word-weave .ww-ghost { position: fixed; z-index: 80; pointer-events: none; transform: translate(-50%, -60%) scale(1.15) rotate(-5deg); border-width: 2.5px; }
.tg-word-weave .ww-over-rows .ww-adj { font-size: 12px; font-weight: 600; color: #7a6f63; }
.tg-word-weave .ww-over-rows .tg-crow { grid-template-columns: 16px minmax(3rem, 8rem) auto auto; }
.tg-word-weave .ww-rpic { display: grid; grid-template-columns: repeat(5, 15px); grid-auto-rows: 15px; gap: 0; --cs: 15px; justify-content: center; }
.tg-word-weave .ww-rpic > span { position: relative; display: grid; place-items: center; background: #fff8ec; box-shadow: inset 0 0 0 0.5px #d8c7a6; }
.tg-word-weave .ww-rpic .ww-t { border-width: 1px; }
.tg-word-weave .ww-rpic .ww-t i { display: none; }
.tg-word-weave .ww-plus { grid-column: 1 / -1; text-align: center; font-size: 14px; color: #2f7a45; line-height: 1.2; }
.tg-word-weave .tg-rules .ww-sw { width: 24px; height: 20px; }
.tg-word-weave .ww-rrow-sw { display: flex; gap: 3px; flex-wrap: wrap; justify-content: center; max-width: 56px; }
.tg-word-weave .ww-rrow-sw .tg-ico { width: 28px; height: 28px; }
@keyframes ww-pop { from { transform: scale(0.6); } to { transform: none; } }
@media (prefers-reduced-motion: reduce) { .tg-word-weave .ww-t.new { animation: none; } }
`,

  render(board, hand, s) {
    CUR = s;
    watchSize(board); watchSize(hand);
    renderBoard(board, s);
    renderHand(hand, s);
  },

  buttons(s) {
    const v = s.v; if (!v || v.phase !== 'play') return [];
    const u = local(s), mine = myTurn(s), has = t => s.moves.find(m => m.type === t);
    const out = [];
    if (u.swap) {
      const letters = [...u.swap].map(i => v.rack[i]);
      out.push({ id: 'swap-ok', icon: ICON.ok, label: letters.length ? `Swap ${letters.length} tile${letters.length > 1 ? 's' : ''}` : 'Pick the tiles to swap first', hot: letters.length > 0, run: () => { if (!letters.length) { s.toast('Tap the tiles you want to swap.'); return; } u.swap = null; s.send({ type: 'exchange', letters }); } });
      out.push({ id: 'swap-no', icon: ICON.cancel, label: 'Cancel the swap', run: () => { u.swap = null; s.rerender(); } });
      return out;
    }
    if (mine) out.push({ id: 'play', icon: ICON.play, label: u.placed.length ? 'Play your word' : 'Play (put tiles on the board first)', key: 'Enter', hot: u.placed.length > 0, run: () => play(CUR || s) });
    if (u.placed.length) out.push({ id: 'recall', icon: ICON.recall, label: 'Take your tiles back', key: 'Backspace', run: () => recall(CUR || s) });
    else out.push({ id: 'shuffle', icon: ICON.shuffle, label: 'Shuffle your rack', run: () => shuffle(CUR || s) });
    if (mine && has('exchange')) out.push({ id: 'swap', icon: ICON.swap, label: 'Swap tiles with the bag (uses your turn)', run: () => { u.placed = []; u.sel = null; u.picker = null; u.swap = new Set(); s.rerender(); } });
    if (mine && has('pass')) out.push({ id: 'pass', icon: ICON.pass, label: 'Pass your turn', move: has('pass') });
    return out;
  },

  chip(T, v, k) {
    if (!v || !v.scores) return null;
    const out = { score: v.scores[k] };
    if (v.counts && v.counts[k] < 7 && v.phase === 'play') out.count = v.counts[k];
    return out;
  },

  pill(T, v) {
    if (!v) return null;
    if (v.phase === 'over') return 'Game over';
    const bag = v.bag ? `Bag ${v.bag}` : 'Bag empty';
    return v.rounds ? `Round ${v.round}/${v.rounds} - ${bag}` : bag;
  },

  describe(T, v, b, me) {
    const w = k => who(T, k, me), you = k => k === me;
    switch (b.kind) {
      case 'place': {
        const more = b.words && b.words.length > 1 ? ` (+${b.words.length - 1} more word${b.words.length > 2 ? 's' : ''})` : '';
        return `${w(b.seat)} played ${b.word} for ${b.score}${more}.`;
      }
      case 'fullweave': return `Full Weave! ${w(b.seat)} used all seven: +${b.bonus}.`;
      case 'exchange': return `${w(b.seat)} swapped ${b.count} tile${b.count > 1 ? 's' : ''}.`;
      case 'pass': return `${w(b.seat)} passed.`;
      case 'bagEmpty': return 'The bag is empty! First to use up their rack ends the game.';
      case 'turn': return you(b.seat) ? 'Your turn.' : null;
      case 'gameOver': {
        const names = (b.winners || []).map(w);
        return names.length ? `Game over! ${names.join(' and ')} ${names.length > 1 || names[0] === 'You' ? 'win' : 'wins'}.` : 'Game over!';
      }
      default: return null;
    }
  },

  overPanel(T, res, me) {
    const box = el('div', 'tg-round over');
    const totals = (res && res.totals) || [], win = (res && res.winners) || [];
    const fin = (T.view && T.view.final) || null, adj = (fin && fin.adjust) || [];
    const names = win.map(k => who(T, k, me));
    const rib = el('div', 'tg-ribbon gold', '', { 'aria-hidden': 'true' }); rib.append(el('b', '', 'Word Weave'));
    box.append(rib, el('div', 'tg-h', names.length ? `${names.join(' and ')} ${names.length > 1 || names[0] === 'You' ? 'win' : 'wins'}!` : 'Game over'));
    const why = fin ? (fin.why === 'out' ? `${who(T, fin.out, me)} used up ${fin.out === me ? 'your' : 'their'} last tiles and gets everyone's leftovers.` : fin.why === 'stuck' ? 'Six turns in a row with no score: leftover tiles count against you.' : 'Eight rounds played.') : '';
    box.append(el('p', 'tg-sub', why + ' Highest total wins.'));
    const order = totals.map((_, k) => k).sort((a, b) => totals[b] - totals[a]);
    const list = el('div', 'tg-count ww-over-rows');
    for (const k of order) {
      const si = seatInfo(T, k), row = el('div', 'tg-crow on' + (win.includes(k) ? ' win' : ''));
      row.style.setProperty('--seat', si.color);
      const a = adj[k] || 0;
      row.append(el('i', 'tg-dot'), el('span', 'tg-cname', k === me ? 'You' : si.name), el('span', 'ww-adj', a ? (a > 0 ? `+${a} leftovers` : `${a} leftovers`) : ''), el('b', 'tg-ctot', String(totals[k])));
      list.append(row);
    }
    box.append(list, el('p', 'tg-note', res && res.counted ? 'On the store window leaderboard.' : 'A bot played, so this one is just for fun (not on the leaderboard).'));
    let done = false;
    box.onShow = () => { if (done) return; done = true; rib.classList.add('in'); };
    return box;
  },

  rulesCard() {
    const c = el('div', 'tg-rules');
    c.append(el('div', 'tg-h', 'Word Weave'));
    const row = (pic, text) => { const r = el('div', 'tg-rrow'); const p = el('div', 'tg-rpic'); p.append(pic); r.append(p, el('p', '', text)); c.append(r); };
    // a little board: WEAVE across, TOE down through its E (a cross word)
    const mini = cells => { const g = el('div', 'ww-rpic'); for (const x of cells) { const sq = el('span'); if (x) sq.append(tileEl(x, 1)); g.append(sq); } return g; };
    row(mini([null, null, null, null, 'T', null, null, null, null, 'O', 'W', 'E', 'A', 'V', 'E']), 'Make words across or down, joined to the tiles already there. The first word covers the star.');
    const sw = el('div', 'ww-rrow-sw'); for (const k of ['ld', 'lt', 'wD', 'wT']) sw.append(el('span', 'ww-sw b-' + k, { ld: '2L', lt: '3L', wD: '2W', wT: '3W' }[k]));
    row(sw, 'Bonus squares: 2L and 3L count a letter double or triple, 2W and 3W the whole word. Only for tiles you just put down.');
    const seven = mini(['W', 'E', 'A', 'V', 'E']); seven.append(el('b', 'ww-plus', '+50'));
    row(seven, 'Use all seven tiles in one turn: Full Weave, +50.');
    const ic = k => { const s = el('div', 'ww-rrow-sw'); s.append(ico(k)); return s; };
    row(ic('swap'), 'No good word? Swap some tiles with the bag (while it has 7 or more), or pass. A blank tile is any letter you pick, worth 0.');
    row(ic('star'), 'The game ends when the bag is empty and someone plays their last tile: they get everyone\'s leftover points. Highest score wins.');
    return c;
  },

  setupLine(settings, n) {
    const quick = settings && settings.length === 'quick';
    return `${quick ? '8 rounds each' : 'Until the tiles run out'}: 7 letters each for ${Math.max(2, n)} players, 100 tiles in the bag`;
  },

  onKey(code, s) {
    const v = s.v; if (!v || !s.seated || v.phase !== 'play') return false;
    const u = local(s);
    if (code === 'Enter' || code === 'NumpadEnter') { if (u.swap) return false; play(s); return true; }
    if (code === 'Backspace') { if (!u.placed.length) return false; u.placed.pop(); s.rerender(); return true; }
    const m = /^Key([A-Z])$/.exec(code);
    if (m && v.rack) {
      const taken = used(u);
      const idx = u.order.find(i => !taken.has(i) && v.rack[i] === m[1]) ?? u.order.find(i => !taken.has(i) && v.rack[i] === '?' && u.sel !== i);
      if (idx == null) return false;
      u.sel = idx; s.rerender(); return true;
    }
    return false;
  },

  moments(b, c) {
    const { play: snd, eye, me } = c;
    switch (b.kind) {
      case 'place': (b.tiles || []).forEach((t, i) => snd('tg-tile', 120 + i * 95)); break;
      case 'draw': if (b.seat === me) snd('tg-draw', 380); break;
      case 'exchange': snd('tg-draw', 100); break;
      case 'pass': snd('tg-back', 60); break;
      case 'turn': if (me != null && b.seat === me) { if (eye) eye.turn(() => snd('tg-yourturn')); else snd('tg-yourturn'); } break;
      case 'fullweave': if (eye) eye.stamp('Full Weave!', '+' + (b.bonus || 50), { color: '#4fa45a', sound: () => snd('tg-stamp') }); else snd('tg-stamp', 300); break;
      case 'bagEmpty': if (eye) eye.ribbon('The bag is empty!'); break;
      case 'gameOver': snd(me != null && (b.winners || []).includes(me) ? 'tg-fanfare' : 'tg-cheer', 400); if (eye) eye.confetti(); break;
      default: break;
    }
  },
};
