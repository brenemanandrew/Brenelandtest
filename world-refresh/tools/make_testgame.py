"""Make a patched TEST copy of the Breneland client with the new world-refresh models swapped in.
Never touches breneland-live/ or the live game. Usage: python3 make_testgame.py OUTDIR
Swap 1 (trees): hand-placed oak, maple, birch, pine and palm (addTree in world-trees.js) use the converted Meshy models.
The old code tree is still built into a throwaway batcher first, so every random draw, the collider radius and TREE_LOG stay
exactly as before (nothing else in the world moves). Leaves are tinted with the same palette colour the old tree would use.
If a model fails to load, the old code tree is used (fallback)."""
import os, sys, shutil
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
const REFRESH = await (async () => {
  if (new URLSearchParams(location.search).has('oldtrees')) return {};
  const out = {}, ld = new GLTFLoader();
  for (const k of ['oak', 'maple', 'birch', 'pine', 'palm']) {
    try {
      const gl = await ld.loadAsync('/models/refresh/' + k + '.glb'); let mesh = null; gl.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry, c = g.attributes.color, n = g.attributes.position.count;
      const split = want => { const keep = []; for (let i = 0; i < n; i += 3) { const leaf = c.itemSize === 4 && c.getW(i) < 0.75; if (leaf === want) keep.push(i); }
        if (!keep.length) return null; const ng = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'color']) { const a = g.attributes[name]; if (!a) continue; const sz = name === 'color' ? 3 : a.itemSize, arr = new Float32Array(keep.length * 3 * sz);
          keep.forEach((i, t) => { for (let v = 0; v < 3; v++) for (let q = 0; q < sz; q++) arr[(t * 3 + v) * sz + q] = a.getComponent(i + v, q); });
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
# test hook: window.__cam = {p:[x,y,z], t:[x,y,z]} pins the camera (for screenshots only)
p = os.path.join(OUT, 'js/main.js'); m = open(p).read()
hook = "    if (window.__cam) { camera.position.set(...window.__cam.p); camera.lookAt(...window.__cam.t); camera.updateMatrixWorld(); world.sky.position.copy(camera.position); }\n    ink.render(scene, camera);"
assert m.count('    ink.render(scene, camera);') == 1; m = m.replace('    ink.render(scene, camera);', hook, 1); open(p, 'w').write(m)
print('test game written to', OUT)
