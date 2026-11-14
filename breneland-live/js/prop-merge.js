// Still props in fewer draw calls. The baked world is already one mesh per material and place (batch.js) and the characters
// one skinned mesh per material (rigid-merge.js). What's left is every feature's loose meshes (the bocce balls, the park's
// benches, the water tower's ladder, the store's fittings...), 100-200 draws a pass at some spots. A loose mesh that has stood
// still a few seconds is drawn as part of one mesh per material, feature and 24 m cell, its vertices baked where it stands
// (the same triangles and the same material object, so colours daynight changes follow by themselves).
//
//   The originals stay put and keep working (code may still move, hide, re-dress or remove them), they just stop drawing
//   (layer mask 0, like rigid-merge's parts). Every frame, after the world matrices are up to date and before anything draws
//   (InkPass.render, through perf-flags.js frameHooks), each merged mesh checks its parts: moved, hidden (it or anything above
//   it), re-dressed, re-layered, removed, reshaped or gone see-through. If so the parts are put back that same frame and the
//   merged mesh goes. A part that moved never merges again, and neither does one that blinks more than three times.
//   Left alone: characters (rigid-merge's roots and anyone the crowd pushes), instanced, skinned, morphing, unculled,
//   see-through or multi-material meshes, meshes with their own onBeforeRender or a patched shader (a shader that reads the
//   object's own space would see the world's), the shadow proxies and camera-fade's ghosts.
//
//   createPropMerge({ scene, characters }) -> { api }   characters() yields the character roots (main.js).
import * as THREE from 'three';
import { PERF, frameHooks, perfApi } from './perf-flags.js';

const DEAD = 0;
const STILL = 3;          // seconds a mesh must stand still before it merges
const CHECK = 1;          // seconds between groupings of the still meshes
const RESCAN = 8;         // seconds between listings of the scene's loose meshes
const SLICE = 120;        // listed meshes looked at a frame
const WALK = 700;         // scene objects listed a frame
const CELL = 24;          // metres: a merged mesh covers one feature's props in one cell (culling still works)
const MIN_PARTS = 2;      // fewer than this in a group: nothing to gain
const BLINKS = 3;

const M0 = THREE.Material.prototype;
// a material whose shader is three's own, or patched only in view or world space: camera-fade's hole (toon.js) and the
// weather's cover on ground-like surfaces (weather-cover.js, kind 'ground'). Sways and anything per object are not.
const SAFE_PATCH = /^(\|fade:hole|\|wx:ground:\d)+$/;
function patchKey(m) {
  if (m.onBeforeCompile === M0.onBeforeCompile) return m.customProgramCacheKey === M0.customProgramCacheKey ? '' : null;
  try { const k = m.customProgramCacheKey === M0.customProgramCacheKey ? null : m.customProgramCacheKey(); return k && SAFE_PATCH.test(k) ? k : null; } catch { return null; }
}
const plain = (m) => m.onBeforeRender === M0.onBeforeRender && patchKey(m) !== null;

export function createPropMerge({ scene, characters }) {
  const cands = new Map();     // mesh -> { m: Float64Array(16), still }
  const movers = new WeakSet();
  const blinks = new WeakMap();
  const groups = [];           // { mesh, parts: [{ o, m: Float64Array, mat, ver, iver, geo }], chain: [Object3D] }
  const partOf = new WeakMap();
  let checkAt = 0, built = 0, undone = 0;
  const cost = { scan: 0, look: 0 }; // (the longest of each so far, ms: tests)

  function eligible(o) {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || o.frustumCulled === false) return false;
    if (o.matrixAutoUpdate === false || o.layers.mask === DEAD || o.userData.rigid || o.userData.propMerge || o.userData.fadeGhost !== undefined || o.userData.noMerge || o.morphTargetInfluences) return false;
    if (o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || o.onAfterRender !== THREE.Object3D.prototype.onAfterRender) return false;
    const mat = o.material;
    if (!mat || Array.isArray(mat) || mat.transparent || mat.allowOverride === false || !plain(mat) || /\+(fade|ghost)$/.test(mat.name || '')) return false;
    const g = o.geometry;
    if (!g || !g.attributes.position || !g.attributes.normal || g.morphAttributes.position || g.groups.length > 1) return false;
    if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
    if ((mat.map || mat.alphaMap || mat.lightMap || mat.aoMap || mat.emissiveMap || mat.normalMap || mat.bumpMap) && !g.attributes.uv) return false;
    if (mat.vertexColors && !g.attributes.color) return false;
    return true;
  }
  const effVisible = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const sameM = (a, e) => { for (let i = 0; i < 16; i++) if (a[i] !== e[i]) return false; return true; };

  // the feature an object belongs to: the top-level object under the scene (one level deeper under 'world')
  function featureOf(o) {
    let q = o, top = null;
    while (q && q.parent) { if (q.parent === scene) { top = q; break; } q = q.parent; }
    if (!top) return null;
    if (top.name === 'world') { let w = o; while (w.parent && w.parent !== top) w = w.parent; return w; }
    return top;
  }

  // The scene is listed every RESCAN seconds; the list is then looked through a slice a frame (no long frame on a phone).
  let pool = [], at = 0, scanAt = 0;
  // (a listing walks the scene a few hundred objects a frame: one walk of 6500 objects was a millisecond on a PC)
  let walkStack = null, nextPool = null, walkChars = null;
  function scan() {
    if (!walkStack) {
      walkChars = new Set();
      for (const r of characters()) if (r) walkChars.add(r);
      walkStack = [scene]; nextPool = [];
    }
    const isChar = o => { for (let p = o; p; p = p.parent) if (walkChars.has(p) || p.userData.crowd || p.name === 'shadow-proxies') return true; return false; };
    for (let k = 0; k < WALK && walkStack.length; k++) {
      const o = walkStack.pop();
      const ch = o.children;
      for (let i = 0; i < ch.length; i++) walkStack.push(ch[i]);
      if (!o.isMesh || partOf.has(o) || movers.has(o) || (blinks.get(o) || 0) > BLINKS || !eligible(o)) continue;
      if (!cands.has(o) && isChar(o)) { movers.add(o); continue; }
      nextPool.push(o);
    }
    if (walkStack.length) return false;
    pool = nextPool; walkStack = nextPool = walkChars = null;
    const inPool = new Set(pool);
    for (const o of cands.keys()) if (!inPool.has(o)) cands.delete(o);
    at = 0;
    return true;
  }
  function step(now) {
    const n = Math.min(pool.length, SLICE);
    for (let k = 0; k < n; k++) {
      if (at >= pool.length) at = 0;
      const o = pool[at++];
      if (partOf.has(o) || movers.has(o)) continue;
      let c = cands.get(o);
      if (!c) { cands.set(o, { m: Float64Array.from(o.matrixWorld.elements), since: now, moves: 0 }); continue; }
      if (!sameM(c.m, o.matrixWorld.elements)) { c.m.set(o.matrixWorld.elements); c.since = now; if (++c.moves > 3) { cands.delete(o); movers.add(o); } }
    }
  }
  function look(now) {
    // group the ones that stood still long enough (and show now); nothing to do while that set stays the same
    let changed = false;
    for (const [o, c] of cands) {
      const ready = now - c.since >= STILL && effVisible(o);
      if (ready !== c.ready) { c.ready = ready; changed = true; }
    }
    if (!changed) return;
    const by = new Map();
    for (const [o, c] of cands) {
      if (!c.ready) continue;
      if (c.keyAt !== c.since || c.cast !== o.castShadow || c.info?.mat !== o.material || c.info.receive !== o.receiveShadow || c.info.layers !== o.layers.mask) { // (worked out once per still spell: strings are not free)
        const f = featureOf(o);
        if (!f) continue;
        const g = o.geometry;
        const e = o.matrixWorld.elements;
        const cx = Math.floor(e[12] / CELL), cz = Math.floor(e[14] / CELL);
        const a = g.attributes, mat = o.material;
        // plain toon materials that differ only in colour share one mesh: the colour moves into the vertices
        const sig = tint(mat, a);
        c.key = [f.name ? f.id : 'loose', sig || mat.id, o.castShadow ? 1 : 0, o.receiveShadow ? 1 : 0, o.layers.mask, o.renderOrder, cx, cz, !sig && a.uv ? 1 : 0, sig ? 3 : a.color ? a.color.itemSize : 0].join('|');
        c.info = { f, mat, sig, cast: o.castShadow, receive: o.receiveShadow, layers: o.layers.mask, order: o.renderOrder, uv: !sig && !!a.uv, col: sig ? 3 : a.color ? a.color.itemSize : 0 };
        c.keyAt = c.since; c.cast = o.castShadow;
      }
      let l = by.get(c.key);
      if (!l) by.set(c.key, l = { ...c.info, parts: [] });
      l.parts.push(o);
    }
    queue.length = 0;
    for (const l of by.values()) if (l.parts.length >= MIN_PARTS) queue.push(l);
  }
  // one group merged a frame (a big one is a few milliseconds of copying); its parts checked again first
  const queue = [];
  function mergeNext(now) {
    while (queue.length) {
      const l = queue.shift();
      l.parts = l.parts.filter(o => { const c = cands.get(o); return c && c.ready && !partOf.has(o) && sameM(c.m, o.matrixWorld.elements) && effVisible(o) && (l.sig ? tint(o.material, o.geometry.attributes) === l.sig : o.material === l.mat); });
      if (l.parts.length >= MIN_PARTS) { merge(l); return; }
    }
  }

  // A toon material with no textures, drawn opaque: everything but its colour (and vertex colours) is its look, so
  // parts that agree on the rest can be one mesh with a white copy of the material and the colour in the vertices
  // (the toon shader multiplies the two: the same number). Returns that agreement as a key, or null.
  const tintMats = new Map();
  function tint(m, a) {
    if (!m.isMeshToonMaterial || m.map || m.alphaMap || m.lightMap || m.aoMap || m.emissiveMap || m.normalMap || m.bumpMap || m.displacementMap || m.alphaTest > 0 || m.opacity !== 1) return null;
    if (a.color && a.color.itemSize !== 3) return null;
    return ['t', patchKey(m), m.gradientMap ? m.gradientMap.id : 0, m.side, m.shadowSide, m.emissive.getHex(), m.emissiveIntensity, m.flatShading ? 1 : 0, m.fog ? 1 : 0, m.depthTest ? 1 : 0, m.depthWrite ? 1 : 0,
      m.polygonOffset ? m.polygonOffsetFactor + ',' + m.polygonOffsetUnits : 0, m.toneMapped ? 1 : 0, m.wireframe ? 1 : 0, m.colorWrite ? 1 : 0, m.dithering ? 1 : 0, m.blending].join(':');
  }
  function tintMat(l) {
    let w = tintMats.get(l.sig);
    if (!w) {
      w = l.mat.clone(); w.color.setRGB(1, 1, 1); w.vertexColors = true; w.name = (l.mat.name || 'toon') + '+props';
      if (l.mat.onBeforeCompile !== M0.onBeforeCompile) { w.onBeforeCompile = l.mat.onBeforeCompile; w.customProgramCacheKey = l.mat.customProgramCacheKey; } // (clone() drops them)
      tintMats.set(l.sig, w);
    }
    return w;
  }
  // one part's colours in the merged mesh: its vertex colours (or white) times its material's colour now
  function paint(col, q) {
    const C = q.geo.attributes.color, r = q.mat.color.r, g = q.mat.color.g, b = q.mat.color.b;
    for (let k = 0; k < q.n; k++) {
      const o = (q.v0 + k) * 3;
      if (C) { col[o] = C.getX(k) * r; col[o + 1] = C.getY(k) * g; col[o + 2] = C.getZ(k) * b; } else { col[o] = r; col[o + 1] = g; col[o + 2] = b; }
    }
    q.r = r; q.g = g; q.b = b;
  }

  const _n = new THREE.Matrix3(), _v = new THREE.Vector3();
  function merge(l) {
    let nv = 0, ni = 0;
    for (const p of l.parts) { const g = p.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = l.uv ? new Float32Array(nv * 2) : null, col = l.col ? new Float32Array(nv * l.col) : null;
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let v0 = 0, i0 = 0;
    for (const p of l.parts) {
      const g = p.geometry, P = g.attributes.position, N = g.attributes.normal, n = P.count, M = p.matrixWorld;
      _n.getNormalMatrix(M);
      for (let k = 0; k < n; k++) {
        const o = (v0 + k) * 3;
        _v.fromBufferAttribute(P, k).applyMatrix4(M); pos[o] = _v.x; pos[o + 1] = _v.y; pos[o + 2] = _v.z;
        _v.fromBufferAttribute(N, k).applyMatrix3(_n).normalize(); nrm[o] = _v.x; nrm[o + 1] = _v.y; nrm[o + 2] = _v.z;
      }
      if (uv) { const U = g.attributes.uv; for (let k = 0; k < n; k++) { uv[(v0 + k) * 2] = U.getX(k); uv[(v0 + k) * 2 + 1] = U.getY(k); } }
      if (col && l.sig) paint(col, { geo: g, mat: p.material, n, v0 });
      else if (col) { const C = g.attributes.color; for (let k = 0; k < n; k++) for (let c = 0; c < l.col; c++) col[(v0 + k) * l.col + c] = C.getComponent(k, c); }
      // a mirrored part (negative scale) winds the other way: flip its triangles so the faces three keeps are the same
      const flip = M.determinant() < 0;
      if (g.index) { const I = g.index; for (let k = 0; k < I.count; k += 3) { idx[i0 + k] = I.getX(k) + v0; idx[i0 + k + 1] = I.getX(flip ? k + 2 : k + 1) + v0; idx[i0 + k + 2] = I.getX(flip ? k + 1 : k + 2) + v0; } i0 += I.count; }
      else { for (let k = 0; k < n; k += 3) { idx[i0 + k] = v0 + k; idx[i0 + k + 1] = v0 + (flip ? k + 2 : k + 1); idx[i0 + k + 2] = v0 + (flip ? k + 1 : k + 2); } i0 += n; }
      v0 += n;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, l.col));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, l.sig ? tintMat(l) : l.mat);
    mesh.name = 'props ' + (l.f.name || l.f.type) + ' ' + (l.mat.name || l.mat.type);
    mesh.userData.propMerge = true;
    mesh.castShadow = l.cast; mesh.receiveShadow = l.receive; mesh.layers.mask = l.layers; mesh.renderOrder = l.order;
    scene.add(mesh);
    const chain = new Set();
    const rec = { mesh, parts: [], chain: null, sig: l.sig };
    let v1 = 0;
    for (const p of l.parts) {
      for (let q = p.parent; q && q !== scene; q = q.parent) chain.add(q);
      const g = p.geometry, n = g.attributes.position.count;
      const m = p.material;
      rec.parts.push({ o: p, m: Float64Array.from(p.matrixWorld.elements), mat: m, geo: g, ver: g.attributes.position.version, iver: g.index ? g.index.version : -1, cver: g.attributes.color ? g.attributes.color.version : -1, mver: m.version, layers: p.layers.mask, cast: p.castShadow,
        n, v0: v1, r: m.color.r, g: m.color.g, b: m.color.b, er: m.emissive?.r, eg: m.emissive?.g, eb: m.emissive?.b, ei: m.emissiveIntensity, sig: l.sig ? tint(m, g.attributes) : null });
      v1 += n;
      p.layers.mask = DEAD;
      partOf.set(p, rec);
      cands.delete(p);
    }
    rec.chain = [...chain];
    groups.push(rec);
    built++;
  }

  function unmerge(rec, why) {
    rec.mesh.parent?.remove(rec.mesh);
    rec.mesh.geometry.dispose();
    for (const q of rec.parts) {
      const o = q.o;
      if (o.layers.mask === DEAD) o.layers.mask = q.layers;
      partOf.delete(o);
      if (why === 'moved' && !sameM(q.m, o.matrixWorld.elements)) movers.add(o);
      else if (why === 'hidden') blinks.set(o, (blinks.get(o) || 0) + 1);
    }
    groups.splice(groups.indexOf(rec), 1);
    undone++;
  }

  // every frame, before anything draws: is every merged mesh still exactly its parts?
  function verify(rec) {
    for (const p of rec.chain) if (!p.visible || !p.parent) return 'hidden';
    for (const q of rec.parts) {
      const o = q.o, g = o.geometry;
      if (!o.parent || !o.visible) return 'hidden';
      if (o.material !== q.mat || q.mat.version !== q.mver || g !== q.geo || o.layers.mask !== DEAD || o.castShadow !== q.cast || q.mat.transparent || !q.mat.visible) return 'changed';
      if (g.attributes.position.version !== q.ver || (g.index ? g.index.version : -1) !== q.iver) return 'changed';
      if (!sameM(q.m, o.matrixWorld.elements)) return 'moved';
      if (rec.sig) {
        // a merged-by-colour part: its colour may change (daynight dims some shared materials): repaint its vertices
        // this frame; anything else about its material changing puts it back
        if ((g.attributes.color ? g.attributes.color.version : -1) !== q.cver) return 'changed';
        const c = q.mat.color;
        if (c.r !== q.r || c.g !== q.g || c.b !== q.b) {
          if (tint(q.mat, g.attributes) !== q.sig) return 'changed';
          const A = rec.mesh.geometry.attributes.color;
          paint(A.array, q);
          A.addUpdateRange(q.v0 * 3, q.n * 3); A.needsUpdate = true;
        }
        const e = q.mat.emissive;
        if (e.r !== q.er || e.g !== q.eg || e.b !== q.eb || q.mat.emissiveIntensity !== q.ei || q.mat.opacity !== 1) return 'changed';
      }
    }
    return null;
  }
  function frame() {
    if (!PERF.propMerge) { while (groups.length) unmerge(groups[groups.length - 1], 'off'); return; }
    for (let i = groups.length - 1; i >= 0; i--) { const why = verify(groups[i]); if (why) unmerge(groups[i], why); }
    const now = performance.now() / 1000;
    if (now > scanAt || walkStack) { const t = performance.now(); if (scan()) scanAt = now + RESCAN; cost.scan = Math.max(cost.scan, performance.now() - t); }
    step(now);
    mergeNext(now);
    if (now < checkAt) return;
    checkAt = now + CHECK;
    const t = performance.now(); look(now); cost.look = Math.max(cost.look, performance.now() - t);
  }
  frameHooks.push(frame);

  return perfApi.props = {
    api: {
      get groups() { return groups.length; }, get parts() { let n = 0; for (const g of groups) n += g.parts.length; return n; },
      get candidates() { return cands.size; }, cost, get built() { return built; }, get undone() { return undone; },
      list: () => groups.map(g => ({ name: g.mesh.name, parts: g.parts.length })),
      // (debugging) why the waiting ones wait: [feature, material, seconds still, showing]
      waiting: () => [...cands].map(([o, c]) => [featureOf(o)?.name || '?', o.material.name || o.material.type, +(performance.now() / 1000 - c.since).toFixed(1), effVisible(o), tint(o.material, o.geometry.attributes) ? 'tint' : 'own']),
      frame,
    },
  };
}
