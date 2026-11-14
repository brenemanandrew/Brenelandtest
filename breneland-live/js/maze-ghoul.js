// Beneath Angell Street: the ghoul, client side. maze-scene.js imports this below (a dynamic import, never the yard) and hands it
// the scene. The server (lib/maze.js + lib/maze-ghoul.js) runs the hunt and sends the ghouls' places ten times a second and its
// events. Here: the B3 long crawler built and rigged (ghoul.js, ghoul-rig.js), put where the server says
// (interpolated a little behind, on the server's own clock, so every screen in the run agrees), its sounds (heard long before it
// is seen: a far scraping, claws on stone at every step, a wet pant, a growl when it finds your scent, the gallop; a chase sting
// and a heartbeat; all procedural, positional through audio.js), the edges of the screen darkening as it closes in, the hiding
// spots (curtains across a few dead ends and one in the library, the gaps between the crypt's sarcophagi: still in one, you
// crouch), the three grabs on you (shaken, spun and tossed; rougher the second time; the third the face and the shriek, then the
// spin, the fall and X eyes), a friend grabbed and taken as seen from outside, and the wake in front of the main house.
//
//   createMazeGhoul(ctx, scene) -> { frame(dt, now), frozen, dispose(), wake(), test hooks }   (scene: maze-scene.js's api)
// Settings: "Fewer jump scares" (settings.js fewerScares(): a softer leap, no face filling the screen, a quieter shriek) and the
// system's reduced motion (no camera spin, no shake). Kid-friendly: scary in the silhouette, the sound and the timing; no blood.
import * as THREE from 'three';
import { Ghoul } from './ghoul.js';
import { GhoulRig } from './ghoul-rig.js';
import { CELL, DIRS } from './maze-gen.js';
import { WATER_Y } from './maze-kit.js';
import { setXEyes } from './bodies-eyes.js';
import { fewerScares } from './settings.js';
import { LAYER_SOFT, toon } from './toon.js';

export const STATES = ['wander', 'search', 'chase', 'tired', 'leap', 'grab', 'backoff', 'lost', 'sniff', 'gate']; // lib/maze-ghoul.js's order
const DELAY = 140;                  // ms behind the server's newest place: every screen draws the ghoul where it was then
// the third grab's face: its eyes FACE.d ahead of yours, FACE.ex to the side and FACE.ey up (below: negative), its
// snout aimed at a point off your face (tx to the side, ty up, tf ahead), cocked by roll; its body pitched by `body` (negative:
// trailing down behind the head); the jaw held at the leap's unhinge plus `jaw` (about 25 degrees: wider and the lower jaw hangs
// away under the snout as a dark slab; this way both rows of needles frame the mouth); your view tipped down by `look` (not under
// reduced motion)
const FACE = { d: 0.4, ex: -0.05, ey: -0.06, tx: 0.25, ty: 0.06, tf: 0, roll: 0.3, body: -0.8, jaw: -1.45, look: 0.24 };
const GRAB = { 1: { dur: 2.8, spin: 1, shake: 1, k: 1 }, 2: { dur: 3.2, spin: 1.5, shake: 1.6, k: 1.5 }, 3: { dur: 3.4 } };
const N = 1, E = 2, S = 4, W = 8;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _fwd = new THREE.Vector3(), _fa = new THREE.Vector3(), _rt = new THREE.Vector3();

// ---------------------------------------------------------------- the sounds (procedural; peaks 0.05-0.3 as audio.js asks)
// Every one takes opts.k (loudness, 0..2: the distance by path and the grab's roughness) and plays at a world position, or
// straight to the effects bus when it has none (the sting, the heartbeat, the shriek in your face).
function registerGhoulSfx(audio) {
  if (!audio?.registerSfx || audio._ghoulSfx) return;
  audio._ghoulSfx = true;
  const out = (a, x, y, z, ref = 4) => (x === undefined ? a.sfx : a.at(x, y, z, ref));
  const K = o => clamp(o?.k ?? 1, 0, 2);
  // far off: claws dragged on stone, a long rasp and a few ticks (muffled by the corridors between)
  audio.registerSfx('ghoul-scrape', (a, x, y, z, o) => { const p = out(a, x, y, z, 8), t = a.ctx.currentTime, k = K(o); a.burst(p, { t, dur: 0.55 + Math.random() * 0.4, type: 'bandpass', f: 900 + Math.random() * 500, Q: 3, peak: 0.08 * k, attack: 0.12, sweep: 500 }); for (let i = 0; i < 3; i++) a.burst(p, { t: t + 0.15 + i * (0.12 + Math.random() * 0.1), dur: 0.03, type: 'bandpass', f: 2200, Q: 5, peak: 0.05 * k }); });
  // a claw on stone (each hand or foot that sets down)
  audio.registerSfx('ghoul-claw', (a, x, y, z, o) => { const p = out(a, x, y, z, 3), t = a.ctx.currentTime, k = K(o); a.burst(p, { t, dur: 0.025, type: 'bandpass', f: 2800 + Math.random() * 1400, Q: 6, peak: 0.07 * k }); a.burst(p, { t: t + 0.012, dur: 0.05, type: 'lowpass', f: 400, Q: 0.7, peak: 0.05 * k, brown: true }); });
  // the gallop's weight: a soft heavy thud on the hind feet
  audio.registerSfx('ghoul-thud', (a, x, y, z, o) => { const p = out(a, x, y, z, 4), t = a.ctx.currentTime, k = K(o); a.tone(p, { f: 70, glide: 45, t, d: 0.14, peak: 0.12 * k, type: 'sine' }); a.burst(p, { t, dur: 0.08, type: 'lowpass', f: 300, Q: 0.7, peak: 0.06 * k, brown: true }); });
  // a wet pant: in and out through teeth, a gurgle on the out-breath
  audio.registerSfx('ghoul-pant', (a, x, y, z, o) => { const p = out(a, x, y, z, 3), t = a.ctx.currentTime, k = K(o); a.burst(p, { t, dur: 0.22, type: 'bandpass', f: 1100, Q: 1.2, peak: 0.06 * k, attack: 0.06 }); a.burst(p, { t: t + 0.28, dur: 0.3, type: 'bandpass', f: 650, Q: 1.5, peak: 0.07 * k, attack: 0.03 }); for (let i = 0; i < 4; i++) a.burst(p, { t: t + 0.3 + i * 0.06, dur: 0.03, type: 'bandpass', f: 420 + i * 60, Q: 8, peak: 0.035 * k }); });
  // three quick sniffs
  audio.registerSfx('ghoul-sniff', (a, x, y, z, o) => { const p = out(a, x, y, z, 3), t = a.ctx.currentTime, k = K(o); for (let i = 0; i < 3; i++) a.burst(p, { t: t + i * 0.13, dur: 0.07, type: 'highpass', f: 1800, Q: 0.7, peak: 0.045 * k, attack: 0.02 }); });
  // the growl when it finds your scent: a low saw, wobbling, through a closed throat
  audio.registerSfx('ghoul-growl', (a, x, y, z, o) => {
    const p = out(a, x, y, z, 6), t = a.ctx.currentTime, k = K(o), lp = a.filter('lowpass', 380, 2); lp.connect(p);
    for (let i = 0; i < 9; i++) a.tone(lp, { f: 62 + Math.random() * 14, glide: 55, t: t + i * 0.14, a: 0.05, d: 0.16, peak: 0.12 * k, type: 'sawtooth' });
    a.burst(p, { t, dur: 1.3, type: 'bandpass', f: 240, Q: 2, peak: 0.05 * k, attack: 0.3, brown: true });
  });
  // losing interest: a short low huff
  audio.registerSfx('ghoul-huff', (a, x, y, z, o) => { const p = out(a, x, y, z, 4), t = a.ctx.currentTime, k = K(o); a.burst(p, { t, dur: 0.35, type: 'lowpass', f: 700, Q: 0.8, peak: 0.07 * k, attack: 0.04, brown: true }); });
  // the grab's noise in your face: a harsh snarl over a low roar (rougher with k)
  audio.registerSfx('ghoul-snarl', (a, x, y, z, o) => {
    const p = out(a, x, y, z, 2), t = a.ctx.currentTime, k = K(o), d = 1.2 + 0.4 * k;
    a.burst(p, { t, dur: d, type: 'bandpass', f: 520, Q: 1.4, peak: 0.13 * k, attack: 0.04, sweep: 900 });
    for (let i = 0; i < Math.round(8 * d); i++) a.tone(p, { f: 95 + Math.random() * 40, glide: 70, t: t + i * 0.12, a: 0.02, d: 0.12, peak: 0.09 * k, type: 'sawtooth' });
    a.burst(p, { t: t + 0.05, dur: 0.2, type: 'highpass', f: 2500, Q: 0.7, peak: 0.08 * k });
  });
  // the shriek of the third grab (fewer jump scares: k well down)
  audio.registerSfx('ghoul-shriek', (a, x, y, z, o) => {
    const p = out(a, x, y, z, 2), t = a.ctx.currentTime, k = K(o);
    for (const [f0, f1] of [[700, 1500], [740, 1580], [1050, 2100]]) a.tone(p, { f: f0, glide: f1, t, a: 0.03, d: 0.9, peak: 0.075 * k, type: 'sawtooth' });
    a.burst(p, { t, dur: 1.0, type: 'bandpass', f: 2600, Q: 1.2, peak: 0.16 * k, attack: 0.02, sweep: 4200 });
    a.tone(p, { f: 120, glide: 60, t, d: 1.0, peak: 0.12 * k, type: 'sawtooth' });
  });
  // the chase sting: a low cluster stabbed under a high bowed screech (the music's moment)
  audio.registerSfx('ghoul-sting', (a, x, y, z, o) => {
    const p = out(a, x, y, z), t = a.ctx.currentTime, k = K(o);
    for (const f of [55, 58.3, 82.4]) a.tone(p, { f, t, a: 0.01, d: 1.4, peak: 0.07 * k, type: 'sawtooth' });
    a.tone(p, { f: 1760, glide: 1660, t, a: 0.05, d: 1.1, peak: 0.035 * k, type: 'triangle' });
    a.burst(p, { t, dur: 0.12, type: 'lowpass', f: 200, Q: 0.7, peak: 0.12 * k, brown: true });
  });
  // the heartbeat: lub-dub, low and close
  audio.registerSfx('ghoul-heart', (a, x, y, z, o) => { const p = out(a, x, y, z), t = a.ctx.currentTime, k = K(o); a.tone(p, { f: 58, glide: 40, t, a: 0.008, d: 0.12, peak: 0.16 * k, type: 'sine' }); a.tone(p, { f: 52, glide: 38, t: t + 0.17, a: 0.008, d: 0.14, peak: 0.12 * k, type: 'sine' }); });
}

// ---------------------------------------------------------------- the grid (the same walls the server reasons with)
function gridOf(maze) {
  const { W: GW, H: GH, cells } = maze, n = GW * GH;
  const dist = new Int16Array(n), q = new Int32Array(n);
  const cellOf = (x, z) => clamp(Math.floor(x / CELL), 0, GW - 1) + clamp(Math.floor(z / CELL), 0, GH - 1) * GW;
  const bfs = c0 => { dist.fill(-1); dist[c0] = 0; let h = 0, t = 0; q[t++] = c0; while (h < t) { const c = q[h++], x = c % GW, y = (c - x) / GW; for (let k = 0; k < 4; k++) { if (cells[c] & DIRS[k][2]) continue; const nc = (y + DIRS[k][1]) * GW + x + DIRS[k][0]; if (dist[nc] < 0) { dist[nc] = dist[c] + 1; q[t++] = nc; } } } };
  const los = (ax, az, bx, bz) => {
    let cx = Math.floor(ax / CELL), cy = Math.floor(az / CELL);
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return false;
    const dx = bx - ax, dz = bz - az, sx = dx > 0 ? 1 : -1, sy = dz > 0 ? 1 : -1;
    const tdx = dx ? Math.abs(CELL / dx) : Infinity, tdz = dz ? Math.abs(CELL / dz) : Infinity;
    let tx = dx ? ((sx > 0 ? (cx + 1) * CELL - ax : ax - cx * CELL) / Math.abs(dx)) : Infinity;
    let tz = dz ? ((sy > 0 ? (cy + 1) * CELL - az : az - cy * CELL) / Math.abs(dz)) : Infinity;
    for (let g = 0; g < 80; g++) {
      if (Math.min(tx, tz) > 1) return true;
      const c = cells[cy * GW + cx];
      if (tx < tz) { if (c & (sx > 0 ? E : W)) return false; cx += sx; tx += tdx; } else { if (c & (sy > 0 ? S : N)) return false; cy += sy; tz += tdz; }
      if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return false;
    }
    return true;
  };
  return { dist, bfs, los, cellOf };
}

// ---------------------------------------------------------------- the curtains of the hiding spots (one mesh each, drawn when near)
function curtain(h) {
  const w = h.w, top = 2.75, rows = 9, cols = 14, pos = [], idx = [];
  const ax = -h.nz, az = h.nx; // (along the curtain)
  const cx = h.x + h.nx * h.cur, cz = h.z + h.nz * h.cur;
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const u = i / cols - 0.5, v = j / rows, hem = v === 1 ? 0.12 * Math.sin(i * 2.3) + 0.08 * Math.sin(i * 5.1) : 0;
    const fold = 0.07 * Math.sin(u * w * 7.5) * (0.4 + v), sag = -0.05 * Math.cos(u * Math.PI);
    pos.push(cx + ax * u * w + h.nx * fold, top - v * (top - 0.18) + hem + (j === 0 ? 0 : sag * v), cz + az * u * w + h.nz * fold);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + cols + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- the wake in front of the main house (the yard: after the run)
// Lying on the lawn before the porch steps with X eyes, the fade comes up, the X's go, a groggy get-up (a wobble), a shake of the
// head, and your control back. Reduced motion: no wobble, no camera drift.
export function wakeInYard(ctx) {
  const { player, ui, audio } = ctx, ch = player.character, root = ch.root;
  const reduced = reducedMotion();
  const P = { x: 0.8, z: -13.2, yaw: Math.PI };   // (the lawn north of the porch steps: layout.js STEPS end at z -8.6; facing away from the house)
  player.place(P.x, P.z, P.yaw);
  player.controls = false;
  root.rotation.order = 'YXZ';
  setXEyes(ch, true);
  let t = 0, xOff = false;
  const lie = -Math.PI / 2, y0 = player.pos.y;
  ui.el.fade.style.background = '#000'; ui.fade(1, 10);
  setTimeout(() => { ui.fade(0, 1300).then(() => { ui.el.fade.style.background = ''; }); }, 60);
  const done = () => { root.rotation.x = 0; root.rotation.order = 'XYZ'; ch.lookYaw = 0; setXEyes(ch, false); if (player.takeover === to) player.takeover = null; if (ctx.playing) player.controls = true; player.snapCameraBehind?.(); };
  const to = {
    anim: 'idle', minigame: null,
    update(dt) {
      t += dt;
      // lying a beat (0-2.5 s, the X's go at 2.3), up and over (2.5-4.4 s, a wobble), on your feet with a shake of the head (4.4-5.5 s)
      const up = smooth(clamp((t - 2.5) / 1.9, 0, 1)), wob = reduced ? 0 : Math.sin(t * 7) * 0.12 * Math.sin(up * Math.PI);
      root.rotation.x = lie * (1 - up) + wob;
      player.pos.y = y0 + 0.12 * (1 - up); // (the body pivots at the feet: lying, lifted off the grass by its own thickness)
      if (!xOff && t > 2.3) { xOff = true; setXEyes(ch, false); audio.ui?.('blip'); }
      ch.lookYaw = t > 4.4 && t < 5.5 ? Math.sin((t - 4.4) * 17) * 0.45 * (1 - (t - 4.4) / 1.1) : 0;
      if (t > 5.6) { done(); ui.toast('You wake up in front of the house. What a dream...', 3600); }
    },
    camera(dt, cam) {
      // looking down at you from beside, rising as you get up
      const k = smooth(clamp((t - 2.4) / 3, 0, 1)), d = reduced ? 0 : t * 0.03;
      cam.position.set(P.x + 2.2 + d, 2.6 - 0.9 * k + root.position.y, P.z - 1.4 - 1.2 * k);
      cam.lookAt(P.x, root.position.y + 0.3 + 0.8 * k, P.z + 0.6 * (1 - k));
      return true;
    },
  };
  player.takeover = to;
  return to;
}

// ---------------------------------------------------------------- the ghoul below
export function createMazeGhoul(ctx, Sc) {
  const { audio, net, ui, renderer } = ctx;
  registerGhoulSfx(audio);
  const maze = Sc.maze, grid = gridOf(maze), group = Sc.group, origin = Sc.origin, cam = Sc.cam, me = Sc.me;
  const disposers = [];
  let disposed = false;

  // ---- the ghouls (built as the server sends them; the first one now, in the dark, so its first glimpse costs nothing)
  const views = [];
  const glowSprite = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(230,255,240,1)'); r.addColorStop(0.35, 'rgba(140,255,196,0.9)'); r.addColorStop(1, 'rgba(60,200,140,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; })();
  disposers.push(() => glowSprite.dispose());
  function makeView(i) {
    const gh = new Ghoul('B3');
    const rig = new GhoulRig(gh);
    // the green points glow through the fog (the fog takes everything else past 7 m): two points that never shrink below a few
    // pixels, so the first you see of it is two green dots low in a corridor
    let eyeL = new THREE.Vector3(-0.05, 0.03, 0.12), eyeR = new THREE.Vector3(0.05, 0.03, 0.12);
    gh.root.traverse(o => {
      if (o.isMesh && o.material?.name === 'ghoul-glow') {
        o.material.fog = false; o.material.needsUpdate = true;
        if (o.parent === gh.joints.head) { const P = o.geometry.attributes.position; const a = new THREE.Vector3(), b = new THREE.Vector3(); let na = 0, nb = 0; for (let k = 0; k < P.count; k++) { const x = P.getX(k); if (x < 0) { a.x += x; a.y += P.getY(k); a.z += P.getZ(k); na++; } else { b.x += x; b.y += P.getY(k); b.z += P.getZ(k); nb++; } } if (na && nb) { eyeL = a.divideScalar(na); eyeR = b.divideScalar(nb); } }
      }
    });
    // the gaunt face's points sit far back in their sockets under the brow, so the fog-free dots are set out in front of them by
    // distance (placeEyes, below) or the brow would hide them down the corridor. Up close they sit in the sockets
    if (gh.eyeAt) { const [a, b] = gh.eyeAt; eyeL = a.p.clone().addScaledVector(a.n, 0.012); eyeR = b.p.clone().addScaledVector(b.n, 0.012); eyeL.z -= 0.01; eyeR.z -= 0.01; }
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute([eyeL.x, eyeL.y, eyeL.z + 0.01, eyeR.x, eyeR.y, eyeR.z + 0.01], 3));
    const em = new THREE.PointsMaterial({ map: glowSprite, size: 6, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false, color: '#9dffd0', blending: THREE.AdditiveBlending });
    const eyes = new THREE.Points(eg, em); eyes.layers.set(LAYER_SOFT); eyes.frustumCulled = false; eyes.renderOrder = 3;
    gh.joints.head.add(eyes);
    gh.root.visible = false;
    group.add(gh.root);
    const v = { i, gh, rig, eyes, eyeOut: 0.012, buf: [], x: 0, z: 0, yaw: 0, s: 'wander', sAt: 0, st: 0, speed: 0, vx: 0, vz: 0, tsid: 0, px: null, pz: 0, seen: false, pin: null, dist: 99, path: 99, scrapeAt: 3 + Math.random() * 4, pantAt: 0, sniffAt: 0, visible: false, ready: false };
    disposers.push(() => { group.remove(gh.root); gh.root.traverse(o => { if (o.isMesh || o.isPoints) { if (!o.userData.shared) o.geometry?.dispose(); } }); em.dispose(); });
    views[i] = v;
    return v;
  }
  makeView(0);

  // ---- the server's word
  let lag = null;          // the smallest (local - server) time seen lately: the one-way delay plus any clock difference
  const sounds = [];       // for the tests: what was played, { n, t, d, k }
  const events = [];       // (tests) the events seen
  let testReply = null;
  const off = net.on('maze', m => {
    if (disposed) return;
    if (m.op === 'ghoul') {
      const nowMs = Date.now(), d = nowMs - m.ts;
      lag = lag === null ? d : Math.min(d, lag + 0.02 * 100); // (it creeps back up 2 ms a snapshot, so one slow message does not stick)
      for (let i = 0; i < m.g.length; i++) {
        const v = views[i] || makeView(i), a = m.g[i];
        v.buf.push({ ts: m.ts, x: a[0], z: a[1], yaw: a[2], s: STATES[a[3]] || 'wander', sp: a[4], tsid: a[5] });
        if (v.buf.length > 24) v.buf.shift();
        v.ready = true;
      }
    } else if (m.op === 'gev') onEvent(m);
    else if (m.op === 'gtest') { testReply = m; }
  });
  disposers.push(off);

  // ---- the vignette (the screen's edges darkening as it closes in) and the "hidden" line, our own until the atmosphere's scene.fx
  const vig = document.createElement('div');
  vig.className = 'mzg-vig';
  Object.assign(vig.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '9', opacity: '0', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 38%, rgba(0,0,0,0.55) 70%, rgba(2,0,4,0.96) 100%)' });
  ui.el.fade.parentNode.insertBefore(vig, ui.el.fade);
  const hideLine = document.createElement('div');
  hideLine.className = 'mzg-hide'; hideLine.textContent = 'Hidden. Keep still...';
  Object.assign(hideLine.style, { position: 'fixed', left: '50%', bottom: '22%', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: '11', font: '700 16px var(--font-head, sans-serif)', color: '#cfe8dc', textShadow: '0 2px 4px #000', opacity: '0', transition: 'opacity 0.4s' });
  document.body.append(hideLine);
  disposers.push(() => { vig.remove(); hideLine.remove(); });

  // ---- the curtains
  const curtains = [];
  {
    const mat = toon('#1c1312', { side: 'double' }), rodMat = toon('#26262d');
    for (const h of maze.hides || []) {
      if (!h.cur) continue;
      const m = new THREE.Mesh(curtain(h), mat); m.castShadow = true; m.receiveShadow = true; m.name = 'mzg-curtain';
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, h.w + 0.2, 6), rodMat);
      rod.position.set(h.x + h.nx * h.cur, 2.78, h.z + h.nz * h.cur); rod.rotation.set(Math.PI / 2, 0, 0); rod.rotation.order = 'YXZ'; rod.rotation.y = Math.atan2(h.nx, h.nz) + Math.PI / 2;
      m.add(rod); m.position.set(0, 0, 0); rod.position.sub(m.position);
      m.visible = false; group.add(m);
      curtains.push({ h, m });
    }
    disposers.push(() => { for (const c of curtains) { group.remove(c.m); c.m.geometry.dispose(); c.m.children[0].geometry.dispose(); } });
  }

  // ---- what is happening to you, and to friends
  let seq = null;              // your grab or your end: { kind: 'grab' | 'taken', n, t, gi, ... }
  const friendSeq = new Map(); // sid -> { n, t, taken, name, said }
  let myGrabs = 0, myRespite = 0;
  const fewer = () => fewerScares();
  function onEvent(m) {
    events.push({ e: m.e, g: m.g, sid: m.sid, n: m.n, at: performance.now() }); if (events.length > 60) events.shift();
    const v = views[m.g], mine = m.sid && m.sid === net.sid;
    const at = v ? (_w.set(v.x, 1, v.z).add(origin), _w) : null;
    const k = v ? loud(v) : 0.5;
    switch (m.e) {
      case 'growl': if (v && v.path < 40) play('ghoul-growl', at, k * (mine ? 1.2 : 1)); break;
      case 'chase': if (mine || (v && v.path < 18)) play('ghoul-sting', null, mine ? 1 : 0.6); if (v) play('ghoul-growl', at, k); break;
      case 'lost': if (v && v.path < 24) play('ghoul-huff', at, k); break;
      case 'leap': if (v && v.path < 16) { play('ghoul-snarl', at, 0.5 * k); Sc.fx?.gutter?.(mine ? 1 : 0.6); } break; // (the flame nearly goes out)
      case 'miss': if (v && v.path < 16) { play('ghoul-thud', at, k); play('ghoul-growl', at, 0.8 * k); } break;
      case 'grab':
        if (mine) startGrab(m);
        else if (m.sid) friendSeq.set(m.sid, { n: m.n, t: 0, taken: m.n >= 3, tt: -1.05, name: m.name, said: false, gi: m.g }); // (the third: as on their screen, the face, then the spin and the fall)
        // the cry, in the investigator's own voice (yours, or a friend's from where they are): a yelp and a struggle, or
        // the third's cry
        if (Sc.vocal) { const who = mine ? null : m.sid; if (m.n >= 3) Sc.vocal('scream', who); else { Sc.vocal('yelp', who); Sc.vocal('struggle', who, GRAB[Math.min(2, m.n)].dur); } }
        if (!mine && v && v.path < 30) play('ghoul-snarl', at, k);
        break;
      case 'free': if (mine) { myRespite = m.respite; } else friendSeq.delete(m.sid); break;
      case 'taken': if (!mine && m.sid && !friendSeq.get(m.sid)?.taken) friendSeq.set(m.sid, { n: 3, t: 0, taken: true, tt: 0, name: m.name, said: false, gi: m.g }); break;
    }
  }
  function startGrab(m) {
    myGrabs = m.count ?? m.n; // `n` is the stage played, `count` the grabs so far, `left` the escapes still in you
    const n = Math.min(3, m.n);
    seq = { kind: n >= 3 ? 'taken' : 'grab', n, left: m.left ?? (3 - n), t: 0, gi: m.g, dur: GRAB[n].dur, yaw0: me.yaw, fewer: fewer(), reduced: reducedMotion(), said: false };
    Sc.fx?.gutter?.(n >= 3 ? 1 : 0.7);
    if (n < 3) play('ghoul-snarl', null, GRAB[n].k);
    else play('ghoul-shriek', null, seq.fewer ? 0.35 : 1.25);
    ui.hint(null);
  }
  function play(name, at, k = 1) {
    const A = Sc.atmos?.aud || audio; // through the stone: the walls between, the opening it leaks through, the echo
    if (at) A.play(name, at.x, at.y, at.z, { k }); else A.play(name, undefined, undefined, undefined, { k });
    sounds.push({ n: name, t: performance.now() / 1000, k: +k.toFixed(2), d: at ? +Math.hypot(at.x - cam.position.x, at.z - cam.position.z).toFixed(1) : 0 }); if (sounds.length > 300) sounds.shift();
  }
  const loud = v => clamp(1.15 - v.path / 40, 0.12, 1.1);   // (by the path: the corridors carry it, the walls do not)

  // ---- placing a ghoul where the server had it DELAY ms ago (on its clock), its state, its speed
  function sample(v, nowMs) {
    if (v.pin) { const p = v.pin; v.x = p.x; v.z = p.z; v.yaw = p.yaw; if (v.s !== p.s) { v.s = p.s; v.sAt = performance.now() / 1000; } v.speed = p.speed || 0; v.tsid = 0; return; }
    const b = v.buf; if (!b.length) return;
    const tr = nowMs - (lag ?? 0) - DELAY;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].ts > tr) i--;
    let A = b[Math.max(0, i - 1)], B = b[i];
    if (tr >= B.ts) A = B;
    const u = A === B ? 0 : clamp((tr - A.ts) / Math.max(1, B.ts - A.ts), 0, 1);
    const nx = A.x + (B.x - A.x) * u, nz = A.z + (B.z - A.z) * u;
    v.x = nx; v.z = nz;
    v.yaw = A.yaw + wrap(B.yaw - A.yaw) * u;
    const s = u > 0.5 ? B.s : A.s;
    if (s !== v.s) { v.s = s; v.sAt = performance.now() / 1000; }
    v.speed = A.sp + (B.sp - A.sp) * u; v.tsid = B.tsid;
  }

  // ---- one frame (maze-scene.js calls this after placing the camera and the lights, before drawing)
  let fieldAt = 0, heartAt = 0, danger = 0, hiddenK = 0, stillT = 0;
  const fxSent = { threat: 0, hush: 0 };
  const myCell = () => grid.cellOf(me.x, me.z);
  function frame(dt, now) {
    if (disposed) return;
    const nowMs = Date.now(), tSec = performance.now() / 1000;
    // the path field from you (for loudness and danger), four times a second
    if (now - fieldAt > 0.25 || now < fieldAt) { fieldAt = now; grid.bfs(myCell()); }
    let near = 99;
    for (const v of views) {
      if (!v) continue;
      const px = v.x, pz = v.z;
      sample(v, nowMs);
      deathPose(v); // in the death frames it lands, crouches over its quarry and backs into the dark, drawn here
      if (!v.ready && !v.pin) { v.gh.root.visible = false; continue; }
      // the speed and the way it moves, for the gait
      if (v.px === null) { v.px = v.x; v.pz = v.z; }
      const vx = dt > 0 ? (v.x - px) / dt : 0, vz = dt > 0 ? (v.z - pz) / dt : 0;
      const kk = Math.min(1, dt * 10); v.vx += (vx - v.vx) * kk; v.vz += (vz - v.vz) * kk;
      if (Math.hypot(v.x - px, v.z - pz) > 3) { v.vx = v.vz = 0; } // (a jump: a spawn or a test's place)
      v.px = v.x; v.pz = v.z;
      v.dist = Math.hypot(v.x - me.x, v.z - me.z);
      const c = grid.cellOf(v.x, v.z), pd = grid.dist[c];
      v.path = pd < 0 ? 99 : pd === 0 ? v.dist : pd * CELL;
      near = Math.min(near, v.path);
      // where it is drawn: the server's place, or (your own grab) in your face
      const root = v.gh.root;
      const st = v.st0 || (v.st0 = {}); // (one per ghoul, reused: no garbage a frame)
      st.state = v.s; st.st = tSec - v.sAt; st.vx = v.vx; st.vz = v.vz; st.floor = maze.water[c] ? WATER_Y : 0; st.look = null; st.face = false;
      // at a locked gate (maze-gates.js): out of sight at the back of the dead end, then the leap at the bars (none with Fewer jump
      // scares: it's just there), then its hands through the bars, the jaws working, shaking the gate roughly
      const atGate = v.s === 'gate', gk = atGate ? st.st - 1.0 : 0;
      if (atGate) { st.state = gk < 0 ? 'sniff' : gk < 0.45 && !fewer() ? 'leap' : 'grab'; st.st = gk < 0 ? st.st : gk < 0.45 ? gk : gk - 0.45; }
      let yaw = v.yaw;
      if (v.s === 'backoff' && tSec - v.sAt < 1.6 && v.backFrom) { yaw = Math.atan2(v.backFrom[0] - v.x, v.backFrom[1] - v.z); } // (backing away, still facing you)
      if (v.s === 'grab') v.backFrom = [me.x, me.z];
      const ownGrab = seq && seq.gi === v.i && seq.t < (seq.kind === 'taken' ? 1.05 : seq.dur);
      if (ownGrab) placeOnMe(v, st); else { root.position.x = v.x; root.position.z = v.z; root.rotation.y = yaw; root.rotation.x = 0; }
      if (atGate && gk > 0.45) { const j = Math.sin(tSec * 21) * 0.07 + Math.sin(tSec * 13.7) * 0.04; root.position.x += Math.sin(yaw) * j; root.position.z += Math.cos(yaw) * j; } // wrenching at the bars
      if (v.tsid === net.sid || v.s === 'chase' || v.s === 'tired') st.look = _v.set(me.x, 1.2, me.z);
      if (v.dyingAt) st.look = _v.set(v.dyingAt.x, 0.3, v.dyingAt.z); // the death frames: at its quarry on the floor
      v.rig.update(dt, st);
      if (ownGrab) liftToFace(v);
      // right up at the lantern a white skin blows out to a flat cartoon white: shade it down the nearer it is (a grey, sickly face)
      { const near2 = v.gh.joints.head.getWorldPosition(_v).distanceTo(cam.position), k2 = 0.5 + 0.5 * clamp((near2 - 0.6) / 2.4, 0, 1);
        if (!v.skins) { v.skins = []; v.gh.root.traverse(o => { if (o.isMesh && o.userData.rigid && o.material?.vertexColors) v.skins.push(o.material); }); }
        for (const mt of v.skins) if (Math.abs(mt.color.r - k2) > 0.01) mt.color.setScalar(k2); }
      // drawn only where you could see it (no line through the walls: the fog-free eyes must not shine through a wall)
      const vis = v.pin || ownGrab || (v.dist < 34 && (v.dist < 3 || grid.los(me.x, me.z, v.x, v.z)));
      root.visible = !!vis; v.visible = !!vis;
      if (vis) { const px2 = clamp(3.5 + 30 / Math.max(1, v.dist), 5.5, 8) * renderer.getPixelRatio(); v.eyes.material.size = px2; placeEyes(v, ownGrab ? 0 : v.dist); }
      voice(v, dt, tSec);
    }
    // the danger: by the path to the nearest ghoul; up while it chases you
    let hunted = false;
    for (const v of views) if (v && v.tsid === net.sid && (v.s === 'chase' || v.s === 'tired' || v.s === 'leap')) hunted = true;
    const want = clamp((26 - near) / 20, 0, 1) * 0.8 + (hunted ? 0.35 : 0);
    danger += (clamp(want, 0, 1) - danger) * Math.min(1, dt * 2.5);
    // the atmosphere's hook (maze-fx.js scene.fx): the edges darken, the lantern trembles; the bed hushes while it is near and quiet
    // (silence before something happens); our own vignette only without it
    const fx = Sc.fx;
    if (fx && 'threat' in fx) {
      if (Math.abs(fxSent.threat - danger) > 0.01) fx.threat = fxSent.threat = danger;   // (only when ours moves: others may set it too)
      let quiet = 0; for (const v of views) if (v && v.visible !== undefined && v.path < 16 && (v.s === 'sniff' || v.s === 'search' || v.s === 'wander')) quiet = Math.max(quiet, clamp((16 - v.path) / 10, 0, 1) * 0.7);
      if (seq) quiet = 0;
      if (Math.abs(fxSent.hush - quiet) > 0.02) fx.hush = fxSent.hush = quiet;
    } else vig.style.opacity = (danger * 0.9).toFixed(3);
    // the heartbeat, faster the nearer
    if (danger > 0.3 && !seq) { heartAt -= dt; if (heartAt <= 0) { heartAt = 1.05 - danger * 0.6; play('ghoul-heart', null, 0.5 + danger * 0.7); } } else heartAt = 0.2;
    // hiding: still in a hiding spot, you crouch (the camera low), the line says so
    let inHide = null;
    for (const h of maze.hides || []) if (Math.hypot(me.x - h.x, me.z - h.z) <= h.r) { inHide = h; break; }
    stillT = me.speed < 0.25 ? stillT + dt : 0;
    const hide = !!inHide && (stillT > 0.6 || me.crouch) && !seq; // crouched in it at any pace, as the server has it
    hiddenK += ((hide ? 1 : 0) - hiddenK) * Math.min(1, dt * 5);
    if (hiddenK > 0.01 && Sc.view === 'fp') cam.position.y -= 0.6 * hiddenK * (1 - (me.crouchK || 0)); // no lower than a crouch
    hideLine.style.opacity = hide ? '1' : '0';
    // curtains near you
    for (const c of curtains) c.m.visible = Math.hypot(c.h.x - me.x, c.h.z - me.z) < 18;
    // you, grabbed or taken; friends grabbed or taken
    if (seq) stepSeq(dt, now);
    stepFriends(dt);
  }

  // ---- the death frames, drawn on this screen. The server's ghoul holds its grab 3.4 s (the leap's pose, off the floor), which
  // would hang in the air over you once the camera comes out of your eyes. Instead it lands on its quarry (the leap's lift and the
  // spread limbs let down onto the floor), crouches over them, low, worrying at them, then backs away into the dark, still facing
  // them. Yours (seq, from the camera coming out) and a friend's (friendSeq, from their spin) alike.
  const dying = { me: { x: 0, z: 0, yaw: 0 } };
  function deathPose(v) {
    let t = -1, who = null, slot = null;
    v.dyingAt = null;
    if (seq && seq.kind === 'taken' && deathCam && v.i === seq.gi) { t = seq.t - deathCam.t0; who = dying.me; who.x = me.x; who.z = me.z; who.yaw = deathCam.yaw; slot = deathCam; }
    else for (const [sid, f] of friendSeq) if (f.taken && f.gi === v.i && f.tt >= 0) { const r = Sc.remotes.get(sid); if (!r) continue; t = f.tt + 0.3; who = f.who || (f.who = { x: r.tx, z: r.tz, yaw: r.tr }); slot = f; break; }
    if (!who) return;
    if (!slot.gp) {
      // where it lands: a body's length in front of where they stood (they fall the other way), facing them; the way back: the way
      // with most room away from them (not the camera's side, for your own)
      const fx = Math.sin(who.yaw), fz = Math.cos(who.yaw);
      const lx = grid.los(who.x, who.z, who.x + fx * 1.1, who.z + fz * 1.1) ? 0.7 : 0.35;
      const gx = who.x + fx * lx, gz = who.z + fz * lx, face = Math.atan2(who.x - gx, who.z - gz);
      let best = face + Math.PI, room = -1;
      for (let k = 0; k < 8; k++) {
        const a = face + Math.PI + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 4;
        if (slot === deathCam && (Math.abs(wrap(a - deathCam.a0)) < 1.0 || Math.abs(wrap(a - deathCam.a0 - (seq.reduced ? 0 : 1.9))) < 1.0)) continue; // (not where the camera is, nor where its swing ends)
        let r = 0; while (r < 3.4 && grid.los(gx, gz, gx + Math.sin(a) * (r + 0.7), gz + Math.cos(a) * (r + 0.7))) r += 0.2;
        if (r > room + 0.5) { room = r; best = a; }
      }
      slot.gp = { x: gx, z: gz, face, back: best, room: Math.max(0, room) };
    }
    const g = slot.gp, BACK = 2.0;
    const d = t < BACK ? 0 : Math.min(g.room, 1.4 * (t - BACK) * Math.min(1, (t - BACK) / 0.5));
    v.x = g.x + Math.sin(g.back) * d; v.z = g.z + Math.cos(g.back) * d; v.yaw = g.face;
    const s = t < BACK ? 'crouch' : 'backoff';
    if (v.s !== s) { v.s = s; v.sAt = performance.now() / 1000; }
    v.speed = t < BACK ? 0 : 1.4; v.tsid = 0; v.dyingAt = who;
  }

  // the eye dots out in front of the sockets: 1.2 cm up close (in them), 5.5 cm from 6 m on (clear of the brow); moved only when it changes
  function placeEyes(v, d) {
    const E = v.gh.eyeAt; if (!E) return;
    const out = 0.012 + 0.043 * clamp((d - 1.5) / 4.5, 0, 1);
    if (Math.abs(out - v.eyeOut) < 0.003) return;
    v.eyeOut = out;
    const P = v.eyes.geometry.attributes.position;
    for (let k = 0; k < 2; k++) { const e = E[k]; P.setXYZ(k, e.p.x + e.n.x * out, e.p.y + e.n.y * out, e.p.z + e.n.z * out); }
    P.needsUpdate = true;
  }

  // ---- the ghoul's sounds by where it is (the far scraping, the claws, the pant, the sniffing)
  function voice(v, dt, tSec) {
    const at = _w.set(v.x, 0.6, v.z).add(origin), k = loud(v);
    const moving = v.speed > 0.4;
    if (v.path > 18 && v.path < 60) {
      v.scrapeAt -= dt;
      if (v.scrapeAt <= 0) { v.scrapeAt = 5 + Math.random() * 8; if (moving || Math.random() < 0.3) play('ghoul-scrape', at, k * 0.9); }
    } else if (v.path <= 18) {
      // claws at each set-down (the gallop's fast patter, the prowl's slow ticks), a thud on the hind feet at a gallop
      const t = v.rig.touched;
      if (t) for (let i = 0; i < 4; i++) if (t & (1 << i)) { play('ghoul-claw', _v.set(v.x, 0.05, v.z).add(origin), k * (v.speed > 3.6 ? 1.1 : 0.7)); if (v.speed > 3.6 && i % 2 === 0) play('ghoul-thud', _v, k); }
      if (v.path < 12) {
        v.pantAt -= dt;
        if (v.pantAt <= 0 && v.s !== 'grab') { v.pantAt = v.s === 'chase' || v.s === 'tired' ? 0.75 : 1.4 + Math.random() * 0.6; play('ghoul-pant', _v.set(v.x, 0.8, v.z).add(origin), k); }
      }
      if ((v.s === 'sniff' || v.s === 'search' && !moving) && v.path < 14) { v.sniffAt -= dt; if (v.sniffAt <= 0) { v.sniffAt = 1.3 + Math.random(); play('ghoul-sniff', _v.set(v.x, 0.6, v.z).add(origin), k); } }
    }
    void tSec;
  }

  // ---- your grab: it on you, your view spun, shaken and tossed, then free (or, the third time, the end)
  function placeOnMe(v, st) {
    const root = v.gh.root, f = seq.kind === 'taken' && !seq.fewer ? 0.55 : seq.kind === 'taken' ? 1.5 : 0.95;
    cam.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
    const p = _v.copy(cam.position).sub(origin).addScaledVector(_fwd, f + 0.35);
    // the third: the leap at you first (softer with fewer jump scares), the face filling the screen
    if (seq.kind === 'taken') { const u = smooth(clamp(seq.t / (seq.fewer ? 0.6 : 0.28), 0, 1)); st.state = u < 1 ? 'leap' : 'grab'; st.st = seq.t; st.face = !seq.fewer; }
    else st.state = 'grab';
    root.position.x = p.x; root.position.z = p.z; root.rotation.y = Math.atan2(-_fwd.x, -_fwd.z);
    // in your face its body trails down and away behind the head: it comes up at you from below
    root.rotation.order = 'YXZ'; root.rotation.x = st.face ? FACE.body * smooth(clamp(seq.t / 0.28, 0, 1)) : 0; st.faceJaw = FACE.jaw;
    st.look = _w.copy(cam.position).sub(origin);
  }
  function liftToFace(v) {
    // the head at your eyes, a set way off: in your face for the third (back and lower with fewer jump scares), close for a grab.
    // The third's face sits a little below your eyes and comes up at you, cocked off square, the jaw dropped
    // toward you, so the needles and the dark mouth are in the frame; fewer jump scares keeps its calm square look 1.6 m back.
    const head = v.gh.joints.head.getWorldPosition(_v), taken = seq.kind === 'taken', close = taken && !seq.fewer;
    const want = cam.position.y - (close ? 0.17 : 0.25);
    const D = taken ? (seq.fewer ? 1.6 : 0.5) : 0.75;   // (the head's joint: its long snout reaches most of the way to you)
    cam.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
    const along = (head.x - cam.position.x) * _fwd.x + (head.z - cam.position.z) * _fwd.z;
    const lead = taken ? Math.max(0, 1 - smooth(clamp(seq.t / (seq.fewer ? 0.6 : 0.28), 0, 1))) * 2.5 : 0;   // (the leap in)
    v.gh.root.position.x += _fwd.x * (D + lead - along); v.gh.root.position.z += _fwd.z * (D + lead - along);
    v.gh.root.position.y += want - head.y;
    v.gh.root.updateMatrixWorld(true);
    if (close) {
      // the snout past you, low on the lantern's side (a three-quarter face, not a passport photo: a long snout aimed at the
      // camera hides everything behind its nose), cocked; then the root moved so its eyes sit just below yours, close
      _rt.set(-_fwd.z, 0, _fwd.x);
      _fa.copy(cam.position).addScaledVector(_rt, FACE.tx).addScaledVector(_fwd, FACE.tf); _fa.y += FACE.ty;
      v.rig.aimHead(_fa, seq.t, FACE.roll);
      const eye = v.gh.joints.head.localToWorld(_v.set(0, 0.03, 0.1));
      _fa.copy(cam.position).addScaledVector(_fwd, FACE.d + lead).addScaledVector(_rt, FACE.ex); _fa.y += FACE.ey;
      v.gh.root.position.add(_fa.sub(eye));
      v.gh.root.updateMatrixWorld(true);
    } else if (taken) v.rig.aimHead(_fa.copy(cam.position), seq.t);   // (its face square at yours)
  }
  let deathCam = null;
  function stepSeq(dt, now) {
    const s = seq; s.t += dt;
    const body = Sc.body;
    if (s.kind === 'grab') {
      const G = GRAB[s.n], u = s.t / s.dur;
      // spun round (a full turn, more the second time) between 0.3 and 1.4 s; reduced motion: no spin
      if (!s.reduced) { const sp = smooth(clamp((s.t - 0.3) / 1.1, 0, 1)); me.yaw = s.yaw0 + sp * Math.PI * 2 * G.spin; }
      me.pitch += (0.05 - me.pitch) * Math.min(1, dt * 6);
      // shaken and tossed about (0.5 to 2.3 s)
      if (!s.reduced) {
        const sh = clamp((s.t - 0.4) / 0.2, 0, 1) * (1 - smooth(clamp((s.t - 2.1) / 0.4, 0, 1))) * G.shake;
        cam.position.x += Math.sin(now * 37) * 0.07 * sh; cam.position.y += Math.sin(now * 23 + 1) * 0.1 * sh + Math.sin(s.t * 6) * 0.18 * sh; cam.position.z += Math.cos(now * 31) * 0.07 * sh;
        cam.rotateZ(Math.sin(now * 19) * 0.22 * sh);
      }
      if (!s.said && s.t > s.dur - 0.5) { s.said = true; ui.toast(s.n === 1 ? 'You twist free! Run!' : s.left > 1 ? 'Free again! Keep running!' : 'Free again! It will not let go next time...', 2600); }
      if (u >= 1) { seq = null; me.vx = me.vz = 0; }
      return;
    }
    // the third grab: the face (0 - 1.05 s), then out of your eyes to see yourself spin and fall, X eyes, the fade, up top
    if (s.t < 1.05) {
      // the lantern gutters again as it lands on you (the flicker from below on its face)
      if (!s.landed && s.t >= (s.fewer ? 0.6 : 0.28)) { s.landed = true; Sc.fx?.gutter?.(s.fewer ? 0.5 : 1); }
      if (!s.reduced && !s.fewer) me.pitch += (FACE.look - me.pitch) * Math.min(1, dt * 8);   // (you look down at it, under your chin)
      if (!s.reduced && !s.fewer) { const sh = clamp(s.t / 0.15, 0, 1); cam.position.x += Math.sin(now * 41) * 0.035 * sh; cam.position.y += Math.sin(now * 29) * 0.035 * sh; }
      return;
    }
    if (!deathCam) {
      // the camera swings out the way there is most room (behind you, unless a wall is there)
      let a0 = me.yaw + Math.PI, room = -1;
      for (let k = 0; k < 8; k++) { const a = me.yaw + Math.PI + k * Math.PI / 4; let r = 0; while (r < 3.6 && grid.los(me.x, me.z, me.x + Math.sin(a) * (r + 0.6), me.z + Math.cos(a) * (r + 0.6))) r += 0.3; if (r > room + 0.31) { room = r; a0 = a; } }
      deathCam = { t0: s.t, a0, wasView: Sc.view, yaw: me.yaw };
      body.root.visible = true; Sc.hand.visible = false;
      body.root.rotation.order = 'YXZ';
      play('ghoul-snarl', null, 0.6);
    }
    const t = s.t - deathCam.t0;
    // the body: spun round (fast, slowing), then over backwards, X eyes as it lands
    const spin = s.reduced ? 0 : (1 - Math.exp(-t * 1.6)) * Math.PI * 2 * 2.2;
    const fall = smooth(clamp((t - 1.3) / 0.55, 0, 1));
    body.root.position.set(me.x, me.y + 0.12 * fall, me.z);
    body.root.rotation.y = me.yaw + spin;
    body.root.rotation.x = -Math.PI / 2 * fall + (fall >= 1 && !s.reduced ? Math.sin((t - 1.85) * 14) * 0.06 * Math.exp(-(t - 1.85) * 5) : 0);
    if (Sc.view === 'fp') body.update(dt, now, 0, t < 1.3 ? 'startle' : 'idle');
    if (fall >= 1 && !s.xeyes) { s.xeyes = true; setXEyes(body, true); play('ghoul-thud', _v.set(me.x, 0.2, me.z).add(origin), 0.8); }
    if (Sc.fx && 'dim' in Sc.fx) Sc.fx.dim = 0.75 * fall; // (the lantern dims as you go down)
    // the camera pulls out of your eyes and swings round a little (reduced motion: a still shot from behind)
    const pull = smooth(clamp(t / 0.9, 0, 1)), orbit = s.reduced ? 0 : smooth(clamp(t / 3, 0, 1)) * 1.9;
    const a = deathCam.a0 + orbit, h = 1.5 + 0.55 * pull;
    // (out as far as the walls let it: a body-wide clear line from you to the camera, pulled in short of the wall)
    let r = 0.3 + 3.0 * pull;
    for (; r > 0.6; r -= 0.2) { const cx = me.x + Math.sin(a) * (r + 0.45), cz = me.z + Math.cos(a) * (r + 0.45); if (grid.los(me.x, me.z, cx, cz) && grid.los(me.x + Math.cos(a) * 0.4, me.z - Math.sin(a) * 0.4, cx + Math.cos(a) * 0.4, cz - Math.sin(a) * 0.4) && grid.los(me.x - Math.cos(a) * 0.4, me.z + Math.sin(a) * 0.4, cx - Math.cos(a) * 0.4, cz + Math.sin(a) * 0.4)) break; }
    cam.position.set(me.x + Math.sin(a) * r, me.y + h, me.z + Math.cos(a) * r).add(origin);
    _v.set(me.x, me.y + 0.6 + 0.4 * (1 - fall), me.z).add(origin);
    cam.lookAt(_v);
    if (t > 3.6 && !s.faded) { s.faded = true; ui.el.fade.style.background = '#000'; ui.fade(1, 900); }
    if (t > 4.7 && !s.out) { s.out = true; Sc.onOut('taken'); }
  }

  // ---- a friend grabbed (seen from outside: the ghoul on them, them spun about) or taken (over they go, X eyes, then gone)
  function stepFriends(dt) {
    for (const [sid, f] of friendSeq) {
      const r = Sc.remotes.get(sid);
      if (!r) { friendSeq.delete(sid); continue; }
      f.t += dt;
      const root = r.h.root;
      if (!f.taken) {
        const sh = clamp(f.t / 0.3, 0, 1) * (1 - clamp((f.t - 2.4) / 0.4, 0, 1)) * (f.n === 2 ? 1.5 : 1);
        root.rotation.y = r.tr + Math.sin(f.t * 9) * 0.9 * sh;
        root.position.x += Math.sin(f.t * 31) * 0.06 * sh; root.position.z += Math.cos(f.t * 27) * 0.06 * sh;
        if (f.t > 3.6) friendSeq.delete(sid);
      } else {
        f.tt += dt;
        if (f.tt < 0) continue; // (the face first)
        root.rotation.order = 'YXZ';
        const spin = (1 - Math.exp(-f.tt * 1.6)) * Math.PI * 2 * 2;
        const fall = smooth(clamp((f.tt - 1.0) / 0.55, 0, 1));
        root.rotation.y = r.tr + spin; root.rotation.x = -Math.PI / 2 * fall; root.position.y += 0.12 * fall;
        if (fall >= 1 && !f.x) { f.x = true; setXEyes(r.h, true); }
        if (f.tt > 2.2 && !f.said) { f.said = true; ui.chatLine(null, null, `${f.name || 'Someone'} was taken.`, true); }
      }
    }
  }

  function dispose() {
    if (Sc.fx && 'threat' in Sc.fx) { Sc.fx.threat = 0; Sc.fx.hush = 0; Sc.fx.dim = 0; }
    disposed = true;
    vig.remove(); hideLine.remove();
    for (const d of disposers) { try { d(); } catch (e) { console.error('[maze-ghoul] dispose', e); } }
    if (Sc.body?.root) { Sc.body.root.rotation.set(0, 0, 0); Sc.body.root.rotation.order = 'XYZ'; }
  }

  return {
    frame, dispose,
    wake: () => wakeInYard(ctx),
    // while it holds you, you do not move (maze-scene.js reads this)
    get frozen() { return !!seq; },
    // tests and pictures
    get views() { return views.filter(Boolean).map(v => ({ i: v.i, x: v.x, z: v.z, yaw: v.yaw, s: v.s, visible: v.visible, dist: v.dist, path: v.path, speed: v.speed, tsid: v.tsid, buf: v.buf.length, pinned: !!v.pin, free: +v.rig.free.toFixed(2), lift: +(v.rig.out.leapY || 0).toFixed(3), y: +v.gh.root.position.y.toFixed(3) })); },
    get seq() { return seq ? { kind: seq.kind, n: seq.n, t: seq.t, fewer: seq.fewer, reduced: seq.reduced, xeyes: !!seq.xeyes, faded: !!seq.faded } : null; },
    get danger() { return danger; }, get hidden() { return hiddenK > 0.5; }, get vignette() { return Sc.fx && 'threat' in Sc.fx ? Sc.fx.threat : +vig.style.opacity; },
    get grabs() { return myGrabs; }, get respite() { return myRespite; },
    get friends() { return [...friendSeq.entries()].map(([sid, f]) => ({ sid, n: f.n, taken: f.taken, said: f.said, x: !!f.x })); },
    sounds, events, curtains, views3: views, FACE,
    // put a ghoul somewhere on this screen only (the budgets and the pictures), or give it back to the server
    pin(i = 0, x = me.x, z = me.z + 3, yaw = Math.PI, s = 'wander', speed = 0) { const v = views[i] || makeView(i); v.pin = { x, z, yaw, s, speed }; v.px = null; return true; },
    unpin(i = 0) { if (views[i]) views[i].pin = null; },
    // the test op (lib/maze.js, MAZE_GHOUL_TEST=1): ask the server, the answer comes back here
    // (a test's seconds { t } go as `secs`: spread over the message they'd replace its type and the server would drop it)
    async gtest(cmd, extra = {}) { testReply = null; const { t: secs, ...rest } = extra; net.send({ ...rest, ...(secs !== undefined ? { secs } : {}), t: 'maze', op: 'gtest', cmd }); for (let i = 0; i < 60 && !testReply; i++) await new Promise(r => setTimeout(r, 25)); return testReply; },
  };
}
