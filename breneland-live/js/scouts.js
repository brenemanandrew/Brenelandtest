// The scout camp in Strickler woods and the hide-and-seek game: the Scoutmaster has lost his four cub scouts, who are
// hiding behind trees in the woods round the camp. Find all four (walk up, E: "Found you!") and he pays a fish.
//
// Where: only inside Andrew's green doodle (layout.js SCOUT_WOODS, scouts-area.js): they hide in it, and a found scout runs
// home through it (round the loop, never across the open bay) to the camp. Their giggles are real children's laughs
// (scout-voice.js), loaded once the sound is on and you come near the woods.
//
// Hiding spots are a pure function of the shared clock: a new set every 10 hours (period = floor(t / 36e6)), and a different
// set per round within a period, so everyone who plays in the same period hunts the same spots. Your own progress (who you've
// found) is yours alone, kept in localStorage per period and round. Rewards: ctx.reward('scouts') (the server caps it at 2 a day).
import * as THREE from 'three';
import { hash01, pointInPoly, el, loadCss } from './util.js';
import { SCOUT_CAMP, TENT, WALK, FENCE_WEST_X, MAP, YARD } from './layout.js';
import { terrainHeight, coastSigned } from './terrain.js';
import { toon, shadows } from './toon.js';
import { Batcher, GEO } from './batch.js';
import { buildCampfire } from './campfire.js';
import { Human } from './human.js';
import { lampGlow, addNightSpot } from './daynight-mats.js';
import { addLogSeats } from './seats.js';
import { inScoutWoods, scoutRoute } from './scouts-area.js';
import { loadScoutBank, bankOf, playScoutVoice } from './scout-voice.js';

const PERIOD_MS = 36e6; // 10 hours
export const SCOUTS = [ // (the cast: the maze's lost scout is one of them, w16-goals)
  { id: 'milo', name: 'Milo', skin: '#f6d3b3', hair: '#c9873a', hairStyle: 'short' },
  { id: 'ava', name: 'Ava', skin: '#a86b45', hair: '#1e1a18', hairStyle: 'pigtails' },
  { id: 'theo', name: 'Theo', skin: '#e3ae8b', hair: '#3a2a20', hairStyle: 'curly' },
  { id: 'june', name: 'June', skin: '#c98e62', hair: '#5a3a22', hairStyle: 'bob' },
];
export const UNIFORM = { outfit: 'tee', shirt: '#2f3f6e', pants: '#2f3f6e', shoes: '#4a3526', hat: 'cap', hatColor: '#2f3f6e', accessory: 'scarf', scarfColor: '#f2c230', accessoryColor: '#f2c230', height: 0.62, build: 0.4, eyeStyle: 'hooded' };
const MASTER = { outfit: 'jacket', shirt: '#b89a5a', inner: '#d8c5a2', pants: '#7a6a44', shoes: '#4a3526', shoeKind: 'boots', hat: 'straw', hatColor: '#8a7040', accessory: 'scarf', scarfColor: '#c9472d', skin: '#c98e62', hair: '#3a2a20', facialHair: 'mustache', height: 0.78, eyeStyle: 'hooded' };
const GIGGLES = ['hehehe', 'hihi!', '*giggle*', 'psst... hehe', 'shhh! hehe'];
const PITCH = [1, 1.1, 0.94, 1.05];   // each scout's giggle, x playbackRate (Milo, Ava, Theo, June)
const RUN_SPEED = 4.6;
const BANK_NEAR = 90;   // the giggles start loading once the sound is on and you are this close to the camp
const KEY = 'breneland.scouts';

const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private window */ } },
};

export function createScouts(ctx) {
  const { scene, player, colliders, audio, ui, world, net } = ctx;
  loadCss('/css/scouts.css');
  const group = new THREE.Group(); group.name = 'scout-camp'; scene.add(group);
  const b = new Batcher({ vertexColors: true });
  const updaters = [];
  const { x: cx, z: cz } = SCOUT_CAMP;
  const cy = terrainHeight(cx, cz);

  // ---- the camp: fire, log benches, a flag pole, a cooler and some gear, a "Troop 7" sign
  buildCampfire({ b, group, x: cx, z: cz, colliders, updaters });
  const seats = [];
  for (const a of [0.4, 1.6, 2.8, 4.0, 5.2]) {
    const lx = cx + Math.cos(a) * 2.7, lz = cz + Math.sin(a) * 2.7;
    b.add(GEO.cyl8, '#7a5234', { x: lx, y: terrainHeight(lx, lz) + 0.13, z: lz, sx: 0.17, sy: 1.8, sz: 0.17, rz: Math.PI / 2, ry: -a + Math.PI / 2 }); // (seat-height: the top 0.3 up, was 0.47)
    colliders.push({ type: 'circle', x: lx, z: lz, r: 0.6 });
    seats.push([lx, lz, a]);
    addLogSeats(lx, lz, terrainHeight(lx, lz) + 0.3, Math.PI - a, Math.atan2(cx - lx, cz - lz), 2.4); // players sit at the ends, facing the fire (seats.js)
  }
  const fx = cx + 4.5, fz = cz - 3, fy = terrainHeight(fx, fz);
  b.add(GEO.cyl8, '#e8e2d6', { x: fx, y: fy + 3, z: fz, sx: 0.06, sy: 6, sz: 0.06 });
  b.add(GEO.box, '#2f3f6e', { x: fx + 0.5, y: fy + 5.5, z: fz, sx: 1, sy: 0.6, sz: 0.02 });
  b.add(GEO.box, '#f2c230', { x: fx + 0.5, y: fy + 5.5, z: fz + 0.01, sx: 0.4, sy: 0.25, sz: 0.02 });
  colliders.push({ type: 'circle', x: fx, z: fz, r: 0.15 });
  const gx = cx - 4.2, gz = cz + 2.6, gy = terrainHeight(gx, gz);
  b.add(GEO.box, '#3f7fc9', { x: gx, y: gy + 0.2, z: gz, sx: 0.62, sy: 0.36, sz: 0.38 });
  b.add(GEO.box, '#f4f2ea', { x: gx, y: gy + 0.41, z: gz, sx: 0.66, sy: 0.07, sz: 0.42 });
  b.add(GEO.box, '#6b8a4a', { x: gx + 0.9, y: gy + 0.25, z: gz + 0.2, sx: 0.5, sy: 0.5, sz: 0.35, ry: 0.4 }); // a backpack
  b.add(GEO.cyl8, '#8a6240', { x: gx + 1.6, y: gy + 0.05, z: gz - 0.3, sx: 0.08, sy: 0.9, sz: 0.08, rz: Math.PI / 2, ry: 0.7 }); // firewood
  b.add(GEO.cyl8, '#8a6240', { x: gx + 1.6, y: gy + 0.13, z: gz - 0.2, sx: 0.08, sy: 0.9, sz: 0.08, rz: Math.PI / 2, ry: 0.5 });
  colliders.push({ type: 'circle', x: gx + 0.4, z: gz, r: 0.9 });
  // the tent, deeper in the woods
  const { x: tx, z: tz } = TENT;
  const ty = terrainHeight(tx, tz);
  const tentShape = new THREE.Shape([new THREE.Vector2(-1.4, 0), new THREE.Vector2(1.4, 0), new THREE.Vector2(0, 1.9)]);
  b.add(new THREE.ExtrudeGeometry(tentShape, { depth: 2.6, bevelEnabled: false }), '#4f7a4a', { x: tx, y: ty, z: tz - 1.3, ry: 0.35 });
  b.add(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1.2)]), { depth: 0.1, bevelEnabled: false }), '#2e2e36', { x: tx - Math.sin(0.35) * 1.3, y: ty + 0.01, z: tz - Math.cos(0.35) * 1.3 - 0.05, ry: 0.35 }); // the door
  for (const s of [-1, 1]) b.add(GEO.cyl6, '#d9c7a0', { x: tx + s * 1.9, y: ty + 0.35, z: tz + s * 0.7, sx: 0.02, sy: 1.5, sz: 0.02, rz: s * 0.9 }); // guy ropes
  colliders.push({ type: 'circle', x: tx, z: tz, r: 1.7 });
  const lx2 = tx + 1.9, lz2 = tz - 1.2, ly2 = terrainHeight(lx2, lz2);
  b.add(GEO.cyl8, '#3a3f47', { x: lx2, y: ly2 + 0.5, z: lz2, sx: 0.03, sy: 1, sz: 0.03 });
  b.add(GEO.box, lampGlow('#ffd98e'), { x: lx2, y: ly2 + 1.05, z: lz2, sx: 0.16, sy: 0.22, sz: 0.16 });
  addNightSpot({ x: lx2, y: ly2 + 1.05, z: lz2, color: '#ffd98e', pool: 2.6, gy: ly2, halo: 0.8 });
  b.build(group, 'scout-camp');

  // ---- people
  const master = new Human({ ...MASTER });
  master.root.position.set(cx + 2.2, terrainHeight(cx + 2.2, cz - 2.2), cz - 2.2);
  master.root.rotation.y = Math.atan2(cx - master.root.position.x, cz - master.root.position.z);
  scene.add(master.root);
  const mtag = ui.nameTag(master.root, 'Scoutmaster Gene', '#ffffff'); mtag.max = 16; mtag.fade = 11;
  const scouts = SCOUTS.map((s, i) => {
    const h = new Human({ ...UNIFORM, skin: s.skin, hair: s.hair, hairStyle: s.hairStyle });
    h.root.visible = false;
    scene.add(h.root);
    const tag = ui.nameTag(h.root, 'Scout ' + s.name, '#ffffff'); tag.max = 9; tag.fade = 6;
    return { ...s, h, i, spot: null, state: 'hidden', runT: 0, from: null, route: null, giggleAt: 0, laughCycle: -1 };
  });

  // ---- hiding spots for (period, round)
  const forest = () => world.forest || [];
  function okSpot(x, z) {
    // in Andrew's doodle, with a metre and a half to spare all round
    if (!inScoutWoods(x, z) || !inScoutWoods(x + 1.5, z) || !inScoutWoods(x - 1.5, z) || !inScoutWoods(x, z + 1.5) || !inScoutWoods(x, z - 1.5)) return false;
    if (!pointInPoly(x, z, WALK) || pointInPoly(x, z, YARD)) return false;
    if (x > FENCE_WEST_X - 3) return false;
    if (x < MAP.minX + 12 || z < MAP.minZ + 10 || z > MAP.maxZ - 6) return false;
    if (coastSigned(x, z) > -4) return false;
    if (world.onTrail(x, z, 1.2)) return false;
    if (Math.hypot(x - tx, z - tz) < 3) return false;
    for (const c of colliders) if (c.type === 'circle' && !c.tree && Math.hypot(x - c.x, z - c.z) < c.r + 0.6) return false;
    return true;
  }
  const spotCache = new Map();
  function spotsFor(period, round) {
    const key = period + ':' + round;
    if (spotCache.has(key)) return spotCache.get(key);
    const trees = forest().filter(s => s.solid && inScoutWoods(s.x, s.z));
    const out = [];
    for (let i = 0; i < 400 && out.length < 4; i++) {
      const r = hash01('scout', period, round, i);
      let x, z;
      if (trees.length && r < 0.75) { // behind a tree, on the side away from the camp
        const t = trees[Math.floor(hash01('scouttree', period, round, i) * trees.length)];
        const dx = t.x - cx, dz = t.z - cz, d = Math.hypot(dx, dz) || 1;
        x = t.x + (dx / d) * 1.05; z = t.z + (dz / d) * 1.05;
      } else { // somewhere else in the doodle (its bounding box; okSpot keeps the ones inside)
        x = -191 + hash01('sx', period, round, i) * 81; z = -82 + hash01('sz', period, round, i) * 129;
      }
      const dc = Math.hypot(x - cx, z - cz);
      if (dc < 14 || dc > 120 || !okSpot(x, z)) continue;
      if (out.some(o => Math.hypot(o[0] - x, o[1] - z) < 18)) continue;
      out.push([x, z]);
    }
    spotCache.set(key, out);
    return out;
  }

  // ---- progress
  const periodOf = () => Math.floor(net.serverNow() / PERIOD_MS);
  let prog = store.get();
  function syncProg() {
    const p = periodOf();
    if (!prog || prog.period !== p) prog = { period: p, round: 0, found: [], paid: 0 };
    return prog;
  }
  function layout() {
    const pr = syncProg();
    const spots = spotsFor(pr.period, pr.round);
    scouts.forEach((s, i) => {
      s.spot = spots[i] || null;
      if (!s.spot) { s.h.root.visible = false; return; }
      if (pr.found.includes(s.id)) { s.state = 'camp'; sitAtCamp(s); }
      else {
        s.state = 'hidden';
        s.h.root.visible = true;
        s.h.root.position.set(s.spot[0], terrainHeight(s.spot[0], s.spot[1]), s.spot[1]);
        s.h.root.rotation.y = Math.atan2(cx - s.spot[0], cz - s.spot[1]) + Math.PI; // back to the camp, peeking over a shoulder
      }
    });
    hud();
  }
  function sitAtCamp(s) {
    const seat = seats[(s.i + 1) % seats.length];
    s.h.root.visible = true;
    s.h.root.position.set(seat[0] + Math.cos(seat[2]) * 0.1, terrainHeight(seat[0], seat[1]) + 0.05, seat[1] + Math.sin(seat[2]) * 0.1);
    s.h.root.rotation.y = Math.atan2(cx - seat[0], cz - seat[1]);
    s.h.params.seatY = 0.25 / (s.h.root.scale.y || 1); // (the log's top 0.3 over the ground, the root 0.05 up; seat-height)
  }

  // ---- HUD
  const card = el('div', 'scouts-card', '', { hidden: '' });
  const cardTitle = el('div', 'scouts-title', 'Scouts found');
  const cardCount = el('div', 'scouts-count', '0 / 4');
  card.append(cardTitle, cardCount);
  ctx.hud.append(card);
  function hud() {
    const pr = syncProg();
    const active = pr.found.length > 0 && pr.found.length < 4;
    card.hidden = !active && !(pr.found.length === 4);
    cardCount.textContent = `${pr.found.length} / 4`;
    cardTitle.textContent = pr.found.length === 4 ? 'All found! Tell Gene' : 'Scouts found';
    const n = pr.found.length;
    if (n === 4) ctx.quests?.set('scouts', { title: 'Hide and seek', text: 'All four found! Tell Scoutmaster Gene at the campfire.', progress: 1, prio: 4, color: '#f2c230' });
    else if (n > 0) ctx.quests?.set('scouts', { title: 'Hide and seek', text: `${n} of 4 cub scouts found. Look behind the big trees in the woods round the camp.`, progress: n / 4, prio: 3, color: '#f2c230' });
    else ctx.quests?.clear('scouts');
  }

  audio.registerSfx?.('found', (a, x, y, z) => { const o = a.at(x, y, z, 4); const t = a.ctx.currentTime; [0, 4, 7, 12].forEach((n, i) => a.tone(o, { f: 523 * Math.pow(2, n / 12), t: t + i * 0.07, d: 0.35, peak: 0.07, verb: 0.4 })); });

  let lastPeriod = -1, lastNear = 0;
  layout();

  const say = (h, text, v) => { ui.say(h.root, text, 3, 2.3); const p = h.root.position; audio.speak(p.x, p.y + 1.6, p.z, text, v); h.say?.(1.2); };
  // a scout's real giggle (or laugh, or chortle) with a balloon. While the bank is still loading only the balloon shows, and if
  // it failed altogether the babble giggle plays (scout-voice.js)
  const giggle = (s, kind, text) => {
    const p = s.h.root.position;
    if (text) { ui.say(s.h.root, text, 3, 2.3); s.h.say?.(1); }
    const r = playScoutVoice(audio, p.x, p.y + 1.1, p.z, kind, { rate: PITCH[s.i] });
    if (!r && text && bankOf(audio.ctx)?.done) audio.speak(p.x, p.y + 1.1, p.z, text, SCOUT_V);
    return r;
  };
  const MASTER_V = { pitch: 118, rate: 0.95 }, SCOUT_V = { pitch: 260, rate: 1.2, formant: 1.2 };

  function talkToMaster() {
    const pr = syncProg();
    if (pr.found.length === 4) {
      say(master, 'You found them all! Here, a fish for your trouble.', MASTER_V);
      ctx.reward('scouts').then(r => {
        if (r.ok) {
          ui.toast(`Scoutmaster Gene gave you a fish! (${r.left} more today)`, 4200);
          audio.play?.('found', master.root.position.x, 1.5, master.root.position.z);
          pr.round++; pr.found = []; pr.paid++; store.set(pr);
          setTimeout(() => { say(master, 'And... they have run off again. Would you look for them one more time?', MASTER_V); layout(); }, 3500);
        } else if (r.why === 'cap') {
          ui.toast('Gene is out of fish for today. Come back tomorrow!', 4200);
          say(master, 'That is all the fish I have today. Same time tomorrow?', MASTER_V);
          pr.found = []; pr.round++; store.set(pr); layout();
        } else if (r.why === 'soon') { ui.toast('Gene is still counting his fish. Ask again in a minute.', 3600); say(master, 'Hold on, let me find my fish bucket... ask me again in a minute.', MASTER_V); }
        else ui.toast('Could not reach the camp office (' + (r.why || 'offline') + '). Try again in a moment.', 3600);
      });
      return;
    }
    const left = 4 - pr.found.length;
    say(master, pr.found.length ? `${left} more to find. Check behind the big trees, all round the camp.` : 'My four cub scouts are hiding somewhere in these woods, all round the camp. Can you find them? Look for the blue caps and yellow neckerchiefs.', MASTER_V);
    if (!pr.found.length) ui.toast('Find the four cub scouts hiding in the woods round the Scout Camp, from behind the shops to the lake. Press E when you spot one.', 5200);
  }
  function findScout(s) {
    const pr = syncProg();
    if (pr.found.includes(s.id)) return;
    pr.found.push(s.id); store.set(pr);
    s.state = 'run'; s.runT = 0; s.from = s.h.root.position.clone();
    // home to the scout's bench round the loop and in along the one lead-in path (scouts-area.js), never across the open bay
    const seat = seats[(s.i + 1) % seats.length];
    s.route = [[s.from.x, s.from.z], ...scoutRoute(s.from.x, s.from.z, seat[0], seat[1])];
    s.routeLen = 0; for (let k = 1; k < s.route.length; k++) s.routeLen += Math.hypot(s.route[k][0] - s.route[k - 1][0], s.route[k][1] - s.route[k - 1][1]);
    // a real laugh first, then the words (the babble) once it is done
    const line = ['Aww, you found me!', 'Hehe, you got me!', 'No fair! Hehe.', 'Okay okay, I am going back!'][s.i];
    const lr = giggle(s, 'laugh', null);
    if (lr) setTimeout(() => say(s.h, line, SCOUT_V), Math.max(0, lr.end - audio.ctx.currentTime) * 1000 + 120);
    else say(s.h, line, SCOUT_V);
    audio.play?.('found', s.h.root.position.x, 1.2, s.h.root.position.z);
    hud();
    if (pr.found.length === 4) ui.toast('That is all four! Go and tell Scoutmaster Gene at the campfire.', 4800);
    else ui.toast(`Found Scout ${s.name}! ${4 - pr.found.length} to go.`, 3200);
  }

  // where a running scout is, `d` metres along its route home (into one shared object: no garbage while they run)
  const AT = { x: 0, z: 0, yaw: 0, end: false };
  function routeAt(s, d) {
    const R = s.route;
    for (let k = 1; k < R.length; k++) {
      const ax = R[k - 1][0], az = R[k - 1][1], bx = R[k][0], bz = R[k][1], L = Math.hypot(bx - ax, bz - az);
      if (d <= L || k === R.length - 1) {
        const f = L > 0 ? Math.min(1, d / L) : 1;
        AT.x = ax + (bx - ax) * f; AT.z = az + (bz - az) * f; AT.yaw = Math.atan2(bx - ax, bz - az); AT.end = k === R.length - 1 && d >= L;
        return AT;
      }
      d -= L;
    }
    AT.x = R[0][0]; AT.z = R[0][1]; AT.yaw = 0; AT.end = true;
    return AT;
  }

  let bankAsked = false;
  return {
    name: 'scouts',
    // for the tests (tools/w1-scouts-test.mjs): the spots for any period and round, a scout's way home, the scouts themselves
    debug: { spotsFor, okSpot, routeAt, seats, scouts, master, layout, giggle, findScout },
    update(dt, now) {
      // the giggles load once the sound is on and you come near the woods (never at page load)
      if (!bankAsked && audio.ctx && Math.hypot(player.pos.x - cx, player.pos.z - cz) < BANK_NEAR) { bankAsked = true; loadScoutBank(audio.ctx); }
      const p = periodOf();
      if (p !== lastPeriod) { lastPeriod = p; layout(); }
      for (const u of updaters) u(dt, now);
      const t = now;
      master.update(dt, t, 0, Math.floor(t / 7) % 3 === 0 ? 'look' : 'idle');
      for (const s of scouts) {
        if (!s.h.root.visible) continue;
        const r = s.h.root;
        if (s.state === 'hidden') {
          s.h.params.seatY = 0;
          s.h.update(dt, t, 0, 'sit');
          const d = Math.hypot(player.pos.x - r.position.x, player.pos.z - r.position.z);
          if (d < 22 && now > s.giggleAt) {
            s.giggleAt = now + 4 + hash01('g', s.i, Math.floor(now)) * 5;
            const text = GIGGLES[(s.i + Math.floor(now)) % GIGGLES.length];
            giggle(s, hash01('gk', s.i, Math.floor(now)) < 0.25 ? 'chortle' : 'giggle', text); // now and then a snicker
          }
        } else if (s.state === 'run') {
          s.runT += dt;
          const at = routeAt(s, s.runT * RUN_SPEED);
          r.position.set(at.x, terrainHeight(at.x, at.z), at.z);
          r.rotation.y = at.yaw;
          s.h.params.seatY = 0;
          s.h.update(dt, t, RUN_SPEED, null);
          if (at.end) { s.state = 'camp'; sitAtCamp(s); }
        } else {
          const cyc = Math.floor((t + s.i * 3) / 9), laughing = cyc % 4 === 0;
          s.h.update(dt, t, 0, laughing ? 'laugh' : 'sit');
          // round the fire they crack each other up: a real laugh or chortle as the laugh pose starts, when you are near
          if (laughing && cyc !== s.laughCycle) {
            s.laughCycle = cyc;
            if (Math.hypot(player.pos.x - r.position.x, player.pos.z - r.position.z) < 25) giggle(s, hash01('ck', s.i, cyc) < 0.5 ? 'chortle' : 'laugh', null);
          }
        }
      }
    },
    target(px, pz) {
      const dm = Math.hypot(px - master.root.position.x, pz - master.root.position.z);
      if (dm < 2.6) return { hint: 'E  Talk to Scoutmaster Gene', prio: 5, run: talkToMaster };
      for (const s of scouts) {
        if (s.state !== 'hidden' || !s.h.root.visible) continue;
        if (Math.hypot(px - s.h.root.position.x, pz - s.h.root.position.z) < 2.4) return { hint: `E  Found you, ${s.name}!`, prio: 6, run: () => findScout(s) };
      }
      return null;
    },
    bodies() {
      const out = [{ x: master.root.position.x, z: master.root.position.z, r: 0.3 }];
      for (const s of scouts) if (s.h.root.visible && s.state !== 'run') out.push({ x: s.h.root.position.x, z: s.h.root.position.z, r: 0.25 });
      return out;
    },
    help: [[['E'], 'find the hiding cub scouts for Scoutmaster Gene (the camp is deep in Strickler woods; listen for their giggles)']],
  };
}
void shadows; void toon;
