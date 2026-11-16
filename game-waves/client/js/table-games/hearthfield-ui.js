// Hearthfield's part of the table-game overlay (game-waves, SPEC section 3): the long meadow of hex fields round Breneland town
// drawn flat in Breneland's look (fields with their pictures and number signs, lanes, cottages and halls in seat colours, the
// market carts on the rim, Rascal the raccoon), the dice and the badges beside it, your cards and the build chips in the hand,
// panels over the board for swaps, the carts, favour cards, the picnic basket and who Rascal nabs from, the words for each beat,
// the end card and the rules. Tap a build chip, then a glowing spot (tap-then-tap). Reads only the view it is given.
import { el } from '../util.js';
import { seatInfo } from './mt-ui.js';
import { LOOK } from './tg-state.js';

const INK = '#2b2340';
const RES = ['timber', 'clay', 'wool', 'berries', 'stone'];
const RI = { timber: 0, clay: 1, wool: 2, berries: 3, stone: 4 };
const NAME = { timber: 'Timber', clay: 'Clay', wool: 'Wool', berries: 'Berries', stone: 'Stone' };
const FIELD = { timber: 'Whisper Woods', clay: 'Clay Banks', wool: 'Woolly Hills', berries: 'Berry Patch', stone: 'Pebble Quarry' };
const FILL = { timber: '#5fb36a', clay: '#e39a63', wool: '#d6eda6', berries: '#f4b8cf', stone: '#bdbacb', town: '#f3e3c3' };
const COST = { lane: [1, 1, 0, 0, 0], cottage: [1, 1, 1, 1, 0], hall: [0, 1, 0, 2, 2], favour: [0, 0, 1, 1, 1] };
const FAV = {
  wrangler: { name: 'Raccoon Wrangler', short: 'Wrangler', text: 'Shoo Rascal to another field and nab a card from someone beside it. Play 3 for the Critter Keeper badge.' },
  beavers: { name: 'Busy Beavers', short: 'Beavers', text: 'Build up to 2 lanes for free, right now.' },
  basket: { name: 'Picnic Basket', short: 'Basket', text: 'Take 3 cards from the bank, all different kinds.' },
  market: { name: 'Market Day', short: 'Market', text: 'For the rest of your turn the carts swap 2 for 1, any kind.' },
  acorn: { name: 'Golden Acorn', short: 'Acorn', text: 'Worth 1 point. Kept hidden until the end.' },
};
const SVG = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const S = `stroke="${INK}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"`;
// the five kinds' pictures (24 x 24)
const ART = {
  timber: `<path d="M12 2l-6.5 9h3.5l-4.5 6.5h15L15 11h3.5z" fill="#2f8a4a" ${S}/><rect x="10.4" y="17.5" width="3.2" height="4.5" fill="#9a6538" ${S}/>`,
  clay: `<rect x="2.5" y="13.5" width="9" height="5.5" rx="1" fill="#d26f3a" ${S}/><rect x="12.5" y="13.5" width="9" height="5.5" rx="1" fill="#e08a50" ${S}/><rect x="7.5" y="7" width="9" height="5.5" rx="1" fill="#c9622e" ${S}/>`,
  wool: `<path d="M5.5 10.5a3 3 0 0 1 4.5-2.6 3.2 3.2 0 0 1 5.4.2 3 3 0 0 1 3.3 4.4 2.8 2.8 0 0 1-2.4 4.5H8a3 3 0 0 1-2.5-6.5z" fill="#fff8ec" ${S}/><ellipse cx="19" cy="10.5" rx="2.6" ry="2.1" fill="${INK}"/><path d="M9 17v4M14 17v4" ${S}/>`,
  berries: `<path d="M12 2.5c1.5 2.5 4 3 6.5 2-1 3-3.5 4-6.5 3.5" fill="#4fa45a" ${S}/><path d="M12 8V4" ${S}/><circle cx="7.5" cy="13" r="4" fill="#d6336c" ${S}/><circle cx="15.8" cy="12.5" r="4" fill="#9b2fae" ${S}/><circle cx="11.6" cy="18.4" r="3.8" fill="#e8467c" ${S}/>`,
  stone: `<path d="M2.5 19.5l3-7.5 5-4.5 6.5 1.5 4.5 7-2 3.5z" fill="#a9a6b8" ${S}/><path d="M10.5 7.5l1.5 6 5.5-.5M12 13.5l-4 6" fill="none" ${S}/>`,
};
const RACCOON = `<path d="M3 6l3 5M21 6l-3 5" ${S}/><path d="M4 5l4 3M20 5l-4 3" fill="#8a8698" ${S}/><ellipse cx="12" cy="13" rx="8.5" ry="7" fill="#9b97a8" ${S}/><path d="M4.5 12c2-2 5-2 7.5 0 2.5-2 5.5-2 7.5 0-1 2.5-5 3-7.5 1.2-2.5 1.8-6.5 1.3-7.5-1.2z" fill="${INK}"/><circle cx="8.8" cy="12" r="1.4" fill="#fff8ec"/><circle cx="15.2" cy="12" r="1.4" fill="#fff8ec"/><path d="M8.5 16.5c2 1.6 5 1.6 7 0-1 2.5-6 2.5-7 0z" fill="#fff8ec" ${S} stroke-width="1.2"/><circle cx="12" cy="16" r="1.1" fill="${INK}"/>`;
const houseSvg = (col, hall) => (hall
  ? `<path d="M2 12l5-5 5 5 5-5 5 5v9H2z" fill="${col}" ${S}/><rect x="9.5" y="15" width="5" height="6" fill="#fff8ec" ${S}/><path d="M17 7V3h2.5v6" fill="#9a6538" ${S}/>`
  : `<path d="M4 12l8-7 8 7v9H4z" fill="${col}" ${S}/><rect x="10" y="15" width="4" height="6" fill="#fff8ec" ${S}/>`);
const ICON = {
  roll: SVG(`<rect x="2.5" y="7" width="11" height="11" rx="2.5" fill="#fff8ec" ${S}/><circle cx="5.5" cy="10" r="1.4" fill="${INK}"/><circle cx="10.5" cy="15" r="1.4" fill="${INK}"/><circle cx="8" cy="12.5" r="1.4" fill="${INK}"/><rect x="11" y="3" width="10" height="10" rx="2.3" fill="#ffd34d" ${S} transform="rotate(14 16 8)"/><circle cx="14.5" cy="6.5" r="1.3" fill="${INK}"/><circle cx="17.5" cy="9.5" r="1.3" fill="${INK}"/>`),
  end: SVG(`<path d="M6 21V4" fill="none" ${S} stroke-width="2.4"/><path d="M6 4h11l-2.5 4L17 12H6" fill="#f2b630" ${S}/>`),
  trade: SVG(`<path d="M3 8h13l-3-3M21 16H8l3 3" fill="none" ${S} stroke-width="2.4"/><circle cx="19" cy="7" r="3" fill="#ffd34d" ${S} stroke-width="1.5"/><circle cx="5" cy="16" r="3" fill="#d6336c" ${S} stroke-width="1.5"/>`),
  cart: SVG(`<path d="M3 7h14l-2 8H5z" fill="#c99a62" ${S}/><path d="M17 7l2-3h2" fill="none" ${S}/><circle cx="7" cy="18.5" r="2.3" fill="#fff8ec" ${S}/><circle cx="14" cy="18.5" r="2.3" fill="#fff8ec" ${S}/><path d="M7 4.5h3M8.5 3v3" ${S}/>`),
  favour: SVG(`<rect x="5" y="3" width="14" height="18" rx="2.5" fill="#fff1b8" ${S}/><path d="M12 7.5l1.4 2.8 3 .4-2.2 2.1.5 3-2.7-1.4-2.7 1.4.5-3-2.2-2.1 3-.4z" fill="#ffd34d" ${S} stroke-width="1.4"/>`),
  lane: SVG(`<path d="M4 19L20 5" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M4 19L20 5" stroke="#c99a62" stroke-width="3.6" stroke-linecap="round"/>`),
  cottage: SVG(houseSvg('#7ddc7a', false)),
  hall: SVG(houseSvg('#7ddc7a', true)),
  done: SVG(`<circle cx="12" cy="12" r="9" fill="#7ddc7a" ${S}/><path d="M7.5 12.5l3 3 6-7" fill="none" ${S} stroke-width="2.6"/>`),
  yes: SVG(`<circle cx="12" cy="12" r="9" fill="#7ddc7a" ${S}/><path d="M7.5 12.5l3 3 6-7" fill="none" ${S} stroke-width="2.6"/>`),
  no: SVG(`<circle cx="12" cy="12" r="9" fill="#ffb3a8" ${S}/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" ${S} stroke-width="2.6"/>`),
  raccoon: SVG(RACCOON),
  parade: SVG(`<path d="M3 20c3-6 6-9 9-9s6 3 9 9" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M3 20c3-6 6-9 9-9s6 3 9 9" fill="none" stroke="#c99a62" stroke-width="2.4" stroke-linecap="round"/><path d="M12 11V3l5 2-5 2" fill="#e0463c" ${S}/>`),
  keeper: SVG(`<circle cx="12" cy="10" r="7" fill="#ffd34d" ${S}/><path d="M8 16l-2 6 6-3 6 3-2-6" fill="#e0463c" ${S}/><path d="M9 9.5c1.5-1.5 4.5-1.5 6 0-1 1.5-5 1.5-6 0z" fill="${INK}"/>`),
  acorn: SVG(`<path d="M6 10c0-4 12-4 12 0z" fill="#9a6538" ${S}/><path d="M12 6V3" ${S}/><path d="M7 10c0 6 3 10 5 10s5-4 5-10z" fill="#ffd34d" ${S}/>`),
};
const resSvg = r => SVG(ART[r]);
const CARDS_ICON = SVG(`<rect x="3" y="5" width="11" height="15" rx="2" fill="#e39a63" ${S} transform="rotate(-10 8 12)"/><rect x="9" y="4" width="11" height="15" rx="2" fill="#5fb36a" ${S} transform="rotate(8 14 12)"/>`);

// ---------------------------------------------------------------- the meadow's geometry (a copy of hearthfield-board.js makeGeo)
function makeGeo(rows) {
  const R3 = Math.sqrt(3), mid = (rows.length - 1) / 2, hex = [];
  rows.forEach((cnt, r) => { for (let c = 0; c < cnt; c++) hex.push({ r, c, x: (c - (cnt - 1) / 2) * R3, y: (r - mid) * 1.5 }); });
  const key = (x, y) => Math.round(x * 1000) + ',' + Math.round(y * 1000);
  const vm = new Map();
  for (const h of hex) {
    h.vk = [];
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 180 * (60 * k - 90), x = h.x + Math.cos(a), y = h.y + Math.sin(a), kk = key(x, y);
      if (!vm.has(kk)) vm.set(kk, { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
      h.vk.push(kk);
    }
  }
  const vkeys = [...vm.keys()].sort((p, q) => vm.get(p).y - vm.get(q).y || vm.get(p).x - vm.get(q).x);
  const vi = new Map(vkeys.map((k, i) => [k, i]));
  const v = vkeys.map(k => ({ x: vm.get(k).x, y: vm.get(k).y, hexes: [], edges: [] }));
  const em = new Map();
  hex.forEach((h, i) => {
    h.v = h.vk.map(k => vi.get(k)); delete h.vk;
    for (const id of h.v) v[id].hexes.push(i);
    for (let k = 0; k < 6; k++) {
      const a = h.v[k], b = h.v[(k + 1) % 6], lo = Math.min(a, b), hi = Math.max(a, b), kk = lo + '-' + hi;
      if (!em.has(kk)) em.set(kk, { a: lo, b: hi, hexes: [] });
      em.get(kk).hexes.push(i);
    }
  });
  const mpt = x => ({ x: (v[x.a].x + v[x.b].x) / 2, y: (v[x.a].y + v[x.b].y) / 2 });
  const e = [...em.values()].sort((p, q) => Math.round(mpt(p).y * 1000) - Math.round(mpt(q).y * 1000) || mpt(p).x - mpt(q).x);
  e.forEach((x, i) => { v[x.a].edges.push(i); v[x.b].edges.push(i); });
  return { hex, v, e };
}
const GEOS = new Map();
const geoOf = rows => { const k = (rows || [6, 7, 6]).join(','); if (!GEOS.has(k)) GEOS.set(k, makeGeo(rows || [6, 7, 6])); return GEOS.get(k); };

// ---------------------------------------------------------------- small helpers
const who = (T, k, me) => (k === me ? 'You' : seatInfo(T, k).name);
const verb = (k, me, you, they) => (k === me ? you : they);
const colorOf = (T, k) => seatInfo(T, k).color;
const sum = a => a.reduce((x, y) => x + y, 0);
const cardsText = a => { const out = []; (a || []).forEach((n, r) => { if (n) out.push(n + ' ' + NAME[RES[r]].toLowerCase()); }); return out.length ? out.join(' + ') : 'nothing'; };
const costText = c => cardsText(c);
function dotOf(T, k) { const d = el('i', 'tg-dot'); d.style.setProperty('--seat', colorOf(T, k)); return d; }
function resChip(r, n, cls = '') { const c = el('span', 'hf-rc ' + cls, '', { 'aria-label': (n != null ? n + ' ' : '') + NAME[r] }); c.style.setProperty('--res', FILL[r]); const i = el('span', 'hf-ri'); i.innerHTML = resSvg(r); c.append(i); if (n != null) c.append(el('b', '', String(n))); return c; }
function cardsRow(a, empty = 'nothing') { const row = el('span', 'hf-cards'); (a || []).forEach((n, r) => { if (n) row.append(resChip(RES[r], n, 'small')); }); if (!row.children.length) row.append(el('small', '', empty)); return row; }
function bigBtn(cls, icon, word, label, run, sub) {
  const b = el('button', 'hf-pbtn ' + cls, '', { type: 'button', 'aria-label': label, title: label });
  if (icon) { const i = el('span', 'hf-pico'); i.innerHTML = icon; b.append(i); }
  const w = el('span', 'hf-pword'); w.append(el('b', '', word)); if (sub) w.append(el('small', '', sub)); b.append(w);
  b.onclick = e => { e.stopPropagation(); run(); };
  return b;
}
const FACE = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]], 6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]] };
function dieEl(n, cls = '') {
  const d = el('span', 'hf-die ' + cls, '', { 'aria-label': 'a ' + n });
  d.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="5" y="5" width="90" height="90" rx="20" fill="#fff8ec" stroke="${INK}" stroke-width="7"/>${(FACE[n] || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9.5" fill="${INK}"/>`).join('')}</svg>`;
  return d;
}

// what you are doing now (the prompt over the meadow)
function prompt(s) {
  const { T, v, me } = s, k = v.turn, mine = k === me && me !== null, nm = k >= 0 ? who(T, k, me) : '';
  switch (v.stage) {
    case 'setupHome': return mine ? 'Put down a cottage: tap a glowing corner' : `${nm} is picking a corner...`;
    case 'setupLane': return mine ? 'Now a lane beside it: tap a glowing side' : `${nm} lays a lane...`;
    case 'roll': return mine ? 'Your turn: roll the dice' : `${nm}'s turn`;
    case 'discard': return mine ? `Rascal's raid! Drop ${v.discard.need[0]} more: tap your cards` : `${nm} drops cards for Rascal...`;
    case 'raccoon': return mine ? 'Move Rascal: tap a field' : `${nm} moves Rascal...`;
    case 'nab': return mine ? 'Nab a card from who?' : `${nm} picks who to nab from...`;
    case 'beavers': return mine ? `Busy Beavers: ${v.free} free lane${v.free === 1 ? '' : 's'} - tap a side` : `${nm}'s beavers are busy...`;
    case 'basket': return mine ? `Picnic Basket: pick ${v.basket.left} more` : `${nm} packs a picnic basket...`;
    case 'trade': return mine ? 'Make your offer' : `${nm} is making an offer...`;
    case 'offer': return mine ? `${who(T, v.trade.from, me)} offers you a swap` : `Waiting for ${nm}...`;
    case 'main': {
      if (!mine) return `${nm}'s turn`;
      if (s.ui.arm) return { lane: 'Lane: tap a glowing side', home: 'Cottage: tap a glowing corner', hall: 'Hall: tap one of your cottages' }[s.ui.arm];
      return v.market ? 'Market Day! The carts swap 2 for 1' : 'Build, swap, or end your turn';
    }
    case 'over': return 'Game over!';
    default: return '';
  }
}

// ---------------------------------------------------------------- the board
function renderBoard(board, s) {
  const { T, v, me, ui, moves } = s;
  board.textContent = '';
  if (!v || !v.tiles) return;
  const G = geoOf(v.rows);
  const P = board.parentElement, W = board.clientWidth || (P && P.clientWidth) || 600, H = board.clientHeight || (P && P.clientHeight) || 300;
  if (!ui.ro && typeof ResizeObserver === 'function') { ui.ro = new ResizeObserver(() => { const k = board.clientWidth + 'x' + board.clientHeight; if (k !== ui.size) { ui.size = k; ui.rr?.(); } }); ui.ro.observe(board); }
  ui.size = board.clientWidth + 'x' + board.clientHeight; ui.rr = s.rerender;
  // armed spots this render: set up automatically in the setup, the beavers and Rascal's move
  if (v.stage !== 'main') ui.arm = null;
  if (ui.arm && !moves.some(m => m.type === ui.arm)) ui.arm = null;
  const auto = v.stage === 'setupHome' ? 'home' : v.stage === 'setupLane' || v.stage === 'beavers' ? 'lane' : null;
  const arm = auto || ui.arm;
  // the layout: a side column when wide, a strip under the meadow when tall
  const wide = W / H > 1.75, side = wide ? Math.min(176, Math.max(118, W * 0.2)) : 0, strip = wide ? 0 : Math.min(84, Math.max(56, H * 0.22));
  const top = wide ? 4 : 30; // the prompt (in the side column when wide)
  const MW = W - side, MH = H - strip - top;
  const UX = 13.4, UY = 6.3, sc = Math.max(10, Math.min(MW / UX, MH / UY));
  const ox = MW / 2, oy = wide ? top + MH / 2 : top + Math.max(0, (MH - UY * sc) / 3) + UY * sc / 2;
  const stripTop = wide ? 0 : Math.min(H - strip, oy + UY * sc / 2 + 4);
  const X = x => ox + x * sc, Y = y => oy + y * sc;
  const wrap = el('div', 'hf-wrap' + (wide ? ' wide' : ''));
  wrap.style.setProperty('--sc', sc + 'px');
  // the prompt
  const pr = el('div', 'hf-prompt' + (v.turn === me && me !== null && v.phase === 'play' ? ' mine' : '') + (wide ? ' side' : ''));
  if (!wide) Object.assign(pr.style, { left: '4px', width: (MW - 8) + 'px' });
  const ptxt = prompt(s);
  if (v.turn >= 0 && v.phase === 'play') pr.append(dotOf(T, v.turn));
  pr.append(el('span', '', ptxt));
  if (ui.arm && v.stage === 'main' && !wide) { const c = el('span', 'hf-cost'); c.append(cardsRow(COST[ui.arm === 'home' ? 'cottage' : ui.arm])); pr.append(c); }
  if (!wide) wrap.append(pr);
  // the meadow
  const lw = Math.max(2, sc * 0.075);
  let svg = `<svg class="hf-svg" width="${MW}" height="${H - strip}" viewBox="0 0 ${MW} ${H - strip}" aria-hidden="true">`;
  // the meadow's grassy edge
  const hp = (h, k = 1) => { const p = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 90); p.push((X(h.x + Math.cos(a) * k)).toFixed(1) + ',' + (Y(h.y + Math.sin(a) * k)).toFixed(1)); } return p.join(' '); };
  svg += `<g fill="#9fcf7f" stroke="#9fcf7f" stroke-width="${sc * 0.5}" stroke-linejoin="round">${G.hex.map(h => `<polygon points="${hp(h, 1.05)}"/>`).join('')}</g>`;
  // the carts on the rim (drawn under the fields' edge)
  (v.ports || []).forEach((e, k) => {
    const E = G.e[e], a = G.v[E.a], b = G.v[E.b], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, h = G.hex[E.hexes[0]];
    const dx = mx - h.x, dy = my - h.y, d = Math.hypot(dx, dy), px = mx + dx / d * 0.62, py = my + dy / d * 0.62;
    svg += `<path d="M${X(a.x)} ${Y(a.y)}L${X(px)} ${Y(py)}L${X(b.x)} ${Y(b.y)}" fill="none" stroke="#9a6538" stroke-width="${lw * 1.3}" stroke-linecap="round"/>`;
    const c = v.carts[k], R = sc * 0.36;
    svg += `<circle cx="${X(px)}" cy="${Y(py)}" r="${R}" fill="${c === 'any' ? '#fff8ec' : FILL[c]}" stroke="${INK}" stroke-width="${lw}"/>`;
    if (c === 'any') svg += `<text x="${X(px)}" y="${Y(py) + R * 0.36}" text-anchor="middle" font-size="${R * 1.0}" font-weight="700" fill="${INK}" font-family="Fredoka, sans-serif">3:1</text>`;
    else svg += `<g transform="translate(${X(px) - R * 0.72} ${Y(py) - R * 0.72}) scale(${R * 1.44 / 24})">${ART[c]}</g>`;
  });
  // the fields
  G.hex.forEach((h, i) => {
    const t = v.tiles[i], fill = t.res ? FILL[t.res] : FILL.town;
    svg += `<polygon points="${hp(h, 0.985)}" fill="${fill}" stroke="${INK}" stroke-width="${lw}" stroke-linejoin="round"/>`;
    if (t.res) {
      const isz = sc * 0.82;
      svg += `<g transform="translate(${X(h.x) - isz / 2} ${Y(h.y) - sc * 0.86}) scale(${isz / 24})">${ART[t.res]}</g>`;
      // the number on a little wooden sign (the hot ones gold)
      const hot = t.num === 6 || t.num === 8, bw = sc * 0.66, bh = sc * 0.5, bx = X(h.x) - bw / 2, by = Y(h.y) + sc * 0.12;
      svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${sc * 0.12}" fill="${hot ? '#ffd34d' : '#fff8ec'}" stroke="${INK}" stroke-width="${lw * 0.9}"/>`;
      svg += `<text x="${X(h.x)}" y="${by + bh * 0.78}" text-anchor="middle" font-size="${bh * 0.92}" font-weight="700" fill="${hot ? '#a8302a' : INK}" font-family="Fredoka, sans-serif">${t.num}</text>`;
    } else {
      // Breneland town: little houses and the clock tower
      const u = sc / 24, gx = X(h.x) - sc * 0.8, gy = Y(h.y) - sc * 0.7;
      svg += `<g transform="translate(${gx} ${gy}) scale(${u * 1.6 / 1.2})" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"><rect x="2" y="13" width="8" height="7" fill="#fff8ec"/><path d="M1 13.5l5-4.5 5 4.5z" fill="#e0463c"/><rect x="14" y="5" width="6" height="15" fill="#c9d7e6"/><path d="M13 5.5l4-4 4 4z" fill="#3f6fd9"/><circle cx="17" cy="9.5" r="1.8" fill="#fff8ec"/><rect x="22" y="14" width="7" height="6" fill="#fff8ec"/><path d="M21 14.5l4.5-4 4.5 4z" fill="#f2b630"/></g>`;
    }
  });
  // the lanes
  v.lanes.forEach((o, e) => {
    if (o < 0) return;
    const E = G.e[e], a = G.v[E.a], b = G.v[E.b], k = 0.2, x1 = a.x + (b.x - a.x) * k, y1 = a.y + (b.y - a.y) * k, x2 = b.x - (b.x - a.x) * k, y2 = b.y - (b.y - a.y) * k;
    svg += `<line x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}" stroke="${INK}" stroke-width="${sc * 0.24}" stroke-linecap="round"/><line x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}" stroke="${colorOf(T, o)}" stroke-width="${sc * 0.14}" stroke-linecap="round"/>`;
  });
  // Rascal
  { const h = G.hex[v.raccoon], z = sc * 0.95, ry = v.tiles[v.raccoon].res ? Y(h.y) - sc * 0.15 : Y(h.y) + sc * 0.05;
    svg += `<g class="hf-rascal" transform="translate(${X(h.x) + (v.tiles[v.raccoon].res ? sc * 0.25 : 0) - z / 2} ${ry - z / 2}) scale(${z / 24})">${RACCOON}</g>`; }
  // the homes
  v.own.forEach((o, x) => {
    if (o < 0) return;
    const p = G.v[x], z = sc * (v.hall[x] ? 0.9 : 0.7);
    svg += `<g transform="translate(${X(p.x) - z / 2} ${Y(p.y) - z * 0.62}) scale(${z / 24})">${houseSvg(colorOf(T, o), v.hall[x])}</g>`;
  });
  svg += '</svg>';
  const holder = el('div', 'hf-meadow');
  holder.innerHTML = svg;
  wrap.append(holder);
  // the glowing spots (buttons): corners, sides, fields
  const spot = (cls, x, y, size, label, m) => {
    const b = el('button', 'hf-spot ' + cls, '', { type: 'button', 'aria-label': label, title: label });
    Object.assign(b.style, { left: (x - size / 2) + 'px', top: (y - size / 2) + 'px', width: size + 'px', height: size + 'px' });
    b.onclick = e => { e.stopPropagation(); s.send(m); };
    wrap.append(b);
  };
  const vsz = Math.max(24, Math.min(40, sc * 0.72)), esz = Math.max(22, Math.min(34, sc * 0.6));
  if (arm === 'home') { const hm = moves.filter(x => x.type === 'home'), many = hm.length > 16; for (const m of hm) spot('corner' + (many ? ' many' : ''), X(G.v[m.v].x), Y(G.v[m.v].y), many ? Math.max(24, Math.min(36, sc * 0.8)) : vsz, 'Put a cottage here', m); }
  if (arm === 'hall') for (const m of moves.filter(x => x.type === 'hall')) spot('corner hall', X(G.v[m.v].x), Y(G.v[m.v].y) - sc * 0.1, vsz * 1.15, 'Make this cottage a hall', m);
  if (arm === 'lane') for (const m of moves.filter(x => x.type === 'lane')) { const E = G.e[m.e], a = G.v[E.a], b = G.v[E.b]; spot('side', X((a.x + b.x) / 2), Y((a.y + b.y) / 2), esz, 'Lay a lane here', m); }
  if (v.stage === 'raccoon' && v.turn === me) for (const m of moves.filter(x => x.type === 'raccoon')) { const h = G.hex[m.hex], t = v.tiles[m.hex]; spot('field', X(h.x), Y(h.y), sc * 1.05, `Move Rascal to ${t.res ? FIELD[t.res] + ' ' + t.num : 'the town'}`, m); }
  // the last build, for a moment
  if (s.ui.lastAt && Date.now() - s.ui.lastAt.t < 2400) {
    const L = s.ui.lastAt, p = L.what === 'lane' ? (() => { const E = G.e[L.at], a = G.v[E.a], b = G.v[E.b]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; })() : G.v[L.at];
    if (p) { const r = el('span', 'hf-ping'); Object.assign(r.style, { left: (X(p.x) - sc * 0.5) + 'px', top: (Y(p.y) - sc * 0.5) + 'px', width: sc + 'px', height: sc + 'px' }); wrap.append(r); }
  }
  // the side column or the strip: dice, badges, the favour deck, what you would pay
  const info = el('div', 'hf-info' + (wide ? ' col' : ' row'));
  if (wide) { Object.assign(info.style, { left: (W - side + 4) + 'px', top: '4px', width: (side - 8) + 'px', bottom: '4px' }); info.append(pr); }
  else Object.assign(info.style, { left: '4px', right: '4px', top: stripTop + 'px', height: (strip - 4) + 'px' });
  const dice = el('div', 'hf-dice', '', { 'aria-label': v.dice ? `Dice: ${v.dice[0]} and ${v.dice[1]}` : 'Dice' });
  const dk = v.dice ? v.dice.join('-') + ':' + v.roller + ':' + v.round : '';
  const fresh = dk && ui.diceKey !== dk && ui.diceKey !== undefined; ui.diceKey = dk;
  for (const n of v.dice || [3, 4]) dice.append(dieEl(n, (v.dice ? '' : 'idle') + (fresh ? ' fresh' : '')));
  if (v.dice && v.dice[0] + v.dice[1] === 7) dice.append(el('span', 'hf-raid', 'Raid!'));
  const deck = el('div', 'hf-deck', '', { 'aria-label': `${v.deck} favour cards left`, title: `${v.deck} favour cards left` }); const di = el('span', 'hf-bico'); di.innerHTML = ICON.favour; deck.append(di, el('b', '', String(v.deck)));
  dice.append(deck);
  info.append(dice);
  const badge = (icon, title, holder, sub) => {
    const b = el('div', 'hf-badge' + (holder >= 0 ? ' held' : ''), '', { 'aria-label': `${title}: ${holder >= 0 ? who(T, holder, me) : 'nobody yet'}` });
    const i = el('span', 'hf-bico'); i.innerHTML = icon; b.append(i);
    const t = el('span', 'hf-btxt'); t.append(el('b', '', title)); const w = el('small'); if (holder >= 0) w.append(dotOf(T, holder)); w.append(document.createTextNode(holder >= 0 ? who(T, holder, me) + sub : wide ? 'nobody yet' : 'nobody')); t.append(w); b.append(t);
    return b;
  };
  info.append(badge(ICON.parade, wide ? 'Grand Parade' : 'Parade', v.parade, v.parade >= 0 ? ' (' + v.laneLen[v.parade] + ')' : ''));
  info.append(badge(ICON.keeper, wide ? 'Critter Keeper' : 'Keeper', v.keeper, v.keeper >= 0 ? ' (' + v.played[v.keeper] + ')' : ''));
  wrap.append(info);
  // panels over the board: a swap, the carts, favour cards, the basket, who to nab, your pick of who to swap with
  const panel = boardPanel(s);
  if (panel) { const ov = el('div', 'hf-shade'); ov.append(panel); ov.onclick = e => { if (e.target === ov && (ui.panel)) { ui.panel = null; s.rerender(); } }; wrap.append(ov); }
  board.append(wrap);
}

// ---------------------------------------------------------------- panels
function boardPanel(s) {
  const { v, me, ui, moves } = s;
  if (!v || v.phase !== 'play') return null;
  if ((v.stage === 'trade' || v.stage === 'offer') && v.trade) return tradePanel(s);
  if (v.stage === 'nab' && v.turn === me) return nabPanel(s);
  if (v.stage === 'basket' && v.turn === me) return basketPanel(s);
  if (v.stage !== 'main' || v.turn !== me) { ui.panel = null; return null; }
  if (ui.panel === 'pick' && moves.some(m => m.type === 'trade')) return pickPanel(s);
  if (ui.panel === 'bank') return bankPanel(s);
  if (ui.panel === 'favours') return favourPanel(s);
  ui.panel = null;
  return null;
}
function head(icon, title) { const h = el('div', 'hf-phead'); const i = el('span', 'hf-pico'); i.innerHTML = icon; h.append(i, el('b', '', title)); return h; }
function closeFoot(s, word = 'Close') { const f = el('div', 'hf-pfoot'); f.append(bigBtn('', ICON.no, word, 'Close this panel', () => { s.ui.panel = null; s.ui.bankGive = null; s.rerender(); })); return f; }
function pickPanel(s) {
  const { T, v, moves, ui } = s;
  const p = el('div', 'hf-panel', '', { role: 'dialog', 'aria-label': 'Swap with who?' });
  p.append(head(ICON.trade, 'Swap with who?'));
  const list = el('div', 'hf-picklist');
  for (const m of moves.filter(x => x.type === 'trade')) {
    const k = m.to, b = el('button', 'hf-pickp', '', { type: 'button', 'aria-label': `Make ${seatInfo(T, k).name} an offer (${v.cards[k]} cards)` });
    b.append(dotOf(T, k), el('b', '', seatInfo(T, k).name), el('small', '', v.cards[k] + ' cards'));
    b.onclick = e => { e.stopPropagation(); ui.panel = null; s.send(m); };
    list.append(b);
  }
  p.append(list, el('p', 'hf-pnote', `Pick cards to give and to get, then Send. ${v.offersMax - v.offers} offer${v.offersMax - v.offers === 1 ? '' : 's'} left this turn.`), closeFoot(s, 'Not now'));
  return p;
}
function tradePanel(s) {
  const { T, v, me, moves } = s, t = v.trade;
  const mine = t.from === me, theirs = t.to === me, live = mine && !t.sent;
  const p = el('div', 'hf-panel hf-trade', '', { role: 'dialog', 'aria-label': 'A swap' });
  const title = t.sent ? (theirs ? `${seatInfo(T, t.from).name} offers you a swap` : mine ? `Your offer to ${seatInfo(T, t.to).name}` : `${seatInfo(T, t.from).name} offers ${seatInfo(T, t.to).name} a swap`)
    : mine ? `Swap with ${seatInfo(T, t.to).name}` : `${seatInfo(T, t.from).name} is making ${seatInfo(T, t.to).name} an offer`;
  p.append(head(ICON.trade, title));
  if (live) {
    const grid = el('div', 'hf-tgrid');
    for (const side of ['give', 'want']) {
      const row = el('div', 'hf-trow');
      row.append(el('b', 'hf-tlab', side === 'give' ? 'You give' : 'You get'));
      for (let r = 0; r < 5; r++) {
        const res = RES[r], up = moves.find(m => m.type === side && m.res === res && m.add === 1), dn = moves.find(m => m.type === side && m.res === res && m.add === -1);
        const cell = el('div', 'hf-tcell' + (t[side][r] ? ' on' : ''));
        const add = el('button', 'hf-tadd', '', { type: 'button', 'aria-label': `One more ${NAME[res]} to ${side === 'give' ? 'give' : 'get'} (now ${t[side][r]})` });
        add.append(resChip(res, t[side][r]));
        if (!up) add.disabled = true;
        add.onclick = e => { e.stopPropagation(); if (up) s.send(up); };
        cell.append(add);
        if (dn) { const b1 = el('button', 'hf-tminus', '-', { type: 'button', 'aria-label': `One less ${NAME[res]} to ${side === 'give' ? 'give' : 'get'}` }); b1.onclick = e => { e.stopPropagation(); s.send(dn); }; cell.append(b1); }
        row.append(cell);
      }
      grid.append(row);
    }
    p.append(grid, el('p', 'hf-pnote', 'Tap a card to add one; tap - to take one back.'));
  } else {
    const deal = el('div', 'hf-tdeal');
    const L = theirs ? 'You get' : seatInfo(T, t.from).name + ' gives', R = theirs ? 'You give' : seatInfo(T, t.to).name + ' gives';
    const a = el('div', 'hf-tside'); a.append(el('b', '', L), cardsRow(t.give));
    const arrow = el('span', 'hf-tarrow'); arrow.innerHTML = ICON.trade;
    const b = el('div', 'hf-tside'); b.append(el('b', '', R), cardsRow(t.want));
    deal.append(a, arrow, b);
    p.append(deal);
  }
  const foot = el('div', 'hf-pfoot');
  if (live) {
    const cancel = moves.find(m => m.type === 'cancel'), send = moves.find(m => m.type === 'send');
    if (cancel) foot.append(bigBtn('', ICON.no, 'Cancel', 'Cancel this offer', () => s.send(cancel)));
    const sb = bigBtn('hot', ICON.yes, 'Send', send ? 'Send the offer' : 'Pick something to give and to get first', () => (send ? s.send(send) : s.toast('Pick a card to give and one to get first.')));
    if (!send) sb.classList.add('off');
    foot.append(sb);
  } else if (theirs && t.sent) {
    const no = moves.find(m => m.type === 'decline'), yes = moves.find(m => m.type === 'accept');
    if (no) foot.append(bigBtn('', ICON.no, 'No thanks', 'Decline the swap', () => s.send(no)));
    if (yes) foot.append(bigBtn('hot', ICON.yes, 'Deal!', 'Accept the swap', () => s.send(yes)));
    else foot.append(el('p', 'hf-pwait', 'You do not have those cards.'));
  } else foot.append(el('p', 'hf-pwait', t.sent ? `Waiting for ${t.to === me ? 'you' : seatInfo(T, t.to).name}...` : `${seatInfo(T, t.from).name} is choosing...`));
  p.append(foot);
  return p;
}
function bankPanel(s) {
  const { v, moves, ui } = s;
  const p = el('div', 'hf-panel hf-bank', '', { role: 'dialog', 'aria-label': 'Swap with the market carts' });
  p.append(head(ICON.cart, v.market ? 'Market Day: 2 for 1!' : 'Market carts'));
  const gives = RES.filter(r => moves.some(m => m.type === 'bank' && m.give === r));
  if (ui.bankGive && !gives.includes(ui.bankGive)) ui.bankGive = null;
  const row1 = el('div', 'hf-brow'); row1.append(el('b', 'hf-tlab', 'Give'));
  for (const r of RES) {
    const rate = v.rates[RI[r]], ok = gives.includes(r);
    const b = el('button', 'hf-bres' + (ui.bankGive === r ? ' on' : ''), '', { type: 'button', 'aria-label': `Give ${rate} ${NAME[r]}${ok ? '' : ' (not enough)'}`, 'aria-pressed': ui.bankGive === r ? 'true' : 'false' });
    b.append(resChip(r, null), el('small', '', rate + ':1'));
    if (!ok) b.disabled = true;
    b.onclick = e => { e.stopPropagation(); ui.bankGive = ui.bankGive === r ? null : r; s.rerender(); };
    row1.append(b);
  }
  p.append(row1);
  const row2 = el('div', 'hf-brow'); row2.append(el('b', 'hf-tlab', 'Get 1'));
  for (const r of RES) {
    const m = ui.bankGive && moves.find(x => x.type === 'bank' && x.give === ui.bankGive && x.get === r);
    const b = el('button', 'hf-bres get', '', { type: 'button', 'aria-label': m ? `Get 1 ${NAME[r]} for ${v.rates[RI[ui.bankGive]]} ${NAME[ui.bankGive]}` : `Get 1 ${NAME[r]} (pick what to give first)` });
    b.append(resChip(r, null));
    if (!m) b.disabled = true;
    b.onclick = e => { e.stopPropagation(); if (m) s.send(m); };
    row2.append(b);
  }
  p.append(row2);
  p.append(el('p', 'hf-pnote', gives.length ? (ui.bankGive ? 'Now pick what you get.' : 'Pick what you give. A cart beside your home swaps for less.') : 'Not enough of any kind yet.'));
  p.append(closeFoot(s));
  return p;
}
function favourPanel(s) {
  const { v, moves } = s;
  const p = el('div', 'hf-panel hf-favs', '', { role: 'dialog', 'aria-label': 'Your favour cards' });
  p.append(head(ICON.favour, 'Your favour cards'));
  const list = el('div', 'hf-flist');
  const mine = v.myFav || [];
  if (!mine.length) list.append(el('p', 'hf-pnote', 'No favour cards yet. Buy one for 1 wool, 1 berries and 1 stone.'));
  const seen = new Set();
  for (const f of mine) {
    const key = f.card + (f.new ? ':new' : '');
    if (seen.has(key)) continue; seen.add(key);
    const n = mine.filter(x => x.card === f.card && x.new === f.new).length, F = FAV[f.card];
    const c = el('div', 'hf-fcard ' + f.card + (f.new ? ' new' : ''));
    const ic = el('span', 'hf-fico'); ic.innerHTML = f.card === 'wrangler' ? ICON.raccoon : f.card === 'acorn' ? ICON.acorn : f.card === 'beavers' ? ICON.lane : f.card === 'basket' ? ICON.favour : ICON.cart;
    const tx = el('div', 'hf-ftxt'); tx.append(el('b', '', F.name + (n > 1 ? ' x' + n : '')), el('small', '', F.text));
    c.append(ic, tx);
    const m = !f.new && moves.find(x => x.type === 'use' && x.card === f.card);
    if (m) { const b = bigBtn('hot', null, 'Play', 'Play ' + F.name, () => { s.ui.panel = null; s.send(m); }); c.append(b); }
    else c.append(el('small', 'hf-fwhy', f.card === 'acorn' ? 'hidden point' : f.new ? 'new: next turn' : v.used ? 'one a turn' : 'not now'));
    list.append(c);
  }
  p.append(list, closeFoot(s));
  return p;
}
function basketPanel(s) {
  const { moves } = s;
  const p = el('div', 'hf-panel', '', { role: 'dialog', 'aria-label': 'Picnic Basket' });
  p.append(head(ICON.favour, `Picnic Basket: pick ${s.v.basket.left} more`));
  const row = el('div', 'hf-brow');
  for (const r of RES) {
    const m = moves.find(x => x.type === 'take' && x.res === r);
    const b = el('button', 'hf-bres get', '', { type: 'button', 'aria-label': `Take 1 ${NAME[r]}` }); b.append(resChip(r, null), el('small', '', NAME[r]));
    if (!m) { b.disabled = true; b.classList.add('taken'); }
    b.onclick = e => { e.stopPropagation(); if (m) s.send(m); };
    row.append(b);
  }
  p.append(row, el('p', 'hf-pnote', 'Three cards, all different kinds.'));
  return p;
}
function nabPanel(s) {
  const { T, v, moves } = s;
  const p = el('div', 'hf-panel', '', { role: 'dialog', 'aria-label': 'Nab a card from who?' });
  p.append(head(ICON.raccoon, 'Rascal nabs a card from...'));
  const list = el('div', 'hf-picklist');
  for (const m of moves.filter(x => x.type === 'nab')) {
    const k = m.seat, b = el('button', 'hf-pickp', '', { type: 'button', 'aria-label': `Nab from ${seatInfo(T, k).name} (${v.cards[k]} cards)` });
    b.append(dotOf(T, k), el('b', '', seatInfo(T, k).name), el('small', '', v.cards[k] + ' cards'));
    b.onclick = e => { e.stopPropagation(); s.send(m); };
    list.append(b);
  }
  p.append(list);
  return p;
}

// ---------------------------------------------------------------- your hand: cards, then the build chips
function renderHand(hand, s) {
  const { v, me, moves, ui } = s;
  hand.textContent = '';
  if (!v || me === null || me === undefined || !v.hand) return;
  const box = el('div', 'hf-hand');
  const dropping = v.stage === 'discard' && v.turn === me;
  const cards = el('div', 'hf-hcards' + (dropping ? ' drop' : ''));
  RES.forEach((r, i) => {
    const n = v.hand[i], m = dropping && moves.find(x => x.type === 'drop' && x.res === r);
    const c = el(m ? 'button' : 'div', 'hf-card' + (n ? '' : ' none') + (m ? ' tap' : ''), '', m ? { type: 'button', 'aria-label': `Drop 1 ${NAME[r]} (you have ${n})` } : { 'aria-label': `${n} ${NAME[r]}` });
    c.style.setProperty('--res', FILL[r]);
    const ic = el('span', 'hf-cico'); ic.innerHTML = resSvg(r); c.append(ic, el('b', 'hf-cn', String(n)));
    if (m) c.onclick = e => { e.stopPropagation(); s.send(m); };
    cards.append(c);
  });
  box.append(cards);
  // build chips: tap one, then a glowing spot (a favour card is bought straight away)
  const builds = el('div', 'hf-builds');
  const main = v.stage === 'main' && v.turn === me;
  const chip = (id, type, label, cost, icon) => {
    const ms = moves.filter(m => m.type === type), on = main && ms.length > 0, armed = ui.arm === type;
    const b = el('button', 'hf-bchip' + (on ? '' : ' off') + (armed ? ' armed' : ''), '', { type: 'button', 'aria-pressed': armed ? 'true' : 'false', 'aria-label': `${label} (${costText(cost)})${on ? '' : ' - not now'}`, title: `${label}: ${costText(cost)}` });
    const i = el('span', 'hf-bcico'); i.innerHTML = icon; b.append(i);
    const cs = el('span', 'hf-bcost'); cost.forEach((n, r) => { for (let k = 0; k < n; k++) { const d = el('i'); d.style.background = FILL[RES[r]]; cs.append(d); } }); b.append(cs);
    b.onclick = e => {
      e.stopPropagation();
      if (!on) { s.toast(main ? whyNot(s, id) : 'Wait for your turn.'); return; }
      if (type === 'favour') { s.send(ms[0]); return; }
      ui.arm = armed ? null : type; ui.panel = null; s.rerender();
    };
    builds.append(b);
  };
  chip('lane', 'lane', 'Lane', COST.lane, ICON.lane);
  chip('cottage', 'home', 'Cottage', COST.cottage, ICON.cottage);
  chip('hall', 'hall', 'Hall', COST.hall, ICON.hall);
  chip('favour', 'favour', 'Favour card', COST.favour, ICON.favour);
  box.append(builds);
  hand.append(box);
}
function whyNot(s, id) {
  const { v, me } = s, left = v.left[me], cost = COST[id], short = cost.some((c, r) => v.hand[r] < c);
  if (id === 'lane' && left.lane <= 0) return 'No lanes left.';
  if (id === 'cottage' && left.cottage <= 0) return 'No cottages left: grow one into a hall.';
  if (id === 'hall' && left.hall <= 0) return 'No halls left.';
  if (id === 'favour' && v.deck <= 0) return 'The favour deck is empty.';
  if (short) return `${id === 'favour' ? 'A favour card' : id[0].toUpperCase() + id.slice(1)} costs ${costText(cost)}.`;
  if (id === 'cottage') return 'No free corner on your lanes (homes need a gap of one corner).';
  if (id === 'hall') return 'Build a cottage first.';
  return 'No free side touches your lanes.';
}

// ---------------------------------------------------------------- the buttons
function buttons(s) {
  const { v, moves, me, ui } = s, out = [];
  if (!v || me === null) return out;
  const has = t => moves.find(m => m.type === t);
  if (has('roll')) out.push({ id: 'roll', icon: ICON.roll, label: 'Roll the dice', word: 'Roll', key: 'R', move: has('roll'), hot: true });
  const wr = moves.find(m => m.type === 'use' && m.card === 'wrangler');
  if (v.stage === 'roll' && wr) out.push({ id: 'wrangler', icon: ICON.raccoon, label: 'Play a Raccoon Wrangler before you roll', word: 'Wrangler', move: wr });
  if (has('done')) out.push({ id: 'done', icon: ICON.done, label: 'Stop building free lanes', word: 'Done', move: has('done'), hot: true });
  if (v.stage === 'main' && v.turn === me) {
    if (has('trade')) out.push({ id: 'trade', icon: ICON.trade, label: 'Offer a swap to another player', word: 'Swap', key: 'T', run: () => { ui.panel = ui.panel === 'pick' ? null : 'pick'; ui.arm = null; s.rerender(); } });
    out.push({ id: 'carts', icon: ICON.cart, label: 'Swap with the market carts', word: 'Carts', key: 'C', hot: !!v.market && !!has('bank'), run: () => { ui.panel = ui.panel === 'bank' ? null : 'bank'; ui.arm = null; s.rerender(); } });
    if ((v.myFav || []).length) out.push({ id: 'favours', icon: ICON.favour, label: 'Your favour cards', word: String(v.myFav.length), key: 'F', hot: moves.some(m => m.type === 'use'), run: () => { ui.panel = ui.panel === 'favours' ? null : 'favours'; ui.arm = null; s.rerender(); } });
    if (has('end')) out.push({ id: 'end', icon: ICON.end, label: 'End your turn', word: 'End', key: 'E', move: has('end'), hot: !moves.some(m => m.type === 'lane' || m.type === 'home' || m.type === 'hall') });
  }
  return out;
}

// ---------------------------------------------------------------- the words for each beat
const fieldName = (v, h) => { const t = v && v.tiles && v.tiles[h]; return t ? (t.res ? `the ${FIELD[t.res]} (${t.num})` : 'the town') : 'a field'; };
function describe(T, v, b, me) {
  const w = k => who(T, k, me);
  switch (b.kind) {
    case 'start': return 'Welcome to Hearthfield! Put down your first cottages.';
    case 'turn': return null;
    case 'build':
      if (b.what === 'lane') return `${w(b.seat)} ${verb(b.seat, me, 'lay', 'lays')} a ${b.free ? 'free ' : ''}lane.`;
      if (b.what === 'hall') return `${w(b.seat)} ${verb(b.seat, me, 'grow', 'grows')} a cottage into a hall!`;
      return `${w(b.seat)} ${verb(b.seat, me, 'put', 'puts')} down a cottage.`;
    case 'harvest': return `${w(b.seat)} ${verb(b.seat, me, 'gather', 'gathers')} ${cardsText(b.res)} to start.`;
    case 'roll': return b.raid ? `${w(b.seat)} ${verb(b.seat, me, 'roll', 'rolls')} a 7: Raccoon Raid!` : `${w(b.seat)} ${verb(b.seat, me, 'roll', 'rolls')} ${b.sum}.`;
    case 'produce': {
      const got = []; (b.gains || []).forEach((g, k) => { if (sum(g)) got.push(`${w(k)} ${cardsText(g)}`); });
      const blk = b.blocked >= 0 ? ' Rascal sits on a field.' : '';
      return got.length ? `Harvest: ${got.join(', ')}.${blk}` : `Nobody gathers on a ${b.sum}.${blk}`;
    }
    case 'discard': return b.step === 'must' ? `${w(b.seat)} ${verb(b.seat, me, 'hold', 'holds')} too many cards: drop ${b.count}.` : `${w(b.seat)} dropped ${b.count} cards.`;
    case 'raccoon': return `${w(b.seat)} ${verb(b.seat, me, 'shoo', 'shoos')} Rascal to ${fieldName(T.view || v, b.to)}.`;
    case 'nab': return `Rascal nabs a card from ${b.from === me ? 'you' : w(b.from)} for ${b.seat === me ? 'you' : w(b.seat)}!`;
    case 'favour': return `${w(b.seat)} ${verb(b.seat, me, 'buy', 'buys')} a favour card.`;
    case 'use': return `${w(b.seat)} ${verb(b.seat, me, 'play', 'plays')} ${FAV[b.card] ? FAV[b.card].name : 'a card'}!`;
    case 'basket': return `${w(b.seat)} ${verb(b.seat, me, 'unpack', 'unpacks')} a picnic: ${b.res.map(r => NAME[r].toLowerCase()).join(', ')}.`;
    case 'bank': return `${w(b.seat)} ${verb(b.seat, me, 'swap', 'swaps')} ${b.rate} ${NAME[b.give].toLowerCase()} for 1 ${NAME[b.get].toLowerCase()} at the carts.`;
    case 'trade': {
      if (b.step === 'open') return `${w(b.from)} ${verb(b.from, me, 'start', 'starts')} an offer for ${b.to === me ? 'you' : w(b.to)}.`;
      if (b.step === 'cancel') return `${w(b.from)} ${verb(b.from, me, 'drop', 'drops')} the offer.`;
      const deal = `${cardsText(b.give)} for ${cardsText(b.want)}`;
      if (b.step === 'offer') return `${w(b.from)} ${verb(b.from, me, 'offer', 'offers')} ${b.to === me ? 'you' : w(b.to)}: ${deal}.`;
      if (b.step === 'accept') return `Deal! ${w(b.to)} ${verb(b.to, me, 'swap', 'swaps')} with ${b.from === me ? 'you' : w(b.from)}: ${deal}.`;
      if (b.step === 'decline') return `${w(b.to)} ${verb(b.to, me, 'say', 'says')} no thanks.`;
      return null;
    }
    case 'badge':
      if (b.badge === 'parade') return b.seat >= 0 ? `${w(b.seat)} ${verb(b.seat, me, 'lead', 'leads')} the Grand Parade (${b.len} lanes): +2 points!` : 'Nobody leads the Grand Parade now.';
      return `${w(b.seat)} ${verb(b.seat, me, 'are', 'is')} the Critter Keeper (${b.count} wranglers): +2 points!`;
    case 'gameOver': return b.why === 'rounds' ? 'The last round is done! Most points wins.' : `${w(b.winners[0])} ${verb(b.winners[0], me, 'reach', 'reaches')} ${b.totals[b.winners[0]]} points!`;
    default: return null;
  }
}

// ---------------------------------------------------------------- sounds and eyecatches
function moments(b, c) {
  const { play, eye, me, T } = c;
  switch (b.kind) {
    case 'start': case 'deal': play('tg-deal'); break;
    case 'turn': if (me != null && b.seat === me) { if (eye) eye.turn(() => play('tg-yourturn')); else play('tg-yourturn'); } break;
    case 'roll': play('tg-draw'); if (b.raid) { play('tg-ring', 300); if (eye) eye.stamp('Raccoon Raid!', 'Rascal is on the prowl', { color: '#6b6780', sound: () => play('tg-stamp') }); } break;
    case 'produce': if (b.gains && b.gains.some(g => sum(g))) { play('tg-deal', 150); if (me != null && b.gains[me] && sum(b.gains[me])) play('tg-tally', 380); } break;
    case 'harvest': play('tg-deal', 100); break;
    case 'build': play(b.what === 'lane' ? 'tg-tile' : 'tg-lift', 60); if (b.what === 'hall' && eye) eye.stamp('A new hall!', who(T, b.seat, me) + (b.seat === me ? ' grow a hall' : ' grows a hall'), { color: '#4fa45a', sound: () => play('tg-stamp') }); break;
    case 'discard': if (b.step === 'done') play('tg-back'); break;
    case 'raccoon': play('tg-tile', 80); break;
    case 'nab': play('tg-answer', 100); if (eye && (b.from === me || b.seat === me)) eye.ribbon(b.from === me ? 'Rascal nabbed one of your cards!' : 'Rascal nabbed you a card!'); break;
    case 'favour': play('tg-draw', 80); break;
    case 'use': play('tg-ring', 80); if (eye && FAV[b.card]) eye.stamp(FAV[b.card].name + '!', who(T, b.seat, me) + (b.seat === me ? ' play it' : ' plays it'), { color: '#9a6538', sound: () => play('tg-stamp') }); break;
    case 'basket': play('tg-deal', 100); break;
    case 'bank': play('tg-tally', 100); break;
    case 'trade':
      if (b.step === 'offer') { play('tg-ring', 80); if (eye && b.to === me) eye.stamp('A swap offer!', who(T, b.from, me) + ' wants to swap', { color: '#3f6fd9', sound: () => play('tg-stamp') }); }
      else if (b.step === 'accept') { if (eye) eye.stamp('Deal!', who(T, b.to, me) + (b.to === me ? ' swap' : ' swaps'), { color: '#4fa45a', sound: () => play('tg-stamp') }); else play('tg-stamp'); }
      else if (b.step === 'decline') play('tg-back');
      break;
    case 'badge': if (b.seat >= 0) { play('tg-cheer', 100); if (eye) eye.stamp(b.badge === 'parade' ? 'Grand Parade!' : 'Critter Keeper!', who(T, b.seat, me) + ' +2 points', { color: '#f2b630', sound: () => play('tg-stamp') }); } break;
    default: break;
  }
}

// ---------------------------------------------------------------- the end: points, winner first
function overPanel(T, res, me) {
  const box = el('div', 'tg-round over hf-over');
  const v = T.view || {}, totals = (res && res.totals) || v.points || [], win = (res && res.winners) || v.winners || [];
  const names = win.map(k => who(T, k, me));
  const rib = el('div', 'tg-ribbon gold', '', { 'aria-hidden': 'true' }); rib.append(el('b', '', 'Hearthfield'));
  box.append(rib, el('div', 'tg-h', names.length ? `${names.join(' and ')} ${names.length > 1 || names[0] === 'You' ? 'win' : 'wins'}!` : 'Game over'),
    el('p', 'tg-sub', v.why === 'rounds' ? 'The last round was played: most points wins.' : `First to ${v.target || 8} points on their own turn.`));
  const G = v.rows ? geoOf(v.rows) : null;
  const order = totals.map((x, k) => k).sort((a, b) => (win.includes(b) - win.includes(a)) || totals[b] - totals[a] || a - b);
  const list = el('div', 'tg-count hf-score');
  const hdr = el('div', 'hf-srow hf-shead');
  const hic = k => { const s = el('span', 'hf-sico', '', { title: k }); s.innerHTML = ICON[k]; return s; };
  hdr.append(el('span', '', ''), hic('cottage'), hic('hall'), hic('parade'), hic('keeper'), hic('acorn'), el('b', '', 'Pts')); list.append(hdr);
  for (const k of order) {
    const row = el('div', 'tg-crow on hf-srow' + (win.includes(k) ? ' win' : ''));
    row.style.setProperty('--seat', colorOf(T, k));
    const nm = el('span', 'hf-sname'); nm.append(el('i', 'tg-dot'), el('span', 'hf-sn', who(T, k, me)));
    let c = 0, h = 0; if (G && v.own) v.own.forEach((o, x) => { if (o === k) { if (v.hall[x]) h++; else c++; } });
    row.append(nm, el('span', '', String(c)), el('span', '', String(h)), el('span', '', v.parade === k ? '+2' : '-'), el('span', '', v.keeper === k ? '+2' : '-'), el('span', '', v.acorns ? String(v.acorns[k]) : '-'), el('b', 'tg-ctot', String(totals[k] ?? 0)));
    list.append(row);
  }
  box.append(list, el('p', 'tg-note', res && res.counted ? 'On the store window leaderboard.' : 'A bot played, so this one is just for fun (not on the leaderboard).'));
  let done = false;
  box.onShow = () => { if (done) return; done = true; rib.classList.add('in'); LOOK.eye?.confetti(); LOOK.sound?.(me != null && win.includes(me) ? 'tg-fanfare' : 'tg-cheer'); };
  return box;
}

// ---------------------------------------------------------------- the rules card
function rulesCard() {
  const c = el('div', 'tg-rules hf-rules');
  c.append(el('div', 'tg-h', 'Hearthfield'));
  const row = (pic, text) => { const r = el('div', 'tg-rrow'); const p = el('div', 'tg-rpic'); p.innerHTML = pic; r.append(p, el('p', '', text)); c.append(r); };
  const ic = k => `<span class="hf-rico">${ICON[k]}</span>`;
  const rs = r => `<span class="hf-rico" style="background:${FILL[r]}">${resSvg(r)}</span>`;
  row(rs('timber') + rs('clay') + rs('wool') + rs('berries') + rs('stone'), 'The meadow round Breneland town has five kinds of field: Whisper Woods (timber), Clay Banks, Woolly Hills, Berry Patches and Pebble Quarries.');
  row(ic('cottage') + ic('lane'), 'To start, each player puts down a cottage on a corner and a lane beside it, twice (the order snakes back). Your second cottage gives you one card from each field round it.');
  row(ic('roll'), 'Roll two dice. Every field showing that number gives a card to each cottage on its corners (a hall gets 2).');
  row(ic('lane') + ic('cottage') + ic('hall'), 'Build: a Lane (timber + clay) from your lanes or homes. A Cottage (timber, clay, wool, berries) on a free corner on your lanes, never right next to another home: 1 point. A Hall (clay, 2 berries, 2 stone) grows a cottage: 2 points. Tap a chip, then a glowing spot.');
  row(ic('raccoon'), 'Roll a 7: Raccoon Raid! Anyone with 9 or more cards drops half. Then move Rascal to a field: it gives nothing while he sits there, and he nabs a card from someone with a home beside it.');
  row(ic('favour'), 'Favour cards (wool, berries, stone): Raccoon Wrangler (move Rascal and nab), Busy Beavers (2 free lanes), Picnic Basket (3 different cards), Market Day (carts swap 2 for 1), Golden Acorn (a hidden point). One a turn, not the turn you buy it.');
  row(ic('cart') + ic('trade'), 'Swap 4 of a kind for 1 at the carts. A cart beside your home does 3:1 (any) or 2:1 (its kind). On your turn you can offer a swap to a player: they say Deal or No thanks.');
  row(ic('parade') + ic('keeper'), 'Badges, 2 points each: Grand Parade for the longest run of 5+ lanes, Critter Keeper for playing 3+ Wranglers (most).');
  row(ic('end'), 'First to the target on their own turn wins: Quick 6, Standard 8, Long 10 points.');
  return c;
}

const ui = {
  id: 'hearthfield',
  lid: 'meadow building for 3 or 4',
  tip: 'Roll for cards, build lanes and cottages. Tap a build chip, then a glowing spot.',
  render(board, hand, s) { remember(s); renderBoard(board, s); renderHand(hand, s); },
  buttons,
  chip(T, v, k) {
    if (!v || !v.points) return null;
    const extra = [];
    if (v.parade === k) { const b = el('span', 'hf-chipb', '', { title: 'Grand Parade' }); b.innerHTML = ICON.parade; extra.push(b); }
    if (v.keeper === k) { const b = el('span', 'hf-chipb', '', { title: 'Critter Keeper' }); b.innerHTML = ICON.keeper; extra.push(b); }
    if (v.favs && v.favs[k]) { const b = el('span', 'hf-chipf', '', { title: v.favs[k] + ' favour cards' }); b.innerHTML = ICON.favour; b.append(el('small', '', String(v.favs[k]))); extra.push(b); }
    if (v.cards) { const c = el('span', 'hf-chipc', '', { title: v.cards[k] + ' cards in hand' }); c.innerHTML = CARDS_ICON; c.append(el('small', '', String(v.cards[k]))); extra.unshift(c); }
    return { score: v.points[k], extra };
  },
  pill(T, v) { if (!v || !v.target) return null; if (v.stage === 'setupHome' || v.stage === 'setupLane') return `Setup - first to ${v.target}`; return `Round ${v.round} - first to ${v.target}`; },
  describe,
  moments,
  overPanel,
  rulesCard,
  setupLine(settings, n) {
    const t = { quick: 6, standard: 8, long: 10 }[settings && settings.length] || 8;
    const bits = [`First to ${t} points`, settings && settings.board === 'starter' ? 'the starter meadow' : 'a new meadow', settings && settings.trades === false ? 'no swaps between players' : 'swaps on'];
    if (settings && (settings.gentle === true || settings.gentle === 'true')) bits.push('gentle Rascal');
    return `${bits.join(', ')}. For ${Math.max(3, Math.min(4, n || 3))} players.`;
  },
  onKey(code, s) {
    const m = t => (s.moves || []).find(x => x.type === t);
    const go = t => { const x = m(t); if (x) { s.send(x); return true; } return false; };
    const tog = p => { s.ui.panel = s.ui.panel === p ? null : p; s.ui.arm = null; s.rerender(); return true; };
    if (code === 'KeyR' || code === 'Space') return go('roll') || go('done');
    if (code === 'KeyE' || code === 'Enter') return go('end') || go('roll') || go('send');
    if (code === 'KeyA') return go('accept');
    if (code === 'KeyD') return go('decline');
    if (code === 'KeyT' && m('trade')) return tog('pick');
    if (code === 'KeyC' && s.v && s.v.stage === 'main' && s.v.turn === s.me) return tog('bank');
    if (code === 'KeyF' && s.v && (s.v.myFav || []).length && s.v.stage === 'main') return tog('favours');
    const arm = t => { if (!m(t)) return false; s.ui.arm = s.ui.arm === t ? null : t; s.ui.panel = null; s.rerender(); return true; };
    if (code === 'KeyL') return arm('lane');
    if (code === 'KeyH') return arm('home');
    if (code === 'KeyG') return arm('hall');
    if (code === 'Escape' && (s.ui.panel || s.ui.arm)) { s.ui.panel = null; s.ui.arm = null; s.rerender(); return true; }
    return false;
  },
  css: `
.tg-hearthfield .tg-boardwrap { background: #cfe8b4; }
.tg-hearthfield .hf-wrap { position: absolute; inset: 0; font-family: Fredoka, sans-serif; color: #2b2340; }
.tg-hearthfield .hf-meadow { position: absolute; left: 0; top: 0; }
.tg-hearthfield .hf-svg { display: block; }
.tg-hearthfield .hf-prompt { position: absolute; top: 3px; height: 24px; display: flex; align-items: center; gap: 6px; padding: 0 10px; box-sizing: border-box; background: #fff8ec; border: 2px solid #2b2340; border-radius: 12px; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; z-index: 2; }
.tg-hearthfield .hf-prompt > span:not(.hf-cost) { overflow: hidden; text-overflow: ellipsis; }
.tg-hearthfield .hf-prompt.mine { background: #fff1b8; }
.tg-hearthfield .hf-prompt.side { position: static; flex: 0 0 auto; height: auto; min-height: 30px; white-space: normal; line-height: 1.12; padding: 3px 7px; font-size: 13px; flex-wrap: nowrap; align-items: center; }
.tg-hearthfield .hf-prompt.side > span { white-space: normal; }
.tg-hearthfield .hf-prompt.side .hf-cost { margin-left: 0; }
.tg-hearthfield .hf-prompt .tg-dot { flex: 0 0 auto; }
.tg-hearthfield .hf-cost { margin-left: auto; flex: 0 0 auto; }
.tg-hearthfield .hf-cards { display: inline-flex; gap: 2px; align-items: center; flex-wrap: wrap; }
.tg-hearthfield .hf-rc { display: inline-flex; align-items: center; gap: 1px; padding: 1px 4px 1px 1px; border: 2px solid #2b2340; border-radius: 10px; background: var(--res); font-size: 14px; line-height: 1; }
.tg-hearthfield .hf-rc.small { font-size: 12px; border-width: 1.5px; padding: 0 3px 0 0; }
.tg-hearthfield .hf-ri { width: 22px; height: 22px; display: block; }
.tg-hearthfield .hf-rc.small .hf-ri { width: 16px; height: 16px; }
.tg-hearthfield .hf-ri svg, .tg-hearthfield .hf-pico svg, .tg-hearthfield .hf-bico svg, .tg-hearthfield .hf-cico svg, .tg-hearthfield .hf-bcico svg, .tg-hearthfield .hf-fico svg, .tg-hearthfield .hf-sico svg, .tg-hearthfield .hf-chipb svg, .tg-hearthfield .hf-chipf svg, .tg-hearthfield .hf-rico svg { width: 100%; height: 100%; display: block; }
.tg-hearthfield .hf-spot { position: absolute; z-index: 3; padding: 0; margin: 0; border-radius: 50%; border: 3px solid #2b2340; background: rgba(255, 211, 77, .75); box-shadow: 0 0 0 3px #fff8ec; animation: hf-glow 1.1s ease-in-out infinite; cursor: pointer; }
.tg-hearthfield .hf-spot.side { background: rgba(255, 248, 236, .85); }
.tg-hearthfield .hf-spot.many { border: 0; box-shadow: none; background: transparent; animation: none; }
.tg-hearthfield .hf-spot.many::after { content: ''; position: absolute; left: 50%; top: 50%; width: 11px; height: 11px; margin: -7.5px 0 0 -7.5px; border-radius: 50%; background: #ffd34d; border: 2px solid #2b2340; animation: hf-glow 1.1s ease-in-out infinite; }
.tg-hearthfield .hf-spot.many:hover::after, .tg-hearthfield .hf-spot.many:focus-visible::after { width: 17px; height: 17px; margin: -10.5px 0 0 -10.5px; }
.tg-hearthfield .hf-spot.field { background: rgba(255, 211, 77, .28); border-style: dashed; box-shadow: none; }
.tg-hearthfield .hf-spot:hover, .tg-hearthfield .hf-spot:focus-visible { background: #ffd34d; outline: none; }
@keyframes hf-glow { 0%, 100% { transform: scale(.88); } 50% { transform: scale(1.05); } }
.tg-hearthfield .hf-ping { position: absolute; z-index: 2; border-radius: 50%; border: 3px solid #fff8ec; pointer-events: none; animation: hf-ping 1.2s ease-out 2; }
@keyframes hf-ping { 0% { transform: scale(.4); opacity: 1; } 100% { transform: scale(1.8); opacity: 0; } }
.tg-hearthfield .hf-info { position: absolute; display: flex; gap: 6px; align-items: center; z-index: 1; }
.tg-hearthfield .hf-info.col { flex-direction: column; align-items: stretch; justify-content: flex-start; gap: 7px; }
.tg-hearthfield .hf-info.row { justify-content: center; }
.tg-hearthfield .hf-dice { display: flex; gap: 5px; align-items: center; justify-content: center; position: relative; }
.tg-hearthfield .hf-die { display: block; width: 34px; height: 34px; filter: drop-shadow(0 3px 0 rgba(43,35,64,.75)); }
.tg-hearthfield .hf-info.col .hf-die { width: 40px; height: 40px; }
.tg-hearthfield .hf-die svg { width: 100%; height: 100%; }
.tg-hearthfield .hf-die.idle { opacity: .55; }
.tg-hearthfield .hf-die.fresh { animation: hf-roll .55s cubic-bezier(.3,1.4,.5,1); }
@keyframes hf-roll { 0% { transform: translateY(-26px) rotate(-200deg) scale(.7); opacity: .3; } 70% { transform: translateY(3px) rotate(10deg); opacity: 1; } 100% { transform: none; } }
.tg-hearthfield .hf-raid { position: absolute; left: 26px; top: -12px; padding: 0 5px; font-size: 12px; font-weight: 700; color: #fff8ec; background: #6b6780; border: 2px solid #2b2340; border-radius: 8px; transform: rotate(8deg); }
.tg-hearthfield .hf-badge { display: flex; align-items: center; gap: 5px; padding: 3px 6px; background: rgba(255,248,236,.7); border: 2px solid #d9cdb4; border-radius: 10px; min-width: 0; }
.tg-hearthfield .hf-badge.held { background: #fff8ec; border-color: #2b2340; }
.tg-hearthfield .hf-bico { flex: 0 0 auto; width: 26px; height: 26px; display: block; }
.tg-hearthfield .hf-btxt { display: flex; flex-direction: column; line-height: 1.05; min-width: 0; }
.tg-hearthfield .hf-btxt b { font-size: 12px; white-space: nowrap; }
.tg-hearthfield .hf-btxt small { font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 3px; white-space: nowrap; overflow: hidden; }
.tg-hearthfield .hf-btxt .tg-dot { width: 9px; height: 9px; }
.tg-hearthfield .hf-info.row .hf-badge { padding: 2px 5px; }
.tg-hearthfield .hf-info.row .hf-btxt b { font-size: 11px; }
.tg-hearthfield .hf-deck { display: flex; align-items: center; justify-content: center; gap: 2px; font-size: 15px; margin-left: 4px; }
.tg-hearthfield .hf-deck .hf-bico { width: 24px; height: 24px; }
/* the hand */
.tg-hearthfield .hf-hand { position: absolute; inset: 3px 4px; display: flex; align-items: center; gap: 8px; }
.tg-hearthfield .hf-hcards { flex: 1 1 auto; min-width: 0; display: flex; gap: 4px; justify-content: flex-start; height: 100%; align-items: center; }
.tg-hearthfield .hf-card { position: relative; flex: 0 1 50px; min-width: 34px; height: min(100%, 76px); padding: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; background: var(--res); border: 2.5px solid #2b2340; border-radius: 9px; box-shadow: 0 3px 0 rgba(43,35,64,.85); color: #2b2340; font-family: Fredoka, sans-serif; box-sizing: border-box; }
.tg-hearthfield .hf-card.none { opacity: .42; box-shadow: none; }
.tg-hearthfield .hf-card.tap { animation: hf-wig 1s ease-in-out infinite; cursor: pointer; }
@keyframes hf-wig { 0%, 100% { transform: rotate(-2deg); } 50% { transform: rotate(2deg) translateY(-2px); } }
.tg-hearthfield .hf-cico { width: 70%; max-width: 32px; aspect-ratio: 1; display: block; }
.tg-hearthfield .hf-cn { font-size: 18px; line-height: 1; background: #fff8ec; border: 2px solid #2b2340; border-radius: 9px; padding: 0 5px; }
.tg-hearthfield .hf-builds { flex: 0 0 auto; display: flex; gap: 4px; height: 100%; align-items: center; }
.tg-hearthfield .hf-bchip { flex: 0 0 auto; width: 46px; height: min(100%, 70px); padding: 2px 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border: 2.5px solid #2b2340; border-radius: 10px; background: #fff8ec; box-shadow: 0 3px 0 rgba(43,35,64,.85); box-sizing: border-box; cursor: pointer; }
.tg-hearthfield .hf-bchip.off { opacity: .5; box-shadow: none; }
.tg-hearthfield .hf-bchip.armed { background: #ffd34d; transform: translateY(-3px); box-shadow: 0 0 0 3px #fff8ec, 0 4px 0 rgba(43,35,64,.85); }
.tg-hearthfield .hf-bcico { width: 28px; height: 28px; display: block; }
.tg-hearthfield .hf-bcost { display: flex; flex-wrap: wrap; justify-content: center; gap: 1px; max-width: 40px; }
.tg-hearthfield .hf-bcost i { display: block; width: 7px; height: 7px; border: 1.2px solid #2b2340; border-radius: 2px; }
.tg-hearthfield.portrait .hf-hand { gap: 5px; }
.tg-hearthfield.portrait .hf-hcards { gap: 3px; }
.tg-hearthfield.portrait .hf-card { flex-basis: 40px; min-width: 32px; }
.tg-hearthfield.portrait .hf-cn { font-size: 15px; padding: 0 3px; }
.tg-hearthfield.portrait .hf-bchip { width: 38px; }
.tg-hearthfield.portrait .hf-bcico { width: 24px; height: 24px; }
.tg-hearthfield.portrait .hf-bcost i { width: 6px; height: 6px; }
.tg-hearthfield[data-form="phone"] .hf-card { height: min(100%, 64px); }
.tg-hearthfield[data-form="pc"] .hf-card { flex-basis: 64px; height: min(100%, 100px); }
.tg-hearthfield[data-form="pc"] .hf-cico { max-width: 44px; }
.tg-hearthfield[data-form="pc"] .hf-cn { font-size: 22px; }
.tg-hearthfield[data-form="pc"] .hf-bchip { width: 62px; height: min(100%, 92px); }
.tg-hearthfield[data-form="pc"] .hf-bcico { width: 38px; height: 38px; }
.tg-hearthfield[data-form="pc"] .hf-bcost i { width: 9px; height: 9px; }
.tg-hearthfield[data-form="pc"] .hf-bcost { max-width: 56px; }
/* panels over the board */
.tg-hearthfield .hf-shade { position: absolute; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; padding: 6px; box-sizing: border-box; background: rgba(43,35,64,.34); border-radius: 8px; }
.tg-hearthfield .hf-panel { width: 100%; max-width: 480px; max-height: 100%; box-sizing: border-box; display: flex; flex-direction: column; background: #fff8ec; border: 3px solid #2b2340; border-radius: 12px; box-shadow: 0 4px 0 rgba(43,35,64,.85); overflow: hidden; animation: tg-pop .3s cubic-bezier(.3,1.6,.5,1); }
.tg-hearthfield .hf-phead { flex: 0 0 auto; display: flex; align-items: center; gap: 7px; padding: 3px 10px; min-height: 28px; background: #f3e3c3; border-bottom: 2.5px solid #2b2340; font-size: 15px; }
.tg-hearthfield .hf-phead b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tg-hearthfield .hf-pico { flex: 0 0 auto; width: 24px; height: 24px; display: block; }
.tg-hearthfield .hf-pfoot { flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px; padding: 4px 8px 6px; border-top: 2px dashed #d9cdb4; }
.tg-hearthfield .hf-pbtn { display: inline-flex; align-items: center; gap: 4px; min-height: 40px; padding: 0 12px 0 8px; border: 2.5px solid #2b2340; border-radius: 22px; background: #fff8ec; color: #2b2340; box-shadow: 0 3px 0 rgba(43,35,64,.85); font-family: Fredoka, sans-serif; cursor: pointer; }
.tg-hearthfield .hf-pbtn:active { transform: translateY(2px); box-shadow: 0 1px 0 rgba(43,35,64,.85); }
.tg-hearthfield .hf-pbtn.hot { background: #ffd34d; }
.tg-hearthfield .hf-pbtn.off { opacity: .55; }
.tg-hearthfield .hf-pword { display: flex; flex-direction: column; align-items: center; line-height: 1.02; }
.tg-hearthfield .hf-pword b { font-size: 16px; }
.tg-hearthfield .hf-pword small { font-size: 11px; font-weight: 600; }
.tg-hearthfield .hf-pwait { margin: 4px; font-size: 14px; font-weight: 600; color: #6b5e52; }
.tg-hearthfield .hf-pnote { margin: 2px 10px 4px; font-size: 13px; text-align: center; color: #6b5e52; }
.tg-hearthfield .hf-picklist { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; padding: 8px; }
.tg-hearthfield .hf-pickp { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px 0 10px; border: 2.5px solid #2b2340; border-radius: 22px; background: #e6f2ff; color: #2b2340; box-shadow: 0 3px 0 rgba(43,35,64,.85); font: 600 16px Fredoka, sans-serif; cursor: pointer; }
.tg-hearthfield .hf-pickp small { font-size: 13px; color: #6e4224; font-weight: 700; }
.tg-hearthfield .hf-tgrid { display: flex; flex-direction: column; gap: 8px; padding: 10px 6px 2px; }
.tg-hearthfield .hf-trow { gap: 6px; }
.tg-hearthfield .hf-trow, .tg-hearthfield .hf-brow { display: flex; align-items: center; justify-content: center; gap: 3px; }
.tg-hearthfield .hf-brow { padding: 5px 6px 0; gap: 5px; }
.tg-hearthfield .hf-tlab { flex: 0 0 auto; width: 46px; font-size: 13px; line-height: 1; text-align: right; }
.tg-hearthfield .hf-tcell { position: relative; display: flex; align-items: center; padding: 1px; border-radius: 12px; }
.tg-hearthfield .hf-tadd { padding: 0; border: 0; background: none; cursor: pointer; font-family: Fredoka, sans-serif; }
.tg-hearthfield .hf-tadd:disabled { opacity: .35; cursor: default; }
.tg-hearthfield .hf-tadd .hf-rc { min-width: 46px; height: 32px; box-sizing: border-box; justify-content: center; box-shadow: 0 2px 0 rgba(43,35,64,.8); }
.tg-hearthfield .hf-tcell.on .hf-tadd .hf-rc { box-shadow: 0 0 0 2px #ffd34d, 0 2px 0 rgba(43,35,64,.8); }
.tg-hearthfield .hf-tminus { position: absolute; left: -7px; top: -7px; width: 22px; height: 22px; padding: 0; border: 2px solid #2b2340; border-radius: 50%; background: #ffb3a8; font: 700 15px/1 Fredoka, sans-serif; color: #2b2340; cursor: pointer; z-index: 1; }
.tg-hearthfield .hf-tcell.on { background: #fff1b8; }
.tg-hearthfield .hf-tcell .hf-rc { padding-right: 3px; }
.tg-hearthfield .hf-tcell .hf-ri { width: 20px; height: 20px; }
.tg-hearthfield .hf-tstep { width: 22px; height: 30px; padding: 0; border: 2px solid #2b2340; border-radius: 9px; background: #fff8ec; font: 700 16px Fredoka, sans-serif; color: #2b2340; cursor: pointer; }
.tg-hearthfield .hf-tstep:disabled { opacity: .3; }
.tg-hearthfield .hf-tdeal { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 8px; }
.tg-hearthfield .hf-tside { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 14px; }
.tg-hearthfield .hf-tarrow { width: 26px; height: 26px; display: block; }
.tg-hearthfield .hf-tarrow svg { width: 100%; height: 100%; }
.tg-hearthfield .hf-bres { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 3px 3px 2px; min-width: 44px; border: 2.5px solid #2b2340; border-radius: 12px; background: #fff8ec; font: 700 12px Fredoka, sans-serif; color: #2b2340; cursor: pointer; }
.tg-hearthfield .hf-bres.on { background: #ffd34d; transform: translateY(-2px); }
.tg-hearthfield .hf-bres:disabled { opacity: .35; cursor: default; }
.tg-hearthfield .hf-bres .hf-rc { padding: 1px; }
.tg-hearthfield .hf-flist { display: flex; flex-direction: column; gap: 4px; padding: 6px; overflow-y: auto; min-height: 0; }
.tg-hearthfield .hf-fcard { display: flex; align-items: center; gap: 7px; padding: 4px 6px; border: 2px solid #2b2340; border-radius: 10px; background: #fff1b8; }
.tg-hearthfield .hf-fcard.new { background: #f3e3c3; }
.tg-hearthfield .hf-fico { flex: 0 0 auto; width: 30px; height: 30px; display: block; }
.tg-hearthfield .hf-ftxt { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.1; }
.tg-hearthfield .hf-ftxt b { font-size: 15px; }
.tg-hearthfield .hf-ftxt small { font-size: 12px; color: #4b4060; }
.tg-hearthfield .hf-fwhy { flex: 0 0 auto; font-size: 12px; font-weight: 700; color: #6b5e52; }
.tg-hearthfield .hf-fcard .hf-pbtn { min-height: 34px; }
.tg-hearthfield[data-form="phone"] .hf-phead { min-height: 24px; padding: 1px 8px; font-size: 14px; }
.tg-hearthfield[data-form="phone"] .hf-pbtn { min-height: 34px; }
.tg-hearthfield[data-form="phone"] .hf-pfoot { padding: 2px 6px 3px; }
.tg-hearthfield[data-form="phone"] .hf-tgrid { gap: 2px; padding-top: 3px; }
.tg-hearthfield[data-form="phone"] .hf-tstep { height: 26px; }
/* the chips and the end card */
.tg-hearthfield .hf-chipb { display: inline-block; width: 18px; height: 18px; }
.tg-hearthfield .hf-chipc { display: inline-flex; align-items: center; height: 18px; font-size: 12px; font-weight: 700; }
.tg-hearthfield .hf-chipc svg { width: 17px; height: 17px; }
.tg-hearthfield .hf-chipf { display: inline-flex; align-items: center; height: 18px; font-size: 11px; font-weight: 700; }
.tg-hearthfield .hf-chipf svg { width: 16px; height: 16px; }
.tg-hearthfield .hf-score .hf-srow { display: grid; grid-template-columns: 1.8fr repeat(5, .7fr) .8fr; align-items: center; gap: 4px; text-align: center; }
.tg-hearthfield .hf-shead { padding: 0 10px; }
.tg-hearthfield .hf-sico { width: 20px; height: 20px; margin: 0 auto; display: block; }
.tg-hearthfield .hf-sname { display: inline-flex; align-items: center; gap: 5px; min-width: 0; text-align: left; }
.tg-hearthfield .hf-sn { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tg-hearthfield .hf-rules .tg-rpic { display: flex; gap: 2px; align-items: center; flex-wrap: wrap; max-width: 92px; }
.tg-hearthfield .hf-rico { display: inline-block; width: 28px; height: 28px; border-radius: 7px; }
/* portrait phone: many buttons drop their words so the row never wraps */
.tg-hearthfield.portrait .tg-acts:has(> .tg-act:nth-child(6)) .tg-act-word { display: none; }
.tg-hearthfield.portrait .tg-acts:has(> .tg-act:nth-child(6)) .tg-act:has(.tg-act-word) { width: 42px; min-width: 0; padding: 0; border-radius: 50%; justify-content: center; }
.tg-hearthfield .tg-act:has(.tg-act-word) { width: auto; min-width: 52px; padding: 0 12px 0 8px; border-radius: 26px; display: inline-flex; gap: 5px; font-size: 15px; font-weight: 700; color: #2b2340; white-space: nowrap; }
.tg-hearthfield .tg-act .tg-ico { width: 26px; height: 26px; }
.tg-hearthfield.portrait .tg-acts { flex-wrap: nowrap; }
`,
};
// the last build pings on the board for a moment (from the beats the view does not carry: compare with the last view)
function remember(s) {
  const v = s.v; if (!v || !v.own) return;
  const prev = s.ui.prev;
  if (prev && prev.own) {
    for (let x = 0; x < v.own.length; x++) if (v.own[x] >= 0 && (prev.own[x] !== v.own[x] || prev.hall[x] !== v.hall[x])) { s.ui.lastAt = { what: 'home', at: x, t: Date.now() }; setTimeout(() => s.rerender(), 2500); }
    for (let e = 0; e < v.lanes.length; e++) if (v.lanes[e] >= 0 && prev.lanes[e] !== v.lanes[e]) { s.ui.lastAt = { what: 'lane', at: e, t: Date.now() }; setTimeout(() => s.rerender(), 2500); }
  }
  s.ui.prev = { own: v.own.slice(), hall: v.hall.slice(), lanes: v.lanes.slice() };
}
export default ui;
