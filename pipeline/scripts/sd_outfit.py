"""Andrew's whole-outfit route (2026-11-14): one Meshy "SD" figure per outfit (body and clothes in one textured mesh, T-pose).
python3 sd_outfit.py NAME        in_sd/NAME.npz (P,UV,N,F as exported) + in_sd/NAME.jpg (base colour) -> out/sd/NAME_rigin.npz (for rig_meshy2.py)
- scaled to HEIGHT (1.80 m), feet on the floor, centred
- the model's painted face (eyes, brows, mouth) is painted out in skin colour: the creator draws our own face options there
- joints (Andrew's markup: pink = joints) measured on the French tuck model, scaled per model by its own landmarks"""
import sys,os,io,json,numpy as np
from PIL import Image,ImageDraw
H=os.path.dirname(os.path.abspath(__file__));n=sys.argv[1];ENV=lambda k,d:type(d)(os.environ.get(k,d))
Z=np.load(H+'/../in_sd/%s.npz'%n);P=Z['P'].astype(float);UV=Z['UV'].astype(float);N=Z['N'].astype(float);F=Z['F'].astype(int)
s=ENV('HEIGHT',1.80)/np.ptp(P[:,1]);P=P*s;P[:,1]-=P[:,1].min();P[:,0]-=(P[:,0].max()+P[:,0].min())/2
# ---- profile (Andrew's side-view markup): a real nose, lips and chin stand out from the face; the eyes sit a little in
if ENV('PROFILE',1):
    EYp=ENV('EYEY',1.555);K=ENV('FK',1.0);fz=float(P[(np.abs(P[:,1]-EYp)<0.03)&(np.abs(P[:,0])<0.04),2].max());fr=np.clip((P[:,2]-(fz-0.10*K))/(0.06*K),0,1)*(P[:,1]>ENV('NECKY',1.36))
    gb=lambda x0,y0,rx,ry:np.exp(-(((np.abs(P[:,0])-x0)/(rx*K))**2+((P[:,1]-(EYp+y0*K))/(ry*K))**2))
    dz=ENV('NOSE',0.034)*gb(0,-0.062,0.02,0.024)+0.012*gb(0,-0.045,0.016,0.035)     # the tip, and the bridge running up to the brow
    dz+=ENV('LIPS',0.009)*gb(0,-0.115,0.045,0.016)+ENV('CHIN',0.014)*gb(0,-0.165,0.045,0.03)
    dz+=0.006*gb(0,0.05,0.12,0.02)-ENV('SOCKET',0.007)*gb(0.105,0.0,0.05,0.035)-0.006*gb(0,-0.092,0.03,0.008)   # brow, eye sockets, the dip under the nose
    P[:,2]+=dz*K*fr;print('  profile: nose stands %.1f cm out'%(ENV('NOSE',0.034)*K*100))
T=Image.open(H+'/../in_sd/%s.jpg'%n).convert('RGB');TW,TH=T.size;A=np.asarray(T).astype(float)
col=A[np.clip((UV[:,1]%1*TH).astype(int),0,TH-1),np.clip((UV[:,0]%1*TW).astype(int),0,TW-1)]
# ---- face: where it is (dark paint on the front of the head), then paint it out
NK=ENV('NECKY',1.36);hd=(P[:,1]>NK)&(P[:,2]>0.05)&(np.abs(P[:,0])<0.2);skin=np.median(col[hd],0);dark=hd&(col.sum(1)<330)&(P[:,1]>NK+0.05)
ey=float(np.median(P[dark&(np.abs(P[:,0])>0.04),1])) if dark.sum()>20 else NK+0.14;ex=float(np.median(np.abs(P[dark&(np.abs(P[:,0])>0.04),0]))) if dark.sum()>20 else 0.085
zf=float(P[(np.abs(P[:,1]-ey)<0.02)&(np.abs(P[:,0])<0.03),2].max())
fc=P[F].mean(1);fm=(fc[:,1]>NK+ENV('FACELO',-0.02))&(fc[:,1]<ey+ENV('FACEUP',0.2))&(np.abs(fc[:,0])<ENV('FACEW',0.235))&(fc[:,2]>zf-ENV('FACED',0.17))
D=ImageDraw.Draw(T);sk=tuple(int(x) for x in skin)
for tri in F[fm]:
    D.polygon([(UV[i,0]%1*TW,UV[i,1]%1*TH) for i in tri],fill=sk,outline=sk)
print('  %s: scale %.4f, face: eye line y %.3f, eyes at x +-%.3f, front z %.3f, skin %s, %d face triangles painted out'%(n,s,ey,ex,zf,sk,int(fm.sum())))
# ---- joints
JF={'Hips':[0,0.80,-0.01],'Spine':[0,0.92,0.0],'Spine1':[0,1.02,0.01],'Spine2':[0,1.12,0.01],'Neck':[0,1.31,-0.02],'Head':[0,1.37,0.0],'HeadTop_End':[0,1.80,0.0],'headfront':[0,1.37,0.25],
    'Shoulder':[0.07,1.25,-0.02],'Arm':[0.21,1.235,-0.02],'ForeArm':[0.40,1.225,-0.01],'Hand':[0.56,1.218,0.0],'HandEnd':[0.661,1.215,0.0],
    'UpLeg':[0.13,0.72,-0.01],'Leg':[0.14,0.42,-0.02],'Foot':[0.14,0.14,-0.02],'ToeBase':[0.15,0.04,0.10],'Toe_End':[0.15,0.03,0.21]}
MW={}
if 'W' in Z:   # the model came rigged by Meshy: its joints (scaled) and its weights
    MW={'W':Z['W'].astype(np.float32)};JM=json.loads(str(Z['J']));JF.update({k:[v[0]*s,v[1]*s,v[2]*s] for k,v in JM.items()});JF['HandEnd']=[float(P[:,0].max()),JF['Hand'][1],JF['Hand'][2]];os.environ['JOINTS']='x'
elif os.environ.get('JOINTS'):JF.update(json.loads(os.environ['JOINTS']))   # a model with other proportions brings its own joints (used as they are)
if not os.environ.get('JOINTS'):
    kx=P[:,0].max()/0.661   # arm span: the hand joints follow this model's reach
    for k in ('ForeArm','Hand','HandEnd'):JF[k]=[0.21+(JF[k][0]-0.21)*((P[:,0].max()-0.21)/(0.661-0.21)),JF[k][1],JF[k][2]]
    ay=float(np.mean([P[(np.abs(P[:,0]-x)<0.015)&(P[:,1]>1.0),1].mean() for x in (JF['ForeArm'][0],JF['Hand'][0]-0.03)]))   # arm height
    for k in ('Arm','ForeArm','Hand','HandEnd'):JF[k][1]=round(ay+(JF[k][1]-1.225),4)
b0=io.BytesIO();T.save(b0,'JPEG',quality=92);b1=io.BytesIO();Image.new('RGB',(8,8),(128,128,255)).save(b1,'PNG')
os.makedirs(H+'/../out/sd',exist_ok=True)
np.savez_compressed(H+'/../out/sd/%s_rigin.npz'%n,P=P.astype(np.float32),F=F.astype(np.int32),white=np.zeros(len(P),np.float32),head=np.ones(len(P),bool),UV=UV.astype(np.float32),N=N.astype(np.float32),
    tnames=np.array([],dtype=str),T=np.zeros((0,len(P),3),np.float32),tex0=np.frombuffer(b0.getvalue(),np.uint8),tex1=np.frombuffer(b1.getvalue(),np.uint8),uvskin=np.zeros(2),uvwhite=np.zeros(2),
    joints=json.dumps(JF),shift=np.zeros(3),heady=NK+0.01,**MW)
json.dump({'m':0.0,'y':round(ey,4),'k':round(ex/0.075,3),'z':round(zf-0.128,4)},open(H+'/../out/sd/%s_face.json'%n,'w'))
