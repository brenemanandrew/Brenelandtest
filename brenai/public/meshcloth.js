// Mesh cloth: ripples, folds and flutter on top of bone cloth (bonecloth.js), the way VaM's cloth moves, with Brenai's own outfits.
// Bone cloth turns a skirt's dozen bone strips, so the hem bends in a dozen straight panels. Here the skirt's own vertices are grouped
// into particles about 2 to 3 cm apart, tied to their neighbours (stretch) and to the ones two steps away (bending), and simulated
// every frame (position-based dynamics, fixed 1/90 s steps). Each particle is pulled toward where skinning and bone cloth put it,
// firmly at the waistband and only lightly at the hem, so the cut holds while the hem swings, folds and settles against her legs.
// The cloth is carried along with her body, so walking at a steady pace it hangs as cut. Inertia comes from changes in her movement:
// starting, stopping and turning leave the loose part of the skirt moving the old way for a moment, and it swings back.
// The ties' lengths are taken from where skinning and bone cloth put the skirt this frame, so the mesh cloth adds detail to bone cloth's
// drape (sitting, the skirt lies along her thighs) instead of pulling it back to the shape it had at load.
// Only the particles are worked on the CPU: their offsets (simulated minus skinned) go into a small float texture, and the garment's
// shader adds them to the vertices after skinning. Normals are not bent to match yet, so the ripples show in shape, not in shading.
//   const mc = meshCloth(THREE, vrm, boneCloth)   (null if there is no skirt, or it is switched off)
//   mc.tick(dt)      every frame, right after boneCloth's tick
//   mc.reset()       after a teleport or a camera cut (follows bone cloth's reset)
//   mc.settle(n)     n silent steps, for pictures
// Tuning without a deploy: window.WIZRA_CLOTH = { mesh: { off, max, iters, cell, hem, stiff, bend, drag, g, budget } }.
export function meshCloth(THREE, vrm, bone) {
  const T = (window.WIZRA_CLOTH || {}).mesh || {}; if (T.off || !bone || !bone.skirtBones || !bone.skirtBones.size) return null;
  const phone = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent), MAX = T.max ?? (phone ? 400 : 1500), ITERS = T.iters ?? (phone ? 4 : 8);
  const HEM = T.hem ?? 0.035, STIFF = T.stiff ?? 0.9, BEND = T.bend ?? 0.25, DRAG = T.drag ?? 0.985, G = T.g ?? 4.9, STEP = 1 / 90, LEGIN = T.legIn ?? 0.025, INERTIA = T.inertia ?? 0.85, DYN = !T.fixedRest, BUDGET = T.budget ?? (phone ? 4 : 3);
  vrm.scene.updateMatrixWorld(true);
  const V = () => new THREE.Vector3(), v = V(), w = V();
  // 1. the moving region: every vertex weighted to a skirt bone
  const meshes = [], verts = [];
  const notCloth = m => (Array.isArray(m.material) ? m.material : [m.material]).every(x => /SKIN|FACE|EYE|HAIR/i.test((x && x.name) || '') ) ;   /* her skin under the skirt is weighted to the skirt bones too (so it never shows through): it stays with bone cloth */
  vrm.scene.traverse(m => { if (!m.isSkinnedMesh || !m.geometry.attributes.skinIndex || notCloth(m)) return; const bones = m.skeleton.bones, on = new Set(); bones.forEach((b, k) => { if (bone.skirtBones.has(b)) on.add(k); }); if (!on.size) return;
    const g = m.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pos = g.attributes.position, mine = [];
    for (let i = 0; i < pos.count; i++) { let cw = 0; for (let k = 0; k < 4; k++) if (on.has(si.getComponent(i, k))) cw += sw.getComponent(i, k); if (cw < 0.05) continue; m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld); mine.push(verts.length); verts.push({ m, i, cw, x: v.x, y: v.y, z: v.z }); }
    if (mine.length) meshes.push({ m, mine }); });
  if (verts.length < 30) return null;
  // 2. particles: vertices in the same cell share one; the cell grows until the count fits the budget
  let cell = T.cell ?? 0.025, P = null, key = null;
  // cells are taken round her hips (angle and height), not in plain 3D: the layers of a garment at one spot (a coat over a skirt over
  // a petticoat) fall in the same cell and share one particle, so they move together and stay nested, as bone cloth keeps them
  const hp0 = V(); bone.hips.getWorldPosition(hp0); const R0 = T.r0 ?? 0.16;
  for (let tries = 0; tries < 12; tries++) { key = q => Math.floor(Math.atan2(q.x - hp0.x, q.z - hp0.z) * R0 / cell) + ',' + Math.floor(q.y / cell); P = new Map(); for (const q of verts) { const k = key(q); let c = P.get(k); if (!c) P.set(k, c = { x: 0, y: 0, z: 0, n: 0, cw: 0, vs: [] }); c.x += q.x; c.y += q.y; c.z += q.z; c.n++; c.cw += q.cw; c.vs.push(q); } if (P.size <= MAX) break; cell *= 1.15; }
  const parts = [...P.values()], N = parts.length;
  for (const c of parts) { c.x /= c.n; c.y /= c.n; c.z /= c.n; c.cw /= c.n; let best = null, bd = 1e9; for (const q of c.vs) { const d = (q.x - c.x) ** 2 + (q.y - c.y) ** 2 + (q.z - c.z) ** 2; if (d < bd) { bd = d; best = q; } } c.rep = best; }
  parts.forEach((c, k) => { c.k = k; for (const q of c.vs) q.p = k; });
  // pin: 1 at the waistband (and wherever the vertex is held mostly by the body), down to HEM at the hem
  const yTop = Math.max(...parts.map(c => c.y)), yBot = Math.min(...parts.map(c => c.y)), span = Math.max(0.05, yTop - yBot), sm = (a, b, x) => { x = Math.max(0, Math.min(1, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
  const pin = new Float32Array(N); for (const c of parts) { const h = (yTop - c.y) / span; pin[c.k] = Math.max(1 - c.cw, 1 - (1 - HEM) * sm(0.04, 0.6, h)); }
  // the back of the skirt (behind her hips) stays under her when she sits, as bone cloth does
  const hp = V(); bone.hips.getWorldPosition(hp); const back = new Uint8Array(N); for (const c of parts) back[c.k] = (c.x - hp.x) * bone.FWD.x + (c.z - hp.z) * bone.FWD.z < -0.03 ? 1 : 0;
  // 3. ties: particles that share a mesh edge (stretch), and two steps apart (bending)
  const nb = parts.map(() => new Set());
  for (const { m } of meshes) { const g = m.geometry, idx = g.index, map = new Map(); for (const q of verts) if (q.m === m) map.set(q.i, q.p); if (!idx) continue;
    for (let t = 0; t < idx.count; t += 3) { const a = map.get(idx.getX(t)), b = map.get(idx.getX(t + 1)), c = map.get(idx.getX(t + 2)); for (const [x, y] of [[a, b], [b, c], [c, a]]) if (x !== undefined && y !== undefined && x !== y) { nb[x].add(y); nb[y].add(x); } } }
  const rest = new Float32Array(N * 3); parts.forEach((c, k) => { rest[k * 3] = c.x; rest[k * 3 + 1] = c.y; rest[k * 3 + 2] = c.z; });
  const dist = (a, b) => Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2]);
  const S = [], B = []; for (let a = 0; a < N; a++) for (const b of nb[a]) if (a < b) S.push(a, b, dist(a, b));
  for (let a = 0; a < N; a++) { const two = new Set(); for (const b of nb[a]) for (const c of nb[b]) if (c > a && !nb[a].has(c)) two.add(c); for (const c of two) B.push(a, c, dist(a, c)); }
  // 4. each vertex follows its own particle and the two nearest neighbours of it, by distance
  const TW = 64, TH = Math.ceil(N / TW), data = new Float32Array(TW * TH * 4), tex = new THREE.DataTexture(data, TW, TH, THREE.RGBAFormat, THREE.FloatType); tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
  const uOn = { value: 1 };
  for (const { m, mine } of meshes) { const n = m.geometry.attributes.position.count, I = new Float32Array(n * 3), W = new Float32Array(n * 3);
    for (const vi of mine) { const q = verts[vi], c = parts[q.p], cand = [c.k, ...nb[c.k]].map(k => [k, Math.hypot(rest[k * 3] - q.x, rest[k * 3 + 1] - q.y, rest[k * 3 + 2] - q.z)]).sort((x, y) => x[1] - y[1]).slice(0, 3); let sum = 0; const ws = cand.map(([, d]) => 1 / (d + 0.006)); for (const x of ws) sum += x;
      cand.forEach(([k], j) => { I[q.i * 3 + j] = k; W[q.i * 3 + j] = Math.min(1, q.cw * 1.5) * ws[j] / sum; }); }
    m.geometry.setAttribute('mcI', new THREE.BufferAttribute(I, 3)); m.geometry.setAttribute('mcW', new THREE.BufferAttribute(W, 3));
    const uM = { value: new THREE.Matrix3() }; m.__mcM = uM;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) { if (!mat || mat.__mc) continue; mat.__mc = 1; const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
      mat.onBeforeCompile = (sh, r) => { if (prev) prev.call(mat, sh, r); sh.uniforms.mcTex = { value: tex }; sh.uniforms.mcM = uM; sh.uniforms.mcOn = uOn;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 mcI;\nattribute vec3 mcW;\nuniform highp sampler2D mcTex;\nuniform mat3 mcM;\nuniform float mcOn;\nvec3 mcOff(float i) { int k = int(i + 0.5); return texelFetch(mcTex, ivec2(k % ' + TW + ', k / ' + TW + '), 0).xyz; }')
          .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nif (mcOn > 0.5) transformed += mcM * (mcOff(mcI.x) * mcW.x + mcOff(mcI.y) * mcW.y + mcOff(mcI.z) * mcW.z);'); };
      mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + '|meshcloth'; mat.needsUpdate = true; } }
  // 5. the simulation
  const p = new Float32Array(N * 3), pv = new Float32Array(N * 3), tg = new Float32Array(N * 3), tg0 = new Float32Array(N * 3), tv = new Float32Array(N * 3), a = V(), was = V();
  const target = () => { for (const c of parts) { c.rep.m.getVertexPosition(c.rep.i, v).applyMatrix4(c.rep.m.matrixWorld); const k = c.k * 3; tg[k] = v.x; tg[k + 1] = v.y; tg[k + 2] = v.z; } };
  function reset() { first = true; }   /* the next tick starts the cloth at rest where the garment is then */
  const lastHip = V(); let first = true, acc = 0, slowFor = 0, ema = 0, dead = false;
  const hipA = V(), hipB = V(), sp = bone.hips.parent && vrm.humanoid.getRawBoneNode('spine');
  function step(h) {
    const caps = bone.caps(), seated = bone.seated(), maxH = (hipA.y - 0.22);
    for (let n = 0; n < N; n++) { const k = n * 3, pn = pin[n]; if (pn >= 0.999) { p[k] = tg[k]; p[k + 1] = tg[k + 1]; p[k + 2] = tg[k + 2]; pv[k] = p[k]; pv[k + 1] = p[k + 1]; pv[k + 2] = p[k + 2]; continue; }
      const vx = (p[k] - pv[k]) * DRAG, vy = (p[k + 1] - pv[k + 1]) * DRAG, vz = (p[k + 2] - pv[k + 2]) * DRAG; pv[k] = p[k]; pv[k + 1] = p[k + 1]; pv[k + 2] = p[k + 2];
      p[k] += vx; p[k + 1] += vy - G * (1 - pn) * h * h; p[k + 2] += vz; const pull = pn * pn * (1 - HEM) + HEM; p[k] += (tg[k] - p[k]) * pull; p[k + 1] += (tg[k + 1] - p[k + 1]) * pull; p[k + 2] += (tg[k + 2] - p[k + 2]) * pull; }
    for (let it = 0; it < ITERS; it++) {
      for (let s = 0; s < S.length; s += 3) { const i = S[s] * 3, j = S[s + 1] * 3, L = DYN ? Math.hypot(tg[j] - tg[i], tg[j + 1] - tg[i + 1], tg[j + 2] - tg[i + 2]) : S[s + 2], dx = p[j] - p[i], dy = p[j + 1] - p[i + 1], dz = p[j + 2] - p[i + 2], l = Math.hypot(dx, dy, dz) || 1e-6; let want = l;
        if (l > L * 1.02) want = L * 1.02; else if (l < L * 0.55) want = L * 0.55; if (want === l) continue;   /* cloth does not stretch, but it may gather to about half its width: that is where folds come from */
        const wi = 1 - pin[S[s]], wj = 1 - pin[S[s + 1]], ws = wi + wj; if (ws < 1e-4) continue; const f = STIFF * (l - want) / l / ws; p[i] += dx * f * wi; p[i + 1] += dy * f * wi; p[i + 2] += dz * f * wi; p[j] -= dx * f * wj; p[j + 1] -= dy * f * wj; p[j + 2] -= dz * f * wj; }
      for (let s = 0; s < B.length; s += 3) { const i = B[s] * 3, j = B[s + 1] * 3, L = DYN ? Math.hypot(tg[j] - tg[i], tg[j + 1] - tg[i + 1], tg[j + 2] - tg[i + 2]) : B[s + 2], dx = p[j] - p[i], dy = p[j + 1] - p[i + 1], dz = p[j + 2] - p[i + 2], l = Math.hypot(dx, dy, dz) || 1e-6; if (l > L * 0.8 && l < L * 1.02) continue;
        const want = l < L * 0.8 ? L * 0.8 : L * 1.02, wi = 1 - pin[B[s]], wj = 1 - pin[B[s + 1]], ws = wi + wj; if (ws < 1e-4) continue; const f = BEND * (l - want) / l / ws; p[i] += dx * f * wi; p[i + 1] += dy * f * wi; p[i + 2] += dz * f * wi; p[j] -= dx * f * wj; p[j + 1] -= dy * f * wj; p[j + 2] -= dz * f * wj; } }   /* bending: a soft limit on how far two particles two steps apart may close up, so the cloth curves instead of creasing flat */
    // collisions: her legs, the seat and furniture (bone cloth's own test), and her hips for the loose part of the skirt
    for (let n = 0; n < N; n++) { if (pin[n] >= 0.999) continue; const k = n * 3; a.set(p[k], p[k + 1], p[k + 2]); was.set(pv[k], pv[k + 1], pv[k + 2]);
      if (pin[n] < 0.7 && !seated) { w.copy(hipB).sub(hipA); const t = Math.max(0, Math.min(1, v.copy(a).sub(hipA).dot(w) / Math.max(1e-6, w.lengthSq()))); v.copy(hipA).addScaledVector(w, t); w.copy(a).sub(v); const l = w.length(), r = T.hipR ?? 0.1; if (l < r && l > 1e-5) a.addScaledVector(w, (r - l) / l); }
      if (!T.nocol) bone.collidePoint(a, was, !!back[n], maxH, LEGIN);   /* her legs a little slimmer than bone cloth's: its capsules are sized for a dozen strip points well out from her, these particles lie close against her */
      const dx = a.x - tg[k], dy = a.y - tg[k + 1], dz = a.z - tg[k + 2], d = Math.hypot(dx, dy, dz), LIM = 0.14; if (d > LIM) { a.set(tg[k] + dx * LIM / d, tg[k + 1] + dy * LIM / d, tg[k + 2] + dz * LIM / d); }   /* never more than 14 cm from where the garment's cut puts it */
      p[k] = a.x; p[k + 1] = a.y; p[k + 2] = a.z; } }
  function write() { for (let n = 0; n < N; n++) { const k = n * 3, o = n * 4; data[o] = p[k] - tg[k]; data[o + 1] = p[k + 1] - tg[k + 1]; data[o + 2] = p[k + 2] - tg[k + 2]; } tex.needsUpdate = true;
    for (const { m } of meshes) m.__mcM.value.setFromMatrix4(m.matrixWorld).invert(); }
  function tick(dt) { if (dead) return; const t0 = performance.now(); dt = Math.max(0, Math.min(0.1, dt || 1 / 60));
    bone.hips.getWorldPosition(hipA); if (sp) sp.getWorldPosition(hipB); else hipB.copy(hipA).y += 0.15; hipA.y -= 0.04;
    tg0.set(tg); target(); if (first || hipA.distanceTo(lastHip) > 0.35) { first = false; p.set(tg); pv.set(tg); tv.fill(0); acc = 0; }
    else { const toStep = dt > 0 ? STEP / dt : 0; for (let k = 0; k < N * 3; k++) { const d = tg[k] - tg0[k], dv = (d - tv[k]) * toStep * INERTIA * (1 - pin[(k / 3) | 0]); tv[k] = d; p[k] += d; pv[k] += d + Math.max(-0.01, Math.min(0.01, dv)); } }   /* the cloth moves with her; when her movement changes (she starts, stops or turns) it keeps its old speed for a moment and swings after her */
    lastHip.copy(hipA);   /* a cut or a teleport: start at rest there */
    acc += dt; let n = 0; while (acc >= STEP && n < 3) { step(STEP); acc -= STEP; n++; } if (n === 3) acc = 0;
    write(); const ms = performance.now() - t0; ema = ema ? ema * 0.9 + ms * 0.1 : ms;
    if (ema > BUDGET) { slowFor += dt; if (slowFor > 2) off('slow ' + ema.toFixed(1) + ' ms'); } else slowFor = 0; }
  function off(why) { if (dead) return; dead = true; uOn.value = 0; data.fill(0); tex.needsUpdate = true; dbg.offWhy = why; try { navigator.sendBeacon('/api/clientlog', JSON.stringify({ meshcloth: 'off', why, particles: N, phone, ua: navigator.userAgent })); } catch {} }
  function settle(n = 240) { const keep = dead; for (let i = 0; i < n; i++) { if (!i) { target(); } step(STEP); } write(); dead = keep; }
  const dbg = { particles: N, stretch: S.length / 3, bend: B.length / 3, verts: verts.length, meshes: meshes.length, cell: +cell.toFixed(3), iters: ITERS, max: MAX };
  // for tests: how far each particle is from where the cut puts it, and the hem particles
  const peek = () => { let mx = 0, sum = 0, nan = 0; for (let n = 0; n < N; n++) { const k = n * 3, d = Math.hypot(p[k] - tg[k], p[k + 1] - tg[k + 1], p[k + 2] - tg[k + 2]); if (!Number.isFinite(d)) nan++; else { mx = Math.max(mx, d); sum += d; } } return { max: mx, mean: sum / N, nan, ms: ema, dead }; };
  const speed = () => { let s = 0; for (let n = 0; n < N * 3; n += 3) s += Math.hypot(p[n] - pv[n], p[n + 1] - pv[n + 1], p[n + 2] - pv[n + 2]); return s / N; };
  const hemIdx = parts.filter(c => pin[c.k] < 0.2).map(c => c.k);
  const hemOffset = () => { let mx = 0; for (const n of hemIdx) { const k = n * 3; mx = Math.max(mx, Math.hypot(p[k] - tg[k], p[k + 1] - tg[k + 1], p[k + 2] - tg[k + 2])); } return mx; };
  const points = () => { const out = []; for (let n = 0; n < N; n++) out.push([p[n * 3], p[n * 3 + 1], p[n * 3 + 2], pin[n], back[n]]); return out; };
  // a push at a point (a tap on her skirt): particles within r move along dir, more the nearer and the looser they are
  function push(at, dir, r = 0.08) { for (let n = 0; n < N; n++) { const k = n * 3, d = Math.hypot(p[k] - at.x, p[k + 1] - at.y, p[k + 2] - at.z); if (d > r) continue; const f = (1 - d / r) * (1 - pin[n]); pv[k] -= dir.x * f; pv[k + 1] -= dir.y * f; pv[k + 2] -= dir.z * f; } }
  // tests: the particles furthest from where the cut puts them; and a sudden turn (the cloth's shape swung round her hips by a, as if she turned and it lagged)
  const worst = (n = 6) => { const o = []; for (let i = 0; i < N; i++) { const k = i * 3; o.push([Math.hypot(p[k] - tg[k], p[k + 1] - tg[k + 1], p[k + 2] - tg[k + 2]), +pin[i].toFixed(2), back[i], +(tg[k + 1] - hipA.y).toFixed(2), +(p[k] - tg[k]).toFixed(3), +(p[k + 1] - tg[k + 1]).toFixed(3), +(p[k + 2] - tg[k + 2]).toFixed(3), parts[i].rep.m.name]); } return o.sort((x, y) => y[0] - x[0]).slice(0, n); };
  function kick(ang) { const c = Math.cos(ang), sn = Math.sin(ang); for (let i = 0; i < N; i++) { const k = i * 3; for (const arr of [p, pv]) { const x = arr[k] - hipA.x, z = arr[k + 2] - hipA.z; arr[k] = hipA.x + x * c - z * sn; arr[k + 2] = hipA.z + x * sn + z * c; } } }
  const offsets = () => { const o = new Float32Array(N * 3); for (let k = 0; k < N * 3; k++) o[k] = p[k] - tg[k]; return { o, hemIdx }; };
  function stepFor(sec) { for (let i = 0; i < Math.round(sec / STEP); i++) step(STEP); write(); }   /* tests: advance the cloth by exact simulated time with her held where she is, whatever the frame rate */
  return { tick, reset, settle, off, push, kick, worst, offsets, stepFor, dbg, peek, speed, hemOffset, points, get on() { return !dead; } };
}
