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
W0=Z['W'].astype(float) if 'W' in Z else None
def subdivide(mask):   # marked triangles become four; their neighbours are split to match (no T-junctions, so no cracks), also across texture seams
    global P,UV,N,F,W0
    _,w=np.unique(np.round(P*2e4).astype(np.int64),axis=0,return_inverse=True);w=w.ravel();key=lambda a,b:(min(w[a],w[b]),max(w[a],w[b]))
    split={key(t[i],t[(i+1)%3]) for t in F[mask] for i in range(3)};mids={};newP=[];out=[]
    def mid(a,b):
        k=(min(a,b),max(a,b))
        if k not in mids:mids[k]=len(P)+len(newP);newP.append(k)
        return mids[k]
    for t in F:
        e=[key(t[i],t[(i+1)%3]) in split for i in range(3)];n=sum(e)
        if n==0:out.append(t);continue
        a,b,c=t
        if n==3:ab,bc,ca=mid(a,b),mid(b,c),mid(c,a);out+=[[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]];continue
        r=e.index(True) if n==1 else e.index(False);a,b,c=t[r],t[(r+1)%3],t[(r+2)%3]
        if n==1:m=mid(a,b);out+=[[a,m,c],[m,b,c]]
        else:m1=mid(b,c);m2=mid(c,a);out+=[[a,b,m1],[a,m1,m2],[m2,m1,c]]   # edge a-b whole, the other two split
    ue=np.array(newP);mm=lambda A:np.r_[A,(A[ue[:,0]]+A[ue[:,1]])/2];P=mm(P);UV=mm(UV);N=mm(N);F=np.array(out)
    if W0 is not None:W0=mm(W0)
if ENV('NOSESUB',2):
    EY0=ENV('EYEY',1.555);K0=ENV('FK',1.0);fz0=float(P[(np.abs(P[:,1]-EY0)<0.03)&(np.abs(P[:,0])<0.04),2].max())
    for _ in range(ENV('NOSESUB',2)):
        c=P[F].mean(1);subdivide((np.abs(c[:,0])<0.062*K0)&(c[:,1]>EY0-0.135*K0)&(c[:,1]<EY0+0.03*K0)&(c[:,2]>fz0-0.07*K0))
# ---- Meshy embossed its painted face into the surface (rings round the old eyes, cheek marks): smooth the front of the head flat
_,wi=np.unique(np.round(P*2e4).astype(np.int64),axis=0,return_inverse=True);wi=wi.ravel();nwv=wi.max()+1;FWd=wi[F];Ew=np.unique(np.sort(np.r_[FWd[:,[0,1]],FWd[:,[1,2]],FWd[:,[2,0]]],axis=1),axis=0);Ew=Ew[Ew[:,0]!=Ew[:,1]]
if ENV('SMOOTHFACE',45):
    NKs=ENV('NECKY',1.36);PW=np.zeros((nwv,3));PW[wi]=P;fzs=PW[(PW[:,1]>NKs+0.1)&(np.abs(PW[:,0])<0.04),2].max()
    mk=np.clip((PW[:,2]-(fzs-ENV('SMD',0.15)))/0.04,0,1)*np.clip((PW[:,1]-(NKs+0.01))/0.03,0,1)*(np.abs(PW[:,0])<ENV('SMW',0.21));dg=np.zeros(nwv);np.add.at(dg,Ew[:,0],1);np.add.at(dg,Ew[:,1],1);dg=np.maximum(dg,1)
    for _ in range(ENV('SMOOTHFACE',45)):
        nb=np.zeros_like(PW);np.add.at(nb,Ew[:,0],PW[Ew[:,1]]);np.add.at(nb,Ew[:,1],PW[Ew[:,0]]);PW=PW+(0.5*mk)[:,None]*(nb/dg[:,None]-PW)
    P=PW[wi]
# ---- profile (Andrew's side-view markup): a real nose, lips and chin stand out from the face; the eyes sit a little in
if ENV('PROFILE',1):
    EYp=ENV('EYEY',1.555);K=ENV('FK',1.0);fz=float(P[(np.abs(P[:,1]-EYp)<0.03)&(np.abs(P[:,0])<0.04),2].max());fr=np.clip((P[:,2]-(fz-0.10*K))/(0.06*K),0,1)*(P[:,1]>ENV('NECKY',1.36))
    gb=lambda x0,y0,rx,ry:np.exp(-(((np.abs(P[:,0])-x0)/(rx*K))**2+((P[:,1]-(EYp+y0*K))/(ry*K))**2))
    from scipy.spatial import cKDTree
    Qn=np.load(H+'/../in_sd/oldnose_pts.npy').astype(float);qx=Qn[:,0]-0.0175;qy=Qn[:,1]-1.4556;outn=(np.abs(qx)>0.03)|(qy>0.05)|(qy<-0.038)
    A_=lambda x,y:np.c_[np.ones(len(x)),x,y,x*x,y*y,x*y];cf=np.linalg.lstsq(A_(qx[outn],qy[outn]),Qn[outn,2],rcond=None)[0]
    winq=np.clip((0.042-np.abs(qx))/0.012,0,1)*np.clip((0.062-qy)/0.014,0,1)*np.clip((qy+0.046)/0.01,0,1);rel=np.clip(Qn[:,2]-A_(qx,qy)@cf,-0.003,None)*winq   # how far her nose stands off her face
    kn=ENV('NOSEK',1.15)*K;u_=P[:,0]/kn;v_=(P[:,1]-(EYp-ENV('NOSEY',0.066)*K))/kn;dd,ii=cKDTree(np.c_[qx,qy]).query(np.c_[u_,v_],k=4);ww=1/(dd+1e-4)**2;ww/=ww.sum(1,keepdims=True)
    dz=(rel[ii]*ww).sum(1)*kn*ENV('NOSEH',0.5)/K*np.clip((0.03-dd[:,0])/0.01,0,1)     # our basic head's nose: bridge, tip and wings
    dz+=ENV('LIPS',0.009)*gb(0,-0.10,0.045,0.016)+ENV('CHIN',0.014)*gb(0,-0.165,0.045,0.03)
    dz+=0.006*gb(0,0.05,0.12,0.02)-ENV('SOCKET',0.0)*gb(0.105,0.0,0.05,0.035)-0.006*gb(0,-0.083,0.03,0.007)   # brow, eye sockets, the dip under the nose
    P[:,2]+=dz*K*fr;print('  profile: nose from our basic head, relief up to %.1f cm'%(dz.max()*K*100))
T=Image.open(H+'/../in_sd/%s.jpg'%n).convert('RGB');TW,TH=T.size;A=np.asarray(T).astype(float)
col=A[np.clip((UV[:,1]%1*TH).astype(int),0,TH-1),np.clip((UV[:,0]%1*TW).astype(int),0,TW-1)]
# ---- face: where it is (dark paint on the front of the head), then paint it out
NK=ENV('NECKY',1.36);hd=(P[:,1]>NK)&(P[:,2]>0.05)&(np.abs(P[:,0])<0.2);skin=np.median(col[hd],0);dark=hd&(col.sum(1)<330)&(P[:,1]>NK+0.05)
ey=float(np.median(P[dark&(np.abs(P[:,0])>0.04),1])) if dark.sum()>20 else NK+0.14;ex=float(np.median(np.abs(P[dark&(np.abs(P[:,0])>0.04),0]))) if dark.sum()>20 else 0.085
zf=float(P[(np.abs(P[:,1]-ey)<0.02)&(np.abs(P[:,0])<0.03),2].max())
fc=P[F].mean(1);fm=(fc[:,1]>NK+ENV('FACELO',-0.02))&(np.abs(fc[:,0])<0.4)   # the whole head in one even skin colour: no edge between repainted and original skin (the toon shading does the rest)
D=ImageDraw.Draw(T);sk=tuple(int(x) for x in skin)
for tri in F[fm]:
    pts=[(UV[i,0]%1*TW,UV[i,1]%1*TH) for i in tri];D.polygon(pts,fill=sk,outline=sk);D.line(pts+[pts[0]],fill=sk,width=ENV('ERASEW',9))   # (a wide edge: the soft rim of the old paint goes too)
print('  %s: scale %.4f, face: eye line y %.3f, eyes at x +-%.3f, front z %.3f, skin %s, %d face triangles painted out'%(n,s,ey,ex,zf,sk,int(fm.sum())))
# ---- joints
JF={'Hips':[0,0.80,-0.01],'Spine':[0,0.92,0.0],'Spine1':[0,1.02,0.01],'Spine2':[0,1.12,0.01],'Neck':[0,1.31,-0.02],'Head':[0,1.37,0.0],'HeadTop_End':[0,1.80,0.0],'headfront':[0,1.37,0.25],
    'Shoulder':[0.07,1.25,-0.02],'Arm':[0.21,1.235,-0.02],'ForeArm':[0.40,1.225,-0.01],'Hand':[0.56,1.218,0.0],'HandEnd':[0.661,1.215,0.0],
    'UpLeg':[0.13,0.72,-0.01],'Leg':[0.14,0.42,-0.02],'Foot':[0.14,0.14,-0.02],'ToeBase':[0.15,0.04,0.10],'Toe_End':[0.15,0.03,0.21]}
MW={}
if 'W' in Z:   # the model came rigged by Meshy: its joints (scaled) and its weights
    MW={'W':W0.astype(np.float32)};JM=json.loads(str(Z['J']));JF.update({k:[v[0]*s,v[1]*s,v[2]*s] for k,v in JM.items()});JF['HandEnd']=[float(P[:,0].max()),JF['Hand'][1],JF['Hand'][2]];os.environ['JOINTS']='x'
elif os.environ.get('JOINTS'):JF.update(json.loads(os.environ['JOINTS']))   # a model with other proportions brings its own joints (used as they are)
if not os.environ.get('JOINTS'):
    kx=P[:,0].max()/0.661   # arm span: the hand joints follow this model's reach
    for k in ('ForeArm','Hand','HandEnd'):JF[k]=[0.21+(JF[k][0]-0.21)*((P[:,0].max()-0.21)/(0.661-0.21)),JF[k][1],JF[k][2]]
    ay=float(np.mean([P[(np.abs(P[:,0]-x)<0.015)&(P[:,1]>1.0),1].mean() for x in (JF['ForeArm'][0],JF['Hand'][0]-0.03)]))   # arm height
    for k in ('Arm','ForeArm','Hand','HandEnd'):JF[k][1]=round(ay+(JF[k][1]-1.225),4)
PW=np.zeros((nwv,3));PW[wi]=P;fnw=np.cross(PW[FWd[:,1]]-PW[FWd[:,0]],PW[FWd[:,2]]-PW[FWd[:,0]]);NW=np.zeros((nwv,3))
for q in range(3):np.add.at(NW,FWd[:,q],fnw)
N=(NW/np.linalg.norm(NW,axis=1,keepdims=True).clip(1e-12))[wi]   # normals of the reshaped surface (smooth across texture seams)
# the face is lit like one smooth ball (the usual cel-shading trick): no patchy bands across the cheeks; the nose keeps a little of its own
hc=np.array([0.0,ey+0.03,float(P[P[:,1]>NK+0.05,2].mean())]);sp=P-hc;sp/=np.linalg.norm(sp,axis=1,keepdims=True).clip(1e-9)
fw=np.clip((P[:,2]-(zf-0.16))/0.06,0,1)*np.clip((P[:,1]-NK)/0.04,0,1)*(np.abs(P[:,0])<0.24)*ENV('BALL',0.8);N=N*(1-fw[:,None])+sp*fw[:,None];N/=np.linalg.norm(N,axis=1,keepdims=True).clip(1e-12)
b0=io.BytesIO();T.save(b0,'JPEG',quality=92);b1=io.BytesIO();Image.new('RGB',(8,8),(128,128,255)).save(b1,'PNG')
os.makedirs(H+'/../out/sd',exist_ok=True)
np.savez_compressed(H+'/../out/sd/%s_rigin.npz'%n,P=P.astype(np.float32),F=F.astype(np.int32),white=np.zeros(len(P),np.float32),head=np.ones(len(P),bool),UV=UV.astype(np.float32),N=N.astype(np.float32),
    tnames=np.array([],dtype=str),T=np.zeros((0,len(P),3),np.float32),tex0=np.frombuffer(b0.getvalue(),np.uint8),tex1=np.frombuffer(b1.getvalue(),np.uint8),uvskin=np.zeros(2),uvwhite=np.zeros(2),
    joints=json.dumps(JF),shift=np.zeros(3),heady=NK+0.01,**MW)
json.dump({'m':0.0,'y':round(ey,4),'k':round(ex/0.075,3),'z':round(zf-0.128,4)},open(H+'/../out/sd/%s_face.json'%n,'w'))
