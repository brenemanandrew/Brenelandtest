// The Missing Pie, the engine. A kid-friendly deduction game for 3 to 6 players in the town of Breneland: somebody took the
// prize pie from the Picnic Lawn's pie eating contest. Three secret cards (who, with what, where) go in the Pie Tin; the rest
// are dealt out. Walk the town map, ask about a who and a what in the place you are in, and the first player to your left who
// holds one of the three shows you one, in secret. Solve it with an accusation: right wins, wrong puts you out of the running
// (you still show cards). Pure: its one import is its own bot (cards, map, solver), so it runs in node and in the browser.
//   newGame({ players, settings, seed }) -> state     legalMoves(state, seat) -> [move]     apply(state, seat, move) -> { state, beats }
//   view(state, seat | null) -> what that seat may see     score(state) -> { totals, order, winners, done }
// Moves: roll | go { place } | bus | ask { who, what } | show { card } (out of turn) | accuse { who, what, where } | end
// While a player chooses which card to show, `turn` is that player (so the turn timer and the bots cover it); `active` is
// the player whose turn it really is.
import { chooseMove, solve, WHO, WHAT, WHERE, CARDS, CAT, PATHS, BUS, DIST, LAWN } from './missing-pie-bot.js';

export const ID = 'missing-pie';
export const NAME = 'The Missing Pie';
export const SEATS = [3, 6];
export const MAX_ROUNDS = 40; // a game that runs this long ends with the answer shown (nobody wins); bots solve far sooner

export const DWELL = {
  turn: 300, roll: 1300, move: 900, ask: 2200, shown: 1800, noneShown: 1800, accuse: 2600, out: 1600, gameOver: 9000,
};

export const SETTINGS = [
  { key: 'reveal', kind: 'toggle', label: 'Helper notebook (fills in hints for you)', default: false },
];

function seed32(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed ?? '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
// mulberry32, its state kept in the game state so a save replays
function rand(S) {
  S.rng = (S.rng + 0x6d2b79f5) >>> 0;
  let t = S.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(S, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(S) * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
const normSettings = (s = {}) => ({ reveal: s.reveal === true });
const beat = (beats, kind, data) => { beats.push({ kind, dwell: DWELL[kind], ...data }); };
function illegal(msg) { const e = new Error('The Missing Pie: ' + msg); e.illegal = true; return e; }

function clone(S) {
  return {
    ...S,
    settings: { ...S.settings },
    tin: { ...S.tin },
    hands: S.hands.map(h => h.slice()),
    pos: S.pos.slice(),
    reach: S.reach.slice(),
    pulled: S.pulled.slice(),
    out: S.out.slice(),
    log: S.log.slice(),
    accusations: S.accusations.slice(),
    seen: S.seen.map(x => x.slice()),
    showed: S.showed.map(x => x.slice()),
    pending: S.pending && { ...S.pending },
    winners: S.winners.slice(),
  };
}

export function newGame({ players, settings, seed } = {}) {
  const n = Array.isArray(players) ? players.length : Math.floor(Number(players));
  if (!(n >= SEATS[0] && n <= SEATS[1])) throw new Error('The Missing Pie is for 3 to 6 players, not ' + players);
  const S = {
    game: ID, v: 1, n, settings: normSettings(settings), seed: seed32(seed), rng: seed32(seed),
    phase: 'play', tin: null, hands: [], pos: WHO.map(() => WHERE[LAWN]), turn: 0, stage: 'roll', roll: 0, reach: [],
    pulled: new Array(n).fill(false), out: new Array(n).fill(false), log: [], accusations: [], seen: [], showed: [],
    pending: null, turnNo: 1, round: 1, winners: [], why: null,
  };
  const who = shuffle(S, WHO.slice()), what = shuffle(S, WHAT.slice()), where = shuffle(S, WHERE.slice());
  S.tin = { who: who.pop(), what: what.pop(), where: where.pop() };
  const rest = shuffle(S, [...who, ...what, ...where]);
  for (let s = 0; s < n; s++) { S.hands.push([]); S.seen.push([]); S.showed.push([]); }
  rest.forEach((c, i) => S.hands[i % n].push(c));
  for (const h of S.hands) h.sort((a, b) => CARDS.indexOf(a) - CARDS.indexOf(b));
  return S;
}

const placeOf = (S, seat) => WHERE.indexOf(S.pos[seat]);
const matches = (S, seat, three) => S.hands[seat].filter(c => three.includes(c));
const accuseMoves = () => { const out = []; for (const who of WHO) for (const what of WHAT) for (const where of WHERE) out.push({ type: 'accuse', who, what, where }); return out; };
const ACCUSE = accuseMoves();
const askMoves = () => { const out = []; for (const who of WHO) for (const what of WHAT) out.push({ type: 'ask', who, what }); return out; };
const ASK = askMoves();

export function legalMoves(S, seat) {
  if (!S || !Number.isInteger(seat) || seat < 0 || seat >= S.n || S.phase !== 'play') return [];
  if (S.stage === 'show') {
    if (!S.pending || seat !== S.pending.by) return [];
    return matches(S, seat, [S.pending.who, S.pending.what, S.pending.where]).map(card => ({ type: 'show', card }));
  }
  if (seat !== S.turn || S.out[seat]) return [];
  const out = [];
  const here = placeOf(S, seat);
  if (S.stage === 'roll') {
    out.push({ type: 'roll' });
    if (BUS[here] !== undefined) out.push({ type: 'bus' });
    if (S.pulled[seat]) out.push(...ASK.map(m => ({ ...m })));
  } else if (S.stage === 'move') {
    for (const p of S.reach) out.push({ type: 'go', place: WHERE[p] });
    out.push({ type: 'end' });
  } else if (S.stage === 'ask') {
    out.push(...ASK.map(m => ({ ...m })));
    out.push({ type: 'end' });
  } else if (S.stage === 'done') {
    out.push({ type: 'end' });
  }
  out.push(...ACCUSE.map(m => ({ ...m })));
  return out;
}

const keyOf = m => JSON.stringify(m);

export function apply(state, seat, move) {
  const legal = legalMoves(state, seat);
  const k = move && keyOf(move);
  if (!move || !legal.some(m => keyOf(m) === k)) throw illegal('not a legal move for seat ' + seat + ': ' + JSON.stringify(move));
  const S = clone(state), beats = [];
  switch (move.type) {
    case 'roll': {
      const value = 1 + Math.floor(rand(S) * 6), here = placeOf(S, seat);
      let reach = WHERE.map((x, p) => p).filter(p => p !== here && DIST[here][p] <= value);
      let hop = false;
      if (!reach.length) { // too short to reach anywhere: hop to the nearest next-door place
        const near = Math.min(...PATHS.filter(e => e[0] === here || e[1] === here).map(e => e[2]));
        reach = PATHS.filter(e => (e[0] === here || e[1] === here) && e[2] === near).map(e => (e[0] === here ? e[1] : e[0])).sort((a, b) => a - b);
        hop = true;
      }
      S.roll = value; S.reach = reach; S.stage = 'move';
      beat(beats, 'roll', { seat, value, hop });
      break;
    }
    case 'go': case 'bus': {
      const from = S.pos[seat];
      const to = move.type === 'bus' ? WHERE[BUS[placeOf(S, seat)]] : move.place;
      S.pos[seat] = to; S.stage = 'ask'; S.reach = []; S.pulled[seat] = false;
      beat(beats, 'move', { seat, from, place: to, bus: move.type === 'bus' });
      break;
    }
    case 'ask': ask(S, seat, move, beats); break;
    case 'show': {
      const P = S.pending;
      finishAsk(S, P.asker, P.by, move.card, P.passed, beats);
      break;
    }
    case 'accuse': {
      const right = move.who === S.tin.who && move.what === S.tin.what && move.where === S.tin.where;
      beat(beats, 'accuse', { seat, who: move.who, what: move.what, where: move.where, right });
      if (right) { gameOver(S, [seat], 'solved', beats); break; }
      S.out[seat] = true;
      S.accusations.push({ seat, who: move.who, what: move.what, where: move.where });
      beat(beats, 'out', { seat });
      if (S.out.every(Boolean)) { gameOver(S, [], 'allOut', beats); break; }
      endTurn(S, beats);
      break;
    }
    case 'end': endTurn(S, beats); break;
    default: throw illegal('unknown move');
  }
  return { state: S, beats };
}

function ask(S, seat, move, beats) {
  const where = S.pos[seat];
  const sus = WHO.indexOf(move.who);
  const moved = S.pos[sus] !== where;
  if (moved) { S.pos[sus] = where; if (sus < S.n && sus !== seat) S.pulled[sus] = true; }
  S.pulled[seat] = false;
  beat(beats, 'ask', { seat, who: move.who, what: move.what, where, moved });
  const three = [move.who, move.what, where], passed = [];
  for (let i = 1; i < S.n; i++) {
    const k = (seat + i) % S.n, m = matches(S, k, three);
    if (!m.length) { passed.push(k); continue; }
    if (m.length === 1) { S.log.push({ seat, who: move.who, what: move.what, where, by: null, passed: [] }); finishAsk(S, seat, k, m[0], passed, beats, true); return; }
    S.log.push({ seat, who: move.who, what: move.what, where, by: null, passed: [] });
    S.stage = 'show';
    S.pending = { asker: seat, by: k, who: move.who, what: move.what, where, passed };
    return;
  }
  S.log.push({ seat, who: move.who, what: move.what, where, by: null, passed });
  S.stage = 'done';
  beat(beats, 'noneShown', { seat, passed });
}

// the card goes to the asker only (their view); everyone hears who showed
function finishAsk(S, asker, by, card, passed, beats) {
  const i = S.log.length - 1;
  S.log[i] = { ...S.log[i], by, passed: passed.slice() };
  S.seen[asker].push({ card, by, ask: i });
  S.showed[by].push({ card, to: asker, ask: i });
  S.pending = null;
  S.stage = 'done';
  beat(beats, 'shown', { by, to: asker, passed: passed.slice() });
}

function endTurn(S, beats) {
  S.pulled[S.turn] = false;
  S.stage = 'roll'; S.roll = 0; S.reach = [];
  let k = S.turn;
  for (let i = 0; i < S.n; i++) {
    k = (k + 1) % S.n;
    if (k === 0) S.round++;
    if (!S.out[k]) break;
  }
  if (S.round > MAX_ROUNDS) { gameOver(S, [], 'timeUp', beats); return; }
  S.turn = k; S.turnNo++;
  beat(beats, 'turn', { seat: k });
}

function gameOver(S, winners, why, beats) {
  S.phase = 'over'; S.stage = 'over'; S.winners = winners; S.why = why; S.pending = null;
  beat(beats, 'gameOver', { winners: winners.slice(), totals: totalsOf(S), why, solution: { ...S.tin } });
}

const totalsOf = S => S.hands.map((h, i) => (S.winners.includes(i) ? 1 : 0));

export function view(S, seat) {
  const n = S.n, me = Number.isInteger(seat) && seat >= 0 && seat < n ? seat : null, over = S.phase === 'over';
  const P = S.pending;
  const v = {
    game: ID, n, seat: me, settings: { ...S.settings }, phase: S.phase,
    turn: over ? -1 : S.stage === 'show' && P ? P.by : S.turn,
    active: over ? -1 : S.turn, stage: S.stage, roll: S.roll, reach: S.reach.map(p => WHERE[p]),
    pos: S.pos.slice(), pulled: S.pulled.slice(), out: S.out.slice(), turnNo: S.turnNo, round: S.round, maxRounds: MAX_ROUNDS,
    counts: S.hands.map(h => h.length),
    log: S.log.map(e => ({ ...e, passed: e.passed.slice() })),
    accusations: S.accusations.map(a => ({ ...a })),
    pending: P ? { asker: P.asker, by: P.by, who: P.who, what: P.what, where: P.where } : null,
    hand: me === null ? null : S.hands[me].slice(),
    seen: me === null ? [] : S.seen[me].map(x => ({ ...x })),
    showed: me === null ? [] : S.showed[me].map(x => ({ ...x })),
    shown: null,
    notes: null,
    winners: S.winners.slice(), why: S.why,
    solution: over ? { ...S.tin } : null,
    moves: me === null ? [] : legalMoves(S, me),
  };
  // the card just shown to you (your last ask, if it was answered)
  if (me !== null) { const L = S.log.length - 1, last = S.seen[me][S.seen[me].length - 1]; if (last && last.ask === L) v.shown = { ...last }; }
  if (me !== null && S.settings.reveal) v.notes = solve({ n, me, counts: v.counts, hand: v.hand, seen: v.seen, log: v.log, accusations: v.accusations }, true).K;
  return v;
}

export function score(S) {
  const totals = totalsOf(S);
  const order = totals.map((x, i) => i).sort((a, b) => totals[b] - totals[a] || a - b);
  return { totals, order, winners: S.winners.slice(), done: S.phase === 'over', why: S.why, solution: S.phase === 'over' ? { ...S.tin } : null };
}

export { WHO, WHAT, WHERE, CARDS, CAT, PATHS, BUS, DIST };

const game = {
  id: ID, name: NAME, seats: SEATS, settings: SETTINGS, newGame, legalMoves, apply, view, score,
  bot: (v, level, rng) => chooseMove(v, level, rng),
};
export default game;
