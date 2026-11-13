"""Shell clothes (prototype): a garment built FROM the body instead of a warped scan.
python3 shell_wear.py SLOT_KEY m|f [outdir]      e.g.  python3 shell_wear.py top_f_sweater f
Input: the fitted scan out/wear/SLOT_KEY.glb (its cover list, shape and palette are the guide). Nothing is regenerated in Meshy.
1. Area: the body skin the scan piece hides (its cover), as a smooth field cut along its 0.5 line, so hems, cuffs and the
   neckline are clean curves whatever the body's triangle size. Trouser legs can be run down to the ankle (LEGS=1).
2. Each point is pushed out along the body normal by the distance to the fitted scan there, clamped 4..50 mm and smoothed;
   hollows (armpit, crotch) are capped so the shell cannot fold into itself.
3. Skin weights and build shapes are the body's own (the shapes re-offset along each morphed body's normals), so it follows
   every build and pose with no holes and no skin through it.
4. Colour: the scan's colours under each point, cut to a few flat colours, specks voted away; drawn from a tiny swatch texture.
5. A rim joins the shell's edge back to the skin, so a hem reads as a thick folded edge, never a paper-thin cut."""
import sys,os,io,json,struct,numpy as np
from scipy.spatial import cKDTree
from scipy.sparse.csgraph import connected_components
from scipy.sparse import coo_matrix
from PIL import Image
R=os.path.dirname(os.path.abspath(__file__))+'/../out'
name,body_id=sys.argv[1],sys.argv[2];OUT=sys.argv[3] if len(sys.argv)>3 else R+'/shell'
slot,key=name.split('_',1)
ENV=lambda k,d:type(d)(os.environ.get(k,d))
LEGS=ENV('LEGS',1 if key in('jeans','f_jeans','trousers','cargo','sweats','f_flare','f_wide') else 0)
CT={5126:np.float32,5125:np.uint32,5123:np.uint16,5121:np.uint8};NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def glb(f):
    d=open(f,'rb').read();L=struct.unpack('<I',d[12:16])[0];return json.loads(d[20:20+L]),d[20+L+8:]
def mk(J,B):
    def acc(i):
        a=J['accessors'][i];bv=J['bufferViews'][a['bufferView']];return np.frombuffer(B,CT[a['componentType']],a['count']*NC[a['type']],bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
    return acc
# ---- body (the fitting body: same topology and joint order as the runtime body)
BJ,BB=glb(R+'/'+{'m':'male-body-final.glb','f':'base-plus-build.glb'}[body_id]);ba=mk(BJ,BB);bp=BJ['meshes'][0]['primitives'][0]
BP=ba(bp['attributes']['POSITION']).astype(float);BF=ba(bp['indices']).reshape(-1,3).astype(int)
BJn=ba(bp['attributes']['JOINTS_0']).astype(int);BW=ba(bp['attributes']['WEIGHTS_0']).astype(float)
tnames=BJ['meshes'][0]['extras']['targetNames'];BT={n:ba(bp['targets'][i]['POSITION']).astype(float) for i,n in enumerate(tnames)}
jn=[BJ['nodes'][j]['name'] for j in BJ['skins'][0]['joints']];NJ=len(jn)
Wd=np.zeros((len(BP),NJ));np.add.at(Wd,(np.repeat(np.arange(len(BP)),4),BJn.ravel()),BW.ravel())
# ---- the fitted scan piece
J,B=glb(R+'/wear/%s.glb'%name);ga=mk(J,B);pr=J['meshes'][0]['primitives'][0];ex=J['meshes'][0]['extras']
P=ga(pr['attributes']['POSITION']).astype(float);UV=ga(pr['attributes']['TEXCOORD_0']).astype(float);F=ga(pr['indices']).reshape(-1,3).astype(int)
cover=ga(ex['cover']).ravel().astype(int)
iv=J['bufferViews'][J['images'][0]['bufferView']];TEX=np.array(Image.open(io.BytesIO(B[iv.get('byteOffset',0):iv.get('byteOffset',0)+iv['byteLength']])).convert('RGB')).astype(float);TH,TW=TEX.shape[:2]
# ---- weld the body (within 1 mm: his mesh has near-duplicate seam points)
pr_=cKDTree(BP).query_pairs(0.001,output_type='ndarray')
nw,binv=connected_components(coo_matrix((np.ones(len(pr_)),(pr_[:,0],pr_[:,1])),shape=(len(BP),len(BP))),directed=False)
first=np.full(nw,-1);first[binv[::-1]]=np.arange(len(BP))[::-1]
WP=BP[first];WF=binv[BF];WF=WF[(WF[:,0]!=WF[:,1])&(WF[:,1]!=WF[:,2])&(WF[:,0]!=WF[:,2])]
WW=Wd[first];WT={k:v[first] for k,v in BT.items()}
def vnorm(X,Fc):
    fn=np.cross(X[Fc[:,1]]-X[Fc[:,0]],X[Fc[:,2]]-X[Fc[:,0]]);N=np.zeros_like(X)
    for k in range(3):np.add.at(N,Fc[:,k],fn)
    return N/np.linalg.norm(N,axis=1,keepdims=True).clip(1e-12)
WN=vnorm(WP,WF)
E=np.unique(np.sort(np.r_[WF[:,[0,1]],WF[:,[1,2]],WF[:,[2,0]]],axis=1),axis=0);deg=np.zeros(nw);np.add.at(deg,E[:,0],1);np.add.at(deg,E[:,1],1);deg=np.maximum(deg,1)
def smooth(A,it,lam=0.5,mask=None):
    A=A.copy().astype(float)
    for _ in range(it):
        nb=np.zeros_like(A);np.add.at(nb,E[:,0],A[E[:,1]]);np.add.at(nb,E[:,1],A[E[:,0]]);A2=(1-lam)*A+lam*(nb/deg[:,None] if A.ndim>1 else nb/deg)
        A=A2 if mask is None else np.where(mask if A.ndim==1 else mask[:,None],A2,A)
    return A
jw=lambda keys:WW[:,[i for i,n_ in enumerate(jn) if any(k in n_ for k in keys)]].sum(1)
# ---- her shoulder lift (the game raises her shoulders 4 cm at load; clothes carry it baked in), the rule in fit_wear.py
LIFT=np.zeros(nw)
if body_id=='f':
    wt=np.zeros(NJ)
    for i_,n_ in enumerate(jn):
        if any(k in n_ for k in ('Arm','Hand')):wt[i_]=1
        elif n_.endswith('LeftShoulder') or n_.endswith('RightShoulder'):wt[i_]=0.7
    _,bi_=np.unique(np.round(BP*2e4).astype(np.int64),axis=0,return_inverse=True);bi_=bi_.ravel();nb_=bi_.max()+1;w0=np.zeros(nb_);np.maximum.at(w0,bi_,Wd@wt);FB_=bi_[BF]
    E_=np.unique(np.sort(np.r_[FB_[:,[0,1]],FB_[:,[1,2]],FB_[:,[2,0]]],axis=1),axis=0);E_=E_[E_[:,0]!=E_[:,1]];dg_=np.zeros(nb_);np.add.at(dg_,E_[:,0],1);np.add.at(dg_,E_[:,1],1);cur=w0.copy()
    for _ in range(16):
        sm_=np.zeros(nb_);np.add.at(sm_,E_[:,0],cur[E_[:,1]]);np.add.at(sm_,E_[:,1],cur[E_[:,0]]);cur=np.maximum(w0*0.999,np.where(dg_>0,0.5*cur+0.5*sm_/np.maximum(dg_,1),cur))
    LIFT=np.where((cur[bi_]>0.002)&(BP[:,1]<1.36),0.04*cur[bi_],0.0)[first]
L3=np.c_[np.zeros(nw),LIFT,np.zeros(nw)]
WPl=WP+L3   # the body as the scan piece sees it
# ---- 1. the area as a smooth field; skin that must stay bare (head, neck, hands; feet under trousers) is pinned to 0
f=np.zeros(nw);f[binv[cover]]=1
bare=jw(('Head','Hand') if slot=='top' else ('Foot','Toe','Arm','Hand','Head','Neck'))>0.45   # (the neck is the scan's call: a turtleneck covers it, a crew neck does not)
if LEGS:   # trouser legs run down to just above the ankle bone
    ya=WP[jw(('Foot',))>0.5,1].max()
    f[(jw(('UpLeg','Leg'))>0.5)&(WP[:,1]>ya+0.012)]=1
if slot=='top':   # the cover never lists the neck (fit_wear keeps it bare); a collar or turtleneck that really wraps it brings it in
    S0_=np.r_[P,P[F].mean(1)];yc_=np.percentile(WPl[f>0,1],70);nk=np.where(((jw(('Neck',))>0.3)|((WPl[:,1]>yc_)&(jw(('Arm','Hand'))<0.5)))&~bare&(f==0))[0]   # the neck, and the top of the chest and back below it
    if len(nk):
        dn,_=cKDTree(S0_).query(WPl[nk]);f[nk[dn<ENV('NECKD',0.022)]]=1;print('  neck points under the collar',int((dn<ENV('NECKD',0.022)).sum()),'of',len(nk))
if slot=='top':   # a top ends at a level hem: a shell cannot hang, so whatever the scan has below the hip line is dropped
    mx=np.median(WP[jw(('Spine',))>0.5,0]);ul=jw(('UpLeg',))>0.3;ycr=WP[ul&(np.abs(WP[:,0]-mx)<0.02),1].max()   # the crotch
    ys=P[np.abs(P[:,0]-mx)<0.14,1];yhem=max(np.percentile(ys,4),ycr+ENV('HEMUP',0.01))   # the scan's hem, but never down over the seat
    yhem=float(os.environ.get('YHEM',yhem));f[(WPl[:,1]<yhem)&(jw(('Arm','Hand'))<0.5)]=0;print('  hem at y %.3f'%yhem)
f[bare]=0
YHEM_=yhem if slot=='top' else None
# ---- the body under the garment is split finer (no edge over LMAX), so the cut line is a smooth curve even where her
#      mesh has big triangles (the upper chest); the split is conforming (both sides of an edge), so nothing cracks
WTN={k:vnorm(WP+WT[k],WF) for k in WT}
sel=f>0
for _ in range(3):
    g_=sel.copy();g_[E[sel[E[:,1]],0]]=True;g_[E[sel[E[:,0]],1]]=True;sel=g_
SFc=WF[sel[WF].any(1)]
# only near the edge of the area: the inside keeps the body's own triangles
edge_=np.zeros(nw,bool);bb_=(f[E[:,0]]>0)!=(f[E[:,1]]>0);edge_[E[bb_].ravel()]=True
for _ in range(ENV('BAND',4)):
    g_=edge_.copy();g_[E[edge_[E[:,1]],0]]=True;g_[E[edge_[E[:,0]],1]]=True;edge_=g_
lapc=smooth(WP,1,1.0)-WP;concc=-(lapc*WN).sum(1)
VA={'P':WP,'N':WN,'W':WW,'L':L3,'f':f[:,None],'band':edge_[:,None].astype(float),'conc':concc[:,None],'bare':bare[:,None].astype(float),**{'T_'+k:WT[k] for k in WT},**{'TN_'+k:WTN[k] for k in WT}}
LMAX=ENV('LMAX',0.009)
for it in range(8):
    e3=np.sort(np.stack([SFc[:,[0,1]],SFc[:,[1,2]],SFc[:,[2,0]]],1),axis=2);ek=e3.reshape(-1,2)
    ue,einv=np.unique(ek,axis=0,return_inverse=True);einv=einv.reshape(-1,3)
    ln=np.linalg.norm(VA['P'][ue[:,0]]-VA['P'][ue[:,1]],axis=1);lg=(ln>LMAX)&((VA['band'][ue[:,0],0]>0)|(VA['band'][ue[:,1],0]>0))
    if not lg.any():break
    n0=len(VA['P']);mid=-np.ones(len(ue),int);mid[lg]=n0+np.arange(lg.sum())
    VA={k:np.r_[v,(v[ue[lg,0]]+v[ue[lg,1]])/2] for k,v in VA.items()}
    NFs=[]
    for t,ei in zip(SFc,einv):
        m=mid[ei]
        k_=(m>=0).sum()
        if k_==0:NFs.append(t);continue
        # rotate so the first split edge is edge 0 (t0-t1)
        r=int(np.argmax(m>=0)) if k_<3 else 0
        if k_==2 and m[(r+2)%3]>=0 and m[r]>=0 and m[(r+1)%3]<0:r=(r+2)%3
        a,b,c=t[r],t[(r+1)%3],t[(r+2)%3];mab,mbc,mca=m[r],m[(r+1)%3],m[(r+2)%3]
        if k_==3:NFs+= [[a,mab,mca],[mab,b,mbc],[mca,mbc,c],[mab,mbc,mca]]
        elif k_==1:NFs+=[[a,mab,c],[mab,b,c]]
        else:   # ab and bc split
            NFs+=[[a,mab,c],[mab,b,mbc],[mab,mbc,c]]
    SFc=np.array(NFs,int)
print('  work mesh: verts',len(VA['P']),'tris',len(SFc),'(body tris under the piece before the split %d)'%int(sel[WF].any(1).sum()))
# from here on the "body" is the fine work mesh
nw=len(VA['P']);WP=VA['P'];WN=VA['N']/np.linalg.norm(VA['N'],axis=1,keepdims=True).clip(1e-12);WW=VA['W'];L3=VA['L'];LIFT=L3[:,1];WPl=WP+L3
WT={k:VA['T_'+k] for k in WT};WTN={k:VA['TN_'+k]/np.linalg.norm(VA['TN_'+k],axis=1,keepdims=True).clip(1e-12) for k in WT}
f=VA['f'][:,0];bare=VA['bare'][:,0]>0.5;WF=SFc
E=np.unique(np.sort(np.r_[WF[:,[0,1]],WF[:,[1,2]],WF[:,[2,0]]],axis=1),axis=0);deg=np.zeros(nw);np.add.at(deg,E[:,0],1);np.add.at(deg,E[:,1],1);deg=np.maximum(deg,1)
f[bare]=0
f=smooth(f,ENV('FS',40));f[bare]=0
for _ in range(2):   # holes in the area close
    out_=np.where(f<0.5)[0];G=coo_matrix((np.ones(len(E)),(E[:,0],E[:,1])),shape=(nw,nw)).tocsr()[out_][:,out_]
    lab_=connected_components(G,directed=False)[1];ul,uc=np.unique(lab_,return_counts=True)
    for l,c_ in zip(ul,uc):
        if c_<ENV('HOLE',3000) and not bare[out_[lab_==l]].any():f[out_[lab_==l]]=0.75
    f=smooth(f,6);f[bare]=0
ins_=np.where(f>=0.5)[0];G=coo_matrix((np.ones(len(E)),(E[:,0],E[:,1])),shape=(nw,nw)).tocsr()[ins_][:,ins_]
lab_=connected_components(G,directed=False)[1];ul,uc=np.unique(lab_,return_counts=True)
for l,c_ in zip(ul,uc):   # specks of area away from the piece (a few rays that hit a sleeve from the forearm) go
    if c_<ENV('SPECK',400):f[ins_[lab_==l]]=0
f=smooth(f,2)
if YHEM_ is not None:   # the hem is level: cut exactly at its height (sleeves are not cut)
    f=np.where(jw(('Arm','Hand'))<0.5,np.minimum(f,np.clip((WPl[:,1]-YHEM_)/0.004+0.5,0,1)),f)
if LEGS:   # trouser cuffs are level too, just above the ankle
    f=np.where(jw(('UpLeg','Leg'))>0.3,np.minimum(f,np.clip((WP[:,1]-(ya+0.02))/0.004+0.5,0,1)),f)
# ---- 2. offset out to the scan: dense samples on the scan surface, with UVs
S=np.r_[P,(P[F[:,0]]+P[F[:,1]])/2,(P[F[:,1]]+P[F[:,2]])/2,(P[F[:,2]]+P[F[:,0]])/2,P[F].mean(1)]
SUV=np.r_[UV,UV[F[:,0]],UV[F[:,1]],UV[F[:,2]],UV[F[:,0]]]
tree=cKDTree(S)
act=np.where(f>0.02)[0];X0=WPl[act];N0=WN[act]
d_near,i_near=tree.query(X0);off=d_near.copy();uvi=i_near.copy()
cand=tree.query_ball_point(X0+N0*0.03,r=0.034)
for v in range(len(act)):
    c=np.array(cand[v],int)
    if len(c):
        D=S[c]-X0[v];al=D@N0[v];pp=np.linalg.norm(D-np.outer(al,N0[v]),axis=1);ok=(al>-0.004)&(pp<0.012+0.25*np.abs(al))
        if ok.any():j=np.argmin(np.where(ok,pp+0.3*np.abs(al),9));off[v]=al[j];uvi[v]=c[j]
LO,HI=ENV('LO',0.004),ENV('HI',0.05)
OFF=np.full(nw,LO);OFF[act]=np.clip(off,LO,HI)
unk=np.zeros(nw,bool);unk[act]=d_near>ENV('FAR',0.04)
if unk.any():   # past the end of the scan (trouser legs run down to the ankle): the looseness carries on from where the scan stops
    kn=act[~unk[act]]
    if len(kn):OFF[unk]=OFF[kn[cKDTree(WP[kn]).query(WP[unk])[1]]]
    OFF=smooth(OFF,300,mask=unk);print('  points past the scan',int(unk.sum()))
conc=VA['conc'][:,0];OFF=np.minimum(OFF,np.where(conc>0.0006,0.008,HI))
m_=f>0.02;OFF=smooth(OFF,ENV('SM',40),mask=m_);OFF=np.clip(OFF,LO,HI)
# ---- 4. colours: the scan colour under each point -> a few flat colours, specks voted away
COL=np.zeros((nw,3));uv_=SUV[uvi];COL[act]=TEX[np.clip((uv_[:,1]*TH).astype(int),0,TH-1),np.clip((uv_[:,0]*TW).astype(int),0,TW-1)]
COL=np.where(m_[:,None],smooth(COL,4,mask=m_),COL)
px=COL[act];K=6;rk=np.random.default_rng(3);cen=[px[rk.integers(len(px))]]
for _ in range(K-1):cen.append(px[np.argmax(np.min([((px-c)**2).sum(1) for c in cen],0))])
cen=np.array(cen)
for _ in range(20):
    lab=np.argmin(((px[:,None]-cen[None])**2).sum(2),1)
    for k in range(K):
        if (lab==k).any():cen[k]=px[lab==k].mean(0)
MERGE=ENV('MERGE',58)
cnt=np.bincount(lab,minlength=K)
for k in np.argsort(cnt):   # a colour close to a bigger one folds into it (baked shading, not a real second colour)
    for j in np.argsort(-cnt):
        if j!=k and cnt[j]>cnt[k] and np.abs(cen[k]-cen[j]).max()<MERGE:lab[lab==k]=j;cnt=np.bincount(lab,minlength=K);break
LAB=-np.ones(nw,int);LAB[act]=lab
on=m_.copy()
for _ in range(ENV('VOTE',16)):   # each point takes the commonest colour round it
    V=np.zeros((nw,K));np.add.at(V,(E[:,0],np.maximum(LAB[E[:,1]],0)),on[E[:,1]]);np.add.at(V,(E[:,1],np.maximum(LAB[E[:,0]],0)),on[E[:,0]])
    V[on,np.maximum(LAB[on],0)]+=1.5;LAB=np.where(on,V.argmax(1),LAB)
cnt=np.bincount(LAB[on],minlength=K);small=cnt<ENV('MINC',0.02)*on.sum()
for _ in range(60):   # colours too small to matter go to their neighbours
    if not small[LAB[on]].any():break
    V=np.zeros((nw,K));ok_=on&~small[np.maximum(LAB,0)];np.add.at(V,(E[:,0],np.maximum(LAB[E[:,1]],0)),ok_[E[:,1]]);np.add.at(V,(E[:,1],np.maximum(LAB[E[:,0]],0)),ok_[E[:,0]])
    rep=on&small[np.maximum(LAB,0)]&(V.sum(1)>0);LAB[rep]=V[rep].argmax(1)
PAL=np.array([np.median(COL[on&(LAB==k)],0) if (on&(LAB==k)).any() else [0,0,0] for k in range(K)])
print(name,'colours',[(tuple(int(x) for x in PAL[k]),int((LAB[on]==k).sum())) for k in range(K) if (LAB[on]==k).any()])
# ---- cut along f=0.5: kept triangles whole, edge triangles clipped; new points sit on body edges (all attributes lerped)
attrs={'P':WP,'N':WN,'O':OFF[:,None],'W':WW,'L':L3,**{'T_'+k:WT[k] for k in WT},**{'TN_'+k:WTN[k] for k in WT}}
pts={k:[v] for k,v in attrs.items()};lab_pts=[LAB];cnt_pts=[nw];ecache={}
def epoint(a,b):
    kk=(min(a,b),max(a,b))
    if kk in ecache:return ecache[kk]
    t=(0.5-f[a])/(f[b]-f[a])
    for k,v in attrs.items():pts[k].append((v[a]*(1-t)+v[b]*t)[None])
    lab_pts.append(np.array([LAB[a] if f[a]>=0.5 else LAB[b]]));ecache[kk]=cnt_pts[0];cnt_pts[0]+=1;return ecache[kk]
inside=f>=0.5;OUTF=[]
for t in WF:
    s_=inside[t]
    if s_.all():OUTF.append(list(t));continue
    if not s_.any():continue
    poly=[]
    for i in range(3):
        a,b=t[i],t[(i+1)%3]
        if inside[a]:poly.append(a)
        if inside[a]!=inside[b]:poly.append(epoint(a,b))
    for i in range(1,len(poly)-1):OUTF.append([poly[0],poly[i],poly[i+1]])
npts=cnt_pts[0]
A={k:np.concatenate(v) for k,v in pts.items()};LB=np.concatenate(lab_pts);SF=np.array(OUTF,int)
used=np.unique(SF);re=-np.ones(npts,int);re[used]=np.arange(len(used));SF=re[SF];A={k:v[used] for k,v in A.items()};LB=LB[used];n=len(used)
nrm=lambda v:v/np.linalg.norm(v,axis=1,keepdims=True).clip(1e-12)
# ---- the shell and its rim
be_all=np.sort(np.r_[SF[:,[0,1]],SF[:,[1,2]],SF[:,[2,0]]],axis=1);u_,c_=np.unique(be_all,axis=0,return_counts=True);be=u_[c_==1]
onb=np.zeros(n,bool);onb[be.ravel()]=True
O=A['O'][:,0].copy()
# hems lie close: the offset eases down over the last few cm to the edge (a cuff, a waistband, a collar)
Ed=u_;dg2=np.zeros(n);np.add.at(dg2,Ed[:,0],1);np.add.at(dg2,Ed[:,1],1)
ring=onb.astype(float)
for _ in range(4):
    nb=np.zeros(n);np.add.at(nb,Ed[:,0],ring[Ed[:,1]]);np.add.at(nb,Ed[:,1],ring[Ed[:,0]]);ring=np.maximum(ring,0.65*nb/np.maximum(dg2,1))
O=np.maximum(LO,O*(1-ENV('RING',0.4)*ring))
N=nrm(A['N']);X=A['P']+A['L']+N*O[:,None]
own=set()
for t in SF:own|={(t[0],t[1]),(t[1],t[2]),(t[2],t[0])}
ub=np.unique(be);rmap=-np.ones(n,int);rmap[ub]=n+np.arange(len(ub))
RQ=[]
for a,b in be:
    if (a,b) not in own:a,b=b,a
    RQ+=[[b,a,rmap[a]],[b,rmap[a],rmap[b]]]
RQ=np.array(RQ,int).reshape(-1,3)
GX=np.r_[X,A['P'][ub]+A['L'][ub]+N[ub]*0.0012]
GW=np.r_[A['W'],A['W'][ub]];GL=np.r_[LB,LB[ub]]
GT={k:np.r_[(A['P']+A['T_'+k]+A['L']+nrm(A['TN_'+k])*O[:,None])-X,((A['P']+A['T_'+k]+A['L']+nrm(A['TN_'+k])*0.0012)-(A['P']+A['L']+N*0.0012))[ub]] for k in WT}
FA=np.r_[SF,RQ]
GN=vnorm(GX,FA)
# ---- one flat colour per triangle (the commonest of its corners), split where colours meet
flab=np.array([np.bincount(GL[t],minlength=K).argmax() for t in FA])
vid={};NV=[];NF=np.zeros_like(FA)
for ti,t in enumerate(FA):
    for c in range(3):
        kk=(t[c],flab[ti])
        if kk not in vid:vid[kk]=len(NV);NV.append(kk)
        NF[ti,c]=vid[kk]
src=np.array([a for a,_ in NV]);vl=np.array([b for _,b in NV])
# texture: a strip of flat swatches on top; below it, for a print on the front of a top, a decal projected straight from the front
DS=512;TW_=DS;TH_=16+DS;TEXI=np.zeros((TH_,TW_,3),np.uint8);sw=TW_//K
main=int(np.bincount(LAB[on],minlength=K).argmax())
for k in range(K):TEXI[:16,k*sw:(k+1)*sw]=PAL[k].clip(0,255).astype(np.uint8)
VUV=np.c_[(vl*sw+sw/2)/TW_,np.full(len(vl),8/TH_)]
GNs=GN[src];front=(GNs[:,2]>0.3)&(np.arange(len(src))<len(src))
DEC=0
if slot=='top' and ENV('DECAL',1):
    # front scan points (normal toward +z, in front of the body's middle), their colours seen straight on
    Pn_=ga(pr['attributes']['NORMAL']).astype(float) if 'NORMAL' in pr['attributes'] else None
    zc=np.median(WPl[inside,2]);fs=(S[:,2]>zc)
    if Pn_ is not None:fn_=np.r_[Pn_,Pn_[F[:,0]],Pn_[F[:,1]],Pn_[F[:,2]],Pn_[F[:,0]]];fs&=fn_[:,2]>0.2
    Sf=S[fs];Sc=TEX[np.clip((SUV[fs][:,1]*TH).astype(int),0,TH-1),np.clip((SUV[fs][:,0]*TW).astype(int),0,TW-1)]
    # a print is a colour far from the cloth's own, in a patch on the chest
    dmain=np.abs(Sc-PAL[main]).max(1);pm=dmain>ENV('PRINTD',90)
    yl,yh=WPl[inside,1].min(),WPl[inside,1].max();chest=(Sf[:,1]>yl+0.35*(yh-yl))&(Sf[:,1]<yh-0.08)&(np.abs(Sf[:,0]-np.median(WPl[inside,0]))<0.16)
    if (pm&chest).sum()>ENV('PRINTN',300):
        pp_=Sf[pm&chest];x0,x1=pp_[:,0].min()-0.03,pp_[:,0].max()+0.03;y0,y1=pp_[:,1].min()-0.03,pp_[:,1].max()+0.03;sz=max(x1-x0,y1-y0);cx,cy=(x0+x1)/2,(y0+y1)/2;x0,y0=cx-sz/2,cy-sz/2
        t2=cKDTree(Sf[:,:2]);gx,gy=np.meshgrid(x0+(np.arange(DS)+0.5)/DS*sz,y0+sz-(np.arange(DS)+0.5)/DS*sz)
        dd,ii=t2.query(np.c_[gx.ravel(),gy.ravel()]);img=Sc[ii]
        # two colours: the cloth's and the print's (its median), each pixel to the nearer; then a mode filter for crisp edges
        pc=np.median(Sc[pm&chest],0);isp=(np.abs(img-pc).sum(1)<np.abs(img-PAL[main]).sum(1)).reshape(DS,DS)
        from PIL import ImageFilter
        isp=np.array(Image.fromarray((isp*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.2)))>127
        D=np.where(isp[:,:,None],pc,PAL[main]).clip(0,255).astype(np.uint8);TEXI[16:]=D
        # triangles on the front of the chest inside the decal square take its projection
        P3=V_=GX[src];inb=(P3[:,0]>x0)&(P3[:,0]<x0+sz)&(P3[:,1]>y0)&(P3[:,1]<y0+sz)&(GNs[:,2]>0.25)&(P3[:,2]>zc)
        tri_ok=inb[NF].all(1)&(vl[NF]==main).all(1)
        dv=np.unique(NF[tri_ok]);nid=-np.ones(len(src),int);nid[dv]=len(src)+np.arange(len(dv))
        src=np.r_[src,src[dv]];vl=np.r_[vl,vl[dv]]
        du=np.c_[(P3[dv,0]-x0)/sz,(16+(1-(P3[dv,1]-y0)/sz)*DS)/TH_]
        VUV=np.r_[VUV,du];NF[tri_ok]=nid[NF[tri_ok]];DEC=int(tri_ok.sum())
print('  decal triangles',DEC)
V=GX[src];VN=GN[src];VW=GW[src];VT={k:v[src] for k,v in GT.items()}
top4=np.argsort(-VW,axis=1)[:,:4];w4=np.take_along_axis(VW,top4,1);w4/=w4.sum(1,keepdims=True).clip(1e-9)
print('  verts',len(V),'tris',len(NF),'rim edges',len(be),'offset mm p10/50/90/max',np.round(np.percentile(O,[10,50,90,100])*1000,1))
# ---- write (same layout as fit_wear.py so the builder loads it unchanged)
BIN=bytearray();views=[];accs=[]
def add(arr,comp,typ,mm=False):
    while len(BIN)%4:BIN.append(0)
    views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':arr.nbytes});BIN.extend(arr.tobytes());a={'bufferView':len(views)-1,'componentType':comp,'type':typ,'count':int(arr.shape[0])}
    if mm:a['min']=[float(x) for x in arr.min(0)];a['max']=[float(x) for x in arr.max(0)]
    accs.append(a);return len(accs)-1
names=list(WT.keys())
pr2={'attributes':{'POSITION':add(V.astype(np.float32),5126,'VEC3',True),'NORMAL':add(VN.astype(np.float32),5126,'VEC3'),'TEXCOORD_0':add(VUV.astype(np.float32),5126,'VEC2'),'JOINTS_0':add(top4.astype(np.uint16),5123,'VEC4'),'WEIGHTS_0':add(w4.astype(np.float32),5126,'VEC4')},
     'indices':add(NF.astype(np.uint32).reshape(-1),5125,'SCALAR'),'material':1,'targets':[{'POSITION':add(VT[k].astype(np.float32),5126,'VEC3',True)} for k in names]}
# skin hidden under the shell
hid=np.where(inside[:len(first)][binv])[0].astype(np.uint32)   # exactly the shell's area: nothing hidden past its edge
cv=add(hid,5125,'SCALAR')
buf=io.BytesIO();Image.fromarray(TEXI).save(buf,'PNG');Image.fromarray(TEXI).save(OUT+'/%s_tex.png'%name) if os.path.isdir(OUT) else None;IMG=buf.getvalue()
while len(BIN)%4:BIN.append(0)
views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':len(IMG)});BIN.extend(IMG)
while len(BIN)%4:BIN.append(0)
ex2={'targetNames':names,'bodyVerts':len(BP),'cover':cv,'shell':True,'under':[int(x) for x in PAL[main]]}
GJ={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':name,'mesh':0}],'meshes':[{'primitives':[pr2],'extras':ex2}],
    'materials':[{'name':'hair'},{'name':'cloth','doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':0}}}],'textures':[{'source':0}],'images':[{'bufferView':len(views)-1,'mimeType':'image/png'}],'bufferViews':views,'accessors':accs,'buffers':[{'byteLength':len(BIN)}]}
js=json.dumps(GJ,separators=(',',':')).encode()
while len(js)%4:js+=b' '
os.makedirs(OUT,exist_ok=True);out=OUT+'/%s.glb'%name
open(out,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(BIN))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(BIN),0x004E4942)+bytes(BIN));print('  wrote',out,'%.2f MB'%(len(BIN)/1e6))
