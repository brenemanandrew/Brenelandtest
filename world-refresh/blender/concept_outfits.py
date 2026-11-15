"""Concept sheet: the pizza place's two waitress uniforms on a Breneland-style figure (after Andrew's sketch).
Left pair: the evening uniform (green polo with a collar and the name, black skirt, black heels). Right pair: the day uniform
(red and cream striped diner shirt, cream skirt with a red apron pocket band, white sneakers). Front and back of each."""
import sys, math; sys.path.insert(0, 'blender'); from kit import *
SKIN, HAIR = '#e6bd9c', '#e9d6a0'
def figure(x, rot, outfit, hair=HAIR, skin=SKIN):
    def P(dx, dy): c, s = math.cos(rot), math.sin(rot); return x + dx * c - dy * s, dx * s + dy * c
    night = outfit == 'evening'
    top, skirt, shoe = ('#3f9a5a', '#1e1e24', '#1e1e24') if night else ('#c7392f', '#f3ead8', '#ffffff')
    for sg in (-1, 1):   # legs: thigh, calf, shoe (heels at night, sneakers by day)
        px, py = P(sg * 0.1, 0); cyl(px, py, 0.5, 0.085, 0.45, skin, r2=0.1); cyl(px, py, 0.1, 0.06, 0.42, skin, r2=0.085)
        fx, fy = P(sg * 0.1, -0.06)
        if night: box(fx, fy, 0.03, 0.1, 0.24, 0.08, shoe, bevel=0.03, rot=rot); hx, hy = P(sg * 0.1, 0.08); cyl(hx, hy, 0, 0.02, 0.1, shoe)
        else: box(fx, fy, 0, 0.13, 0.27, 0.1, shoe, bevel=0.04, rot=rot); box(fx, fy, 0, 0.14, 0.28, 0.03, '#c7392f', bevel=0.01, rot=rot)
    cx, cy = P(0, 0)
    cyl(cx, cy, 0.7, 0.25, 0.3, skirt, r2=0.2)                                         # skirt
    if not night: bx, by = P(0, -0.2); box(bx, by, 0.72, 0.24, 0.03, 0.2, '#c7392f', bevel=0.01, rot=rot)   # day: apron pocket
    cyl(cx, cy, 0.97, 0.2, 0.2, top, r2=0.175); cyl(cx, cy, 1.15, 0.175, 0.28, top, r2=0.19); cyl(cx, cy, 1.42, 0.19, 0.08, top, r2=0.11)   # waist, chest, shoulders
    if not night:
        for i in range(4): cyl(cx, cy, 1.0 + i * 0.12, 0.2 - (0.022 if i < 1 else 0.008), 0.05, '#f3ead8', r2=0.19 if i else 0.185)
    cyl(cx, cy, 1.48, 0.06, 0.1, skin)                                                 # neck
    for sg in (-1, 1):                                                                 # collar wings
        kx, ky = P(sg * 0.07, -0.1); box(kx, ky, 1.44, 0.11, 0.07, 0.03, '#ffffff' if not night else '#4fae6a', bevel=0.01, rot=rot + sg * 0.5)
    tx, ty = P(0, -0.2)
    if night: text('Peak\nPizza', tx, ty, 1.25, 0.075, '#ffffff', rot=(math.pi / 2, 0, rot), ext=0.004)
    else: text('Summit\nSlice', tx, ty, 1.27, 0.06, '#c7392f', rot=(math.pi / 2, 0, rot), ext=0.004)
    # arms: the left hangs, the right holds the tray up
    lx, ly = P(-0.26, 0); cyl(lx, ly, 1.12, 0.045, 0.3, top if night else top); cyl(lx, ly, 0.84, 0.04, 0.3, top if night else skin); ball(lx, ly, 0.8, 0.055, skin)
    rx, ry = P(0.27, 0); cyl(rx, ry, 1.2, 0.045, 0.22, top); r2x, r2y = P(0.36, -0.05); cyl(r2x, r2y, 1.28, 0.04, 0.26, top if night else skin, rot=(0.5, 0, rot)); hx, hy = P(0.42, -0.12); ball(hx, hy, 1.56, 0.055, skin)
    cyl(hx, hy, 1.6, 0.36, 0.025, '#c9ced6', rough=0.3); cyl(hx, hy, 1.625, 0.31, 0.03, '#e9a94a'); cyl(hx, hy, 1.65, 0.27, 0.012, '#c7392f')
    for i in range(7): a = i * 0.9; ball(hx + 0.16 * math.cos(a), hy + 0.16 * math.sin(a), 1.665, 0.035, '#f6e7a0', sz=0.4)
    # head: face, pixie cut with a side fringe, small earrings
    ball(cx, cy, 1.86, 0.33, skin, sz=0.95)
    for sg in (-1, 1):
        ex, ey = P(sg * 0.12, -0.3); ball(ex, ey, 1.88, 0.035, '#2a1d14', sz=1.5); qx, qy = P(sg * 0.33, 0); ball(qx, qy, 1.8, 0.03, '#e9b949')
        bxx, byy = P(sg * 0.2, -0.26); ball(bxx, byy, 1.78, 0.05, '#f0a090', sy=0.3)
    mx, my = P(0, -0.31); ball(mx, my, 1.77, 0.045, '#8a3a30', sx=1.5, sy=0.4, sz=0.45)
    hx2, hy2 = P(0, 0.03); ball(hx2, hy2, 1.93, 0.345, hair, sz=0.86); fx2, fy2 = P(-0.1, -0.2); ball(fx2, fy2, 2.05, 0.2, hair, sx=1.3, sy=0.7, sz=0.55)
    nx, ny = P(0, 0.2); ball(nx, ny, 1.75, 0.22, hair, sz=0.9)
reset(); sky('#f3ead8', 1.0); sun(2.6, (0.9, 0, -0.35)); box(0, 0, -0.1, 30, 30, 0.1, '#efe6d4', bevel=0)
bpy.context.scene.cycles.samples = 64
for i, (o, r) in enumerate([('evening', 0), ('evening', math.pi), ('day', 0), ('day', math.pi)]): figure(-2.4 + i * 1.6, r, o)
for xx, s in [(-1.6, 'EVENING'), (1.6, 'DAY')]: text(s, xx, -0.9, 0.01, 0.16, '#4a3526', rot=(0, 0, 0))
cam((0, -8.2, 1.5), (0, 0, 1.05), 50); render('concepts/waitress_outfits.png')
