// Tethered party balloons (the unicorn table in areas.js, the unicorn lawn's border in park.js).
// Each hangs on a taut string from a fixed anchor, a damped spring round its rest spot. The string is drawn every frame from
// the anchor to the knot, so the two always meet. The idle bob and sway are a pure function of the shared clock. Anyone running
// past pushes it and it bounces, then settles in a couple of seconds (local to each screen, capped at BAL.cap).
// No new meshes or materials, and only balloons within BAL.near of the camera are stepped.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';

export const BAL = {
  near: 25,      // m from the camera: balloons further away are not stepped
  cap: 0.7,      // m: the most a push can move the knot from its idle spot
  k: 14,         // spring stiffness (1/s^2): about 0.6 s a swing
  damp: 4.2,     // damping (1/s): a push dies out in about 2 s
  push: 26,      // how hard an overlap pushes (m/s^2 at full overlap)
  carry: 2.2,    // how much of a passer's velocity a full overlap hands on (1/s)
  reach: 0.18,   // m added to the passer's and the balloon's radii
  sway: 0.13,    // m: the idle sway of the knot
  bob: 0.03,     // m: the idle bob
};
export const KNOT = 1.13; // unit-sphere radii from the balloon's centre to the bottom of its knot

// One shared balloon geometry: a unit sphere with a little tied knot below it (the knot scales with the balloon, so at a
// typical 0.3 m radius it is ~4 cm long). Same attributes as GEO.sphere, so it takes any of the same materials.
let GEOM = null;
export function balloonGeometry() {
  if (GEOM) return GEOM;
  const ball = new THREE.SphereGeometry(1, 12, 8);
  const neck = new THREE.CylinderGeometry(0.035, 0.11, 0.08, 6, 1, true).translate(0, -1.02, 0);  // the neck pinched into the knot
  const knot = new THREE.SphereGeometry(0.075, 6, 4).scale(1, 0.75, 1).translate(0, -1.075, 0); // the knot (bottom at -1.13)
  GEOM = mergeGeometries([ball, neck, knot]);
  GEOM.computeBoundingSphere();
  return GEOM;
}

const list = [];
export const balloons = list;

// Register a balloon. ball: its mesh (balloonGeometry, scaled rx, ry, rz at inflation 1); string: a mesh of a unit
// cylinder along y (GEO.cyl6) whose x/z scale is the string's radius. Both must be children of a group at the origin.
// anchor: where the string is tied { x, y, z }; len: the string's length (anchor to knot, at rest straight up);
// ph: a phase so neighbours do not sway together. Returns the record (b.k = inflation 0..1, set by a pop animation).
export function addBalloon({ ball, string, anchor, len, ph = 0, radius = null }) {
  const sx = ball.scale.x, sy = ball.scale.y, sz = ball.scale.z;
  const b = {
    ball, string, ax: anchor.x, ay: anchor.y, az: anchor.z, len, ph, sx, sy, sz, sr: string.scale.x,
    r: radius ?? Math.max(sx, sz), k: 1,
    ox: 0, oz: 0, vx: 0, vz: 0,          // the local bounce: offset and velocity of the knot (m, m/s)
    kx: anchor.x, ky: anchor.y + len, kz: anchor.z, // the knot where it was last drawn
    active: false,
  };
  list.push(b);
  place(b, 0);
  return b;
}

// The idle knot offset at shared time t (seconds): pure, the same on every screen
export function idleOffset(b, t) {
  const p = b.ph;
  return {
    x: BAL.sway * (Math.sin(t * 0.8 + p) * 0.8 + Math.sin(t * 1.9 + p * 2.3) * 0.2),
    z: BAL.sway * (Math.cos(t * 0.6 + p * 1.3) * 0.8 + Math.sin(t * 1.7 + p * 0.7) * 0.2),
    dl: BAL.bob * Math.sin(t * 1.3 + p),
  };
}

const _u = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
function place(b, t) {
  const io = idleOffset(b, t);
  const L = b.len + io.dl;
  let hx = io.x + b.ox, hz = io.z + b.oz;
  const hl = Math.hypot(hx, hz), hmax = L * 0.95;
  if (hl > hmax) { hx *= hmax / hl; hz *= hmax / hl; }
  const hy = Math.sqrt(Math.max(0, L * L - hx * hx - hz * hz));
  b.kx = b.ax + hx; b.ky = b.ay + hy; b.kz = b.az + hz;
  _u.set(hx / L, hy / L, hz / L);
  _q.setFromUnitVectors(_up, _u);
  // the balloon: its knot on the string's end, leaning along the string
  const c = KNOT * b.sy * b.k;
  b.ball.position.set(b.kx + _u.x * c, b.ky + _u.y * c, b.kz + _u.z * c);
  b.ball.quaternion.copy(_q);
  b.ball.scale.set(b.sx * b.k, b.sy * b.k, b.sz * b.k);
  // the string: anchor to knot
  b.string.position.set(b.ax + hx / 2, b.ay + hy / 2, b.az + hz / 2);
  b.string.quaternion.copy(_q);
  b.string.scale.set(b.sr, L, b.sr);
}

// Passers-by this frame: [{ x, z, r, vx, vz }] (vx/vz m/s, 0 if unknown). Filled by main.js.
const prev = new WeakMap(); // passer object -> { x, z } last frame, for a velocity (a player who left is let go)
export function passer(out, key, x, z, r, dt) {
  let vx = 0, vz = 0;
  const p = key ? prev.get(key) : null;
  if (p && dt > 0) { vx = (x - p.x) / dt; vz = (z - p.z) / dt; if (vx * vx + vz * vz > 100) vx = vz = 0; } // a teleport is not a run
  if (key) { if (p) { p.x = x; p.z = z; } else prev.set(key, { x, z }); }
  out.push({ x, z, r, vx, vz });
}

// Is any balloon near enough to the camera to step? (main.js only gathers passers then)
export function anyNear(cx, cz) {
  const n2 = BAL.near * BAL.near;
  for (const b of list) if ((b.ax - cx) ** 2 + (b.az - cz) ** 2 < n2) return true;
  return false;
}

// One frame: t = shared seconds, (cx, cz) the camera, passers from passer()
export function updateBalloons(dt, t, cx, cz, passers) {
  const n2 = BAL.near * BAL.near;
  const h = Math.min(dt, 0.05);
  for (const b of list) {
    const near = (b.ax - cx) ** 2 + (b.az - cz) ** 2 < n2;
    if (!near) {
      if (b.active) { b.active = false; b.ox = b.oz = b.vx = b.vz = 0; } // out of sight: the bounce is forgotten
      continue;
    }
    b.active = true;
    if (h > 0) {
      // the pushes: the closest point of the string's shadow (anchor to the balloon, on the ground) to each passer
      let axx = 0, azz = 0;
      const bx = b.kx, bz = b.kz;
      for (const p of passers || []) {
        const R = p.r + b.r + BAL.reach;
        const ex = bx - b.ax, ez = bz - b.az, el = ex * ex + ez * ez;
        let s = el > 1e-6 ? ((p.x - b.ax) * ex + (p.z - b.az) * ez) / el : 1;
        s = Math.max(0, Math.min(1, s));
        const qx = b.ax + ex * s, qz = b.az + ez * s;
        let dx = bx - p.x, dz = bz - p.z;
        const d = Math.hypot(qx - p.x, qz - p.z);
        if (d >= R) continue;
        const w = (R - d) / R;
        let dl = Math.hypot(dx, dz);
        if (dl < 1e-4) { dx = 1; dz = 0; dl = 1; }
        axx += (dx / dl) * BAL.push * w + p.vx * BAL.carry * w;
        azz += (dz / dl) * BAL.push * w + p.vz * BAL.carry * w;
      }
      // the spring back to the idle spot, damped (semi-implicit Euler, stable at 20 fps)
      b.vx += (axx - BAL.k * b.ox - BAL.damp * b.vx) * h;
      b.vz += (azz - BAL.k * b.oz - BAL.damp * b.vz) * h;
      b.ox += b.vx * h; b.oz += b.vz * h;
      const o = Math.hypot(b.ox, b.oz);
      if (o > BAL.cap) { // the cap: back on the circle, and no more speed outward
        const nx = b.ox / o, nz = b.oz / o;
        b.ox = nx * BAL.cap; b.oz = nz * BAL.cap;
        const vo = b.vx * nx + b.vz * nz;
        if (vo > 0) { b.vx -= vo * nx; b.vz -= vo * nz; }
      }
      if (o < 1e-4 && Math.abs(b.vx) + Math.abs(b.vz) < 1e-4) b.ox = b.oz = b.vx = b.vz = 0;
    }
    place(b, t);
  }
}

// For tests: where everything is, read back from the meshes themselves
export function balloonState() {
  const v = new THREE.Vector3();
  return list.map((b, i) => {
    b.ball.updateMatrixWorld(); b.string.updateMatrixWorld();
    const knot = b.ball.localToWorld(v.set(0, -KNOT, 0)).clone();
    const top = b.string.localToWorld(v.set(0, 0.5, 0)).clone();
    const bottom = b.string.localToWorld(v.set(0, -0.5, 0)).clone();
    return {
      i, ph: b.ph, active: b.active, k: b.k,
      anchor: { x: b.ax, y: b.ay, z: b.az },
      knot: { x: knot.x, y: knot.y, z: knot.z }, top: { x: top.x, y: top.y, z: top.z }, bottom: { x: bottom.x, y: bottom.y, z: bottom.z },
      ball: { x: b.ball.position.x, y: b.ball.position.y, z: b.ball.position.z },
      off: Math.hypot(b.ox, b.oz), vel: Math.hypot(b.vx, b.vz),
    };
  });
}
