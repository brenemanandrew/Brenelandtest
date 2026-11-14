// The switches for the performance cuts, all on. They exist so tools/perf2-check.mjs can draw the same frame with a cut on and
// off and compare the pixels (the proof that each changes nothing you can see). Nothing in the game turns them off.
//
//   visibleMatrices  world matrices are brought up to date only down visible branches (InkPass.render). A hidden branch is
//                    marked stale when its parent moved and caught up the frame it shows again. obj.updateMatrixWorld()
//                    and getWorldPosition() work as always, so code that reads a hidden object's place still gets a fresh one.
//   fogInNormals     the ink pass's normal render keeps the scene's fog, so the few materials that draw their own normals
//                    (the woods' crowns, merged characters) don't switch shader program twice a frame.
//   boundedSkins     shadows.js: an unculled skinned neck, tail or collar (the dogs, the unicorns) still has bounds, so those
//                    characters get culled from the shadow maps and the view like anything else.
//   depthVariants    shadows: each kind of caster (skinned, instanced, textured, double sided...) gets its own depth
//                    material, so the shadow passes stop switching three's one depth material between programs.
//   groupMerge       a mesh whose faces are split between materials (a box with a printed top) is drawn once per material
//                    instead of once per face. The faces are reordered in a copy of its geometry (a shared one is left alone).
//   propMerge        a loose prop that has stood still a few seconds is drawn inside one mesh per material, feature and
//                    cell (prop-merge.js), and put back the moment it moves, hides or changes.
import * as THREE from 'three';

export const PERF = { visibleMatrices: true, fogInNormals: true, boundedSkins: true, depthVariants: true, groupMerge: true, propMerge: true, solidInk: true, occlusion: true, bakedCharacters: true }; // (bakedCharacters: mpfb-in-game, baked-character.js: the MPFB characters play their own Blender clips; off (or ?baked=off) gives their code-built looks) // (occlusion: perf-pass-3, occlusion.js: what is hidden behind the opaque world is left out of the colour and ink passes) // (solidInk: a merged person inked only round its silhouette; perf-merge-check turns it off to compare pictures)
// run once a frame by InkPass.render, after the world matrices and before anything draws (prop-merge.js checks its parts)
export const frameHooks = [];
// the pass's objects, for tests and the console (breneland has no slot for them): { props }
export const perfApi = {};

// The far lawn. A lawn whose things move (the unicorns' in the woods corner: five unicorns, the Party Kid, 26 sparkles) is in
// view of Mama Carol's booth, Maple Row and the store's street behind the woods and houses, and cost those cameras 200 to 290
// draw calls a frame. Past FAR_LAWN.hide m from the camera its moving things aren't drawn or animated (the table, plaza,
// rainbow, balloons, name board and bunting stay). They're back inside FAR_LAWN.show m (two radii, so no flicker on the line).
// Not in PERF: this one does change the picture (a unicorn 70 m off through a gap in the trees), so perf2-check's same-frame
// proof doesn't apply. LOD.farLawn = false turns it off (tests, the console).
export const LOD = { farLawn: true };
export const FAR_LAWN = { hide: 66, show: 62 };
export const view = { camera: null, indoorCull: 0, indoorSees: null }; // main.js: the game camera. indoorCull: game-store-cull.js sets it to 2 each frame it is on, with indoorSees(sphere) (the woods weigh their cells by it)
// Is the lawn at (x, z) far from the camera this frame? rec (the lawn's own object) keeps the answer for the two radii.
export function farLawn(rec, x, z) {
  const c = view.camera;
  if (!c || !LOD.farLawn) return (rec.far = false);
  const d = Math.hypot(c.position.x - x, c.position.z - z);
  return (rec.far = rec.far ? d > FAR_LAWN.show : d > FAR_LAWN.hide);
}

const BASE = THREE.Object3D.prototype.updateMatrixWorld;
const STALE = Symbol('staleMatrix');

// Object3D.updateMatrixWorld(force) as three r186 does it, except that a hidden child is not walked (marked stale if its
// parent's world matrix changed, then forced when it shows again). A class with its own updateMatrixWorld (a camera,
// a skinned mesh, an audio listener) is handed to it whole, as three would.
function walk(o, force) {
  if (o.updateMatrixWorld !== BASE) { o.updateMatrixWorld(force); return; }
  if (o.matrixAutoUpdate) o.updateMatrix();
  if (o.matrixWorldNeedsUpdate || force) {
    if (o.matrixWorldAutoUpdate === true) {
      if (o.parent === null) o.matrixWorld.copy(o.matrix);
      else o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
    }
    o.matrixWorldNeedsUpdate = false;
    force = true;
  }
  const ch = o.children;
  for (let i = 0, n = ch.length; i < n; i++) {
    const c = ch[i];
    if (c.visible === false) { if (force) c[STALE] = true; continue; }
    if (c[STALE] === true) { c[STALE] = false; walk(c, true); } else walk(c, force);
  }
}

export function updateSceneMatrices(scene) {
  if (!PERF.visibleMatrices) { scene.updateMatrixWorld(); return; }
  if (scene[STALE] === true) { scene[STALE] = false; walk(scene, true); } else walk(scene, false);
}

// ---- groupMerge
const merged = [];  // { mesh, geo, mat } the originals, to put back (perf2-check draws the frame both ways)
export function mergeGroups(o, users) {
  if (!PERF.groupMerge || !o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !Array.isArray(o.material) || o.userData.groupMerged) return false;
  const g = o.geometry, mats = o.material;
  if (!g.index || !g.groups.length || users > 1 || g.morphAttributes.position || mats.some(m => !m || m.transparent)) return false;
  const uniq = [...new Set(g.groups.map(gr => mats[gr.materialIndex]).filter(Boolean))];
  if (uniq.length >= g.groups.length) return false;
  const src = g.index.array, out = new (src.constructor)(src.length);
  const geo = g.clone();
  geo.clearGroups();
  let at = 0;
  uniq.forEach((m, k) => {
    const start = at;
    for (const gr of g.groups) {
      if (mats[gr.materialIndex] !== m) continue;
      const end = Math.min(gr.start + gr.count, src.length);
      for (let i = gr.start; i < end; i++) out[at++] = src[i];
    }
    geo.addGroup(start, at - start, k);
  });
  geo.setIndex(new THREE.BufferAttribute(out.subarray(0, at), 1));
  geo.boundingSphere = g.boundingSphere; geo.boundingBox = g.boundingBox;
  merged.push({ mesh: o, geo: g, mat: mats, newGeo: geo, newMat: uniq });
  o.geometry = geo; o.material = uniq; o.userData.groupMerged = true;
  return true;
}
// put every merged mesh back as it was (off) or merged again (on)
export function applyGroupMerge(on) {
  for (const r of merged) { r.mesh.geometry = on ? r.newGeo : r.geo; r.mesh.material = on ? r.newMat : r.mat; }
}
