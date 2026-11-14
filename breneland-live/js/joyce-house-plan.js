// Joyce's house (docs/briefs/joyce-house.md, Andrew's photo docs/refs/joyce-house/andrew-photo.png): the numbers only, no THREE, so
// joyce-day.js (her day, pure), the girlfriends' evenings (joyce-evening.js), the builder (joyce-house-build.js) and the tests all
// read one plan. World metres, +x east, +z south; the house faces south onto Breneland Rd at layout.js JOYCE_HOME.x.
//
//   the front (south), west to east: the two-car garage under a front gable (a cream up-and-over door, a coach lamp each side) and
//     the darker brick front with a recessed porch (the front door, a coach lamp) and the living room's window between dark shutters
//   inside the garage (players walk in by the side door on the west wall): the pink cart parked nose out, shelves, a workbench, the
//     inner door to the house (shut for players; Joyce comes and goes through it)
//   the house (seen, not entered): the living room behind the front window; the kitchen behind it; the dining room at the back;
//     a glass sun room across the back of the east half; the bedroom wing behind the garage (no inside)
//   the back yard: a black metal picket fence from the house's sides round the back (a gate on the east side), bushes along the
//     back, a small square cement patio off the back beside the sun room with a round gas firepit and four chairs round it
import { JOYCE_HOME } from './layout.js';

const X = JOYCE_HOME.x;                    // -46: the house's middle (the street row's spot)
const PI = Math.PI;

export const JH = (() => {
  const gy = 0.34;                         // the town's flat ground
  const FZ = -65.75, BZ = -75.75;          // the front and back walls' outer faces
  const minX = X - 6.6, maxX = X + 6.0;    // -52.6 .. -40
  const GX = X;                            // the wall between the garage and the house (its middle)
  const T = 0.15;                          // wall thickness
  const GY = 0.40, FY = 0.52;              // the garage's floor top, the house's floor top
  const EY = 3.15;                         // the eaves (the walls' top)
  const P = {
    x: X, gy, FZ, BZ, minX, maxX, GX, T, GY, FY, EY,
    box: { minX, maxX, minZ: BZ, maxZ: FZ },
    // the roof: the main ridge along x, a front gable over the garage
    roof: { ridgeZ: (FZ + BZ) / 2, rise: 2.0, over: 0.4, gx: (minX + GX) / 2, grise: 1.9, gover: 0.35 },
    // ---- the garage
    garage: {
      minX, maxX: GX, minZ: -72.4, maxZ: FZ,                                     // outside of its walls (its back wall is the bedroom wing's front)
      in: { minX: minX + T, maxX: GX - 0.075, minZ: -72.4 + 0.075, maxZ: FZ - T }, // the floor you walk on
      door: { x0: minX + 0.65, x1: GX - 0.65, h: 2.4 },                         // the big door's opening (x), its height over GY
      side: { z0: -67.4, z1: -66.45, h: 2.05 },                                  // the side door in the west wall (players come in here)
      inner: { z0: -71.6, z1: -70.75, h: 2.05 },                                 // the inner door to the house (the east wall), shut for players
    },
    // ---- the house's east half (open plan): living room at the front, the kitchen, the dining room at the back
    porch: { minX: GX, maxX: GX + 1.8, minZ: FZ - 1.4, maxZ: FZ },             // the recessed porch (the front door in its back wall)
    frontDoor: { x0: GX + 0.45, x1: GX + 1.35, z: FZ - 1.4, h: 2.1 },
    window: { x0: X + 2.3, x1: X + 4.7, y0: FY + 0.35, y1: FY + 2.2 },         // the living room's front window (a tall picture window)
    backOpen: { x0: GX + 0.4, x1: maxX - 0.6, h: 2.15 },                        // the wide opening from the dining room into the sun room
    hall: { z0: -73.95, z1: -73.1 },                                           // the closed door to the bedroom wing (the dining room's west wall)
    rooms: {
      living: { minX: GX + T / 2, maxX: maxX - T, minZ: -70.2, maxZ: FZ - T },
      kitchen: { minX: GX + T / 2, maxX: maxX - T, minZ: -72.9, maxZ: -70.2 },
      dining: { minX: GX + T / 2, maxX: maxX - T, minZ: BZ + T, maxZ: -72.9 },
    },
    wing: { minX, maxX: GX, minZ: BZ, maxZ: -72.4 },                            // the bedrooms (no inside)
    // ---- the sun room across the back of the east half
    sun: { minX: X - 1.6, maxX, minZ: BZ - 3.6, maxZ: BZ, knee: 0.42, top: 2.05, door: { z0: -77.95, z1: -77.05 } },
    // ---- outside
    patio: { minX: minX + 0.2, maxX: X - 1.62, minZ: BZ - 4.6, maxZ: BZ, y: 0.42 },
    pit: { x: X - 4.15, z: BZ - 2.3, r: 0.55, h: 0.42 },                       // the round gas firepit in the patio's middle
    drive: { minX: minX + 0.55, maxX: GX - 0.55, minZ: FZ, maxZ: -56.5, y: 0.39 }, // the concrete driveway to the garage door
    walk: { minX: GX - 0.5, maxX: GX + 1.6, minZ: FZ + 0.55, maxZ: -56.5, y: 0.385 }, // the front walk from the porch to the sidewalk
    // the fence: a run of black pickets from the house's west side round the back to its east side, a gate in the east end
    fence: { pts: [[minX, -73.6], [minX - 2.0, -73.6], [minX - 2.0, -90], [maxX + 2.4, -90], [maxX + 2.4, -73.6], [maxX, -73.6]],
      gate: { x0: maxX + 0.55, x1: maxX + 1.65, z: -73.6 }, h: 1.2 },
  };
  P.pit.y = P.patio.y;
  // the chairs round the firepit (the four corners of the patio's middle), facing the fire; seat 0 is Joyce's (nearest the sun room)
  P.chairs = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sz], i) => {
    const x = P.pit.x + sx * 1.12, z = P.pit.z + sz * 1.12;
    return { i, x, z, yaw: Math.atan2(P.pit.x - x, P.pit.z - z), y: P.patio.y, seatY: 0.3 }; // (seat-height: every seat in and round Joyce's house 0.3 up, they were 0.42-0.5)
  });
  // the sun room's seats: a loveseat (two) along its back wall, two wicker chairs and a rocker; seat 0 is Joyce's wicker chair
  const S = P.sun, sy = FY;
  P.sunTable = { x: X + 1.55, z: S.minZ + 1.9, r: 0.42 };
  const toTable = (x, z) => Math.atan2(P.sunTable.x - x, P.sunTable.z - z);
  P.sunSeats = [[X + 3.9, S.minZ + 1.2, 'wicker'], [X + 1.0, S.minZ + 0.75, 'love'], [X + 2.1, S.minZ + 0.75, 'love'], [X - 0.5, S.maxZ - 0.85, 'wicker'], [X + 1.55, S.maxZ - 0.75, 'rocker']]
    .map(([x, z, kind], i) => ({ i, x, z, yaw: kind === 'love' ? 0 : toTable(x, z), y: sy, seatY: 0.3, kind }));
  P.dogBed = { x: X + 5.1, z: S.minZ + 0.6, r: 0.42 };            // Molly's bed in the sun room's north-east corner
  // the dining table and its four chairs; the kitchen's counters (the west wall), the island; the living room's couch and armchair
  P.table = { x: X + 3.0, z: -74.35, r: 0.62 };
  P.dineSeats = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dz], i) => {
    const x = P.table.x + dx * 0.78, z = P.table.z + dz * 0.78;
    return { i, x, z, yaw: Math.atan2(P.table.x - x, P.table.z - z), y: FY, seatY: 0.3 };
  });
  P.counter = { minX: GX + T / 2, maxX: GX + 0.7, minZ: -72.9, maxZ: -71.75 };     // the sink's counter along the west wall (north of the inner door)
  P.counter2 = { minX: GX + 0.7, maxX: GX + 2.4, minZ: -72.9, maxZ: -72.35 };      // and the stove's along the kitchen's north side
  P.fridge = { minX: GX + T / 2, maxX: GX + 0.75, minZ: -70.6, maxZ: -69.9 };     // south of the inner door
  P.island = { minX: X + 2.1, maxX: X + 3.9, minZ: -71.85, maxZ: -71.0 };
  P.couch = { x: X + 3.5, z: -69.55, len: 2.1, yaw: 0 };             // its back to the kitchen, facing the front window
  P.armchair = { x: X + 1.45, z: -68.45, yaw: PI / 2 - 0.25 };        // by the west wall, facing the TV
  P.tv = { x: maxX - T - 0.25, z: -68.3 };                             // a console and a TV on the east wall
  P.lamp = { x: maxX - T - 0.35, z: FZ - T - 0.35 };                   // the floor lamp in the corner by the window
  // the doors' two sides (for walking through) and where Joyce comes and goes
  P.pts = {
    front: [GX + 0.9, FZ - 1.15],   // on the porch in front of the front door (joyce-day.js H.door)
    frontIn: [GX + 0.9, FZ - 2.0],  // inside it
    step: [GX + 0.9, FZ + 0.35],    // the porch's front edge (H.step)
    curb: [GX + 0.55, -54.6],       // the north sidewalk's middle at the front walk
    innerIn: [GX + 0.5, (P.garage.inner.z0 + P.garage.inner.z1) / 2],   // the inner door, the kitchen side
    innerOut: [GX - 0.55, (P.garage.inner.z0 + P.garage.inner.z1) / 2], // ...the garage side
    hall: [GX + 0.45, (P.hall.z0 + P.hall.z1) / 2],                     // the hall door to the bedrooms (Joyce to and from bed)
    sunDoorIn: [S.minX + 0.5, (S.door.z0 + S.door.z1) / 2],             // the sun room's door, inside
    sunDoorOut: [S.minX - 0.6, (S.door.z0 + S.door.z1) / 2],            // ...on the patio
    gateOut: [(P.fence.gate.x0 + P.fence.gate.x1) / 2, P.fence.gate.z + 0.7],  // the yard gate, the street side
    gateIn: [(P.fence.gate.x0 + P.fence.gate.x1) / 2, P.fence.gate.z - 0.8],   // ...the yard side
    sideYard: [(P.fence.gate.x0 + P.fence.gate.x1) / 2, -55.3],         // the east side yard at the sidewalk
  };
  // the cart's spot in the garage: nose out (facing the street), in the east bay, the driver's side (east) toward the inner door
  P.park = { x: GX - 2.35, z: -69.55, yaw: 0 };
  return P;
})();

// Joyce's spots indoors (and Molly's beside her): { x, z, yaw, anim, seatY?, room, molly: { x, z, yaw, anim } }
const D = JH, Xo = X;
export const ROOM_SPOTS = {
  couch: { room: 'living', x: D.couch.x - 0.45, z: D.couch.z - 0.05, yaw: 0, anim: 'sit', seatY: 0.3, molly: { x: Xo + 4.7, z: -67.3, yaw: 0.4, anim: 'lie' } },
  armchair: { room: 'living', x: D.armchair.x, z: D.armchair.z, yaw: D.armchair.yaw, anim: 'sit', seatY: 0.3, molly: { x: D.armchair.x + 0.35, z: D.armchair.z + 0.85, yaw: 1.2, anim: 'lie' } },
  window: { room: 'living', x: Xo + 3.4, z: -66.5, yaw: 0, anim: 'look', molly: { x: Xo + 4.2, z: -66.7, yaw: 0.2, anim: 'sit' } },
  stove: { room: 'kitchen', x: Xo + 1.55, z: -71.95, yaw: PI, anim: 'tinker', molly: { x: Xo + 1.7, z: -71.0, yaw: PI, anim: 'sit' } },
  sink: { room: 'kitchen', x: Xo + 1.05, z: -72.25, yaw: -PI / 2, anim: 'reach', molly: { x: Xo + 1.9, z: -70.9, yaw: -PI / 2, anim: 'lie' } },
  island: { room: 'kitchen', x: Xo + 3.0, z: -70.55, yaw: PI, anim: 'tinker', molly: { x: Xo + 4.3, z: -70.5, yaw: PI, anim: 'sit' } },
  table: { room: 'dining', x: D.dineSeats[0].x, z: D.dineSeats[0].z, yaw: D.dineSeats[0].yaw, anim: 'sit', seatY: 0.3, molly: { x: D.table.x + 1.25, z: D.table.z + 0.75, yaw: PI, anim: 'lie' } },
  sunroom: { room: 'sun', x: D.sunSeats[0].x, z: D.sunSeats[0].z, yaw: D.sunSeats[0].yaw, anim: 'sit', seatY: 0.3, molly: { x: D.dogBed.x, z: D.dogBed.z, yaw: -2.4, anim: 'loaf', bed: true } },
};
// which spots she uses when (the 15-minute slots of her home hours pick one by hash)
export const ROOM_POOLS = {
  morning: ['stove', 'table', 'table', 'sink', 'island'],                    // breakfast
  day: ['sunroom', 'sunroom', 'couch', 'armchair', 'table', 'stove', 'sink', 'island', 'window'],
  late: ['couch', 'couch', 'armchair', 'sunroom'],                            // after the evening, before bed
};
export const BED_H = 22.5;          // she goes to bed (the hall door) at 22:30 and is up at 6 for her walk
export const MOLLY_BED = { x: D.dogBed.x, z: D.dogBed.z, yaw: -2.4 };

// ---------------------------------------------------------------- her evenings (Andrew: Joyce is very social)
// A weekly pattern by the Eastern weekday (0 = Sunday), the same for every player by the shared clock. Her girlfriends are
// townswomen from the cast (town-life.js residents, npc-looks.js): Marge, Rosa, Lena, Nia, Kim and Ada.
//   firepit   round the gas firepit on the patio, chatting; then they walk home
//   sunroom   in the sun room with tea
//   walk      a group walk: one lap of the town's sidewalks at a stroll, from her front walk and back
//   bocce     a game at the Strickler Park court, two against two
//   quiet     Joyce out back alone by the firepit with Molly
export const EVENING = {
  //  the window the girlfriends' own days give way to (on the 10-minute slots of town-life.js), Joyce's evening inside it
  from: 19 + 40 / 60, to: 21 + 20 / 60,
  start: 19.75, end: 21.05,          // Joyce out (or the door open) 19:45, the evening over at about 21:03
  week: [
    { kind: 'quiet', friends: [] },                                   // Sunday: Joyce and Molly by the fire
    { kind: 'firepit', friends: ['marge', 'rosa', 'lena'] },          // Monday
    { kind: 'walk', friends: ['kim', 'ada'] },                        // Tuesday
    { kind: 'sunroom', friends: ['marge', 'nia', 'lena', 'rosa'] },   // Wednesday
    { kind: 'bocce', friends: ['marge', 'nia', 'kim'] },              // Thursday
    { kind: 'firepit', friends: ['rosa', 'nia', 'ada'] },             // Friday
    { kind: 'firepit', friends: ['lena', 'kim'] },                    // Saturday
  ],
};
export const weekdayOfDay = day => (((day + 4) % 7) + 7) % 7;   // easternDay -> getDay() numbering (tool-crib-plan.js's rule)
export const eveningOfDay = day => EVENING.week[weekdayOfDay(day)];
export const FIRE_LINES = ['Pass the marshmallows, Marge.', 'Isn\'t this nice?', 'Molly, you old sweetheart.', 'Kevin waved at me today. Well. Sort of.', 'These petunias are the best yet.', 'Who wants more cocoa?', 'Did you hear about the carnival?', 'Ha! Stop it.', 'Oh, I know!', 'My tomatoes are coming in lovely.'];
export const SUN_LINES = ['More tea, anyone?', 'This lemon cake is divine.', 'Ha! Oh, stop.', 'Molly, off the cushions.', 'Pat was late with the mail again.', 'I said the same thing!', 'Look at that sunset.', 'Oh, I know!'];
export const WALK_LINES = ['Lovely evening for it.', 'Slow down, Joyce!', 'Look at those geraniums.', 'Hello there!', 'Molly, leave it.'];
export const BOCCE_LINES = ['Nice shot!', 'Oh, so close.', 'Kiss the pallino, Marge!', 'That one\'s ours.', 'Ha! Measure it!', 'Beginner\'s luck.'];
