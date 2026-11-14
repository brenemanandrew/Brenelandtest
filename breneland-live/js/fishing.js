// Fishing: Kevin and his stick rod, the cast-and-reel minigame (Animal Crossing calm), hover cards and the dog treats.
// The server half is lib/fishing.js.
//   states:  off > windup > cast > wait > nibble > bite > hook > reel > fling > catch > ready ...   (retract on a miss)
import * as THREE from 'three';
import { loadCss, clamp, lerp, angleLerp, mulberry32 } from './util.js';
import { coastSigned, groundHeight, WATER_Y } from './terrain.js';
import { DOCK } from './layout.js';
import { soft } from './toon.js';
import { ANIM_CODES } from './codes.js';
import { SPECIES, JUNK_IDS, nameOf, sizeScale, fmtTime, ZONES } from './fish-data.js';
import { build3D, buildTreat3D } from './fish-art.js';
import { registerFishingSounds } from './fish-audio.js';
import { WaterFx, LineRig, FishSchool, isWater } from './fish-water.js';
import { inRowboat, ROW } from './rowboats.js';
import { createFishUI } from './fish-ui.js';
import { GUS_VOICE, FIRST_MEETING, revisit } from './fish-gus.js';
import { DEFAULT_GEAR, cleanPole, cleanBait, poleOf, baitOf } from './fish-gear.js';
import { setRodLook } from './fish-art.js';
import { regionAt, nearestRegion, POOLS } from './fish-regions.js';

const TAU = Math.PI * 2;
const FISHY = new Set(['fish', 'cast', 'reel', 'hook', 'catch']);
const LINE_STATES = new Set(['wait', 'nibble', 'bite', 'hook', 'reel', 'fling']);
const WET = new Set(['wait', 'nibble', 'bite', 'hook', 'reel']);
const JUNK_CHANCE = 0.12;
const MIN_CAST = 4, WIND_SECS = 1.3;   // the farthest cast is the pole's (fish-gear.js POLES: 14 m, the bamboo 17 m)
const GEAR_KEY = 'breneland.fishgear';
const IDLE_PAUSE = 30, IDLE_GIVEUP = 80;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _tip = new THREE.Vector3();
const _bob = new THREE.Vector3(), _v = new THREE.Vector3(), _dir = new THREE.Vector3();

export function createFishing(ctx) {
  const { scene, camera, player, audio, net, input, npcs, remotes, inventory } = ctx;
  const game = ctx.ui;
  loadCss('/css/fishing.css');
  registerFishingSounds(audio);
  const rnd = mulberry32(20260929);
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const hud = createFishUI(ctx);

  // ---------------------------------------------------------------- state
  const S = { rod: false, fish: 0, junk: 0, secs: 0, first: 0, best: null, treats: 0, thrown: 0, caught: {}, big: {} };
  const sess = { lastJunk: null, lastRare: null, visits: 0 };

  const fx = new WaterFx(scene);
  const rig = new LineRig(scene);
  const school = new FishSchool(scene, { seed: 11, getSlot: () => Math.floor(net.serverNow() / 180000) });
  const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7dff9a', transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  aimRing.renderOrder = 8; aimRing.visible = false; aimRing.frustumCulled = false; soft(aimRing); scene.add(aimRing);
  LineRig.cam = camera;
  // the same ring again, x-ray style: seen only where you (or the dock) are in front of it
  const aimGhost = new THREE.Mesh(aimRing.geometry, new THREE.MeshBasicMaterial({ color: '#7dff9a', transparent: true, opacity: 0.55, depthWrite: false, depthFunc: THREE.GreaterDepth }));
  aimGhost.renderOrder = 9; aimGhost.visible = false; aimGhost.frustumCulled = false; soft(aimGhost); scene.add(aimGhost);
  const syncAimGhost = () => {
    aimGhost.visible = aimRing.visible;
    if (!aimRing.visible) return;
    aimGhost.position.copy(aimRing.position); aimGhost.position.y += 0.02; aimGhost.scale.copy(aimRing.scale);
    aimGhost.material.color.copy(aimRing.material.color);
  };

  let st = 'off', stT = 0, takeover = null, cancelFlag = false;
  let power = 0, castD = 0;
  let fly = null, castLaunched = false;
  let waitT = 0, sinceAct = 0, nib = null, biteT = 0, biteWin = 0, tugT = -1, target = null, roll = null, bobOut = false;
  let reelP = 0, pullT = 0, pulling = false, clickT = 0, reelD0 = 3, flingMesh = null, fling = null;
  const retractFrom = new THREE.Vector3();
  let forcedFish = null;
  let secsAcc = 0, lastNow = 0, meterItem = null;
  let mouseHeld = false, touchHeld = false, wasHold = false;
  let talk = null, gusT = 0;
  let hoverT = 0, hoverGone = 0;
  const treats = [];            // treats lying around (yours and everyone's)
  const remoteRigs = new Map(); // sid -> { rig, x, z, on }

  const holding = () => input.down.has('Space') || input.down.has('ToolUse') || mouseHeld || touchHeld; // ToolUse: the pad's tool button (Y)
  const helpOpen = () => !document.getElementById('help').hidden || !document.getElementById('letter').hidden;
  const shackOpen = () => !!ctx.features?.find?.(f => f.name === 'shack')?.cardOpen;
  // Kevin while he is out and drawn (asleep in his loft he is hidden: no "Talk to Kevin" through a floor, or at the spot a hidden
  // body was last left, which on a client loaded at night was the origin, in our living room)
  const kevin = () => { const d = npcs.npcs.find(q => q.name === 'Kevin'); return d && d.body.root.visible && !d._s?.hidden ? d : null; };
  // the way the camera looks is the way you cast and throw (read from the real camera, so it works with any follow-camera)
  const camAim = () => { camera.getWorldDirection(_dir); return Math.atan2(_dir.x, _dir.z); };
  // casts go a hair right of where the camera looks, or the bobber and line would hide behind your own head
  const castAim = () => camAim() - 0.17;
  const camElev = () => { camera.getWorldDirection(_dir); return _dir.y; };   // > 0 looking up
  const say = (text, secs = 1.8) => game.say(player.character.root, text, secs, 2.3, 'player');
  const rodTip = out => {
    const ch = player.character;
    if (ch.rodTip && ch.rodTip.parent) return ch.rodTip.getWorldPosition(out);
    ch.handR.getWorldPosition(out); out.y += 0.5; return out;
  };
  const handPos = out => { player.character.handR.getWorldPosition(out); return out; };
  const flashHotbar = ms => inventory.flash?.(ms); // the cross pad lights up when something new lands on it

  // ---------------------------------------------------------------- gear: the pole and the bait (fish-gear.js)
  // Chosen at Mabel's Fish Shack (ctx.fishGear.set). Kept on the server under record.fishing.gear and mirrored on this
  // device so it's there before the server answers. The pole sets cast, reel speed, bite window and junk. The bait sets who comes.
  const gear = { ...DEFAULT_GEAR };
  try { const v = JSON.parse(localStorage.getItem(GEAR_KEY)); if (v) { gear.pole = cleanPole(v.pole); gear.bait = cleanBait(v.bait); } } catch { /* first visit, or a private window */ }
  const gearFns = [];
  let serverGear = false;   // the server has told us what it remembers
  const maxCast = () => poleOf(gear.pole).cast;
  function applyGear(fromServer) {
    const P = poleOf(gear.pole);
    player.setGear?.(gear.pole, gear.bait);
    rig.setPole(gear.pole); rig.setLure(gear.bait);
    const it = inventory.ITEMS?.rod;
    if (it) { it.name = P.name; it.blurb = `${P.blurb} ${P.perk} Hold Space at the water to cast.`; }
    setRodLook(gear.pole, gear.bait);
    inventory.repaint?.();
    try { localStorage.setItem(GEAR_KEY, JSON.stringify(gear)); } catch { /* private window */ }
    for (const fn of gearFns) { try { fn(gear, fromServer); } catch (e) { console.error(e); } }
  }
  ctx.fishGear = {
    get pole() { return gear.pole; },
    get bait() { return gear.bait; },
    set({ pole = gear.pole, bait = gear.bait } = {}) {
      const p = cleanPole(pole), b = cleanBait(bait);
      if (p === gear.pole && b === gear.bait) return;
      gear.pole = p; gear.bait = b;
      if (net.status === 'online') net.send({ t: 'gear', pole: p, bait: b });
      applyGear(false);
    },
    onChange(fn) { gearFns.push(fn); return () => { const i = gearFns.indexOf(fn); if (i >= 0) gearFns.splice(i, 1); }; },
  };

  // ---------------------------------------------------------------- counter and server state
  const toTreat = () => 10 - (S.fish % 10);
  function refreshCounter() {
    hud.counter.set(S.fish, toTreat(), inventory.count('treat'), S.rod || S.fish > 0);
    const q = ctx.quests;
    if (!q) return;
    if (!S.rod) q.set('rod', { title: 'Meet Kevin', text: 'His pier on Lake Tamakiya after 5 (weekends after 2), with a stick rod to spare. Days, his Tool Crib on Summit Rd.', prio: 2, color: '#8fd0ee' });
    else { q.clear('rod'); q.set('treat', { title: 'Next dog treat', text: `${toTreat()} more fish to go. Every 10th fish is a treat for Dax and Nala.`, progress: (S.fish % 10) / 10, prio: 0, color: '#ffe08a' }); }
  }
  function applyInv(m) {
    S.rod = !!m.rod; S.fish = m.fish | 0; S.junk = m.junk | 0; S.treats = m.treats | 0;
    S.secs = (m.secs || 0) + secsAcc; S.first = m.first || 0; S.best = m.best || null; S.caught = m.caught || {}; S.big = m.big || {};
    inventory.setAll({ rod: S.rod ? 1 : 0, treat: S.treats }, m.arms);
    // the server's gear wins; a record from before gear existed (null) takes this device's choice instead
    if (m.gear && typeof m.gear === 'object') {
      const p = cleanPole(m.gear.pole), b = cleanBait(m.gear.bait);
      serverGear = true;
      if (p !== gear.pole || b !== gear.bait) { gear.pole = p; gear.bait = b; applyGear(true); }
    } else if (!serverGear && S.rod && (gear.pole !== 'stick' || gear.bait !== 'none')) { serverGear = true; net.send({ t: 'gear', pole: gear.pole, bait: gear.bait }); }
    refreshCounter();
  }
  net.on('inv', applyInv);
  inventory.onChange(id => { if (id === 'treat') S.treats = inventory.count('treat'); refreshCounter(); });
  refreshCounter();
  inventory.onEquip((id, prev) => {
    if (prev === 'rod' && st !== 'off') endFishing('put away');
    if (id === 'rod') hintOnce(coarse && input.lastDevice !== 'pad' ? 'Hold the button at the water to cast' : `Hold ${input.glyph('Space')} at the water to cast`);
  });
  inventory.canEquip = () => st !== 'fling' && st !== 'catch';
  inventory.busy = () => !!talk;
  inventory.addSection(() => {
    if (!S.rod && !S.fish) return null;
    const box = document.createElement('div'); box.className = 'fp-stats';
    const row = (k, v) => { const r = document.createElement('div'); r.className = 'fp-row'; const a = document.createElement('span'); a.textContent = k; const b = document.createElement('b'); b.textContent = v; r.append(a, b); box.append(r); };
    row('Fish caught', String(S.fish));
    row('Time fishing', fmtTime(S.secs));
    if (S.best) row('Best fish', `${nameOf(S.best.k)}, ${S.best.cm} cm`);
    if (S.junk) row('Junk hauled up', String(S.junk));
    return box;
  });
  let hinted = false;
  function hintOnce(text) { if (hinted) return; hinted = true; game.toast(text, 3500); }

  // ---------------------------------------------------------------- Kevin
  function startTalk() {
    const g = kevin();
    if (!g || talk || ctx.mode !== 'play') return;
    if (st !== 'off') endFishing('talk');
    sess.visits++;
    const steps = S.rod
      ? revisit({ fish: S.fish, treats: inventory.count('treat'), secs: S.secs, lastJunk: sess.lastJunk, lastRare: sess.lastRare }, n => Math.floor(rnd() * n))
      : FIRST_MEETING;
    talk = { steps, i: -1, typed: 0, len: 0, text: '', g, shown: -1 };
    player.controls = false;
    player.yaw = Math.atan2(g.body.root.position.x - player.pos.x, g.body.root.position.z - player.pos.z);
    hud.dialog.open('Kevin');
    hud.dialog.onClick = advanceTalk;
    advanceTalk();
    audio.play('fish-blip');
  }
  function advanceTalk() {
    if (!talk) return;
    if (talk.i >= 0 && talk.typed < talk.len) { talk.typed = talk.len; return; } // the first press finishes the line
    talk.i++;
    if (talk.i >= talk.steps.length) return endTalk();
    const step = talk.steps[talk.i];
    talk.text = step.text; talk.len = step.text.length; talk.typed = 0; talk.shown = -1;
    hud.dialog.hint(talk.i === talk.steps.length - 1 ? (coarse ? 'Tap to close' : 'E to close') : (coarse ? 'Tap to go on' : 'E or Space to go on'));
    const p = talk.g.body.root.position;
    audio.speak(p.x, p.y + 1.6, p.z, step.text, GUS_VOICE);
    if (step.act === 'rod') giveRod();
  }
  let noCastUntil = 0;   // a Space tap that closes the chat must not also start a cast
  function endTalk() {
    talk = null; noCastUntil = lastNow + 0.45;
    hud.dialog.close(); hud.dialog.onClick = null;
    player.controls = !helpOpen() && !inventory.panelOpen;
  }
  function giveRod() {
    if (!S.rod) {
      S.rod = true;
      inventory.add('rod');
      net.send({ t: 'rod' });
      refreshCounter();
    }
    audio.play('fish-item');
    game.toast('Kevin gave you a Stick Rod!', 3600);
    player.playEmote('cheer', lastNow || performance.now() / 1000);
    flashHotbar(2400);
    setTimeout(() => { if (inventory.has('rod') && !inventory.equipped) inventory.equip('rod'); }, 900);
  }

  // ---------------------------------------------------------------- fishing: stance and casting
  // Only the yellow water of Andrew's map fishes (fish-regions.js; lib/fishing.js refuses a catch from anywhere else).
  const fishable = (x, z) => isWater(x, z) && !!regionAt(x, z);
  // where a bobber that missed the water comes down: the ground, or the floor boards of a moored rowboat (rowboats.js)
  const landY = (x, z) => (inRowboat(x, z, 0) ? ROW.FLOOR_Y : groundHeight(x, z));
  // 'fish': fishable water in front of you; 'water': water, but no fish in it; null: no water
  function aheadOf(yaw) {
    let seen = null;
    for (let d = 5; d <= 13; d += 2) {
      const x = player.pos.x + Math.sin(yaw) * d, z = player.pos.z + Math.cos(yaw) * d;
      if (isWater(x, z)) { if (regionAt(x, z)) return 'fish'; seen = 'water'; }
    }
    return seen;
  }
  const waterAhead = yaw => aheadOf(yaw) === 'fish';
  // a takeover that says fishOK (riding in Kevin's boat: kevin-crew.js) lets you fish from it; the stance rides on top
  const rideOK = () => !!(player.takeover && player.takeover.fishOK);
  const canStart = () => inventory.equipped === 'rod' && ctx.mode === 'play' && !talk && lastNow >= noCastUntil && !inventory.panelOpen && !helpOpen() && player.controls && (player.grounded || rideOK()) && (!player.takeover || rideOK());
  // from the boat bites come half as often (and every catch is worth 3 fish: lib/fishing.js); the boat counts as on board
  // only while the server agrees you are aboard (ctx.crew.aboard)
  const onBoat = () => !!(ctx.crew && ctx.crew.aboard);
  const biteScale = () => (onBoat() ? 0.5 : 1);
  let base = null;   // the takeover under the stance (the boat seat), put back when fishing ends

  function beginStance() {
    if (takeover) return;
    base = rideOK() ? player.takeover : null;
    takeover = {
      anim: 'fish', x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw,
      update(dt, now, inp, pl) {
        // never null player.takeover from in here (Player.update reads it again afterwards): flag it instead
        if (!ctx.playing) queueMicrotask(() => { if (takeover === this) endFishing('mode'); });
        if (base) { const yw = this.yaw; base.update?.(dt, now, inp, pl); this.x = pl.pos.x; this.y = pl.pos.y; this.z = pl.pos.z; pl.yaw = yw; return; } // riding: the seat moves you
        pl.pos.set(this.x, this.y, this.z);
        pl.yaw = this.yaw;
      },
    };
    player.takeover = takeover;
    player.emote = null;
    player.setHeld('rod');
    st = 'ready'; stT = 0; cancelFlag = false; sinceAct = 0;
  }

  function endFishing(reason) {
    if (st === 'off' && !takeover) return;
    if (LINE_STATES.has(st) || st === 'retract') school.clearBobber();
    if (bobOut) { net.send({ t: 'bob', x: null }); bobOut = false; }
    if (flingMesh) { scene.remove(flingMesh); flingMesh = null; }
    rig.show(false); aimRing.visible = false;
    hud.bang.hide(); hud.cue.hide();
    if (meterItem) { meterItem.remove(); meterItem = null; }
    if (takeover && player.takeover === takeover) player.takeover = base && base.alive !== false ? base : null;   // back onto the boat seat
    takeover = null; base = null;
    ctx.quests?.clear('fishing');
    player.character.params.tension = 0;
    player.setHeld(inventory.equipped);
    st = 'off'; fly = null; nib = null; target = null; forcedFish = null; roll = null;
    flushSecs();
  }

  function startWind() {
    st = 'windup'; stT = 0; power = 0; takeover.anim = 'fish'; sinceAct = 0;
    if (!meterItem) meterItem = game.add({ node: hud.meter.node, obj: player.character.root, dy: 2.95, max: 30, fade: 24 });
    hud.meter.set(0, MIN_CAST, true);
    audio.play('fish-blip');
  }

  function doCast() {
    castD = MIN_CAST + (maxCast() - MIN_CAST) * power;
    const yaw = castAim();
    target = { x: player.pos.x + Math.sin(yaw) * castD + (rnd() - 0.5) * 0.5, z: player.pos.z + Math.cos(yaw) * castD + (rnd() - 0.5) * 0.5 };
    takeover.yaw = yaw;
    st = 'cast'; stT = 0; takeover.anim = 'cast'; castLaunched = false; aimRing.visible = false;
    if (meterItem) { meterItem.remove(); meterItem = null; }
    rig.show(true);
    sinceAct = 0;
  }

  function launchBobber() {
    rodTip(_tip);
    const ty = isWater(target.x, target.z) ? WATER_Y + 0.02 : landY(target.x, target.z) + 0.06;
    const dist = Math.hypot(target.x - _tip.x, target.z - _tip.z);
    fly = { t: 0, dur: 0.55 + dist * 0.035, from: _tip.clone(), to: new THREE.Vector3(target.x, ty, target.z), h: 1.2 + dist * 0.16 };
    audio.play('fish-whoosh', _tip.x, _tip.y, _tip.z, { power: (castD - MIN_CAST) / (maxCast() - MIN_CAST) });
    castLaunched = true;
  }

  function landBobber(now) {
    fly = null;
    const x = target.x, z = target.z;
    if (!isWater(x, z)) {
      const gy = landY(x, z);
      audio.play('fish-thud', x, gy, z, { k: 0.5 });
      fx.splash(x, z, 6, 0.6, gy + 0.05, '#c9b98a', gy, 0.04);
      say('Aim for the water!', 1.8);
      return retract('land');
    }
    if (!regionAt(x, z)) {   // water, but not the yellow kind: a plop, then reel it back in
      fx.rings3(x, z); fx.splash(x, z, 9, 0.8);
      audio.play('fish-plink', x, WATER_Y, z);
      say('No fish in this water!', 2);
      return retract('land');
    }
    fx.rings3(x, z); fx.splash(x, z, 9, 0.8);
    audio.play('fish-plink', x, WATER_Y, z);
    school.landBobber(x, z, now);
    net.send({ t: 'bob', x, z, b: gear.bait }); bobOut = true;
    st = 'wait'; stT = 0; waitT = 0; takeover.anim = 'fish';
  }

  // ---------------------------------------------------------------- bites
  school.onArrive = f => {
    if (st !== 'wait') { school.spook(f, lastNow); return; }
    const sp = f.sp;
    const n = sp.nibbles[0] + Math.floor(rnd() * (sp.nibbles[1] - sp.nibbles[0] + 1));
    const ev = []; let t = 0.55 + rnd() * 0.5;
    for (let i = 0; i < n; i++) { ev.push({ t, k: 'tug' }); t += 0.75 + rnd() * 0.6; }
    ev.push({ t: t - 0.15 + rnd() * 0.3, k: 'bite' });
    nib = { f, ev, i: 0, clock: 0 };
    st = 'nibble'; stT = 0;
  };

  function tickNibble(dt) {
    nib.clock += dt;
    const e = nib.ev[nib.i];
    if (!e || nib.clock < e.t) return;
    nib.i++;
    if (e.k === 'tug') {
      tugT = 0;
      audio.play('fish-tick', _bob.x, _bob.y, _bob.z);
      fx.ring(_bob.x, _bob.z, 0.55, 0.8);
    } else {
      st = 'bite'; stT = 0; biteT = 0; biteWin = nib.f.sp.window * poleOf(gear.pole).window;   // the Lucky Rod waits longer
      hud.bang.show(); say('!', 1.0);
      audio.play('fish-bloop', _bob.x, _bob.y, _bob.z);
      fx.rings3(_bob.x, _bob.z, 1.1); fx.splash(_bob.x, _bob.z, 12, 1);
      input.rumble?.(0.3, 0.6, 180);
    }
  }

  function press() { // the action button went down
    sinceAct = 0;
    switch (st) {
      case 'ready': if (waterAhead(castAim())) startWind(); break;
      case 'wait': retract('reel'); break;
      case 'nibble': miss('early'); break;
      case 'bite': hookIt(); break;
      case 'reel': reelP = Math.min(1, reelP + 0.045); break;
    }
  }

  function miss(kind) {
    if (nib && nib.f) school.spook(nib.f, lastNow);
    audio.play('fish-snap', _bob.x, _bob.y, _bob.z);
    say(kind === 'early' ? 'Too soon!' : 'It got away...', 1.8);
    retract(kind);
  }

  function retract(reason) {
    school.clearBobber();
    if (bobOut) { net.send({ t: 'bob', x: null }); bobOut = false; }
    hud.bang.hide();
    retractFrom.copy(_bob);
    st = 'retract'; stT = 0; takeover.anim = 'reel'; nib = null;
    if (reason !== 'land') audio.play('fish-away');
  }

  function hookIt() {
    const f = nib.f;
    hud.bang.hide();
    const forced = forcedFish;
    const junk = forced ? forced.junk : rnd() < JUNK_CHANCE * poleOf(gear.pole).junk;
    if (junk) {
      roll = { id: (forced && forced.id && !SPECIES[forced.id]) ? forced.id : JUNK_IDS[Math.floor(rnd() * JUNK_IDS.length)], cm: 0, junk: true };
      school.spook(f, lastNow);
    } else {
      roll = { id: forced && forced.id ? forced.id : f.id, cm: forced && forced.cm ? forced.cm : f.cm, junk: false, f };
      school.hook(f);
    }
    forcedFish = null;
    st = 'hook'; stT = 0; takeover.anim = 'hook';
    fx.rings3(_bob.x, _bob.z, 1.2); fx.splash(_bob.x, _bob.z, 14, 1.2);
    audio.play('fish-splash', _bob.x, WATER_Y, _bob.z, { size: 1 });
    input.rumble?.(0.4, 0.8, 200);
    reelD0 = clamp(Math.hypot(_bob.x - player.pos.x, _bob.z - player.pos.z), 2.5, 16);
    target = { x: _bob.x, z: _bob.z };
  }

  function tickReel(dt, now) {
    const h = holding();
    const junk = roll.junk;
    const k = roll.f ? roll.f.k : 1;
    const heavy = junk ? 0.75 : 1 / (0.85 + 0.4 * k);
    pullT -= dt;
    if (pullT < 0) { pulling = !pulling && !junk; pullT = pulling ? 0.45 : 0.9 + rnd() * 0.8; }
    let rate = h ? 0.7 * poleOf(gear.pole).reel : 0;   // the Blue Spinner's reel winds a third faster
    if (pulling) rate *= 0.4;
    reelP = clamp(reelP + rate * heavy * dt - (h ? 0 : 0.07 * dt), 0, 1);
    player.character.params.tension = pulling ? 0.95 : h ? 0.55 : 0.2;
    clickT -= dt;
    if (h && clickT <= 0) { clickT = pulling ? 0.09 : 0.13; audio.play('fish-reel', _bob.x, 0.2, _bob.z, { tension: pulling ? 1 : 0 }); }
    // the bobber is dragged to you with a wobble; the fish thrashes under it
    const dx = target.x - player.pos.x, dz = target.z - player.pos.z, dl = Math.hypot(dx, dz) || 1;
    const d = lerp(reelD0, 1.9, reelP);
    const wob = (pulling ? 0.35 : 0.12) * Math.sin(stT * 9);
    _bob.set(player.pos.x + dx / dl * d - dz / dl * wob, WATER_Y + 0.02, player.pos.z + dz / dl * d + dx / dl * wob);
    if (rnd() < dt * (pulling ? 9 : 3)) fx.ring(_bob.x + (rnd() - 0.5) * 0.4, _bob.z + (rnd() - 0.5) * 0.4, 0.5, 0.7);
    if (reelP >= 1) startFling(now);
  }

  function startFling(now) {
    st = 'fling'; stT = 0; takeover.anim = 'hook';
    flingMesh = build3D(roll.id, roll.cm);
    scene.add(flingMesh);
    fling = { from: _bob.clone() };
    fx.rings3(_bob.x, _bob.z, 1.3); fx.splash(_bob.x, _bob.z, 18, 1.5);
    audio.play('fish-splash', _bob.x, WATER_Y, _bob.z, { size: 1.4 });
    if (roll.f) school.take(roll.f, now);
    school.clearBobber();
    if (bobOut) { net.send({ t: 'bob', x: null }); bobOut = false; }
    rig.show(false);
    player.character.params.tension = 0;
  }

  function tickFling() {
    const k = Math.min(1, stT / 0.8);
    handPos(_c);
    _a.lerpVectors(fling.from, _c, k);
    _a.y += Math.sin(k * Math.PI) * 2.4;
    flingMesh.position.copy(_a);
    flingMesh.rotation.set(k * 6, player.yaw + Math.PI + k * 3, k * TAU * 1.5 * (1 - k));
    flingMesh.scale.setScalar(0.7 + 0.3 * Math.min(1, k * 2));
    if (k >= 1) landFish();
  }

  function landFish() {
    scene.remove(flingMesh); flingMesh = null;
    const r = roll;
    const rec = recordCatch(r);
    st = 'catch'; stT = 0; takeover.anim = 'catch';
    if (r.junk) player.setHeld(null);
    else {
      const L = SPECIES[r.id].len * sizeScale(r.id, r.cm);
      player.setHeld('fish', { color: SPECIES[r.id].color, size: clamp(L / 0.42, 0.55, 2.2) });
    }
    const big = rec.record || r.id === 'golden' || rec.treat;
    audio.play(r.junk ? 'fish-junk' : 'fish-catch', player.pos.x, player.pos.y + 1, player.pos.z, { big });
    if (r.id === 'golden') audio.play('fish-golden', player.pos.x, player.pos.y + 1, player.pos.z);
    hud.card.show({ id: r.id, cm: r.cm, junk: r.junk, record: rec.record, first: rec.first && !r.junk, treat: rec.treat, region: rec.region, extra: r.junk ? junkQuip(r.id) : rec.pay > 1 ? '+' + rec.pay + ' fish: caught from Kevin\'s boat!' : rec.first ? 'A new kind for the pocket book.' : '' }, 4.2);
    if (rec.pay > 1) game.toast('+' + rec.pay + ' fish! Every catch from the boat is worth ' + rec.pay + '.', 2600);
    say(r.junk ? 'Ugh, junk.' : r.id === 'golden' ? 'WHAT?!' : rec.record ? 'A big one!' : ['Got one!', 'Nice!', 'Yes!', 'Gotcha!'][Math.floor(rnd() * 4)], 2.4);
    if (big && !r.junk) fx.splash(player.pos.x, player.pos.z, 20, 1.4, player.pos.y + 2.3, r.id === 'golden' ? '#ffd23f' : '#ffffff', player.pos.y, 0.07);
    if (rec.treat) awardTreatFx();
  }
  const junkQuip = id => (id === 'boot' ? 'It smells like a lake.' : id === 'duck' ? 'Squeak!' : 'Somebody\'s lunch, once.');

  function recordCatch(r) {
    const out = { record: false, first: false, treat: false };
    // where the fish was hooked: the server decides its region (and so which fish may come out) from this
    const at = target || { x: player.pos.x, z: player.pos.z }, wx = Math.round(at.x * 100) / 100, wz = Math.round(at.z * 100) / 100;
    out.region = regionAt(at.x, at.z) || nearestRegion(at.x, at.z).region;
    if (r.junk) { S.junk++; sess.lastJunk = r.id; net.send({ t: 'catch', k: r.id, cm: 0, x: wx, z: wz }); return out; }
    out.first = !S.caught[r.id];
    const pay = onBoat() ? 3 : 1;   // a catch from Kevin's boat is worth 3 fish (lib/fishing.js pays it; this is the local echo)
    out.pay = pay;
    for (let i = 1; i < pay; i++) { S.fish++; if (S.fish % 10 === 0) { out.treat = true; inventory.add('treat'); } }
    S.fish++;
    S.caught[r.id] = (S.caught[r.id] || 0) + 1;
    if (!S.first) S.first = Date.now();
    const prev = S.big[r.id] || 0;
    if (r.cm > prev) { out.record = prev > 0; S.big[r.id] = r.cm; }
    if (!S.best || r.cm > S.best.cm) S.best = { k: r.id, cm: r.cm };
    if (r.id === 'golden' || r.id === 'puffer' || r.id === 'bass' || r.id === 'sturgeon' || r.id === 'catfish' || r.id === 'pike') sess.lastRare = r.id;
    net.send({ t: 'catch', k: r.id, cm: r.cm, x: wx, z: wz });
    if (S.fish % 10 === 0) { out.treat = true; inventory.add('treat'); }
    refreshCounter(); hud.counter.pop();
    return out;
  }
  // how to hold a treat on this device: pad, touch or keyboard
  function treatHow() {
    const arm = inventory.arms ? inventory.arms.indexOf('treat') : -1, dev = input.lastDevice;
    if (dev === 'pad') return arm === 0 || arm === 1 ? `Press ${input.pad.btnName(arm ? 'SlotY' : 'SlotX')} to hold it` : 'Put it on a slot to hold it';
    if (dev === 'touch' || coarse) return 'Tap the basket, then the treat, to hold it';
    return arm >= 0 ? `Press ${'ZXCV'[arm]} to hold it` : 'Press Tab to hold it';
  }
  function awardTreatFx() {
    audio.play('fish-item');
    game.toast(`A dog treat! ${treatHow()}, then throw it for a dog.`, 4600);
    flashHotbar(2600);
  }

  // ---------------------------------------------------------------- the frame-by-frame state machine
  function tickFishing(dt, now) {
    // things that end fishing no matter what
    if (player.takeover !== takeover) return endFishing('lost');
    if (cancelFlag || !player.controls || ctx.mode !== 'play') return endFishing('interrupted');
    if (Math.hypot(player.pos.x - takeover.x, player.pos.z - takeover.z) > 0.6) return endFishing('moved');
    const mv = input.move();
    if (Math.hypot(mv.x, mv.y) > 0.3 && st !== 'fling') return endFishing('walked away');

    stT += dt;
    const hold = holding();
    if (hold && !wasHold) press();
    if (hold) sinceAct = 0;
    wasHold = hold;
    if (LINE_STATES.has(st)) {
      sinceAct += dt;
      if (sinceAct < IDLE_PAUSE) { secsAcc += dt; S.secs += dt; }
    }

    // facing: toward the water where you look, or the bobber once it is out
    let yaw = takeover.yaw;
    if (st === 'ready' || st === 'windup') yaw = castAim();
    else if (target && (st === 'wait' || st === 'nibble' || st === 'bite' || st === 'hook' || st === 'reel')) yaw = Math.atan2(target.x - player.pos.x, target.z - player.pos.z);
    takeover.yaw = angleLerp(takeover.yaw, yaw, Math.min(1, dt * 8));

    switch (st) {
      case 'windup': {
        power = Math.min(1, power + dt / WIND_SECS);
        const d = MIN_CAST + (maxCast() - MIN_CAST) * power, yw = castAim();
        const ax = player.pos.x + Math.sin(yw) * d, az = player.pos.z + Math.cos(yw) * d;
        const ok = fishable(ax, az), wet = ok || isWater(ax, az);
        aimRing.position.set(ax, wet ? WATER_Y + 0.06 : landY(ax, az) + 0.06, az);
        aimRing.material.color.set(ok ? '#7dff9a' : '#ff8a70');
        aimRing.scale.setScalar(0.55 + 0.1 * Math.sin(now * 8));
        aimRing.visible = true;
        hud.meter.set(power, d, ok);
        if (!hold) doCast();
        break;
      }
      case 'cast': {
        if (!castLaunched && stT >= 0.45) launchBobber();
        if (fly) {
          fly.t += dt;
          const k = Math.min(1, fly.t / fly.dur);
          _bob.lerpVectors(fly.from, fly.to, k);
          _bob.y += Math.sin(k * Math.PI) * fly.h;
          if (k >= 1) landBobber(now);
        } else if (!castLaunched) {
          rodTip(_tip); _bob.set(_tip.x, _tip.y - 0.7 + Math.sin(now * 5) * 0.03, _tip.z);
        }
        break;
      }
      case 'wait': {
        waitT += dt;
        _bob.set(target.x, WATER_Y + 0.02 + Math.sin(now * 2.2) * 0.012, target.z);
        if (sinceAct > IDLE_GIVEUP) { game.toast('Your line drifted for a while, so you reeled it in.', 2600); retract('idle'); }
        break;
      }
      case 'nibble': {
        tickNibble(dt);
        if (st !== 'nibble') break;
        let dip = 0, jit = 0;
        if (tugT >= 0) { tugT += dt; const u = tugT / 0.32; if (u >= 1) tugT = -1; else { dip = Math.sin(u * Math.PI) * 0.075; jit = Math.sin(u * 40) * 0.015; } }
        _bob.set(target.x + jit, WATER_Y + 0.02 - dip + Math.sin(now * 2.2) * 0.008, target.z);
        break;
      }
      case 'bite': {
        biteT += dt;
        const k = Math.min(1, biteT / 0.12);
        _bob.set(target.x + Math.sin(biteT * 60) * 0.012, WATER_Y + 0.02 - 0.17 * k, target.z);
        if (biteT > biteWin) miss('late');
        break;
      }
      case 'hook': {
        _bob.set(target.x + Math.sin(stT * 40) * 0.05, WATER_Y + 0.02 + Math.max(0, 0.12 - stT * 0.4), target.z);
        if (stT >= 0.5) { st = 'reel'; stT = 0; reelP = 0; pullT = 0.6; pulling = false; takeover.anim = 'reel'; }
        break;
      }
      case 'reel': tickReel(dt, now); break;
      case 'fling': tickFling(); break;
      case 'catch': {
        if (stT >= 2.5) { player.setHeld('rod'); st = 'ready'; stT = 0; hud.card.hide(); takeover.anim = 'fish'; }
        break;
      }
      case 'retract': {
        const k = Math.min(1, stT / 0.5);
        rodTip(_tip);
        _bob.lerpVectors(retractFrom, _tip, k * k);
        _bob.y += Math.sin(k * Math.PI) * 0.8;
        if (k >= 1) { rig.show(false); st = 'ready'; stT = 0; takeover.anim = 'fish'; }
        break;
      }
    }
    // the line
    if (rig.visible) {
      rodTip(_tip);
      const sag = st === 'reel' ? (pulling ? 0.03 : 0.12) : st === 'cast' ? (fly ? 0.15 : 0.05) : st === 'retract' ? 0.2 : 0.28;
      rig.update(_tip, _bob, sag, WET.has(st));   // on the water it floats; flying out and reeled back it hangs
    }
    if (secsAcc >= 10) flushSecs();
  }

  function flushSecs() {
    if (secsAcc >= 1) { net.send({ t: 'fs', s: Math.round(secsAcc * 10) / 10 }); secsAcc = 0; }
  }

  // ---------------------------------------------------------------- treats
  function treatLanding() {
    const yaw = camAim();
    let d = lerp(5, 9, clamp((camElev() + 0.35) / 0.9, 0, 1));   // look up to throw farther
    let x = player.pos.x, z = player.pos.z;
    for (; d > 1.5; d -= 0.5) {
      x = player.pos.x + Math.sin(yaw) * d; z = player.pos.z + Math.cos(yaw) * d;
      const onDock = x > DOCK.minX && x < DOCK.maxX && z > DOCK.minZ && z < DOCK.maxZ;
      if (onDock || coastSigned(x, z) < -0.7) break;
    }
    return { x, z, yaw, d };
  }

  let throwing = null, throwCd = 0;
  function throwTreat() {
    if (throwing || throwCd > 0 || !inventory.has('treat') || inventory.equipped !== 'treat' || talk || inventory.panelOpen || ctx.mode !== 'play' || player.grounded === false || player.takeover) return false;
    const l = treatLanding();
    // the throw holds you still for half a second (a takeover, like fishing), so the pose plays properly
    const tk = { anim: 'throw', x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: l.yaw, update(dt, now, inp, pl) { pl.pos.set(this.x, this.y, this.z); pl.yaw = this.yaw; } };
    player.takeover = tk; player.emote = null;
    throwing = { t: 0, x: l.x, z: l.z, tk, released: false };
    throwCd = 0.9;
    return true;
  }
  function releaseTreat(t) {
    t.released = true;
    inventory.remove('treat');
    handPos(_a);
    if (_a.y < 0.3) _a.set(player.pos.x, player.pos.y + 1.3, player.pos.z);
    spawnTreat(_a, t.x, t.z, true);
    audio.play('fish-toss', _a.x, _a.y, _a.z);
    const tx = Math.round(t.x * 100) / 100, tz = Math.round(t.z * 100) / 100;
    net.send({ t: 'treat', x: tx, z: tz, k: npcs.dogSync?.simK != null ? npcs.dogSync.simK + 1 : undefined });   // (k: the dogs' tick, dogs-sync.js)
    // playing offline there is no server to relay it back: do what the relay would have done, so the dogs still come running
    if (net.status !== 'online') onTreatMsg({ x: tx, z: tz, from: ctx.profile.name, sid: net.sid });
    if (!inventory.has('treat')) game.toast('That was your last treat. Ten more fish!', 2600);
  }
  function spawnTreat(from, x, z, mine) {
    const mesh = buildTreat3D();
    mesh.scale.setScalar(1.4);
    mesh.position.copy(from);
    scene.add(mesh);
    const dist = Math.hypot(x - from.x, z - from.z);
    const tr = { mesh, mine, x, z, gy: groundHeight(x, z), state: 'fly', t: 0, dur: 0.5 + dist * 0.035, from: from.clone(), life: 12, eatAt: 0, eaten: false, confirmed: false, spin: (rnd() - 0.5) * 12, bounce: 0, bv: 2.2, by: 0 };
    treats.push(tr);
    return tr;
  }
  function eatTreat(tr) {
    if (tr.eaten) return;
    tr.eaten = true; tr.state = 'gone';
    scene.remove(tr.mesh);
    fx.splash(tr.x, tr.z, 8, 0.6, tr.gy + 0.15, '#e8b46a', tr.gy, 0.035);
    audio.play('fish-chomp', tr.x, tr.gy + 0.2, tr.z);
  }
  function tickTreats(dt, now) {
    if (throwCd > 0) throwCd -= dt;
    if (throwing) {
      throwing.t += dt;
      if (!throwing.released && throwing.t >= 0.28) releaseTreat(throwing);
      if (throwing.t >= 0.62 || player.takeover !== throwing.tk) { if (player.takeover === throwing.tk) player.takeover = null; throwing = null; }
    }
    for (let i = treats.length - 1; i >= 0; i--) {
      const tr = treats[i], m = tr.mesh;
      tr.t += dt;
      // (handed off: gone once down, or once the dogs' clock says theirs shows: a slow frame clamps dt, so the flight can lag that clock)
      if (tr.handoff && (tr.state === 'lie' || (tr.swapAt && now >= tr.swapAt))) { scene.remove(m); tr.state = 'gone'; treats.splice(i, 1); continue; }
      if (tr.state === 'fly') {
        const k = Math.min(1, tr.t / tr.dur);
        _a.set(tr.x, tr.gy + 0.08, tr.z);
        m.position.lerpVectors(tr.from, _a, k);
        m.position.y += Math.sin(k * Math.PI) * 2.0;
        m.rotation.y += tr.spin * dt; m.rotation.z += 9 * dt;
        if (k >= 1) { tr.state = 'lie'; tr.t = 0; tr.bounce = 1; tr.bv = 2.4; tr.by = 0; m.rotation.z = 0; audio.play('fish-thud', tr.x, tr.gy, tr.z, { k: 0.8 }); }
      } else if (tr.state === 'lie') {
        // two little bounces, then it just sits there looking delicious
        if (tr.bounce > 0.05) {
          tr.bv -= 11 * dt; tr.by += tr.bv * dt;
          if (tr.by <= 0) { tr.by = 0; tr.bounce *= 0.42; tr.bv = 2.4 * tr.bounce; if (tr.bounce > 0.1) audio.play('fish-thud', tr.x, tr.gy, tr.z, { k: 0.35 }); }
          m.rotation.y += dt * 5;
        } else tr.by = 0;
        m.position.set(tr.x, tr.gy + 0.07 + tr.by, tr.z);
        tr.life -= dt;
        if (tr.eatAt && now >= tr.eatAt) eatTreat(tr);
        else if (tr.life < 1.2) m.scale.setScalar(Math.max(0.01, 1.4 * tr.life / 1.2));
        if (tr.life <= 0) { scene.remove(m); tr.state = 'gone'; }
      }
      if (tr.state === 'gone') treats.splice(i, 1);
    }
  }
  const sane = v => typeof v === 'number' && Math.abs(v) < 2000;   // false for NaN, Infinity and anything off the map
  const onTreatMsg = m => {
    if (!sane(m.x) || !sane(m.z)) return;
    const now = performance.now() / 1000;
    let tr = null;
    if (m.sid === net.sid) tr = treats.find(t => t.mine && !t.confirmed && Math.hypot(t.x - m.x, t.z - m.z) < 0.1) || null;
    else {
      const r = remotes.map.get(m.sid);
      _a.set(m.x - 1, 1.4, m.z);
      if (r) { _a.copy(r.ch.root.position); _a.y += 1.4; }
      tr = spawnTreat(_a, m.x, m.z, false);
      audio.play('fish-toss', _a.x, _a.y, _a.z);
    }
    let fetched = false;
    const inAir = tr && tr.state === 'fly' ? Math.max(0, tr.dur - tr.t) : 0;
    // (m: the relay's tick and number, so every screen's dogs agree: dogs-sync.js)
    try { fetched = !!npcs.dropTreat?.(m.x, m.z, now, m.from, inAir, m); } catch (e) { console.error('[fishing] dropTreat', e); }
    if (tr) {
      tr.confirmed = true;
      if (fetched) {
        tr.handoff = true; // the dogs draw the biscuit on the ground from here on (see the tick loop)
        tr.swapAt = (npcs.now || now) + inAir; // (the moment dogs-sync.js shows theirs: npcs.dropTreat's clock and hide time)
        if (tr.state === 'lie') { scene.remove(tr.mesh); tr.state = 'gone'; } // already down: swap to the dogs' biscuit right now
        // no word yet from the dog: guess when the nearest one gets there (npcs.onTreatEaten, if the dogs call it, is exact)
        let best = 99;
        for (const id of ['nala', 'dax', 'molly']) { const d = npcs.dog?.(id); if (d && d.body) best = Math.min(best, Math.hypot(d.body.root.position.x - m.x, d.body.root.position.z - m.z)); }
        tr.eatAt = now + Math.max(0, tr.dur - tr.t) + Math.min(9, best / 4.2) + 0.5;
        tr.life = Math.max(tr.life, (tr.eatAt - now) + 3);
      }
    }
  };
  net.on('treat', onTreatMsg);
  // dogs look up at whoever threw it
  npcs.whereIs = name => {
    if (name === ctx.profile.name) return { x: player.pos.x, z: player.pos.z };
    for (const r of remotes.map.values()) if (r.name === name) return { x: r.ch.root.position.x, z: r.ch.root.position.z };
    return null;
  };
  npcs.onTreatEaten = (x, z) => {
    let best = null, bd = 2.5;
    for (const t of treats) { if (t.state === 'gone') continue; const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = t; } }
    if (best) eatTreat(best);
  };

  // ---------------------------------------------------------------- other people's lines
  net.on('bob', m => {
    if (m.sid === net.sid) return;
    if (m.x === null || m.x === undefined) { const e = remoteRigs.get(m.sid); if (e) { e.on = false; e.rig.show(false); } return; }
    if (!sane(m.x) || !sane(m.z)) return;
    let e = remoteRigs.get(m.sid);
    if (!e) { e = { rig: new LineRig(scene), x: 0, z: 0, on: false, ph: rnd() * TAU, b: '' }; e.rig.ghost.visible = false; remoteRigs.set(m.sid, e); }   // no x-ray bobber for other people's lines
    e.x = m.x; e.z = m.z; e.on = true; e.b = typeof m.b === 'string' ? cleanBait(m.b) : '';   // which lure went in (older servers send none: ext.bait then)
    if (Math.hypot(m.x - player.pos.x, m.z - player.pos.z) < 60) { fx.rings3(m.x, m.z, 0.9); audio.play('fish-plink', m.x, WATER_Y, m.z); }
  });
  function tickRemoteRigs(now) {
    // everybody's lure on their rod tip (ext.bait, published by lib/fishing.js); the pole comes with the held code
    for (const r of remotes.map.values()) if (r.ch.setLure && r.ch.lure !== (r.ext.bait || 'none')) r.ch.setLure(r.ext.bait || 'none');
    for (const [sid, e] of remoteRigs) {
      const r = remotes.map.get(sid);
      if (!r) { e.rig.show(false); scene.remove(e.rig.group); remoteRigs.delete(sid); continue; }
      const last = r.buf[r.buf.length - 1];
      const near = Math.hypot(e.x - player.pos.x, e.z - player.pos.z) < 45;
      const on = e.on && near && r.ch.held === 'rod' && FISHY.has(ANIM_CODES[last ? last.a : 0]);
      if (e.rig.visible !== on) e.rig.show(on);
      r.ch.lineOut = on;
      if (!on) continue;
      e.rig.setPole(r.ch.pole || 'stick'); e.rig.setLure(e.b || r.ext.bait || 'none');
      r.ch.rodTip.getWorldPosition(_tip);
      _b.set(e.x, WATER_Y + 0.02 + Math.sin(now * 2.2 + e.ph) * 0.012, e.z);
      e.rig.update(_tip, _b, 0.28);
    }
  }

  // ---------------------------------------------------------------- hover card
  function hoverTick(dt) {
    hoverT += dt;
    if (hoverT < 0.07) return;
    hoverT = 0;
    const p = input.pointer;
    let hit = null;
    const blocked = coarse || !p.over || ctx.mode !== 'play' || talk || inventory.panelOpen || helpOpen() || mouseHeld;
    if (!blocked) {
      let bestD = Infinity;
      const test = (root, who) => {
        const sc = root.scale.y || 1;
        _v.set(root.position.x, root.position.y + 2.2 * sc, root.position.z).project(camera);
        if (_v.z > 1) return;
        const topY = (-_v.y * 0.5 + 0.5) * innerHeight, cx = (_v.x * 0.5 + 0.5) * innerWidth;
        _v.set(root.position.x, root.position.y, root.position.z).project(camera);
        const botY = (-_v.y * 0.5 + 0.5) * innerHeight, h = botY - topY;
        if (h < 12 || h > innerHeight * 3) return;
        const hw = h * 0.3;
        if (p.x > cx - hw && p.x < cx + hw && p.y > topY - h * 0.06 && p.y < botY + h * 0.04) {
          const d = camera.position.distanceTo(root.position);
          if (d < bestD) { bestD = d; hit = who; }
        }
      };
      test(player.character.root, { self: true });
      for (const r of remotes.map.values()) test(r.ch.root, r);
    }
    if (hit) {
      hoverGone = 0;
      const ext = hit.self ? null : hit.ext || {};
      hud.hover.show(p.x, p.y, hit.self
        ? { name: ctx.profile.name || 'You', color: ctx.profile.color, fish: S.fish, secs: S.secs, swing: ctx.selfExt.swingBest || 0, self: true, rod: S.rod }
        : { name: hit.name, color: hit.color, fish: ext.fish | 0, secs: ext.fishSecs || 0, swing: ext.swingBest || 0, rod: (ext.fish | 0) > 0 });
      document.body.classList.add('cursor-hover-player');
    } else {
      hoverGone += 0.07;
      if (hoverGone > 0.1) { hud.hover.hide(); document.body.classList.remove('cursor-hover-player'); }
    }
  }

  // ---------------------------------------------------------------- pointer: hold the left button to wind up
  const isClick = e => e.button === 0 && e.pointerType !== 'touch' && !(e.buttons & 2);
  function startFromPointer() {
    if (inventory.equipped === 'treat') { throwTreat(); return; }
    if (inventory.equipped === 'rod' && st === 'off' && canStart() && waterAhead(castAim())) { beginStance(); startWind(); wasHold = true; }
  }
  ctx.canvas.addEventListener('pointerdown', e => {
    if (!isClick(e) || ctx.mode !== 'play') return;
    if (talk) { advanceTalk(); return; }
    if (inventory.panelOpen || helpOpen()) return;
    mouseHeld = true;
    startFromPointer();
  });
  const releaseMouse = () => { mouseHeld = false; };
  addEventListener('pointerup', releaseMouse);
  addEventListener('pointercancel', releaseMouse);
  addEventListener('blur', () => { mouseHeld = false; touchHeld = false; });
  hud.touch.btn.addEventListener('pointerdown', e => { e.preventDefault(); touchHeld = true; startFromPointer(); });
  hud.touch.btn.addEventListener('pointerup', () => { touchHeld = false; });
  hud.touch.btn.addEventListener('pointercancel', () => { touchHeld = false; });

  // ---------------------------------------------------------------- cue bar and aim marker
  // the cue words name the button you have: Space on a keyboard, A on a pad (rebuilt only when the device changes)
  let cueDev = '', CUE = null;
  function cues() {
    const d = input.lastDevice === 'pad' ? 'pad:' + input.pad.family : 'kbm';
    if (d !== cueDev) {
      cueDev = d;
      const b = d === 'kbm' ? 'Space' : input.glyph('Space');
      CUE = { cast: `Hold ${b} to wind up, let go to cast`, bite: `NOW! Press ${b}!`, reel: `Hold ${b} to reel!`,
        treat: d === 'kbm' ? 'Space, E or click to throw. Look up to throw farther' : `${b} or ${input.glyph('E')} to throw. Look up to throw farther` };
    }
    return CUE;
  }
  // standing at water with no fish in it: point at the nearest water that has some (worked out again only after a move)
  let noFishAt = null, noFishMsg = '';
  function noFishText() {
    const x = player.pos.x, z = player.pos.z;
    if (!noFishAt || Math.hypot(x - noFishAt[0], z - noFishAt[1]) > 4) { noFishAt = [x, z]; noFishMsg = 'No fish here. Try ' + nearestRegion(x, z).region.where; }
    return noFishMsg;
  }
  function updateHud(now) {
    const eq = inventory.equipped;
    // the touch button takes the jump's place only where it can cast, so far from the water you can still jump
    let btn = coarse && (eq === 'rod' || eq === 'treat') && !talk && !inventory.panelOpen;
    if (talk || inventory.panelOpen) { hud.touch.show(btn); hud.cue.hide(); aimRing.visible = false; return; }
    let text = '', kind = '', prog = -1, label = 'Cast';
    if (eq === 'rod') {
      switch (st) {
        case 'off': case 'ready': {
          const look = aheadOf(castAim()), ahead = look === 'fish';
          // far from any water the nudge is just noise: only say "face the water" within casting reach of the shore
          const nearWater = ahead || coastSigned(player.pos.x, player.pos.z) > -16;
          if (!nearWater && look !== 'water') btn = false;
          text = ahead ? (coarse && input.lastDevice !== 'pad' ? 'Hold the button to cast' : cues().cast) : look === 'water' ? noFishText() : nearWater ? 'Face the water to cast' : ''; kind = ahead ? '' : 'dim';
          break;
        }
        case 'windup': text = 'Let go to cast!'; kind = 'go'; label = 'Release'; break;
        case 'wait': text = waitT > 14 ? 'No bites? Cast closer to a shadow' : 'Waiting for a bite...'; kind = 'dim'; label = 'Reel in'; break;
        case 'nibble': text = 'Wait for it...'; kind = 'dim'; label = 'Wait'; break;
        case 'bite': text = coarse && input.lastDevice !== 'pad' ? 'NOW! Tap!' : cues().bite; kind = 'alert'; label = 'Hook!'; break;
        case 'hook': text = 'Got it!'; kind = 'go'; break;
        case 'reel': text = coarse && input.lastDevice !== 'pad' ? 'Hold to reel!' : cues().reel; kind = 'go'; prog = reelP; label = 'Reel'; break;
      }
    } else if (eq === 'treat') {
      text = coarse && input.lastDevice !== 'pad' ? 'Tap Throw. Aim with your camera' : cues().treat; label = 'Throw';
    }
    if (text) hud.cue.show(text, kind, prog); else hud.cue.hide();
    hud.touch.show(btn);
    hud.touch.label(label);
    if (st !== 'off') ctx.quests?.set('fishing', { title: st === 'reel' ? 'Reel it in!' : st === 'bite' ? 'A bite!' : st === 'wait' || st === 'nibble' ? 'Line in the water' : 'Fishing', text: text || 'Rod out at the shore.', progress: st === 'reel' ? reelP : null, prio: 5, color: '#5fb3e6' });

    // where a thrown treat would land
    if (eq === 'treat' && st === 'off' && inventory.has('treat')) {
      const l = treatLanding();
      aimRing.position.set(l.x, groundHeight(l.x, l.z) + 0.06, l.z);
      aimRing.material.color.set('#ffd86b');
      aimRing.scale.setScalar(0.42 + 0.06 * Math.sin(now * 7));
      aimRing.visible = true;
    } else if (st !== 'windup') aimRing.visible = false;
  }

  // the fish round Kevin's boat (fish-data.js ZONES 'boat') go where the boat goes (ctx.crew.boat, kevin-crew.js): the
  // zone's middle follows it and, once it has moved on a good way (a new anchorage), its fish are put round it afresh
  const BOAT_ZONE = ZONES.find(z => z.follow) || null;
  let boatPlaced = null;
  function followBoat() {
    const b = ctx.crew && ctx.crew.boat;
    if (!BOAT_ZONE || !b) return;
    BOAT_ZONE.x = b.x; BOAT_ZONE.z = b.z;
    if (boatPlaced && Math.hypot(b.x - boatPlaced[0], b.z - boatPlaced[1]) < 15) return;
    boatPlaced = [b.x, b.z];
    // the fish round the boat are the fish of the water it is in (fish-regions.js), so what bites is what the server takes
    const reg = regionAt(b.x, b.z);
    if (reg) { BOAT_ZONE.region = reg.id; BOAT_ZONE.weights = POOLS[reg.id]; }
    for (const f of school.fish) if (f.zone === BOAT_ZONE && f.state !== 'hooked' && f.state !== 'nibble' && f.state !== 'approach' && !f.gold) school.place(f);
  }

  // ---------------------------------------------------------------- the feature
  const feature = {
    name: 'fishing',
    treatHow, // (for tools/qol-test.mjs)
    update(dt, now) {
      lastNow = now;
      if (st !== 'off') tickFishing(dt, now);
      else wasHold = holding();
      if (talk) {
        talk.typed = Math.min(talk.len, talk.typed + dt * 42);
        const n = Math.floor(talk.typed);
        if (n !== talk.shown) { talk.shown = n; hud.dialog.text(talk.text.slice(0, n)); }
        hud.dialog.talking(talk.typed < talk.len);
        gusT -= dt;
        if (gusT <= 0) { gusT = 2.4; try { npcs.local?.set(talk.g.id, { anim: 'talk', until: now + 3 }); } catch { /* the dogs work may rename it */ } }
      }
      tickTreats(dt, now);
      // the shadows react to you running along the shore
      const th = school.threat;
      th.x = player.pos.x; th.z = player.pos.z; th.speed = player.speed; th.on = true;
      followBoat();
      school.update(dt, now, player, camera);
      fx.update(dt);
      tickRemoteRigs(now);
      player.character.lineOut = rig.visible;   // the lure hangs from the rod tip unless it is out on the line
      updateHud(now);
      syncAimGhost();
      hoverTick(dt);
    },
    target(px, pz) {
      if (talk) return { hint: talk.typed < talk.len ? 'E  Skip ahead' : 'E  Next', prio: 10, run: advanceTalk };
      if (st !== 'off') return { hint: 'E  Stop fishing', prio: 10, run: () => endFishing('stopped') };
      if (inventory.equipped === 'treat' && inventory.has('treat')) return { hint: 'E  Throw the treat', prio: 9, run: throwTreat };
      const g = kevin();
      if (g && Math.hypot(g.body.root.position.x - px, g.body.root.position.z - pz) < 3.4) return { hint: 'E  Talk to Kevin', prio: 6, run: startTalk };
      return null;
    },
    onKey(code) {
      if (input.typing || ctx.mode !== 'play') return false;
      if (code === 'ToolUse') code = 'Space'; // the pad's tool button uses what is in your hand like Space (but is never a hop: main.js has no ToolUse)
      if (talk) {
        if (code === 'Escape') { endTalk(); return true; }
        if (code === 'Space' || code === 'KeyE' || code === 'Enter' || code === 'NumpadEnter') { advanceTalk(); return true; }
        return true;
      }
      if (inventory.panelOpen || shackOpen()) return false;   // Mabel's card has the keys (Esc closes it, it does not put the rod away)
      const eq = inventory.equipped;
      if (code === 'Escape') {
        if (st !== 'off') { endFishing('escape'); inventory.unequip(); return true; }
        if (eq) { inventory.unequip(); return true; }
        return false;
      }
      if (code === 'KeyE') {
        if (st !== 'off') { endFishing('stopped'); return true; }
        if (eq === 'treat') { throwTreat(); return true; }
        return false;
      }
      if (code === 'Space') {
        if (eq === 'treat') { throwTreat(); return true; }
        if (eq !== 'rod') return false;
        if (st === 'off') {
          if (lastNow < noCastUntil) return true;   // that tap was closing the chat
          if (canStart() && waterAhead(castAim())) { beginStance(); startWind(); wasHold = true; return true; }
          return false; // no water in front of you: Space is just a hop
        }
        return true;    // fishing has the button; the press itself is read in tickFishing
      }
      return false;
    },
    help: [[['Space'], 'rod out: hold to cast, tap to hook and reel'], [['E'], 'talk to Kevin, throw a treat'], [['Esc'], 'put the rod away']],
  };

  refreshCounter();
  // the bait decides who comes to the line (fish-gear.js BAITS appeal: worms for all, crickets for perch, the spoon for mackerel and gold...)
  // (from Kevin's boat a fish comes half as keenly: half the bite rate, twice the wait)
  school.appeal = f => baitOf(gear.bait).appeal(f.id, f.k) * biteScale();
  applyGear(false);

  // a debug hook so the harness can drive whole sessions quickly
  feature.debug = {
    S, sess, school, fx, rig, hud, treats, remoteRigs,
    get state() { return st; },
    get talk() { return talk; },
    get target() { return target; },
    giveRod() { if (!S.rod) giveRod(); inventory.equip('rod'); },
    startTalk, advanceTalk,
    // put a specific fish under the bobber right now (id may be a junk id: boot, duck, can)
    forceBite(id = null, cm = 0) {
      if (st !== 'wait') return false;
      const f = school.nearest(target.x, target.z) || school.fish[0];
      const junk = !!id && !SPECIES[id];
      if (id && !junk) { f.id = id; f.sp = SPECIES[id]; f.cm = cm || f.cm; f.k = sizeScale(id, f.cm); }
      forcedFish = id ? { id, cm, junk } : null;
      f.x = target.x + 0.3; f.z = target.z; f.state = 'nibble'; f.alpha = 1; school.busy = f;
      school.onArrive(f);
      return true;
    },
    // run a catch through the bookkeeping without playing the minigame (server rate limits still apply)
    catchNow(id, cm, junk = false) {
      const r = { id, cm, junk: junk || !SPECIES[id] };
      const rec = recordCatch(r);
      hud.card.show({ id, cm, junk: r.junk, record: rec.record, first: rec.first && !r.junk, treat: rec.treat, region: rec.region, extra: rec.pay > 1 ? '+' + rec.pay + ' fish: caught from Kevin\'s boat!' : '' }, 4);
      if (rec.pay > 1) game.toast('+' + rec.pay + ' fish! Every catch from the boat is worth ' + rec.pay + '.', 2600);
      if (rec.treat) awardTreatFx();
      return rec;
    },
    biteScale, get onBoat() { return onBoat(); },
    flush: flushSecs,
    gear, setGear: (pole, bait) => ctx.fishGear.set({ pole, bait }), maxCast,
    throwNow: throwTreat,
    releaseAt(x, z) { releaseTreat({ x, z }); },
    press, endFishing, beginStance, startWind, doCast,
  };
  return feature;
}
