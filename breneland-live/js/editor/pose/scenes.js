// The Pose Editor's scenes (pose-editor, Andrew 2026-11-10): named spots in the real town, each a box the camera is locked inside.
// One list, easy to extend: add an entry with its numbers from layout.js (or a building's plan) and it shows in the picker.
//
// An entry:
//   id, name, icon        the picker's tile (icon: one of pose-ui.js ICON's names)
//   at: [x, z]            the orbit's middle on the ground (the floor's height is found there: terrain.js groundHeight, or `floor`)
//   floor                 (optional) the floor's height when groundHeight does not know it (the water tower's catwalk)
//   up                    how far over the floor the camera looks (m)
//   box: [minX, maxX, minZ, maxZ, lo, hi]   where the camera may be: world x and z, y from the floor + lo to the floor + hi
//   view: { yaw, pitch, dist, fov }         the opening shot (yaw 0 = the camera south of `at` looking north; pitch up from level)
//   shots: [{ name, yaw, pitch, dist, fov, at? }]   a few saved camera shots (at: [x, y, z] another middle, y over the floor)
//   spots: [[x, z, yaw], ...]               where the people go in turn as they are added (yaw: the way they face, forward = (sin, cos))
//   hour                  the time of day it opens at (Eastern, 0-24; 'sunset': a quarter hour before today's sunset)
import { HOUSE, PORCH, DOCK, FISH_SHACK, STRIP_MALL, GAME_STORE, SUMMIT_SQUARE, WATER_TOWER, LOVECRAFT_HOUSE } from '../../layout.js';
import { CRIB, toWorld, worldYaw } from '../../tool-crib-plan.js';
import { PLAN as STORE } from '../../game-store-build.js';
import { backroomPlan } from '../../game-store-backroom.js';
import { FY as LC_FY, H1 as LC_H1, IU as LC_IU, IV as LC_IV, BV as LC_BV, PU as LC_PU, TABLE as LC_TABLE } from '../../lovecraft-plan.js';

const PI = Math.PI;
const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z); // the yaw that faces (tx, tz) from (x, z)

// Kevin's spot at the register (the crib's plan frame turned to the world), and a customer's across the counter
const till = (() => { const [x, z] = toWorld(CRIB.K.till[0], CRIB.K.till[1]); return [x, z, worldYaw(CRIB.K.till[2])]; })();
const cust = (() => { const [x, z0] = toWorld(CRIB.K.cust[0], CRIB.K.cust[1]), z = z0 + 0.5; return [x, z, Math.atan2(till[0] - x, till[1] - z)]; })(); // (a customer across the counter, a step toward the door: the camera sees past them)
const cribIn = (() => { const [x0, z0] = toWorld(CRIB.iMinX, CRIB.iMinZ), [x1, z1] = toWorld(CRIB.iMaxX, CRIB.zP); return [Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)]; })();
const cribDoor = CRIB.world.door;
const BR = backroomPlan(STORE);
const M = STRIP_MALL, PZ = M.units.pizza, PT = M.units.clothes;
const LCX = LOVECRAFT_HOUSE.x, LCZ = LOVECRAFT_HOUSE.z;
const TW = WATER_TOWER;

export const SCENES = [
  {
    id: 'house', name: 'Breneland house, inside', icon: 'house', at: [-1.5, 1.2], floor: HOUSE.floorY, up: 1.1, hour: 19,
    box: [HOUSE.hall.minX + 0.3, HOUSE.hall.maxX - 0.3, HOUSE.hall.minZ + 0.3, HOUSE.hall.maxZ - 0.3, 0.4, HOUSE.ceilY - HOUSE.floorY - 0.2],
    view: { yaw: -2.6, pitch: 0.12, dist: 4.2, fov: 55 },
    shots: [{ name: 'Living room', yaw: -2.6, pitch: 0.12, dist: 4.2, fov: 55 }, { name: 'From the door', yaw: 3.1, pitch: 0.18, dist: 4.8, fov: 60 }, { name: 'Close', yaw: -2.9, pitch: 0.05, dist: 2.2, fov: 40 }],
    spots: [[-1.5, 1.6, PI], [0.2, 0.4, -PI / 2], [-3, 0.2, PI / 2], [1.2, 2.4, PI], [-2.4, 2.6, PI]],
  },
  {
    id: 'yard', name: 'Breneland house, the yard', icon: 'yard', at: [0, -10], up: 1.1, hour: 16,
    box: [-40, 50, -38, -4.2, 0.4, 14],
    view: { yaw: PI, pitch: 0.16, dist: 9, fov: 50 },
    shots: [{ name: 'The porch', yaw: PI, pitch: 0.14, dist: 9, fov: 50 }, { name: 'The lawn', yaw: 2.4, pitch: 0.35, dist: 14, fov: 50 }, { name: 'Low', yaw: 3.6, pitch: 0.04, dist: 6, fov: 35 }],
    spots: [[0, -9, PI], [1.6, -10, -2.6], [-1.6, -10, 2.6], [0, -6, PI], [3, -12, -2.2]],
  },
  {
    id: 'crib', name: 'The Tool Crib, inside', icon: 'crib', at: [(till[0] + cust[0]) / 2, till[1]], floor: CRIB.fy, up: 1.1, hour: 10,
    box: [cribIn[0] + 0.3, cribIn[1] - 0.3, cribIn[2] + 0.3, cribIn[3] - 0.3, 0.4, 4.4],
    view: { yaw: 0.3, pitch: 0.1, dist: 3.0, fov: 50 },
    shots: [{ name: 'The register', yaw: 0.3, pitch: 0.1, dist: 3.0, fov: 50 }, { name: 'The shop', yaw: 2.4, pitch: 0.3, dist: 6.5, fov: 60 }, { name: 'Over the counter', yaw: 1.57, pitch: 0.08, dist: 2.2, fov: 40 }],
    spots: [[till[0], till[1], till[2]], [cust[0], cust[1], cust[2]], [cust[0] + 0.6, cust[1] + 1.0, cust[2] - 0.5], [cust[0] + 1.6, cust[1] - 0.6, -PI / 2], [cust[0] + 2.2, cust[1] + 1.4, -2.4]],
  },
  {
    id: 'crib-front', name: 'The Tool Crib, out front', icon: 'crib', at: [cribDoor.x, cribDoor.z + 4], up: 1.1, hour: 9,
    box: [CRIB.world.minX - 10, CRIB.world.maxX + 10, cribDoor.z + 0.6, cribDoor.z + 16, 0.4, 10],
    view: { yaw: 0, pitch: 0.18, dist: 9, fov: 50 },
    shots: [{ name: 'The porch', yaw: 0, pitch: 0.18, dist: 9, fov: 50 }, { name: 'Down the street', yaw: 0.9, pitch: 0.1, dist: 11, fov: 40 }],
    spots: [[cribDoor.x, cribDoor.z + 3.2, 0], [cribDoor.x + 1.5, cribDoor.z + 3.6, -1.6], [cribDoor.x - 1.5, cribDoor.z + 3.6, 1.6], [cribDoor.x + 0.8, cribDoor.z + 5, PI], [cribDoor.x - 0.8, cribDoor.z + 5, PI]],
  },
  {
    id: 'slice', name: 'Summit Slice', icon: 'pizza', at: [PZ.door.x, M.minZ + 6], floor: M.walk.y, up: 1.1, hour: 18,
    box: [PZ.minX + 0.5, PZ.maxX - 0.5, M.minZ + 0.5, M.maxZ - 0.5, 0.4, 3.6],
    view: { yaw: PI, pitch: 0.14, dist: 4.5, fov: 55 },
    shots: [{ name: 'The counter', yaw: PI, pitch: 0.14, dist: 4.5, fov: 55 }, { name: 'The tables', yaw: 0.3, pitch: 0.2, dist: 5, fov: 55 }],
    spots: [[PZ.door.x, M.minZ + 7, PI], [PZ.door.x + 1.2, M.minZ + 5, -2.4], [PZ.door.x - 1.2, M.minZ + 5, 2.4], [PZ.door.x, M.minZ + 3.5, 0], [PZ.door.x + 2, M.minZ + 8, PI]],
  },
  {
    id: 'threads', name: 'Peak Threads', icon: 'shirt', at: [PT.door.x, M.minZ + 6], floor: M.walk.y, up: 1.1, hour: 14,
    box: [PT.minX + 0.5, PT.maxX - 0.5, M.minZ + 0.5, M.maxZ - 0.5, 0.4, 3.6],
    view: { yaw: PI, pitch: 0.14, dist: 4.5, fov: 55 },
    shots: [{ name: 'The racks', yaw: PI, pitch: 0.14, dist: 4.5, fov: 55 }, { name: 'The mirror', yaw: -0.5, pitch: 0.12, dist: 4, fov: 50 }],
    spots: [[PT.door.x, M.minZ + 6, PI], [PT.door.x + 1.2, M.minZ + 5, -2.4], [PT.door.x - 1.2, M.minZ + 5, 2.4], [PT.door.x, M.minZ + 3.5, 0], [PT.door.x - 2, M.minZ + 8, PI]],
  },
  {
    id: 'mall-walk', name: 'The strip mall, out front', icon: 'pizza', at: [(PZ.door.x + PT.door.x) / 2, M.walk.minZ + 1.2], up: 1.1, hour: 19,
    box: [M.minX - 4, M.maxX + 4, M.lot.minZ - 6, M.minZ - 0.3, 0.4, 9],
    view: { yaw: PI, pitch: 0.14, dist: 6.5, fov: 50 },
    shots: [{ name: 'The shop fronts', yaw: PI, pitch: 0.14, dist: 6.5, fov: 50 }, { name: 'Under the canopy', yaw: -1.9, pitch: 0.06, dist: 6, fov: 45 }],
    spots: [[PZ.door.x + 2, M.walk.minZ + 1.2, 0], [PZ.door.x + 3.4, M.walk.minZ + 1.2, -PI / 2], [PT.door.x, M.walk.minZ + 1.2, 0], [PT.door.x - 1.4, M.walk.minZ + 1.2, PI / 2], [PZ.door.x + 2.6, M.walk.minZ - 1, 0]],
  },
  {
    id: 'store', name: 'The game store', icon: 'dice', at: [STORE.sx, STORE.minZ + 5.5], floor: STORE.floorY, up: 1.1, hour: 15,
    box: [STORE.iMinX + 0.3, STORE.iMaxX - 0.3, STORE.iMinZ + 0.3, STORE.zL - 0.3, 0.4, 5.6],
    view: { yaw: 0.2, pitch: 0.2, dist: 6, fov: 55 },
    shots: [{ name: 'The tables', yaw: 0.2, pitch: 0.2, dist: 6, fov: 55 }, { name: 'Clem\'s counter', yaw: -1.4, pitch: 0.12, dist: 3.6, fov: 50, at: [STORE.clem.x - 0.8, 1.1, STORE.clem.z] }],
    spots: [[STORE.clem.x, STORE.clem.z, STORE.clem.yaw], [STORE.clem.x - 1.6, STORE.clem.z, PI / 2], [STORE.sx, STORE.minZ + 5.5, PI], [STORE.sx - 1, STORE.minZ + 6, 2.4], [STORE.sx + 1, STORE.minZ + 6, -2.4]],
  },
  {
    id: 'backroom', name: 'The D&D back room', icon: 'd20', at: [BR.table.x, BR.table.z], floor: STORE.floorY, up: 1.0, hour: 20,
    box: [BR.room.minX + 0.3, BR.room.maxX - 0.3, BR.room.minZ + 0.3, BR.room.maxZ - 0.3, 0.4, BR.room.ceil - STORE.floorY - 0.15],
    view: { yaw: 0.0, pitch: 0.3, dist: 3.6, fov: 60 },
    shots: [{ name: 'The table', yaw: 0.0, pitch: 0.3, dist: 3.6, fov: 60 }, { name: 'The DM\'s end', yaw: -1.57, pitch: 0.18, dist: 3, fov: 55 }],
    spots: BR.seats.slice(0, 5).map(s => [s.x, s.z, s.yaw]),
  },
  {
    id: 'lovecraft', name: 'The Lovecraft house', icon: 'tentacle', at: [LCX + LC_TABLE.u, LCZ + LC_TABLE.v], floor: LC_FY, up: 1.1, hour: 21,
    box: [LCX - LC_IU + 0.3, LCX + LC_PU - 0.3, LCZ + LC_BV + 0.4, LCZ + LC_IV - 0.3, 0.4, LC_H1 - 0.3],
    view: { yaw: 0.4, pitch: 0.2, dist: 3.6, fov: 55 },
    shots: [{ name: 'The parlour', yaw: 0.4, pitch: 0.2, dist: 3.6, fov: 55 }, { name: 'By the fire', yaw: 2.8, pitch: 0.1, dist: 3, fov: 50 }],
    spots: [[LCX + LC_TABLE.u, LCZ + LC_TABLE.v + 1.2, PI], [LCX + LC_TABLE.u + 1.2, LCZ + LC_TABLE.v, -PI / 2], [LCX + LC_TABLE.u - 1.2, LCZ + LC_TABLE.v, PI / 2], [LCX + LC_TABLE.u, LCZ + LC_TABLE.v - 1.2, 0], [LCX + LC_TABLE.u + 1.6, LCZ + LC_TABLE.v + 1.6, -2.4]],
  },
  {
    id: 'pier', name: 'The fish shack and the pier', icon: 'fish', at: [(DOCK.minX + DOCK.maxX) / 2 - 3, (DOCK.minZ + DOCK.maxZ) / 2], floor: DOCK.y, up: 1.1, hour: 7,
    box: [FISH_SHACK.x - 10, DOCK.maxX + 8, FISH_SHACK.z - 8, DOCK.maxZ + 14, 0.3, 14],
    view: { yaw: 0.6, pitch: 0.16, dist: 9, fov: 50 },
    shots: [{ name: 'The pier', yaw: 0.6, pitch: 0.16, dist: 9, fov: 50 }, { name: 'The shack', yaw: -0.4, pitch: 0.2, dist: 8, fov: 50, at: [FISH_SHACK.x, 1.1, FISH_SHACK.z + 4] }, { name: 'From the water', yaw: 1.7, pitch: 0.05, dist: 7, fov: 40 }],
    spots: [[DOCK.maxX - 2, (DOCK.minZ + DOCK.maxZ) / 2, PI / 2], [DOCK.maxX - 4, (DOCK.minZ + DOCK.maxZ) / 2, PI / 2], [DOCK.minX + 2, (DOCK.minZ + DOCK.maxZ) / 2, -PI / 2], [FISH_SHACK.x, FISH_SHACK.z + 4, 0], [FISH_SHACK.x + 2, FISH_SHACK.z + 5, -0.8]],
  },
  {
    id: 'tower', name: 'The top of the water tower', icon: 'tower', at: [TW.x - 7.6, TW.z], tower: 48, up: 1.1, hour: 'sunset',
    box: [TW.x - 26, TW.x + 26, TW.z - 26, TW.z + 26, -6, 24],
    view: { yaw: -1.2, pitch: 0.12, dist: 5, fov: 50 },
    shots: [{ name: 'Sunset', yaw: -1.2, pitch: 0.12, dist: 5, fov: 50 }, { name: 'The town below', yaw: 1.6, pitch: 0.42, dist: 7, fov: 55 }, { name: 'Wide', yaw: -0.8, pitch: 0.25, dist: 14, fov: 45 }],
    spots: [[TW.x - 7.6, TW.z, -PI / 2], [TW.x - 7.4, TW.z + 1.6, -PI / 2 - 0.2], [TW.x - 7.4, TW.z - 1.6, -PI / 2 + 0.2], [TW.x - 5.4, TW.z + 5.4, -PI * 0.75], [TW.x - 5.4, TW.z - 5.4, -PI * 0.25]],
  },
  {
    id: 'maple', name: 'Maple Row', icon: 'street', at: [-16.2, -80], up: 1.1, hour: 11,
    box: [-48, 8, -104, -60, 0.4, 12],
    view: { yaw: -1.4, pitch: 0.1, dist: 6, fov: 45 },
    shots: [{ name: 'The sidewalk', yaw: -1.4, pitch: 0.1, dist: 6, fov: 45 }, { name: 'Up the street', yaw: 0.1, pitch: 0.12, dist: 10, fov: 40 }, { name: 'High', yaw: -1.0, pitch: 0.6, dist: 12, fov: 50 }],
    spots: [[-16.2, -79.4, PI], [-16.2, -80.8, 0], [-15.4, -82.6, -0.5], [-17, -77.6, PI], [-15.6, -84, 0]],
  },
  {
    id: 'square', name: 'Summit Square', icon: 'tree', at: [SUMMIT_SQUARE.shelter.x, SUMMIT_SQUARE.shelter.z - 3.6], floor: SUMMIT_SQUARE.y, up: 1.1, hour: 13,
    box: [SUMMIT_SQUARE.minX - 8, SUMMIT_SQUARE.maxX + 8, SUMMIT_SQUARE.minZ - 10, SUMMIT_SQUARE.maxZ + 4, 0.4, 12],
    view: { yaw: 2.5, pitch: 0.2, dist: 7, fov: 50 },
    shots: [{ name: 'The shelter', yaw: 2.5, pitch: 0.2, dist: 7, fov: 50 }, { name: 'From the back', yaw: 0.3, pitch: 0.16, dist: 9, fov: 45, at: [SUMMIT_SQUARE.shelter.x, 1.1, SUMMIT_SQUARE.shelter.z] }],
    spots: [[SUMMIT_SQUARE.shelter.x, SUMMIT_SQUARE.shelter.z - 3.4, PI], [SUMMIT_SQUARE.shelter.x + 1.3, SUMMIT_SQUARE.shelter.z - 4.2, -2.2], [SUMMIT_SQUARE.shelter.x - 1.3, SUMMIT_SQUARE.shelter.z - 4.2, 2.2], [SUMMIT_SQUARE.shelter.x, SUMMIT_SQUARE.shelter.z - 5.4, 0], [SUMMIT_SQUARE.shelter.x + 2.4, SUMMIT_SQUARE.shelter.z - 5.6, -0.8]],
  },
  {
    id: 'lake', name: 'The lake', icon: 'wave', at: [20, 4.5], up: 1.1, hour: 'sunset',
    box: [-12, 52, -6, 40, 0.3, 16],
    view: { yaw: PI, pitch: 0.1, dist: 7, fov: 45 },
    shots: [{ name: 'The shore', yaw: PI, pitch: 0.1, dist: 7, fov: 45 }, { name: 'Over the water', yaw: 0, pitch: 0.12, dist: 8, fov: 45 }],
    spots: [[20, 4.5, 0], [21.4, 4.4, -0.3], [18.6, 4.4, 0.3], [20, 2.6, PI], [23, 3.4, -0.8]],
  },
];

export const sceneById = id => SCENES.find(s => s.id === id) || null;
