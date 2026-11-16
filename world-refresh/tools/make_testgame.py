"""Make a patched TEST copy of the Breneland client with the new world-refresh models swapped in.
Never touches breneland-live/ or the live game. Usage: python3 make_testgame.py OUTDIR
Swap 1 (trees): hand-placed oak, maple, birch, pine and palm (addTree in world-trees.js) use the converted Meshy models.
The old code tree is still built into a throwaway batcher first, so every random draw, the collider radius and TREE_LOG stay
exactly as before (nothing else in the world moves). Leaves are tinted with the same palette colour the old tree would use.
If a model fails to load, the old code tree is used (fallback)."""
import os, sys, shutil, json
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); import props_swap; WR = os.path.dirname(HERE); REPO = os.path.dirname(WR)
OUT = sys.argv[1]
if os.path.exists(OUT): shutil.rmtree(OUT)
shutil.copytree(os.path.join(REPO, 'breneland-live'), OUT)
shutil.copytree(os.path.join(HERE, 'vendor'), os.path.join(OUT, 'vendor/three/jsm'))
os.makedirs(os.path.join(OUT, 'models/refresh'), exist_ok=True)
TREES = []   # Andrew 2026-11-15: the Meshy trees lost to the game's own trees; keep the code trees (was oak, maple, birch, pine, palm)
for k in TREES:
    shutil.copy(os.path.join(WR, 'models/converted/vc', k + '.glb'), os.path.join(OUT, 'models/refresh', k + '.glb'))
p = os.path.join(OUT, 'js/world-trees.js'); s = open(p).read()
head = """import { GLTFLoader } from '../vendor/three/jsm/loaders/GLTFLoader.js';
// world-refresh test: new tree models (wood keeps its colours, leaves carry alpha < 0.75 and take the old tree's leaf colour)
const _tc = new THREE.Color();
const REFRESH = await (async () => {
  { const q = new URLSearchParams(location.search); if (q.has('oldtrees') || q.has('oldworld')) return {}; }
  const out = {}, ld = new GLTFLoader();
  for (const k of %s) {
    try {
      const gl = await ld.loadAsync('/models/refresh/' + k + '.glb'); let mesh = null; gl.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry, c = g.attributes.color, n = g.attributes.position.count;
      const split = want => { const keep = []; for (let i = 0; i < n; i += 3) { const leaf = c.itemSize === 4 && c.getW(i) < 0.75; if (leaf === want) keep.push(i); }
        if (!keep.length) return null; const ng = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'color']) { const a = g.attributes[name]; if (!a) continue; const sz = name === 'color' ? 3 : a.itemSize, arr = new Float32Array(keep.length * 3 * sz);
          keep.forEach((i, t) => { for (let v = 0; v < 3; v++) for (let q = 0; q < sz; q++) arr[(t * 3 + v) * sz + q] = a.getComponent(i + v, q); });
          if (name === 'color') for (let j = 0; j < arr.length; j += 3) { _tc.setRGB(arr[j], arr[j + 1], arr[j + 2], THREE.SRGBColorSpace); arr[j] = _tc.r; arr[j + 1] = _tc.g; arr[j + 2] = _tc.b; } // sRGB -> linear
          ng.setAttribute(name, new THREE.BufferAttribute(arr, sz)); }
        return ng; };
      out[k] = { wood: split(false), leaves: split(true) };
    } catch (e) { console.warn('refresh tree failed, using code tree', k, e); }
  }
  return out;
})();
"""
head = head.replace('%s', json.dumps(TREES))
s = s.replace("import { view } from './perf-flags.js';", "import { view } from './perf-flags.js';\n" + head, 1)
old = """  if (kind === 'pine') { addPine(b, x, y, z, s, rnd, parts); r = 0.35 * s; }
  else if (kind === 'palm') { addPalm(b, x, y, z, s, rnd, parts); r = 0.35; }
  else { addBroadleaf(b, x, y, z, kind, s, rnd, parts, opts.leaves); r = (kind === 'birch' ? 0.2 : 0.34) * s + 0.1; }"""
new = """  const NEW = REFRESH[kind], bb = NEW ? { add() { return this; } } : b; // new model: the old tree is built into a throwaway batcher
  let plan = null;
  if (kind === 'pine') { addPine(bb, x, y, z, s, rnd, parts); r = 0.35 * s; }
  else if (kind === 'palm') { addPalm(bb, x, y, z, s, rnd, parts); r = 0.35; }
  else { plan = addBroadleaf(bb, x, y, z, kind, s, rnd, parts, opts.leaves); r = (kind === 'birch' ? 0.2 : 0.34) * s + 0.1; }
  if (NEW) {
    const yaw = ((x * 12.9898 + z * 78.233) % 6.283), o = { x, y: y + 0.05, z, sx: s, sy: s, sz: s, ry: yaw }; // (yaw from the spot: no extra random draw)
    if (NEW.wood) b.add(NEW.wood, '#ffffff', o);
    if (NEW.leaves) { const pal = opts.leaves || (kind === 'maple' ? LEAF.autumn : kind === 'birch' ? LEAF.birch : LEAF.summer); b.add(NEW.leaves, pal[Math.abs(Math.round(x * 7 + z * 3)) % pal.length], o); }
  }"""
assert old in s, 'addTree changed upstream'
s = s.replace(old, new, 1)
open(p, 'w').write(s)

# ---- shared loader for the other refresh models (one module, top-level await, so builders can use them synchronously)
SWAP = ['flower_patch', 'hedge_bush', 'topiary_ball', 'raised_bed', 'lettuce', 'carrots', 'strawberries', 'tomatoes', 'pumpkins', 'sunflower', 'hedge_box', 'shore_rock', 'scarecrow', 'water_butt', 'watering_can', 'wheelbarrow', 'mailbox', 'picket_fence', 'potting_shed', 'fence_picket_0', 'fence_picket_1', 'fence_picket_2', 'fence_post', 'fence_rail']   # rose_arch: Meshy made a brown gate with doors, the garden's arch is white and open: redo first
TEXTURED = ['flower_patch', 'hedge_bush', 'topiary_ball', 'fern', 'mossy_rock', 'log', 'mushrooms', 'potting_shed', 'raised_bed', 'lettuce', 'carrots', 'strawberries', 'tomatoes', 'pumpkins', 'sunflower', 'hedge_box', 'shore_rock', 'scarecrow', 'water_butt', 'watering_can', 'wheelbarrow', 'mailbox', 'picket_fence']   # Andrew: textures crisper than the colour bake   # drawn with their painted texture (own mesh, one draw call): the vertex-colour bake smeared them (Andrew)
os.makedirs(os.path.join(OUT, 'models/refresh/tex'), exist_ok=True)
for k in TEXTURED: shutil.copy(os.path.join(WR, 'models/converted/tex', k + '.glb'), os.path.join(OUT, 'models/refresh/tex', k + '.glb'))
for k in SWAP: shutil.copy(next(q for q in [os.path.join(WR, 'models/converted/vc', k + '.glb'), os.path.join(WR, 'models/blender', k + '.glb')] if os.path.exists(q)), os.path.join(OUT, 'models/refresh', k + '.glb'))
open(os.path.join(OUT, 'js/refresh-models.js'), 'w').write("""// world-refresh test: converted Meshy models for the props that are swapped (see world-refresh/tools/make_testgame.py).
// ?oldworld (or ?oldtrees) turns every swap off; a model that fails to load leaves the old code-made prop in place.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/jsm/loaders/GLTFLoader.js';
const _c = new THREE.Color();
export const RM = {};
export const MUTE = { add() { return this; }, boxMinMax() { return this; } };
const q = new URLSearchParams(location.search);
if (!q.has('oldworld') && !q.has('oldtrees')) {
  const ld = new GLTFLoader();
  await Promise.all(%s.map(async k => {
    try { const gl = await ld.loadAsync('/models/refresh/' + k + '.glb'); let m = null; gl.scene.traverse(o => { if (o.isMesh && !m) m = o; });
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(), c = g.attributes.color;
      if (c && c.itemSize === 4) { const a = new Float32Array(c.count * 3); for (let i = 0; i < c.count; i++) { _c.setRGB(c.getX(i), c.getY(i), c.getZ(i), THREE.SRGBColorSpace); a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
      RM[k] = g;
    } catch (e) { console.warn('refresh model failed, keeping the code prop', k, e); }
  }));
}
export const RT = {};   // textured models (their own mesh, the painted texture kept)
if (!q.has('oldworld') && !q.has('oldtrees')) {
  const ld = new GLTFLoader(), { GRADIENT_3 } = await import('./toon.js');
  await Promise.all(TEXLIST.map(async k => { try { const gl = await ld.loadAsync('/models/refresh/tex/' + k + '.glb'); let m = null; gl.scene.traverse(o => { if (o.isMesh && !m) m = o; });
    RT[k] = new THREE.MeshToonMaterial({ map: m.material.map, gradientMap: GRADIENT_3, side: ['hedge_box', 'fern', 'sunflower', 'tomatoes', 'carrots', 'strawberries', 'lettuce', 'pumpkins'].includes(k) ? THREE.DoubleSide : THREE.FrontSide }); /* (leafy models: thin leaves have a back too) */ RT[k].userData.geo = m.geometry; RM[k] = RM[k] || m.geometry; } catch (e) { console.warn('refresh textured model failed', k, e); } }));
}
export const RP = {};   // props.json shapes, textured (props-static.js draws them instanced)
if (!q.has('oldworld') && !q.has('oldtrees')) {
  const ld = new GLTFLoader(), { GRADIENT_3 } = await import('./toon.js');
  await Promise.all(PROPLIST.map(async k => { try { const gl = await ld.loadAsync('/models/refresh/tex/prop_' + k + '.glb'); let m = null; gl.scene.traverse(o => { if (o.isMesh && !m) m = o; });
    RP[k] = { geo: m.geometry, mat: new THREE.MeshToonMaterial({ map: m.material.map, gradientMap: GRADIENT_3 }) }; } catch (e) { console.warn('refresh prop failed, keeping the colour version', k, e); } }));
}
const _rm = new THREE.Matrix4(), _rq = new THREE.Quaternion(), _rp = new THREE.Vector3(), _rs = new THREE.Vector3(), _ry = new THREE.Vector3(0, 1, 0);
export function rmesh(parent, k, x, y, z, { s = 1, ry = 0 } = {}) {
  if (!RT[k]) return null; const m = new THREE.Mesh(RT[k].userData.geo, RT[k]); m.position.set(x, y, z); m.rotation.y = ry; m.scale.setScalar(s);
  m.castShadow = m.receiveShadow = true; m.userData.noMerge = true; parent.add(m); return m;
}
// add a model to a batcher: x, y = ground under its centre, z; s or sx/sy/sz scale; ry yaw
export function rput(b, k, x, y, z, { s = 1, sx, sy, sz, ry = 0 } = {}) {
  if (RT[k] && b.addInst) { _rm.compose(_rp.set(x, y, z), _rq.setFromAxisAngle(_ry, ry), _rs.set(sx ?? s, sy ?? s, sz ?? s)); b.addInst(k, RT[k].userData.geo, RT[k], _rm); return; }
  if (RM[k]) b.add(RM[k], '#ffffff', { x, y, z, ry, sx: sx ?? s, sy: sy ?? s, sz: sz ?? s });
}
""".replace('%s', json.dumps(SWAP), 1).replace('TEXLIST', json.dumps(TEXTURED)).replace('PROPLIST', json.dumps(list(props_swap.SWAP))))
IMP = "import { RM, RT, MUTE, rput, rmesh } from './refresh-models.js';\n"
def patch(fn, pairs):
    p = os.path.join(OUT, 'js', fn); t = open(p).read()
    for a, b in pairs:
        assert t.count(a) == 1, (fn, a[:60], t.count(a)); t = t.replace(a, b, 1)
    open(p, 'w').write(IMP + t)
import re
g = open(os.path.join(OUT, 'js/garden-build.js')).read()
# beds: frame and soil, then the crops
pairs = [
 ("    b.add(GEO.box, crop === 'tilled' ? '#4e3220' : '#5a3c26',", "    const bb = RM.raised_bed ? MUTE : b, cb = RM[{ tomatoes: 'tomatoes', pumpkins: 'pumpkins', lettuce: 'lettuce', carrots: 'carrots', strawberries: 'strawberries' }[crop]] ? MUTE : b;\n    rput(b, 'raised_bed', bx, y - 0.03, bz);\n    bb.add(GEO.box, crop === 'tilled' ? '#4e3220' : '#5a3c26',"),
 ("    for (const s of [-1, 1]) { b.add(GEO.box, '#8a6240', { x: bx, y: y + 0.22, z: bz + s * 0.76", "    for (const s of [-1, 1]) { bb.add(GEO.box, '#8a6240', { x: bx, y: y + 0.22, z: bz + s * 0.76"),
 ("sz: 0.1 }); b.add(GEO.box, '#8a6240', { x: bx + s * 1.46", "sz: 0.1 }); bb.add(GEO.box, '#8a6240', { x: bx + s * 1.46"),
 ("    for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) b.add(GEO.box, '#6b4428'", "    for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) bb.add(GEO.box, '#6b4428'"),
]
t = g
for a, b2 in pairs: assert t.count(a) == 1, a[:50]; t = t.replace(a, b2, 1)
lines = t.split('\n')
for i, l in enumerate(lines):   # the crop lines inside the bed loop draw into cb
    if re.match(r"\s+if \(crop === '(lettuce|carrots|strawberries|tomatoes|pumpkins)'", l) or l.strip().startswith("if (crop === 'pumpkins') { for (const [ou, ov, s]"):
        lines[i] = l.replace('b.add(', 'cb.add(')
t = '\n'.join(lines)
crop_models = """    { const top0 = y + BED.top - 0.03;
      if (crop === 'lettuce') rput(b, 'lettuce', bx, top0, bz, { sx: 1.6, sz: 1.0 });
      if (crop === 'carrots') rput(b, 'carrots', bx, top0, bz, { sx: 1.55, sz: 1.0 });
      if (crop === 'strawberries') rput(b, 'strawberries', bx, top0, bz, { sx: 1.1, sz: 1.0 });
      if (crop === 'tomatoes') for (const du of [-0.9, 0, 0.9]) rput(b, 'tomatoes', bx + du, top0, bz + 0.1, { ry: du });
      if (crop === 'pumpkins') for (const du of [-0.7, 0.7]) rput(b, 'pumpkins', bx + du, top0, bz, { s: 0.9, ry: du * 2 }); }
    // a little plant label at each bed's aisle end, so the crop reads from the path"""
a = "    // a little plant label at each bed's aisle end, so the crop reads from the path"
assert t.count(a) == 1; t = t.replace(a, crop_models, 1)
# sunflowers
a = "  for (let i = 0; i < 8; i++) {\n    const u = -hw + 0.55 + (i % 2) * 0.25, v = -2.6 + i * 0.95, h = 1.7 + ((i * 7) % 5) * 0.18;"
assert t.count(a) == 1
t = t.replace(a, "  if (RM.sunflower) for (let i = 0; i < 8; i++) { const u = -hw + 0.55 + (i % 2) * 0.25, v = -2.6 + i * 0.95, h = 1.7 + ((i * 7) % 5) * 0.18, [x, z] = W(u, v); rput(b, 'sunflower', x, H(x, z) - 0.02, z, { s: h / 2.0, ry: Math.PI / 2 + (i % 3 - 1) * 0.3 }); }\n  else " + a.lstrip(), 1)
# rose arch: the posts' look and the arch go to the model, their colliders stay
a = "  for (const s of [-1, 1]) { put(GEO.box, '#f6f1e4', B.gate.u + s * 1.08, 1.1, hd, { sx: 0.16, sy: 2.2, sz: 0.16 }); disc(B.gate.u + s * 1.08, hd, 0.2); }"
assert t.count(a) == 1
t = t.replace(a, "  const ab = RM.rose_arch ? MUTE : b;\n  for (const s of [-1, 1]) { if (!RM.rose_arch) put(GEO.box, '#f6f1e4', B.gate.u + s * 1.08, 1.1, hd, { sx: 0.16, sy: 2.2, sz: 0.16 }); disc(B.gate.u + s * 1.08, hd, 0.2); }\n  { const [ax, az] = W(B.gate.u, hd); rput(b, 'rose_arch', ax, H(ax, az) - 0.02, az); }", 1)
lines = t.split('\n')
for i, l in enumerate(lines):
    if "new THREE.TorusGeometry(1.08, 0.07, 6, 16, Math.PI)" in l or ("for (let k = 0; k <= 12; k++) { const f = (k / 12) * Math.PI;" in l): lines[i] = l.replace('b.add(', 'ab.add(')
t = '\n'.join(lines)
# scarecrow, water butt + can, wheelbarrow: the section's code pieces go to a muted batcher (b is reassigned for the section, so
# put() follows), colliders stay, the model goes in at the same spot
def section(t, start, end, model_js):
    assert t.count(start) == 1 and t.count(end) >= 1, start[:40]
    i = t.index(start); j = t.index(end, i) + len(end)
    return t[:i] + "  { const __b = b; if (" + model_js[0] + ") b = MUTE;\n" + t[i:j] + "\n  b = __b; " + model_js[1] + " }" + t[j:]
t = section(t, "  { const [sx, sz] = W(PLAN.scarecrow.u, PLAN.scarecrow.v)", "colliders.push({ type: 'circle', x: sx, z: sz, r: 0.35 }); }",
  ("RM.scarecrow", "{ const [sx, sz] = W(PLAN.scarecrow.u, PLAN.scarecrow.v); rput(b, 'scarecrow', sx, H(sx, sz) - 0.02, sz, { ry: Math.PI / 2 }); }"))
t = section(t, "  { const p = PLAN.butt;", "put(GEO.box, '#3fa06a', c.u, 0.45, c.v, { sx: 0.03, sy: 0.12, sz: 0.2 }); }",
  ("RM.water_butt && RM.watering_can", "{ const [bx, bz] = W(PLAN.butt.u, PLAN.butt.v), [cx, cz] = W(PLAN.can.u, PLAN.can.v); rput(b, 'water_butt', bx, H(bx, bz) - 0.02, bz, { ry: -Math.PI / 2 }); rput(b, 'watering_can', cx, H(cx, cz) - 0.01, cz, { ry: 2.4 }); }"))
t = section(t, "  { const p = PLAN.barrow, yaw = -0.5", "    disc(p.u, p.v, 0.6); }",
  ("RM.wheelbarrow", "{ const [wx, wz] = W(PLAN.barrow.u, PLAN.barrow.v); rput(b, 'wheelbarrow', wx, H(wx, wz) - 0.02, wz, { ry: -0.5 + Math.PI / 2 }); }"))
# the garden's frame: the fence's pickets become the Meshy fence (2 m sections stretched to each open run, colliders kept),
# the shed's walls, roof, door and window the Meshy potting shed (its collider and the tools on its west wall kept)
a = "      const t = i / n; if (skip && t > skip[0] && t < skip[1]) continue;"
assert t.count(a) == 1; t = t.replace(a, a + "\n      if (RM.fence_picket_0) { const u = a[0] + (c[0] - a[0]) * t, v = a[1] + (c[1] - a[1]) * t, [fx, fz] = W(u, v), post = i % 8 === 0 || (skip && (Math.abs(t - skip[0]) < 0.5 / n || Math.abs(t - skip[1]) < 0.5 / n)); if (post) rput(b, 'fence_post', fx, H(fx, fz) - 0.02, fz, { sx: 0.85, sy: 0.6, sz: 0.85 }); else rput(b, 'fence_picket_' + (i % 3), fx, H(fx, fz) - 0.02, fz, { sx: 0.36, sy: 0.58, sz: 0.9, ry: yaw + Math.PI / 2 }); continue; }", 1)
a = "    const seg = (t0, t1) => { const u0 = a[0] + (c[0] - a[0]) * t0, v0 = a[1] + (c[1] - a[1]) * t0, u1 = a[0] + (c[0] - a[0]) * t1, v1 = a[1] + (c[1] - a[1]) * t1;\n      const l = Math.hypot(u1 - u0, v1 - v0); for (const y of [0.22, 0.52]) put("
assert t.count(a) == 1, 'fence seg'
t = t.replace(a, a.replace("for (const y of [0.22, 0.52]) put(", "if (RM.fence_rail) { for (const y of [0.22, 0.52]) { const [fx, fz] = W((u0 + u1) / 2, (v0 + v1) / 2); b.add(RM.fence_rail, '#ffffff', { x: fx, y: H(fx, fz) + y + 0.03, z: fz, sx: l, sy: 0.7, sz: 0.8, ry: yaw - Math.PI / 2 }); } } else for (const y of [0.22, 0.52]) put("), 1)
t = section(t, "    put(GEO.box, '#7aa6c8', s.u, 1.05, s.v, { sx: s.w, sy: 2.1, sz: s.d });", "    box(u0, u1, v0, v1);",
  ("RM.potting_shed || RT.potting_shed", "{ const s = PLAN.shed, [hx, hz] = W(s.u, s.v); if (!rmesh(group, 'potting_shed', hx, H(hx, hz) - 0.02, hz)) rput(b, 'potting_shed', hx, H(hx, hz) - 0.02, hz); }"))
# the garden's paths: soft, wobbly outlines that round off at the ends (with a faded margin into the grass) instead of hard boxes
a = "  const flat = (col, u0, u1, v0, v1, lift = 0.02) => put(GEO.box, toon(col, { polygonOffset: true }), (u0 + u1) / 2, lift, (v0 + v1) / 2, { sx: u1 - u0, sy: 0.04, sz: v1 - v0 });"
assert t.count(a) == 1, 'garden flat'
t = t.replace(a, """  let __pn = 0;
  const softGeo = (a, c, seed, grow) => { const sh = new THREE.Shape(), N = 72, n = 3.2;
    for (let i = 0; i < N; i++) { const th = i / N * TAU, ct = Math.cos(th), st = Math.sin(th);
      const ex = Math.sign(ct) * Math.pow(Math.abs(ct), 2 / n), ez = Math.sign(st) * Math.pow(Math.abs(st), 2 / n);
      const w = 0.07 * Math.sin(th * 3 + seed) + 0.05 * Math.sin(th * 7 + seed * 2.3) + 0.03 * Math.sin(th * 13 + seed * 0.7);
      const px = ex * (a + grow + w), pz = ez * (c + grow + w); if (i) sh.lineTo(px, pz); else sh.moveTo(px, pz); }
    const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); return g; };
  const flat = (col, u0, u1, v0, v1, lift = 0.02) => { const seed = 1.7 + (__pn++) * 2.9, a = (u1 - u0) / 2, c = (v1 - v0) / 2;
    const edge = '#' + new THREE.Color(col).lerp(new THREE.Color('#7f9c4e'), 0.45).getHexString();
    put(softGeo(a, c, seed + 0.4, 0.16), toon(edge, { polygonOffset: true }), (u0 + u1) / 2, lift - 0.004, (v0 + v1) / 2);
    put(softGeo(a, c, seed, 0), toon(col, { polygonOffset: true }), (u0 + u1) / 2, lift, (v0 + v1) / 2);
    for (let k = 0; k < 6; k++) { const th = seed * 5 + k * 1.9, r = 1.02 + 0.12 * Math.sin(k * 3.1 + seed);   // a few loose stones out past the edge
      put(GEO.cyl8, '#' + new THREE.Color(col).multiplyScalar(0.82).getHexString(), (u0 + u1) / 2 + Math.cos(th) * (a + 0.2) * r, lift + 0.01, (v0 + v1) / 2 + Math.sin(th) * (c + 0.2) * r, { sx: 0.07, sy: 0.02, sz: 0.05, ry: th }); } };""", 1)
open(os.path.join(OUT, 'js/garden-build.js'), 'w').write(IMP + t)
# hedges
patch('lawn.js', [("      b.add(GEO.box, col, { x, y: y + h / 2, z: zc, sx: L - 0.07, sy: h, sz: d });",
  "      if (RM.hedge_box) { rput(b, 'hedge_box', x, y + 0.02, zc, { sx: (L - 0.05) / 3.3, sy: h / 1.5, sz: d / 0.92, ry: 0 }); b.add(GEO.box, '#2f5a2b', { x, y: y + h * 0.42, z: zc, sx: L - 0.6, sy: h * 0.8, sz: d - 0.34 }); continue; }   // (a solid core: no fence seen through the gaps in the leaves)\n      b.add(GEO.box, col, { x, y: y + h / 2, z: zc, sx: L - 0.07, sy: h, sz: d });")])
# shore rocks
patch('world.js', [("    b.add(GEO.dodec, '#9a9b93', { x: r.x, y: y + 0.2 * r.s, z: r.z, sx: r.s, sy: r.s * 0.7, sz: r.s * 0.9, ry: r.x });\n    b.add(GEO.dodec, '#8a8b84', { x: x2, y: y2 + 0.06, z: z2, sx: r.s * 0.5, sy: r.s * 0.4, sz: r.s * 0.5, ry: r.z });",
  "    if (RM.shore_rock) { rput(b, 'shore_rock', r.x, y - 0.05, r.z, { s: r.s * 1.1, ry: r.x }); rput(b, 'shore_rock', x2, y2 - 0.03, z2, { s: r.s * 0.5, ry: r.z }); } else {\n    b.add(GEO.dodec, '#9a9b93', { x: r.x, y: y + 0.2 * r.s, z: r.z, sx: r.s, sy: r.s * 0.7, sz: r.s * 0.9, ry: r.x });\n    b.add(GEO.dodec, '#8a8b84', { x: x2, y: y2 + 0.06, z: z2, sx: r.s * 0.5, sy: r.s * 0.4, sz: r.s * 0.5, ry: r.z }); }"),
   # (the clock tower test placement removed: Andrew found it random there; it waits for a planned spot)
  ("function buildMailbox(b) {\n  const { x, z } = MAILBOX;\n  const y = terrainHeight(x, z);", "function buildMailbox(b) {\n  const { x, z } = MAILBOX;\n  const y = terrainHeight(x, z);\n  if (RM.mailbox) { rput(b, 'mailbox', x, y - 0.02, z, { ry: Math.PI / 2 }); return; }")])

# ---- the static props (props-static.js reads models/props.json): swap the good sheet 02/03 shapes
sys.path.insert(0, HERE); import props_swap
props_swap.run(os.path.join(REPO, 'breneland-live/models/props.json'), os.path.join(OUT, 'models/props.json'), os.path.join(OUT, 'models/refresh/tex'))
shutil.copy(os.path.join(REPO, 'breneland-live/models/props.json'), os.path.join(OUT, 'models/props-old.json'))   # ?oldworld uses the old shapes
p = os.path.join(OUT, 'js/props-static.js'); t = open(p).read(); a = "await fetch('/models/props.json')"
assert t.count(a) == 1; open(p, 'w').write(t.replace(a, "await fetch(new URLSearchParams(location.search).has('oldworld') ? '/models/props-old.json' : '/models/props.json')", 1))

# ---- Nala: her Meshy model bound to the code dog's rig (tools/nala-model.js)
shutil.copy(os.path.join(WR, 'models/characters/nala_mesh.glb'), os.path.join(OUT, 'models/refresh/nala_mesh.glb'))
shutil.copy(os.path.join(WR, 'models/characters/nala_meta.json'), os.path.join(OUT, 'models/refresh/nala_meta.json'))
for f in ['dax_mesh.glb', 'dax_meta.json']: shutil.copy(os.path.join(WR, 'models/characters', f), os.path.join(OUT, 'models/refresh', f))
shutil.copy(os.path.join(HERE, 'nala-model.js'), os.path.join(OUT, 'js/nala-model.js'))
p = os.path.join(OUT, 'js/dogs.js'); t = open(p).read()
a = "    shadows(this.root, true, false);\n    this.applyPose(1 / 60, 0);\n  }"
assert t.count(a) == 1
t = t.replace(a, a[:-4] + "\n    if (this.look.name === 'Nala') dressNala(this); else if (this.look.name === 'Dax') dressDog(this, 'dax');\n  }", 1)
open(p, 'w').write("import { dressNala, dressDog } from './nala-model.js';\n" + t)
p = os.path.join(OUT, 'js/npcs.js'); t = open(p).read(); a = "    ch.root.userData.npc = def;"
assert t.count(a) == 1   # the yard Nala is built here from her saved look (which may not carry her name)
open(p, 'w').write("import { dressNala, dressDog } from './nala-model.js';\n" + t.replace(a, a + "\n    if (def.id === 'nala' && def.kind === 'dog' && !ch.meshyNala) dressNala(ch);\n    if (def.id === 'dax' && def.kind === 'dog' && !ch.meshyNala) dressDog(ch, 'dax');", 1))

# textured models are drawn instanced: one draw call per model kind however many copies (batch.js addInst + build)
p = os.path.join(OUT, 'js/batch.js'); t = open(p).read()
a = "  build(parent, name = 'batch') {\n    const out = [];"
assert t.count(a) == 1
t = t.replace(a, """  addInst(key, geo, mat, matrix) { (this.inst ||= new Map()); if (!this.inst.has(key)) this.inst.set(key, { geo, mat, ms: [] }); this.inst.get(key).ms.push(matrix.clone()); return this; }
""" + a + """
    if (this.inst) { for (const [key, I] of this.inst) { const im = new THREE.InstancedMesh(I.geo, I.mat, I.ms.length); I.ms.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = this.castShadow; im.receiveShadow = this.receiveShadow; im.name = name + ':' + key; im.userData.noMerge = true; parent.add(im); out.push(im); } this.inst.clear(); }""", 1)
open(p, 'w').write(t)
p = os.path.join(OUT, 'js/props-static.js'); t = open(p).read()
a = "  _m.compose(_p, _q, _s);\n  for (const pname of Object.keys(S.parts)) {"
assert t.count(a) == 1, 'props-static compose'
t = t.replace(a, "  _m.compose(_p, _q, _s);\n  if (RP[shape] && b.addInst) { b.addInst('prop_' + shape, RP[shape].geo, RP[shape].mat, _m); skip = [...(skip || []), 'body']; }\n  for (const pname of Object.keys(S.parts)) {", 1)
open(p, 'w').write("import { RP } from './refresh-models.js';\n" + t)

# ---- the woods floor (world-trees.js buildUndergrowth): ferns, mossy rocks, fallen logs and mushrooms become the textured
# models, instanced per 48 m cell (each cell's meshes are still shown only near the camera); placement, colliders, random
# stream all unchanged. The code pieces that the models already include (log ends, moss caps, mushroom caps) are skipped.
p = os.path.join(OUT, 'js/world-trees.js'); t = open(p).read()
a = "  const place = (list, geo, color, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) => {\n"
assert t.count(a) == 1, 'undergrowth place'
t = t.replace(a, a + """    if (UG(list, geo, color, x, y, z, sx, sy, sz, ry, rx, rz)) return;
""", 1)
a = "  const mat = toon('#ffffff', { vertexColors: true, side: 'double' });\n  for (const c of cells.values()) {\n"
assert t.count(a) == 1, 'undergrowth build'
t = t.replace(a, a + """    for (const [key, ms] of Object.entries(mergeInst(c.ferns.inst, c.solid.inst))) {
      const im = new THREE.InstancedMesh(RT[key].userData.geo, RT[key], ms.length); ms.forEach((m4, i) => im.setMatrixAt(i, m4)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
      im.name = 'undergrowth ' + key + ' ' + c.key; im.castShadow = false; im.receiveShadow = true; im.visible = false; im.userData.noMerge = true; parent.add(im); c.meshes.push(im);
    }
""", 1)
helper = """
// world-refresh: the woods floor's models (instanced per cell)
import { RT } from './refresh-models.js';
const _um = new THREE.Matrix4(), _ue = new THREE.Euler(), _uq = new THREE.Quaternion(), _us = new THREE.Vector3(), _upv = new THREE.Vector3(), _ut = new THREE.Matrix4();
function mergeInst(a, b) { const o = {}; for (const src of [a || {}, b || {}]) for (const [k, v] of Object.entries(src)) o[k] = (o[k] || []).concat(v); return o; }
function UG(list, geo, color, x, y, z, sx, sy, sz, ry, rx, rz) {
  let key = null, S = null, lift = 0;
  if (geo === FERN && RT.fern) { key = 'fern'; S = [sx * 1.15, sy * 0.7, sz * 1.15]; }
  else if (geo === ROCK_GEO && RT.mossy_rock) { if (color === UC.moss) return true; key = 'mossy_rock'; S = [2 * sx / 1.5, 2 * sy / 1.21, 2 * sz / 1.5]; lift = -0.605; }
  else if (geo === LOG_GEO && RT.log) { key = 'log'; S = [sx / 2.5, 2 * sy / 0.5, 2 * sz / 0.6]; lift = -0.25; }
  else if (geo === LOG_END && RT.log) return true;
  else if (geo === STEM && RT.mushrooms) { key = 'mushrooms'; S = [sx * 0.6, sx * 0.6, sx * 0.6]; }
  else if (geo === CAP && RT.mushrooms) return true;
  if (!key) return false;
  _ue.set(rx, ry, rz, 'YXZ'); _uq.setFromEuler(_ue); _um.compose(_upv.set(x, y, z), _uq, _us.set(...S));
  if (lift) _um.multiply(_ut.makeTranslation(0, lift, 0));   // (the code shapes are centred, the models stand on their base)
  ((list.inst ||= {})[key] ||= []).push(_um.clone());
  return true;
}
"""
t = t.replace("const UC = {", helper + "const UC = {", 1)
a = "  function update(cam) {\n    if (!cam) return;"
assert t.count(a) == 1
t = t.replace(a, a + "\n    if (window.__cam) cam = { position: { x: window.__cam.p[0], y: window.__cam.p[1], z: window.__cam.p[2] } };   // (test hook: the pinned screenshot camera)", 1)
open(p, 'w').write(t)

# ---- accessories: Meshy hats, sunglasses and a satchel added to Peak Threads' catalogue (models/clothes.json + clothing-catalog.js)
import acc_swap
lines = acc_swap.run(os.path.join(REPO, 'breneland-live/models/clothes.json'), os.path.join(OUT, 'models/clothes.json'))
p = os.path.join(OUT, 'js/clothing-catalog.js'); t = open(p).read(); a = "  P('glasses-tortoise',"
assert t.count(a) == 1; t = t.replace(a, "\n".join(lines) + "\n" + a, 1)
a = "export const HAT_RIM = {"; assert t.count(a) == 1
t = t.replace(a, a + " " + " ".join(f"{k}: null," for k in acc_swap.RIM), 1)
t = t.replace("const BY_ID = new Map(", "for (const [k, like] of " + json.dumps(list(acc_swap.RIM.items())) + ") HAT_RIM[k] = HAT_RIM[like];\nconst BY_ID = new Map(", 1)
open(p, 'w').write(t)
shutil.copy(os.path.join(HERE, 'acc_test.html'), os.path.join(OUT, 'acc_test.html'))

# ---- people: a gentle, more natural proportion pass in bodyDims (longer legs and arms, a slightly smaller head on a longer
# neck, a little more taper), every other system reads these numbers so clothes, hats, seats and IK follow; ?oldbody = as before
p = os.path.join(OUT, 'js/human.js'); t = open(p).read()
a = "  D.hipX *= S.hipXK; D.armR *= S.armK; D.neckR *= S.neckK;\n  return D;"
assert t.count(a) == 1
t = t.replace(a, "  D.hipX *= S.hipXK; D.armR *= S.armK; D.neckR *= S.neckK;\n  if (NAT) { D.legLen *= 1.1; D.Lr = D.legLen - D.a0; D.Lt = D.Lr * 0.53; D.Ls = D.Lr * 0.47; D.Lu *= 1.07; D.Lf *= 1.07; D.neckY *= 1.18; D.wT *= 1.04; D.legR *= 0.94; D.armR *= 0.94; }\n  return D;", 1)
a = "    if (o.headSize !== undefined && o.headSize !== 1) { headC.scale.setScalar(o.headSize); headC.position.y = D.headY * o.headSize; }"
assert t.count(a) == 1
t = t.replace(a, "    { const hs = o.headSize ?? (NAT && !this.kidK ? 0.86 : 1); if (hs !== 1) { headC.scale.setScalar(hs); headC.position.y = D.headY * hs; } }", 1)
open(p, 'w').write("const NAT = typeof location === 'undefined' || !new URLSearchParams(location.search).has('oldbody');   // (world-refresh: natural proportions)\n" + t)

# ---- terrain: gentle landscaping in the open land (Andrew: Breneland is mostly flat; the real world is not). Big soft knolls and
# dips (about +-1.3 m over 50-90 m) plus a smaller roll, faded out near the water; town, house pad, garden, game spots and every
# flat zone are applied AFTER this in terrainHeight, so they stay exactly as flat as before. ?flatworld = the old ground.
p = os.path.join(OUT, 'js/terrain.js'); t = open(p).read()
a = "  let land = 0.42 + fbm(x * 0.035, z * 0.035) * 0.32;\n"
assert t.count(a) == 1
t = t.replace(a, a + "  if (HMAP) land += hmapAt(x, z) * smoothstep(-6, -22, s) * smoothstep(26, 40, Math.hypot(x + 64, z - 20)) * reliefRoom(x, z);   // the Blender-shaped land (raise only: things under the old ground stay hidden)\n", 1)
# slope and crest colour so the hills read: darker on slopes, a sunnier green on the crests (open land only)
a = "  if (h > 6) col.lerp(C.rock, smoothstep(6, 14, h) * 0.6);"
assert t.count(a) == 1
t = t.replace(a, "  if (HMAP) { const e = 1.5, gx = hmapAt(x + e, z) - hmapAt(x - e, z), gz = hmapAt(x, z + e) - hmapAt(x, z - e), sl = Math.min(1, Math.hypot(gx, gz) / (2 * e) * 2.2), lit = (-gx + gz) / (2 * e); col.lerp(C.lawnDark, sl * 0.35); if (lit > 0) col.lerp(C.lawnLight, Math.min(0.3, lit * 0.9)); col.lerp(C.dry, Math.min(0.25, hmapAt(x, z) * 0.06)); }\n" + a, 1)
hm = """
// world-refresh: the land shaped in Blender (world-refresh/terrain/build_terrain.py), a 1 m height grid added on top of the
// old ground; ?flatworld turns it off
let HMAP = null, HM = null;
if (typeof location !== 'undefined' && !new URLSearchParams(location.search).has('flatworld')) {
  try { const [m, b] = await Promise.all([fetch('/models/refresh/terrain/height.json').then(r => r.json()), fetch('/models/refresh/terrain/height.bin').then(r => r.arrayBuffer())]); HM = m; HMAP = new Uint16Array(b); } catch (e) { console.warn('terrain map failed, old ground', e); }
}
function hmapAt(x, z) {
  const fx = (x - HM.x0) / HM.cell, fz = (z - HM.z0) / HM.cell;
  if (fx < 0 || fz < 0 || fx >= HM.nx - 1 || fz >= HM.nz - 1) return 0;
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, i = iz * HM.nx + ix;
  const a = HMAP[i], b = HMAP[i + 1], c = HMAP[i + HM.nx], d = HMAP[i + HM.nx + 1];
  return ((a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz) / 65535 * HM.max;
}
"""
hm += """
// the shaped land eases out over ~20 m round everything kept flat (town, house pad, the garden and every flat zone), so no
// steep bank rises at their edges
function reliefRoom(x, z) {
  let k = 1 - townWeight(x, z) ** 0.5;
  const hx = Math.max(GARAGE.minX - 3 - x, 0, x - HOUSE.maxX - 3), hz = Math.max(HOUSE.minZ - 5 - z, 0, z - HOUSE.maxZ - 3);
  k = Math.min(k, smoothstep(2, 22, Math.sqrt(hx * hx + hz * hz)));
  for (let i = 0; i < flatZones.length; i++) {
    const f = flatZones[i]; let d;
    if (f.minX !== undefined) { const ex = Math.max(f.minX - x, 0, x - f.maxX), ez = Math.max(f.minZ - z, 0, z - f.maxZ); d = Math.sqrt(ex * ex + ez * ez); }
    else d = Math.max(0, Math.hypot(x - f.x, z - f.z) - f.r);
    if (d < 24) k = Math.min(k, smoothstep(2, 24, d));
  }
  return k;
}
// how far a draped strip (the trails) must rise so the shaped ground does not bulge up through it between its samples
export function hmapLift(x, z) {
  if (!HMAP) return 0;
  const e = 2, c = hmapAt(x, z), k = (hmapAt(x + e, z) + hmapAt(x - e, z) + hmapAt(x, z + e) + hmapAt(x, z - e)) / 4 - c;   // (> 0 in a hollow, < 0 on a crest)
  return 0.05 + Math.max(0, -k) * 3 + Math.hypot(hmapAt(x + e, z) - hmapAt(x - e, z), hmapAt(x, z + e) - hmapAt(x, z - e)) * 0.08;
}
"""
t = t.replace("export const WATER_Y = 0;", "export const WATER_Y = 0;" + hm, 1)
for f in ['height.bin', 'height.json']:
    os.makedirs(os.path.join(OUT, 'models/refresh/terrain'), exist_ok=True); shutil.copy(os.path.join(WR, 'terrain', f), os.path.join(OUT, 'models/refresh/terrain', f))
open(p, 'w').write(t)

p = os.path.join(OUT, 'js/world.js'); t = open(p).read(); a = "verts.push(x, terrainHeight(x, z) + trailLift(x, z), z);"
assert t.count(a) == 1; open(p, 'w').write("import { hmapLift } from './terrain.js';\n" + t.replace(a, "verts.push(x, terrainHeight(x, z) + trailLift(x, z) + hmapLift(x, z), z);", 1))

# ---- the yard fence, modelled in Blender (blender/build_fence.py): pickets (3 variants), posts with caps, rails; same spacing,
# gates and colliders as buildFence's code boxes
for f in ['fence_picket_0', 'fence_picket_1', 'fence_picket_2', 'fence_post', 'fence_rail']: shutil.copy(os.path.join(WR, 'models/blender', f + '.glb'), os.path.join(OUT, 'models/refresh', f + '.glb'))
p = os.path.join(OUT, 'js/world.js'); t = open(p).read()
pairs = [
 ("      b.add(GEO.box, '#fbfaf5', { x, y: y + 0.55, z, sx: 0.31, sy: 1.1, sz: 0.05, ry: rot });\n      b.add(GEO.cone6, '#fbfaf5', { x, y: y + 1.17, z, sx: 0.155, sy: 0.17, sz: 0.04, ry: rot + Math.PI / 6 });",
  "      if (RM.fence_picket_0) { const v = Math.abs(Math.round(c * 7.3)) % 3; rput(b, 'fence_picket_' + v, x, y - 0.03, z, { ry: rot }); } else {\n      b.add(GEO.box, '#fbfaf5', { x, y: y + 0.55, z, sx: 0.31, sy: 1.1, sz: 0.05, ry: rot });\n      b.add(GEO.cone6, '#fbfaf5', { x, y: y + 1.17, z, sx: 0.155, sy: 0.17, sz: 0.04, ry: rot + Math.PI / 6 }); }"),
 ("      b.add(GEO.box, '#f1efe6', { x: x + oa[0], y: y + 0.62, z: z + oa[1], sx: 0.17, sy: 1.3, sz: 0.17 });\n      b.add(GEO.box, '#f1efe6', { x: x + oa[0], y: y + 1.31, z: z + oa[1], sx: 0.23, sy: 0.07, sz: 0.23 });",
  "      if (RM.fence_post) rput(b, 'fence_post', x + oa[0], y - 0.03, z + oa[1]); else {\n      b.add(GEO.box, '#f1efe6', { x: x + oa[0], y: y + 0.62, z: z + oa[1], sx: 0.17, sy: 1.3, sz: 0.17 });\n      b.add(GEO.box, '#f1efe6', { x: x + oa[0], y: y + 1.31, z: z + oa[1], sx: 0.23, sy: 0.07, sz: 0.23 }); }"),
 ("        if (alongX) b.add(GEO.box, '#f1efe6', { x: x + o[0], y: (ya + yb) / 2 + off, z: z + o[1], sx: len + 0.05, sy: 0.09, sz: 0.05, rz: tilt });",
  "        if (RM.fence_rail) b.add(RM.fence_rail, '#ffffff', { x: x + o[0], y: (ya + yb) / 2 + off, z: z + o[1], sx: len + 0.05, ry: alongX ? 0 : -Math.PI / 2, rz: tilt });\n        else if (alongX) b.add(GEO.box, '#f1efe6', { x: x + o[0], y: (ya + yb) / 2 + off, z: z + o[1], sx: len + 0.05, sy: 0.09, sz: 0.05, rz: tilt });"),
]
for a, b2 in pairs: assert t.count(a) == 1, a[:60]; t = t.replace(a, b2, 1)
open(p, 'w').write(t)

# ---- vibrant visuals (Andrew: like Minecraft's Vibrant Visuals): in the ink pass's composite, a vibrance and contrast grade,
# a soft bloom of the bright pixels (HDR colour target: lamps, sunlit tops, the sky) and depth-aware colour; ?novibrant = as before
p = os.path.join(OUT, 'js/toon.js'); t = open(p).read()
a = "      vec2 c = vUv - 0.5;\n      col *= 1.0 - uVignette * dot(c, c) * 1.6;"
assert t.count(a) == 1
vib = """      float vibK = uVibrant;
      vibK *= 1.0 - clamp(uIndoor, 0.0, 1.0);   // (indoors: off, on people and room alike: the rooms' own colours were already rich and went red-orange)
      if (vibK > 0.0) {
        // bloom: what is brighter than ~0.75 glows softly into its neighbours (8 taps on a ring, two rings)
        vec3 bl = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.785398;
          vec2 dir = vec2(cos(a), sin(a)) * uTexel;
          bl += max(texture2D(tColor, vUv + dir * 5.0).rgb - 0.72, 0.0) + max(texture2D(tColor, vUv + dir * 12.0).rgb - 0.72, 0.0) * 0.6;
        }
        col += bl * (0.11 * vibK);
        // vibrance: the duller a colour the more it is lifted (skin and grass do not go neon)
        float l2 = dot(col, vec3(0.299, 0.587, 0.114)), mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
        float satNow = (mx - mn) / max(mx, 1e-3);
        float near = 1.0 - smoothstep(25.0, 140.0, d);
        col = mix(vec3(l2), col, 1.0 + vibK * (0.32 * (1.0 - satNow) + 0.06) * (0.55 + 0.45 * near));
        // contrast: a soft S round the mid tones, deeper darks, lights held below clipping
        col = mix(col, col * col * (3.0 - 2.0 * col), 0.22 * vibK * (1.0 - smoothstep(0.85, 1.2, mx)));
        // a little warm light on the sunlit side of things and a little cool in the shade
        col += vec3(0.022, 0.012, -0.01) * smoothstep(0.55, 0.95, l2) * vibK;
        col += vec3(-0.008, 0.0, 0.016) * (1.0 - smoothstep(0.08, 0.35, l2)) * vibK;
      }
"""
t = t.replace(a, vib + a, 1)
a = "uniform float uUseNormal,"; assert t.count(a) == 1; t = t.replace(a, "uniform float uVibrant, uIndoor; uniform float uUseNormal,", 1)
a = "  get uniforms() { return this.material.uniforms; }"; assert t.count(a) == 1
t = t.replace(a, a + "\n  set vibrant(v) { this.material.uniforms.uVibrant.value = v; }", 1)
a = "    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);"; assert t.count(a) == 1
t = t.replace(a, "    this.material.uniforms.uIndoor = { value: 0 };\n    this.material.uniforms.uVibrant = { value: (typeof location !== 'undefined' && new URLSearchParams(location.search).has('novibrant')) || quality === 'low' ? 0 : 1.35 };\n" + a, 1)
open(p, 'w').write(t)

# ---- the town houses (Andrew: "nondescript, fill them out and give them yards"): addGableHouse gets lap siding, a covered porch
# on posts, window boxes with flowers and gutters; every house gets a yard: a picket fence along the front (gap at the walk),
# flower beds along the front wall, shrubs at the corners, sometimes a topiary or a bird bath. No random draws are taken (the
# town's layout depends on the draw order): variety comes from a hash of the house's spot. All of it stays inside the house's
# collider or is low decoration in the front yard.
p = os.path.join(OUT, 'js/world.js'); t = open(p).read()
a = "// addGableHouse's own draws"
assert t.count(a) == 1
extras = r'''
const _lerpC = (a, b2, k) => new THREE.Color(a).lerp(new THREE.Color(b2), k).getStyle();
function houseExtras(b, f, x, z, w, d, h, wallCol, roofCol, facing) {
  const y = 0.3, fz = z + facing * (d / 2 + 0.06), H = (k) => hash01('hx' + k, Math.round(x * 10), Math.round(z * 10));
  const fb = (x0, y0, a, x1, y1, b2, col) => f.boxMinMax(x0, y0, facing > 0 ? fz + a : fz - b2, x1, y1, facing > 0 ? fz + b2 : fz - a, col);
  const lap = _lerpC(wallCol, '#000000', 0.12), trim = '#fbf7ee';
  for (let yy = y + 0.85; yy < y + h - 0.2; yy += 0.34) fb(x - w / 2 + 0.1, yy, -0.02, x + w / 2 - 0.1, yy + 0.035, 0.02, lap);          // lap siding lines
  for (const sx of [-1, 1]) for (let yy = y + 0.85; yy < y + h - 0.2; yy += 0.34) f.boxMinMax(x + sx * (w / 2 + 0.01) - 0.02, yy, z - d / 2 + 0.1, x + sx * (w / 2 + 0.01) + 0.02, yy + 0.035, z + d / 2 - 0.1, lap);
  // covered porch: a small roof on two posts over the door and its step, a porch light already there
  const pc = H(1) < 0.5 ? '#fbf7ee' : _lerpC(roofCol, '#ffffff', 0.15);
  fb(x - 1.55, y + 2.62, -0.02, x + 1.55, y + 2.74, 1.15, pc); fb(x - 1.62, y + 2.74, 0.0, x + 1.62, y + 2.84, 1.22, _lerpC(roofCol, '#000000', 0.1));
  for (const sx of [-1, 1]) fb(x + sx * 1.38 - 0.07, y + 0.5, 0.86, x + sx * 1.38 + 0.07, y + 2.62, 1.0, trim);
  fb(x - 1.45, y + 0.5, 0.0, x + 1.45, y + 0.56, 1.02, '#b9b2a6');                                                                  // porch deck
  // window boxes with flowers under the ground-floor windows
  const fl = [['#ff6f91', '#ffd23f'], ['#ffffff', '#b48cff'], ['#ff8c42', '#ffe066'], ['#e84a5f', '#ffffff']][Math.floor(H(2) * 4)];
  for (const wx of [-w / 3, w / 3]) {
    fb(x + wx - 0.85, y + 0.98, 0.02, x + wx + 0.85, y + 1.2, 0.36, '#8a5a36');
    for (let i = 0; i < 6; i++) { const cx = x + wx - 0.7 + i * 0.28, cz = fz + facing * 0.2; f.add(GEO.ico1, '#4f9a3e', { x: cx, y: y + 1.27, z: cz, sx: 0.15, sy: 0.11, sz: 0.13 }); f.add(GEO.ico1, fl[i % 2], { x: cx + 0.05, y: y + 1.36, z: cz + facing * 0.04, sx: 0.07, sy: 0.07, sz: 0.07 }); }
  }
  // gutters along both eaves and a downspout at a front corner
  for (const side of [-1, 1]) f.add(GEO.box, '#e8e4dc', { x, y: y + h - 0.16, z: z + side * (d / 2 + 0.58), sx: w + 0.9, sy: 0.1, sz: 0.1 });
  f.add(GEO.box, '#e8e4dc', { x: x + (H(3) < 0.5 ? -1 : 1) * (w / 2 + 0.05), y: y + h / 2, z: z + facing * (d / 2 + 0.1), sx: 0.08, sy: h, sz: 0.08 });
}
export function yardExtras(b, hx, hz, w, d, walkZ, facing) {
  const H = (k) => hash01('yd' + k, Math.round(hx * 10), Math.round(hz * 10)), front = hz + facing * (d / 2), y0 = 0.3;
  const fz = walkZ - facing * 1.25, gap = 1.05, x0 = hx - w / 2 - 0.6, x1 = hx + w / 2 + 0.3;
  // a picket fence along the front of the yard (the Blender pickets), gap at the front walk
  if (RM.fence_picket_0 && H(1) < 0.8) {
    for (let px = x0; px <= x1; px += 0.36) { if (Math.abs(px - hx) < gap) continue; rput(b, 'fence_picket_' + (Math.abs(Math.round(px * 7)) % 3), px, y0 - 0.02, fz, { sx: 1, sy: 0.72, sz: 1 }); }
    for (const px of [x0, hx - gap - 0.05, hx + gap + 0.05, x1]) rput(b, 'fence_post', px, y0 - 0.02, fz, { sx: 1, sy: 0.75, sz: 1 });
    for (const [a, c] of [[x0, hx - gap], [hx + gap, x1]]) for (const yy of [0.28, 0.62]) if (RM.fence_rail) b.add(RM.fence_rail, '#ffffff', { x: (a + c) / 2, y: y0 + yy, z: fz + facing * 0.06, sx: c - a, ry: 0 });
  }
  // flower beds along the front wall, either side of the porch
  for (const sx of [-1, 1]) {
    const bx0 = sx < 0 ? hx - w / 2 + 0.4 : hx + 1.75, bx1 = sx < 0 ? hx - 1.75 : hx + w / 2 - 0.4, bz = front + facing * 0.55;
    b.boxMinMax(bx0, y0, Math.min(bz - 0.35, bz + 0.35), bx1, y0 + 0.07, Math.max(bz - 0.35, bz + 0.35), '#5a3c26');
    if (RM.flower_patch) for (let cx = bx0 + 0.6; cx < bx1 - 0.3; cx += 1.3) rput(b, 'flower_patch', cx, y0 + 0.02, bz, { s: 0.6, ry: cx * 1.7 });
  }
  // shrubs at the front corners of the house, a topiary or a bird bath now and then
  if (RM.hedge_bush) for (const sx of [-1, 1]) rput(b, 'hedge_bush', hx + sx * (w / 2 + 0.2), y0 - 0.02, front + facing * 0.3, { s: 0.55 + H(4 + sx) * 0.25, ry: sx + hx });
  const ox = hx + (H(6) < 0.5 ? -1 : 1) * (w / 4 + 0.5), oz = front + facing * (2.6 + H(7) * 0.8);
  if (H(8) < 0.4 && RM.topiary_ball) rput(b, 'topiary_ball', ox, y0 - 0.02, oz, { s: 0.75 });
  else if (H(8) < 0.7) { b.add(GEO.cyl12, '#d8d2c6', { x: ox, y: y0 + 0.4, z: oz, sx: 0.12, sy: 0.8, sz: 0.12 }); b.add(GEO.cyl12, '#e4ded2', { x: ox, y: y0 + 0.85, z: oz, sx: 0.45, sy: 0.1, sz: 0.45 }); b.add(GEO.cyl12, '#7fc8e0', { x: ox, y: y0 + 0.91, z: oz, sx: 0.38, sy: 0.02, sz: 0.38 }); }
}
'''
t = t.replace(a, extras + a, 1)
a = "    b.boxMinMax(cx - 0.62, y + h + rise + 0.9, z - 0.62, cx + 0.62, y + h + rise + 1.08, z + 0.62, '#7a3f35');\n  }\n}"
assert t.count(a) == 1
t = t.replace(a, a[:-2] + "\n  houseExtras(b, f, x, z, w, d, h, wallCol, roofCol, facing);\n}", 1)
a = "    let tree = null;\n    // (qol-fixes"
assert t.count(a) == 1
t = t.replace(a, "    if (!joyce) yardExtras(b, hx, z, w, d, STREET.sidewalkN, 1);\n" + a, 1)
open(p, 'w').write(t)
p = os.path.join(OUT, 'js/world-town.js'); t = open(p).read()
a = "import { addGableHouse, addCar, STREET_HOUSES } from './world.js';"; assert t.count(a) == 1
t = t.replace(a, "import { addGableHouse, addCar, STREET_HOUSES, yardExtras } from './world.js';", 1)
a = "    // a tree in the back yard, sometimes a shed or a swing set"; assert t.count(a) == 1
t = t.replace(a, "    yardExtras(b, hx, hz, w, d, walkZ, facing);\n" + a, 1)
open(p, 'w').write(t)

# textures as JPEG inside the GLBs (the PNGs made the textured set ~32 MB)
import glob, glb_jpeg
for g in glob.glob(os.path.join(OUT, 'models/refresh/tex/*.glb')) + [os.path.join(OUT, 'models/refresh/nala_mesh.glb'), os.path.join(OUT, 'models/refresh/dax_mesh.glb')]: glb_jpeg.run(g)

# test hook: window.__cam = {p:[x,y,z], t:[x,y,z]} pins the camera (for screenshots only)
p = os.path.join(OUT, 'js/main.js'); m = open(p).read()
hook = "    if (ink.uniforms.uIndoor) ink.uniforms.uIndoor.value = WEATHER.indoor || 0;   // (vibrant pass: softer indoors, none on people there)\n    if (window.__cam) { window.__world = world; camera.position.set(...window.__cam.p); camera.lookAt(...window.__cam.t); camera.updateMatrixWorld(); world.sky.position.copy(camera.position); }\n"
a = '    ui.update(camera, innerWidth, innerHeight);'
assert m.count(a) == 1; m = m.replace(a, hook + a, 1); open(p, 'w').write(m)   # (before the labels, so name tags follow the pinned camera)
print('test game written to', OUT)
# the park trail (park-north) stopped a few metres short of Breneland Rd's sidewalk: one more point carries it right up to the back
# of the sidewalk at the zebra (it stops dead there, no fade)
p = os.path.join(OUT, 'js/layout.js'); t = open(p).read()
a = "pts: [[-82, -27], [-87, -33], [-92, -41.4]] }"
assert t.count(a) == 1, 'park-north'
t = t.replace(a, "pts: [[-82, -27], [-87, -33], [-90.4, -38.2], [-92, -40.9]] },\n  { name: 'park-north-mouth', width: 2.3, pts: [[-89.2, -36.4], [-90.9, -39.0], [-91.7, -40.6]] }", 1); open(p, 'w').write(t)   # (a wider mouth where it meets the sidewalk: it tapered to a point there and read as stopping short)
# ...and a pine stood on its last few metres, its crown hiding where the trail meets the sidewalk: keep the trail's mouth by the
# zebra clear of trees and scatter
p = os.path.join(OUT, 'js/main.js'); t = open(p).read()
a = "    if (world.onTrail(x, z, pad)) return false;\n    if (inFrisbeeField(x, z, pad)) return false;"
assert t.count(a) == 1, 'isClear'
t = t.replace(a, "    if (Math.hypot(x + 91, z + 38.6) < 4.2 + pad) return false;   // (the park trail's mouth at the zebra: open)\n" + a, 1); open(p, 'w').write(t)
# where the park trail meets the sidewalk at the zebra the ground lifts to the sidewalk's back edge and hides the dirt for the last
# metre or so: a few worn flagstones bridge it, so the trail clearly runs onto the sidewalk
p = os.path.join(OUT, 'js/park.js'); t = open(p).read()
a = "  for (const [x, z] of [[-46, -10], [-55, -1], [-59, 13.5], [-76, -25], [-92, -36], [-88, -38]]) lamp(x, z);"
assert t.count(a) == 1, 'park lamps'
t = t.replace(a, a + "\n  for (const [x, z, s, r] of [[-90.2, -37.7, 0.5, 0.3], [-90.6, -38.4, 0.56, 1.1], [-90.95, -39.05, 0.52, 2.0], [-91.3, -39.65, 0.58, 0.7], [-91.6, -40.25, 0.5, 2.6]]) b.add(GEO.cyl8, ['#b4ada0', '#a8a194', '#bfb8aa', '#aea79a'][Math.round(r * 3) % 4], { x, y: terrainHeight(x, z) + 0.05, z, sx: s, sy: 0.08, sz: s * 0.78, ry: r });   // (flagstones onto the sidewalk)", 1)
open(p, 'w').write(t)

# ---- the Unstable Unicorns diorama (Andrew's Meshy model, balloons cut: blender/unicorns_prep.py) set back behind the table on a
# new hill, draped up it: the stone path climbs from the lawn to the portal under the rainbow, where the play prompt now is.
# ?oldworld = the old rainbow arch on the flat lawn.
shutil.copy(os.path.join(WR, 'models/06-unicorns/unicorns_base.glb'), os.path.join(OUT, 'models/refresh/unicorns_base.glb'))
p = os.path.join(OUT, 'js/terrain.js'); t = open(p).read()
uni = """
// world-refresh: the unicorns' hill, behind their table in the woods corner (the slot woods-corner, facing the house like the
// name board): it rises from 5 m behind the table to 2.4 m at the portal, a broad top, then down into the woods
const NOUNI = typeof location !== 'undefined' && new URLSearchParams(location.search).has('oldworld');
const UNI = (() => { const x = -116, z = -36, f = Math.atan2(0 - x, -8 - z); return { x, z, fx: Math.sin(f), fz: Math.cos(f) }; })();
export function uniHill(x, z) {
  if (NOUNI) return 0;
  const dx = x - UNI.x, dz = z - UNI.z, v = -(dx * UNI.fx + dz * UNI.fz), u = Math.abs(dx * UNI.fz - dz * UNI.fx);
  if (v < 4 || v > 34 || u > 16) return 0;
  return 2.4 * smoothstep(5, 13.5, v) * (1 - smoothstep(20, 32, v)) * (1 - smoothstep(8.5, 15.5, u));
}
"""
a = "export const WATER_Y = 0;"
assert t.count(a) == 1; t = t.replace(a, a + uni, 1)
a = "  land += hillHeight(x, z, s); // the swing hill"
assert t.count(a) == 1; t = t.replace(a, "  land += uniHill(x, z);   // (world-refresh: the unicorns' hill)\n" + a, 1)
open(p, 'w').write(t)

p = os.path.join(OUT, 'js/areas.js'); t = open(p).read()
a = "THEMES.unicorns = (ctx) => {\n  const { b, group, x, z, rnd, colliders, updaters } = ctx;\n"
assert t.count(a) == 1
t = t.replace(a, a + """  // world-refresh: the diorama, x7, its front 5.5 m behind the table, draped on the hill (terrain.js uniHill). Model axes: x across,
  // y up, +z the path's front, the portal behind the rainbow at (0.25, -0.5).
  const NOUNI = new URLSearchParams(location.search).has('oldworld');
  const US = 7, uf = Math.atan2(0 - x, -8 - z), uc = Math.cos(uf), us = Math.sin(uf), ucx = x - us * 11.3, ucz = z - uc * 11.3;
  const uw = (lx, lz) => [ucx + (lx * uc + lz * us) * US, ucz + (-lx * us + lz * uc) * US];
  const uniPortal = uw(0.24, -0.4);
  if (!NOUNI) {
    for (const [lx, lz, r] of [[-0.85, -0.33, 0.1], [0.88, -0.33, 0.1], [-0.72, -0.1, 0.14], [0.3, -0.66, 0.17], [0.5, -0.52, 0.08], [-0.42, -0.1, 0.06], [0.24, 0.47, 0.07], [0.7, 0.45, 0.13]]) { const [cx, cz] = uw(lx, lz); colliders.push({ type: 'circle', x: cx, z: cz, r: r * US }); }
    (async () => {
      const [{ GLTFLoader }, { GRADIENT_3 }] = await Promise.all([import('../vendor/three/jsm/loaders/GLTFLoader.js'), import('./toon.js')]);
      const gl = await new GLTFLoader().loadAsync('/models/refresh/unicorns_base.glb'); let m = null; gl.scene.traverse(o => { if (o.isMesh && !m) m = o; });
      const g = m.geometry, P = g.attributes.position, N = g.attributes.normal; let ymin = Infinity;
      for (let i = 0; i < P.count; i++) ymin = Math.min(ymin, P.getY(i));
      // the ground under it, smoothed (so the portal and doorways stand straight) on a 0.5 m grid
      const G = 0.5, R = 12, n = Math.round(2 * R / G) + 1, H = new Float32Array(n * n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const wx = ucx - R + i * G, wz = ucz - R + j * G; let s = 0; for (const [ox, oz] of [[0, 0], [1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]]) s += terrainHeight(wx + ox, wz + oz); H[j * n + i] = s / 5; }
      const hAt = (wx, wz) => { const fx = Math.min(n - 1.001, Math.max(0, (wx - ucx + R) / G)), fz = Math.min(n - 1.001, Math.max(0, (wz - ucz + R) / G)), i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
        return (H[j * n + i] * (1 - tx) + H[j * n + i + 1] * tx) * (1 - tz) + (H[(j + 1) * n + i] * (1 - tx) + H[(j + 1) * n + i + 1] * tx) * tz; };
      for (let i = 0; i < P.count; i++) {
        const lx = P.getX(i), ly = P.getY(i), lz = P.getZ(i), [wx, wz] = uw(lx, lz);
        P.setXYZ(i, wx, (ly - ymin - 0.025) * US + hAt(wx, wz), wz);
        if (N) { const nx = N.getX(i), nz = N.getZ(i); N.setXYZ(i, nx * uc + nz * us, N.getY(i), -nx * us + nz * uc); }
      }
      P.needsUpdate = true; if (N) N.needsUpdate = true; g.computeBoundingSphere(); g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, new THREE.MeshToonMaterial({ map: m.material.map, gradientMap: GRADIENT_3 }));
      mesh.name = 'unicorns-diorama'; mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; group.add(mesh);
    })().catch(e => console.warn('unicorns diorama failed', e));
  }
""", 1)
# the old code rainbow arch and its clouds give way to the diorama's rainbow
a = "    group.add(shadows(arc, true, false));\n  });"
assert t.count(a) == 1; t = t.replace(a, "    if (NOUNI) group.add(shadows(arc, true, false));\n  });", 1)
a = "      b.add(GEO.ico1, '#ffffff', { x: archX + tx * u + fx * v,"
assert t.count(a) == 1; t = t.replace(a, "      if (NOUNI) b.add(GEO.ico1, '#ffffff', { x: archX + tx * u + fx * v,", 1)
a = "    colliders.push({ type: 'circle', x: archX + tx * s * 3.5, z: archZ + tz * s * 3.5, r: 1.0 });"
assert t.count(a) == 1; t = t.replace(a, "    if (NOUNI) " + a.lstrip(), 1)
a = "    lawnR: 13, // the woods keep"
assert t.count(a) == 1; t = t.replace(a, "    promptAt: NOUNI ? null : { x: uniPortal[0], z: uniPortal[1] },   // (world-refresh: you play at the portal)\n    lawnR: NOUNI ? 13 : 24, // the woods keep", 1)
a = "      tableR: spec.tableR || 0,\n"
assert t.count(a) == 1; t = t.replace(a, a + "      promptAt: spec.promptAt || null,\n", 1)
open(p, 'w').write(t)
# the play prompt (and the stats window) go by the distance to promptAt where an area has one
p = os.path.join(OUT, 'js/main.js'); t = open(p).read()
a = "    for (const a of areas) {\n      const d = Math.hypot(a.x - px, a.z - pz);"
assert t.count(a) == 1; t = t.replace(a, "    for (const a of areas) {\n      const q = a.promptAt || a, d = Math.hypot(q.x - px, q.z - pz);", 1)
a = "      if (a && Math.hypot(a.x - px, a.z - pz) > a.promptR + 2.5) dismissed.delete(id);"
assert t.count(a) == 1; t = t.replace(a, "      if (a && Math.hypot((a.promptAt || a).x - px, (a.promptAt || a).z - pz) > a.promptR + 2.5) dismissed.delete(id);", 1)
open(p, 'w').write(t)

# ---- the unicorns' table goes (Andrew: the diorama is the new area): no table, cards or chairs; the balloons that were tied
# to it float free instead, drifting lazily and bouncing off the edges of the area (the plaza and up the path to the portal),
# never leaving it. Their motion is a pure function of the shared clock (a bounce is a triangle wave), so every screen agrees.
p = os.path.join(OUT, 'js/areas.js'); t = open(p).read()
a = "  const top = roundTable(b, x, z, 1.2, '#ffffff', '#f2b8d0');\n  b.add(GEO.cyl12, '#ff8fb8', { x, y: top - 0.1, z, sx: 1.28, sy: 0.18, sz: 1.28 });"
assert t.count(a) == 1
t = t.replace(a, "  const tb = NOUNI ? b : { add() { return this; } }, top = NOUNI ? roundTable(b, x, z, 1.2, '#ffffff', '#f2b8d0') : terrainHeight(x, z) + 0.86;   // (world-refresh: no table)\n  tb.add(GEO.cyl12, '#ff8fb8', { x, y: top - 0.1, z, sx: 1.28, sy: 0.18, sz: 1.28 });", 1)
for a in ["    b.add(GEO.box, ['#b48cff', '#6fb8ff', '#ff6b6b'][i % 3], { x: x + Math.cos(a) * 0.6,",
          "  b.add(GEO.box, '#ffffff', { x, y: top + 0.1, z, sx: 0.3, sy: 0.2, sz: 0.42 });",
          "  b.add(GEO.box, '#b48cff', { x, y: top + 0.21, z, sx: 0.3, sy: 0.01, sz: 0.42 });"]:
    assert t.count(a) == 1, a[:50]; t = t.replace(a, a.replace("b.add(", "tb.add(", 1), 1)
a = "    chair(b, x + Math.cos(a) * 1.75, z + Math.sin(a) * 1.75, -a - Math.PI / 2, ['#ffc6e0',"
assert t.count(a) == 1; t = t.replace(a, "    if (NOUNI) chair(b, x + Math.cos(a) * 1.75, z + Math.sin(a) * 1.75, -a - Math.PI / 2, ['#ffc6e0',", 1)
a = "  ['#ff6fa8', '#6fb8ff', '#fff27a', '#b48cff', '#7ddc7a'].forEach((c, i) => {\n    const a = (i / 5) * TAU;"
assert t.count(a) == 1
t = t.replace(a, """  const freeB = [], ufx2 = Math.sin(uf), ufz2 = Math.cos(uf);   // the free balloons (world-refresh)
  if (!NOUNI) ['#ff6fa8', '#6fb8ff', '#fff27a', '#b48cff', '#7ddc7a', '#ffb347', '#ff6b6b', '#9fe8ff'].forEach((c, i) => {
    const g2 = new THREE.Group(), ball = new THREE.Mesh(balloonGeometry(), toon(c, { emissive: c, emissiveIntensity: 0.12 }));
    ball.scale.set(0.36, 0.45, 0.36);
    const str = new THREE.Mesh(GEO.cyl6, toon('#ffffff')); str.scale.set(0.012, 1.2, 0.012); str.position.y = -1.1;
    g2.add(shadows(ball, true, false), str); group.add(g2);
    freeB.push({ g: g2, ball, u0: rnd(), v0: rnd(), h0: rnd(), su: 0.25 + rnd() * 0.2, sv: 0.18 + rnd() * 0.16, sh: 0.1 + rnd() * 0.08, ph: rnd() * TAU });
  });
  if (NOUNI) ['#ff6fa8', '#6fb8ff', '#fff27a', '#b48cff', '#7ddc7a'].forEach((c, i) => {
    const a = (i / 5) * TAU;""", 1)
a = "    balloons.forEach((bl, i) => {\n      const p = balloonPop(i, t);"
assert t.count(a) == 1
t = t.replace(a, """    // the free balloons: inside the area (u across, v back from the plaza's front to just short of the portal), 2.2 to 4.8 m up,
    // each bouncing between the edges at its own slow pace, with a little sway; one pops now and then and is blown up again
    const tri = q => { const m = ((q % 2) + 2) % 2; return m < 1 ? m : 2 - m; };
    freeB.forEach((f, i) => {
      if (far) { f.g.visible = false; return; }
      const U0 = -5.5, U1 = 5.5, V0 = -5, V1 = 11.5;
      const u = U0 + (U1 - U0) * tri(f.u0 * 2 + f.su * t / (U1 - U0)) + 0.25 * Math.sin(t * 0.7 + f.ph);
      const v = V0 + (V1 - V0) * tri(f.v0 * 2 + f.sv * t / (V1 - V0)) + 0.25 * Math.cos(t * 0.6 + f.ph);
      const wx = x + ufz2 * u - ufx2 * v, wz = z - ufx2 * u - ufz2 * v;
      const h = 2.2 + 2.6 * tri(f.h0 * 2 + f.sh * t / 2.6) + 0.15 * Math.sin(t * 1.3 + f.ph);
      f.g.position.set(wx, terrainHeight(wx, wz) + h, wz);
      f.g.rotation.set(0.12 * Math.sin(t * 0.9 + f.ph), t * 0.2 + f.ph, 0.12 * Math.cos(t * 0.8 + f.ph));
      const p = balloonPop(i, t), k = p.popped ? (p.since < 0.1 ? 1 + p.since * 5 : 0) : p.inflate;
      f.g.visible = k > 0.01; f.ball.scale.set(0.36 * k, 0.45 * k, 0.36 * k);
    });
""" + a, 1)
# the sounds' positions (park.js): balloons over the middle of the area, no clouds, the arch at the rainbow, the 'table' at the portal
a = "      balloons: balloons.map(bl => ({ x: bl.x, y: bl.y + bl.h + 0.34, z: bl.z, ph: bl.ph })),\n      sparks: sparks.map(s => s.userData), clouds, arch: { x: archX, y: archY + 2.6, z: archZ }, table: { x, z },"
assert t.count(a) == 1
t = t.replace(a, """      balloons: NOUNI ? balloons.map(bl => ({ x: bl.x, y: bl.y + bl.h + 0.34, z: bl.z, ph: bl.ph })) : freeB.slice(0, 3).map((f, i) => { const v = 1 + i * 4; return { x: x - ufx2 * v, y: terrainHeight(x, z) + 3.4, z: z - ufz2 * v, ph: f.ph }; }),
      sparks: sparks.map(s => s.userData), clouds: NOUNI ? clouds : [], arch: NOUNI ? { x: archX, y: archY + 2.6, z: archZ } : { x: uw(0, -0.33)[0], y: terrainHeight(x, z) + 6, z: uw(0, -0.33)[1] }, table: NOUNI ? { x, z } : { x: uniPortal[0], z: uniPortal[1] },""", 1)
a = "  return {\n    tableR: 1.3,\n    far: lod, // its moving folk"
assert t.count(a) == 1; t = t.replace(a, "  return {\n    tableR: NOUNI ? 1.3 : 0,\n    far: lod, // its moving folk", 1)
open(p, 'w').write(t)
