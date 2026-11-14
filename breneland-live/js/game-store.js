// Breneland Games & Hobbies: the game store on Summit Rd (layout.js GAME_STORE). Walk in through the door (9 am to 9 pm Eastern,
// after hours it's locked and the windows glow) and browse the shelves: one box per game in games.json plus a few "coming soon"
// boxes. E at a box opens its card (name, blurb, your launches) with a Play button that sends you to the game just like its
// table in the yard does (ctx.play). Clem the clerk is behind the counter on the left as you come in, and a customer or two
// browse (deterministic from the shared clock). Out on the street the inside isn't drawn at all.
// The shop (game-store-build.js) has a loft up the stairs (a games library, a window seat, beanbags, a puzzle table, a
// miniatures painting corner), four gaming tables you can sit at (the demo table is one of them), posters, hanging dice, string
// lights, a dragon and a giant meeple. The front window holds a leaderboard of every game in the shop (lib/store.js serves it
// from the server's stats and pushes changes: { t: 'board' }).
// Store-only games (games.json `venue: "store"`, `slot: null`: no yard table) are boxes here too, and a game with
// `playtestDays` (getDay() numbers on the Eastern calendar) is set up on the demo table on those days while the shop is open:
// Bookwyrm (Sun, Tue, Wed, Sat). Its Play button only shows then, other days its card says when the next one is.
import * as THREE from 'three';
import { toon, shadows, redrawWhenFontsLoad, LAYER_SOFT } from './toon.js';
import { frameHooks } from './perf-flags.js';
import { GFX } from './gfx.js';
import { Batcher, GEO } from './batch.js';
import { LIGHT, GLASS, LAMPS } from './daynight-mats.js';
import { signTexture } from './areas.js';
import { ANIM_CODES } from './codes.js';
import { PLAN, buildStore } from './game-store-build.js';
import { boxAtlas, posterAtlas, leaderboard } from './game-store-art.js';
import { Human } from './human.js';
import { el, loadCss, hash01 } from './util.js';
import { hourAt } from './npcs-day.js';
import { castMember, castOn, castAt, castSeat, mayBuild } from './town-cast.js';
import { NPCS, lookOf, voiceOf, tagOf } from './npc-looks.js';
import { easternDay } from './wreath-data.js';
import { HOUSE_VENUE, houseOpen, daysText as houseDays, nextOpen as houseNext } from './lovecraft-days.js';
import { indoorView } from './indoor-view.js';
import { createStoreCull } from './game-store-cull.js';
import { addRoom } from './indoor-rooms.js';
import { createGlassView, insideInk } from './real-glass.js';
import { seatFit } from './seats.js';

const OPEN = [9, 21];
// The back room keeps its own hours through its own door round the back (game-store-build.js outDoor): open till midnight.
// After 9 the half-glass door is locked both ways and the shop's lights are off; after midnight the back door is locked too.
// A locked door still opens for someone leaving, never for someone coming in.
const BACK_OPEN = [9, 24];
const NAME = 'Breneland Games & Hobbies';
const ARROW = String.fromCharCode(8594); // a right arrow (built, not typed: see CLAUDE.md on escapes)

// ---- playtest days (pure: the shared clock's Eastern calendar day and hour)
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOT = ' ' + String.fromCharCode(183) + ' '; // a middle dot (built, not typed: see CLAUDE.md on escapes)
// Day of the week on the Eastern calendar at UTC ms, getDay() numbering (0 = Sunday; 1970-01-01 was a Thursday).
export const easternWeekday = ms => (((easternDay(ms) + 4) % 7) + 7) % 7;
export const scheduled = gm => Array.isArray(gm?.playtestDays) && gm.playtestDays.length > 0;
// "Sun · Tue · Wed · Sat"
export const scheduleText = days => [...days].sort((a, b) => a - b).map(d => DAY_NAMES[d].slice(0, 3)).join(DOT);
// Is a scheduled game's playtest on at UTC ms and Eastern hour (the shop's hours, on one of its days)?
export const playtestOn = (gm, ms, hour) => scheduled(gm) && hour >= OPEN[0] && hour < OPEN[1] && gm.playtestDays.includes(easternWeekday(ms));
// When the next one starts, for the card: 'today at 9 am' | 'tomorrow' | 'Saturday' ('' for an unscheduled game).
export function nextPlaytest(gm, ms, hour) {
  if (!scheduled(gm)) return '';
  const dow = easternWeekday(ms);
  if (gm.playtestDays.includes(dow) && hour < OPEN[0]) return 'today at 9 am';
  for (let k = 1; k <= 7; k++) { const d = (dow + k) % 7; if (gm.playtestDays.includes(d)) return k === 1 ? 'tomorrow' : DAY_NAMES[d]; }
  return '';
}

// The A-frame by the demo table: a chalkboard most days, the game's own colours on a playtest day.
function boardTexture(lines, { bg, fg, sub, frame, font = 'Fredoka' }) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 320;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const draw = () => {
    g.fillStyle = frame; g.fillRect(0, 0, 256, 320);
    g.fillStyle = bg; g.fillRect(14, 14, 228, 292);
    g.globalAlpha = 0.06; g.fillStyle = '#ffffff'; for (let i = 0; i < 5; i++) g.fillRect(24 + i * 44, 20, 18, 280); g.globalAlpha = 1; // chalk smudges
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let y = 160 - (lines.length - 1) * 29;
    for (const [i, ln] of lines.entries()) {
      let size = i === 0 ? 46 : 32;
      const set = () => { g.font = `${i === 0 ? 700 : 600} ${size}px "${font}", "Trebuchet MS", sans-serif`; };
      set(); while (g.measureText(ln).width > 212 && size > 14) { size -= 2; set(); }
      g.fillStyle = i === 0 ? fg : sub; g.fillText(ln, 128, y); y += 58;
    }
    tex.needsUpdate = true;
  };
  draw(); redrawWhenFontsLoad(draw, [`700 46px "${font}"`, `600 32px "${font}"`]);
  return tex;
}

// The window leaderboard's cards: one per game in the shop plus the yard games the server keeps scores for (lib/store.js).
const BOARD_LOOK = {
  arkham: { color: '#8fb08a', empty: 'Win a case to get on the board' }, unicorns: { color: '#ff8fb8', empty: 'Win a game to get on the board' },
  bookwyrm: { color: '#e3aa45', empty: 'Win a playtest to get on the board' }, fishing: { color: '#6fd3ff', empty: 'Catch a fish to get on the board' },
  bocce: { color: '#f0862f', empty: 'Win a match at the court' },
  'mexican-train': { color: '#e3aa45', empty: 'Win a game with no bots in it' }, // (table-games)
};
export const boardRows = (msg, games = []) => {
  const list = Array.isArray(msg?.games) ? msg.games : [];
  const byId = new Map(list.map(r => [r.id, r]));
  // every game in the shop shows, scores or not (the server may not have heard of a new one yet), then the yard games
  const ids = [...games.map(gm => gm.id), ...list.map(r => r.id).filter(id => !games.some(gm => gm.id === id))];
  return ids.map(id => {
    const r = byId.get(id) || {}, gm = games.find(x => x.id === id);
    return { id, name: r.name || gm?.name || id, label: r.label || 'Wins', top: Array.isArray(r.top) ? r.top.slice(0, 3).map(p => ({ n: String(p.n || '').slice(0, 20), v: p.v })) : [], color: BOARD_LOOK[id]?.color, empty: BOARD_LOOK[id]?.empty };
  });
};

export function createGameStore(ctx) {
  const { scene, player, colliders, areas, ui, audio, camera, net, config } = ctx;
  loadCss('/css/store.css');
  // every game: ctx.config.games (store-only ones too: they have no area); the yard's tables if there is no config
  const games = (config?.games || areas.filter(a => a.game).map(a => a.game));
  const P = PLAN, { sx, sz, w, d, gy, floorY, minX, maxX, minZ, maxZ } = P;
  // dry inside, the shop and the loft under the roof and the back room under the loft (indoor-rooms.js: no rain, snow or wet in here)
  addRoom({ id: 'store', minX, maxX, minZ, maxZ, y0: floorY, y1: gy + P.H - 0.05 });
  addRoom({ id: 'store-back-room', minX: P.back.room.minX, maxX: P.back.room.maxX, minZ: P.back.room.minZ, maxZ: P.back.room.maxZ, y0: floorY, y1: P.LY });
  const g = new THREE.Group(); g.name = 'game-store'; scene.add(g);
  const pt = games.find(scheduled) || null; // the game the demo table hosts on its days (Bookwyrm)
  // the printed things: the boxes' art, the posters and the events board, the leaderboard
  const list = [...games.map(gm => ({ game: gm, name: gm.name, theme: gm.theme })), { name: 'Catan-ish', theme: 'soon' }, { name: 'Wingspan-ish', theme: 'soon' }, { name: 'Ticket to Ride-ish', theme: 'soon' }];
  const boxArt = boxAtlas(list.map(it => ({ name: it.name, theme: it.theme, foot: scheduled(it.game) ? 'PLAYTESTS ' + scheduleText(it.game.playtestDays).toUpperCase() : null })));
  const events = [...(pt ? [[scheduleText(pt.playtestDays).split(DOT).join(' '), `${pt.name} playtests`]] : []), ['Tue', 'D&D night in the back room'], ['Thu', 'Paint night in the loft'], ['Fri', 'New games in!'], ['Sat', 'Puzzle swap upstairs']]; // D&D night took the demo table's Tuesday line
  const posters = posterAtlas({ events });
  const board = leaderboard();
  board.set(boardRows(null, games));
  const built = buildStore(g, colliders, { posters, boxArt, board, boxes: list.map((it, i) => ({ ...it, art: i })), display: list.slice(0, 4).map((it, i) => ({ art: i })), renderer: ctx.renderer });
  const S = built.sides, door = built.door, doorCol = built.doorCol;
  const OD = P.outDoor, outLeaf = built.outDoor.leaf, outCol = built.outDoor.col, bdx = (OD.x0 + OD.x1) / 2; // the back room's own door
  // the little sign at the path's sidewalk end, facing the road: a post and a board
  {
    const SG = P.path.sign, b = new Batcher({ vertexColors: true });
    b.add(GEO.cyl8, '#5a3c26', { x: SG.x, y: gy + 0.6, z: SG.z, sx: 0.04, sy: 1.2, sz: 0.04 });
    b.build(S.back, 'store-path-sign-post');
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: signTexture(['D&D NIGHT', 'round the back ' + ARROW], { bg: '#2f6b4f', fg: '#fff4dc', w: 512, h: 256 }), fog: true }));
    board.position.set(SG.x, gy + 1.35, SG.z - 0.05); // (in front of the post, r 0.04: at 0.03 its top poked through the words) board.rotation.y = Math.PI; board.name = 'store-path-sign'; S.back.add(board);
    colliders.push({ type: 'circle', x: SG.x, z: SG.z, r: 0.1 });
  }
  shadows(S.front); shadows(S.back); shadows(S.west); shadows(S.east); shadows(S.roof);
  for (const m of built.glassMeshes) m.castShadow = false; // (the panes: see-through near, no shadow ever)
  // with the camera inside, the town outside is drawn only where an opening shows it (game-store-cull.js): the front door
  // while it is open, the back room's glass door always. The store, the people in it and the lamps' pools stay
  const KEEP = new Set(['lamp-pools', 'night-fx', 'weather-fx', 'shadow-proxies']);
  const cull = createStoreCull({
    scene, camera, renderer: ctx.renderer,
    box: { minX, maxX, minZ, maxZ, y0: gy - 1, y1: gy + P.H + 0.3 },
    keep: o => o === g || o === clerk.root || o === player.character?.root || KEEP.has(o.name) || o.name.startsWith('props game-store') || customers.some(h => h && h.root === o),
    portals: () => (doorT > 0.02 ? PORTALS : SHUT),
    groups: { npcs: 2.5, cars: 7, world: 0 },
  });
  // store-windows: every window is real glass now, so each is an opening too; the front door shut is its leaves' two windows
  const PORTALS = [
    { z: minZ, lo: sx - 1, hi: sx + 1, y0: gy, y1: gy + 2.6, out: -1 },            // the front door's opening (game-store-build.js DOOR)
    { z: maxZ, lo: OD.x0, hi: OD.x1, y0: OD.y0, y1: OD.y1, out: 1 },               // the back room's glass door: one clear pane
    ...built.windows.map(w => ({ ...(w.x !== undefined ? { x: w.x } : { z: w.z }), lo: w.a0, hi: w.a1, y0: w.y0, y1: w.y1, out: w.out, edge: w.edge })),
  ];
  const SHUT = [...[-1, 1].map(k => ({ z: minZ, lo: sx + k * 0.455 - 0.29, hi: sx + k * 0.455 + 0.29, y0: gy + 1.225, y1: gy + 2.175, out: -1 })), ...PORTALS.slice(1)]; // (game-store-build.js: the leaves' windows)
  for (const m of [built.board.out, built.board.in]) { m.castShadow = false; m.receiveShadow = false; }
  // the demo table (built with the other three); what is set up on it is built below
  const demoT = P.tables[0];
  const TX = demoT.x, TZ = demoT.z, TY = floorY + PLAN.TOP - 0.005; // the table's centre and the top of its top
  // the A-frame sign by the table (its faces are drawn below), one face to the door and one to the table
  const AX = TX + 1.6, AZ = TZ - 1.8, AY = floorY;
  {
    const b = new Batcher({ vertexColors: true, castShadow: false });
    for (const k of [-1, 1]) b.add(GEO.box, '#6b4a2b', { x: AX, y: AY + 0.45, z: AZ + k * 0.11, sx: 0.64, sy: 0.92, sz: 0.035, rx: -k * 0.24 });
    b.add(GEO.cyl8, '#5a3c26', { x: AX, y: AY + 0.9, z: AZ, sx: 0.025, sy: 0.68, sz: 0.025, rz: Math.PI / 2 }); // the hinge
    b.build(built.inside, 'store-aframe');
  }
  colliders.push({ type: 'circle', x: AX, z: AZ, r: 0.38 });
  const g0 = built.inside; // what is inside hides with the inside
  // the OPEN / CLOSED card on the front, between the door and the window (it hides with the front wall)
  const openMat = new THREE.MeshBasicMaterial({ map: signTexture(['OPEN'], { bg: '#e0463c', fg: '#ffffff', w: 256, h: 128 }), fog: true });
  const closedMat = new THREE.MeshBasicMaterial({ map: signTexture(['CLOSED', 'open 9 to 9'], { bg: '#2b2340', fg: '#fff4dc', w: 256, h: 128 }), fog: true });
  // the shop's name on the raised false front (over the roof line, in front of its brick)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 1.15), new THREE.MeshBasicMaterial({ map: signTexture([NAME], { bg: '#2f6b4f', fg: '#fff4dc', w: 768, h: 116 }), fog: true }));
  sign.position.set(sx, gy + P.H + 1.35, minZ - 0.09); sign.rotation.y = Math.PI; sign.name = 'store-sign'; S.front.add(sign);
  const openSign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), openMat); openSign.position.set(sx - 1.5, gy + 2.3, minZ - 0.05); openSign.rotation.y = Math.PI; S.front.add(openSign);
  const boxes = built.boxes; // [{ game?, name, theme, x, z, y }] on the shelves (the E prompts)
  const shelfCount = boxes.length;

  // ---- what's set up on the demo table: two looks, one shown (small and indoors, they cast no shadow, so the shadow proxies
  // never see them flip)
  const demoGen = new THREE.Group(), demoBw = new THREE.Group(); demoGen.name = 'store-demo'; demoBw.name = 'store-demo-playtest';
  g0.add(demoGen, demoBw);
  {
    const d = new Batcher({ vertexColors: true, castShadow: false }); // the everyday one: a cloth and twelve pegs
    d.add(GEO.box, '#2f3b4c', { x: TX, y: TY + 0.023, z: TZ, sx: 1.2, sy: 0.02, sz: 0.9 }); // its top 3 mm over the playtest cloth's, never one plane
    for (let i = 0; i < 12; i++) d.add(GEO.cyl8, ['#e0463c', '#3f8fd9', '#f0c24f', '#7ddc7a'][i % 4], { x: TX - 0.5 + (i % 4) * 0.33, y: TY + 0.05, z: TZ - 0.3 + Math.floor(i / 4) * 0.3, sx: 0.05, sy: 0.04, sz: 0.05 });
    d.build(demoGen, 'store-demo');
  }
  let catTail = null;
  {
    // Bookwyrm, in its own palette (night navy, parchment, gold, teal, wine): a navy cloth, the teal 2x3 shop board with
    // stacks of hoarded books, a little bookcase of coloured spines, a hand of cards and a coin at each seat, and the
    // black-and-white shop cat beside a book it knocked over
    const d = new Batcher({ vertexColors: true, castShadow: false });
    const top = TY + 0.03; // on the cloth
    d.add(GEO.box, '#18202d', { x: TX, y: TY + 0.015, z: TZ, sx: 1.5, sy: 0.03, sz: 1.0 });
    d.add(GEO.box, '#e3aa45', { x: TX, y: top + 0.005, z: TZ - 0.08, sx: 0.66, sy: 0.012, sz: 0.46 }); // the board's gold rim
    d.add(GEO.box, '#1f5560', { x: TX, y: top + 0.012, z: TZ - 0.08, sx: 0.62, sy: 0.012, sz: 0.42 });
    const SPINE = ['#7a2140', '#e3aa45', '#3f8fd9', '#7fb36a', '#e0564a', '#f3e3c3', '#2b3a4e', '#c27a3a'];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const x = TX - 0.2 + c * 0.2, z = TZ - 0.18 + r * 0.2;
      d.add(GEO.box, (r + c) % 2 ? '#f3e3c3' : '#e6d0a6', { x, y: top + 0.022, z, sx: 0.17, sy: 0.008, sz: 0.17 }); // a shop tile
      if ((r * 3 + c) % 2 === 0) for (let k = 0; k < 1 + ((r + c) % 3); k++) d.add(GEO.box, SPINE[(r * 3 + c + k * 3) % SPINE.length], { x: x + (k % 2 ? 0.01 : -0.01), y: top + 0.037 + k * 0.022, z, sx: 0.09, sy: 0.02, sz: 0.12, ry: k * 0.35 }); // a stack of books
    }
    // the bookcase at the back of the table, its shelves toward the door
    const bx = TX + 0.02, bz = TZ + 0.34, bw = 0.5, bh = 0.5, bd = 0.13, wood = '#4a2c1c', step = (bh - 0.03) / 3;
    d.add(GEO.box, '#2d1d16', { x: bx, y: top + bh / 2, z: bz + bd / 2 - 0.012, sx: bw - 0.006, sy: bh, sz: 0.02 }); // a hair inside the sides: no shared faces
    for (const k of [-1, 1]) d.add(GEO.box, wood, { x: bx + k * (bw / 2 - 0.015), y: top + bh / 2, z: bz, sx: 0.03, sy: bh, sz: bd });
    for (let i = 0; i <= 3; i++) d.add(GEO.box, i === 3 ? '#6b4128' : wood, { x: bx, y: top + 0.015 + i * step + (i === 3 ? 0.006 : 0), z: bz, sx: bw + (i === 3 ? 0.04 : 0), sy: 0.03, sz: bd + (i === 3 ? 0.02 : 0) });
    for (let sh = 0; sh < 3; sh++) {
      let x = bx - bw / 2 + 0.035; const y0 = top + 0.03 + sh * step, room = step - 0.035;
      for (let k = 0; x < bx + bw / 2 - 0.07; k++) {
        const w = 0.03 + ((sh * 7 + k * 3) % 4) * 0.007, h = room * (0.7 + ((sh * 5 + k * 2) % 4) * 0.08);
        const lean = sh === 1 && k === 5 ? 0.3 : 0; // one leans on its neighbour
        d.add(GEO.box, SPINE[(sh * 3 + k * 5) % SPINE.length], { x: x + w / 2, y: y0 + h / 2, z: bz - 0.005, sx: w, sy: h, sz: bd - 0.03 - (lean ? 0.008 : 0), rz: -lean }); // the leaning one a little shallower, so its face is never in its neighbours' plane
        x += w + 0.004 + (lean ? 0.02 : 0);
      }
    }
    // a hand of cards and a gold coin at each seat
    for (const [cx, cz, ry] of [[TX - 0.56, TZ + 0.05, Math.PI / 2], [TX + 0.56, TZ + 0.12, -Math.PI / 2], [TX - 0.12, TZ - 0.42, 0]]) {
      for (let k = 0; k < 3; k++) d.add(GEO.box, k === 1 ? '#e6d0a6' : '#f3e3c3', { x: cx + Math.cos(ry) * (k - 1) * 0.05, y: top + 0.004 + k * 0.003, z: cz - Math.sin(ry) * (k - 1) * 0.05, sx: 0.07, sy: 0.003, sz: 0.1, ry: ry + (k - 1) * 0.25 });
      d.add(GEO.cyl8, '#e3aa45', { x: cx + Math.cos(ry) * 0.13, y: top + 0.008, z: cz - Math.sin(ry) * 0.13, sx: 0.025, sy: 0.012, sz: 0.025 });
    }
    // the cat: black with a white bib, muzzle and socks, sitting right on the board (cats do) and facing the door; the
    // book it knocked off lies on the cloth in front
    const cx = TX, cz = TZ - 0.18, cy = top + 0.026, S = 1.25, ink = '#1b1b1f', wht = '#f6f3ea';
    const part = (geo, col, x, y, z, sx, sy, sz, rz = 0) => d.add(geo, col, { x: cx + x * S, y: cy + y * S, z: cz + z * S, sx: sx * S, sy: sy * S, sz: sz * S, rz });
    part(GEO.sphere, ink, 0, 0.068, 0.005, 0.062, 0.072, 0.076);
    part(GEO.sphere, wht, 0, 0.07, -0.052, 0.026, 0.038, 0.024); // the bib
    part(GEO.sphere, ink, 0, 0.15, -0.022, 0.05, 0.046, 0.048);
    part(GEO.sphere, wht, 0, 0.136, -0.063, 0.027, 0.019, 0.016);
    part(GEO.sphere, '#e88a9a', 0, 0.143, -0.078, 0.007, 0.005, 0.004); // the nose
    for (const k of [-1, 1]) {
      part(GEO.cone6, ink, k * 0.029, 0.197, -0.018, 0.019, 0.034, 0.017, -k * 0.25);
      part(GEO.sphere, '#c8d84a', k * 0.018, 0.157, -0.066, 0.009, 0.011, 0.006);
      part(GEO.sphere, wht, k * 0.024, 0.011, -0.05, 0.017, 0.011, 0.023);
    }
    d.add(GEO.box, '#7a2140', { x: TX + 0.2, y: top + 0.012, z: TZ - 0.4, sx: 0.12, sy: 0.022, sz: 0.085, ry: 0.55 }); // the book it knocked over
    d.add(GEO.box, '#f3e3c3', { x: TX + 0.2, y: top + 0.012, z: TZ - 0.4, sx: 0.112, sy: 0.016, sz: 0.088, ry: 0.55 }); // (its pages)
    d.build(demoBw, 'store-demo-playtest');
    // its tail flicks: one tiny mesh turning about its root at the cat's back
    catTail = new THREE.Group(); catTail.position.set(cx, cy + 0.02 * S, cz + 0.07 * S); catTail.scale.setScalar(S);
    const tail = new THREE.Mesh(GEO.cyl8, toon(ink)); tail.scale.set(0.012, 0.13, 0.012); tail.rotation.x = 1.1; tail.position.set(0, 0.03, 0.055);
    catTail.add(tail); demoBw.add(catTail);
  }
  for (const m of [demoGen, demoBw]) m.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  // the A-frame's faces: the chalkboard (any day) and the playtest board (a playtest day), swapped on the same two planes
  const ptDays = pt ? scheduleText(pt.playtestDays).split(DOT) : [];
  const chalkMat = new THREE.MeshBasicMaterial({ fog: true, map: boardTexture(pt ? [pt.name, 'playtests', ptDays.slice(0, 2).join(DOT), ptDays.slice(2).join(DOT)].filter(Boolean) : ['Demo table', 'have a go'], { bg: '#2e3b35', fg: '#f4f1e6', sub: '#e9d98f', frame: '#8a6240' }) });
  const todayMat = pt ? new THREE.MeshBasicMaterial({ fog: true, map: boardTexture([pt.name, 'playtest', 'today!', 'come and play'], { bg: '#18202d', fg: '#e3aa45', sub: '#f3e3c3', frame: '#1f5560' }) }) : chalkMat;
  // both stay in the scene, one hidden: daynight.js dims the painted signs it finds in the scene once, after dark
  const faceGeo = new THREE.PlaneGeometry(0.54, 0.7);
  const faces = [];
  for (const k of [-1, 1]) {
    const grp = new THREE.Group(); grp.position.set(AX, AY + 0.45, AZ + k * 0.11); grp.rotation.x = -k * 0.24; g0.add(grp);
    for (const mat of todayMat === chalkMat ? [chalkMat] : [chalkMat, todayMat]) {
      const m = new THREE.Mesh(faceGeo, mat); m.position.z = k * (mat === todayMat ? 0.023 : 0.02); // (the two looks 3 mm apart, never one plane)
      if (k < 0) m.rotation.y = Math.PI;
      grp.add(m); faces.push(m);
    }
  }

  // ---- the people
  // their looks live in npc-looks.js: the NPC Editor dresses them (lookOf merges what Andrew saved, nothing saved = as built in)
  const clerk = new Human({ ...lookOf('clem', NPCS.clem.look) });
  const CLERK_VOICE = voiceOf('clem', NPCS.clem.voice);
  clerk.root.position.set(P.clem.x, floorY, P.clem.z); clerk.root.rotation.y = P.clem.yaw; scene.add(clerk.root); // behind the counter on the left (east) as you come in
  const ctag = ui.nameTag(clerk.root, tagOf('clem', 'Clem'), '#ffffff'); ctag.max = 14; ctag.fade = 9;
  // the two shoppers are town folk: on a phone they are in the town cast (town-cast.js), built only while it has them
  const custId = i => (i ? 'pip' : 'jonah');
  const custLook = i => ({ ...lookOf(custId(i), NPCS[custId(i)].look) });
  const custName = i => (i ? 'Pip' : 'Jonah');
  const custHere = (i, t) => { const h = hourAt(t); return h >= OPEN[0] && h < OPEN[1] && hash01('cust', i, Math.floor(t / 240)) < 0.6; }; // pure: the shared clock
  const lazyCust = castOn();
  const custSeats = [castSeat(), castSeat()], custTags = [null, null];
  const buildCust = i => { const h = new Human(custLook(i)); h.root.visible = false; h.root.position.set(sx + (i ? 2 : -2), floorY, sz); scene.add(h.root); const tg = ui.nameTag(h.root, tagOf(custId(i), custName(i)), '#ffffff'); tg.max = 12; tg.fade = 8; custTags[i] = tg; return h; };
  const freeCust = i => { const h = customers[i]; scene.remove(h.root); h.dispose(); custTags[i].remove(); customers[i] = null; };
  for (const i of [0, 1]) castMember('store:' + custName(i), t => custHere(i, t));
  const customers = [0, 1].map(i => (lazyCust ? null : buildCust(i)));
  const CLERK_LINES = ['Welcome in! Have a look around.', 'That one is a two-player favourite.', 'We get new games in on Fridays.', 'The demo table is free if you want a go.', 'Tell Andrew we said hi.', 'D&D night is in the back room. Pull up a chair.'];
  // on a playtest day Clem talks it up (and the demo table is not free); other days Clem says when they are
  const PT_LINES = pt ? [`${pt.name} playtest at the demo table today!`, 'Mind the shop cat in that one. It knocks things over.'] : [];
  const PT_OFF = pt ? [`${pt.name} playtests: ${scheduleText(pt.playtestDays)}.`] : [];
  const clerkLines = () => (playtest ? [...PT_LINES, ...PT_LINES, ...CLERK_LINES.filter(l => !/demo table/.test(l))] : [...CLERK_LINES, ...PT_OFF]);
  const clerkSay = line => { ui.say(clerk.root, line, 3.5, 2.3); audio.speak(clerk.root.position.x, floorY + 1.6, clerk.root.position.z, line, CLERK_VOICE); clerk.say?.(1.2); };

  // ---- the card
  const card = el('div', 'store-card panel', '', { hidden: '', role: 'dialog' });
  const cTitle = el('div', 'store-title'), cBlurb = el('div', 'store-blurb'), cWhen = el('div', 'store-when', '', { hidden: '' }), cStats = el('div', 'store-stats');
  const cPlay = el('button', 'btn primary', 'Play'), cClose = el('button', 'btn', 'Put it back');
  const cBtns = el('div', 'store-btns'); cBtns.append(cPlay, cClose);
  card.append(cTitle, cBlurb, cWhen, cStats, cBtns); ctx.hud.append(card);
  let shown = null;
  function show(bx) {
    shown = bx; card.hidden = false; player.controls = false;
    cTitle.textContent = bx.name;
    cBlurb.textContent = bx.game ? bx.game.blurb || '' : 'Coming soon to a table in the yard.';
    cStats.textContent = '';
    playable(bx);
    audio.ui?.('pop');
    if (bx.game && !String(ctx.profile.id).startsWith('guest-')) fetch('/api/stats?player=' + encodeURIComponent(ctx.profile.id), { cache: 'no-store', headers: ctx.accounts?.headers() || {} }).then(r => r.ok ? r.json() : null).then(j => { const s = j?.games?.[bx.game.id]; if (s && shown === bx) cStats.textContent = `You have launched it ${s.launches ?? s.plays ?? 0} time${(s.launches ?? s.plays ?? 0) === 1 ? '' : 's'} from Breneland.`; }).catch(() => {});
  }
  // Play, or for a game with playtest days only while one is on (otherwise when the next one is). Again if it changes
  // while the card is open (9 pm, midnight).
  function playable(bx) {
    const gm = bx.game, sch = scheduled(gm);
    if (gm?.venue === HOUSE_VENUE && gm.playDays?.length) { // Arkham Horror is played at the Lovecraft house, on its days
      const on = houseOpen(gm, net.serverNow());
      cPlay.hidden = !on; cWhen.hidden = false;
      cWhen.textContent = on ? 'Open today at the Lovecraft house on Breneland Rd.' : `Played at the Lovecraft house on ${houseDays(gm.playDays)}. Next: ${houseNext(gm, net.serverNow())}.`;
      return;
    }
    cPlay.hidden = !gm || (sch && !playtest);
    cWhen.hidden = !sch;
    if (!sch) return;
    const next = playtest ? '' : nextPlaytest(gm, net.serverNow(), LIGHT.hour);
    cWhen.textContent = playtest ? 'Playtest today at the demo table, until 9 pm.' : next.startsWith('today') ? `Next playtest: ${next}.` : `Next playtest: ${next}, 9 am to 9 pm.`;
  }
  function hide() { shown = null; card.hidden = true; if (ctx.playing) player.controls = true; }
  cClose.onclick = hide;
  cPlay.onclick = () => { const gm = shown?.game; if (gm) { hide(); ctx.play(gm.id); } }; // hide() clears `shown`, so read the game first

  const inside = (x, z) => x > minX && x < maxX && z > minZ + 0.2 && z < maxZ;
  const isOpen = () => LIGHT.hour >= OPEN[0] && LIGHT.hour < OPEN[1];
  const isBackOpen = () => LIGHT.hour >= BACK_OPEN[0] && LIGHT.hour < BACK_OPEN[1];
  let doorT = 0, lastLine = 0, backDoorT = 0, outDoorT = 0;
  audio.registerSfx?.('bell', (a, x, y, z) => { const o = a.at(x, y, z, 4); const t = a.ctx.currentTime; a.tone(o, { f: 2100, t, d: 0.5, peak: 0.06, verb: 0.5 }); a.tone(o, { f: 2600, t: t + 0.05, d: 0.6, peak: 0.05, verb: 0.5 }); });
  audio.registerSfx?.('door-click', (a, x, y, z) => { const o = a.at(x, y, z, 3); const t = a.ctx.currentTime; a.burst(o, { dur: 0.06, f: 1800, Q: 2, peak: 0.08 }); a.tone(o, { f: 620, t: t + 0.02, d: 0.12, peak: 0.03 }); }); // the back door's latch: a soft click, no bell
  let wasInside = false;
  // the lights: the shop's bulbs and lamps (the loft's too) while the shop is open, the back room's (and the lamp over its back door)
  // while the room is; off means a dim grey bulb, no pool on the floor (daynight-fx.js reads `k`), no real light (main.js)
  const lights = { shop: null, room: null, in: null };
  const shopGlass = built.glass;
  const setLights = (shopOn, roomOn, inNow) => {
    if (shopOn === lights.shop && roomOn === lights.room && inNow === lights.in) return;
    lights.shop = shopOn; lights.room = roomOn; lights.in = inNow;
    LAMPS.get('store-bulbs').base.set(shopOn ? '#ffffff' : '#2e2a26');
    LAMPS.get('store-bulbs-room').base.set(roomOn ? '#ffffff' : '#2e2a26');
    for (const s of built.lamps) { s.k = shopOn ? 1 : 0; s.day = inNow && shopOn ? 0.55 : 0; }
    for (const s of built.roomLamps) { s.k = roomOn ? 1 : 0; s.day = inNow && roomOn ? 0.55 : 0; }
  };
  // the playtest: on (a playtest day, the shop open) flips the demo table, the A-frame and Clem's lines. Checked every
  // frame (a memoised day lookup and a compare); the scene only changes when it flips.
  let playtest = null;
  const playtestNow = () => !!pt && playtestOn(pt, net.serverNow(), LIGHT.hour);
  const setPlaytest = on => {
    playtest = on; demoBw.visible = on; demoGen.visible = !on;
    for (const f of faces) f.visible = (f.material === todayMat) === on || todayMat === chalkMat;
    if (shown) playable(shown);
  };
  setPlaytest(false);
  const ptBox = pt ? boxes.find(bx => bx.game === pt) : null;

  // ---- sitting: the four tables' chairs and the loft's seats (the window seat, beanbags, the puzzle table, the painting desk)
  const seats = built.seats;
  const jonahSeat = seats.find(s => s.table === 'demo' && Math.abs(s.x - (TX + P.CHAIR)) < 0.01); // on a playtest day Jonah sits in the demo table's east chair
  // the table a seat is at, for the sitter's hands (bodies-poses.js tableRest: human.js params.table, world: the top's middle, radius and height)
  const tableParams = new Map(P.tables.map(t => [t.id, { x: t.x, z: t.z, r: P.TR, y: floorY + PLAN.TOP }]));
  { const T = P.back.table; tableParams.set('dnd', { y: T.top, minX: T.x - T.w / 2, maxX: T.x + T.w / 2, minZ: T.z - T.d / 2, maxZ: T.z + T.d / 2 }); } // the back room's table
  const tableOf = seat => (seat && seat.table && tableParams.get(seat.table)) || null;
  let sitting = null, satAt = 0, jonahSits = false;
  const solid = (x, z) => colliders.some(c => !c.off && !c.seat && (c.type === 'circle' ? Math.hypot(x - c.x, z - c.z) < c.r + 0.25 : x > c.minX - 0.25 && x < c.maxX + 0.25 && z > c.minZ - 0.25 && z < c.maxZ + 0.25));
  // Seated, first person, like the porch swing (porch-swing.js): the camera sits at your eyes, looking the way the seat faces (down
  // at the table from a chair). The look input (mouse drag, touch drag, the right stick) turns your head within a natural range
  // (FP_YAW either side, FP_UP / FP_DOWN), your own body is hidden (a head in front of the lens), and standing up hands the walking
  // camera (indoor-view.js) your eyes and the way you were looking.
  // A chair at the D&D table carries a three-quarter shot too (`seat.tq`, dnd.js threeQuarter): the same toggle as the room view (the
  // button, F, L3, remembered with it) puts the camera up behind and beside your chair with your body shown; a drag nudges it round
  // the chair (TQ_NUDGE either way) and it eases back when you let go.
  const FP_YAW = 1.9, FP_UP = -0.75, FP_DOWN = 0.95;   // radians: head and shoulders turn; pitch > 0 looks down
  const TQ_NUDGE = 25 * Math.PI / 180;
  const fp = { yaw: 0, pitch: 0, on: false };
  const tq = { n: 0, hold: 0, was: null };
  const fpEye = new THREE.Vector3(), fpAhead = new THREE.Vector3(), fpP = new THREE.Vector3(), fpL = new THREE.Vector3();
  let hidRoot = false;
  const hideMe = on => { const r = player.character?.root; if (!r) return; if (on && r.visible) { r.visible = false; hidRoot = true; } else if (!on && hidRoot) { r.visible = true; hidRoot = false; } };
  const showMe = () => { const r = player.character?.root; if (r && !r.visible) r.visible = true; }; // (the three-quarter shot: you're in it, whoever hid you)
  const clampYaw = (y, base) => base + Math.max(-FP_YAW, Math.min(FP_YAW, y - base)); // fp.yaw starts at the seat's yaw and never leaves the range: no wrap
  // where your eyes are on a seat: over the seat, a little forward of the hips, at the sitting head's height
  const eyeOf = (seat, v) => {
    const head = player.character?.head;
    if (head && fp.on) { head.updateWorldMatrix(true, false); head.getWorldPosition(v); }
    else v.set(seat.x, seat.y + seat.seatY + 0.9, seat.z);
    v.x += Math.sin(seat.yaw) * 0.14; v.z += Math.cos(seat.yaw) * 0.14; // in front of the face, not inside the head
    return v;
  };
  function sit(seat) {
    sitting = seat; satAt = -1;
    const f = seatFit(player.character, seat.front), sx = seat.x + Math.sin(seat.yaw) * f, sz = seat.z + Math.cos(seat.yaw) * f; // (seats-bodies: the knees just past the chair's edge, each body)
    player.pos.set(sx, seat.y, sz); player.yaw = seat.yaw;
    player.character.params.seatY = seat.seatY; player.character.params.table = tableOf(seat);
    fp.yaw = seat.fpYaw != null ? clampYaw(seat.fpYaw, seat.yaw) : seat.yaw; fp.pitch = seat.fpPitch ?? (seat.table ? 0.3 : 0.15); fp.on = false; // at a table: looking down at it (a seat may say where to look first and how far down)
    tq.n = 0; tq.hold = 0; tq.was = null;
    fpP.copy(camera.position); fpL.copy(player.cam?.look?.lengthSq?.() ? player.cam.look : player.pos);
    const t0 = performance.now() / 1000;
    player.takeover = {
      anim: 'sit', store: true,
      update(dt, now, inp, pl) {
        if (satAt < 0) satAt = now;
        pl.pos.set(sx, seat.y, sz); pl.yaw = seat.yaw;
        const mv = inp.move();
        if (Math.hypot(mv.x, mv.y) > 0.5 && now - satAt > 0.6) stand();
      },
      camera(dt, cam, inp) {
        const look = inp.takeLook();
        if (look.cycle && seat.tq) iv.toggle(false); // the pad's L3, as on your feet
        // the three-quarter shot is the seat's other view: since camera-view the toggle (F, the button, L3) goes first person <->
        // 'normal' (a remembered 'room' loads as 'normal'), so anything but first person is the shot here (it was 'room' only, and F
        // at the table changed the view to 'normal' with the camera left in first person: flaky-suites-2)
        const three = seat.tq && iv.view !== 'fp' ? seat.tq : null;
        const cut = tq.was !== null && tq.was !== !!three; tq.was = !!three; // a switch of view is a cut, never a swing
        if (three) {
          fp.on = false; showMe();
          // a drag nudges the camera round your chair, and it eases back once you let go
          if (look.x) { tq.n = Math.max(-TQ_NUDGE, Math.min(TQ_NUDGE, tq.n - look.x * 0.004)); tq.hold = 0.25; }
          else if (tq.hold > 0) tq.hold -= dt;
          else tq.n -= tq.n * Math.min(1, dt * 4);
          const c = Math.cos(tq.n), s = Math.sin(tq.n), dx = three.x - seat.x, dz = three.z - seat.z;
          fpEye.set(seat.x + dx * c - dz * s, three.y, seat.z + dx * s + dz * c);
          fpAhead.set(three.lx, three.ly, three.lz);
        } else {
          hideMe(true); fp.on = true;
          if (look.x || look.y) { fp.yaw = clampYaw(fp.yaw - look.x * 0.0055, seat.yaw); fp.pitch = Math.max(FP_UP, Math.min(FP_DOWN, fp.pitch + look.y * 0.004)); }
          eyeOf(seat, fpEye);
          fpAhead.set(fpEye.x + Math.sin(fp.yaw) * Math.cos(fp.pitch), fpEye.y - Math.sin(fp.pitch), fpEye.z + Math.cos(fp.yaw) * Math.cos(fp.pitch));
        }
        if (cut) { fpP.copy(fpEye); fpL.copy(fpAhead); }
        // ease in from wherever the follow camera was, then it is your head (or the shot)
        const k = 1 - Math.exp(-dt * 6), settled = performance.now() / 1000 - t0 > 0.7;
        fpP.lerp(fpEye, Math.min(1, k * (settled ? 4 : 1)));
        fpL.lerp(fpAhead, Math.min(1, k * (settled ? 4 : 2)));
        cam.position.copy(fpP); cam.lookAt(fpL);
        return true;
      },
    };
    audio.ui?.('pop');
    const pad = ctx.input?.lastDevice === 'pad', touch = ctx.hudLayout?.layout === 'phone';
    const lookWords = pad ? 'Right stick to look around' : touch ? 'Drag to look around' : 'Drag to look around';
    ui.toast(seat.table === 'demo' && playtest ? `${lookWords}. E to play, move to get up.` : `${lookWords}. E or move to get up.`, 2600);
  }
  function stand() {
    if (!sitting) return;
    const s = sitting; sitting = null;
    if (player.takeover?.store) player.takeover = null;
    player.character.params.seatY = 0; player.character.params.table = null;
    fp.on = false; hideMe(false); // (the walking camera hides you again if it's first person)
    // step back from the chair (out from the table), or forward where the back is against a wall (the window seat)
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    let x = s.x - fx * 0.8, z = s.z - fz * 0.8;
    if (solid(x, z) || !inside(x, z)) { x = s.x + fx * 0.75; z = s.z + fz * 0.75; }
    player.pos.set(x, s.y, z);
    player.collide();
    // you stand up in the shop: first person carries on from your eyes the way you were looking, the room view picks its corner again
    iv.look(fp.yaw, Math.max(-1.15, Math.min(0.5, fp.pitch))); iv.reset();
    const c = player.cam;
    if (c) { c.yaw = fp.yaw + Math.PI; c.pitch = 0.3; c.pos.copy(camera.position); c.look.copy(fpL); c.manualAt = performance.now() / 1000; }
  }

  // ---- the camera inside: first person or the room view, the toggle under the smiley, F and L3 (indoor-view.js, shared with the
  // houses; it owns the walk, the store had its own first person before). The rooms are zones: the shop floor, the stairs (by
  // height), the loft and the back room, each with the corner spots its camera hangs at (high enough to clear the shelves, the
  // counter and the cases). The walls are what a tag or a bubble never shows through (ui.js occluder) and what a corner camera must
  // see past: the four outer walls and the back room's front wall either side of the half-glass door (the opening is no wall: a tag
  // through its glass still shows). The loft and the floor under it are different storeys (`y`, `top`). A seat's camera (above)
  // takes over and gives it back.
  const iv = indoorView(ctx);
  // out of the shop, the follow camera stays out too: stepping out of the door it would sit behind you, inside the walls (the roof
  // and walls stay on), so it's pulled in along its line to just outside them
  const kTarget = new THREE.Vector3();
  const keepOut = cam => {
    const c = cam.position, pad = 0.35;
    if (inside(player.pos.x, player.pos.z) || !(c.x > minX - pad && c.x < maxX + pad && c.z > minZ - pad && c.z < maxZ + pad) || c.y > gy + P.H + 0.6) return;
    kTarget.set(player.pos.x, player.pos.y + 1.6, player.pos.z);
    let t = 1;
    for (let i = 1; i <= 24; i++) { const u = i / 24, x = kTarget.x + (c.x - kTarget.x) * u, z = kTarget.z + (c.z - kTarget.z) * u; if (x > minX - pad && x < maxX + pad && z > minZ - pad && z < maxZ + pad) { t = (i - 1) / 24; break; } }
    c.lerpVectors(kTarget, c, Math.max(0.12, t)); cam.lookAt(kTarget);
  };
  const ST = P.stair, BR = P.back.room, BD = P.back.door, ceil = gy + P.H;
  const corners = (x0, z0, x1, z1, y, pad = 0.5) => [[x0 + pad, z0 + pad, y], [x1 - pad, z0 + pad, y], [x0 + pad, z1 - pad, y], [x1 - pad, z1 - pad, y]];
  const wall = (minX, maxX, minZ, maxZ, y0, y1) => ({ minX, maxX, minZ, maxZ, y0, y1 });
  const bld = iv.register({
    id: 'store', inside, keepOut,
    rooms: [
      { id: 'shop', minX: P.iMinX, maxX: P.iMaxX, minZ, maxZ: P.zL, y: floorY, top: ceil, cams: [[P.iMinX + 0.5, P.iMinZ + 0.5, gy + 3.6], [P.iMaxX - 0.5, P.iMinZ + 0.5, gy + 3.6], [ST.maxX + 0.6, P.zL - 0.5, gy + 3.6], [P.iMaxX - 0.5, P.zL - 0.5, gy + 3.6]] },
      { id: 'stair', minX: ST.minX, maxX: ST.maxX, minZ: ST.z0, maxZ: ST.z1, y: floorY, top: P.LY + 2.5, stair: true, cams: [[(ST.minX + ST.maxX) / 2 + 0.3, ST.z0 - 0.5, floorY + 2.6], [(ST.minX + ST.maxX) / 2 + 0.3, P.zL + 0.6, P.LY + 2.2]] }, // its spots hang over either end
      { id: 'loft', minX: P.iMinX, maxX: P.iMaxX, minZ: P.zL, maxZ, y: P.LY, top: ceil - 0.25, cams: corners(P.iMinX, P.zL, P.iMaxX, P.iMaxZ, P.LY + 2.3) },
      { id: 'back', minX: BR.minX, maxX: BR.maxX, minZ: BR.minZ, maxZ, y: floorY, top: BR.ceil, cams: corners(BR.minX, BR.minZ, BR.maxX, BR.maxZ, BR.ceil - 0.2) },
    ],
    walls: [
      wall(minX, maxX, minZ, minZ + P.T, gy, ceil), wall(minX, maxX, maxZ - P.T, maxZ, gy, ceil), wall(minX, minX + P.T, minZ, maxZ, gy, ceil), wall(maxX - P.T, maxX, minZ, maxZ, gy, ceil),
      wall(P.iMinX, BD.x0, P.zL - 0.15, P.zL + 0.08, floorY, P.LY + 0.02), wall(BD.x1, P.iMaxX, P.zL - 0.15, P.zL + 0.08, floorY, P.LY + 0.02), // (up to the loft's floor: its edge is solid too)
    ],
    // the stairs by height (on them from the first tread, off them at the loft's floor), the rest by their floor
    zoneHas: (r, x, y, z, depth = 0) => {
      if (r.stair) return x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ && y > floorY + (depth ? 0.3 : 0.05) && y < P.LY - (depth ? 0.08 : 0.02);
      return x > r.minX + depth && x < r.maxX - depth && z > r.minZ + depth && z < r.maxZ - depth && Math.abs(y - r.y) < 1.2;
    },
    busy: () => !!sitting && !sitting.tq, // a chair in the shop or the loft is first person only: nothing to switch
  });
  const seatNear = (px, pz) => {
    let best = null, bd = Infinity;
    for (const s of seats) { if ((s === jonahSeat && jonahSits) || s.dnd !== undefined || Math.abs(s.y - player.pos.y) > 1.2) continue; const dd = Math.hypot(px - s.x, pz - s.z); if (dd < (s.reach || 0.62) && dd < bd) { bd = dd; best = s; } } // a chair: right beside it. The window seat and the beanbags: in front of them
    return best;
  };
  const remoteSat = new Map(); // remote sid -> its seat (drawn on it: the seat height)

  // ---- a warm-up draw: the shop's inside, its people and the lamps drawn once off screen soon after the game loads (on the
  // start screen, or early in play), so its shader programs' first use, its textures' upload and its geometry's upload do
  // not all land on the frame you first see the shop (half a second on a PC before this). First every program is linked
  // (in the background: KHR_parallel_shader_compile), then the draw waits for the shop's to be ready, so it blocks on
  // nothing (a dozen seconds at most). A change of graphics level makes every program new, so it runs again then.
  // On Max the nearest lamps cast shadows once they are lit (daynight.js), and by day the shop's are the only lit ones: the
  // frame you step in, every program is built again for three lamp shadows (3.3 s on a PC before this). So on Max the
  // link covers that variant of everything too, and the draw has the lamps casting, so what is drawn in here has used its
  // night program before you arrive
  let warmPhase = 0, warmLevel = null, warmAt = performance.now() + 3500, warmBy = 0; // (3.5 s: the people merged by then, rigid-merge.js)
  const warmRoots = () => [g0, clerk.root, ...customers.filter(Boolean).map(h => h.root)];
  const warmLamps = () => (GFX.s?.lamps > 0 ? scene.children.filter(o => o.isPointLight && o.userData.lampLight && !o.castShadow).slice(0, GFX.s.lamps) : []);
  const warmReady = () => {
    const props = ctx.renderer.properties;
    let ready = true;
    for (const root of warmRoots()) root.traverse(o => { const m = o.material; if (!m) return; for (const mm of Array.isArray(m) ? m : [m]) { const pr = props.get(mm).currentProgram; if (pr && pr.isReady && !pr.isReady()) ready = false; } });
    return ready;
  };
  // every material's program for the frame as drawn (a render target bound: toon.js draws into one), the lamp-shadow one too
  function warmLink() {
    const r = ctx.renderer, rt = new THREE.WebGLRenderTarget(4, 4), lamps = warmLamps(), target = r.getRenderTarget();
    try {
      r.setRenderTarget(rt);
      if (lamps.length) { for (const l of lamps) l.castShadow = true; r.compile(scene, camera); for (const l of lamps) l.castShadow = false; }
      r.compile(scene, camera);
    } catch (e) { console.warn('[store] warm-up link failed', e); }
    finally { r.setRenderTarget(target); rt.dispose(); }
  }
  function warmDraw() {
    const r = ctx.renderer, ink = ctx.ink;
    if (!ink) return;
    const rt = new THREE.WebGLRenderTarget(16, 16);
    const cam = new THREE.PerspectiveCamera(80, 1, 0.1, 300);
    cam.position.set(sx, floorY + 1.6, minZ + 2.4); cam.lookAt(sx + 1.5, floorY + 1.0, maxZ); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const shown = warmRoots().map(o => [o, o.visible]);
    for (const [o] of shown) { o.visible = true; o.updateMatrixWorld(true); }
    const lamps = warmLamps(), target = r.getRenderTarget();
    try {
      if (lamps.length) { for (const l of lamps) { l.castShadow = true; l.shadow.needsUpdate = true; } r.shadowMap.needsUpdate = true; }
      cull.hideFor(cam.position);
      r.setRenderTarget(rt); r.clear();
      cam.layers.enable(LAYER_SOFT); r.render(scene, cam);                       // the colour pass's programs (and the lamps' shadow maps)
      if (ink.normalMat) { cam.layers.disable(LAYER_SOFT); scene.overrideMaterial = ink.normalMat; r.render(scene, cam); scene.overrideMaterial = null; } // the ink pass's
    } catch (e) { console.warn('[store] warm-up draw failed', e); }
    finally { r.setRenderTarget(target); cull.show(); for (const l of lamps) l.castShadow = false; for (const [o, v] of shown) o.visible = v; rt.dispose(); }
  }
  frameHooks.push(() => {
    if (ctx.below) return;
    const now = performance.now();
    if (warmLevel !== GFX.level) { warmLevel = GFX.level; warmPhase = 0; warmAt = Math.max(warmAt, now + 800); } // a new level: new programs
    if (warmPhase === 2 || now < warmAt) return;
    if (warmPhase === 0) { warmLink(); warmPhase = 1; warmBy = now + 12000; return; }
    if (now < warmBy && !warmReady()) return;
    warmDraw(); warmPhase = 2;
  });

  // ---- the leaderboard: what the server serves now, then its pushes (lib/store.js)
  let boardMsg = null;
  const takeBoard = m => { boardMsg = m; board.set(boardRows(m, games)); };
  fetch('/api/leaderboard', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => { if (j && !boardMsg) takeBoard(j); }).catch(() => {});
  net.on?.('board', takeBoard);
  let showIn = true, swayT = 0, inkFull = null, folkCast = null;
  // store-windows: near the store (or in it) the windows are see-through and the inside is drawn for them (real-glass.js); far off
  // they are the lit panes and the inside is not drawn. Seen through the glass from outside the people cast no shadow (the roof
  // keeps the sun off them anyway); looked into from outside on a phone or a tablet the inside is drawn in colour only.
  const gv = createGlassView({ boxes: [{ minX, maxX, minZ, maxZ }], meshes: () => built.glassMeshes, mats: [built.glassReal], U: built.glassU });
  const castOf = (h, on) => h.root.traverse(o => {
    if (!o.isMesh) return;
    if (on) { if (o.userData.rwCast !== undefined) { o.castShadow = o.userData.rwCast; delete o.userData.rwCast; } }
    else if (o.userData.rwCast === undefined) { o.userData.rwCast = o.castShadow; o.castShadow = false; }
  });
  const custCast = new WeakMap(); // a customer -> whether it casts now (they are built and freed as they come and go)
  const folkShadows = on => {
    if (on !== folkCast) { folkCast = on; castOf(clerk, on); }
    for (const h of customers) if (h && custCast.get(h) !== on) { custCast.set(h, on); castOf(h, on); }
  };

  return {
    name: 'store',
    people: { clerk, customers },   // for tests: the NPC Editor's suite checks they wear what was saved
    // for tests: whether the demo table hosts the playtest now, its two looks and the A-frame, Clem's line pool now
    get playtest() { return playtest; },
    demo: { gen: demoGen, playtest: demoBw, faces, chalkMat, todayMat, game: pt, table: { x: TX, z: TZ }, sign: { x: AX, z: AZ } },
    get clerkLines() { return clerkLines(); },
    plan: P, seats, loft: { x: P.loft.spot.x, z: P.loft.spot.z, y: P.LY },
    get sitting() { return sitting; },
    look: (yaw, pitch = 0.08) => iv.look(yaw, pitch), // tests and pictures: where your eyes look
    get view() { return iv.view; }, setView: v => iv.setView(v, true), toggle: () => iv.toggle(true), get button() { return iv.button; },
    get walkFP() { return sitting ? null : iv.walkFP(bld); },
    get roomCam() { return sitting ? null : iv.roomCam(bld); },
    get room() { return iv.active === bld ? iv.room : null; }, get shot() { return iv.active === bld ? iv.shot : null; }, get cuts() { return iv.cuts; },
    sees: (c, x, y, z) => iv.sees(bld, c, x, y, z),
    get firstPerson() { return sitting && fp.on ? { yaw: fp.yaw, pitch: fp.pitch, seatYaw: sitting.yaw, limits: { yaw: FP_YAW, up: FP_UP, down: FP_DOWN }, hidden: !player.character.root.visible } : null; },
    // (tests) the seat's camera: first person or the three-quarter shot, how far a drag has nudged it round the chair
    get seatView() { return sitting ? { view: sitting.tq && iv.view !== 'fp' ? 'room' : 'fp', nudge: tq.n, limit: TQ_NUDGE, x: camera.position.x, y: camera.position.y, z: camera.position.z, shown: player.character.root.visible } : null; },
    get board() { return board.rows; },
    back: built.back, get backDoor() { return backDoorT; }, // the back room's plan, door, seats, art (dnd.js drives the table)
    outDoor: built.outDoor, get outDoorT() { return outDoorT; }, // the room's own door to the outside (its leaf, its collider) and how far it is open
    get open() { return isOpen(); }, get backOpen() { return isBackOpen(); }, hours: { shop: OPEN, back: BACK_OPEN },
    get lights() { return { shop: lights.shop, room: lights.room }; }, get frontDoor() { return doorT; }, glassMat: shopGlass, // (tests: the lights and the glass by the hour, the front doors' swing)
    get boardMsg() { return boardMsg; },
    get insideShown() { return showIn; },
    glassView: gv, portals: PORTALS, glassMeshes: built.glassMeshes, glassReal: built.glassReal, windows: built.windows, // (tests: the real windows)
    get cull() { return cull.state; }, get culled() { return cull.hiddenNames; },   // (tests) the outside hidden while the camera is in: on, how many things, through how many openings
    get warmed() { return warmPhase === 2; }, // (tests) the warm-up draw done for this level
    inside: () => inside(player.pos.x, player.pos.z),   // the store's own music while you're in
    sit, stand,
    update(dt, now) {
      cull.install(ctx.ink); // (once: the ink pass exists after the features are made)
      const open = isOpen();
      openSign.material = open ? openMat : closedMat;
      const pOn = playtestNow();
      if (pOn !== playtest) setPlaytest(pOn);
      if (pOn && inside(player.pos.x, player.pos.z)) catTail.rotation.y = Math.sin(now * 2.3) * 0.55 + Math.sin(now * 0.7) * 0.25; // the cat's tail
      const bOpen = isBackOpen();
      const px = player.pos.x, pz = player.pos.z, py = player.pos.y;
      // the front doors: for anyone while the shop is open; after hours only for someone leaving (and held while they pass)
      const dFront = Math.hypot(px - sx, pz - minZ);
      const nearDoor = dFront < 2.4 && (open || inside(px, pz) || (doorT > 0.5 && dFront < 1.2));
      doorT += ((nearDoor ? 1 : 0) - doorT) * Math.min(1, dt * 4);
      door.userData.leaves[0].rotation.y = -1.35 * doorT; door.userData.leaves[1].rotation.y = 1.35 * doorT; // both leaves swing in
      doorCol.off = doorT > 0.3;
      // the back room's half-glass door swings in while someone on the shop floor is at it (you or another player), while the
      // shop is open; after 9 it is locked both ways (the room's way in and out is its own door)
      { const BD = P.back.door, bx = (BD.x0 + BD.x1) / 2, at = (x, y, z) => y < P.LY - 1 && Math.abs(x - bx) < 1.3 && Math.abs(z - BD.z) < 1.5;
        let near = open && at(px, py, pz);
        if (open && !near && showIn && ctx.remotes?.map) for (const r of ctx.remotes.map.values()) { const q = r.ch.root.position; if (at(q.x, q.y, q.z)) { near = true; break; } }
        backDoorT += ((near ? 1 : 0) - backDoorT) * Math.min(1, dt * 4);
        built.back.leaf.rotation.y = -1.45 * backDoorT; built.back.doorCol.off = backDoorT > 0.3; }
      // the glass door to the outside swings into the room for anyone at it while the room is open, after midnight only for
      // someone leaving (and held while they pass); its collider is off while it is open
      { const at = (x, y, z) => y < P.LY - 1 && Math.abs(x - bdx) < 1.3 && Math.abs(z - maxZ) < 1.5;
        const may = z => bOpen || z < maxZ - 0.05 || (outDoorT > 0.5 && Math.abs(z - maxZ) < 0.8);
        let near = at(px, py, pz) && may(pz);
        if (!near && ctx.remotes?.map) for (const r of ctx.remotes.map.values()) { const q = r.ch.root.position; if (at(q.x, q.y, q.z) && may(q.z)) { near = true; break; } }
        outDoorT += ((near ? 1 : 0) - outDoorT) * Math.min(1, dt * 4);
        outLeaf.rotation.y = 1.45 * outDoorT; outCol.off = outDoorT > 0.3; }
      const inNow = inside(px, pz);
      if (inNow !== wasInside) {
        wasInside = inNow;
        if (Math.abs(pz - maxZ) < 2 && Math.abs(px - bdx) < 2) audio.play?.('door-click', bdx, gy + 1.2, maxZ); else audio.play?.('bell', sx, gy + 2.3, minZ); // the back door clicks, the front door's bell rings
        if (inNow && open && now - lastLine > 20) { lastLine = now; const L = clerkLines(); clerkSay(L[Math.floor(hash01('clerk', Math.floor(now / 30)) * L.length)]); }
      }
      // the roof and the walls stay on: inside you see through your own eyes (first person, below), and the shop's lamps are lit by day
      // too while you're in it (main.js lights the nearest four). The owner turns the shop off at 9, the room's lights go at midnight
      const c = camera.position;
      setLights(open, bOpen, inNow);
      { const g = GLASS[open ? 3 : 4], R = built.glassReal; shopGlass.color.copy(g.color); shopGlass.emissive.copy(g.emissive); shopGlass.emissiveIntensity = g.emissiveIntensity; R.color.copy(g.color); R.emissive.copy(g.emissive); R.emissiveIntensity = g.emissiveIntensity; } // the shop's windows: lit with the town's till 9, then nobody home
      ui.indoors = inNow && inside(c.x, c.z); // the places' labels outside don't show through the walls (ui.js)
      // far off the inside is not drawn (the panes are opaque and the roof is on); near the store it is, for the windows (real-glass.js),
      // the open door and the glass door round the back
      const camIn = inside(c.x, c.z) && c.y < gy + P.H, looks = gv.update(dt, camera, camIn);
      const showNow = inNow || camIn || looks || Math.hypot(px - sx, pz - minZ) < 9 || Math.hypot(px - bdx, pz - maxZ) < 7;
      if (showNow !== showIn) { showIn = showNow; g0.visible = showNow; }
      if (showNow) {
        const full = inNow || camIn || GFX.cls === 'desktop';
        if (full !== inkFull) { inkFull = full; insideInk([g0], full); }
        folkShadows(inNow || camIn);
      }
      if (showNow) { swayT += dt; built.dragon.rotation.z = Math.sin(swayT * 0.7) * 0.06; built.dragon.position.y = gy + 5.0 + Math.sin(swayT * 1.1) * 0.05; }
      // people (Clem goes home at 9)
      const clemHere = showNow && open;
      if (clerk.root.visible !== clemHere) clerk.root.visible = clemHere;
      if (clemHere) clerk.update(dt, now, 0, Math.floor(now / 6) % 4 === 0 ? 'look' : 'idle');
      const t = net.serverNow() / 1000, j = Math.floor(t / 240);
      const cast = lazyCust ? castAt(t) : null;
      customers.forEach((h, i) => {
        const here = open && hash01('cust', i, j) < 0.6;
        if (lazyCust) {
          const on = custSeats[i].step(cast.has('store:' + custName(i)), here, Math.abs(camera.position.x - sx) + Math.abs(camera.position.z - sz));
          if (!on) { if (h) freeCust(i); return; }
          if (!h) { if (!here || !mayBuild(now)) return; h = customers[i] = buildCust(i); }
        }
        h.root.visible = here && showNow;
        if (i === 0) jonahSits = here && pOn && sitting !== jonahSeat;
        if (!here) return;
        const seated = i === 0 && jonahSits;
        if (seated) { h.root.position.set(jonahSeat.x, floorY, jonahSeat.z); h.root.rotation.y = jonahSeat.yaw; } // a playtester at the demo table, in its east chair
        else {
          const bx = boxes[Math.floor(hash01('custbox', i, j) * shelfCount)];
          h.root.position.set(bx.x + (bx.x < sx ? 1.5 : -1.5), floorY, bx.z); h.root.rotation.y = bx.x < sx ? -Math.PI / 2 : Math.PI / 2; // 1.85 m out from the wall: room for you at the shelf
        }
        h.params.seatY = seated ? jonahSeat.seatY : 0; h.params.table = seated ? tableOf(jonahSeat) : null;
        if (showNow) h.update(dt, now, 0, seated ? 'sit' : Math.floor((now + i * 5) / 7) % 3 === 0 ? 'look' : 'idle');
      });
      if (sitting && player.takeover?.store !== true) { sitting = null; player.character.params.seatY = 0; player.character.params.table = null; hideMe(false); fp.on = false; } // something else took the player over
      if (!sitting && hidRoot) hideMe(false);
      iv.update(); // the view button: shown inside, not from a chair in the shop
    },
    target(px, pz) {
      if (!card.hidden) return { hint: 'E  Put it back', prio: 9, run: hide };
      if (sitting && sitting.table === 'demo' && ptBox && playtest) return { hint: `E  Play ${pt.name} at the demo table`, prio: 9, run: () => show(ptBox) }; // move or Space gets you up
      if (sitting) return { hint: 'E  Get up', prio: 9, run: stand };
      if (!isOpen() && !inside(px, pz) && Math.hypot(px - sx, pz - minZ) < 2.4) return { hint: 'E  Try the door', prio: 5, run: () => { ui.toast(`${NAME} is closed. Open 9 am to 9 pm.`, 3200); audio.ui?.('blip'); } };
      // the back door after midnight (from outside), the half-glass door after 9 (from either side)
      if (!isBackOpen() && pz > maxZ && pz < maxZ + 1.8 && Math.abs(px - bdx) < 1.3 && player.pos.y < P.LY - 1) return { hint: 'E  Try the door', prio: 5, run: () => { ui.toast("The back room's closed. Open till midnight.", 3200); audio.ui?.('blip'); } };
      { const BD = P.back.door;
        if (!isOpen() && player.pos.y < P.LY - 1 && Math.abs(px - (BD.x0 + BD.x1) / 2) < 1.3 && Math.abs(pz - BD.z) < 1.5) return { hint: 'E  Try the door', prio: 7, run: () => { ui.toast(pz < BD.z ? "The shop's closed. The back room's open till midnight, round the back." : "The shop's closed. Out by the back door, please.", 3600); audio.ui?.('blip'); } }; }
      if (!inside(px, pz)) return null;
      let best = null, bd = 1.5;
      for (const bx of boxes) { const d = Math.hypot(px - bx.x, pz - bx.z); if (d < bd) { bd = d; best = bx; } }
      if (best) return { hint: `E  Pick up ${best.name}`, prio: 6, run: () => show(best) };
      // a chair, the window seat, a beanbag (only right beside it: the demo table's Play is all round the table)
      const seat = seatNear(px, pz);
      if (seat) return { hint: seat.hint, prio: 6, run: () => sit(seat) };
      // the demo table on a playtest day: its card, with Play (the same ctx.play as the box); the A-frame any day
      if (ptBox && playtest && Math.hypot(px - TX, pz - TZ) < 2.6) return { hint: `E  Play ${pt.name} at the demo table`, prio: 6, run: () => show(ptBox) };
      if (ptBox && Math.hypot(px - AX, pz - AZ) < 1.3) return { hint: playtest ? `E  Play ${pt.name} at the demo table` : 'E  Read the chalkboard', prio: 6, run: () => show(ptBox) };
      if (isOpen() && Math.hypot(px - clerk.root.position.x, pz - clerk.root.position.z) < 2.6) return { hint: 'E  Talk to Clem', prio: 5, run: () => { const L = clerkLines(); clerkSay(L[Math.floor(Math.random() * L.length)]); } };
      return null;
    },
    // a remote player sitting in one of the shop's seats is drawn at its height (their legs fold onto it)
    afterRemotes() {
      const remotes = ctx.remotes;
      if (!remotes?.map || (!showIn && !remoteSat.size)) return;
      for (const r of remotes.map.values()) {
        const last = r.buf?.[r.buf.length - 1];
        const sat = last && ANIM_CODES[last.a] === 'sit' ? seats.find(s => Math.hypot(last.x - s.x, last.z - s.z) < 0.4) : null;
        if (sat) { r.ch.params.seatY = sat.seatY; r.ch.params.table = tableOf(sat); remoteSat.set(r.sid, sat); }
        else if (remoteSat.has(r.sid)) { r.ch.params.seatY = 0; r.ch.params.table = null; remoteSat.delete(r.sid); }
      }
    },
    onKey(code) {
      if (sitting && code === 'Space') { stand(); return true; }
      // seated at the D&D table F switches the view too (a key typed in the card's text box never gets here: input.js)
      if (sitting && code === 'KeyF' && sitting.tq && ctx.playing) { iv.toggle(true); audio.ui?.('blip'); ui.toast(iv.view !== 'fp' ? 'Three-quarter view: drag to peek round your chair.' : 'First person: drag to look around.', 2200); return true; }
      if (!card.hidden && (code === 'Escape' || code === 'KeyE' || code === 'Enter')) { if (code === 'Enter' && shown?.game && !cPlay.hidden) cPlay.click(); else hide(); return true; }
      return iv.onKey(code);
    },
    bodies() { const out = clerk.root.visible ? [{ x: clerk.root.position.x, z: clerk.root.position.z, r: 0.3 }] : []; for (const h of customers) if (h && h.root.visible) out.push({ x: h.root.position.x, z: h.root.position.z, r: 0.3 }); return out; },
    help: [[['E'], 'browse the game store on Summit Rd (9 to 9)'], [['F'], 'in the game store: first person or the room view (at the D&D table, over your shoulder)']],
    get shoppers() { return customers.filter(Boolean).length; }, // built ones: on a phone only while cast (town-cast.js)
  };
}
