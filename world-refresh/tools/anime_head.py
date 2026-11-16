"""New anime-style heads for the strip mall's four (Andrew: unique simple anime cartoon heads, solid profiles with a nose and a mouth,
real eyes). Built as geometry, in the baked character's own coordinates (y up, +z forward), the old head's size so the hair and the
caps still sit right:
  head    a cranium with a flatter face, the jaw tapering to a defined chin, a small pointed nose with a bridge, cheeks, small ears
  eyes    whites (almond), an iris with a darker rim, the pupil, two highlights, a thick upper lash line with a wing, a lower lash
  brows, mouth (a curved line with a lip below), blush
Every feature is laid on the head's surface (its depth and normals taken from the head), so it reads in profile as well as front.
STYLE: one entry per character, from Andrew's art (mall-staff-sheet) and the game's own face settings (mall-staff.js PEOPLE)."""
import numpy as np

STYLE = {   # the look: Andrew's reference (the character builder's head: almond eyes with a black liner and wing, warm brown iris,
            # solid dark brows, a soft small nose, full muted lips, ears, a round face and soft chin); each one her own touches
    'zoe':     dict(iris='#6a3a1e', brow='#1e1618', lip='#b07468', jaw=0.30, cheek=0.035, chin=0.010, w=1.0,  tilt=0.10, lipk=1.0,  nose=0.011, browarch=0.010, browthick=0.011),
    'asha':    dict(iris='#5a6e3a', brow='#9a6a52', lip='#c07a78', jaw=0.44, cheek=0.045, chin=0.018, w=1.02, tilt=0.14, lipk=0.9,  nose=0.010, browarch=0.012, browthick=0.012),
    'belinda': dict(iris='#4a2814', brow='#181214', lip='#9a5a50', jaw=0.22, cheek=0.06,  chin=0.006, w=1.05, tilt=0.16, lipk=1.15, nose=0.012, browarch=0.016, browthick=0.012),
    'mina':    dict(iris='#3f3a44', brow='#241c20', lip='#c08a86', jaw=0.36, cheek=0.0,   chin=0.012, w=0.95, tilt=0.08, lipk=0.85, nose=0.010, browarch=0.008, browthick=0.009),
}

def _ellipse(cx, cy, rx, ry, n=28):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    P = np.stack([np.r_[cx, cx + rx * np.cos(t)], np.r_[cy, cy + ry * np.sin(t)]], 1)
    F = np.array([(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]); return P, F

def _poly(pts):
    """a filled convex-ish outline (fan from its centroid)"""
    c = pts.mean(0); P = np.vstack([c, pts]); n = len(pts)
    F = np.array([(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]); return P, F

def _strip(line, width):
    """a ribbon along a polyline, width per point (array)"""
    d = np.gradient(line, axis=0); d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
    nrm = np.stack([-d[:, 1], d[:, 0]], 1)
    A = line + nrm * width[:, None] / 2; B = line - nrm * width[:, None] / 2
    P = np.vstack([A, B]); n = len(line); F = []
    for i in range(n - 1): F += [(i, n + i, n + i + 1), (i, n + i + 1, i + 1)]
    return P, np.array(F)

def build(J, Pold_face, who):
    st = STYLE[who]; hj = J['head']; top, chin, eyeY = hj['top'] - 0.01, hj['chin'] + 0.006, hj['eye']
    xr = np.abs(Pold_face[:, 0]).max(); zb = Pold_face[:, 2].min()
    zfr = np.percentile(Pold_face[(np.abs(Pold_face[:, 0]) < 0.06) & (Pold_face[:, 1] > eyeY - 0.02) & (Pold_face[:, 1] < eyeY + 0.08)][:, 2], 50)
    rx = (xr - 0.03) * st['w']; cz = (zfr + zb) / 2; rz = (zfr - zb) / 2
    H = top - chin; eyeY = chin + 0.47 * H
    cyc = eyeY + 0.03                                   # the cranium's middle (above the eyes: a big anime forehead under the hair)
    ryu, ryl = top - cyc, cyc - chin
    nu, nv = 96, 64
    th = np.linspace(0, np.pi, nv); ph = np.linspace(-np.pi, np.pi, nu, endpoint=False)
    TH, PH = np.meshgrid(th, ph, indexing='ij'); TH, PH = TH.ravel(), PH.ravel()
    ux, uy, uz = np.sin(TH) * np.sin(PH), np.cos(TH), np.sin(TH) * np.cos(PH)
    low = np.clip(-uy, 0, 1)                            # 0 at the cranium's middle, 1 at the chin
    front = np.clip(uz, 0, 1)
    x = ux * rx * (1 - st['jaw'] * low ** 1.35 * (0.55 + 0.45 * front) + st['cheek'] * np.exp(-((low - 0.35) / 0.2) ** 2) * front)
    y = cyc + np.where(uy > 0, uy * ryu, uy * ryl)
    z = cz + uz * rz * (1 - 0.06 * front ** 3)          # (a slightly flatter face)
    # the lower head comes forward to a chin; the back of it rises toward the neck
    z += low ** 1.5 * front * 0.03 + st['chin'] * np.exp(-((low - 0.95) / 0.12) ** 2) * front ** 4
    back = np.clip(-uz, 0, 1); y += back * low ** 2 * 0.06
    V = np.stack([x, y, z], 1)
    F = []
    for j in range(nv - 1):
        for i in range(nu):
            a, b = j * nu + i, j * nu + (i + 1) % nu; c, d = a + nu, b + nu
            F += [(a, c, d), (a, d, b)]
    F = np.array(F)
    # nose: a small pointed tip with a bridge up to the eyes, the tip a little up-turned
    ny = chin + 0.30 * H; fr = V[:, 2] > cz
    tip = np.exp(-(V[:, 0] ** 2 / (2 * 0.0075 ** 2) + (V[:, 1] - ny) ** 2 / (2 * 0.010 ** 2)))
    bridge = np.exp(-V[:, 0] ** 2 / (2 * 0.006 ** 2)) * np.clip((V[:, 1] - ny) / (eyeY - 0.01 - ny), 0, 1) * np.clip((eyeY - 0.01 - V[:, 1]) / 0.02 + 1, 0, 1) * (V[:, 1] < eyeY - 0.005)
    V[:, 2] += fr * (st['nose'] * tip + 0.35 * st['nose'] * bridge * (1 - np.clip((V[:, 1] - ny) / (eyeY - ny), 0, 1)))
    # the mouth's little dip and the lower lip's roundness
    my = chin + 0.185 * H
    V[:, 2] -= fr * 0.0025 * np.exp(-(V[:, 0] ** 2 / (2 * 0.02 ** 2) + (V[:, 1] - my) ** 2 / (2 * 0.004 ** 2)))
    V[:, 2] += fr * 0.004 * np.exp(-(V[:, 0] ** 2 / (2 * 0.03 ** 2) + (V[:, 1] - my + 0.006) ** 2 / (2 * 0.008 ** 2)))
    V[:, 2] += fr * 0.003 * np.exp(-(V[:, 0] ** 2 / (2 * 0.03 ** 2) + (V[:, 1] - my - 0.007) ** 2 / (2 * 0.006 ** 2)))
    N = _vn(V, F)
    if (N[np.argmax(V[:, 1])][1]) < 0: F = F[:, [0, 2, 1]]; N = _vn(V, F)
    parts = [('head', V, F, N, 'skin')]
    # ears: small flattened ellipsoids at the sides, at the eyes' height
    for s in (-1, 1):
        e = _sph(0.022, 0.032, 0.012, 16, 10); e[:, 0] += s * (rx * (1 + st['cheek'] * 0.3) - 0.004); e[:, 1] += eyeY - 0.02; e[:, 2] += cz + 0.005
        ef = _sphF(16, 10); parts.append(('ear', e, ef, _vn(e, ef), 'skin'))
    # the surface lookup for the features: depth and normal at (x, y) on the face
    FV = V[fr]; FN = N[fr]
    def onface(xy, lift):
        d2 = ((xy[:, None, :] - FV[None, :, :2]) ** 2).sum(2); k = np.argsort(d2, 1)[:, :6]; w = 1 / (np.take_along_axis(d2, k, 1) + 1e-8)
        zz = (FV[k][:, :, 2] * w).sum(1) / w.sum(1); nn = (FN[k] * w[:, :, None]).sum(1); nn /= np.linalg.norm(nn, axis=1, keepdims=True)
        P3 = np.stack([xy[:, 0], xy[:, 1], zz], 1) + nn * lift; return P3, nn
    def put(name, P2, F2, lift, col):
        P3, nn = onface(P2, lift); parts.append((name, P3, F2, nn, col))
    ew, eh = 0.060 * st['w'], 0.021; ex = 0.112 * st['w']; ey = eyeY
    def clamp_in(pts, up, lo):
        """keep points inside the eye opening (between its upper and lower lid curves)"""
        out = pts.copy()
        for k in range(len(out)):
            x = out[k, 0]
            yu = np.interp(x, up[:, 0], up[:, 1]) if up[0, 0] < up[-1, 0] else np.interp(x, up[::-1, 0], up[::-1, 1])
            yl = np.interp(x, lo[:, 0], lo[:, 1]) if lo[0, 0] < lo[-1, 0] else np.interp(x, lo[::-1, 0], lo[::-1, 1])
            out[k, 1] = np.clip(out[k, 1], yl, yu)
            out[k, 0] = np.clip(x, min(up[:, 0].min(), lo[:, 0].min()), max(up[:, 0].max(), lo[:, 0].max()))
        return out
    for s_ in (-1, 1):
        cx = s_ * ex; tl = st['tilt'] * ew
        t = np.linspace(0, 1, 25); xs = cx + s_ * (t - 0.5) * 2 * ew          # inner corner (t 0) -> outer corner (t 1)
        lift = (t - 0.5) * tl * 2
        up = np.stack([xs, ey + lift + eh * 1.15 * np.sin(np.pi * t) ** 0.75], 1)
        lo = np.stack([xs, ey + lift - eh * 0.85 * np.sin(np.pi * t) ** 0.9], 1)
        put('eyewhite', *_poly(np.vstack([up, lo[::-1][1:-1]])), 0.0012, 'white')
        ic = np.array([cx - s_ * 0.004, ey + 0.002])
        for nm, r, lift_, col in (('irisrim', 0.0205, 0.0019, 'irisdark'), ('iris', 0.0185, 0.0023, 'iris'), ('pupil', 0.0085, 0.0027, 'pupil')):
            P2, F2 = _ellipse(ic[0], ic[1], r, r, 32); P2 = clamp_in(P2, up, lo); put(nm, P2, F2, lift_, col)
        P2, F2 = _ellipse(ic[0] + s_ * 0.006, ic[1] + 0.006, 0.0042, 0.0042, 14); P2 = clamp_in(P2, up, lo); put('light', P2, F2, 0.0031, 'light')
        # the liner: thick along the upper lid, sweeping out and up into a wing past the outer corner
        wing = np.array([[xs[-1] + s_ * ew * 0.42, up[-1, 1] + eh * 0.55]])
        line = np.vstack([up + [0, 0.0012], wing])
        wid = np.r_[np.linspace(0.0025, 0.0062, 12), np.linspace(0.0062, 0.0055, 13), 0.0012]
        P2, F2 = _strip(line, wid); put('lash', P2, F2, 0.0036, 'lash')
        # a thin lower liner on the outer third
        ll = lo[16:] - [0, 0.0006]
        P2, F2 = _strip(ll, np.linspace(0.0008, 0.0022, len(ll))); put('lash2', P2, F2, 0.0032, 'lash')
        # the brow: solid, a gentle arch, thick at the inner end tapering out
        bt = np.linspace(0, 1, 16); bx = cx + s_ * (bt - 0.45) * ew * 2.25
        by = ey + 0.062 + st['browarch'] * np.sin(np.pi * np.clip(bt * 1.1, 0, 1)) - 0.008 * bt + (bt - 0.5) * tl * 0.6
        P2, F2 = _strip(np.stack([bx, by], 1), st['browthick'] * (1.0 - 0.75 * bt ** 1.5)); put('brow', P2, F2, 0.002, 'brow')
    # the lips: a cupid's-bow upper lip, a fuller lower lip, a darker line between
    lw = 0.050 * st['lipk']; t = np.linspace(-1, 1, 31)
    mid = my + 0.000
    upr = np.stack([t * lw, mid + 0.0035 + 0.0085 * (1 - t ** 2) ** 0.8 - 0.0035 * np.exp(-(t / 0.12) ** 2)], 1)
    lwr = np.stack([t * lw * 0.92, mid - 0.0015 - 0.0125 * (1 - t ** 2) ** 0.9], 1)
    line = np.stack([t * lw, mid + 0.0008 * (1 - t ** 2)], 1)
    P2, F2 = _poly(np.vstack([upr, line[::-1][1:-1]])); put('lipup', P2, F2, 0.0016, 'lip')
    P2, F2 = _poly(np.vstack([line, lwr[::-1][1:-1]])); put('liplo', P2, F2, 0.0014, 'liplight')
    P2, F2 = _strip(line, 0.0016 * (0.4 + 0.6 * (1 - t ** 4))); put('mouth', P2, F2, 0.0019, 'mouthline')
    return parts, dict(chin=chin, cz=cz)

def _vn(V, F):
    n = np.zeros_like(V); fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    for k in range(3): np.add.at(n, F[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)

def _sph(rx, ry, rz, nu, nv):
    th = np.linspace(0, np.pi, nv); ph = np.linspace(-np.pi, np.pi, nu, endpoint=False); TH, PH = np.meshgrid(th, ph, indexing='ij')
    return np.stack([rx * np.sin(TH) * np.sin(PH), ry * np.cos(TH), rz * np.sin(TH) * np.cos(PH)], -1).reshape(-1, 3)
def _sphF(nu, nv):
    F = []
    for j in range(nv - 1):
        for i in range(nu):
            a, b = j * nu + i, j * nu + (i + 1) % nu; F += [(a, a + nu, b + nu), (a, b + nu, b)]
    return np.array(F)

COLORS = dict(white='#f6f2ea', irisdark='#2a1a14', pupil='#120c0c', light='#ffffff', lash='#141012', mouthline='#5a3430', blush='#f2a6a0')

def apply(M, J, who, swatch_uv):
    """replace the old head (the '_face' group above the chin, and the '_mouth' piece) with the new one. swatch_uv(hex) -> (u, v)"""
    P = M['pos'].reshape(-1, 3); T = M['groups']['_face'].reshape(-1, 3).astype(np.int64); fv = np.unique(T)
    parts, info = build(J, P[fv], who)
    st = STYLE[who]; UV = M['uv'].reshape(-1, 2); SI = M['si'].reshape(-1, 4); SW = M['sw'].reshape(-1, 4); INK = M['ink'].reshape(-1, 3)
    skin_uv = np.median(UV[fv], 0)
    lc = st['lip'].lstrip('#'); lighter = '#' + ''.join('%02x' % min(255, int(int(lc[i:i + 2], 16) * 1.12 + 10)) for i in (0, 2, 4))
    cols = dict(COLORS, iris=st['iris'], brow=st['brow'], lip=st['lip'], liplight=lighter)
    names = [b['name'] for b in J['bones']]; hb = names.index('head')
    inkw = float(np.median(np.linalg.norm(INK[fv].astype(np.float64) / 100000, axis=1)))
    chin = info['chin']
    # what goes: the old head above the chin line, and the old mouth piece
    c = P[T].mean(1); keepT = T[c[:, 1] <= chin - 0.005]
    n0 = M['verts']; addP, addN, addUV, addSI, addSW, addINK, addF, inkF = [], [], [], [], [], [], [], []
    base = n0; oldF = P[fv]
    for name, V, F, N, col in parts:
        uv = skin_uv if col == 'skin' else np.array(swatch_uv(cols[col]), np.float32)
        addP.append(V); addN.append(N); addUV.append(np.tile(uv, (len(V), 1)))
        if name == 'head':   # its weights: the old head's nearest (so it bends into the neck as before)
            near = fv[np.argmin(((V[:, None, :] - oldF[None, :, :]) ** 2).sum(2), 1)]
            addSI.append(SI[near]); addSW.append(SW[near]); addINK.append(N * inkw)
        else:
            addSI.append(np.tile([hb, 0, 0, 0], (len(V), 1))); addSW.append(np.tile([255, 0, 0, 0], (len(V), 1))); addINK.append(np.zeros_like(V))
        addF.append(F + base)
        if name in ('head', 'ear'): inkF.append(F + base)
        base += len(V)
    allP = np.vstack(addP).astype(np.float32)
    M['pos'] = np.concatenate([M['pos'], allP.ravel()]).astype(np.float32)
    M['nor'] = np.concatenate([M['nor'], np.vstack(addN).ravel()]).astype(np.float32)
    M['uv'] = np.concatenate([M['uv'], np.vstack(addUV).ravel()]).astype(np.float32)
    M['fuv'] = np.concatenate([M['fuv'], np.zeros(len(allP) * 2, np.float32)])
    M['si'] = np.concatenate([M['si'], np.vstack(addSI).ravel().astype(np.uint8)])
    M['sw'] = np.concatenate([M['sw'], np.vstack(addSW).ravel().astype(np.uint8)])
    M['ink'] = np.concatenate([M['ink'], np.round(np.vstack(addINK).ravel() * 100000).astype(np.int16)])
    tot = base; dt = np.uint16 if tot < 65536 else np.uint32
    M['groups']['_face'] = np.concatenate([keepT.ravel(), np.vstack(addF).ravel()]).astype(dt)
    M['groups']['_mouth'] = np.array([n0, n0, n0], dt)   # (the old mouth piece gone: one empty triangle keeps the group)
    for g in list(M['groups'].keys()): M['groups'][g] = M['groups'][g].astype(dt)
    if '_face' in M['inkGroups']:
        it = M['inkGroups']['_face'].reshape(-1, 3).astype(np.int64); ic = P[it].mean(1)
        M['inkGroups']['_face'] = np.concatenate([it[ic[:, 1] <= chin - 0.005].ravel(), np.vstack(inkF).ravel()]).astype(dt)
    if '_mouth' in M['inkGroups']: M['inkGroups']['_mouth'] = np.array([n0, n0, n0], dt)
    for g in list(M['inkGroups'].keys()): M['inkGroups'][g] = M['inkGroups'][g].astype(dt)
    M['verts'] = tot; M['tris'] = sum(len(g) for g in M['groups'].values()) // 3
    return len(allP)

HEAD_SCALE = 0.68   # (Andrew's reference has a normal head on the body; this takes the chibi head most of the way there)

def scale_head(M, J, k=HEAD_SCALE):
    """shrink the head (everything the head bone and its children carry: the face, the hair, the cap, the earrings) toward the top
    of the neck, blended by how much of each vertex follows the head, so the neck stays whole"""
    P = M['pos'].reshape(-1, 3).copy(); SI = M['si'].reshape(-1, 4); SW = M['sw'].reshape(-1, 4) / 255
    B = J['bones']; names = [b['name'] for b in B]; hb = names.index('head')
    desc = {hb}; ch = True
    while ch:
        ch = False
        for i, b in enumerate(B):
            if b['parent'] in desc and i not in desc: desc.add(i); ch = True
    w = sum((SI == d) * SW for d in desc).sum(1)
    piv = np.array([0.0, J['head']['chin'] - 0.02, 0.01])
    f = 1 - (1 - k) * np.clip(w, 0, 1)
    P = piv + (P - piv) * f[:, None]
    M['pos'] = P.ravel().astype(np.float32)
    return piv

def scale_head_info(J, piv, k=HEAD_SCALE):
    h = J['head']
    for key in ('top', 'chin', 'eye'): h[key] = round(float(piv[1] + (h[key] - piv[1]) * k), 4)
    for key in ('hh', 'hx', 'hcy'): h[key] = round(h[key] * k, 4)
    J['height'] = h['top']
