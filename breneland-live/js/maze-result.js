// Beneath Angell Street: the end of a run, up in the yard. The server sends the member who left their result ({ t: 'maze', op:
// 'result', escaped, taken, ms, m, of, grabs, fish, fishWhy, place, account, ... }, lib/maze-board.js, from the walk it believed).
// Escaped: out of the daylight into the back garden, a small celebration round you (warm motes and petals rising, then drifting
// down) and a card with your time, your grabs, the day's fish and your place today. Taken: after the wake in front of the main
// house (maze-ghoul.js), once you have your legs back, a short card: how far you got, your place today, a hint for next time. A
// guest is told an account keeps a place on the board. maze.js asks `ctx.mazeResult.exited()` as you come up the flight. An exit
// the server didn't believe (or no answer) gets the plain way-out toast instead.
import * as THREE from 'three';
import { soft } from './toon.js';
import { el, loadCss } from './util.js';
import { timeText } from './maze-board.js';

const ord = n => { const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'; return n + s; };
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const N = 90, LIFE = 4.6;
// the week's goal, met, in the escape card's line (w16-goals)
const GOAL_DONE = { signs: 'The seal broken, up the old stair and out into the daylight.', oil: 'The beacon lit, up the old stair and out into the daylight.', scout: 'The lost scout safe, up the old stair and out into the daylight.', book: "The Professor's book in hand, up the old stair and out into the daylight.", pages: 'Four pages of the Necronomicon in hand, up the old stair and out into the daylight.' };

export function createMazeResult(ctx) {
  const { net, ui, player, input, audio, scene } = ctx;
  loadCss('/css/maze-board.css');
  let exitWait = 0, escPending = false, pendingTaken = null, last = null, closeAt = 0;

  // ---- the card
  const card = el('div', 'mzr-card', '', { hidden: '', role: 'dialog', 'aria-label': 'Your run' });
  ctx.hud.append(card);
  const ok = el('button', 'btn mzr-ok', 'OK', { type: 'button' });
  ok.onclick = () => hideCard();
  function show(kind, r) {
    card.replaceChildren();
    card.className = 'mzr-card ' + kind;
    card.append(el('div', 'mzr-kick', 'Beneath Angell Street'));
    const placeLine = r.account ? (r.place ? `${ord(r.place)} on today's board` : '') : 'Make an account to be on the board.';
    if (kind === 'esc') {
      card.append(el('div', 'mzr-title', 'You escaped!'), el('p', 'mzr-line', GOAL_DONE[r.goal] || 'Up the old stair and out into the daylight.')); // (the week's goal, met: w16-goals)
      const t = el('div', 'mzr-time', timeText(r.ms)); t.append(el('small', '', 'your time')); card.append(t);
      const st = el('div', 'mzr-stats');
      st.append(el('span', 'mzr-pill', r.grabs ? `${r.grabs} ${r.grabs === 1 ? 'grab' : 'grabs'}` : 'No grabs!'));
      if (r.account && r.place) st.append(el('span', 'mzr-pill', placeLine));
      card.append(st);
      if (r.fishWhy === 'paid') { const f = el('div', 'mzr-fish big', `+${r.fish} fish`); card.append(f, el('p', 'mzr-tip', 'The first escape of the day pays ten fish.')); }
      else if (r.fishWhy === 'cap') card.append(el('div', 'mzr-fish', "Today's fish already caught. Your time still counts on the board!"));
      else card.append(el('div', 'mzr-fish', 'Make an account to earn the fish and be on the board.'));
    } else {
      card.append(el('div', 'mzr-title', 'Taken!'), el('p', 'mzr-line', 'The ghoul got you this time. You were brave to go down there.'));
      card.append(el('p', 'mzr-line', `You got ${r.m} m of the ${r.of} m.`));
      const bar = el('div', 'mzr-bar'), fill = el('i'); fill.style.width = Math.round(100 * Math.min(1, r.of ? r.m / r.of : 0)) + '%'; bar.append(fill); card.append(bar);
      if (placeLine) card.append(el('p', 'mzr-line', r.account ? `That puts you ${ord(r.place)} today.` : placeLine));
      card.append(el('p', 'mzr-tip', 'Try again! Run round a loop to lose it, and keep still behind a curtain to hide.'));
    }
    card.append(ok);
    // it doesn't hold you: walk off and it goes after a while. E, Enter, Escape or OK put it away at once
    card.hidden = false;
    closeAt = performance.now() + (kind === 'esc' ? 16000 : 14000);
    if (input.lastDevice === 'pad') setTimeout(() => { if (!card.hidden) ok.focus({ preventScroll: true }); }, 30);
  }
  function hideCard() { if (card.hidden) return; card.hidden = true; if (document.activeElement === ok) ok.blur(); }

  // ---- the celebration: warm motes and petals rising round you in the garden, then drifting down and fading
  let fx = null;
  function celebrate(x, y, z) {
    if (!fx) {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const gg = c.getContext('2d'), gr = gg.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      gg.fillStyle = gr; gg.fillRect(0, 0, 32, 32);
      const tex = new THREE.CanvasTexture(c);
      const mat = new THREE.PointsMaterial({ size: 0.22, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
      const pts = new THREE.Points(g, mat); pts.name = 'maze-celebration'; pts.frustumCulled = false; soft(pts);
      const seed = new Float32Array(N * 5);
      const cols = [[1, 0.82, 0.45], [1, 0.7, 0.35], [1, 0.93, 0.7], [0.95, 0.6, 0.65], [0.75, 0.9, 1]];
      for (let i = 0; i < N; i++) {
        seed.set([Math.random() * Math.PI * 2, 0.4 + Math.random() * 1.3, 1.2 + Math.random() * 2.4, Math.random() * 0.8, (Math.random() - 0.5) * 3], i * 5);
        col.set(cols[i % cols.length], i * 3);
      }
      fx = { pts, g, pos, seed, mat, t: 0, x: 0, y: 0, z: 0, still: false };
    }
    fx.x = x; fx.y = y; fx.z = z; fx.t = 0; fx.still = reduced();
    fx.mat.opacity = 1;
    if (!fx.pts.parent) scene.add(fx.pts);
    step(0);
  }
  function step(dt) {
    if (!fx || !fx.pts.parent) return;
    fx.t += dt;
    const t = fx.t, P = fx.pos, S = fx.seed;
    for (let i = 0; i < N; i++) {
      const a0 = S[i * 5], r0 = S[i * 5 + 1], up = S[i * 5 + 2], dl = S[i * 5 + 3], spin = S[i * 5 + 4];
      const u = fx.still ? 0.35 : Math.max(0, t - dl * 0.4);
      const rise = fx.still ? 0.5 + up * 0.3 : up * (1 - Math.exp(-u * 1.6)) - Math.max(0, u - 2.2) * 0.25; // up quickly, then drifting down
      const a = a0 + (fx.still ? 0 : u * (0.9 + spin * 0.3)), r = r0 * (fx.still ? 1 : 0.4 + Math.min(1, u * 0.8));
      P[i * 3] = fx.x + Math.cos(a) * r; P[i * 3 + 1] = fx.y + 0.3 + rise; P[i * 3 + 2] = fx.z + Math.sin(a) * r;
    }
    fx.g.attributes.position.needsUpdate = true;
    fx.mat.opacity = Math.max(0, Math.min(1, (LIFE - t) / 1.2));
    if (t > LIFE) scene.remove(fx.pts);
  }

  // ---- the server's word
  net.on('maze', m => {
    if (m.op !== 'result') return;
    last = m;
    const wasExit = exitWait && performance.now() - exitWait < 8000; exitWait = 0;
    if (m.escaped) {
      const p = player.pos;
      celebrate(p.x, p.y, p.z);
      escPending = true;
      setTimeout(() => { escPending = false; show('esc', m); }, reduced() ? 300 : 1100); // the daylight fades up first
      return;
    }
    if (m.taken) { pendingTaken = m; return; }
    if (wasExit) ui.toast('You found the way out! Daylight, at last.', 4200);
  });

  ctx.mazeResult = {
    // achievements.js holds its toasts from the way up the flight, or the wake, until the card is closed
    get holding() { return !card.hidden || escPending || !!pendingTaken || (!!exitWait && performance.now() - exitWait < 3000); },
    // maze.js, as you come up the flight: true = we say it (the card when the server believed the escape, else the plain toast)
    exited() { exitWait = performance.now(); setTimeout(() => { if (exitWait && performance.now() - exitWait >= 1900) { exitWait = 0; ui.toast('You found the way out! Daylight, at last.', 4200); } }, 2000); return true; },
  };

  return {
    name: 'maze-result',
    get last() { return last; },
    get cardOpen() { return !card.hidden; },
    get cardKind() { return card.hidden ? null : card.classList.contains('esc') ? 'esc' : 'taken'; },
    get cardText() { return card.hidden ? '' : card.textContent; },
    get celebrating() { return !!fx?.pts.parent; },
    get fx() { return fx; },
    show, hideCard, celebrate,
    update(dt) {
      step(dt);
      if (pendingTaken && ctx.playing && !ctx.below && !player.takeover && player.controls) { const r = pendingTaken; pendingTaken = null; show('taken', r); }
      if (!card.hidden && performance.now() > closeAt) hideCard();
    },
    target() { return card.hidden ? null : { hint: 'E  OK', prio: 10, run: hideCard }; },
    onKey(code) {
      if (card.hidden) return false;
      if (code === 'Escape' || code === 'KeyE' || code === 'Enter' || code === 'NumpadEnter') { hideCard(); return true; }
      return false; // the card doesn't hold you: every other key still walks, jumps, talks
    },
  };
}
