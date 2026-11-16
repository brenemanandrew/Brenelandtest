// Pillow Forts engine tests: many bot games (2-6 crews, quick and full, treat cards on and off, mixed levels), every move
// legal and listable, moves[0] timer-safe in every stage, pillows and treat cards conserved, views and beats leak no secret
// (other crews' treats, the deck order, the rng), games end within the round cap, replays, bot speed, win rates (hard vs
// normal / easy) and hand-made rule checks (dice, region bonus, trade-ins, flopping takes treats, move-ins, shuffles, wins).
// Run: node game-waves/tools/pillow-forts-test.mjs
import game, * as PF from '../server/lib/table-games/pillow-forts.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; if (fails < 40) console.log('FAIL:', msg); } };
const J = x => JSON.stringify(x);
const MOVE_CAP = 6000;
const players = levels => levels.map((l, i) => ({ name: 'P' + i, bot: l, kind: 'bot' }));
const TIMER_SAFE = { place: 'auto', attack: 'end', advance: 'advance', cash: 'trade' };

function checkView(v, S, me, label) {
  const s = J(v);
  ok(!/"rng"|"seed"|"hands"/.test(s), label + ': view shows rng/seed/hands');
  ok(typeof v.deck === 'number' && typeof v.discard === 'number', label + ': deck and discard as counts');
  ok(v.cards.every((c, k) => c === S.hands[k].length), label + ': card counts');
  ok(!('deck' in v && Array.isArray(v.deck)), label + ': deck order leaked');
  if (me === null) ok(v.hand.length === 0 && v.moves.length === 0, label + ': spectator sees a hand or moves');
  else ok(J(v.hand.map(c => c.id)) === J(S.hands[me]), label + ': own hand');
  // no other crew's card ids anywhere in the view
  for (let k = 0; k < S.n; k++) if (k !== me && S.hands[k].length) ok(!v.hand.some(c => S.hands[k].includes(c.id)), label + ': another hand shown');
}
function checkInvariants(S, label) {
  for (let i = 0; i < PF.SIZE; i++) {
    const zeroOk = S.stage === 'advance' && S.adv && S.adv.to === i;
    ok(S.pillows[i] >= (zeroOk ? 0 : 1), label + ': area ' + i + ' has ' + S.pillows[i] + ' pillows');
    ok(S.owner[i] === PF.TEDDY ? S.teddies : S.owner[i] >= 0 && S.owner[i] < S.n, label + ': owner');
  }
  for (let k = 0; k < S.n; k++) ok(S.alive[k] === PF.areasOf(S.owner, k) > 0, label + ': alive mismatch seat ' + k);
  if (S.settings.cards) ok(S.hands.reduce((t, h) => t + h.length, 0) + S.deck.length + S.discard.length === PF.CARDS.length, label + ': cards not conserved');
  else ok(S.hands.every(h => !h.length) && !S.deck.length, label + ': cards with cards off');
  ok(S.left >= 0, label + ': left < 0');
}

const BEAT_KEYS_SECRET = ['hand', 'hands', 'deck', 'rng', 'seed', 'card', 'ids'];
const stats = { battles: 0, blitz: 0, claims: 0, regions: 0, broke: 0, flops: 0, cash: 0, forced: 0, draws: 0, shifts: 0, advChoice: 0, auto: 0 };
const times = [];
function playGame(levels, settings, seed, opts = {}) {
  let S = game.newGame({ players: players(levels), settings, seed });
  const log = [];
  let moves = 0;
  while (S.phase === 'play' && moves < MOVE_CAP) {
    const seat = S.turn;
    ok(game.view(S, null).turn === seat, 'view.turn is the crew to act');
    const legal = game.legalMoves(S, seat);
    ok(legal.length > 0, 'no legal move (stage ' + S.stage + ')');
    if (!legal.length) break;
    if (moves % 5 === 0) for (let k = 0; k < S.n; k++) if (k !== seat) ok(game.legalMoves(S, k).length === 0, 'out of turn moves');
    ok(legal[0].type === TIMER_SAFE[S.stage], 'timer-safe moves[0] in ' + S.stage + ': ' + J(legal[0]));
    if (S.stage === 'advance') ok(legal[0].n === Math.min(...legal.map(m => m.n)), 'advance: smallest first');
    if (S.stage === 'cash') ok(legal.every(m => m.type === 'trade'), 'cash: only trades');
    if (moves % 3 === 0) ok(legal.every(m => J(m) === J(JSON.parse(J(m)))) && new Set(legal.map(J)).size === legal.length, 'moves listable and unique');
    const v = game.view(S, seat);
    if (opts.checkViews && moves % 6 === 0) { checkView(v, S, seat, 'seat'); checkView(game.view(S, null), S, null, 'null'); checkView(game.view(S, (seat + 1) % S.n), S, (seat + 1) % S.n, 'other'); }
    const t0 = performance.now();
    const m = game.bot(v, levels[seat]);
    times.push(performance.now() - t0);
    ok(m && legal.some(x => J(x) === J(m)), 'bot move not legal: ' + J(m));
    if (!m) break;
    const r = game.apply(S, seat, m);
    for (const b of r.beats) {
      ok(!BEAT_KEYS_SECRET.some(k => k in b), 'beat with a secret: ' + J(b));
      ok(typeof b.kind === 'string' && Number.isFinite(b.dwell), 'beat kind/dwell: ' + J(b));
      if (b.kind === 'battle') { stats.battles++; if (b.blitz) stats.blitz++; ok(b.a.length >= 1 && b.a.length <= 3 && b.d.length >= 1 && b.d.length <= 2, 'dice counts'); }
      if (b.kind === 'claim') { stats.claims++; if (b.broke >= 0) stats.broke++; }
      if (b.kind === 'region') stats.regions++;
      if (b.kind === 'flop') stats.flops++;
      if (b.kind === 'cash') { stats.cash++; if (b.forced) stats.forced++; }
      if (b.kind === 'draw') { stats.draws++; ok(Object.keys(b).sort().join() === 'cards,dwell,kind,seat', 'draw beat holds only the count'); }
      if (b.kind === 'shift') stats.shifts++;
      if (b.kind === 'place' && b.auto) stats.auto++;
    }
    if (m.type === 'advance') stats.advChoice++;
    S = r.state; log.push([seat, m]); moves++;
    if (moves % 2 === 0 || S.phase !== 'play') checkInvariants(S, 'seed ' + seed);
  }
  return { S, log, moves };
}

// ---------------------------------------------------------------- many games: every seat count, both lengths, cards on / off
const LV = ['easy', 'normal', 'hard'];
let games = 0, done = 0, capped = 0, totalMoves = 0, maxMoves = 0;
const by = {};
for (let k = 0; k < 400; k++) {
  const n = 2 + (k % 5), len = (k >> 1) % 2 ? 'full' : 'quick', cards = (k >> 2) % 2 === 0;
  const levels = Array.from({ length: n }, (_, i) => LV[(k + i * 2) % 3]);
  const set = { length: len, cards };
  const { S, moves, log } = playGame(levels, set, 3000 + k, { checkViews: k < 100 });
  games++; totalMoves += moves; maxMoves = Math.max(maxMoves, moves);
  const sc = game.score(S);
  ok(sc.done, `game did not finish: n ${n} ${len} seed ${3000 + k} after ${moves} moves`);
  if (sc.done) done++;
  if (moves >= MOVE_CAP) capped++;
  ok(sc.winners.length >= 1 && sc.winners.every(w => S.alive[w]), 'winners bad ' + J(sc.winners));
  ok(sc.order.length === n && new Set(sc.order).size === n, 'order');
  ok(S.round <= PF.ROUNDS[len], 'past the round cap');
  const key = n + ' ' + len; const B = by[key] || (by[key] = { g: 0, r: 0, m: 0, why: {} });
  B.g++; B.r += S.round; B.m += moves; B.why[S.why] = (B.why[S.why] || 0) + 1;
  if (k % 8 === 0) {
    let R = game.newGame({ players: players(levels), settings: set, seed: 3000 + k });
    for (const [seat, m] of log) R = game.apply(R, seat, m).state;
    ok(J(R) === J(S), 'replay differs, seed ' + (3000 + k));
  }
}

// ---------------------------------------------------------------- win rates
function duel(a, b, N, len, n = 2) {
  let wa = 0, ties = 0, rounds = 0;
  for (let k = 0; k < N; k++) {
    const ai = k % n, levels = Array.from({ length: n }, (_, i) => (i === ai ? a : b));
    const { S } = playGame(levels, { length: len }, 70000 + k * 7 + n);
    const w = game.score(S).winners;
    if (w.length > 1 && w.includes(ai)) ties++; else if (w[0] === ai) wa++;
    rounds += S.round;
  }
  return { wa, N, n, ties, rounds: (rounds / N).toFixed(1) };
}
const D = [
  ['hard vs normal, 2 players, quick', duel('hard', 'normal', 400, 'quick')],
  ['hard vs normal, 2 players, full', duel('hard', 'normal', 400, 'full')],
  ['hard vs easy, 2 players, quick', duel('hard', 'easy', 200, 'quick')],
  ['normal vs easy, 2 players, full', duel('normal', 'easy', 200, 'full')],
  ['hard vs 2 normal, quick', duel('hard', 'normal', 240, 'quick', 3)],
  ['hard vs 3 normal, quick', duel('hard', 'normal', 240, 'quick', 4)],
  ['hard vs 2 normal, full', duel('hard', 'normal', 240, 'full', 3)],
  ['hard vs 3 normal, full', duel('hard', 'normal', 240, 'full', 4)],
  ['hard vs 5 normal, full', duel('hard', 'normal', 180, 'full', 6)],
];
ok(D[0][1].wa / D[0][1].N > 0.58 && D[1][1].wa / D[1][1].N > 0.6, 'hard should beat normal 60%+ head to head');
ok(D[2][1].wa / D[2][1].N > 0.9 && D[3][1].wa / D[3][1].N > 0.85, 'hard and normal should beat easy');
// (3 crews: about its fair share and a bit; 4+: well over it)
for (const [name, d] of D.slice(4)) ok(d.wa / d.N > (d.n >= 4 ? 1.3 : 0.95) / d.n, 'hard should beat its share among normals: ' + name);

// ---------------------------------------------------------------- hand rule checks
function rnd(S) { S.rng = (S.rng + 0x6d2b79f5) >>> 0; let t = S.rng; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
// an rng state whose next dice are exactly `dice`
function forceDice(S, dice) {
  for (let r = 0; r < 5e6; r++) {
    const T = { rng: (S.rng + r * 7919) >>> 0 }, U = { rng: T.rng };
    if (dice.every(x => 1 + Math.floor(rnd(U) * 6) === x)) return { ...S, rng: T.rng };
  }
  throw new Error('no rng for ' + dice);
}
// a bare 3-crew board: everything seat 2's with 1 pillow, then the bits each check sets up
function board(set = {}, n = 3) {
  const S = game.newGame({ players: players(Array(n).fill('normal')), settings: { length: 'full', ...set }, seed: 5 });
  S.owner = new Array(PF.SIZE).fill(n - 1); S.pillows = new Array(PF.SIZE).fill(1); S.hands = S.hands.map(() => []);
  S.deck = set.cards === false ? [] : PF.CARDS.map(c => c.id); S.discard = []; S.alive = new Array(n).fill(true); S.out = [];
  S.turn = 0; S.stage = 'attack'; S.left = 0; S.gained = false; S.battles = 0; S.adv = null; S.round = 1; S.first = 0;
  return S;
}
const act = (S, m) => game.apply(S, S.turn, m);

{ // the dice: highest against highest, ties to the defender
  let r = PF.throwDice([6, 3, 1], [5, 3]);
  ok(r.dLost === 1 && r.aLost === 1 && J(r.a) === J([6, 3, 1]), 'dice: 6v5 win, 3v3 tie goes to the defender');
  r = PF.throwDice([2], [2, 1]); ok(r.aLost === 1 && r.dLost === 0, 'dice: one pair only, tie to the defender');
  r = PF.throwDice([1, 6, 6], [1]); ok(r.dLost === 1 && r.aLost === 0, 'dice: one defender die, one comparison');
  r = PF.throwDice([4, 5], [6, 2]); ok(r.aLost === 1 && r.dLost === 1, 'dice: sorted before comparing');
}
{ // a throw through the engine: the dice counts, the losses applied, a won area moved into with the choices
  let S = board(); S.owner[10] = 0; S.pillows[10] = 6; S.owner[11] = 1; S.pillows[11] = 2; S.owner[4] = 0; S.owner[0] = 1;
  S = forceDice(S, [6, 5, 1, 4, 2]); // attacker 6 5 1 (3 dice: 5 pillows past the home one), defender 4 2
  let r = act(S, { type: 'roll', from: 10, to: 11 });
  let b = r.beats.find(x => x.kind === 'battle');
  ok(b && b.a.length === 3 && b.d.length === 2 && b.dLost === 2 && b.aLost === 0 && b.won, 'engine throw: 3 dice v 2, both defenders flop: ' + J(b));
  ok(r.state.stage === 'advance' && r.state.owner[11] === 0 && J(r.state.adv.choices) === J([3, 4, 5]), 'won: move in at least the dice thrown: ' + J(r.state.adv));
  ok(r.beats.some(x => x.kind === 'claim' && x.to === 11 && x.def === 1), 'claim beat');
  const A = act(r.state, { type: 'advance', n: 4 }).state;
  ok(A.pillows[10] === 2 && A.pillows[11] === 4 && A.stage === 'attack', 'advance moves the pillows and back to fighting');
  // a lost throw: attacker 2 pillows (1 die), tie
  let T = board(); T.owner[10] = 0; T.pillows[10] = 2; T.owner[11] = 1; T.pillows[11] = 3; T.owner[0] = 1;
  T = forceDice(T, [3, 3, 1]);
  r = act(T, { type: 'roll', from: 10, to: 11 }); b = r.beats.find(x => x.kind === 'battle');
  ok(b.a.length === 1 && b.d.length === 2 && b.aLost === 1 && !b.won && r.state.pillows[10] === 1 && r.state.pillows[11] === 3, 'lost throw: tie to the defender');
  ok(!game.legalMoves(r.state, 0).some(m => m.from === 10 && m.type !== 'shift'), 'a 1-pillow area cannot attack');
  // keep throwing: ends won or at 1
  let K = board(); K.owner[10] = 0; K.pillows[10] = 12; K.owner[11] = 1; K.pillows[11] = 4; K.owner[0] = 1;
  r = act(K, { type: 'blitz', from: 10, to: 11 }); b = r.beats.find(x => x.kind === 'battle');
  ok(b.blitz && (b.won || r.state.pillows[10] === 1) && b.aLost + b.dLost >= 4, 'keep throwing until decided: ' + J(b));
}
{ // region bonus: 3 a turn at least, areas / 3, plus each whole region
  const S = board();
  for (const i of PF.REGION_AREAS[0]) S.owner[i] = 0; // the attic (4)
  ok(PF.reinforcement(S.owner, 0) === 3 + 2, 'attic: 3 + bonus 2');
  for (const i of PF.REGION_AREAS[3]) S.owner[i] = 0; // + the basement (6): 10 areas
  ok(PF.reinforcement(S.owner, 0) === 3 + 2 + 3, '10 areas + attic + basement');
  S.owner[0] = 1; // break the attic
  ok(PF.reinforcement(S.owner, 0) === 3 + 3, 'broken attic: no bonus');
  for (const i of [22, 23, 24, 25, 26, 27]) S.owner[i] = 0; // 15 areas: 5 + basement 3 + both yards 2 + 2
  ok(PF.reinforcement(S.owner, 0) === 5 + 3 + 2 + 2, '15 areas: 5 + regions');
  ok(J(PF.REGIONS.map(r => r.bonus)) === J([2, 4, 4, 3, 2, 2]) && PF.SIZE === 28 && PF.REGIONS.length === 6, 'the map: 28 areas, 6 regions');
  // the turn beat carries the new pillows, the place stage the count
  const T = board(); for (const i of PF.REGION_AREAS[4]) T.owner[i] = 1; T.owner[0] = 0; T.turn = 0; T.stage = 'attack';
  const r = act(T, { type: 'end' });
  const tb = r.beats.find(x => x.kind === 'turn');
  ok(tb && tb.seat === 1 && tb.pillows === 3 + 2 && J(tb.regions) === J([4]) && r.state.left === 5 && r.state.stage === 'place', 'turn beat: 3 + front yard 2');
  // placing: +1, +3, all; auto places the rest; then fighting
  let P = r.state;
  const pm = game.legalMoves(P, 1);
  ok(pm[0].type === 'auto' && pm.some(m => J(m) === J({ type: 'place', area: 22, n: 3 })) && pm.some(m => J(m) === J({ type: 'place', area: 22, n: 5 })), 'place moves +1 +3 all');
  P = act(P, { type: 'place', area: 22, n: 3 }).state;
  ok(P.left === 2 && P.pillows[22] === 4 && J(placeNs(P, 1, 22)) === J([1, 2]), 'after +3: 2 left, counts 1 and 2');
  P = act(P, { type: 'auto' }).state;
  ok(P.left === 0 && P.stage === 'attack', 'auto places the rest');
}
function placeNs(S, s, a) { return game.legalMoves(S, s).filter(m => m.type === 'place' && m.area === a).map(m => m.n); }
{ // treat cards: what makes a set, its worth, trading in, the forced trade at 5
  const C = PF.CARDS, id = (k, v, skip = []) => C.find(c => c.kind === k && c.value === v && !skip.includes(c.id)).id;
  const c1 = id(0, 1), c1b = id(0, 1, [c1]), c3 = id(0, 3), k2 = id(1, 2), p3 = id(2, 3), w = id(3, 2);
  ok(PF.isSet([c1, c1b, c3]) && PF.setValue([c1, c1b, c3]) === 1 + 1 + 3 + 2, 'three cocoa: a set worth 7');
  ok(PF.isSet([c1, k2, p3]) && PF.setValue([c1, k2, p3]) === 1 + 2 + 3 + 2, 'one of each: a set worth 8');
  ok(!PF.isSet([c1, c3, k2]), 'two cocoa + a cookie: no set');
  ok(PF.isSet([c1, k2, w]) && PF.isSet([c1, c3, w]), 'a feast completes either kind of set');
  ok(PF.CARDS.length === 20, '20 treat cards');
  let S = board(); S.owner[0] = 0; S.owner[1] = 1; S.turn = 2; S.stage = 'attack';
  S.hands[0] = [c1, c1b, c3, k2, p3]; S.deck = S.deck.filter(x => !S.hands[0].includes(x));
  let r = act(S, { type: 'end' }); // seat 0's turn: 5 treats, so trade first
  S = r.state;
  ok(S.turn === 0 && S.stage === 'cash' && r.beats.find(b => b.kind === 'turn').mustTrade, 'five treats: must trade first');
  const mv = game.legalMoves(S, 0);
  ok(mv.length >= 2 && mv.every(m => m.type === 'trade') && PF.setValue(mv[0].cards) >= PF.setValue(mv[mv.length - 1].cards), 'cash: trades only, the biggest first');
  const before = S.left;
  r = act(S, { type: 'trade', cards: [c1, k2, p3].sort((a, b) => a - b) }); S = r.state;
  ok(S.left === before + 8 && S.stage === 'place' && S.hands[0].length === 2 && S.discard.length === 3, 'traded: +8 pillows, down to 2, on to placing');
  ok(r.beats.some(b => b.kind === 'cash' && b.pillows === 8 && b.forced && b.cards.length === 3), 'cash beat');
  // a set held in the place stage may be traded, not must
  let T = board(); T.owner[0] = 0; T.owner[1] = 1; T.turn = 2; T.stage = 'attack'; T.hands[0] = [c1, c1b, c3]; T.deck = T.deck.filter(x => !T.hands[0].includes(x));
  T = act(T, { type: 'end' }).state;
  ok(T.stage === 'place' && game.legalMoves(T, 0).some(m => m.type === 'trade'), 'three treats: trading is open in the place stage');
  // a win this turn earns one treat at the end of it; none without a win; none with cards off
  let U = board(); U.owner[10] = 0; U.pillows[10] = 9; U.owner[11] = 1; U.pillows[11] = 1; U.owner[0] = 1;
  U = forceDice(U, [6, 6, 6, 1]); U = act(U, { type: 'roll', from: 10, to: 11 }).state;
  if (U.stage === 'advance') U = act(U, game.legalMoves(U, 0)[0]).state;
  const top = U.deck[0];
  r = act(U, { type: 'end' });
  ok(r.state.hands[0].length === 1 && r.state.hands[0][0] === top && r.beats.some(b => b.kind === 'draw' && b.seat === 0 && b.cards === 1), 'a won area earns a treat');
  let V = board(); V.owner[0] = 0; V.owner[1] = 1; r = act(V, { type: 'end' }); ok(r.state.hands[0].length === 0, 'no win: no treat');
  let X = board({ cards: false }); X.owner[10] = 0; X.pillows[10] = 9; X.owner[11] = 1; X.pillows[11] = 1; X.owner[0] = 1;
  X = forceDice(X, [6, 6, 6, 1]); X = act(X, { type: 'roll', from: 10, to: 11 }).state; if (X.stage === 'advance') X = act(X, game.legalMoves(X, 0)[0]).state;
  ok(act(X, { type: 'end' }).state.hands[0].length === 0 && !game.legalMoves(X, 0).some(m => m.type === 'trade'), 'cards off: no treats');
  // the deck runs out: the traded ones are shuffled back
  let Y = board(); Y.owner[10] = 0; Y.pillows[10] = 9; Y.owner[11] = 1; Y.pillows[11] = 1; Y.owner[0] = 1; Y.discard = Y.deck.slice(); Y.deck = [];
  Y = forceDice(Y, [6, 6, 6, 1]); Y = act(Y, { type: 'roll', from: 10, to: 11 }).state; if (Y.stage === 'advance') Y = act(Y, game.legalMoves(Y, 0)[0]).state;
  Y = act(Y, { type: 'end' }).state;
  ok(Y.hands[0].length === 1 && Y.deck.length === 19 && Y.discard.length === 0, 'empty deck: the discards come back');
}
{ // flopping: a crew's last area taken -> out, its treats go to the winner; 6+ -> trade down to 4 right away
  const C = PF.CARDS;
  let S = board(); S.owner[10] = 0; S.pillows[10] = 10; S.owner[11] = 1; S.pillows[11] = 1;
  S.hands[0] = [C[0].id, C[6].id, C[12].id]; S.hands[1] = [C[1].id, C[7].id, C[13].id];
  S.deck = S.deck.filter(x => !S.hands[0].includes(x) && !S.hands[1].includes(x));
  S = forceDice(S, [6, 6, 6, 1]);
  let r = act(S, { type: 'roll', from: 10, to: 11 }); S = r.state;
  const fb = r.beats.find(b => b.kind === 'flop');
  ok(fb && fb.seat === 1 && fb.by === 0 && fb.cards === 3 && !S.alive[1] && S.out.includes(1), 'last area taken: crew 1 flops out: ' + J(fb));
  ok(S.hands[1].length === 0 && S.hands[0].length === 6, 'its treats go to the winner');
  ok(S.stage === 'advance', 'move in first');
  S = act(S, game.legalMoves(S, 0)[0]).state;
  ok(S.stage === 'cash' && game.legalMoves(S, 0).every(m => m.type === 'trade'), '6 treats: trade right away');
  S = act(S, game.legalMoves(S, 0)[0]).state;
  ok(S.stage === 'cash' || S.hands[0].length <= PF.HAND_MAX, 'trading down');
  while (S.stage === 'cash') S = act(S, game.legalMoves(S, 0)[0]).state;
  ok(S.stage === 'place' && S.left > 0 && S.hands[0].length <= PF.HAND_MAX, 'then place the new pillows');
  S = act(S, { type: 'auto' }).state;
  ok(S.stage === 'attack' && S.turn === 0, 'and keep fighting');
  checkInvariants(S, 'flop');
  // the last but one crew flops: the game is over, the last one standing wins
  let L = board({}, 2); L.owner = new Array(PF.SIZE).fill(0); L.owner[11] = 1; L.pillows[11] = 1; L.pillows[10] = 9; L.teddies = false;
  L = forceDice(L, [6, 6, 6, 1]); r = act(L, { type: 'roll', from: 10, to: 11 });
  ok(r.state.phase === 'over' && J(r.state.winners) === J([0]) && r.state.why === 'last' && game.score(r.state).done, 'last crew standing wins');
}
{ // the shuffle: once, between areas joined through your own, then the turn ends
  let S = board(); S.owner[10] = 0; S.owner[11] = 0; S.owner[12] = 0; S.pillows[10] = 7; S.owner[16] = 0; S.owner[1] = 1;
  const mv = game.legalMoves(S, 0).filter(m => m.type === 'shift' && m.from === 10);
  ok(mv.some(m => m.to === 12 && m.n === 6) && mv.some(m => m.to === 12 && m.n === 3) && mv.some(m => m.to === 11 && m.n === 1), 'shift: joined areas, counts 1 / half / all');
  ok(!mv.some(m => m.to === 13) && !mv.some(m => m.to === 16), 'shift: not to another crew\'s area, nor one not joined');
  const S2 = board(); S2.owner[10] = 0; S2.pillows[10] = 5; S2.owner[12] = 0; S2.owner[1] = 1; // 11 is not ours: not joined
  ok(!game.legalMoves(S2, 0).some(m => m.type === 'shift' && m.to === 12), 'shift: only through your own areas');
  const r = act(S, { type: 'shift', from: 10, to: 12, n: 6 });
  ok(r.state.pillows[10] === 1 && r.state.pillows[12] === 7 && r.state.turn === 1, 'shift moves the pillows and ends the turn');
}
{ // 2 players: the Teddies hold 8 areas with 2 pillows each and never move
  const S = game.newGame({ players: players(['normal', 'normal']), seed: 11 });
  ok(S.teddies && S.owner.filter(o => o === PF.TEDDY).length === 8 && S.owner.every((o, i) => o !== PF.TEDDY || S.pillows[i] === 2), '2 players: Teddies 8 areas x2');
  ok(PF.areasOf(S.owner, 0) === 10 && PF.areasOf(S.owner, 1) === 10, '10 areas each');
  ok([0, 1].every(k => PF.totalPillows(S, k) === PF.START[2] || (k === S.turn)), 'starting pillows');
  for (let n = 3; n <= 6; n++) { const T = game.newGame({ players: players(Array(n).fill('easy')), seed: n }); ok(!T.teddies && T.owner.every(o => o >= 0) && T.alive.every((a, k) => k === T.turn || PF.totalPillows(T, k) === PF.START[n]), n + ' players: no Teddies, starting pillows'); const c = T.owner.reduce((a, o) => (a[o]++, a), new Array(n).fill(0)); ok(Math.max(...c) - Math.min(...c) <= 1 && c[T.first] === Math.min(...c), n + ' players: dealt evenly, the first never more'); }
}
{ // wins: quick holds 3 regions when its turn comes round; full 22 areas at once; the round cap
  let S = board({ length: 'quick' }); S.rounds = PF.ROUNDS.quick; S.round = 2;
  for (const g of [0, 4, 5]) for (const i of PF.REGION_AREAS[g]) S.owner[i] = 1;
  S.owner[4] = 0; S.turn = 0; S.stage = 'attack';
  let r = act(S, { type: 'end' });
  ok(r.state.phase === 'over' && J(r.state.winners) === J([1]) && r.state.why === 'regions', 'quick: 3 regions held when the turn comes round wins');
  // (not in the first round: a crew dealt 3 regions still has to hold them a round)
  let Q = board({ length: 'quick' }); Q.rounds = PF.ROUNDS.quick; for (const g of [0, 4, 5]) for (const i of PF.REGION_AREAS[g]) Q.owner[i] = 1; Q.owner[4] = 0;
  ok(act(Q, { type: 'end' }).state.phase === 'play', 'quick: no win in round 1');
  let F = board({ length: 'full' }); for (let i = 0; i < 21; i++) F.owner[i] = 0; F.pillows[20] = 9; F.owner[21] = 1; F.pillows[21] = 1;
  F = forceDice(F, [6, 6, 6, 1]); r = act(F, { type: 'roll', from: 20, to: 21 });
  ok(r.state.phase === 'over' && J(r.state.winners) === J([0]) && r.state.why === 'areas', 'full: 22 areas wins at once');
  let R = board({ length: 'full' }); R.round = PF.ROUNDS.full; R.turn = 2; R.owner[0] = 0; R.owner[1] = 1; R.owner[2] = 1;
  r = act(R, { type: 'end' });
  ok(r.state.phase === 'over' && r.state.why === 'rounds' && J(r.state.winners) === J([2]) && r.state.round === PF.ROUNDS.full, 'round cap: most areas wins');
  ok(r.beats.some(b => b.kind === 'gameOver' && J(b.winners) === J([2])), 'gameOver beat');
}
{ // a region beat when one is finished, a broken one marked on the claim
  let S = board(); for (const i of PF.REGION_AREAS[4]) S.owner[i] = 1; S.owner[22] = 0; S.pillows[22] = 1; S.owner[4] = 0; S.pillows[4] = 9;
  // 22 is ours: seat 1 holds 23, 24 only; take 23 from Front Hall? set up seat 0 next to 23 at 10
  S.owner[10] = 0; S.pillows[10] = 9;
  S = forceDice(S, [6, 6, 6, 1]);
  let r = act(S, { type: 'roll', from: 10, to: 23 });
  ok(r.beats.some(b => b.kind === 'claim' && b.to === 23 && b.region === -1 && b.broke === -1), 'claim: no region yet');
  let T = board(); for (const i of PF.REGION_AREAS[5]) T.owner[i] = 1; T.owner[9] = 0; T.pillows[9] = 9;
  T = forceDice(T, [6, 6, 6, 1]); r = act(T, { type: 'roll', from: 9, to: 25 });
  ok(r.beats.some(b => b.kind === 'claim' && b.broke === 5), 'claim: broke the back yard');
  let U = board(); U.owner[25] = 0; U.owner[26] = 0; U.owner[27] = 1; U.owner[21] = 0; U.pillows[21] = 9; U.owner[0] = 1;
  U = forceDice(U, [6, 6, 6, 1]); r = act(U, { type: 'roll', from: 21, to: 27 });
  ok(r.beats.some(b => b.kind === 'region' && b.region === 5 && b.bonus === 2) && r.beats.some(b => b.kind === 'claim' && b.region === 5), 'region beat');
}
{ // the map is joined up and every link listed once
  const seen = new Set([0]), q = [0];
  while (q.length) { const i = q.pop(); for (const j of PF.ADJ[i]) if (!seen.has(j)) { seen.add(j); q.push(j); } }
  ok(seen.size === PF.SIZE, 'every area reachable');
  ok(new Set(PF.LINKS.map(([a, b]) => Math.min(a, b) + '-' + Math.max(a, b))).size === PF.LINKS.length, 'no link twice');
  ok(PF.AREAS.every(a => a.short.length <= 14), 'short names');
  ok(new Set(PF.AREAS.map(a => a.c + ',' + a.r)).size === PF.SIZE, 'one area per grid cell');
}
{ // illegal moves throw
  const S = game.newGame({ players: players(['normal', 'normal', 'normal']), seed: 2 });
  let threw = false; try { game.apply(S, (S.turn + 1) % 3, { type: 'auto' }); } catch (e) { threw = !!e.illegal; }
  ok(threw, 'out of turn throws illegal');
  threw = false; try { game.apply(S, S.turn, { type: 'place', area: 0, n: 99 }); } catch (e) { threw = !!e.illegal; }
  ok(threw, 'bad count throws illegal');
}

// ---------------------------------------------------------------- summary
times.sort((a, b) => a - b);
const pct = (a, n) => (100 * a / n).toFixed(0) + '%';
console.log(`Pillow Forts: ${games} bot games, ${done} finished, ${capped} hit the move cap, avg ${(totalMoves / games).toFixed(0)} moves (max ${maxMoves})`);
for (const [k, B] of Object.entries(by).sort()) console.log(`  ${k}: ${B.g} games, avg ${(B.r / B.g).toFixed(1)} rounds, ${(B.m / B.g).toFixed(0)} moves, ended by ${J(B.why)}`);
console.log(`  bot time: p50 ${times[times.length >> 1].toFixed(3)} ms, p99 ${times[Math.floor(times.length * 0.99)].toFixed(3)} ms, max ${times[times.length - 1].toFixed(2)} ms over ${times.length} moves`);
console.log(`  beats: ${J(stats)}`);
for (const [name, d] of D) console.log(`  ${name}: ${pct(d.wa, d.N)} wins (fair share ${pct(1, d.n)}, ties ${d.ties}), avg ${d.rounds} rounds`);
ok(times[Math.floor(times.length * 0.99)] < 50, 'bots fast (p99 < 50 ms)');
ok(stats.flops > 20 && stats.cash > 50 && stats.regions > 50 && stats.shifts > 50 && stats.advChoice > 50, 'all parts of the game happen');
console.log(fails ? `${fails} FAILURES` : 'all checks passed');
process.exit(fails ? 1 : 0);
