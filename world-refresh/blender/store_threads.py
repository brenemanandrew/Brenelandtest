"""Peak Threads + Belinda's Spa (Andrew's design sheet, concepts/andrew_peak_threads_design.jpg): a timber-framed mountain chalet with a
stone wing, on a raised spot with a flagstone path up to it. Ground floor boutique, the spa in the loft over the back half.
/tmp/bvenv/bin/python blender/store_threads.py [ext|cut|spa|all]   (run from world-refresh/)"""
import sys, math, random; sys.path.insert(0, 'blender'); from kit_store import *
B = 1.0                                   # the plateau's top: the building's ground
X0, X1, Y0, Y1 = -4.5, 4.5, 2.0, 10.0     # the main block (front at Y0)
LOFT, EAVE, RIDGE = 3.3, 6.0, 9.4         # loft floor, eaves, ridge (over B): eaves high enough for full-height loft walls (Andrew)
TIM, PLA, FLOOR, MOSS = '#4a3526', '#f1e6cf', '#c89a62', '#6f8f3a'
GOLD, PURP, ROSE = '#c9a24a', '#6b3f8a', '#c0566e'

def build(cut):
    reset(); random.seed(2)
    box(0, 20, -0.4, 140, 140, 0.4, '#86b85e', bevel=0); mountains()
    box(10, -14, -0.02, 6, 30, 0.04, '#cfc6b6', bevel=0)                       # the lane below
    plateau(1.5, 6.5, 24, 19, B)
    path_up([(9.5, -12), (8.5, -7), (5, -3.6), (1.5, -1.2), (-0.9, 0.6)], 0.0, B, seed=4)
    for x, y, s in ((-11, 13, 1.3), (-9, 3, 1.0), (12, 12, 1.4), (13, 2, 1.1), (-12, -6, 1.2), (15, -4, 0.9)): tree(x, y, B if abs(x) < 12 else 0, s)
    # ---- the main block: plaster panels between dark timbers
    walls = [((X0, Y1), (X1, Y1)), ((X0, Y0), (X0, Y1))] + ([] if cut else [((X0, Y0), (X1, Y0)), ((X1, Y0), (X1, Y1))])   # (cut: front and east off)
    for (a, b) in walls:
        if a[1] == b[1]: box((a[0] + b[0]) / 2, a[1] + (0.1 if a[1] == Y1 else -0.1), B, abs(b[0] - a[0]), 0.2, EAVE, PLA, bevel=0)
        else: box(a[0] + (-0.1 if a[0] == X0 else 0.1), (a[1] + b[1]) / 2, B, 0.2, abs(b[1] - a[1]), EAVE, PLA, bevel=0)
    # timbers: corner posts, floor band, eave band, braces on the sides
    for x0 in ((X0,) if cut else (X0, X1)):
        x = x0 + (-0.22 if x0 == X0 else 0.22)
        for y in (Y0 - 0.1, Y1 + 0.1): beam((x, y, B), (x, y, B + EAVE), 0.24, TIM)
        beam((x, Y0, B + LOFT), (x, Y1, B + LOFT), 0.2, TIM); beam((x, Y0, B + EAVE), (x, Y1, B + EAVE), 0.22, TIM)
        for y in (4.0, 6.0, 8.0): beam((x, y, B + 0.6), (x, y, B + EAVE), 0.16, TIM)
        beam((x, Y0, B + 0.6), (x, 4.0, B + LOFT), 0.12, TIM); beam((x, Y1, B + 0.6), (x, 8.0, B + LOFT), 0.12, TIM)
        beam((x, 6.0, B + LOFT), (x, 4.0, B + EAVE), 0.12, TIM); beam((x, 6.0, B + LOFT), (x, 8.0, B + EAVE), 0.12, TIM)
        stone_wall(Y0, Y1, x0 + (-0.32 if x0 == X0 else 0.2), B, B + 0.6, seed=31 if x0 == X0 else 32, th=0.12, axis='y')
    if not cut:
        beam((X0, Y0 - 0.22, B + LOFT), (X1, Y0 - 0.22, B + LOFT), 0.2, TIM); beam((X0, Y0 - 0.22, B + EAVE), (X1, Y0 - 0.22, B + EAVE), 0.22, TIM)
        for x in (-2.6, 2.6): beam((x, Y0 - 0.22, B + 0.6), (x, Y0 - 0.22, B + EAVE), 0.16, TIM)
        for (a, b) in ((X0, -1.75), (0.05, X1)): stone_wall(a, b, Y0 - 0.34, B, B + 0.6, seed=33, th=0.12)
        gable(X0 - 0.1, X1 + 0.1, Y0 - 0.2, B + EAVE, B + RIDGE, PLA)
        for x in (-1.6, 1.6): beam((x, Y0 - 0.25, B + EAVE), (0, Y0 - 0.25, B + RIDGE - 0.4), 0.14, TIM)
        beam((0, Y0 - 0.25, B + EAVE), (0, Y0 - 0.25, B + RIDGE - 0.3), 0.14, TIM)
        window(0, Y0 - 0.2, B + EAVE + 0.4, 1.0, 1.0, TIM, emit=0)
        # front: door (open), two shop windows with the boutique behind
        box(-0.9, Y0 - 0.22, B, 1.3, 0.1, 2.5, '#2d2016', bevel=0)                    # the dark doorway
        box(-1.75, Y0 - 0.55, B, 0.08, 0.75, 2.4, '#6b4a2b', rot=0.0)                   # the door leaf swung open
        beam((-1.6, Y0 - 0.26, B + 2.55), (-0.2, Y0 - 0.26, B + 2.55), 0.16, TIM)
        for wx in (-3.3, 1.9): window(wx, Y0 - 0.2, B + 0.9, 1.5, 1.6, TIM, glass='#d9e9ef')
        window(3.6, Y0 - 0.2, B + 0.9, 0.8, 1.6, TIM, glass='#d9e9ef', mull=False)
        # the covered porch: two posts, a little gable roof, the big sign on its gable, the shop line under it
        for x in (-3.2, 3.2): cyl(x, 0.5, B, 0.13, 3.0, TIM, seg=12)
        roof(-3.6, 3.6, 0.2, Y0 - 0.2, B + 3.0, B + 4.4, '#566069', over=0.35, moss=MOSS, seed=8)
        gable(-3.6, 3.6, 0.15, B + 3.0, B + 4.4, '#e9dcc0', th=0.1)
        box(0, 0.05, B + 3.05, 3.8, 0.1, 1.2, '#7a5a3c', bevel=0.06); box(0, 0.0, B + 3.15, 3.5, 0.08, 1.0, '#efe0b8', bevel=0.04)
        text('PEAK', -0.1, -0.05, B + 3.68, 0.42, '#3f6b3a', ext=0.04); text('THREADS', -0.1, -0.05, B + 3.2, 0.42, '#3f6b3a', ext=0.04)
        for sg in (-1, 1): ball(sg * 1.55, -0.04, B + 3.6, 0.12, '#5f9a45', sx=1.6, sz=0.6)
        box(0, 0.05, B + 2.45, 3.4, 0.1, 0.42, '#5a3e28', bevel=0.04)
        text('Fantasy Apparel & Accessories', 0, -0.02, B + 2.55, 0.2, '#f3e3c3', ext=0.02)
        for x in (-2.0, 2.0): beam((x, 0.05, B + 2.9), (x, 0.05, B + 3.05), 0.03, '#2b2326')
        # the owl post, the bench, pots, a pink banner
        cyl(3.9, 0.3, B, 0.17, 1.7, '#6b4a2b', seg=10); ball(3.9, 0.3, B + 1.95, 0.3, '#8a6240', sz=1.2); ball(3.9, 0.3, B + 2.35, 0.24, '#8a6240')
        for sg in (-1, 1): ball(3.9 + sg * 0.1, 0.08, B + 2.38, 0.07, '#f0c24f'); ball(3.9 + sg * 0.1, 0.03, B + 2.38, 0.03, '#2b2326')
        box(5.4, 0.6, B, 1.6, 0.5, 0.45, '#7a5a3c'); box(5.4, 0.8, B + 0.45, 1.6, 0.1, 0.55, '#7a5a3c')
        for x, y, s, sd in ((-4.4, 0.4, 1.0, 1), (-3.4, 0.0, 0.8, 2), (2.5, 0.0, 0.8, 3), (4.6, -0.3, 0.9, 4), (-5.6, 1.2, 1.1, 5)): flowers(x, y, B, s, seed=sd)
        cyl(-6.6, 0.6, B, 0.05, 3.6, '#5a3e28', seg=8)
        mesh([(-6.6, 0.6, B + 3.5), (-5.2, 0.4, B + 3.2), (-5.5, 0.5, B + 2.7), (-6.6, 0.6, B + 2.4)], [(0, 1, 2, 3), (3, 2, 1, 0)], '#f2a6c4')
        roof(X0, X1, Y0, Y1, B + EAVE, B + RIDGE, '#566069', over=0.6, moss=MOSS, seed=1)
    else:
        # cutaway: no roof, just the gable ends' outline
        pass
    # ---- the stone wing (east), its own lower roof
    WX0, WX1, WY0, WY1 = X1, X1 + 4.2, 3.2, 9.4
    if not cut:
        stone_wall(WY0, WY1, WX1, B, B + 3.4, seed=21, axis='y')
        stone_wall(WX0, WX1, WY1, B, B + 3.4, seed=22)
        stone_wall(WX0, WX1, WY0 - 0.35, B, B + 3.4, seed=23)
        window(WX0 + 2.1, WY0 - 0.42, B + 1.0, 1.1, 1.2, TIM, glass='#d9e9ef')
        roof(WX0 - 0.2, WX1, WY0, WY1, B + 3.4, B + 5.4, '#566069', over=0.45, moss=MOSS, seed=3)
        gable(WX0 - 0.2, WX1, WY0 - 0.4, B + 3.4, B + 5.4, '#9a958c', th=0.3)
    # ---- inside: the boutique
    box(0, (Y0 + Y1) / 2, B, X1 - X0, Y1 - Y0, 0.06, FLOOR, bevel=0)
    for i in range(9): box(X0 + 0.5 + i, (Y0 + Y1) / 2, B + 0.061, 0.03, Y1 - Y0, 0.004, '#a87c4c', bevel=0)
    box(-0.6, 5.2, B + 0.07, 3.2, 2.0, 0.01, '#b0485a', bevel=0); box(-0.6, 5.2, B + 0.075, 2.8, 1.6, 0.01, '#e8b04a', bevel=0)   # a rug
    for y in (3.4, 6.6):   # gilt mirrors with a mannequin before each, on the west wall
        box(X0 + 0.12, y, B + 0.25, 0.08, 0.9, 1.9, GOLD, bevel=0.05); box(X0 + 0.17, y, B + 0.35, 0.04, 0.72, 1.7, '#cfe2ea', rough=0.05, bevel=0)
    for (y, top, bot) in ((4.4, '#6b8f3a', '#3f6b8a'), (5.6, '#a0473a', '#d9b24a')):
        cyl(X0 + 1.0, y, B, 0.25, 0.06, '#3a2a1c'); cyl(X0 + 1.0, y, B, 0.03, 1.0, '#3a2a1c')
        cyl(X0 + 1.0, y, B + 0.95, 0.3, 0.75, bot, r2=0.2); cyl(X0 + 1.0, y, B + 1.7, 0.22, 0.4, top, r2=0.27); ball(X0 + 1.0, y, B + 2.15, 0.11, '#efe6d6')
        box(X0 + 1.0, y + 0.18, B + 1.0, 0.5, 0.08, 1.0, PURP)                          # a cape
    # back wall: the shelf unit (bags, glasses, jewellery forms) between the stair arch and the west corner
    box(-1.2, Y1 - 0.25, B, 4.4, 0.45, 2.6, '#7a5a3c', bevel=0.02)
    for z in (0.9, 1.5, 2.1): box(-1.2, Y1 - 0.5, B + z, 4.2, 0.4, 0.05, '#8a6a46', bevel=0.01)
    for i in range(6):
        box(-3.0 + i * 0.72, Y1 - 0.5, B + 2.15, 0.42, 0.25, 0.32, random.choice(['#8a5a34', '#6b4a2b', '#a0473a', '#3f6b3a']), bevel=0.05)
        for k in range(2): torus(-3.15 + i * 0.72 + k * 0.28, Y1 - 0.6, B + 1.62, 0.07, 0.012, '#2b2326', rot=(math.pi / 2, 0, 0))
        ball(-3.0 + i * 0.72, Y1 - 0.55, B + 1.05, 0.08, random.choice(['#c9a24a', '#b48cff', '#3fae9a']))
    # the table of folded stacks, the counter and till
    box(-0.6, 5.2, B + 0.75, 2.2, 1.0, 0.08, '#8a6240'); [cyl(-0.6 + sx * 0.95, 5.2 + sy * 0.4, B, 0.05, 0.75, '#6b4a2b', seg=8) for sx in (-1, 1) for sy in (-1, 1)]
    for i, c in enumerate(['#3f8fd9', '#c0566e', '#e8b04a', '#6b8f3a', '#b48cff', '#e0564a']):
        for k in range(3): box(-1.35 + (i % 3) * 0.75, 5.0 + (i // 3) * 0.45, B + 0.83 + k * 0.08, 0.5, 0.35, 0.07, c, bevel=0.015)
    box(2.4, 3.4, B, 1.8, 0.7, 1.0, '#6b4a2b', bevel=0.03); box(2.4, 3.4, B + 1.0, 1.95, 0.8, 0.06, '#8a6240')
    box(2.0, 3.4, B + 1.06, 0.4, 0.3, 0.25, '#b08d57', bevel=0.03); box(2.0, 3.3, B + 1.31, 0.35, 0.15, 0.12, '#2b2326')
    for k in range(3): box(2.9, 3.4, B + 1.06 + k * 0.07, 0.45, 0.3, 0.06, '#7a5a3c', bevel=0.01)  # old books
    figure(2.4, 4.1, B, '#5a3f6b', '#2b2326', '#2b2326', skin='#d9a77f')                         # the clerk
    plant(X1 - 0.5, Y0 + 0.6, B, 1.1); plant(X0 + 0.5, Y1 - 0.9, B, 0.9)
    # the curved stair up to the loft, at the back east corner
    spiral(3.1, 6.8, B, 1.25, B + LOFT, '#8a6240', n=14, turn=0.7, start=-math.pi / 2)
    # ---- the loft: Belinda's Spa (over the back half)
    LY0 = 6.0; ZL = B + LOFT
    box(0, (LY0 + Y1) / 2, ZL - 0.2, X1 - X0, Y1 - LY0, 0.2, '#8a6240', bevel=0)
    beam((X0, LY0, ZL - 0.1), (X1, LY0, ZL - 0.1), 0.24, TIM)
    for i in range(9): box(X0 + 0.5 + i, (LY0 + Y1) / 2, ZL + 0.001, 0.03, Y1 - LY0, 0.004, '#a87c4c', bevel=0)
    railing((X0 + 0.1, LY0 + 0.1), (1.7, LY0 + 0.1), ZL)
    box(-0.4, 8.0, ZL + 0.005, 3.0, 2.2, 0.01, '#9a2f4a', bevel=0); box(-0.4, 8.0, ZL + 0.01, 2.6, 1.8, 0.01, '#d97a3a', bevel=0); box(-0.4, 8.0, ZL + 0.015, 1.6, 1.0, 0.01, '#3f5f8a', bevel=0)
    # the spa chair: base, seat, raised back, leg rest, arm rests (cream leather)
    CR = '#f1e6d6'
    box(-0.4, 8.0, ZL, 0.5, 0.6, 0.45, '#9aa3ad', bevel=0.04)
    box(-0.4, 7.9, ZL + 0.45, 0.75, 0.8, 0.18, CR, bevel=0.07)
    beam((-0.4, 8.25, ZL + 0.6), (-0.4, 8.7, ZL + 1.55), 0.75, CR, d=0.16); ball(-0.4, 8.72, ZL + 1.62, 0.2, CR, sx=1.4, sy=0.6, sz=0.6)   # the raised back and its headrest
    beam((-0.4, 7.52, ZL + 0.56), (-0.4, 6.95, ZL + 0.22), 0.7, CR, d=0.14)                                                          # the leg rest
    for sg in (-1, 1): box(-0.4 + sg * 0.45, 7.95, ZL + 0.62, 0.14, 0.7, 0.1, CR, bevel=0.04)
    # the vanity with its oval mirror and stool (west wall), the side table with lantern and bottles
    box(X0 + 0.45, 8.0, ZL, 0.6, 1.2, 0.8, '#6b4a2b', bevel=0.03); torus(X0 + 0.2, 8.0, ZL + 1.4, 0.38, 0.05, GOLD, rot=(0, math.pi / 2, 0))
    o = ball(X0 + 0.18, 8.0, ZL + 1.4, 0.36, '#cfe2ea', sx=0.06, sy=0.85, sz=1.15, rough=0.05)
    cyl(X0 + 1.1, 8.0, ZL, 0.2, 0.45, '#b04a8a', seg=16)
    box(1.0, 8.6, ZL, 0.55, 0.45, 0.7, '#6b4a2b'); box(1.0, 8.6, ZL + 0.7, 0.2, 0.2, 0.3, '#2b2326'); ball(1.0, 8.6, ZL + 0.85, 0.09, '#ffc76a', emit=6)
    lamp(1.0, 8.6, ZL + 0.9, 25, (1, 0.75, 0.45))
    for k, c in enumerate(['#7fbf8a', '#e8d2a8', '#b48cff']): cyl(0.85 + k * 0.12, 8.45, ZL + 0.7, 0.04, 0.2, c, seg=10)
    # curtains, the back window, the poster, the desk with Belinda tidying, plants, picture frames
    window(-2.6, Y1 - 0.02, ZL + 0.6, 1.0, 1.1, TIM, glass='#cfe6f2', emit=0.6)
    for sg in (-1, 1): box(-2.6 + sg * 0.75, Y1 - 0.15, ZL + 0.3, 0.35, 0.12, 1.8, PURP, bevel=0.05)
    box(0.4, Y1 - 0.06, ZL + 0.55, 1.9, 0.04, 1.2, '#f7f1e4', bevel=0); box(0.4, Y1 - 0.08, ZL + 1.55, 1.9, 0.02, 0.22, '#b48cff', bevel=0)
    text('FACIAL HARMONY', 0.4, Y1 - 0.1, ZL + 1.6, 0.14, '#4a2a6a', ext=0.005)
    for k in range(3): ball(-0.25 + k * 0.65, Y1 - 0.1, ZL + 1.1, 0.16, ['#e0b48f', '#d9a77f', '#c9875f'][k], sy=0.3); ball(-0.25 + k * 0.65, Y1 - 0.1, ZL + 0.75, 0.05, '#4a2a6a', sy=0.3)
    box(2.9, 9.4, ZL, 1.3, 0.6, 0.78, '#6b4a2b', bevel=0.03); box(2.9, 9.4, ZL + 0.78, 1.4, 0.68, 0.05, '#8a6240')
    box(2.7, 9.4, ZL + 0.83, 0.4, 0.3, 0.2, '#6b3f8a', bevel=0.04)
    figure(2.4, 8.9, ZL, '#2b2326', '#2b2326', '#16141c', skin='#c98e62')                           # Belinda
    plant(X0 + 0.5, LY0 + 0.6, ZL, 1.0); plant(3.9, 9.5, ZL, 0.9)
    for k in range(3): box(1.6 + k * 0.5, Y1 - 0.06, ZL + 1.3 + (k % 2) * 0.3, 0.32, 0.03, 0.4, GOLD, bevel=0.02)
    if not cut: ball(0, 9.0, ZL + 2.6, 0.18, '#ffd0a0', emit=5)
    lamp(0, 8.0, ZL + 2.4, 120, (1, 0.8, 0.6), 0.6)   # a pendant
    lamp(0, 4.5, B + 3.0, 160, (1, 0.85, 0.65), 0.8)

which = sys.argv[1] if len(sys.argv) > 1 else 'all'
if which in ('all', 'ext'):
    build(False); sky('#a8d4ef', 1.0); sun(3.0, (0.95, 0, -0.65)); cam((-13, -15, 7.5), (1.0, 4.5, 3.2), 30); render('concepts/v2_threads_exterior.png')
if which in ('all', 'cut'):
    build(True); sky('#a8d4ef', 1.0); sun(2.4, (0.8, 0, -0.4)); cam((9.5, -7.5, 11.0), (-0.6, 6.0, 1.8), 30); render('concepts/v2_threads_cutaway.png')
if which in ('all', 'spa'):
    build(True); sky('#a8d4ef', 0.8); sun(1.6, (0.8, 0, -0.4)); cam((2.2, 5.2, 6.4), (-0.8, 8.6, 4.4), 24); render('concepts/v2_threads_spa.png')
