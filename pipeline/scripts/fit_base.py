"""Fit Belinda's Mixamo skeleton to a new body (A-pose, faces +Z) and skin it with Blender's heat weights.
Joints are placed by where they sit inside Belinda's body (relative to local cross-sections, and along each arm),
the bind pose is Belinda's skeleton turned to point at the new joints (so her clips, which store absolute local turns,
play on the new body), and the weights come from Blender's automatic (heat) weighting.
Usage: bvenv/bin/python fit_base.py new.glb out.npz"""
import sys, json, struct, numpy as np

SRC = '/home/claude/out/belinda-cel.glb'
NEW, OUT = sys.argv[-2], sys.argv[-1]


def glb(f):
    d = open(f, 'rb').read(); L = struct.unpack('<I', d[12:16])[0]
    return json.loads(d[20:20 + L]), d[20 + L + 8:]


CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def acc(J, B, i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(B, CT[a['componentType']], a['count'] * NC[a['type']], bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], -1)


def mesh(f):
    J, B = glb(f); p = J['meshes'][0]['primitives'][0]
    P = acc(J, B, p['attributes']['POSITION']).astype(float); F = acc(J, B, p['indices']).reshape(-1, 3).astype(int)
    _, inv = np.unique(np.round(P * 1e5).astype(np.int64), axis=0, return_inverse=True)   # weld texture-seam copies
    first = np.full(inv.max() + 1, -1); 
    for i, k in enumerate(inv.ravel()):
        if first[k] < 0: first[k] = i
    return J, B, P, first[inv.ravel()][F]


JB, BB, PB, FB = mesh(SRC)
JN, BN, PN, FN = mesh(NEW)
PN = PN.copy(); s = 1.70 / (PN[:, 1].max() - PN[:, 1].min()); PN = (PN - [0, PN[:, 1].min(), 0]) * s
PN[:, 0] -= (PN[:, 0].max() + PN[:, 0].min()) / 2; PN[:, 2] -= (PN[:, 2].max() + PN[:, 2].min()) / 2 - (PB[:, 2].max() + PB[:, 2].min()) / 2
print('new scale %.4f' % s)


def comps(P, F, keep):
    """connected components among kept verts; returns label array (-1 not kept)"""
    par = np.arange(len(P))

    def find(a):
        while par[a] != a:
            par[a] = par[par[a]]; a = par[a]
        return a
    for t in F:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            if keep[a] and keep[b]:
                ra, rb = find(a), find(b)
                if ra != rb: par[ra] = rb
    lab = np.array([find(i) if keep[i] else -1 for i in range(len(P))])
    return lab


def measure(P, F, name):
    n = len(P); m = {}
    # armpit: highest cut below which both arms are their own pieces
    for yc in np.arange(1.36, 1.0, -0.01):
        lab = comps(P, F, P[:, 1] < yc); u, c = np.unique(lab[lab >= 0], return_counts=True); big = u[c > n * 0.01]
        arms = [b for b in big if abs(P[lab == b, 0].mean()) > 0.15 and P[lab == b, 1].min() > 0.3]
        if len(arms) == 2:
            m['armpit'] = yc; armlab = lab; break
    for b in arms:
        side = 'L' if P[armlab == b, 0].mean() > 0 else 'R'; A = P[armlab == b]
        c = A.mean(0); w, v = np.linalg.eigh(np.cov((A - c).T)); d = v[:, -1]
        if d[1] > 0: d = -d                                   # pointing down the arm
        tip = A[np.argmax((A - c) @ d)]; tproj = (tip - c) @ d
        top = c + d * ((A - c) @ d).min()                     # where the arm meets the cut
        m['arm' + side] = dict(d=d, tip=c + d * tproj, len=tproj - ((A - c) @ d).min(), thick=np.sqrt(w[:2].mean()), mask=armlab == b)
    body = ~(m['armL']['mask'] | m['armR']['mask'])
    # crotch: lowest cut at which the two feet join up
    for yc in np.arange(0.5, 1.0, 0.005):
        lab = comps(P, F, body & (P[:, 1] < yc)); feet = set(lab[(P[:, 1] < 0.03) & body])
        if len(feet - {-1}) == 1: m['crotch'] = yc; break
    m['top'] = P[:, 1].max(); m['body'] = body
    print(name, 'armpit %.3f crotch %.3f' % (m['armpit'], m['crotch']), 'arm len L %.3f R %.3f' % (m['armL']['len'], m['armR']['len']),
          'arm dir L', np.round(m['armL']['d'], 3))
    return m


mB = measure(PB, FB, 'belinda'); mN = measure(PN, FN, 'new')


def ymap(y):
    kb = [0, mB['crotch'], mB['armpit'], mB['top']]; kn = [0, mN['crotch'], mN['armpit'], mN['top']]
    return float(np.interp(y, kb, kn))


def slice_box(P, m, y, x, half=0.012):
    sel = m['body'] & (np.abs(P[:, 1] - y) < half)
    if y < m['crotch']: sel &= (np.sign(P[:, 0]) == np.sign(x)) | (np.abs(P[:, 0]) < 1e-4)
    S = P[sel]
    if len(S) < 6: return slice_box(P, m, y, x, half * 2) if half < 0.1 else None
    return S[:, [0, 2]].min(0), S[:, [0, 2]].max(0)


def map_body(p):
    yn = ymap(p[1]); b = slice_box(PB, mB, p[1], p[0]); nb = slice_box(PN, mN, yn, p[0])
    r = (np.array([p[0], p[2]]) - b[0]) / np.maximum(b[1] - b[0], 1e-4)
    q = nb[0] + r * (nb[1] - nb[0]); return np.array([q[0], yn, q[1]])


def arm_frame(a):
    d = a['d']; e1 = np.cross(d, [0, 0, 1.0]); e1 /= np.linalg.norm(e1); e2 = np.cross(e1, d); return d, e1, e2


def map_arm(p, side):
    a, b = mB['arm' + side], mN['arm' + side]; d, e1, e2 = arm_frame(a); dn, f1, f2 = arm_frame(b)
    v = p - a['tip']; t, u1, u2 = v @ d, v @ e1, v @ e2
    k = b['len'] / a['len']; kt = b['thick'] / a['thick']
    return b['tip'] + dn * t * k + f1 * u1 * kt + f2 * u2 * kt


# ---- Belinda's bind skeleton
N = JB['nodes']; par = {c: i for i, n in enumerate(N) for c in n.get('children', [])}
joints = JB['skins'][0]['joints']; IBM = acc(JB, BB, JB['skins'][0]['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
Wb = {j: np.linalg.inv(IBM[k]) for k, j in enumerate(joints)}
name = {j: N[j]['name'].replace('mixamorig:', '') for j in joints}
byn = {v: k for k, v in name.items()}
ARM = ('Arm', 'ForeArm', 'Hand')
target = {}
for j in joints:
    nm = name[j]; p = Wb[j][:3, 3]
    side = 'L' if nm.startswith('Left') else 'R' if nm.startswith('Right') else None
    if side and (any(nm == ('Left' if side == 'L' else 'Right') + a for a in ARM) or 'Hand' in nm):
        target[j] = map_arm(p, side)
    else:
        target[j] = map_body(p)
for k in ('Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End'):
    target[byn[k]][0] = 0.0                                     # keep the spine on her midline
for nm in ('LeftArm', 'LeftForeArm', 'LeftHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot'):
    print('%-12s belinda %s -> new %s' % (nm, np.round(Wb[byn[nm]][:3, 3], 3), np.round(target[byn[nm]], 3)))

MAIN = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head', 'Head': 'HeadTop_End'}
for s in ('Left', 'Right'):
    MAIN.update({s + 'Shoulder': s + 'Arm', s + 'Arm': s + 'ForeArm', s + 'ForeArm': s + 'Hand', s + 'Hand': s + 'HandMiddle1',
                 s + 'UpLeg': s + 'Leg', s + 'Leg': s + 'Foot', s + 'Foot': s + 'ToeBase', s + 'ToeBase': s + 'Toe_End'})
    for f in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky'):
        for i in (1, 2, 3): MAIN[f'{s}Hand{f}{i}'] = f'{s}Hand{f}{i + 1}'


def rot_between(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); v = np.cross(a, b); c = a @ b
    if c < -0.9999: return -np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); return np.eye(3) + vx + vx @ vx / (1 + c)


Rn = {}
order = []
def walk(j):
    order.append(j)
    for c in N[j].get('children', []):
        if c in Wb: walk(c)
walk(byn['Hips'])
for j in order:
    Rb = Wb[j][:3, :3]; Rb = Rb / np.linalg.norm(Rb, axis=0)
    nm = name[j]
    if nm in MAIN and MAIN[nm] in byn:
        c = byn[MAIN[nm]]; Rn[j] = rot_between(Wb[c][:3, 3] - Wb[j][:3, 3], target[c] - target[j]) @ Rb
    else:
        pj = par[j]; Rp = Wb[pj][:3, :3] / np.linalg.norm(Wb[pj][:3, :3], axis=0) if pj in Wb else np.eye(3)
        Rn[j] = (Rn[pj] if pj in Rn else np.eye(3)) @ Rp.T @ Rb
Wn = {}
for j in order:
    M = np.eye(4); M[:3, :3] = Rn[j]; M[:3, 3] = target[j]; Wn[j] = M
np.savez(OUT, P=PN, F=FN, joints=np.array(joints), names=np.array([N[j]['name'] for j in joints]),
         Wn=np.stack([Wn[j] for j in joints]), parents=np.array([joints.index(par[j]) if par.get(j) in joints else -1 for j in joints]), scale=s)
print('saved', OUT)
