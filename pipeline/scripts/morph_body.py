"""Body-shape morph targets for the base body from other Meshy bodies (same pose, different build).
The base keeps its skeleton, head, hands, feet and texture; each body part is thickened or thinned around its own axis
to the variant's cross-section (torso by horizontal slices, legs by per-leg slices, arms by slices across the arm),
so the bones never move and every clip still fits.
Usage: bvenv/bin/python morph_body.py base.glb out.glb name=variant.glb [name=variant.glb ...]"""
import sys, json, struct, numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
BASE, OUT = args[0], args[1]; VARS = [a.split('=', 1) for a in args[2:]]


def glb(f):
    d = open(f, 'rb').read(); L = struct.unpack('<I', d[12:16])[0]; o = 20 + L
    return json.loads(d[20:20 + L]), bytearray(d[o + 8:o + 8 + struct.unpack('<I', d[o:o + 4])[0]])


CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def acc(J, B, i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(bytes(B), CT[a['componentType']], a['count'] * NC[a['type']], bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], -1)


def weld(P, F):
    _, inv = np.unique(np.round(P * 1e5).astype(np.int64), axis=0, return_inverse=True); inv = inv.ravel()
    U = np.zeros((inv.max() + 1, 3)); U[inv] = P; FU = inv[F]
    return U, FU[(FU[:, 0] != FU[:, 1]) & (FU[:, 1] != FU[:, 2]) & (FU[:, 0] != FU[:, 2])], inv


def comps(U, FU, keep):
    par = np.arange(len(U))
    def find(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    for t in FU:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            if keep[a] and keep[b]:
                ra, rb = find(a), find(b)
                if ra != rb: par[ra] = rb
    return np.array([find(i) if keep[i] else -1 for i in range(len(U))])


def measure(U, FU, name):
    n = len(U); m = {}
    for yc in np.arange(1.36, 0.9, -0.01):
        lab = comps(U, FU, U[:, 1] < yc); u, c = np.unique(lab[lab >= 0], return_counts=True)
        arms = [b for b in u[c > n * 0.005] if abs(U[lab == b, 0].mean()) > 0.15 and U[lab == b, 1].min() > 0.3]
        if len(arms) == 2: m['armpit'] = yc; break
    for b in arms:
        sd = 'L' if U[lab == b, 0].mean() > 0 else 'R'; A = U[lab == b]; c = A.mean(0)
        w, v = np.linalg.eigh(np.cov((A - c).T)); d = v[:, -1]
        if d[1] > 0: d = -d
        tip = c + d * ((A - c) @ d).max(); top = ((A - c) @ d).min()
        m['arm' + sd] = dict(d=d, tip=tip, len=((A - c) @ d).max() - top, mask=lab == b)
    body = ~(m['armL']['mask'] | m['armR']['mask'])
    for yc in np.arange(0.5, 1.0, 0.005):
        lab2 = comps(U, FU, body & (U[:, 1] < yc)); feet = set(lab2[(U[:, 1] < 0.03) & body]) - {-1}
        if len(feet) == 1: m['crotch'] = yc - 0.005; break
    lab2 = comps(U, FU, body & (U[:, 1] < m['crotch']))
    for b in set(lab2[(U[:, 1] < 0.03) & body]) - {-1}:
        m['leg' + ('L' if U[lab2 == b, 0].mean() > 0 else 'R')] = lab2 == b
    m['body'] = body; m['top'] = U[:, 1].max()
    print(name, 'armpit %.2f crotch %.3f armlen %.3f/%.3f' % (m['armpit'], m['crotch'], m['armL']['len'], m['armR']['len']))
    return m


def load_mesh(f, ref_z=None):
    J, B = glb(f); p = J['meshes'][0]['primitives'][0]
    P = acc(J, B, p['attributes']['POSITION']).astype(float); F = acc(J, B, p['indices']).reshape(-1, 3).astype(int)
    return J, B, p, P, F


def normalize(P, zref=None):
    P = P.copy(); s = 1.70 / (P[:, 1].max() - P[:, 1].min()); P = (P - [0, P[:, 1].min(), 0]) * s
    P[:, 0] -= (P[:, 0].max() + P[:, 0].min()) / 2
    hip = P[np.abs(P[:, 1] - 0.9) < 0.02]
    if zref is not None: P[:, 2] += zref - (hip[:, 2].max() + hip[:, 2].min()) / 2
    return P


# ---- the base (already 1.70 m, feet on the floor, in Belinda's skeleton space)
JB, BB, pb, PB, FB = load_mesh(BASE)
UB, FUB, invB = weld(PB, FB)
hipB = UB[np.abs(UB[:, 1] - 0.9) < 0.02]; zref = (hipB[:, 2].max() + hipB[:, 2].min()) / 2
mB = measure(UB, FUB, 'base')
JW = acc(JB, BB, pb['attributes']['JOINTS_0']).astype(int); WW = acc(JB, BB, pb['attributes']['WEIGHTS_0']).astype(float)
names = [JB['nodes'][j]['name'].replace('mixamorig:', '') for j in JB['skins'][0]['joints']]
def grp(n):
    if n.startswith('Left') or n.startswith('Right'):
        sd = 'L' if n.startswith('Left') else 'R'; r = n[4:] if sd == 'L' else n[5:]
        if r.startswith('Hand'): return 'none'
        if r in ('Arm', 'ForeArm'): return 'arm' + sd
        if r in ('UpLeg', 'Leg'): return 'leg' + sd
        if r in ('Foot', 'ToeBase', 'Toe_End'): return 'none'
        if r == 'Shoulder': return 'torso'
    if n in ('Neck', 'Head', 'HeadTop_End', 'headfront'): return 'none'
    return 'torso'
G = [grp(n) for n in names]
GW = {g: np.zeros(len(UB)) for g in ('torso', 'armL', 'armR', 'legL', 'legR', 'none')}
first = np.full(len(UB), -1)
for i, k in enumerate(invB):
    if first[k] < 0: first[k] = i
for k in range(4):
    for g in GW: GW[g] += np.where(np.array(G)[JW[first, k]] == g, WW[first, k], 0)
GWH = {'L': np.zeros(len(UB)), 'R': np.zeros(len(UB))}
for k in range(4):
    for sd, pre in (('L', 'LeftHand'), ('R', 'RightHand')):
        GWH[sd] += np.where(np.array([n.startswith(pre) for n in names])[JW[first, k]], WW[first, k], 0)
shifts = {}
# above the neck base nothing changes; fade through the neck
import os
neckY = mB['top'] - float(os.environ.get('NECKDROP', '0.42'))
GW['none'] = np.maximum(GW['none'], np.clip((UB[:, 1] - (neckY - 0.03)) / 0.06, 0, 1))
for g in ('torso', 'armL', 'armR', 'legL', 'legR'): GW[g] *= 1 - np.clip((UB[:, 1] - (neckY - 0.03)) / 0.06, 0, 1)

def bvh(U, FU): return BVHTree.FromPolygons([tuple(p) for p in U], [tuple(int(x) for x in t) for t in FU])
def ray(T, o, d, maxd=0.6):
    hit = T.ray_cast(Vector(o), Vector(d), maxd)
    return None if hit[0] is None else hit[3]

TB = bvh(UB, FUB)

def slice_center(U, m, y, mask, half=0.006):
    S = U[mask & (np.abs(U[:, 1] - y) < half)]
    if len(S) < 6: return slice_center(U, m, y, mask, half * 2) if half < 0.05 else None
    return np.array([(S[:, 0].max() + S[:, 0].min()) / 2, y, (S[:, 2].max() + S[:, 2].min()) / 2])

targets = []
for vname, vfile in VARS:
    JV, BV, pv, PV, FV = load_mesh(vfile); PV = normalize(PV, zref); UV, FUV, _ = weld(PV, FV); mV = measure(UV, FUV, vname); TV = bvh(UV, FUV)
    disp = np.zeros((len(UB), 3)); cacheB, cacheV = {}, {}
    zhipB = slice_center(UB, mB, 0.92, mB['body'])[2]; zhipV = slice_center(UV, mV, 0.92 * mV['crotch'] / mB['crotch'], mV['body'])[2]
    def ymap_t(y):
        return float(np.interp(y, [0, mB['crotch'], mB['armpit'], mB['top']], [0, mV['crotch'], mV['armpit'], mV['top']]))
    def torso_disp(i):
        v = UB[i]; y = v[1]; yv = ymap_t(y)
        kb = ('t', round(y, 3)); cb = cacheB.get(kb)
        if cb is None: cb = cacheB[kb] = slice_center(UB, mB, y, mB['body'])
        kv = ('t', round(yv, 3)); cv = cacheV.get(kv)
        if cv is None: cv = cacheV[kv] = slice_center(UV, mV, yv, mV['body'])
        if cb is None or cv is None: return np.full(3, np.nan)
        h = v - cb; h[1] = 0; r = np.linalg.norm(h)
        if r < 1e-4: return np.zeros(3)
        d = h / r; rb = ray(TB, cb, d); rv = ray(TV, cv, d)
        if not rb or not rv: return np.full(3, np.nan)
        s = np.clip(rv / rb, 0.45, 1.6)
        # carry the chest's lean too (a thinner chest left behind under an unchanged neck and head reads as a hunch)
        lean = np.clip(y - 0.95, 0, None); k = np.clip(lean / 0.15, 0, 1) ** 2 * (1 - np.clip((y - 1.22) / 0.1, 0, 1))
        dzc = 0.0 * k   # (tried carrying the slim model's chest lean: with the idle it pushed her bust out; off)
        return h * (s - 1) + np.array([0, 0, dzc])
    def leg_disp(i, sd):
        v = UB[i]
        if v[1] > mB['crotch'] - 0.01: return torso_disp(i)
        y = v[1]; yv = y * mV['crotch'] / mB['crotch']
        kb = (sd, round(y, 3)); cb = cacheB.get(kb)
        if cb is None: cb = cacheB[kb] = slice_center(UB, mB, y, mB['leg' + sd])
        kv = (sd, round(yv, 3)); cv = cacheV.get(kv)
        if cv is None: cv = cacheV[kv] = slice_center(UV, mV, yv, mV['leg' + sd])
        if cb is None or cv is None: return np.full(3, np.nan)
        h = v - cb; h[1] = 0; r = np.linalg.norm(h)
        if r < 1e-4: return np.zeros(3)
        d = h / r; rb = ray(TB, cb, d); rv = ray(TV, cv, d)
        if not rb or not rv: return np.full(3, np.nan)
        s = np.clip(rv / rb, 0.45, 1.6); return h * (s - 1)
    def arm_disp(i, sd):
        v = UB[i]; ab, av = mB['arm' + sd], mV['arm' + sd]
        t = (v - ab['tip']) @ ab['d']
        if -t > ab['len'] + 0.1 or v[1] > mB['armpit'] + 0.1: return torso_disp(i)
        tv = t * av['len'] / ab['len']
        kb = (sd + 'a', round(t, 3)); cb = cacheB.get(kb)
        if cb is None:
            S = UB[ab['mask'] & (np.abs((UB - ab['tip']) @ ab['d'] - t) < 0.006)]; cb = cacheB[kb] = S.mean(0) if len(S) > 5 else ab['tip'] + ab['d'] * t
        kv = (sd + 'a', round(tv, 3)); cv = cacheV.get(kv)
        if cv is None:
            S = UV[av['mask'] & (np.abs((UV - av['tip']) @ av['d'] - tv) < 0.006)]; cv = cacheV[kv] = S.mean(0) if len(S) > 5 else av['tip'] + av['d'] * tv
        h = v - cb; h = h - ab['d'] * (h @ ab['d']); r = np.linalg.norm(h)
        if r < 1e-4: return np.zeros(3)
        d = h / r; a, b = ab['d'], av['d']; vx = np.cross(a, b); c = a @ b
        K = np.array([[0, -vx[2], vx[1]], [vx[2], 0, -vx[0]], [-vx[1], vx[0], 0]]); Rm = np.eye(3) + K + K @ K / (1 + c)
        rb = ray(TB, cb, d, 0.3); rv = ray(TV, cv, Rm @ d, 0.3)
        if not rb or not rv: return np.full(3, np.nan)
        s = np.clip(rv / rb, 0.45, 1.6); return h * (s - 1)
    for i in range(len(UB)):
        tot = np.zeros(3); wsum = 0; bad = False
        for g, fn in (('torso', lambda: torso_disp(i)), ('armL', lambda: arm_disp(i, 'L')), ('armR', lambda: arm_disp(i, 'R')), ('legL', lambda: leg_disp(i, 'L')), ('legR', lambda: leg_disp(i, 'R'))):
            w = GW[g][i]
            if w > 1e-3:
                d = fn()
                if np.isnan(d).any(): bad = True
                else: tot += w * d; wsum += w
        if bad and wsum < 0.5: disp[i] = np.nan
        else: disp[i] = tot / max(wsum + GW['none'][i], 1e-6) * (wsum + GW['none'][i]) if wsum > 0 else tot
    # smooth the field (ray noise, part seams)
    nb = [[] for _ in range(len(UB))]
    for t in FUB:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])): nb[a].append(b); nb[b].append(a)
    nb = [np.unique(x) for x in nb]
    # fill the places the rays missed from their neighbours, then smooth
    bad = np.isnan(disp).any(1); print(vname, 'filled', int(bad.sum()), 'verts')
    for _ in range(60):
        if not bad.any(): break
        nd = disp.copy()
        for i in np.where(bad)[0]:
            ok = [n for n in nb[i] if not bad[n]]
            if ok: nd[i] = disp[ok].mean(0)
        newly = bad & ~np.isnan(nd).any(1); disp = nd; bad = bad & ~newly
    disp[bad] = 0
    # remove spikes: a vertex moving very differently from its neighbours follows them
    for _ in range(2):
        avg = np.array([disp[n].mean(0) if len(n) else disp[i] for i, n in enumerate(nb)])
        off = np.linalg.norm(disp - avg, axis=1); disp[off > 0.012] = avg[off > 0.012]
    for _ in range(6): disp = np.array([0.5 * disp[i] + 0.5 * disp[n].mean(0) if len(n) else disp[i] for i, n in enumerate(nb)])
    # where arm and torso meet (the two measures disagree there), smooth much harder so the skin can't fold
    armw = GW['armL'] + GW['armR']; ax = np.abs(UB[:, 0])
    zone = ((armw > 0.03) & (armw < 0.97)) | ((UB[:, 1] > mB['armpit'] - 0.2) & (UB[:, 1] < mB['armpit'] + 0.14) & (ax > 0.1) & (ax < 0.3))
    zi = np.where(zone)[0]
    for _ in range(25): disp[zi] = np.array([0.4 * disp[i] + 0.6 * disp[nb[i]].mean(0) if len(nb[i]) else disp[i] for i in zi])
    # shoulders: the arms sit closer in on a narrower body. Move each arm (and the skin it leads) by the change in shoulder
    # position; the editor moves the shoulder joints by the same amount, so the arm still pivots in its socket.
    sh = {}
    for sd, sg in (('L', 1), ('R', -1)):
        def shoulder_x(U, m):
            S = U[(np.abs(U[:, 1] - (m['armpit'] + 0.05)) < 0.01) & (U[:, 0] * sg > 0.08)]
            return np.abs(S[:, 0]).max() if len(S) else None
        xb, xv = shoulder_x(UB, mB), shoulder_x(UV, mV)
        sh[sd] = 0.0 if xb is None or xv is None else float(np.clip((xv - xb), 0.0 if vname == 'athletic' else -0.06, 0.03 if os.environ.get('NECKDROP') is None else 0.05)) * sg   # an athletic frame keeps her shoulder width (the width measure catches the plus body's upper arms)
        disp += np.outer(GW['arm' + sd] + GWH[sd], [sh[sd], 0, 0])
    print(vname, 'shoulder shift L %.3f R %.3f' % (sh['L'], sh['R']))
    # round the shoulders: the shift moves the arm-led skin while the torso-led skin beside it stays, which leaves a ridge over
    # the shoulder top (and folds the bra straps). Smooth the whole cap hard so it rolls from neck to arm.
    capz = np.where((UB[:, 1] > mB['armpit'] - 0.08) & (UB[:, 1] < mB['armpit'] + 0.2) & (np.abs(UB[:, 0]) > 0.05) & (np.abs(UB[:, 0]) < 0.32) & (GW['none'] < 0.5))[0]
    rows = np.concatenate([np.full(len(nb[i]), k) for k, i in enumerate(capz)]); cols = np.concatenate([nb[i] for i in capz])
    wts = np.concatenate([np.full(len(nb[i]), 1.0 / max(len(nb[i]), 1)) for i in capz])
    for _ in range(400):
        avg = np.zeros((len(capz), 3)); np.add.at(avg, rows, disp[cols] * wts[:, None]); disp[capz] = 0.2 * disp[capz] + 0.8 * avg   # close to a harmonic fill: the cap rolls smoothly between the arm, neck and chest
    shifts[vname] = sh
    M_ = UB + disp; fn1 = np.cross(M_[FUB[:, 1]] - M_[FUB[:, 0]], M_[FUB[:, 2]] - M_[FUB[:, 0]]); fn0_ = np.cross(UB[FUB[:, 1]] - UB[FUB[:, 0]], UB[FUB[:, 2]] - UB[FUB[:, 0]])
    print(vname, 'flipped triangles', int(((fn1 * fn0_).sum(1) < 0).sum()))
    print(vname, 'max move %.3f m, mean %.4f' % (np.linalg.norm(disp, axis=1).max(), np.linalg.norm(disp, axis=1).mean()))
    # normals of the morphed shape
    M = UB + disp; fn = np.cross(M[FUB[:, 1]] - M[FUB[:, 0]], M[FUB[:, 2]] - M[FUB[:, 0]]); vn = np.zeros_like(M)
    for k in range(3): np.add.at(vn, FUB[:, k], fn)
    vn /= np.linalg.norm(vn, axis=1, keepdims=True).clip(1e-12)
    fn0 = np.cross(UB[FUB[:, 1]] - UB[FUB[:, 0]], UB[FUB[:, 2]] - UB[FUB[:, 0]]); vn0 = np.zeros_like(UB)
    for k in range(3): np.add.at(vn0, FUB[:, k], fn0)
    vn0 /= np.linalg.norm(vn0, axis=1, keepdims=True).clip(1e-12)
    targets.append((vname, disp[invB], (vn - vn0)[invB]))

# ---- write targets into the base GLB
def add(arr, mm=False):
    while len(BB) % 4: BB.append(0)
    data = arr.astype(np.float32).tobytes(); off = len(BB); BB.extend(data)
    JB['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data), 'target': 34962})
    a = {'bufferView': len(JB['bufferViews']) - 1, 'componentType': 5126, 'type': 'VEC3', 'count': int(arr.shape[0])}
    if mm: a['min'] = [float(x) for x in arr.min(0)]; a['max'] = [float(x) for x in arr.max(0)]
    JB['accessors'].append(a); return len(JB['accessors']) - 1
pb['targets'] = [{'POSITION': add(d, True), 'NORMAL': add(n)} for _, d, n in targets]
me = JB['meshes'][0]; me['weights'] = [0.0] * len(targets); me.setdefault('extras', {})['targetNames'] = [n for n, _, _ in targets]; me['extras']['shoulderShift'] = shifts
JB['buffers'][0]['byteLength'] = len(BB)
while len(BB) % 4: BB.append(0)
js = json.dumps(JB, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
open(OUT, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(BB)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(BB), 0x004E4942) + bytes(BB))
print(OUT, '%.2f MB' % ((28 + len(js) + len(BB)) / 1e6), me['extras']['targetNames'])
