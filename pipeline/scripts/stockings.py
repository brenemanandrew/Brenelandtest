"""Stockings / tights built from her own legs: a thin shell OFF metres out from the skin, waist (WAIST) to toes.
python3 stockings.py SLOT_KEY [outdir]      e.g.  COL=92,40,72 python3 stockings.py legs_f_tights_plum
- The body's own triangles, skin weights and build shapes, so it fits each of the 4 builds exactly and bends with every pose.
- Normals are taken on the welded body (no cracks at UV seams). The waist edge is cut along a clean line.
- Same file layout as fit_clean.py output: base build (plus) + the other builds as shapes, extras.cover = the legs it hides."""
import sys,os,io,json,struct,numpy as np
from PIL import Image
R=os.path.dirname(os.path.abspath(__file__))+'/../out'
name=sys.argv[1];OUT=sys.argv[2] if len(sys.argv)>2 else R+'/clean'
ENV=lambda k,d:type(d)(os.environ.get(k,d))
CT={5126:np.float32,5125:np.uint32,5123:np.uint16,5121:np.uint8};NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def glb(f):
    d=open(f,'rb').read();L=struct.unpack('<I',d[12:16])[0];return json.loads(d[20:20+L]),d[20+L+8:]
BJ,BB=glb(R+'/base-plus-build.glb')
def acc(i):
    a=BJ['accessors'][i];bv=BJ['bufferViews'][a['bufferView']];return np.frombuffer(BB,CT[a['componentType']],a['count']*NC[a['type']],bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
bp=BJ['meshes'][0]['primitives'][0]
BP=acc(bp['attributes']['POSITION']).astype(float);BF=acc(bp['indices']).reshape(-1,3).astype(int)
BJn=acc(bp['attributes']['JOINTS_0']).astype(int);BW=acc(bp['attributes']['WEIGHTS_0']).astype(float)
tn=BJ['meshes'][0]['extras']['targetNames'];BT={n:acc(bp['targets'][i]['POSITION']).astype(float) for i,n in enumerate(tn)}
jn=[BJ['nodes'][j]['name'] for j in BJ['skins'][0]['joints']];NJ=len(jn)
Wd=np.zeros((len(BP),NJ));np.add.at(Wd,(np.repeat(np.arange(len(BP)),4),BJn.ravel()),BW.ravel())
jw=lambda keys:Wd[:,[i for i,n in enumerate(jn) if any(k in n for k in keys)]].sum(1)
BUILDS=['plus','average','slim','athletic']
body_of=lambda b:BP+(BT[b] if b in BT else 0)
_,binv=np.unique(np.round(BP*1e5).astype(np.int64),axis=0,return_inverse=True);binv=binv.ravel();nw=binv.max()+1
def wnorm(X):   # normals on the welded surface, spread back to every copy of a seam point
    FW=binv[BF];XW=np.zeros((nw,3));XW[binv]=X;fn=np.cross(XW[FW[:,1]]-XW[FW[:,0]],XW[FW[:,2]]-XW[FW[:,0]]);N=np.zeros((nw,3))
    for k in range(3):np.add.at(N,FW[:,k],fn)
    N/=np.linalg.norm(N,axis=1,keepdims=True).clip(1e-12);return N[binv]
OFF=ENV('OFF',0.0025);WAIST=ENV('WAIST',0.98)
# area: below the waist line, not the hands or arms hanging beside the hips
sel=(jw(('Arm','Hand'))<0.05)
fA=WAIST-BP[:,1]   # >0 inside; cut along it for a clean waist edge
F=BF[sel[BF].all(1)];pos=fA[F]>0;n=pos.sum(1)
keep=F[n==3];mx=F[(n==1)|(n==2)];nm=n[(n==1)|(n==2)]
# cut the triangles crossing the waist line: new points on the crossing edges, interpolated in everything
lone=np.where(nm==1,np.argmax(fA[mx]>0,1),np.argmin(fA[mx]>0,1));r=np.arange(len(mx));A_=mx[r,lone];B_=mx[r,(lone+1)%3];C_=mx[r,(lone+2)%3]
E=np.sort(np.r_[np.c_[A_,B_],np.c_[A_,C_]],1);ue,inv=np.unique(E,axis=0,return_inverse=True);inv=inv.ravel();i_,j_=ue[:,0],ue[:,1]
t=np.clip(fA[i_]/(fA[i_]-fA[j_]),1e-3,1-1e-3)[:,None];nb=len(BP);nid=nb+np.arange(len(ue));p=nid[inv[:len(mx)]];q=nid[inv[len(mx):]]
inside=np.where(nm==1,True,False)   # lone point inside: keep its corner triangle; lone outside: keep the quad
NF=np.r_[keep,np.c_[A_,p,q][inside],np.c_[p,B_,C_][~inside],np.c_[p,C_,q][~inside]]
lerp=lambda X:np.r_[X,X[i_]+(X[j_]-X[i_])*t]
fits={}
for b in BUILDS:
    X=body_of(b);N=wnorm(X);fits[b]=lerp(X+N*OFF)
Wn=lerp(Wd);used=np.unique(NF);remap=-np.ones(len(Wn),int);remap[used]=np.arange(len(used));NF=remap[NF]
P0=fits['plus'][used];TG={b:(fits[b][used]-P0) for b in BUILDS[1:]};Wn=Wn[used]
top4=np.argsort(-Wn,axis=1)[:,:4];w4=np.take_along_axis(Wn,top4,1);w4/=w4.sum(1,keepdims=True)
def vn(X,Fc):
    fn=np.cross(X[Fc[:,1]]-X[Fc[:,0]],X[Fc[:,2]]-X[Fc[:,0]]);N=np.zeros_like(X)
    for k in range(3):np.add.at(N,Fc[:,k],fn)
    return N/np.linalg.norm(N,axis=1,keepdims=True).clip(1e-12)
VN=vn(P0,NF)
cover=np.where(sel&(fA>0.01))[0]   # skin under it (a little short of the edge so no skin line shows at the waist)
COL=[int(x) for x in os.environ.get('COL','92,40,72').split(',')]
print(name,'%d verts %d tris, hides %d skin points, colour %s'%(len(P0),len(NF),len(cover),COL))
BIN=bytearray();views=[];accs=[]
def add(arr,comp,typ,mm=False):
    while len(BIN)%4:BIN.append(0)
    views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':arr.nbytes});BIN.extend(arr.tobytes());a={'bufferView':len(views)-1,'componentType':comp,'type':typ,'count':int(arr.shape[0])}
    if mm:a['min']=[float(x) for x in arr.min(0)];a['max']=[float(x) for x in arr.max(0)]
    accs.append(a);return len(accs)-1
names=BUILDS[1:]
pr={'attributes':{'POSITION':add(P0.astype(np.float32),5126,'VEC3',True),'NORMAL':add(VN.astype(np.float32),5126,'VEC3'),'TEXCOORD_0':add(np.full((len(P0),2),0.5,np.float32),5126,'VEC2'),'JOINTS_0':add(top4.astype(np.uint16),5123,'VEC4'),'WEIGHTS_0':add(w4.astype(np.float32),5126,'VEC4')},
    'indices':add(NF.astype(np.uint32).reshape(-1),5125,'SCALAR'),'material':1,'targets':[{'POSITION':add(TG[b].astype(np.float32),5126,'VEC3',True)} for b in names]}
cv=add(cover.astype(np.uint32),5125,'SCALAR')
buf=io.BytesIO();Image.fromarray(np.full((16,16,3),COL,np.uint8)).save(buf,'PNG');IMG=buf.getvalue()
while len(BIN)%4:BIN.append(0)
views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':len(IMG)});BIN.extend(IMG)
while len(BIN)%4:BIN.append(0)
ex={'targetNames':names,'bodyVerts':len(BP),'cover':cv,'clean':True,'under':COL}
GJ={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':name,'mesh':0}],'meshes':[{'primitives':[pr],'extras':ex}],
    'materials':[{'name':'hair'},{'name':'cloth','doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':0}}}],'textures':[{'source':0}],'images':[{'bufferView':len(views)-1,'mimeType':'image/png'}],'bufferViews':views,'accessors':accs,'buffers':[{'byteLength':len(BIN)}]}
js=json.dumps(GJ,separators=(',',':')).encode()
while len(js)%4:js+=b' '
os.makedirs(OUT,exist_ok=True);out=OUT+'/%s.glb'%name
open(out,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(BIN))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(BIN),0x004E4942)+bytes(BIN));print('  wrote',out,'%.2f MB'%(len(BIN)/1e6))
