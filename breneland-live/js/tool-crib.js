// Kevin's Tool Crib on Summit Rd (layout.js TOOL_CRIB; tool-crib-plan.js the numbers, tool-crib-build.js the building): the old
// hardware store's shell made a homey general store you walk into. Open Monday to Friday 8 to 5 and Saturday 7 to 11 am Eastern: Kevin minds it (his
// week is kevin-day.js, a pure function of the shared clock), neighbours drop in now and then (cribVisits, pure: a town resident
// who is at home just then, so nobody is in two places), a word at the counter, a look round, back to pay. After hours the door
// is locked (it still lets you out) and the loft's window glows while his lamp is on. The stair at the back goes up to his
// loft (reachable while the shop is open: the stair is inside). Nothing is traded yet (a future plan).
// Also here, as he goes about his week: the balloons at his odd jobs for anyone near, the props there (a ladder, a toolbox, a paint
// can, the boards), his greetings for his daughters and his son-in-law, and a grumble when he passes Joyce. He is a man of few
// words, and very social: short lines, a wave as often as a word.
// Heard (crib-sound.js): his radio on the wire shelves is the music inside (music.js steps aside), the wall clock ticks, the box
// fan whirs when it is warm, the building creaks; E at the radio turns it off or on for a while. The clock's hands, the fan's
// blades and the radio's needle move (crib-clutter.js clutterMovers).
import * as THREE from 'three';
import { CRIB, cribOpen, isWorkday, cribVisits, ASKS, THANKS, HOURS_TEXT, toWorld, toLocal, worldYaw, worldBox, worldPt, worldBox6 } from './tool-crib-plan.js';
import { buildCrib } from './tool-crib-build.js';
import { kevinState, kevinDayAt, kevinPlans, kevinLoftLight, kevinDoorOpen, cribPath, KEVIN_HOURS, KEVIN_SPOTS, RIDE } from './kevin-day.js';
import { engineLoop } from './town-sfx.js';
import { LAMPS, GLASS, LIGHT, WEATHER } from './daynight-mats.js';
import { Batcher, GEO } from './batch.js';
import { Human } from './human.js';
import { NPCS, TOWN_RESIDENTS, lookOf, voiceOf, tagOf } from './npc-looks.js';
import { residentStates } from './town-life.js';
import { castOn, mayBuild } from './town-cast.js';
import { hash01, alongPolyline, polylineLength } from './util.js';
import { groundHeight } from './terrain.js';
import { indoorView } from './indoor-view.js';
import { createStoreCull } from './game-store-cull.js';
import { insideInk } from './real-glass.js';   // (crib-window) the inside in colour only while looked into from outside on a phone
import { GFX } from './gfx.js';
import { addRoom } from './indoor-rooms.js';
import { mollyFriend } from './molly-brain.js';
import { createCribSprings } from './crib-springs.js';
import { createCribCrossword } from './crib-crossword.js';
import { clutterMovers } from './crib-clutter.js';
import { createCribSound, WARM_C } from './crib-sound.js';

export const CRIB_NAME = "Kevin's Tool Crib";
// Kevin's words (few): in the shop when you say hello, for his daughters, for Andrew, and when he and Joyce pass
export const SHOP_LINES = ["Mornin'.", 'Need a hand?', "Springs. Lots of 'em.", "Paint's on the back wall.", 'Pegboard. Have a look.', 'Holler if you need me.', 'Mind the cat.', 'Nails? Blue bins.'];
export const WELCOME = 'Welcome to the Tool Crib!';
export const JOB_LINES = ["Mornin'.", 'Hold this?', 'Nearly done.', 'Need a hand?', 'Fine day.'];
export const DAUGHTER_LINES = ["There's my girl.", 'Hey, kiddo.', 'My girl!', 'Look who it is.'];
export const OWNER_LINES = ['Andrew. Grab a broom.', 'Come to help?', 'Andrew! Need a hand?', 'Son. Good to see you.'];
export const JOYCE_LINES = { k: ['Joyce.', 'Hmph.', 'Morning, Joyce.', '...'], j: ['Kevin.', 'Hmph. Kevin.', 'Watch where you walk.', 'Still fishing, Kevin?'] };
export const ASK_DAUGHTER = 'Boat tonight, kiddo?';
export const MOLLY_LINES = ['Hey, Molly.', 'Good girl.', 'There she is.', 'Hello, old girl.'];

// The sign: hand-painted, faded gold letters on dark green, a little crooked
function signCanvas() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 236;
  const g = c.getContext('2d');
  g.fillStyle = '#24382f'; g.fillRect(0, 0, 1024, 236);
  g.globalAlpha = 0.08; g.fillStyle = '#ffffff'; for (let i = 0; i < 40; i++) g.fillRect((i * 263) % 1024, 0, 2 + (i % 3), 236); g.globalAlpha = 1; // the board's grain, worn
  g.strokeStyle = '#b8964a'; g.lineWidth = 5; g.strokeRect(18, 16, 988, 204);
  g.save(); g.translate(512, 128); g.rotate(-0.018);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'italic 700 112px Georgia, "Times New Roman", serif';
  g.fillStyle = '#3a2a14'; g.fillText(CRIB_NAME, 4, 5);
  g.fillStyle = '#d2ac57'; g.fillText(CRIB_NAME, 0, 0);
  g.restore();
  g.globalAlpha = 0.18; g.fillStyle = '#24382f'; for (let i = 0; i < 160; i++) { const x = (i * 397) % 1000 + 12, y = (i * 131) % 200 + 18; g.fillRect(x, y, 6 + (i % 5) * 3, 2 + (i % 3)); } // the paint worn through in flecks
  g.globalAlpha = 1;
  return c;
}
function cardCanvas(lines, fg, w = 256, h = 160) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#f6efdc'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2b2340'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const four = lines.length > 3; // (the hours card: a smaller title, three lines under it)
  lines.forEach((ln, i) => { g.fillStyle = i ? '#2b2340' : fg; g.font = i ? '600 22px "Fredoka", "Trebuchet MS", sans-serif' : `700 ${four ? 46 : 58}px "Fredoka", "Trebuchet MS", sans-serif`; g.fillText(ln, w / 2, i ? (four ? 82 : h - 64) + (i - 1) * (four ? 24 : 26) : four ? 44 : 56, w - 24); });
  return c;
}
// the photos of his boat: three little paintings on one canvas
function photoCanvas() {
  const c = document.createElement('canvas'); c.width = 768; c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 3; i++) {
    const x0 = i * 256, sky = g.createLinearGradient(0, 0, 0, 150);
    sky.addColorStop(0, ['#9fd0f0', '#f6b07a', '#b8d8f0'][i]); sky.addColorStop(1, ['#dff0fa', '#f9dca8', '#e8f2fa'][i]);
    g.fillStyle = sky; g.fillRect(x0, 0, 256, 256);
    g.fillStyle = ['#3f7fa8', '#4a6f98', '#5a8fb0'][i]; g.fillRect(x0, 150, 256, 106);
    g.fillStyle = 'rgba(255,255,255,0.35)'; for (let k = 0; k < 6; k++) g.fillRect(x0 + 20 + k * 38, 170 + (k % 3) * 22, 26, 3);
    const bx = x0 + 128 + (i - 1) * 20, by = 160;
    g.fillStyle = '#8a5a3a'; g.beginPath(); g.moveTo(bx - 70, by - 18); g.lineTo(bx + 76, by - 18); g.lineTo(bx + 50, by + 8); g.lineTo(bx - 56, by + 8); g.closePath(); g.fill();
    g.fillStyle = '#f4ecd6'; g.fillRect(bx - 70, by - 22, 146, 5);
    g.strokeStyle = '#4a3526'; g.lineWidth = 4; g.beginPath(); g.moveTo(bx, by - 20); g.lineTo(bx, by - 120); g.stroke();
    if (i !== 1) { g.fillStyle = '#f9f3e3'; g.beginPath(); g.moveTo(bx + 3, by - 118); g.lineTo(bx + 3, by - 26); g.lineTo(bx + 62, by - 26); g.closePath(); g.fill(); }
    else { g.fillStyle = '#e0b54a'; g.beginPath(); g.arc(x0 + 196, 60, 26, 0, Math.PI * 2); g.fill(); }
    if (i === 2) { g.fillStyle = '#2b2340'; g.fillRect(bx - 30, by - 52, 10, 30); g.fillStyle = '#e3ae8b'; g.beginPath(); g.arc(bx - 25, by - 58, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#7ddc7a'; g.fillRect(bx - 18, by - 46, 22, 8); } // Kevin with a fish
  }
  return c;
}
const tex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

export function createToolCrib(ctx) {
  const { scene, player, colliders, ui, audio, camera, net, npcs } = ctx;
  const P = CRIB, { sx, minX, maxX, minZ, maxZ, fy, LY, top, zL, zP } = P;
  // (crib-move) the plan is in the crib's own frame (tool-crib-plan.js, THE FRAME); the building is drawn turned to the world, so
  // every world position here goes through toWorld / worldBox / worldPt. DZ: the door's wall in the world, WALK_Z its sidewalk.
  const DZ = P.world.doorZ, WALK_Z = P.world.walkZ;
  addRoom({ id: 'tool-crib', minX, maxX, minZ, maxZ, y0: fy, y1: top - 0.02 });   // dry inside (indoor-rooms.js; the footprint box is the same either way round)
  const built = buildCrib(scene, colliders);
  const g = built.group, inside = built.inside;
  const springs = createCribSprings(ctx, built, P);   // the loose springs roll and get pushed (crib-springs.js)
  const crossword = createCribCrossword(ctx, built, P); // the week's crossword on the cracker barrel (crib-crossword.js)
  // the sound (crib-sound.js): where each thing that makes one is, from the clutter's list; the parts that move (crib-clutter.js)
  const movers = clutterMovers(inside);
  const clut = inside.userData.clutter, boxes = n => clut.filter(i => i.name === n).map(i => i.box), mid = b => [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
  const rb = boxes('radio')[0], fb = boxes('box-fan')[0], mv = inside.userData.movers;
  const SPOTS = { // (world positions: the clutter's boxes are in the plan's frame, so each is turned)
    radio: worldPt([(rb[0] + rb[3]) / 2, rb[1] + 0.12, (rb[2] + rb[5]) / 2]), door: worldPt([P.door.x, fy + 1.3, minZ]), clock: worldPt([mv.clock.x, mv.clock.y, mv.clock.z]),
    fan: worldPt(mid(fb)), buzz: worldPt([sx - 0.4, fy + 2.9, P.iMinZ + 4.25]), roofY: top + 0.6,
    boxes: boxes('spring-box').map(worldBox6), totes: boxes('wire-shelf').map(worldBox6), tarp: boxes('tarp').map(worldBox6),
    creaks: [P.iMinX, P.iMaxX, fy + 2.2, top - 0.1, P.iMinZ, P.iMaxZ],   // (a box about the middle: the same either way round)
    stair: (() => { const sb = worldBox({ minX: P.stair.minX, maxX: P.stair.maxX, minZ: P.stair.z0, maxZ: P.stair.z1 }); return { minX: sb.minX, maxX: sb.maxX, z0: P.flip ? sb.maxZ : sb.minZ, dir: P.flip ? -1 : 1, n: P.stair.n, tread: P.stair.tread, rise: P.stair.rise, x: toWorld(P.stair.x, 0)[0], y0: fy, y1: LY }; })(),
  };
  // what the sound reads each frame (one object, refilled in update; climbers: [id, x, y, z] rows, reused)
  const SND = { pin: false, open: false, kevinIn: false, shopOn: false, fan: false, door: 0, rain: 0, hour: 12, kevin: null, climbers: [] };
  const KV = { x: 0, y: 0, z: 0, task: null, still: false }, CL = [];
  const climber = (i, id, x, y, z) => { const r = CL[i] || (CL[i] = [null, 0, 0, 0]); r[0] = id; r[1] = x; r[2] = y; r[3] = z; return i + 1; };
  const sound = createCribSound(audio, { spots: SPOTS, source: () => SND });
  let warmTest = null;   // (tests: true / false for a warm or a cool day, null the weather's)
  audio.crib = sound;   // (the console and the tests: breneland.audio.crib)
  // the sign on the false front, a little crooked
  const S = built.sign;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(S.x1 - S.x0 - 0.06, S.y1 - S.y0 - 0.06), new THREE.MeshBasicMaterial({ map: tex(signCanvas()), fog: true }));
  if (built.signAt) { const a = built.signAt; sign.position.set(a.pos[0], a.pos[1], a.pos[2]); sign.rotation.set(a.rx || 0, Math.PI, 0.012); }   // (crib-setpiece: on the model's board, leaning back with its false front)
  else { sign.position.set(sx, (S.y0 + S.y1) / 2, minZ - 0.095); sign.rotation.set(0, Math.PI, 0.012); }
  sign.name = 'tool-crib-sign'; g.add(sign);
  // the OPEN / CLOSED card hanging in the east window, the hours on the screen door
  const openMat = new THREE.MeshBasicMaterial({ map: tex(cardCanvas(['OPEN', 'come on in'], '#c0392b')), fog: true });
  const closedMat = new THREE.MeshBasicMaterial({ map: tex(cardCanvas(['CLOSED', 'Mon-Fri 8 to 5', 'Sat 7 to 11'], '#2f5442')), fog: true });
  const W1 = P.win[1], card = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.31), openMat);
  card.position.set((W1.a0 + W1.a1) / 2 + 0.4, W1.y1 - 0.75, minZ + 0.13); card.rotation.y = Math.PI; card.name = 'tool-crib-open-card'; g.add(card);
  { const b = new Batcher({ castShadow: false }); for (const k of [-1, 1]) b.add(GEO.cyl6, '#2b2340', { x: card.position.x + k * 0.12, y: (W1.y1 - 0.06 + card.position.y + 0.155) / 2, z: minZ + 0.14, sx: 0.004, sy: W1.y1 - 0.06 - card.position.y - 0.155, sz: 0.004, rz: k * 0.18 }); b.build(g, 'tool-crib-card-string'); }
  // (crib-window) a SALE card standing in its block in front of the paint cans in the west display (the block is the model's: its anchor)
  if (built.saleAt) {
    const a = built.saleAt, sale = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.19), new THREE.MeshBasicMaterial({ map: tex(cardCanvas(['SALE', 'ask Kevin'], '#c0392b')), fog: true, side: THREE.DoubleSide }));
    sale.position.set(a.pos[0], a.pos[1] + 0.093, a.pos[2] + 0.012); sale.rotation.set(0, Math.PI, 0); sale.rotateX(-0.16); sale.name = 'tool-crib-sale-card'; g.add(sale);
  }
  const hours = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), new THREE.MeshBasicMaterial({ map: tex(cardCanvas(['HOURS', 'Mon-Fri 8 to 5', 'Sat 7 to 11', 'Sun closed'], '#2b2340')), fog: true }));
  hours.position.set((P.door.x1 - P.door.x0) / 2 - 0.02, 1.28, -0.035); hours.rotation.y = Math.PI; hours.name = 'tool-crib-hours'; built.screen.add(hours);
  // an old painted sign on the east wall, faded into the boards (the lot side)
  {
    const c2 = document.createElement('canvas'); c2.width = 1024; c2.height = 256;
    const q = c2.getContext('2d');
    q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillStyle = 'rgba(250,244,226,0.55)';
    q.font = '700 118px Georgia, "Times New Roman", serif'; q.fillText('HARDWARE', 512, 86);
    q.font = '700 58px Georgia, "Times New Roman", serif'; const dot = '  ' + String.fromCharCode(183) + '  '; q.fillText('PAINT' + dot + 'TOOLS' + dot + 'BAIT', 512, 196);
    q.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 260; i++) q.fillRect((i * 389) % 1024, (i * 157) % 256, 4 + (i % 7) * 3, 2 + (i % 3) * 2); // worn away in flecks
    const ghost = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), new THREE.MeshBasicMaterial({ map: tex(c2), transparent: true, depthWrite: false, fog: true }));
    ghost.position.set(maxX + 0.012, fy + 3.3, (minZ + zP) / 2 - 0.6); ghost.rotation.y = Math.PI / 2; ghost.name = 'tool-crib-ghost-sign'; ghost.renderOrder = 1; g.add(ghost);   // (north of the roll-up door and its light since crib-clutter)
  }
  // the photos of his boat in the loft
  built.photoMat.map = tex(photoCanvas()); built.photoMat.needsUpdate = true;
  // (crib-move) his motorcycle: its own group in the world (out of the inside group, which is in the plan's frame), in its corner
  // (home: hidden with the inside) or wherever kevin-day.js has it on a Sunday afternoon (wheeled out, ridden round town); the
  // roll-up door's curtain rolled up while it is out; the engine, quiet and only near
  const bike = built.bike, bikeHome = (() => { const [x, z] = toWorld(bike.x, bike.z); return { x, z, heading: worldYaw(bike.heading) }; })();
  inside.remove(bike.group); scene.add(bike.group);
  const placeBike = (x, y, z, heading, lean) => { bike.group.position.set(x, y, z); bike.group.rotation.set(lean, heading - Math.PI / 2, 0, 'YXZ'); };
  placeBike(bikeHome.x, bike.y, bikeHome.z, bikeHome.heading, bike.lean);
  let engine = null, curtainOpen = -1;
  const ROLLUP_W = toWorld(maxX, (P.rollup.z0 + P.rollup.z1) / 2);   // the roll-up door's middle in the world

  // ---- the hours and the lights
  const tNow = () => net.serverNow() / 1000;
  const isOpen = () => cribOpen(tNow(), LIGHT.hour);
  const lights = { shop: null, loft: null, in: null };
  const setLights = (shopOn, loftOn, inNow) => {
    if (shopOn === lights.shop && loftOn === lights.loft && inNow === lights.in) return;
    lights.shop = shopOn; lights.loft = loftOn; lights.in = inNow;
    LAMPS.get('crib-bulbs').base.set(shopOn ? '#ffffff' : '#2e2a26');
    LAMPS.get('crib-bulbs-loft').base.set(loftOn ? '#ffffff' : '#2e2a26');
    for (const s of built.shopLamps) { s.k = shopOn ? 1 : 0; s.day = inNow && shopOn ? 0.55 : 0; }
    for (const s of built.loftLamps) { s.k = loftOn ? 1 : 0; s.day = inNow && loftOn ? 0.55 : 0; }
  };
  const copyGlass = (m, on) => { const q = GLASS[on ? 0 : 4]; // (bucket 0 stays lit all night: bucket 3 went dark at 11, lamp on or not)
    m.color.copy(q.color); m.emissive.copy(q.emissive); m.emissiveIntensity = q.emissiveIntensity; };

  // ---- inside or not, and the camera inside (indoor-view.js: first person or the room view, F, the toggle)
  const inside2 = (wx, wz) => { const [x, z] = toLocal(wx, wz); return x > minX + 0.05 && x < maxX - 0.05 && z > minZ + 0.12 && z < maxZ; };
  const iv = indoorView(ctx);
  const kTarget = new THREE.Vector3();
  const keepOut = cam => { // the follow camera outside stays outside the walls
    const c = cam.position, pad = 0.35;
    if (inside2(player.pos.x, player.pos.z) || !(c.x > minX - pad && c.x < maxX + pad && c.z > minZ - pad && c.z < maxZ + pad) || c.y > top + 1.6) return;
    kTarget.set(player.pos.x, player.pos.y + 1.6, player.pos.z);
    let t = 1;
    for (let i = 1; i <= 24; i++) { const u = i / 24, x = kTarget.x + (c.x - kTarget.x) * u, z = kTarget.z + (c.z - kTarget.z) * u; if (x > minX - pad && x < maxX + pad && z > minZ - pad && z < maxZ + pad) { t = (i - 1) / 24; break; } }
    c.lerpVectors(kTarget, c, Math.max(0.12, t)); cam.lookAt(kTarget);
  };
  const ST = P.stair, wall = (minX, maxX, minZ, maxZ, y0, y1) => worldBox({ minX, maxX, minZ, maxZ, y0, y1 });
  const cam = ([x, z, y]) => { const [wx, wz] = toWorld(x, z); return [wx, wz, y]; };
  const corners = (x0, z0, x1, z1, y, pad = 0.5) => [[x0 + pad, z0 + pad, y], [x1 - pad, z0 + pad, y], [x0 + pad, z1 - pad, y], [x1 - pad, z1 - pad, y]];
  const room = r => ({ ...worldBox(r), cams: r.cams.map(cam) });   // (the plan's boxes and camera spots, turned to the world)
  const bld = iv.register({
    id: 'tool-crib', inside: inside2, keepOut,
    rooms: [
      room({ id: 'shop', minX: P.iMinX, maxX: P.iMaxX, minZ, maxZ: zP, y: fy, top, cams: [[P.iMinX + 0.5, P.iMinZ + 0.5, fy + 3.0], [P.iMaxX - 0.5, P.iMinZ + 0.5, fy + 3.0], [ST.maxX + 0.7, zP - 0.5, fy + 3.0], [P.iMaxX - 0.5, zP - 0.5, fy + 3.0]] }),
      room({ id: 'stair', minX: ST.minX, maxX: ST.maxX, minZ: ST.z0, maxZ: ST.z1, y: fy, top: LY + 2.5, stair: true, cams: [[ST.x + 0.6, ST.z0 - 0.8, fy + 2.4], [ST.x + 0.6, zL + 0.7, LY + 2.0]] }),
      room({ id: 'loft', minX: P.iMinX, maxX: P.iMaxX, minZ: zL, maxZ, y: LY, top: top - 0.06, cams: corners(P.iMinX, zL, P.iMaxX, P.iMaxZ, LY + 2.2) }),
    ],
    walls: [
      wall(minX, maxX, minZ, minZ + P.T, P.gy, top), wall(minX, maxX, maxZ - P.T, maxZ, P.gy, top), wall(minX, minX + P.T, minZ, maxZ, P.gy, top), wall(maxX - P.T, maxX, minZ, maxZ, P.gy, top),
      wall(ST.maxX, P.iMaxX, zP, zL, fy, top), wall(P.iMinX, ST.maxX, zP, zL, LY + 2.12, top),
    ],
    zoneHas: (r, x, y, z, depth = 0) => {
      if (r.stair) return x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ && y > fy + (depth ? 0.3 : 0.05) && y < LY - (depth ? 0.08 : 0.02);
      return x > r.minX + depth && x < r.maxX - depth && z > r.minZ + depth && z < r.maxZ - depth && Math.abs(y - r.y) < 1.2;
    },
  });
  // inside, the town outside is drawn only through the door's opening (game-store-cull.js; the screen is see-through)
  const KEEP = new Set(['lamp-pools', 'night-fx', 'weather-fx', 'shadow-proxies']);
  const cull = createStoreCull({
    scene, camera, renderer: ctx.renderer,
    box: { minX, maxX, minZ, maxZ, y0: P.gy - 1, y1: top + 0.3 },
    keep: o => o === g || o === built.bike.group || o === player.character?.root || KEEP.has(o.name) || customers.some(c => c.h && c.h.root === o),   // (the motorcycle is its own top-level group: crib-move)
    portals: () => PORTALS,
    groups: { npcs: 2.5, cars: 7, world: 0 },
  });
  const PORTALS = [(() => { const a = toWorld(P.door.x0, 0)[0], b = toWorld(P.door.x1, 0)[0]; return { z: DZ, lo: Math.min(a, b), hi: Math.max(a, b), y0: fy, y1: P.door.y1, out: P.front }; })(),
    // (crib-window) the register's window: real glass with nothing behind it, so from inside the street is drawn through it too
    (() => { const w = P.win[1], a = toWorld(w.a0, 0)[0], b = toWorld(w.a1, 0)[0]; return { z: DZ, lo: Math.min(a, b), hi: Math.max(a, b), y0: w.y0, y1: w.y1, out: P.front }; })()];

  // ---- the customers: a visit's walk (in at the door, the counter, a look round, back to pay, out), pure from the shared clock
  const lazy = castOn();
  const customers = [];   // { key, v, id, h, tag, legs }
  const pickCache = new Map();
  // who drops in: a resident at home through the whole visit (town-life.js), the visit's own hash among them
  function whoFor(t8, v) {
    const k = t8 + ':' + v.i;
    let id = pickCache.get(k);
    if (id) return id;
    const ts = [t8 + v.u0 - 40, t8 + v.u0 + v.chat1, t8 + v.u0 + v.out + 30].map(t => residentStates(t));
    const free = TOWN_RESIDENTS.filter((r, i) => ts.every(st => st[i] && st[i].hidden));
    const pool = free.length ? free : TOWN_RESIDENTS;
    id = pool[Math.floor(hash01('crib-who', t8, v.i) * pool.length)];
    pickCache.set(k, id); if (pickCache.size > 40) pickCache.delete(pickCache.keys().next().value);
    return id;
  }
  const CV = 1.2, FROM = [sx + 8, WALK_Z];   // (along the crib's own sidewalk)
  // the legs of a visit: [t0, path, anim when there, yaw when there] in seconds from the visit's start (world: KEVIN_SPOTS and
  // cribPath are the plan's spots turned to the world; the yaw across the counter is the plan's PI / 2, turned)
  function legsOf(v) {
    const K = KEVIN_SPOTS, at = k => [K[k][0], K[k][1]], toKevin = worldYaw(Math.PI / 2);
    const inPath = [FROM, ...cribPath('walk', 'cust')], L1 = polylineLength(inPath);
    const pay = toWorld(P.K.cust[0], P.counter.maxZ - 0.4);
    return [
      { t0: v.chat0 - 1.5 - L1 / CV, pts: inPath, anim: 'talk', yaw: toKevin },
      { t0: v.chat1, pts: cribPath('cust', v.spot), anim: 'look', yaw: K[v.spot][2] },
      { t0: v.browse1, pts: [...cribPath(v.spot, 'in'), pay], anim: 'talk', yaw: toKevin },
      { t0: v.pay1, pts: [pay, ...cribPath('in', 'walk').slice(0), [sx - 8, WALK_Z]], anim: null, yaw: 0, gone: true },
    ].map(l => ({ ...l, len: polylineLength(l.pts), atEnd: at }));
  }
  function custState(c, u) { // u: seconds from the visit's start
    const L = c.legs;
    if (u < L[0].t0) return null;
    let leg = L[0];
    for (const l of L) if (u >= l.t0) leg = l;
    const d = (u - leg.t0) * CV;
    if (d < leg.len) { const [x, z, dx, dz] = alongPolyline(leg.pts, d); return { x, z, yaw: Math.atan2(dx, dz), speed: CV, anim: null }; }
    if (leg.gone) return null;
    const e = leg.pts[leg.pts.length - 1];
    return { x: e[0], z: e[1], yaw: leg.yaw, speed: 0, anim: leg.anim === 'look' ? (Math.floor(u / 6) % 3 ? 'look' : 'pet') : leg.anim };
  }
  const buildCust = c => {
    const id = c.id, look = lookOf(id, NPCS[id].look);
    c.h = new Human({ ...look }); c.h.root.visible = false; scene.add(c.h.root);
    c.tag = ui.nameTag(c.h.root, tagOf(id, NPCS[id].name), '#ffffff'); c.tag.max = 12; c.tag.fade = 8;
  };
  const freeCust = c => { if (!c.h) return; scene.remove(c.h.root); c.h.dispose(); c.tag.remove(); c.h = null; c.tag = null; };

  // ---- the props at his odd jobs: one of each kind, put where today's job has it while he's at it
  const props = {};
  {
    // (built the first time a job wants it: nothing parked at the origin meanwhile)
    const mk = (name, fill) => { Object.defineProperty(props, name, { enumerable: true, configurable: true, get() { const grp = new THREE.Group(); grp.name = 'crib-job-' + name; grp.visible = false; const b = new Batcher({ vertexColors: true }); fill(b); b.build(grp, 'crib-job-' + name); scene.add(grp); Object.defineProperty(props, name, { value: grp, enumerable: true }); return grp; } }); };
    mk('toolbox', b => { b.add(GEO.box, '#c0392b', { y: 0.11, sx: 0.4, sy: 0.2, sz: 0.2 }); b.add(GEO.box, '#8e2a20', { y: 0.225, sx: 0.41, sy: 0.04, sz: 0.21 }); b.add(GEO.box, '#2b2340', { y: 0.27, sx: 0.18, sy: 0.04, sz: 0.03 }); });
    mk('paintcan', b => { b.add(GEO.cyl12, '#dfe3e6', { y: 0.1, sx: 0.1, sy: 0.2, sz: 0.1 }); b.add(GEO.cyl12, '#3f8a5a', { y: 0.09, sx: 0.103, sy: 0.1, sz: 0.103 }); b.add(GEO.cyl12, '#3f8a5a', { y: 0.201, sx: 0.08, sy: 0.004, sz: 0.08 }); b.add(new THREE.TorusGeometry(0.1, 0.006, 4, 12, Math.PI), '#5d636b', { y: 0.2 }); });
    mk('lumber', b => { for (let i = 0; i < 6; i++) b.add(GEO.box, i % 2 ? '#d9b47c' : '#c9a26b', { x: (i % 3) * 0.13 - 0.13, y: 0.035 + Math.floor(i / 3) * 0.05 + (i % 3) * 0.002, z: (i % 2) * 0.04, sx: 0.12, sy: 0.045, sz: 2.2 }); });
    mk('ladder', b => { for (const k of [-1, 1]) b.add(GEO.box, '#b98a5a', { x: k * 0.22, y: 0, sx: 0.05, sy: 1, sz: 0.06 }); for (let i = 1; i < 12; i++) b.add(GEO.cyl6, '#b98a5a', { x: 0, y: -0.5 + i / 12, sx: 0.018, sy: 0.44, sz: 0.018, rz: Math.PI / 2 }); });
  }
  function placeProps(s) {
    const j = s && s.jobProp;
    for (const k in props) { const d = Object.getOwnPropertyDescriptor(props, k); if (d && 'value' in d) d.value.visible = false; }
    if (!j) return;
    const o = props[j.kind]; o.visible = true;
    if (j.kind === 'ladder') { // leaning from its foot to under the eave
      const gy0 = 0.34, len = Math.hypot(j.y1 - gy0, j.z1 - j.z); o.position.set(j.x, (gy0 + j.y1) / 2, (j.z + j.z1) / 2); o.scale.set(1, len, 1); o.rotation.set(Math.atan2(j.z1 - j.z, j.y1 - gy0), 0, 0);
    } else { o.position.set(j.x, 0.34 + (j.kind === 'lumber' ? 0.02 : 0.08), j.z); o.scale.set(1, 1, 1); o.rotation.set(0, j.kind === 'lumber' ? Math.PI / 2 : 0.3, 0); }
    o.updateMatrixWorld(true);
  }

  // ---- the doors: the screen door swings out, the shop's own door stands open (in) while the shop is
  let doorT = 0, innerT = 0, wasIn = false, showIn = true, inkFull = true, lastGreet = -Infinity, bellAt = -Infinity;
  const nearDoor = (x, y, z) => y < LY - 1 && Math.abs(x - sx) < 1.3 && Math.abs(z - DZ) < 1.6;
  const BELL_AT = worldPt([P.door.x1 - 0.18, P.door.y1 - 0.12, minZ + 0.25]), TILL_AT = worldPt([P.K.till[0], fy + 1.1, P.K.till[1]]);
  audio.registerSfx?.('crib-bell', (a, x, y, z) => { const o = a.at(x, y, z, 4); const t = a.ctx.currentTime; a.tone(o, { f: 1760, t, d: 0.6, peak: 0.05, verb: 0.5 }); a.tone(o, { f: 2350, t: t + 0.06, d: 0.5, peak: 0.04, verb: 0.5 }); a.tone(o, { f: 1760, t: t + 0.16, d: 0.4, peak: 0.03, verb: 0.5 }); });
  audio.registerSfx?.('crib-till', (a, x, y, z) => { const o = a.at(x, y, z, 4); const t = a.ctx.currentTime; a.burst(o, { dur: 0.05, f: 2400, Q: 3, peak: 0.06 }); a.tone(o, { f: 2900, t: t + 0.05, d: 0.7, peak: 0.05, verb: 0.4 }); });

  const kevin = () => npcs?.npcs?.find(d => d.kevin) || null;
  const said = new Set();
  const sayK = (text, secs = 3.2) => { const k = kevin(); if (k && k.body.root.visible) npcs.say(k, text, secs); };
  const sayC = (c, text) => { if (!c.h) return; ui.say(c.h.root, text, 3.4, 2.3); const q = c.h.root.position; audio.speak?.(q.x, q.y + 1.6, q.z, text, voiceOf(c.id, NPCS[c.id].voice)); c.h.say?.(1.2); };
  const myName = () => String(ctx.profile?.name || '');
  const isDaughter = () => mollyFriend(myName());
  const isOwner = () => !!ctx.accounts?.owner;
  let joyceAt = -Infinity, askedDay = null, askCard = null, kvAt = null;
  // Molly likes Kevin: the dogs' shared simulation reads where he is (pure) to trot over to him when he's out in town
  // (molly-brain.js kv); here he gives her a pat and a word when she gets there
  if (npcs?.brain) npcs.brain.kevinAt = t => { const s = kevinState(t); return s && !s.hidden && !s.inBoat && !s.onBike && !s.bike && s.y == null && !s.loft ? s : null; }; // (not on his motorcycle: crib-move)
  const pick = (list, ...k) => list[Math.floor(hash01(...k) * list.length)];

  // Kevin and Joyce don't get along: passing within a few metres one of them grumbles (the minute's hash picks who and what:
  // every screen alike), at most once a minute; never from his boat. Returns [who, line] or null
  function grumble(kp, ks, jp, now, t, jd) {
    if (!ks || ks.inBoat || ks.hidden || Math.hypot(jp.x - kp.x, jp.z - kp.z) >= 4 || now - joyceAt < 60) return null;
    joyceAt = now;
    const m = Math.floor(t / 60), who = hash01('kj', m) < 0.5 ? 'k' : 'j', line = pick(JOYCE_LINES[who], 'kj' + who, m);
    if (who === 'k') sayK(line, 3); else if (jd) npcs.say(jd, line, 3);
    return [who, line];
  }
  // his daughter asked along at 7 (if she is here): a little card, Yes takes a seat in the boat (kevin-crew.js), No is fine
  function askDaughter(key) {
    askedDay = key;
    sayK(myName().split(/\s+/)[0] + '! ' + ASK_DAUGHTER, 4);
    if (askCard) askCard.remove();
    const el = document.createElement('div'); el.className = 'crib-ask panel';
    const p = document.createElement('div'); p.textContent = 'Kevin: ' + ASK_DAUGHTER;
    const yes = document.createElement('button'); yes.className = 'btn primary'; yes.textContent = 'Yes, Dad';
    const no = document.createElement('button'); no.className = 'btn'; no.textContent = 'Not tonight';
    yes.onclick = () => { ctx.crew?.join?.(false); el.remove(); askCard = null; };
    no.onclick = () => { sayK('Next time, then.', 2.5); el.remove(); askCard = null; };
    el.append(p, yes, no); Object.assign(el.style, { position: 'absolute', left: '50%', top: '22%', transform: 'translateX(-50%)', padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'center', zIndex: 30 });
    ctx.hud.append(el); askCard = el;
    setTimeout(() => { if (askCard === el) { el.remove(); askCard = null; } }, 30000);
  }

  return {
    name: 'toolcrib',
    plan: P, built, props, springs, crossword, sound, movers, spots: SPOTS, bike, bikeHome,
    get doorOpen() { return curtainOpen; }, get engineOn() { return !!engine; },
    get warm() { return warmTest; }, set warm(v) { warmTest = v ?? null; },
    get open() { return isOpen(); },
    get lights() { return { shop: lights.shop, loft: lights.loft }; },
    get insideShown() { return showIn; },
    glassView: built.glassView, glassMeshes: built.glassMeshes, glassReal: built.glassReal, awning: built.awning,   // (crib-window, tests)
    get frontDoor() { return doorT; }, get innerDoor() { return innerT; },
    get customers() { return customers.map(c => ({ id: c.id, built: !!c.h, x: c.h?.root.position.x, z: c.h?.root.position.z, vis: !!c.h?.root.visible, visit: c.v.i })); },
    get cull() { return cull.state; },
    get askCard() { return askCard; },
    grumble: (kp, ks, jp, now, t) => grumble(kp, ks, jp, now, t, null), // (tests)
    sign, card, hours, openMat, closedMat,
    inside: () => inside2(player.pos.x, player.pos.z),
    look: (yaw, pitch = 0.08) => iv.look(yaw, pitch),
    get walkFP() { return iv.walkFP(bld); }, get roomCam() { return iv.roomCam(bld); },
    get room() { return iv.active === bld ? iv.room : null; },
    update(dt, now) {
      cull.install(ctx.ink);
      const t = tNow(), h = LIGHT.hour, open = cribOpen(t, h);
      card.material = open ? openMat : closedMat;
      const px = player.pos.x, py = player.pos.y, pz = player.pos.z, c = camera.position;
      const k = kevin(), ks = k?._s || null, kp = k?.body.root.position;
      const kevinIn = !!(ks && !ks.hidden && kp && inside2(kp.x, kp.z) && kp.y < LY - 1);
      // the doors
      const pin = inside2(px, pz);
      let near = nearDoor(px, py, pz) && (open || pin || (doorT > 0.5 && Math.abs(pz - DZ) < 0.9));
      if (!near && kp && ks && !ks.hidden && nearDoor(kp.x, kp.y, kp.z)) near = true;
      if (!near && ctx.remotes?.map) for (const r of ctx.remotes.map.values()) { const q = r.ch.root.position; if (nearDoor(q.x, q.y, q.z) && (open || inside2(q.x, q.z))) { near = true; break; } }
      if (!near) for (const cu of customers) { const q = cu.h?.root.position; if (q && cu.h.root.visible && nearDoor(q.x, q.y, q.z)) { near = true; break; } }
      const wasOpen = doorT > 0.5;
      doorT += ((near ? 1 : 0) - doorT) * Math.min(1, dt * 4);
      if (doorT > 0.5 && !wasOpen && now - bellAt > 1) { bellAt = now; audio.play?.('crib-bell', BELL_AT[0], BELL_AT[1], BELL_AT[2]); }
      built.screen.rotation.y = 1.45 * doorT;
      innerT += (((open || near || kevinIn) ? 1 : 0) - innerT) * Math.min(1, dt * 3);
      built.inner.rotation.y = 1.5 * innerT;
      built.doorCol.off = doorT > 0.3 && innerT > 0.3;
      // the lights: the shop's while it is open (or Kevin is down in it), the loft's while his lamp is on or the shop is open
      const loftOn = kevinLoftLight(t) || open;
      const shopOn = open || kevinIn;
      setLights(shopOn, loftOn, pin);
      copyGlass(built.glassShop, shopOn); copyGlass(built.glassLoft, loftOn); copyGlass(built.glassReal, shopOn);
      ui.indoors = ui.indoors || (pin && inside2(c.x, c.z));
      // the inside is drawn while you're in it, the camera is, you're near the door, or (crib-window) the display windows are near enough
      // to see through (real-glass.js: the panes go see-through from 16 m on a PC, 12 on a phone, and the inside is drawn for them)
      // (the glass view measures to the crib's box, so `looks` is also true round the sides and the back, where the windows cannot be
      // seen: the inside is drawn for the glass only with the camera out in front of the front wall; from the pad on a phone it cost 31 calls)
      const camIn = inside2(c.x, c.z) && c.y < top, looks = built.glassView.update(dt, camera, camIn) && (c.z - DZ) * P.front > 0.2;
      const showNow = pin || camIn || looks || Math.hypot(px - sx, pz - DZ) < 9 || (curtainOpen > 0.05 && Math.hypot(px - ROLLUP_W[0], pz - ROLLUP_W[1]) < 16);   // (the roll-up door up: the shop seen through it from the pad, crib-move)
      if (showNow !== showIn) { showIn = showNow; inside.visible = showNow; }
      if (showNow) { const full = pin || camIn || GFX.cls === 'desktop'; if (full !== inkFull) { inkFull = full; insideInk([inside], full); } }
      // stepping in: the bell, Kevin's welcome (and his family's own greeting)
      if (pin !== wasIn) {
        wasIn = pin;
        if (pin && open && kevinIn && now - lastGreet > 20) { lastGreet = now; sayK(isDaughter() ? pick(DAUGHTER_LINES, 'd', Math.floor(now / 30)) : isOwner() ? pick(OWNER_LINES, 'o', Math.floor(now / 30)) : WELCOME); }
      }
      // his family out and about: a warm word when they come near him (anywhere but the boat), now and then
      if ((isDaughter() || isOwner()) && kp && ks && !ks.hidden && !ks.inBoat && Math.hypot(px - kp.x, pz - kp.z) < 6 && now - lastGreet > 90) {
        lastGreet = now; sayK(isDaughter() ? pick(DAUGHTER_LINES, 'd', Math.floor(now / 30)) : pick(OWNER_LINES, 'o', Math.floor(now / 30)));
      }
      // 7 pm: his daughter here? He asks her along first
      if (isDaughter() && ctx.crew?.plan) { const cp = ctx.crew.plan; if (cp.on && cp.canJoin && cp.u < 600 && askedDay !== cp.key && ctx.playing) askDaughter(cp.key); }
      // the customers of today's open hours
      const D = kevinDayAt(t), t8 = D.t0 + D.day.open, visits = D.day.shop ? cribVisits(t8) : []; // (t8: opening, 8 am or 7 on Saturday)
      const u8 = t - t8;
      const live = visits.filter(v => u8 - v.u0 > v.chat0 - 45 && u8 - v.u0 < v.out + 20);
      for (const v of live) if (!customers.some(cu => cu.key === t8 + ':' + v.i)) customers.push({ key: t8 + ':' + v.i, v, t8, id: whoFor(t8, v), h: null, tag: null, legs: legsOf(v) });
      for (let i = customers.length - 1; i >= 0; i--) {
        const cu = customers[i], st = custState(cu, t - cu.t8 - cu.v.u0);
        const far = Math.abs(c.x - sx) + Math.abs(c.z - P.sz) > 70;
        if (!st || (lazy && far)) { if (!st && (t - cu.t8 - cu.v.u0) > cu.v.out + 15) { freeCust(cu); customers.splice(i, 1); continue; } if (cu.h) cu.h.root.visible = false; if (lazy && far) freeCust(cu); continue; }
        if (!cu.h) { if (!mayBuild(now)) continue; buildCust(cu); }
        const r = cu.h.root; r.visible = true;
        const y = groundHeight(st.x, st.z);
        r.position.set(st.x, y, st.z); r.rotation.y = st.yaw;
        if (!far) cu.h.update(dt, now, st.speed, st.anim);
        // the words at the counter, once each as the moment passes (only near: a balloon nobody sees is no word)
        const uv = t - cu.t8 - cu.v.u0, nearby = Math.hypot(px - r.position.x, pz - r.position.z) < 14;
        const lines = [[cu.v.chat0 + 1.5, 'c', ASKS[cu.v.ask][0]], [cu.v.chat0 + 7, 'k', ASKS[cu.v.ask][1]], [cu.v.pay0 + 1.5, 'c', THANKS[cu.v.thanks][0]], [cu.v.pay0 + 6, 'k', THANKS[cu.v.thanks][1]]];
        lines.forEach(([at, who, text], n) => {
          const key = cu.key + ':' + n;
          if (uv >= at && uv < at + 3 && !said.has(key)) { said.add(key); if (nearby) { if (who === 'c') sayC(cu, text); else sayK(text); if (n === 3) audio.play?.('crib-till', TILL_AT[0], TILL_AT[1], TILL_AT[2]); } }
        });
      }
      if (said.size > 300) said.clear();
      // his odd jobs: the props, a word for anyone near once a job
      placeProps(ks);
      if (ks && ks.job && kp && Math.hypot(px - kp.x, pz - kp.z) < 9) {
        const P2 = D.day, j = P2.jobs?.find(q => q.id === ks.job), key = 'job:' + P2.key + ':' + ks.job;
        if (j && !said.has(key)) { said.add(key); sayK(j.line, 3.5); if (k) npcs.local?.set(k.id, { anim: 'wave', until: now + 1.8, at: { x: px, z: pz } }); } // (a wave, then back to it)
      }
      // passing Joyce: a grumble (shared enough: the minute and the pair's hash choose who and what), never from his boat
      const jd = npcs?.npcs?.find(d => d.joyce);
      if (jd && kp && jd.body.root.visible) grumble(kp, ks, jd.body.root.position, now, t, jd);
      // Molly arrived at his side: a pat and a word
      const kv = npcs?.brain?.S?.molly?.kv;
      if (kv && kv.at != null && kvAt !== kv.at && k) {
        kvAt = kv.at;
        const md = npcs.npcs.find(d => d.id === 'molly'), mp = md?.body.root.position;
        if (mp) npcs.local?.set(k.id, { anim: 'pet', until: now + 3.2, at: { x: mp.x, z: mp.z } });
        sayK(pick(MOLLY_LINES, 'kv', Math.round(kv.at)), 2.6);
      }
      springs.update(dt, now);
      crossword.update(dt);
      iv.update();
      // (crib-move) the motorcycle, the roll-up door and the engine on a Sunday afternoon
      const rb = ks && ks.bike;
      if (rb) { placeBike(rb.x, groundHeight(rb.x, rb.z), rb.z, rb.heading, rb.lean || 0); bike.group.visible = true; }
      else { placeBike(bikeHome.x, bike.y, bikeHome.z, bikeHome.heading, bike.lean); bike.group.visible = showIn; }
      if (bike.wheels && rb && Math.abs(rb.speed) > 0.01) for (const w of bike.wheels) w.rotation.x += rb.speed * dt / 0.345;   // (props-vehicles: the Blender bike's wheels roll with the road; 0.345 m tyres)
      if (bike.collider) bike.collider.off = !!rb;
      bike.helmet.visible = !(ks && ks.helmet);
      const dOpen = kevinDoorOpen(t);
      if (dOpen !== curtainOpen && built.curtain) { curtainOpen = dOpen; built.curtain.scale.y = 1 - 0.93 * dOpen; built.curtain.updateMatrix(); }
      if (rb && rb.riding && audio.ctx && Math.abs(c.x - rb.x) + Math.abs(c.z - rb.z) < 70) {
        if (!engine) engine = engineLoop(audio, rb.x, 0.6, rb.z);
        const k2 = Math.min(1, rb.speed / RIDE.V);
        engine.set(rb.x, 0.6, rb.z, k2, 0.03 + k2 * 0.05);   // (a putter: quieter than a car's engine bed)
      } else if (engine) { engine.stop(); engine = null; }
      // the sound: the radio (on while open or Kevin is down here), the bed and the one-shots while you are in, the stair
      SND.pin = pin; SND.open = open; SND.kevinIn = kevinIn; SND.shopOn = shopOn; SND.door = doorT;
      SND.fan = shopOn && (warmTest ?? (WEATHER.tempC ?? 18) >= WARM_C); SND.rain = pin ? WEATHER.rain || 0 : 0; SND.hour = h;
      if (kevinIn) { KV.x = kp.x; KV.y = kp.y; KV.z = kp.z; KV.task = ks.task || null; KV.still = !(ks.speed > 0.05); SND.kevin = KV; } else SND.kevin = null;
      let nc = 0;
      if (pin) nc = climber(nc, 'me', px, py, pz);
      if (kp && ks && !ks.hidden) nc = climber(nc, 'kevin', kp.x, kp.y, kp.z);
      if (ctx.remotes?.map) for (const [id, r] of ctx.remotes.map) { const q = r.ch.root.position; if (inside2(q.x, q.z)) nc = climber(nc, id, q.x, q.y, q.z); }
      CL.length = Math.max(nc, 0); SND.climbers = CL;
      sound.update();
      if (showIn) movers.update(h, tNow() % 60, SND.fan, dt, sound.dial);
    },
    target(px, pz, yaw) {
      const k = kevin(), kp = k?.body.root.position, ks = k?._s;
      const cw = crossword.target(px, pz, yaw ?? player.yaw);   // E at the cracker barrel
      if (cw) return cw;
      // the radio on the wire shelves: off (or on) for a while
      const rp = SPOTS.radio, nearRadio = inside2(px, pz) && player.pos.y < LY - 1 && Math.hypot(px - rp[0], pz - rp[2]) < 1.5;
      const rum = isOpen() || inside2(px, pz) ? springs.target(px, pz, yaw ?? player.yaw) : null;   // E at the spring table
      if (!isOpen() && !inside2(px, pz) && Math.hypot(px - sx, pz - DZ) < 2.2 && player.pos.y < LY - 1) return { hint: 'E  Try the door', prio: 5, run: () => { ui.toast(`${CRIB_NAME} is closed. ${HOURS_TEXT}.`, 3200); audio.ui?.('blip'); } };
      // Kevin about his day (the shop, a walk, an odd job; not the pier, where the fishing talk is his): a few words
      const dayNow = kp && ks && !ks.hidden && !ks.inBoat && !ks.onBike && kevinDayAt(tNow()).seg;
      if (dayNow && Math.abs(kp.y - player.pos.y) < 1.2 && Math.hypot(px - kp.x, pz - kp.z) < 2.6 && inside2(kp.x, kp.z) === inside2(px, pz)) {
        const inShop = inside2(kp.x, kp.z), yw = yaw ?? player.yaw, dk = Math.hypot(kp.x - px, kp.z - pz) || 1;
        if (rum && rum.face > ((kp.x - px) * Math.sin(yw) + (kp.z - pz) * Math.cos(yw)) / dk) return rum;   // (facing the springs more than him)
        return { hint: 'E  Talk to Kevin', prio: 7, run: () => {
          const n = Math.floor(performance.now() / 4000);
          const line = isDaughter() ? pick(DAUGHTER_LINES, 'd', n) : isOwner() ? pick(OWNER_LINES, 'o', n) : (inShop ? SHOP_LINES : JOB_LINES)[Math.floor(Math.random() * (inShop ? SHOP_LINES : JOB_LINES).length)];
          sayK(line); if (!inShop) npcs.local?.set(k.id, { anim: 'wave', until: performance.now() / 1000 + 2, at: { x: px, z: pz } });
        } };
      }
      if (nearRadio && !rum) return { hint: sound.on ? 'E  Turn the radio off' : 'E  Turn the radio on', prio: 6, run: () => sound.toggle() };
      return rum;
    },
    onKey(code) { return crossword.onKey(code) || iv.onKey(code); },
    bodies() { const out = []; for (const cu of customers) if (cu.h && cu.h.root.visible) out.push({ x: cu.h.root.position.x, z: cu.h.root.position.z, r: 0.3 }); const rb = kevin()?._s?.bike; if (rb) out.push({ x: rb.x, z: rb.z, r: 0.9 }); return out; }, // (and his motorcycle when it is out: crib-move)
    help: [[['E'], "Kevin's Tool Crib on Summit Rd (Mon-Fri 8 to 5, Sat 7 to 11)"]],
    // tests: Kevin's plans and states
    kevinState, kevinPlans, KEVIN_HOURS, isWorkday,
  };
}
