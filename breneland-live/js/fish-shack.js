// The fish shack beside Kevin's pier (layout.js FISH_SHACK), where Mabel swaps your pole and bait for free once Kevin has
// given you a rod. The gear is fish-gear.js, the choice lives in fishing.js (ctx.fishGear).
// Mabel keeps shop 7 am to 8 pm, then walks home to Maple Row and back. Her day is a pure function of the shared clock,
// so every visitor sees her in the same place.
import * as THREE from 'three';
import { propsReady, addProp } from './props-static.js';
import { FISH_SHACK } from './layout.js';
import { terrainHeight } from './terrain.js';
import { toon, shadows } from './toon.js';
import { Batcher, GEO } from './batch.js';
import { lampGlow, addNightSpot } from './daynight-mats.js';
import { signTexture } from './areas.js';
import { Human } from './human.js';
import { TOWN_HOUSES } from './world-town.js';
import { streetY } from './mailman-route.js';
import { hourAt, sinceHour } from './npcs-day.js';
import { el, loadCss, hash01, alongPolyline, polylineLength } from './util.js';
import { POLES, BAITS, POLE_IDS, BAIT_IDS } from './fish-gear.js';
import { poleSVG, baitSVG } from './fish-art.js';
import { NPCS, lookOf, voiceOf, tagOf } from './npc-looks.js';
import { buildFishBoard } from './fish-board.js';
import { addSurface } from './terrain.js';
import { fishShackModel, fishShackMesh, fishShackAnchor, fishShackAnchors, fishShackColliders } from './fish-shack-model.js';   // (fish-shack-setpiece) the Blender set piece, when it loaded

// what Mabel says when you pick something (her own words; the numbers are in fish-gear.js)
const QUIP = {
  stick: 'Kevin\'s old stick. It has caught more fish than I have.', bamboo: 'Bamboo! Light as a feather and it reaches the far shadows.',
  spinner: 'The Spinner. Click click click, and the fish is in.', lucky: 'The Lucky Rod. Do not lose it, he would cry for a week.',
  none: 'Just the bobber. Old school.', worms: 'Worms! Everything with a mouth likes a worm.', crickets: 'Crickets. The perch go silly for them.',
  spoon: 'The spoon. Mackerel chase anything shiny, and so does the golden one.', frog: 'The frog! The big bass cannot stand it. Squeak!',
};

// Mabel: ginger bun under a straw hat, green overalls, yellow boots, a laugh you can hear from the pier.
export const VENDOR = 'Mabel';
export const VENDOR_HOURS = [7, 20];
const VENDOR_LOOK = NPCS.mabel.look;   // (npc-looks.js: the NPC Editor dresses her)
const WALK_SPEED = 1.45;
const WALKER = { r: 0.34 };
const HELLO = {
  morning: ['Mornin\'! Bait is fresh, poles are free.', 'Morning! Kettle is on, worms are wriggling.'],
  day: ['Hello, hello! What are we fishing for today?', 'Hiya! Come and pick a pole.'],
  evening: ['Evening! Last swaps before I lock up at eight.', 'Hello, love. Still time for a pole before eight.'],
};
const TALK = ['Pick a pole, pick a bait, no charge. Kevin\'s orders.', 'Crickets for perch, worms for anything with a mouth.', 'That lucky rod? Older than the pier and twice as stubborn.', 'The shiny spoon if you are after the golden one.', 'The rubber frog drives the bass up the wall.', 'Tell Kevin his bucket is still here.'];
const NO_ROD = 'No pole yet? Go and see Kevin at the end of the pier, he has a stick rod to spare.';
const PASSING = { home: ['Shop\'s shut, love. Back at seven!', 'Long day. Worms to bed, me to bed.'], back: ['Opening up at seven. Walk with me!', 'Mornin\'! Shack opens at seven.'] };

export function createFishShack(ctx) {
  const { scene, colliders, ui, audio, inventory, player, net } = ctx;
  loadCss('/css/shack.css');
  const { x: sx, z: sz, w, d } = FISH_SHACK;
  const gy = terrainHeight(sx, sz);
  const g = new THREE.Group(); g.name = 'fish-shack'; scene.add(g);
  const b = new Batcher({ vertexColors: true });
  const minX = sx - w / 2, maxX = sx + w / 2, minZ = sz - d / 2, maxZ = sz + d / 2, H = 2.7, T = 0.18; // the hatch faces south (+z), toward the pier
  const HX = 1.35, HY0 = gy + 1.0, HY1 = gy + 2.15;   // the hatch: an opening in the south wall, x within sx +- HX
  const BOARD = '#c9c2ae', LINE = '#857f70', WOOD = '#7a5234';
  const AW = 3.2, AL = 1.35, AANG = 0.3, AY = gy + 2.22, AZ = maxZ + 0.02;                                            // the code-built awning: hinged above the hatch, sloping down and out
  const ac = { y: AY - (AL / 2) * Math.sin(AANG), z: AZ + (AL / 2) * Math.cos(AANG) };
  const ae = { y: AY - AL * Math.sin(AANG), z: AZ + AL * Math.cos(AANG) };                                             // the outer edge
  // (fish-shack-setpiece) the Blender set piece (fish-shack-model.js): a taller bait and tackle shack with a covered porch, built to
  // this same footprint, hatch, counter, door and board; the code keeps the sign's words, the OPEN sign, the shutter, the board's
  // face, the lamps' glowing glass and Mabel, at the model's anchors. Without it, the shed below is built as before.
  const M = fishShackModel();
  const SIGN_AT = M ? fishShackAnchor('sign').pos : [sx, gy + H + 0.02, maxZ + 0.06];
  const OPEN_AT = M ? fishShackAnchor('open-sign').pos : [sx + 1.15, ae.y - 0.42, ae.z + 0.02];
  const BOARD_A = M && fishShackAnchor('board');
  if (M) {
    const shell = fishShackMesh('shell', 'fish-shack-shell'), inside = fishShackMesh('inside', 'fish-shack-inside');
    g.add(shell, inside);
    for (const c of fishShackColliders('shack')) colliders.push(c);   // the porch posts, the fridge, the tackle shelf, the buckets, the canoe rack, the cleaning table
    colliders.push({ type: 'box', minX: sx - 1.36, maxX: sx + 1.36, minZ: maxZ, maxZ: maxZ + 0.6 });   // the counter
    const deck = fishShackAnchor('porch-deck');
    if (deck && deck.box) addSurface({ minX: deck.box[0], maxX: deck.box[3], minZ: deck.box[2], maxZ: deck.box[5], y: deck.box[4], sound: 'wood' });   // the porch deck: a step up you walk on
    // every light from a visible source: the glass glows in the model's lantern cages and under the pendant's shade
    const gb = new Batcher({ castShadow: false });
    for (const a of fishShackAnchors('glow-')) {
      const col = '#' + (a.color || 'ffd98e'), r = a.r || 0.08, hh = a.h || 0.16;
      gb.add(GEO.sphere, lampGlow(col), { x: a.pos[0], y: a.pos[1], z: a.pos[2], sx: r, sy: hh / 2, sz: r });
      addNightSpot({ x: a.pos[0], y: a.pos[1], z: a.pos[2], color: col, pool: a.pool || 2.6, gy: a.name === 'glow-pendant' ? gy + 0.06 : gy, halo: a.halo || 0.6 });
    }
    gb.build(g, 'fish-shack-glass');
  } else {
  // ---- a real shed: four walls of grey boards round a plank floor, the hatch cut out of the south wall
  b.boxMinMax(minX + 0.01, gy - 0.05, minZ + 0.01, maxX - 0.01, gy + 0.06, maxZ - 0.01, LINE); // the floor (a hair inside the walls: level with their faces, its edge flickered)
  b.boxMinMax(minX, gy, minZ, maxX, gy + H, minZ + T, BOARD);                            // north
  b.boxMinMax(minX, gy, minZ, minX + T, gy + H, maxZ, BOARD);                            // west
  b.boxMinMax(maxX - T, gy, minZ, maxX, gy + H, maxZ, BOARD);                            // east
  b.boxMinMax(minX, gy, maxZ - T, maxX, HY0, maxZ, BOARD);                               // south, under the counter
  b.boxMinMax(minX, HY0, maxZ - T, sx - HX, gy + H, maxZ, BOARD);                        // south, left of the hatch
  b.boxMinMax(sx + HX, HY0, maxZ - T, maxX, gy + H, maxZ, BOARD);                        // south, right of the hatch
  b.boxMinMax(sx - HX, HY1, maxZ - T, sx + HX, gy + H, maxZ, BOARD);                     // the lintel
  for (let y = gy + 0.3; y < gy + H; y += 0.42) {                                        // the board lines, proud of each wall
    b.boxMinMax(minX - 0.03, y, minZ - 0.03, maxX + 0.03, y + 0.05, minZ, LINE);
    b.boxMinMax(minX - 0.03, y, minZ - 0.03, minX, y + 0.05, maxZ + 0.03, LINE);
    b.boxMinMax(maxX, y, minZ - 0.03, maxX + 0.03, y + 0.05, maxZ + 0.03, LINE);
    if (y + 0.05 > HY0 && y < HY1) { b.boxMinMax(minX - 0.03, y, maxZ, sx - HX, y + 0.05, maxZ + 0.03, LINE); b.boxMinMax(sx + HX, y, maxZ, maxX + 0.03, y + 0.05, maxZ + 0.03, LINE); }
    else b.boxMinMax(minX - 0.03, y, maxZ, maxX + 0.03, y + 0.05, maxZ + 0.03, LINE);
  }
  // ---- the gable roof: a ridge down the middle (north to south), two tin slopes with eaves all round, board gables
  const RISE = 1.2, OVER = 0.55, HS = w / 2 + OVER, ANG = Math.atan2(RISE, HS), SLOPE = Math.hypot(HS, RISE), RD = d + 2 * OVER;
  const gable = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, RISE)]);
  const gableGeo = new THREE.ExtrudeGeometry(gable, { depth: T, bevelEnabled: false });
  b.add(gableGeo, BOARD, { x: sx, y: gy + H, z: minZ });                                 // north gable
  b.add(gableGeo, BOARD, { x: sx, y: gy + H, z: maxZ - T });                             // south gable (the sign hangs on it)
  for (const s of [-1, 1]) {
    const cx = sx + s * HS / 2, cy = gy + H + RISE / 2 + 0.07, rz = -s * ANG;             // the slope's underside sits on the wall tops
    b.add(GEO.box, '#5b6168', { x: cx, y: cy, z: sz, sx: SLOPE, sy: 0.12, sz: RD, rz });
    for (let k = -2; k <= 2; k++) b.add(GEO.box, '#4a5058', { x: cx, y: cy + 0.065, z: sz + k * 1.05, sx: SLOPE, sy: 0.03, sz: 0.08, rz }); // tin seams
    b.add(GEO.box, WOOD, { x: cx, y: cy - 0.04, z: minZ - OVER + 0.03, sx: SLOPE - 0.1, sy: 0.08, sz: 0.08, rz });  // barge boards, a centimetre proud of the tin's ends (level with them, they flickered)
    b.add(GEO.box, WOOD, { x: cx, y: cy - 0.04, z: maxZ + OVER - 0.03, sx: SLOPE - 0.1, sy: 0.08, sz: 0.08, rz });
  }
  b.boxMinMax(sx - 0.2, gy + H + RISE + 0.02, minZ - OVER - 0.02, sx + 0.2, gy + H + RISE + 0.16, maxZ + OVER + 0.02, '#3a3f47'); // the ridge cap, 2 cm past the tin and the barge boards
  b.add(GEO.cyl8, '#3a3f47', { x: sx - 1.4, y: gy + H + 1.0, z: sz - 0.8, sx: 0.12, sy: 1.4, sz: 0.12 });          // the stovepipe through the west slope
  b.add(GEO.cyl8, '#2b2f36', { x: sx - 1.4, y: gy + H + 1.72, z: sz - 0.8, sx: 0.2, sy: 0.08, sz: 0.2 });
  // ---- the counter, deep enough to lean on, and the striped awning over it on two posts
  b.boxMinMax(sx - 1.3, gy + 0.95, maxZ - 0.5, sx + 1.3, gy + 1.05, maxZ + 0.55, '#b98a5a');
  b.boxMinMax(sx - 1.32, gy + 0.9, maxZ + 0.5, sx + 1.32, gy + 0.95, maxZ + 0.58, '#a0744a');                         // its lip
  const NS = 7, SW = AW / NS;
  for (let i = 0; i < NS; i++) b.add(GEO.box, i % 2 ? '#fff4dc' : '#2f5da8', { x: sx - AW / 2 + SW * (i + 0.5), y: ac.y, z: ac.z, sx: SW, sy: 0.05, sz: AL, rx: AANG }); // (the stripes meet edge to edge: overlapping a centimetre they flickered)
  b.add(GEO.box, '#2f5da8', { x: sx, y: ae.y - 0.08, z: ae.z, sx: AW, sy: 0.16, sz: 0.03 });                          // the valance
  for (let i = 0; i < NS; i++) b.add(GEO.cyl8, i % 2 ? '#fff4dc' : '#2f5da8', { x: sx - AW / 2 + SW * (i + 0.5), y: ae.y - 0.16, z: ae.z, sx: SW / 2 - 0.02, sy: 0.03, sz: 0.05 });
  b.add(GEO.cyl6, WOOD, { x: sx, y: ae.y - 0.02, z: ae.z - 0.03, sx: 0.035, sy: AW + 0.2, sz: 0.035, rz: Math.PI / 2 }); // the front bar
  for (const px of [sx - AW / 2 - 0.05, sx + AW / 2 + 0.05]) {                                                        // the posts
    b.add(GEO.cyl6, WOOD, { x: px, y: (gy + ae.y - 0.04) / 2, z: ae.z - 0.03, sx: 0.05, sy: ae.y - 0.04 - gy, sz: 0.05 });
    colliders.push({ type: 'circle', x: px, z: ae.z - 0.03, r: 0.12 });
  }
  // ---- inside: a shelf of bait tins behind the counter, a hanging lamp, Mabel's stool
  b.boxMinMax(minX + T, gy + 1.5, minZ + T, maxX - T, gy + 1.56, minZ + T + 0.35, '#6b4a2b');
  for (let i = 0; i < 6; i++) b.add(GEO.cyl8, ['#e0574f', '#3f7fc9', '#f0c24f', '#7ddc7a', '#fff4dc', '#2f6b4f'][i], { x: minX + 0.6 + i * 0.78, y: gy + 1.66, z: minZ + T + 0.18, sx: 0.12, sy: 0.2, sz: 0.12 });
  b.boxMinMax(minX + T, gy + 2.0, minZ + T, maxX - T, gy + 2.05, minZ + T + 0.3, '#6b4a2b');
  for (let i = 0; i < 4; i++) b.add(GEO.box, i % 2 ? '#c9a26b' : '#8a6240', { x: minX + 0.9 + i * 1.1, y: gy + 2.2, z: minZ + T + 0.15, sx: 0.5, sy: 0.3, sz: 0.2 });
  if (propsReady('pendant_lamp')) addProp(b, 'pendant_lamp', { x: sx, y: gy + H, z: sz }, { skin: 'bait_green' }); // (props-static: it hangs from the ceiling)
  else {
    b.add(GEO.cyl8, '#3a3f47', { x: sx, y: gy + H - 0.3, z: sz, sx: 0.02, sy: 0.6, sz: 0.02 });
    b.add(GEO.cone8, lampGlow('#ffd98e'), { x: sx, y: gy + H - 0.62, z: sz, sx: 0.22, sy: 0.16, sz: 0.22 });
  }
  addNightSpot({ x: sx, y: gy + H - 0.7, z: sz, color: '#ffd98e', pool: 2.6, gy: gy + 0.06, halo: 0.5 });
  b.add(GEO.cyl8, '#6b4a2b', { x: sx + 1.2, y: gy + 0.35, z: minZ + 1.2, sx: 0.18, sy: 0.6, sz: 0.18 });
  // ---- outside: a door on the west wall (Mabel's way in and out), poles in a rack on the east wall, buckets, a lantern
  b.boxMinMax(minX - 0.05, gy, sz + 0.2, minX, gy + 2.05, sz + 1.1, '#6b4a2b');
  b.boxMinMax(minX - 0.06, gy + 0.9, sz + 0.3, minX - 0.04, gy + 1.9, sz + 0.34, '#4a3220');
  b.add(GEO.sphere, '#e0b54a', { x: minX - 0.07, y: gy + 1.05, z: sz + 0.98, sx: 0.04, sy: 0.04, sz: 0.04 });
  for (let i = 0; i < 5; i++) b.add(GEO.cyl6, i % 2 ? '#c9a26b' : '#8a6240', { x: maxX + 0.12, y: gy + 1.2, z: minZ + 0.6 + i * 0.7, sx: 0.02, sy: 2.3 + (i % 3) * 0.3, sz: 0.02, rz: 0.12 });
  b.boxMinMax(maxX + 0.02, gy + 0.9, minZ + 0.3, maxX + 0.22, gy + 0.98, maxZ - 0.3, LINE);
  for (const [bx, bz, c] of [[minX - 0.5, minZ + 0.5, '#aab4bd'], [minX - 0.5, minZ + 1.1, '#3f7fc9'], [minX - 1.0, minZ + 0.8, '#e0574f']]) { b.add(GEO.cyl12, c, { x: bx, y: gy + 0.17, z: bz, sx: 0.2, sy: 0.34, sz: 0.2 }); colliders.push({ type: 'circle', x: bx, z: bz, r: 0.22 }); }
  if (propsReady('wall_lantern')) addProp(b, 'wall_lantern', { x: sx + 2.0, y: gy + 2.3, z: maxZ }, { skin: 'shack_green', glow: lampGlow('#ffd98e') }); // (props-static: on the back wall, facing +z)
  else b.add(GEO.box, lampGlow('#ffd98e'), { x: sx + 2.0, y: gy + 2.3, z: maxZ + 0.1, sx: 0.16, sy: 0.22, sz: 0.16 });
  addNightSpot({ x: sx + 2.0, y: gy + 2.3, z: maxZ + 0.15, color: '#ffd98e', pool: 2.8, gy, halo: 0.8 });
  colliders.push({ type: 'box', minX: minX - 0.08, maxX: maxX + 0.3, minZ: minZ - 0.08, maxZ: maxZ + 0.6 });
  b.build(g, 'fish-shack');
  }
  // the sign on the front gable, above the awning; the shutter and the open / closed sign change with Mabel's hours
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshBasicMaterial({ map: signTexture(['FISH SHACK', 'poles & bait, free'], { bg: '#2f5da8', fg: '#fff4dc', w: 512, h: 112 }), fog: true }));
  sign.position.set(SIGN_AT[0], SIGN_AT[1], SIGN_AT[2]); g.add(sign);
  const shutter = new THREE.Group(); shutter.name = 'fish-shack-shutter'; shutter.position.set(sx, (HY0 + HY1) / 2, maxZ + 0.04); g.add(shutter);
  shutter.add(new THREE.Mesh(new THREE.BoxGeometry(2 * HX + 0.1, HY1 - HY0 + 0.06, 0.06), toon('#8a6240')));
  for (const k of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(2 * HX - 0.2, 0.07, 0.03), toon('#6b4a2b')); m.rotation.z = k * 0.4; m.position.z = 0.045; shutter.add(m); }
  const openMat = new THREE.MeshBasicMaterial({ map: signTexture(['OPEN', '7 am to 8 pm'], { bg: '#e0463c', fg: '#ffffff', w: 256, h: 128 }), fog: true });
  const closedMat = new THREE.MeshBasicMaterial({ map: signTexture(['CLOSED', 'back at 7 am'], { bg: '#2b2340', fg: '#fff4dc', w: 256, h: 128 }), fog: true });
  const openSign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), openMat); openSign.position.set(OPEN_AT[0], OPEN_AT[1], OPEN_AT[2]); g.add(openSign);
  // the leaderboard on the west wall, between the corner and Mabel's door: the top three fishers (fish-board.js; the model frames it)
  const BZ = BOARD_A ? BOARD_A.pos[2] : (minZ + sz + 0.2) / 2 - 0.02;
  const board = buildFishBoard({ group: g, renderer: ctx.renderer, x: BOARD_A ? BOARD_A.pos[0] : minX - 0.03, y0: gy, z: BZ, w: BOARD_A ? BOARD_A.w : Math.min(1.84, sz + 0.2 - minZ - 0.3), h: BOARD_A ? BOARD_A.h : 1.45, lift: BOARD_A ? BOARD_A.lift : 0.85, frame: !M });
  net.on('fishboard', m => { if (m && Array.isArray(m.top)) board.set(m.top); });
  const readBoard = () => {
    const r = board.rows;
    ui.toast(r.length ? 'Top fishers: ' + r.map((x, i) => `${i + 1}. ${x.n} (${x.v} points)`).join(', ') : 'Top fishers: nobody yet. Be the first!', 5200);
    audio.ui?.('blip');
  };
  shadows(g);
  board.face.castShadow = false;
  if (M) { g.getObjectByName('fish-shack-inside').castShadow = false; colliders.push({ type: 'box', minX: minX - 0.08, maxX: maxX + 0.3, minZ: minZ - 0.08, maxZ: maxZ + 0.08 }); }

  // ---- Mabel: behind the counter from 7 to 8, then home to Maple Row and back for seven (a pure function of the clock)
  const COUNTER = { x: sx, z: maxZ - 0.78 };
  const home = (() => { const row = TOWN_HOUSES.filter(h => h.facing === -1); return row.length ? row[Math.floor(hash01('home', VENDOR) * row.length)] : null; })();
  // out of the west door, along the trails to the front gate, down the street, up Maple Ave and along the row to her door
  const HOME_PATH = [[COUNTER.x, COUNTER.z], [minX + 0.7, sz + 0.65], [minX - 0.9, sz + 0.65], [36, -25.5], [27, -27.5], [19, -30], [12, -30.5], [4.2, -29], [3.4, -35], [2.5, -39.4], [2.5, -42.2], [-8, -43.2], [-18, -43.2], [-25.5, -50], [-25.5, -120.5]];
  if (home) HOME_PATH.push([home.door.x, -120.5], [home.door.x, home.door.z]);
  const WALK = { path: HOME_PATH, len: polylineLength(HOME_PATH) };
  WALK.dur = WALK.len / WALK_SPEED;
  const inShack = (x, z) => x > minX && x < maxX && z > minZ && z < maxZ;
  const footY = (x, z) => (inShack(x, z) ? gy + 0.06 : streetY(x, z));
  // Where she is at shared time t: { at: 'counter' } | { hidden } | { x, z, yaw, speed, way: 'home' | 'back' }
  function routine(t) {
    const tIn = sinceHour(t, VENDOR_HOURS[0]), tOut = sinceHour(t, VENDOR_HOURS[1]);
    if (tIn >= tOut) return { at: 'counter' };                       // her working day
    const out = t - tOut;                                            // since she shut up shop
    if (out < WALK.dur) { const [x, z, dx, dz] = alongPolyline(WALK.path, out * WALK_SPEED); return { x, z, yaw: Math.atan2(dx, dz), speed: WALK_SPEED, way: 'home' }; }
    const back = t - (tIn + 86400 - WALK.dur);                       // the walk back ends as the shack opens
    if (back >= 0) { const [x, z, dx, dz] = alongPolyline(WALK.path, WALK.len - back * WALK_SPEED); return { x, z, yaw: Math.atan2(-dx, -dz), speed: WALK_SPEED, way: 'back' }; }
    return { hidden: true };
  }
  const mabel = new Human({ ...lookOf('mabel', VENDOR_LOOK) });
  const VOICE = voiceOf('mabel', NPCS.mabel.voice);
  mabel.root.position.set(COUNTER.x, gy + 0.06, COUNTER.z); scene.add(mabel.root);
  const tag = ui.nameTag(mabel.root, tagOf('mabel', VENDOR), '#ffffff'); tag.max = 16; tag.fade = 11;
  let open = routine(net.serverNow() / 1000).at === 'counter';
  let local = null, greetAt = 0, wasNear = false, cur = { at: 'counter' };
  const speak = (line, secs = 3.5) => { const q = mabel.root.position; ui.say(mabel.root, line, secs, 2.3); audio.speak(q.x, q.y + 1.6, q.z, line, VOICE); mabel.say?.(1.2); };
  const pickLine = (list, salt) => list[Math.floor(hash01('mabel', salt, Math.floor(performance.now() / 7000)) * list.length)];
  const helloLine = () => { const h = hourAt(net.serverNow() / 1000); return pickLine(h < 11.5 ? HELLO.morning : h < 17 ? HELLO.day : HELLO.evening, 'hi'); };
  function greet(line) { local = { anim: 'wave', until: performance.now() / 1000 + 2.4 }; speak(line); }

  // ---- the card: a tile per pole and per bait (an icon that matches the 3D one, its name), and what the pick does
  const gear = ctx.fishGear;   // fishing.js: { pole, bait, set({ pole, bait }) }
  const card = el('div', 'shack-card panel', '', { hidden: '', role: 'dialog', 'aria-label': `${VENDOR}'s Fish Shack` });
  const title = el('div', 'shack-title', `${VENDOR}'s Fish Shack`);
  const sub = el('div', 'shack-sub', `${VENDOR} swaps your pole and bait. Free, Kevin insists.`);
  const rows = el('div', 'shack-rows');
  const poleRow = el('div', 'shack-row', '', { role: 'radiogroup', 'aria-label': 'Pole' }), baitRow = el('div', 'shack-row', '', { role: 'radiogroup', 'aria-label': 'Bait' });
  const info = el('div', 'shack-info');
  const infoName = el('div', 'shack-iname'), blurb = el('div', 'shack-blurb'), perk = el('div', 'shack-perk');
  info.append(infoName, blurb, perk);
  const close = el('button', 'btn primary', 'Done');
  rows.append(el('div', 'shack-h', 'Pole'), poleRow, el('div', 'shack-h', 'Bait'), baitRow);
  card.append(title, sub, rows, info, close);
  ctx.hud.append(card);
  function tile(row, item, art, on, pick) {
    const bt = el('button', 'btn shack-opt' + (on ? ' on' : ''), '', { type: 'button', role: 'radio', 'aria-checked': String(on), 'aria-label': item.name, 'data-id': item.id });
    const ic = el('span', 'shack-ic'); ic.innerHTML = art; // constant markup (fish-art.js)
    bt.append(ic, el('span', 'shack-nm', item.name));
    bt.onclick = () => { pick(); bt.blur(); };
    bt.onfocus = bt.onpointerenter = () => describe(item);
    row.append(bt);
  }
  function describe(item) { infoName.textContent = item.name; blurb.textContent = item.blurb; perk.textContent = item.perk; }
  let quipAt = 0;
  function picked(item) {
    render(); describe(item); audio.ui?.('pop');
    // the rod comes out so you can see what you picked
    if (inventory?.has?.('rod') && inventory.equipped !== 'rod') inventory.equip('rod');
    const now = performance.now();
    if (now > quipAt) { quipAt = now + 1500; speak(QUIP[item.id] || pickLine(TALK, 'talk'), 3); }
  }
  function render() {
    poleRow.replaceChildren(); baitRow.replaceChildren();
    for (const id of POLE_IDS) { const p = POLES[id]; tile(poleRow, p, poleSVG(id), gear.pole === id, () => { gear.set({ pole: id }); picked(p); }); }
    for (const id of BAIT_IDS) { const x = BAITS[id]; tile(baitRow, x, baitSVG(id), gear.bait === id, () => { gear.set({ bait: id }); picked(x); }); }
  }
  function talk() {
    if (!inventory?.count?.('rod')) { greet(NO_ROD); ui.toast('No pole yet. Go and see Kevin at the end of the pier first.', 3600); audio.ui?.('blip'); return; }
    greet(pickLine(TALK, 'talk'));
    render(); infoName.textContent = `${POLES[gear.pole].name} and ${BAITS[gear.bait].name}`; blurb.textContent = 'Pick anything you like. Bring the old one back whenever.'; perk.textContent = '';
    card.hidden = false; player.controls = false; audio.ui?.('chime');
  }
  function hide() { card.hidden = true; if (ctx.playing) player.controls = true; }
  function shut() { ui.toast(`The Fish Shack is shut for the night. ${VENDOR} is back at 7 am.`, 3200); audio.ui?.('blip'); }
  close.onclick = hide;

  return {
    name: 'shack',
    model: !!M,
    gear: () => ({ pole: gear.pole, bait: gear.bait }),
    get cardOpen() { return !card.hidden; },
    board,
    vendor: { name: VENDOR, body: mabel, routine, hours: VENDOR_HOURS, path: HOME_PATH, isOpen: () => open },
    update(dt, now) {
      const t = net.serverNow() / 1000;
      const s = cur = routine(t);
      open = s.at === 'counter';
      shutter.visible = !open;
      openSign.material = open ? openMat : closedMat;
      const r = mabel.root;
      if (s.hidden) { r.visible = false; if (!card.hidden) hide(); return; }
      r.visible = true;
      r.userData.crowd = open ? null : WALKER; // on her walk she gives way to people (crowd.js); behind the counter she stays put
      const tx = open ? COUNTER.x : s.x, tz = open ? COUNTER.z : s.z;
      if (Math.hypot(r.position.x - tx, r.position.z - tz) > 5) r.position.set(tx, footY(tx, tz), tz);
      else { const k = Math.min(1, dt * 10); r.position.x += (tx - r.position.x) * k; r.position.z += (tz - r.position.z) * k; r.position.y = footY(r.position.x, r.position.z); }
      let yaw = open ? 0 : s.yaw, anim = open ? (Math.floor(now / 7) % 4 === 0 ? 'look' : null) : null, speed = open ? 0 : s.speed;
      if (local && now < local.until) { anim = local.anim; yaw = Math.atan2(player.pos.x - r.position.x, player.pos.z - r.position.z); } else local = null;
      let dy = yaw - r.rotation.y; dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2; r.rotation.y += dy * Math.min(1, dt * 7);
      if (Math.abs(player.pos.x - r.position.x) + Math.abs(player.pos.z - r.position.z) < 90) mabel.update(dt, now, speed, anim);
      // she greets you as you come up to the counter (local: a reaction to your own player), once per visit
      if (open) {
        const near = Math.hypot(player.pos.x - sx, player.pos.z - (maxZ + 1.2)) < 4.5;
        if (near && !wasNear && now > greetAt) { greetAt = now + 25; greet(helloLine()); }
        wasNear = near;
      } else wasNear = false;
    },
    target(px, pz) {
      if (!card.hidden) return { hint: 'E  Done', prio: 9, run: hide };
      if (Math.abs(pz - BZ) < 1.1 && px < minX && px > minX - 2.4) return { hint: 'E  Read the top fishers', prio: 4, run: readBoard };
      if (Math.hypot(px - sx, pz - (maxZ + 1.2)) < 2.2) return open ? { hint: `E  Talk to ${VENDOR}`, prio: 5, run: talk } : { hint: 'E  Fish Shack (shut till 7 am)', prio: 5, run: shut };
      const r = mabel.root;
      if (!open && r.visible && cur.way && Math.hypot(px - r.position.x, pz - r.position.z) < 2.6) return { hint: `E  Say hi to ${VENDOR}`, prio: 3, run: () => { greet(pickLine(PASSING[cur.way], 'pass')); player.playEmote?.('wave', performance.now() / 1000); } };
      return null;
    },
    onKey(code) { if (!card.hidden && (code === 'Escape' || code === 'KeyE' || code === 'Enter')) { hide(); return true; } return false; },
    bodies() { const r = mabel.root; return r.visible ? [{ x: r.position.x, z: r.position.z, r: 0.3 }] : []; },
    help: [[['E'], `talk to ${VENDOR} at the Fish Shack by the pier for a pole and bait (free, 7 am to 8 pm)`]],
  };
}
