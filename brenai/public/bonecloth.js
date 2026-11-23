// Bone cloth: her skirt and coat tails as one sheet of cloth instead of separate springy strips.
// VRoid gives a skirt a ring of bone chains (strips), each on its own spring, with no gravity and nothing to collide with, so the
// hem keeps its standing bell shape when she sits. Here every skirt bone becomes a point with weight. Points are tied along their
// strip and across to the neighbouring strip, fall under gravity, and rest on her thighs, shins and the seat. The bones are then
// turned to follow the points, so the outfit's own mesh drapes. Nothing in the model file changes; it works on any outfit.
//   const cloth = boneCloth(THREE, vrm)      (null if the outfit has no skirt bones)
//   cloth.tick(dt, build)   every frame, after the body is posed and vrm.update has run
//   cloth.reset()           after a teleport or a camera cut
// Tuning without a deploy: window.WIZRA_CLOTH = { off, g, keep, damp, thigh, shin, seat, tilt, iters } before the page loads.
export function boneCloth(THREE, vrm) {
  const T = window.WIZRA_CLOTH || {}, man = vrm.springBoneManager; if (!man || T.off) return null;
  const joints = [...man.joints].filter(j => /skirt/i.test(j.bone.name)); if (!joints.length) return null;
  const raw = n => vrm.humanoid.getRawBoneNode(n), hips = raw('hips'), legs = ['left', 'right'].map(s => [raw(s + 'UpperLeg'), raw(s + 'LowerLeg'), raw(s + 'Foot')]).filter(l => l[0] && l[1] && l[2]); if (!hips) return null;
  vrm.scene.updateMatrixWorld(true);
  const V = () => new THREE.Vector3(), wp = (o, v) => o.getWorldPosition(v || V()), byBone = new Map(joints.map(j => [j.bone, j])), chains = [];
  // a chain starts at a skirt bone whose parent is not a skirt bone, and runs down through the children to the end bone
  for (const j of joints) { if (byBone.has(j.bone.parent)) continue; const bones = []; let b = j.bone, end = null;
    for (;;) { const jj = byBone.get(b); if (!jj) { end = b; break; } bones.push(b); const nx = jj.child || b.children[0] || null; if (!nx) break; b = nx; }
    if (!bones.length || !end) continue; const nodes = [...bones, end], anchor = bones[0].parent, inv = anchor.matrixWorld.clone().invert();
    const c = { bones, anchor, n: nodes.length, p: nodes.map(o => wp(o)), prev: nodes.map(o => wp(o)), rest: nodes.map(o => wp(o).applyMatrix4(inv)), len: [], q0: bones.map(o => o.quaternion.clone()), axis: [], layer: bones[0].name.replace(/^J_Sec_[LR]_/, '').replace(/(Back|Front|Side)\d*/, ''),   /* which garment and layer the strip belongs to: 'Skirt_01', 'CoatSkirt_02' */ links: [] };
    for (let i = 0; i < bones.length; i++) { c.len.push(c.p[i].distanceTo(c.p[i + 1])); c.axis.push(nodes[i + 1].position.clone().normalize()); } chains.push(c); }
  if (!chains.length) return null;
  // Some outfits (long coats and tunics worn as a top) come with coat-tail bones that nothing is attached to: the tail of the
  // garment is stuck to her hips and thighs, so it stands out like a hoop when she sits. Here those vertices are handed to the
  // coat-tail bones: each vertex below the waist of a top goes to the nearest two strips, at its place along them, blending in
  // over the first few centimetres so the waist stays put. After this the cloth below moves the garment itself.
  let reskinned = 0; const dbg = { coat: 0, attached: false, meshes: 0, below: 0, body: 0, near: 0, minD: 9 }; try { const coat = chains.filter(c => /CoatSkirt/i.test(c.layer)), used = new Set(); vrm.scene.traverse(m => { if (m.isSkinnedMesh) { const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight; if (!si || used.has(si)) return; used.add(si); for (let i = 0; i < si.count; i += 3) for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > 0.05 && /CoatSkirt/i.test((m.skeleton.bones[si.getComponent(i, k)] || {}).name || '')) { used.attached = true; return; } } });
    dbg.coat = coat.length; dbg.attached = !!used.attached; if (coat.length && !used.attached && !T.noreskin) { const first = coat[0].layer, ring = coat.filter(c => c.layer === first), body = new Set(['hips', 'spine', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg'].map(raw).filter(Boolean)), topY = Math.max(...ring.map(c => c.p[0].y)), done = new Set(), v = V(), cp = V(), ab = V();
      const near = (c, p) => { let best = null; for (let i = 0; i < c.n - 1; i++) { ab.copy(c.p[i + 1]).sub(c.p[i]); const u = Math.max(0, Math.min(1, cp.copy(p).sub(c.p[i]).dot(ab) / Math.max(1e-6, ab.lengthSq()))), dd = cp.copy(c.p[i]).addScaledVector(ab, u).distanceTo(p); if (!best || dd < best.d) best = { d: dd, i, u, c }; } return best; };
      const meshes = []; vrm.scene.traverse(m => { if (m.isSkinnedMesh) meshes.push(m); });
      for (const m of meshes) { const mats = Array.isArray(m.material) ? m.material : [m.material]; if (!mats.some(x => /Tops|Onepiece|OnePiece|Coat|Dress/i.test(x.name || ''))) continue; const g = m.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, idx = g.index; if (!idx || !si) continue; dbg.meshes++; const bi = b => m.skeleton.bones.indexOf(b); if (!done.has(si)) done.add(si), si.__d = new Uint8Array(pos.count);
        for (let n = 0; n < idx.count; n++) { const i = idx.getX(n); if (si.__d[i]) continue; si.__d[i] = 1; v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); dbg.topY = topY; dbg.yMin = Math.min(dbg.yMin ?? 9, v.y); dbg.yMax = Math.max(dbg.yMax ?? -9, v.y); dbg.seen = (dbg.seen || 0) + 1; const depth = topY - v.y; if (depth <= 0) continue; dbg.below++;
          let main = 0, mw = -1; for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > mw) { mw = sw.getComponent(i, k); main = si.getComponent(i, k); } if (!body.has(m.skeleton.bones[main])) continue; dbg.body++;
          const hits = ring.map(c => near(c, v)).sort((a, b) => a.d - b.d).slice(0, 2); if (hits.length) dbg.minD = Math.min(dbg.minD, hits[0].d); if (!hits.length || hits[0].d > (T.reach ?? 0.16)) continue; dbg.near++; const t0 = Math.min(1, depth / 0.07), t = t0 * t0 * (3 - 2 * t0), w0 = 1 / (hits[0].d + 0.01), w1 = hits[1] ? 1 / (hits[1].d + 0.01) : 0, out = [[main, 1 - t]];
          for (const [hh, w] of [[hits[0], w0 / (w0 + w1)], [hits[1], w1 / (w0 + w1)]]) { if (!hh || w < 0.02) continue; const b0 = bi(hh.c.bones[hh.i]), b1 = hh.i + 1 < hh.c.bones.length ? bi(hh.c.bones[hh.i + 1]) : -1; if (b0 < 0) continue; const u = b1 >= 0 ? hh.u * hh.u : 0; out.push([b0, t * w * (1 - u)]); if (b1 >= 0 && u > 0.02) out.push([b1, t * w * u]); }
          out.sort((a, b) => b[1] - a[1]); const top = out.slice(0, 4), sum = top.reduce((s2, o) => s2 + o[1], 0) || 1; for (let k = 0; k < 4; k++) { si.setComponent(i, k, top[k] ? top[k][0] : 0); sw.setComponent(i, k, top[k] ? top[k][1] / sum : 0); } reskinned++; }
        si.needsUpdate = true; sw.needsUpdate = true; } } } catch (e) { console.warn('bone cloth reskin', e); }
  for (const j of joints) man.deleteJoint(j);   /* these bones are ours now; hair and the rest stay with the spring bone code */
  // across the skirt: in each layer the strips are put in order round her hips and each is tied to the next, point for point
  { const hi = hips.matrixWorld.clone().invert(), by = {}; for (const c of chains) (by[c.layer] = by[c.layer] || []).push(c);
    for (const ring of Object.values(by)) { if (ring.length < 2) continue; for (const c of ring) { const l = c.p[0].clone().applyMatrix4(hi); c.ang = Math.atan2(l.x, l.z); } ring.sort((a, b) => a.ang - b.ang);
      for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length]; if (ring.length === 2 && k === 1) break; for (let i = 1; i < Math.min(a.n, b.n); i++) a.links.push({ b, i, d: a.p[i].distanceTo(b.p[i]) }); } } }
  const G = T.g ?? 9.8, KEEP = T.keep ?? 0.012, DAMP = T.damp ?? 0.9, ITERS = T.iters ?? 5, PR = 0.028, a = V(), b = V(), d = V(), e = V(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), caps = [], lastRoot = V(); let seatY = -1e9, floor = -1e9, first = true;
  const target = (c, i, out) => out.copy(c.rest[i]).applyMatrix4(c.anchor.matrixWorld);
  function reset() { for (const c of chains) for (let i = 0; i < c.n; i++) { target(c, i, c.p[i]); c.prev[i].copy(c.p[i]); } }
  // push a point out of a capsule (a thigh or a shin)
  function outOf(p, A, B, r) { d.copy(B).sub(A); const t = Math.max(0, Math.min(1, e.copy(p).sub(A).dot(d) / Math.max(1e-6, d.lengthSq()))); e.copy(A).addScaledVector(d, t); d.copy(p).sub(e); const l = d.length(); if (l < r && l > 1e-5) p.addScaledVector(d, (r - l) / l); }
  function collide(p) { for (const k of caps) outOf(p, k[0], k[1], k[2]); if (p.y < seatY) p.y = seatY; if (p.y < floor) p.y = floor; }
  function tick(dt, build) { dt = Math.max(1 / 240, Math.min(1 / 30, dt || 1 / 60)); const fat = 1 + 0.22 * (build || 0);
    hips.updateWorldMatrix(true, false); for (const l of legs) for (const o of l) o.updateWorldMatrix(true, false); for (const c of chains) c.anchor.updateWorldMatrix(true, false);
    // her legs as capsules, and the seat: a flat surface just under her hip joints whenever a thigh is nearer level than upright
    caps.length = 0; let seated = false, top = 1e9; for (const [u, l, f] of legs) { const A = wp(u), B = wp(l), C = wp(f); caps.push([A, B, (T.thigh ?? 0.08) * fat + PR], [B, C, (T.shin ?? 0.054) * (1 + 0.1 * (build || 0)) + PR]); if ((A.y - B.y) / Math.max(1e-6, A.distanceTo(B)) < (T.tilt ?? 0.72)) seated = true; top = Math.min(top, A.y); }
    seatY = seated ? top - (T.seat ?? 0.085) * fat + PR : -1e9; floor = wp(vrm.scene, a).y + 0.02;
    wp(chains[0].bones[0], a); if (first || a.distanceTo(lastRoot) > 0.35) { reset(); first = false; } lastRoot.copy(a);   /* she was moved in one go (a cut, a teleport): start the cloth at rest there */
    const steps = dt > 1 / 45 ? 2 : 1, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const c of chains) { wp(c.bones[0], c.p[0]); c.prev[0].copy(c.p[0]);
        for (let i = 1; i < c.n; i++) { const p = c.p[i], pv = c.prev[i]; a.copy(p).sub(pv).multiplyScalar(DAMP); pv.copy(p); p.add(a); p.y -= G * h * h; target(c, i, b); p.addScaledVector(b.sub(p), KEEP); } }   /* a little of the tailored shape is kept, so standing she still has a skirt and not a rag */
      for (let it = 0; it < ITERS; it++) {
        for (const c of chains) { for (let i = 0; i < c.n - 1; i++) { const A = c.p[i], B = c.p[i + 1]; d.copy(B).sub(A); const l = d.length() || 1e-6; if (i === 0) B.addScaledVector(d, (c.len[i] - l) / l); else { const k = 0.5 * (c.len[i] - l) / l; A.addScaledVector(d, -k); B.addScaledVector(d, k); } }
          for (const L of c.links) { const A = c.p[L.i], B = L.b.p[L.i]; d.copy(B).sub(A); const l = d.length() || 1e-6, want = l > L.d * 1.04 ? L.d * 1.04 : l < L.d * 0.55 ? L.d * 0.55 : l; if (want !== l) { const k = 0.5 * (want - l) / l; A.addScaledVector(d, -k); B.addScaledVector(d, k); } } }
        for (const c of chains) for (let i = 1; i < c.n; i++) collide(c.p[i]); }
      for (const c of chains) for (let i = 0; i < c.n - 1; i++) { const A = c.p[i], B = c.p[i + 1]; d.copy(B).sub(A); const l = d.length() || 1e-6; B.copy(A).addScaledVector(d, c.len[i] / l); }   /* strips never stretch */
    }
    // turn each bone so it points at the next point down its strip
    for (const c of chains) for (let i = 0; i < c.bones.length; i++) { const bone = c.bones[i]; bone.quaternion.copy(c.q0[i]); bone.updateMatrix(); m4.multiplyMatrices(bone.parent.matrixWorld, bone.matrix); a.setFromMatrixPosition(m4); m4.invert(); b.copy(c.p[i + 1]).applyMatrix4(m4).normalize();
      if (b.lengthSq() > 0.5) { q.setFromUnitVectors(c.axis[i], b); bone.quaternion.multiply(q); } bone.updateMatrix(); bone.matrixWorld.multiplyMatrices(bone.parent.matrixWorld, bone.matrix); if (i === c.bones.length - 1) for (const ch of bone.children) ch.updateMatrixWorld(true); } }
  return { tick, reset, reskinned, dbg, joints: joints.length, bones: chains.reduce((s, c) => s + c.bones.length, 0), names: chains.map(c => c.bones[0].name + ':' + c.n + ':' + c.links.length), chains: chains.length, points: chains.reduce((s, c) => s + c.n, 0) };
}
