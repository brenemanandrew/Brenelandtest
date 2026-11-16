"""Summit Slice + the Summit Lounge (Andrew's design sheet, concepts/andrew_summit_slice_design.jpg): a stone and timber-framed pizza
house with a lower stone annex (the loft entrance, the lounge's door), on a raised spot with a path up. Day: traditional pizza,
kid-friendly. Night: the Summit Lounge, adults only, black light. Zoe and Asha live in the loft over the back half.
/tmp/bvenv/bin/python blender/store_slice.py [ext|extnight|day|night|all]   (run from world-refresh/)"""
import sys, math, random; sys.path.insert(0, 'blender'); from kit_store import *
B = 1.0
X0, X1, Y0, Y1 = -4.5, 4.5, 2.0, 10.0
UP, EAVE, RIDGE, LOFT = 3.2, 6.3, 9.7, 3.3   # (eaves raised for the loft's wall decorations, Andrew)
TIM, PLA, MOSS = '#4a3526', '#efe2c4', '#6f8f3a'

def build(night, cut):
    reset(); random.seed(5)
    G = '#3f6a3a' if night else '#86b85e'
    box(0, 20, -0.4, 140, 140, 0.4, G, bevel=0); mountains()
    box(-10, -14, -0.02, 6, 30, 0.04, '#cfc6b6', bevel=0)
    plateau(1.0, 5.0, 25, 21, B, grass='#4f7f45' if night else '#7fb35a')
    path_up([(-10, -12), (-8.8, -7), (-6.0, -4.6), (-2.6, -3.0)], 0.0, B, seed=9)
    # the cobbled patio before the front
    rnd = random.Random(3)
    box(1.0, -0.6, B, 13.6, 4.8, 0.03, '#8f887c', bevel=0)   # (the bed the cobbles sit in)
    for i in range(70): box(rnd.uniform(-5.5, 7.5), rnd.uniform(-2.8, 1.6), B, rnd.uniform(0.5, 0.8), rnd.uniform(0.45, 0.7), 0.04 + i * 0.0006, '#b9b2a6' if rnd.random() < 0.6 else '#a59e92', rot=rnd.uniform(0, 0.4), bevel=0.04)
    for x, y, s in ((-12, 12, 1.4), (-11, 2, 1.1), (13, 12, 1.3), (14, 2, 1.0), (12, -7, 1.2)): tree(x, y, B if abs(x) < 12.5 else 0, s, col='#2f5a35' if night else '#3f7a3a')
    # ---- walls: stone ground storey, plaster and timber above
    keepW = not cut
    for (a, b, side) in (((X0, Y1), (X1, Y1), 'back'), ((X1, Y0), (X1, Y1), 'east'), ((X0, Y0), (X0, Y1), 'west'), ((X0, Y0), (X1, Y0), 'front')):
        if cut and side in ('front', 'west'): continue
        if side in ('front', 'back'):
            y = a[1] + (0 if side == 'back' else -0.35)
            if side == 'front':
                for (u0, u1) in ((X0, -3.3), (-0.2, 0.6), (3.0, X1)): stone_wall(u0, u1, y, B, B + UP, seed=41)
                stone_wall(-3.3, -0.2, y, B, B + 0.8, seed=42)            # under the big window
                stone_wall(0.6, 3.0, y, B + 2.5, B + UP, seed=43)          # over the door
            else: stone_wall(X0, X1, y, B, B + UP, seed=44)
            box(0, a[1] + (0.1 if side == 'back' else -0.1), B + UP, X1 - X0, 0.2, EAVE - UP, PLA, bevel=0)
        else:
            x = a[0] + (0 if side == 'east' else -0.35)
            stone_wall(Y0, Y1, x, B, B + UP, seed=45 if side == 'east' else 46, axis='y')
            box(a[0] + (0.1 if side == 'east' else -0.1), (Y0 + Y1) / 2, B + UP, 0.2, Y1 - Y0, EAVE - UP, PLA, bevel=0)
            xo = a[0] + (0.22 if side == 'east' else -0.22)
            for y in (Y0, 4.0, 6.0, 8.0, Y1): beam((xo, y, B + UP), (xo, y, B + EAVE), 0.18, TIM)
            beam((xo, Y0, B + UP), (xo, Y1, B + UP), 0.24, TIM); beam((xo, Y0, B + EAVE), (xo, Y1, B + EAVE), 0.22, TIM)
            for (ya, yb) in ((Y0, 4.0), (6.0, 4.0), (6.0, 8.0), (Y1, 8.0)): beam((xo, ya, B + UP), (xo, yb, B + EAVE), 0.12, TIM)
    if not cut:
        yo = Y0 - 0.22
        for x in (X0, -2.4, 0, 2.4, X1): beam((x, yo, B + UP), (x, yo, B + EAVE), 0.18, TIM)
        beam((X0, yo, B + UP), (X1, yo, B + UP), 0.26, TIM); beam((X0, yo, B + EAVE), (X1, yo, B + EAVE), 0.24, TIM)
        for (xa, xb) in ((X0, -2.4), (2.4, X1)): beam((xa, yo, B + UP), (xb, yo, B + EAVE), 0.12, TIM)
        gable(X0 - 0.1, X1 + 0.1, Y0 - 0.2, B + EAVE, B + RIDGE, PLA)
        for x in (-1.8, 1.8): beam((x, Y0 - 0.3, B + EAVE), (0, Y0 - 0.3, B + RIDGE - 0.3), 0.14, TIM)
        window(-1.2, Y0 - 0.2, B + UP + 0.5, 1.0, 1.4, TIM, emit=1.5 if night else 0, glass='#ffd9a0' if night else '#bcd8e6')   # the girls' loft windows
        window(1.2, Y0 - 0.2, B + UP + 0.5, 1.0, 1.4, TIM, emit=1.5 if night else 0, glass='#ffd9a0' if night else '#bcd8e6')
        window(0, Y0 - 0.2, B + EAVE + 0.7, 0.8, 1.0, TIM)
        # the big shop window (the oven glowing behind it), the door, the sign with its mountain peak
        win_glass = '#2a1640' if night else '#d6e6ee'
        window(-1.75, Y0 - 0.36, B + 0.8, 3.1, 1.7, TIM, glass=win_glass, emit=0.6 if night else 0)
        box(1.8, Y0 - 0.38, B, 1.2, 0.1, 2.4, '#5a3e28', bevel=0.02); ball(1.35, Y0 - 0.48, B + 1.15, 0.05, '#c9a24a')
        beam((1.1, Y0 - 0.4, B + 2.45), (2.5, Y0 - 0.4, B + 2.45), 0.14, TIM)
        box(0, Y0 - 0.5, B + UP - 0.15, 7.6, 0.14, 1.25, '#7a5a3c', bevel=0.06); box(0, Y0 - 0.58, B + UP - 0.05, 7.2, 0.08, 1.05, '#f1e2b8', bevel=0.04)
        mesh([(-1.2, Y0 - 0.55, B + UP + 1.05), (0, Y0 - 0.55, B + UP + 1.75), (1.2, Y0 - 0.55, B + UP + 1.05)], [(0, 1, 2), (2, 1, 0)], '#7a5a3c')
        mesh([(-0.85, Y0 - 0.6, B + UP + 1.1), (0, Y0 - 0.6, B + UP + 1.62), (0.85, Y0 - 0.6, B + UP + 1.1)], [(0, 1, 2), (2, 1, 0)], '#8f9aa6')
        mesh([(-0.32, Y0 - 0.62, B + UP + 1.42), (0, Y0 - 0.62, B + UP + 1.62), (0.32, Y0 - 0.62, B + UP + 1.42)], [(0, 1, 2), (2, 1, 0)], '#ffffff')
        text('SUMMIT SLICE', 0.5, Y0 - 0.64, B + UP + 0.4, 0.5, '#b8372e', ext=0.05)
        text('Traditional Pizza, run by Zoe & Asha', 0.5, Y0 - 0.64, B + UP + 0.06, 0.2, '#3a2a1c', ext=0.02)
        cyl(-2.95, Y0 - 0.64, B + UP + 0.48, 0.32, 0.04, '#e8a33a', rot=(math.pi / 2, 0, 0), seg=24)
        for a in range(5): ball(-2.95 + 0.17 * math.cos(a * 1.26), Y0 - 0.68, B + UP + 0.48 + 0.17 * math.sin(a * 1.26), 0.06, '#b8372e', sy=0.4)
        # the chalkboard, outdoor tables and stools, planters
        box(-4.1, Y0 - 0.5, B + 0.6, 1.0, 0.08, 1.4, '#5a3e28', bevel=0.03); box(-4.1, Y0 - 0.55, B + 0.68, 0.86, 0.04, 1.24, '#2b2d2e', bevel=0)
        text('DAILY SLICES', -4.1, Y0 - 0.58, B + 1.7, 0.11, '#f4f2ea', ext=0.003)
        for k in range(4): box(-4.1, Y0 - 0.58, B + 0.95 + k * 0.17, 0.6, 0.005, 0.03, '#d9d4c8', bevel=0)
        for (tx, ty) in ((-2.6, -0.6), (0.2, -1.4), (3.6, -0.8)):
            cyl(tx, ty, B, 0.06, 0.75, '#5a3e28', seg=10); box(tx, ty, B + 0.75, 1.0, 0.8, 0.07, '#8a6240', bevel=0.02)
            for (sx, sy) in ((-0.75, 0), (0.75, 0), (0, -0.65)): cyl(tx + sx, ty + sy, B, 0.2, 0.45, '#7a5a3c', seg=12)
        if night:
            for (tx, ty) in ((-2.6, -0.6), (3.6, -0.8)): ball(tx, ty, B + 0.86, 0.05, '#ffcc66', emit=8)
        flowers(-5.0, 1.0, B, 1.0, seed=3); flowers(5.0, 1.4, B, 0.9, seed=6)
        cyl(-4.3, 0.6, B, 0.05, 2.6, '#5a3e28', seg=8)
        mesh([(-4.3, 0.6, B + 2.55), (-3.4, 0.6, B + 2.55), (-3.4, 0.6, B + 1.6), (-3.85, 0.6, B + 1.9), (-4.3, 0.6, B + 1.6)], [(0, 4, 3, 2, 1), (1, 2, 3, 4, 0)], '#8a2f4a')
        roof(X0, X1, Y0, Y1, B + EAVE, B + RIDGE, '#566069', over=0.6, moss=MOSS, seed=2)
        # a dormer on the east slope
        box(2.6, 6.0, B + EAVE + 0.4, 1.4, 1.4, 1.3, PLA, bevel=0.02); window(2.6, 5.28, B + EAVE + 0.6, 0.7, 0.8, TIM, emit=1.2 if night else 0, glass='#ffd9a0' if night else '#bcd8e6')
        roof(1.8, 3.4, 5.3, 6.7, B + EAVE + 1.7, B + EAVE + 2.3, '#566069', over=0.15, moss=None)
    # ---- the annex (east): stone, lean-to roof, the loft entrance and the lounge's door
    AX0, AX1, AY0, AY1 = X1, X1 + 3.4, 2.8, 8.5
    if not cut:
        stone_wall(AX0, AX1, AY0 - 0.35, B, B + 3.6, seed=51); stone_wall(AY0, AY1, AX1, B, B + 3.0, seed=52, axis='y')
        rv = [(AX0, AY0 - 0.6, B + 3.95), (AX1 + 0.45, AY0 - 0.6, B + 3.05), (AX1 + 0.45, AY1 + 0.4, B + 3.05), (AX0, AY1 + 0.4, B + 3.95)]
        mesh(rv + [(x, y, z + 0.16) for (x, y, z) in rv], [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], '#566069')   # the lean-to roof, high at the house
        for k in range(10): u = rnd.uniform(0.3, 3.2); ball(AX0 + u, rnd.uniform(AY0 - 0.3, AY1), B + 4.12 - 0.9 * u / 3.85, rnd.uniform(0.18, 0.35), MOSS, sz=0.35)
        box(6.2, AY0 - 0.4, B, 1.1, 0.1, 2.3, '#3a3236', bevel=0.02); beam((5.55, AY0 - 0.45, B + 2.35), (6.85, AY0 - 0.45, B + 2.35), 0.14, TIM)
        box(6.2, AY0 - 0.48, B + 1.15, 0.7, 0.04, 0.85, '#1a0f2a', emit=0, bevel=0.02)
        text('SUMMIT', 6.2, AY0 - 0.51, B + 1.65, 0.14, '#ff6fd8', emit=6 if night else 2.5, ext=0.01)
        text('LOUNGE', 6.2, AY0 - 0.51, B + 1.47, 0.14, '#ff6fd8', emit=6 if night else 2.5, ext=0.01)
        text('Adults only, 21+', 6.2, AY0 - 0.51, B + 1.25, 0.07, '#b48cff', emit=5 if night else 2, ext=0.005)
        mesh([(5.95, AY0 - 0.52, B + 1.85), (6.2, AY0 - 0.52, B + 1.97), (6.45, AY0 - 0.52, B + 1.85)], [(0, 1, 2), (2, 1, 0)], '#b48cff', emit=4)
        box(6.2, AY0 - 0.5, B + 2.6, 1.8, 0.1, 0.45, '#7a5a3c', bevel=0.04); text('LOFT ENTRANCE', 6.2, AY0 - 0.56, B + 2.7, 0.16, '#f1e2b8', ext=0.01)
        if night: lamp(6.2, AY0 - 1.2, B + 1.6, 30, (1, 0.4, 0.9), 0.3)
    # ---- inside
    box(0, (Y0 + Y1) / 2, B, X1 - X0, Y1 - Y0, 0.06, '#3a2a40' if night else '#a8805a', bevel=0)
    rnd2 = random.Random(8)
    for i in range(60): box(rnd2.uniform(X0 + 0.3, X1 - 0.3), rnd2.uniform(Y0 + 0.3, Y1 - 0.3), B + 0.06, 0.6, 0.5, 0.008 + i * 0.0002, ('#4a3656' if night else '#b9906a') if rnd2.random() < 0.5 else ('#2f2238' if night else '#9a7652'), rot=rnd2.uniform(0, 0.5), bevel=0)
    BOOTH = '#5a2f7a' if night else '#a0472f'
    for y in (3.2, 5.0, 6.8):   # booths along the west wall
        box(X0 + 0.55, y, B, 0.9, 0.12, 1.15, BOOTH, bevel=0.05); box(X0 + 0.55, y + 0.95, B, 0.9, 0.12, 1.15, BOOTH, bevel=0.05)
        box(X0 + 0.55, y + 0.15, B, 0.9, 0.38, 0.45, BOOTH, bevel=0.05); box(X0 + 0.55, y + 0.8, B, 0.9, 0.38, 0.45, BOOTH, bevel=0.05)
        box(X0 + 0.55, y + 0.475, B + 0.72, 0.85, 0.42, 0.06, '#6b4a2b'); cyl(X0 + 0.55, y + 0.475, B, 0.05, 0.72, '#3a2a1c', seg=8)
        if night: ball(X0 + 0.55, y + 0.475, B + 0.85, 0.05, '#7dffef', emit=10)
    # the counter and till, the stone oven with its fire, the menu board
    box(1.4, 5.0, B, 3.0, 0.9, 1.05, '#4a2f5a' if night else '#7a5a3c', bevel=0.03); box(1.4, 5.0, B + 1.05, 3.2, 1.0, 0.07, '#2b2326' if night else '#8a6240')
    box(0.6, 5.0, B + 1.12, 0.5, 0.35, 0.22, '#b8bec6', bevel=0.03); box(0.6, 4.95, B + 1.34, 0.42, 0.06, 0.3, '#7dffef' if night else '#2b3a4e', emit=3 if night else 0)
    if night: text('UV', 1.6, 4.48, B + 0.45, 0.35, '#7dffef', emit=8, ext=0.01)
    ox, oy = 3.0, 8.8
    stone_wall(oy - 1.0, Y1, X1 - 0.4, B, B + 1.0, seed=61, axis='y', th=0.2)
    cyl(ox, oy, B, 1.15, 1.0, '#8c877e', seg=16); ball(ox, oy, B + 1.0, 1.1, '#9a958c', sz=0.85)
    cyl(ox + 0.3, oy + 0.3, B + 1.5, 0.35, 3.8, '#8c877e', seg=10)
    ball(ox - 0.2, oy - 0.75, B + 1.15, 0.42, '#1a0f0a', sz=0.75, sy=0.5)
    if not night:
        ball(ox - 0.15, oy - 0.65, B + 1.05, 0.28, '#ff8a2a', emit=12, sz=0.6, sy=0.5); lamp(ox - 0.3, oy - 1.3, B + 1.2, 80, (1, 0.55, 0.2), 0.3)
    box(0.4, Y1 - 0.1, B + 1.6, 1.8, 0.06, 1.2, '#5a3e28', bevel=0.03); box(0.4, Y1 - 0.14, B + 1.68, 1.64, 0.04, 1.04, '#2b2d2e', bevel=0)
    text('MENU' if not night else 'SUMMIT SLICES', 0.4, Y1 - 0.17, B + 2.45, 0.16, '#f4f2ea' if not night else '#ff6fd8', emit=0 if not night else 5, ext=0.003)
    # the curved stair to the loft (back west), the loft over the back half with its rail, sofa, TV, shelf
    spiral(-2.6, 7.4, B, 1.15, B + LOFT, '#7a5a3c', n=13, turn=0.6, start=0)
    LY0 = 6.2; ZL = B + LOFT
    box(0, (LY0 + Y1) / 2, ZL - 0.2, X1 - X0, Y1 - LY0, 0.2, '#7a5a3c', bevel=0); beam((X0, LY0, ZL - 0.1), (X1, LY0, ZL - 0.1), 0.24, TIM)
    railing((-1.3, LY0 + 0.1), (X1 - 0.1, LY0 + 0.1), ZL)
    box(1.6, 9.4, ZL, 2.2, 0.8, 0.45, '#8a5aa8', bevel=0.08); box(1.6, 9.75, ZL, 2.2, 0.25, 0.95, '#8a5aa8', bevel=0.08)
    box(-1.0, Y1 - 0.15, ZL + 0.8, 1.1, 0.06, 0.7, '#1b1d22', emit=0.5 if night else 0)
    box(3.6, Y1 - 0.3, ZL, 1.0, 0.4, 1.8, '#6b4a2b'); [box(3.6, Y1 - 0.38, ZL + 0.3 + k * 0.45, 0.9, 0.3, 0.3, random.choice(['#b8372e', '#3f8fd9', '#e8b04a', '#6b8f3a']), bevel=0.02) for k in range(3)]
    for k in range(3): box(-3.6 + k * 0.6, Y1 - 0.08, B + 2.0 + (k % 2) * 0.3, 0.4, 0.03, 0.5, '#c9a24a', bevel=0.02)
    if not night:
        figure(1.0, 5.9, B, '#2b2326', '#2b2326', '#f08fb5', skin='#f3dccb')     # Zoe (pink hair) tossing dough
        ball(1.0, 5.6, B + 2.0, 0.28, '#f1dca0', sz=0.15)
        figure(2.3, 5.9, B, '#5a3f8a', '#2b2326', '#16141c', skin='#e0b48f')     # Asha with her tablet
        for (x, y, c) in ((-2.0, 4.0, '#3f8fd9'), (-3.0, 5.8, '#e0564a')): figure(x, y, B, c, '#3a3f47', '#5a3a24', s=0.75)   # a family's kids
        figure(-1.0, 3.6, B, '#6b8f3a', '#2b3a4e', '#7a5a3c')
        lamp(0, 5.0, B + 3.0, 220, (1, 0.88, 0.7), 0.8); lamp(0, 3.0, B + 3.0, 120, (1, 0.88, 0.7), 0.8)
    else:
        # the Summit Lounge: black light, neon, a DJ booth, beams, adults dancing
        box(-1.6, Y1 - 0.12, B + 2.1, 2.2, 0.04, 0.9, '#140a20', bevel=0)
        text('SUMMIT', -1.6, Y1 - 0.16, B + 2.55, 0.28, '#5fd8ff', emit=10, ext=0.01); text('LOUNGE', -1.6, Y1 - 0.16, B + 2.2, 0.28, '#5fd8ff', emit=10, ext=0.01)
        box(-1.0, 7.4, B, 1.6, 0.7, 1.05, '#1b1d22', bevel=0.03); box(-1.0, 7.4, B + 1.05, 1.7, 0.8, 0.05, '#2b2d33')
        for sg in (-1, 1): cyl(-1.0 + sg * 0.45, 7.4, B + 1.1, 0.18, 0.05, '#7dffef', emit=6)
        figure(-1.0, 7.9, B, '#2b2326', '#2b2326', '#2b2326', skin='#c98e62')     # the DJ
        for (x, z, c) in ((-3.8, 2.6, '#ff6fd8'), (3.8, 2.4, '#7dffef')): box(x, Y1 - 0.12, B + z - 0.6, 0.9, 0.03, 0.6, c, emit=6, bevel=0)
        for k, c in enumerate(['#7dff6a', '#ff4fd8', '#5fd8ff', '#7dff6a', '#ff4fd8']):
            beam((-1.0, 7.3, B + 1.4), (-4.0 + k * 1.9, 1.8, B + 3.4 - (k % 2) * 1.2), 0.025, c)
            bpy.context.active_object.data.materials[0] = mat(hexc(c), 18)
        for (x, y, top, hair) in ((-1.8, 4.0, '#ff4fd8', '#16141c'), (-0.6, 3.4, '#7dffef', '#7a5a3c'), (0.2, 4.4, '#b48cff', '#e8b04a'), (-2.6, 3.0, '#2b2326', '#f08fb5'), (-0.4, 2.6, '#ff8a3a', '#2b2326')):
            figure(x, y, B, top, '#1b1d22', hair, skin='#d9a77f')
        figure(1.0, 5.9, B, '#1b1d22', '#1b1d22', '#f08fb5', skin='#f3dccb'); figure(2.3, 5.9, B, '#1b1d22', '#1b1d22', '#16141c', skin='#e0b48f')
        for (x, y, c) in ((-2.2, 3.4, (0.6, 0.2, 1)), (1.5, 3.0, (1, 0.25, 0.85)), (-1.0, 6.0, (0.3, 0.9, 1)), (2.5, 8.0, (0.6, 0.2, 1))): lamp(x, y, B + 2.6, 160, c, 0.5)
        lamp(0, 8.0, ZL + 1.8, 60, (0.7, 0.3, 1), 0.5)

which = sys.argv[1] if len(sys.argv) > 1 else 'all'
if which in ('all', 'ext'):
    build(False, False); sky('#a8d4ef', 1.0); sun(3.0, (0.95, 0, 0.6)); cam((13, -14, 7.0), (0.5, 4.0, 3.4), 30); render('concepts/v2_slice_exterior.png')
if which in ('all', 'extnight'):
    build(True, False); sky('#141a3a', 0.25); sun(0.12, (0.9, 0, 0.6), (0.6, 0.7, 1)); cam((13, -14, 7.0), (0.5, 4.0, 3.4), 30); render('concepts/v2_slice_exterior_night.png')
if which in ('all', 'day'):
    build(False, True); sky('#a8d4ef', 1.0); sun(2.4, (0.8, 0, 0.5)); cam((-10.5, -7.5, 10.5), (0.6, 6.0, 1.8), 30); render('concepts/v2_slice_day.png')
if which in ('all', 'night'):
    build(True, True); sky('#0c0a1a', 0.08); cam((-10.5, -7.5, 10.5), (0.6, 6.0, 1.8), 30); render('concepts/v2_slice_night.png')
