"""His heavy and athletic shapes came from T-pose bodies turned down to the A-pose, which left the shoulder line sloping and the neck as thin
as the base's. Lift the shoulder caps and thicken the neck in those shapes.  male_morph_fix.py in.glb out.glb"""
import json,struct,sys,numpy as np
src,dst=sys.argv[1],sys.argv[2]
d=open(src,'rb').read();L=struct.unpack('<I',d[12:16])[0];o=20+L;J=json.loads(d[20:o]);B=bytearray(d[o+8:o+8+struct.unpack('<I',d[o:o+4])[0]])
me=J['meshes'][0];p=me['primitives'][0];names=me['extras']['targetNames']
def view(i):
    a=J['accessors'][i];bv=J['bufferViews'][a['bufferView']];off=bv.get('byteOffset',0)+a.get('byteOffset',0);return a,off,np.frombuffer(bytes(B[off:off+a['count']*12]),np.float32).reshape(-1,3).astype(float)
_,_,P=view(p['attributes']['POSITION']);x,y,z=P[:,0],P[:,1],P[:,2];ax=np.abs(x)
bump=lambda v,c,w:np.exp(-((v-c)/w)**2);ss=lambda t:np.clip(t,0,1)**2*(3-2*np.clip(t,0,1))
cap=bump(ax,0.19,0.075)*bump(y,1.275,0.07)                      # the shoulder caps and the slope up to the neck
neck=ss((y-1.30)/0.04)*ss((1.44-y)/0.03)*(ax<0.11)*(z<0.13)     # the neck column, fading out under the jaw
# the shapes were mapped across part by part, which left the surface torn and lumpy: smooth each shape's movement over the skin
ia=J['accessors'][p['indices']];ibv=J['bufferViews'][ia['bufferView']];ioff=ibv.get('byteOffset',0)+ia.get('byteOffset',0)
F=np.frombuffer(bytes(B[ioff:ioff+ia['count']*(4 if ia['componentType']==5125 else 2)]),np.uint32 if ia['componentType']==5125 else np.uint16).reshape(-1,3).astype(int)
_,inv=np.unique(np.round(P*1e5).astype(np.int64),axis=0,return_inverse=True);inv=inv.ravel();nw=inv.max()+1;FU=inv[F]
E=np.unique(np.sort(np.r_[FU[:,[0,1]],FU[:,[1,2]],FU[:,[2,0]]],axis=1),axis=0);deg=np.zeros(nw);np.add.at(deg,E[:,0],1);np.add.at(deg,E[:,1],1);deg=np.maximum(deg,1)
cnt=np.zeros(nw);np.add.at(cnt,inv,1);U=np.zeros((nw,3));np.add.at(U,inv,P);U/=cnt[:,None]
def vnorm(Q):
    fn=np.cross(Q[FU[:,1]]-Q[FU[:,0]],Q[FU[:,2]]-Q[FU[:,0]]);vn=np.zeros_like(Q)
    for k in range(3):np.add.at(vn,FU[:,k],fn)
    return vn/np.linalg.norm(vn,axis=1,keepdims=True).clip(1e-12)
n0=vnorm(U)
from scipy.spatial import cKDTree
KD=cKDTree(U)
for nm,lift,thick in (('heavy',0.03,0.2),('athletic',0.034,0.16),('slim',0.0,-0.04)):
    if nm not in names:continue
    t=p['targets'][names.index(nm)];a,off,D=view(t['POSITION'])
    D[:,1]+=lift*cap;D[:,0]+=x*thick*neck;D[:,2]+=(z-0.0)*thick*0.8*neck
    Dw=np.zeros((nw,3));np.add.at(Dw,inv,D);Dw/=cnt[:,None];rough=np.abs(Dw).mean()
    for it in range(8):   # a vertex that moved very differently from its neighbours was mapped to the wrong place: give it their movement
        nb=np.zeros((nw,3));np.add.at(nb,E[:,0],Dw[E[:,1]]);np.add.at(nb,E[:,1],Dw[E[:,0]]);nb/=deg[:,None];bad=np.linalg.norm(Dw-nb,axis=1)>0.008;Dw[bad]=nb[bad]
    for it in range(int(sys.argv[3]) if len(sys.argv)>3 else 30):
        nb=np.zeros((nw,3));np.add.at(nb,E[:,0],Dw[E[:,1]]);np.add.at(nb,E[:,1],Dw[E[:,0]]);Dw=0.5*Dw+0.5*nb/deg[:,None]
    for it in range(3):   # loose pieces of the mesh (seams, hems, inner strips) are not joined to the skin: move every point with the points around it in space
        dd,ii=KD.query(U,k=14,distance_upper_bound=0.022);ok=np.isfinite(dd);ii=np.where(ok,ii,0);wgt=np.where(ok,np.exp(-(np.where(ok,dd,0)/0.012)**2),0);Dw=(Dw[ii]*wgt[:,:,None]).sum(1)/wgt.sum(1)[:,None]
    D=Dw[inv]
    B[off:off+D.size*4]=D.astype(np.float32).tobytes();a['min']=[float(v) for v in D.min(0)];a['max']=[float(v) for v in D.max(0)]
    if 'NORMAL' in t:
        an,offn,_=view(t['NORMAL']);ND=(vnorm(U+Dw)-n0)[inv];B[offn:offn+ND.size*4]=ND.astype(np.float32).tobytes()
    print(nm,'lift',lift,'neck',thick,'smoothed, mean move %.4f -> %.4f'%(rough,np.abs(Dw).mean()))
js=json.dumps(J,separators=(',',':')).encode()
while len(js)%4:js+=b' '
open(dst,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(B))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(B),0x004E4942)+bytes(B))
