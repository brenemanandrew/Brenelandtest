"""Unstable Unicorns diorama: close the holes the balloon cut left (blender/unicorns_prep.py deleted every face whose centre
was in front of the rainbow, x within 0.8, above y -0.36, to drop the modelled balloons; that box also took the FRONT of the
rainbow's left half and the tops of both little stone doorways and a few bits of bush). The full-detail original is not in the
repo, so the holes are rebuilt from what is left:
  - the rainbow's six band fronts: each hole outline is triangulated (constrained, fine) on the plane through its rim, with one
    smooth normal (the intact front's, mirrored: no ink speckles); each triangle takes the UV of the nearest intact right-half
    face of the band's own colour (the median round the hole's rim) to its mirror point, so the painted variation carries over
    and no band picks up its neighbour's colour
  - the doorways: the spikes of half-cut stone above the cut are brought down onto it (a clean flat top)
  - every other hole (the doorway tops, small bits): a flat cap on the outline, each cap triangle coloured like the nearest
    face round the rim
Only the base colour texture is kept (the game draws the map only; the normal and metal/rough maps were 4 MB of dead weight).
  python3 tools/unicorns_fix_model.py models/06-unicorns/unicorns_base.glb models/06-unicorns/unicorns_fixed.glb
Needs numpy, scipy, triangle (pip install triangle)."""
import sys, json, struct, io
from PIL import Image
import numpy as np
from scipy.spatial import cKDTree
import triangle

SRC, DST = sys.argv[1], sys.argv[2]
b = open(SRC, 'rb').read()
L = struct.unpack('<I', b[12:16])[0]; J = json.loads(b[20:20 + L]); off = 20 + L
L2 = struct.unpack('<I', b[off:off + 4])[0]; BIN = b[off + 8:off + 8 + L2]


def acc(i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    n = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[a['type']]; dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32}[a['componentType']]
    o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return np.frombuffer(BIN, dt, a['count'] * n, o).reshape(a['count'], n)


pr = J['meshes'][0]['primitives'][0]
P = acc(pr['attributes']['POSITION']).astype(np.float64); NO = acc(pr['attributes']['NORMAL']).astype(np.float64)
UV = acc(pr['attributes']['TEXCOORD_0']).astype(np.float64); I = acc(pr['indices']).astype(np.int64).reshape(-1, 3)
ti = J['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']; img = J['images'][J['textures'][ti]['source']]
bv = J['bufferViews'][img['bufferView']]; JPG = BIN[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]

# ---- the two little doorways: the cut left spikes of half-cut stone standing up past it (the ragged tops); everything of theirs
# above the cut height is brought down onto it, so each gets a clean flat top, then capped like every other hole
CUTY = -0.36
for x0, x1, z0, z1 in [(-0.46, -0.23, -0.28, -0.09), (0.17, 0.34, 0.43, 0.62)]:   # the doorway by the rainbow's foot, the one by the path
    s = (P[:, 0] > x0) & (P[:, 0] < x1) & (P[:, 2] > z0) & (P[:, 2] < z1) & (P[:, 1] > CUTY)
    P[s, 1] = CUTY; print('doorway top flattened:', s.sum(), 'vertices')

# ---- topology on positions (gltf splits vertices on UV seams): directed boundary edges, then their loops
q = np.round(P / 1e-5).astype(np.int64); _, wid = np.unique(q, axis=0, return_inverse=True); wid = wid.ravel()
F = wid[I]; Pw = np.zeros((wid.max() + 1, 3)); Pw[wid] = P
de = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]); dface = np.tile(np.arange(len(F)), 3)
key = np.sort(de, 1); _, inv, cnt = np.unique(key, axis=0, return_inverse=True, return_counts=True)
bd = cnt[inv.ravel()] == 1
nxt = {}; bface = {}
for (a, c), f in zip(de[bd], dface[bd]): nxt[a] = c; bface[(a, c)] = f
loops, seen = [], set()
for s0 in nxt:
    if s0 in seen: continue
    lp, v = [], s0
    while v not in seen: seen.add(v); lp.append(v); v = nxt[v]
    loops.append(lp)
print('holes', len(loops), [len(l) for l in loops])

fc = P[I].mean(1)
fn = np.cross(P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]]); fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12

# ---- the rainbow's intact right half: front faces of the slab (the bands' fronts), looked up in the x-y plane
AC = np.array([0.045, -0.22])
r = np.hypot(fc[:, 0] - AC[0], fc[:, 1] - AC[1])
front = (fc[:, 2] > -0.37) & (fc[:, 2] < -0.29) & (r > 0.46) & (r < 0.89) & (fc[:, 1] > -0.35) & (fn[:, 2] > 0.5) & (fc[:, 0] > 0.1)
# the mirror line (x): where the mirrored right half's bands best line up with the left half's rims (checked by colour, 0.03..0.17)
CX = 0.11
FI = np.where(front)[0]


newP, newUV = [], []


newN = []
NFR = fn[FI].mean(0); BANDN = np.array([-NFR[0], NFR[1], NFR[2]]) / np.linalg.norm(NFR)   # the intact front's normal, mirrored


def emit(tri3, uv3, want, nrm=None):
    n = np.cross(tri3[1] - tri3[0], tri3[2] - tri3[0])
    if np.dot(n, want) < 0: tri3, uv3 = tri3[[0, 2, 1]], uv3[[0, 2, 1]]; n = -n
    newP.append(tri3); newUV.append(uv3); newN.append(np.repeat((nrm if nrm is not None else n / (np.linalg.norm(n) + 1e-12))[None], 3, 0))


def ring_frame(pts):
    c = pts.mean(0); _, _, vt = np.linalg.svd(pts - c); return c, vt[0], vt[1], np.cross(vt[0], vt[1])   # (right-handed: the winding test needs it)


band = cap = 0
TEX = np.asarray(Image.open(io.BytesIO(JPG)).convert('RGB')) / 255.


def texc(uv):
    h, w, _ = TEX.shape; return TEX[(np.floor(uv[:, 1] * h).astype(int)) % h, (np.floor(uv[:, 0] * w).astype(int)) % w]


FCOL = texc(UV[I[FI]].mean(1))   # the colour of each right-half front face
for lp in loops:
    pts = Pw[lp]; n = len(lp)
    # the outward side: the hole's rim runs against the faces round it, so the fill runs the rim the other way
    rev = pts[::-1]
    is_band = pts[:, 2].min() > -0.34 and pts[:, 2].max() < -0.29 and pts[:, 1].max() > 0.2 and pts[:, 0].max() < 0   # (the left half's six band fronts)
    if is_band:
        xy = rev[:, :2]
        seg = np.c_[np.arange(n), (np.arange(n) + 1) % n]
        T = triangle.triangulate({'vertices': xy, 'segments': seg}, 'pq28a0.00006Y')
        V2 = T['vertices']; tris = T['triangles']
        # depth: boundary points keep theirs; inner points lie on the plane fitted to the rim (a smooth face: the ink pass draws
        # lines at every little depth or normal step, so the fill is flat with one smooth normal, like the intact half's front)
        pl = np.linalg.lstsq(np.c_[xy, np.ones(n)], rev[:, 2], rcond=None)[0]
        Z = np.c_[V2, np.ones(len(V2))] @ pl; Z[:n] = rev[:, 2]
        V3 = np.c_[V2, Z]
        # colour: the band's own colour (the median round its rim); each fill triangle takes the UV of the nearest right-half
        # front face of that colour to its mirror point, so the band keeps the painted variation and never picks up a neighbour band
        rimf = np.array([bface[(lp[i], lp[(i + 1) % n])] for i in range(n)]); rc = np.median(texc(UV[I[rimf]].mean(1)), 0)
        ok = np.linalg.norm(FCOL - rc, axis=1) < 0.2; okf = FI[ok]; otree = cKDTree(fc[okf][:, :2])
        for t in tris:
            cxy = V2[t].mean(0); _, k = otree.query([2 * CX - cxy[0], cxy[1]])
            emit(V3[t], np.repeat(UV[I[okf[k]]].mean(0)[None], 3, 0), np.array([0, 0, 1.0]), BANDN)
        band += len(tris)
        print('band', np.round(rc * 255).astype(int), 'faces of its colour', ok.sum(), 'fill', len(tris))
    else:
        c, e1, e2, nrm = ring_frame(pts)
        xy = np.c_[(rev - c) @ e1, (rev - c) @ e2]
        seg = np.c_[np.arange(n), (np.arange(n) + 1) % n]
        T = triangle.triangulate({'vertices': xy, 'segments': seg}, 'p')
        V2 = T['vertices']; tris = T['triangles']
        V3 = c + V2[:, :1] * e1 + V2[:, 1:2] * e2; V3[:n] = rev
        # the outward normal: the reversed rim's winding (signed area in e1, e2) says which side of nrm
        sa = 0.5 * np.sum(xy[:, 0] * np.roll(xy[:, 1], -1) - np.roll(xy[:, 0], -1) * xy[:, 1])
        want = nrm if sa > 0 else -nrm
        rimf = np.array([bface[(lp[i], lp[(i + 1) % n])] for i in range(n)]); rtree = cKDTree(fc[rimf])
        for t in tris:
            _, k = rtree.query(V3[t].mean(0)); f = rimf[k]
            emit(V3[t], np.repeat(UV[I[f]].mean(0)[None], 3, 0), want)
        cap += len(tris)
print('band fill triangles', band, 'cap triangles', cap)

# ---- write: old vertices + the fill (its own vertices; the band fronts one smooth normal, the caps flat), base colour texture only
NP = np.concatenate(newP).reshape(-1, 3); NUV = np.concatenate(newUV).reshape(-1, 2)
NN = np.concatenate(newN).reshape(-1, 3)
POS = np.concatenate([P, NP]).astype(np.float32); NOR = np.concatenate([NO, NN]).astype(np.float32); TUV = np.concatenate([UV, NUV]).astype(np.float32)
IDX = np.concatenate([I.ravel(), len(P) + np.arange(len(NP))]).astype(np.uint32)
print('vertices', len(POS), 'triangles', len(IDX) // 3)
chunks, views = [], []


def add(data, target=None, stride=None):
    o = sum(len(c) for c in chunks); data = bytes(data); chunks.append(data + b'\0' * ((-len(data)) % 4))
    v = {'buffer': 0, 'byteOffset': o, 'byteLength': len(data)}
    if target: v['target'] = target
    if stride: v['byteStride'] = stride
    views.append(v); return len(views) - 1


vimg = add(JPG); vp = add(POS.tobytes(), 34962, 12); vn = add(NOR.tobytes(), 34962, 12); vt = add(TUV.tobytes(), 34962, 8)
small = len(POS) < 65536; vi = add((IDX.astype(np.uint16) if small else IDX).tobytes(), 34963)
out = {
    'asset': {'version': '2.0', 'generator': 'unicorns_fix_model.py (from gltfpack 1.3 output)'},
    'buffers': [{'byteLength': sum(len(c) for c in chunks)}], 'bufferViews': views,
    'accessors': [
        {'bufferView': vp, 'componentType': 5126, 'count': len(POS), 'type': 'VEC3', 'min': POS.min(0).tolist(), 'max': POS.max(0).tolist()},
        {'bufferView': vn, 'componentType': 5126, 'count': len(POS), 'type': 'VEC3'},
        {'bufferView': vt, 'componentType': 5126, 'count': len(POS), 'type': 'VEC2'},
        {'bufferView': vi, 'componentType': 5123 if small else 5125, 'count': len(IDX), 'type': 'SCALAR'}],
    'samplers': J['samplers'], 'images': [{'name': img.get('name', 'Image'), 'bufferView': vimg, 'mimeType': 'image/jpeg'}],
    'textures': [{'sampler': 0, 'source': 0}],
    'materials': [{'name': 'Material_0', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0}, 'doubleSided': False}],
    'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2}, 'indices': 3, 'material': 0}]}],
    'nodes': [{'mesh': 0}], 'scenes': [{'name': 'Scene', 'nodes': [0]}], 'scene': 0}
js = json.dumps(out, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4); bb = b''.join(chunks)
with open(DST, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bb)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js); f.write(struct.pack('<II', len(bb), 0x004E4942)); f.write(bb)
print('wrote', DST, len(js) + len(bb), 'bytes')
