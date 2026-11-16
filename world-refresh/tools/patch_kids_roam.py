"""Tess and Rudy roam town (world-refresh test game, Andrew 2026-11-16: "Take the two kids that are playing in the area and turn them
into roaming npcs that play games around town together"). The two kids who played catch on the old Unstable Unicorns lawn (park.js,
removed with the lawn by make_testgame.py) walk the trails and sidewalks together and stop at the fun spots to play catch, tag, jump
rope, rock-paper-scissors or hide-and-seek round a tree. All of it is a pure function of the shared clock: tools/kids-roam.js.
Usage: python3 patch_kids_roam.py OUT   (make_testgame.py runs it on the built copy)."""
import os, sys, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
J = os.path.join(OUT, 'js')

shutil.copy(os.path.join(HERE, 'kids-roam.js'), os.path.join(J, 'kids-roam.js'))

def patch(name, pairs):
    p = os.path.join(J, name); t = open(p).read()
    for a, b in pairs:
        assert t.count(a) == 1, (name, a)
        t = t.replace(a, b, 1)
    open(p, 'w').write(t)

# the feature: made after the park (so its sounds, the giggle among them, are registered) and the town's folk
patch('main.js', [
    ("import { createPark } from './park.js';", "import { createPark } from './park.js';\nimport { createKidsRoam } from './kids-roam.js';   // (world-refresh: Tess and Rudy roam town, tools/patch_kids_roam.py)"),
    ("createTownLife, createPark,", "createTownLife, createPark, createKidsRoam,"),
])

# the yard's gates swing open for them as they do for the neighbours (ctx.kidsRoam.walkers(): their drawn positions)
patch('gates.js', [
    ("        for (const d of ctx.npcs?.npcs || []) { // neighbours heading home through it (the dogs never come this close: they stay in YARD)",
     "        for (const p of ctx.kidsRoam?.walkers() || []) if (!st.open && near(st, p.x, p.z, 1.8)) set(st, true); // (world-refresh: Tess and Rudy, kids-roam.js)\n"
     "        for (const d of ctx.npcs?.npcs || []) { // neighbours heading home through it (the dogs never come this close: they stay in YARD)"),
    ("        const busy = near(st, px, pz, 3) ||", "        const busy = near(st, px, pz, 3) || (ctx.kidsRoam?.walkers() || []).some(p => near(st, p.x, p.z, 2.5)) ||"),
])
print('patch_kids_roam: Tess and Rudy roam town')
