// The fishing spot at the end of the boat dock: Kevin's hand-painted sign, a bait bucket, a fish crate, a cooler,
// a coil of rope, a landing net and a gull that keeps an eye on the whole operation. Nothing blocks the walkway.
// (The lawn end of the pier is dressed by dock-lawn.js.)
import * as THREE from 'three';
import { GEO } from './batch.js';
import { toon } from './toon.js';
import { terrainHeight } from './terrain.js';
import { DOCK } from './layout.js';
import { buildFish3D } from './fish-art.js';
import { fishShackModel } from './fish-shack-model.js';   // (fish-shack-setpiece) the props are the Blender set piece's when it loaded

// A hand-painted sign as a canvas texture (drawn again once the web font has arrived).
function signTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const paint = () => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 256);
    g.fillStyle = '#f6e6bd'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = 'rgba(160,120,70,0.25)'; g.lineWidth = 3; // wood grain
    for (let y = 22; y < 256; y += 38) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(140, y - 8, 330, y + 9, 512, y - 3); g.stroke(); }
    g.strokeStyle = '#2f5da8'; g.lineWidth = 12; g.lineJoin = 'round'; // painted border, a little wobbly
    g.beginPath(); g.moveTo(14, 16); g.lineTo(498, 12); g.lineTo(500, 242); g.lineTo(12, 244); g.closePath(); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const font = w => `700 ${w}px Fredoka, "Trebuchet MS", "Segoe UI", sans-serif`;
    const line = (t, x, y, size, rot, col, maxW = 470) => {
      g.save(); g.translate(x, y); g.rotate(rot); g.font = font(size);
      while (size > 20 && g.measureText(t).width > maxW) g.font = font(size -= 2); // squeeze a long name onto the board
      g.fillStyle = 'rgba(43,35,64,0.25)'; g.fillText(t, 3, 4);
      g.fillStyle = col; g.fillText(t, 0, 0); g.restore();
    };
    line("KEVIN'S", 258, 66, 74, -0.02, '#2f5da8', 440);
    line('FISHING HOLE', 256, 134, 66, 0.015, '#2f5da8');
    g.fillStyle = '#e8763a'; g.strokeStyle = '#2b2340'; g.lineWidth = 4; // a painted fish
    g.beginPath(); g.ellipse(118, 206, 34, 17, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(88, 206); g.lineTo(60, 188); g.lineTo(62, 224); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(136, 201, 5, 0, 7); g.fill();
    g.fillStyle = '#2b2340'; g.beginPath(); g.arc(137, 202, 2.4, 0, 7); g.fill();
    line('talk to Kevin (E)', 328, 206, 42, -0.01, '#b8433c', 330);
    g.strokeStyle = '#3f8fd9'; g.lineWidth = 5; g.beginPath(); // waves
    for (let x = 34; x < 480; x += 30) { g.moveTo(x, 176); g.quadraticCurveTo(x + 8, 166, x + 15, 176); }
    g.stroke();
    tex.needsUpdate = true;
  };
  paint();
  try { document.fonts?.load('700 40px Fredoka').then(paint).catch(() => {}); } catch { /* no fonts API */ }
  return tex;
}

export function dressDock({ b, group, colliders, updaters }) {
  const y = DOCK.y;
  const zN = DOCK.maxZ - 0.3, zS = DOCK.minZ + 0.3; // just inside the two edges: the walkway stays free

  // the sign, on the shore where the trail meets the dock, facing the people walking in
  const sx = 49.6, sz = -16.3, sy = terrainHeight(sx, sz);
  const sign = new THREE.Group();
  sign.position.set(sx, sy, sz); sign.rotation.y = -1.25;
  for (const dx of [-0.98, 0.98]) {
    const post = new THREE.Mesh(GEO.box, toon('#6b4428')); post.scale.set(0.12, 1.9, 0.12); post.position.set(dx, 0.95, -0.02); sign.add(post);
  }
  const face = new THREE.MeshBasicMaterial({ map: signTexture(), fog: true });
  const edge = toon('#7a5234');
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.9, 0.08), [edge, edge, edge, edge, face, face]);
  board.position.y = 1.5; sign.add(board);
  const cap = new THREE.Mesh(GEO.box, toon('#5a3a22')); cap.scale.set(2.2, 0.08, 0.16); cap.position.y = 1.99; sign.add(cap);
  group.add(sign);
  for (const k of [-1, 1]) colliders.push({ type: 'circle', x: sx + k * 0.31, z: sz + k * 0.93, r: 0.2 }); // the two posts

  const M = fishShackModel();   // (the model's crate, bucket, cooler, rope and net stand in the same places, with its colliders: dock.js)
  // a bait bucket: galvanised, a rope handle, something wriggly inside
  const bx = 57.6, bz = zN - 0.05;
  if (!M) {
  b.add(GEO.cyl12, '#aab4bd', { x: bx, y: y + 0.17, z: bz, sx: 0.2, sy: 0.34, sz: 0.2 });
  b.add(GEO.cyl12, '#dfe6ec', { x: bx, y: y + 0.345, z: bz, sx: 0.215, sy: 0.03, sz: 0.215 });
  b.add(GEO.cyl12, '#5a4030', { x: bx, y: y + 0.335, z: bz, sx: 0.17, sy: 0.02, sz: 0.17 });
  b.add(new THREE.TorusGeometry(0.19, 0.012, 5, 14, Math.PI), '#6b4428', { x: bx, y: y + 0.34, z: bz, ry: 0.4 });
  for (const [wx, wz] of [[0.05, 0.03], [-0.06, -0.02]]) b.add(GEO.sphere, '#e39a86', { x: bx + wx, y: y + 0.36, z: bz + wz, sx: 0.035, sy: 0.02, sz: 0.06 });
  colliders.push({ type: 'circle', x: bx, z: bz + 0.05, r: 0.24 });
  }

  // a fish crate with the day's catch sticking out of it
  const cx = 60.2, cz = zN - 0.1;
  if (!M) {
  b.add(GEO.box, '#b98a5a', { x: cx, y: y + 0.19, z: cz, sx: 0.78, sy: 0.38, sz: 0.5 });
  b.add(GEO.box, '#8a6240', { x: cx, y: y + 0.39, z: cz, sx: 0.82, sy: 0.05, sz: 0.54 });
  for (const t of [-0.26, 0, 0.26]) b.add(GEO.box, '#8a6240', { x: cx + t, y: y + 0.2, z: cz + 0.255, sx: 0.05, sy: 0.4, sz: 0.02 });
  b.add(GEO.box, '#dbe8ee', { x: cx, y: y + 0.4, z: cz, sx: 0.66, sy: 0.04, sz: 0.4 });
  }
  const fishes = [['perch', 24, -0.24, 0.35], ['mackerel', 34, 0.02, 1.4], ['bass', 40, 0.25, 2.4]];
  for (const [id, cm, dx, ry] of fishes) {
    const f = buildFish3D(id, cm);
    f.scale.setScalar(0.62);
    f.position.set(cx + dx, y + 0.5, cz);
    f.rotation.set(-0.35, ry, 0.15 * Math.sign(dx || 1));
    group.add(f);
  }
  if (!M) colliders.push({ type: 'box', minX: cx - 0.4, maxX: cx + 0.4, minZ: cz - 0.27, maxZ: cz + 0.27 });

  if (!M) {
  // a cooler and a coil of rope on the other side
  const kx = 54.9, kz = zS + 0.05;   // (toward the shore end: the boat's boarding spots are along this edge, kevin-day.js BOARD_SPOTS)
  b.add(GEO.box, '#3f7fc9', { x: kx, y: y + 0.2, z: kz, sx: 0.62, sy: 0.36, sz: 0.38 });   // a blue cooler with a white lid and side handles
  b.add(GEO.box, '#f4f2ea', { x: kx, y: y + 0.41, z: kz, sx: 0.66, sy: 0.07, sz: 0.42 });
  for (const s2 of [-1, 1]) b.add(GEO.box, '#2b3a52', { x: kx + s2 * 0.33, y: y + 0.28, z: kz, sx: 0.04, sy: 0.05, sz: 0.18 });
  colliders.push({ type: 'box', minX: kx - 0.37, maxX: kx + 0.37, minZ: kz - 0.23, maxZ: kz + 0.23 });
  const rx = 53.6, rz = zS + 0.05;
  for (let i = 0; i < 3; i++) b.add(new THREE.TorusGeometry(0.2 - i * 0.02, 0.045, 6, 14), '#d9c7a0', { x: rx, y: y + 0.05 + i * 0.07, z: rz, rx: Math.PI / 2 });
  colliders.push({ type: 'circle', x: rx, z: rz, r: 0.26 });

  // a landing net lying on the boards along the edge: handle toward the shore, the hoop flat, the net bag beside it
  const nx = 62.2, nz = zN + 0.12;
  b.add(GEO.cyl6, '#8a6240', { x: nx - 0.85, y: y + 0.035, z: nz, sx: 0.03, sy: 1.4, sz: 0.03, rz: Math.PI / 2 });
  b.add(new THREE.TorusGeometry(0.27, 0.022, 6, 18), '#5a4030', { x: nx + 0.12, y: y + 0.03, z: nz, rx: Math.PI / 2 });
  b.add(new THREE.SphereGeometry(0.26, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#c9c2a8', { x: nx + 0.12, y: y + 0.02, z: nz, sy: 0.35 });
  }

  // a gull, on the last piling (two more sit on the pilings nearer the shore: dock-lawn.js)
  addGull(b, group, updaters, 61, y + 0.4, DOCK.maxZ - 0.15, 1.9);
}

// A perched gull (its feet at x, y, z, facing yaw) that looks left and right and now and then bobs its head. The body,
// wing, tail and legs are baked into the batch; only the head (four small meshes) is live. `phase` offsets the
// looking so a row of gulls does not turn as one.
export function addGull(b, group, updaters, x, y, z, yaw, phase = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, ly, lz) => ({ x: x + lx * c + lz * s, y: y + ly, z: z - lx * s + lz * c }); // the gull's own frame, turned by yaw
  b.add(GEO.sphere, '#f7f7f2', { ...at(0, 0.16, 0), sx: 0.15, sy: 0.13, sz: 0.24, ry: yaw });
  b.add(GEO.sphere, '#aab4bd', { ...at(0, 0.2, -0.04), sx: 0.13, sy: 0.09, sz: 0.2, ry: yaw });
  b.add(GEO.cone6, '#f7f7f2', { ...at(0, 0.16, -0.27), sx: 0.08, sy: 0.16, sz: 0.02, rx: -1.9, ry: yaw });
  for (const k of [-1, 1]) b.add(GEO.cyl6, '#ff9f43', { ...at(k * 0.05, 0.05, 0), sx: 0.01, sy: 0.1, sz: 0.01 });
  const head = new THREE.Group();
  const hd = new THREE.Mesh(GEO.sphere, toon('#f7f7f2')); hd.scale.setScalar(0.085);
  const beak = new THREE.Mesh(GEO.cone6, toon('#ffb52e')); beak.scale.set(0.03, 0.09, 0.03); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.01, 0.1);
  const eye = new THREE.Mesh(GEO.sphere, toon('#2b2340')); eye.scale.setScalar(0.015); eye.position.set(0.05, 0.02, 0.05);
  const eye2 = eye.clone(); eye2.position.x = -0.05;
  head.add(hd, beak, eye, eye2);
  const neck = at(0, 0.3, 0.14);
  head.position.set(neck.x, neck.y, neck.z);
  group.add(head);
  let next = 3 + phase;
  updaters.push((dt, t) => { // look left, look right, now and then a quick bob
    const u = t + phase;
    head.rotation.y = yaw + Math.sin(u * 0.6) * 0.7 * Math.sin(u * 0.23);
    head.position.y = neck.y + (t > next && t < next + 0.4 ? Math.abs(Math.sin((t - next) * 8)) * 0.03 : 0);
    if (t > next + 0.5) next = t + 3 + (Math.sin(u * 12.9) + 1) * 3;
  });
  return head;
}
