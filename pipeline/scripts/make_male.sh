#!/bin/bash
# male-build.glb (rigged, clips, build shapes) -> the builder's male model. $1 = forearm twist in degrees
set -e; cd /home/claude
python3 scripts/male_morph_fix.py out/male-build5.glb /tmp/mfix.glb 40
python3 scripts/twist_forearm.py /tmp/mfix.glb /tmp/m0.glb ${1:-0} | tail -3
python3 scripts/smooth_mouth.py /tmp/m0.glb /tmp/m0s.glb 0.0 1.452 0.05 0.027 700 | tail -1
FACEXF=0.0,1.535,0.67,0.025 NOSEY=1.446 python3 scripts/face_shapes.py /tmp/m0s.glb /tmp/m1.glb >/dev/null
FLAT=0.095,1.425,1.60,0.085 FACERG=0.006,1.42,1.62,0.05,0.12 python3 scripts/blank_face.py /tmp/m1.glb /tmp/m2.glb | grep -v "^/tmp"
python3 scripts/quant_anim.py /tmp/m2.glb /tmp/m3.glb >/dev/null && python3 scripts/sparse_targets.py /tmp/m3.glb out/male-build-s.glb | tail -1
python3 scripts/build.py | tail -1
