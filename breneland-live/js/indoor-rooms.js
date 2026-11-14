// The rooms with a roof over them: one list of boxes (x, z and a floor to a ceiling height) that the weather keeps out of. No
// drops or splashes are drawn inside one, no snow or wet sheen on what is in one, and with the camera in one the mist and the
// leaves go, the fog keeps to the outside, the rain and the wind are heard muffled, a flash of lightning is softer
// (weather-fx.js, weather-cover.js, weather-sfx.js, weather.js all read this list).
// Our house, the garage and the porch are here from layout.js; a building that works out its own plan adds itself when it is
// built (game-store.js: the shop and its back room; lovecraft-house.js), so the next building is one line:
//   addRoom({ id: 'post-office', minX, maxX, minZ, maxZ, y0: floor, y1: ceiling })
// The box is the outside of the walls; y1 is under the roof (snow on the roof stays), y0 the floor. A gabled room's ceiling
// rises to its ridge: gable 'x' (the ridge runs along x over the middle, so it climbs with z) or 'z', `pitch` (m up per m in)
// from y1 at the walls. pad: how far outside the walls a camera still counts as in (a follow camera pressed against the house).
// open: true (town-fixes) for a roof with no walls (Summit Square's shelter): the drops, the splashes, the snow and the wet keep out
// from under it, but a camera under it is still outdoors (no muffled rain, no fog pushed back, the mist and leaves stay).
import * as THREE from 'three';
import { HOUSE, GARAGE, PORCH } from './layout.js';

// The shaders hold this many (a uniform array has a fixed size, and the shaders are compiled at boot, before the buildings add
// their rooms, so growing it later would mean recompiling every patched material: a hitch). 8 were taken and a ninth addRoom was
// dropped with only a console.warn, so it rained inside (town-fixes raised it to 10 for Summit Square's shelter; flaky-suites-2:
// 16, nearly 2x the 9 in use). The loops stop at ROOM_N (the slots in use), so a spare slot costs nothing, and 32 vec4 uniforms
// are far inside any GPU WebGL2 runs on. Past 16 addRoom says so with console.error (the test harness counts it as a page error)
// and lists the room in ROOMS_DROPPED (store-dry-test reads it).
export const ROOMS_MAX = 16;

export const ROOMS = [
  // (the living room's ceiling is vaulted up under the roof; the roof's eave is at HOUSE.eaveY, its ridge along x: house.js)
  { id: 'house', minX: HOUSE.minX, maxX: HOUSE.maxX, minZ: HOUSE.minZ, maxZ: HOUSE.maxZ, y0: HOUSE.floorY, y1: HOUSE.eaveY - 0.15, gable: 'x', pitch: HOUSE.pitch, pad: 0.5 },
  { id: 'garage', minX: GARAGE.minX, maxX: GARAGE.maxX, minZ: GARAGE.minZ, maxZ: GARAGE.maxZ, y0: GARAGE.floorY, y1: HOUSE.eaveY - 0.15, gable: 'z', pitch: HOUSE.pitch, pad: 0.3 },
  { id: 'porch', minX: PORCH.minX, maxX: PORCH.maxX, minZ: PORCH.minZ, maxZ: PORCH.maxZ, y0: PORCH.y, y1: PORCH.ceilY, pad: 0.3 },
];

// The same boxes for the shaders: A = (minX, minZ, maxX, maxZ), B = (y0, y1, pitch, gable: 0 none, 1 'x', 2 'z'); an unused
// slot can never hold a point
export const ROOM_A = Array.from({ length: ROOMS_MAX }, () => new THREE.Vector4(1, 1, -1, -1));
export const ROOM_B = Array.from({ length: ROOMS_MAX }, () => new THREE.Vector4(1, -1, 0, 0));
export const ROOM_N = { value: 0 }; // (a uniform object every shader shares: how many slots are in use)
export const ROOMS_DROPPED = []; // ids addRoom had no slot for (should stay empty: tests read it)
function pack() {
  for (let i = 0; i < ROOMS_MAX; i++) {
    const r = ROOMS[i];
    if (r) { ROOM_A[i].set(r.minX, r.minZ, r.maxX, r.maxZ); ROOM_B[i].set(r.y0, r.y1, r.gable ? r.pitch || 0 : 0, r.gable === 'x' ? 1 : r.gable === 'z' ? 2 : 0); }
    else { ROOM_A[i].set(1, 1, -1, -1); ROOM_B[i].set(1, -1, 0, 0); }
  }
  ROOM_N.value = Math.min(ROOMS.length, ROOMS_MAX);
}
pack();

// Add a room, or move one already here with the same id
export function addRoom(r) {
  const room = { pad: 0.3, ...r };
  const i = ROOMS.findIndex(q => q.id === room.id);
  if (i >= 0) ROOMS[i] = room;
  else if (ROOMS.length < ROOMS_MAX) ROOMS.push(room);
  else { // loud: the building would get weather indoors
    if (!ROOMS_DROPPED.includes(room.id)) ROOMS_DROPPED.push(room.id);
    console.error(`indoor-rooms: no slot for room '${room.id}' (ROOMS_MAX ${ROOMS_MAX} all taken): it will rain inside; raise ROOMS_MAX`);
    return null;
  }
  pack();
  return room;
}

// How high a room's ceiling is over x, z (its gable climbing to the ridge)
export function ceilAt(r, x, z) {
  if (r.gable === 'x') return r.y1 + r.pitch * Math.max(0, (r.maxZ - r.minZ) / 2 - Math.abs(z - (r.minZ + r.maxZ) / 2));
  if (r.gable === 'z') return r.y1 + r.pitch * Math.max(0, (r.maxX - r.minX) / 2 - Math.abs(x - (r.minX + r.maxX) / 2));
  return r.y1;
}

// The room a point is in (the walls' box; pad m more round it and over the ceiling, and half a metre under the floor), or
// null. pad true: each room's own (for a camera: an open roof is not a room then)
export function roomAt(x, y, z, pad = 0) {
  for (const r of ROOMS) {
    if (pad === true && r.open) continue;
    const p = pad === true ? r.pad : pad;
    if (x > r.minX - p && x < r.maxX + p && z > r.minZ - p && z < r.maxZ + p && y > r.y0 - 0.5 && y < ceilAt(r, x, z) + p) return r;
  }
  return null;
}

// GLSL: `float <name>(vec3 p)`, 1 inside any room, as roomAt (the same boxes; uniforms <A> and <B>, ROOMS_MAX each, bound to
// ROOM_A / ROOM_B, and the int <A>N bound to ROOM_N: roomUniforms(A, B) makes all three). pad: the drops' streaks are this long, so one that starts just outside a wall or over the ceiling would
// poke into the room
export const roomsGlsl = (name, A, B, pad = 0) => /* glsl */`
uniform vec4 ${A}[${ROOMS_MAX}], ${B}[${ROOMS_MAX}];
uniform int ${A}N;
float ${name}(vec3 p) {
  const float pad = ${pad.toFixed(3)};
  for (int i = 0; i < ${ROOMS_MAX}; i++) {
    if (i >= ${A}N) break; // (only the slots in use)
    vec4 a = ${A}[i], b = ${B}[i];
    if (p.x <= a.x - pad || p.x >= a.z + pad || p.z <= a.y - pad || p.z >= a.w + pad || p.y <= b.x - 0.5) continue;
    float top = b.y;
    if (b.w > 0.5) top += b.z * max(0.0, b.w < 1.5 ? (a.w - a.y) * 0.5 - abs(p.z - (a.y + a.w) * 0.5) : (a.z - a.x) * 0.5 - abs(p.x - (a.x + a.z) * 0.5));
    if (p.y < top + pad) return 1.0;
  }
  return 0.0;
}
`;

// The uniforms roomsGlsl(name, A, B) reads, for a material's uniforms (shared objects: addRoom updates every shader)
export const roomUniforms = (A, B) => ({ [A]: { value: ROOM_A }, [B]: { value: ROOM_B }, [A + 'N']: ROOM_N });
