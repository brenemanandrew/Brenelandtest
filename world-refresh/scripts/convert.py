"""Convert picked Meshy models to game-ready GLBs.
For each asset: optional turn so the long side runs along x, scale to the size the game uses today (measured from the live
game code, see world-refresh/models/converted/SIZES.md), origin at the centre of the base on the ground, front facing +z.
Writes two versions: models/converted/tex/NAME.glb (keeps the 2k texture) and models/converted/vc/NAME.glb (texture baked to
vertex colours, no texture: fits the game's current vertex-coloured toon batch). Leaves of seasonal trees are made a pale
neutral wash in both, so the game can tint them by season (decision in SWAP.md)."""
import os, sys, json, colorsys, numpy as np, trimesh
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__)); import meshlib as L
R = 'models/'; P1 = R + '01-plants-trees/'; TR = R + 'trimmed/'
# name: (source, mode, target). mode 'h' = uniform to height, 'w' = uniform to widest side, 'bed' = uniform to fit 2.6 x 1.3,
# 'box' = non-uniform to [length x, height y, depth z]. 'long': turn so the long side is x. 'neutral': seasonal leaves.
A = {
 'oak':          (P1 + 'v3/oak.glb', 'h', 5.9, {'neutral': 1, 'maxw': 5.6}),   # Andrew: the picnic's big oak (s 1.6) was massive; crown kept near the old 5.3 m
 'maple':        (P1 + 'v2/maple.glb', 'h', 5.37, {'neutral': 1}),
 'birch':        (TR + 'birch.glb', 'h', 6.71, {'neutral': 1, 'crown': 0.45}),
 'pine':         (P1 + 'pine.glb', 'h', 6.62, {}),
 'palm':         (P1 + 'wave2/palm.glb', 'h', 5.89, {}),
 'hedge_box':    (P1 + 'v3/hedge_a.glb', 'box', [3.3, 1.5, 0.92], {'long': 1}),
 'hedge_end':    (P1 + 'wave2_redo/hedge_end.glb', 'box', [1.65, 1.5, 0.92], {'long': 1}),
 'hedge_bush':   (P1 + 'v3/hedge_b.glb', 'h', 1.2, {}),
 'topiary_ball': (P1 + 'wave2/hedge_end.glb', 'h', 1.0, {}),
 'flower_patch': (P1 + 'v2/flower_patch.glb', 'w', 1.5, {}),
 'mossy_rock':   (P1 + 'v2/mossy_rock.glb', 'w', 1.5, {}),
 'fern':         (TR + 'fern.glb', 'w', 0.7, {}),
 'mushrooms':    (P1 + 'wave2/mushrooms.glb', 'h', 0.3, {}),
 'log':          (P1 + 'wave2/log.glb', 'box', [2.5, 0.5, 0.6], {'long': 1}),   # seat top must sit low (sheet: 0.3 m log)
 'shore_rock':   (P1 + 'wave2/shore_rock.glb', 'w', 1.0, {}),
 'grass_tuft':   (P1 + 'wave2/grass_tuft.glb', 'h', 0.3, {}),
 'raised_bed':   (P1 + 'v3/raised_bed.glb', 'box', [3.0, 0.5, 1.6], {'long': 1}),
 'lettuce':      (P1 + 'v2/lettuce_row.glb', 'bed', None, {'long': 1}),
 'carrots':      (P1 + 'wave2/carrots.glb', 'bed', None, {'long': 1}),
 'strawberries': (P1 + 'wave2/strawberries.glb', 'bed', None, {'long': 1}),
 'pumpkins':     (P1 + 'pumpkin_vines_with_pumpkins.glb', 'bed', None, {'long': 1, 'maxh': 0.8}),
 'tomatoes':     (TR + 'tomato_plants.glb', 'h', 1.2, {}),
 'sunflower':    (P1 + 'sunflowers.glb', 'h', 2.0, {}),
 'herb_pot':     (P1 + 'wave2_redo/herb_pot.glb', 'h', 0.4, {}),
 'weed':         (P1 + 'wave2_redo/weed.glb', 'h', 0.25, {}),
 'rose_arch':    (P1 + 'wave2/rose_arch.glb', 'box', [2.6, 3.3, 0.9], {'long': 1}),   # posts 2.16 m apart in garden-build.js
 'trellis':      (P1 + 'wave2/trellis.glb', 'h', 1.5, {}),
}
def neutral(img):
    a = np.asarray(img.convert('RGB')).astype(float) / 255
    h, s, v = np.vectorize(colorsys.rgb_to_hsv, otypes=[float] * 3)(a[..., 0], a[..., 1], a[..., 2])
    leaf = (h > 0.13) & (h < 0.5) & (s > 0.12)                    # greens and yellow-greens
    from scipy import ndimage                                      # pale highlight strokes inside the leaves count as leaf too
    pale = (v > 0.6) & (s < 0.25)
    leaf = leaf | (pale & ndimage.binary_dilation(leaf, iterations=8))
    lum = 0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]
    g = np.clip(0.86 + (lum - lum[leaf].mean()) * 1.0, 0, 1) if leaf.any() else lum   # pale, keeps the wash light/dark
    out = a.copy()
    for c, tint in enumerate((0.97, 1.0, 0.95)): out[..., c] = np.where(leaf, g * tint, a[..., c])
    return Image.fromarray((out * 255).astype(np.uint8)), Image.fromarray((leaf * 255).astype(np.uint8))
def run(name, src, mode, tgt, o):
    m = L.load(src)
    tex = m.visual.material.baseColorTexture
    leafmask = None
    if o.get('neutral'): tex, leafmask = neutral(tex)
    v = m.vertices.copy()
    ext = v.max(0) - v.min(0)
    if o.get('long') and ext[2] > ext[0]: v = v[:, [2, 1, 0]] * [1, 1, -1]; ext = v.max(0) - v.min(0)
    if mode == 'h': k = np.full(3, tgt / ext[1])
    elif mode == 'w': k = np.full(3, tgt / max(ext[0], ext[2]))
    elif mode == 'bed': k = np.full(3, min(2.6 / ext[0], 1.3 / ext[2], o.get('maxh', 9) / ext[1]))
    else: k = np.array(tgt) / ext
    v = v * k
    if o.get('maxw'):                                              # narrow the crown, keep the height
        e = v.max(0) - v.min(0); f = min(1, o['maxw'] / max(e[0], e[2])); v[:, [0, 2]] *= f
    mn, mx = v.min(0), v.max(0)
    v -= [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2]
    faces = m.faces if np.linalg.det(np.diag(k)) > 0 and not (o.get('long') and (m.vertices.max(0) - m.vertices.min(0))[2] > (m.vertices.max(0) - m.vertices.min(0))[0]) else m.faces
    uv = m.visual.uv
    mat = trimesh.visual.material.PBRMaterial(baseColorTexture=tex, metallicFactor=0, roughnessFactor=1)
    t = trimesh.Trimesh(v, faces, visual=trimesh.visual.TextureVisuals(uv=uv, material=mat), process=False)
    t.export(f'{R}converted/tex/{name}.glb', include_normals=True)
    small = tex.convert('RGB').resize((512, 512))                  # bake: sample per vertex (soft blur, the wash survives a bit)
    a = np.asarray(small); hh, ww = a.shape[:2]
    x = np.clip((uv[:, 0] % 1) * (ww - 1), 0, ww - 1).astype(int); y = np.clip((1 - uv[:, 1] % 1) * (hh - 1), 0, hh - 1).astype(int)
    alpha = np.full(len(x), 255)
    if leafmask is not None:                                       # alpha 128 = leaf: the game tints these by season
        lm = np.asarray(leafmask.resize((512, 512))); alpha = np.where(lm[y, x] > 127, 128, 255)
        fa = alpha[faces].reshape(-1, 3); fl = (fa == 128).sum(1) >= 2  # one answer per face: no half-tinted triangles
        fy = v[faces][:, :, 1].mean(1); fl &= fy > o.get('crown', 0.3) * v[:, 1].max()   # nothing low on the trunk is leaf (moss marks on bark)
        alpha = alpha.copy(); alpha[faces[fl].ravel()] = 128; alpha[faces[~fl].ravel()] = 255
    col = np.c_[a[y, x], alpha].astype(np.uint8)
    vc = trimesh.Trimesh(v, faces, vertex_colors=col, process=False); vc.export(f'{R}converted/vc/{name}.glb', include_normals=True)
    e = v.max(0) - v.min(0)
    return {'name': name, 'source': src, 'size_m': [round(float(x), 2) for x in e], 'tris': int(len(faces))}
os.makedirs(R + 'converted/tex', exist_ok=True); os.makedirs(R + 'converted/vc', exist_ok=True)
rows = [run(n, *a) for n, a in A.items()]
json.dump(rows, open(R + 'converted/manifest.json', 'w'), indent=1)
for r in rows: print(f"{r['name']:13s} {r['size_m']} {r['tris']} tris")
