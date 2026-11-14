// Characters in fewer draw calls. A person is ~27 meshes, a dog ~31, a unicorn ~66 (every mane lock is its own mesh), each
// a draw call in the colour pass, again in the ink pass's normals, and again in every shadow map it falls in. They're rigid
// parts on animated groups, so the parts that share a material are drawn as one skinned mesh whose "bones" are the parts
// themselves: every vertex follows its part's world matrix exactly, so the picture is the same (normals use the inverse
// transpose, exact under the heads' and bodies' non-uniform scales too).
//
//   The original parts stay where they are (code still turns, scales and hides them; held items and later additions
//   are untouched), they just stop drawing (layer mask 0). A hidden part (a closed mouth, a tongue in) collapses its bone
//   to nothing for that frame. Parts are merged per material, shadow flags, layer and draw order; transparent, double
//   sided, flat shaded, textured-by-group and unculled parts are left alone.
//   The merged mesh writes its own normals in the ink pass (allowOverride off, like the woods' crowns), so the creases
//   come from the same exact normals.
//   If a part is re-dressed (a new material that is not camera-fade's fading copy) or removed, the character is put
//   back as it was and merged again a moment later.
//
//   createRigidMerge({ scene, roots }) -> { update(), api }   roots() lists the character roots (main.js: npcs, remotes,
//   you, everybody with a name tag). update() once a frame before camera-fade.
import * as THREE from 'three';

const DEAD = 0;            // a merged-away part's layer mask: no camera draws it
const MIN_PARTS = 4;       // a group smaller than this is not worth a skinned mesh
const SETTLE = 1.2;        // seconds a character's part list must stay the same before it is merged
const SPECK = 0.065;       // (shadows.js) parts smaller than this cast no shadow
const BUDGET_MS = 4;       // merging per check (four checks a second)

const NP = { value: 0 };   // 1 during the ink pass's normal render
const SKIN_NORMAL = THREE.ShaderChunk.skinnormal_vertex.replace(
  'objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;',
  'objectNormal = transpose( inverse( mat3( skinMatrix ) ) ) * objectNormal;');

// the skinned twin of a part material: the same material, skinned exact normals, its own normals in the ink pass
const twins = new WeakMap(), pairs = [];
function twinOf(src) {
  let t = twins.get(src);
  if (t) return t;
  t = src.clone();
  t.name = (src.name || src.type) + '+rigid';
  const prev = src.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ? src.onBeforeCompile : null;
  const prevKey = src.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? src.customProgramCacheKey() : '';
  t.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(t, sh, r);
    sh.uniforms.uRigidNP = NP;
    sh.vertexShader = sh.vertexShader.replace('#include <skinnormal_vertex>', SKIN_NORMAL)
      .replace('#include <common>', '#include <common>\nattribute float inkMask;\nvarying float vInkMask;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vInkMask = inkMask;');
    // the normal written in the ink pass carries the person's ink mask in its alpha: 0 on a person (toon.js InkPass then inks only
    // their silhouette, no line where two of their parts meet), 1 on anything else merged (dogs, unicorns)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRigidNP;\nvarying float vInkMask;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  if (uRigidNP > 0.5) gl_FragColor = vec4(normalize(normal) * 0.5 + 0.5, vInkMask);');
  };
  t.customProgramCacheKey = () => prevKey + '|rigid2';
  t.allowOverride = false;
  t.onBeforeRender = (renderer, scene) => { NP.value = scene.overrideMaterial ? 1 : 0; };
  twins.set(src, t);
  pairs.push([src, t]);
  return t;
}
// a twin follows what changes on its source at run time (daynight dims and lights some shared materials)
function syncTwins() {
  for (const [s, t] of pairs) {
    if (!t.color.equals(s.color)) t.color.copy(s.color);
    if (!t.emissive.equals(s.emissive)) t.emissive.copy(s.emissive);
    t.emissiveIntensity = s.emissiveIntensity; t.opacity = s.opacity;
    if (t.visible !== s.visible) t.visible = s.visible;
  }
}
function mergeable(m) {
  if (!m.isMesh || (m.isSkinnedMesh && !m.userData.armSkin) || m.isInstancedMesh || m.frustumCulled === false || m.layers.mask === DEAD) return false;
  const mat = m.material;
  if (!mat || Array.isArray(mat) || !mat.isMeshToonMaterial) return false;
  if (mat.transparent || mat.side !== THREE.FrontSide || mat.flatShading || mat.alphaTest > 0 || mat.allowOverride === false) return false;
  if (/\+(fade|ghost)$/.test(mat.name || '')) return false;
  if (m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || m.userData.noMerge || m.userData.shared) return false;
  const g = m.geometry;
  if (!g || !g.attributes.position || !g.attributes.normal || g.morphAttributes.position) return false; // (groups do not matter with one material: three draws the whole range)
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
  return true;
}

export function createRigidMerge({ scene, roots }) {
  const merged = new Map();      // root -> { meshes: [SkinnedMesh], parts: [{ m, mat, layers }], stamp }
  const seen = new Map();        // root -> { n, since }  (waiting to settle)
  const _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4(), _sph = new THREE.Sphere(), _ws = new THREE.Vector3();
  let checkAt = 0, built = 0, undone = 0;

  const partsOf = root => { const l = []; root.traverse(o => { if (o.isMesh && o !== root && !o.userData.rigid) l.push(o); }); return l; };

  function merge(root) {
    const all = partsOf(root);
    const groups = new Map();
    root.updateMatrixWorld(true);
    for (const m of all) {
      if (!mergeable(m)) continue;
      // (shadows.js would turn a speck's shadow off later; do it first, so the groups do not change afterwards)
      const gg = m.geometry; if (!gg.boundingSphere) gg.computeBoundingSphere();
      if (m.castShadow && gg.boundingSphere.radius * Math.abs(m.getWorldScale(_ws).x) < SPECK) m.castShadow = false;
      const mat = m.material;
      const key = [mat.id, m.castShadow ? 1 : 0, m.receiveShadow ? 1 : 0, m.layers.mask, m.renderOrder].join('|');
      let g = groups.get(key);
      if (!g) groups.set(key, g = { mat, cast: m.castShadow, receive: m.receiveShadow, layers: m.layers.mask, order: m.renderOrder, parts: [] });
      g.parts.push(m);
    }
    const rec = { meshes: [], parts: [] };
    _inv.copy(root.matrixWorld).invert();
    for (const g of groups.values()) {
      if (g.parts.length < MIN_PARTS) continue;
      const mat = g.mat, useUv = !!(mat.map || mat.alphaMap || mat.lightMap || mat.aoMap || mat.emissiveMap), useCol = !!mat.vertexColors;
      if (useCol && g.parts.some(p => !p.geometry.attributes.color)) continue;
      let nv = 0, ni = 0;
      for (const p of g.parts) { const pg = p.geometry; nv += pg.attributes.position.count; ni += pg.index ? pg.index.count : pg.attributes.position.count; }
      const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = useUv ? new Float32Array(nv * 2) : null;
      const colSize = useCol ? g.parts[0].geometry.attributes.color.itemSize : 0;
      if (useCol && g.parts.some(p => p.geometry.attributes.color.itemSize !== colSize)) continue;
      const col = useCol ? new Float32Array(nv * colSize) : null;
      const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
      // a part may carry bones of its own (the one-piece arm: a skinned mesh whose bones are plain Object3Ds mapping its rest
      // coordinates to the world): its bones join the list and its vertices keep their weights. Any other part is one bone, itself
      const bones = [];
      const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let v0 = 0, i0 = 0;
      const bounds = new THREE.Sphere(); let first = true;
      g.parts.forEach(p => {
        const pg = p.geometry, P = pg.attributes.position, N = pg.attributes.normal, n = P.count, own = p.isSkinnedMesh ? p.skeleton.bones : null, bone = bones.length;
        if (own) bones.push(...own); else bones.push(p);
        const SI = own && pg.attributes.skinIndex, SW = own && pg.attributes.skinWeight;
        for (let k = 0; k < n; k++) {
          const o = (v0 + k) * 3;
          pos[o] = P.getX(k); pos[o + 1] = P.getY(k); pos[o + 2] = P.getZ(k);
          nrm[o] = N.getX(k); nrm[o + 1] = N.getY(k); nrm[o + 2] = N.getZ(k);
          if (own) for (let c = 0; c < 4; c++) { si[(v0 + k) * 4 + c] = bone + SI.getComponent(k, c); sw[(v0 + k) * 4 + c] = SW.getComponent(k, c); }
          else { si[(v0 + k) * 4] = bone; sw[(v0 + k) * 4] = 1; }
        }
        if (uv) { const U = pg.attributes.uv; if (U) for (let k = 0; k < n; k++) { uv[(v0 + k) * 2] = U.getX(k); uv[(v0 + k) * 2 + 1] = U.getY(k); } }
        if (col) { const C = pg.attributes.color; for (let k = 0; k < n; k++) for (let c = 0; c < colSize; c++) col[(v0 + k) * colSize + c] = C.getComponent(k, c); }
        if (pg.index) { const I = pg.index; for (let k = 0; k < I.count; k++) idx[i0 + k] = I.getX(k) + v0; i0 += I.count; }
        else { for (let k = 0; k < n; k++) idx[i0 + k] = v0 + k; i0 += n; }
        v0 += n;
        // bounds in the root's frame (for culling: the skinned mesh sits at the root)
        _rel.multiplyMatrices(_inv, p.matrixWorld);
        _sph.copy(pg.boundingSphere).applyMatrix4(_rel);
        if (first) { bounds.copy(_sph); first = false; } else bounds.union(_sph);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, colSize));
      geo.setAttribute('inkMask', new THREE.BufferAttribute(new Float32Array(nv).fill(root.userData.inkSolid ? 0 : 1), 1)); // (a person is inked as one solid)
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      const sm = new THREE.SkinnedMesh(geo, twinOf(mat));
      sm.name = 'rigid ' + (mat.name || mat.type);
      sm.userData.rigid = true;
      sm.castShadow = g.cast; sm.receiveShadow = g.receive; sm.layers.mask = g.layers; sm.renderOrder = g.order;
      const inverses = bones.map(() => new THREE.Matrix4());
      const sk = new THREE.Skeleton(bones, inverses);
      // the bones are the parts' own world matrices (bind and inverses are identity); a hidden part draws nothing
      sk.update = function () {
        const bm = this.boneMatrices;
        for (let i = 0; i < bones.length; i++) {
          let vis = true;
          for (let o = bones[i]; o && o !== root; o = o.parent) if (!o.visible) { vis = false; break; }
          bm.set(bones[i].matrixWorld.elements, i * 16);
          if (!vis) { const o = i * 16; bm.fill(0, o, o + 3); bm.fill(0, o + 4, o + 7); bm.fill(0, o + 8, o + 11); } // (to a point where it is, w kept: a zero matrix would put its vertices at w 0, which can streak)
        }
        if (this.boneTexture) this.boneTexture.needsUpdate = true;
      };
      sm.bind(sk, new THREE.Matrix4());
      bounds.radius += 0.6; // (poses move the parts about the root)
      sm.boundingSphere = bounds;
      sm.boundingBox = new THREE.Box3().setFromCenterAndSize(bounds.center, _ws.setScalar(bounds.radius * 2));
      root.add(sm);
      rec.meshes.push(sm);
      for (const p of g.parts) { rec.parts.push({ m: p, mat: p.material, layers: p.layers.mask }); p.layers.mask = DEAD; }
    }
    merged.set(root, rec);
    built++;
  }
  function unmerge(root) {
    const rec = merged.get(root);
    if (!rec) return;
    for (const sm of rec.meshes) { sm.parent?.remove(sm); sm.geometry.dispose(); sm.skeleton.dispose(); }
    for (const p of rec.parts) if (p.m.layers.mask === DEAD) p.m.layers.mask = p.layers;
    merged.delete(root);
    undone++;
  }
  // a part re-dressed (not camera-fade's fading copy) or taken off: put the character back, merge again later
  let tickN = 0;
  function changed(rec, root, deep) {
    for (const p of rec.parts) {
      const m = p.m;
      if (m.parent === null) return true;
      if (m.material !== p.mat && !/\+fade$/.test(m.material?.name || '')) return true;
      if (!deep) continue;
      let o = m; // (moved to another body: looked for twice a second, it is the slow check)
      while (o && o !== root) o = o.parent;
      if (!o) return true;
    }
    return false;
  }

  function update() {
    const now = performance.now() / 1000;
    syncTwins();
    const deep = (tickN++ % 30) === 0;
    for (const [root, rec] of merged) {
      if (!root.parent || changed(rec, root, deep)) { unmerge(root); seen.delete(root); }
    }
    if (now < checkAt) return;
    checkAt = now + 0.25;
    // new characters a check, within a few milliseconds
    const t0 = performance.now();
    let did = false;
    for (const root of roots()) {
      if (!root || merged.has(root) || !root.parent) continue;
      const n = partsOf(root).length;
      if (n < MIN_PARTS) continue;
      const s = seen.get(root);
      if (!s || s.n !== n) { seen.set(root, { n, since: now }); continue; }
      if (did || now - s.since < SETTLE || (root.userData.fadeK ?? 1) < 1) continue; // (not while camera-fade has it)
      merge(root); seen.delete(root);
      if (performance.now() - t0 > BUDGET_MS) did = true;
    }
  }

  return {
    update,
    api: {
      get characters() { return merged.size; }, get built() { return built; }, get undone() { return undone; },
      get meshes() { let n = 0; for (const r of merged.values()) n += r.meshes.length; return n; },
      get parts() { let n = 0; for (const r of merged.values()) n += r.parts.length; return n; },
      merged, unmerge, merge, roots, // (roots: prop-merge.js leaves the characters to us)
    },
  };
}
