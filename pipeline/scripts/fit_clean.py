"""Fit a clean Meshy garment (no mannequin, no texture) to each of the four fixed bodies.
python3 fit_clean.py IN.npz SLOT_KEY f|m [outdir]      IN.npz: P (verts), F (tris) of the decimated scan (see dec step in the notes)
- One fit per body (her: plus = the base, average, thin, athletic). The other three fits are stored as the shapes the builder
  already switches between, so each build wears a garment fitted to it exactly (no in-between builds exist any more).
- Tops: sized and placed on the trunk, sleeves laid along the arms, pushed clear of the skin, weights from the skin under it.
- Skirts: hung from the waist as one tube (legs show and move inside), weights hips + a share of each thigh, cut to LEN.
- Colour: the flat colours of the piece already in out/wear (nearest point), cut to a few swatches. The scans carry none."""
import sys,os,io,json,struct,numpy as np
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from PIL import Image
R=os.path.dirname(os.path.abspath(__file__))+'/../out'
INP,name,body_id=sys.argv[1],sys.argv[2],sys.argv[3];OUT=sys.argv[4] if len(sys.argv)>4 else R+'/clean'
slot,key=name.split('_',1);ENV=lambda k,d:type(d)(os.environ.get(k,d))
CT={5126:np.float32,5125:np.uint32,5123:np.uint16,5121:np.uint8};NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def glb(f):
    d=open(f,'rb').read();L=struct.unpack('<I',d[12:16])[0];return json.loads(d[20:20+L]),d[20+L+8:]
def mk(J,B):
    def acc(i):
        a=J['accessors'][i];bv=J['bufferViews'][a['bufferView']];return np.frombuffer(B,CT[a['componentType']],a['count']*NC[a['type']],bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
    return acc
ss=lambda t:np.clip(t,0,1)**2*(3-2*np.clip(t,0,1))
# ---- body
BJ,BB=glb(R+'/'+{'m':'male-body-final.glb','f':'base-plus-build.glb'}[body_id]);ba=mk(BJ,BB);bp=BJ['meshes'][0]['primitives'][0]
BP=ba(bp['attributes']['POSITION']).astype(float);BF=ba(bp['indices']).reshape(-1,3).astype(int)
BJn=ba(bp['attributes']['JOINTS_0']).astype(int);BW=ba(bp['attributes']['WEIGHTS_0']).astype(float)
tnames=BJ['meshes'][0]['extras']['targetNames'];BT={n:ba(bp['targets'][i]['POSITION']).astype(float) for i,n in enumerate(tnames)}
jn=[BJ['nodes'][j]['name'] for j in BJ['skins'][0]['joints']];NJ=len(jn);ji=lambda n:jn.index('mixamorig:'+n)
Wd=np.zeros((len(BP),NJ));np.add.at(Wd,(np.repeat(np.arange(len(BP)),4),BJn.ravel()),BW.ravel())
IBM=ba(BJ['skins'][0]['inverseBindMatrices']).astype(float);JPOS={n_:np.linalg.inv(IBM[i].reshape(4,4).T)[:3,3] for i,n_ in enumerate(jn)}
MID={'f':0.0175,'m':0.0}[body_id]
jw=lambda keys:Wd[:,[i for i,n_ in enumerate(jn) if any(k in n_ for k in keys)]].sum(1)
# her shoulder lift (4 cm, arms fully, collar 70%), as the game does it at load; clothes carry it baked in
LIFT=np.zeros(len(BP))
if body_id=='f':
    wt=np.zeros(NJ)
    for i_,n_ in enumerate(jn):
        if any(k in n_ for k in ('Arm','Hand')):wt[i_]=1
        elif n_.endswith('LeftShoulder') or n_.endswith('RightShoulder'):wt[i_]=0.7
    _,bi_=np.unique(np.round(BP*2e4).astype(np.int64),axis=0,return_inverse=True);bi_=bi_.ravel();nb_=bi_.max()+1;w0=np.zeros(nb_);np.maximum.at(w0,bi_,Wd@wt);FB_=bi_[BF]
    E_=np.unique(np.sort(np.r_[FB_[:,[0,1]],FB_[:,[1,2]],FB_[:,[2,0]]],axis=1),axis=0);E_=E_[E_[:,0]!=E_[:,1]];dg_=np.zeros(nb_);np.add.at(dg_,E_[:,0],1);np.add.at(dg_,E_[:,1],1);cur=w0.copy()
    for _ in range(16):
        sm_=np.zeros(nb_);np.add.at(sm_,E_[:,0],cur[E_[:,1]]);np.add.at(sm_,E_[:,1],cur[E_[:,0]]);cur=np.maximum(w0*0.999,np.where(dg_>0,0.5*cur+0.5*sm_/np.maximum(dg_,1),cur))
    LIFT=np.where((cur[bi_]>0.002)&(BP[:,1]<1.36),0.04*cur[bi_],0.0)
def vnorm(X,Fc):
    fn=np.cross(X[Fc[:,1]]-X[Fc[:,0]],X[Fc[:,2]]-X[Fc[:,0]]);N=np.zeros_like(X)
    for k in range(3):np.add.at(N,Fc[:,k],fn)
    return N/np.linalg.norm(N,axis=1,keepdims=True).clip(1e-12)
class Body:
    """one build: dense surface samples with normals, for signed distance and nearest-skin queries"""
    def __init__(s,X):
        s.X=X;N=vnorm(X,BF);s.N=N;c=X[BF].mean(1);cn=N[BF].sum(1);cn/=np.linalg.norm(cn,axis=1,keepdims=True).clip(1e-12)
        m=[(X[BF[:,a]]+X[BF[:,b]])/2 for a,b in ((0,1),(1,2),(2,0))];mn=[(N[BF[:,a]]+N[BF[:,b]]) for a,b in ((0,1),(1,2),(2,0))]
        s.S=np.r_[X,c,*m];s.SN=np.r_[N,cn,*mn];s.SN/=np.linalg.norm(s.SN,axis=1,keepdims=True).clip(1e-12)
        s.src=np.r_[np.arange(len(X)),BF[:,0],BF[:,0],BF[:,1],BF[:,2]];s.t=cKDTree(s.S)
    def sd(s,Q):
        d,i=s.t.query(Q);v=Q-s.S[i];sg=np.sign((v*s.SN[i]).sum(1));sg[sg==0]=1;return d*sg,i
BUILDS={'f':['plus','average','slim','athletic'],'m':['average','slim','heavy','athletic']}[body_id]   # the first is the base
def body_of(b):return BP+(BT[b] if b in BT else 0)
# ---- the scan
Z=np.load(INP);G0=Z['P'].astype(float);GF=Z['F'].astype(int)
G0[:,0]-=(G0[:,0].max()+G0[:,0].min())/2
GE=np.unique(np.sort(np.r_[GF[:,[0,1]],GF[:,[1,2]],GF[:,[2,0]]],axis=1),axis=0);gdeg=np.zeros(len(G0));np.add.at(gdeg,GE[:,0],1);np.add.at(gdeg,GE[:,1],1);gdeg=np.maximum(gdeg,1)
def gsmooth(A,it,lam=0.5):
    A=A.copy()
    for _ in range(it):
        nb=np.zeros_like(A);np.add.at(nb,GE[:,0],A[GE[:,1]]);np.add.at(nb,GE[:,1],A[GE[:,0]]);A=(1-lam)*A+lam*(nb/gdeg[:,None] if A.ndim>1 else nb/gdeg)
    return A
gy0,gy1=G0[:,1].min(),G0[:,1].max();gh=gy1-gy0
def rot_to(a,b):
    v=np.cross(a,b);c=float(a@b);K=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]]);return np.eye(3)+K+K@K/(1+c)
sh_=(jw(('LeftShoulder','RightShoulder','LeftArm','RightArm'))>0.5)&(np.abs(BP[:,0]-MID)<0.25);YSHT=float((BP[sh_,1]+LIFT[sh_]).max());print('  shoulder top %.3f'%YSHT)
def fit_top(bd,sy=None):
    # 1. size and place: trunk points just outside the skin
    core=np.where((np.abs(G0[:,0])<0.16*gh/0.6*0.6)&(G0[:,1]>gy0+0.3*gh)&(G0[:,1]<gy0+0.8*gh))[0]
    core=np.random.default_rng(1).choice(core,min(800,len(core)),replace=False);best=(1e9,)
    SC=lambda s:np.array([s,sy if sy else s,s])   # with sy fixed (from the average build) only width and depth change: bigger, not longer
    for s in np.arange(0.24,0.62,0.01)*(1.0/max(gh,1e-6))*1.74/1.0:
        yn=YSHT+ENV('NECKUP',0.02)   # the top of the garment (shoulders, collar) just over the top of her shoulders
        for ty in yn-SC(s)[1]*gy1+np.arange(-0.04,0.041,0.01):
            for tz in (-0.02,0.0,0.02,0.04):
                d,_=bd.sd(G0[core]*SC(s)+[MID,ty,tz]);c=np.where(d<0.004,ENV('INPEN',30.0)*(0.004-d),np.abs(d-ENV('CLR',0.015))).mean()
                if c<best[0]:best=(c,s,ty,tz)
    c,s,ty,tz=best
    for s2 in s+np.arange(-0.008,0.009,0.004):
        for ty2 in ty+np.arange(-0.012,0.013,0.006):
            for tz2 in tz+np.arange(-0.012,0.013,0.006):
                d,_=bd.sd(G0[core]*SC(s2)+[MID,ty2,tz2]);c2=np.where(d<0.004,ENV('INPEN',30.0)*(0.004-d),np.abs(d-ENV('CLR',0.015))).mean()
                if c2<best[0]:best=(c2,s2,ty2,tz2)
    c,s,ty,tz=best;P=G0*SC(s)+[MID,ty,tz]
    # 2. sleeves along the arms (bind pose arms are out to the side; the scan's hang down)
    W_arm={}
    for side,sg in (('Left',1),('Right',-1)):
        X=sg*(P[:,0]-MID);Sj,Ej,Hj=[JPOS['mixamorig:'+side+k] for k in ('Arm','ForeArm','Hand')]
        xs=abs(Sj[0]-MID);far=P[X>xs+0.02]
        if len(far)<60:continue
        c0=far.mean(0);ag=np.linalg.svd(far-c0)[2][0];ag=ag if ag[1]<0 else -ag
        Sg=c0+ag*((np.array([MID+sg*xs,Sj[1],Sj[2]])-c0)@ag)   # where the sleeve axis passes the shoulder
        u=(P-Sg)@ag;rv=(P-Sg)-np.outer(u,ag);sel=(u>-0.04)&(X>xs-0.03)
        Lu=np.linalg.norm(Ej-Sj);Lf=np.linalg.norm(Hj-Ej);d1=(Ej-Sj)/Lu;d2=(Hj-Ej)/Lf;Lg=np.percentile(u[sel],99.5)
        k=min(1.0,(Lu+Lf-0.01)/max(Lg,1e-6));uu=np.clip(u,0,None)*k
        R1=rot_to(ag,d1);R2=rot_to(ag,d2);m1=Sj+np.outer(uu,d1)+rv@R1.T;m2=Ej+np.outer(uu-Lu,d2)+rv@R2.T;f=ss((uu-Lu+0.04)/0.08)[:,None];M=m1*(1-f)+m2*f
        b=(ss((u+0.02)/0.10)*sel)[:,None];P=P*(1-b)+M*b;W_arm[side]=(b[:,0],uu,Lu,f[:,0])
    return P,s,W_arm
def push_out(P,bd,mc_fn,it=3):
    """nothing within mc of the skin or inside it; the move is spread so the cloth does not dent"""
    for _ in range(ENV('PUSHIT',8)):
        d,i=bd.sd(P);mc=mc_fn(P);need=np.maximum(0,mc-d);D=bd.SN[i]*need[:,None]
        if need.max()<1e-4:break
        Ds=gsmooth(D,ENV('PUSHSM',30));sc=need.max()/max(np.linalg.norm(Ds,axis=1).max(),1e-9);P=P+Ds*min(sc,2.0)   # a wide smooth lift, not a dent
    d,i=bd.sd(P);mc=mc_fn(P);need=np.maximum(0,mc-d);P=P+bd.SN[i]*need[:,None]
    return P
YH=JPOS['mixamorig:Hips'][1]
if slot=='top':
    mcf=lambda P:0.006+ENV('HIPCLR',0.026)*ss((YH+0.16-P[:,1])/0.08)   # over the hips a top clears whatever bottom is worn (a skirt's yoke sits ~2 cm out)   # a top hangs outside whatever is worn at the waist
else:
    mcf=lambda P:np.full(len(P),0.006)
fits={};info={}
if slot=='top':
    order=[b for b in BUILDS if b=='average']+[b for b in BUILDS if b!='average'];SY=None
    for b in order:
        bd=Body(body_of(b));P,s,WA=fit_top(bd,SY);SY=SY or s;P=push_out(P,bd,mcf);fits[b]=P;info[b]=(s,WA,bd);print(name,b,'scale %.3f'%s,'y %.2f..%.2f'%(P[:,1].min(),P[:,1].max()))
# ---- skirt: one tube from the waist; per build the radius at each height and angle clears the hull of the hips and legs
if slot=='bottom' and 'skirt' in key:
    LEN=os.environ.get('LEN','knee');knee=JPOS['mixamorig:LeftLeg'][1];CZ=JPOS['mixamorig:Hips'][2]
    trunk=jw(('Hips','Spine','UpLeg','Leg'))>0.5;legw=jw(('UpLeg','Leg'))
    ycr=BP[(legw>0.3)&(np.abs(BP[:,0]-MID)<0.02),1].max();ank=JPOS['mixamorig:LeftFoot'][1]
    YT=ENV('YT',1.058);YB={'hip':ycr-0.14,'knee':knee+0.07,'ankle':ank+0.05}[LEN]
    rel0=G0-[0,0,(G0[:,2].max()+G0[:,2].min())/2];th=np.arctan2(rel0[:,0],rel0[:,2]);t=(gy1-G0[:,1])/gh   # 0 at the waistband, 1 at the hem
    NT=96;tb=(th%(2*np.pi)/(2*np.pi)*NT).astype(int)%NT
    for b in BUILDS:
        X=body_of(b);rel=X-[MID,0,CZ];ang=np.arctan2(rel[:,0],rel[:,2])%(2*np.pi);rad=np.hypot(rel[:,0],rel[:,2]);bi=(ang/(2*np.pi)*NT).astype(int)%NT
        y=YT-t*(YT-YB)
        # hull radius at each scan point's height and angle
        ys=np.linspace(YT,YB,40);hull=np.zeros((40,NT))
        for k,yy in enumerate(ys):
            m=trunk&(np.abs(X[:,1]-yy)<0.02)
            if m.any():np.maximum.at(hull[k],bi[m],rad[m])
            for _ in range(2):hull[k]=np.maximum(hull[k],np.maximum(np.roll(hull[k],1),np.roll(hull[k],-1))*0.985)
        iw=int(np.argmax(hull.mean(1)[:20]))
        for k in range(iw+1,40):hull[k]=np.maximum(hull[k],hull[k-1])   # never narrows below the hips: legs inside, not wrapped
        ky=np.clip(np.round((YT-y)/(YT-YB)*39).astype(int),0,39);hr=hull[ky,tb]
        # the scan's own radius, scaled so its waistband sits on her waist; then never inside the hull
        rs=np.hypot(rel0[:,0],rel0[:,2]);wb=t<0.03;sc=np.median(hull[0])/max(np.median(rs[wb]),1e-6)*1.0
        r=np.maximum(rs*sc,hr+np.where(t<0.06,0.006,0.012))
        P=np.c_[MID+r*np.sin(th),y,CZ+r*np.cos(th)];fits[b]=P;print(name,b,'waist r %.3f hem r %.3f'%(np.median(r[t<0.02]),np.median(r[t>0.98])))
# ---- a solid Meshy garment has an inside wall: the push-out moves it more than the outside and it shows through as blotches.
#      Faces that face the body (inner wall) are dropped; the builder draws the cloth two-sided, so one layer is enough
if ENV('INNER',1):
    bdi=Body(body_of(BUILDS[0]));Pb=fits[BUILDS[0]];cf=Pb[GF].mean(1);_,ii=bdi.t.query(cf);out_=cf-bdi.S[ii];out_/=np.linalg.norm(out_,axis=1,keepdims=True).clip(1e-9)
    fnm=np.cross(Pb[GF[:,1]]-Pb[GF[:,0]],Pb[GF[:,2]]-Pb[GF[:,0]]);fnm/=np.linalg.norm(fnm,axis=1,keepdims=True).clip(1e-12)
    keepF=(fnm*out_).sum(1)>ENV('INDOT',-0.15)
    # small islands left behind go too
    nF=len(GF);ek=np.sort(np.stack([GF[:,[0,1]],GF[:,[1,2]],GF[:,[2,0]]],1),axis=2).reshape(-1,2);_,einv=np.unique(ek,axis=0,return_inverse=True);einv=einv.reshape(-1,3)
    fo=np.repeat(np.arange(nF),3);ee=einv.ravel();o=np.argsort(ee);ee=ee[o];fo=fo[o];same=ee[1:]==ee[:-1];pa=np.c_[fo[:-1][same],fo[1:][same]]
    pa=pa[keepF[pa[:,0]]&keepF[pa[:,1]]];lab_=connected_components(coo_matrix((np.ones(len(pa)),(pa[:,0],pa[:,1])),shape=(nF,nF)),directed=False)[1]
    big=np.bincount(lab_[keepF],minlength=nF);keepF&=big[lab_]>=ENV('ISLE',300)
    print('  inner wall dropped: %d of %d faces kept'%(int(keepF.sum()),nF));GF=GF[keepF]
    GE=np.unique(np.sort(np.r_[GF[:,[0,1]],GF[:,[1,2]],GF[:,[2,0]]],axis=1),axis=0);gdeg=np.zeros(len(G0));np.add.at(gdeg,GE[:,0],1);np.add.at(gdeg,GE[:,1],1);gdeg=np.maximum(gdeg,1)
# ---- weights (from the base build's fit)
b0=BUILDS[0];P0=fits[b0];X0=body_of(b0)
if slot=='top':
    bd=info[b0][2];_,i=bd.sd(P0);src=bd.src[i]
    _,kk=cKDTree(X0).query(P0,k=4);w3=1/(np.linalg.norm(X0[kk]-P0[:,None],axis=2)+1e-3);w3/=w3.sum(1,keepdims=True);Wg=(Wd[kk]*w3[:,:,None]).sum(1)
    for side,(bb,uu,Lu,f) in info[b0][1].items():
        ia,ie=ji(side+'Arm'),ji(side+'ForeArm');Wa=np.zeros_like(Wg);Wa[:,ia]=1-f;Wa[:,ie]=f;b2=(bb*ss((uu-0.03)/0.12))[:,None];Wg=Wg*(1-b2)+Wa*b2
    lg=[i for i,n_ in enumerate(jn) if 'UpLeg' in n_ or n_.endswith('Leg')];h_=ji('Hips');low=ss((YH+0.06-P0[:,1])/0.08)   # a hem below the hips hangs from the hips, not the thighs (it tore in the walk)
    mv=Wg[:,lg].sum(1)*low;Wg[:,lg]*=(1-low)[:,None];Wg[:,h_]+=mv
    Wg=gsmooth(Wg,4)
    LF=(LIFT[kk]*w3).sum(1);LF=gsmooth(LF,6)
else:
    a=np.clip((YT-0.05-P0[:,1])/max(0.05,YT-0.05-YB),0,1)*{'hip':0.5,'knee':0.65,'ankle':0.8}[LEN];ang=np.arctan2(P0[:,0]-MID,P0[:,2]-CZ);left=np.clip(0.5+0.75*np.sin(ang),0,1)
    Wg=np.zeros((len(P0),NJ));Wg[:,ji('Hips')]=1-a;Wg[:,ji('LeftUpLeg')]=a*left;Wg[:,ji('RightUpLeg')]=a*(1-left);LF=np.zeros(len(P0))
top4=np.argsort(-Wg,axis=1)[:,:4];w4=np.take_along_axis(Wg,top4,1);w4/=w4.sum(1,keepdims=True)
# ---- skin hidden: under the cloth on EVERY build (so no build shows a flat patch where its own cloth is not)
hidden=np.ones(len(BP),bool)
for b in BUILDS:
    X=body_of(b);N=vnorm(X,BF);P=fits[b];t=cKDTree(P);cand=t.query_ball_point(X+N*0.06,r=0.064);h=np.zeros(len(BP),bool)
    for v in range(len(BP)):
        c=cand[v]
        if not c:continue
        D=P[c]-X[v];al=D@N[v];pp=np.linalg.norm(D-np.outer(al,N[v]),axis=1);h[v]=((al>0.002)&(pp<0.006+0.15*al)).any()
    if slot=='top':h&=jw(('Head','Neck','Hand'))<0.35
    if slot=='bottom':h&=(jw(('UpLeg','Leg','Foot'))<0.5)|(X[:,1]>ycr+0.01) if 'skirt' in key else h
    hidden&=h
# drop single stragglers
_,binv=np.unique(np.round(BP*1e5).astype(np.int64),axis=0,return_inverse=True);binv=binv.ravel();nwb=binv.max()+1
hw=np.zeros(nwb,bool);hw[binv[hidden]]=True;hidden=hw[binv]
print('  skin hidden on every build',int(hidden.sum()))
# ---- colour from the fitted piece already in the game (same body, nearest point), cut to a few flat swatches
OLD=os.path.exists(R+'/wear/%s.glb'%name)
if OLD:
  J2,B2=glb(R+'/wear/%s.glb'%name);g2=mk(J2,B2);p2=J2['meshes'][0]['primitives'][0]
if OLD:
  Q=g2(p2['attributes']['POSITION']).astype(float);QUV=g2(p2['attributes']['TEXCOORD_0']).astype(float)
if OLD:
  iv=J2['bufferViews'][J2['images'][0]['bufferView']];TX=np.array(Image.open(io.BytesIO(B2[iv.get('byteOffset',0):iv.get('byteOffset',0)+iv['byteLength']])).convert('RGB')).astype(float);TH,TW=TX.shape[:2]
P0l=P0+np.c_[np.zeros(len(P0)),LF,np.zeros(len(P0))]
if OLD:
  _,qi=cKDTree(Q).query(P0l);col=TX[np.clip((QUV[qi,1]*TH).astype(int),0,TH-1),np.clip((QUV[qi,0]*TW).astype(int),0,TW-1)];col=gsmooth(col,3)
else:   # no texture: BASE colour everywhere; ACCENT on the collar (COLLAR m below the top, near the neck) and on buttons (bumps on the centre front)
  cb=np.array([float(x) for x in os.environ.get('BASE','196,98,58').split(',')]);ca=np.array([float(x) for x in os.environ.get('ACCENT','243,229,203').split(',')])
  acc_=np.zeros(len(G0),bool);sc_=0.6/gh   # scan units to roughly metres
  if ENV('COLLAR',0.0)>0:
      ytop=G0[:,1].max();acc_|=(G0[:,1]>ytop-ENV('COLLAR',0.0)/sc_)&(np.abs(G0[:,0])<ENV('COLLARW',0.11)/sc_)
  if ENV('BUTTONS',0)>0:
      Gs=gsmooth(G0,25);bump=((G0-Gs)*vnorm(G0,GF)).sum(1)*sc_;front=G0[:,2]>np.percentile(G0[:,2],60)
      acc_|=front&(np.abs(G0[:,0])<0.05/sc_)&(bump>ENV('BUMP',0.0025))
      acc_=gsmooth(acc_.astype(float),2)>0.5
  col=np.where(acc_[:,None],ca,cb);print('  accent points',int(acc_.sum()))
K=4;rk=np.random.default_rng(3);cen=[col[rk.integers(len(col))]]
for _ in range(K-1):cen.append(col[np.argmax(np.min([((col-c)**2).sum(1) for c in cen],0))])
cen=np.array(cen)
for _ in range(20):
    lab=np.argmin(((col[:,None]-cen[None])**2).sum(2),1)
    for k in range(K):
        if (lab==k).any():cen[k]=col[lab==k].mean(0)
cnt=np.bincount(lab,minlength=K)
for k in np.argsort(cnt):
    for j in np.argsort(-cnt):
        if j!=k and cnt[j]>cnt[k] and np.abs(cen[k]-cen[j]).max()<60:lab[lab==k]=j;cnt=np.bincount(lab,minlength=K);break
for _ in range(10):
    V=np.zeros((len(P0),K));np.add.at(V,(GE[:,0],lab[GE[:,1]]),1);np.add.at(V,(GE[:,1],lab[GE[:,0]]),1);V[np.arange(len(P0)),lab]+=1.5;lab=V.argmax(1)
cnt=np.bincount(lab,minlength=K)
if os.environ.get('ONECOL')=='1' or ('skirt' in key and OLD):lab[:]=cnt.argmax()
PAL=np.array([np.median(col[lab==k],0) if (lab==k).any() else [0,0,0] for k in range(K)])
print('  colours',[(tuple(int(x) for x in PAL[k]),int(c)) for k,c in enumerate(np.bincount(lab,minlength=K)) if c])
flab=np.array([np.bincount(lab[t],minlength=K).argmax() for t in GF])
vid={};NV=[];NF=np.zeros_like(GF)
for ti,t in enumerate(GF):
    for c in range(3):
        kk_=(t[c],flab[ti])
        if kk_ not in vid:vid[kk_]=len(NV);NV.append(kk_)
        NF[ti,c]=vid[kk_]
src=np.array([a for a,_ in NV]);vl=np.array([b for _,b in NV])
sw=16;TEXI=np.zeros((16,sw*K,3),np.uint8)
for k in range(K):TEXI[:,k*sw:(k+1)*sw]=PAL[k].clip(0,255).astype(np.uint8)
VUV=np.c_[(vl*sw+sw/2)/(sw*K),np.full(len(vl),0.5)]
# ---- write: base build's fit + lift; the other builds as shapes (their fit minus the base)
Lv=np.c_[np.zeros(len(P0)),LF,np.zeros(len(P0))];V=(P0+Lv)[src];VN=vnorm(P0+Lv,GF)[src]
names=[b for b in BUILDS[1:]]
TG={b:(fits[b]-P0)[src] for b in names}
BIN=bytearray();views=[];accs=[]
def add(arr,comp,typ,mm=False):
    while len(BIN)%4:BIN.append(0)
    views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':arr.nbytes});BIN.extend(arr.tobytes());a={'bufferView':len(views)-1,'componentType':comp,'type':typ,'count':int(arr.shape[0])}
    if mm:a['min']=[float(x) for x in arr.min(0)];a['max']=[float(x) for x in arr.max(0)]
    accs.append(a);return len(accs)-1
pr={'attributes':{'POSITION':add(V.astype(np.float32),5126,'VEC3',True),'NORMAL':add(VN.astype(np.float32),5126,'VEC3'),'TEXCOORD_0':add(VUV.astype(np.float32),5126,'VEC2'),'JOINTS_0':add(top4[src].astype(np.uint16),5123,'VEC4'),'WEIGHTS_0':add(w4[src].astype(np.float32),5126,'VEC4')},
    'indices':add(NF.astype(np.uint32).reshape(-1),5125,'SCALAR'),'material':1,'targets':[{'POSITION':add(TG[b].astype(np.float32),5126,'VEC3',True)} for b in names]}
cv=add(np.where(hidden)[0].astype(np.uint32),5125,'SCALAR')
buf=io.BytesIO();Image.fromarray(TEXI).save(buf,'PNG');IMG=buf.getvalue()
while len(BIN)%4:BIN.append(0)
views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':len(IMG)});BIN.extend(IMG)
while len(BIN)%4:BIN.append(0)
main=int(np.bincount(flab,minlength=K).argmax())
ex={'targetNames':names,'bodyVerts':len(BP),'cover':cv,'clean':True,'under':[int(x) for x in PAL[main]]}
GJ={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':name,'mesh':0}],'meshes':[{'primitives':[pr],'extras':ex}],
    'materials':[{'name':'hair'},{'name':'cloth','doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':0}}}],'textures':[{'source':0}],'images':[{'bufferView':len(views)-1,'mimeType':'image/png'}],'bufferViews':views,'accessors':accs,'buffers':[{'byteLength':len(BIN)}]}
js=json.dumps(GJ,separators=(',',':')).encode()
while len(js)%4:js+=b' '
os.makedirs(OUT,exist_ok=True);out=OUT+'/%s.glb'%name
open(out,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(BIN))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(BIN),0x004E4942)+bytes(BIN));print('  wrote',out,'%.2f MB, %d verts %d tris'%(len(BIN)/1e6,len(V),len(NF)))
