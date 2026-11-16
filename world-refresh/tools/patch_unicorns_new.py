"""The new unicorns (world-refresh 2026-11-16, Andrew: "The unicorn models broke. Make new ones that look even more cartoony.")

Run by make_testgame.py on the built copy:  python3 patch_unicorns_new.py OUT

- js/unicorn.js is replaced by tools/unicorn-toy.js: chunky toy unicorns (big round head, big eyes, short thick legs, puffy
  mane and tail, a bold horn) in strong cel colours on one vertex-coloured toon material, inked as one solid. Same class, same
  options and the same rig, gait and poses, so npcs.js, crowd.js, dogs-brain.js, the neighs and the NPC Editor work as before.
  (Why the old ones broke: pastel coats on a lifted shadow ramp went near white in the sun, and the test game's vibrant grade
  blooms whatever is brighter than ~0.72, so they read as washed-out, see-through ghosts; their long thin legs and ribbon
  manes broke up at a distance.)
- The Unstable Unicorns area (areas.js THEMES.unicorns) gets its unicorns back without ?oldworld: Sprinkles, Moonpie, Clover,
  Noodle and Bean (not the Party Kid). Where they stand is the usual shared beat plan (npcs.js), so every screen agrees; the
  spots the plan picks round the area's centre are mapped into an ellipse on the lawn in front of the diorama (spec.roam), so
  they wander, graze and prance in front of it and its stone path and never stand in its rocks. The ellipse is convex and the
  walks between spots are straight, so no walk crosses the diorama either.
- tools/unicorn_test.html is copied to the root (a test bench: the five side by side, a turntable, the poses).
"""
import os, sys, shutil

OUT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))

shutil.copy(os.path.join(HERE, 'unicorn-toy.js'), os.path.join(OUT, 'js/unicorn.js'))
shutil.copy(os.path.join(HERE, 'unicorn_test.html'), os.path.join(OUT, 'unicorn_test.html'))

# ---- the area: the five unicorns, and the lawn they keep to
p = os.path.join(OUT, 'js/areas.js'); t = open(p).read()
a = "    npcs: !NOUNI ? [] : [\n      npcSpec('sprinkles'), npcSpec('moonpie'), npcSpec('clover'), npcSpec('partykid'), npcSpec('noodle'), npcSpec('bean'),"
assert t.count(a) == 1, 'unicorn npcs'
t = t.replace(a, "    npcs: !NOUNI ? ['sprinkles', 'moonpie', 'clover', 'noodle', 'bean'].map(id => npcSpec(id)) : [\n      npcSpec('sprinkles'), npcSpec('moonpie'), npcSpec('clover'), npcSpec('partykid'), npcSpec('noodle'), npcSpec('bean'),", 1)
# the lawn in front of the diorama: an ellipse 2 m in front of the area's centre (fx, fz: the way the diorama faces),
# a m deep along that way and b m to each side (npcs.js roamFit maps the beat plan's spots into it)
a = "    promptAt: NOUNI ? null : { x: uniPortal[0], z: uniPortal[1] },"
assert t.count(a) == 1, 'promptAt'
t = t.replace(a, "    roam: NOUNI ? null : { x: x + Math.sin(uf) * 2.2, z: z + Math.cos(uf) * 2.2, fx: Math.sin(uf), fz: Math.cos(uf), a: 6.2, b: 8.5 },   // (the new unicorns' lawn: patch_unicorns_new.py)\n" + a, 1)
open(p, 'w').write(t)

# ---- npcs.js: an area with spec.roam keeps its roaming folk's spots (solo, pairs, asleep) inside that ellipse
p = os.path.join(OUT, 'js/npcs.js'); t = open(p).read()
a = "// Where a travel segment is after `tl` seconds"
assert t.count(a) == 1, 'travelAt'
t = t.replace(a, """// An area's roaming spots mapped into its lawn (spec.roam: an ellipse, centre x, z, facing fx, fz, a m deep, b m wide): the disc
// of the beat plan's ring round the area's centre is stretched onto the ellipse (an affine map, so straight walks between
// spots stay inside it). Pure, so every screen gets the same spots. No roam: the spot as it was.
function roamFit(area, x, z) {
  const R = area.npcSpec?.roam;
  if (!R) return [x, z];
  const r = Math.max(1, (area.radius || 7) - 1.4), dx = x - area.x, dz = z - area.z;
  let v = (dx * R.fx + dz * R.fz) / r, u = (dx * R.fz - dz * R.fx) / r;
  const l = Math.hypot(u, v); if (l > 1) { u /= l; v /= l; }
  return [R.x + u * R.b * R.fz + v * R.a * R.fx, R.z - u * R.b * R.fx + v * R.a * R.fz];
}
""" + a, 1)
a = """      const r = (d.ring[0] + d.ring[1]) / 2, x = area.x + Math.cos(d.homeAngle) * r, z = area.z + Math.sin(d.homeAngle) * r;
      return { x, z, yaw: faceTo(x, z, area.x, area.z) + 0.6, anim: 'sleep', line: speak, delay: 0 };"""
assert t.count(a) == 1, 'sleep spot'
t = t.replace(a, """      const r = (d.ring[0] + d.ring[1]) / 2, [x, z] = roamFit(area, area.x + Math.cos(d.homeAngle) * r, area.z + Math.sin(d.homeAngle) * r);
      return { x, z, yaw: faceTo(x, z, area.x, area.z) + 0.6, anim: 'sleep', line: speak, delay: 0 };""", 1)
a = "    let x = area.x + Math.cos(ang) * r, z = area.z + Math.sin(ang) * r;\n"
assert t.count(a) == 1, 'solo spot'
t = t.replace(a, a + "    if (d.behavior === 'roam') [x, z] = roamFit(area, x, z);   // (an area's lawn: spec.roam)\n", 1)
a = "          let mx = area.x + Math.cos(ang) * r, mz = area.z + Math.sin(ang) * r;\n"
assert t.count(a) == 1, 'pair spot'
t = t.replace(a, a + "          [mx, mz] = roamFit(area, mx, mz);   // (an area's lawn: spec.roam)\n", 1)
open(p, 'w').write(t)
print('new unicorns patched into', OUT)
