// The Missing Pie: engine tests. Run: node game-waves/tools/missing-pie-test.mjs
// Many bot games (3 to 6 players, mixed levels, both settings): every move legal, no secret in any view or beat before the
// end, games finish, replays match; hard against easy and normal; a few hand-made rule checks.
import game, { WHO, WHAT, WHERE, CARDS } from '../server/lib/table-games/missing-pie.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; if (fails < 30) console.log('FAIL:', msg); } };
function rngFrom(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const J = x => JSON.stringify(x);

// the secret parts of a view: everything except what is public by the rules (moves list all cards; asks and accusations
// name cards in the open). What remains may hold only the viewer's own cards, cards shown to it and cards it showed.
function privateCards(v) {
  const c = { ...v }; delete c.moves; delete c.log; delete c.accusations; delete c.pending; delete c.pos; delete c.reach; delete c.notes;
  const s = J(c), out = new Set();
  for (const id of CARDS) if (s.includes('"' + id + '"')) out.add(id);
  return out;
}
function checkView(S, seat, beatsSoFar) {
  const v = game.view(S, seat);
  if (S.phase === 'over') return;
  const allowed = new Set();
  if (seat !== null) { for (const c of S.hands[seat]) allowed.add(c); for (const x of S.seen[seat]) allowed.add(x.card); for (const x of S.showed[seat]) allowed.add(x.card); }
  for (const id of privateCards(v)) ok(allowed.has(id), `seat ${seat} view shows ${id} it may not know`);
  ok(v.solution === null, 'solution in view before the end');
  // the notes (helper notebook) come from that seat's own information only: the tin column may be 1 only where the seat
  // could know it; check it never marks a card in the tin that is not
  if (v.notes) { const n = S.n; for (let c = 0; c < CARDS.length; c++) { const id = CARDS[c]; const inTin = Object.values(S.tin).includes(id); if (v.notes[c][n] === 1) ok(inTin, 'notes wrong about the tin'); if (v.notes[c][n] === 0) ok(!inTin, 'notes rule out the answer'); } }
  void beatsSoFar;
}
function checkBeats(S, beats) {
  for (const b of beats) {
    if (b.kind === 'gameOver') continue;
    const c = { ...b }; delete c.who; delete c.what; delete c.where; // (asks and accusations are public)
    const s = J(c);
    for (const id of CARDS) ok(!s.includes('"' + id + '"') || b.kind === 'move', `beat ${b.kind} carries card ${id}`);
    ok(!('card' in b), 'beat carries a card field');
  }
}

function play({ n, levels, settings, seed, check = true }) {
  const players = levels.map(l => ({ name: l, bot: l, kind: 'bot' }));
  let S = game.newGame({ players, settings, seed });
  const S0 = J(S), moves = [], rng = rngFrom(seed * 7 + 1);
  let steps = 0;
  while (S.phase !== 'over' && steps < 5000) {
    steps++;
    // whoever has moves: the turn seat, or the seat asked to show
    let actor = -1;
    for (let s = 0; s < n; s++) if (game.legalMoves(S, s).length) { actor = s; break; }
    ok(actor >= 0, 'nobody can move');
    if (actor < 0) break;
    const v = game.view(S, actor);
    const m = game.bot(v, levels[actor], rng);
    const legal = game.legalMoves(S, actor);
    ok(m && legal.some(x => J(x) === J(m)), 'bot move not legal: ' + J(m));
    if (!m) break;
    const r = game.apply(S, actor, m);
    S = r.state; moves.push([actor, m]);
    if (check) { checkBeats(S, r.beats); checkView(S, null); for (let s = 0; s < n; s++) checkView(S, s); }
  }
  ok(S.phase === 'over', 'game did not finish in the cap');
  const sc = game.score(S);
  ok(sc.done, 'score not done');
  // replay
  if (check) { let R = JSON.parse(S0); for (const [s, m] of moves) R = game.apply(R, s, m).state; ok(J(R) === J(S), 'replay differs'); }
  return { S, sc, steps, turns: S.turnNo };
}

// ---- many games: mixed levels, every seat count, both settings
const LV = ['easy', 'normal', 'hard'];
let games = 0, solved = 0, allOut = 0, timeUp = 0, steps = 0;
const t0 = Date.now();
for (let i = 0; i < 360; i++) {
  const n = 3 + (i % 4);
  const levels = Array.from({ length: n }, (x, k) => LV[(i + k * 2) % 3]);
  const r = play({ n, levels, settings: { reveal: i % 2 === 0 }, seed: 1000 + i, check: i < 200 });
  games++; steps += r.steps;
  if (r.S.why === 'solved') solved++; else if (r.S.why === 'allOut') allOut++; else timeUp++;
}
console.log(`mixed: ${games} games, solved ${solved}, all out ${allOut}, time up ${timeUp}, avg moves ${(steps / games).toFixed(0)} (${Date.now() - t0} ms)`);

// ---- hard against easy, hard against normal (one hard seat, rotating, the rest the other level)
function versus(other, N) {
  let wins = 0, games = 0, base = 0, turnsToSolve = 0, solvedBy = 0;
  for (let i = 0; i < N; i++) {
    const n = 3 + (i % 4), h = i % n;
    const levels = Array.from({ length: n }, (x, k) => (k === h ? 'hard' : other));
    const r = play({ n, levels, settings: {}, seed: 50000 + i + (other === 'easy' ? 0 : 99999), check: false });
    games++; base += 1 / n;
    if (r.S.winners.includes(h)) wins++;
    if (r.S.why === 'solved') { solvedBy++; turnsToSolve += r.S.round; }
  }
  console.log(`hard vs ${other}: hard won ${(100 * wins / games).toFixed(1)}% of ${games} (a fair share would be ${(100 * base / games).toFixed(1)}%), avg rounds to solve ${(turnsToSolve / Math.max(1, solvedBy)).toFixed(1)}`);
  return wins / games > base / games;
}
function levelRounds(lv, N) {
  let r0 = 0, c = 0, out = 0;
  for (let i = 0; i < N; i++) { const n = 3 + (i % 4); const r = play({ n, levels: Array(n).fill(lv), settings: {}, seed: 90000 + i, check: false }); if (r.S.why === 'solved') { r0 += r.S.round; c++; } else out++; }
  console.log(`all ${lv}: solved ${c}/${N}, avg rounds ${(r0 / Math.max(1, c)).toFixed(1)}, unsolved ${out}`);
}
ok(versus('easy', 400), 'hard does not beat easy');
ok(versus('normal', 400), 'hard does not beat normal');
for (const lv of LV) levelRounds(lv, 200);

// ---- hand-made rule checks
function fixed(n, hands, tin, seed = 1) {
  const S = game.newGame({ players: Array(n).fill({ name: 'p' }), settings: {}, seed });
  S.hands = hands.map(h => h.slice()); S.tin = { ...tin };
  return S;
}
{
  // 4 players. seat 0 asks fig + kite at the Fish Shack. Seat 1 holds none, seat 2 holds kite and fish (chooses), seat 3 fig.
  const tin = { who: 'pudding', what: 'basket', where: 'games' };
  let S = fixed(4, [
    ['sprocket', 'net', 'post', 'crib'],
    ['quill', 'barrow', 'tower', 'fountain', 'lovecraft'],
    ['kite', 'fish', 'brine', 'lunchbox', 'bus'],
    ['fig', 'marmalade', 'umbrella', 'lawn'],
  ], tin);
  S.pos[0] = 'fish'; S.stage = 'ask';
  let r = game.apply(S, 0, { type: 'ask', who: 'fig', what: 'kite' });
  S = r.state;
  ok(S.stage === 'show' && S.pending.by === 2, 'show goes left: seat 1 has none, seat 2 must choose');
  ok(J(game.legalMoves(S, 2)) === J([{ type: 'show', card: 'kite' }, { type: 'show', card: 'fish' }]), 'seat 2 chooses between kite and fish');
  ok(game.legalMoves(S, 3).length === 0 && game.legalMoves(S, 0).length === 0, 'nobody else moves while seat 2 chooses');
  ok(game.view(S, 0).turn === 2 && game.view(S, 0).active === 0, 'turn is the chooser, active the asker');
  ok(S.pos[2] === 'fish', 'Granny Fig (seat 2) pulled to the Fish Shack');
  r = game.apply(S, 2, { type: 'show', card: 'fish' }); S = r.state;
  ok(r.beats.some(b => b.kind === 'shown' && b.by === 2 && b.to === 0 && J(b.passed) === '[1]'), 'shown beat: by 2 to 0, seat 1 passed');
  ok(!J(r.beats).includes('"fish"') || r.beats.every(b => b.kind !== 'shown' || !J(b).includes('fish')), 'shown beat has no card');
  ok(game.view(S, 0).shown && game.view(S, 0).shown.card === 'fish', 'asker sees the card');
  for (const s of [1, 3]) ok(!J(game.view(S, s).seen).includes('fish') && game.view(S, s).shown === null, 'others do not see the card');
  ok(J(game.view(S, null)).indexOf('"card"') < 0, 'spectator sees no card');
  // seat 0 accuses wrong: out, turn passes, still shows
  r = game.apply(S, 0, { type: 'accuse', who: 'fig', what: 'kite', where: 'fish' }); S = r.state;
  ok(S.out[0] && S.turn === 1 && r.beats.some(b => b.kind === 'out' && b.seat === 0), 'wrong accuser is out, turn moves on');
  S.stage = 'ask'; S.pos[1] = 'post';
  r = game.apply(S, 1, { type: 'ask', who: 'sprocket', what: 'umbrella' }); S = r.state;
  // seat 2 has none, seat 3 has umbrella only, so seat 3 shows automatically before seat 0 (who has sprocket and post)
  ok(S.log[S.log.length - 1].by === 3, 'order goes left: seat 3 before seat 0');
  S.stage = 'ask'; S.turn = 1; S.pos[1] = 'games';
  r = game.apply(S, 1, { type: 'ask', who: 'sprocket', what: 'basket' }); S = r.state;
  ok(S.log[S.log.length - 1].by === 0, 'a wrong (out) accuser still shows cards');
  // the others go wrong one by one: everyone out ends it with nobody winning
  for (const s of [1, 2, 3]) { S.turn = s; S.stage = 'done'; r = game.apply(S, s, { type: 'accuse', who: 'quill', what: 'net', where: 'lawn' }); S = r.state; }
  ok(S.phase === 'over' && S.winners.length === 0 && S.why === 'allOut', 'all out: game over, no winner');
  ok(game.view(S, null).solution && game.view(S, null).solution.who === 'pudding', 'the answer is shown at the end');
  const sc = game.score(S); ok(sc.done && sc.winners.length === 0, 'score: no winners');
}
{
  // a right accusation wins
  let S = game.newGame({ players: Array(3).fill({}), seed: 5 });
  const r = game.apply(S, 0, { type: 'accuse', ...S.tin });
  ok(r.state.phase === 'over' && J(r.state.winners) === '[0]' && game.score(r.state).totals[0] === 1, 'right accusation wins');
  ok(r.beats.find(b => b.kind === 'gameOver').solution.who === S.tin.who, 'gameOver reveals the answer');
  // nobody holds any: noneShown
  S = game.newGame({ players: Array(3).fill({}), seed: 6 });
  S.stage = 'ask'; S.pos[0] = S.tin.where;
  const myWho = S.hands[0].find(c => WHO.includes(c));
  if (myWho) {
    const r2 = game.apply(S, 0, { type: 'ask', who: myWho, what: S.tin.what });
    ok(r2.beats.some(b => b.kind === 'noneShown'), 'noneShown when nobody else holds any');
  }
  // the deal: 18 cards out, 3 in the tin, all different
  for (let n = 3; n <= 6; n++) { const G = game.newGame({ players: Array(n).fill({}), seed: n }); const all = [...G.hands.flat(), ...Object.values(G.tin)]; ok(all.length === 21 && new Set(all).size === 21, 'deal of ' + n); }
  // movement: a roll lists only places in reach; bus from a corner
  S = game.newGame({ players: Array(3).fill({}), seed: 8 });
  const r3 = game.apply(S, 0, { type: 'roll' });
  ok(r3.state.reach.length > 0 && game.legalMoves(r3.state, 0).filter(m => m.type === 'go').length === r3.state.reach.length, 'go moves after a roll');
  S.pos[0] = 'games';
  ok(game.legalMoves(S, 0).some(m => m.type === 'bus'), 'bus from the Game Store corner');
  ok(game.apply(S, 0, { type: 'bus' }).state.pos[0] === 'tower', 'bus to the Water Tower');
  void WHAT; void WHERE;
}

console.log(fails ? `${fails} FAILED` : 'all checks passed');
process.exit(fails ? 1 : 0);
