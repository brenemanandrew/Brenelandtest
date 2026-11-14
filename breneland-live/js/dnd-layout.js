// The D&D table's layout as data, so Andrew moves and sizes it himself in the HUD Editor ("D&D table": dnd-layout-editor.js).
// Three forms: upright (a phone in portrait), a PC sideways (a tablet too) and a phone on its side. A region is a box in
// fractions of the screen ({ x, y, w, h }: left, top, width, height); upright the 3D view's height (the split between the view and
// the panel), the tools seal a centre and a size in px and the wheel a radius in px with its arc in degrees (0 = right, 90 = up);
// the view button a top left corner; the log's text size in px. What he saves (/api/hud-layouts, the `dnd` key:
// { portrait, pc, phone }) lays over the built-in field by field. Plain data and maths, no DOM at load: the server validates a
// save with it too (validateDnd).
export const FORMS = ['portrait', 'pc', 'phone'];
export const FRAMES = { portrait: { w: 390, h: 844 }, pc: { w: 1280, h: 720 }, phone: { w: 844, h: 390 } };
const SIDEWAYS = { party: 'box', pop: 'box', log: 'box', me: 'box', chat: 'box', tools: 'box', toggle: 'pt', font: 'font' };
export const REGIONS = {
  portrait: { view: 'view', party: 'box', log: 'box', pop: 'box', me: 'box', chat: 'box', seal: 'dot', wheel: 'wheel', toggle: 'pt', font: 'font' },
  pc: SIDEWAYS, phone: SIDEWAYS,
};
export const NAMES = { view: 'The 3D view', party: 'Party strip', log: 'Log', pop: 'Dice area', me: 'Your character', chat: 'Chat bar', seal: 'Tools seal', wheel: 'Tools wheel', tools: 'Toolbar', toggle: 'View button', font: 'Log text size' };
const FIELDS = { box: ['x', 'y', 'w', 'h'], view: ['h'], dot: ['x', 'y', 's'], wheel: ['r', 'a0', 'a1'], pt: ['x', 'y'] };
const RANGE = { x: [-0.2, 1.2], y: [-0.2, 1.2], w: [0.02, 1.2], h: [0.02, 1.2], s: [24, 160], r: [40, 480], a0: [-360, 360], a1: [-360, 360] };
const FONT = [10, 28];
export const BUILTIN = {
  // 390 x 844: the view's top 43%, then the log, the dice area, your character and the chat bar in the panel
  portrait: {
    view: { h: 0.43 },
    party: { x: 0.169, y: 0.009, w: 0.805, h: 0.062 },
    log: { x: 0.028, y: 0.445, w: 0.944, h: 0.318 },
    pop: { x: 0.028, y: 0.77, w: 0.944, h: 0.058 },
    me: { x: 0.028, y: 0.834, w: 0.944, h: 0.083 },
    chat: { x: 0.028, y: 0.923, w: 0.79, h: 0.066 },
    seal: { x: 0.9, y: 0.956, s: 56 },
    wheel: { r: 196, a0: 152, a1: 97 },
    toggle: { x: 0.026, y: 0.009 },
    font: 16,
  },
  // 1280 x 720: the log bottom left, your character bottom right, the dice area between them, the chat bar and the toolbar under
  pc: {
    party: { x: 0.053, y: 0.011, w: 0.937, h: 0.072 },
    pop: { x: 0.36, y: 0.56, w: 0.28, h: 0.33 },
    log: { x: 0.009, y: 0.514, w: 0.33, h: 0.381 },
    me: { x: 0.73, y: 0.768, w: 0.261, h: 0.126 },
    chat: { x: 0.009, y: 0.906, w: 0.72, h: 0.081 },
    tools: { x: 0.736, y: 0.906, w: 0.255, h: 0.081 },
    toggle: { x: 0.008, y: 0.011 },
    font: 15,
  },
  // 844 x 390: the same, tighter
  phone: {
    party: { x: 0.08, y: 0.01, w: 0.913, h: 0.118 },
    pop: { x: 0.345, y: 0.45, w: 0.31, h: 0.385 },
    log: { x: 0.007, y: 0.44, w: 0.33, h: 0.4 },
    me: { x: 0.664, y: 0.677, w: 0.329, h: 0.158 },
    chat: { x: 0.007, y: 0.85, w: 0.595, h: 0.135 },
    tools: { x: 0.607, y: 0.85, w: 0.386, h: 0.135 },
    toggle: { x: 0.012, y: 0.015 },
    font: 15,
  },
};
const num = (v, [lo, hi]) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const round = (v, f) => (f === 's' || f === 'r' || f === 'a0' || f === 'a1' ? Math.round(v * 10) / 10 : Math.round(v * 10000) / 10000);
// a saved form checked field by field: { layout } or { error } (the server refuses a bad save; the game drops a bad field)
export function validateForm(form, L) {
  const spec = REGIONS[form]; if (!spec) return { error: `unknown form ${String(form).slice(0, 20)}` };
  if (!L || typeof L !== 'object' || Array.isArray(L)) return { error: `${form}: a form is an object` };
  const out = {};
  for (const [k, v] of Object.entries(L)) {
    const kind = spec[k]; if (!kind) return { error: `${form}: unknown region ${String(k).slice(0, 20)}` };
    if (kind === 'font') { if (!num(v, FONT)) return { error: `${form}.font must be ${FONT[0]} to ${FONT[1]}` }; out.font = Math.round(v * 10) / 10; continue; }
    if (!v || typeof v !== 'object') return { error: `${form}.${k}: not a region` };
    const r = {};
    for (const f of FIELDS[kind]) { if (v[f] === undefined) continue; const rg = kind === 'view' && f === 'h' ? [0.15, 0.9] : RANGE[f]; if (!num(v[f], rg)) return { error: `${form}.${k}.${f} must be ${rg[0]} to ${rg[1]}` }; r[f] = round(v[f], f); }
    if (Object.keys(r).length) out[k] = r;
  }
  return { layout: out };
}
// the whole `dnd` entry: { portrait?, pc?, phone? } (null for a form: back to the built-in)
export function validateDnd(D) {
  if (!D || typeof D !== 'object' || Array.isArray(D)) return { error: 'dnd is { portrait, pc, phone }' };
  const out = {};
  for (const [form, L] of Object.entries(D)) {
    if (form === 'savedAt') continue;
    if (!FORMS.includes(form)) return { error: `dnd: unknown form ${String(form).slice(0, 20)}` };
    if (L === null) continue;
    const v = validateForm(form, L); if (v.error) return { error: 'dnd.' + v.error };
    out[form] = v.layout;
  }
  return { layout: out };
}
// the built-in form with a saved one laid over it (bad or missing fields keep the built-in)
export function layoutFor(form, saved) {
  const B = BUILTIN[form], out = JSON.parse(JSON.stringify(B)), S = saved && saved[form];
  if (!S || typeof S !== 'object') return out;
  for (const [k, kind] of Object.entries(REGIONS[form])) {
    const v = S[k]; if (v === undefined) continue;
    if (kind === 'font') { if (num(v, FONT)) out.font = v; continue; }
    if (!v || typeof v !== 'object') continue;
    for (const f of FIELDS[kind]) if (num(v[f], kind === 'view' && f === 'h' ? [0.15, 0.9] : RANGE[f])) out[k][f] = v[f];
  }
  return out;
}
// which form this screen is: upright, else a phone on its side (short, or the HUD's phone layout), else a PC
export function formOf(w, h, hudLayout) { return h > w * 1.05 ? 'portrait' : h < 520 || hudLayout === 'phone' || hudLayout === 'phone-landscape' ? 'phone' : 'pc'; }
const pc = v => (v * 100).toFixed(3) + '%';
// the layout onto the table's root as CSS variables (dnd.css places every region from them); the view button's corner goes on
// the HUD (it's the HUD's own button)
export function applyLayout(root, hud, form, L) {
  const st = root.style;
  for (const [k, kind] of Object.entries(REGIONS[form])) {
    const v = L[k];
    if (kind === 'box') { st.setProperty(`--${k}-x`, pc(v.x)); st.setProperty(`--${k}-y`, pc(v.y)); st.setProperty(`--${k}-w`, pc(v.w)); st.setProperty(`--${k}-h`, pc(v.h)); }
    else if (kind === 'view') st.setProperty('--view-h', pc(v.h));
    else if (kind === 'dot') { st.setProperty(`--${k}-x`, pc(v.x)); st.setProperty(`--${k}-y`, pc(v.y)); st.setProperty(`--${k}-s`, v.s + 'px'); }
    else if (kind === 'font') st.setProperty('--log-fs', v + 'px');
    else if (kind === 'pt' && hud) { hud.style.setProperty('--dnd-view-x', pc(v.x)); hud.style.setProperty('--dnd-view-y', pc(v.y)); }
  }
}
// where the DM's face should sit in the 3D view (a fraction from the view's top): halfway down the clear band between the party
// strip and, upright, the panel (the view's bottom), sideways the top of the dice area and the boxes
export function faceFraction(form, L) {
  const top = L.party.y + L.party.h;
  if (form === 'portrait') { const v = L.view.h; return Math.max(0.15, Math.min(0.8, (top + (v - top) * 0.45) / v)); }
  const low = Math.min(L.pop.y + L.pop.h * 0.35, L.log.y, L.me.y);
  return Math.max(0.15, Math.min(0.7, top + (low - top) * 0.45));
}
// what Andrew saved (fetched once; the built-in when there's nothing or no server)
let saving = null;
export function loadSaved() {
  if (!saving) saving = fetch('/api/hud-layouts', { cache: 'no-store' }).then(r => (r.ok ? r.json() : {})).then(j => (j && typeof j.dnd === 'object' ? j.dnd : null)).catch(() => null);
  return saving;
}
