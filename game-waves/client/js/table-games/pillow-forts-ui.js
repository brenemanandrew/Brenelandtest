// Pillow Forts' part of the table-game overlay (game-waves, SPEC section 3): the giant house drawn as a cutaway in Breneland's
// look (the attic under the roof, three floors, a yard each side, ladders and stairs between floors, the zip line over the
// roof), every area a tappable tile in its crew's colour with a pillow showing the count, the last pillow fight's dice, your
// treat cards and the pillows left to place in the hand, the buttons per step, the words for each beat, the end card and the
// rules. Tap-then-tap: one of your areas, then a neighbour (a fight) or one of yours (a shuffle). Reads only the view it gets.
import { el } from '../util.js';
import { seatInfo } from './mt-ui.js';
import { LOOK } from './tg-state.js';

const INK = '#2b2340', CREAM = '#fff8ec';
const TEDDY_COL = '#a8794e', TEDDY_TINT = '#efe2cf';
const SVG = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const S = `stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;
const PILLOW = 'M5 8Q3 3 8 3.5Q20 6 32 3.5Q37 3 35 8Q33 16 35 24Q37 29 32 28.5Q20 26 8 28.5Q3 29 5 24Q7 16 5 8Z';
const ICON = {
  auto: SVG(`<path d="M3 21l11-11" ${S} stroke-width="2.6"/><path d="M14 10l2-2" stroke="#ffd34d" stroke-width="3" stroke-linecap="round"/><path d="M17 2l1 2.4 2.4 1-2.4 1L17 9l-1-2.6-2.4-1 2.4-1zM7 3l.7 1.6 1.6.7-1.6.7L7 7.6l-.7-1.6-1.6-.7 1.6-.7zM20 12l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="#ffd34d" ${S} stroke-width="1.2"/>`),
  add: SVG(`<path d="${PILLOW}" transform="scale(.5) translate(4 10)" fill="#ffb3c8" ${S} stroke-width="3"/><path d="M18 3v8M14 7h8" ${S} stroke-width="2.8"/>`),
  roll: SVG(`<rect x="2.5" y="7" width="11" height="11" rx="2.5" fill="${CREAM}" ${S}/><circle cx="5.5" cy="10" r="1.5" fill="${INK}"/><circle cx="10.5" cy="15" r="1.5" fill="${INK}"/><circle cx="8" cy="12.5" r="1.5" fill="${INK}"/><rect x="11" y="3" width="10" height="10" rx="2.3" fill="#ffd34d" ${S} transform="rotate(14 16 8)"/><circle cx="14.5" cy="6.5" r="1.4" fill="${INK}"/><circle cx="17.5" cy="9.5" r="1.4" fill="${INK}"/>`),
  storm: SVG(`<path d="${PILLOW}" transform="scale(.42) translate(2 18) rotate(-12 20 16)" fill="#ffb3c8" ${S} stroke-width="3.4"/><path d="${PILLOW}" transform="scale(.42) translate(22 4) rotate(14 20 16)" fill="#bfe3ff" ${S} stroke-width="3.4"/><path d="M12 2l1.2 3M20 12l3 1M3 4l2 2" ${S}/>`),
  end: SVG(`<path d="M6 21V4" fill="none" ${S} stroke-width="2.4"/><path d="M6 4h11l-2.5 4L17 12H6" fill="#f2b630" ${S}/>`),
  move: SVG(`<path d="M3 12h14" ${S} stroke-width="2.8"/><path d="M13 6l7 6-7 6" fill="none" ${S} stroke-width="2.8"/>`),
  trade: SVG(`<circle cx="8" cy="12" r="6" fill="#d9a066" ${S}/><circle cx="6.5" cy="10.5" r="1" fill="${INK}"/><circle cx="9.5" cy="13.5" r="1" fill="${INK}"/><path d="M15 9h7M18.5 5.5v7" ${S} stroke-width="2.6"/><path d="${PILLOW}" transform="scale(.3) translate(46 52)" fill="#ffb3c8" ${S} stroke-width="5"/>`),
  close: SVG(`<path d="M6 6l12 12M18 6L6 18" fill="none" ${S} stroke-width="3"/>`),
};
// the treats (viewBox 0 0 40 40)
const TREAT = [
  `<path d="M9 14h18v14a6 6 0 0 1-6 6h-6a6 6 0 0 1-6-6z" fill="#fff8ec" ${S}/><path d="M27 17h3a4 4 0 0 1 0 8h-3" fill="none" ${S}/><path d="M11 18h14v9a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4z" fill="#8a5a3a"/><path d="M15 9c0-3 3-3 3-6M21 9c0-3 3-3 3-6" fill="none" ${S} stroke-width="1.6"/>`,
  `<circle cx="20" cy="20" r="13" fill="#e2a868" ${S}/><circle cx="15" cy="15" r="2" fill="${INK}"/><circle cx="24" cy="17" r="2" fill="${INK}"/><circle cx="17" cy="25" r="2" fill="${INK}"/><circle cx="26" cy="25" r="1.6" fill="${INK}"/>`,
  `<path d="M10 16h20l-3 19H13z" fill="#fff8ec" ${S}/><path d="M14 16l1.5 19M20 16v19M26 16l-1.5 19" stroke="#e0463c" stroke-width="2.4"/><path d="M10 16h20" ${S}/><circle cx="14" cy="13" r="4" fill="#fff6c8" ${S} stroke-width="1.6"/><circle cx="20" cy="11" r="4.4" fill="#fff6c8" ${S} stroke-width="1.6"/><circle cx="26" cy="13" r="4" fill="#fff6c8" ${S} stroke-width="1.6"/>`,
  `<path d="M24 7a12 12 0 1 0 9 19 10 10 0 0 1-9-19z" fill="#ffd34d" ${S}/><path d="M11 10l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z" fill="#fff8ec" ${S} stroke-width="1.2"/>`,
];
const KIND = ['Cocoa', 'Cookie', 'Popcorn', 'Midnight Feast'];
const LINK_ART = {
  ladder: `<path d="M4 1v22M12 1v22" ${S} stroke="#6e4224" stroke-width="2.4"/><path d="M4 6h8M4 12h8M4 18h8" stroke="#6e4224" stroke-width="2"/>`,
  stairs: `<path d="M1 22h4v-5h4v-5h4V7h4V2" fill="none" ${S} stroke="#6e4224" stroke-width="2.6"/>`,
  steps: `<path d="M1 22h4v-5h4v-5h4V7h4V2" fill="none" ${S} stroke="#5d5470" stroke-width="2.6"/>`,
  door: `<rect x="3" y="2" width="10" height="20" rx="1.5" fill="#c9824a" ${S}/><circle cx="10" cy="12.5" r="1.3" fill="${INK}"/>`,
  window: `<rect x="2" y="5" width="12" height="12" rx="1.5" fill="#bfe3ff" ${S}/><path d="M8 5v12M2 11h12" ${S} stroke-width="1.4"/>`,
  slide: `<path d="M2 3c4 0 5 4 7 9s4 9 7 9" fill="none" stroke="#e0463c" stroke-width="3.4" stroke-linecap="round"/><path d="M2 3c4 0 5 4 7 9s4 9 7 9" fill="none" ${S} stroke-width="1"/>`,
};

const money = n => String(n);
const who = (T, k, me) => (k === me ? 'You' : k < 0 ? 'The Teddies' : seatInfo(T, k).name);
const verb = (k, me, you, they) => (k === me ? you : they);
const colorOf = (T, k) => (k < 0 ? TEDDY_COL : seatInfo(T, k).color);
const areaName = (v, i) => (v && v.map && v.map.areas[i] ? v.map.areas[i].name : 'an area');
function mix(hex, to, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(to);
  return '#' + a.map((x, i) => Math.round(x + (b[i] - x) * t).toString(16).padStart(2, '0')).join('');
}
const tintOf = (T, k) => (k < 0 ? TEDDY_TINT : mix(colorOf(T, k), CREAM, 0.6));
// a pillow with the count on it
function pillowSvg(col, n, w) {
  const fs = n >= 10 ? 17 : 19;
  return `<svg viewBox="0 0 40 32" width="${w}" height="${w * 0.8}" aria-hidden="true"><path d="${PILLOW}" fill="${col}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><path d="M10 9q10 2 20 0" fill="none" stroke="#fff8" stroke-width="2" stroke-linecap="round"/><text x="20" y="22.5" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="${fs}" fill="${INK}" stroke="${CREAM}" stroke-width="3.6" paint-order="stroke">${n}</text></svg>`;
}
function adjOf(v) {
  if (v._adj) return v._adj;
  const a = v.map.areas.map(() => []);
  for (const [x, y] of v.map.links) { a[x].push(y); a[y].push(x); }
  Object.defineProperty(v, '_adj', { value: a, enumerable: false });
  return a;
}

// ---------------------------------------------------------------- the layout: 8 columns x 4 rows under a band for the zip line
function layOf(W, H) {
  const top = Math.round(Math.max(12, Math.min(34, H * 0.075))), cw = W / 8, ch = (H - top) / 4;
  return { W, H, top, cw, ch, cell: (c, r) => ({ x: c * cw, y: top + r * ch, w: cw, h: ch }) };
}
function tileRect(L, a) {
  const c = L.cell(a.c, a.r), yard = a.c === 0 || a.c === 7;
  const ix = yard ? 3 : 2, it = a.r === 0 ? 4 : 5, ib = 2;
  return { x: c.x + ix, y: c.y + it, w: c.w - 2 * ix, h: c.h - it - ib };
}

// the house behind the tiles: sky, grass, roof, walls by region, floor slabs, the zip line
function drawHouse(g, L, v) {
  const { W, H, top, cw, ch } = L, R = v.map.regions;
  g.clearRect(0, 0, W, H);
  const sky = g.createLinearGradient(0, 0, 0, top + ch * 1.5); sky.addColorStop(0, '#a9dcf7'); sky.addColorStop(1, '#dff3ff');
  g.fillStyle = sky; g.fillRect(0, 0, W, top + ch);
  // the yards' grass, the ground line under the house
  g.fillStyle = '#9fd47e'; g.fillRect(0, top + ch, cw, H); g.fillRect(cw * 7, top + ch, cw, H);
  g.fillStyle = '#8fc46e'; g.fillRect(0, top + ch * 3, cw, H); g.fillRect(cw * 7, top + ch * 3, cw, H);
  // the roof (a trapezoid: slopes over columns 1 and 6) and the attic wall
  g.beginPath(); g.moveTo(cw * 0.75, top + ch + 2); g.lineTo(cw * 2, top - 3); g.lineTo(cw * 6, top - 3); g.lineTo(cw * 7.25, top + ch + 2); g.closePath();
  g.fillStyle = '#c0563f'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
  g.fillStyle = R[0].color; g.fillRect(cw * 2, top, cw * 4, ch);
  // shingles on the slopes
  g.strokeStyle = '#9a3f2e'; g.lineWidth = 1.5;
  for (let k = 1; k < 4; k++) { const y = top + ch * k / 4; g.beginPath(); g.moveTo(cw * (2 - 1.25 * k / 4) + 3, y); g.lineTo(cw * 2 - 2, y); g.moveTo(cw * 6 + 2, y); g.lineTo(cw * (6 + 1.25 * k / 4) - 3, y); g.stroke(); }
  // the floors' walls in their region colours
  for (let r = 1; r <= 3; r++) { g.fillStyle = R[r].color; g.fillRect(cw, top + ch * r, cw * 6, ch); }
  // the yards: a tree by the treehouse, a kite over the trampoline
  g.fillStyle = '#7a5230'; g.fillRect(cw * 0.42, top + ch * 0.45, cw * 0.16, ch * 0.6);
  g.fillStyle = '#4fa45a'; g.strokeStyle = INK; g.lineWidth = 2;
  g.beginPath(); g.ellipse(cw * 0.5, top + ch * 0.42, cw * 0.38, ch * 0.36, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  const kx = cw * 7.5, ky = top + ch * 0.35, ks = Math.min(cw, ch) * 0.22;
  g.beginPath(); g.moveTo(kx, ky - ks); g.lineTo(kx + ks * 0.7, ky); g.lineTo(kx, ky + ks); g.lineTo(kx - ks * 0.7, ky); g.closePath(); g.fillStyle = '#ffd34d'; g.fill(); g.stroke();
  g.beginPath(); g.moveTo(kx, ky + ks); g.quadraticCurveTo(kx - ks, ky + ks * 2.2, kx - ks * 0.3, top + ch); g.lineWidth = 1.2; g.stroke();
  // the house walls and the floor slabs (wood), thick: floors only meet where a ladder or stairs is drawn
  g.lineWidth = 3; g.strokeStyle = INK; g.strokeRect(cw, top + ch, cw * 6, ch * 3);
  for (let r = 1; r <= 3; r++) {
    const y = top + ch * r;
    g.fillStyle = '#9a6538'; g.fillRect(r === 1 ? cw * 2 : cw, y - 2.5, r === 1 ? cw * 4 : cw * 6, 5);
  }
  g.fillStyle = '#6e4224'; g.fillRect(cw * 0.9, top + ch * 4 - 3, cw * 6.2, 3);
  // the zip line: from the treehouse up over the roof to the trampoline
  g.beginPath(); g.moveTo(cw * 0.55, top + ch * 0.75); g.bezierCurveTo(cw * 2.4, top * 0.05, cw * 5.6, top * 0.05, cw * 7.45, top + ch * 0.75);
  g.strokeStyle = INK; g.lineWidth = 2.2; g.setLineDash([]); g.stroke();
  g.strokeStyle = '#ffd34d'; g.lineWidth = 1; g.setLineDash([3, 4]); g.stroke(); g.setLineDash([]);
}

// ---------------------------------------------------------------- what can be tapped now
function stateOf(s) {
  const { v, moves, me, ui } = s;
  const my = me !== null && me !== undefined && v.turn === me && v.phase === 'play';
  const st = { my, stage: my ? v.stage : null, from: null, to: null, targets: new Set(), allies: new Set() };
  if (!my) { ui.sel = null; ui.to = null; return st; }
  if (v.stage === 'place') {
    if (ui.sel != null && v.owner[ui.sel] !== me) ui.sel = null;
    st.from = ui.sel; ui.to = null;
    return st;
  }
  if (v.stage === 'attack') {
    if (ui.sel != null && !moves.some(m => m.from === ui.sel)) { ui.sel = null; ui.to = null; }
    if (ui.sel != null) {
      for (const m of moves) if (m.from === ui.sel) { if (m.type === 'roll') st.targets.add(m.to); else if (m.type === 'shift') st.allies.add(m.to); }
      if (ui.to != null && !st.targets.has(ui.to) && !st.allies.has(ui.to)) ui.to = null;
    } else ui.to = null;
    st.from = ui.sel; st.to = ui.to;
    return st;
  }
  ui.sel = null; ui.to = null;
  return st;
}
function tapArea(s, i) {
  const { v, moves, me, ui } = s, st = stateOf(s);
  if (!st.my) { ui.peek = ui.peek === i ? null : i; s.rerender(); return; }
  if (st.stage === 'place') {
    if (v.owner[i] !== me) { s.toast('Pick one of your own areas to fluff up.'); return; }
    if (ui.sel === i) { const m = moves.find(x => x.type === 'place' && x.area === i && x.n === 1); if (m) { s.send(m); return; } }
    ui.sel = i; s.rerender(); return;
  }
  if (st.stage === 'attack') {
    if (ui.sel === i) { ui.sel = null; ui.to = null; s.rerender(); return; }
    if (ui.sel != null && st.targets.has(i)) {
      if (ui.to === i) { const m = moves.find(x => x.type === 'roll' && x.from === ui.sel && x.to === i); if (m) { s.send(m); return; } }
      ui.to = i; s.rerender(); return;
    }
    if (ui.sel != null && st.allies.has(i)) { ui.to = ui.to === i ? null : i; s.rerender(); return; }
    if (v.owner[i] === me) {
      if (moves.some(m => m.from === i)) { ui.sel = i; ui.to = null; s.rerender(); }
      else s.toast('An area needs 2 or more pillows to fight or share.');
      return;
    }
    // an enemy area with nothing picked: start from the biggest pile of yours next to it
    const from = moves.filter(m => m.type === 'roll' && m.to === i).map(m => m.from).sort((a, b) => v.pillows[b] - v.pillows[a])[0];
    if (from !== undefined) { ui.sel = from; ui.to = i; s.rerender(); }
    else s.toast('None of your areas with 2+ pillows is next to it.');
  }
}

// ---------------------------------------------------------------- the board
const FX = new WeakMap();
function renderBoard(board, s) {
  const { T, v, me, ui } = s;
  board.textContent = '';
  if (!v || !v.map) return;
  let fx = FX.get(board);
  if (!fx) { FX.set(board, fx = { size: '' }); }
  if (!fx.ro && typeof ResizeObserver === 'function') { fx.ro = new ResizeObserver(() => { const k = board.clientWidth + 'x' + board.clientHeight; if (k !== fx.size) { fx.size = k; fx.rerender?.(); } }); fx.ro.observe(board); }
  fx.rerender = s.rerender;
  const P = board.parentElement, W = board.clientWidth || (P && P.clientWidth) || 600, H = board.clientHeight || (P && P.clientHeight) || 300;
  fx.size = board.clientWidth + 'x' + board.clientHeight;
  const L = layOf(W, H), st = stateOf(s), A = v.map.areas;
  const wrap = el('div', 'pf-wrap');
  const cv = el('canvas', 'pf-bg'); const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d'); g.scale(dpr, dpr); drawHouse(g, L, v);
  wrap.append(cv);
  // counts that just changed bump; a freshly taken area flashes
  const prev = ui.prevP && ui.prevKey === T.id ? ui.prevP : null, prevO = ui.prevO && ui.prevKey === T.id ? ui.prevO : null;
  const small = L.cw < 58, named = !small && L.ch >= 44;
  const lastFresh = v.last && ui.fightNo === v.last.no && Date.now() - ui.fightAt < 3400;
  for (const a of A) {
    const i = a.i, o = v.owner[i], n = v.pillows[i], r = tileRect(L, a);
    const cls = ['pf-tile'];
    if (o === me && me !== null) cls.push('mine');
    if (st.from === i) cls.push('sel');
    if (st.to === i) cls.push('aim');
    if (st.targets.has(i)) cls.push('target');
    if (st.allies.has(i)) cls.push('ally');
    if (st.stage === 'place' && o === me) cls.push('canplace');
    if (v.stage === 'advance' && v.adv && (v.adv.from === i || v.adv.to === i)) cls.push(v.adv.to === i ? 'won' : 'sel');
    if (ui.peek === i && !st.my) cls.push('peek');
    if (prev && prev[i] !== n) cls.push('bump');
    if (prevO && prevO[i] !== o) cls.push('taken');
    if (lastFresh && (v.last.from === i || v.last.to === i)) cls.push('fought');
    const t = el('button', cls.join(' '), '', { type: 'button', 'data-area': i });
    Object.assign(t.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', background: tintOf(T, o) });
    t.style.setProperty('--own', colorOf(T, o));
    const owner = o < 0 ? 'the Teddies' : o === me ? 'you' : seatInfo(T, o).name;
    let label = `${a.name}: ${n} pillow${n === 1 ? '' : 's'}, ${owner}`;
    if (st.targets.has(i)) label += ' (tap to aim a pillow fight)';
    else if (st.allies.has(i)) label += ' (tap to shuffle pillows here)';
    t.setAttribute('aria-label', label);
    if (named) { const nm = el('span', 'pf-name', a.short); nm.style.fontSize = Math.max(9, Math.min(13, r.w / Math.max(6, a.short.length) * 1.45, L.ch * 0.17)) + 'px'; t.append(nm); }
    const pw = Math.max(26, Math.min(r.w * 0.86, (named ? r.h * 0.62 : r.h * 0.78) * 1.25, 62));
    const pil = el('span', 'pf-pil'); pil.innerHTML = pillowSvg(colorOf(T, o), n, pw); t.append(pil);
    if (o < 0) t.append(el('span', 'pf-ted', '', { 'aria-hidden': 'true' }));
    t.onclick = e => { e.stopPropagation(); tapArea(s, i); };
    wrap.append(t);
  }
  ui.prevP = v.pillows.slice(); ui.prevO = v.owner.slice(); ui.prevKey = T.id;
  // the ways between floors and out to the yards, over the tiles
  const marks = el('div', 'pf-marks', '', { 'aria-hidden': 'true' });
  const mk = Math.max(17, Math.min(28, Math.min(L.cw, L.ch) * 0.36));
  for (const [x, y, kind] of v.map.links) {
    if (kind === 'room' || kind === 'yard' || kind === 'zip') continue;
    const a = A[x], b = A[y];
    let cx, cy;
    if (a.c === b.c) { cx = L.cw * (a.c + 0.8); cy = L.top + L.ch * Math.max(a.r, b.r); } // on the floor between, toward the right
    else { cx = L.cw * Math.max(a.c, b.c); cy = L.top + L.ch * (a.r + 0.84); } // on the house wall, low
    const m = el('span', 'pf-mark ' + kind); m.innerHTML = SVG(LINK_ART[kind] || '', '-4 -1 24 26');
    Object.assign(m.style, { left: (cx - mk / 2) + 'px', top: (cy - mk / 2) + 'px', width: mk + 'px', height: mk + 'px' });
    marks.append(m);
  }
  // the regions: name and bonus; a crew holding all of one shows its colour
  const tag = (g2, x, y, align) => {
    const R = v.map.regions[g2], holder = (v.regions || []).findIndex(l => l.includes(g2));
    const tg = el('span', 'pf-reg' + (holder >= 0 ? ' held' : ''));
    tg.style.background = R.color;
    if (holder >= 0) { tg.style.setProperty('--own', colorOf(T, holder)); tg.append(el('i', 'pf-regdot')); }
    tg.append(el('b', '', (small ? R.short.replace('Front Yard', 'Yard').replace('Back Yard', 'Yard').replace('Downstairs', 'Down').replace('Upstairs', 'Up').replace('Basement', 'Cellar') : R.short) + ' +' + R.bonus));
    Object.assign(tg.style, { top: y + 'px' });
    if (align === 'r') tg.style.right = (W - x) + 'px'; else if (align === 'c') { tg.style.left = x + 'px'; tg.style.transform = 'translateX(-50%)'; } else tg.style.left = x + 'px';
    marks.append(tg);
  };
  const ty = k => L.top + L.ch * k - (small ? 6 : 8);
  tag(0, L.cw * 4, Math.max(0, L.top - (small ? 10 : 12)), 'c');
  tag(1, L.cw + 3, ty(1) + 1); tag(2, L.cw + 3, ty(2) + 1); tag(3, L.cw + 3, ty(3) + 1);
  const yy = L.top + L.ch - (small ? 26 : 30);
  tag(4, 2, yy); tag(5, W - 2, yy, 'r');
  wrap.append(marks);
  // the last pillow fight: an arrow and the dice, a few seconds
  if (v.last && ui.fightNo !== v.last.no) {
    if (ui.fightNo === undefined) ui.fightNo = v.last.no; // (a fight from before the overlay opened is not news)
    else { ui.fightNo = v.last.no; ui.fightAt = Date.now(); clearTimeout(fx.fightT); fx.fightT = setTimeout(() => s.rerender(), 3500); }
  }
  if (v.last && ui.fightNo === v.last.no && Date.now() - (ui.fightAt || 0) < 3400) wrap.append(fightCard(T, v, me, L));
  // a peeked area (watching, or not your turn): its name and who holds it
  if (ui.peek != null && !st.my && A[ui.peek]) {
    const a = A[ui.peek], o = v.owner[ui.peek], p = el('div', 'pf-peek');
    const d = el('i', 'pf-dot'); d.style.background = colorOf(T, o);
    p.append(d, el('b', '', a.name), el('span', '', ` ${v.pillows[ui.peek]} - ${who(T, o, me)} - ${v.map.regions[a.region].name}`));
    wrap.append(p);
  }
  board.append(wrap);
}

function fightCard(T, v, me, L) {
  const f = v.last, A = v.map.areas, card = el('div', 'pf-fight' + (f.won ? ' won' : ''), '', { role: 'status' });
  // the arrow from the attacker's area to the defender's
  const ra = tileRect(L, A[f.from]), rb = tileRect(L, A[f.to]);
  const x1 = ra.x + ra.w / 2, y1 = ra.y + ra.h / 2, x2 = rb.x + rb.w / 2, y2 = rb.y + rb.h / 2;
  const ar = el('div', 'pf-arrow', '', { 'aria-hidden': 'true' });
  const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1);
  Object.assign(ar.style, { left: x1 + 'px', top: y1 + 'px', width: Math.max(0, len - 10) + 'px', transform: `rotate(${ang}rad)` });
  ar.style.setProperty('--own', colorOf(T, f.seat));
  const box = el('div', 'pf-fbox');
  const side = (k, dice, lost, name) => {
    const c = el('div', 'pf-fside');
    const h = el('div', 'pf-fwho'); const d = el('i', 'pf-dot'); d.style.background = colorOf(T, k); h.append(d, el('span', '', name)); c.append(h);
    const row = el('div', 'pf-dice');
    for (const n of dice) { const dd = el('span', 'pf-die'); dd.style.background = colorOf(T, k); dd.innerHTML = dieFace(n); row.append(dd); }
    c.append(row);
    c.append(el('small', 'pf-lost' + (lost ? ' some' : ''), lost ? `${lost} flopped` : 'no flops'));
    return c;
  };
  box.append(side(f.seat, f.a, f.aLost, who(T, f.seat, me)), el('b', 'pf-vs', 'vs'), side(f.def, f.d, f.dLost, who(T, f.def, me)));
  card.append(box);
  const foot = el('div', 'pf-ffoot');
  foot.append(el('span', '', `${A[f.from].short} at ${A[f.to].short}${f.blitz && f.rounds > 1 ? ` - ${f.rounds} throws` : ''}`));
  if (f.won) foot.append(el('b', 'pf-wonword', 'Claimed!'));
  card.append(foot);
  // on the half of the board away from the fight
  if ((y1 + y2) / 2 < L.H * 0.5) { card.style.top = 'auto'; card.style.bottom = '4px'; }
  const frag = document.createDocumentFragment(); frag.append(ar, card);
  return frag;
}
const FACE = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]], 6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]] };
const dieFace = n => `<svg viewBox="0 0 100 100" aria-label="${n}">${(FACE[n] || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="${CREAM}" stroke="${INK}" stroke-width="5"/>`).join('')}</svg>`;

// ---------------------------------------------------------------- the hand: pillows to place, your treats, what to do
function hint(s, st) {
  const { v, moves } = s;
  if (!st.my) return v.phase === 'play' && v.turn >= 0 ? null : null;
  if (v.stage === 'cash') return 'Five treats or more: trade three in first.';
  if (v.stage === 'place') return st.from == null ? 'Tap one of your areas, then +1, +3 or All. Or Auto.' : `Tap ${v.map.areas[st.from].short} again for +1, or use the buttons.`;
  if (v.stage === 'advance') return `Claimed! Move how many pillows into ${v.map.areas[v.adv.to].short}?`;
  if (v.stage === 'attack') {
    if (st.from == null) return moves.some(m => m.type === 'roll') ? 'Tap your area (2+ pillows), then a neighbour to fight.' : 'No fights left. End your turn.';
    if (st.to == null) return `${v.map.areas[st.from].short} (${v.pillows[st.from]}): tap a red-ringed area to fight, or a green one to shuffle.`;
    const A = v.map.areas, pair = `${A[st.from].short} (${v.pillows[st.from]}) to ${A[st.to].short} (${v.pillows[st.to]})`;
    if (st.targets.has(st.to)) return `${pair}: Throw once, or Storm until it is decided.`;
    return `${pair}: shuffle pillows (this ends your turn).`;
  }
  return null;
}
function renderHand(hand, s) {
  const { T, v, me } = s;
  hand.textContent = '';
  if (!v || me === null || me === undefined || !v.map) return;
  const st = stateOf(s), box = el('div', 'pf-hand');
  const stat = el('div', 'pf-stat' + (st.stage === 'place' ? ' hot' : ''));
  if (!v.alive[me]) { stat.append(el('b', '', 'Out'), el('small', '', 'flopped')); }
  else if (st.stage === 'place' || st.stage === 'cash') { const p = el('span', 'pf-sp'); p.innerHTML = pillowSvg(colorOf(T, me), v.left, 44); stat.append(p, el('small', '', 'to place')); }
  else { const p = el('span', 'pf-sp'); p.innerHTML = pillowSvg(colorOf(T, me), v.areas[me], 40); stat.append(p, el('small', '', `areas, +${v.income[me]}/turn`)); }
  box.append(stat);
  if (v.settings.cards) {
    const cards = el('div', 'pf-cards', '', { 'aria-label': 'Your treat cards' });
    if (!v.hand.length) cards.append(el('p', 'pf-none', 'Win an area in a turn to earn a treat card.'));
    for (const c of v.hand) {
      const d = el('span', 'pf-card k' + c.kind, '', { 'aria-label': `${KIND[c.kind]}, worth ${c.value}`, title: `${KIND[c.kind]} (${c.value})` });
      const art = el('span', 'pf-cart'); art.innerHTML = SVG(TREAT[c.kind], '0 0 40 40'); d.append(art);
      d.append(el('b', '', '' + c.value));
      cards.append(d);
    }
    box.append(cards);
  }
  const h = hint(s, st);
  if (h) box.append(el('p', 'pf-hint', h));
  hand.append(box);
}

// ---------------------------------------------------------------- the buttons
const setWord = (cards, v) => cards.map(id => { const c = v.hand.find(x => x.id === id); return c ? KIND[c.kind].split(' ')[0] : '?'; }).join(', ');
function buttons(s) {
  const { v, moves, me, ui } = s, out = [];
  if (!v || me === null || v.turn !== me || v.phase !== 'play') return out;
  const st = stateOf(s);
  const trades = moves.filter(m => m.type === 'trade');
  for (const m of trades.slice(0, v.stage === 'cash' ? 3 : 1)) {
    const val = m.cards.reduce((t, id) => t + (v.hand.find(x => x.id === id) || { value: 0 }).value, 0) + 2;
    out.push({ id: 'trade-' + m.cards.join('-'), icon: ICON.trade, label: `Trade in ${setWord(m.cards, v)} for ${val} pillows`, word: '+' + val, move: m, hot: v.stage === 'cash' });
  }
  if (v.stage === 'place') {
    if (st.from != null) {
      for (const m of moves.filter(x => x.type === 'place' && x.area === st.from)) {
        const all = m.n === v.left && m.n > 1;
        out.push({ id: 'add' + m.n, icon: ICON.add, label: `${all ? 'All ' : ''}${m.n} pillow${m.n === 1 ? '' : 's'} on ${v.map.areas[st.from].name}`, word: all ? 'All ' + m.n : '+' + m.n, move: m, hot: all, key: all ? 'A' : null });
      }
    }
    out.push({ id: 'auto', icon: ICON.auto, label: `Place all ${v.left} for me (on the fronts)`, word: st.from == null ? 'Auto' : null, move: moves.find(m => m.type === 'auto') });
  } else if (v.stage === 'attack') {
    if (st.from != null && st.to != null && st.targets.has(st.to)) {
      const r = moves.find(m => m.type === 'roll' && m.from === st.from && m.to === st.to), b = moves.find(m => m.type === 'blitz' && m.from === st.from && m.to === st.to);
      if (r) out.push({ id: 'roll', icon: ICON.roll, label: `Throw once: ${v.map.areas[st.from].name} at ${v.map.areas[st.to].name}`, word: 'Throw', key: 'R', move: r, hot: true });
      if (b) out.push({ id: 'blitz', icon: ICON.storm, label: `Pillow storm: keep throwing until ${v.map.areas[st.to].name} is won or 1 pillow is left`, word: 'Storm', key: 'S', move: b });
    } else if (st.from != null && st.to != null && st.allies.has(st.to)) {
      for (const m of moves.filter(x => x.type === 'shift' && x.from === st.from && x.to === st.to)) out.push({ id: 'shift' + m.n, icon: ICON.move, label: `Shuffle ${m.n} to ${v.map.areas[st.to].name} and end your turn`, word: 'Move ' + m.n, move: m, hot: m.n === v.pillows[st.from] - 1 });
    }
    const end = moves.find(m => m.type === 'end');
    if (end) out.push({ id: 'end', icon: ICON.end, label: 'End your turn', word: st.from == null ? 'End turn' : null, key: 'E', move: end, hot: st.from == null && !moves.some(m => m.type === 'roll') });
  } else if (v.stage === 'advance') {
    for (const m of moves) out.push({ id: 'adv' + m.n, icon: ICON.move, label: `Move ${m.n} pillow${m.n === 1 ? '' : 's'} into ${v.map.areas[v.adv.to].name}`, word: 'Move ' + m.n, move: m, hot: m === moves[moves.length - 1] });
  }
  if (st.from != null && v.stage !== 'advance') out.push({ id: 'unpick', icon: ICON.close, label: 'Clear the pick', run: () => { ui.sel = null; ui.to = null; s.rerender(); } });
  return out;
}

// ---------------------------------------------------------------- the words for each beat
function describe(T, v, b, me) {
  const w = k => who(T, k, me), nm = i => areaName(v || T.view, i);
  switch (b.kind) {
    case 'start': return 'Pillow Forts! Every crew has its corners of the house. Fluff up, then fight!';
    case 'turn': return b.mustTrade ? `${w(b.seat)} ${verb(b.seat, me, 'have', 'has')} five treats: trade in first!` : `${b.seat === me ? 'Your' : w(b.seat) + "'s"} turn: ${b.pillows} new pillows${b.regions && b.regions.length ? ' (with region bonuses)' : ''}.`;
    case 'place': return b.auto ? `${w(b.seat)} ${verb(b.seat, me, 'fluff', 'fluffs')} up ${b.list.reduce((t, x) => t + x[1], 0)} pillows on the fronts.` : `${w(b.seat)} ${verb(b.seat, me, 'add', 'adds')} ${b.list[0][1]} to ${nm(b.list[0][0])}.`;
    case 'cash': return `${w(b.seat)} ${verb(b.seat, me, 'trade', 'trades')} in ${b.cards.map(c => KIND[c.kind]).join(', ')} for ${b.pillows} pillows!`;
    case 'battle': {
      const lost = [];
      if (b.dLost) lost.push(`${b.dLost} of ${b.def === me ? 'yours' : b.def < 0 ? "the Teddies'" : w(b.def) + "'s"}`);
      if (b.aLost) lost.push(`${b.aLost} of ${b.seat === me ? 'yours' : w(b.seat) + "'s"}`);
      return `Pillow fight at ${nm(b.to)}: ${lost.join(' and ')} flop${b.won ? ' - claimed!' : '.'}`;
    }
    case 'claim': return b.broke >= 0 ? `${w(b.seat)} ${verb(b.seat, me, 'claim', 'claims')} ${nm(b.to)} and ${verb(b.seat, me, 'break', 'breaks')} ${w(b.def) === 'You' ? 'your' : w(b.def) + "'s"} ${v ? v.map.regions[b.broke].name : 'region'}!` : `${w(b.seat)} ${verb(b.seat, me, 'claim', 'claims')} ${nm(b.to)}.`;
    case 'region': return `${w(b.seat)} ${verb(b.seat, me, 'hold', 'holds')} all of ${v ? v.map.regions[b.region].name : 'a region'}: +${b.bonus} pillows a turn!`;
    case 'flop': return `${b.seat === me ? 'Your crew is' : w(b.seat) + "'s crew is"} out of the fight! ${w(b.by)} ${verb(b.by, me, 'take', 'takes')} ${b.cards} treat${b.cards === 1 ? '' : 's'}.`;
    case 'advance': return `${w(b.seat)} ${verb(b.seat, me, 'move', 'moves')} ${b.n} into ${nm(b.to)}.`;
    case 'shift': return `${w(b.seat)} ${verb(b.seat, me, 'shuffle', 'shuffles')} ${b.n} pillow${b.n === 1 ? '' : 's'} to ${nm(b.to)}.`;
    case 'draw': return `${w(b.seat)} ${verb(b.seat, me, 'earn', 'earns')} a treat card.`;
    case 'gameOver': {
      const names = (b.winners || []).map(w);
      const how = b.why === 'last' ? 'last crew standing' : b.why === 'areas' ? 'the whole house nearly theirs' : b.why === 'regions' ? 'held 3 regions for a round' : 'most areas after the last round';
      return `${names.join(' and ')} ${names.length > 1 || names[0] === 'You' ? 'win' : 'wins'}: ${how}!`;
    }
    default: return null;
  }
}

// ---------------------------------------------------------------- sounds and eyecatches
function moments(b, c) {
  const { play, eye, me, T } = c;
  switch (b.kind) {
    case 'start': case 'deal': play('tg-deal'); break;
    case 'turn': if (me != null && b.seat === me) { if (eye) eye.turn(() => play('tg-yourturn')); else play('tg-yourturn'); } break;
    case 'place': play('tg-lift'); break;
    case 'cash': play('tg-tally', 100); if (eye && b.seat === me) eye.ribbon(`+${b.pillows} pillows!`); break;
    case 'battle': play('tg-draw'); play('tg-tile', 260); if (b.dLost || b.aLost) play('tg-back', 520); break;
    case 'claim': play('tg-stamp', 120); break;
    case 'region': if (eye) eye.stamp('Whole region!', `${who(T, b.seat, me)} ${verb(b.seat, me, 'hold', 'holds')} ${T.view && T.view.map ? T.view.map.regions[b.region].name : 'it'} (+${b.bonus})`, { color: '#3f6fd9', sound: () => play('tg-stamp') }); else play('tg-ring'); break;
    case 'flop': if (eye) eye.stamp('Flop!', `${who(T, b.seat, me)} ${verb(b.seat, me, 'are', 'is')} out of pillows`, { color: '#e0463c', sound: () => play('tg-stamp') }); else play('tg-back'); break;
    case 'advance': case 'shift': play('tg-tile'); break;
    case 'draw': if (b.seat === me) play('tg-draw'); break;
    default: break;
  }
}

// ---------------------------------------------------------------- the end card
function overPanel(T, res, me) {
  const box = el('div', 'tg-round over pf-over');
  const v = T.view || {}, win = (res && res.winners) || v.winners || [];
  const names = win.map(k => who(T, k, me));
  const rib = el('div', 'tg-ribbon gold', '', { 'aria-hidden': 'true' }); rib.append(el('b', '', 'Pillow Forts'));
  const why = v.why === 'last' ? 'Last crew standing.' : v.why === 'areas' ? `${v.goal && v.goal.areas || 22} areas of the house!` : v.why === 'regions' ? 'Held 3 whole regions for a round.' : 'Most areas after the last round.';
  box.append(rib, el('div', 'tg-h', names.length ? `${names.join(' and ')} ${names.length > 1 || names[0] === 'You' ? 'win' : 'wins'}!` : 'Game over'), el('p', 'tg-sub', why));
  const n = (v.areas || []).length, order = Array.from({ length: n }, (_, k) => k).sort((a, b) => (v.alive[b] - v.alive[a]) || v.areas[b] - v.areas[a] || v.totals[b] - v.totals[a] || (v.out || []).indexOf(b) - (v.out || []).indexOf(a));
  const list = el('div', 'tg-count pf-list');
  const hdr = el('div', 'pf-row pf-head'); hdr.append(el('span', '', ''), el('span', '', 'Areas'), el('span', '', 'Pillows'), el('span', '', 'Regions')); list.append(hdr);
  for (const k of order) {
    const row = el('div', 'tg-crow on pf-row' + (win.includes(k) ? ' win' : ''));
    row.style.setProperty('--seat', colorOf(T, k));
    const nm = el('span', 'pf-rname'); nm.append(el('i', 'tg-dot'), el('span', 'pf-rn', who(T, k, me)));
    const out = v.alive && !v.alive[k];
    row.append(nm, el('b', 'tg-ctot', out ? '-' : '' + v.areas[k]), el('span', '', out ? 'flopped' : '' + v.totals[k]), el('span', '', out ? '' : '' + ((v.regions && v.regions[k]) || []).length));
    list.append(row);
  }
  box.append(list, el('p', 'tg-note', res && res.counted ? 'On the store window leaderboard.' : 'A bot played, so this one is just for fun (not on the leaderboard).'));
  let done = false;
  box.onShow = () => { if (done) return; done = true; rib.classList.add('in'); LOOK.eye?.confetti(); LOOK.sound?.(me != null && win.includes(me) ? 'tg-fanfare' : 'tg-cheer'); };
  return box;
}

// ---------------------------------------------------------------- the rules card
function rulesCard() {
  const c = el('div', 'tg-rules pf-rules');
  c.append(el('div', 'tg-h', 'Pillow Forts'));
  const row = (pic, text) => { const r = el('div', 'tg-rrow'); const p = el('div', 'tg-rpic'); p.innerHTML = pic; r.append(p, el('p', '', text)); c.append(r); };
  const ic = k => `<span class="tg-ico">${ICON[k]}</span>`;
  const pil = (col, n) => pillowSvg(col, n, 40);
  row(pil('#ff8fb8', 3), 'Rival pillow-fort crews share one giant house. Every area holds a pile of your pillows (always at least 1). Nobody gets hurt: a beaten pillow just flops.');
  row(ic('add') + ic('auto'), 'Fluff up: each turn you get pillows: your areas / 3 (at least 3), plus a bonus for each whole region you hold. Tap an area, then +1, +3 or All. Auto puts them on your fronts.');
  row(ic('roll') + ic('storm'), 'Pillow fight: tap your area with 2+ pillows, then a next-door area of another crew. Throw: you roll a die per pillow past the one that stays home (3 at most), they roll one per pillow (2 at most). Highest against highest, then the next pair: higher wins, a tie goes to the defender. Storm keeps throwing until it is decided.');
  row(ic('move'), 'Win an area and move in (at least as many as your dice). Ladders, stairs, doors and the zip line over the roof join the floors and yards. One shuffle along your own areas ends your turn.');
  row(`<span class="tg-ico">${SVG(TREAT[0], '0 0 40 40')}</span><span class="tg-ico">${SVG(TREAT[1], '0 0 40 40')}</span><span class="tg-ico">${SVG(TREAT[2], '0 0 40 40')}</span>`, 'Treats: win an area in your turn and earn a treat card. Three of a kind, or one of each, trade in for their numbers added up +2 pillows (a Midnight Feast is any kind). Five treats at the start of your turn: trade first. Flop a crew out and take its treats.');
  row(ic('end'), 'Quick game: hold 3 whole regions when your turn comes round again, or most areas after 10 rounds. Full game: last crew standing or 22 areas (30 rounds at most). With 2 players the sleepy Teddies hold a few areas and only ever defend.');
  return c;
}

const ui = {
  id: 'pillow-forts',
  lid: 'pillow fights for 2 to 6',
  tip: 'Tap your area, then a neighbour to start a pillow fight.',
  render(board, hand, s) { renderBoard(board, s); renderHand(hand, s); },
  buttons,
  chip(T, v, k) {
    if (!v || !v.areas) return null;
    if (v.alive && !v.alive[k]) return { extra: [el('span', 'pf-chipout', 'out')] };
    const extra = [];
    if (v.settings && v.settings.cards && v.cards[k]) { const c = el('span', 'pf-chipcard', '' + v.cards[k], { title: v.cards[k] + ' treat cards' }); extra.push(c); }
    return { score: v.areas[k], extra };
  },
  pill(T, v) { return v && v.round ? `Round ${v.round}/${v.rounds}` : null; },
  describe,
  moments,
  overPanel,
  rulesCard,
  setupLine(settings, n) {
    const full = settings && settings.length === 'full', cards = !(settings && (settings.cards === false || settings.cards === 'false'));
    return `${full ? 'Last crew standing or 22 areas (30 rounds at most)' : 'Hold 3 regions for a round, or most areas after 10 rounds'}. ${cards ? 'Treat cards on.' : 'No treat cards.'}${n === 2 ? ' The Teddies join in for 2 players.' : ''}`;
  },
  onKey(code, s) {
    const list = buttons(s), by = id => list.find(b => b.id === id);
    const go = b => { if (!b) return false; if (b.run) b.run(); else s.send(b.move); return true; };
    if (code === 'KeyR' || code === 'Space') return go(by('roll'));
    if (code === 'KeyS') return go(by('blitz'));
    if (code === 'KeyA') return go(list.find(b => /^add/.test(b.id) && b.hot) || by('auto'));
    if (code === 'KeyE') return go(by('end'));
    if (code === 'Escape') return go(by('unpick'));
    if (code === 'Enter') return go(list.find(b => b.hot));
    return false;
  },
  css: `
.tg-pillow-forts .tg-boardwrap { background: #dff3ff; }
.tg-pillow-forts .pf-wrap { position: absolute; inset: 0; overflow: hidden; }
.tg-pillow-forts .pf-bg { position: absolute; inset: 0; width: 100%; height: 100%; }
.tg-pillow-forts .pf-tile { position: absolute; box-sizing: border-box; margin: 0; padding: 2px 1px 1px; border: 2.5px solid #2b2340; border-radius: 9px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0; color: #2b2340; font-family: Fredoka, sans-serif; box-shadow: inset 0 -3px 0 rgba(43,35,64,.12); transition: transform .12s; overflow: hidden; touch-action: manipulation; }
.tg-pillow-forts .pf-tile:active { transform: scale(.96); }
.tg-pillow-forts .pf-name { display: block; max-width: 100%; font-weight: 600; line-height: 1.02; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 2px; }
.tg-pillow-forts .pf-pil { display: block; line-height: 0; filter: drop-shadow(0 2px 0 rgba(43,35,64,.55)); }
.tg-pillow-forts .pf-pil svg { display: block; }
.tg-pillow-forts .pf-ted { position: absolute; right: 2px; top: 2px; width: 11px; height: 11px; border-radius: 50%; background: #a8794e; border: 1.5px solid #2b2340; box-shadow: -5px -1px 0 -2px #a8794e, 5px -1px 0 -2px #a8794e; }
.tg-pillow-forts .pf-tile.mine { box-shadow: inset 0 0 0 2px var(--own), inset 0 -3px 0 rgba(43,35,64,.12); }
.tg-pillow-forts .pf-tile.canplace { animation: pf-glow 1.6s ease-in-out infinite; }
@keyframes pf-glow { 50% { box-shadow: inset 0 0 0 3px #ffd34d, inset 0 -3px 0 rgba(43,35,64,.12); } }
.tg-pillow-forts .pf-tile.sel { z-index: 3; border-color: #2b2340; box-shadow: 0 0 0 3px #ffd34d, 0 0 0 5.5px #2b2340; transform: translateY(-2px); animation: none; }
.tg-pillow-forts .pf-tile.target { z-index: 2; outline: 3px dashed #e0463c; outline-offset: -6px; animation: pf-pulse 1s ease-in-out infinite; }
.tg-pillow-forts .pf-tile.ally { z-index: 2; outline: 3px dashed #2f9a4f; outline-offset: -6px; }
.tg-pillow-forts .pf-tile.aim { z-index: 3; outline: 4px solid #e0463c; outline-offset: -7px; box-shadow: 0 0 0 3px #e0463c, 0 0 0 5.5px #2b2340; animation: none; }
.tg-pillow-forts .pf-tile.ally.aim { outline-color: #2f9a4f; box-shadow: 0 0 0 3px #2f9a4f, 0 0 0 5.5px #2b2340; }
@keyframes pf-pulse { 50% { outline-color: #ffb3a8; } }
.tg-pillow-forts .pf-tile.won { z-index: 3; box-shadow: 0 0 0 3px #7ddc7a, 0 0 0 5.5px #2b2340; animation: pf-pop .45s cubic-bezier(.3,1.6,.5,1); }
.tg-pillow-forts .pf-tile.peek { z-index: 3; box-shadow: 0 0 0 3px #fff8ec, 0 0 0 5px #2b2340; }
.tg-pillow-forts .pf-tile.bump .pf-pil { animation: pf-pop .4s cubic-bezier(.3,1.8,.5,1); }
.tg-pillow-forts .pf-tile.taken { animation: pf-pop .5s cubic-bezier(.3,1.6,.5,1); }
.tg-pillow-forts .pf-tile.fought:not(.sel):not(.won) { box-shadow: 0 0 0 2.5px #fff8ec, 0 0 0 4.5px #e0463c; z-index: 2; }
@keyframes pf-pop { 0% { transform: scale(.7); } 60% { transform: scale(1.12); } 100% { transform: none; } }
.tg-pillow-forts .pf-marks { position: absolute; inset: 0; pointer-events: none; z-index: 4; }
.tg-pillow-forts .pf-mark { position: absolute; display: block; box-sizing: border-box; padding: 1px; border-radius: 50%; background: #fff8ec; border: 2px solid #2b2340; box-shadow: 0 1.5px 0 rgba(43,35,64,.6); }
.tg-pillow-forts .pf-mark svg { width: 100%; height: 100%; display: block; }
.tg-pillow-forts .pf-reg { position: absolute; display: inline-flex; align-items: center; gap: 3px; padding: 0 5px; height: 15px; border: 1.5px solid #2b2340; border-radius: 8px; font: 700 10px/1 Fredoka, sans-serif; color: #2b2340; white-space: nowrap; box-shadow: 0 1.5px 0 rgba(43,35,64,.6); }
.tg-pillow-forts .pf-reg.held { box-shadow: 0 0 0 2px var(--own), 0 1.5px 0 2px rgba(43,35,64,.6); }
.tg-pillow-forts .pf-regdot { width: 8px; height: 8px; border-radius: 50%; background: var(--own); border: 1px solid #2b2340; }
.tg-pillow-forts.portrait .pf-reg, .tg-pillow-forts[data-form="phone"] .pf-reg { height: 13px; font-size: 9px; padding: 0 4px; }
.tg-pillow-forts .pf-arrow { position: absolute; z-index: 5; height: 6px; margin-top: -3px; transform-origin: 0 50%; background: var(--own); border: 1.5px solid #2b2340; border-radius: 3px; pointer-events: none; animation: pf-grow .35s ease-out; }
.tg-pillow-forts .pf-arrow::after { content: ''; position: absolute; right: -11px; top: 50%; transform: translateY(-50%); border: 7px solid transparent; border-left: 10px solid #2b2340; }
@keyframes pf-grow { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
.tg-pillow-forts .pf-fight { position: absolute; z-index: 6; left: 50%; top: 4px; transform: translateX(-50%); min-width: 170px; max-width: 94%; background: #fff8ec; border: 3px solid #2b2340; border-radius: 12px; box-shadow: 0 4px 0 rgba(43,35,64,.85); pointer-events: none; animation: tg-pop .3s cubic-bezier(.3,1.6,.5,1); }
.tg-pillow-forts .pf-fbox { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 4px 8px 2px; }
.tg-pillow-forts .pf-fside { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; }
.tg-pillow-forts .pf-fwho { display: flex; align-items: center; gap: 3px; font: 600 12px Fredoka, sans-serif; max-width: 90px; white-space: nowrap; overflow: hidden; }
.tg-pillow-forts .pf-dice { display: flex; gap: 3px; }
.tg-pillow-forts .pf-die { display: block; width: 24px; height: 24px; border: 2px solid #2b2340; border-radius: 6px; box-sizing: border-box; animation: pf-roll .5s cubic-bezier(.3,1.4,.5,1); }
.tg-pillow-forts .pf-die svg { width: 100%; height: 100%; display: block; }
@keyframes pf-roll { 0% { transform: translateY(-14px) rotate(-160deg) scale(.6); } 100% { transform: none; } }
.tg-pillow-forts .pf-lost { font: 700 11px Fredoka, sans-serif; color: #6b5e52; }
.tg-pillow-forts .pf-lost.some { color: #e0463c; }
.tg-pillow-forts .pf-vs { font: 700 15px Fredoka, sans-serif; color: #6e4224; }
.tg-pillow-forts .pf-ffoot { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 8px 4px; font: 600 11px Fredoka, sans-serif; color: #6b5e52; }
.tg-pillow-forts .pf-wonword { color: #2f9a4f; font-size: 13px; }
.tg-pillow-forts .pf-fight.won { border-color: #2b2340; background: #effbe6; }
.tg-pillow-forts .pf-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid #2b2340; flex: 0 0 auto; }
.tg-pillow-forts .pf-peek { position: absolute; z-index: 6; left: 50%; bottom: 6px; transform: translateX(-50%); display: flex; align-items: center; gap: 4px; padding: 3px 10px; background: #fff8ec; border: 2.5px solid #2b2340; border-radius: 12px; font: 600 13px Fredoka, sans-serif; white-space: nowrap; max-width: 94%; overflow: hidden; }
.tg-pillow-forts .pf-hand { position: absolute; inset: 4px 6px; display: flex; align-items: center; gap: 8px; }
.tg-pillow-forts .pf-stat { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 64px; padding: 2px 6px; border-radius: 12px; background: #2f6b4f; color: #fff8ec; border: 2.5px solid #2b2340; line-height: 1.05; }
.tg-pillow-forts .pf-stat.hot { background: #e0463c; animation: tg-breathe 1.2s ease-in-out infinite; }
.tg-pillow-forts .pf-stat b { font-size: 20px; color: #ffd34d; }
.tg-pillow-forts .pf-stat small { font-size: 11px; font-weight: 600; white-space: nowrap; }
.tg-pillow-forts .pf-sp { line-height: 0; }
.tg-pillow-forts .pf-cards { flex: 0 1 auto; min-width: 0; display: flex; gap: 4px; overflow-x: auto; padding: 4px 2px 2px; }
.tg-pillow-forts .pf-card { position: relative; flex: 0 0 auto; width: 38px; height: 50px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 2.5px solid #2b2340; border-radius: 7px; background: #fff8ec; box-shadow: 0 2px 0 rgba(43,35,64,.8); box-sizing: border-box; }
.tg-pillow-forts .pf-card.k0 { background: #f3e3c3; } .tg-pillow-forts .pf-card.k1 { background: #ffe8c2; } .tg-pillow-forts .pf-card.k2 { background: #ffe0e0; } .tg-pillow-forts .pf-card.k3 { background: #d9d2f2; }
.tg-pillow-forts .pf-cart { width: 28px; height: 28px; display: block; }
.tg-pillow-forts .pf-cart svg { width: 100%; height: 100%; display: block; }
.tg-pillow-forts .pf-card b { font: 700 13px/1 Fredoka, sans-serif; }
.tg-pillow-forts .pf-none { margin: 0; font-size: 12px; font-weight: 600; color: #6b5e52; max-width: 11rem; }
.tg-pillow-forts .pf-hint { flex: 1 1 0; min-width: 0; margin: 0; font: 600 13px/1.2 Fredoka, sans-serif; color: #2b2340; }
.tg-pillow-forts.portrait .pf-hint { font-size: 12px; }
.tg-pillow-forts .pf-chipout { font-size: 11px; font-weight: 700; color: #e0463c; }
.tg-pillow-forts .pf-chipcard { display: inline-flex; align-items: center; justify-content: center; min-width: 14px; height: 17px; padding: 0 2px; border: 1.5px solid #2b2340; border-radius: 4px; background: #e2a868; font: 700 11px Fredoka, sans-serif; color: #2b2340; }
.tg-pillow-forts .tg-acts { gap: 6px; }
.tg-pillow-forts .tg-act { width: 46px; height: 46px; }
.tg-pillow-forts .tg-act .tg-ico { width: 26px; height: 26px; }
.tg-pillow-forts .tg-act:has(.tg-act-word) { width: auto; min-width: 52px; height: 46px; padding: 0 12px 0 8px; border-radius: 26px; display: inline-flex; gap: 5px; font-size: 15px; font-weight: 700; color: #2b2340; white-space: nowrap; }
.tg-pillow-forts.portrait .tg-act, .tg-pillow-forts[data-form="phone"] .tg-act { width: 42px; height: 42px; }
.tg-pillow-forts.portrait .tg-act:has(.tg-act-word), .tg-pillow-forts[data-form="phone"] .tg-act:has(.tg-act-word) { width: auto; height: 42px; font-size: 14px; padding: 0 9px 0 6px; }
.tg-pillow-forts.portrait .tg-acts { flex-wrap: nowrap; }
.tg-pillow-forts.portrait .tg-acts:has(> .tg-act:nth-child(7)) .tg-act-word { display: none; }
.tg-pillow-forts.portrait .tg-acts:has(> .tg-act:nth-child(7)) .tg-act:has(.tg-act-word) { width: 42px; min-width: 0; padding: 0; border-radius: 50%; justify-content: center; }
.tg-pillow-forts .pf-list .pf-row { display: grid; grid-template-columns: 1.7fr 1fr 1fr 1fr; align-items: center; gap: 6px; }
.tg-pillow-forts .pf-head { font-size: 12px; font-weight: 700; color: #6b5e52; padding: 0 10px; }
.tg-pillow-forts .pf-rname { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
.tg-pillow-forts .pf-rn { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tg-pillow-forts .pf-rules .tg-rpic { display: flex; gap: 2px; align-items: center; }
.tg-pillow-forts .pf-rules .tg-rpic .tg-ico { width: 30px; height: 30px; }
`,
};
export default ui;
