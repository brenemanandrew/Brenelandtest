// The strip mall's people and the late party (mall-staff, 2026-11-10). Belinda and Mina run Peak Threads (11 am to 7:30 pm): Belinda
// sashays her rounds of the racks, a hand on her hip, waves and greets you by name at the door; Mina sketches at the counter, folds
// at the table and the cubbies, dresses the mannequin by the fitting room. After close Belinda eats a slice in a booth, sits on the
// mall's bench and on party nights dances until three; Mina reads on the bench and on Summit Square, then both go home to Maple Row.
// Zoe and Asha work Summit Slice (11 am to 1 am) in red: the counter, the prep table, Zoe's delivery bag out to the door for Pete, Asha's
// tray to the tables and the ovens; at 9 pm they walk into the back room and come out in green. Wednesday, Friday and Saturday nights
// from 11:30 to 5 the party is on: the windows black out behind blinds with a UV glow at their edges, black-light tubes and glowing
// accents, a light rig with sweeping coloured beams, heavy dance music (made on the spot, mall-staff-party-sound.js) loud inside and
// muffled through the walls, Zoe and Asha raving with glow sticks, a few of the town's adults (never Kevin, Buddy or Carol, never a
// child: mall-staff-day.js) dropping in to dance or sit, Belinda most nights. Players can walk in and dance (the dance emotes).
// Everything about where people are is a pure function of the shared clock (mall-staff-day.js); the bodies are Blender models on the
// shared rig driven by human.js (mall-staff-model.js), the code-built people when the model does not load.
import * as THREE from 'three';
import { STRIP_MALL as L } from './layout.js';
import { FY, CEIL, PIZZA, T as WALL_T } from './strip-mall-plan.js';
import { TOWN_HOUSES } from './world-town.js';
import { LAMPS } from './daynight-mats.js';
import { MallStaffBody, mallStaffReady } from './mall-staff-model.js';
import { MpfbStaffBody, mpfbLoaded, mpfbReady, FELL_BACK } from './mpfb-characters.js';   // (mpfb-in-game) the four as MPFB characters with their own baked clips
import { staffState, STAFF, partyAt, setMallStaffHomes, inPizza, partyCrowd, SPOTS, STAFF_HOURS, PEAK_HOURS, SLICE_HOURS, PARTY, resetMallStaffCache } from './mall-staff-day.js';
import { createPartySound } from './mall-staff-party-sound.js';
import { signTexture } from './areas.js';
import { toon } from './toon.js';
import { GEO } from './batch.js';

// the four: the driver looks (the face the game draws on the model: skin, eyes, brows, mouth; the dims stay the default body's so the
// rig's joints are where the model expects them) and the code-built fallback looks (a whole person in her colours when no model loads)
export const PEOPLE = {
  belinda: { name: 'Belinda', voice: { pitch: 205, rate: 0.95, formant: 1.1 }, scale: 1.0,
    driver: { skin: '#c98e62', faceShape: 'round', eyes: 'oval', brows: 'arched', mouth: 'smirk', blush: true, shirt: '#1f6a3c', hair: '#211c20' },
    fallback: { outfit: 'dress', shirt: '#1f6a3c', pants: '#1f6a3c', shoes: '#262428', shoeKind: 'dress', hair: '#211c20', hairStyle: 'long', skin: '#c98e62', body: 'f', shape: 1, figure: 'curvy', bust: 0.8, build: 0.62, height: 0.52, faceShape: 'round', eyes: 'oval', brows: 'arched', mouth: 'smirk', blush: true, eyeStyle: 'hooded', gait: 0.35 } },
  mina: { name: 'Mina', voice: { pitch: 230, rate: 0.85, formant: 1.08 }, scale: 1.0,
    driver: { skin: '#f3e3d6', faceShape: 'oval', eyes: 'oval', eyeStyle: 'almond', eyeColor: '#3f3a44', brows: 'soft', mouth: 'smile', blush: false, shirt: '#f3ead8', hair: '#1b1719' },   // (almond, not hooded: hooded lids in her pale skin read as shut eyes)
    fallback: { outfit: 'gown', shirt: '#f3ead8', inner: '#f3ead8', pants: '#5a5752', shoes: '#8a6a48', shoeKind: 'dress', hair: '#1b1719', hairStyle: 'bun', skin: '#f3e3d6', body: 'f', shape: 1, figure: 'slim', build: 0.4, height: 0.56, faceShape: 'oval', eyes: 'oval', eyeStyle: 'almond', eyeColor: '#3f3a44', brows: 'soft', mouth: 'smile', blush: false, accessory: 'book' } },
  zoe: { name: 'Zoe', voice: { pitch: 215, rate: 1.15, formant: 1.1 }, scale: 0.98,
    driver: { skin: '#e8c39e', faceShape: 'round', eyes: 'wide', brows: 'plain', mouth: 'grin', blush: true, shirt: '#d9362b', hair: '#211c20' },
    fallback: { outfit: 'tee', shirt: '#d9362b', pants: '#262428', shoes: '#2a282c', shoeKind: 'boots', hat: 'cap', hatColor: '#262428', hair: '#211c20', hairStyle: 'long', skin: '#e8c39e', body: 'f', shape: 1, build: 0.45, height: 0.5, faceShape: 'round', eyes: 'wide', brows: 'plain', mouth: 'grin', blush: true, eyeStyle: 'hooded', gait: 0.2 },
    fallbackNight: { outfit: 'tank', shirt: '#2f6b3f', pants: '#243a66', bottoms: 'shorts', shoes: '#262428', shoeKind: 'dress', hat: 'cap', hatColor: '#2f6b3f', hair: '#211c20', hairStyle: 'pigtails', skin: '#e8c39e', body: 'f', shape: 1, build: 0.45, height: 0.5, faceShape: 'round', eyes: 'wide', brows: 'plain', mouth: 'grin', blush: true, eyeStyle: 'hooded', gait: 0.2 } },
  asha: { name: 'Asha', voice: { pitch: 195, rate: 1.1, formant: 1.05 }, scale: 0.97,
    driver: { skin: '#f0d2b8', faceShape: 'heart', eyes: 'oval', brows: 'thick', mouth: 'smile', blush: true, shirt: '#d9362b', hair: '#f0a8c8' },
    fallback: { outfit: 'overalls', shirt: '#d9362b', pants: '#262428', shoes: '#2a282c', shoeKind: 'boots', hat: 'cap', hatColor: '#262428', hair: '#f0a8c8', hairStyle: 'bob', skin: '#f0d2b8', body: 'f', shape: 1, build: 0.42, height: 0.48, faceShape: 'heart', eyes: 'oval', brows: 'thick', mouth: 'smile', blush: true, eyeStyle: 'hooded' },   // (the overalls' bib stands in for her black apron over the red polo)
    fallbackNight: { outfit: 'tee', shirt: '#2f6b3f', pants: '#243a66', bottoms: 'shorts', shoes: '#262428', shoeKind: 'dress', hair: '#f0a8c8', hairStyle: 'bob', skin: '#f0d2b8', body: 'f', shape: 1, build: 0.42, height: 0.48, faceShape: 'heart', eyes: 'oval', brows: 'thick', mouth: 'smile', blush: true, eyeStyle: 'hooded' } },
};
// the jobs as the game's own poses when a person is code-built (a model plays its own clip of the same name instead)
const CLIP_ANIM = { sashay: null, sass: 'look', greet: 'wave', sketch: 'read', fold: 'garden', dress: 'stretch', tray: 'idle', carry: 'idle', work: 'garden', rave: 'dance' };
const GREET = ['Hey {name}! Come in, come in.', '{name}! Love what you did with your hair.', 'Well look who it is. Hi {name}!', '{name}, honey, we have your colour this week.'];
const UV = '#7a4cff', UV2 = '#b48cff', PINK = '#ff4fd8', LIME = '#7dff5a', CYAN = '#4fe8ff';
const MUSIC_REACH = 70;

export function createMallStaff(ctx) {
  const { scene, npcs, ui, audio, player, net, camera } = ctx;
  const U = L.units.pizza, minZ = L.minZ, x0 = PIZZA.x0, x1 = PIZZA.x1, roomMid = [(x0 + x1) / 2, FY + 1.5, (minZ + L.maxZ) / 2];
  // their homes: the two westernmost Maple Row houses that face Summit Rd (the sisters share one, the pizza girls the next)
  {
    const row = TOWN_HOUSES.filter(h => h.facing === -1).sort((a, b) => a.x - b.x);
    if (row.length >= 2) setMallStaffHomes({ sisters: { x: row[0].x, z: row[0].z, door: [row[0].door.x, row[0].door.z], facing: -1 }, pizza: { x: row[1].x, z: row[1].z, door: [row[1].door.x, row[1].door.z], facing: -1 } });
  }

  // ---------------------------------------------------------------- the four, as the NPC system's own people (custom: their state is ours)
  const states = {}, defs = {}, tags = {};
  const useModel = mallStaffReady();
  const bakedFor = id => !!mpfbLoaded(id);   // (mpfb-in-game: her own clips; else the human.js-driven model, else the code-built look)
  for (const id of STAFF) {
    const P = PEOPLE[id];
    const def = npcs.addCustom({
      id: 'ms-' + id, npc: null, name: P.name, kind: 'human', look: { ...P.fallback, scale: P.scale }, voice: P.voice, lines: [],
      custom: t => { const s = staffState(id, t); states[id] = s; if (!useModel && !bakedFor(id) && s.clip && s.speed === 0 && !s.hidden) { const a = CLIP_ANIM[s.clip]; if (a) s.anim = a; } return s; },
      dress: (body, s) => {
        body.params.seatY = s.seatY || 0;
        if (body.mallStaff) {
          const b = body.mallStaff;
          // the change of clothes happens out of sight: hidden in the back room, not yet drawn, or far from the camera (a clock that jumped)
          // (back: npcs.js does not dress her while she is hidden, so the first frame after a gap, out of the back room, counts as out of sight)
          const back = npcs.now - (b.dressedAt ?? -1e9) > 0.5;
          if (s.outfit !== b.outfit && (s.hidden || back || !b.seenOnce || !body.root.visible || Math.abs(camera.position.x - s.x) + Math.abs(camera.position.z - s.z) > 40)) b.setOutfit(s.outfit);
          b.seenOnce = true; b.dressedAt = npcs.now;
          b.items(s.items);
          if (b.greetUntil && b.greetUntil > npcs.now) { /* the greeting clip plays out */ } else b.play(s.clip, b.clip === s.clip ? b.clipT : 0, s.cyc === 'walk' ? b.h.cyc : null);
        } else {
          if (body.fallbackOutfit !== undefined && s.outfit !== body.fallbackOutfit && P.fallbackNight && (s.hidden || !body.root.visible || Math.abs(camera.position.x - s.x) + Math.abs(camera.position.z - s.z) > 40)) {
            // the code-built person changes her clothes out of sight too: a new Human in the night look
            swapFallback(def, s.outfit);
          }
          heldItems(def, s);
        }
      },
    });
    defs[id] = def;
    if (bakedFor(id)) {
      const old = def.body; npcs.group.remove(old.root); old.dispose();
      const body = new MpfbStaffBody(id, { outfit: 'day', onSwap: (root, was) => { npcs.group.remove(was); npcs.group.add(root); def.body.root = root; if (tags[id]) tags[id].obj = root; } });
      body.root.userData.npc = def; body.root.userData.mallStaff = body;
      def.body = { root: body.root, params: body.params, h: body.h, mallStaff: body, update: (dt, now, speed, anim) => body.update(dt, now, speed, anim), say: (s, to) => body.say(s, to), dispose: () => body.dispose() };
      npcs.group.add(body.root);
    } else if (useModel) {
      const old = def.body; npcs.group.remove(old.root); old.dispose();
      const body = new MallStaffBody(id, { look: { ...P.driver, scale: P.scale }, outfit: 'day' });
      body.root.userData.npc = def; body.mallStaff = body; body.root.userData.mallStaff = body;
      // the custom NPC's body: the driver's root is the body's root (npcs.js reads body.root, body.params, body.update, body.say)
      def.body = { root: body.root, params: body.params, h: body.h, mallStaff: body, update: (dt, now, speed, anim) => body.update(dt, now, speed, anim), say: s => body.say(s), dispose: () => body.dispose() };
      npcs.group.add(body.root);
    } else def.body.fallbackOutfit = 'day';
    const tg = ui.nameTag(def.body.root, P.name, '#ffffff'); tg.max = 16; tg.fade = 11; tags[id] = tg;
  }
  // the code-built people's held things: Zoe's insulated delivery bag (hung level from the fist, as Pete's), Asha's tray with a pizza,
  // Mina's sketchbook in the right hand (her book accessory is the left); shown when the day says so
  const ITEM_MAT = { bag: toon('#2e2c30'), strap: toon('#45424a'), tray: toon('#b8bcc2'), crust: toon('#d9a35a'), sauce: toon('#c8422e'), cheese: toon('#f2d17a'), pep: toon('#a8261f'), paper: toon('#b98a5a'), spiral: toon('#8a8f96') };
  function makeItem(kind) {
    const g = new THREE.Group(); g.name = 'ms-item-' + kind;
    const add = (geo, mat, x, y, z, sx, sy, sz, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.x = rx; m.castShadow = true; g.add(m); return m; };
    if (kind === 'bag') { add(GEO.box, ITEM_MAT.bag, 0, -0.17, 0, 0.28, 0.24, 0.17); add(GEO.box, ITEM_MAT.strap, 0, 0.0, 0, 0.15, 0.02, 0.014); for (const x of [-0.06, 0.06]) add(GEO.box, ITEM_MAT.strap, x, -0.03, 0, 0.024, 0.07, 0.012); g.userData.upright = 'hang'; }
    else if (kind === 'tray') { add(GEO.cyl12, ITEM_MAT.tray, 0, -0.1, 0.1, 0.4, 0.012, 0.4); add(GEO.cyl12, ITEM_MAT.crust, 0, -0.088, 0.1, 0.34, 0.012, 0.34); add(GEO.cyl12, ITEM_MAT.sauce, 0, -0.08, 0.1, 0.3, 0.008, 0.3); add(GEO.cyl12, ITEM_MAT.cheese, 0, -0.074, 0.1, 0.26, 0.008, 0.26); for (let i = 0; i < 6; i++) { const a = i * 1.05; add(GEO.cyl12, ITEM_MAT.pep, Math.cos(a) * 0.09, -0.068, 0.1 + Math.sin(a) * 0.09, 0.04, 0.006, 0.04); } g.userData.upright = true; }
    else if (kind === 'sketchbook') { add(GEO.box, ITEM_MAT.paper, 0.0, -0.1, 0.02, 0.022, 0.22, 0.165); for (let i = 0; i < 6; i++) add(GEO.cyl12, ITEM_MAT.spiral, 0, -0.0 - i * 0.034, 0.1, 0.012, 0.006, 0.012, Math.PI / 2); }
    return g;
  }
  const ITEM_OF = { zoe: 'bag', asha: 'tray', mina: 'sketchbook' };
  function heldItems(def, s) {
    const id = def.id.slice(3), kind = ITEM_OF[id];
    if (!kind) return;
    const body = def.body;
    if (!body.handR) return;
    if (!body.msItem || body.msItem.parent !== body.handR) { body.msItem = makeItem(kind); body.handR.add(body.msItem); }
    body.msItem.visible = !!(s.items && s.items.R) && !s.hidden && s.anim !== 'sit' && s.anim !== 'read';
  }
  function swapFallback(def, outfit) {
    const P = PEOPLE[def.id.slice(3)], look = { ...(outfit === 'night' ? P.fallbackNight : P.fallback), scale: P.scale };
    const old = def.body; npcs.group.remove(old.root); old.dispose?.();
    def.look = look; def.body = npcs.makeBody(def); def.body.fallbackOutfit = outfit; def._placed = false;
    const tg = ui.nameTag(def.body.root, P.name, '#ffffff'); tg.max = 16; tg.fade = 11;
  }

  // ---------------------------------------------------------------- the party's dressing in the pizza place (built once, shown on party nights)
  const party = new THREE.Group(); party.name = 'mall-party'; party.visible = false; scene.add(party);
  const mat = (c, extra = {}) => new THREE.MeshBasicMaterial({ color: c, fog: true, ...extra });
  const M = { blind: mat('#0b0a16'), frame: mat(UV), tube: mat('#c9b3ff'), truss: mat('#1c1a24'), can: mat('#2a2733'), pink: mat(PINK), lime: mat(LIME), cyan: mat(CYAN), violet: mat(UV2) };
  M.blind.side = THREE.DoubleSide; M.frame.side = THREE.DoubleSide;
  const beams = [], pools = [], heads = [];
  const beamMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  {
    // the blinds: a dark panel just behind each pane of the front (the two windows, the transom, the door's glass) and the west window,
    // with a thin UV frame that glows round its edges (what the street sees through the glass)
    const f = PIZZA.front, zB = minZ + 0.08 + 0.05;
    const blind = (cx, cy, cz, w, h, axis = 'z') => {
      const g = new THREE.Group(); g.position.set(cx, cy, cz); if (axis === 'x') g.rotation.y = Math.PI / 2;
      g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.blind));
      const t = 0.035;
      for (const [x, y, sx, sy] of [[0, h / 2 - t / 2, w, t], [0, -h / 2 + t / 2, w, t], [-w / 2 + t / 2, 0, t, h], [w / 2 - t / 2, 0, t, h]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), M.frame); m.position.set(x, y, 0.004); g.add(m); }
      party.add(g);
    };
    for (const w of [f.west, f.east, f.transom]) blind((w.a0 + w.a1) / 2, (w.y0 + w.y1) / 2, zB, w.a1 - w.a0, w.y1 - w.y0);
    blind((f.door.a0 + f.door.a1) / 2, (f.door.y0 + 0.35 + f.door.y1) / 2, minZ + 0.42, f.door.a1 - f.door.a0 - 0.1, f.door.y1 - f.door.y0 - 0.35);   // (inside the door's swing: a film on the leaf would turn with it; this hangs just inside)
    const ww = PIZZA.west; blind(L.minX + 0.08 + 0.05, (ww.y0 + ww.y1) / 2, (ww.a0 + ww.a1) / 2, ww.a1 - ww.a0, ww.y1 - ww.y0, 'x');
    // the black lights: UV tubes on the ceiling across the dining room and two down the walls, each in a small dark fitting
    const tube = (x, y, z, len, axis) => {
      const fit = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? len + 0.1 : 0.08, 0.05, axis === 'x' ? 0.08 : len + 0.1), M.truss); fit.position.set(x, y + 0.03, z); party.add(fit);
      const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 8), M.tube); tb.rotation.z = axis === 'x' ? Math.PI / 2 : 0; if (axis === 'z') tb.rotation.x = Math.PI / 2; tb.position.set(x, y, z); party.add(tb);
    };
    for (const z of [minZ + 2.4, minZ + 5.0, minZ + 7.6]) tube((x0 + x1) / 2 - 1.0, CEIL - 0.06, z, 3.6, 'x');
    tube(x0 + 0.1, FY + 2.0, minZ + 5.0, 2.4, 'z'); tube(x1 - 0.1, FY + 2.0, minZ + 4.2, 2.4, 'z');
    // the glowing accents: the logo on the party wall, paint splatter on the walls, the tables' edges
    const logoTex = signTexture(['SUMMIT SLICE'], { bg: '#120c22', fg: UV2, w: 512, h: 160 });
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), new THREE.MeshBasicMaterial({ map: logoTex, fog: true })); logo.position.set(x1 - 0.02, FY + 2.5, minZ + 5.6); logo.rotation.y = -Math.PI / 2; party.add(logo);
    const splat = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.clearRect(0, 0, 256, 256); const cols = [PINK, LIME, CYAN, UV2]; for (let i = 0; i < 26; i++) { g.fillStyle = cols[i % 4]; g.beginPath(); g.arc(30 + ((i * 97) % 200), 30 + ((i * 61) % 200), 4 + (i * 7) % 14, 0, Math.PI * 2); g.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const splatMat = new THREE.MeshBasicMaterial({ map: splat, transparent: true, fog: true, side: THREE.DoubleSide });
    for (const [x, z, ry] of [[x0 + 0.03, minZ + 3.2, Math.PI / 2], [x0 + 0.03, minZ + 6.6, Math.PI / 2], [x1 - 0.03, minZ + 2.2, -Math.PI / 2], [x1 - 0.03, minZ + 8.0, -Math.PI / 2], [(x0 + x1) / 2 + 2, minZ + 0.33, 0]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), splatMat); m.position.set(x, FY + 2.6, z); m.rotation.y = ry; party.add(m);
    }
    for (const tb of PIZZA.tables) { const r = new THREE.Mesh(new THREE.TorusGeometry(tb.r + 0.01, 0.012, 6, 24), M.violet); r.rotation.x = Math.PI / 2; r.position.set(tb.x, tb.top + 0.005, tb.z); party.add(r); }
    for (const b of PIZZA.booths) { const r = new THREE.Mesh(new THREE.BoxGeometry(b.table.w + 0.02, 0.02, 0.02), M.pink); r.position.set(b.table.x, b.table.top + 0.01, b.z + b.table.d / 2); party.add(r); }
    // the light rig: a truss across the ceiling over the floor with four par cans and two moving heads; coloured beams sweep from the
    // heads (cones of additive light) and their pools slide over the floor
    const truss = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - 3.0, 0.14, 0.14), M.truss); truss.position.set((x0 + x1) / 2, CEIL - 0.32, minZ + 5.8); party.add(truss);
    const cols = [M.pink, M.lime, M.cyan, M.violet];
    for (let i = 0; i < 4; i++) {
      const x = x0 + 2.2 + i * (x1 - x0 - 4.4) / 3;
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.22, 10), M.can); can.position.set(x, CEIL - 0.52, minZ + 5.8); can.rotation.x = 0.5 + (i % 2) * 0.4; party.add(can);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 10), cols[i]); lens.position.set(0, -0.12, 0); can.add(lens);
    }
    for (let i = 0; i < 2; i++) {
      const x = (x0 + x1) / 2 + (i ? 2.4 : -2.4);
      const head = new THREE.Group(); head.position.set(x, CEIL - 0.5, minZ + 5.8); party.add(head);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), M.can); head.add(body);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 10), i ? M.pink : M.cyan); lens.position.set(0, -0.14, 0); head.add(lens);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.2, 14, 1, true), beamMat(i ? PINK : CYAN)); beam.position.set(0, -2.1 - 0.14, 0); beam.rotation.x = Math.PI; head.add(beam);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1.0, 18), beamMat(i ? PINK : CYAN)); pool.rotation.x = -Math.PI / 2; pool.position.y = FY + 0.012; pool.material.opacity = 0.22; party.add(pool);
      heads.push(head); beams.push(beam); pools.push(pool);
    }
  }
  // the hours card: Summit Slice's says the party nights (strip-mall-build.js draws the card; a second line is ours)
  const sound = createPartySound(audio, roomMid);
  const lampBase = LAMPS.get('mall-bulbs-pizza'), lampDim = new THREE.Color('#6a4ab8'), lampWhite = new THREE.Color('#ffffff');
  let partyOn = false, lastGreet = -1e9, lastWas = null;
  const stripMall = () => ctx.features?.find(f => f.name === 'strip-mall') || null;

  return {
    name: 'mall-staff',
    people: defs, states, model: useModel || STAFF.some(bakedFor), baked: Object.fromEntries(STAFF.map(id => [id, bakedFor(id)])), fellBack: () => [...FELL_BACK], party: () => partyOn, hours: { peak: PEAK_HOURS, slice: SLICE_HOURS, party: PARTY }, staffHours: STAFF_HOURS, spots: SPOTS, sound,
    inside: () => partyOn && inPizza(player.pos.x, player.pos.z), crowd: () => partyCrowd(net.serverNow() / 1000), resetCaches: resetMallStaffCache,
    update(dt, now) {
      const t = net.serverNow() / 1000;
      const pa = partyAt(t), on = !!pa;
      if (on !== partyOn) {
        partyOn = on; party.visible = on;
        if (lampBase) lampBase.base.copy(on ? lampDim : lampWhite);
      }
      // Belinda greets you by name at the door now and then (local: a reaction to your own player)
      const b = states.belinda, bd = defs.belinda;
      if (b && !b.hidden && b.unit === 'clothes' && b.speed === 0 && now - lastGreet > 75) {
        const r = bd.body.root.position, d = Math.hypot(player.pos.x - r.x, player.pos.z - r.z);
        if (d < 5 && player.pos.z > minZ) {
          lastGreet = now;
          const name = (ctx.profile?.name || 'you').split(' ')[0];
          const line = GREET[Math.floor(Math.random() * GREET.length)].replace('{name}', name);
          ui.say(bd.body.root, line, 3.6, 2.3); audio.speak(r.x, r.y + 1.6, r.z, line, bd.voice); bd.body.say?.(1.4);
          if (bd.body.mallStaff) { const b2 = bd.body.mallStaff; b2.play('greet', 0); b2.greetUntil = now + (b2.baked ? 1.7 : 1.3); if (b2.baked) b2.h.expression(Math.random() < 0.5 ? 'wink' : 'laugh', 2.2); }
          else npcs.local.set(bd.id, { anim: 'wave', until: now + 2.6 });
        }
      }
      if (!on) { if (sound.on) sound.set(false, 'wall'); return; }
      // the beams sweep, the pools slide where they point
      const ph = now * 1.3;
      for (let i = 0; i < heads.length; i++) {
        const h = heads[i], s = i ? -1 : 1;
        h.rotation.z = Math.sin(ph * 0.9 + i * 2.1) * 0.75 * s; h.rotation.x = 0.35 + Math.sin(ph * 0.63 + i) * 0.4;
        const dir = new THREE.Vector3(0, -1, 0).applyEuler(h.rotation), k = (h.position.y - FY) / Math.max(0.2, -dir.y);
        const p = pools[i]; p.position.x = h.position.x + dir.x * k; p.position.z = h.position.z + dir.z * k; const sc = Math.min(2.2, 0.6 + k * 0.28); p.scale.set(sc, sc, 1);
      }
      // the music: on within reach, loud in the room, through the door, muffled through the walls
      const px = player.pos.x, pz = player.pos.z, c = camera.position;
      const far = Math.abs(c.x - roomMid[0]) + Math.abs(c.z - roomMid[2]) > MUSIC_REACH;
      const here = inPizza(px, pz) || inPizza(c.x, c.z);
      const nearDoor = Math.hypot(px - U.door.x, pz - minZ) < 3.0;
      const sm = stripMall(), doorOpen = sm ? (sm.doorT?.pizza || 0) > 0.3 : false;
      sound.set(!far, here ? 'in' : nearDoor && doorOpen ? 'door' : 'wall');
      sound.update(now);
      if (here !== lastWas) { lastWas = here; if (here) ui.toast('Party at Summit Slice! Dance, it is a party.', 3200); }
    },
    target(px, pz) { return null; },
  };
}
void WALL_T;
