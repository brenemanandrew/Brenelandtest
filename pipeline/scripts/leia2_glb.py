"""Assemble the new Leia GLB: old Leia's skeleton (arm joints warped like the mesh), new mesh, baked texture."""
import json, struct, io, numpy as np
from PIL import Image

d = open('/home/claude/in3/leia.glb', 'rb').read(); L = struct.unpack('<I', d[12:16])[0]; J = json.loads(d[20:20 + L])
D = np.load('/home/claude/out/leia2_data.npz')
N = J['nodes']


def q2m(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def M(n):
    m = np.eye(4); m[:3, :3] = q2m(n.get('rotation', [0, 0, 0, 1])) * np.array(n.get('scale', [1, 1, 1])); m[:3, 3] = n.get('translation', [0, 0, 0]); return m


par = {c: i for i, n in enumerate(N) for c in n.get('children', [])}
W = {}


def world(i):
    if i not in W: W[i] = (world(par[i]) if i in par else np.eye(4)) @ M(N[i])
    return W[i]


for i in range(len(N)): world(i)
K_ARM, DY, DZ, X0 = 0.753 / 0.781, -0.016, 0.0, 0.17
ss = lambda x: float(np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1)))


def warp(p):
    p = p.copy(); ax = abs(p[0]); k = ss((ax - 0.16) / 0.1) * ss((p[1] - 1.12) / 0.08)
    nx = np.sign(p[0]) * (X0 + (ax - X0) * K_ARM if ax > X0 else ax)
    p[0] += (nx - p[0]) * k; p[1] += DY * k; p[2] += DZ * k; p[2] += -0.03 * ss((p[1] - 0.9) / 0.2); return p


joints = J['skins'][0]['joints']
newW = {i: W[i].copy() for i in W}
for i in joints: newW[i][:3, 3] = warp(W[i][:3, 3])
for i in joints:  # local translation from the warped world positions, rotations kept
    pw = newW[par[i]] if i in par else np.eye(4)
    loc = np.linalg.inv(pw) @ newW[i]; N[i]['translation'] = [float(x) for x in loc[:3, 3]]
moved = max(np.linalg.norm(newW[i][:3, 3] - W[i][:3, 3]) for i in joints)
print('largest joint move %.3f m' % moved)

BIN = bytearray(); J['bufferViews'] = []; J['accessors'] = []


def add(arr, comp, typ, target=None, mm=False):
    while len(BIN) % 4: BIN.append(0)
    data = arr.tobytes(); off = len(BIN); BIN.extend(data)
    bv = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target: bv['target'] = target
    J['bufferViews'].append(bv)
    a = {'bufferView': len(J['bufferViews']) - 1, 'componentType': comp, 'type': typ, 'count': int(arr.shape[0])}
    if mm: a['min'] = [float(x) for x in arr.min(0)]; a['max'] = [float(x) for x in arr.max(0)]
    J['accessors'].append(a); return len(J['accessors']) - 1


ibm = np.stack([np.linalg.inv(newW[i]).T.reshape(-1) for i in joints]).astype(np.float32)  # column-major
J['skins'][0]['inverseBindMatrices'] = add(ibm, 5126, 'MAT4')
prim = J['meshes'][0]['primitives'][0]
prim['attributes'] = {'POSITION': add(D['P'], 5126, 'VEC3', 34962, True), 'NORMAL': add(D['N'] / np.linalg.norm(D['N'], axis=1, keepdims=True).clip(1e-9), 5126, 'VEC3', 34962),
                      'TEXCOORD_0': add(D['UV'], 5126, 'VEC2', 34962), 'JOINTS_0': add(D['J'], 5123, 'VEC4', 34962), 'WEIGHTS_0': add(D['W'], 5126, 'VEC4', 34962)}
prim['indices'] = add(D['I'].reshape(-1), 5125, 'SCALAR', 34963)
buf = io.BytesIO(); Image.open('/home/claude/out/leia2_base.png').convert('RGB').save(buf, 'JPEG', quality=88)
while len(BIN) % 4: BIN.append(0)
off = len(BIN); BIN.extend(buf.getvalue()); J['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(buf.getvalue())})
J['images'] = [{'bufferView': len(J['bufferViews']) - 1, 'mimeType': 'image/jpeg', 'name': 'base'}]
J['textures'] = [{'source': 0, 'sampler': 0}]
J['materials'] = [{'name': 'Leia', 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 0.85}}]
J.pop('animations', None)
while len(BIN) % 4: BIN.append(0)
J['buffers'] = [{'byteLength': len(BIN)}]
js = json.dumps(J, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
open('/home/claude/out/leia2-base.glb', 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(BIN)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(BIN), 0x004E4942) + bytes(BIN))
print('leia2-base.glb %.2f MB' % ((28 + len(js) + len(BIN)) / 1e6))
