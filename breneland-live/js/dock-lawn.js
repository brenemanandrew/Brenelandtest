// The dock lawn's dressing, either side of the trail to the pier: a lantern post, a bench facing the water, a bait bucket,
// rope, crab pots, a net drying on a rail and two gulls. Everything still goes into the areas Batcher, only the gulls' heads move.
import * as THREE from 'three';
import { propsReady, addProp } from './props-static.js';
import { GEO } from './batch.js';
import { toon, soft, GRADIENT_3 } from './toon.js';
import { terrainHeight } from './terrain.js';
import { DOCK } from './layout.js';
import { lampGlow, addNightSpot } from './daynight-mats.js';
import { addBenchSeats } from './seats.js';
import { addGull } from './fish-dock.js';
import { fishShackModel } from './fish-shack-model.js';   // (fish-shack-setpiece) the props are the Blender set piece's when it loaded

// Where things stand. The pier trail runs east-west through z = -19 here (layout.js TRAILS 'pier', 1.5 m wide), so
// the north cluster sits above z = -15 .. -17.5 and the south one below z = -20.5; nothing is on the path.
const LANTERN = { x: 40.0, z: -17.3 };          // north of the trail
const BENCH = { x: 42.4, z: -16.1, yaw: Math.PI / 2 }; // facing east, down the trail to the pier and the water
const BUCKET = { x: 42.6, z: -14.6 };
const ROPE = { x: 41.0, z: -15.6 };
const POTS = { x: 42.6, z: -21.9 };
const NET = { x: 39.7, z: -22.35 }; // (0.2 m in from the ring path and the dock trail)

const DARK = '#3a3f47', WOOD = '#6b4428', WOOD2 = '#5a3a22', ROPE_C = '#d9c7a0';

export function dressDockLawn({ b, group, colliders, updaters }) {
  lanternPost(b, colliders);
  bench(b, colliders);
  if (!fishShackModel()) { baitBucket(b, colliders); ropeCoil(b, colliders); crabPots(b, colliders); }   // (the model's stand in the same places, their colliders from its anchors: dock.js)
  dryingNet(b, group, colliders);
  // gulls on the pilings nearer the shore (the pilings' tops: world.js buildDock, y - 1.2 + 1.6)
  addGull(b, group, updaters, DOCK.minX + 1, DOCK.y + 0.4, DOCK.minZ + 0.15, -2.3, 1.7);
  addGull(b, group, updaters, DOCK.minX + 4, DOCK.y + 0.4, DOCK.maxZ - 0.15, 0.7, 4.1);
}

// A wooden post with a short arm and a hanging lantern: pale glass by day, a warm pool of light on the path at night.
function lanternPost(b, colliders) {
  const { x, z } = LANTERN, y = terrainHeight(x, z);
  const ax = Math.sin(0.55), az = Math.cos(0.55);  // the arm reaches south-east, over the edge of the trail
  if (propsReady('dock_lantern')) { // (props-static: the Blender post; its arm reaches its +z, turned 0.55 like the old one's)
    addProp(b, 'dock_lantern', { x, y, z, yaw: 0.55 }, { skin: 'walnut' });
    const lx = x + ax * 0.56, lz = z + az * 0.56;
    addNightSpot({ x: lx, y: y + 2.23, z: lz, color: '#ffd98e', pool: 3.6, poolK: 0.6, gy: y, halo: 1.0, flicker: 0.2 });
    colliders.push({ type: 'circle', x, z, r: 0.22 });
    return;
  }
  b.add(GEO.box, WOOD2, { x, y: y + 0.09, z, sx: 0.34, sy: 0.18, sz: 0.34 });
  b.add(GEO.cyl8, WOOD, { x, y: y + 1.4, z, sx: 0.09, sy: 2.8, sz: 0.09 });
  b.add(GEO.box, WOOD, { x: x + ax * 0.28, y: y + 2.62, z: z + az * 0.28, sx: 0.1, sy: 0.1, sz: 0.66, ry: 0.55 });
  b.add(GEO.box, WOOD, { x: x + ax * 0.2, y: y + 2.42, z: z + az * 0.2, sx: 0.07, sy: 0.07, sz: 0.5, ry: 0.55, rx: 0.78 }); // the brace
  const lx = x + ax * 0.56, lz = z + az * 0.56;
  b.add(GEO.cyl6, DARK, { x: lx, y: y + 2.5, z: lz, sx: 0.02, sy: 0.14, sz: 0.02 });     // the chain
  b.add(GEO.cone6, DARK, { x: lx, y: y + 2.4, z: lz, sx: 0.17, sy: 0.1, sz: 0.17 });       // the cap
  b.add(GEO.box, lampGlow('#ffd98e'), { x: lx, y: y + 2.23, z: lz, sx: 0.16, sy: 0.24, sz: 0.16 }); // the glass
  for (const k of [-1, 1]) { b.add(GEO.box, DARK, { x: lx + k * 0.085, y: y + 2.23, z: lz, sx: 0.015, sy: 0.26, sz: 0.015 }); b.add(GEO.box, DARK, { x: lx, y: y + 2.23, z: lz + k * 0.085, sx: 0.015, sy: 0.26, sz: 0.015 }); }
  b.add(GEO.box, DARK, { x: lx, y: y + 2.1, z: lz, sx: 0.2, sy: 0.03, sz: 0.2 });
  addNightSpot({ x: lx, y: y + 2.23, z: lz, color: '#ffd98e', pool: 3.6, poolK: 0.6, gy: y, halo: 1.0, flicker: 0.2 });
  colliders.push({ type: 'circle', x, z, r: 0.22 });
}

// A plank bench like the park's, facing the way the trail goes down to the pier. Two seats (seats.js).
function bench(b, colliders) {
  const { x, z, yaw } = BENCH, y = terrainHeight(x, z), c = Math.cos(yaw), s = Math.sin(yaw);
  addBenchSeats(x, z, y + 0.3, yaw, 'dock bench'); // (seat-height: the seat 0.3 up, was 0.4)
  const alongX0 = Math.abs(s) > 0.7;
  if (propsReady('bench_plank')) { addProp(b, 'bench_plank', { x, y, z, yaw }, { skin: 'dock' }); colliders.push(alongX0 ? { type: 'box', minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.9, maxZ: z + 0.9 } : { type: 'box', minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.4, maxZ: z + 0.4 }); return; } // (props-static)
  b.add(GEO.box, '#b98a5a', { x, y: y + 0.265, z, sx: 1.7, sy: 0.07, sz: 0.45, ry: yaw });
  b.add(GEO.box, '#b98a5a', { x: x - s * 0.22, y: y + 0.56, z: z - c * 0.22, sx: 1.7, sy: 0.4, sz: 0.06, ry: yaw });
  for (const k of [-0.7, 0.7]) b.add(GEO.box, '#8a6240', { x: x + c * k, y: y + 0.115, z: z - s * k, sx: 0.08, sy: 0.23, sz: 0.42, ry: yaw });
  const alongX = Math.abs(s) > 0.7; // the bench's length runs along z when it faces east or west
  colliders.push(alongX ? { type: 'box', minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.9, maxZ: z + 0.9 } : { type: 'box', minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.4, maxZ: z + 0.4 });
}

// A galvanised bucket with a rope handle and something wriggly in it, by the bench.
function baitBucket(b, colliders) {
  const { x, z } = BUCKET, y = terrainHeight(x, z);
  b.add(GEO.cyl12, '#aab4bd', { x, y: y + 0.17, z, sx: 0.2, sy: 0.34, sz: 0.2 });
  b.add(GEO.cyl12, '#dfe6ec', { x, y: y + 0.345, z, sx: 0.215, sy: 0.03, sz: 0.215 });
  b.add(GEO.cyl12, '#5a4030', { x, y: y + 0.335, z, sx: 0.17, sy: 0.02, sz: 0.17 });
  b.add(new THREE.TorusGeometry(0.19, 0.012, 5, 14, Math.PI), WOOD, { x, y: y + 0.34, z, ry: 1.2 });
  for (const [wx, wz] of [[0.05, 0.03], [-0.06, -0.02], [0.0, -0.07]]) b.add(GEO.sphere, '#e39a86', { x: x + wx, y: y + 0.36, z: z + wz, sx: 0.035, sy: 0.02, sz: 0.06, ry: wx * 9 });
  colliders.push({ type: 'circle', x, z, r: 0.24 });
}

function ropeCoil(b, colliders) {
  const { x, z } = ROPE, y = terrainHeight(x, z);
  for (let i = 0; i < 4; i++) b.add(new THREE.TorusGeometry(0.24 - i * 0.025, 0.045, 6, 14), ROPE_C, { x, y: y + 0.05 + i * 0.07, z, rx: Math.PI / 2 });
  b.add(GEO.cyl6, ROPE_C, { x: x + 0.3, y: y + 0.045, z: z + 0.12, sx: 0.04, sy: 0.5, sz: 0.04, rz: Math.PI / 2, ry: -0.5 }); // the loose end
  colliders.push({ type: 'circle', x, z, r: 0.28 });
}

// Three wire crab pots, two side by side and one across the top, a float tied to the stack.
function crabPots(b, colliders) {
  const { x, z } = POTS, y = terrainHeight(x, z);
  const pot = (px, py, pz, ry) => {
    const w = 0.72, h = 0.42, d = 0.5;
    b.add(GEO.box, '#6b8a9a', { x: px, y: py + h / 2, z: pz, sx: w - 0.04, sy: h - 0.04, sz: d - 0.04, ry });
    for (const [kx, kz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const ox = kx * (w / 2 - 0.03), oz = kz * (d / 2 - 0.03);
      b.add(GEO.box, DARK, { x: px + ox * Math.cos(ry) + oz * Math.sin(ry), y: py + h / 2, z: pz - ox * Math.sin(ry) + oz * Math.cos(ry), sx: 0.05, sy: h, sz: 0.05, ry });
    }
    for (const yy of [0.025, h - 0.025]) {
      for (const kz of [-1, 1]) b.add(GEO.box, DARK, { x: px + kz * (d / 2 - 0.025) * Math.sin(ry), y: py + yy, z: pz + kz * (d / 2 - 0.025) * Math.cos(ry), sx: w, sy: 0.05, sz: 0.05, ry });
      for (const kx of [-1, 1]) b.add(GEO.box, DARK, { x: px + kx * (w / 2 - 0.025) * Math.cos(ry), y: py + yy, z: pz - kx * (w / 2 - 0.025) * Math.sin(ry), sx: 0.05, sy: 0.05, sz: d, ry });
    }
    b.add(GEO.box, '#3a4a55', { x: px, y: py + h / 2, z: pz, sx: 0.26, sy: 0.14, sz: d + 0.02, ry }); // the funnel mouth, a darker slot
  };
  pot(x - 0.4, y, z, 0.12);
  pot(x + 0.42, y, z + 0.08, -0.08);
  pot(x + 0.02, y + 0.42, z + 0.03, Math.PI / 2 + 0.1);
  // an orange float on a short rope, hung off the top pot
  b.add(GEO.cyl6, ROPE_C, { x: x + 0.3, y: y + 0.62, z: z - 0.34, sx: 0.015, sy: 0.5, sz: 0.015, rx: 0.5 });
  b.add(GEO.sphere, '#ff8a3a', { x: x + 0.3, y: y + 0.4, z: z - 0.52, sx: 0.12, sy: 0.16, sz: 0.12 });
  colliders.push({ type: 'box', minX: x - 0.85, maxX: x + 0.85, minZ: z - 0.4, maxZ: z + 0.42 });
}

// A net draped over a rail between two posts to dry, cork floats along its bottom edge. The net itself is a
// knotted mesh painted on a canvas (plain strokes, no filters) on two sheets that hang out from the rail.
function dryingNet(b, group, colliders) {
  const { x, z } = NET, y = terrainHeight(x, z), yaw = -0.85;  // the rail runs north-west to south-east, seen from the trail and from the boards
  const c = Math.cos(yaw), s = Math.sin(yaw), half = 0.8, top = 1.75, tilt = 0.14;
  for (const k of [-half, half]) b.add(GEO.cyl8, WOOD, { x: x + s * k, y: y + top / 2, z: z + c * k, sx: 0.07, sy: top, sz: 0.07 });
  b.add(GEO.cyl8, WOOD2, { x, y: y + top - 0.02, z, sx: 0.045, sy: half * 2 + 0.3, sz: 0.045, rx: Math.PI / 2, ry: yaw });
  const mat = new THREE.MeshToonMaterial({ map: netTexture(), gradientMap: GRADIENT_3, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, color: '#d6ccb0' });
  mat.name = 'dock-net';
  const w = half * 2 - 0.35, h = 1.2;
  for (const side of [-1, 1]) {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 1), mat);
    sheet.geometry.translate(0, -h / 2, 0); // hang from the rail
    sheet.position.set(x, y + top - 0.02, z);
    sheet.rotation.set(side * tilt, yaw + Math.PI / 2, 0, 'YXZ'); // the two halves fall out either side of the rail
    sheet.castShadow = false; sheet.receiveShadow = true;
    soft(sheet); // the ink pass would outline the sheet's rectangle; a net has no edge to ink
    group.add(sheet);
    // cork floats along the bottom edge of each half
    const bx = x - c * side * Math.sin(tilt) * h, bz = z + s * side * Math.sin(tilt) * h, by = y + top - 0.02 - Math.cos(tilt) * h;
    for (let i = -1.5; i <= 1.5; i++) b.add(GEO.cyl8, '#e8b36a', { x: bx + s * i * 0.3, y: by, z: bz + c * i * 0.3, sx: 0.04, sy: 0.08, sz: 0.04, rx: Math.PI / 2, ry: yaw });
  }
  colliders.push({ type: 'circle', x, z, r: 0.45 });
  for (const k of [-half, half]) colliders.push({ type: 'circle', x: x + s * k, z: z + c * k, r: 0.14 });
}

// A diamond mesh with a knot at every crossing, on a clear ground, repeated across the sheet.
function netTexture() {
  const S = 128, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.strokeStyle = '#f4ead2'; g.lineWidth = 5; g.lineCap = 'round';
  const step = S / 2;
  g.beginPath();
  for (let i = -2; i <= 2; i++) { g.moveTo(i * step - S, -S); g.lineTo(i * step + S, S); g.moveTo(i * step + S, -S); g.lineTo(i * step - S, S); }
  g.stroke();
  g.fillStyle = '#d9c7a0';
  for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) { g.beginPath(); g.arc(i * step, j * step, 5.5, 0, Math.PI * 2); g.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 8);
  tex.anisotropy = 4;
  return tex;
}
