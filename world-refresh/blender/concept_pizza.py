"""Concept: Summit Slice / Peak Pizza - a round pizza diner by day that becomes a flying-saucer party restaurant at night.
/tmp/bvenv/bin/python blender/concept_pizza.py   -> concepts/pizza_day.png, pizza_night.png, pizza_interior_night.png"""
import sys, math, os; sys.path.insert(0, 'blender'); from kit import *
RED, CREAM, CHROME, TEAL, GOLD, GREEN = '#c7392f', '#f3ead8', '#c9ced6', '#2f8f8a', '#e9b949', '#3f9a5a'
R = 8.0
def waitress(x, y, z, night, hair='#e9d6a0', skin='#e0b48f', tray=True):
    top, bottom = (GREEN, '#1e1e24') if night else (RED, '#f3ead8')
    person(x, y, z, top, bottom, skin=skin, hair=hair, skirt=True, shoes='#1e1e24' if night else '#ffffff')
    if not night: box(x, y - 0.17, z + 0.42, 0.26, 0.03, 0.4, '#ffffff', bevel=0.01)          # day: a white apron
    if tray: cyl(x - 0.42, y, z + 0.98, 0.3, 0.03, CHROME, rough=0.3); cyl(x - 0.42, y, z + 1.01, 0.25, 0.03, '#e9a94a'); cyl(x - 0.42, y, z + 1.03, 0.21, 0.015, '#c7392f')
def build(night, cut=False):
    reset(); E = 1 if night else 0
    box(0, 0, -0.2, 90, 90, 0.2, '#3d5f3a' if night else '#7fbf5a', bevel=0); cyl(0, 0, -0.05, R + 4.5, 0.1, '#55585f' if night else '#b9b4aa', seg=64)
    lift = 1.6 if night else 0.0                                         # at night the whole saucer rises on its landing legs
    z0 = 0.5 + lift
    # the landing legs / base: by day it sits on a brick drum, at night chrome legs show and light pours out underneath
    cyl(0, 0, 0, 2.6, z0, '#8a4a3a' if not night else '#3a3f4a', seg=48)
    for i in range(6):
        a = i * math.pi / 3 + 0.3; cyl(math.cos(a) * 6.2, math.sin(a) * 6.2, 0, 0.16, z0 + 0.3, CHROME, rough=0.25); cyl(math.cos(a) * 6.2, math.sin(a) * 6.2, 0, 0.5, 0.1, CHROME, rough=0.25)
    if night:
        cyl(0, 0, 0.02, 3.4, 0.03, '#9fffe0', emit=5, seg=48); cyl(0, 0, 0.3, 2.9, lift + 0.2, (0.6, 1, 0.9), emit=0.6, alpha=0.12, r2=2.4, seg=48)   # the beam
        for i in range(24): a = i * math.pi / 12; ball(math.cos(a) * 3.2, math.sin(a) * 3.2, z0 - 0.05, 0.1, ['#ff5fa2', '#5fd0ff', '#ffe45f'][i % 3], emit=12)
    # the saucer: lower dish, the window ring, the brim, the dome
    cyl(0, 0, z0, 4.0, 0.9, CHROME, r2=R, seg=96, rough=0.3)                                   # lower dish
    cyl(0, 0, z0 + 0.9, R, 0.14, RED, seg=96)                                                  # floor rim
    if not cut:
        cyl(0, 0, z0 + 1.0, R - 0.25, 2.5, (0.75, 0.92, 1.0) if not night else (1.0, 0.75, 0.9), seg=96, alpha=0.22, rough=0.05, emit=0.5 * E)   # glass ring
        for i in range(24): a = i * math.pi / 12; box(math.cos(a) * (R - 0.25), math.sin(a) * (R - 0.25), z0 + 1.0, 0.14, 0.14, 2.5, CHROME, rot=a, rough=0.3)
        cyl(0, 0, z0 + 3.5, R + 0.9, 0.35, RED, r2=R + 0.2, seg=96); torus(0, 0, z0 + 3.5, R + 0.9, 0.12, CHROME, rough=0.25)
        for i in range(36):
            a = i * math.pi / 18; ball(math.cos(a) * (R + 0.92), math.sin(a) * (R + 0.92), z0 + 3.5, 0.13, ['#ffe45f', '#ff5fa2', '#5fd0ff'][i % 3] if night else '#fff3c4', emit=14 * E + 0.3)
        cyl(0, 0, z0 + 3.85, R + 0.2, 1.0, CREAM, r2=4.2, seg=96); ball(0, 0, z0 + 4.85, 4.2, (0.7, 0.95, 1.0) if not night else (0.6, 1.0, 0.85), sz=0.55, alpha=0.35, rough=0.05, emit=0.9 * E)   # the dome
        cyl(0, 0, z0 + 7.0, 0.06, 1.6, CHROME); ball(0, 0, z0 + 8.7, 0.28, '#ff5f5f', emit=10 * E + 0.5)
        # the sign: a pizza on the brim, the name (day: SUMMIT SLICE, night: PEAK PIZZA in neon)
        cyl(0, -R - 0.75, z0 + 4.3, 1.1, 0.14, '#e9a94a', rot=(math.pi / 2 - 0.25, 0, 0), emit=0.6 * E); cyl(0, -R - 0.84, z0 + 4.3, 0.9, 0.1, '#c7392f', rot=(math.pi / 2 - 0.25, 0, 0), emit=1.0 * E)
        for i in range(6): a = i * 1.05; ball(0 + 0.5 * math.cos(a), -R - 0.92, z0 + 4.3 + 0.5 * math.sin(a), 0.13, '#f6e7a0', emit=2 * E)
        text('PEAK PIZZA' if night else 'SUMMIT SLICE', 0, -R - 0.98, z0 + 2.95 + 0.72, 0.62, '#9fffe0' if night else CREAM, emit=9 * E, ext=0.06)
        # the ramp / steps up to the door
        for i in range(int(4 + lift / 0.25)): box(0, -R - 0.6 - i * 0.42, 0, 2.4, 0.44, (z0 + 0.95) - (i + 1) * 0.25, CHROME if night else '#b9895a', rough=0.35)
        box(0, -R + 0.05, z0 + 1.0, 1.7, 0.1, 2.3, RED); box(0, -R - 0.02, z0 + 1.8, 0.9, 0.04, 0.9, (0.8, 0.95, 1), alpha=0.3, rough=0.05, emit=1.5 * E)
    # inside: checker floor, round bar in the middle with the pizza oven, booths round the windows, a dance floor at night
    cyl(0, 0, z0 + 0.98, R - 0.3, 0.05, '#f3ead8', seg=96)
    for i in range(-7, 8):
        for j in range(-7, 8):
            if (i + j) % 2 == 0 and (i * i + j * j) < 46: box(i * 1.05, j * 1.05, z0 + 1.03, 1.05, 1.05, 0.01, '#2b2b30' if not night else ['#ff5fa2', '#5fd0ff', '#ffe45f', '#9fffe0'][(i * 3 + j) % 4], bevel=0, emit=(1.6 if (i * i + j * j) < 14 else 0.25) * E)
    zf = z0 + 1.04
    cyl(0, 3.2, zf, 2.3, 1.05, RED, seg=48); cyl(0, 3.2, zf + 1.05, 2.45, 0.08, CHROME, rough=0.25, seg=48)                # round bar
    ball(0, 3.4, zf + 1.1, 1.0, '#b5452f', sz=0.9); box(0, 2.62, zf + 1.3, 0.8, 0.5, 0.45, '#2b2b30', emit=0); box(0, 2.45, zf + 1.36, 0.6, 0.1, 0.3, '#ff9a3a', emit=6)   # dome oven, fire
    for i in range(6): a = math.pi + (i - 2.5) * 0.4; cyl(math.cos(a) * 3.1, 3.2 + math.sin(a) * 3.1, zf, 0.2, 0.7, CHROME, rough=0.3); cyl(math.cos(a) * 3.1, 3.2 + math.sin(a) * 3.1, zf + 0.7, 0.26, 0.1, RED)   # stools
    for i in range(9):
        a = math.pi * (1.15 + i * 0.2125); bx, by = math.cos(a) * (R - 1.5), math.sin(a) * (R - 1.5)
        if abs(bx) < 1.4 and by < 0: continue
        cyl(bx, by, zf, 0.55, 0.75, CHROME, rough=0.3); cyl(bx, by, zf + 0.75, 0.75, 0.06, CREAM); cyl(bx, by, zf + 0.81, 0.32, 0.03, '#e9a94a')
        for sg in (-1, 1): a2 = a + sg * 0.13; box(math.cos(a2) * (R - 1.2), math.sin(a2) * (R - 1.2), zf, 0.5, 1.0, 0.9, TEAL if not night else '#7a3fb0', rot=a2 + math.pi / 2, bevel=0.12)
    if night:
        box(-4.2, -2.4, zf, 1.6, 0.9, 1.0, '#2b2b30'); box(-4.2, -2.4, zf + 1.0, 1.7, 1.0, 0.06, CHROME); cyl(-4.5, -2.4, zf + 1.07, 0.3, 0.03, '#1e1e24'); cyl(-3.9, -2.4, zf + 1.07, 0.3, 0.03, '#1e1e24')   # DJ decks
        person(-4.2, -1.8, zf, '#7a3fb0', '#1e1e24', hair='#3fd0c0'); ball(0, 0, zf + 3.6, 0.45, CHROME, rough=0.1); lamp(0, 0, zf + 2.9, 500, (1, 0.5, 0.9)); lamp(3, -2, zf + 2.4, 300, (0.4, 0.8, 1)); lamp(-3, 2, zf + 2.4, 300, (1, 0.9, 0.4))
        for px, py, h in [(-1.2, -1.0, '#7a5234'), (1.0, -0.4, '#2b2b30'), (0.1, -2.2, '#e9d6a0'), (2.2, -2.4, '#c7392f')]: person(px, py, zf, ['#ff5fa2', '#5fd0ff', '#ffe45f', '#ffffff'][int(abs(px * 3)) % 4], '#1e1e24', hair=h, skirt=px > 0.5)
        waitress(3.4, 0.6, zf, True, hair='#e9d6a0'); waitress(-2.6, 0.8, zf, True, hair='#2b2b30', skin='#b98a62')
    else:
        lamp(0, 0, zf + 2.6, 500); waitress(3.0, -0.6, zf, False, hair='#e9d6a0'); waitress(-2.6, 0.8, zf, False, hair='#2b2b30', skin='#b98a62'); person(1.0, -4.9, zf, '#3f6fa8', '#c9b58a')
    if not cut:   # outside: parked scooter, lamps, people, the two uniforms shown by the steps
        for sx in (-1, 1): cyl(sx * 7.5, -10.5, 0, 0.08, 3.4, '#2b3340'); ball(sx * 7.5, -10.5, 3.5, 0.25, '#ffd98a', emit=10 * E + 0.5); (lamp(sx * 7.5, -10.5, 3.2, 400) if night else None)
        waitress(-3.2, -11.6, 0, night, hair='#e9d6a0'); waitress(3.4, -11.9, 0, night, hair='#2b2b30', skin='#b98a62')
        person(0.6, -12.6, 0, '#e9b949', '#3f5f8f', hair='#7a5234'); 
        for sx in (-1, 1): cyl(sx * 10.5, -6, 0, 0.5, 0.9, '#8a4a3a'); ball(sx * 10.5, -6, 1.4, 0.9, '#3f7a3a' if night else '#4f9a3e')
        if night: 
            for i in range(40): ball(-40 + (i * 37 % 80), 30 + (i * 13 % 25), 14 + (i * 7 % 22), 0.12, '#ffffff', emit=30)
which = os.environ.get('ONLY', 'all')
if which in ('all', 'day'): build(False); sky('#bfe0f5', 1.0); sun(3.2, (0.95, 0, -0.5)); cam((15, -24, 7.5), (0, -1.5, 3.4), 32); render('concepts/pizza_day.png')
if which in ('all', 'night'): build(True); sky('#141a3a', 0.35); sun(0.15, (0.9, 0, 0.6), (0.6, 0.7, 1)); cam((15, -24, 6.0), (0, -1.5, 4.6), 32); render('concepts/pizza_night.png')
if which in ('all', 'int'): build(True, cut=True); sky('#141a3a', 0.5); sun(0.5, (0.7, 0, 0.9), (0.7, 0.8, 1)); cam((9, -13, 13.5), (0, 0.6, 3.2), 30); render('concepts/pizza_interior_night.png')
