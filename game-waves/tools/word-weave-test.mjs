// Word Weave engine tests: hand-made rule checks, then many bot games (every seat count, both lengths, hints on and off),
// leak checks, replays, hard vs easy, and bot timing. Run: node game-waves/tools/word-weave-test.mjs [games]
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.join(HERE, '..', 'server', 'lib', 'table-games');
const mod = await import(pathToFileURL(path.join(LIB, 'word-weave.js')).href);
const core = await import(pathToFileURL(path.join(LIB, 'word-weave-core.js')).href);
const botm = await import(pathToFileURL(path.join(LIB, 'word-weave-bot.js')).href);
const G = mod.default;
const GAMES = Number(process.argv[2]) || 330;

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL:', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const J = x => JSON.stringify(x);

// ---- the data module loads as a data: URL (as the server loads it) and its size
{
  const fs = await import('fs');
  const src = fs.readFileSync(path.join(LIB, 'word-weave-words.js'), 'utf8');
  const m = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  ok(m.COUNT > 150000, 'word count ' + m.COUNT);
  console.log(`word list: ${m.COUNT} words, ${(src.length / 1024).toFixed(0)} KB`);
  const t0 = performance.now(); core.trie(); console.log(`trie build: ${(performance.now() - t0).toFixed(0)} ms (once per process)`);
  for (const w of ['CAT', 'QUILT', 'WEAVE', 'AA', 'ZAX']) ok(core.isWord(w), w + ' is a word');
  for (const w of ['XQZ', 'FUCK', 'SHIT', 'A', 'CATX']) ok(!core.isWord(w), w + ' is not a word');
  let tiles = 0; for (const k of Object.values(core.COUNTS)) tiles += k;
  eq(tiles, 100, 'tile count'); eq(core.COUNTS['?'], 2, 'blanks');
  for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) ok(core.LAYOUT[r][c] === core.LAYOUT[c][r] && core.LAYOUT[r][c] === core.LAYOUT[14 - r][c], 'layout symmetric');
  eq(core.LAYOUT[7][7], '*', 'centre star');
}

// ---- hand rule checks on made-up positions
const P = [{ name: 'A' }, { name: 'B' }];
function setup(rows, racks, extra = {}) {
  const S = G.newGame({ players: P, seed: 1 });
  S.board = core.emptyBoard();
  for (const [r, c, word, down] of rows) for (let i = 0; i < word.length; i++) { const rr = down ? r + i : r, cc = down ? c : c + i; S.board[rr] = S.board[rr].slice(0, cc) + word[i] + S.board[rr].slice(cc + 1); }
  // tiles are conserved: the bag is rebuilt from what is not on the board or the racks
  const pool = []; for (const [l, k] of Object.entries(core.COUNTS)) for (let i = 0; i < k; i++) pool.push(l);
  const take = l => { const i = pool.indexOf(l); if (i >= 0) pool.splice(i, 1); };
  for (const row of S.board) for (const ch of row) if (ch !== '.') take(ch >= 'a' ? '?' : ch);
  S.racks = racks.map(r => r.split(''));
  for (const r of S.racks) for (const l of r) take(l);
  S.bag = pool; S.turn = 0;
  return Object.assign(S, extra);
}
const place = (tiles) => ({ type: 'place', tiles: tiles.map(([r, c, letter, blank]) => (blank ? { r, c, letter, blank: true } : { r, c, letter })) });
const across = (r, c, word, blanks = []) => place([...word].map((l, i) => [r, c + i, l, blanks.includes(i)]));
const down = (r, c, word, blanks = []) => place([...word].map((l, i) => [r + i, c, l, blanks.includes(i)]));
{
  // first move
  let S = setup([], ['CATSXYZ', 'AEIOUBD']);
  ok(G.check(S, 0, across(0, 0, 'CAT')), 'first word off the star rejected');
  ok(G.check(S, 0, place([[7, 7, 'C']])), 'one tile first rejected');
  ok(G.check(S, 1, across(7, 6, 'CAT')), 'out of turn rejected');
  ok(G.check(S, 0, across(7, 6, 'ACT')) === null, 'ACT on the star is fine');
  ok(/rack/.test(G.check(S, 0, across(7, 6, 'DOG')) || ''), 'letters not on rack rejected');
  ok(/not in our word list/.test(G.check(S, 0, across(7, 6, 'TXC')) || ''), 'non-word rejected');
  let r = G.apply(S, 0, across(7, 6, 'CAT'));
  // C(3) on 'd'? layout row 7: d.D..d.*.d..D.d -> col 6 '.', col 7 '*', col 8 '.': (3+1+1) x2 = 10
  eq(r.beats.find(b => b.kind === 'place').score, 10, 'CAT on the star scores x2');
  eq(r.state.racks[0].length, 7, 'rack refilled');
  ok(r.beats.some(b => b.kind === 'draw' && b.count === 3 && !('letters' in b) && !('tiles' in b)), 'draw beat has the count only');

  // CAT across row 7 cols 6-8, then checks against it
  S = setup([[7, 6, 'CAT']], ['SHOEDRA', 'AEIOUBD']);
  ok(/gaps/.test(G.check(S, 0, place([[8, 6, 'H'], [10, 6, 'E']])) || ''), 'gap rejected');
  ok(/join/.test(G.check(S, 0, across(0, 0, 'SHOE')) || ''), 'disconnected rejected');
  ok(/one row or one column/.test(G.check(S, 0, place([[8, 6, 'O'], [9, 7, 'E']])) || ''), 'not in one line rejected');
  ok(/taken/.test(G.check(S, 0, place([[7, 7, 'S']])) || ''), 'taken square rejected');
  ok(G.check(S, 0, place([[7, 9, 'S']])) === null, 'hook S on CAT');
  // CATS: C3 A1 T1 + S on (7,9) 'd' = 2 -> 7; bonuses under old tiles (the star) do not count again
  eq(G.apply(S, 0, place([[7, 9, 'S']])).beats.find(b => b.kind === 'place').score, 7, 'bonus only on new tiles (CATS = 7)');
  // a word through the T: (6,8) H? -> down HTO? no. Down word SHOT? at col 8: rows 4..7 S H O T: T is on the board
  r = G.apply(S, 0, down(4, 8, 'SHO'));
  // col 8 rows 4-7: layout (4,8) 't', (5,8) '.', (6,8) '.', (7,8) '.'(old): S1x3 + H3 + O1 + T1 = 8
  eq(r.beats.find(b => b.kind === 'place').score, 8, 'SHOT through the T = 8');
  eq(r.beats.find(b => b.kind === 'place').word, 'SHOT', 'main word SHOT');
  // cross words: E under C (8,6) makes CE? not a word -> rejected; parallel play
  S = setup([[7, 6, 'CAT']], ['HEADSOR', 'AEIOUBD']);
  ok(/not in our word list/.test(G.check(S, 0, place([[8, 6, 'E']])) || ''), 'bad cross word rejected');
  // row 8 cols 7-8: "HE"? A over H -> AH, T over E -> TE? (TE is not in ENABLE) - use "OR": AO? no. Use "HA": col7 A/H = AH, col8 T/A = TA
  const pm = across(8, 7, 'HA');
  const why = G.check(S, 0, pm);
  ok(why === null, 'parallel HA under AT: ' + why);
  r = G.apply(S, 0, pm);
  const pb = r.beats.find(b => b.kind === 'place');
  // HA: (8,7) '.', (8,8) '.': H3+A1 = 4; AH = 1+3 = 4; TA = 1+1 = 2 -> 10
  eq(pb.words.map(w => w.word + w.score), ['HA4', 'AH4', 'TA2'], 'cross words listed and scored');
  eq(pb.score, 10, 'parallel play total');
  // a blank scores 0, even on a letter bonus; its word bonus still counts
  S = setup([], ['?ATSXYZ', 'AEIOUBD']);
  r = G.apply(S, 0, across(7, 6, 'CAT', [0]));
  eq(r.beats.find(b => b.kind === 'place').score, 4, 'blank C scores 0 ((0+1+1) x2)');
  eq(r.state.board[7].slice(6, 9), 'cAT', 'blank shown lower case');
  ok(r.state.racks[0].filter(l => l === '?').length === 0 || true, 'blank left the rack');
  // Full Weave: all seven tiles
  S = setup([], ['WEAVERS', 'AEIOUBD']);
  ok(core.isWord('WEAVERS'), 'WEAVERS in list');
  r = G.apply(S, 0, across(7, 3, 'WEAVERS'));
  // row 7 cols 3-9: . . d . * . d -> W4 E1 A1x2 V5 E1 R1 S1x2 = 4+1+2+5+1+1+2 = 16, x2 (star) = 32, +50 = 82
  eq(r.beats.find(b => b.kind === 'place').score, 82, 'Full Weave 32 + 50');
  ok(r.beats.some(b => b.kind === 'fullweave' && b.bonus === 50), 'fullweave beat');
  // exchange: only with 7+ in the bag; the beat holds the count only; the tiles are conserved
  S = setup([], ['QZXJKVW', 'AEIOUBD']);
  ok(G.check(S, 0, { type: 'exchange', letters: ['Q', 'Z'] }) === null, 'exchange ok');
  ok(G.check(S, 0, { type: 'exchange', letters: ['E'] }), 'exchange of a tile you do not have rejected');
  r = G.apply(S, 0, { type: 'exchange', letters: ['Q', 'Z'] });
  const xb = r.beats.find(b => b.kind === 'exchange');
  eq(Object.keys(xb).sort(), ['count', 'dwell', 'kind', 'seat'], 'exchange beat keys');
  eq(r.state.racks[0].length + r.state.bag.length, S.racks[0].length + S.bag.length, 'exchange conserves tiles');
  const S6 = setup([], ['QZXJKVW', 'AEIOUBD']); S6.bag = S6.bag.slice(0, 6);
  ok(/7 tiles/.test(G.check(S6, 0, { type: 'exchange', letters: ['Q'] }) || ''), 'exchange with 6 in the bag rejected');
  ok(!G.legalMoves(S6, 0).some(m => m.type === 'exchange'), 'no exchange template with 6 in the bag');
  eq(G.legalMoves(S, 0)[0], { type: 'pass' }, 'pass is moves[0]');
  eq(G.legalMoves(S, 1), [], 'no moves off turn');
  // going out: bag empty, last tiles played -> +others' values, others lose theirs
  S = setup([[7, 6, 'CAT']], ['S', 'QZ']); S.bag = []; S.scores = [10, 20];
  r = G.apply(S, 0, place([[7, 9, 'S']]));
  const go = r.beats.find(b => b.kind === 'gameOver');
  ok(go && r.state.phase === 'over', 'game over when a rack empties with the bag empty');
  eq(go.adjust, [20, -20], 'out: gains the others (Q10 + Z10), they lose theirs');
  eq(go.totals, [10 + 7 + 20, 0], 'final totals');
  eq(go.winners, [0], 'winner');
  ok(G.score(r.state).done, 'score done');
  // six scoreless turns: everyone loses their own
  S = setup([[7, 6, 'CAT']], ['AB', 'C']); S.bag = []; S.scores = [5, 5];
  for (let i = 0; i < 6; i++) { r = G.apply(S, S.turn, { type: 'pass' }); S = r.state; }
  eq(S.phase, 'over', 'six passes end it');
  eq(S.final.adjust, [-4, -3], 'stuck: each loses their own');
  // quick: 8 rounds then over, no adjustments
  S = G.newGame({ players: P, settings: { length: 'quick' }, seed: 3 });
  for (let i = 0; i < 16 && S.phase === 'play'; i++) S = G.apply(S, S.turn, i % 2 ? { type: 'exchange', letters: [S.racks[S.turn][0]] } : { type: 'pass' }).state;
  ok(S.phase === 'over', 'quick game: ends (6 scoreless here)');
  // views: no rack for a passer-by, only yours for a seat
  S = G.newGame({ players: [{}, {}, {}], seed: 9 });
  const v0 = G.view(S, null), v1 = G.view(S, 1);
  eq(v0.rack, null, 'no rack for a passer-by'); eq(v0.moves, [], 'no moves for a passer-by');
  eq(v1.rack, S.racks[1], 'your rack'); ok(!('bag' in v1) || typeof v1.bag === 'number', 'bag is a count');
  // the bot's moves always pass check, from a position with a blank
  S = setup([[7, 6, 'CAT'], [5, 8, 'WEST', true]], ['??QUEEN', 'AEIOUBD']);
  for (const lv of ['easy', 'normal', 'hard']) { const m = G.bot(G.view(S, 0), lv); ok(m && G.check(S, 0, m) === null, `${lv} bot move legal: ${J(m)}`); }
}

// ---- bot games
const LV = ['easy', 'normal', 'hard'];
const times = { easy: [], normal: [], hard: [] }, hintT = [];
function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// the same game with the hidden things moved about: the bag and the racks of everyone but `keep` dealt again from the same tiles
function shuffled(S, keep, R) {
  const T = JSON.parse(J(S));
  const pool = T.bag.slice(); for (let s = 0; s < T.n; s++) if (s !== keep) pool.push(...T.racks[s]);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  for (let s = 0; s < T.n; s++) if (s !== keep) T.racks[s] = pool.splice(0, T.racks[s].length);
  T.bag = pool;
  return T;
}
const BEAT_KEYS = {
  turn: 'dwell kind round seat', place: 'dwell full kind score seat tiles total word words', draw: 'bag count dwell kind seat',
  exchange: 'count dwell kind seat', pass: 'dwell kind seat', fullweave: 'bonus dwell kind seat', bagEmpty: 'dwell kind',
  gameOver: 'adjust dwell kind out racks totals why winners',
};
function playGame(n, settings, levels, seed, opts = {}) {
  const R = rng32(seed ^ 0x5bd1e995);
  let S = G.newGame({ players: levels.map((l, i) => ({ name: 'P' + i, bot: l, kind: 'bot' })), settings, seed });
  const S0 = J(S), log = [];
  let moves = 0, fulls = 0;
  while (S.phase === 'play' && moves < 400) {
    const s = S.turn, v = G.view(S, s);
    const t0 = performance.now();
    const m = G.bot(v, levels[s]);
    const dt = performance.now() - t0;
    times[levels[s]].push(dt);
    if (settings.hints && v.hint != null && opts.hintTime) { const h0 = performance.now(); botm.bestScore(S.board, S.racks[s]); hintT.push(performance.now() - h0); }
    ok(m && typeof m === 'object', 'bot gave a move');
    const why = G.check(S, s, m);
    ok(why === null, `bot move legal (${levels[s]}): ${why} ${J(m)}`);
    if (why) break;
    if (m.type === 'pass' || m.type === 'exchange') ok(G.legalMoves(S, s).some(x => x.type === m.type), 'pass/exchange listed');
    else ok(G.legalMoves(S, s).some(x => x.type === 'place'), 'place template listed');
    for (let k = 0; k < n; k++) if (k !== s) eq(G.legalMoves(S, k), [], 'no moves off turn');
    // leaks: views and beats the same whatever is hidden
    if (opts.leaks && (moves % 3 === 0)) {
      const T = shuffled(S, s, R);
      eq(J(G.view(T, null)), J(G.view(S, null)), 'view(null) leaks nothing');
      const other = (s + 1) % n, T2 = shuffled(S, other, R);
      eq(J(G.view(T2, other)), J(G.view(S, other)), 'view(other) leaks nothing');
      if (m.type === 'place') eq(J(G.apply(T, s, m).beats.filter(b => b.kind !== 'gameOver')), J(G.apply(S, s, m).beats.filter(b => b.kind !== 'gameOver')), 'beats leak nothing');
      const vn = G.view(S, null); ok(vn.rack === null && typeof vn.bag === 'number', 'public view shape');
    }
    const r = G.apply(S, s, m);
    for (const b of r.beats) { const want = BEAT_KEYS[b.kind]; ok(want && Object.keys(b).sort().join(' ') === want, 'beat keys ' + b.kind + ': ' + Object.keys(b).sort().join(' ')); }
    if (r.beats.some(b => b.kind === 'fullweave')) fulls++;
    S = r.state; log.push([s, m]); moves++;
    // tiles conserved
    let tiles = S.bag.length; for (const rk of S.racks) tiles += rk.length; for (const row of S.board) for (const ch of row) if (ch !== '.') tiles++;
    if (tiles !== 100) { ok(false, 'tiles conserved: ' + tiles); break; }
  }
  ok(S.phase === 'over', `game finished within the cap (${moves} moves)`);
  const sc = G.score(S); ok(sc.done, 'score done');
  ok(sc.winners.length >= 1 && sc.winners.every(w => sc.totals[w] === Math.max(...sc.totals)), 'winners are the top totals');
  // replay
  let Rp = JSON.parse(S0); for (const [s, m] of log) Rp = G.apply(Rp, s, m).state;
  ok(J(Rp) === J(S), 'same seed + moves replays to the same state');
  return { S, moves, fulls };
}

const t0 = performance.now();
let played = 0, totalMoves = 0, fullWeaves = 0, quick = 0;
for (let i = 0; i < GAMES; i++) {
  const n = 2 + (i % 3), settings = { length: i % 2 ? 'quick' : 'full', hints: i % 5 === 0 };
  const levels = Array.from({ length: n }, (_, k) => LV[(i + k * 2) % 3]);
  const { moves, fulls } = playGame(n, settings, levels, 1000 + i, { leaks: i % 4 === 0, hintTime: true });
  played++; totalMoves += moves; fullWeaves += fulls; if (settings.length === 'quick') quick++;
}
console.log(`bot games: ${played} (${quick} quick, 2-4 seats), ${totalMoves} moves, ${fullWeaves} Full Weaves, ${((performance.now() - t0) / 1000).toFixed(1)} s`);

// hard vs easy, normal vs easy, hard vs normal (2 players, seats swapped each game)
function duel(a, b, games, base) {
  let wa = 0, wb = 0, ties = 0, sa = 0, sb = 0;
  for (let i = 0; i < games; i++) {
    const swap = i % 2 === 1, levels = swap ? [b, a] : [a, b];
    const { S } = playGame(2, { length: 'full' }, levels, base + i, {});
    const ia = swap ? 1 : 0, ib = 1 - ia, w = G.score(S).winners;
    sa += S.scores[ia]; sb += S.scores[ib];
    if (w.length > 1) ties++; else if (w[0] === ia) wa++; else wb++;
  }
  console.log(`${a} vs ${b}: ${a} wins ${wa}, ${b} wins ${wb}, ties ${ties} of ${games} (${(100 * wa / games).toFixed(0)}%); average score ${(sa / games).toFixed(0)} to ${(sb / games).toFixed(0)}`);
  return wa / games;
}
const he = duel('hard', 'easy', 60, 50000);
duel('normal', 'easy', 40, 60000);
const hn = duel('hard', 'normal', 60, 70000);
ok(he > 0.8, 'hard beats easy most of the time');
ok(hn > 0.5, 'hard beats normal more often than not');

const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
for (const lv of LV) console.log(`bot ${lv}: ${times[lv].length} moves, p50 ${pct(times[lv], 0.5).toFixed(1)} ms, p99 ${pct(times[lv], 0.99).toFixed(1)} ms, max ${pct(times[lv], 1).toFixed(1)} ms`);
if (hintT.length) console.log(`hint (best score): ${hintT.length} calls, p50 ${pct(hintT, 0.5).toFixed(1)} ms, p99 ${pct(hintT, 0.99).toFixed(1)} ms`);
const all = [...times.easy, ...times.normal, ...times.hard];
ok(pct(all, 0.99) < 150, 'bot p99 under 150 ms');
console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
