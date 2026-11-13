"""New Leia: the detailed untextured Meshy mesh, fitted to the old Leia's skeleton.
Old mesh is warped onto the new one (arms are a little shorter, lower and further back), then its skin weights are
transferred by nearest surface point and its texture is baked across. Writes out/leia2_data.npz."""
import bpy, bmesh, json, struct, math, numpy as np, io
from mathutils import Vector
from mathutils.bvhtree import BVHTree

OLD = '/home/claude/in3/leia.glb'


def glb(f):
    d = open(f, 'rb').read(); L = struct.unpack('<I', d[12:16])[0]
    return json.loads(d[20:20 + L]), d[20 + L + 8:]


J, B = glb(OLD)
CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def acc(i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(B, CT[a['componentType']], a['count'] * NC[a['type']], bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], -1)


pr = J['meshes'][0]['primitives'][0]
oP = acc(pr['attributes']['POSITION']).astype(float); oUV = acc(pr['attributes']['TEXCOORD_0']).astype(float)
oJ = acc(pr['attributes']['JOINTS_0']).astype(int); oW = acc(pr['attributes']['WEIGHTS_0']).astype(float)
oI = acc(pr['indices']).reshape(-1, 3)

# ---- arm warp, old space -> new space (glTF axes: x to her left, y up, z forward)
K_ARM, DY, DZ, X0 = 0.753 / 0.781, -0.016, 0.0, 0.17
ss = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))


def warp(P):
    P = np.array(P, float); ax = np.abs(P[:, 0]); k = ss((ax - 0.16) / 0.1) * ss((P[:, 1] - 1.12) / 0.08)
    nx = np.sign(P[:, 0]) * np.where(ax > X0, X0 + (ax - X0) * K_ARM, ax)
    P[:, 0] = P[:, 0] + (nx - P[:, 0]) * k; P[:, 1] += DY * k; P[:, 2] += DZ * k
    P[:, 2] += -0.03 * ss((P[:, 1] - 0.9) / 0.2)  # her upper body sits 3 cm further back in the new mesh
    return P


wP = warp(oP)

# ---- new mesh, scaled to 1.70 m, feet on the floor
bpy.ops.wm.open_mainfile(filepath='/home/claude/out/leia2_dec.blend')
o = bpy.data.objects['Leia2']; me = o.data
co = np.array([v.co[:] for v in me.vertices]); G = co[:, [0, 2, 1]] * np.array([1, 1, -1])  # blender -> gltf axes
s = 1.70 / (G[:, 1].max() - G[:, 1].min()); G = (G - [0, G[:, 1].min(), 0]) * s
for v, g in zip(me.vertices, G): v.co = Vector((g[0], -g[2], g[1]))
me.update()
print('new verts', len(G), 'scale', s)

# ---- old mesh in blender (warped), with its texture, as the bake source
om = bpy.data.meshes.new('old'); bw = wP[:, [0, 2, 1]] * np.array([1, -1, 1])
om.from_pydata([tuple(p) for p in bw], [], [tuple(int(x) for x in t) for t in oI]); om.update()
uvl = om.uv_layers.new(name='UV')
for poly in om.polygons:
    for li, vi in zip(poly.loop_indices, poly.vertices): uvl.data[li].uv = (oUV[vi, 0], 1 - oUV[vi, 1])
oo = bpy.data.objects.new('Old', om); bpy.context.scene.collection.objects.link(oo)
im = J['images'][J['textures'][J['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
bv = J['bufferViews'][im['bufferView']]; open('/tmp/old_base.png', 'wb').write(B[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])
img = bpy.data.images.load('/tmp/old_base.png')
mo = bpy.data.materials.new('old'); mo.use_nodes = True; nt = mo.node_tree
tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img
nt.links.new(tx.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color']); om.materials.append(mo)

# ---- skin weights: nearest point on the warped old surface, barycentric blend of its corners
bvh = BVHTree.FromPolygons([tuple(p) for p in wP], [tuple(int(x) for x in t) for t in oI])
NJ = len(J['skins'][0]['joints'])
nW = np.zeros((len(G), 4)); nJ = np.zeros((len(G), 4), int); far = 0
for i, g in enumerate(G):
    loc, nrm, fi, dist = bvh.find_nearest(Vector(g))
    if dist > 0.04: far += 1
    a, b, c = (wP[k] for k in oI[fi]); p = np.array(loc)
    v0, v1, v2 = b - a, c - a, p - a; d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
    den = d00 * d11 - d01 * d01 or 1e-12; bb = (d11 * d20 - d01 * d21) / den; cc = (d00 * d21 - d01 * d20) / den
    bary = np.clip([1 - bb - cc, bb, cc], 0, 1); bary /= bary.sum()
    acc_w = {}
    for k, wt in zip(oI[fi], bary):
        for j in range(4):
            if oW[k, j] > 0: acc_w[oJ[k, j]] = acc_w.get(oJ[k, j], 0) + wt * oW[k, j]
    top = sorted(acc_w.items(), key=lambda x: -x[1])[:4]; tot = sum(w for _, w in top)
    for j, (jj, w) in enumerate(top): nJ[i, j] = jj; nW[i, j] = w / tot
print('verts further than 4 cm from the old surface:', far)

# smooth weights a little over the new mesh (the old mesh is coarse: 6.6k verts vs 23k)
nb = [[] for _ in G]
for e in me.edges: x, y = e.vertices; nb[x].append(y); nb[y].append(x)
dense = np.zeros((len(G), NJ))
for j in range(4): dense[np.arange(len(G)), nJ[:, j]] += nW[:, j]
for _ in range(3):
    dense = np.array([0.5 * dense[i] + 0.5 * dense[n].mean(0) if n else dense[i] for i, n in enumerate(nb)])
idx = np.argsort(-dense, 1)[:, :4]; w4 = np.take_along_axis(dense, idx, 1); w4 /= w4.sum(1, keepdims=True)

# ---- UVs (xatlas charts) and texture bake onto the new mesh
import sys; sys.path.append('/home/claude/pylib'); import xatlas
me.calc_loop_triangles()
F = np.array([[me.loops[li].vertex_index for li in lt.loops] for lt in me.loop_triangles], np.uint32)
VN = np.array([v.normal[:] for v in me.vertices]); VN = VN[:, [0, 2, 1]] * np.array([1, 1, -1])
atlas = xatlas.Atlas(); atlas.add_mesh(G.astype(np.float32), F)
po = xatlas.PackOptions(); po.resolution = 2048; po.padding = 4; po.bilinear = True
co_ = xatlas.ChartOptions(); co_.max_iterations = 2
atlas.generate(co_, po); vmap, IND, UV = atlas[0]
print('xatlas charts', atlas.chart_count, 'verts', len(vmap))
SP = G[vmap]
nm2 = bpy.data.meshes.new('newuv'); bp = SP[:, [0, 2, 1]] * np.array([1, -1, 1])
nm2.from_pydata([tuple(p) for p in bp], [], [tuple(int(x) for x in t) for t in IND]); nm2.update()
ul = nm2.uv_layers.new(name='UV')
for poly in nm2.polygons:
    for li, vi in zip(poly.loop_indices, poly.vertices): ul.data[li].uv = (UV[vi, 0], UV[vi, 1])
no = bpy.data.objects.new('NewUV', nm2); bpy.context.scene.collection.objects.link(no)
for poly in nm2.polygons: poly.use_smooth = True
SZ = 2048
tgt = bpy.data.images.new('leia_base', SZ, SZ); mn = bpy.data.materials.new('leia'); mn.use_nodes = True
tn = mn.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = tgt; mn.node_tree.nodes.active = tn
nm2.materials.append(mn)
o.hide_render = True; o.hide_set(True)
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
sc.render.bake.use_selected_to_active = True; sc.render.bake.cage_extrusion = 0.04; sc.render.bake.max_ray_distance = 0.1
sc.render.bake.margin = 6
for ob in bpy.context.view_layer.objects: ob.select_set(False)
oo.select_set(True); no.select_set(True); bpy.context.view_layer.objects.active = no
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
tgt.filepath_raw = '/home/claude/out/leia2_base.png'; tgt.file_format = 'PNG'; tgt.save()
np.savez('/home/claude/out/leia2_data.npz', P=SP.astype(np.float32), N=VN[vmap].astype(np.float32), UV=np.c_[UV[:, 0], 1 - UV[:, 1]].astype(np.float32),
         J=idx[vmap].astype(np.uint16), W=w4[vmap].astype(np.float32), I=IND.astype(np.uint32))
print('exported', len(vmap), 'verts', len(IND), 'tris')
