// Moving HUD pieces right in the game (owner-tiles, Andrew 2026-11-06: "if you hold CTRL and click and hold an element you can drag
// it around. This should save the layout to all players. If playing as me on phone, touching and holding for 3 seconds lets you
// move the element."). Only for the owner: the server says who that is (accounts.owner, from the login or resume answer), and
// the save is refused server-side for anyone else (server.js editRefusal), so nothing here is a secret.
//   PC: hold Ctrl and press on a piece for HOLD_PC: it lifts (the HUD Editor's dashed box round it) and follows the mouse.
//   Touch: hold a piece still for HOLD_TOUCH (a ring fills round the finger; moving the finger first cancels, and the touch works
//   as it always did), then drag it.
// Any piece the HUD Editor can move (hud-items.js) in the layout this device shows now, snapping to the screen's and the other
// pieces' edges like the editor, kept on the screen and out of the notch. Let go: the new spot is saved to /api/hud-layouts for
// that layout, laid over what is saved exactly as the editor's Save does (every other piece and the wheel numbers kept), and
// the server pushes it to everyone in the game ('hud-layouts', below). A toast says so, with an Undo for a few seconds.
// A hold a piece already uses wins: the mic while it is hold-to-talk, the E while there is something to use (a hold winds a
// throw), the tool radial's slots (a hold there picks or takes off a tool) and the pad's picker never lift.
import { specFor, mergeSaved } from './hud-layout.js';
import { LAYOUTS } from './hud-layouts.js';
import { HUD_ITEMS, ITEM_DEFAULTS } from './hud-items.js';
import { loadCss } from './util.js';

export const HOLD_PC = 300, HOLD_TOUCH = 3000;   // ms
const STILL_PC = 6, STILL_TOUCH = 10;             // px a pointer may wander before the hold is off
const RING_AFTER = 300;                           // ms before the ring shows (a tap never flashes it)
const SNAP = 6;                                   // frame px, as the HUD Editor
const UNDO_MS = 6000;
const NOT_PIECES = new Set(['typing', 'slot', 'gone']);   // (no element of their own to grab)
const RIDERS = { map: ['time', 'weather', 'online', 'place'], interact: ['words'], breath: ['distance'] }; // (they come along: no snapping to them)
const copy = o => JSON.parse(JSON.stringify(o));

export function createHudLiveEdit(ctx) {
  const qp = new URLSearchParams(location.search);
  const hl = ctx.hudLayout, hud = document.getElementById('hud');
  if (!hl || !hud || qp.has('hud-edit') || qp.has('hud-preview')) return { name: 'hud-live-edit' };
  loadCss('/css/hud-live-edit.css');

  // ---- everyone: a save anywhere (this, or the HUD Editor) reaches every player in the game at once
  let pushes = 0;
  ctx.net?.on?.('hud-layouts', m => {
    if (!m || typeof m.set !== 'object' || !m.set) return;
    pushes++;
    mergeSaved(m.set);
    if (!lift) hl.relayout();
  });

  const owner = () => !!ctx.accounts?.owner;
  const can = () => owner() && ctx.mode === 'play' && !ctx.input?.typing && !ctx.input?.overlayOpen;
  const $ = s => hud.querySelector(s);

  // which piece a press is on: the deepest of the layout's pieces round the target (the action words inside the E, say)
  function pieceAt(target) {
    const els = hl.els(), spec = specFor(hl.layoutId);
    let id = null, node = null;
    for (const [k, sp] of Object.entries(spec)) {
      if (!els[k] || !sp.sel || NOT_PIECES.has(sp.kind) || (sp.kind === 'wheel' && hl.fan)) continue; // (a fan's place is the smiley's)
      const n = $(sp.sel);
      if (!n || !n.contains(target) || n.closest('.hud-off') || !n.getClientRects().length) continue;
      if (!node || node.contains(n)) { id = k; node = n; }
    }
    return id ? { id, node } : null;
  }
  // a hold the piece already uses, started (or about to start) by this press: then no lift (owner-tiles brief)
  function holdTaken(id, target) {
    if (hud.classList.contains('picking')) return true;                               // the pad's tool picker is up
    if (id === 'mic' && $('#mic-toggle')?.classList.contains('ptt')) return true;     // hold to talk
    if ((id === 'interact' || id === 'words') && (ctx.ui?.actWords || ctx.ui?.promptOpen)) return true; // the E's hold winds a throw
    if (id === 'toolradial' && target.closest?.('.cp-arm')) return true;               // a slot's hold picks / takes off
    if (id === 'chat' && document.getElementById('chat')?.classList.contains('open')) return true; // typing
    return false;
  }

  // ---- the hold
  let press = null;   // { id, node, pid, x, y, touch, timer, ring, input }
  let lift = null;    // { id, layoutId, node, pid, x, y, el0, b0, r0, el }
  let swallowClick = 0;
  const ring = document.createElement('div');
  ring.className = 'hle-ring'; ring.hidden = true;
  ring.innerHTML = '<svg viewBox="0 0 72 72" aria-hidden="true"><circle class="hle-ring-bg" cx="36" cy="36" r="30"/><circle class="hle-ring-fill" cx="36" cy="36" r="30" pathLength="100"/></svg>'; // (fixed markup)
  const box = document.createElement('div');
  box.className = 'hle-box'; box.hidden = true;
  const tag = document.createElement('span');
  tag.className = 'hle-tag'; box.append(tag);
  document.body.append(ring, box);

  function cancelPress() {
    if (!press) return;
    clearTimeout(press.timer); clearTimeout(press.ringT);
    ring.hidden = true; ring.classList.remove('go');
    press = null;
  }
  addEventListener('pointerdown', e => {
    if (lift || press || !e.isPrimary) return;
    const touch = e.pointerType !== 'mouse';
    if (!touch && (e.button !== 0 || !(e.ctrlKey || e.metaKey))) return;
    if (!hud.contains(e.target) || !can()) return;
    const p = pieceAt(e.target);
    if (!p || holdTaken(p.id, e.target)) return;
    const isInput = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
    press = { ...p, pid: e.pointerId, x: e.clientX, y: e.clientY, touch, input: isInput ? e.target : null };
    press.timer = setTimeout(() => startLift(), touch ? HOLD_TOUCH : HOLD_PC);
    if (touch) press.ringT = setTimeout(() => { if (!press) return; place(ring, press.x, press.y); ring.hidden = false; ring.style.setProperty('--hle-t', (HOLD_TOUCH - RING_AFTER) + 'ms'); void ring.offsetWidth; ring.classList.add('go'); }, RING_AFTER);
  }, true);
  // (Ctrl on the chat bar: no focus on the press, so a hold can lift it; a plain Ctrl-click still focuses it, below)
  addEventListener('mousedown', e => { if (press?.input && !press.touch) e.preventDefault(); }, true);
  addEventListener('pointermove', e => {
    if (lift && e.pointerId === lift.pid) { e.stopImmediatePropagation(); e.preventDefault(); drag(e.clientX, e.clientY); return; }
    if (press && e.pointerId === press.pid && Math.hypot(e.clientX - press.x, e.clientY - press.y) > (press.touch ? STILL_TOUCH : STILL_PC)) cancelPress();
  }, true);
  const up = e => {
    if (lift && e.pointerId === lift.pid) { drop(e.type === 'pointercancel'); return; }
    if (press && e.pointerId === press.pid) { const inp = press.input; cancelPress(); if (inp && e.type === 'pointerup') inp.focus(); } // (a short Ctrl-click: as before)
  };
  addEventListener('pointerup', up, true);
  addEventListener('pointercancel', up, true);
  addEventListener('click', e => { if (swallowClick && performance.now() < swallowClick) { swallowClick = 0; e.stopImmediatePropagation(); e.preventDefault(); } }, true); // (the click a lift ends with)
  addEventListener('contextmenu', e => { if (press?.touch || lift) e.preventDefault(); }, true); // (a long press on a phone)
  addEventListener('keyup', e => { if (press && !press.touch && (e.key === 'Control' || e.key === 'Meta')) cancelPress(); }, true);
  addEventListener('blur', () => { cancelPress(); if (lift) drop(true); });

  function place(n, x, y) { n.style.left = x + 'px'; n.style.top = y + 'px'; }
  function startLift() {
    const p = press; cancelPress();
    if (!p || !can() || !p.node.isConnected) return;
    const id = p.id, layoutId = hl.layoutId, el0 = hl.els()[id];
    const b0 = hl.boxOf(id); if (!el0 || !b0) return;
    const r = p.node.getBoundingClientRect();
    lift = { id, layoutId, node: p.node, pid: p.pid, x: p.x, y: p.y, el0: copy(el0), b0, r0: { l: r.left, t: r.top, w: r.width, h: r.height }, el: copy(el0), others: edges(id), moved: false };
    tag.textContent = 'Moving: ' + (HUD_ITEMS[id]?.name || id);
    hud.classList.add('hle-lifting');
    showBox();
    ctx.input?.rumble?.(0.2, 0.2, 40);
    ctx.audio?.ui?.('pop');
  }
  // the screen's edges (in the notch's) and the other pieces' edges, screen px, to snap to
  function edges(id) {
    const s = safe(), xs = [s.l, innerWidth - s.r], ys = [s.t, innerHeight - s.b];
    const els = hl.els(), spec = specFor(hl.layoutId);
    for (const [k, sp] of Object.entries(spec)) {
      if (k === id || !els[k] || !sp.sel || HUD_ITEMS[k]?.pop || RIDERS[id]?.includes(k)) continue;
      const n = $(sp.sel); if (!n || n.closest('.hud-off')) continue;
      const r = n.getBoundingClientRect(); if (!r.width || !r.height) continue;
      xs.push(r.left, r.right); ys.push(r.top, r.bottom);
    }
    return { xs, ys };
  }
  function safe() {
    const c = getComputedStyle($('.hud-safe-probe') || hud), f = v => parseFloat(v) || 0;
    return { t: f(c.paddingTop), r: f(c.paddingRight), b: f(c.paddingBottom), l: f(c.paddingLeft) };
  }
  const snapTo = (v, list, d) => { let best = null, bd = d; for (const c of list) { const q = Math.abs(c - v); if (q < bd) { bd = q; best = c; } } return best; };

  // the piece under the pointer: the move in screen px (snapped, kept on the screen) -> frame px over where it was
  let due = 0, want = null;
  function drag(x, y) {
    want = { x, y };
    if (!due) due = requestAnimationFrame(() => { due = 0; if (lift && want) follow(want.x, want.y); });
  }
  function follow(x, y) {
    const L = lift, k = hl.k || 1, r = L.r0, s = safe();
    let dx = x - L.x, dy = y - L.y;
    if (!L.moved && Math.hypot(dx, dy) < 2) return;
    L.moved = true;
    const d = SNAP * k, { xs, ys } = L.others;
    const sl = snapTo(r.l + dx, xs, d), sr = snapTo(r.l + r.w + dx, xs, d), st = snapTo(r.t + dy, ys, d), sb = snapTo(r.t + r.h + dy, ys, d);
    if (sl !== null) dx = sl - r.l; else if (sr !== null) dx = sr - r.l - r.w;
    if (st !== null) dy = st - r.t; else if (sb !== null) dy = sb - r.t - r.h;
    // on the screen and out of the notch (a piece bigger than the room keeps its top-left corner in)
    dx = Math.max(s.l - r.l, Math.min(innerWidth - s.r - r.l - r.w, dx)); if (r.l + dx < s.l) dx = s.l - r.l;
    dy = Math.max(s.t - r.t, Math.min(innerHeight - s.b - r.t - r.h, dy)); if (r.t + dy < s.t) dy = s.t - r.t;
    // frame px: every anchor moves k px a frame px; a piece whose middle crosses into another anchor's third jumps, so it is set
    // again from where it really landed (twice at most)
    const tx = L.b0.l + dx, ty = L.b0.t + dy;
    let el = { ...L.el0, x: Math.round(L.el0.x + dx / k), y: Math.round(L.el0.y + dy / k) };
    for (let i = 0; i < 3; i++) {
      show(L, el);
      const b = hl.boxOf(L.id); if (!b) break;
      const ex = (tx - b.l) / k, ey = (ty - b.t) / k;
      if (Math.abs(ex) < 0.75 && Math.abs(ey) < 0.75) break;
      el = { ...el, x: Math.round(el.x + ex), y: Math.round(el.y + ey) };
    }
    L.el = el;
    showBox();
  }
  const show = (L, el) => hl.edit.override(L.layoutId, { els: { [L.id]: el }, wheel: null, toolwheel: null });
  function showBox() {
    if (!lift) { box.hidden = true; return; }
    const r = lift.node.getBoundingClientRect();
    box.style.left = (r.left - 4) + 'px'; box.style.top = (r.top - 4) + 'px'; box.style.width = (r.width + 8) + 'px'; box.style.height = (r.height + 8) + 'px';
    box.classList.toggle('low', r.top < 30);
    box.hidden = false;
  }

  // ---- let go: save it for everyone
  async function drop(cancelled) {
    const L = lift;
    if (due) { cancelAnimationFrame(due); due = 0; }
    if (L && want && !cancelled) follow(want.x, want.y); // (the last move, not drawn yet)
    want = null; lift = null;
    box.hidden = true; hud.classList.remove('hle-lifting');
    swallowClick = performance.now() + 600;
    if (!L) return;
    const same = L.el.x === L.el0.x && L.el.y === L.el0.y;
    if (cancelled || same) { hl.edit.override(L.layoutId, null); return; }
    await saveMove(L.layoutId, L.id, L.el, L.el0);
  }
  // the HUD Editor's Save, for one piece: the server's layout as it is now (the built-in, the saved pieces over it, the saved wheel
  // numbers), this piece's new spot over that
  const builtEls = id => ({ ...copy(ITEM_DEFAULTS[id] || {}), ...copy(LAYOUTS[id].els) });
  const savedEls = s => { const e = copy(s?.els || {}); if (!e.weather) delete e.time; return e; }; // (as the editor's: a layout from before the pills)
  const headers = () => ({ 'content-type': 'application/json', ...(ctx.accounts?.headers?.() || {}) });
  async function post(body) {
    const r = await fetch('/api/hud-layouts', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
    return j;
  }
  let lastSave = null;
  async function saveMove(layoutId, id, el, el0) {
    try {
      const file = await fetch('/api/hud-layouts', { cache: 'no-store' }).then(r => r.json());
      const before = file && file[layoutId] ? copy(file[layoutId]) : null;
      const cur = { els: { ...builtEls(layoutId), ...savedEls(before) }, wheel: before?.wheel ? copy(before.wheel) : null, toolwheel: before?.toolwheel ? copy(before.toolwheel) : null };
      cur.els[id] = { ...cur.els[id], x: el.x, y: el.y, ...(el.s !== undefined ? { s: el.s } : {}), ...(el.a !== undefined ? { a: el.a } : {}) };
      const j = await post({ [layoutId]: cur });
      mergeSaved({ [layoutId]: j[layoutId] || null });
      hl.edit.override(layoutId, null);
      if (before) delete before.savedAt;
      lastSave = { layoutId, id, before, at: performance.now() };
      toast('Saved for everyone', true);
    } catch (err) {
      hl.edit.override(layoutId, null);
      toast('Not saved: ' + (err.message || 'offline'), false);
    }
  }
  async function undo() {
    const s = lastSave; lastSave = null; hideToast();
    if (!s) return;
    try {
      const j = await post({ [s.layoutId]: s.before });   // (null: the layout was never saved, back to the built-in)
      mergeSaved({ [s.layoutId]: j[s.layoutId] || null });
      hl.relayout();
      toast('Put back for everyone', false);
    } catch (err) { toast('Not put back: ' + (err.message || 'offline'), false); }
  }

  // ---- the toast (its own: it has a button)
  const tst = document.createElement('div');
  tst.className = 'hle-toast'; tst.hidden = true; tst.setAttribute('role', 'status');
  const tstT = document.createElement('span');
  const tstU = document.createElement('button');
  tstU.type = 'button'; tstU.className = 'hle-undo'; tstU.textContent = 'Undo';
  tstU.addEventListener('click', e => { e.stopPropagation(); undo(); });
  tst.append(tstT, tstU);
  document.body.append(tst);
  let tstTimer = 0;
  function toast(text, withUndo) {
    tstT.textContent = text; tstU.hidden = !withUndo; tst.classList.toggle('plain', !withUndo); tst.hidden = false;
    tst.classList.remove('in'); void tst.offsetWidth; tst.classList.add('in');
    clearTimeout(tstTimer); tstTimer = setTimeout(hideToast, withUndo ? UNDO_MS : 2500);
  }
  function hideToast() { clearTimeout(tstTimer); tst.hidden = true; if (lastSave && performance.now() - lastSave.at >= UNDO_MS - 50) lastSave = null; }

  return {
    name: 'hud-live-edit',
    get pushes() { return pushes; },            // (tests: saves pushed to this client)
    get lifted() { return lift ? lift.id : null; },
    get pressing() { return press ? press.id : null; },
    undo,
    update() { if (lift) showBox(); },
  };
}
