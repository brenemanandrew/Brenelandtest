// The lawn north of the house: the frisbee field (a mown oval, lighter green in stripes, faint white lines, layout.js FRISBEE_FIELD)
// and, along the north fence where the lawn arc runs, square trimmed box hedges (layout.js HEDGES, solid: one box collider per run.
// npcs.js walks the dogs' fence patrol along their face). The frisbee rack and the frisbee itself are frisbee.js.
import * as THREE from 'three';
import { Batcher, GEO } from './batch.js';
import { toon, soft, shadows } from './toon.js';
import { terrainHeight } from './terrain.js';
import { FRISBEE_FIELD, FRISBEE_RACK, HEDGE, HEDGES } from './layout.js';
import { signTexture } from './areas.js';

const HEDGE_COLS = ['#3d7a3a', '#41813d', '#3a7537'];

// The hedges: each run cut into trimmed blocks about 3.3 m long (a hair apart, so they read as square box hedges), a lighter
// clipped top, a darker foot, and a few soft bumps of new growth on the faces.
export function buildHedges(b, colliders, leaf = b) {   // leaf: the clumps' own batch, drawn without ink (shade, not spots)
  const { z0, z1, h } = HEDGE, zc = (z0 + z1) / 2, d = z1 - z0;
  let k = 0;
  for (const run of HEDGES) {
    const n = Math.max(1, Math.round((run.x1 - run.x0) / 3.3)), L = (run.x1 - run.x0) / n;
    for (let i = 0; i < n; i++, k++) {
      const x = run.x0 + (i + 0.5) * L, y = Math.min(terrainHeight(x - L / 2, zc), terrainHeight(x + L / 2, zc), terrainHeight(x, zc)) - 0.04;
      const col = HEDGE_COLS[k % HEDGE_COLS.length];
      b.add(GEO.box, col, { x, y: y + h / 2, z: zc, sx: L - 0.07, sy: h, sz: d });
      b.add(GEO.box, '#5da350', { x, y: y + h + 0.025, z: zc, sx: L - 0.13, sy: 0.05, sz: d - 0.06 });
      b.add(GEO.box, '#2f5f2c', { x, y: y + 0.09, z: zc, sx: L - 0.05, sy: 0.18, sz: d + 0.02 });
      // leafy clumps on both faces (two shades, a lighter one higher up where the sun gets at it) and a few on the clipped top
      for (let j = 0; j < 14; j++) {
        const side = j % 2 ? 1 : -1, u = ((j * 0.618 + k * 0.31) % 1) - 0.5, hy = 0.32 + ((j * 0.437 + k * 0.17) % 1) * (h - 0.5);
        leaf.add(GEO.ico0, hy > h * 0.55 ? '#4e9746' : '#356e33', { x: x + u * (L - 0.45), y: y + hy, z: zc + side * (d / 2 - 0.035), sx: 0.24, sy: 0.19, sz: 0.1, ry: j * 1.3 + k });
      }
      for (let j = 0; j < 3; j++) leaf.add(GEO.ico0, '#64ab55', { x: x + (j - 1) * (L / 3.4) + 0.12 * Math.sin(k * 1.7 + j), y: y + h + 0.035, z: zc + 0.12 * Math.sin(k + j * 2), sx: 0.26, sy: 0.06, sz: 0.22, ry: k + j });
    }
    colliders.push({ type: 'box', minX: run.x0, maxX: run.x1, minZ: z0, maxZ: z1, hedge: true });
  }
}

// The frisbee rack at the field's west end by the main path: a little wooden stand with a slotted shelf, four frisbees standing in
// it on edge, a painted board on top. E there puts one in your hand (dog-toys.js api.take).
const RACK_DISCS = ['#e0463c', '#f2b630', '#3f8fd9', '#4fa45a'];
export function buildRack(b, group, colliders) {
  const { x, z, yaw } = FRISBEE_RACK, y = terrainHeight(x, z), fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const at = (lu, lw, yy, geo, col, o = {}) => b.add(geo, col, { x: x + rx * lu + fx * lw, y: y + yy, z: z + rz * lu + fz * lw, ry: yaw, ...o });
  for (const s of [-0.5, 0.5]) at(s, 0, 0.5, GEO.box, '#8a6240', { sx: 0.07, sy: 1.0, sz: 0.07 });     // posts
  at(0, 0, 0.36, GEO.box, '#b98a5a', { sx: 1.12, sy: 0.05, sz: 0.34 });                                 // the shelf
  at(0, -0.15, 0.48, GEO.box, '#b98a5a', { sx: 1.12, sy: 0.2, sz: 0.04 });                              // its back lip
  for (let i = 0; i < 4; i++) {                                                                          // the frisbees, on edge in their slots
    const lu = -0.36 + i * 0.24;
    at(lu, 0.02, 0.55, GEO.cyl12, RACK_DISCS[i], { sx: 0.15, sy: 0.026, sz: 0.15, rx: Math.PI / 2 - 0.25 });
    at(lu, 0.031, 0.553, GEO.cyl12, '#ffffff', { sx: 0.075, sy: 0.006, sz: 0.075, rx: Math.PI / 2 - 0.25 });
  }
  colliders.push({ type: 'circle', x, z, r: 0.55 });
  // the board fits between the posts (at 1.0 wide the posts' tops stood over its ends)
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.36, 0.03), (() => { const e = toon('#3f8fd9'); return [e, e, e, e, new THREE.MeshBasicMaterial({ map: signTexture(['FRISBEES', 'take one, bring it back'], { bg: '#3f8fd9', fg: '#ffffff', w: 320, h: 116 }), fog: true }), e]; })());
  board.position.set(x - fx * 0.02, y + 0.98, z - fz * 0.02); board.rotation.y = yaw; board.castShadow = true; board.name = 'frisbee-rack-sign';
  group.add(board);
}

// The mown oval: stripes across it (light and lighter green, crisp at the stripe edges), soft at its rim, with faint white
// lines: the outline a little inside the rim, a line across the middle and a circle in the middle. One transparent mesh laid
// on the ground like the trails (soft layer, no ink, drawn before the grass tufts).
export function fieldGeometry() {
  const F = FRISBEE_FIELD, verts = [], cols = [];
  const STRIPE = 2.25, CELL = 0.5, FADE = 0.7, LIFT = 0.035;
  const STRIPES = [[0.47, 0.75, 0.3], [0.41, 0.68, 0.25]];
  const edge = (x, z) => { const q = Math.hypot((x - F.x) / F.rx, (z - F.z) / F.rz); return (1 - q) * Math.min(F.rx, F.rz); }; // ~metres inside the rim
  const vtx = (x, z, c, a) => { verts.push(x, terrainHeight(x, z) + LIFT, z); cols.push(c[0], c[1], c[2], a); };
  const alphaAt = (x, z) => Math.max(0, Math.min(1, edge(x, z) / FADE)) * 0.9;
  for (let s0 = F.x - F.rx; s0 < F.x + F.rx; s0 += STRIPE) {
    const c = STRIPES[Math.round((s0 - (F.x - F.rx)) / STRIPE) % 2];
    const s1 = Math.min(F.x + F.rx, s0 + STRIPE);
    for (let x = s0; x < s1 - 1e-6; x += CELL) {
      const xb = Math.min(s1, x + CELL);
      for (let z = F.z - F.rz; z < F.z + F.rz - 1e-6; z += CELL) {
        const zb = z + CELL;
        if (edge(x, z) < 0 && edge(xb, z) < 0 && edge(x, zb) < 0 && edge(xb, zb) < 0) continue;
        const q = [[x, z], [xb, z], [xb, zb], [x, zb]];
        for (const i of [0, 2, 1, 0, 3, 2]) vtx(q[i][0], q[i][1], c, alphaAt(q[i][0], q[i][1]));
      }
    }
  }
  // the lines: thin strips a touch higher than the stripes
  const LINE = [0.96, 0.98, 0.9], LA = 0.55, W = 0.07;
  const strip = pts => {
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, nx = -dz / L * W, nz = dx / L * W;
      const q = [[ax - nx, az - nz], [bx - nx, bz - nz], [bx + nx, bz + nz], [ax + nx, az + nz]];
      for (const j of [0, 2, 1, 0, 3, 2]) { verts.push(q[j][0], terrainHeight(q[j][0], q[j][1]) + LIFT + 0.006, q[j][1]); cols.push(LINE[0], LINE[1], LINE[2], LA); }
    }
  };
  const ring = (rx, rz) => Array.from({ length: 73 }, (_, i) => [F.x + Math.cos(i / 72 * Math.PI * 2) * rx, F.z + Math.sin(i / 72 * Math.PI * 2) * rz]);
  strip(ring(F.rx - 0.9, F.rz - 0.9));
  strip([[F.x, F.z - F.rz + 0.9], [F.x, F.z + F.rz - 0.9]]);
  strip(ring(1.8, 1.8));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 4));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function createLawn(ctx) {
  const { scene, colliders } = ctx;
  const group = new THREE.Group(); group.name = 'lawn';
  const b = new Batcher({ vertexColors: true });
  const leaf = new Batcher({ vertexColors: true, castShadow: false });
  buildHedges(b, colliders, leaf);
  leaf.build(group, 'hedge-leaves').forEach(m => soft(m));
  buildRack(b, group, colliders);
  b.build(group, 'hedges');
  shadows(group);
  const mat = toon('#ffffff', { polygonOffset: true, steps: 4, vertexColors: true }).clone();
  mat.transparent = true; mat.depthWrite = false; mat.name = 'frisbee-field';
  const field = new THREE.Mesh(fieldGeometry(), mat);
  field.name = 'frisbee-field'; field.receiveShadow = true; field.renderOrder = -1;
  field.userData.noMerge = true; field.matrixAutoUpdate = false; field.updateMatrix();
  soft(field);
  group.add(field);
  scene.add(group);
  const R = FRISBEE_RACK, toys = () => ctx.features?.find(f => f.name === 'dogtoys');
  return {
    name: 'lawn',
    api: { group, field, rack: R },
    target(px, pz) {
      if (Math.hypot(px - R.x, pz - R.z) > 1.8) return null;
      const t = toys(); if (!t?.api?.take) return null;
      if (t.ball.state === 'held' && t.ball.kind === 'frisbee') return null;
      if (t.ball.state === 'loose' && (t.ball.flying || t.ball.moving || t.ball.holder)) return null;   // yours is still in the air or with a dog
      // holding another toy, the swap is only offered right at the rack. A step away, E throws what you hold as it does anywhere
      if (t.ball.state === 'held') return Math.hypot(px - R.x, pz - R.z) < 1.15 ? { hint: 'E  Swap it for a frisbee from the rack', prio: 7, run: () => t.api.take('frisbee') } : null;
      return { hint: 'E  Take a frisbee from the rack', prio: 6, run: () => t.api.take('frisbee') };
    },
  };
}
