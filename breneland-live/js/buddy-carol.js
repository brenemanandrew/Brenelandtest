// Buddy and Carol (docs/briefs/buddy-carol.md): their garage on Maple Row, their blue pickup, Carol's wreath booth in Strickler
// Park, the wreath you can buy for Breneland's front door (lib/wreaths.js), the neighbours' door wreaths, and their talk.
// Where they are is buddy-day.js (a pure function of the shared clock), what the booth shows is wreath-data.js, how it looks
// wreath-art.js. Cheap on phones: static parts merged per setup stage, repeats instanced, one small canvas atlas.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { BOOTH } from './layout.js';
import { terrainHeight, groundHeight } from './terrain.js';
import { toon, shadows } from './toon.js';
import { Batcher, GEO } from './batch.js';
import { lampGlow, LIGHT } from './daynight-mats.js';
import { Human } from './human.js';
import { streetY } from './mailman-route.js';
import { el, loadCss, hash01, angleLerp } from './util.js';
import { NPCS, CAROL_OUTFITS, lookOf, voiceOf, tagOf, mergeLook, savedLook } from './npc-looks.js';
import { carParts, partMatrix } from './car-models.js';
import { GFX } from './gfx.js';
import { TOWN_HOUSES } from './world-town.js';
import { HOUSE } from './layout.js';
import {
  familyAt, homeOf, routes, boothXZ, boothYaw, TRIPOD, CHAIR, POST, STAGES, itemShown, tripodAt, doorWreaths, boothDay, resetBuddyCaches,
} from './buddy-day.js';
import { hourOverride } from './daytime.js';
import { castOn, castAt, KEEP_NEAR } from './town-cast.js';
import { DESIGNS, BREEDS, arrangementFor, arrangementLayout, ARRANGEMENTS, WREATH_PRICE, WALL_SLOTS, TABLE_SLOTS } from './wreath-data.js';
import { wreathGeometry, wreathIcon, atlasTexture, cellUV } from './wreath-art.js';

const TRUCK_BLUE = '#2c5aa8';
const CW = 3.05, EH = 2.3, PEAK = 0.72;          // a 10 x 10 ft canopy: its size, eave height and how high the roof rises
const GRID = '#f1f1ec', LEG = '#9aa0a8', ROOF = '#f7f7f3', WOOD = '#9a6a3a';
const VC = toon('#ffffff', { vertexColors: true });
// the wire pattern of a gridwall: white wires on nothing, tiled (one small canvas, plain fills)
function gridTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'); g.clearRect(0, 0, 32, 32); g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 32, 4); g.fillRect(0, 0, 4, 32);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const easeBack = u => { if (u <= 0) return 0; if (u >= 1) return 1; const c = 1.7; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };

// ------------------------------------------------------------------ what they say
const LINES = {
  carol: {
    walk: ['Morning, hon! Isn\'t it a beautiful day for a walk?', 'Good morning! Do you have a dog? I love dogs.', 'We do three laps if Buddy\'s knee behaves.', 'Hi sweetie! Are you having a good morning?', 'Look at that sky! Enjoy your day, hon.'],
    craft: ['Come on in! I\'m making a fall wreath for the booth.', 'Hand me that ribbon, would you? Just kidding, hon.', 'We\'ll be at Strickler Park at half past three, come see!', 'Do you like the burlap or the mesh better? Be honest.', 'How\'s your day going, sweetie?'],
    setup: ['Give us a few minutes, hon, we\'re almost set up!', 'Watch your head, that canopy pops right up.', 'Buddy! The legs click in, they don\'t twist!'],
    booth: ['Hi hon! Take your time and look around.', 'Do you have a dog? We have a sign for every breed!', 'How was your day, sweetie?', 'Do you have kids? They love the scarecrow ones.', 'Everything\'s handmade. Buddy cuts the signs, I do the bows.', 'The wreath on the stand is ten fish, hon. Hangs right on your door.', 'If you see a Boston terrier, send them my way!'],
    pack: ['Packing up for tonight, hon. Back tomorrow at half past three!', 'Thanks for stopping by! Get home safe.'],
    dog: ['Oh my goodness, look at you! Who\'s a good pup?', 'Hi baby! Can I say hi? Oh, you\'re precious!', 'Aww, come here, sweet thing!'],
    kid: ['Hi sweetie! Do you like the dog signs?', 'Well hello there, little one! Want to see the scarecrows?'],
    thanks: name => `Thank you, ${name}! It'll look lovely on the door.`,
    poor: 'Oh hon, come back when you\'ve caught a few more fish. I\'ll keep one for you!',
  },
  buddy: {
    walk: ['Morning! Did I mention I broke the Pac-Man world record in 1982?', 'Walking keeps me sharp. Sharp enough to beat Pac-Man, 1982, world record.', 'This cane? Joystick elbow. Occupational hazard of a world champion.', 'Three laps! That\'s like clearing three mazes. Which I did. In 1982.'],
    craft: ['I cut the signs. Steady hands. Pac-Man hands. World record, 1982.', 'Why did the wreath go to school? To get well-rounded! Like a Pac-Man.', 'You know what this jigsaw reminds me of? 1982. World record. Pac-Man.'],
    setup: ['Stand back, these canopies have a mind of their own.', 'I set up faster in 1982. That was the year I broke the Pac-Man world record.'],
    booth: ['Wreaths! Get your wreaths! Hand made, foot approved!', 'Hey there! Did you know I hold the 1982 Pac-Man world record?', 'Psst! Ask me about Pac-Man. Go on. Ask me.', 'Why don\'t wreaths ever get lost? They always come full circle!', 'These signs are so good, even the ghosts would stop to look. Pac-Man ghosts. I beat them all in 1982.', 'Wakka wakka wakka! That\'s Pac-Man for "buy a wreath".', 'I ate four ghosts in one power pellet. 1982. Look it up.', 'Step right up! Carol made them, I carried them.'],
    pack: ['Game over for today! Insert coin tomorrow at 3:30.', 'Packing up faster than I cleared level 256. Well, almost.'],
    call: ['Hey! Over here! Wreaths!', 'Nice day for a wreath!', 'Did somebody say Pac-Man champion? That\'s me!', 'Come say hi to Carol!'],
  },
};

export function createBuddyCarol(ctx) {
  const { scene, colliders, ui, audio, player, net, npcs, house } = ctx;
  const H = homeOf();
  if (!H || !routes()) return null;
  loadCss('/css/carol.css');
  const root = new THREE.Group(); root.name = 'buddy-carol'; scene.add(root);
  const ATL = toon('#ffffff').clone(); ATL.map = atlasTexture(); ATL.name = 'carol-atlas';
  const GRIDMAT = toon('#ffffff').clone(); GRIDMAT.map = gridTexture(); GRIDMAT.alphaTest = 0.5; GRIDMAT.side = THREE.DoubleSide; GRIDMAT.name = 'carol-gridwall';
  let sales = [], door = null;

  // ================================================================ the garage, the drive
  const garage = buildGarage();
  // ================================================================ the pickup
  const truck = buildTruck();
  // ================================================================ the booth
  const booth = buildBooth();
  // ================================================================ the people
  const VOICE = { buddy: voiceOf('buddy', NPCS.buddy.voice), carol: voiceOf('carol', NPCS.carol.voice) };
  const buddy = makePerson('buddy', lookOf('buddy', NPCS.buddy.look));
  let carolDay = null, carol = null;
  const dressCarol = day => {
    if (carolDay === day && carol) return;
    carolDay = day;
    const outfit = CAROL_OUTFITS[((day % CAROL_OUTFITS.length) + CAROL_OUTFITS.length) % CAROL_OUTFITS.length];
    const { floral, ...wear } = outfit;
    const look = mergeLook({ ...NPCS.carol.look, ...wear }, savedLook('carol'));
    if (carol) { carol.tag.remove(); scene.remove(carol.h.root); carol.h.dispose?.(); }
    carol = makePerson('carol', look);
    if (floral && !savedLook('carol')?.shirt) addFloral(carol.h, look);
    carol.outfit = outfit;
  };
  buddy.cane = addCane(buddy.h);
  // the visitor (one at a time, one of the town's residents), built when needed
  let visitor = null;

  // ================================================================ door wreaths
  const doorMeshes = new Map(); // house index -> mesh
  let doorsAt = -1e9, doorsKey = '';
  const brenDoor = buildBrenelandDoor();

  // ---------------------------------------------------------------- the server's wreath state
  net.on('wreaths', m => {
    sales = Array.isArray(m.sales) ? m.sales : [];
    door = m.door || null;
    brenDoor.set(door);
    doorsAt = -1e9;
    if (m.sold) {
      const p = carol?.h.root.position;
      if (p && carol.h.root.visible) speak('carol', LINES.carol.thanks(m.sold.name || 'hon'));
      if (p) audio.play?.('till', TRIPOD[0], terrainHeight(TRIPOD[0], TRIPOD[1]) + 1, TRIPOD[1]);
    }
  });
  let buyWait = null;
  net.on('wreath-buy', m => {
    if (buyWait) { clearTimeout(buyWait); buyWait = null; }
    cardNote(m.ok ? 'Sold! It\'s hanging on Breneland\'s front door.' : '');
    if (m.ok) {
      ui.toast('Carol wraps it up: your wreath is on Breneland\'s front door!', 3600); audio.ui?.('chime');
      setTimeout(hideCard, 1400);
    } else if (m.why === 'fish') {
      ui.toast(`You need ${WREATH_PRICE} fish for a wreath (you have ${m.fish ?? 0}). The fish are biting off Kevin's pier!`, 4200); audio.ui?.('blip');
      speak('carol', LINES.carol.poor); hideCard();
    } else {
      ui.toast(m.why === 'shut' ? 'Carol\'s stand is closed right now. Back at 3:30!' : m.why === 'far' ? 'Step up to the stand to buy it.' : 'One moment, Carol is counting fish.', 3000); audio.ui?.('blip');
    }
  });

  // ---------------------------------------------------------------- the buy card
  const card = el('div', 'carol-card panel', '', { hidden: '', role: 'dialog', 'aria-label': 'Wreaths by Mama Carol' });
  const cTitle = el('div', 'carol-title', 'Wreaths by Mama Carol'), cSub = el('div', 'carol-sub', 'The wreath on the stand. Bought ones hang on Breneland\'s front door for everyone.');
  const cPic = el('canvas', 'carol-pic'); cPic.width = cPic.height = 160;
  const cName = el('div', 'carol-name'), cPrice = el('div', 'carol-price', `${WREATH_PRICE} fish`), cNote = el('div', 'carol-note');
  const cBuy = el('button', 'btn primary', `Buy for ${WREATH_PRICE} fish`), cNo = el('button', 'btn', 'Not now');
  const btns = el('div', 'carol-btns'); btns.append(cBuy, cNo);
  card.append(cTitle, cSub, cPic, cName, cPrice, cNote, btns);
  ctx.hud.append(card);
  let cardDesign = null, myFish = 0;
  net.on('inv', m => { if (typeof m.fish === 'number') myFish = m.fish; });
  function cardNote(s) { cNote.textContent = s; }
  function showCard(design) {
    cardDesign = design;
    const g = cPic.getContext('2d'); g.clearRect(0, 0, 160, 160); g.drawImage(wreathIcon(design, 160), 0, 0);
    cName.textContent = DESIGNS[design].name;
    cardNote(myFish >= WREATH_PRICE ? `You have ${myFish} fish.` : `You have ${myFish} fish. Carol's price is ${WREATH_PRICE}.`);
    card.hidden = false; player.controls = false; audio.ui?.('chime');
    speak('carol', 'Ooh, that one\'s a favorite. Want it for your front door, hon?');
    cBuy.focus();
  }
  function hideCard() { if (card.hidden) return; card.hidden = true; if (ctx.playing) player.controls = true; }
  function buy() {
    if (cardDesign === null || buyWait) return;
    if (myFish < WREATH_PRICE) { ui.toast(`You need ${WREATH_PRICE} fish for a wreath (you have ${myFish}). The fish are biting off Kevin's pier!`, 4200); audio.ui?.('blip'); speak('carol', LINES.carol.poor); hideCard(); return; }
    cardNote('Carol is wrapping it up...');
    net.send({ t: 'wreath-buy', design: cardDesign });
    buyWait = setTimeout(() => { buyWait = null; cardNote('No answer from the till. Try again in a moment.'); }, 5000);
  }
  cBuy.onclick = buy; cNo.onclick = hideCard;

  // ================================================================ speech
  const spoken = new Set();
  function speak(who, line, secs = 4) {
    const P = who === 'buddy' ? buddy : carol;
    if (!P || !P.h.root.visible) return;
    const q = P.h.root.position;
    ui.say(P.h.root, line, secs, 2.35 * (P.h.root.scale.y || 1));
    audio.speak?.(q.x, q.y + 1.6, q.z, line, VOICE[who]);
    P.h.say?.(0.8 + line.length * 0.04);
  }
  const once = (key, fn) => { if (spoken.has(key)) return; spoken.add(key); if (spoken.size > 300) spoken.clear(); fn(); };
  const pick = (list, ...salt) => list[Math.floor(hash01(...salt) * list.length)];
  const localPick = list => list[Math.floor(Math.random() * list.length)];   // (talking to you is local, so random is fine)

  // ================================================================ per frame
  let F = null, lastDay = null, near = 0;
  const local = { buddy: null, carol: null };
  const tmpV = new THREE.Vector3();
  const api = {
    get state() { return F; }, booth, truck, garage, brenDoor, doorMeshes,
    people: () => ({ buddy: buddy.h, carol: carol?.h, visitor: visitor?.h || null }),
    visitor: () => visitor, sales: () => sales, door: () => door,
    familyAt: t => familyAt(t, sales), tripod: t => tripodAt(t ?? net.serverNow() / 1000, sales),
    doorWreaths: t => doorWreaths(t ?? net.serverNow() / 1000, sales), boothDay,
    arrangement: () => booth.arr, refreshDoors: () => { doorsAt = -1e9; },
  };

  let override;
  function update(dt, now) {
    const t = net.serverNow() / 1000;
    const ov = hourOverride();
    if (ov !== override) { if (override !== undefined) { resetBuddyCaches(); doorsAt = -1e9; } override = ov; }
    F = familyAt(t, sales);
    if (!F) return;
    const day = boothDay(t);
    if (day !== lastDay) { lastDay = day; dressCarol(day); booth.dress(day); }
    const cam = ctx.camera.position;
    near = Math.hypot(cam.x - BOOTH.x, cam.z - BOOTH.z);
    booth.frame(F, t, near);
    garage.frame(F, cam);
    truck.frame(F, dt);
    placePerson(buddy, F.buddy, dt, now, 'buddy');
    placePerson(carol, F.carol, dt, now, 'carol');
    visitorFrame(F, t, dt, now);
    carolNotices(F, now);
    chatter(F, t);
    // the doors: recomputed every half minute (and whenever a sale arrives)
    if (t - doorsAt > 30) { doorsAt = t; refreshDoors(t); }
  }

  function placePerson(P, s, dt, now, who) {
    const r = P.h.root;
    if (!s || s.hidden) { if (r.visible) r.visible = false; P.placed = false; return; }
    r.visible = true;
    let x = s.x, z = s.z;
    if (s.seatY && !s.chair) { x -= Math.sin(s.yaw) * 0.12; z -= Math.cos(s.yaw) * 0.12; }
    if (!P.placed || Math.hypot(r.position.x - x, r.position.z - z) > 5) r.position.set(x, 0, z);
    else { const k = Math.min(1, dt * 10); r.position.x += (x - r.position.x) * k; r.position.z += (z - r.position.z) * k; }
    // (seat-height: in his camp chair he stands on the ground under his feet, the chair's seat over the booth's ground it stands on: the
    // slope put him 3.4 cm into the seat and his feet over the grass)
    let lift = 0;
    if (s.chair) { const gB = terrainHeight(BOOTH.x, BOOTH.z), gF = Math.min(gB, terrainHeight(r.position.x + Math.sin(s.yaw) * 0.3, r.position.z + Math.cos(s.yaw) * 0.3)); r.position.y = gF; lift = gB - gF; }
    else r.position.y = streetY(r.position.x, r.position.z);
    let yaw = s.yaw, anim = s.anim, speed = s.speed;
    const L = local[who];
    if (L && now < L.until && speed < 0.3) { anim = s.seatY ? (L.anim === 'pet' ? 'wave' : L.anim) : L.anim; if (L.face) yaw = Math.atan2(L.face[0] - r.position.x, L.face[1] - r.position.z); }
    else if (L && now >= L.until) local[who] = null;
    r.rotation.y = !P.placed ? yaw : angleLerp(r.rotation.y, yaw, Math.min(1, dt * 7));
    P.placed = true;
    P.h.params.seatY = s.seatY ? (s.seatY + lift) / (r.scale.y || 1) : 0;
    // in the camp chair: the armrests' line and how far below his shoulder his elbow rests (body units)
    P.h.params.chair = s.chair ? (P.chairFit || (P.chairFit = { armX: CHAIR.W / (r.scale.y || 1), elbowDrop: 0.19 })) : null;
    if (P.cane) P.cane.visible = !!s.cane;
    if (P.box) P.box.visible = s.carry === 'box';
    if (s.seatY && (!anim || anim === 'idle')) anim = 'sit';
    if (Math.abs(ctx.camera.position.x - r.position.x) + Math.abs(ctx.camera.position.z - r.position.z) < 140) P.h.update(dt, now, speed, anim === 'idle' ? null : anim);
  }

  // ---- the visitor: one of the twelve residents, built while they visit and freed after
  function visitorFrame(F, t, dt, now) {
    const v = F.visitor;
    if (!v) { if (visitor && now - visitor.seen > 2) freeVisitor(); else if (visitor) visitor.h.root.visible = false; return; }
    // On a phone a visitor outside the town cast (town-cast.js) is built only near the camera (KEEP_NEAR), so the cast's cap
    // holds in booth hours too. The visit itself is shared and goes on either way. A computer builds them within 110 m.
    const cp = ctx.camera.position, vd = Math.abs(cp.x - v.x) + Math.abs(cp.z - v.z);
    if (castOn() && !castAt(t).has('town:' + NPCS[v.npc].name) && vd > KEEP_NEAR) { if (visitor) freeVisitor(); return; }
    if (!visitor || visitor.npc !== v.npc) {
      if (near > 110) return;   // (nobody to see them: do not build anyone)
      freeVisitor();
      const P = makePerson(v.npc, lookOf(v.npc, NPCS[v.npc].look), tagOf(v.npc, NPCS[v.npc].name));
      P.npc = v.npc; P.wreath = new THREE.Mesh(wreathGeometry(0).geo, VC); P.wreath.scale.setScalar(0.85); P.wreath.position.set(0.05, -0.32, 0.08); P.wreath.rotation.y = Math.PI / 2; P.wreath.visible = false; P.h.handR.add(P.wreath); P.wDesign = 0;
      visitor = P;
    }
    visitor.seen = now;
    placePerson(visitor, v, dt, now, 'visitor');
    const want = v.carry === 'wreath' ? (v.design ?? 0) : null;
    if (want !== null && want !== visitor.wDesign) { visitor.wreath.geometry = wreathGeometry(want).geo; visitor.wDesign = want; }
    visitor.wreath.visible = want !== null;
    // their words and Carol's, once per station (shared moments: every client says the same thing at the same time)
    const vis = v.visit, u = t - vis.a;
    vis.stations.forEach((s, i) => {
      if (u > s.t0 && u < s.t0 + 4) once('v' + vis.a + ':' + i, () => {
        if (i === 0) speak('carol', `Hi ${v.name}! Good to see you, hon.`, 3.2);
        else if (vis.buy && i === vis.stations.length - 1) setTimeout(() => speak('carol', LINES.carol.thanks(v.name), 3.5), 2500);
        else if (hash01('bc-vline', vis.a, i) < 0.6) sayVisitor(pick(['These are gorgeous, Carol!', 'Is that one a basset hound? I love it.', 'How do you make the bows?', 'My sister needs one of these.', 'Hi Buddy! Still the champ?'], 'bc-vl', vis.a, i));
      });
    });
  }
  function sayVisitor(line) { if (!visitor || !visitor.h.root.visible) return; const q = visitor.h.root.position; ui.say(visitor.h.root, line, 3.5, 2.3); audio.speak?.(q.x, q.y + 1.6, q.z, line, voiceOf(visitor.npc, NPCS[visitor.npc].voice) || { pitch: 160 }); }
  function freeVisitor() { if (!visitor) return; visitor.tag.remove(); scene.remove(visitor.h.root); visitor.h.dispose?.(); visitor = null; }

  // ---- Carol lights up for dogs and kids nearby (a local reaction to what this screen sees)
  let noticeAt = 0;
  function carolNotices(F, now) {
    if (!carol || !carol.h.root.visible || (F.phase !== 'booth' && F.phase !== 'walk') || now < noticeAt) return;
    const c = carol.h.root.position;
    let dog = null;
    for (const d of npcs.npcs) if (d.kind === 'dog' && d.body.root.visible && Math.hypot(d.body.root.position.x - c.x, d.body.root.position.z - c.z) < 5) { dog = d.body.root.position; break; }
    let kid = null;
    if (!dog) {
      const small = ch => ch && ch.opts && (ch.opts.scale < 0.9 || ch.opts.height < 0.25);
      for (const r of ctx.remotes.map.values()) if (small(r.ch) && Math.hypot(r.ch.root.position.x - c.x, r.ch.root.position.z - c.z) < 5) { kid = r.ch.root.position; break; }
      if (!kid && small(player.character) && Math.hypot(player.pos.x - c.x, player.pos.z - c.z) < 5) kid = player.pos;
      for (const f of ctx.features || []) if (!kid && f.name === 'scouts' && f.bodies) for (const b of f.bodies()) if (Math.hypot(b.x - c.x, b.z - c.z) < 5) { kid = b; break; }
    }
    if (!dog && !kid) return;
    noticeAt = now + 25;
    const at = dog || kid;
    local.carol = { anim: dog ? 'pet' : 'wave', until: now + (dog ? 6 : 3.5), face: [at.x, at.z] };
    speak('carol', localPick(dog ? LINES.carol.dog : LINES.carol.kid), 3.5);
  }

  // ---- what they call out: shared beats (the same line at the same moment on every screen), only spoken near the booth
  function chatter(F, t) {
    if (near > 32 || F.phase !== 'booth') return;
    const k = Math.floor(t / 16), u = t - k * 16;
    if (u < 3 || u > 5) return;
    if (hash01('bc-bcall', k) < 0.3) once('b' + k, () => speak('buddy', pick(LINES.buddy.booth, 'bc-bl', k), 4.2));
    else if (hash01('bc-ccall', k) < 0.18) once('c' + k, () => speak('carol', pick(LINES.carol.booth, 'bc-cl', k), 4));
  }
  // and Buddy hails you when you pass by (local)
  let hailAt = 0;
  function hail(now) {
    if (F && F.phase === 'walk' && now >= hailAt && carol?.h.root.visible) {   // on their walk they wave and say hi to whoever they pass
      const c = carol.h.root.position, d = Math.hypot(player.pos.x - c.x, player.pos.z - c.z);
      if (d < 5) {
        hailAt = now + 45;
        local.carol = { anim: 'wave', until: now + 2.5, face: [player.pos.x, player.pos.z] };
        local.buddy = { anim: 'wave', until: now + 2.5, face: [player.pos.x, player.pos.z] };
        speak('carol', localPick(['Morning, hon!', 'Good morning, sweetie!', 'Hi there! Beautiful day!']), 3);
        setTimeout(() => speak('buddy', localPick(['Morning! Ask me about Pac-Man sometime.', 'Howdy! 1982, Pac-Man, world record. Just saying.', 'Morning! Lovely day for a lap.']), 3.2), 1600);
      }
      return;
    }
    if (!F || F.phase !== 'booth' || now < hailAt) return;
    const b = buddy.h.root.position, d = Math.hypot(player.pos.x - b.x, player.pos.z - b.z);
    if (d < 11 && d > 3) { hailAt = now + 40; local.buddy = { anim: 'wave', until: now + 2.5, face: [player.pos.x, player.pos.z] }; speak('buddy', localPick(LINES.buddy.call), 3); }
  }

  function talk(who) {
    const phase = F.phase === 'leave' || F.phase === 'setup' ? 'setup' : F.phase === 'pack' ? 'pack' : F.phase === 'craft' ? 'craft' : F.phase === 'walk' ? 'walk' : 'booth';
    const P = who === 'buddy' ? buddy : carol, now = performance.now() / 1000;
    local[who] = { anim: who === 'buddy' && F.buddy.seatY ? 'laugh' : 'talk', until: now + 3.5, face: [player.pos.x, player.pos.z] };
    void P;
    speak(who, localPick(LINES[who][phase]), 4.5);
    player.playEmote?.('wave', now);
  }

  // ================================================================ doors
  function refreshDoors(t) {
    const W = doorWreaths(t, sales);
    const key = [...W.entries()].map(([h, w]) => h + ':' + w.design).sort().join('|');
    if (key === doorsKey) return;
    doorsKey = key;
    for (const [hi, m] of doorMeshes) if (!W.has(hi)) { root.remove(m); doorMeshes.delete(hi); }
    for (const [hi, w] of W) {
      const h = TOWN_HOUSES[hi]; if (!h) continue;
      let m = doorMeshes.get(hi);
      if (!m) {
        m = new THREE.Group(); m.name = 'door-wreath';
        const fz = h.z + h.facing * (h.d / 2 + 0.06);
        m.position.set(h.x, 0.3 + 1.72, fz + h.facing * 0.2); m.rotation.y = h.facing > 0 ? 0 : Math.PI;
        root.add(m); doorMeshes.set(hi, m);
      }
      if (m.userData.design !== w.design) { m.clear(); m.add(wreathMesh(w.design, 0.75)); m.userData.design = w.design; m.userData.npc = w.npc; }
    }
  }
  function buildBrenelandDoor() {
    const g = new THREE.Group(); g.name = 'breneland-door-wreath'; g.visible = false;
    const leaf = house?.door;
    const dw = HOUSE.door.width / 2;
    g.position.set(dw, HOUSE.door.height * 0.72, -0.1); g.rotation.y = Math.PI;
    if (leaf) leaf.add(g); else { g.position.set(0, HOUSE.floorY + HOUSE.door.height * 0.72, HOUSE.door.z - 0.1); root.add(g); }
    const c = document.createElement('canvas'); c.width = 256; c.height = 72;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const tagMat = new THREE.MeshBasicMaterial({ map: tex, fog: true });
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.096), tagMat); tag.position.set(0.14, -0.42, 0.06); tag.rotation.z = -0.12; tag.name = 'wreath-tag';
    let cur = null;
    return {
      group: g, tag,
      get design() { return cur ? cur.design : null; }, get name() { return cur ? cur.name : null; },
      set(d) {
        cur = d && Number.isFinite(d.design) ? d : null;
        g.visible = !!cur;
        if (!cur) return;
        g.clear(); g.add(wreathMesh(cur.design, 0.85)); g.add(tag);
        const k = c.getContext('2d');
        k.fillStyle = '#fff6dc'; k.fillRect(0, 0, 256, 72); k.strokeStyle = '#b8562e'; k.lineWidth = 5; k.strokeRect(3, 3, 250, 66);
        k.fillStyle = '#3a2412'; k.textAlign = 'center'; k.textBaseline = 'middle';
        const fit = (s, w, px) => { let p = px; k.font = `700 ${p}px "Fredoka", sans-serif`; while (k.measureText(s).width > w && p > 10) { p -= 2; k.font = `700 ${p}px "Fredoka", sans-serif`; } };
        const who = (cur.name || 'Breneland') + '\'s wreath';
        fit(who, 236, 26); k.fillText(who, 128, 24);
        k.font = '500 20px "Fredoka", sans-serif'; k.fillText('from Mama Carol', 128, 52);
        tex.needsUpdate = true;
      },
    };
  }

  // ================================================================ builders
  // A wreath mesh of a design (its plaque word from the atlas), facing +z, at scale s
  function wreathMesh(design, s = 1) {
    const g = new THREE.Group();
    const e = wreathGeometry(design);
    const m = new THREE.Mesh(e.geo, VC); g.add(m);
    if (e.plaque) g.add(plaqueMesh(e.plaque));
    g.scale.setScalar(s);
    return g;
  }
  const plaqueGeos = new Map();
  function plaqueMesh(p) {
    let geo = plaqueGeos.get(p.word);
    if (!geo) { geo = uvQuad(p.w, p.h, 'word' + p.word); plaqueGeos.set(p.word, geo); }
    const m = new THREE.Mesh(geo, ATL); m.position.set(0, p.y, p.z + 0.004); return m;
  }
  function uvQuad(w, h, cell) {
    const g = new THREE.PlaneGeometry(w, h), [u0, v0, u1, v1] = cellUV(cell), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    return g;
  }

  function makePerson(id, look, tagText) {
    const h = new Human({ ...look });
    h.root.visible = false; scene.add(h.root);
    const tag = ui.nameTag(h.root, tagText || tagOf(id, NPCS[id].name), '#ffffff'); tag.max = 16; tag.fade = 11;
    const P = { id, h, tag, placed: false };
    if (id === 'carol') P.box = addBox(h);
    return P;
  }
  // a prop from Batcher pieces as ONE vertex-coloured mesh that rides a hand or the chest (rigid-merge leaves held things alone)
  function prop(build, name) { const b = new Batcher({ vertexColors: true }); build(b); const m = b.build(new THREE.Group(), name)[0]; m.matrixAutoUpdate = true; m.castShadow = true; return m; }
  function addCane(h) {
    const g = prop(b => {
      b.add(GEO.cyl6, '#6b4424', { y: -0.42, sx: 0.014, sy: 0.84, sz: 0.014 });
      b.add(new THREE.TorusGeometry(0.05, 0.014, 5, 10, Math.PI), '#6b4424', { x: 0.05 });
      b.add(GEO.cyl6, '#2b2b2f', { y: -0.84, sx: 0.018, sy: 0.04, sz: 0.018 });
    }, 'buddy-cane');
    g.position.set(0, -0.02, 0.05); g.rotation.x = 0.12; g.visible = false; g.userData.cane = true; g.userData.upright = true; // (stands whatever the arm does: human.js)
    h.handR.add(g);
    return g;
  }
  function addBox(h) {
    const g = prop(b => {
      b.add(GEO.box, '#c9a26a', { sx: 0.38, sy: 0.24, sz: 0.3 });
      b.add(GEO.box, '#b38a52', { y: 0.12, sx: 0.39, sy: 0.02, sz: 0.31 });
      for (let i = 0; i < 3; i++) b.add(GEO.ico0, ['#c8302c', '#1f1f24', '#f07a1e'][i], { x: -0.1 + i * 0.1, y: 0.16, sx: 0.06, sy: 0.04, sz: 0.03 });
    }, 'carol-box');
    g.position.set(0, 0.1, 0.3); g.visible = false;
    h.chest.add(g);
    return g;
  }
  // the coral top's floral print: little flowers laid on the torso (one small extra mesh)
  function addFloral(h, look) {
    const D = h.dims, p = new Batcher({ vertexColors: true, castShadow: false });
    const rnd = (i, k) => hash01('floral', i, k);
    const T = D.torsoTop, cols = ['#f9b04a', '#ffd9a0', '#c8502c', '#f6e08a'];
    for (let i = 0; i < 22; i++) {
      const side = i % 2 ? 1 : -1, y = 0.02 + rnd(i, 0) * (T - 0.16), a = (rnd(i, 1) - 0.5) * 2.2;
      const rx = D.wT * 0.98 * D.shape.fx(y), rz = D.dT * 1.02;
      const x = Math.sin(a) * rx, z = side * Math.cos(a) * rz;
      p.add(GEO.ico0, cols[i % cols.length], { x, y, z, sx: 0.026, sy: 0.026, sz: 0.008, ry: Math.atan2(x, z) });
    }
    const tmp = new THREE.Group(); const ms = p.build(tmp, 'floral');
    for (const m of ms) { m.matrixAutoUpdate = true; h.chest.add(m); }
    void look;
  }

  function buildGarage() {
    const g = new THREE.Group(); g.name = 'carol-garage'; root.add(g);
    const G = H.garage, y0 = groundHeight(G.cx, (G.z0 + G.z1) / 2), WALLC = H.house ? '#e8dcc4' : '#e8dcc4', h = 2.7;
    const b = new Batcher({ vertexColors: true }), f = new Batcher({ vertexColors: true, castShadow: false });
    const t = 0.15;
    // the drive and the floor
    b.boxMinMax(H.drive.x0, 0.3, H.drive.z0, H.drive.x1, 0.385, H.drive.z1, '#a9a39a');
    b.boxMinMax(G.x0 + 0.01, 0.3, G.z0 + 0.01, G.x1 - 0.01, y0 + 0.04, G.z1 - 0.01, '#b9b3a8'); // (a hair inside the walls: level with their faces, the floor's edge flickered)
    // walls (the east one against the house), a gable roof running front to back, the door frame
    b.boxMinMax(G.x0, y0, G.z0, G.x0 + t, y0 + h, G.z1, WALLC);
    b.boxMinMax(G.x1 - t, y0, G.z0, G.x1, y0 + h, G.z1, WALLC);
    b.boxMinMax(G.x0, y0, G.z1 - t, G.x1, y0 + h, G.z1, WALLC);
    b.boxMinMax(G.x0, y0 + 2.35, G.z0, G.x1, y0 + h, G.z0 + t, WALLC);       // over the door
    const rise = 0.9, half = (G.x1 - G.x0) / 2 + 0.3, len = G.z1 - G.z0 + 0.5, slope = Math.atan2(rise, half);
    for (const s of [-1, 1]) b.add(GEO.box, '#5b6b86', { x: G.cx + s * half / 2, y: y0 + h + rise / 2, z: (G.z0 + G.z1) / 2, sx: Math.hypot(half, rise) + 0.1, sy: 0.14, sz: len, rz: -s * slope });
    const tri = new THREE.Shape([new THREE.Vector2(-half + 0.3, 0), new THREE.Vector2(half - 0.3, 0), new THREE.Vector2(0, rise - 0.05)]);
    const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.12, bevelEnabled: false });
    b.add(tg, WALLC, { x: G.cx, y: y0 + h, z: G.z0 - 0.01 }); b.add(tg, WALLC, { x: G.cx, y: y0 + h, z: G.z1 - 0.12 });
    // (the frame a hair proud of the house's foundation, which is level with the garage's front, and its top bar's ends inside the posts: they flickered)
    f.boxMinMax(G.x0 - 0.05, y0, G.z0 - 0.07, G.x0 + 0.2, y0 + 2.42, G.z0 + 0.02, '#fbf7ee'); f.boxMinMax(G.x1 - 0.2, y0, G.z0 - 0.07, G.x1 + 0.05, y0 + 2.42, G.z0 + 0.02, '#fbf7ee');
    f.boxMinMax(G.x0 + 0.01, y0 + 2.34, G.z0 - 0.07, G.x1 - 0.01, y0 + 2.46, G.z0 + 0.02, '#fbf7ee');
    // inside: the workbench along the back, the pegboard over it, wreath forms on hooks, ribbon spools on a rack, shelves
    const bz = G.z1 - t - 0.35;
    b.boxMinMax(G.x0 + 0.3, y0 + 0.88, bz - 0.35, G.x1 - 0.3, y0 + 0.95, bz + 0.35, '#b98a5a');
    for (const x of [G.x0 + 0.4, G.x1 - 0.4]) for (const z of [bz - 0.28, bz + 0.28]) b.boxMinMax(x - 0.04, y0, z - 0.04, x + 0.04, y0 + 0.88, z + 0.04, '#7a5232');
    b.boxMinMax(G.x0 + 0.35, y0 + 0.3, bz - 0.3, G.x1 - 0.35, y0 + 0.34, bz + 0.3, '#8a6240');      // the low shelf
    b.boxMinMax(G.x0 + 0.4, y0 + 1.15, G.z1 - t - 0.04, G.x1 - 0.4, y0 + 2.15, G.z1 - t, '#d9b98a');  // the pegboard
    for (let i = 0; i < 12; i++) for (let j = 0; j < 4; j++) f.add(GEO.box, '#8a6a44', { x: G.x0 + 0.55 + i * 0.29, y: y0 + 1.28 + j * 0.25, z: G.z1 - t - 0.05, sx: 0.02, sy: 0.02, sz: 0.01 });
    const tools = ['#c8302c', '#3f6fa8', '#f2c230', '#5a5560', '#2f7a3f'];
    for (let i = 0; i < 5; i++) f.add(GEO.box, tools[i], { x: G.x0 + 0.7 + i * 0.32, y: y0 + 1.75 + (i % 2) * 0.1, z: G.z1 - t - 0.07, sx: 0.05, sy: 0.24, sz: 0.03 });
    for (let i = 0; i < 3; i++) f.add(torusShared(0.2, 0.012), '#8a8f96', { x: G.x1 - 1.6 + i * 0.45, y: y0 + 1.75, z: G.z1 - t - 0.06 });   // bare wire forms
    for (let i = 0; i < 2; i++) f.add(torusShared(0.16, 0.035), '#8f6844', { x: G.x1 - 1.35 + i * 0.45, y: y0 + 1.3, z: G.z1 - t - 0.07 });  // grapevine forms
    // the ribbon rack on the west wall: a dowel with fat spools
    b.boxMinMax(G.x0 + t, y0 + 1.5, G.z0 + 1.6, G.x0 + t + 0.25, y0 + 1.53, G.z0 + 4.2, '#8a6240');
    const spool = ['#c8302c', '#f4f2ea', '#1f1f24', '#f07a1e', '#2f7a3f', '#7a3fa8', '#f2c230', '#6fb8ff', '#ff8fb8'];
    for (let i = 0; i < 9; i++) f.add(GEO.cyl12, spool[i], { x: G.x0 + t + 0.14, y: y0 + 1.66, z: G.z0 + 1.8 + i * 0.27, sx: 0.11, sy: 0.08, sz: 0.11, rx: Math.PI / 2 });
    b.boxMinMax(G.x0 + t, y0 + 1.95, G.z0 + 1.5, G.x0 + t + 0.35, y0 + 1.99, G.z0 + 4.3, '#8a6240');
    for (let i = 0; i < 4; i++) b.boxMinMax(G.x0 + t + 0.02, y0 + 1.99, G.z0 + 1.6 + i * 0.68, G.x0 + t + 0.32, y0 + 2.25, G.z0 + 2.15 + i * 0.68, ['#c9a26a', '#d4b48a', '#b38a52', '#c9a26a'][i]); // supply boxes
    // on the bench: a wreath in progress, ribbon, a glue gun, a mug of coffee
    f.add(torusShared(0.24, 0.05), '#b89a6a', { x: G.cx - 0.6, y: y0 + 0.99, z: bz, rx: Math.PI / 2 });
    f.add(GEO.cyl12, '#c8302c', { x: G.cx + 0.3, y: y0 + 1.0, z: bz + 0.1, sx: 0.09, sy: 0.07, sz: 0.09 });
    f.add(GEO.box, '#3a3f47', { x: G.cx + 0.75, y: y0 + 1.0, z: bz - 0.1, sx: 0.06, sy: 0.08, sz: 0.2 });
    f.add(GEO.cyl8, '#f4f2ea', { x: G.cx + 1.2, y: y0 + 1.01, z: bz + 0.15, sx: 0.045, sy: 0.1, sz: 0.045 });
    // a bulb on the ceiling
    f.add(GEO.sphere, lampGlow('#ffe7a8'), { x: G.cx, y: y0 + 2.5, z: (G.z0 + G.z1) / 2, sx: 0.08, sy: 0.1, sz: 0.08 });
    b.build(g, 'carol-garage'); f.build(g, 'carol-garage-details');
    // two finished wreaths on the east wall (the same designs as the booth's) and one on the house's front door
    const ws = new THREE.Group(); ws.name = 'garage-wreaths'; g.add(ws);
    [[3, 0], [15, 1]].forEach(([d, i]) => { const m = wreathMesh(d, 0.8); m.position.set(G.x1 - t - 0.06, y0 + 1.6, G.z0 + 2.0 + i * 1.3); m.rotation.y = -Math.PI / 2; ws.add(m); });
    const own = wreathMesh(1, 0.75); own.position.set(H.house.x, 0.3 + 1.72, H.fz - 0.26); own.rotation.y = Math.PI; g.add(own);
    // the roll-up door: panels that slide up under the roof
    const door = new THREE.Group(); door.name = 'garage-door'; g.add(door);
    const dp = new Batcher({ vertexColors: true });
    const dh = 2.32, dwid = G.x1 - G.x0 - 0.3;
    for (let k = 0; k < 4; k++) dp.add(GEO.box, '#f4f0e6', { y: dh * (k + 0.5) / 4, sx: dwid, sy: dh / 4 - 0.025, sz: 0.06 });
    for (let k = 0; k < 4; k++) for (let c = 0; c < 4; c++) dp.add(GEO.box, '#e2dccd', { x: -dwid / 2 + dwid * (c + 0.5) / 4, y: dh * (k + 0.5) / 4, z: -0.035, sx: dwid / 4 - 0.12, sy: dh / 4 - 0.16, sz: 0.012 });
    dp.add(GEO.box, '#9aa0a8', { y: 0.35, z: -0.045, sx: 0.3, sy: 0.04, sz: 0.04 }); // (the handle's back inside the panel, not level with its face)
    dp.build(door, 'garage-door-panels').forEach(m => { m.matrixAutoUpdate = true; });
    door.position.set(G.cx, y0, G.z0 + 0.08);
    // colliders: the walls; the bench; the door while it is down
    colliders.push({ type: 'box', minX: G.x0 - 0.05, maxX: G.x0 + t + 0.05, minZ: G.z0, maxZ: G.z1 });
    colliders.push({ type: 'box', minX: G.x0, maxX: G.x1, minZ: G.z1 - t - 0.75, maxZ: G.z1 + 0.05 });
    colliders.push({ type: 'box', minX: G.x1 - t - 0.05, maxX: G.x1 + 0.05, minZ: G.z0, maxZ: G.z1 });
    const doorCol = { type: 'box', minX: G.x0, maxX: G.x1, minZ: G.z0 - 0.05, maxZ: G.z0 + 0.25 };
    colliders.push(doorCol);
    shadows(g);
    let lastOpen = -1;
    return {
      group: g, door,
      get open() { return lastOpen; },
      frame(F, cam) {
        const o = F.garage.door;
        if (o !== lastOpen) { door.position.y = y0 + o * 2.2; door.position.z = G.z0 + 0.08 + o * 0.6; door.scale.y = 1 - o * 0.85; lastOpen = o; doorCol.off = o > 0.6; }
        const far = Math.abs(cam.x - G.cx) + Math.abs(cam.z - G.z0) > 140;
        ws.visible = !far;
      },
    };
  }
  function torusShared(r, tt) { const k = r + ',' + tt; return torusShared.c?.[k] || ((torusShared.c ||= {})[k] = new THREE.TorusGeometry(r, tt, 5, 18)); }

  function buildTruck() {
    const g = new THREE.Group(); g.name = 'carol-truck'; root.add(g);
    const model = carParts('pickup');
    const b = new Batcher({ vertexColors: true }), lb = new Batcher({ vertexColors: true, castShadow: false });
    const wbs = [new Batcher({ vertexColors: true, receiveShadow: false }), new Batcher({ vertexColors: true, receiveShadow: false })];
    const ranges = {}, m = new THREE.Matrix4();
    let nv = 0;
    for (const p of model.parts) {
      partMatrix(p.o, m);
      if (p.wheel !== undefined) { wbs[p.wheel].add(p.geo, p.color, { matrix: m }); continue; }
      if (p.lamp || p.glass) {
        const name = p.lamp || 'glass', geo = p.geo.index ? p.geo.toNonIndexed() : p.geo, n = geo.attributes.position.count;
        (ranges[name] || (ranges[name] = [])).push(nv, n); nv += n;
        lb.add(p.geo, '#ffffff', { matrix: m });
        continue;
      }
      b.add(p.geo, p.color === 'body' ? TRUCK_BLUE : p.color === 'top' ? '#f6f0de' : p.color, { matrix: m });
    }
    // a cap of Carol's supplies in the bed: two crates and the folded canopies (bundles)
    b.add(GEO.box, '#d8d2c4', { y: 1.15, z: -1.3, sx: 1.2, sy: 0.32, sz: 0.5 });
    b.add(GEO.box, '#c9a26a', { x: -0.35, y: 1.2, z: -0.65, sx: 0.5, sy: 0.4, sz: 0.4 });
    b.build(g, 'carol-truck-body').forEach(x => { x.castShadow = true; x.receiveShadow = false; });
    const lamps = lb.build(g, 'carol-truck-lamps')[0];
    lamps.material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
    const col = lamps.geometry.attributes.color;
    const setLamp = (name, c) => { const r = ranges[name]; if (!r) return; for (let k = 0; k < r.length; k += 2) for (let v = r[k]; v < r[k] + r[k + 1]; v++) col.setXYZ(v, c[0], c[1], c[2]); };
    const axles = model.axles.map((az, ai) => { const roll = new THREE.Group(); roll.position.set(0, model.wheelR, az); g.add(roll); wbs[ai].build(roll, 'carol-truck-wheels'); return roll; });
    const col2 = { type: 'box', minX: 0, maxX: 0, minZ: 0, maxZ: 0, noCrowd: true, moves: true }; // (moves: collider-grid.js re-files it)
    colliders.push(col2);
    let wheel = 0, lampKey = '', lastV = 0;
    const out = {
      group: g,
      frame(F, dt) {
        const T = F.truck;
        g.position.set(T.x, streetY(T.x, T.z), T.z); g.rotation.y = T.yaw;
        wheel += (T.rev ? -1 : 1) * (T.v || 0) * dt / model.wheelR;
        for (const a of axles) a.rotation.x = wheel;
        const night = LIGHT.night > 0.4, brake = T.moving && (T.v || 0) < lastV - 0.02;
        lastV = T.v || 0;
        const key = [T.moving, night, brake, T.rev].join();
        if (key !== lampKey) {
          lampKey = key;
          setLamp('headL', T.moving && night ? [2.6, 2.45, 1.9] : [0.86, 0.84, 0.72]); setLamp('headR', T.moving && night ? [2.6, 2.45, 1.9] : [0.86, 0.84, 0.72]);
          const tail = brake ? [2.8, 0.3, 0.2] : T.moving && night ? [1.5, 0.22, 0.18] : [0.5, 0.14, 0.12];
          setLamp('tailL', tail); setLamp('tailR', tail);
          setLamp('revL', T.rev ? [2.4, 2.4, 2.2] : [0.8, 0.8, 0.78]); setLamp('revR', T.rev ? [2.4, 2.4, 2.2] : [0.8, 0.8, 0.78]);
          for (const n of ['indFL', 'indFR', 'indRL', 'indRR', 'indSL', 'indSR']) setLamp(n, [0.88, 0.56, 0.2]);
          setLamp('glass', night ? [0.24, 0.32, 0.5] : [0.6, 0.82, 0.93]);
          col.needsUpdate = true;
        }
        // parked: a box collider (it only ever parks square to the axes); moving: bodies() pushes you along
        const along = Math.abs(Math.sin(T.yaw)) > 0.7;
        col2.off = T.moving;
        if (!T.moving) { const hx = along ? 2.15 : 0.95, hz = along ? 0.95 : 2.15; col2.minX = T.x - hx; col2.maxX = T.x + hx; col2.minZ = T.z - hz; col2.maxZ = T.z + hz; }
      },
    };
    return out;
  }

  // ---------------------------------------------------------------- the booth (built once; the arrangement re-dressed daily)
  function buildBooth() {
    const gy = terrainHeight(BOOTH.x, BOOTH.z);
    const B = new THREE.Group(); B.name = 'carol-booth'; B.position.set(BOOTH.x, gy, BOOTH.z); B.rotation.y = BOOTH.yaw; root.add(B);
    const detail = new THREE.Group(); detail.name = 'carol-booth-detail'; B.add(detail);
    const stage = {}, pivots = {}, cols = {};
    const mk = (name, px = 0, pz = 0, parent = B) => { const s = new THREE.Group(); s.name = 'booth-' + name; s.position.set(px, 0, pz); parent.add(s); stage[name] = s; pivots[name] = [px, pz]; cols[name] = []; s.visible = false; return s; };
    for (const k of ['post', 'canopyL', 'canopyR', 'walls', 'table', 'banner', 'towerL', 'towerR', 'chair', 'tripod', 'lights']) mk(k, k === 'canopyL' ? -CW / 2 : k === 'canopyR' ? CW / 2 : 0, 0, ['banner', 'lights'].includes(k) ? detail : B);
    mk('wreaths', 0, 0, detail); mk('signs', 0, 0, detail);
    const L = (name, lx, lz, r) => { const [x, z] = boothXZ(lx, lz); const c = { type: 'circle', x, z, r, off: true }; colliders.push(c); cols[name].push(c); };
    const Lwall = (name, ax, az, bx, bz, r = 0.16) => { const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.3)); for (let i = 0; i <= n; i++) L(name, ax + (bx - ax) * i / n, az + (bz - az) * i / n, r); };
    const gq = [];
    const T = (s, buildFn, castShadow = true) => {
      const b = new Batcher({ vertexColors: true, castShadow }), tq = [];
      gq.length = 0; buildFn(b, tq); b.build(s, 'booth-' + s.name);
      if (tq.length) { const m = new THREE.Mesh(mergeGeometries(tq, false), ATL); m.name = s.name + '-print'; s.add(m); tq.forEach(q => q.dispose()); }
      if (gq.length) { const m = new THREE.Mesh(mergeGeometries(gq, false), GRIDMAT); m.name = s.name + '-grid'; m.castShadow = false; m.userData.noShadow = true; s.add(m); gq.forEach(q => q.dispose()); gq.length = 0; }
    };
    const quad = (tq, cell, w, h, o) => { const q = uvQuad(w, h, cell).toNonIndexed(); q.applyMatrix4(partMatrix(o)); tq.push(q); };
    // a white wire gridwall: the frame as thin bars, the mesh as one alpha-tested quad (no ink on every wire)
    const gridwall = (b, x0, x1, y0, y1, z, alongZ = false) => {
      const put = (a, y, sa, sy) => b.add(GEO.box, GRID, alongZ ? { x: z, y, z: a, sx: 0.022, sy, sz: sa } : { x: a, y, z, sx: sa, sy, sz: 0.022 });
      put(x0, (y0 + y1) / 2, 0.026, y1 - y0); put(x1, (y0 + y1) / 2, 0.026, y1 - y0); put((x0 + x1) / 2, y0, x1 - x0, 0.026); put((x0 + x1) / 2, y1, x1 - x0, 0.026);
      const w = x1 - x0, h = y1 - y0, q = new THREE.PlaneGeometry(w, h).toNonIndexed(), uv = q.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 0.24, uv.getY(i) * h / 0.24);
      q.applyMatrix4(partMatrix(alongZ ? { x: z, y: (y0 + y1) / 2, z: (x0 + x1) / 2, ry: Math.PI / 2 } : { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z }));
      gq.push(q);
    };
    // ---- the post Buddy leaves when they are away, with its little sign
    T(stage.post, (b, tq) => {
      b.add(GEO.box, WOOD, { x: POST.lx, y: 0.5, z: POST.lz, sx: 0.09, sy: 1.0, sz: 0.09 });
      b.add(GEO.cone6, WOOD, { x: POST.lx, y: 1.04, z: POST.lz, sx: 0.07, sy: 0.08, sz: 0.07 });
      b.add(GEO.box, '#6b4424', { x: POST.lx, y: 0.86, z: POST.lz + 0.06, sx: 0.6, sy: 0.32, sz: 0.03 });
      quad(tq, 'post', 0.56, 0.28, { x: POST.lx, y: 0.86, z: POST.lz + 0.078 });
    });
    L('post', POST.lx, POST.lz, 0.12);
    // ---- the canopies: grey legs, scissor truss on each side, a white peaked top with a valance
    for (const name of ['canopyL', 'canopyR']) {
      T(stage[name], b => {
        const h = CW / 2;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.add(GEO.box, LEG, { x: sx * (h - 0.04), y: EH / 2, z: sz * (h - 0.04), sx: 0.045, sy: EH, sz: 0.045 }); b.add(GEO.box, '#5a5e66', { x: sx * (h - 0.04), y: 0.012, z: sz * (h - 0.04), sx: 0.14, sy: 0.024, sz: 0.14 }); }
        const ang = Math.atan2(0.42, CW / 2), len = Math.hypot(CW / 2, 0.42);
        for (const sz of [-1, 1]) for (const k of [-1, 1]) for (const s of [-1, 1]) b.add(GEO.box, LEG, { x: k * CW / 4, y: EH - 0.24, z: sz * (h - 0.04), sx: len, sy: 0.022, sz: 0.022, rz: s * ang });
        for (const sx of [-1, 1]) for (const k of [-1, 1]) for (const s of [-1, 1]) b.add(GEO.box, LEG, { x: sx * (h - 0.04), y: EH - 0.24, z: k * CW / 4, sx: len, sy: 0.022, sz: 0.022, rz: s * ang, ry: Math.PI / 2 });
        b.add(new THREE.ConeGeometry(CW / Math.SQRT2, PEAK, 4, 1), ROOF, { y: EH + 0.2 + PEAK / 2, ry: Math.PI / 4 });
        for (const s of [-1, 1]) { b.add(GEO.box, ROOF, { y: EH + 0.1, z: s * h, sx: CW + 0.02, sy: 0.22, sz: 0.02 }); b.add(GEO.box, ROOF, { x: s * h, y: EH + 0.1, sx: 0.02, sy: 0.22, sz: CW + 0.02 }); }
      });
      const px = name === 'canopyL' ? -CW / 2 : CW / 2;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) L(name, px + sx * (CW / 2 - 0.04), sz * (CW / 2 - 0.04), 0.07);
    }
    // ---- the walls: the left canopy's white grid walls (back and side), the right canopy's silver backdrop with grid
    // panels in front of it and a grid on its side, and the dog-sign tower at the front between the canopies
    T(stage.walls, b => {
      gridwall(b, -2.95, -0.18, 0.15, 2.05, -1.42);
      gridwall(b, -1.4, 0.75, 0.15, 2.05, -2.96, true);
      b.boxMinMax(0.12, 0.04, -1.5, 2.98, 2.24, -1.47, '#c9ccd2');
      for (let k = 0; k < 9; k++) b.add(GEO.box, k % 2 ? '#dfe2e6' : '#b9bcc3', { x: 0.3 + k * 0.31, y: 1.14, z: -1.462, sx: 0.12, sy: 2.18, sz: 0.008 });
      gridwall(b, 0.25, 2.85, 0.35, 2.05, -1.42);
      gridwall(b, -1.3, 0.6, 0.15, 2.05, 2.96, true);
      gridwall(b, -0.52, 0.52, 0.2, 2.05, 1.85);
      for (const s of [-1, 1]) b.add(GEO.box, '#d8d8d2', { x: s * 0.52, y: 0.03, z: 1.85, sx: 0.06, sy: 0.06, sz: 0.5 });
    });
    Lwall('walls', -2.95, -1.42, -0.18, -1.42); Lwall('walls', -2.96, -1.3, -2.96, 0.75); Lwall('walls', 0.12, -1.48, 2.98, -1.48); Lwall('walls', 2.96, -1.3, 2.96, 0.6); Lwall('walls', -0.52, 1.85, 0.52, 1.85, 0.12);
    // ---- the table with its black cloth, and the banner on the front
    T(stage.table, b => {
      b.boxMinMax(-2.4, 0.02, -0.55, -0.6, 0.76, 0.18, '#1f1f24');
      b.boxMinMax(-2.42, 0.76, -0.57, -0.58, 0.79, 0.2, '#26262b');
      b.add(GEO.box, '#7a5232', { x: -0.85, y: 0.85, z: -0.35, sx: 0.28, sy: 0.12, sz: 0.2 });      // the cash box
      for (let i = 0; i < 5; i++) b.add(GEO.ico0, ['#c8302c', '#f4f2ea', '#1f1f24', '#f07a1e', '#2f7a3f'][i], { x: -2.25 + i * 0.12, y: 0.83, z: 0.05, sx: 0.06, sy: 0.04, sz: 0.04 }); // loose bows
    });
    T(stage.banner, (b, tq) => quad(tq, 'banner', 1.6, 0.4, { x: -1.5, y: 0.46, z: 0.188 }), false);
    Lwall('table', -2.4, -0.2, -0.6, -0.2, 0.36);
    // ---- the corner towers (a gridwall on two feet each), their big seasonal wreaths are dressed daily
    for (const [name, lx] of [['towerL', -3.05], ['towerR', 3.05]]) {
      T(stage[name], b => { gridwall(b, lx - 0.33, lx + 0.33, 0.2, 2.1, 1.6); for (const s of [-1, 1]) b.add(GEO.box, '#d8d8d2', { x: lx + s * 0.33, y: 0.03, z: 1.6, sx: 0.06, sy: 0.06, sz: 0.5 }); });
      L(name, lx, 1.6, 0.3);
    }
    // ---- Buddy's folding camp chair: the seat's top at CHAIR.seatY, padded armrests at CHAIR.armY (his forearms lie on them),
    // a cup holder with his coffee. His knees bend at the front rail and his shins stand in front of it, clear of the X legs.
    T(stage.chair, b => {
      const { lx, lz, seatY, W, zf: ZF, zb: ZB, armY, armZ } = CHAIR, TUBE = '#4a4f57', FAB = '#24427a', EDGE = '#172d55';
      const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), q = new THREE.Quaternion(), mm = new THREE.Matrix4(), mid = new THREE.Vector3(), sc = new THREE.Vector3();
      const bar = (ax, ay, az, bx, by, bz, r = 0.017, col = TUBE) => {
        dir.set(bx - ax, by - ay, bz - az); const len = dir.length(); dir.normalize(); q.setFromUnitVectors(up, dir);
        mid.set(lx + (ax + bx) / 2, (ay + by) / 2, lz + (az + bz) / 2); b.add(GEO.cyl6, col, { matrix: mm.compose(mid, q, sc.set(r, len, r)) });
      };
      // the frame: front posts up to the armrests, back posts up the back, the X on each side, at the front and behind
      const AY = armY - 0.045; // the armrest tube (the pad sits on it)
      for (const s of [-1, 1]) {
        bar(s * W, 0.01, ZF, s * W, AY, ZF);
        bar(s * W, 0.01, ZB, s * W * 0.98, 1.0, ZB - 0.14);
        bar(s * W, 0.02, ZB, s * W, seatY - 0.02, ZF); bar(s * W, 0.02, ZF, s * W, seatY - 0.02, ZB);   // the side X
        b.add(GEO.box, '#2b2b2f', { x: lx + s * W, y: 0.012, z: lz + ZF, sx: 0.05, sy: 0.024, sz: 0.05 });
        b.add(GEO.box, '#2b2b2f', { x: lx + s * W, y: 0.012, z: lz + ZB, sx: 0.05, sy: 0.024, sz: 0.05 });
      }
      for (const z of [ZF, ZB]) { bar(-W, 0.02, z, W, seatY - 0.03, z); bar(W, 0.02, z, -W, seatY - 0.03, z); }  // the front and back X
      bar(-W, seatY - 0.03, ZF, W, seatY - 0.03, ZF, 0.015); bar(-W, seatY - 0.03, ZB, W, seatY - 0.03, ZB, 0.015);
      // the fabric seat, slung between the side rails (a little sag in the middle) with a darker hem, and the back
      b.add(GEO.box, FAB, { x: lx, y: seatY - 0.035, z: lz + (ZF + ZB) / 2, sx: 2 * W + 0.02, sy: 0.07, sz: ZF - ZB + 0.02 });
      b.add(GEO.box, EDGE, { x: lx, y: seatY - 0.02, z: lz + ZF + 0.012, sx: 2 * W + 0.03, sy: 0.05, sz: 0.03 });
      for (const s of [-1, 1]) b.add(GEO.box, EDGE, { x: lx + s * (W + 0.005), y: seatY - 0.02, z: lz + (ZF + ZB) / 2, sx: 0.03, sy: 0.06, sz: ZF - ZB + 0.02 });
      b.add(GEO.box, FAB, { x: lx, y: seatY + 0.33, z: lz + ZB - 0.075, sx: 2 * W - 0.01, sy: 0.56, sz: 0.04, rx: -0.24 });
      b.add(GEO.box, EDGE, { x: lx, y: seatY + 0.62, z: lz + ZB - 0.145, sx: 2 * W + 0.02, sy: 0.05, sz: 0.05, rx: -0.24 });
      // padded armrests on their tubes, and the cup holder off the sitter's right one (-x)
      for (const s of [-1, 1]) {
        bar(s * W, AY, armZ[0], s * W, AY, ZF + 0.02, 0.016);
        b.add(GEO.box, EDGE, { x: lx + s * W, y: armY - 0.0225, z: lz + (armZ[0] + armZ[1]) / 2, sx: 0.085, sy: 0.045, sz: armZ[1] - armZ[0] });
      }
      const cx = lx - W - 0.1, cz = lz + armZ[1] - 0.12;
      b.add(GEO.cyl12, FAB, { x: cx, y: armY - 0.065, z: cz, sx: 0.06, sy: 0.12, sz: 0.06 });
      b.add(GEO.box, EDGE, { x: cx + 0.05, y: armY - 0.01, z: cz, sx: 0.06, sy: 0.02, sz: 0.04 });
      b.add(GEO.cyl8, '#c8302c', { x: cx, y: armY + 0.035, z: cz, sx: 0.038, sy: 0.12, sz: 0.038 });
      b.add(GEO.cyl8, '#f4f2ea', { x: cx, y: armY + 0.1, z: cz, sx: 0.04, sy: 0.012, sz: 0.04 });
    });
    L('chair', CHAIR.lx, CHAIR.lz - 0.1, 0.32);
    // ---- the tripod easel at the corner entrance with the day's wreath (dressed per frame) and its price card
    const tp = BOOTH.tripod;
    T(stage.tripod, (b, tq) => {
      for (const [dx, dz] of [[-0.32, 0.14], [0.32, 0.14], [0, -0.36]]) {
        const len = Math.hypot(dx, dz, 1.45), rx = Math.atan2(dz, 1.45), rz = -Math.atan2(dx, 1.45);
        b.add(GEO.box, '#8a5a2e', { x: tp.x + dx / 2, y: 0.72, z: tp.z + dz / 2, sx: 0.04, sy: len, sz: 0.04, rx: -rx, rz: -rz });
      }
      b.add(GEO.box, '#8a5a2e', { x: tp.x, y: 0.62, z: tp.z + 0.12, sx: 0.66, sy: 0.04, sz: 0.1 });
      quad(tq, 'price', 0.4, 0.1, { x: tp.x, y: 0.5, z: tp.z + 0.135 });
    });
    const tripodHold = new THREE.Group(); tripodHold.position.set(tp.x, 0.98, tp.z + 0.14); tripodHold.rotation.x = -0.08; stage.tripod.add(tripodHold);
    L('tripod', tp.x, tp.z, 0.3);
    // ---- the lights along the front of both canopies (lamp bulbs: pale by day, they burn after dark)
    T(stage.lights, b => {
      for (let i = 0; i <= 24; i++) { const x = -CW + i * (2 * CW / 24), sag = Math.sin((i % 12) / 12 * Math.PI) * 0.12; b.add(GEO.ico0, lampGlow('#ffe3a0'), { x, y: EH - 0.04 - sag, z: CW / 2 + 0.03, sx: 0.035, sy: 0.045, sz: 0.035 }); }
      b.add(GEO.box, '#2b2b2f', { y: EH - 0.06, z: CW / 2 + 0.03, sx: 2 * CW, sy: 0.008, sz: 0.008 });
    }, false);

    // ---- the dog signs: one instanced disc (each instance shows its breed's cell of the atlas) and one instanced check bow
    const SIGN_R = 0.22, signSpots = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) signSpots.push([0.5 + c * 0.55, 1.78 - r * 0.56, -1.38, 0]); // (the last column clear of the side wall's end bar)
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) signSpots.push([-0.25 + c * 0.5, 1.75 - r * 0.55, 1.88, 0]);
    const breedOf = i => (i === 15 ? BREEDS.findIndex(b => b.id === 'dax') : i % (BREEDS.length - 1) >= BREEDS.findIndex(b => b.id === 'dax') ? (i % (BREEDS.length - 1)) + 1 : i % (BREEDS.length - 1));
    const sg = new THREE.CylinderGeometry(SIGN_R, SIGN_R, 0.025, 24, 1).rotateX(Math.PI / 2);
    { const uv = sg.attributes.uv, pos = sg.attributes.position, nrm = sg.attributes.normal; for (let i = 0; i < uv.count; i++) { if (Math.abs(nrm.getZ(i)) > 0.9) uv.setXY(i, 0.5 + pos.getX(i) / (2 * SIGN_R), 0.5 + pos.getY(i) / (2 * SIGN_R)); else uv.setXY(i, 0.5, 0.012); } }
    const signMat = toon('#ffffff').clone(); signMat.map = ATL.map; signMat.name = 'carol-signs';
    signMat.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aCell;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_INSTANCING\n vMapUv = aCell.xy + vMapUv * aCell.zw;\n#endif'); };
    signMat.customProgramCacheKey = () => 'carol-sign-cells';
    const signs = new THREE.InstancedMesh(sg, signMat, signSpots.length); signs.name = 'dog-signs';
    const cellA = new Float32Array(signSpots.length * 4);
    signSpots.forEach((s, i) => { const [u0, v0, u1, v1] = cellUV('sign-' + BREEDS[breedOf(i)].id); cellA.set([u0, v0, u1 - u0, v1 - v0], i * 4); });
    sg.setAttribute('aCell', new THREE.InstancedBufferAttribute(cellA, 4));
    const bowB = new Batcher({ vertexColors: true, castShadow: false });
    for (const s of [-1, 1]) for (let q = 0; q < 4; q++) bowB.add(GEO.box, (q + (s > 0 ? 1 : 0)) % 2 ? '#1f1f24' : '#f4f2ea', { x: s * (0.04 + (q % 2) * 0.035), y: (Math.floor(q / 2) - 0.5) * 0.032, z: 0, sx: 0.035, sy: 0.032, sz: 0.018, rz: s * 0.25 });
    bowB.add(GEO.ico0, '#1f1f24', { z: 0.01, sx: 0.025, sy: 0.025, sz: 0.02 });
    for (const s of [-1, 1]) bowB.add(GEO.box, '#1f1f24', { x: s * 0.07, y: 0.13, z: -0.02, sx: 0.008, sy: 0.24, sz: 0.004, rz: s * 0.5 }); // the hanging strap
    const bowGeo = bowB.build(new THREE.Group(), 'sign-bow')[0].geometry;
    const bows = new THREE.InstancedMesh(bowGeo, VC, signSpots.length); bows.name = 'dog-sign-bows';
    stage.signs.add(signs, bows);
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const setSign = (i, k) => {
      const [x, y, z, ry] = signSpots[i]; Q.setFromAxisAngle(Y, ry); const s = Math.max(1e-4, k);
      signs.setMatrixAt(i, M4.compose(V.set(x, y, z), Q, S1.set(s, s, s)));
      bows.setMatrixAt(i, M4.compose(V.set(x, y + SIGN_R * 0.9, z + 0.03), Q, S1.set(s, s, s)));
    };
    // ---- the wreaths of the day's arrangement: instanced per design (the wall repeats each design twice, and the corner
    // towers' big ones join their design's instances), the word plaques instanced per word
    const wallSpots = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) wallSpots.push([-2.6 + c * 0.68, 1.62 - r * 0.72, -1.34, 0, 1]);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) wallSpots.push([-2.9, 1.62 - r * 0.72, -0.95 + c * 0.7, Math.PI / 2, 1]);
    const tableSpots = [[-2.05, 1.0, -0.38, 0, 0.8], [-1.45, 1.0, -0.4, 0, 0.8], [-0.95, 1.0, -0.38, 0, 0.8]];
    const cornerSpots = [[-3.05, 1.3, 1.64, 0, 1.45], [3.05, 1.3, 1.64, 0, 1.45]];
    const allSpots = [...wallSpots, ...tableSpots, ...cornerSpots], NW = WALL_SLOTS + TABLE_SLOTS;
    let wreathMeshes = [], plaqueMeshes = [];
    const arrState = { arr: null, layout: null, ids: [] };
    const EUL = new THREE.Euler(), PM = new THREE.Matrix4();
    const tilt = slot => (slot >= WALL_SLOTS && slot < NW ? -0.25 : 0);
    const spotMatrix = (slot, k, out) => { const [x, y, z, ry, s] = allSpots[slot], v = Math.max(1e-4, k * s); Q.setFromEuler(EUL.set(tilt(slot), ry, 0, 'YXZ')); return out.compose(V.set(x, y, z), Q, S1.set(v, v, v)); };
    function dress(day) {
      const a = arrangementFor(day), layout = arrangementLayout(a, day);
      arrState.arr = a; arrState.layout = layout; arrState.day = day;
      for (const m of [...wreathMeshes, ...plaqueMeshes]) { m.parent?.remove(m); m.dispose(); }
      wreathMeshes = []; plaqueMeshes = [];
      const ids = [...layout.wall.slice(0, WALL_SLOTS), ...layout.table.slice(0, TABLE_SLOTS), ...layout.corners.slice(0, 2)];
      arrState.ids = ids;
      const byDesign = new Map(), byWord = new Map();
      ids.forEach((d, i) => {
        if (!byDesign.has(d)) byDesign.set(d, []);
        byDesign.get(d).push(i);
        const pl = wreathGeometry(d).plaque;
        if (pl) { if (!byWord.has(pl.word)) byWord.set(pl.word, { pl, slots: [] }); byWord.get(pl.word).slots.push(i); }
      });
      for (const [d, idx] of byDesign) {
        const im = new THREE.InstancedMesh(wreathGeometry(d).geo, VC, idx.length); im.name = 'wreath-' + d; im.userData.design = d; im.userData.slots = idx;
        im.frustumCulled = false; im.castShadow = false; stage.wreaths.add(im); wreathMeshes.push(im);
      }
      for (const [w, { pl, slots }] of byWord) {
        let geo = plaqueGeos.get(w); if (!geo) { geo = uvQuad(pl.w, pl.h, 'word' + w); plaqueGeos.set(w, geo); }
        const im = new THREE.InstancedMesh(geo, ATL, slots.length); im.name = 'plaque-' + w; im.userData.slots = slots; im.userData.pl = pl;
        im.frustumCulled = false; im.castShadow = false; stage.wreaths.add(im); plaqueMeshes.push(im);
      }
      lastReveal = '';
    }
    let lastReveal = '';
    function reveal(F) {
      const st = F.booth, packing = st.packing, T = st.T, S = st.stages;
      const key = !T ? (S.wreaths > 0 ? 'all' : 'none') : packing + ':' + Math.floor(st.u * 2) + ':' + S.towerL.toFixed(2) + S.towerR.toFixed(2);
      if (key === lastReveal) return;
      lastReveal = key;
      const shown = (stageName, i, n) => (!T ? (S[stageName] > 0 ? 1 : 0) : itemShown(T[stageName], st.u, i, n, packing));
      const k = slot => (slot >= NW ? S[slot === NW ? 'towerL' : 'towerR'] : shown('wreaths', slot, NW));
      for (const im of wreathMeshes) { im.userData.slots.forEach((slot, j) => im.setMatrixAt(j, spotMatrix(slot, k(slot), M4))); im.instanceMatrix.needsUpdate = true; }
      for (const im of plaqueMeshes) {
        const pl = im.userData.pl;
        im.userData.slots.forEach((slot, j) => { spotMatrix(slot, k(slot) > 0.5 ? 1 : 1e-4, M4); im.setMatrixAt(j, M4.multiply(PM.makeTranslation(0, pl.y, pl.z + 0.004))); });
        im.instanceMatrix.needsUpdate = true;
      }
      for (let i = 0; i < signSpots.length; i++) setSign(i, shown('signs', i, signSpots.length));
      signs.instanceMatrix.needsUpdate = true; bows.instanceMatrix.needsUpdate = true;
    }
    // ---- once everything is out (most of the day), the static parts draw as one merged mesh per material instead of a
    // mesh per setup stage
    const STRUCT = ['canopyL', 'canopyR', 'walls', 'table', 'banner', 'towerL', 'towerR', 'chair', 'tripod'];
    const openG = new THREE.Group(); openG.name = 'booth-open'; openG.visible = false; B.add(openG);
    stage.tripod.remove(tripodHold); B.add(tripodHold);   // (the tripod's wreath changes after every sale: not merged)
    {
      const byMat = new Map();
      for (const k of STRUCT) {
        const sg = stage[k]; sg.updateMatrix();
        for (const m of sg.children) {
          if (!m.isMesh) continue;
          m.updateMatrix();
          const g = m.geometry.clone().applyMatrix4(m.matrix).applyMatrix4(sg.matrix);
          if (!byMat.has(m.material)) byMat.set(m.material, []);
          byMat.get(m.material).push(g);
        }
      }
      for (const [mat, geos] of byMat) {
        const mm = new THREE.Mesh(mergeGeometries(geos, false), mat); mm.name = 'booth-open-' + (mat.name || 'vc');
        mm.matrixAutoUpdate = false; mm.updateMatrix();
        if (mat === GRIDMAT || mat === ATL) mm.userData.noShadow = true;
        openG.add(mm); geos.forEach(g => g.dispose());
      }
    }
    shadows(B);
    for (const k of ['banner', 'lights', 'wreaths', 'signs']) stage[k].traverse(o => { if (o.isMesh) o.castShadow = false; });
    B.traverse(o => { if (o.isMesh && o.userData.noShadow) o.castShadow = false; });
    let lastStages = '', lastDesign = -2;
    const detailDist = () => (GFX.cls === 'phone' ? 60 : 110);
    return {
      group: B, stage, detail, signs, bows, signSpots, allSpots, cols, open: openG,
      get arr() { return arrState; },
      get tripodDesign() { return lastDesign; },
      wreathMeshes: () => wreathMeshes,
      dress,
      frame(F, t, dist) {
        detail.visible = dist < detailDist();
        const S = F.booth.stages;
        const key = STAGES.map(k => S[k].toFixed(2)).join();
        if (key !== lastStages) {
          lastStages = key;
          const allOut = STRUCT.every(k => S[k] >= 1);
          openG.visible = allOut;
          for (const k of STAGES) {
            const s = stage[k], v = S[k];
            if (!s) continue;
            s.visible = v > 0.001 && !(allOut && STRUCT.includes(k));
            const e = k === 'post' ? v : easeBack(v);
            if (k === 'canopyL' || k === 'canopyR') s.scale.set(0.55 + 0.45 * e, Math.max(0.001, e), 0.55 + 0.45 * e);
            else if (k !== 'wreaths' && k !== 'signs') s.scale.setScalar(Math.max(0.001, e));
            for (const c of cols[k]) c.off = v < 0.5;
          }
          tripodHold.visible = S.tripod > 0.001; tripodHold.scale.setScalar(Math.max(0.001, easeBack(S.tripod)));
        }
        if (detail.visible || F.booth.u < 1) reveal(F);
        // the tripod's wreath (restocked after every sale)
        const want = S.tripod > 0.5 ? tripodAt(t, sales).design : null, w = want ?? -1;
        if (w !== lastDesign) {
          lastDesign = w;
          tripodHold.clear();
          if (want !== null) { const m = wreathMesh(want, 0.95); m.traverse(o => { if (o.isMesh) o.castShadow = false; }); tripodHold.add(m); }
        }
      },
    };
  }

  // ================================================================ the plug-in
  return {
    name: 'buddycarol',
    api,
    update(dt, now) { update(dt, now); hail(now); },
    target(px, pz) {
      if (!card.hidden) return { hint: 'E  Not now', prio: 9, run: hideCard };
      if (!F) return null;
      const tr = tripodAt(net.serverNow() / 1000, sales);
      if (F.booth.open && F.phase === 'booth' && tr.design !== null && Math.hypot(px - TRIPOD[0], pz - TRIPOD[1]) < BOOTH.reach) return { hint: 'E  Look at the wreath on the stand', prio: 6, run: () => showCard(tr.design) };
      for (const who of ['carol', 'buddy']) {
        const P = who === 'carol' ? carol : buddy, r = P?.h.root;
        if (r && r.visible && Math.hypot(px - r.position.x, pz - r.position.z) < 2.4) return { hint: `E  Talk to ${tagOf(who, NPCS[who].name)}`, prio: 4, run: () => talk(who) };
      }
      if (visitor && visitor.h.root.visible && Math.hypot(px - visitor.h.root.position.x, pz - visitor.h.root.position.z) < 2.2) return { hint: `E  Say hi to ${tagOf(visitor.npc, NPCS[visitor.npc].name)}`, prio: 3, run: () => { sayVisitor(localPick(['Hi there! Carol\'s wreaths are the best in town.', 'Oh, hello! I\'m just browsing.', 'Hi! Have you met Buddy? Ask him about Pac-Man.'])); player.playEmote?.('wave', performance.now() / 1000); } };
      if (F.booth.stages.post > 0.5) { const [x, z] = boothXZ(POST.lx, POST.lz); if (Math.hypot(px - x, pz - z) < 1.8) return { hint: 'E  Read the little sign', prio: 3, run: () => { ui.toast('"Mama Carol\'s spot - back at 3:30"', 3200); audio.ui?.('blip'); } }; }
      return null;
    },
    onKey(code) {
      if (card.hidden) return false;
      if (code === 'Escape') { hideCard(); return true; }
      if (code === 'Enter') { buy(); return true; }
      if (code === 'KeyE') { hideCard(); return true; }
      return false;
    },
    bodies() {
      const out = [];
      for (const P of [buddy, carol, visitor]) { const r = P?.h.root; if (r && r.visible) out.push({ x: r.position.x, z: r.position.z, r: 0.32 }); }
      if (F && F.truck.moving) { const T = F.truck, s = Math.sin(T.yaw), c = Math.cos(T.yaw); for (const k of [-1.3, 0, 1.3]) out.push({ x: T.x + s * k, z: T.z + c * k, r: 0.95 }); }
      return out;
    },
    help: [[['E'], 'buy the wreath on Carol\'s stand in Strickler Park (10 fish, 3:45 to 8 pm); talk to Buddy and Carol']],
  };
}
