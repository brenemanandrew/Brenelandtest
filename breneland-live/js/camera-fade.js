// Whatever stands between the follow camera and you fades out of the way. Each frame a line runs from the camera to your
// chest, and anything on it or within about 1.2 m of the camera fades over ~0.2 s, then comes back. Never your own body, and
// never anybody else's: people, players, NPCs and the dogs stay solid whatever the camera does (camera-view, Andrew 2026-11-07:
// "Don't hide another player in order to keep the player visible": dancing together, the friend you faced turned to a ghost).
//
// Vehicles fade as whole objects: their meshes swap to transparent copies (toon.js fadeClone), and the ink pass reads the
// alpha so the outline fades too. The baked world is one mesh per material, so a capsule round the
// line and a sphere round the camera (toon.js FADE) cut a hole and a ghost copy draws just the hole. That's only on while a
// collider sits on the line. No per-frame allocation.
import * as THREE from 'three';
import { FADE, patchFadeHole, hasFadeHole, fadeGhostMaterial, fadeClone } from './toon.js';
import { colliderGrid } from './collider-grid.js';
import { GFX } from './gfx.js';

export const KMIN = 0.25;   // what is left of a faded thing (opacity)
const RATE = 5;             // opacity per second: 1 -> KMIN in under 0.2 s
const CAP_R = 0.6;          // the capsule round the camera-player line (m)
const CAM_R = 1.2;          // the sphere round the camera (m)
const SHORT = 0.5;          // the line stops this far short of your chest
const CHEST = 1.0;          // the line's end: your chest, above your feet (m)
const RESCAN = 10;          // seconds between looks for baked meshes built later (weather-cover.js rescans the same way)
const CROWN_R = 2.6;        // a tree's crown round the camera counts as the tree (m)
const REACH = Math.max(CAP_R, CROWN_R + CAM_R) + 0.1; // how far past its own footprint a collider can block (the grid query's margin)

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3();
const _m = new THREE.Matrix4(), _box = new THREE.Box3();

// the body sizes the line is tested against: a sphere per kind (centre height, radius)
const SIZES = { human: [0.9, 0.8], dog: [0.35, 0.6], unicorn: [0.9, 1.0], car: [0.8, 2.4], van: [1.1, 3.0], scooter: [0.6, 1.0], bus: [1.4, 4.2] };
// indoors (the camera and you inside a building, the camera off your head): a wall of the house between the camera and you counts
// (house-rest's fitted camera can stand just behind one, in the next room), the capsule is slimmer (the bed round you stays) and
// ceilings and floors never fade (uFadeFlat: the room stays shut over the camera)
const IN_CAP_R = 0.42;
// first person (store-perf 2026-11-08): your body hidden, or the camera within FP_R of your head: nothing stands between the
// camera and a body you cannot see, so no volume and no ghosts (at Clem's counter the counter by the lens turned it on and the
// whole woods and town drew a second time: 738k triangles)
const HEAD = 1.55, FP_R = 0.6;
// a baked batch is drawn as a ghost only where it has geometry: its triangles are binned into OCC m squares of the ground
// (each with the heights it spans) and the ghost draws when one of those squares meets the volume's box. The town is one
// batch per material over the whole map, so its bounds always met the line and the whole town drew twice.
const OCC = 4;
const occKey = (ix, iz) => (ix + 32768) * 65536 + (iz + 32768);

export function createCameraFade(ctx) {
  const { scene, camera, player, npcs, colliders } = ctx;
  const states = new WeakMap();       // root -> { root, kind, k, target, on, entries }
  const active = [];                  // states with k < 1 or a fade wanted
  const ghosts = [];                  // { src, mesh, cx, cy, cz, r } per baked mesh that can fade
  const holed = new Map();            // a shared material -> the copy we gave the mesh (when weather-cover did not already)
  const ghostMats = new Map();        // a holed material -> its ghost material (the woods' cells share one)
  const vb = new Float64Array(6);     // the volume's box this frame: min x y z, max x y z
  let rescanAt = 0, volOn = false, carsApi = null;
  const cam = { x: 0, z: 0 };         // where the camera is, for the dogs (dogs-brain.js picks greeting spots off its line)
  let dist = 5, sphereR = CAM_R;

  // ---------------------------------------------------------------- the line
  // A = the camera, B = your chest pulled SHORT toward the camera. Distance tests are done on these.
  function line() {
    _a.copy(camera.position);
    _b.set(player.pos.x, player.pos.y + CHEST, player.pos.z);
    _d.subVectors(_a, _b);
    const len = _d.length();
    dist = len;
    if (len > SHORT + 0.3) _b.addScaledVector(_d, SHORT / len);
    _d.subVectors(_b, _a); // A -> B
    sphereR = Math.min(CAM_R, Math.max(0.35, len - 0.7)); // the camera pulled right in to you: a smaller sphere, never your body
  }
  // distance from a point to the segment A-B (3D)
  function segDist(x, y, z) {
    const l2 = _d.lengthSq();
    let t = l2 > 1e-6 ? ((x - _a.x) * _d.x + (y - _a.y) * _d.y + (z - _a.z) * _d.z) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = _a.x + _d.x * t - x, py = _a.y + _d.y * t - y, pz = _a.z + _d.z * t - z;
    return Math.sqrt(px * px + py * py + pz * pz);
  }
  // a sphere (cx, cy, cz, r) touches the line or the camera's sphere
  function blocks(cx, cy, cz, r) {
    if (segDist(cx, cy, cz) < r + 0.25) return true;
    const dx = cx - _a.x, dy = cy - _a.y, dz = cz - _a.z;
    return dx * dx + dy * dy + dz * dz < (r + sphereR) * (r + sphereR);
  }
  // a collider (flat footprint, a height guessed by its shape) crosses the line below its top, or hugs the camera
  function colliderBlocks(c) {
    let x, z, r, top;
    if (c.type === 'circle') { x = c.x; z = c.z; r = c.r; top = c.tree ? 40 : c.r > 0.9 ? 6 : 1.6; }
    else {
      x = (c.minX + c.maxX) / 2; z = (c.minZ + c.maxZ) / 2;
      const w = c.maxX - c.minX, d = c.maxZ - c.minZ;
      r = Math.hypot(w, d) / 2; top = Math.min(w, d) > 2.5 ? 12 : (c.top ?? 1.3);
    }
    // the line's closest point to the footprint, in the ground plane
    const l2 = _d.x * _d.x + _d.z * _d.z;
    let t = l2 > 1e-6 ? ((x - _a.x) * _d.x + (z - _a.z) * _d.z) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = _a.x + _d.x * t, qz = _a.z + _d.z * t, qy = _a.y + _d.y * t;
    let near = false;
    if (c.type === 'circle') near = Math.hypot(qx - x, qz - z) < r + CAP_R;
    else {
      const ex = Math.max(c.minX - qx, 0, qx - c.maxX), ez = Math.max(c.minZ - qz, 0, qz - c.maxZ);
      near = ex * ex + ez * ez < CAP_R * CAP_R;
    }
    if (near && qy < top + CAP_R) return true;
    // the camera itself inside it (a tree's crown counts as the whole tree)
    const cr = c.type === 'circle' && c.tree ? Math.max(r, CROWN_R) : r;
    if (_a.y > top + sphereR) return false;
    if (c.type === 'circle') return Math.hypot(_a.x - x, _a.z - z) < cr + sphereR;
    const ex = Math.max(c.minX - _a.x, 0, _a.x - c.maxX), ez = Math.max(c.minZ - _a.z, 0, _a.z - c.maxZ);
    return ex * ex + ez * ez < sphereR * sphereR;
  }

  // Does any collider within `far` of you block the line (or hug the camera)? Not the house: player.js pulls the camera in
  // for it. Only colliders the grid finds near the line are tested (collider-grid.js, the footprint widened by REACH);
  // `all` walks the whole list so the tests can compare the two.
  function collidersHit(far, all) {
    const px = player.pos.x, pz = player.pos.z;
    const g = colliderGrid(colliders), hits = g.hits, inner = indoorLine();
    const n = all ? colliders.length
      : g.query(Math.min(_a.x, _b.x) - REACH, Math.min(_a.z, _b.z) - REACH, Math.max(_a.x, _b.x) + REACH, Math.max(_a.z, _b.z) + REACH);
    for (let k = 0; k < n; k++) {
      const c = colliders[all ? k : hits[k]];
      if (c.off) continue;
      if (c.house) { if (inner && c.inner && c.type !== 'circle' && crosses(c)) return true; continue; }
      if (c.type === 'circle') { if (Math.abs(c.x - px) > far + c.r || Math.abs(c.z - pz) > far + c.r) continue; }
      else if (px < c.minX - far || px > c.maxX + far || pz < c.minZ - far || pz > c.maxZ + far) continue; // (a fence run is 50 m long: its edge counts, not its middle)
      if (colliderBlocks(c)) return true;
    }
    return false;
  }

  // indoors: the camera and you both inside a building and the camera off your head (then a partition the line runs through
  // fades: the camera fitted to you on the bed may stand in the hall)
  function indoorLine() {
    const b = ctx.indoorView?.active;
    return !!b && dist > 1.2 && b.inside(_a.x, _a.z);
  }
  // the line (camera -> your chest) passes through a wall's footprint below its top (the slab test in the ground plane)
  function crosses(c) {
    let t0 = 0, t1 = 1;
    for (const [o, d, mn, mx] of [[_a.x, _d.x, c.minX - 0.04, c.maxX + 0.04], [_a.z, _d.z, c.minZ - 0.04, c.maxZ + 0.04]]) {
      if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) return false; continue; }
      let a = (mn - o) / d, b = (mx - o) / d; if (a > b) { const s = a; a = b; b = s; }
      if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return false;
    }
    return _a.y + _d.y * t0 < (c.top ?? 12) || _a.y + _d.y * t1 < (c.top ?? 12);
  }

  // ---------------------------------------------------------------- whole objects
  function stateOf(root, kind) {
    let s = states.get(root);
    if (!s) { s = { root, kind, k: 1, target: 1, on: false, entries: null }; states.set(root, s); }
    return s;
  }
  function want(root, kind) {
    const s = stateOf(root, kind);
    s.target = KMIN;
    if (!s.on && !active.includes(s)) active.push(s);
  }
  // swap every material under the root for its fading copy. The copies are kept per source material and used again next
  // time (a rod taken out meanwhile gets its own then): disposing them threw their shader program away, so every fade of a
  // person or a car on the street linked it again (store-perf: a 250 ms frame on the walk to the game store)
  function swapIn(s) {
    const entries = [], made = s.made || (s.made = new Map());
    s.root.traverse(o => {
      const m = o.material;
      if (!m || (!o.isMesh && !o.isSprite && !o.isPoints)) return;
      const list = Array.isArray(m) ? m : [m];
      const clones = list.map(src => { let c = made.get(src); if (!c) { c = fadeClone(src); made.set(src, c); } return c; });
      const cur = Array.isArray(m) ? clones : clones[0];
      entries.push({ obj: o, orig: m, clones, cur });
      o.material = cur;
    });
    s.entries = entries; s.on = true;
  }
  function swapOut(s) {
    for (const e of s.entries) if (e.obj.material === e.cur) e.obj.material = e.orig; // (a part re-dressed meanwhile keeps its new material)
    s.on = false;
  }
  function ease(s, dt) {
    const step = RATE * dt;
    s.k = s.k < s.target ? Math.min(s.target, s.k + step) : Math.max(s.target, s.k - step);
    if (s.k < 1 && !s.on) swapIn(s);
    if (s.on) for (const e of s.entries) for (const c of e.clones) c.opacity = c.userData.baseOpacity * s.k;
    if (s.k >= 1 && s.on) swapOut(s);
    s.root.userData.fadeK = s.k; // (ui.js dims the name tag with the body)
  }
  function testBody(root, kind, range) {
    if (!root || !root.visible) return;
    const p = root.position;
    if (Math.abs(p.x - player.pos.x) > range || Math.abs(p.z - player.pos.z) > range) return;
    const [h, r] = SIZES[kind] || SIZES.human;
    if (blocks(p.x, p.y + h, p.z, r)) want(root, kind);
  }

  // ---------------------------------------------------------------- the baked world
  function sameTransform(g, o) { g.matrix.copy(o.matrix); g.matrixWorld.copy(o.matrixWorld); }
  function addGhost(o) {
    let mat = o.material;
    if (!hasFadeHole(mat)) {
      // weather-cover gave every Batcher mesh its own copy ('+wx'); anything else gets ours, so a shared toon material
      // (people wear the same ones) is never patched in place
      if (!/\+wx$/.test(mat.name || '') && !/^forest-canopy/.test(mat.name || '')) {
        let c = holed.get(mat);
        if (!c) { c = mat.clone(); if (mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) { c.onBeforeCompile = mat.onBeforeCompile; c.customProgramCacheKey = mat.customProgramCacheKey; } c.name = (mat.name || 'toon') + '+fade'; holed.set(mat, c); }
        o.material = mat = c;
      }
      patchFadeHole(mat);
    }
    let gm = ghostMats.get(mat);
    if (!gm) { gm = fadeGhostMaterial(mat); ghostMats.set(mat, gm); }
    let g;
    if (o.isInstancedMesh) {
      if (!o.boundingBox) o.computeBoundingBox();
      if (!o.boundingSphere) o.computeBoundingSphere();
      g = new THREE.InstancedMesh(o.geometry, gm, Math.max(1, o.count)); g.instanceMatrix = o.instanceMatrix; g.count = o.count; if (o.instanceColor) g.instanceColor = o.instanceColor;
      g.boundingBox = o.boundingBox; g.boundingSphere = o.boundingSphere; // (the source's: the woods' cells keep fixed bounds while their counts change)
    }
    else g = new THREE.Mesh(o.geometry, gm);
    g.name = o.name + '-ghost'; g.userData.fadeGhost = true;
    g.matrixAutoUpdate = false; sameTransform(g, o);
    g.castShadow = false; g.receiveShadow = o.receiveShadow; g.layers.mask = o.layers.mask;
    g.visible = false; g.renderOrder = 5; // after the other translucent things, so a fence's ghost blends over the water
    o.parent.add(g);
    o.userData.fadeGhost = g;
    const bb = o.isInstancedMesh ? o.boundingBox : o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox);
    _box.copy(bb).applyMatrix4(o.matrixWorld);
    const box = new Float64Array([_box.min.x, _box.min.y, _box.min.z, _box.max.x, _box.max.y, _box.max.z]);
    const big = !o.isInstancedMesh && (box[3] - box[0] > 3 * OCC || box[5] - box[2] > 3 * OCC);
    ghosts.push({ src: o, mesh: g, box, occ: big ? occupancy(o) : null });
  }
  // the OCC squares a baked mesh has triangles over, each with the lowest and highest y of those triangles (world space; a
  // big triangle marks every square its footprint box covers)
  function occupancy(o) {
    const occ = new Map(), g = o.geometry, pos = g.attributes.position, idx = g.index, m = o.matrixWorld.elements;
    const n = Math.min(idx ? idx.count : pos.count, g.drawRange.start + g.drawRange.count), X = [0, 0, 0], Y = [0, 0, 0], Z = [0, 0, 0];
    for (let t = 0; t + 2 < n; t += 3) {
      for (let k = 0; k < 3; k++) {
        const i = idx ? idx.getX(t + k) : t + k, x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        X[k] = m[0] * x + m[4] * y + m[8] * z + m[12]; Y[k] = m[1] * x + m[5] * y + m[9] * z + m[13]; Z[k] = m[2] * x + m[6] * y + m[10] * z + m[14];
      }
      const y0 = Math.min(Y[0], Y[1], Y[2]), y1 = Math.max(Y[0], Y[1], Y[2]);
      const ix0 = Math.floor(Math.min(X[0], X[1], X[2]) / OCC), ix1 = Math.floor(Math.max(X[0], X[1], X[2]) / OCC);
      const iz0 = Math.floor(Math.min(Z[0], Z[1], Z[2]) / OCC), iz1 = Math.floor(Math.max(Z[0], Z[1], Z[2]) / OCC);
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
        const key = occKey(ix, iz), c = occ.get(key);
        if (!c) occ.set(key, [y0, y1]); else { if (y0 < c[0]) c[0] = y0; if (y1 > c[1]) c[1] = y1; }
      }
    }
    return occ;
  }
  // does this ghost's source have geometry inside the volume's box (vb)?
  function inVolume(gh) {
    const b = gh.box;
    if (b[0] > vb[3] || b[3] < vb[0] || b[1] > vb[4] || b[4] < vb[1] || b[2] > vb[5] || b[5] < vb[2]) return false;
    const occ = gh.occ;
    if (!occ) return true;
    const ix0 = Math.floor(vb[0] / OCC), ix1 = Math.floor(vb[3] / OCC), iz0 = Math.floor(vb[2] / OCC), iz1 = Math.floor(vb[5] / OCC);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const c = occ.get(occKey(ix, iz));
      if (c && c[0] <= vb[4] && c[1] >= vb[1]) return true;
    }
    return false;
  }
  function scan() {
    scene.traverse(o => {
      if (o.userData.fadeGhost || o.userData.noFadeGhost || o.isSkinnedMesh || !o.parent) return;
      const m = o.material;
      if (!m || Array.isArray(m) || !m.isMeshToonMaterial || m.transparent) return;
      const baked = o.isMesh && !o.isInstancedMesh && o.matrixAutoUpdate === false;  // Batcher output
      const woods = o.isInstancedMesh && /^forest-/.test(o.name);                     // the woods' trunks and crowns
      if (!baked && !woods) return;
      if (/^(mountains|sky|water|lake|reeds|grass|terrain)/.test(o.name)) return;    // never on the line, or soft
      addGhost(o);
    });
  }
  // the ghosts whose source has geometry in the volume's box (the capsule round the line, reaching up, and the camera's
  // sphere) draw this frame
  function placeGhosts() {
    if (volOn) {
      const P = Math.max(CAP_R, sphereR) + 0.3;
      vb[0] = Math.min(_a.x, _b.x) - P; vb[1] = Math.min(_a.y, _b.y) - P; vb[2] = Math.min(_a.z, _b.z) - P;
      vb[3] = Math.max(_a.x, _b.x) + P; vb[4] = Math.max(_a.y, _b.y) + P + FADE.uFadeH.value; vb[5] = Math.max(_a.z, _b.z) + P;
    }
    let n = 0;
    for (const g of ghosts) {
      const vis = volOn && (g.src.visible || (g.src.userData.forestCell && g.src.count > 0)) && inVolume(g); // (a woods cell stands in for its kind's whole mesh)
      if (vis !== g.mesh.visible) g.mesh.visible = vis;
      if (vis) { n++; if (g.src.isInstancedMesh && g.mesh.count !== g.src.count) g.mesh.count = g.src.count; }
    }
    return n;
  }

  // ---------------------------------------------------------------- per frame
  function uniforms() {
    camera.updateMatrixWorld();
    _m.copy(camera.matrixWorld).invert();
    _p.copy(_b).applyMatrix4(_m);
    FADE.uFadeB.value.copy(_p);
    FADE.uFadeUp.value.set(0, 1, 0).transformDirection(_m);
    const ind = indoorLine();
    FADE.uFadeR.value = ind ? IN_CAP_R : CAP_R;
    FADE.uFadeS.value = sphereR;
    FADE.uFadeH.value = ind ? 0 : 1;
    FADE.uFadeFlat.value = ind ? 1 : 0;
  }
  let ghostsDrawn = 0;
  // the baked world as it stands at start-up (weather-cover.js has given it its material copies by now), and its
  // ghosts' programs compiled while the loading screen is still up: the first fence on the line must not stall a phone.
  // Compiled with a render target bound: the ink pass draws the scene into one (toon.js), and a program built for the
  // screen (tone mapped, sRGB out) is not the one a frame uses, so without this every material linked again on its first
  // real draw (store-perf: half a second arriving at the game store)
  function precompile() {
    const r = ctx.renderer;
    try { const rt = new THREE.WebGLRenderTarget(4, 4); r.setRenderTarget(rt); r.compile(scene, camera); r.setRenderTarget(null); rt.dispose(); } catch (e) { console.warn('[camera-fade] could not precompile', e); }
  }
  scan();
  precompile();
  // the whole-object fades' programs (a person, a dog, a car: their materials' transparent copies) are linked once early in
  // play, after rigid-merge has merged the bodies (their merged parts are what fades), by faking a fade on one of each and
  // compiling with the copies in place. Nothing is drawn that way: the copies are put back in the same call
  let warmAt = null, warmLevel = GFX.level;
  function warmFades(now) {
    if (warmLevel !== GFX.level) { warmLevel = GFX.level; warmAt = now + 1; precompile(); } // a new level: every program is new (weather-cover's patch differs)
    if (warmAt === null) { warmAt = now + 3; return; }
    if (now < warmAt) return;
    warmAt = Infinity;
    const roots = [], seen = new Set(); // (vehicles only: people never fade)
    if (carsApi) for (const c of carsApi.cars) { const k = c.bus ? 'bus' : 'car'; if (!seen.has(k)) { seen.add(k); roots.push([c.model.g, k]); } }
    const warmed = [];
    for (const [root, kind] of roots) { const s = stateOf(root, kind); if (s.on) continue; swapIn(s); warmed.push(s); }
    precompile();
    for (const s of warmed) swapOut(s);
  }
  let enabled = true; // (api.enabled = false puts everything back and does nothing: before-and-after pictures)
  let fp = false;
  function firstPerson() {
    const body = player.character?.root;
    if (body && !body.visible) return true;
    const p = camera.position, dx = p.x - player.pos.x, dy = p.y - player.pos.y - HEAD, dz = p.z - player.pos.z;
    return dx * dx + dy * dy + dz * dz < FP_R * FP_R;
  }
  function update(dt, now) {
    const playing = ctx.playing && enabled;
    if (playing && now >= rescanAt) { rescanAt = now + RESCAN; scan(); }
    line();
    cam.x = _a.x; cam.z = _a.z; npcs.cam = playing ? cam : null;
    const range = dist + 4;
    fp = playing && firstPerson();
    if (playing && !fp && !player.takeover?.clearView) {
      // whole objects: vehicles only. People (npcs.npcs, the remotes, anybody with a name tag) are never tested, so never faded
      // (camera-view). Not under a takeover's own clear view either (house-rest's camera on the couch)
      if (carsApi === null) carsApi = ctx.features?.find(f => f?.name === 'cars')?.api || false;
      warmFades(now);
      if (carsApi) for (const c of carsApi.cars) if (!c.noFade) testBody(c.model.g, c.bus ? 'bus' : 'car', range); // (not the bus you're aboard)
      const P = npcs.street?.props;
      if (P) { testBody(P.van, 'van', range); testBody(P.scooter, 'scooter', range); }
    }
    if (playing) {
      // the baked world: any collider on the line (not the house: the camera is pulled in for it, player.js)
      const hit = !fp && collidersHit(range + 2, false);
      const u = FADE.uFadeMin;
      const to = hit ? KMIN : 1;
      u.value = u.value < to ? Math.min(to, u.value + RATE * dt) : Math.max(to, u.value - RATE * dt);
      volOn = u.value < 0.9995;
      FADE.uFadeOn.value = volOn ? 1 : 0;
      if (volOn) uniforms();
    } else {
      FADE.uFadeMin.value = 1; FADE.uFadeOn.value = 0; volOn = false;
    }
    ghostsDrawn = placeGhosts();
    // ease every fading object; what was not asked for this frame comes back
    for (let i = active.length - 1; i >= 0; i--) {
      const s = active[i];
      ease(s, dt);
      if (s.k >= 1 && !s.on) { active.splice(i, 1); s.root.userData.fadeK = 1; }
      s.target = 1;
    }
  }

  return {
    name: 'camera-fade',
    update,
    api: {
      KMIN, CAP_R, CAM_R,
      get enabled() { return enabled; }, set enabled(v) { enabled = !!v; },
      fadeOf: root => states.get(root)?.k ?? 1,
      get active() { return active.length; },
      get volume() { return { on: volOn, min: FADE.uFadeMin.value, ghosts: ghostsDrawn, of: ghosts.length, sphere: sphereR, firstPerson: fp }; },
      line: () => ({ a: _a.clone(), b: _b.clone() }),
      // (tests, collider-grid-test) the line from the camera as it stands now: does a collider block it? the grid's way and the whole list's
      hitNow: (far = dist + 6) => { line(); return { grid: collidersHit(far, false), all: collidersHit(far, true) }; },
      scan,
    },
  };
}
