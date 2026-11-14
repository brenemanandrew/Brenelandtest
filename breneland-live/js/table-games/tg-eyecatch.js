// The table games' eyecatches (tg-look): short, clear moments that say what happened without reading. "Your turn" slides in
// over your hand (not in the way), a stamp thumps onto the board ("Double!", "Domino!", "Blocked!"), a ribbon for the round,
// confetti in the store's colours for the game. One at a time, never over a card (the rules, the round's end), a tap sends
// one on; a stale one is dropped rather than shown late. prefers-reduced-motion: no slides, no confetti.
import { el } from '../util.js';

const CONFETTI = ['#1f5560', '#e3aa45', '#ffd34d', '#e0463c', '#fff4dc', '#3f8fd9', '#4fa45a'];
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export function createEyecatch(frame) {
  const root = frame.root;
  const layer = el('div', 'tg-eyes', '', { 'aria-live': 'polite' });
  root.append(layer);
  const queue = [], log = [];
  let cur = null, timer = 0;
  const regionOf = q => { const e = root.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? r : null; };
  function place(node, r0, how) {
    if (!r0) return;
    const zr = root.getBoundingClientRect(), z = root.offsetWidth ? zr.width / root.offsetWidth : 1; // (the HUD's zoom on big screens)
    const r = { left: (r0.left - zr.left) / z, top: (r0.top - zr.top) / z, width: r0.width / z, height: r0.height / z };
    if (how === 'over-hand') { node.style.left = r.left + r.width / 2 + 'px'; node.style.top = r.top + 'px'; }
    else { node.style.left = r.left + r.width / 2 + 'px'; node.style.top = r.top + r.height * (how === 'top' ? 0.2 : 0.45) + 'px'; }
  }
  function show(item) {
    cur = item; item.shownAt = performance.now();
    const n = item.node = el('div', 'tg-eye tg-eye-' + item.kind, '', { role: 'status' });
    if (item.kind === 'turn') { n.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6z" fill="#ffd34d" stroke="#2b2340" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="19.5" r="2" fill="#2b2340"/></svg>'; n.append(el('b', '', item.text)); place(n, regionOf('.tg-hand'), 'over-hand'); }
    else if (item.kind === 'stamp') { n.append(el('b', '', item.text)); if (item.sub) n.append(el('small', '', item.sub)); n.style.setProperty('--c', item.color || '#e0463c'); place(n, regionOf('.tg-boardwrap'), 'mid'); n.onclick = () => next(); }
    else if (item.kind === 'ribbon') { n.append(el('b', '', item.text)); n.style.setProperty('--c', item.color || '#e0463c'); place(n, regionOf('.tg-boardwrap'), 'top'); n.onclick = () => next(); }
    if (reduced()) n.classList.add('still');
    layer.append(n);
    log.push({ kind: item.kind, text: item.text, at: Date.now() }); if (log.length > 40) log.shift();
    item.sound?.();
    clearTimeout(timer); timer = setTimeout(next, item.ms);
  }
  function next() {
    clearTimeout(timer);
    if (cur && cur.node) { const n = cur.node; n.classList.add('out'); setTimeout(() => n.remove(), 260); }
    cur = null;
    pump();
  }
  function pump() {
    if (cur || root.hidden) return;
    while (queue.length && performance.now() - queue[0].at > (queue[0].stale || 2500)) queue.shift();
    if (!queue.length) return;
    if (frame.modalKind && !queue[0].overCard) { setTimeout(pump, 250); return; } // (it waits for the card to go)
    show(queue.shift());
  }
  function add(item) {
    if (root.hidden) return;
    if (item.kind === 'turn' && (cur?.kind === 'turn' || queue.some(q => q.kind === 'turn'))) return;
    queue.push({ at: performance.now(), ...item }); pump();
  }
  // confetti over the overlay, under the card (a canvas of its own, a few seconds, then gone)
  function confetti() {
    log.push({ kind: 'confetti', at: Date.now() });
    if (reduced() || root.hidden) return;
    const c = el('canvas', 'tg-confetti'), W = root.clientWidth || innerWidth, H = root.clientHeight || innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr; root.append(c);
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const bits = Array.from({ length: Math.min(160, Math.round(W / 8)) }, (_, i) => ({ x: W * (0.15 + 0.7 * Math.random()), y: H * 0.35 + Math.random() * 40, vx: (Math.random() - 0.5) * 520, vy: -380 - Math.random() * 420, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: CONFETTI[i % CONFETTI.length] }));
    let t0 = performance.now(), tp = t0;
    const tick = now => {
      const dt = Math.min(0.05, (now - tp) / 1000); tp = now;
      g.clearRect(0, 0, W, H);
      const life = (now - t0) / 1000;
      for (const b of bits) { b.vy += 900 * dt; b.vx *= 0.99; b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt; g.save(); g.globalAlpha = Math.max(0, Math.min(1, 3.2 - life)); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.strokeStyle = '#2b2340'; g.lineWidth = 1; g.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore(); }
      if (life < 3.3 && c.isConnected) requestAnimationFrame(tick); else c.remove();
    };
    requestAnimationFrame(tick);
  }
  return {
    // "Your turn": over your hand, half a second in, a moment, out; never in the way of a tap
    turn: sound => add({ kind: 'turn', text: 'Your turn', ms: 1500, stale: 1200, sound }),
    stamp: (text, sub, o = {}) => add({ kind: 'stamp', text, sub, ms: o.ms || 1500, color: o.color, sound: o.sound, stale: 2600 }),
    ribbon: (text, o = {}) => add({ kind: 'ribbon', text, ms: o.ms || 2200, color: o.color, sound: o.sound, overCard: true }),
    confetti,
    clear() { queue.length = 0; next(); for (const c of root.querySelectorAll('.tg-confetti')) c.remove(); },
    get showing() { return cur ? { kind: cur.kind, text: cur.text, for: performance.now() - cur.shownAt } : null; },
    dismiss() { if (cur) next(); },
    log,
  };
}
