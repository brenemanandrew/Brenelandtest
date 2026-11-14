// Toasts keep clear of the mini-games' bars (the HUD rule: nothing covers another piece's words). The toasts sit just under
// the top band, and on some layouts so do the swim breath bar, the fishing cue, the tower's grip bar, the bocce cards, the
// swing coach and the stats card. While a toast is up and one of those is where the toasts would be, the toasts step down
// below it (inline margin-top on #toasts, in #hud's own pixels). Runs when a toast comes or goes, a piece shows or hides, the
// layout moves the band (#hud's style vars, data-hud) or the window resizes, coalesced to one measure a frame, and again
// every RECHECK_MS while a toast is up (a bar can settle a moment after the toast arrives). Nothing at all while no toast is up.
const BARS = '.swim-hud, .tower-hud, .fish-cue, .bocce-score, .bocce-aim, .swing-coach, .swing-side, .swing-dist, .swing-score, .stats, .lc-view, .pie-card, #quests:not(.collapsed) .qt-body'; // (the open quest list too: on the upright phone it hid the toasts under it)
const GAP = 14, RECHECK_MS = 250;   // (14: a toast rises 12 px into place as it appears, style.css rise-t: it never touches the bar)

export function initToastClear(toasts) {
  const hud = toasts && toasts.parentElement;
  if (!hud || typeof MutationObserver === 'undefined' || typeof requestAnimationFrame === 'undefined') return null;
  let queued = false, dy = 0, last = null, again = 0;
  const shown = e => (e.checkVisibility ? e.checkVisibility({ visibilityProperty: true, opacityProperty: true }) : e.getClientRects().length > 0);
  function place() {
    queued = false;
    if (!toasts.childElementCount) { if (dy) { dy = 0; toasts.style.marginTop = ''; } return; }
    if (!again) again = setTimeout(() => { again = 0; queue(); }, RECHECK_MS);
    const k = hud.offsetHeight ? hud.getBoundingClientRect().height / hud.offsetHeight : 1;   // (#hud may be zoomed: style.css's TV zoom)
    const r = toasts.getBoundingClientRect();
    const top0 = r.top - dy * k, h = r.height;
    let top = top0;
    const bars = [];
    for (const e of hud.querySelectorAll(BARS)) {
      if (ro && !watched.has(e)) { watched.add(e); ro.observe(e); }   // a bar that grows (its label wraps, a font arrives) is measured again at once
      if (shown(e)) { const b = e.getBoundingClientRect(); if (b.width > 0 && b.height > 0) { b.el = e.className; bars.push(b); } }
    }
    // only a bar in the toasts' own band counts: one that starts above where the toasts start, or just under it. A bar lower
    // down (the tower's grip ring at the bottom on the PC) is left alone: a tall stack of toasts may reach it for a moment,
    // and stepping down past it would put the toasts under the chat or off the screen.
    const band = bars.filter(b => b.left < r.right && b.right > r.left && b.top < top0 + 24 * k);
    for (let pass = 0; pass < 4; pass++) {   // a bar under a bar: step down past each one the toasts would touch
      let moved = false;
      for (const b of band) if (b.top < top + h && b.bottom + GAP > top) { top = b.bottom + GAP * k; moved = true; }
      if (!moved) break;
    }
    const floor = innerHeight - 8 * k - Math.min(h, r.height);   // and never off the bottom of the screen
    if (top > floor) top = Math.max(top0, floor);
    last = { top0: Math.round(top0), h: Math.round(h), top: Math.round(top), bars: bars.map(b => [b.el, Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]) };
    const nd = Math.round((top - top0) / k);
    if (nd !== dy) { dy = nd; toasts.style.marginTop = nd ? nd + 'px' : ''; }
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(place); } };
  const watched = new WeakSet(), ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (toasts.childElementCount) queue(); }) : null;
  if (ro) ro.observe(toasts);
  new MutationObserver(queue).observe(toasts, { childList: true });
  new MutationObserver(() => { if (toasts.childElementCount) queue(); }).observe(hud, { subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  new MutationObserver(() => { if (toasts.childElementCount) queue(); }).observe(hud, { attributes: true, attributeFilter: ['style', 'data-hud'] });   // (hud-layout.js: --top-b and the rest)
  addEventListener('resize', queue);
  return { place, get dy() { return dy; }, get last() { return last; } };
}
