"""Skirt (prototype): a skirt is NOT a shell. It hangs from the waist as one open tube round both legs, so the legs show below it
and move freely inside it.   python3 skirt_wear.py bottom_f_skirt f [outdir]
- Shape: on a grid of height x angle round the hips, the radius is the larger of the body (plus clearance) and the fitted scan,
  and below the widest point of the hips it never narrows again (an A-line: it cannot wrap between the legs).
- Length: HEM (m above the floor). Default ends above the knee so the legs show (the scan itself is floor length).
- Shape definition: a raised waistband, knife pleats that open toward the hem, a thick turned-up hem.
- Weights: the hips at the waist; lower down a share of each thigh by which side the cloth is on, so it swings with the walk.
- Build shapes: the same construction on each morphed body.
- Skin hidden: only the seat and hips inside the skirt. Legs are never hidden."""
import sys,os,io,json,struct,numpy as np
from scipy.spatial import cKDTree
from PIL import Image
R=os.path.dirname(os.path.abspath(__file__))+'/../out'
name,body_id=sys.argv[1],sys.argv[2];OUT=sys.argv[3] if len(sys.argv)>3 else R+'/shell'
ENV=lambda k,d:type(d)(os.environ.get(k,d))
CT={5126:np.float32,5125:np.uint32,5123:np.uint16,5121:np.uint8};NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def glb(f):
    d=open(f,'rb').read();L=struct.unpack('<I',d[12:16])[0];return json.loads(d[20:20+L]),d[20+L+8:]
def mk(J,B):
    def acc(i):
        a=J['accessors'][i];bv=J['bufferViews'][a['bufferView']];return np.frombuffer(B,CT[a['componentType']],a['count']*NC[a['type']],bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
    return acc
BJ,BB=glb(R+'/'+{'m':'male-body-final.glb','f':'base-plus-build.glb'}[body_id]);ba=mk(BJ,BB);bp=BJ['meshes'][0]['primitives'][0]
BP=ba(bp['attributes']['POSITION']).astype(float);BJn=ba(bp['attributes']['JOINTS_0']).astype(int);BW=ba(bp['attributes']['WEIGHTS_0']).astype(float)
tnames=BJ['meshes'][0]['extras']['targetNames'];BT={n:ba(bp['targets'][i]['POSITION']).astype(float) for i,n in enumerate(tnames)}
jn=[BJ['nodes'][j]['name'] for j in BJ['skins'][0]['joints']];NJ=len(jn);ji=lambda n:jn.index('mixamorig:'+n)
Wd=np.zeros((len(BP),NJ));np.add.at(Wd,(np.repeat(np.arange(len(BP)),4),BJn.ravel()),BW.ravel())
IBM=ba(BJ['skins'][0]['inverseBindMatrices']).astype(float);JPOS={n_:np.linalg.inv(IBM[i].reshape(4,4).T)[:3,3] for i,n_ in enumerate(jn)}
J,B=glb(R+'/wear/%s.glb'%name);ga=mk(J,B);pr=J['meshes'][0]['primitives'][0];ex=J['meshes'][0]['extras']
P=ga(pr['attributes']['POSITION']).astype(float);UV=ga(pr['attributes']['TEXCOORD_0']).astype(float)
iv=J['bufferViews'][J['images'][0]['bufferView']];TEX=np.array(Image.open(io.BytesIO(B[iv.get('byteOffset',0):iv.get('byteOffset',0)+iv['byteLength']])).convert('RGB')).astype(float);TH,TW=TEX.shape[:2]
MID={'f':0.0175,'m':0.0}[body_id]
hips=JPOS['mixamorig:Hips'];knee=JPOS['mixamorig:LeftLeg'];CZ=hips[2]
legw=Wd[:,[i for i,n_ in enumerate(jn) if 'UpLeg' in n_ or n_.endswith('Leg')]].sum(1)
trunk=Wd[:,[i for i,n_ in enumerate(jn) if any(k in n_ for k in ('Hips','Spine','UpLeg','Leg'))]].sum(1)>0.5   # (no hands or arms in the hull)
# ---- heights: waist from the scan's top, hem above the knee
YT=float(np.percentile(P[:,1],99.7))-0.005
YH=ENV('HEM',float(knee[1]+0.07));NY=ENV('NY',46);NT=ENV('NT',192)
ys=np.linspace(YT,YH,NY);th=np.linspace(0,2*np.pi,NT,endpoint=False)
dirs=np.c_[np.sin(th),np.zeros(NT),np.cos(th)]   # theta 0 = front (+z), 90 deg = her left (+x)
def hull(Bx):   # body radius per (height, angle): the furthest skin in each sector round the axis
    rel=Bx-[MID,0,CZ];ang=np.arctan2(rel[:,0],rel[:,2])%(2*np.pi);rad=np.hypot(rel[:,0],rel[:,2])
    rb=np.zeros((NY,NT));bi=(ang/(2*np.pi)*NT).astype(int)%NT
    for i,y in enumerate(ys):
        m=trunk&(np.abs(Bx[:,1]-y)<0.02)
        if not m.any():continue
        np.maximum.at(rb[i],bi[m],rad[m])
        for _ in range(2):rb[i]=np.maximum(rb[i],np.maximum(np.roll(rb[i],1),np.roll(rb[i],-1))*0.985)   # fill empty sectors
    return rb
def scanr():
    rel=P-[MID,0,CZ];ang=np.arctan2(rel[:,0],rel[:,2])%(2*np.pi);rad=np.hypot(rel[:,0],rel[:,2]);bi=(ang/(2*np.pi)*NT).astype(int)%NT
    rs=np.zeros((NY,NT))
    for i,y in enumerate(ys):
        m=np.abs(P[:,1]-y)<0.012
        if m.any():np.maximum.at(rs[i],bi[m],rad[m])
    for i in range(NY):
        if (rs[i]==0).any() and (rs[i]>0).any():rs[i][rs[i]==0]=np.median(rs[i][rs[i]>0])
    return rs
def smooth_t(r,it=6):
    for _ in range(it):r=0.5*r+0.25*(np.roll(r,1,1)+np.roll(r,-1,1))
    return r
CL=ENV('CLEAR',0.012)
def shape(rb,rs):
    r=np.maximum(rs,rb+CL);r=smooth_t(r,8)
    iw=int(np.argmax(r.mean(1)[:NY//2+1]))   # widest at the hips: below it the skirt never narrows (A-line, never between the legs)
    for i in range(iw+1,NY):r[i]=np.maximum(r[i],r[i-1]+ENV('FLARE',0.0012))
    r[:iw+1]=np.minimum(r[:iw+1],rb[:iw+1]+ENV('YOKE',0.007))   # waist to hips: a snug yoke, so a top worn over it covers it
    return r
RB=hull(BP);RS=scanr();RS=np.minimum(RS,RB+ENV('MAXLOOSE',0.06))   # (the scan's floor-length hem flares far wider than a short skirt should)
r0=shape(RB,RS)
# ---- pleats (knife pleats, opening toward the hem) and the waistband
NPL=ENV('PLEATS',24);t=th*NPL/(2*np.pi);saw=(t%1.0);pl=np.where(saw<0.85,saw/0.85,(1-saw)/0.15)   # long face, short return
fy=np.clip((YT-0.07-ys)/max(0.05,YT-0.07-YH),0,1)**0.8
def pleat(r):
    return r+ENV('PLEATA',0.011)*fy[:,None]*(pl[None,:]-0.5)
WB=ENV('WB',0.035)
def band(r):
    return r+np.where((YT-ys)<WB,0.003,0.0)[:,None]-np.where(np.abs((YT-ys)-WB)<0.003,0.0012,0)[:,None]
def surf(r):return np.c_[MID+(r[:,:,None]*dirs[None,:,0:1]).reshape(-1,1)[:,0],np.repeat(ys,NT),CZ+(r*np.cos(th)[None,:]).ravel()]
R0=band(pleat(r0));X=surf(R0)
# thick turned-up hem: an inner row 12 mm up and 4 mm in, joined at the hem
Rin=R0[-1]-0.004;Xin=np.c_[MID+Rin*np.sin(th),np.full(NT,YH+0.012),CZ+Rin*np.cos(th)]
V=np.r_[X,Xin];nv=len(V)
F=[]
idx=lambda i,j:i*NT+(j%NT)
for i in range(NY-1):
    for j in range(NT):F+=[[idx(i,j),idx(i+1,j),idx(i+1,j+1)],[idx(i,j),idx(i+1,j+1),idx(i,j+1)]]
for j in range(NT):a,b=idx(NY-1,j),idx(NY-1,j+1);c,d=NY*NT+j,NY*NT+(j+1)%NT;F+=[[a,c,d],[a,d,b]]
F=np.array(F,int)
# ---- weights: hips at the waist, then a share of each thigh by side (front and back centre: half each)
Wsk=np.zeros((nv,NJ));yy=V[:,1];ang=np.arctan2(V[:,0]-MID,V[:,2]-CZ)
a=np.clip((YT-0.05-yy)/max(0.05,YT-0.05-YH),0,1)*ENV('SWING',0.65)
left=np.clip(0.5+0.75*np.sin(ang),0,1)
Wsk[:,ji('Hips')]=1-a;Wsk[:,ji('LeftUpLeg')]=a*left;Wsk[:,ji('RightUpLeg')]=a*(1-left)
top4=np.argsort(-Wsk,axis=1)[:,:4];w4=np.take_along_axis(Wsk,top4,1);w4/=w4.sum(1,keepdims=True)
# ---- build shapes: the same skirt on each morphed body (the scan's looseness carried over)
TG={}
for nm,dt in BT.items():
    rbt=hull(BP+dt);rt=shape(rbt,RS+(rbt-RB));Rt=band(pleat(rt));Xt=surf(Rt);Rit=Rt[-1]-0.004
    Xit=np.c_[MID+Rit*np.sin(th),np.full(NT,YH+0.012),CZ+Rit*np.cos(th)];TG[nm]=np.r_[Xt,Xit]-V
# ---- colour: the scan's main colour (pleats and folds give the shading); a print would need the decal path
S=P;tr=cKDTree(S);_,ii=tr.query(V);col=TEX[np.clip((UV[ii,1]*TH).astype(int),0,TH-1),np.clip((UV[ii,0]*TW).astype(int),0,TW-1)]
main=np.median(col,0) if ENV('USCAN',1) else np.array(ex['under'],float)
TEXI=np.zeros((8,8,3),np.uint8);TEXI[:]=main.clip(0,255).astype(np.uint8);VUV=np.full((nv,2),0.5)
def vnorm(X,Fc):
    fn=np.cross(X[Fc[:,1]]-X[Fc[:,0]],X[Fc[:,2]]-X[Fc[:,0]]);N=np.zeros_like(X)
    for k in range(3):np.add.at(N,Fc[:,k],fn)
    return N/np.linalg.norm(N,axis=1,keepdims=True).clip(1e-12)
VN=vnorm(V,F)
# ---- skin hidden: the seat and hips inside the skirt down to the crotch; the legs stay drawn
rel=BP-[MID,0,CZ];ang_b=np.arctan2(rel[:,0],rel[:,2])%(2*np.pi);rad_b=np.hypot(rel[:,0],rel[:,2]);bi=(ang_b/(2*np.pi)*NT).astype(int)%NT
ycr=BP[(legw>0.3)&(np.abs(BP[:,0]-MID)<0.02),1].max()
iy=np.clip(np.round((YT-BP[:,1])/(YT-YH)*(NY-1)).astype(int),0,NY-1)
hid=np.where(trunk&(BP[:,1]<YT-0.01)&(BP[:,1]>ycr+0.01)&(rad_b<R0[iy,bi]-0.002))[0]
print(name,'waist %.3f hem %.3f (knee %.3f) crotch %.3f, verts %d tris %d, skin hidden %d, colour %s'%(YT,YH,knee[1],ycr,nv,len(F),len(hid),tuple(int(x) for x in main)))
# ---- write
BIN=bytearray();views=[];accs=[]
def add(arr,comp,typ,mm=False):
    while len(BIN)%4:BIN.append(0)
    views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':arr.nbytes});BIN.extend(arr.tobytes());a={'bufferView':len(views)-1,'componentType':comp,'type':typ,'count':int(arr.shape[0])}
    if mm:a['min']=[float(x) for x in arr.min(0)];a['max']=[float(x) for x in arr.max(0)]
    accs.append(a);return len(accs)-1
names=list(BT.keys())
pr2={'attributes':{'POSITION':add(V.astype(np.float32),5126,'VEC3',True),'NORMAL':add(VN.astype(np.float32),5126,'VEC3'),'TEXCOORD_0':add(VUV.astype(np.float32),5126,'VEC2'),'JOINTS_0':add(top4.astype(np.uint16),5123,'VEC4'),'WEIGHTS_0':add(w4.astype(np.float32),5126,'VEC4')},
     'indices':add(F.astype(np.uint32).reshape(-1),5125,'SCALAR'),'material':1,'targets':[{'POSITION':add(TG[k].astype(np.float32),5126,'VEC3',True)} for k in names]}
cv=add(hid.astype(np.uint32),5125,'SCALAR')
buf=io.BytesIO();Image.fromarray(TEXI).save(buf,'PNG');IMG=buf.getvalue()
while len(BIN)%4:BIN.append(0)
views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':len(IMG)});BIN.extend(IMG)
while len(BIN)%4:BIN.append(0)
ex2={'targetNames':names,'bodyVerts':len(BP),'cover':cv,'shell':True,'skirt':True,'under':[int(x) for x in main]}
GJ={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':name,'mesh':0}],'meshes':[{'primitives':[pr2],'extras':ex2}],
    'materials':[{'name':'hair'},{'name':'cloth','doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':0}}}],'textures':[{'source':0}],'images':[{'bufferView':len(views)-1,'mimeType':'image/png'}],'bufferViews':views,'accessors':accs,'buffers':[{'byteLength':len(BIN)}]}
js=json.dumps(GJ,separators=(',',':')).encode()
while len(js)%4:js+=b' '
os.makedirs(OUT,exist_ok=True);out=OUT+'/%s.glb'%name
open(out,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(BIN))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(BIN),0x004E4942)+bytes(BIN));print('  wrote',out,'%.2f MB'%(len(BIN)/1e6))
