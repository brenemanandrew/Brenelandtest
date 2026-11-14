// Beneath Angell Street: the locked gates rattle. Keep rattling one and the ghoul shows up on the other side, leaps at it and shakes
// it roughly. After 15 seconds it tears the gate down and comes for you, unless you've run off.
//
// The gates' leaves are drawn here, one small mesh each, so they can shake and fall (maze-kit.js builds the rest of the maze and,
// with `gates: false`, leaves the gates to this). The rules are the server's (lib/maze.js rattle, lib/maze-ghoul.js: three rattles
// in six seconds, the ghoul out of sight behind the gate while your lantern gutters, at the bars a second later, the gate down after
// 15 s of its rattling). This draws and voices what it says:
//   E at a gate        rattle(i): it shakes and clanks here at once (positional, through the stone's echo: maze-audio.js aud.play),
//                      and the server tells the others ({ op: 'gate', e: 'rattle' }) so they see and hear it too
//   the ghoul comes    (gev e: 'gate', phase: 'come') your lantern nearly goes out for a moment, then ('leap') it's at the bars
//                      (maze-ghoul.js draws it there, hands through, jaws working) rattling them roughly: the gate jumps and
//                      clangs, a growl now and then, and the view shakes a little within a few metres (not under reduced
//                      motion, less with Fewer jump scares)
//   down               (phase 'down', or `down` in the run's `enter` for a late joiner) the leaf falls flat toward the corridor and
//                      the gate's colliders go. The dead end stays open for the rest of the run, for everyone
import * as THREE from 'three';
import { Batcher, GEO } from './batch.js';
import { CELL, DIRS } from './maze-gen.js';
import { fewerScares } from './settings.js';
import { gateRng, gateLeaf, gatePosts } from './maze-props.js';

const IRON = '#26262d', LOCK = '#3a3a44';
export const GATE = { near: 2.4, shake: 0.03, rough: 0.11, every: 0.26, fall: 0.7, rough0: 0.28, rough1: 0.5 };
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

function registerGateSfx(audio) {
  if (!audio?.registerSfx || audio._mazeGateSfx) return;
  audio._mazeGateSfx = true;
  // the ghoul at the bars: a heavy shake, the bars clanging in their frame, the lock knocking
  audio.registerSfx('maze-gate-rough', (a, x, y, z, o = {}) => { const k = o.k ?? 1, out = a.at(x, y, z, 5), t = a.ctx.currentTime;
    for (let i = 0; i < 4; i++) a.burst(out, { t: t + i * 0.05 + Math.random() * 0.02, dur: 0.08, type: 'bandpass', f: 600 + Math.random() * 900, Q: 5, peak: 0.13 * k });
    a.tone(out, { f: 140 + Math.random() * 40, glide: 95, t: t + 0.02, d: 0.45, peak: 0.06 * k, type: 'triangle' });
    a.burst(out, { t, dur: 0.12, type: 'lowpass', f: 300, Q: 0.8, peak: 0.08 * k, brown: true }); });
  // the gate torn out: a wrench of iron, then the leaf slamming flat
  audio.registerSfx('maze-gate-down', (a, x, y, z) => { const out = a.at(x, y, z, 6), t = a.ctx.currentTime;
    a.burst(out, { t, dur: 0.35, type: 'bandpass', f: 900, Q: 3, peak: 0.12, sweep: 400 });
    a.tone(out, { f: 220, glide: 70, t, d: 0.5, peak: 0.07, type: 'sawtooth' });
    for (let i = 0; i < 6; i++) a.burst(out, { t: t + 0.62 + i * 0.045, dur: 0.1, type: 'bandpass', f: 500 + Math.random() * 1200, Q: 4, peak: 0.16 * (1 - i * 0.12) });
    a.burst(out, { t: t + 0.6, dur: 0.4, type: 'lowpass', f: 220, Q: 0.7, peak: 0.16, brown: true }); });
}

export function createMazeGates(ctx, { maze, kit, group, origin, aud, cam, me, getFx, gates0 = null }) {
  const { audio, net, ui } = ctx;
  registerGateSfx(audio);
  const yawOf = dir => [Math.PI, -Math.PI / 2, 0, Math.PI / 2][dir]; // maze-kit.js sideYaw: local +z into the dead end
  const list = maze.gates.map((q, i) => {
    const d = DIRS[q.dir], mx = q.cx * CELL + CELL / 2, mz = q.cy * CELL + CELL / 2;
    const gx = mx + d[0] * CELL / 2, gz = mz + d[1] * CELL / 2;
    const pivot = new THREE.Group(); pivot.name = 'maze-gate'; pivot.position.set(gx, 0, gz); pivot.rotation.y = yawOf(q.dir);
    const leaf = new THREE.Group(); pivot.add(leaf);
    // the leaf (bars, rails, the lock) as maze-kit.js drew it; the posts stay standing
    const b = new Batcher({ vertexColors: true, castShadow: true, receiveShadow: true });
    const h = gateRng(q); h(); h(); h(); h(); // maze-props.js's leaf, rusted and riveted, with a padlock. The kit's gateStone took the first draws
    gateLeaf(b, h);
    const leafMeshes = b.build(leaf, 'maze-gate-leaf');
    const p = new Batcher({ vertexColors: true, castShadow: true, receiveShadow: true });
    gatePosts(p); // with hinges and straps
    const postMeshes = p.build(pivot, 'maze-gate-posts');
    group.add(pivot);
    return { i, q, d, gx, gz, out: { x: gx + d[0] * 0.9, z: gz + d[1] * 0.9 }, pivot, leaf, meshes: [...leafMeshes, ...postMeshes], shakeT: 9, shakeK: 0, down: false, fallT: 0, told: false };
  });
  let at = null;            // { i, phase: 'come' | 'leap', t } the gate the ghoul is at
  let roughT = 0, growlT = 0, dimT = 0;
  const log = { rattles: 0, rough: 0, downs: 0, shakes: 0, heard: 0 }; // for the tests
  const world = (g, y = 1.4) => ({ x: g.gx + origin.x, y: y + origin.y, z: g.gz + origin.z });

  // the colliders of gate i (both cells keep a copy: maze-kit.js) go when it is down
  function unblock(g) {
    const q = g.q, cells = [[q.cx, q.cy], [q.cx + g.d[0], q.cy + g.d[1]]];
    for (const [x, y] of cells) { if (x < 0 || y < 0 || x >= maze.W || y >= maze.H) continue; const bx = kit.cellBoxes[y * maze.W + x]; for (let k = bx.length - 1; k >= 0; k--) { const b = bx[k]; if (b.gate && Math.abs((b.minX + b.maxX) / 2 - g.gx) < 0.3 && Math.abs((b.minZ + b.maxZ) / 2 - g.gz) < 0.3) bx.splice(k, 1); } }
  }
  function fallNow(g, instant) { if (g.down) return; g.down = true; g.fallT = instant ? GATE.fall : 0; unblock(g); log.downs++; if (!instant) aud.play('maze-gate-down', world(g).x, world(g).y, world(g).z); }
  for (const i of gates0?.down || []) if (list[i]) fallNow(list[i], true);
  if (gates0?.at && list[gates0.at.i]) at = { i: gates0.at.i, phase: gates0.at.phase, t: performance.now() / 1000 };

  // a shake of gate i: k 1 a hand on it, more for the ghoul's
  function shake(g, k) { g.shakeT = 0; g.shakeK = k; g.seed = Math.random() * 10; log.shakes++; }
  // E at gate i (maze-scene.js): it shakes and clanks here at once; the server tells the others and hears it
  function rattle(i) {
    const g = list[i]; if (!g || g.down) return false;
    shake(g, 1); const w = world(g, 1.2); aud.play('maze-gate', w.x, w.y, w.z); log.rattles++;
    net.send({ t: 'maze', op: 'rattle', i });
    if (!g.told) { g.told = true; ui.toast('Locked tight. Rusted shut, and the key is long gone.', 2600); }
    return true;
  }
  // the gate you stand at (within reach of its middle; the server counts a rattle only from the corridor side), or -1
  function near(x, z) {
    for (const g of list) { if (g.down) continue; if (Math.hypot(x - g.gx, z - g.gz) <= GATE.near) return g.i; }
    return -1;
  }
  const off = net.on('maze', m => {
    if (m.op === 'gate' && m.e === 'rattle') { const g = list[m.i]; if (!g || g.down || m.sid === net.sid) return; shake(g, 1); const w = world(g, 1.2); aud.play('maze-gate', w.x, w.y, w.z); log.heard++; return; }
    if (m.op !== 'gev' || m.e !== 'gate') return;
    const g = list[m.i]; if (!g) return;
    if (m.phase === 'come') { at = { i: m.i, phase: 'come', t: performance.now() / 1000 }; const fx = getFx(); fx?.gutter?.(1); if (fx && 'dim' in fx) { fx.dim = 0.85; dimT = 1.1; } }
    else if (m.phase === 'leap') { at = { i: m.i, phase: 'leap', t: performance.now() / 1000 }; roughT = 0; growlT = 0.2; }
    else if (m.phase === 'down') { at = null; fallNow(g, false); }
  });

  function update(dt, now) {
    if (dimT > 0) { dimT -= dt; if (dimT <= 0) { const fx = getFx(); if (fx && fx.dim >= 0.84) fx.dim = 0; } }
    // the ghoul at the bars: rough shakes and clangs, a growl now and then, the view shaking a little when you are close
    if (at && at.phase === 'leap') {
      const g = list[at.i], fewer = fewerScares();
      roughT -= dt;
      if (roughT <= 0 && !g.down) { roughT = GATE.rough0 + Math.random() * (GATE.rough1 - GATE.rough0); shake(g, fewer ? 2.2 : 3.4); const w = world(g, 1.3); aud.play('maze-gate-rough', w.x, w.y, w.z, { k: fewer ? 0.6 : 1 }); log.rough++; }
      growlT -= dt;
      if (growlT <= 0) { growlT = 1.6 + Math.random() * 1.4; const w = world(g, 0.9); aud.play('ghoul-growl', w.x - g.d[0] * 0.5, w.y, w.z - g.d[1] * 0.5, { k: fewer ? 0.45 : 0.9 }); }
      const dist = Math.hypot(me.x - g.gx, me.z - g.gz);
      if (dist < 4.5 && !reducedMotion() && g.shakeT < 0.25) { const k = (1 - dist / 4.5) * (fewer ? 0.012 : 0.03) * (1 - g.shakeT / 0.25); cam.position.x += Math.sin(now * 61) * k; cam.position.y += Math.sin(now * 47 + 1) * k; }
    }
    for (const g of list) {
      g.pivot.visible = Math.hypot(me.x - g.gx, me.z - g.gz) < 30;
      if (!g.pivot.visible) continue;
      if (g.down) { // falls flat toward the corridor, a bounce at the end
        g.fallT = Math.min(GATE.fall, g.fallT + dt);
        const u = g.fallT / GATE.fall, e = u < 0.82 ? (u / 0.82) ** 2 : 1 - Math.sin((u - 0.82) / 0.18 * Math.PI) * 0.05;
        g.leaf.rotation.set(-Math.PI / 2 * e, 0, 0); g.leaf.position.set(0, 0.05 * e, 0); continue;
      }
      g.shakeT += dt;
      const dur = g.shakeK > 1.5 ? 0.42 : 0.5, u = g.shakeT / dur;
      if (u < 1) {
        const env = (1 - u) * (1 - u), a = g.shakeK > 1.5 ? GATE.rough : GATE.shake, s = g.seed || 0;
        g.leaf.position.set(Math.sin(g.shakeT * 37 + s) * a * 0.3 * env, 0, Math.sin(g.shakeT * 43 + s) * a * env * (g.shakeK / 2 + 0.5));
        g.leaf.rotation.set(Math.sin(g.shakeT * 29 + s) * a * 0.25 * env, 0, Math.sin(g.shakeT * 33 + s) * a * 0.4 * env);
      } else if (g.leaf.position.z !== 0) { g.leaf.position.set(0, 0, 0); g.leaf.rotation.set(0, 0, 0); }
    }
  }
  function dispose() { off?.(); for (const g of list) { group.remove(g.pivot); for (const m of g.meshes) m.geometry.dispose(); } }
  return { list, rattle, near, update, dispose, log, get at() { return at; }, get down() { return list.filter(g => g.down).map(g => g.i); } };
}
