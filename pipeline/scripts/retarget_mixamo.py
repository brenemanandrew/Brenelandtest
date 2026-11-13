"""Retarget a Mixamo clip (converted to GLB by Blender, its own skeleton and rest pose) onto Belinda's Mixamo skeleton.
Each bone's world turn is carried over relative to a rest pose in which the target bone first points the way the source
bone pointed (so a T-pose source drives an A-pose target correctly). The hips' travel is scaled by hip height.
Writes the clip into a copy of the target GLB.  Usage: retarget_mixamo.py src.glb target.glb out.glb ClipName"""
import json, struct, sys, numpy as np

SRC, TGT, OUT, NAME = sys.argv[1:5]


def glb(f):
    d = open(f, 'rb').read(); L = struct.unpack('<I', d[12:16])[0]; o = 20 + L
    return json.loads(d[20:20 + L]), bytearray(d[o + 8:o + 8 + struct.unpack('<I', d[o:o + 4])[0]])


CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def acc(J, B, i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(bytes(B), CT[a['componentType']], a['count'] * NC[a['type']], bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], -1).astype(float)


def q2m(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def m2q(m):
    t = np.trace(m)
    if t > 0: s = np.sqrt(t + 1) * 2; return np.array([(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, 0.25 * s])
    i = int(np.argmax(np.diag(m))); j, k = (i + 1) % 3, (i + 2) % 3; s = np.sqrt(1 + m[i, i] - m[j, j] - m[k, k]) * 2; q = np.zeros(4)
    q[i] = 0.25 * s; q[j] = (m[j, i] + m[i, j]) / s; q[k] = (m[k, i] + m[i, k]) / s; q[3] = (m[k, j] - m[j, k]) / s; return q


def rot_between(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); v = np.cross(a, b); c = a @ b
    if c < -0.99999: return -np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); return np.eye(3) + vx + vx @ vx / (1 + c)


def TRS(t, r, s):
    M = np.eye(4); M[:3, :3] = q2m(r) * np.array(s); M[:3, 3] = t; return M


# ---- source: per-frame local TRS for every node, then world
JS, BS = glb(SRC); NS = JS['nodes']; parS = {c: i for i, n in enumerate(NS) for c in n.get('children', [])}
an = JS['animations'][0]; T = None; anim = {}
for ch in an['channels']:
    sm = an['samplers'][ch['sampler']]; t = acc(JS, BS, sm['input'])[:, 0]; v = acc(JS, BS, sm['output'])
    T = t if T is None or len(t) > len(T) else T; anim[(ch['target']['node'], ch['target']['path'])] = (t, v)
nF = len(T); print('source frames', nF, 'duration %.2f s' % (T[-1] - T[0]))


def sample(node, path, default):
    if (node, path) not in anim: return np.tile(default, (nF, 1))
    t, v = anim[(node, path)]
    if len(t) == nF: return v
    return np.stack([np.interp(T, t, v[:, k]) for k in range(v.shape[1])], 1)


loc = {}
for i, n in enumerate(NS):
    tr = sample(i, 'translation', np.array(n.get('translation', [0, 0, 0]), float)); ro = sample(i, 'rotation', np.array(n.get('rotation', [0, 0, 0, 1]), float))
    sc = sample(i, 'scale', np.array(n.get('scale', [1, 1, 1]), float)); loc[i] = (tr, ro, sc)
restS = {i: TRS(n.get('translation', [0, 0, 0]), n.get('rotation', [0, 0, 0, 1]), n.get('scale', [1, 1, 1])) for i, n in enumerate(NS)}
WS_rest, WS = {}, {}
def wrest(i):
    if i not in WS_rest: WS_rest[i] = (wrest(parS[i]) if i in parS else np.eye(4)) @ restS[i]
    return WS_rest[i]
def wanim(i):
    if i not in WS:
        tr, ro, sc = loc[i]; L = np.stack([TRS(tr[f], ro[f], sc[f]) for f in range(nF)])
        WS[i] = (wanim(parS[i]) if i in parS else np.tile(np.eye(4), (nF, 1, 1))) @ L
    return WS[i]
sname = {n.get('name'): i for i, n in enumerate(NS)}

# ---- target: Belinda's bind (from her inverse bind matrices) and node hierarchy
JT, BT = glb(TGT); NT = JT['nodes']; parT = {c: i for i, n in enumerate(NT) for c in n.get('children', [])}
joints = JT['skins'][0]['joints']; IBM = acc(JT, BT, JT['skins'][0]['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
WT = {j: np.linalg.inv(IBM[k]) for k, j in enumerate(joints)}
orth = lambda m: m / np.linalg.norm(m, axis=0)
MAIN = {}
for n in NT:
    nm = n.get('name', '')
    kids = [NT[c].get('name') for c in n.get('children', []) if NT[c].get('name', '').startswith('mixamorig')]
    pref = [k for k in kids if any(s in k for s in ('Spine', 'Neck', 'Head', 'Arm', 'Hand', 'Leg', 'Foot', 'Toe', 'Middle1'))]
    if kids: MAIN[nm] = (pref or kids)[0] if not nm.endswith('Hand') else next((k for k in kids if 'Middle1' in k), kids[0])
    if nm == 'mixamorig:Hips': MAIN[nm] = 'mixamorig:Spine'
tname = {n.get('name'): i for i, n in enumerate(NT)}
order = []
def walk(i):
    order.append(i)
    for c in NT[i].get('children', []):
        if c in WT: walk(c)
walk(tname['mixamorig:Hips'])

Wt = {}     # target world rotation per frame
outq = {}
hipS, hipT = sname['mixamorig:Hips'], tname['mixamorig:Hips']
for j in order:
    nm = NT[j]['name']; Rt = orth(WT[j][:3, :3])
    if nm not in sname:
        p = parT.get(j); Rp = orth(WT[p][:3, :3]) if p in WT else np.eye(3)
        Wt[j] = np.stack([(Wt[p][f] if p in Wt else np.eye(3)) @ Rp.T @ Rt for f in range(nF)]); continue
    s = sname[nm]; Rs = orth(wrest(s)[:3, :3])
    C = np.eye(3)
    LIMB = any(k in nm for k in ('Shoulder', 'Arm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'Toe'))
    if LIMB and nm in MAIN and MAIN[nm] in sname and MAIN[nm] in tname and tname[MAIN[nm]] in WT:
        ds = wrest(sname[MAIN[nm]])[:3, 3] - wrest(s)[:3, 3]; dt = WT[tname[MAIN[nm]]][:3, 3] - WT[j][:3, 3]
        if np.linalg.norm(ds) > 1e-6 and np.linalg.norm(dt) > 1e-6: C = rot_between(dt, ds)
    A = wanim(s)[:, :3, :3]; A = A / np.linalg.norm(A, axis=1, keepdims=True)
    Wt[j] = A @ (Rs.T @ C @ Rt)
for j in order:
    p = parT.get(j); Rp = Wt[p] if p in Wt else np.tile(np.eye(3), (nF, 1, 1))
    L = np.transpose(Rp, (0, 2, 1)) @ Wt[j]; outq[j] = np.stack([m2q(m) for m in L])
    for f in range(1, nF):
        if outq[j][f] @ outq[j][f - 1] < 0: outq[j][f] *= -1
# hips travel: source hips world offset from its rest, scaled by hip height, in the target hips' parent frame
hs0 = wrest(hipS)[:3, 3]; hsT = wanim(hipS)[:, :3, 3]; ht0 = WT[hipT][:3, 3]; k = ht0[1] / hs0[1]
pw = WT[parT[hipT]] if parT.get(hipT) in WT else np.eye(4)
hp = np.stack([(np.linalg.inv(pw) @ np.r_[ht0 + (h - hs0) * k, 1])[:3] for h in hsT])
if not (len(sys.argv) > 5 and sys.argv[5] == 'keep'):
    hp[:, 0] -= hp[:, 0].mean() - (np.linalg.inv(pw) @ np.r_[ht0, 1])[0]; hp[:, 2] -= hp[:, 2].mean() - (np.linalg.inv(pw) @ np.r_[ht0, 1])[2]  # dance in place
if len(sys.argv) > 5 and sys.argv[5] == 'inplace':   # walk on the spot: take out the steady travel, keep the sway
    tt = T - T[0]
    for ax in (0, 2):
        c = np.polyfit(tt, hp[:, ax], 1); hp[:, ax] -= c[0] * tt + c[1] - hp[:, ax].mean() + (hp[:, ax].mean() - (np.linalg.inv(pw) @ np.r_[ht0, 1])[ax])
print('hips scale %.4f, travel x %.3f..%.3f z %.3f..%.3f' % (k, hp[:, 0].min(), hp[:, 0].max(), hp[:, 2].min(), hp[:, 2].max()))

# ---- write the clip into the target GLB
def add(arr, typ, mm=False):
    while len(BT) % 4: BT.append(0)
    data = arr.astype(np.float32).tobytes(); off = len(BT); BT.extend(data)
    JT['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
    a = {'bufferView': len(JT['bufferViews']) - 1, 'componentType': 5126, 'type': typ, 'count': int(arr.shape[0])}
    if mm: a['min'] = [float(x) for x in arr.min(0)]; a['max'] = [float(x) for x in arr.max(0)]
    JT['accessors'].append(a); return len(JT['accessors']) - 1
import os
STEP = int(os.environ.get('STEP', '1'))          # keep every Nth frame (slow clips read fine at 15 fps)
sel = np.r_[np.arange(0, nF, STEP), [nF - 1]] if (nF - 1) % STEP else np.arange(0, nF, STEP)
times = (T[sel] - T[0]).reshape(-1, 1); ti = add(times, 'SCALAR', True)
outq = {j: q[sel] for j, q in outq.items()}; hp = hp[sel]
A = {'name': NAME, 'channels': [], 'samplers': []}
for j in order:
    A['samplers'].append({'input': ti, 'output': add(outq[j], 'VEC4'), 'interpolation': 'LINEAR'}); A['channels'].append({'sampler': len(A['samplers']) - 1, 'target': {'node': j, 'path': 'rotation'}})
A['samplers'].append({'input': ti, 'output': add(hp, 'VEC3'), 'interpolation': 'LINEAR'}); A['channels'].append({'sampler': len(A['samplers']) - 1, 'target': {'node': hipT, 'path': 'translation'}})
JT['animations'] = [a for a in JT.get('animations', []) if a['name'] != NAME] + [A]
while len(BT) % 4: BT.append(0)
JT['buffers'][0]['byteLength'] = len(BT)
js = json.dumps(JT, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
open(OUT, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(BT)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(BT), 0x004E4942) + bytes(BT))
print(OUT, '%.2f MB' % ((28 + len(js) + len(BT)) / 1e6), [a['name'] for a in JT['animations']])
