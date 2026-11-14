// The Breneland map, laid out from Andrew's sketches: Projects\Breneland\roughdraft.jpg (the first yard) and
// Extras\Test\20260930_101414.jpg (the whole town; turn the photo 90 degrees counter-clockwise so the "Mountains" edge is at
// the top, that edge is north).
// World axes: +x = east (Lake Tamakiya), +z = south (Lake Rufallia, behind the house), -z = north (the town and the mountains).
// 1 unit = 1 metre. The house is at the origin and every visit starts inside it.
//
// This file is the map contract: every feature reads its positions from here, so moving a thing is a one-line edit.
//
//   Breneland (the fenced yard): the house, the porch, the game lawns, the pier and the fish shack. The dogs live in YARD and
//     never leave it (they can't open gates). Two gates: north (by the mailbox, to Breneland Rd) and west (to Strickler Park).
//   Strickler Park (west of the yard): the old swing tree, bocce, Park Knoll, and past them the woods, thicker and thicker to the
//     west, with the scout campfire and the tent. Past the tree line: mountains.
//   The town (north): Breneland Rd along our fence curving north-west, Summit Rd along the top, Maple Ave and Lakeview Dr between
//     them. Neighborhood 1 (Maple Row) between the two roads, Neighborhood 2 (Summit Hill) north of Summit Rd, the shops (with the
//     game store) at the west end and the water tower across Summit Rd from them. The carnival is visible to the north-west beyond
//     the mountains but can't be reached.

// ------------------------------------------------------------------ water
// Two lakes, closed polygons. terrain.js coastSigned() is the signed distance to the nearest lake shore (positive over water).
export const LAKES = [
  {
    // One body of water: Lake Tamakiya (the arm to the north-east, along our east shore) opens straight into Lake
    // Rufallia (the big lake south of the house). No sandbar between them; the names are the REGIONS labels.
    id: 'tamakiya', name: 'Lake Tamakiya',
    poly: [
      [58.5, -5], [55, -12], [52.5, -21], [52.5, -28.5], [55.5, -37], [58, -46], [60, -70], [61, -110], [64, -140],
      [72, -170], [92, -196], [125, -210], [165, -204], [198, -178], [214, -130], [216, -80], [206, -40], [196, 0],
      [196, 40], [188, 90], [160, 135], [110, 168], [40, 182], [-30, 184],
      [-90, 172], [-132, 150], [-150, 118], [-146, 86], [-128, 60], [-104, 47], [-78, 43], [-54, 41.5], [-34, 39],
      [-19, 33], [-13, 23], [-11.2, 15], [-10, 10], [-4, 8.4], [12, 8.4], [28, 8], [44, 7.4], [55, 5.5], [59, 2.5],
    ],
  },
];
// Older modules walk the shore as one polyline (the reeds, the surf bed): our east shore and the lagoon behind the house.
export const COAST = [
  [61, -140], [60, -70], [58, -46], [55.5, -37], [52.5, -28.5], [52.5, -21], [55, -12], [58.5, -5], [59, 2.5],
  [55, 5.5], [44, 7.4], [28, 8], [12, 8.4], [-4, 8.4], [-10, 10], [-11.2, 15], [-13, 23], [-19, 33], [-34, 39],
  [-54, 41.5], [-78, 43], [-104, 47], [-128, 60], [-146, 86],
];
export function lakeAt(x, z) {
  for (const l of LAKES) if (pointInPolyL(x, z, l.poly)) return l;
  return null;
}

// The swimming beach behind the house (Oyster Cove): world.js keeps it clear of trees. You may swim in any water (swim.js), so
// this doesn't limit where.
export const SWIM_ZONE = [[-6, 5.5], [27, 5.5], [31, 33], [6, 44], [-11, 37], [-11.6, 15]]; // starts up on the beach so you can wade in
export const BEACH_TOWEL = { x: 17.2, z: 6.2, yaw: 0.3 }; // the striped towel on the dry sand behind the house, its bucket beside it (swim.js)
export const OYSTER_BEDS = [[2, 21], [12, 27], [21, 18], [-5, 29], [17, 35], [6, 38], [24, 26]];

// ------------------------------------------------------------------ the map edge
// Where anyone may walk at all (the water and the colliders do the rest). Past it: the tree wall and the mountains.
// The woods reach WOODS_WEST to the west and, west of Lake Rufallia, WOODS_SOUTH down the lake's west shore. The town's west edge
// by the shops stays at x -192 (the notch at the woods' north-west corner). The edge runs a metre or two out into the water where
// it meets the lake. MAP is the box round WALK.
export const WOODS_WEST = -240, WOODS_SOUTH = 100;
export const WALK = [[-192, -172], [66, -172], [66, 60], [-126, 60], [-144, 88], [-146, WOODS_SOUTH], [WOODS_WEST, WOODS_SOUTH], [WOODS_WEST, -96], [-192, -96]];
export const MAP = { minX: WOODS_WEST, maxX: 66, minZ: -172, maxZ: WOODS_SOUTH };
// The tree wall stands just outside these edges of WALK (world-trees.js): [ax, az, bx, bz, outward x, outward z]. The woods'
// west, south-west and north-west edges, the town's west edge by the shops, and the foot of the north range.
export const WOODS_WALL = [
  [-192, -174, -192, -96, -1, 0], [-192, -96, WOODS_WEST, -96, 0, -1], [WOODS_WEST, -96, WOODS_WEST, WOODS_SOUTH, -1, 0],
  [WOODS_WEST, WOODS_SOUTH, -146, WOODS_SOUTH, 0, 1], [-192, -172, 66, -172, 0, -1],
];
// The ground climbs into the foothills past the woods' edge: x -240 along the woods, x -192 by the town (terrain.js), easing
// between z -97 and -112 round the corner by the shops.
export function westEdgeAt(z) { const t = Math.min(1, Math.max(0, (-97 - z) / 15)); return WOODS_WEST + (-192 - WOODS_WEST) * t * t * (3 - 2 * t); }

// ------------------------------------------------------------------ Breneland (our yard)
// The house: Andrew's 1990s single-storey ranch (mockups docs/refs/w3c-house-reference.html and w3c-living-room-reference.html),
// turned 180 degrees into our axes so the picture holds from the front lawn: the garage on the viewer's right (west, -x), the
// front door north. HOUSE = the main body (brick front, green lap siding round the sides and back, a side-gable roof at about
// 10/12). Its whole inside is one floor at floorY (`hall` = the floor's box, every room; the name is kept for older readers).
// GARAGE = the attached two-car garage on the west, DECK = the deck off the living room's back door, out toward the beach,
// CHIMNEY on the back wall behind the fireplace.
export const HOUSE = {
  minX: -9.4, maxX: 8.6, minZ: -4, maxZ: 5.6,
  floorY: 0.9, ceilY: 3.6, eaveY: 3.8, pitch: 0.85,
  door: { x: 0, z: -4, width: 1.0, height: 2.15 },
  hall: { minX: -9.2, maxX: 8.4, minZ: -3.8, maxZ: 5.4 },
};
export const GARAGE = { minX: -16.2, maxX: -9.4, minZ: -5.6, maxZ: 2.2, floorY: 0.5, door: { minX: -15.3, maxX: -10.3, height: 2.2 } };
export const DECK = { minX: -6.8, maxX: 1.6, minZ: 5.6, maxZ: 8.6, y: 0.86 };
export const CHIMNEY = { x: -0.9, w: 1.7, d: 0.75, top: 8.75 };
export const HVAC = { x: -10.45, z: 4.3 }; // the air conditioner's pad, on the right (west) side behind the garage (the mockup's spot)
// a point in the house or the garage (pad metres round each): the dogs' and the trails' keep-out (the porch and deck are not in it)
export function inHouseBox(x, z, pad = 0) {
  return (x > HOUSE.minX - pad && x < HOUSE.maxX + pad && z > HOUSE.minZ - pad && z < HOUSE.maxZ + pad)
    || (x > GARAGE.minX - pad && x < GARAGE.maxX + pad && z > GARAGE.minZ - pad && z < GARAGE.maxZ + pad);
}
// The house's plan: read by the house's own feature (main-house.js) and the login intro. All world metres, yaw:
// forward = (sin yaw, cos yaw). rooms: the inside boxes you can walk in (first match wins: the laundry before the kitchen, the
// main bath before the main bedroom), y = the floor. door: the front door and the spots just inside and outside it. bed: the
// main bedroom's bed (E there logs off), `wake` where you stand up beside it. path: a walk from the wake spot to the front
// door's inside spot (through the bedroom door, the hall and the living room). garageDoor: the big door's opening (z = its
// face); houseDoor: the door from the garage into the laundry (two steps up); slider: the living room's door out onto the deck.
export const HOUSE_PLAN = {
  floorY: 0.9, ceilY: 3.6,
  rooms: [
    { id: 'living', name: 'Living room', minX: -3.84, maxX: 2.04, minZ: -3.8, maxZ: 5.4, y: 0.9 },
    { id: 'laundry', name: 'Laundry', minX: -9.2, maxX: -7.26, minZ: -3.8, maxZ: -1.46, y: 0.9 },
    { id: 'kitchen', name: 'Kitchen', minX: -9.2, maxX: -3.96, minZ: -3.8, maxZ: 1.54, y: 0.9 },
    { id: 'dining', name: 'Dining room', minX: -9.2, maxX: -3.96, minZ: 1.66, maxZ: 5.4, y: 0.9 },
    { id: 'hall', name: 'Hall', minX: 2.16, maxX: 8.4, minZ: -0.54, maxZ: 0.54, y: 0.9 },
    { id: 'bath', name: 'Bathroom', minX: 2.16, maxX: 4.24, minZ: -3.8, maxZ: -0.66, y: 0.9 },
    { id: 'bed2', name: 'Bedroom', minX: 4.36, maxX: 8.4, minZ: -3.8, maxZ: -0.66, y: 0.9 },
    { id: 'bed3', name: 'Bedroom', minX: 2.16, maxX: 4.84, minZ: 0.66, maxZ: 5.4, y: 0.9 },
    { id: 'mainbath', name: 'Main bath', minX: 6.96, maxX: 8.4, minZ: 0.66, maxZ: 2.54, y: 0.9 },
    { id: 'main', name: 'Main bedroom', minX: 4.96, maxX: 8.4, minZ: 0.66, maxZ: 5.4, y: 0.9 },
    { id: 'garage', name: 'Garage', minX: -16.05, maxX: -9.55, minZ: -5.45, maxZ: 2.05, y: 0.5 },
  ],
  door: { x: 0, z: -4, w: 1.0, inside: { x: 0, z: -3.2, yaw: Math.PI }, outside: { x: 0, z: -5.0, yaw: Math.PI } },
  bed: { x: 6.7, z: 4.3, w: 1.6, l: 2.1, top: 1.36, yaw: 0, wake: { x: 5.35, z: 4.2, yaw: Math.PI } },
  path: [[5.35, 4.2], [5.4, 2.95], [6.1, 2.35], [5.75, 0.6], [5.75, 0], [1.4, 0], [0.4, -2.3], [0, -3.2]],
  garageDoor: { minX: -15.3, maxX: -10.3, z: -5.6, h: 2.2 },
  houseDoor: { x: -9.4, z: -2.75, w: 0.9, inside: { x: -8.6, z: -2.75 }, outside: { x: -10.4, z: -2.75 } },
  slider: { x: -2.9, z: 5.6, w: 0.95, inside: { x: -2.9, z: 4.8 }, outside: { x: -2.9, z: 6.5 } },
};
export const PORCH = { minX: -5, maxX: 5, minZ: -7.6, maxZ: -4, y: 0.9, ceilY: 3.42 }; // room to move about on it: the ranch's gabled porch, a concrete floor on brick. ceilY: its beadboard ceiling, the swing's hooks
export const STEPS = { minX: -1.3, maxX: 1.3, minZ: -8.6, maxZ: -7.6, y: 0.62 }; // two concrete treads: this is the lower one's height, the upper one is house.js's own surface
export const DOCK = { minX: 51, maxX: 65.6, minZ: -20.4, maxZ: -17.6, y: 0.75 }; // Kevin's pier, out into Lake Tamakiya (long enough for his boat)
// The rowboats (rowboats.js): bow ring at (x, z) + 1.7 m along yaw; `tie` is where the painter is made fast. The Lake Blue one along the
// pier's south side by the shore (its painter on the piling at x 55), the Butter Yellow one riding on the red buoy at (64, -10) (dock.js).
export const ROWBOATS = [{ skin: 'lake', x: 57.6, z: -16.65, yaw: -Math.PI / 2, phase: 0, tie: [55, 0.95, -17.58] },
  { skin: 'butter', x: 65.45, z: -7.49, yaw: Math.atan2(-0.5, -0.866), phase: 2.1, tie: [64.15, 0.2, -9.74], sag: 0.08 }]; // (lying off the buoy to the south-east, in deep water)
// Where Kevin stops and looks for company on his 7 pm wander (kevin-day.js picks a few each evening; all on the trails)
export const KEVIN_LOOKOUTS = [[37.1, -30.4], [14.5, -33.3], [2.5, -21], [-7, -14.5], [-20, -11.7], [16, -6.5], [35, -9], [-52, -13], [-57, -2], [-64, -19]]; // ([0] and [1] sit on the lawn arc)

export const FENCE_Z = -40.2;   // the front (north) picket fence
export const FENCE_WEST_X = -42; // the west picket fence, between the yard and Strickler Park
export const FENCES = [
  { id: 'north', a: [FENCE_WEST_X, FENCE_Z], b: [56.8, FENCE_Z] },
  { id: 'west', a: [FENCE_WEST_X, FENCE_Z], b: [FENCE_WEST_X, 39.8] },
];
// Gates in those fences. `c` is the centre along the fence, `w` the opening. Players open them with E; the dogs never can.
export const GATES = [
  { id: 'north-gate', fence: 'north', x: 2.5, z: FENCE_Z, w: 1.8, axis: 'x', name: 'the front gate' },
  { id: 'west-gate', fence: 'west', x: FENCE_WEST_X, z: -12.1, w: 1.8, axis: 'z', name: 'the park gate' },
];

// The dogs' world: inside the fence, on our side of the water (the pier included).
export const YARD = [
  [-41.3, -39.5], [56, -39.5], [54.4, -36.8], [51.4, -28.4], [51.4, -20.3], [65.4, -20.3], [65.4, -17.7], [51.7, -17.7],
  [54, -12], [57.3, -5.2], [57.8, 0.8], [54.4, 4.3], [44, 6.2], [28, 6.8], [12, 7.2], [-4, 7.2], [-9, 8], [-10.4, 13],
  [-12, 22], [-18, 31], [-33, 37.2], [-41.3, 38.4],
];

export const MAILBOX = { x: 4.6, z: -39.2 };
export const TOY_BASKET = { x: -3.3, z: -8.7 }; // on the lawn just in front of the house, left of the porch steps (dog-toys.js stands it on the ground)
export const PAW_SIGN = { x: TOY_BASKET.x - 1.6, z: TOY_BASKET.z - 0.1, yaw: Math.PI }; // the affection levels sign beside the toy basket, facing the lawn (paws.js)
export const PORCH_SWING = { x: -3.1, z: -5.4, w: 2.0 }; // the hanging porch swing, left of the door, facing the yard: a two-seater (porch-swing.js)
// Dax and Nala's round beds (dog-beds.js): on the porch's +x half, the LEFT half as you see it from the yard (the swing at -x is on
// the right from there), staggered: one against the house wall, one by the front rail, clear of the door, the mat, the steps, the
// corner pot and the swing. yaw: the way a dog lies in it (the head toward the yard).
export const DOG_BEDS = [
  { x: 2.55, z: -5.0, yaw: Math.PI + 0.45, color: '#5fb8a8', dish: '#f3e6c8' },   // Dax's: by the wall, next to his spot by the door
  { x: 3.8, z: -6.35, yaw: Math.PI - 0.35, color: '#f07a7a', dish: '#fbe8c9' },   // Nala's: by the rail, looking out over the lawn
];
// The big round dog bed in the living room, in the corner beside the TV, in front of the tall window: Dax and Nala nap in it
// together (npcs.js nap spots; `spots` = where each lies, yaw the way it faces).
export const INDOOR_DOG_BED = { x: 1.05, z: 4.5, rx: 0.82, rz: 0.68, tube: 0.17, color: '#7a5f4a', dish: '#cfc6b4', spots: { dax: { x: 1.6, z: 4.45, yaw: Math.PI - 0.3 }, nala: { x: 0.5, z: 4.55, yaw: Math.PI + 0.3 } } }; // (Dax in the quiet corner by the window, Nala on the room's side)
export const FISH_SHACK = { x: 43.5, z: -32.8, w: 5.2, d: 4.2, door: 'south' }; // north of the dock lawn's ring path, beside the pier: swap your pole and bait

// Where the player appears after the intro and where returning players land.
export const SPAWN = { x: 0, z: -12, yaw: Math.PI }; // facing north, away from the house

// ------------------------------------------------------------------ the town (north)
// Roads are centre lines with a width; every paved road has a kerb and a 3 m sidewalk (kerb included) on both sides.
// road-net.js turns them into one paved field (world-town.js builds it): a road that ENDS on another road's centre line
// joins it in a T (rounded kerbs, a zebra across its mouth); any other end is cut off square (the lake, the map edge).
export const SIDEWALK_W = 3;
export const ROADS = [
  { id: 'breneland-rd', name: 'Breneland Rd', width: 9, pts: [[57.5, -48.5], [-92, -48.5], [-101, -53], [-106.5, -66], [-107.5, -84], [-107.5, -126.5]], lampsTo: -89 }, // world.js puts the lamps on the straight part (east of lampsTo)
  { id: 'summit-rd', name: 'Summit Rd', width: 9, pts: [[59, -126.5], [-216, -126.5]] }, // on into the tunnel at x -192
  { id: 'maple-ave', name: 'Maple Ave', width: 8, pts: [[-20, -48.5], [-20, -126.5]] },
];
// Zebra crossings where a path meets a road away from a junction (the T junctions get theirs automatically).
export const CROSSINGS = [
  { road: 'breneland-rd', x: 2.5, z: -48.5 },   // from our front gate across to Maple Row
  { road: 'breneland-rd', x: -92, z: -48.5 },   // where the park trail (park-north) comes up to the road
  // (and one across Summit Rd at the Tool Crib's walk: pushed below TOOL_CRIB, crib-move)
];
// The street in front of our fence (older modules: the mail carrier, the jogger, the street sound).
export const STREET = { z0: -44, z1: -53, sidewalkN: -56.5, sidewalkS: -40.6 };

export const NEIGHBORHOODS = [
  { id: 'maple-row', name: 'Maple Row', minX: -97, maxX: 52, minZ: -118, maxZ: -57 },   // Neighborhood 1
  { id: 'summit-hill', name: 'Summit Hill', minX: -60, maxX: 60, minZ: -168, maxZ: -135 }, // Neighborhood 2
];
export const SHOPS = { minX: -190, maxX: -134, minZ: -121, maxZ: -94, faces: 'north' }; // shop fronts on Summit Rd (mall-bigger: the strip mall reaches z -95.5)
// The strip mall (strip-mall.js, strip-mall-plan.js): one low building on Summit Rd's south side to the right of the game store as
// you face it (west), where Rufallia Diner and Sweet Crumb Bakery stood (strip-mall, Andrew 2026-11-09). Two storefronts under one
// timber canopy: Summit Slice (the pizza place: Pepperoni Pete's scooter lives in its lot and his deliveries start and end at its
// door) and Peak Threads (the clothing store). x, z = the building's walls (the front wall on minZ, facing the road, north); `walk` =
// the concrete walkway under the canopy in front of the storefronts, flush with the floors; `lot` = the tar in front of that, head-in
// bays with their noses to the walkway's kerb (static cars, strip-mall-build.js); `scooter` = where Pete's scooter stands (the lot's
// west end, nose to the walkway; yaw as everywhere: forward = (sin yaw, cos yaw)); `bench` = the bench on the walkway (Kevin paints
// it); each unit's `door.x` is its glass door's middle, `hours` its open hours (Eastern, 25 = 1 am).
// (mall-bigger, Andrew 2026-11-09 on v249: "the strip mall seems physically tiny compared to the gaming store": 26.5 x 16 m now, 6 m to
// the parapet (a false front over the canopy), its back wall at z -95.5 against the woods, its east wall 3.5 m short of the game store's
// lot; the front, the walkway and the lot stay where they were, so Pete's spot and the doors' x did not move)
export const STRIP_MALL = {
  minX: -189.5, maxX: -163.0, minZ: -111.5, maxZ: -95.5, h: 6.0,
  canopy: { y: 3.3, out: 2.6 },
  walk: { minZ: -114.2, y: 0.46 },
  lot: { minZ: -119, maxZ: -114.2, bays: [-186.3, -183.6, -180.9, -178.2, -175.5, -172.8, -170.1, -167.4, -164.7] },
  units: {
    pizza: { id: 'pizza', name: 'Summit Slice', minX: -189.5, maxX: -176.6, door: { x: -183.4, w: 1.1 }, hours: [11, 25] },
    clothes: { id: 'clothes', name: 'Peak Threads', minX: -176.3, maxX: -163.0, door: { x: -170.8, w: 1.1 }, hours: [11, 19.5] },   // (mall-staff: Andrew, every day 11 to 7:30 pm; Summit Slice's party nights run to 5 am: mall-staff-day.js PARTY)
  },
  scooter: { x: -188.4, z: -116.3, yaw: 0 },
  bench: { x: -180.2, z: -112.7, yaw: Math.PI },
};
// The game store (game-store.js), enterable: 16 m deep and 14 wide, with a loft over its back `loftD` metres (the D&D back room
// under it). The loft's floor is at y `loftY` (stairs up the west wall).
export const GAME_STORE = { x: -152, z: -106.5, w: 14, d: 16, door: 'north', loftD: 6, loftY: 3.17 };
// The store's lot: no trees grow in it and the ground under it is flat town ground (main.js isClear, terrain.js TOWN_RECTS). It runs
// past the store's back wall so the tree line stands clear of the roof.
export const STORE_LOT = { minX: GAME_STORE.x - GAME_STORE.w / 2 - 2, maxX: GAME_STORE.x + GAME_STORE.w / 2 + 2, minZ: -121, maxZ: GAME_STORE.z + GAME_STORE.d / 2 + 5 };
// Kevin's Tool Crib (tool-crib.js): the old hardware store's 11 x 16 m shell made a general store you walk into. It stood among the
// shops on Summit Rd's south side (x -137, z -108, facing north); since crib-move (Andrew, 2026-11-08: "it thematically looks
// similar to the post office") it stands beside the post office on the road's NORTH side, east of it, on the same wall line (its
// front wall at z -138.5 like the office's, the porch and its steps in front of that), 6.5 m between the two buildings for Kevin's
// motorcycle pad (CRIB_PAD: the roll-up door is on that side), its door facing the road (south). Kevin's loft is over the back `loftD` metres (the north end) up a small stair. x, z = its middle;
// `door` = the side its front is on (tool-crib-plan.js draws the plan in the crib's own frame and turns it to face this way, so
// the plan's numbers did not change). `TOOL_CRIB_LOT` = its flat ground, no trees (terrain.js TOWN_RECTS, CLEARINGS). The first
// Summit Hill house moved 6 m east to make room (world-town.js). Where the crib stood is SUMMIT_SQUARE now.
export const TOOL_CRIB = { x: -93, z: -146.5, w: 11, d: 16, loftD: 5.2, door: 'south' };
export const TOOL_CRIB_LOT = { minX: -104.5, maxX: -84, minZ: -158, maxZ: -134 };
const CRIB_FRONT = TOOL_CRIB.door === 'south' ? 1 : -1; // (+1: the front faces +z)
CROSSINGS.push({ road: 'summit-rd', x: TOOL_CRIB.x, z: -126.5 }); // a zebra from the Tool Crib's walk (the post office beside it) over to the shops' side: Kevin's way to the pier, the bus riders' way to the shop
// Kevin's motorcycle pad (crib-move; Andrew: "a small parking area on the side with the rollup door so Kevin can take his motorcycle
// out for a spin (Sundays from 2 to 5)"): a tar pad between the crib and the post office, along the crib's roll-up door side (its west
// wall, x -98.5; the door's opening is at z -148.5..-146), joined to Summit Rd by a short driveway (`drive`: an apron across the
// sidewalk like the post office's, road-net.js; narrower than the pad, clear of the office's flag pole at x -103.7). `stop` = where
// the bike stands wheeled out of the door, nose west, before he rides off down the drive and when he comes back. Everything world.
export const CRIB_PAD = { minX: -104.3, maxX: -98.56, minZ: -151.5, maxZ: -139.5, y: 0.4, drive: { minX: -102.5, maxX: -98.9, roadZ: -129.8, cutZ: -134 }, stop: { x: -101.3, z: -147.25 } };
// The shops' little gravel lot, east of Summit Square, off the south side of Summit Rd: three bays (cars.js parks
// its cars here and in the empty driveways; the moving cars reverse out of a bay and come back to it).
export const CAR_LOT = { minX: -131.5, maxX: -123.5, minZ: -121, maxZ: -110, bays: [[-129.6, -114.2], [-127.0, -114.2], [-124.4, -114.2]] };
// Summit Square (summit-square.js): the small paved park where the Tool Crib stood (crib-move), between the game store's lot and
// the shops' car lot, right next to the store the board games are borrowed from. Pavers flush with Summit Rd's sidewalk (the way
// in is a gap in a low planter wall along the front), an open-sided shelter (a roof on six posts) with two picnic tables under it
// that a borrowed game can be set up on (table-games/tables.js `square:t0`, `square:t1`), five park benches round the edge, two
// lamps by the way in, planters, a tree either side of the back bench, a bin and the name on a post. Everything in world metres;
// yaw as everywhere: forward = (sin yaw, cos yaw). `shelter`: x, z its middle, w along x, d along z; the tables' lengths run along
// z (yaw PI / 2), a bench either side of each.
export const SUMMIT_SQUARE = {
  name: 'Summit Square', minX: -142.4, maxX: -131.6, minZ: -119, maxZ: -101, y: 0.44,
  gate: { x0: -138.6, x1: -135.4 },                                   // the gap in the front planter wall
  shelter: { x: -137, z: -109.6, w: 7.8, d: 5.6, eave: 2.6, ridge: 3.7 },
  tables: [{ id: 't0', x: -138.8, z: -109.6, yaw: Math.PI / 2 }, { id: 't1', x: -135.2, z: -109.6, yaw: Math.PI / 2 }],
  benches: [{ x: -141.55, z: -113.5, yaw: Math.PI / 2 }, { x: -141.55, z: -105.7, yaw: Math.PI / 2 }, { x: -132.45, z: -113.5, yaw: -Math.PI / 2 }, { x: -132.45, z: -105.7, yaw: -Math.PI / 2 }, { x: -137, z: -101.85, yaw: 0 }],
  lamps: [{ x: -141.5, z: -117.6 }, { x: -132.5, z: -117.6 }],
  planters: [{ x: -139.55, z: -117.9 }, { x: -134.45, z: -117.9 }], // flanking the way in (texture-sweep: 5 cm clear of the planter wall's cap, which they sat on)
  trees: [{ x: -141.2, z: -102.1 }, { x: -132.8, z: -102.1 }],
  sign: { x: -140.2, z: -117.0, yaw: Math.PI }, bin: { x: -133.6, z: -116.3 },   // (the sign's face toward the road)
};
// Lane centre offset from a road's centre line (right-hand traffic; a car is 1.76 m wide, the roads 8-9 m).
export const LANE_OFFSET = 2.1;
// The water tower, a traditional welcome to Breneland for people arriving: across Summit Rd from the shops, in the open meadow north
// of the road (docs/refs/w9-tower-move), set back so its nearest footing is 12 m off the kerb (9 m past the sidewalk). Its ladder
// faces the junction where Breneland Rd comes up into town. `view`: where "Take in the view" from the roof looks (the town, the
// park and the lake, our house in the middle). `boards`: the name painted round the tank faces these, Breneland Rd coming up into
// town by the Lovecraft house and Summit Rd's west end by the shops.
export const WATER_TOWER = { x: -140, z: -152, view: { x: 0, z: -10 }, boards: [{ x: -106, z: -66 }, { x: -192, z: -126.5 }] };
// Where it used to stand: cleared grass, kept flat and free of trees.
export const OLD_TOWER_SITE = { x: -125, z: -96 };
// The bus stop on the old tower site: a bay pulled in off Breneland Rd's west side where it comes up into town (`bay`: the tar's
// outline, a convex polygon that overlaps the road; road-net.js joins it to the paving, the kerb and sidewalk wrap round behind it),
// the bus's stop (its middle, heading south, the doors on the kerb side), the shelter facing the bay, the sign at the bay's front
// end, a paved plaza on the old site with a path up to Summit Rd, and `link`: the lawn between the shops' lot's back kerb and the
// plaza.
export const BUS_STOP = {
  bay: [[-110, -117], [-115.2, -104.5], [-115.2, -87], [-110, -79]],
  stop: { x: -113.8, z: -94.5, yaw: 0 },
  shelter: { x: -120.2, z: -92.2, w: 6.2, d: 2.3 },          // centre; w along z, d along x; open to the east (the bay)
  sign: { x: -116.1, z: -88.4 },
  plaza: { minX: -128, maxX: -118.2, minZ: -104, maxZ: -85.5 },
  path: { minX: -121.2, maxX: -119.2, minZ: -119, maxZ: -104 },   // up to Summit Rd's sidewalk, east of the lot
  link: { minX: CAR_LOT.minX, maxX: CAR_LOT.maxX, minZ: CAR_LOT.maxZ, maxZ: -104 },
};
// The tunnel at Summit Rd's west end, past the game store, where the road ends (no entry for players). The bus leaves through it
// and comes back every 30 minutes. Its portal stands at the map's edge (x), the road runs on into the dark to `endX` (Summit Rd's
// tar goes in with it), and the hill it bores through rises behind.
export const BUS_TUNNEL = { x: -192, z: -126.5, endX: -214, w: 11.6, h: 6.4, hill: { x: -213, z: -126.5, rx: 21, rz: 30, h: 17 } };
// The post office: on Summit Rd's north side, across the street and to the right of the game store, between the water tower and
// Kevin's Tool Crib (TOOL_CRIB, beside it to the east since crib-move; the first Summit Hill house is at x -76 beyond that), right
// at the head of the T where Breneland Rd comes up into town, so you see it as you arrive. x, z = the building's middle (w along x, d along z, its front and door facing the
// road, south). `lot` = its ground (flat, no trees: the region "Post Office"). `bay` = the mail van's spot on its west side, nose
// to the road, beside the roll-up door (mailman.js parks it there for the night). `drive` = the bay's driveway across the sidewalk
// (road-net.js joins its apron to Summit Rd's tar, cut at the sidewalk's back edge like the park lot's). `door` = the front step.
export const MAIL_OFFICE = {
  x: -109.5, z: -142, w: 9, d: 7, h: 4.3,
  lot: { minX: -122.5, maxX: -103, minZ: -148, maxZ: -134 },
  bay: { x: -118.5, z: -141.5, yaw: 0 },
  drive: { minX: -121.5, maxX: -115.5, roadZ: -129.8, cutZ: -134 },   // (roadZ: its end inside the road's tar)
  door: { x: -109.5, z: -137.6 },
};
// The mail van's stop by Strickler Park: a lay-by cut into Breneland Rd's south kerb, west of the park lot's drive, where the van
// waits off the road while Pat walks his rounds. `bay` = the tar's outline (convex, overlapping the road like the bus stop's; the
// kerb and the sidewalk wrap round behind it), `spot` = the van's middle there, facing east, `sign` = its MAIL VANS ONLY post.
export const VAN_STOP = {
  bay: [[-93, -45.6], [-86.5, -41.2], [-79, -41.2], [-74.5, -45.6]],
  spot: { x: -82.6, z: -42.6, yaw: Math.PI / 2 },
  sign: { x: -79.5, z: -38.75 },
};
export const CARNIVAL = { x: -210, z: -268 }; // beyond the mountains to the north-west: seen, never reached
// The backdrop mountains (world-ridges.js): the Blue Ridge and the Pisgah range as seen from Arden, North Carolina,
// placed by compass bearing (0 north, 90 east) and distance from this centre. Mount Pisgah (its TV tower on top) stands to
// the west-south-west; lovecraft-house.js rests the telescope on it by day.
export const BLUE_RIDGE = { cx: -40, cz: -30 };
export const PISGAH = { bearing: 245, r: 900, top: 262, x: -40 + Math.sin(245 * Math.PI / 180) * 900, z: -30 - Math.cos(245 * Math.PI / 180) * 900 };

// ------------------------------------------------------------------ Strickler Park (west)
export const PARK = { name: 'Strickler Park', minX: -190, maxX: FENCE_WEST_X, minZ: -96, maxZ: 46, sign: { x: -44.6, z: -15.7 } }; // sign: where the old park sign stood just inside the gate. The sign's gone, but the spot keeps its clearing and the residents' park walk
export const FOUNTAIN = { x: -62.5, z: -1, r: 2.4 }; // the park fountain where the trails meet (park.js); r = the basin
// Scenic views (Andrew's pins, docs/refs/andrew-scenic-pins.json): the park bench on the shore of Lake Rufallia (pin
// p14), facing out over the water (forward = (sin yaw, cos yaw)); the photo board by the fountain, its face toward the swing
// trail and the fountain. The World Editor can move both (world-edits.js MOVABLE); scenic-bench.js keeps the bench on dry land.
export const SCENIC_BENCH = { x: -103.2, z: 44.5, yaw: 0.2 };
export const PHOTO_BOARD = { x: -68, z: -6, yaw: 1.33 };
// Fallen logs you can sit on (park.js builds them, seats.js lists their seats): centre, the log's axis angle (atan2 convention),
// which way a sitter faces, and the length.
export const LOGS = [
  { id: 'driftwood', x: -14.6, z: 12.5, axis: -0.25, face: Math.PI / 2, len: 2.6, name: 'driftwood log' }, // on the sand of Oyster Cove's west shore, facing the water
  { id: 'meadow', x: -74, z: 6, axis: 0.45, face: -1.1, len: 3.0, name: 'fallen log' },          // in the park meadow between the fountain and the bocce court
];
export const WOODS_X = -122;  // west of this the park turns into woods, denser and denser toward MAP.minX
export const SCOUT_CAMP = { x: -150, z: -16 };
export const TENT = { x: -176, z: 12 };
// A glade in the deep woods with a fairy ring of mushrooms. The deep-south trail runs along its rim.
export const GLADE = { x: -216, z: 56, r: 7 };
// Where the cub scouts may hide and run: Andrew's green doodle on docs/refs/andrew-b2-map.png, the loop of
// woods round the Scout Camp from below the old water tower site, down the west edge past the tent, to the south-west corner of the
// woods. Traced by tools/w1-scouts-trace.py (map frame = world x -192..66, z -172..60), clamped 1 m inside the west edge.
// The camp itself sits in the loop's bay; scouts-area.js joins it on (a circle round SCOUT_CAMP and a short neck).
export const SCOUT_WOODS = [[-165, -79], [-186, -65], [-191, -54], [-191, 24], [-184, 41], [-169, 47], [-118, 42], [-110, 40], [-118, 27],
  [-130, 23], [-162, 19], [-169, 16], [-172, 11], [-172, -13], [-165, -26], [-161, -29], [-149, -29], [-142, -31], [-122, -54], [-123, -63],
  [-129, -76], [-134, -81], [-155, -82]];

// Trails (dirt paths). A string like "slot:garden" is replaced with that slot's position from games.json, so moving a
// slot moves its trail.
export const TRAILS = [
  { name: 'main', width: 2.2, pts: [[0, -8.75], [0.1, -10.6], [0.8, -13], [2.5, -21], [4.2, -29], [3.4, -35], [2.5, -37.8]] }, // from the foot of the porch steps to the front gate (the gate-out trail takes the last few metres, narrower, past the mailbox)
  { name: 'gate-out', width: 1.8, pts: [[2.5, -37.8], [2.5, -42]] },
  { name: 'west', width: 1.7, pts: [[0.8, -13], [-7, -14.5], [-15, -12.5], [-27, -10.6], [-32.8, -11.57], [-36, -12.1], [-42, -12.1]] }, // (across the old West Lawn to the park gate; [-32.8 -11.57]: where the firepit trail turns off)
  { name: 'park', width: 1.7, pts: [[-42, -12.1], [-45.6, -12.42], [-52, -13], [-64, -19], [-82, -27], [-98, -31], 'slot:woods-corner'] }, // into the woods corner, to the unicorns' lawn
  { name: 'park-swing', width: 1.5, pts: [[-52, -13], [-57, -2], [-60, 11], [-62, 17]] },
  { name: 'park-bocce', width: 1.4, pts: [[-60, 11], [-72, 13], [-84, 12], [-92, 11]] },
  { name: 'park-north', width: 1.5, pts: [[-82, -27], [-87, -33], [-92, -41.4]] }, // from the park trail up onto the sidewalk of Breneland Rd (the zebra: CROSSINGS)
  { name: 'scout-trail', width: 1.3, pts: ['slot:woods-corner', [-130, -28], [-140, -20], [-146, -17]] },
  { name: 'tent-trail', width: 1.1, pts: [[-150, -12], [-160, -2], [-170, 6], [-174, 10]] },
  // two loops through the deep woods. deep-north leaves the scout trail and wanders out under the shops' corner to the west edge
  // and back to the tent trail. deep-south leaves the tent trail, passes the glade, runs down to the south-west corner, back along
  // the lake's west shore and up to the Scout Camp. `late`: their points join the NPCs' trail graph (npcs.js NavGraph) after every
  // other trail's, and the wandering stops never pick them, so they don't move the dogs' and the residents' days (a stop is picked
  // by index over the graph's points).
  { name: 'deep-north', width: 1.1, late: true, pts: [[-130, -28], [-142, -46], [-160, -62], [-186, -74], [-212, -76], [-228, -60], [-226, -36], [-206, -22], [-182, -12], [-160, -2]] },
  { name: 'deep-south', width: 1.1, late: true, pts: [[-170, 6], [-180, 3], [-194, 16], [-206, 30], [-222, 46], [-224, 68], [-208, 86], [-184, 90], [-164, 80], [-150, 62], [-142, 44], [-138, 24], [-140, 4], [-150, -12]] },
  { name: 'garden', width: 1.4, pts: [[-45.6, -12.42], [-46.6, -14.5], 'slot:garden@-0.1,12.7', 'slot:garden@0,11'] }, // off the park path just inside the park gate, curving up to the Community Garden's rose arch, straight in through it
  { name: 'east', width: 1.7, pts: [[0.8, -13], [8, -10.5], [12.2, -8.4], [16, -6.5], [22.5, -5.4], [29, -6.6], [35, -9], [37.5, -12.5], 'slot:boat-dock'] }, // across the East Lawn to the dock lawn ([12.2 -8.4]: where the cove trail turns off), over the plain lawn
  // the lawn arc (Andrew's black line on the map) leaves the main path, sweeps north over the frisbee field under the hedges and
  // comes down past the Fish Shack to the dock lawn. It stands where the old 'northeast' and 'dock' trails stood with as many points
  // (six), so the NPC trail graph's points keep their order (npcs.js NavGraph).
  { name: 'lawn-arc', width: 1.7, pts: [[4.2, -29], [8.6, -31.6], [14.5, -33.3], [22, -34.1], [29.6, -33.5], [37.1, -30.4], 'slot:boat-dock'] },
  // the picnic spur: off the main path to the picnic block's east side (the trail stops at the block: picnic.js addTrailStop).
  // `late`: its points come after every other trail's in the NPC graph, so it doesn't move anyone's day.
  { name: 'picnic', width: 1.6, late: true, pts: [[2.5, -21], [-3.2, -23.2], [-8.2, -25.4], 'slot:north-lawn@13.4,3.2', 'slot:north-lawn@11.4,3.2'] },
  { name: 'pier', width: 1.5, pts: [[37, -19.4], [44, -19], [50.9, -19]] }, // through the dock lawn to the boards
  { name: 'firepit', width: 1.4, pts: [[-32.8, -11.57], [-34.0, -7.2], [-34.8, -1.0], [-34.6, 5.5], [-33.6, 11.5], [-32.42, 18.73]] }, // off the west trail 9 m short of the park gate, wandering down the old West Lawn into the Lakeside Firepit's dirt circle between the orange chair and the north log
  { name: 'cove', width: 1.3, pts: [[12.2, -8.4], [11.2, -4.6], [10.6, -0.4], [10.9, 3.0], [12.2, 5.0], [13.8, 6.1]] }, // off the east trail, round the house's east side (west of the birch) and down onto the sand by the towel (it ran along the house's wall)
];

// Named trees (the rest of the woods is generated).
export const YARD_TREES = [
  { x: -53.5, z: -34.5, kind: 'oak' }, { x: -12, z: -34.5, kind: 'maple' },
  { x: -19, z: -19.5, kind: 'birch' }, { x: -20.5, z: -6.8, kind: 'oak' }, // ([3] moved out of the garage's drive)
  { x: -36, z: -17, kind: 'pine' }, { x: -48, z: 1, kind: 'pine' },
  { x: 21.5, z: -38.6, kind: 'maple' }, { x: 51.6, z: -38.4, kind: 'oak', s: 1.05 }, // ([7] qol-fixes: it stood in the Fish Shack set piece's back wall at x 44, z -36.5; now off its north-east corner, a size smaller)
  { x: 22, z: -17, kind: 'oak' }, { x: 50.5, z: -8, kind: 'palm' },
  { x: 13, z: 1.5, kind: 'birch' }, { x: -15.6, z: 5.6, kind: 'maple' }, // ([11] moved out of the garage's back wall)
  { x: -50, z: 28, kind: 'pine' }, { x: -29, z: 22, kind: 'birch', gone: true }, // ([13]: removed for the Lakeside Firepit, Andrew 2026-10-16: "get rid of this tree"; the entry stays so the indices world edits use do not shift) { x: -76, z: 30, kind: 'oak' },
  { x: 36, z: -34, kind: 'birch' }, { x: 12, z: -20, kind: 'maple' }, { x: -33, z: -26, kind: 'oak', s: 1.6 }, // ([16] the picnic's big shade oak; `s` sets its size, world.js still takes its random draw)
  { x: 40, z: 1.5, kind: 'palm' }, { x: -20, z: 12, kind: 'maple' },
  { x: -70, z: -40, kind: 'maple' }, { x: -96, z: -12, kind: 'oak' }, { x: -58, z: -58, kind: 'birch' },
  { x: -80, z: -8, kind: 'birch' }, { x: -128, z: 34, kind: 'oak' },
];
export const SWING_TREE = { x: -64, z: 20 };
// The swing hill (Andrew's map, the green block round the Old Swing Tree, docs/refs/andrew-b2-map.png): the tree on
// top of a smooth hill, the tire facing down its long slope toward the block's far (west) end, sand at the foot where launches land.
// yaw: the way a rider faces (forward = (sin yaw, cos yaw)); hang: the tire hangs this far from the trunk to the rider's right. The
// hill is laid in the swing's frame round the rope's pivot (u metres forward, v metres to the right): `h` high, flat on top `top.f`
// ahead, `top.b` behind and `top.s` to each side, falling to the lawn over `fall.f / b / r / l` metres. The sand pit runs from `sand.u0`
// to `sand.u1` along the slope's line, `sand.w` either side, its corners rounded `sand.r` (sized to the launches' landings).
// Plain numbers only: lib/swing.js reads this through lib/layout-read.js.
export const SWING_HILL = { yaw: -1.25, hang: 3.2, h: 2.4, top: { f: 0.8, b: 3.2, s: 4.5 }, fall: { f: 10, b: 12, r: 12, l: 11 }, sand: { u0: 4.2, u1: 21.5, w: 5, r: 2.6 } };
// The Community Garden: a block on the WEST side of the yard fence, the same size as the picnic block. Its middle is the `garden`
// slot in games.json, the single source of truth, and everything here is relative to it: u = metres east of the slot, v = metres
// south. With the slot at -48.65 -29.2 the block runs from the yard fence (x -42, its east side) to 1 m short of the park lot
// (x -55.3), and from the yard's north fence line (z -40.2, 0.8 m off Breneland Rd's sidewalk) to 1 m short of the Strickler Park
// sign by the park path (z -18.2): 13.3 x 22 m, the picnic block stood on end (the road, the fence, the lot and the path box it
// in). `gate` = the way in from the park path (layout TRAILS 'garden'), `cartGate` = the north gate off the sidewalk where Joyce's
// golf cart comes in.
export const GARDEN_BLOCK = { hw: 6.65, hd: 11, gate: { u: 0, v: 11 }, cartGate: { u: 0.7, v: -11 } };
// Spots for the people who use it (joyce-day.js reads them through gardenSpot(slot, name)); yaw: forward = (sin yaw, cos yaw).
//   joyce: where Joyce stands to hand out the jobs, by her chalkboard at the head of the middle aisle, facing the beds.
//   cart:  her pink golf cart, parked on the gravel pad inside the north gate, nose in (south).
//   chair: her chair in the oak's shade (built by the garden; sitting in it is seats.js).
//   work:  where she potters while she is in (each beside a bed or a job, facing it), all on the paths.
export const GARDEN_SPOTS = {
  joyce: { u: 0.5, v: -3.5, yaw: 0 },
  cart: { u: 0.7, v: -9.0, yaw: 0 },
  chair: { u: -3.4, v: -4.4, yaw: 0.35 },
  work: [{ u: -1.1, v: 6.6, yaw: -Math.PI / 2 }, { u: 1.1, v: 2.6, yaw: Math.PI / 2 }, { u: -1.1, v: -1.4, yaw: -Math.PI / 2 },
    { u: 1.1, v: -1.4, yaw: Math.PI / 2 }, { u: 3.0, v: 4.6, yaw: Math.PI }, { u: -3.0, v: 0.6, yaw: 0 }, { u: -2.5, v: -7.9, yaw: -2.4 }],
};
// The block in world metres for a slot: { minX, maxX, minZ, maxZ, x, z }.
export function gardenBlock(slot) {
  const B = GARDEN_BLOCK;
  return { minX: slot.x - B.hw, maxX: slot.x + B.hw, minZ: slot.z - B.hd, maxZ: slot.z + B.hd, x: slot.x, z: slot.z };
}
// A named GARDEN_SPOTS (or GARDEN_BLOCK) spot in world metres: gardenSpot(slot, 'joyce') -> { x, z, yaw }; 'work' -> a list.
export function gardenSpot(slot, name) {
  const s = GARDEN_SPOTS[name] || GARDEN_BLOCK[name];
  const at = p => ({ x: slot.x + p.u, z: slot.z + p.v, yaw: p.yaw || 0 });
  return !s ? null : Array.isArray(s) ? s.map(at) : at(s);
}
// ------------------------------------------------------------------ the picnic and the lawn
// The picnic area on the pink block of Andrew's map (docs/refs/andrew-b2-map.png: 26 x 13 m at x -38..-12, z -36..-24, west of the
// main path; the old garden's spot). Its middle is the `north-lawn` slot in games.json (the single source of truth, as the
// garden's is); everything is relative to it, u = metres east, v = metres south. Open on all sides (no fence). The tables and the
// pie contest are picnic-build.js PLAN; picnicBlock(slot) is the block in world metres.
export const PICNIC_BLOCK = { hw: 12.6, hd: 5.9 };
export function picnicBlock(slot) {
  const B = PICNIC_BLOCK;
  return { minX: slot.x - B.hw, maxX: slot.x + B.hw, minZ: slot.z - B.hd, maxZ: slot.z + B.hd, x: slot.x, z: slot.z };
}
// Where the NPCs stroll at the picnic: NOT a drawn path, only points in the NPC trail graph (npcs.js NavGraph puts them after
// every drawn trail's and before the `late` ones). 28 points, standing where the old picnic lawn's 28-point ring path stood in
// that graph, so every wandering stop lands where it always did. A loop just outside the block (u, v from the slot): (13.4, 3.2)
// is where the picnic spur meets it, (0, 6.4) the nearest to the middle (npcs.js stopFor: an area visit stands there, on the
// open lawn south of the tables).
export const PICNIC_WALK = [[0, 6.4], [3, 6.6], [6, 6.6], [9, 6.6], [11.6, 6.3], [13.3, 5.2], [13.4, 3.2], [13.5, 0.9], [13.5, -1.5], [13.4, -3.9],
  [12.4, -6.1], [9.6, -6.8], [6.6, -6.8], [3.4, -6.8], [0, -6.8], [-3.4, -6.8], [-6.6, -6.8], [-9.6, -6.8], [-12.4, -6.1], [-13.4, -3.9],
  [-13.5, -1.5], [-13.5, 0.9], [-13.4, 3.3], [-13.1, 5.4], [-11.4, 6.5], [-8.7, 6.7], [-5.8, 6.7], [-2.9, 6.6]];
// The frisbee field (the big blue oval on the map, where the old picnic lawn was): a mown oval, no tall grass, faint lines.
// rx along x, rz along z. The rack of frisbees stands at its west end by the main path.
export const FRISBEE_FIELD = { x: 23, z: -23.8, rx: 13.5, rz: 6 };
export function inFrisbeeField(x, z, pad = 0) {
  const F = FRISBEE_FIELD;
  return ((x - F.x) / (F.rx + pad)) ** 2 + ((z - F.z) / (F.rz + pad)) ** 2 < 1;
}
export const FRISBEE_RACK = { x: 8.1, z: -21.6, yaw: 1.75 }; // yaw: the way its front faces, toward the field
// Square trimmed box hedges along the north fence where the lawn arc runs (the gate to the Fish Shack), on the yard side, broken
// round the maple by the fence (YARD_TREES[6]). Solid: one box collider per run (hedges.js).
export const HEDGE = { z0: FENCE_Z + 0.18, z1: FENCE_Z + 1.1, h: 1.5 };
export const HEDGES = [{ x0: 6.6, x1: 19.9 }, { x0: 23.1, x1: 39.6 }];
export function hedgeAt(x, pad = 0) { return HEDGES.some(h => x > h.x0 - pad && x < h.x1 + pad); }

// The bocce court: long axis turned `rot` from +z (south) toward +x. See bocce-court.js.
export const BOCCE = { x: -104, z: 10, rot: 0.255 };
// Buddy and Carol (Andrew's parents, buddy-carol.js). Carol's wreath booth in Strickler Park: two pop-up canopies just south of
// the main park path, west of where the swing-tree path branches off. x, z = the middle of the booth; yaw = the way its front
// looks (toward the path, Three.js convention: forward = (sin yaw, cos yaw)). Plain numbers: lib/wreaths.js reads it too.
export const BOOTH = { x: -63.9, z: -14.25, yaw: 2.678, tripod: { x: -3.75, z: 2.05 }, reach: 2.6 };
// Their house: the Maple Row house nearest this x (no driveway of its own; buddy-carol.js adds a garage on its west side and
// the drive their blue pickup lives on).
export const CAROL_HOME = { x: -66, garage: 'west' };
// Strickler Park parking (park-lot): a small tar lot on the park side of Breneland Rd, north of the park path and the booth.
// A driveway runs south from the road (its apron across the sidewalk is part of road-net.js's paving: `drive`, cut at the
// sidewalk's back edge `cutZ`), then the lot: an aisle down the middle (`aisleX`) and bays either side, nose to the timber
// edge. `bays`: [x, z, yaw of a car parked nose-in]. world-town.js builds it into the town batch; park-lot.js parks cars.
export const PARK_LOT = {
  name: 'Strickler Park parking', road: 'breneland-rd',
  minX: -72.7, maxX: -56.3, minZ: -38.3, maxZ: -27.3,             // the lot's tar pad
  drive: { minX: -67.6, maxX: -61.4, minZ: -45.2, cutZ: -41 },     // the driveway (from inside the road's tar to the lot)
  aisleX: -64.5, bayW: 2.6, bayD: 4.8,
  bays: [[-59, -36.7, 1.5708], [-59, -34.1, 1.5708], [-59, -31.5, 1.5708], [-59, -28.9, 1.5708],
    [-70, -36.7, -1.5708], [-70, -34.1, -1.5708], [-70, -31.5, -1.5708], [-70, -28.9, -1.5708]],
  truckBay: 3, keepClear: 7,  // Buddy and Carol's bay (nearest the booth) and the one across the aisle they swing into
  sign: { x: -59.6, z: -40.0, yaw: Math.PI },                       // "Strickler Park parking", facing the road
};
// Buddy and Carol's blue pickup parks in the lot, reversed into its bay (nose west, toward the aisle) so it drives out forwards.
export const TRUCK_BAY = { x: -59, z: -28.9, yaw: -1.5708 };
// Joyce's house (joyce-day.js): the street house across Breneland Rd at this x (world.js STREET_HOUSES), her golf cart's
// strip and pad on its `pad` side (it has no driveway; the east side has a tree).
export const JOYCE_HOME = { x: -46, pad: 'west' };
// H. P. Lovecraft's house: his birthplace and boyhood home, 454 Angell Street, Providence, rebuilt on the corner lot
// inside Breneland Rd's bend by Strickler Park (Andrew's screenshot docs/refs/andrew-lovecraft-house-spot.png). x, z = the middle
// of the main block (w x d metres); its front (the porch and the door) faces south (+z) to Breneland Rd. `lot` = the raised lawn
// inside the fence: the front along z maxZ, a chamfer round the bend's corner from corner[0] to corner[1], the west side along x
// minX (all clear of the sidewalks' back edges). `gate` = the front gate's x (the steps up from the sidewalk). Arkham Horror is
// played in its parlour (games.json `venue: "lovecraft-house"`, lovecraft-house.js).
export const LOVECRAFT_HOUSE = { x: -88.2, z: -69.5, w: 11, d: 13, gate: { x: -86.4 }, // the gate is 2.4 m west of the door: the town's street lamp stands on the sidewalk at x -84
  lot: { minX: -98.2, maxX: -79.9, minZ: -88, maxZ: -57.3, corner: [[-91.5, -57.3], [-98.2, -67.8]] } };
export const SHORE_ROCKS = [
  { x: 53.5, z: -26, s: 1.3 }, { x: 57, z: -3, s: 1.0 }, { x: 47, z: 6.4, s: 0.9 },
  { x: -11.8, z: 17, s: 0.8 }, { x: 55.2, z: 3.6, s: 0.7 }, { x: 53, z: -31, s: 0.8 },
  { x: -60, z: 40, s: 1.1 }, { x: -96, z: 44, s: 0.9 }, { x: -125, z: 56, s: 1.2 },
];

// Round spots where no tree or grass may grow (the woods builder and the lawn read these). Add one per new clearing.
export const CLEARINGS = [
  { x: SCOUT_CAMP.x, z: SCOUT_CAMP.z, r: 9 }, { x: TENT.x, z: TENT.z, r: 4.5 }, { x: GLADE.x, z: GLADE.z, r: GLADE.r },
  { x: WATER_TOWER.x, z: WATER_TOWER.z, r: 12 }, // the legs splay to 8 m, the lamps and footings past them
  { x: OLD_TOWER_SITE.x, z: OLD_TOWER_SITE.z, r: 12 }, // the old site stays a clearing
  { x: -116, z: -141, r: 7.6 }, { x: -107.5, z: -141, r: 5.6 }, // the post office's lot
  { x: TOOL_CRIB.x, z: TOOL_CRIB.z + CRIB_FRONT * 3, r: 10 }, { x: TOOL_CRIB.x, z: TOOL_CRIB.z - CRIB_FRONT * 6, r: 7.5 }, // the Tool Crib's lot (crib-move)
  { x: -123, z: -94.75, r: 10.5 }, { x: -120.2, z: -108, r: 2 }, { x: -120.2, z: -112.5, r: 2 }, { x: -120.2, z: -117, r: 2 }, { x: -127.5, z: -107, r: 4.6 }, // the bus stop's plaza, its path, the lot's link
  { x: FISH_SHACK.x, z: FISH_SHACK.z, r: 4.2 }, { x: SWING_TREE.x, z: SWING_TREE.z, r: 9 }, { x: PARK.sign.x, z: PARK.sign.z, r: 2 },
  { x: BOCCE.x, z: BOCCE.z, r: 24 }, // the bocce court sits in an open meadow: no trees round it
  { x: -48, z: -12.1, r: 4 }, // just outside the park gate
  { x: TOY_BASKET.x, z: TOY_BASKET.z, r: 1.2 }, // the toy basket stands on short grass
  { x: FOUNTAIN.x, z: FOUNTAIN.z, r: FOUNTAIN.r * 1.5, fountain: true }, // no grass through the fountain's basin or its flagstone apron (3.5 m at r 2.4; world-edits.js keeps it on the fountain: town-fixes)
  ...LOGS.map(l => ({ x: l.x, z: l.z, r: l.len / 2 + 0.9 })),  // nor through the logs
  { x: (CAR_LOT.minX + CAR_LOT.maxX) / 2, z: (CAR_LOT.minZ + CAR_LOT.maxZ) / 2, r: 7 }, // the shops' lot
  { x: BOOTH.x, z: BOOTH.z, r: 5.5 }, // Carol's wreath booth stands on open grass
  { x: (PARK_LOT.minX + PARK_LOT.maxX) / 2, z: (PARK_LOT.minZ + PARK_LOT.maxZ) / 2, r: 10.2 }, // Strickler Park parking
  { x: (GARAGE.minX + GARAGE.maxX) / 2, z: (GARAGE.minZ + GARAGE.maxZ) / 2, r: 5.4 }, { x: (GARAGE.minX + GARAGE.maxX) / 2, z: GARAGE.minZ - 2.2, r: 3.4 }, // no grass in the garage or on its drive
  { x: -4.6, z: 7.1, r: 2.4 }, { x: -0.6, z: 7.1, r: 2.4 }, { x: HVAC.x, z: HVAC.z, r: 1.2 }, // nor through the deck or the air conditioner
];

// Location names shown in the HUD as you walk around. First match wins: circles (r) or boxes (min/max).
export const REGIONS = [
  { name: 'Front Porch', x: 0, z: -6, r: 5 },
  { name: 'Mailbox', x: 4.6, z: -38, r: 4 },
  { name: 'Fish Shack', x: 43.5, z: -32.8, r: 5 },
  { name: "Kevin's Pier", minX: 51, maxX: 64, minZ: -21, maxZ: -17 },
  { name: 'Oyster Cove', x: 8, z: 22, r: 16 },
  { name: 'Old Swing Tree', x: -64, z: 20, r: 8 },
  { name: 'Wreaths by Mama Carol', x: BOOTH.x, z: BOOTH.z, r: 5 },
  { name: 'Strickler Park parking', minX: PARK_LOT.minX - 0.5, maxX: PARK_LOT.maxX + 0.5, minZ: PARK_LOT.minZ - 0.5, maxZ: PARK_LOT.maxZ + 0.5 },
  { name: 'The Lovecraft House', minX: -98.7, maxX: -79.4, minZ: -88.5, maxZ: -57.1 }, // LOVECRAFT_HOUSE.lot, before Strickler Park's box
  { name: 'Bocce Court', x: -104, z: 10, r: 12 },
  { name: 'Water Tower', x: WATER_TOWER.x, z: WATER_TOWER.z, r: 12 }, // its clearing, before Summit Hill's box
  { name: 'Bus Stop', minX: -128.5, maxX: -112, minZ: -105, maxZ: -84.5 }, // the plaza, the shelter and the bay
  { name: 'Post Office', minX: MAIL_OFFICE.lot.minX, maxX: MAIL_OFFICE.lot.maxX, minZ: MAIL_OFFICE.lot.minZ, maxZ: MAIL_OFFICE.lot.maxZ }, // its lot, before Summit Hill's box
  { name: 'Summit Tunnel', minX: -199, maxX: -186, minZ: -133, maxZ: -120 }, // the road's end, before Summit Rd's box
  // (strip-mall) each store's own name inside its walls and on the walkway in front of it; the lot in front is The Shops' (mall-bigger:
  // before the woods' boxes, the back wall stands past z -96 now)
  { name: STRIP_MALL.units.pizza.name, minX: STRIP_MALL.units.pizza.minX - 0.3, maxX: STRIP_MALL.units.pizza.maxX, minZ: STRIP_MALL.walk.minZ, maxZ: STRIP_MALL.maxZ + 0.3 },
  { name: STRIP_MALL.units.clothes.name, minX: STRIP_MALL.units.clothes.minX, maxX: STRIP_MALL.units.clothes.maxX + 0.3, minZ: STRIP_MALL.walk.minZ, maxZ: STRIP_MALL.maxZ + 0.3 },
  { name: 'Scout Camp', x: -150, z: -16, r: 12 },
  { name: 'Mushroom Glade', x: GLADE.x, z: GLADE.z, r: GLADE.r + 1.5 },
  { name: 'The Deep Woods', minX: WOODS_WEST, maxX: -150, minZ: -96, maxZ: WOODS_SOUTH },
  { name: 'Strickler Woods', minX: -150, maxX: WOODS_X, minZ: -96, maxZ: WOODS_SOUTH },
  { name: 'Strickler Park', minX: -122, maxX: FENCE_WEST_X, minZ: -96, maxZ: 60 },
  { name: 'Game Store Loft', minX: GAME_STORE.x - GAME_STORE.w / 2, maxX: GAME_STORE.x + GAME_STORE.w / 2, minZ: GAME_STORE.z + GAME_STORE.d / 2 - GAME_STORE.loftD, maxZ: GAME_STORE.z + GAME_STORE.d / 2 },
  { name: 'Game Store', minX: GAME_STORE.x - GAME_STORE.w / 2 - 1, maxX: GAME_STORE.x + GAME_STORE.w / 2 + 1, minZ: GAME_STORE.z - GAME_STORE.d / 2 - 1.5, maxZ: GAME_STORE.z + GAME_STORE.d / 2 + 1 },
  // (the loft is over the back: the end away from the door; the porch is in front of the door. CRIB_FRONT: which way the door faces)
  { name: "Kevin's Loft", minX: TOOL_CRIB.x - TOOL_CRIB.w / 2, maxX: TOOL_CRIB.x + TOOL_CRIB.w / 2, minZ: Math.min(TOOL_CRIB.z - CRIB_FRONT * TOOL_CRIB.d / 2, TOOL_CRIB.z - CRIB_FRONT * (TOOL_CRIB.d / 2 - TOOL_CRIB.loftD - 0.2)), maxZ: Math.max(TOOL_CRIB.z - CRIB_FRONT * TOOL_CRIB.d / 2, TOOL_CRIB.z - CRIB_FRONT * (TOOL_CRIB.d / 2 - TOOL_CRIB.loftD - 0.2)) }, // (its footprint: nobody walks the stockroom under it)
  { name: "Kevin's Tool Crib", minX: TOOL_CRIB.x - TOOL_CRIB.w / 2 - 0.3, maxX: TOOL_CRIB.x + TOOL_CRIB.w / 2 + 0.3, minZ: TOOL_CRIB.z - TOOL_CRIB.d / 2 - (CRIB_FRONT < 0 ? 2.4 : 0.3), maxZ: TOOL_CRIB.z + TOOL_CRIB.d / 2 + (CRIB_FRONT > 0 ? 2.4 : 0.3) }, // (the porch too)
  { name: SUMMIT_SQUARE.name, minX: SUMMIT_SQUARE.minX - 0.3, maxX: SUMMIT_SQUARE.maxX + 0.3, minZ: SUMMIT_SQUARE.minZ - 0.5, maxZ: SUMMIT_SQUARE.maxZ + 0.5 }, // (before The Shops' box)
  { name: 'The Shops', minX: -192, maxX: -130, minZ: -122, maxZ: -93 },
  { name: 'Summit Rd', minX: -192, maxX: 66, minZ: -131, maxZ: -122 },
  { name: 'Summit Hill', minX: -192, maxX: 66, minZ: -172, maxZ: -131 },
  { name: 'Breneland Rd', minX: -60, maxX: 60, minZ: -53, maxZ: -40.2 },
  { name: 'Maple Row', minX: -110, maxX: 60, minZ: -122, maxZ: -53 },
  { name: 'Lake Tamakiya', minX: 52, maxX: 220, minZ: -220, maxZ: -6 },
  { name: 'Lake Rufallia', minX: -160, maxX: 200, minZ: 8, maxZ: 190 },
  { name: 'Picnic Lawn', minX: -38.6, maxX: -11.4, minZ: -36.7, maxZ: -22.9 }, // the north-lawn slot's block, +1 m
  { name: 'Frisbee Field', poly: Array.from({ length: 24 }, (_, i) => [FRISBEE_FIELD.x + Math.cos(i * Math.PI / 12) * (FRISBEE_FIELD.rx + 1), FRISBEE_FIELD.z + Math.sin(i * Math.PI / 12) * (FRISBEE_FIELD.rz + 1)]) },
  { name: 'Breneland', minX: FENCE_WEST_X, maxX: 60, minZ: FENCE_Z, maxZ: 40 },
];
export function regionAt(x, z) {
  for (const r of REGIONS) {
    if (r.poly ? pointInPolyL(x, z, r.poly) : r.r != null ? Math.hypot(x - r.x, z - r.z) < r.r : x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return r.name; // poly: a zone drawn in the World Editor (world-edits.js)
  }
  return 'Breneland';
}

// The strip of ground along the woods edge (older audio code places the woods bed along it).
export const WOODS_EDGE = [[WOODS_X, -96], [WOODS_X, 46]];

// Game plazas sit BESIDE the paths, never with a path through their middle: a trail that ends at a slot stops at the
// plaza's edge (facing the way it came), and a trail that passes a slot bends round the plaza's edge.
export const PLAZA_EDGE = 8.2;
export function resolveTrail(trail, slotsById) {
  // "slot:<id>@u,v": a plain point u m east and v m south of that slot (no plaza rim: the garden's gate)
  const raw = trail.pts.map(p => {
    if (typeof p !== 'string') return p;
    const [id, off] = p.slice(5).split('@'), s = slotsById[id];
    if (!s) return null;
    if (off) { const [u, v] = off.split(',').map(Number); return [s.x + u, s.z + v]; }
    return { slot: s };
  }).filter(Boolean);
  const pos = q => (q.slot ? [q.slot.x, q.slot.z] : q);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i];
    if (!q.slot) { out.push(q); continue; }
    const [cx, cz] = pos(q);
    const prev = i > 0 ? pos(raw[i - 1]) : null, next = i < raw.length - 1 ? pos(raw[i + 1]) : null;
    const toward = (p) => { const d = Math.hypot(p[0] - cx, p[1] - cz) || 1; return [cx + ((p[0] - cx) / d) * PLAZA_EDGE, cz + ((p[1] - cz) / d) * PLAZA_EDGE]; };
    if (prev && next) {
      // round the rim: in on the near side, a point out to the side, out on the far side
      const a = toward(prev), b = toward(next);
      let mx = (a[0] + b[0]) / 2 - cx, mz = (a[1] + b[1]) / 2 - cz;
      let d = Math.hypot(mx, mz);
      if (d < 0.5) { mx = -(b[1] - a[1]); mz = b[0] - a[0]; d = Math.hypot(mx, mz) || 1; } // straight through: go round one side
      out.push(a, [cx + (mx / d) * PLAZA_EDGE * 1.08, cz + (mz / d) * PLAZA_EDGE * 1.08], b);
    } else out.push(toward(prev || next));
  }
  return out;
}

function pointInPolyL(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
