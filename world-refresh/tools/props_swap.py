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
 'street_lamp':       (M + '/02-small-props/street_lamp.glb', 'h', {'glow': 1}),
 'post_lantern':      (M + '/02-small-props/post_lantern.glb', 'h', {'glow': 1}),
 'camp_lantern':      (M + '/02-small-props/camp_lantern.glb', 'h', {'glow': 1}),
 'planter_brick':     (M + '/02-small-props/planter_brick.glb', 'box', {}),
 'bench_park':        (M + '/02-small-props/bench_park.glb', 'box', {'back': -1}),
 'picnic_table':      (M + '/02-small-props/picnic_table.glb', 'box', {}),
 'picnic_table_long': (M + '/02-small-props/picnic_table_long.glb', 'box', {}),
 'shelter':           (M + '/03-large-props/shelter.glb', 'box', {}),
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
        if fit == 'box': k = oe / e
        else: k = np.full(3, oe[1] / e[1])
        v = (v - [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2]) * k + [(omn[0] + omx[0]) / 2, omn[1], (omn[2] + omx[2]) / 2]
        tri = v[f]; nrm = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]); nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12
        col = rgb[f].mean(1)                                   # one colour per face (flat, like the old props)
        glow = np.zeros(len(f), bool)
        if o.get('glow'): glow = (col[:, 0] > 185) & (col[:, 1] > 140) & (col[:, 2] < 150) & (col[:, 0] - col[:, 2] > 80)
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
        print(f'{shape:18s} {len(f)} tris, glow {int(glow.sum())}, fitted to {oe.round(2)}')
    json.dump(D, open(dst, 'w'))
if __name__ == '__main__': run(sys.argv[1], sys.argv[2])
