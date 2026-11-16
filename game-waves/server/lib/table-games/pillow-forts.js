// Pillow Forts, the engine. An original territory game for 2 to 6 crews: rival pillow-fort crews claim the rooms and yards of
// one giant house (28 areas in 6 regions) with pillow armies. Battles are pillow fights decided by dice; nobody gets hurt, a
// beaten pillow just flops. Pure: its one import is its own bot. A game is settings + seed + moves, so a save is a replay.
//
//   newGame({ players, settings, seed }) -> state
//   legalMoves(state, seat) -> [move]          (every move is listed; no check())
//   apply(state, seat, move) -> { state, beats }
//   view(state, seat) -> what that seat may see (the rng, the deck order and other crews' treat cards are never in it)
//   score(state) -> { totals (areas held), order, winners, done }
//
// A turn: Fluff up (place new pillows: +1 / +3 / all on one of your areas, or auto), Pillow fight (from one of your areas with
// 2+ pillows into a next-door area of another crew: one throw, or keep throwing until it is won or 1 pillow is left), after a
// win move pillows in (a few counts), then one Shuffle (move pillows between two of your areas joined through your own areas)
// or End. A turn in which you won an area earns a treat card; three treats trade in for extra pillows. 2 players: a third,
// sleepy crew (the Teddies) holds some areas and only ever defends.
// view.turn is always the crew whose turn it is. Every stage is timer-safe: moves[0] is auto-place, end, the smallest move-in or
// the best forced trade.
import { chooseMove } from './pillow-forts-bot.js';

export const ID = 'pillow-forts';
export const NAME = 'Pillow Forts';
export const SEATS = [2, 6];
export const TEDDY = -1;                  // the Teddies' owner mark (2 players only); never moves
export const START = { 2: 24, 3: 20, 4: 16, 5: 14, 6: 12 }; // starting pillows per crew
export const TEDDY_AREAS = 8, TEDDY_PILLOWS = 2;
export const ROUNDS = { quick: 10, full: 30 };
export const QUICK_REGIONS = 3;           // quick: hold this many whole regions when your turn comes round again and you win
export const FULL_AREAS = 22;             // full: hold this many areas (or be the last crew standing) and you win at once
export const HAND_MAX = 4;                // 5+ treat cards at the start of a turn: trade down to 4 first
export const STEAL_LIMIT = 6;             // 6+ after taking a flopped crew's treats: trade down to 4 right away
export const SET_BONUS = 2;               // a set of three is worth its treat values added up, +2

export const DWELL = {
  turn: 400, place: 350, cash: 1400, battle: 900, claim: 700, region: 1500, flop: 2600, advance: 500, shift: 700,
  draw: 300, gameOver: 9000,
};

export const SETTINGS = [
  { key: 'length', kind: 'choice', label: 'Length', default: 'quick', options: [
    { value: 'quick', label: 'Quick: hold 3 regions for a whole round, or most areas after 10 rounds' },
    { value: 'full', label: 'Full: last crew standing or 22 areas (30 rounds at most)' },
  ] },
  { key: 'cards', kind: 'toggle', label: 'Treat cards', default: true },
];

// ---- the house: a cutaway on an 8 x 4 grid (c: column, r: row). Row 0 is the attic under the roof, rows 1-3 the floors,
// column 0 the front yard, column 7 the back yard. Regions: bonus pillows each turn for holding all of one.
export const REGIONS = [
  { name: 'The Attic', short: 'Attic', bonus: 2, color: '#e8c79a' },
  { name: 'Upstairs', short: 'Upstairs', bonus: 4, color: '#b9d8f6' },
  { name: 'Downstairs', short: 'Downstairs', bonus: 4, color: '#ffd29a' },
  { name: 'The Basement', short: 'Basement', bonus: 3, color: '#cfc5ec' },
  { name: 'Front Yard', short: 'Front Yard', bonus: 2, color: '#bfe39e' },
  { name: 'Back Yard', short: 'Back Yard', bonus: 2, color: '#9fd9b0' },
];
const ar = (name, short, region, c, r) => ({ name, short, region, c, r });
export const AREAS = [
  ar('Old Trunk', 'Trunk', 0, 2, 0), ar('Rocking Horse', 'Rocking Horse', 0, 3, 0), ar('Round Window', 'Round Window', 0, 4, 0), ar('Cobweb Corner', 'Cobwebs', 0, 5, 0),
  ar('Bunk Beds', 'Bunk Beds', 1, 1, 1), ar('Toy Chest', 'Toy Chest', 1, 2, 1), ar('Big Comfy Bed', 'Big Bed', 1, 3, 1), ar('Bubble Bath', 'Bubble Bath', 1, 4, 1), ar('Sewing Nook', 'Sewing Nook', 1, 5, 1), ar('Balcony', 'Balcony', 1, 6, 1),
  ar('Front Hall', 'Front Hall', 2, 1, 2), ar('Comfy Couch', 'Couch', 2, 2, 2), ar('Fireplace', 'Fireplace', 2, 3, 2), ar('Piano', 'Piano', 2, 4, 2), ar('Kitchen Table', 'Kitchen', 2, 5, 2), ar('Pantry', 'Pantry', 2, 6, 2),
  ar('Laundry Pile', 'Laundry', 3, 1, 3), ar('Workbench', 'Workbench', 3, 2, 3), ar('Ping Pong Table', 'Ping Pong', 3, 3, 3), ar('Boiler Nook', 'Boiler', 3, 4, 3), ar('Jam Shelf', 'Jam Shelf', 3, 5, 3), ar('Game Closet', 'Game Closet', 3, 6, 3),
  ar('Treehouse', 'Treehouse', 4, 0, 1), ar('Front Porch', 'Porch', 4, 0, 2), ar('Flower Bed', 'Flowers', 4, 0, 3),
  ar('Trampoline', 'Trampoline', 5, 7, 1), ar('Sandbox', 'Sandbox', 5, 7, 2), ar('Doghouse', 'Doghouse', 5, 7, 3),
];
AREAS.forEach((a, i) => { a.i = i; });
export const SIZE = AREAS.length;
// the ways between areas: [a, b, kind]. room: next door on one floor; yard: along a yard; ladder (attic hatch), stairs,
// steps (to the basement), door, window, slide (balcony), zip (the zip line over the roof)
export const LINKS = [
  [0, 1, 'room'], [1, 2, 'room'], [2, 3, 'room'],
  [4, 5, 'room'], [5, 6, 'room'], [6, 7, 'room'], [7, 8, 'room'], [8, 9, 'room'],
  [10, 11, 'room'], [11, 12, 'room'], [12, 13, 'room'], [13, 14, 'room'], [14, 15, 'room'],
  [16, 17, 'room'], [17, 18, 'room'], [18, 19, 'room'], [19, 20, 'room'], [20, 21, 'room'],
  [22, 23, 'yard'], [23, 24, 'yard'], [25, 26, 'yard'], [26, 27, 'yard'],
  [1, 6, 'ladder'], [2, 7, 'ladder'],
  [4, 10, 'stairs'], [8, 14, 'stairs'],
  [12, 18, 'steps'], [15, 21, 'steps'],
  [22, 4, 'window'], [23, 10, 'door'], [24, 16, 'window'],
  [25, 9, 'slide'], [26, 15, 'door'], [27, 21, 'door'],
  [22, 25, 'zip'],
];
export const ADJ = AREAS.map(() => []);
for (const [a, b] of LINKS) { ADJ[a].push(b); ADJ[b].push(a); }
for (const l of ADJ) l.sort((x, y) => x - y);
export const REGION_AREAS = REGIONS.map((g, k) => AREAS.filter(a => a.region === k).map(a => a.i));

// ---- the treat cards: three kinds worth 1, 2 or 3, and two Midnight Feasts that count as any kind
export const KINDS = ['Cocoa', 'Cookie', 'Popcorn', 'Midnight Feast'];
export const CARDS = [];
for (let k = 0; k < 3; k++) for (const v of [1, 1, 2, 2, 3, 3]) CARDS.push({ kind: k, value: v });
CARDS.push({ kind: 3, value: 2 }, { kind: 3, value: 2 });
CARDS.forEach((c, i) => { c.id = i; });
// three cards make a set when the non-feast ones are all one kind or all different kinds
export function isSet(ids) {
  if (!Array.isArray(ids) || ids.length !== 3 || new Set(ids).size !== 3) return false;
  const ks = ids.map(i => CARDS[i] && CARDS[i].kind);
  if (ks.some(k => k === undefined)) return false;
  const real = ks.filter(k => k !== 3);
  return new Set(real).size === 1 || new Set(real).size === real.length;
}
export const setValue = ids => ids.reduce((s, i) => s + CARDS[i].value, 0) + SET_BONUS;

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
function shuffle(S, a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(S) * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; }
  return a;
}
function normSettings(s = {}) {
  return {
    length: Object.prototype.hasOwnProperty.call(ROUNDS, s.length) ? s.length : 'quick',
    cards: !(s.cards === false || s.cards === 'false'),
  };
}
function clone(S) {
  return {
    ...S, settings: { ...S.settings },
    owner: S.owner.slice(), pillows: S.pillows.slice(), alive: S.alive.slice(), out: S.out.slice(),
    hands: S.hands.map(h => h.slice()), deck: S.deck.slice(), discard: S.discard.slice(),
    adv: S.adv && { ...S.adv, choices: S.adv.choices.slice() }, last: S.last && { ...S.last, a: S.last.a.slice(), d: S.last.d.slice() },
    winners: S.winners && S.winners.slice(), traded: S.traded.slice(),
  };
}
const beat = (beats, kind, data) => { beats.push({ kind, dwell: DWELL[kind], ...data }); };
function illegal(msg) { const e = new Error('Pillow Forts: ' + msg); e.illegal = true; return e; }

// ---- the rules as data the bots and the UI share
export const areasOf = (owner, s) => { let n = 0; for (const o of owner) if (o === s) n++; return n; };
export const regionHeld = (owner, g, s) => REGION_AREAS[g].every(i => owner[i] === s);
export const regionsOf = (owner, s) => REGIONS.map((g, k) => k).filter(k => regionHeld(owner, k, s));
export function reinforcement(owner, s) {
  return Math.max(3, Math.floor(areasOf(owner, s) / 3)) + regionsOf(owner, s).reduce((t, k) => t + REGIONS[k].bonus, 0);
}
export function totalPillows(S, s) { let t = 0; for (let i = 0; i < SIZE; i++) if (S.owner[i] === s) t += S.pillows[i]; return t; }

// where new pillows go when nobody picks (the setup, the auto move, a timed-out turn): one at a time to the area of yours
// that faces the most enemy pillows for its own
function autoSpot(S, s) {
  let best = -1, bs = -1;
  for (let i = 0; i < SIZE; i++) {
    if (S.owner[i] !== s) continue;
    let th = 0, foe = false;
    for (const j of ADJ[i]) if (S.owner[j] !== s) { foe = true; th += S.owner[j] === TEDDY ? S.pillows[j] * 0.5 : S.pillows[j]; }
    if (!foe) continue;
    const sc = (th + 1.5) / (S.pillows[i] + 1);
    if (sc > bs + 1e-9) { bs = sc; best = i; }
  }
  if (best < 0) best = S.owner.indexOf(s);
  return best;
}

// ---- the game
export function newGame({ players, settings, seed } = {}) {
  const n = Array.isArray(players) ? players.length : Math.floor(Number(players));
  if (!(n >= SEATS[0] && n <= SEATS[1])) throw new Error('Pillow Forts is for 2 to 6 players, not ' + players);
  const set = normSettings(settings);
  const S = {
    game: ID, v: 1, n, settings: set, seed: seed32(seed), rng: seed32(seed),
    phase: 'play', round: 1, rounds: ROUNDS[set.length], first: 0, turn: 0, stage: 'place',
    owner: new Array(SIZE).fill(TEDDY), pillows: new Array(SIZE).fill(1), alive: new Array(n).fill(true), out: [],
    hands: Array.from({ length: n }, () => []), deck: [], discard: [], traded: new Array(n).fill(0),
    left: 0, gained: false, battles: 0, adv: null, pendingCash: false, last: null, winners: null, why: null, moveN: 0, turnN: 0,
    teddies: n === 2,
  };
  S.first = Math.floor(rand(S) * n);
  const order = shuffle(S, AREAS.map(a => a.i));
  let k = 0;
  if (S.teddies) for (; k < TEDDY_AREAS; k++) { S.owner[order[k]] = TEDDY; S.pillows[order[k]] = TEDDY_PILLOWS; }
  // dealt round from the seat after the first player, so the first one never holds more
  for (let j = 0; k < SIZE; k++, j++) S.owner[order[k]] = (S.first + 1 + j) % n;
  // each crew's other starting pillows go where it is pressed hardest (round by round, so nobody piles up first)
  const extra = Array.from({ length: n }, (_, s) => START[n] - areasOf(S.owner, s));
  for (let more = true; more;) {
    more = false;
    for (let j = 0; j < n; j++) { const s = (S.first + j) % n; if (extra[s] > 0) { S.pillows[autoSpot(S, s)]++; extra[s]--; more = true; } }
  }
  if (set.cards) S.deck = shuffle(S, CARDS.map(c => c.id));
  const beats = [];
  startTurn(S, S.first, beats);
  return S;
}

function startTurn(S, s, beats) {
  // quick: still holding QUICK_REGIONS whole regions when your turn comes round again wins
  if (S.settings.length === 'quick' && S.round > 1 && regionsOf(S.owner, s).length >= QUICK_REGIONS) { S.turn = s; gameOver(S, beats, 'regions', [s]); return; }
  S.turn = s; S.gained = false; S.battles = 0; S.adv = null; S.turnN++;
  S.left = reinforcement(S.owner, s);
  S.stage = S.settings.cards && S.hands[s].length > HAND_MAX ? 'cash' : 'place';
  beat(beats, 'turn', { seat: s, round: S.round, pillows: S.left, regions: regionsOf(S.owner, s), mustTrade: S.stage === 'cash' });
}

// the sets of three in a hand (card ids, sorted), the biggest first
export function handSets(hand) {
  const h = hand.slice().sort((a, b) => a - b), out = [];
  for (let a = 0; a < h.length; a++) for (let b = a + 1; b < h.length; b++) for (let c = b + 1; c < h.length; c++) {
    const ids = [h[a], h[b], h[c]];
    if (isSet(ids)) out.push(ids);
  }
  out.sort((x, y) => setValue(y) - setValue(x) || x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
  return out;
}

// every area of s reachable from `from` through areas of s
function joined(S, s, from) {
  const seen = new Set([from]), q = [from];
  while (q.length) { const i = q.pop(); for (const j of ADJ[i]) if (S.owner[j] === s && !seen.has(j)) { seen.add(j); q.push(j); } }
  seen.delete(from);
  return [...seen].sort((a, b) => a - b);
}
const uniq = a => a.filter((x, i) => a.indexOf(x) === i);
export const shiftCounts = avail => uniq([1, Math.floor(avail / 2), avail].filter(x => x >= 1)).sort((a, b) => a - b);
export const placeCounts = left => uniq([1, 3, left].filter(x => x >= 1 && x <= left)).sort((a, b) => a - b);

// moves[0] is always safe for the server's timer: auto-place, end, the smallest move-in, the best forced trade
export function legalMoves(S, seat) {
  if (!S || S.phase !== 'play' || !Number.isInteger(seat) || seat !== S.turn || !S.alive[seat]) return [];
  const out = [];
  switch (S.stage) {
    case 'cash':
      for (const ids of handSets(S.hands[seat])) out.push({ type: 'trade', cards: ids });
      break;
    case 'place':
      out.push({ type: 'auto' });
      if (S.settings.cards) for (const ids of handSets(S.hands[seat])) out.push({ type: 'trade', cards: ids });
      for (let i = 0; i < SIZE; i++) if (S.owner[i] === seat) for (const n of placeCounts(S.left)) out.push({ type: 'place', area: i, n });
      break;
    case 'attack':
      out.push({ type: 'end' });
      for (let i = 0; i < SIZE; i++) {
        if (S.owner[i] !== seat || S.pillows[i] < 2) continue;
        for (const j of ADJ[i]) if (S.owner[j] !== seat) out.push({ type: 'roll', from: i, to: j }, { type: 'blitz', from: i, to: j });
      }
      for (let i = 0; i < SIZE; i++) {
        if (S.owner[i] !== seat || S.pillows[i] < 2) continue;
        for (const j of joined(S, seat, i)) for (const n of shiftCounts(S.pillows[i] - 1)) out.push({ type: 'shift', from: i, to: j, n });
      }
      break;
    case 'advance':
      for (const n of S.adv.choices) out.push({ type: 'advance', n });
      break;
    default: break;
  }
  return out;
}

// the same move, whatever order its keys came in
const sameMove = (a, b) => !!a && !!b && typeof b === 'object' && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => JSON.stringify(a[k]) === JSON.stringify(b[k]));

export function apply(state, seat, move) {
  const legal = legalMoves(state, seat);
  if (!move || !legal.some(m => sameMove(m, move))) throw illegal('not a legal move for seat ' + seat + ': ' + JSON.stringify(move));
  const S = clone(state), beats = [];
  S.moveN++;
  switch (move.type) {
    case 'trade': {
      const ids = move.cards.slice(), value = setValue(ids);
      S.hands[seat] = S.hands[seat].filter(c => !ids.includes(c));
      S.discard.push(...ids); S.traded[seat]++;
      S.left += value;
      beat(beats, 'cash', { seat, cards: ids.map(i => ({ kind: CARDS[i].kind, value: CARDS[i].value })), pillows: value, forced: S.stage === 'cash' });
      if (S.stage === 'cash' && S.hands[seat].length <= HAND_MAX) S.stage = 'place';
      break;
    }
    case 'auto': case 'place': {
      const list = [];
      if (move.type === 'place') { S.pillows[move.area] += move.n; S.left -= move.n; list.push([move.area, move.n]); }
      else {
        const got = new Map();
        while (S.left > 0) { const i = autoSpot(S, seat); S.pillows[i]++; S.left--; got.set(i, (got.get(i) || 0) + 1); }
        for (const [i, k] of [...got].sort((a, b) => a[0] - b[0])) list.push([i, k]);
      }
      beat(beats, 'place', { seat, list, left: S.left, auto: move.type === 'auto' });
      if (S.left <= 0) { S.left = 0; S.stage = 'attack'; }
      break;
    }
    case 'roll': case 'blitz': fight(S, seat, move.from, move.to, move.type === 'blitz', beats); break;
    case 'advance': {
      const a = S.adv;
      S.pillows[a.from] -= move.n; S.pillows[a.to] += move.n;
      beat(beats, 'advance', { seat, from: a.from, to: a.to, n: move.n });
      S.adv = null;
      afterClaim(S, seat);
      break;
    }
    case 'shift': {
      S.pillows[move.from] -= move.n; S.pillows[move.to] += move.n;
      beat(beats, 'shift', { seat, from: move.from, to: move.to, n: move.n });
      endTurn(S, beats);
      break;
    }
    case 'end': endTurn(S, beats); break;
    default: throw illegal('unknown move');
  }
  return { state: S, beats };
}

// one throw of a pillow fight: the attacker throws a die for each pillow past the one that stays home (3 at most), the
// defender one for each pillow (2 at most). Highest against highest, then the next pair; a tie goes to the defender.
export function throwDice(aDice, dDice) {
  const a = aDice.slice().sort((x, y) => y - x), d = dDice.slice().sort((x, y) => y - x);
  let aLost = 0, dLost = 0;
  for (let k = 0; k < Math.min(a.length, d.length); k++) { if (a[k] > d[k]) dLost++; else aLost++; }
  return { a, d, aLost, dLost };
}
function fight(S, seat, from, to, blitz, beats) {
  const def = S.owner[to];
  let rounds = 0, aLost = 0, dLost = 0, last = null, used = 1;
  do {
    used = Math.min(3, S.pillows[from] - 1);
    const r = throwDice(Array.from({ length: used }, () => die(S)), Array.from({ length: Math.min(2, S.pillows[to]) }, () => die(S)));
    S.pillows[from] -= r.aLost; S.pillows[to] -= r.dLost;
    aLost += r.aLost; dLost += r.dLost; rounds++; last = r;
  } while (blitz && S.pillows[to] > 0 && S.pillows[from] > 1);
  const won = S.pillows[to] <= 0;
  S.battles++;
  S.last = { seat, def, from, to, a: last.a, d: last.d, aLost, dLost, rounds, blitz, won, no: S.turnN * 100 + S.battles };
  beat(beats, 'battle', { seat, def, from, to, a: last.a.slice(), d: last.d.slice(), aLost, dLost, rounds, blitz, won, left: [S.pillows[from], Math.max(0, S.pillows[to])], dwell: blitz && rounds > 1 ? 1300 : DWELL.battle });
  if (won) claim(S, seat, from, to, def, used, beats);
}

function claim(S, seat, from, to, def, used, beats) {
  const g = AREAS[to].region, broke = def >= 0 && regionHeld(S.owner, g, def) ? g : -1;
  S.owner[to] = seat; S.pillows[to] = 0; S.gained = true;
  const region = regionHeld(S.owner, g, seat);
  beat(beats, 'claim', { seat, from, to, def, region: region ? g : -1, broke });
  if (region) beat(beats, 'region', { seat, region: g, bonus: REGIONS[g].bonus });
  S.pendingCash = false;
  if (def >= 0 && areasOf(S.owner, def) === 0) {
    const cards = S.hands[def].length;
    S.hands[seat].push(...S.hands[def]); S.hands[def] = [];
    S.alive[def] = false; S.out.push(def);
    beat(beats, 'flop', { seat: def, by: seat, cards, left: S.alive.filter(Boolean).length });
    if (S.settings.cards && S.hands[seat].length >= STEAL_LIMIT) S.pendingCash = true;
  }
  const avail = S.pillows[from] - 1, min = Math.min(used, avail);
  const choices = uniq([min, Math.ceil((min + avail) / 2), avail]).filter(x => x >= 1).sort((a, b) => a - b);
  const win = winCheck(S, seat);
  if (win || choices.length === 1) {
    const k = win ? avail : choices[0];
    S.pillows[from] -= k; S.pillows[to] += k;
    beat(beats, 'advance', { seat, from, to, n: k, auto: true });
    if (win) { gameOver(S, beats, win, [seat]); return; }
    afterClaim(S, seat);
    return;
  }
  S.adv = { from, to, choices };
  S.stage = 'advance';
}
function afterClaim(S, seat) {
  if (S.pendingCash) { S.pendingCash = false; S.stage = 'cash'; S.left = 0; return; }
  S.stage = 'attack';
  void seat;
}

// a win the moment it happens: the last crew standing; full: FULL_AREAS areas; quick: QUICK_REGIONS whole regions
function winCheck(S, s) {
  if (S.alive.filter(Boolean).length <= 1) return 'last';
  if (S.settings.length === 'full' && areasOf(S.owner, s) >= FULL_AREAS) return 'areas';
  return null;
}

function endTurn(S, beats) {
  if (S.phase !== 'play') return;
  const s = S.turn;
  if (S.gained && S.settings.cards) {
    if (!S.deck.length && S.discard.length) { S.deck = shuffle(S, S.discard); S.discard = []; }
    if (S.deck.length) { S.hands[s].push(S.deck.shift()); beat(beats, 'draw', { seat: s, cards: S.hands[s].length }); }
  }
  let nx = s;
  do nx = (nx + 1) % S.n; while (!S.alive[nx]);
  const pos = k => (k - S.first + S.n) % S.n;
  if (pos(nx) <= pos(s)) S.round++;
  if (S.round > S.rounds) { S.round = S.rounds; gameOver(S, beats, 'rounds', null); return; }
  startTurn(S, nx, beats);
}

// most areas, then most pillows; still level: shared
function leaders(S) {
  const live = S.alive.map((a, s) => s).filter(s => S.alive[s]);
  const key = s => areasOf(S.owner, s) * 1000 + totalPillows(S, s);
  const hi = Math.max(...live.map(key));
  return live.filter(s => key(s) === hi);
}
function gameOver(S, beats, why, winners) {
  S.phase = 'over'; S.stage = 'over'; S.adv = null; S.left = 0;
  S.why = why; S.winners = winners || leaders(S);
  beat(beats, 'gameOver', { why, winners: S.winners.slice(), totals: S.alive.map((a, s) => areasOf(S.owner, s)), round: S.round });
  S.turn = -1;
}

export function view(S, seat) {
  const n = S.n, me = Number.isInteger(seat) && seat >= 0 && seat < n ? seat : null;
  return {
    game: ID, n, seat: me, settings: { ...S.settings }, phase: S.phase, turn: S.phase === 'play' ? S.turn : -1, stage: S.stage,
    round: S.round, rounds: S.rounds, first: S.first, teddies: S.teddies,
    map: { areas: AREAS, regions: REGIONS, links: LINKS },
    owner: S.owner.slice(), pillows: S.pillows.slice(), alive: S.alive.slice(), out: S.out.slice(),
    areas: S.alive.map((a, s) => areasOf(S.owner, s)), totals: S.alive.map((a, s) => totalPillows(S, s)),
    regions: S.alive.map((a, s) => regionsOf(S.owner, s)),
    cards: S.hands.map(h => h.length), deck: S.deck.length, discard: S.discard.length, traded: S.traded.slice(),
    hand: me === null ? [] : S.hands[me].map(i => ({ id: i, kind: CARDS[i].kind, value: CARDS[i].value })),
    left: S.left, gained: S.gained, battles: S.battles,
    income: S.alive.map((a, s) => (a ? reinforcement(S.owner, s) : 0)),
    adv: S.adv && { from: S.adv.from, to: S.adv.to, choices: S.adv.choices.slice() },
    last: S.last && { ...S.last, a: S.last.a.slice(), d: S.last.d.slice() },
    goal: S.settings.length === 'quick' ? { regions: QUICK_REGIONS } : { areas: FULL_AREAS },
    why: S.why, winners: S.winners ? S.winners.slice() : [],
    moves: me === null ? [] : legalMoves(S, me),
  };
}

export function score(S) {
  const totals = S.alive.map((a, s) => areasOf(S.owner, s));
  const pill = S.alive.map((a, s) => totalPillows(S, s));
  const alive = totals.map((v, s) => s).filter(s => S.alive[s]).sort((a, b) => totals[b] - totals[a] || pill[b] - pill[a] || a - b);
  const order = alive.concat(S.out.slice().reverse());
  return { totals, order, winners: S.phase === 'over' ? S.winners.slice() : [], done: S.phase === 'over' };
}

const game = {
  id: ID, name: NAME, seats: SEATS, settings: SETTINGS, newGame, legalMoves, apply, view, score,
  bot: (v, level, rng) => chooseMove(v, level, rng),
};
export default game;
