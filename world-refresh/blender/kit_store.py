"""Building helpers for the v2 store concepts (on top of kit.py): rotated beams, gable walls, pitched roofs with moss, stone courses,
stairs, railings, plateau and stepped path. Units metres, z up, fronts face -y."""
import bpy, bmesh, math, random
from kit import *
from kit import _fin

def mesh(verts, faces, col, emit=0, rough=0.9, smooth=False):
    me = bpy.data.meshes.new('m'); me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new('o', me); bpy.context.collection.objects.link(o)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    o.data.materials.append(mat(hexc(col) if isinstance(col, str) else col, emit, rough)); return o

def beam(a, b, t, col, d=None):
    """A square timber from point a to point b, t thick (d deep, default t)."""
    import mathutils
    a, b = mathutils.Vector(a), mathutils.Vector(b); v = b - a; L = v.length
    bpy.ops.mesh.primitive_cube_add(size=1, location=(a + b) / 2); o = bpy.context.active_object
    o.scale = (t, d or t, L); o.rotation_euler = v.to_track_quat('Z', 'Y').to_euler(); bpy.ops.object.transform_apply(scale=True)
    return _fin(o, col, bevel=0.01)

def gable(x0, x1, y, z0, zr, col, th=0.2):
    """A triangular gable wall in the x-z plane at y (front face), from eave height z0 to the ridge zr."""
    xm = (x0 + x1) / 2; v = []
    for yy in (y, y + th): v += [(x0, yy, z0), (x1, yy, z0), (xm, yy, zr)]
    return mesh(v, [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], col)

def roof(x0, x1, y0, y1, ze, zr, col, over=0.5, th=0.18, moss=None, seed=1, along='y'):
    """A pitched roof: ridge along y (default) over x0..x1, eaves at ze, ridge at zr; two slabs overhanging by `over`. Moss: lumps."""
    xm = (x0 + x1) / 2; hw = (x1 - x0) / 2 + over; dz = (zr - ze) * (hw / ((x1 - x0) / 2))
    out = []
    for sg in (-1, 1):
        xa, za = xm + sg * hw, zr - dz; xb, zb = xm, zr
        v = [(xa, y0 - over, za), (xb, y0 - over, zb), (xb, y1 + over, zb), (xa, y1 + over, za)]
        v += [(p[0], p[1], p[2] + th) for p in v]
        out.append(mesh(v, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], col))
        # shingle courses
        for k in range(1, 7):
            f = k / 7; xs = xa + (xb - xa) * f; zs = za + (zb - za) * f + th
            beam((xs, y0 - over, zs), (xs, y1 + over, zs), 0.05, '#3c3f45' if col != '#3c3f45' else '#2c2f35')
        if moss:
            rnd = random.Random(seed + sg)
            for _ in range(int(abs(y1 - y0) * 5)):
                f = rnd.uniform(0.05, 0.85); yy = rnd.uniform(y0 - over, y1 + over)
                ball(xa + (xb - xa) * f, yy, za + (zb - za) * f + th + 0.03, rnd.uniform(0.18, 0.4), moss, sz=0.35)
    beam((xm, y0 - over, zr + th + 0.05), (xm, y1 + over, zr + th + 0.05), 0.22, '#5a3e28')
    return out

def stone_wall(x0, x1, y, z0, z1, col='#9a958c', col2='#7f7a72', th=0.35, seed=3, axis='x'):
    """A rough stone wall face: a core slab plus irregular stones proud of it (along x at y, or along y at x=y if axis='y')."""
    rnd = random.Random(seed)
    if axis == 'x': box((x0 + x1) / 2, y + th / 2, z0, abs(x1 - x0), th, z1 - z0, col2, bevel=0)
    else: box(y + th / 2, (x0 + x1) / 2, z0, th, abs(x1 - x0), z1 - z0, col2, bevel=0)
    z = z0
    while z < z1 - 0.05:
        h = min(rnd.uniform(0.22, 0.36), z1 - z); a = x0 + rnd.uniform(-0.2, 0)
        while a < x1 - 0.05:
            w = min(rnd.uniform(0.35, 0.7), x1 - a); c = col if rnd.random() < 0.6 else ('#aaa49a' if rnd.random() < 0.5 else '#8c877e')
            if axis == 'x': box(a + w / 2, y - 0.03, z + 0.01, w - 0.04, 0.08, h - 0.04, c, bevel=0.04)
            else: box(y - 0.03, a + w / 2, z + 0.01, 0.08, w - 0.04, h - 0.04, c, bevel=0.04)
            a += w
        z += h

def window(x, y, z, w, h, frame='#4a3526', glass='#bcd8e6', emit=0, mull=True, shutters=None, sill=True):
    box(x, y - 0.02, z, w, 0.06, h, glass, emit=emit, bevel=0, rough=0.2)
    t = 0.09
    for (a, b) in (((x - w / 2, z), (x + w / 2, z)), ((x - w / 2, z + h), (x + w / 2, z + h)), ((x - w / 2, z), (x - w / 2, z + h)), ((x + w / 2, z), (x + w / 2, z + h))):
        beam((a[0], y - 0.06, a[1]), (b[0], y - 0.06, b[1]), t, frame)
    if mull:
        beam((x, y - 0.07, z), (x, y - 0.07, z + h), 0.05, frame); beam((x - w / 2, y - 0.07, z + h / 2), (x + w / 2, y - 0.07, z + h / 2), 0.05, frame)
    if sill: box(x, y - 0.12, z - 0.08, w + 0.25, 0.22, 0.08, frame)

def stairs(x, y, z, w, n, rise, run, col, dirn=(0, 1), side=None):
    """A straight flight going in direction dirn (unit x/y) from (x, y, z)."""
    for i in range(n):
        cx, cy = x + dirn[0] * run * (i + 0.5), y + dirn[1] * run * (i + 0.5)
        bw, bd = (w, run) if dirn[0] == 0 else (run, w)
        box(cx, cy, z, bw, bd, rise * (i + 1), col, bevel=0.01)

def spiral(x, y, z, r, top, col, n=16, turn=1.0, start=0.0):
    """A curved stair round (x, y): n treads rising to `top`, sweeping `turn` of a full circle."""
    for i in range(n):
        a = start + turn * 2 * math.pi * (i + 0.5) / n; h = (top - z) * (i + 1) / n
        cx, cy = x + math.cos(a) * r * 0.6, y + math.sin(a) * r * 0.6
        box(cx, cy, z + h - 0.06, r * 0.9, 0.42, 0.06, col, rot=a, bevel=0.01)
        cyl(cx, cy, z, 0.03, h, '#3a2a1c')
    cyl(x, y, z, 0.09, top - z + 1.0, '#5a3e28')

def railing(a, b, z, col='#5a3e28', h=0.95, gap=0.16):
    import mathutils
    a, b = mathutils.Vector((a[0], a[1], z)), mathutils.Vector((b[0], b[1], z)); L = (b - a).length; n = max(2, int(L / gap))
    beam(a + mathutils.Vector((0, 0, h)), b + mathutils.Vector((0, 0, h)), 0.09, col)
    beam(a + mathutils.Vector((0, 0, 0.08)), b + mathutils.Vector((0, 0, 0.08)), 0.07, col)
    for i in range(n + 1):
        p = a + (b - a) * (i / n); cyl(p.x, p.y, z, 0.025, h, col, seg=8)
        if i in (0, n): cyl(p.x, p.y, z, 0.06, h + 0.12, col, seg=12); ball(p.x, p.y, z + h + 0.14, 0.07, col)

def plateau(cx, cy, w, d, h, grass='#7fb35a', stone='#9a958c'):
    """The raised spot the store stands on: a grassy mound with a low stone retaining edge at the front."""
    box(cx, cy, 0, w, d, h, grass, bevel=0.6)
    stone_wall(cx - w / 2 + 0.6, cx + w / 2 - 0.6, cy - d / 2 - 0.05, 0, h * 0.9, seed=11, th=0.25)

def path_up(pts, z0, z1, w=1.6, col='#b9b2a6', seed=5):
    """Flagstones along a polyline in xy rising from z0 to z1 in steps."""
    rnd = random.Random(seed); n = len(pts) - 1
    for i in range(n):
        (ax, ay), (bx, by) = pts[i], pts[i + 1]; za, zb = z0 + (z1 - z0) * i / n, z0 + (z1 - z0) * (i + 1) / n
        L = math.hypot(bx - ax, by - ay); m = max(1, int(L / 0.7))
        for j in range(m):
            f = (j + 0.5) / m; x, y = ax + (bx - ax) * f, ay + (by - ay) * f; zz = za + (zb - za) * f
            box(x, y, 0, w * rnd.uniform(0.85, 1.05), 0.62, zz + 0.08, col if rnd.random() < 0.7 else '#a59e92', rot=math.atan2(by - ay, bx - ax) + math.pi / 2 + rnd.uniform(-0.1, 0.1), bevel=0.05)

def flowers(x, y, z, s=1.0, cols=('#e86a8a', '#f2c14e', '#b48cff', '#ffffff'), seed=7, pot='#c86f4a'):
    rnd = random.Random(seed); cyl(x, y, z, 0.28 * s, 0.42 * s, pot, r2=0.34 * s)
    for i in range(7):
        a = rnd.uniform(0, 6.28); r = rnd.uniform(0, 0.2) * s
        ball(x + math.cos(a) * r, y + math.sin(a) * r, z + 0.5 * s + rnd.uniform(0, 0.18) * s, 0.13 * s, '#4f9a3e')
        ball(x + math.cos(a) * r, y + math.sin(a) * r - 0.05, z + 0.62 * s + rnd.uniform(0, 0.2) * s, 0.07 * s, rnd.choice(cols))

def plant(x, y, z, s=1.0, pot='#c86f4a', leaf='#4f9a3e'):
    cyl(x, y, z, 0.2 * s, 0.38 * s, pot, r2=0.25 * s)
    for i in range(7): a = i * 0.9; ball(x + 0.16 * s * math.cos(a), y + 0.16 * s * math.sin(a), z + (0.55 + 0.1 * (i % 3)) * s, 0.2 * s, leaf, sx=0.6, sz=1.6)

def tree(x, y, z, s=1.0, col='#3f7a3a'):
    cyl(x, y, z, 0.18 * s, 1.2 * s, '#5a3e28')
    for i, (r, h) in enumerate(((1.4, 1.0), (1.1, 2.0), (0.75, 2.9), (0.4, 3.6))): cyl(x, y, z + h * s, r * s, 1.2 * s, col, r2=0.05, seg=10)

def mountains():
    for i, (x, y, h, r) in enumerate(((-40, 70, 22, 26), (-8, 85, 30, 30), (30, 75, 25, 28), (60, 90, 34, 32), (-70, 90, 28, 30))):
        cyl(x, y, -1, r, h, '#7d8f99', r2=0.5, seg=7); cyl(x, y, h * 0.62 - 1, r * 0.4, h * 0.38 + 0.2, '#f2f5f7', r2=0.4, seg=7)

def figure(x, y, z, top, bottom, hair, skin='#e0b48f', rot=0, skirt=False, s=1.0):
    person(x, y, z, top, bottom, skin=skin, hair=hair, skirt=skirt, s=s)
