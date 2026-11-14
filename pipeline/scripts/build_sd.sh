#!/bin/sh
# Rig Andrew's whole-outfit SD models -> out/sd/body_sd_*.glb  (then models/sd_*.js are written by write_sd_models.py)
cd "$(dirname "$0")"
python3 sd_outfit.py french && SEAMDOWN=0 COLLARDROP=8 ARMX=0.23 LEGY=0.70 NECKBAND=0.04 python3 rig_meshy2.py ../out/sd/french_rigin.npz ../out/sd/body_sd_french.glb | tail -1
# untucked: the Meshy-rigged file (its weights and joints)
python3 sd_outfit.py untucked_m && SEAMDOWN=0 COLLARDROP=8 NECKBAND=0.04 python3 rig_meshy2.py ../out/sd/untucked_m_rigin.npz ../out/sd/body_sd_untucked.glb | tail -1
# the base (underwear) figure has a bigger head, a lower neck and longer arms: its own joints
FACEW=0.25 NECKY=1.27 JOINTS='{"Hips":[0,0.70,0.0],"Spine":[0,0.80,0.0],"Spine1":[0,0.90,0.01],"Spine2":[0,1.0,0.01],"Neck":[0,1.22,-0.02],"Head":[0,1.28,0.0],"HeadTop_End":[0,1.80,0.0],"headfront":[0,1.28,0.3],
"Shoulder":[0.07,1.16,-0.02],"Arm":[0.24,1.15,-0.01],"ForeArm":[0.44,1.145,0.0],"Hand":[0.62,1.14,0.0],"HandEnd":[0.736,1.14,0.0],
"UpLeg":[0.14,0.60,0.0],"Leg":[0.16,0.34,-0.02],"Foot":[0.17,0.12,-0.03],"ToeBase":[0.18,0.04,0.09],"Toe_End":[0.18,0.03,0.19]}' python3 sd_outfit.py base && \
SEAMDOWN=0 COLLARDROP=8 ARMX=0.27 LEGY=0.60 NECKBAND=0.04 python3 rig_meshy2.py ../out/sd/base_rigin.npz ../out/sd/body_sd_base.glb | tail -1
python3 - <<'P'
import base64
for n in ('french','untucked','base'):
    g=base64.b64encode(open('../out/sd/body_sd_%s.glb'%n,'rb').read()).decode()
    for d in ('../../site/models','../poser/models'):open(d+'/sd_%s.js'%n,'w').write("(window.MODELDATA=window.MODELDATA||{})['sd_%s']='%s';"%(n,g))
P
