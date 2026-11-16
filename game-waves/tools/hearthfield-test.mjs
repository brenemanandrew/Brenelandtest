// Hearthfield engine tests: many bot games (3 and 4 players, every length, both meadows, swaps and gentle Rascal on and off, mixed
// levels), every move legal and listable, only the acting seat has moves, timer-safe first moves, pieces within limits, the
// distance rule, views and beats leak no secret (other hands, favour cards, the deck order, the rng), replays, games always end,
// bot speed, hard vs normal / easy, and hand-made rule checks (placement, lanes, Grand Parade, Critter Keeper, the raid, nabs,
// drops, carts, swaps, favour cards, winning only on your turn).
// Run: node game-waves/tools/hearthfield-test.mjs
import game, * as H from '../server/lib/table-games/hearthfield.js';

const { GEO } = H;
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; if (fails < 400) console.log('FAIL:', msg); } };
const J = x => JSON.stringify(x);
const MOVE_CAP = 6000;
const players = levels => levels.map((l, i) => ({ name: 'P' + i, bot: l, kind: 'bot' }));
const sum = a => a.reduce((x, y) => x + y, 0);
const TIMER_SAFE = { offer: 'decline', trade: 'cancel', beavers: 'done', roll: 'roll' };

// ---------------------------------------------------------------- leak checks
const VIEW_KEYS_PRIVATE = ['hand', 'myFav', 'myPoints', 'rates', 'lastNab'];
function checkView(v, S, seat, label) {
  const s = J(v);
  ok(!/"rng"|"seed"|"setup"|"fresh"|"fav"\s*:/.test(s), label + ': view shows rng / seed / raw favour lists');
  ok(typeof v.deck === 'number', label + ': deck shown as a count only');
  if (seat === null) for (const k of VIEW_KEYS_PRIVATE) ok(v[k] === null || v[k] === undefined, label + ': spectator sees ' + k);
  else {
    ok(J(v.hand) === J(S.hand[seat]), label + ': own hand');
    ok(v.myFav.length === S.fav[seat].length + S.fresh[seat].length, label + ': own favours');
    ok(!v.lastNab || v.lastNab.thief === seat || v.lastNab.victim === seat, label + ': someone else\'s nab shown');
  }
  if (S.phase === 'play') {
    ok(v.acorns === null, label + ': acorns shown during play');
    for (let k = 0; k < S.n; k++) ok(v.points[k] === H.shownPoints(S, k), label + ': points shown include hidden acorns');
  }
  // the other hands are counts only
  ok(Array.isArray(v.cards) && v.cards.every(x => typeof x === 'number'), label + ': cards as counts');
  ok(!('hands' in v), label + ': hands key');
}
function checkBeat(b) {
  const s = J(b);
  ok(!/"rng"|"seed"|"deck"\s*:\s*\[/.test(s), 'beat with rng/deck: ' + s);
  if (b.kind === 'nab') ok(!('res' in b), 'nab beat shows the card: ' + s);
  if (b.kind === 'favour') ok(!('card' in b), 'favour beat shows the card: ' + s);
  if (b.kind === 'discard') ok(!('res' in b), 'discard beat shows cards');
}
function checkInvariants(S, label) {
  for (let k = 0; k < S.n; k++) {
    ok(S.hand[k].every(x => Number.isInteger(x) && x >= 0), label + ': negative hand ' + J(S.hand[k]));
    const left = H.piecesLeft(S, k);
    ok(left.lane >= 0 && left.cottage >= 0 && left.hall >= 0, label + ': over the piece limit');
  }
  for (let v = 0; v < GEO.v.length; v++) if (S.own[v] >= 0) {
    ok(GEO.v[v].adj.every(u => S.own[u] < 0), label + ': two homes side by side at ' + v);
    if (S.hall[v]) ok(S.own[v] >= 0, label + ': hall without owner');
  }
  for (let e = 0; e < GEO.e.length; e++) if (S.lanes[e] >= 0) {
    const s = S.lanes[e], E = GEO.e[e];
    const touch = x => S.own[x] === s || (S.own[x] < 0 && GEO.v[x].edges.some(f => f !== e && S.lanes[f] === s)) || GEO.v[x].edges.some(f => f !== e && S.lanes[f] === s);
    ok(touch(E.a) || touch(E.b), label + ': a lane on its own at ' + e);
  }
  if (S.parade >= 0) ok(H.longestLane(S, S.parade) >= H.PARADE_MIN && S.laneLen.every(l => l <= S.laneLen[S.parade]), label + ': parade holder not the longest');
  if (S.keeper >= 0) ok(S.played[S.keeper] >= H.KEEPER_MIN, label + ': keeper under 3');
}

// ---------------------------------------------------------------- one game
const stats = { offers: 0, accepted: 0, declined: 0, cancelled: 0, raids: 0, nabs: 0, drops: 0, uses: {}, halls: 0, parade: 0, keeper: 0, bank: 0, gamesTrade: 0 };
function playGame(levels, settings, seed, opts = {}) {
  let S = game.newGame({ players: players(levels), settings, seed });
  const log = [], times = [];
  let moves = 0, sawT = false;
  while (S.phase === 'play' && moves < MOVE_CAP) {
    const seat = H.actor(S);
    const pv = game.view(S, null);
    ok(pv.turn === seat && pv.roller === S.turn, 'view.turn is the actor');
    const legal = game.legalMoves(S, seat);
    ok(legal.length > 0, 'no legal move for the acting seat (stage ' + S.stage + ')');
    if (!legal.length) break;
    if (opts.full) {
      for (let k = 0; k < S.n; k++) if (k !== seat) ok(game.legalMoves(S, k).length === 0, 'out of turn moves');
      ok(!legal.some(m => m.type === 'end') || legal[legal.length - 1].type === 'end', 'end not last');
      if (TIMER_SAFE[S.stage]) ok(legal[0].type === TIMER_SAFE[S.stage], 'timer-safe moves[0] in ' + S.stage);
      ok(!legal.some(m => m.type === 'play' || m.type === 'pass' || m.type === 'draw'), 'a move the timer would favour wrongly');
      ok(legal.every(m => J(m) === J(JSON.parse(J(m)))) && new Set(legal.map(J)).size === legal.length, 'moves listable and unique');
      ok(legal.length <= 80, 'move list too long: ' + legal.length);
      if (!settings.trades && settings.trades !== undefined) ok(!legal.some(m => m.type === 'trade'), 'trade with swaps off');
    }
    const v = game.view(S, seat);
    if (opts.checkViews && moves % 5 === 0) { checkView(v, S, seat, 'seat'); checkView(pv, S, null, 'null'); const o = (seat + 1) % S.n; checkView(game.view(S, o), S, o, 'other'); }
    const t0 = performance.now();
    const m = game.bot(v, levels[seat]);
    times.push(performance.now() - t0);
    ok(m && legal.some(x => J(x) === J(m)), 'bot move not legal: ' + J(m) + ' in ' + S.stage);
    const r = game.apply(S, seat, m);
    for (const b of r.beats) {
      checkBeat(b);
      if (b.kind === 'trade') { if (b.step === 'offer') { stats.offers++; sawT = true; } else if (b.step === 'accept') stats.accepted++; else if (b.step === 'decline') stats.declined++; else if (b.step === 'cancel') stats.cancelled++; }
      if (b.kind === 'roll' && b.raid) stats.raids++;
      if (b.kind === 'nab') stats.nabs++;
      if (b.kind === 'discard' && b.step === 'done') stats.drops++;
      if (b.kind === 'use') stats.uses[b.card] = (stats.uses[b.card] || 0) + 1;
      if (b.kind === 'build' && b.what === 'hall') stats.halls++;
      if (b.kind === 'badge' && b.seat >= 0) stats[b.badge]++;
      if (b.kind === 'bank') stats.bank++;
    }
    S = r.state; log.push([seat, m]); moves++;
    if (opts.full) checkInvariants(S, 'seed ' + seed);
  }
  if (sawT) stats.gamesTrade++;
  return { S, log, moves, times };
}

// ---------------------------------------------------------------- many games
const LV = ['easy', 'normal', 'hard'], LENS = ['quick', 'standard', 'long'];
let games = 0, done = 0, capped = 0, totalMoves = 0, maxMoves = 0, roundCapped = 0, allTimes = [];
const byLen = {}; for (const l of LENS) byLen[l] = { g: 0, r: 0, m: 0 };
const bySeats = { 3: { g: 0, r: 0 }, 4: { g: 0, r: 0 } };
const N_GAMES = 360;
for (let k = 0; k < N_GAMES; k++) {
  const n = 3 + (k % 2), len = LENS[Math.floor(k / 2) % 3], board = k % 5 === 0 ? 'starter' : 'random';
  const trades = (k % 7) !== 3, gentle = k % 4 === 1;
  const levels = Array.from({ length: n }, (_, i) => LV[(k + i * 2) % 3]);
  const set = { length: len, board, trades, gentle };
  const { S, moves, times, log } = playGame(levels, set, 1000 + k, { full: true, checkViews: k < 120 });
  games++; totalMoves += moves; maxMoves = Math.max(maxMoves, moves); allTimes.push(...times);
  const sc = game.score(S);
  ok(sc.done, 'game did not finish, seed ' + (1000 + k) + ' moves ' + moves);
  if (sc.done) done++;
  if (moves >= MOVE_CAP) capped++;
  if (S.why === 'rounds') roundCapped++;
  ok(sc.winners.length >= 1, 'no winner');
  if (S.why === 'target') ok(sc.winners.length === 1 && sc.totals[sc.winners[0]] >= S.target, 'target winner has the points');
  ok(sc.order.length === n && sc.winners.includes(sc.order[0]), 'order starts with a winner');
  ok(S.round <= S.rounds, 'past the round cap');
  const B = byLen[len]; B.g++; B.r += S.round; B.m += moves; bySeats[n].g++; bySeats[n].r += S.round;
  // replay
  if (k % 6 === 0) {
    let R = game.newGame({ players: players(levels), settings: set, seed: 1000 + k });
    for (const [seat, m] of log) R = game.apply(R, seat, m).state;
    ok(J(R) === J(S), 'replay differs, seed ' + (1000 + k));
  }
}

// ---------------------------------------------------------------- strength: one level against another, seats rotating
function match(a, b, N, n, na, len = 'standard') {
  let wa = 0, wb = 0, rounds = 0;
  for (let k = 0; k < N; k++) {
    const levels = Array.from({ length: n }, (_, i) => (((i + k) % n) < na ? a : b));
    const { S } = playGame(levels, { length: len }, 70000 + k * 7 + n);
    const w = game.score(S).winners;
    for (const s of w) { if (levels[s] === a) wa += 1 / w.length; else wb += 1 / w.length; }
    rounds += S.round;
  }
  return { wa, wb, share: wa / N, fair: na / n, rounds: (rounds / N).toFixed(1) };
}
const m1 = match('hard', 'normal', 400, 3, 1);
const m2 = match('hard', 'normal', 400, 4, 2);
const m3 = match('hard', 'easy', 300, 3, 1);
const m4 = match('normal', 'easy', 300, 3, 1);
const m5 = match('hard', 'normal', 300, 4, 1);
const m6 = match('hard', 'normal', 300, 3, 1, 'quick');
ok(m2.share >= 0.6, 'hard should clearly beat normal (2 v 2): ' + m2.share.toFixed(2));
ok(m1.share > m1.fair * 1.4, 'hard should beat two normals');
ok(m3.share > 0.6 && m4.share > m4.fair, 'hard and normal beat easy');

// ---------------------------------------------------------------- hand rule checks
const base = (more = {}, n = 3) => game.newGame({ players: players(Array(n).fill('normal')), settings: { board: 'starter', ...more }, seed: 7 });
const act = (S, m) => game.apply(S, H.actor(S), m);
function rnd(S) { S.rng = (S.rng + 0x6d2b79f5) >>> 0; let t = S.rng; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const roll = (S, a, b) => { // force the next dice
  for (let r = 0; r < 1e6; r++) { const T = { ...S, rng: (S.rng + r * 7919) >>> 0 }, U = { ...T }; if (1 + Math.floor(rnd(U) * 6) === a && 1 + Math.floor(rnd(U) * 6) === b) return T; }
  throw new Error('no rng for dice');
};
// finish the setup with each seat's first listed spots, then return the state at seat 0's roll
function setupDone(S) { while (S.stage === 'setupHome' || S.stage === 'setupLane') S = act(S, game.legalMoves(S, H.actor(S))[0]).state; return S; }
const edgeOf = (a, b) => GEO.e.findIndex(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));

{ // setup: snake order, distance rule, lane beside the new cottage, the second cottage pays
  let S = base();
  const order = [];
  ok(J(game.legalMoves(S, 0).map(m => m.type)).includes('home') && game.legalMoves(S, 1).length === 0, 'setup: seat 0 first');
  const vals = game.legalMoves(S, 0).map(m => H.spotValue(S.tiles, m.v));
  ok(vals.every((x, i) => i === 0 || vals[i - 1] >= x), 'setup spots listed best first (the timer\'s pick)');
  const v0 = game.legalMoves(S, 0)[0].v;
  S = act(S, { type: 'home', v: v0 }).state;
  ok(S.stage === 'setupLane' && game.legalMoves(S, 0).every(m => m.type === 'lane' && (GEO.e[m.e].a === v0 || GEO.e[m.e].b === v0)), 'setup lane touches the new cottage');
  S = act(S, game.legalMoves(S, 0)[0]).state;
  const spots = game.legalMoves(S, 1).map(m => m.v);
  ok(!spots.includes(v0) && GEO.v[v0].adj.every(u => !spots.includes(u)), 'distance rule: no home next to a home');
  for (let i = 0; i < 5; i++) { order.push(H.actor(S)); S = act(S, game.legalMoves(S, H.actor(S))[0]).state; S = act(S, game.legalMoves(S, H.actor(S))[0]).state; }
  ok(J(order) === J([1, 2, 2, 1, 0]), 'snake order: ' + J(order));
  ok(S.stage === 'roll' && S.round === 1 && S.turn === 0, 'after the setup seat 0 rolls');
  // the second cottage paid one card per field round it
  for (let k = 0; k < 3; k++) {
    const second = []; for (let v = 0; v < GEO.v.length; v++) if (S.own[v] === k) second.push(v);
    const pays = second.map(v => GEO.v[v].hexes.filter(h => S.tiles[h].res).length);
    ok(pays.includes(sum(S.hand[k])), 'second cottage pays: seat ' + k + ' ' + J(S.hand[k]) + ' vs ' + J(pays));
  }
}
{ // lanes and homes in play: lanes join your network, homes need your lane and the distance rule, another home blocks a lane
  let S = setupDone(base());
  S.stage = 'main'; S.hand[0] = [9, 9, 9, 9, 9];
  const mv = game.legalMoves(S, 0);
  for (const m of mv.filter(x => x.type === 'lane')) {
    const E = GEO.e[m.e];
    ok([E.a, E.b].some(x => S.own[x] === 0 || GEO.v[x].edges.some(f => S.lanes[f] === 0)), 'lane joins the network');
  }
  ok(mv.filter(x => x.type === 'home').every(m => GEO.v[m.v].edges.some(f => S.lanes[f] === 0)), 'home needs your lane');
  // build a run of lanes from a cottage, then let another seat's home cut it
  let T = base(); T = setupDone(T);
  T.own.fill(-1); T.hall.fill(false); T.lanes.fill(-1);
  const path = [0, 6, 13, 21, 29, 37]; // down the left side
  const ok6 = path.every((x, i) => i === 0 || edgeOf(path[i - 1], x) >= 0);
  if (ok6) {
    T.own[0] = 0;
    for (let i = 1; i < path.length; i++) T.lanes[edgeOf(path[i - 1], path[i])] = 0;
    ok(H.longestLane(T, 0) === 5, 'a run of 5 lanes: ' + H.longestLane(T, 0));
    T.stage = 'main'; T.hand[0] = [5, 5, 0, 0, 0];
    const nx = GEO.v[37].edges.find(e => T.lanes[e] < 0);
    const r = act(T, { type: 'lane', e: nx });
    ok(r.state.parade === 0 && r.beats.some(b => b.kind === 'badge' && b.badge === 'parade' && b.seat === 0), 'Grand Parade at 5+: ' + r.state.laneLen[0]);
    ok(H.shownPoints(r.state, 0) === 1 + H.BADGE_POINTS, 'parade worth 2 points');
    // seat 1's home in the middle of the run cuts it
    const U = { ...r.state, own: r.state.own.slice() }; U.own[21] = 1;
    ok(H.longestLane(U, 0) < 5, 'a home in the run cuts it: ' + H.longestLane(U, 0));
    // and a lane may not pass through another's home
    const W = { ...T, own: T.own.slice(), lanes: T.lanes.slice() }; W.lanes.fill(-1); W.own[13] = 1; W.lanes[edgeOf(6, 13)] = 0; W.own[0] = 0; W.lanes[edgeOf(0, 6)] = 0;
    const lm = game.legalMoves(W, 0).filter(m => m.type === 'lane').map(m => m.e);
    ok(!GEO.v[13].edges.filter(e => e !== edgeOf(6, 13)).some(e => lm.includes(e)), 'no lane through another player\'s home');
  } else ok(false, 'test path is not a lane path');
}
{ // production: a field pays its homes, a hall 2, Rascal's field nothing
  let S = setupDone(base());
  S.hand = S.hand.map(() => [0, 0, 0, 0, 0]);
  const h = GEO.hex.findIndex((x, i) => S.tiles[i].res && x.v.some(v => S.own[v] >= 0));
  const num = S.tiles[h].num, a = Math.min(6, num - 1), b = num - a;
  const owners = GEO.hex[h].v.filter(v => S.own[v] >= 0);
  S.hall[owners[0]] = true;
  let R = act(roll(S, a, b), { type: 'roll' });
  const res = H.RI[S.tiles[h].res], o = S.own[owners[0]];
  ok(R.state.hand[o][res] >= 2, 'a hall gets 2: ' + J(R.state.hand[o]));
  ok(R.beats.some(b => b.kind === 'produce' && b.sum === num), 'produce beat');
  S.raccoon = h; S.hall[owners[0]] = false;
  R = act(roll(S, a, b), { type: 'roll' });
  const p = R.beats.find(b => b.kind === 'produce');
  ok(p.blocked === h && R.state.hand[o][res] === sum(GEO.hex.filter((x, i) => i !== h && S.tiles[i].res === S.tiles[h].res && S.tiles[i].num === num).flatMap(x => x.v).filter(v => S.own[v] === o).map(v => S.hall[v] ? 2 : 1)), 'Rascal blocks his field');
}
{ // the raid: 9+ cards drop half (one at a time), Rascal moves, nabs one card from a neighbour (only the two see which)
  let S = setupDone(base());
  S.hand[0] = [2, 2, 2, 2, 2]; S.hand[1] = [4, 4, 1, 0, 0]; S.hand[2] = [1, 1, 1, 1, 0];
  S = roll(S, 3, 4);
  let R = act(S, { type: 'roll' }); S = R.state;
  ok(R.beats.some(b => b.kind === 'roll' && b.raid), 'a 7 is a raid');
  ok(S.stage === 'discard' && J(S.discard.queue) === J([0, 1]) && J(S.discard.need) === J([5, 4]), 'drop queue: 9+ cards, half: ' + J(S.discard));
  ok(game.view(S, null).turn === 0 && game.legalMoves(S, 1).length === 0, 'drops one seat at a time');
  for (let i = 0; i < 5; i++) S = act(S, game.legalMoves(S, 0)[0]).state;
  ok(sum(S.hand[0]) === 5 && H.actor(S) === 1, 'seat 0 dropped 5, then seat 1');
  for (let i = 0; i < 4; i++) S = act(S, game.legalMoves(S, 1)[i % game.legalMoves(S, 1).length]).state;
  ok(sum(S.hand[1]) === 5 && S.stage === 'raccoon', 'seat 1 dropped 4, then Rascal');
  const mv = game.legalMoves(S, 0);
  ok(mv[0].type === 'raccoon' && !mv.some(m => m.hex === S.raccoon), 'Rascal must move');
  // a field beside seats 1 and 2 only
  const h = GEO.hex.findIndex((x, i) => i !== S.raccoon && x.v.some(v => S.own[v] === 1) && !x.v.some(v => S.own[v] === 0));
  if (h >= 0) {
    const both = GEO.hex[h].v.some(v => S.own[v] === 2);
    const before = sum(S.hand[0]) + sum(S.hand[1]) + sum(S.hand[2]);
    R = act(S, { type: 'raccoon', hex: h }); let T = R.state;
    if (both) { ok(T.stage === 'nab' && J(game.legalMoves(T, 0).map(m => m.seat)) === J([1, 2]), 'choose who to nab from'); R = act(T, { type: 'nab', seat: 1 }); T = R.state; }
    const nb = R.beats.find(b => b.kind === 'nab');
    ok(nb && nb.from === 1 && !('res' in nb), 'nab beat names no card');
    ok(sum(T.hand[0]) === 6 && sum(T.hand[1]) === 4 && sum(T.hand[0]) + sum(T.hand[1]) + sum(T.hand[2]) === before, 'nab moves one card');
    ok(game.view(T, 0).lastNab && game.view(T, 1).lastNab && !game.view(T, 2).lastNab && !game.view(T, null).lastNab, 'only thief and victim see the nabbed card');
    ok(T.stage === 'main', 'after the raid: main');
    // gentle Rascal: nobody on 2 points or less is nabbed
    let G = { ...S, settings: { ...S.settings, gentle: true } };
    G = act(G, { type: 'raccoon', hex: h }).state;
    ok(G.stage === 'main' && sum(G.hand[1]) === 5, 'gentle Rascal nabs nobody on 2 points');
  } else ok(false, 'no field for the nab test');
}
{ // carts: 4 for 1, 3 for 1 at an any cart, 2 for 1 at a matching cart, Market Day 2 for 1
  let S = setupDone(base());
  S.own.fill(-1); S.lanes.fill(-1); S.own[0] = 0; S.own[55] = 1; S.own[54] = -1;
  S.stage = 'main'; S.hand[0] = [4, 0, 0, 0, 0];
  ok(H.rateOf(S, 0, 0) === 4 && game.legalMoves(S, 0).some(m => m.type === 'bank' && m.give === 'timber'), '4 for 1');
  const k = S.carts.indexOf('any'), E = GEO.e[GEO.ports[k]];
  S.own[E.a] = 0; ok(H.rateOf(S, 0, 2) === 3, 'any cart: 3 for 1');
  const k2 = S.carts.indexOf('stone'), E2 = GEO.e[GEO.ports[k2]];
  S.own[E2.b] = 0; ok(H.rateOf(S, 0, 4) === 2 && H.rateOf(S, 0, 1) === 3, 'stone cart: 2 for 1 stone only');
  S.hand[0] = [0, 0, 0, 0, 2]; let R = act(S, { type: 'bank', give: 'stone', get: 'wool' });
  ok(J(R.state.hand[0]) === J([0, 0, 1, 0, 0]) && R.beats[0].rate === 2, 'cart swap done');
  let M = { ...S, market: true }; ok(H.rateOf(M, 0, 0) === 2, 'Market Day: 2 for 1');
}
{ // swaps: draft step by step, send, the other seat answers; accept only with the cards; a decline is remembered
  let S = setupDone(base({ trades: true }));
  S.stage = 'main'; S.hand[0] = [2, 0, 0, 0, 0]; S.hand[1] = [0, 0, 1, 0, 0];
  S = act(S, { type: 'trade', to: 1 }).state;
  ok(S.stage === 'trade' && game.legalMoves(S, 0)[0].type === 'cancel', 'draft: cancel first');
  ok(!game.legalMoves(S, 0).some(m => m.type === 'send'), 'nothing to send yet');
  S = act(S, { type: 'give', res: 'timber', add: 1 }).state;
  S = act(S, { type: 'want', res: 'wool', add: 1 }).state;
  ok(!game.legalMoves(S, 0).some(m => m.type === 'want' && m.res === 'timber' && m.add === 1), 'no want of a kind you give');
  ok(game.legalMoves(S, 0).some(m => m.type === 'give' && m.res === 'timber' && m.add === 1) && !game.legalMoves(S, 0).some(m => m.type === 'give' && m.res === 'clay' && m.add === 1), 'give only what you hold');
  S = act(S, { type: 'send' }).state;
  const v1 = game.view(S, 1);
  ok(S.stage === 'offer' && v1.turn === 1 && v1.roller === 0 && v1.trade.sent, 'offer: seat 1 answers');
  ok(J(game.legalMoves(S, 1)) === J([{ type: 'decline' }, { type: 'accept' }]), 'answer: decline first');
  const A = act(S, { type: 'accept' }).state;
  ok(J(A.hand[0]) === J([1, 0, 1, 0, 0]) && J(A.hand[1]) === J([1, 0, 0, 0, 0]) && A.stage === 'main', 'accepted: cards swapped');
  const D = act(S, { type: 'decline' }).state;
  ok(D.declined.length === 1 && J(D.hand[0]) === J([2, 0, 0, 0, 0]) && D.stage === 'main', 'declined: remembered, nothing moves');
  // the target without the cards cannot accept, and its hand is not shown by the draft moves
  let N = setupDone(base({ trades: true })); N.stage = 'main'; N.hand[0] = [1, 0, 0, 0, 0]; N.hand[1] = [0, 0, 0, 0, 0];
  N = act(N, { type: 'trade', to: 1 }).state;
  ok(game.legalMoves(N, 0).filter(m => m.type === 'want' && m.add === 1).length === 5, 'wants do not depend on their hand');
  N = act(N, { type: 'give', res: 'timber', add: 1 }).state; N = act(N, { type: 'want', res: 'stone', add: 1 }).state; N = act(N, { type: 'send' }).state;
  ok(J(game.legalMoves(N, 1)) === J([{ type: 'decline' }]), 'no accept without the cards');
  // offers per turn
  let O = setupDone(base({ trades: true })); O.stage = 'main'; O.hand[0] = [1, 0, 0, 0, 0];
  for (let i = 0; i < H.OFFERS_PER_TURN; i++) { O = act(O, { type: 'trade', to: 1 }).state; O = act(O, { type: 'cancel' }).state; }
  ok(!game.legalMoves(O, 0).some(m => m.type === 'trade'), 'three offers a turn at most');
  const off = setupDone(base({ trades: false })); off.stage = 'main'; off.hand[0] = [3, 3, 3, 3, 3];
  ok(!game.legalMoves(off, 0).some(m => m.type === 'trade'), 'swaps off: none');
  // a bot answers: a card it lacks for a spare one is welcome; nothing to someone about to win
  let B = setupDone(base({ trades: true })); B.stage = 'main'; B.hand[0] = [0, 0, 0, 0, 2]; B.hand[1] = [3, 3, 0, 1, 0];
  B = act(B, { type: 'trade', to: 1 }).state; B = act(B, { type: 'give', res: 'stone', add: 1 }).state; B = act(B, { type: 'want', res: 'timber', add: 1 }).state; B = act(B, { type: 'send' }).state;
  ok(game.bot(game.view(B, 1), 'normal').type === 'accept', 'normal takes a fair swap it needs');
  const W = { ...B, own: B.own.slice() }; let c = 0; for (let v = 0; v < GEO.v.length && c < 6; v++) if (W.own[v] < 0 && GEO.v[v].adj.every(u => W.own[u] < 0)) { W.own[v] = 0; c++; }
  ok(game.bot(game.view(W, 1), 'hard').type === 'decline' && game.bot(game.view(W, 1), 'normal').type === 'decline', 'no help for someone about to win');
}
{ // favour cards: bought hidden, not usable the same turn, one use a turn; wrangler counts for the Critter Keeper
  let S = setupDone(base()); S.stage = 'main'; S.hand[0] = [0, 0, 3, 3, 3];
  S.deck = ['wrangler', 'basket', 'beavers', 'market', 'acorn', ...S.deck.slice(5)];
  let R = act(S, { type: 'favour' }); S = R.state;
  ok(R.beats[0].kind === 'favour' && !('card' in R.beats[0]), 'favour bought face down');
  ok(!game.legalMoves(S, 0).some(m => m.type === 'use'), 'not usable on the turn bought');
  ok(game.view(S, 1).favs[0] === 1 && !J(game.view(S, 1)).includes('"wrangler"'), 'others see a count only');
  S = act(S, { type: 'end' }).state; while (S.turn !== 0) { S = act(S, { type: 'roll' }).state; while (S.stage !== 'main') S = act(S, game.legalMoves(S, H.actor(S))[0]).state; S = act(S, { type: 'end' }).state; }
  ok(game.legalMoves(S, 0).some(m => m.type === 'use' && m.card === 'wrangler'), 'wrangler usable before the roll');
  S = act(S, { type: 'use', card: 'wrangler' }).state;
  ok(S.stage === 'raccoon' && S.played[0] === 1, 'wrangler: move Rascal');
  S = act(S, game.legalMoves(S, 0)[0]).state; while (S.stage === 'nab') S = act(S, game.legalMoves(S, 0)[0]).state;
  ok(S.stage === 'roll' && !game.legalMoves(S, 0).some(m => m.type === 'use'), 'back to the roll, one use a turn');
  // Critter Keeper at 3, taken over only by more
  let K = setupDone(base()); K.played = [2, 3, 0]; K.stage = 'main'; K.fav[0] = ['wrangler']; K.keeper = 1;
  let KR = act(K, { type: 'use', card: 'wrangler' });
  ok(KR.state.keeper === 1, 'a tie does not take the Critter Keeper');
  K.played = [3, 3, 0]; KR = act(K, { type: 'use', card: 'wrangler' });
  ok(KR.state.keeper === 0 && KR.beats.some(b => b.kind === 'badge' && b.badge === 'keeper'), 'more wranglers take it');
  // picnic basket: 3 different kinds
  let P = setupDone(base()); P.stage = 'main'; P.fav[0] = ['basket']; P.hand[0] = [0, 0, 0, 0, 0];
  P = act(P, { type: 'use', card: 'basket' }).state;
  P = act(P, { type: 'take', res: 'stone' }).state;
  ok(!game.legalMoves(P, 0).some(m => m.res === 'stone'), 'basket: all different');
  P = act(P, { type: 'take', res: 'wool' }).state; R = act(P, { type: 'take', res: 'clay' }); P = R.state;
  ok(J(P.hand[0]) === J([0, 1, 1, 0, 1]) && P.stage === 'main' && R.beats.some(b => b.kind === 'basket'), 'basket: three cards');
  // busy beavers: 2 free lanes, or stop early
  let Bv = setupDone(base()); Bv.stage = 'main'; Bv.fav[0] = ['beavers']; Bv.hand[0] = [0, 0, 0, 0, 0];
  Bv = act(Bv, { type: 'use', card: 'beavers' }).state;
  ok(Bv.stage === 'beavers' && game.legalMoves(Bv, 0)[0].type === 'done', 'beavers: done first');
  const l0 = H.piecesLeft(Bv, 0).lane;
  Bv = act(Bv, game.legalMoves(Bv, 0)[1]).state; Bv = act(Bv, game.legalMoves(Bv, 0)[1]).state;
  ok(H.piecesLeft(Bv, 0).lane === l0 - 2 && Bv.stage === 'main' && sum(Bv.hand[0]) === 0, 'beavers: two free lanes');
  // market day
  let Md = setupDone(base()); Md.stage = 'main'; Md.fav[0] = ['market']; Md.hand[0] = [2, 0, 0, 0, 0];
  Md = act(Md, { type: 'use', card: 'market' }).state;
  ok(Md.market && game.legalMoves(Md, 0).some(m => m.type === 'bank' && m.give === 'timber'), 'market day: 2 for 1');
  Md = act(Md, { type: 'end' }).state; ok(!Md.market, 'market day ends with the turn');
}
{ // winning: only on your own turn, golden acorns count hidden, the round cap ends a game
  let S = setupDone(base({ length: 'quick' }));
  S.stage = 'main'; S.fav[1] = ['acorn', 'acorn', 'acorn', 'acorn'];
  ok(H.points(S, 1) === 6 && S.phase === 'play', 'acorns do not win on another\'s turn');
  ok(game.view(S, 0).points[1] === 2 && game.view(S, 1).myPoints === 6, 'acorns hidden from others');
  S = act(S, { type: 'end' }).state;
  ok(S.phase === 'over' && J(S.winners) === J([1]), 'wins at the start of their own turn');
  const over = game.view(S, 0);
  ok(over.acorns[1] === 4 && over.points[1] === 6, 'acorns shown at the end');
  let C = setupDone(base()); C.round = C.rounds; C.turn = C.n - 1; C.stage = 'main';
  C = act(C, { type: 'end' }).state;
  ok(C.phase === 'over' && C.why === 'rounds' && game.score(C).done, 'the round cap ends the game');
}
{ // the starter meadow is always the same; random meadows keep hot numbers apart
  const a = base({ board: 'starter' }), b = game.newGame({ players: players(['easy', 'easy', 'easy']), settings: { board: 'starter' }, seed: 99 });
  ok(J(a.tiles) === J(b.tiles) && J(a.carts) === J(b.carts), 'starter meadow is fixed');
  let apart = 0;
  for (let s = 1; s <= 50; s++) {
    const T = game.newGame({ players: players(['easy', 'easy', 'easy']), settings: {}, seed: s }).tiles;
    const hot = i => T[i].num === 6 || T[i].num === 8;
    if (!GEO.hex.some((h, i) => hot(i) && h.nb.some(hot))) apart++;
    const kinds = {}; for (const t of T) if (t.res) kinds[t.res] = (kinds[t.res] || 0) + 1;
    ok(J(kinds) === J(Object.fromEntries(Object.entries(H.FIELD_MIX).filter(() => true).sort((x, y) => Object.keys(kinds).indexOf(x[0]) - Object.keys(kinds).indexOf(y[0])))), 'field mix');
  }
  ok(apart === 50, 'hot numbers apart in every meadow: ' + apart);
}

// ---------------------------------------------------------------- summary
allTimes.sort((a, b) => a - b);
const p99 = allTimes[Math.floor(allTimes.length * 0.99)], pct = x => (100 * x).toFixed(0) + '%';
console.log(`Hearthfield: ${games} bot games, ${done} finished, ${capped} hit the move cap, ${roundCapped} ended on the round cap, avg ${(totalMoves / games).toFixed(0)} moves (max ${maxMoves})`);
for (const l of LENS) console.log(`  ${l}: avg ${(byLen[l].r / byLen[l].g).toFixed(1)} rounds, ${(byLen[l].m / byLen[l].g).toFixed(0)} moves`);
console.log(`  3 players avg ${(bySeats[3].r / bySeats[3].g).toFixed(1)} rounds, 4 players ${(bySeats[4].r / bySeats[4].g).toFixed(1)}`);
console.log(`  bot time: avg ${(allTimes.reduce((a, b) => a + b, 0) / allTimes.length).toFixed(3)} ms, p99 ${p99.toFixed(2)} ms, max ${allTimes[allTimes.length - 1].toFixed(2)} ms`);
console.log(`  swaps: ${stats.offers} offers, ${stats.accepted} accepted, ${stats.declined} declined, ${stats.cancelled} cancelled (${stats.gamesTrade} games); cart swaps ${stats.bank}`);
console.log(`  raids ${stats.raids}, nabs ${stats.nabs}, players dropping ${stats.drops}, halls ${stats.halls}, Grand Parade taken ${stats.parade}, Critter Keeper taken ${stats.keeper}, favours used ${J(stats.uses)}`);
for (const [name, d, N] of [['hard vs normal, 1 v 2 (3 players)', m1, 400], ['hard vs normal, 2 v 2 (4 players)', m2, 400], ['hard vs easy, 1 v 2', m3, 300], ['normal vs easy, 1 v 2', m4, 300], ['hard vs normal, 1 v 3 (4 players)', m5, 300], ['hard vs normal, 1 v 2, quick', m6, 300]])
  console.log(`  ${name}: ${pct(d.share)} of wins (fair share ${pct(d.fair)}), avg ${d.rounds} rounds`);
ok(p99 < 50, 'bot p99 under 50 ms');
ok(stats.offers > 100 && stats.accepted > 20 && stats.raids > 100 && stats.nabs > 50 && stats.halls > 100 && stats.parade > 10 && stats.keeper > 5, 'the parts of the game all happen');
console.log(fails ? `${fails} FAILURES` : 'all checks passed');
process.exit(fails ? 1 : 0);
