// Hearthfield, the engine. An original meadow-building game set round Breneland town: gather timber, clay, wool, berries and
// stone from the fields, lay lanes, put up cottages and grow them into halls, swap with the market carts and each other, and
// keep Rascal the raccoon off your berries. Pure: it imports only its own siblings. A game is settings + seed + moves.
//
//   newGame({ players, settings, seed }) -> state
//   legalMoves(state, seat) -> [move]          (every move is listed; no check())
//   apply(state, seat, move) -> { state, beats }
//   view(state, seat) -> what that seat may see (other hands, favour cards and the deck order never)
//   score(state) -> { totals (points), order, winners, done }
//
// Setup: in snake order each player puts down a cottage and a lane beside it, twice; the second cottage pays one card from each
// field round it. A turn: roll two dice; every field showing that number pays its neighbours (a cottage 1, a hall 2) unless
// Rascal sits on it. A 7 is a Raccoon Raid: anyone holding 9+ cards drops half, then the roller moves Rascal and nabs a card from
// someone beside his new field. Then build, buy favour cards, trade with the carts (4:1, 3:1 or 2:1) or offer a swap to another
// player (step by step, they accept or decline), and end. First to the target points on their own turn wins.
// view.turn is the seat that must act now (the one dropping cards, the one answering an offer, the setup placer); view.roller is
// whose turn it is. The server's timer and runner follow view.turn; moves[0] is always safe and 'end' (when open) is last.
import { GEO } from './hearthfield-board.js';
import { chooseMove } from './hearthfield-bot.js';

export const ID = 'hearthfield';
export const NAME = 'Hearthfield';
export const SEATS = [3, 4];
export { GEO };
export const RES = ['timber', 'clay', 'wool', 'berries', 'stone'];
export const RI = { timber: 0, clay: 1, wool: 2, berries: 3, stone: 4 };
export const COST = { lane: [1, 1, 0, 0, 0], cottage: [1, 1, 1, 1, 0], hall: [0, 1, 0, 2, 2], favour: [0, 0, 1, 1, 1] };
export const LIMIT = { lane: 13, cottage: 5, hall: 4 };
export const TARGET = { quick: 6, standard: 8, long: 10 };
export const ROUND_CAP = { quick: 30, standard: 40, long: 50 };
export const RAID = 7, DROP_AT = 9;            // a 7 is a Raccoon Raid; 9+ cards in hand drops half
export const OFFERS_PER_TURN = 3, TRADE_MAX = 5, WANT_MAX = 4;
export const PARADE_MIN = 5, KEEPER_MIN = 3, BADGE_POINTS = 2;
// favour cards (24): the deck's mix
export const FAVOURS = {
  wrangler: { name: 'Raccoon Wrangler', count: 12, text: 'Shoo Rascal to another field and nab a card from someone beside it.' },
  beavers: { name: 'Busy Beavers', count: 3, text: 'Build up to 2 lanes for free, right now.' },
  basket: { name: 'Picnic Basket', count: 3, text: 'Take 3 cards from the bank, all different kinds.' },
  market: { name: 'Market Day', count: 2, text: 'For the rest of your turn the carts swap 2 for 1, any kind.' },
  acorn: { name: 'Golden Acorn', count: 4, text: 'Worth 1 point. Keep it hidden until the end.' },
};
export const FAV_KINDS = Object.keys(FAVOURS);
// fields: 18 to gather from plus the town (Rascal's home, gives nothing)
export const FIELD_MIX = { timber: 4, clay: 4, wool: 3, berries: 4, stone: 3 };
export const NUMBERS = [3, 3, 4, 4, 5, 5, 5, 6, 6, 8, 8, 9, 9, 9, 10, 10, 11, 11];
export const CARTS = ['any', 'any', 'any', 'timber', 'clay', 'wool', 'berries', 'stone'];
export const ways = n => (n >= 2 && n <= 12 && n !== 7 ? 6 - Math.abs(7 - n) : 0); // dice ways out of 36
const NV = GEO.v.length, NE = GEO.e.length, NH = GEO.hex.length, TOWN = GEO.town;

export const DWELL = {
  turn: 300, roll: 900, produce: 1200, build: 800, harvest: 1100, discard: 900, raccoon: 1200, nab: 1300, favour: 700, use: 1500,
  basket: 1200, bank: 900, trade: 900, badge: 2000, gameOver: 9000,
};

export const SETTINGS = [
  { key: 'length', kind: 'choice', label: 'Length', default: 'standard', options: [
    { value: 'quick', label: 'Quick: first to 6 points' },
    { value: 'standard', label: 'Standard: first to 8 points' },
    { value: 'long', label: 'Long: first to 10 points' },
  ] },
  { key: 'board', kind: 'choice', label: 'Meadow', default: 'random', options: [
    { value: 'random', label: 'A new meadow each game' },
    { value: 'starter', label: 'The starter meadow (always the same)' },
  ] },
  { key: 'trades', kind: 'toggle', label: 'Swaps between players', default: true },
  { key: 'gentle', kind: 'toggle', label: 'Gentle Rascal (never nabs from anyone on 2 points or less)', default: false },
];

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
function shuffle(S, a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(S) * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; }
  return a;
}
const sum = a => a.reduce((x, y) => x + y, 0);
const has = (hand, cost) => cost.every((c, r) => hand[r] >= c);

function normSettings(s = {}) {
  return {
    length: Object.prototype.hasOwnProperty.call(TARGET, s.length) ? s.length : 'standard',
    board: s.board === 'starter' ? 'starter' : 'random',
    trades: !(s.trades === false || s.trades === 'false'),
    gentle: s.gentle === true || s.gentle === 'true',
  };
}

// the meadow: fields shuffled, numbers shuffled so no two hot ones (6, 8) and no two equal numbers touch, carts shuffled
function makeMeadow(S) {
  const kinds = [];
  for (const [k, c] of Object.entries(FIELD_MIX)) for (let i = 0; i < c; i++) kinds.push(k);
  shuffle(S, kinds);
  const spots = GEO.hex.map((h, i) => i).filter(i => i !== TOWN);
  let nums = null;
  for (let tries = 0; tries < 400; tries++) {
    const a = shuffle(S, NUMBERS.slice()), at = new Array(NH).fill(0);
    spots.forEach((i, k) => { at[i] = a[k]; });
    const bad = spots.some(i => GEO.hex[i].nb.some(j => at[j] && (at[j] === at[i] || ((at[i] === 6 || at[i] === 8) && (at[j] === 6 || at[j] === 8)))));
    nums = at;
    if (!bad) break;
  }
  const tiles = GEO.hex.map((h, i) => (i === TOWN ? { res: null, num: 0 } : { res: kinds[spots.indexOf(i)], num: nums[i] }));
  const carts = shuffle(S, CARTS.slice());
  return { tiles, carts };
}

function clone(S) {
  return {
    ...S,
    settings: { ...S.settings },
    own: S.own.slice(), hall: S.hall.slice(), lanes: S.lanes.slice(),
    hand: S.hand.map(h => h.slice()), fav: S.fav.map(f => f.slice()), fresh: S.fresh.map(f => f.slice()), played: S.played.slice(),
    deck: S.deck.slice(), setup: S.setup.slice(), laneLen: S.laneLen.slice(),
    dice: S.dice && S.dice.slice(),
    discard: S.discard && { queue: S.discard.queue.slice(), need: S.discard.need.slice(), init: S.discard.init.slice() },
    nab: S.nab && S.nab.slice(),
    basket: S.basket && { left: S.basket.left, taken: S.basket.taken.slice() },
    trade: S.trade && { ...S.trade, give: S.trade.give.slice(), want: S.trade.want.slice() },
    declined: S.declined.slice(),
    lastNab: S.lastNab && { ...S.lastNab },
  };
}

const beat = (beats, kind, data) => { beats.push({ kind, dwell: DWELL[kind], ...data }); };
function illegal(msg) { const e = new Error('Hearthfield: ' + msg); e.illegal = true; return e; }

// ---- the game
export function newGame({ players, settings, seed } = {}) {
  const n = Array.isArray(players) ? players.length : Math.floor(Number(players));
  if (!(n >= SEATS[0] && n <= SEATS[1])) throw new Error('Hearthfield is for 3 or 4 players, not ' + players);
  const set = normSettings(settings);
  const S = {
    game: ID, v: 1, n, settings: set, seed: seed32(seed), rng: seed32(seed),
    phase: 'play', stage: 'setupHome', round: 0, rounds: ROUND_CAP[set.length], target: TARGET[set.length],
    tiles: null, carts: null, raccoon: TOWN,
    own: new Array(NV).fill(-1), hall: new Array(NV).fill(false), lanes: new Array(NE).fill(-1),
    hand: Array.from({ length: n }, () => [0, 0, 0, 0, 0]), fav: Array.from({ length: n }, () => []),
    fresh: Array.from({ length: n }, () => []), played: new Array(n).fill(0), used: false,
    deck: [], turn: 0, setup: [], sk: 0, lastHome: -1,
    dice: null, market: false, free: 0, basket: null, discard: null, nab: null, back: null,
    trade: null, offers: 0, declined: [],
    parade: -1, keeper: -1, laneLen: new Array(n).fill(0), lastNab: null, moveN: 0, why: null,
  };
  if (set.board === 'starter') { const T = { rng: 20261116 }; Object.assign(S, makeMeadow(T)); } else Object.assign(S, makeMeadow(S));
  const deck = [];
  for (const k of FAV_KINDS) for (let i = 0; i < FAVOURS[k].count; i++) deck.push(k);
  S.deck = shuffle(S, deck);
  for (let k = 0; k < n; k++) S.setup.push(k);
  for (let k = n - 1; k >= 0; k--) S.setup.push(k);
  S.turn = 0;
  return S;
}

// ---- the rules as data the bots and the UI share
export function rateOf(S, s, r) {
  if (S.market) return 2;
  let best = 4;
  GEO.ports.forEach((e, k) => {
    const E = GEO.e[e], c = S.carts[k];
    if (S.own[E.a] !== s && S.own[E.b] !== s) return;
    if (c === 'any') best = Math.min(best, 3); else if (RI[c] === r) best = 2;
  });
  return best;
}
const free = (S, v) => S.own[v] < 0 && GEO.v[v].adj.every(u => S.own[u] < 0);
const count = (S, s, what) => { let c = 0; for (let v = 0; v < NV; v++) if (S.own[v] === s && (what === 'hall' ? S.hall[v] : !S.hall[v])) c++; return c; };
const lanesOf = (S, s) => S.lanes.reduce((c, o) => c + (o === s ? 1 : 0), 0);
export function piecesLeft(S, s) { return { lane: LIMIT.lane - lanesOf(S, s), cottage: LIMIT.cottage - count(S, s, 'cottage'), hall: LIMIT.hall - count(S, s, 'hall') }; }
// a lane at e for seat s: free, and touching s's home, or s's lane through a corner no one else has a home on
function laneOk(S, s, e) {
  if (S.lanes[e] >= 0) return false;
  const E = GEO.e[e];
  for (const v of [E.a, E.b]) {
    if (S.own[v] === s) return true;
    if (S.own[v] >= 0) continue;
    if (GEO.v[v].edges.some(x => x !== e && S.lanes[x] === s)) return true;
  }
  return false;
}
const homeOk = (S, s, v) => free(S, v) && GEO.v[v].edges.some(x => S.lanes[x] === s);
export function laneSpots(S, s) { const out = []; for (let e = 0; e < NE; e++) if (laneOk(S, s, e)) out.push(e); return out; }
export function homeSpots(S, s) { const out = []; for (let v = 0; v < NV; v++) if (homeOk(S, s, v)) out.push(v); return out; }
// a corner's worth for the setup order list (the timer's default pick): dice ways round it, a little for variety
export function spotValue(tiles, v) {
  let w = 0; const kinds = new Set();
  for (const h of GEO.v[v].hexes) { const t = tiles[h]; if (t.res) { w += ways(t.num); kinds.add(t.res); } }
  return w * 10 + kinds.size;
}

// the longest run of seat s's lanes (another player's home breaks it)
export function longestLane(S, s) {
  const mine = []; for (let e = 0; e < NE; e++) if (S.lanes[e] === s) mine.push(e);
  if (!mine.length) return 0;
  let best = 0;
  const used = new Set();
  const dfs = (v, len) => {
    if (len > best) best = len;
    if (S.own[v] >= 0 && S.own[v] !== s && len > 0) return;
    for (const x of GEO.v[v].edges) {
      if (S.lanes[x] !== s || used.has(x)) continue;
      used.add(x);
      const E = GEO.e[x];
      dfs(E.a === v ? E.b : E.a, len + 1);
      used.delete(x);
    }
  };
  const starts = new Set(); for (const e of mine) { starts.add(GEO.e[e].a); starts.add(GEO.e[e].b); }
  for (const v of starts) dfs(v, 0);
  return best;
}
function badges(S, beats) {
  const lens = []; for (let s = 0; s < S.n; s++) lens.push(longestLane(S, s));
  S.laneLen = lens;
  const cur = S.parade, top = Math.max(...lens);
  let nx;
  if (cur >= 0 && lens[cur] >= PARADE_MIN && lens[cur] === top) nx = cur;
  else if (top < PARADE_MIN) nx = -1;
  else { const c = lens.map((l, s) => s).filter(s => lens[s] === top); nx = c.length === 1 ? c[0] : -1; }
  if (nx !== cur) { S.parade = nx; beat(beats, 'badge', { badge: 'parade', seat: nx, from: cur, len: nx >= 0 ? lens[nx] : top }); }
  const kc = S.keeper, p = S.played;
  for (let s = 0; s < S.n; s++) {
    if (s === S.keeper || p[s] < KEEPER_MIN) continue;
    if (S.keeper < 0 || p[s] > p[S.keeper]) { S.keeper = s; }
  }
  if (S.keeper !== kc) beat(beats, 'badge', { badge: 'keeper', seat: S.keeper, from: kc, count: p[S.keeper] });
}
// points everyone can see (homes, halls, badges) and the whole count (with the hidden golden acorns)
export function shownPoints(S, s) { return count(S, s, 'cottage') + 2 * count(S, s, 'hall') + (S.parade === s ? BADGE_POINTS : 0) + (S.keeper === s ? BADGE_POINTS : 0); }
export const acorns = (S, s) => S.fav[s].filter(k => k === 'acorn').length + S.fresh[s].filter(k => k === 'acorn').length;
export const points = (S, s) => shownPoints(S, s) + acorns(S, s);

// who must act now
export function actor(S) {
  if (!S || S.phase !== 'play') return -1;
  if (S.stage === 'setupHome' || S.stage === 'setupLane') return S.setup[S.sk];
  if (S.stage === 'discard' && S.discard) return S.discard.queue[0];
  if (S.stage === 'offer' && S.trade) return S.trade.to;
  return S.turn;
}

function useMoves(S, s, out, rollStage) {
  if (S.used) return;
  const seen = new Set();
  for (const k of S.fav[s]) {
    if (k === 'acorn' || seen.has(k)) continue;
    if (rollStage && k !== 'wrangler') continue;
    if (k === 'beavers' && (!laneSpots(S, s).length || piecesLeft(S, s).lane <= 0)) continue;
    seen.add(k);
  }
  for (const k of FAV_KINDS) if (seen.has(k)) out.push({ type: 'use', card: k });
}
function mainMoves(S, s, out) {
  const hand = S.hand[s], left = piecesLeft(S, s);
  if (left.lane > 0 && has(hand, COST.lane)) for (const e of laneSpots(S, s)) out.push({ type: 'lane', e });
  if (left.cottage > 0 && has(hand, COST.cottage)) for (const v of homeSpots(S, s)) out.push({ type: 'home', v });
  if (left.hall > 0 && has(hand, COST.hall)) for (let v = 0; v < NV; v++) if (S.own[v] === s && !S.hall[v]) out.push({ type: 'hall', v });
  if (S.deck.length && has(hand, COST.favour)) out.push({ type: 'favour' });
  useMoves(S, s, out, false);
  for (let r = 0; r < 5; r++) {
    if (hand[r] < rateOf(S, s, r)) continue;
    for (let g = 0; g < 5; g++) if (g !== r) out.push({ type: 'bank', give: RES[r], get: RES[g] });
  }
  if (S.settings.trades && S.offers < OFFERS_PER_TURN && sum(hand) > 0) for (let k = 0; k < S.n; k++) if (k !== s) out.push({ type: 'trade', to: k });
  out.push({ type: 'end' });
}
function draftMoves(S, out) {
  const t = S.trade, hand = S.hand[t.from], g = sum(t.give), w = sum(t.want);
  out.push({ type: 'cancel' });
  for (let r = 0; r < 5; r++) {
    if (t.give[r] > 0) out.push({ type: 'give', res: RES[r], add: -1 });
    if (hand[r] > t.give[r] && t.want[r] === 0 && g < TRADE_MAX) out.push({ type: 'give', res: RES[r], add: 1 });
  }
  for (let r = 0; r < 5; r++) {
    if (t.want[r] > 0) out.push({ type: 'want', res: RES[r], add: -1 });
    if (t.want[r] < WANT_MAX && t.give[r] === 0 && w < TRADE_MAX) out.push({ type: 'want', res: RES[r], add: 1 });
  }
  if (g > 0 && w > 0) out.push({ type: 'send' });
}
// Rascal's next field: the town first (a gentle default for the timer), then every other field in order
function raccoonSpots(S) { const out = []; if (S.raccoon !== TOWN) out.push(TOWN); for (let h = 0; h < NH; h++) if (h !== S.raccoon && h !== TOWN) out.push(h); return out; }
function victims(S, s, h) {
  const out = [];
  for (let k = 0; k < S.n; k++) {
    if (k === s || sum(S.hand[k]) === 0) continue;
    if (S.settings.gentle && shownPoints(S, k) <= 2) continue;
    if (GEO.hex[h].v.some(v => S.own[v] === k)) out.push(k);
  }
  return out;
}

export function legalMoves(S, seat) {
  if (!S || S.phase !== 'play' || !Number.isInteger(seat) || seat !== actor(S)) return [];
  const out = [];
  switch (S.stage) {
    case 'setupHome': {
      const list = []; for (let v = 0; v < NV; v++) if (free(S, v)) list.push(v);
      list.sort((a, b) => spotValue(S.tiles, b) - spotValue(S.tiles, a) || a - b);
      for (const v of list) out.push({ type: 'home', v });
      break;
    }
    case 'setupLane': for (const e of GEO.v[S.lastHome].edges) if (S.lanes[e] < 0) out.push({ type: 'lane', e }); break;
    case 'roll': out.push({ type: 'roll' }); useMoves(S, seat, out, true); break;
    case 'discard': for (let r = 0; r < 5; r++) if (S.hand[seat][r] > 0) out.push({ type: 'drop', res: RES[r] }); break;
    case 'raccoon': for (const h of raccoonSpots(S)) out.push({ type: 'raccoon', hex: h }); break;
    case 'nab': for (const k of S.nab) out.push({ type: 'nab', seat: k }); break;
    case 'beavers': out.push({ type: 'done' }); if (piecesLeft(S, seat).lane > 0) for (const e of laneSpots(S, seat)) out.push({ type: 'lane', e }); break;
    case 'basket': for (let r = 0; r < 5; r++) if (!S.basket.taken.includes(RES[r])) out.push({ type: 'take', res: RES[r] }); break;
    case 'main': mainMoves(S, seat, out); break;
    case 'trade': draftMoves(S, out); break;
    case 'offer': out.push({ type: 'decline' }); if (has(S.hand[S.trade.to], S.trade.want)) out.push({ type: 'accept' }); break;
    default: break;
  }
  return out;
}

const sameMove = (a, b) => !!a && !!b && typeof b === 'object' && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => a[k] === b[k]);
const pay = (S, s, cost) => { for (let r = 0; r < 5; r++) S.hand[s][r] -= cost[r]; };

export function apply(state, seat, move) {
  const legal = legalMoves(state, seat);
  if (!move || !legal.some(m => sameMove(m, move))) throw illegal('not a legal move for seat ' + seat + ': ' + JSON.stringify(move));
  const S = clone(state), beats = [];
  S.moveN++;
  switch (move.type) {
    case 'home':
      if (S.stage === 'setupHome') {
        S.own[move.v] = seat; S.lastHome = move.v;
        beat(beats, 'build', { seat, what: 'cottage', at: move.v, setup: true });
        if (S.sk >= S.n) { // the second cottage pays one card from each field round it
          const got = [0, 0, 0, 0, 0];
          for (const h of GEO.v[move.v].hexes) { const t = S.tiles[h]; if (t.res) got[RI[t.res]]++; }
          for (let r = 0; r < 5; r++) S.hand[seat][r] += got[r];
          beat(beats, 'harvest', { seat, res: got });
        }
        badges(S, beats);
        S.stage = 'setupLane';
      } else {
        pay(S, seat, COST.cottage); S.own[move.v] = seat;
        beat(beats, 'build', { seat, what: 'cottage', at: move.v });
        badges(S, beats);
      }
      break;
    case 'lane':
      S.lanes[move.e] = seat;
      if (S.stage === 'setupLane') {
        beat(beats, 'build', { seat, what: 'lane', at: move.e, setup: true });
        badges(S, beats);
        S.sk++;
        if (S.sk >= S.setup.length) { S.round = 1; startTurn(S, 0, beats); } else S.stage = 'setupHome';
      } else if (S.stage === 'beavers') {
        beat(beats, 'build', { seat, what: 'lane', at: move.e, free: true });
        badges(S, beats);
        S.free--;
        if (S.free <= 0 || !laneSpots(S, seat).length || piecesLeft(S, seat).lane <= 0) { S.stage = S.back; S.back = null; }
      } else {
        pay(S, seat, COST.lane);
        beat(beats, 'build', { seat, what: 'lane', at: move.e });
        badges(S, beats);
      }
      break;
    case 'hall':
      pay(S, seat, COST.hall); S.hall[move.v] = true;
      beat(beats, 'build', { seat, what: 'hall', at: move.v });
      break;
    case 'done': S.free = 0; S.stage = S.back; S.back = null; break;
    case 'roll': doRoll(S, seat, beats); break;
    case 'drop': {
      const d = S.discard;
      S.hand[seat][RI[move.res]]--; d.need[0]--;
      if (d.need[0] <= 0) {
        beat(beats, 'discard', { seat, count: d.init[0], step: 'done' });
        d.queue.shift(); d.need.shift(); d.init.shift();
        if (!d.queue.length) { S.discard = null; S.stage = 'raccoon'; }
      }
      break;
    }
    case 'raccoon': {
      const from = S.raccoon; S.raccoon = move.hex;
      beat(beats, 'raccoon', { seat, from, to: move.hex });
      const vs = victims(S, seat, move.hex);
      if (vs.length === 1) { nab(S, seat, vs[0], beats); afterRaid(S); }
      else if (vs.length > 1) { S.nab = vs; S.stage = 'nab'; }
      else afterRaid(S);
      break;
    }
    case 'nab': nab(S, seat, move.seat, beats); S.nab = null; afterRaid(S); break;
    case 'favour': {
      pay(S, seat, COST.favour);
      const k = S.deck.shift();
      S.fresh[seat].push(k);
      beat(beats, 'favour', { seat, left: S.deck.length });
      break;
    }
    case 'use': {
      const k = move.card;
      S.fav[seat].splice(S.fav[seat].indexOf(k), 1); S.used = true;
      beat(beats, 'use', { seat, card: k });
      if (k === 'wrangler') { S.played[seat]++; badges(S, beats); S.back = S.stage; S.stage = 'raccoon'; }
      else if (k === 'beavers') { S.back = S.stage; S.stage = 'beavers'; S.free = 2; }
      else if (k === 'basket') { S.back = S.stage; S.stage = 'basket'; S.basket = { left: 3, taken: [] }; }
      else if (k === 'market') S.market = true;
      break;
    }
    case 'take': {
      S.hand[seat][RI[move.res]]++; S.basket.taken.push(move.res); S.basket.left--;
      if (S.basket.left <= 0) { beat(beats, 'basket', { seat, res: S.basket.taken.slice() }); S.basket = null; S.stage = S.back; S.back = null; }
      break;
    }
    case 'bank': {
      const r = RI[move.give], g = RI[move.get], rate = rateOf(S, seat, r);
      S.hand[seat][r] -= rate; S.hand[seat][g]++;
      beat(beats, 'bank', { seat, give: move.give, get: move.get, rate, market: S.market });
      break;
    }
    case 'trade':
      S.offers++;
      S.trade = { from: seat, to: move.to, give: [0, 0, 0, 0, 0], want: [0, 0, 0, 0, 0] };
      S.stage = 'trade';
      beat(beats, 'trade', { step: 'open', seat, from: seat, to: move.to, dwell: 300 });
      break;
    case 'give': case 'want': S.trade[move.type][RI[move.res]] += move.add; break;
    case 'send': {
      const t = S.trade; S.stage = 'offer';
      beat(beats, 'trade', { step: 'offer', seat, from: t.from, to: t.to, give: t.give.slice(), want: t.want.slice() });
      break;
    }
    case 'cancel': { const t = S.trade; S.trade = null; S.stage = 'main'; beat(beats, 'trade', { step: 'cancel', seat, from: t.from, to: t.to, dwell: 300 }); break; }
    case 'accept': case 'decline': {
      const t = S.trade, yes = move.type === 'accept';
      if (yes) {
        if (!has(S.hand[t.from], t.give)) throw illegal('the offer changed');
        for (let r = 0; r < 5; r++) { S.hand[t.from][r] += t.want[r] - t.give[r]; S.hand[t.to][r] += t.give[r] - t.want[r]; }
      } else S.declined = S.declined.concat({ from: t.from, to: t.to, give: t.give.slice(), want: t.want.slice(), round: S.round }).slice(-10);
      beat(beats, 'trade', { step: yes ? 'accept' : 'decline', seat, from: t.from, to: t.to, give: t.give.slice(), want: t.want.slice() });
      S.trade = null; S.stage = 'main';
      break;
    }
    case 'end': endTurn(S, beats); break;
    default: throw illegal('unknown move');
  }
  // a win only on your own turn, once the setup is done
  if (S.phase === 'play' && S.round >= 1 && points(S, S.turn) >= S.target) gameOver(S, beats, 'target');
  return { state: S, beats };
}

function startTurn(S, s, beats) {
  S.turn = s; S.stage = 'roll'; S.used = false; S.market = false; S.offers = 0; S.free = 0; S.back = null;
  for (let k = 0; k < S.n; k++) if (S.fresh[k].length) { S.fav[k] = S.fav[k].concat(S.fresh[k]); S.fresh[k] = []; }
  beat(beats, 'turn', { seat: s, round: S.round });
}
function endTurn(S, beats) {
  let nx = (S.turn + 1) % S.n;
  if (nx === 0) S.round++;
  if (S.round > S.rounds) { S.round = S.rounds; gameOver(S, beats, 'rounds'); return; }
  startTurn(S, nx, beats);
}

function doRoll(S, s, beats) {
  const d = [1 + Math.floor(rand(S) * 6), 1 + Math.floor(rand(S) * 6)], n = d[0] + d[1];
  S.dice = d;
  beat(beats, 'roll', { seat: s, dice: d.slice(), sum: n, raid: n === RAID });
  if (n === RAID) {
    const queue = [], need = [];
    for (let k = 0; k < S.n; k++) { const q = (s + k) % S.n, c = sum(S.hand[q]); if (c >= DROP_AT) { queue.push(q); need.push(Math.floor(c / 2)); } }
    S.back = 'main';
    if (queue.length) { S.discard = { queue, need, init: need.slice() }; S.stage = 'discard'; for (let i = 0; i < queue.length; i++) beat(beats, 'discard', { seat: queue[i], count: need[i], step: 'must', dwell: 300 }); }
    else S.stage = 'raccoon';
    return;
  }
  const gains = Array.from({ length: S.n }, () => [0, 0, 0, 0, 0]);
  let blocked = -1;
  GEO.hex.forEach((h, i) => {
    const t = S.tiles[i];
    if (!t.res || t.num !== n) return;
    if (S.raccoon === i) { if (h.v.some(v => S.own[v] >= 0)) blocked = i; return; }
    for (const v of h.v) if (S.own[v] >= 0) gains[S.own[v]][RI[t.res]] += S.hall[v] ? 2 : 1;
  });
  for (let k = 0; k < S.n; k++) for (let r = 0; r < 5; r++) S.hand[k][r] += gains[k][r];
  beat(beats, 'produce', { sum: n, gains, blocked });
  S.stage = 'main';
}

function nab(S, s, k, beats) {
  const h = S.hand[k], tot = sum(h);
  if (!tot) return;
  let x = Math.floor(rand(S) * tot), r = 0;
  while (x >= h[r]) { x -= h[r]; r++; }
  h[r]--; S.hand[s][r]++;
  S.lastNab = { thief: s, victim: k, res: RES[r], n: S.moveN };
  beat(beats, 'nab', { seat: s, from: k });
}
function afterRaid(S) { S.stage = S.back || 'main'; S.back = null; }

function totals(S) { const t = []; for (let s = 0; s < S.n; s++) t.push(points(S, s)); return t; }
function gameOver(S, beats, why) {
  const tot = totals(S);
  let winners;
  if (why === 'target') winners = [S.turn];
  else { const hi = Math.max(...tot); winners = tot.map((p, s) => s).filter(s => tot[s] === hi); }
  S.phase = 'over'; S.stage = 'over'; S.why = why; S.winners = winners;
  S.discard = null; S.trade = null; S.nab = null; S.basket = null;
  const ac = []; for (let s = 0; s < S.n; s++) ac.push(acorns(S, s));
  beat(beats, 'gameOver', { why, winners, totals: tot, acorns: ac });
}

export function view(S, seat) {
  const n = S.n, me = Number.isInteger(seat) && seat >= 0 && seat < n ? seat : null, over = S.phase === 'over';
  const shown = [], left = [];
  for (let s = 0; s < n; s++) { shown.push(shownPoints(S, s)); left.push(piecesLeft(S, s)); }
  const t = S.trade;
  return {
    game: ID, n, seat: me, settings: { ...S.settings }, phase: S.phase, turn: actor(S), roller: S.turn, stage: S.stage,
    round: S.round, rounds: S.rounds, target: S.target, rows: GEO.rows.slice(),
    tiles: S.tiles.map(x => ({ ...x })), carts: S.carts.slice(), ports: GEO.ports.slice(), town: TOWN, raccoon: S.raccoon,
    own: S.own.slice(), hall: S.hall.slice(), lanes: S.lanes.slice(),
    cards: S.hand.map(sum), favs: S.fav.map((f, s) => f.length + S.fresh[s].length), played: S.played.slice(),
    hand: me === null ? null : S.hand[me].slice(),
    myFav: me === null ? null : S.fav[me].map(k => ({ card: k, new: false })).concat(S.fresh[me].map(k => ({ card: k, new: true }))),
    deck: S.deck.length,
    points: over ? totals(S) : shown, shown, myPoints: me === null ? null : points(S, me),
    acorns: over ? Array.from({ length: n }, (_, s) => acorns(S, s)) : null,
    parade: S.parade, keeper: S.keeper, laneLen: S.laneLen.slice(), left,
    rates: me === null ? null : RES.map((x, r) => rateOf(S, me, r)),
    dice: S.dice && S.dice.slice(), market: S.market, used: S.used, free: S.free,
    basket: S.basket && { left: S.basket.left, taken: S.basket.taken.slice() },
    discard: S.discard && { queue: S.discard.queue.slice(), need: S.discard.need.slice() },
    nab: S.nab && S.nab.slice(), lastHome: S.stage === 'setupLane' ? S.lastHome : -1,
    setupLeft: S.stage === 'setupHome' || S.stage === 'setupLane' ? S.setup.length - S.sk : 0,
    trade: t ? { from: t.from, to: t.to, give: t.give.slice(), want: t.want.slice(), sent: S.stage === 'offer' } : null,
    offers: S.offers, offersMax: OFFERS_PER_TURN,
    declined: S.declined.map(d => ({ ...d, give: d.give.slice(), want: d.want.slice() })),
    lastNab: S.lastNab && me !== null && (S.lastNab.thief === me || S.lastNab.victim === me) ? { ...S.lastNab } : null,
    why: S.why, winners: over ? S.winners.slice() : [],
    moves: me === null ? [] : legalMoves(S, me),
  };
}

export function score(S) {
  const over = S.phase === 'over';
  const tot = over ? totals(S) : Array.from({ length: S.n }, (_, s) => shownPoints(S, s));
  const order = tot.map((p, s) => s).sort((a, b) => tot[b] - tot[a] || a - b);
  if (over) { const w = S.winners; order.sort((a, b) => w.includes(b) - w.includes(a) || tot[b] - tot[a] || a - b); }
  return { totals: tot, order, winners: over ? S.winners.slice() : [], done: over };
}

const game = {
  id: ID, name: NAME, seats: SEATS, settings: SETTINGS, newGame, legalMoves, apply, view, score,
  bot: (v, level, rng) => chooseMove(v, level, rng),
};
export default game;
