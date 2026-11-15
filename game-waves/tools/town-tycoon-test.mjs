// Town Tycoon engine tests: many bot games (2-4 players, both lengths, mixed levels), money conserved, no negative cash,
// views and beats leak no secret (dice rng, deck order), replays, hard vs easy, and hand-made rule checks.
// Run: node game-waves/tools/town-tycoon-test.mjs
import game, * as TT from '../server/lib/table-games/town-tycoon.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; if (fails < 30) console.log('FAIL:', msg); } };
const J = x => JSON.stringify(x);
const MOVE_CAP = 20000;
const players = levels => levels.map((l, i) => ({ name: 'P' + i, bot: l, kind: 'bot' }));
const SECRET_KEYS = ['rng', 'seed', 'card']; // the dice rng and a deck's order / index into it

function checkView(v, S, label) {
  const s = J(v);
  ok(!/"rng"|"seed"/.test(s), label + ': view shows rng/seed');
  ok(v.decks && typeof v.decks.lucky === 'number', label + ': deck shown as a count only');
  ok(!s.includes(J(S.decks.lucky)) || S.decks.lucky.length < 3, label + ': deck order leaked');
}
function checkInvariants(S, label) {
  const sum = S.cash.reduce((a, b) => a + b, 0);
  ok(sum === S.n * S.start + S.bankOut - S.bankIn, label + ': money not conserved ' + sum + ' vs ' + (S.n * S.start + S.bankOut - S.bankIn));
  ok(S.cash.every(c => c >= 0), label + ': negative cash ' + J(S.cash));
  for (let i = 0; i < TT.SIZE; i++) {
    if (S.owner[i] >= 0) ok(S.alive[S.owner[i]], label + ': a bankrupt player owns ' + i);
    if (S.lvl[i]) {
      ok(S.owner[i] >= 0 && !S.mort[i], label + ': building on unowned/mortgaged ' + i);
      const g = TT.BOARD[i].group, sp = TT.GROUP_SPACES[g];
      ok(Math.max(...sp.map(j => S.lvl[j])) - Math.min(...sp.map(j => S.lvl[j])) <= 1, label + ': uneven building in group ' + g);
    }
  }
}

function playGame(levels, settings, seed, opts = {}) {
  let S = game.newGame({ players: players(levels), settings, seed });
  const log = [], times = [];
  let moves = 0;
  while (S.phase === 'play' && moves < MOVE_CAP) {
    const seat = S.turn;
    const legal = game.legalMoves(S, seat);
    ok(legal.length > 0, 'no legal move for the seat whose turn it is (stage ' + S.stage + ')');
    if (!legal.length) break;
    for (let k = 0; k < S.n; k++) if (k !== seat) ok(game.legalMoves(S, k).length === 0, 'out of turn moves');
    ok(!legal.some(m => m.type === 'end') || legal[legal.length - 1].type === 'end', 'end not last');
    const v = game.view(S, seat);
    if (opts.checkViews && moves % 7 === 0) { checkView(v, S, 'seat'); checkView(game.view(S, null), S, 'null'); checkView(game.view(S, (seat + 1) % S.n), S, 'other'); }
    const t0 = performance.now();
    const m = game.bot(v, levels[seat]);
    times.push(performance.now() - t0);
    ok(m && legal.some(x => J(x) === J(m)), 'bot move not legal: ' + J(m));
    const r = game.apply(S, seat, m);
    for (const b of r.beats) ok(!SECRET_KEYS.some(k => k in b && k !== 'card') && !('decks' in b), 'beat with a secret: ' + J(b));
    S = r.state; log.push([seat, m]); moves++;
    checkInvariants(S, 'seed ' + seed);
  }
  return { S, log, moves, times };
}

// ---------------------------------------------------------------- many games
const LV = ['easy', 'normal', 'hard'];
let games = 0, done = 0, capped = 0, totalMoves = 0, maxMoves = 0, roundSum = 0, maxTime = 0, timeSum = 0, timeN = 0, bankrupts = 0;
const byLen = { quick: { g: 0, r: 0, m: 0 }, full: { g: 0, r: 0, m: 0, last: 0 } };
for (let k = 0; k < 360; k++) {
  const n = 2 + (k % 3), len = k % 2 ? 'full' : 'quick', start = k % 5 === 0 ? '1000' : '1500';
  const levels = Array.from({ length: n }, (_, i) => LV[(k + i * 2) % 3]);
  const { S, moves, times, log } = playGame(levels, { length: len, start }, 1000 + k, { checkViews: k < 60 });
  games++; totalMoves += moves; maxMoves = Math.max(maxMoves, moves); roundSum += S.round;
  for (const t of times) { maxTime = Math.max(maxTime, t); timeSum += t; timeN++; }
  bankrupts += S.out.length;
  const sc = game.score(S);
  ok(sc.done, 'game did not finish, seed ' + (1000 + k) + ' moves ' + moves);
  if (sc.done) done++;
  if (moves >= MOVE_CAP) capped++;
  ok(sc.winners.length >= 1 && sc.winners.every(w => S.alive[w]), 'winners bad');
  ok(sc.order.length === n, 'order length');
  if (len === 'full') ok(S.round <= 60, 'full game past the cap');
  const B = byLen[len]; B.g++; B.r += S.round; B.m += moves; if (len === 'full' && S.alive.filter(Boolean).length === 1) B.last++;
  // replay
  if (k % 10 === 0) {
    let R = game.newGame({ players: players(levels), settings: { length: len, start }, seed: 1000 + k });
    for (const [seat, m] of log) R = game.apply(R, seat, m).state;
    ok(J(R) === J(S), 'replay differs, seed ' + (1000 + k));
  }
}

// ---------------------------------------------------------------- hard vs easy (and hard vs normal), 2 players, seat swapped
function duel(a, b, N, len) {
  let wa = 0, wb = 0, ties = 0, rounds = 0, moves = 0;
  for (let k = 0; k < N; k++) {
    const levels = k % 2 ? [b, a] : [a, b], ai = k % 2 ? 1 : 0;
    const { S, moves: mv } = playGame(levels, { length: len }, 50000 + k);
    const w = game.score(S).winners;
    if (w.length > 1) ties++; else if (w[0] === ai) wa++; else wb++;
    rounds += S.round; moves += mv;
  }
  return { wa, wb, ties, rounds: (rounds / N).toFixed(1), moves: Math.round(moves / N) };
}
const d1 = duel('hard', 'easy', 400, 'quick');
const d2 = duel('hard', 'easy', 400, 'full');
const d3 = duel('hard', 'normal', 400, 'full');
const d4 = duel('normal', 'easy', 400, 'full');
ok(d1.wa > d1.wb && d2.wa > d2.wb, 'hard should beat easy');

// ---------------------------------------------------------------- hand rule checks
const base = () => game.newGame({ players: players(['normal', 'normal']), settings: { length: 'full' }, seed: 7 });
const roll = (S, a, b) => { // force the next dice: find an rng state giving (a, b)
  for (let r = 0; r < 1e6; r++) {
    const T = { ...S, rng: (S.rng + r * 7919) >>> 0 };
    const U = { ...T };
    const d1 = 1 + Math.floor(rnd(U) * 6), d2 = 1 + Math.floor(rnd(U) * 6);
    if (d1 === a && d2 === b) return T;
  }
  throw new Error('no rng for dice');
};
function rnd(S) { S.rng = (S.rng + 0x6d2b79f5) >>> 0; let t = S.rng; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const act = (S, m) => game.apply(S, S.turn, m);

{ // doubles roll again; a normal roll then ends
  let S = roll(base(), 2, 2);
  let r = act(S, { type: 'roll' }); S = r.state;
  ok(S.pos[0] === 4 && S.again === true, 'doubles: moved 4 and rolls again');
  if (S.stage === 'buy') S = act(S, { type: 'skip' }).state;
  ok(game.legalMoves(S, 0)[0].type === 'roll' && !game.legalMoves(S, 0).some(m => m.type === 'end'), 'doubles: roll listed, end not');
  S = roll(S, 1, 2); S = act(S, { type: 'roll' }).state;
  ok(S.pos[0] === 7 && S.woods[0] === -1, 'lands on the woods corner just visiting');
  ok(game.legalMoves(S, 0).some(m => m.type === 'end'), 'end after a plain roll');
}
{ // three doubles: Lost in the Woods
  let S = base();
  for (let k = 0; k < 3; k++) {
    S = roll(S, 3, 3); S = act(S, { type: 'roll' }).state;
    if (S.stage === 'buy') S = act(S, { type: 'skip' }).state;
    if (S.stage === 'debt') break;
  }
  ok(S.pos[0] === TT.WOODS && S.woods[0] === 0 && !S.again, 'three doubles -> woods, no roll again');
}
{ // the woods: misses, then a forced fee on the third
  let S = base(); S.pos[0] = TT.WOODS; S.woods[0] = 0; S.stage = 'woods';
  const mv = game.legalMoves(S, 0).map(m => m.type);
  ok(mv[0] === 'roll' && mv.includes('pay'), 'woods moves roll, pay');
  for (let k = 0; k < 2; k++) {
    S = roll(S, 1, 2); S = act(S, { type: 'roll' }).state;
    ok(S.pos[0] === TT.WOODS && S.woods[0] === k + 1, 'woods miss ' + k);
    S = act(S, { type: 'end' }).state; // seat 1
    S = roll(S, 1, 2); S = act(S, { type: 'roll' }).state; if (S.stage === 'buy') S = act(S, { type: 'skip' }).state;
    while (S.stage === 'debt') S = act(S, game.legalMoves(S, 1)[0]).state;
    if (S.again) { S.again = false; }
    S = act(S, { type: 'end' }).state;
  }
  const c0 = S.cash[0];
  S = roll(S, 1, 2); S = act(S, { type: 'roll' }).state;
  ok(S.woods[0] === -1 && S.pos[0] === TT.WOODS + 3 && S.cash[0] <= c0 - TT.WOODS_FEE + 0, 'third miss pays and walks 3');
  // doubles get you out free, no extra roll
  let U = base(); U.pos[0] = TT.WOODS; U.woods[0] = 0; U.stage = 'woods';
  U = roll(U, 4, 4); const c = U.cash[0]; U = act(U, { type: 'roll' }).state;
  ok(U.woods[0] === -1 && U.pos[0] === 15 && !U.again && U.cash[0] === c, 'doubles walk out free, no extra roll');
}
{ // passing Town Square
  let S = base(); S.pos[0] = 25;
  S = roll(S, 2, 4); const c = S.cash[0]; S = act(S, { type: 'roll' }).state;
  ok(S.pos[0] === 3 && S.cash[0] === c + TT.PASS_PAY, 'passing Town Square collects B200');
  let U = base(); U.pos[0] = 23; U = roll(U, 2, 3); const c2 = U.cash[0]; U = act(U, { type: 'roll' }).state;
  ok(U.pos[0] === 0 && U.cash[0] === c2 + TT.PASS_PAY, 'landing on Town Square collects B200');
}
{ // building evenly, rent doubles on an unbuilt pair, mortgaged = no rent
  let S = base(); S.owner[1] = 0; S.owner[3] = 0; S.stage = 'manage';
  let mv = game.legalMoves(S, 0);
  ok(mv.some(m => m.type === 'build' && m.space === 1) && mv.some(m => m.type === 'build' && m.space === 3), 'pair: both buildable');
  ok(TT.rentOf(S, 1) === TT.BOARD[1].rents[0] * 2, 'unbuilt pair: double rent');
  S = act(S, { type: 'build', space: 1 }).state;
  mv = game.legalMoves(S, 0);
  ok(!mv.some(m => m.type === 'build' && m.space === 1) && mv.some(m => m.type === 'build' && m.space === 3), 'even building');
  ok(!mv.some(m => m.type === 'mortgage' && (m.space === 1 || m.space === 3)), 'no mortgage while the group has buildings');
  ok(mv.some(m => m.type === 'sell' && m.space === 1), 'can sell the cottage');
  ok(TT.rentOf(S, 1) === TT.BOARD[1].rents[1], 'one cottage rent');
  S = act(S, { type: 'sell', space: 1 }).state;
  S = act(S, { type: 'mortgage', space: 3 }).state;
  ok(TT.rentOf(S, 3) === 0, 'mortgaged: no rent');
  ok(!game.legalMoves(S, 0).some(m => m.type === 'build'), 'no building with a mortgaged pair member');
  // seat 1 lands on the mortgaged space: no rent
  S = act(S, { type: 'end' }).state; S.pos[1] = 0; const c1 = S.cash[1];
  S = roll(S, 1, 2); S = act(S, { type: 'roll' }).state;
  ok(S.cash[1] === c1, 'landing on a mortgaged space pays nothing');
  // and on the unmortgaged one: double rent of the pair
  let U = base(); U.owner[1] = 0; U.owner[3] = 0; U.turn = 1; U.stage = 'roll'; U = roll(U, 0 + 1, 0 + 2);
  U.pos[1] = 26; U = roll(U, 1, 2); const cu = U.cash[1], co = U.cash[0]; U = act(U, { type: 'roll' }).state;
  ok(U.pos[1] === 1 && U.cash[1] === cu + TT.PASS_PAY - 8 && U.cash[0] === co + 8, 'pair rent 2x paid to the owner');
}
{ // debt and bankruptcy to a player
  let S = base(); S.owner[27] = 0; S.owner[26] = 0; S.lvl[27] = 5; S.lvl[26] = 5; S.cash[1] = 100; S.bankIn += 1400; S.turn = 1; S.stage = 'roll';
  S.owner[4] = 1; // a small property for seat 1
  S.pos[1] = 24; S = roll(S, 1, 2); const c0 = S.cash[0]; S = act(S, { type: 'roll' }).state;
  ok(!S.alive[1] && S.phase === 'over' && S.owner[4] === 0 && S.cash[0] === c0 + 100, 'bankrupt to the owner: cash and deeds go over');
  checkInvariants(S, 'bankrupt');
}
{ // debt that can be raised
  let S = base(); S.owner[13] = 0; S.owner[12] = 0; S.lvl[13] = 2; S.lvl[12] = 2; S.cash[1] = 20; S.bankIn += 1480; S.turn = 1; S.stage = 'roll';
  S.owner[4] = 1; S.owner[6] = 1; S.owner[11] = 1; S.owner[24] = 1; S.owner[9] = 1;
  S.pos[1] = 10; S = roll(S, 1, 2); S = act(S, { type: 'roll' }).state;
  const owed = TT.BOARD[13].rents[2];
  ok(S.stage === 'debt' && S.debt.amount === owed, 'owes the 2-cottage rent in debt stage');
  ok(game.legalMoves(S, 1).every(m => m.type === 'mortgage' || m.type === 'sell'), 'debt: only raise moves');
  let guard = 0;
  while (S.stage === 'debt' && guard++ < 20) S = act(S, game.legalMoves(S, 1)[0]).state;
  ok(S.stage === 'manage' && S.alive[1] && S.cash[0] === 1500 + owed, 'debt paid after raising');
  checkInvariants(S, 'debt');
}

// ---------------------------------------------------------------- summary
const pct = (a, n) => (100 * a / n).toFixed(0) + '%';
console.log(`Town Tycoon: ${games} bot games, ${done} finished, ${capped} hit the move cap, avg ${(totalMoves / games).toFixed(0)} moves (max ${maxMoves}), avg ${(roundSum / games).toFixed(1)} rounds, ${bankrupts} bankruptcies`);
console.log(`  quick: avg ${(byLen.quick.r / byLen.quick.g).toFixed(1)} rounds, ${(byLen.quick.m / byLen.quick.g).toFixed(0)} moves; full: avg ${(byLen.full.r / byLen.full.g).toFixed(1)} rounds, ${(byLen.full.m / byLen.full.g).toFixed(0)} moves, ${pct(byLen.full.last, byLen.full.g)} ended last-one-standing`);
console.log(`  bot time: avg ${(timeSum / timeN).toFixed(3)} ms, max ${maxTime.toFixed(2)} ms`);
for (const [name, d] of [['hard vs easy, quick', d1], ['hard vs easy, full', d2], ['hard vs normal, full', d3], ['normal vs easy, full', d4]])
  console.log(`  ${name}: ${pct(d.wa, 400)} / ${pct(d.wb, 400)} (ties ${d.ties}), avg ${d.rounds} rounds, ${d.moves} moves`);
console.log(fails ? `${fails} FAILURES` : 'all checks passed');
process.exit(fails ? 1 : 0);
