"""Put the current character's head (her real face: shapes, nose shapes, texture) on one of Andrew's Meshy bodies.
python3 graft_head.py FIGURE_dec.npz OUT.npz      -> input for rig_meshy2.py (still in the figure's T-pose)
- The body is scaled (S) and moved so its neck stump sits under her head exactly where her own neck was: the head stays in the
  builder's own coordinates, so the face, the face/nose shapes and every fitted hairstyle work unchanged. Total height 1.70 m.
- The figure's own head is cut off at the narrowest point of its neck; her neck is let out to the stump's width over 3 cm.
- Texture: her skin texture with a strip added underneath for the body's flat colours (skin, underwear)."""
import sys,os,io,json,struct,numpy as np
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__));INP,OUT=sys.argv[1],sys.argv[2];ENV=lambda k,d:type(d)(os.environ.get(k,d))
CT={5126:np.float32,5125:np.uint32,5123:np.uint16,5122:np.int16,5121:np.uint8,5120:np.int8};NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
d=open(HERE+'/../out/base-plus-q3.glb','rb').read();L=struct.unpack('<I',d[12:16])[0];J=json.loads(d[20:20+L]);B=d[20+L+8:]
def acc(i):
    a=J['accessors'][i];n=NC[a['type']];dt=CT[a['componentType']]
    if 'bufferView' in a:
        bv=J['bufferViews'][a['bufferView']];out=np.frombuffer(B,dt,a['count']*n,bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],n).astype(float)
    else:out=np.zeros((a['count'],n))
    if 'sparse' in a:
        s=a['sparse'];bi=J['bufferViews'][s['indices']['bufferView']];ii=np.frombuffer(B,CT[s['indices']['componentType']],s['count'],bi.get('byteOffset',0)+s['indices'].get('byteOffset',0))
        bw=J['bufferViews'][s['values']['bufferView']];vv=np.frombuffer(B,dt,s['count']*n,bw.get('byteOffset',0)+s['values'].get('byteOffset',0)).reshape(-1,n);out=out.copy();out[ii]=vv
    return out
p=J['meshes'][0]['primitives'][0];X=acc(p['attributes']['POSITION']);UV=acc(p['attributes']['TEXCOORD_0']);N=acc(p['attributes']['NORMAL']);F=acc(p['indices']).reshape(-1,3).astype(int)
tn=J['meshes'][0]['extras']['targetNames'];T={n:acc(t['POSITION']) for n,t in zip(tn,p['targets']) if n.startswith('face_') or n.startswith('nose_')}
ss=lambda t:np.clip(t,0,1)**2*(3-2*np.clip(t,0,1));MID=0.0175
# ---- her head, cut under the chin
YO=ENV('OLDCUT',1.333);keep=X[:,1]>YO;Fh=F[keep[F].all(1)];used=np.unique(Fh);rm=-np.ones(len(X),int);rm[used]=np.arange(len(used));Fh=rm[Fh]
Xh=X[used].copy();UVh=UV[used];Nh=N[used];Th={n:v[used] for n,v in T.items()}
ring=Xh[Xh[:,1]<YO+0.01];oc=np.array([(ring[:,0].max()+ring[:,0].min())/2,(ring[:,2].max()+ring[:,2].min())/2]);orx=np.ptp(ring[:,0])/2;orz=np.ptp(ring[:,2])/2
# ---- the figure: scaled, moved under her head, its own head cut off
Z=np.load(INP);P=Z['P'].astype(float);Fb=Z['F'].astype(int);white=Z['white'].astype(float)
YN=ENV('NEWCUT',1.425);NL=ENV('NECKLEN',0.045);S=ENV('S',(YO+0.001-NL)/YN);nr=P[(np.abs(P[:,1]-YN)<0.012)&(np.abs(P[:,0])<0.3)];nc=np.array([(nr[:,0].max()+nr[:,0].min())/2,(nr[:,2].max()+nr[:,2].min())/2])*S
sh=np.array([oc[0]-nc[0],0,oc[1]-nc[1]+ENV('DZ',0.0)]);P=P*S+sh;yc=YN*S
f=np.where(np.abs(P[:,0]-MID)<0.3*S,yc-P[:,1],1.0);f[np.abs(f)<1e-9]=-1e-9;pos=f[Fb]>0;n=pos.sum(1);mx=(n==1)|(n==2);Fm=Fb[mx]
lone=np.where(n[mx]==1,np.argmax(pos[mx],1),np.argmin(pos[mx],1));r=np.arange(len(Fm));A_=Fm[r,lone];B_=Fm[r,(lone+1)%3];C_=Fm[r,(lone+2)%3]
Es=np.sort(np.r_[np.c_[A_,B_],np.c_[A_,C_]],1);ue,inv=np.unique(Es,axis=0,return_inverse=True);inv=inv.ravel();i_,j_=ue[:,0],ue[:,1];t=np.clip(f[i_]/(f[i_]-f[j_]),1e-3,1-1e-3)[:,None]
P=np.r_[P,P[i_]+(P[j_]-P[i_])*t];white=np.r_[white,white[i_]+(white[j_]-white[i_])*t[:,0]];nid=len(f)+np.arange(len(ue));p_=nid[inv[:len(Fm)]];q_=nid[inv[len(Fm):]];ins=n[mx]==1
Fb=np.r_[Fb[n==3],np.c_[A_,p_,q_][ins],np.c_[p_,B_,C_][~ins],np.c_[p_,C_,q_][~ins]];ub=np.unique(Fb);rb=-np.ones(len(P),int);rb[ub]=np.arange(len(ub));Fb=rb[Fb];P=P[ub];white=white[ub]
rim=P[(np.abs(P[:,1]-yc)<0.003)&(np.abs(P[:,0]-MID)<0.3)];nrx=np.ptp(rim[:,0])/2;nrz=np.ptp(rim[:,2])/2;ncz=(rim[:,2].max()+rim[:,2].min())/2
print('  body scale %.3f, neck stump at y %.3f: half width %.3f depth %.3f ; her neck there: %.3f %.3f'%(S,yc,nrx,nrz,orx,orz))
# ---- her neck let out to the stump (nothing above the jaw line moves; the chin in front is left alone)
tt=ss((YO+ENV('FLARE',0.03)-Xh[:,1])/ENV('FLARE',0.03))*(1-ss((Xh[:,2]-0.02)/0.03));K=ENV('FLAREK',0.97)
if ENV('DOFLARE',0):Xh[:,0]=oc[0]+(Xh[:,0]-oc[0])*(1+tt*(nrx*K/orx-1));Xh[:,2]=(oc[1]+tt*(ncz-oc[1]))+(Xh[:,2]-oc[1])*(1+tt*(nrz*K/orz-1))
t2=ss((YO+0.012-Xh[:,1])/0.012);Xh[:,1]-=t2*ENV('TUCK',0.02);Xh[:,0]=oc[0]+(Xh[:,0]-oc[0])*(1-0.08*t2)   # her neck's last centimetre runs down inside the stump
# the stump narrows to her neck over its last TAPER metres (no ledge)
tp=ss((P[:,1]-(yc-ENV('TAPER',0.07)))/ENV('TAPER',0.07))*(np.hypot(P[:,0]-nc[0]-sh[0],P[:,2]-ncz)<0.2)
P[:,0]=oc[0]+(P[:,0]-oc[0])*(1+tp*((orx+0.003)/nrx-1));P[:,2]=(ncz+tp*(oc[1]-ncz))+(P[:,2]-ncz)*(1+tp*((orz+0.003)/nrz-1))
P[:,1]+=tp*NL;yc+=NL   # ... and rises into the neck
# the stump gets a closed, slightly domed top (her neck stands in it)
ri=np.where((np.abs(P[:,1]-yc)<0.002)&(np.abs(P[:,0]-MID)<0.3))[0];rc=np.array([P[ri,0].mean(),yc,P[ri,2].mean()]);o_=ri[np.argsort(np.arctan2(P[ri,0]-rc[0],P[ri,2]-rc[2]))]
ci=len(P);P=np.r_[P,[rc+[0,ENV('CAPUP',0.012),0]]];white=np.r_[white,0.0];Fb=np.r_[Fb,np.c_[o_,np.roll(o_,-1),np.full(len(o_),ci)]]
# ---- texture: her skin map with a strip for the flat colours
def img(i):
    bv=J['bufferViews'][J['images'][i]['bufferView']];return Image.open(io.BytesIO(B[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])).convert('RGB')
C=np.asarray(img(0));H,W=C.shape[:2];nk=(tt>0.5);px=C[np.clip((UVh[nk,1]*H).astype(int),0,H-1),np.clip((UVh[nk,0]*W).astype(int),0,W-1)];skin=np.median(px,0).astype(np.uint8)
ST=64;C2=np.zeros((H+ST,W,3),np.uint8);C2[:H]=C;C2[H:,:W//2]=skin;C2[H:,W//2:]=[int(x) for x in os.environ.get('UNDER','246,243,238').split(',')]
NM=np.asarray(img(1));h2,w2=NM.shape[:2];s2=ST*h2//H;N2=np.zeros((h2+s2,w2,3),np.uint8);N2[:h2]=NM;N2[h2:]=[128,128,255]
b0=io.BytesIO();Image.fromarray(C2).save(b0,'JPEG',quality=93);b1=io.BytesIO();Image.fromarray(N2).save(b1,'JPEG',quality=92)
UVh=UVh*[1,H/(H+ST)];vS=(H+ST/2)/(H+ST)
# ---- together
nb=len(P);PP=np.r_[P,Xh];FF=np.r_[Fb,Fh+nb];head=np.r_[np.zeros(nb,bool),np.ones(len(Xh),bool)]
jt=lambda v:(np.array(v)*S+sh).round(4).tolist()
JN={'Hips':[0,0.88,-0.02],'Spine':[0,0.97,-0.02],'Spine1':[0,1.07,-0.025],'Spine2':[0,1.17,-0.03],'Shoulder':[0.05,1.30,-0.02],'Arm':[0.27,1.295,-0.01],'ForeArm':[0.50,1.285,-0.012],'Hand':[0.70,1.287,-0.018],'HandEnd':[0.852,1.287,-0.03],
    'UpLeg':[0.15,0.80,-0.02],'Leg':[0.14,0.50,-0.01],'Foot':[0.12,0.115,-0.03],'ToeBase':[0.12,0.03,0.12],'Toe_End':[0.12,0.025,0.245]}
JO={k:(np.array(v)*S).round(4).tolist() for k,v in JN.items()}
JO.update({'Neck':[0,1.23,-0.02+sh[2]],'Head':[0,1.289,-0.004],'HeadTop_End':[0,1.69,0.025],'headfront':[0,1.289,0.173]})
np.savez_compressed(OUT,P=PP.astype(np.float32),F=FF.astype(np.int32),white=np.r_[white,np.zeros(len(Xh))].astype(np.float32),head=head,UV=np.r_[np.zeros((nb,2)),UVh].astype(np.float32),N=np.r_[np.zeros((nb,3)),Nh].astype(np.float32),
    tnames=np.array(list(Th)),T=np.array([np.r_[np.zeros((nb,3)),Th[n]] for n in Th],np.float32),tex0=np.frombuffer(b0.getvalue(),np.uint8),tex1=np.frombuffer(b1.getvalue(),np.uint8),
    uvskin=np.array([0.25,vS]),uvwhite=np.array([0.75,vS]),joints=json.dumps(JO),shift=np.array([sh[0],0,sh[2]]),heady=YO+ENV('FLARE',0.03))
print('  wrote',OUT,'%d body + %d head points, height %.3f'%(nb,len(Xh),PP[:,1].max()))
