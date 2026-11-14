// Little effects for the tire swing: falling leaves, dust puffs, confetti, stars over a dazed head, birds bursting out of
// the tree and the bush somebody lands in. Two instanced meshes (quads, puffs) and a handful of small objects, all
// allocated up front, so nothing is created per frame.
import * as THREE from 'three';
import { LAYER_SOFT, toon } from './toon.js';
import { GEO } from './batch.js';
import { groundHeight } from './terrain.js';

const N_QUAD = 260, N_PUFF = 90;
const dummy = new THREE.Object3D();
const col = new THREE.Color();

function starShape() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.2 : 0.5;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

export function createFx(scene, camera) {
  const root = new THREE.Group();
  root.name = 'swing-fx';
  scene.add(root);

  const mk = (geo, mat, n) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.frustumCulled = false; m.layers.set(LAYER_SOFT);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, col.set('#ffffff'));
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    root.add(m);
    return m;
  };
  const quadGeo = new THREE.CircleGeometry(0.5, 4);
  const quads = mk(quadGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: true }), N_QUAD);
  const puffs = mk(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ fog: true, transparent: true, opacity: 0.92 }), N_PUFF);

  // particle slots
  const mkSlots = n => Array.from({ length: n }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0, rx: 0, ry: 0, rz: 0, vrx: 0, vry: 0, vrz: 0, s: 1, life: 0, max: 1, g: 0, flutter: 0, kind: 0, grow: 0, drag: 0, ax: 0, ay: 0, az: 0, face: 0 }));
  const Q = mkSlots(N_QUAD), P = mkSlots(N_PUFF);
  let qHigh = 0, pHigh = 0;
  const take = (arr, hi) => { for (let i = 0; i < arr.length; i++) if (!arr[i].on) return i; return -1; };

  function spawnQuad(x, y, z, o) {
    const i = take(Q);
    if (i < 0) return;
    const p = Q[i];
    Object.assign(p, { on: true, x, y, z, vx: 0, vy: 0, vz: 0, rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, vrx: 0, vry: 0, vrz: 0, s: 0.2, life: 0, max: 3, g: 0, flutter: 0, grow: 0, drag: 0, kind: 0, ax: 0, ay: 0, az: 0, face: 0, ...o });
    quads.setColorAt(i, col.set(o.color || '#5daa45'));
    quads.instanceColor.needsUpdate = true;
    if (i >= qHigh) qHigh = i + 1;
  }
  function spawnPuff(x, y, z, o) {
    const i = take(P);
    if (i < 0) return;
    const p = P[i];
    Object.assign(p, { on: true, x, y, z, vx: 0, vy: 0, vz: 0, rx: 0, ry: Math.random() * 6, rz: 0, vrx: 0, vry: 0, vrz: 0, s: 0.3, life: 0, max: 0.9, g: 0, flutter: 0, grow: 1.4, drag: 2, ...o });
    puffs.setColorAt(i, col.set(o.color || '#eadcb8'));
    puffs.instanceColor.needsUpdate = true;
    if (i >= pHigh) pHigh = i + 1;
  }

  const hide = (mesh, i) => { dummy.position.set(0, -50, 0); dummy.scale.setScalar(0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); };
  const LEAF_COLS = ['#5daa45', '#6cb84c', '#8ad160', '#4f9a3e', '#d9b03a'];
  const CONF = ['#ff6fa8', '#ffd34d', '#5cd6a0', '#6fb8ff', '#ff8a4c', '#c08cff'];
  const SPARK = ['#fff6b0', '#ffd34d', '#ffffff', '#ffe27a'];
  const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---- stars over a dazed head (three real meshes, orbiting a moving point)
  const starGeo = starShape();
  const stars = new THREE.Group();
  const starMats = ['#ffd34d', '#fff27a', '#ffb347'].map(c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, fog: true }));
  const starMeshes = starMats.map(m => { const s = new THREE.Mesh(starGeo, m); s.scale.setScalar(0.24); s.layers.set(LAYER_SOFT); stars.add(s); return s; });
  stars.visible = false;
  root.add(stars);
  let starFn = null, starT = 0, starDur = 0;

  // ---- birds
  const birdCols = ['#e0574f', '#3f8fd9', '#f2c14e', '#8a6a4a', '#d98cb3', '#5cb87a'];
  const birds = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    const c = birdCols[i % birdCols.length];
    const body = new THREE.Mesh(GEO.sphere, toon(c)); body.scale.set(0.11, 0.09, 0.17); g.add(body);
    const head = new THREE.Mesh(GEO.sphere, toon(c)); head.scale.setScalar(0.075); head.position.set(0, 0.06, 0.13); g.add(head);
    const beak = new THREE.Mesh(GEO.cone6, toon('#f2a73b')); beak.scale.set(0.028, 0.07, 0.028); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.055, 0.21); g.add(beak);
    const eye = new THREE.Mesh(GEO.sphere, toon('#1c1a24')); eye.scale.setScalar(0.014); eye.position.set(0.04, 0.08, 0.17); g.add(eye);
    const tail = new THREE.Mesh(GEO.box, toon(c)); tail.scale.set(0.08, 0.015, 0.13); tail.position.set(0, 0.02, -0.2); tail.rotation.x = 0.3; g.add(tail);
    const wings = [-1, 1].map(s => {
      const w = new THREE.Group(); w.position.set(s * 0.07, 0.03, 0.02);
      const m = new THREE.Mesh(GEO.box, toon(c)); m.scale.set(0.22, 0.014, 0.12); m.position.x = s * 0.11; w.add(m);
      g.add(w); return w;
    });
    g.visible = false;
    root.add(g);
    birds.push({ g, wings, on: false, t: 0, vx: 0, vy: 0, vz: 0, max: 3, ph: 0 });
  }

  // ---- bushes (somebody landed in one)
  const bushes = [];
  function bush(x, z) {
    const g = new THREE.Group();
    const y = groundHeight(x, z);
    g.position.set(x, y, z);
    const cols = ['#4f9a3e', '#5daa45', '#478f39'];
    [[0, 0.55, 0, 0.85], [0.5, 0.42, 0.15, 0.6], [-0.5, 0.4, -0.1, 0.62], [0.05, 0.4, 0.5, 0.58], [-0.1, 0.38, -0.5, 0.55], [0.1, 0.95, 0.05, 0.5]].forEach(([bx, by, bz, r], i) => {
      const m = new THREE.Mesh(GEO.ico1, toon(cols[i % 3]));
      m.position.set(bx, by, bz); m.scale.set(r, r * 0.9, r);
      m.castShadow = true;
      g.add(m);
    });
    g.scale.setScalar(0.01);
    root.add(g);
    const h = { g, t: 0, life: 3, kill() { h.life = 0; } };
    bushes.push(h);
    return h;
  }

  // ---- public
  const api = {
    root,
    // leaves shaken loose from the crown; n leaves around (cx, cy, cz)
    leaves(cx, cy, cz, n = 1, spread = 2.4) {
      for (let i = 0; i < n; i++) {
        spawnQuad(cx + rnd(-spread, spread), cy + rnd(-0.6, 0.6), cz + rnd(-spread, spread), {
          color: LEAF_COLS[(Math.random() * LEAF_COLS.length) | 0], s: rnd(0.16, 0.26), max: rnd(3.2, 5),
          vx: rnd(-0.4, 0.4), vy: -rnd(0.5, 1.1), vz: rnd(-0.4, 0.4), vrx: rnd(-3, 3), vry: rnd(-3, 3), vrz: rnd(-4, 4), g: 0.4, flutter: rnd(1.2, 2.6), kind: 1,
        });
      }
    },
    dust(x, y, z, n = 6, size = 1, color = '#eadcb8') {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, sp = rnd(0.8, 2.6) * size;
        spawnPuff(x + Math.cos(a) * 0.2, y + 0.1, z + Math.sin(a) * 0.2, { vx: Math.cos(a) * sp, vy: rnd(0.4, 1.4), vz: Math.sin(a) * sp, s: rnd(0.25, 0.45) * size, max: rnd(0.55, 0.95), color, grow: 1.6 * size });
      }
    },
    // twinkles thrown off the tire the higher it swings: small gold and white diamonds that hang and fade
    sparkle(x, y, z, n = 6, spread = 0.7) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, sp = rnd(0.4, 1.4);
        spawnQuad(x + rnd(-spread, spread), y + rnd(-0.3, spread), z + rnd(-spread, spread), {
          color: SPARK[(Math.random() * SPARK.length) | 0], s: rnd(0.09, 0.17), max: rnd(0.5, 0.95),
          vx: Math.cos(a) * sp, vy: rnd(0.2, 1.2), vz: Math.sin(a) * sp, vrx: 0, vry: 0, vrz: rnd(-6, 6), g: 0.6, drag: 1.5, kind: 3, face: 1,
        });
      }
    },
    // wind lines streaking past somebody moving fast along (dx, dy, dz) (a unit direction): thin, long, quick
    wind(x, y, z, dx, dy, dz, n = 4, sp = 8) {
      for (let i = 0; i < n; i++) {
        const ox = rnd(-0.7, 0.7), oy = rnd(-0.4, 1.1), oz = rnd(-0.7, 0.7);
        spawnQuad(x + ox + dx * rnd(0.2, 1.2), y + oy, z + oz + dz * rnd(0.2, 1.2), {
          color: '#ffffff', s: rnd(0.5, 0.9), max: rnd(0.16, 0.26), vx: -dx * sp, vy: -dy * sp, vz: -dz * sp, g: 0, drag: 0, kind: 4, ax: dx, ay: dy, az: dz,
        });
      }
    },
    // grains kicked up where somebody lands in the sand (the puff itself is dust() in the sand's colour)
    spray(x, y, z, n = 16, color = '#e6cf8f') {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, sp = rnd(1.2, 3.4);
        spawnQuad(x + Math.cos(a) * 0.3, y + 0.05, z + Math.sin(a) * 0.3, {
          color: i % 3 ? color : '#f3e3b4', s: rnd(0.06, 0.11), max: rnd(0.6, 1.0),
          vx: Math.cos(a) * sp, vy: rnd(2.5, 4.6), vz: Math.sin(a) * sp, vrx: rnd(-9, 9), vry: rnd(-9, 9), vrz: rnd(-9, 9), g: 11, drag: 0.4, kind: 2,
        });
      }
    },
    confetti(x, y, z, n = 26) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, sp = rnd(1.5, 4.5);
        spawnQuad(x, y, z, {
          color: CONF[i % CONF.length], s: rnd(0.12, 0.2), max: rnd(1.6, 2.6),
          vx: Math.cos(a) * sp, vy: rnd(3, 6.5), vz: Math.sin(a) * sp, vrx: rnd(-9, 9), vry: rnd(-9, 9), vrz: rnd(-9, 9), g: 9, flutter: 0, drag: 0.6, kind: 2,
        });
      }
    },
    // the birds in the tree take off (they were hiding in the crown)
    birds(cx, cy, cz, n = 7) {
      let k = 0;
      for (const b of birds) {
        if (b.on || k >= n) continue;
        k++;
        const a = (k / n) * 6.283 + Math.random(), sp = rnd(2.2, 4.4);
        b.on = true; b.t = 0; b.max = rnd(2.6, 3.6); b.ph = Math.random() * 6;
        b.g.position.set(cx + Math.cos(a) * 0.9, cy + rnd(-0.4, 0.6), cz + Math.sin(a) * 0.9);
        b.vx = Math.cos(a) * sp; b.vz = Math.sin(a) * sp; b.vy = rnd(2.8, 5.2);
        b.g.rotation.y = Math.atan2(b.vx, b.vz);
        b.g.scale.setScalar(1);
        b.g.visible = true;
      }
    },
    bush,
    // (tests) how many of each kind of quad are alive (0 leaves/confetti... 3 twinkles, 4 wind lines) and puffs
    counts() { const k = [0, 0, 0, 0, 0]; for (let i = 0; i < qHigh; i++) if (Q[i].on) k[Q[i].kind | 0]++; let pf = 0; for (let i = 0; i < pHigh; i++) if (P[i].on) pf++; return { kinds: k, puffs: pf }; },
    // a ring of stars going round a point that fn(out) reports
    stars(fn, dur = 1.4) { starFn = fn; starT = 0; starDur = dur; stars.visible = true; },
    stopStars() { starFn = null; stars.visible = false; },
    update(dt, now) {
      if (qHigh) {
        let hi = 0;
        for (let i = 0; i < qHigh; i++) {
          const p = Q[i];
          if (!p.on) continue;
          p.life += dt;
          if (p.life >= p.max) { p.on = false; hide(quads, i); continue; }
          p.vy -= p.g * dt;
          if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vz *= k; }
          if (p.flutter) { p.vx += Math.sin(now * p.flutter * 3 + i) * dt * 1.2; p.vz += Math.cos(now * p.flutter * 2.3 + i) * dt * 1.2; if (p.vy < -1.3) p.vy = -1.3; }
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          p.rx += p.vrx * dt; p.ry += p.vry * dt; p.rz += p.vrz * dt;
          if (p.y < 3) { // leaves and confetti settle on the grass and linger a moment
            const gh = groundHeight(p.x, p.z) + 0.03;
            if (p.y < gh) { p.y = gh; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; p.vrx = p.vry = p.vrz = 0; p.g = 0; p.flutter = 0; p.max = Math.min(p.max, p.life + 1.2); }
          }
          const fade = Math.min(1, (p.max - p.life) / (p.kind >= 3 ? 0.2 : 0.5));
          dummy.position.set(p.x, p.y, p.z);
          if (p.kind === 4) { // a wind line: long along its direction, a hair wide
            _v.set(p.ax, p.ay, p.az); dummy.quaternion.setFromUnitVectors(_up, _v);
            dummy.scale.set(0.035, p.s * fade, 0.035);
          } else if (p.face) { // a twinkle: flat to the camera, spinning in its plane, growing then shrinking
            dummy.quaternion.copy(camera.quaternion); _q.setFromAxisAngle(_v.set(0, 0, 1), p.rz); dummy.quaternion.multiply(_q);
            const tw = Math.sin(Math.min(1, p.life / p.max) * Math.PI);
            dummy.scale.set(p.s * tw * 0.7, p.s * tw * 1.4, p.s);
          } else {
            dummy.rotation.set(p.rx, p.ry, p.rz);
            dummy.scale.set(p.s * fade * 0.75, p.s * fade, p.s * fade);
          }
          dummy.updateMatrix(); quads.setMatrixAt(i, dummy.matrix);
          hi = i + 1;
        }
        qHigh = hi; quads.count = hi;
        quads.instanceMatrix.needsUpdate = true;
      }
      if (pHigh) {
        let hi = 0;
        for (let i = 0; i < pHigh; i++) {
          const p = P[i];
          if (!p.on) continue;
          p.life += dt;
          if (p.life >= p.max) { p.on = false; hide(puffs, i); continue; }
          const k = Math.exp(-p.drag * dt); p.vx *= k; p.vz *= k; p.vy *= Math.exp(-1.5 * dt);
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          const t = p.life / p.max;
          const sc = p.s * (1 + p.grow * t) * (1 - t * t);
          dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, p.ry, 0); dummy.scale.setScalar(Math.max(0.001, sc));
          dummy.updateMatrix(); puffs.setMatrixAt(i, dummy.matrix);
          hi = i + 1;
        }
        pHigh = hi; puffs.count = hi;
        puffs.instanceMatrix.needsUpdate = true;
      }

      if (starFn) {
        starT += dt;
        if (starT > starDur) { starFn = null; stars.visible = false; }
        else {
          starFn(dummy.position);
          const fadeOut = Math.min(1, (starDur - starT) / 0.3), fadeIn = Math.min(1, starT / 0.15);
          starMeshes.forEach((m, i) => {
            const a = starT * 5.5 + (i / 3) * 6.283;
            m.position.set(dummy.position.x + Math.cos(a) * 0.42, dummy.position.y + 0.08 * Math.sin(a * 2 + i), dummy.position.z + Math.sin(a) * 0.42);
            m.quaternion.copy(camera.quaternion); m.rotateZ(starT * 3 + i); // flat stars that always face you
            m.scale.setScalar(0.24 * fadeIn * fadeOut);
          });
        }
      }

      for (const b of birds) {
        if (!b.on) continue;
        b.t += dt;
        if (b.t > b.max) { b.on = false; b.g.visible = false; continue; }
        b.vy -= 3.4 * dt * (b.t < 0.7 ? 0.3 : 1);
        if (b.vy < -0.3 && b.t > 0.7) b.vy = -0.3 + Math.sin(b.t * 5 + b.ph) * 0.8; // level out and flap away
        b.g.position.x += b.vx * dt; b.g.position.y += b.vy * dt; b.g.position.z += b.vz * dt;
        b.vx *= 1 + dt * 0.25; b.vz *= 1 + dt * 0.25;
        const fl = Math.sin(now * 34 + b.ph) * 0.95;
        b.wings[0].rotation.z = fl; b.wings[1].rotation.z = -fl;
        b.g.rotation.y = Math.atan2(b.vx, b.vz);
        b.g.rotation.x = -0.3;
        const fade = Math.min(1, (b.max - b.t) / 0.5);
        b.g.scale.setScalar(fade);
      }

      for (let i = bushes.length - 1; i >= 0; i--) {
        const h = bushes[i];
        h.t += dt; h.life -= dt;
        const pop = h.life > 0 ? Math.min(1, h.t / 0.28) : Math.max(0, 1 + h.life / 0.35);
        const k = h.life > 0 ? 1 + Math.sin(Math.min(1, h.t / 0.28) * Math.PI) * 0.25 : 1;
        h.g.scale.setScalar(Math.max(0.001, pop * k));
        if (h.life < -0.35) { root.remove(h.g); bushes.splice(i, 1); }
      }
    },
  };
  return api;
}
