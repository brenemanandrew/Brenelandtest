// Table-games achievements test: loads server/lib/tg-achievements.js with a stand-in api (achievements.define / grant,
// players, tableGames.on) and plays real bot games of Word Weave, The Missing Pie and Town Tycoon through it, plus a stub
// Mexican Train beat run. Each game's grants are checked against an independent reading of the game (states and beats):
// every new achievement can be earned, only people (never bots) get them, each is granted once, the old ones still work.
// Run: node game-waves/tools/tg-achievements-test.mjs
import { createRequire } from 'module';
import WW from '../server/lib/table-games/word-weave.js';
import { LAYOUT } from '../server/lib/table-games/word-weave-core.js';
import MP from '../server/lib/table-games/missing-pie.js';
import TT, { GROUP_SPACES } from '../server/lib/table-games/town-tycoon.js';

const require = createRequire(import.meta.url);
const { register, ACHS, TT_PAIRS } = require('../server/lib/tg-achievements.js');

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; if (fails < 40) console.log('FAIL:', msg); } };
const J = x => JSON.stringify(x);
function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---- the stand-in api (the same contract as lib/achievements.js: grant -> true the first time, false after)
const DEFS = new Map(), players = new Map(), listeners = [];
const got = new Map();     // sid -> Map(id -> count of first-time grants, must stay 1)
const calls = [];          // every grant call this game: [sid, id]
const api = {
  players,
  achievements: {
    define(d) { DEFS.set(d.id, d); },
    grant(pl, id) {
      if (!pl || !DEFS.has(id) || !players.has(pl.sid)) return false;
      calls.push([pl.sid, id]);
      const g = got.get(pl.sid) || got.set(pl.sid, new Map()).get(pl.sid);
      if (g.has(id)) return false;
      g.set(id, 1);
      return true;
    },
  },
  tableGames: { on: fn => listeners.push(fn) },
};
register(api);
await new Promise(r => setImmediate(r)); // (the module subscribes on the next tick)
ok(listeners.length === 1, 'subscribed to tableGames.on once');
const has = (sid, id) => !!(got.get(sid) && got.get(sid).has(id));
const emit = (T, ev) => { for (const f of listeners) f(T, ev); };

// ---- definitions
const NEW = ['ww-full-weave', 'ww-big-word', 'ww-triple', 'ww-last-tile', 'mp-solved', 'mp-quick', 'mp-stumper', 'tt-pair', 'tt-shop', 'tt-big-rent', 'tt-last'];
const OLD = ['tg-first-game', 'tg-first-win', 'tg-beat-hard', 'tg-full-table', 'mt-out-double', 'mt-zero', 'mt-full-ride'];
for (const id of [...OLD, ...NEW]) ok(DEFS.has(id), 'defined: ' + id);
ok(DEFS.size === OLD.length + NEW.length, 'no other achievements defined');
for (const a of ACHS) {
  ok(/^[a-z0-9][a-z0-9-]{1,39}$/.test(a.id) && a.title.length <= 40 && a.line.length <= 120 && /^#[0-9a-f]{6}$/i.test(a.color) && a.icon.length <= 24, 'def fits lib/achievements.js limits: ' + a.id);
  ok(!/\u2014|\u2013/.test(a.title + a.line), 'no long dashes: ' + a.id);
}
ok(J(TT_PAIRS) === J(GROUP_SPACES), 'TT_PAIRS matches town-tycoon.js GROUP_SPACES');

// ---- a table like the server's: people in some chairs (sid), bots in the rest
let sidN = 0;
function table(game, kinds, settings) {
  const seats = kinds.map((k, i) => {
    if (k === 'human') { const pl = { sid: 's' + (++sidN), name: 'Kid' + sidN }; players.set(pl.sid, pl); return { kind: 'human', name: pl.name, sid: pl.sid }; }
    return { kind: 'bot', name: 'Bot' + i, level: k, sid: null };
  });
  return { game, seats, order: seats.map((s, i) => i), settings: { ...settings }, phase: 'setup', result: null, hadBot: kinds.some(k => k !== 'human'), createdAt: Date.now() };
}

// plays one game on table T through the same order of events as lib/table-games/index.js applyMove: finish (phase, result),
// then { kind: 'beats' }, then { kind: 'result' }. The oracle(prev, next, beats, seat, add) reads each move independently.
function playGame(G, T, levels, seed, oracle, turnOf) {
  const n = T.order.length, R = rng32(seed);
  T.seed = seed; T.phase = 'play'; T.result = null;
  let S = G.newGame({ players: T.order.map((c, k) => ({ name: 'P' + k, bot: levels[k], kind: T.seats[c].kind })), settings: T.settings, seed });
  const want = new Map(); // engine seat -> Set(id) this game
  const add = (seat, id) => { if (!Number.isInteger(seat)) return; (want.get(seat) || want.set(seat, new Set()).get(seat)).add(id); };
  calls.length = 0;
  let steps = 0;
  while (S.phase !== 'over' && steps++ < 30000) {
    const seat = turnOf(S);
    const m = G.bot(G.view(S, seat), levels[seat], R);
    const r = G.apply(S, seat, m);
    oracle(S, r.state, r.beats, seat, add, T);
    S = r.state;
    const sc = G.score(S);
    if (sc.done) { T.phase = 'over'; T.result = { totals: sc.totals, winners: sc.winners, counted: !T.hadBot }; }
    emit(T, { kind: 'beats', beats: r.beats.map(b => ({ ...b, by: seat })), by: seat });
    if (sc.done) emit(T, { kind: 'result', result: T.result, seats: [] });
  }
  ok(S.phase === 'over', T.game + ' game finished');
  // the generic ones
  const win = G.score(S).winners, hard = T.order.some(c => T.seats[c].kind === 'bot' && T.seats[c].level === 'hard');
  const allPeople = T.order.every(c => T.seats[c].kind === 'human');
  for (let k = 0; k < n; k++) { add(k, 'tg-first-game'); if (win.includes(k)) { add(k, 'tg-first-win'); if (hard) add(k, 'tg-beat-hard'); } if (allPeople && n >= 4) add(k, 'tg-full-table'); }
  // compare: the grant calls this game == the oracle's ids for the seats with a person in them
  const sidSeat = new Map(T.order.map((c, k) => [T.seats[c].sid, k]));
  const gotSet = new Set(calls.map(([sid, id]) => sidSeat.get(sid) + ':' + id));
  const wantSet = new Set();
  for (const [k, ids] of want) for (const id of ids) if (T.seats[T.order[k]].kind === 'human' && players.has(T.seats[T.order[k]].sid)) wantSet.add(k + ':' + id);
  for (const x of wantSet) ok(gotSet.has(x), `${T.game} seed ${seed}: expected grant ${x} missing`);
  for (const x of gotSet) ok(wantSet.has(x), `${T.game} seed ${seed}: unexpected grant ${x}`);
  for (const [sid] of calls) ok(T.seats.some(s => s.sid === sid), 'a grant went to someone not at the table');
  return { want, S };
}

const earnedByPerson = new Set(), earnedByBotSeat = new Set();
function tally(T, want) { for (const [k, ids] of want) for (const id of ids) (T.seats[T.order[k]].kind === 'human' ? earnedByPerson : earnedByBotSeat).add(id); }

// ---- Word Weave
const wwOracle = (prev, next, beats, seat, add) => {
  for (const b of beats) {
    if (b.kind === 'place') {
      if (b.tiles.length === 7) add(seat, 'ww-full-weave');
      if (b.words.some(w => w.score >= 50)) add(seat, 'ww-big-word');
      if (b.tiles.some(t => LAYOUT[t.r][t.c] === 'T')) add(seat, 'ww-triple');
    }
  }
  if (next.phase === 'over' && next.final && next.final.why === 'out') add(next.final.out, 'ww-last-tile');
};
const LV = ['easy', 'normal', 'hard'];
for (let i = 0; i < 24; i++) {
  const n = 2 + (i % 3), kinds = Array.from({ length: n }, (_, k) => (k === 0 || (i % 4 === 0 && k === 1) ? 'human' : LV[(i + k) % 3]));
  if (i % 6 === 5) kinds.fill('human'); // (some all-people tables)
  const levels = kinds.map((k, j) => (k === 'human' ? (j % 2 ? 'normal' : 'hard') : k));
  const T = table('word-weave', kinds, { length: i % 3 === 2 ? 'quick' : 'full', hints: false });
  const { want } = playGame(WW, T, levels, 100 + i, wwOracle, S => S.turn);
  tally(T, want);
}

// ---- The Missing Pie
const mpOracle = (prev, next, beats, seat, add) => {
  for (const b of beats) {
    if (b.kind === 'accuse' && J([b.who, b.what, b.where]) === J([prev.tin.who, prev.tin.what, prev.tin.where])) { add(seat, 'mp-solved'); if (prev.round <= 6) add(seat, 'mp-quick'); }
    if (b.kind === 'noneShown') add(b.seat, 'mp-stumper');
  }
};
const mpTurn = S => MP.view(S, null).turn;
for (let i = 0; i < 40; i++) {
  const n = 3 + (i % 4), kinds = Array.from({ length: n }, (_, k) => (k < 1 + (i % 3) ? 'human' : LV[(i + k) % 3]));
  if (i % 8 === 7) kinds.fill('human');
  const levels = kinds.map(k => (k === 'human' ? 'hard' : k));
  const T = table('missing-pie', kinds, { reveal: i % 2 === 0 });
  const { want } = playGame(MP, T, levels, 300 + i, mpOracle, mpTurn);
  tally(T, want);
}

// ---- Town Tycoon (one table reused game after game: the ownership it follows must start fresh each game)
const ttOracle = (prev, next, beats, seat, add, T) => {
  for (const sp of GROUP_SPACES) { const o = next.owner[sp[0]]; if (o >= 0 && sp.every(j => next.owner[j] === o) && !sp.every(j => prev.owner[j] === o)) add(o, 'tt-pair'); }
  for (let i = 0; i < next.lvl.length; i++) if (next.lvl[i] >= 5 && prev.lvl[i] < 5) add(next.owner[i], 'tt-shop');
  for (const b of beats) if (b.kind === 'rent' && b.amount >= 500) add(b.owner, 'tt-big-rent');
  if (next.phase === 'over' && T.settings.length === 'full' && next.alive.filter(Boolean).length === 1) add(next.alive.indexOf(true), 'tt-last');
};
for (let g = 0; g < 3; g++) {
  const n = 2 + g, kinds = Array.from({ length: n }, (_, k) => (k === 0 ? 'human' : LV[(g + k) % 3]));
  const T = table('town-tycoon', kinds, {});
  for (let i = 0; i < 10; i++) {
    T.settings = { length: i % 3 === 2 ? 'quick' : 'full', start: i % 2 ? '1000' : '1500' };
    const levels = kinds.map(k => (k === 'human' ? 'hard' : k));
    const { want } = playGame(TT, T, levels, 500 + g * 50 + i, ttOracle, S => TT.view(S, null).turn);
    tally(T, want);
  }
}

// ---- Mexican Train (stub beats, as mexican-train.js sends them) and the generic ones on it
{
  const T = table('mexican-train', ['human', 'human', 'hard'], { length: 'full' });
  const [a, b] = T.seats.map(s => s.sid);
  T.seed = 1; T.phase = 'play';
  calls.length = 0;
  emit(T, { kind: 'beats', beats: [{ kind: 'place', seat: 0, double: true }, { kind: 'out', seat: 0 }] });
  emit(T, { kind: 'beats', beats: [{ kind: 'place', seat: 1, double: true }, { kind: 'place', seat: 1, double: false }, { kind: 'out', seat: 1 }] });
  emit(T, { kind: 'beats', beats: [{ kind: 'place', seat: 2, double: true }, { kind: 'out', seat: 2 }, { kind: 'roundEnd', pips: [0, 12, 0] }] });
  ok(has(a, 'mt-out-double') && !has(b, 'mt-out-double'), 'mt-out-double: a double then out (seat 0 yes, seat 1 no)');
  ok(has(a, 'mt-zero') && !has(b, 'mt-zero'), 'mt-zero: zero pips at the round end');
  ok(!calls.some(([sid]) => sid === null || sid === undefined), 'nothing for the bot seat');
  T.phase = 'over'; T.result = { totals: [10, 30, 40], winners: [0], counted: false };
  emit(T, { kind: 'beats', beats: [{ kind: 'roundEnd', pips: [3, 5, 9] }, { kind: 'gameOver', winners: [0], totals: [10, 30, 40] }] });
  emit(T, { kind: 'result', result: T.result, seats: [] });
  for (const id of ['tg-first-game', 'mt-full-ride']) ok(has(a, id) && has(b, id), 'mexican train: ' + id + ' for both people');
  ok(has(a, 'tg-first-win') && has(a, 'tg-beat-hard') && !has(b, 'tg-first-win'), 'mexican train: win + beat hard for the winner only');
  // granted once: the same moments again change nothing
  const before = J([...(got.get(a) || [])]);
  const n0 = calls.length;
  emit(T, { kind: 'beats', beats: [{ kind: 'place', seat: 0, double: true }, { kind: 'out', seat: 0 }] });
  emit(T, { kind: 'result', result: T.result, seats: [] });
  ok(J([...(got.get(a) || [])]) === before, 'granted once: nothing new the second time');
  ok(calls.slice(n0).every(([, id]) => id === 'mt-out-double'), 'the same result is not read twice');
  // a full table of people (4, no bots) and a quick game: no full ride
  const F = table('mexican-train', ['human', 'human', 'human', 'human'], { length: 'quick' });
  F.phase = 'over'; F.result = { totals: [1, 2, 3, 4], winners: [0], counted: true };
  emit(F, { kind: 'beats', beats: [{ kind: 'gameOver' }] });
  ok(F.seats.every(s => has(s.sid, 'tg-full-table') && has(s.sid, 'tg-first-game') && !has(s.sid, 'mt-full-ride')), 'tg-full-table for four people, no full ride in a quick game');
}

// ---- a bots-only table and a person who left: nothing at all
{
  calls.length = 0;
  const T = table('word-weave', ['hard', 'easy'], { length: 'quick', hints: false });
  playGame(WW, T, ['hard', 'easy'], 999, () => {}, S => S.turn);
  ok(calls.length === 0, 'a table of bots grants nothing');
  const U = table('missing-pie', ['human', 'hard', 'hard'], { reveal: false });
  players.delete(U.seats[0].sid); // (left the town)
  calls.length = 0;
  playGame(MP, U, ['hard', 'hard', 'hard'], 777, () => {}, mpTurn);
  ok(calls.length === 0, 'a person no longer in the town gets nothing');
}

// ---- once each, ever
for (const [sid, g] of got) for (const [id, k] of g) ok(k === 1, `${sid} ${id} counted ${k}`);

// ---- every new achievement was earned by a person somewhere, and the bots did earn the moments too (but got nothing)
for (const id of [...NEW, 'tg-first-game', 'tg-first-win', 'tg-beat-hard', 'tg-full-table']) ok(earnedByPerson.has(id), 'never earned by a person in these games: ' + id);
const botMoments = NEW.filter(id => earnedByBotSeat.has(id));
ok(botMoments.length >= 6, 'bots did these moments too (and were given nothing): ' + botMoments.join(' '));

console.log(`tg-achievements: ${DEFS.size} achievements (${NEW.length} new); earned by people: ${[...earnedByPerson].sort().join(' ')}`);
console.log(`moments bots also hit (no grant, checked per game): ${botMoments.join(' ')}`);
console.log(fails ? `FAILED: ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
