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
  const joints = [...man.joints].filter(j => /skirt/i.test(j.bone.name));
  const raw = n => vrm.humanoid.getRawBoneNode(n), hips = raw('hips'), legs = ['left', 'right'].map(s => [raw(s + 'UpperLeg'), raw(s + 'LowerLeg'), raw(s + 'Foot')]).filter(l => l[0] && l[1] && l[2]); if (!hips) return null;
  vrm.scene.updateMatrixWorld(true);
  const V = () => new THREE.Vector3(), wp = (o, v) => o.getWorldPosition(v || V()), byBone = new Map(joints.map(j => [j.bone, j])), chains = [];
  // a chain starts at a skirt bone whose parent is not a skirt bone, and runs down through the children to the end bone
  for (const j of joints) { if (byBone.has(j.bone.parent)) continue; const bones = []; let b = j.bone, end = null;
    for (;;) { const jj = byBone.get(b); if (!jj) { end = b; break; } bones.push(b); const nx = jj.child || b.children[0] || null; if (!nx) break; b = nx; }
    if (!bones.length || !end) continue; const nodes = [...bones, end], anchor = bones[0].parent, inv = anchor.matrixWorld.clone().invert();
    const c = { bones, anchor, n: nodes.length, p: nodes.map(o => wp(o)), prev: nodes.map(o => wp(o)), rest: nodes.map(o => wp(o).applyMatrix4(inv)), len: [], q0: bones.map(o => o.quaternion.clone()), axis: [], layer: bones[0].name.replace(/^J_Sec_[LR]_/, '').replace(/(Back|Front|Side)\d*/, ''),   /* which garment and layer the strip belongs to: 'Skirt_01', 'CoatSkirt_02' */ links: [] };
    for (let i = 0; i < bones.length; i++) { c.len.push(c.p[i].distanceTo(c.p[i + 1])); c.axis.push(nodes[i + 1].position.clone().normalize()); } chains.push(c); }
  // Tails without bones. Many tops (coats, tunics, long shirts) hang below the waist but come with nothing to move that part: the
  // tail is stuck to her hips and thighs, so it stands out like a hoop when she sits. For those, strips are made here: a ring of
  // new bones under her hips that follows the garment's own shape from the waist to the hem, and every tail vertex is handed to
  // the nearest two strips at its place along them, blending in over the first few centimetres so the waist stays put.
  const dbg = { tail: 0, made: 0, reskinned: 0 };
  try { if (!T.notails) { const body = new Set(['hips', 'spine', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg'].map(raw).filter(Boolean)), hp = wp(hips), waistY = Math.min(...legs.map(l => wp(l[0]).y)) + (T.waist ?? 0.03), meshes = [], v = V(), tail = [];
      vrm.scene.traverse(m => { if (m.isSkinnedMesh && m.geometry.index && m.geometry.attributes.skinIndex && (Array.isArray(m.material) ? m.material : [m.material]).some(x => /Tops|Onepiece|OnePiece|Coat|Dress/i.test(x.name || ''))) meshes.push(m); });
      // every vertex of a top that sits below the waist and is held by her hips or legs
      for (const m of meshes) { const g = m.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, idx = g.index, mark = si.__tail || (si.__tail = new Uint8Array(pos.count));
        for (let n = 0; n < idx.count; n++) { const i = idx.getX(n); if (mark[i]) continue; mark[i] = 1; v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); if (v.y >= waistY) continue; let main = 0, mw = -1; for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > mw) { mw = sw.getComponent(i, k); main = si.getComponent(i, k); } if (!body.has(m.skeleton.bones[main])) continue;
          tail.push({ m, i, main, x: v.x, y: v.y, z: v.z, a: Math.atan2(v.x - hp.x, v.z - hp.z), r: Math.hypot(v.x - hp.x, v.z - hp.z) }); } }
      dbg.tail = tail.length; const hemY = tail.length ? tail.reduce((s2, t) => Math.min(s2, t.y), 9) : 0, L = waistY - hemY;
      if (tail.length > 120 && L > 0.09) { const K = T.strips ?? 12, S = Math.max(2, Math.min(4, Math.round(L / 0.09))), made = [], TAU = Math.PI * 2;
        for (let k = 0; k < K; k++) { const ang = -Math.PI + (k + 0.5) * TAU / K, pts = []; for (let l = 0; l <= S; l++) { const y = waistY - L * l / S; let sr = 0, sn = 0, far = 0; for (const t of tail) { let da = Math.abs(t.a - ang); if (da > Math.PI) da = TAU - da; if (da > TAU / K * 0.75 || Math.abs(t.y - y) > L / S * 0.6) continue; sr += t.r; sn++; far = Math.max(far, t.r); }
              const r = sn ? (sr / sn + far) / 2 : (pts.length ? pts[pts.length - 1].r : 0.14); pts.push({ r, v: new THREE.Vector3(hp.x + Math.sin(ang) * r, y, hp.z + Math.cos(ang) * r) }); }
          let parent = hips; const bones = []; for (let l = 0; l <= S; l++) { const b = l < S ? new THREE.Bone() : new THREE.Object3D(); b.name = 'Tail_' + k + '_' + l; parent.add(b); parent.updateWorldMatrix(true, false); b.position.copy(parent.worldToLocal(pts[l].v.clone())); b.updateMatrix(); b.updateWorldMatrix(false, false); if (l < S) bones.push(b); parent = b; }
          const nodes = [...bones, parent], inv = hips.matrixWorld.clone().invert(), c = { bones, anchor: hips, n: nodes.length, p: nodes.map(o => wp(o)), prev: nodes.map(o => wp(o)), rest: nodes.map(o => wp(o).applyMatrix4(inv)), len: [], q0: bones.map(o => o.quaternion.clone()), axis: [], layer: 'Tail', links: [], ang };
          for (let l = 0; l < bones.length; l++) { c.len.push(c.p[l].distanceTo(c.p[l + 1])); c.axis.push(nodes[l + 1].position.clone().normalize()); } made.push(c); }
        // the new bones join every skeleton the top is drawn with
        const skels = new Map(), all = []; vrm.scene.traverse(m => { if (m.isSkinnedMesh) all.push(m); }); const newBones = made.flatMap(c => c.bones);
        for (const m of meshes) if (!skels.has(m.skeleton)) skels.set(m.skeleton, { base: m.skeleton.bones.length, sk: new THREE.Skeleton([...m.skeleton.bones, ...newBones], [...m.skeleton.boneInverses, ...newBones.map(b => b.matrixWorld.clone().invert())]) });
        for (const m of all) { const e = skels.get(m.skeleton); if (e) { const old = m.skeleton; m.bind(e.sk, m.bindMatrix); m.__base = e.base; if (old.boneTexture) old.dispose(); } }
        const ab = V(), cp = V(), near = (c, p) => { let best = null; for (let i = 0; i < c.n - 1; i++) { ab.copy(c.p[i + 1]).sub(c.p[i]); const u = Math.max(0, Math.min(1, cp.copy(p).sub(c.p[i]).dot(ab) / Math.max(1e-6, ab.lengthSq()))), dd = cp.copy(c.p[i]).addScaledVector(ab, u).distanceTo(p); if (!best || dd < best.d) best = { d: dd, i, u, c, k: made.indexOf(c) }; } return best; };
        const touched = new Set(); for (const t of tail) { const si = t.m.geometry.attributes.skinIndex, sw = t.m.geometry.attributes.skinWeight, base = t.m.__base, S1 = S; v.set(t.x, t.y, t.z); const hits = made.map(c => near(c, v)).sort((x, y) => x.d - y.d).slice(0, 2), t0 = Math.min(1, (waistY - t.y) / 0.07), tt = t0 * t0 * (3 - 2 * t0), w0 = 1 / (hits[0].d + 0.01), w1 = 1 / (hits[1].d + 0.01), out = [[t.main, 1 - tt]];
          for (const [hh, w] of [[hits[0], w0 / (w0 + w1)], [hits[1], w1 / (w0 + w1)]]) { if (w < 0.02) continue; const b0 = base + hh.k * S1 + hh.i, has1 = hh.i + 1 < S1, u = has1 ? hh.u * hh.u : 0; out.push([b0, tt * w * (1 - u)]); if (has1 && u > 0.02) out.push([b0 + 1, tt * w * u]); }
          out.sort((x, y) => y[1] - x[1]); const top = out.slice(0, 4), sum = top.reduce((s2, o) => s2 + o[1], 0) || 1; for (let k = 0; k < 4; k++) { si.setComponent(t.i, k, top[k] ? top[k][0] : 0); sw.setComponent(t.i, k, top[k] ? top[k][1] / sum : 0); } touched.add(si).add(sw); dbg.reskinned++; }
        for (const a2 of touched) a2.needsUpdate = true; chains.push(...made); dbg.made = made.length; dbg.S = S; dbg.L = +L.toFixed(3); } } } catch (e) { console.warn('bone cloth tails', e); dbg.err = String(e).slice(0, 120); }
  // Wide sleeves, the same way. A bell sleeve is stuck to her forearm, so it holds its shape whichever way the arm points. Here the
  // part of a sleeve that stands well off the forearm gets a ring of strips running from where the bell starts to the cuff, held at
  // the elbow end by the forearm bone, and its vertices are handed to them. The strips fall under gravity and rest on the arm.
  const arms = []; try { if (!T.nosleeves) { const meshes = [], v = V(), TAU = Math.PI * 2; vrm.scene.traverse(m => { if (m.isSkinnedMesh && m.geometry.index && m.geometry.attributes.skinIndex && (Array.isArray(m.material) ? m.material : [m.material]).some(x => /Tops|Onepiece|OnePiece|Coat|Dress/i.test(x.name || ''))) meshes.push(m); });
      for (const side of ['left', 'right']) { const fore = raw(side + 'LowerArm'), hand = raw(side + 'Hand'); if (!fore || !hand) continue; const O = wp(fore), W = wp(hand), u = W.clone().sub(O), len = u.length(); u.normalize(); arms.push([fore, hand]);
        const e1 = new THREE.Vector3(0, 1, 0).addScaledVector(u, -u.y).normalize(), e2 = new THREE.Vector3().crossVectors(u, e1), own = new Set([fore, hand]), sl = [];
        for (const m of meshes) { const g = m.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, idx = g.index, key = '__slv' + side, mark = si[key] || (si[key] = new Uint8Array(pos.count));
          for (let n = 0; n < idx.count; n++) { const i = idx.getX(n); if (mark[i]) continue; mark[i] = 1; let main = 0, mw = -1; for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > mw) { mw = sw.getComponent(i, k); main = si.getComponent(i, k); } if (!own.has(m.skeleton.bones[main])) continue;
            v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).sub(O); const t = v.dot(u), x = v.dot(e1), y = v.dot(e2), r = Math.hypot(x, y); if (r < (T.sleeveR ?? 0.06) || t < len * 0.1) continue; sl.push({ m, i, main, t, r, a: Math.atan2(y, x), p: v.clone().add(O) }); } }
        const far = sl.reduce((s2, q) => Math.max(s2, q.r), 0); dbg['sleeve' + side[0].toUpperCase()] = sl.length; if (sl.length < 60 || far < (T.sleeveWide ?? 0.1)) continue;
        const t0 = sl.reduce((s2, q) => Math.min(s2, q.t), 9), t1 = sl.reduce((s2, q) => Math.max(s2, q.t), 0), L = t1 - t0; if (L < 0.06) continue; const K = 8, S = Math.max(2, Math.min(3, Math.round(L / 0.08))), made = [];
        for (let k = 0; k < K; k++) { const ang = -Math.PI + (k + 0.5) * TAU / K, pts = []; for (let l = 0; l <= S; l++) { const t = t0 + L * l / S; let sr = 0, sn = 0, mx = 0; for (const q of sl) { let da = Math.abs(q.a - ang); if (da > Math.PI) da = TAU - da; if (da > TAU / K * 0.75 || Math.abs(q.t - t) > L / S * 0.6) continue; sr += q.r; sn++; mx = Math.max(mx, q.r); }
              const r = sn ? (sr / sn + mx) / 2 : (pts.length ? pts[pts.length - 1].r : 0.08); pts.push({ r, v: O.clone().addScaledVector(u, t).addScaledVector(e1, Math.cos(ang) * r).addScaledVector(e2, Math.sin(ang) * r) }); }
          let parent = fore; const bones = []; for (let l = 0; l <= S; l++) { const b = l < S ? new THREE.Bone() : new THREE.Object3D(); b.name = 'Sleeve_' + side[0] + k + '_' + l; parent.add(b); parent.updateWorldMatrix(true, false); b.position.copy(parent.worldToLocal(pts[l].v.clone())); b.updateMatrix(); b.updateWorldMatrix(false, false); if (l < S) bones.push(b); parent = b; }
          const nodes = [...bones, parent], inv = fore.matrixWorld.clone().invert(), c = { bones, anchor: fore, n: nodes.length, p: nodes.map(o => wp(o)), prev: nodes.map(o => wp(o)), rest: nodes.map(o => wp(o).applyMatrix4(inv)), len: [], q0: bones.map(o => o.quaternion.clone()), axis: [], layer: 'Sleeve' + side, links: [], ang, keep: T.sleeveKeep ?? 0.012 };
          for (let l = 0; l < bones.length; l++) { c.len.push(c.p[l].distanceTo(c.p[l + 1])); c.axis.push(nodes[l + 1].position.clone().normalize()); } made.push(c); }
        const skels = new Map(), all = []; vrm.scene.traverse(m => { if (m.isSkinnedMesh) all.push(m); }); const newBones = made.flatMap(c => c.bones);
        for (const m of meshes) if (!skels.has(m.skeleton)) skels.set(m.skeleton, { base: m.skeleton.bones.length, sk: new THREE.Skeleton([...m.skeleton.bones, ...newBones], [...m.skeleton.boneInverses, ...newBones.map(b => b.matrixWorld.clone().invert())]) });
        for (const m of all) { const e = skels.get(m.skeleton); if (e) { const old = m.skeleton; m.bind(e.sk, m.bindMatrix); m.__base = e.base; if (old.boneTexture) old.dispose(); } }
        const ab = V(), cp = V(), near = (c, p) => { let best = null; for (let i = 0; i < c.n - 1; i++) { ab.copy(c.p[i + 1]).sub(c.p[i]); const uu = Math.max(0, Math.min(1, cp.copy(p).sub(c.p[i]).dot(ab) / Math.max(1e-6, ab.lengthSq()))), dd = cp.copy(c.p[i]).addScaledVector(ab, uu).distanceTo(p); if (!best || dd < best.d) best = { d: dd, i, u: uu, k: made.indexOf(c) }; } return best; };
        const touched = new Set(), sm = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }; for (const q of sl) { const si = q.m.geometry.attributes.skinIndex, sw = q.m.geometry.attributes.skinWeight, base = q.m.__base, hits = made.map(c => near(c, q.p)).sort((x, y) => x.d - y.d).slice(0, 2), tt = sm((q.t - t0) / 0.05) * sm((q.r - (T.sleeveR ?? 0.06)) / 0.03 + 0.35), w0 = 1 / (hits[0].d + 0.01), w1 = 1 / (hits[1].d + 0.01), out = [[q.main, 1 - tt]];
          for (const [hh, w] of [[hits[0], w0 / (w0 + w1)], [hits[1], w1 / (w0 + w1)]]) { if (w < 0.02) continue; const b0 = base + hh.k * S + hh.i, has1 = hh.i + 1 < S, uu = has1 ? hh.u * hh.u : 0; out.push([b0, tt * w * (1 - uu)]); if (has1 && uu > 0.02) out.push([b0 + 1, tt * w * uu]); }
          out.sort((x, y) => y[1] - x[1]); const top = out.slice(0, 4), sum = top.reduce((s2, o) => s2 + o[1], 0) || 1; for (let k = 0; k < 4; k++) { si.setComponent(q.i, k, top[k] ? top[k][0] : 0); sw.setComponent(q.i, k, top[k] ? top[k][1] / sum : 0); } touched.add(si).add(sw); }
        for (const a2 of touched) a2.needsUpdate = true; chains.push(...made); dbg.sleeves = (dbg.sleeves || 0) + made.length; } } } catch (e) { console.warn('bone cloth sleeves', e); dbg.errSleeve = String(e).slice(0, 120); }
  if (!chains.length) return null;
  for (const j of joints) man.deleteJoint(j);   /* these bones are ours now; hair and the rest stay with the spring bone code */
  // across the skirt: in each layer the strips are put in order round her hips and each is tied to the next, point for point
  { const hi = hips.matrixWorld.clone().invert(), by = {}; for (const c of chains) (by[c.layer] = by[c.layer] || []).push(c);
    for (const ring of Object.values(by)) { if (ring.length < 2) continue; for (const c of ring) { if (c.ang !== undefined) continue; const l = c.p[0].clone().applyMatrix4(hi); c.ang = Math.atan2(l.x, l.z); } ring.sort((a, b) => a.ang - b.ang);
      for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length]; if (ring.length === 2 && k === 1) break; for (let i = 1; i < Math.min(a.n, b.n); i++) a.links.push({ b, i, d: a.p[i].distanceTo(b.p[i]) }); } } }
  const G = T.g ?? 9.8, KEEP = T.keep ?? 0.012, DAMP = T.damp ?? 0.9, ITERS = T.iters ?? 5, PR = 0.028, a = V(), b = V(), d = V(), e = V(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), caps = [], lastRoot = V(); let seatY = -1e9, floor = -1e9, first = true, keepK = 0.045;
  const DOWN = new THREE.Vector3(0, -1, 0), ID = new THREE.Quaternion(), legDir = [V(), V()], legLevel = [false, false], t0v = V();
  // Where a point would be if the garment simply kept its cut. Standing, that is straight down from the waist. Sitting, the front and
  // sides of a skirt are laid along the thigh instead (toward the knee), because that is where the cloth has to go: without this the
  // points were all lifted onto the same spot of the thigh and the strip stood up in front of her like a tent.
  const humanSet = new Set(Object.keys(vrm.humanoid.humanBones || {}).map(raw).filter(Boolean)), heldBy = o => { while (o && !humanSet.has(o)) o = o.parent; return o; };
  for (const c of chains) { c.f = 0; if (heldBy(c.anchor) === hips) { const l = c.p[0].clone().applyMatrix4(hips.matrixWorld.clone().invert()); c.f = Math.max(0, Math.min(1, (l.z + 0.035) / 0.07)); c.leg = l.x >= 0 ? 0 : 1; c.q = new THREE.Quaternion(); } }
  const target = (c, i, out) => { out.copy(c.rest[i]).applyMatrix4(c.anchor.matrixWorld); if (i && c.f > 0 && legLevel[c.leg]) { t0v.copy(c.rest[0]).applyMatrix4(c.anchor.matrixWorld); out.sub(t0v).applyQuaternion(c.q).add(t0v); } return out; };
  // A dress can have several layers of skirt (a panel over pleats over a lining), each with its own copy of the same strips in the same
  // place. Simulated one by one they pass through each other and the dress looks torn. So only the first layer is simulated; every other
  // layer's strip follows its twin, and the layers stay nested the way the outfit was made.
  { const first = {}; for (const c of chains) { const key = c.bones[0].name.replace(/_\d+$/, ''), lead = first[key]; if (lead && lead.n === c.n && lead.rest[0].distanceTo(c.rest[0]) < 0.03 && /^J_Sec_/.test(c.bones[0].name)) c.lead = lead; else if (!lead) first[key] = c; } }
  const sim = chains.filter(c => !c.lead); for (const c of sim) c.links = c.links.filter(l => !l.b.lead);
  function reset() { for (const c of chains) for (let i = 0; i < c.n; i++) { target(c, i, c.p[i]); c.prev[i].copy(c.p[i]); } }
  // push a point out of a capsule (a thigh or a shin)
  function outOf(p, A, B, r, lap) { d.copy(B).sub(A); const t = Math.max(0, Math.min(1, e.copy(p).sub(A).dot(d) / Math.max(1e-6, d.lengthSq()))); e.copy(A).addScaledVector(d, t);
    if (lap) { const hd = Math.hypot(p.x - e.x, p.z - e.z); if (hd < r) { const topY = e.y + Math.sqrt(r * r - hd * hd); if (p.y < topY) p.y = topY; } return; }   /* seated: cloth caught in or under a thigh comes out on top of it, so it lies in her lap and not beneath her */
    d.copy(p).sub(e); const l = d.length(); if (l < r && l > 1e-5) p.addScaledVector(d, (r - l) / l); }
  function collide(p, sleeve, was, maxH) { for (const k of caps) { if (k[4] && !sleeve) continue;   /* her forearms are solid to her sleeves only: a hand resting in her lap must not shove the skirt up round it */ outOf(p, k[0], k[1], k[2], k[3]); } if (p.y < seatY) p.y = seatY; if (surface) { const h = surface(p.x, p.z) + 0.014; if (h <= (maxH ?? 1e9) && p.y < h && p.y > h - (T.sink ?? 0.16)) { if (!was || was.y >= h - 0.035) p.y = h; else { p.x = was.x; p.z = was.z; } } }   /* came down onto it: it rests there. Came at it from the side (a skirt between her hip and an armrest): it is stopped, not hoisted on top */   /* furniture: cloth that has sunk a little into the top of something is lifted back onto it; cloth well below a top is beside or under the thing and is left alone */
    if (p.y < floor) p.y = floor; }
  let surface = null;
  function tick(dt, build, surfaceAt) { surface = surfaceAt || null; dt = Math.max(1 / 240, Math.min(1 / 30, dt || 1 / 60)); const fat = 1 + 0.22 * (build || 0);
    hips.updateWorldMatrix(true, false); for (const l of legs) for (const o of l) o.updateWorldMatrix(true, false); for (const c of chains) c.anchor.updateWorldMatrix(true, false);
    // her legs as capsules, and the seat: a flat surface just under her hip joints whenever a thigh is nearer level than upright
    caps.length = 0; let seated = false, top = 1e9; for (const [u, l, f] of legs) { const A = wp(u), B = wp(l), C = wp(f); const level = (A.y - B.y) / Math.max(1e-6, A.distanceTo(B)) < (T.tilt ?? 0.72); caps.push([A, B, (T.thigh ?? 0.08) * fat + PR, level], [B, C, (T.shin ?? 0.054) * (1 + 0.1 * (build || 0)) + PR]); if ((A.y - B.y) / Math.max(1e-6, A.distanceTo(B)) < (T.tilt ?? 0.72)) seated = true; top = Math.min(top, A.y); }
    for (const [f2, h2] of arms) { f2.updateWorldMatrix(true, false); h2.updateWorldMatrix(true, false); caps.push([wp(f2), wp(h2), 0.04 + PR, false, true]); }
    for (let k = 0; k < Math.min(2, legs.length); k++) { legDir[k].copy(caps[k * 2][1]).sub(caps[k * 2][0]).normalize(); legLevel[k] = !!caps[k * 2][3]; } for (const c of chains) if (c.f > 0 && legLevel[c.leg]) c.q.setFromUnitVectors(DOWN, legDir[c.leg]).slerp(ID, 1 - c.f);
    seatY = seated ? top - (T.seat ?? 0.085) * fat + PR : -1e9; floor = wp(vrm.scene, a).y + 0.02;
    wp(chains[0].bones[0], a); if (first || a.distanceTo(lastRoot) > 0.35) { reset(); first = false; } lastRoot.copy(a);   /* she was moved in one go (a cut, a teleport): start the cloth at rest there */
    keepK += ((seated ? KEEP : (T.keepUp ?? 0.045)) - keepK) * Math.min(1, dt * 3); const keepNow = keepK;   /* on her feet the garment holds most of its cut; sitting, it lets go and drapes */
    const steps = dt > 1 / 45 ? 2 : 1, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const c of sim) { wp(c.bones[0], c.p[0]); c.prev[0].copy(c.p[0]);
        for (let i = 1; i < c.n; i++) { const p = c.p[i], pv = c.prev[i]; a.copy(p).sub(pv).multiplyScalar(DAMP); pv.copy(p); p.add(a); p.y -= G * h * h; target(c, i, b); p.addScaledVector(b.sub(p), c.keep ?? keepNow); } }   /* a little of the tailored shape is kept, so standing she still has a skirt and not a rag */
      for (let it = 0; it < ITERS; it++) {
        for (const c of sim) { for (let i = 0; i < c.n - 1; i++) { const A = c.p[i], B = c.p[i + 1]; d.copy(B).sub(A); const l = d.length() || 1e-6; if (i === 0) B.addScaledVector(d, (c.len[i] - l) / l); else { const k = 0.5 * (c.len[i] - l) / l; A.addScaledVector(d, -k); B.addScaledVector(d, k); } }
          for (const L of c.links) { const A = c.p[L.i], B = L.b.p[L.i]; d.copy(B).sub(A); const l = d.length() || 1e-6, want = l > L.d * 1.04 ? L.d * 1.04 : l < L.d * 0.55 ? L.d * 0.55 : l; if (want !== l) { const k = 0.5 * (want - l) / l; A.addScaledVector(d, -k); B.addScaledVector(d, k); } } }
        for (const c of sim) { const sl = c.keep !== undefined; const cap = c.q ? c.p[0].y - (T.tuck ?? 0.22) : 1e9;   /* a skirt or coat tail only comes to rest on things well below her waist (the seat, a low table). An armrest beside her hip is too high: the cloth goes down past it, between her and the arm, as if tucked in, instead of spreading over it */
          for (let i = 1; i < c.n; i++) collide(c.p[i], sl, c.prev[i], cap); } }
      for (const c of sim) for (let i = 0; i < c.n - 1; i++) { const A = c.p[i], B = c.p[i + 1]; d.copy(B).sub(A); const l = d.length() || 1e-6; B.copy(A).addScaledVector(d, c.len[i] / l); }   /* strips never stretch */
    }
    // turn each bone so it points at the next point down its strip
    for (const c of chains) if (c.lead) { wp(c.bones[0], c.p[0]); for (let i = 1; i < c.n; i++) c.p[i].copy(c.lead.p[i]).sub(c.lead.p[0]).add(c.p[0]); }   /* the other layers of the same skirt go exactly where the first one went */
    for (const c of chains) for (let i = 0; i < c.bones.length; i++) { const bone = c.bones[i]; bone.quaternion.copy(c.q0[i]); bone.updateMatrix(); m4.multiplyMatrices(bone.parent.matrixWorld, bone.matrix); a.setFromMatrixPosition(m4); m4.invert(); b.copy(c.p[i + 1]).applyMatrix4(m4).normalize();
      if (b.lengthSq() > 0.5) { q.setFromUnitVectors(c.axis[i], b); bone.quaternion.multiply(q); } bone.updateMatrix(); bone.matrixWorld.multiplyMatrices(bone.parent.matrixWorld, bone.matrix); if (i === c.bones.length - 1) for (const ch of bone.children) ch.updateMatrixWorld(true); } }
  return { tick, reset, dbg, layersTied: chains.length - sim.length, joints: joints.length, bones: chains.reduce((s, c) => s + c.bones.length, 0), names: chains.map(c => c.bones[0].name + ':' + c.n + ':' + c.links.length), chains: chains.length, points: chains.reduce((s, c) => s + c.n, 0) };
}
