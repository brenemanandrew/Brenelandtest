"""Rig one of Andrew's own Meshy figures (an unrigged T-pose statue) as a body for the builder.
python3 rig_meshy2.py IN.npz OUT.glb        IN.npz: P, F, white (per point: underwear) from the decimated figure
- Skeleton: the builder's 66 Mixamo bones (names, order and rest rotations of out/base-plus-q3.glb), bone lengths from the new
  figure. Joints are placed on the T-pose figure (JOINTS below, measured off it), fingers by fitting her old hand to the new one.
- Skin weights: her old body is posed onto the new skeleton and each new point takes the weights of the old skin nearest to it
  (arms from arms, each leg from its own side), then smoothed.
- The mesh is then re-posed into the builder's rest pose (arms down), so every animation clip plays on it as it is; the clips are
  copied over with the hips' travel scaled to the new hip height (other bones' position tracks dropped: they carry old lengths).
- Colour: skin and underwear as two flat swatches, the edge between them cut clean."""
import sys,os,io,json,struct,numpy as np
from scipy.spatial import cKDTree
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__));INP,OUT=sys.argv[1],sys.argv[2];ENV=lambda k,d:type(d)(os.environ.get(k,d))
CT={5126:np.float32,5125:np.uint32,5123:np.uint16,5122:np.int16,5121:np.uint8,5120:np.int8};NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
d=open(HERE+'/../out/base-plus-q3.glb','rb').read();L=struct.unpack('<I',d[12:16])[0];OJ=json.loads(d[20:20+L]);OB=d[20+L+8:]
def oacc(i):
    a=OJ['accessors'][i];bv=OJ['bufferViews'][a['bufferView']];return np.frombuffer(OB,CT[a['componentType']],a['count']*NC[a['type']],bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
sk=OJ['skins'][0];JN=sk['joints'];NJ=len(JN);name=[OJ['nodes'][j]['name'] for j in JN];short=[n.replace('mixamorig:','') for n in name];ix={n:i for i,n in enumerate(short)}
par_node={c:i for i,n in enumerate(OJ['nodes']) for c in n.get('children',[])};par=[JN.index(par_node[j]) if par_node.get(j) in JN else -1 for j in JN]
def qm(q):
    x,y,z,w=q;return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
qloc=[np.array(OJ['nodes'][j].get('rotation',[0,0,0,1]),float) for j in JN];tloc_old=[np.array(OJ['nodes'][j].get('translation',[0,0,0]),float) for j in JN]
order=sorted(range(NJ),key=lambda i:len([1 for _ in iter(lambda p=[i]:p.__setitem__(0,par[p[0]]) or (p[0] if p[0]>=0 else None),None)]))
Rr=[None]*NJ;po=[None]*NJ   # old rest: world rotation and position of every joint
for i in order:
    if par[i]<0:Rr[i]=qm(qloc[i]);po[i]=tloc_old[i]
    else:Rr[i]=Rr[par[i]]@qm(qloc[i]);po[i]=po[par[i]]+Rr[par[i]]@tloc_old[i]
po=np.array(po);IBMo=oacc(sk['inverseBindMatrices']).reshape(-1,4,4);chk=np.array([np.linalg.inv(IBMo[k].T.astype(float))[:3,3] for k in range(NJ)])
print('  old skeleton: FK vs bind positions differ by at most %.4f m'%np.abs(chk-po).max());po=chk
op=OJ['meshes'][0]['primitives'][0];Xo=oacc(op['attributes']['POSITION']).astype(float);Jo=oacc(op['attributes']['JOINTS_0']).astype(int);Wo=oacc(op['attributes']['WEIGHTS_0']).astype(float)
if Wo.max()>1.5:Wo/=Wo.sum(1,keepdims=True)
Wod=np.zeros((len(Xo),NJ));np.add.at(Wod,(np.repeat(np.arange(len(Xo)),4),Jo.ravel()),Wo.ravel())
# ---- the new figure and its joints in the T-pose (x left, y up, z forward; metres)
Z=np.load(INP);P=Z['P'].astype(float);F=Z['F'].astype(int);white=Z['white'].astype(float)
JT={}
J=json.loads(os.environ.get('JOINTS','{}')) or {   # measured off the Plus figure (1.80 m)
 'Hips':[0,0.88,-0.02],'Spine':[0,0.97,-0.02],'Spine1':[0,1.07,-0.025],'Spine2':[0,1.17,-0.03],'Neck':[0,1.40,-0.02],'Head':[0,1.45,-0.015],'HeadTop_End':[0,1.80,-0.015],'headfront':[0,1.45,0.19],
 'Shoulder':[0.05,1.30,-0.02],'Arm':[0.27,1.295,-0.01],'ForeArm':[0.50,1.285,-0.012],'Hand':[0.70,1.287,-0.018],'HandEnd':[0.852,1.287,-0.03],
 'UpLeg':[0.15,0.80,-0.02],'Leg':[0.14,0.50,-0.01],'Foot':[0.12,0.115,-0.03],'ToeBase':[0.12,0.03,0.12],'Toe_End':[0.12,0.025,0.245]}
for n in ('Hips','Spine','Spine1','Spine2','Neck','Head','HeadTop_End','headfront'):JT[n]=np.array(J[n],float)
Q={}   # per bone: the rotation between the old rest pose and the T-pose (identity for the trunk, legs and head)
def rot_to(a,b):
    v=np.cross(a,b);c=float(a@b);K=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]]);return np.eye(3)+K+K@K/(1+c)
def rx(a):c,s=np.cos(a),np.sin(a);return np.array([[1,0,0],[0,c,-s],[0,s,c]])
for side,sg in (('Left',1),('Right',-1)):
    m=np.array([sg,1,1.0])
    for n in ('Shoulder','Arm','ForeArm','Hand','UpLeg','Leg','Foot','ToeBase','Toe_End'):JT[side+n]=np.array(J[n],float)*m
    # arm: old rest (hanging, thumb forward) -> T (out to the side, thumb up): swing, then a quarter twist shared between forearm and hand
    cd_=np.radians(ENV('COLLARDROP',20.0))*sg;c_,s_=np.cos(cd_),np.sin(cd_);Q[side+'Shoulder']=np.array([[c_,-s_,0],[s_,c_,0],[0,0,1.0]])   # the shoulder girdle drops with the arm (rest = T turned down)
    do=po[ix[side+'Hand']]-po[ix[side+'Arm']];do/=np.linalg.norm(do);Qs=rot_to(do,np.array([sg,0,0.0]));tw=ENV('TWIST',-90.0)
    Q[side+'Arm']=Qs;Q[side+'ForeArm']=rx(np.radians(tw*0.5))@Qs;Qh=rx(np.radians(tw))@Qs
    # hand and fingers: her old hand laid on the new one (wrist on wrist, middle finger along the arm), scaled to its length
    w_o=po[ix[side+'Hand']];tip_o=po[ix[side+'HandMiddle4']];Lo=np.linalg.norm(tip_o-w_o);w_n=JT[side+'Hand'];Ln=np.linalg.norm(np.array(J['HandEnd'])*m-w_n)*ENV('HANDK',0.97)
    Qf=rot_to(Qh@((tip_o-w_o)/Lo),(np.array(J['HandEnd'])*m-w_n)/np.linalg.norm(np.array(J['HandEnd'])*m-w_n))@Qh
    for i,n in enumerate(short):
        if n.startswith(side+'Hand'):
            Q[n]=Qf
            if n!=side+'Hand':JT[n]=w_n+Qf@(po[i]-w_o)*(Ln/Lo)
RT=[Q.get(n,np.eye(3))@Rr[i] for i,n in enumerate(short)];pT=np.array([JT[n] for n in short])
# ---- rest skeleton: old local rotations, offsets from the T-pose joints in the parent's T frame
tloc=[None]*NJ;pR=[None]*NJ
for i in order:
    if par[i]<0:tloc[i]=pT[i].copy();pR[i]=pT[i].copy()   # the hips (the armature root carries no transform)
    else:tloc[i]=RT[par[i]].T@(pT[i]-pT[par[i]]);pR[i]=pR[par[i]]+Rr[par[i]]@tloc[i]
pR=np.array(pR)
def M4(R,p):
    M=np.eye(4);M[:3,:3]=R;M[:3,3]=p;return M
# ---- weights: old body posed onto the T skeleton (each bone scaled to its new length), nearest old skin
child={i:[c for c in range(NJ) if par[c]==i] for i in range(NJ)}
def blen(P_,i):
    c=child[i];return np.linalg.norm(P_[c[0]]-P_[i]) if c else 0
A=[]
for i in range(NJ):
    lo,ln=blen(po,i),blen(pT,i);s=np.clip(ln/lo,0.6,1.8) if lo>1e-4 and ln>1e-4 else 1.0
    S=M4(RT[i]*s,pT[i])@np.linalg.inv(M4(Rr[i],po[i]));A.append(S)
A=np.array(A);Xh=np.c_[Xo,np.ones(len(Xo))];Xp=np.einsum('vj,jab,vb->va',Wod,A,Xh)[:,:3]
armw=lambda s_:Wod[:,[i for i,n in enumerate(short) if n.startswith(s_) and ('Arm' in n or 'Hand' in n)]].sum(1)
legw=lambda s_:Wod[:,[i for i,n in enumerate(short) if n.startswith(s_) and ('Leg' in n or 'Foot' in n or 'Toe' in n)]].sum(1)
anyarm=armw('Left')+armw('Right');W=np.zeros((len(P),NJ))
def take(dst,src):
    if not dst.any():return
    si=np.where(src)[0];dd,kk=cKDTree(Xp[si]).query(P[dst],k=4);w=1/(dd+1e-3);w/=w.sum(1,keepdims=True);W[dst]=(Wod[si[kk]]*w[:,:,None]).sum(1)
AX=ENV('ARMX',0.33);LY=ENV('LEGY',0.74)
for side,sg in (('Left',1),('Right',-1)):
    oth='Right' if side=='Left' else 'Left'
    take(sg*P[:,0]>AX,(armw(side)>0.5)|((anyarm<0.2)&(sg*Xo[:,0]>0)&(Xo[:,1]>1.0)))                       # arm: from that arm (and the shoulder beside it)
    take((sg*P[:,0]>=0)&(np.abs(P[:,0])<=AX)&(P[:,1]<LY),(legw(oth)<0.3)&(anyarm<0.2))                    # leg and hip: never the other leg
    take((sg*P[:,0]>=0)&(np.abs(P[:,0])<=AX)&(P[:,1]>=LY),(anyarm<0.5)|(armw(side)>0))                    # trunk and head
E=np.unique(np.sort(np.r_[F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]],axis=1),axis=0);deg=np.zeros(len(P));np.add.at(deg,E[:,0],1);np.add.at(deg,E[:,1],1);deg=np.maximum(deg,1)
for _ in range(ENV('WSM',12)):
    nb=np.zeros_like(W);np.add.at(nb,E[:,0],W[E[:,1]]);np.add.at(nb,E[:,1],W[E[:,0]]);W=0.5*W+0.5*nb/deg[:,None]
hd=ix['Head'];top=P[:,1]>ENV('HEADY',1.44);W[top]=0;W[top,hd]=1   # the head is rigid: the face is drawn on it
band=(P[:,1]>ENV('HEADY',1.44)-ENV('NECKBAND',0.07))&~top&(np.abs(P[:,0])<0.3)   # under the head: weights ease from the rigid head into the neck and shoulders
for _ in range(ENV('NECKSM',10)):
    nb=np.zeros_like(W);np.add.at(nb,E[:,0],W[E[:,1]]);np.add.at(nb,E[:,1],W[E[:,0]]);W[band]=(0.5*W+0.5*nb/deg[:,None])[band]
t4=np.argsort(-W,axis=1)[:,:4];w4=np.take_along_axis(W,t4,1);w4/=w4.sum(1,keepdims=True);W=np.zeros_like(W);np.put_along_axis(W,t4,w4,1)
# ---- re-pose T -> rest
MB=np.array([M4(Rr[i],pR[i])@np.linalg.inv(M4(RT[i],pT[i])) for i in range(NJ)]);PR=np.einsum('vj,jab,vb->va',W,MB,np.c_[P,np.ones(len(P))])[:,:3]
PR[:,1]-=min(0,PR[:,1].min());print('  rest pose: height %.3f, hands at y %.2f, hips joint y %.3f (old %.3f)'%(PR[:,1].max(),pR[ix['LeftHand'],1],pR[ix['Hips'],1],po[ix['Hips'],1]))
# ---- colour: cut along the skin / underwear edge, two swatches
f=white-0.5;f[np.abs(f)<1e-6]=-1e-6;pos=f[F]>0;n=pos.sum(1);mx=(n==1)|(n==2)
Fm=F[mx];lone=np.where(n[mx]==1,np.argmax(pos[mx],1),np.argmin(pos[mx],1));r=np.arange(len(Fm));A_=Fm[r,lone];B_=Fm[r,(lone+1)%3];C_=Fm[r,(lone+2)%3]
Es=np.sort(np.r_[np.c_[A_,B_],np.c_[A_,C_]],1);ue,inv=np.unique(Es,axis=0,return_inverse=True);inv=inv.ravel();i_,j_=ue[:,0],ue[:,1];t=np.clip(f[i_]/(f[i_]-f[j_]),1e-3,1-1e-3)[:,None]
lerp=lambda X:np.r_[X,X[i_]+(X[j_]-X[i_])*t];nid=len(P)+np.arange(len(ue));p_=nid[inv[:len(Fm)]];q_=nid[inv[len(Fm):]]
F2=np.r_[F[~mx],np.c_[A_,p_,q_],np.c_[p_,B_,C_],np.c_[p_,C_,q_]];PR2=lerp(PR);W2=lerp(W);f2=np.r_[f,np.zeros(len(ue))];flab=(f2[F2].mean(1)>0).astype(int)
vid={};NV=[];NF=np.zeros_like(F2)
for ti,tr in enumerate(F2):
    for c in range(3):
        k=(tr[c],flab[ti])
        if k not in vid:vid[k]=len(NV);NV.append(k)
        NF[ti,c]=vid[k]
src=np.array([a for a,_ in NV]);vl=np.array([b for _,b in NV]);V=PR2[src];Wv=W2[src]
fn=np.cross(PR2[F2[:,1]]-PR2[F2[:,0]],PR2[F2[:,2]]-PR2[F2[:,0]]);N=np.zeros_like(PR2)
for k in range(3):np.add.at(N,F2[:,k],fn)
N/=np.linalg.norm(N,axis=1,keepdims=True).clip(1e-12);VN=N[src]
t4=np.argsort(-Wv,axis=1)[:,:4];w4=np.take_along_axis(Wv,t4,1);w4/=w4.sum(1,keepdims=True)
SKIN=[int(x) for x in os.environ.get('SKIN','239,184,146').split(',')];UND=[int(x) for x in os.environ.get('UNDER','246,243,238').split(',')]
tex=np.zeros((16,32,3),np.uint8);tex[:,:16]=SKIN;tex[:,16:]=UND;buf=io.BytesIO();Image.fromarray(tex).save(buf,'PNG');IMG=buf.getvalue();UV=np.c_[(vl*16+8)/32.0,np.full(len(vl),0.5)]
# ---- write: skeleton, mesh, clips
BIN=bytearray();views=[];accs=[]
def add(arr,comp,typ,mm=False,norm=False):
    while len(BIN)%4:BIN.append(0)
    views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':arr.nbytes});BIN.extend(arr.tobytes());a={'bufferView':len(views)-1,'componentType':comp,'type':typ,'count':int(arr.shape[0])}
    if mm:a['min']=[float(x) for x in np.atleast_2d(arr).reshape(arr.shape[0],-1).min(0)];a['max']=[float(x) for x in np.atleast_2d(arr).reshape(arr.shape[0],-1).max(0)]
    if norm:a['normalized']=True
    accs.append(a);return len(accs)-1
nodes=[{'name':name[i],'rotation':[float(x) for x in qloc[i]],'translation':[float(x) for x in tloc[i]]} for i in range(NJ)]
for i in range(NJ):
    if child[i]:nodes[i]['children']=child[i]
IBM=np.array([np.linalg.inv(M4(Rr[i],pR[i])).T for i in range(NJ)],np.float32)
nodes.append({'name':'body','mesh':0,'skin':0});nodes.append({'name':'SmartRigArmature','children':[i for i in range(NJ) if par[i]<0]+[NJ]})
pr={'attributes':{'POSITION':add(V.astype(np.float32),5126,'VEC3',True),'NORMAL':add(VN.astype(np.float32),5126,'VEC3'),'TEXCOORD_0':add(UV.astype(np.float32),5126,'VEC2'),
    'JOINTS_0':add(t4.astype(np.uint16),5123,'VEC4'),'WEIGHTS_0':add(w4.astype(np.float32),5126,'VEC4')},'indices':add(NF.astype(np.uint32).reshape(-1),5125,'SCALAR'),'material':0}
ibm=add(IBM.reshape(-1,16),5126,'MAT4')
k_h=pR[ix['Hips'],1]/po[ix['Hips'],1];anims=[];tcache={}
for a in OJ['animations']:
    sam=[];ch=[]
    for c in a['channels']:
        nd=c['target']['node'];pth=c['target']['path']
        if nd not in JN or pth=='scale':continue
        ji=JN.index(nd)
        if pth=='translation' and short[ji]!='Hips':continue
        s=a['samplers'][c['sampler']]
        if s['input'] not in tcache:
            tt=oacc(s['input']).astype(np.float32).ravel();tcache[s['input']]=add(tt,5126,'SCALAR',True)
        oa=OJ['accessors'][s['output']];val=oacc(s['output'])
        if pth=='translation':out=add((val.astype(np.float32)*k_h).astype(np.float32),5126,'VEC3')
        else:out=add(np.ascontiguousarray(val),oa['componentType'],'VEC4',norm=bool(oa.get('normalized')))
        sam.append({'input':tcache[s['input']],'output':out,'interpolation':s.get('interpolation','LINEAR')});ch.append({'sampler':len(sam)-1,'target':{'node':ji,'path':pth}})
    anims.append({'name':a['name'],'samplers':sam,'channels':ch})
while len(BIN)%4:BIN.append(0)
views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':len(IMG)});BIN.extend(IMG)
while len(BIN)%4:BIN.append(0)
GJ={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[NJ+1]}],'nodes':nodes,'meshes':[{'name':'body','primitives':[pr],'extras':{'targetNames':[]}}],
    'skins':[{'joints':list(range(NJ)),'inverseBindMatrices':ibm,'skeleton':NJ+1}],'animations':anims,
    'materials':[{'name':'Base','doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':0.9}}],'textures':[{'source':0,'sampler':0}],'samplers':[{'magFilter':9728,'minFilter':9728}],
    'images':[{'bufferView':len(views)-1,'mimeType':'image/png'}],'bufferViews':views,'accessors':accs,'buffers':[{'byteLength':len(BIN)}]}
js=json.dumps(GJ,separators=(',',':')).encode()
while len(js)%4:js+=b' '
open(OUT,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(BIN))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(BIN),0x004E4942)+bytes(BIN))
np.savez_compressed(OUT[:-4]+'_rest.npz',P=V.astype(np.float32),F=NF.astype(np.int32),lab=vl,joints=pR.astype(np.float32),names=np.array(short))
print('  wrote',OUT,'%.2f MB, %d points %d tris, %d clips, hips travel x%.3f'%(len(BIN)/1e6,len(V),len(NF),len(anims),k_h))
