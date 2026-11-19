// A tongue she can stick out, for comic faces. Her model file is not changed: the tongue is a small shape built here when the
// model loads and hung on her head bone, so it turns with her head.
//   const tongue = addTongue(THREE, vrm);      call once, right after the model loads and before she is posed
//   tongue.set(out, curl, side)                out 0..1 (0 hides it), curl -1 (down over her chin) .. 1 (up toward her nose),
//                                              side -1 .. 1 (to her right .. to her left)
//   tongue.set(out, curl, side, open)          open 0..1 is how far her mouth is open (her "aa"): the tongue rides down with her jaw
// Where her mouth is comes from the model itself: the points that move most in her "aa" (mouth open) shape are her lower lip
// and jaw, and the tongue starts just behind and above them.
export function addTongue(THREE, vrm, o = {}) {
  const none = { set() {}, mesh: null }, head = vrm.humanoid && vrm.humanoid.getRawBoneNode('head'); if (!head) return none;
  const V = () => new THREE.Vector3(), em = vrm.expressionManager, ex = em && em.getExpression('aa'); vrm.scene.updateWorldMatrix(true, true);
  // the meshes and the morph number of "aa"
  const binds = []; for (const b of (ex && (ex.binds || ex._binds)) || []) if (b && b.primitives && Number.isInteger(b.index)) for (const m of b.primitives) binds.push([m, b.index]);
  if (!binds.length) vrm.scene.traverse(m => { const d = m.isMesh && m.morphTargetDictionary; if (d) for (const k in d) if (/MTH_A$/i.test(k)) binds.push([m, d[k]]); });
  const pts = [], hw = head.getWorldPosition(V()), p = V(); let drop = 0, dropN = 0;
  for (const [m, idx] of binds) { const mp = m.geometry.morphAttributes.position && m.geometry.morphAttributes.position[idx]; if (!mp) continue; let top = 0; for (let i = 0; i < mp.count; i++) top = Math.max(top, Math.hypot(mp.getX(i), mp.getY(i), mp.getZ(i)));
    if (top < 1e-5) continue; for (let i = 0; i < mp.count; i++) if (Math.hypot(mp.getX(i), mp.getY(i), mp.getZ(i)) > top * 0.55) { drop += Math.abs(mp.getY(i)) * m.getWorldScale(V()).y; dropN++; if (m.getVertexPosition) m.getVertexPosition(i, p); else p.fromBufferAttribute(m.geometry.attributes.position, i); pts.push(m.localToWorld(p).clone()); } }
  // which way she faces: her mouth is in front of her head bone
  const fwd = V(), up = V(0, 1, 0), at = V();
  if (pts.length > 8) { const c = V(); for (const q of pts) c.add(q); c.multiplyScalar(1 / pts.length); fwd.copy(c).sub(hw); fwd.y = 0; if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, 1); fwd.normalize();
    let front = -1e9, high = -1e9; for (const q of pts) { front = Math.max(front, q.clone().sub(hw).dot(fwd)); } const ys = pts.map(q => q.y).sort((a, b) => a - b); high = ys[Math.floor(ys.length * 0.9)];
    at.copy(hw).addScaledVector(fwd, front - 0.02); at.y = high - 0.0045; }   /* it lies on the floor of her mouth, behind her lower lip */
  else { vrm.scene.getWorldDirection(fwd); const lk = vrm.lookAt && vrm.lookAt.faceFront; if (lk) fwd.copy(lk).transformDirection(vrm.scene.matrixWorld); fwd.y = 0; fwd.normalize(); at.copy(hw).addScaledVector(fwd, 0.07); at.y += 0.035; }
  const right = V().crossVectors(up, fwd).normalize(), holder = new THREE.Object3D(), basis = new THREE.Matrix4().makeBasis(right, up, fwd), wq = new THREE.Quaternion().setFromRotationMatrix(basis), hq = head.getWorldQuaternion(new THREE.Quaternion());
  head.add(holder); holder.position.copy(head.worldToLocal(at.clone())); holder.quaternion.copy(hq.invert().multiply(wq)); const hs = head.getWorldScale(V()); holder.scale.set(1 / hs.x, 1 / hs.y, 1 / hs.z);
  const y0 = holder.position.clone(), down = head.worldToLocal(at.clone().setY(at.y - 1)).sub(head.worldToLocal(at.clone())).normalize(), jaw = dropN ? Math.min(0.02, drop / dropN) : 0.008;
  if (o.dy) holder.position.y += o.dy; if (o.dz) holder.translateZ(o.dz);
  // the shape: rings along its length, drawn again whenever it moves. In the holder: x across, y up, z out of her mouth.
  const N = 12, M = 12, pos = new Float32Array((N + 1) * M * 3), col = new Float32Array((N + 1) * M * 3), idx = [], geo = new THREE.BufferGeometry();
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * M + j, b = i * M + (j + 1) % M, c = a + M, d = b + M; idx.push(a, b, c, b, d, c); }
  const base = new THREE.Color(o.color || '#f2607c'), dark = new THREE.Color(o.shade || '#c23a5c'), cc = new THREE.Color();
  for (let i = 0; i <= N; i++) for (let j = 0; j < M; j++) { const a = j / M * Math.PI * 2, mid = Math.pow(Math.abs(Math.sin(a)), 6) * (Math.sin(a) > 0 ? 1 : 0); cc.copy(base).lerp(dark, Math.max(mid * 0.55, Math.sin(a) < 0 ? 0.35 : 0)); cc.toArray(col, (i * M + j) * 3); }   /* a darker line down the middle of the top, and a darker underside */
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })); mesh.frustumCulled = false; mesh.visible = false; mesh.name = 'tongue'; holder.add(mesh);
  const cur = [-1, 0, 0, 0], c = V(), t = V(), n = V(), x = V(1, 0, 0);
  function set(out = 0, curl = 0, side = 0, open = 0) { open = Math.max(0, Math.min(1, +open || 0));
    out = Math.max(0, Math.min(1, +out || 0)); curl = Math.max(-1, Math.min(1, +curl || 0)); side = Math.max(-1, Math.min(1, +side || 0));
    if (out < 0.03) { mesh.visible = false; cur[0] = 0; return; } if (Math.abs(out - cur[0]) + Math.abs(curl - cur[1]) + Math.abs(side - cur[2]) + Math.abs(open - cur[3]) < 0.004 && mesh.visible) return; cur[0] = out; cur[1] = curl; cur[2] = side; cur[3] = open; mesh.visible = true; holder.position.copy(y0).addScaledVector(down, jaw * open * 0.8);
    const len = 0.014 + 0.04 * out, step = len / N, bend = (curl >= 0 ? curl * 1.25 : curl * 1.5) - 0.45 * out * (1 - Math.abs(curl)), yaw = side * 0.55; let pitch = 0.06; c.set(side * 0.004, 0, 0);
    for (let i = 0; i <= N; i++) { const u = i / N; if (i) { pitch += bend * (u < 0.3 ? 0.3 : 1.3) / N; t.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)); c.addScaledVector(t, step); } else t.set(Math.sin(yaw), 0, Math.cos(yaw));
      x.set(Math.cos(yaw), 0, -Math.sin(yaw)); n.crossVectors(t, x).normalize();
      const round = u > 0.7 ? Math.sqrt(Math.max(0, 1 - ((u - 0.7) / 0.3) ** 2)) : 1, w = 0.0118 * (1 - 0.22 * u) * round * (0.85 + 0.15 * Math.min(1, u * 4)), th = 0.0042 * (0.5 + 0.5 * round) * (u > 0.98 ? 0.2 : 1);
      for (let j = 0; j < M; j++) { const a = j / M * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), dip = sa > 0 ? 1 - 0.3 * Math.pow(1 - Math.abs(ca), 3) : 1, k = (i * M + j) * 3;
        pos[k] = c.x + x.x * w * ca + n.x * th * sa * dip; pos[k + 1] = c.y + x.y * w * ca + n.y * th * sa * dip; pos[k + 2] = c.z + x.z * w * ca + n.z * th * sa * dip; } }
    geo.attributes.position.needsUpdate = true;
  }
  return { set, mesh, holder, found: pts.length };
}
