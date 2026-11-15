// Town Tycoon, the engine. An original property-trading board game set in Breneland: a loop of 28 spaces, streets in colour
// pairs, cottages and shops, two card decks (Lucky Find, Town Notice), the Lost in the Woods corner. Pure: its one import is its
// own bot. A game is settings + seed + moves, so a save is a replay.
//
//   newGame({ players, settings, seed }) -> state
//   legalMoves(state, seat) -> [move]          (every move is listed; no check())
//   apply(state, seat, move) -> { state, beats }
//   view(state, seat) -> what that seat may see (the dice rng and the deck order are never in it)
//   score(state) -> { totals (net worth), order, winners, done }
//
// A turn: roll, move, resolve the space (buy or skip a free property, rent, a card, the fund), then build / sell / mortgage /
// unmortgage, then end. Doubles roll again; three doubles in a turn and you are Lost in the Woods. Owing more than you can
// raise is bankrupt. No auctions and no trades in this version.
import { chooseMove } from './town-tycoon-bot.js';

export const ID = 'town-tycoon';
export const NAME = 'Town Tycoon';
export const SEATS = [2, 4];
export const SIZE = 28;
export const START_SPACE = 0, WOODS = 7, PICNIC = 14, WRONG = 21;
export const PASS_PAY = 200;      // collected passing (or landing on) Town Square
export const WOODS_FEE = 50;      // pay to walk out of the woods
export const WOODS_TRIES = 3;     // tries for a double, then you pay and walk
export const FUND = 100;          // the Dog Treat Fund
export const ROUNDS = { quick: 15, full: 60 }; // quick: richest after 15 rounds; full: last one standing (60 rounds at most)
export const TRANSIT_RENT = [0, 25, 60];      // by how many transit spaces the owner holds
export const TOOL_RATE = 6;                   // Tool Crib Rentals: the dice x this

export const DWELL = {
  turn: 300, roll: 900, move: 900, buy: 1100, skip: 500, rent: 1300, card: 2200, tax: 1100, build: 700, sell: 700,
  mortgage: 700, unmortgage: 700, woods: 1500, owe: 1400, bankrupt: 2500, pass: 700, gameOver: 9000,
};

export const SETTINGS = [
  { key: 'length', kind: 'choice', label: 'Length', default: 'quick', options: [
    { value: 'quick', label: 'Quick: 15 rounds, the richest wins' },
    { value: 'full', label: 'Full: last one standing (60 rounds at most)' },
  ] },
  { key: 'start', kind: 'choice', label: 'Starting cash', default: '1500', options: [
    { value: '1500', label: 'B1500' },
    { value: '1000', label: 'B1000 (tighter)' },
  ] },
];

// ---- the board. group: a colour pair (0..7); rents: [no cottage, 1, 2, 3, 4 cottages, shop]; build: one cottage's cost
export const GROUPS = [
  { name: 'Brown', color: '#9a6538', build: 50 },
  { name: 'Sky', color: '#7fc8f8', build: 50 },
  { name: 'Pink', color: '#ff8fb8', build: 100 },
  { name: 'Orange', color: '#f0862f', build: 100 },
  { name: 'Red', color: '#e0463c', build: 150 },
  { name: 'Yellow', color: '#ffd34d', build: 150 },
  { name: 'Green', color: '#4fa45a', build: 200 },
  { name: 'Blue', color: '#3f6fd9', build: 200 },
];
const st = (name, short, group, price, rents) => ({ kind: 'street', name, short, group, price, rents });
export const BOARD = [
  { kind: 'start', name: 'Town Square', short: 'Town Square' },
  st('Maple Ave', 'Maple Ave', 0, 60, [4, 20, 55, 150, 220, 300]),
  { kind: 'lucky', name: 'Lucky Find', short: 'Lucky Find' },
  st('Acorn Way', 'Acorn Way', 0, 70, [5, 25, 65, 170, 240, 320]),
  st('Pier Walk', 'Pier Walk', 1, 100, [7, 35, 95, 260, 360, 460]),
  { kind: 'tax', name: 'Dog Treat Fund', short: 'Dog Treat Fund', price: FUND },
  st('Bait Shop Row', 'Bait Shop Row', 1, 110, [8, 40, 105, 280, 380, 480]),
  { kind: 'woods', name: 'Lost in the Woods', short: 'Lost in the Woods' },
  st('Strickler Park Lane', 'Strickler Park', 2, 140, [10, 50, 140, 380, 480, 580]),
  { kind: 'tool', name: 'Tool Crib Rentals', short: 'Tool Crib', price: 140 },
  st('Duck Pond Path', 'Duck Pond', 2, 150, [11, 55, 150, 400, 500, 600]),
  { kind: 'transit', name: 'Bus Route 7', short: 'Bus Route 7', price: 180 },
  st('Angell St', 'Angell St', 3, 180, [14, 70, 190, 480, 600, 720]),
  st('Bakery Corner', 'Bakery Corner', 3, 190, [15, 75, 200, 500, 620, 740]),
  { kind: 'picnic', name: 'Picnic Break', short: 'Picnic Break' },
  st('Lake Rufallia Shore', 'Lake Rufallia', 4, 220, [18, 90, 240, 600, 720, 840]),
  { kind: 'notice', name: 'Town Notice', short: 'Town Notice' },
  st('Boathouse Bend', 'Boathouse Bend', 4, 230, [19, 95, 250, 620, 740, 860]),
  st('Summit Rd', 'Summit Rd', 5, 260, [21, 105, 290, 680, 820, 950]),
  { kind: 'lucky', name: 'Lucky Find', short: 'Lucky Find' },
  st('Lookout Point', 'Lookout Point', 5, 270, [22, 110, 300, 700, 840, 980]),
  { kind: 'wrong', name: 'Wrong Turn!', short: 'Wrong Turn!' },
  st('Breneland Rd', 'Breneland Rd', 6, 300, [25, 125, 340, 780, 930, 1080]),
  st('Market Square', 'Market Square', 6, 310, [26, 130, 350, 800, 950, 1100]),
  { kind: 'transit', name: 'Mail Van Run', short: 'Mail Van Run', price: 180 },
  { kind: 'notice', name: 'Town Notice', short: 'Town Notice' },
  st('Water Tower Hill', 'Water Tower Hill', 7, 340, [28, 140, 380, 860, 1020, 1180]),
  st('Clocktower Plaza', 'Clocktower Plaza', 7, 380, [32, 160, 420, 940, 1100, 1260]),
];
BOARD.forEach((b, i) => { b.i = i; });
export const OWNABLE = BOARD.filter(b => b.price && b.kind !== 'tax').map(b => b.i);
export const GROUP_SPACES = GROUPS.map((g, k) => BOARD.filter(b => b.kind === 'street' && b.group === k).map(b => b.i));
const TRANSITS = BOARD.filter(b => b.kind === 'transit').map(b => b.i);
const ownable = i => BOARD[i] && !!BOARD[i].price && BOARD[i].kind !== 'tax';
export const mortValue = i => Math.floor(BOARD[i].price / 2);
export const unmortCost = i => Math.ceil(BOARD[i].price / 2 * 1.1);
export const buildCost = i => (BOARD[i].kind === 'street' ? GROUPS[BOARD[i].group].build : 0);

// ---- the cards (your own text; effect: money (+ collect / - pay), to (a space), back, nearest ('transit'), woods, map,
// repairs [per cottage, per shop])
export const CARDS = {
  lucky: [
    { text: 'Your dog finds a lost wallet and the owner says thanks - collect B50.', money: 50 },
    { text: 'You win the pie contest at the fair - collect B100.', money: 100 },
    { text: 'Hop on the next town bus - ride to the nearest Bus Route or Mail Van stop.', nearest: 'transit' },
    { text: 'A tailwind on your bike - zoom to Town Square and collect B200.', to: 0 },
    { text: 'Your lemonade stand sells out - collect B40.', money: 40 },
    { text: 'Your kite is stuck on the water tower - pay B30 to the climbing crew.', money: -30 },
    { text: 'Catch a ride on the Mail Van to Water Tower Hill.', to: 26 },
    { text: 'A shortcut that was not short - go back 3 spaces.', back: 3 },
    { text: 'You find a trail map! Keep it: it walks you out of Lost in the Woods.', map: true },
    { text: 'A birthday card from the Town Hall - collect B25.', money: 25 },
  ],
  notice: [
    { text: 'Street sweeping day - pay B15 for each cottage and B60 for each shop you own.', repairs: [15, 60] },
    { text: 'Your library book is overdue - pay B20.', money: -20 },
    { text: 'You follow the wrong trail - you are Lost in the Woods. Do not pass Town Square.', woods: true },
    { text: 'You win the town picnic raffle - collect B60.', money: 60 },
    { text: 'Your dog dug under the fence - pay B50 to fix it.', money: -50 },
    { text: 'Take a stroll to Strickler Park Lane.', to: 8 },
    { text: 'The Town Hall sends a refund - collect B80.', money: 80 },
    { text: 'Bake sale for the school - pay B25.', money: -25 },
    { text: 'A ranger hands you a trail map! Keep it: it walks you out of Lost in the Woods.', map: true },
    { text: 'Go for a swim at Lake Rufallia Shore.', to: 15 },
  ],
};

// ---- small helpers
function seed32(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed ?? '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
// mulberry32, its state kept in the game state so the dice and shuffles replay
function rand(S) {
  S.rng = (S.rng + 0x6d2b79f5) >>> 0;
  let t = S.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const die = S => 1 + Math.floor(rand(S) * 6);
function shuffled(S, n) {
  const a = []; for (let i = 0; i < n; i++) a.push(i);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(S) * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; }
  return a;
}

function normSettings(s = {}) {
  return {
    length: Object.prototype.hasOwnProperty.call(ROUNDS, s.length) ? s.length : 'quick',
    start: s.start === '1000' ? '1000' : '1500',
  };
}

function clone(S) {
  return {
    ...S,
    settings: { ...S.settings },
    cash: S.cash.slice(), pos: S.pos.slice(), alive: S.alive.slice(), woods: S.woods.slice(), out: S.out.slice(),
    maps: S.maps.map(m => m.slice()), owner: S.owner.slice(), lvl: S.lvl.slice(), mort: S.mort.slice(),
    decks: { lucky: S.decks.lucky.slice(), notice: S.decks.notice.slice() },
    dice: S.dice && S.dice.slice(), debt: S.debt && { ...S.debt }, last: S.last && { ...S.last },
  };
}

const beat = (beats, kind, data) => { beats.push({ kind, dwell: DWELL[kind], ...data }); };
function illegal(msg) { const e = new Error('Town Tycoon: ' + msg); e.illegal = true; return e; }

// ---- the game
export function newGame({ players, settings, seed } = {}) {
  const n = Array.isArray(players) ? players.length : Math.floor(Number(players));
  if (!(n >= SEATS[0] && n <= SEATS[1])) throw new Error('Town Tycoon is for 2 to 4 players, not ' + players);
  const set = normSettings(settings);
  const start = Number(set.start);
  const S = {
    game: ID, v: 1, n, settings: set, seed: seed32(seed), rng: seed32(seed),
    phase: 'play', round: 1, rounds: ROUNDS[set.length], start,
    cash: new Array(n).fill(start), pos: new Array(n).fill(0), alive: new Array(n).fill(true), woods: new Array(n).fill(-1),
    out: [], maps: Array.from({ length: n }, () => []),
    owner: new Array(SIZE).fill(-1), lvl: new Array(SIZE).fill(0), mort: new Array(SIZE).fill(false),
    decks: { lucky: [], notice: [] },
    turn: 0, stage: 'roll', dice: null, doubles: 0, again: false, debt: null, last: null,
    bankIn: 0, bankOut: 0, moveN: 0,
  };
  S.decks.lucky = shuffled(S, CARDS.lucky.length);
  S.decks.notice = shuffled(S, CARDS.notice.length);
  startTurn(S, 0, []);
  return S;
}

function startTurn(S, s, beats) {
  S.turn = s; S.doubles = 0; S.again = false; S.dice = null; S.debt = null;
  S.stage = S.woods[s] >= 0 ? 'woods' : 'roll';
  beat(beats, 'turn', { seat: s, round: S.round, woods: S.woods[s] >= 0 });
}

// ---- the rules as data the bots and the UI share
export function groupOwner(owner, g) { const sp = GROUP_SPACES[g]; const o = owner[sp[0]]; return o >= 0 && sp.every(i => owner[i] === o) ? o : -1; }
export function rentOf(S, i, diceSum) {
  const b = BOARD[i], o = S.owner[i];
  if (o < 0 || S.mort[i]) return 0;
  if (b.kind === 'street') {
    const l = S.lvl[i];
    if (l > 0) return b.rents[l];
    return groupOwner(S.owner, b.group) === o ? b.rents[0] * 2 : b.rents[0];
  }
  if (b.kind === 'transit') return TRANSIT_RENT[TRANSITS.filter(t => S.owner[t] === o).length];
  if (b.kind === 'tool') return (diceSum || 7) * TOOL_RATE;
  return 0;
}
export function netWorth(S, s) {
  let w = S.cash[s];
  for (const i of OWNABLE) if (S.owner[i] === s) w += (S.mort[i] ? mortValue(i) : BOARD[i].price) + S.lvl[i] * buildCost(i);
  return w;
}
// what seat s could raise by selling every building (half) and mortgaging every property
export function raisable(S, s) {
  let r = 0;
  for (const i of OWNABLE) if (S.owner[i] === s) { r += Math.floor(S.lvl[i] * buildCost(i) / 2); if (!S.mort[i]) r += mortValue(i); }
  return r;
}

function canBuild(S, s, i) {
  const b = BOARD[i];
  if (b.kind !== 'street' || S.owner[i] !== s || S.lvl[i] >= 5) return false;
  const sp = GROUP_SPACES[b.group];
  if (groupOwner(S.owner, b.group) !== s || sp.some(j => S.mort[j])) return false;
  if (S.lvl[i] > Math.min(...sp.map(j => S.lvl[j]))) return false; // build evenly
  return S.cash[s] >= buildCost(i);
}
function canSell(S, s, i) {
  const b = BOARD[i];
  if (b.kind !== 'street' || S.owner[i] !== s || S.lvl[i] <= 0) return false;
  return S.lvl[i] >= Math.max(...GROUP_SPACES[b.group].map(j => S.lvl[j])); // sell evenly
}
function canMortgage(S, s, i) {
  if (!ownable(i) || S.owner[i] !== s || S.mort[i]) return false;
  const b = BOARD[i];
  return !(b.kind === 'street' && GROUP_SPACES[b.group].some(j => S.lvl[j] > 0));
}
const canUnmortgage = (S, s, i) => ownable(i) && S.owner[i] === s && S.mort[i] && S.cash[s] >= unmortCost(i);

function manageMoves(S, s, out, raiseOnly) {
  if (!raiseOnly) for (const i of OWNABLE) if (canBuild(S, s, i)) out.push({ type: 'build', space: i });
  for (const i of OWNABLE) if (canSell(S, s, i)) out.push({ type: 'sell', space: i });
  for (const i of OWNABLE) if (canMortgage(S, s, i)) out.push({ type: 'mortgage', space: i });
  if (!raiseOnly) for (const i of OWNABLE) if (canUnmortgage(S, s, i)) out.push({ type: 'unmortgage', space: i });
}

// moves[0] is always safe for the server's timer (roll, skip, or a step that raises the money owed); 'end' only when the
// turn can really end.
export function legalMoves(S, seat) {
  if (!S || S.phase !== 'play' || !Number.isInteger(seat) || seat !== S.turn || !S.alive[seat]) return [];
  const out = [];
  switch (S.stage) {
    case 'roll': out.push({ type: 'roll' }); manageMoves(S, seat, out, false); break;
    case 'woods':
      out.push({ type: 'roll' });
      if (S.cash[seat] >= WOODS_FEE) out.push({ type: 'pay' });
      if (S.maps[seat].length) out.push({ type: 'map' });
      manageMoves(S, seat, out, false);
      break;
    case 'buy': out.push({ type: 'skip' }); if (S.cash[seat] >= BOARD[S.pos[seat]].price) out.push({ type: 'buy' }); break;
    case 'debt': manageMoves(S, seat, out, true); break;
    case 'manage':
      if (S.again) out.push({ type: 'roll' });
      manageMoves(S, seat, out, false);
      if (!S.again) out.push({ type: 'end' });
      break;
    default: break;
  }
  return out;
}

const sameMove = (a, b) => !!a && !!b && a.type === b.type && (a.space === undefined ? b.space === undefined : a.space === b.space);

export function apply(state, seat, move) {
  const legal = legalMoves(state, seat);
  if (!move || !legal.some(m => sameMove(m, move))) throw illegal('not a legal move for seat ' + seat + ': ' + JSON.stringify(move));
  const S = clone(state), beats = [];
  S.moveN++;
  switch (move.type) {
    case 'roll': doRoll(S, seat, beats); break;
    case 'pay':
      pay(S, seat, WOODS_FEE, -1);
      S.woods[seat] = -1; S.stage = 'roll';
      beat(beats, 'woods', { seat, out: true, how: 'pay', amount: WOODS_FEE });
      break;
    case 'map': {
      const d = S.maps[seat].pop();
      S.decks[d].push(CARDS[d].findIndex(c => c.map));
      S.woods[seat] = -1; S.stage = 'roll';
      beat(beats, 'woods', { seat, out: true, how: 'map' });
      break;
    }
    case 'skip': beat(beats, 'skip', { seat, space: S.pos[seat] }); S.stage = 'manage'; break;
    case 'buy': {
      const i = S.pos[seat], price = BOARD[i].price;
      pay(S, seat, price, -1); S.owner[i] = seat;
      beat(beats, 'buy', { seat, space: i, price, cash: S.cash[seat] });
      S.stage = 'manage';
      break;
    }
    case 'build': {
      const i = move.space, c = buildCost(i);
      pay(S, seat, c, -1); S.lvl[i]++;
      beat(beats, 'build', { seat, space: i, level: S.lvl[i], cost: c });
      break;
    }
    case 'sell': {
      const i = move.space, back = Math.floor(buildCost(i) / 2);
      S.lvl[i]--; S.cash[seat] += back; S.bankOut += back;
      beat(beats, 'sell', { seat, space: i, level: S.lvl[i], amount: back });
      if (S.stage === 'debt') settleDebt(S, beats);
      break;
    }
    case 'mortgage': {
      const i = move.space, v = mortValue(i);
      S.mort[i] = true; S.cash[seat] += v; S.bankOut += v;
      beat(beats, 'mortgage', { seat, space: i, amount: v });
      if (S.stage === 'debt') settleDebt(S, beats);
      break;
    }
    case 'unmortgage': {
      const i = move.space, c = unmortCost(i);
      pay(S, seat, c, -1); S.mort[i] = false;
      beat(beats, 'unmortgage', { seat, space: i, amount: c });
      break;
    }
    case 'end': endTurn(S, beats); break;
    default: throw illegal('unknown move');
  }
  return { state: S, beats };
}

// money that is there (checked by the caller)
function pay(S, from, amount, to) {
  S.cash[from] -= amount;
  if (to >= 0) S.cash[to] += amount; else S.bankIn += amount;
}
function collect(S, s, amount) { S.cash[s] += amount; S.bankOut += amount; }

function doRoll(S, s, beats) {
  const d = [die(S), die(S)], dbl = d[0] === d[1], sum = d[0] + d[1];
  S.dice = d;
  if (S.stage === 'woods') {
    beat(beats, 'roll', { seat: s, dice: d.slice(), doubles: dbl, woods: true });
    if (dbl) {
      S.woods[s] = -1; S.again = false;
      beat(beats, 'woods', { seat: s, out: true, how: 'doubles' });
      S.stage = 'manage';
      moveBy(S, s, sum, beats);
      return;
    }
    S.woods[s]++;
    if (S.woods[s] >= WOODS_TRIES) {
      S.stage = 'manage';
      if (charge(S, s, WOODS_FEE, -1, 'woods', 'woodsMove', beats)) woodsWalk(S, s, beats);
      return;
    }
    S.stage = 'manage'; // no double: the turn ends here
    return;
  }
  S.doubles++;
  if (!dbl) S.doubles = 0;
  beat(beats, 'roll', { seat: s, dice: d.slice(), doubles: dbl, count: dbl ? S.doubles : 0 });
  if (dbl && S.doubles >= 3) { S.again = false; S.stage = 'manage'; sendToWoods(S, s, 'doubles', beats); return; }
  S.again = dbl;
  S.stage = 'manage';
  moveBy(S, s, sum, beats);
}

// after the third miss the fee is paid: walk out by the roll
function woodsWalk(S, s, beats) {
  S.woods[s] = -1; S.again = false;
  beat(beats, 'woods', { seat: s, out: true, how: 'tries', amount: WOODS_FEE });
  S.stage = 'manage';
  moveBy(S, s, S.dice[0] + S.dice[1], beats);
}

function sendToWoods(S, s, why, beats) {
  const from = S.pos[s];
  S.pos[s] = WOODS; S.woods[s] = 0; S.again = false;
  beat(beats, 'woods', { seat: s, sent: true, why, from, to: WOODS });
}

function moveBy(S, s, steps, beats) {
  const from = S.pos[s], to = (from + steps) % SIZE, passed = from + steps >= SIZE;
  S.pos[s] = to;
  if (passed) collect(S, s, PASS_PAY);
  beat(beats, 'move', { seat: s, from, to, steps, passedStart: passed });
  land(S, s, beats);
}
function moveTo(S, s, to, beats) {
  const from = S.pos[s], steps = (to - from + SIZE) % SIZE || SIZE;
  moveBy(S, s, steps, beats);
}

function land(S, s, beats) {
  const i = S.pos[s], b = BOARD[i];
  switch (b.kind) {
    case 'wrong': sendToWoods(S, s, 'wrong', beats); return;
    case 'tax':
      if (charge(S, s, FUND, -1, 'tax', null, beats)) beat(beats, 'tax', { seat: s, space: i, amount: FUND });
      return;
    case 'lucky': case 'notice': drawCard(S, s, b.kind, beats); return;
    case 'street': case 'transit': case 'tool': {
      const o = S.owner[i];
      if (o < 0) { if (S.cash[s] >= b.price) S.stage = 'buy'; else beat(beats, 'skip', { seat: s, space: i, short: true }); return; }
      if (o === s || S.mort[i]) return;
      const amount = rentOf(S, i, S.dice ? S.dice[0] + S.dice[1] : 7);
      if (amount > 0 && charge(S, s, amount, o, 'rent', null, beats)) beat(beats, 'rent', { seat: s, owner: o, space: i, amount });
      return;
    }
    default: return; // Town Square, the woods (visiting), the picnic
  }
}

function drawCard(S, s, deck, beats) {
  const k = S.decks[deck].shift(), c = CARDS[deck][k];
  if (c.map) S.maps[s].push(deck); else S.decks[deck].push(k);
  S.last = { deck, card: k, seat: s };
  const effect = c.money ? (c.money > 0 ? 'collect' : 'pay') : c.to !== undefined ? 'move' : c.back ? 'back' : c.nearest ? 'move' : c.woods ? 'woods' : c.map ? 'map' : 'repairs';
  const data = { seat: s, deck, card: k, text: c.text, effect };
  if (c.money) data.amount = Math.abs(c.money);
  if (c.repairs) {
    let cot = 0, shops = 0;
    for (const i of OWNABLE) if (S.owner[i] === s) { if (S.lvl[i] === 5) shops++; else cot += S.lvl[i]; }
    data.amount = cot * c.repairs[0] + shops * c.repairs[1];
  }
  beat(beats, 'card', data);
  if (c.money > 0) collect(S, s, c.money);
  else if (c.money < 0) charge(S, s, -c.money, -1, 'card', null, beats);
  else if (c.repairs) { if (data.amount > 0) charge(S, s, data.amount, -1, 'card', null, beats); }
  else if (c.to !== undefined) moveTo(S, s, c.to, beats);
  else if (c.nearest) { let t = TRANSITS.find(x => x > S.pos[s]); if (t === undefined) t = TRANSITS[0]; moveTo(S, s, t, beats); }
  else if (c.back) {
    const from = S.pos[s], to = (from - c.back + SIZE) % SIZE;
    S.pos[s] = to;
    beat(beats, 'move', { seat: s, from, to, steps: -c.back, passedStart: false });
    land(S, s, beats);
  } else if (c.woods) sendToWoods(S, s, 'card', beats);
}

// seat s owes amount to `to` (-1: the bank). Paid now -> true. Short of cash but able to raise it -> the 'debt' stage (sell and
// mortgage until it is paid). Not able -> bankrupt.
function charge(S, s, amount, to, reason, after, beats) {
  if (S.cash[s] >= amount) { pay(S, s, amount, to); return true; }
  if (S.cash[s] + raisable(S, s) >= amount) {
    S.debt = { amount, to, reason, after, space: S.pos[s] };
    S.stage = 'debt';
    beat(beats, 'owe', { seat: s, amount, to, reason });
    return false;
  }
  bankrupt(S, s, to, beats);
  return false;
}
function settleDebt(S, beats) {
  const d = S.debt, s = S.turn;
  if (!d || S.cash[s] < d.amount) return;
  pay(S, s, d.amount, d.to);
  S.debt = null; S.stage = 'manage';
  if (d.reason === 'rent') beat(beats, 'rent', { seat: s, owner: d.to, space: d.space, amount: d.amount });
  else if (d.reason === 'tax') beat(beats, 'tax', { seat: s, space: d.space, amount: d.amount });
  else beat(beats, 'pay', { seat: s, amount: d.amount, reason: d.reason });
  if (d.after === 'woodsMove') woodsWalk(S, s, beats);
}

function bankrupt(S, s, to, beats) {
  // the buildings go back to the bank for half
  let back = 0;
  for (const i of OWNABLE) if (S.owner[i] === s && S.lvl[i]) { back += Math.floor(S.lvl[i] * buildCost(i) / 2); S.lvl[i] = 0; }
  S.cash[s] += back; S.bankOut += back;
  const cash = S.cash[s];
  if (to >= 0) S.cash[to] += cash; else S.bankIn += cash;
  S.cash[s] = 0;
  const props = [];
  for (const i of OWNABLE) if (S.owner[i] === s) { props.push(i); if (to >= 0) S.owner[i] = to; else { S.owner[i] = -1; S.mort[i] = false; } }
  for (const d of S.maps[s]) S.decks[d].push(CARDS[d].findIndex(c => c.map));
  S.maps[s] = [];
  S.alive[s] = false; S.woods[s] = -1; S.out.push(s);
  S.debt = null; S.again = false;
  beat(beats, 'bankrupt', { seat: s, to, cash, props });
  if (S.alive.filter(Boolean).length <= 1) { gameOver(S, beats, 'last'); return; }
  endTurn(S, beats);
}

function endTurn(S, beats) {
  if (S.phase !== 'play') return;
  const s = S.turn;
  let nx = s;
  do nx = (nx + 1) % S.n; while (!S.alive[nx]);
  if (nx <= s) S.round++;
  if (S.round > S.rounds) { S.round = S.rounds; gameOver(S, beats, 'rounds'); return; }
  startTurn(S, nx, beats);
}

function worthAll(S) { return S.cash.map((c, s) => (S.alive[s] ? netWorth(S, s) : 0)); }
function winnersOf(S) {
  const w = worthAll(S), alive = w.map((x, s) => s).filter(s => S.alive[s]);
  const hi = Math.max(...alive.map(s => w[s]));
  return alive.filter(s => w[s] === hi);
}
function gameOver(S, beats, why) {
  S.phase = 'over'; S.stage = 'over'; S.turn = -1; S.again = false; S.debt = null;
  beat(beats, 'gameOver', { why, totals: worthAll(S), winners: winnersOf(S) });
}

export function view(S, seat) {
  const n = S.n, me = Number.isInteger(seat) && seat >= 0 && seat < n ? seat : null;
  return {
    game: ID, n, seat: me, settings: { ...S.settings }, phase: S.phase, turn: S.turn, stage: S.stage,
    round: S.round, rounds: S.rounds, start: S.start,
    board: BOARD, groups: GROUPS,
    cash: S.cash.slice(), pos: S.pos.slice(), alive: S.alive.slice(), woods: S.woods.slice(), out: S.out.slice(),
    maps: S.maps.map(m => m.length), owner: S.owner.slice(), lvl: S.lvl.slice(), mort: S.mort.slice(),
    worth: worthAll(S),
    dice: S.dice && S.dice.slice(), doubles: S.doubles, again: S.again,
    buyAt: S.stage === 'buy' ? S.pos[S.turn] : null,
    debt: S.debt && { amount: S.debt.amount, to: S.debt.to, reason: S.debt.reason },
    decks: { lucky: S.decks.lucky.length, notice: S.decks.notice.length },
    last: S.last && { deck: S.last.deck, seat: S.last.seat, text: CARDS[S.last.deck][S.last.card].text },
    moves: me === null ? [] : legalMoves(S, me),
  };
}

export function score(S) {
  const totals = worthAll(S);
  // the standing first (richest first), then the bankrupt, the last one out ranked highest
  const alive = totals.map((v, s) => s).filter(s => S.alive[s]).sort((a, b) => totals[b] - totals[a] || a - b);
  const order = alive.concat(S.out.slice().reverse());
  return { totals, order, winners: S.phase === 'over' ? winnersOf(S) : [], done: S.phase === 'over' };
}

const game = {
  id: ID, name: NAME, seats: SEATS, settings: SETTINGS, newGame, legalMoves, apply, view, score,
  bot: (v, level, rng) => chooseMove(v, level, rng),
};
export default game;
