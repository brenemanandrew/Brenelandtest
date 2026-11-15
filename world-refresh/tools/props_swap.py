"""Swap shapes in the game's props.json (props-static.js) for converted Meshy models.
Usage: python3 props_swap.py IN_props.json OUT_props.json
Each swapped shape is fitted to the old shape's bounding box (so footprints, colliders and seat heights in the code still fit),
keeps every skin key the callers ask for (all mapped to the model's own colours), keeps the old anchors (seats, table tops,
names), and for lamps gets a new 'glow' part from the model's lit glass, with light_anchor moved to the middle of that glass."""
import sys, os, json, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts')); import meshlib as L
WR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); M = os.path.join(WR, 'models')
# shape: (model, fit, opts). fit 'box' = the old bounding box on every axis; 'h' = uniform to the old height, centred like the old one
SWAP = {
 'street_lamp':       (M + '/02-small-props/street_lamp.glb', 'h', {'glow': 1, 'post': {'w': 0.5, 'h': 4.46}}),     # Andrew: squat -> slim post, head kept
 'post_lantern':      (M + '/02-small-props/post_lantern.glb', 'h', {'glow': 1, 'post': {'w': 0.42, 'h': 3.92}}),
 'camp_lantern':      (M + '/02-small-props/camp_lantern.glb', 'h', {'glow': 1}),
 'planter_brick':     (M + '/02-small-props/planter_brick.glb', 'box', {}),
 'bench_park':        (M + '/02-small-props/bench_park.glb', 'box', {'back': -1, 'colours': 3}),
 'picnic_table':      (M + '/02-small-props/picnic_table.glb', 'box', {}),
 'picnic_table_long': (M + '/02-small-props/picnic_table_long.glb', 'box', {}),
 'shelter':           (M + '/03-large-props/shelter.glb', 'box', {'roof': {'eave': 2.6, 'roof_h': 1.5}}),   # Andrew: squat -> posts up to the 2.6 m eave
}
def vertex_rgb(m):
    tex = np.asarray(m.visual.material.baseColorTexture.convert('RGB').resize((512, 512))); uv = m.visual.uv
    x = np.clip((uv[:, 0] % 1) * 511, 0, 511).astype(int); y = np.clip((1 - uv[:, 1] % 1) * 511, 0, 511).astype(int)
    return tex[y, x].astype(int)
def run(src, dst):
    D = json.load(open(src))
    for shape, (path, fit, o) in SWAP.items():
        S = D['shapes'][shape]
        old = np.concatenate([np.array(p['pos']).reshape(-1, 3) for p in S['parts'].values()]); omn, omx = old.min(0), old.max(0); oe = omx - omn
        m = L.load(path); v = m.vertices.copy(); f = m.faces; rgb = vertex_rgb(m)
        e = v.max(0) - v.min(0)
        if (oe[0] > oe[2]) != (e[0] > e[2]) and abs(oe[0] - oe[2]) > 0.15 * max(oe[0], oe[2]): v = v[:, [2, 1, 0]] * [1, 1, -1]; f = f[:, ::-1]   # long side the same way as the old shape
        if o.get('back'):   # benches: the backrest (the tall half) must be on the same side as the old shape's
            hi = v[:, 1] > v[:, 1].min() + 0.7 * (v[:, 1].max() - v[:, 1].min()); zc = (v[:, 2].max() + v[:, 2].min()) / 2
            if np.sign(v[hi, 2].mean() - zc) != o['back']: v = v * [-1, 1, -1]
        mn, mx = v.min(0), v.max(0); e = mx - mn
        if o.get('post') or o.get('roof'):
            v = v - [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2]; H0 = e[1]
            bins = 40; yb = np.minimum((v[:, 1] / H0 * bins).astype(int), bins - 1)
            wid = np.array([np.hypot(v[yb == i, 0], v[yb == i, 2]).max() if (yb == i).any() else 0 for i in range(bins)])
            if o.get('post'):   # the head: from the widest slice in the top half down to where it narrows to the post
                top = bins // 2 + int(np.argmax(wid[bins // 2:])); i = top
                while i > 0 and wid[i] > 0.45 * wid[top]: i -= 1
                split = (i + 1) / bins * H0; kw = o['post']['w'] / max(e[0], e[2]); head_h = (H0 - split) * kw; base_h = o['post']['h'] - head_h
                v[:, [0, 2]] *= kw
            else:               # the roof: everything from the eave (lowest slice nearly as wide as the roof) up
                tri0 = v[f]; nz = np.cross(tri0[:, 1] - tri0[:, 0], tri0[:, 2] - tri0[:, 0]); area = np.linalg.norm(nz, axis=1); ny = nz[:, 1] / (area + 1e-12)
                cy = tri0[:, :, 1].mean(1); cr = np.hypot(tri0[:, :, 0].mean(1), tri0[:, :, 2].mean(1))
                under = (ny < -0.5) & (cr > 0.45 * cr.max()) & (cy > 0.3 * H0)        # the roof's underside, out towards its edge
                split = np.percentile(cy[under], 10) if under.any() else 0.6 * H0
                base_h = o['roof']['eave']; head_h = o['roof']['roof_h'] * (H0 - split) / max(H0 - split, 1e-6)
                v[:, [0, 2]] *= (oe[[0, 2]] / e[[0, 2]])
            y = v[:, 1]; v[:, 1] = np.where(y < split, y / split * base_h, base_h + (y - split) / (H0 - split) * head_h)
            print(f'  {shape}: split at {split / H0:.2f} of the height')
            v += [0, omn[1], 0] if o.get('post') else [(omn[0] + omx[0]) / 2, omn[1], (omn[2] + omx[2]) / 2]; k = None   # (a lamp's post stands on the shape's origin, where its collider is)
        elif fit == 'box': k = oe / e
        else: k = np.full(3, oe[1] / e[1])
        if k is not None: v = (v - [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2]) * k + [(omn[0] + omx[0]) / 2, omn[1], (omn[2] + omx[2]) / 2]
        tri = v[f]; nrm = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]); nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12
        col = rgb[f].mean(1)                                   # one colour per face (flat, like the old props)
        # Andrew: the per-face colours from Meshy's texture looked blotchy. Clean flat look: cluster to a few colours (STYLE.md:
        # 2 to 4 main colours), each face takes its cluster's colour; glowing glass is kept apart so it stays bright
        glow = np.zeros(len(f), bool)
        if o.get('glow'): glow = (col[:, 0] > 185) & (col[:, 1] > 140) & (col[:, 2] < 150) & (col[:, 0] - col[:, 2] > 80)
        from scipy.cluster.vq import kmeans2
        kk = o.get('colours', 5); rng = np.random.default_rng(0)
        cent, lab0 = kmeans2(col[~glow].astype(float), kk, seed=rng, minit='++')
        lab = np.full(len(f), -1); lab[~glow] = lab0
        import trimesh                                          # speckles (painted brush strokes) -> each face takes its neighbours' majority
        adj = trimesh.Trimesh(v, f, process=True).face_adjacency
        for _ in range(int(o.get('smooth', 6))):
            votes = np.zeros((len(f), kk))
            for a, b2 in ((adj[:, 0], adj[:, 1]), (adj[:, 1], adj[:, 0])):
                ok = lab[b2] >= 0; np.add.at(votes, (a[ok], lab[b2][ok]), 1)
            keep = lab >= 0; votes[np.arange(len(f))[keep], lab[keep]] += 1.5   # a face keeps its own colour on a tie
            new = votes.argmax(1); lab = np.where((lab >= 0) & (votes.sum(1) > 0), new, lab)
        col = col.copy(); col[lab >= 0] = cent[lab[lab >= 0]]
        def part(sel, skins):
            P = tri[sel].reshape(-1, 3); N = np.repeat(nrm[sel], 3, 0)
            out = {'pos': P.round(4).ravel().tolist(), 'nor': N.round(3).ravel().tolist(), 'idx': list(range(len(P)))}
            if skins:
                C = np.repeat(col[sel], 3, 0).round().astype(int).ravel().tolist(); out['skins'] = {k: C for k in skins}
            return out
        skins = sorted({k for p in S['parts'].values() for k in p.get('skins', {})})
        parts = {'body': part(~glow, skins)}
        oldglow = [n for n, p in S['parts'].items() if 'skins' not in p]
        if glow.any() and oldglow:
            parts[oldglow[0]] = part(glow, None)
            if 'light_anchor' in S['anchors']: S['anchors']['light_anchor']['pos'] = tri[glow].reshape(-1, 3).mean(0).round(3).tolist()
        S['parts'] = parts
        print(f'{shape:18s} {len(f)} tris, glow {int(glow.sum())}, size now {(v.max(0) - v.min(0)).round(2)} (old {oe.round(2)})')
    json.dump(D, open(dst, 'w'))
if __name__ == '__main__': run(sys.argv[1], sys.argv[2])
