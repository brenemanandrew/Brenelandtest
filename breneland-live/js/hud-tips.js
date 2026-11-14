// The PC's key tooltip (hud3, 2026-11-03; Andrew: "on PC the keys show on hover only", the ? lists every key): point the mouse at
// a HUD button and a small dark pill names it and shows its key, above it (or below when there's no room), kept on the screen.
// No key caps are drawn on the buttons any more. Only on the PC layout and only for a mouse; Settings > Controls' "Key hints when
// you point" (#hud.no-kc) switches it off. One element, moved on pointerover / pointerout: nothing per frame.
//   createTips({ hud, layoutId: () => id })  -> { el, show(target), hide(), get shown() }
import { el } from './util.js';

// what each button is called and its key (the name may come from the button itself when it changes: the view toggle, the mic)
const TIPS = [
  ['#btn-act', () => 'Interact', 'E'],
  ['#tg-emotes', () => 'Emotes', 'G'],
  ['#tg-tools', () => 'Tools', 'Tab'],
  ['#mic-toggle', b => b.dataset.tipTitle || 'Voice chat', 'B'],
  ['.lc-view', b => b.getAttribute('aria-label') || 'Switch the view', 'F'],
  ['#btn-help', () => 'Settings and help', 'H'],
  ['#minimap', () => 'The map', 'N'],
  ['#hud-time', () => 'The time: opens the map', 'N'],
  ['#hud-wx', b => b.dataset.word || 'The weather', ''], // (hud-loose: its word, Cloudy or Rain, the pill shows only its icon)
  ['#quests .qt-head', () => 'Quests', 'J'],
  ['#online', () => "Who's here", ''],
  ['#crosspad .cp-arm', b => b.getAttribute('aria-label') || 'A tool slot', b => b.querySelector('.cp-key')?.textContent || ''],
];

export function createTips({ hud, layoutId }) {
  const tip = el('div', 'hud-tip', '', { 'aria-hidden': 'true' });
  const name = el('span', 'ht-name', ''), key = el('kbd', 'ht-key', '');
  tip.append(name, key); tip.hidden = true; hud.append(tip);
  let on = null;
  const find = t => { if (!t?.closest) return null; for (const [sel, n, k] of TIPS) { const b = t.closest(sel); if (b && hud.contains(b)) return { b, n, k }; } return null; };
  function show(target) {
    const f = find(target);
    if (!f || !layoutId().startsWith('pc') || hud.classList.contains('no-kc')) return hide();
    const { b } = f;
    // (the browser's own title tooltip would come up a second later on top of this one: hold it while the mouse is on the button)
    if (b.title) { b.dataset.tipTitle = b.title; b.removeAttribute('title'); }
    name.textContent = f.n(b); key.textContent = typeof f.k === 'function' ? f.k(b) : f.k;
    tip.hidden = false; on = b;
    const r = b.getBoundingClientRect(), Z = parseFloat(getComputedStyle(hud).zoom) || 1, w = tip.offsetWidth * Z, h = tip.offsetHeight * Z, m = 6;
    let x = r.left + r.width / 2 - w / 2, y = r.top - h - 8;
    if (y < m) y = r.bottom + 8;
    x = Math.max(m, Math.min(innerWidth - w - m, x)); y = Math.max(m, Math.min(innerHeight - h - m, y));
    tip.style.left = (x / Z).toFixed(1) + 'px'; tip.style.top = (y / Z).toFixed(1) + 'px';
  }
  function hide() {
    if (on?.dataset.tipTitle) { on.title = on.dataset.tipTitle; delete on.dataset.tipTitle; }
    on = null; tip.hidden = true;
  }
  hud.addEventListener('pointerover', e => { if (e.pointerType === 'mouse') { const f = find(e.target); if (f?.b !== on) { hide(); show(e.target); } } });
  hud.addEventListener('pointerout', e => { if (on && !on.contains(e.relatedTarget)) hide(); });
  hud.addEventListener('pointerdown', () => hide()); // (a click: the button does its thing, the tip goes)
  return { el: tip, show, hide, get shown() { return on; } };
}
