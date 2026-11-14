#!/bin/sh
# A test copy of site/ the render scripts can drive: node_modules three, debug hooks, and chosen pieces swapped in.
# usage: sh mkroot.sh ROOTDIR [slot_key=out/clean/name.glb ...]   e.g. top_f_wrap=../out/clean/top_f_fallblouse2.glb
set -e;R=$1;shift;H="$(cd "$(dirname "$0")/../.." && pwd)";rm -rf "$R";mkdir -p "$R/cloth"
python3 - "$H/site/index.html" "$R/index.html" <<'P'
import sys;s=open(sys.argv[1]).read().replace('https://cdn.jsdelivr.net/npm/three@0.181.0/','/three/')
s=s.replace("window.__poser={","window.__dbg={camera,orbit,setBase,renderer};window.__x={holder,cache,get C(){return C;}};\nwindow.__poser={",1);open(sys.argv[2],'w').write(s)
P
for x in hair models;do ln -s "$H/site/$x" "$R/$x";done;ln -s "$H/pipeline/jstest/node_modules/three" "$R/three"
for f in "$H"/site/cloth/*;do ln -s "$f" "$R/cloth/";done
for kv in "$@";do k=${kv%%=*};g=${kv#*=};rm -f "$R/cloth/$k.js";python3 -c "import base64,sys;k,g,o=sys.argv[1:];open(o,'w').write(\"(window.HAIRDATA=window.HAIRDATA||{})['%s']='%s';\"%(k,base64.b64encode(open(g,'rb').read()).decode()))" "$k" "$g" "$R/cloth/$k.js";done
echo "root ready: $R  (render: node shellrev.mjs $R plus '{\"top\":\"f_wrap\",\"bottom\":\"f_skirt\",\"shoes\":\"f_boots\"}' TAG OUTDIR BUILD ; MUS=100 for athletic)"
