// tg-board (tg-look): the one rendering path every simpler table game shares. A designed flat board drawn as art (a 2D canvas
// the game paints: the felt, the printed surface) with real 3D pieces on it, in one small WebGL view laid over the overlay's
// board and hand regions, plus picking and drag to play. The game only feeds it: what the board and the rack look like, where
// each piece sits and where a held piece may go. Docs: docs/refs/tg-blueprint/BLUEPRINT.md.
//
//   const tb = boardOf(frame.board)               // the overlay makes one (overlay.js); null where there is none (the editor)
//   tb.setBoard({ key, w, h, art(g, w, h), pieces, spots, hooks })   // the board: its art (redrawn when key or size changes),
//   tb.setRack({ key, art, pieces, hooks })                           // its pieces, the legal spots; the rack the same (null: none)
//   piece: { id, kind: 'domino' | 'engine' | <registered>, x, y (px in its region), rot, lean, size (px long), data, lift,
//            drag (may be picked up), from (a pose to slide in from: tb.lastPose(id) or { at, x, y, rot, size, down }), pop }
//   spot:  { id, x, y, rot, size, w, h, for: [piece ids it takes] }
//   hooks: { onTap(id), onLift(id), onDrop(id, spotId) -> true if sent, onReorder(id, index), onCancel(id), onLand(id), onHover(spotId) }
//   tb.press(pointerEvent, id)   from a piece's proxy button (the game's DOM over each piece, for taps, keys and screen readers)
//   tb.flight({ kind, data, from, to, dur })   a piece that only travels (a draw from the boneyard), gone when it lands
//
// The camera is an oblique orthographic one: the board plane maps exactly to CSS pixels (so the proxies and the art line up),
// and a piece's height shows up the screen (K), so you see its near side and its thickness. Rendered only when something moves.
import * as THREE from 'three';
import { createDominoLayer, inkMaterial, hullOf } from './domino-3d.js';
import { engineGeometry } from './engine-3d.js';
import { boardOf, setBoardOf } from './tg-state.js';
export { boardOf };

export const K = 0.58;            // how far up the screen a piece's height shows (the oblique)
const KINDS = new Map();
// a kind of piece: make(scene) -> { begin(), add(matrix, data, pose), end(inkPx), footprint(data) -> [w, l] (unit) , height }
export function registerKind(name, make) { KINDS.set(name, make); }

const _M = new THREE.Matrix4(), _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t = new THREE.Matrix4(), BASE = new THREE.Matrix4().makeRotationX(Math.PI / 2);
const ease = k => 1 - Math.pow(1 - k, 3), easeBack = k => { const c = 1.5; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const lerp = (a, b, k) => a + (b - a) * k;
const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const POSE = ['x', 'y', 'z', 'rot', 'lean', 'tx', 'ty', 'size', 'roll', 'sc'];
const pose0 = () => ({ x: 0, y: 0, z: 0, rot: 0, lean: 0, tx: 0, ty: 0, size: 40, roll: 0, sc: 1 });
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

// ---- the built-in kinds
registerKind('domino', scene => {
  const L = createDominoLayer(scene);
  return { begin: L.begin, add: (M, d, face) => L.add(M, d, face), end: px => L.end(px), footprint: () => [0.5, 1], height: 0.18, roll: true, dispose: L.dispose };
});
registerKind('engine', scene => {
  const ink = inkMaterial(), pool = new Map(), mats = new Map(); let hull = null, used = new Map();
  const matOf = c => { if (!mats.has(c)) mats.set(c, new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 40, specular: 0x262020 })); return mats.get(c); };
  return {
    begin() { used = new Map(); },
    add(M, d) {
      const c = d.color || '#e3aa45', list = pool.get(c) || (pool.set(c, []), pool.get(c)), i = used.get(c) || 0; used.set(c, i + 1);
      let e = list[i];
      if (!e) {
        const geo = engineGeometry(c); hull = hull || hullOf(geo);
        e = { body: new THREE.Mesh(geo, matOf(c)), line: new THREE.Mesh(hull, ink) };
        for (const m of [e.body, e.line]) { m.matrixAutoUpdate = false; m.frustumCulled = false; scene.add(m); }
        list.push(e);
      }
      e.body.matrix.copy(M); e.line.matrix.copy(M); e.body.visible = e.line.visible = true;
    },
    end(px) { for (const [c, list] of pool) list.forEach((e, i) => { if (i >= (used.get(c) || 0)) e.body.visible = e.line.visible = false; }); ink.userData.uOut.value = px; },
    footprint: () => [0.5, 1], height: 0.7, shear: 0.55, // (stood a little more toward you than the tiles: its side, wheels and chimney read)
    dispose() { for (const list of pool.values()) for (const e of list) { scene.remove(e.body); scene.remove(e.line); } },
  };
});

// soft contact shadows: one instanced quad per piece, fading and spreading as it lifts
function shadowLayer(scene) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color('#1a1030') } },
    vertexShader: 'attribute float aAlpha; varying float vA; varying vec2 vUv; void main() { vUv = uv; vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; varying float vA; varying vec2 vUv; void main() { vec2 q = abs(vUv - 0.5) * 2.0; float a = (1.0 - smoothstep(0.5, 1.0, q.x)) * (1.0 - smoothstep(0.5, 1.0, q.y)); gl_FragColor = vec4(uColor, a * vA); }',
  });
  let mesh = null, cap = 0, n = 0, alpha = null;
  const ensure = need => {
    if (mesh && cap >= need) return;
    if (mesh) { scene.remove(mesh); mesh.dispose(); }
    cap = Math.max(32, Math.ceil(need * 1.5)); alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', alpha);
    mesh = new THREE.InstancedMesh(geo, mat, cap); mesh.frustumCulled = false; mesh.renderOrder = -1; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh);
  };
  return {
    begin(need) { ensure(need); n = 0; },
    add(x, y, rot, w, l, z) {
      const lift = Math.max(0, z), sp = 1.12 + lift * 0.012;
      _t.makeRotationZ(-rot); _m.makeScale(w * sp, l * sp, 1); _t.multiply(_m); _t.setPosition(x + 1.5 + lift * 0.32, -(y + 2.5 + lift * 0.45), 0.05);
      mesh.setMatrixAt(n, _t); alpha.setX(n, 0.4 * Math.max(0.22, 1 - lift / 110)); n++;
    },
    end() { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; alpha.needsUpdate = true; },
  };
}

export function createTgBoard({ root, wrap, board, hand }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'tg-3d'; canvas.hidden = true; canvas.setAttribute('aria-hidden', 'true');
  root.append(canvas);
  const G = { board: null, rack: null };           // the latest specs per region
  const P = new Map();                              // id -> { spec, at, pose, tw, pop, land }
  const last = new Map();                           // id -> { pose, at, t } of pieces just gone (for a slide to carry on)
  const flights = [];
  let gl = null, scene, cam, sh, layers = new Map(), arts = {}, W = 0, H = 0, ox = 0, oy = 0, origin = { board: [0, 0], rack: [0, 0] }, layoutKey = '';
  let zoom = 1, zx = 0, zy = 0; // (the HUD is zoomed on big screens: everything here is in the overlay's own CSS px)
  let raf = 0, tPrev = 0, drag = null, renders = 0, frames = 0, lastDrawn = 0, hot = null;
  const stats = { renders: 0, frames: 0, drawCalls: 0, triangles: 0 };

  function ensureGL() {
    if (gl) return true;
    try { gl = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' }); } catch (e) { console.warn('[tg-board] no WebGL', e.message); gl = null; return false; }
    gl.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xfff6ea, 1.55));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.1); sun.position.set(-0.42, 0.62, 1); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.45); fill.position.set(0.6, -0.5, 0.6); scene.add(fill);
    cam = new THREE.OrthographicCamera(0, 1, 0, -1, 0.1, 1000); cam.position.set(0, 0, 500);
    sh = shadowLayer(scene);
    return true;
  }
  const layerOf = kind => { if (!layers.has(kind)) { const mk = KINDS.get(kind); if (!mk) return null; layers.set(kind, mk(scene)); } return layers.get(kind); };

  // ---- where everything is: the canvas over the board (and the rack), the regions' origins in it
  function measure() {
    const on = !!G.board || !!G.rack;
    if (!on) return false;
    const rs = [], zr = root.getBoundingClientRect();
    zoom = root.offsetWidth ? zr.width / root.offsetWidth : 1; zx = zr.left; zy = zr.top;
    const loc = r => (r && r.width ? { left: (r.left - zx) / zoom, top: (r.top - zy) / zoom, right: (r.right - zx) / zoom, bottom: (r.bottom - zy) / zoom, width: r.width / zoom, height: r.height / zoom } : null);
    const rb = G.board ? loc(board.getBoundingClientRect()) : null, rh = G.rack ? loc(hand.getBoundingClientRect()) : null;
    if (rb && rb.width) rs.push(rb); if (rh && rh.width) rs.push(rh);
    if (!rs.length) return false;
    const x0 = Math.floor(Math.min(...rs.map(r => r.left))), y0 = Math.floor(Math.min(...rs.map(r => r.top))) - 30;
    const x1 = Math.ceil(Math.max(...rs.map(r => r.right))), y1 = Math.ceil(Math.max(...rs.map(r => r.bottom)));
    const k = [x0, y0, x1, y1, zoom.toFixed(3), rb && [rb.left, rb.top, rb.width, rb.height].map(Math.round), rh && [rh.left, rh.top, rh.width, rh.height].map(Math.round)].join();
    if (k === layoutKey) return true;
    layoutKey = k; ox = x0; oy = y0; W = x1 - x0; H = y1 - y0;
    Object.assign(canvas.style, { left: ox + 'px', top: oy + 'px', width: W + 'px', height: H + 'px' });
    origin.board = rb ? [rb.left - ox, rb.top - oy] : [0, 0]; origin.rack = rh ? [rh.left - ox, rh.top - oy] : [0, 0];
    if (!ensureGL()) return false;
    gl.setPixelRatio(Math.min(2.5, (window.devicePixelRatio || 1) * zoom)); gl.setSize(W, H, false);
    cam.left = 0; cam.right = W; cam.top = 0; cam.bottom = -H; cam.updateProjectionMatrix();
    // the oblique: a point's height (world z) moves it up the screen by K per pixel
    cam.projectionMatrix.multiply(new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, K, 500 * K, 0, 0, 1, 0, 0, 0, 0, 1));
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    for (const a of Object.values(arts)) a.key = ''; // (redrawn at the new size)
    for (const p of P.values()) { p.tw = null; Object.assign(p.pose, target(p)); } // a resize snaps, never slides
    return true;
  }
  const toCanvas = (at, x, y) => [x + origin[at][0], y + origin[at][1]];

  // ---- the art: the game's 2D painting on a plane under the pieces
  function artPlane(at, spec, w, h) {
    let a = arts[at];
    if (!spec) { if (a) a.mesh.visible = false; return; }
    if (!a) {
      const c = document.createElement('canvas'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
      mesh.renderOrder = -2; scene.add(mesh);
      a = arts[at] = { c, tex, mesh, key: '' };
    }
    const dpr = Math.min(2.5, (window.devicePixelRatio || 1) * zoom), sc = Math.min(dpr, 2048 / Math.max(1, w), 2048 / Math.max(1, h));
    const k = spec.key + '|' + w + 'x' + h + '@' + sc;
    if (k !== a.key) {
      a.key = k;
      const cw = Math.max(2, Math.round(w * sc)), ch = Math.max(2, Math.round(h * sc));
      if (cw !== a.c.width || ch !== a.c.height) { a.c.width = cw; a.c.height = ch; a.tex.dispose(); a.tex = new THREE.CanvasTexture(a.c); a.tex.colorSpace = THREE.SRGBColorSpace; a.tex.anisotropy = 2; a.mesh.material.map = a.tex; a.mesh.material.needsUpdate = true; } // (a texture keeps its first size: a new one for a new size)
      const g = a.c.getContext('2d'); g.setTransform(sc, 0, 0, sc, 0, 0); g.clearRect(0, 0, w, h);
      try { spec.art(g, w, h); } catch (e) { console.error('[tg-board] art', e); }
      a.tex.needsUpdate = true;
    }
    const [x, y] = toCanvas(at, 0, 0);
    a.mesh.visible = true; a.mesh.position.set(x + w / 2, -(y + h / 2), 0); a.mesh.scale.set(w, h, 1);
  }

  // ---- the pieces: where each should be (its spec in canvas px), and the slide there
  function target(p) {
    const s = p.spec, [x, y] = toCanvas(p.at, s.x, s.y);
    return { x, y, z: s.lift || 0, rot: s.rot || 0, lean: s.lean || 0, tx: 0, ty: 0, size: s.size || 40, roll: s.down ? Math.PI : 0, sc: 1 };
  }
  function setGroup(at, spec) {
    G[at] = spec;
    const want = new Set();
    const t = performance.now() / 1000;
    if (spec) {
      if (!measure()) { /* not laid out yet */ }
      for (const s of spec.pieces || []) {
        want.add(s.id);
        let p = P.get(s.id);
        if (!p) {
          p = { spec: s, at, pose: pose0(), tw: null, popAt: 0 };
          P.set(s.id, p);
          const to = target(p), from = s.from ? fromPose(s.from) : null;
          if (from && !reduced()) { p.pose = from; p.tw = { from: { ...from }, to, t: 0, dur: s.dur || 0.34, arc: s.arc ?? Math.min(60, 10 + dist(from, to) * 0.12), land: true }; }
          else p.pose = { ...to };
          if (s.pop && !reduced()) p.popAt = t;
        } else {
          const was = target(p); p.spec = s; p.at = at; const to = target(p);
          if (!(drag && drag.moved && drag.id === s.id)) {
            if (p.drop) { /* held on its spot until it goes or comes back */ }
            else if (POSE.some(k => Math.abs((was[k] ?? 0) - (to[k] ?? 0)) > 0.01) && !reduced()) p.tw = { from: { ...p.pose }, to, t: 0, dur: 0.24, arc: 0 };
            else if (!p.tw) p.pose = { ...to };
          }
          if (s.pop && s.pop !== p.lastPop && !reduced()) p.popAt = t;
        }
        p.lastPop = s.pop;
      }
    }
    for (const [id, p] of P) if (p.at === at && !want.has(id)) { last.set(id, { pose: { ...p.pose }, at, t }); P.delete(id); if (drag && drag.id === id) endDrag(null, true); }
    for (const [id, l] of last) if (t - l.t > 3) last.delete(id);
    canvas.hidden = !G.board && !G.rack;
    root.classList.toggle('b3', !!G.board); root.classList.toggle('b3hand', !!G.rack);
    kick();
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function fromPose(f) {
    if (f.pose) return { ...f.pose };
    const [x, y] = toCanvas(f.at || 'board', f.x, f.y);
    return { ...pose0(), x, y, z: f.lift || 0, rot: f.rot || 0, size: f.size || 30, roll: f.down ? Math.PI : 0, sc: f.sc ?? 1 };
  }
  // a gone piece's last pose (to carry a slide on from where it was: your tile from the rack to the board)
  function lastPose(id) { const p = P.get(id); if (p) return { pose: { ...p.pose } }; const l = last.get(id); return l ? { pose: { ...l.pose } } : null; }

  // ---- drawing a frame
  function matOf(p, kind, out) {
    const q = p.pose, s = q.size * q.sc;
    out.makeTranslation(q.x, -q.y, q.z);
    if (q.tx || q.ty) { _r.makeRotationX(q.tx); out.multiply(_r); _r.makeRotationY(q.ty); out.multiply(_r); }
    _r.makeRotationZ(-q.rot); out.multiply(_r);
    if (q.lean) { _r.makeRotationX(q.lean); out.multiply(_r); }
    out.multiply(BASE);
    _r.makeScale(s, s, s); out.multiply(_r);
    if (q.roll && kind.roll) { const h = kind.height / 2; _t.makeTranslation(0, h, 0); out.multiply(_t); _r.makeRotationZ(q.roll); out.multiply(_r); _t.makeTranslation(0, -h, 0); out.multiply(_t); }
    if (kind.shear) { _t.set(1, 0, 0, 0, 0, 1, kind.shear, -kind.shear * q.z, 0, 0, 1, 0, 0, 0, 0, 1); out.premultiply(_t); }
    return out;
  }
  function draw() {
    if (!gl || canvas.hidden) return;
    if (G.board) artPlane('board', G.board.art ? G.board : null, G.board.w, G.board.h); else artPlane('board', null);
    if (G.rack) artPlane('rack', G.rack.art ? G.rack : null, G.rack.w, G.rack.h); else artPlane('rack', null);
    const all = [...P.values(), ...flights];
    for (const p of all) layerOf(p.spec.kind); // (a kind's layer is made the first time one shows, before its begin)
    for (const L of layers.values()) L.begin(all.length);
    sh.begin(all.length);
    let minSize = Infinity;
    for (const p of all) {
      const L = layerOf(p.spec.kind); if (!L) continue;
      const M = matOf(p, L, _M), down = p.pose.roll > Math.PI / 2 && Math.abs(p.pose.roll - Math.PI) < 0.01;
      L.add(M, p.spec.data || {}, !down, p.pose);
      const [fw, fl] = L.footprint(p.spec.data); const s = p.pose.size * p.pose.sc;
      if (!p.spec.noShadow) sh.add(p.pose.x, p.pose.y, p.pose.rot, fw * s * (p.pose.lean ? Math.cos(p.pose.lean) : 1), fl * s * (p.pose.lean ? Math.cos(p.pose.lean) * 0.9 : 1), p.pose.z);
      if (p.at === 'board') minSize = Math.min(minSize, s);
    }
    sh.end();
    const ref = Number.isFinite(minSize) ? minSize : 40;
    for (const L of layers.values()) L.end(1.5 / ref);
    gl.render(scene, cam);
    stats.renders++; stats.drawCalls = gl.info.render.calls; stats.triangles = gl.info.render.triangles; lastDrawn = all.length;
  }
  // one step of every slide, pop and the held piece; true while anything still moves
  function step(dt) {
    let busy = false;
    const t = performance.now() / 1000;
    for (const p of P.values()) {
      if (drag && drag.moved && drag.id === p.spec.id) { busy = true; continue; }
      if (p.tw) {
        busy = true; p.tw.t += dt; const k = Math.min(1, p.tw.t / p.tw.dur), e = p.tw.arc ? ease(k) : ease(k);
        for (const f of POSE) p.pose[f] = f === 'rot' ? angLerp(p.tw.from.rot, p.tw.to.rot, e) : lerp(p.tw.from[f], p.tw.to[f], e);
        if (p.tw.arc) p.pose.z += Math.sin(k * Math.PI) * p.tw.arc;
        if (k >= 1) { const land = p.tw.land; p.tw = null; p.pose = { ...target(p) }; if (land) emit(p, 'onLand'); }
      }
      if (p.popAt) {
        const k = (t - p.popAt) / 0.5;
        if (k >= 1) { p.popAt = 0; p.pose.sc = 1; } else { busy = true; p.pose.sc = k < 0.55 ? easeBack(k / 0.55) * 1.18 : lerp(1.18, 1, (k - 0.55) / 0.45); p.pose.z = Math.sin(Math.min(1, k * 1.6) * Math.PI) * p.pose.size * 0.5; }
      }
      if (p.drop) {
        busy = true;
        if (t - p.drop.t > 2.6) { p.drop = null; p.tw = { from: { ...p.pose }, to: target(p), t: 0, dur: 0.3, arc: 16 }; hooks(p.at).onCancel?.(p.spec.id); }
        else { const sp = p.drop.pose; for (const f of ['x', 'y', 'rot', 'size']) p.pose[f] = f === 'rot' ? angLerp(p.pose.rot, sp.rot, 0.35) : lerp(p.pose[f], sp[f], 0.35); p.pose.z = lerp(p.pose.z, 3, 0.3); p.pose.tx *= 0.7; p.pose.ty *= 0.7; p.pose.lean = lerp(p.pose.lean, 0, 0.35); }
      }
    }
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i]; busy = true; f.t += dt; const k = Math.min(1, f.t / f.dur), e = ease(k);
      for (const k2 of POSE) f.pose[k2] = k2 === 'rot' ? angLerp(f.from.rot, f.to.rot, e) : lerp(f.from[k2], f.to[k2], e);
      f.pose.z += Math.sin(k * Math.PI) * (f.arc ?? 30);
      if (k >= 1) { flights.splice(i, 1); f.done?.(); }
    }
    if (drag && drag.moved) busy = true;
    return busy;
  }
  function frame(now) {
    raf = 0;
    const t = now / 1000, dt = Math.min(0.05, tPrev ? t - tPrev : 1 / 60); tPrev = t;
    if (!measure()) return;
    const busy = step(dt); stats.frames++;
    draw();
    if (busy) raf = requestAnimationFrame(frame); else tPrev = 0;
  }
  function kick() { if (!raf && !canvas.hidden) raf = requestAnimationFrame(frame); }
  const hooks = at => (G[at] && G[at].hooks) || {};
  function emit(p, name, ...a) { try { hooks(p.at)[name]?.(p.spec.id, ...a); } catch (e) { console.error('[tg-board]', name, e); } }

  // ---- picking and drag: press on a piece's proxy; past a few pixels it lifts and follows the pointer in 3D, the legal spots
  // glow (the game lights them on onLift), dropped on one it snaps in, anywhere else it slides back; a short press is a tap
  function press(e, id) {
    const p = P.get(id); if (!p || (e.button != null && e.button > 0)) return;
    if (drag) endDrag(null, true);
    measure();
    const [cx, cy] = local(e);
    drag = { id, pid: e.pointerId, x0: cx, y0: cy, t0: performance.now(), moved: false, touch: e.pointerType === 'touch' || e.pointerType === 'pen', px: cx, py: cy, vx: 0, vy: 0, lastT: performance.now() };
    if (e.cancelable) e.preventDefault();
    addEventListener('pointermove', onMove, { passive: false }); addEventListener('pointerup', onUp); addEventListener('pointercancel', onCancelPtr);
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    if (e.cancelable) e.preventDefault();
    const now = performance.now(), dtm = Math.max(1, now - drag.lastT), [cx, cy] = local(e);
    drag.vx = lerp(drag.vx, (cx - drag.px) / dtm * 1000, 0.35); drag.vy = lerp(drag.vy, (cy - drag.py) / dtm * 1000, 0.35);
    drag.px = cx; drag.py = cy; drag.lastT = now;
    if (!drag.moved && Math.hypot(cx - drag.x0, cy - drag.y0) > 8) {
      drag.moved = true; const p = P.get(drag.id); if (!p) return endDrag(null, true);
      p.tw = null; p.drop = null; drag.size0 = p.pose.size; drag.rot0 = p.pose.rot;
      emit(p, 'onLift'); hooks(p.at).sound?.('lift');
    }
    if (drag.moved) { follow(); kick(); }
  }
  // the held piece: the board point under it (above a finger, so you can see it), lifted, tilting with the motion, turning to
  // fit the spot it is over and taking the board's size there
  function follow() {
    const p = P.get(drag.id); if (!p) return;
    const lift = drag.touch ? Math.max(30, drag.size0 * 0.75) : Math.max(8, drag.size0 * 0.2);
    const x = drag.px - ox, y = drag.py - oy - lift, z = Math.max(16, drag.size0 * 0.42);
    const spot = nearSpot(x, y);
    if ((spot && spot.id) !== (hot && hot.id)) { hot = spot; hooks('board').onHover?.(spot ? spot.id : null); if (spot) hooks(p.at).sound?.('hover'); }
    const k = 0.45;
    p.pose.x = lerp(p.pose.x, x, k); p.pose.y = lerp(p.pose.y, y, k); p.pose.z = lerp(p.pose.z, spot ? z * 0.7 : z, 0.3);
    const rot = spot ? spot.cRot : drag.rot0, size = spot ? spot.cSize : (inBoard(x, y) ? boardSize() : drag.size0);
    p.pose.rot = angLerp(p.pose.rot, rot, 0.3); p.pose.size = lerp(p.pose.size, size, 0.25); p.pose.lean = lerp(p.pose.lean, 0, 0.3);
    p.pose.tx = lerp(p.pose.tx, Math.max(-0.45, Math.min(0.45, drag.vy * 0.0006)), 0.3); p.pose.ty = lerp(p.pose.ty, Math.max(-0.45, Math.min(0.45, drag.vx * 0.0006)), 0.3);
    drag.spot = spot;
  }
  const inBoard = (x, y) => G.board && x >= origin.board[0] && y >= origin.board[1] && x <= origin.board[0] + G.board.w && y <= origin.board[1] + G.board.h;
  const boardSize = () => (G.board && G.board.tile) || drag.size0;
  function nearSpot(x, y) {
    const spots = (G.board && G.board.spots) || []; let best = null, bd = Infinity;
    for (const s of spots) {
      if (s.for && !s.for.includes(drag.id)) continue;
      const [cx, cy] = toCanvas('board', s.x, s.y), d = Math.hypot(cx - x, cy - y), r = Math.max(s.w || 30, s.h || 30) * 0.75 + 22;
      if (d < r && d < bd) { bd = d; best = { ...s, cx, cy, cRot: s.rot || 0, cSize: s.size || boardSize() }; }
    }
    return best;
  }
  function onUp(e) { if (!drag || e.pointerId !== drag.pid) return; [drag.px, drag.py] = local(e); endDrag(e, false); }
  const local = e => [(e.clientX - zx) / zoom, (e.clientY - zy) / zoom];
  function onCancelPtr(e) { if (!drag || e.pointerId !== drag.pid) return; endDrag(null, true); }
  function endDrag(e, cancel) {
    removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onCancelPtr);
    const d = drag; drag = null; if (hot) { hot = null; hooks('board').onHover?.(null); }
    if (!d) return;
    const p = P.get(d.id);
    if (!p) return;
    if (!d.moved) { if (!cancel) emit(p, 'onTap'); kick(); return; }
    const back = () => { p.tw = { from: { ...p.pose }, to: target(p), t: 0, dur: 0.32, arc: 14 }; hooks(p.at).sound?.('back'); };
    if (cancel) { back(); kick(); return; }
    if (d.spot) {
      let ok = false; try { ok = !!hooks('board').onDrop?.(d.id, d.spot.id); } catch (err) { console.error('[tg-board] drop', err); }
      if (ok) { p.drop = { t: performance.now() / 1000, pose: { x: d.spot.cx, y: d.spot.cy, rot: d.spot.cRot, size: d.spot.cSize } }; kick(); return; }
    }
    // let go over the rack: it takes that place in your order
    const x = d.px - ox, y = d.py - oy;
    if (G.rack && x >= origin.rack[0] && x <= origin.rack[0] + G.rack.w && y >= origin.rack[1] - 20 && y <= origin.rack[1] + G.rack.h + 20 && hooks(p.at).onReorder) {
      const xs = (G.rack.pieces || []).filter(s => s.id !== d.id).map(s => s.x + origin.rack[0]);
      emit(p, 'onReorder', xs.filter(v => v < x).length);
    }
    emit(p, 'onCancel'); back(); kick();
  }

  // a piece that only travels (a face-down tile from the boneyard to a hand), gone when it lands
  function flight({ kind = 'domino', data = {}, from, to, dur = 0.5, arc = 30, done }) {
    if (reduced() || !gl) { done?.(); return; }
    const f = { spec: { kind, data, id: 'fly' }, at: 'board', from: fromPose(from), to: fromPose(to), t: 0, dur, arc, done };
    f.pose = { ...f.from }; flights.push(f); kick();
  }

  // the tests and the BLUEPRINT's checks: draw now and look at the pixels in a rect (canvas px)
  function probe(rect) {
    if (!gl || canvas.hidden) return null;
    measure(); step(0); draw();
    const c = gl.getContext(), dpr = gl.getPixelRatio();
    const r = rect || { x: 0, y: 0, w: W, h: H };
    const x = Math.max(0, Math.round(r.x * dpr)), y = Math.max(0, Math.round((H - r.y - r.h) * dpr)), w = Math.max(1, Math.round(r.w * dpr)), h = Math.max(1, Math.round(r.h * dpr));
    const buf = new Uint8Array(w * h * 4); c.readPixels(x, y, w, h, c.RGBA, c.UNSIGNED_BYTE, buf);
    let opaque = 0, sum = 0, sum2 = 0, lo = 255, hi = 0; const cols = new Set();
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] < 200) continue;
      opaque++; const L = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]; sum += L; sum2 += L * L; lo = Math.min(lo, L); hi = Math.max(hi, L);
      if (cols.size < 400) cols.add((buf[i] >> 4) * 256 + (buf[i + 1] >> 4) * 16 + (buf[i + 2] >> 4));
    }
    const n = Math.max(1, opaque), mean = sum / n;
    return { opaque: opaque / (w * h), mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), lo, hi, colors: cols.size };
  }
  const api = {
    canvas, press, flight, lastPose, setBoard: s => setGroup('board', s), setRack: s => setGroup('rack', s), kick,
    get stats() { return { ...stats, pieces: P.size, drawn: lastDrawn, idle: !raf, gl: !!gl }; },
    get dragging() { return drag && drag.moved ? drag.id : null; },
    origin: at => origin[at], toCanvas, probe,
    get layout() { return { ox, oy, W, H, origin: { ...origin }, board: G.board && [G.board.w, G.board.h], rack: G.rack && [G.rack.w, G.rack.h] }; },
    pieceAt: id => { const p = P.get(id); return p ? { ...p.pose, at: p.at, moving: !!(p.tw || p.drop || p.popAt) } : null; },
    pieces: () => [...P.keys()],
    flush() { if (!measure()) return; for (let i = 0; i < 60 && step(1 / 30); i++); draw(); },
    hide() { setGroup('board', null); setGroup('rack', null); },
    // the view goes when the overlay closes (its context is given back; the next game makes a new one)
    dispose() { this.hide(); for (const L of layers.values()) L.dispose?.(); layers.clear(); if (gl) { gl.dispose(); gl.forceContextLoss?.(); } gl = null; arts = {}; layoutKey = ''; },
  };
  setBoardOf(board, api); setBoardOf(hand, api);
  return api;
}
