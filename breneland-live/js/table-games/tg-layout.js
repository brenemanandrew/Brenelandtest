// The table games' overlay frame as data (every game on the board-game base shares it), so Andrew moves and sizes it himself in
// the HUD Editor ("Table games": editor/tg-layout-editor.js), like the D&D table's (dnd-layout.js). Three forms: a phone upright,
// a PC sideways (a tablet too) and a phone on its side. A region is a box in fractions of the screen ({ x, y, w, h }); upright the
// 3D view's height (the split between the view and the panel); the view button a top left corner. What he saves
// (/api/hud-layouts, the `tablegame` key: { portrait, pc, phone }) lays over the built-in field by field. Plain data and maths, no
// DOM at load: the server validates a save with it too (validateTg).
export const FORMS = ['portrait', 'pc', 'phone'];
export const FRAMES = { portrait: { w: 390, h: 844 }, pc: { w: 1280, h: 720 }, phone: { w: 844, h: 390 } };
const SIDE = { bar: 'box', board: 'box', hand: 'box', acts: 'box', toggle: 'pt' };
export const REGIONS = { portrait: { view: 'view', ...SIDE }, pc: SIDE, phone: SIDE };
export const NAMES = { view: 'The 3D view', bar: 'Players strip', board: 'Board', hand: 'Your hand', acts: 'Buttons', toggle: 'View button' };
const FIELDS = { box: ['x', 'y', 'w', 'h'], view: ['h'], pt: ['x', 'y'] };
const RANGE = { x: [-0.2, 1.2], y: [-0.2, 1.2], w: [0.02, 1.2], h: [0.02, 1.2] };
const VIEW_H = [0.12, 0.8];
export const BUILTIN = {
  // 390 x 844: the 3D view's top 28%, then the players, the board, your hand and the buttons
  portrait: {
    view: { h: 0.28 },
    bar: { x: 0.02, y: 0.287, w: 0.96, h: 0.072 },
    board: { x: 0.02, y: 0.366, w: 0.96, h: 0.4 },
    hand: { x: 0.02, y: 0.773, w: 0.96, h: 0.117 },
    acts: { x: 0.02, y: 0.897, w: 0.96, h: 0.086 },
    toggle: { x: 0.025, y: 0.012 },
  },
  // 1280 x 720: the players along the top, the board in the middle, your hand under it and the buttons beside it; the table round
  pc: {
    bar: { x: 0.2, y: 0.014, w: 0.6, h: 0.09 },
    board: { x: 0.12, y: 0.115, w: 0.76, h: 0.56 },
    hand: { x: 0.12, y: 0.688, w: 0.61, h: 0.212 },
    acts: { x: 0.74, y: 0.688, w: 0.14, h: 0.212 },
    toggle: { x: 0.012, y: 0.02 },
  },
  // 844 x 390: the same, the buttons a column on the right
  phone: {
    bar: { x: 0.1, y: 0.015, w: 0.8, h: 0.135 },
    board: { x: 0.01, y: 0.165, w: 0.75, h: 0.575 },
    hand: { x: 0.01, y: 0.755, w: 0.75, h: 0.23 },
    acts: { x: 0.77, y: 0.165, w: 0.22, h: 0.82 },
    toggle: { x: 0.012, y: 0.02 },
  },
};
const num = (v, [lo, hi]) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const round = v => Math.round(v * 10000) / 10000;
export function validateForm(form, L) {
  const spec = REGIONS[form]; if (!spec) return { error: `unknown form ${String(form).slice(0, 20)}` };
  if (!L || typeof L !== 'object' || Array.isArray(L)) return { error: `${form}: a form is an object` };
  const out = {};
  for (const [k, v] of Object.entries(L)) {
    const kind = spec[k]; if (!kind) return { error: `${form}: unknown region ${String(k).slice(0, 20)}` };
    if (!v || typeof v !== 'object') return { error: `${form}.${k}: not a region` };
    const r = {};
    for (const f of FIELDS[kind]) { if (v[f] === undefined) continue; const rg = kind === 'view' ? VIEW_H : RANGE[f]; if (!num(v[f], rg)) return { error: `${form}.${k}.${f} must be ${rg[0]} to ${rg[1]}` }; r[f] = round(v[f]); }
    if (Object.keys(r).length) out[k] = r;
  }
  return { layout: out };
}
// the whole `tablegame` entry: { portrait?, pc?, phone? } (null for a form: back to the built-in)
export function validateTg(D) {
  if (!D || typeof D !== 'object' || Array.isArray(D)) return { error: 'tablegame is { portrait, pc, phone }' };
  const out = {};
  for (const [form, L] of Object.entries(D)) {
    if (form === 'savedAt') continue;
    if (!FORMS.includes(form)) return { error: `tablegame: unknown form ${String(form).slice(0, 20)}` };
    if (L === null) continue;
    const v = validateForm(form, L); if (v.error) return { error: 'tablegame.' + v.error };
    out[form] = v.layout;
  }
  return { layout: out };
}
export function layoutFor(form, saved) {
  const out = JSON.parse(JSON.stringify(BUILTIN[form])), S = saved && saved[form];
  if (!S || typeof S !== 'object') return out;
  for (const [k, kind] of Object.entries(REGIONS[form])) {
    const v = S[k]; if (!v || typeof v !== 'object') continue;
    for (const f of FIELDS[kind]) if (num(v[f], kind === 'view' ? VIEW_H : RANGE[f])) out[k][f] = v[f];
  }
  return out;
}
// which form this screen is: upright, else a phone on its side (short, or the HUD's phone layout), else a PC
export function formOf(w, h, hudLayout) { return h > w * 1.05 ? 'portrait' : h < 520 || hudLayout === 'phone' || hudLayout === 'phone-landscape' ? 'phone' : 'pc'; }
const pc = v => (v * 100).toFixed(3) + '%';
// the layout onto the overlay's root as CSS variables (table-games.css places every region from them)
export function applyLayout(root, form, L) {
  const st = root.style;
  for (const [k, kind] of Object.entries(REGIONS[form])) {
    const v = L[k];
    if (kind === 'box') { st.setProperty(`--${k}-x`, pc(v.x)); st.setProperty(`--${k}-y`, pc(v.y)); st.setProperty(`--${k}-w`, pc(v.w)); st.setProperty(`--${k}-h`, pc(v.h)); }
    else if (kind === 'view') st.setProperty('--view-h', pc(v.h));
    else if (kind === 'pt') { st.setProperty(`--${k}-x`, pc(v.x)); st.setProperty(`--${k}-y`, pc(v.y)); }
  }
  root.dataset.form = form;
}
let saving = null;
export function loadSaved() {
  if (!saving) saving = fetch('/api/hud-layouts', { cache: 'no-store' }).then(r => (r.ok ? r.json() : {})).then(j => (j && typeof j.tablegame === 'object' ? j.tablegame : null)).catch(() => null);
  return saving;
}
