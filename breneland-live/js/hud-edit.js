// The HUD Editor's pane (public/editor/hud.html): the game in a frame with the real HUD over the yard and sample words (an interact
// line, a quest, the clock, fish and treats, two chat lines, two tools on the radial), so what Andrew moves is what he gets. The
// editor drives it by postMessage (same origin) and reads back where every piece landed:
//   editor -> game  { type: 'hud-edit-set', layoutId, els, wheel, toolwheel }   show that layout with these numbers laid over the built-in
//                   { type: 'hud-edit-pop', id, on }                           open or close a popout (emote, dance, toolradial, questopen, bigmap, typing, logoff, questflare)
//                                                                              or show a mode's own pieces (maze, tower: hud-items.js ITEM_MODES)
//   game -> editor  { type: 'hud-edit-ready' }                                 once the HUD is up
//                   { type: 'hud-edit-geom', layoutId, k, u, Z, vw, vh, frame, els, numbers, boxes, pops }   after every layout and popout change
// boxes: piece id -> { l, t, w, h } in the frame's screen px (the real DOM boxes, nudges and all). numbers: the wheels' numbers in
// force (hud-layout.js numbers()). main.js only opens this for ?preview&hud-edit, none of it runs in the game proper.
import { specFor, POPOUT } from './hud-layout.js';
import { HUD_ITEMS } from './hud-items.js';

export function createHudEdit(ctx) {
  const { ui, inventory, input } = ctx;
  const hl = ctx.hudLayout;
  const hud = document.getElementById('hud');
  const $ = s => hud.querySelector(s);
  const feat = n => ctx.features?.find(f => f.name === n);
  const post = m => { try { parent?.postMessage(m, location.origin); } catch { /* no parent */ } };

  // ---- the sample words (constant, never a player's text)
  let lines = false;
  function sample() {
    ui.actDemo = 'Say hi to Nala'; ui.setAct('Say hi to Nala');
    ctx.currency?.set(14, 3, 2);
    hl.demoTemp = 16; // (61 degrees: the weather pill shows, hud-layout.js)
    ctx.quests?.set('demo', { title: 'Next dog treat', text: 'Two more fish to go.', progress: 0.6, prio: 1, color: '#ffe08a' });
    ctx.quests?.toggle(false);
    if (!lines) { lines = true; ui.chatLine('Sam', '#ffd24a', 'anyone fishing?'); ui.chatLine('Riley', '#8fd0ee', 'heading to the pier'); }
    clearTimeout(ui.chatTimer); ui.el?.chat?.classList.remove('quiet'); // the log stays up, it never goes quiet here
    inventory?.setAll?.({ rod: 1, treat: 3 }, ['rod', 'treat', null, null]); inventory?.unequip?.();
    ctx.npcs && (ctx.npcs.nearest = () => null);
  }

  // ---- the popouts: open and close them for real (their own modules), so they are edited where they pop out
  const POPS = {
    emote: { get open() { const e = feat('emotes'); return !!e?.wheel.isOpen && !e.dances; }, set(on) { const e = feat('emotes'); if (!e) return; if (on && !e.wheel.isOpen) e.toggle(); else if (!on && e.wheel.isOpen) { e.toggle(); } } },
    dance: { get open() { const e = feat('emotes'); return !!e?.wheel.isOpen && !!e.dances; }, set(on) { const e = feat('emotes'); if (!e) return; if (on && !e.dances) e.openDances('touch'); else if (!on && e.dances) e.back(); } },
    toolradial: { get open() { return hud.classList.contains('tools-open'); }, set(on) { feat('tools')?.setOpen(on); } },
    questopen: { get open() { return !ctx.quests?.collapsed; }, set(on) { ctx.quests?.toggle(on); } },
    bigmap: { get open() { return !$('#map').hidden; }, set(on) { const m = feat('minimap'); if (on) m?.show(); else m?.hide(); } },
    typing: { get open() { return $('#chat').classList.contains('open'); }, set(on) { const i = $('#chat-input'); if (on) i.focus(); else i.blur(); } },
    logoff: { get open() { return !$('#logoff').hidden; }, set(on) { const p = feat('pad-hud'); if (on) p?.logoff.show(); else p?.logoff.hide(); } },
    questflare: { get open() { return !$('#quest-flare').hidden; }, set(on) { $('#quest-flare').hidden = !on; } },
    // a mode's own pieces (hud-loose: hud-items.js mode), shown as they are while you play there, with sample words: the classes the
    // mode sets on #hud (so the yard's pieces step aside as they do then) and its pieces. The maze builds its own only when you go
    // down, so a sample of them is made here; the tower's are its own, filled in and shown. A touch layout gets the touch-only ones.
    maze: { get open() { return hud.classList.contains('mz-below'); }, set(on) {
      if (on && !mz) {
        const box = mk('div', 'mz-hud'), bar = mk('div', 'mz-breath'), fill = mk('div', 'mz-breath-fill'), view = mk('button', 'mz-view');
        fill.style.width = '70%'; bar.append(fill); box.append(mk('div', 'mz-dist', '42 m to the way out')); view.append(mk('span', 'mz-view-ico')); view.tabIndex = -1;
        mz = [bar, box, view]; hud.append(...mz);
      } else if (!on && mz) { for (const e of mz) e.remove(); mz = null; }
      hud.classList.toggle('mz-below', on); hud.classList.toggle('mz-touch', on && touchy());
    } },
    tower: { get open() { return hud.classList.contains('tw-climb'); }, set(on) {
      const card = $('.tower-card'), lg = $('.tower-btn.letgo');
      if (card) { card.replaceChildren(...(on ? [mk('div', 'tc-title', 'The Ladder  ·  Easy'), mk('div', 'tc-line', 'Push the stick up to climb. You hang on by yourself.'), mk('div', 'tc-line', 'Rest on the ledges: your grip fills up again.'), mk('div', 'tc-line', 'Lunge shows up at a gap. Let go is up the right side.')] : [])); card.hidden = !on; card.style.animation = on ? 'none' : ''; } // (no slide in here: its box is read at once)
      if (lg) { lg.hidden = !on; lg.classList.toggle('on', on && touchy()); lg.tabIndex = on ? -1 : 0; }
      hud.classList.toggle('tw-climb', on); hud.classList.toggle('tw-steel', on && touchy());
    } },
  };

  // ---- what the editor reads back: every piece's real box, the popouts' state, the wheels' numbers
  let mz = null;
  const mk = (tag, cls, txt = '') => { const e = document.createElement(tag); e.className = cls; e.textContent = txt; return e; };
  const touchy = () => /^(phone|tablet)/.test(hl.layoutId); // (the layouts a touch screen gets)
  const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' ? { l: r.left, t: r.top, w: r.width, h: r.height } : null; };
  function report() {
    const id = hl.layoutId, spec = specFor(id), boxes = {};
    for (const [k, sp] of Object.entries(spec)) {
      if (!hl.els()[k]) continue;
      if (k === 'emote') { // the wheel: its hub and slots together (the fan's hub is half off the screen, so measure what shows)
        const w = $('#emote-wheel'); if (w.hidden) continue;
        let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
        for (const e of w.querySelectorAll('.wh-slot, .wh-hub')) { const q = box(e); if (!q) continue; l = Math.min(l, q.l); t = Math.min(t, q.t); r = Math.max(r, q.l + q.w); b = Math.max(b, q.t + q.h); }
        if (l < r) boxes[k] = { l: Math.max(0, l), t, w: r - Math.max(0, l), h: b - t };
        continue;
      }
      const it = HUD_ITEMS[k];
      if (it?.mode) { // (a mode's piece: only while that mode is shown, and a touch-only one only on a touch layout; the real piece's box)
        const q = POPS[it.mode]?.open && (!it.touch || touchy()) && box($(sp.sel)); if (q) boxes[k] = q; continue;
      }
      if (k === 'typing' && !POPS.typing.open) continue;
      if (k === 'chat' && POPS.typing.open) continue;
      // (the slot has no piece of its own and the view toggle only shows inside: their place from the layout, so they can be moved)
      const g = hl.geom[k], q = (sp.sel && box($(sp.sel))) || ((sp.kind === 'slot' || sp.kind === 'anchor' || k === 'view') && g ? { l: g.l, t: g.t, w: g.w, h: g.h } : null);
      if (q) boxes[k] = q;
    }
    const pops = {}; for (const [k, p] of Object.entries(POPS)) pops[k] = p.open;
    const tr = hl.geom.toolradial;
    post({ type: 'hud-edit-geom', layoutId: id, k: hl.k, u: hl.u, Z: hl.zoom, vw: innerWidth, vh: innerHeight, frame: hl.frame, els: hl.els(), numbers: hl.numbers(), boxes, pops, popouts: [...POPOUT], pivot: tr ? { x: tr.px, y: tr.py } : null });
  }
  let due = 0;
  const soon = () => { if (due) return; due = requestAnimationFrame(() => { due = 0; report(); }); };

  // ---- the editor's messages
  addEventListener('message', e => {
    if (e.origin !== location.origin) return;
    const m = e.data; if (!m || typeof m !== 'object') return;
    if (m.type === 'hud-edit-set' && typeof m.layoutId === 'string') {
      const wasOpen = Object.fromEntries(Object.entries(POPS).map(([k, p]) => [k, p.open]));
      if (hl.edit.forced !== m.layoutId) { for (const [k, p] of Object.entries(POPS)) if (p.open) p.set(false); hl.edit.force(m.layoutId); }
      hl.edit.override(m.layoutId, { els: m.els || {}, wheel: m.wheel || null, toolwheel: m.toolwheel || null });
      // a wheel that was open is placed again as it opens (hud-emotes.js asks placeFan): close and reopen it so the new numbers show
      for (const k of ['emote', 'dance']) if (wasOpen[k] && hl.edit.forced === m.layoutId) { POPS[k].set(false); POPS[k].set(true); }
      soon();
    } else if (m.type === 'hud-edit-pop' && POPS[m.id]) { POPS[m.id].set(!!m.on); soon(); }
    else if (m.type === 'hud-edit-report') soon();
  });
  hl.onLayout(soon);
  if (typeof MutationObserver === 'function') {
    const mo = new MutationObserver(soon);
    mo.observe(hud, { attributes: true, attributeFilter: ['class'] });
    for (const sel of ['#emote-wheel', '#map', '#logoff', '#quest-flare', '#tool-pick']) { const n = $(sel); if (n) mo.observe(n, { attributes: true, attributeFilter: ['hidden', 'class'] }); }
    const q = $('#quests'); if (q) mo.observe(q, { attributes: true, attributeFilter: ['class', 'hidden'] });
    const c = $('#chat'); if (c) mo.observe(c, { attributes: true, attributeFilter: ['class'] });
  }
  addEventListener('resize', soon);
  input.onDevice = () => {}; // a key or tap in the pane mustn't switch away from the layout the editor asked for

  sample();
  hl.apply();
  setTimeout(() => { sample(); hl.apply(); post({ type: 'hud-edit-ready' }); report(); }, 400); // after the pills' pops, with the words placed
  return { name: 'hud-edit', report, POPS, update() {} };
}
