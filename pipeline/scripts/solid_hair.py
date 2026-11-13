"""Make a fitted hairstyle solid: no gaps between strands. The hair surface is voxel-remeshed into one closed shell (fine detail
is lost, holes are closed), its shading carried over as a gray value per vertex, then reduced. Accessories and the scalp layer
are kept as they are. Output GLB: primitive 0 = hair (POSITION, NORMAL, COLOR_0 gray value; tinted by the editor),
then accessory (textured) and scalp primitives copied from the input.
Usage: bvenv/bin/python solid_hair.py fitted.glb out.glb [voxel_mm] [target_tris]"""
import sys, json, struct, io, numpy as np, bpy, bmesh

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[-4:]
SRC, OUT = args[0], args[1]; VOX = float(args[2]) / 1000 if len(args) > 2 else 0.004; TARGET = int(args[3]) if len(args) > 3 else 7000

d = open(SRC, 'rb').read(); L = struct.unpack('<I', d[12:16])[0]; J = json.loads(d[20:20 + L]); B = d[20 + L + 8:]
CT = {5126: np.float32, 5125: np.uint32}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}
def acc(i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(B, CT[a['componentType']], a['count'] * NC[a['type']], bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], -1)
prims = J['meshes'][0]['primitives']; hp = prims[0]
P = acc(hp['attributes']['POSITION']).astype(float); UV = acc(hp['attributes']['TEXCOORD_0']).astype(float); F = acc(hp['indices']).reshape(-1, 3).astype(int)
im = J['images'][J['textures'][J['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
bv = J['bufferViews'][im['bufferView']]
sys.path.append('/home/claude/pylib'); from PIL import Image
T = np.array(Image.open(io.BytesIO(B[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])).convert('L')).astype(float) / 255
H, W = T.shape
val = T[np.clip((UV[:, 1] * H).astype(int), 0, H - 1), np.clip((UV[:, 0] * W).astype(int), 0, W - 1)]
used = np.unique(F)

bpy.ops.wm.read_factory_settings(use_empty=True)
G = lambda p: (p[0], -p[2], p[1])
me = bpy.data.meshes.new('h'); me.from_pydata([G(p) for p in P], [], [tuple(int(x) for x in t) for t in F]); me.update()
ca = me.color_attributes.new('val', 'FLOAT_COLOR', 'POINT')
for i, v in enumerate(val): ca.data[i].color = (v, v, v, 1)
src = bpy.data.objects.new('src', me); bpy.context.scene.collection.objects.link(src)
dst = bpy.data.objects.new('dst', me.copy()); bpy.context.scene.collection.objects.link(dst)
bpy.context.view_layer.objects.active = dst
so = dst.modifiers.new('so', 'SOLIDIFY'); so.thickness = VOX * 1.2; so.offset = 0; bpy.ops.object.modifier_apply(modifier='so')   # give the strands volume, so the voxel pass sees them
r = dst.modifiers.new('r', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = VOX; r.adaptivity = 0
bpy.ops.object.modifier_apply(modifier='r')
n0 = len(dst.data.polygons)
dt = dst.modifiers.new('t', 'DATA_TRANSFER'); dt.object = src; dt.use_vert_data = True; dt.data_types_verts = {'COLOR_VERTEX'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
if not dst.data.color_attributes: dst.data.color_attributes.new('val', 'FLOAT_COLOR', 'POINT')
bpy.ops.object.datalayout_transfer(modifier='t'); bpy.ops.object.modifier_apply(modifier='t')
dec = dst.modifiers.new('d', 'DECIMATE'); dec.ratio = min(1.0, TARGET / max(1, n0 * 2)); bpy.ops.object.modifier_apply(modifier='d')
sm = dst.modifiers.new('s', 'SMOOTH'); sm.iterations = 2; sm.factor = 0.5; bpy.ops.object.modifier_apply(modifier='s')
m = dst.data; m.calc_loop_triangles()
V = np.array([v.co[:] for v in m.vertices]); V = np.c_[V[:, 0], V[:, 2], -V[:, 1]].astype(np.float32)
Ft = np.array([t.vertices[:] for t in m.loop_triangles], np.uint32)
cav = m.color_attributes[0]; Cv = np.array([c.color[0] for c in cav.data], np.float32)
Cv = np.clip(Cv, 0.6, 1); Cv = np.repeat(Cv[:, None], 3, 1)
fn = np.cross(V[Ft[:, 1]] - V[Ft[:, 0]], V[Ft[:, 2]] - V[Ft[:, 0]]); N = np.zeros_like(V)
for k in range(3): np.add.at(N, Ft[:, k], fn)
N /= np.linalg.norm(N, axis=1, keepdims=True).clip(1e-12)
print('remeshed', n0, '-> tris', len(Ft), 'verts', len(V))

# ---- write: solid hair + the input's other primitives
BIN = bytearray(); views = []; accs = []
def push(data, target=None):
    while len(BIN) % 4: BIN.append(0)
    off = len(BIN); BIN.extend(data); v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target: v['target'] = target
    views.append(v); return len(views) - 1
def add(arr, comp, typ, target=None, mm=False, norm=False):
    a = {'bufferView': push(arr.tobytes(), target), 'componentType': comp, 'type': typ, 'count': int(arr.shape[0])}
    if mm: a['min'] = [float(x) for x in arr.min(0)]; a['max'] = [float(x) for x in arr.max(0)]
    if norm: a['normalized'] = True
    accs.append(a); return len(accs) - 1
def copy_acc(i):
    a = dict(J['accessors'][i]); bv = J['bufferViews'][a['bufferView']]; o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    n = a['count'] * NC[a['type']] * 4; a['bufferView'] = push(B[o:o + n], bv.get('target')); a.pop('byteOffset', None); accs.append(a); return len(accs) - 1
out_prims = [{'attributes': {'POSITION': add(V, 5126, 'VEC3', 34962, True), 'NORMAL': add(N.astype(np.float32), 5126, 'VEC3', 34962),
                             'COLOR_0': add((Cv * 255).astype(np.uint8), 5121, 'VEC3', 34962, norm=True)},
              'indices': add(Ft.reshape(-1), 5125, 'SCALAR', 34963), 'material': 0}]
cache = {}
for p in prims[1:]:
    at = {k: cache.setdefault(v, copy_acc(v)) for k, v in p['attributes'].items()}
    if p['material'] == 1:   # accessories sit a little proud of the solid hair
        PA = acc(p['attributes']['POSITION']).astype(float); C0 = np.array([0.0175, 1.53, -0.025]); dv = PA - C0
        PA = PA + dv / np.linalg.norm(dv, axis=1, keepdims=True) * 0.01; at = dict(at); at['POSITION'] = add(PA.astype(np.float32), 5126, 'VEC3', 34962, True)
    if p['material'] == 0:   # the scalp: one even hair value, no texture lookup
        n = J['accessors'][p['attributes']['POSITION']]['count']; at = {'POSITION': at['POSITION'], 'COLOR_0': add(np.full((n, 3), int(0.72 * 255), np.uint8), 5121, 'VEC3', 34962, norm=True)}
    out_prims.append({'attributes': at, 'indices': copy_acc(p['indices']), 'material': p['material']})
imgs = []
for k, img in enumerate(J['images']):
    bvi = J['bufferViews'][img['bufferView']]; imgs.append({'bufferView': push(B[bvi.get('byteOffset', 0):bvi.get('byteOffset', 0) + bvi['byteLength']]), 'mimeType': img['mimeType']})
GJ = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': 'hair', 'mesh': 0}], 'meshes': [{'primitives': out_prims}],
      'materials': J['materials'], 'textures': J['textures'], 'samplers': J['samplers'], 'images': imgs, 'bufferViews': views, 'accessors': accs}
while len(BIN) % 4: BIN.append(0)
GJ['buffers'] = [{'byteLength': len(BIN)}]
js = json.dumps(GJ, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
open(OUT, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(BIN)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(BIN), 0x004E4942) + bytes(BIN))
print(OUT, '%.2f MB' % ((28 + len(js) + len(BIN)) / 1e6))
