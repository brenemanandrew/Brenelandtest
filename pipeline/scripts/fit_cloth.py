"""A Meshy garment on a mannequin -> a skinned top for the male body: the mannequin is cut away (grey, reached from the neck and the stump),
the garment is sized and placed on his torso, sleeves are drawn onto his arms, skin weights and build shapes are taken from the body under
each point, and the body skin hidden under the garment is listed so it can be left undrawn.   bvenv/bin/python fit_cloth.py key"""
import sys,json,struct,io,numpy as np,bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.append('/home/claude/pylib')
from PIL import Image
key=sys.argv[-1]
CT={5126:np.float32,5125:np.uint32,5123:np.uint16,5121:np.uint8};NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def glb(f):
    d=open(f,'rb').read();L=struct.unpack('<I',d[12:16])[0];return json.loads(d[20:20+L]),d[20+L+8:]
def mk(J,B):
    def acc(i):
        a=J['accessors'][i];bv=J['bufferViews'][a['bufferView']];return np.frombuffer(B,CT[a['componentType']],a['count']*NC[a['type']],bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
    return acc
# ---- the body
BJ,BB=glb('/home/claude/out/male-body-final.glb');ba=mk(BJ,BB);bp=BJ['meshes'][0]['primitives'][0]
BP=ba(bp['attributes']['POSITION']).astype(float);BF=ba(bp['indices']).reshape(-1,3).astype(int);BJn=ba(bp['attributes']['JOINTS_0']).astype(int);BW=ba(bp['attributes']['WEIGHTS_0']).astype(float)
tn=BJ['meshes'][0]['extras']['targetNames'];BT={n:ba(bp['targets'][i]['POSITION']).astype(float) for i,n in enumerate(tn) if n in('slim','heavy','athletic')}
jn=[BJ['nodes'][j]['name'] for j in BJ['skins'][0]['joints']];NJ=len(jn);armj=np.array([('Arm' in n or 'Hand' in n) for n in jn])
Wd=np.zeros((len(BP),NJ));np.add.at(Wd,(np.repeat(np.arange(len(BP)),4),BJn.ravel()),BW.ravel());baw=Wd[:,armj].sum(1)
body=BVHTree.FromPolygons([Vector(v) for v in BP],[tuple(int(i) for i in f) for f in BF])
# ---- the garment
J,B=glb('/home/claude/out/cl-%s-dec.glb'%key);ga=mk(J,B);p=J['meshes'][0]['primitives'][0]
P=ga(p['attributes']['POSITION']).astype(float);UV=ga(p['attributes']['TEXCOORD_0']).astype(float);F=ga(p['indices']).reshape(-1,3).astype(int)
im=J['images'][J['textures'][J['materials'][p['material']]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']];bv=J['bufferViews'][im['bufferView']]
IMG=Image.open(io.BytesIO(B[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])).convert('RGB');T=np.array(IMG).astype(int);H,W=T.shape[:2]
col=T[np.clip((UV[:,1]*H).astype(int),0,H-1),np.clip((UV[:,0]*W).astype(int),0,W-1)];lum=col.mean(1);sat=(col.max(1)-col.min(1))/np.maximum(col.max(1),1)
y0,y1=P[:,1].min(),P[:,1].max();hh=y1-y0
stump=P[:,1]<y0+0.03*hh;Lm=np.median(lum[stump]);TOL=float(dict(tee=24,tank=60,dress=40,jacket=45,hoodie=45).get(key,40));grey=(np.abs(lum-Lm)<TOL)&(sat<0.06)&((P[:,1]<y0+0.14*hh)|(P[:,1]>y0+0.6*hh))
print('  back mid lum',np.percentile(lum[(P[:,2]<0)&(P[:,1]>y0+0.3*hh)&(P[:,1]<y0+0.6*hh)],[5,50,95]).round(0),'top back lum',np.percentile(lum[(P[:,2]<0)&(P[:,1]>y0+0.6*hh)&(P[:,1]<y0+0.85*hh)],[5,50,95]).round(0))
_,inv=np.unique(np.round(P*1e5).astype(np.int64),axis=0,return_inverse=True);inv=inv.ravel();nw=inv.max()+1;FU=inv[F]
gw=np.zeros(nw,bool);np.logical_or.at(gw,inv,grey);gw2=np.ones(nw,bool);np.logical_and.at(gw2,inv,grey);gw=gw2
yw=np.zeros(nw);yw[inv]=P[:,1];seed=gw&((yw<y0+0.1*hh)|(yw>y0+0.72*hh))
E=np.unique(np.sort(np.r_[FU[:,[0,1]],FU[:,[1,2]],FU[:,[2,0]]],axis=1),axis=0);E=E[gw[E[:,0]]&gw[E[:,1]]]
man=seed.copy()
for it in range(400):
    a=man[E[:,0]]|man[E[:,1]];n0=man.sum();man[E[a,0]]=True;man[E[a,1]]=True
    if man.sum()==n0:break
if key=='tank':   # a black top: every grey point is mannequin (the arm stubs too)
    g3=np.ones(nw,bool);np.logical_and.at(g3,inv,(lum>110)&(sat<0.09));man|=g3
keepF=~(man[FU].any(1)) if key=='tank' else ~(man[FU].all(1));print(key,'mannequin grey lum %.0f'%Lm,'mannequin verts',int(man.sum()),'faces kept',int(keepF.sum()),'of',len(F))
F=F[keepF];FU=FU[keepF]
# drop crumbs
par=np.arange(nw)
def find(a):
    while par[a]!=a:par[a]=par[par[a]];a=par[a]
    return a
for f in FU:
    r=find(f[0]);par[find(f[1])]=r;par[find(f[2])]=r
root=np.array([find(i) for i in range(nw)]);fr=root[FU[:,0]];ids,cn=np.unique(fr,return_counts=True);big=ids[cn>=60];F=F[np.isin(fr,big)]
used=np.unique(F);re=-np.ones(len(P),int);re[used]=np.arange(len(used));P=P[used];UV=UV[used];F=re[F];print('  garment verts',len(P),'tris',len(F))
# ---- size and place it on his torso: central torso points should sit just outside his skin
xc=(P[:,0].max()+P[:,0].min())/2;P[:,0]-=xc;gy0,gy1=P[:,1].min(),P[:,1].max()
core=np.where((np.abs(P[:,0])<0.16)&(P[:,1]>gy0+0.25*(gy1-gy0))&(P[:,1]<gy0+0.8*(gy1-gy0)))[0];rs=np.random.default_rng(1);core=rs.choice(core,min(500,len(core)),replace=False)
def sd(Q):
    out=np.zeros(len(Q))
    for i,q in enumerate(Q):
        loc,n,_,d=body.find_nearest(Vector(q));v=Vector(q)-loc;out[i]=d if v.dot(n)>=0 else -d
    return out
best=(1e9,)
for s in np.arange(0.27,0.42,0.0125):
    for ty in np.arange(0.95,1.32,0.02):
        for tz in (-0.01,0.01,0.03):
            d=sd(P[core]*s+[0,ty,tz]);c=np.where(d<0,6*-d,np.abs(d-0.008)).mean()
            if c<best[0]:best=(c,s,ty,tz)
c,s,ty,tz=best
for s2 in (s-0.006,s,s+0.006):
    for ty2 in (ty-0.01,ty,ty+0.01):
        for tz2 in (tz-0.01,tz,tz+0.01):
            d=sd(P[core]*s2+[0,ty2,tz2]);c2=np.where(d<0,6*-d,np.abs(d-0.008)).mean()
            if c2<best[0]:best=(c2,s2,ty2,tz2)
c,s,ty,tz=best;P=P*s+[0,ty,tz];print('  fit cost %.4f scale %.3f y %.3f z %.3f -> y %.2f..%.2f halfwidth %.2f'%(c,s,ty,tz,P[:,1].min(),P[:,1].max(),np.abs(P[:,0]).max()))
# ---- big flat triangles (the decimator leaves them on a smooth back) cannot follow his body: split long edges
import bmesh
me=bpy.data.meshes.new('g');me.from_pydata([tuple(v) for v in P],[],[tuple(int(i) for i in f) for f in F]);me.update();uvl=me.uv_layers.new(name='u')
for l in me.loops:uvl.data[l.index].uv=UV[l.vertex_index]
bm=bmesh.new();bm.from_mesh(me)
for it in range(3):
    long=[e for e in bm.edges if e.calc_length()>0.022]
    if not long:break
    bmesh.ops.subdivide_edges(bm,edges=long,cuts=1);bmesh.ops.triangulate(bm,faces=bm.faces)
bm.to_mesh(me);bm.free();me.update();uvl=me.uv_layers[0]
P=np.array([v.co[:] for v in me.vertices],float);F=np.array([q.vertices[:] for q in me.polygons],int);UV=np.zeros((len(P),2))
for l in me.loops:UV[l.vertex_index]=uvl.data[l.index].uv[:]
print('  after splitting long edges: verts',len(P),'tris',len(F))
# ---- sleeves: the mannequin had no arms, so each sleeve hangs at its own angle. Lay it along his arm (shoulder, elbow, wrist), keeping its
# length and its shape round the arm; its weights then come from where it lies along the arm, not from whatever skin happens to be nearest
IBM=ba(BJ['skins'][0]['inverseBindMatrices']).astype(float);JPOS={n:np.linalg.inv(IBM[i].reshape(4,4).T)[:3,3] for i,n in enumerate(jn)}
ss=lambda t:np.clip(t,0,1)**2*(3-2*np.clip(t,0,1));SLV={}
def rot_to(a,b):
    v=np.cross(a,b);c=float(a@b);K=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]]);return np.eye(3)+K+K@K/(1+c)
for side,sg in (('Left',1),('Right',-1)):
    far=P[sg*P[:,0]>0.215]
    if len(far)<40:continue
    c0=far.mean(0);ag=np.linalg.svd(far-c0)[2][0];ag=ag if ag[1]<0 else -ag
    Sj,Ej,Hj=[JPOS['mixamorig:'+side+k] for k in ('Arm','ForeArm','Hand')];Sg=c0+ag*((Sj-c0)@ag)
    u=(P-Sg)@ag;rv=(P-Sg)-np.outer(u,ag);rad=np.linalg.norm(rv,axis=1);sel=(u>-0.02)&(rad<0.105)&(sg*P[:,0]>0.13)
    if sel.sum()<40:continue
    Lu=np.linalg.norm(Ej-Sj);Lf=np.linalg.norm(Hj-Ej);d1=(Ej-Sj)/Lu;d2=(Hj-Ej)/Lf;Lg=np.percentile(u[sel],99.5);k=min(1.0,(Lu+Lf-0.015)/Lg);uu=np.clip(u,0,None)*k
    R1=rot_to(ag,d1);R2=rot_to(ag,d2);m1=Sj+np.outer(uu,d1)+rv@R1.T;m2=Ej+np.outer(uu-Lu,d2)+rv@R2.T;f=ss((uu-Lu+0.035)/0.07)[:,None];M=m1*(1-f)+m2*f
    b=(ss(u/0.07)*sel)[:,None];P=P*(1-b)+M*b;SLV[side]=(b[:,0],uu,Lu,f[:,0])
    print('  %s sleeve: %d points, length %.2f on an arm of %.2f%s'%(side,int(sel.sum()),Lg,Lu+Lf,' (shortened to fit)' if k<1 else ''))
# ---- weights and shapes from the body under each point; sleeves are drawn onto the arms; nothing left inside the skin
Wg=np.zeros((len(P),NJ));Dg={n:np.zeros((len(P),3)) for n in BT};Pn=P.copy()
for i,q in enumerate(P):
    loc,n,fi,d=body.find_nearest(Vector(q));tri=BF[fi];w3=1/(np.linalg.norm(BP[tri]-np.array(loc),axis=1)+1e-4);w3/=w3.sum()
    Wg[i]=(Wd[tri]*w3[:,None]).sum(0)
    for nm in BT:Dg[nm][i]=(BT[nm][tri]*w3[:,None]).sum(0)
    aw=float((baw[tri]*w3).sum());v=Vector(q)-loc;sg=1 if v.dot(n)>=0 else -1;dd=sg*d
    want=max(dd,0.006);
    if abs(want-dd)>1e-5:Pn[i]=np.array(loc)+np.array(n)*want
# smooth the correction a little so the surface stays even
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
C=smooth(Pn-P,6);Pf=weld(P)+C
# after smoothing, make sure nothing dipped back inside
for i in range(gn):
    loc,n,_,d=body.find_nearest(Vector(Pf[i]));v=Vector(Pf[i])-loc
    if v.dot(n)<0 or d<0.004:Pf[i]=np.array(loc)+np.array(n)*0.005
P=Pf[ginv]
for side,(b,uu,Lu,f) in SLV.items():      # sleeve weights by position along the arm, easing into the body's own weights at the shoulder
    ia,ie=jn.index('mixamorig:'+side+'Arm'),jn.index('mixamorig:'+side+'ForeArm');Wa=np.zeros_like(Wg);Wa[:,ia]=1-f;Wa[:,ie]=f;bb=(b*ss((uu-0.02)/0.1))[:,None];Wg=Wg*(1-bb)+Wa*bb
Wg=smooth(Wg,4)[ginv]
for nm in Dg:Dg[nm]=smooth(Dg[nm],8)[ginv]
top4=np.argsort(-Wg,axis=1)[:,:4];w4=np.take_along_axis(Wg,top4,1);w4/=w4.sum(1,keepdims=True)
fn=np.cross(P[F[:,1]]-P[F[:,0]],P[F[:,2]]-P[F[:,0]]);N=np.zeros((gn,3))
for k in range(3):np.add.at(N,GF[:,k],fn)
N=(N/np.linalg.norm(N,axis=1,keepdims=True).clip(1e-12))[ginv]
# ---- body skin hidden under the garment (a ray out of the skin meets cloth within 5 cm), shrunk back from the garment's edges
cloth=BVHTree.FromPolygons([Vector(v) for v in P],[tuple(int(i) for i in f) for f in F])
_,binv=np.unique(np.round(BP*1e5).astype(np.int64),axis=0,return_inverse=True);binv=binv.ravel();bnw=binv.max()+1;BU=np.zeros((bnw,3));BU[binv]=BP;BFU=binv[BF]
bfn=np.cross(BU[BFU[:,1]]-BU[BFU[:,0]],BU[BFU[:,2]]-BU[BFU[:,0]]);bN=np.zeros((bnw,3))
for k in range(3):np.add.at(bN,BFU[:,k],bfn)
bN/=np.linalg.norm(bN,axis=1,keepdims=True).clip(1e-12);cov=np.zeros(bnw,bool);ylo,yhi=P[:,1].min(),P[:,1].max()
for i in range(bnw):
    if BU[i,1]<ylo or BU[i,1]>yhi:continue
    loc,n,_,d=cloth.ray_cast(Vector(BU[i])+Vector(bN[i])*0.0005,Vector(bN[i]),0.05)
    if loc is not None:cov[i]=True
BE=np.unique(np.sort(np.r_[BFU[:,[0,1]],BFU[:,[1,2]],BFU[:,[2,0]]],axis=1),axis=0)
for it in range(3):
    bad=np.zeros(bnw,bool);u=~cov;bad[BE[u[BE[:,1]],0]]=True;bad[BE[u[BE[:,0]],1]]=True;cov&=~bad
cover=np.where(cov[binv])[0];print('  body verts hidden',len(cover),'of',len(BP))
# ---- write
BIN=bytearray();views=[];accs=[]
def add(arr,comp,typ,mm=False):
    while len(BIN)%4:BIN.append(0)
    views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':arr.nbytes});BIN.extend(arr.tobytes());a={'bufferView':len(views)-1,'componentType':comp,'type':typ,'count':int(arr.shape[0])}
    if mm:a['min']=[float(x) for x in arr.min(0)];a['max']=[float(x) for x in arr.max(0)]
    accs.append(a);return len(accs)-1
names=list(Dg.keys())
pr={'attributes':{'POSITION':add(P.astype(np.float32),5126,'VEC3',True),'NORMAL':add(N.astype(np.float32),5126,'VEC3'),'TEXCOORD_0':add(UV.astype(np.float32),5126,'VEC2'),'JOINTS_0':add(top4.astype(np.uint16),5123,'VEC4'),'WEIGHTS_0':add(w4.astype(np.float32),5126,'VEC4')},
    'indices':add(F.astype(np.uint32).reshape(-1),5125,'SCALAR'),'material':1,'targets':[{'POSITION':add(Dg[n].astype(np.float32),5126,'VEC3',True)} for n in names]}
cv=add(cover.astype(np.uint32),5125,'SCALAR')
buf=io.BytesIO();IMG.resize((1024,1024),Image.LANCZOS).save(buf,'JPEG',quality=84);ib=buf.getvalue()
while len(BIN)%4:BIN.append(0)
views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':len(ib)});BIN.extend(ib)
while len(BIN)%4:BIN.append(0)
GJ={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':key,'mesh':0}],'meshes':[{'primitives':[pr],'extras':{'targetNames':names,'cover':cv,'bodyVerts':len(BP)}}],
    'materials':[{'name':'hair'},{'name':'cloth','doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':0}}}],'textures':[{'source':0}],'images':[{'bufferView':len(views)-1,'mimeType':'image/jpeg'}],'bufferViews':views,'accessors':accs,'buffers':[{'byteLength':len(BIN)}]}
js=json.dumps(GJ,separators=(',',':')).encode()
while len(js)%4:js+=b' '
out='/home/claude/out/clothfinal/%s.glb'%key
open(out,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(BIN))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(BIN),0x004E4942)+bytes(BIN));print('  wrote',out,'%.2f MB'%(len(BIN)/1e6))
