"""The Unstable Unicorns diorama's holes, closed (run by make_testgame.py on the built copy: python3 tools/patch_diorama_fix.py OUT).
The balloon cut (blender/unicorns_prep.py) had also taken the front of the rainbow's left half (seen from the path it was only
thin band edges, see-through), the tops of both little stone doorways (open, ragged) and a few bits of bush. The repaired model,
models/06-unicorns/unicorns_fixed.glb, is made by tools/unicorns_fix_model.py from unicorns_base.glb: the six band fronts rebuilt
from the intact right half (each band in its own colour), the doorways' half-cut spikes brought down to a flat top, every other
hole capped, and only the base colour texture kept (the game draws the map only), 6.8 MB instead of 9.7 MB. Same placement, same material (MeshToonMaterial, the map, front faces)."""
import os, sys, shutil

OUT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__)); WR = os.path.dirname(HERE)
src = os.path.join(WR, 'models/06-unicorns/unicorns_fixed.glb'); dst = os.path.join(OUT, 'models/refresh/unicorns_base.glb')
assert os.path.exists(src) and os.path.exists(dst), (src, dst)
shutil.copy(src, dst)
print('patch_diorama_fix: diorama model with its holes closed ->', dst)

# ---- the thin dark outlines round the unicorn effects (a rectangle round the portal, square frames round the letters, lines
# by the rainbow): the ink pass draws its normals with one override material, which ignores the effects' own discards and
# transparency, so every effect quad was inked as a full rectangle. The letters, the rainbow's light sweep and both sparkle
# clouds go on the soft layer (drawn in colour, never outlined, like grass and particles); the vortex stays inked (it hides the
# lines of what is behind it) but its quad becomes its real shape, the clipped ellipse its shader draws, so its outline is the
# portal opening's.
p = os.path.join(OUT, 'js/unicorn-fx.js'); t = open(p).read()
def rep(a, b):
    global t
    assert t.count(a) == 1, a[:60]; t = t.replace(a, b, 1)
rep("import * as THREE from 'three';\n", "import * as THREE from 'three';\nimport { LAYER_SOFT } from './toon.js';\n")
rep("    arch.add(m); letters.push({ m, i, th });", "    m.layers.set(LAYER_SOFT); arch.add(m); letters.push({ m, i, th });")
rep("  sweep.position.z = faceZ(0) + 0.06; sweep.renderOrder = 2; arch.add(sweep);", "  sweep.position.z = faceZ(0) + 0.06; sweep.renderOrder = 2; sweep.layers.set(LAYER_SOFT); arch.add(sweep);")
rep("  pts.renderOrder = 4; arch.add(pts);", "  pts.renderOrder = 4; pts.layers.set(LAYER_SOFT); arch.add(pts);")
rep("  })), { renderOrder: 4 }));\n", "  })), { renderOrder: 4 }));\n  portal.children[portal.children.length - 1].layers.set(LAYER_SOFT);\n")
rep("  const vortex = new THREE.Mesh(new THREE.PlaneGeometry(PW * 1.25, PH * 1.2), new THREE.ShaderMaterial({",
    """  // (its shape: x^2 + (0.85 y)^2 <= 1 in uv -1..1, clipped top and bottom, the same as the shader's discard)
  const vsh = new THREE.Shape(), VW = PW * 1.25, VH = PH * 1.2;
  for (let i = 0; i <= 64; i++) { const a = i / 64 * TAU, vx = Math.cos(a) * VW / 2, vy = Math.max(-1, Math.min(1, Math.sin(a) / 0.85)) * VH / 2; i ? vsh.lineTo(vx, vy) : vsh.moveTo(vx, vy); }
  const vgeo = new THREE.ShapeGeometry(vsh), vp = vgeo.attributes.position, vuv = vgeo.attributes.uv;
  for (let i = 0; i < vp.count; i++) vuv.setXY(i, vp.getX(i) / VW + 0.5, vp.getY(i) / VH + 0.5);
  const vortex = new THREE.Mesh(vgeo, new THREE.ShaderMaterial({""")
open(p, 'w').write(t)
print('patch_diorama_fix: unicorn effects off the ink outlines (soft layer; the vortex its own shape)')
