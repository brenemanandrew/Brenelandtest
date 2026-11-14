// The HUD layout engine: Andrew's saved layouts, placed on the real screen.
//
// The layouts are data (hud-layouts.js, generated from docs/refs/andrew-*-hud-layout*.json by tools/hud-part0-gen.mjs): every
// piece has x, y (frame px of the mockup editor he used, docs/refs/hud-mockups/*.html), a size (1 = the mockup's base size,
// BASE below) and, for the tool radial, a tilt. This module picks ONE layout for the device in your hands and places every
// piece from it; nothing else decides where a HUD piece goes.
//   Which layout: a pad in hand = 'pad'. Touch with the short side under 600 px (or any window 640 px or narrower) = a phone,
//   portrait or landscape by the window's shape. Other touch screens = the tablet (the iPad file near 4:3, the Surface file near
//   3:2). A keyboard and mouse = the PC (the 16:10 file or the 16:9 file, nearest aspect wins). It switches live on
//   input.onDevice and resize.
//   Where: k = the frame's scale on this screen (the smaller of width / frame width and height / frame height). Each piece is
//   anchored to the screen edge nearest its middle in the mockup (left / right / centre, top / bottom / middle), so the gap to
//   that edge scales with k and other shapes of the same device class stay sensible. A safe area (a notch, the home bar) pushes
//   an edge-hugging piece in. Sizes scale with k too (the mockup's proportions), text never below a floor (hud.css:
//   max(floor, k * size)).
//   When: on resize, on an input-device change, when the chat opens or closes and when the on-screen keyboard moves. Never per
//   frame (update() only flips classes when something changed).
// #hud attributes: data-hud = phone-portrait | phone-landscape | tablet | pc | pad (the layout), data-frame = the file variant
// (ipad, surface, 16x10, 16x9), data-layout = phone | pc | pad (the old three, which the mini-games' CSS still keys on: the
// tablet counts as pc there). CSS vars on #hud for feature CSS that sits "in a piece's place": --u (px per mockup px),
// --{slot,act,tools,map,chat,mic,log,smile,view}-{l,t,w,h,r,b} and --top-b (the bottom of the top HUD band), in #hud px. --slot-* is
// the spot Cast, Dive, RUN and the tower grip take (hud3: there is no jump button any more; this was the jump's place).
// ctx.hudLayout = this api: layoutId, layout, k, u, geom (id -> screen box), pivot(id), relayout(), onLayout(fn).
// Andrew's HUD Editor (public/editor/hud.html): a layout saved there (server: /api/hud-layouts, one JSON in DATA_DIR) lays over
// the built-in one piece by piece (loadHudLayouts() at boot, a piece the saved layout leaves out keeps the built-in's numbers),
// and may carry the wheels' own numbers: `wheel` (the emote wheel: R, sl, hub, a0, a1, and ro, ri for the PC's side fan) and
// `toolwheel` (the tool radial: R, sl, hub, a0, a1), frame px and degrees, used over the constants and the fitting below (the
// fans still close their arc to clear the screen's edge). `?hud-preview=1` reads the editor's unsaved layouts from localStorage
// instead (its Try it button). The editor's own pane drives `api.edit` (hud-edit.js).
import { LAYOUTS } from './hud-layouts.js';
import { HUD_ITEMS, ITEM_DEFAULTS } from './hud-items.js';
import { HUD_WORDS } from './controls-map.js';
import { WEATHER, LIGHT } from './daynight-mats.js';
import { el } from './util.js';
import { createClear } from './hud-clear.js';
import { createTips } from './hud-tips.js';

const WORD = { clear: 'Clear', cloudy: 'Cloudy', overcast: 'Overcast', fog: 'Fog', drizzle: 'Drizzle', rain: 'Rain', storm: 'Storm', snow: 'Snow', wind: 'Windy' }; // (the weather pill's word on hover, hud-tips.js)
const WX = { clear: 'sun', cloudy: 'cloud', overcast: 'cloud', fog: 'fog', drizzle: 'rain', rain: 'rain', storm: 'storm', snow: 'snow', wind: 'wind' };
const cToF = c => Math.round(c * 9 / 5 + 32);
const DEG = String.fromCharCode(176);

// The mockup pieces' base sizes (size 100) in frame px, measured from the editors (docs/refs/hud-mockups/*.html: each
// element's offsetWidth / offsetHeight, borders included). interact's round button sits at (22, 30) inside its 94 x 80 column
// (the words pill above it). The gamepad editor draws a few pieces bigger.
// (hud3, 2026-11-03: the items, their base sizes and how each is placed live in hud-items.js, which the HUD Editor and the server
// read too. The smiley is a round button in the cluster now; the view toggle, the action words and the slot, where Cast,
// Dive, RUN and the tower grip go, are new; the jump button is gone; no-coins: so is the coins pill)
const BASE = Object.fromEntries(Object.entries(HUD_ITEMS).map(([k, it]) => [k, it.base]));
const PAD_BASE = {
  ...BASE, name: [113, 32], fish: [45, 32], treats: [57, 32], chatlog: [270, 72], interact: [140, 34], slotx: [46, 46], sloty: [46, 46],
  chat: [252, 40], map: [132, 98], place: [83, 26], quests: [206, 120], questflare: [111, 34], logoff: [190, 112],
};
const PORTRAIT_BASE = { ...BASE, quests: [107, 38] }; // the portrait editor's pill says "Quests", the others "Fish to earn"
export const RADIAL_PIVOT = [104, 104];   // the tool radial turns about the middle of its straight edge (the tools button centre)
export const RADIAL_SLOTS = [[57, 19], [19, 57], [19, 111], [57, 149]]; // its four slots' top-left (40 x 40) in its 104 x 208 box
export const EMOTE_R = 66, EMOTE_SLOT = 40, EMOTE_HUB = 60; // the pad's ring with no numbers of its own: slot centres 66 px out, 40 px slots, a 60 px hub
const EMOTE_COUNT = 8;
// How every pop-out wheel works (hud3-wheels, 2026-11-03, Andrew: "The ui wheels on the iPad tablet view are how I want all the
// popout wheels to work. Buttons large but spaced. Close to their parent button."): his iPad's emote wheel, measured (its smiley
// 27.2 frame px, slots 32.5, centres 52 out, from 180 degrees round over the top to 126): a slot is 1.19 times the button it comes
// out of, the nearest slot's rim 0.68 of a slot from that button's rim, neighbours 0.19 of a slot apart. The built-in numbers of every
// layout are these scaled to its buttons (tools/hud3-wheels-layouts.mjs); a layout or wheel without numbers is fitted by them here,
// and the tool picker (hud-pad.js) by them always. No disc behind: a soft blur hugs the slots (hud.css).
export const WHEEL_LOOK = { sl: 32.5 / 27.2, near: 0.68, gap: 0.19, a0: -180, a1: 126 };
const DEG2 = Math.PI / 180;

// ---- the layouts saved from the HUD Editor (server, or the editor's unsaved ones for ?hud-preview=1), laid over the built-in
let SAVED = {};             // layoutId -> { els, wheel, toolwheel }
const OVERRIDE = {};        // the editor's live numbers (hud-edit.js), over the saved ones
let forcedId = '';          // the editor's pane shows the layout it asks for, whatever the window
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
function cleanSaved(j) {
  const out = {};
  if (!j || typeof j !== 'object') return out;
  for (const [id, L] of Object.entries(j)) {
    if (!LAYOUTS[id] || !L || typeof L !== 'object') continue;
    const els = {};
    const strip = !L.els?.weather; // (hud-loose: a layout saved before the clock and the weather were pills has no weather: its time is the old strip along the map's top, so the clock pill keeps its built-in spot over the map, the weather beside it)
    for (const [k, e] of Object.entries(L.els || {})) { if ((k === 'time' && strip) || !LAYOUTS[id].els[k] || !e || num(e.x) === null || num(e.y) === null) continue; els[k] = { x: e.x, y: e.y, s: num(e.s) ?? LAYOUTS[id].els[k].s, ...(num(e.a) !== null ? { a: e.a } : {}) }; }
    const nums = o => { if (!o || typeof o !== 'object') return null; const r = {}; for (const f of ['R', 'sl', 'hub', 'a0', 'a1', 'ro', 'ri']) if (num(o[f]) !== null) r[f] = o[f]; return Object.keys(r).length ? r : null; };
    out[id] = { els, wheel: nums(L.wheel), toolwheel: nums(L.toolwheel) };
  }
  return out;
}
/** Fetch the saved layouts once at boot (main.js awaits it before the HUD is built). Nothing saved, or offline: the built-in. */
export async function loadHudLayouts() {
  const qp = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (qp?.has('hud-preview')) { try { SAVED = cleanSaved(JSON.parse(localStorage.getItem('breneland.hudPreview') || 'null')); } catch { SAVED = {}; } return SAVED; }
  if (qp?.has('hud-edit')) return SAVED; // the editor's pane: its own numbers come by message, nothing saved underneath
  try { const r = await fetch('/api/hud-layouts', { cache: 'no-store' }); if (r.ok) SAVED = cleanSaved(await r.json()); } catch { /* the built-in */ }
  return SAVED;
}
/** Layouts saved while the game is up (owner-tiles: the server pushes every save, hud-live-edit.js): laid over the built-in as at
 *  boot; null for a layout = back to the built-in. The caller places the HUD again (relayout). */
export function mergeSaved(set) {
  if (!set || typeof set !== 'object') return SAVED;
  const clean = cleanSaved(set);
  for (const id of Object.keys(set)) { if (!LAYOUTS[id]) continue; if (clean[id]) SAVED[id] = clean[id]; else delete SAVED[id]; }
  return SAVED;
}
/** The layout in force: the built-in with the saved pieces and wheel numbers laid over it (the editor's live ones on top). */
export function effectiveLayout(id) {
  const base = LAYOUTS[id]; if (!base) return null;
  const s = SAVED[id], o = OVERRIDE[id];
  return { ...base, els: { ...(ITEM_DEFAULTS[id] || {}), ...base.els, ...(s?.els || {}), ...(o?.els || {}) }, wheel: o?.wheel ?? s?.wheel ?? base.wheel ?? null, toolwheel: o?.toolwheel ?? s?.toolwheel ?? base.toolwheel ?? null };
}

// which DOM element each layout id places, and how: box = width and height set; pill = height set, width from its words;
// log = width set, bottom kept (it grows upward); the rest are special (smiley, radial, wheel, typing)
const specOfItem = (k, it) => ({ sel: it.sel, kind: it.kind, ...(k === 'interact' ? { sub: [22, 30, 50, 50] } : {}), ...(k === 'place' ? { align: 'c' } : {}) });
const PAD_OVER = { quests: { sel: '#quests .qt-body', kind: 'panel' }, interact: { sel: '#btn-act', kind: 'pill' }, logoff: { sel: '#logoff', kind: 'panel', align: 'c' } };
/** How each item is placed on a layout (hud-items.js, run-time items too). */
export function specFor(layoutId) {
  const o = {}; for (const [k, it] of Object.entries(HUD_ITEMS)) if (it.kind !== 'gone') o[k] = specOfItem(k, it);
  return layoutId === 'pad' ? { ...o, ...PAD_OVER } : o;
}
export const SPEC = specFor('');
export const PAD_SPEC = specFor('pad');
// the pieces this engine owns: whatever a layout leaves out is hidden (.hud-off)
const OWNED = ['#quests .qt-head', '#quests .qt-body', '#hud-time', '#hud-wx', '#btn-help', '#online', '#minimap', '#place', '#chat-log', '#chat-form',
  '#mic-toggle', '#tg-emotes', '#btn-act', '#tg-tools', '#crosspad', '#emote-wheel', '#map', '#pad-name', '#pad-slot-x', '#pad-slot-y',
  '#logoff', '#quest-flare', '#currency .cur[data-id="fish"]', '#currency .cur[data-id="treat"]', '.lc-view'];
// popouts: placed like the rest but shown only on their trigger (their own modules show them)
export const POPOUT = new Set(Object.entries(HUD_ITEMS).filter(([, it]) => it.pop).map(([k]) => k));
const POPOUT_PAD = new Set([...POPOUT, 'quests']);

export function pickLayout(w, h, dev, coarse) {
  if (dev === 'pad') return 'pad';
  const touch = dev === 'touch' || coarse; // a coarse pointer is a touch screen even after a key press
  if (w <= 640 || (touch && Math.min(w, h) < 600)) return h >= w ? 'phone-portrait' : 'phone-landscape';
  const a = w / h;
  if (touch) return Math.abs(a - 4 / 3) <= Math.abs(a - 3 / 2) ? 'tablet-ipad' : 'tablet-surface';
  return Math.abs(a - 1.6) <= Math.abs(a - 16 / 9) ? 'pc-16x10' : 'pc-16x9';
}
const HUD_OF = id => id.startsWith('phone') ? id : id.startsWith('tablet') ? 'tablet' : id.startsWith('pc') ? 'pc' : 'pad';
const FRAME_OF = id => ({ 'tablet-ipad': 'ipad', 'tablet-surface': 'surface', 'pc-16x10': '16x10', 'pc-16x9': '16x9' })[id] || '';
const LEGACY_OF = id => id.startsWith('phone') ? 'phone' : id === 'pad' ? 'pad' : 'pc';
/** Every layout but the pad's opens the emote wheel as a fan out of the smiley in the cluster (hud-emotes.js asks this too),
 *  up and to the left over the screen, backed by a slice of a ring. The pad keeps its ring. */
export const fanLayout = id => id.startsWith('phone') || id.startsWith('tablet') || id.startsWith('pc');

export function createHudLayout(ctx) {
  const { input, ui, inventory } = ctx;
  const hud = document.getElementById('hud');
  const act = document.getElementById('btn-act');
  const chat = document.getElementById('chat');
  const chatIn = document.getElementById('chat-input');
  const focusTip = document.getElementById('hud-focus-tip');
  act.hidden = false; // the layout's CSS decides (can-act), not the attribute
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const $ = s => hud.querySelector(s);

  // ---- the safe area (env() read once per layout through a probe)
  const probe = el('div', 'hud-safe-probe'); hud.append(probe);
  const safeNow = () => { const c = getComputedStyle(probe); return { t: parseFloat(c.paddingTop) || 0, r: parseFloat(c.paddingRight) || 0, b: parseFloat(c.paddingBottom) || 0, l: parseFloat(c.paddingLeft) || 0 }; };

  // ---- the state
  let layoutId = '', L = null, k = 1, u = 1, Z = 1, vw = 0, vh = 0, safe = { t: 0, r: 0, b: 0, l: 0 };
  const geom = {};            // id -> { l, t, w, h } in screen px (what the tests and the other HUD modules read)
  const listeners = [];
  let frozen = null;          // while typing the frame keeps its size (a keyboard that resizes the page must not shrink the HUD)

  function base(id) { return (layoutId === 'pad' ? PAD_BASE : layoutId === 'phone-portrait' ? PORTRAIT_BASE : BASE)[id]; }
  // a piece's box on the screen (px), anchored to the edge nearest its middle in the mockup
  function boxOf(id) {
    const e = L.els[id]; if (!e) return null;
    const [FW, FH] = L.frame, [bw, bh] = base(id) || [40, 40];
    const fw = bw * e.s, fh = bh * e.s, w = fw * u, h = fh * u;
    const cx = (e.x + fw / 2) / FW, cy = (e.y + fh / 2) / FH;
    const ax = cx < 0.4 ? 'l' : cx > 0.6 ? 'r' : 'c', ay = cy < 0.4 ? 't' : cy > 0.6 ? 'b' : 'm';
    const l = ax === 'l' ? Math.max(e.x * k, safe.l) : ax === 'r' ? vw - Math.max((FW - e.x - fw) * k, safe.r) - w : vw / 2 + (e.x + fw / 2 - FW / 2) * k - w / 2;
    const t = ay === 't' ? Math.max(e.y * k, safe.t) : ay === 'b' ? vh - Math.max((FH - e.y - fh) * k, safe.b) - h : vh / 2 + (e.y + fh / 2 - FH / 2) * k - h / 2;
    return { l, t, w, h, ax, ay, s: e.s * u, a: e.a || 0 };
  }

  // The pieces that keep to the map (hud3): the clock strip along its top edge (as wide as the map, inset by its frame), the heart on
  // its bottom-right corner, the place name under its middle. Each keeps its offset from that spot in frame px, scaled, so moving or
  // sizing the map in the HUD Editor carries them along; moving one of them changes only its own offset.
  // (the offsets are measured against the layout's reference map, E and clock, `ref`: the hud3 built-in's, kept when the built-in
  // moved in hud3-wheels so a layout saved against them still lands where it was made; moving or sizing the map in the editor carries
  // them along unchanged)
  function mapped(id) {
    const B = { ...(LAYOUTS[layoutId]?.els || {}), ...(LAYOUTS[layoutId]?.ref || {}) };
    if (id === 'words' && L.els.interact && L.els.words && layoutId !== 'pad') { // (the action words keep to the E the same way)
      const bi = B.interact || L.els.interact, e = L.els.words, ib = boxOf('interact'), f = ib.w / base('interact')[0], [bw, bh] = base('words'), fw = bw * e.s, fh = bh * e.s;
      const El = ib.l + 22 * f, Ecy = ib.t + 55 * f, r = El + (e.x + fw - bi.x - 22 * bi.s) * k, cy = Ecy + (e.y + fh / 2 - bi.y - 55 * bi.s) * k;
      return { l: r - fw * u, t: cy - fh * u / 2, w: fw * u, h: fh * u, ax: 'r', ay: 'b', s: e.s * u, a: 0 };
    }
    if (id === 'distance' && L.els.breath && L.els.distance) { // (the maze's distance line keeps to its breath bar the same way, its middle
      // on the bar's: a safe area that pushes the bar down takes the line with it, as when they were one column)
      const bb0 = B.breath || L.els.breath, e = L.els.distance, bb = boxOf('breath'), cw = base('breath')[0], [bw, bh] = base('distance'), fw = bw * e.s, fh = bh * e.s;
      const cx = bb.l + bb.w / 2 + (e.x + fw / 2 - bb0.x - cw * bb0.s / 2) * k, t = bb.t + (e.y - bb0.y) * k;
      return { l: cx - fw * u / 2, t, w: fw * u, h: fh * u, ax: 'c', ay: 't', s: e.s * u, a: 0 };
    }
    if ((id === 'time' || id === 'weather') && L.els.map && L.els[id]) { // (hud-loose: the clock and the weather are pills that keep to the
      // map's top-right corner, the pad's too: their right end and their bottom; they take their width from their words)
      // (measured from the layout's reference for them, ref.pills: the built-in map when they were made, so a saved layout keeps them
      // where it was made if the built-in map moves later)
      const bm = LAYOUTS[layoutId]?.ref?.pills || L.els.map, e = L.els[id], mb = boxOf('map'), mw = base('map')[0] * bm.s, [bw, bh] = base(id), fw = bw * e.s, fh = bh * e.s;
      let r = mb.l + mb.w + (e.x + fw - bm.x - mw) * k, b = mb.t + (e.y + fh - bm.y) * k;
      // (at their built-in spot over a map that sits too high for them, so they would be cut off by the top or a notch: just left of its
      // top edge)
      const B0 = LAYOUTS[layoutId]?.els[id];
      if (B0 && B0.x === e.x && B0.y === e.y && B0.s === e.s && b - Math.max(fh * u, 22) < safe.t + 2) { r -= mb.w + 3 * k; b = mb.t + Math.max(fh * u, 22); }
      return { l: r - fw * u, t: b - fh * u, w: fw * u, h: fh * u, ax: 'r', ay: 'b', s: e.s * u, a: 0 };
    }
    if (!['online', 'place'].includes(id) || !L.els.map || !L.els[id] || layoutId === 'pad') return null;
    const bm = B.map || L.els.map, e = L.els[id], mb = boxOf('map'), [bw, bh] = base(id), mw = 116 * bm.s, mh = 84 * bm.s, fw = bw * e.s, fh = bh * e.s;
    if (id === 'online') { // (from the map's nearer bottom corner: Andrew keeps it on the bottom-left one, hud3 had it bottom right)
      const bt = mb.t + mb.h + (e.y + fh - bm.y - mh) * k;
      if (e.x + fw / 2 < bm.x + mw / 2) { const l = mb.l + (e.x - bm.x) * k; return { l, t: bt - fh * u, w: fw * u, h: fh * u, ax: 'l', ay: 't', s: e.s * u, a: 0 }; }
      const r = mb.l + mb.w + (e.x + fw - bm.x - mw) * k; return { l: r - fw * u, t: bt - fh * u, w: fw * u, h: fh * u, ax: 'r', ay: 't', s: e.s * u, a: 0 };
    }
    const cx = mb.l + mb.w / 2 + (e.x + fw / 2 - bm.x - mw / 2) * k, t = mb.t + mb.h + (e.y - bm.y - mh) * k;
    return { l: cx - fw * u / 2, t, w: fw * u, h: fh * u, ax: 'c', ay: 't', s: e.s * u, a: 0 };
  }
  // The action words (the 'words' piece): their right end and their middle go where the layout's box is, as offsets from the E
  // (hud.css: right and top on .act-name inside #btn-act), and hud-clear.js slides them further left if something of the cluster
  // would cover them, losing padding and then wrapping when they're long. Pad: inline in their own pill, as before.
  function placeWordsBox(node, b) {
    const s = node.style;
    if (layoutId === 'pad' || !geom.interact && !L.els.interact) { for (const p of ['--act-r', '--act-dy']) s.removeProperty(p); return; }
    const E = geom.interact || boxOf('interact');
    s.setProperty('--act-r', px(E.l - (b.l + b.w)));                 // (its right end, from the E's left edge)
    s.setProperty('--act-dy', px(b.t + b.h / 2 - (E.t + E.h / 2)));  // (its middle, from the E's middle)
    s.setProperty('--s', (b.s / Z).toFixed(3));
  }

  // write one piece's place (px / Z: #hud may be zoomed on a big screen, style.css)
  const px = v => (v / Z).toFixed(1) + 'px';
  function put(node, b, { width = true, height = true, alignX = null } = {}) {
    const s = node.style;
    const ax = alignX || b.ax;
    if (ax === 'r') { s.right = px(vw - b.l - b.w); s.left = 'auto'; } else if (ax === 'c') { s.left = px(b.l + b.w / 2); s.right = 'auto'; } else { s.left = px(b.l); s.right = 'auto'; }
    if (b.ay === 'b') { s.bottom = px(vh - b.t - b.h); s.top = 'auto'; } else { s.top = px(b.t); s.bottom = 'auto'; }
    s.width = width ? px(b.w) : ''; s.height = height ? px(b.h) : '';
    s.setProperty('--s', (b.s / Z).toFixed(3));
    node.classList.toggle('hud-cx', ax === 'c');
  }

  function apply(force) {
    const dev = input.lastDevice;
    if (frozen && !force) return placeTyping();
    vw = innerWidth; vh = innerHeight;
    const id = (forcedId && LAYOUTS[forcedId]) ? forcedId : pickLayout(vw, vh, dev, coarse);
    const changed = id !== layoutId;
    layoutId = id; L = effectiveLayout(id);
    if (changed) {
      hud.dataset.hud = HUD_OF(id); hud.dataset.frame = FRAME_OF(id); hud.dataset.layout = LEGACY_OF(id);
      hud.classList.remove('tools-open', 'tools-over');
      chatIn.placeholder = id === 'pad' ? 'Click right stick to chat' : id.startsWith('pc') ? 'Press Enter to chat' : 'Tap to chat';
    }
    Z = parseFloat(getComputedStyle(hud).zoom) || 1;
    safe = safeNow();
    const [FW, FH] = L.frame;
    k = Math.min(vw / FW, vh / FH);
    u = k;
    hud.style.setProperty('--u', (u / Z).toFixed(3));
    const spec = specFor(id);
    const pops = id === 'pad' ? POPOUT_PAD : POPOUT;
    // every owned piece starts hidden; the layout's pieces are placed and shown
    const on = new Set();
    for (const p of ['--s', '--act-r', '--act-dy']) actName?.style.removeProperty(p); // (the action words: placed again below, or as they were on the pad)
    for (const [lid, sp] of Object.entries(spec)) {
      if (!L.els[lid] || lid === 'typing') continue;
      if (sp.kind === 'slot' || sp.kind === 'anchor') { geom[lid] = mapped(lid) || boxOf(lid); continue; } // (a place, not a piece: the feature's CSS reads its vars)
      const node = $(sp.sel); if (!node) continue;
      const b = mapped(lid) || boxOf(lid); geom[lid] = b;
      on.add(sp.sel);
      if (sp.kind === 'panel') put(node, b, { height: false, alignX: sp.align }); // (a list: as wide as drawn, as tall as its lines)
      else if (sp.kind === 'box') {
        if (sp.sub) { // the interact column: the round button is the piece
          const [sx, sy, sw, sh] = sp.sub, f = b.w / base(lid)[0];
          const r = { ...b, l: b.l + sx * f, t: b.t + sy * f, w: sw * f, h: sh * f };
          geom[lid] = r; put(node, r);
        } else put(node, b);
      } else if (sp.kind === 'pill') put(node, b, { width: false, height: false, alignX: sp.align });
      else if (sp.kind === 'words') placeWordsBox(node, b);
      else if (sp.kind === 'log') { put(node, { ...b, ay: 'b' }, { height: false }); }
      else if (sp.kind === 'radial') placeRadial(node, b);
      else if (sp.kind === 'wheel') {
        // Phone, tablet and PC: the wheel fans out of the smiley in the cluster (placeFan, also as it opens). The pad: the ring, where
        // the layout puts it. The layout's emote box gives the size.
        const fan = fanLayout(id) && L.els.smiley;
        node.classList.toggle('side', !!fan); node.classList.toggle('hinged', !!fan);
        for (const k of ['ro', 'ri', 'pad', 'a0', 'a1']) delete node.dataset[k];
        if (fan) { node.classList.add('hud-pop'); continue; } // (placed after the nudge: placeFan below)
        const W = L.wheel; // the layout's numbers for this wheel (frame px, degrees), or null: the constants
        const sl = W?.sl ? W.sl * u : EMOTE_SLOT * b.s, hub = W?.hub ? W.hub * u : EMOTE_HUB * b.s, R = W?.R ? W.R * u : Math.max(EMOTE_R * b.s, sl * (1 + WHEEL_LOOK.gap) / (2 * Math.sin(Math.PI / EMOTE_COUNT)));
        node.style.left = px(b.l + b.w / 2); node.style.top = px(b.t + b.h / 2);
        geom.emoteWheel = { kind: 'ring', x: b.l + b.w / 2, y: b.t + b.h / 2, R, sl, hub };
        node.style.setProperty('--R', px(R)); node.style.setProperty('--sl', px(sl)); node.style.setProperty('--hub', px(hub)); node.style.setProperty('--s', (b.s / Z).toFixed(3));
      }
      node.classList.toggle('hud-pop', pops.has(lid));
    }
    for (const sel of OWNED) { const n = $(sel); if (n) n.classList.toggle('hud-off', !on.has(sel)); }
    if (L.els.typing) geom.typing = boxOf('typing');
    // the who-is-here list opens under (or over) its heart
    const who = $('#who'), ob = geom.online;
    if (who && ob) { who.style.right = px(vw - ob.l - ob.w); who.style.left = 'auto'; if (ob.t < vh / 2) { who.style.top = px(ob.t + ob.h + 10); who.style.bottom = 'auto'; } else { who.style.bottom = px(vh - ob.t + 10); who.style.top = 'auto'; } }
    // vars for feature CSS that sits in a piece's place
    for (const [name, lid] of [['slot', 'slot'], ['act', 'interact'], ['tools', 'tools'], ['map', 'map'], ['chat', 'chat'], ['mic', 'mic'], ['log', 'chatlog'], ['smile', 'smiley'], ['view', 'view']]) {
      const g = geom[lid];
      if (!g || !L.els[lid]) { for (const p of ['l', 't', 'w', 'h', 'r', 'b']) hud.style.removeProperty(`--${name}-${p}`); continue; }
      hud.style.setProperty(`--${name}-l`, px(g.l)); hud.style.setProperty(`--${name}-t`, px(g.t)); hud.style.setProperty(`--${name}-w`, px(g.w)); hud.style.setProperty(`--${name}-h`, px(g.h));
      hud.style.setProperty(`--${name}-r`, px(vw - g.l - g.w)); hud.style.setProperty(`--${name}-b`, px(vh - g.t - g.h));
    }
    // a feature's own places (hud-items.js 'anchor' items): their boxes as vars too
    for (const [lid, sp] of Object.entries(spec)) {
      if (sp.kind !== 'anchor') continue; const g = geom[lid];
      for (const p of ['l', 't', 'w', 'h', 'r', 'b']) hud.style.removeProperty(`--${lid}-${p}`);
      if (!g || !L.els[lid]) continue;
      hud.style.setProperty(`--${lid}-l`, px(g.l)); hud.style.setProperty(`--${lid}-t`, px(g.t)); hud.style.setProperty(`--${lid}-w`, px(g.w)); hud.style.setProperty(`--${lid}-h`, px(g.h));
      hud.style.setProperty(`--${lid}-r`, px(vw - g.l - g.w)); hud.style.setProperty(`--${lid}-b`, px(vh - g.t - g.h));
    }
    // the bottom of the top band (the minimap block and the pills along the top), for cards that must sit under it
    let topB = 0;
    for (const lid of ['quests', 'time', 'weather', 'help', 'online', 'map', 'place', 'name', 'fish', 'treats']) { const g = geom[lid]; if (g && L.els[lid] && !pops.has(lid) && g.t < vh * 0.4) topB = Math.max(topB, g.t + g.h); }
    hud.style.setProperty('--top-b', px(topB));
    nudge();
    placeFan();
    clear.popouts();
    placeTyping();
    for (const fn of listeners) { try { fn(api); } catch (e) { console.error(e); } }
    if (changed) relabel();
  }
  // Pills take their width from their words and never shrink their text below a floor, so on a small screen one can grow into a
  // neighbour drawn right beside it (the upright phone's ? and heart, fish over treats). Nudge the later one in this list clear
  // (margins on its anchored side; the minimap is never a neighbour, pills sit on it by design). Layout time only.
  // (the pills under the cluster are listed right to left, so a wide one pushes the next one along away from the ?)
  const NUDGE = ['help', 'tools', 'interact', 'chat', 'mic', 'smiley', 'slotx', 'sloty', 'quests', 'weather', 'time', 'online', 'name', 'fish', 'treats'];
  // (a pill whose words change width, the clock or the top quest, asks again through a ResizeObserver: no per-frame work)
  // (new words go through a MutationObserver: it runs before anything is drawn, so a long place name never shows off the edge
  // for a frame; the ResizeObserver catches the rest, a web font arriving say, also before the paint)
  const nudgeSoon = () => { if (L) nudge(); };
  const nudgeRO = typeof ResizeObserver === 'function' ? new ResizeObserver(nudgeSoon) : null;
  const nudgeMO = typeof MutationObserver === 'function' ? new MutationObserver(nudgeSoon) : null;
  const watched = new Set();
  // (a pill mid-pop is scaled and turned: measured then, it would push its neighbour too far, or a centred one not at all. So
  // every running animation on the pieces is seeked to its end, where it rests, for the measuring, and put back: one task, so
  // nothing is drawn in between.)
  function atRest(nodes, fn) {
    const held = [];
    for (const n of nodes) for (const a of n.getAnimations?.() || []) {
      const end = a.effect?.getComputedTiming?.().endTime;
      if (a.playState === 'running' && Number.isFinite(end)) { held.push([a, a.currentTime]); a.currentTime = end; }
    }
    try { fn(); } finally { for (const [a, t] of held) a.currentTime = t; }
  }
  function nudge() {
    const spec = specFor(layoutId);
    const items = NUDGE.filter(id => L.els[id] && !(layoutId === 'pad' && id === 'quests')).map(id => ({ id, node: $(spec[id].sel) })).filter(it => it.node);
    // (and every pill stays on the screen: a long place name centred under a minimap near the edge, Community Garden on an
    // upright phone, would run off it)
    const place = L.els.place && $(spec.place.sel);
    const keep = [...items.map(it => it.node), ...(place ? [place] : [])];
    for (const n of keep) if (!watched.has(n)) { watched.add(n); nudgeRO?.observe(n); nudgeMO?.observe(n, { childList: true, characterData: true, subtree: true }); }
    atRest(keep, () => { nudgeNow(items, place); onScreen(keep); fitChat(); });
    // then what still collides moves the least it can (hud-clear.js): the chat log, the key caps round their rims, the words
    clear.caps(); clear.words(); // (words() places the chat log too)
  }
  // The chat bar shares the bottom row with the pills on the upright phone: when big numbers (or a saved layout) push a pill into
  // it, the bar ends just short of the pill instead (its words have room to spare: "Tap to chat"). Layout time only.
  function fitChat() {
    const form = $('#chat-form'), g = geom.chat; if (!form || !g || !L.els.chat || chat.classList.contains('open')) return;
    form.style.width = px(g.w);
    const f = form.getBoundingClientRect(); let right = f.right;
    for (const sel of ['#currency .cur[data-id="treat"]', '#currency .cur[data-id="fish"]', '#btn-help']) {
      const n = $(sel); if (!n || n.closest('.hud-off')) continue; const r = n.getBoundingClientRect();
      if (r.width && r.left < right + 4 && r.right > f.left && r.top < f.bottom && r.bottom > f.top) right = Math.min(right, r.left - 4);
    }
    if (right < f.right) form.style.width = px(Math.max(f.width * 0.5, right - f.left));
  }
  function onScreen(nodes) {
    const m = 4;
    for (const n of nodes) {
      const r = n.getBoundingClientRect(); if (!r.width) continue;
      const dl = safe.l + m - r.left, dr = r.right - (vw - safe.r - m), dt = safe.t + m - r.top, db = r.bottom - (vh - safe.b - m);
      const s = n.style, right = s.right && s.right !== 'auto', bottom = s.bottom && s.bottom !== 'auto';
      const dx = dl > 0 ? dl : dr > 0 ? -dr : 0, dy = dt > 0 ? dt : db > 0 ? -db : 0;
      if (dx) { if (right) s.marginRight = ((parseFloat(s.marginRight) || 0) * Z - dx) / Z + 'px'; else s.marginLeft = ((parseFloat(s.marginLeft) || 0) * Z + dx) / Z + 'px'; }
      if (dy) { if (bottom) s.marginBottom = ((parseFloat(s.marginBottom) || 0) * Z - dy) / Z + 'px'; else s.marginTop = ((parseFloat(s.marginTop) || 0) * Z + dy) / Z + 'px'; }
    }
  }
  function nudgeNow(items, place) {
    for (const n of [...items.map(it => it.node), ...(place ? [place] : [])]) { const s = n.style; s.marginLeft = s.marginRight = s.marginTop = s.marginBottom = ''; }
    for (let pass = 0; pass < 2; pass++) {
      const r = items.map(it => it.node.getBoundingClientRect());
      for (let j = 1; j < items.length; j++) for (let i = 0; i < j; i++) {
        const a = r[i], b = r[j];
        if (!a.width || !b.width) continue;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox <= 1 || oy <= 1) continue;
        const s = items[j].node.style, Zp = v => (v / Z);
        // Pieces drawn in a row (their middles within half a height of each other: the clock, fish and treats on the upright phone) stay
        // in their row and part sideways, and pieces in a column part up or down. Only otherwise does the smaller overlap decide (the
        // live temperature's digits change the clock's width by a few px, and on the smaller overlap alone that flipped the treats from
        // beside the fish to under them, over the quest pill).
        const row = Math.abs(a.top + a.height / 2 - b.top - b.height / 2) < Math.min(a.height, b.height) / 2, col = !row && Math.abs(a.left + a.width / 2 - b.left - b.width / 2) < Math.min(a.width, b.width) / 2;
        if (row || (!col && ox < oy)) { // side by side: move it sideways, away
          const d = (b.left + b.width / 2 < a.left + a.width / 2 ? -1 : 1) * (ox + 3);
          if (s.right !== 'auto' && s.right) s.marginRight = Zp((parseFloat(s.marginRight) || 0) * Z - d) + 'px'; else s.marginLeft = Zp((parseFloat(s.marginLeft) || 0) * Z + d) + 'px';
        } else {
          const d = (b.top + b.height / 2 < a.top + a.height / 2 ? -1 : 1) * (oy + 3);
          if (s.bottom !== 'auto' && s.bottom) s.marginBottom = Zp((parseFloat(s.marginBottom) || 0) * Z - d) + 'px'; else s.marginTop = Zp((parseFloat(s.marginTop) || 0) * Z + d) + 'px';
        }
        r[j] = items[j].node.getBoundingClientRect();
      }
    }
  }
  // The emote fan (phone, tablet, PC): eight slots on an arc round the smiley in the cluster, like Andrew's iPad (WHEEL_LOOK): from
  // straight left round over the top and the right to down and a little left, the smiley its hub. The layout's numbers (frame px,
  // degrees: the built-in's are the iPad's scaled to its smiley, the HUD Editor's over them) are used as they are; an end of the arc
  // that would put its slot off the screen walks in, and then the fan reaches a little further so its slots keep the spacing they
  // were given. A soft blur hugs the slots (hud.css .wheel::before: data-ro / data-ri / data-pad say its reach). Layout time, and
  // when the wheel opens.
  function placeFan() {
    const node = $('#emote-wheel'), b = geom.emote;
    if (!node || !b || !L?.els.smiley || !fanLayout(layoutId) || !L.els.emote) return;
    const sb = geom.smiley || boxOf('smiley'), x0 = sb.l + sb.w / 2, y0 = sb.t + sb.h / 2, n = EMOTE_COUNT, m = 4;
    const W = L.wheel || {};
    const sl = W.sl ? W.sl * u : sb.w * WHEEL_LOOK.sl;
    let a0 = (W.a0 ?? WHEEL_LOOK.a0) * DEG2, a1 = (W.a1 ?? WHEEL_LOOK.a1) * DEG2;
    let R = W.R ? W.R * u : sb.w / 2 + sl * WHEEL_LOOK.near + sl / 2;
    const spread = () => Math.max(0.05, Math.abs(a1 - a0)), chord = 2 * R * Math.sin(spread() / (2 * (n - 1))); // (the spacing as given)
    // keep each slot on the screen: walk an end of the arc in while its slot would cross an edge, then reach out to keep the spacing
    const off = (a, r = R) => { const x = x0 + r * Math.cos(a), y = y0 + r * Math.sin(a), h = sl / 2 + m; return x - h < safe.l || x + h > vw - safe.r || y - h < safe.t || y + h > vh - safe.b; };
    const allOn = r => { for (let i = 0; i < n; i++) if (off(a0 + (a1 - a0) * i / (n - 1), r)) return false; return true; };
    const dir = Math.sign(a1 - a0) || 1;
    for (let it = 0; it < 4; it++) {
      for (let k = 0; k < 80 && off(a0) && spread() > 0.6; k++) a0 += dir * 0.03;
      for (let k = 0; k < 80 && off(a1) && spread() > 0.6; k++) a1 -= dir * 0.03;
      const want = Math.min(chord / (2 * Math.sin(spread() / (2 * (n - 1)))), R * 1.6);
      if (want <= R + 0.5 || !allOn(want)) break; // (never reach out past the edge to keep the spacing)
      R = want;
    }
    const bp = sl / 2 + 8, ro = R + bp, ri = Math.max(0, R - bp), pad = Math.asin(Math.min(1, bp / R));
    const hub = W.hub ? W.hub * u : sb.w;
    node.style.left = px(x0); node.style.top = px(y0);
    node.style.setProperty('--R', px(R)); node.style.setProperty('--sl', px(sl)); node.style.setProperty('--hub', px(hub)); node.style.setProperty('--s', (b.s / Z).toFixed(3));
    const d = node.dataset;
    d.a0 = a0.toFixed(4); d.a1 = a1.toFixed(4); d.ro = (ro / Z).toFixed(1); d.ri = (ri / Z).toFixed(1); d.pad = pad.toFixed(4);
    geom.emoteFan = { x: x0, y: y0, R, sl, a0, a1, ro, ri, pad };
    geom.emoteWheel = { kind: 'fan', x: x0, y: y0, R, sl, hub, a0, a1, ro, ri, parent: sb.w };
  }
  // the tool radial: four slots on an arc turning about the tools button, where the layout saved it (in the cluster; the pad has none:
  // X and Y are its slots), spaced like the iPad's wheels (WHEEL_LOOK) and a soft blur under them, no half disc
  function placeRadial(node, b) {
    const s = b.s;
    const cx = b.l + RADIAL_PIVOT[0] * s, cy = b.t + RADIAL_PIVOT[1] * s;
    const r = { l: cx - RADIAL_PIVOT[0] * s, t: cy - RADIAL_PIVOT[1] * s, w: 104 * s, h: 208 * s, ax: 'l', ay: 't', s };
    put(node, r);
    node.style.transformOrigin = `${px(RADIAL_PIVOT[0] * s)} ${px(RADIAL_PIVOT[1] * s)}`;
    node.style.transform = `rotate(${b.a}deg)`;
    node.style.setProperty('--a', b.a + 'deg');
    // its numbers: the layout's (frame px, degrees from straight left, + down), or fitted to the tools button like the iPad's wheels
    const T = L.toolwheel || {}, tb = L.els.tools ? boxOf('tools') : null, tw = tb ? tb.w : 40 * s;
    const a0 = (T.a0 ?? -67.5) * DEG2, a1 = (T.a1 ?? 67.5) * DEG2;
    const sl = T.sl ? T.sl * u : tw * 1.07;
    const R = T.R ? T.R * u : Math.max(tw / 2 + sl * WHEEL_LOOK.near + sl / 2, sl * (1 + WHEEL_LOOK.gap) / (2 * Math.sin(Math.abs(a1 - a0) / 6)));
    node.style.setProperty('--tsl', px(sl));
    node.querySelectorAll('.cp-arm').forEach((arm, i) => {
      const th = a0 + (a1 - a0) * i / 3;
      arm.style.setProperty('--ax', px(RADIAL_PIVOT[0] * s - R * Math.cos(th) - sl / 2)); arm.style.setProperty('--ay', px(RADIAL_PIVOT[1] * s + R * Math.sin(th) - sl / 2));
    });
    // the blur under the slots (hud.css #crosspad::before): a ring round the pivot, the arc's ends a little past the end slots
    // (the arms sit at 180 - th degrees from straight right, so at 270 - th on the blur's conic, which starts at the top)
    const bp = sl / 2 + 8, pad = Math.asin(Math.min(1, bp / R)) / DEG2, lo = Math.min(a0, a1) / DEG2, hi = Math.max(a0, a1) / DEG2;
    node.style.setProperty('--bx', px(RADIAL_PIVOT[0] * s)); node.style.setProperty('--by', px(RADIAL_PIVOT[1] * s));
    node.style.setProperty('--bro', px(R + bp)); node.style.setProperty('--bri', px(Math.max(0, R - bp)));
    node.style.setProperty('--b0', (270 - hi - pad).toFixed(1) + 'deg'); node.style.setProperty('--bs', (hi - lo + 2 * pad).toFixed(1) + 'deg'); node.style.setProperty('--bf', '5deg');
    geom.toolradial = { ...r, a: b.a, px: cx, py: cy, wheel: { R, sl, hub: R + bp, a0, a1 } };
  }
  // the typing bar: where the layout puts it, riding above an on-screen keyboard
  function placeTyping() {
    const form = $('#chat-form');
    const open = chat.classList.contains('open');
    const tb = L?.els.typing ? boxOf('typing') : null;
    if (!open || !tb) { if (geom.chat && L?.els.chat) put(form, geom.chat); return; }
    const vv = window.visualViewport;
    const kb = vv ? Math.max(0, innerHeight - (vv.height + vv.offsetTop)) : 0; // the keyboard over the page (iOS), 0 when it resized it
    const b = { ...tb, ay: 'b' };
    if (kb > 0) b.t = Math.min(b.t, innerHeight - kb - b.h - 8);
    geom.typing = b;
    put(form, b);
  }
  function relayout() { apply(true); }
  // The interact words, the key caps, the chat log and the pieces under an open popout keep clear of each other (hud-clear.js: no
  // piece ever covers another's words). The words are placed again when they change, when they show again (the radial folding) or
  // a web font changes their size (a ResizeObserver), the caps and the popouts when a popout opens or the caps are switched
  // (MutationObservers on the classes and the popouts' hidden). Never per frame.
  const actName = act.querySelector('.act-name');
  const clear = createClear({ hud, actName, atRest, state: () => ({ layoutId, L, vw, vh, safe, Z, geom }) });
  if (actName && typeof ResizeObserver === 'function') new ResizeObserver(() => { if (L) clear.words(); }).observe(actName);
  if (typeof MutationObserver === 'function') {
    let key = '';
    const popMO = new MutationObserver(() => {
      if (!L) return;
      const k = ['tools-open', 'no-kc', 'picking', 'dnd-strip'].map(c => hud.classList.contains(c) ? 1 : 0).join(''); // (dnd-strip: the D&D strip came or went, dnd.js)
      if (k !== key) { key = k; clear.caps(); clear.words(); }
      clear.bigmap(); clear.popouts();
    });
    popMO.observe(hud, { attributes: true, attributeFilter: ['class'] });
    for (const sel of ['#emote-wheel', '#map', '#tool-pick', '#logoff']) { const n = $(sel); if (n) popMO.observe(n, { attributes: true, attributeFilter: ['hidden'] }); }
    const q = $('#quests'); if (q) popMO.observe(q, { attributes: true, attributeFilter: ['class', 'hidden'] });
    const lg = $('#chat-log'); if (lg) popMO.observe(lg, { childList: true }); // (a line arriving while a popout is up: is it under it?)
  }

  const tips = createTips({ hud, layoutId: () => layoutId }); // (the PC's key tooltips: no caps on the buttons)
  addEventListener('resize', () => apply());
  window.visualViewport?.addEventListener('resize', () => { if (chat.classList.contains('open')) placeTyping(); });
  { const prev = input.onDevice; input.onDevice = d => { prev?.(d); apply(); relabel(); setTimeout(() => apply(true), 0); }; } // again once main.js has set body.pad (the TV zoom)
  // the chat swaps in the typing bar (and the layout holds still while the keyboard is up)
  chatIn.addEventListener('focus', () => { frozen = { vw, vh }; setTimeout(placeTyping, 0); });
  $('#chat-form').addEventListener('pointerdown', () => ui.wakeChat?.()); // (the quiet log comes back on a tap on the bar, as on a new line)
  chatIn.addEventListener('blur', () => { frozen = null; setTimeout(() => apply(true), 0); });
  if (typeof ResizeObserver === 'function') {
    // a pill whose words changed width (the clock, the place) never needs a re-layout (it is anchored by an edge or its middle);
    // the mic toggle and the pad's pieces are mounted later by their modules: place them when they arrive
    new MutationObserver(() => { if (!$('#mic-toggle')?.style.width && L) apply(true); }).observe(chat, { childList: true });
  }

  // ---- no jump button (hud3): Space on a keyboard, R1 on a pad, and on touch a quick still tap on the right half of the screen
  // (input.js onTap: short and still, never a look's release, never on a HUD button). Only when you are free to jump: playing, not
  // typing, no menu, nothing taking you over (a seat, the swing, the tower, a boat) and the tutorial not holding the controls.
  input.onTap = () => {
    if (ctx.mode !== 'play' || input.typing || input.overlayOpen || ctx.player?.takeover) return false;
    taps++; ctx.player?.jump?.(); return true;
  };
  let taps = 0;
  // ---- the pad's interact prompt wears the pad's own A (the round E elsewhere)
  let family = '';
  function relabel() {
    family = input.pad.family;
    ui.syncGlyphs?.();
  }

  // ---- the weather beside the clock (daynight.js mounts the clock pill in #hud-time)
  const timeBox = document.getElementById('hud-time');
  const wx = el('span', 'pill wx', '', { title: 'The weather in Arden, NC' });
  const wxIc = el('i', 'wx-ic'); const wxT = el('b', 'wx-t', '');
  wx.append(wxIc, wxT);
  // (hud-loose: the weather is a pill of its own beside the clock's, #hud-wx; it hides while there is no forecast)
  const wxBox = el('div', 'mm-time mm-wx', '', { id: 'hud-wx' }); wxBox.append(wx); timeBox.after(wxBox);
  timeBox.addEventListener('click', () => $('#minimap-open')?.click()); // (a tap on the clock opens the big map, as the strip along the map's top did)
  let wxKey = '', wxT0 = 0;

  // ---- per frame: cheap checks, DOM only when something changed
  let canAct = null, hasTools = null, words = null, padTip = null;
  const api = {
    name: 'hud-layout',
    get layout() { return LEGACY_OF(layoutId); },
    get layoutId() { return layoutId; },
    get hudClass() { return HUD_OF(layoutId); },
    get fan() { return fanLayout(layoutId); },
    get k() { return k; }, get u() { return u; }, get zoom() { return Z; },
    get taps() { return taps; }, // (right-half taps that jumped, for the tests)
    geom, LAYOUTS, tips,
    get frame() { return L?.frame; },
    els: () => L?.els || {},
    boxOf: id => (L ? mapped(id) || boxOf(id) : null),
    placeFan: () => { if (L) placeFan(); }, // (hud-emotes.js, as the wheel opens)
    apply: () => apply(true), relayout,
    get saved() { return SAVED; },
    // the wheels' numbers in force, in the frame's units (px at k = 1, degrees): what the HUD Editor starts from
    numbers() {
      const deg = a => (a == null ? null : Math.round(a / DEG2 * 10) / 10), f = v => (v == null ? null : Math.round(v / u * 10) / 10);
      const w = geom.emoteWheel, t = geom.toolradial?.wheel;
      return {
        wheel: w ? { kind: w.kind, R: f(w.R), sl: f(w.sl), hub: f(w.hub), a0: deg(w.a0), a1: deg(w.a1), ro: f(w.ro), ri: f(w.ri) } : null,
        toolwheel: t ? { R: f(t.R), sl: f(t.sl), hub: f(t.hub), a0: deg(t.a0), a1: deg(t.a1) } : null,
      };
    },
    // the HUD Editor's pane (hud-edit.js): show the layout it asks for, with its live numbers laid over the built-in
    edit: {
      get forced() { return forcedId; },
      force(id) { forcedId = LAYOUTS[id] ? id : ''; apply(true); },
      override(id, data) { if (data) OVERRIDE[id] = { els: data.els || {}, wheel: data.wheel || null, toolwheel: data.toolwheel || null }; else delete OVERRIDE[id]; if (id === layoutId) apply(true); },
    },
    onLayout(fn) { listeners.push(fn); },
    update(dt) {
      if (input.pad.family !== family) relabel();
      const can = !!ui.actWords || ui.promptOpen;
      if (can !== canAct) { canAct = can; hud.classList.toggle('can-act', can); }
      let tools = false;
      for (let i = 0; i < 4; i++) if (inventory.itemForArm(i)) { tools = true; break; }
      if (tools !== hasTools) { hasTools = tools; hud.classList.toggle('has-tools', tools); }
      const wd = ui.actWords || (ui.promptOpen ? 'Play' : '');
      if (wd !== words) { // something new to use: the glow pulses a few times (hud.css .act-pulse), then holds
        words = wd;
        hud.classList.remove('act-pulse');
        if (wd) { void hud.offsetWidth; hud.classList.add('act-pulse'); }
        clear.words();
      }
      if ((wxT0 -= dt) <= 0) { // the weather chip, a few times a minute is plenty
        wxT0 = 2;
        const t = WEATHER.tempC ?? api.demoTemp ?? null; // (demoTemp: the HUD Editor's pane has no forecast, hud-edit.js)
        let c = WX[WEATHER.condition] || 'sun';
        if (c === 'sun' && LIGHT.night > 0.5) c = 'moon';
        const key = c + (t == null ? '' : cToF(t));
        if (key !== wxKey) { wxKey = key; wxIc.className = 'wx-ic ' + c; wxT.textContent = t == null ? '' : cToF(t) + DEG; wx.hidden = t == null; const word = WORD[WEATHER.condition] || 'Clear'; wxBox.dataset.word = word; wx.title = `${word} in Arden, NC`; }
      }
      if (input.hudFocus !== padTip) {
        padTip = input.hudFocus;
        focusTip.hidden = !padTip;
        if (padTip) focusTip.textContent = `D-pad to move  ${input.pad.btnName('KeyE')} to press  ${input.pad.btnName('Escape')} to go back`;
      }
    },
    HUD_WORDS,
  };
  ctx.hudLayout = api;
  apply(true);
  return api;
}
