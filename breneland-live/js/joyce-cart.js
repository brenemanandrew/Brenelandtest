// Joyce's pink golf cart and the touches at her house. Where the cart is and what Joyce does is joyce-day.js's (pure, shared), this
// only draws it: a chunky cel-shaded cart (candy-pink body, a canopy with a white fringe, a cream and pink bench with Molly's
// stars-and-stripes towel on her side, after docs/refs/andrew-molly-1.jpg, garden things in the back), wheels that turn and steer,
// and at home a flower bed, a garden gnome and a pink flamingo (it lives in her garage: joyce-house.js). Players can't drive it.
// It's solid (a parked collider, a moving body).
import * as THREE from 'three';
import { Batcher, GEO } from './batch.js';
import { toon } from './toon.js';
import { groundHeight } from './terrain.js';
import { joyceAt, homeOf, CART, cartXZ } from './joyce-day.js';
import { wrapAngle, clamp } from './util.js';
import { vehicleShape, partsMesh, wheelGroups } from './vehicle-models.js';   // (props-vehicles) the Blender cart when loaded

const PINK = '#ff8fca', PINK_D = '#f46aae', PINK_L = '#ffc2df', CREAM = '#f6ecd8', BLACK = '#2a2a31', WHITE = '#fbf8f1', CHROME = '#d9dde3';

// the body, in the cart's frame (forward +z, +x the driver's side, y up from the ground)
function buildBody(b) {
  const box = (x0, y0, z0, x1, y1, z1, c, o = {}) => b.add(GEO.box, c, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, sx: x1 - x0, sy: y1 - y0, sz: z1 - z0, ...o });
  const cyl = (x, y, z, r, len, c, o = {}) => b.add(GEO.cyl12, c, { x, y, z, sx: r, sy: len, sz: r, ...o });
  // chassis and the floor
  box(-0.58, 0.22, -1.12, 0.58, CART.floorY, 1.08, PINK_D);
  box(-0.5, CART.floorY - 0.005, -0.02, 0.5, CART.floorY + 0.01, 0.52, '#3b3b44');          // the rubber floor mat in the footwell
  // the nose: a rounded cowl, a dash and a white bumper with two round headlights
  box(-0.6, CART.floorY, 0.56, 0.6, 0.66, 1.1, PINK);
  cyl(0, 0.66, 0.83, 0.27, 1.2, PINK, { rz: Math.PI / 2, sx: 0.27, sz: 0.27 });
  box(-0.6, 0.66, 0.56, 0.6, 0.86, 0.66, PINK);                                              // the dash's top lip
  box(-0.56, 0.42, 0.5, 0.56, 0.84, 0.57, CREAM);                                            // the dash face
  box(-0.44, 0.6, 0.47, -0.08, 0.76, 0.5, '#3b3b44');                                        // the cubby
  box(-0.64, 0.24, 1.08, 0.64, 0.4, 1.2, WHITE);                                             // bumper
  for (const s of [-1, 1]) { b.add(GEO.sphere, CHROME, { x: s * 0.38, y: 0.72, z: 1.08, sx: 0.11, sy: 0.11, sz: 0.06 }); }
  // a daisy on the nose
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; b.add(GEO.sphere, WHITE, { x: Math.cos(a) * 0.07, y: 0.9 + Math.sin(a) * 0.07, z: 0.96, sx: 0.055, sy: 0.055, sz: 0.02, rx: -0.5 }); }
  b.add(GEO.sphere, '#ffd34d', { x: 0, y: 0.9, z: 0.975, sx: 0.04, sy: 0.04, sz: 0.02, rx: -0.5 });
  // the steering column and wheel (the driver's side)
  b.add(GEO.cyl8, BLACK, { x: CART.driverX, y: 0.72, z: 0.4, sx: 0.025, sy: 0.5, sz: 0.025, rx: -0.55 });
  b.add(new THREE.TorusGeometry(0.17, 0.026, 6, 18), BLACK, { x: CART.driverX, y: 0.95, z: 0.27, rx: -1.0 });
  b.add(GEO.cyl8, BLACK, { x: CART.driverX, y: 0.95, z: 0.27, sx: 0.04, sy: 0.04, sz: 0.04, rx: Math.PI / 2 - 1.0 });
  // the bench: a pink base, a cream cushion and back with pink bolsters
  const sz0 = CART.seatZ - 0.3, sz1 = CART.seatZ + 0.3;
  box(-0.6, CART.floorY, sz0, 0.6, CART.seatY - 0.1, sz1, PINK);
  box(-0.57, CART.seatY - 0.1, sz0 + 0.02, 0.57, CART.seatY, sz1, CREAM);
  for (const s of [-1, 1]) box(s * 0.57 - 0.05, CART.seatY - 0.1, sz0 + 0.02, s * 0.57 + 0.05, CART.seatY + 0.02, sz1, PINK_D);
  box(-0.57, CART.seatY + 0.02, sz0 - 0.1, 0.57, CART.seatY + 0.52, sz0, CREAM, { rx: -0.12 });
  box(-0.6, CART.seatY + 0.42, sz0 - 0.13, 0.6, CART.seatY + 0.56, sz0 - 0.02, PINK_D, { rx: -0.12 });
  box(-0.02, CART.seatY + 0.02, sz0 - 0.1, 0.02, CART.seatY + 0.5, sz0 + 0.005, PINK_D, { rx: -0.12 });     // the seam between the two seats
  // Molly's beach towel on her side: red and white stripes, a blue corner
  for (let k = 0; k < 7; k++) { const x0 = -0.55 + k * 0.074; box(x0, CART.seatY, sz0 + 0.04, x0 + 0.074, CART.seatY + 0.012, sz1 + 0.03, k % 2 ? WHITE : '#d8343c'); }
  box(-0.55, CART.seatY + 0.013, sz1 - 0.2, -0.36, CART.seatY + 0.02, sz1 + 0.031, '#2f4f9a');
  box(-0.55, CART.seatY - 0.16, sz1 + 0.02, -0.04, CART.seatY + 0.012, sz1 + 0.035, '#d8343c');          // the towel hanging over the front edge
  // the back: a pink tub with a little rack, and Joyce's garden things
  box(-0.6, CART.floorY, -1.12, 0.6, 0.62, sz0 - 0.02, PINK);
  box(-0.62, 0.24, -1.2, 0.62, 0.38, -1.1, WHITE);
  for (const s of [-1, 1]) box(s * 0.55 - 0.02, 0.62, -1.1, s * 0.55 + 0.02, 0.86, -1.06, BLACK);
  box(-0.57, 0.84, -1.1, 0.57, 0.87, -1.06, BLACK);
  b.add(GEO.cyl8, '#c86f4a', { x: -0.28, y: 0.72, z: -0.86, sx: 0.12, sy: 0.2, sz: 0.12 });                 // a flower pot of geraniums
  for (let k = 0; k < 5; k++) b.add(GEO.ico1, k % 2 ? '#e8483c' : '#4f9a3e', { x: -0.28 + Math.cos(k * 1.26) * 0.06, y: 0.87 + (k % 2) * 0.04, z: -0.86 + Math.sin(k * 1.26) * 0.06, sx: 0.07, sy: 0.06, sz: 0.07 });
  b.add(GEO.cyl8, '#3fa06a', { x: 0.24, y: 0.73, z: -0.88, sx: 0.11, sy: 0.22, sz: 0.11 });                 // the watering can
  b.add(GEO.cyl6, '#3fa06a', { x: 0.39, y: 0.8, z: -0.88, sx: 0.022, sy: 0.24, sz: 0.022, rz: -0.95 });
  b.add(GEO.cyl6, '#c9a26b', { x: 0.05, y: 1.05, z: -0.98, sx: 0.022, sy: 1.1, sz: 0.022, rx: -0.45, rz: 0.12 }); // a rake leaning in the back
  for (let k = 0; k < 5; k++) b.add(GEO.box, '#6b6f78', { x: 0.12 + (k - 2) * 0.05, y: 1.57, z: -1.22, sx: 0.015, sy: 0.12, sz: 0.015, rx: -0.45 });
  b.add(GEO.box, '#6b6f78', { x: 0.12, y: 1.62, z: -1.2, sx: 0.24, sy: 0.025, sz: 0.025, rx: -0.45 });
  // the canopy on four black posts, with a white fringe
  const top = CART.roofY - 0.05;
  const post = (x, y0, z0, z1) => { const dy = top - y0, dz = z1 - z0; b.add(GEO.cyl8, BLACK, { x, y: (y0 + top) / 2, z: (z0 + z1) / 2, sx: 0.026, sy: Math.hypot(dy, dz), sz: 0.026, rx: Math.atan2(dz, dy) }); };
  for (const s of [-1, 1]) { post(s * 0.54, 0.84, 0.58, 0.42); post(s * 0.54, 0.6, -1.0, -1.0); }
  box(-0.7, CART.roofY - 0.06, -1.12, 0.7, CART.roofY + 0.04, 0.68, PINK_D);
  box(-0.64, CART.roofY + 0.04, -1.06, 0.64, CART.roofY + 0.09, 0.62, PINK);
  const fringe = (x, z) => b.add(GEO.sphere, WHITE, { x, y: CART.roofY - 0.08, z, sx: 0.055, sy: 0.05, sz: 0.055 });
  for (let k = 0; k <= 14; k++) { const z = -1.1 + k * (1.76 / 14); fringe(0.71, z); fringe(-0.71, z); }
  for (let k = 0; k <= 11; k++) { const x = -0.66 + k * (1.32 / 11); fringe(x, 0.69); fringe(x, -1.13); }
}
function buildWheel(b) {
  b.add(GEO.cyl12, '#232327', { sx: CART.wheelR, sy: 0.17, sz: CART.wheelR, rz: Math.PI / 2 });
  for (const s of [-1, 1]) {
    b.add(GEO.cyl12, WHITE, { x: s * 0.088, sx: CART.wheelR * 0.6, sy: 0.012, sz: CART.wheelR * 0.6, rz: Math.PI / 2 });
    b.add(GEO.cyl8, PINK, { x: s * 0.096, sx: CART.wheelR * 0.24, sy: 0.012, sz: CART.wheelR * 0.24, rz: Math.PI / 2 });
    b.add(GEO.box, PINK, { x: s * 0.096, y: CART.wheelR * 0.38, sx: 0.012, sy: 0.05, sz: 0.05 });      // a spot on the hub (you can see it turn)
  }
}

// her house's touches out front: the flower bed, the gnome and the flamingo (the house, its garage and the driveway the cart lives
// on are joyce-house.js's)
function buildHome(group, colliders) {
  const H = homeOf(), b = new Batcher({ vertexColors: true });
  // the flower bed along the front wall: dark soil, a white edging and pinks and purples (Joyce's petunias)
  const bd = H.bed, by = groundHeight(bd.x, bd.z);
  b.boxMinMax(bd.x - 1.4, by - 0.05, bd.z - 0.4, bd.x + 1.4, by + 0.12, bd.z + 0.4, '#4a3020');
  b.boxMinMax(bd.x - 1.45, by - 0.05, bd.z + 0.4, bd.x + 1.45, by + 0.18, bd.z + 0.48, WHITE);
  const cols = ['#ff6fae', '#b46fd8', '#ff9fcb', '#f2f2f8', '#e8483c', '#b46fd8', '#ff6fae'];
  for (let i = 0; i < 13; i++) {
    const x = bd.x - 1.2 + i * 0.2, z = bd.z + (i % 2 ? 0.14 : -0.12);
    b.add(GEO.ico1, '#4f9a3e', { x, y: by + 0.2, z, sx: 0.13, sy: 0.1, sz: 0.13 });
    b.add(GEO.sphere, cols[i % cols.length], { x, y: by + 0.3, z: z + 0.03, sx: 0.07, sy: 0.06, sz: 0.07 });
  }
  // the gnome: a red pointy hat, a white beard, a blue coat, holding a tiny spade
  const g = H.gnome, gy = groundHeight(g.x, g.z);
  b.add(GEO.cyl8, '#3f6fb5', { x: g.x, y: gy + 0.13, z: g.z, sx: 0.11, sy: 0.26, sz: 0.11 });
  b.add(GEO.sphere, '#f0c8a0', { x: g.x, y: gy + 0.33, z: g.z, sx: 0.085, sy: 0.085, sz: 0.085 });
  b.add(GEO.cone6, WHITE, { x: g.x, y: gy + 0.25, z: g.z - 0.06, sx: 0.08, sy: 0.16, sz: 0.04, rx: Math.PI });
  b.add(GEO.sphere, '#ff8a8a', { x: g.x, y: gy + 0.33, z: g.z - 0.085, sx: 0.025, sy: 0.022, sz: 0.02 });
  b.add(GEO.cone8, '#e0463c', { x: g.x, y: gy + 0.5, z: g.z, sx: 0.095, sy: 0.26, sz: 0.095, rx: -0.15 });
  b.add(GEO.box, '#3a2a20', { x: g.x, y: gy + 0.02, z: g.z, sx: 0.24, sy: 0.04, sz: 0.2 });
  b.add(GEO.box, '#8a8f98', { x: g.x + 0.12, y: gy + 0.12, z: g.z - 0.06, sx: 0.06, sy: 0.08, sz: 0.012 });
  colliders.push({ type: 'circle', x: g.x, z: g.z, r: 0.18 });
  // the pink flamingo on the lawn
  const f = H.flamingo, fy = groundHeight(f.x, f.z);
  for (const s of [-1, 1]) b.add(GEO.cyl6, '#3a3a3a', { x: f.x + s * 0.04, y: fy + 0.25, z: f.z, sx: 0.012, sy: 0.5, sz: 0.012 });
  b.add(GEO.sphere, PINK, { x: f.x, y: fy + 0.58, z: f.z + 0.02, sx: 0.12, sy: 0.1, sz: 0.2, rx: 0.2 });
  b.add(GEO.cyl6, PINK, { x: f.x, y: fy + 0.74, z: f.z - 0.12, sx: 0.025, sy: 0.3, sz: 0.025, rx: 0.35 });
  b.add(GEO.sphere, PINK, { x: f.x, y: fy + 0.9, z: f.z - 0.16, sx: 0.05, sy: 0.05, sz: 0.06 });
  b.add(GEO.cone6, '#2a2a2a', { x: f.x, y: fy + 0.87, z: f.z - 0.23, sx: 0.02, sy: 0.07, sz: 0.02, rx: -2.2 });
  colliders.push({ type: 'circle', x: f.x, z: f.z, r: 0.15 });
  b.build(group, 'joyce-home').forEach(m => { m.castShadow = true; m.receiveShadow = true; });
}

export function createJoyceCart(ctx) {
  const { scene, colliders, npcs, net } = ctx;
  const joyce = npcs.npcs.find(d => d.joyce);
  if (!joyce) return null;   // no garden in this lobby, so Joyce has no day of her own
  const root = new THREE.Group(); root.name = 'joyce-cart'; scene.add(root);
  buildHome(root, colliders);
  const cart = new THREE.Group(); cart.name = 'joyce-golf-cart'; root.add(cart);
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fff3c0', fog: true });
  const model = !!vehicleShape('cart');
  let wheels = [];
  if (model) {
    // (props-vehicles) the Blender cart: the body one mesh, both headlamps one (the lamp material), four wheels that steer and roll
    const body = partsMesh('cart'); body.name = 'joyce-cart-body'; cart.add(body);
    const lamps = partsMesh('cart', (n, p) => p.kind === 'lamp', lampMat); if (lamps) { lamps.name = 'joyce-cart-lamps'; lamps.castShadow = false; cart.add(lamps); }
    wheels = wheelGroups('cart', cart);
    for (const w of wheels) w.roll.name = 'joyce-cart-wheel';
  } else {
    const bb = new Batcher({ vertexColors: true });
    buildBody(bb);
    bb.build(cart, 'joyce-cart-body');
    const lb = new Batcher({ castShadow: false });
    for (const s of [1, -1]) lb.add(GEO.sphere, lampMat, { x: s * 0.38, y: 0.72, z: 1.115, sx: 0.075, sy: 0.075, sz: 0.03 });
    lb.build(cart, 'joyce-cart-lamps');   // both headlamps one mesh
    // the wheels: the back pair turn together, the front ones also steer
    const wb = new Batcher({ vertexColors: true }); buildWheel(wb);
    const wheelGeo = new THREE.Group(); wb.build(wheelGeo, 'joyce-cart-wheel');
    for (const [ai, az] of CART.axles.entries()) for (const s of [-1, 1]) {
      const steer = new THREE.Group(); steer.position.set(s * CART.track, CART.wheelR, az); cart.add(steer);
      const roll = wheelGeo.clone(); steer.add(roll);
      wheels.push({ steer, roll, front: ai === 0 });
    }
  }
  cart.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.noMerge = true; } });
  // solid: three circles along it (parked or not; a moving cart also pushes you through bodies())
  const cols = [-0.75, 0, 0.75].map(lz => { const c = { type: 'circle', x: 0, z: 0, r: 0.66, noCrowd: true, joyceCart: true, moves: true }; colliders.push(c); return { c, lz }; });
  const bodiesOut = [{ x: 0, z: 0, r: 0.7 }, { x: 0, z: 0, r: 0.7 }, { x: 0, z: 0, r: 0.7 }];
  let last = null, roll = 0, steer = 0, J = null;
  function place(c, dt) {
    const y = groundHeight(c.x, c.z);
    cart.position.set(c.x, y, c.z); cart.rotation.y = c.yaw;
    if (last) {
      const dx = c.x - last.x, dz = c.z - last.z, along = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw), dist = Math.hypot(dx, dz);
      if (dist < 3) {
        roll += along / CART.wheelR;
        // steering from the turn per metre (the bicycle model over the wheelbase), eased
        const k = dist > 0.004 ? wrapAngle(c.yaw - last.yaw) / dist : 0, want = clamp(Math.atan(k * (CART.axles[0] - CART.axles[1])) * Math.sign(along || 1), -0.6, 0.6);
        steer += (want - steer) * Math.min(1, dt * 6);
      }
    }
    for (const w of wheels) { w.roll.rotation.x = roll; w.steer.rotation.y = w.front ? steer : 0; }
    last = { x: c.x, z: c.z, yaw: c.yaw };
    for (let i = 0; i < 3; i++) {
      const [x, z] = cartXZ(c, 0, cols[i].lz);
      cols[i].c.x = x; cols[i].c.z = z; cols[i].c.off = !!c.moving;
      bodiesOut[i].x = x; bodiesOut[i].z = z;
    }
  }
  function update(dt) {
    J = joyce._s?.joyce || joyceAt(net.serverNow());
    const c = J.cart;
    if (!c) return;
    if (!c.moving && last && last.x === c.x && last.z === c.z && last.yaw === c.yaw) return;   // parked: nothing to do
    place(c, Math.min(dt || 0.033, 0.1));
  }
  update(0);
  return {
    name: 'joycecart',
    update,
    bodies() { return J && J.cart && J.cart.moving ? bodiesOut : []; },
    api: { get state() { return J; }, cart, root, colliders: () => cols.map(q => q.c), wheels, model },
  };
}
