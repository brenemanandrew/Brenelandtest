// A small inventory: what you carry, the cross pad (hud-crosspad.js: four arms, one item each), the pockets panel, and what's in
// your right hand. Items live in ONE table (ITEMS): add a line there and give it an icon in fish-art.js. Persistence is the
// server's (lib/fishing.js): fishing.js feeds server state in through setAll(), add()/remove() are local. Which item sits on which
// arm travels with it ('arms' message, record.fishing.arms) and is mirrored in localStorage per player so it's there before the
// server answers (and offline).
//   ctx.inventory.count('rod' | 'treat'), .has(id), .add(id, n), .remove(id, n), .onChange(fn(id, count, delta)) -> unsubscribe
//   .equipped ('rod' | 'treat' | null), .equip(id | null), .toggle(id), .onEquip(fn(id, prev))
//   .arms (['rod', null, 'treat', null]: up, right, down, left), .assign(id, arm), .unassign(arm), .pressArm(arm)
//   .lastTool (what you last had in hand: the pad's tool button takes it out again), ITEMS[id].hold (its use is a hold)
// The arms are the tool radial's four slots (Z X C V), and on a pad the X and Y slots are arms 0 and 1. Tab opens the radial
// (hud-tools.js), I the pockets.
import { el, loadCss } from './util.js';
import { setIcon } from './fish-art.js';
import { createCrosspad, DIR_ARROWS, DIR_KEYS } from './hud-crosspad.js';

export const ITEMS = {
  rod:   { id: 'rod',   name: 'Stick Rod', tag: 'Tool', kind: 'tool', stackable: false, hold: true, blurb: 'A stick. With string. Kevin swears by it. Hold Space at the water to cast.' },
  treat: { id: 'treat', name: 'Dog Treat', tag: 'Snack', kind: 'consumable', stackable: true, blurb: 'Nala and Dax would do anything for one. Equip it, aim, and throw.' },
};
const ORDER = Object.keys(ITEMS);
const ARMS = 4;
const ARM_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV'];                 // keyboard aliases for the four arms (up, right, down, left)
const PAD_KEYS = ['PadUp', 'PadRight', 'PadDown', 'PadLeft'];     // the gamepad's D-pad (gamepad.js)
const CELLS = 12;

export function createInventory(ctx) {
  loadCss('/css/fishing.css');
  const items = {};
  const changeFns = [], equipFns = [], sections = [];
  let equipped = null, selected = 0, open = false, controlsBefore = true, lastTool = null;
  let arms = [null, null, null, null];
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const helpOpen = () => !document.getElementById('help').hidden || !document.getElementById('letter').hidden;
  const armKey = () => 'arms.' + (ctx.profile?.id || 'anon');
  const cleanArms = a => Array.isArray(a) ? [0, 1, 2, 3].map(i => (ITEMS[a[i]] ? a[i] : null)) : null;

  // ---------------------------------------------------------------- the cross pad
  const pad = createCrosspad(ctx, { onPress: i => api.pressArm(i) });
  function itemForArm(i) { const id = arms[i]; return id && (items[id] || 0) > 0 ? ITEMS[id] : null; }
  function paint() {
    for (let i = 0; i < ARMS; i++) { const it = itemForArm(i); pad.setArm(i, it, it ? items[it.id] : 0, !!it && it.id === equipped); }
    if (open) paintPanel();
  }
  function popArm(id) { const i = arms.indexOf(id); if (i >= 0) pad.pop(i); }
  function saveArms(send) {
    ctx.store.set(armKey(), arms);
    if (send && ctx.net.status === 'online') ctx.net.send({ t: 'arms', a: arms });
  }
  // a new kind of thing lands on the first free arm
  function autoAssign(id) {
    if (arms.includes(id)) return;
    const free = arms.findIndex((a, i) => !a || (items[a] || 0) <= 0 && a !== id);
    if (free < 0) return;
    arms[free] = id;
    saveArms(true);
  }
  arms = cleanArms(ctx.store.get(armKey(), null)) || arms;

  // ---------------------------------------------------------------- pockets panel
  const panel = el('div', 'fish-panel panel', '', { role: 'dialog', 'aria-label': 'Pockets' });
  panel.hidden = true;
  const head = el('div', 'fp-head');
  const title = el('h2', '', 'Pockets');
  const closeBtn = el('button', 'icon-btn fp-close', 'x', { type: 'button', 'aria-label': 'Close pockets' });
  closeBtn.onclick = () => { api.closePanel(); closeBtn.blur(); };
  head.append(title, closeBtn);
  const grid = el('div', 'fp-grid', '', { role: 'listbox', 'aria-label': 'Items' });
  const cellEls = [];
  for (let i = 0; i < CELLS; i++) {
    const c = el('button', 'fp-cell', '', { type: 'button', role: 'option' });
    const ic = el('span', 'fp-icon'); const ct = el('span', 'fp-count');
    c.append(ic, ct);
    c.onclick = () => { selected = i; paintPanel(); c.blur(); };
    c.ondblclick = () => { const it = owned()[i]; if (it) api.toggle(it.id); };
    grid.append(c);
    cellEls.push({ c, ic, ct });
  }
  const detail = el('div', 'fp-detail');
  const dIcon = el('span', 'fp-dicon'); const dText = el('div', 'fp-dtext');
  const dName = el('div', 'fp-dname'); const dTag = el('span', 'fp-dtag'); const dBlurb = el('div', 'fp-dblurb');
  const dArms = el('div', 'fp-arms'); const dArmsLabel = el('span', '', 'Put on');
  const armBtns = DIR_ARROWS.map((ar, i) => { const b = el('button', 'fp-arm', ar, { type: 'button', title: `Put it on the ${['up', 'right', 'down', 'left'][i]} arm (${DIR_KEYS[i]})`, 'aria-label': `Put it on the ${['up', 'right', 'down', 'left'][i]} arm` }); b.onclick = () => { const it = owned()[selected]; if (it) api.assign(it.id, i); b.blur(); }; return b; });
  dArms.append(dArmsLabel, ...armBtns);
  dText.append(dName, dTag, dBlurb, dArms);
  const dBtn = el('button', 'btn primary fp-equip', 'Equip', { type: 'button' });
  detail.append(dIcon, dText, dBtn);
  const extra = el('div', 'fp-extra');
  const foot = el('p', 'fine fp-foot', touch ? 'Tap an item, then Equip. The arrows put it on a tool slot.' : 'Arrows to look, Enter to equip, Z X C V to put it on a slot, I to close.');
  panel.append(head, grid, detail, extra, foot);
  ctx.hud.append(panel);

  const owned = () => ORDER.map(k => ITEMS[k]).filter(t => (items[t.id] || 0) > 0);
  function paintPanel() {
    const list = owned();
    selected = Math.max(0, Math.min(CELLS - 1, selected));
    cellEls.forEach(({ c, ic, ct }, i) => {
      const it = list[i];
      if (c.dataset.id !== (it ? it.id : '')) { c.dataset.id = it ? it.id : ''; ic.replaceChildren(); if (it) setIcon(ic, it.id); }
      ct.textContent = it && it.stackable ? String(items[it.id]) : '';
      c.classList.toggle('empty', !it);
      c.classList.toggle('sel', i === selected);
      c.classList.toggle('on', !!it && it.id === equipped);
      c.setAttribute('aria-selected', String(i === selected));
      c.setAttribute('aria-label', it ? it.name : 'Empty');
    });
    const it = list[selected];
    dIcon.replaceChildren();
    if (it) {
      setIcon(dIcon, it.id);
      dName.textContent = it.name + (it.stackable ? `  x${items[it.id]}` : '');
      dTag.textContent = it.tag; dBlurb.textContent = it.blurb;
      dBtn.hidden = false; dBtn.textContent = it.id === equipped ? 'Put away' : 'Equip';
      dArms.hidden = false;
      armBtns.forEach((b, i) => b.classList.toggle('on', arms[i] === it.id));
    } else {
      dName.textContent = list.length ? 'Nothing here' : 'Empty pockets';
      dTag.textContent = ''; dBlurb.textContent = list.length ? 'Pick one of your things.' : 'Kevin might have something for you at the end of the pier.';
      dBtn.hidden = true; dArms.hidden = true;
    }
    extra.replaceChildren();
    for (const fn of sections) { const n = fn(); if (n) extra.append(n); }
  }
  dBtn.onclick = () => { const it = owned()[selected]; if (it) api.toggle(it.id); dBtn.blur(); };

  // ---------------------------------------------------------------- the api
  const api = {
    name: 'inventory',
    items,
    ITEMS,
    canEquip: () => true,           // fishing closes this while a fish is being landed
    busy: () => false,              // fishing sets this while Kevin is talking: no pockets, no swapping items mid-sentence
    count: k => items[k] || 0,
    has: k => (items[k] || 0) > 0,
    add(k, n = 1) { if (!ITEMS[k]) return; const was = items[k] || 0; items[k] = was + n; changed(k, was); popArm(k); },
    remove(k, n = 1) { if (!ITEMS[k]) return; const was = items[k] || 0; items[k] = Math.max(0, was - n); changed(k, was); },
    // server truth: { rod: 1, treat: 3 } and, when it knows, the arm layout. Quietly replaces counts (fires onChange for the ones that changed).
    setAll(map, armLayout) {
      const a = cleanArms(armLayout);
      if (a && a.some(Boolean)) { arms = a; ctx.store.set(armKey(), arms); }
      for (const k of ORDER) {
        const was = items[k] || 0, now = Math.max(0, Math.floor(map[k] || 0));
        if (was !== now) { items[k] = now; changed(k, was); }
      }
      if (a && !a.some(Boolean)) saveArms(true); // the server has no layout yet: tell it ours
      paint();
    },
    onChange(fn) { changeFns.push(fn); return () => { const i = changeFns.indexOf(fn); if (i >= 0) changeFns.splice(i, 1); }; },
    onEquip(fn) { equipFns.push(fn); return () => { const i = equipFns.indexOf(fn); if (i >= 0) equipFns.splice(i, 1); }; },
    addSection(fn) { sections.push(fn); },
    get equipped() { return equipped; },
    get panelOpen() { return open; },
    get arms() { return arms.slice(); },
    get lastTool() { return lastTool && api.has(lastTool) ? lastTool : (arms.find(a => a && api.has(a)) || null); },
    itemForArm,
    equip(id) {
      if (id && !api.has(id)) return false;
      if (id === equipped) return true;
      if (!api.canEquip(id)) return false;
      const prev = equipped;
      equipped = id || null;
      if (equipped) lastTool = equipped;
      ctx.player.setHeld(equipped);
      for (const fn of equipFns) { try { fn(equipped, prev); } catch (e) { console.error(e); } }
      ctx.audio.play('fish-equip');
      paint();
      return true;
    },
    unequip() { return api.equip(null); },
    toggle(id) { return api.equip(id === equipped ? null : id); },
    // the cross pad: an arm pressed (click, D-pad, Z X C V) equips what is on it, or puts it away
    pressArm(i) { const it = itemForArm(i); if (it) api.toggle(it.id); else ctx.audio.play('fish-blip'); },
    // put an item on an arm (from the pockets panel); it leaves the arm it was on
    assign(id, i) {
      if (!ITEMS[id] || i < 0 || i >= ARMS) return;
      const from = arms.indexOf(id);
      if (from === i) return;
      if (from >= 0) arms[from] = arms[i]; // swap with whatever was there
      arms[i] = id;
      saveArms(true);
      pad.pop(i);
      ctx.audio.play('fish-pop');
      paint();
    },
    // take whatever is on an arm off it (holding a filled slot, hud-tools.js / hud-pad.js); in your hand, it goes back in the pocket
    unassign(i) {
      if (i < 0 || i >= ARMS || !arms[i]) return;
      const id = arms[i];
      arms[i] = null;
      if (equipped === id) api.equip(null);
      saveArms(true);
      ctx.audio.play('fish-pop');
      paint();
    },
    flash(ms) { pad.flash(ms); },
    repaint() { paint(); },        // an item's name or look changed (fishing.js: a new pole from the Fish Shack)
    cycle() {
      const have = ORDER.filter(k => api.has(k));
      if (!have.length) return;
      const i = equipped ? have.indexOf(equipped) : -1;
      api.equip(i + 1 >= have.length ? null : have[i + 1]);
    },
    openPanel() {
      if (open || ctx.mode !== 'play' || helpOpen() || api.busy()) return;
      open = true; controlsBefore = ctx.player.controls; ctx.player.controls = false;
      selected = Math.max(0, owned().findIndex(t => t.id === equipped));
      panel.hidden = false; paintPanel();
      ctx.audio.play('fish-pop');
    },
    closePanel() {
      if (!open) return;
      open = false; panel.hidden = true;
      ctx.player.controls = ctx.mode === 'play' ? !helpOpen() : controlsBefore && !helpOpen();
      ctx.audio.play('fish-pop');
    },
    togglePanel() { if (open) api.closePanel(); else api.openPanel(); },
    update(dt, now) {
      // a panel must not survive the help panel or leaving play mode
      if (open && (ctx.mode !== 'play' || helpOpen())) { open = false; panel.hidden = true; }
    },
    target() { return null; },
    onKey(code) {
      if (ctx.input.typing || api.busy() || ctx.below) return false; // below, the keys are the maze's (C crouches there)
      const padDir = PAD_KEYS.indexOf(code);
      if (open) {
        const list = owned();
        const armDir = ARM_KEYS.indexOf(code);
        if (armDir >= 0) { if (list[selected]) api.assign(list[selected].id, armDir); return true; }
        switch (padDir >= 0 ? ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][padDir] : code) {
          case 'KeyI': case 'Escape': api.closePanel(); return true;
          case 'ArrowRight': selected = Math.min(CELLS - 1, selected + 1); paintPanel(); return true;
          case 'ArrowLeft': selected = Math.max(0, selected - 1); paintPanel(); return true;
          case 'ArrowDown': selected = Math.min(CELLS - 1, selected + 4); paintPanel(); return true;
          case 'ArrowUp': selected = Math.max(0, selected - 4); paintPanel(); return true;
          case 'Enter': case 'NumpadEnter': case 'Space': case 'KeyE': if (list[selected]) api.toggle(list[selected].id); return true;
        }
        return true; // swallow everything else while the panel is up
      }
      const arm = ARM_KEYS.indexOf(code); // the pad's D-pad doesn't take tools out, X and Y do (hud-pad.js)
      if (arm >= 0) { api.pressArm(arm); return true; }
      if (code === 'KeyI') { api.openPanel(); return true; }
      if (code === 'KeyQ') { api.cycle(); return true; }
      // the pad's tool button with empty hands takes out the tool you had last (in hand, fishing.js uses it)
      if (code === 'ToolUse' && !equipped) {
        const t = api.lastTool;
        if (t) api.equip(t); else { ctx.audio.play('fish-blip'); ctx.ui.toast('No tools yet. Kevin at the end of the pier has a rod for you.', 2600); }
        return true;
      }
      return false;
    },
    // no help lines: these keys are drawn in Settings > Controls, from controls-map.js
  };

  function changed(k, was) {
    const now = items[k] || 0;
    if (was <= 0 && now > 0) autoAssign(k);
    if (equipped === k && now <= 0) { equipped = null; ctx.player.setHeld(null); for (const fn of equipFns) { try { fn(null, k); } catch (e) { console.error(e); } } }
    for (const fn of changeFns) { try { fn(k, now, now - was); } catch (e) { console.error(e); } }
    paint();
  }
  paint();
  return api;
}
