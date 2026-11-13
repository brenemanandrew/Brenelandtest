"""Face-shape morph targets for the base body: round, square, heart, diamond, oblong (oval is the face as made).
Each is a smooth reshaping of the jaw, cheeks, chin and forehead around the head's midline, front of the head only, with the
neck held still so the seam never tears. Appends targets to the GLB.  Usage: face_shapes.py in.glb out.glb"""
import json, struct, sys, numpy as np

SRC, OUT = sys.argv[1], sys.argv[2]
d = open(SRC, 'rb').read(); L = struct.unpack('<I', d[12:16])[0]; o = 20 + L
J = json.loads(d[20:20 + L]); B = bytearray(d[o + 8:o + 8 + struct.unpack('<I', d[o:o + 4])[0]])
pr = J['meshes'][0]['primitives'][0]


def acc(i, n=3):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(bytes(B), np.float32 if a['componentType'] == 5126 else np.uint32, a['count'] * n, bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], n).astype(float)


P = acc(pr['attributes']['POSITION']); F = acc(pr['indices'], 1).reshape(-1, 3).astype(int)
import os
P0 = P; KX = 1.0
if os.environ.get('FACEXF'):                         # another head: measure it in the base head's frame (midline, eye line, scale, depth)
    Mm, YE, KX, ZO = [float(v) for v in os.environ['FACEXF'].split(',')]
    P = np.c_[(P0[:, 0] - Mm) / KX, 1.506 + (P0[:, 1] - YE) / KX, P0[:, 2] - ZO]
YC, YT = 1.335, P[:, 1].max()                       # chin and crown
u = (P[:, 1] - YC) / (YT - YC); x, y, z = P[:, 0], P[:, 1], P[:, 2]
ss = lambda t: np.clip(t, 0, 1) ** 2 * (3 - 2 * np.clip(t, 0, 1))
bump = lambda c, w: np.exp(-((u - c) / w) ** 2)
head = (y > 1.29) & (np.abs(x) < 0.21)
front = ss((z + 0.06) / 0.1)                         # the face side of the head; the back of the skull stays
neck = ss((y - 1.305) / 0.03)                        # the neck below the jaw never moves
mid = lambda w: np.clip(1 - np.abs(x) / w, 0, 1)     # near the midline (the point of the chin)
W = np.where(head, front * neck, 0)

S = {}
dx = x * 0.12 * bump(0.22, 0.14); dy = 0.010 * bump(0.0, 0.08) * mid(0.06)
S['round'] = np.c_[dx, dy, np.zeros_like(x)]
dx = x * 0.16 * bump(0.12, 0.09) + np.sign(x) * 0.012 * bump(0.02, 0.06) * (1 - mid(0.015))
S['square'] = np.c_[dx, 0.004 * bump(0.0, 0.06) * mid(0.05), np.zeros_like(x)]
dx = x * (0.09 * bump(0.5, 0.14) - 0.14 * bump(0.14, 0.1)); dy = -0.007 * bump(0.0, 0.06) * mid(0.04)
S['heart'] = np.c_[dx, dy, 0.004 * bump(0.0, 0.06) * mid(0.04)]
dx = x * (0.11 * bump(0.42, 0.09) - 0.09 * bump(0.75, 0.14) - 0.10 * bump(0.14, 0.09)); dy = -0.004 * bump(0.0, 0.06) * mid(0.04)
S['diamond'] = np.c_[dx, dy, np.zeros_like(x)]
dy = -0.035 * (1 - ss(u / 0.15)); dx = x * -0.07 * bump(0.3, 0.25) * (1 - np.exp(-((u - 0.2) / 0.05) ** 2) * mid(0.08))   # the chin grows, the lips keep their shape
S['oblong'] = np.c_[dx, dy, np.zeros_like(x)]

# noses: around the tip (her face's midline is x=0.0175)
NM, NY, NZ = (0.0, float(os.environ.get('NOSEY', '1.4556')), 0.166) if os.environ.get('FACEXF') else (0.0175, 1.4556, 0.166)
rn = np.hypot((x - NM) / 0.04, (y - (NY + 0.006)) / 0.05); nw = np.where(head, ss(1 - rn) * ss((z - 0.1) / 0.03), 0)
tip = np.where(head, ss(1 - np.hypot((x - NM) / 0.022, (y - NY) / 0.02)) * ss((z - 0.13) / 0.02), 0)
bridge = np.where(head, ss(1 - np.abs(x - NM) / 0.018) * np.exp(-((y - 1.49) / 0.03) ** 2) * ss((z - 0.12) / 0.02), 0)
S2 = {}
S2['nose_button'] = np.c_[np.zeros_like(x), 0.005 * tip, -0.007 * tip] + np.c_[(x - NM) * -0.1 * nw, np.zeros_like(x), np.zeros_like(x)]
S2['nose_straight'] = np.c_[np.zeros_like(x), -0.002 * tip, 0.005 * bridge + 0.002 * tip]
S2['nose_wide'] = np.c_[(x - NM) * 0.38 * nw * ss((1.47 - y) / 0.02), np.zeros_like(x), -0.002 * tip]
S2['nose_minimal'] = np.c_[(x - NM) * -0.15 * nw, 0.002 * tip, -(np.maximum(z - 0.12, 0)) * 0.55 * nw]
S = {k: v * KX for k, v in S.items()}; S2 = {k: v * KX for k, v in S2.items()}; P = P0
_, inv = np.unique(np.round(P * 1e5).astype(np.int64), axis=0, return_inverse=True); inv = inv.ravel()
U = np.zeros((inv.max() + 1, 3)); U[inv] = P; FU = inv[F]


def vnorm(Q):
    fn = np.cross(Q[FU[:, 1]] - Q[FU[:, 0]], Q[FU[:, 2]] - Q[FU[:, 0]]); vn = np.zeros_like(Q)
    for k in range(3): np.add.at(vn, FU[:, k], fn)
    return vn / np.linalg.norm(vn, axis=1, keepdims=True).clip(1e-12)


n0 = vnorm(U)
def add(arr, mm=False):
    while len(B) % 4: B.append(0)
    data = arr.astype(np.float32).tobytes(); off = len(B); B.extend(data)
    J['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data), 'target': 34962})
    a = {'bufferView': len(J['bufferViews']) - 1, 'componentType': 5126, 'type': 'VEC3', 'count': int(arr.shape[0])}
    if mm: a['min'] = [float(v) for v in arr.min(0)]; a['max'] = [float(v) for v in arr.max(0)]
    J['accessors'].append(a); return len(J['accessors']) - 1


me = J['meshes'][0]; names = me.setdefault('extras', {}).setdefault('targetNames', [])
keep = [i for i, n in enumerate(names) if not n.startswith('face_') and not n.startswith('nose_')]
pr['targets'] = [pr['targets'][i] for i in keep]; me['extras']['targetNames'] = names = [names[i] for i in keep]
for nm, D in S.items():
    D = D * W[:, None] * (1.0 if nm == 'oblong' else 1.6); Du = np.zeros_like(U); Du[inv] = D
    pr['targets'].append({'POSITION': add(D, True), 'NORMAL': add((vnorm(U + Du) - n0)[inv])}); names.append('face_' + nm)
    print(nm, 'max move %.3f m' % np.linalg.norm(D, axis=1).max())
for nm, D in S2.items():
    Du = np.zeros_like(U); Du[inv] = D
    pr['targets'].append({'POSITION': add(D, True), 'NORMAL': add((vnorm(U + Du) - n0)[inv])}); names.append(nm)
    print(nm, 'max move %.4f m' % np.linalg.norm(D, axis=1).max())
me['weights'] = [0.0] * len(pr['targets'])
J['buffers'][0]['byteLength'] = len(B)
while len(B) % 4: B.append(0)
js = json.dumps(J, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
open(OUT, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(B)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(B), 0x004E4942) + bytes(B))
print(OUT, '%.2f MB' % ((28 + len(js) + len(B)) / 1e6), names)
