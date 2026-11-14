// The HUD Editor's "Table games" screen (editor/hud.html, the Table games button): the board-game overlay's frame for each form
// (a phone upright, a PC sideways, a phone on its side) on a still copy of a Mexican Train game in its own skin (table-games.css,
// the same renderers as the game: mt-ui.js), every region outlined to drag and size: the players strip, the board, your hand,
// the buttons, the split between the 3D view and the panel upright, the view button. Saved with the HUD's save (/api/hud-layouts,
// the `tablegame` key: { portrait, pc, phone }, a form left as built-in is not sent); the game lays it over the built-in on its
// next load (tg-layout.js). Its own state, key prompt and status, like the D&D table's screen (dnd-layout-editor.js, whose
// editor look it shares: dnd-layout-editor.css).
import { FORMS, FRAMES, REGIONS, NAMES, BUILTIN, layoutFor, applyLayout } from '../table-games/tg-layout.js';
import { renderBoard, renderHand, ico } from '../table-games/mt-ui.js';
import { tileSvg } from '../table-games/dominoes.js';

const $ = s => document.querySelector(s);
const copy = o => JSON.parse(JSON.stringify(o));
const h = (tag, cls, text, attrs) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
for (const href of ['/css/table-games.css', '/css/dnd-layout-editor.css']) if (!document.querySelector(`link[href="${href}"]`)) document.head.append(h('link', '', '', { rel: 'stylesheet', href }));
{ const st = h('style'); st.textContent = '.dl-screen .tg.mock{position:absolute;inset:0;z-index:2}.tg-mock-room{position:absolute;inset:0;z-index:0;background:radial-gradient(ellipse at 50% 60%,#2a6aa0 0 34%,#b98a5a 35% 39%,#7a3b2a 40%,#3a1c14 100%)}#tg-tab.on{background:#c9a2ff}#tg-ed{display:grid;grid-template-columns:minmax(0,1fr) var(--insp-w,300px);min-height:0}#tg-ed[hidden]{display:none!important}@media (max-width:760px){#tg-ed{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto}}'; document.head.append(st); }

const tab = $('#tg-tab'), ed = $('#tg-ed');
const FORM_NAMES = { portrait: 'Phone upright', pc: 'PC sideways', phone: 'Phone sideways' };
const RANGE = { x: [-0.2, 1.2], y: [-0.2, 1.2], w: [0.02, 1.2], h: [0.02, 1.2], vh: [0.12, 0.8] };
const clamp = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));

// ---- the still game: three players round a store table, a few trains laid, your hand
const T = { order: [0, 1, 2], seats: [{ name: 'You', kind: 'human' }, { name: 'Spinner', kind: 'bot' }, { name: 'Riley', kind: 'npc' }] };
const V = { n: 3, engine: 6, turn: 0, phase: 'play', pending: null, counts: [5, 4, 6], boneyard: 9, round: 1, rounds: 7, scores: { totals: [12, 20, 7] },
  trains: [{ owner: 0, tiles: [[6, 2], [2, 5], [5, 5], [5, 1]], open: false }, { owner: 1, tiles: [[6, 4], [4, 4], [4, 0]], open: true }, { owner: 2, tiles: [[6, 3]], open: false }, { owner: null, mexican: true, tiles: [[6, 1], [1, 3]], open: true }] };
const HAND = [[0, 3], [1, 1], [1, 4], [2, 6], [3, 5]];
function buildMock() {
  const room = h('div', 'tg-mock-room');
  const root = h('div', 'tg mock', '', { role: 'presentation' });
  const bg = h('div', 'tg-panel-bg'), bar = h('div', 'tg-bar tg-reg'), wrap = h('div', 'tg-boardwrap tg-reg'), board = h('div', 'tg-board'), hand = h('div', 'tg-hand tg-reg'), acts = h('div', 'tg-acts tg-reg'), toggle = h('button', 'tg-toggle', '', { type: 'button', tabindex: '-1' });
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="14" height="12" rx="2" fill="#ffd34d" stroke="#2b2340" stroke-width="2"/><path d="M17 10l4-2.5v9L17 14" fill="#ffd34d" stroke="#2b2340" stroke-width="2"/></svg>';
  const slip = h('div', 'tg-slip', 'Spinner plays 4|0 on their train.');
  wrap.append(board, slip);
  root.append(bg, bar, wrap, hand, acts, toggle);
  const COLS = ['#e0463c', '#3f8fd9', '#f2b630'];
  for (const [k, s] of T.seats.entries()) { const c = h('div', 'tg-chip' + (k === 0 ? ' turn me' : '')); c.style.setProperty('--seat', COLS[k]); c.append(h('i', 'tg-dot')); if (s.kind === 'bot') c.append(ico('bot', 'tg-kind')); if (s.kind === 'npc') c.append(ico('folk', 'tg-kind')); c.append(h('span', 'tg-cn', s.name)); const n = h('span', 'tg-cc'); n.append(ico('tiles', 'tg-mini'), document.createTextNode(String(V.counts[k]))); c.append(n, h('b', 'tg-cs', String(V.scores.totals[k]))); bar.append(c); }
  bar.append(h('div', 'tg-round-pill', '2/7'));
  for (const [i, t] of [['draw', 'Draw a tile'], ['knock', 'One tile left!'], ['rules', 'How to play'], ['stand', 'Stand up']]) { const b = h('button', 'tg-act' + (i === 'rules' || i === 'stand' ? ' small' : ''), '', { type: 'button', tabindex: '-1', 'aria-label': t }); b.append(ico(i)); acts.append(b); }
  return {
    room, root,
    set(screen, form, L) {
      applyLayout(root, form, L); root.classList.toggle('portrait', form === 'portrait');
      room.style.height = form === 'portrait' ? (L.view.h * 100) + '%' : '100%';
      requestAnimationFrame(() => { renderBoard(board, { T, v: V, me: 0, sel: [1, 4], spots: [0, 3], onSpot() {} }); renderHand(hand, { tiles: HAND, playable: new Set(['1-4', '1-1']), sel: '1-4', onPick() {}, onDown() {} }); for (const t of hand.querySelectorAll('button')) t.tabIndex = -1; });
    },
  };
}
void tileSvg;

// ---- the screen's parts
const bar = h('div', 'dl-bar');
const formBtns = FORMS.map(f => { const b = h('button', 'btn small tog', FORM_NAMES[f], { type: 'button', 'data-form': f, 'aria-pressed': 'false' }); b.onclick = () => setForm(f); bar.append(b); return b; });
const frame = h('div', 'dl-frame'), screen = h('div', 'dl-screen'), over = h('div', 'dl-over');
const mock = buildMock();
screen.append(mock.room, mock.root); frame.append(screen, over);
const stage = h('section', 'dl-stage', '', { 'aria-label': 'The table game overlay' }); stage.append(bar, frame);
const insp = h('aside', 'dl-insp', '', { 'aria-label': 'The selected region' });
const list = h('div', 'dl-list'), title = h('h2', '', 'Table games'), fields = h('div', 'dl-fields');
const resetItem = h('button', 'btn small', 'Reset item', { type: 'button', title: 'This region back to the built-in' });
const resetForm = h('button', 'btn small danger', 'Reset to built-in', { type: 'button', title: 'This whole form back to the built-in' });
const saveBtn = h('button', 'btn small primary', 'Save to game', { type: 'button' });
const keyRow = h('div', 'dl-key'), keyIn = h('input', '', '', { type: 'password', placeholder: 'edit key', autocomplete: 'off', 'aria-label': 'Edit key' }), keyOk = h('button', 'btn small', 'OK', { type: 'button' });
keyRow.append(keyIn, keyOk); keyRow.hidden = true;
const stat = h('p', 'dl-status', '', { role: 'status' });
const help = h('p', 'muted', 'Every board game (Mexican Train first) uses this frame. Drag a region to move it, its corner dot to size it. Arrow keys nudge 1 px. Upright, the split line sets how tall the 3D view is.');
const acts = h('div', 'dl-acts'); acts.append(resetItem, resetForm, saveBtn);
insp.append(title, acts, keyRow, stat, list, fields, help);
ed.append(stage, insp);

let saved = null, form = 'pc', sel = null, k = 1;
const state = {};
const dirty = new Set();
const status = (t, cls = '') => { stat.textContent = t; stat.className = 'dl-status ' + cls; };
async function load() {
  try { const r = await fetch('/api/hud-layouts', { cache: 'no-store' }); const j = r.ok ? await r.json() : {}; saved = j && j.tablegame && typeof j.tablegame === 'object' ? j.tablegame : null; } catch { saved = null; }
  for (const f of FORMS) state[f] = layoutFor(f, saved);
  dirty.clear(); render();
  status(saved && Object.keys(saved).some(f => FORMS.includes(f)) ? 'Showing the layout saved to the game.' : 'Showing the built-in layout.');
}
for (const f of FORMS) state[f] = layoutFor(f, null);

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
  fit(); mock.set(screen, form, L()); boxes(); inspector();
}
function place(b, key) {
  const v = L()[key], kind = REGIONS[form][key], F = FRAMES[form];
  if (kind === 'box') Object.assign(b.style, { left: px(v.x, 'w') + 'px', top: px(v.y, 'h') + 'px', width: px(v.w, 'w') + 'px', height: px(v.h, 'h') + 'px' });
  else if (kind === 'view') Object.assign(b.style, { left: '0px', top: (px(v.h, 'h') - 7) + 'px', width: F.w * k + 'px', height: '14px' });
  else if (kind === 'pt') { const s = 44 * k; Object.assign(b.style, { left: px(v.x, 'w') + 'px', top: px(v.y, 'h') + 'px', width: s + 'px', height: s + 'px' }); }
}
function boxes() {
  over.textContent = '';
  for (const [key, kind] of Object.entries(REGIONS[form])) {
    const b = h('div', 'dl-box k-' + kind + (sel === key ? ' sel' : ''), '', { tabindex: '0', 'data-key': key, 'aria-label': NAMES[key] });
    b.append(h('span', 'dl-tag', NAMES[key]));
    if (kind === 'box') b.append(h('i', 'dl-h size', '', { 'data-h': 'size', 'aria-hidden': 'true' }));
    place(b, key);
    b.addEventListener('pointerdown', e => grab(e, key, e.target.dataset.h || 'move'));
    b.addEventListener('keydown', e => nudge(e, key));
    b.addEventListener('focus', () => { if (sel !== key) { sel = key; inspector(); for (const x of over.children) x.classList.toggle('sel', x.dataset.key === key); } });
    over.append(b);
  }
}
let drag = null;
function grab(e, key, what) {
  if (e.button > 0) return;
  e.preventDefault(); e.stopPropagation();
  const el = e.currentTarget; try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
  sel = key;
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
  else if (drag.what === 'size') { v.w = q(clamp(o.w + dx / F.w, RANGE.w)); v.h = q(clamp(o.h + dy / F.h, RANGE.h)); }
  else { v.x = q(clamp(o.x + dx / F.w, RANGE.x)); v.y = q(clamp(o.y + dy / F.h, RANGE.y)); }
  dirty.add(form);
  mock.set(screen, form, L()); place(drag.el, drag.key); fillFields();
}
function drop() { if (!drag) return; const d = drag; drag = null; d.el.onpointermove = d.el.onpointerup = d.el.onpointercancel = null; render(); over.querySelector(`[data-key="${d.key}"]`)?.focus({ preventScroll: true }); if (d.moved) status('Unsaved changes.'); }
function nudge(e, key) {
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!dir) return;
  e.preventDefault();
  const v = L()[key], kind = REGIONS[form][key], F = FRAMES[form], q = n => Math.round(n * 10000) / 10000;
  if (kind === 'view') v.h = q(clamp(v.h + dir[1] / F.h, RANGE.vh));
  else if (e.shiftKey && kind === 'box') { v.w = q(clamp(v.w + dir[0] / F.w, RANGE.w)); v.h = q(clamp(v.h + dir[1] / F.h, RANGE.h)); }
  else { v.x = q(clamp(v.x + dir[0] / F.w, RANGE.x)); v.y = q(clamp(v.y + dir[1] / F.h, RANGE.y)); }
  dirty.add(form); render(); over.querySelector(`[data-key="${key}"]`)?.focus({ preventScroll: true }); status('Unsaved changes.');
}
const FIELD_OF = { box: [['x', 'Left'], ['y', 'Top'], ['w', 'Width'], ['h', 'Height']], view: [['h', 'View height']], pt: [['x', 'Left'], ['y', 'Top']] };
function inspector() {
  list.textContent = '';
  for (const key of Object.keys(REGIONS[form])) { const c = h('button', 'dl-chip' + (sel === key ? ' on' : ''), NAMES[key], { type: 'button', 'data-key': key }); c.onclick = () => { sel = key; render(); }; list.append(c); }
  title.textContent = sel ? NAMES[sel] : FORM_NAMES[form];
  fillFields(true); resetItem.disabled = !sel;
}
function fillFields(rebuild) {
  if (rebuild) fields.textContent = '';
  if (!sel || !REGIONS[form][sel]) return;
  const kind = REGIONS[form][sel], v = L()[sel];
  for (const [f, label] of FIELD_OF[kind]) {
    let inp = fields.querySelector(`input[data-f="${f}"]`);
    if (!inp) {
      const row = h('label', 'dl-field'); row.append(h('span', '', label));
      inp = h('input', '', '', { type: 'number', step: '0.1', 'data-f': f });
      inp.onchange = () => { const n = Number(inp.value); if (!Number.isFinite(n)) return; L()[sel][f] = clamp(n / 100, kind === 'view' ? RANGE.vh : RANGE[f]); dirty.add(form); render(); status('Unsaved changes.'); };
      row.append(inp, h('small', '', '%')); fields.append(row);
    }
    if (document.activeElement !== inp) inp.value = String(Math.round(v[f] * 1000) / 10);
  }
}
resetItem.onclick = () => { if (!sel) return; L()[sel] = copy(BUILTIN[form][sel]); dirty.add(form); render(); status(NAMES[sel] + ' is back to the built-in (not saved yet).'); };
resetForm.onclick = () => { state[form] = copy(BUILTIN[form]); dirty.add(form); render(); status(FORM_NAMES[form] + ' is back to the built-in (save to make it so in the game).'); };
function setForm(f) { form = f; sel = null; render(); }

let key = ''; try { key = localStorage.getItem('breneland.editKey') || ''; } catch { /* fine */ }
const session = () => { try { const a = JSON.parse(localStorage.getItem('breneland.account') || 'null'); return a && typeof a.token === 'string' ? a.token : ''; } catch { return ''; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function save() {
  if (!key && !session()) { keyRow.hidden = false; keyIn.focus(); status('Enter the edit key once (it is kept on this device), or log in to Breneland as Andrew.'); return false; }
  const tg = {}; for (const f of FORMS) if (!same(state[f], BUILTIN[f])) tg[f] = state[f];
  status('Saving...');
  try {
    const r = await fetch('/api/hud-layouts', { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-edit-key': key } : {}), ...(session() ? { 'x-breneland-token': session() } : {}) }, body: JSON.stringify({ tablegame: Object.keys(tg).length ? tg : null }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { if (r.status === 401) { key = ''; try { localStorage.removeItem('breneland.editKey'); } catch { /* fine */ } keyRow.hidden = false; } status('Not saved: ' + (j.error || r.status), 'err'); return false; }
    saved = j.tablegame || null; dirty.clear();
    status('Saved to the game. Everyone gets it at the table on their next load.', 'good');
    return true;
  } catch (e) { status('Not saved: ' + e.message, 'err'); return false; }
}
saveBtn.onclick = () => save();
keyOk.onclick = () => { key = keyIn.value.trim(); try { localStorage.setItem('breneland.editKey', key); } catch { /* fine */ } keyRow.hidden = true; save(); };

// ---- the Table games button: this screen in the town editor's place (and the D&D table's screen out of the way)
function show(on) {
  if (on) { const dnd = $('#dnd-ed'); if (dnd && !dnd.hidden) $('#dnd-tab')?.click(); }
  ed.hidden = !on; $('#wrap').hidden = on; const tb = $('#toolbar'); if (tb) tb.hidden = on; const pk = $('.pick'); if (pk) pk.hidden = on;
  tab.classList.toggle('on', on); tab.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (on) { if (!saved && !dirty.size) load(); else render(); }
}
tab.onclick = () => show(ed.hidden);
$('#dnd-tab')?.addEventListener('click', () => { if (!ed.hidden) { ed.hidden = true; tab.classList.remove('on'); tab.setAttribute('aria-pressed', 'false'); } });
addEventListener('resize', () => { if (!ed.hidden) render(); });
if (/[?&]tablegame\b/.test(location.search)) show(true);
window.tgLayoutEditor = { get state() { return state; }, get form() { return form; }, get sel() { return sel; }, get k() { return k; }, get saved() { return saved; }, setForm, select: key2 => { sel = key2; render(); }, save, show, load };
