// The old swing tree and its tire swing. buildSwingTree() is called by world.js while the world is built and returns
// an updater; createSwing() is the interactive feature (ride it, get pushed, the height game) plugged in by main.js.
//
// How a ride works: the rider's client runs the pendulum (swing-physics.js) and places the player on the seat every frame
// (a takeover); everybody else sees that position stream and hangs the tire from it (swing-rig.js), so remote screens
// need nothing swing-specific but a few small messages (who is riding, a push, a launch, a landing, the records).
import * as THREE from 'three';
import { SW, newSwing, step as swStep, energy, pump as swPump, push as swPush, pushEff, pumpTiming, leaveVel } from './swing-physics.js';
import { RIG, rigSync, seatFeet } from './swing-rig.js';
import { SWING_TREE, WALK } from './layout.js';
import { groundHeight } from './terrain.js';
import { pointInPoly, closestOnPoly, clamp, angleLerp } from './util.js';
import { createFx } from './swing-fx.js';
import { inSand } from './swing-hill.js';
import { createHud } from './swing-hud.js';
import { createSign } from './swing-sign.js';
import { registerSwingSfx } from './swing-sfx.js';

export { buildSwingTree } from './swing-tree.js';

const PITCH = [112, 162, 232];            // the three voices (Low, Medium, High) in Hz, like main.js VOICES
const TAU = Math.PI * 2;
const UPV = new THREE.Vector3(0, 1, 0), XV = new THREE.Vector3(1, 0, 0), ZV = new THREE.Vector3(0, 0, 1);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const pick = a => a[(Math.random() * a.length) | 0];
const CHEERS = ['Wheee!', 'Higher!', 'Again!'];
// the heights the feedback steps up at (the apex the swing is heading for, m): the card glows, the words pop, a cheer.
// The third is past the warning band, where the grip starts to go
const TIER_H = [1.0, 1.5, 2.0], TIER_WORD = ['Higher!', 'Whoa!', 'SKY HIGH!'];
const SAND_COL = '#ecd9a0';
const STAR_M = [5, 10, 15]; // a landing's stars: flown at least this far (the pit's pegs, swing-pit.js PEGS)
const nearestTurn = a => Math.round(a / TAU) * TAU;

// The interactive part. ctx = the feature context (see docs/CONTRACTS.md).
export function createSwing(ctx) {
  const { scene, camera, player, net, audio, ui, input, remotes, profile, colliders } = ctx;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const myPitch = () => PITCH[profile.voice] ?? PITCH[1];

  registerSwingSfx(audio);
  const fx = createFx(scene, camera);
  const sign = createSign(scene, colliders);
  const hud = createHud(ctx, { pump: () => pumpPress(), hop: () => hopOff() });
  colliders.push({ type: 'circle', x: RIG.restSeat.x, z: RIG.restSeat.z, r: 0.5 }); // nobody walks through the hanging tire

  // ---------------------------------------------------------------- shared state
  const S = { rider: null, riderName: '', champ: null, fly: null, me: { best: 0, flight: 0, rides: 0 }, pending: 0, pendingAt: 0 };
  let R = null;                           // my ride / flight, or null
  let lunge = null;                       // me shoving a friend
  const pusher = { combo: 0, lastAt: -9, lastGain: 0 }; // my streak of good pushes on the current rider
  const local = { riding: false };        // read by rigSync: the tire hangs from me
  const flips = { ang: 0, roll: 0, active: false }; // whole-body tumble for me, applied at render time
  const remoteFx = new Map();             // sid -> tumble of somebody else
  const obs = { th: 0, w: 0, apexAt: 0, botAt: 0, leafAcc: 0, rustleAt: 0, squealAt: 0, sparkAt: 0, wasDriven: false };
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), tgt: new THREE.Vector3(), yawOff: 0, pitchOff: 0, distMul: 1, idleAt: 0 };
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const probe = newSwing();               // scratch pendulum for looking a moment ahead
  let beatAt = 0, offlineSince = 0, lastPushAt = -9, flipKey = -1;
  const canopy = { x: SWING_TREE.x + RIG.right.x * 0.9, y: RIG.groundY + 6.0, z: SWING_TREE.z + RIG.right.z * 0.9 };
  const restXZ = RIG.restSeat;
  const FW = RIG.fwd, RT = RIG.right, YAW = RIG.yaw; // the way the rider faces: down the hill

  const online = () => net.status === 'online' && net.sid != null;
  const say = (obj, text, secs = 1.6, cls = 'player') => ui.say(obj, text, secs, 2.3, cls);
  const tirePos = (out, th, phi) => seatFeet(th, phi, out, SW.L);
  const refreshSign = () => sign.update({ champ: S.champ, fly: S.fly, mine: S.me });
  const rumble = (a, b, ms) => { try { input.rumble?.(a, b, ms); } catch { /* no pad */ } };
  const nowS = () => performance.now() / 1000;

  // ---------------------------------------------------------------- network
  net.on('swing', m => {
    switch (m.op) {
      case 'state': {
        S.rider = m.rider ?? null; S.riderName = m.name || '';
        if (m.champ !== undefined) S.champ = m.champ;
        if (m.fly !== undefined) S.fly = m.fly;
        if (m.me) { S.me = m.me; hud.setRecord(S.me.best); }
        refreshSign();
        if (R && R.online && ['hopin', 'ride', 'slowmo'].includes(R.phase) && S.rider !== net.sid && !S.pending) {
          // the server no longer has me on the swing (my tab slept, or I reconnected): let go rather than ride a ghost
          ui.toast('Your turn on the swing ended.'); end('abort');
        } else if (S.pending && S.rider === net.sid) { S.pending = 0; beginHop(); }
        else if (S.rider === net.sid && !R && !S.pending) net.send({ t: 'swing', op: 'leave', how: 'hop', h: 0 }); // the server thinks I ride but I do not: free it
        if (m.ev) onEvent(m);
        break;
      }
      case 'busy':
        S.pending = 0;
        ui.toast(m.far ? 'Step a little closer to the swing.' : `${m.name || 'Someone'} is on the swing. Wait your turn!`);
        break;
      case 'push': onPushed(m); break;
      case 'pushok': onPushOk(m); break; // the rider's screen says how much my push added
      case 'result': {
        S.me = { best: m.best, flight: m.flight, rides: m.rides };
        hud.setRecord(S.me.best);
        ctx.selfExt.swingBest = m.best;
        refreshSign();
        if (m.newChamp && !m.landed) { ui.toast('You are the Swing Champion!', 4200); audio.play('swing-fanfare', player.pos.x, player.pos.y + 1.5, player.pos.z); }
        else if (m.newChamp && m.landed) ui.toast('Longest flight on the sign is yours!', 3800);
        else if (m.newBest) ui.toast(`New personal best: ${m.best.toFixed(1)} m!`, 3200);
        else if (m.newFlight) ui.toast(`Longest flight yet: ${m.flight.toFixed(0)} m!`, 3200);
        break;
      }
      case 'ev': onEvent(m); break;
    }
  });

  // other people's swing moments: launches, landings, records
  function onEvent(m) {
    const r = remotes.map.get(m.sid);
    const dSwing = Math.hypot(player.pos.x - restXZ.x, player.pos.z - restXZ.z);
    if (m.ev === 'launch' || m.ev === 'jump') {
      if (m.sid === net.sid) return; // mine are handled where they happen
      const launch = m.ev === 'launch';
      RIG.kick = { w: launch ? 2.6 : 0.6, twist: launch ? 15 : 0, until: RIG.t + 2 };
      if (launch) {
        if (r) { const rp = r.ch.root.position; fx.sparkle(rp.x, rp.y + 1, rp.z, 16, 1.1); }
        fx.birds(canopy.x, canopy.y, canopy.z, 7); fx.leaves(canopy.x, canopy.y, canopy.z, 16, 2.6);
        audio.play('swing-sproing', RIG.pivot.x, RIG.pivot.y - 3, RIG.pivot.z);
        audio.play('swing-wings', canopy.x, canopy.y, canopy.z);
      }
      if (r) {
        remoteFx.set(m.sid, { t0: nowS(), landAt: 0, bush: false, spinV: launch ? 9 : 6, kind: m.ev });
        const rp = r.ch.root.position;
        if (dSwing < 45) audio.play('swing-wee', rp.x, rp.y + 1.2, rp.z, { pitch: PITCH[r.voice] ?? 162, dur: launch ? 1.7 : 1.1, h: {} });
      }
      // people nearby have a reaction
      if (!R && dSwing < 16 && launch) {
        setTimeout(() => {
          if (R || !player.character) return;
          say(player.character.root, pick(['!', 'Whoa!', 'HA!', 'Yikes!', 'Ha ha!']), 1.8);
          audio.play('swing-giggle', player.pos.x, player.pos.y + 1.6, player.pos.z, { pitch: myPitch() });
        }, 350 + Math.random() * 400);
      }
      if (launch && m.record) ui.toast(`${m.name} is the new Swing Champion with ${m.h.toFixed(1)} m!`, 4200);
    } else if (m.ev === 'land') {
      const fxr = remoteFx.get(m.sid);
      const gh = groundHeight(m.x, m.z);
      if (!m.bush && inSand(m.x, m.z)) { fx.dust(m.x, gh, m.z, 16, 1.5, SAND_COL); fx.spray(m.x, gh, m.z, 16); } // (the same puff of sand)
      else fx.dust(m.x, gh, m.z, m.bush ? 4 : 9, 1.1);
      audio.play('swing-boing', m.x, gh + 0.3, m.z, { k: 0.9 });
      if (m.bush) { fx.bush(m.x, m.z); fx.leaves(m.x, gh + 1, m.z, 12, 0.8); audio.play('swing-rustle', m.x, gh + 1, m.z, { v: 0.9 }); }
      else audio.play('swing-oof', m.x, gh + 0.5, m.z, { v: 0.5, pitch: PITCH[r?.voice] ?? 162 });
      if (fxr) { fxr.landAt = nowS(); fxr.bush = !!m.bush; fxr.kind = m.how; fxr.angAtLand = fxr.spinV * (fxr.landAt - fxr.t0); }
      if (r && m.how === 'launch' && !m.bush) setTimeout(() => fx.stars(o => o.set(r.ch.root.position.x, r.ch.root.position.y + 1.55, r.ch.root.position.z), 1.4), 1100);
      if (m.d >= 10 && r) say(r.ch.root, `${m.d.toFixed(0)} m!`, 2, '');
    } else if (m.ev === 'flight') {
      if (m.sid !== net.sid && dSwing < 60) ui.toast(`${m.name} set the longest flight: ${m.d.toFixed(0)} m!`, 3800);
    }
  }

  // my push landed: the height it added pops up over my E, a streak of good ones counts up
  function onPushOk(m) {
    const g = Number(m.gain) || 0, rider = S.rider && S.rider !== net.sid ? remotes.map.get(S.rider) : null;
    pusher.lastGain = g;
    hud.push.gain(g >= 0.05 ? `+${g.toFixed(1)} m` : 'Push!');
    if (rider && g >= 0.25) { const rp = rider.ch.root.position; fx.sparkle(rp.x, rp.y + 1, rp.z, 8 + Math.round(g * 10), 0.8); }
    if (g >= 0.35 && player.character) audio.play('swing-perfect', player.pos.x, player.pos.y + 1.5, player.pos.z, { n: Math.min(3, pusher.combo) });
  }

  // a friend shoves me (the server relayed it)
  function onPushed(m) {
    if (!R || R.phase !== 'ride') return;
    const t = R.sw.t;
    if (t - (R.pushAt[m.from] ?? -9) < SW.PUSH_GAP - 0.05) return;
    R.pushAt[m.from] = t;
    R.pushQ.push(m);
  }

  // ---------------------------------------------------------------- getting on
  function requestBoard() {
    if (R || S.pending) return;
    if (!online()) { beginHop(); return; }
    S.pending = 1; S.pendingAt = nowS();
    net.send({ t: 'swing', op: 'board' });
  }

  function beginHop() {
    if (R) return;
    S.pending = 0;
    const p = player.pos;
    R = {
      phase: 'hopin', t: 0, dur: 0.6, ts: 1, sw: null, online: online(), from: p.clone(), yawFrom: player.yaw,
      pumpQ: 0, pushQ: [], pushAt: {}, pushRec: [], lastInput: nowS(), bubbleAt: -9, combo: 0, kick: 0, beatMine: false, beatChamp: false,
      f: null, dist: 0, lastLean: 0, lastWhoosh: -9, lastCreak: -9, lastSqueal: -9, shake: 0, uhoh: false, leafAcc: 0, rustleAt: 0, doomSaid: 0,
      ending: null, finished: false, landSent: false, kind: 'hop', held: player.held, tierMax: 0, tierAt: -9, sparkAt: -9, windAt: -9,
    };
    if (player.held) player.setHeld(null); // no fishing rod poking through the tire
    R.dur = clamp(0.42 + Math.hypot(p.x - restXZ.x, p.z - restXZ.z) * 0.13, 0.5, 0.78);
    player.emote = null; player.emoteUntil = 0;
    player.takeover = {
      anim: 'jump', minigame: 'swing',   // (minigame: the yard's music keeps out, music.js)
      update: (dt, now) => tick(dt, now),
      camera: (dt, cam2, inp, now) => camUpdate(dt, cam2, inp, now),
    };
    cam.pos.copy(camera.position);
    if (player.cam.look.lengthSq()) cam.look.copy(player.cam.look); else cam.look.set(p.x, p.y + 1.5, p.z);
    cam.yawOff = 0; cam.pitchOff = 0; cam.distMul = 1; cam.idleAt = 0; cam.hFr = 1.2; cam.band = null;
    hud.show(input.lastDevice); hud.mode('ride'); hud.set({ hNow: 0, hEq: 0, best: 0, d: 0, gripV: 1, doomed: false }); hud.setRecord(S.me.best);
    audio.play('swing-creak', RIG.pivot.x, RIG.pivot.y - 2.5, RIG.pivot.z, { v: 0.2 });
  }

  // ---------------------------------------------------------------- the frame (runs inside Player.update through the takeover)
  function tick(dt, now) {
    if (!R || R.ending) return;
    // any way of leaving play (the outfit editor, the morning replay, a game launch) or losing the connection frees the swing
    if (ctx.mode !== 'play') return end('abort');
    if (R.online && (R.phase === 'hopin' || R.phase === 'ride' || R.phase === 'slowmo')) {
      if (!online()) { offlineSince = offlineSince || now; if (now - offlineSince > 3) { ui.toast('Lost the connection, so you hopped off.'); return end('abort'); } }
      else offlineSince = 0;
      if (now - beatAt > 4) { beatAt = now; net.send({ t: 'swing', op: 'beat' }); }
    }
    R.t += dt;
    switch (R.phase) {
      case 'hopin': return hopIn(dt);
      case 'ride': case 'slowmo': return ride(dt);
      case 'hopout': return hopOutTick();
      case 'fly': return flyTick(dt);
      case 'bush': return bushTick(dt);
      case 'dazed': case 'stand': return afterTick(dt);
    }
  }
  const setPose = (anim, yaw) => { player.takeover.anim = anim; if (yaw !== undefined) player.yaw = yaw; };

  function hopIn(dt) {
    const e = clamp(R.t / R.dur, 0, 1);
    const k = e * e * (3 - 2 * e);
    seatFeet(RIG.th, RIG.phi, v1);
    player.pos.lerpVectors(R.from, v1, k);
    player.pos.y += Math.sin(e * Math.PI) * 0.85;
    player.yaw = angleLerp(R.yawFrom, YAW, Math.min(1, e * 1.6));
    player.character.params.lean = 0;
    if (e >= 1) {
      // seated: the pendulum starts from wherever the tire was, with a little push-off from the hop
      R.sw = newSwing(RIG.th, RIG.w + 0.3);
      R.sw.rand = Math.random;
      R.phase = 'ride'; R.t = 0; local.riding = true;
      setPose('swing', YAW);
      audio.play('swing-creak', v1.x, v1.y + 1, v1.z, { v: 0.3 });
    }
  }

  function ride(dt) {
    const sw = R.sw, slow = R.phase === 'slowmo';
    R.ts += ((slow ? 0.35 : 1) - R.ts) * Math.min(1, dt * (slow ? 14 : 8));
    const dts = dt * R.ts;
    const prevTh = sw.th, prevW = sw.w;

    if (!slow) {
      while (R.pumpQ > 0) { R.pumpQ--; doPump(); }
      while (R.pushQ.length) applyPush(R.pushQ.shift());
    } else { R.pumpQ = 0; R.pushQ.length = 0; }
    const ev = swStep(sw, dts);
    const e = energy(sw);
    // a push is over: what it added goes back to its pusher (and pops up here too)
    while (R.pushRec.length && sw.t - R.pushRec[0].at > SW.PUSH_TIME + 0.15) {
      const pr = R.pushRec.shift(), gain = Math.max(0, e.h - pr.h0);
      if (R.online && online()) net.send({ t: 'swing', op: 'pushed', to: pr.from, gain: +gain.toFixed(2), eff: +pr.eff.toFixed(2) });
      if (gain >= 0.1 && R.t - R.tierAt > 0.8) hud.flash(`+${gain.toFixed(1)} m`, 'good');
    }

    // crossings: the rope groans at each end of the arc, air whooshes past at the bottom
    if (prevW * sw.w < 0 && e.d > 0.15 && R.t - R.lastCreak > 0.5) {
      R.lastCreak = R.t; tirePos(v1, sw.th, 0);
      audio.play('swing-creak', v1.x, v1.y, v1.z, { v: e.d });
    }
    if (prevTh * sw.th < 0 && e.vb > 3.2 && R.t - R.lastWhoosh > 0.5) {
      R.lastWhoosh = R.t; tirePos(v1, 0, 0);
      audio.play('swing-whoosh', v1.x, v1.y, v1.z, { v: Math.min(1.3, e.d * 1.1) }); // (louder the higher you go)
      // wind lines streak past at the bottom of a fast swoop
      if (e.vb > 6 && !reduced) { const dir = Math.sign(sw.w) || 1; fx.wind(v1.x, v1.y + 0.3, v1.z, FW.x * dir, 0, FW.z * dir, Math.round(3 + smooth(6, 10, e.vb) * 6)); }
    }
    // higher and higher: twinkles off the tire at each end of the arc, more the higher it gets
    if (prevW * sw.w < 0 && e.h > 1.1 && R.t - R.sparkAt > 0.4) { R.sparkAt = R.t; tirePos(v1, sw.th, 0); fx.sparkle(v1.x, v1.y + 0.6, v1.z, Math.round(3 + smooth(1.1, 2.3, e.h) * 9)); }
    const tier = e.h >= TIER_H[2] ? 3 : e.h >= TIER_H[1] ? 2 : e.h >= TIER_H[0] ? 1 : 0;
    hud.tier(tier);
    if (tier > R.tierMax) { R.tierMax = tier; reachTier(tier); }

    // danger: wobble, squeal, rumble, leaves, a worried face
    const wob = smooth(SW.WARN, 1.25, e.d);
    const doomed = sw.doomed;
    if (e.d > 0.94 && !R.uhoh && R.t - R.bubbleAt > 4) { R.uhoh = true; R.bubbleAt = R.t; say(player.character.root, pick(['uh oh...', 'this is fine...', 'eep...']), 1.9); }
    if (e.d < 0.8) R.uhoh = false;
    if (doomed && !R.doomSaid) { R.doomSaid = 1; say(player.character.root, 'WHOA!!', 1.6); hud.flash('Hold on!', 'bad'); }
    if ((e.d >= 1 || doomed) && R.t - R.lastSqueal > 0.55) {
      R.lastSqueal = R.t; tirePos(v1, sw.th, 0);
      audio.play('swing-squeal', v1.x, v1.y + 1, v1.z, { v: Math.min(1.3, e.d) });
      rumble(0.15 + wob * 0.3, 0.3, 90);
    }
    R.shake = doomed ? 0.09 : wob * 0.05;
    const phi = Math.sin(sw.t * 9.5) * wob * (doomed ? 0.16 : 0.1) * (slow ? 0.6 : 1);

    seatFeet(sw.th, phi, player.pos);
    player.yaw = YAW;
    R.kick *= Math.exp(-dt * 6);
    R.lastLean += (clamp(sw.th / 0.9, -1, 1) - R.lastLean) * Math.min(1, dt * 14);
    player.character.params.lean = clamp(R.lastLean + R.kick * 0.5, -1, 1);
    player.character.params.tension = wob;

    // personal best and champion, in the moment
    const best = sw.best;
    if (best > 1.0 && !R.beatMine && S.me.best > 0 && best > S.me.best + 0.05) { R.beatMine = true; celebrate('New best!', false); }
    if (best > 1.0 && !R.beatChamp && S.champ && S.champ.name !== profile.name && best > S.champ.h + 0.02) { R.beatChamp = true; celebrate('CHAMPION!', true); }

    hud.set({ hNow: SW.L * (1 - Math.cos(sw.th)), hEq: e.h, best, d: e.d, gripV: sw.grip, doomed });
    // (words that stay put: a line that changes every frame pops the folded tracker open over and over, and on a phone
    // that list sits over the top of the screen; the meter shows the height)
    ctx.quests?.set('swing', { title: 'Tire swing', text: S.me && S.me.best > 0 ? `Pump at the bottom of the swoop. Your record: ${S.me.best.toFixed(1)} m.` : 'Pump at the bottom of the swoop.', prio: 5, color: '#ff9f4a', quiet: true });
    const tm = pumpTiming(sw);
    const thm = Math.acos(clamp(1 - e.h / SW.L, -1, 1)); // the swing's amplitude: the beat arc's little tire rides th / thm
    const ready = sw.t - sw.lastPump >= SW.PUMP_GAP;
    hud.cue(ready ? Math.pow(clamp(tm.f, 0, 1), 1.6) : 0, thm > 0.04 ? sw.th / thm : 0, ready && tm.label === 'perfect'); // (lit = a pump now is Perfect)

    // leaves and rustle when it gets serious
    if (e.d > 0.72) {
      R.leafAcc += dt * smooth(0.72, 1.1, e.d) * 11;
      while (R.leafAcc >= 1) { R.leafAcc--; fx.leaves(canopy.x, canopy.y, canopy.z, 1, 2.6); }
      if (R.t - R.rustleAt > 1.6) { R.rustleAt = R.t; audio.play('swing-rustle', canopy.x, canopy.y, canopy.z, { v: e.d }); }
    }

    // a rider who has fallen asleep gives somebody else a turn
    if (!slow && nowS() - R.lastInput > 55 && e.h < 0.2) { ui.toast('Time to share the swing!'); return hopOff(); }

    if (slow) {
      R.slowT = (R.slowT || 0) + dt;
      if (R.slowT >= 0.5) startFlight('launch');
      return;
    }
    if (ev === 'launch') startLaunch();
  }

  function doPump() {
    const sw = R.sw;
    R.lastInput = nowS();
    const res = swPump(sw, sw.t);
    tirePos(v1, sw.th, 0);
    R.kick = 1;
    const map = { perfect: ['Perfect!', 'perfect'], good: ['Nice!', 'good'], meh: ['Meh', 'meh'], bad: ['Oops', 'bad'], flail: ['Too fast!', 'bad'] };
    const [text, cls] = map[res.label];
    if (R.t - R.tierAt > 0.8) hud.flash(text, cls); // (a height's word stays up a moment)
    hud.hit(res.label);
    if (res.label === 'perfect') {
      R.combo++;
      if (R.combo >= 2) fx.confetti(v1.x, v1.y + 0.9, v1.z, 7); // a few sparks for a streak
      audio.play('swing-perfect', v1.x, v1.y + 1, v1.z, { n: R.combo });
      rumble(0.25, 0.5, 110);
    } else if (res.label === 'good') { R.combo = 0; audio.play('swing-pump', v1.x, v1.y, v1.z, { q: 0.8 }); rumble(0.1, 0.25, 70); }
    else { R.combo = 0; audio.play(res.f < 0 ? 'swing-miss' : 'swing-pump', v1.x, v1.y, v1.z, { q: 0.2 }); }
  }

  function applyPush(m) {
    const sw = R.sw;
    R.lastInput = nowS();
    const h0 = energy(sw).h;
    const r = swPush(sw, 1);
    tirePos(v1, sw.th, 0);
    audio.play('swing-pump', v1.x, v1.y, v1.z, { q: 1 });
    rumble(0.3 + 0.2 * r.hk, 0.4, 130);
    // a good one is a "Nice push!" with twinkles, more of them the higher it already was
    if (r.eff >= SW.PUSH_GOOD) { hud.flash(r.hk > 0.5 ? 'Big push!' : 'Nice push!', 'good'); fx.sparkle(v1.x, v1.y + 0.6, v1.z, 6 + Math.round(r.hk * 10), 0.8); say(player.character.root, pick(CHEERS), 1.4); audio.play('swing-giggle', v1.x, v1.y + 0.8, v1.z, { pitch: myPitch() }); }
    else if (r.eff > 0.3) { hud.flash('Push!', 'good'); say(player.character.root, pick(CHEERS), 1.4); }
    else if (r.eff < 0) { hud.flash('Oof!', 'bad'); say(player.character.root, 'Hey!', 1.2); }
    else hud.flash('Push', 'meh');
    // what it added is known once the shove is over: tell the pusher (through the server)
    if (m && m.from != null) R.pushRec.push({ from: m.from, h0, at: sw.t, eff: r.eff });
    R.lastPush = { eff: r.eff, mult: r.mult }; // (tests)
  }

  // a new height this ride: the word pops, twinkles, and the higher ones get a whoop and a cheer
  function reachTier(n) {
    R.tierAt = R.t;
    hud.flash(TIER_WORD[n - 1], n >= 3 ? 'big' : 'tier');
    tirePos(v1, R.sw.th, 0);
    fx.sparkle(v1.x, v1.y + 0.6, v1.z, 6 + n * 5, 0.9);
    audio.play('swing-perfect', v1.x, v1.y + 1, v1.z, { n });
    if (n >= 2) { say(player.character.root, n >= 3 ? 'WHEEEE!' : 'Whoa!', 1.4); audio.play('swing-giggle', v1.x, v1.y + 0.8, v1.z, { pitch: myPitch() }); }
    if (n >= 3) { audio.emoteVoice?.('cheer', v1.x, v1.y + 1.4, v1.z, { pitch: myPitch() }); fx.confetti(v1.x, v1.y + 1.2, v1.z, 18); rumble(0.25, 0.5, 200); }
  }

  function celebrate(text, big) {
    hud.flash(text, 'big');
    tirePos(v1, R.sw.th, 0);
    fx.confetti(v1.x, v1.y + 1.2, v1.z, big ? 46 : 26);
    audio.play(big ? 'swing-fanfare' : 'swing-perfect', v1.x, v1.y + 1, v1.z, { n: 3 });
    rumble(0.3, 0.6, 250);
  }

  // ---------------------------------------------------------------- getting off
  function hopOff() {
    if (!R || R.ending) return;
    if (R.phase === 'hopin') { finishRide('hop', 0); return end('abort'); }
    if (R.phase !== 'ride') return;
    const sw = R.sw;
    if (Math.abs(sw.w) * SW.L < 2.3 && !sw.doomed) hopSlow();
    else startFlight('jump');
  }

  function hopSlow() {
    finishRide('hop');
    R.phase = 'hopout'; R.t = 0; local.riding = false;
    R.from.copy(player.pos);
    const side = (Math.random() - 0.5) * 0.4; // down off the front of the tire, 1.5 m ahead
    R.to = new THREE.Vector3(restXZ.x + FW.x * 1.5 + RT.x * side, 0, restXZ.z + FW.z * 1.5 + RT.z * side);
    R.to.y = groundHeight(R.to.x, R.to.z);
    setPose('jump');
    player.character.params.lean = 0;
  }
  function hopOutTick() {
    const e = clamp(R.t / 0.5, 0, 1);
    player.pos.lerpVectors(R.from, R.to, e);
    player.pos.y += Math.sin(e * Math.PI) * 0.6;
    player.yaw = YAW;
    if (e >= 1) { audio.footstep('grass'); end('release'); }
  }

  // tell the server the ride is over (frees the swing, records the height)
  function finishRide(how, h) {
    if (R.finished) return;
    R.finished = true;
    const height = h ?? R.sw?.best ?? 0;
    if (R.online || online()) net.send({ t: 'swing', op: 'leave', how, h: +height.toFixed(2) });
    else { // offline: keep a private best
      if (height > S.me.best) S.me.best = +height.toFixed(2);
      S.me.rides++; hud.setRecord(S.me.best); refreshSign();
    }
    R.kind = how;
  }

  // ---------------------------------------------------------------- launching and flying
  function startLaunch() {
    if (R.phase !== 'ride') return;
    R.phase = 'slowmo'; R.slowT = 0;
    hud.flash('uh oh...', 'bad');
    tirePos(v1, R.sw.th, 0);
    audio.play('swing-squeal', v1.x, v1.y + 1, v1.z, { v: 1.4 });
    rumble(0.4, 0.5, 300);
  }

  function startFlight(kind) {
    const sw = R.sw;
    const v = leaveVel(sw, kind);
    const p = player.pos;
    const launch = kind === 'launch';
    finishRide(kind);
    const sideV = (Math.random() - 0.5) * (launch ? 3.4 : 1.4); // (a launch wobbles off to one side a little)
    R.f = {
      x: p.x, y: p.y, z: p.z, sx: p.x, sz: p.z, px: p.x, pz: p.z,
      vx: FW.x * v.vf + RT.x * sideV, vy: v.vy, vz: FW.z * v.vf + RT.z * sideV,
      ang: 0, roll: 0, spinV: (v.vf >= 0 ? 1 : -1) * (launch ? 8 + Math.random() * 3 : 5.2), rollV: launch ? (Math.random() - 0.5) * 8 : 0,
      t: 0, bounces: 0, air: true, first: true,
    };
    R.phase = 'fly'; R.t = 0; R.ts = launch ? 0.5 : 1; local.riding = false;
    R.best = sw.best;
    setPose('swingfly', YAW);
    hud.mode('fly');
    RIG.kick = { w: launch ? 2.6 : 0.6, twist: launch ? 15 : 0, until: RIG.t + 2 };
    if (launch) {
      hud.flash('SPROING!', 'big');
      fx.sparkle(p.x, p.y + 1, p.z, 22, 1.1); fx.confetti(p.x, p.y + 1.2, p.z, 14); // (a great launch moment)
      audio.play('swing-sproing', p.x, p.y + 1, p.z);
      fx.birds(canopy.x, canopy.y, canopy.z, 8);
      fx.leaves(canopy.x, canopy.y, canopy.z, 22, 2.7);
      audio.play('swing-wings', canopy.x, canopy.y, canopy.z);
      rumble(1, 0.8, 420);
    } else {
      hud.flash('Jump!', 'good');
      audio.play('swing-pump', p.x, p.y + 1, p.z, { q: 1 });
      rumble(0.35, 0.3, 160);
    }
    R.wee = {};
    audio.play('swing-wee', p.x, p.y + 1.2, p.z, { pitch: myPitch(), dur: launch ? 1.9 : 1.2, h: R.wee });
  }

  function flyTick(dt) {
    const f = R.f;
    R.ts += (1 - R.ts) * Math.min(1, dt * 4);
    f.t += dt;
    f.vy -= SW.FLY_G * dt;
    f.px = f.x; f.pz = f.z;
    if (f.air) {
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      f.ang += f.spinV * dt; f.roll += f.rollV * dt;
      if (!pointInPoly(f.x, f.z, WALK)) return enterBush(f);
      hud.dist(Math.hypot(f.x - f.sx, f.z - f.sz)); // the metres so far, counting up
      if (R.kind === 'launch' && !reduced && f.t > 0.15 && R.t - R.windAt > 0.12) { // wind lines while you sail
        R.windAt = R.t; const sp = Math.hypot(f.vx, f.vy, f.vz) || 1;
        fx.wind(f.x, f.y + 0.4, f.z, f.vx / sp, f.vy / sp, f.vz / sp, 2, sp);
      }
      const gh = groundHeight(f.x, f.z);
      if (f.y <= gh && f.vy < 0) touchdown(gh);
    } else {
      // rolling and bouncing along the ground
      const drag = Math.exp(-(f.bounces > 1 ? 2.6 : 1.4) * dt);
      f.vx *= drag; f.vz *= drag;
      f.x += f.vx * dt; f.z += f.vz * dt; f.y += f.vy * dt;
      f.ang += f.spinV * dt; f.roll += f.rollV * dt;
      const sp = Math.hypot(f.vx, f.vz);
      f.spinV *= Math.exp(-0.9 * dt) * (sp < 1.5 ? 0.97 : 1);
      f.rollV *= Math.exp(-1.6 * dt);
      const gh = groundHeight(f.x, f.z);
      if (f.y <= gh) {
        const impact = -f.vy;
        f.y = gh;
        if (impact > 2.3 && f.bounces < 4 && R.kind === 'launch') bounce(impact, gh, 0.42);
        else if (impact > 3.2 && f.bounces < 2) bounce(impact, gh, 0.22);
        else { f.vy = 0; if (sp < 1.0) return settle(); }
      }
      if (f.t > 9) return settle();
    }
    // trees and the tire stop a tumbling body (but not one that is high above them)
    if (f.t > 0.5 && (!f.air || f.y - groundHeight(f.x, f.z) < 1.1)) { // (not while still leaving the tire's own collider)
      player.pos.set(f.x, f.y, f.z); player.collide(); f.x = player.pos.x; f.z = player.pos.z;
    }
    if (R.wee?.p) audio.movePanner(R.wee.p, f.x, f.y + 1.2, f.z);
    player.pos.set(f.x, f.y, f.z);
    player.yaw = YAW;
    flips.ang = f.ang; flips.roll = f.roll; flips.active = true;
    if (!f.air) {
      // a body lying down rests lower than one standing: keep it on the grass instead of floating
      const lie = Math.max(0.34, 0.85 * Math.abs(Math.cos(f.ang)) + 0.34 * Math.abs(Math.sin(f.ang)));
      player.pos.y = f.y + (lie - 0.85);
    }
    setPose(f.air || f.bounces < 3 ? 'swingfly' : 'sit');
  }

  function bounce(impact, gh, k) {
    const f = R.f;
    f.vy = impact * k; f.vx *= 0.66; f.vz *= 0.66; f.bounces++;
    f.spinV *= 0.78;
    audio.play('swing-boing', f.x, gh + 0.3, f.z, { k: 1 + f.bounces * 0.14 });
    fx.dust(f.x, gh, f.z, 5, 0.9);
    rumble(0.3, 0.2, 90);
  }

  function touchdown(gh) {
    const f = R.f;
    f.air = false; f.y = gh;
    R.dist = Math.hypot(f.x - f.sx, f.z - f.sz);
    const launch = R.kind === 'launch';
    const impact = -f.vy;
    f.vy = launch ? impact * 0.45 : impact * 0.16;
    f.vx *= launch ? 0.7 : 0.45; f.vz *= launch ? 0.7 : 0.45;
    if (!launch) { f.spinV *= 0.4; f.rollV = 0; }
    f.bounces = 1;
    // a landing in the sand pit throws up a big puff of sand and its grains; on the grass a little dust
    const sand = inSand(f.x, f.z);
    if (sand) { fx.dust(f.x, gh, f.z, launch ? 20 : 12, 1.6, SAND_COL); fx.spray(f.x, gh, f.z, launch ? 22 : 12); }
    else fx.dust(f.x, gh, f.z, launch ? 12 : 7, 1.3);
    audio.play(launch ? 'swing-oof' : 'swing-boing', f.x, gh + 0.5, f.z, { v: launch ? 1 : 0.5, pitch: myPitch(), k: 1 });
    audio.play('swing-boing', f.x, gh + 0.3, f.z, { k: 1.1 });
    rumble(0.9, 0.7, 260);
    reportLanding(false);
    // the score pop: how far, stars by the pit's pegs, a new longest flight
    hud.dist(R.dist);
    const record = R.dist > 3 && R.dist > (S.me.flight || 0) + 0.5;
    const stars = STAR_M.filter(m => R.dist >= m).length;
    hud.score(R.dist, stars, record);
    R.landed = { d: R.dist, stars, record, sand };
    if (record) { fx.confetti(f.x, gh + 1, f.z, 20); audio.play('swing-perfect', f.x, gh + 1.5, f.z, { n: 2 }); }
  }

  function reportLanding(bush) {
    if (R.landSent) return;
    R.landSent = true;
    if (R.online || online()) net.send({ t: 'swing', op: 'land', d: +R.dist.toFixed(1), x: +R.f.x.toFixed(2), z: +R.f.z.toFixed(2), bush: !!bush });
    else if (R.dist > S.me.flight) { S.me.flight = +R.dist.toFixed(1); refreshSign(); }
  }

  // over the woods or the water: land in a bush at the edge, legs waving
  function enterBush(f) {
    const c = closestOnPoly(f.x, f.z, WALK);
    let bx = c[0], bz = c[1];
    v1.set(f.px - bx, 0, f.pz - bz);
    if (v1.lengthSq() > 1e-6) { v1.normalize(); bx += v1.x * 0.9; bz += v1.z * 0.9; }
    R.dist = Math.hypot(bx - f.sx, bz - f.sz);
    R.phase = 'bush'; R.t = 0;
    R.b = { x: bx, z: bz, fx: f.x, fy: f.y, fz: f.z, fa: f.ang, hit: false, popped: false };
    R.f.x = bx; R.f.z = bz;
    reportLanding(true);
    R.b.h = fx.bush(bx, bz);
    ui.toast(`You flew ${R.dist.toFixed(0)} m and found a bush!`, 4200);
  }
  function bushTick(dt) {
    const b = R.b, f = R.f;
    const gh = groundHeight(b.x, b.z);
    const T = 0.4, u = clamp(R.t / T, 0, 1);
    const upside = nearestTurn(b.fa - Math.PI) + Math.PI; // head-first, the nearest way round
    R.ts = 1;
    if (R.t < T) {
      player.pos.set(b.fx + (b.x - b.fx) * u, b.fy + (gh + 1.75 - b.fy) * u * u + Math.sin(u * Math.PI) * 0.6, b.fz + (b.z - b.fz) * u);
      f.ang = b.fa + (upside - b.fa) * Math.min(1, u * 1.4);
      setPose('swingfly');
    } else if (R.t < 1.9) {
      if (!b.hit) {
        b.hit = true;
        fx.dust(b.x, gh + 0.4, b.z, 8, 1.1, '#7fbf5a'); fx.leaves(b.x, gh + 1.2, b.z, 14, 0.9);
        audio.play('swing-rustle', b.x, gh + 1, b.z, { v: 1 }); audio.play('swing-oof', b.x, gh + 0.6, b.z, { v: 0.7, pitch: myPitch() });
        rumble(0.6, 0.6, 220);
      }
      const w = R.t - T;
      f.ang = upside + Math.sin(w * 15) * 0.16 * Math.exp(-w * 0.8);
      player.pos.set(b.x, gh + 1.75 + Math.sin(w * 15) * 0.03, b.z);
      setPose('swingfly');
    } else {
      if (!b.popped) {
        b.popped = true; b.h.kill();
        audio.play('swing-boing', b.x, gh + 1, b.z, { k: 1.3 });
        fx.dust(b.x, gh + 0.3, b.z, 6, 1); fx.leaves(b.x, gh + 1.2, b.z, 10, 0.8);
      }
      const w = clamp((R.t - 1.9) / 0.45, 0, 1);
      f.ang = upside + (nearestTurn(upside) - upside) * Math.min(1, w * 1.6);
      // pop out of the bush and land on your bottom, dizzy
      v2.set(b.x, gh + 1.75, b.z);
      const bl = Math.hypot(restXZ.x - b.x, restXZ.z - b.z) || 1; // out of the bush, a step back toward the swing
      v3.set(b.x + (restXZ.x - b.x) / bl * 1.1, 0, b.z + (restXZ.z - b.z) / bl * 1.1);
      v3.y = groundHeight(v3.x, v3.z);
      player.pos.lerpVectors(v2, v3, w); player.pos.y += Math.sin(w * Math.PI) * 0.9;
      if (w >= 1) { f.x = player.pos.x; f.y = player.pos.y; f.z = player.pos.z; f.ang = nearestTurn(f.ang); f.roll = 0; return dazed(); }
      setPose('jump');
    }
    player.yaw = YAW;
    flips.ang = f.ang; flips.roll = 0; flips.active = true;
  }

  function settle() {
    if (R.kind === 'launch') return dazed();
    R.phase = 'stand'; R.t = 0;
    setPose(R.dist >= 9 ? 'cheer' : 'idle');
    if (R.dist >= 12) say(player.character.root, pick(['Whoo!', 'Yeah!', 'Nailed it!']), 1.8);
  }
  function dazed() {
    R.phase = 'dazed'; R.t = 0; R.ts = 1;
    setPose('sit');
    const p = player.pos;
    fx.stars(o => o.set(player.pos.x, player.pos.y + 1.45, player.pos.z), 1.5);
    audio.play('swing-stars', p.x, p.y + 1.5, p.z);
    R.f.vx = R.f.vz = 0;
  }
  function afterTick(dt) {
    const f = R.f;
    // sit up: roll back to upright
    f.ang += (nearestTurn(f.ang) - f.ang) * Math.min(1, dt * 9);
    f.roll += (nearestTurn(f.roll) - f.roll) * Math.min(1, dt * 9);
    flips.ang = f.ang; flips.roll = f.roll; flips.active = Math.abs(f.ang - nearestTurn(f.ang)) + Math.abs(f.roll) > 0.02;
    player.pos.y += (groundHeight(player.pos.x, player.pos.z) - player.pos.y) * Math.min(1, dt * 12);
    player.yaw = YAW;
    if (R.phase === 'dazed' ? R.t > 1.7 : R.t > 0.95) end('release');
  }

  // ---------------------------------------------------------------- handing control back
  // The takeover must not clear itself from inside its own update (Player.update reads it again afterwards),
  // so ending is requested here and carried out just before the frame is drawn.
  function end(kind) { if (R && !R.ending) R.ending = kind; }
  function finishEnding() {
    if (!R || !R.ending) return;
    const kind = R.ending;
    if (kind === 'abort') {
      if (!R.finished && ['hopin', 'ride', 'slowmo'].includes(R.phase)) finishRide('hop');
      if (['hopin', 'ride', 'slowmo', 'hopout'].includes(R.phase)) { const ox = restXZ.x + FW.x * 1.6, oz = restXZ.z + FW.z * 1.6; player.pos.set(ox, groundHeight(ox, oz), oz); }
    }
    player.pos.y = groundHeight(player.pos.x, player.pos.z);
    player.collide();
    const c = player.cam;
    v1.set(camera.position.x - player.pos.x, camera.position.y - (player.pos.y + 1.6), camera.position.z - player.pos.z);
    const len = v1.length() || 1;
    local.riding = false; flips.active = false; flips.ang = flips.roll = 0;
    fx.stopStars();
    player.character.root.rotation.set(0, YAW, 0);
    const pr = player.character.params; pr.lean = 0; pr.tension = 0; pr.spin = 0;
    player.takeover = null;
    player.grounded = true; player.vy = 0; player.vel.set(0, 0); player.speed = 0; player.emote = null;
    hud.hide();
    ctx.quests?.clear('swing');
    if (R.wee?.p) { try { R.wee.p.disconnect(); } catch { /* gone */ } }
    if (R.held) player.setHeld(R.held);
    R = null; S.pending = 0; offlineSince = 0;
    if (kind === 'abort') { player.snapCameraBehind(); return; }
    // hand the camera over exactly where it is: no jump
    c.yaw = Math.atan2(v1.x, v1.z); c.pitch = clamp(Math.asin(clamp(v1.y / len, -1, 1)), -0.15, 1.25);
    c.dist = c.targetDist = clamp(len, 3, 16); c.pos.copy(camera.position); c.look.copy(cam.look); c.manualAt = nowS();
  }

  // ---------------------------------------------------------------- camera
  // Seated, the camera is locked to a framing of the swing: a view from the rider's right a little behind, so the swing sweeps
  // across the screen with the trunk off to one side and the slope and the sand pit ahead of it (where a launch goes). A little
  // above seat height, rising as the swing gets high (CAM_LIFT), placed so the whole arc (the rider at both ends of it, head to
  // feet) sits in the band of screen between the top of the HUD and the meter (hud.band(), measured from the page). It follows
  // the swing's plane, not the rider: the arc only grows as the swing gets higher (smoothed, so it never breathes with each
  // swing). A drag or the stick nudges it a little (CAM_YAW, CAM_PITCH) and it drifts back after CAM_IDLE seconds, so you can't
  // lose the swing by dragging. Jumping or flying off hands over to the chase camera below.
  const CAM_YAW = 1.2, CAM_PITCH = 0.14, CAM_NUDGE = 0.35, CAM_IDLE = 2, CAM_LIFT = 0.12; // (CAM_YAW in the swing's own frame)
  const qCam = new THREE.Quaternion(), eCam = new THREE.Euler(0, 0, 0, 'YXZ');
  cam.fPos = new THREE.Vector3(); cam.fLook = new THREE.Vector3(); cam.hFr = 1.2; cam.band = null; cam.bandAt = -9;
  cam.yaw0 = CAM_YAW; cam.pitch0 = CAM_PITCH; // (the framing's resting angles; tools may try others)
  // The framing is fitted exactly: the rider's box (feet to 1.85 m up, 0.45 m round, what minigame-hud-test measures) at five
  // points of the arc this framing allows for is projected for the camera's angles, and the camera backs off along the ray
  // through the band's centre until every corner is inside the band (a binary search, ~16 steps of 40 corners). The framed
  // height leads the swing by about one pump (+0.3 m), so a pump never carries the rider out of the frame before the camera follows.
  const FIT_N = 5, fitQ = Array.from({ length: FIT_N * 8 }, () => new THREE.Vector3()), fitD = new THREE.Vector3(), qInv = new THREE.Quaternion(), fitP = new THREE.Vector3();
  const fitS = { tanH: 1, tanV: 1, xl: -1, xr: 1, yt: 1, yb: -1 };
  function fitsAt(d) { // every corner inside the band with the camera d metres back along the band's ray
    const S = fitS;
    for (let i = 0; i < fitQ.length; i++) {
      const q = fitQ[i], cx = q.x + d * fitD.x, cy = q.y + d * fitD.y, z = -(q.z + d * fitD.z);
      if (z < 0.5) return false;
      const nx = cx / (z * S.tanH), ny = cy / (z * S.tanV);
      if (nx < S.xl || nx > S.xr || ny < S.yb || ny > S.yt) return false;
    }
    return true;
  }
  function frameArc(dt, now) {
    const sw = R.sw;
    const hEq = sw ? energy(sw).h : 0;
    // the height the framing allows for: up quickly as you pump (a pump ahead), down slowly as the swing dies away
    // (never under 1.2 m: at rest the framing already leaves room for the first swings, so it does not pull back at once)
    const hWant = Math.max(1.2, hEq + 0.3);
    cam.hFr += (hWant - cam.hFr) * Math.min(1, dt * (hWant > cam.hFr ? 1.2 : 0.3));
    if (!cam.band || now - cam.bandAt > 0.5) { cam.band = hud.band(); cam.bandAt = now; }
    const B = cam.band;
    const r = RIG.ropeRadius, pv = RIG.pivot;
    const th = Math.acos(clamp(1 - Math.min(cam.hFr, SW.L * 1.15) / SW.L, -0.26, 1)); // furthest rope angle this framing shows
    const yLow = pv.y - r - 0.15, yHigh = pv.y - r * Math.cos(th) + 1.85;
    // (yaw: in the swing's own frame, as if it faced north. The camera lifts a little as the swing gets high)
    const yaw = cam.yaw0 + cam.yawOff, pitch = cam.pitch0 + cam.pitchOff + CAM_LIFT * smooth(1.0, 2.4, cam.hFr);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tanH = tanV * camera.aspect;
    // NDC of the band (a little margin inside it)
    const M = 0.03, xl = 2 * B.l - 1 + M, xr = 2 * B.r - 1 - M, yt = 1 - 2 * B.t - M, yb = 1 - 2 * B.b + M;
    const xc = B.l + B.r - 1, yc = 1 - (B.t + B.b);
    eCam.set(-pitch, yaw + RIG.baseYaw, 0); qCam.setFromEuler(eCam); qInv.copy(qCam).invert();
    fitD.set(xc * tanH, yc * tanV, -1).normalize();                            // the ray through the band's centre, camera space
    v2.set(pv.x, (yLow + yHigh) / 2, pv.z);                                    // the middle of the arc
    // the rider's box corners at five points of the arc, relative to the middle, in camera space
    for (let i = 0; i < FIT_N; i++) {
      seatFeet(th * (i / (FIT_N - 1) * 2 - 1), 0, fitP);
      for (let k = 0; k < 8; k++) {
        fitQ[i * 8 + k].set(fitP.x + (k & 1 ? 0.45 : -0.45) - v2.x, fitP.y + (k & 2 ? 1.85 : 0) - v2.y, fitP.z + (k & 4 ? 0.45 : -0.45) - v2.z).applyQuaternion(qInv);
      }
    }
    fitS.tanH = tanH; fitS.tanV = tanV; fitS.xl = xl; fitS.xr = xr; fitS.yt = yt; fitS.yb = yb;
    const fits = fitsAt;
    let lo = 4, hi = 30;
    if (fits(lo)) hi = lo; else if (!fits(hi)) lo = hi; else for (let s = 0; s < 16; s++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    const dist = clamp(hi * cam.distMul, 6.5, 30);
    v1.copy(fitD).applyQuaternion(qCam);                                       // that ray in the world
    cam.fPos.copy(v2).addScaledVector(v1, -dist);
    cam.fLook.set(0, 0, -10).applyQuaternion(qCam).add(cam.fPos);
  }
  function camUpdate(dt, cam2, inp, now) {
    if (!R) return false;
    const look = inp.takeLook?.() || { x: 0, y: 0, zoom: 0 };
    const seated = !(R.phase === 'fly' || R.phase === 'bush' || R.phase === 'dazed' || R.phase === 'stand');
    const nudge = seated ? CAM_NUDGE : 1.5;
    if (look.x || look.y) { cam.yawOff = clamp(cam.yawOff - look.x * 0.0055, -nudge, nudge); cam.pitchOff = clamp(cam.pitchOff + look.y * 0.004, seated ? -0.08 : -0.25, seated ? 0.3 : 0.9); cam.idleAt = now; }
    if (look.zoom) cam.distMul = clamp(cam.distMul + look.zoom * 0.08, seated ? 0.85 : 0.6, seated ? 1.3 : 1.5);
    if (now - cam.idleAt > (seated ? CAM_IDLE : 3.5)) { const e = Math.exp(-dt * (seated ? 1.4 : 0.8)); cam.yawOff *= e; cam.pitchOff *= e; }
    const p = player.pos;
    const chase = R.phase === 'fly' || R.phase === 'bush' || R.phase === 'dazed' || R.phase === 'stand';
    let want, k, lk;
    if (!chase) {
      frameArc(dt, now);
      want = v3.copy(cam.fPos);
      const slow = R.phase === 'slowmo';
      k = 1 - Math.exp(-dt * (slow ? 5 : 3.2)); lk = 1 - Math.exp(-dt * (slow ? 7 : 4.5));
    } else {
      const f = R.f;
      const hv = Math.hypot(f?.vx || 0, f?.vz || 0);
      const dx = hv > 0.5 ? f.vx / hv : (R.chaseX ?? FW.x), dz = hv > 0.5 ? f.vz / hv : (R.chaseZ ?? FW.z);
      R.chaseX = dx; R.chaseZ = dz;
      const landed = R.phase !== 'fly' || (f && !f.air);
      cam.tgt.set(p.x, p.y + 1.1, p.z);
      // a lazy chase from behind and to the side
      // (in the air more from the side, the rider's right, away from the trunk, so it's not in the apple crown)
      const back = landed ? 5.2 : 5.6, side = landed ? 2.4 : 5.4, up = landed ? 2.5 : 3.1;
      want = v3.set(p.x - dx * back - dz * side, p.y + up, p.z - dz * back + dx * side);
      k = 1 - Math.exp(-dt * 2.3); lk = 1 - Math.exp(-dt * 4);
    }
    const gh = groundHeight(want.x, want.z) + 0.6;
    if (want.y < gh) want.y = gh;
    cam.pos.lerp(want, k);
    v1.copy(chase ? cam.tgt : cam.fLook);
    if (chase) { v1.x += (R.chaseX || 0) * 2.2; v1.z += (R.chaseZ || 0) * 2.2; }
    cam.look.lerp(v1, lk);
    cam2.position.copy(cam.pos);
    const shake = Math.max(R.shake || 0, R.phase === 'fly' && R.f?.air ? 0.03 : 0);
    if (!reduced && shake > 0.001) {
      cam2.position.x += (Math.random() - 0.5) * shake; cam2.position.y += (Math.random() - 0.5) * shake; cam2.position.z += (Math.random() - 0.5) * shake;
    }
    cam2.lookAt(cam.look);
    return true;
  }

  // ---------------------------------------------------------------- targets, keys, pushing
  function target(px, pz) {
    ui.el.hint.classList.remove('swing-go');
    if (R) {
      if (R.phase === 'ride') {
        const fast = Math.abs(R.sw.w) * SW.L >= 2.3 || R.sw.doomed;
        return { hint: fast ? 'E  Jump off!' : 'E  Hop off', prio: 10, run: hopOff };
      }
      return { hint: '', prio: 10, run() {} };
    }
    if (lunge) return { hint: '', prio: 10, run() {} };
    if (ctx.mode !== 'play' || player.takeover || !player.controls || S.pending) return null;
    const dRest = Math.hypot(px - restXZ.x, pz - restXZ.z);
    const rider = S.rider && S.rider !== net.sid ? remotes.map.get(S.rider) : null;
    if (rider) {
      const rp = rider.ch.root.position;
      const dRider = Math.hypot(px - rp.x, pz - rp.z);
      if (RIG.vis.driven && (dRest < 4.7 || dRider < 3.6)) {
        const go = pushQuality() > 0.75; // the hint lights up when the moment is right
        ui.el.hint.classList.toggle('swing-go', go);
        return { hint: `E  Push ${rider.name}${go ? '  - now!' : ''}`, prio: 6, run: () => doPush(rider) };
      }
      if (dRest < 2.7) return { hint: `${rider.name} is on the swing`, prio: 2, run() {} };
      return null;
    }
    if (S.rider && S.rider !== net.sid) return dRest < 2.7 ? { hint: 'The swing is busy', prio: 2, run() {} } : null;
    if (dRest < 2.7 && !RIG.vis.driven) return { hint: 'E  Hop on the tire swing', prio: 6, run: requestBoard };
    return null;
  }

  // How well would a shove land if it left now? Their tire is seen about a quarter of a second late (interpolation and
  // network), so look that far ahead with the same pendulum.
  function pushQuality() {
    const V = RIG.vis;
    probe.th = V.th; probe.w = V.w; probe.pushT = 0; probe.grip = 1; probe.doomed = false;
    swStep(probe, 0.24);
    return pushEff(probe);
  }

  // a friend on the swing: walk in, shove, step back
  function doPush(rider) {
    const now = nowS();
    if (R || player.takeover || now - lastPushAt < SW.PUSH_GAP) return;
    lastPushAt = now;
    net.send({ t: 'swing', op: 'push' });
    // how did that land? the same maths the rider's client uses, from what we can see of them
    const eff = pushQuality();
    const from = player.pos.clone();
    const rp = rider.ch.root.position;
    const dx = from.x - rp.x, dz = from.z - rp.z, dl = Math.hypot(dx, dz) || 1;
    const to = new THREE.Vector3(rp.x + (dx / dl) * 1.25, 0, rp.z + (dz / dl) * 1.25);
    const yawTo = Math.atan2(rp.x - to.x, rp.z - to.z);
    lunge = { t: 0 };
    player.takeover = {
      anim: 'push',
      update: (dt, now2, inp, pl) => {
        lunge.t += dt;
        const inK = clamp(lunge.t / 0.22, 0, 1), outK = clamp((lunge.t - 0.5) / 0.3, 0, 1);
        pl.pos.lerpVectors(from, to, inK * (1 - outK));
        pl.pos.y = groundHeight(pl.pos.x, pl.pos.z);
        pl.yaw = angleLerp(pl.yaw, yawTo, Math.min(1, dt * 14));
      },
      camera: () => false,
    };
    audio.play('swing-pump', to.x, groundHeight(to.x, to.z) + 1, to.z, { q: 1 });
    // the pusher's own feedback: the card bursts, a streak of good pushes counts up, a bigger buzz for a good one
    const good = eff > SW.PUSH_GOOD;
    pusher.combo = good ? (now - pusher.lastAt < 4.5 ? pusher.combo + 1 : 1) : 0;
    pusher.lastAt = now;
    hud.push.hit(good ? 'good' : eff > 0 ? 'ok' : 'bad');
    const label = good ? (pusher.combo >= 2 ? `Nice push x${pusher.combo}!` : 'Nice push!') : eff > 0.35 ? 'Push!' : eff > 0 ? 'Weak push' : 'Oops, bad timing!';
    say(player.character.root, label, 1.4);
    if (good) { fx.sparkle(rp.x, rp.y + 1, rp.z, 6, 0.6); audio.play('swing-perfect', to.x, groundHeight(to.x, to.z) + 1.2, to.z, { n: Math.min(3, pusher.combo) }); }
    rumble(good ? 0.3 : 0.15, good ? 0.5 : 0.3, good ? 140 : 90);
  }

  // the pusher's card over the E: shown while I stand where a push reaches somebody riding, their tire on its arc
  function updatePushCard() {
    const rider = !R && S.rider && S.rider !== net.sid ? remotes.map.get(S.rider) : null;
    const V = RIG.vis;
    let ready = false;
    if (rider && V.driven && !V.local && ctx.mode === 'play' && (!player.takeover || lunge)) {
      const rp = rider.ch.root.position, p = player.pos;
      ready = Math.hypot(p.x - restXZ.x, p.z - restXZ.z) < 4.7 || Math.hypot(p.x - rp.x, p.z - rp.z) < 3.6;
    }
    hud.push.show(ready);
    if (!ready) return;
    const thm = Math.acos(clamp(1 - V.h / SW.L, -1, 1));
    hud.push.cue(thm > 0.04 ? V.th / thm : 0, pushQuality());
  }

  function pumpPress() {
    if (!R || R.phase !== 'ride') return;
    R.pumpQ = Math.min(2, R.pumpQ + 1);
  }

  // ---------------------------------------------------------------- render-time work (runs once per frame, after everything moved)
  function beforeRender() {
    if (flipKey === RIG.t) return;
    flipKey = RIG.t;
    if (R && ctx.mode !== 'play') end('abort');
    if (R?.ending) finishEnding();
    if (lunge && lunge.t > 0.84) { lunge = null; if (player.takeover && !R) { player.takeover = null; player.grounded = true; player.vy = 0; } }
    rigSync(ctx, local);
    // tumbling bodies: the whole character rotates about its middle
    if (flips.active && R) tumble(player.character.root, flips.ang, flips.roll, YAW);
    const t = nowS();
    for (const [sid, e] of remoteFx) {
      const r = remotes.map.get(sid);
      if (!r) { remoteFx.delete(sid); continue; }
      const root = r.ch.root;
      const yaw = r.buf[r.buf.length - 1].r;
      let ang, done = false;
      if (!e.landAt) {
        ang = e.spinV * (t - e.t0);
        if (t - e.t0 > 6) done = true;
      } else {
        const u = t - e.landAt, a0 = e.angAtLand || 0;
        if (e.bush) {
          const up = nearestTurn(a0 - Math.PI) + Math.PI;
          ang = u < 0.4 ? a0 + (up - a0) * (u / 0.4) : u < 1.9 ? up + Math.sin((u - 0.4) * 15) * 0.16 * Math.exp(-(u - 0.4) * 0.8) : up + (nearestTurn(up) - up) * clamp((u - 1.9) * 5, 0, 1);
          done = u > 2.4;
        } else {
          const roll = e.kind === 'launch' ? ((1 - Math.exp(-2.4 * u)) / 2.4) * e.spinV * 0.7 : ((1 - Math.exp(-4 * u)) / 4) * e.spinV * 0.4;
          const raw = a0 + roll;
          ang = u < 1.1 ? raw : raw + (nearestTurn(raw) - raw) * clamp((u - 1.1) * 4, 0, 1);
          done = u > 1.6;
        }
      }
      if (done) { root.rotation.set(0, yaw, 0); remoteFx.delete(sid); continue; }
      tumble(root, ang, 0, yaw);
    }
  }
  function tumble(root, ang, roll, yaw) {
    qa.setFromAxisAngle(UPV, yaw);
    qb.setFromAxisAngle(XV, ang); qa.multiply(qb);
    if (roll) { qb.setFromAxisAngle(ZV, roll); qa.multiply(qb); }
    root.quaternion.copy(qa);
    v1.set(0, 0.85, 0);
    v2.copy(v1).applyQuaternion(qa);
    root.position.x += v1.x - v2.x; root.position.y += v1.y - v2.y; root.position.z += v1.z - v2.z;
    root.updateMatrixWorld(true); // three refreshes matrices before Scene.onBeforeRender, so do it ourselves
  }
  const prevHook = scene.onBeforeRender;
  scene.onBeforeRender = function (...a) { prevHook?.apply(this, a); beforeRender(); };

  return {
    name: 'swing',
    help: [
      [['Space'], 'swing: pump as you swoop through the bottom'],
      [['E'], 'hop on the tire swing, push a friend, hop off (fast? that is a jump)'],
    ],
    target,
    onKey(code) {
      if (!R) return false;
      if (code === 'Space') { pumpPress(); return true; }
      if (code === 'Escape' || code === 'KeyB') { hopOff(); return true; }
      if (code.startsWith('Digit')) return true;
      return false;
    },
    update(dt, now) {
      fx.update(dt, now);
      hud.tick(dt);
      updatePushCard();
      sign.flagWave(now);
      if (S.pending && nowS() - S.pendingAt > 1.6) { S.pending = 0; ui.toast('The swing did not answer. Try again.'); }
      // a click pumps
      if (R && R.phase === 'ride') { const cl = input.takeClicks?.(); if (cl) for (const c of cl) if (c.button === 0) pumpPress(); }
      // what everyone can see of somebody else's ride: sounds, falling leaves, the lean of their body
      const V = RIG.vis;
      if (V.driven && !V.local) {
        const th = V.th;
        if (obs.wasDriven) {
          if (obs.w * V.w < 0 && V.d > 0.15 && now - obs.apexAt > 0.5) { obs.apexAt = now; tirePos(v1, th, V.phi); audio.play('swing-creak', v1.x, v1.y, v1.z, { v: V.d }); }
          if (obs.th * th < 0 && V.d > 0.4 && now - obs.botAt > 0.5) {
            obs.botAt = now; tirePos(v1, 0, 0); audio.play('swing-whoosh', v1.x, v1.y, v1.z, { v: Math.min(1.3, V.d * 1.1) });
            if (V.d > 0.68 && !reduced) { const dir = Math.sign(V.w) || 1; fx.wind(v1.x, v1.y + 0.3, v1.z, FW.x * dir, 0, FW.z * dir, 4); }
          }
          // everyone sees the twinkles a high swing throws off at each end
          if (obs.w * V.w < 0 && V.h > 1.1 && now - obs.sparkAt > 0.4) { obs.sparkAt = now; tirePos(v1, th, V.phi); fx.sparkle(v1.x, v1.y + 0.6, v1.z, Math.round(3 + smooth(1.1, 2.3, V.h) * 9)); }
          if (V.d >= 1 && now - obs.squealAt > 0.6) { obs.squealAt = now; tirePos(v1, th, V.phi); audio.play('swing-squeal', v1.x, v1.y + 1, v1.z, { v: Math.min(1.3, V.d) }); }
          if (V.d > 0.72) {
            obs.leafAcc += dt * smooth(0.72, 1.1, V.d) * 11;
            while (obs.leafAcc >= 1) { obs.leafAcc--; fx.leaves(canopy.x, canopy.y, canopy.z, 1, 2.6); }
            if (now - obs.rustleAt > 1.6) { obs.rustleAt = now; audio.play('swing-rustle', canopy.x, canopy.y, canopy.z, { v: V.d }); }
          }
        }
        obs.th = th; obs.w = V.w; obs.wasDriven = true;
        for (const r of remotes.map.values()) if (r.ch.root === V.root) { r.ch.params.lean = clamp(th / 0.9, -1, 1); r.ch.params.tension = smooth(SW.WARN, 1.25, V.d); }
      } else obs.wasDriven = false;
    },
    // for the test scripts and the console
    api: {
      get ride() { return R; }, state: S, hud, fx, sign, remoteFx, flips, cam, pusher, pushQuality,
      board: requestBoard, hopOff, pump: pumpPress,
      // put the rider at a given energy (apex height in metres) without pumping
      setEnergy(h, dir = 1) { if (!R?.sw) return; R.sw.th = 0; R.sw.w = dir * Math.sqrt(2 * SW.G * h) / SW.L; R.sw.grip = 1; R.sw.doomed = false; },
    },
  };
}
