// Your tools on the HUD. The four slots are the cross pad's arms (hud-crosspad.js, filled by inventory.js: Z X C V). Here they're
// the tool radial, a half disc that fans out of the tools button (the basket), about 70% size and tilted about 35 degrees up so it
// clears the jump and interact buttons (hud-layout.js places and tilts it from the layout's "toolradial").
//   Tap or click the tools button (Tab on a keyboard) to open it. Again, Esc, or a tap anywhere off it closes it.
//   Tap a filled slot to take it out (or put it away if it's in your hand), and the radial folds.
//   Hold (or tap) an empty slot to open the tool picker out of it (hud-pad.js picker), then tap a tool to put it there.
//   Hold a filled slot to take the tool off it.
//   Z X C V take one out without opening anything (inventory.js).
// The pad has its own X and Y slots and the dome (hud-pad.js). There the tool button still reaches features as 'ToolUse'.
import { setIcon } from './fish-art.js';

export const SLOT_HOLD_MS = 550; // a press this long on a slot is a hold (assign / unassign)

export function createTools(ctx) {
  const { input, inventory } = ctx;
  const hud = document.getElementById('hud');
  const btn = document.getElementById('tg-tools');
  const held = btn.querySelector('.tg-held');
  const ring = document.getElementById('toolring');
  const cross = document.getElementById('crosspad');
  const none = ring.querySelector('.tg-none');
  const anyOwned = () => Object.keys(inventory.ITEMS).some(k => inventory.has(k));
  const picker = () => ctx.features?.find(f => f.name === 'pad-hud')?.picker;
  const radialLayout = () => hud.dataset.hud !== 'pad';
  let noneT = 0;

  const setOpen = on => {
    if (on && !radialLayout()) on = false;
    hud.classList.toggle('tools-open', on);
    btn.setAttribute('aria-expanded', String(on));
    const empty = on && !anyOwned();
    if (empty) { // nothing owned yet: a word beside the button instead of four empty slots
      const g = ctx.hudLayout?.geom.tools, Z = ctx.hudLayout?.zoom || 1;
      if (g) { none.style.left = ((g.l - 8) / Z) + 'px'; none.style.top = ((g.t + g.h / 2) / Z) + 'px'; none.style.transform = 'translate(-100%, -50%)'; }
      hud.classList.remove('tools-open');
    }
    none.hidden = !empty; noneT = empty ? 2.2 : 0;
    if (!on) picker()?.close();
    if (on && !document.getElementById('emote-wheel').hidden) ctx.features?.find(f => f.name === 'emotes')?.toggle(); // one thing open at a time
  };
  btn.onclick = () => { btn.blur(); setOpen(!hud.classList.contains('tools-open')); ctx.audio.ui?.('blip'); };
  document.addEventListener('pointerdown', e => {
    if (!hud.classList.contains('tools-open')) return;
    if (ring.contains(e.target) || document.getElementById('tool-pick').contains(e.target)) return;
    setOpen(false);
  }, true);

  // ---- the slots: a tap uses, a hold assigns (empty) or unassigns (filled)
  const arms = [...cross.querySelectorAll('.cp-arm')];
  let press = null; // { i, id, t0, timer, done }
  function pivotOfSlot(i) { // the picker comes out of the slot, away from the radial's middle (hud-pad.js fits it like the iPad's wheels)
    const b = arms[i].getBoundingClientRect(), g = ctx.hudLayout?.geom.toolradial;
    const x = b.left + b.width / 2, y = b.top + b.height / 2;
    const ang = g ? Math.atan2(x - g.px, -(y - g.py)) * 180 / Math.PI : 0;
    return { x, y, angle: ang, parent: b.width };
  }
  function holdDone(i) {
    press.done = true;
    const it = inventory.itemForArm(i);
    arms[i].classList.remove('holding');
    if (it) { inventory.unassign(i); ctx.ui.toast(`${it.name} taken off the ${['Z', 'X', 'C', 'V'][i]} slot`, 2000); input.rumble(0.3, 0.3, 80); }
    else { const p = pivotOfSlot(i); picker()?.open(i, { ...p, from: 'touch' }); }
  }
  arms.forEach((b, i) => {
    b.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clearTimeout(press?.timer);
      press = { i, id: e.pointerId, done: false, timer: setTimeout(() => holdDone(i), SLOT_HOLD_MS) };
      b.classList.add('holding');
      try { b.setPointerCapture(e.pointerId); } catch { /* fine */ }
    });
    const end = e => { if (press && press.i === i && e.pointerId === press.id) { clearTimeout(press.timer); b.classList.remove('holding'); if (!press.done) press.tap = true; } };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', e => { if (press && press.i === i) { clearTimeout(press.timer); b.classList.remove('holding'); press = null; } });
    b.addEventListener('contextmenu', e => e.preventDefault());
    // the click that follows: a tap uses the slot (hud-crosspad's own handler), a finished hold swallows it
    b.addEventListener('click', e => {
      const p = press; press = null;
      if (p && p.done) { e.stopImmediatePropagation(); return; }
      if (!inventory.itemForArm(i)) { e.stopImmediatePropagation(); const pv = pivotOfSlot(i); picker()?.open(i, { ...pv, from: 'touch' }); return; } // an empty slot: tap = pick too
      setTimeout(() => setOpen(false), 0); // a filled slot was used: the radial folds
    }, true);
  });

  let heldId = '';
  return {
    name: 'tools',
    setOpen,
    get open() { return hud.classList.contains('tools-open'); },
    anyTool: () => { for (let i = 0; i < 4; i++) if (inventory.itemForArm(i)) return true; return false; },
    update(dt) {
      // the button wears what is in your hand
      const eq = inventory.equipped || '';
      if (eq !== heldId) {
        heldId = eq; held.replaceChildren(); if (eq) setIcon(held, eq); btn.classList.toggle('holding', !!eq);
        if (hud.classList.contains('tools-open') && !picker()?.isOpen) setOpen(false); // a key took one out: the radial folds as a click would
      }
      if (noneT > 0 && (noneT -= dt) <= 0) none.hidden = true;
      if (hud.classList.contains('tools-open') && (ctx.mode !== 'play' || input.typing || !radialLayout())) setOpen(false);
    },
    onKey(code) {
      if (code === 'Escape' && hud.classList.contains('tools-open')) { setOpen(false); return true; }
      if (code === 'Tab' && !input.typing && radialLayout() && ctx.mode === 'play' && !ctx.player.takeover) { setOpen(!hud.classList.contains('tools-open')); ctx.audio.ui?.('blip'); return true; }
      return false;
    },
  };
}
