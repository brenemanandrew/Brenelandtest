"""Concept: Peak Threads (clothing store) with Belinda's Spa upstairs. /tmp/bvenv/bin/python blender/concept_threads.py
Front faces -y. Ground floor 13 x 10 m, 4 m high; spa floor above the back half (a mezzanine open to the shop) + balcony."""
import sys, math, random; sys.path.insert(0, 'blender'); from kit import *
W, D, H1, H2 = 13.0, 10.0, 4.0, 3.2
CREAM, TIMBER, TEAL, CORAL, GOLD, PINK, FLOOR = '#f3ead8', '#4a3526', '#2f8f8a', '#e8735a', '#e9b949', '#f08fb5', '#d9b98a'
MANN = '#efe6d6'
def mannequin(x, y, z, top, bottom, skirt=False, hat=None, rot=0):
    cyl(x, y, z, 0.42, 0.12, '#ffffff'); person(x, y, z + 0.12, top, bottom, skin=MANN, hair=MANN, skirt=skirt, shoes=bottom)
    if hat: cyl(x, y, z + 1.6, 0.3, 0.05, hat); cyl(x, y, z + 1.62, 0.2, 0.16, hat)
def banner(s, x, y, z, col, size=0.34, w=None):
    w = w or (0.26 * len(s) * size / 0.34 + 0.5); box(x, y + 0.03, z - 0.12, w, 0.05, size + 0.28, col, bevel=0.03); text(s, x, y - 0.02, z, size, '#ffffff')
def plant(x, y, z, s=1.0):
    cyl(x, y, z, 0.22 * s, 0.4 * s, '#c86f4a', r2=0.28 * s); 
    for i in range(5): ball(x + 0.18 * s * math.cos(i * 1.3), y + 0.18 * s * math.sin(i * 1.3), z + (0.65 + 0.12 * (i % 3)) * s, 0.26 * s, '#4f9a3e', sz=1.2)
def rack(x, y, z, n, cols, along='x', L=2.4):
    for sg in (-1, 1):
        px, py = (x + sg * L / 2, y) if along == 'x' else (x, y + sg * L / 2); cyl(px, py, z, 0.03, 1.5, '#b08d57'); cyl(px, py, z, 0.14, 0.03, '#b08d57')
    if along == 'x': box(x, y, z + 1.46, L, 0.04, 0.04, '#b08d57')
    else: box(x, y, z + 1.46, 0.04, L, 0.04, '#b08d57')
    for i in range(n):
        t = (i + 0.5) / n - 0.5; c = cols[i % len(cols)]
        if along == 'x': box(x + t * (L - 0.3), y, z + 0.75, 0.07, 0.42, 0.68, c, bevel=0.03)
        else: box(x, y + t * (L - 0.3), z + 0.75, 0.42, 0.07, 0.68, c, bevel=0.03)
def build(cut):
    reset()
    # ground, sidewalk
    box(0, 2, -0.2, 60, 60, 0.2, '#7fbf5a', bevel=0); box(0, -3.2, -0.05, 22, 5, 0.1, '#d8cfc0', bevel=0)
    # floors
    box(0, D / 2, 0, W, D, 0.08, FLOOR, bevel=0)
    for i in range(13): box(-W / 2 + 0.5 + i, D / 2, 0.081, 0.03, D, 0.004, '#c4a273', bevel=0)
    # walls: back, sides (side walls lower in the cutaway so the inside shows)
    T = 0.25; top = H1 + H2
    box(0, D, 0, W, T, top, CREAM)
    for sx in (-1, 1): box(sx * W / 2, D / 2, 0, T, D, top if not cut else (top if sx < 0 else 1.2), CREAM)
    # coloured section walls inside (painted panels)
    box(-W / 2 + 0.15, 2.6, 0.1, 0.06, 4.6, 3.4, TEAL, bevel=0)      # hats + accessories (left, front)
    box(-W / 2 + 0.15, 7.6, 0.1, 0.06, 4.4, 3.4, '#6b4e9a', bevel=0)  # fitting rooms (left, back)
    box(2.8, D - 0.15, 0.1, 6.8, 0.06, 3.4, GOLD, bevel=0)            # shoes (back right)
    if not cut: box(W / 2 - 0.15, D / 2, 0.1, 0.06, D - 0.6, 3.4, CORAL, bevel=0)
    # ---- mezzanine: the spa over the back 5 m, glass rail, stairs along the back-left
    box(0.9, 7.5, H1 - 0.25, W - 2.0 - T, 5.0 - T, 0.25, '#e8dcc6'); box(0.9, 5.05, H1, W - 2.0 - T, 0.05, 1.0, (0.7, 0.9, 0.95), alpha=0.25, rough=0.1, bevel=0); box(0.9, 5.05, H1 + 1.0, W - 2.0 - T, 0.07, 0.05, '#b08d57')
    for i in range(16): box(-W / 2 + 0.75, 1.9 + i * 0.36, i * 0.25, 1.1, 0.36, 0.25, '#b9895a', bevel=0.01)   # stairs up the left wall, front to back
    box(-W / 2 + 1.33, 4.6, 0, 0.06, 5.8, 0.05, '#b08d57')
    # spa things (z = H1)
    z = H1; box(3.6, 7.6, z + 0.0, 3.4, 2.6, 0.02, '#f6d9e3', bevel=0)                                           # rug
    for mx in (2.6, 4.6): box(mx, 7.6, z + 0.55, 0.8, 2.0, 0.14, '#ffffff', bevel=0.05); box(mx, 7.6, z, 0.6, 1.6, 0.55, '#b9895a'); box(mx, 8.35, z + 0.69, 0.5, 0.35, 0.1, PINK, bevel=0.04)   # massage tables
    cyl(-1.6, 8.0, z, 1.25, 0.7, '#b9895a'); cyl(-1.6, 8.0, z + 0.62, 1.08, 0.1, '#58c9c4', emit=0.6)              # hot tub
    for a in range(5): ball(-1.6 + 0.6 * math.cos(a * 1.3), 8.0 + 0.6 * math.sin(a * 1.3), z + 0.74, 0.07, '#ffffff', emit=1)
    box(0.6, 9.3, z, 1.4, 0.5, 0.9, '#ffffff'); 
    for i, c in enumerate(['#f08fb5', '#9fd6c9', '#e9b949', '#c7a0e8']): cyl(0.15 + i * 0.3, 9.3, z + 0.9, 0.07, 0.2, c)   # nail polish / oils
    box(5.9, 6.2, z, 0.7, 1.5, 0.45, '#f6d9e3', bevel=0.1); box(5.9, 6.85, z + 0.45, 0.7, 0.2, 0.5, '#f6d9e3', bevel=0.08)   # lounge chair
    for px, py in [(6.0, 9.2), (-3.4, 9.3), (0.2, 5.6)]: plant(px, py, z, 0.9)
    for cx, cy in [(1.6, 6.0), (3.6, 9.4), (5.2, 9.4), (-0.2, 9.4)]: cyl(cx, cy, z + (0.9 if cy > 9 else 0), 0.05, 0.14, '#fff3c4', emit=4)   # candles
    for i in range(3): box(-3.6 + i * 0.5, 6.0 + (i % 2) * 0.12, z, 0.5, 0.04, 1.7, '#e8c9a0' if i % 2 else '#f6d9e3')   # folding screen
    text("Belinda's Spa", 2.8, D - 0.2, z + 2.2, 0.5, PINK, emit=3)
    # ---- ground floor sections
    # HATS + ACCESSORIES (left wall, front): shelves, hats, bags, sunglasses stand
    banner('HATS + EXTRAS', -W / 2 + 0.22, 0, 0, TEAL) if False else None
    for sz in (1.0, 1.7, 2.4):
        box(-W / 2 + 0.45, 3.2, sz, 0.5, 2.6, 0.05, '#ffffff')
        for i in range(5):
            c = [CORAL, GOLD, '#3f6fa8', '#7a5234', '#ffffff'][(i + int(sz * 3)) % 5]; yy = 2.1 + i * 0.55
            cyl(-W / 2 + 0.45, yy, sz + 0.05, 0.2, 0.03, c); cyl(-W / 2 + 0.45, yy, sz + 0.06, 0.13, 0.13, c)
    text('HATS + EXTRAS', -W / 2 + 0.2, 3.2, 3.05, 0.3, '#ffffff', rot=(math.pi / 2, 0, math.pi / 2))
    box(-W / 2 + 1.0, 4.9, 0, 0.9, 0.9, 1.0, '#ffffff') if False else None; 
    for i in range(0): box(-W / 2 + 0.8 + i * 0.22, 1.3, 1.0, 0.16, 0.3, 0.22, ['#a0562a', '#2b3a5e', CORAL][i], bevel=0.04)   # bags on a cube
    # FITTING ROOMS (left wall, back, under the mezzanine): two booths with curtains, a mirror
    for i in range(2):
        by = 6.3 + i * 1.7
        box(-W / 2 + 1.9, by - 0.8, 0, 1.5, 0.06, 2.5, '#ffffff'); box(-W / 2 + 2.65, by, 0.3, 0.05, 1.4, 2.1, ['#6b4e9a', PINK][i], bevel=0.02)   # curtain
        box(-W / 2 + 2.65, by, 2.42, 0.05, 1.6, 0.05, '#b08d57')
    box(-W / 2 + 1.9, 8.75, 0, 1.5, 0.06, 2.5, '#ffffff'); text('FITTING ROOMS', -W / 2 + 2.72, 7.15, 2.75, 0.26, '#6b4e9a', rot=(math.pi / 2, 0, math.pi / 2))
    box(-2.9, 9.75, 0.3, 1.1, 0.05, 2.2, (0.75, 0.85, 0.9), rough=0.05, bevel=0.02); box(-2.9, 9.8, 0.25, 1.25, 0.05, 2.3, '#b08d57')                     # big mirror
    # FEATURED SETS: the round stage in the middle (the displays you buy a whole set from)
    cyl(0.2, 3.0, 0.08, 1.9, 0.02, '#f6d9e3'); cyl(0.2, 3.0, 0.08, 1.5, 0.22, '#ffffff')
    mannequin(-0.5, 2.7, 0.3, CORAL, '#2b3a5e', hat=GOLD); mannequin(0.9, 2.7, 0.3, '#3fa09a', '#efe4cc', skirt=True); mannequin(0.2, 3.7, 0.3, GOLD, '#4a3526', hat='#7a5234')
    text('THIS WEEK', 0.2, 2.0, 0.34, 0.2, CORAL, rot=(math.pi / 2.6, 0, 0))
    # TOPS (centre-right front): a rack and two set plinths
    rack(4.2, 2.2, 0.08, 9, [CORAL, '#3fa09a', GOLD, '#ffffff', '#6b3a7a', '#3f6fa8']); mannequin(3.0, 3.6, 0.08, '#6b3a7a', '#2b2b30'); mannequin(5.3, 3.6, 0.08, '#b8372e', '#3f5f8f')
    box(4.2, 2.9, 0.081, 4.2, 2.6, 0.005, '#cfe8e4', bevel=0)
    # BOTTOMS + DRESSES (right wall): long rack, a dress on a plinth
    text('BOTTOMS + DRESSES', 4.6, 5.0, 0.1, 0.24, CORAL, rot=(0, 0, 0)); text('TOPS', 4.2, 1.55, 0.1, 0.24, '#2f8f8a', rot=(0, 0, 0)) if False else None; rack(W / 2 - 0.9, 5.4, 0.08, 10, ['#3f5f8f', '#2b2b30', '#c9b58a', '#f0c24f', '#7fb8d8'], along='y', L=3.6)
    # SHOES (back right, under the mezzanine): shelves and a bench
    for sz in (0.5, 1.1, 1.7, 2.3):
        box(2.8, D - 0.45, sz, 6.2, 0.5, 0.05, '#ffffff')
        for i in range(10): box(0.1 + i * 0.6, D - 0.45, sz + 0.05, 0.16, 0.34, 0.13, [CORAL, '#2b2b30', '#ffffff', '#7a5234', '#3f8fd9', GOLD][(i + int(sz * 2)) % 6], bevel=0.04)
    text('SHOES', 2.8, D - 0.2, 3.0, 0.34, '#4a3526'); box(2.8, 8.2, 0.08, 2.4, 0.6, 0.42, CORAL, bevel=0.1)
    # COUNTER (front right) with Mina, and Belinda on the floor
    box(-3.2, 0.9, 0.08, 2.2, 0.8, 1.0, TIMBER); box(-3.2, 0.9, 1.08, 2.4, 0.95, 0.06, '#e8dcc6'); box(-2.6, 0.9, 1.14, 0.4, 0.35, 0.3, '#2b2b30')
    person(-3.4, 1.6, 0.08, '#3fa09a', '#2b2b30', hair='#2b2b30', skin='#b98a62'); person(1.8, 5.0, 0.08, PINK, '#2b2b30', hair='#e9d6a0', skirt=True)
    # pendant lamps and spots
    for px, py in [(0.2, 3.0), (4.2, 2.6), (-4.6, 3.2), (2.8, 8.4), (-3.0, 7.4), (3.6, 7.6), (-1.6, 8.0)]:
        zz = 3.3 if (py > 5 and px < 6) and False else 3.3
        up = py > 5.1
        cyl(px, py, (H1 + H2 - 0.9) if up else 3.2, 0.22, 0.25, GOLD if not up else PINK, r2=0.08); lamp(px, py, (H1 + H2 - 1.0) if up else 3.1, 90 if not up else 60, (1, 0.8, 0.85) if up else (1, 0.9, 0.75))
        if up: lamp(px, py, 3.2, 60)
    plant(-W / 2 + 0.9, 0.6, 0.08, 1.2); plant(W / 2 - 0.8, 0.6, 0.08, 1.2)
    if not cut:
        # ---- the front: stone base, timber frame, two big display windows, a glass door, copper awning, the sign, the balcony
        box(0, 0, 0, W + 0.3, 0.3, 0.7, '#8d8a80'); 
        for x0, x1 in [(-6.3, -1.0), (1.0, 6.3)]:
            box((x0 + x1) / 2, 0, 0.7, x1 - x0 - 0.5, 0.08, 2.5, (0.75, 0.9, 0.95), alpha=0.18, rough=0.05, bevel=0)
            box((x0 + x1) / 2, 0, 0.7, x1 - x0 - 0.3, 0.3, 0.12, TIMBER); box((x0 + x1) / 2, 0, 3.2, x1 - x0 - 0.3, 0.3, 0.14, TIMBER)
        for x in (-6.4, -0.95, 0.95, 6.4): box(x, 0, 0, 0.32, 0.36, H1 + H2, TIMBER)
        box(0, 0, 0.05, 1.5, 0.08, 2.6, (0.75, 0.9, 0.95), alpha=0.2, rough=0.05, bevel=0); box(0, 0, 2.65, 1.9, 0.3, 0.14, TIMBER); cyl(0.5, -0.1, 1.2, 0.04, 0.5, GOLD)
        box(0, 0, 3.3, W + 0.3, 0.3, 0.7, CREAM); text('PEAK THREADS', 0, -0.2, 3.42, 0.52, TIMBER, ext=0.05)
        for x0 in (-3.65, 3.65):   # striped awnings over the windows
            for i in range(9): box(x0 - 2.2 + i * 0.55, -0.75, 2.95 + 0.0, 0.55, 1.5, 0.06, CORAL if i % 2 else '#ffffff', bevel=0).rotation_euler[0] = -0.32
        # window displays (sets on plinths, seen from the street)
        mannequin(-4.6, 0.9, 0.08, GOLD, '#3f5f8f', hat=CORAL); mannequin(-2.6, 0.9, 0.08, '#ffffff', CORAL, skirt=True)
        # upper front: glass wall of the spa behind a balcony, pink neon sign, round window in the gable
        box(0, 0, H1, W + 0.3, 0.3, 0.3, TIMBER); box(0, -0.9, H1 - 0.1, W - 1.0, 1.8, 0.2, '#b9895a')
        box(0, -1.75, H1 + 0.1, W - 1.0, 0.05, 0.95, (0.7, 0.9, 0.95), alpha=0.25, rough=0.1, bevel=0); box(0, -1.75, H1 + 1.05, W - 1.0, 0.08, 0.06, GOLD)
        for x0, x1 in [(-6.2, -0.2), (0.2, 6.2)]: box((x0 + x1) / 2, 0, H1 + 0.3, x1 - x0 - 0.4, 0.08, 2.2, (0.95, 0.75, 0.85), alpha=0.3, rough=0.05, bevel=0)
        text("Belinda's Spa", 0, -0.25, H1 + 2.55, 0.5, PINK, emit=6, ext=0.04)
        for i in range(14): ball(-6 + i * 0.92, -1.75, H1 + 1.5 - 0.25 * math.sin(i / 13 * math.pi), 0.07, '#fff3c4', emit=8)   # string lights
        plant(-5.4, -1.2, H1 + 0.1, 0.8); plant(5.4, -1.2, H1 + 0.1, 0.8); box(-2.5, -1.0, H1 + 0.1, 0.6, 1.3, 0.4, '#f6d9e3', bevel=0.1)
        # roof: an asymmetric timber gable with a teal metal roof, a round window
        import bmesh
        me = bpy.data.meshes.new('roof'); bm = bmesh.new(); ov = 0.7; zt = H1 + H2
        P = [(-W / 2 - ov, -2.2, zt), (W / 2 + ov, -2.2, zt), (W / 2 + ov, D + ov, zt), (-W / 2 - ov, D + ov, zt), (-2.2, -2.2, zt + 3.4), (-2.2, D + ov, zt + 3.4)]
        vs = [bm.verts.new(p) for p in P]
        for f in [(0, 4, 5, 3), (4, 1, 2, 5), (0, 1, 4), (3, 5, 2)]: bm.faces.new([vs[i] for i in f])
        bm.to_mesh(me); o = bpy.data.objects.new('roof', me); bpy.context.scene.collection.objects.link(o); o.data.materials.append(mat(hexc(TEAL))); md = o.modifiers.new('s', 'SOLIDIFY'); md.thickness = 0.22
        cyl(-2.2, -2.25, zt + 0.5, 0.85, 0.12, (0.95, 0.85, 0.6), emit=2.5, rot=(math.pi / 2, 0, 0)); torus(-2.2, -2.3, zt + 1.35 - 0.8, 0.9, 0.09, TIMBER, rot=(math.pi / 2, 0, 0))
        # street dressing
        for x in (-5.6, 5.6): plant(x, -1.0, 0.0, 1.3)
        box(3.4, -1.3, 0, 1.8, 0.5, 0.45, '#b9895a', bevel=0.05); cyl(-7.6, -2.6, 0, 0.07, 3.6, '#2b3340'); ball(-7.6, -2.6, 3.7, 0.22, '#ffd98a', emit=6)
        box(1.6, -1.6, 0, 0.7, 0.05, 1.1, TIMBER).rotation_euler[0] = 0.25; text('NEW SETS', 1.6, -1.72, 0.7, 0.13, '#ffffff', rot=(math.pi / 2 + 0.25, 0, 0))
        person(-1.2, -2.6, 0, '#3f6fa8', '#c9b58a', hair='#7a5234'); person(-0.4, -2.3, 0, GOLD, '#2b2b30', hair='#2b2b30', skin='#b98a62', skirt=True)
import os
if os.environ.get('ONLY') != 'int': build(False); sky('#f7c9a0', 0.9); sun(3.2, (1.25, 0, -0.75), (1, 0.82, 0.62)); cam((9.5, -15.5, 4.6), (0.2, 2.0, 4.0), 30); render('concepts/threads_exterior.png')
build(True); sky('#cfe6f2', 0.55); sun(1.3, (0.7, 0, 0.9)); cam((10.5, -8.5, 11.5), (0.4, 4.4, 1.9), 30); render('concepts/threads_interior.png')
