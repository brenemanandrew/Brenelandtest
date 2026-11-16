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
    # (and what is left of its walls a little outside it: steep sideways triangles in front of the face's surface)
    wide = (np.abs((c[:, 0] - cx) / hx) < 1.35) & (np.abs((c[:, 1] - cy) / hy) < 1.3) & (np.abs(nn[:, 0]) > 0.6) & (c[:, 2] > zfit(np.clip((c[:, 0] - cx) / hx, -1, 1), np.clip((c[:, 1] - cy) / hy, -1, 1)) - 0.012)
    cut |= wide
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
    # (blended from the nearest face normals round the opening, inverse-distance, so the shading cannot step at the seam)
    rr = np.where(ring)[0]; d2 = ((np.stack([cx + U * hx, cy + Vv * hy], 1)[:, None, :] - P[rr][None, :, :2]) ** 2).sum(2)
    kk = np.argsort(d2, 1)[:, :10]; wgt = 1 / (np.take_along_axis(d2, kk, 1) + 1e-6)
    NX = (N[rr][kk] * wgt[:, :, None]).sum(1); NX = (NX / np.linalg.norm(NX, axis=1, keepdims=True)).astype(np.float32)
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
        P0 = P; az = np.array(wpos['foot_l'])[2]
        for grp in (M['groups'], M['inkGroups']):
            if '' in grp:
                t = grp[''].reshape(-1, 3).astype(np.int64); cc = P0[t].mean(1)
                # the back of the shoe: behind the arch (a line rising toward the toes) and above the sole
                back = shoe[t].all(1) & (cc[:, 1] > 0.002) & (cc[:, 2] < az + 0.05 - 0.6 * (cc[:, 1] - 0.002))
                grp[''] = t[~back].ravel().astype(grp[''].dtype)
        # a clean topline: the shoe's points left behind the cut slide forward onto it
        cutz = az + 0.05 - 0.6 * (P[:, 1] - 0.002)
        edge = shoe & (P[:, 1] > 0.002) & (P[:, 2] < cutz) & (np.abs(P[:, 0]) > 0.05)
        P[edge, 2] = cutz[edge]
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

def fill_hair_dip(M, J, hair_sw, k=1.0):
    """Belinda's hair: its two side pieces stood up at the top corners, above the crown between them (a dip between two horns).
    Fit the crown's dome (a quadratic over the tops of its columns, between the side pieces) and bring anything above it down onto it,
    so the top reads as one piece."""
    P = M['pos'].reshape(-1, 3).copy(); UV = M['uv'].reshape(-1, 2)
    px = (UV[:, 0] * 2048).astype(int); py = ((1 - UV[:, 1]) * 2048).astype(int)
    sw = np.where((px >= 1536) & (py >= 1536), (px - 1536) // 32 + ((py - 1536) // 32) * 16, -1)
    top = J['head']['top']; hv = np.where((sw == hair_sw) & (P[:, 1] > top - 0.22))[0]
    if len(hv) < 50: return 0
    H = P[hv]
    # the column tops on a 1.5 cm grid
    gx = np.round(H[:, 0] / 0.015).astype(int); gz = np.round(H[:, 2] / 0.015).astype(int)
    cols = {}
    for i, key in enumerate(zip(gx, gz)):
        if key not in cols or H[i, 1] > H[cols[key], 1]: cols[key] = i
    C = H[list(cols.values())]
    mid = np.abs(C[:, 0]) < 0.1                          # the crown (between the side pieces) sets the dome
    A = lambda X, Z: np.stack([np.ones_like(X), X, Z, X * X, X * Z, Z * Z], 1)
    cf, *_ = np.linalg.lstsq(A(C[mid, 0], C[mid, 2]), C[mid, 1], rcond=None)
    dome = A(H[:, 0], H[:, 2]) @ cf
    over = np.clip(H[:, 1] - dome, 0, 0.1)               # the side pieces' tops standing above it come down onto it
    lift = -over * k
    P[hv, 1] += lift
    M['pos'] = P.ravel().astype(np.float32)
    return int((lift < -0.002).sum())

def _band(pts, center, axis, width, closed, outward=0.0022, bins=28, keep=None):
    """a thin strap round a slice of the foot: the slice's points (pts) round `center` in the plane across `axis`, pushed out a
    little; `keep(angle)` limits it to part of the way round (the toe strap: over the top only)"""
    axis = axis / np.linalg.norm(axis); u = np.cross(axis, [0, 0, 1.0] if abs(axis[2]) < 0.9 else [1.0, 0, 0]); u /= np.linalg.norm(u); v = np.cross(axis, u)
    d = pts - center; a = np.arctan2(d @ v, d @ u); r = np.sqrt((d @ u) ** 2 + (d @ v) ** 2)
    edges = np.linspace(-np.pi, np.pi, bins + 1); R = np.full(bins, np.nan)
    for i in range(bins):
        m = (a >= edges[i]) & (a < edges[i + 1])
        if m.any(): R[i] = r[m].max()
    ok = ~np.isnan(R)
    if ok.sum() < 4: return None
    R = np.interp(np.arange(bins), np.arange(bins)[ok], R[ok], period=bins) + outward
    ang = (edges[:-1] + edges[1:]) / 2
    sel = np.arange(bins) if keep is None else np.array([i for i in range(bins) if keep(ang[i])])
    if len(sel) < 3: return None
    ring = np.array([center + u * np.cos(ang[i]) * R[i] + v * np.sin(ang[i]) * R[i] for i in sel])
    V = np.vstack([ring - axis * width / 2, ring + axis * width / 2]); n = len(sel); F = []
    for i in range(n if closed else n - 1):
        j = (i + 1) % n; F += [(i, j, n + j), (i, n + j, n + i)]
    N = np.vstack([ring - center, ring - center]); N /= np.linalg.norm(N, axis=1, keepdims=True)
    return V, np.array(F), N

def sandals(M, J, black_uv, shoe_sw, skin_sw, theta=0.45):
    """Belinda's evening shoes taken a step past Zoe's heels (Andrew): open stiletto sandals. Her shoes go (her own feet are modelled
    under them), and each foot gets a thin sole, a strap over the toes and one round the ankle; then the feet tip into the heel's
    pose with a stiletto (heels()). Returns the new floor."""
    P = M['pos'].reshape(-1, 3); UV = M['uv'].reshape(-1, 2)
    px = (UV[:, 0] * 2048).astype(int); py = ((1 - UV[:, 1]) * 2048).astype(int)
    sw = np.where((px >= 1536) & (py >= 1536), (px - 1536) // 32 + ((py - 1536) // 32) * 16, -1)
    shoe = sw == shoe_sw; skin = sw == skin_sw
    for grp in (M['groups'], M['inkGroups']):   # the old shoes go
        for g in list(grp.keys()):
            t = grp[g].reshape(-1, 3).astype(np.int64)
            if len(t): grp[g] = t[~shoe[t].any(1)].ravel().astype(grp[g].dtype)
    wp = bone_world(J); n0 = M['verts']; SI = M['si'].reshape(-1, 4); SW = M['sw'].reshape(-1, 4)
    addV, addN, addF, addW = [], [], [], []; base = n0
    for side in ('l', 'r'):
        ank, ball = np.array(wp['foot_' + side]), np.array(wp['ball_' + side])
        foot = np.where(skin & (np.abs(P[:, 0] - ank[0]) < 0.09) & (P[:, 1] < 0.13) & (P[:, 2] > ank[2] - 0.1))[0]
        F_ = P[foot]
        if len(F_) < 10: continue
        parts = []
        # the sole: slices along the foot, its underside, 5 mm thick, a little wider than the foot
        low = F_[F_[:, 1] < 0.03]; z0 = (low if len(low) else F_)[:, 2].min() - 0.004; z1 = F_[:, 2].max() + 0.004; zs = np.linspace(z0, z1, 16)
        top, bot = [], []
        for zz in zs:
            d = np.abs(F_[:, 2] - zz); m = d < (z1 - z0) / 20 + 0.004
            if m.sum() < 2: m = d <= np.sort(d)[min(3, len(d) - 1)]
            xs = F_[m, 0]; yb = F_[m, 1].min()
            wpad = 0.004 * np.sin(np.pi * (zz - z0) / (z1 - z0)) ** 0.3
            top += [(xs.min() - wpad, yb + 0.0006, zz), (xs.max() + wpad, yb + 0.0006, zz)]; bot += [(xs.min() - wpad, yb - 0.0045, zz), (xs.max() + wpad, yb - 0.0045, zz)]
        T_, B_ = np.array(top), np.array(bot); V = np.vstack([T_, B_]); k = len(zs); F = []
        for i in range(k - 1):
            a, b, c, d = 2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2
            F += [(a, c, b), (a, d, c)]                                                    # top (facing up)
            F += [(2 * k + a, 2 * k + b, 2 * k + c), (2 * k + a, 2 * k + c, 2 * k + d)]    # bottom
            F += [(a, 2 * k + a, 2 * k + d), (a, 2 * k + d, d), (b, c, 2 * k + c), (b, 2 * k + c, 2 * k + b)]   # the edges
        N = np.vstack([np.tile([0, 1.0, 0], (k * 2, 1)), np.tile([0, -1.0, 0], (k * 2, 1))])
        parts.append((V, np.array(F), N))
        # the toe strap: over the top of the forefoot, just behind the toes
        zt = ball[2] + 0.028; m = np.abs(F_[:, 2] - zt) < 0.006
        if m.sum() > 4:
            c = F_[m].mean(0); c[1] = F_[m, 1].min() + 0.004
            b_ = _band(F_[m], c, np.array([0, 0, 1.0]), 0.012, False, keep=lambda a: np.sin(a) > -0.05)
            if b_: parts.append(b_)
        # the ankle strap: round the ankle
        ya = ank[1] - 0.01; m = (np.abs(F_[:, 1] - ya) < 0.006)
        if m.sum() > 4:
            b_ = _band(F_[m], F_[m].mean(0), np.array([0, 1.0, 0]), 0.008, True)
            if b_: parts.append(b_)
        for V, F, N in parts:
            near = foot[np.argmin(((V[:, None, :] - F_[None, :, :]) ** 2).sum(2), 1)]
            addV.append(V); addN.append(N); addF.append(F + base); addW.append(near); base += len(V)
    V = np.vstack(addV).astype(np.float32); near = np.concatenate(addW)
    M['pos'] = np.concatenate([M['pos'], V.ravel()]).astype(np.float32)
    M['nor'] = np.concatenate([M['nor'], np.vstack(addN).ravel()]).astype(np.float32)
    M['uv'] = np.concatenate([M['uv'], np.tile(black_uv, (len(V), 1)).ravel()]).astype(np.float32)
    M['fuv'] = np.concatenate([M['fuv'], np.zeros(len(V) * 2, np.float32)])
    M['si'] = np.concatenate([M['si'], SI[near].ravel()]); M['sw'] = np.concatenate([M['sw'], SW[near].ravel()])
    M['ink'] = np.concatenate([M['ink'], np.round(np.vstack(addN).ravel() * 0.003 * 100000).astype(np.int16)])
    F = np.vstack(addF).ravel().astype(M['groups'][''].dtype)
    M['groups'][''] = np.concatenate([M['groups'][''], F]); M['inkGroups'][''] = np.concatenate([M['inkGroups'].get('', np.zeros(0, F.dtype)), F])
    M['verts'] = n0 + len(V); M['tris'] = sum(len(g) for g in M['groups'].values()) // 3
    return heels(M, J, wp, black_uv, theta=theta)

def fold_collar(M, blouse_sw, y0=0.965, zc=0.135, hinge_y=1.04):
    """Mina's collar stood out forward off her chest (its wings reached toward her face). Fold the wings down onto the chest about
    the neckline: each point in front of the chest turns down about the hinge (its distance out becomes distance down), lying a
    little proud of the blouse."""
    P = M['pos'].reshape(-1, 3).copy(); N = M['nor'].reshape(-1, 3).copy(); INK = M['ink'].reshape(-1, 3).astype(np.float64)
    UV = M['uv'].reshape(-1, 2); px = (UV[:, 0] * 2048).astype(int); py = ((1 - UV[:, 1]) * 2048).astype(int)
    sw = np.where((px >= 1536) & (py >= 1536), (px - 1536) // 32 + ((py - 1536) // 32) * 16, -1)
    sel = np.where((sw == blouse_sw) & (P[:, 1] > y0) & (P[:, 2] > zc))[0]
    if not len(sel): return 0
    out = P[sel, 2] - zc; up = P[sel, 1] - hinge_y
    k = np.clip(out / 0.03, 0, 1)                         # (a soft hinge: the root of the wing bends less)
    ny = hinge_y - out * 0.95 + up * (1 - k) * 0.5
    nz = zc + 0.012 + out * 0.12 + up * 0.3 * k
    P[sel, 1] = P[sel, 1] * (1 - k) + ny * k; P[sel, 2] = P[sel, 2] * (1 - k) + nz * k
    # normals and the ink outline turn with it (forward -> down becomes out of the chest)
    for arr in (N, INK):
        y_, z_ = arr[sel, 1].copy(), arr[sel, 2].copy()
        arr[sel, 1] = y_ * (1 - k) + (-z_) * k * 0.3 + y_ * k * 0.0
        arr[sel, 2] = z_ * (1 - k) + (np.abs(y_) + np.abs(z_)) * k
    N[sel] /= np.maximum(np.linalg.norm(N[sel], axis=1, keepdims=True), 1e-9)
    M['pos'] = P.ravel().astype(np.float32); M['nor'] = N.ravel().astype(np.float32); M['ink'] = np.round(INK).ravel().astype(np.int16)
    return int(len(sel))

def remove_collar(M, blouse_sw, y0=0.965, zc=0.135):
    """Mina's collar flap (Andrew's markup: the band from her neck across her chest) goes: the blouse's triangles that stand out in
    front of her chest above the neckline line. The blouse under it stays."""
    P = M['pos'].reshape(-1, 3); UV = M['uv'].reshape(-1, 2); px = (UV[:, 0] * 2048).astype(int); py = ((1 - UV[:, 1]) * 2048).astype(int)
    sw = np.where((px >= 1536) & (py >= 1536), (px - 1536) // 32 + ((py - 1536) // 32) * 16, -1)
    flap = (sw == blouse_sw) & (P[:, 1] > y0) & (P[:, 2] > zc)
    n = 0
    for grp in (M['groups'], M['inkGroups']):
        for g in list(grp.keys()):
            t = grp[g].reshape(-1, 3).astype(np.int64)
            if len(t): k = flap[t].sum(1) >= 2; n += int(k.sum()); grp[g] = t[~k].ravel().astype(grp[g].dtype)
    return n

def belinda_neckline(M, dress_sw, skin_sw, band0=0.955, drop=0.6, sx=0.135):
    """Belinda's dress (Andrew's markup): the neckline a little lower, and the straps on her shoulders instead of up at her neck.
    The dress's top band is drawn down toward its lower edge; each strap is moved out to the shoulder as it rises and laid on
    the skin there."""
    P = M['pos'].reshape(-1, 3).copy(); UV = M['uv'].reshape(-1, 2); px = (UV[:, 0] * 2048).astype(int); py = ((1 - UV[:, 1]) * 2048).astype(int)
    sw = np.where((px >= 1536) & (py >= 1536), (px - 1536) // 32 + ((py - 1536) // 32) * 16, -1)
    dress = sw == dress_sw; skin = np.where(sw == skin_sw)[0]
    top = P[dress & (P[:, 1] < 1.03), 1].max()
    band = np.where(dress & (P[:, 1] > band0) & (P[:, 1] <= top + 0.004))[0]
    P[band, 1] = band0 + (P[band, 1] - band0) * (1 - drop)          # the top edge comes down
    newtop = band0 + (top - band0) * (1 - drop); dy = top - newtop
    # the old straps go (they ran up beside her neck); new ones rise from the dress's top edge, over the top of each shoulder
    # (following her skin, a few mm proud), and down to the dress at the back
    oldst = dress & (P[:, 1] > top + 0.004)
    for grp in (M['groups'], M['inkGroups']):
        for g in list(grp.keys()):
            t_ = grp[g].reshape(-1, 3).astype(np.int64)
            if len(t_): grp[g] = t_[~oldst[t_].any(1)].ravel().astype(grp[g].dtype)
    S = P[skin]; SI = M['si'].reshape(-1, 4); SW = M['sw'].reshape(-1, 4)
    addV, addN, addF, near = [], [], [], []; n0 = M['verts']; base = n0; W = 0.011
    for sg in (-1, 1):
        X = sg * sx; m = (np.abs(S[:, 0] - X) < 0.012) & (S[:, 1] > newtop - 0.03)
        if m.sum() < 8: continue
        Q = S[m]; cz, cy = Q[:, 2].mean(), newtop - 0.03
        ang = np.linspace(0.05, np.pi - 0.05, 26)   # from the front (+z) over the top to the back
        pts = []
        for a in ang:
            d = np.array([np.cos(a), np.sin(a)]); rel = np.stack([Q[:, 2] - cz, Q[:, 1] - cy], 1); r = rel @ d
            ok = np.abs(rel @ np.array([-d[1], d[0]])) < 0.012
            rr = r[ok].max() if ok.any() else None
            if rr is not None: pts.append((cz + d[0] * (rr + 0.004), cy + d[1] * (rr + 0.004)))
        pts = np.array(pts); pts = pts[pts[:, 1] >= newtop - 0.012]
        if len(pts) < 4: continue
        V = np.vstack([np.stack([np.full(len(pts), X - W / 2), pts[:, 1], pts[:, 0]], 1), np.stack([np.full(len(pts), X + W / 2), pts[:, 1], pts[:, 0]], 1)])
        k = len(pts); F = []
        for q in range(k - 1): F += [(q, q + 1, k + q + 1), (q, k + q + 1, k + q)]
        nrm = np.stack([np.zeros(k), pts[:, 1] - cy, pts[:, 0] - cz], 1); nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
        addV.append(V); addN.append(np.vstack([nrm, nrm])); F = np.array(F)
        # (both sides of the thin strap)
        addF.append(np.vstack([F, F[:, [0, 2, 1]]]) + base)
        near.append(skin[np.argmin(((V[:, None, :] - S[None, :, :]) ** 2).sum(2), 1)]); base += len(V)
    if addV:
        V = np.vstack(addV).astype(np.float32); nr = np.concatenate(near); duv = UV[np.where(dress)[0][0]]
        M['pos'] = np.concatenate([P.ravel(), V.ravel()]).astype(np.float32)
        M['nor'] = np.concatenate([M['nor'], np.vstack(addN).ravel()]).astype(np.float32)
        M['uv'] = np.concatenate([M['uv'], np.tile(duv, (len(V), 1)).ravel()]).astype(np.float32)
        M['fuv'] = np.concatenate([M['fuv'], np.zeros(len(V) * 2, np.float32)])
        M['si'] = np.concatenate([M['si'], SI[nr].ravel()]); M['sw'] = np.concatenate([M['sw'], SW[nr].ravel()])
        M['ink'] = np.concatenate([M['ink'], np.round(np.vstack(addN).ravel() * 0.003 * 100000).astype(np.int16)])
        Fa = np.vstack(addF).ravel().astype(M['groups'][''].dtype)
        M['groups'][''] = np.concatenate([M['groups'][''], Fa]); M['inkGroups'][''] = np.concatenate([M['inkGroups'].get('', np.zeros(0, Fa.dtype)), Fa])
        M['verts'] = n0 + len(V); M['tris'] = sum(len(g) for g in M['groups'].values()) // 3
        return len(band), len(V)
    M['pos'] = P.ravel().astype(np.float32)
    return len(band), 0

def remove_face_shell(M):
    """The 'box chin' (Andrew, seen in profile in the editor): a thin extra shell of face triangles standing in front of the real face
    round the mouth and chin; the real face, with the lips, is right behind it. Cut the shell away: face triangles near the mouth that
    have more face (or the lips) behind them within a few cm, and the shell's side walls. The real face stays."""
    P = M['pos'].reshape(-1, 3)
    if '_mouth' not in M['groups'] or '_face' not in M['groups']: return 0
    mv = np.unique(M['groups']['_mouth']); mc = P[mv].mean(0)
    T = M['groups']['_face'].reshape(-1, 3).astype(np.int64); A, B, C = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    c = (A + B + C) / 3; nn = np.cross(B - A, C - A); nn /= np.maximum(np.linalg.norm(nn, axis=1), 1e-12)[:, None]
    near = (np.abs(c[:, 0] - mc[0]) < 0.11) & (c[:, 1] > mc[1] - 0.12) & (c[:, 1] < mc[1] + 0.07) & (c[:, 2] > mc[2] - 0.08)
    idx = np.where(near)[0]
    behind_pts = np.vstack([c[near], P[mv]])
    shell = np.zeros(len(T), bool)
    for i in idx:
        d = behind_pts[:, :2] - c[i, :2]; dz = c[i, 2] - behind_pts[:, 2]
        if ((d[:, 0] ** 2 + d[:, 1] ** 2 < 0.007 ** 2) & (dz > 0.004) & (dz < 0.05)).any(): shell[i] = True
    walls = near & (np.abs(nn[:, 0]) > 0.6) & (c[:, 2] > mc[2] - 0.02)
    cut = shell | walls
    M['_cuttri'] = np.stack([A[cut], B[cut], C[cut]], 1)   # (for fill_face_hole: exactly where the face was cut)
    M['groups']['_face'] = T[~cut].ravel().astype(M['groups']['_face'].dtype)
    if '_face' in M.get('inkGroups', {}):
        it = M['inkGroups']['_face'].reshape(-1, 3).astype(np.int64); ic = P[it].mean(1)
        cutc = c[cut]; keep = np.ones(len(it), bool)
        for j in range(len(it)):
            if ((cutc - ic[j]) ** 2).sum(1).min() < 0.009 ** 2: keep[j] = False
        M['inkGroups']['_face'] = it[keep].ravel().astype(M['inkGroups']['_face'].dtype)
    M['tris'] = sum(len(g) for g in M['groups'].values()) // 3
    return int(cut.sum())

def _pip(x, y, poly):
    """points (x, y arrays) inside a polygon (ray casting)"""
    inside = np.zeros(len(x), bool); n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        c = ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1)
        inside ^= c
    return inside

def fill_face_hole(M):
    """After remove_face_shell: the opening round the mouth filled smoothly. The hole's rim is found (the face's open edges by the
    mouth), the face round it fitted with a smooth surface (a cubic in x, y), and a fine patch laid on that surface over the hole and
    a few mm past its rim (just behind the face there, so no seam), with the face's own colour, painted-face coordinates, weights
    and the face's smooth normals blended from round the rim. The lips stay in front of it."""
    P = M['pos'].reshape(-1, 3); N = M['nor'].reshape(-1, 3)
    if '_mouth' not in M['groups']: return 0
    mv = np.unique(M['groups']['_mouth']); mc = P[mv].mean(0)
    T = M['groups']['_face'].reshape(-1, 3).astype(np.int64)
    from collections import Counter
    CT = M.get('_cuttri')
    if CT is None or not len(CT): return 0
    # the rim: the remaining face's open edges near the mouth; the ring: face points within 2.5 cm of the rim
    E = Counter()
    for a, b, c in T:
        for e in ((a, b), (b, c), (c, a)): E[(min(e), max(e))] += 1
    lo, hi = CT.reshape(-1, 3).min(0) - 0.01, CT.reshape(-1, 3).max(0) + 0.01
    bv = np.unique([v for e, k in E.items() if k == 1 for v in e if (P[v] > lo).all() and (P[v] < hi).all()])
    if len(bv) < 6: return 0
    fv = np.setdiff1d(np.unique(T), mv)
    d_r = np.sqrt(((P[fv][:, None, :2] - P[bv][None, :, :2]) ** 2).sum(2)).min(1)
    ring = fv[(d_r < 0.025) & (N[fv, 2] > 0.1)]
    if len(ring) < 15: return 0
    # the patch: a 2.5 mm grid over what was cut and 5 mm past it
    xs = np.arange(lo[0], hi[0], 0.0025); ys = np.arange(lo[1], hi[1], 0.0025)
    GX, GY = np.meshgrid(xs, ys); gx, gy = GX.ravel(), GY.ravel(); nx_, ny_ = len(xs), len(ys)
    keep = np.zeros(len(gx), bool)
    for tri in CT:   # inside a cut triangle (x, y)
        a2, b2, c2 = tri[0, :2], tri[1, :2], tri[2, :2]; v0, v1 = b2 - a2, c2 - a2; den = v0[0] * v1[1] - v1[0] * v0[1]
        if abs(den) < 1e-12: continue
        m = (gx > min(a2[0], b2[0], c2[0]) - 0.005) & (gx < max(a2[0], b2[0], c2[0]) + 0.005) & (gy > min(a2[1], b2[1], c2[1]) - 0.005) & (gy < max(a2[1], b2[1], c2[1]) + 0.005)
        if not m.any(): continue
        wx, wy = gx[m] - a2[0], gy[m] - a2[1]; u = (wx * v1[1] - v1[0] * wy) / den; v = (v0[0] * wy - wx * v0[1]) / den
        keep[np.where(m)[0][(u > -0.45) & (v > -0.45) & (u + v < 1.45)]] = True   # (a little past each: the patch tucks under the rim)
    # heights: blended from the ring (inverse distance), so the patch meets the face at the rim and stays smooth across
    Rr = P[ring]; d2 = (gx[:, None] - Rr[None, :, 0]) ** 2 + (gy[:, None] - Rr[None, :, 1]) ** 2
    kk = np.argsort(d2, 1)[:, :16]; w = 1 / (np.take_along_axis(d2, kk, 1) ** 1.5 + 1e-9)
    gz = (Rr[kk][:, :, 2] * w).sum(1) / w.sum(1) - 0.0006
    Vp = np.stack([gx, gy, gz], 1).astype(np.float32)
    # normals, colour, paint coordinates, weights: from the face round the rim
    d2 = ((Vp[:, None, :2] - P[ring][None, :, :2]) ** 2).sum(2); kk = np.argsort(d2, 1)[:, :24]; w = 1 / (np.sqrt(np.take_along_axis(d2, kk, 1)) + 1e-4)
    Np = (N[ring][kk] * w[:, :, None]).sum(1); Np /= np.linalg.norm(Np, axis=1, keepdims=True)
    FUV = M['fuv'].reshape(-1, 2); fa, *_ = np.linalg.lstsq(np.stack([np.ones(len(ring)), P[ring, 0], P[ring, 1]], 1), FUV[ring], rcond=None)
    Fp = (np.stack([np.ones(len(Vp)), Vp[:, 0], Vp[:, 1]], 1) @ fa).astype(np.float32)
    nearest = ring[kk[:, 0]]
    Fq = []
    for j in range(ny_ - 1):
        for i in range(nx_ - 1):
            a, b, c, d = j * nx_ + i, j * nx_ + i + 1, (j + 1) * nx_ + i + 1, (j + 1) * nx_ + i
            if keep[a] and keep[b] and keep[c] and keep[d]: Fq += [(a, b, c), (a, c, d)]
    if not Fq: return 0
    Fq = np.array(Fq)
    A_, B_, C_ = Vp[Fq[:, 0]], Vp[Fq[:, 1]], Vp[Fq[:, 2]]
    if np.cross(B_ - A_, C_ - A_)[:, 2].mean() < 0: Fq = Fq[:, [0, 2, 1]]
    used = np.unique(Fq); remap = -np.ones(len(Vp), int); remap[used] = np.arange(len(used)); Fq = remap[Fq]
    Vp, Np, Fp, nearest = Vp[used], Np[used], Fp[used], nearest[used]
    n0 = M['verts']
    M['pos'] = np.concatenate([M['pos'], Vp.ravel()]).astype(np.float32); M['nor'] = np.concatenate([M['nor'], Np.ravel()]).astype(np.float32)
    M['uv'] = np.concatenate([M['uv'], M['uv'].reshape(-1, 2)[nearest].ravel()]).astype(np.float32)
    M['fuv'] = np.concatenate([M['fuv'], Fp.ravel()]).astype(np.float32)
    M['si'] = np.concatenate([M['si'], M['si'].reshape(-1, 4)[nearest].ravel()]); M['sw'] = np.concatenate([M['sw'], M['sw'].reshape(-1, 4)[nearest].ravel()])
    M['ink'] = np.concatenate([M['ink'], np.zeros(len(Vp) * 3, np.int16)])
    tot = n0 + len(Vp); dt = np.uint16 if tot < 65536 else np.uint32
    M['groups']['_face'] = np.concatenate([M['groups']['_face'], (Fq + n0).ravel()]).astype(dt)
    for g in M['groups']: M['groups'][g] = M['groups'][g].astype(dt)
    for g in M['inkGroups']: M['inkGroups'][g] = M['inkGroups'][g].astype(dt)
    M['verts'] = tot; M['tris'] = sum(len(g) for g in M['groups'].values()) // 3
    return len(Fq)

def keep_lips_only(M, J):
    """The mouth piece without its inside (the dark lining, the teeth, the tongue): only the lips stay, on the smooth filled face."""
    UV = M['uv'].reshape(-1, 2); px = (UV[:, 0] * 2048).astype(int); py = ((1 - UV[:, 1]) * 2048).astype(int)
    sw = np.where((px >= 1536) & (py >= 1536), (px - 1536) // 32 + ((py - 1536) // 32) * 16, -1)
    lip = int({v: k for k, v in J['palette'].items()}.get(J['palette']['0'], 0)) if '0' in J['palette'] else 0   # (palette 0: the lips)
    t = M['groups']['_mouth'].reshape(-1, 3).astype(np.int64)
    keep = (sw[t] == lip).all(1)
    M['groups']['_mouth'] = t[keep].ravel().astype(M['groups']['_mouth'].dtype)
    if '_mouth' in M['inkGroups']:
        it = M['inkGroups']['_mouth'].reshape(-1, 3).astype(np.int64); M['inkGroups']['_mouth'] = it[(sw[it] == lip).all(1)].ravel().astype(M['inkGroups']['_mouth'].dtype)
    M['tris'] = sum(len(g) for g in M['groups'].values()) // 3
    return int((~keep).sum())

def remove_box_island(M):
    """The 'box chin' is its own small island of face triangles (about 148, loose from the face) standing over the mouth, the real
    face and mouth complete behind it. Delete that island: every '_face' component but the big one."""
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    P = M['pos'].reshape(-1, 3); T = M['groups']['_face'].reshape(-1, 3).astype(np.int64)
    _, wid = np.unique(np.round(P * 20000).astype(np.int64), axis=0, return_inverse=True); wid = wid.ravel()
    Tw = wid[T]; r = np.r_[Tw[:, 0], Tw[:, 1], Tw[:, 2]]; c = np.r_[Tw[:, 1], Tw[:, 2], Tw[:, 0]]
    _, lab = connected_components(coo_matrix((np.ones(len(r)), (r, c)), shape=(wid.max() + 1,) * 2), directed=False)
    tl = lab[Tw[:, 0]]; u, cnt = np.unique(tl, return_counts=True); big = u[np.argmax(cnt)]
    keep = tl == big
    gone_v = np.zeros(len(P), bool); gone_v[np.unique(T[~keep])] = True
    M['groups']['_face'] = T[keep].ravel().astype(M['groups']['_face'].dtype)
    if '_face' in M.get('inkGroups', {}):
        it = M['inkGroups']['_face'].reshape(-1, 3).astype(np.int64); M['inkGroups']['_face'] = it[~gone_v[it].all(1)].ravel().astype(M['inkGroups']['_face'].dtype)
    M['tris'] = sum(len(g) for g in M['groups'].values()) // 3
    return int((~keep).sum())

def rest_bust(M, J, sag=0.04, back=0.022):
    """Belinda's bust stood straight out. Let it rest: the fuller it stands off the chest the more it settles - down and a little in -
    toward a rounded teardrop, the upper slope easing in, the lower curve filling; the dress over it follows (all by position)."""
    P = M['pos'].reshape(-1, 3).copy(); W = bone_world(J); names = [b['name'] for b in J['bones']]
    si = M['si'].reshape(-1, 4); sw = M['sw'].reshape(-1, 4) / 255
    cb = [names.index(x) for x in ('spine_03', 'spine_02', 'clavicle_l', 'clavicle_r') if x in names]
    wC = sum((si == b) * sw for b in cb).sum(1); shY = W['clavicle_l'][1]
    done = 0
    for s in (-1, 1):
        m = (P[:, 0] * s > 0.03) & (P[:, 0] * s < 0.16) & (P[:, 1] < shY) & (P[:, 1] > shY - 0.3) & (wC > 0.3)
        if not m.any(): continue
        a = P[np.where(m)[0][np.argmax(P[m, 2])]].copy()
        dx, dy = P[:, 0] - a[0], P[:, 1] - a[1]
        g = np.exp(-dx ** 2 / (2 * 0.07 ** 2) - dy ** 2 / (2 * (np.where(dy > 0, 0.09, 0.07)) ** 2))
        t = np.clip((P[:, 2] - (a[2] - 0.09)) / 0.09, 0, 1)            # how far off the chest
        k = g * t ** 1.5 * (P[:, 2] > a[2] - 0.12)
        up = np.clip(dy / 0.06, 0, 1)
        P[:, 1] -= sag * k * (1 - 0.4 * up)
        P[:, 2] -= back * k * (0.6 + 0.8 * up)                          # (the upper slope eases in more than the lower curve)
        done += int((k > 0.05).sum())
    M['pos'] = P.ravel().astype(np.float32)
    return done

def _raycast(O, D, A, B, C):
    """first hit distance of rays O + t D (each) on triangles A, B, C (Moller-Trumbore); nan where none"""
    e1, e2 = B - A, C - A; out = np.full(len(O), np.nan)
    for i in range(len(O)):
        p = np.cross(D[i], e2); det = (e1 * p).sum(1); ok = np.abs(det) > 1e-12
        inv = np.where(ok, 1 / np.where(ok, det, 1), 0); s = O[i] - A; u = (s * p).sum(1) * inv
        q = np.cross(s, e1); v = (q * D[i]).sum(1) * inv; t = (q * e2).sum(1) * inv
        hit = ok & (u >= -1e-4) & (v >= -1e-4) & (u + v <= 1 + 1e-4) & (t > 0)
        if hit.any(): out[i] = t[hit].min()
    return out

def thong(M, J, skin_sw, black_uv, off=0.0022):
    """A standard black thong for Belinda (Andrew): a waistband round her hips, a front panel narrowing to the crotch, a thin strip
    underneath and a thin strap up the back, each laid on her skin (rays cast onto it) a couple of mm proud, weighted like the skin
    under it."""
    P = M['pos'].reshape(-1, 3); UV = M['uv'].reshape(-1, 2); px = (UV[:, 0] * 2048).astype(int); py = ((1 - UV[:, 1]) * 2048).astype(int)
    sw = np.where((px >= 1536) & (py >= 1536), (px - 1536) // 32 + ((py - 1536) // 32) * 16, -1)
    T = M['groups'][''].reshape(-1, 3).astype(np.int64); skin = sw == skin_sw
    c = P[T].mean(1); st = T[skin[T].all(1) & (c[:, 1] > 0.45) & (c[:, 1] < 0.72) & (np.abs(c[:, 0]) < 0.27)]
    A, B, C = P[st[:, 0]], P[st[:, 1]], P[st[:, 2]]
    sv = np.unique(st); SP = P[sv]
    yc = SP[np.abs(SP[:, 0]) < 0.02][:, 1].min() + 0.004          # the crotch
    yb, ybs = 0.622, 0.645                                         # waistband: front centre, sides
    cz = SP[np.abs(SP[:, 1] - 0.6) < 0.02][:, 2].mean()
    def hit(O, D):
        t = _raycast(O, D, A, B, C); return O + D * (t - off)[:, None], t
    parts = []
    nu = 7; U = np.linspace(-1, 1, nu)
    rows = []
    # back strap (top -> bottom), underside (back -> front), front panel (bottom -> top)
    for v in np.linspace(0, 1, 9):
        y = ybs - 0.008 + (yc - ybs + 0.008) * v; w = 0.006 + 0.004 * v
        O = np.stack([U * w, np.full(nu, y), np.full(nu, cz - 0.4)], 1); rows.append(hit(O, np.tile([0, 0, 1.0], (nu, 1))))
    for v in np.linspace(0.1, 0.9, 5):
        z = cz - 0.06 + 0.13 * v; w = 0.012 + 0.006 * v
        O = np.stack([U * w, np.full(nu, yc - 0.2), np.full(nu, z)], 1); rows.append(hit(O, np.tile([0, 1.0, 0], (nu, 1))))
    for v in np.linspace(0, 1, 10):
        y = yc + (yb - yc) * v; w = 0.016 + 0.08 * v ** 1.3
        O = np.stack([U * w, np.full(nu, y), np.full(nu, cz + 0.4)], 1); rows.append(hit(O, np.tile([0, 0, -1.0], (nu, 1))))
    R = np.array([r[0] for r in rows]); okr = np.array([~np.isnan(r[1]) for r in rows])
    V = R.reshape(-1, 3); F = []
    for j in range(len(rows) - 1):
        for i in range(nu - 1):
            a, b, c_, d = j * nu + i, j * nu + i + 1, (j + 1) * nu + i + 1, (j + 1) * nu + i
            if okr[j, i] and okr[j, i + 1] and okr[j + 1, i + 1] and okr[j + 1, i]: F += [(a, b, c_), (a, c_, d)]
    parts.append((V, np.array(F)))
    # the waistband: round the hips, its height rising from the front centre to the sides and back
    na = 120; ang = np.linspace(-np.pi, np.pi, na, endpoint=False); band = []
    for h in (-0.006, 0.006):
        yy = yb + (ybs - yb) * (1 - np.clip(np.cos(ang), 0, 1)) + h
        O = np.stack([np.zeros(na), yy, np.full(na, cz)], 1) + np.stack([np.sin(ang), np.zeros(na), np.cos(ang)], 1) * 0.4
        Dd = -np.stack([np.sin(ang), np.zeros(na), np.cos(ang)], 1); tb = _raycast(O, Dd, A, B, C); band.append((O + Dd * (tb - 0.0035)[:, None], tb))
    for k_ in range(2):   # (a ray that slipped between triangles: its point from its neighbours round the ring)
        Vb, tb = band[k_]; ok = ~np.isnan(tb)
        if ok.sum() > 3 and (~ok).any():
            idx_ = np.arange(na)
            for d in range(3): Vb[~ok, d] = np.interp(idx_[~ok], idx_[ok], Vb[ok, d], period=na)
            band[k_] = (Vb, np.zeros(na))
    V2 = np.vstack([band[0][0], band[1][0]]); ok2 = np.r_[~np.isnan(band[0][1]), ~np.isnan(band[1][1])]; F2 = []
    for i in range(na):
        j = (i + 1) % na; q = (i, j, na + j, na + i)
        if all(ok2[k] for k in q): F2 += [(i, j, na + j), (i, na + j, na + i)]
    parts.append((V2, np.array(F2)))
    SI = M['si'].reshape(-1, 4); SWt = M['sw'].reshape(-1, 4); n0 = M['verts']; base = n0
    addV, addF, addN, near = [], [], [], []
    for V, F in parts:
        if not len(F): continue
        V = np.nan_to_num(V)
        nr = sv[np.argmin(((V[:, None, :] - SP[None, :, :]) ** 2).sum(2), 1)]
        nn = V - np.array([0, V[:, 1].mean(), cz]); nn /= np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-9)
        addV.append(V); addN.append(nn); near.append(nr); addF.append(np.vstack([F, F[:, [0, 2, 1]]]) + base); base += len(V)
    V = np.vstack(addV).astype(np.float32); nr = np.concatenate(near); Nn = np.vstack(addN)
    M['pos'] = np.concatenate([M['pos'], V.ravel()]).astype(np.float32); M['nor'] = np.concatenate([M['nor'], Nn.ravel()]).astype(np.float32)
    M['uv'] = np.concatenate([M['uv'], np.tile(black_uv, (len(V), 1)).ravel()]).astype(np.float32); M['fuv'] = np.concatenate([M['fuv'], np.zeros(len(V) * 2, np.float32)])
    M['si'] = np.concatenate([M['si'], SI[nr].ravel()]); M['sw'] = np.concatenate([M['sw'], SWt[nr].ravel()])
    M['ink'] = np.concatenate([M['ink'], np.round(Nn.ravel() * 0.002 * 100000).astype(np.int16)])
    Fa = np.vstack(addF).ravel().astype(M['groups'][''].dtype)
    M['groups'][''] = np.concatenate([M['groups'][''], Fa]); M['inkGroups'][''] = np.concatenate([M['inkGroups'].get('', np.zeros(0, Fa.dtype)), Fa])
    M['verts'] = n0 + len(V); M['tris'] = sum(len(g) for g in M['groups'].values()) // 3
    return len(Fa) // 3

def rest_bust2(M, J, skin_sw, sag=0.05):
    """Belinda's bust at rest, take 2 (Andrew: it stuck straight out): her skin is reshaped - the fullest point settles lower and a
    little in, the upper slope runs longer and straighter from the chest to it, the lower curve fills - and everything over it (the
    dress) moves exactly as the skin under it does, so the dress follows the body."""
    P = M['pos'].reshape(-1, 3); UV = M['uv'].reshape(-1, 2); px = (UV[:, 0] * 2048).astype(int); py = ((1 - UV[:, 1]) * 2048).astype(int)
    sw = np.where((px >= 1536) & (py >= 1536), (px - 1536) // 32 + ((py - 1536) // 32) * 16, -1)
    W = bone_world(J); shY = W['clavicle_l'][1]; skin = np.where(sw == skin_sw)[0]
    Q = P.copy(); S = P[skin]
    for s in (-1, 1):
        m = (S[:, 0] * s > 0.04) & (S[:, 0] * s < 0.17) & (S[:, 1] < shY - 0.04) & (S[:, 1] > shY - 0.3)
        if not m.any(): continue
        a = S[np.where(m)[0][np.argmax(S[m, 2])]].copy()
        X = P[skin]; dx, dy = X[:, 0] - a[0], X[:, 1] - a[1]
        g = np.exp(-dx ** 2 / (2 * 0.065 ** 2) - dy ** 2 / (2 * np.where(dy > 0, 0.08, 0.06) ** 2))
        t = np.clip((X[:, 2] - (a[2] - 0.08)) / 0.08, 0, 1); k = g * t ** 1.4
        Y = X[:, 1] - sag * k; Z = X[:, 2] - 0.012 * k
        # the upper slope: a straight run from the chest (6 cm above the new fullest point) down and out to it
        ya, za = a[1] - sag * 0.85, a[2] - 0.012
        up = (Y > ya) & (Y < ya + 0.1) & (np.abs(dx) < 0.075) & (X[:, 2] > a[2] - 0.12)
        line = za - (Y - ya) * 0.5 - 0.035 * (dx / 0.075) ** 2
        Z = np.where(up, np.maximum(Z, line * np.clip(1 - (Y - ya) / 0.1, 0, 1) + Z * np.clip((Y - ya) / 0.1, 0, 1)), Z)
        Q[skin, 1] = np.where(k > 1e-3, Y, Q[skin, 1]); Q[skin, 2] = np.where((k > 1e-3) | up, Z, Q[skin, 2])
    # everything else near the chest follows the skin under it (nearest skin point's move)
    d = Q[skin] - P[skin]; moved = np.linalg.norm(d, axis=1) > 1e-5
    if moved.any():
        Sm = P[skin][moved]; dm = d[moved]
        others = np.setdiff1d(np.arange(len(P)), skin)
        near = others[(np.abs(P[others, 1] - (shY - 0.15)) < 0.2) & (np.abs(P[others, 0]) < 0.22) & (P[others, 2] > 0.05)]
        for i in near:
            dd = ((Sm - P[i]) ** 2).sum(1); j = np.argsort(dd)[:4]; w = 1 / (dd[j] + 1e-6)
            if dd[j[0]] < 0.035 ** 2: Q[i] = P[i] + (dm[j] * w[:, None]).sum(0) / w.sum()
        # and never under the skin: each such point at least 5 mm in front of the reshaped skin at its x, y
        QS = Q[skin]; fr = QS[:, 2] > 0.1
        for i in near:
            d2 = (QS[fr, 0] - Q[i, 0]) ** 2 + (QS[fr, 1] - Q[i, 1]) ** 2; j = np.argsort(d2)[:3]
            if d2[j[0]] < 0.012 ** 2: zs = QS[fr][j, 2].max(); Q[i, 2] = max(Q[i, 2], zs + 0.005)
    M['pos'] = Q.ravel().astype(np.float32)
    return int(moved.sum())

def shoulder_straps(M, J, dress_sw, skin_sw, X=0.15, width=0.011, off=0.003):
    """Belinda's straps (Andrew: firmly on her shoulders, not up by her neck): the old ones go; new ones rise from the dress's top
    edge at the front, over the top of each shoulder and down to the dress at the back, laid on her skin."""
    P = M['pos'].reshape(-1, 3); UV = M['uv'].reshape(-1, 2); px = (UV[:, 0] * 2048).astype(int); py = ((1 - UV[:, 1]) * 2048).astype(int)
    sw = np.where((px >= 1536) & (py >= 1536), (px - 1536) // 32 + ((py - 1536) // 32) * 16, -1)
    dress = sw == dress_sw; skin = sw == skin_sw
    top = P[dress & (P[:, 1] < 1.03), 1].max()
    old = dress & (P[:, 1] > top + 0.004)
    for grp in (M['groups'], M['inkGroups']):
        for g in list(grp.keys()):
            t_ = grp[g].reshape(-1, 3).astype(np.int64)
            if len(t_): grp[g] = t_[~old[t_].any(1)].ravel().astype(grp[g].dtype)
    T = M['groups'][''].reshape(-1, 3).astype(np.int64); c = P[T].mean(1)
    st = T[skin[T].all(1) & (c[:, 1] > top - 0.05) & (c[:, 1] < 1.14) & (np.abs(np.abs(c[:, 0]) - X) < 0.05)]
    A, B, C = P[st[:, 0]], P[st[:, 1]], P[st[:, 2]]; sv = np.unique(st); SP = P[sv]
    SI = M['si'].reshape(-1, 4); SWt = M['sw'].reshape(-1, 4); duv = UV[np.where(dress)[0][0]]
    addV, addF, addN, near = [], [], [], []; base = M['verts']
    for sg in (-1, 1):
        cz = SP[np.abs(SP[:, 0] - sg * X) < 0.015][:, 2].mean(); cy = top - 0.01
        ang = np.linspace(0.02, np.pi - 0.02, 40); rows = []
        for xo in (-width / 2, width / 2):
            Dd = np.stack([np.zeros(len(ang)), np.sin(ang), np.cos(ang)], 1); O = np.array([sg * X + xo, cy, cz]) + Dd * 0.4
            t = _raycast(O, -Dd, A, B, C); rows.append((O - Dd * (t - off)[:, None], t))
        ok = ~np.isnan(rows[0][1]) & ~np.isnan(rows[1][1])
        V = np.vstack([rows[0][0][ok], rows[1][0][ok]]); k = int(ok.sum())
        if k < 4: continue
        keep = V[:k, 1] >= top - 0.006; idx = np.where(keep)[0]
        F = []
        for a_, b_ in zip(idx[:-1], idx[1:]):
            if b_ == a_ + 1: F += [(a_, b_, k + b_), (a_, k + b_, k + a_)]
        F = np.array(F); nn = V - np.array([sg * X, cy, cz]); nn /= np.linalg.norm(nn, axis=1, keepdims=True)
        addV.append(V); addN.append(nn); addF.append(np.vstack([F, F[:, [0, 2, 1]]]) + base)
        near.append(sv[np.argmin(((V[:, None, :] - SP[None, :, :]) ** 2).sum(2), 1)]); base += len(V)
    if not addV: return 0
    V = np.vstack(addV).astype(np.float32); nr = np.concatenate(near); Nn = np.vstack(addN)
    M['pos'] = np.concatenate([M['pos'], V.ravel()]).astype(np.float32); M['nor'] = np.concatenate([M['nor'], Nn.ravel()]).astype(np.float32)
    M['uv'] = np.concatenate([M['uv'], np.tile(duv, (len(V), 1)).ravel()]).astype(np.float32); M['fuv'] = np.concatenate([M['fuv'], np.zeros(len(V) * 2, np.float32)])
    M['si'] = np.concatenate([M['si'], SI[nr].ravel()]); M['sw'] = np.concatenate([M['sw'], SWt[nr].ravel()])
    M['ink'] = np.concatenate([M['ink'], np.round(Nn.ravel() * 0.002 * 100000).astype(np.int16)])
    Fa = np.vstack(addF).ravel().astype(M['groups'][''].dtype)
    M['groups'][''] = np.concatenate([M['groups'][''], Fa]); M['inkGroups'][''] = np.concatenate([M['inkGroups'].get('', np.zeros(0, Fa.dtype)), Fa])
    M['verts'] = base; M['tris'] = sum(len(g) for g in M['groups'].values()) // 3
    return len(Fa) // 3

def _dominant(M):
    si = M['si'].reshape(-1, 4); sw = M['sw'].reshape(-1, 4); return si[np.arange(len(si)), np.argmax(sw, 1)]

def human_hands(M, J, along=0.8, thick=1.3):
    """Andrew: the girls' hands looked alien (long thin fingers). Each finger (by the bone it follows) is shortened toward its
    knuckle and filled out round its own axis; the thumb a little less. The palm stays."""
    P = M['pos'].reshape(-1, 3).copy(); W = bone_world(J); names = [b['name'] for b in J['bones']]; dom = _dominant(M)
    n = 0
    for side in ('l', 'r'):
        for f in ('index', 'middle', 'ring', 'pinky', 'thumb'):
            ch = [f'{f}_0{i}_{side}' for i in (1, 2, 3)]
            if not all(c in names for c in ch): continue
            K = np.array(W[ch[0]]); E = np.array(W[ch[2]]); ax = E - K; ln = np.linalg.norm(ax)
            if ln < 1e-4: continue
            ax /= ln; a_, t_ = (0.9, 1.2) if f == 'thumb' else (along, thick)
            sel = np.where(np.isin(dom, [names.index(c) for c in ch]))[0]
            d = P[sel] - K; al = d @ ax; rad = d - al[:, None] * ax
            P[sel] = K + (al * a_)[:, None] * ax + rad * t_; n += len(sel)
    M['pos'] = P.ravel().astype(np.float32); return n

def glutes(M, J, A=0.03, lift=0.012):
    """Shapely butts (Andrew): two rounded lobes pushed out behind the hips and lifted a touch; everything there moves (the skin and
    whatever she wears over it), so the clothes follow."""
    P = M['pos'].reshape(-1, 3).copy(); W = bone_world(J); pel = np.array(W['pelvis']); th = np.array(W['thigh_l'])
    yc = th[1] - 0.04; cz = pel[2]
    for s in (-1, 1):
        cx = s * abs(th[0]) * 0.72
        dx, dy = P[:, 0] - cx, P[:, 1] - yc
        g = np.exp(-dx ** 2 / (2 * 0.065 ** 2) - dy ** 2 / (2 * np.where(dy > 0, 0.075, 0.055) ** 2))
        back = np.clip((cz - P[:, 2]) / 0.06, 0, 1)
        k = g * back
        P[:, 2] -= A * k; P[:, 1] += lift * k * np.clip(-dy / 0.05 + 0.5, 0, 1)
    M['pos'] = P.ravel().astype(np.float32); return int((np.abs(P - M['pos'].reshape(-1, 3)) > -1).sum())

def join_cap(M, cap_sw):
    """The caps' brims were loose of the crowns (a gap at the join). The brim's back edge is drawn up to the crown's lower rim and
    tucked inside it."""
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    P = M['pos'].reshape(-1, 3).copy(); UV = M['uv'].reshape(-1, 2); px = (UV[:, 0] * 2048).astype(int); py = ((1 - UV[:, 1]) * 2048).astype(int)
    sw = np.where((px >= 1536) & (py >= 1536), (px - 1536) // 32 + ((py - 1536) // 32) * 16, -1)
    T = M['groups'][''].reshape(-1, 3).astype(np.int64); cap = T[(sw[T] == cap_sw).all(1)]
    if not len(cap): return 0
    _, wid = np.unique(np.round(P * 20000).astype(np.int64), axis=0, return_inverse=True); wid = wid.ravel()
    Tw = wid[cap]; r = np.r_[Tw[:, 0], Tw[:, 1], Tw[:, 2]]; c = np.r_[Tw[:, 1], Tw[:, 2], Tw[:, 0]]
    _, lab = connected_components(coo_matrix((np.ones(len(r)), (r, c)), shape=(wid.max() + 1,) * 2), directed=False); tl = lab[Tw[:, 0]]
    pieces = [np.unique(cap[tl == u]) for u in np.unique(tl)]
    ext = [np.ptp(P[p][:, 1]) for p in pieces]; crown = pieces[int(np.argmax(ext))]
    brims = [p for p in pieces if P[p][:, 2].max() > P[crown][:, 2].max() + 0.05]
    if not brims: return 0
    C = P[crown]; low = C[C[:, 1] < C[:, 1].min() + 0.02]
    n = 0
    for b in brims:
        B = P[b]; zb = B[:, 2].min(); edge = b[B[:, 2] < zb + 0.03]
        for i in edge:
            d = (low[:, 0] - P[i, 0]) ** 2; j = np.argmin(d + (low[:, 2] < 0) * 9)
            P[i, 1] = (P[i, 1] + low[j, 1]) / 2 + 0.004; P[i, 2] = min(P[i, 2], low[j, 2]) - 0.015; n += 1
    M['pos'] = P.ravel().astype(np.float32); return n

def tuck_blouse(M, blouse_sw, skirt_sw):
    """Mina's blouse broke up where it tucks into her skirt (the two fighting): the blouse below the skirt's top is drawn in 8 mm."""
    P = M['pos'].reshape(-1, 3).copy(); UV = M['uv'].reshape(-1, 2); px = (UV[:, 0] * 2048).astype(int); py = ((1 - UV[:, 1]) * 2048).astype(int)
    sw = np.where((px >= 1536) & (py >= 1536), (px - 1536) // 32 + ((py - 1536) // 32) * 16, -1)
    top = P[sw == skirt_sw, 1].max(); sel = np.where((sw == blouse_sw) & (P[:, 1] < top + 0.015))[0]
    cz = P[sw == skirt_sw][:, 2].mean()
    d = P[sel][:, [0, 2]] - [0, cz]; r = np.linalg.norm(d, axis=1, keepdims=True); k = np.maximum(0, r - 0.008) / np.maximum(r, 1e-6)
    P[sel, 0] = d[:, 0] * k[:, 0]; P[sel, 2] = cz + d[:, 1] * k[:, 0]
    M['pos'] = P.ravel().astype(np.float32); return len(sel)
