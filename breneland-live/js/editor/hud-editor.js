// The HUD Editor (public/editor/hud.html). The game runs in a frame (/?preview&hud-edit, hud-edit.js) at the layout's size,
// scaled to fit, and this page draws each HUD piece's box over it to drag and size. Changes go to the frame by postMessage
// and the boxes come back from the real DOM, so what you move is what you get.
// Save posts to /api/hud-layouts. Try it opens the game with the unsaved layouts (?hud-preview=1). Download writes the
// docs/refs format that tools/hud-part0-gen.mjs reads.
import { LAYOUTS } from '../hud-layouts.js';
import { HUD_ITEMS, ITEM_DEFAULTS, ITEM_MODES } from '../hud-items.js';

const $ = s => document.querySelector(s);
const status = (t, kind = '') => { const s = $('#status'); s.textContent = t; s.className = kind; };
// every item's name and note come from the HUD's item list (public/js/hud-items.js: what a feature adds there shows up here too)
const NAMES = new Proxy({}, { get: (_, id) => HUD_ITEMS[id]?.name });
const POP_NAMES = { emote: 'Emote wheel', dance: 'Dance wheel', toolradial: 'Tool radial', questopen: 'Quest list', bigmap: 'Big map', typing: 'Chat open', logoff: 'Log off card', questflare: 'Quest flare',
  ...Object.fromEntries(Object.entries(ITEM_MODES).map(([m, M]) => [m, M.chip])) }; // (and the modes: their own pieces show behind their chip, hud-loose)
const NOTES = new Proxy({}, { get: (_, id) => HUD_ITEMS[id]?.note });
// the frame each layout is shown at: the phones at their JSON frame (1 px = 1 frame px), the rest at a typical screen
const SIZES = { 'phone-portrait': [340, 736], 'phone-landscape': [736, 340], 'tablet-ipad': [1024, 768], 'tablet-surface': [1368, 912], 'pc-16x10': [1440, 900], 'pc-16x9': [1920, 1080], pad: [1920, 1080] };
// the guides, in frame px: the safe area's insets [top, right, bottom, left] and how tall the keyboard is
const GUIDES = { 'phone-portrait': { safe: [30, 10, 22, 10], kb: 290 }, 'phone-landscape': { safe: [8, 30, 12, 30], kb: 170 }, 'tablet-ipad': { safe: [20, 16, 20, 16], kb: 224 }, 'tablet-surface': { safe: [20, 16, 20, 16], kb: 199 }, 'pc-16x10': { safe: null, kb: 0 }, 'pc-16x9': { safe: null, kb: 0 }, pad: { safe: [16, 24, 16, 24], kb: 0 } };
const SNAP = 6; // frame px
const copy = o => JSON.parse(JSON.stringify(o));
const fmt = v => (Math.round(v * 100) / 100).toString();

// ---- the state: a working copy per layout (the built-in with the server's saved pieces over it), the server's file, undo
const state = {}, resetPending = {}, dirty = {};
let saved = {};
let cur = (location.hash || '').slice(1);
if (!LAYOUTS[cur]) cur = 'phone-portrait';
// the built-in: the generated layout with any run-time item's default spot under it
const builtEls = id => ({ ...copy(ITEM_DEFAULTS[id] || {}), ...copy(LAYOUTS[id].els) });
// (a layout saved before the clock and the weather were pills has no weather: its time was the strip along the map's top, so the clock
// starts from the built-in pill over the map, as in the game: hud-layout.js cleanSaved)
const savedEls = s => { const e = copy(s?.els || {}); if (!e.weather) delete e.time; return e; };
function fresh(id) { const s = saved[id]; return { els: { ...builtEls(id), ...savedEls(s) }, wheel: s?.wheel ? copy(s.wheel) : null, toolwheel: s?.toolwheel ? copy(s.toolwheel) : null }; }
const undoStack = [], redoStack = [];
function snap() { undoStack.push({ id: cur, s: JSON.stringify(state[cur]) }); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; buttons(); }
function undo() { const u = undoStack.pop(); if (!u) return; redoStack.push({ id: u.id, s: JSON.stringify(state[u.id]) }); state[u.id] = JSON.parse(u.s); dirty[u.id] = true; if (u.id !== cur) switchTo(u.id); send(); inspect(); buttons(); status('Undone.'); }
function redo() { const r = redoStack.pop(); if (!r) return; undoStack.push({ id: r.id, s: JSON.stringify(state[r.id]) }); state[r.id] = JSON.parse(r.s); dirty[r.id] = true; if (r.id !== cur) switchTo(r.id); send(); inspect(); buttons(); status('Redone.'); }
function buttons() { $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length; }

// ---- the frame: the game at the layout's size, scaled to fit the stage
const frame = $('#frame'), game = $('#game'), overlay = $('#overlay'), guideLayer = $('#guide-layer');
let sc = 1, W = 0, H = 0, ready = false;
let G = null; // the last geometry the game sent: { layoutId, k, u, vw, vh, frame, boxes, pops, numbers, els, pivot }
function fit() {
  [W, H] = SIZES[cur];
  const st = $('#stage').getBoundingClientRect();
  const room = { w: Math.max(100, st.width - 20), h: Math.max(100, st.height - 20 - ($('#show').offsetHeight || 0) - 6) };
  sc = Math.min(1, room.w / W, room.h / H);
  frame.style.width = Math.round(W * sc) + 'px'; frame.style.height = Math.round(H * sc) + 'px';
  game.style.width = W + 'px'; game.style.height = H + 'px'; game.style.transform = `scale(${sc})`;
  drawGuides(); draw();
}
addEventListener('resize', fit);
if (typeof ResizeObserver === 'function') new ResizeObserver(() => fit()).observe($('#stage')); // (the inspector sheet growing on a phone)
const post = m => { try { game.contentWindow?.postMessage(m, location.origin); } catch { /* not up yet */ } };
let sendDue = 0;
function send() { if (sendDue) return; sendDue = requestAnimationFrame(() => { sendDue = 0; const s = state[cur]; post({ type: 'hud-edit-set', layoutId: cur, els: s.els, wheel: s.wheel, toolwheel: s.toolwheel }); }); }
addEventListener('message', e => {
  if (e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
  const m = e.data;
  if (m.type === 'hud-edit-ready') { ready = true; frame.classList.remove('loading'); send(); status(dirty[cur] ? 'Unsaved changes.' : saved[cur] ? 'Showing the layout saved to the game.' : 'Showing the built-in layout.'); api.ready = true; }
  else if (m.type === 'hud-edit-geom') { if (m.layoutId !== cur) return; G = m; draw(); chips(); if (sel && !G.boxes[sel]) { /* a popout folded: keep it selected, its box comes back when shown */ } inspectNumbers(); }
});
game.src = '/?preview&hud-edit=1&fast&hour=14&t=' + Date.now();
frame.classList.add('loading');

// ---- the frame's units: a piece's screen box -> frame px (k = the frame's scale on that screen)
const toFrame = b => ({ x: b.l / G.k, y: b.t / G.k, w: b.w / G.k, h: b.h / G.k });
const FW = () => (G ? G.frame[0] : LAYOUTS[cur].frame[0]), FH = () => (G ? G.frame[1] : LAYOUTS[cur].frame[1]);

// ---- the boxes on the overlay
let sel = null;
const boxes = new Map(); // id -> element
function draw() {
  if (!G) return;
  const seen = new Set();
  for (const [id, b] of Object.entries(G.boxes)) {
    seen.add(id);
    let el = boxes.get(id);
    if (!el) {
      el = document.createElement('div'); el.className = 'he-box'; el.dataset.id = id; el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-label', NAMES[id] || id);
      const tag = document.createElement('span'); tag.className = 'he-tag'; tag.textContent = NAMES[id] || id; el.append(tag);
      el.addEventListener('pointerdown', onDown); el.addEventListener('focus', () => { if (sel !== id) select(id); });
      overlay.append(el); boxes.set(id, el);
    }
    el.style.left = (b.l * sc) + 'px'; el.style.top = (b.t * sc) + 'px'; el.style.width = (b.w * sc) + 'px'; el.style.height = (b.h * sc) + 'px';
    el.classList.toggle('pop', (G.popouts || []).includes(id));
    const feat = (['slot', 'anchor'].includes(HUD_ITEMS[id]?.kind) && !HUD_ITEMS[id]?.mode) || id === 'view'; // (a feature's place: drawn under the pieces so they stay easy to grab)
    el.classList.toggle('feat', feat); el.style.zIndex = feat ? '0' : '1';
    el.classList.toggle('low', b.t * sc < 18);
    el.classList.toggle('sel', id === sel);
  }
  for (const [id, el] of boxes) if (!seen.has(id)) { el.remove(); boxes.delete(id); }
  handles();
}
let handleEls = [], dialEls = null;
function handles() {
  if (size) return; // (mid-drag on the corner: the handle stays on its box, which draw() keeps)
  const el = sel && boxes.get(sel), e = el && G && state[cur].els[sel];
  if (dial && dialEls && e && G.pivot) { placeDial(e); return; } // (mid-drag on the dial: move it, never remake it under the pointer)
  for (const h of handleEls) h.remove(); handleEls = []; dialEls = null;
  if (!e) return;
  if (sel !== 'emote' || G.numbers?.wheel?.kind === 'ring') { // (a hinged fan has no box of its own to size: its slot size is in the inspector)
    const h = document.createElement('div'); h.className = 'he-handle size'; h.title = 'Drag to size'; h.addEventListener('pointerdown', onSizeDown); el.append(h); handleEls.push(h);
    // (a piece against the frame's right or bottom edge: the handle on its inside corner, or the frame would cut it off)
    const b = G.boxes[sel], ow = overlay.clientWidth, oh = overlay.clientHeight;
    if (b) { h.classList.toggle('in-x', (b.l + b.w) * sc > ow - 16); h.classList.toggle('in-y', (b.t + b.h) * sc > oh - 16); }
  }
  if (sel === 'toolradial' && G.pivot) { // the dial: out of the pivot along the tilt
    const line = document.createElement('div'); line.className = 'he-dial-line';
    const piv = document.createElement('div'); piv.className = 'he-pivot';
    const d = document.createElement('div'); d.className = 'he-dial'; d.title = 'Drag round to tilt';
    d.addEventListener('pointerdown', onDialDown);
    overlay.append(line, piv, d); handleEls.push(line, piv, d); dialEls = { line, piv, d };
    placeDial(e);
  }
}
function placeDial(e) {
  const { line, piv, d } = dialEls, px = G.pivot.x * sc, py = G.pivot.y * sc, a = (e.a || 0) * Math.PI / 180, r = Math.max(70, (G.boxes.toolradial?.w || 80) * sc * 0.9);
  line.style.left = px + 'px'; line.style.top = py + 'px'; line.style.width = r + 'px'; line.style.transform = `rotate(${180 + (e.a || 0)}deg)`;
  piv.style.left = px + 'px'; piv.style.top = py + 'px';
  d.style.left = (px - r * Math.cos(a)) + 'px'; d.style.top = (py - r * Math.sin(a)) + 'px';
}
function select(id) { sel = id && state[cur].els[id] ? id : null; for (const [k, el] of boxes) el.classList.toggle('sel', k === sel); handles(); inspect(); }
overlay.addEventListener('pointerdown', e => { if (e.target === overlay) select(null); });

// ---- dragging a piece (frame px; snap to the frame's edges and the others' edges)
let drag = null;
function onDown(e) {
  if (e.button !== undefined && e.button !== 0) return;
  const id = e.currentTarget.dataset.id;
  select(id);
  if (!G || !G.boxes[id]) return;
  e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
  const el = state[cur].els[id];
  drag = { id, x0: el.x, y0: el.y, sx: e.clientX, sy: e.clientY, box: toFrame(G.boxes[id]), moved: false, snapped: false };
}
function edgesBut(id) { // the other pieces' edges and the frame's, in frame px
  const xs = [0, FW()], ys = [0, FH()];
  for (const [k, b] of Object.entries(G.boxes)) { if (k === id) continue; const f = toFrame(b); xs.push(f.x, f.x + f.w); ys.push(f.y, f.y + f.h); }
  return { xs, ys };
}
function snapTo(v, list) { let best = null, bd = SNAP; for (const c of list) { const d = Math.abs(c - v); if (d < bd) { bd = d; best = c; } } return best; }
overlay.addEventListener('pointermove', e => {
  if (!drag || !G) return;
  let dx = (e.clientX - drag.sx) / sc / G.k, dy = (e.clientY - drag.sy) / sc / G.k;
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) { if (!drag.moved) { drag.moved = true; snap(); } }
  if ($('#snap').classList.contains('on')) {
    const { xs, ys } = edgesBut(drag.id), b = drag.box;
    const sl = snapTo(b.x + dx, xs), sr = snapTo(b.x + b.w + dx, xs), st = snapTo(b.y + dy, ys), sb = snapTo(b.y + b.h + dy, ys);
    if (sl !== null) dx = sl - b.x; else if (sr !== null) dx = sr - b.x - b.w;
    if (st !== null) dy = st - b.y; else if (sb !== null) dy = sb - b.y - b.h;
  }
  setEl(drag.id, { x: Math.round(drag.x0 + dx), y: Math.round(drag.y0 + dy) });
});
const endDrag = () => { const was = (drag?.moved || size?.moved || dial?.moved); drag = null; size = null; dial = null; if (was) inspect(); }; // (rebuilt: its Reset this item shows once it has moved)
overlay.addEventListener('pointerup', endDrag); overlay.addEventListener('pointercancel', endDrag);
// sizing by the corner: the box grows with the pointer, s follows
let size = null;
function onSizeDown(e) {
  if (!G || !sel) return;
  e.stopPropagation(); e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
  size = { id: sel, s0: state[cur].els[sel].s, x0: state[cur].els[sel].x, sx: e.clientX, w0: G.boxes[sel].w / G.k, moved: false, flip: e.currentTarget.classList.contains('in-x') ? -1 : 1 };
  e.currentTarget.addEventListener('pointermove', onSizeMove); e.currentTarget.addEventListener('pointerup', endDrag, { once: true });
}
function onSizeMove(e) {
  if (!size) return;
  const dw = size.flip * (e.clientX - size.sx) / sc / G.k; // (the inside-corner handle grows the piece as it moves left)
  if (!size.moved && Math.abs(dw) > 0.5) { size.moved = true; snap(); }
  const s = Math.max(0.3, Math.min(3, size.s0 * (size.w0 + dw) / Math.max(8, size.w0)));
  const sr = Math.round(s * 100) / 100;
  // (the inside-corner handle keeps the piece's right edge where it is, as a corner handle should: it grows to the left)
  setEl(size.id, size.flip < 0 ? { s: sr, x: Math.round((size.x0 + size.w0 * (1 - sr / size.s0)) * 10) / 10 } : { s: sr });
}
// the dial: the tool radial's tilt, degrees clockwise, 0 = its slots straight left of the tools button
let dial = null;
function onDialDown(e) {
  if (!G?.pivot) return;
  e.stopPropagation(); e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
  dial = { moved: false };
  e.currentTarget.addEventListener('pointermove', onDialMove); e.currentTarget.addEventListener('pointerup', endDrag, { once: true });
}
function onDialMove(e) {
  if (!dial || !G?.pivot) return;
  const r = overlay.getBoundingClientRect(), px = r.left + G.pivot.x * sc, py = r.top + G.pivot.y * sc;
  if (!dial.moved) { dial.moved = true; snap(); }
  let a = Math.atan2(py - e.clientY, px - e.clientX) * 180 / Math.PI; // (the open side faces left; + = clockwise)
  a = Math.max(-90, Math.min(180, Math.round(a)));
  setEl('toolradial', { a });
}
function setEl(id, patch) {
  const s = state[cur], el = s.els[id]; if (!el) return;
  Object.assign(el, patch);
  dirty[cur] = true; send(); inspect(false);
}
function setWheel(kind, field, v) { // kind: 'wheel' | 'toolwheel'; the numbers start from what is in force (the frame reports them)
  const s = state[cur];
  if (!s[kind]) { const n = G?.numbers?.[kind]; s[kind] = {}; for (const f of ['R', 'sl', 'hub', 'a0', 'a1', 'ro', 'ri']) if (n && n[f] != null) s[kind][f] = n[f]; }
  s[kind][field] = v; dirty[cur] = true; send();
}

// ---- the keyboard: arrows nudge the selected piece, Ctrl+Z / Ctrl+Y, Esc
addEventListener('keydown', e => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (e.key === 'Escape') { select(null); return; }
  if (!sel) return;
  const d = e.shiftKey ? 10 : 1, el = state[cur].els[sel];
  const m = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
  if (!m) return;
  e.preventDefault(); snap(); setEl(sel, { x: el.x + m[0], y: el.y + m[1] });
});

// ---- the inspector
const insp = $('#insp-body');
function inspect(rebuild = true) {
  if (!sel || !state[cur].els[sel]) { if (rebuild) insp.innerHTML = '<p class="muted">Tap a piece to move it. Drag its corner to size it. Arrow keys nudge 1 px.</p>'; return; }
  const e = state[cur].els[sel];
  if (!rebuild) { // the numbers follow a drag without rebuilding the fields under the pointer
    for (const [f, v] of [['x', e.x], ['y', e.y], ['s', Math.round(e.s * 100)], ['a', e.a]]) { const i = insp.querySelector(`[data-f="${f}"]`); if (i && v !== undefined && document.activeElement !== i) i.value = v; const o = insp.querySelector(`[data-v="${f}"]`); if (o && v !== undefined) o.textContent = f === 's' ? v + '%' : f === 'a' ? v + ' deg' : v; }
    return;
  }
  const rows = [];
  const row = (lab, inner, val) => rows.push(`<div class="row"><label>${lab}</label>${inner}${val !== undefined ? `<span class="val">${val}</span>` : ''}</div>`);
  const num = (f, v, step = 1) => `<input type="number" data-f="${f}" value="${v}" step="${step}">`;
  rows.push(`<div class="pair">${['x', 'y'].map(f => `<div class="row"><label>${f}</label>${num(f, e[f])}</div>`).join('')}</div>`);
  row('size', `<input type="range" data-f="s" min="30" max="300" step="1" value="${Math.round(e.s * 100)}">`, `<b data-v="s">${Math.round(e.s * 100)}%</b>`);
  if (sel === 'toolradial') row('tilt', `<input type="range" data-f="a" min="-90" max="180" step="1" value="${e.a || 0}">`, `<b data-v="a">${e.a || 0} deg</b>`);
  const md = ITEM_MODES[HUD_ITEMS[sel]?.mode];
  if (md) rows.push(`<p class="mode">${md.says}${HUD_ITEMS[sel].touch ? ', on a touch screen' : ''}.</p>`);
  if (NOTES[sel]) rows.push(`<p class="muted">${NOTES[sel]}</p>`);
  const builtIn = builtEls(cur)[sel];
  const moved = builtIn && (builtIn.x !== e.x || builtIn.y !== e.y || builtIn.s !== e.s || (builtIn.a || 0) !== (e.a || 0));
  rows.push(`<div class="btns">${moved ? '<button class="btn small" type="button" data-act="put-back" title="Back to the built-in place and size">Reset this item</button>' : ''}<button class="btn small" type="button" data-act="close">Close</button></div>`);
  insp.innerHTML = `<h2>${NAMES[sel] || sel}</h2>${rows.join('')}<div id="wheel-rows"></div>`;
  for (const i of insp.querySelectorAll('[data-f]')) {
    let before = null;
    i.addEventListener('pointerdown', () => { before = JSON.stringify(state[cur]); }, { once: false });
    i.addEventListener('focus', () => { before = JSON.stringify(state[cur]); });
    i.addEventListener('input', () => { const f = i.dataset.f, v = parseFloat(i.value); if (!Number.isFinite(v)) return; if (before !== null) { undoStack.push({ id: cur, s: before }); redoStack.length = 0; before = null; buttons(); } setEl(sel, { [f]: f === 's' ? Math.max(0.3, Math.min(3, v / 100)) : v }); });
  }
  insp.querySelector('[data-act="close"]').onclick = () => select(null);
  insp.querySelector('[data-act="put-back"]')?.addEventListener('click', () => { snap(); state[cur].els[sel] = copy(builtIn); dirty[cur] = true; send(); inspect(); });
  inspectNumbers();
}
// the wheels' numbers: the emote wheel's and the tool radial's, from what is in force; editing one saves the whole set
function inspectNumbers() {
  const host = insp.querySelector('#wheel-rows'); if (!host || !G?.numbers) return;
  const kind = sel === 'emote' ? 'wheel' : sel === 'toolradial' ? 'toolwheel' : null;
  if (!kind) { host.innerHTML = ''; return; }
  const n = G.numbers[kind]; if (!n) { host.innerHTML = ''; return; }
  if (host.dataset.kind === kind && host.children.length) { // (keep the fields; refresh the values not under the pointer)
    for (const i of host.querySelectorAll('[data-w]')) { const f = i.dataset.w; if (document.activeElement !== i && n[f] != null) { i.value = n[f]; const o = host.querySelector(`[data-wv="${f}"]`); if (o) o.textContent = fmt(n[f]) + (f === 'a0' || f === 'a1' ? ' deg' : ' px'); } }
    return;
  }
  host.dataset.kind = kind;
  const own = !!state[cur][kind];
  const F = kind === 'wheel'
    ? [['R', 'reach', 20, 400], ['sl', 'slot', 16, 120], ['hub', 'hub', 0, 400], ['a0', 'arc from', -180, 180], ['a1', 'arc to', -180, 180]] // (hud3-wheels: no ring or disc behind to size, a blur hugs the slots)
    : [['R', 'reach', 20, 300], ['sl', 'slot', 16, 100], ['a0', 'arc from', -180, 180], ['a1', 'arc to', -180, 180]];
  const rows = F.filter(([f]) => n[f] != null).map(([f, lab, lo, hi]) => `<div class="row"><label>${lab}</label><input type="range" data-w="${f}" min="${lo}" max="${hi}" step="${f.startsWith('a') ? 1 : 0.5}" value="${n[f]}"><span class="val" data-wv="${f}">${fmt(n[f])}${f.startsWith('a') ? ' deg' : ' px'}</span></div>`);
  host.innerHTML = `<h3>${kind === 'wheel' ? 'The wheel\'s numbers' : 'The radial\'s numbers'}</h3>${rows.join('')}<p class="muted">${kind === 'wheel' ? (n.kind === 'ring' ? 'Frame px: the slots\' reach from the middle, a slot, the hub.' : 'Frame px: the slots\' reach from the smiley\'s middle, a slot, the hub (the smiley is the hub on this layout); the arc in degrees (0 = straight right, + = down). The arc still closes to clear the screen\'s edge.') : 'Frame px from the pivot (the tools button); the arc in degrees from straight left (+ = down), before the tilt.'}</p><div class="btns"><button class="btn small" type="button" data-act="auto"${own ? '' : ' disabled'}>Back to the built-in</button></div>`;
  for (const i of host.querySelectorAll('[data-w]')) {
    let before = null;
    i.addEventListener('pointerdown', () => { before = JSON.stringify(state[cur]); });
    i.addEventListener('focus', () => { before = JSON.stringify(state[cur]); });
    i.addEventListener('input', () => { const v = parseFloat(i.value); if (!Number.isFinite(v)) return; if (before !== null) { undoStack.push({ id: cur, s: before }); redoStack.length = 0; before = null; buttons(); } setWheel(kind, i.dataset.w, v); host.querySelector('[data-act="auto"]').disabled = false; const o = host.querySelector(`[data-wv="${i.dataset.w}"]`); if (o) o.textContent = fmt(v) + (i.dataset.w.startsWith('a') ? ' deg' : ' px'); });
  }
  host.querySelector('[data-act="auto"]').onclick = () => { snap(); state[cur][kind] = null; dirty[cur] = true; send(); host.innerHTML = ''; delete host.dataset.kind; setTimeout(inspectNumbers, 150); };
}
$('#insp').querySelector('.insp-grip').parentElement.addEventListener('click', e => { if (e.target.classList.contains('insp-grip') || e.target.tagName === 'H2') $('#insp').classList.toggle('folded'); });

// ---- the show chips: the layout's popouts, opened for real in the frame
function chips() {
  const host = $('#show'); host.replaceChildren();
  if (!G) return;
  for (const [id, name] of Object.entries(POP_NAMES)) {
    const has = ITEM_MODES[id] ? Object.entries(HUD_ITEMS).some(([k, it]) => it.mode === id && state[cur].els[k]) : id === 'dance' ? !!state[cur].els.emote : !!state[cur].els[id] || (id === 'questopen' && cur === 'pad' && !!state[cur].els.quests);
    if (!has || (id === 'logoff' && cur !== 'pad') || (id === 'questflare' && cur !== 'pad')) continue;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (G.pops[id] ? ' on' : ''); b.textContent = name; b.dataset.pop = id; b.setAttribute('aria-pressed', String(!!G.pops[id]));
    b.onclick = () => { post({ type: 'hud-edit-pop', id, on: !G.pops[id] }); if (!G.pops[id] && id !== 'dance' && !ITEM_MODES[id]) setTimeout(() => select(id === 'typing' ? 'typing' : id), 350); };
    host.append(b);
  }
}

// ---- the guides: the safe area and the keyboard, drawn in frame px
function drawGuides() {
  const g = GUIDES[cur] || {}, FWv = FW(), FHv = FH(), k = G ? G.k : Math.min(W / FWv, H / FHv);
  const showSafe = $('#guides').classList.contains('on') && g.safe, showKb = $('#kbd').classList.contains('on') && g.kb;
  const parts = [];
  if (showSafe) { const [t, r, b, l] = g.safe; parts.push(`<rect x="${l}" y="${t}" width="${FWv - l - r}" height="${FHv - t - b}" rx="10" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.9"/><text x="${FWv / 2}" y="${t + 13}" text-anchor="middle" font-size="11" font-family="Fredoka,sans-serif" fill="#fff" font-weight="500">safe area</text>`); }
  if (showKb) { parts.push(`<rect x="0" y="${FHv - g.kb}" width="${FWv}" height="${g.kb}" fill="#d3d6de" opacity="0.85"/>`); for (let r = 0; r < 3; r++) { const n = [10, 9, 7][r]; for (let i = 0; i < n; i++) parts.push(`<rect x="${(FWv - n * 32) / 2 + i * 32 + 2}" y="${FHv - g.kb + 12 + r * 52}" width="28" height="42" rx="6" fill="#fff" stroke="#b9bcc8"/>`); } parts.push(`<text x="${FWv / 2}" y="${FHv - g.kb - 6}" text-anchor="middle" font-size="11" font-family="Fredoka,sans-serif" fill="#fff" font-weight="500">keyboard</text>`); }
  guideLayer.innerHTML = parts.length ? `<svg width="${W * sc}" height="${H * sc}" viewBox="0 0 ${FWv} ${FHv}" preserveAspectRatio="xMinYMin meet" style="width:${FWv * k * sc}px;height:${FHv * k * sc}px">${parts.join('')}</svg>` : '';
}
for (const id of ['snap', 'guides', 'kbd']) $('#' + id).onclick = () => { const b = $('#' + id); const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); drawGuides(); };

// ---- switching layouts
function switchTo(id) {
  if (!LAYOUTS[id]) return;
  cur = id; $('#layout').value = id; location.hash = id; sel = null; G = null;
  for (const el of boxes.values()) el.remove(); boxes.clear(); handles();
  fit(); send(); inspect(); chips();
  status(dirty[cur] ? 'Unsaved changes.' : saved[cur] ? 'Showing the layout saved to the game.' : 'Showing the built-in layout.');
}
$('#layout').onchange = () => switchTo($('#layout').value);
$('#undo').onclick = undo; $('#redo').onclick = redo;

// ---- reset, try it, download, import, save
$('#reset').onclick = () => { snap(); state[cur] = { els: builtEls(cur), wheel: null, toolwheel: null }; resetPending[cur] = true; dirty[cur] = true; send(); inspect(); status('Back to the built-in layout. Save to make it so for everyone.'); };
$('#try').onclick = () => {
  try { localStorage.setItem('breneland.hudPreview', JSON.stringify(previewSet())); } catch { status('Could not keep the layout on this device.', 'err'); return; }
  const w = open('/?hud-preview=1', '_blank');
  status(w ? 'Opened the game in a new tab with your unsaved layouts.' : 'The browser blocked the new tab: open /?hud-preview=1 yourself.', w ? 'good' : 'err');
};
function previewSet() { const o = {}; for (const id of Object.keys(LAYOUTS)) o[id] = state[id]; return o; }
// the docs/refs format (docs/refs/andrew-*-hud-layout*.json): x, y, size (percent), angle, xPct, yPct per piece, _note, and the
// wheels under _wheel / _toolwheel (tools/hud-part0-gen.mjs reads them all)
function refsJson(id) {
  const L = LAYOUTS[id], s = state[id], [fw, fh] = L.frame, out = {};
  out._note = `Andrew's ${id} HUD layout, saved from the HUD Editor (/editor/hud.html) on ${new Date().toISOString().slice(0, 10)}. x, y in px of a ${fw}x${fh} frame; size in percent; angle in degrees (the tool radial's tilt); xPct, yPct of the screen. _wheel and _toolwheel: the wheels' numbers (frame px, degrees), or absent for automatic.`;
  if (s.wheel) out._wheel = s.wheel;
  if (s.toolwheel) out._toolwheel = s.toolwheel;
  for (const [k, e] of Object.entries(s.els)) {
    const o = { x: e.x, y: e.y, size: Math.round(e.s * 1000) / 10, xPct: Math.round(e.x / fw * 1000) / 10, yPct: Math.round(e.y / fh * 1000) / 10 };
    if (e.a !== undefined) o.angle = e.a;
    if (['toolradial', 'emote', 'questopen', 'bigmap', 'typing', 'logoff', 'questflare'].includes(k)) o.shown = true;
    out[k] = o;
  }
  return out;
}
$('#download').onclick = () => {
  const blob = new Blob([JSON.stringify(refsJson(cur), null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = LAYOUTS[cur].file || `andrew-${cur}-hud-layout.json`; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  status(`Downloaded ${a.download}.`);
};
function importJson(j) {
  if (!j || typeof j !== 'object') throw new Error('not a layout');
  const L = LAYOUTS[cur], els = copy(L.els);
  let wheel = null, toolwheel = null, n = 0;
  const src = j.els && typeof j.els === 'object' ? j : (j[cur] && j[cur].els ? j[cur] : null); // (the server's or Try it's shape)
  if (src) { for (const [k, e] of Object.entries(src.els)) if (L.els[k] && typeof e.x === 'number') { els[k] = { x: e.x, y: e.y, s: typeof e.s === 'number' ? e.s : els[k].s, ...(typeof e.a === 'number' ? { a: e.a } : {}) }; n++; } wheel = src.wheel || null; toolwheel = src.toolwheel || null; }
  else { // the docs/refs format
    for (const [k, v] of Object.entries(j)) { if (k[0] === '_' || !v || typeof v.x !== 'number' || !L.els[k]) continue; els[k] = { x: v.x, y: v.y, s: typeof v.size === 'number' ? Math.round(v.size) / 100 : els[k].s, ...(typeof v.angle === 'number' ? { a: v.angle } : {}) }; n++; }
    wheel = j._wheel && typeof j._wheel === 'object' ? j._wheel : null; toolwheel = j._toolwheel && typeof j._toolwheel === 'object' ? j._toolwheel : null;
  }
  if (!n) throw new Error('no pieces of this layout in it');
  snap(); state[cur] = { els, wheel, toolwheel }; dirty[cur] = true; delete resetPending[cur]; send(); inspect();
  return n;
}
$('#import').onclick = () => $('#file').click();
$('#file').onchange = async () => {
  const f = $('#file').files[0]; if (!f) return;
  try { const n = importJson(JSON.parse(await f.text())); status(`Loaded ${n} pieces from ${f.name} into ${$('#layout').selectedOptions[0].textContent}.`, 'good'); }
  catch (e) { status('Could not load that file: ' + e.message, 'err'); }
  $('#file').value = '';
};
let key = ''; try { key = localStorage.getItem('breneland.editKey') || ''; } catch { /* fine */ }
// Andrew signed in on this device: his session token saves without the key (server.js editRefusal)
const session = () => { try { const a = JSON.parse(localStorage.getItem('breneland.account') || 'null'); return a && typeof a.token === 'string' ? a.token : ''; } catch { return ''; } };
const saveHeaders = () => ({ 'content-type': 'application/json', ...(key ? { 'x-edit-key': key } : {}), ...(session() ? { 'x-breneland-token': session() } : {}) });
$('#save').onclick = () => { if (!key && !session()) { $('#keyrow').hidden = false; $('#key').focus(); status('Enter the edit key once (it is kept on this device), or log in to Breneland as Andrew.'); return; } save(); };
$('#keyok').onclick = () => { key = $('#key').value.trim(); try { localStorage.setItem('breneland.editKey', key); } catch { /* fine */ } $('#keyrow').hidden = true; save(); };
$('#key').addEventListener('keydown', e => { if (e.key === 'Enter') $('#keyok').click(); });
async function save() {
  const body = {};
  for (const id of Object.keys(LAYOUTS)) if (dirty[id]) body[id] = resetPending[id] ? null : state[id];
  if (!Object.keys(body).length) body[cur] = resetPending[cur] ? null : state[cur];
  status('Saving...');
  try {
    const r = await fetch('/api/hud-layouts', { method: 'POST', headers: saveHeaders(), body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { if (r.status === 401) { key = ''; try { localStorage.removeItem('breneland.editKey'); } catch { /* fine */ } $('#keyrow').hidden = false; } status('Not saved: ' + (j.error || r.status), 'err'); return; }
    saved = j; for (const id of Object.keys(body)) { delete dirty[id]; delete resetPending[id]; }
    status('Saved to the game. Everyone gets it on their next load.', 'good');
  } catch (e) { status('Not saved: ' + e.message, 'err'); }
}

// ---- boot
const api = { ready: false, get state() { return state; }, get cur() { return cur; }, get geom() { return G; }, get sel() { return sel; }, select, setEl, setWheel, switchTo, send, pop: (id, on) => post({ type: 'hud-edit-pop', id, on }), refsJson, importJson, save, undo, redo, get saved() { return saved; }, get dirty() { return dirty; } };
window.hudEditor = api;
(async () => {
  try { const r = await fetch('/api/hud-layouts', { cache: 'no-store' }); saved = r.ok ? await r.json() : {}; } catch { saved = {}; }
  if (!saved || typeof saved !== 'object') saved = {};
  for (const id of Object.keys(LAYOUTS)) state[id] = fresh(id);
  $('#layout').value = cur; buttons();
  fit(); chips(); inspect();
  addEventListener('hashchange', () => { const id = location.hash.slice(1); if (LAYOUTS[id] && id !== cur) switchTo(id); });
  addEventListener('beforeunload', e => { if (Object.values(dirty).some(Boolean)) { e.preventDefault(); e.returnValue = ''; } });
})();
