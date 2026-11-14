// Beneath Angell Street: the week's goal below (w16-goals). The server places the things from the maze's seed and keeps every
// state (lib/maze-goals.js; the run's enter message carries the goal, then { op: 'goal' } with every change); this draws them,
// asks for pickups (E within reach: the server has the word), points the distance line at the next thing, shows the party's
// count in a strip under it, and plays what happens: the seal across the door and the leaf shut, the beacon dark and lit, the
// cask under your arm (the lantern lower, a slosh with each step), the book under the arm, the lost scout hiding, following a
// step behind, running for a hiding spot when you are grabbed and up the stair first, each page read aloud in its finder's voice.
// Every goal obeys the house rule: the things are real objects you walk to, the way out is the door you walk through.
//   createMazeGoals(ctx, scene, { state }) -> { onMsg, frame, hint, onE, target, open, paceK, step, known, dispose, ...tests }
import * as THREE from 'three';
import { Batcher, GEO } from './batch.js';
import { soft as softLayer } from './toon.js';
import { Human } from './human.js';
import { el } from './util.js';
import { CELL, DIRS } from './maze-gen.js';
import { Prop, lectern, SHAPES, rng as propRng } from './maze-props.js';
import { GOAL_TEXT, PAGE_LINES } from './maze-story.js';
import { SCOUTS, UNIFORM } from './scouts.js';
import { voiceFor } from './maze-sneak.js';
import { dressLantern } from './maze-hand.js';

export const PICK = { r: 1.6, detective: 2.2 }; // lib/maze-goals.js PICK: E within this of a thing (the Detective's reach a step further)
export const DOOR_R = 3.2;                       // lib/maze-goals.js DOOR_R: at the door (the landing and the top treads)
export const CARRY = { walk: 0.9, run: 0.85, lower: 0.1 }; // the cask: your pace, and how much lower the lantern hangs
const SCOUT_LAG = 1.2, SCOUT_RUN = 4.2, SCOUT_WALK = 3.0;
const SEEN_R = 10; // a thing within this and in sight is known (the Librarian's map)
const IRON = '#26262d', OAK = '#5a4434', OAK2 = '#3e2e22', PAPER = '#e9dcc0', PAPER2 = '#d9c9a4';

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255, 255, 255, 1)'); gr.addColorStop(0.35, 'rgba(255, 255, 255, 0.4)'); gr.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let GLOW = null;
function glow(color, size) {
  GLOW = GLOW || glowTexture();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true, opacity: 0.8 }));
  s.scale.setScalar(size); softLayer(s); return s;
}
// an arch (the doorway's shape: maze-kit.js buildFlight)
const arch = (path, hw, y, h) => { path.moveTo(-hw, y); path.lineTo(hw, y); path.lineTo(hw, y + h - hw); path.absarc(0, y + h - hw, hw, 0, Math.PI, false); path.lineTo(-hw, y); return path; };

function registerSfx(audio) {
  if (!audio?.registerSfx || audio._mazeGoalSfx) return;
  audio._mazeGoalSfx = true;
  const at = (a, x, y, z, ref = 4) => a.at(x, y, z, ref);
  // the cask's slosh with a step: a short wet slap and a gurgle
  audio.registerSfx('maze-slosh', (a, x, y, z, o = {}) => { const out = at(a, x, y, z, 2), t = a.ctx.currentTime, k = o.k ?? 1; a.burst(out, { t, dur: 0.07, type: 'bandpass', f: 520, Q: 1.4, peak: 0.07 * k }); a.tone(out, { f: 240, glide: 140, t: t + 0.03, d: 0.16, peak: 0.03 * k, type: 'sine' }); a.burst(out, { t: t + 0.06, dur: 0.12, type: 'lowpass', f: 700, Q: 0.7, peak: 0.03 * k, attack: 0.03, brown: true }); });
  // a stone or a page taken: a soft chime with a little grit
  audio.registerSfx('maze-take', (a, x, y, z) => { const out = at(a, x, y, z, 3), t = a.ctx.currentTime; a.tone(out, { f: 660, glide: 990, t, d: 0.3, peak: 0.05, type: 'triangle', verb: 0.5 }); a.burst(out, { t, dur: 0.05, type: 'highpass', f: 2500, Q: 0.7, peak: 0.03 }); });
  // the seal breaking: a deep crack and a shimmer dying away
  audio.registerSfx('maze-seal', (a, x, y, z) => { const out = at(a, x, y, z, 8), t = a.ctx.currentTime; a.burst(out, { t, dur: 0.18, type: 'lowpass', f: 320, Q: 0.8, peak: 0.16, brown: true }); a.tone(out, { f: 1480, glide: 220, t: t + 0.05, d: 1.6, peak: 0.05, type: 'sine', verb: 0.7 }); a.tone(out, { f: 2200, glide: 330, t: t + 0.1, d: 1.2, peak: 0.03, type: 'sine', verb: 0.7 }); });
  // the beacon catching: a whump and the roar settling to a crackle
  audio.registerSfx('maze-beacon', (a, x, y, z) => { const out = at(a, x, y, z, 8), t = a.ctx.currentTime; a.burst(out, { t, dur: 0.5, type: 'lowpass', f: 420, Q: 0.6, peak: 0.14, attack: 0.08, brown: true }); a.burst(out, { t: t + 0.2, dur: 1.8, type: 'bandpass', f: 900, Q: 0.5, peak: 0.05, attack: 0.3 }); });
  // the leaf swinging open: old hinges
  audio.registerSfx('maze-leaf', (a, x, y, z) => { const out = at(a, x, y, z, 6), t = a.ctx.currentTime; a.tone(out, { f: 180, glide: 320, t, d: 0.9, peak: 0.04, type: 'sawtooth' }); a.burst(out, { t: t + 0.85, dur: 0.08, type: 'lowpass', f: 500, Q: 1, peak: 0.08 }); });
}

export function createMazeGoals(ctx, scene, { state }) {
  const { ui, audio, net } = ctx;
  const { maze, kit, group, origin, me, remotes, hand } = scene, { W, H } = maze;
  registerSfx(audio);
  const goal = state?.goal || 'escape', need = state?.need || 0, TXT = GOAL_TEXT[goal] || GOAL_TEXT.escape;
  const ES = kit.exitStair;
  const S = { goal, need, held: state?.held || 0, door: state?.door || 'open', open: goal === 'escape' || !!state?.open, lit: !!state?.lit, things: [] }; // (no state at all, an older server: the plain escape, the door open)
  const views = []; // one per thing: { t (the server's record), g (the group), meshes, glow, known, tag... }
  const log = { takes: 0, reads: [], events: [] }; // (tests)
  const hudRoot = ctx.hud.querySelector('.mz-hud');
  const strip = el('div', 'mz-goal', ''), stripName = el('span', 'mz-goal-name', ''), slots = el('span', 'mz-goal-slots', '');
  strip.append(stripName, slots); (hudRoot || ctx.hud).append(strip);
  if (goal === 'escape') strip.hidden = true;
  const sfx = (name, x, z, y = 1.2, opts) => audio.play?.(name, x + origin.x, y + origin.y, z + origin.z, opts);

  // ---- the things
  const cellOf = (x, z) => Math.max(0, Math.min(W - 1, Math.floor(x / CELL))) + Math.max(0, Math.min(H - 1, Math.floor(z / CELL))) * W;
  const floorY = (x, z) => (maze.water[cellOf(x, z)] ? -0.35 : 0);
  function buildThing(t) {
    const g = new THREE.Group(); g.name = 'mz-goal-' + t.kind; g.position.set(t.x, floorY(t.x, t.z), t.z); g.rotation.y = t.yaw || 0;
    const b = new Batcher({ vertexColors: true, castShadow: true, receiveShadow: true });
    const v = { t, g, meshes: [], glow: null, known: false, body: null, tag: null, seen: false };
    if (t.kind === 'sign') {
      // a flat stone, leaned back a little, the Elder Sign cut into its face (the kit's own material) and glowing faintly
      b.add(GEO.cyl8, '#4a5366', { y: 0.24, sx: 0.3, sy: 0.08, sz: 0.3, rx: Math.PI / 2 - 0.25 });
      b.add(GEO.box, '#3a3f50', { y: 0.05, z: 0.08, sx: 0.5, sy: 0.1, sz: 0.3 });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), kit.M.sign); face.position.set(0, 0.25, 0.052); face.rotation.x = -0.25; g.add(face); v.meshes.push(face);
      v.glow = glow('#9fd6c0', 1.1); v.glow.position.set(0, 0.3, 0.1); g.add(v.glow);
    } else if (t.kind === 'cask') {
      // a small oil cask: staves, two iron bands, a wooden bung; a faint glow only once it has been dropped (anyone finds it again)
      b.add(SHAPES.barrel, '#5e4630', { sx: 0.62, sy: 0.62, sz: 0.62 });
      for (const y of [0.12, 0.44]) b.add(GEO.cyl12, IRON, { y, sx: 0.19, sy: 0.03, sz: 0.19 });
      b.add(GEO.cyl8, '#3a2a1a', { y: 0.57, sx: 0.04, sy: 0.05, sz: 0.04 });
      b.add(GEO.cyl8, '#2e2218', { y: 0.3, z: 0.19, sx: 0.03, sy: 0.05, sz: 0.03, rx: Math.PI / 2 }); // the tap
      v.glow = glow('#f0b45a', 1.0); v.glow.position.set(0, 0.4, 0); v.glow.visible = t.st === 'dropped'; g.add(v.glow);
    } else if (t.kind === 'book') {
      // a lectern standing, the Professor's book on its slope: a red cover, gilt corners, the pages' edge
      const P = new Prop('lectern'); lectern(P, propRng(0.37)); P.at(0, 0, 0, 0); P.commit(b, { settle: 0 });
      b.add(GEO.box, '#7a2f3a', { y: 1.06, z: 0.03, sx: 0.3, sy: 0.05, sz: 0.4, rx: 0.5 });
      b.add(GEO.box, '#f3efe6', { y: 1.085, z: 0.035, sx: 0.27, sy: 0.03, sz: 0.37, rx: 0.5 });
      for (const [x, z] of [[-0.12, -0.15], [0.12, -0.15], [-0.12, 0.17], [0.12, 0.17]]) b.add(GEO.box, '#c9a24a', { x, y: 1.06 + (z < 0 ? 0.07 : -0.08), z: z + 0.03, sx: 0.05, sy: 0.055, sz: 0.05, rx: 0.5 });
      v.glow = glow('#c9a24a', 1.0); v.glow.position.set(0, 1.15, 0.05); g.add(v.glow);
    } else if (t.kind === 'page') {
      // a sheet on the floor, one corner lifted, the ink showing; in the water it floats
      const y = 0.02;
      b.add(GEO.box, PAPER, { y, sx: 0.24, sy: 0.006, sz: 0.32, ry: 0.3, rx: 0.06 });
      b.add(GEO.box, PAPER2, { x: 0.06, y: y + 0.01, z: -0.1, sx: 0.16, sy: 0.004, sz: 0.14, ry: 0.6, rx: 0.3 });
      for (let k = 0; k < 5; k++) b.add(GEO.box, '#2b2340', { x: -0.04 + (k % 2) * 0.02, y: y + 0.0045, z: -0.1 + k * 0.05, sx: 0.14 - (k % 3) * 0.03, sy: 0.002, sz: 0.012, ry: 0.3 });
      v.glow = glow('#d8c7a2', 0.9); v.glow.position.set(0, 0.2, 0); g.add(v.glow);
    } else if (t.kind === 'scout') {
      // one of the Scout Camp's cub scouts (scouts.js cast and uniform), a small torch in the hand, crouched in the hiding spot
      const who = SCOUTS[maze.seed % SCOUTS.length];
      const h = new Human({ ...UNIFORM, skin: who.skin, hair: who.hair, hairStyle: who.hairStyle, color: '#2f3f6e', accessory: 'lantern', acc: 'scarf', accColor: '#f2c230' }); // (the neckerchief as the look's own accessory: the hand holds a small lantern)
      dressLantern(h);
      h.root.position.set(0, 0, 0); g.add(h.root);
      v.body = h; v.name = who.name;
      v.glow = glow('#ffcf7a', 0.9); v.glow.position.set(0, 1.0, 0.2); g.add(v.glow);
      const vis = new THREE.Object3D(); vis.name = 'mz-scout-seen'; vis.userData.tagAnchor = h.root.userData.tagAnchor; h.root.add(vis); v.vis = vis;
      v.tag = ui.nameTag(vis, `${who.name} (scout)`, '#f2c230'); v.tag.max = 9; v.tag.fade = 5.5;
    }
    v.meshes.push(...b.build(g, 'mz-goal-' + t.kind));
    group.add(g);
    return v;
  }
  for (const t of state?.things || []) views.push(buildThing(t));
  const scout = views.find(v => v.t.kind === 'scout') || null;
  if (scout) Object.assign(scout, { st: scout.t.st, route: null, ri: 0, x: scout.t.x, z: scout.t.z, yaw: scout.t.yaw, shiver: 0, upT: 0, speed: 0, callT: 0 });

  // ---- the door: a leaf shut across the arch (hinged on the +v jamb, swinging in), the seal of the signs on it, the beacon over it
  const E = ES, door = { leaf: null, pivot: null, seal: null, beacon: null, flame: null, bglow: null, torch: null, openT: -1, sealT: -1, lit: 0, box: null };
  {
    const b = new Batcher({ vertexColors: true, castShadow: true, receiveShadow: true });
    // the pivot's frame is the flight's: +x up the flight (out through the door), +z across it. The hinge on the +v jamb at the
    // wall's inner face; the leaf hangs from it toward -v across the doorway (its arch shape built in x, y and turned so the
    // shape's x runs along -z), a plank's thickness into the room; it swings out on the way the kit's own leaf did
    const pivot = new THREE.Group(); pivot.name = 'mz-goal-leaf'; pivot.position.set(E.uIn + 0.1, E.topY + 0.01, E.doorW / 2 - 0.02);
    const leaf = arch(new THREE.Shape(), E.doorW / 2 - 0.02, 0, E.doorH - 0.02), lg = new THREE.ExtrudeGeometry(leaf, { depth: 0.07, bevelEnabled: false, curveSegments: 10 });
    lg.translate(-(E.doorW / 2 - 0.02), 0, -0.07); // (the hinge edge at the shape's x 0; the thickness behind the face)
    b.add(lg, OAK, { ry: -Math.PI / 2 }); // (the shape's x -> -z: across the doorway from the hinge; its depth -> -x: into the room)
    for (let k = 1; k < 5; k++) b.add(GEO.box, OAK2, { x: -0.075, y: (E.doorH - 0.3) / 2, z: -k * (E.doorW - 0.04) / 5, sx: 0.02, sy: E.doorH - 0.45, sz: 0.02 });
    for (const y of [0.45, E.doorH - 0.75]) b.add(GEO.box, IRON, { x: -0.085, y, z: -(E.doorW / 2 - 0.02), sx: 0.025, sy: 0.07, sz: E.doorW - 0.1 });
    b.add(new THREE.TorusGeometry(0.06, 0.012, 6, 12), IRON, { x: -0.11, y: 1.0, z: -(E.doorW - 0.25), ry: Math.PI / 2 });
    door.leafMeshes = b.build(pivot, 'mz-goal-leaf'); door.pivot = pivot; E.group.add(pivot);
    // the seal: the Elder Sign glowing across the doorway, over the shut leaf, pulsing (the signs' goal only)
    const seal = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshBasicMaterial({ map: kit.M.sign.map, color: '#9fd6c0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, side: THREE.DoubleSide }));
    seal.position.set(E.uIn - 0.02, E.topY + 1.25, 0); seal.rotation.y = -Math.PI / 2; seal.name = 'mz-goal-seal'; seal.material.forceSinglePass = true;
    softLayer(seal); E.group.add(seal); door.seal = seal; seal.visible = goal === 'signs';
    door.sglow = glow('#9fd6c0', 2.2); door.sglow.position.copy(seal.position); door.sglow.position.x -= 0.05; E.group.add(door.sglow); door.sglow.visible = seal.visible;
    // the beacon: an iron basket on a bracket over the arch, inside, a flame in it when lit (the oil's goal only)
    const bb = new Batcher({ vertexColors: true, castShadow: false, receiveShadow: true });
    const by = E.topY + E.doorH + 0.32, bx = E.uIn - 0.34;
    bb.add(GEO.box, IRON, { x: E.uIn - 0.12, y: by - 0.25, sx: 0.24, sy: 0.06, sz: 0.06 });
    bb.add(GEO.box, IRON, { x: E.uIn - 0.2, y: by - 0.12, sx: 0.06, sy: 0.3, sz: 0.06, rz: 0.4 });
    bb.add(GEO.cyl8, IRON, { x: bx, y: by, sx: 0.2, sy: 0.14, sz: 0.2 });
    bb.add(GEO.cyl8, '#141418', { x: bx, y: by + 0.075, sx: 0.17, sy: 0.02, sz: 0.17 });
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; bb.add(GEO.box, IRON, { x: bx + Math.cos(a) * 0.19, y: by + 0.06, z: Math.sin(a) * 0.19, sx: 0.02, sy: 0.2, sz: 0.02, rz: -Math.cos(a) * 0.3, rx: Math.sin(a) * 0.3 }); }
    door.beaconMeshes = bb.build(E.group, 'mz-goal-beacon');
    for (const m of door.beaconMeshes) m.visible = goal === 'oil';
    const fb = new Batcher({ vertexColors: true, castShadow: false, receiveShadow: false });
    fb.add(GEO.cone8, '#ffd27a', { x: bx, y: by + 0.36, sx: 0.17, sy: 0.5, sz: 0.17 });
    fb.add(GEO.sphere, '#ff9a3a', { x: bx, y: by + 0.15, sx: 0.18, sy: 0.12, sz: 0.18 });
    const fm = fb.build(E.group, 'mz-goal-beacon-flame'); for (const m of fm) { m.material = kit.M.flame; m.visible = false; } door.flame = fm; door.flameAt = { x: bx, y: by };
    door.bglow = glow('#ffb060', 0); door.bglow.position.set(bx, by + 0.3, 0); E.group.add(door.bglow); door.bglow.visible = false;
    // the beacon's light: a fixed torch the atmosphere places (maze-fx.js picks the nearest two), at nothing until lit
    const wp = E.at(E.uIn - 0.9); door.torch = { x: wp.x, y: by + 0.4, z: wp.z, color: '#ffc070', k: 0 }; kit.torches.push(door.torch);
    // shut: a collider across the doorway (high: it holds up on the landing) and the escape held off (maze-scene.js asks `open`)
    const p = E.at(E.uIn + 0.05, -E.doorW / 2), q = E.at(E.uIn + 0.3, E.doorW / 2);
    door.box = { minX: Math.min(p.x, q.x), maxX: Math.max(p.x, q.x), minZ: Math.min(p.z, q.z), maxZ: Math.max(p.z, q.z), high: true, goalDoor: true };
    const er = maze.exitRoom;
    const setShut = on => { for (let y = er.y0; y <= er.y1; y++) for (let x = er.x0; x <= er.x1; x++) { const list = kit.cellBoxes[y * W + x], i = list.indexOf(door.box); if (on && i < 0) list.push(door.box); if (!on && i >= 0) list.splice(i, 1); } };
    door.setShut = setShut;
    if (S.open) { pivot.rotation.y = -1.35; pivot.visible = goal !== 'escape'; seal.visible = false; door.sglow.visible = false; if (S.lit) light(false); }
    else setShut(true);
    if (goal === 'escape') pivot.visible = false;
  }
  function light(play = true) {
    if (door.lit) return;
    door.lit = 1; door.torch.k = 1.4; door.bglow.visible = true; for (const m of door.flame) m.visible = true;
    if (play) { const w = E.at(E.uIn - 0.3); sfx('maze-beacon', w.x, w.z, E.topY + E.doorH); }
  }
  function openDoor(why, play = true) {
    if (door.openT >= 0 || S.open && door.pivot.rotation.y < -1) return;
    door.openT = 0; door.setShut(false);
    if (goal === 'signs' && play) { door.sealT = 0; const w = E.at(E.uIn); sfx('maze-seal', w.x, w.z, E.topY + 1.2); scene.fx?.gutter?.(0.6); }
    log.events.push('open:' + why);
  }

  // ---- what you carry: the cask under your lantern arm (the lantern hangs lower, you are slower, a slosh with each step), the
  // book under the arm; on your body in third person and on your friends' bodies too
  const carried = { cask: null, book: null, mine: null };
  function carryMesh(kind) {
    const b = new Batcher({ vertexColors: true, castShadow: false, receiveShadow: false });
    if (kind === 'cask') { b.add(SHAPES.barrel, '#5e4630', { sx: 0.34, sy: 0.34, sz: 0.34, y: -0.15 }); for (const y of [-0.08, 0.1]) b.add(GEO.cyl12, IRON, { y, sx: 0.105, sy: 0.02, sz: 0.105 }); }
    else { b.add(GEO.box, '#7a2f3a', { sx: 0.05, sy: 0.24, sz: 0.3 }); b.add(GEO.box, '#f3efe6', { x: 0.01, sx: 0.04, sy: 0.22, sz: 0.28 }); }
    const g = new THREE.Group(); g.name = 'mz-carry-' + kind; b.build(g, 'mz-carry-' + kind); return g;
  }
  function holdOn(h, kind, on) { // a body (yours in third person, a friend's): the thing under the left arm
    const key = 'mzCarry' + kind;
    if (on && !h.root.userData[key]) { const g = carryMesh(kind); g.position.set(0, -0.1, 0.1); g.rotation.z = kind === 'cask' ? 0.2 : 0; g.userData.upright = true; (h.handL || h.root).add(g); h.root.userData[key] = g; } // (carried level whatever the arm does: human.js)
    if (!on && h.root.userData[key]) { const g = h.root.userData[key]; g.parent?.remove(g); delete h.root.userData[key]; }
  }
  function myCarry(kind, on) { // first person: in the hand group, below the forearm (the lantern arm holds it)
    if (on && !carried[kind]) { const g = carryMesh(kind); g.position.set(kind === 'cask' ? 0.09 : 0.08, kind === 'cask' ? -0.12 : -0.07, kind === 'cask' ? 0.12 : 0.1); g.rotation.set(0.25, 0.3, kind === 'cask' ? 0.5 : 1.3); hand.add(g); carried[kind] = g; } // (below and right of the lantern, over the forearm: in the frame's lower right on a wide screen (the hand sits 0.62 m out, fov 70), clear of the glass)
    if (!on && carried[kind]) { hand.remove(carried[kind]); carried[kind] = null; }
    if (kind === 'cask') hand.userData.lowered = on ? -CARRY.lower : 0;
    holdOn(scene.body, kind, on);
  }
  const mineKind = () => (carried.cask ? 'cask' : carried.book ? 'book' : null);

  // ---- the server's word
  let stripKey = '';
  function apply(m) {
    S.held = m.held | 0; S.door = m.door; S.open = !!m.open; S.lit = !!m.lit;
    for (const r of m.things || []) {
      const v = views[r.i]; if (!v) continue;
      const was = v.t.st, by = v.t.by;
      v.t = { ...v.t, ...r };
      if (r.kind === 'scout') { onScout(r, was); continue; }
      const shown = r.st === 'placed' || r.st === 'dropped';
      if ((r.st === 'placed' || r.st === 'dropped') && (r.x !== v.g.position.x || r.z !== v.g.position.z)) { v.g.position.set(r.x, floorY(r.x, r.z), r.z); v.known = false; }
      v.g.visible = shown;
      if (v.glow && r.kind === 'cask') v.glow.visible = r.st === 'dropped';
      // who carries what: under their arm
      if (r.kind === 'cask' || r.kind === 'book') {
        const mine = r.st === 'held' && r.by === net.sid;
        myCarry(r.kind, mine);
        for (const rm of remotes.values()) holdOn(rm.h, r.kind, r.st === 'held' && r.by === rm.sid);
      }
      if (was !== r.st && r.st === 'held' && (m.e === 'take') && m.i === r.i) { sfx('maze-take', r.x, r.z, 1); if (m.sid === net.sid) { audio.ui?.('sparkle'); log.takes++; } }
      if (was !== r.st && r.st === 'dropped' && m.e === 'drop' && m.i === r.i) ui.toast(m.sid === net.sid ? `You dropped ${TXT.thing}. Anyone can pick it up.` : `${m.name || 'Someone'} dropped ${TXT.thing}.`, 4200);
      void by;
    }
    if (m.e === 'read' && m.i !== undefined) read(m);
    if (m.e === 'light') { light(true); ui.toast(m.sid === net.sid ? 'The beacon is lit! The door is open.' : `${m.name || 'Someone'} lit the beacon! The door is open.`, 4200); }
    if (m.e === 'returned') ui.toast(m.sid === net.sid ? "The Professor's book, out of the dark at last. The door is open." : `${m.name || 'Someone'} brought the book to the door. It is open.`, 4200);
    if (m.e === 'up') ui.toast(m.sid === net.sid ? `${scout?.name || 'The scout'} runs up the stair ahead of you. Go on!` : `${m.name || 'Someone'} brought ${scout?.name || 'the scout'} to the door. It is open.`, 4200);
    if (m.e === 'open' || (S.open && door.openT < 0)) openDoor(m.why || 'open', m.e === 'open');
    if (m.e === 'take' && goal === 'signs' && m.held < need) ui.toast(`${m.sid === net.sid ? 'You' : m.name || 'Someone'} found an Elder Sign. ${need - m.held} to go.`, 3600);
    if (m.e === 'take' && goal === 'signs' && m.held >= need) ui.toast('The third Elder Sign! The seal on the door breaks.', 4200);
    if (m.e === 'take' && goal === 'pages' && m.held >= need && m.i !== undefined && m.things[m.i]?.st === 'held' && m.held === need) ui.toast('Four pages. The door is open.', 4200);
    if (m.e === 'found') ui.toast(m.sid === net.sid ? `${scout?.name || 'The scout'}: "You found me!" They will follow you. Get them to the door.` : `${m.name || 'Someone'} found ${scout?.name || 'the scout'}.`, 4600);
    if (m.e === 'fled') ui.toast(`${scout?.name || 'The scout'} ran off to hide again! Find them.`, 4200);
    if (m.e === 'call') call();
    if (m.e) log.events.push(m.e + (m.i !== undefined ? ':' + m.i : ''));
    paintStrip();
  }
  function onMsg(m) { if (m.op === 'goal' && !m.refused) apply(m); else if (m.op === 'goal' && m.refused) { if (m.why === 'hands full') ui.toast('Your hands are full.', 2200); log.events.push('refused:' + m.refused); } }
  // the party strip: the goal's name and the slots filling (the pages: four needed of five)
  function paintStrip() {
    if (goal === 'escape') return;
    let name = TXT.strip, dots = '';
    if (goal === 'signs' || goal === 'pages') { for (let i = 0; i < need; i++) dots += i < S.held ? '◆' : '◇'; name = `${TXT.strip} ${Math.min(S.held, need)} of ${need}`; }
    else {
      const t = views[0]?.t;
      if (!t) name = TXT.strip;
      else if (goal === 'scout') name = t.st === 'hiding' ? `${scout?.name || 'The scout'} is hiding. Listen.` : t.st === 'following' ? (t.by === net.sid ? `${scout?.name} follows you` : `${scout?.name} follows ${remotes.get(t.by)?.name || 'a friend'}`) : `${scout?.name} went up. Go!`;
      else if (t.st === 'held') name = t.by === net.sid ? `You carry ${TXT.thing}${goal === 'oil' ? ': light the beacon' : ': to the door'}` : `${remotes.get(t.by)?.name || 'A friend'} carries ${TXT.thing}`;
      else if (t.st === 'used') name = goal === 'oil' ? 'The beacon is lit. Go!' : 'The book is at the door. Go!';
      else name = `${TXT.strip}: find it`;
    }
    const key = name + dots + S.door;
    if (key === stripKey) return;
    stripKey = key; stripName.textContent = name; slots.textContent = dots; slots.hidden = !dots;
    strip.classList.toggle('open', S.open);
  }
  paintStrip();

  // ---- the pages read aloud in the finder's investigator voice (the words on everyone's screen; the voice from where they are)
  function read(m) {
    const line = PAGE_LINES[m.i % PAGE_LINES.length], mine = m.sid === net.sid, who = mine ? 'You' : m.name || 'Someone';
    ui.toast(`${who} read${mine ? '' : 's'} the page: "${line}"`, 7000);
    log.reads.push({ i: m.i, sid: m.sid, line });
    const inv = mine ? scene.inv : remotes.get(m.sid)?.inv, v = voiceFor(inv), p = mine ? { x: me.x, z: me.z } : remotes.get(m.sid) ? { x: remotes.get(m.sid).ax, z: remotes.get(m.sid).az } : null;
    if (p) { audio.speak?.(p.x + origin.x, 1.5 + origin.y, p.z + origin.z, line, { pitch: v.f0 * 1.25, rate: v.rate * 0.85, formant: v.formant / 1000 }); if (!mine) { const r = remotes.get(m.sid); if (r) ui.say(r.vis, line, 7, 2.3); } }
  }

  // ---- the lost scout: hiding (crouched in the spot, a call every 20 s), following a step behind the finder, running for a hiding
  // spot when the finder is grabbed, and up the flight ahead of the finder at the door
  const ROUTE = () => scene.maze;
  function routeCells(a, b) {
    const m = ROUTE(), d = new Int32Array(W * H).fill(-1), from = new Int32Array(W * H).fill(-1), q = [a]; d[a] = 0;
    for (let i = 0; i < q.length && d[b] < 0; i++) { const cc = q[i], x = cc % W, y = (cc - x) / W; for (const [dx, dy, bit] of DIRS) { if (m.cells[cc] & bit) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (d[n] < 0) { d[n] = d[cc] + 1; from[n] = cc; q.push(n); } } }
    if (d[b] < 0) return null;
    const out = []; for (let cc = b; cc !== a; cc = from[cc]) out.push(cc); return out.reverse();
  }
  function onScout(r, was) {
    if (!scout) return;
    scout.st = r.st; scout.t = r;
    if (r.st === 'hiding' && was !== 'hiding') {
      // run from where the finder was to the hiding spot by the cells, then crouch
      const from = r.fromX !== undefined ? { x: r.fromX, z: r.fromZ } : { x: scout.x, z: scout.z };
      scout.x = from.x; scout.z = from.z;
      const cells = routeCells(cellOf(from.x, from.z), cellOf(r.x, r.z)) || [];
      scout.route = [...cells.map(c => ({ x: (c % W) * CELL + 2, z: Math.floor(c / W) * CELL + 2 })), { x: r.x, z: r.z }]; scout.ri = 0;
    }
    if (r.st === 'following') { scout.route = null; }
    if (r.st === 'up' && was !== 'up') { scout.route = null; scout.upT = 0; scout.upU = ES.local(scout.x, scout.z)[0]; }
    scout.g = views[0].g; scout.g.visible = true;
  }
  function call() {
    if (!scout || scout.st !== 'hiding') return;
    const h = scout.body, wx = scout.x + origin.x, wz = scout.z + origin.z;
    audio.speak?.(wx, 1.1 + origin.y, wz, 'hello? is someone there?', { pitch: 300, rate: 1.15 });
    h.say?.(1.4);
    ui.say(scout.vis, 'hello? is someone there?', 4, 1.9);
    log.events.push('call');
  }
  function stepScout(dt, now) {
    if (!scout) return;
    const h = scout.body, g = views[0].g;
    let speed = 0, pose = null, want = null;
    if (scout.st === 'hiding') {
      if (scout.route && scout.ri < scout.route.length) {
        const p = scout.route[scout.ri], dx = p.x - scout.x, dz = p.z - scout.z, d = Math.hypot(dx, dz), step = Math.min(d, SCOUT_RUN * dt);
        if (d > 1e-3) { scout.x += dx / d * step; scout.z += dz / d * step; scout.yaw = Math.atan2(dx, dz); }
        if (d <= step + 1e-3) scout.ri++;
        speed = SCOUT_RUN;
      } else { scout.x = scout.t.x; scout.z = scout.t.z; scout.yaw = scout.t.yaw || scout.yaw; pose = 'crouch'; }
    } else if (scout.st === 'following') {
      const r = scout.t.by === net.sid ? { x: me.x, z: me.z, yaw: me.face ?? me.yaw } : (remotes.get(scout.t.by) ? { x: remotes.get(scout.t.by).ax, z: remotes.get(scout.t.by).az, yaw: remotes.get(scout.t.by).h.root.rotation.y } : null);
      if (r) {
        want = { x: r.x - Math.sin(r.yaw) * SCOUT_LAG, z: r.z - Math.cos(r.yaw) * SCOUT_LAG };
        const dx = want.x - scout.x, dz = want.z - scout.z, d = Math.hypot(dx, dz);
        if (d > 0.25) { const sp = Math.min(SCOUT_RUN, SCOUT_WALK + d * 1.2), step = Math.min(d, sp * dt); scout.x += dx / d * step; scout.z += dz / d * step; scout.yaw = Math.atan2(dx, dz); speed = sp; }
        else { scout.yaw = r.yaw; }
        if (d > 7) { scout.x = want.x; scout.z = want.z; } // (never left far behind: a teleport a friend's screen would not see anyway)
        scout.shiver = speed < 0.5 ? scout.shiver + dt : 0;
      }
    } else if (scout.st === 'up') {
      // up the flight ahead of the finder, through the door and out of sight
      scout.upT += dt; scout.upU += SCOUT_RUN * dt; const p = ES.at(scout.upU, Math.sin(scout.upT * 3) * 0.1); scout.x = p.x; scout.z = p.z; scout.yaw = ES.yaw; speed = SCOUT_RUN;
      if (scout.upU > ES.uOut + 4) { g.visible = false; return; }
    }
    const y = scout.st === 'up' ? ES.floorAt(scout.x, scout.z, 3.5) ?? ES.topY : floorY(scout.x, scout.z);
    g.position.set(scout.x, y, scout.z); g.rotation.y = scout.yaw;
    // a shiver when they stand still (cold and scared), none crouched
    g.rotation.z = pose ? 0 : Math.sin(now * 31) * 0.012 * Math.min(1, scout.shiver);
    h.update(dt, now, speed, pose);
    scout.speed = speed;
    if (scout.vis) scout.vis.visible = scene.inSight ? scene.inSight(scout.x, scout.z, 0) : true;
  }

  // ---- the E prompt and the pickups (the server has the word: E sends an ask)
  const reach = () => (scene.inv === 'detective' ? PICK.detective : PICK.r);
  function nearThing() {
    let best = null, bd = Infinity;
    for (const v of views) { const t = v.t; if (!(t.st === 'placed' || t.st === 'dropped' || t.st === 'hiding')) continue; const x = t.kind === 'scout' ? scout.x : t.x, z = t.kind === 'scout' ? scout.z : t.z, d = Math.hypot(x - me.x, z - me.z); if (d <= reach() && d < bd) { bd = d; best = v; } }
    return best;
  }
  const atDoor = () => Math.hypot(me.x - E.at(E.uMid).x, me.z - E.at(E.uMid).z) <= DOOR_R && me.y > 2;
  function hint() {
    if (scene.phase !== 'maze') return null;
    if (goal === 'oil' && carried.cask && atDoor() && !S.lit) return 'E  ' + TXT.use;
    const v = nearThing(); if (!v) return null;
    if ((v.t.kind === 'cask' || v.t.kind === 'book') && mineKind()) return 'E  Your hands are full';
    return 'E  ' + TXT.take;
  }
  // where you are with the ask: the server judges the reach from its believed walk, and the 10 Hz position can be a step behind
  // the prompt you saw (it still has to continue the walk it believes: lib/maze.js goalAct)
  const here = () => ({ x: +me.x.toFixed(2), z: +me.z.toFixed(2) });
  function onE() {
    if (scene.phase !== 'maze') return false;
    if (goal === 'oil' && carried.cask && atDoor() && !S.lit) { net.send({ t: 'maze', op: 'goal', act: 'light', ...here() }); return true; }
    const v = nearThing(); if (!v) return false;
    if ((v.t.kind === 'cask' || v.t.kind === 'book') && mineKind()) { ui.toast('Your hands are full.', 2000); return true; }
    net.send({ t: 'maze', op: 'goal', act: 'take', ...here() }); audio.ui?.('blip');
    return true;
  }

  // ---- the distance line's target: the nearest thing still to find (by the cells), then the way out
  const fields = new Map(); // thing i -> metres to it from every cell's middle
  function fieldTo(x, z) {
    const c0 = cellOf(x, z), t = new Float32Array(W * H).fill(1e9), q = [c0]; t[c0] = 0;
    for (let i = 0; i < q.length; i++) { const c = q[i], cx = c % W, cy = (c - cx) / W; for (const [dx, dy, bit] of DIRS) { if (maze.cells[c] & bit) continue; const n = (cy + dy) * W + cx + dx; if (t[c] + CELL < t[n] - 1e-3) { t[n] = t[c] + CELL; q.push(n); } } }
    return t;
  }
  function metresOn(f, x, z, tx, tz) {
    const c = cellOf(x, z);
    if (f[c] === 0) return Math.hypot(tx - x, tz - z);
    let best = -1, bt = f[c];
    const cx = c % W, cy = (c - cx) / W;
    for (const [dx, dy, bit] of DIRS) { if (maze.cells[c] & bit) continue; const n = (cy + dy) * W + cx + dx; if (f[n] < bt) { bt = f[n]; best = n; } }
    if (best < 0) return f[c] >= 1e8 ? -1 : f[c];
    return bt + Math.hypot(x - ((best % W) * CELL + 2), z - (Math.floor(best / W) * CELL + 2));
  }
  function target() {
    if (goal === 'escape' || S.open) return null;
    if (goal === 'oil' && views[0]?.t.st === 'held') return views[0].t.by === net.sid ? { m: null, label: 'the beacon' } : null; // (the carrier's line counts to the door: the scene's own)
    if (goal === 'book' && views[0]?.t.st === 'held') return null;
    if (goal === 'scout' && scout && scout.st !== 'hiding') return null;
    let best = null, bm = Infinity;
    for (const v of views) {
      const t = v.t; if (!(t.st === 'placed' || t.st === 'dropped' || t.st === 'hiding')) continue;
      const key = t.i + ':' + t.x + ',' + t.z;
      let f = fields.get(key); if (!f) { f = fieldTo(t.x, t.z); fields.set(key, f); if (fields.size > 12) fields.delete(fields.keys().next().value); }
      const m = metresOn(f, me.x, me.z, t.x, t.z);
      if (m >= 0 && m < bm) { bm = m; best = v; }
    }
    if (!best) return null;
    return { m: bm, label: TXT.thing, i: best.t.i };
  }

  // ---- each frame: the glows breathe, the known things (the Librarian's map), the scout, the seal and the leaf, the beacon's flame
  let glowT = 0, sloshT = 0;
  function frame(dt, now) {
    glowT += dt;
    for (const v of views) {
      if (v.glow && v.g.visible) { const k = 0.7 + 0.3 * Math.sin(glowT * 2.1 + v.t.i * 1.7); v.glow.material.opacity = 0.55 * k; }
      if (!v.known && v.g.visible && (v.t.st === 'placed' || v.t.st === 'dropped' || v.t.st === 'hiding')) { const x = v.t.kind === 'scout' ? scout.x : v.t.x, z = v.t.kind === 'scout' ? scout.z : v.t.z; if (Math.hypot(x - me.x, z - me.z) < SEEN_R && (!scene.inSight || scene.inSight(x, z, 0))) v.known = true; }
    }
    stepScout(dt, now);
    if (door.sealT >= 0) { door.sealT += dt; const k = Math.min(1, door.sealT / 0.8); door.seal.scale.setScalar(1 + k * 1.6); door.seal.material.opacity = 1 - k; door.sglow.material.opacity = 0.8 * (1 - k); if (k >= 1) { door.seal.visible = false; door.sglow.visible = false; door.sealT = -1; } }
    else if (door.seal.visible) { door.seal.material.opacity = 0.75 + 0.25 * Math.sin(glowT * 1.7); door.sglow.material.opacity = 0.5 + 0.3 * Math.sin(glowT * 1.7); }
    if (door.openT >= 0) {
      const wasT = door.openT; door.openT += dt;
      const delay = goal === 'signs' ? 0.7 : 0.05; // (the seal breaks first)
      if (wasT < delay && door.openT >= delay) { const w = E.at(E.uIn); sfx('maze-leaf', w.x, w.z, E.topY + 1); }
      const k = Math.max(0, Math.min(1, (door.openT - delay) / 1.1)), e = 1 - (1 - k) * (1 - k);
      door.pivot.rotation.y = -1.35 * e;
      if (k >= 1) door.openT = -1;
    }
    if (door.lit) { const f = 0.85 + 0.15 * Math.sin(now * 23) + 0.08 * Math.sin(now * 7.3); door.torch.k = 1.4 * f; door.bglow.scale.setScalar(2.4 * f); for (const m of door.flame) m.scale.set(1, 0.9 + 0.2 * f, 1); }
    if (carried.cask && me.speed > 0.3) { sloshT += dt * (1.2 + me.speed * 0.3); }
  }
  // a footfall (maze-scene.js): the cask sloshes with each step, louder at a run (the server hears it 1.5 x as far)
  function step(wet, run) { if (carried.cask) sfx('maze-slosh', me.x, me.z, 1.0, { k: run ? 1.3 : 0.9 }); }

  function dispose() {
    for (const v of views) { v.g.parent?.remove(v.g); for (const m of v.meshes) m.geometry?.dispose?.(); v.glow?.material.dispose(); v.tag?.remove(); v.body?.dispose?.(); }
    door.pivot?.parent?.remove(door.pivot); door.seal?.parent?.remove(door.seal); door.seal?.material.dispose(); door.sglow?.parent?.remove(door.sglow);
    for (const m of [...(door.beaconMeshes || []), ...(door.flame || [])]) { m.parent?.remove(m); m.geometry?.dispose?.(); }
    door.bglow?.parent?.remove(door.bglow);
    { const i = kit.torches.indexOf(door.torch); if (i >= 0) kit.torches.splice(i, 1); }
    door.setShut?.(false);
    myCarry('cask', false); myCarry('book', false);
    strip.remove();
  }

  return {
    goal, need, onMsg, frame, hint, onE, target, step, dispose,
    get open() { return S.open; },
    get paceK() { return carried.cask ? { walk: CARRY.walk, run: CARRY.run } : null; },
    known: () => views.filter(v => v.known && (v.t.st === 'placed' || v.t.st === 'dropped' || v.t.st === 'hiding')).map(v => ({ x: v.t.kind === 'scout' ? scout.x : v.t.x, z: v.t.kind === 'scout' ? scout.z : v.t.z, kind: v.t.kind })),
    // tests
    get state() { return { ...S, things: views.map(v => v.t) }; }, get strip() { return strip.hidden ? '' : stripName.textContent + (slots.hidden ? '' : ' ' + slots.textContent); },
    get door() { return { state: S.door, open: S.open, leaf: door.pivot.rotation.y, shut: kit.cellBoxes[maze.exitRoom.y0 * W + maze.exitRoom.x0].includes(door.box), seal: door.seal.visible, lit: !!door.lit, torchK: door.torch.k }; },
    get carrying() { return mineKind(); }, get lowered() { return hand.userData.lowered || 0; },
    get scout() { return scout ? { st: scout.st, x: scout.x, z: scout.z, speed: scout.speed, visible: views[0].g.visible, name: scout.name } : null; },
    views, log, nearThing: () => nearThing()?.t || null, call,
  };
}
