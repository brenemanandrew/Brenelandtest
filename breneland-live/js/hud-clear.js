// HUD clearances: no button, key cap, pill or popout ever sits over another piece's words. hud-layout.js places every piece where
// the saved layout puts it, then this moves only what collides, as little as it can:
//   - the interact words sit beside the E, left of the cluster (hud3), their right end clear of the mic or whatever else of the
//     cluster shares their band, growing leftward, losing some padding and then wrapping to two lines when room is short. Their
//     text never shrinks. (The pad's sit inline in their own pill and wrap.)
//   - a key cap (Space, Tab, G, H, J) that would sit on a neighbour moves round its own button's rim to the nearest free spot.
//   - the chat log keeps clear of the chat bar, the voice button and the emote smiley (it lifts, steps right or holds fewer lines).
//   - while a popout is open (the tool radial, the emote wheel, the big map, the open quest list, the tool picker, the log off
//     card) a piece with words under it steps aside (.pop-under) and comes back when it closes.
// Measuring happens on layout, when words or sizes change (observers) and when a popout opens or closes, never per frame.
// Everything here is in screen px. Styles are written divided by the #hud zoom (Z).

// a piece's shape on the screen: a box, or a circle for a round button
export function shapeOf(el) {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden') return null;
  const round = Math.abs(r.width - r.height) < 2 && (/50%/.test(cs.borderTopLeftRadius) || parseFloat(cs.borderTopLeftRadius) >= r.width / 2 - 1);
  return { x: r.left, y: r.top, w: r.width, h: r.height, round, el };
}
// do two shapes overlap (by more than tol px)?
export function hits(a, b, tol = 1) {
  if (a.round && b.round) return Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2) < a.w / 2 + b.w / 2 - tol;
  if (a.round || b.round) {
    const c = a.round ? a : b, q = a.round ? b : a, cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    return Math.hypot(Math.max(q.x, Math.min(cx, q.x + q.w)) - cx, Math.max(q.y, Math.min(cy, q.y + q.h)) - cy) < c.w / 2 - tol;
  }
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > tol && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > tol;
}
// the part of a shape's width inside the band y0..y1 (a circle is narrower near its top and bottom), or null
export function spanIn(o, y0, y1) {
  if (o.y >= y1 || o.y + o.h <= y0) return null;
  if (!o.round) return [o.x, o.x + o.w];
  const r = o.w / 2, cx = o.x + r, cy = o.y + r, dy = Math.abs(Math.max(y0, Math.min(cy, y1)) - cy);
  if (dy >= r) return null;
  const hw = Math.sqrt(r * r - dy * dy);
  return [cx - hw, cx + hw];
}

// the pieces other pieces keep clear of (each measured only when visible)
const PIECES = ['#tg-tools', '#tg-emotes', '#mic-toggle', '#chat-form', '#chat-log', '#currency .cur[data-id="fish"]', '#currency .cur[data-id="treat"]',
  '#minimap', '#place', '#hud-time', '#hud-wx', '#online', '#btn-help', '#quests .qt-head', '#pad-slot-x', '#pad-slot-y', '#pad-name', '#btn-act', '#btn-act .act-name', '#crosspad .cp-arm', '.lc-view', '.dnd-wstrip']; // (dnd-room-ui: the D&D strip on the chat bar while you watch)
// the key caps that ride a button's rim (the N sits inside the minimap's corner, where the north mark is; the E is the button)
const CAP_OWNERS = ['#tg-tools', '#tg-emotes', '#btn-help', '#quests .qt-head']; // (hud3: no caps are drawn, the keys show on hover; kept for a layout that draws them)
// the pieces with words that step aside under an open popout (the key caps too)
const TEXTS = ['#btn-act .act-name', '#place', '#hud-time', '#hud-wx', '#online', '#btn-help', '#quests .qt-head', '#currency .cur[data-id="fish"]', '#currency .cur[data-id="treat"]',
  '#chat-log', '#chat-form', '#pad-name', '#btn-act'];

export function createClear({ hud, actName, state, atRest }) {
  const $ = s => hud.querySelector(s);
  const px = v => (v / state().Z).toFixed(1) + 'px';
  const visible = el => !!el && !el.closest('.hud-off') && !!shapeOf(el);
  // the shapes of every visible piece and key cap, leaving out `skip` (an element and what is inside it)
  function obstacles(skip = [], caps = true) {
    const out = [];
    for (const sel of PIECES) for (const el of hud.querySelectorAll(sel)) {
      if (skip.some(s => s && (s === el || s.contains(el))) || el.closest('.hud-off')) continue;
      const sh = shapeOf(el); if (sh) out.push(sh);
    }
    if (caps) for (const k of hud.querySelectorAll('.kc')) {
      if (skip.some(s => s && s.contains(k)) || k.closest('.hud-off')) continue;
      const sh = shapeOf(k); if (sh) out.push(sh);
    }
    return out;
  }

  // ---- the interact words: beside the E, left of the cluster (the pad: centred in their own pill), clear of what shares their band
  function words() { placeWords(); log(); } // the chat log yields to the words, so it's placed again whenever they are
  function placeWords() {
    if (!actName) return;
    const { layoutId, vw, safe } = state();
    const s = actName.style;
    s.removeProperty('--act-shift'); s.setProperty('--act-max', 'none'); actName.classList.remove('act-tight', 'act-wrap');
    if (!layoutId) return;
    const pad = layoutId === 'pad'; // the pad's words sit inline in their own centred pill above the chat bar: it wraps, it doesn't slide
    const act = actName.parentElement;
    let r = actName.getBoundingClientRect(); if (!r.width) return; // hidden: asked again when it shows (the ResizeObserver)
    const right0 = r.right; // (where the layout's 'words' box puts their right end)
    const e = act.getBoundingClientRect(), ax = e.left + e.width / 2, chrome = pad ? e.width - r.width : 0;
    const obs = obstacles([act, $('#chat-log')]), m = 4, gap = 4; // (the chat log beside the words yields to them: log() below)
    const band = () => { const q = (pad ? act : actName).getBoundingClientRect(); return [q.top, q.bottom]; };
    // the room in the band: on the pad either side of the E's middle; beside the E, from the cluster's left end (walking left over
    // the E's neighbours in the band, the mic say) to whatever is next on the left
    const room = (y0, y1) => {
      const sps = obs.map(o => spanIn(o, y0 - 2, y1 + 2)).filter(Boolean);
      if (pad) {
        let lo = safe.l + m, hi = vw - safe.r - m;
        for (const sp of sps) { if ((sp[0] + sp[1]) / 2 >= ax) hi = Math.min(hi, sp[0] - gap); else lo = Math.max(lo, sp[1] + gap); }
        // (a pill against the screen's right edge grows left from it, one against the left grows right: hud3-wheels, Andrew's pad
        // has it bottom right, beside the mic)
        const anchor = act.classList.contains('hud-cx') ? 'c' : act.style.right && act.style.right !== 'auto' ? 'r' : 'l';
        if (anchor === 'r') return [lo + chrome, Math.max(e.right, lo + chrome + 40)];
        if (anchor === 'l') return [e.left, Math.max(hi - chrome, e.left + 40)];
        const h = Math.min(ax - lo, hi - ax) - chrome / 2; return [ax - h, Math.max(ax + h, ax - h + 40)];
      }
      let hi = right0;
      for (let moved = true, it = 0; moved && it < 12; it++) { moved = false; for (const sp of sps) if (sp[0] < hi && sp[1] > hi - gap) { hi = sp[0] - gap; moved = true; } }
      let lo = safe.l + m;
      for (const sp of sps) if (sp[1] <= hi) lo = Math.max(lo, sp[1] + gap);
      return [lo, Math.max(hi, lo + 40)];
    };
    let [lo, hi] = room(...band());
    if (!pad && r.width > hi - lo) { actName.classList.add('act-tight'); r = actName.getBoundingClientRect(); }
    for (let it = 0; it < 3 && r.width > hi - lo + 0.5; it++) { // two lines (or more)
      actName.classList.add('act-wrap'); s.setProperty('--act-max', px(hi - lo));
      r = actName.getBoundingClientRect();
      [lo, hi] = room(...band());
    }
    if (actName.classList.contains('act-wrap')) { s.setProperty('--act-max', px(hi - lo)); r = actName.getBoundingClientRect(); }
    if (!pad && Math.abs(hi - r.right) > 0.5) s.setProperty('--act-shift', px(hi - r.right)); // its right end at the room's right end
  }

  // ---- key caps: each where hud.css puts it, unless that is on a neighbour; then round its own button's rim to the nearest free spot
  function caps() {
    const { vw, vh } = state();
    const list = [];
    for (const sel of CAP_OWNERS) { const o = $(sel), c = o?.querySelector(':scope > .kc'); if (c) { c.style.left = c.style.top = ''; list.push([o, c]); } }
    const on = list.filter(([o, c]) => visible(o) && visible(c));
    if (!on.length) return;
    const slots = [...hud.querySelectorAll('#crosspad .cp-arm')];
    atRest(slots, () => {
      for (const [o, c] of on) {
        const obs = obstacles([o, actName]).filter(q => q.el !== c);
        const cr = c.getBoundingClientRect();
        if (!obs.some(q => hits({ x: cr.left, y: cr.top, w: cr.width, h: cr.height }, q)) && cr.left >= 0 && cr.top >= 0 && cr.right <= vw && cr.bottom <= vh) continue;
        // round the rim: the same distance from the button's middle (an ellipse through where it sits, for a pill)
        const or = o.getBoundingClientRect(), A = or.width / 2, B = or.height / 2, ocx = or.left + A, ocy = or.top + B;
        const ex = (cr.left + cr.width / 2 - ocx) / A, ey = (cr.top + cr.height / 2 - ocy) / B, a0 = Math.atan2(ex, -ey), rn = Math.hypot(ex, ey);
        for (let k = 1; k <= 12; k++) for (const sg of [1, -1]) {
          const a = a0 + sg * k * Math.PI / 12;
          const box = { x: ocx + A * rn * Math.sin(a) - cr.width / 2, y: ocy - B * rn * Math.cos(a) - cr.height / 2, w: cr.width, h: cr.height };
          if (box.x < 2 || box.y < 2 || box.x + box.w > vw - 2 || box.y + box.h > vh - 2 || obs.some(q => hits(box, q))) continue;
          const cs = getComputedStyle(c), Z = state().Z;
          c.style.left = ((parseFloat(cs.left) || 0) + (box.x - cr.left) / Z).toFixed(1) + 'px';
          c.style.top = ((parseFloat(cs.top) || 0) + (box.y - cr.top) / Z).toFixed(1) + 'px';
          k = 99; break;
        }
      }
    });
  }

  // ---- the chat log: the box its lines may fill (its max height up from its bottom) keeps clear of the pieces round it
  function log() {
    const { geom, L, Z } = state();
    const el = $('#chat-log'), g = geom.chatlog;
    if (!el || !g || !L?.els.chatlog) return;
    const s = el.style; s.marginLeft = s.marginBottom = s.maxHeight = '';
    const maxH = parseFloat(getComputedStyle(el).maxHeight) * Z;
    if (!(maxH > 0)) return;
    let left = g.l, bottom = g.t + g.h, top = bottom - maxH;
    const obs = obstacles([el], false).filter(o => o.el.id !== 'minimap' && !o.el.classList.contains('cp-arm')); // the radial is a popout, see popouts()
    const smiley = obs.find(o => o.el.id === 'tg-emotes');
    const box = () => ({ x: left, y: top, w: g.w, h: bottom - top });
    // the smiley peeks in from the left edge: beside the log's lines the log steps right of it, above them the log holds fewer
    if (smiley && hits(box(), smiley)) {
      const sm = { ...smiley, w: smiley.x + smiley.w - Math.max(0, smiley.x), x: Math.max(0, smiley.x), round: false }; // what shows of it
      if (bottom - (sm.y + sm.h) >= maxH * 0.45) top = sm.y + sm.h + 4; else left = sm.x + sm.w + 4; // room for two lines under it
    }
    for (const o of obs) {
      if (o === smiley || !hits(box(), o)) continue;
      if (o.y + o.h / 2 > top + (bottom - top) / 2) bottom = Math.min(bottom, o.y - 3); else top = Math.max(top, o.y + o.h + 3);
    }
    if (left !== g.l) s.marginLeft = px(left - g.l);
    if (bottom !== g.t + g.h) s.marginBottom = px(g.t + g.h - bottom);
    if (bottom - top < maxH - 0.5) s.maxHeight = px(Math.max(bottom - top, 0));
  }

  // ---- popouts: a piece with words drawn under an open one steps aside until it closes
  const zOf = el => { let z = 0; for (let n = el; n && n !== hud; n = n.parentElement) { const v = parseInt(getComputedStyle(n).zIndex, 10); if (Number.isFinite(v)) z = v; } return z; };
  // (hud3-wheels: no discs behind the wheels: a wheel covers its slots and the soft blur that hugs them, a ring from ri to ro round
  // its middle over its arc, b0 and bs in degrees from straight up, clockwise, as hud.css draws it; and the pad's ring its hub)
  const ringAt = (cx, cy, ri, ro, b0, bs) => (x, y) => {
    const q = Math.hypot(x - cx, y - cy); if (q > ro || q < ri) return false;
    if (bs >= 359.9) return true;
    const a = ((Math.atan2(x - cx, -(y - cy)) * 180 / Math.PI - b0) % 360 + 360) % 360;
    return a <= bs;
  };
  const degOf = (el, v) => parseFloat(el.style.getPropertyValue(v)) || 0;
  function popShapes() {
    const out = [], Z = state().Z, { geom } = state();
    const cp = $('#crosspad'), g = geom.toolradial;
    if (hud.classList.contains('tools-open') && visible(cp) && g?.wheel) {
      const { R, sl } = g.wheel, bp = sl / 2 + 8;
      out.push({ el: cp, z: zOf(cp), at: ringAt(g.px, g.py, Math.max(0, R - bp), R + bp, degOf(cp, '--b0') + (g.a || 0), degOf(cp, '--bs')) }); // (the radial is turned by its tilt)
    }
    const wh = $('#emote-wheel');
    if (wh && !wh.hidden) {
      const r = wh.getBoundingClientRect(), cs = getComputedStyle(wh), R = parseFloat(cs.getPropertyValue('--R')) * Z, sl = parseFloat(cs.getPropertyValue('--sl')) * Z, bp = sl / 2 + 8 * Z;
      const ring = ringAt(r.left, r.top, Math.max(0, R - bp), R + bp, degOf(wh, '--b0'), wh.classList.contains('fan') ? degOf(wh, '--bs') : 360);
      const hubEl = wh.querySelector('.wh-hub'), hub = hubEl && getComputedStyle(hubEl).display !== 'none' ? parseFloat(cs.getPropertyValue('--hub')) * Z / 2 : 0;
      out.push({ el: wh, z: zOf(wh), at: (x, y) => ring(x, y) || Math.hypot(x - r.left, y - r.top) <= hub });
    }
    for (const sel of ['#map', '#quests .qt-body', '#logoff']) {
      const el = $(sel); if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      out.push({ el, z: zOf(el), at: (x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom });
    }
    const tp = $('#tool-pick');
    if (tp && !tp.hidden) {
      const r = tp.getBoundingClientRect(), pr = parseFloat(tp.style.getPropertyValue('--pr')) * Z, ps = parseFloat(tp.style.getPropertyValue('--ps')) * Z, bp = ps / 2 + 8 * Z;
      const ring = ringAt(r.left, r.top, Math.max(0, pr - bp), pr + bp, degOf(tp, '--b0'), degOf(tp, '--bs')), w = tp.querySelector('.tp-word')?.getBoundingClientRect();
      out.push({ el: tp, z: zOf(tp), at: (x, y) => ring(x, y) || (!!w && w.width > 0 && x >= w.left - 4 && x <= w.right + 4 && y >= w.top - 4 && y <= w.bottom + 4) });
    }
    return out;
  }
  // the boxes of a piece's words (its text, clipped to the piece; a key cap's letters belong to the cap; the chat bar's input)
  function wordBoxes(t) {
    const r = t.getBoundingClientRect(), out = [];
    if (t.id === 'chat-log') return [{ left: r.left, top: r.top, width: r.width, height: r.height }]; // its lines come and go, so the whole card
    const cut = q => { const x = Math.max(q.left, r.left), y = Math.max(q.top, r.top), x2 = Math.min(q.right, r.right), y2 = Math.min(q.bottom, r.bottom); if (x2 - x > 1 && y2 - y > 1) out.push({ left: x, top: y, width: x2 - x, height: y2 - y }); };
    const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const own = n.parentElement.closest('.kc, .act-name'); // a key cap's letters and the interact words are pieces of their own
      if (!n.data.trim() || (own && own !== t && t.contains(own))) continue;
      const g = document.createRange(); g.selectNodeContents(n);
      for (const q of g.getClientRects()) cut(q);
    }
    for (const i of t.querySelectorAll('input')) cut(i.getBoundingClientRect());
    return out;
  }
  function popouts() {
    for (const n of hud.querySelectorAll('.pop-under')) n.classList.remove('pop-under');
    const pops = popShapes(); if (!pops.length) return;
    const arms = [...hud.querySelectorAll('#crosspad .cp-arm')];
    let slots = [];
    if (pops.some(p => p.el.id === 'crosspad')) atRest(arms, () => { slots = arms.map(shapeOf).filter(Boolean); }); // where they rest, not mid pop-in
    const texts = [...TEXTS.flatMap(s => [...hud.querySelectorAll(s)]), ...hud.querySelectorAll('.kc')];
    for (const t of texts) {
      if (!visible(t) || pops.every(p => p.el.contains(t))) continue;
      const z = zOf(t);
      const live = pops.filter(p => !(p.el.contains(t) || z > p.z || (t.closest('#tg-tools') && p.el.id === 'crosspad') || (t.closest('#quests') && p.el.closest('#quests')))); // drawn over it, or its own pill: not covered
      if (!live.length) continue;
      // only its words count: a popout over a pill's icon or rim is fine (a grid every 5 px over each word box)
      let under = false;
      for (const r of wordBoxes(t)) {
        const nx = Math.max(2, Math.ceil(r.width / 5)), ny = Math.max(2, Math.ceil(r.height / 5));
        for (let i = 0; i <= nx && !under; i++) for (let j = 0; j <= ny && !under; j++) { const x = r.left + r.width * i / nx, y = r.top + r.height * j / ny; under = live.some(p => p.at(x, y)); }
        if (under) break;
      }
      // and no radial slot (a button of its own) on the piece at all
      if (!under && live.some(p => p.el.id === 'crosspad')) { const b = shapeOf(t); under = !!b && slots.some(sh => hits(sh, b)); }
      if (under) t.classList.add('pop-under');
    }
  }

  // ---- the big map's own place name (its top-left corner) moves to another corner when a pill drawn over the map sits there
  function bigmap() {
    const map = $('#map'), bp = map?.querySelector('.bm-place');
    if (!bp) return;
    bp.style.left = bp.style.top = bp.style.right = bp.style.bottom = '';
    if (!visible(map) || !visible(bp)) return;
    const z = zOf(map), mr = map.getBoundingClientRect();
    const obs = obstacles([map]).filter(o => zOf(o.el) > z);
    for (const el of [$('#quest-flare'), map.querySelector('.bm-close')]) { const sh = visible(el) && shapeOf(el); if (sh) obs.push(sh); }
    const r = bp.getBoundingClientRect(), gx = r.left - mr.left, gy = r.top - mr.top; // its gap from the map's edge
    const at = [[r.left, r.top], [r.left, mr.bottom - gy - r.height], [mr.right - gx - r.width, mr.bottom - gy - r.height], [mr.right - gx - r.width, r.top]];
    const free = at.find(([x, y]) => !obs.some(o => hits({ x, y, w: r.width, h: r.height }, o)));
    if (!free || free === at[0]) return;
    const Z = state().Z, cs = getComputedStyle(bp);
    bp.style.left = ((parseFloat(cs.left) || 0) + (free[0] - r.left) / Z).toFixed(1) + 'px';
    bp.style.top = ((parseFloat(cs.top) || 0) + (free[1] - r.top) / Z).toFixed(1) + 'px';
  }

  return { words, caps, log, popouts, bigmap, obstacles };
}
