// The gamepad HUD's own pieces (Andrew's gamepad layout, docs/refs/andrew-gamepad-hud-layout.json). hud-layout.js places them,
// this makes them work.
//   The name: yours, big, top-left.
//   X and Y: two tool slots (inventory arms 0 and 1), each wearing what is on it. A press uses the tool on it: out of the pocket if it
//   isn't in your hand, then the use itself (the treats: a throw; the rod in your hand: hold to cast). A hold (ASSIGN_SECS, a ring
//   fills) opens the tool picker out of that slot, filled or empty, to choose what goes on it ("None" takes it off); the right
//   stick or the D-pad lights one, letting go of the button puts it on, B cancels. A press on an empty slot opens the picker too
//   (then the same button again puts the lit one on). A is only ever interact (hud3-wheels, Andrew: "E just a button to interact").
//   Start: the "Log off?" card (A log off, B stay, Y Settings). A quest update while the quest log is folded: a small flare.
// The touch and mouse layouts use the same picker out of the radial's slots (hud-tools.js calls picker.open()).
// The picker is a fan like the iPad's wheels (hud3-wheels): big slots with clear space between them, close round the slot it comes
// out of, no dome behind (a soft blur hugs the slots, hud.css), turned as little as it can to stay on the screen.
// update() runs every frame, DOM writes only on change.
import { setIcon } from './fish-art.js';
import { ASSIGN_SECS } from './gamepad.js';
import { WHEEL_LOOK } from './hud-layout.js';

const PAD_TILT = 25; // the pad's picker leans this far right of straight up (then turns to stay on the screen)
const D2R = Math.PI / 180;
// the picker's fan: n slots of sl px, the nearest this far from the parent's rim, neighbours WHEEL_LOOK.gap * sl apart, turned from
// `axis` (degrees, 0 = up, clockwise) as little as keeps every slot on the screen, pushed out a little if nothing fits
export function fitPick(x, y, axis, n, sl, parentR, vw = innerWidth, vh = innerHeight, m = 6) {
  let R = parentR + sl * WHEEL_LOOK.near + sl / 2, best = null;
  const turns = [0]; for (let d = 10; d <= 180; d += 10) turns.push(d, -d);
  const stepAt = r => (n > 1 ? 2 * Math.asin(Math.min(1, sl * (1 + WHEEL_LOOK.gap) / (2 * r))) / D2R : 0);
  for (let grow = 0; grow < 6 && !best; grow++, R *= 1.15) {
    const step = stepAt(R);
    if (step * (n - 1) > 230) continue;
    for (const d of turns) {
      const ax = axis + d;
      let ok = true;
      for (let j = 0; j < n && ok; j++) { const a = (ax + (j - (n - 1) / 2) * step) * D2R, cx = x + R * Math.sin(a), cy = y - R * Math.cos(a); ok = cx - sl / 2 >= m && cx + sl / 2 <= vw - m && cy - sl / 2 >= m && cy + sl / 2 <= vh - m; }
      if (ok) { best = { R, step, axis: ax }; break; }
    }
  }
  return best || { R, step: stepAt(R), axis };
}

export function createPadHud(ctx) {
  const { input, inventory, player, ui } = ctx;
  const hud = document.getElementById('hud');
  const nameEl = document.getElementById('pad-name');
  const slotEls = [document.getElementById('pad-slot-x'), document.getElementById('pad-slot-y')];
  const slotIc = slotEls.map(b => b.querySelector('.ps-icon'));
  const ring = slotEls.map(b => { const r = document.createElement('i'); r.className = 'ps-ring'; r.hidden = true; b.append(r); return r; });
  const flare = document.getElementById('quest-flare');
  const logoff = document.getElementById('logoff');
  const pick = document.getElementById('tool-pick');
  const isPad = () => hud.dataset.hud === 'pad';
  const lay = () => ctx.hudLayout;

  // ---------------------------------------------------------------- the tool picker (a dome of what you own, out of a slot)
  // picker.open(arm, { x, y, angle, parent, sl, from, none }): x, y the middle of the slot it comes out of (screen px), angle the way
  // it fans (degrees, 0 = up, clockwise), parent that slot's width, sl a slot (default: the layout's emote wheel slot); from = 'pad' |
  // 'touch'; none = a "None" slot at the end (take the tool off)
  let pk = null; // { arm, items, i, from, axis, step }
  const word = document.createElement('b'); word.className = 'tp-word';
  function owned() { return Object.values(inventory.ITEMS).filter(it => inventory.has(it.id)); }
  const picker = {
    get isOpen() { return !!pk; },
    get arm() { return pk ? pk.arm : -1; },
    get from() { return pk ? pk.from : ''; },
    get items() { return pk ? pk.items.map(it => it ? it.id : null) : []; },
    get lit() { return pk ? pk.i : -1; },
    open(arm, { x, y, angle = 0, parent = 40, sl = 0, from = 'touch', none = false } = {}) {
      const items = owned();
      if (!items.length) { ui.toast('No tools yet. Kevin at the end of the pier has a rod for you.', 2600); ctx.audio.play?.('fish-blip'); return false; }
      if (none) items.push(null);
      const Z = lay()?.zoom || 1, n = items.length;
      sl = sl || lay()?.geom.emoteWheel?.sl || 44;
      const f = fitPick(x, y, angle, n, sl, parent / 2);
      pk = { arm, items, i: Math.max(0, items.findIndex(it => it && it.id === inventory.arms[arm])), from, axis: f.axis, step: f.step };
      pick.replaceChildren();
      pick.style.left = (x / Z) + 'px'; pick.style.top = (y / Z) + 'px';
      pick.style.setProperty('--pr', (f.R / Z) + 'px'); pick.style.setProperty('--ps', (sl / Z) + 'px'); pick.style.setProperty('--pa', f.axis + 'deg');
      // the blur under the slots: their arc and a little past the end ones
      const padDeg = Math.asin(Math.min(1, (sl / 2 + 8) / f.R)) / D2R, span = (n - 1) * f.step + 2 * padDeg;
      pick.style.setProperty('--b0', (f.axis - span / 2).toFixed(1) + 'deg'); pick.style.setProperty('--bs', Math.min(360, span).toFixed(1) + 'deg'); pick.style.setProperty('--bf', '5deg');
      items.forEach((it, j) => {
        const a = (f.axis + (j - (n - 1) / 2) * f.step) * D2R;
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'tp-slot' + (it ? '' : ' none'); b.setAttribute('role', 'menuitem'); b.setAttribute('aria-label', it ? it.name : 'None'); b.dataset.id = it ? it.id : '';
        b.style.setProperty('--x', Math.sin(a).toFixed(3)); b.style.setProperty('--y', (-Math.cos(a)).toFixed(3)); b.style.animationDelay = (j * 0.03) + 's';
        if (it) setIcon(b, it.id);
        b.onclick = e => { e.stopPropagation(); pk.i = j; picker.choose(); };
        b.onpointerenter = () => { if (pk && pk.from !== 'pad') { pk.i = j; paintPick(); } };
        pick.append(b);
      });
      // the lit tool's name, just past the fan's middle (paintPick keeps it on the screen)
      const wr = f.R + sl / 2 + 18, ax = f.axis * D2R;
      word.style.setProperty('--wx', (wr * Math.sin(ax) / Z).toFixed(1) + 'px'); word.style.setProperty('--wy', (-wr * Math.cos(ax) / Z).toFixed(1) + 'px');
      pick.append(word);
      pick.hidden = false;
      hud.classList.add('picking'); // the chat log steps aside while the dome is up so nothing reads through it (hud.css)
      if (from === 'pad') input.wheelOpen = true;
      paintPick();
      ctx.audio.ui?.('blip');
      return true;
    },
    move(d) { if (!pk) return; pk.i = (pk.i + d + pk.items.length) % pk.items.length; paintPick(); ctx.audio.ui?.('tick'); },
    choose() {
      if (!pk) return;
      const it = pk.items[pk.i], arm = pk.arm, was = inventory.itemForArm(arm);
      picker.close();
      if (it) { inventory.assign(it.id, arm); ui.toast(`${it.name} on the ${slotName(arm)} slot`, 1800); }
      else if (was) { inventory.unassign(arm); ui.toast(`${was.name} taken off the ${slotName(arm)} slot`, 2000); input.rumble(0.3, 0.3, 80); } // ("None")
    },
    close() { if (!pk) return; const was = pk.from; pk = null; pick.hidden = true; pick.replaceChildren(); hud.classList.remove('picking'); if (was === 'pad') input.wheelOpen = !document.getElementById('emote-wheel').hidden && document.getElementById('emote-wheel').dataset.mode === 'pad'; },
    stick(x, y) { // a stick (x right, y down): point at a slot of the dome
      if (!pk || Math.hypot(x, y) < 0.5) return;
      const a = Math.atan2(x, -y) * 180 / Math.PI;
      const ax = pk.axis, n = pk.items.length, step = pk.step || 1;
      let rel = ((a - ax + 540) % 360) - 180;
      const j = Math.max(0, Math.min(n - 1, Math.round(rel / step + (n - 1) / 2)));
      if (j !== pk.i) { pk.i = j; paintPick(); }
    },
  };
  function paintPick() {
    if (!pk) return;
    [...pick.querySelectorAll('.tp-slot')].forEach((b, j) => b.classList.toggle('on', j === pk.i));
    const it = pk.items[pk.i];
    // (on a pad the slot's own button puts it on)
    word.textContent = `${pk.from === 'pad' ? input.pad.btnName(pk.arm ? 'SlotY' : 'SlotX') + '  ' : ''}${it ? it.name : 'None'}`;
    // keep the name on the screen (it sits past the fan, which may have turned toward an edge)
    word.style.marginLeft = '';
    const r = word.getBoundingClientRect(), m = 6;
    if (r.width) { const Z = lay()?.zoom || 1, dx = r.left < m ? m - r.left : r.right > innerWidth - m ? innerWidth - m - r.right : 0; if (dx) word.style.marginLeft = (dx / Z).toFixed(1) + 'px'; }
  }
  const slotName = arm => isPad() ? (arm === 0 ? 'X' : 'Y') : ['Z', 'X', 'C', 'V'][arm];
  // a click anywhere off the picker puts it away (touch and mouse)
  document.addEventListener('pointerdown', e => { if (pk && pk.from !== 'pad' && !pick.contains(e.target)) picker.close(); }, true);

  // ---------------------------------------------------------------- X and Y
  const st = [{ mode: null, t: 0, was: false }, { mode: null, t: 0, was: false }];
  const busy = () => ctx.mode !== 'play' || input.overlayOpen || input.typing || !!inventory.panelOpen || !!inventory.busy?.() || !player.controls;
  function padPivot(arm) { // the picker comes out of the slot's middle (hud-layout.js geom)
    const g = lay()?.geom[arm === 0 ? 'slotx' : 'sloty'];
    return g ? { x: g.l + g.w / 2, y: g.t + g.h / 2, parent: g.w } : { x: 100, y: innerHeight - 100, parent: 60 };
  }
  function padPick(arm) {
    const ok = picker.open(arm, { ...padPivot(arm), angle: PAD_TILT, from: 'pad', none: !!inventory.itemForArm(arm) });
    if (ok) input.rumble(0.15, 0.3, 60);
    return ok;
  }
  // a press is 'press' (a tap uses the tool, a hold opens the picker), 'use' (the rod in your hand: holding casts), 'choose' (the
  // picker is up from this slot: letting go puts the lit one on) or 'dead' (busy, or the other slot while the picker is up)
  function slotDown(arm) {
    const s = st[arm]; s.t = 0;
    if (picker.isOpen) { s.mode = pk.from === 'pad' && pk.arm === arm ? 'choose' : 'dead'; return; }
    const it = inventory.itemForArm(arm), inHand = !!it && inventory.equipped === it.id;
    if (busy() || (player.takeover && !inHand)) { s.mode = 'dead'; return; }
    if (inHand && it.hold) { s.mode = 'use'; input.padKey('ToolUse', true); return; } // the rod: hold to cast
    s.mode = 'press'; s.canHold = !player.takeover;
  }
  function slotHeld(arm, dt) {
    const s = st[arm];
    s.t += dt;
    if (s.mode !== 'press' || !s.canHold) return;
    if (s.t > 0.08) { ring[arm].hidden = false; ring[arm].style.setProperty('--p', Math.min(1, s.t / ASSIGN_SECS).toFixed(3)); }
    if (s.t >= ASSIGN_SECS) { ring[arm].hidden = true; s.mode = padPick(arm) ? 'choose' : 'dead'; }
  }
  function slotUp(arm) {
    const s = st[arm];
    ring[arm].hidden = true;
    if (s.mode === 'press') {
      const it = inventory.itemForArm(arm);
      if (!it) padPick(arm);                                                  // empty: the picker (the same button again picks)
      else if (inventory.equipped !== it.id) inventory.equip(it.id);          // out of the pocket
      else { input.padKey('ToolUse', true); input.padKey('ToolUse', false); } // the use (the treats: a throw)
    } else if (s.mode === 'use') input.padKey('ToolUse', false);
    else if (s.mode === 'choose') picker.choose();
    s.mode = null;
  }

  // ---------------------------------------------------------------- the quest flare (the log is folded away on a pad)
  let flareT = 0;
  ctx.quests?.onBump?.(() => {
    if (!isPad() || !ctx.quests.collapsed || ctx.mode !== 'play') return;
    flare.hidden = false; flareT = 3.5;
    flare.style.animation = 'none'; void flare.offsetWidth; flare.style.animation = '';
  });

  // ---------------------------------------------------------------- the log off card (Start)
  const showLogoff = on => {
    if (on === !logoff.hidden) return;
    logoff.hidden = !on;
    ctx.audio.play?.(on ? 'menu-open' : 'menu-close');
    if (on && input.lastDevice === 'pad') setTimeout(() => logoff.querySelector('.lo-go')?.focus({ preventScroll: true }), 30);
  };
  logoff.querySelector('.lo-stay').onclick = () => showLogoff(false);
  logoff.querySelector('.lo-go').onclick = () => { showLogoff(false); ctx.goHome?.(); };
  logoff.querySelector('.lo-set').onclick = () => { showLogoff(false); ctx.openSettings?.(); };

  // ---------------------------------------------------------------- per frame
  let nameNow = null, slotKey = ['', ''], dpadWas = [false, false, false, false];
  return {
    name: 'pad-hud',
    picker,
    logoff: { show: () => showLogoff(true), hide: () => showLogoff(false), get open() { return !logoff.hidden; } },
    get slotModes() { return st.map(s => s.mode); },
    update(dt) {
      const pad = isPad();
      // the name
      const nm = ctx.profile?.name || '';
      if (nm !== nameNow) { nameNow = nm; nameEl.textContent = nm; }
      // the slots wear their tools
      for (let i = 0; i < 2; i++) {
        const it = inventory.itemForArm(i), key = (it ? it.id : '') + (it && inventory.equipped === it.id ? '+' : '');
        if (key !== slotKey[i]) {
          slotKey[i] = key; slotIc[i].replaceChildren(); if (it) setIcon(slotIc[i], it.id);
          slotEls[i].classList.toggle('empty', !it); slotEls[i].classList.toggle('on', !!it && inventory.equipped === it.id);
          slotEls[i].setAttribute('aria-label', `Tool slot ${i ? 'Y' : 'X'}: ${it ? it.name : 'empty'}`);
        }
      }
      // X and Y (only with the pad layout: a keyboard has Z X C V)
      const ps = input.pad.slots;
      for (let i = 0; i < 2; i++) {
        const d = pad && ps[i];
        if (d && !st[i].was) slotDown(i);
        if (d) slotHeld(i, dt);
        if (!d && st[i].was) slotUp(i);
        st[i].was = d;
        slotEls[i].classList.toggle('hold', !!d && st[i].mode !== 'dead');
      }
      // the picker on a pad: the right stick or the D-pad steer it
      if (picker.isOpen && pk.from === 'pad') {
        const p = input.pad;
        if (Math.hypot(p.sx[1], p.sy[1]) > 0.5) picker.stick(p.sx[1], p.sy[1]);
        else if (Math.hypot(p.sx[0], p.sy[0]) > 0.6) picker.stick(p.sx[0], p.sy[0]);
        const dp = p.dpad;
        if (dp[1] && !dpadWas[1]) picker.move(1);
        if (dp[3] && !dpadWas[3]) picker.move(-1);
        if (dp[0] && !dpadWas[0]) picker.move(1);
        if (dp[2] && !dpadWas[2]) picker.move(-1);
        for (let i = 0; i < 4; i++) dpadWas[i] = dp[i];
        if (!pad || ctx.mode !== 'play' || input.typing) picker.close();
      }
      if (flareT > 0 && ((flareT -= dt) <= 0 || !ctx.quests?.collapsed || !pad)) { flareT = 0; flare.hidden = true; }
      if (!logoff.hidden && ctx.mode !== 'play') logoff.hidden = true;
    },
    onKey(code) {
      if (picker.isOpen) {
        if (code === 'KeyE' && pk.from === 'pad') return true; // (A is only interact: on a pad the slot's own button picks, and A does nothing while you choose)
        if (code === 'KeyE' || code === 'Enter' || code === 'Space') { picker.choose(); return true; }
        if (code === 'Escape') { picker.close(); return true; }
        if (code === 'ArrowLeft' || code === 'ArrowDown') { picker.move(-1); return true; }
        if (code === 'ArrowRight' || code === 'ArrowUp') { picker.move(1); return true; }
        if (/^(Pad|Key[ZXCV]$)/.test(code)) return true;
      }
      if (code === 'PadStart') { if (ctx.mode === 'play' && !input.typing) showLogoff(logoff.hidden); return true; }
      return false;
    },
  };
}
