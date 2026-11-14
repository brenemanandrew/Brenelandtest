// Everything that lives on the water for fishing: ripple rings and splash drops (WaterFx), the fishing line and bobber
// (LineRig), and the fish shadows that loiter, dart, and come to nibble (FishSchool).
// All of it sits just above the water plane in the soft layer (no ink outlines), with depthWrite off so the ink pass
// never sees it. Nothing here allocates per frame.
import * as THREE from 'three';
import { soft, toon } from './toon.js';
import { GEO } from './batch.js';
import { coastSigned, WATER_Y } from './terrain.js';
import { inRowboat } from './rowboats.js';
import { DOCK } from './layout.js';
import { mulberry32, angleLerp, clamp } from './util.js';
import { SPECIES, ZONES, pickSpecies, sizeCm, sizeScale } from './fish-data.js';
import { buildLure, LURE_FIT } from './fish-gear-art.js';
import { poleOf, cleanBait } from './fish-gear.js';

const TAU = Math.PI * 2;
const INK = '#2b2340';

// Is (x, z) open water you could drop a bobber in (not the dock deck itself)?
export function isWater(x, z, margin = 0.8) {
  if (x > DOCK.minX - 0.6 && x < DOCK.maxX + 0.6 && z > DOCK.minZ - 0.6 && z < DOCK.maxZ + 0.6) return false;
  if (inRowboat(x, z)) return false;   // (rowboats.js: not into a moored rowboat either)
  return coastSigned(x, z) > margin;
}

// ------------------------------------------------------------------ ripples and splashes

export class WaterFx {
  constructor(scene) {
    const ringGeo = new THREE.RingGeometry(0.86, 1, 28).rotateX(-Math.PI / 2);
    this.rings = [];
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      m.visible = false; m.renderOrder = 6; m.frustumCulled = false;
      soft(m); scene.add(m);
      this.rings.push({ m, t: 0, dur: 1, maxR: 1, delay: 0, alive: false, a: 0.85 });
    }
    const dropMat = new THREE.MeshBasicMaterial({ color: '#ffffff', depthWrite: false });
    this.drops = [];
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(GEO.sphere, dropMat.clone());
      m.visible = false; m.renderOrder = 7; m.frustumCulled = false;
      soft(m); scene.add(m);
      this.drops.push({ m, vx: 0, vy: 0, vz: 0, life: 0, floor: WATER_Y, alive: false, sz: 0.05 });
    }
  }

  // a ripple ring at the water: maxR metres, dur seconds, optional delay
  ring(x, z, maxR = 1.1, dur = 1.1, delay = 0, a = 0.85) {
    let r = this.rings.find(q => !q.alive) || this.rings[0];
    r.alive = true; r.t = 0; r.dur = dur; r.maxR = maxR; r.delay = delay; r.a = a;
    r.m.position.set(x, WATER_Y + 0.03, z);
    r.m.scale.setScalar(0.01);
    r.m.visible = false;
  }
  rings3(x, z, size = 1) { this.ring(x, z, 0.9 * size, 1.0); this.ring(x, z, 1.5 * size, 1.3, 0.14); this.ring(x, z, 2.1 * size, 1.6, 0.3, 0.6); }

  // droplets flying up from a point; colour for crumbs, floor for the ground
  splash(x, z, n = 10, power = 1, y0 = WATER_Y + 0.05, color = '#ffffff', floor = WATER_Y, size = 0.05) {
    let made = 0;
    for (const d of this.drops) {
      if (d.alive) continue;
      const a = Math.random() * TAU, s = (0.4 + Math.random() * 0.9) * power;
      d.alive = true; d.life = 0.9; d.floor = floor; d.sz = size * (0.7 + Math.random() * 0.7);
      d.vx = Math.cos(a) * s * 0.7; d.vz = Math.sin(a) * s * 0.7; d.vy = (2 + Math.random() * 2.2) * power;
      d.m.material.color.set(color);
      d.m.position.set(x, y0, z); d.m.scale.setScalar(d.sz); d.m.visible = true;
      if (++made >= n) break;
    }
  }

  update(dt) {
    for (const r of this.rings) {
      if (!r.alive) continue;
      r.t += dt;
      if (r.t < r.delay) continue;
      const k = (r.t - r.delay) / r.dur;
      if (k >= 1) { r.alive = false; r.m.visible = false; continue; }
      r.m.visible = true;
      const e = 1 - (1 - k) * (1 - k);
      r.m.scale.setScalar(0.1 + r.maxR * e);
      r.m.material.opacity = r.a * (1 - k) * Math.min(1, k * 8);
    }
    for (const d of this.drops) {
      if (!d.alive) continue;
      d.life -= dt; d.vy -= 9 * dt;
      const p = d.m.position;
      p.x += d.vx * dt; p.y += d.vy * dt; p.z += d.vz * dt;
      if (d.life <= 0 || p.y < d.floor) { d.alive = false; d.m.visible = false; }
    }
  }
}

// ------------------------------------------------------------------ line and bobber

const _d = new THREE.Object3D();
export class LineRig {
  static cam = null;   // set by fishing.js: the camera, for the bobber's distance scaling
  constructor(scene, { seg = 14, radius = 0.011 } = {}) {
    this.seg = seg;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 5).rotateX(Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: INK }), seg);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    soft(this.mesh);
    this.radius = radius;
    // the end of the line: one lure per kind, made when first used and kept (fish-gear-art.js; setLure picks one)
    this.end = new THREE.Group();
    this.lures = {}; this.lure = ''; this.fit = LURE_FIT.none; this.pole = '';
    // an x-ray copy that shows only where something (you, the rod) is in front, so the bobber never hides behind the player
    const ghost = new THREE.Mesh(GEO.sphere, new THREE.MeshBasicMaterial({ color: '#ff5a4f', transparent: true, opacity: 0.6, depthWrite: false, depthFunc: THREE.GreaterDepth }));
    ghost.scale.setScalar(0.24); ghost.renderOrder = 9; ghost.frustumCulled = false; soft(ghost);
    this.ghost = ghost;
    // the spoon's flash: a star that winks now and then (only while the spoon is on)
    if (!LineRig.glintMat) LineRig.glintMat = new THREE.SpriteMaterial({ map: starTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.glint = new THREE.Sprite(LineRig.glintMat); this.glint.visible = false; this.glint.renderOrder = 10; soft(this.glint);
    this.group = new THREE.Group();
    this.group.add(this.mesh, this.end, ghost, this.glint);
    this.group.visible = false;
    scene.add(this.group);
    this.visible = false;
    this.setLure('none');
  }
  get bobber() { return this.end; }
  show(v) { this.visible = v; this.group.visible = v; }
  // which lure hangs on the end (fish-gear.js BAITS id)
  setLure(id) {
    id = cleanBait(id);
    if (id === this.lure) return;
    if (this.lures[this.lure]) this.lures[this.lure].visible = false;
    let m = this.lures[id];
    if (!m) { m = this.lures[id] = buildLure(id); this.end.add(m); }
    m.visible = true;
    this.lure = id; this.fit = LURE_FIT[id] || LURE_FIT.none;
    this.ghost.material.color.set(this.fit.ghost);
    this.glint.visible = false;
  }
  // the line's colour and thickness follow the pole (fish-gear.js POLES: string, green mono, orange, gold)
  setPole(id) {
    if (id === this.pole) return;
    this.pole = id;
    const P = poleOf(id);
    this.mesh.material.color.set(P.line); this.radius = P.lineR;
  }
  // tip: the rod tip in world space; bob: the bobber position (on the water, or the tie point in the air).
  // sag: how far the line droops mid-way, metres. wet: the lure sits on the water (else it hangs from the line).
  update(tip, bob, sag = 0.25, wet = true) {
    // far away a bobber is a speck: grow it with distance so it stays findable (never shrinks below life size)
    const cam = LineRig.cam;
    const k = cam ? Math.min(2.4, Math.max(1, Math.hypot(bob.x - cam.position.x, bob.z - cam.position.z) / 9)) : 1;
    const F = this.fit, m = this.lures[this.lure];
    // the line ties on above the float: lift the tie point so the float rides on the water line
    const ex = bob.x, ey = wet ? bob.y + F.wetY * k : bob.y, ez = bob.z;
    this.end.position.set(ex, ey, ez);
    this.end.scale.setScalar(k);
    this.end.rotation.set(0, Math.atan2(tip.x - ex, tip.z - ez), 0);   // facing the angler
    if (m) {
      // on the water it rocks a little; in the air the spoon twirls on the line
      const P = m.userData.pivot, t = performance.now() / 1000;
      P.rotation.set(wet ? F.wetRx : 0, !wet && F.spin ? t * F.spin : 0, wet ? 0.14 * Math.sin(t * 2.3 + bob.x) : 0);
    }
    this.ghost.position.set(bob.x, bob.y + 0.1, bob.z); this.ghost.scale.setScalar(F.size * k);
    if (this.lure === 'spoon') {
      // a wink every second or so: a quick swell and fade
      const t = (performance.now() / 1000) % 1.3, w = t < 0.35 ? Math.sin(t / 0.35 * Math.PI) : 0;
      this.glint.visible = w > 0.02;
      this.glint.position.set(bob.x, (wet ? bob.y + 0.06 : bob.y - 0.2 * k), bob.z);
      this.glint.scale.setScalar((0.25 + 0.45 * w) * k);
    }
    const n = this.seg;
    let px = tip.x, py = tip.y, pz = tip.z;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n;
      const nx = tip.x + (ex - tip.x) * t, nz = tip.z + (ez - tip.z) * t;
      const ny = tip.y + (ey - tip.y) * t - sag * 4 * t * (1 - t);
      const dx = nx - px, dy = ny - py, dz = nz - pz;
      const len = Math.hypot(dx, dy, dz) || 0.001;
      _d.position.set((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2);
      _d.lookAt(nx, ny, nz);
      _d.scale.set(this.radius, this.radius, len * 1.02);
      _d.updateMatrix();
      this.mesh.setMatrixAt(i, _d.matrix);
      px = nx; py = ny; pz = nz;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ the fish shadows

const MAX_FISH = 26;
function bodyGeo() {
  // an ellipse lying flat on the water, head toward +z (a triangle fan around a centre point)
  const n = 22, pos = [0, 0, 0.12], nor = [0, 1, 0], idx = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    pos.push(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.38 + 0.12); nor.push(0, 1, 0);
    idx.push(0, ((i + 1) % n) + 1, i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
function tailGeo() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.22, 0, -0.28, 0.22, 0, -0.28], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 2, 1]);
  return g;
}
function starTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,240,170,0.8)'); grd.addColorStop(1, 'rgba(255,220,100,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath(); g.moveTo(32, 2); g.lineTo(37, 27); g.lineTo(62, 32); g.lineTo(37, 37); g.lineTo(32, 62); g.lineTo(27, 37); g.lineTo(2, 32); g.lineTo(27, 27); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class FishSchool {
  constructor(scene, { seed = 7, getSlot = () => 0 } = {}) {
    this.rnd = mulberry32(seed);
    this.getSlot = getSlot;
    this.fish = [];
    this.bobber = null;        // { x, z } while a line is in the water
    this.busy = null;          // the fish that is approaching or nibbling
    this.onArrive = null;      // (fish) => void: a fish reached the bobber and is about to nibble
    this.appeal = null;        // (fish) => how keen it is on what is on the hook (fishing.js: the bait, fish-gear.js); 1 = as ever
    this.threat = { x: 0, z: 0, speed: 0, on: false };

    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.body = new THREE.InstancedMesh(bodyGeo(), mat, MAX_FISH);
    this.tail = new THREE.InstancedMesh(tailGeo(), mat, MAX_FISH);
    this.body.setColorAt(0, new THREE.Color('#ffffff')); this.tail.setColorAt(0, new THREE.Color('#ffffff'));
    for (const m of [this.body, this.tail]) { m.frustumCulled = false; m.renderOrder = 2; m.count = 0; soft(m); scene.add(m); }
    this.dark = new THREE.Color('#0b3651'); this.goldC = new THREE.Color().setRGB(2.2, 1.6, 0.15); // over-bright so it still reads as gold at 40% opacity
    // sparkles that follow the golden fish
    const glintMat = new THREE.MeshBasicMaterial({ map: starTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 });
    this.glints = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), glintMat);
      m.renderOrder = 3; m.visible = false; m.frustumCulled = false; soft(m); scene.add(m);
      this.glints.push(m);
    }

    this.dummy = new THREE.Object3D();
    this.dummy2 = new THREE.Object3D();
    for (const z of ZONES) for (let i = 0; i < z.n; i++) this.fish.push(this.make(z, false));
    // exactly one golden fish roams the whole lake, so somebody always has a chance
    this.gold = this.make(ZONES[0], true);
    this.fish.push(this.gold);
  }

  make(zone, gold) {
    const r = this.rnd;
    const id = gold ? 'golden' : pickSpecies(zone, this.getSlot(), r());
    const f = {
      zone, gold, id, sp: SPECIES[id], cm: 0, k: 1, x: 0, z: 0, yaw: r() * TAU, speed: 0, state: 'loiter',
      tx: 0, tz: 0, until: 0, pause: 0, calm: 0, alpha: 0, respawn: 0, phase: r() * TAU, chk: r(), thrash: 0, eager: 0.6 + r() * 0.8,
    };
    this.place(f);
    return f;
  }

  // (re)roll a fish's kind and put it somewhere in its zone
  place(f) {
    const r = this.rnd;
    if (!f.gold) f.id = pickSpecies(f.zone, this.getSlot(), r());
    else if (r() < 0.75) f.zone = ZONES[Math.floor(r() * ZONES.length)];
    f.sp = SPECIES[f.id];
    f.cm = sizeCm(f.id, r());
    f.k = sizeScale(f.id, f.cm);
    for (let i = 0; i < 20; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * f.zone.r;
      const x = f.zone.x + Math.cos(a) * d, z = f.zone.z + Math.sin(a) * d;
      if (coastSigned(x, z) > 2.6) { f.x = x; f.z = z; break; }
    }
    if (!f.x) { f.x = f.zone.x; f.z = f.zone.z; }
    f.tx = f.x; f.tz = f.z; f.state = 'loiter'; f.alpha = 0; f.until = 0; f.calm = 0; f.speed = 0;
  }

  retarget(f, now) {
    const r = this.rnd;
    if (r() < 0.28) { f.pause = 1 + r() * 2.2; f.until = now + f.pause; f.tx = f.x; f.tz = f.z; f.cruise = 0; return; }
    for (let i = 0; i < 8; i++) {
      const a = r() * TAU, d = 2 + r() * 5.5;
      let x = f.x + Math.cos(a) * d, z = f.z + Math.sin(a) * d;
      // wander home if it has strayed
      if (Math.hypot(x - f.zone.x, z - f.zone.z) > f.zone.r) { x = f.zone.x + (x - f.zone.x) * 0.5; z = f.zone.z + (z - f.zone.z) * 0.5; }
      if (coastSigned(x, z) > 2.2) { f.tx = x; f.tz = z; break; }
    }
    f.cruise = 0.3 + r() * 0.35;
    f.until = now + 3 + r() * 5;
  }

  dart(f, fromX, fromZ, now, secs = 1.1) {
    const a = Math.atan2(f.x - fromX, f.z - fromZ) + (this.rnd() - 0.5) * 0.9;
    f.state = 'dart'; f.dartYaw = a; f.until = now + secs; f.calm = 4 + this.rnd() * 3;
    if (this.busy === f) this.busy = null;
  }

  // The bobber just landed at (x, z): fish right underneath bolt.
  landBobber(x, z, now) {
    this.bobber = { x, z };
    for (const f of this.fish) {
      if (f.state === 'gone' || f.alpha < 0.3) continue;
      if (Math.hypot(f.x - x, f.z - z) < 1.1 + f.k * 0.3) this.dart(f, x, z, now);
    }
  }
  clearBobber() {
    this.bobber = null;
    // a fish that was hooked and let go (you walked off mid-reel) must swim on, not stay frozen under an empty spot
    for (const f of this.fish) if (f.state === 'approach' || f.state === 'nibble' || f.state === 'hooked') { f.state = 'loiter'; f.until = 0; f.calm = Math.max(f.calm, 3); }
    this.busy = null;
  }

  // fish that is hooked follows the bobber
  hook(f) { f.state = 'hooked'; f.thrash = 0; }
  spook(f, now) { this.dart(f, this.bobber ? this.bobber.x : f.x, this.bobber ? this.bobber.z : f.z, now, 1.6); f.calm = 8; }
  // caught: gone for a while, then a new fish somewhere in the zone
  take(f, now) {
    f.state = 'gone'; f.respawn = now + (f.gold ? 90 + this.rnd() * 60 : 20 + this.rnd() * 16);
    if (this.busy === f) this.busy = null;
  }

  // the nearest calm fish inside `r` of a point (used by the debug hook and hints)
  nearest(x, z, r = 99) {
    let best = null, bd = r;
    for (const f of this.fish) {
      if (f.state === 'gone' || f.alpha < 0.5) continue;
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }
  send(f, x, z, now) { f.state = 'approach'; f.tx = x; f.tz = z; f.until = now + 30; this.busy = f; }

  update(dt, now, player, camera) {
    const r = this.rnd, bob = this.bobber;
    const thr = this.threat;
    const scared = thr.on && thr.speed > 2.6;
    let n = 0;
    for (const f of this.fish) {
      if (f.state === 'gone') {
        f.alpha = Math.max(0, f.alpha - dt * 3);
        if (now > f.respawn) { this.place(f); }
        else if (f.alpha <= 0) continue;
      } else f.alpha = Math.min(1, f.alpha + dt * 0.8);

      f.phase += dt * (3 + f.speed * 2);
      const sp = f.sp;
      let want = 0, tyaw = f.yaw, turn = 2.2 / Math.sqrt(f.k * f.k * 0.6 + 0.4);
      switch (f.state) {
        case 'loiter': {
          if (now > f.until) this.retarget(f, now);
          const dx = f.tx - f.x, dz = f.tz - f.z, d = Math.hypot(dx, dz);
          if (d > 0.4 && (f.cruise || 0) > 0) { tyaw = Math.atan2(dx, dz); want = sp.speed * f.cruise; }
          else want = 0;
          if (f.calm > 0) f.calm -= dt;
          // a runner along the shore makes the nearby ones dart
          if (scared && Math.hypot(f.x - thr.x, f.z - thr.z) < 4.5 && f.calm <= 0) this.dart(f, thr.x, thr.z, now, 1.0);
          // a bobber in the water draws interest
          else if (bob && !this.busy && f.calm <= 0 && f.alpha > 0.8) {
            const bd = Math.hypot(f.x - bob.x, f.z - bob.z);
            if (bd < 5.5 && r() < dt * 0.45 * f.eager * (1 - bd / 6) * (this.appeal ? this.appeal(f) : 1)) this.send(f, bob.x, bob.z, now);
          }
          break;
        }
        case 'dart': {
          tyaw = f.dartYaw; want = sp.speed * 3.4; turn = 9;
          if (now > f.until) { f.state = 'loiter'; f.until = 0; }
          break;
        }
        case 'approach': {
          if (!bob) { f.state = 'loiter'; this.busy = null; break; }
          const dx = bob.x - f.x, dz = bob.z - f.z, d = Math.hypot(dx, dz);
          tyaw = Math.atan2(dx, dz); want = sp.speed * clamp(d * 0.6, 0.5, 1.0); turn = 3.2;
          if (d < 0.5) { f.state = 'nibble'; this.onArrive?.(f); }
          else if (now > f.until) { f.state = 'loiter'; this.busy = null; }
          break;
        }
        case 'nibble': {
          if (!bob) { f.state = 'loiter'; this.busy = null; break; }
          // hover under the bobber, turning slowly
          const a = now * 1.3 + f.phase;
          const gx = bob.x + Math.cos(a) * 0.32, gz = bob.z + Math.sin(a) * 0.32;
          f.x += (gx - f.x) * Math.min(1, dt * 4); f.z += (gz - f.z) * Math.min(1, dt * 4);
          tyaw = a + Math.PI / 2; want = 0; turn = 4;
          break;
        }
        case 'hooked': {
          if (!bob) break;
          f.thrash += dt;
          f.x = bob.x + Math.sin(f.thrash * 9) * 0.25; f.z = bob.z + Math.cos(f.thrash * 7) * 0.25;
          tyaw = f.thrash * 9; want = 0; turn = 12;
          break;
        }
      }
      // steer and swim
      f.yaw = angleLerp(f.yaw, tyaw, Math.min(1, dt * turn));
      f.speed += (want - f.speed) * Math.min(1, dt * 2.5);
      if (f.state !== 'nibble' && f.state !== 'hooked') {
        f.x += Math.sin(f.yaw) * f.speed * dt; f.z += Math.cos(f.yaw) * f.speed * dt;
        // keep to open water: a shore check every so often, then turn for home
        f.chk -= dt;
        if (f.chk < 0) {
          f.chk = 0.35;
          if (coastSigned(f.x + Math.sin(f.yaw) * 1.2, f.z + Math.cos(f.yaw) * 1.2) < 1.4) {
            f.tx = f.zone.x; f.tz = f.zone.z; f.cruise = 0.4; f.until = now + 4; f.yaw = angleLerp(f.yaw, Math.atan2(f.zone.x - f.x, f.zone.z - f.z), 0.7);
            if (f.state === 'dart') { f.dartYaw = f.yaw; }
          }
        }
      }
      // the golden fish drifts on to another part of the lake every so often
      if (f.gold && f.state === 'loiter' && f.alpha > 0.9 && now > (f.hop || (f.hop = now + 70 + r() * 60))) { f.hop = 0; f.state = 'gone'; f.respawn = now + 2; }

      // distance fade: no point drawing what you cannot see
      const dd = Math.hypot(f.x - camera.position.x, f.z - camera.position.z);
      const vis = f.alpha * clamp((150 - dd) / 40, 0, 1);
      if (vis <= 0.01 || n >= MAX_FISH) continue;

      const L = sp.len * f.k, W = sp.wid * f.k;
      const s = vis;
      const d = this.dummy;
      d.position.set(f.x, WATER_Y + 0.025, f.z);
      d.rotation.set(0, f.yaw, 0);
      d.scale.set(W * s, 1, L * s);
      d.updateMatrix();
      this.body.setMatrixAt(n, d.matrix);
      // the tail hangs off the back and wags faster the faster it swims
      const t = this.dummy2;
      const back = -0.24 * L * s;
      t.position.set(f.x + Math.sin(f.yaw) * back, WATER_Y + 0.025, f.z + Math.cos(f.yaw) * back);
      t.rotation.set(0, f.yaw + Math.sin(f.phase * 2.2) * (0.25 + f.speed * 0.15), 0);
      t.scale.set(W * 1.5 * s, 1, L * s);
      t.updateMatrix();
      this.tail.setMatrixAt(n, t.matrix);
      const col = f.id === 'golden' ? this.goldC : this.dark;
      this.body.setColorAt(n, col); this.tail.setColorAt(n, col);
      n++;
    }
    this.body.count = this.tail.count = n;
    this.body.instanceMatrix.needsUpdate = this.tail.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = this.tail.instanceColor.needsUpdate = true;

    // glints around the golden fish
    const g = this.gold, showG = g.alpha > 0.5 && g.state !== 'gone';
    this.glints.forEach((m, i) => {
      m.visible = showG;
      if (!showG) return;
      const a = now * 1.4 + i * 1.7, k = 0.5 + 0.5 * Math.sin(now * 3.1 + i * 2.3);
      m.position.set(g.x + Math.cos(a) * (0.35 + i * 0.12), WATER_Y + 0.05, g.z + Math.sin(a * 1.2) * (0.35 + i * 0.12));
      m.scale.setScalar(0.12 + 0.34 * k);
      m.rotation.y = a;
    });
  }
}
