// Occlusion culling (perf-pass-3, 2026-11-10). From Maple Row at the evening rush half of what three draws is hidden behind the
// houses, the woods and the hills: the water tower's bits, the unicorns' lawn, the scout camp, the far side of the game store
// (306 of 572 draw calls changed no pixel). Three only culls by the view's frustum, so each of those meshes still cost a draw
// in the colour pass and another in the ink's normal pass.
//
// How (WebGL2 occlusion queries, nothing drawn that you can see):
//   The scene's small meshes (under MAX_R across: not the town's big batches, not the sky or anything drawn unculled) are
//   tested one by one (a person or a car as one: all its meshes together). Once the colour pass has drawn
//   every opaque thing, each cluster in view gets its box tested against that depth (the box drawn with colour and depth
//   writes off, inside an ANY_SAMPLES_PASSED_CONSERVATIVE query): no sample passes, nothing of it can show. The answer comes
//   back a frame or two later. While it says hidden, still holds, the cluster's meshes are left out of the colour and normal
//   passes (they are shown round the shadow maps: every shadow stays). Tested against opaque depth only (the queries go in
//   just before the first see-through thing draws), so glass, ghosts and fades never hide what is behind them.
//   An answer holds only while the camera stays within `tol` of where it was asked, and every member stays inside the box
//   that was tested. The box is grown for the camera's speed: what an occluder at least Z_MIN m away can uncover while the
//   camera moves `tol` (parallax), so walking and turning never shows a hole; anything new in view is drawn the frame it
//   arrives (no answer yet = drawn). Standing still the boxes are tight; moving fast only deeply hidden things are skipped.
//
//   createOcclusion({ renderer, scene, camera, ink, player }): it installs itself round the ink pass's hooks on the first frame drawn.
//   occ.api: { clusters, hidden, queries, ... } (tests). PERF.occlusion = false turns it off (perf-flags.js).
import * as THREE from 'three';
import { PERF, frameHooks } from './perf-flags.js';
import { LAYER_WORLD, LAYER_SOFT } from './toon.js';

const MAX_R = 25;          // m: a mesh this big (its bounding sphere's radius) is never culled here (the town's batches, the woods' wholes)
const RESCAN = 6;          // seconds between listings of the scene's meshes
const WALK = 900;          // objects walked a frame while listing
const E0 = 0.2;            // m the box always grows by (bounds that lag a pose, depth precision)
const Z_MIN = 6;           // m: occluders nearer the camera than this (or than your body, the nearest thing in a follow view) are not
                           // counted on to hold an answer while the camera moves
const TOL0 = 0.04;         // m the camera may drift and an answer still hold, standing
const TOL_FRAMES = 3;      // frames of the camera's present speed an answer must survive
const VIS_EVERY = 4;       // a cluster seen as visible is asked again every few frames (a hidden one every frame)
const MAX_AGE = 250;       // ms an answer is used at most (a hidden cluster is asked again every frame: in play its answers are 1-3 frames old)
const NEAR = 1.5;          // m: a box the camera is this close to is drawn, not tested
const VIEW_MASK = (1 << LAYER_WORLD) | (1 << LAYER_SOFT);

const VS = '#version 300 es\nin vec3 p;\nuniform mat4 m;\nvoid main() { gl_Position = m * vec4(p, 1.0); }';
const FS = '#version 300 es\nprecision lowp float;\nout vec4 o;\nvoid main() { o = vec4(1.0); }';

export function createOcclusion({ renderer, scene, camera, ink, player }) {
  const gl = renderer.getContext();
  const ok = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  const clusters = new Map();    // key -> cluster
  const list = [];               // the clusters, for the frame loops
  const hidden = [];
  let nH = 0, lastN = 0, frame = 0, now = 0, armed = false, installed = false;
  const stats = { queries: 0, results: 0, hiddenClusters: 0, issued: 'none', ms: 0 };
  const cam = new THREE.Vector3(), lastCam = new THREE.Vector3();
  let speed = 0;                 // m a frame, a decaying peak
  const frustum = new THREE.Frustum(), _vp = new THREE.Matrix4(), _box = new THREE.Box3(), _s = new THREE.Sphere();
  const vp = new Float32Array(16), mvp = new Float32Array(16), _pp = new THREE.Vector3();

  // ---------------------------------------------------------------- the query box's program and cube
  let prog = null, loc = null, vao = null;
  function glInit() {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, 'p');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { prog = null; return false; }
    loc = gl.getUniformLocation(prog, 'm');
    const prevVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2]), gl.STATIC_DRAW);
    gl.bindVertexArray(prevVao);
    return true;
  }

  // ---------------------------------------------------------------- listing the meshes into clusters
  const MOVERS = new Set(['cars', 'npcs', 'remotes']);
  function featureOf(o) {
    let q = o, top = null;
    while (q && q.parent) { if (q.parent === scene) { top = q; break; } q = q.parent; }
    if (!top) return null;
    if (top.name === 'world' || MOVERS.has(top.name)) { let w = o; while (w.parent && w.parent !== top) w = w.parent; return w; } // (one deeper: the world's parts; each car, each person)
    return top;
  }
  const isMover = f => f.parent !== scene ? MOVERS.has(f.parent.name) : f.matrixAutoUpdate && !f.isMesh && (f.userData.rigidRoot || f.children.some(c => c.isSkinnedMesh || c.userData.rigid));
  // a mesh's world bounding sphere as three culls it (an instanced or skinned mesh's own, else its geometry's); a skinned mesh's
  // is grown a little (three works it out once, from one pose)
  const worldR = o => {
    let bs;
    if (o.isInstancedMesh || o.isSkinnedMesh) { if (o.boundingSphere === null) o.computeBoundingSphere(); bs = o.boundingSphere; }
    else { const g = o.geometry; if (g.boundingSphere === null) g.computeBoundingSphere(); bs = g.boundingSphere; }
    if (!bs) return null;
    _s.copy(bs).applyMatrix4(o.matrixWorld);
    if (o.isSkinnedMesh) _s.radius += 0.3;
    return _s;
  };
  // a mesh's world box, tight: its geometry's (an instanced mesh's own) box carried through its matrix as a centre and half sizes
  // (_c, _h); a skinned mesh's from its grown sphere
  const _c = new THREE.Vector3(), _h = new THREE.Vector3();
  function worldBox(o) {
    if (o.isSkinnedMesh) { const s = worldR(o); if (!s) return false; _c.copy(s.center); _h.setScalar(s.radius); return true; }
    let b;
    if (o.isInstancedMesh) { if (o.boundingBox === null) o.computeBoundingBox(); b = o.boundingBox; }
    else { const g = o.geometry; if (g.boundingBox === null) g.computeBoundingBox(); b = g.boundingBox; }
    if (!b || b.isEmpty()) return false;
    const e = o.matrixWorld.elements;
    const lx = (b.min.x + b.max.x) / 2, ly = (b.min.y + b.max.y) / 2, lz = (b.min.z + b.max.z) / 2;
    const hx = (b.max.x - b.min.x) / 2, hy = (b.max.y - b.min.y) / 2, hz = (b.max.z - b.min.z) / 2;
    _c.set(e[0] * lx + e[4] * ly + e[8] * lz + e[12], e[1] * lx + e[5] * ly + e[9] * lz + e[13], e[2] * lx + e[6] * ly + e[10] * lz + e[14]);
    _h.set(Math.abs(e[0]) * hx + Math.abs(e[4]) * hy + Math.abs(e[8]) * hz, Math.abs(e[1]) * hx + Math.abs(e[5]) * hy + Math.abs(e[9]) * hz, Math.abs(e[2]) * hx + Math.abs(e[6]) * hy + Math.abs(e[10]) * hz);
    return true;
  }
  let walkStack = null, found = null, skip = null, scanAt = 0;
  function eligible(o) {
    if (!o.isMesh || o.frustumCulled === false || !(o.layers.mask & VIEW_MASK) || o.userData.fadeGhost === true || o.userData.noOcclusion) return false;
    const g = o.geometry;
    if (!g || !g.attributes.position) return false;
    return true;
  }
  function scan() {
    if (!walkStack) { walkStack = [scene]; found = []; skip = new Set([player?.character?.root, scene.getObjectByName('shadow-proxies')].filter(Boolean)); }
    for (let k = 0; k < WALK && walkStack.length; k++) {
      const o = walkStack.pop();
      if (skip.has(o) || o.isLight || o.isCamera) continue;
      const ch = o.children;
      for (let i = 0; i < ch.length; i++) walkStack.push(ch[i]);
      if (eligible(o)) found.push(o);
    }
    if (walkStack.length) return false;
    // group them
    for (const c of list) c.members.length = 0;
    for (const o of found) {
      o.updateWorldMatrix(true, false);
      const s = worldR(o);
      if (!s || s.radius > MAX_R) continue;
      const f = featureOf(o);
      if (!f) continue;
      const key = isMover(f) ? 'm' + f.id : 'o' + o.id;
      let c = clusters.get(key);
      if (!c) { c = { key, id: clusters.size, members: [], q: null, pending: false, occ: false, inView: false, n: 0, cam: new THREE.Vector3(), tol: 0, at: 0, min: new THREE.Vector3(), max: new THREE.Vector3(), qmin: new THREE.Vector3(), qmax: new THREE.Vector3(), // (the answer in use)
          p: { cam: new THREE.Vector3(), tol: 0, min: new THREE.Vector3(), max: new THREE.Vector3() } }; // (the question asked)
        c.p.t = 0; clusters.set(key, c); }
      const chain = []; for (let p = o.parent; p && p !== scene; p = p.parent) chain.push(p);
      c.members.push({ o, chain, top: chain.length ? chain[chain.length - 1] : o });
    }
    list.length = 0;
    for (const [k, c] of clusters) { if (c.members.length) list.push(c); else { if (c.q) gl.deleteQuery(c.q); clusters.delete(k); } }
    walkStack = found = skip = null;
    return true;
  }

  // a member draws this frame: it, and every parent, shown, and still in the scene where it was listed
  function shows(m) {
    const o = m.o;
    if (!o.visible || !(o.layers.mask & VIEW_MASK)) return false;
    const ch = m.chain;
    if (ch.length ? o.parent !== ch[0] || m.top.parent !== scene : o.parent !== scene) return false;
    for (let i = 0; i < ch.length; i++) if (!ch[i].visible) return false;
    return true;
  }
  function boxOf(c) {
    let n = 0;
    const mn = c.min, mx = c.max;
    for (const m of c.members) {
      if (!shows(m)) { m.on = false; continue; }
      m.on = true;
      if (!worldBox(m.o)) { m.on = false; continue; }
      if (n === 0) { mn.set(_c.x - _h.x, _c.y - _h.y, _c.z - _h.z); mx.set(_c.x + _h.x, _c.y + _h.y, _c.z + _h.z); }
      else { mn.x = Math.min(mn.x, _c.x - _h.x); mn.y = Math.min(mn.y, _c.y - _h.y); mn.z = Math.min(mn.z, _c.z - _h.z); mx.x = Math.max(mx.x, _c.x + _h.x); mx.y = Math.max(mx.y, _c.y + _h.y); mx.z = Math.max(mx.z, _c.z + _h.z); }
      n++;
    }
    c.n = n;
    return n;
  }
  const holds = c => c.occ && now - c.at < MAX_AGE && cam.distanceTo(c.cam) <= c.tol &&
    c.min.x >= c.qmin.x && c.min.y >= c.qmin.y && c.min.z >= c.qmin.z && c.max.x <= c.qmax.x && c.max.y <= c.qmax.y && c.max.z <= c.qmax.z;

  // ---------------------------------------------------------------- each frame: before the passes, hide what holds hidden
  function before() {
    frame++;
    if (nH) show(); // (a frame whose passes did not finish)
    nH = 0; stats.hiddenClusters = 0;
    if (!ok || !PERF.occlusion || !prog) { armed = false; return; }
    const t0 = now = performance.now();
    if (walkStack || now / 1000 > scanAt) { if (scan()) scanAt = performance.now() / 1000 + RESCAN; }
    camera.getWorldPosition(cam);
    const d = cam.distanceTo(lastCam); lastCam.copy(cam);
    speed = Math.max(d < 20 ? d : 0, speed * 0.85);
    // the answers that came back
    for (const c of list) {
      if (!c.pending) continue;
      if (!gl.getQueryParameter(c.q, gl.QUERY_RESULT_AVAILABLE)) { if (now - c.p.t > 1000) { gl.deleteQuery(c.q); c.q = null; c.pending = false; c.occ = false; } continue; } // (an answer that never came: asked again)
      c.occ = gl.getQueryParameter(c.q, gl.QUERY_RESULT) === 0; c.pending = false; c.at = c.p.t; stats.results++;
      c.cam.copy(c.p.cam); c.tol = c.p.tol; c.qmin.copy(c.p.min); c.qmax.copy(c.p.max);
    }
    _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(_vp);
    for (const c of list) {
      if (!boxOf(c)) { c.inView = false; continue; }
      _box.min.copy(c.min); _box.max.copy(c.max);
      c.inView = frustum.intersectsBox(_box);
      if (!c.inView) { c.occ = false; continue; } // (an answer from before it left the view is not used: what stood in front may have moved)
      if (!holds(c)) continue;
      stats.hiddenClusters++;
      for (const m of c.members) if (m.on) { m.o.visible = false; hidden[nH++] = m.o; }
    }
    armed = true;
    stats.ms = performance.now() - t0;
  }
  const show = () => { for (let i = 0; i < nH; i++) hidden[i].visible = true; };
  const hide = () => { for (let i = 0; i < nH; i++) hidden[i].visible = false; };

  // ---------------------------------------------------------------- the queries: the boxes against the opaque depth
  function issue() {
    armed = false;
    if (!prog) return;
    const t0 = performance.now();
    const st = renderer.state;
    const prevVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
    st.useProgram(prog);
    st.setBlending(THREE.NoBlending); st.setCullFace(THREE.CullFaceNone); st.setPolygonOffset(false);
    st.buffers.depth.setTest(true); st.buffers.depth.setFunc(THREE.LessEqualDepth); st.buffers.depth.setMask(false);
    st.buffers.color.setMask(false); st.buffers.stencil.setTest(false);
    gl.bindVertexArray(vao);
    _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    vp.set(_vp.elements);
    const tol = Math.max(TOL0, speed * TOL_FRAMES);
    // the nearest occluder an answer is counted on: Z_MIN, or your body when the camera is nearer it (a follow camera pulled in)
    let zMin = Z_MIN;
    if (player?.character?.root?.visible) { player.character.root.getWorldPosition(_pp); _pp.y += 1; zMin = Math.max(1.2, Math.min(Z_MIN, cam.distanceTo(_pp) - 0.7)); }
    let n = 0;
    for (const c of list) {
      if (!c.inView || c.pending || c.n === 0) continue;
      if (!c.occ && (frame + c.id) % VIS_EVERY !== 0) continue;
      // the box's distance from the camera, then how much it grows: depth precision, the camera's drift over parallax
      const dx = Math.max(c.min.x - cam.x, 0, cam.x - c.max.x), dy = Math.max(c.min.y - cam.y, 0, cam.y - c.max.y), dz = Math.max(c.min.z - cam.z, 0, cam.z - c.max.z);
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const e = E0 + dist * 0.002 + tol + tol * Math.max(0, dist - zMin) / zMin;
      if (dist < e + NEAR) { c.occ = false; continue; }
      const P = c.p;
      P.min.set(c.min.x - e, c.min.y - e, c.min.z - e); P.max.set(c.max.x + e, c.max.y + e, c.max.z + e);
      const sx = (P.max.x - P.min.x) / 2, sy = (P.max.y - P.min.y) / 2, sz = (P.max.z - P.min.z) / 2;
      const cx = P.min.x + sx, cy = P.min.y + sy, cz = P.min.z + sz;
      // only a box wholly on the screen is asked about: the query sees only the part inside the view, and a turn of the camera
      // would bring the rest in untested
      let inside = true;
      for (const pl of frustum.planes) { const n = pl.normal; if (n.x * cx + n.y * cy + n.z * cz + pl.constant - (Math.abs(n.x) * sx + Math.abs(n.y) * sy + Math.abs(n.z) * sz) < 0) { inside = false; break; } }
      if (!inside) { c.occ = false; continue; }
      for (let i = 0; i < 4; i++) {
        mvp[i] = vp[i] * sx; mvp[4 + i] = vp[4 + i] * sy; mvp[8 + i] = vp[8 + i] * sz;
        mvp[12 + i] = vp[i] * cx + vp[4 + i] * cy + vp[8 + i] * cz + vp[12 + i];
      }
      gl.uniformMatrix4fv(loc, false, mvp);
      if (!c.q) c.q = gl.createQuery();
      gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, c.q);
      gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_BYTE, 0);
      gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE);
      c.pending = true; P.cam.copy(cam); P.tol = tol; P.t = performance.now();
      n++;
    }
    gl.bindVertexArray(prevVao);
    st.buffers.color.setMask(true); st.buffers.depth.setMask(true);
    stats.queries = n;
    stats.ms += performance.now() - t0;
  }

  function install() {
    if (installed || !ok || !ink) return;
    installed = true;
    if (!glInit()) return;
    const prevB = ink.beforePasses, prevA = ink.afterPasses;
    ink.beforePasses = (s, c) => { prevB?.(s, c); before(); };
    ink.afterPasses = (s, c) => {
      if (armed) { // no see-through thing drew this frame: the colour pass's depth (resolved into its texture) is all opaque
        const p = renderer.properties.get(ink.colorRT);
        if (p.__webglFramebuffer) { renderer.state.bindFramebuffer(gl.FRAMEBUFFER, p.__webglFramebuffer); issue(); stats.issued = 'after'; }
        armed = false;
      }
      show(); lastN = nH; nH = 0; prevA?.(s, c);
    };
    // the first see-through draw of the colour pass: every opaque thing is in the depth by then
    const rbd = renderer.renderBufferDirect;
    renderer.renderBufferDirect = function (cam2, sc, geo, mat, obj, group) {
      if (armed && mat.transparent && renderer.getRenderTarget() === ink.colorRT) { issue(); stats.issued = 'colour'; }
      return rbd.call(this, cam2, sc, geo, mat, obj, group);
    };
    // the shadow maps see everything
    const sm = renderer.shadowMap, prev = sm.render;
    sm.render = function (lights, s, c) { if (nH) show(); try { return prev.call(this, lights, s, c); } finally { if (nH) hide(); } };
  }

  // installed on the first frame drawn, after the features' first update: the game store's and the Tool Crib's culls
  // (game-store-cull.js) hook the passes there, and theirs run first, so what they hide is never asked about here
  frameHooks.push(() => { if (!installed) install(); });

  return {
    install,
    api: {
      get clusters() { return list.length; }, get hidden() { return lastN; }, lastHidden: () => hidden.slice(0, lastN), stats,
      get inView() { let n = 0; for (const c of list) if (c.inView) n++; return n; },
      list: () => list.map(c => ({ key: c.key, n: c.members.length, occ: c.occ, inView: c.inView, holds: holds(c) })),
    },
  };
}
