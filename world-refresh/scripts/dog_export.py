"""A Meshy dog statue (no rig needed) -> models/characters/<name>_mesh.glb + <name>_meta.json for tools/nala-model.js (the game's
dog rig drives it). Faces +z, feet on y=0. Tail joints: four points along the tail (what sticks out behind the hind legs, above
the hocks). Head straightened about the collar (collar colour 'blue' or 'purple'). Jaw: under the mouth line in front of the head.
Usage: python3 dog_export.py SRC.glb NAME COLLAR"""
import sys, json, numpy as np, trimesh
src, name, collar = sys.argv[1], sys.argv[2], sys.argv[3]
sc = trimesh.load(src, force='scene'); g = list(sc.geometry.values())[0]
v = g.vertices.copy(); uv = g.visual.uv; tex = g.visual.material.baseColorTexture
v = v / (v.max(0) - v.min(0)).max() * 3.8                       # (any unit: the game fits her to the code dog's height)
def turn(P, a, c=(0, 0, 0)):
    c = np.array(c); x = P[:, 0] - c[0]; z = P[:, 2] - c[2]; ca, sa = np.cos(a), np.sin(a); Q = P.copy(); Q[:, 0] = c[0] + x * ca + z * sa; Q[:, 2] = c[2] - x * sa + z * ca; return Q
v[:, 1] -= v[:, 1].min(); H = v[:, 1].max()
low = (v[:, 1] > 0.25 * H) & (v[:, 1] < 0.6 * H)                   # the barrel (no legs, no head)
xz = v[low][:, [0, 2]] - v[low][:, [0, 2]].mean(0); w, U = np.linalg.eigh(np.cov(xz.T)); ax = U[:, 1]
v = turn(v, -np.arctan2(ax[0], ax[1]))
hi = v[:, 1] > 0.75 * H                                           # the head is the high end: make it +z
if v[hi, 2].mean() < v[:, 2].mean(): v = v * [-1, 1, -1]
mn, mx = v.min(0), v.max(0); v -= [(mn[0] + mx[0]) / 2, 0, (mn[2] + mx[2]) / 2]
t3 = np.asarray(tex.convert('RGB').resize((1024, 1024))).astype(int)
c = t3[np.clip(((1 - uv[:, 1] % 1) * 1023).astype(int), 0, 1023), np.clip(((uv[:, 0] % 1) * 1023).astype(int), 0, 1023)]
col = (c[:, 2] > c[:, 0] + 25) & (c[:, 2] > c[:, 1] + 5) if collar == 'blue' else (c[:, 2] > c[:, 1] + 15) & (c[:, 0] > c[:, 1])
col &= (v[:, 1] > 0.4 * H) & (v[:, 2] > 0)
C = v[col].mean(0)
front = v[:, 2] > C[2]; nose = v[front][np.argmax(v[front][:, 2])]; phi = np.arctan2(-(nose[0] - C[0]), nose[2] - C[2])
tt = np.clip((v[:, 2] - (C[2] - 0.35)) / 0.35, 0, 1); tt = tt * tt * (3 - 2 * tt); a = phi * tt
x = v[:, 0] - C[0]; z = v[:, 2] - C[2]; v[:, 0] = C[0] + x * np.cos(a) + z * np.sin(a); v[:, 2] = C[2] - x * np.sin(a) + z * np.cos(a)
front = v[:, 2] > C[2]; nose = v[front][np.argmax(v[front][:, 2])]
hc = v[front & (v[:, 1] > C[1])].mean(0); mouthY = nose[1] - 0.06 * H
jaw = front & (v[:, 2] > hc[2]) & (v[:, 1] < mouthY) & (v[:, 1] > mouthY - 0.3) & ~col
# tail: behind the back of the hind legs' top, above 40% height; joints = 4 points along it from the root out
hindZ = np.percentile(v[(v[:, 1] < 0.2 * H)][:, 2], 5)            # the back of the hind paws
tail = (v[:, 2] < hindZ - 0.05) & (v[:, 1] > 0.4 * H)
T = v[tail]; root = T[np.argmax(T[:, 2])]; tip = T[np.argmin(T[:, 2])] if len(T) else root
d = np.linalg.norm(T - root, axis=1); far = d.max(); J = []
for f in (0, 1 / 3, 2 / 3, 0.97):
    sel = np.abs(d - f * far) < 0.08 * far + 1e-6; J.append(T[sel].mean(0) if sel.any() else root + (tip - root) * f)
mat = trimesh.visual.material.PBRMaterial(baseColorTexture=tex.convert('RGB').resize((1024, 1024)), metallicFactor=0, roughnessFactor=1)
trimesh.Trimesh(v, g.faces, visual=trimesh.visual.TextureVisuals(uv=uv, material=mat), process=False).export(f'models/characters/{name}_mesh.glb', include_normals=True)
json.dump({'tail_joints': [np.round(j, 4).tolist() for j in J], 'tail_weights': [], 'jaw': np.nonzero(jaw)[0].tolist(), 'hinge': [float(C[0]), float(mouthY), float(hc[2])],
           'collar': C.round(4).tolist(), 'nose': nose.round(4).tolist()}, open(f'models/characters/{name}_meta.json', 'w'))
print(name, 'head turn fixed', round(float(np.degrees(phi)), 1), 'deg; tail verts', int(tail.sum()), 'jaw', int(jaw.sum()), 'collar', int(col.sum()), 'joints', [np.round(j, 2).tolist() for j in J])
