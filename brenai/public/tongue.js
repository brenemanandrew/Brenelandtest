// A tongue she can stick out, for comic faces. Her model file is not changed: the tongue is a small shape built here when the
// model loads and hung on her head bone, so it turns with her head.
//   const tongue = addTongue(THREE, vrm);      call once, right after the model loads and before she is posed
//   tongue.set(out, curl, side)                out 0..1 (0 hides it), curl -1 (down over her chin) .. 1 (up toward her nose),
//                                              side -1 .. 1 (to her right .. to her left)
//   tongue.set(out, curl, side, open)          open 0..1 is how far her mouth is open (her "aa"): the tongue rides down with her jaw
//   tongue.set(out, curl, side, open, wide)    wide 0.6..1.5: narrower or broader than usual (1)
//   tongue.update(dt)                          once a frame: it is soft. It springs to where it was told to go and overshoots a little,
//                                              lags and wobbles when her head moves, and hangs toward the ground whichever way she tilts
//   tongue.snap()                              jump straight to rest at the pose just set (for a still picture)
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
  // ---- the shape: rings along its length, redrawn as it moves. In the holder: x across, y up, z out of her mouth. ----
  const N = 18, M = 16, NV = (N + 1) * M, pos = new Float32Array(NV * 3), col = new Float32Array(NV * 3), uv = new Float32Array(NV * 2), idx = [], geo = new THREE.BufferGeometry();
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * M + j, b = i * M + (j + 1) % M, c = a + M, d = b + M; idx.push(a, b, c, b, d, c); }
  for (let i = 0; i <= N; i++) for (let j = 0; j < M; j++) { const a = j / M * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), u = i / N, k = i * M + j;
    const shade = (sa >= 0 ? 1 - 0.14 * Math.pow(Math.abs(ca), 3) : 0.7 + 0.08 * Math.abs(ca)) * (0.78 + 0.22 * Math.min(1, u * 3));   /* edges a touch darker, the underside darker, the root in shadow */
    col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = shade; uv[k * 2] = 0.5 + 0.5 * ca * (sa >= 0 ? 1 : 0.9); uv[k * 2 + 1] = u; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
  // its skin, painted once: pink that lightens toward the tip, a soft groove down the middle, a speckle of taste buds, a wet shine
  let map = null; try { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, o.tip || '#f98a9c'); gr.addColorStop(0.55, o.color || '#ef5f7c'); gr.addColorStop(1, o.shade || '#c23a5c'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
    const side = g.createLinearGradient(0, 0, 64, 0); side.addColorStop(0, 'rgba(150,30,60,.35)'); side.addColorStop(0.22, 'rgba(150,30,60,0)'); side.addColorStop(0.78, 'rgba(150,30,60,0)'); side.addColorStop(1, 'rgba(150,30,60,.35)'); g.fillStyle = side; g.fillRect(0, 0, 64, 128);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 420; i++) { const x = rnd() * 64, y = rnd() * 128, lightDot = rnd() > 0.45; g.fillStyle = lightDot ? 'rgba(255,190,200,.22)' : 'rgba(170,40,70,.16)'; g.beginPath(); g.arc(x, y, 0.6 + rnd() * 0.9, 0, 6.3); g.fill(); }
    const groove = g.createLinearGradient(26, 0, 38, 0); groove.addColorStop(0, 'rgba(140,25,55,0)'); groove.addColorStop(0.5, 'rgba(140,25,55,.5)'); groove.addColorStop(1, 'rgba(140,25,55,0)'); g.fillStyle = groove; g.fillRect(26, 22, 12, 106);
    g.fillStyle = 'rgba(255,255,255,.26)'; g.beginPath(); g.ellipse(21, 30, 5, 15, 0.15, 0, 6.3); g.fill(); g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.ellipse(45, 44, 3, 10, -0.1, 0, 6.3); g.fill();
    map = new THREE.CanvasTexture(cv); map.flipY = true; if ('colorSpace' in map) map.colorSpace = THREE.SRGBColorSpace; } catch {}   /* (texture row 0 is the tip: v runs root to tip, and flipY puts the tip colour at the far end) */
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial(map ? { map, vertexColors: true, side: THREE.DoubleSide } : { color: o.color || '#ef5f7c', vertexColors: true, side: THREE.DoubleSide })); mesh.frustumCulled = false; mesh.visible = false; mesh.name = 'tongue'; holder.add(mesh);
  // ---- soft body: where it was told to be (tg), where it is (st), how fast it is moving (vl), and its sway from her head moving ----
  const tg = { out: 0, curl: 0, side: 0, open: 0, wide: 1 }, st = { out: 0, curl: 0, side: 0, open: 0, wide: 1 }, vl = { out: 0, curl: 0, side: 0, open: 0, wide: 0 }, sway = { x: 0, y: 0, vx: 0, vy: 0 }, grav = V(0, -1, 0);
  const K = { out: [190, 15], curl: [120, 9], side: [120, 9], open: [240, 26], wide: [140, 13] }, wp = V(), pp = V(), pv = V(), acc = V(), wq2 = new THREE.Quaternion(); let first = true;
  const c = V(), t = V(), n = V(), x = V();
  function build() {
    const out = Math.max(0, Math.min(1.12, st.out)), curl = Math.max(-1.2, Math.min(1.2, st.curl)), sd = st.side; if (out < 0.03 && tg.out < 0.03) { mesh.visible = false; return; } mesh.visible = true;
    holder.position.copy(y0).addScaledVector(down, jaw * Math.max(0, st.open) * 0.8);
    const len = 0.019 + 0.035 * out, step = len / N, hang = 0.5 * out * (1 - Math.min(1, Math.abs(curl)) * 0.75), bend = (curl >= 0 ? curl * 1.3 : curl * 1.5) + grav.y * hang, yawBend = grav.x * hang * 0.8;
    /* it thins as it stretches and fattens as it pulls back; curled up, the tip comes to more of a point and the sides cup */
    const wd = Math.max(0.55, Math.min(1.6, st.wide)), W = 0.0128 * (1.12 - 0.26 * out) * wd, T = 0.0056 * (1.2 - 0.3 * out) / Math.sqrt(wd),   /* spread wide it also lies flatter; drawn narrow it bunches up thicker */
       point = 1 + 0.7 * Math.max(0, curl), cup = 0.1 + 0.28 * Math.max(0, curl) + 0.1 * Math.abs(sd);
    let pitch = 0.05, yaw = sd * 0.5; c.set(sd * 0.003, -0.0015, -0.011);   /* the root sits back inside her mouth, so no end of it is ever seen */
    for (let i = 0; i <= N; i++) { const u = i / N, tipW = u * u;
      if (i) { pitch += (bend * (u < 0.3 ? 0.25 : 1.32) + sway.y * 2.4 * u) / N; yaw += (yawBend * 1.3 + sway.x * 2.4) * u / N + sd * 0.25 / N; }
      t.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)); if (i) c.addScaledVector(t, step);
      x.set(Math.cos(yaw), 0, -Math.sin(yaw)); n.crossVectors(t, x).normalize();
      const round = u > 0.7 ? Math.pow(Math.sqrt(Math.max(0, 1 - ((u - 0.7) / 0.3) ** 2)), point) : 1, body = 0.8 + 0.2 * Math.sin(Math.PI * Math.min(1, u / 0.75) * 0.85 + 0.25);
      const w = W * body * round, th = T * (0.7 + 0.3 * Math.sin(Math.PI * u * 0.85)) * (0.4 + 0.6 * round), roll = sd * 0.35 * tipW;   /* pushed to one side it also twists a little */
      for (let j = 0; j < M; j++) { const a = j / M * Math.PI * 2 + roll, ca = Math.cos(a), sa = Math.sin(a), k = (i * M + j) * 3;
        const top = sa >= 0, gr = top ? 1 - 0.42 * Math.exp(-(ca * ca) / 0.05) * Math.min(1, u * 2.2) * (1 - 0.6 * tipW) : 1.18, lift = cup * ca * ca * w, y = th * sa * gr + lift;
        pos[k] = c.x + x.x * w * ca + n.x * y; pos[k + 1] = c.y + x.y * w * ca + n.y * y; pos[k + 2] = c.z + x.z * w * ca + n.z * y; } }
    geo.attributes.position.needsUpdate = true;
  }
  function set(out = 0, curl = 0, side = 0, open = 0, wide = 1) { tg.wide = Math.max(0.6, Math.min(1.5, +wide || 1)); const cl = (v, a, b) => Math.max(a, Math.min(b, +v || 0)); tg.out = cl(out, 0, 1); tg.curl = cl(curl, -1, 1); tg.side = cl(side, -1, 1); tg.open = cl(open, 0, 1); }
  function snap() { for (const k in tg) { st[k] = tg[k]; vl[k] = 0; } sway.x = sway.y = sway.vx = sway.vy = 0; first = true; build(); }
  function update(dt) {
    if (!(dt > 0)) return snap(); if (tg.out < 0.03 && st.out < 0.03 && Math.abs(vl.out) < 0.05) { st.out = 0; if (mesh.visible) mesh.visible = false; first = true; return; }
    dt = Math.min(dt, 0.05); holder.getWorldPosition(wp); holder.getWorldQuaternion(wq2).invert(); grav.set(0, -1, 0).applyQuaternion(wq2);
    if (first) { pp.copy(wp); pv.set(0, 0, 0); first = false; }
    acc.copy(wp).sub(pp).multiplyScalar(1 / dt); const ax = (acc.x - pv.x) / dt, ay = (acc.y - pv.y) / dt, az = (acc.z - pv.z) / dt; pv.copy(acc); pp.copy(wp); acc.set(ax, ay, az).applyQuaternion(wq2);   /* how hard her head just moved, in the tongue's own directions */
    const steps = dt > 0.02 ? 2 : 1, h = dt / steps, kick = Math.max(-60, Math.min(60, -acc.x * 2.2)), kickY = Math.max(-60, Math.min(60, -acc.y * 2.2));
    for (let s = 0; s < steps; s++) { for (const k in K) { vl[k] += ((tg[k] - st[k]) * K[k][0] - vl[k] * K[k][1]) * h; st[k] += vl[k] * h; }
      sway.vx += (kick - sway.x * 150 - sway.vx * 8) * h; sway.x = Math.max(-0.7, Math.min(0.7, sway.x + sway.vx * h)); sway.vy += (kickY - sway.y * 150 - sway.vy * 8) * h; sway.y = Math.max(-0.7, Math.min(0.7, sway.y + sway.vy * h)); }
    build();
  }
  return { set, update, snap, mesh, holder, found: pts.length, state: st };
}
