"""Nala: Meshy's dog -> models/characters/nala_mesh.glb + nala_meta.json, in the game dog's frame (faces +z, feet on y=0,
x1000 Meshy units). Steps: turn her body onto +z (her head-hips line, then her body's main axis), centre, straighten her head
(Meshy turned it 35 degrees right) about the collar. Meta: her tail joints and Meshy's own tail weights (usable, unlike the
rest of its rig) and the lower jaw, all in the same frame / vertex order."""
import json, numpy as np, trimesh, struct
SRC = 'models/characters/nala_meshy_original.glb'
sc = trimesh.load(SRC, force='scene'); g = list(sc.geometry.values())[0]
v = g.vertices * 1000; uv = g.visual.uv; tex = g.visual.material.baseColorTexture
b = open(SRC, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; J = json.loads(b[20:20 + n]); ln = struct.unpack('<I', b[20 + n:24 + n])[0]; B = b[28 + n:28 + n + ln]
def acc(i, dt, k):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]; o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return np.frombuffer(B[o:o + a['count'] * k * np.dtype(dt).itemsize], dtype=dt).reshape(a['count'], k)
pr = J['meshes'][0]['primitives'][0]['attributes']
jn = acc(pr['JOINTS_0'], '<u2' if J['accessors'][pr['JOINTS_0']]['componentType'] == 5123 else '<u1', 4).astype(int)
wt = acc(pr['WEIGHTS_0'], '<f4', 4)
assert len(jn) == len(v), (len(jn), len(v))
names = [J['nodes'][i]['name'] for i in J['skins'][0]['joints']]
ibm = acc(J['skins'][0]['inverseBindMatrices'], '<f4', 16).reshape(-1, 4, 4).transpose(0, 2, 1)
jp = {names[k]: np.linalg.inv(ibm[k])[:3, 3] * 1000 for k in range(len(names))}
TAIL = {'tail': 0, 'tailstart': 0, 'tail1': 1, 'tail2': 2, 'tail3': 3}
tw = np.zeros((len(v), 4))
for s in range(4):
    for k, nm in enumerate(names):
        if nm in TAIL: tw[:, TAIL[nm]] += np.where(jn[:, s] == k, wt[:, s], 0)
pts = {k: jp[k].copy() for k in ['Hips', 'tailstart', 'tail1', 'tail2', 'tail3', 'head', 'chest']}
def turn(P, a, c=(0, 0, 0)):
    c = np.array(c); x = P[..., 0] - c[0]; z = P[..., 2] - c[2]; ca, sa = np.cos(a), np.sin(a); Q = P.copy(); Q[..., 0] = c[0] + x * ca + z * sa; Q[..., 2] = c[2] - x * sa + z * ca; return Q
d = pts['head'][[0, 2]] - pts['Hips'][[0, 2]]; a1 = -np.arctan2(d[0], d[1]); v = turn(v, a1); pts = {k: turn(p, a1) for k, p in pts.items()}
low = v[:, 1] < 0.6 * v[:, 1].max(); xz = v[low][:, [0, 2]] - v[low][:, [0, 2]].mean(0); w, U = np.linalg.eigh(np.cov(xz.T)); ax = U[:, 1]; a2 = np.arctan2(ax[0], ax[1])
if abs(a2) > np.pi / 2: a2 -= np.sign(a2) * np.pi
v = turn(v, -a2); pts = {k: turn(p, -a2) for k, p in pts.items()}
mn, mx = v.min(0), v.max(0); off = np.array([(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2]); v -= off; pts = {k: p - off for k, p in pts.items()}
# straighten the head about the collar (the purple ring)
t3 = np.asarray(tex.convert('RGB')); h, ww = t3.shape[:2]
c = t3[np.clip(((1 - uv[:, 1] % 1) * (h - 1)).astype(int), 0, h - 1), np.clip(((uv[:, 0] % 1) * (ww - 1)).astype(int), 0, ww - 1)].astype(int)
H = v[:, 1].max(); purple = (c[:, 2] > c[:, 1] + 15) & (c[:, 0] > c[:, 1]) & (v[:, 1] > 0.4 * H); C = v[purple].mean(0)
front = v[:, 2] > C[2]; nose = v[front][np.argmax(v[front][:, 2])]; phi = np.arctan2(-(nose[0] - C[0]), nose[2] - C[2])
tt = np.clip((v[:, 2] - (C[2] - 0.35)) / 0.35, 0, 1); tt = tt * tt * (3 - 2 * tt)
a = phi * tt; x = v[:, 0] - C[0]; z = v[:, 2] - C[2]; v[:, 0] = C[0] + x * np.cos(a) + z * np.sin(a); v[:, 2] = C[2] - x * np.sin(a) + z * np.cos(a)
front = v[:, 2] > C[2]; nose = v[front][np.argmax(v[front][:, 2])]
# the lower jaw: in front of the head's middle, below the mouth line (just under the nose's height), not the collar
hc = v[front & (v[:, 1] > C[1])].mean(0); mouthY = nose[1] - 0.06 * H
jaw = front & (v[:, 2] > hc[2]) & (v[:, 1] < mouthY) & (v[:, 1] > mouthY - 0.3) & ~purple
mat = trimesh.visual.material.PBRMaterial(baseColorTexture=tex.convert('RGB').resize((1024, 1024)), metallicFactor=0, roughnessFactor=1)
trimesh.Trimesh(v, g.faces, visual=trimesh.visual.TextureVisuals(uv=uv, material=mat), process=False).export('models/characters/nala_mesh.glb', include_normals=True)
tv = np.nonzero(tw.sum(1) > 0.3)[0]
meta = {'tail_joints': [pts[k].round(4).tolist() for k in ['tailstart', 'tail1', 'tail2', 'tail3']],
        'tail_weights': [[int(i)] + tw[i].round(3).tolist() for i in tv], 'jaw': np.nonzero(jaw)[0].tolist(),
        'hinge': [float(C[0]), float(mouthY), float(hc[2])], 'collar': C.round(4).tolist(), 'nose': nose.round(4).tolist()}
json.dump(meta, open('models/characters/nala_meta.json', 'w'))
print('tail verts', len(tv), 'jaw verts', int(jaw.sum()), 'tail joints', meta['tail_joints'], 'nose', meta['nose'])
