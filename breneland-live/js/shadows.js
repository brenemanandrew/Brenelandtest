// Shadows, budgeted. Every shadow map is drawn here, once a frame, just before the colour pass (InkPass.beforePasses):
//
//   The sun's box follows the view, not the player: the same 96 m square (the same texel size, the same crisp shadows up
//   close) slid ahead of the camera along where it looks, so it reaches about 70 m ahead and wastes nothing behind you. It
//   moves in whole texels in the light's own frame (no shimmer as you walk or turn) and its last few metres fade out softly
//   (a patched shadow lookup) instead of stopping at a hard line.
//   A caster is drawn into the sun's map only if its shadow can reach what the camera sees (its bounding sphere swept down
//   the light, tested against the view frustum: SunFrustum below).
//
//   Static casters are drawn as shadow proxies: everything that casts a shadow and hasn't moved for a while (the baked town,
//   houses, fences, props, the woods' trunks) is cut into 32 m cells, position-only, one mesh per cell (and per face side),
//   on a layer only the shadow passes see. A shadow map then draws only the cells it covers, so the lamps' and the
//   campfire's cube maps (six renders each) don't push the whole town through the GPU six times. The originals stop casting
//   (they still receive and draw). Something that moves later (a door, a gate) is noticed by its matrix, goes back to
//   casting itself and its cell is rebuilt. The woods' crowns sway in their shadows (weather-cover.js canopyDepthMaterial),
//   so they stay instanced, cut into 48 m cells of their own for the shadow passes.
//
//   createShadows(...) -> { place(camera), render(), api }   main.js: place() each frame (where the sun's box goes),
//   ink.beforePasses = () => shadows.render().  GFX.s.sunBox / sunAhead set the box per class and level (gfx.js).
import * as THREE from 'three';
import { GFX } from './gfx.js';
import { SUN_DIR } from './world.js';
import { PERF, mergeGroups, applyGroupMerge } from './perf-flags.js';

export const LAYER_SHADOW = 7; // shadow proxies: drawn by the shadow passes only (the main camera never has this layer)
const CELL = 32;               // static proxy cells (m)
const CANOPY_CELL = 48;        // the woods' crowns, for the shadow passes
const SETTLE = 0.5;            // seconds a baked caster (matrixAutoUpdate off: a Batcher's) must stand still before it becomes a proxy
const SETTLE_LOOSE = 12;       // the same for anything else (a sitting neighbour or a parked car is not a building)
const RESCAN = 10;             // seconds between looks for new casters (features build things late)
const BUILD_TRIS = 15000;      // triangles cut into cells per frame while proxies are being built (no long task)
// A street lamp's light reaches 26 m but falls off with the square of the distance: past 15 m it adds under 6% of the
// night's light, so a shadow it would cast from there is invisible. Its cube map only draws casters within 15 m.
const LAMP_REACH = 15;
const MARGIN = 2;              // metres added round a unit's bounds (it moves and changes pose between measurements)
const SPECK = 0.065;           // a character's parts smaller than this (eyes, glints) cast no shadow: it lies inside the head's

// ------------------------------------------------------------------ the soft edge of the sun's shadow
// The directional shadow lookup in every lit material fades to "lit" over the outer 9% of the shadow map, so the end of
// the shadow distance is a soft fade instead of a hard line where shadows stop. Patched once, before anything compiles.
(function patchChunks() {
  const C = THREE.ShaderChunk;
  const call = 'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
  if (C.lights_fragment_begin.includes(call) && !C.lights_fragment_begin.includes('sunEdgeFade')) {
    C.lights_fragment_begin = C.lights_fragment_begin.replace(call, `sunEdgeFade( ${call}, vDirectionalShadowCoord[ i ] )`);
    C.shadowmap_pars_fragment = C.shadowmap_pars_fragment.replace('#ifdef USE_SHADOWMAP', `#ifdef USE_SHADOWMAP
	float sunEdgeFade( float s, vec4 c ) {
		vec2 e = abs( c.xy / c.w - 0.5 ) * 2.0;
		return mix( s, 1.0, smoothstep( 0.82, 0.98, max( e.x, e.y ) ) );
	}`);
  }
})();

// ------------------------------------------------------------------ the sun's culling volume
// three culls shadow casters with light.shadow's frustum (the box). This one also asks whether the caster's shadow can
// land in view: its bounding sphere swept down the light to the ground, against the camera's frustum planes (outside
// only when both ends are behind the same plane: conservative, never drops a shadow you could see).
const _sph = new THREE.Sphere(), _end = new THREE.Vector3();
class SunFrustum extends THREE.Frustum {
  constructor() { super(); this.view = new THREE.Frustum(); this.down = new THREE.Vector3(0, -1, 0); this.on = false; this.culled = 0; }
  reaches(s) {
    if (!this.on) return true;
    const d = this.down, len = (s.center.y + 1.5 + s.radius) / Math.max(0.1, -d.y);
    _end.copy(s.center).addScaledVector(d, len);
    const r = -s.radius;
    for (const p of this.view.planes) if (p.distanceToPoint(s.center) < r && p.distanceToPoint(_end) < r) { this.culled++; return false; }
    return true;
  }
  intersectsObject(o) {
    if (!super.intersectsObject(o)) return false;
    // (super left the object's world sphere in three's internal sphere; recompute ours, cheaply)
    if (o.boundingSphere !== undefined && o.boundingSphere !== null) _sph.copy(o.boundingSphere).applyMatrix4(o.matrixWorld);
    else { const g = o.geometry; if (g.boundingSphere === null) g.computeBoundingSphere(); _sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld); }
    return this.reaches(_sph);
  }
  intersectsSprite(s) { return super.intersectsSprite(s); }
}

export function createShadows({ renderer, scene, camera, sun, ink }) {
  const shadowMap = renderer.shadowMap;
  sun.shadow.autoUpdate = false;                // drawn here, not inside the colour pass
  const sunFrustum = new SunFrustum();
  sun.shadow._frustum = sunFrustum;             // (three r186 culls with shadow.getFrustum() = shadow._frustum)
  const passCam = new THREE.PerspectiveCamera(); // the camera the shadow passes test layers against
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), upL = new THREE.Vector3(), centre = new THREE.Vector3();
  const _m4 = new THREE.Matrix4(), _v = new THREE.Vector3();

  // ---------------------------------------------------------------- where the sun's box goes
  // A square of side S (GFX.s.sunBox) around a point `ahead` metres in front of the camera (along the ground), snapped
  // to whole texels in the light's frame. The light sits 120 m up its own direction from there (near 1, far 260).
  function place(cam) {
    const S = GFX.s.sunBox || 96, ahead = GFX.s.sunAhead ?? 30;
    const sc = sun.shadow.camera;
    if (sc.right !== S / 2) { sc.left = -S / 2; sc.right = S / 2; sc.top = S / 2; sc.bottom = -S / 2; sc.updateProjectionMatrix(); }
    cam.getWorldDirection(fwd);
    const h = Math.hypot(fwd.x, fwd.z);
    centre.copy(cam.position);
    if (h > 1e-3) { centre.x += (fwd.x / h) * ahead * h; centre.z += (fwd.z / h) * ahead * h; }
    centre.y = 0;
    // the light's frame (three's lookAt with world up): snap the centre to texels across the light
    const L = SUN_DIR;
    _v.set(-L.x, -L.y, -L.z);                                   // the light looks along -L
    right.crossVectors(_v, THREE.Object3D.DEFAULT_UP);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0); else right.normalize();
    upL.crossVectors(right, _v).normalize();
    const texel = S / sun.shadow.mapSize.x;
    const u = centre.dot(right), v = centre.dot(upL);
    centre.addScaledVector(right, Math.round(u / texel) * texel - u).addScaledVector(upL, Math.round(v / texel) * texel - v);
    sun.target.position.copy(centre);
    sun.position.set(centre.x + L.x * 120, centre.y + L.y * 120, centre.z + L.z * 120);
    sunFrustum.down.set(-L.x, -L.y, -L.z);
  }

  // ---------------------------------------------------------------- static casters -> proxies
  const known = new WeakSet();          // looked at already
  const cands = [];                     // { o, m: Float64Array(16), still: seconds }
  const statics = [];                   // promoted: { o, m, vis, parts: Map(cellKey -> Float32Array), key }
  const pending = [];                   // promoted, waiting to be cut into cells
  const cells = new Map();              // key -> { members: Set, meshes: [], dirty, cx, cz, size }
  const movers = new WeakSet();         // moved after promotion: never again
  const fresh = [];
  let dirtyAny = false, proxyEpoch = 0, forceEpoch = 0;
  const stats = { flips: 0, rebuilds: 0, demoted: 0, kept: 0, lastFlip: null, lastDemoted: null };
  const group = new THREE.Group();
  group.name = 'shadow-proxies';
  group.matrixAutoUpdate = false;
  scene.add(group);
  const supers = new Map();             // 'sx,sz' -> Group of 4 x 4 cells (a unit for the pruning)
  function superFor(key) {
    const [cx, cz] = key.split(',').map(Number), sk = Math.floor(cx / 4) + ',' + Math.floor(cz / 4);
    let g = supers.get(sk);
    if (!g) { g = new THREE.Group(); g.name = 'shadow-block ' + sk; g.matrixAutoUpdate = false; group.add(g); supers.set(sk, g); unitsAt = 0; }
    return g;
  }
  const sideMats = new Map();           // 'side|shadowSide' -> MeshBasicMaterial (only its sides matter for depth)
  const matFor = m => {
    const key = m.side + '|' + m.shadowSide;
    let p = sideMats.get(key);
    if (!p) { p = new THREE.MeshBasicMaterial({ side: m.side }); p.shadowSide = m.shadowSide; p.name = 'shadow-proxy'; sideMats.set(key, p); }
    return p;
  };
  const MAINMASK = (1 << 0) | (1 << 2); // what the main camera sees (toon.js LAYER_WORLD, LAYER_SOFT): only those cast now
  const effVisible = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const isCanopy = o => o.isInstancedMesh && /^forest-/.test(o.name) && o.customDepthMaterial;
  const isTrunk = o => o.isInstancedMesh && (o.name === 'forest-trunk' || o.name === 'forest-trunk-birch'); // (and the birches' white trunks)
  function eligible(o) {
    if (!o.isMesh || !o.castShadow || o.isSkinnedMesh || o.parent === group || o.userData.fadeGhost === true) return false; // (a ghost is `true`; its source carries the ghost itself)
    if (!(o.layers.mask & MAINMASK)) return false;
    if (o.isInstancedMesh && !isTrunk(o)) return false;
    let m = o.material;
    // (a mesh with a material per face group casts like one with a single material when they all agree on the sides)
    if (Array.isArray(m)) { const a = m[0]; if (!a || m.some(x => !x || x.side !== a.side || x.shadowSide !== a.shadowSide || x.alphaTest > 0 || !x.visible)) return false; m = a; }
    if (!m || m.alphaTest > 0 || (o.customDepthMaterial && !o.userData.depthVariant) || o.morphTargetInfluences) return false;
    const g = o.geometry;
    if (!g || !g.attributes.position || g.morphAttributes?.position) return false;
    return true;
  }
  let scanAt = 0, built = false;
  function scan() {
    const users = new Map(); // (how many meshes share each geometry: a shared one keeps its face groups)
    scene.traverse(o => { if (o.isMesh && Array.isArray(o.material)) users.set(o.geometry, (users.get(o.geometry) || 0) + 1); });
    scene.traverse(o => {
      if (known.has(o)) return;
      known.add(o);
      if (users.has(o.geometry)) mergeGroups(o, users.get(o.geometry));
      if (isCanopy(o)) { canopyChunks(o); return; }
      if (!eligible(o)) return;
      cands.push({ o, m: Float64Array.from(o.matrixWorld.elements), still: 0, moves: 0 });
    });
  }
  const sameM = (a, e) => { for (let i = 0; i < 16; i++) if (a[i] !== e[i]) return false; return true; };
  // cut a promoted caster's triangles into cells (world space, position only), at most `budget` triangles a call: a big
  // batch (the whole town) or the woods' 3800 trunks are cut over several frames. Returns the triangles done.
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _mw = new THREE.Matrix4(), _mi = new THREE.Matrix4();
  function cut(s, budget) {
    const o = s.o, g = o.geometry, pos = g.attributes.position, idx = g.index;
    const range = g.drawRange, start = range.start, n = Math.min(idx ? idx.count : pos.count, range.count);
    const mats = o.isInstancedMesh ? o.count : 1;
    if (!s.cur) s.cur = { k: 0, t: start, bins: new Map() };
    const cur = s.cur, bins = cur.bins;
    let done = 0;
    while (cur.k < mats && done < budget) {
      if (o.isInstancedMesh) { o.getMatrixAt(cur.k, _mi); _mw.multiplyMatrices(o.matrixWorld, _mi); } else _mw.copy(o.matrixWorld);
      for (; cur.t + 2 < start + n && done < budget; cur.t += 3, done++) {
        const t = cur.t, i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
        _a.fromBufferAttribute(pos, i0).applyMatrix4(_mw); _b.fromBufferAttribute(pos, i1).applyMatrix4(_mw); _c.fromBufferAttribute(pos, i2).applyMatrix4(_mw);
        const key = (Math.floor((_a.x + _b.x + _c.x) / 3 / CELL) + 2048) * 4096 + Math.floor((_a.z + _b.z + _c.z) / 3 / CELL) + 2048;
        let arr = bins.get(key);
        if (!arr) bins.set(key, arr = []);
        arr.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
      }
      if (cur.t + 2 >= start + n) { cur.k++; cur.t = start; }
    }
    if (cur.k < mats) return done;
    // all cut: into the cells
    s.parts = new Map();
    for (const [nk, arr] of bins) {
      const key = (Math.floor(nk / 4096) - 2048) + ',' + ((nk % 4096) - 2048);
      s.parts.set(key, Float32Array.from(arr));
      let cell = cells.get(key);
      if (!cell) cells.set(key, cell = { key, members: new Set(), meshes: [], dirty: true, epoch: 0 });
      cell.members.add(s); cell.dirty = true; dirtyAny = true;
    }
    s.cur = null;
    return done;
  }
  function rebuild(cell) {
    cell.dirty = false;
    stats.rebuilds++;
    cell.epoch = ++proxyEpoch; // (a lamp keeping this cell in its static shadow redraws it)
    for (const m of cell.meshes) { m.parent?.remove(m); m.geometry.dispose(); }
    cell.meshes.length = 0;
    const bySide = new Map();
    for (const s of cell.members) {
      if (!s.vis) continue;
      const mat = matFor(Array.isArray(s.o.material) ? s.o.material[0] : s.o.material);
      let l = bySide.get(mat);
      if (!l) bySide.set(mat, l = []);
      l.push(s.parts.get(cell.key));
    }
    for (const [mat, list] of bySide) {
      let len = 0;
      for (const p of list) len += p.length;
      const all = new Float32Array(len);
      let off = 0;
      for (const p of list) { all.set(p, off); off += p.length; }
      const geo = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(all, 3);
      attr.onUpload(function () { this.array = null; }); // (the GPU has it; a rebuild starts again from the parts)
      geo.setAttribute('position', attr);
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'shadow-proxy ' + cell.key;
      mesh.layers.set(LAYER_SHADOW);
      mesh.castShadow = true; mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      superFor(cell.key).add(mesh);
      cell.meshes.push(mesh);
    }
  }
  function promote(c) {
    const s = { o: c.o, m: c.m, vis: effVisible(c.o), parts: null, flipN: 0 };
    statics.push(s);
    pending.push(s);
  }
  function demote(s, i) {
    statics.splice(i, 1);
    stats.demoted++; stats.lastDemoted = s.o;
    movers.add(s.o);
    s.o.castShadow = true;
    if (s.parts) for (const key of s.parts.keys()) { const cell = cells.get(key); if (cell) { cell.members.delete(s); cell.dirty = true; dirtyAny = true; } }
    else { const k = pending.indexOf(s); if (k >= 0) pending.splice(k, 1); }
  }

  // the woods' crowns: per-cell instanced copies for the shadow passes only (same geometry, same swaying depth material)
  const canopies = [];
  function canopyChunks(src) {
    const bins = new Map(), mi = new THREE.Matrix4();
    for (let k = 0; k < src.count; k++) {
      src.getMatrixAt(k, mi);
      const x = mi.elements[12], z = mi.elements[14];
      const key = Math.floor(x / CANOPY_CELL) + ',' + Math.floor(z / CANOPY_CELL);
      let l = bins.get(key);
      if (!l) bins.set(key, l = []);
      l.push(k);
    }
    for (const [key, list] of bins) {
      const im = new THREE.InstancedMesh(src.geometry, src.material, list.length);
      list.forEach((k, j) => { src.getMatrixAt(k, mi); im.setMatrixAt(j, mi); });
      im.instanceMatrix.needsUpdate = true;
      im.customDepthMaterial = src.customDepthMaterial;
      if (src.customDistanceMaterial) im.customDistanceMaterial = src.customDistanceMaterial;
      im.name = 'shadow-canopy ' + src.name + ' ' + key;
      im.layers.set(LAYER_SHADOW);
      im.castShadow = true; im.receiveShadow = false;
      im.matrixAutoUpdate = false; im.matrix.copy(src.matrixWorld); im.matrixWorld.copy(src.matrixWorld);
      im.computeBoundingSphere();
      superFor(key.split(',').map(v => Math.floor(Number(v) * CANOPY_CELL / CELL)).join(',')).add(im);
      known.add(im);
    }
    src.castShadow = false;
    canopies.push(src);
  }

  let last = performance.now() / 1000;
  function upkeep() {
    const now = performance.now() / 1000, dt = Math.min(0.5, Math.max(0, now - last));
    last = now;
    if (now > scanAt) { scanAt = now + RESCAN; scan(); }
    // candidates that stood still long enough become proxies
    for (let i = cands.length - 1; i >= 0; i--) {
      const c = cands[i], e = c.o.matrixWorld.elements;
      if (!c.o.parent || movers.has(c.o)) { cands.splice(i, 1); continue; }
      if (!sameM(c.m, e)) { c.m.set(e); c.still = 0; if (++c.moves > 3) { cands.splice(i, 1); movers.add(c.o); } continue; } // (a mover: casts itself, never checked again)
      if ((c.still += dt) >= (c.o.matrixAutoUpdate === false || isTrunk(c.o) ? SETTLE : SETTLE_LOOSE)) { cands.splice(i, 1); if (c.o.castShadow && eligible(c.o)) promote(c); }
    }
    // promoted ones: still where they were, still showing?
    for (let i = statics.length - 1; i >= 0; i--) {
      const s = statics[i], o = s.o;
      if (!o.parent || !sameM(s.m, o.matrixWorld.elements)) { demote(s, i); continue; }
      const vis = effVisible(o);
      if (vis !== s.vis) { stats.flips++; stats.lastFlip = o; if (++s.flipN > 3) { demote(s, i); continue; } s.vis = vis; if (s.parts) { for (const key of s.parts.keys()) cells.get(key).dirty = true; dirtyAny = true; } } // (one that keeps blinking goes back to casting itself)
    }
    // cut a bounded number of triangles a frame; a caster stops casting itself only once its cells are built
    let budget = BUILD_TRIS;
    fresh.length = 0;
    while (pending.length && budget > 0) {
      const s = pending[0];
      budget -= cut(s, budget);
      if (s.parts) { pending.shift(); fresh.push(s); }
    }
    if (dirtyAny) { dirtyAny = false; for (const cell of cells.values()) if (cell.dirty) rebuild(cell); }
    for (const s of fresh) s.o.castShadow = false;
    if (!pending.length && statics.length) built = true;
  }

  // ---------------------------------------------------------------- pruning: whole subtrees out of a shadow pass
  // three walks the whole scene graph for every shadow map (six times for a lamp's cube): 6000 objects, most of them far
  // from the light or casting nothing now that the static world is proxied. So the scene is cut into units (the top-level
  // things, going down into anything wider than 25 m: the world's batches, the town's props, every character, each block
  // of proxies), each with a bounding sphere that follows it; for each light the units that cast nothing, or cannot
  // reach its map, are hidden for that light's pass only.
  const units = [];                     // { o, r, ox, oy, oz, cx, cy, cz, caster }
  let unitsAt = 0, refresh = 0;
  const _box = new THREE.Box3(), _bs = new THREE.Sphere(), _t = new THREE.Vector3();
  // Depth materials per kind of caster: three draws every shadow with one depth material (one distance
  // material for the lamps' cube maps) and looks its program up again each time the next caster is of another kind
  // (skinned, instanced, plain): a dozen to two dozen look-ups a frame, each a parameter object and a key string. Each
  // kind gets its own here (what three would draw with is the same material type; the picture is the same). Casters
  // whose material needs three's own per-material copy (alpha tested or cut by an alpha map, displaced, clipped,
  // morphed) and those with a depth material of their own (the woods' swaying crowns) are left alone.
  const variants = new Map();
  function depthVariant(c) {
    const mine = c.userData.depthVariant === true;
    if (!PERF.depthVariants) { if (mine) { delete c.customDepthMaterial; delete c.customDistanceMaterial; c.userData.depthVariant = false; } return; }
    if (mine || !c.isMesh || c.isBatchedMesh || c.customDepthMaterial || c.customDistanceMaterial || c.morphTargetInfluences) return;
    const m = c.material;
    if (!m || Array.isArray(m) || m.alphaTest > 0 || m.alphaMap || m.displacementMap || m.alphaToCoverage || (m.clippingPlanes && m.clippingPlanes.length)) return;
    const key = (c.isSkinnedMesh ? 's' : '') + (c.isInstancedMesh ? (c.instanceColor ? 'ic' : 'i') : '');
    let v = variants.get(key);
    if (!v) { v = { depth: new THREE.MeshDepthMaterial(), dist: new THREE.MeshDistanceMaterial() }; v.depth.name = 'depth-' + (key || 'plain'); v.dist.name = 'distance-' + (key || 'plain'); variants.set(key, v); }
    c.customDepthMaterial = v.depth; c.customDistanceMaterial = v.dist; c.userData.depthVariant = true;
  }
  function measure(u) {
    const o = u.o;
    _box.makeEmpty();
    let caster = false, unbounded = false, noView = false;
    o.traverse(c => {
      if (c.isLight) noView = true;                                   // (hiding a light would change every shader)
      if (!(c.isMesh || c.isPoints || c.isLine || c.isSprite)) return;
      // (a skinned neck, tail or collar drawn unculled, the dogs' and unicorns', stays inside its character: the box below
      // takes its skinned box and MARGIN the rest, so the character keeps its bounds)
      if (c.frustumCulled === false && !(PERF.boundedSkins && c.isSkinnedMesh)) { noView = true; if (c.castShadow) unbounded = true; }
      if (c.castShadow) caster = true;
      depthVariant(c);
    });
    _box.setFromObject(o);
    if (!u.specks && !_box.isEmpty() && _box.getBoundingSphere(_bs).radius < 4) { // a character (15+ parts, under 4 m): its specks stop casting
      u.specks = true;
      let parts = 0;
      o.traverse(c => { if (c.isMesh) parts++; });
      if (parts >= 15) o.traverse(c => {
        if (!c.isMesh || !c.castShadow || c.isInstancedMesh) return;
        const g = c.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
        if (g.boundingSphere.radius * Math.abs(c.getWorldScale(_t).x) < SPECK) c.castShadow = false;
      });
    }
    u.caster = caster;
    u.view = !noView;
    if (_box.isEmpty()) { u.r = 0; u.ox = u.oy = u.oz = 0; u.view = false; return; }
    _box.getBoundingSphere(_bs);
    _t.setFromMatrixPosition(o.matrixWorld);
    u.ox = _bs.center.x - _t.x; u.oy = _bs.center.y - _t.y; u.oz = _bs.center.z - _t.z;
    u.rv = _bs.radius + MARGIN;
    u.r = unbounded ? 1e9 : u.rv; // (an unculled caster's bounds mean nothing: never pruned)
  }
  function collectUnits() {
    units.length = 0;
    const visit = (parent, depth) => {
      for (const c of parent.children) {
        if (c.isLight || c.isCamera) continue;
        if (!c.isMesh && c.children.length > 1 && depth < 4 && c !== group) {
          _box.setFromObject(c);
          if (!_box.isEmpty() && _box.getBoundingSphere(_bs).radius > 25) { visit(c, depth + 1); continue; }
        }
        if (c === group) { visit(c, depth + 1); continue; }
        const u = { o: c, r: 0, rv: 0, ox: 0, oy: 0, oz: 0, cx: 0, cy: 0, cz: 0, caster: true, view: false };
        measure(u);
        units.push(u);
      }
    };
    visit(scene, 0);
  }
  function placeUnits() {
    // a few units re-measured every frame (each about once a second), all of them placed where they are now
    const n = Math.ceil(units.length / 60);
    for (let k = 0; k < n && units.length; k++) measure(units[refresh++ % units.length]);
    for (const u of units) {
      const e = u.o.matrixWorld.elements;
      u.cx = e[12] + u.ox; u.cy = e[13] + u.oy; u.cz = e[14] + u.oz;
    }
  }
  // A scenic view hides what is behind your head, for you only: `behind` = { x, y, z (the camera), fx, fz (the
  // way the seat faces, flat), acos (the widest angle from it, radians, the camera can ever see), near } while you sit in
  // one, else null. A unit wholly beyond that angle (its bounding sphere included) and not within `near` metres is left
  // out of the camera's passes and of the sun's map: nothing it would add can reach the picture the view can show, except
  // a shadow, which the view gives up. The lamps' and the fire's maps keep everything (they keep static copies).
  let behind = null, behindN = 0;
  function inBehind(u) {
    const B = behind, dx = u.cx - B.x, dy = u.cy - B.y, dz = u.cz - B.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d - u.rv < B.near) return false;
    const a = Math.acos(Math.max(-1, Math.min(1, (dx * B.fx + dz * B.fz) / d))) - Math.asin(Math.min(1, u.rv / d));
    return a > B.acos;
  }
  const hidden = [];
  let hiddenN = 0;
  // mode: 0 everything that can reach the light, 1 only the static proxies (a lamp's kept map), 2 all but them
  function prune(light, mode = 0) {
    hiddenN = 0;
    const sunPass = light === sun;
    const reach = light.userData.lampLight ? Math.min(LAMP_REACH, light.distance || 1e9) : light.distance || 1e9;
    if (!sunPass) { _t.setFromMatrixPosition(light.matrixWorld); }
    for (const u of units) {
      const o = u.o;
      if (!o.visible) continue;
      let keep = u.caster && u.r > 0;
      if (keep && mode) keep = (u.o.parent === group) === (mode === 1);
      if (keep && sunPass) {
        _bs.center.set(u.cx, u.cy, u.cz); _bs.radius = u.r;
        keep = THREE.Frustum.prototype.intersectsSphere.call(sunFrustum, _bs) && sunFrustum.reaches(_bs) && !(behind && u.r < 1e8 && inBehind(u));
      } else if (keep) {
        const dx = u.cx - _t.x, dy = u.cy - _t.y, dz = u.cz - _t.z, rr = reach + u.r;
        keep = dx * dx + dy * dy + dz * dz < rr * rr;
      }
      if (!keep) { o.visible = false; hidden[hiddenN++] = o; }
    }
  }
  function unprune() { for (let i = 0; i < hiddenN; i++) hidden[i].visible = true; hiddenN = 0; }

  // The camera's passes (colour, normals) skip units wholly outside the view: three would cull each of their meshes
  // anyway, but only after walking all of them, twice a frame. (Never a unit holding a light, or anything drawn unculled.)
  const viewHidden = [];
  let viewN = 0;
  function cullView() {
    viewN = 0; behindN = 0;
    const f = sunFrustum.view;
    for (const u of units) {
      if (!u.view || !u.o.visible) continue;
      _bs.center.set(u.cx, u.cy, u.cz); _bs.radius = u.rv;
      if (behind && inBehind(u)) { u.o.visible = false; viewHidden[viewN++] = u.o; behindN++; }
      else if (!f.intersectsSphere(_bs)) { u.o.visible = false; viewHidden[viewN++] = u.o; }
    }
  }
  const showView = () => { for (let i = 0; i < viewN; i++) viewHidden[i].visible = true; };
  const hideView = () => { for (let i = 0; i < viewN; i++) viewHidden[i].visible = false; };
  function afterPasses() { showView(); viewN = 0; }

  // ---------------------------------------------------------------- the shadow passes
  // three draws the shadow maps inside the colour pass's render() (it needs that call's render state), so render() only
  // gets the frame ready and the shadow map's own render is wrapped: for our scene it runs with passCam, whose layers
  // add the proxies' layer, and with the sun asked for this frame.
  const passMask = MAINMASK | (1 << LAYER_SHADOW);
  passCam.layers.mask = passMask;
  let armed = false;
  function render() {
    upkeep();
    const now = performance.now() / 1000;
    if (now > unitsAt) { unitsAt = now + RESCAN; collectUnits(); }
    placeUnits();
    // the view the sun's culling tests against (the camera as it renders this frame)
    _m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    sunFrustum.view.setFromProjectionMatrix(_m4);
    sunFrustum.on = true; sunFrustum.culled = 0;
    if (sun.castShadow) sun.shadow.needsUpdate = true;
    armed = true;
    cullView();
  }
  const smRender = shadowMap.render;
  // ---------------------------------------------------------------- the lamps' and the fire's static shadows, kept
  // A street lamp and the campfire do not move, nor does the world round them: their cube maps' static part (the
  // proxies) is drawn once per spot into a kept copy, and each update copies it back (six depth blits) and draws only
  // what moves (people, dogs, cars) on top. Redrawn when the light moves to another lamp, its map size changes, or a
  // proxy cell is rebuilt.
  const kept = new Map(); // light -> { rt, x, y, z, size, epoch }
  const gl = renderer.getContext();
  function blitCube(src, dst, size) {
    const st = renderer.state, sf = renderer.properties.get(src).__webglFramebuffer, df = renderer.properties.get(dst).__webglFramebuffer;
    if (!sf || !df || !sf.length || !df.length) return false;
    st.buffers.depth.setMask(true); st.setScissorTest(false);
    for (let f = 0; f < 6; f++) {
      st.bindFramebuffer(gl.READ_FRAMEBUFFER, sf[f]); st.bindFramebuffer(gl.DRAW_FRAMEBUFFER, df[f]);
      gl.blitFramebuffer(0, 0, size, size, 0, 0, size, size, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    }
    st.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    return true;
  }
  function keptFor(l, size) {
    let k = kept.get(l);
    if (k && k.size !== size) { k.rt.dispose(); k = null; }
    if (!k) {
      const rt = new THREE.WebGLCubeRenderTarget(size);
      rt.depthTexture = new THREE.CubeDepthTexture(size, THREE.UnsignedIntType);
      rt.depthTexture.format = THREE.DepthFormat;
      const cur = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
      renderer.setRenderTarget(rt, 0); // (allocates its six framebuffers)
      renderer.setRenderTarget(cur, face, mip);
      k = { rt, x: NaN, y: 0, z: 0, size, epoch: -1, cells: [] };
      kept.set(l, k);
    }
    return k;
  }
  const noClear = () => {};
  let keepOn = true;
  function renderPoint(self, l, sc) {
    const size = l.shadow.mapSize.x, p = l.position;
    if (!keepOn || !l.shadow.map) { prune(l, 0); one[0] = l; shadowMap.needsUpdate = true; try { smRender.call(self, one, sc, passCam); } finally { unprune(); } return; }
    const k = keptFor(l, size);
    one[0] = l;
    let stale = k.x !== p.x || k.y !== p.y || k.z !== p.z || k.epoch < forceEpoch || k.ncells !== cells.size; // (a new cell anywhere: look again)
    if (!stale) for (const c of k.cells) if (c.epoch > k.epoch) { stale = true; break; }
    if (stale) {
      prune(l, 1);
      shadowMap.needsUpdate = true;
      try { smRender.call(self, one, sc, passCam); } finally { unprune(); }
      if (!blitCube(l.shadow.map, k.rt, size)) return;
      k.x = p.x; k.y = p.y; k.z = p.z; k.epoch = proxyEpoch;
      // the cells this light can reach (only their rebuilds make it redraw)
      const reach = (l.userData.lampLight ? Math.min(LAMP_REACH, l.distance || 1e9) : l.distance || 1e9) + CELL;
      k.cells.length = 0; k.ncells = cells.size;
      for (const c of cells.values()) {
        const [cx, cz] = c.key.split(',').map(Number), dx = (cx + 0.5) * CELL - p.x, dz = (cz + 0.5) * CELL - p.z;
        if (dx * dx + dz * dz < reach * reach) k.cells.push(c);
      }
      stats.kept++;
    } else if (!blitCube(k.rt, l.shadow.map, size)) return;
    // what moves, on top of the kept static depth (no clear)
    prune(l, 2);
    l.shadow.needsUpdate = true; shadowMap.needsUpdate = true;
    const clear = renderer.clear;
    renderer.clear = noClear;
    try { smRender.call(self, one, sc, passCam); } finally { renderer.clear = clear; unprune(); }
  }

  const one = [null];
  shadowMap.render = function (lightsArr, sc, cam) {
    if (sc !== scene || !armed) return smRender.call(this, lightsArr, sc, cam);
    armed = false;
    // one light at a time, each with the units it cannot see hidden (three's own render state is untouched: the lights
    // and the colour pass's draw list were gathered before this runs). What the camera does not see may still cast.
    showView();
    for (const l of lightsArr) {
      if (!l.castShadow) continue;
      if (!l.shadow.map) l.shadow.needsUpdate = true; // (a lamp that just started casting: drawn now, or this frame's lit draws would sample a missing map and fail)
      if (!l.shadow.autoUpdate && !l.shadow.needsUpdate) continue;
      if (l.isPointLight && l.shadow.map) { renderPoint(this, l, sc); continue; }
      if (l === sun) sun.shadow.updateMatrices(sun); // (the box's planes for this frame, before pruning against them)
      prune(l);
      one[0] = l;
      shadowMap.needsUpdate = true;
      try { smRender.call(this, one, sc, passCam); } finally { unprune(); }
    }
    hideView();
    shadowMap.needsUpdate = false;
  };

  return {
    place, render, afterPasses,
    api: {
      get statics() { return statics.length; }, get pending() { return pending.length; }, get candidates() { return cands.length; },
      get cells() { return cells.size; }, get proxies() { return group.children.length; }, get built() { return built; },
      get culled() { return sunFrustum.culled; }, get viewCulled() { return viewN; }, canopies, group, sunFrustum, units, stats,
      get behind() { return behind; }, set behind(b) { behind = b || null; }, get behindHidden() { return behindN; }, inBehind: u => !!behind && inBehind(u),
      // tests: draw every shadow plainly (originals cast, no proxies, no kept lamp maps) or with the proxies, same frame
      setProxies(on) {
        applyGroupMerge(PERF.groupMerge); // (perf2-check: the frame drawn with the face groups merged or not)
        for (const s of statics) if (s.parts) s.o.castShadow = !on;
        for (const c of canopies) c.castShadow = !on;
        group.visible = !!on; keepOn = !!on; forceEpoch = ++proxyEpoch;
        for (const u of units) measure(u);
      },
      // what shadows.js thinks of one object (tests and debugging)
      why(o) { const c = cands.find(x => x.o === o); return { known: known.has(o), eligible: eligible(o), cand: c ? c.still : null, proxied: statics.some(x => x.o === o), mover: movers.has(o), castShadow: o.castShadow }; },
    },
  };
}
