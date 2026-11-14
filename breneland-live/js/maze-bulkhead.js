// Beneath Angell Street: the way out comes up in the yard, never a vanish-and-reappear. The flight below ends at an arched door
// thrown open on daylight (maze-kit.js buildFlight). Up here its match is an old cellar bulkhead in the Lovecraft house's back
// garden by the fountain: a stone curb sloping down toward the house, two iron-strapped oak doors over it, steps going down into
// the dark under them. When someone comes up the doors swing open for everyone in the yard, you climb out of the dark into the
// light (the camera going on from your eyes as it did below, then settling in behind you), and the doors close a few seconds later.
//
//   createBulkhead(ctx, plan) -> { x, y, z, out: { x, z }, emerge(), open(secs), update(dt), state }
// plan: the Lovecraft house's (lovecraft-build.js: HX, HZ, HD, TY). Built into the yard's scene once, one collider (the curb).
import * as THREE from 'three';
import { Batcher, GEO } from './batch.js';
import { soft } from './toon.js';

const STONE = '#9b9384', STONE2 = '#857d70', OAK = '#6a4a32', OAK2 = '#563a26', IRON = '#2f2f36';
export const BULK = { w: 1.5, l: 2.1, hi: 0.62, lo: 0.3, open: 1.95, climb: 1.15, settle: 0.75, shut: 4.5 };
const ease = k => k * k * (3 - 2 * k);

export function createBulkhead(ctx, P) {
  const { scene, colliders, player, audio } = ctx;
  // by the fountain (lovecraft-build.js: X(-0.6), Z(-HD) - 7.6), a few steps east of it; the low end (the mouth) toward the house
  const x = P.HX + 2.6, z = P.HZ - P.HD - 9.2, y = P.TY;
  const { w, l, hi, lo } = BULK, z0 = z - l / 2, z1 = z + l / 2; // z0 the high end at the back, z1 the mouth
  const root = new THREE.Group(); root.name = 'maze-bulkhead'; scene.add(root);
  const b = new Batcher({ vertexColors: true });
  // the curb: two sloping side walls and the high back wall, dressed stone; a cap on the back
  const slope = Math.atan2(hi - lo, l);
  for (const s of [-1, 1]) b.add(GEO.box, STONE, { x: x + s * (w / 2 - 0.08), y: y + (hi + lo) / 4, z, sx: 0.18, sy: (hi + lo) / 2 + 0.06, sz: l, rx: 0 });
  for (const s of [-1, 1]) b.add(GEO.box, STONE2, { x: x + s * (w / 2 - 0.08), y: y + (hi + lo) / 2 + 0.02, z, sx: 0.22, sy: 0.06, sz: l + 0.04, rx: slope });
  b.add(GEO.box, STONE, { x, y: y + hi / 2, z: z0 + 0.09, sx: w, sy: hi, sz: 0.18 });
  b.add(GEO.box, STONE2, { x, y: y + hi + 0.03, z: z0 + 0.09, sx: w + 0.06, sy: 0.06, sz: 0.24 });
  b.add(GEO.box, STONE2, { x, y: y + 0.03, z: z1 + 0.12, sx: w + 0.1, sy: 0.06, sz: 0.3 }); // the worn sill at the mouth
  b.build(root, 'maze-bulkhead');
  // the dark under the doors: the steps going down painted on (a lip of stone at each, darker the deeper), then black
  {
    const pos = [], col = [], idx = [], hw = w / 2 - 0.17, steps = 5, sd = (l - 0.2) / steps;
    for (let i = 0; i < steps; i++) {
      const za = z1 - i * sd, zb = za - sd, lip = Math.max(0, 0.42 - i * 0.11), dark = Math.max(0.0, 0.16 - i * 0.04);
      for (const [p, q, c] of [[za, za - 0.05, lip], [za - 0.05, zb, dark]]) {
        const base = pos.length / 3;
        pos.push(x - hw, y + 0.015, p, x + hw, y + 0.015, p, x + hw, y + 0.015, q, x - hw, y + 0.015, q);
        for (let k = 0; k < 4; k++) col.push(c * 0.95, c * 0.92, c * 0.85);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })); m.name = 'maze-bulkhead-dark'; m.renderOrder = 1;
    root.add(soft(m));
  }
  // the two doors: oak, three iron straps each, a ring on the right one; hinged along the side walls' tops, sloping with them
  const leaves = [-1, 1].map(s => {
    const hinge = new THREE.Group(); hinge.position.set(x + s * (w / 2 - 0.02), y + (hi + lo) / 2 + 0.06, z); hinge.rotation.x = slope; root.add(hinge);
    const leaf = new THREE.Group(); hinge.add(leaf);
    const lb = new Batcher({ vertexColors: true }), lw = w / 2 - 0.03;
    lb.add(GEO.box, OAK, { x: -s * lw / 2, y: 0.03, z: 0, sx: lw, sy: 0.06, sz: l + 0.02 });
    for (let k = 1; k < 3; k++) lb.add(GEO.box, OAK2, { x: -s * lw * k / 3, y: 0.062, z: 0, sx: 0.015, sy: 0.01, sz: l });
    for (const zz of [-l * 0.36, 0, l * 0.36]) lb.add(GEO.box, IRON, { x: -s * lw / 2, y: 0.066, z: zz, sx: lw, sy: 0.012, sz: 0.06 });
    if (s > 0) lb.add(new THREE.TorusGeometry(0.06, 0.012, 6, 12), IRON, { x: -lw + 0.12, y: 0.075, z: 0.15, rx: Math.PI / 2 });
    lb.build(leaf, 'maze-bulkhead-door');
    return { s, leaf };
  });
  colliders.push({ type: 'box', minX: x - w / 2, maxX: x + w / 2, minZ: z0, maxZ: z1, bulkhead: true });

  // ---- the doors open and shut (k 0 shut .. 1 open, flung back past upright onto the grass's side)
  let k = 0, aim = 0, shutIn = 0, sounded = 0; // shutIn: seconds until they close
  function setK(v) { k = v; for (const L of leaves) L.leaf.rotation.z = L.s * ease(k) * BULK.open * -1; }
  function open(secs = BULK.shut) {
    if (aim !== 1) { aim = 1; if (performance.now() - sounded > 600) { sounded = performance.now(); audio?.door?.('open', x, y + 0.4, z); } }
    shutIn = secs;
  }
  setK(0);

  // ---- you come up: out of the dark at the back of the steps, up them and out of the mouth, the camera from your eyes (as below)
  // then in behind you. The fade from white is maze.js's; this is the walk and the camera under it.
  let em = null;
  const _t = new THREE.Vector3(), _c = new THREE.Vector3();
  function emerge() {
    open(BULK.shut);
    setK(1); aim = 1; // already open as you come up into it
    em = { t: 0 };
    player.place(x, z0 + 0.35, 0);
    player.pos.y = y - 1.15;
    player.character.root.visible = false;
    player.takeover = {
      anim: 'walk', minigame: null,
      update(dt, now, input, p) {
        em.t += dt;
        const c = Math.min(1, em.t / BULK.climb), s = Math.min(1, Math.max(0, (em.t - BULK.climb) / BULK.settle));
        p.pos.set(x, y - 1.15 * (1 - ease(c)), z0 + 0.35 + (z1 - z0 + 0.25) * c + 0.55 * ease(s));
        p.yaw = 0; p.speed = 2;
        if (em.t > BULK.climb * 0.7) p.character.root.visible = true;
        if (em.t >= BULK.climb + BULK.settle) finish(p);
      },
      camera(dt, cam, input, now, p) {
        const c = Math.min(1, em.t / BULK.climb), s = ease(Math.min(1, Math.max(0, (em.t - BULK.climb * 0.75) / (BULK.settle + BULK.climb * 0.25))));
        // your eyes: looking up the steps and out at the sky, then level as you come out
        const eye = _t.set(p.pos.x, p.pos.y + 1.45, p.pos.z + 0.1), look = 0.55 * (1 - ease(c)) - 0.05;
        const fx = eye.x, fy = eye.y, fz = eye.z;
        // behind you, where the follow camera will be
        const C = p.cam, pitch = Math.min(C.pitch ?? 0.3, 1.0), yawB = p.yaw + Math.PI, dist = C.dist || 6;
        const tgt = _c.set(p.pos.x, p.pos.y + 1.6, p.pos.z);
        const bx = tgt.x + Math.sin(yawB) * Math.cos(pitch) * dist, by = tgt.y + Math.sin(pitch) * dist, bz = tgt.z + Math.cos(yawB) * Math.cos(pitch) * dist;
        cam.position.set(fx + (bx - fx) * s, fy + (by - fy) * s, fz + (bz - fz) * s);
        const lx = fx + (tgt.x - fx) * s, ly = fy + look * 2 + (tgt.y - fy - look * 2) * s, lz = fz + 2 + (tgt.z - fz - 2) * s;
        cam.lookAt(lx, ly, lz);
        return true;
      },
    };
  }
  function finish(p) {
    if (!em) return;
    em = null;
    p.character.root.visible = true;
    p.takeover = null;
    p.place(x, z1 + 0.8, 0);
    p.snapCameraBehind();
    if (ctx.playing) p.controls = true;
  }

  // ---- someone else comes up: their maze flag drops (ext.maze 1 -> 0, read off the people here each frame) and they turn up by the
  // doors within a few seconds, so open them for everyone here
  const wasBelow = new Map(), fresh = new Map();
  function update(dt) {
    for (const r of ctx.remotes?.map?.values() || []) {
      const b = !!r.ext?.maze, was = wasBelow.get(r.sid);
      if (was && !b) fresh.set(r.sid, 6);
      if (was !== b) wasBelow.set(r.sid, b);
    }
    for (const [sid, left] of fresh) {
      const r = ctx.remotes?.map?.get(sid), p = r?.ch?.root?.position;
      if (!r || left - dt <= 0) { fresh.delete(sid); continue; }
      fresh.set(sid, left - dt);
      if (p && Math.hypot(p.x - x, p.z - z) < 3.2) { open(BULK.shut); fresh.delete(sid); }
    }
    if (wasBelow.size > 64) for (const sid of wasBelow.keys()) if (!ctx.remotes?.map?.has(sid)) wasBelow.delete(sid);
    if (aim === 1 && !em) { shutIn -= dt; if (shutIn <= 0) { aim = 0; audio?.door?.('close', x, y + 0.4, z); } }
    const want = aim, sp = want ? 1 / 0.55 : 1 / 0.9;
    if (k !== want) setK(want > k ? Math.min(1, k + dt * sp) : Math.max(0, k - dt * sp));
  }

  return {
    x, y, z, out: { x: 0, z: 1 }, mouth: { x, z: z1 }, root, emerge, open, update, finish: () => finish(player),
    get state() { return { k, open: aim === 1, emerging: !!em, t: em?.t ?? null }; },
  };
}
