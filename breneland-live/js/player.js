// The local player: movement, collision with the world, and the follow camera.
import * as THREE from 'three';
import { Human, avatarLook } from './human.js';
import { ANIM_CODES, HELD_CODES, emoteTime } from './codes.js';
import { rodHeld } from './fish-gear.js';
import { groundHeight, coastSigned, onSurface } from './terrain.js';
import { WALK, HOUSE, PORCH, STEPS } from './layout.js';
import { pointInPoly, closestOnPoly, angleLerp, clamp } from './util.js';
import { Input } from './input.js';
import { colliderGrid } from './collider-grid.js';

export { ANIM_CODES, HELD_CODES, avatarLook };
const VAULT_GAP = 6; // seconds between vaults
const GRID_REACH = 1; // m: collide() picks the colliders for anywhere this far round you (collider-grid.js)

export class Player {
  constructor(scene, profile, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.gear = { pole: 'stick', bait: 'none' }; // which rod 'rod' is and the lure on it (fishing.js: setGear)
    this.setProfile(profile);
    this.pos = new THREE.Vector3(0, HOUSE.floorY, 0);
    this.vel = new THREE.Vector2();
    this.vy = 0;
    this.yaw = Math.PI;
    this.grounded = true;
    this.emote = null; this.emoteUntil = 0;
    this.emoteMate = null; // the remote a high five is with (main.js doEmote)
    this.pin = null;       // { x, z, yaw }: where you stand while an emote holds you somewhere (your place in a ballroom pair, dance-pair.js)
    this.controls = false;
    this.houseSolid = false;
    this.radius = 0.38;
    this.speed = 0;
    this.stepPhase = 0;
    this.onStep = null; // callback(surfaceX, surfaceZ) for footsteps
    // A feature (fishing, the tire swing) can take the wheel: while `takeover` is set, the player does not walk.
    //   takeover = { anim: 'swing', update(dt, now, input, player) {...}, camera?(dt, camera, input, now, player) -> true if it placed the camera }
    // The takeover moves player.pos / player.yaw itself and names the pose in `anim`. Set it back to null to give control back.
    this.takeover = null;
    this.held = null; // what is in the right hand: null | 'rod' | 'treat' | 'fish' (see codes.js HELD_CODES)
    this.dynamic = null; // () => [{ x, z, r }]: people and animals to bump into (main.js)
    this.vault = null; this.vaultCd = 0; this.onVault = null; // vaulting a fence (tryVault)
    this.waterOK = null; // (x, z) => true where a feature lets you into the water (swimming, swim.js)

    this.cam = { yaw: 0, pitch: 0.32, dist: 7.5, targetDist: 7.5, pos: new THREE.Vector3(), look: new THREE.Vector3(), manualAt: 0 };
  }

  setProfile(profile) {
    const old = this.character;
    this.profile = profile;
    this.character = new Human(avatarLook(profile));
    if (old) {
      this.character.root.position.copy(old.root.position);
      this.character.root.rotation.copy(old.root.rotation);
      this.scene.remove(old.root);
    }
    this.scene.add(this.character.root);
    this.character.setLure?.(this.gear.bait);
    if (this.held) this.character.setHeld?.(this.held === 'rod' ? rodHeld(this.gear.pole) : this.held);
  }

  get animName() {
    if (this.vault) return 'vault';
    if (this.takeover) return this.takeover.anim || 'idle';
    if (this.emote) return this.emote;
    if (!this.grounded) return 'jump';
    if (this.speed > 5.5) return 'run';
    if (this.speed > 0.2) return 'walk';
    return 'idle';
  }
  get animCode() { return Math.max(0, ANIM_CODES.indexOf(this.animName)); }
  get heldCode() { return Math.max(0, HELD_CODES.indexOf(this.held === 'rod' ? rodHeld(this.gear.pole) : this.held)); }

  setHeld(kind, opts) { this.held = kind || null; this.character.setHeld?.(this.held === 'rod' ? rodHeld(this.gear.pole) : this.held, opts); }
  // the fishing gear: a rod in hand is rebuilt as the new pole, the lure on its tip swapped
  setGear(pole, bait) {
    this.gear = { pole, bait };
    this.character.setLure?.(bait);
    if (this.held === 'rod') this.character.setHeld?.(rodHeld(pole));
  }

  playEmote(name, now) {
    this.emote = name;
    this.emoteUntil = now + emoteTime(name);
  }

  place(x, z, yaw) {
    this.pos.set(x, groundHeight(x, z), z);
    this.yaw = yaw;
    this.character.root.position.copy(this.pos);
    this.character.root.rotation.y = yaw;
  }

  // Scripted walking for the intro (no collision).
  scriptedMove(x, z, yaw, speed, dt, now) {
    this.pos.set(x, groundHeight(x, z), z);
    this.yaw = yaw;
    this.speed = speed;
    this.character.root.position.copy(this.pos);
    this.character.root.rotation.y = yaw;
    this.character.update(dt, now, speed, this.emote);
    this.footsteps(dt, speed);
  }

  // Wet: over a lake and not on the dock, a porch or a floor. A feature (swimming) may say some water is fine.
  wet(x, z) {
    if (coastSigned(x, z) < -0.45 || onSurface(x, z)) return false;
    return !this.waterOK?.(x, z);
  }

  // out of a circle to its rim. Dead on a fixed solid's centre (placed there, e.g. in a dog bed) it's out the way you came, else
  // the first of eight ways round (north first) that lands clear of the other solids (judged where you end up once out of every
  // circle round that spot too, like a dog lying in its bed).
  // Only the fixed solids do this: a body (a player, a dog) dead on your spot is left alone, because people are put on one spot on
  // purpose (tests stand two visitors on one mark) and a moving body clears itself the next frame anyway.
  outOfCircle(cx, cz, min, fixed, ox, oz) {
    const p = this.pos, r = this.radius;
    let dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d >= min) return;
    if (d <= 1e-5 && !fixed) return;
    if (d <= 1e-5) {
      dx = ox - cx; dz = oz - cz; d = Math.hypot(dx, dz);
      if (d <= 1e-5) {
        dx = 0; dz = -1; d = 1;
        const clear = (x, z, skip) => this.colliders.every(c => c.off || skip.includes(c) || (c.type === 'circle' ? Math.hypot(x - c.x, z - c.z) >= c.r + r - 1e-3
          : (c.house && !this.houseSolid) || x < c.minX - r || x > c.maxX + r || z < c.minZ - r || z > c.maxZ + r));
        const round = this.colliders.filter(c => !c.off && c.type === 'circle' && Math.hypot(cx - c.x, cz - c.z) < c.r + r);
        const reach = round.reduce((m, c) => Math.max(m, c.r + r + Math.hypot(cx - c.x, cz - c.z)), min);
        for (let i = 0; i < 8; i++) { const a = Math.PI + i * Math.PI / 4, sx = Math.sin(a), sz = Math.cos(a); if (clear(cx + sx * reach, cz + sz * reach, round)) { dx = sx; dz = sz; break; } }
      }
    }
    p.x = cx + (dx / d) * min; p.z = cz + (dz / d) * min;
  }

  // one fixed solid (a collider) pushes you out of it
  collideWith(c, ox, oz) {
    if (c.off) return; // an open gate
    if ((c.minY !== undefined && this.pos.y < c.minY) || (c.maxY !== undefined && this.pos.y > c.maxY)) return; // (one floor's collider, the loft's or the back room's)
    const p = this.pos, r = this.radius;
    if (c.type === 'circle') {
      const dx = p.x - c.x, dz = p.z - c.z, min = c.r + r;
      if (dx > min || dx < -min || dz > min || dz < -min) return;
      this.outOfCircle(c.x, c.z, min, true, ox, oz);
    } else {
      if (c.house && !this.houseSolid) return;
      if (p.x < c.minX - r || p.x > c.maxX + r || p.z < c.minZ - r || p.z > c.maxZ + r) return;
      const cx = clamp(p.x, c.minX, c.maxX), cz = clamp(p.z, c.minZ, c.maxZ);
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d > 1e-5 && d < r) { p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
      else if (d <= 1e-5) {
        // inside the box: leave by the nearest side
        const opts = [[p.x - c.minX, -1, 0], [c.maxX - p.x, 1, 0], [p.z - c.minZ, 0, -1], [c.maxZ - p.z, 0, 1]].sort((a, b) => a[0] - b[0]);
        const [dd, sx, sz] = opts[0];
        p.x += sx * (dd + r); p.z += sz * (dd + r);
      }
    }
  }

  collide(ox = this.pos.x, oz = this.pos.z) {
    const p = this.pos, r = this.radius;
    // people and animals are solid too (npcs, dogs, other players): main.js hands in a list each frame
    for (const c of this.dynamic?.() || []) {
      const dx = p.x - c.x, dz = p.z - c.z, min = c.r + r;
      if (dx > min || dx < -min || dz > min || dz < -min) continue;
      this.outOfCircle(c.x, c.z, min, false, ox, oz);
    }
    // the fixed solids: only those near you (collider-grid.js), in the list's order. They're picked for anywhere within GRID_REACH of
    // where you stand, and a push that carries you further than that goes on through the rest of the whole list, so every collider
    // is met exactly as a loop over all of them would meet it.
    const cols = this.colliders, g = colliderGrid(cols);
    const qx = p.x, qz = p.z, reach = r + GRID_REACH + 0.01;
    const cnt = g.query(qx - reach, qz - reach, qx + reach, qz + reach), hits = g.hits;
    let last = -1, out = false;
    for (let k = 0; k < cnt; k++) {
      last = hits[k];
      this.collideWith(cols[last], ox, oz);
      if (p.x - qx > GRID_REACH || qx - p.x > GRID_REACH || p.z - qz > GRID_REACH || qz - p.z > GRID_REACH) { out = true; break; }
    }
    if (out) for (let i = last + 1; i < cols.length; i++) this.collideWith(cols[i], ox, oz);
    if (!pointInPoly(p.x, p.z, WALK)) {
      const c = closestOnPoly(p.x, p.z, WALK);
      const dx = c[0] - p.x, dz = c[1] - p.z, d = Math.hypot(dx, dz) || 1;
      p.x = c[0] + (dx / d) * 0.03; p.z = c[1] + (dz / d) * 0.03;
    }
    // the shore: slide along it instead of wading in
    if (this.wet(p.x, p.z) && !this.wet(ox, oz)) {
      if (!this.wet(p.x, oz)) p.z = oz;
      else if (!this.wet(ox, p.z)) p.x = ox;
      else { p.x = ox; p.z = oz; }
    }
  }

  footsteps(dt, speed) {
    if (speed < 0.3 || !this.grounded) return;
    const before = this.stepPhase;
    this.stepPhase += dt * (1.2 + speed * 0.45);
    if (Math.floor(before) !== Math.floor(this.stepPhase)) this.onStep?.(this.pos.x, this.pos.z, speed);
  }

  update(dt, now, input) {
    if (this.takeover) {
      const to = this.takeover;
      to.update?.(dt, now, input, this);
      this.vel.set(0, 0); this.speed = 0;
      const tr = this.character.root;
      tr.position.copy(this.pos); tr.rotation.y = this.yaw;
      if (this.takeover !== to) return; // the takeover ended inside its update (a fall landed): plain walking resumes next frame
      this.character.emoteEnd = undefined;
      // (a takeover that walks you, the water tower's catwalk: its `speed` so your legs walk at it, the walk picked from the speed)
      this.character.update(dt, now, to.speed || 0, to.speed !== undefined ? null : (to.anim || null));
      return;
    }
    if (this.vaultCd > 0) this.vaultCd -= dt;
    if (this.vault) {
      // over we go: a smooth arc from the run-up to the landing, the body carried through the pose 'vault'
      const v = this.vault; v.t += dt;
      const k = Math.min(1, v.t / v.dur), e = k * k * (3 - 2 * k);
      this.pos.lerpVectors(v.from, v.to, e);
      this.pos.y += Math.sin(k * Math.PI) * v.peak;
      this.speed = 5.5; this.vel.set(Math.sin(this.yaw) * 5.5, Math.cos(this.yaw) * 5.5);
      const root = this.character.root;
      root.position.copy(this.pos); root.rotation.y = this.yaw;
      this.character.update(dt, now, 0, 'vault');
      if (k >= 1) { this.vault = null; this.grounded = true; this.vy = 0; this.pos.y = groundHeight(this.pos.x, this.pos.z); this.onStep?.(this.pos.x, this.pos.z, 4); }
      return;
    }
    const mv = this.controls ? input.move() : { x: 0, y: 0 };
    this.moveFwd = mv.y;
    const run = this.controls && input.running;
    const maxSpeed = run ? 7.2 : 4.3;
    const cy = this.cam.yaw;
    const fx = -Math.sin(cy), fz = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
    const wx = fx * mv.y + rx * mv.x, wz = fz * mv.y + rz * mv.x;
    const want = Math.hypot(wx, wz);
    const tvx = wx * maxSpeed, tvz = wz * maxSpeed;
    const acc = want > 0 ? 10 : 12;
    this.vel.x += (tvx - this.vel.x) * Math.min(1, dt * acc);
    this.vel.y += (tvz - this.vel.y) * Math.min(1, dt * acc);
    this.speed = this.vel.length();
    if (want > 0.05 && this.emote) this.emote = null; // moving cancels emotes
    if (this.emote && now > this.emoteUntil) this.emote = null;

    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    this.collide(ox, oz);

    const g = groundHeight(this.pos.x, this.pos.z, this.pos.y); // (y, so a floor under a deck stays the floor)
    if (this.grounded) {
      this.pos.y += (g - this.pos.y) * Math.min(1, dt * 18);
      if (Math.abs(g - this.pos.y) > 0.6) this.pos.y = g;
    } else {
      this.vy -= 17 * dt;
      this.pos.y += this.vy * dt;
      // (a zero-length frame right after a hop must not land it: y is still on the ground while vy points up)
      if (this.pos.y < g || (this.pos.y <= g && this.vy <= 0)) { this.pos.y = g; this.grounded = true; this.vy = 0; this.onStep?.(this.pos.x, this.pos.z, 3); }
    }

    if (this.speed > 0.3) this.yaw = angleLerp(this.yaw, Math.atan2(this.vel.x, this.vel.y), Math.min(1, dt * 12));
    if (this.pin && this.emote && this.grounded) { this.pos.x = this.pin.x; this.pos.z = this.pin.z; this.pos.y = groundHeight(this.pos.x, this.pos.z); this.yaw = angleLerp(this.yaw, this.pin.yaw, Math.min(1, dt * 10)); }
    else this.pin = null;
    const root = this.character.root;
    root.position.copy(this.pos);
    root.rotation.y = this.yaw;
    this.character.emoteEnd = this.grounded && this.emote ? this.emoteUntil : undefined; // (the emote settles back by its end)
    this.character.update(dt, now, this.speed, this.grounded ? this.emote : 'jump');
    this.footsteps(dt, this.speed);
  }

  jump() {
    if (!this.grounded || !this.controls) return;
    if (this.tryVault()) return;
    this.grounded = false; this.vy = 5.6; this.emote = null;
  }

  // Vaulting: running at something low and thin (a fence, a gate, a post, a sign, a bench) and jumping as you reach it
  // carries you over it in one smooth arc. Once every VAULT_GAP seconds. Nothing tall or wide (houses, trees) counts,
  // and the landing must be dry, inside the map and clear of anything solid.
  tryVault() {
    if (this.vaultCd > 0 || this.speed < 4.0 || this.takeover) return false;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const px = this.pos.x + fx * 0.85, pz = this.pos.z + fz * 0.85;
    for (const c of this.colliders) {
      if (c.off || c.house || c.tree) continue;
      let hit = false, thick = 0;
      if (c.type === 'box') {
        const w = c.maxX - c.minX, d = c.maxZ - c.minZ;
        if (Math.min(w, d) > 0.7) continue; // walls and buildings are not for vaulting
        hit = px > c.minX - 0.35 && px < c.maxX + 0.35 && pz > c.minZ - 0.35 && pz < c.maxZ + 0.35;
        thick = Math.abs(fx) > Math.abs(fz) ? w : d;
      } else {
        if (c.r > 0.5) continue;
        hit = Math.hypot(px - c.x, pz - c.z) < c.r + 0.4;
        thick = c.r * 2;
      }
      if (!hit) continue;
      const dist = 0.85 + thick + 1.25, tx = this.pos.x + fx * dist, tz = this.pos.z + fz * dist;
      if (!pointInPoly(tx, tz, WALK) || this.wet(tx, tz)) return false;
      for (const o of this.colliders) {
        if (o === c || o.off) continue;
        const inside = o.type === 'circle' ? Math.hypot(tx - o.x, tz - o.z) < o.r + this.radius : (tx > o.minX - this.radius && tx < o.maxX + this.radius && tz > o.minZ - this.radius && tz < o.maxZ + this.radius);
        if (inside) return false;
      }
      this.vault = { t: 0, dur: 0.66, from: this.pos.clone(), to: new THREE.Vector3(tx, groundHeight(tx, tz), tz), peak: 1.05 + Math.max(0, (c.top || 1.1) - 1.1) };
      this.vaultCd = VAULT_GAP; this.emote = null;
      this.onVault?.();
      return true;
    }
    return false;
  }

  updateCamera(dt, camera, input, now) {
    const c = this.cam;
    if (this.takeover?.camera?.(dt, camera, input, now, this)) { input.takeLook?.(); return; } // a takeover that placed the camera has read the look; drop the rest
    const look = input.takeLook();
    if (look.x || look.y) { c.yaw -= look.x * 0.0055; c.pitch = clamp(c.pitch + look.y * 0.004, -0.15, 1.25); c.manualAt = now; }
    if (look.zoom) c.targetDist = clamp(c.targetDist + look.zoom * 0.9, 3, 16);
    if (look.cycle) { // controller L3: next camera distance (near, middle, far, and round again)
      const stops = Input.ZOOM_STOPS;
      c.targetDist = stops.find(d => d > c.targetDist + 0.4) ?? stops[0];
    }
    if (input.dragging) c.manualAt = now; // a mouse button is turning the camera: never drift under the player's hand
    if (this.controls && now - c.manualAt > 2.5 && this.speed > 1.5 && this.moveFwd > 0.3) {
      // drift in behind the walker when the mouse is left alone
      const behind = this.yaw + Math.PI;
      c.yaw = angleLerp(c.yaw, behind, Math.min(1, dt * 0.6));
    }
    c.dist += (c.targetDist - c.dist) * Math.min(1, dt * 6);
    // under the porch roof: keep the camera low so the roof and sign don't hide you
    const p = this.pos;
    const onPorch = p.x > PORCH.minX - 0.6 && p.x < PORCH.maxX + 0.6 && p.z > STEPS.minZ - 1.2 && p.z < PORCH.maxZ;
    c.cap = (c.cap ?? 1.25) + ((onPorch ? 0.04 : 1.25) - (c.cap ?? 1.25)) * Math.min(1, dt * 4);
    const pitch = Math.min(c.pitch, c.cap);
    const target = new THREE.Vector3(this.pos.x, this.pos.y + 1.6, this.pos.z);
    const dir = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(c.yaw) * Math.cos(pitch));
    // pull the camera in if the ground or the house is in the way
    let dist = c.dist;
    for (let i = 1; i <= 10; i++) {
      const d = (c.dist * i) / 10;
      const px = target.x + dir.x * d, py = target.y + dir.y * d, pz = target.z + dir.z * d;
      const inHouse = px > HOUSE.minX - 0.4 && px < HOUSE.maxX + 0.4 && pz > HOUSE.minZ - 0.4 && pz < HOUSE.maxZ + 0.6 && py < 10.2;
      if (py < groundHeight(px, pz) + 0.35 || (inHouse && this.houseSolid)) { dist = Math.max(1.2, d - c.dist / 10); break; }
    }
    const want = target.clone().addScaledVector(dir, dist);
    if (c.pos.lengthSq() === 0) c.pos.copy(want);
    c.pos.lerp(want, Math.min(1, dt * 10));
    c.look.lerp(target, c.look.lengthSq() === 0 ? 1 : Math.min(1, dt * 14));
    camera.position.copy(c.pos);
    camera.lookAt(c.look);
  }

  // Point the follow camera behind the player (after the intro / on respawn).
  snapCameraBehind() {
    this.cam.yaw = this.yaw + Math.PI;
    this.cam.pos.set(0, 0, 0);
    this.cam.look.set(0, 0, 0);
  }
}
