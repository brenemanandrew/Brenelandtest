"""Andrew's fall blouse (Peter Pan collar, cream cuffs, centre placket, 3 buttons) built in Blender from her own body.
/home/claude/bvenv/bin/python blouse_blender.py [SLOT_KEY] [outdir]      default top_f_fallblouse3 -> out/clean/
- Her fitting body (all 4 builds as shape keys, skin weights as float layers) goes into a Blender bmesh. Blender cuts it with
  planes: hem on the waistline (HEMY), cuffs at the wrists, neckline at the base of the neck. Cuts carry the shapes and weights.
- One continuous piece (torso and sleeves share the armpit), so nothing opens under the arms. Each build wears its own exact fit.
- Puffed sleeves gathered into cuffs, a little flare at the hem, then layers on top: cream Peter Pan collar, cream cuffs,
  a raised placket and three cream buttons. Every cut edge gets a folded rim so it reads thick, not paper-thin.
- Output in the builder's format (base build plus, other builds as shapes, extras.cover / extras.under)."""
import sys,os,io,json,struct,numpy as np
import bpy,bmesh
from scipy.spatial import cKDTree
HERE=os.path.dirname(os.path.abspath(__file__));NAME=sys.argv[1] if len(sys.argv)>1 else 'top_f_fallblouse3';OUTD=sys.argv[2] if len(sys.argv)>2 else HERE+'/../out/clean'
# her body, weights, build shapes and shoulder lift: the same preamble the fitting script uses
sys.argv=['x',HERE+'/../in_clean/f_fallblouse2.npz','top_f_x','f'];__file__=HERE+'/fit_clean.py'
exec(open(HERE+'/fit_clean.py').read().split('def fit_top')[0])
ENV=lambda k,d:type(d)(os.environ.get(k,d))
BL=['plus','average','slim','athletic']
ORANGE=[int(x) for x in os.environ.get('BASE','196,98,58').split(',')];CREAM=[int(x) for x in os.environ.get('ACCENT','243,229,203').split(',')]
HEMY=ENV('HEMY',0.985)
SLEND=ENV('SLEEVEEND',0.05)   # >=0: sleeves end this far past the elbow joint (Andrew: cuffs at the elbows); <0: at the wrists
BANDH=ENV('BANDH',0.04)       # >0: a cream band this tall round the hem            # hem on the waistline (the skirt's waistband is at 1.058, so the blouse just covers it)
# ---- weld the body (UV seams split points) so the cloth has no cracks
_,binv=np.unique(np.round(BP*1e5).astype(np.int64),axis=0,return_inverse=True);binv=binv.ravel();nwb=binv.max()+1
def weld(A):W=np.zeros((nwb,)+A.shape[1:]);W[binv]=A;return W
XW={b:weld(body_of(b)) for b in BL};WW=weld(Wd);LW=weld(LIFT)
FW=binv[BF];FW=FW[(FW[:,0]!=FW[:,1])&(FW[:,1]!=FW[:,2])&(FW[:,0]!=FW[:,2])]
armw=weld(jw(('Arm','ForeArm','Hand')));handw=weld(jw(('Hand',)));neckw=weld(jw(('Neck','Head')));legw=weld(jw(('UpLeg','Leg','Foot')))
X0=XW['plus']
keep=(neckw<0.95)&(handw<0.9)&(legw<0.5)&((X0[:,1]>HEMY-0.06)|(armw>0.5))
FK=FW[keep[FW].all(1)]
usedJ=np.where(WW[keep].max(0)>0)[0]
# ---- Blender: build the mesh with shape keys and weights, then cut it with planes
bm=bmesh.new();SK={b:bm.verts.layers.shape.new(b) for b in BL[1:]};JL={j:bm.verts.layers.float.new('j%d'%j) for j in usedJ}
LL=bm.verts.layers.float.new('lift');AL=bm.verts.layers.float.new('armw')
vid={};vs=[]
for i in np.unique(FK):
    v=bm.verts.new(X0[i].tolist());vid[i]=v
for i,v in vid.items():
    for b in BL[1:]:v[SK[b]]=XW[b][i].tolist()
    for j in usedJ:v[JL[j]]=float(WW[i,j])
    v[LL]=float(LW[i]);v[AL]=float(armw[i])
for f in FK:
    try:bm.faces.new([vid[i] for i in f])
    except ValueError:pass
bm.verts.ensure_lookup_table()
def side_geom(test):
    fs=[f for f in bm.faces if test(np.array([v.co[:] for v in f.verts]),np.array([v[AL] for v in f.verts]))]
    es=list({e for f in fs for e in f.edges});vv=list({v for f in fs for v in f.verts});return vv+es+fs
def cut(co,no,test):
    bmesh.ops.bisect_plane(bm,geom=side_geom(test),plane_co=co,plane_no=no,clear_outer=True,dist=1e-5)
# hem: the torso only (the arms hang below the waist in the bind pose)
cut((0,HEMY,0),(0,-1,0),lambda P,A:A.mean()<0.5)
# wrists: a plane across each forearm just before the hand
for s,sg in (('Left',1),('Right',-1)):
    Ej,Hj=JPOS['mixamorig:'+s+'ForeArm'],JPOS['mixamorig:'+s+'Hand'];d=(Hj-Ej)/np.linalg.norm(Hj-Ej)
    co_=(Ej+d*SLEND) if SLEND>=0 else (Hj-d*ENV('CUFFBACK',0.012))
    cut(tuple(co_),tuple(d),lambda P,A,sg=sg:(A.mean()>0.3)&(sg*(P[:,0].mean()-MID)>0.08))
# neckline: a plane through the base of the neck, a little lower at the front
FY,BY=ENV('NECKF',1.283),ENV('NECKB',1.300);F_=np.array([MID,FY,0.06]);B_=np.array([MID,BY,-0.10]);n_=np.cross(B_-F_,[1,0,0]);n_/=np.linalg.norm(n_);n_=n_ if n_[1]>0 else -n_
cut(tuple(F_),tuple(n_),lambda P,A:P[:,1].max()>FY-0.08)
# drop crumbs (pieces cut loose)
bm.verts.ensure_lookup_table();bm.faces.ensure_lookup_table()
lab=-np.ones(len(bm.verts),int);cur=0
for v0 in bm.verts:
    if lab[v0.index]>=0:continue
    st=[v0];lab[v0.index]=cur
    while st:
        v=st.pop()
        for e in v.link_edges:
            w=e.other_vert(v)
            if lab[w.index]<0:lab[w.index]=cur;st.append(w)
    cur+=1
big=np.argmax(np.bincount(lab));bmesh.ops.delete(bm,geom=[v for v in bm.verts if lab[v.index]!=big],context='VERTS')
bm.verts.ensure_lookup_table();bm.verts.index_update()
S={'plus':np.array([v.co[:] for v in bm.verts])}
for b in BL[1:]:S[b]=np.array([v[SK[b]][:] for v in bm.verts])
Wv=np.zeros((len(bm.verts),NJ))
for j in usedJ:Wv[:,j]=[v[JL[j]] for v in bm.verts]
LFv=np.array([v[LL] for v in bm.verts]);Av=np.array([v[AL] for v in bm.verts])
F=np.array([[v.index for v in f.verts] for f in bm.faces if len(f.verts)==3]+[[f.verts[0].index,f.verts[i].index,f.verts[i+1].index] for f in bm.faces if len(f.verts)>3 for i in range(1,len(f.verts)-1)])
print('  Blender: %d points, %d triangles after the hem, wrist and neck cuts'%(len(S['plus']),len(F)))
# ---- offsets (how far the cloth stands off her): fitted torso, a little flare at the hem, puffed sleeves gathered at the cuff
P0=S['plus'];E=np.unique(np.sort(np.r_[F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]],axis=1),axis=0);deg=np.zeros(len(P0));np.add.at(deg,E[:,0],1);np.add.at(deg,E[:,1],1);deg=np.maximum(deg,1)
def sm(A,it):
    for _ in range(it):
        nb=np.zeros_like(A);np.add.at(nb,E[:,0],A[E[:,1]]);np.add.at(nb,E[:,1],A[E[:,0]]);A=0.5*A+0.5*nb/(deg if A.ndim==1 else deg[:,None])
    return A
def armu(P):   # 0 at the shoulder joint .. 1 at the wrist, along the arm bones
    u=np.zeros(len(P))
    for s,sg in (('Left',1),('Right',-1)):
        Sj,Ej,Hj=[JPOS['mixamorig:'+s+k] for k in ('Arm','ForeArm','Hand')];Lu,Lf=np.linalg.norm(Ej-Sj),np.linalg.norm(Hj-Ej)
        t1=np.clip((P-Sj)@(Ej-Sj)/Lu**2,0,1);t2=np.clip((P-Ej)@(Hj-Ej)/Lf**2,0,1);d1=np.linalg.norm(P-(Sj+np.outer(t1,Ej-Sj)),axis=1);d2=np.linalg.norm(P-(Ej+np.outer(t2,Hj-Ej)),axis=1)
        us=np.where(d1<d2,t1*Lu,Lu+t2*Lf)/(Lu+Lf);u=np.where(sg*(P[:,0]-MID)>0,us,u)
    return u
U=armu(P0)
Lu_=np.linalg.norm(JPOS['mixamorig:LeftForeArm']-JPOS['mixamorig:LeftArm']);Lf_=np.linalg.norm(JPOS['mixamorig:LeftHand']-JPOS['mixamorig:LeftForeArm'])
UEND=(Lu_+SLEND)/(Lu_+Lf_) if SLEND>=0 else 1.0;CU=ENV('CUFFU',UEND-ENV('CUFFW',0.05)/(Lu_+Lf_)) if SLEND>=0 else CU
a=np.clip(sm(Av,6),0,1)
o_t=ENV('OT',0.009)+ENV('FLARE',0.012)*ss((HEMY+0.05-P0[:,1])/0.05)
bump=ss((U-ENV('PUFF0',0.06))/0.25)*(1-ss((U-(CU-0.035))/0.05))   # balloon: grows from the shoulder, gathered into the cuff
o_s=ENV('OS',0.010)+ENV('PUFF',0.05)*bump
pit=np.exp(-((a-0.5)/0.18)**2)   # the armpit: arm and trunk meet, keep the cloth close so they do not cut into each other
o=sm(o_t*(1-a)+o_s*a,8);o=o*(1-0.5*pit)
def vn(X,Fc):
    fn=np.cross(X[Fc[:,1]]-X[Fc[:,0]],X[Fc[:,2]]-X[Fc[:,0]]);N=np.zeros_like(X)
    for k in range(3):np.add.at(N,Fc[:,k],fn)
    return N/np.linalg.norm(N,axis=1,keepdims=True).clip(1e-12)
NB={b:sm(vn(S[b],F),2) for b in BL}
for b in BL:NB[b]/=np.linalg.norm(NB[b],axis=1,keepdims=True).clip(1e-12)
inner=ENV('PUFFIN',0.35)+(1-ENV('PUFFIN',0.35))*ss((np.sign(P0[:,0]-MID)*NB['plus'][:,0]+0.3)/0.6)   # less puff on the side facing her body
o=sm(o_t*(1-a)+(ENV('OS',0.010)+ENV('PUFF',0.05)*bump*inner)*a,8);o=o*(1-0.5*pit)
# ---- region fields on the base build (>0 inside), each layer cut along its own clean line
zc=-0.017;th=np.arctan2(P0[:,0]-MID,P0[:,2]-zc);front=np.cos(th)
bnd=E[np.isin(E[:,0],E[:,1])|True]
ec={};
for f in F:
    for i,j in ((f[0],f[1]),(f[1],f[2]),(f[2],f[0])):k=(min(i,j),max(i,j));ec[k]=ec.get(k,0)+1
BE_=np.array([k for k,c in ec.items() if c==1])
bv=np.unique(BE_);neckline=bv[P0[bv,1]>FY-0.04];dneck=cKDTree(P0[neckline]).query(P0)[0];dneck=sm(dneck,ENV('NSM',20))
# Peter Pan collar: a band round the neck, two rounded lobes at the front, split at the centre front
lob=np.max([ENV('LOBR',0.056)-np.hypot(np.abs(P0[:,0]-MID)-ENV('LOBX',0.05),dneck-ENV('LOBD',0.016)) for _ in (0,)],0)
fcol=np.where(front>0.35,np.maximum(lob,0.016-dneck),ENV('COLW',0.035)-dneck);fcol=np.minimum(fcol,np.where(front>0.35,np.abs(P0[:,0]-MID)+ENV('CMEET',0.004)-ENV('VGAP',0.0)*dneck,1.0));fcol=np.minimum(fcol,0.5-a);fcol=np.minimum(fcol,np.where(front>0.35,1.0,ENV('CXMAX',0.088)-np.abs(P0[:,0]-MID)))   # Andrew: the collar ends before the shoulders
fband=np.where(a<0.5,(HEMY+BANDH)-P0[:,1],-1.0) if BANDH>0 else np.full(len(P0),-1.0)
fcuff=U-CU;fcuff=np.where(a>0.5,fcuff,-1.0)
dax=np.full(len(P0),9.0)
for s_,sg_ in (('Left',1),('Right',-1)):
    Sj,Ej=JPOS['mixamorig:'+s_+'Arm'],JPOS['mixamorig:'+s_+'ForeArm'];ax=(Ej-Sj)/np.linalg.norm(Ej-Sj);r_=(P0-Sj)-np.outer((P0-Sj)@ax,ax)
    dd=np.linalg.norm(r_,axis=1);dax=np.where(sg_*(P0[:,0]-MID)>0.04,np.minimum(dax,dd),dax)
fseam=ENV('SEAMW',0.005)-np.abs(dax-ENV('ARMR',0.075))
fpl=np.minimum(ENV('PLW',0.026)-np.abs(P0[:,0]-MID),front-0.6);fpl=np.minimum(fpl,0.5-a)
def cutf(Fc,f,arrs):
    f=f.copy();f[np.abs(f)<1e-9]=-1e-9;pos=f[Fc]>0;n=pos.sum(1);mx=(n==1)|(n==2)
    if not mx.any():return Fc,arrs
    Fm=Fc[mx];lone=np.where(n[mx]==1,np.argmax(pos[mx],1),np.argmin(pos[mx],1));r=np.arange(len(Fm));A_=Fm[r,lone];B_=Fm[r,(lone+1)%3];C_=Fm[r,(lone+2)%3]
    Es=np.sort(np.r_[np.c_[A_,B_],np.c_[A_,C_]],1);ue,inv=np.unique(Es,axis=0,return_inverse=True);inv=inv.ravel();i_,j_=ue[:,0],ue[:,1]
    t=np.clip(f[i_]/(f[i_]-f[j_]),1e-3,1-1e-3);nid=len(f)+np.arange(len(ue))
    out=[np.r_[X,X[i_]+(X[j_]-X[i_])*t.reshape(-1,*[1]*(X.ndim-1))] for X in arrs];p=nid[inv[:len(Fm)]];q=nid[inv[len(Fm):]]
    return np.r_[Fc[~mx],np.c_[A_,p,q],np.c_[p,B_,C_],np.c_[p,C_,q]],out
arrs=[S[b] for b in BL]+[NB[b] for b in BL]+[o,Wv,LFv,fcol,fcuff,fpl,fband,U,fseam]
for k in (len(arrs)-6,len(arrs)-5,len(arrs)-4,len(arrs)-3,len(arrs)-1):F,arrs=cutf(F,arrs[k],arrs)
S={b:arrs[i] for i,b in enumerate(BL)};NB={b:arrs[4+i] for i,b in enumerate(BL)};o,Wv,LFv,fcol,fcuff,fpl,fband,U,fseam=arrs[8:]
for b in BL:NB[b]/=np.linalg.norm(NB[b],axis=1,keepdims=True).clip(1e-12)
fcen=lambda f:f[F].mean(1)
# cloth bridges hollows (between and under the breasts) instead of following the skin into them: smooth the outer surface, never closer than OMIN
E2=np.unique(np.sort(np.r_[F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]],axis=1),axis=0);dg2=np.zeros(len(o));np.add.at(dg2,E2[:,0],1);np.add.at(dg2,E2[:,1],1);dg2=np.maximum(dg2,1)
ec2={}
for f in F:
    for i,j in ((f[0],f[1]),(f[1],f[2]),(f[2],f[0])):k=(min(i,j),max(i,j));ec2[k]=ec2.get(k,0)+1
isb=np.zeros(len(o),bool);isb[np.array([k for k,c in ec2.items() if c==1]).ravel()]=True   # open edges stay put (smoothing would curl them)
dneck2=cKDTree(S['plus'][isb&(S['plus'][:,1]>FY-0.04)]).query(S['plus'])[0]
aT=np.clip(sum(Wv[:,j] for j in range(NJ) if any(k in jn[j] for k in ('Arm','Hand'))),0,1);D={}
for b in BL:
    Pb=S[b]+NB[b]*o[:,None]
    fr_=np.cos(np.arctan2(S['plus'][:,0]-MID,S['plus'][:,2]-zc));m_=(fr_>0.2)&(aT<0.3)&(S['plus'][:,1]>HEMY)&(S['plus'][:,1]<FY-0.02)
    yb=np.round(S['plus'][:,1]/ENV('SLICE',0.012)).astype(int)
    for k_ in np.unique(yb[m_]):   # front: cloth spans straight across hollows (upper hull in each slice), like real cloth over the bust
        ii=np.where(m_&(yb==k_))[0]
        if len(ii)<3:continue
        ii=ii[np.argsort(Pb[ii,0])];hx=[];hz=[]
        for p in ii:
            while len(hx)>=2 and (hx[-1]-hx[-2])*(Pb[p,2]-hz[-2])-(hz[-1]-hz[-2])*(Pb[p,0]-hx[-2])>=0:hx.pop();hz.pop()
            hx.append(Pb[p,0]);hz.append(Pb[p,2])
        Pb[ii,2]=np.maximum(Pb[ii,2],np.interp(Pb[ii,0],hx,hz))
    wt=((1-aT)*ss((dneck2-0.04)/0.04)*(~isb))[:,None];bdy=Body(body_of(b));lo=np.minimum(o,ENV('OMIN',0.007))
    for it in range(ENV('BRIDGE',120)):
        nb=np.zeros_like(Pb);np.add.at(nb,E2[:,0],Pb[E2[:,1]]);np.add.at(nb,E2[:,1],Pb[E2[:,0]]);Pb=Pb+wt*0.5*(nb/dg2[:,None]-Pb)
        if it%4==3 or it==ENV('BRIDGE',120)-1:
            d_,i_=bdy.sd(Pb);Pb=Pb+bdy.SN[i_]*np.maximum(0,lo-d_)[:,None]   # never closer to her than OMIN (true distance, not along one normal)
    D[b]=Pb
NS_={b:vn(D[b],F) for b in BL}   # layers on top stand off the cloth surface, not her skin
# ---- assemble layers: each is (faces, extra offset, colour); rims fold every open edge back toward her
OUTV={b:[] for b in BL};OUTW=[];OUTL=[];OUTC=[];OUTF=[];nv=[0]
def emit(idx,extra,col,lift_rim=None,rimD=False):
    m={};base=nv[0]
    for k,i in enumerate(idx):m[i]=base+k
    for b in BL:OUTV[b].append(D[b][idx]+NS_[b][idx]*extra[:,None] if lift_rim is None else (D[b][idx]+NS_[b][idx]*lift_rim if rimD else S[b][idx]+NB[b][idx]*lift_rim))
    OUTW.append(Wv[idx]);OUTL.append(LFv[idx]);OUTC.append(np.full(len(idx),col));nv[0]+=len(idx);return m
def layer(Fl,extra,col,rim=True,rimD=False):
    idx=np.unique(Fl);m=emit(idx,np.full(len(idx),extra) if np.ndim(extra)==0 else extra[idx],col);OUTF.append(np.vectorize(m.get)(Fl))
    if rim:
        ec={}
        for f in Fl:
            for i,j in ((f[0],f[1]),(f[1],f[2]),(f[2],f[0])):k=(min(i,j),max(i,j));ec[k]=ec.get(k,(0,(i,j)));ec[k]=(ec[k][0]+1,(i,j))
        be=np.array([e for c,e in ec.values() if c==1])
        if len(be):
            ri=np.unique(be);mi=emit(ri,None,col,lift_rim=(0.0 if rimD else ENV('RIM',0.003)),rimD=rimD);a_=np.vectorize(m.get)(be);b_=np.vectorize(mi.get)(be)
            OUTF.append(np.r_[np.c_[a_[:,0],a_[:,1],b_[:,1]],np.c_[a_[:,0],b_[:,1],b_[:,0]]])
layer(F,0.0,0)                                              # the blouse
layer(F[fcen(fseam)>0],ENV('SEAMUP',0.002),2,rimD=True)   # sleeve seam                   # the placket, raised
tc=np.clip((U-CU)/max(UEND-CU,1e-6),0,1);layer(F[fcen(fcuff)>0],ENV('CUFFUP',0.012)+0*tc,1,rimD=True)   # rolled cuff               # cream cuffs, standing out from the gathered sleeve
tb=np.clip((HEMY+BANDH-S['plus'][:,1])/max(BANDH,1e-6),0,1)
if BANDH>0:layer(F[fcen(fband)>0],ENV('BANDUP',0.010)+0*tb,ENV('BANDCOL',1),rimD=True)   # rolled hem   # cream band round the hem
if not ENV('COLLAR3D',1):layer(F[fcen(fcol)>0],ENV('COLUP',0.009),1,rimD=True)   # old: collar painted on the blouse surface
else:   # Peter Pan collar as its own solid piece: a ring on the neckline, flatter than her shoulders, two rounded lobes meeting at the centre front
    ecn={}
    for f in F:
        for i,j in ((f[0],f[1]),(f[1],f[2]),(f[2],f[0])):k=(min(i,j),max(i,j));ecn[k]=ecn.get(k,0)+1
    bvv=np.unique(np.array([k for k,c in ecn.items() if c==1]).ravel());Pp=S['plus']
    nl=bvv[(Pp[bvv,1]>FY-0.05)&(np.abs(Pp[bvv,0]-MID)<0.12)]
    th_=np.arctan2(Pp[nl,0]-MID,Pp[nl,2]-zc);o_=np.argsort(th_);nl=nl[o_];th_=th_[o_]
    NR=ENV('CNR',120);TH=np.linspace(-np.pi,np.pi,NR,endpoint=False)+np.pi/NR
    def ring(A):   # resample a per-point array round the neck by angle
        A=np.asarray(A,float);A2=A.reshape(len(A),-1);thx=np.r_[th_-2*np.pi,th_,th_+2*np.pi];Ax=np.r_[A2,A2,A2]
        return np.stack([np.interp(TH,thx,Ax[:,c]) for c in range(A2.shape[1])],1).reshape((NR,)+A.shape[1:])
    at=np.abs(TH)   # 0 at the centre front, pi at the back
    WB,WF=ENV('CWB',0.032),ENV('CWF',0.052)
    w_=WB+(WF-WB)*ss((np.cos(TH)+0.1)/0.9)
    w_=w_*np.sqrt(np.clip(at/ENV('CTH0',0.55),0,1))*(0.35+0.65*np.clip(at/ENV('CTH0',0.55),0,1))+ENV('CMIN',0.004)   # rounded lobes that meet at the front
    DROP=np.tan(np.radians(ENV('CDROP',20)+ENV('CDROPF',38)*ss((np.cos(TH)-0.2)/0.7)));TK=ENV('CTK',0.006);UP=ENV('CUP',0.004)   # front lobes lie on the chest, sides stay flat;TK=ENV('CTK',0.006);UP=ENV('CUP',0.004)
    Wn=ring(Wv[nl]);sh_=[j for j in range(NJ) if any(k in jn[j] for k in ('Shoulder','Arm'))];sp2=ji('Spine2')
    Wn[:,sp2]+=Wn[:,sh_].sum(1);Wn[:,sh_]=0   # on the neck and upper back only: her shoulder lift cannot tilt it
    Ln=ring(LFv[nl])
    RW=ENV('CROWS',7);tr_=np.linspace(0,1,RW)
    for b in BL:
        Pn=ring(D[b][nl]);Nn=ring(NS_[b][nl]);Nn/=np.linalg.norm(Nn,axis=1,keepdims=True)
        out=np.c_[np.sin(TH),np.zeros(NR),np.cos(TH)];c0=Pn+Nn*UP+np.c_[np.zeros(NR),np.full(NR,0.002),np.zeros(NR)]
        ww=np.minimum(w_,np.maximum(ENV('CXMAX2',0.095)-np.abs(c0[:,0]-MID),0.004)/np.maximum(np.abs(np.sin(TH)),0.3))   # ends before the shoulders
        tD=cKDTree(D[b]);top=[];
        for t_ in tr_:   # rows from the neck to the edge; each kept CCLR outside the blouse (drapes on the chest, flat over the shoulders)
            q_=c0+out*(ww*t_)[:,None]-np.c_[np.zeros(NR),ww*t_*DROP,np.zeros(NR)]
            for _ in range(3):
                _,ii_=tD.query(q_);nn_=NS_[b][ii_];h_=((q_-D[b][ii_])*nn_).sum(1);h_=np.where(np.isin(ii_,bvv),9.0,h_);q_=q_+nn_*np.clip(ENV('CCLR',0.009)*(t_>0)+0.002-h_,0,ENV('CPMAX',0.02))[:,None]
            top.append(q_)
        top=np.array(top);Ntop=[]
        for r in range(RW):
            _,ii_=tD.query(top[r]);Ntop.append(NS_[b][ii_])
        Ntop=np.array(Ntop);bot=top-Ntop*TK
        OUTV[b].append(np.r_[top.reshape(-1,3),bot.reshape(-1,3)])
    OUTW.append(np.tile(Wn,(2*RW,1)));OUTL.append(np.tile(Ln,2*RW));OUTC.append(np.full(2*RW*NR,1));base=nv[0];nv[0]+=2*RW*NR
    idx=lambda layer_,r,k:base+layer_*RW*NR+r*NR+(k%NR)
    fs=[]
    for k in range(NR):
        for r in range(RW-1):
            for L_ in (0,1):
                a0,a1,b0_,b1=idx(L_,r,k),idx(L_,r,k+1),idx(L_,r+1,k),idx(L_,r+1,k+1);fs+=[[a0,b0_,b1],[a0,b1,a1]] if L_==0 else [[a0,b1,b0_],[a0,a1,b1]]
        for r in (0,RW-1):   # close the inner and outer edges
            a0,a1,b0_,b1=idx(0,r,k),idx(0,r,k+1),idx(1,r,k),idx(1,r,k+1);fs+=[[a0,b0_,b1],[a0,b1,a1]]
    OUTF.append(np.array(fs));print('  collar: own piece, %d ring points, width back %.0f mm front %.0f mm'%(NR,WB*1000,WF*1000))
# centre strip: its own ribbon laid down the front of the blouse (straight edges whatever the cloth does)
P0=S['plus'];fr2=np.cos(np.arctan2(P0[:,0]-MID,P0[:,2]-zc));cand=np.where((fr2>0.8)&(np.abs(P0[:,0]-MID)<ENV('PLW',0.026)+0.01))[0]
ytopP=FY-ENV('PLTOP',0.035);ybot=HEMY+BANDH;rows=np.linspace(ytopP,ybot,ENV('PLROWS',40));PW=ENV('PLW',0.026);RB={};okr=[]
for y_ in rows:
    k_=cand[np.abs(P0[cand,1]-y_)<0.006]
    okr.append(k_[np.argsort(np.abs(P0[k_,0]-MID))[:6]] if len(k_) else None)
okr=[k_ for k_ in okr if k_ is not None and len(k_)]
for b in BL:
    C_=np.array([D[b][k_].mean(0) for k_ in okr]);N_=np.array([NS_[b][k_].mean(0) for k_ in okr]);N_/=np.linalg.norm(N_,axis=1,keepdims=True)
    C_[:,0]=MID+(C_[:,0]-MID)*0;T_=np.array([1.0,0,0])-N_[:,[0]]*N_;T_/=np.linalg.norm(T_,axis=1,keepdims=True)
    C_=C_+N_*ENV('PLUP',0.005);RB[b]=(C_,N_,T_)
nr=len(okr);Wr=np.array([Wv[k_].mean(0) for k_ in okr]);Lr=np.array([LFv[k_].mean() for k_ in okr])
for b in BL:
    C_,N_,T_=RB[b];OUTV[b].append(np.r_[C_-T_*PW,C_+T_*PW,C_-T_*PW-N_*ENV('PLUP',0.005),C_+T_*PW-N_*ENV('PLUP',0.005)])
OUTW.append(np.tile(Wr,(4,1)));OUTL.append(np.tile(Lr,4));OUTC.append(np.full(4*nr,ENV('PLCOL',2)));base=nv[0];nv[0]+=4*nr
fs=[]
for k in range(nr-1):
    a0,a1,b0_,b1=base+k,base+k+1,base+nr+k,base+nr+k+1;fs+=[[a0,b1,b0_],[a0,a1,b1]]
    for (p,q) in ((0,2),(1,3)):   # side walls down to the cloth
        u0,u1,v0,v1=base+p*nr+k,base+p*nr+k+1,base+q*nr+k,base+q*nr+k+1;fs+=[[u0,v0,v1],[u0,v1,u1]]
fs+=[[base,base+nr,base+3*nr],[base,base+3*nr,base+2*nr],[base+nr-1,base+3*nr+nr-1,base+2*nr-1],[base+nr-1,base+2*nr+nr-1,base+3*nr+nr-1]]
OUTF.append(np.array(fs))
# buttons: three domed discs down the placket
P0=S['plus'];front=np.cos(np.arctan2(P0[:,0]-MID,P0[:,2]-zc));col_=np.where((np.abs(P0[:,0]-MID)<0.006)&(front>0.8))[0]
ys=np.linspace(FY-ENV('BTOP',0.05),HEMY+BANDH+ENV('BBOT',0.03),3)   # top button just under the collar's V, bottom one at the hem
R_=ENV('BR',0.019);NS=16;ang=np.linspace(0,2*np.pi,NS,endpoint=False)
for yk in ys:
    i=col_[np.argmin(np.abs(P0[col_,1]-yk))];base=nv[0]
    for b in BL:
        n=NS_[b][i];t1=np.cross([0,1,0],n);t1/=np.linalg.norm(t1);t2=np.cross(n,t1);c=D[b][i]+n*(ENV('PLUP',0.005)+0.001)
        ring=lambda r,h:c+np.outer(np.cos(ang)*r,t1)+np.outer(np.sin(ang)*r,t2)+n*h
        OUTV[b].append(np.r_[ring(R_,0.0005),ring(R_,0.004),ring(R_*0.75,0.0075),[c+n*0.0085]])
    OUTW.append(np.repeat(Wv[i:i+1],3*NS+1,0));OUTL.append(np.full(3*NS+1,LFv[i]));OUTC.append(np.full(3*NS+1,1));nv[0]+=3*NS+1
    fs=[]
    for r0 in range(2):
        for k in range(NS):a0,a1=base+r0*NS+k,base+r0*NS+(k+1)%NS;b0_,b1=a0+NS,a1+NS;fs+=[[a0,a1,b1],[a0,b1,b0_]]
    for k in range(NS):fs.append([base+2*NS+k,base+2*NS+(k+1)%NS,base+3*NS])
    OUTF.append(np.array(fs))
V={b:np.concatenate(OUTV[b]) for b in BL};W=np.concatenate(OUTW);LF=np.concatenate(OUTL);CL=np.concatenate(OUTC);FF=np.concatenate(OUTF).astype(np.int64)
print('  blouse: %d points, %d triangles (blouse, placket, cuffs, collar, rims, 3 buttons)'%(len(LF),len(FF)))
# ---- skin it hides: inside the cut region, a little in from every edge
Xb=body_of('plus');Wb=jw(('Arm','ForeArm','Hand'))
inside=np.zeros(len(BP),bool)
for b in BL:
    X=body_of(b);_,ii=cKDTree(V[b][CL==0]).query(X);d=np.linalg.norm(X-V[b][CL==0][ii],axis=1);inside|=(d<ENV('COVD',0.04))
inside&=(Xb[:,1]>HEMY+0.01)&((Xb-F_)@n_<-0.008)&(jw(('Hand','Head'))<0.05)&(jw(('Neck',))<0.5)&(jw(('UpLeg','Leg','Foot'))<0.5)
for s,sg in (('Left',1),('Right',-1)):
    Ej,Hj=JPOS['mixamorig:'+s+'ForeArm'],JPOS['mixamorig:'+s+'Hand'];d=(Hj-Ej)/np.linalg.norm(Hj-Ej);inside&=~((sg*(Xb[:,0]-MID)>0.08)&(Wb>0.3)&((Xb-((Ej+d*(SLEND-0.015)) if SLEND>=0 else (Hj-d*0.025)))@d>0))
cover=np.where(inside)[0];print('  hides %d skin points'%len(cover))
# ---- write (same layout as fit_clean.py)
from PIL import Image
top4=np.argsort(-W,axis=1)[:,:4];w4=np.take_along_axis(W,top4,1);w4/=w4.sum(1,keepdims=True).clip(1e-9)
P=V['plus']+np.c_[np.zeros(len(LF)),LF,np.zeros(len(LF))];VN=vn(P,FF);names=BL[1:];TG={b:V[b]-V['plus'] for b in names}
UV=np.c_[(CL*16+8)/48.0,np.full(len(CL),0.5)]
BIN=bytearray();views=[];accs=[]
def add(arr,comp,typ,mm=False):
    while len(BIN)%4:BIN.append(0)
    views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':arr.nbytes});BIN.extend(arr.tobytes());a={'bufferView':len(views)-1,'componentType':comp,'type':typ,'count':int(arr.shape[0])}
    if mm:a['min']=[float(x) for x in arr.min(0)];a['max']=[float(x) for x in arr.max(0)]
    accs.append(a);return len(accs)-1
pr={'attributes':{'POSITION':add(P.astype(np.float32),5126,'VEC3',True),'NORMAL':add(VN.astype(np.float32),5126,'VEC3'),'TEXCOORD_0':add(UV.astype(np.float32),5126,'VEC2'),'JOINTS_0':add(top4.astype(np.uint16),5123,'VEC4'),'WEIGHTS_0':add(w4.astype(np.float32),5126,'VEC4')},
    'indices':add(FF.astype(np.uint32).reshape(-1),5125,'SCALAR'),'material':1,'targets':[{'POSITION':add(TG[b].astype(np.float32),5126,'VEC3',True)} for b in names]}
cv=add(cover.astype(np.uint32),5125,'SCALAR')
tex=np.zeros((16,48,3),np.uint8);tex[:,:16]=ORANGE;tex[:,16:32]=CREAM;tex[:,32:]=[int(c*0.82) for c in ORANGE];buf=io.BytesIO();Image.fromarray(tex).save(buf,'PNG');IMG=buf.getvalue()
while len(BIN)%4:BIN.append(0)
views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':len(IMG)});BIN.extend(IMG)
while len(BIN)%4:BIN.append(0)
ex={'targetNames':names,'bodyVerts':len(BP),'cover':cv,'clean':True,'under':ORANGE}
GJ={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':NAME,'mesh':0}],'meshes':[{'primitives':[pr],'extras':ex}],
    'materials':[{'name':'hair'},{'name':'cloth','doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':0}}}],'textures':[{'source':0}],'images':[{'bufferView':len(views)-1,'mimeType':'image/png'}],'bufferViews':views,'accessors':accs,'buffers':[{'byteLength':len(BIN)}]}
js=json.dumps(GJ,separators=(',',':')).encode()
while len(js)%4:js+=b' '
os.makedirs(OUTD,exist_ok=True);out=OUTD+'/%s.glb'%NAME
open(out,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(BIN))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(BIN),0x004E4942)+bytes(BIN));print('  wrote',out,'%.2f MB'%(len(BIN)/1e6))
