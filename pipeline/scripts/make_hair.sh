#!/bin/bash
# make_hair.sh <source.glb> <key> [chibi]   -> out/hairfinal/<key>.glb (fitted to the base head, solid, tinted by the editor)
set -e; cd /home/claude
bvenv/bin/python scripts/decimate_tex.py "$1" out/tmp-$2-dec.glb 40000 2>&1 | grep -E "^faces" || true
bvenv/bin/python scripts/fit_hair.py out/tmp-$2-dec.glb out/tmp-$2-fit.glb $3 2>&1 | grep -E "kept|scalp" | tr '\n' ' ' || true
bvenv/bin/python scripts/solid_hair.py out/tmp-$2-fit.glb out/hairfinal/$2.glb 4 9000 2>&1 | grep -E "remeshed|MB|rror" | tr '\n' ' '; echo
