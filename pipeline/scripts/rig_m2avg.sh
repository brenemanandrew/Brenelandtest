#!/bin/sh
# Andrew's "Correct Average Female" Meshy figure (scaled to 1.70 m, 30k points) -> rigged body out/m2/body_m2avg.glb
cd "$(dirname "$0")"
JOINTS='{"Hips":[0,0.90,-0.03],"Spine":[0,0.99,-0.04],"Spine1":[0,1.09,-0.01],"Spine2":[0,1.19,0.0],"Neck":[0,1.42,-0.03],"Head":[0,1.47,-0.01],"HeadTop_End":[0,1.70,-0.02],"headfront":[0,1.47,0.15],
"Shoulder":[0.03,1.37,-0.04],"Arm":[0.15,1.365,-0.04],"ForeArm":[0.40,1.355,-0.037],"Hand":[0.64,1.353,-0.033],"HandEnd":[0.804,1.35,-0.03],
"UpLeg":[0.085,0.86,-0.03],"Leg":[0.07,0.56,-0.03],"Foot":[0.063,0.085,-0.05],"ToeBase":[0.06,0.02,0.06],"Toe_End":[0.06,0.015,0.125]}' \
COLLARDROP=${COLLARDROP:-5} ARMX=${ARMX:-0.17} LEGY=${LEGY:-0.86} HEADY=${HEADY:-1.455} NECKBAND=0.05 SKIN=${SKIN:-239,184,146} python3 rig_meshy2.py ../in_meshy2/figure_avg2_dec.npz ../out/m2/body_m2avg.glb
