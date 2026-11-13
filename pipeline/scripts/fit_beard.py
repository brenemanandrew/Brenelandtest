"""Cut the beard off a Meshy bearded bust and fit it to the male head: placed by the ears and nose tip, kept just proud of his
face, made one solid shell (voxel remesh) with a gray value per vertex (tinted by the editor like the hair).
Usage: bvenv/bin/python fit_beard.py in.glb out.glb [thickness scale]"""
import sys, json, struct, io, numpy as np, bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.append("/home/claude/pylib")
from PIL import Image
a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SRC, OUT, TH = a[0], a[1], float(a[2]) if len(a) > 2 else 1.0
CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def glb(f):
    d = open(f, 'rb').read(); L = struct.unpack('<I', d[12:16])[0]; return json.loads(d[20:20 + L]), d[20 + L + 8:]
def acc(J, B, i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(B, CT[a['componentType']], a['count'] * NC[a['type']], bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], -1)
J, B = glb(SRC); p = J['meshes'][0]['primitives'][0]
P = acc(J, B, p['attributes']['POSITION']).astype(float); UV = acc(J, B, p['attributes']['TEXCOORD_0']).astype(float); F = acc(J, B, p['indices']).reshape(-1, 3).astype(int)
im = J['images'][J['textures'][J['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]; bv = J['bufferViews'][im['bufferView']]
T = np.array(Image.open(io.BytesIO(B[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])).convert('RGB')).astype(int); H, W = T.shape[:2]
col = T[np.clip((UV[:, 1] * H).astype(int), 0, H - 1), np.clip((UV[:, 0] * W).astype(int), 0, W - 1)]; lum = col.mean(1); dark = lum < 75; skin = (lum > 110) & (col[:, 0] > col[:, 2])
S = P[skin]; top = P[:, 1].max(); hh = top - P[:, 1].min()
# the head: nose tip = the most forward skin in the top third; ears = the widest skin around it
headS = S[S[:, 1] > top - 0.42 * hh]; nose = headS[np.argmax(headS[:, 2])]
band = headS[np.abs(headS[:, 1] - nose[1] - 0.02 * hh) < 0.05 * hh]; eL = band[np.argmax(band[:, 0])]; eR = band[np.argmin(band[:, 0])]
MN = np.array([0.0, 1.496, 0.182]); MEW = 0.268                       # his nose tip and ear-to-ear width
sc = MEW / (eL[0] - eR[0]); cx = (eL[0] + eR[0]) / 2
Q = (P - np.array([cx, nose[1], nose[2]])) * sc + MN
print('scale %.3f nose' % sc, np.round(nose, 3), 'ears', np.round(eL, 3), np.round(eR, 3), 'top after fit %.3f' % Q[:, 1].max())
# the beard: dark, below the eye line, in front of the ears (the head hair is above and behind)
earz = ((eL[2] + eR[2]) / 2 - nose[2]) * sc + MN[2]
bv_ = dark & (Q[:, 1] < 1.535) & (Q[:, 2] > earz + 0.012) & (Q[:, 1] > (1.30 if TH >= 1 else 1.392))
if len(a) > 3 and a[3] == 'strap':   # a chin strap: only the band along the jaw line and the sideburns
    ax = np.abs(Q[:, 0]); bv_ &= (Q[:, 1] < 1.392 + 0.03 * (ax / 0.08) ** 2 + 0.024) | (ax > 0.1) | ((Q[:, 2] < 0.085) & (ax > 0.075))
keep = bv_[F].all(1); Fk = F[keep]; used = np.unique(Fk); remap = -np.ones(len(P), int); remap[used] = np.arange(len(used)); V = Q[used]; Fk = remap[Fk]
print('beard verts', len(V), 'tris', len(Fk), 'y %.3f..%.3f z %.3f..%.3f' % (V[:, 1].min(), V[:, 1].max(), V[:, 2].min(), V[:, 2].max()))
# his head, to sit the beard on
MJ, MB = glb('/home/claude/out/male-base.glb'); mp = MJ['meshes'][0]['primitives'][0]
MP = acc(MJ, MB, mp['attributes']['POSITION']).astype(float); MF = acc(MJ, MB, mp['indices']).reshape(-1, 3).astype(int)
hv = MP[:, 1] > 1.30; hf = hv[MF].all(1); bvh = BVHTree.FromPolygons([Vector(v) for v in MP], [tuple(int(i) for i in f) for f in MF[hf]])
out = V.copy(); sd = np.zeros(len(V))
for i, v in enumerate(V):
    loc, nrm, _, dist = bvh.find_nearest(Vector(v)); d = Vector(v) - loc; s = d.dot(nrm); sd[i] = s
    taper = np.clip((1.535 - v[1]) / 0.05, 0.15, 1)                                 # thin at the sideburn, where it meets the hair
    want = 0.004 + max(0.0, min(s, 0.05) - 0.004) * TH * taper
    out[i] = np.array(loc) + np.array(nrm) * max(want, 0.004)
print('gap to his face before: median %.3f min %.3f max %.3f' % (np.median(sd), sd.min(), sd.max()))
# one solid shell
bpy.ops.wm.read_factory_settings(use_empty=True)
me = bpy.data.meshes.new('b'); me.from_pydata([tuple(v) for v in out], [], [tuple(int(i) for i in f) for f in Fk]); me.update(); ob = bpy.data.objects.new('b', me); bpy.context.scene.collection.objects.link(ob); bpy.context.view_layer.objects.active = ob; ob.select_set(True)
m = ob.modifiers.new('s', 'SOLIDIFY'); m.thickness = 0.014 if TH >= 1 else 0.008; m.offset = 0; bpy.ops.object.modifier_apply(modifier='s')
m = ob.modifiers.new('r', 'REMESH'); m.mode = 'VOXEL'; m.voxel_size = 0.0035; bpy.ops.object.modifier_apply(modifier='r')
m = ob.modifiers.new('sm', 'SMOOTH'); m.iterations = 3; m.factor = 0.5; bpy.ops.object.modifier_apply(modifier='sm')
if len(ob.data.polygons) * 2 > 7000:
    m = ob.modifiers.new('d', 'DECIMATE'); m.ratio = 7000 / (len(ob.data.polygons) * 2); bpy.ops.object.modifier_apply(modifier='d')
bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.triangulate(bm, faces=bm.faces); bm.to_mesh(ob.data); bm.free(); ob.data.update()
Vo = np.array([v.co[:] for v in ob.data.vertices], np.float32); No = np.array([v.normal[:] for v in ob.data.vertices], np.float32); Fo = np.array([p.vertices[:] for p in ob.data.polygons], np.uint32)
rng = np.random.default_rng(3); val = np.clip(0.8 + 0.1 * np.sin(Vo[:, 0] * 180) * np.sin(Vo[:, 1] * 140) + rng.normal(0, 0.03, len(Vo)), 0.62, 1.0); Cv = (np.repeat(val[:, None], 3, 1) * 255).astype(np.uint8)
BIN = bytearray(); views = []; accs = []
def add(arr, comp, typ, mm=False, norm=False):
    while len(BIN) % 4: BIN.append(0)
    views.append({'buffer': 0, 'byteOffset': len(BIN), 'byteLength': arr.nbytes}); BIN.extend(arr.tobytes()); a = {'bufferView': len(views) - 1, 'componentType': comp, 'type': typ, 'count': int(arr.shape[0])}
    if mm: a['min'] = [float(x) for x in arr.min(0)]; a['max'] = [float(x) for x in arr.max(0)]
    if norm: a['normalized'] = True
    accs.append(a); return len(accs) - 1
pr = {'attributes': {'POSITION': add(Vo, 5126, 'VEC3', True), 'NORMAL': add(No, 5126, 'VEC3'), 'COLOR_0': add(Cv, 5121, 'VEC3', norm=True)}, 'indices': add(Fo.reshape(-1), 5125, 'SCALAR'), 'material': 0}
while len(BIN) % 4: BIN.append(0)
GJ = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': 'beard', 'mesh': 0}], 'meshes': [{'primitives': [pr]}], 'materials': [{'name': 'hair', 'doubleSided': True}], 'bufferViews': views, 'accessors': accs, 'buffers': [{'byteLength': len(BIN)}]}
js = json.dumps(GJ, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
open(OUT, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(BIN)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(BIN), 0x004E4942) + bytes(BIN))
print(OUT, 'verts', len(Vo), 'tris', len(Fo), '%.2f MB' % (len(BIN) / 1e6))
