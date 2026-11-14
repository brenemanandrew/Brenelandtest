// A radial wheel: the emote wheel (phone: the smiley on the left edge, pad: hold RT) and the tool wheel (pad: hold the tool button).
// Slots sit round a hub, the first at the top, clockwise. Tap or click a slot to pick it. On a pad the stick points at one (the last
// direction you pushed stays picked, so letting go of the stick first is fine) and letting go of the button picks it. Pure DOM, no
// per-frame allocation. The owner decides when it opens and closes.
//   const w = makeWheel(rootEl, { label, onPick(i) });  w.setItems([{ name, color, icon(el), empty? }])
//   w.open('touch' | 'pad', shape?); w.close(); w.isOpen; w.mode; w.stick(x, y) (pad: point with a stick, y down); w.picked (-1 = none)
// shape: 'ring' (the default, a full circle round the hub), 'fan' (the phone's emotes: a half circle right of the hub, which sits on
// the screen's left edge, top to bottom in slot order, no hub words or key numbers) or 'fan-up' (the PC's emotes: the same half
// circle above the hub, the smiley at the bottom centre, left to right).
// The owner may set the fan's arc on the root before open(): data-a0 / data-a1 (radians, 0 = straight right, + = down). hud-layout.js
// closes it so the end slots clear the edge, and on the PC tilts it up clear of the chat log.
// No disc behind the slots (hud3-wheels, Andrew: "the big grey circle needs to be either small or gone"): a soft blur hugs the
// slots' arc instead (hud.css .wheel::before, a frosted ring from just inside the slots to just outside, its ends just past the
// end slots). place() gives it the arc as --b0 / --bs (degrees, 0 = up, clockwise); data-pad (radians) is how far past the end
// slots it runs.
import { el } from './util.js';

const FAN_SPAN = Math.PI * 0.93; // the fan's arc: a little short of a half turn so the end slots stay clear of the top and bottom

export function makeWheel(root, { label = '', onPick = () => {}, hubWord = '' } = {}) {
  const ring = el('div', 'wh-ring');
  const hub = el('div', 'wh-hub');
  const hubName = el('b', 'wh-name', ''); const hubTip = el('small', 'wh-tip', '');
  hub.append(hubName, hubTip);
  root.append(ring, hub);
  let slots = [], items = [], n = 0, picked = -1, mode = '', shape = 'ring';

  function place() {
    const d = root.dataset, own = shape === 'fan' && d.a0 !== undefined && d.a1 !== undefined;
    const a0 = own ? Number(d.a0) : -FAN_SPAN / 2, a1 = own ? Number(d.a1) : FAN_SPAN / 2;
    slots.forEach((s, i) => {
      const fan = shape !== 'ring', right = shape === 'fan';
      const a = fan ? a0 + (n > 1 ? i / (n - 1) : 0.5) * (a1 - a0) : (i / n) * Math.PI * 2; // ring and fan-up: 0 = up, clockwise
      s.b.style.setProperty('--x', (right ? Math.cos(a) : Math.sin(a)).toFixed(3));
      s.b.style.setProperty('--y', (right ? Math.sin(a) : -Math.cos(a)).toFixed(3));
      s.b.style.setProperty('--i', String(i));
    });
    root.classList.toggle('fan', shape !== 'ring');
    root.classList.toggle('up', shape === 'fan-up');
    // the blur's arc: all the way round for the ring, else the fan's arc and a little past its end slots
    const pad = Number(d.pad) || 0.35, D = 180 / Math.PI;
    if (shape === 'ring' || n < 2) { root.style.setProperty('--b0', '0deg'); root.style.setProperty('--bs', '360deg'); root.style.setProperty('--bf', '0deg'); return; }
    const lo = Math.min(a0, a1) - pad, span = Math.min(2 * Math.PI, Math.abs(a1 - a0) + 2 * pad);
    root.style.setProperty('--b0', ((shape === 'fan' ? lo * D + 90 : lo * D)).toFixed(1) + 'deg'); // (conic: 0 = up; the fan's own 0 = right)
    root.style.setProperty('--bs', (span * D).toFixed(1) + 'deg'); root.style.setProperty('--bf', span >= 2 * Math.PI - 0.01 ? '0deg' : '5deg');
  }
  function setItems(list) {
    items = list;
    if (list.length !== n) {
      ring.replaceChildren();
      n = list.length;
      slots = list.map((_, i) => {
        const b = el('button', 'wh-slot', '', { type: 'button', role: 'menuitem' });
        const ic = el('span', 'wh-icon'); const k = el('span', 'wh-key', '');
        b.append(ic, k);
        b.onclick = e => { e.stopPropagation(); if (!items[i]?.empty) onPick(i); b.blur(); };
        b.onpointerenter = () => { if (mode !== 'pad') show(i); };
        ring.append(b);
        return { b, ic, k, id: null };
      });
      place();
    }
    list.forEach((it, i) => {
      const s = slots[i];
      if (s.id !== it.id) { s.id = it.id; s.ic.replaceChildren(); it.icon?.(s.ic); }
      s.b.style.setProperty('--c', it.color || 'var(--paper)');
      s.b.classList.toggle('empty', !!it.empty);
      s.b.setAttribute('aria-label', it.name);
      s.k.textContent = it.key || ''; s.b.dataset.key = it.key || ''; // (the PC's side fan names the key with the slot on hover: hud.css)
    });
    show(picked);
  }
  function show(i) {
    picked = i;
    slots.forEach((s, j) => s.b.classList.toggle('on', j === i));
    const it = items[i];
    hubName.textContent = it ? (it.empty ? 'Empty' : it.name) : label;
    hubTip.textContent = mode === 'pad' ? (it && !it.empty ? 'let go to pick' : 'point with a stick') : hubWord;
  }

  const api = {
    root, setItems,
    get isOpen() { return !root.hidden; },
    get mode() { return mode; },
    get shape() { return shape; },
    get picked() { return picked; },
    open(m, sh = 'ring') {
      mode = m;
      shape = sh; place(); // every time: the layout may have changed the fan's arc since
      root.dataset.mode = m;
      root.hidden = false;
      show(-1);
    },
    close() { if (root.hidden) return; root.hidden = true; mode = ''; picked = -1; },
    // a stick (x right, y down, -1..1): pointing far enough picks the slot that way
    stick(x, y) {
      if (Math.hypot(x, y) < 0.5 || !n) return;
      let a = Math.atan2(x, -y); if (a < 0) a += Math.PI * 2;
      const i = Math.round(a / (Math.PI * 2 / n)) % n;
      if (i !== picked) show(i);
    },
  };
  root.hidden = true;
  if (label) root.setAttribute('aria-label', label);
  return api;
}
// point a pad-mode wheel with whichever stick is pushed further (input.pad.sx / sy: left, right)
export function pointWith(wheel, pad) {
  const k = Math.hypot(pad.sx[1], pad.sy[1]) > Math.hypot(pad.sx[0], pad.sy[0]) ? 1 : 0;
  wheel.stick(pad.sx[k], pad.sy[k]);
}
