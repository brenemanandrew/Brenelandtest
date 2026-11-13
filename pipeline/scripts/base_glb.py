"""Assemble the base body GLB: Belinda's skeleton and Mixamo clips, the new mesh, its heat weights and textures."""
import json, struct, io, sys, numpy as np
from PIL import Image

NEW, OUT = sys.argv[1], sys.argv[2]


def glb(f):
    d = open(f, 'rb').read(); L = struct.unpack('<I', d[12:16])[0]
    return json.loads(d[20:20 + L]), d[20 + L + 8:]


CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def acc(J, B, i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(B, CT[a['componentType']], a['count'] * NC[a['type']], bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], -1)


import os
J, B = glb(os.environ.get('SKEL', '/home/claude/out/base-skel.glb')); JN, BN = glb(NEW); S = np.load(os.environ.get('NPZ', '/home/claude/out/base_skin.npz'))
pn = JN['meshes'][0]['primitives'][0]
NRM = acc(JN, BN, pn['attributes']['NORMAL']).astype(np.float32); UV = acc(JN, BN, pn['attributes']['TEXCOORD_0']).astype(np.float32)
IND = acc(JN, BN, pn['indices']).reshape(-1).astype(np.uint32)

BIN = bytearray(); views = []; accs = []


def push(data):
    while len(BIN) % 4: BIN.append(0)
    off = len(BIN); BIN.extend(data); views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}); return len(views) - 1


def add(arr, comp, typ, target=None, mm=False):
    v = push(arr.tobytes())
    if target: views[v]['target'] = target
    a = {'bufferView': v, 'componentType': comp, 'type': typ, 'count': int(arr.shape[0])}
    if mm: a['min'] = [float(x) for x in arr.min(0)]; a['max'] = [float(x) for x in arr.max(0)]
    accs.append(a); return len(accs) - 1


# keep skin and animation accessors from Belinda's file
remap = {}
def keep(i):
    if i in remap: return remap[i]
    a = dict(J['accessors'][i]); bv = J['bufferViews'][a['bufferView']]; o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    n = a['count'] * NC[a['type']] * np.dtype(CT[a['componentType']]).itemsize
    a['bufferView'] = push(B[o:o + n]); a.pop('byteOffset', None); accs.append(a); remap[i] = len(accs) - 1; return remap[i]


J['skins'][0]['inverseBindMatrices'] = keep(J['skins'][0]['inverseBindMatrices'])
for an in J.get('animations', []):
    for sm in an['samplers']: sm['input'] = keep(sm['input']); sm['output'] = keep(sm['output'])
prim = J['meshes'][0]['primitives'][0]
prim['attributes'] = {'POSITION': add(S['P'].astype(np.float32), 5126, 'VEC3', 34962, True), 'NORMAL': add(NRM, 5126, 'VEC3', 34962),
                      'TEXCOORD_0': add(UV, 5126, 'VEC2', 34962), 'JOINTS_0': add(S['J'].astype(np.uint16), 5123, 'VEC4', 34962),
                      'WEIGHTS_0': add(S['W'].astype(np.float32), 5126, 'VEC4', 34962)}
prim['indices'] = add(IND, 5125, 'SCALAR', 34963)
prim['material'] = 0
imgs = []
mat = JN['materials'][0]
for role, ti in (('base', mat['pbrMetallicRoughness']['baseColorTexture']['index']), ('normal', mat.get('normalTexture', {}).get('index'))):
    if ti is None: continue
    im = JN['images'][JN['textures'][ti]['source']]; bv = JN['bufferViews'][im['bufferView']]; o = bv.get('byteOffset', 0)
    I = Image.open(io.BytesIO(BN[o:o + bv['byteLength']])).convert('RGB')
    if role == 'normal': I = I.resize((1024, 1024), Image.LANCZOS)
    b = io.BytesIO(); I.save(b, 'JPEG', quality=90); imgs.append({'bufferView': push(b.getvalue()), 'mimeType': 'image/jpeg', 'name': role})
J['images'] = imgs; J['textures'] = [{'source': i, 'sampler': 0} for i in range(len(imgs))]
J['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
J['materials'] = [{'name': 'Base', 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 0.9},
                   **({'normalTexture': {'index': 1}} if len(imgs) > 1 else {})}]
J['bufferViews'] = views; J['accessors'] = accs
while len(BIN) % 4: BIN.append(0)
J['buffers'] = [{'byteLength': len(BIN)}]
js = json.dumps(J, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
open(OUT, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(BIN)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(BIN), 0x004E4942) + bytes(BIN))
print(OUT, '%.2f MB' % ((28 + len(js) + len(BIN)) / 1e6), [a['name'] for a in J.get('animations', [])])
