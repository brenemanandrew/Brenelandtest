"""Add Meshy accessories to the game's clothes catalogue (models/clothes.json + clothing-catalog.js) as new models, each fitted to
the bounding box of the catalogue model it is like (in that model's body frame), coloured by zones: Meshy's texture clustered into
a few colours, zone k takes the catalogue piece's cols[k-1]; uvs all on a white texel of the shared sheet (so the colour is exact).
Usage (from make_testgame): run(clothes_json_in, clothes_json_out) -> catalogue lines to add."""
import json, os, sys, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts')); import meshlib as L
from scipy.cluster.vq import kmeans2
M = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models', '05-accessories')
WHITE_UV = [3285, 1993]   # a white block on clothes/sheet.webp (white either way up)
# key: (file, like-model, frame, zones, front-only?, catalogue lines)
A = {
 'bobble':   ('bobble_hat.glb', 'beanie', 'head', 2, False, [("hat-bobble-rust", "Rust Bobble Hat", 'hat', 4, "{ cover: 'beanie' }"), ("hat-bobble-cream", "Cream Bobble Hat", 'hat', 4, "{ cover: 'beanie' }")]),
 'fedora':   ('fedora.glb', 'bucket', 'head', 2, False, [("hat-fedora-brown", "Brown Felt Fedora", 'hat', 6, "{ cover: 'cap', deco: true }"), ("hat-fedora-teal", "Teal Felt Fedora", 'hat', 6, "{ cover: 'cap', deco: true }")]),
 'strawhat': ('straw_hat.glb', 'sunhat', 'head', 3, False, [("hat-garden-straw", "Garden Straw Hat", 'hat', 5, "{ cover: 'sunhat' }")]),
 'sunnies':  ('sunglasses.glb', 'glassesround', 'head', 2, True, [("glasses-sunny", "Retro Round Sunglasses", 'acc', 4, "{ where: 'head' }")]),
 'satchel':  ('satchel.glb', 'backpack', 'chest', 2, False, [("satchel-tan", "Leather Satchel", 'acc', 6, "{ where: 'chest' }")]),
}
COLS = {"hat-bobble-rust": ['#d9682a', '#f1e5d0'], "hat-bobble-cream": ['#efe4cc', '#c7392f'], "hat-fedora-brown": ['#7a5234', '#3a2a20'],
        "hat-fedora-teal": ['#2f7a7a', '#3a2a20'], "hat-garden-straw": ['#e3c57f', '#9cc0b4', '#f4f1e6'], "glasses-sunny": ['#c86f2a', '#3a2a20'],
        "satchel-tan": ['#a0562a', '#d9b35a']}
def run(src, dst):
    D = json.load(open(src)); lines = []
    for key, (fn, like, frame, k, front, cat) in A.items():
        ref = np.array(D['models'][like]['parts'][frame]['pos']).reshape(-1, 3) / 1000; rmn, rmx = ref.min(0), ref.max(0)
        m = L.load(os.path.join(M, fn)); v = m.vertices.copy(); f = m.faces.copy(); rgb = L.face_rgb(m)
        mn, mx = v.min(0), v.max(0)
        if front:   # glasses: width and height from the reference, a thin depth at its front
            kk = (rmx[:2] - rmn[:2]) / (mx[:2] - mn[:2]); s = min(kk)
            v = (v - [(mn[0] + mx[0]) / 2, mn[1], mx[2]]) * s + [(rmn[0] + rmx[0]) / 2, rmn[1], rmx[2]]
        else:
            if frame == 'head' and key in ('fedora', 'strawhat'):   # their crowns must clear the head: top at least the beanie's top + a bit
                btop = np.array(D['models']['beanie']['parts']['head']['pos']).reshape(-1, 3)[:, 1].max() / 1000; rmx = rmx.copy(); rmn = rmn.copy(); rmx[1] = max(rmx[1], btop + 0.09); rmn[1] += 0.07   # brim up off the eyes
            v = (v - [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2]) * ((rmx - rmn) / (mx - mn)) + [(rmn[0] + rmx[0]) / 2, rmn[1], (rmn[2] + rmx[2]) / 2]
        # zones: k colour clusters by brightness order (zone 1 = the biggest area)
        fc = L.flat_colours(m.vertices, m.faces, rgb, k=k, smooth=16)
        uniq, lab = np.unique(fc.round(), axis=0, return_inverse=True); lab = lab.ravel()
        order = np.argsort(-np.bincount(lab)); zone_of = {int(c): i + 1 for i, c in enumerate(order)}
        P = v[f].reshape(-1, 3); T = P.reshape(-1, 3, 3); nz = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); nz /= np.linalg.norm(nz, axis=1, keepdims=True) + 1e-12
        D['models']['r_' + key] = {'parts': {frame: {'pos': (P * 1000).round().astype(int).ravel().tolist(), 'nor': (np.repeat(nz, 3, 0) * 100).round().astype(int).ravel().tolist(),
            'uv': WHITE_UV * len(P), 'zone': np.repeat([zone_of[int(c)] for c in lab], 3).tolist(), 'idx': list(range(len(P)))}}}
        for (pid, name, kind, price, extra) in cat:
            lines.append(f"  P('{pid}', '{name}', '{kind}', 'r_{key}', {json.dumps(COLS[pid][:k])}, {price}, {extra}),")
        print(key, len(f), 'tris, fitted to', like, (v.max(0) - v.min(0)).round(3))
    json.dump(D, open(dst, 'w'))
    return lines
RIM = {'r_bobble': 'beanie', 'r_fedora': 'bucket', 'r_strawhat': 'sunhat'}   # the hair cover of the catalogue hat each is shaped like
