// Where you are, for the music: the area (lake and dock, woods, town north of the yard, the yard), whether you're inside the game
// store or the Lovecraft house, fishing, and whether the house has its storm. main.js sets audio.musicApi.place = musicPlace(ctx).
// Cheap, music.js asks four times a second. The store's back room (D&D night) is its own place, and a seat at a store table counts
// as a table in play. backroomAt() says where the back room's sound reaches you: 'room', 'shop' (muffled through the door) or 'out'.
// Kevin's Tool Crib (its feature's inside(), both floors) is the interior 'crib': his radio is the music there (crib-sound.js).
import { COAST, DOCK, WOODS_X, STREET, PARK, lakeAt } from './layout.js';
import { closestOnPoly } from './util.js';

export const LAKE_NEAR = 11;   // metres from the water that still count as the lake (the porch is 14, the Fish Shack 10)
export function areaAt(x, z) {
  if (x > DOCK.minX - 2 && x < DOCK.maxX + 2 && z > DOCK.minZ - 4 && z < DOCK.maxZ + 4) return 'lake';
  if (lakeAt(x, z)) return 'lake';
  if (x < WOODS_X && z > PARK.minZ) return 'woods';   // Strickler woods is the park's west end, the game store north of it is town
  if (z < STREET.sidewalkS + 2) return 'town';   // north of the yard: the street, the neighbourhood, the shops, the Lovecraft house
  const c = closestOnPoly(x, z, COAST, false);
  return c[2] < LAKE_NEAR * LAKE_NEAR ? 'lake' : 'yard';
}
/** where you stand for the back room's sound: 'room', 'shop' or 'out'; `store` is the game store feature */
export function backroomAt(store, x, y, z, seated = false) {
  const R = store?.back?.plan?.room, LY = store?.plan?.LY;
  if (!R) return 'out';
  if (seated || (x > R.minX && x < R.maxX && z > R.minZ - 0.05 && z < R.maxZ && (LY === undefined || y < LY - 1))) return 'room';
  return store.inside?.() ? 'shop' : 'out';
}
export function musicPlace(ctx) {
  const feat = {};
  const f = name => feat[name] || (feat[name] = ctx.features?.find(x => x.name === name) || null);
  return () => {
    const p = ctx.player?.pos;
    if (!p) return null;
    const store = f('store'), lc = f('lovecraft'), fish = f('fishing'), dnd = f('dnd'), crib = f('toolcrib'), ms = f('mall-staff');
    const inStore = !!store?.inside?.(), back = inStore && backroomAt(store, p.x, p.y, p.z, (dnd?.seat ?? -1) >= 0) === 'room';
    const interior = back ? 'backroom' : inStore ? 'store' : lc?.inside?.() ? 'lovecraft' : crib?.inside?.() ? 'crib' : ms?.inside?.() ? 'party' : null;   // (party: in Summit Slice while the late party is on)
    const sat = store?.sitting, table = sat && sat.table && sat.table !== 'dnd' && (store.plan?.tables || []).some(t => t.id === sat.table) ? sat.table : null;
    const st = fish ? (fish.state ?? fish.debug?.state) : null;   // fishing.js keeps its state on the feature's always-present hook
    return { area: areaAt(p.x, p.z), interior, fishing: !!st && st !== 'off', storm: !!lc?.open, table };
  };
}
