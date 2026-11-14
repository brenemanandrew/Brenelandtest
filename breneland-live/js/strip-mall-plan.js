// The strip mall's plan (strip-mall, 2026-11-09; mall-bigger, 2026-11-10: the building at the game store's scale and Peak Threads as a
// boutique): every number strip-mall-build.js builds the building to and strip-mall.js keeps (the walls, the storefronts, the doors,
// the canopy, the walkway and the lot, the pizza place's counter, ovens, booths, tables and seats, the clothing store's racks,
// mannequins, counter, fitting room, mirror, cubbies, hat wall, shoe risers, table, nook, the lights, the colours). Pure (layout.js
// only), so tools/strip-mall-plan-dump.mjs can import it in Node and write assets/blender/strip-mall-plan.json for the Blender set piece
// (assets/blender/scripts/build_strip_mall.py): the model is built to these same numbers, so every collider, surface, seat, anchor
// and spot lines up with what you see. Everything is in the world frame (x east, y up, z south), metres; yaw as everywhere
// (forward = (sin yaw, cos yaw)).
import { STRIP_MALL as L } from './layout.js';

export const GY = 0.34;                                   // the town's flat ground round the lots
export const FY = L.walk.y;                               // the floors, flush with the walkway (no step: you walk straight in)
export const T = 0.3;                                     // the walls
export const TOP = GY + L.h;                              // the parapet's top (mall-bigger: 6 m up, a false front over the canopy)
export const CEIL = GY + 4.2;                             // the ceilings inside (the roof slab is at TOP; the void between is never seen)
export const CANOPY = { y: L.canopy.y, out: L.canopy.out, drop: 0.3, fascia: 0.32 }; // the canopy's underside at the wall, how far it reaches, how much it drops to its edge, the fascia board's height
export const GLASS0 = FY + 0.55, GLASS1 = L.canopy.y - 0.08; // the storefront glass: over a stone bulkhead, up to under the canopy; a transom bar at TRANSOM
export const TRANSOM = FY + 2.42;
export const DOOR_H = 2.4;
export const BAND = { y0: L.canopy.y + 0.26, y1: L.canopy.y + 1.95 }; // the dark fascia band over the canopy that carries the signs; the false front rises in the wall's boards above it to the parapet
export const SIGN = { y: (BAND.y0 + BAND.y1) / 2, h: 1.0 };   // the lit signs on the band (their middles)
export const CLERESTORY = { y0: TOP - 1.35, y1: TOP - 0.55, w: 1.1 }; // the false front's small dark windows (three a store), a frame each
export const PARTY = { x0: L.units.pizza.maxX, x1: L.units.clothes.minX }; // the wall between the two stores
export const WALK = { minZ: L.walk.minZ, maxZ: L.minZ, y: L.walk.y };
export const LOT = { minX: L.minX, maxX: L.maxX, minZ: L.lot.minZ, maxZ: L.lot.maxZ, y: 0.375, bays: L.lot.bays, bayW: 2.7, bayD: 4.8 };
export const POSTS = [L.minX + 0.5, L.units.pizza.door.x - 3.0, L.units.pizza.door.x + 3.0, (PARTY.x0 + PARTY.x1) / 2, L.units.clothes.door.x - 3.0, L.units.clothes.door.x + 3.0, L.maxX - 0.5]; // the canopy's timber posts (x), at the walkway's kerb
export const POST_Z = WALK.minZ + 0.32;
// the cars parked head-in (static: their bays, kinds and colours never change; strip-mall-build.js draws them, with colliders)
export const CARS = [{ bay: 1, kind: 'hatch', color: '#4f7fd9' }, { bay: 4, kind: 'pickup', color: '#5cb85c' }, { bay: 7, kind: 'beetle', color: '#f0c24f' }];

// the colours (the game's palette: warm cedar and stone against the game store's brick and cream)
export const C = {
  stone: '#9a9389', stone2: '#847d73', cap: '#cfc8bb', board: '#b7845a', boardDk: '#8f6442', batten: '#6e4a30', trim: '#f1e8d4', trim2: '#e1d7c0',
  pizzaWall: '#b8503f', clothesWall: '#5f8a6b', fascia: '#3a3028', tin: '#6b7078', tin2: '#596069', timber: '#7a5a3c', timberDk: '#5a4028', iron: '#2b2f33',
  walk: '#cfc8ba', kerb: '#bdb5a6', tar: '#5d6168', line: '#f4f2ea', roof: '#5b6168', roofLip: '#d9d2c4', hvac: '#9aa3ad',
  floorPz: '#d8cfbd', floorPz2: '#8a2f2a', floorCl: '#a8814f', plank: '#7a5a3c', ceil: '#efe6d2', ceilCl: '#e8e4dc', wallIn: '#f3e3c2', wallInCl: '#e8eef0', wain: '#7a4b2a',
  counter: '#6b4a2b', counterTop: '#3a3f47', steel: '#a9b0b8', oven: '#3a3f47', ovenDoor: '#2b2f33', brick: '#a85a3a', menu: '#2b2340', cloth: '#b8372e', cloth2: '#f4f2ea',
  table: '#a8804f', chair: '#5a3c26', booth: '#8a2f2a', fridge: '#d8dde2', fridgeDk: '#3a3f47', boxes: '#e8d2a8',
  rack: '#3a3f47', brass: '#c9a24a', mann: '#f4f2ea', plinth: '#2f3b4c', rug: '#3f6fa8', rug2: '#e3aa45', curtain: '#7a2140', mirror: '#aebfc8', shelf: '#8a6240',
  glassDk: '#223040', cream: '#fbfaf5', ink: '#2b2340', white: '#fbf7ee',
  // mall-bigger: Peak Threads' boutique
  accent: '#2f6b5f', leaf: '#4f9a45', pot: '#c9653e', sofa: '#5f7a8a', fire: '#ff9a3a', coal: '#2b2326', canoe: '#c9463a', shoe: '#4a3326', shoe2: '#9a7a5a', paper: '#e8dcc0', crate: '#b98a5a',
  g0: '#e0564a', g1: '#3f8fd9', g2: '#f0c24f', g3: '#7fb36a', g4: '#b48cff', g5: '#ff8fb8', g6: '#2b3a4e', g7: '#f3e3c3', g8: '#3fae5a', g9: '#c27a3a',
};
export const GARMENTS = ['g0', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9']; // the clothes' colour keys (a rack mixes them)

// a storefront's openings (the front wall, z = L.minZ): the west window, the door (with its transom), the east window; its sign, its
// canopy downlights and the false front's three small windows
function front(u) {
  const d = u.door, dw = d.w / 2, mid = (u.minX + u.maxX) / 2;
  return {
    west: { a0: u.minX + 0.6, a1: d.x - dw - 0.5, y0: GLASS0, y1: GLASS1 },
    east: { a0: d.x + dw + 0.5, a1: u.maxX - 0.6, y0: GLASS0, y1: GLASS1 },
    door: { a0: d.x - dw, a1: d.x + dw, y0: FY, y1: FY + DOOR_H },
    transom: { a0: d.x - dw, a1: d.x + dw, y0: FY + DOOR_H + 0.08, y1: GLASS1 },
    bulkhead: { y0: FY, y1: GLASS0 },
    sign: { x: d.x, y: SIGN.y, w: Math.min(7.4, (u.maxX - u.minX) * 0.6), h: SIGN.h },
    lamps: [d.x - 3.0, d.x, d.x + 3.0].map(x => ({ x, z: L.minZ - 1.3 })), // the canopy's downlights (their glass under the canopy)
    clerestory: [-3.6, 0, 3.6].map(dx => ({ a0: mid + dx - CLERESTORY.w / 2, a1: mid + dx + CLERESTORY.w / 2, y0: CLERESTORY.y0, y1: CLERESTORY.y1 })),
  };
}

// ---- Summit Slice: the counter across the back third with the kitchen behind it (two deck ovens on the back wall, a wood-fired dome
// oven on show behind the half wall, the prep table), a menu board over the counter, a row of four booths along the west wall, six round
// tables, a drinks fridge by the east wall
export const PIZZA = (() => {
  const u = L.units.pizza, x0 = u.minX + T, x1 = u.maxX - T, z0 = L.minZ + T, z1 = L.maxZ - T; // inside faces
  const counter = { minX: x0 + 0.8, maxX: x0 + 7.0, minZ: L.minZ + 9.4, maxZ: L.minZ + 10.2, top: FY + 0.95, gate: { x0: x0 + 7.0, x1: x0 + 8.2 } }; // the gap east of it is the way into the kitchen
  const backCounter = { minX: x0 + 0.2, maxX: x0 + 6.4, minZ: z1 - 0.7, maxZ: z1, top: FY + 0.9 };
  const ovens = [{ minX: x1 - 4.4, maxX: x1 - 2.6, minZ: z1 - 1.05, maxZ: z1, h: 1.75 }, { minX: x1 - 2.3, maxX: x1 - 0.5, minZ: z1 - 1.05, maxZ: z1, h: 1.75 }]; // two deck ovens on the back wall
  const dome = { x: x1 - 2.4, z: L.minZ + 11.6, r: 1.05, h: 1.85, mouth: { y: FY + 0.95, w: 0.7, h: 0.45 } };  // the wood-fired oven on show, its mouth to the dining room (its fire's glow is the code's)
  const prep = { minX: x0 + 2.4, maxX: x0 + 5.4, minZ: L.minZ + 12.0, maxZ: L.minZ + 12.8, top: FY + 0.9 };
  const menu = { x: (counter.minX + counter.maxX) / 2, y: FY + 2.7, z: counter.maxZ + 0.1, w: 4.2, h: 0.9 }; // hung from the ceiling over the counter's back edge, its face to the door
  // the booth row: four booths along the west wall, a table between two high-backed benches that face each other (north and south of it)
  const booths = [0, 1, 2, 3].map(k => { const z = L.minZ + 2.4 + k * 1.95; return { x0: x0 + 0.05, x1: x0 + 1.85, z, table: { x: x0 + 1.05, z, w: 1.4, d: 0.7, top: FY + 0.74 }, benches: [z - 0.7, z + 0.7], seat: FY + 0.44, back: FY + 1.2 }; });
  const tables = [[x0 + 4.3, L.minZ + 2.2], [x0 + 4.3, L.minZ + 4.6], [x0 + 4.3, L.minZ + 7.0], [x0 + 8.9, L.minZ + 2.2], [x0 + 8.9, L.minZ + 4.6], [x0 + 8.9, L.minZ + 7.0]].map(([x, z]) => ({ x, z, r: 0.4, top: FY + 0.74 }));
  const fridge = { minX: x1 - 0.75, maxX: x1 - 0.05, minZ: L.minZ + 5.0, maxZ: L.minZ + 6.1, h: 2.0 }; // glass-fronted drinks fridge (its glow is the code's)
  const partition = { minX: counter.gate.x1, maxX: x1, minZ: counter.minZ, maxZ: counter.minZ + 0.12, h: FY + 1.1 }; // a half wall east of the gate: the kitchen behind it, the dome oven in view
  // (slice-seats, Andrew's v265 "seating in the pizza place is bad") a seat's spot is where a middling body's hips go: its back against the
  // chair's or the bench's back, the knees just past the seat's front edge; `chair` / `bench` is the furniture's own middle (the model
  // and the code-built chairs stand there), `front` / `back` the seat's front edge and its back's face from the spot (seats.js seatFit fits
  // each player to them), `table` the top the hands rest on (bodies-poses tableRest). The chair's slab is 4 cm thick with its middle at
  // FY + 0.44 (sm_inside.py): its top is FY + 0.46. The booth's cushion's top is the booth's `seat`, its front 0.27 and its back's face
  // 0.18 from the bench's middle; a sitter keeps 2 cm off it (`back` 0.16: nearer, the hands' reach for the top
  // leans a broad chest into the table's edge).
  const CHAIR_TOP = FY + 0.46, CHAIR = { front: 0.21, back: 0.1725 }, BENCH = { front: 0.27, back: 0.16 }, SIT_IN = { chair: 0.045, booth: 0.09 };
  const seats = [];
  for (const b of booths) for (const [k, bz] of b.benches.entries()) { // (the north bench (k 0) looks south, at the table)
    const dir = k ? -1 : 1, o = SIT_IN.booth, t = b.table;
    seats.push({ x: t.x, z: bz + dir * o, y: b.seat, yaw: k ? Math.PI : 0, kind: 'booth', bench: { x: t.x, z: bz }, front: BENCH.front - o, back: BENCH.back + o, table: { x: t.x, z: t.z, hw: t.w / 2, hd: t.d / 2, yaw: 0, y: t.top } });
  }
  for (const t of tables) for (const k of [-1, 1]) { // north and south of each table, facing it
    const cz = t.z + k * 0.72, o = SIT_IN.chair;
    seats.push({ x: t.x, z: cz - k * o, y: CHAIR_TOP, yaw: k > 0 ? Math.PI : 0, kind: 'chair', chair: { x: t.x, z: cz }, front: CHAIR.front - o, back: CHAIR.back + o, table: { x: t.x, z: t.z, r: t.r + 0.03, y: t.top } });
  }
  const lamps = [...tables.map(t => [t.x, t.z]), [x0 + 1.05, L.minZ + 3.4], [x0 + 1.05, L.minZ + 7.3], [counter.minX + 1.4, counter.minZ - 0.3], [counter.maxX - 1.4, counter.minZ - 0.3]].map(([x, z]) => ({ x, z, y: FY + 2.35, kind: 'pendant' })); // pendants over the tables, the booths and the counter
  const kitchenLight = { x: (x0 + x1) / 2 - 1.0, z: L.minZ + 12.6, y: CEIL - 0.08, w: 1.4, d: 0.4 };
  const west = { a0: L.minZ + 1.6, a1: L.minZ + 8.8, y0: FY + 1.35, y1: FY + 2.5 }; // the booths' window in the west wall (its sill over the benches' backs)
  return { unit: u, x0, x1, z0, z1, front: front(u), counter, backCounter, ovens, dome, prep, menu, booths, tables, fridge, partition, seats, lamps, kitchenLight, west, boxes: { x: counter.maxX - 0.4, z: counter.minZ + 0.4, n: 5 } };
})();

// ---- Peak Threads (mall-bigger: a mountain-town outfitter the Able Sisters would keep): the window scenes (a red canoe on its stands
// with two forms, a campfire with a lantern and a form by it), straight racks either side of a clear aisle, two round racks, a central
// table of folded stacks and boots on a rug, the feature wall of cubbies, the cash wrap with its till and bags before the hat wall, the
// shoe risers along the east wall, the fitting room in the back east corner with its curtain and big mirror, a seating nook with a
// floor lamp, plants, pendants and track spots
export const CLOTHES = (() => {
  const u = L.units.clothes, x0 = u.minX + T, x1 = u.maxX - T, z0 = L.minZ + T, z1 = L.maxZ - T;
  const counter = { minX: x0 + 6.4, maxX: x0 + 9.6, minZ: L.minZ + 12.8, maxZ: L.minZ + 13.6, top: FY + 0.95, clerk: { x: x0 + 8.0, z: L.minZ + 14.2, yaw: Math.PI }, till: { x: x0 + 6.9 }, bags: { x: x0 + 7.6 } };
  const cubbies = { minX: x0 + 0.3, maxX: x0 + 5.6, minZ: z1 - 0.45, maxZ: z1, h: FY + 2.3, cols: 5, rows: 4 };  // the feature wall: folded stacks in cubbies
  const hatWall = { minX: x0 + 6.2, maxX: x0 + 9.8, z: z1, y0: FY + 1.25, y1: FY + 2.45, cols: 4, rows: 3 };    // pegs behind the counter
  const fitting = { minX: x0 + 10.5, maxX: x1, minZ: L.minZ + 12.3, maxZ: z1, h: FY + 2.3, open: 'west' }; // the booth: walls on three sides, a curtain on the west
  const mirror = { x: fitting.minX + 1.1, y: FY + 1.2, z: fitting.minZ - 0.04, yaw: Math.PI, w: 0.9, h: 2.0 }; // full length and wide, on the booth's north face (the side toward the door), its face to the shop
  const racks = [
    { x: x0 + 2.0, z: L.minZ + 3.6, yaw: 0, kind: 'straight', w: 1.7, d: 0.55, h: FY + 1.55 },
    { x: x0 + 2.0, z: L.minZ + 6.6, yaw: 0, kind: 'straight', w: 1.7, d: 0.55, h: FY + 1.55 },
    { x: x0 + 10.0, z: L.minZ + 3.6, yaw: 0, kind: 'straight', w: 1.7, d: 0.55, h: FY + 1.55 },
    { x: x0 + 10.0, z: L.minZ + 6.6, yaw: 0, kind: 'straight', w: 1.7, d: 0.55, h: FY + 1.55 },
    { x: x0 + 3.6, z: L.minZ + 9.6, yaw: 0, kind: 'round', w: 1.2, d: 1.2, h: FY + 1.5 },
    { x: x0 + 8.6, z: L.minZ + 9.6, yaw: 0, kind: 'round', w: 1.2, d: 1.2, h: FY + 1.5 },
  ];
  const table = { x: x0 + 5.8, z: L.minZ + 5.8, w: 2.4, d: 1.3, top: FY + 0.82 };                                // the central display table, in the aisle: you walk round it
  const rug = { minX: table.x - 2.3, maxX: table.x + 2.3, minZ: table.z - 1.6, maxZ: table.z + 1.6 };
  const mannequins = [
    { x: x0 + 1.2, z: L.minZ + 1.3, yaw: Math.PI + 0.3, plinth: 0.2 }, { x: x0 + 2.9, z: L.minZ + 1.1, yaw: Math.PI - 0.25, plinth: 0.2 }, // the west window, before the canoe
    { x: x0 + 10.9, z: L.minZ + 1.2, yaw: Math.PI + 0.15, plinth: 0.2 },                                                                  // the east window, by the campfire
    { x: x0 + 9.3, z: L.minZ + 11.2, yaw: Math.PI / 2 + 0.3, plinth: 0.2 },                                                               // by the fitting room, turned to the mirror
  ];
  // the dress forms (threads-placement): the game's own body over the plinth (assets/blender/body-ref.json dims: the clothes were built on
  // it, so they fit the form as they fit a player): the chest frame (the body's waist) 1.19 m over the plinth top, the shoulders 0.47 over
  // that, the head's centre 0.1225 + 0.2479 higher, the head a 0.368 x 0.335 x 0.335 ellipsoid; the torso 0.24 half-wide, 0.1975 half-deep
  const form = { chest: 1.19, shoulder: 1.19 + 0.47, head: 1.19 + 0.47 + 0.1225 + 0.2479, headR: [0.368, 0.335, 0.335], wT: 0.24, dT: 0.1975, neckR: 0.1 };
  const canoe = { x: x0 + 2.4, z: L.minZ + 2.25, len: 3.6, w: 0.8, h: 0.4, y: FY + 0.5, yaw: 0.06 };       // a red canoe on two sawhorses across the west window's back
  const campfire = { x: x0 + 9.7, z: L.minZ + 2.2, r: 0.42 };                                                  // a ring of stones, logs and a lantern on a crate (the glow is the code's)
  const crate = { x: x0 + 11.6, z: L.minZ + 2.5, s: 0.5 };
  const risers = { minX: x1 - 0.72, maxX: x1 - 0.06, minZ: L.minZ + 4.6, maxZ: L.minZ + 9.0, steps: [0.35, 0.65, 0.95], pairs: 8 };     // shoe risers along the east wall, three steps
  const nook = { minX: x0 + 0.2, maxX: x0 + 2.4, minZ: L.minZ + 10.3, maxZ: L.minZ + 13.7, sofa: { x: x0 + 0.85, z: L.minZ + 12.0, w: 1.6, d: 0.8, yaw: Math.PI / 2 }, lamp: { x: x0 + 0.6, z: L.minZ + 10.7, h: FY + 1.7 }, side: { x: x0 + 0.7, z: L.minZ + 13.3 } }; // the seating nook on the west wall: a loveseat facing the shop, a floor lamp, a side table
  const plants = [{ x: x1 - 0.6, z: L.minZ + 1.0, s: 1.0 }, { x: x0 + 0.6, z: L.minZ + 13.4, s: 0.8 }, { x: x0 + 10.1, z: L.minZ + 12.4, s: 0.9 }];
  const pendants = [[table.x - 0.8, table.z], [table.x + 0.8, table.z], [counter.minX + 1.6, counter.minZ - 0.3]].map(([x, z]) => ({ x, z, y: FY + 2.4, kind: 'pendant' }));
  const tracks = [ // rails along x with spots: over the straight racks' aisle ends, the round racks, the windows
    { z: L.minZ + 3.3, x0: x0 + 1.0, x1: x0 + 11.2, spots: [x0 + 2.0, x0 + 5.8, x0 + 10.0] },
    { z: L.minZ + 8.6, x0: x0 + 2.4, x1: x0 + 10.0, spots: [x0 + 3.6, x0 + 6.4, x0 + 8.6] },
    { z: L.minZ + 1.5, x0: x0 + 0.6, x1: x0 + 4.4, spots: [x0 + 1.3, x0 + 3.1] },
    { z: L.minZ + 1.5, x0: x0 + 9.6, x1: x0 + 12.0, spots: [x0 + 10.9] },
  ];
  const spots = tracks.flatMap(t => t.spots.map(x => ({ x, z: t.z, y: CEIL - 0.12, kind: 'spot' })));
  const east = { a0: L.minZ + 1.6, a1: L.minZ + 3.8, y0: FY + 0.95, y1: FY + 2.3 }; // a window in the east wall by the campfire scene
  const sign = { x: cubbies.minX + (cubbies.maxX - cubbies.minX) / 2, y: FY + 3.1, z: z1 - 0.03, w: 3.6, h: 0.6 }; // the name over the feature wall (a canvas face: the code's)
  return { unit: u, x0, x1, z0, z1, front: front(u), counter, cubbies, hatWall, fitting, mirror, racks, table, rug, mannequins, form, canoe, campfire, crate, risers, nook, plants, pendants, tracks, spots, east, sign };
})();

// the anchors the shop logic hangs on (clothing-store.js: rack0-5, counter, mirror, mannequin0-3, door-clothes). Each: pos (world, at
// the floor or the hanging height), yaw, size. The Blender build writes the same list into the model's `anchors`.
export function anchors() {
  const A = {};
  CLOTHES.racks.forEach((r, i) => { A['rack' + i] = { pos: [r.x, FY, r.z], yaw: r.yaw, kind: r.kind, w: r.w, d: r.d, h: r.h - FY }; });
  CLOTHES.mannequins.forEach((m, i) => { A['mannequin' + i] = { pos: [m.x, FY + m.plinth, m.z], yaw: m.yaw, plinth: m.plinth, chest: CLOTHES.form.chest, head: CLOTHES.form.head }; }); // (chest, head: the form's frames over pos, clothing-store.js dresses it by them)
  A.counter = { pos: [(CLOTHES.counter.minX + CLOTHES.counter.maxX) / 2, CLOTHES.counter.top, (CLOTHES.counter.minZ + CLOTHES.counter.maxZ) / 2], w: CLOTHES.counter.maxX - CLOTHES.counter.minX, d: CLOTHES.counter.maxZ - CLOTHES.counter.minZ, clerk: CLOTHES.counter.clerk };
  A.mirror = { pos: [CLOTHES.mirror.x, CLOTHES.mirror.y, CLOTHES.mirror.z], yaw: CLOTHES.mirror.yaw, w: CLOTHES.mirror.w, h: CLOTHES.mirror.h };
  A.fitting = { pos: [(CLOTHES.fitting.minX + CLOTHES.fitting.maxX) / 2, FY, (CLOTHES.fitting.minZ + CLOTHES.fitting.maxZ) / 2], box: { minX: CLOTHES.fitting.minX, maxX: CLOTHES.fitting.maxX, minZ: CLOTHES.fitting.minZ, maxZ: CLOTHES.fitting.maxZ }, open: CLOTHES.fitting.open };
  A.table = { pos: [CLOTHES.table.x, CLOTHES.table.top, CLOTHES.table.z], w: CLOTHES.table.w, d: CLOTHES.table.d };
  A.cubbies = { pos: [(CLOTHES.cubbies.minX + CLOTHES.cubbies.maxX) / 2, FY, CLOTHES.cubbies.maxZ], w: CLOTHES.cubbies.maxX - CLOTHES.cubbies.minX, h: CLOTHES.cubbies.h - FY, cols: CLOTHES.cubbies.cols, rows: CLOTHES.cubbies.rows };
  A['pizza-counter'] = { pos: [(PIZZA.counter.minX + PIZZA.counter.maxX) / 2, PIZZA.counter.top, (PIZZA.counter.minZ + PIZZA.counter.maxZ) / 2], w: PIZZA.counter.maxX - PIZZA.counter.minX, d: PIZZA.counter.maxZ - PIZZA.counter.minZ };
  A.menu = { pos: [PIZZA.menu.x, PIZZA.menu.y, PIZZA.menu.z], w: PIZZA.menu.w, h: PIZZA.menu.h, yaw: Math.PI };
  for (const k of ['pizza', 'clothes']) { const u = L.units[k]; A['door-' + k] = { pos: [u.door.x, FY, L.minZ], w: u.door.w, h: DOOR_H }; A['sign-' + k] = { pos: [u.door.x, SIGN.y, L.minZ - 0.02], w: (k === 'pizza' ? PIZZA : CLOTHES).front.sign.w, h: SIGN.h }; }
  return A;
}

// where Pete's walks start and end (mailman.js): the pizza door's threshold, and his scooter's spot
export const PETE = { door: { x: L.units.pizza.door.x, z: L.minZ - 0.5 }, scooter: L.scooter, lotOut: { x: L.scooter.x + 2.6, z: LOT.minZ - 0.6 } };

// the colliders both the model and the code-built mall share (strip-mall-build.js pushes them): the walls with the door gaps, the
// canopy posts, every fixture you could walk into; the parked cars are added with the cars
export function colliderList() {
  const out = [], box = (minX, maxX, minZ, maxZ, extra) => out.push({ type: 'box', minX, maxX, minZ, maxZ, ...extra }), circ = (x, z, r) => out.push({ type: 'circle', x, z, r });
  for (const U of [PIZZA, CLOTHES]) {
    const u = U.unit, d = U.front.door;
    box(u.minX, d.a0, L.minZ, L.minZ + T); box(d.a1, u.maxX, L.minZ, L.minZ + T);     // the front wall either side of the door
    box(u.minX, u.maxX, L.maxZ - T, L.maxZ);                                           // the back wall
  }
  box(L.minX, L.minX + T, L.minZ, L.maxZ); box(L.maxX - T, L.maxX, L.minZ, L.maxZ);   // the end walls
  box(PARTY.x0, PARTY.x1, L.minZ, L.maxZ);                                             // the party wall
  for (const x of POSTS) circ(x, POST_Z, 0.17);
  const P = PIZZA;
  box(P.counter.minX, P.counter.maxX, P.counter.minZ, P.counter.maxZ); box(P.backCounter.minX, P.backCounter.maxX, P.backCounter.minZ, P.backCounter.maxZ);
  for (const o of P.ovens) box(o.minX, o.maxX, o.minZ, o.maxZ);
  circ(P.dome.x, P.dome.z, P.dome.r + 0.05);
  box(P.prep.minX, P.prep.maxX, P.prep.minZ, P.prep.maxZ); box(P.fridge.minX, P.fridge.maxX, P.fridge.minZ, P.fridge.maxZ); box(P.partition.minX, P.partition.maxX, P.partition.minZ, P.partition.maxZ);
  for (const b of P.booths) { box(b.x0, b.x1, b.benches[0] - 0.3, b.benches[0] + 0.25); box(b.x0, b.x1, b.benches[1] - 0.25, b.benches[1] + 0.3); box(b.table.x - b.table.w / 2, b.table.x + b.table.w / 2, b.table.z - b.table.d / 2, b.table.z + b.table.d / 2); }
  for (const t of P.tables) circ(t.x, t.z, t.r + 0.05);
  const Q = CLOTHES;
  box(Q.counter.minX, Q.counter.maxX, Q.counter.minZ, Q.counter.maxZ);
  box(Q.cubbies.minX, Q.cubbies.maxX, Q.cubbies.minZ, Q.cubbies.maxZ);
  box(Q.fitting.minX, Q.fitting.maxX, Q.fitting.minZ, Q.fitting.minZ + 0.08); box(Q.fitting.minX, Q.fitting.maxX, Q.fitting.maxZ - 0.08, Q.fitting.maxZ); box(Q.fitting.maxX - 0.08, Q.fitting.maxX, Q.fitting.minZ, Q.fitting.maxZ); // (its west side is the curtain: walk in)
  for (const r of Q.racks) { if (r.kind === 'round') circ(r.x, r.z, r.w / 2 + 0.05); else box(r.x - r.w / 2 - 0.05, r.x + r.w / 2 + 0.05, r.z - r.d / 2 - 0.05, r.z + r.d / 2 + 0.05); }
  box(Q.table.x - Q.table.w / 2, Q.table.x + Q.table.w / 2, Q.table.z - Q.table.d / 2, Q.table.z + Q.table.d / 2);
  for (const m of Q.mannequins) circ(m.x, m.z, 0.32);
  box(Q.canoe.x - Q.canoe.len / 2, Q.canoe.x + Q.canoe.len / 2, Q.canoe.z - Q.canoe.w / 2, Q.canoe.z + Q.canoe.w / 2);
  circ(Q.campfire.x, Q.campfire.z, Q.campfire.r + 0.1); box(Q.crate.x - Q.crate.s / 2, Q.crate.x + Q.crate.s / 2, Q.crate.z - Q.crate.s / 2, Q.crate.z + Q.crate.s / 2);
  box(Q.risers.minX - 0.05, Q.risers.maxX, Q.risers.minZ, Q.risers.maxZ);
  { const s = Q.nook.sofa; box(s.x - s.d / 2, s.x + s.d / 2, s.z - s.w / 2, s.z + s.w / 2); circ(Q.nook.lamp.x, Q.nook.lamp.z, 0.22); circ(Q.nook.side.x, Q.nook.side.z, 0.3); }
  for (const p of Q.plants) circ(p.x, p.z, 0.3 * p.s);
  box(L.bench.x - 1.0, L.bench.x + 1.0, L.bench.z - 0.3, L.bench.z + 0.3);
  return out;
}

export function planData() {
  return {
    note: 'strip-mall-plan.js: the strip mall in the world frame (x east, y up, z south), metres. Written by tools/strip-mall-plan-dump.mjs.',
    L, GY, FY, T, TOP, CEIL, CANOPY, GLASS0, GLASS1, TRANSOM, DOOR_H, BAND, SIGN, CLERESTORY, PARTY, WALK, LOT, POSTS, POST_Z, CARS, C, GARMENTS, PIZZA, CLOTHES, PETE, anchors: anchors(),
  };
}
