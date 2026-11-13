"""Cut a Meshy hairstyle off its chibi head and fit it to the base body's head.
Hair = dark texture, minus the eyes and brows (dark islands on the face front) and anything below the jaw at the front.
Placed by the ears (scale = ear to ear), then conformed: every point keeps its direction from the head's centre and sits a
compressed hair-thickness above the base skull (never inside it). Writes a small GLB: positions in the body's bind space,
UVs, and a gray "value" texture (hair shading only, coloured by the editor's tint).
Usage: bvenv/bin/python fit_hair.py in.glb out.glb"""
import os, sys, json, struct, io, numpy as np, bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.append("/usr/local/lib/python3.13/site-packages") if False else None
try:
    from PIL import Image
except ImportError:
    sys.path.append("/home/claude/pylib"); from PIL import Image

CHIBI = sys.argv[-1] == 'chibi'
if CHIBI: sys.argv = sys.argv[:-1]
SRC, OUT = sys.argv[-2], sys.argv[-1]


def glb(f):
    d = open(f, 'rb').read(); L = struct.unpack('<I', d[12:16])[0]
    return json.loads(d[20:20 + L]), d[20 + L + 8:]


CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def acc(J, B, i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(B, CT[a['componentType']], a['count'] * NC[a['type']], bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], -1)


J, B = glb(SRC); p = J['meshes'][0]['primitives'][0]
P = acc(J, B, p['attributes']['POSITION']).astype(float); UV = acc(J, B, p['attributes']['TEXCOORD_0']).astype(float)
F = acc(J, B, p['indices']).reshape(-1, 3).astype(int)
im = J['images'][J['textures'][J['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
bv = J['bufferViews'][im['bufferView']]; TEX = Image.open(io.BytesIO(B[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])).convert('RGB')
T = np.array(TEX).astype(int); H, W = T.shape[:2]
c = UV[F].mean(1); col = T[np.clip((c[:, 1] * H).astype(int), 0, H - 1), np.clip((c[:, 0] * W).astype(int), 0, W - 1)]
lum = col.mean(1); cen = P[F].mean(1); skin = (col[:, 0] > 120) & (lum > 85) & ((col[:, 1] - col[:, 2] < 45) | CHIBI)   # (gold accessories are yellower than skin)

# the chibi's ears: the widest skin at the sides, around the middle of the face
S = cen[skin]; ylo, yhi = S[:, 1].min(), S[:, 1].max(); best = None
ws = [(yy, (lambda sl: sl[:, 0].max() - sl[:, 0].min() if len(sl) > 10 else 9)(S[np.abs(S[:, 1] - yy) < 0.03])) for yy in np.linspace(ylo, ylo + 0.75 * (yhi - ylo), 40)]
neck = min(ws, key=lambda q: q[1])[0]                                  # the neck: the narrowest skin below the face
for yy in np.linspace(neck + 0.12, yhi - 0.15 * (yhi - ylo), 40):
    sl = S[np.abs(S[:, 1] - yy) < 0.03]
    if len(sl) > 10 and (best is None or sl[:, 0].max() - sl[:, 0].min() > best[0]): best = (sl[:, 0].max() - sl[:, 0].min(), yy)
band = S[np.abs(S[:, 1] - best[1]) < 0.06]
eL = band[np.argmax(band[:, 0])]; eR = band[np.argmin(band[:, 0])]
ear_c = (eL + eR) / 2; ear_w = (eL[0] - eR[0]) / 2
face_front = S[:, 2].max(); chin = S[(S[:, 2] > ear_c[2] + 0.15) & (np.abs(S[:, 0]) < 0.25)][:, 1].min()
print('chibi ears', np.round(eL, 3), np.round(eR, 3), 'chin %.3f' % chin)

sat = col.max(1) - col.min(1)
hair = (lum < 70) if CHIBI else ~skin & ((lum < 70) | ((lum < 135) & (sat > 12)))
if CHIBI: hair &= cen[:, 1] > chin + 0.05                              # the chibi's dark shirt   # dark hair and its warm highlights (a gray shirt is neither)
inface = (cen[:, 2] > ear_c[2] + 0.25 * (face_front - ear_c[2])) & (np.abs(cen[:, 0] - ear_c[0]) < 0.55 * ear_w) & (cen[:, 1] < ear_c[1] + 0.25 * ear_w) & (cen[:, 1] > chin)
if os.environ.get('HAIRMINY'): hair &= cen[:, 1] > float(os.environ['HAIRMINY'])   # nothing below the nape (a mannequin's dark neck base)
hair &= ~inface                                                       # eyes and brows (a faceless head has none)
hair &= ~((cen[:, 1] < chin + 0.05) & (np.abs(cen[:, 0] - ear_c[0]) < 0.45 * ear_w) & (cen[:, 2] > ear_c[2]))   # a dark collar under the chin
sat = col.max(1) - col.min(1)
acc_m = (~hair & ~skin) & (not CHIBI) & (lum >= 70) & (sat > 40) & (cen[:, 1] > ear_c[1] - 0.2 * ear_w)   # coloured accessories on the head: headbands, ties
# keep the big connected pieces (strands that touch the main mass)
_, inv = np.unique(np.round(P * 1e4).astype(np.int64), axis=0, return_inverse=True); inv = inv.ravel(); FW = inv[F]
par = np.arange(inv.max() + 1)
def find(a):
    while par[a] != a: par[a] = par[par[a]]; a = par[a]
    return a
for t in FW[hair]:
    for a_, b_ in ((t[0], t[1]), (t[1], t[2])):
        ra, rb = find(a_), find(b_)
        if ra != rb: par[ra] = rb
root = np.array([find(t[0]) for t in FW]); r, cnt = np.unique(root[hair], return_counts=True); import os
bigs = set(r) if os.environ.get('KEEPALL') else set(r[cnt > cnt.max() * 0.02])   # (a head of separate strands: keep every piece, the remesh joins them)
keep = hair & np.isin(root, list(bigs)); print('hair tris', int(hair.sum()), 'kept', int(keep.sum()), 'accessory tris', int(acc_m.sum()))
# hair ties painted near skin colour: skin-coloured pieces not joined to the head's own skin
par2 = np.arange(inv.max() + 1)
def find2(a):
    while par2[a] != a: par2[a] = par2[par2[a]]; a = par2[a]
    return a
for t in FW[skin]:
    for a_, b_ in ((t[0], t[1]), (t[1], t[2])):
        ra, rb = find2(a_), find2(b_)
        if ra != rb: par2[ra] = rb
sroot = np.array([find2(t[0]) for t in FW]); sr, sc = np.unique(sroot[skin], return_counts=True); mainskin = sr[np.argmax(sc)]
# a tie touches the hair: its pieces share vertices with hair triangles
hairverts = np.zeros(inv.max() + 1, bool); hairverts[FW[keep].ravel()] = True
ties = skin & (sroot != mainskin) & (cen[:, 1] > chin) & np.array([hairverts[t].any() for t in FW])
tie_roots = set(sroot[ties]); ties = skin & np.isin(sroot, list(tie_roots)) & (sroot != mainskin)
if ties.sum() >= 30 and not CHIBI: acc_m = acc_m | ties; print('hair ties', int(ties.sum()))
FA = F[acc_m] if acc_m.sum() >= 30 else F[:0]; F = F[keep]   # a few stray coloured triangles are not an accessory

# ---- the base head
JB, BB = glb('/home/claude/out/base-plus-nomorph.glb'); pb = JB['meshes'][0]['primitives'][0]
PB = acc(JB, BB, pb['attributes']['POSITION']).astype(float); FB = acc(JB, BB, pb['indices']).reshape(-1, 3).astype(int)
hsel = (PB[FB].min(1)[:, 1] > 1.33)
bvh = BVHTree.FromPolygons([tuple(v) for v in PB], [tuple(int(x) for x in t) for t in FB[hsel]])
B_EAR_Y, B_EAR_W, B_CX = 1.49, 0.167, 0.0175
eb = PB[(np.abs(PB[:, 1] - B_EAR_Y) < 0.01)]; B_EAR_Z = eb[np.argmax(np.abs(eb[:, 0] - B_CX)), 2]
CEN = np.array([B_CX, 1.53, -0.025])
s = B_EAR_W / ear_w
Q = (P - ear_c) * s + np.array([B_CX, B_EAR_Y, B_EAR_Z])
used = np.unique(np.r_[F.ravel(), FA.ravel()]); Qn = Q.copy()
ssm = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))
bodyT = BVHTree.FromPolygons([tuple(v) for v in PB], [tuple(int(x) for x in t) for t in FB[PB[FB].min(1)[:, 1] > 0.95]])
from mathutils.kdtree import KDTree
Wt = {}; Dc = {}
for i in used:   # the cap conforms to her skull
    v = Q[i]; d = v - CEN; rh = np.linalg.norm(d); d /= rh; w = ssm((v[1] - (B_EAR_Y - 0.07)) / 0.09); Wt[i] = w
    hit = bvh.ray_cast(Vector(CEN), Vector(d), 1.0)
    if hit[0] is not None:
        rb = hit[3]; t = rh - rb; tt = 0.004 + 0.11 * np.tanh(max(t, 0) / 0.13)   # thin hair hugs the skull; buns and volume keep most of their height
        Dc[i] = CEN + d * (rb + tt) - v
caps = [i for i in used if Wt[i] > 0.95 and i in Dc]; kd = KDTree(len(caps))
for k, i in enumerate(caps): kd.insert(Vector(Q[i]), k)
kd.balance()
for i in used:
    v = Q[i].copy(); w = Wt[i]
    # what hangs below (tails, ponytails, long hair) moves with the hair it hangs from, so it stays attached
    if w < 1 and caps: co, k, _ = kd.find(Vector(Q[i])); v = v + (1 - w) * Dc[caps[k]]
    if w > 0 and i in Dc: v = v + w * Dc[i]
    loc, nrm, _, dist = bodyT.find_nearest(Vector(v))
    if loc is not None:
        off = np.array(v) - np.array(loc); n = np.array(nrm)
        if off @ n < 0.006: v = np.array(loc) + n * 0.006            # never inside her head, neck, shoulders or back
    Qn[i] = v
# a scalp under the hair: her head's skin wherever hair lies over it, lifted 2.5 mm and coloured like the hair, so gaps
# between strands show hair, not skin
hT = BVHTree.FromPolygons([tuple(v) for v in Qn], [tuple(int(x) for x in t) for t in F])
hv = np.where((PB[:, 1] > 1.43))[0]; cov = np.zeros(len(PB), bool)
for i in hv:
    d = PB[i] - CEN; r = np.linalg.norm(d); d /= r; h = hT.ray_cast(Vector(PB[i] - d * 0.002), Vector(d), 0.08)
    if h[0] is not None: cov[i] = True
nbB = [[] for _ in range(len(PB))]
for t in FB[hsel]:
    for a_, b_ in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])): nbB[a_].append(b_); nbB[b_].append(a_)
for _ in range(4):   # close small gaps in the coverage (thin styles like a buzz cut have holes)
    c2 = cov.copy()
    for i in hv:
        if not cov[i] and nbB[i] and np.mean(cov[nbB[i]]) >= 0.4: c2[i] = True
    cov = c2
st = FB[hsel]; st = st[cov[st].all(1)]
sv = np.unique(st); smap = -np.ones(len(PB), int); smap[sv] = np.arange(len(sv))
SP = PB[sv] + (PB[sv] - CEN) / np.linalg.norm(PB[sv] - CEN, axis=1, keepdims=True) * 0.0025; SF = smap[st]
print('scalp tris', len(SF))
print('scale %.4f' % s, 'fitted y %.3f..%.3f' % (Qn[used, 1].min(), Qn[used, 1].max()))

# ---- compact geometry + value texture (hair shading as gray, so the editor can tint it any colour)
remap = -np.ones(len(P), int); remap[used] = np.arange(len(used)); FF = remap[F]; FFA = remap[FA]
VP = Qn[used].astype(np.float32); VUV = UV[used].astype(np.float32)
g = np.array(TEX.convert('L')).astype(float); hm = g[g < 70]
lo, hi = np.percentile(hm, 2), np.percentile(hm, 99.5); val = np.clip((g - lo) / max(hi - lo, 1), 0, 1)
val = (0.62 + 0.38 * val) * 255; vimg = Image.fromarray(val.astype(np.uint8)).convert('RGB')
if vimg.size[0] > 512: vimg = vimg.resize((512, 512), Image.LANCZOS)
varr = np.array(vimg)[:, :, 0]; dy, dx = np.unravel_index(np.argmin(np.where(varr > 0, varr, 255)), varr.shape); SUV = np.array([(dx + 0.5) / varr.shape[1], (dy + 0.5) / varr.shape[0]], np.float32)   # a dark texel for the scalp
buf = io.BytesIO(); vimg.save(buf, 'JPEG', quality=85); tex = buf.getvalue()
ab = io.BytesIO(); TEX.resize((256, 256), Image.LANCZOS).save(ab, 'JPEG', quality=85); atex = ab.getvalue()
BIN = bytearray(); views = []; accs = []
def push(data, target=None):
    while len(BIN) % 4: BIN.append(0)
    off = len(BIN); BIN.extend(data); v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target: v['target'] = target
    views.append(v); return len(views) - 1
def add(arr, comp, typ, target, mm=False):
    a = {'bufferView': push(arr.tobytes(), target), 'componentType': comp, 'type': typ, 'count': int(arr.shape[0])}
    if mm: a['min'] = [float(x) for x in arr.min(0)]; a['max'] = [float(x) for x in arr.max(0)]
    accs.append(a); return len(accs) - 1
G = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': 'hair', 'mesh': 0}],
     'meshes': [{'primitives': [{'attributes': {'POSITION': add(VP, 5126, 'VEC3', 34962, True), 'TEXCOORD_0': add(VUV, 5126, 'VEC2', 34962)},
                                 'indices': add(FF.reshape(-1).astype(np.uint32), 5125, 'SCALAR', 34963), 'material': 0}]}],
     'materials': [{'name': 'hair', 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 0.7}},
                   {'name': 'accessory', 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorTexture': {'index': 1}, 'metallicFactor': 0, 'roughnessFactor': 0.6}}],
     'textures': [{'source': 0, 'sampler': 0}, {'source': 1, 'sampler': 0}], 'samplers': [{'magFilter': 9729, 'minFilter': 9987}],
     'images': [{'bufferView': push(tex), 'mimeType': 'image/jpeg'}, {'bufferView': push(atex), 'mimeType': 'image/jpeg'}], 'bufferViews': views, 'accessors': accs}
if len(SF):
    G['meshes'][0]['primitives'].append({'attributes': {'POSITION': add(SP.astype(np.float32), 5126, 'VEC3', 34962, True), 'TEXCOORD_0': add(np.tile(SUV, (len(SP), 1)), 5126, 'VEC2', 34962)},
                                         'indices': add(SF.reshape(-1).astype(np.uint32), 5125, 'SCALAR', 34963), 'material': 0})
if len(FFA):
    G['meshes'][0]['primitives'].append({'attributes': G['meshes'][0]['primitives'][0]['attributes'], 'indices': add(FFA.reshape(-1).astype(np.uint32), 5125, 'SCALAR', 34963), 'material': 1})
while len(BIN) % 4: BIN.append(0)
G['buffers'] = [{'byteLength': len(BIN)}]
js = json.dumps(G, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
open(OUT, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(BIN)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(BIN), 0x004E4942) + bytes(BIN))
print(OUT, '%.2f MB' % ((28 + len(js) + len(BIN)) / 1e6), len(VP), 'verts', len(FF), 'tris')
