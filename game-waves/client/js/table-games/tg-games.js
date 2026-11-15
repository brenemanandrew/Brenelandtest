// The table games other than Mexican Train (game-waves): their UI modules by game id, loaded one by one so a broken one never
// takes the others (or Mexican Train) down with it, and the parts of the overlay every such game shares: the players strip, the
// board and hand through the game's render(), its buttons, its CSS. index.js keeps Mexican Train's own path as it was and calls
// renderGame() for the rest; the harness (game-waves/tools/harness) calls the same, so what it shows is what the game shows.
// A game's UI module is described in game-waves/SPEC.md section 3.
import { el } from '../util.js';
import { SEAT_COLORS } from './dominoes.js';
import { ico } from './mt-ui.js';
import { createGeneric3D } from './generic-3d.js';

export const FILES = { 'word-weave': './word-weave-ui.js', 'missing-pie': './missing-pie-ui.js', 'town-tycoon': './town-tycoon-ui.js' };
export const UIS = {};
// each game's own pieces on the real table (<id>-3d.js: create(parent, table) like createGeneric3D); a missing or broken one
// falls back to the generic board and pawns
export const FILES3D = { 'word-weave': './word-weave-3d.js', 'missing-pie': './missing-pie-3d.js', 'town-tycoon': './town-tycoon-3d.js' };
export const T3D = {};
const css = new Set();
export const ready = Promise.all([
  ...Object.entries(FILES).map(([id, f]) => import(f).then(m => { UIS[id] = m.default; }).catch(e => console.error('[tg-games] could not load', id, e))),
  ...Object.entries(FILES3D).map(([id, f]) => import(f).then(m => { const c = m.create || (m.default && m.default.create); if (typeof c === 'function') T3D[id] = c; }).catch(e => console.warn('[tg-games] no 3D pieces for', id, e))),
]);
let settled = false; ready.then(() => { settled = true; });
export const uiOf = game => (game && game !== 'mexican-train' ? UIS[game] || null : null);
function cssOnce(UI) { if (!UI.css || css.has(UI.id)) return; css.add(UI.id); const s = document.createElement('style'); s.dataset.tgGame = UI.id; s.textContent = UI.css; document.head.append(s); }

// the game's pieces on the real table (its <id>-3d.js, else the UI module's table3d, else the generic board and pawns)
export function table3dFor(game, parent, d) {
  if (game && FILES3D[game] && !settled) return late3d(game, parent, d); // (asked before the modules arrived: swap in once they do)
  const UI = uiOf(game);
  try { if (game && T3D[game]) return T3D[game](parent, d); } catch (e) { console.error('[tg-games] 3d', game, e); }
  try { if (UI?.table3d) return UI.table3d(parent, d); } catch (e) { console.error('[tg-games] table3d', game, e); }
  return createGeneric3D(parent, d, UI?.look3d || {});
}

// a stand-in until the game's modules have loaded: the generic pieces, then the game's own with the last update replayed
function late3d(game, parent, d) {
  let cur = createGeneric3D(parent, d, {}), last = null, gone = false;
  ready.then(() => {
    if (gone) return;
    const nx = table3dFor(game, parent, d), vis = cur.root.visible; cur.dispose(); cur = nx; cur.root.visible = vis;
    if (last) cur.update(...last);
  });
  return {
    get root() { return cur.root; }, get flying() { return !!cur.flying; },
    update(...a) { last = a; cur.update(...a); }, tick(...a) { cur.tick(...a); }, slide(...a) { cur.slide(...a); },
    drawn: () => (cur.drawn ? cur.drawn() : null),
    dispose() { gone = true; cur.dispose(); },
  };
}

// the players strip for a generic game: the dot in the seat colour, bot/folk mark, the name, then what the game adds per seat
export function renderBar(bar, T, v, me, UI, net) {
  bar.textContent = '';
  const list = T.order && T.phase !== 'setup' ? T.order.map((chair, k) => ({ chair, k })) : T.seats.map((s, chair) => ({ chair, k: null })).filter(x => T.seats[x.chair]);
  for (const { chair, k } of list) {
    const s = T.seats[chair], turn = v && k !== null && v.turn === k && v.phase === 'play';
    const c = el('div', 'tg-chip' + (turn ? ' turn' : '') + (k !== null && k === me ? ' me' : '') + (s?.away || s?.kind === 'open' ? ' away' : ''), '', { 'data-chair': chair });
    c.style.setProperty('--seat', SEAT_COLORS[chair % 8]);
    c.append(el('i', 'tg-dot'));
    if (s?.kind === 'bot') c.append(ico('bot', 'tg-kind')); else if (s?.kind === 'npc') c.append(ico('folk', 'tg-kind'));
    c.append(el('span', 'tg-cn', k !== null && k === me ? 'You' : s?.kind === 'open' ? 'Free seat' : s?.name || ''));
    if (v && k !== null && UI?.chip) {
      let x = null; try { x = UI.chip(T, v, k); } catch (e) { console.error('[tg-games] chip', e); }
      if (x) {
        if (x.count != null) c.append(el('span', 'tg-cc', String(x.count)));
        if (x.score != null) c.append(el('b', 'tg-cs', String(x.score)));
        for (const e of x.extra || []) c.append(e);
      }
    }
    if (T.table?.timer && turn) c.append(el('span', 'tg-clock', '', { title: 'Time left for this turn' }));
    bar.append(c);
  }
  if (v && T.phase !== 'setup' && UI?.pill) { let p = null; try { p = UI.pill(T, v); } catch (e) { console.error('[tg-games] pill', e); } if (p) bar.append(el('div', 'tg-round-pill', p)); }
  void net;
}

// the board, the hand and the game's buttons (index.js adds the table's own after: put away, rules, end, stand)
// a: { frame, T, v, me, moves, seated, ui, send, toast, rerender, btn(b, cls) }
export function renderGame(UI, a) {
  cssOnce(UI);
  const { frame, T } = a;
  frame.root.classList.add('tg-' + UI.id);
  const s = { T, v: a.v, me: a.me, moves: a.moves || [], seated: !!a.seated, ui: a.ui, send: a.send, toast: a.toast, rerender: a.rerender };
  try { UI.render(frame.board, frame.hand, s); } catch (e) { console.error('[tg-games] render', UI.id, e); frame.board.textContent = 'This game could not be drawn.'; }
  if (a.seated && T.phase === 'play') {
    let list = []; try { list = UI.buttons(s) || []; } catch (e) { console.error('[tg-games] buttons', UI.id, e); }
    for (const b of list) a.btn(b);
  }
  return s;
}
export function clearGameClass(root) { for (const c of [...root.classList]) if (c.startsWith('tg-') && FILES[c.slice(3)]) root.classList.remove(c); }
