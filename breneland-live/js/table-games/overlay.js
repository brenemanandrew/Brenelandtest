// The flat overlay frame every table game shares (table-games, tg-look): the players strip, the board, your hand and the buttons,
// each a region placed from tg-layout.js (Andrew moves them in the HUD Editor's "Table games" screen), plus the moment's slip at
// the board's foot, one card at a time over the board (the rules, the round's end, the scores), a tip line, and the view
// button. The board and the rack are tg-board's (a printed board with real 3D pieces, drag to play); the eyecatches and the
// sounds of each moment are tg-eyecatch.js and tg-look.js. Upright on a phone the 3D view is the band above a solid panel. The
// game fills the regions (mt-ui.js); this only builds and places them. While it is open the town HUD steps aside (#hud.tg-on).
import { el, loadCss } from '../util.js';
import { formOf, layoutFor, applyLayout, loadSaved } from './tg-layout.js';
import { createTgBoard } from './tg-board.js';
import { createEyecatch } from './tg-eyecatch.js';
import { createLook, LOOK } from './tg-look.js';

export function createFrame(ctx) {
  loadCss('/css/table-games.css');
  const hud = ctx.hud;
  const root = el('div', 'tg', '', { hidden: '', role: 'region', 'aria-label': 'The table game' });
  const bg = el('div', 'tg-panel-bg');
  const bar = el('div', 'tg-bar tg-reg', '', { 'aria-label': 'The players' });
  const boardWrap = el('div', 'tg-boardwrap tg-reg');
  const board = el('div', 'tg-board', '', { 'aria-label': 'The board' });
  const slipEl = el('div', 'tg-slip', '', { 'aria-live': 'polite', hidden: '' });
  const modal = el('div', 'tg-modal', '', { hidden: '', role: 'dialog' });
  const modalX = el('button', 'tg-x', '', { type: 'button', 'aria-label': 'Close' }); modalX.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#2b2340" stroke-width="2.8" stroke-linecap="round"/></svg>';
  const modalBody = el('div', 'tg-modal-body');
  modal.append(modalX, modalBody);
  const tipEl = el('div', 'tg-tip', '', { hidden: '' });
  boardWrap.append(board, slipEl, modal, tipEl);
  const hand = el('div', 'tg-hand tg-reg', '', { 'aria-label': 'Your hand' });
  const acts = el('div', 'tg-acts tg-reg', '', { 'aria-label': 'Your moves' });
  const toggle = el('button', 'tg-toggle', '', { type: 'button', 'aria-label': 'Switch the view' });
  root.append(bg, bar, boardWrap, hand, acts, toggle);
  hud.append(root);
  const tb = createTgBoard({ root, wrap: boardWrap, board, hand });
  // when the board or the hand is drawn by something else (the setup's chairs, the spectator's line) the 3D steps aside
  const watch = (box, sel, off) => new MutationObserver(() => { if (!box.querySelector(sel)) off(); }).observe(box, { childList: true });
  watch(board, ':scope > .tg-b3', () => tb.setBoard(null));
  watch(hand, ':scope > .tg-hrow.b3', () => tb.setRack(null));
  let saved = null; loadSaved().then(s => { saved = s; key = ''; });
  let key = '', form = 'pc', L = layoutFor('pc', null), modalKind = null, cardUp = null, waiting = null;
  const timers = {};
  const later = (k, ms, fn) => { clearTimeout(timers[k]); timers[k] = setTimeout(fn, ms); };
  function relayout() {
    const f = formOf(innerWidth, innerHeight, ctx.hudLayout?.layoutId), k = f + innerWidth + 'x' + innerHeight + (saved ? 's' : '');
    if (k === key) return false;
    key = k; form = f; L = layoutFor(f, saved); applyLayout(root, f, L);
    root.classList.toggle('portrait', f === 'portrait');
    return true;
  }
  modalX.onclick = e => { e.stopPropagation(); api.modalHide(); };
  tipEl.onclick = () => { tipEl.hidden = true; };
  // a card waits a moment for a stamp on the board ("Domino!", then the count) and then takes its place: one thing at a time
  function showCard(kind, content) {
    waiting = null; cardUp = kind; modalBody.textContent = ''; modalBody.append(content); modal.hidden = false; modal.dataset.kind = kind;
    try { content.onShow?.(); } catch (e) { console.error('[tg] card', e); }
  }
  const eye = createEyecatch({ root, get modalKind() { return cardUp; } });
  createLook(ctx, { root }, eye, tb);
  const api = {
    root, bar, board, hand, acts, toggle, tb, eye, look: LOOK,
    get form() { return form; }, get L() { return L; }, get modalKind() { return modalKind; }, get saved() { return saved; },
    relayout,
    show(mode) { root.hidden = false; root.classList.toggle('watching', mode === 'watch'); hud.classList.add('tg-on'); relayout(); },
    hide() { root.hidden = true; hud.classList.remove('tg-on'); api.modalHide(); slipEl.hidden = true; tipEl.hidden = true; eye.clear(); tb.hide(); LOOK.openId = null; },
    slip(text, ms) { slipEl.textContent = text; slipEl.hidden = false; slipEl.classList.remove('pop'); void slipEl.offsetWidth; slipEl.classList.add('pop'); later('slip', Math.max(1600, ms + 1400), () => { slipEl.hidden = true; }); },
    // the moment's banner is a stamp now (tg-eyecatch); the double's own stamp already says it, so a second is not shown
    banner(text, ms) { if (Date.now() - (LOOK.stampAt || 0) < 1500) return; eye.stamp(/double/i.test(text) ? 'Double!' : text, /double/i.test(text) ? 'Answer it first' : '', { ms: Math.min(2200, ms || 1500) }); },
    modalShow(kind, content) {
      modalKind = kind;
      const s = eye.showing;
      if (s && s.kind === 'stamp' && s.for < 750) { waiting = [kind, content]; later('card', 750 - s.for, () => { if (waiting) { const w = waiting; cardUp = w[0]; eye.dismiss(); showCard(...w); } }); return; }
      if (s && s.kind === 'stamp') { cardUp = kind; eye.dismiss(); } // (the card up first, so the next eyecatch waits for it)
      showCard(kind, content);
    },
    modalHide() { modalKind = null; cardUp = null; waiting = null; clearTimeout(timers.card); modal.hidden = true; modalBody.textContent = ''; },
    tip(text, ms) {
      tipEl.textContent = '';
      if (/^Tap a tile, then a lit spot/.test(text)) text = 'Drag a tile onto a glowing spot (or tap it, then the spot). Nothing fits? Draw.';
      const ic = el('span', 'tg-tip-ic', '', { 'aria-hidden': 'true' }); ic.innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="7" height="13" rx="2" fill="#fbf6ea" stroke="#2b2340" stroke-width="1.8"/><path d="M14 5c3 0 6 2 6 6" fill="none" stroke="#2b2340" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 2.5"/><path d="M18 9l2 2 2-2" fill="none" stroke="#2b2340" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      tipEl.append(ic, el('span', '', text)); tipEl.hidden = false; later('tip', ms, () => { tipEl.hidden = true; });
    },
    get slipText() { return slipEl.hidden ? '' : slipEl.textContent; }, get bannerText() { const s = eye.showing; return s && s.kind === 'stamp' ? s.text : ''; },
  };
  return api;
}
