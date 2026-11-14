// Dax and Nala's dog beds: two round beds on the porch (layout.js DOG_BEDS, the +x half), plus the big oval one indoors.
// Each is a ring bolster round a dished cushion, a size up from its dog. The dogs nap in them (npcs.js nap spots).
// A small collider each, flagged so crowd.js leaves them alone (it'd push a napping dog out) and dog-toys.js keeps clear.
import * as THREE from 'three';
import { DOG_BEDS, PORCH, INDOOR_DOG_BED as IB, HOUSE } from './layout.js';
import { toon } from './toon.js';

export const BED = { R: 0.76, tube: 0.165, squash: 0.82, dish: 0.07 };   // ring centre radius, bolster radius (flattened), the cushion's top above the boards
BED.outer = BED.R + BED.tube;
BED.inner = BED.R - BED.tube;
BED.crest = BED.tube * 2 * BED.squash;

// How high above the boards a dog standing at (x, z) is: the cushion's top inside a bed, over the bolster's hump when it
// steps across the ring, 0 off the beds. A pure function of the position, so every screen lifts a dog the same.
export function bedLift(x, z) {
  for (const b of DOG_BEDS) {
    const r = Math.hypot(x - b.x, z - b.z);
    if (r >= BED.outer + 0.1) continue;
    if (r <= BED.inner) return BED.dish;
    // over the ring: the bolster's top at this radius (a flattened circle), fading to the boards past its outer edge
    const d = Math.abs(r - BED.R);
    const top = d < BED.tube ? BED.tube * BED.squash * (1 + Math.sqrt(1 - (d / BED.tube) * (d / BED.tube))) : 0;
    const fade = r > BED.outer ? 1 - (r - BED.outer) / 0.1 : 1;
    return Math.max(BED.dish * fade, top * 0.6);   // (a soft cushion gives: the paws sink into the bolster rather than ride its crest)
  }
  return bigBedLift(x, z) ?? 0;
}
// Which bed (index) a spot is in, or -1 (the big bed indoors is index DOG_BEDS.length).
export function bedAt(x, z) {
  for (let i = 0; i < DOG_BEDS.length; i++) if (Math.hypot(x - DOG_BEDS[i].x, z - DOG_BEDS[i].z) <= BED.inner) return i;
  return inBigBed(x, z) <= 1 - IB.tube / IB_R ? DOG_BEDS.length : -1;
}
// The big oval bed in the living room (layout INDOOR_DOG_BED), big enough for Dax and Nala together.
// q = where (x, z) is across it: 0 in the middle, 1 on the bolster's crest line.
const IB_R = (IB.rx + IB.rz) / 2;
const inBigBed = (x, z) => Math.sqrt(((x - IB.x) / IB.rx) ** 2 + ((z - IB.z) / IB.rz) ** 2);
function bigBedLift(x, z) {
  const q = inBigBed(x, z), r = q * IB_R, outer = IB_R + IB.tube;
  if (r >= outer + 0.1) return null;
  if (r <= IB_R - IB.tube) return BED.dish;
  const d = Math.abs(r - IB_R), top = d < IB.tube ? IB.tube * BED.squash * (1 + Math.sqrt(1 - (d / IB.tube) ** 2)) : 0;
  const fade = r > outer ? 1 - (r - outer) / 0.1 : 1;
  return Math.max(BED.dish * fade, top * 0.6);
}

export function createDogBeds(ctx) {
  const { scene, colliders } = ctx;
  const ring = new THREE.TorusGeometry(BED.R, BED.tube, 10, 28);
  const dish = new THREE.CylinderGeometry(BED.R + 0.02, BED.R - 0.06, BED.dish, 28);
  const button = new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10);
  const meshes = [];
  for (const b of DOG_BEDS) {
    const g = new THREE.Group(); g.name = 'dog-bed'; g.position.set(b.x, PORCH.y, b.z);
    const bolster = new THREE.Mesh(ring, toon(b.color)); bolster.rotation.x = Math.PI / 2; bolster.scale.z = BED.squash; bolster.position.y = BED.tube * BED.squash;
    const cushion = new THREE.Mesh(dish, toon(b.dish)); cushion.position.y = BED.dish / 2;
    const tuft = new THREE.Mesh(button, toon(b.color)); tuft.position.y = BED.dish + 0.005;   // a stitched button in the middle (the quilting)
    g.add(bolster, cushion, tuft);
    for (const m of [bolster, cushion, tuft]) { m.castShadow = true; m.receiveShadow = true; meshes.push(m); }
    scene.add(g);
    colliders.push({ type: 'circle', x: b.x, z: b.z, r: BED.inner, noCrowd: true, bed: true });
  }
  // the big bed indoors: the same bolster and cushion, stretched to an oval, in the house's soft browns
  {
    const g = new THREE.Group(); g.name = 'dog-bed-big'; g.position.set(IB.x, HOUSE.floorY, IB.z);
    const ring2 = new THREE.TorusGeometry(IB_R, IB.tube, 10, 36), dish2 = new THREE.CylinderGeometry(IB_R + 0.02, IB_R - 0.06, BED.dish, 36);
    const bolster = new THREE.Mesh(ring2, toon(IB.color)); bolster.rotation.x = Math.PI / 2; bolster.scale.set(IB.rx / IB_R, IB.rz / IB_R, BED.squash); bolster.position.y = IB.tube * BED.squash;
    const cushion = new THREE.Mesh(dish2, toon(IB.dish)); cushion.scale.set(IB.rx / IB_R, 1, IB.rz / IB_R); cushion.position.y = BED.dish / 2;
    g.add(bolster, cushion);
    for (const m of [bolster, cushion]) { m.castShadow = false; m.receiveShadow = false; meshes.push(m); }
    scene.add(g);
    colliders.push({ type: 'circle', x: IB.x, z: IB.z, r: Math.min(IB.rx, IB.rz) - IB.tube, noCrowd: true, bed: true, big: true });
  }
  return { name: 'dogbeds', beds: DOG_BEDS, big: IB, meshes, BED, lift: bedLift, at: bedAt };
}
