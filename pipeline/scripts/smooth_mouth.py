"""Smooth the sculpted lips away so the drawn mouth is the only mouth: the skin around the mouth is relaxed (Laplacian) inside an oval,
fading out at its edge; normals are rebuilt there.  smooth_mouth.py in.glb out.glb cx cy rx ry [iterations]"""
import json,struct,sys,numpy as np
src,dst=sys.argv[1],sys.argv[2];cx,cy,rx,ry=[float(v) for v in sys.argv[3:7]];IT=int(sys.argv[7]) if len(sys.argv)>7 else 80
d=open(src,'rb').read();L=struct.unpack('<I',d[12:16])[0];o=20+L;J=json.loads(d[20:o]);B=bytearray(d[o+8:o+8+struct.unpack('<I',d[o:o+4])[0]])
p=J['meshes'][0]['primitives'][0]
def view(i,n,dt=np.float32):
    a=J['accessors'][i];bv=J['bufferViews'][a['bufferView']];off=bv.get('byteOffset',0)+a.get('byteOffset',0);return a,off,np.frombuffer(bytes(B[off:off+a['count']*n*np.dtype(dt).itemsize]),dt).reshape(-1,n)
aP,oP,P=view(p['attributes']['POSITION'],3);P=P.astype(float);ia=J['accessors'][p['indices']];F=view(p['indices'],1,np.uint32 if ia['componentType']==5125 else np.uint16)[2].reshape(-1,3).astype(int)
_,inv=np.unique(np.round(P*1e5).astype(np.int64),axis=0,return_inverse=True);inv=inv.ravel()
# the lips are a seam of almost-touching edges (a crack once the skin moves): weld points within 1 mm of each other round the mouth
from scipy.spatial import cKDTree
sel=np.where((np.abs(P[:,0]-cx)<rx*1.5)&(np.abs(P[:,1]-cy)<ry*1.8)&(P[:,2]>0.06))[0];par_=np.arange(inv.max()+1)
def find_(a):
    while par_[a]!=a:par_[a]=par_[par_[a]];a=par_[a]
    return a
for a_,b_ in cKDTree(P[sel]).query_pairs(0.001):
    ra,rb=find_(inv[sel[a_]]),find_(inv[sel[b_]])
    if ra!=rb:par_[ra]=rb
inv=np.unique(np.array([find_(i) for i in inv]),return_inverse=True)[1].ravel()
nw=inv.max()+1;FU=inv[F];cnt_=np.zeros(nw);np.add.at(cnt_,inv,1);U=np.zeros((nw,3));np.add.at(U,inv,P);U/=cnt_[:,None]
r=np.hypot((U[:,0]-cx)/rx,(U[:,1]-cy)/ry);ss=lambda t:np.clip(t,0,1)**2*(3-2*np.clip(t,0,1));w=ss((1-r)/0.35)*(U[:,2]>0.06)
E=np.unique(np.sort(np.r_[FU[:,[0,1]],FU[:,[1,2]],FU[:,[2,0]]],axis=1),axis=0);E=E[E[:,0]!=E[:,1]];deg=np.zeros(nw);np.add.at(deg,E[:,0],1);np.add.at(deg,E[:,1],1);deg=np.maximum(deg,1)
def vnorm(Q):
    fn=np.cross(Q[FU[:,1]]-Q[FU[:,0]],Q[FU[:,2]]-Q[FU[:,0]]);vn=np.zeros_like(Q)
    for k in range(3):np.add.at(vn,FU[:,k],fn)
    return vn/np.linalg.norm(vn,axis=1,keepdims=True).clip(1e-12)
U0=U.copy();n0=vnorm(U)
for it in range(IT):
    nb=np.zeros((nw,3));np.add.at(nb,E[:,0],U[E[:,1]]);np.add.at(nb,E[:,1],U[E[:,0]]);nb/=deg[:,None];U+=(nb-U)*np.minimum(1.0,1.3*w)[:,None]
# loose pieces behind the lips (a mouth bag, teeth) would now poke through the flattened skin: push them back inside the head
par=np.arange(nw)
def find(a):
    while par[a]!=a:par[a]=par[par[a]];a=par[a]
    return a
for a_,b_ in E:
    ra,rb=find(a_),find(b_)
    if ra!=rb:par[ra]=rb
root=np.array([find(i) for i in range(nw)]);ids,cn=np.unique(root,return_counts=True);main=ids[np.argmax(cn)]
loose=(root!=main)&(r<1.5)&(U[:,2]>0.06);U[loose,2]-=0.035;print('loose verts pushed back',int(loose.sum()),'in',len(np.unique(root[loose])),'pieces')
moved=np.linalg.norm(U-U0,axis=1);print('mouth verts',int((w>0).sum()),'max move %.4f mean %.4f'%(moved.max(),moved[w>0].mean()))
touch=(w[inv]>0)|loose[inv]|(cnt_[inv]>1)&np.isin(np.arange(len(P)),sel);Pn=np.where(touch[:,None],U[inv],P);B[oP:oP+Pn.size*4]=Pn.astype(np.float32).tobytes();aP['min']=[float(v) for v in Pn.min(0)];aP['max']=[float(v) for v in Pn.max(0)]
if 'NORMAL' in p['attributes']:
    aN,oN,N=view(p['attributes']['NORMAL'],3);N=N.astype(float).copy();n1=vnorm(U)[inv];m=(w[inv]>0)|loose[inv];N[m]=n1[m];B[oN:oN+N.size*4]=N.astype(np.float32).tobytes()
js=json.dumps(J,separators=(',',':')).encode()
while len(js)%4:js+=b' '
open(dst,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(B))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(B),0x004E4942)+bytes(B))
