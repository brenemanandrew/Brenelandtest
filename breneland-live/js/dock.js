// The boat dock area: Kevin's sailboat, two rowboats, buoys, crab traps, a bench and Kevin.
// Kevin gives you the rod, and the water off the dock is where you fish.
import * as THREE from 'three';
import { propsReady, addProp } from './props-static.js';
import { GEO } from './batch.js';
import { toon, shadows } from './toon.js';
import { terrainHeight } from './terrain.js';
import { DOCK } from './layout.js';
import { dressDock } from './fish-dock.js';
import { dressDockLawn } from './dock-lawn.js';
import { buildKevinBoat } from './kevin-boat.js';
import { buildRowboats } from './rowboats.js';
import { addBenchSeats } from './seats.js';
import { NPCS, npcSpec } from './npc-looks.js';
import { fishShackModel, fishShackMesh, fishShackColliders } from './fish-shack-model.js';   // (fish-shack-setpiece) the Blender pier and props, when the set piece loaded

// Kevin. His look lives in npc-looks.js (the NPC Editor dresses him).
export const KEVIN = NPCS.kevin.look;

export const dockPlaceholder = ({ b, group, x, z, rnd, colliders, updaters }) => {
  // Kevin's sailboat (kevin-boat.js) and his "Gone fishing" sign. Where they are is kevin-day.js, a pure function of the
  // shared clock. npcs.js steps them every frame (kevinFrame) and puts Kevin in the boat.
  buildKevinBoat({ group, colliders });
  // buoys
  const buoys = [];
  for (const [bx, bz, c] of [[77, -31, '#ff5a3a'], [70, -13, '#ffffff'], [64, -10, '#ff5a3a']]) { // (clear of where the bigger boat backs out and turns: kevin-day.js PIVOT)
    const bu = new THREE.Mesh(GEO.sphere, toon(c));
    bu.scale.setScalar(0.35); bu.position.set(bx, 0.1, bz);
    buoys.push(bu); group.add(bu);
  }
  updaters.push((dt, t) => { buoys.forEach((bu, i) => { bu.position.y = 0.08 + Math.sin(t * 1.6 + i) * 0.08; }); });
  // (fish-shack-setpiece) the Blender pier (its planks' top at DOCK.y, the pilings where world.js stood them) and the props on the
  // boards and the lawn (the buckets, the crate, the cooler, the ropes, the net, the pots, the traps, the life ring), with their
  // colliders from the model's anchors; fish-dock.js, dock-lawn.js and world.js then leave their code-built ones out
  const M = fishShackModel();
  if (M) { group.add(fishShackMesh('pier', 'dock-pier'), fishShackMesh('props', 'dock-props')); for (const c of fishShackColliders('dock')) colliders.push(c); }
  else {
    // crab traps
    for (const [cx, cz] of [[47.0, -23.9], [47.8, -24.7]]) { // inside the lawn's ring path, off the way to the pier
      b.add(GEO.box, '#6b8a9a', { x: cx, y: terrainHeight(cx, cz) + 0.25, z: cz, sx: 0.7, sy: 0.5, sz: 0.5, ry: cx });
    }
    colliders.push({ type: 'circle', x: 47.4, z: -24.3, r: 0.8 }); // (clear of the ring path)
  }
  // the bench
  const bx = x + 2.5, bz = z + 2.8, by = terrainHeight(bx, bz);
  if (propsReady('bench_plank')) addProp(b, 'bench_plank', { x: bx, y: by, z: bz, yaw: Math.PI }, { skin: 'dock' }); // (props-static: the Blender plank bench, its back to +z)
  else {
    b.add(GEO.box, '#b98a5a', { x: bx, y: by + 0.26, z: bz, sx: 1.6, sy: 0.08, sz: 0.45 }); // (seat-height: the seat 0.3 up, was 0.4)
    b.add(GEO.box, '#b98a5a', { x: bx, y: by + 0.54, z: bz + 0.2, sx: 1.6, sy: 0.4, sz: 0.06 });
    for (const s of [-1, 1]) b.add(GEO.box, '#8a6240', { x: bx + s * 0.7, y: by + 0.11, z: bz, sx: 0.08, sy: 0.22, sz: 0.4 });
  }
  colliders.push({ type: 'box', minX: bx - 0.85, maxX: bx + 0.85, minZ: bz - 0.3, maxZ: bz + 0.3 });
  addBenchSeats(bx, bz - 0.05, by + 0.3, Math.PI, 'dock bench'); // faces the water (its back is on the +z side)
  dressDock({ b, group, colliders, updaters }); // the sign, the bucket, the crate, the gull (fish-dock.js)
  dressDockLawn({ b, group, colliders, updaters }); // the lantern post, bench, crab pots, net and gulls (dock-lawn.js)
  buildRowboats({ b, group, colliders, updaters }); // two rowboats: one tied along the pier's south side, one on the red buoy (rowboats.js)
  return {
    // the dock is a place, not a table waiting for a game: no "coming soon" sign, label, prompt or toast (areas.js, main.js)
    noSign: true, place: true, letter: 'go fishing with Kevin',
    npcs: [{ ...npcSpec('kevin'), seat: { x: DOCK.maxX - 1.2, z: (DOCK.minZ + DOCK.maxZ) / 2, y: DOCK.y, anim: 'fish', yaw: Math.PI / 2 } }],
    lines: ['Nothing biting yet.', 'Big one got away.', 'Tide\'s coming in.', 'Shhh. Fish.'],
    idle: ['fish'],
    pairs: [['talk', 'talk'], ['wave', 'wave']],
  };
};
