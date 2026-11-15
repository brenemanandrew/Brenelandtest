// Town Tycoon's part of the table-game overlay (game-waves, SPEC section 3): the 28-space loop drawn flat in Breneland's look
// (a ring of tiles shaped to the board region: 8 x 8 upright, longer and lower sideways), the town map and the dice in the middle,
// a space's card on a tap, pawns stepping along, your cash and deeds in the hand, the buttons, the words for each beat, the end
// card (net worth) and the rules. Reads only the view it is given (public or your seat's).
import { el } from '../util.js';
import { seatInfo } from './mt-ui.js';
import { LOOK } from './tg-state.js';

const SIZE = 28;
const INK = '#2b2340';
const SVG = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const S = `stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;
const pip = (x, y) => `<circle cx="${x}" cy="${y}" r="1.5" fill="${INK}"/>`;
const ICON = {
  roll: SVG(`<rect x="2.5" y="7" width="11" height="11" rx="2.5" fill="#fff8ec" ${S}/>${pip(5.5, 10)}${pip(10.5, 15)}${pip(8, 12.5)}<rect x="11" y="3" width="10" height="10" rx="2.3" fill="#ffd34d" ${S} transform="rotate(14 16 8)"/>${pip(14.5, 6.5)}${pip(17.5, 9.5)}`),
  buy: SVG(`<path d="M4 10l8-6 8 6v10H4z" fill="#7ddc7a" ${S}/><rect x="10" y="14" width="4" height="6" fill="#fff8ec" ${S}/><circle cx="18" cy="6" r="4" fill="#ffd34d" ${S}/><path d="M18 4v4" ${S} stroke-width="1.6"/>`),
  skip: SVG(`<path d="M5 6l7 6-7 6zM13 6l7 6-7 6z" fill="#fff8ec" ${S}/>`),
  build: SVG(`<path d="M4 12l6-5 6 5v8H4z" fill="#7ddc7a" ${S}/><rect x="8" y="15" width="4" height="5" fill="#fff8ec" ${S}/><path d="M18 5v8M14 9h8" ${S} stroke-width="2.6"/>`),
  sell: SVG(`<path d="M4 12l6-5 6 5v8H4z" fill="#f3e3c3" ${S}/><path d="M14 9h8" ${S} stroke-width="2.6"/><circle cx="18" cy="17" r="3.5" fill="#ffd34d" ${S}/>`),
  mortgage: SVG(`<rect x="4" y="4" width="14" height="17" rx="2" fill="#fff8ec" ${S}/><path d="M7 9h8M7 13h8" ${S}/><path d="M13 20l7-7" stroke="#e0463c" stroke-width="3" stroke-linecap="round"/>`),
  unmortgage: SVG(`<rect x="4" y="4" width="14" height="17" rx="2" fill="#fff8ec" ${S}/><path d="M7 9h8M7 13h8" ${S}/><path d="M12 17l3 3 6-7" fill="none" stroke="#4fa45a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`),
  pay: SVG(`<circle cx="12" cy="12" r="9" fill="#ffd34d" ${S}/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="${INK}" font-family="Fredoka, sans-serif">B</text>`),
  map: SVG(`<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill="#f3e3c3" ${S}/><path d="M9 4v14M15 6v14" ${S}/><path d="M5 13c3-1 5 2 8 0s4-3 6-2" fill="none" stroke="#e0463c" stroke-width="1.8" stroke-dasharray="2 2"/>`),
  end: SVG(`<path d="M6 21V4" fill="none" ${S} stroke-width="2.4"/><path d="M6 4h11l-2.5 4L17 12H6" fill="#f2b630" ${S}/>`),
};
// the corner and special spaces' little pictures (viewBox 0 0 40 40)
const ART = {
  start: `<rect x="6" y="20" width="28" height="14" rx="2" fill="#fff8ec" ${S}/><path d="M4 21L20 8l16 13z" fill="#e0463c" ${S}/><rect x="17" y="25" width="6" height="9" fill="#9a6538" ${S}/><path d="M20 8V2l7 2.5-7 2.5" fill="#ffd34d" ${S}/>`,
  woods: `<path d="M12 34V26M28 34V26" ${S}/><path d="M12 4l-9 15h5l-6 9h20l-6-9h5z" fill="#4fa45a" ${S}/><path d="M28 6l-8 13h4l-5 8h18l-5-8h4z" fill="#2f6b4f" ${S}/><text x="20" y="38" text-anchor="middle" font-size="9" font-weight="700" fill="${INK}" font-family="Fredoka, sans-serif">?</text>`,
  picnic: `<path d="M4 30h32l-4-10H8z" fill="#e0463c" ${S}/><path d="M10 20l4 10M18 20l2 10M26 20l-2 10M32 20l-4 10" stroke="#fff8ec" stroke-width="2"/><path d="M14 18c0-6 12-6 12 0z" fill="#9a6538" ${S}/><circle cx="31" cy="8" r="4" fill="#ffd34d" ${S}/>`,
  wrong: `<path d="M20 36V10" ${S} stroke-width="3"/><path d="M8 8h18l5 5-5 5H8z" fill="#ffd34d" ${S}/><path d="M32 20H16l-5 5 5 5h16z" fill="#e0463c" ${S}/><path d="M14 13h8" ${S}/>`,
  lucky: `<path d="M20 5l4.5 9 10 1.5-7.2 7 1.7 10L20 28l-9 4.5 1.7-10-7.2-7 10-1.5z" fill="#ffd34d" ${S}/>`,
  notice: `<rect x="7" y="6" width="26" height="22" rx="2" fill="#fff8ec" ${S}/><path d="M12 13h16M12 18h16M12 23h10" ${S}/><path d="M20 28v8" ${S} stroke-width="3"/><circle cx="20" cy="6" r="2.5" fill="#e0463c" ${S}/>`,
  tax: `<path d="M8 22c0-8 24-8 24 0v8H8z" fill="#f3e3c3" ${S}/><path d="M14 16c-2-6 2-10 6-10s8 4 6 10" fill="none" ${S}/><path d="M14 26l3-3 3 3 3-3 3 3" fill="none" ${S}/><circle cx="31" cy="9" r="4.5" fill="#ffd34d" ${S}/>`,
  transit: `<rect x="5" y="9" width="30" height="19" rx="4" fill="#ffd34d" ${S}/><rect x="9" y="13" width="7" height="6" fill="#bfe3ff" ${S}/><rect x="19" y="13" width="7" height="6" fill="#bfe3ff" ${S}/><circle cx="12" cy="30" r="3.4" fill="${INK}"/><circle cx="28" cy="30" r="3.4" fill="${INK}"/>`,
  van: `<path d="M4 12h20v16H4zM24 17h7l5 5v6H24z" fill="#fff8ec" ${S}/><path d="M8 16l6 5 6-5" fill="none" stroke="#e0463c" stroke-width="2"/><circle cx="11" cy="30" r="3.4" fill="${INK}"/><circle cx="29" cy="30" r="3.4" fill="${INK}"/>`,
  tool: `<path d="M9 31l13-13" stroke="#9a6538" stroke-width="5" stroke-linecap="round"/><path d="M9 31l13-13" ${S} fill="none"/><path d="M20 10a7 7 0 0 1 10-4l-5 5 1 3 3 1 5-5a7 7 0 0 1-9 9z" fill="#c9d7e6" ${S}/>`,
};
const artFor = b => (b.kind === 'transit' ? (b.name.startsWith('Mail') ? ART.van : ART.transit) : ART[b.kind] || '');
// names short enough for the smallest tiles (the card shows the full name)
const TINY = { 1: 'Maple', 3: 'Acorn', 4: 'Pier Walk', 6: 'Bait Shop', 8: 'Strickler', 10: 'Duck Pond', 12: 'Angell St', 13: 'Bakery', 15: 'Rufallia', 17: 'Boat-house', 18: 'Summit', 20: 'Lookout', 22: 'Breneland', 23: 'Market', 26: 'Water Tower', 27: 'Clock-tower',
  0: 'Town Square', 2: 'Lucky', 5: 'Dog Fund', 7: 'Woods', 9: 'Tool Crib', 11: 'Bus 7', 14: 'Picnic', 16: 'Notice', 19: 'Lucky', 21: 'Wrong Turn', 24: 'Mail Van', 25: 'Notice' };

// a font size (px) at which the longest word of `text` fits in `w` px (Fredoka 600 runs about 0.56 em a letter)
const fitFont = (text, w, max) => Math.max(8, Math.min(max, w / (Math.max(...String(text).split(/[\s-]/).map(x => x.length), 3) * 0.58)));
const money = n => 'B' + Math.round(n).toLocaleString('en-US');
const who = (T, k, me) => (k === me ? 'You' : seatInfo(T, k).name);
const verb = (k, me, you, they) => (k === me ? you : they);
const mortValue = b => Math.floor(b.price / 2);
const unmortCost = b => Math.ceil(b.price / 2 * 1.1);
const isProp = b => b && !!b.price && b.kind !== 'tax';
const groupOwner = (v, g) => { const sp = v.board.filter(b => b.kind === 'street' && b.group === g).map(b => b.i), o = v.owner[sp[0]]; return o >= 0 && sp.every(i => v.owner[i] === o) ? o : -1; };
const spaceName = (v, i) => (v && v.board && v.board[i] ? v.board[i].name : 'a space');
const levelWord = l => (l >= 5 ? 'a shop' : 'a cottage');

// ---------------------------------------------------------------- the ring's shape
// cols + rows = 16 always gives a loop of 28 cells; pick the split whose cells are closest to a little wider than tall
function ringOf(W, H) {
  let best = 8, bestE = Infinity;
  for (let c = 5; c <= 12; c++) { const r = 16 - c, e = Math.abs(Math.log((W / c) / (H / r) / 1.15)) + (c === 8 ? -0.12 : 0); if (e < bestE) { bestE = e; best = c; } }
  const c = best, r = 16 - c, cw = W / c, ch = H / r, cells = [];
  for (let x = 0; x < c; x++) cells.push([x, 0]);
  for (let y = 1; y < r; y++) cells.push([c - 1, y]);
  for (let x = c - 2; x >= 0; x--) cells.push([x, r - 1]);
  for (let y = r - 2; y >= 1; y--) cells.push([0, y]);
  return { c, r, cw, ch, cells: cells.map(([x, y]) => ({ x: x * cw, y: y * ch, side: y === 0 ? 'top' : y === r - 1 ? 'bottom' : x === 0 ? 'left' : 'right' })) };
}

// ---------------------------------------------------------------- the pawns' walk: each seat's shown space steps toward its real one
const ANIM = new WeakMap();
function animOf(board) { let a = ANIM.get(board); if (!a) ANIM.set(board, a = { shown: [], target: [], timer: [], table: null }); return a; }
function placeTok(board, a, s, R) {
  const t = board.querySelector(`.tt-tok[data-seat="${s}"]`); if (!t) return;
  const p = tokXY(R, a.shown[s], s); t.style.left = p.x + 'px'; t.style.top = p.y + 'px';
}
function tokXY(R, i, s) {
  const c = R.cells[i], d = Math.round(Math.max(12, Math.min(22, Math.min(R.cw, R.ch) * 0.3)));
  const ox = s % 2 ? 0.74 : 0.26, oy = s < 2 ? 0.62 : 0.84;
  return { x: Math.round(c.x + ox * R.cw - d / 2), y: Math.round(c.y + oy * R.ch - d / 2), d };
}
function walk(board, a, s, to, R) {
  if (a.target[s] === to) return;
  a.target[s] = to; clearTimeout(a.timer[s]);
  const fwd = (to - a.shown[s] + SIZE) % SIZE;
  if (fwd === 0) return;
  if (fwd > 12) { a.timer[s] = setTimeout(() => { a.shown[s] = to; placeTok(board, a, s, a.R || R); }, 80); return; } // a jump (the woods, a card)
  const stepOn = () => { a.shown[s] = (a.shown[s] + 1) % SIZE; placeTok(board, a, s, a.R || R); if (a.shown[s] !== to) a.timer[s] = setTimeout(stepOn, 170); };
  a.timer[s] = setTimeout(stepOn, 120);
}

// ---------------------------------------------------------------- the middle: a little town map, the logo, the dice
const TOWN = `<svg class="tt-town" viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<rect width="300" height="200" fill="#bfe0a0"/>
<path d="M0 150c40-10 70 10 110 0s60-30 100-20 60 20 90 10V200H0z" fill="#8fd0f0" stroke="${INK}" stroke-width="2"/>
<path d="M-5 95h310M150 -5v210M60 95c0 30 20 50 30 105M230 95c-10-40 0-70 30-100" fill="none" stroke="#f3e3c3" stroke-width="10"/>
<path d="M-5 95h310M150 -5v210M60 95c0 30 20 50 30 105M230 95c-10-40 0-70 30-100" fill="none" stroke="#e8d3a8" stroke-width="2" stroke-dasharray="6 6"/>
<g stroke="${INK}" stroke-width="2" stroke-linejoin="round">
<rect x="20" y="55" width="26" height="22" fill="#fff8ec"/><path d="M17 57l16-14 16 14z" fill="#e0463c"/>
<rect x="100" y="60" width="22" height="18" fill="#fff8ec"/><path d="M97 62l14-12 14 12z" fill="#3f6fd9"/>
<rect x="170" y="110" width="26" height="20" fill="#fff8ec"/><path d="M167 112l16-13 16 13z" fill="#f2b630"/>
<rect x="250" y="112" width="22" height="18" fill="#fff8ec"/><path d="M247 114l14-12 14 12z" fill="#4fa45a"/>
<rect x="196" y="20" width="10" height="40" fill="#c9d7e6"/><ellipse cx="201" cy="22" rx="16" ry="10" fill="#c9d7e6"/>
<circle cx="80" cy="30" r="10" fill="#4fa45a"/><circle cx="95" cy="22" r="8" fill="#2f6b4f"/><circle cx="270" cy="60" r="10" fill="#4fa45a"/>
<circle cx="120" cy="125" r="9" fill="#4fa45a"/><circle cx="30" cy="125" r="8" fill="#2f6b4f"/>
</g></svg>`;
const FACE = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]], 6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]] };
function dieEl(n, cls = '') {
  const d = el('span', 'tt-die ' + cls, '', { 'aria-label': 'a ' + n });
  d.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="5" y="5" width="90" height="90" rx="20" fill="#fff8ec" stroke="${INK}" stroke-width="7"/>${(FACE[n] || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9.5" fill="${INK}"/>`).join('')}</svg>`;
  return d;
}

// ---------------------------------------------------------------- a space's card (the middle on a tap, the rules)
function spaceCard(T, v, i, me, onClose) {
  const b = v.board[i], card = el('div', 'tt-card', '', { role: 'group', 'aria-label': b.name });
  const o = v.owner[i], g = b.kind === 'street' ? v.groups[b.group] : null;
  const head = el('div', 'tt-chead'); if (g) head.style.background = g.color;
  if (!g) { const a = el('span', 'tt-cart'); a.innerHTML = `<svg viewBox="0 0 40 40">${artFor(b)}</svg>`; head.append(a); }
  head.append(el('b', '', b.name));
  if (onClose) { const x = el('button', 'tt-cx', '', { type: 'button', 'aria-label': 'Close the card' }); x.innerHTML = SVG(`<path d="M6 6l12 12M18 6L6 18" fill="none" ${S} stroke-width="3"/>`); x.onclick = e => { e.stopPropagation(); onClose(); }; head.append(x); }
  card.append(head);
  const body = el('div', 'tt-cbody');
  const row = (a, bb, cls = '') => { const r = el('div', 'tt-crow ' + cls); r.append(el('span', '', a), el('b', '', bb)); body.append(r); };
  if (b.kind === 'street') {
    const pair = groupOwner(v, b.group) >= 0, l = v.lvl[i];
    row('Price', money(b.price));
    row('Rent', money(b.rents[0]) + (pair ? '' : ''), l === 0 && !pair ? 'on' : '');
    row('Whole pair', money(b.rents[0] * 2), l === 0 && pair ? 'on' : '');
    for (let k = 1; k <= 4; k++) row(k + (k === 1 ? ' cottage' : ' cottages'), money(b.rents[k]), l === k ? 'on' : '');
    row('Shop', money(b.rents[5]), l === 5 ? 'on' : '');
    row('Cottage', money(g.build), 'small');
    row('Mortgage', money(mortValue(b)), 'small');
  } else if (b.kind === 'transit') {
    row('Price', money(b.price)); row('Own 1', money(25)); row('Own both', money(60)); row('Mortgage', money(mortValue(b)), 'small');
  } else if (b.kind === 'tool') {
    row('Price', money(b.price)); row('Rent', 'dice x 6'); row('Mortgage', money(mortValue(b)), 'small');
  } else {
    const say = { start: 'Collect B150 each time you pass or land here.', woods: 'Just visiting. Sent here? Roll a double, pay B50 or use a trail map. After 3 misses you pay and walk.', picnic: 'A rest. Nothing happens here.', wrong: 'Oops! Go straight to Lost in the Woods. No B150.', lucky: 'Draw a Lucky Find card.', notice: 'Draw a Town Notice card.', tax: 'Pay B100 to the Dog Treat Fund.' };
    body.append(el('p', 'tt-csay', say[b.kind] || ''));
  }
  card.append(body);
  if (isProp(b)) {
    const foot = el('div', 'tt-cfoot');
    if (o >= 0) { const d = el('i', 'tg-dot'); d.style.setProperty('--seat', seatInfo(T, o).color); foot.append(d, el('span', '', who(T, o, me) + (v.mort[i] ? ' (mortgaged)' : '') + (v.lvl[i] ? ` - ${v.lvl[i] >= 5 ? 'shop' : v.lvl[i] + ' cottage' + (v.lvl[i] > 1 ? 's' : '')}` : ''))); }
    else foot.append(el('span', '', 'For sale'));
    card.append(foot);
  }
  return card;
}

// ---------------------------------------------------------------- the board
function renderBoard(board, s) {
  const { T, v, me, ui } = s;
  board.textContent = '';
  if (!v || !v.board) return;
  const a = animOf(board);
  if (!a.ro && typeof ResizeObserver === 'function') { a.ro = new ResizeObserver(() => { const k = board.clientWidth + 'x' + board.clientHeight; if (k !== a.size) { a.size = k; a.rerender?.(); } }); a.ro.observe(board); }
  const P = board.parentElement, W = board.clientWidth || (P && P.clientWidth) || 600, H = board.clientHeight || (P && P.clientHeight) || 300;
  a.size = board.clientWidth + 'x' + board.clientHeight; a.rerender = s.rerender;
  const R = ringOf(W, H);
  if (a.table !== T.id) { a.table = T.id; a.shown = []; a.target = []; }
  a.R = R;
  const wrap = el('div', 'tt-wrap');
  const small = Math.min(R.cw, R.ch) < 46, fs = Math.max(9, Math.min(13, Math.min(R.cw / 6, R.ch / 3.6)));
  wrap.style.setProperty('--fs', fs + 'px');
  // the middle
  const mid = el('div', 'tt-mid');
  Object.assign(mid.style, { left: R.cw + 'px', top: R.ch + 'px', width: (W - 2 * R.cw) + 'px', height: (H - 2 * R.ch) + 'px' });
  mid.innerHTML = TOWN;
  const logo = el('div', 'tt-logo', '', { 'aria-hidden': 'true' }); logo.append(el('b', '', 'TOWN'), el('b', '', 'TYCOON'));
  mid.append(logo);
  const dice = el('div', 'tt-dice', '', { 'aria-label': v.dice ? `Dice: ${v.dice[0]} and ${v.dice[1]}` : 'Dice' });
  const dk = v.dice ? v.dice.join('-') + ':' + v.turn + ':' + (v.round || 0) : '';
  const fresh = dk && ui.diceKey !== dk; ui.diceKey = dk;
  for (const n of v.dice || [3, 4]) dice.append(dieEl(n, (v.dice ? '' : 'idle') + (fresh ? ' fresh' : '')));
  mid.append(dice);
  // a card just drawn shows a few seconds; a picked space's card stays until closed
  const lastKey = v.last ? v.last.text + ':' + v.last.seat + ':' + v.decks.lucky + ':' + v.decks.notice : '';
  if (ui.lastKey === undefined) ui.lastKey = lastKey; // (a card from before the overlay opened is not news)
  else if (lastKey && ui.lastKey !== lastKey) { ui.lastKey = lastKey; ui.cardAt = Date.now(); setTimeout(() => s.rerender(), 5200); }
  const autoBuy = v.stage === 'buy' && v.turn === me && me !== null && ui.closedBuy !== v.buyAt + ':' + v.round ? v.buyAt : null;
  const drawnFresh = v.last && ui.cardAt && Date.now() - ui.cardAt < 5000;
  const pick = ui.sel != null ? ui.sel : drawnFresh ? null : autoBuy;
  if (pick != null && v.board[pick]) {
    mid.append(spaceCard(T, v, pick, me, () => { if (ui.sel != null) ui.sel = null; else ui.closedBuy = v.buyAt + ':' + v.round; s.rerender(); }));
    mid.classList.add('carded');
  } else if (drawnFresh) {
    const c = el('div', 'tt-drawn ' + v.last.deck), art = el('span', 'tt-cart'); art.innerHTML = `<svg viewBox="0 0 40 40">${ART[v.last.deck]}</svg>`;
    c.append(art, el('b', '', v.last.deck === 'lucky' ? 'Lucky Find' : 'Town Notice'), el('p', '', v.last.text));
    mid.append(c); mid.classList.add('carded');
  }
  wrap.append(mid);
  // the tiles
  R.cells.forEach((c, i) => {
    const b = v.board[i], o = v.owner[i], lvl = v.lvl[i];
    const corner = i % 7 === 0;
    const t = el('button', 'tt-tile ' + b.kind + ' ' + c.side + (corner ? ' corner' : '') + (v.mort[i] ? ' mort' : '') + (ui.sel === i ? ' sel' : '') + (v.buyAt === i ? ' buyat' : ''), '', { type: 'button', 'data-space': i });
    Object.assign(t.style, { left: c.x + 'px', top: c.y + 'px', width: R.cw + 'px', height: R.ch + 'px' });
    let label = b.name;
    if (isProp(b)) label += `, ${money(b.price)}` + (o >= 0 ? `, owned by ${who(T, o, me)}` : ', for sale') + (lvl ? `, ${lvl >= 5 ? 'a shop' : lvl + ' cottages'}` : '') + (v.mort[i] ? ', mortgaged' : '');
    t.setAttribute('aria-label', label);
    if (b.kind === 'street') {
      const band = el('span', 'tt-band'); band.style.background = v.groups[b.group].color;
      if (lvl >= 5) band.append(el('i', 'tt-shop'));
      else for (let k = 0; k < lvl; k++) band.append(el('i', 'tt-cot'));
      t.append(band);
    } else {
      const art = el('span', 'tt-art'); art.innerHTML = `<svg viewBox="0 0 40 40">${artFor(b)}</svg>`; t.append(art);
    }
    const nm = small || R.cw < 70 ? TINY[i] || b.short : b.short;
    if (!(corner && small && R.ch < 40)) { const ne = el('span', 'tt-name', nm); ne.style.fontSize = fitFont(nm, R.cw - 6, fs) + 'px'; t.append(ne); }
    if (isProp(b) && R.ch >= 46) t.append(el('span', 'tt-price', money(b.price)));
    if (o >= 0) { const m = el('span', 'tt-own'); m.style.setProperty('--seat', seatInfo(T, o).color); t.append(m); }
    t.onclick = e => { e.stopPropagation(); ui.sel = ui.sel === i ? null : i; s.rerender(); };
    wrap.append(t);
  });
  // the pawns (each seat's shown space walks to the real one)
  for (let k = 0; k < v.n; k++) {
    if (!v.alive[k]) continue;
    if (a.shown[k] === undefined) { a.shown[k] = v.pos[k]; a.target[k] = v.pos[k]; }
    const p = tokXY(R, a.shown[k], k), info = seatInfo(T, k);
    const tok = el('span', 'tt-tok' + (k === v.turn ? ' turn' : '') + (k === me ? ' me' : ''), '', { 'data-seat': k, title: who(T, k, me) });
    Object.assign(tok.style, { left: p.x + 'px', top: p.y + 'px', width: p.d + 'px', height: p.d + 'px' });
    tok.style.setProperty('--seat', info.color);
    wrap.append(tok);
  }
  board.append(wrap);
  for (let k = 0; k < v.n; k++) if (v.alive[k]) walk(board, a, k, v.pos[k], R);
}

// ---------------------------------------------------------------- your hand: cash and deeds by colour
function renderHand(hand, s) {
  const { T, v, me, ui } = s;
  hand.textContent = '';
  if (!v || me === null || me === undefined) return;
  const box = el('div', 'tt-hand');
  const cash = el('div', 'tt-cash' + (v.debt && v.turn === me ? ' owe' : ''));
  cash.append(el('small', '', v.alive[me] ? 'Your cash' : 'Bankrupt'), el('b', '', money(v.cash[me])));
  if (v.debt && v.turn === me) cash.append(el('small', 'tt-owe', 'Owe ' + money(v.debt.amount)));
  else if (v.woods[me] >= 0) cash.append(el('small', 'tt-owe', 'In the woods'));
  else if (v.maps[me]) cash.append(el('small', '', 'Trail map x' + v.maps[me]));
  box.append(cash);
  const mine = v.board.filter(b => isProp(b) && v.owner[b.i] === me);
  const deeds = el('div', 'tt-deeds');
  if (!mine.length) deeds.append(el('p', 'tt-none', 'No deeds yet. Land on a space for sale and Buy it.'));
  else if (v.debt && v.turn === me && ui.sel == null) deeds.append(el('p', 'tt-none tt-hint', 'Tap a deed, then Sell or Mortgage'));
  // grouped: colour pairs in board order, then transit and the tool crib
  const groups = [];
  for (const b of mine) { const k = b.kind === 'street' ? 'g' + b.group : 'other'; let g = groups.find(x => x.k === k); if (!g) groups.push(g = { k, list: [] }); g.list.push(b); }
  groups.sort((x, y) => (x.k === 'other') - (y.k === 'other'));
  const Wd = (hand.clientWidth || 360) - 110, Hd = hand.clientHeight || 90;
  const n = mine.length || 1, dw = Math.max(26, Math.min(52, (Wd - groups.length * 8) / n)), dh = Math.max(34, Math.min(Hd - 14, dw * 1.4));
  for (const g of groups) {
    const gr = el('div', 'tt-dgroup');
    for (const b of g.list) {
      const i = b.i, l = v.lvl[i];
      const d = el('button', 'tt-deed' + (ui.sel === i ? ' sel' : '') + (v.mort[i] ? ' mort' : ''), '', { type: 'button', 'aria-label': `${b.name}${l ? (l >= 5 ? ', a shop' : `, ${l} cottages`) : ''}${v.mort[i] ? ', mortgaged' : ''}`, 'aria-pressed': ui.sel === i ? 'true' : 'false' });
      Object.assign(d.style, { width: dw + 'px', height: dh + 'px' });
      const band = el('span', 'tt-dband');
      if (b.kind === 'street') band.style.background = v.groups[b.group].color;
      else { band.classList.add('art'); band.innerHTML = `<svg viewBox="0 0 40 40">${artFor(b)}</svg>`; }
      d.append(band);
      if (dw >= 30) { const dn = TINY[i] || b.short, ne = el('span', 'tt-dname', dn); ne.style.fontSize = fitFont(dn, dw - 6, 11) + 'px'; d.append(ne); }
      const lv = el('span', 'tt-dlvl');
      if (l >= 5) lv.append(el('i', 'tt-shop')); else for (let k = 0; k < l; k++) lv.append(el('i', 'tt-cot'));
      d.append(lv);
      d.onclick = e => { e.stopPropagation(); ui.sel = ui.sel === i ? null : i; s.rerender(); };
      gr.append(d);
    }
    deeds.append(gr);
  }
  box.append(deeds);
  hand.append(box);
}

// ---------------------------------------------------------------- the buttons
function buttons(s) {
  const { v, moves, me, ui } = s, out = [];
  if (!v || me === null) return out;
  const has = t => moves.find(m => m.type === t), on = (t, i) => moves.find(m => m.type === t && m.space === i);
  if (has('roll')) out.push({ id: 'roll', icon: ICON.roll, label: v.stage === 'woods' ? 'Roll for a double' : 'Roll the dice', word: 'Roll', key: 'R', move: has('roll'), hot: true });
  if (has('buy')) { const b = v.board[v.buyAt]; out.push({ id: 'buy', icon: ICON.buy, label: `Buy ${b.name} for ${money(b.price)}`, word: 'Buy ' + money(b.price), key: 'B', move: has('buy'), hot: true }); }
  if (has('skip')) out.push({ id: 'skip', icon: ICON.skip, label: 'Do not buy it', word: 'Skip', key: 'S', move: has('skip') });
  if (has('pay')) out.push({ id: 'pay', icon: ICON.pay, label: 'Pay B50 to walk out of the woods', word: 'B50', move: has('pay') });
  if (has('map')) out.push({ id: 'map', icon: ICON.map, label: 'Use your trail map to walk out', move: has('map') });
  // the selected deed's actions (only your own deed; greyed when that move is not open)
  const sel = ui.sel, b = sel != null ? v.board[sel] : null;
  if (b && isProp(b) && v.owner[sel] === me && v.turn === me && v.phase === 'play' && v.stage !== 'buy') {
    const opt = (type, icon, word, label) => { const m = on(type, sel); out.push({ id: type, icon, label: m ? label : label + ' (not now)', move: m, hot: !!m && v.stage === 'debt', disabled: !m, run: m ? undefined : () => s.toast(whyNot(v, type, sel)) }); void word; };
    if (b.kind === 'street' && v.stage !== 'debt') opt('build', ICON.build, 'Build', `Build ${v.lvl[sel] >= 4 ? 'a shop' : 'a cottage'} on ${b.name} (${money(v.groups[b.group].build)})`);
    if (b.kind === 'street' && v.lvl[sel] > 0) opt('sell', ICON.sell, 'Sell', `Sell a building on ${b.name} for ${money(v.groups[b.group].build / 2)}`);
    if (!v.mort[sel]) opt('mortgage', ICON.mortgage, 'Mortgage', `Mortgage ${b.name} for ${money(mortValue(b))}`);
    else if (v.stage !== 'debt') opt('unmortgage', ICON.unmortgage, 'Unmortgage', `Pay ${money(unmortCost(b))} to lift the mortgage on ${b.name}`);
  }
  if (has('end')) out.push({ id: 'end', icon: ICON.end, label: 'End your turn', word: 'End', key: 'E', move: has('end'), hot: !has('build') });
  return out;
}
function whyNot(v, type, i) {
  const b = v.board[i];
  if (type === 'build') {
    if (groupOwner(v, b.group) !== v.seat) return 'Own the whole colour pair to build.';
    if (v.lvl[i] >= 5) return 'It already has a shop.';
    if (v.board.some(x => x.kind === 'street' && x.group === b.group && v.mort[x.i])) return 'Lift the mortgage on the pair first.';
    if (v.cash[v.seat] < v.groups[b.group].build) return 'Not enough cash.';
    if (v.stage === 'roll' || v.stage === 'manage' || v.stage === 'woods') return 'Build evenly: the other street of the pair first.';
    return 'Not now.';
  }
  if (type === 'sell') return 'Sell evenly: the other street of the pair first.';
  if (type === 'mortgage') return 'Sell the buildings on this pair first.';
  if (type === 'unmortgage') return `Lifting it costs ${money(unmortCost(b))}.`;
  return 'Not now.';
}

// ---------------------------------------------------------------- the words for each beat
function describe(T, v, b, me) {
  const w = k => who(T, k, me), nm = i => spaceName(v, i);
  switch (b.kind) {
    case 'start': return 'The game is on! Everyone starts at Town Square.';
    case 'roll': return `${w(b.seat)} ${verb(b.seat, me, 'roll', 'rolls')} ${b.dice[0]} and ${b.dice[1]}${b.doubles ? (b.woods ? ' - a double!' : b.count >= 3 ? ' - three doubles!' : ' - doubles, roll again!') : ''}.`;
    case 'move': return b.passedStart ? `${w(b.seat)} ${verb(b.seat, me, 'pass', 'passes')} Town Square: +B150.` : b.steps < 0 ? `${w(b.seat)} ${verb(b.seat, me, 'go', 'goes')} back to ${nm(b.to)}.` : `${w(b.seat)} ${verb(b.seat, me, 'land', 'lands')} on ${nm(b.to)}.`;
    case 'buy': return `${w(b.seat)} ${verb(b.seat, me, 'buy', 'buys')} ${nm(b.space)} for ${money(b.price)}.`;
    case 'skip': return b.short ? `${w(b.seat)} can't afford ${nm(b.space)}.` : `${w(b.seat)} ${verb(b.seat, me, 'pass', 'passes')} on ${nm(b.space)}.`;
    case 'rent': return `${w(b.seat)} landed on ${nm(b.space)} and paid ${w(b.owner)} ${money(b.amount)}.`;
    case 'card': return `${b.deck === 'lucky' ? 'Lucky Find' : 'Town Notice'}: ${b.text}`;
    case 'tax': return `${w(b.seat)} ${verb(b.seat, me, 'give', 'gives')} ${money(b.amount)} to the Dog Treat Fund.`;
    case 'pay': return `${w(b.seat)} paid ${money(b.amount)}.`;
    case 'build': return `${w(b.seat)} ${verb(b.seat, me, 'build', 'builds')} ${levelWord(b.level)} on ${nm(b.space)}.`;
    case 'sell': return `${w(b.seat)} ${verb(b.seat, me, 'sell', 'sells')} a building on ${nm(b.space)} for ${money(b.amount)}.`;
    case 'mortgage': return `${w(b.seat)} ${verb(b.seat, me, 'mortgage', 'mortgages')} ${nm(b.space)} for ${money(b.amount)}.`;
    case 'unmortgage': return `${w(b.seat)} ${verb(b.seat, me, 'lift', 'lifts')} the mortgage on ${nm(b.space)}.`;
    case 'woods':
      if (b.sent) return `${w(b.seat)} ${verb(b.seat, me, 'are', 'is')} Lost in the Woods!${b.why === 'doubles' ? ' (three doubles)' : b.why === 'wrong' ? ' (a wrong turn)' : ''}`;
      return `${w(b.seat)} ${verb(b.seat, me, 'walk', 'walks')} out of the woods${b.how === 'pay' ? ' for B50' : b.how === 'map' ? ' with a trail map' : b.how === 'doubles' ? ' on a double' : ' after paying B50'}.`;
    case 'owe': return `${w(b.seat)} ${verb(b.seat, me, 'owe', 'owes')} ${money(b.amount)}: sell or mortgage to pay.`;
    case 'bankrupt': return `${w(b.seat)} ${verb(b.seat, me, 'are', 'is')} bankrupt! Everything goes to ${b.to >= 0 ? w(b.to) : 'the bank'}.`;
    case 'gameOver': return 'Game over! Count up the net worth.';
    default: return null;
  }
}

// ---------------------------------------------------------------- sounds and eyecatches
function moments(b, c) {
  const { play, eye, me, T } = c;
  switch (b.kind) {
    case 'start': case 'deal': play('tg-deal'); break;
    case 'turn': if (me != null && b.seat === me) { if (eye) eye.turn(() => play('tg-yourturn')); else play('tg-yourturn'); } break;
    case 'roll': play('tg-draw'); break;
    case 'move': if (b.steps > 0 && b.steps <= 12) for (let k = 0; k < b.steps; k++) play('tg-tile', 120 + k * 170); else play('tg-tile', 100); if (b.passedStart) play('tg-tally', 120 + Math.max(0, b.steps) * 170); break;
    case 'buy': play('tg-stamp', 150); if (eye) eye.stamp('Sold!', `${who(T, b.seat, me)} ${verb(b.seat, me, 'buy', 'buys')} ${spaceName(T.view, b.space)}`, { color: '#4fa45a', sound: () => play('tg-stamp') }); break;
    case 'rent': case 'tax': case 'pay': case 'sell': case 'mortgage': play('tg-tally', 200); break;
    case 'build': play('tg-lift'); break;
    case 'card': play('tg-ring', 150); break;
    case 'woods': if (b.sent) { if (eye) eye.stamp('Lost in the Woods!', b.seat === me ? 'Roll a double, pay B50 or use a map' : who(T, b.seat, me) + ' took a wrong path', { color: '#2f6b4f', sound: () => play('tg-stamp') }); else play('tg-back'); } else play('tg-answer'); break;
    case 'bankrupt': if (eye) eye.stamp('Bankrupt!', who(T, b.seat, me) + (b.seat === me ? ' are out' : ' is out'), { color: '#e0463c', sound: () => play('tg-stamp') }); else play('tg-back'); break;
    default: break;
  }
}

// ---------------------------------------------------------------- the end: net worth, richest first
function overPanel(T, res, me) {
  const box = el('div', 'tg-round over tt-over');
  const v = T.view || {}, totals = (res && res.totals) || v.worth || [], win = (res && res.winners) || [];
  const names = win.map(k => who(T, k, me));
  const rib = el('div', 'tg-ribbon gold', '', { 'aria-hidden': 'true' }); rib.append(el('b', '', 'Town Tycoon'));
  box.append(rib, el('div', 'tg-h', names.length ? `${names.join(' and ')} ${names.length > 1 || names[0] === 'You' ? 'win' : 'wins'}!` : 'Game over'),
    el('p', 'tg-sub', (v.alive || []).filter(Boolean).length === 1 ? 'Last one standing.' : 'Richest by net worth: cash + deeds + buildings (mortgaged deeds at half).'));
  const order = totals.map((x, k) => k).sort((a, b) => (v.alive && v.alive[b] - v.alive[a]) || totals[b] - totals[a]);
  const list = el('div', 'tg-count tt-worth');
  const hdr = el('div', 'tt-wrow tt-whead'); hdr.append(el('span', '', ''), el('span', '', 'Cash'), el('span', '', 'Deeds'), el('b', '', 'Worth')); list.append(hdr);
  for (const k of order) {
    const sI = seatInfo(T, k), row = el('div', 'tg-crow on tt-wrow' + (win.includes(k) ? ' win' : ''));
    row.style.setProperty('--seat', sI.color);
    const nm = el('span', 'tt-wname'); nm.append(el('i', 'tg-dot'), el('span', 'tt-wn', who(T, k, me)));
    const out = v.alive && !v.alive[k];
    const cash = v.cash ? v.cash[k] : 0;
    row.append(nm, el('span', '', out ? '-' : money(cash)), el('span', '', out ? 'Bankrupt' : money(totals[k] - cash)), el('b', 'tg-ctot', out ? '0' : money(totals[k])));
    list.append(row);
  }
  box.append(list, el('p', 'tg-note', res && res.counted ? 'On the store window leaderboard.' : 'A bot played, so this one is just for fun (not on the leaderboard).'));
  let done = false;
  box.onShow = () => { if (done) return; done = true; rib.classList.add('in'); LOOK.eye?.confetti(); LOOK.sound?.(me != null && win.includes(me) ? 'tg-fanfare' : 'tg-cheer'); };
  return box;
}

// ---------------------------------------------------------------- the rules card
function rulesCard() {
  const c = el('div', 'tg-rules tt-rules');
  c.append(el('div', 'tg-h', 'Town Tycoon'));
  const row = (pic, text) => { const r = el('div', 'tg-rrow'); const p = el('div', 'tg-rpic'); p.innerHTML = pic; r.append(p, el('p', '', text)); c.append(r); };
  const art = k => `<svg viewBox="0 0 40 40" width="40" height="40">${ART[k]}</svg>`;
  const ic = k => `<span class="tg-ico">${ICON[k]}</span>`;
  const band = col => `<svg viewBox="0 0 40 40" width="40" height="40"><rect x="5" y="5" width="30" height="30" rx="4" fill="#fff8ec" stroke="${INK}" stroke-width="2.5"/><rect x="5" y="5" width="30" height="10" rx="3" fill="${col}" stroke="${INK}" stroke-width="2.5"/><rect x="11" y="7" width="6" height="6" fill="#7ddc7a" stroke="${INK}" stroke-width="1.5"/><rect x="21" y="7" width="6" height="6" fill="#7ddc7a" stroke="${INK}" stroke-width="1.5"/></svg>`;
  row(ic('roll') + art('start'), 'Roll two dice and walk round the town. Pass Town Square: collect B150. Doubles roll again, but three doubles in a turn and you are Lost in the Woods.');
  row(ic('buy') + ic('skip'), 'Land on a street, bus or van stop, or the Tool Crib that nobody owns: Buy it or Skip it. (No auctions in this version.)');
  row(band('#ff8fb8'), 'Land on someone\'s space: pay rent. Own a whole colour pair and rent doubles, and you may build cottages (1 to 4, then a Shop), evenly across the pair.');
  row(art('lucky') + art('notice'), 'Lucky Find and Town Notice spaces: draw a card and do what it says.');
  row(art('woods'), 'Lost in the Woods: roll a double to walk out, pay B50, or use a trail map. After 3 misses you pay B50 and walk.');
  row(ic('mortgage') + ic('sell'), 'Short of cash? Tap a deed in your hand to sell buildings (half back) or mortgage it (no rent while mortgaged). Cannot pay at all: bankrupt, you are out.');
  row(ic('end'), 'Quick game: 15 rounds, richest wins (cash + deeds + buildings). Full game: last one standing. No trades between players in this version.');
  return c;
}

const ui = {
  id: 'town-tycoon',
  lid: 'property for 2 to 4',
  tip: 'Roll, buy streets, build cottages. Tap any space to see its card.',
  render(board, hand, s) { renderBoard(board, s); renderHand(hand, s); },
  buttons,
  chip(T, v, k) {
    if (!v || !v.cash) return null;
    const extra = [];
    if (v.alive && !v.alive[k]) { extra.push(el('span', 'tt-chipout', 'out')); return { extra }; }
    if (v.woods && v.woods[k] >= 0) { const w = el('span', 'tt-chipwoods', '', { title: 'Lost in the Woods' }); w.innerHTML = `<svg viewBox="0 0 40 40" aria-hidden="true">${ART.woods}</svg>`; extra.push(w); }
    return { score: money(v.cash[k]), extra };
  },
  pill(T, v) { return v && v.round ? (v.settings && v.settings.length === 'full' ? `Round ${v.round}` : `Round ${v.round}/${v.rounds}`) : null; },
  describe,
  moments,
  overPanel,
  rulesCard,
  setupLine(settings, n) {
    const full = settings && settings.length === 'full', cash = settings && settings.start === '1000' ? 'B1000' : 'B1500';
    return `${full ? 'Last one standing (60 rounds at most)' : '15 rounds, richest wins'}. ${cash} each for ${Math.max(2, n)} players.`;
  },
  onKey(code, s) {
    const m = t => (s.moves || []).find(x => x.type === t);
    const go = t => { const x = m(t); if (x) { s.send(x); return true; } return false; };
    if (code === 'KeyR' || code === 'Space') return go('roll') || (code === 'Space' && go('end'));
    if (code === 'KeyB') return go('buy');
    if (code === 'KeyS') return go('skip');
    if (code === 'KeyE' || code === 'Enter') return go('end') || go('roll');
    if (code === 'Escape' && s.ui && s.ui.sel != null) { s.ui.sel = null; s.rerender(); return true; }
    return false;
  },
  css: `
.tg-town-tycoon .tg-boardwrap { background: #e9dcc0; }
.tg-town-tycoon .tt-wrap { position: absolute; inset: 0; --fs: 11px; }
.tg-town-tycoon .tt-mid { position: absolute; overflow: hidden; border: 2.5px solid #2b2340; border-radius: 6px; box-sizing: border-box; }
.tg-town-tycoon .tt-town { position: absolute; inset: 0; width: 100%; height: 100%; }
.tg-town-tycoon .tt-logo { position: absolute; left: 50%; top: 8%; transform: translateX(-50%) rotate(-4deg); display: flex; flex-direction: column; align-items: center; line-height: 0.95; padding: 4px 12px; background: #ffd34d; border: 3px solid #2b2340; border-radius: 12px; box-shadow: 0 4px 0 rgba(43,35,64,.85); }
.tg-town-tycoon .tt-logo b { font-size: clamp(13px, 4.2vmin, 26px); letter-spacing: 1px; color: #2b2340; }
.tg-town-tycoon .tt-dice { position: absolute; left: 50%; bottom: 9%; transform: translateX(-50%); display: flex; gap: 8px; }
.tg-town-tycoon .tt-die { display: block; width: clamp(26px, 7vmin, 44px); height: clamp(26px, 7vmin, 44px); filter: drop-shadow(0 3px 0 rgba(43,35,64,.75)); }
.tg-town-tycoon .tt-die svg { width: 100%; height: 100%; }
.tg-town-tycoon .tt-die.idle { opacity: .6; }
.tg-town-tycoon .tt-die.fresh { animation: tt-roll .55s cubic-bezier(.3,1.4,.5,1); }
.tg-town-tycoon .tt-die.fresh + .tt-die.fresh { animation-delay: .06s; }
@keyframes tt-roll { 0% { transform: translateY(-30px) rotate(-200deg) scale(.7); opacity: .3; } 70% { transform: translateY(3px) rotate(10deg); opacity: 1; } 100% { transform: none; } }
.tg-town-tycoon .tt-mid.carded .tt-logo { display: none; }
.tg-town-tycoon .tt-mid.carded .tt-dice { left: auto; right: 6px; bottom: 6px; transform: none; gap: 4px; }
.tg-town-tycoon .tt-mid.carded .tt-die { width: 26px; height: 26px; }
.tg-town-tycoon .tt-card, .tg-town-tycoon .tt-drawn { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(92%, 250px); max-height: 94%; overflow: auto; background: #fff8ec; border: 3px solid #2b2340; border-radius: 10px; box-shadow: 0 4px 0 rgba(43,35,64,.85); box-sizing: border-box; animation: tg-pop .3s cubic-bezier(.3,1.6,.5,1); }
.tg-town-tycoon .tt-chead { position: sticky; top: 0; display: flex; align-items: center; gap: 6px; padding: 4px 30px 4px 8px; min-height: 26px; background: #f3e3c3; border-bottom: 2.5px solid #2b2340; font-size: 15px; z-index: 1; }
.tg-town-tycoon .tt-chead b { flex: 1; text-align: center; }
.tg-town-tycoon .tt-cart { flex: 0 0 auto; width: 26px; height: 26px; display: block; }
.tg-town-tycoon .tt-cart svg { width: 100%; height: 100%; }
.tg-town-tycoon .tt-cx { position: absolute; right: 3px; top: 50%; transform: translateY(-50%); width: 26px; height: 26px; padding: 2px; border-radius: 50%; border: 2px solid #2b2340; background: #fff8ec; }
.tg-town-tycoon .tt-cx svg { width: 100%; height: 100%; display: block; }
.tg-town-tycoon .tt-cbody { padding: 3px 9px; display: grid; grid-template-columns: 1fr 1fr; column-gap: 12px; }
.tg-town-tycoon .tt-crow { display: flex; justify-content: space-between; gap: 6px; font-size: 13px; line-height: 1.45; border-bottom: 1px dashed #d9cdb4; }
.tg-town-tycoon .tt-crow.on { background: #fff1b8; font-weight: 700; border-radius: 4px; }
.tg-town-tycoon .tt-crow.small { color: #6b5e52; }
.tg-town-tycoon .tt-csay { grid-column: 1 / -1; margin: 4px 0; font-size: 13px; text-align: center; }
.tg-town-tycoon .tt-cfoot { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 3px 8px 5px; font-size: 13px; font-weight: 600; }
.tg-town-tycoon .tt-drawn { padding: 6px 10px 8px; text-align: center; }
.tg-town-tycoon .tt-drawn.lucky { background: #fff1b8; }
.tg-town-tycoon .tt-drawn .tt-cart { margin: 0 auto; width: 30px; height: 30px; }
.tg-town-tycoon .tt-drawn b { display: block; font-size: 15px; }
.tg-town-tycoon .tt-drawn p { margin: 3px 0 0; font-size: 14px; font-weight: 600; }
.tg-town-tycoon .tt-tile { position: absolute; box-sizing: border-box; padding: 0; margin: 0; border: 2px solid #2b2340; background: #fff8ec; color: #2b2340; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; overflow: hidden; font-size: var(--fs); line-height: 1.05; font-weight: 600; }
.tg-town-tycoon .tt-tile.corner { background: #fff1b8; }
.tg-town-tycoon .tt-tile.start { background: #ffe08a; }
.tg-town-tycoon .tt-tile.woods { background: #cfe8c2; }
.tg-town-tycoon .tt-tile.wrong { background: #ffd0c4; }
.tg-town-tycoon .tt-tile.picnic { background: #e6f2ff; }
.tg-town-tycoon .tt-tile.mort { background: repeating-linear-gradient(45deg, #e6dccb 0 5px, #d4c8b3 5px 10px); }
.tg-town-tycoon .tt-tile.mort .tt-name { opacity: .55; }
.tg-town-tycoon .tt-tile.sel { box-shadow: inset 0 0 0 3px #ffd34d; z-index: 2; }
.tg-town-tycoon .tt-tile.buyat { animation: tg-breathe 1s ease-in-out infinite; box-shadow: inset 0 0 0 3px #7ddc7a; }
.tg-town-tycoon .tt-band { flex: 0 0 auto; align-self: stretch; height: 24%; min-height: 8px; border-bottom: 2px solid #2b2340; display: flex; align-items: center; justify-content: center; gap: 1px; }
.tg-town-tycoon .tt-cot { display: block; width: 22%; max-width: 9px; height: 70%; max-height: 9px; background: #7ddc7a; border: 1.5px solid #2b2340; border-radius: 1px; box-sizing: border-box; }
.tg-town-tycoon .tt-shop { display: block; width: 50%; max-width: 20px; height: 80%; max-height: 10px; background: #e0463c; border: 1.5px solid #2b2340; border-radius: 2px; box-sizing: border-box; }
.tg-town-tycoon .tt-art { flex: 0 0 auto; display: block; height: 40%; max-height: 34px; aspect-ratio: 1; margin-top: 2px; }
.tg-town-tycoon .tt-tile.corner .tt-art { height: 48%; max-height: 46px; }
.tg-town-tycoon .tt-art svg { width: 100%; height: 100%; display: block; }
.tg-town-tycoon .tt-name { display: block; padding: 1px 2px 0; text-align: center; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: normal; }
.tg-town-tycoon .tt-price { margin-top: auto; padding-bottom: 5px; font-size: calc(var(--fs) * 0.92); font-weight: 700; color: #6e4224; }
.tg-town-tycoon .tt-own { position: absolute; right: 2px; bottom: 2px; width: 30%; max-width: 14px; aspect-ratio: 1; border-radius: 50%; background: var(--seat); border: 2px solid #2b2340; box-sizing: border-box; }
.tg-town-tycoon .tt-tile.mort .tt-own { opacity: .5; }
.tg-town-tycoon .tt-tok { position: absolute; z-index: 3; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff8 0 18%, transparent 20%), var(--seat); border: 2.5px solid #2b2340; box-sizing: border-box; box-shadow: 0 3px 0 rgba(43,35,64,.8); transition: left .15s ease-out, top .15s ease-out; pointer-events: none; }
.tg-town-tycoon .tt-tok.turn { box-shadow: 0 0 0 3px #fff8ec, 0 3px 0 4px rgba(43,35,64,.6); z-index: 4; }
.tg-town-tycoon .tt-hand { position: absolute; inset: 4px 6px; display: flex; align-items: center; gap: 8px; }
.tg-town-tycoon .tt-cash { flex: 0 0 auto; min-width: 88px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4px 8px; border-radius: 12px; background: #2f6b4f; color: #fff8ec; border: 2.5px solid #2b2340; line-height: 1.1; }
.tg-town-tycoon .tt-cash b { font-size: 22px; color: #ffd34d; }
.tg-town-tycoon .tt-cash small { font-size: 11px; font-weight: 600; }
.tg-town-tycoon .tt-cash.owe { background: #e0463c; }
.tg-town-tycoon .tt-cash .tt-owe { color: #fff1b8; }
.tg-town-tycoon .tt-deeds { flex: 1; min-width: 0; height: 100%; display: flex; align-items: center; gap: 8px; overflow-x: auto; overflow-y: hidden; padding: 6px 2px 2px; }
.tg-town-tycoon .tt-none { margin: 0; font-size: 14px; font-weight: 600; }
.tg-town-tycoon .tt-dgroup { flex: 0 0 auto; display: flex; gap: 3px; }
.tg-town-tycoon .tt-deed { position: relative; flex: 0 0 auto; padding: 0; display: flex; flex-direction: column; align-items: center; border: 2px solid #2b2340; border-radius: 6px; background: #fff8ec; overflow: hidden; box-shadow: 0 2px 0 rgba(43,35,64,.8); transition: transform .12s; color: #2b2340; }
.tg-town-tycoon .tt-deed.sel { transform: translateY(-5px); box-shadow: 0 0 0 3px #ffd34d, 0 3px 0 rgba(43,35,64,.8); }
.tg-town-tycoon .tt-deed.mort { background: repeating-linear-gradient(45deg, #e6dccb 0 5px, #d4c8b3 5px 10px); }
.tg-town-tycoon .tt-dband { align-self: stretch; height: 26%; min-height: 9px; border-bottom: 2px solid #2b2340; }
.tg-town-tycoon .tt-dband.art { height: 42%; background: #f3e3c3; display: flex; justify-content: center; }
.tg-town-tycoon .tt-dband.art svg { height: 100%; }
.tg-town-tycoon .tt-dname { font-size: 10px; font-weight: 600; line-height: 1.05; padding: 1px 1px 0; text-align: center; }
.tg-town-tycoon .tt-dlvl { margin-top: auto; padding-bottom: 3px; display: flex; gap: 1px; height: 9px; }
.tg-town-tycoon .tt-dlvl .tt-cot { width: 7px; height: 8px; }
.tg-town-tycoon .tt-dlvl .tt-shop { width: 16px; height: 9px; }
.tg-town-tycoon .tt-chipout { font-size: 11px; font-weight: 700; color: #e0463c; }
.tg-town-tycoon .tt-chipwoods { display: inline-block; width: 18px; height: 18px; }
.tg-town-tycoon .tt-chipwoods svg { width: 100%; height: 100%; }
.tg-town-tycoon .tt-hint { flex: 0 0 auto; max-width: 9rem; font-size: 13px; color: #e0463c; }
.tg-town-tycoon .tg-acts { gap: 6px; }
.tg-town-tycoon .tg-act { width: 46px; height: 46px; }
.tg-town-tycoon .tg-act .tg-ico { width: 26px; height: 26px; }
.tg-town-tycoon .tg-act:has(.tg-act-word) { height: 46px; font-size: 15px; padding: 0 11px 0 7px; }
.tg-town-tycoon.portrait .tg-act, .tg-town-tycoon[data-form="phone"] .tg-act { width: 42px; height: 42px; }
.tg-town-tycoon.portrait .tg-act:has(.tg-act-word), .tg-town-tycoon[data-form="phone"] .tg-act:has(.tg-act-word) { width: auto; height: 42px; font-size: 14px; }
.tg-town-tycoon .tg-act:has(.tg-act-word) { width: auto; min-width: 52px; padding: 0 12px 0 8px; border-radius: 26px; display: inline-flex; gap: 5px; font-size: 15px; font-weight: 700; color: #2b2340; white-space: nowrap; }
.tg-town-tycoon .tg-act:has(.tg-act-word) .tg-ico { width: 26px; height: 26px; }
.tg-town-tycoon .tt-worth .tt-wrow { display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; align-items: center; gap: 6px; }
.tg-town-tycoon .tt-whead { font-size: 12px; font-weight: 700; color: #6b5e52; padding: 0 10px; }
.tg-town-tycoon .tt-wname { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
.tg-town-tycoon .tt-wn { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tg-town-tycoon .tt-rules .tg-rpic { display: flex; gap: 2px; align-items: center; }
.tg-town-tycoon .tt-rules .tg-rpic .tg-ico { width: 30px; height: 30px; }
`,
};
export default ui;
