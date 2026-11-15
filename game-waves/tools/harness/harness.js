// The table-game harness (game-waves): one game on the real overlay frame (overlay.js), its engine and bots run here in the
// page instead of on the server, drawn through the same tg-games.js calls index.js uses. Seat 0 is You; the rest are bots.
// ?game=word-weave&players=3&advance=30|end&seed=7&watch=1&set=key:value,key:value&level=hard&until=stage
// (until: after advance, play on until seat 0 has a move in that view stage, e.g. until=auction or until=offer)
import { createFrame } from '/js/table-games/overlay.js';
import { ready, uiOf, renderGame, renderBar } from '/js/table-games/tg-games.js';
import { ico } from '/js/table-games/mt-ui.js';
import { el } from '/js/util.js';

const Q = new URLSearchParams(location.search);
const GAME = Q.get('game') || 'word-weave', N = Number(Q.get('players') || 3), SEED = Number(Q.get('seed') || 7), WATCH = Q.get('watch') === '1';
const LEVEL = Q.get('level') || 'normal', ADV = Q.get('advance') || '0';
window.__errors = [];
addEventListener('error', e => window.__errors.push(String(e.message)));
addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason && e.reason.stack || e.reason)));
const oldErr = console.error; console.error = (...a) => { window.__errors.push(a.map(String).join(' ')); oldErr(...a); };

const mod = await import(`/engines/${GAME}.js`);
const E = mod.default || mod;
await ready;
const UI = uiOf(GAME);
if (!UI) throw new Error('no UI module for ' + GAME);

const hud = document.getElementById('hud');
const toastBox = document.getElementById('toasts');
const toast = (t, ms = 2400) => { const d = el('div', '', t); toastBox.append(d); setTimeout(() => d.remove(), ms); window.__toasts = (window.__toasts || []).concat(t); };
const ctx = { hud, audio: { play() {}, ui() {}, registerSfx() {}, musicApi: null }, net: { on() {}, send() {}, sid: 'me' }, player: { pos: { x: 0, y: 0, z: 0 } }, features: [], ui: { toast } };
const frame = createFrame(ctx);
frame.show(WATCH ? 'watch' : 'seat');

const names = ['You', 'Pips', 'Clicky', 'Bones', 'Lucky', 'Ivory'];
const players = Array.from({ length: N }, (_, i) => ({ name: names[i], bot: i ? LEVEL : null, kind: i ? 'bot' : 'human' }));
const settings = {};
for (const sp of E.settings || []) settings[sp.key] = sp.default;
for (const kv of (Q.get('set') || '').split(',').filter(Boolean)) { const [k, v] = kv.split(':'); settings[k] = v === 'true' ? true : v === 'false' ? false : v; }
let state = E.newGame({ players, settings, seed: SEED });
let rngA = SEED >>> 0; const rng = () => { rngA = (rngA + 0x6d2b79f5) >>> 0; let t = rngA; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const log = [];
const ok = (seat, m) => {
  if (E.check && m && (m.type === 'place' || m.type === 'exchange')) return E.check(state, seat, m) === null;
  return (E.legalMoves(state, seat) || []).some(x => JSON.stringify(x) === JSON.stringify(m));
};
function doMove(seat, m) {
  const r = E.apply(state, seat, m); state = r.state; log.push(...(r.beats || []).map(b => ({ ...b, seat0: seat })));
  window.__beats = (window.__beats || []).concat(r.beats || []);
  return r.beats || [];
}
const over = () => { try { const s = E.score(state); if (s && s.done) return true; } catch { /* view */ } return E.view(state, null).phase === 'over'; };
// one step: whoever has something to do (the turn's seat first, then any out-of-turn move, then 'next'); seat 0 too when auto
function step(auto0) {
  if (over()) return false;
  const v0 = E.view(state, null), order = [];
  if (Number.isInteger(v0.turn) && v0.turn >= 0) order.push(v0.turn);
  for (let s = 0; s < N; s++) if (!order.includes(s)) order.push(s);
  for (const s of order) {
    const moves = E.legalMoves(state, s) || [];
    if (!moves.length) continue;
    const nx = moves.find(m => m.type === 'next'); if (nx) { doMove(s, nx); return true; }
    if (s === 0 && !auto0) return false;
    const v = E.view(state, s); if (!Array.isArray(v.moves)) v.moves = moves;
    let m = null; try { m = E.bot(v, s === 0 ? 'normal' : LEVEL, rng); } catch (e) { console.error('bot', e); }
    if (m && m.move) m = m.move;
    if (!m || !ok(s, m)) m = moves.find(x => x.type === 'pass' || x.type === 'end' || x.type === 'skip') || moves.find(x => x.type !== 'place' && x.type !== 'exchange');
    if (!m) continue;
    doMove(s, m); return true;
  }
  return false;
}
const target = ADV === 'end' ? 1e9 : Number(ADV);
for (let i = 0; i < target && i < 5000; i++) if (!step(true)) break;
const UNTIL = Q.get('until');
if (UNTIL) for (let i = 0; i < 20000; i++) { const v = E.view(state, 0); if (v && v.stage === UNTIL && (E.legalMoves(state, 0) || []).length) break; if (!step(true)) break; }
// then bots on until it is your move (or the end)
for (let i = 0; i < 400; i++) if (!step(false)) break;

const ui = {};
function T() {
  const pv = E.view(state, null), done = over();
  let result = null; if (done) { const sc = E.score(state); result = { totals: sc.totals, winners: sc.winners, counted: false }; }
  return { id: 'h', game: GAME, place: 'store', name: 'a gaming table', x: 0, z: 0, n: N, host: 'me', hostName: 'You', phase: done ? 'over' : 'play',
    settings, table: { npcs: false, timer: 0, pace: 'steady', keep: true }, order: players.map((_, i) => i), cap: N,
    seats: players.map((p, i) => ({ kind: i ? 'bot' : 'human', name: p.name, sid: i ? null : 'me', level: p.bot, look: null })), view: pv, result, hold: 0 };
}
function send(m) {
  if (!m) return;
  if (E.check && (m.type === 'place' || m.type === 'exchange')) { const why = E.check(state, 0, m); if (why) { toast(why); render(); return; } }
  else if (!ok(0, m)) { toast('That move is not open right now.'); render(); return; }
  const beats = doMove(0, m);
  window.__lastSent = m; window.__lastBeats = beats;
  for (let i = 0; i < 400; i++) if (!step(false)) break;
  render();
}
window.__send = send; window.__step = () => { step(true); render(); };
window.__state = () => state; window.__E = E;
function render() {
  const t = T(), me = WATCH ? null : 0, v = WATCH ? t.view : E.view(state, 0), moves = WATCH ? [] : E.legalMoves(state, 0) || [];
  frame.relayout();
  renderBar(frame.bar, t, v, me, UI, ctx.net);
  const A = frame.acts; A.textContent = '';
  const btn = (b, cls = '') => { const x = el('button', 'tg-act ' + cls + (b.hot ? ' hot' : ''), '', { type: 'button', 'aria-label': b.label, title: b.label, 'data-act': b.id }); const i = el('span', 'tg-ico'); if (/^\s*<svg/.test(b.icon || '')) i.innerHTML = b.icon; else i.append(ico(b.icon || 'rules')); x.append(i); if (b.word) x.append(el('span', 'tg-act-word', b.word)); if (b.disabled) x.disabled = true; x.onclick = e => { e.stopPropagation(); b.run ? b.run() : send(b.move); }; A.append(x); return x; };
  frame.hand.classList.toggle('myturn', !!(!WATCH && v && v.turn === 0 && v.phase === 'play'));
  renderGame(UI, { frame, T: t, v, me, moves, seated: !WATCH, ui, send, toast, rerender: render, btn });
  btn({ id: 'rules', icon: 'rules', label: 'How to play', run: () => frame.modalShow('rules', UI.rulesCard()) }, 'small');
  btn({ id: 'stand', icon: 'stand', label: 'Stand up', run: () => {} }, 'small');
  if (t.phase === 'over' && frame.modalKind !== 'over') frame.modalShow('over', UI.overPanel(t, t.result, me));
  const last = log.slice(-1)[0]; if (last) { const w = UI.describe?.(t, t.view, last, me); if (w) frame.slip(w, 4000); }
}
addEventListener('resize', () => render());
render();
if (Q.get('rules') === '1') frame.modalShow('rules', UI.rulesCard());
window.__ready = true;
