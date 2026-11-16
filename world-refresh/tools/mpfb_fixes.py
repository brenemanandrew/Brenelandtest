"""Fixes on the game's baked MPFB characters (with tools/mpfb_io.py):
  fix_mouth(M)          the mouth piece (the '_mouth' group, a flat plate that carries the lips and the mouth shapes) stood proud of
                        the face, so its edges read as a box on the chin: everything outside the lips is sunk just under the face's
                        own surface (found by casting along z onto the '_face' triangles), the lips stay
  heels(M, J, bones)    high heels (Andrew: shapely heels, the foot part of it): each foot (shoe and the foot inside) tips down about
                        the ankle, the toes are laid flat again from the ball, and a tapered stiletto goes under the heel; returns
                        the new lowest point (the game lifts the body by it: J['floor'])"""
import numpy as np

def smooth(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def _surface_z(P, tris, qx, qy):
    """the largest z of the triangles under each query point (x, y), or nan"""
    A, B, C = P[tris[:, 0]], P[tris[:, 1]], P[tris[:, 2]]
    out = np.full(len(qx), np.nan)
    mnx = np.minimum(np.minimum(A[:, 0], B[:, 0]), C[:, 0]); mxx = np.maximum(np.maximum(A[:, 0], B[:, 0]), C[:, 0])
    mny = np.minimum(np.minimum(A[:, 1], B[:, 1]), C[:, 1]); mxy = np.maximum(np.maximum(A[:, 1], B[:, 1]), C[:, 1])
    for i, (x, y) in enumerate(zip(qx, qy)):
        c = np.where((mnx <= x) & (mxx >= x) & (mny <= y) & (mxy >= y))[0]
        if not len(c): continue
        a, b, cc = A[c], B[c], C[c]
        v0, v1 = b[:, :2] - a[:, :2], cc[:, :2] - a[:, :2]; v2 = np.array([x, y]) - a[:, :2]
        den = v0[:, 0] * v1[:, 1] - v1[:, 0] * v0[:, 1]; ok = np.abs(den) > 1e-12
        u = np.where(ok, (v2[:, 0] * v1[:, 1] - v1[:, 0] * v2[:, 1]) / np.where(ok, den, 1), -1)
        v = np.where(ok, (v0[:, 0] * v2[:, 1] - v2[:, 0] * v0[:, 1]) / np.where(ok, den, 1), -1)
        inside = (u >= -1e-4) & (v >= -1e-4) & (u + v <= 1 + 1e-4)
        if inside.any():
            z = a[:, 2] + u * (b[:, 2] - a[:, 2]) + v * (cc[:, 2] - a[:, 2]); out[i] = z[inside].max()
    return out

def _quad(X, Y):
    return np.stack([np.ones_like(X), X, Y, X * X, X * Y, Y * Y, X ** 3, X * X * Y, X * Y * Y, Y ** 3], 1)

def fix_mouth(M):
    """ERASE the raised rectangular block round the mouth (Andrew: 'the block needs to be erased'): its triangles (found by their
    own side walls; the stored normals are smoothed and hide them) are cut out of the face, and the opening is filled by a new
    patch lying on the face's own surface (a cubic in x, y fitted to the face round the block), slightly larger than the opening
    so no edge shows, carrying the face layer (its face-sheet coordinates fitted from the face round it), the skin colour and the
    head's weights. The lips and the mouth piece are seated on the new surface. Returns the triangles removed."""
    P = M['pos'].reshape(-1, 3); N = M['nor'].reshape(-1, 3)
    if '_mouth' not in M['groups'] or '_face' not in M['groups']: return 0
    mv = np.unique(M['groups']['_mouth'])
    T = M['groups']['_face'].reshape(-1, 3).astype(np.int64); A, B, C = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    nn = np.cross(B - A, C - A); nn /= np.maximum(np.linalg.norm(nn, axis=1), 1e-12)[:, None]; c = (A + B + C) / 3
    mc = P[mv].mean(0)
    near = (np.abs(c[:, 0] - mc[0]) < 0.12) & (np.abs(c[:, 1] - mc[1]) < 0.09) & (c[:, 2] > mc[2] - 0.08)
    walls = (np.abs(nn[:, 0]) > 0.75) & near
    if walls.sum() < 6: return 0
    Wc = c[walls]
    x0, x1 = min(Wc[:, 0].min(), P[mv, 0].min()), max(Wc[:, 0].max(), P[mv, 0].max())
    y0, y1 = min(Wc[:, 1].min(), P[mv, 1].min()), max(Wc[:, 1].max(), P[mv, 1].max())
    # its floor: downward-facing triangles under it, within its width, joined to the walls (no gap of more than 1.5 cm)
    dn = (nn[:, 1] < -0.75) & (c[:, 0] > x0 - 0.003) & (c[:, 0] < x1 + 0.003) & (c[:, 2] > P[mv, 2].max() - 0.06) & (c[:, 1] < y0 + 0.005)
    ys = np.sort(c[dn, 1])[::-1]
    for yy in ys:
        if yy > y0 - 0.015: y0 = min(y0, yy)
        else: break
    cx, cy, hx, hy = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 + 0.005, (y1 - y0) / 2 + 0.005
    zf = P[mv, 2].max()
    ua, va = (P[:, 0] - cx) / hx, (P[:, 1] - cy) / hy
    fvs = np.unique(T)
    ring = np.zeros(len(P), bool); ring[fvs] = True
    ring &= (np.abs(ua) < 1.7) & (np.abs(va) < 1.7) & ~((np.abs(ua) < 1.08) & (np.abs(va) < 1.08)) & (P[:, 2] > zf - 0.07) & (N[:, 2] > 0.25)
    if ring.sum() < 20: return 0
    cf, *_ = np.linalg.lstsq(_quad(ua[ring], va[ring]), P[ring, 2], rcond=None)
    zfit = lambda u, v: _quad(u, v) @ cf
    # the block's front plane (forward-facing triangles inside it): how far the lips must come back
    fr = (nn[:, 2] > 0.8) & (np.abs(c[:, 0] - cx) < hx) & (np.abs(c[:, 1] - cy) < hy) & (c[:, 2] > zf - 0.03)
    Fc = c[fr]; cp, *_ = np.linalg.lstsq(np.stack([np.ones(len(Fc)), (Fc[:, 0] - cx) / hx, (Fc[:, 1] - cy) / hy], 1), Fc[:, 2], rcond=None)
    # cut: face triangles inside the block (centroid in its outline, in front of the fitted surface's depth less 4 cm)
    cu, cv = (c[:, 0] - cx) / hx, (c[:, 1] - cy) / hy
    inside = lambda q: (np.abs((q[:, 0] - cx) / hx) < 1.05) & (np.abs((q[:, 1] - cy) / hy) < 1.05) & (q[:, 2] > zfit(np.clip((q[:, 0] - cx) / hx, -1, 1), np.clip((q[:, 1] - cy) / hy, -1, 1)) - 0.04)
    cut = inside(c)
    keepT = T[~cut]
    for g in list(M['groups'].keys()):   # (the block's walls in any other group go too)
        if g in ('_face', '_mouth'): continue
        tg = M['groups'][g].reshape(-1, 3).astype(np.int64)
        if len(tg): M['groups'][g] = tg[~inside(P[tg].mean(1))].ravel().astype(M['groups'][g].dtype)
    inside_ink = lambda q: (np.abs((q[:, 0] - cx) / hx) < 1.25) & (np.abs((q[:, 1] - cy) / hy) < 1.2) & (q[:, 2] > zfit(np.clip((q[:, 0] - cx) / hx, -1, 1), np.clip((q[:, 1] - cy) / hy, -1, 1)) - 0.05)
    for g in list(M.get('inkGroups', {}).keys()):   # (the outline: a little wider, so no saw-tooth of the old walls' outline stays)
        if g == '_mouth': continue
        tg = M['inkGroups'][g].reshape(-1, 3).astype(np.int64)
        if len(tg): M['inkGroups'][g] = tg[~inside_ink(P[tg].mean(1))].ravel().astype(M['inkGroups'][g].dtype)
    # the patch: a grid on the fitted surface, a little past the opening
    nu, nv = 20, 16; gu = np.linspace(-1.15, 1.15, nu); gv = np.linspace(-1.15, 1.15, nv)
    U, Vv = np.meshgrid(gu, gv); U, Vv = U.ravel(), Vv.ravel()
    PX = np.stack([cx + U * hx, cy + Vv * hy, zfit(U, Vv) - 0.0004], 1).astype(np.float32)
    eps = 1e-3; dzu = (zfit(U + eps, Vv) - zfit(U - eps, Vv)) / (2 * eps) / hx; dzv = (zfit(U, Vv + eps) - zfit(U, Vv - eps)) / (2 * eps) / hy
    # normals: the face's own stored normals are a smooth stylised field (not the surface's); continue that field over the patch
    cn, *_ = np.linalg.lstsq(_quad(ua[ring], va[ring]), N[ring], rcond=None)
    NX = _quad(U, Vv) @ cn; NX = (NX / np.linalg.norm(NX, axis=1, keepdims=True)).astype(np.float32)
    rid = np.where(ring)[0]
    nearest = rid[np.argmin(((PX[:, None, :2] - P[rid][None, :, :2]) ** 2).sum(2), 1)]
    UV = M['uv'].reshape(-1, 2); FUV = M['fuv'].reshape(-1, 2); SI = M['si'].reshape(-1, 4); SW = M['sw'].reshape(-1, 4); INK = M['ink'].reshape(-1, 3)
    fa, *_ = np.linalg.lstsq(np.stack([np.ones(len(rid)), P[rid, 0], P[rid, 1]], 1), FUV[rid], rcond=None)
    pf = (np.stack([np.ones(len(PX)), PX[:, 0], PX[:, 1]], 1) @ fa).astype(np.float32)
    F = []
    for jv in range(nv - 1):
        for iu in range(nu - 1):
            a, b, cc, d = jv * nu + iu, jv * nu + iu + 1, (jv + 1) * nu + iu + 1, (jv + 1) * nu + iu
            F += [(a, b, cc), (a, cc, d)]
    F = np.array(F, np.int64)
    # (facing: the patch must face +z; flip if the winding came out backwards)
    tA, tB, tC = PX[F[:, 0]], PX[F[:, 1]], PX[F[:, 2]]
    if np.cross(tB - tA, tC - tA)[:, 2].mean() < 0: F = F[:, [0, 2, 1]]
    n0 = M['verts']
    # the lips and the mouth piece come back onto the new surface
    mu, mvv = (P[mv, 0] - cx) / hx, (P[mv, 1] - cy) / hy
    Pn = P.copy(); Pn[mv, 2] += (zfit(np.clip(mu, -1, 1), np.clip(mvv, -1, 1)) - (cp[0] + cp[1] * np.clip(mu, -1, 1) + cp[2] * np.clip(mvv, -1, 1)))
    M['pos'] = np.concatenate([Pn.ravel(), PX.ravel()]).astype(np.float32)
    M['nor'] = np.concatenate([M['nor'], NX.ravel()]).astype(np.float32)
    M['uv'] = np.concatenate([M['uv'], UV[nearest].ravel()]).astype(np.float32)
    M['fuv'] = np.concatenate([M['fuv'], pf.ravel()]).astype(np.float32)
    M['si'] = np.concatenate([M['si'], SI[nearest].ravel()]); M['sw'] = np.concatenate([M['sw'], SW[nearest].ravel()])
    M['ink'] = np.concatenate([M['ink'], np.zeros(len(PX) * 3, np.int16)])
    dt = M['groups']['_face'].dtype
    M['groups']['_face'] = np.concatenate([keepT.ravel(), (F + n0).ravel()]).astype(dt)
    M['verts'] = n0 + len(PX); M['tris'] = sum(len(g) for g in M['groups'].values()) // 3
    return int(cut.sum())

def _rx(t): c, s = np.cos(t), np.sin(t); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])

def heels(M, J, wpos, black_uv, ink_w=0.008, theta=0.4, toe_back=0.8, segs=10, shoe=None):
    """wpos: bone name -> rest world position. Returns the lowest y after (the new floor)."""
    P = M['pos'].reshape(-1, 3).copy(); N = M['nor'].reshape(-1, 3).copy(); INK = M['ink'].reshape(-1, 3).astype(np.float64) / 100000
    names = [b['name'] for b in J['bones']]
    if shoe is not None:   # backless (Andrew): the shoe's back above the sole goes, so the foot's own heel shows behind
        P0 = P; back = shoe & (P0[:, 1] > 0.016) & (P0[:, 2] < np.array(wpos['foot_l'])[2] + 0.0)
        for grp in (M['groups'], M['inkGroups']):
            if '' in grp:
                t = grp[''].reshape(-1, 3).astype(np.int64); grp[''] = t[~back[t].all(1)].ravel().astype(grp[''].dtype)
    newV = []; newF = []; newUV = []; newSI = []; newSW = []; newN = []; newINK = []
    n0 = M['verts']
    for side in ('l', 'r'):
        ank, ball = np.array(wpos['foot_' + side]), np.array(wpos['ball_' + side])
        m = (np.abs(P[:, 0] - ank[0]) < 0.1) & (P[:, 1] < 0.13) & (P[:, 2] > ank[2] - 0.12) & (P[:, 2] < ball[2] + 0.12)
        idx = np.where(m)[0]; p = P[idx]
        w = 1 - smooth(0.055, 0.125, p[:, 1])                     # the whole foot turns; the ankle eases into the leg
        out = np.empty_like(p); nout = np.empty_like(p); iout = np.empty_like(p)
        bR = _rx(theta) @ (ball - ank) + ank                       # where the ball goes
        for j in range(len(idx)):
            R = _rx(theta * w[j]); q = R @ (p[j] - ank) + ank; nn = R @ N[idx[j]]; ii = R @ INK[idx[j]]
            tk = smooth(ball[2] - 0.015, ball[2] + 0.03, p[j, 2]) * w[j]   # the toes: back down flat about the ball
            if tk > 0: R2 = _rx(-theta * toe_back * tk); q = R2 @ (q - bR) + bR; nn = R2 @ nn; ii = R2 @ ii
            out[j], nout[j], iout[j] = q, nn, ii
        P[idx], N[idx], INK[idx] = out, nout, iout
        # the stiletto: under the back of the heel, tapering down to the floor (the toes' lowest point)
        foot = P[idx]; floor = foot[:, 1].min()
        back = foot[foot[:, 2] < np.percentile(foot[:, 2], 12)]
        hx, hz = back[:, 0].mean(), back[:, 2].mean() + 0.012
        under = foot[(np.abs(foot[:, 0] - hx) < 0.03) & (np.abs(foot[:, 2] - hz) < 0.03)]
        top = under[:, 1].min() + 0.006 if len(under) else floor + 0.06
        rings = [(top, 0.017, 0.014), (top - (top - floor) * 0.5, 0.009, 0.008), (floor + 0.004, 0.0055, 0.005), (floor, 0.0055, 0.005)]
        base = n0 + sum(len(v) for v in newV); V = []; NN = []
        for (y, rx, rz) in rings:
            for i in range(segs):
                a = 2 * np.pi * i / segs; V.append((hx + np.sin(a) * rx, y, hz - 0.004 * (y - floor) / max(1e-3, top - floor) + np.cos(a) * rz)); NN.append((np.sin(a), 0, np.cos(a)))
        V.append((hx, floor, hz)); NN.append((0, -1, 0))
        F = []
        for r in range(len(rings) - 1):
            for i in range(segs):
                a, b = r * segs + i, r * segs + (i + 1) % segs; c, d = a + segs, b + segs
                F += [(a, c, d), (a, d, b)]
        cap = len(V) - 1
        for i in range(segs): F.append(((len(rings) - 1) * segs + i, cap, (len(rings) - 1) * segs + (i + 1) % segs))
        V = np.array(V, np.float32); NN = np.array(NN, np.float32)
        bi = names.index('foot_' + side)
        newV.append(V); newN.append(NN); newF.append(np.array(F) + base); newUV.append(np.tile(black_uv, (len(V), 1)))
        newSI.append(np.tile([bi, 0, 0, 0], (len(V), 1))); newSW.append(np.tile([255, 0, 0, 0], (len(V), 1))); newINK.append(NN * ink_w)
    M['pos'] = np.concatenate([P.ravel()] + [v.ravel() for v in newV]).astype(np.float32)
    M['nor'] = np.concatenate([N.ravel()] + [v.ravel() for v in newN]).astype(np.float32)
    M['uv'] = np.concatenate([M['uv']] + [v.ravel() for v in newUV]).astype(np.float32)
    M['fuv'] = np.concatenate([M['fuv'], np.zeros(sum(len(v) for v in newV) * 2, np.float32)])
    M['si'] = np.concatenate([M['si']] + [v.ravel().astype(np.uint8) for v in newSI])
    M['sw'] = np.concatenate([M['sw']] + [v.ravel().astype(np.uint8) for v in newSW])
    M['ink'] = np.concatenate([np.round(INK.ravel() * 100000).astype(np.int16)] + [np.round(v.ravel() * 100000).astype(np.int16) for v in newINK])
    F = np.concatenate([f.ravel() for f in newF]).astype(M['groups'][''].dtype)
    M['groups'][''] = np.concatenate([M['groups'][''], F]); M['inkGroups'][''] = np.concatenate([M['inkGroups'].get('', np.zeros(0, F.dtype)), F])
    M['verts'] = n0 + sum(len(v) for v in newV); M['tris'] = sum(len(g) for g in M['groups'].values()) // 3
    return float(M['pos'].reshape(-1, 3)[:, 1].min())

def bone_world(J):
    def qm(q):
        x, y, z, w = q; return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    B = J['bones']; W = [None] * len(B)
    for i, b in enumerate(B):
        R = qm(b['quat']); t = np.array(b['pos'])
        W[i] = (R, t) if b['parent'] < 0 else (W[b['parent']][0] @ R, W[b['parent']][1] + W[b['parent']][0] @ t)
    return {b['name']: W[i][1] for i, b in enumerate(B)}

def round_jaw(M):
    """The lower face was a slab: a flat front the width of the mouth block and a square edge where it drops back to the neck.
    Below the lips: narrow it toward a rounded chin (an ellipse across), and roll the bottom edge back and up (a rounded jaw
    line instead of a corner). Skin and mouth vertices only in that region (the hair at the sides is left alone)."""
    P = M['pos'].reshape(-1, 3).copy()
    if '_mouth' not in M['groups']: return 0
    mv = np.unique(M['groups']['_mouth']); yl = P[mv, 1].min(); zc = P[mv, 2].max()
    fv = np.unique(np.concatenate([M['groups']['_face'], M['groups']['_mouth']]))
    F = P[fv]
    # the jaw's bottom: lowest height where the front still stands within 3 cm of the mouth's depth, near the middle
    mid = (np.abs(F[:, 0]) < 0.03) & (F[:, 2] > zc - 0.03)
    yb = F[mid, 1].min() if mid.any() else yl - 0.06
    if yl - yb < 0.02: return 0
    sel = fv[(P[fv, 1] < yl + 0.004) & (P[fv, 1] > yb - 0.05) & (np.abs(P[fv, 0]) < 0.16)]
    X = P[sel]
    t = np.clip((yl - X[:, 1]) / (yl - yb), 0, 1.3)
    front = np.clip((X[:, 2] - (zc - 0.14)) / 0.12, 0, 1)
    X[:, 0] *= 1 - 0.38 * smooth(0.0, 1.15, t) ** 1.5 * front
    roll = smooth(0.45, 1.25, t) * front
    X[:, 2] -= 0.045 * roll ** 1.6
    X[:, 1] += 0.012 * roll ** 2
    P[sel] = X; M['pos'] = P.ravel().astype(np.float32)
    return int(len(sel))

def _vnormals(V, F):
    n = np.zeros_like(V); fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    for k in range(3): np.add.at(n, F[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)

HEAD_STYLE = {   # from Andrew's art (mall-staff-sheet: his drawings of the sisters and the pizza girls)
    'belinda': dict(w=1.05, jaw=0.20, cheek=0.05, chin=0.04, drop=0.035),   # round, full cheeks, soft wide jaw
    'mina':    dict(w=0.93, jaw=0.30, cheek=0.00, chin=0.08, drop=0.035),   # pale oval, narrow and calm
    'zoe':     dict(w=1.00, jaw=0.27, cheek=0.03, chin=0.06, drop=0.035),   # round, youthful
    'asha':    dict(w=1.03, jaw=0.42, cheek=0.04, chin=0.13, drop=0.035),   # heart: wide cheekbones, a small pointed chin
}
def new_head(M, J, seg=(56, 36), style=None):
    """A NEW head (Andrew: 'make new heads for them to ditch those weird shapes'): the old head skin (the '_face' group) goes,
    except the neck below the chin and the ears, and a fresh one goes in its place: a smooth rounded head the old one's size,
    the lower half easing in to a soft rounded chin, a small nose where the old one was. It carries the painted face (its
    face-sheet coordinates mapped from the old face by position, so the eyes, brows and blush land where they were), the skin
    colour, the old head's weights (nearest vertex) and an ink outline. The lips (the mouth piece, with its mouth shapes) are
    seated on the new surface."""
    P = M['pos'].reshape(-1, 3); N = M['nor'].reshape(-1, 3); UV = M['uv'].reshape(-1, 2); FUV = M['fuv'].reshape(-1, 2)
    SI = M['si'].reshape(-1, 4); SW = M['sw'].reshape(-1, 4); INK = M['ink'].reshape(-1, 3)
    T = M['groups']['_face'].reshape(-1, 3).astype(np.int64); fv = np.unique(T); Fp = P[fv]
    hj = J['head']; top, chin = hj['top'] - 0.012, hj['chin'] + 0.004
    xr = np.abs(Fp[:, 0]).max()
    ear = lambda q: (np.abs(q[:, 0]) > xr - 0.045) & (q[:, 1] > chin + 0.08) & (q[:, 1] < chin + 0.3)
    zb, zfr = Fp[:, 2].min(), np.percentile(Fp[(np.abs(Fp[:, 0]) < 0.06) & (Fp[:, 1] > chin + 0.15)][:, 2], 60)
    cy, ry = (top + chin) / 2, (top - chin) / 2
    cz, rz = (zb + zfr) / 2 + 0.004, (zfr - zb) / 2
    rx = xr - 0.03
    # the shape: a lat-long ellipsoid, the lower half drawn in to a chin
    nu, nv = seg; th = np.linspace(0, np.pi, nv); ph = np.linspace(-np.pi, np.pi, nu, endpoint=False)
    TH, PH = np.meshgrid(th, ph, indexing='ij'); TH, PH = TH.ravel(), PH.ravel()
    ux, uy, uz = np.sin(TH) * np.sin(PH), np.cos(TH), np.sin(TH) * np.cos(PH)
    st = dict(w=1.0, jaw=0.30, cheek=0.0, chin=0.06, drop=0.035); st.update(style or {})
    low = np.clip(-uy, 0, 1)
    sx = st['w'] * (1 - st['jaw'] * low ** 1.7 - 0.05 * np.clip(uy, 0, 1) ** 2 + st['cheek'] * np.exp(-((uy + 0.3) / 0.25) ** 2))
    sz = 1 - np.where(uz > 0, 0.10, 0.0) * low ** 2
    V = np.stack([ux * rx * sx, cy + uy * ry, cz + uz * rz * sz], 1)
    # the chin: a little point forward and down at the front of the jaw
    V[:, 2] += st['chin'] * 0.12 * np.clip(uz, 0, 1) ** 4 * np.exp(-((uy + 0.85) / 0.18) ** 2)
    V[:, 1] -= st['drop']   # (the head sits lower on the neck: the face, painted where it was, sits higher on the head)
    # a small nose where the old one was (the old face's most forward point near the middle, above the mouth)
    mv = np.unique(M['groups']['_mouth']); my1 = P[mv, 1].max()
    cand = (np.abs(Fp[:, 0]) < 0.02) & (Fp[:, 1] > my1) & (Fp[:, 1] < my1 + 0.08)
    if cand.any():
        nz = Fp[cand][np.argmax(Fp[cand][:, 2])]
        g = np.exp(-((V[:, 0] - 0) ** 2 + (V[:, 1] - nz[1]) ** 2) / (2 * 0.016 ** 2)) * (V[:, 2] > cz)
        V[:, 2] += 0.012 * g
    F = []
    for j in range(nv - 1):
        for i in range(nu):
            a, b = j * nu + i, j * nu + (i + 1) % nu; c, d = a + nu, b + nu
            F += [(a, c, d), (a, d, b)]
    F = np.array(F, np.int64)
    Nn = _vnormals(V, F)
    if (Nn[:, 1][:nu] < 0).mean() > 0.5: F = F[:, [0, 2, 1]]; Nn = _vnormals(V, F)   # (outward)
    # what goes: the old head skin above the chin line, but not the ears
    c = P[T].mean(1)
    gone = (c[:, 1] > chin + 0.01) & ~ear(c)
    keepT = T[~gone]
    # the painted face: its sheet coordinates follow position (affine in x, y over the old face's front)
    front = fv[(N[fv, 2] > 0.35) & (FUV[fv, 0] > 0.0005)]
    A = np.stack([np.ones(len(front)), P[front, 0], P[front, 1]], 1); fa, *_ = np.linalg.lstsq(A, FUV[front], rcond=None)
    nf = (np.stack([np.ones(len(V)), V[:, 0], V[:, 1]], 1) @ fa).astype(np.float32)
    nf[Nn[:, 2] < 0.05] = 0
    # weights, colour: from the nearest old head vertex
    near = fv[np.argmin(((V[:, None, :] - Fp[None, :, :]) ** 2).sum(2), 1)]
    inkw = float(np.median(np.linalg.norm(INK[fv].astype(np.float64) / 100000, axis=1)))
    # the lips onto the new surface: the mouth piece's front sits on it, its relief kept
    mz = P[mv, 2].max(); mxy = P[mv].mean(0)
    surf = V[np.argmin((V[:, 0] - mxy[0]) ** 2 + (V[:, 1] - mxy[1]) ** 2 + (V[:, 2] < cz) * 9)]
    dz = surf[2] + 0.006 - mz
    P2 = P.copy(); P2[mv, 2] += dz
    n0 = M['verts']
    M['pos'] = np.concatenate([P2.ravel(), V.ravel()]).astype(np.float32)
    M['nor'] = np.concatenate([M['nor'], Nn.ravel()]).astype(np.float32)
    M['uv'] = np.concatenate([M['uv'], UV[near].ravel()]).astype(np.float32)
    M['fuv'] = np.concatenate([M['fuv'], nf.ravel()]).astype(np.float32)
    M['si'] = np.concatenate([M['si'], SI[near].ravel()]); M['sw'] = np.concatenate([M['sw'], SW[near].ravel()])
    M['ink'] = np.concatenate([M['ink'], np.round(Nn.ravel() * inkw * 100000).astype(np.int16)])
    dt = M['groups']['_face'].dtype
    M['groups']['_face'] = np.concatenate([keepT.ravel(), (F + n0).ravel()]).astype(dt)
    if '_face' in M['inkGroups']:
        it = M['inkGroups']['_face'].reshape(-1, 3).astype(np.int64); ic = P[it].mean(1)
        M['inkGroups']['_face'] = np.concatenate([it[~((ic[:, 1] > chin + 0.01) & ~ear(ic))].ravel(), (F + n0).ravel()]).astype(dt)
    M['verts'] = n0 + len(V); M['tris'] = sum(len(g) for g in M['groups'].values()) // 3
    return int(gone.sum())
