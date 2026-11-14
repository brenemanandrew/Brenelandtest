#!/bin/sh
# Rebuild the fall outfit (waist blouse, A-line skirt, mountain boots) on the four female builds -> out/clean/
# Inputs are decimated Meshy scans in in_clean/ (made with scripts/decimate_clean.py IN.glb OUT.npz 60000)
cd "$(dirname "$0")"
# HUG: shoulders, upper back and upper sleeves sit on her; SLEEVEK: forearm puff kept at 35%, cuff in to the wrist (Andrew's markups 2026-11-14)
KEEP=1 HUG=1 HUGMAX=0.16 HUGIT=10 HUGNECK=-0.03 HUGNECKW=0.9 SLEEVEK=0.35 INDOT=-0.4 INPEN=6 CLR=0.012 \
 ACIRC="-0.17,0.40,0.13,front;0.17,0.40,0.13,front;0,0.23,0.062,front;0,-0.07,0.062,front;0,-0.34,0.062,front" ABOX="-0.30,0.30,0.47,0.62,back" \
 python3 fit_clean.py ../in_clean/f_fallblouse2.npz top_f_fallblouse2 f
LEN=knee FRONTK=0.5 BASE=118,74,46 INDOT=-0.7 python3 fit_clean.py ../in_clean/f_skirtaline.npz bottom_f_skirtaline f
BASE=112,30,46 SOLE=0.18 SOLEC=38,24,20 python3 fit_clean.py ../in_clean/f_mtnboots.npz shoes_f_mtnboots f
