// Town Tycoon engine tests: many bot games (2-4 players, both lengths, auctions and trades on and off, mixed levels), money
// conserved, no negative cash, views and beats leak no secret (dice rng, deck order), replays, auctions and trades happen,
// hard vs normal / easy, and hand-made rule checks (auctions and trades too).
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

const stats = { auctions: 0, sold: 0, unsold: 0, bids: 0, offers: 0, accepted: 0, declined: 0, cancelled: 0, gamesAuction: 0, gamesTrade: 0 };
const TIMER_SAFE = { auction: 'pass', offer: 'decline', trade: 'cancel' };
function playGame(levels, settings, seed, opts = {}) {
  let S = game.newGame({ players: players(levels), settings, seed });
  const log = [], times = [];
  let moves = 0, sawA = false, sawT = false;
  while (S.phase === 'play' && moves < MOVE_CAP) {
    const seat = TT.actor(S);
    ok(game.view(S, null).turn === seat && game.view(S, null).roller === S.turn, 'view.turn is the actor');
    const legal = game.legalMoves(S, seat);
    ok(legal.length > 0, 'no legal move for the seat whose turn it is (stage ' + S.stage + ')');
    if (!legal.length) break;
    for (let k = 0; k < S.n; k++) if (k !== seat) ok(game.legalMoves(S, k).length === 0, 'out of turn moves');
    ok(!legal.some(m => m.type === 'end') || legal[legal.length - 1].type === 'end', 'end not last');
    if (TIMER_SAFE[S.stage]) ok(legal[0].type === TIMER_SAFE[S.stage], 'timer-safe moves[0] in ' + S.stage);
    ok(legal.every(m => J(m) === J(JSON.parse(J(m)))) && new Set(legal.map(J)).size === legal.length, 'moves listable and unique');
    if (!settings.auctions && settings.auctions !== undefined) ok(S.stage !== 'auction', 'auction with auctions off');
    if (!settings.trades && settings.trades !== undefined) ok(!legal.some(m => m.type === 'trade'), 'trade with trades off');
    const v = game.view(S, seat);
    if (opts.checkViews && moves % 7 === 0) { checkView(v, S, 'seat'); checkView(game.view(S, null), S, 'null'); checkView(game.view(S, (seat + 1) % S.n), S, 'other'); }
    const t0 = performance.now();
    const m = game.bot(v, levels[seat]);
    times.push(performance.now() - t0);
    ok(m && legal.some(x => J(x) === J(m)), 'bot move not legal: ' + J(m));
    const r = game.apply(S, seat, m);
    for (const b of r.beats) {
      ok(!SECRET_KEYS.some(k => k in b && k !== 'card') && !('decks' in b), 'beat with a secret: ' + J(b));
      if (b.kind === 'auction') { if (b.step === 'start') { stats.auctions++; sawA = true; } else if (b.step === 'bid') stats.bids++; else if (b.step === 'unsold') stats.unsold++; }
      if (b.kind === 'buy' && b.auction) stats.sold++;
      if (b.kind === 'trade') { if (b.step === 'offer') { stats.offers++; sawT = true; } else if (b.step === 'accept') stats.accepted++; else if (b.step === 'decline') stats.declined++; else if (b.step === 'cancel') stats.cancelled++; }
    }
    S = r.state; log.push([seat, m]); moves++;
    checkInvariants(S, 'seed ' + seed);
  }
  if (sawA) stats.gamesAuction++;
  if (sawT) stats.gamesTrade++;
  return { S, log, moves, times };
}

// ---------------------------------------------------------------- many games
const LV = ['easy', 'normal', 'hard'];
let games = 0, done = 0, capped = 0, totalMoves = 0, maxMoves = 0, roundSum = 0, maxTime = 0, timeSum = 0, timeN = 0, bankrupts = 0;
const byLen = { quick: { g: 0, r: 0, m: 0 }, full: { g: 0, r: 0, m: 0, last: 0 } };
const offStats = { quick: { g: 0, r: 0 }, full: { g: 0, r: 0 } }, onStats = { quick: { g: 0, r: 0 }, full: { g: 0, r: 0 } };
for (let k = 0; k < 480; k++) {
  const n = 2 + (k % 3), len = k % 2 ? 'full' : 'quick', start = k % 5 === 0 ? '1000' : '1500';
  // auctions and trades: both on (half the games), each alone, both off
  const mode = (k >> 1) % 4, auctions = mode === 0 || mode === 1, trades = mode === 0 || mode === 2;
  const levels = Array.from({ length: n }, (_, i) => LV[(k + i * 2) % 3]);
  const set = { length: len, start, auctions, trades };
  const { S, moves, times, log } = playGame(levels, set, 1000 + k, { checkViews: k < 80 });
  const OS = mode === 3 ? offStats : mode === 0 ? onStats : null; if (OS) { OS[len].g++; OS[len].r += S.round; }
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
    let R = game.newGame({ players: players(levels), settings: set, seed: 1000 + k });
    for (const [seat, m] of log) R = game.apply(R, seat, m).state;
    ok(J(R) === J(S), 'replay differs, seed ' + (1000 + k));
  }
}

// ---------------------------------------------------------------- hard vs easy (and hard vs normal), 2 players, seat swapped
function duel(a, b, N, len, n = 2) {
  let wa = 0, wb = 0, ties = 0, rounds = 0, moves = 0;
  for (let k = 0; k < N; k++) {
    // one seat a, the rest b, a's seat rotating
    const ai = k % n, levels = Array.from({ length: n }, (_, i) => (i === ai ? a : b));
    const { S, moves: mv } = playGame(levels, { length: len }, 50000 + k);
    const w = game.score(S).winners;
    if (w.length > 1 && w.includes(ai)) ties++; else if (w[0] === ai) wa++; else wb++;
    rounds += S.round; moves += mv;
  }
  return { wa, wb, ties, rounds: (rounds / N).toFixed(1), moves: Math.round(moves / N) };
}
const d1 = duel('hard', 'easy', 400, 'quick');
const d2 = duel('hard', 'easy', 400, 'full');
const d3 = duel('hard', 'normal', 1000, 'full');
const d4 = duel('normal', 'easy', 400, 'full');
const d5 = duel('hard', 'normal', 400, 'quick');
const d6 = duel('hard', 'normal', 300, 'full', 3);
ok(d1.wa > d1.wb && d2.wa > d2.wb, 'hard should beat easy');
ok(d3.wa > d3.wb, 'hard should beat normal');

// ---------------------------------------------------------------- hand rule checks
const base = (more = {}) => game.newGame({ players: players(['normal', 'normal']), settings: { length: 'full', auctions: false, trades: false, ...more }, seed: 7 });
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
const act = (S, m) => game.apply(S, TT.actor(S), m);

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

{ // settings: both default on; off when asked
  const d = game.newGame({ players: players(['normal', 'normal']), seed: 1 });
  ok(d.settings.auctions === true && d.settings.trades === true, 'auctions and trades default on');
  const o = game.newGame({ players: players(['normal', 'normal']), settings: { auctions: false, trades: 'false' }, seed: 1 });
  ok(o.settings.auctions === false && o.settings.trades === false, 'auctions and trades off');
  ok(TT.SETTINGS.some(x => x.key === 'auctions' && x.kind === 'toggle' && x.default === true) && TT.SETTINGS.some(x => x.key === 'trades' && x.kind === 'toggle'), 'toggles listed');
}
{ // an auction: skip -> everyone bids from the next seat, the lander last; the last one in buys for the bid
  let S = game.newGame({ players: players(['normal', 'normal', 'normal']), settings: { length: 'full', trades: false }, seed: 7 });
  S = roll(S, 1, 3); S = act(S, { type: 'roll' }).state; // seat 0 to Pier Walk (4)
  ok(S.stage === 'buy', 'auction: buy stage first');
  let r = act(S, { type: 'skip' }); S = r.state;
  ok(S.stage === 'auction' && S.auction.seat === 1 && J(S.auction.in) === J([1, 2, 0]) && r.beats.some(b => b.kind === 'auction' && b.step === 'start'), 'auction starts at the next seat, lander last');
  const v1 = game.view(S, 1);
  ok(v1.turn === 1 && v1.roller === 0 && J(v1.moves) === J([{ type: 'pass' }, { type: 'bid', amount: 10 }, { type: 'bid', amount: 50 }, { type: 'bid', amount: 100 }]), 'auction moves: pass first, then the raises');
  ok(game.legalMoves(S, 0).length === 0 && game.legalMoves(S, 2).length === 0, 'only the bidder moves');
  S = act(S, { type: 'bid', amount: 50 }).state;
  ok(S.auction.seat === 2 && S.auction.lead === 1 && S.auction.bid === 50, 'bid 50, on to seat 2');
  S = act(S, { type: 'pass' }).state;
  ok(S.auction.seat === 0 && J(S.auction.in) === J([1, 0]), 'seat 2 out');
  S = act(S, { type: 'bid', amount: 60 }).state;
  ok(S.auction.seat === 1, 'back to seat 1 (seat 2 passed)');
  const c1 = S.cash[1];
  r = act(S, { type: 'pass' }); S = r.state;
  ok(S.stage === 'manage' && S.owner[4] === 0 && S.cash[0] === 1500 - 60 && S.cash[1] === c1, 'seat 0 wins for B60');
  ok(r.beats.some(b => b.kind === 'buy' && b.auction && b.price === 60 && b.seat === 0), 'a buy beat marked auction');
  checkInvariants(S, 'auction');
  // nobody bids: it stays the bank's
  let U = game.newGame({ players: players(['normal', 'normal']), settings: { length: 'full', trades: false }, seed: 7 });
  U = roll(U, 1, 3); U = act(U, { type: 'roll' }).state; U = act(U, { type: 'skip' }).state;
  U = act(U, { type: 'pass' }).state; r = act(U, { type: 'pass' }); U = r.state;
  ok(U.stage === 'manage' && U.owner[4] === -1 && r.beats.some(b => b.kind === 'auction' && b.step === 'unsold'), 'all pass: unsold');
  // the cap: never past twice the price, and a bidder short of the next raise drops out
  let C = game.newGame({ players: players(['normal', 'normal']), settings: { length: 'full', trades: false }, seed: 7 });
  C = roll(C, 1, 3); C = act(C, { type: 'roll' }).state; C = act(C, { type: 'skip' }).state;
  let guard = 0;
  while (C.stage === 'auction' && guard++ < 100) { const mv = game.legalMoves(C, TT.actor(C)); ok(mv.every(m => m.type !== 'bid' || m.amount <= 200), 'cap 2x price'); C = act(C, mv.length > 1 ? mv[1] : mv[0]).state; }
  ok(C.stage === 'manage' && C.owner[4] >= 0 && guard <= 21, 'raising +10 always ends at the cap: ' + guard);
  // short of cash: no buy stage, the auction starts at once (lander included when it has B10)
  let D = game.newGame({ players: players(['normal', 'normal']), settings: { length: 'full', trades: false }, seed: 7 });
  D.cash[0] = 40; D.bankIn += 1460; D = roll(D, 1, 3); r = act(D, { type: 'roll' }); D = r.state;
  ok(D.stage === 'auction' && r.beats.some(b => b.kind === 'skip' && b.short), 'short: straight to auction');
  D = act(D, { type: 'bid', amount: 10 }).state; ok(D.auction.seat === 0, 'lander bids');
  D = act(D, { type: 'bid', amount: 20 }).state; D = act(D, { type: 'bid', amount: 30 }).state; D = act(D, { type: 'bid', amount: 40 }).state;
  ok(J(game.legalMoves(D, 1)) === J([{ type: 'pass' }, { type: 'bid', amount: 50 }, { type: 'bid', amount: 90 }, { type: 'bid', amount: 140 }]), 'raises listed');
  D = act(D, { type: 'bid', amount: 50 }).state;
  ok(D.stage === 'manage' && D.owner[4] === 1 && D.cash[1] === 1500 - 50, 'lander cannot raise past its cash: auto out, seat 1 wins at 50');
  checkInvariants(D, 'auction short');
  // auctions off: skip leaves it
  let E = game.newGame({ players: players(['normal', 'normal']), settings: { length: 'full', auctions: false }, seed: 7 });
  E = roll(E, 1, 3); E = act(E, { type: 'roll' }).state; E = act(E, { type: 'skip' }).state;
  ok(E.stage === 'manage' && E.owner[4] === -1 && !E.auction, 'auctions off: no auction');
}
{ // a trade: open, pick, money, send, accept / decline; the timer-safe first moves; at most 2 offers a turn
  let S = base({ trades: true }); S.owner[1] = 0; S.owner[3] = 1; S.owner[4] = 1; S.owner[6] = 0; S.lvl[6] = 0;
  let mv = game.legalMoves(S, 0);
  ok(mv[0].type === 'roll' && mv.some(m => J(m) === J({ type: 'trade', to: 1 })), 'trade listed before the roll');
  S = act(S, { type: 'trade', to: 1 }).state;
  mv = game.legalMoves(S, 0);
  ok(S.stage === 'trade' && mv[0].type === 'cancel' && !mv.some(m => m.type === 'send'), 'draft: cancel first, no send while empty');
  ok([1, 3, 4, 6].every(i => mv.some(m => m.type === 'pick' && m.space === i)), 'both players places listed');
  S = act(S, { type: 'pick', space: 6 }).state; S = act(S, { type: 'pick', space: 3 }).state;
  S = act(S, { type: 'cash', add: 50 }).state; S = act(S, { type: 'cash', add: -10 }).state;
  ok(J(S.trade.give) === J([6]) && J(S.trade.get) === J([3]) && S.trade.cash === 40, 'draft built');
  S = act(S, { type: 'pick', space: 6 }).state; S = act(S, { type: 'pick', space: 6 }).state;
  ok(J(S.trade.give) === J([6]), 'toggle twice');
  S = act(S, { type: 'send' }).state;
  const v = game.view(S, null);
  ok(S.stage === 'offer' && v.turn === 1 && v.roller === 0 && v.trade.sent, 'offer: seat 1 to answer');
  ok(J(game.legalMoves(S, 1)) === J([{ type: 'decline' }, { type: 'accept' }]) && game.legalMoves(S, 0).length === 0, 'answer: decline first');
  const c0 = S.cash[0], c1 = S.cash[1];
  const A = act(S, { type: 'accept' }).state;
  ok(A.owner[6] === 1 && A.owner[3] === 0 && A.cash[0] === c0 - 40 && A.cash[1] === c1 + 40 && A.stage === 'roll' && !A.trade, 'accepted: swapped, money paid, back to the roll');
  ok(game.legalMoves(A, 0).some(m => m.type === 'build' && m.space === 1), 'the pair is buildable after the trade');
  checkInvariants(A, 'trade');
  let Dd = act(S, { type: 'decline' }).state;
  ok(Dd.owner[6] === 0 && Dd.owner[3] === 1 && Dd.cash[0] === c0 && Dd.declined.length === 1 && Dd.stage === 'roll', 'declined: nothing changes, remembered');
  Dd = act(Dd, { type: 'trade', to: 1 }).state; Dd = act(Dd, { type: 'cancel' }).state;
  ok(!game.legalMoves(Dd, 0).some(m => m.type === 'trade'), 'two offers a turn at most');
  // money limits: never more than either has
  let M = base({ trades: true }); M.owner[1] = 0; M.cash[0] = 60; M.cash[1] = 20; M.bankIn += 2920;
  M = act(M, { type: 'trade', to: 1 }).state;
  mv = game.legalMoves(M, 0).filter(m => m.type === 'cash').map(m => m.add);
  ok(J(mv) === J([-10, 10, 50]), 'money steps within both purses: ' + J(mv));
  // buildings on the colour: not tradable
  let B = base({ trades: true }); B.owner[1] = 0; B.owner[3] = 0; B.lvl[1] = 1; B.owner[4] = 1;
  B = act(B, { type: 'trade', to: 1 }).state;
  ok(!game.legalMoves(B, 0).some(m => m.type === 'pick' && (m.space === 1 || m.space === 3)), 'a built colour is not tradable');
  // trades off
  const O = base(); O.owner[1] = 0; ok(!game.legalMoves(O, 0).some(m => m.type === 'trade'), 'trades off: none');
  // nothing to trade at all: no trade move
  ok(!game.legalMoves(base({ trades: true }), 0).some(m => m.type === 'trade'), 'no places owned: no trade');
}
{ // bots answer by value: a pair handed to the other side is declined by normal / hard, a fair swap accepted
  let S = base({ trades: true }); S.owner[1] = 0; S.owner[3] = 1; S.owner[4] = 1; S.owner[6] = 0;
  S = act(S, { type: 'trade', to: 1 }).state; S = act(S, { type: 'pick', space: 3 }).state; S = act(S, { type: 'cash', add: 10 }).state; S = act(S, { type: 'send' }).state;
  const v = game.view(S, 1);
  ok(game.bot(v, 'hard').type === 'decline' && game.bot(v, 'normal').type === 'decline', 'B10 for a pair-maker: declined');
  let U = base({ trades: true }); U.owner[1] = 0; U.owner[3] = 1; U.owner[4] = 1; U.owner[6] = 0;
  U = act(U, { type: 'trade', to: 1 }).state; U = act(U, { type: 'pick', space: 3 }).state; U = act(U, { type: 'pick', space: 6 }).state; U = act(U, { type: 'send' }).state;
  ok(game.bot(game.view(U, 1), 'normal').type === 'accept', 'normal accepts a swap that completes its pair too');
  // a hard bot with a half of each of two pairs offers the swap itself
  let H = base({ trades: true }); H.owner[8] = 0; H.owner[10] = 1; H.owner[12] = 1; H.owner[13] = 0;
  const hm = game.bot(game.view(H, 0), 'hard');
  ok(hm && hm.type === 'trade' && hm.to === 1, 'hard opens a trade: ' + J(hm));
  let guard = 0;
  while (H.stage !== 'offer' && guard++ < 30) H = act(H, game.bot(game.view(H, 0), 'hard')).state;
  ok(H.stage === 'offer' && H.trade.get.length === 1, 'hard builds and sends its offer: ' + J(H.trade));
}

// ---------------------------------------------------------------- summary
const pct = (a, n) => (100 * a / n).toFixed(0) + '%';
console.log(`Town Tycoon: ${games} bot games, ${done} finished, ${capped} hit the move cap, avg ${(totalMoves / games).toFixed(0)} moves (max ${maxMoves}), avg ${(roundSum / games).toFixed(1)} rounds, ${bankrupts} bankruptcies`);
console.log(`  quick: avg ${(byLen.quick.r / byLen.quick.g).toFixed(1)} rounds, ${(byLen.quick.m / byLen.quick.g).toFixed(0)} moves; full: avg ${(byLen.full.r / byLen.full.g).toFixed(1)} rounds, ${(byLen.full.m / byLen.full.g).toFixed(0)} moves, ${pct(byLen.full.last, byLen.full.g)} ended last-one-standing`);
console.log(`  bot time: avg ${(timeSum / timeN).toFixed(3)} ms, max ${maxTime.toFixed(2)} ms`);
console.log(`  auctions: ${stats.auctions} (${stats.sold} sold, ${stats.unsold} unsold, ${stats.bids} bids) in ${stats.gamesAuction} games (all games run, duels included); trades: ${stats.offers} offers, ${stats.accepted} accepted, ${stats.declined} declined, ${stats.cancelled} cancelled, in ${stats.gamesTrade} games`);
console.log(`  rounds with auctions+trades on: quick ${(onStats.quick.r / onStats.quick.g).toFixed(1)}, full ${(onStats.full.r / onStats.full.g).toFixed(1)}; both off: quick ${(offStats.quick.r / offStats.quick.g).toFixed(1)}, full ${(offStats.full.r / offStats.full.g).toFixed(1)}`);
ok(stats.auctions > 100 && stats.sold > 50 && stats.offers > 30 && stats.accepted > 5, 'auctions and trades happen');
for (const [name, d, N] of [['hard vs easy, quick', d1, 400], ['hard vs easy, full', d2, 400], ['hard vs normal, full', d3, 1000], ['normal vs easy, full', d4, 400], ['hard vs normal, quick', d5, 400], ['hard vs 2 normal, full (3 players)', d6, 300]])
  console.log(`  ${name}: ${pct(d.wa, N)} / ${pct(d.wb, N)} (ties ${d.ties}), avg ${d.rounds} rounds, ${d.moves} moves`);
console.log(fails ? `${fails} FAILURES` : 'all checks passed');
process.exit(fails ? 1 : 0);
