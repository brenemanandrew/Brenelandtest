"""Skin a new body onto Belinda's skeleton as it stands (the new body was made to match her, and her joints already sit
inside it), with Blender's automatic heat weights. Writes out/base_skin.npz: per original vertex JOINTS/WEIGHTS (Belinda's
joint order), plus the scaled positions. Usage: bvenv/bin/python skin_base.py new.glb"""
import sys, json, struct, numpy as np, bpy
from mathutils import Vector

NEW = sys.argv[-1]


def glb(f):
    d = open(f, 'rb').read(); L = struct.unpack('<I', d[12:16])[0]
    return json.loads(d[20:20 + L]), d[20 + L + 8:]


CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def acc(J, B, i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(B, CT[a['componentType']], a['count'] * NC[a['type']], bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], -1)


import os
MALE = os.environ.get('MALE') == '1'
JB, BB = glb(os.environ.get('SKEL', '/home/claude/out/base-skel.glb')); JN, BN = glb(NEW)
pb = JB['meshes'][0]['primitives'][0]; PB = acc(JB, BB, pb['attributes']['POSITION']).astype(float)
pn = JN['meshes'][0]['primitives'][0]; P = acc(JN, BN, pn['attributes']['POSITION']).astype(float); F = acc(JN, BN, pn['indices']).reshape(-1, 3).astype(int)
s = 1.70 / (P[:, 1].max() - P[:, 1].min()); P = (P - [0, P[:, 1].min(), 0]) * s
P[:, 0] -= (P[:, 0].max() + P[:, 0].min()) / 2
if MALE: P[:, 2] += 0.03
else: P[:, 2] -= (P[:, 2].max() + P[:, 2].min()) / 2 - (PB[:, 2].max() + PB[:, 2].min()) / 2
_, weld = np.unique(np.round(P * 1e5).astype(np.int64), axis=0, return_inverse=True); weld = weld.ravel()
U = np.zeros((weld.max() + 1, 3)); U[weld] = P
FU = weld[F]; FU = FU[(FU[:, 0] != FU[:, 1]) & (FU[:, 1] != FU[:, 2]) & (FU[:, 0] != FU[:, 2])]
print('verts', len(P), 'welded', len(U), 'scale %.4f' % s)

N = JB['nodes']; joints = JB['skins'][0]['joints']
IBM = acc(JB, BB, JB['skins'][0]['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
Wp = {j: np.linalg.inv(IBM[k])[:3, 3] for k, j in enumerate(joints)}
par = {c: i for i, n in enumerate(N) for c in n.get('children', [])}
nm = {j: N[j]['name'] for j in joints}
MAIN = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head', 'Head': 'HeadTop_End'}
for sd in ('Left', 'Right'):
    MAIN.update({sd + 'Shoulder': sd + 'Arm', sd + 'Arm': sd + 'ForeArm', sd + 'ForeArm': sd + 'Hand', sd + 'Hand': sd + 'HandMiddle1',
                 sd + 'UpLeg': sd + 'Leg', sd + 'Leg': sd + 'Foot', sd + 'Foot': sd + 'ToeBase', sd + 'ToeBase': sd + 'Toe_End'})
    for f in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky'):
        for i in (1, 2, 3): MAIN[f'{sd}Hand{f}{i}'] = f'{sd}Hand{f}{i + 1}'
short = {j: nm[j].replace('mixamorig:', '') for j in joints}; byshort = {v: k for k, v in short.items()}
deform = [j for j in joints if not short[j].endswith('_End') and not short[j].endswith('4') and short[j] != 'headfront' and short[j] in
          set(MAIN) | {'HeadTop_End'} - {'HeadTop_End'}]
print('deforming bones', len(deform), 'of', len(joints), 'skipped', [short[j] for j in joints if j not in deform])

bpy.ops.wm.read_factory_settings(use_empty=True)
G = lambda p: Vector((p[0], -p[2], p[1]))  # glTF -> blender axes
me = bpy.data.meshes.new('body'); me.from_pydata([tuple(G(p)) for p in U], [], [tuple(int(x) for x in t) for t in FU]); me.update()
ob = bpy.data.objects.new('Body', me); bpy.context.scene.collection.objects.link(ob)
ad = bpy.data.armatures.new('rig'); ao = bpy.data.objects.new('Rig', ad); bpy.context.scene.collection.objects.link(ao)
bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
eb = {}
for j in joints:
    if j not in deform: continue
    b = ad.edit_bones.new(nm[j]); b.head = G(Wp[j]); sh = short[j]
    if sh in MAIN and MAIN[sh] in byshort: b.tail = G(Wp[byshort[MAIN[sh]]])
    else:
        pj = par[j]; d = Wp[j] - Wp[pj]; b.tail = G(Wp[j] + d / max(np.linalg.norm(d), 1e-6) * 0.03)
    if (b.tail - b.head).length < 1e-4: b.tail = b.head + Vector((0, 0, 0.02))
    eb[j] = b
for j, b in eb.items():
    if par.get(j) in eb: b.parent = eb[par[j]]
bpy.ops.object.mode_set(mode='OBJECT')
for o in bpy.context.view_layer.objects: o.select_set(False)
ob.select_set(True); ao.select_set(True); bpy.context.view_layer.objects.active = ao
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
idx = {nm[j]: k for k, j in enumerate(joints)}
Wd = np.zeros((len(U), len(joints)))
gi = {g.index: idx[g.name] for g in ob.vertex_groups}
for v in me.vertices:
    for g in v.groups:
        Wd[v.index, gi[g.group]] += g.weight
empty = (Wd.sum(1) < 1e-6).sum(); print('verts with no weight', empty)
if empty:   # fall back to the nearest bone segment
    for i in np.where(Wd.sum(1) < 1e-6)[0]:
        best, bj = 9, None
        for j in deform:
            sh = short[j]; a = Wp[j]; b = Wp[byshort[MAIN[sh]]] if sh in MAIN and MAIN[sh] in byshort else a
            t = np.clip(((U[i] - a) @ (b - a)) / max((b - a) @ (b - a), 1e-9), 0, 1); dd = np.linalg.norm(U[i] - (a + t * (b - a)))
            if dd < best: best, bj = dd, j
        Wd[i, idx[nm[bj]]] = 1
# ---- clean-up: heat weights leak across small gaps (elbow to waist, between fingers, thigh to thigh)
def comps(keep):
    par = np.arange(len(U))
    def find(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    for t in FU:
        for a_, b_ in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            if keep[a_] and keep[b_]:
                ra, rb = find(a_), find(b_)
                if ra != rb: par[ra] = rb
    return np.array([find(i) if keep[i] else -1 for i in range(len(U))])
col = {short[j]: idx[nm[j]] for j in joints}
side_arm = {sd: [col[k] for k in col if k.startswith(sd) and ('Arm' in k or 'Hand' in k)] for sd in ('Left', 'Right')}
side_leg = {sd: [col[k] for k in col if k.startswith(sd) and k[len(sd):] in ('UpLeg', 'Leg', 'Foot', 'ToeBase', 'Toe_End')] for sd in ('Left', 'Right')}
all_arm = side_arm['Left'] + side_arm['Right']
n = len(U); armmask = {}
for yc in np.arange(1.36, 1.0, -0.01):
    lab = comps(U[:, 1] < yc); u, c = np.unique(lab[lab >= 0], return_counts=True)
    arms = [b for b in u[c > n * 0.01] if abs(U[lab == b, 0].mean()) > 0.15 and U[lab == b, 1].min() > 0.3]
    if len(arms) == 2:
        for b in arms: armmask['Left' if U[lab == b, 0].mean() > 0 else 'Right'] = lab == b
        print('arms separate below %.2f' % yc); break
body = ~(armmask['Left'] | armmask['Right'])
Wd[np.ix_(body & (U[:, 1] < yc), all_arm)] = 0
for sd, m in armmask.items():
    keepcols = np.zeros(Wd.shape[1], bool); keepcols[side_arm[sd]] = True
    Wd[np.ix_(m, ~keepcols)] = 0
for yc2 in np.arange(0.5, 1.0, 0.005):
    lab = comps(body & (U[:, 1] < yc2)); feet = set(lab[(U[:, 1] < 0.03) & body]) - {-1}
    if len(feet) == 1: break
crotch = yc2 - 0.02; lab = comps(body & (U[:, 1] < crotch))
for b in set(lab[(U[:, 1] < 0.03) & body]) - {-1}:
    m = lab == b; sd = 'Left' if U[m, 0].mean() > 0 else 'Right'; other = 'Right' if sd == 'Left' else 'Left'
    Wd[np.ix_(m, side_leg[other])] = 0
print('crotch %.3f' % crotch)
# fingers: keep only the hand bones nearest each hand vertex
handcols = [col[k] for k in col if 'Hand' in k and col[k] in [idx[nm[j]] for j in deform]]
segs = {}
for j in deform:
    sh = short[j]; a = Wp[j]; b = Wp[byshort[MAIN[sh]]] if sh in MAIN and MAIN[sh] in byshort else a; segs[idx[nm[j]]] = (a, b)
def segd(P_, a, b):
    ab = b - a; t = np.clip(((P_ - a) @ ab) / max(ab @ ab, 1e-9), 0, 1); return np.linalg.norm(P_ - (a + t[:, None] * ab), axis=1)
hv = np.where(np.isin(Wd.argmax(1), handcols))[0]
D = np.stack([segd(U[hv], *segs[c]) for c in handcols], 1); mn = D.min(1, keepdims=True)
fing = np.array([short[[j for j in joints if idx[nm[j]] == c][0]] not in ('LeftHand', 'RightHand') for c in handcols])
Df = np.where(fing[None, :], D, 9); mnf = Df.min(1, keepdims=True)
sub = Wd[np.ix_(hv, handcols)]; sub[D > mn + 0.012] = 0; sub[fing[None, :] & (Df > mnf + 0.004)] = 0; Wd[np.ix_(hv, handcols)] = sub   # one finger each
# torso: her collar and arm bones should not carry her bust, chest sides or waist (Belinda's lesson)
ss = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))
mv = [col[k] for k in ('LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm')]
for i in ([] if MALE else np.where(body & (U[:, 1] > 0.78) & (U[:, 1] < 1.27))[0]):
    x, y, z = abs(U[i, 0]), U[i, 1], U[i, 2]; xf = 0.22 if y < 0.98 else 0.19 if z > 0.05 else 0.15
    k = (1 - ss((x - xf) / 0.04)) * ss((1.27 - y) / 0.06)
    if k <= 0: continue
    m = Wd[i, mv].sum() * k; Wd[i, mv] *= (1 - k); Wd[i, col['Spine2'] if y > 1.0 else col['Spine1']] += m
# blend across the armpit and the hand so the weights change gradually (no seam where the arm separates)
nbr = [[] for _ in range(len(U))]
for t in FU:
    for a_, b_ in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])): nbr[a_].append(b_); nbr[b_].append(a_)
nbr = [np.unique(x) for x in nbr]
ax = np.abs(U[:, 0])
zone = (U[:, 1] > (1.05 if MALE else 0.98)) & (U[:, 1] < (1.33 if MALE else 1.26)) & (ax > 0.1) & (ax < 0.27)
hand = np.isin(Wd.argmax(1), handcols)
for sel, it in ((zone, 8), (hand, 2)):
    ids = np.where(sel)[0]
    for _ in range(it):
        Wd[ids] = np.array([0.5 * Wd[i] + 0.5 * Wd[nbr[i]].mean(0) if len(nbr[i]) else Wd[i] for i in ids])
dead = np.where(Wd.sum(1) < 1e-6)[0]; print('re-homed verts', len(dead))
for i in dead:
    allowed = [c for c in segs if not (body[i] and U[i, 1] < yc and c in all_arm)]
    Wd[i, min(allowed, key=lambda c: segd(U[i:i + 1], *segs[c])[0])] = 1
top = np.argsort(-Wd, 1)[:, :4]; w4 = np.take_along_axis(Wd, top, 1); w4 /= w4.sum(1, keepdims=True)
np.savez(os.environ.get('NPZ', '/home/claude/out/base_skin.npz'), P=P, J=top[weld].astype(np.uint16), W=w4[weld].astype(np.float32), scale=s)
print('saved')
