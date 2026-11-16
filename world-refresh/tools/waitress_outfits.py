"""The Summit Slice waitresses' uniforms (Andrew: evening = green shirt and a black skirt; day = the striped diner uniform from the
concept sheet, concepts/waitress_sheet_v2.png): edits the game's baked MPFB characters in place of their Blender sources (those are
on Andrew's PC). Zoe and Asha, day and night:
  night  the green top kept, a black flared skirt added over the shorts (the shorts go black underneath), black shoes
  day    the red polo becomes red and cream stripes, the black trousers go (hidden below the hem: the body's own legs are under
         them), a cream skirt with a red band at the hem, Asha's apron red, white sneakers
The skirt is new geometry: rings round the hips measured off the shorts/trousers, flaring out and down, an inner layer, weighted to
the pelvis with the thighs taking over toward the hem (so it swings with the walk), with the ink hull like the other clothes.
Usage: python3 tools/waitress_outfits.py SRC_DIR OUT_DIR   (SRC_DIR = breneland-live/models/mpfb; writes the 4 .json/.bin/.webp)"""
import sys, os, json, shutil, numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__)); import mpfb_io, mpfb_fixes, anime_head

SRC, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
HEADS = os.environ.get('HEADS') == '1'
SZ = 2048
def sw_xy(k): return 1536 + (k % 16) * 32, 1536 + (k // 16) * 32
def sw_uv(k): x, y = sw_xy(k); return ((x + 16) / SZ, 1 - (y + 16) / SZ)
def swatches(M):
    UV = M['uv'].reshape(-1, 2); px = np.clip((UV[:, 0] * SZ).astype(int), 0, SZ - 1); py = np.clip(((1 - UV[:, 1]) * SZ).astype(int), 0, SZ - 1)
    return np.where((px >= 1536) & (py >= 1536), (px - 1536) // 32 + ((py - 1536) // 32) * 16, -1)
def hexrgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
def smooth(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

# texture regions added to the sheet (the free tiles in its lower half): stripes for the day shirt, the skirts' colour by height
STRIPE = (0, 1536)       # tile 12: red and cream bands, 16 px each, along v
SKIRTD = (512, 1536)     # tile 13: cream, a red band near the bottom (the day skirt; v runs top->hem)
SKIRTN = (1024, 1536)    # tile 14: black, a slightly lighter band at the hem (the night skirt)
STRIPE_K = 800 / SZ      # v per metre of height on the shirt: 32 px a stripe pair = 4 cm
def paint_regions(im):
    a = np.array(im)
    x0, y0 = STRIPE
    for y in range(512): a[y0 + y, x0:x0 + 512] = (*hexrgb('#c7392f' if (y // 16) % 2 == 0 else '#f3ead8'), 255)
    x0, y0 = SKIRTD
    for y in range(512): a[y0 + y, x0:x0 + 512] = (*hexrgb('#c7392f' if 400 <= y < 440 else '#f3ead8'), 255)
    x0, y0 = SKIRTN
    for y in range(512): a[y0 + y, x0:x0 + 512] = (*hexrgb('#2c2a32' if 440 <= y < 470 else '#1d1c22'), 255)
    return Image.fromarray(a)
def region_uv(reg, t):   # t 0..1 down the region
    x0, y0 = reg; return np.stack([np.full_like(t, (x0 + 256) / SZ), 1 - (y0 + 8 + t * 496) / SZ], 1)

def add_swatch(J, im, col):
    k = len(J['palette']); x, y = sw_xy(k); a = np.array(im); a[y:y + 32, x:x + 32] = (*hexrgb(col), 255); J['palette'][str(k)] = col
    return k, Image.fromarray(a)

def build_skirt(M, cloth, top, hem, flare, segs, rings, uvfn, bones, ink_w):
    """rings round the hips from `top` to `hem`, each at least `cloth` verts' reach + ease, flaring; returns new verts + tris"""
    P = M['pos'].reshape(-1, 3); C = P[cloth]; cz = C[np.abs(C[:, 1] - top) < 0.04][:, 2].mean()
    ang = np.arctan2(C[:, 0], -(C[:, 2] - cz)); rad = np.hypot(C[:, 0], C[:, 2] - cz)
    th = np.linspace(-np.pi, np.pi, segs, endpoint=False)
    R = []; prev = None
    ys = np.linspace(top, hem, rings)
    for y in ys:
        band = np.abs(C[:, 1] - y) < 0.03; r = np.zeros(segs)
        for i, t in enumerate(th):
            d = np.abs((ang[band] - t + np.pi) % (2 * np.pi) - np.pi); m = d < 0.2
            r[i] = rad[band][m].max() if m.any() else 0
        if (r == 0).any():   # fill gaps round the ring from neighbours
            ok = r > 0; r = np.interp(np.arange(segs), np.arange(segs)[ok], r[ok], period=segs) if ok.any() else np.full(segs, prev.mean() if prev is not None else 0.15)
        r = r + 0.016
        for _ in range(3): r = np.maximum(r, (np.roll(r, 1) + np.roll(r, -1) + 2 * r) / 4)   # (round out the dips)
        if prev is not None: r = np.maximum(r, prev + flare / (rings - 1))   # (flare: metres it widens from waist to hem, at least)
        R.append(r); prev = r
    R = np.array(R)
    # positions: outer layer, then inner layer 5 mm in
    V = []; N = []
    for j, y in enumerate(ys):
        for i, t in enumerate(th):
            s, c = np.sin(t), -np.cos(t); V.append((s * R[j, i], y, cz + c * R[j, i])); N.append((s, 0.25 * j / rings, c))
    V = np.array(V, np.float32); N = np.array(N, np.float32); N /= np.linalg.norm(N, axis=1, keepdims=True)
    Vi = V.copy(); Vi[:, 0] -= N[:, 0] * 0.005; Vi[:, 2] -= N[:, 2] * 0.005
    nv = len(V); F = []
    for j in range(rings - 1):
        for i in range(segs):
            a, b, c2, d = j * segs + i, j * segs + (i + 1) % segs, (j + 1) * segs + (i + 1) % segs, (j + 1) * segs + i
            F += [(a, c2, d), (a, b, c2)]                                       # outer (facing out)
            F += [(nv + a, nv + d, nv + c2), (nv + a, nv + c2, nv + b)]         # inner (facing in)
    F = np.array(F, np.int64)
    allV = np.vstack([V, Vi]); allN = np.vstack([N, -N])
    t = np.repeat((ys - top) / (hem - top), segs); t = np.concatenate([t, t])
    UV = uvfn(t).astype(np.float32)
    # weights: the pelvis at the waist, the thighs (by side) taking over toward the hem
    pel, tl, tr = bones; x = allV[:, 0]; tw = smooth(0, 1, t) * 0.6; sl = smooth(-0.06, 0.06, x)
    W = np.stack([1 - tw, tw * sl, tw * (1 - sl), np.zeros_like(x)], 1); W = np.round(W * 255).astype(np.int32)
    W[:, 0] += 255 - W.sum(1)
    SI = np.tile(np.array([pel, tl, tr, 0], np.int32), (len(allV), 1))
    INK = np.vstack([N * ink_w, np.zeros_like(N)])
    outer_tris = F[: (rings - 1) * segs * 4].reshape(-1, 4, 3)[:, :2].reshape(-1, 3)
    return allV, allN, UV, SI, W, INK, F, outer_tris

def edit(M, Mn_unused, plan, J, bones, ink_w, detail):
    P = M['pos'].reshape(-1, 3); sw = swatches(M); n0 = M['verts']
    UV = M['uv'].reshape(-1, 2).copy()
    # recolours by uv: per vertex set
    for mask, uv in plan['uv']:
        m = mask(P, sw); UV[m] = uv(P[m]) if callable(uv) else uv
    tris = M['groups'][''].reshape(-1, 3).astype(np.int64); ink_t = M['inkGroups'].get('', np.zeros(0, np.uint16)).reshape(-1, 3).astype(np.int64)
    if plan.get('hide') is not None:   # triangles of the trousers below the hem go: the legs under them show
        hv = plan['hide'](P, sw); keep = ~hv[tris].any(1); tris = tris[keep]; ink_t = ink_t[~hv[ink_t].all(1)]
    sk = plan['skirt']; cloth = sk['cloth'](P, sw)
    V, N, SUV, SI, W, INK, F, OT = build_skirt(M, np.where(cloth)[0], sk['top'], sk['hem'], sk['flare'], detail[0], detail[1], sk['uv'], bones, ink_w)
    M['pos'] = np.concatenate([M['pos'], V.ravel()]).astype(np.float32)
    M['nor'] = np.concatenate([M['nor'], N.ravel()]).astype(np.float32)
    M['uv'] = np.concatenate([UV.ravel(), SUV.ravel()]).astype(np.float32)
    M['fuv'] = np.concatenate([M['fuv'], np.zeros(len(V) * 2, np.float32)]).astype(np.float32)
    M['si'] = np.concatenate([M['si'], SI.ravel().astype(np.uint8)])
    M['sw'] = np.concatenate([M['sw'], W.ravel().astype(np.uint8)])
    M['ink'] = np.concatenate([M['ink'], np.round(INK.ravel() * 100000).astype(np.int16)])
    M['groups'][''] = np.concatenate([tris.ravel(), (F + n0).ravel()]).astype(np.uint16 if n0 + len(V) < 65536 else np.uint32)
    M['inkGroups'][''] = np.concatenate([ink_t.ravel(), (OT + n0).ravel()]).astype(M['groups'][''].dtype)
    M['verts'] = n0 + len(V); M['tris'] = sum(len(g) for g in M['groups'].values()) // 3

def write(J, M, L, buf, out_json):
    """re-pack every section: mesh and lod from the edited arrays, everything else copied as it was"""
    parts = []; off = [0]
    def put(arr, typ):
        a = np.ascontiguousarray(arr.astype(mpfb_io.T[typ])); pad = (-off[0]) % 4
        if pad: parts.append(b'\0' * pad); off[0] += pad
        s = {'off': off[0], 'n': int(a.size), 'type': typ}; parts.append(a.tobytes()); off[0] += a.nbytes; return s
    def pack_mesh(JM, D):
        for k in ('pos', 'nor', 'uv', 'fuv', 'si', 'sw', 'ink'):
            if k in JM: JM[k] = put(D[k], JM[k]['type'])
        gt = 'uint32' if D['groups'][''].dtype == np.uint32 else 'uint16'
        JM['groups'] = {g: put(a, gt) for g, a in D['groups'].items()}
        JM['inkGroups'] = {g: put(a, gt) for g, a in D['inkGroups'].items()}
        for nm, m in JM.get('morphs', {}).items(): m['idx'] = put(D['morphs'][nm][0], m['idx']['type']); m['d'] = put(D['morphs'][nm][1], m['d']['type'])
        JM['verts'] = int(D['verts']); JM['tris'] = int(D['tris'])
    pack_mesh(J['mesh'], M); pack_mesh(J['lod'], L)
    def copy_secs(o):
        if isinstance(o, dict):
            if set(o.keys()) >= {'off', 'n', 'type'}: s = put(mpfb_io.sec(buf, o), o['type']); o.update(s); return
            for v in o.values(): copy_secs(v)
        elif isinstance(o, list):
            for v in o: copy_secs(v)
    for k in ('clips', 'faceClips'): copy_secs(J.get(k, {}))
    data = b''.join(parts); J['bytes'] = len(data); J['tris'] = int(M['tris']); J['lodTris'] = int(L['tris'])
    open(os.path.join(os.path.dirname(out_json), J['bin']), 'wb').write(data); json.dump(J, open(out_json, 'w'), separators=(',', ':'))

for who in ('zoe', 'asha'):
    for when in ('day', 'night'):
        nid = f'{who}_{when}'; J, buf, M, L = mpfb_io.load(os.path.join(SRC, nid + '.json'))
        im = Image.open(os.path.join(SRC, J['sheet']['full'])).convert('RGBA'); im = paint_regions(im)
        names = [b['name'] for b in J['bones']]; bones = (names.index('pelvis'), names.index('thigh_l'), names.index('thigh_r'))
        pal = {v: int(k) for k, v in J['palette'].items()}
        if when == 'night':
            shorts = pal['#28335c']; shoes = None
            k_black, im = add_swatch(J, im, '#1d1c22')
            plan = {'uv': [(lambda P, s, sh=shorts: s == sh, np.array(sw_uv(k_black), np.float32))],   # the shorts black, under the skirt
                    'hide': None,
                    'skirt': {'cloth': lambda P, s, sh=shorts: s == sh, 'top': 0.72, 'hem': 0.40, 'flare': 0.07, 'uv': lambda t: region_uv(SKIRTN, t)}}
        else:
            shirt = pal['#b8262b']; pants = pal['#1f1d22']; shoe_c = '#141217'; shoe = pal[shoe_c]
            k_white, im = add_swatch(J, im, '#f4f1ea'); k_red, im = add_swatch(J, im, '#c7392f')
            hem = 0.36 if who == 'asha' else 0.38
            stripe_uv = lambda Pm: np.stack([np.full(len(Pm), (STRIPE[0] + 256) / SZ), 1 - (STRIPE[1] + 8 + (1.1 - Pm[:, 1]) * STRIPE_K * SZ) / SZ], 1).astype(np.float32)
            uvp = [(lambda P, s, sh=shirt: s == sh, stripe_uv),                                                         # stripes
                   (lambda P, s, so=shoe: (s == so) & (P[:, 1] < 0.2), np.array(sw_uv(k_white), np.float32))]          # white sneakers
            if who == 'asha': uvp.append((lambda P, s, a=pal['#1b191e']: s == a, np.array(sw_uv(k_red), np.float32)))   # her apron red
            plan = {'uv': uvp, 'hide': lambda P, s, pa=pants, h=hem: (s == pa) & (P[:, 1] < 0.74),   # (all of the trousers under the skirt: the skirt slider can shorten it)
                    'skirt': {'cloth': lambda P, s, pa=pants: (s == pa) & (P[:, 1] > 0.3), 'top': 0.74, 'hem': hem, 'flare': 0.06, 'uv': lambda t: region_uv(SKIRTD, t)}}
        ink_w = 0.008
        edit(M, None, plan, J, bones, ink_w, (64, 12)); edit(L, None, plan, J, bones, ink_w, (24, 5))
        imref = [im]; swc = {}
        def swf(h, J=J, imref=imref, swc=swc):
            if h not in swc: k, imref[0] = add_swatch(J, imref[0], h); swc[h] = sw_uv(k)
            return swc[h]
        mm = (mpfb_fixes.remove_box_island(M), mpfb_fixes.remove_box_island(L))   # (the face: its front shell off, the hole filled smoothly)
        if HEADS:   # (new heads: off until Andrew picks a direction; HEADS=1 turns the anime_head.py try on)
            mm = anime_head.apply(M, J, who, swf); anime_head.apply(L, J, who, swf); im = imref[0]
            pv = anime_head.scale_head(M, J); anime_head.scale_head(L, J); anime_head.scale_head_info(J, pv)
        if when == 'night':   # high heels, the feet part of them; the game lifts her by the new lowest point
            wp = mpfb_fixes.bone_world(J); bu = np.array(sw_uv(k_black), np.float32)
            sh = pal['#17151a']
            fl = mpfb_fixes.heels(M, J, wp, bu, shoe=swatches(M)[:M['verts']] == sh); mpfb_fixes.heels(L, J, wp, bu, shoe=swatches(L)[:L['verts']] == sh); J['floor'] = fl
            print(nid, 'heels: floor', round(fl, 4))
        print(nid, 'mouth verts moved', mm)
        im.save(os.path.join(OUT, J['sheet']['full']), 'WEBP', lossless=True)
        if J['sheet'].get('half'): im.resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, J['sheet']['half']), 'WEBP', lossless=True)
        write(J, M, L, buf, os.path.join(OUT, nid + '.json'))
        print(nid, 'verts', M['verts'], 'tris', M['tris'], 'lod', L['verts'], L['tris'])

# Belinda and Mina: their new anime heads too
for nid in ('belinda', 'mina'):
    J, buf, M, L = mpfb_io.load(os.path.join(SRC, nid + '.json'))
    imref = [Image.open(os.path.join(SRC, J['sheet']['full'])).convert('RGBA')]; swc = {}
    def swf(h, J=J, imref=imref, swc=swc):
        if h not in swc: k, imref[0] = add_swatch(J, imref[0], h); swc[h] = sw_uv(k)
        return swc[h]
    print(nid, 'box island removed', mpfb_fixes.remove_box_island(M), mpfb_fixes.remove_box_island(L))
    if nid == 'belinda':   # her hair as one piece (Andrew: no dip in the middle of the crown)
        hk = int({v: k for k, v in J['palette'].items()}['#16141c']); print('belinda hair dip lifted', mpfb_fixes.fill_hair_dip(M, J, hk), mpfb_fixes.fill_hair_dip(L, J, hk))
        print('belinda bust at rest', mpfb_fixes.rest_bust(M, J), mpfb_fixes.rest_bust(L, J))
        pk = {v: int(k) for k, v in J['palette'].items()}; bu = np.array(sw_uv(pk['#17151a']), np.float32)   # open stiletto sandals (Andrew)
        # (belinda_neckline: the lower neckline works, the rebuilt straps do not yet - off until they do)
        fl = mpfb_fixes.sandals(M, J, bu, pk['#17151a'], pk['#c98e62']); mpfb_fixes.sandals(L, J, bu, pk['#17151a'], pk['#c98e62']); J['floor'] = fl; print('belinda sandals, floor', round(fl, 4))
        if not HEADS:
            for kk in ('full', 'half'):
                f = J['sheet'].get(kk)
                if f and os.path.exists(os.path.join(SRC, f)): shutil.copy(os.path.join(SRC, f), os.path.join(OUT, f))
            for D in (M, L): D['tris'] = sum(len(g) for g in D['groups'].values()) // 3
            write(J, M, L, buf, os.path.join(OUT, nid + '.json')); continue
    if nid == 'mina':   # her collar flap removed (Andrew's markup: it stood out, then lay across her chest)
        bk = int({v: k for k, v in J['palette'].items()}['#efe5cc']); print('mina collar flap removed', mpfb_fixes.remove_collar(M, bk), mpfb_fixes.remove_collar(L, bk))
        if not HEADS:
            for kk in ('full', 'half'):
                f = J['sheet'].get(kk)
                if f and os.path.exists(os.path.join(SRC, f)): shutil.copy(os.path.join(SRC, f), os.path.join(OUT, f))
            for D in (M, L): D['tris'] = sum(len(g) for g in D['groups'].values()) // 3
            write(J, M, L, buf, os.path.join(OUT, nid + '.json')); continue
    mm = anime_head.apply(M, J, nid, swf); anime_head.apply(L, J, nid, swf)
    pv = anime_head.scale_head(M, J); anime_head.scale_head(L, J); anime_head.scale_head_info(J, pv)
    imref[0].save(os.path.join(OUT, J['sheet']['full']), 'WEBP', lossless=True)
    if J['sheet'].get('half'): imref[0].resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, J['sheet']['half']), 'WEBP', lossless=True)
    write(J, M, L, buf, os.path.join(OUT, nid + '.json')); print(nid, 'new head verts', mm)
