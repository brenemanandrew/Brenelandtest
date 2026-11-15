// Runs whole games through the REAL server base (lib/table-games/index.js from Breneland-Next) with a stand-in api: the cabinet,
// put down, sit, bots in the other chairs, start, the paced runner, the result. Seat 0 is a "person" whose moves come from the
// game's own bot through the same 'move' op a client sends. Applies game-waves/server/patches/table-games-index-check.patch first.
//   node game-waves/tools/server-sim.mjs GAME [players=3] [games=2] [path/to/server/lib/table-games/index.js]
import fs from 'fs'; import path from 'path'; import os from 'os'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), GW = path.resolve(HERE, '..');
const [game = 'word-weave', nArg = '3', gArg = '2', srcArg] = process.argv.slice(2);
const SRC = srcArg || '/tmp/claude-0/-home-user-Brenelandtest/9f90e9d8-583b-5a76-89c2-8cd85bf4cb82/scratchpad/ref/lib/table-games/index.js';
if (!fs.existsSync(SRC)) { console.log('No server index.js at', SRC, '(pass its path)'); process.exit(2); }
// a throwaway project: lib/table-games/{index.js patched, the engines}, lib/back-room.js (a stand-in), games.json
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tgsim-')), lib = path.join(dir, 'lib'), tg = path.join(lib, 'table-games');
fs.mkdirSync(tg, { recursive: true });
let src = fs.readFileSync(SRC, 'utf8');
const patch = fs.readFileSync(path.join(GW, 'server/patches/table-games-index-check.patch'), 'utf8');
for (const hunk of patch.split(/^@@.*@@$/m).slice(1)) {
  const lines = hunk.split('\n').filter(l => l.length && !l.startsWith('\\'));
  const from = lines.filter(l => !l.startsWith('+')).map(l => l.slice(1)).join('\n'), to = lines.filter(l => !l.startsWith('-')).map(l => l.slice(1)).join('\n');
  if (src.includes(to)) continue; // (already patched)
  if (!src.includes(from)) { console.log('PATCH DOES NOT APPLY to', SRC); process.exit(2); }
  src = src.replace(from, to);
}
fs.writeFileSync(path.join(tg, 'index.js'), src);
for (const f of fs.readdirSync(path.dirname(SRC))) if (/^mexican-train/.test(f)) fs.copyFileSync(path.join(path.dirname(SRC), f), path.join(tg, f)); // (the reference game, to check the sim itself)
for (const f of fs.readdirSync(path.join(GW, 'server/lib/table-games'))) fs.copyFileSync(path.join(GW, 'server/lib/table-games', f), path.join(tg, f));
fs.writeFileSync(path.join(lib, 'back-room.js'), 'module.exports = { why: () => null };');
fs.writeFileSync(path.join(dir, 'games.json'), JSON.stringify({ tableGames: [{ id: game, name: game, copies: 1 }] }));
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"commonjs"}');
Object.assign(process.env, { TG_PACE: '0.02', TG_THINK: '0.02', TG_REJOIN_MS: '600000', TG_OVER_MS: '200', TG_SEED: '1000' });
delete process.env.FLY_APP_NAME;
const require = createRequire(path.join(dir, 'x.js'));
const { register } = require(path.join(tg, 'index.js'));
const handlers = {}, players = new Map(), inbox = [];
const api = {
  store: { players: { pid1: { name: 'Host' } } }, players, save() {},
  broadcast(m) { inbox.push(['*', m]); }, tell(pl, m) { inbox.push([pl.sid, m]); },
  setExt(pl, x) { pl.ext = { ...(pl.ext || {}), ...x }; }, cleanText: (s, n) => String(s).slice(0, n),
  on(name, fn) { handlers[name] = fn; }, onLeave() {},
};
register(api);
await api.tableGames.ready;
const G = api.tableGames.games.get(game);
if (!G) { console.log('engine did not load for', game); process.exit(1); }
const engine = G.game;
const pl = { sid: 's1', id: 'pid1', name: 'Host', x: 0, z: 0, ext: {} }; players.set(pl.sid, pl);
const send = m => handlers.tg(pl, { t: 'tg', ...m });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const N = Number(nArg); let fails = 0;
for (let gi = 0; gi < Number(gArg); gi++) {
  const id = 'sim:t' + gi;
  send({ op: 'take', game }); await sleep(600);
  send({ op: 'down', table: id, place: 'store', name: 'a table', x: 0, z: 0, seats: N }); await sleep(900);
  send({ op: 'sit', table: id, seat: 0 }); await sleep(500);
  for (let c = 1; c < N; c++) { send({ op: 'bot', table: id, seat: c, level: ['easy', 'normal', 'hard'][c % 3] }); await sleep(200); }
  send({ op: 'start', table: id }); await sleep(900);
  const T = api.tableGames.tables.get(id);
  if (!T || T.phase !== 'play') { console.log('did not start', T && T.phase); fails++; continue; }
  const t0 = Date.now(); let moves = 0, noes = [];
  while (T.phase === 'play' && Date.now() - t0 < 240000) {
    // my turn (or an out-of-turn move): the bot picks for me, sent as a client would
    const e = T.order.indexOf(0), legal = engine.legalMoves(T.state, e) || [];
    if (legal.length && T.hold < Date.now()) {
      const v = engine.view(T.state, e); v.moves = legal;
      let m = engine.bot(v, 'normal', Math.random); if (m && m.move) m = m.move;
      if (m && m.type !== 'next') { const before = T.moves.length; send({ op: 'move', table: id, move: m }); moves++; await sleep(130); if (T.moves.length === before) { const no = inbox.filter(([s, x]) => s === pl.sid && x.op === 'no').slice(-1)[0]; if (no) noes.push(no[1].why); } continue; }
    }
    await sleep(60);
  }
  const ok = T.phase === 'over' || T.phase === 'setup';
  console.log(`${game} game ${gi + 1}: ${ok ? 'finished' : 'DID NOT FINISH (' + T.phase + ')'} in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${T.moves.length} moves (${moves} mine), result ${JSON.stringify(T.result)}${noes.length ? ', refused: ' + [...new Set(noes)].join(' | ') : ''}`);
  if (!ok) fails++;
  // tidy: end, get up, put it away
  send({ op: 'end', table: id }); await sleep(400); send({ op: 'putaway', table: id }); await sleep(900);
}
const leaks = inbox.filter(([s, m]) => s === '*' && m.op === 'table').length;
console.log(`broadcasts: ${leaks}; failures: ${fails}`);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
