// The HUD Editor's "D&D table" screen (editor/hud.html, the D&D table button): the table's layout for each form (upright, a PC
// sideways, a phone on its side) on a still copy of the table in its skin (dnd-mock.js), every region outlined to drag and size:
// the boxes (party strip, log, dice area, your character, chat bar, toolbar), the split between the 3D view and the panel, the
// seal, the wheel (its radius and arc, by the two dots at its ends), the view button, the log's text size. Saved with the HUD's
// save (/api/hud-layouts, the `dnd` key: { portrait, pc, phone }, a form left as built-in is not sent); the game lays it over the
// built-in on its next load (dnd-layout.js). Kept apart from the town editor (hud-editor.js): its own state, key prompt and status.
import { FORMS, FRAMES, REGIONS, NAMES, BUILTIN, layoutFor } from '../dnd-layout.js';
import { buildMock } from '../dnd-mock.js';

const $ = s => document.querySelector(s);
const copy = o => JSON.parse(JSON.stringify(o));
const h = (tag, cls, text, attrs) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
for (const href of ['/css/dnd.css', '/css/dnd-layout-editor.css']) if (!document.querySelector(`link[href="${href}"]`)) { const l = h('link', '', '', { rel: 'stylesheet', href }); document.head.append(l); }

const tab = $('#dnd-tab'), ed = $('#dnd-ed');
const FORM_NAMES = { portrait: 'Phone upright', pc: 'PC sideways', phone: 'Phone sideways' };
const RANGE = { x: [-0.2, 1.2], y: [-0.2, 1.2], w: [0.02, 1.2], h: [0.02, 1.2], s: [24, 160], r: [40, 480], a0: [-360, 360], a1: [-360, 360], vh: [0.15, 0.9] };
const clamp = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));

// ---- the screen's parts
const bar = h('div', 'dl-bar');
const formBtns = FORMS.map(f => { const b = h('button', 'btn small tog', FORM_NAMES[f], { type: 'button', 'data-form': f, 'aria-pressed': 'false' }); b.onclick = () => setForm(f); bar.append(b); return b; });
const askT = h('button', 'btn small tog', 'Show the Roll', { type: 'button', 'aria-pressed': 'false', title: 'A check pending: the Roll in the dice area' });
const wheelT = h('button', 'btn small tog', 'Show the wheel', { type: 'button', 'aria-pressed': 'false', title: 'The tools wheel open (upright)' });
bar.append(h('span', 'sep'), askT, wheelT);
const frame = h('div', 'dl-frame'), screen = h('div', 'dl-screen'), over = h('div', 'dl-over');
const mock = buildMock();
screen.append(mock.scene, mock.root, mock.view); frame.append(screen, over);
const stage = h('section', 'dl-stage', '', { 'aria-label': 'The D&D table' }); stage.append(bar, frame);
const insp = h('aside', 'dl-insp', '', { 'aria-label': 'The selected region' });
const list = h('div', 'dl-list'), title = h('h2', '', 'D&D table'), fields = h('div', 'dl-fields');
const fontRow = h('div', 'dl-font'), fontDn = h('button', 'btn small', 'A-', { type: 'button', title: 'Smaller log text' }), fontUp = h('button', 'btn small', 'A+', { type: 'button', title: 'Bigger log text' }), fontVal = h('b', '', '');
fontRow.append(h('span', '', 'Log text'), fontDn, fontVal, fontUp);
const resetItem = h('button', 'btn small', 'Reset item', { type: 'button', title: 'This region back to the built-in' });
const resetForm = h('button', 'btn small danger', 'Reset to built-in', { type: 'button', title: 'This whole form back to the built-in' });
const saveBtn = h('button', 'btn small primary', 'Save to game', { type: 'button' });
const keyRow = h('div', 'dl-key'), keyIn = h('input', '', '', { type: 'password', placeholder: 'edit key', autocomplete: 'off', 'aria-label': 'Edit key' }), keyOk = h('button', 'btn small', 'OK', { type: 'button' });
keyRow.append(keyIn, keyOk); keyRow.hidden = true;
const stat = h('p', 'dl-status', '', { role: 'status' });
const help = h('p', 'muted', 'Drag a region to move it, its corner dot to size it. Arrow keys nudge 1 px. The split line sets how tall the 3D view is.');
const acts = h('div', 'dl-acts'); acts.append(resetItem, resetForm, saveBtn);
insp.append(title, acts, keyRow, stat, list, fields, fontRow, help);
ed.append(stage, insp);

// ---- the state: the three forms, built-in with the saved one over it
let saved = null, form = 'pc', sel = null, k = 1;
const state = {};
const dirty = new Set();
const status = (t, cls = '') => { stat.textContent = t; stat.className = 'dl-status ' + cls; };
async function load() {
  try { const r = await fetch('/api/hud-layouts', { cache: 'no-store' }); const j = r.ok ? await r.json() : {}; saved = j && j.dnd && typeof j.dnd === 'object' ? j.dnd : null; } catch { saved = null; }
  for (const f of FORMS) state[f] = layoutFor(f, saved);
  dirty.clear(); render();
  status(saved && Object.keys(saved).some(f => FORMS.includes(f)) ? 'Showing the layout saved to the game.' : 'Showing the built-in layout.');
}
for (const f of FORMS) state[f] = layoutFor(f, null);

// ---- drawing: the mock at the form's frame, scaled to fit, and a box over each region
const L = () => state[form];
function fit() {
  const F = FRAMES[form], r = stage.getBoundingClientRect(), bh = bar.getBoundingClientRect().height;
  const aw = Math.max(120, r.width - 20), ah = Math.max(120, r.height - bh - 24);
  k = Math.min(aw / F.w, ah / F.h, 1.25);
  screen.style.width = F.w + 'px'; screen.style.height = F.h + 'px'; screen.style.transform = `scale(${k})`;
  frame.style.width = Math.round(F.w * k) + 'px'; frame.style.height = Math.round(F.h * k) + 'px';
}
const px = (v, axis) => v * FRAMES[form][axis] * k;
function render() {
  for (const b of formBtns) { const on = b.dataset.form === form; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  wheelT.hidden = form !== 'portrait';
  const showWheel = form === 'portrait' && (wheelT.classList.contains('on') || sel === 'wheel');
  mock.set(screen, form, L(), { asking: askT.classList.contains('on'), wheel: showWheel });
  fit(); boxes(showWheel); inspector();
}
function boxes(showWheel) {
  over.textContent = '';
  const F = FRAMES[form], lay = L();
  for (const [key, kind] of Object.entries(REGIONS[form])) {
    if (kind === 'font') continue;
    if (kind === 'wheel' && !showWheel) continue;
    const v = lay[key], b = h('div', 'dl-box k-' + kind + (sel === key ? ' sel' : ''), '', { tabindex: '0', 'data-key': key, 'aria-label': NAMES[key] });
    b.append(h('span', 'dl-tag', NAMES[key]));
    if (kind === 'box') { Object.assign(b.style, { left: px(v.x, 'w') + 'px', top: px(v.y, 'h') + 'px', width: px(v.w, 'w') + 'px', height: px(v.h, 'h') + 'px' }); b.append(handle('size')); }
    else if (kind === 'view') { Object.assign(b.style, { left: '0px', top: (px(v.h, 'h') - 7) + 'px', width: F.w * k + 'px', height: '14px' }); }
    else if (kind === 'dot') { const s = v.s * k; Object.assign(b.style, { left: (px(v.x, 'w') - s / 2) + 'px', top: (px(v.y, 'h') - s / 2) + 'px', width: s + 'px', height: s + 'px' }); b.append(handle('size')); }
    else if (kind === 'pt') { const s = 44 * k; Object.assign(b.style, { left: px(v.x, 'w') + 'px', top: px(v.y, 'h') + 'px', width: s + 'px', height: s + 'px' }); }
    else if (kind === 'wheel') { // a ring round the seal; its two ends set the arc (and the radius)
      const c = lay.seal, cx = px(c.x, 'w'), cy = px(c.y, 'h'), r = v.r * k;
      Object.assign(b.style, { left: (cx - r) + 'px', top: (cy - r) + 'px', width: 2 * r + 'px', height: 2 * r + 'px' });
      for (const end of ['a0', 'a1']) { const a = v[end] * Math.PI / 180, d = handle(end); d.style.left = (r + Math.cos(a) * r - 13) + 'px'; d.style.top = (r - Math.sin(a) * r - 13) + 'px'; b.append(d); }
    }
    b.addEventListener('pointerdown', e => grab(e, key, e.target.dataset.h || 'move'));
    b.addEventListener('keydown', e => nudge(e, key));
    b.addEventListener('focus', () => { if (sel !== key) { sel = key; inspector(); for (const x of over.children) x.classList.toggle('sel', x.dataset.key === key); } });
    over.append(b);
  }
}
const handle = kind => h('i', 'dl-h ' + kind, '', { 'data-h': kind, 'aria-hidden': 'true' });

// ---- dragging (a mouse or a finger): the region follows, in the form's own pixels
let drag = null;
function grab(e, key, what) {
  if (e.button > 0) return;
  e.preventDefault(); e.stopPropagation();
  const el = e.currentTarget; try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
  if (sel !== key) { sel = key; }
  drag = { key, what, x0: e.clientX, y0: e.clientY, v0: copy(L()[key]), el, moved: false };
  el.classList.add('sel');
  el.onpointermove = ev => move(ev); el.onpointerup = el.onpointercancel = () => drop();
}
function move(e) {
  if (!drag) return;
  const F = FRAMES[form], dx = (e.clientX - drag.x0) / k, dy = (e.clientY - drag.y0) / k, v = L()[drag.key], o = drag.v0, kind = REGIONS[form][drag.key];
  const q = n => Math.round(n * 1000) / 1000;
  drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 1;
  if (kind === 'view') v.h = q(clamp(o.h + dy / F.h, RANGE.vh));
  else if (kind === 'wheel') {
    const c = L().seal, r = frame.getBoundingClientRect(), cx = r.left + px(c.x, 'w'), cy = r.top + px(c.y, 'h');
    v[drag.what] = Math.round(Math.atan2(-(e.clientY - cy), e.clientX - cx) * 180 / Math.PI);
    v.r = Math.round(clamp(Math.hypot(e.clientX - cx, e.clientY - cy) / k, RANGE.r));
  } else if (drag.what === 'size') {
    if (kind === 'dot') v.s = Math.round(clamp(o.s + Math.max(dx, dy), RANGE.s));
    else { v.w = q(clamp(o.w + dx / F.w, RANGE.w)); v.h = q(clamp(o.h + dy / F.h, RANGE.h)); }
  } else { v.x = q(clamp(o.x + dx / F.w, RANGE.x)); v.y = q(clamp(o.y + dy / F.h, RANGE.y)); }
  dirty.add(form);
  const showWheel = form === 'portrait' && (wheelT.classList.contains('on') || sel === 'wheel');
  mock.set(screen, form, L(), { asking: askT.classList.contains('on'), wheel: showWheel });
  place(drag.el, drag.key); fillFields();
}
// move one box without rebuilding the others (and keep the pointer capture)
function place(b, key) {
  const v = L()[key], kind = REGIONS[form][key], F = FRAMES[form];
  if (kind === 'box') Object.assign(b.style, { left: px(v.x, 'w') + 'px', top: px(v.y, 'h') + 'px', width: px(v.w, 'w') + 'px', height: px(v.h, 'h') + 'px' });
  else if (kind === 'view') b.style.top = (px(v.h, 'h') - 7) + 'px';
  else if (kind === 'dot') { const s = v.s * k; Object.assign(b.style, { left: (px(v.x, 'w') - s / 2) + 'px', top: (px(v.y, 'h') - s / 2) + 'px', width: s + 'px', height: s + 'px' }); }
  else if (kind === 'pt') Object.assign(b.style, { left: px(v.x, 'w') + 'px', top: px(v.y, 'h') + 'px' });
  else if (kind === 'wheel') { const c = L().seal, cx = px(c.x, 'w'), cy = px(c.y, 'h'), r = v.r * k; Object.assign(b.style, { left: (cx - r) + 'px', top: (cy - r) + 'px', width: 2 * r + 'px', height: 2 * r + 'px' }); for (const d of b.querySelectorAll('.dl-h')) { const a = v[d.dataset.h] * Math.PI / 180; d.style.left = (r + Math.cos(a) * r - 13) + 'px'; d.style.top = (r - Math.sin(a) * r - 13) + 'px'; } }
  void F;
}
function drop() { if (!drag) return; const d = drag; drag = null; d.el.onpointermove = d.el.onpointerup = d.el.onpointercancel = null; render(); over.querySelector(`[data-key="${d.key}"]`)?.focus({ preventScroll: true }); if (d.moved) status('Unsaved changes.'); }
function nudge(e, key) {
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!dir) return;
  e.preventDefault();
  const v = L()[key], kind = REGIONS[form][key], F = FRAMES[form], q = n => Math.round(n * 10000) / 10000;
  if (kind === 'view') v.h = q(clamp(v.h + dir[1] / F.h, RANGE.vh));
  else if (kind === 'wheel') v.r = clamp(v.r - dir[1], RANGE.r);
  else if (e.shiftKey && kind === 'box') { v.w = q(clamp(v.w + dir[0] / F.w, RANGE.w)); v.h = q(clamp(v.h + dir[1] / F.h, RANGE.h)); }
  else { v.x = q(clamp(v.x + dir[0] / F.w, RANGE.x)); v.y = q(clamp(v.y + dir[1] / F.h, RANGE.y)); }
  dirty.add(form); render(); over.querySelector(`[data-key="${key}"]`)?.focus({ preventScroll: true }); status('Unsaved changes.');
}

// ---- the inspector: the region list, the selected one's numbers, the log's text size
const FIELD_OF = { box: [['x', 'Left', '%'], ['y', 'Top', '%'], ['w', 'Width', '%'], ['h', 'Height', '%']], view: [['h', 'View height', '%']], dot: [['x', 'Centre x', '%'], ['y', 'Centre y', '%'], ['s', 'Size', 'px']], wheel: [['r', 'Radius', 'px'], ['a0', 'Arc from', 'deg'], ['a1', 'Arc to', 'deg']], pt: [['x', 'Left', '%'], ['y', 'Top', '%']] };
function inspector() {
  list.textContent = '';
  for (const [key, kind] of Object.entries(REGIONS[form])) {
    if (kind === 'font') continue;
    const c = h('button', 'dl-chip' + (sel === key ? ' on' : ''), NAMES[key], { type: 'button', 'data-key': key });
    c.onclick = () => { sel = key; render(); };
    list.append(c);
  }
  title.textContent = sel ? NAMES[sel] : FORM_NAMES[form];
  fillFields(true);
  fontVal.textContent = L().font + ' px';
  resetItem.disabled = !sel;
}
function fillFields(rebuild) {
  if (rebuild) fields.textContent = '';
  if (!sel || !REGIONS[form][sel]) return;
  const kind = REGIONS[form][sel], v = L()[sel];
  for (const [f, label, unit] of FIELD_OF[kind]) {
    const pct = unit === '%', show = pct ? Math.round(v[f] * 1000) / 10 : v[f];
    let inp = fields.querySelector(`input[data-f="${f}"]`);
    if (!inp) {
      const row = h('label', 'dl-field'); row.append(h('span', '', label));
      inp = h('input', '', '', { type: 'number', step: pct ? '0.1' : '1', 'data-f': f });
      inp.onchange = () => { const n = Number(inp.value); if (!Number.isFinite(n)) return; const val = pct ? n / 100 : n; L()[sel][f] = clamp(val, kind === 'view' ? RANGE.vh : RANGE[f]); dirty.add(form); render(); status('Unsaved changes.'); };
      row.append(inp, h('small', '', unit)); fields.append(row);
    }
    if (document.activeElement !== inp) inp.value = String(show);
  }
}
fontDn.onclick = () => { L().font = Math.max(10, L().font - 1); dirty.add(form); render(); status('Unsaved changes.'); };
fontUp.onclick = () => { L().font = Math.min(28, L().font + 1); dirty.add(form); render(); status('Unsaved changes.'); };
resetItem.onclick = () => { if (!sel) return; const B = BUILTIN[form][sel]; L()[sel] = typeof B === 'object' ? copy(B) : B; dirty.add(form); render(); status(NAMES[sel] + ' is back to the built-in (not saved yet).'); };
resetForm.onclick = () => { state[form] = copy(BUILTIN[form]); dirty.add(form); render(); status(FORM_NAMES[form] + ' is back to the built-in (save to make it so in the game).'); };
askT.onclick = () => { askT.classList.toggle('on'); askT.setAttribute('aria-pressed', String(askT.classList.contains('on'))); render(); };
wheelT.onclick = () => { wheelT.classList.toggle('on'); wheelT.setAttribute('aria-pressed', String(wheelT.classList.contains('on'))); render(); };
function setForm(f) { form = f; sel = null; render(); }

// ---- save: every form that differs from the built-in, under `dnd` (the same save as the town's layouts)
let key = ''; try { key = localStorage.getItem('breneland.editKey') || ''; } catch { /* fine */ }
const session = () => { try { const a = JSON.parse(localStorage.getItem('breneland.account') || 'null'); return a && typeof a.token === 'string' ? a.token : ''; } catch { return ''; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function save() {
  if (!key && !session()) { keyRow.hidden = false; keyIn.focus(); status('Enter the edit key once (it is kept on this device), or log in to Breneland as Andrew.'); return false; }
  const dnd = {}; for (const f of FORMS) if (!same(state[f], BUILTIN[f])) dnd[f] = state[f];
  status('Saving...');
  try {
    const r = await fetch('/api/hud-layouts', { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-edit-key': key } : {}), ...(session() ? { 'x-breneland-token': session() } : {}) }, body: JSON.stringify({ dnd: Object.keys(dnd).length ? dnd : null }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { if (r.status === 401) { key = ''; try { localStorage.removeItem('breneland.editKey'); } catch { /* fine */ } keyRow.hidden = false; } status('Not saved: ' + (j.error || r.status), 'err'); return false; }
    saved = j.dnd || null; dirty.clear();
    status('Saved to the game. Everyone gets it at the table on their next load.', 'good');
    return true;
  } catch (e) { status('Not saved: ' + e.message, 'err'); return false; }
}
saveBtn.onclick = () => save();
keyOk.onclick = () => { key = keyIn.value.trim(); try { localStorage.setItem('breneland.editKey', key); } catch { /* fine */ } keyRow.hidden = true; save(); };

// ---- the D&D table button: this screen in the town editor's place
function show(on) {
  ed.hidden = !on; $('#wrap').hidden = on; const tb = $('#toolbar'); if (tb) tb.hidden = on; const pk = $('.pick'); if (pk) pk.hidden = on;
  tab.classList.toggle('on', on); tab.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (on) { if (!saved && !dirty.size) load(); else render(); }
}
tab.onclick = () => show(ed.hidden);
addEventListener('resize', () => { if (!ed.hidden) render(); });
if (/[?&]dnd\b/.test(location.search)) show(true);
// (test hook)
window.dndLayoutEditor = { get state() { return state; }, get form() { return form; }, get sel() { return sel; }, get k() { return k; }, get saved() { return saved; }, setForm, select: key2 => { sel = key2; render(); }, save, show, load };
