import os
"""A Meshy garment (on a grey mannequin) -> a skinned piece for one of the bodies.  bvenv/bin/python fit_wear.py key slot body
slot: top | bottom | shoes     body: m | f
The mannequin is cut away, the piece is sized and placed on the body, sleeves and trouser legs are laid along the limbs, skin weights and
build shapes come from the body under each point, and the body skin hidden under the piece is listed so it can be left undrawn."""
import sys,json,struct,io,numpy as np,bpy,bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.append('/home/claude/pylib')
from PIL import Image
key,slot,body_id=sys.argv[-3:]
OPT=dict(tol=40,zlo=0.14,zhi=0.6,any=False,legs=True)
OPT.update({'tee':dict(tol=24),'tank':dict(tol=60,any=True),'sweats':dict(tol=16,zhi=0.93,zlo=0.0),'shorts':dict(zlo=0.5,zhi=0.9,legs=False),'cargo':dict(zhi=0.9,zlo=0.0),'jeans':dict(zhi=0.9,zlo=0.0),'trousers':dict(zhi=0.9,zlo=0.0),
  'f_croptee':dict(tol=30,zlo=0.5),'f_wrap':dict(tol=28,zlo=0.3),'f_peasant':dict(tol=28,zlo=0.2),'f_blazer':dict(tol=42,ghi=247),'f_sweater':dict(),
  'f_flare':dict(zhi=0.9,zlo=0.0),'f_jeans':dict(zhi=0.9,zlo=0.0),'f_wide':dict(zhi=0.9,zlo=0.0),'f_shorts':dict(zlo=0.4,zhi=0.85,legs=False),'f_skirt':dict(zlo=0.3,zhi=0.9,legs=False),
  'f_loafers':dict(zlo=0.0,zhi=0.25,tol=45),'f_sneakers':dict(zlo=0.0,zhi=0.3,tol=30),'f_boots':dict(zlo=0.0,zhi=0.7,tol=45),'f_pumps':dict(any=True,tol=50),'f_sandals':dict(any=True,tol=50)}.get(key,{}))
CT={5126:np.float32,5125:np.uint32,5123:np.uint16,5121:np.uint8};NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def glb(f):
    d=open(f,'rb').read();L=struct.unpack('<I',d[12:16])[0];return json.loads(d[20:20+L]),d[20+L+8:]
def mk(J,B):
    def acc(i):
        a=J['accessors'][i];bv=J['bufferViews'][a['bufferView']];return np.frombuffer(B,CT[a['componentType']],a['count']*NC[a['type']],bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
    return acc
ss=lambda t:np.clip(t,0,1)**2*(3-2*np.clip(t,0,1))
# ---- the body
BODY={'m':('/home/claude/out/male-body-final.glb',0.0,('slim','heavy','athletic')),'f':('/home/claude/out/base-plus-build.glb',0.0175,('average','slim','athletic'))}[body_id];MID=BODY[1]
BJ,BB=glb(BODY[0]);ba=mk(BJ,BB);bp=BJ['meshes'][0]['primitives'][0]
BP=ba(bp['attributes']['POSITION']).astype(float);BF=ba(bp['indices']).reshape(-1,3).astype(int);BJn=ba(bp['attributes']['JOINTS_0']).astype(int);BW=ba(bp['attributes']['WEIGHTS_0']).astype(float)
tn=BJ['meshes'][0]['extras']['targetNames'];BT={n:ba(bp['targets'][i]['POSITION']).astype(float) for i,n in enumerate(tn) if n in BODY[2]}
jn=[BJ['nodes'][j]['name'] for j in BJ['skins'][0]['joints']];NJ=len(jn)
Wd=np.zeros((len(BP),NJ));np.add.at(Wd,(np.repeat(np.arange(len(BP)),4),BJn.ravel()),BW.ravel())
body=BVHTree.FromPolygons([Vector(v) for v in BP],[tuple(int(i) for i in f) for f in BF])
IBM=ba(BJ['skins'][0]['inverseBindMatrices']).astype(float);JPOS={n:np.linalg.inv(IBM[i].reshape(4,4).T)[:3,3] for i,n in enumerate(jn)}
# ---- the garment
J,B=glb('/home/claude/out/cl-%s-dec.glb'%key);ga=mk(J,B);p=J['meshes'][0]['primitives'][0]
P=ga(p['attributes']['POSITION']).astype(float);UV=ga(p['attributes']['TEXCOORD_0']).astype(float);F=ga(p['indices']).reshape(-1,3).astype(int)
im=J['images'][J['textures'][J['materials'][p['material']]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']];bv=J['bufferViews'][im['bufferView']]
IMG=Image.open(io.BytesIO(B[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])).convert('RGB');T=np.array(IMG).astype(int);H,W=T.shape[:2]
col=T[np.clip((UV[:,1]*H).astype(int),0,H-1),np.clip((UV[:,0]*W).astype(int),0,W-1)];lum=col.mean(1);sat=(col.max(1)-col.min(1))/np.maximum(col.max(1),1)
y0,y1=P[:,1].min(),P[:,1].max();hh=y1-y0
_,inv=np.unique(np.round(P*1e5).astype(np.int64),axis=0,return_inverse=True);inv=inv.ravel();nw=inv.max()+1;FU=inv[F]
has_man=not(slot=='shoes' and body_id=='m')
if has_man:
    ref=(P[:,1]>y1-0.03*hh) if slot!='top' else (P[:,1]<y0+0.03*hh);Lm=np.median(lum[ref])
    if body_id=='f' and slot=='top':   # her tops come on a bust form, a bare one, or none: find the grey wherever it is
        gm=(sat<0.07)&(lum>120)&(lum<OPT.get('ghi',205));bt=(P[:,1]>y1-0.06*hh);bb_=(P[:,1]<y0+0.05*hh);band=bt|bb_
        print('  band top',int(bt.sum()),int((gm&bt).sum()),np.percentile(lum[bt],[10,50,90]).round(),np.percentile(sat[bt],[10,50,90]).round(3))
        if (gm&bt).sum()>0.3*bt.sum() or (gm&bb_).sum()>0.4*bb_.sum():Lm=np.median(lum[gm&band]);OPT['zlo']=max(OPT['zlo'],0.0);ZT=True
        else:Lm=-999
    zone=np.ones(len(P),bool) if OPT['any'] else ((P[:,1]<y0+OPT['zlo']*hh)|(P[:,1]>y0+OPT['zhi']*hh))
    grey=(np.abs(lum-Lm)<OPT['tol'])&(sat<(0.09 if OPT['any'] else 0.06))&zone
    gw=np.ones(nw,bool);np.logical_and.at(gw,inv,grey);yw=np.zeros(nw);yw[inv]=P[:,1]
    if OPT['any']:man=gw
    else:
        seed=gw&((yw<y0+0.05*hh)|(yw>y1-0.05*hh)) if slot!='top' else gw&((yw<y0+0.1*hh)|(yw>y0+(0.9 if body_id=='f' else 0.72)*hh))
        E=np.unique(np.sort(np.r_[FU[:,[0,1]],FU[:,[1,2]],FU[:,[2,0]]],axis=1),axis=0);E=E[gw[E[:,0]]&gw[E[:,1]]];man=seed.copy()
        for it in range(600):
            a=man[E[:,0]]|man[E[:,1]];n0=man.sum();man[E[a,0]]=True;man[E[a,1]]=True
            if man.sum()==n0:break
    keepF=~(man[FU].any(1));print(key,'mannequin lum %.0f, verts cut %d, faces kept %d of %d'%(Lm,int(man.sum()),int(keepF.sum()),len(F)));F=F[keepF];FU=FU[keepF]
if key=='jacket':   # the undershirt's tail hanging below the jacket reads as a nappy: off
    wv=(lum>165)&(sat<0.12)&(P[:,1]<y0+0.3*hh);k=~(wv[F].sum(1)>=2);F=F[k];FU=FU[k]
for _ in range(3):   # a cut edge is left ragged: drop the triangles that hang off it by a single side
    ek=np.sort(np.r_[FU[:,[0,1]],FU[:,[1,2]],FU[:,[2,0]]],axis=1);ek=ek[:,0]*nw+ek[:,1];u,c=np.unique(ek,return_counts=True);open_=(c[np.searchsorted(u,ek)]==1).reshape(3,-1).sum(0)
    k=open_<2;F=F[k];FU=FU[k]
par=np.arange(nw)
def find(a):
    while par[a]!=a:par[a]=par[par[a]];a=par[a]
    return a
for f in FU:
    r=find(f[0]);par[find(f[1])]=r;par[find(f[2])]=r
root=np.array([find(i) for i in range(nw)]);fr=root[FU[:,0]];ids,cn=np.unique(fr,return_counts=True);F=F[np.isin(fr,ids[cn>=(25 if slot=='shoes' else 60)])]
used=np.unique(F);re=-np.ones(len(P),int);re[used]=np.arange(len(used));P=P[used];UV=UV[used];F=re[F]
xc=(P[:,0].max()+P[:,0].min())/2;P[:,0]-=xc;gy0,gy1=P[:,1].min(),P[:,1].max();gh=gy1-gy0;print('  piece: verts',len(P),'tris',len(F))
def sd(Q):
    out=np.zeros(len(Q))
    for i,q in enumerate(Q):
        loc,n,_,d=body.find_nearest(Vector(q));v=Vector(q)-loc;out[i]=d if v.dot(n)>=0 else -d
    return out
rs=np.random.default_rng(1);SLV={}
if slot=='shoes':
    # ---- a pair of shoes: one size for both, each set on its foot (heel to toe, sole on the floor); the front bends with the toes
    footw=Wd[:,[i for i,n in enumerate(jn) if 'Foot' in n or 'Toe' in n]].sum(1)
    fl={};s_list=[]
    for side,sg in (('Left',1),('Right',-1)):
        fv=BP[(footw>0.6)&(sg*(BP[:,0]-MID)>0)];sv=P[sg*P[:,0]>0];low=sv[sv[:,1]<gy0+0.25*gh] if gh>0 else sv
        fl[side]=(fv,sv,low);s_list.append((fv[:,2].max()-fv[:,2].min())*1.13/(low[:,2].max()-low[:,2].min()))
    s=float(np.mean(s_list));Pn=P*s
    for side,sg in (('Left',1),('Right',-1)):
        fv,sv,low=fl[side];m=sg*P[:,0]>0;lo=Pn[m][Pn[m][:,1]<(gy0+0.25*gh)*s]
        t=np.array([(fv[:,0].max()+fv[:,0].min())/2-(lo[:,0].max()+lo[:,0].min())/2,BP[:,1].min()-Pn[m][:,1].min(),fv[:,2].max()+0.012-lo[:,2].max()]);Pn[m]+=t
    P=Pn;print('  shoes: scale %.3f, top at y %.2f'%(s,P[:,1].max()))
else:
    # ---- size and place it: points on the trunk should sit just outside the skin
    if slot=='top':core=np.where((np.abs(P[:,0])<0.16)&(P[:,1]>gy0+0.25*gh)&(P[:,1]<gy0+0.8*gh))[0];S_R=np.arange(0.27,0.42,0.0125);YT=None
    else:
        lo,hi=((0.7,0.95) if key=='f_skirt' else (0.45,0.92) if not OPT['legs'] else (0.62,0.93));core=np.where((P[:,1]>gy0+lo*gh)&(P[:,1]<gy0+hi*gh))[0];S_R=np.arange(0.30,0.66,0.0125);YT=np.arange(0.84,1.12,0.015)
    core=rs.choice(core,min(500,len(core)),replace=False);best=(1e9,)
    for s in S_R:
        for ty in (np.arange(0.95,1.32,0.02) if YT is None else YT-s*gy1):
            for tz in ((-0.01,0.01,0.03) if slot=='top' else (-0.02,0.0,0.02,0.04)):
                d=sd(P[core]*s+[MID,ty,tz]);c=np.where(d<0,6*-d,np.abs(d-0.008)).mean()
                if c<best[0]:best=(c,s,ty,tz)
    c,s,ty,tz=best
    for s2 in (s-0.006,s,s+0.006):
        for ty2 in (ty-0.008,ty,ty+0.008):
            for tz2 in (tz-0.01,tz,tz+0.01):
                d=sd(P[core]*s2+[MID,ty2,tz2]);c2=np.where(d<0,6*-d,np.abs(d-0.008)).mean()
                if c2<best[0]:best=(c2,s2,ty2,tz2)
    c,s,ty,tz=best;P=P*s+[MID,ty,tz];print('  fit cost %.4f scale %.3f -> y %.2f..%.2f halfwidth %.2f'%(c,s,P[:,1].min(),P[:,1].max(),np.abs(P[:,0]-MID).max()))
    # ---- split long edges so flat areas can follow the body
    me=bpy.data.meshes.new('g');me.from_pydata([tuple(v) for v in P],[],[tuple(int(i) for i in f) for f in F]);me.update();uvl=me.uv_layers.new(name='u')
    for l in me.loops:uvl.data[l.index].uv=UV[l.vertex_index]
    bm=bmesh.new();bm.from_mesh(me)
    for it in range(3):
        long=[e for e in bm.edges if e.calc_length()>0.024]
        if not long:break
        bmesh.ops.subdivide_edges(bm,edges=long,cuts=1);bmesh.ops.triangulate(bm,faces=bm.faces)
    bm.to_mesh(me);bm.free();me.update();uvl=me.uv_layers[0]
    P=np.array([v.co[:] for v in me.vertices],float);F=np.array([q.vertices[:] for q in me.polygons],int);UV=np.zeros((len(P),2))
    for l in me.loops:UV[l.vertex_index]=uvl.data[l.index].uv[:]
    # ---- sleeves and trouser legs: the mannequin's limbs are missing or posed differently, so lay each tube along his or her own limb
    def rot_to(a,b):
        v=np.cross(a,b);c=float(a@b);K=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]]);return np.eye(3)+K+K@K/(1+c)
    for side,sg in (('Left',1),('Right',-1)):
        X=sg*(P[:,0]-MID)
        if slot=='top':far=P[X>0.215];names=('Arm','ForeArm','Hand');rmax=0.105;xmin=0.13;u0=0.0;bw=0.07;ext=-0.015;ok=np.ones(len(P),bool)
        elif OPT['legs']:far=P[(X>0.03)&(P[:,1]<0.6)];names=('UpLeg','Leg','Foot');rmax=0.2;xmin=0.0;u0=0.04;bw=0.12;ext=0.03;ok=P[:,1]<0.82
        else:continue
        if len(far)<40:continue
        c0=far.mean(0);ag=np.linalg.svd(far-c0)[2][0];ag=ag if ag[1]<0 else -ag
        Sj,Ej,Hj=[JPOS['mixamorig:'+side+k] for k in names];Sg=c0+ag*((Sj-c0)@ag)
        u=(P-Sg)@ag;rv=(P-Sg)-np.outer(u,ag);rad=np.linalg.norm(rv,axis=1);sel=(u>-0.02)&(rad<rmax)&(X>xmin)&ok
        if sel.sum()<40:continue
        Lu=np.linalg.norm(Ej-Sj);Lf=np.linalg.norm(Hj-Ej);d1=(Ej-Sj)/Lu;d2=(Hj-Ej)/Lf;Lg=np.percentile(u[sel],99.5);k=min(1.0,(Lu+Lf+ext)/Lg);uu=np.clip(u,0,None)*k
        R1=rot_to(ag,d1);R2=rot_to(ag,d2);m1=Sj+np.outer(uu,d1)+rv@R1.T;m2=Ej+np.outer(uu-Lu,d2)+rv@R2.T;f=ss((uu-Lu+0.035)/0.07)[:,None];M=m1*(1-f)+m2*f
        b=(ss((u-u0)/bw)*sel)[:,None];P=P*(1-b)+M*b;SLV[side]=(b[:,0],uu,Lu,f[:,0],names)
        print('  %s %s: %d points, length %.2f on a limb of %.2f%s'%(side,'sleeve' if slot=='top' else 'leg',int(sel.sum()),Lg,Lu+Lf,' (shortened)' if k<1 else ''))
YH=JPOS['mixamorig:Hips'][1]
def minc(y):   # a top hangs outside whatever is worn at the waist
    return 0.006+(0.012*float(ss(np.array((YH+0.16-y)/0.08))) if slot=='top' else 0.0)
BL=np.zeros(len(BP))
if body_id=='f':   # the game raises her shoulders 4 cm when she loads; the piece has to go up with the skin under it
    wt=np.zeros(NJ)
    for i_,n_ in enumerate(jn):
        if any(k in n_ for k in ('Arm','Hand')):wt[i_]=1
        elif n_.endswith('LeftShoulder') or n_.endswith('RightShoulder'):wt[i_]=0.7
    lw=Wd@wt;_,bi_=np.unique(np.round(BP*2e4).astype(np.int64),axis=0,return_inverse=True);bi_=bi_.ravel();nb_=bi_.max()+1;w0=np.zeros(nb_);np.maximum.at(w0,bi_,lw);FB_=bi_[BF]
    E_=np.unique(np.sort(np.r_[FB_[:,[0,1]],FB_[:,[1,2]],FB_[:,[2,0]]],axis=1),axis=0);E_=E_[E_[:,0]!=E_[:,1]];dg_=np.zeros(nb_);np.add.at(dg_,E_[:,0],1);np.add.at(dg_,E_[:,1],1);cur=w0.copy()
    for _ in range(16):
        sm_=np.zeros(nb_);np.add.at(sm_,E_[:,0],cur[E_[:,1]]);np.add.at(sm_,E_[:,1],cur[E_[:,0]]);cur=np.maximum(w0*0.999,np.where(dg_>0,0.5*cur+0.5*sm_/np.maximum(dg_,1),cur))
    BL=np.where((cur[bi_]>0.002)&(BP[:,1]<1.36),0.04*cur[bi_],0.0)
LF=np.zeros(len(P))
# ---- weights and shapes from the body under each point; nothing left inside the skin
Wg=np.zeros((len(P),NJ));Dg={n:np.zeros((len(P),3)) for n in BT};Pn=P.copy()
for i,q in enumerate(P):
    loc,n,fi,d=body.find_nearest(Vector(q));tri=BF[fi];w3=1/(np.linalg.norm(BP[tri]-np.array(loc),axis=1)+1e-4);w3/=w3.sum()
    Wg[i]=(Wd[tri]*w3[:,None]).sum(0)
    LF[i]=(BL[tri]*w3).sum()
    for nm in BT:Dg[nm][i]=(BT[nm][tri]*w3[:,None]).sum(0)
    if slot!='shoes':
        v=Vector(q)-loc;dd=d if v.dot(n)>=0 else -d
        mc=minc(q[1])
        if dd<mc:Pn[i]=np.array(loc)+np.array(n)*mc
        elif slot=='top' and n[1]>0.55 and dd>0.012 and dd<0.06:Pn[i]=np.array(loc)+np.array(n)*0.011   # straps and shoulder seams rest on the shoulders
_,ginv=np.unique(np.round(P*1e5).astype(np.int64),axis=0,return_inverse=True);ginv=ginv.ravel();gn=ginv.max()+1;GF=ginv[F]
GE=np.unique(np.sort(np.r_[GF[:,[0,1]],GF[:,[1,2]],GF[:,[2,0]]],axis=1),axis=0);GE=GE[GE[:,0]!=GE[:,1]];deg=np.zeros(gn);np.add.at(deg,GE[:,0],1);np.add.at(deg,GE[:,1],1);deg=np.maximum(deg,1)
cnt=np.zeros(gn);np.add.at(cnt,ginv,1)
def weld(A):
    o=np.zeros((gn,A.shape[1]));np.add.at(o,ginv,A);return o/cnt[:,None]
def smooth(A,it,lam=0.5):
    A=weld(A)
    for _ in range(it):
        nb=np.zeros_like(A);np.add.at(nb,GE[:,0],A[GE[:,1]]);np.add.at(nb,GE[:,1],A[GE[:,0]]);A=(1-lam)*A+lam*nb/deg[:,None]
    return A
Pf=weld(P)+smooth(Pn-P,6)
if slot!='shoes':
    for i in range(gn):
        loc,n,_,d=body.find_nearest(Vector(Pf[i]));v=Vector(Pf[i])-loc
        mc=minc(Pf[i][1])
        if v.dot(n)<0 or d<mc-0.002:Pf[i]=np.array(loc)+np.array(n)*(mc-0.001)
P=Pf[ginv]
if slot=='shoes':   # rigid on the foot, the front on the toes
    Wg[:]=0
    for side,sg in (('Left',1),('Right',-1)):
        m=sg*(P[:,0]-MID)>0;jf,jt=jn.index('mixamorig:'+side+'Foot'),jn.index('mixamorig:'+side+'ToeBase');zt=JPOS['mixamorig:'+side+'ToeBase'][2];t=ss((P[:,2]-(zt-0.015))/0.04)*(P[:,1]<0.09)
        Wg[m,jf]=(1-t)[m];Wg[m,jt]=t[m]
    for nm in Dg:Dg[nm][:]=0
else:
    for side,(b,uu,Lu,f,names) in SLV.items():
        ia,ie=jn.index('mixamorig:'+side+names[0]),jn.index('mixamorig:'+side+names[1]);Wa=np.zeros_like(Wg);Wa[:,ia]=1-f;Wa[:,ie]=f;bb=(b*ss((uu-0.02)/(0.1 if slot=='top' else 0.16)))[:,None];Wg=Wg*(1-bb)+Wa*bb
Wg=smooth(Wg,4)[ginv]
for nm in Dg:Dg[nm]=smooth(Dg[nm],8)[ginv]
if slot!='shoes':   # at each full build shape the piece must still sit outside the skin
    for nm in Dg:
        bm_=BVHTree.FromPolygons([Vector(v) for v in BP+BT[nm]],[tuple(int(i) for i in f) for f in BF]);Q=weld(P+Dg[nm]);fix=0
        for i in range(gn):
            loc,n,_,d=bm_.find_nearest(Vector(Q[i]));v=Vector(Q[i])-loc
            mc=minc(Q[i][1])
            if v.dot(n)<0 or d<mc:Q[i]=np.array(loc)+np.array(n)*(mc+0.001);fix+=1
        Dg[nm]=(Q-weld(P))[ginv];print('  shape',nm,'points pushed out',fix)
top4=np.argsort(-Wg,axis=1)[:,:4];w4=np.take_along_axis(Wg,top4,1);w4/=w4.sum(1,keepdims=True)
fn=np.cross(P[F[:,1]]-P[F[:,0]],P[F[:,2]]-P[F[:,0]]);N=np.zeros((gn,3))
for k in range(3):np.add.at(N,GF[:,k],fn)
N=(N/np.linalg.norm(N,axis=1,keepdims=True).clip(1e-12))[ginv]
# ---- body skin hidden under the piece
cloth=BVHTree.FromPolygons([Vector(v) for v in P],[tuple(int(i) for i in f) for f in F])
_,binv=np.unique(np.round(BP*1e5).astype(np.int64),axis=0,return_inverse=True);binv=binv.ravel();bnw=binv.max()+1;BU=np.zeros((bnw,3));BU[binv]=BP;BFU=binv[BF]
bfn=np.cross(BU[BFU[:,1]]-BU[BFU[:,0]],BU[BFU[:,2]]-BU[BFU[:,0]]);bN=np.zeros((bnw,3))
for k in range(3):np.add.at(bN,BFU[:,k],bfn)
bN/=np.linalg.norm(bN,axis=1,keepdims=True).clip(1e-12);cov=np.zeros(bnw,bool);ylo,yhi=P[:,1].min(),P[:,1].max()
# skin that must stay drawn whatever a ray says: head and neck, hands (a loose collar, hood or cuff stands away from them), and feet under trousers
kw=np.zeros(bnw);kw[binv]=Wd[:,[i for i,n in enumerate(jn) if any(k in n for k in (('Head','Neck','Hand') if slot=='top' else ('Foot','Toe') if slot=='bottom' else ('Head',)))]].sum(1);keepb=kw>0.35
for i in range(bnw):
    if BU[i,1]<ylo-0.01 or BU[i,1]>yhi:continue
    if keepb[i]:continue
    loc,n,_,d=cloth.ray_cast(Vector(BU[i])+Vector(bN[i])*0.0005,Vector(bN[i]),0.09 if slot=='shoes' else 0.16)
    if loc is not None:cov[i]=True
    elif slot!='shoes':   # skin that has come through the cloth (a bust, an armpit) is under it all the same
        loc,n,_,d=cloth.ray_cast(Vector(BU[i])-Vector(bN[i])*0.0005,-Vector(bN[i]),0.035)
        if loc is not None:cov[i]=True
if slot=='shoes':
    fw=np.zeros(bnw);fw[binv]=Wd[:,[i for i,n in enumerate(jn) if 'Foot' in n or 'Toe' in n]].sum(1);cov|=(fw>0.5)&(BU[:,1]<min(0.11 if key in('f_sneakers','f_boots') else 0.07,yhi-0.02))
    if key in('f_sandals',):cov[:]=False
BE=np.unique(np.sort(np.r_[BFU[:,[0,1]],BFU[:,[1,2]],BFU[:,[2,0]]],axis=1),axis=0)
if slot!='shoes':   # a hole or thin spot in the cloth must not show the skin behind it: close gaps in the hidden area up to a hand's width
    NR=int(os.environ.get('CLOSE','4'));d_=cov.copy()
    for _ in range(NR):
        g_=d_.copy();g_[BE[d_[BE[:,1]],0]]=True;g_[BE[d_[BE[:,0]],1]]=True;d_=g_
    for _ in range(NR):
        u=~d_;bad=np.zeros(bnw,bool);bad[BE[u[BE[:,1]],0]]=True;bad[BE[u[BE[:,0]],1]]=True;d_&=~bad
    add=d_&~cov&~keepb&(BU[:,1]>=ylo-0.01)&(BU[:,1]<=yhi);cov|=add;print('  holes closed over',int(add.sum()),'skin points')
for it in range(1 if slot=='shoes' else 3):
    bad=np.zeros(bnw,bool);u=~cov;bad[BE[u[BE[:,1]],0]]=True;bad[BE[u[BE[:,0]],1]]=True;cov&=~bad
cover=np.where(cov[binv])[0];print('  body verts hidden',len(cover),'of',len(BP))
if LF.any():P=P.copy();P[:,1]+=smooth(LF[:,None],6)[ginv][:,0]
# ---- write
BIN=bytearray();views=[];accs=[]
def add(arr,comp,typ,mm=False):
    while len(BIN)%4:BIN.append(0)
    views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':arr.nbytes});BIN.extend(arr.tobytes());a={'bufferView':len(views)-1,'componentType':comp,'type':typ,'count':int(arr.shape[0])}
    if mm:a['min']=[float(x) for x in arr.min(0)];a['max']=[float(x) for x in arr.max(0)]
    accs.append(a);return len(accs)-1
names=list(Dg.keys())
pr={'attributes':{'POSITION':add(P.astype(np.float32),5126,'VEC3',True),'NORMAL':add(N.astype(np.float32),5126,'VEC3'),'TEXCOORD_0':add(UV.astype(np.float32),5126,'VEC2'),'JOINTS_0':add(top4.astype(np.uint16),5123,'VEC4'),'WEIGHTS_0':add(w4.astype(np.float32),5126,'VEC4')},
    'indices':add(F.astype(np.uint32).reshape(-1),5125,'SCALAR'),'material':1}
if slot!='shoes':pr['targets']=[{'POSITION':add(Dg[n].astype(np.float32),5126,'VEC3',True)} for n in names]
cv=add(cover.astype(np.uint32),5125,'SCALAR') if len(cover) else None
from PIL import ImageDraw,ImageFilter
TS=1024 if slot!='shoes' else 512;small=IMG.resize((TS,TS),Image.LANCZOS);mk_=Image.new('L',(TS,TS),0);dr=ImageDraw.Draw(mk_)
for t in F:dr.polygon([(float(UV[i,0]*TS),float(UV[i,1]*TS)) for i in t],fill=255)
mk_=mk_.filter(ImageFilter.MinFilter(3));A=np.array(small).astype(np.float32);M_=(np.array(mk_)>0)
# ---- flat colour: the scanned cloth detail and baked shadows go, a few clean colours stay (the game's look)
if os.environ.get('FLAT','1')=='1':
    sm=np.array(Image.fromarray(A.astype(np.uint8)).filter(ImageFilter.MedianFilter(7))).astype(np.float32);px=sm[M_]
    def feat(c):
        l=c@np.array([0.3,0.59,0.11],np.float32);return np.c_[l*float(os.environ.get('LW','0.55')),(c[:,0]-l),(c[:,2]-l),(c[:,1]-l)]
    fx=feat(px);K=int(os.environ.get('K','6'));rk=np.random.default_rng(3);sub=fx[rk.choice(len(fx),min(len(fx),30000),replace=False)]
    cen=[sub[0]]
    for _ in range(K-1):cen.append(sub[np.argmax(np.min([((sub-c)**2).sum(1) for c in cen],0))])
    cen=np.array(cen)
    for _ in range(15):
        lab=np.argmin(((sub[:,None]-cen[None])**2).sum(2),1)
        for k in range(K):
            if (lab==k).any():cen[k]=sub[lab==k].mean(0)
    lab=np.concatenate([np.argmin(((fx[i:i+200000,None]-cen[None])**2).sum(2),1) for i in range(0,len(fx),200000)])
    pal=np.array([np.median(px[lab==k],0) if (lab==k).any() else [0,0,0] for k in range(K)],np.float32);n_=np.bincount(lab,minlength=K)
    for k in range(K):   # a colour nearly the same as a bigger one folds into it
        for j in range(K):
            if n_[j]>n_[k] and np.abs(pal[k]-pal[j]).max()<26:lab[lab==k]=j;break
    flat=A.copy();flat[M_]=pal[lab];L2=np.zeros((TS,TS),np.uint8);L2[M_]=lab+1
    L2=np.array(Image.fromarray(L2).filter(ImageFilter.ModeFilter(9)));ok_=M_&(L2>0);flat[ok_]=pal[L2[ok_]-1]   # specks go
    soft=np.array(Image.fromarray(A.astype(np.uint8)).filter(ImageFilter.GaussianBlur(14))).astype(np.float32)
    A=np.array(Image.fromarray((flat*0.86+soft*0.14).clip(0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32);A[~M_]=0
    print('  flat colours',[tuple(int(v) for v in pal[k]) for k in np.unique(lab)])
for it in range(48):
    if M_.all():break
    acc_=np.zeros_like(A);cnt_=np.zeros((TS,TS),np.float32)
    for dy,dx in ((0,1),(0,-1),(1,0),(-1,0)):
        acc_+=np.roll(A*M_[:,:,None],(dy,dx),(0,1));cnt_+=np.roll(M_,(dy,dx),(0,1))
    new=(~M_)&(cnt_>0);A[new]=acc_[new]/cnt_[new][:,None];M_=M_|new
IMG=Image.fromarray(A.clip(0,255).astype(np.uint8))
buf=io.BytesIO();IMG.save(buf,'JPEG',quality=86);ib=buf.getvalue()
while len(BIN)%4:BIN.append(0)
views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':len(ib)});BIN.extend(ib)
while len(BIN)%4:BIN.append(0)
ex={'targetNames':names if slot!='shoes' else [],'bodyVerts':len(BP)}
if cv is not None:ex['cover']=cv
GJ={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':key,'mesh':0}],'meshes':[{'primitives':[pr],'extras':ex}],
    'materials':[{'name':'hair'},{'name':'cloth','doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':0}}}],'textures':[{'source':0}],'images':[{'bufferView':len(views)-1,'mimeType':'image/jpeg'}],'bufferViews':views,'accessors':accs,'buffers':[{'byteLength':len(BIN)}]}
js=json.dumps(GJ,separators=(',',':')).encode()
while len(js)%4:js+=b' '
out='/home/claude/out/wear/%s_%s.glb'%(slot,key)
open(out,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(BIN))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(BIN),0x004E4942)+bytes(BIN));print('  wrote',out,'%.2f MB'%(len(BIN)/1e6))
