// Sculpt (pose-draw, Andrew 2026-11-10: "Also a sculpting tool"): storyboard acting on the chosen person's mesh, kept with the shot.
// Brushes: grab, inflate (push/pull), smooth, pinch, squash and stretch (scale along the stroke), face (a grab on the head only, for
// exaggerated cheeks, brows and mouth corners) and reset. Radius in screen pixels (two-finger pinch, [ and ]), strength from the pen's
// pressure, a falloff, and mirror (left-right symmetry in the person's own frame) on by default.
//
// The result is offsets per vertex in each mesh's own frame, the rest frame for a skinned mesh (a morph: the skin carries it, so the
// pose still works over it): human.js's parts (their geometry is the person's own; rigid-merge.js's merged copy is kept in step), and
// the MPFB characters' skinned meshes (their shared geometry is copied for this person first). Nothing in the game's models changes.
//
//   createSculpt(env) -> { begin(c, x, y, pressure) -> bool, move(x, y, pressure), end(), clear(c), toJSON(c), load(c, j), brush }
//   env = { camera, rayAt(x, y) -> Ray, view() -> { w, h } }
import * as THREE from 'three';

export const BRUSHES = [['grab', 'Grab'], ['inflate', 'Push / pull'], ['smooth', 'Smooth'], ['pinch', 'Pinch'], ['stretch', 'Squash and stretch'], ['face', 'Face'], ['reset', 'Reset']];
export const FALLOFFS = [['smooth', 'Soft'], ['sharp', 'Sharp'], ['flat', 'Flat']];
const fall = { smooth: t => (1 - t * t) * (1 - t * t), sharp: t => (1 - t) * (1 - t) * (1 - t), flat: t => (t < 0.8 ? 1 : (1 - t) / 0.2) };

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m3 = new THREE.Matrix3(), _m4 = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion();

// ---------------------------------------------------------------- the meshes a body can be sculpted on
// human.js: every toon mesh it was built with that it owns (not the hands, whose shapes are swapped, nor anything held). MPFB: the
// skinned meshes' groups (the base, the face, the mouth: one numbering of vertices). Keys are stable for the same look.
// tag a human.js body's meshes as built (call once, as it is made: meshes added later, a posed hand, a held thing, are never keyed)
export function tagSculpt(body) {
  if (body.kind !== 'human' || body._tagged) return;
  body._tagged = true;
  let i = 0;
  const walk = (o, inHand) => {
    const hand = inHand || o.userData.wrist === true;
    if (o.isMesh && !o.userData.rigid) {
      const ok = !hand && !o.userData.shared && o.geometry?.attributes.position && o.material && !Array.isArray(o.material) && o.material.isMeshToonMaterial;
      if (ok) o.userData.sculptKey = 'h' + i;
      i++;
    }
    for (const ch of o.children) walk(ch, hand);
  };
  walk(body.root, false);
}
function targets(body) {
  if (body._sculpt) return body._sculpt;
  const list = [];
  if (body.kind === 'human') {
    tagSculpt(body);
    body.root.traverse(o => { if (o.isMesh && o.userData.sculptKey) list.push({ key: o.userData.sculptKey, mesh: o }); });
  } else if (body.kind === 'skinned' && body.model.meshes) {
    for (const [grp, m] of Object.entries(body.model.meshes)) list.push({ key: 'g' + (grp || 'base'), mesh: m, shared: true });
  }
  body._sculpt = list;
  return list;
}
// a record per mesh once touched: its own geometry, the positions and normals before any sculpt, the offsets
function recOf(body, t) {
  if (t.rec) return t.rec;
  const m = t.mesh;
  if (t.shared) { m.geometry = m.geometry.clone(); } // (an MPFB character's geometry is shared by every copy: this person gets their own)
  const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, n = P.count;
  t.rec = { mesh: m, n, base: Float32Array.from(P.array), baseN: N ? Float32Array.from(N.array) : null, off: new Float32Array(n * 3), adj: null, weld: null };
  // MPFB: the other groups share the vertex numbering; they follow the base mesh (the face and mouth groups)
  return t.rec;
}
// world position of vertex i
function worldPos(m, i, out) {
  if (m.isSkinnedMesh) return m.getVertexPosition(i, out).applyMatrix4(m.matrixWorld);
  return out.fromBufferAttribute(m.geometry.attributes.position, i).applyMatrix4(m.matrixWorld);
}
// the world -> mesh-frame matrix for a vertex (3x3; for a skinned mesh the blend of its bones at that vertex: linear, so exact)
const _o = new THREE.Vector3(), _ex = new THREE.Vector3();
function toLocal(m, i, out) {
  if (!m.isSkinnedMesh) return out.setFromMatrix4(_m4.copy(m.matrixWorld)).invert();
  m.applyBoneTransform(i, _o.set(0, 0, 0)).applyMatrix4(m.matrixWorld);
  const cols = [];
  for (const ax of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) { m.applyBoneTransform(i, _ex.set(ax[0], ax[1], ax[2])).applyMatrix4(m.matrixWorld).sub(_o); cols.push(_ex.clone()); }
  _m4.makeBasis(cols[0], cols[1], cols[2]);
  out.setFromMatrix4(_m4);
  return out.determinant() !== 0 ? out.invert() : out.identity();
}
// welded neighbours (vertices at the same place count as one): for smoothing and the normals
function weldOf(rec) {
  if (rec.weld) return rec.weld;
  const g = rec.mesh.geometry, P = rec.base, n = rec.n, map = new Map(), id = new Int32Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) { const key = Math.round(P[i * 3] * 1e4) + ',' + Math.round(P[i * 3 + 1] * 1e4) + ',' + Math.round(P[i * 3 + 2] * 1e4); let w = map.get(key); if (w === undefined) { w = k++; map.set(key, w); } id[i] = w; }
  const verts = Array.from({ length: k }, () => []), tris = Array.from({ length: k }, () => []), nb = Array.from({ length: k }, () => new Set());
  for (let i = 0; i < n; i++) verts[id[i]].push(i);
  const I = g.index ? g.index.array : null, nt = (I ? I.length : n) / 3;
  for (let t = 0; t < nt; t++) {
    const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2;
    for (const [x, y, z] of [[a, b, c], [b, c, a], [c, a, b]]) { tris[id[x]].push(t); nb[id[x]].add(id[y]); nb[id[x]].add(id[z]); }
  }
  return (rec.weld = { id, verts, tris, nb: nb.map(s => [...s]), I });
}
// write positions (base + offset) and fresh normals for the touched vertices; keep rigid-merge's merged copy in step
function write(body, rec, touched) {
  const g = rec.mesh.geometry, P = g.attributes.position, N = g.attributes.normal, A = P.array, B = rec.base, O = rec.off;
  for (const i of touched) { A[i * 3] = B[i * 3] + O[i * 3]; A[i * 3 + 1] = B[i * 3 + 1] + O[i * 3 + 1]; A[i * 3 + 2] = B[i * 3 + 2] + O[i * 3 + 2]; }
  P.needsUpdate = true;
  if (N && rec.baseN) {
    const W = weldOf(rec), ws = new Set(); for (const i of touched) ws.add(W.id[i]);
    // (and their neighbours: a moved vertex tilts the faces round it)
    for (const w of [...ws]) for (const x of W.nb[w]) ws.add(x);
    const NA = N.array, I = W.I;
    for (const w of ws) {
      const vs = W.verts[w];
      let moved = false; for (const i of vs) if (O[i * 3] || O[i * 3 + 1] || O[i * 3 + 2]) { moved = true; break; }
      if (!moved && !W.nb[w].some(x => W.verts[x].some(i => O[i * 3] || O[i * 3 + 1] || O[i * 3 + 2]))) { for (const i of vs) { NA[i * 3] = rec.baseN[i * 3]; NA[i * 3 + 1] = rec.baseN[i * 3 + 1]; NA[i * 3 + 2] = rec.baseN[i * 3 + 2]; } continue; }
      // the surface's turn there (its faces' normal now against before the sculpt) laid on the vertex's own normal: the body's smooth
      // shading kept, bent only as much as the surface was
      const faceN = (src, out) => { out.set(0, 0, 0); for (const t of W.tris[w]) { const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2; _a.fromArray(src, b * 3).sub(_v.fromArray(src, a * 3)); _b.fromArray(src, c * 3).sub(_v); out.add(_a.cross(_b)); } return out; };
      faceN(A, _c); faceN(B, _w);
      if (_c.lengthSq() < 1e-16 || _w.lengthSq() < 1e-16) continue;
      _q.setFromUnitVectors(_w.normalize(), _c.normalize());
      for (const i of vs) { _a.fromArray(rec.baseN, i * 3).applyQuaternion(_q); NA[i * 3] = _a.x; NA[i * 3 + 1] = _a.y; NA[i * 3 + 2] = _a.z; }
    }
    N.needsUpdate = true;
  }
  // MPFB: the face and mouth groups are their own copies of the same vertices
  if (body.kind === 'skinned') for (const t of targets(body)) if (t.mesh !== rec.mesh && t.mesh.geometry.attributes.position.count === rec.n) {
    if (t.shared && !t.copied) { t.mesh.geometry = t.mesh.geometry.clone(); t.copied = true; }
    const g2 = t.mesh.geometry; g2.attributes.position.array.set(A); g2.attributes.position.needsUpdate = true;
    if (N && g2.attributes.normal) { g2.attributes.normal.array.set(N.array); g2.attributes.normal.needsUpdate = true; }
  }
  syncMerged(body, rec);
}
// rigid-merge.js draws a person's parts as one skinned mesh per material, each part's vertices copied in a run: find this part's run
const runs = new WeakMap();
function syncMerged(body, rec) {
  if (body.kind !== 'human') return;
  for (const sm of body.root.children) {
    if (!sm.userData.rigid || !sm.skeleton) continue;
    let map = runs.get(sm);
    if (!map) {
      map = new Map(); runs.set(sm, map);
      const bones = sm.skeleton.bones, arms = [];
      body.root.traverse(o => { if (o.isSkinnedMesh && o.userData.armSkin) arms.push(o); });
      let v0 = 0;
      for (let i = 0; i < bones.length;) {
        const b = bones[i];
        if (b.isMesh && !b.isSkinnedMesh) { map.set(b, v0); v0 += b.geometry.attributes.position.count; i++; continue; }
        const arm = arms.find(a => a.skeleton.bones[0] === b);
        if (!arm) { i++; continue; }
        map.set(arm, v0); v0 += arm.geometry.attributes.position.count; i += arm.skeleton.bones.length;
      }
    }
    const v0 = map.get(rec.mesh);
    if (v0 === undefined) continue;
    const g = rec.mesh.geometry, P = sm.geometry.attributes.position, N = sm.geometry.attributes.normal;
    P.array.set(g.attributes.position.array, v0 * 3); P.needsUpdate = true;
    if (N && g.attributes.normal) { N.array.set(g.attributes.normal.array, v0 * 3); N.needsUpdate = true; }
  }
}

export function createSculpt(env) {
  const brush = { kind: 'grab', px: 70, strength: 0.6, falloff: 'smooth', mirror: true, invert: false };
  const ray = new THREE.Raycaster();
  let S = null; // the stroke in progress
  // where the pointer meets the person (their sculptable meshes, as drawn)
  function hitOn(c, x, y) {
    ray.ray.copy(env.rayAt(x, y)); ray.camera = env.camera;
    const out = [];
    for (const t of targets(c.body)) { const m = t.mesh; if (!visibleUp(m)) continue; try { m.raycast(ray, out); } catch { /* skip */ } }
    out.sort((a, b) => a.distance - b.distance);
    return out[0] || null;
  }
  const visibleUp = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  // the brush's radius in the world at a point (from its size on screen)
  const worldR = p => { const cam = env.camera, d = cam.position.distanceTo(p); return brush.px * d * 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / env.view().h; };
  // every vertex within R of a point: [{ t, i, w, world }]
  function gather(c, p, R, headOnly) {
    const out = [], head = headOnly ? headCentre(c) : null;
    for (const t of targets(c.body)) {
      const m = t.mesh; if (!visibleUp(m)) continue;
      if (c.body.kind === 'skinned' && t.key !== 'gbase') continue; // (the face and mouth follow the base)
      const n = m.geometry.attributes.position.count;
      m.updateWorldMatrix(true, false);
      for (let i = 0; i < n; i++) {
        worldPos(m, i, _v);
        const d = _v.distanceTo(p);
        if (d >= R) continue;
        if (head && _v.distanceTo(head.at) > head.r) continue;
        out.push({ t, i, w: fall[brush.falloff](d / R), world: _v.clone() });
      }
    }
    return out;
  }
  function headCentre(c) {
    const b = c.body, s = b.scale || 1;
    if (b.h) return { at: b.h.headC.getWorldPosition(new THREE.Vector3()), r: 0.34 * s * (b.h.opts?.headSize || 1) };
    const hd = b.jointObject('head'); return { at: hd.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1 * s, 0)), r: 0.16 * s };
  }
  // the person's own frame (mirror is x -> -x there)
  const mirrorPt = (c, p) => { const inv = _m4.copy(c.body.root.matrixWorld).invert(); const l = p.clone().applyMatrix4(inv); l.x = -l.x; return l.applyMatrix4(c.body.root.matrixWorld); };
  const mirrorDir = (c, d) => { const q = c.body.root.getWorldQuaternion(new THREE.Quaternion()), l = d.clone().applyQuaternion(q.clone().invert()); l.x = -l.x; return l.applyQuaternion(q); };

  function begin(c, x, y, pressure = 1) {
    if (!c || c.body.kind === 'dog') return false;
    c.body.root.updateWorldMatrix(true, true);
    const h = hitOn(c, x, y);
    if (!h) return false;
    const R = worldR(h.point), k = brush.strength * (pressure > 0 ? pressure * 1.4 : 1);
    S = { c, R, k, x0: x, y0: y, p0: h.point.clone(), n0: (h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 0, 1)), last: h.point.clone(), sets: [], touched: new Map() };
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(env.camera.getWorldDirection(new THREE.Vector3()).negate(), h.point);
    S.plane = plane;
    const relative = brush.kind === 'grab' || brush.kind === 'face' || brush.kind === 'stretch';
    if (relative) {
      const centres = [h.point.clone()]; if (brush.mirror) { const m = mirrorPt(c, h.point); if (m.distanceTo(h.point) > R * 0.25) centres.push(m); }
      centres.forEach((p, mi) => {
        const set = gather(c, p, brush.kind === 'face' ? R * 0.8 : R, brush.kind === 'face').map(v => {
          const rec = recOf(c.body, v.t), M = toLocal(rec.mesh, v.i, new THREE.Matrix3());
          return { ...v, rec, M, o0: [rec.off[v.i * 3], rec.off[v.i * 3 + 1], rec.off[v.i * 3 + 2]] };
        });
        S.sets.push({ centre: p, mirror: mi === 1, verts: set });
      });
    }
    dab(x, y, pressure, true);
    return true;
  }
  const pt = (x, y) => { const h = new THREE.Vector3(); return env.rayAt(x, y).intersectPlane(S.plane, h) ? h : null; };
  function dab(x, y, pressure, first = false) {
    if (!S) return;
    const c = S.c, kind = brush.kind, k = S.k * (pressure > 0 && pressure !== 1 ? 0.6 + pressure * 0.6 : 1);
    if (kind === 'grab' || kind === 'face' || kind === 'stretch') {
      const p = pt(x, y); if (!p) return;
      const g = p.clone().sub(S.p0);
      for (const set of S.sets) {
        const gg = set.mirror ? mirrorDir(c, g) : g;
        for (const v of set.verts) {
          let d;
          if (kind === 'stretch') {
            const L = gg.length(); if (L < 1e-5) { d = _w.set(0, 0, 0); } else {
              const dir = gg.clone().normalize(), s = brush.invert ? 1 / (1 + (L / S.R) * 1.5 * k) : 1 + (L / S.R) * 1.5 * k;
              const rel = v.world.clone().sub(set.centre), al = rel.dot(dir), perp = rel.clone().addScaledVector(dir, -al);
              const nr = dir.multiplyScalar(al * s).add(perp.multiplyScalar(1 / Math.sqrt(s)));
              d = nr.sub(rel).multiplyScalar(v.w);
            }
          } else d = _w.copy(gg).multiplyScalar(v.w * Math.min(1, k * 1.6));
          const l = d.clone().applyMatrix3(v.M), O = v.rec.off, i = v.i;
          O[i * 3] = v.o0[0] + l.x; O[i * 3 + 1] = v.o0[1] + l.y; O[i * 3 + 2] = v.o0[2] + l.z;
          touch(v.rec, i);
        }
      }
    } else {
      // the incremental brushes: where the pointer meets the person now
      const h = hitOn(c, x, y); if (!h) return;
      if (!first && h.point.distanceTo(S.last) < S.R * 0.12) return;
      S.last.copy(h.point);
      const centres = [[h.point, h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : S.n0]];
      if (brush.mirror) { const m = mirrorPt(c, h.point); if (m.distanceTo(h.point) > S.R * 0.25) centres.push([m, mirrorDir(c, centres[0][1])]); }
      for (const [p, nrm] of centres) {
        const set = gather(c, p, S.R, false);
        for (const v of set) {
          const rec = recOf(c.body, v.t), O = rec.off, i = v.i, w = v.w * k;
          let d = null;
          if (kind === 'inflate') {
            const N = rec.mesh.geometry.attributes.normal;
            const n = N ? _a.fromBufferAttribute(N, i) : nrm.clone();
            if (N) { if (rec.mesh.isSkinnedMesh) n.copy(nrm); else n.transformDirection(rec.mesh.matrixWorld); }
            d = n.multiplyScalar((brush.invert ? -1 : 1) * S.R * 0.06 * w);
          } else if (kind === 'pinch') {
            const to = p.clone().sub(v.world); to.addScaledVector(nrm, -to.dot(nrm));
            d = to.multiplyScalar(0.12 * w * (brush.invert ? -1 : 1));
          } else if (kind === 'smooth') {
            const W = weldOf(rec), nb = W.nb[W.id[i]]; if (!nb.length) continue;
            const A = rec.mesh.geometry.attributes.position.array; _b.set(0, 0, 0);
            for (const x2 of nb) { const j = W.verts[x2][0]; _b.x += A[j * 3]; _b.y += A[j * 3 + 1]; _b.z += A[j * 3 + 2]; }
            _b.multiplyScalar(1 / nb.length);
            O[i * 3] += (_b.x - A[i * 3]) * 0.5 * w; O[i * 3 + 1] += (_b.y - A[i * 3 + 1]) * 0.5 * w; O[i * 3 + 2] += (_b.z - A[i * 3 + 2]) * 0.5 * w;
            touch(rec, i); continue;
          } else if (kind === 'reset') {
            const f = Math.max(0, 1 - 0.5 * w); O[i * 3] *= f; O[i * 3 + 1] *= f; O[i * 3 + 2] *= f;
            if (Math.abs(O[i * 3]) + Math.abs(O[i * 3 + 1]) + Math.abs(O[i * 3 + 2]) < 2e-5) O[i * 3] = O[i * 3 + 1] = O[i * 3 + 2] = 0;
            touch(rec, i); continue;
          }
          if (!d) continue;
          const l = d.applyMatrix3(toLocal(rec.mesh, i, _m3));
          O[i * 3] += l.x; O[i * 3 + 1] += l.y; O[i * 3 + 2] += l.z;
          touch(rec, i);
        }
      }
    }
    flush();
  }
  function touch(rec, i) { let s = S.touched.get(rec); if (!s) S.touched.set(rec, s = new Set()); s.add(i); }
  function flush() { for (const [rec, set] of S.touched) write(S.c.body, rec, set); S.touched.clear(); }
  function move(x, y, pressure) { dab(x, y, pressure); }
  function end() { const had = !!S; S = null; return had; }

  // ---------------------------------------------------------------- keeping it: per person, in the scene file
  function toJSON(c) {
    const parts = {};
    for (const t of targets(c.body)) {
      const r = t.rec; if (!r) continue;
      const i = [], d = [];
      for (let k = 0; k < r.n; k++) { const x = +r.off[k * 3].toFixed(5), y = +r.off[k * 3 + 1].toFixed(5), z = +r.off[k * 3 + 2].toFixed(5); if (x || y || z) { i.push(k); d.push(x, y, z); } }
      if (i.length) parts[t.key] = { i, d };
    }
    return Object.keys(parts).length ? { v: 1, parts } : null;
  }
  function load(c, j) {
    const list = targets(c.body);
    for (const t of list) if (t.rec) { const had = new Set(); for (let k = 0; k < t.rec.n; k++) if (t.rec.off[k * 3] || t.rec.off[k * 3 + 1] || t.rec.off[k * 3 + 2]) had.add(k); if (had.size) { t.rec.off.fill(0); write(c.body, t.rec, had); } }
    if (!j || !j.parts) return;
    c.body.root.updateWorldMatrix(true, true);
    for (const [key, p] of Object.entries(j.parts)) {
      const t = list.find(x => x.key === key); if (!t || !Array.isArray(p.i)) continue;
      const rec = recOf(c.body, t), set = new Set();
      p.i.forEach((k, n) => { if (k >= 0 && k < rec.n) { rec.off[k * 3] = +p.d[n * 3] || 0; rec.off[k * 3 + 1] = +p.d[n * 3 + 1] || 0; rec.off[k * 3 + 2] = +p.d[n * 3 + 2] || 0; set.add(k); } });
      write(c.body, rec, set);
    }
  }
  const clear = c => load(c, null);
  // (the merged copy is rebuilt by rigid-merge from the parts, which carry the sculpt: nothing to redo; a newly merged person is
  // brought in step here once a frame cheaply: a stamp per merged mesh)
  const synced = new WeakSet();
  function frame(cast) {
    for (const c of cast) {
      if (c.body.kind !== 'human' || !c.body._sculpt) continue;
      for (const sm of c.body.root.children) if (sm.userData.rigid && !synced.has(sm)) { synced.add(sm); for (const t of c.body._sculpt) if (t.rec) syncMerged(c.body, t.rec); }
    }
  }
  return { brush, begin, move, end, clear, toJSON, load, frame, get active() { return !!S; }, hitOn, targets: c => targets(c.body) };
}
