"""Breneland's land shaped in Blender (Andrew: "redo the ground more convincingly using Blender").
Run: /tmp/bvenv/bin/python terrain/build_terrain.py   (bpy 5.3)
A grid over the whole map (1 m cells) shaped by stacked Displace modifiers with Blender's procedural textures:
  - broad rolling hills (clouds, ~70 m), the main form
  - long swales and spurs (distorted noise, ~40 m): what makes land read as natural rather than bumpy
  - small undulation (clouds, ~10 m)
  - a soft ridge line along the north-west, where the woods meet the foothills
then a Smooth modifier, applied and read back. Output: terrain/height.bin (Uint16, row-major z then x) + terrain/height.json
(origin, cell size, scale) and a hillshade preview. The game adds this on top of its own ground; every flat zone (town, house,
garden, game spots, lots, shores) is applied after it, so those stay exactly as they were."""
import bpy, bmesh, numpy as np, json, os
X0, X1, Z0, Z1, CELL = -262, 88, -194, 122, 1.0
nx, nz = int((X1 - X0) / CELL) + 1, int((Z1 - Z0) / CELL) + 1
bpy.ops.wm.read_factory_settings(use_empty=True)
mesh = bpy.data.meshes.new('land'); obj = bpy.data.objects.new('land', mesh); bpy.context.scene.collection.objects.link(obj)
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=nx - 1, y_segments=nz - 1, size=1.0); bm.to_mesh(mesh); bm.free()
# lay it out in metres (Blender's z is up; the game's z is Blender's y)
co = np.zeros(len(mesh.vertices) * 3); mesh.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
co[:, 0] = X0 + (co[:, 0] + 1) / 2 * (X1 - X0); co[:, 1] = Z0 + (co[:, 1] + 1) / 2 * (Z1 - Z0); co[:, 2] = 0
mesh.vertices.foreach_set('co', co.ravel()); mesh.update()
def tex(name, kind, scale, depth=2, **kw):
    t = bpy.data.textures.new(name, kind); t.noise_scale = scale
    if hasattr(t, 'noise_depth'): t.noise_depth = depth
    for k, v in kw.items(): setattr(t, k, v)
    return t
def displace(name, t, strength, mid=0.5):
    m = obj.modifiers.new(name, 'DISPLACE'); m.texture = t; m.texture_coords = 'GLOBAL'; m.direction = 'Z'; m.strength = strength; m.mid_level = mid
    return m
displace('hills', tex('hills', 'CLOUDS', 70, depth=3, noise_basis='BLENDER_ORIGINAL'), 5.0)
displace('swales', tex('swales', 'DISTORTED_NOISE', 42, distortion=1.4, noise_distortion='ORIGINAL_PERLIN', noise_basis='IMPROVED_PERLIN'), 2.4)
displace('roll', tex('roll', 'CLOUDS', 10, depth=1), 0.35)
sm = obj.modifiers.new('soften', 'SMOOTH'); sm.factor = 0.6; sm.iterations = 6
dg = bpy.context.evaluated_depsgraph_get(); ev = obj.evaluated_get(dg); em = ev.to_mesh()
h = np.zeros(len(em.vertices) * 3); em.vertices.foreach_get('co', h); h = h.reshape(-1, 3)
# order the samples on the grid (the grid's vertex order is not guaranteed: sort by z then x)
ix = np.round((h[:, 0] - X0) / CELL).astype(int); iz = np.round((h[:, 1] - Z0) / CELL).astype(int)
H = np.zeros((nz, nx)); H[iz, ix] = h[:, 2]
# soft north-west ridge where the woods climb toward the foothills
X = np.linspace(X0, X1, nx)[None, :]; Z = np.linspace(Z0, Z1, nz)[:, None]
H += 2.2 * np.clip((-(X + 150) - 0.35 * (Z + 60)) / 90, 0, 1) ** 1.5
H -= np.percentile(H, 30)               # the low 30% of the land stays at the old level (the field only raises ground)
H = np.clip(H, 0, None)
lo, hi = 0.0, float(H.max()); q = np.round(H / hi * 65535).astype('<u2')
os.makedirs('terrain', exist_ok=True); q.tofile('terrain/height.bin')
json.dump({'x0': X0, 'z0': Z0, 'cell': CELL, 'nx': nx, 'nz': nz, 'max': hi}, open('terrain/height.json', 'w'))
# hillshade preview
gy, gx = np.gradient(H, CELL); L = np.array([-0.6, -0.6, 0.55]); L /= np.linalg.norm(L)
nrm = np.dstack([-gx, -gy, np.ones_like(H)]); nrm /= np.linalg.norm(nrm, axis=2, keepdims=True); sh = np.clip((nrm @ L), 0, 1)
from PIL import Image
img = np.dstack([0.35 + 0.4 * sh + 0.05 * H / hi] * 3) * np.array([0.55, 0.85, 0.45]) + np.dstack([H / hi * 0.25] * 3)
Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save('terrain/hillshade.png')
print('grid', nx, 'x', nz, 'max height', round(hi, 2), 'm; share raised', round(float((H > 0.05).mean()), 2))
