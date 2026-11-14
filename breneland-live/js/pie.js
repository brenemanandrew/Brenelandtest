// The pie eating contest at the picnic: sit at the long table on the picnic lawn's north side, and when the bell goes mash E or
// Space (the pad's A, the phone's big BITE button) to eat pies under a big pie overlay. The cartoon pie loses a bite at every
// press (crumbs fly, it wobbles), GULP! and the next one slides in. Your empty tins stack up beside you. Bots fill the empty
// seats (Grandma Pearl, Hungry Hank, Little Pip, Big Bertha). About half a minute after a countdown, then the winner, the same on
// every screen: the server (lib/pie.js) seats people, counts the bites, runs the clock and keeps the board of the three most
// recent winners. Once a week per player (from Monday, Eastern). You never need more than about 8 presses a second, a held key
// counts once, and the shake honours reduced motion.
import * as THREE from 'three';
import { Human } from './human.js';
import { toon } from './toon.js';
import { terrainHeight } from './terrain.js';
import { loadCss, el } from './util.js';
import { ANIM_CODES } from './codes.js';
import { paintTexture, boardMesh, TABLE } from './picnic-build.js';
import { piesOf, pieNeed, SEATS, BOTS, botById, shortDate, MS } from './pie-rules.js';

const SEATED_ANIMS = new Set(['sit', 'drink', 'cheer', 'wave', 'laugh', 'talk']);
const BOT_LOOK = {
  pearl: { shirt: '#c98bd9', pants: '#6d5a8a', hair: '#d9d6e0', hairStyle: 'bun', skin: '#f6d3b3', glasses: 'round', outfit: 'blazer', height: 0.3, body: 'f', shape: 0.9, mouth: 'smile', lines: true },
  hank: { shirt: '#c0392b', pants: '#3f5f8f', hair: '#4a3020', hairStyle: 'short', skin: '#e8b88a', hat: 'cap', hatColor: '#2f5b3a', facialHair: 'beard', build: 0.9, height: 0.62, body: 'm', shape: 0.1, outfit: 'tee', mouth: 'grin' },
  pip: { shirt: '#f2b630', pants: '#3f8fd9', hair: '#c9873a', hairStyle: 'spiky', skin: '#f6d3b3', scale: 0.78, height: 0.2, build: 0.3, mouth: 'grin', bottoms: 'shorts' },
  bertha: { shirt: '#ff8fb8', pants: '#2e2e36', hair: '#1e1a18', hairStyle: 'curly', skin: '#a86b45', outfit: 'overalls', build: 0.82, height: 0.72, body: 'f', shape: 0.85, mouth: 'smile' },
};
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

// The big pie: an SVG drawn once; each bite masks a scallop out of it, from the rim in toward the middle (a spiral of bites)
const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, parent = null) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
function biteSpot(k, need) {
  const f = (k + 0.5) / need, a = k * 2.399 + 0.6;          // golden angle round the pie, spiralling in as it goes
  const r = 1 - f * 0.92;
  return { x: 100 + Math.cos(a) * 84 * r, y: 76 + Math.sin(a) * 46 * r, r: 15 + 16 * f };
}

export function createPieContest(ctx) {
  const { scene, player, areas, net, ui, audio, remotes, input, hud, camera } = ctx;
  const area = areas.find(a => a.id === 'north-lawn');
  const P = area?.npcSpec?.picnic;
  if (!P || !P.contestSeats) return null;
  const seats = P.contestSeats, C = P.contest, top = C.top;
  loadCss('/css/pie.css');

  // ---------------------------------------------------------------- 3D: the pies at each place, the empty tins, the board
  const STACK = 16;
  const tinGeo = new THREE.CylinderGeometry(0.17, 0.13, 0.03, 14), crustGeo = new THREE.CylinderGeometry(0.15, 0.14, 0.05, 14), fillGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.012, 14);
  const tins = new THREE.InstancedMesh(tinGeo, toon('#dfe2e8'), SEATS * (STACK + 1));
  const crusts = new THREE.InstancedMesh(crustGeo, toon('#e0a050'), SEATS), fills = new THREE.InstancedMesh(fillGeo, toon('#b8323a'), SEATS);
  for (const m of [tins, crusts, fills]) { m.name = 'pie-tins'; m.castShadow = true; m.receiveShadow = true; scene.add(m); }   // (culled by the bounds of what they draw: drawPies refreshes them)
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S3 = new THREE.Vector3();
  const placeOf = i => ({ x: seats[i].x, y: top.y + 0.004, z: seats[i].z + TABLE.off - 0.27 });   // on the top, in front of the eater
  const stackOf = i => ({ x: seats[i].x + 0.36, y: top.y + 0.004, z: seats[i].z + TABLE.off - 0.33 });
  const shown = new Array(SEATS).fill(-1).map(() => ({ key: '' }));
  function setInst(mesh, j, x, y, z, s, ry = 0, sy = s) {
    Q.setFromAxisAngle(V.set(0, 1, 0), ry); M4.compose(V.set(x, y, z), Q, S3.set(s, sy, s)); mesh.setMatrixAt(j, M4);
  }
  function drawPies() {
    let any = false;
    for (let i = 0; i < SEATS; i++) {
      const s = St.seats[i], live = St.phase === 'count' || St.phase === 'eat' || St.phase === 'done';
      const b = s ? shownBites(i) : 0, q = piesOf(b);
      const key = (live ? 'L' : 'W') + (s ? 1 : 0) + ':' + q.pies + ':' + q.into;
      if (shown[i].key === key) continue;
      shown[i].key = key; any = true;
      const p = placeOf(i), st = stackOf(i);
      // the pie in front of you: whole while waiting, shrinking bite by bite in a round, a fresh one after each gulp
      const left = live && s ? 1 - q.into / q.need : 1;
      setInst(tins, i, p.x, p.y + 0.015, p.z, 1);
      const k = Math.max(0.05, Math.sqrt(left));
      setInst(crusts, i, p.x, p.y + 0.045, p.z, k, q.into * 0.7, Math.max(0.3, left));
      setInst(fills, i, p.x, p.y + 0.045 + 0.026 * Math.max(0.3, left), p.z, k * 0.98, q.into * 0.7);
      // the tower of empty tins beside you
      for (let t = 0; t < STACK; t++) {
        const j = SEATS + i * STACK + t;
        if (live && s && t < q.pies) setInst(tins, j, st.x + Math.sin(t * 2.1) * 0.012, st.y + 0.015 + t * 0.024, st.z + Math.cos(t * 1.7) * 0.012, 1, t * 0.4);
        else setInst(tins, j, st.x, st.y, st.z, 0.0001);   // (an empty place in the tower: nothing drawn, kept inside the bounds)
      }
    }
    if (any) for (const m of [tins, crusts, fills]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
  }

  // the winners board's painted face (picnic-build.js built its frame)
  const B = P.board, bfx = Math.sin(B.yaw), bfz = Math.cos(B.yaw);
  const bx = area.x + B.u, bz = area.z + B.v, by = terrainHeight(bx, bz);
  let boardList = [];
  const boardPic = paintTexture(512, 400, (g, w, h) => {
    g.fillStyle = '#fff6ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e0463c'; g.fillRect(0, 0, w, 92);
    for (let x = 0; x < w; x += 40) { g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(x, 92); g.lineTo(x + 20, 112); g.lineTo(x + 40, 92); g.fill(); }
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 54px "Fredoka", "Trebuchet MS", sans-serif'; g.fillText('PIE CHAMPIONS', w / 2, 48);
    const medal = ['#e6b84a', '#c9ccd6', '#d08a52'];
    for (let r = 0; r < 3; r++) {
      const y = 158 + r * 82, e = boardList[r];
      g.fillStyle = medal[r]; g.beginPath(); g.arc(52, y, 26, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#7a3a2a'; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#7a3a2a'; g.font = '700 30px "Fredoka", sans-serif'; g.textAlign = 'center'; g.fillText(String(r + 1), 52, y + 1);
      g.textAlign = 'left';
      if (!e) { g.fillStyle = '#a89a8a'; g.font = '600 32px "Fredoka", sans-serif'; g.fillText(r ? '...' : 'Be the first!', 96, y); continue; }
      g.fillStyle = '#2b2340'; let s = 36; g.font = `700 ${s}px "Fredoka", sans-serif`;
      while (g.measureText(e.n).width > 220 && s > 18) { s -= 2; g.font = `700 ${s}px "Fredoka", sans-serif`; }
      g.fillText(e.n, 96, y - 12);
      g.fillStyle = '#b8323a'; g.font = '600 26px "Fredoka", sans-serif'; g.fillText(`${e.p} pie${e.p === 1 ? '' : 's'}`, 96, y + 22);
      g.fillStyle = '#6d6480'; g.textAlign = 'right'; g.font = '600 26px "Fredoka", sans-serif'; g.fillText(shortDate(e.d), w - 28, y);
    }
    g.strokeStyle = '#6b4a2e'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  });
  const boardFace = boardMesh(1.3, 1.0, 0.03, boardPic.tex, '#6b4a2e');
  boardFace.position.set(bx + bfx * 0.005, by + 1.38, bz + bfz * 0.005); boardFace.rotation.y = B.yaw; boardFace.name = 'pie-board';
  scene.add(boardFace);
  const setBoard = list => { const k = JSON.stringify(list || []); if (k === JSON.stringify(boardList)) return; boardList = (list || []).slice(0, 3); boardPic.paint(); };

  // ---------------------------------------------------------------- the bots' bodies (built the first time they sit down)
  const botBody = {};
  function bodyFor(id) {
    if (botBody[id]) return botBody[id];
    const h = new Human({ ...BOT_LOOK[id] });
    h.root.visible = false; scene.add(h.root);
    const tag = ui.nameTag(h.root, botById(id)?.name || id, '#ffffff'); tag.max = 16; tag.fade = 11;
    return (botBody[id] = { h, tag, bites: 0, chompT: -9 });
  }

  // ---------------------------------------------------------------- sounds
  audio.registerSfx?.('pie-bell', (a, x, y, z) => { const o = a.at(x, y, z, 6), t = a.ctx.currentTime; for (const [f, p, d] of [[1318, 0.12, 1.4], [2637, 0.05, 0.9], [3951, 0.03, 0.5]]) { a.tone(o, { f, t, d, peak: p, type: 'sine' }); a.tone(o, { f, t: t + 0.32, d, peak: p * 0.8, type: 'sine' }); } });
  audio.registerSfx?.('pie-chomp', (a, x, y, z) => { const o = a.at(x, y, z, 2), t = a.ctx.currentTime; a.burst(o, { t, dur: 0.06, type: 'lowpass', f: 900 + Math.random() * 500, peak: 0.07, brown: true }); a.tone(o, { f: 170 + Math.random() * 40, glide: 110, t, d: 0.05, peak: 0.04, type: 'triangle' }); });
  audio.registerSfx?.('pie-gulp', (a, x, y, z) => { const o = a.at(x, y, z, 3), t = a.ctx.currentTime; a.tone(o, { f: 240, glide: 85, t, d: 0.24, peak: 0.12, type: 'sine' }); a.tone(o, { f: 520, glide: 300, t: t + 0.05, d: 0.08, peak: 0.04, type: 'triangle' }); });

  // ---------------------------------------------------------------- the HUD
  const root = el('div', 'pie-hud', '', { hidden: '', 'aria-live': 'polite' });
  const card = el('div', 'pie-card');                          // the lobby card and the board of names
  const title = el('div', 'pie-title', 'Pie eating contest');
  const sub = el('div', 'pie-sub', '');
  const lanes = el('div', 'pie-lanes');
  const laneEls = Array.from({ length: SEATS }, () => {
    const row = el('div', 'pie-lane'), name = el('b', 'pl-name', ''), count = el('span', 'pl-count', ''), bar = el('i', 'pl-bar'), fill = el('i', 'pl-fill');
    bar.append(fill); row.append(name, count, bar); lanes.append(row);
    return { row, name, count, fill };
  });
  const leave = el('button', 'pie-leave', 'Leave seat', { type: 'button' });
  const tip = el('div', 'pie-tip', '');
  const foot = el('div', 'pie-foot');
  foot.append(tip, leave);
  card.append(title, sub, lanes, foot);
  const big = el('div', 'pie-big', '', { 'aria-hidden': 'true' });  // the big pie (yours, while you eat)
  const svg = svgEl('svg', { viewBox: '0 0 200 150', class: 'pie-svg' });
  const defs = svgEl('defs', {}, svg), mask = svgEl('mask', { id: 'pie-bites', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 200, height: 150 }, defs);
  svgEl('rect', { x: 0, y: 0, width: 200, height: 150, fill: 'white' }, mask);
  const biteG = svgEl('g', { fill: 'black' }, mask);
  svgEl('ellipse', { cx: 100, cy: 82, rx: 96, ry: 56, class: 'pie-tin' }, svg);
  svgEl('ellipse', { cx: 100, cy: 78, rx: 86, ry: 48, class: 'pie-tin-in' }, svg);
  const pieG = svgEl('g', { mask: 'url(#pie-bites)' }, svg);
  svgEl('ellipse', { cx: 100, cy: 80, rx: 88, ry: 50, class: 'pie-crust-side' }, pieG);
  svgEl('ellipse', { cx: 100, cy: 74, rx: 86, ry: 47, class: 'pie-crust' }, pieG);
  svgEl('ellipse', { cx: 100, cy: 73, rx: 72, ry: 38, class: 'pie-fill' }, pieG);
  for (let i = 0; i < 5; i++) { const x = 44 + i * 28; svgEl('path', { d: `M${x - 10} ${44} L${x + 12} ${104}`, class: 'pie-lattice' }, pieG); svgEl('path', { d: `M${x + 12} ${44} L${x - 10} ${104}`, class: 'pie-lattice' }, pieG); }
  for (let i = 0; i < 6; i++) svgEl('circle', { cx: 60 + (i * 37) % 84, cy: 60 + (i * 23) % 30, r: 3.4, class: 'pie-cherry' }, pieG);
  big.append(svg);
  const gulp = el('div', 'pie-gulp', 'GULP!', { hidden: '' });
  const crumbs = el('div', 'pie-crumbs');
  big.append(crumbs, gulp);
  const clock = el('div', 'pie-clock', '');                    // 3, 2, 1, EAT! and the time left
  const btn = el('button', 'pie-btn', 'BITE!', { type: 'button', 'aria-label': 'Take a bite' });
  const win = el('div', 'pie-win', '', { hidden: '' });
  const confetti = el('div', 'pie-confetti-layer', '', { 'aria-hidden': 'true' });   // (behind the winner's banner: it falls round it, never over its words)
  root.append(card, clock, big, btn, confetti, win);
  hud?.append(root);
  btn.addEventListener('pointerdown', e => { e.preventDefault(); bite(); btn.classList.add('press'); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, () => btn.classList.remove('press'));
  btn.addEventListener('click', e => { if (e.detail === 0) bite(); });   // (keyboard focus or the pad's HUD focus)
  leave.addEventListener('click', () => standUp(true));

  // ---------------------------------------------------------------- state from the server
  let St = { phase: 'idle', seats: [null, null, null, null], t0: 0, t1: 0, r: 0, winner: null, board: [] };
  let me = -1, played = false, sent = 0, sentRound = -1, lastBiteAt = 0, myShownPies = 0, myShownInto = 0, saidBell = '', winShown = -1;
  const shownBites = i => { const s = St.seats[i]; if (!s) return 0; return i === me && sentRound === St.r ? Math.max(s.b, Math.min(sent, s.b + 4)) : s.b; };
  net.on('pie', m => {
    if (m.op === 'me') { played = !!m.played; return; }
    if (m.op === 'no') {
      const why = { busy: 'A round is on. Watch, and sit down for the next one!', week: "You've had your pies this week! Come back on Monday.", far: 'Come closer to the contest table.', full: 'Every seat is taken. Next round!' }[m.why] || 'Not now.';
      if (m.why === 'far' && !retried && Math.hypot(player.pos.x - C.x, player.pos.z - C.z) < 5) { retried = true; setTimeout(askSit, 700); return; }   // (the server had not heard where you are yet)
      ui.toast(why, 3200); pending = 0; return;
    }
    if (m.op !== 'state') return;
    const prevPhase = St.phase;
    St = m;
    setBoard(m.board);
    const mine = m.seats.findIndex(s => s && s.sid === net.sid);
    if (mine < 0) leaving = 0;
    if (mine >= 0 && me < 0 && !(leaving && performance.now() - leaving < 3000)) sitDown(mine);   // (not while our own stand is on its way)
    else if (mine < 0 && me >= 0) standUp(false);
    if (m.phase !== prevPhase) onPhase(prevPhase, m.phase);
  });
  function onPhase(from, to) {
    const near = Math.hypot(player.pos.x - C.x, player.pos.z - C.z) < 30;
    if (to === 'count' && near) { audio.play?.('pie-bell', C.x, top.y + 0.4, C.z); }
    if (to === 'eat') { sent = 0; sentRound = St.r; resetBig(); }
    if (to === 'done' && near) audio.play?.('pie-bell', C.x, top.y + 0.4, C.z);
  }

  // ---------------------------------------------------------------- sitting down and getting up
  let pending = 0, satAt = 0, leaving = 0, retried = false;
  function nearestFree(px, pz) {
    let best = -1, bd = Infinity;
    seats.forEach((s, i) => { if (St.seats[i]) return; const d = Math.hypot(px - s.x, pz - s.z); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function askSit() {
    if (played) { ui.toast("You've had your pies this week! Come back on Monday.", 3200); return; }
    if (St.phase !== 'idle' && St.phase !== 'lobby') { ui.toast('A round is on. Watch, and sit down for the next one!', 2600); return; }
    const i = nearestFree(player.pos.x, player.pos.z);
    if (i < 0) { ui.toast('Every seat is taken. Next round!', 2400); return; }
    pending = performance.now();
    net.send({ t: 'pie', op: 'sit', seat: i });
  }
  function sitDown(i) {
    me = i; pending = 0; retried = false; satAt = performance.now() / 1000; measured = 0;
    const s = seats[i];
    player.pos.set(s.x, s.y, s.z); player.yaw = s.yaw;
    player.character.params.seatY = s.y - terrainHeight(s.x, s.z);
    player.character.params.table = s.table;
    player.takeover = {
      anim: 'sit', minigame: true, pie: true,
      update(dt, now, inp, pl) {
        pl.pos.set(s.x, terrainHeight(s.x, s.z), s.z); pl.yaw = s.yaw;
        const eating = St.phase === 'eat' && now - lastBiteAt < 0.35;
        this.anim = eating ? 'drink' : St.phase === 'done' && St.winner?.i === me ? 'cheer' : 'sit';
        const mv = inp.move();
        if (St.phase === 'lobby' && Math.hypot(mv.x, mv.y) > 0.6 && now - satAt > 0.8) standUp(true);
      },
      camera(dt, cam) { frameCam(cam); return true; },
    };
    ui.toast('You sat down at the pie contest. Get ready!', 2200);
    audio.ui?.('pop');
  }
  function standUp(ask) {
    if (me < 0) return;
    const s = seats[me]; me = -1;
    if (ask) { net.send({ t: 'pie', op: 'stand' }); leaving = performance.now(); }
    if (player.takeover?.pie) player.takeover = null;
    player.character.params.seatY = 0; player.character.params.table = null;
    player.pos.set(s.x, terrainHeight(s.x, s.z - 0.75), s.z - 0.75);
    player.collide?.();
  }
  // The camera while you sit: out on the lawn looking back at the eaters, fitted into the band of screen between the bottom of the
  // card and the top of the big pie (and BITE!), so every eater's whole body (a 0.9 x 1.85 x 0.9 m box, the one minigame-hud-test
  // measures) is clear of the contest's HUD whatever height the card has. The band is measured from the page (the pie and the
  // button are laid out even while hidden), and the fit is solved again only when the band, the aspect or the field of view
  // change. Fixed pitch, looking along the table's middle: the solve finds how far back and how high it stands.
  const camPos = new THREE.Vector3(), camAt = new THREE.Vector3(), _fv = new THREE.Vector3(), _fc = new THREE.PerspectiveCamera();
  const BOX = { hw: 0.45, h: 1.85, pad: 7 };   // (px of air between the band's edges and the boxes)
  let band = null, fitKey = '', fit = null, measured = 0;
  function measureBand() {
    // (the card's resting place, from its layout box, so no transform of the moment moves the band; the HUD's zoom divided in)
    const H = innerHeight || 1, rr = root.getBoundingClientRect(), k = root.offsetHeight ? rr.height / root.offsetHeight : 1;
    let t = card.offsetHeight > 0 ? rr.top + (card.offsetTop + card.offsetHeight) * k : H * 0.2, b = H * 0.66;
    for (const e of [big, btn]) { const r = e.getBoundingClientRect(); if (r.height > 0 && r.top > t + 40) b = Math.min(b, r.top); }
    band = { t: (t + BOX.pad) / H, b: (b - BOX.pad) / H };
  }
  function boxesNdc(ly, d, pitch, out) {   // the eaters' boxes seen from a camera d back along the pitch, looking at height ly
    _fc.position.set(C.x + 0.15, ly + Math.sin(pitch) * d, C.z - 1.0 + Math.cos(pitch) * d);
    _fc.lookAt(C.x + 0.15, ly, C.z - 1.0); _fc.updateMatrixWorld();
    out.y0 = Infinity; out.y1 = -Infinity; out.x0 = Infinity; out.x1 = -Infinity;
    for (const st of seats) {
      const gy = terrainHeight(st.x, st.z);
      for (let i = 0; i < 8; i++) {
        _fv.set(st.x + (i & 1 ? BOX.hw : -BOX.hw), gy + (i & 2 ? BOX.h : 0), st.z + (i & 4 ? BOX.hw : -BOX.hw)).project(_fc);
        out.y0 = Math.min(out.y0, _fv.y); out.y1 = Math.max(out.y1, _fv.y); out.x0 = Math.min(out.x0, _fv.x); out.x1 = Math.max(out.x1, _fv.x);
      }
    }
    return out;
  }
  function solveFit() {
    _fc.fov = camera.fov; _fc.aspect = camera.aspect; _fc.near = camera.near; _fc.far = camera.far; _fc.updateProjectionMatrix();
    const pitch = camera.aspect < 0.85 ? 0.26 : 0.32;
    const yt = 1 - 2 * band.t, yb = 1 - 2 * band.b, mid = (yt + yb) / 2, room = yt - yb, o = {};
    const centre = d => {   // the height that puts the boxes' middle at the band's middle (higher camera = the scene lower)
      let lo = top.y - 6, hi = top.y + 6;
      for (let k = 0; k < 24; k++) { const ly = (lo + hi) / 2, r = boxesNdc(ly, d, pitch, o); if ((r.y0 + r.y1) / 2 > mid) lo = ly; else hi = ly; }
      return (lo + hi) / 2;
    };
    let lo = 3, hi = 40;   // the nearest camera whose picture fits the band (and the screen's width)
    for (let k = 0; k < 24; k++) {
      const d = (lo + hi) / 2, r = boxesNdc(centre(d), d, pitch, o);
      if (r.y1 - r.y0 <= room && r.x0 > -0.96 && r.x1 < 0.96) hi = d; else lo = d;
    }
    const ly = centre(hi);
    return { d: hi, ly, pitch };
  }
  function frameCam(cam) {
    if (!band || measured++ < 30 || measured % 15 === 0) measureBand();   // (every frame just after sitting down, then now and then)
    const key = [band.t, band.b].map(v => v.toFixed(3)).join() + ':' + camera.aspect.toFixed(3) + ':' + camera.fov;
    if (key !== fitKey) { fitKey = key; fit = solveFit(); }
    camPos.set(C.x + 0.15, fit.ly + Math.sin(fit.pitch) * fit.d, C.z - 1.0 + Math.cos(fit.pitch) * fit.d);
    camAt.set(C.x + 0.15, fit.ly, C.z - 1.0);
    cam.position.copy(camPos); cam.lookAt(camAt);
  }

  // ---------------------------------------------------------------- biting
  function bite() {
    if (me < 0) return;
    if (St.phase === 'count') { wobble(); return; }   // (not yet: the pie just wobbles)
    if (St.phase !== 'eat') return;
    const now = performance.now() / 1000;
    lastBiteAt = now;
    if (sentRound !== St.r) { sent = 0; sentRound = St.r; }
    sent++;
    net.send({ t: 'pie', op: 'bite' });
    audio.play?.('pie-chomp', player.pos.x, player.pos.y + 1.3, player.pos.z);
    wobble(); crumb();
  }
  function wobble() { if (reduced()) return; svg.classList.remove('wob'); void svg.offsetWidth; svg.classList.add('wob'); }
  function crumb() {
    const n = reduced() ? 2 : 5;
    for (let i = 0; i < n; i++) {
      const c = el('i', 'pie-crumb');
      const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 60;
      c.style.setProperty('--dx', (Math.cos(a) * d).toFixed(0) + 'px'); c.style.setProperty('--dy', (Math.sin(a) * d * 0.6 - 30).toFixed(0) + 'px');
      c.style.left = (30 + Math.random() * 40) + '%'; c.style.top = (30 + Math.random() * 30) + '%';
      crumbs.append(c);
      setTimeout(() => c.remove(), 650);
    }
  }
  let bitesDrawn = 0, pieDrawn = 0;
  function resetBig() { while (biteG.firstChild) biteG.removeChild(biteG.firstChild); bitesDrawn = 0; pieDrawn = 0; }
  function drawBig() {
    if (me < 0) return;
    const q = piesOf(shownBites(me));
    if (q.pies !== pieDrawn) {           // a pie gone: GULP!, and a fresh one slides in
      pieDrawn = q.pies; resetBig(); pieDrawn = q.pies;
      gulp.hidden = false; gulp.classList.remove('go'); void gulp.offsetWidth; gulp.classList.add('go');
      svg.classList.remove('fresh'); void svg.offsetWidth; svg.classList.add('fresh');
      if (!reduced()) { big.classList.remove('shake'); void big.offsetWidth; big.classList.add('shake'); }
      audio.play?.('pie-gulp', player.pos.x, player.pos.y + 1.3, player.pos.z);
      ctx.haptics?.buzz?.('crunch');
    }
    while (bitesDrawn < q.into) {   // a bite: a round hole with two tooth scallops on its far edge
      const b = biteSpot(bitesDrawn, q.need), a = Math.atan2(b.y - 76, b.x - 100);
      svgEl('circle', { cx: b.x.toFixed(1), cy: b.y.toFixed(1), r: b.r.toFixed(1) }, biteG);
      for (const d of [-0.55, 0.55]) svgEl('circle', { cx: (b.x - Math.cos(a + d) * b.r * 0.85).toFixed(1), cy: (b.y - Math.sin(a + d) * b.r * 0.85).toFixed(1), r: (b.r * 0.42).toFixed(1) }, biteG);
      bitesDrawn++;
    }
  }

  // ---------------------------------------------------------------- per frame: the HUD, the bodies at the table
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  let lastKey = '';
  function drawHud() {
    const phase = St.phase, t = net.serverNow(), seated = me >= 0;
    const near = Math.hypot(player.pos.x - C.x, player.pos.z - C.z) < 18;
    const show = seated || (near && phase !== 'idle');
    root.hidden = !show;
    if (!show) return;
    root.classList.toggle('seated', seated);
    root.dataset.phase = phase;
    const left = Math.max(0, (St.t1 - t) / 1000);
    // the lanes: each eater's pies and how far into the next
    let lead = -1, ls = -1;
    for (let i = 0; i < SEATS; i++) { const s = St.seats[i]; if (s) { const sc = piesOf(shownBites(i)).score; if (sc > ls) { ls = sc; lead = i; } } }
    for (let i = 0; i < SEATS; i++) {
      const s = St.seats[i], L = laneEls[i];
      L.row.hidden = !s && phase !== 'lobby';
      if (!s) { L.name.textContent = phase === 'lobby' ? 'a free seat' : ''; L.count.textContent = ''; L.fill.style.transform = 'scaleX(0)'; L.row.className = 'pie-lane empty'; continue; }
      const q = piesOf(shownBites(i));
      L.name.textContent = i === me ? 'You' : s.n;
      L.count.textContent = phase === 'lobby' ? (s.bot ? '' : 'ready') : `${q.pies} pie${q.pies === 1 ? '' : 's'}`;
      L.fill.style.transform = `scaleX(${phase === 'lobby' ? 0 : (q.into / q.need).toFixed(3)})`;
      L.row.className = 'pie-lane' + (i === me ? ' me' : '') + (s.bot ? ' bot' : '') + (i === lead && phase !== 'lobby' && ls > 0 ? ' lead' : '') + (phase === 'done' && St.winner?.i === i ? ' won' : '');
    }
    // the words and the clock
    const keys = input?.lastDevice === 'touch' ? 'Tap BITE!' : input?.lastDevice === 'pad' ? `Mash ${input.glyph?.('Space') || 'A'}!` : 'Mash E or Space!';
    let words = '', cl = '', tp = '';
    if (phase === 'lobby') { words = seated ? `Starting in ${Math.ceil(left)}... more eaters may sit down` : `Starting in ${Math.ceil(left)}. Sit down to join!`; tp = seated ? (input?.lastDevice === 'touch' ? 'Get ready!' : input?.lastDevice === 'pad' ? `Get ready! ${input.glyph?.('Escape') || 'B'} to leave` : 'Get ready! Esc to leave') : ''; }
    else if (phase === 'count') { const n = Math.ceil(left - 0.6); cl = n > 0 ? String(n) : 'EAT!'; words = 'Get ready...'; tp = seated ? keys : ''; }
    else if (phase === 'eat') { words = 'Eat! Eat! Eat!'; tp = seated ? keys : ''; if (St.t1 - St.t0 - left * 1000 < 900) cl = 'EAT!'; }
    else if (phase === 'done') { const w = St.winner; words = w ? (w.i === me ? `You win with ${w.p} pie${w.p === 1 ? '' : 's'}!` : `${w.n} wins with ${w.p} pie${w.p === 1 ? '' : 's'}!`) : 'Nobody ate a thing!'; }
    sub.textContent = words;
    const tt = phase === 'eat' ? fmt(Math.ceil(left)) : '';
    if (title.dataset.t !== tt) { title.dataset.t = tt; title.textContent = 'Pie eating contest'; if (tt) title.append(el('span', 'pt-time', tt)); }
    clock.textContent = cl; clock.hidden = !cl;
    clock.classList.toggle('go', cl === 'EAT!');
    tip.textContent = tp; tip.hidden = !tp;
    const play = seated && (phase === 'eat' || phase === 'count');
    big.classList.toggle('off', !play); btn.classList.toggle('off', !play);   // (laid out but unseen: frameCam measures them)
    leave.hidden = !(seated && phase === 'lobby');
    // the winner moment
    if (phase === 'done' && winShown !== St.r) {
      winShown = St.r; const w = St.winner;
      win.textContent = ''; win.append(el('b', '', w ? (w.i === me ? 'You win!' : `${w.n} wins!`) : 'Time!'), el('span', '', w ? `${w.p} pie${w.p === 1 ? '' : 's'}` : ''));
      win.hidden = false; win.classList.toggle('calm', reduced());
      confetti.textContent = '';
      if (!reduced()) for (let i = 0; i < 36; i++) { const c = el('i', 'pie-confetti'); c.style.left = (Math.random() * 100) + '%'; c.style.animationDelay = (Math.random() * 0.9).toFixed(2) + 's'; c.style.background = ['#e0463c', '#f2b630', '#3f8fd9', '#4fa45a', '#ff8fb8'][i % 5]; confetti.append(c); }
    } else if (phase !== 'done') { win.hidden = true; if (confetti.firstChild) confetti.textContent = ''; }
  }
  function drawBodies(dt, now) {
    const live = St.phase !== 'idle';
    for (const id of Object.keys(BOT_LOOK)) {
      const i = live ? St.seats.findIndex(s => s && s.bot === id) : -1;
      const body = i >= 0 || botBody[id] ? bodyFor(id) : null;
      if (!body) continue;
      body.h.root.visible = i >= 0;
      if (i < 0) continue;
      const s = seats[i], b = St.seats[i].b;
      if (b !== body.bites) { if (b > body.bites && St.phase === 'eat') { body.chompT = now; if (Math.hypot(camera.position.x - s.x, camera.position.z - s.z) < 14 && Math.random() < 0.35) audio.play?.('pie-chomp', s.x, top.y + 0.5, s.z); } body.bites = b; }
      const sc = body.h.root.scale.y || 1;
      body.h.root.position.set(s.x, terrainHeight(s.x, s.z), s.z); body.h.root.rotation.y = s.yaw;
      body.h.params.seatY = (s.y - terrainHeight(s.x, s.z)) / sc; body.h.params.table = s.table;
      const anim = St.phase === 'eat' && now - body.chompT < 0.3 ? 'drink' : St.phase === 'done' && St.winner?.i === i ? 'cheer' : 'sit';
      if (Math.hypot(camera.position.x - s.x, camera.position.z - s.z) < 60) body.h.update(dt, now, 0, anim);
    }
  }

  return {
    name: 'pie',
    api: {
      get state() { return St; }, get seat() { return me; }, get played() { return played; }, contestSeats: seats, contest: C, board: () => boardList,
      sit: () => askSit(), stand: () => standUp(true), bite, shownBites, hud: root, big, btn,
      bots: botBody,
      fitInfo: () => ({ band, fit, px: band && [band.t * innerHeight, band.b * innerHeight] }),   // (tests: the band the eaters are fitted into)
    },
    update(dt, now) {
      // (nothing to do far from the table with no round on: the tins hide, no per-frame work)
      const near = Math.hypot(camera.position.x - C.x, camera.position.z - C.z) < 70;
      const show = near || me >= 0;
      if (tins.visible !== show) { tins.visible = crusts.visible = fills.visible = show; }
      if (!show && St.phase === 'idle') { if (!root.hidden) root.hidden = true; return; }
      drawPies();
      drawBodies(dt, now);
      drawBig();
      drawHud();
      if (me >= 0 && St.phase !== 'idle' && !player.takeover?.pie) { if (player.takeover) standUp(true); else { const i = me; me = -1; sitDown(i); } }   // (something else took you over: up. A feature that let go of its own takeover just cleared ours: back in the seat)
    },
    afterRemotes() {
      if (!remotes?.map || St.phase === 'idle') return;
      for (const r of remotes.map.values()) {
        const i = St.seats.findIndex(s => s && s.sid === r.sid);
        if (i < 0) continue;
        const last = r.buf?.[r.buf.length - 1];
        if (!last || !SEATED_ANIMS.has(ANIM_CODES[last.a])) continue;
        const s = seats[i], sc = r.ch.root.scale.y || 1;
        r.ch.root.position.set(s.x, terrainHeight(s.x, s.z), s.z); r.ch.root.rotation.y = s.yaw;
        r.ch.params.seatY = (s.y - terrainHeight(s.x, s.z)) / sc; r.ch.params.table = s.table;
      }
    },
    target(px, pz) {
      if (me >= 0) return null;   // (seated, E and Space bite; Esc, the stick or the Leave button get up while waiting)
      // the winners board
      if (Math.hypot(px - (bx + bfx * 0.8), pz - (bz + bfz * 0.8)) < 1.3) return { hint: 'E  Read the pie champions', prio: 6, run: () => ui.toast(boardList.length ? 'Pie champions: ' + boardList.map((e, k) => `${k + 1}. ${e.n}, ${e.p} pie${e.p === 1 ? '' : 's'} (${shortDate(e.d)})`).join('   ') : 'No pie champion yet. Be the first!', 5200) };
      const along = px - C.x, across = pz - C.z;
      if (Math.abs(along) > 3.2 || across < -2.2 || across > 2.4) return null;
      if (pending && performance.now() - pending < 1500) return null;
      if (played) return { hint: "E  Pie contest (you've had your pies this week)", prio: 6, run: askSit };
      if (St.phase === 'idle') return { hint: 'E  Sit down for the pie eating contest', prio: 6, run: askSit };
      if (St.phase === 'lobby') return { hint: 'E  Join the pie eating contest', prio: 6, run: askSit };
      return { hint: 'E  Pie contest (a round is on)', prio: 6, run: askSit };
    },
    onKey(code) {
      if (me < 0) return false;
      if (code === 'KeyE' || code === 'Space' || code === 'ToolUse') { bite(); return true; }   // (a press while waiting does nothing: nobody leaves by mashing early)
      if (code === 'Escape') { if (St.phase === 'lobby' || St.phase === 'done') standUp(true); return true; }
      return false;
    },
    help: [[['E'], 'sit down at the long table for the pie eating contest, then mash E or Space to eat']],
  };
}
