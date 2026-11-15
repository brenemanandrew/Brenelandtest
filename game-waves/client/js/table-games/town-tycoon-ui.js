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
  trade: SVG(`<path d="M3 8h13l-3-3M21 16H8l3 3" fill="none" ${S} stroke-width="2.6"/><circle cx="19" cy="7" r="3" fill="#ffd34d" ${S} stroke-width="1.6"/><rect x="2" y="13.5" width="5" height="5" rx="1" fill="#7ddc7a" ${S} stroke-width="1.6"/>`),
  gavel: SVG(`<rect x="9" y="3" width="12" height="6" rx="1.5" fill="#9a6538" ${S} transform="rotate(35 15 6)"/><path d="M11 11l-7 7" ${S} stroke-width="3"/><rect x="3" y="19" width="12" height="3" rx="1" fill="#6e4224" ${S}/>`),
  pass: SVG(`<circle cx="12" cy="12" r="8.5" fill="#fff8ec" ${S}/><path d="M6.5 17.5l11-11" ${S} stroke-width="2.6"/>`),
  yes: SVG(`<circle cx="12" cy="12" r="9" fill="#7ddc7a" ${S}/><path d="M7.5 12.5l3 3 6-7" fill="none" ${S} stroke-width="2.8"/>`),
  no: SVG(`<circle cx="12" cy="12" r="9" fill="#ffb3a8" ${S}/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" ${S} stroke-width="2.8"/>`),
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
  return { c, r, cw, ch, cells: cells.map(([x, y]) => ({ x: x * cw, y: y * ch, gx: x, gy: y, corner: (x === 0 || x === c - 1) && (y === 0 || y === r - 1), side: y === 0 ? 'top' : y === r - 1 ? 'bottom' : x === 0 ? 'left' : 'right' })) };
}

// ---------------------------------------------------------------- the pawns' walk: each seat's shown space steps toward its real one
const ANIM = new WeakMap();
function animOf(board) { let a = ANIM.get(board); if (!a) ANIM.set(board, a = { shown: [], target: [], timer: [], table: null }); return a; }
function placeTok(board, a, s, R) {
  const t = board.querySelector(`.tt-tok[data-seat="${s}"]`); if (!t) return;
  const p = tokXY(R, a.shown[s], s, a.n); t.style.left = p.x + 'px'; t.style.top = p.y + 'px';
}
// a pawn stands just inside the ring, on the space's inner edge (so it never hides the name or the price); on a corner, in the
// corner tile's inner quarter. Slots by seat, in a row when they fit, else two rows.
function tokXY(R, i, s, n = 4) {
  const c = R.cells[i], d = Math.round(Math.max(12, Math.min(22, Math.min(R.cw, R.ch) * 0.32)));
  if (c.corner) { // just past the tile's inner corner, two by two
    const right = c.gx === 0, down = c.gy === 0; // the inner corner's direction
    const col = s % 2, row = s >> 1, ox = d * 0.3 + col * d * 0.95, oy = d * 0.3 + row * d * 0.95;
    const ix = right ? c.x + R.cw : c.x, iy = down ? c.y + R.ch : c.y;
    const cx = right ? ix + ox : ix - ox, cy = down ? iy + oy : iy - oy;
    return { x: Math.round(cx - d / 2), y: Math.round(cy - d / 2), d };
  }
  const horiz = c.side === 'top' || c.side === 'bottom', L = horiz ? R.cw : R.ch, k = Math.max(2, n);
  const oneRow = k * d <= L * 1.12;
  const per = oneRow ? k : 2, slot = oneRow ? s : s % 2, row = oneRow ? 0 : s >> 1;
  const gap = Math.min(d * 1.04, (L - d) / Math.max(1, per - 1));
  const along = L / 2 + (slot - (per - 1) / 2) * gap;
  const depth = d * 0.22 + row * d * 0.92; // pawn centre past the tile's inner edge
  let cx, cy;
  if (c.side === 'top') { cx = c.x + along; cy = c.y + R.ch + depth; }
  else if (c.side === 'bottom') { cx = c.x + along; cy = c.y - depth; }
  else if (c.side === 'left') { cx = c.x + R.cw + depth; cy = c.y + along; }
  else { cx = c.x - depth; cy = c.y + along; }
  return { x: Math.round(cx - d / 2), y: Math.round(cy - d / 2), d };
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
function spaceCard(T, v, i, me, onClose, acts) {
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
  // your own deed on your turn: build / sell / mortgage / unmortgage right on its card
  if (acts && acts.length) {
    const row = el('div', 'tt-cacts');
    for (const a of acts) {
      const b = el('button', 'tt-cact' + (a.move ? '' : ' off') + (a.hot ? ' hot' : ''), '', { type: 'button', 'aria-label': a.label, title: a.label });
      const ic = el('span', 'tt-cico'); ic.innerHTML = a.icon; b.append(ic, el('span', '', a.word));
      b.onclick = e => { e.stopPropagation(); a.run(); };
      row.append(b);
    }
    card.append(row);
  }
  return card;
}

// the actions on your selected deed (greyed with a reason when not open now)
function deedActs(s, sel) {
  const { v, moves, me } = s, b = v.board[sel];
  if (!b || !isProp(b) || v.owner[sel] !== me || v.turn !== me || v.roller !== me || v.phase !== 'play' || !['roll', 'woods', 'manage', 'debt'].includes(v.stage)) return [];
  const on = t => moves.find(m => m.type === t && m.space === sel), out = [];
  const opt = (type, word, label) => { const m = on(type); out.push({ word, label: m ? label : label + ' (not now)', icon: ICON[type], move: m, hot: !!m && v.stage === 'debt', run: () => (m ? s.send(m) : s.toast(whyNot(v, type, sel))) }); };
  if (b.kind === 'street' && v.stage !== 'debt') opt('build', v.lvl[sel] >= 4 ? 'Shop' : 'Build', `Build ${v.lvl[sel] >= 4 ? 'a shop' : 'a cottage'} on ${b.name} (${money(v.groups[b.group].build)})`);
  if (b.kind === 'street' && v.lvl[sel] > 0) opt('sell', 'Sell', `Sell a building on ${b.name} for ${money(v.groups[b.group].build / 2)}`);
  if (!v.mort[sel]) opt('mortgage', 'Mortgage', `Mortgage ${b.name} for ${money(mortValue(b))}`);
  else if (v.stage !== 'debt') opt('unmortgage', 'Lift', `Pay ${money(unmortCost(b))} to lift the mortgage on ${b.name}`);
  return out;
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
  a.R = R; a.n = v.n;
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
  const dk = v.dice ? v.dice.join('-') + ':' + (v.roller ?? v.turn) + ':' + (v.round || 0) : '';
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
  // cards sit on their own layer over the pawns (the pawns stand round the middle's edge)
  const top = el('div', 'tt-midtop');
  Object.assign(top.style, { left: mid.style.left, top: mid.style.top, width: mid.style.width, height: mid.style.height });
  if (pick != null && v.board[pick]) {
    top.append(spaceCard(T, v, pick, me, () => { if (ui.sel != null) ui.sel = null; else ui.closedBuy = v.buyAt + ':' + v.round; s.rerender(); }, ui.sel != null ? deedActs(s, pick) : null));
    mid.classList.add('carded');
  } else if (drawnFresh) {
    const c = el('div', 'tt-drawn ' + v.last.deck), art = el('span', 'tt-cart'); art.innerHTML = `<svg viewBox="0 0 40 40">${ART[v.last.deck]}</svg>`;
    c.append(art, el('b', '', v.last.deck === 'lucky' ? 'Lucky Find' : 'Town Notice'), el('p', '', v.last.text));
    top.append(c); mid.classList.add('carded');
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
    const nm = small || R.cw < 70 || (isProp(b) && b.short.split(' ').length > 2) ? TINY[i] || b.short : b.short;
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
    const p = tokXY(R, a.shown[k], k, v.n), info = seatInfo(T, k);
    const tok = el('span', 'tt-tok' + (k === (v.roller ?? v.turn) ? ' turn' : '') + (k === me ? ' me' : ''), '', { 'data-seat': k, title: who(T, k, me) });
    Object.assign(tok.style, { left: p.x + 'px', top: p.y + 'px', width: p.d + 'px', height: p.d + 'px' });
    tok.style.setProperty('--seat', info.color);
    wrap.append(tok);
  }
  wrap.append(top);
  // an auction, a trade being put together or answered: a panel over the whole board
  const panel = boardPanel(s);
  if (panel) { const ov = el('div', 'tt-shade'); ov.append(panel); wrap.append(ov); }
  board.append(wrap);
  for (let k = 0; k < v.n; k++) if (v.alive[k]) walk(board, a, k, v.pos[k], R);
}

// ---------------------------------------------------------------- auctions and trades (a panel over the board)
const poss = (T, k, me) => (k === me ? 'your' : seatInfo(T, k).name + "'s");
function dotOf(T, k) { const d = el('i', 'tg-dot'); d.style.setProperty('--seat', seatInfo(T, k).color); return d; }
function bigBtn(cls, icon, word, label, run, sub) {
  const b = el('button', 'tt-pbtn ' + cls, '', { type: 'button', 'aria-label': label, title: label });
  if (icon) { const i = el('span', 'tt-pico'); i.innerHTML = icon; b.append(i); }
  const w = el('span', 'tt-pword'); w.append(el('b', '', word)); if (sub) w.append(el('small', '', sub)); b.append(w);
  b.onclick = e => { e.stopPropagation(); run(); };
  return b;
}
// a deed as a small chip (a toggle when onTap is given)
function deedChip(v, i, on, onTap, label) {
  const b = v.board[i], c = el(onTap ? 'button' : 'span', 'tt-chipd' + (on ? ' on' : '') + (v.mort[i] ? ' mort' : ''), '', onTap ? { type: 'button', 'aria-pressed': on ? 'true' : 'false', 'aria-label': label } : { 'aria-label': label });
  const band = el('span', 'tt-chband');
  if (b.kind === 'street') band.style.background = v.groups[b.group].color;
  else { band.classList.add('art'); band.innerHTML = `<svg viewBox="0 0 40 40">${artFor(b)}</svg>`; }
  const nm = TINY[i] || b.short, ne = el('span', 'tt-chname', nm);
  ne.style.fontSize = Math.min(10, 46 / (nm.length * 0.56)) + 'px';
  c.append(band, ne, el('span', 'tt-chprice', money(b.price) + (v.mort[i] ? ' M' : '')));
  if (onTap) c.onclick = e => { e.stopPropagation(); onTap(); };
  return c;
}
function boardPanel(s) {
  const { v, me, ui, moves } = s;
  if (!v || v.phase !== 'play') return null;
  if (v.stage === 'auction' && v.auction) return auctionPanel(s);
  if ((v.stage === 'trade' || v.stage === 'offer') && v.trade) return tradePanel(s);
  // picking who to trade with (your turn, a Trade tap)
  const tm = moves.filter(m => m.type === 'trade');
  if (!ui.tradePick || !tm.length || me === null) { ui.tradePick = false; return null; }
  const p = el('div', 'tt-panel tt-pick', '', { role: 'dialog', 'aria-label': 'Trade with who?' });
  const head = el('div', 'tt-phead'); const hi = el('span', 'tt-pico'); hi.innerHTML = ICON.trade; head.append(hi, el('b', '', 'Trade with who?'));
  p.append(head);
  const list = el('div', 'tt-picklist');
  for (const m of tm) {
    const k = m.to, b = el('button', 'tt-pickp', '', { type: 'button', 'aria-label': `Make ${seatInfo(s.T, k).name} an offer` });
    b.append(dotOf(s.T, k), el('b', '', seatInfo(s.T, k).name), el('small', '', money(v.cash[k])));
    b.onclick = e => { e.stopPropagation(); ui.tradePick = false; s.send(m); };
    list.append(b);
  }
  p.append(list, el('p', 'tt-pnote', `Swap places (no buildings on their colour) and money. ${v.offersMax - v.offers} offer${v.offersMax - v.offers === 1 ? '' : 's'} left this turn.`));
  const foot = el('div', 'tt-pfoot');
  foot.append(bigBtn('', ICON.no, 'Not now', 'Close', () => { ui.tradePick = false; s.rerender(); }));
  p.append(foot);
  return p;
}
function auctionPanel(s) {
  const { T, v, me, moves } = s, a = v.auction, b = v.board[a.space];
  const p = el('div', 'tt-panel tt-auction', '', { role: 'dialog', 'aria-label': 'Auction for ' + b.name });
  const head = el('div', 'tt-phead');
  if (b.kind === 'street') head.style.background = v.groups[b.group].color;
  const hi = el('span', 'tt-pico'); hi.innerHTML = b.kind === 'street' ? ICON.gavel : `<svg viewBox="0 0 40 40">${artFor(b)}</svg>`;
  head.append(hi, el('b', '', 'Auction: ' + b.name), el('small', 'tt-pprice', 'Price ' + money(b.price)));
  p.append(head);
  const st = el('div', 'tt-astate');
  const lead = el('div', 'tt-alead');
  if (a.lead >= 0) {
    const bid = el('div', 'tt-abid'); bid.append(el('small', '', 'Top bid'), el('b', '', money(a.bid)));
    lead.append(dotOf(T, a.lead), el('span', '', a.lead === me ? 'You lead!' : seatInfo(T, a.lead).name + ' leads'));
    st.append(bid, lead);
  } else { lead.append(el('span', '', 'No bids yet: open at B10')); st.append(lead); }
  p.append(st);
  // who is still in, whose go it is
  const row = el('div', 'tt-ain', '', { 'aria-label': 'Still bidding' });
  for (const k of a.in) {
    const c = el('span', 'tt-ainp' + (k === a.seat ? ' go' : '') + (k === a.lead ? ' lead' : ''));
    c.append(dotOf(T, k), el('span', '', k === me ? 'You' : seatInfo(T, k).name));
    row.append(c);
  }
  p.append(row);
  const foot = el('div', 'tt-pfoot');
  if (a.seat === me && me !== null) {
    const pass = moves.find(m => m.type === 'pass');
    if (pass) foot.append(bigBtn('', ICON.pass, 'Pass', 'Pass: drop out of this auction', () => s.send(pass)));
    for (const m of moves.filter(x => x.type === 'bid')) foot.append(bigBtn('hot', null, money(m.amount), `Bid ${money(m.amount)}`, () => s.send(m), '+' + (m.amount - a.bid)));
  } else foot.append(el('p', 'tt-pwait', `${a.seat === me ? 'Your' : seatInfo(T, a.seat).name + "'s"} go to bid...`));
  p.append(foot);
  return p;
}
function tradePanel(s) {
  const { T, v, me, moves } = s, t = v.trade;
  const mine = t.from === me, theirs = t.to === me, live = mine && !t.sent;
  const p = el('div', 'tt-panel tt-trade', '', { role: 'dialog', 'aria-label': 'A trade' });
  const head = el('div', 'tt-phead'); const hi = el('span', 'tt-pico'); hi.innerHTML = ICON.trade; head.append(hi);
  const title = t.sent ? (theirs ? `${seatInfo(T, t.from).name} offers you a trade` : mine ? `Your offer to ${seatInfo(T, t.to).name}` : `${seatInfo(T, t.from).name} offers ${seatInfo(T, t.to).name} a trade`)
    : mine ? `Trade with ${seatInfo(T, t.to).name}` : `${seatInfo(T, t.from).name} is making ${seatInfo(T, t.to).name} an offer`;
  head.append(el('b', '', title));
  p.append(head);
  // the two sides: left is the one looking (the receiver sees "You get" first)
  const cols = el('div', 'tt-tcols');
  const pickOf = i => moves.find(m => m.type === 'pick' && m.space === i);
  const cashOf = x => moves.find(m => m.type === 'cash' && m.add === x);
  const side = (k, list, pays, label) => {
    const col = el('div', 'tt-tcol');
    const h = el('div', 'tt-thead'); h.append(dotOf(T, k), el('b', '', label)); col.append(h);
    const chips = el('div', 'tt-tchips');
    const shown = live ? v.board.filter(b => isProp(b) && v.owner[b.i] === k && (pickOf(b.i) || list.includes(b.i))).map(b => b.i) : list;
    for (const i of shown) chips.append(deedChip(v, i, list.includes(i), live && pickOf(i) ? () => s.send(pickOf(i)) : null, `${v.board[i].name}${list.includes(i) ? ' (in the offer)' : ''}`));
    if (!shown.length) chips.append(el('span', 'tt-tnone', live ? 'No places to trade' : 'No places'));
    col.append(chips);
    const cash = el('div', 'tt-tcash'); cash.append(el('b', '', pays > 0 ? '+ ' + money(pays) : 'B0'));
    if (live) {
      const sign = k === t.from ? 1 : -1, cur = pays;
      const step = (x, w) => { const m = cashOf(x * sign); const b = el('button', 'tt-tstep', w, { type: 'button', 'aria-label': `${w} on ${k === me ? 'your' : seatInfo(T, k).name + "'s"} money` }); if (!m) b.disabled = true; b.onclick = e => { e.stopPropagation(); if (m) s.send(m); }; return b; };
      const dec = step(-10, '-10'); if (cur < 10) dec.disabled = true;
      cash.append(dec, step(10, '+10'), step(50, '+50'), step(100, '+100'));
    }
    col.append(cash);
    return col;
  };
  const pays = k => (k === t.from ? Math.max(0, t.cash) : Math.max(0, -t.cash));
  const left = theirs ? t.to : t.from, right = theirs ? t.from : t.to;
  const L = theirs ? 'You give' : mine ? 'You give' : seatInfo(T, t.from).name + ' gives', R = theirs ? seatInfo(T, t.from).name + ' gives' : seatInfo(T, t.to).name + ' gives';
  const arrow = el('span', 'tt-tarrow', '', { 'aria-hidden': 'true' }); arrow.innerHTML = ICON.trade;
  cols.append(side(left, left === t.from ? t.give : t.get, pays(left), L), arrow, side(right, right === t.from ? t.give : t.get, pays(right), R));
  p.append(cols);
  const foot = el('div', 'tt-pfoot');
  if (live) {
    const cancel = moves.find(m => m.type === 'cancel'), send = moves.find(m => m.type === 'send');
    if (cancel) foot.append(bigBtn('', ICON.no, 'Cancel', 'Cancel this offer', () => s.send(cancel)));
    const sb = bigBtn('hot', ICON.yes, 'Send', send ? 'Send the offer' : 'Pick places or money first', () => (send ? s.send(send) : s.toast('Tap places or add money first.')));
    if (!send) sb.classList.add('off');
    foot.append(sb);
  } else if (theirs && t.sent) {
    const no = moves.find(m => m.type === 'decline'), yes = moves.find(m => m.type === 'accept');
    if (no) foot.append(bigBtn('', ICON.no, 'No thanks', 'Decline the trade', () => s.send(no)));
    if (yes) foot.append(bigBtn('hot', ICON.yes, 'Deal!', 'Accept the trade', () => s.send(yes)));
  } else foot.append(el('p', 'tt-pwait', t.sent ? `Waiting for ${t.to === me ? 'you' : seatInfo(T, t.to).name}...` : `${seatInfo(T, t.from).name} is choosing...`));
  p.append(foot);
  return p;
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
  // a trade starts here (your turn, trades on)
  if (s.moves.some(m => m.type === 'trade')) {
    const tb = el('button', 'tt-tradebtn' + (ui.tradePick ? ' on' : ''), '', { type: 'button', 'aria-label': 'Offer a trade', title: 'Offer a trade (T)' });
    const ic = el('span', 'tt-pico'); ic.innerHTML = ICON.trade; tb.append(ic, el('b', '', 'Trade'));
    tb.onclick = e => { e.stopPropagation(); ui.tradePick = !ui.tradePick; ui.sel = null; s.rerender(); };
    box.append(tb);
  }
  const mine = v.board.filter(b => isProp(b) && v.owner[b.i] === me);
  const deeds = el('div', 'tt-deeds');
  if (!mine.length) deeds.append(el('p', 'tt-none', 'No deeds yet. Land on a space for sale and Buy it.'));
  else if (v.debt && v.turn === me && ui.sel == null) deeds.append(el('p', 'tt-none tt-hint', 'Tap a deed, then Sell or Mortgage on its card'));
  // grouped: colour pairs in board order, then transit and the tool crib
  const groups = [];
  for (const b of mine) { const k = b.kind === 'street' ? 'g' + b.group : 'other'; let g = groups.find(x => x.k === k); if (!g) groups.push(g = { k, list: [] }); g.list.push(b); }
  groups.sort((x, y) => (x.k === 'other') - (y.k === 'other'));
  const Wd = (hand.clientWidth || 360) - (s.moves.some(m => m.type === 'trade') ? 160 : 110), Hd = hand.clientHeight || 90;
  const n = mine.length || 1, dw = Math.max(32, Math.min(52, (Wd - groups.length * 8) / n)), dh = Math.max(34, Math.min(Hd - 14, dw * 1.4));
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
  const has = t => moves.find(m => m.type === t);
  if (has('roll')) out.push({ id: 'roll', icon: ICON.roll, label: v.stage === 'woods' ? 'Roll for a double' : 'Roll the dice', word: 'Roll', key: 'R', move: has('roll'), hot: true });
  if (has('buy')) { const b = v.board[v.buyAt]; out.push({ id: 'buy', icon: ICON.buy, label: `Buy ${b.name} for ${money(b.price)}`, word: 'Buy ' + money(b.price), key: 'B', move: has('buy'), hot: true }); }
  if (has('skip')) out.push({ id: 'skip', icon: ICON.skip, label: v.settings && v.settings.auctions ? 'Do not buy it (it goes to auction)' : 'Do not buy it', word: v.settings && v.settings.auctions ? 'Auction' : 'Skip', key: 'S', move: has('skip') });
  if (has('pay')) out.push({ id: 'pay', icon: ICON.pay, label: 'Pay B50 to walk out of the woods', word: 'B50', move: has('pay') });
  if (has('map')) out.push({ id: 'map', icon: ICON.map, label: 'Use your trail map to walk out', move: has('map') });
  // (a deed's own actions are on its card: tap the deed; auctions and trades have their panel on the board). A Build button
  // opens the card of the first street you can build on.
  const bm = moves.find(m => m.type === 'build');
  if (bm && ui.sel == null) out.push({ id: 'build', icon: ICON.build, label: 'Build: open a street you can build on', run: () => { ui.sel = bm.space; ui.tradePick = false; s.rerender(); } });
  if (v.stage === 'debt' && ui.sel == null) out.push({ id: 'raise', icon: ICON.mortgage, label: 'Tap a deed in your hand to sell or mortgage', word: 'Raise ' + money(v.debt ? v.debt.amount - v.cash[me] : 0), hot: true, run: () => s.toast('Tap a deed in your hand, then Sell or Mortgage on its card.') });
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
    case 'buy': return b.auction ? `${w(b.seat)} ${verb(b.seat, me, 'win', 'wins')} the auction: ${nm(b.space)} for ${money(b.price)}.` : `${w(b.seat)} ${verb(b.seat, me, 'buy', 'buys')} ${nm(b.space)} for ${money(b.price)}.`;
    case 'auction':
      if (b.step === 'start') return `${nm(b.space)} goes up for auction! Bids start at B10.`;
      if (b.step === 'bid') return `${w(b.seat)} ${verb(b.seat, me, 'bid', 'bids')} ${money(b.bid)}.`;
      if (b.step === 'pass') return b.auto ? `${w(b.seat)} can't go higher and ${verb(b.seat, me, 'drop', 'drops')} out.` : `${w(b.seat)} ${verb(b.seat, me, 'pass', 'passes')}.`;
      if (b.step === 'unsold') return `Nobody bid: ${nm(b.space)} is still for sale.`;
      return null;
    case 'trade': {
      const items = (list, cash) => { const a = list.map(nm); if (cash > 0) a.push(money(cash)); return a.length ? a.join(' + ') : 'nothing'; };
      if (b.step === 'open') return `${w(b.from)} ${verb(b.from, me, 'start', 'starts')} an offer for ${w(b.to) === 'You' ? 'you' : w(b.to)}.`;
      if (b.step === 'cancel') return `${w(b.from)} ${verb(b.from, me, 'drop', 'drops')} the offer.`;
      const deal = `${items(b.give, b.cash)} for ${items(b.get, -b.cash)}`;
      if (b.step === 'offer') return `${w(b.from)} ${verb(b.from, me, 'offer', 'offers')} ${w(b.to) === 'You' ? 'you' : w(b.to)}: ${deal}.`;
      if (b.step === 'accept') return `Deal! ${w(b.to)} ${verb(b.to, me, 'take', 'takes')} ${poss(T, b.from, me)} offer: ${deal}.`;
      if (b.step === 'decline') return `${w(b.to)} ${verb(b.to, me, 'say', 'says')} no thanks to ${poss(T, b.from, me)} offer.`;
      return null;
    }
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
    case 'auction':
      if (b.step === 'start') { play('tg-ring', 100); if (eye) eye.stamp('Auction!', spaceName(T.view, b.space) + ' - bids start at B10', { color: '#9a6538', sound: () => play('tg-stamp') }); }
      else if (b.step === 'bid') play('tg-tick');
      else if (b.step === 'unsold') play('tg-back');
      break;
    case 'trade':
      if (b.step === 'offer') { play('tg-ring', 80); if (eye && b.to === me) eye.stamp('A trade offer!', who(T, b.from, me) + ' wants to trade', { color: '#3f6fd9', sound: () => play('tg-stamp') }); }
      else if (b.step === 'accept') { if (eye) eye.stamp('Deal!', who(T, b.to, me) + (b.to === me ? ' take the trade' : ' takes the trade'), { color: '#4fa45a', sound: () => play('tg-stamp') }); else play('tg-stamp'); }
      else if (b.step === 'decline') play('tg-back');
      break;
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
  row(ic('buy') + ic('skip'), 'Land on a street, bus or van stop, or the Tool Crib that nobody owns: Buy it for its price, or pass it up.');
  row(ic('gavel'), 'Auctions: a place passed up (or too dear) goes to auction. Everyone with cash takes turns: raise by B10, B50 or B100, or Pass (you are out). Last one in buys it for the bid. Bids never go past twice the price.');
  row(ic('trade'), 'Trades: on your turn tap Trade, pick a player, tap places from both sides (none with buildings on that colour) and add money, then Send. They say Deal or No thanks. Two offers a turn.');
  row(band('#ff8fb8'), 'Land on someone\'s space: pay rent. Own a whole colour pair and rent doubles, and you may build cottages (1 to 4, then a Shop), evenly across the pair.');
  row(art('lucky') + art('notice'), 'Lucky Find and Town Notice spaces: draw a card and do what it says.');
  row(art('woods'), 'Lost in the Woods: roll a double to walk out, pay B50, or use a trail map. After 3 misses you pay B50 and walk.');
  row(ic('mortgage') + ic('sell'), 'Tap a deed to see its card: build, sell buildings (half back) or mortgage it (no rent while mortgaged). Cannot pay at all: bankrupt, you are out.');
  row(ic('end'), 'Quick game: 15 rounds, richest wins (cash + deeds + buildings). Full game: last one standing. The host can switch auctions and trades off.');
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
    const extras = [settings && settings.auctions === false ? null : 'auctions', settings && settings.trades === false ? null : 'trades'].filter(Boolean);
    return `${full ? 'Last one standing (60 rounds at most)' : '15 rounds, richest wins'}. ${cash} each for ${Math.max(2, n)} players${extras.length ? ', with ' + extras.join(' and ') : ''}.`;
  },
  onKey(code, s) {
    const m = t => (s.moves || []).find(x => x.type === t);
    const go = t => { const x = m(t); if (x) { s.send(x); return true; } return false; };
    if (code === 'KeyR' || code === 'Space') return go('roll') || (code === 'Space' && go('end'));
    if (code === 'KeyB') return go('buy');
    if (code === 'KeyS') return go('skip');
    if (code === 'KeyP') return go('pass');
    if (code === 'KeyA') return go('accept');
    if (code === 'KeyD') return go('decline');
    if (code === 'KeyT' && (s.moves || []).some(x => x.type === 'trade')) { s.ui.tradePick = !s.ui.tradePick; s.rerender(); return true; }
    if (code === 'KeyE' || code === 'Enter') return go('end') || go('roll');
    if (code === 'Escape' && s.ui && s.ui.tradePick) { s.ui.tradePick = false; s.rerender(); return true; }
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
.tg-town-tycoon .tt-midtop { position: absolute; z-index: 5; pointer-events: none; }
.tg-town-tycoon .tt-midtop > * { pointer-events: auto; }
.tg-town-tycoon .tt-cacts { display: flex; gap: 5px; justify-content: center; padding: 2px 6px 7px; flex-wrap: wrap; }
.tg-town-tycoon .tt-cact { display: inline-flex; align-items: center; gap: 4px; min-height: 36px; padding: 0 10px 0 6px; border: 2.5px solid #2b2340; border-radius: 18px; background: #fff8ec; font: 700 14px Fredoka, sans-serif; color: #2b2340; box-shadow: 0 2px 0 rgba(43,35,64,.8); }
.tg-town-tycoon .tt-cact.hot { background: #ffd34d; }
.tg-town-tycoon .tt-cact.off { opacity: .5; }
.tg-town-tycoon .tt-cico { width: 22px; height: 22px; display: block; }
.tg-town-tycoon .tt-cico svg, .tg-town-tycoon .tt-pico svg { width: 100%; height: 100%; display: block; }
.tg-town-tycoon .tt-tradebtn { flex: 0 0 auto; align-self: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; width: 58px; height: 62px; padding: 0; border: 2.5px solid #2b2340; border-radius: 12px; background: #e6f2ff; color: #2b2340; box-shadow: 0 3px 0 rgba(43,35,64,.85); font: 700 13px Fredoka, sans-serif; }
.tg-town-tycoon .tt-tradebtn.on { background: #ffd34d; }
.tg-town-tycoon .tt-tradebtn .tt-pico { width: 28px; height: 28px; }
.tg-town-tycoon.portrait .tt-tradebtn { width: 50px; height: 56px; font-size: 12px; }
.tg-town-tycoon.portrait .tt-cash { min-width: 80px; padding: 4px 5px; }
/* the auction and trade panels over the board */
.tg-town-tycoon .tt-shade { position: absolute; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; padding: 6px; box-sizing: border-box; background: rgba(43,35,64,.34); border-radius: 8px; }
.tg-town-tycoon .tt-panel { width: 100%; max-width: 540px; max-height: 100%; box-sizing: border-box; display: flex; flex-direction: column; background: #fff8ec; border: 3px solid #2b2340; border-radius: 12px; box-shadow: 0 4px 0 rgba(43,35,64,.85); overflow: hidden; color: #2b2340; animation: tg-pop .3s cubic-bezier(.3,1.6,.5,1); }
.tg-town-tycoon .tt-phead { flex: 0 0 auto; display: flex; align-items: center; gap: 7px; padding: 4px 10px; min-height: 30px; background: #f3e3c3; border-bottom: 2.5px solid #2b2340; font-size: 16px; }
.tg-town-tycoon .tt-phead b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tg-town-tycoon .tt-pico { flex: 0 0 auto; width: 24px; height: 24px; display: block; }
.tg-town-tycoon .tt-pprice { font-size: 13px; font-weight: 700; background: #fff8ec; border: 2px solid #2b2340; border-radius: 10px; padding: 0 6px; }
.tg-town-tycoon .tt-astate { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 4px 8px 0; }
.tg-town-tycoon .tt-abid { display: flex; flex-direction: column; align-items: center; line-height: 1; }
.tg-town-tycoon .tt-abid small { font-size: 12px; font-weight: 600; color: #6b5e52; }
.tg-town-tycoon .tt-abid b { font-size: 28px; color: #6e4224; }
.tg-town-tycoon .tt-alead { display: flex; align-items: center; gap: 5px; font-size: 16px; font-weight: 700; }
.tg-town-tycoon .tt-ain { display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; padding: 4px 8px; }
.tg-town-tycoon .tt-ainp { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px 1px 4px; border: 2px solid #d9cdb4; border-radius: 12px; font-size: 13px; font-weight: 600; }
.tg-town-tycoon .tt-ainp.go { border-color: #2b2340; background: #fff1b8; }
.tg-town-tycoon .tt-ainp.lead { box-shadow: inset 0 0 0 2px #7ddc7a; }
.tg-town-tycoon .tt-pfoot { flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px; padding: 5px 8px 7px; border-top: 2px dashed #d9cdb4; }
.tg-town-tycoon .tt-pbtn { display: inline-flex; align-items: center; gap: 4px; min-height: 42px; padding: 0 12px 0 8px; border: 2.5px solid #2b2340; border-radius: 22px; background: #fff8ec; color: #2b2340; box-shadow: 0 3px 0 rgba(43,35,64,.85); font-family: Fredoka, sans-serif; }
.tg-town-tycoon .tt-pbtn:active { transform: translateY(2px); box-shadow: 0 1px 0 rgba(43,35,64,.85); }
.tg-town-tycoon .tt-pbtn.hot { background: #ffd34d; }
.tg-town-tycoon .tt-pbtn.off { opacity: .55; }
.tg-town-tycoon .tt-pword { display: flex; flex-direction: column; align-items: center; line-height: 1.02; }
.tg-town-tycoon .tt-pword b { font-size: 16px; }
.tg-town-tycoon .tt-pword small { font-size: 11px; font-weight: 600; }
.tg-town-tycoon .tt-pwait { margin: 4px; font-size: 14px; font-weight: 600; color: #6b5e52; }
.tg-town-tycoon .tt-pnote { margin: 2px 10px 4px; font-size: 13px; text-align: center; color: #6b5e52; }
.tg-town-tycoon .tt-picklist { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; padding: 8px; }
.tg-town-tycoon .tt-pickp { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px 0 10px; border: 2.5px solid #2b2340; border-radius: 22px; background: #e6f2ff; color: #2b2340; box-shadow: 0 3px 0 rgba(43,35,64,.85); font: 600 16px Fredoka, sans-serif; }
.tg-town-tycoon .tt-pickp small { font-size: 13px; color: #6e4224; font-weight: 700; }
.tg-town-tycoon .tt-tcols { flex: 1 1 auto; min-height: 0; display: flex; align-items: stretch; gap: 4px; padding: 4px 6px; overflow: hidden; }
.tg-town-tycoon .tt-tcol { flex: 1 1 0; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 3px; }
.tg-town-tycoon .tt-thead { display: flex; align-items: center; gap: 4px; font-size: 14px; white-space: nowrap; overflow: hidden; }
.tg-town-tycoon .tt-tchips { flex: 1 1 auto; min-height: 0; padding: 3px; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 3px; overflow-y: auto; }
.tg-town-tycoon .tt-tnone { font-size: 12px; color: #6b5e52; }
.tg-town-tycoon .tt-tarrow { flex: 0 0 auto; align-self: center; width: 22px; height: 22px; }
.tg-town-tycoon .tt-tarrow svg { width: 100%; height: 100%; }
.tg-town-tycoon .tt-chipd { position: relative; flex: 0 0 auto; width: 50px; height: 40px; padding: 0; display: flex; flex-direction: column; align-items: center; border: 2px solid #2b2340; border-radius: 6px; background: #fff8ec; overflow: hidden; color: #2b2340; font-family: Fredoka, sans-serif; opacity: .62; }
.tg-town-tycoon span.tt-chipd { opacity: 1; }
.tg-town-tycoon .tt-chipd.on { opacity: 1; box-shadow: 0 0 0 3px #ffd34d; transform: translateY(-1px); }
.tg-town-tycoon .tt-chipd.mort { background: repeating-linear-gradient(45deg, #e6dccb 0 5px, #d4c8b3 5px 10px); }
.tg-town-tycoon .tt-chband { align-self: stretch; height: 9px; flex: 0 0 auto; border-bottom: 1.5px solid #2b2340; }
.tg-town-tycoon .tt-chband.art { height: 12px; background: #f3e3c3; display: flex; justify-content: center; }
.tg-town-tycoon .tt-chband.art svg { height: 100%; }
.tg-town-tycoon .tt-chname { font-size: 10px; font-weight: 600; line-height: 1; padding-top: 1px; white-space: nowrap; overflow: hidden; max-width: 100%; }
.tg-town-tycoon .tt-chprice { margin-top: auto; padding-bottom: 1px; font-size: 10px; font-weight: 700; color: #6e4224; }
.tg-town-tycoon .tt-tcash { display: flex; align-items: center; gap: 3px; flex-wrap: wrap; }
.tg-town-tycoon .tt-tcash b { min-width: 46px; font-size: 15px; color: #6e4224; }
.tg-town-tycoon .tt-tstep { min-width: 34px; height: 30px; padding: 0 4px; border: 2px solid #2b2340; border-radius: 15px; background: #fff8ec; font: 700 13px Fredoka, sans-serif; color: #2b2340; }
.tg-town-tycoon .tt-tstep:disabled { opacity: .4; }
.tg-town-tycoon[data-form="phone"] .tt-phead { min-height: 26px; padding: 2px 8px; font-size: 14px; }
.tg-town-tycoon[data-form="phone"] .tt-abid b { font-size: 22px; }
.tg-town-tycoon[data-form="phone"] .tt-pbtn { min-height: 38px; }
.tg-town-tycoon[data-form="phone"] .tt-pfoot { padding: 3px 6px 4px; }
.tg-town-tycoon[data-form="phone"] .tt-astate, .tg-town-tycoon[data-form="phone"] .tt-ain { padding-top: 2px; padding-bottom: 2px; }
.tg-town-tycoon[data-form="phone"] .tt-trade .tt-pbtn { min-height: 32px; }
.tg-town-tycoon[data-form="phone"] .tt-trade .tt-pfoot { border-top: 0; padding-top: 1px; }
.tg-town-tycoon[data-form="phone"] .tt-chipd { width: 48px; height: 38px; }
.tg-town-tycoon[data-form="phone"] .tt-tstep { height: 26px; min-width: 32px; }
.tg-town-tycoon[data-form="phone"] .tt-tcash { flex-wrap: nowrap; }
.tg-town-tycoon[data-form="phone"] .tt-tcash b { min-width: 38px; font-size: 14px; }
.tg-town-tycoon[data-form="phone"] .tt-tarrow { width: 16px; }
/* portrait phone: many buttons (the table's own included) drop their words so the row never wraps */
.tg-town-tycoon.portrait .tg-acts:has(> .tg-act:nth-child(6)) .tg-act-word { display: none; }
.tg-town-tycoon.portrait .tg-acts:has(> .tg-act:nth-child(6)) .tg-act:has(.tg-act-word) { width: 42px; min-width: 0; padding: 0; border-radius: 50%; justify-content: center; }
.tg-town-tycoon.portrait .tg-acts { flex-wrap: nowrap; }
`,
};
export default ui;
