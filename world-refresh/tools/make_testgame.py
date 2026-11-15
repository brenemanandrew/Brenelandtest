"""Make a patched TEST copy of the Breneland client with the new world-refresh models swapped in.
Never touches breneland-live/ or the live game. Usage: python3 make_testgame.py OUTDIR
Swap 1 (trees): hand-placed oak, maple, birch, pine and palm (addTree in world-trees.js) use the converted Meshy models.
The old code tree is still built into a throwaway batcher first, so every random draw, the collider radius and TREE_LOG stay
exactly as before (nothing else in the world moves). Leaves are tinted with the same palette colour the old tree would use.
If a model fails to load, the old code tree is used (fallback)."""
import os, sys, shutil, json
HERE = os.path.dirname(os.path.abspath(__file__)); WR = os.path.dirname(HERE); REPO = os.path.dirname(WR)
OUT = sys.argv[1]
if os.path.exists(OUT): shutil.rmtree(OUT)
shutil.copytree(os.path.join(REPO, 'breneland-live'), OUT)
shutil.copytree(os.path.join(HERE, 'vendor'), os.path.join(OUT, 'vendor/three/jsm'))
os.makedirs(os.path.join(OUT, 'models/refresh'), exist_ok=True)
for k in ['oak', 'maple', 'birch', 'pine', 'palm']:
    shutil.copy(os.path.join(WR, 'models/converted/vc', k + '.glb'), os.path.join(OUT, 'models/refresh', k + '.glb'))
p = os.path.join(OUT, 'js/world-trees.js'); s = open(p).read()
head = """import { GLTFLoader } from '../vendor/three/jsm/loaders/GLTFLoader.js';
// world-refresh test: new tree models (wood keeps its colours, leaves carry alpha < 0.75 and take the old tree's leaf colour)
const _tc = new THREE.Color();
const REFRESH = await (async () => {
  { const q = new URLSearchParams(location.search); if (q.has('oldtrees') || q.has('oldworld')) return {}; }
  const out = {}, ld = new GLTFLoader();
  for (const k of ['oak', 'maple', 'birch', 'pine', 'palm']) {
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
SWAP = ['raised_bed', 'lettuce', 'carrots', 'strawberries', 'tomatoes', 'pumpkins', 'sunflower', 'hedge_box', 'shore_rock']   # rose_arch: Meshy made a brown gate with doors, the garden's arch is white and open: redo first
for k in SWAP: shutil.copy(os.path.join(WR, 'models/converted/vc', k + '.glb'), os.path.join(OUT, 'models/refresh', k + '.glb'))
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
// add a model to a batcher: x, y = ground under its centre, z; s or sx/sy/sz scale; ry yaw
export function rput(b, k, x, y, z, { s = 1, sx, sy, sz, ry = 0 } = {}) { if (RM[k]) b.add(RM[k], '#ffffff', { x, y, z, ry, sx: sx ?? s, sy: sy ?? s, sz: sz ?? s }); }
""" % json.dumps(SWAP))
IMP = "import { RM, MUTE, rput } from './refresh-models.js';\n"
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
open(os.path.join(OUT, 'js/garden-build.js'), 'w').write(IMP + t)
# hedges
patch('lawn.js', [("      b.add(GEO.box, col, { x, y: y + h / 2, z: zc, sx: L - 0.07, sy: h, sz: d });",
  "      if (RM.hedge_box) { rput(b, 'hedge_box', x, y + 0.02, zc, { sx: (L - 0.05) / 3.3, sy: h / 1.5, sz: d / 0.92, ry: 0 }); continue; }\n      b.add(GEO.box, col, { x, y: y + h / 2, z: zc, sx: L - 0.07, sy: h, sz: d });")])
# shore rocks
patch('world.js', [("    b.add(GEO.dodec, '#9a9b93', { x: r.x, y: y + 0.2 * r.s, z: r.z, sx: r.s, sy: r.s * 0.7, sz: r.s * 0.9, ry: r.x });\n    b.add(GEO.dodec, '#8a8b84', { x: x2, y: y2 + 0.06, z: z2, sx: r.s * 0.5, sy: r.s * 0.4, sz: r.s * 0.5, ry: r.z });",
  "    if (RM.shore_rock) { rput(b, 'shore_rock', r.x, y - 0.05, r.z, { s: r.s * 1.1, ry: r.x }); rput(b, 'shore_rock', x2, y2 - 0.03, z2, { s: r.s * 0.5, ry: r.z }); } else {\n    b.add(GEO.dodec, '#9a9b93', { x: r.x, y: y + 0.2 * r.s, z: r.z, sx: r.s, sy: r.s * 0.7, sz: r.s * 0.9, ry: r.x });\n    b.add(GEO.dodec, '#8a8b84', { x: x2, y: y2 + 0.06, z: z2, sx: r.s * 0.5, sy: r.s * 0.4, sz: r.s * 0.5, ry: r.z }); }")])

# test hook: window.__cam = {p:[x,y,z], t:[x,y,z]} pins the camera (for screenshots only)
p = os.path.join(OUT, 'js/main.js'); m = open(p).read()
hook = "    if (window.__cam) { camera.position.set(...window.__cam.p); camera.lookAt(...window.__cam.t); camera.updateMatrixWorld(); world.sky.position.copy(camera.position); }\n    ink.render(scene, camera);"
assert m.count('    ink.render(scene, camera);') == 1; m = m.replace('    ink.render(scene, camera);', hook, 1); open(p, 'w').write(m)
print('test game written to', OUT)
