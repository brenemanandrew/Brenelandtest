// Bocce on the court in the meadow. The server (lib/bocce.js) referees and simulates. This file draws it: the rolls (replayed
// with the same deterministic integrator, bocce-rules.js), the bots (Nonna Rosa and friends), the players, aiming, camera and HUD.
// A player in a game is taken over for the whole game (player.takeover) and walks to the line on their turn. Every screen
// replays every roll, so everybody within sight sees the balls.
import * as THREE from 'three';
import * as R from './bocce-rules.js';
import { buildCourt, makeBallMesh, toWorldXZ, toLocalXZ, worldYawOf, SURF, GROUND_Y, TEAM_COL, BENCH_H } from './bocce-court.js';
import { createBocceHud } from './bocce-hud.js';
import { registerBocceSfx } from './bocce-sfx.js';
import { Human } from './human.js';
import { groundHeight } from './terrain.js';
import { clamp, angleLerp } from './util.js';
import { soft } from './toon.js';

export { bocceFlatZones, bocceClear } from './bocce-court.js';

const { COURT } = R;
const TEAM = ['Red', 'Green'];
const RELEASE_T = 0.3;                 // s from the start of the arm swing to the ball leaving the hand
const WAIT_X = COURT.W / 2 + COURT.BOARD + 0.72;
const BOARD_X = COURT.W / 2 + COURT.BOARD / 2;
const BOT_LOOK = [
  { shirt: '#7a4a8c', pants: '#3a3344', outfit: 'dress', hair: '#e9e6e2', hairStyle: 'bun', glasses: 'round', skin: '#f0c8a0', height: 0.18, build: 0.6, acc: 'scarf', accColor: '#f2c14e', mouth: 'smile', blush: true, eyeStyle: 'hooded' }, // eyeStyle: npc-looks.js NPC_EYE_STYLES' choice for the folk built here
  { shirt: '#f3efe6', pants: '#4a3f35', hat: 'flatcap', hatColor: '#5a4a3a', facialHair: 'mustache', hair: '#7a7470', skin: '#e0ac7e', build: 0.88, height: 0.42, mouth: 'grin', brows: 'thick', eyeStyle: 'hooded' },
  { shirt: '#3fa27a', pants: '#2e2e36', hairStyle: 'pony', hair: '#3a2418', skin: '#c98e62', hat: 'cap', hatColor: '#e0574f', build: 0.38, height: 0.62, mouth: 'smirk', eyeStyle: 'hooded' },
  { shirt: '#ffb347', pants: '#3f5f8f', bottoms: 'shorts', hairStyle: 'curly', hair: '#2e2420', skin: '#e8b98f', hat: 'capback', hatColor: '#3f8fd9', scale: 0.8, height: 0.3, eyes: 'wide', eyeStyle: 'hooded' },
];
const BOT_VOICE = [{ pitch: 205, rate: 0.85, formant: 1.08 }, { pitch: 100, rate: 1.05 }, { pitch: 228, formant: 1.1 }, { pitch: 300, rate: 1.3, formant: 1.25 }];

export function createBocce(ctx) {
  const { scene, camera, player, net, audio, ui, input, remotes, colliders, canvas } = ctx;
  registerBocceSfx(audio);
  const court = buildCourt(scene, colliders);
  const G = court.group;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nowS = () => performance.now() / 1000;
  const online = () => net.status === 'online' && net.sid != null;
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion();

  // ---------------------------------------------------------------- balls: on the court, in the rack, in a hand
  const balls = [], rackBalls = [], handBalls = [];
  for (let i = 0; i < R.NB; i++) {
    const r = R.radius(i);
    const b = makeBallMesh(i, r); b.visible = false; G.add(b); balls.push(b);
    const k = makeBallMesh(i, r); const s = court.rackSlots[i]; k.position.set(s[0], s[1], s[2]); G.add(k); rackBalls.push(k);
    const h = makeBallMesh(i, r); h.visible = false; handBalls.push(h);
  }
  const prevXZ = new Float64Array(R.NB * 2);
  const grainT = new Float64Array(R.NB);

  // ---------------------------------------------------------------- the guide (dots along the roll) and measuring rings
  const DOTS = 28;
  const dotGeo = new THREE.CircleGeometry(0.035, 10); dotGeo.rotateX(-Math.PI / 2);
  // red, so the guide reads on the sandy court
  const dotMat = new THREE.MeshBasicMaterial({ color: '#e8302a', transparent: true, opacity: 0.95, depthWrite: false });
  const dotMatDim = new THREE.MeshBasicMaterial({ color: '#ff7a70', transparent: true, opacity: 0.6, depthWrite: false });
  const dots = [];
  for (let i = 0; i < DOTS; i++) { const d = new THREE.Mesh(dotGeo, dotMat); d.visible = false; G.add(soft(d)); dots.push(d); }
  const stopRing = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.17, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#e8302a', transparent: true, opacity: 0.95, depthWrite: false }));
  stopRing.visible = false; G.add(soft(stopRing));
  const guide = { key: '', stop: null, dist: 0 };
  const rings = []; // { mesh, label }
  let ringsUntil = 0;

  // ---------------------------------------------------------------- the closest ball: a ring round it and an arrow over it
  // (bocce-hud: "Green is closest, by 60 cm" was a sentence in the score card; now it is on the court, in the team's colour)
  const markMats = TEAM_COL.map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, depthWrite: false }));
  const markRing = new THREE.Mesh(new THREE.RingGeometry(R.R_BALL + 0.03, R.R_BALL + 0.07, 32).rotateX(-Math.PI / 2), markMats[0]);
  const markArrow = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 12).rotateX(Math.PI), markMats[0]); // (points down)
  markRing.visible = markArrow.visible = false;
  markRing.name = 'bocce-closest-ring'; markArrow.name = 'bocce-closest-arrow';
  G.add(soft(markRing)); G.add(soft(markArrow));
  const marker = { idx: -1, team: -1, dirty: true };
  function updateMarker(now) {
    const show = matchOn() && !roll && S.phase === 'ball' && S.pos && S.pos[0];
    if (!show) { if (markRing.visible) markRing.visible = markArrow.visible = false; marker.idx = -1; marker.dirty = true; return; }
    if (marker.dirty) {
      marker.dirty = false;
      const st = R.standing(S.pos);
      marker.team = st.team;
      marker.idx = st.team >= 0 ? R.bestOf(R.dists(S.pos)).i[st.team] : -1;
      if (marker.idx > 0 && S.pos[marker.idx]) {
        const [x, z] = S.pos[marker.idx];
        markRing.material = markArrow.material = markMats[st.team];
        markRing.position.set(x, SURF + 0.008, z);
        markArrow.position.set(x, 0, z);
      } else marker.idx = -1;
    }
    const on = marker.idx > 0;
    markRing.visible = markArrow.visible = on;
    if (on) markArrow.position.y = SURF + R.R_BALL * 2 + 0.26 + (reduced ? 0 : Math.sin(nowS() * 3.2) * 0.04);
  }

  // ---------------------------------------------------------------- bots
  const bots = BOT_LOOK.map((look, b) => {
    const h = new Human(look);
    h.root.visible = false;
    scene.add(h.root);
    const tag = ui.nameTag(h.root, R.BOTS[b].name, '#ffffff'); tag.max = 26; tag.fade = 16;
    return { b, h, tag, w: null, seated: false, anim: 'idle', shown: false };
  });

  // ---------------------------------------------------------------- state
  let S = null;            // the last state from the server
  let stateSeq = 0;        // states received (a roll remembers which it came after)
  let roll = null;         // the throw being animated
  const swings = new Map(); // seat -> { t0, p } the arm swing of a throw
  let remoteAim = null;    // { seat, a, p, at } what the thrower is lining up (relayed)
  let part = null;         // me in a game: { w: walker, seat, held }
  let watch = null;        // me watching: { held }
  let aimSt = null;        // my aiming: { aim, power, ph, charging, armed, thrown, sentAt, key, startedAt }
  let mouseHeld = false, touchHeld = false, touchAim = 0, leaveAsk = 0;
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false, yawOff: 0, pitchOff: 0, idleAt: 0, measureUntil: 0, lastRollAt: 0 };

  const matchOn = () => !!S && !['lobby', 'countdown'].includes(S.phase);
  const speedK = () => (S && S.speed) || 1;
  const mySeat = () => (matchOn() ? S.seats.findIndex(s => s.k === 'h' && s.sid === net.sid) : -1);
  const myLobbySeat = () => (S && !matchOn() ? S.seats.findIndex(s => s && s.sid === net.sid) : -1);
  const turnSeat = () => (matchOn() && (S.phase === 'pallino' || S.phase === 'ball') ? S.turn : -1);
  const seatName = i => (S && S.seats[i] ? S.seats[i].n : '');
  const localHere = (x, z) => toLocalXZ(x, z);
  function charOf(seat) {
    const s = S && S.seats[seat];
    if (!s) return null;
    if (s.k === 'b') return bots[s.bot] ? bots[s.bot].h : null;
    if (s.sid === net.sid) return player.character;
    return remotes.map.get(s.sid)?.ch || null;
  }
  const worldOf = (lx, ly, lz, out) => G.localToWorld(out.set(lx, ly, lz));

  // ---------------------------------------------------------------- where people stand
  function throwSpot(end, aim = 0) { return { x: 0, z: R.standZ(end), yaw: (end < 0 ? 0 : Math.PI) + aim }; }
  function waitSpot(seat, end) {
    const z = end * (COURT.L / 2 - 0.75 - seat * 0.95);
    return { x: WAIT_X, z, yaw: Math.atan2(-WAIT_X, -end * 4 - z) };
  }
  function spotFor(seat) {
    if (!matchOn()) return null;
    const end = roll && roll.m.seat === seat ? roll.m.end : S.end;
    const up = turnSeat() === seat || (roll && roll.m.seat === seat) || (S.phase === 'result' && S.turn === seat);
    if (up) return throwSpot(end, seat === mySeat() && aimSt ? aimSt.aim : remoteAim && remoteAim.seat === seat ? remoteAim.a : 0);
    return waitSpot(seat, S.end);
  }
  const newWalker = (x, z, yaw) => ({ x, z, yaw, tx: x, tz: z, tyaw: yaw, moving: false, hop: 0, onCourt: false, spd: 0 });
  function stepWalker(w, dt) {
    const dx = w.tx - w.x, dz = w.tz - w.z, d = Math.sqrt(dx * dx + dz * dz);
    const v = 2.9 * Math.min(4, speedK());
    if (d > 0.03) {
      const s = Math.min(d, v * dt);
      w.x += (dx / d) * s; w.z += (dz / d) * s; w.moving = true; w.spd = 2.9;
      w.yaw = angleLerp(w.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
    } else { w.moving = false; w.spd = 0; w.yaw = angleLerp(w.yaw, w.tyaw, Math.min(1, dt * 9)); }
    const ax = Math.abs(w.x);
    w.hop = w.moving && Math.abs(ax - BOARD_X) < 0.42 && Math.abs(w.z) < COURT.L / 2 + 0.3 ? 0.36 * Math.cos(((ax - BOARD_X) / 0.42) * Math.PI / 2) : 0;
    w.onCourt = ax < COURT.W / 2 && Math.abs(w.z) < COURT.L / 2;
  }
  function walkerWorld(w, out) {
    const [x, z] = toWorldXZ(w.x, w.z);
    out.set(x, (w.onCourt ? GROUND_Y + SURF : groundHeight(x, z)) + w.hop, z);
    return worldYawOf(w.yaw);
  }
  const aimTo = (w, spot) => { w.tx = spot.x; w.tz = spot.z; w.tyaw = spot.yaw; };

  // ---------------------------------------------------------------- the HUD
  const hud = createBocceHud(ctx, {
    sit: team => send({ op: 'sit', team }),
    stand: () => send({ op: 'stand' }),
    start: () => send({ op: 'start' }),
    toggleTarget: () => send({ op: 'opt', target: S && S.target === 12 ? 7 : 12 }),
    toggleSize: () => send({ op: 'opt', size: S && S.size === 1 ? 2 : 1 }),
    close: () => closeCard(),
    touchAim: d => { touchAim = d; },
    touchBowl: on => { touchHeld = on; },
  });
  function send(m) { if (online()) net.send({ t: 'bocce', ...m }); else ui.toast('Bocce needs the connection to the yard.'); }
  function openCard() {
    if (!online()) { ui.toast('Bocce needs the connection to the yard.'); return; }
    hud.showCard(); refreshCard(); player.controls = false; audio.ui?.('pop');
  }
  function closeCard() { if (!hud.cardOpen) return; hud.hideCard(); if (ctx.mode === 'play' && !part && !watch) player.controls = true; }
  function refreshCard() {
    if (!hud.cardOpen) return;
    const s = S || { phase: 'lobby', seats: [null, null, null, null], target: 7, size: 2, host: null, cd: 0 };
    hud.renderCard({ ...s, meSid: net.sid, mine: myLobbySeat(), online: online(), cd: s.phase === 'countdown' ? Math.max(0, s.cdAt - performance.now()) : 0 });
  }

  // ---------------------------------------------------------------- network
  net.on('bocce', m => {
    switch (m.op) {
      case 'state': return onState(m);
      case 'roll': return onRoll(m);
      case 'aim': remoteAim = { seat: m.seat, a: (m.a || 0) * R.PH.AIM_MAX, p: m.p || 0, at: nowS() }; return;
      case 'say': return botSay(m.seat, m.text);
      case 'result': {
        if (m.won) ui.toast(m.biscuit ? 'You won! A dog biscuit is in your pockets.' : 'You won!', 5000);
        ctx.selfExt.bocceWins = m.wins;
        return;
      }
      case 'far': return ui.toast('Come a little closer to the court to join.');
      case 'full': return ui.toast(`${TEAM[m.team] || 'That'} team is full.`);
      case 'busy': return ui.toast('A game is already on. Watch, or join the next one!');
    }
  });

  function onState(m) {
    const prev = S;
    S = m;
    stateSeq++;
    S.at = performance.now();
    S.cdAt = S.at + (m.cd || 0);
    marker.dirty = true;
    const ev = m.ev;
    // a game starts or ends for me
    const seat = mySeat();
    if (seat >= 0 && !part) beginPart(seat);
    if (part && seat < 0) endPart();
    if (matchOn() && hud.cardOpen) closeCard();
    if (seat >= 0 && part) part.seat = seat;
    if (seat >= 0 && matchOn() && S.score) ctx.quests?.set('bocce', { title: 'Bocce', text: `Red ${S.score[0]} - ${S.score[1]} Green, first to ${S.target}. ${turnSeat() === seat ? 'Your throw!' : (S.phase === 'pallino' || S.phase === 'ball') ? seatName(S.turn) + ' is up.' : ''}`, prio: 5, color: '#5fbf5a', quiet: true }); // (quiet: the strip shows the score; the line never pops the list open)
    if (turnSeat() !== seat || seat < 0) { if (aimSt && !aimSt.thrown) aimSt = null; }
    if (turnSeat() === seat && seat >= 0 && (!aimSt || aimSt.key !== turnKey())) startAim();
    if (ev) announce(ev, prev);
    court.setBoard(matchOn() ? { score: S.score, frame: S.frame, target: S.target, playing: true } : { score: prev && prev.score && ev && ev.ev === 'lobby' ? prev.score : [0, 0], playing: false });
    if (!matchOn()) { roll = null; clearGuide(); if (watch) stopWatch(false); }
    refreshCard();
    syncBalls();
  }
  const turnKey = () => (S ? `${S.frame}:${S.turn}:${S.left}:${S.phase}:${S.pos ? S.pos.filter(Boolean).length : 0}` : '');

  function announce(ev, prev) {
    const t = ev.ev;
    if (t === 'countdown') { tick(); return; }
    if (t === 'begin') {
      hud.banner("Let's play bocce!", `${TEAM[ev.first]} won the coin toss and throws the pallino`, 'begin', 3200);
      return;
    }
    if (t === 'frame') {
      const res = ev;
      showRings(true);
      cam.measureUntil = nowS() + 3.4;
      const p = pallinoWorld(v1);
      if (res.dead) {
        hud.banner('Dead frame!', res.why === 'tie' ? 'A tie for closest: nobody scores' : res.why === 'pallino' ? 'The pallino left the court' : 'Nobody scores', 'dead', 3600);
        if (p) audio.play('bocce-aww', p.x, p.y + 1, p.z);
      } else {
        hud.banner(`${TEAM[res.team]} scores ${res.points}!`, `Red ${res.score[0]}  -  ${res.score[1]} Green`, 't' + res.team, 3600);
        if (p) audio.play('bocce-point', p.x, p.y + 1, p.z, { n: res.points });
        cheerSeats(res.team);
      }
      return;
    }
    if (t === 'frame-start') { hud.banner(`Frame ${ev.frame + 1}`, `${seatName(S.turn)} throws the pallino`, 'small', 2000); return; }
    if (t === 'redo') { hud.banner('Pallino too short!', `It has to pass the middle line. ${TEAM[ev.next]} throws it now`, 'small', 2600); return; }
    if (t === 'placed') { hud.banner('The referee sets the pallino', 'Both teams missed the middle line', 'small', 2600); return; }
    if (t === 'over') {
      const mine = prev ? prev.seats?.find(s => s && s.sid === net.sid) : null;
      const won = mine && mine.team === ev.winner;
      hud.banner(`${TEAM[ev.winner]} wins ${ev.score[ev.winner]}-${ev.score[1 - ev.winner]}!`, won ? '+1 dog biscuit for each winner' : ev.winners && ev.winners.length ? `Well played, ${ev.winners.join(' and ')}!` : 'Good game, everybody!', 'big t' + ev.winner, 6000);
      hud.confetti([TEAM_COL[ev.winner], '#ffd34d', '#ffffff', '#6fb8ff']);
      const c = worldOf(0, 1, 0, v1);
      audio.play('bocce-cheer', c.x, c.y, c.z);
      cheerSeats(ev.winner, 5);
      return;
    }
    if (t === 'takeover') {
      ui.toast(ev.why === 'idle' ? `${ev.name} took over for ${ev.was} (too long to throw).` : `${ev.name} takes ${ev.was}'s place.`, 3600);
      return;
    }
    if (t === 'abandon') { ui.toast('The bocce game was called off.'); return; }
    if (t === 'sit' && ev.sid !== net.sid && nearCourt(4)) ui.toast(`${ev.name} joined ${TEAM[ev.team]}.`, 2200);
  }
  function tick() { const c = worldOf(0, 1, 0, v1); audio.play('bocce-tick', c.x, c.y, c.z); }
  const cheers = new Map(); // seat -> until (s)
  function cheerSeats(team, secs = 2.2) { if (!S) return; S.seats.forEach((s, i) => { if (s && s.team === team) cheers.set(i, nowS() + secs); }); }

  function botSay(seat, text) {
    const s = S && S.seats[seat];
    if (!s || s.k !== 'b') return;
    const bot = bots[s.bot];
    if (!bot || !bot.h.root.visible) return;
    ui.say(bot.h.root, text, 3.2, 2.1 * (BOT_LOOK[s.bot].scale || 1), '');
    const p = bot.h.root.position;
    audio.speak?.(p.x, p.y + 1.5, p.z, text, BOT_VOICE[s.bot]);
    bot.h.say?.(0.8 + text.length * 0.05);
  }

  // ---------------------------------------------------------------- a roll
  function onRoll(m) {
    if (!Array.isArray(m.before) || !m.launch) return;
    finishRoll(); // a new roll arrived before the old one ended (a slow tab): land the old one at once
    const t = nowS();
    const sw = swings.get(m.seat);
    const launchAt = m.seat === mySeat() && sw && t - sw.t0 < 1.2 ? Math.max(t, sw.t0 + RELEASE_T / speedK()) : t + RELEASE_T / speedK();
    if (!(m.seat === mySeat() && sw && t - sw.t0 < 1.2)) swings.set(m.seat, { t0: launchAt - RELEASE_T / speedK(), p: remoteAim && remoteAim.seat === m.seat ? remoteAim.p : 0.5 });
    roll = { m, sim: R.makeSim(m.before, m.idx, m.launch), launchAt, acc: 0, launched: false, from: new THREE.Vector3(), blend: 0, seq: stateSeq };
    stats.rolls++;
    if (aimSt && m.seat === mySeat()) { aimSt.thrown = true; aimSt.accepted = true; }
    remoteAim = null;
    clearGuide(); clearRings();
    for (let i = 0; i < R.NB; i++) { const p = m.before[i]; if (p) { prevXZ[i * 2] = p[0]; prevXZ[i * 2 + 1] = p[1]; } }
    cam.lastRollAt = t;
  }
  function stepRoll(dt) {
    if (!roll) return;
    const t = nowS();
    if (!roll.launched) {
      if (t < roll.launchAt) return;
      roll.launched = true;
      // the ball leaves from where the hand really is, then joins the simulated path
      const hb = handBalls[roll.m.idx];
      if (hb.parent) { hb.getWorldPosition(v1); G.worldToLocal(roll.from.copy(v1)); } else roll.from.set(roll.m.launch.x, roll.m.launch.y + SURF, roll.m.launch.z);
      const p = worldOf(roll.m.launch.x, roll.m.launch.y, roll.m.launch.z, v1);
      audio.play('bocce-toss', p.x, p.y, p.z, { v: Math.hypot(roll.m.launch.vx, roll.m.launch.vz) / 7 });
    }
    const s = roll.sim;
    roll.acc += dt * speedK();
    let n = 0;
    while (roll.acc >= R.PH.DT && !s.done && n < 2400) { R.stepSim(s); roll.acc -= R.PH.DT; n++; }
    roll.blend = Math.min(1, roll.blend + dt * speedK() / 0.12);
    for (const e of s.ev) soundEvent(e);
    s.ev.length = 0;
    // rolling grains for the balls that move on the ground
    for (let i = 0; i < R.NB; i++) {
      if (!s.live[i] || s.rest[i]) continue;
      const sp = Math.sqrt(s.vx[i] * s.vx[i] + s.vz[i] * s.vz[i]);
      if (sp < 0.25 || s.y[i] > R.radius(i) + 0.002) continue;
      grainT[i] -= dt;
      if (grainT[i] <= 0) { grainT[i] = Math.max(0.07, 0.17 - sp * 0.015); const p = worldOf(s.x[i], s.y[i] + SURF, s.z[i], v1); audio.play('bocce-roll', p.x, p.y, p.z, { v: Math.min(1, sp / 5) }); }
    }
    if (s.done) finishRoll();
  }
  const stats = { rolls: 0, clack: 0, board: 0, thump: 0 };
  function soundEvent(e) {
    const s = roll.sim, i = e[2];
    if (e[0] === R.EV.CLACK) stats.clack++; else if (e[0] === R.EV.BOARD) stats.board++; else if (e[0] === R.EV.THUMP) stats.thump++;
    const p = worldOf(s.x[i], s.y[i] + SURF, s.z[i], v1);
    if (e[0] === R.EV.CLACK) { audio.play('bocce-clack', p.x, p.y, p.z, { v: e[4] }); if (e[4] > 1.2) input.rumble?.(0.2, 0.3, 70); }
    else if (e[0] === R.EV.BOARD) audio.play('bocce-knock', p.x, p.y, p.z, { v: e[4] });
    else if (e[0] === R.EV.THUMP) audio.play('bocce-thump', p.x, p.y, p.z, { v: e[4] });
  }
  function finishRoll() {
    if (!roll) return;
    const r = roll, m = roll.m;
    if (!r.sim.done) { while (!r.sim.done) R.stepSim(r.sim); r.sim.ev.length = 0; } // cut short: finish it silently
    roll = null;
    // everybody adopts the server's resting spots (the replay lands there anyway)
    if (JSON.stringify(R.restOf(r.sim)) !== JSON.stringify(m.after)) stats.mismatch = (stats.mismatch || 0) + 1;
    // (only if no state came after the roll did: a tab that replays late - a phone asleep for a moment - must not put back an
    // older picture over the state the server sent since, which already has the balls where they are now)
    if (S && matchOn() && stateSeq === r.seq) S.pos = m.after.map(p => (p ? p.slice() : null));
    marker.dirty = true;
    cam.measureUntil = Math.max(cam.measureUntil, nowS() + 1.5 / Math.min(2, speedK()));
    if (S && S.pos && S.pos[0]) showRings(false);
    syncBalls();
  }

  // ---------------------------------------------------------------- ball meshes each frame
  function placeBall(i, x, y, z) {
    const b = balls[i];
    const px = prevXZ[i * 2], pz = prevXZ[i * 2 + 1];
    const dx = x - px, dz = z - pz, d = Math.sqrt(dx * dx + dz * dz);
    if (d > 1e-5 && d < 1) { v2.set(dz, 0, -dx).divideScalar(d); q1.setFromAxisAngle(v2, d / R.radius(i)); b.quaternion.premultiply(q1); }
    prevXZ[i * 2] = x; prevXZ[i * 2 + 1] = z;
    b.position.set(x, y + SURF, z);
    b.visible = true;
  }
  function heldIdx() {
    if (roll && !roll.launched) return roll.m.idx;
    if (roll) return -1;
    const t = turnSeat();
    if (t < 0) return -1;
    if (S.phase === 'pallino') return 0;
    const team = S.seats[t].team;
    return team * 4 + 1 + (4 - S.left[team]);
  }
  function syncBalls() {
    const held = heldIdx();
    const on = matchOn();
    for (let i = 0; i < R.NB; i++) {
      let court = false;
      if (roll && roll.launched) court = !!roll.sim.live[i];
      else if (roll) court = !!roll.m.before[i];
      else court = on && !!(S.pos && S.pos[i]);
      if (!court) balls[i].visible = false;
      else if (!roll) { const p = S.pos[i]; placeBall(i, p[0], R.radius(i), p[1]); }
      let unthrown = !on;
      if (on) {
        if (i === 0) unthrown = !(S.pos && S.pos[0]) && S.phase === 'pallino' && !(roll && roll.m.idx === 0);
        else { const team = i <= 4 ? 0 : 1; unthrown = i - (team * 4 + 1) >= 4 - S.left[team] && !(roll && roll.m.idx === i); }
      }
      rackBalls[i].visible = unthrown && !court && i !== held;
      // in a hand
      const hb = handBalls[i];
      if (i === held) {
        const c = charOf(roll ? roll.m.seat : turnSeat());
        if (c && hb.parent !== c.handR) { c.handR.add(hb); hb.position.set(0, -0.1, 0.03); }
        hb.visible = !!c;
        if (c) hb.scale.setScalar(R.radius(i) / (c.root.scale.x || 1));
      } else if (hb.parent) { hb.parent.remove(hb); hb.visible = false; }
    }
  }
  function updateBalls() {
    if (roll && roll.launched) {
      const s = roll.sim, k = roll.blend;
      for (let i = 0; i < R.NB; i++) {
        if (!s.live[i]) { balls[i].visible = false; continue; }
        let x = s.x[i], y = s.y[i], z = s.z[i];
        if (i === roll.m.idx && k < 1) { x = roll.from.x + (x - roll.from.x) * k; y = roll.from.y - SURF + (y - roll.from.y + SURF) * k; z = roll.from.z + (z - roll.from.z) * k; }
        placeBall(i, x, y, z);
      }
    }
    syncBalls();
  }
  const pallinoWorld = out => {
    if (roll && roll.launched && roll.sim.live[0]) return worldOf(roll.sim.x[0], roll.sim.y[0] + SURF, roll.sim.z[0], out);
    const p = S && S.pos && S.pos[0];
    return p ? worldOf(p[0], SURF + R.R_PAL, p[1], out) : null;
  };

  // ---------------------------------------------------------------- measuring rings
  function clearRings() { for (const r of rings) { G.remove(r.mesh); r.mesh.geometry.dispose(); r.label?.remove(); } rings.length = 0; }
  function showRings(final) {
    clearRings();
    const pos = S.pos, p = pos && pos[0];
    if (!p) return;
    const d = R.dists(pos), { b, i: bi } = R.bestOf(d);
    const show = [];
    for (const t of [0, 1]) if (bi[t] > 0) show.push(bi[t]);
    if (final) { const st = R.standing(pos); if (st.team >= 0) for (let i = st.team * 4 + 1; i <= st.team * 4 + 4; i++) if (d[i] < b[1 - st.team] - R.TIE && !show.includes(i)) show.push(i); }
    for (const i of show) {
      const dist = d[i], team = i <= 4 ? 0 : 1;
      const g = new THREE.RingGeometry(Math.max(0.01, dist - 0.014), dist + 0.014, 72); g.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: TEAM_COL[team], transparent: true, opacity: 0.9, depthWrite: false }));
      mesh.position.set(p[0], SURF + 0.006, p[1]);
      G.add(soft(mesh));
      const node = document.createElement('div');
      node.className = 'bocce-dist t' + team;
      node.textContent = dist < 1 ? Math.round(dist * 100) + ' cm' : dist.toFixed(2) + ' m';
      const at = worldOf(pos[i][0], SURF + 0.32, pos[i][1], new THREE.Vector3());
      const label = ui.add({ node, pos: at, dy: 0, max: 30, fade: 20 });
      rings.push({ mesh, label });
    }
    ringsUntil = nowS() + (final ? 5.5 : 2.4) / Math.min(2, speedK());
  }

  // ---------------------------------------------------------------- the guide
  function clearGuide() { for (const d of dots) d.visible = false; stopRing.visible = false; guide.key = ''; }
  function drawGuide(end, aim, power, bright, ring = true) {
    const key = `${end}|${aim.toFixed(4)}|${power.toFixed(3)}|${bright}|${ring}`;
    if (key === guide.key) return;
    guide.key = key;
    const s = R.makeSim(null, 1, R.launchOf(end, aim, power));
    const pts = [];
    let n = 0;
    while (!s.done && n < 8000) { R.stepSim(s); if (n++ % 6 === 0) pts.push(s.x[1], s.y[1], s.z[1]); }
    pts.push(s.x[1], s.y[1], s.z[1]);
    const count = pts.length / 3;
    for (let i = 0; i < DOTS; i++) {
      const k = Math.min(count - 1, Math.round(((i + 1) / DOTS) * (count - 1) * 0.94));
      const d = dots[i];
      d.position.set(pts[k * 3], SURF + 0.008 + Math.max(0, pts[k * 3 + 1] - R.R_BALL) * 0.6, pts[k * 3 + 2]);
      d.material = bright ? dotMat : dotMatDim;
      d.visible = true;
    }
    stopRing.position.set(s.x[1], SURF + 0.01, s.z[1]);
    stopRing.material.opacity = bright ? 0.9 : 0.5;
    stopRing.visible = ring;
    guide.stop = [s.x[1], s.z[1]];
    guide.dist = Math.abs(s.z[1] - R.releaseZ(end));
  }

  // ---------------------------------------------------------------- me in a game
  function beginPart(seat) {
    closeCard();
    const [lx, lz] = localHere(player.pos.x, player.pos.z);
    const far = Math.hypot(lx, lz) > 16;
    const spot = waitSpot(seat, S.end);
    const w = far ? newWalker(spot.x, spot.z, spot.yaw) : newWalker(lx, lz, player.yaw - worldYawOf(0));
    part = { seat, w, held: player.held };
    if (player.held) player.setHeld(null);
    ctx.inventory?.unequip?.();
    watch = null;
    player.emote = null;
    player.takeover = { anim: 'idle', minigame: 'bocce', update: (dt, now, inp, pl) => partUpdate(dt, pl), camera: (dt, c, inp, now) => camUpdate(dt, c, inp) };   // minigame: the yard's music keeps out (music.js)
    cam.init = false;
  }
  function endPart() {
    if (!part) return;
    const w = part.w;
    // step out of the court if the game ended while I was at the line
    if (w.onCourt || Math.abs(w.x) < BOARD_X + 0.5) { const s = waitSpot(Math.max(0, part.seat), S ? S.end || -1 : -1); w.x = s.x; w.z = s.z; w.onCourt = false; w.hop = 0; }
    walkerWorld(w, player.pos);
    player.pos.y = groundHeight(player.pos.x, player.pos.z);
    player.takeover = null;
    player.grounded = true; player.vy = 0; player.vel.set(0, 0);
    if (ctx.mode === 'play') player.controls = true;
    player.snapCameraBehind();
    if (part.held) player.setHeld(part.held);
    part = null; aimSt = null; walkSpeed = 0;
    ctx.quests?.clear('bocce');
    hud.hideAim(); clearGuide();
  }
  let walkSpeed = 0; // the local body's walk cycle while a takeover walks it (see wrapWalk)
  function partUpdate(dt, pl) {
    const w = part.w;
    const spot = spotFor(part.seat);
    if (spot) aimTo(w, spot);
    stepWalker(w, dt);
    pl.yaw = walkerWorld(w, pl.pos);
    walkSpeed = w.moving && !w.hop ? w.spd : 0;
    const t = nowS();
    player.takeover.anim = w.hop ? 'jump' : w.moving ? 'walk' : (cheers.get(part.seat) || 0) > t ? 'cheer' : turnSeat() === part.seat || swings.has(part.seat) ? 'bowl' : 'idle';
  }
  // The Human walks its legs from the speed it is given, and Player.update hands a taken-over body speed 0; while we
  // walk the player along we pass our own speed through (local only; other screens see the walk from the positions).
  function wrapWalk() {
    const ch = player.character;
    if (ch._bocceWrap) return;
    const orig = ch.update;
    ch.update = function (dt, t, speed, anim) { return orig.call(this, dt, t, part && walkSpeed ? walkSpeed : speed, part && walkSpeed ? null : anim); };
    ch._bocceWrap = true;
  }

  function startAim() {
    aimSt = { aim: 0, power: 0, ph: 0, charging: false, armed: false, thrown: false, sentAt: 0, sent: '', key: turnKey(), startedAt: nowS() };
    // start pointing at the pallino, like a helpful friend would
    const p = S.pos && S.pos[0];
    if (p && S.phase === 'ball') { const dir = -S.end, rz = R.releaseZ(S.end); aimSt.aim = clamp(Math.atan2(p[0] * dir, (p[1] - rz) * dir), -R.PH.AIM_MAX, R.PH.AIM_MAX); }
    audio.play('bocce-tick', player.pos.x, player.pos.y + 1.5, player.pos.z, { hi: true });
    input.rumble?.(0.2, 0.2, 80);
  }
  function aimUpdate(dt) {
    const a = aimSt;
    const ready = part && !part.w.moving && !a.thrown && turnSeat() === part.seat && !roll;
    if (!ready) { if (!a.thrown) hud.hideAim(); if (!a.thrown) clearGuide(); a.charging = false; return; }
    hud.showAim(input.lastDevice);
    const mv = input.move?.() || { x: 0, y: 0 };
    const fine = input.down.has('ShiftLeft') || input.down.has('ShiftRight') ? 0.3 : 1;
    const steer = (touchAim || -mv.x);
    a.aim = clamp(a.aim + steer * 0.42 * fine * dt, -R.PH.AIM_MAX, R.PH.AIM_MAX);
    const held = input.down.has('Space') || mouseHeld || touchHeld;
    if (!held) a.armed = nowS() - a.startedAt > 0.35;
    if (held && a.armed && !a.charging) { a.charging = true; a.ph = 0; }
    if (a.charging) {
      a.ph += dt / 1.25;
      const f = a.ph % 2;
      a.power = f < 1 ? f : 2 - f;
      if (!held) { a.charging = false; doThrow(a.aim, a.power); return; }
    }
    // tell the others where I am aiming
    const sendKey = a.aim.toFixed(3) + '|' + a.power.toFixed(2);
    if (sendKey !== a.sent && nowS() - a.sentAt > 0.16) { a.sent = sendKey; a.sentAt = nowS(); send({ op: 'aim', a: a.aim / R.PH.AIM_MAX, p: a.power }); }
    // the guide and the meter
    drawGuide(S.end, a.aim, a.charging ? a.power : 0.32, true, a.charging); // before the charge: just the line you are aiming along
    // (the mark on the bar: the power that reaches the pallino, or just past the middle line for the pallino itself; the guide's
    // dots and its ring on the court say the rest, so no words under the bar)
    const p = S.pos && S.pos[0];
    let markP = null;
    if (p) markP = R.powerForDist(Math.abs(p[1] - R.releaseZ(S.end)) - 0.12);
    else if (S.phase === 'pallino') markP = R.powerForDist(COURT.L / 2 - COURT.FOUL + 0.3);
    hud.setAim(a.charging ? a.power : 0, markP, a.charging);
  }
  function doThrow(aim, power) {
    if (!aimSt || aimSt.thrown) return;
    aimSt.thrown = true; aimSt.power = power;
    swings.set(mySeat(), { t0: nowS(), p: power });
    send({ op: 'throw', aim: +aim.toFixed(4), power: +power.toFixed(4) });
    hud.hideAim();
    hud.tipDone();
    const k = aimSt.key;
    // not accepted (the server ignores a throw in the first moments of a turn): try again. Asks whether the server sent
    // MY roll, not whether any roll is still animating, or a slow tab still replaying the last ball gets stuck on "thrown".
    setTimeout(() => { if (aimSt && aimSt.key === k && aimSt.thrown && !aimSt.accepted && turnSeat() === mySeat()) { aimSt.thrown = false; swings.delete(mySeat()); } }, 2500);
  }

  // ---------------------------------------------------------------- watching
  function startWatch() {
    if (part || watch) return;
    watch = { held: player.held };
    closeCard();
    player.emote = null;
    player.takeover = { anim: 'idle', minigame: 'bocce', update: () => {}, camera: (dt, c, inp) => camUpdate(dt, c, inp) };
    cam.init = false;
  }
  function stopWatch(byYou = true) {
    if (!watch) return;
    watch = null;
    if (byYou) declined = true; // (standing by the court does not pull you back in until you have left and come back)
    player.takeover = null;
    player.snapCameraBehind();
  }

  // ---------------------------------------------------------------- the camera (players in the game and watchers)
  function camUpdate(dt, c, inp) {
    const look = inp.takeLook?.() || { x: 0, y: 0, zoom: 0 };
    const t = nowS();
    if (aimSt && aimSt.charging && look.x) aimSt.aim = clamp(aimSt.aim - look.x * 0.0016, -R.PH.AIM_MAX, R.PH.AIM_MAX); // slide the mouse while holding to aim
    else if (look.x || look.y) { cam.yawOff = clamp(cam.yawOff - look.x * 0.005, -2.4, 2.4); cam.pitchOff = clamp(cam.pitchOff + look.y * 0.004, -0.3, 0.8); cam.idleAt = t; }
    if (t - cam.idleAt > 4) { cam.yawOff *= Math.exp(-dt * 0.9); cam.pitchOff *= Math.exp(-dt * 0.9); }
    const end = (roll ? roll.m.end : S && S.end) || -1;
    let want = v1, at = v2;
    const myAim = aimSt && part && !aimSt.thrown && turnSeat() === part.seat && !part.w.moving;
    if (roll && roll.launched) {
      // follow the ball down the court; when it is nearly done, the pallino
      const s = roll.sim, i = roll.m.idx;
      const sp = Math.sqrt(s.vx[i] * s.vx[i] + s.vz[i] * s.vz[i]);
      const f = s.live[i] && sp > 0.9 ? i : 0;
      const fx = s.live[f] ? s.x[f] : 0, fz = s.live[f] ? s.z[f] : 0;
      // from behind and to the west side (away from the people waiting), so the thrower never fills the screen
      worldOf(fx * 0.6 - 1.3, 2.6 + Math.min(1, sp * 0.15), fz + end * (4.6 + Math.min(2, sp * 0.25)), want);
      worldOf(fx, SURF, fz - end * 0.8, at);
    } else if (cam.measureUntil > t && S && S.pos && S.pos[0]) {
      const p = S.pos[0];
      worldOf(p[0] * 0.5 - 0.9, 2.9, p[1] + end * 1.7, want);
      worldOf(p[0], SURF, p[1], at);
    } else if (myAim) {
      // behind and above the thrower, a little over the right shoulder so the line of the throw shows, framed so the thrower and
      // the pallino both sit between the score strip and the throw controls (frameShot)
      const a = aimSt.aim, dir = -end, rz = R.releaseZ(end);
      const ux = dir * Math.sin(a), uz = dir * Math.cos(a);
      const p = S.pos && S.pos[0];
      const fx = p ? p[0] : ux * COURT.L * 0.55, fz = p ? p[1] : rz + uz * COURT.L * 0.55;
      frameShot(0, R.standZ(end), ux, uz, fx, fz, c.aspect < 0.85 ? 0.45 : 0.2, c, want, at);
    } else {
      // the game from behind the throwing end, from the side away from the people waiting: whoever is at the line and every
      // ball down the court (the farthest one, or the pallino's side of the court before it is out)
      let far = COURT.L * 0.3;
      if (S && S.pos) for (const q of S.pos) if (q) far = Math.max(far, -end * q[1] + COURT.L / 2 - COURT.FOUL);
      far = Math.min(far, COURT.L - 1);
      const tz = R.standZ(end);
      frameShot(0, tz, 0, -end, 0, tz - end * far, -1.1 * end, c, want, at);
    }
    // orbit by the player's drag
    if (cam.yawOff || cam.pitchOff) {
      v3.copy(want).sub(at);
      const r = v3.length(), yaw = Math.atan2(v3.x, v3.z) + cam.yawOff, pitch = clamp(Math.asin(clamp(v3.y / r, -1, 1)) + cam.pitchOff, 0.05, 1.35);
      want.set(at.x + Math.sin(yaw) * Math.cos(pitch) * r, at.y + Math.sin(pitch) * r, at.z + Math.cos(yaw) * Math.cos(pitch) * r);
    }
    const gh = groundHeight(want.x, want.z) + 0.5;
    if (want.y < gh) want.y = gh;
    if (!cam.init) { cam.pos.copy(c.position); cam.look.copy(at); cam.init = true; }
    const k = 1 - Math.exp(-dt * (roll && roll.launched ? 3.2 : myAim ? 4 : 2.4)), lk = 1 - Math.exp(-dt * (myAim ? 7 : 5));
    cam.pos.lerp(want, k); cam.look.lerp(at, lk);
    c.position.copy(cam.pos); c.lookAt(cam.look);
    return true;
  }

  // ---------------------------------------------------------------- framing a shot
  // The camera behind the court-local spot (tx, tz), looking along (ux, uz), `side` metres to its right: the smallest distance back
  // (and the height that goes with it) at which the person standing there (feet to head) and the far point (fx, fz) - the
  // pallino, the farthest ball - both sit in the screen's free band, between the score strip at the top and the throw
  // controls at the bottom, on any shape of screen (an upright phone, a phone sideways, a PC). Scalars only: no allocation.
  // (the camera's axes for the solve, and the last answer: the solve runs again only when what it was asked changes)
  const FS = { cx: 0, cy: 0, cz: 0, fx: 0, fy: 0, fz: 0, rx: 0, rz: 0, ux: 0, uy: 0, uz: 0, tanY: 1, asp: 1, lx: 0, lz: 0, key: [] };
  const fsDepth = (x, y, z) => (x - FS.cx) * FS.fx + (y - FS.cy) * FS.fy + (z - FS.cz) * FS.fz;
  const fsY = (x, y, z) => { const d = fsDepth(x, y, z); return d < 0.2 ? 9 : (1 - ((x - FS.cx) * FS.ux + (y - FS.cy) * FS.uy + (z - FS.cz) * FS.uz) / (d * FS.tanY)) / 2; };
  const fsX = (x, y, z) => { const d = fsDepth(x, y, z); return d < 0.2 ? 9 : (1 + ((x - FS.cx) * FS.rx + (z - FS.cz) * FS.rz) / (d * FS.tanY * FS.asp)) / 2; };
  function frameShot(tx, tz, ux, uz, fx, fz, side, c, want, at) {
    const k = FS.key;
    if (k[0] !== tx || k[1] !== tz || k[2] !== ux || k[3] !== uz || k[4] !== fx || k[5] !== fz || k[6] !== side || k[7] !== c.aspect || k[8] !== c.fov) {
      k[0] = tx; k[1] = tz; k[2] = ux; k[3] = uz; k[4] = fx; k[5] = fz; k[6] = side; k[7] = c.aspect; k[8] = c.fov;
      solveShot(tx, tz, ux, uz, fx, fz, side, c);
    }
    worldOf(FS.cx, FS.cy, FS.cz, want);
    worldOf(FS.lx, 0.3, FS.lz, at);
  }
  function solveShot(tx, tz, ux, uz, fx, fz, side, c) {
    FS.tanY = Math.tan((c.fov * Math.PI) / 360); FS.asp = c.aspect;
    const asp = c.aspect, tall = asp < 0.85;
    const top = tall ? 0.12 : asp > 1.9 ? 0.2 : 0.14, bot = tall ? 0.76 : 0.82; // (the band: under the strip, over the bar and BOWL)
    const tallest = tall ? 0.2 : asp > 1.9 ? 0.3 : 0.27; // the thrower no taller than this much of the screen (they hid the court)
    const K = tall ? 0.52 : 0.45; // height per metre back
    const D = Math.max(1, Math.hypot(fx - tx, fz - tz));
    let back = 2.4, ahead = D * 0.5;
    for (; back < 18; back += 0.3) {
      let ok = false;
      for (let it = 0; it < 4; it++) {
        FS.cx = tx - ux * back - uz * side; FS.cz = tz - uz * back + ux * side; FS.cy = 1 + back * K;
        FS.lx = tx + ux * ahead; FS.lz = tz + uz * ahead;
        // the camera's axes: forward, right = forward x world up, up = right x forward
        let a = FS.lx - FS.cx, b = 0.3 - FS.cy, d = FS.lz - FS.cz;
        const fl = Math.hypot(a, b, d); FS.fx = a / fl; FS.fy = b / fl; FS.fz = d / fl;
        a = -FS.fz; d = FS.fx; const rl = Math.hypot(a, d) || 1; FS.rx = a / rl; FS.rz = d / rl;
        FS.ux = -FS.rz * FS.fy; FS.uy = FS.rz * FS.fx - FS.rx * FS.fz; FS.uz = FS.rx * FS.fy;
        const feet = fsY(tx, 0, tz), head = fsY(tx, 1.9, tz), far = fsY(fx, 0.05, fz);
        const sx0 = fsX(tx, 0.9, tz), sx1 = fsX(fx, 0.05, fz);
        ok = Math.min(head, far) >= top && feet <= bot && feet - head <= tallest && sx0 > 0.06 && sx0 < 0.94 && sx1 > 0.06 && sx1 < 0.94;
        // the thrower's feet low in the band (the court runs up the screen from them): too low -> look nearer
        ahead = clamp(ahead - (feet - (bot - 0.05)) * D * 0.9, 0, D);
        if (ok) break;
      }
      if (ok) break;
    }
    shotInfo.back = back; shotInfo.ahead = ahead; shotInfo.solves++;
  }
  const shotInfo = { back: 0, ahead: 0, solves: 0 };

  // ---------------------------------------------------------------- bots
  function updateBots(dt, now) {
    const t = nowS();
    const on = matchOn();
    const near = camera.position.distanceToSquared(G.position) < 75 * 75;
    for (const bot of bots) {
      const seat = on ? S.seats.findIndex(s => s.k === 'b' && s.bot === bot.b) : -1;
      let spot = null, anim = null, show = true;
      if (seat >= 0) {
        spot = spotFor(seat);
        if (!bot.w) { // walk in: from the bench, or up the trail
          if (bot.b < 2) { const [x, z] = toLocalXZ(court.benchSeat(bot.b).x, court.benchSeat(bot.b).z); bot.w = newWalker(x + 0.35, z, -Math.PI / 2); }
          else bot.w = newWalker(6.5, 0.4 + bot.b * 0.5, -Math.PI / 2);
        }
      } else if (bot.b < 2) {
        const bs = court.benchSeat(bot.b);
        const [x, z] = toLocalXZ(bs.x, bs.z);
        if (bot.w && (Math.abs(bot.w.x - x) > 0.4 || Math.abs(bot.w.z - z) > 0.2)) spot = { x: x - 0.35, z, yaw: -Math.PI / 2 };
        else { bot.w = null; anim = 'sit'; }
        if (!bot.w) {
          bot.h.params.seatY = (bs.seat ?? BENCH_H) / (BOT_LOOK[bot.b].scale || 1);
          bot.h.root.position.set(bs.x, bs.y, bs.z); bot.h.root.rotation.y = bs.yaw;
        }
      } else {
        if (bot.w) { spot = { x: 6.5, z: bot.w.z, yaw: Math.PI / 2 }; if (Math.abs(bot.w.x - 6.5) < 0.1) { bot.w = null; show = false; } }
        else show = false;
      }
      bot.h.root.visible = show;
      if (!show) continue;
      if (bot.w) {
        if (spot) aimTo(bot.w, spot);
        stepWalker(bot.w, dt);
        bot.h.root.rotation.y = walkerWorld(bot.w, bot.h.root.position);
        bot.h.params.seatY = 0;
        anim = bot.w.hop ? 'jump' : bot.w.moving ? null : (cheers.get(seat) || 0) > t ? 'cheer' : 'idle';
      }
      if (near) bot.h.update(dt, now, bot.w && bot.w.moving && !bot.w.hop ? 2.4 : 0, anim);
      bot.tag.node.style.setProperty('--c', seat >= 0 ? TEAM_COL[S.seats[seat].team] : '#ffffff');
    }
  }

  // ---------------------------------------------------------------- the bowling arm (drawn over the pose at render time)
  // bodies-poses.js has no underhand bowl, so the arm, chest and free arm are set here after the Human has posed
  // itself, for whoever is at the line: ready (arm drawn back as the power charges), the swing, the follow-through.
  function bowlArm(h, p, u) {
    if (!h || !h.armR || !h.chest) return;
    let sw, el = 0.3, lean;
    if (u === null) { sw = 0.35 - 1.3 * p; el = 0.35 + 0.25 * p; lean = 0.12 + 0.18 * p; }
    else {
      const back = 0.35 - 1.3 * p;
      if (u < RELEASE_T) { const k = u / RELEASE_T; sw = back + (1.25 - back) * k * k; lean = 0.3; }
      else if (u < 0.75) { const k = (u - RELEASE_T) / 0.45; sw = 1.25 + 0.5 * Math.sin(k * Math.PI / 2); lean = 0.3; el = 0.15; }
      else { const k = Math.min(1, (u - 0.75) / 0.35); sw = 1.75 * (1 - k) + 0.1 * k; lean = 0.3 * (1 - k); el = 0.15 + 0.2 * k; if (k >= 1) return; }
    }
    h.armR.shoulder.rotation.set(-sw, 0, -0.12);
    h.armR.elbow.rotation.set(-el, 0, 0);
    h.armL.shoulder.rotation.set(-0.45, 0, 0.42);
    h.chest.rotation.x += lean;
    h.root.updateMatrixWorld(true);
  }
  function beforeRender() {
    if (!S || !matchOn()) return;
    const t = nowS();
    const ts = turnSeat();
    for (const [seat, s] of swings) {
      const u = (t - s.t0) * speedK();
      if (u > 1.2) { swings.delete(seat); continue; }
      bowlArm(charOf(seat), s.p, Math.max(0, u));
    }
    if (ts >= 0 && !swings.has(ts)) {
      const p = ts === mySeat() && aimSt ? (aimSt.charging ? aimSt.power : 0) : remoteAim && remoteAim.seat === ts ? remoteAim.p : 0;
      const c = charOf(ts);
      const s = S.seats[ts];
      const w = s.k === 'b' ? bots[s.bot].w : ts === mySeat() ? part && part.w : null;
      if (!w || !w.moving) bowlArm(c, p, null);
    }
  }
  const prevHook = scene.onBeforeRender;
  scene.onBeforeRender = function (...a) { prevHook?.apply(this, a); beforeRender(); };

  // pointer: hold the left button to charge while it is my turn (fishing and the camera use the same button: we only
  // take it while aiming, when neither of them is active)
  canvas.addEventListener('pointerdown', e => { if (e.button === 0 && e.pointerType !== 'touch' && !(e.buttons & 2) && aimSt && !aimSt.thrown && part) mouseHeld = true; });
  addEventListener('pointerup', () => { mouseHeld = false; });
  addEventListener('blur', () => { mouseHeld = false; touchHeld = false; touchAim = 0; });

  // ---------------------------------------------------------------- HUD per frame
  function nearCourt(pad) {
    const [lx, lz] = localHere(player.pos.x, player.pos.z);
    return Math.abs(lx) < COURT.W / 2 + pad + 1 && Math.abs(lz) < COURT.L / 2 + pad;
  }
  function updateHud() {
    const on = matchOn();
    const close = part || watch || (on && nearCourt(22));
    if (!on || !close) { hud.setScore(null); return; }
    const ts = turnSeat(), mine = ts >= 0 && ts === mySeat();
    const up = roll ? roll.m.seat : ts;
    const turnTeam = up >= 0 && S.seats[up] ? S.seats[up].team : -1;
    let secs = null;
    if (mine && S.dl) { const left = Math.ceil((S.dl - (performance.now() - S.at)) / 1000); if (left <= 15 && left >= 0) secs = left; }
    const say = `Red ${S.score[0]}, Green ${S.score[1]}, first to ${S.target}, frame ${S.frame + 1}. ${mine ? 'Your turn.' : up >= 0 ? seatName(up) + ' is up.' : ''}`;
    hud.setScore({ score: S.score, target: S.target, frame: S.frame, left: S.left, turnTeam, turnMine: mine, secs, say });
  }

  // ---------------------------------------------------------------- while you play or watch, the rest of the HUD steps aside
  // #hud.bocce-play (bocce.css): the minimap block, the pills, the counters, the tools and the smiley tuck away; the quest list folds
  // to its pill (quests.hold, your own fold is kept); the name tags of everybody but the thrower fade and shrink (#labels.bocce-quiet,
  // the thrower's tag wears .bocce-up). All of it comes back by itself when the game ends or you stop watching.
  const labels = document.getElementById('labels');
  let playOn = false, upSeatWas = -2, upTag = null, upTagTry = 0;
  function tagNodeOf(root) { for (const it of ui.items || []) if (it.tag && it.obj === root) return it.node; return null; }
  function syncPlay() {
    const want = !!((part || watch) && matchOn());
    if (want !== playOn) {
      playOn = want;
      ctx.hud.classList.toggle('bocce-play', want);
      labels?.classList.toggle('bocce-quiet', want);
      ctx.quests?.hold?.(want);
    }
    const up = want ? (roll ? roll.m.seat : turnSeat()) : -1;
    const t = nowS();
    if (up !== upSeatWas || (up >= 0 && !upTag && t > upTagTry)) {
      upSeatWas = up;
      upTag?.classList.remove('bocce-up'); upTag = null;
      if (up >= 0) { const c = charOf(up); upTag = c ? tagNodeOf(c.root) : null; upTag?.classList.add('bocce-up'); upTagTry = t + 0.5; } // (a remote body not in yet: try again shortly)
    }
  }

  // ---------------------------------------------------------------- spectators: standing by the court during a game, you watch
  // Before, watching was only behind an E nobody found, and from the follow camera behind you the balls 10 m down the court were a
  // few pixels (Andrew 2026-11-07: "when spectating it doesn't show you the in-progress game"). Now: stand still by the court for a
  // moment while a game is on (walking up, or joining the yard right there) and the camera frames the game with the score strip.
  // Walking (the stick, WASD), E or Esc stops watching; it does not start again until you have left the court and come back.
  let stillFor = 0, declined = false;
  function autoWatch(dt) {
    if (!matchOn() || part || ctx.mode !== 'play') { stillFor = 0; if (!matchOn()) declined = false; return; }
    if (!nearCourt(8)) { declined = false; stillFor = 0; return; }
    if (watch || declined || player.takeover || hud.cardOpen || !nearCourt(3)) { stillFor = 0; return; }
    const mv = input.move?.() || { x: 0, y: 0 };
    const still = Math.abs(mv.x) < 0.1 && Math.abs(mv.y) < 0.1 && (player.speed || 0) < 0.2 && player.grounded !== false;
    stillFor = still ? stillFor + dt : 0;
    if (stillFor > 1.2) { stillFor = 0; startWatch(); }
  }

  // ---------------------------------------------------------------- plug-in
  let lastCd = 0;
  return {
    name: 'bocce',
    help: [
      [['E'], 'at the bocce court: pick a team and play (bots fill empty seats), or watch'],
      [['A', 'D'], 'bocce: aim  (hold Space or the mouse, let go to bowl)'],
    ],
    target(px, pz) {
      if (part) {
        const aiming = aimSt && !aimSt.thrown && turnSeat() === part.seat;
        return { hint: aiming ? '' : 'E  Leave the game', prio: 10, run: () => {
          if (aiming) return;
          const t = nowS();
          if (t - leaveAsk < 3) { send({ op: 'quit' }); leaveAsk = 0; } else { leaveAsk = t; ui.toast('Press E again to leave. A bot will take your seat.', 3000); }
        } };
      }
      if (watch) return { hint: 'E  Stop watching', prio: 10, run: stopWatch };
      if (ctx.mode !== 'play' || player.takeover) return null;
      if (!nearCourt(2.6)) { if (hud.cardOpen && !nearCourt(7)) closeCard(); return null; }
      if (hud.cardOpen) return { hint: '', prio: 7, run: closeCard };
      if (matchOn()) return { hint: 'E  Watch the bocce game', prio: 6, run: startWatch };
      return { hint: myLobbySeat() >= 0 ? 'E  Bocce: back to the team card' : 'E  Play bocce', prio: 6, run: openCard };
    },
    onKey(code) {
      if (hud.cardOpen) {
        const map = { KeyR: () => send({ op: 'sit', team: 0 }), Digit1: () => send({ op: 'sit', team: 0 }), KeyG: () => send({ op: 'sit', team: 1 }), Digit2: () => send({ op: 'sit', team: 1 }),
          KeyT: () => send({ op: 'opt', target: S && S.target === 12 ? 7 : 12 }), Digit3: () => send({ op: 'opt', target: S && S.target === 12 ? 7 : 12 }),
          KeyF: () => send({ op: 'opt', size: S && S.size === 1 ? 2 : 1 }), Digit4: () => send({ op: 'opt', size: S && S.size === 1 ? 2 : 1 }),
          KeyL: () => send({ op: 'stand' }), Enter: () => send({ op: 'start' }), NumpadEnter: () => send({ op: 'start' }), Space: () => send({ op: 'start' }),
          Escape: closeCard, KeyE: closeCard };
        if (map[code]) { map[code](); return true; }
        return code.startsWith('Digit');
      }
      if (part) {
        if (code === 'Space') return true;
        if (code === 'Escape' && aimSt && aimSt.charging) { aimSt.charging = false; aimSt.armed = false; aimSt.startedAt = nowS(); return true; }
        return false;
      }
      if (watch && (code === 'Escape' || code === 'Space')) { stopWatch(); return true; }
      return false;
    },
    update(dt, now) {
      if (part) wrapWalk();
      if (watch) { const mv = input.move?.(); if (mv && (Math.abs(mv.x) > 0.3 || Math.abs(mv.y) > 0.3)) stopWatch(); }
      stepRoll(dt);
      updateBalls();
      updateBots(dt, now);
      if (aimSt && part) aimUpdate(dt); else hud.hideAim();
      // a relayed aim from another human at the line: a dimmer guide for the spectators
      const ts = turnSeat();
      if (!(aimSt && part && !aimSt.thrown && ts === mySeat())) {
        if (remoteAim && remoteAim.seat === ts && nowS() - remoteAim.at < 3 && !roll && S.seats[ts].k === 'h') drawGuide(S.end, remoteAim.a, remoteAim.p || 0.5, false);
        else if (!roll && guide.key) clearGuide();
      }
      if (rings.length && nowS() > ringsUntil) clearRings();
      if (S && S.phase === 'countdown') { const left = Math.ceil((S.cdAt - performance.now()) / 1000); if (left !== lastCd && left >= 0) { lastCd = left; if (hud.cardOpen) refreshCard(); if (left > 0 && (nearCourt(8) || myLobbySeat() >= 0)) tick(); } }
      updateHud();
      autoWatch(dt);
      syncPlay();
      updateMarker(now);
    },
    // for the test scripts and the console
    debug: {
      stats, get state() { return S; }, get ballsShown() { return balls.filter(b => b.visible).length; }, ballAt: i => (balls[i] && balls[i].visible ? [balls[i].position.x, balls[i].position.z] : null), get playOn() { return playOn; }, get marker() { return { idx: marker.idx, team: marker.team, shown: markRing.visible }; }, shotInfo, get roll() { return roll; }, get part() { return part; }, get aim() { return aimSt; }, get watch() { return !!watch; }, bots, court, hud,
      mySeat, openCard, closeCard, startWatch, stopWatch,
      sit: team => send({ op: 'sit', team }), start: () => send({ op: 'start' }), opt: o => send({ op: 'opt', ...o }),
      // throw now with what a good bot would do (or the given aim and power), skipping the charge
      autoThrow(aim, power) {
        if (!aimSt || turnSeat() !== mySeat() || aimSt.thrown) return false;
        if (aim === undefined) {
          const m = R.newMatch({ seats: S.seats.map(s => ({ team: s.team, slot: s.slot, kind: 'bot', bot: 2 })), target: S.target, size: S.size });
          Object.assign(m, { phase: S.phase, turn: S.turn, pos: S.pos, end: S.end, palTeam: S.pal, frameNo: S.frame, score: S.score, thrown: [4 - S.left[0], 4 - S.left[1]] });
          const t = R.botThrow(m, S.turn, Math.random); aim = t.aim; power = t.power;
        }
        doThrow(aim, power);
        return true;
      },
      setAim(a, p) { if (aimSt) { aimSt.aim = a; aimSt.power = p; } },
    },
  };
}
