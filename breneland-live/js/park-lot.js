// Strickler Park parking: the cars in the lot by the park (layout.js PARK_LOT, world-town.js builds the lot itself). Which
// bays hold a car, and what car, is a pure function of the shared clock: a seeded set of 1-3 cars per Eastern hour, more on
// weekends and in the evening, in the bays Buddy and Carol's pickup doesn't use. The cars are car-models.js kinds merged into
// one static batch (rebuilt only when the hour's set changes), each with a box collider that's off while its bay is empty.
import * as THREE from 'three';
import { PARK_LOT } from './layout.js';
import { hash01 } from './util.js';
import { hourAt } from './npcs-day.js';
import { easternDay } from './wreath-data.js';
import { Batcher } from './batch.js';
import { addCarModel, CAR_KINDS, CAR_COLORS, carSpec } from './car-models.js';
import { TAR_Y } from './road-net.js';

// the bays other cars may use (the truck's bay and the one it swings into are left free)
export const FREE_BAYS = PARK_LOT.bays.map((b, i) => i).filter(i => i !== PARK_LOT.truckBay && i !== PARK_LOT.keepClear);

// The lot at shared time t: { slot, cars: [{ bay, x, z, yaw, kind, color }] } (sorted by bay). Pure.
export const slotAt = t => easternDay(t * 1000) * 24 + Math.floor(hourAt(t));
export function lotCarsAt(t) {
  const h = hourAt(t), day = easternDay(t * 1000), slot = day * 24 + Math.floor(h);
  const dow = ((day + 4) % 7 + 7) % 7, weekend = dow === 0 || dow === 6;
  const busy = weekend || (h >= 17 && h < 22), night = h < 6 || h >= 23;
  const r = hash01('lot-n', slot);
  const n = night ? 1 : busy ? 2 + (r < 0.55 ? 1 : 0) : 1 + (r < 0.45 ? 1 : 0);
  const order = FREE_BAYS.map(i => [hash01('lot-bay', slot, i), i]).sort((a, b) => a[0] - b[0]).slice(0, n).map(p => p[1]).sort((a, b) => a - b);
  return {
    slot,
    cars: order.map(i => {
      const [x, z, yaw] = PARK_LOT.bays[i];
      // a car parked a little off the bay's centre line now and then, nose to the kerb stop
      const kind = CAR_KINDS[Math.floor(hash01('lot-kind', slot, i) * CAR_KINDS.length)];
      const color = CAR_COLORS[Math.floor(hash01('lot-col', slot, i) * CAR_COLORS.length)];
      const L = carSpec(kind).L, fx = Math.sin(yaw);
      const back = PARK_LOT.bayD / 2 - 0.62 - L / 2;                           // nose ~0.62 m short of the bay's head
      return { bay: i, x: x + fx * back, z: z + (hash01('lot-off', slot, i) - 0.5) * 0.3, yaw, kind, color };
    }),
  };
}
// A parked car's footprint box (they all sit square to the axes): { minX, maxX, minZ, maxZ }
export function carBox(c, pad = 0) {
  const L = carSpec(c.kind).L, along = Math.abs(Math.sin(c.yaw)) > 0.7, hx = (along ? L / 2 : 0.92) + pad, hz = (along ? 0.92 : L / 2) + pad;
  return { minX: c.x - hx, maxX: c.x + hx, minZ: c.z - hz, maxZ: c.z + hz };
}

export function createParkLot(ctx) {
  const { scene, colliders, net } = ctx;
  const group = new THREE.Group(); group.name = 'park-lot-cars'; scene.add(group);
  // one collider per free bay, off while the bay is empty
  const cols = new Map(FREE_BAYS.map(i => { const c = { type: 'box', minX: 0, maxX: 0, minZ: 0, maxZ: 0, off: true, noCrowd: true, parkLot: i, moves: true }; colliders.push(c); return [i, c]; }));
  let slot = null, meshes = [], state = null;
  function rebuild(s) {
    for (const m of meshes) { m.parent?.remove(m); m.geometry.dispose(); }
    meshes = [];
    const b = new Batcher({ vertexColors: true });
    for (const c of s.cars) addCarModel(b, c.x, TAR_Y, c.z, c.yaw, c.kind, c.color);
    meshes = s.cars.length ? b.build(group, 'park-lot-cars') : [];
    // (rebuilt each hour, so not a 'baked' mesh for camera-fade.js: no ghost copy that would outlive its batch)
    for (const m of meshes) { m.receiveShadow = false; m.matrixAutoUpdate = true; }
    for (const [i, col] of cols) {
      const c = s.cars.find(q => q.bay === i);
      col.off = !c;
      if (c) Object.assign(col, carBox(c, 0.05));
    }
  }
  function update() {
    const t = net.serverNow() / 1000;
    if (slotAt(t) === slot) return; // (nothing to do inside an hour: no per-frame work or garbage)
    const s = lotCarsAt(t);
    slot = s.slot; state = s; rebuild(s);
  }
  update();
  return {
    name: 'parklot',
    update,
    api: { lotCarsAt, carBox, FREE_BAYS, get state() { return state; }, get group() { return group; }, colliders: () => [...cols.values()] },
  };
}
