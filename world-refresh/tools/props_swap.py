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
 'bench_park':        (M + '/02-small-props/bench_park.glb', 'box', {'back': -1, 'colours': 3, 'seat': 1}),
 'picnic_table':      (M + '/02-small-props/picnic_table.glb', 'box', {'benches': 1}),        # Andrew: sat in the wrong spot
 'picnic_table_long': (M + '/02-small-props/picnic_table_long.glb', 'box', {'benches': 1}),
 'shelter':           (M + '/03-large-props/shelter.glb', 'box', {'roof': {'eave': 2.6, 'roof_h': 1.5, 'straight': 1}}),   # Andrew: squat -> posts up to the 2.6 m eave
}
def vertex_rgb(m):
    tex = np.asarray(m.visual.material.baseColorTexture.convert('RGB').resize((512, 512))); uv = m.visual.uv
    x = np.clip((uv[:, 0] % 1) * 511, 0, 511).astype(int); y = np.clip((1 - uv[:, 1] % 1) * 511, 0, 511).astype(int)
    return tex[y, x].astype(int)
def run(src, dst, texdir=None):
    import trimesh
    if texdir: os.makedirs(texdir, exist_ok=True)
    D = json.load(open(src))
    for shape, (path, fit, o) in SWAP.items():
        S = D['shapes'][shape]
        old = np.concatenate([np.array(p['pos']).reshape(-1, 3) for p in S['parts'].values()]); omn, omx = old.min(0), old.max(0); oe = omx - omn
        post_uv = None
        m = L.load(path); v = m.vertices.copy(); f = m.faces; rgb = vertex_rgb(m)
        e = v.max(0) - v.min(0)
        if (oe[0] > oe[2]) != (e[0] > e[2]) and abs(oe[0] - oe[2]) > 0.15 * max(oe[0], oe[2]): v = v[:, [2, 1, 0]] * [1, 1, -1]; f = f[:, ::-1]   # long side the same way as the old shape
        def upfaces(V, F, lo, hi):
            T = V[F]; nz = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); a = np.linalg.norm(nz, axis=1) + 1e-12; ny = nz[:, 1] / a
            cy = T[:, :, 1].mean(1); H0 = V[:, 1].max() - V[:, 1].min(); y0 = V[:, 1].min(); sel = (ny > 0.85) & (cy > y0 + lo * H0) & (cy < y0 + hi * H0)
            return T[sel].mean(1), a[sel]
        if o.get('benches'):
            c, _ = upfaces(v, f, 0.25, 0.7); ctr = (v.max(0) + v.min(0)) / 2; ext = v.max(0) - v.min(0)
            far = lambda ax: np.mean(np.abs(c[:, ax] - ctr[ax]) > 0.3 * ext[ax] / 2 * 2 * 0.5) if len(c) else 0
            if far(0) > far(2): v = v[:, [2, 1, 0]] * [1, 1, -1]; f = f[:, ::-1]; print(f'  {shape}: turned so the benches run along x')
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
            if o.get('roof') and o['roof'].get('straight'):   # Andrew: Meshy's posts are bent trunks -> straight square posts in their place
                import trimesh
                cyv = v[f][:, :, 1].max(1); low = cyv < split * 0.97
                from scipy.cluster.vq import kmeans2
                P = v[np.unique(f[low])]; cent, lab = kmeans2(P[:, [0, 2]], 8, seed=np.random.default_rng(1), minit='++')
                posts = []
                for c in range(8):          # a post: a cluster of low points that runs most of the way up to the eave
                    Q = P[lab == c]
                    if len(Q) > 20 and np.ptp(Q[:, 1]) > 0.6 * split and all(np.hypot(*(cent[c] - np.array(q))) > 0.25 * e[0] for q in posts): posts.append(tuple(cent[c]))
                if len(posts) > 4:   # one post per corner: the furthest out in each quadrant
                    q = {}
                    for (px, pz) in posts:
                        k2 = (px > 0, pz > 0)
                        if k2 not in q or px * px + pz * pz > q[k2][0] ** 2 + q[k2][1] ** 2: q[k2] = (px, pz)
                    posts = list(q.values())
                post_uv = m.visual.uv[m.faces[low][len(m.faces[low]) // 2][0]] if low.any() else None   # texture spot of the old (wooden) posts
                keep = ~low; f = f[keep]; rgb_post = rgb[m.faces[low]].mean((0, 1)) if low.any() else np.array([120, 70, 40])
                pv, pf = [], []
                for (cx, cz) in posts:                         # a square post, 0.28 m (in the model's own scale before fitting)
                    w = o['roof'].get('post_w', 0.42); b0 = trimesh.creation.box((w, split * 1.04, w)); b0.apply_translation((cx, split * 0.52, cz))
                    pf.append(b0.faces + len(v) + sum(len(x) for x in pv)); pv.append(b0.vertices)
                if posts:
                    v = np.vstack([v] + pv); f = np.vstack([f] + pf)
                    rgb = np.vstack([rgb, np.tile(rgb_post.round().astype(int), (sum(len(x) for x in pv), 1))])
                print(f'  {shape}: {len(posts)} straight posts')
            y = v[:, 1]; v[:, 1] = np.where(y < split, y / split * base_h, base_h + (y - split) / (H0 - split) * head_h)
            print(f'  {shape}: split at {split / H0:.2f} of the height')
            v += [0, omn[1], 0] if o.get('post') else [(omn[0] + omx[0]) / 2, omn[1], (omn[2] + omx[2]) / 2]; k = None   # (a lamp's post stands on the shape's origin, where its collider is)
        elif fit == 'box': k = oe / e
        else: k = np.full(3, oe[1] / e[1])
        if k is not None: v = (v - [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2]) * k + [(omn[0] + omx[0]) / 2, omn[1], (omn[2] + omx[2]) / 2]
        if o.get('benches') or o.get('seat'):
            lo, hi = (0.25, 0.7) if o.get('benches') else (0.2, 0.75)
            c, a = upfaces(v, f, lo, hi)
            if len(c):   # the game sits people at 0.3 m (park.js SEAT_H): squash only what is under the seat down to that
                top0 = float(np.percentile(c[:, 1], 70)); y0 = v[:, 1].min()
                if top0 - y0 > 0.33:
                    k2 = 0.31 / (top0 - y0); y = v[:, 1] - y0; v[:, 1] = y0 + np.where(y < top0 - y0, y * k2, 0.31 + (y - (top0 - y0)))
                    c, a = upfaces(v, f, lo * 0.7, hi)
                for nm, A in S['anchors'].items():
                    if not nm.startswith('seat'): continue
                    side = c[np.sign(c[:, 2] - (v[:, 2].max() + v[:, 2].min()) / 2) == np.sign(A['pos'][2] or 1)] if o.get('benches') else c
                    if not len(side): continue
                    top = float(np.percentile(side[:, 1], 70)); zc = float(np.percentile(side[:, 2], 85 if (A['pos'][2] or 1) > 0 else 15)) if o.get('benches') else float(np.median(side[:, 2]))
                    A['pos'] = [A['pos'][0], round(top, 3), round(zc, 3)]; A['seat_h'] = round(top, 3)
                tops = upfaces(v, f, 0.8, 1.01)[0]
                if 'table_top' in S['anchors'] and len(tops): S['anchors']['table_top']['pos'][1] = round(float(np.percentile(tops[:, 1], 70)), 3)
                print(f'  {shape}: seats now', [S['anchors'][k]['pos'] for k in S['anchors'] if k.startswith('seat')])
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
        if texdir:   # the textured body (glass stays the glow part): fitted vertices, Meshy's own uvs, 1024 px texture
            fill = (post_uv if post_uv is not None else m.visual.uv[m.faces[0][0]])[None]
            uv = np.vstack([m.visual.uv, np.repeat(fill, len(v) - len(m.visual.uv), 0)]) if len(v) > len(m.visual.uv) else m.visual.uv
            tex = m.visual.material.baseColorTexture.convert('RGB').resize((1024, 1024))
            tm = trimesh.Trimesh(v, f[~glow], visual=trimesh.visual.TextureVisuals(uv=uv, material=trimesh.visual.material.PBRMaterial(baseColorTexture=tex, metallicFactor=0, roughnessFactor=1)), process=False)
            tm.export(os.path.join(texdir, 'prop_' + shape + '.glb'), include_normals=True)
        oldglow = [n for n, p in S['parts'].items() if 'skins' not in p]
        if glow.any() and oldglow:
            parts[oldglow[0]] = part(glow, None)
            if 'light_anchor' in S['anchors']: S['anchors']['light_anchor']['pos'] = tri[glow].reshape(-1, 3).mean(0).round(3).tolist()
        S['parts'] = parts
        print(f'{shape:18s} {len(f)} tris, glow {int(glow.sum())}, size now {(v.max(0) - v.min(0)).round(2)} (old {oe.round(2)})')
    json.dump(D, open(dst, 'w'))
if __name__ == '__main__': run(sys.argv[1], sys.argv[2])
