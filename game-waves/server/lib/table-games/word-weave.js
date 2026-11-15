// Word Weave, the engine: an original crossword-style word game for 2 to 4. Pure: its imports are its own siblings (the shared
// pieces, the bot, the word list), so it runs in node (a data: URL import) and in the browser as it is.
//   newGame({ players, settings, seed }) -> state        (plain JSON; the rng state is in it, so a save replays)
//   legalMoves(state, seat) -> [{ type: 'pass' }, { type: 'place' }, { type: 'exchange' }?] on your turn (templates), else []
//   check(state, seat, move) -> null if legal, else a short reason for the player (place and exchange are checked here)
//   apply(state, seat, move) -> { state, beats }        (pure; throws err.illegal on an illegal move)
//   view(state, seat) -> what that seat may see          (seat null: a passer-by; never the bag or another rack)
//   score(state) -> { totals, order, winners, done }     (highest total wins)
// Moves (the engine reads the fields, so key order does not matter for place and exchange; the templates above are built in
// this order):
//   { type: 'pass' }
//   { type: 'place', tiles: [{ r, c, letter, blank }] }   r, c 0-14; letter 'A'-'Z' (a blank: its chosen letter, blank: true)
//   { type: 'exchange', letters: ['A', 'E', '?'] }       1-7 letters from your rack ('?' a blank); only while the bag has 7+
// A turn: place 1+ tiles in one line, joined up with no gaps, touching the tiles on the board (the first word covers the star);
// every word made must be in the list. Score: the letters (bonus squares count only under new tiles), word bonuses multiply,
// plus every cross word; all 7 tiles in one turn is a Full Weave (+50). The game ends when the bag is empty and someone plays
// their last tile (they gain everyone else's tile values, the others lose their own), or after 6 scoreless turns in a row
// (everyone loses their own), or in the quick game after 8 rounds (no adjustments).
import { SIZE, CENTER, RACK, COUNTS, VALUES, LAYOUT, emptyBoard, evaluate, tileValue, FULL_BONUS } from './word-weave-core.js';
import { chooseMove, bestScore } from './word-weave-bot.js';

export const ID = 'word-weave';
export const NAME = 'Word Weave';
export const SEATS = [2, 4];
export const QUICK_ROUNDS = 8;
export const SCORELESS_END = 6;
export const DWELL = { turn: 300, place: 1600, draw: 500, exchange: 1200, pass: 1000, fullweave: 1800, bagEmpty: 1200, gameOver: 9000 };

export const SETTINGS = [
  { key: 'length', kind: 'choice', label: 'Length', default: 'full', options: [
    { value: 'full', label: 'Full: play until the tiles run out' },
    { value: 'quick', label: 'Quick: 8 rounds, then top score wins' },
  ] },
  { key: 'hints', kind: 'toggle', label: 'Show my best score', default: false },
];

function seed32(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed ?? '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
// mulberry32, its state kept in the game state so the shuffles replay
function rand(S) {
  S.rng = (S.rng + 0x6d2b79f5) >>> 0;
  let t = S.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(S, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(S) * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; }

const normSettings = (s = {}) => ({ length: s.length === 'quick' ? 'quick' : 'full', hints: s.hints === true });
const clone = S => ({ ...S, settings: { ...S.settings }, board: S.board.slice(), bag: S.bag.slice(), racks: S.racks.map(r => r.slice()), scores: S.scores.slice(), last: S.last, final: S.final });
const beat = (beats, kind, data) => { beats.push({ kind, dwell: DWELL[kind], ...data }); };
const rackValue = r => r.reduce((s, l) => s + (VALUES[l] || 0), 0);
function illegal(msg) { const e = new Error('Word Weave: ' + msg); e.illegal = true; return e; }

export function newGame({ players, settings, seed } = {}) {
  const n = Array.isArray(players) ? players.length : Math.floor(Number(players));
  if (!(n >= SEATS[0] && n <= SEATS[1])) throw new Error('Word Weave is for 2 to 4 players, not ' + players);
  const S = {
    game: ID, v: 1, n, settings: normSettings(settings), seed: seed32(seed), rng: seed32(seed), phase: 'play',
    board: emptyBoard(), bag: [], racks: [], scores: new Array(n).fill(0), turn: 0, first: 0, turns: 0, scoreless: 0,
    bagEmptied: false, last: null, final: null,
  };
  for (const [l, k] of Object.entries(COUNTS)) for (let i = 0; i < k; i++) S.bag.push(l);
  shuffle(S, S.bag);
  for (let s = 0; s < n; s++) S.racks.push(S.bag.splice(S.bag.length - RACK, RACK));
  S.first = S.turn = Math.floor(rand(S) * n);
  return S;
}

const myTurn = (S, seat) => S && S.phase === 'play' && Number.isInteger(seat) && seat === S.turn;
export function legalMoves(S, seat) {
  if (!myTurn(S, seat)) return [];
  const out = [{ type: 'pass' }, { type: 'place' }];
  if (S.bag.length >= RACK) out.push({ type: 'exchange' });
  return out;
}

// the rack minus these letters ('?' for blanks), or null if the rack does not hold them
function takeFrom(rack, letters) {
  const left = rack.slice();
  for (const l of letters) { const i = left.indexOf(l); if (i < 0) return null; left.splice(i, 1); }
  return left;
}
// a place move's tiles, cleaned: [{ r, c, letter, blank }] or a reason string
function cleanTiles(move) {
  if (!Array.isArray(move.tiles) || !move.tiles.length) return 'Place at least one tile.';
  if (move.tiles.length > RACK) return 'Seven tiles at most.';
  const out = [];
  for (const t of move.tiles) {
    if (!t || typeof t !== 'object') return 'That is not a tile.';
    const r = t.r, c = t.c, letter = typeof t.letter === 'string' ? t.letter.toUpperCase() : '';
    if (!Number.isInteger(r) || !Number.isInteger(c)) return 'That square is off the board.';
    if (!/^[A-Z]$/.test(letter)) return 'Pick a letter for each tile.';
    out.push({ r, c, letter, blank: t.blank === true });
  }
  return out;
}

export function check(S, seat, move) {
  if (!S || S.phase !== 'play') return 'The game is over.';
  if (!myTurn(S, seat)) return 'It is not your turn.';
  if (!move || typeof move !== 'object') return 'That move is not open right now.';
  if (move.type === 'pass') return null;
  if (move.type === 'exchange') {
    if (S.bag.length < RACK) return 'Swapping needs at least 7 tiles in the bag.';
    const ls = move.letters;
    if (!Array.isArray(ls) || !ls.length) return 'Pick the tiles to swap.';
    if (ls.length > RACK) return 'Seven tiles at most.';
    if (!ls.every(l => typeof l === 'string' && /^[A-Z?]$/.test(l))) return 'Pick the tiles to swap.';
    return takeFrom(S.racks[seat], ls) ? null : 'Those tiles are not on your rack.';
  }
  if (move.type === 'place') {
    const tiles = cleanTiles(move);
    if (typeof tiles === 'string') return tiles;
    if (!takeFrom(S.racks[seat], tiles.map(t => (t.blank ? '?' : t.letter)))) return 'Those tiles are not on your rack.';
    const ev = evaluate(S.board, tiles);
    return ev.error || null;
  }
  return 'That move is not open right now.';
}

export function apply(state, seat, move) {
  const why = check(state, seat, move);
  if (why) throw illegal(why + ' (' + JSON.stringify(move) + ')');
  const S = clone(state), beats = [];
  if (move.type === 'place') {
    const tiles = cleanTiles(move);
    const ev = evaluate(S.board, tiles);
    S.racks[seat] = takeFrom(S.racks[seat], tiles.map(t => (t.blank ? '?' : t.letter)));
    for (const t of tiles) { const row = S.board[t.r]; S.board[t.r] = row.slice(0, t.c) + (t.blank ? t.letter.toLowerCase() : t.letter) + row.slice(t.c + 1); }
    S.scores[seat] += ev.score;
    const placed = tiles.map(t => (t.blank ? { r: t.r, c: t.c, letter: t.letter, blank: true } : { r: t.r, c: t.c, letter: t.letter }));
    S.last = { seat, type: 'place', word: ev.main, words: ev.words, score: ev.score, tiles: placed, full: ev.full };
    // tripleWord: a new tile on a Triple Word square (public, for the achievements)
    beat(beats, 'place', { seat, word: ev.main, words: ev.words.map(w => ({ word: w.word, score: w.score })), score: ev.score, tiles: placed, full: ev.full, total: S.scores[seat], tripleWord: tiles.some(t => LAYOUT[t.r][t.c] === 'T') });
    if (ev.full) beat(beats, 'fullweave', { seat, bonus: FULL_BONUS });
    S.scoreless = ev.score > 0 ? 0 : S.scoreless + 1;
    draw(S, seat, beats);
    if (!S.racks[seat].length) return endGame(S, beats, 'out', seat);
  } else if (move.type === 'exchange') {
    const back = move.letters.slice();
    S.racks[seat] = takeFrom(S.racks[seat], back);
    const got = S.bag.splice(S.bag.length - back.length, back.length);
    S.racks[seat].push(...got);
    S.bag.push(...back); shuffle(S, S.bag);
    S.scoreless++;
    S.last = { seat, type: 'exchange', count: back.length };
    beat(beats, 'exchange', { seat, count: back.length });
  } else {
    S.scoreless++;
    S.last = { seat, type: 'pass' };
    beat(beats, 'pass', { seat });
  }
  S.turns++;
  if (S.scoreless >= SCORELESS_END) return endGame(S, beats, 'stuck', null);
  if (S.settings.length === 'quick' && S.turns >= QUICK_ROUNDS * S.n) return endGame(S, beats, 'rounds', null);
  S.turn = (S.turn + 1) % S.n;
  beat(beats, 'turn', { seat: S.turn, round: Math.floor(S.turns / S.n) + 1 });
  return { state: S, beats };
}

function draw(S, seat, beats) {
  const k = Math.min(RACK - S.racks[seat].length, S.bag.length);
  if (k <= 0) return;
  S.racks[seat].push(...S.bag.splice(S.bag.length - k, k));
  beat(beats, 'draw', { seat, count: k, bag: S.bag.length });
  if (!S.bag.length && !S.bagEmptied) { S.bagEmptied = true; beat(beats, 'bagEmpty', {}); }
}

function endGame(S, beats, why, out) {
  const left = S.racks.map(rackValue), adj = new Array(S.n).fill(0);
  if (why === 'out') { for (let s = 0; s < S.n; s++) if (s !== out) { adj[s] = -left[s]; adj[out] += left[s]; } }
  else if (why === 'stuck') for (let s = 0; s < S.n; s++) adj[s] = -left[s];
  for (let s = 0; s < S.n; s++) S.scores[s] += adj[s];
  S.phase = 'over';
  S.turn = -1;
  S.final = { why, out, adjust: adj, racks: S.racks.map(r => r.slice()) };
  beat(beats, 'gameOver', { why, out, adjust: adj.slice(), racks: S.final.racks.map(r => r.slice()), totals: S.scores.slice(), winners: winnersOf(S.scores) });
  return { state: S, beats };
}

function winnersOf(totals) { const hi = Math.max(...totals); return totals.map((v, i) => (v === hi ? i : -1)).filter(i => i >= 0); }

// the hint (top score for the seat to move), worked out once per state
const HINTS = new WeakMap();
function hintFor(S, seat) {
  if (!S.settings.hints || !myTurn(S, seat)) return null;
  if (HINTS.has(S)) return HINTS.get(S);
  const h = bestScore(S.board, S.racks[seat]);
  HINTS.set(S, h);
  return h;
}

export function view(S, seat) {
  const n = S.n, me = Number.isInteger(seat) && seat >= 0 && seat < n ? seat : null;
  return {
    game: ID, n, seat: me, settings: { ...S.settings }, size: SIZE, center: CENTER, phase: S.phase, turn: S.turn,
    round: Math.min(Math.floor(S.turns / n) + 1, S.settings.length === 'quick' ? QUICK_ROUNDS : Infinity), rounds: S.settings.length === 'quick' ? QUICK_ROUNDS : null,
    turns: S.turns, scoreless: S.scoreless,
    board: S.board.slice(), layout: LAYOUT, values: VALUES,
    rack: me === null ? null : S.racks[me].slice(),
    counts: S.racks.map(r => r.length), bag: S.bag.length,
    scores: S.scores.slice(),
    last: S.last && JSON.parse(JSON.stringify(S.last)),
    final: S.final && JSON.parse(JSON.stringify(S.final)), // (racks are shown once the game is over)
    hint: me === null ? null : hintFor(S, me),
    moves: me === null ? [] : legalMoves(S, me),
  };
}

export function score(S) {
  const order = S.scores.map((v, i) => i).sort((a, b) => S.scores[b] - S.scores[a] || a - b);
  return { totals: S.scores.slice(), order, winners: winnersOf(S.scores), done: S.phase === 'over' };
}

export { tileValue };

const game = {
  id: ID, name: NAME, seats: SEATS, settings: SETTINGS, newGame, legalMoves, apply, view, score, check,
  bot: (v, level, rng) => chooseMove(v, level, rng),
};
export default game;
