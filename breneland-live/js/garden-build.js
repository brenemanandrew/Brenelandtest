// The Community Garden's block: everything that stands still, built into the areas batch by areas.js PLACEHOLDERS.garden.
// garden.js adds the job items (weeds, ripe vegetables, seed mounds, wet soil, crows, the compost heap, the feeder's seed), their
// glow and Joyce's chalkboard at the spots PLAN names here.
//
// The block sits west of the yard fence (layout.js GARDEN_BLOCK, the `garden` slot is its middle). Coordinates in PLAN are
// u = metres east of the slot, v = metres south. From the park path (south) to the road (north):
//   the gate (a rose arch) and the sign, herb pots, then the middle aisle running north between two columns of beds
//   row A: the lettuce (the crows' bed, the scarecrow beside it) | the tilled bed (seeds: the packets on a crate beside it)
//   row B: carrots | strawberries (the weeds)            the water butt and the can against the yard fence between B and C
//   row C: tomatoes | pumpkins (picking: the trug)       sunflowers along the west fence
//   Joyce's corner: her chair in the oak's shade, her chalkboard and her spot at the head of the aisle
//   the back: the compost bins (north-west), the cart pad and the north gate off the sidewalk, the potting shed with the tools
//   (north-east), the wheelbarrow. The bird feeder stands in the south-east corner by the gate, its seed sack at its foot.
import * as THREE from 'three';
import { GEO } from './batch.js';
import { toon } from './toon.js';
import { terrainHeight } from './terrain.js';
import { GARDEN_BLOCK, GARDEN_SPOTS, gardenBlock } from './layout.js';
import { addSeat } from './seats.js';
import { addNightSpot, lampGlow } from './daynight-mats.js';
import { npcSpec } from './npc-looks.js';

const TAU = Math.PI * 2;
export const BED = { w: 2.8, d: 1.4, top: 0.44 }; // the soil's footprint (inside the planks) and its height above the ground
export const PLAN = {
  beds: {
    lettuce: { u: -3.0, v: 6.6 }, tilled: { u: 3.0, v: 6.6 },
    carrots: { u: -3.0, v: 2.6 }, strawberries: { u: 3.0, v: 2.6 },
    tomatoes: { u: -3.0, v: -1.4 }, pumpkins: { u: 3.0, v: -1.4 },
  },
  butt: { u: 5.85, v: 0.6 }, can: { u: 5.1, v: 1.05 },
  feeder: { u: 5.2, v: 9.3 }, sack: { u: 5.75, v: 9.9 },
  compost: { u: -5.15, v: -9.55 }, compost2: { u: -3.85, v: -9.55 },
  shed: { u: 4.95, v: -9.65, w: 2.6, d: 2.0 }, bench: { u: 4.75, v: -7.75 },
  scarecrow: { u: -5.55, v: 6.6 }, crate: { u: 5.25, v: 6.6 }, trug: { u: 1.15, v: -0.15 },
  barrow: { u: 2.55, v: -6.3 }, board: { u: -5.9, v: -3.4, yaw: 0.8 }, lantern: { u: -5.3, v: -4.3 }, // the board against the west fence by her chair, facing the aisle and the gate (out of the way)
  pad: { u0: -0.9, u1: 2.3, v0: -11, v1: -7.3 },
};

export function buildGarden({ b, group, x: X, z: Z, colliders }) {
  const H = (x, z) => terrainHeight(x, z);
  const B = GARDEN_BLOCK, hw = B.hw, hd = B.hd;
  const W = (u, v) => [X + u, Z + v];
  const put = (geo, col, u, y, v, o = {}) => { const [x, z] = W(u, v); b.add(geo, col, { x, y: H(x, z) + y, z, ...o }); };
  const box = (u0, u1, v0, v1) => { const [x0, z0] = W(u0, v0), [x1, z1] = W(u1, v1); colliders.push({ type: 'box', minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) }); };
  const disc = (u, v, r) => { const [x, z] = W(u, v); colliders.push({ type: 'circle', x, z, r }); };
  const flat = (col, u0, u1, v0, v1, lift = 0.02) => put(GEO.box, toon(col, { polygonOffset: true }), (u0 + u1) / 2, lift, (v0 + v1) / 2, { sx: u1 - u0, sy: 0.04, sz: v1 - v0 });

  // ---- the ground: a gravel aisle from the rose arch to the back with stepping stones down it and brick edging along it, low herbs
  // either side from the gate to the first beds, gravel inside the gate and in front of Joyce's corner, woodchip only on the cross
  // paths between the beds and the work path at the back, and a gravel pad for the cart
  const CHIP = '#b8986c', CHIP2 = '#a88a60', GRAVEL = '#d0c3a5';
  flat(GRAVEL, -1.2, 1.2, -7.3, hd - 0.05);                    // the middle aisle, gate to the back
  for (const v of [4.6, 0.6]) flat(CHIP2, -hw + 0.5, hw - 0.5, v - 0.65, v + 0.65, 0.018); // the cross paths between the rows
  flat(GRAVEL, -hw + 0.5, hw - 0.5, hd - 1.6, hd - 0.05, 0.018); // inside the gate
  flat(GRAVEL, -6.2, 2.4, -4.1, -2.75, 0.018);                   // in front of Joyce's corner (her chair, out to her board by the fence)
  flat(CHIP, -hw + 0.5, hw - 0.5, -8.75, -6.4, 0.016);           // the work path along the back (compost, shed, barrow)
  { // stepping stones: a flagstone under the arch, then one a stride up the aisle to the back, each its own shape and grey
    const STONE = ['#b4ada0', '#a8a194', '#bfb8aa', '#aea79a'];
    put(GEO.cyl8, STONE[0], 0, 0.05, hd - 0.42, { sx: 0.62, sy: 0.04, sz: 0.42, ry: 0.1 });
    let k = 0;
    for (let v = hd - 1.15; v > -7.0; v -= 0.66 + 0.06 * Math.sin(k * 2.3), k++) {
      const u = 0.13 * Math.sin(k * 1.37) + 0.05 * Math.sin(k * 3.1), r = 0.27 + 0.05 * Math.sin(k * 1.9 + 1);
      put(k % 3 === 1 ? GEO.cyl6 : GEO.cyl8, STONE[k % 4], u, 0.05, v, { sx: r * (1.08 + 0.12 * Math.sin(k * 0.7)), sy: 0.035, sz: r * (0.86 + 0.1 * Math.cos(k * 1.1)), ry: k * 0.83 });
    }
    // pebbles in the gravel
    for (let i = 0; i < 110; i++) { const u = -1.1 + ((i * 0.613) % 2.2), v = -7.2 + ((i * 2.917) % (hd + 7.1)), sz = 0.035 + 0.025 * ((i * 7) % 3) / 2; put(GEO.ico0, ['#9d968a', '#bab3a5', '#a89a80', '#c4b89c'][i % 4], u, 0.045, v, { sx: sz * 1.2, sy: 0.025, sz, ry: i }); }
  }
  { // brick edging along both sides of the aisle, broken where the cross paths, Joyce's corner and the gate strip open off it,
    // and round the plant labels and the trug that stand at its edge
    const open = [[4.6 - 0.65, 4.6 + 0.65], [0.6 - 0.65, 0.6 + 0.65], [-4.1, -2.75], [hd - 1.6, hd + 1], [-9, -6.4]];
    const keep = [...Object.values(PLAN.beds).map(p => [p.u + (p.u < 0 ? 1.7 : -1.7), p.v - 0.5]), [PLAN.trug.u, PLAN.trug.v]];
    const BRICK = ['#b5523b', '#a8472f', '#c0603f', '#9e4a34'];
    for (const su of [-1, 1]) {
      let k = 0;
      for (let v = -6.4 + 0.12; v < hd - 1.6 - 0.1; v += 0.235, k++) {
        const u = su * 1.27;
        if (open.some(([a, c]) => v > a - 0.12 && v < c + 0.12) || keep.some(([ku, kv]) => Math.abs(ku - u) < 0.45 && Math.abs(kv - v) < 0.32)) continue;
        put(GEO.box, BRICK[(k + (su > 0 ? 1 : 0)) % 4], u, 0.045, v, { sx: 0.1, sy: 0.07, sz: 0.215, ry: 0.04 * Math.sin(k * 2.1) });
      }
    }
  }
  { // low herbs either side of the aisle, from inside the gate up to the first beds: lavender on the left, thyme and sage on the right
    for (const su of [-1, 1]) for (let v = hd - 1.75, k = 0; v > 7.55; v -= 0.36, k++) {
      const u = su * (1.5 + 0.05 * Math.sin(k * 2.7));
      put(GEO.ico1, su < 0 ? (k % 2 ? '#7f9f6a' : '#6f9460') : (k % 2 ? '#8fb86a' : '#a3b58a'), u, 0.08, v, { sx: 0.2, sy: 0.12, sz: 0.19, ry: k });
      if (su < 0) for (const dv of [-0.07, 0.06]) put(GEO.cone6, '#9a7fd1', u + dv * 0.8, 0.2, v + dv, { sx: 0.025, sy: 0.12, sz: 0.025 }); // lavender spikes
      else if (k % 2 === 0) put(GEO.sphere, '#d9d2f0', u + 0.06, 0.17, v - 0.05, { sx: 0.03, sy: 0.02, sz: 0.03 }); // thyme in flower
    }
  }
  flat('#b9b3a6', PLAN.pad.u0, PLAN.pad.u1, PLAN.pad.v0 + 0.05, PLAN.pad.v1, 0.03); // the cart's gravel pad
  for (let i = 0; i < 26; i++) { const u = PLAN.pad.u0 + 0.2 + ((i * 0.37) % (PLAN.pad.u1 - PLAN.pad.u0 - 0.4)), v = PLAN.pad.v0 + 0.3 + ((i * 1.31) % (PLAN.pad.v1 - PLAN.pad.v0 - 0.6)); put(GEO.ico0, '#8f897e', u, 0.05, v, { sx: 0.07, sy: 0.04, sz: 0.06, ry: i }); }
  // the sidewalk to the north gate: a strip of gravel across the grass verge
  flat('#b9b3a6', B.cartGate.u - 1.2, B.cartGate.u + 1.2, -hd - 0.85, -hd + 0.05, 0.03);

  // ---- the picket fence: west, south and north sides (the yard's own fence is the east side), gaps at the two gates
  const gateS = { u0: B.gate.u - 1.0, u1: B.gate.u + 1.0 }, gateN = { u0: B.cartGate.u - 1.2, u1: B.cartGate.u + 1.2 };
  const fenceRun = (a, c, skip) => { // a, c = [u, v] ends; skip = [t0, t1] along the run (0..1) left open
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.round(len / 0.26), yaw = Math.atan2(c[0] - a[0], c[1] - a[1]);
    for (let i = 0; i <= n; i++) {
      const t = i / n; if (skip && t > skip[0] && t < skip[1]) continue;
      const u = a[0] + (c[0] - a[0]) * t, v = a[1] + (c[1] - a[1]) * t, post = i % 8 === 0 || (skip && (Math.abs(t - skip[0]) < 0.5 / n || Math.abs(t - skip[1]) < 0.5 / n));
      put(GEO.box, post ? '#efe9dc' : '#f6f1e4', u, post ? 0.42 : 0.33, v, { sx: post ? 0.14 : 0.1, sy: post ? 0.84 : 0.66, sz: post ? 0.14 : 0.035, ry: yaw + Math.PI / 2 });
      if (!post) put(GEO.cone6, '#f6f1e4', u, 0.71, v, { sx: 0.06, sy: 0.09, sz: 0.035, ry: yaw + Math.PI / 2 });
    }
    const seg = (t0, t1) => { const u0 = a[0] + (c[0] - a[0]) * t0, v0 = a[1] + (c[1] - a[1]) * t0, u1 = a[0] + (c[0] - a[0]) * t1, v1 = a[1] + (c[1] - a[1]) * t1;
      const l = Math.hypot(u1 - u0, v1 - v0); for (const y of [0.22, 0.52]) put(GEO.box, '#e6dfcf', (u0 + u1) / 2, y, (v0 + v1) / 2, { sx: 0.04, sy: 0.06, sz: l, ry: yaw });
      box(Math.min(u0, u1) - 0.08, Math.max(u0, u1) + 0.08, Math.min(v0, v1) - 0.08, Math.max(v0, v1) + 0.08); };
    if (skip) { seg(0, skip[0]); seg(skip[1], 1); } else seg(0, 1);
  };
  const E = hw - 0.25; // the east end stops short of the yard fence's pickets
  fenceRun([-hw, -hd], [-hw, hd]);
  fenceRun([-hw, hd], [E, hd], [(gateS.u0 + hw) / (E + hw), (gateS.u1 + hw) / (E + hw)]);
  fenceRun([-hw, -hd], [E, -hd], [(gateN.u0 + hw) / (E + hw), (gateN.u1 + hw) / (E + hw)]);
  // the south gate: two tall posts and a rose arch over the way in
  for (const s of [-1, 1]) { put(GEO.box, '#f6f1e4', B.gate.u + s * 1.08, 1.1, hd, { sx: 0.16, sy: 2.2, sz: 0.16 }); disc(B.gate.u + s * 1.08, hd, 0.2); }
  { const [gx, gz] = W(B.gate.u, hd), gy = H(gx, gz);
    b.add(new THREE.TorusGeometry(1.08, 0.07, 6, 16, Math.PI), '#f6f1e4', { x: gx, y: gy + 2.2, z: gz });
    for (let k = 0; k <= 12; k++) { const f = (k / 12) * Math.PI; b.add(GEO.ico1, k % 3 ? '#4f9a3e' : '#ff6f91', { x: gx + Math.cos(f) * 1.08, y: gy + 2.2 + Math.sin(f) * 1.08, z: gz + (k % 2 ? 0.06 : -0.06), sx: 0.2, sy: 0.2, sz: 0.2 }); } }
  // the north gate: two posts with ball tops, left open for the cart
  for (const s of [-1, 1]) { put(GEO.box, '#efe9dc', B.cartGate.u + s * 1.25, 0.55, -hd, { sx: 0.16, sy: 1.1, sz: 0.16 }); put(GEO.sphere, '#efe9dc', B.cartGate.u + s * 1.25, 1.16, -hd, { sx: 0.11, sy: 0.11, sz: 0.11 }); disc(B.cartGate.u + s * 1.25, -hd, 0.18); }

  // ---- the sign: a carved board hung under the rose arch, read from the park path (and from inside on the way out)
  { const [sx, sz] = W(B.gate.u, hd), sy = H(sx, sz);
    const sg = new THREE.Group(); sg.position.set(sx, sy, sz); sg.name = 'garden-sign';
    const face = new THREE.MeshBasicMaterial({ map: SIGN_TEX(), fog: true }), edge = toon('#5a3a22');
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.07), [edge, edge, edge, edge, face, face]); board.position.y = 2.3; sg.add(board); // under the arch's roses, clear of every flower
    for (const o of [-0.62, 0.62]) { const ch = new THREE.Mesh(GEO.box, toon('#3a3f47')); ch.scale.set(0.02, 0.44, 0.02); ch.position.set(o, 2.77, 0); sg.add(ch); } // the chains it hangs from
    sg.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); group.add(sg); }

  // ---- the beds: planks with corner posts, soil, a crop at its own stage
  for (const [crop, p] of Object.entries(PLAN.beds)) {
    const [bx, bz] = W(p.u, p.v), y = H(bx, bz);
    flat('#9c7d55', p.u - 1.75, p.u + 1.75, p.v - 0.98, p.v + 0.98, 0.024); // packed earth round the planks
    b.add(GEO.box, crop === 'tilled' ? '#4e3220' : '#5a3c26', { x: bx, y: y + BED.top - 0.04, z: bz, sx: BED.w + 0.04, sy: 0.08, sz: BED.d + 0.04 });
    for (const s of [-1, 1]) { b.add(GEO.box, '#8a6240', { x: bx, y: y + 0.22, z: bz + s * 0.76, sx: BED.w + 0.3, sy: 0.44, sz: 0.1 }); b.add(GEO.box, '#8a6240', { x: bx + s * 1.46, y: y + 0.22, z: bz, sx: 0.1, sy: 0.44, sz: BED.d + 0.1 }); }
    for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) b.add(GEO.box, '#6b4428', { x: bx + s1 * 1.48, y: y + 0.28, z: bz + s2 * 0.78, sx: 0.14, sy: 0.56, sz: 0.14 });
    colliders.push({ type: 'box', minX: bx - 1.56, maxX: bx + 1.56, minZ: bz - 0.86, maxZ: bz + 0.86 });
    const top = y + BED.top;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) {
      const cx = bx - 1.1 + i * 0.55, cz = bz - 0.33 + j * 0.66;
      if (crop === 'lettuce') { b.add(GEO.ico1, j ? '#8fd45a' : '#7fcf5a', { x: cx, y: top + 0.08, z: cz, sx: 0.2, sy: 0.14, sz: 0.2, ry: i }); b.add(GEO.ico1, '#b8e87a', { x: cx, y: top + 0.16, z: cz, sx: 0.12, sy: 0.08, sz: 0.12 }); }
      if (crop === 'carrots' && !(i === 1 && j === 0) && !(i === 3 && j === 1)) { for (let k = 0; k < 3; k++) b.add(GEO.cone6, '#58b048', { x: cx + (k - 1) * 0.05, y: top + 0.18, z: cz + (k % 2) * 0.04, sx: 0.035, sy: 0.36, sz: 0.035, rz: (k - 1) * 0.25 }); b.add(GEO.cyl8, '#ff8a3a', { x: cx, y: top + 0.01, z: cz, sx: 0.05, sy: 0.05, sz: 0.05 }); }
      if (crop === 'strawberries') { b.add(GEO.ico1, '#5aa848', { x: cx, y: top + 0.06, z: cz, sx: 0.19, sy: 0.09, sz: 0.19, ry: i + j }); if ((i + j) % 2) b.add(GEO.sphere, '#e8383c', { x: cx + 0.12, y: top + 0.05, z: cz + 0.1, sx: 0.045, sy: 0.055, sz: 0.045 }); else b.add(GEO.sphere, '#ffffff', { x: cx - 0.08, y: top + 0.13, z: cz - 0.06, sx: 0.04, sy: 0.02, sz: 0.04 }); }
      if (crop === 'tomatoes' && j === 0) { b.add(GEO.cyl6, '#8a6240', { x: cx, y: top + 0.6, z: cz + 0.33, sx: 0.025, sy: 1.2, sz: 0.025 }); for (const [oy, ox, oz, r] of [[0.28, 0.05, 0.02, 0.2], [0.58, -0.07, -0.03, 0.17], [0.86, 0.03, 0.04, 0.12]]) b.add(GEO.ico0, '#4f9a3e', { x: cx + ox, y: top + oy, z: cz + 0.33 + oz, sx: r, sy: r * 0.8, sz: r, ry: i + oy * 5 }); b.add(GEO.sphere, '#9ed05a', { x: cx - 0.12, y: top + 0.42, z: cz + 0.22, sx: 0.06, sy: 0.06, sz: 0.06 }); }
      if (crop === 'pumpkins' && j === 0 && i % 2 === 0) { b.add(GEO.ico1, '#4f9a3e', { x: cx, y: top + 0.1, z: cz + 0.3, sx: 0.36, sy: 0.12, sz: 0.3, ry: i }); }
      if (crop === 'tilled' && j === 0) b.add(GEO.box, '#3e2818', { x: cx, y: top + 0.02, z: bz, sx: 0.12, sy: 0.06, sz: BED.d - 0.2 }); // the ridges
    }
    if (crop === 'pumpkins') { for (const [ou, ov, s] of [[-0.95, 0.35, 0.26], [0.85, -0.3, 0.2]]) { b.add(GEO.sphere, '#f08a2a', { x: bx + ou, y: top + s * 0.7, z: bz + ov, sx: s * 1.15, sy: s * 0.85, sz: s * 1.15 }); b.add(GEO.cyl6, '#5a7a2a', { x: bx + ou, y: top + s * 1.5, z: bz + ov, sx: 0.03, sy: 0.1, sz: 0.03 }); } for (let k = 0; k < 6; k++) b.add(GEO.cyl6, '#4f9a3e', { x: bx - 1.1 + k * 0.42, y: top + 0.03, z: bz + Math.sin(k * 1.7) * 0.25, sx: 0.025, sy: 0.5, sz: 0.025, rz: Math.PI / 2, ry: k * 0.6 }); }
    if (crop === 'tilled') for (let k = 0; k < 3; k++) b.add(GEO.cone6, '#8ab54a', { x: bx + 1.15, y: top + 0.06, z: bz - 0.45 + k * 0.45, sx: 0.03, sy: 0.12, sz: 0.03 });
    // a little plant label at each bed's aisle end, so the crop reads from the path
    const lu = p.u + (p.u < 0 ? 1.7 : -1.7);
    put(GEO.box, '#e8d8b0', lu, 0.36, p.v - 0.5, { sx: 0.03, sy: 0.72, sz: 0.03 });
    put(GEO.box, LABEL[crop], lu, 0.72, p.v - 0.5, { sx: 0.05, sy: 0.16, sz: 0.24 });
  }

  // ---- the scarecrow by the lettuce: patched shirt, straw hands, a stitched smile, a flower in his hat, a bird on his arm
  { const [sx, sz] = W(PLAN.scarecrow.u, PLAN.scarecrow.v), sy = H(sx, sz), yaw = Math.PI / 2; // facing east over his lettuce
    const at = (lx, ly, lz) => ({ x: sx + Math.cos(yaw) * lx + Math.sin(yaw) * lz, y: sy + ly, z: sz - Math.sin(yaw) * lx + Math.cos(yaw) * lz });
    const add = (geo, col, lx, ly, lz, o) => b.add(geo, col, { ...at(lx, ly, lz), ry: yaw, ...o });
    add(GEO.cyl6, '#8a6240', 0, 1.0, 0, { sx: 0.06, sy: 2.0, sz: 0.06 });
    add(GEO.cyl6, '#8a6240', 0, 1.62, 0, { sx: 0.05, sy: 1.9, sz: 0.05, rz: Math.PI / 2 });
    add(GEO.box, '#5b84c4', 0, 1.42, 0, { sx: 0.6, sy: 0.64, sz: 0.32 });
    add(GEO.box, '#e0463c', 0.14, 1.28, 0.17, { sx: 0.18, sy: 0.16, sz: 0.02 });
    add(GEO.box, '#f2de8c', -0.16, 1.55, 0.17, { sx: 0.14, sy: 0.14, sz: 0.02, rz: 0.3 });
    for (const s of [-1, 1]) { add(GEO.box, '#5b84c4', s * 0.6, 1.62, 0, { sx: 0.6, sy: 0.2, sz: 0.2 }); add(GEO.cone6, '#e8c96a', s * 1.0, 1.62, 0, { sx: 0.07, sy: 0.3, sz: 0.07, rz: -s * Math.PI / 2 }); }
    add(GEO.box, '#6b5a44', 0, 0.95, 0, { sx: 0.46, sy: 0.4, sz: 0.3 });
    for (const s of [-1, 1]) add(GEO.cone6, '#e8c96a', s * 0.12, 0.64, 0, { sx: 0.08, sy: 0.26, sz: 0.08, rx: Math.PI });
    add(GEO.box, '#e88fb3', 0, 1.77, 0, { sx: 0.34, sy: 0.08, sz: 0.34 }); add(GEO.box, '#e88fb3', 0.12, 1.6, 0.18, { sx: 0.1, sy: 0.3, sz: 0.03, rz: 0.2 });
    add(GEO.sphere, '#e8cf8a', 0, 2.0, 0, { sx: 0.24, sy: 0.26, sz: 0.24 });
    for (const s of [-1, 1]) add(GEO.box, '#2e2420', s * 0.09, 2.05, 0.21, { sx: 0.05, sy: 0.05, sz: 0.03 });
    add(GEO.box, '#2e2420', 0, 1.92, 0.22, { sx: 0.14, sy: 0.025, sz: 0.03 });
    add(GEO.cyl12, '#d9b85a', 0, 2.2, 0, { sx: 0.44, sy: 0.04, sz: 0.44 }); add(GEO.cyl12, '#d9b85a', 0, 2.3, 0, { sx: 0.2, sy: 0.18, sz: 0.2 });
    add(GEO.cyl12, '#e0463c', 0, 2.24, 0, { sx: 0.21, sy: 0.05, sz: 0.21 });
    add(GEO.sphere, '#ffd34d', 0.2, 2.3, 0.1, { sx: 0.06, sy: 0.06, sz: 0.06 });
    add(GEO.sphere, '#6fb8ff', -0.55, 1.78, 0, { sx: 0.07, sy: 0.06, sz: 0.09 }); add(GEO.sphere, '#6fb8ff', -0.55, 1.85, 0.07, { sx: 0.045, sy: 0.045, sz: 0.045 }); // the bird
    colliders.push({ type: 'circle', x: sx, z: sz, r: 0.35 }); }

  // ---- sunflowers along the west fence, beside the carrots and the tomatoes
  for (let i = 0; i < 8; i++) {
    const u = -hw + 0.55 + (i % 2) * 0.25, v = -2.6 + i * 0.95, h = 1.7 + ((i * 7) % 5) * 0.18;
    put(GEO.cyl6, '#58a348', u, h / 2, v, { sx: 0.04, sy: h, sz: 0.04 });
    for (let k = 0; k < 2; k++) put(GEO.ico1, '#58a348', u + (k ? 0.13 : -0.13), h * (0.45 + k * 0.2), v, { sx: 0.14, sy: 0.05, sz: 0.09, rz: k ? -0.6 : 0.6 });
    for (let k = 0; k < 8; k++) { const f = k / 8 * TAU; put(GEO.sphere, '#ffc933', u + 0.05, h + Math.sin(f) * 0.28, v + Math.cos(f) * 0.28, { sx: 0.03, sy: 0.07, sz: 0.09, rx: f }); }
    put(GEO.cyl12, '#6b4428', u + 0.07, h, v, { sx: 0.16, sy: 0.05, sz: 0.16, rz: Math.PI / 2 }); // the faces turn east, to the morning sun and the beds
  }

  // ---- watering: the water butt with its tap against the yard fence between the rows it waters, the can at its foot
  { const p = PLAN.butt;
    put(GEO.cyl12, '#4a6a8a', p.u, 0.5, p.v, { sx: 0.45, sy: 1.0, sz: 0.45 });
    for (const yy of [0.22, 0.78]) put(GEO.cyl12, '#2e3f5a', p.u, yy, p.v, { sx: 0.47, sy: 0.05, sz: 0.47 });
    put(GEO.cyl12, '#2e3f5a', p.u, 1.02, p.v, { sx: 0.43, sy: 0.04, sz: 0.43 });
    put(GEO.cyl8, '#c9c9cf', p.u - 0.48, 0.32, p.v, { sx: 0.035, sy: 0.14, sz: 0.035, rz: Math.PI / 2 }); put(GEO.box, '#d94a3c', p.u - 0.55, 0.38, p.v, { sx: 0.03, sy: 0.04, sz: 0.1 }); // the tap
    put(GEO.box, '#8a6240', p.u, 0.06, p.v, { sx: 1.0, sy: 0.12, sz: 1.0 }); // standing on a pallet
    disc(p.u, p.v, 0.55);
    const c = PLAN.can; // the watering can
    put(GEO.cyl8, '#3fa06a', c.u, 0.2, c.v, { sx: 0.16, sy: 0.32, sz: 0.16 });
    put(GEO.cyl6, '#3fa06a', c.u - 0.2, 0.32, c.v, { sx: 0.03, sy: 0.34, sz: 0.03, rz: 0.9 });
    put(GEO.cyl6, '#3fa06a', c.u - 0.32, 0.43, c.v, { sx: 0.06, sy: 0.03, sz: 0.06, rz: Math.PI / 2 - 0.9 });
    put(GEO.box, '#3fa06a', c.u, 0.45, c.v, { sx: 0.03, sy: 0.12, sz: 0.2 }); }

  // ---- seeds: a crate by the tilled bed with the seed packets propped on it and a trowel
  { const p = PLAN.crate;
    put(GEO.box, '#c9a26b', p.u, 0.2, p.v, { sx: 0.5, sy: 0.4, sz: 0.6 }); for (const yy of [0.12, 0.3]) put(GEO.box, '#a8824e', p.u, yy, p.v, { sx: 0.52, sy: 0.04, sz: 0.62 });
    ['#ff8fb1', '#ffd34d', '#7fcf5a', '#ff9f43'].forEach((col, k) => { put(GEO.box, col, p.u - 0.12 + (k % 2) * 0.2, 0.48, p.v - 0.18 + Math.floor(k / 2) * 0.32, { sx: 0.15, sy: 0.18, sz: 0.02, rx: -0.25, ry: Math.PI / 2 }); put(GEO.box, '#fff8e8', p.u - 0.12 + (k % 2) * 0.2 - 0.01, 0.5, p.v - 0.18 + Math.floor(k / 2) * 0.32, { sx: 0.1, sy: 0.07, sz: 0.022, rx: -0.25, ry: Math.PI / 2 }); });
    put(GEO.cyl6, '#c9a26b', p.u + 0.1, 0.42, p.v + 0.38, { sx: 0.02, sy: 0.16, sz: 0.02, rx: 1.2 }); put(GEO.box, '#8a8f98', p.u + 0.1, 0.42, p.v + 0.5, { sx: 0.07, sy: 0.015, sz: 0.12 });
    disc(p.u, p.v, 0.42); }

  // ---- picking: the trug (a shallow basket) waiting on the path between the tomatoes and the pumpkins
  { const p = PLAN.trug;
    put(GEO.cyl12, '#c98a4a', p.u, 0.1, p.v, { sx: 0.3, sy: 0.16, sz: 0.2 }); put(GEO.cyl12, '#5a3c26', p.u, 0.17, p.v, { sx: 0.26, sy: 0.02, sz: 0.17 });
    put(new THREE.TorusGeometry(0.22, 0.02, 4, 12, Math.PI), '#a06a3a', p.u, 0.18, p.v, {});
    put(GEO.sphere, '#e8483c', p.u - 0.08, 0.22, p.v, { sx: 0.06, sy: 0.06, sz: 0.06 }); }

  // ---- the bird feeder in the south-east corner, a sack of seed at its foot (the feeder itself is garden.js's: it fills)
  { const p = PLAN.sack;
    put(GEO.cyl8, '#d9c79a', p.u, 0.22, p.v, { sx: 0.2, sy: 0.44, sz: 0.17 }); put(GEO.cone6, '#d9c79a', p.u, 0.5, p.v, { sx: 0.12, sy: 0.16, sz: 0.1 });
    put(GEO.box, '#6fb8ff', p.u, 0.25, p.v - 0.17, { sx: 0.16, sy: 0.12, sz: 0.01 }); put(GEO.cyl8, '#a8824e', p.u - 0.25, 0.08, p.v - 0.05, { sx: 0.07, sy: 0.12, sz: 0.07 });
    disc(p.u, p.v, 0.25); }

  // ---- the back: two compost bays (the turned one is garden.js's heap), the potting shed with the tools, the barrow
  for (const p of [PLAN.compost, PLAN.compost2]) {
    for (const [ou, ov, rot] of [[-0.58, 0, 0], [0.58, 0, 0], [0, -0.58, Math.PI / 2], [0, 0.58, Math.PI / 2]]) for (let k = 0; k < 3; k++) put(GEO.box, '#6b5440', p.u + ou, 0.2 + k * 0.28, p.v + ov, { sx: 0.06, sy: 0.2, sz: 1.2, ry: rot });
    for (const [ou, ov] of [[-0.58, -0.58], [0.58, -0.58], [-0.58, 0.58], [0.58, 0.58]]) put(GEO.box, '#5a4a3c', p.u + ou, 0.47, p.v + ov, { sx: 0.1, sy: 0.94, sz: 0.1 });
  }
  box(PLAN.compost.u - 0.62, PLAN.compost2.u + 0.62, PLAN.compost.v - 0.62, PLAN.compost.v + 0.62);
  put(GEO.ico1, '#3e2e20', PLAN.compost2.u, 0.5, PLAN.compost2.v, { sx: 0.5, sy: 0.22, sz: 0.5 }); // the second bay: last year's, dark and crumbly
  { const p = PLAN.compost; put(GEO.cyl6, '#c9a26b', p.u + 0.45, 0.95, p.v + 0.55, { sx: 0.022, sy: 1.1, sz: 0.022, rz: 0.35 }); for (let k = 0; k < 3; k++) put(GEO.box, '#8a8f98', p.u + 0.3 - 0.05 + k * 0.05, 0.38, p.v + 0.55, { sx: 0.015, sy: 0.24, sz: 0.015, rz: 0.35 }); } // the fork, leaning on it
  { const s = PLAN.shed, u0 = s.u - s.w / 2, u1 = s.u + s.w / 2, v0 = s.v - s.d / 2, v1 = s.v + s.d / 2;
    put(GEO.box, '#7aa6c8', s.u, 1.05, s.v, { sx: s.w, sy: 2.1, sz: s.d });                       // the walls, a soft blue
    for (let k = 0; k < 6; k++) put(GEO.box, '#6a94b6', u0 + 0.22 + k * 0.43, 1.05, v1 + 0.005, { sx: 0.05, sy: 2.1, sz: 0.02 }); // board lines on the front
    put(GEO.box, '#c94f4f', s.u, 2.25, s.v, { sx: s.w + 0.35, sy: 0.12, sz: s.d + 0.4, rx: -0.12 });  // a red roof, sloping back
    put(GEO.box, '#f6f1e4', s.u - 0.45, 0.95, v1 + 0.02, { sx: 0.95, sy: 1.8, sz: 0.04 });          // the door
    put(GEO.box, '#5a4a3c', s.u - 0.45, 0.95, v1 + 0.05, { sx: 0.8, sy: 1.62, sz: 0.02 });
    put(GEO.sphere, '#d9b85a', s.u - 0.1, 0.95, v1 + 0.08, { sx: 0.04, sy: 0.04, sz: 0.04 });
    put(GEO.box, '#fff3c4', s.u + 0.75, 1.45, v1 + 0.02, { sx: 0.6, sy: 0.45, sz: 0.04 }); put(GEO.box, '#f6f1e4', s.u + 0.75, 1.45, v1 + 0.04, { sx: 0.05, sy: 0.45, sz: 0.02 }); // a window
    put(GEO.box, '#f6f1e4', s.u + 0.75, 1.2, v1 + 0.1, { sx: 0.7, sy: 0.05, sz: 0.16 }); for (let k = 0; k < 3; k++) { put(GEO.cyl8, '#c86f4a', s.u + 0.52 + k * 0.23, 1.29, v1 + 0.1, { sx: 0.06, sy: 0.12, sz: 0.06 }); put(GEO.ico1, ['#ff8fb1', '#ffd34d', '#ff6f91'][k], s.u + 0.52 + k * 0.23, 1.4, v1 + 0.1, { sx: 0.07, sy: 0.06, sz: 0.07 }); } // a window box
    box(u0, u1, v0, v1);
    // the tools on hooks along the shed's west wall: rake, spade, hoe and fork
    [['rake', -0.6], ['spade', -0.2], ['hoe', 0.2], ['fork', 0.6]].forEach(([kind, o]) => {
      const v = s.v + o, u = u0 - 0.06;
      put(GEO.cyl6, '#c9a26b', u, 1.0, v, { sx: 0.022, sy: 1.3, sz: 0.022 });
      if (kind === 'rake') for (let k = 0; k < 5; k++) put(GEO.box, '#5a5a62', u, 0.3, v - 0.12 + k * 0.06, { sx: 0.02, sy: 0.14, sz: 0.02 });
      if (kind === 'spade') put(GEO.box, '#8a8f98', u, 0.32, v, { sx: 0.02, sy: 0.26, sz: 0.16 });
      if (kind === 'hoe') put(GEO.box, '#8a8f98', u - 0.04, 0.32, v, { sx: 0.12, sy: 0.02, sz: 0.16 });
      if (kind === 'fork') for (let k = 0; k < 3; k++) put(GEO.box, '#8a8f98', u, 0.3, v - 0.05 + k * 0.05, { sx: 0.015, sy: 0.24, sz: 0.015 });
    });
    put(GEO.box, '#8a6240', u0 - 0.04, 1.62, s.v, { sx: 0.06, sy: 0.08, sz: 1.6 }); // the hook rail
    // the potting bench in front: pots, a bag of compost, a trowel
    const pb = PLAN.bench;
    put(GEO.box, '#a06a3a', pb.u, 0.82, pb.v, { sx: 1.5, sy: 0.07, sz: 0.6 }); put(GEO.box, '#a06a3a', pb.u, 0.3, pb.v, { sx: 1.4, sy: 0.05, sz: 0.5 });
    for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) put(GEO.box, '#8a5a30', pb.u + s1 * 0.68, 0.41, pb.v + s2 * 0.25, { sx: 0.06, sy: 0.82, sz: 0.06 });
    for (let k = 0; k < 4; k++) put(GEO.cyl8, '#c86f4a', pb.u - 0.55 + k * 0.17, 0.92, pb.v + (k % 2) * 0.1, { sx: 0.07, sy: 0.13, sz: 0.07 });
    put(GEO.ico1, '#58a348', pb.u - 0.55, 1.04, pb.v, { sx: 0.08, sy: 0.07, sz: 0.08 });
    for (let k = 0; k < 3; k++) put(GEO.cyl8, '#c86f4a', pb.u + 0.4, 0.38 + k * 0.06, pb.v, { sx: 0.09 - k * 0.005, sy: 0.07, sz: 0.09 }); // a stack of pots underneath
    put(GEO.box, '#6b8a3a', pb.u + 0.38, 0.97, pb.v - 0.05, { sx: 0.4, sy: 0.24, sz: 0.28, rz: 0.08 });
    put(GEO.box, '#8a8f98', pb.u + 0.05, 0.87, pb.v + 0.18, { sx: 0.16, sy: 0.015, sz: 0.06 }); put(GEO.cyl6, '#c9a26b', pb.u - 0.08, 0.88, pb.v + 0.18, { sx: 0.022, sy: 0.12, sz: 0.022, rz: Math.PI / 2 });
    box(pb.u - 0.78, pb.u + 0.78, pb.v - 0.33, pb.v + 0.33);
  }
  { const p = PLAN.barrow, yaw = -0.5, c = Math.cos(yaw), s = Math.sin(yaw); // the wheelbarrow, a load of earth in it
    const at = (lu, lv) => [p.u + c * lu + s * lv, p.v - s * lu + c * lv];
    const pp = (geo, col, lu, y, lv, o) => { const [u, v] = at(lu, lv); put(geo, col, u, y, v, { ry: yaw, ...o }); };
    pp(GEO.box, '#3f7fb5', 0, 0.55, 0, { sx: 0.7, sy: 0.35, sz: 1.0, rx: 0.1 });
    pp(GEO.cyl12, '#2b2b2f', 0, 0.22, 0.55, { sx: 0.22, sy: 0.08, sz: 0.22, rz: Math.PI / 2 });
    for (const sg of [-1, 1]) pp(GEO.cyl6, '#8a6240', sg * 0.28, 0.55, -0.75, { sx: 0.03, sy: 0.9, sz: 0.03, rx: Math.PI / 2 - 0.3 });
    pp(GEO.ico1, '#5a3c26', 0, 0.72, 0, { sx: 0.3, sy: 0.14, sz: 0.4 });
    disc(p.u, p.v, 0.6); }
  // herb pots either side of the gate, inside
  for (const [u, k] of [[-1.5, 0], [-1.9, 1], [1.5, 2], [1.9, 0]]) { put(GEO.cyl8, '#c86f4a', u, 0.15, hd - 0.55 - (k % 2) * 0.3, { sx: 0.17, sy: 0.3, sz: 0.17 }); put(GEO.ico1, ['#7fcf5a', '#5a9a4a', '#9ed05a'][k], u, 0.37, hd - 0.55 - (k % 2) * 0.3, { sx: 0.18, sy: 0.15, sz: 0.18 }); }

  // ---- Joyce's corner: her rocking chair in the oak's shade facing the beds, a crate and a cup of tea beside it (you may sit),
  // and the lantern on its post by her chalkboard (a night spot)
  { const c0 = GARDEN_SPOTS.chair, [cx, cz] = W(c0.u, c0.v), cy = H(cx, cz), yaw = c0.yaw, c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (lx, lz) => [cx + c * lx + s * lz, cz - s * lx + c * lz];
    const pp = (geo, col, lx, ly, lz, sx2, sy2, sz2, rx = 0) => { const [px, pz] = at(lx, lz); b.add(geo, col, { x: px, y: cy + ly, z: pz, sx: sx2, sy: sy2, sz: sz2, ry: yaw, rx }); };
    pp(GEO.box, '#a06a3a', 0, 0.225, 0.02, 0.56, 0.06, 0.52); pp(GEO.box, '#e88fb3', 0, 0.275, 0.03, 0.46, 0.05, 0.42); // (seat-height: the cushion's top 0.3, was 0.515; all above it with it)
    for (const k of [-0.2, 0, 0.2]) pp(GEO.box, '#a06a3a', k, 0.585, -0.26, 0.07, 0.7, 0.05, -0.18);
    pp(GEO.box, '#a06a3a', 0, 0.905, -0.31, 0.56, 0.06, 0.06, -0.18);
    for (const sg of [-1, 1]) { pp(GEO.box, '#a06a3a', sg * 0.3, 0.445, 0.0, 0.05, 0.05, 0.5); pp(GEO.box, '#a06a3a', sg * 0.3, 0.335, 0.22, 0.05, 0.2, 0.05); for (const lz of [-0.22, 0.22]) pp(GEO.box, '#a06a3a', sg * 0.27, 0.1325, lz, 0.05, 0.145, 0.05); pp(GEO.box, '#8a5a30', sg * 0.27, 0.06, -0.06, 0.04, 0.05, 0.78); } // (seat-height: the legs and runners out at the seat's sides and the runners' noses short of the feet, which rest flat in front now) // (the runner a hair narrower than the legs: level with their sides, it flickered)
    pp(GEO.box, '#c9a26b', 0.72, 0.2, -0.05, 0.4, 0.4, 0.4); pp(GEO.cyl8, '#f4f2ea', 0.72, 0.43, -0.05, 0.08, 0.02, 0.08); pp(GEO.cyl8, '#f4f2ea', 0.72, 0.47, -0.05, 0.055, 0.07, 0.055);
    colliders.push({ type: 'circle', x: cx, z: cz, r: 0.42 }, { type: 'circle', x: at(0.72, -0.05)[0], z: at(0.72, -0.05)[1], r: 0.3 });
    addSeat(cx, cz, cy + 0.3, yaw, "Joyce's chair", "E  Sit in Joyce's chair"); }
  { const p = PLAN.lantern, [lx, lz] = W(p.u, p.v), ly = H(lx, lz);
    put(GEO.cyl6, '#3a3f47', p.u, 0.9, p.v, { sx: 0.05, sy: 1.8, sz: 0.05 }); put(GEO.box, '#3a3f47', p.u, 1.78, p.v + 0.16, { sx: 0.04, sy: 0.04, sz: 0.36 });
    put(GEO.box, lampGlow('#ffd98e'), p.u, 1.58, p.v + 0.32, { sx: 0.16, sy: 0.22, sz: 0.16 }); // (its glass glows at night: fire-season) put(GEO.cone6, '#3a3f47', p.u, 1.74, p.v + 0.32, { sx: 0.13, sy: 0.1, sz: 0.13 });
    addNightSpot({ x: lx, y: ly + 1.58, z: lz + 0.32, color: '#ffd98e', pool: 3.4, gy: ly, halo: 0.7, k: 0.55 });
    disc(p.u, p.v, 0.12); }

  return {
    noSign: true, rect: gardenBlock({ x: X, z: Z }),
    npcs: [npcSpec('joyce')],   // npc-looks.js
    spots: GARDEN_SPOTS.work.map(w => ({ x: X + w.u, z: Z + w.v, yaw: w.yaw })), // where she potters (npcs.js soloPlan): on the paths, not in the beds
    lines: ['Tomatoes are coming in!', 'Mind the carrots, dear.', 'Lovely morning for it.', 'Weeds, weeds, weeds.', 'My knees are not what they were.', 'Plenty of room to work now!'],
    idle: ['garden', 'garden', 'look', 'stretch'],
    pairs: [['talk', 'talk'], ['wave', 'wave']],
  };
}

// the little coloured tags at each bed's end (the crop's colour)
const LABEL = { lettuce: '#8fd45a', tilled: '#c9a26b', carrots: '#ff8a3a', strawberries: '#e8383c', tomatoes: '#e8483c', pumpkins: '#f08a2a' };

// The gate sign's face: a carved board naming the game (drawn once; the fonts redraw it when they load).
let signTex = null;
function SIGN_TEX() {
  if (signTex) return signTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 154;
  const g = c.getContext('2d');
  signTex = new THREE.CanvasTexture(c); signTex.colorSpace = THREE.SRGBColorSpace; signTex.anisotropy = 4;
  const draw = () => {
    g.fillStyle = '#6b4428'; g.fillRect(0, 0, 512, 154);
    g.globalAlpha = 0.18; g.fillStyle = '#000'; for (let y = 10; y < 154; y += 26) g.fillRect(0, y, 512, 3); g.globalAlpha = 1;
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 144);
    g.fillStyle = '#f6e3b0'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 58px "Fredoka", "Trebuchet MS", sans-serif'; g.fillText('Community Garden', 256, 58, 480);
    g.font = '500 32px "Fredoka", "Trebuchet MS", sans-serif'; g.fillText("Help Joyce with today's jobs", 256, 114, 470);
    signTex.needsUpdate = true;
  };
  draw();
  try { document.fonts?.load('700 62px "Fredoka"').then(draw, () => {}); } catch { /* no font API */ }
  return signTex;
}
