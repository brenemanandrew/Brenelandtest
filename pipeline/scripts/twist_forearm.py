"""Turn a body's forearms and hands about the forearm axis in the bind pose (palms-forward hands to palms-in), so clips made for
a palms-in body fit. Positions, normals and morph deltas turn together; skin weights stay.  twist_forearm.py in.glb out.glb degrees"""
import json,struct,sys,numpy as np
src,dst,deg=sys.argv[1],sys.argv[2],float(sys.argv[3])
d=open(src,'rb').read();L=struct.unpack('<I',d[12:16])[0];o=20+L;J=json.loads(d[20:o]);B=bytearray(d[o+8:o+8+struct.unpack('<I',d[o:o+4])[0]])
p=J['meshes'][0]['primitives'][0]
def view(i,n,dt=np.float32):
    a=J['accessors'][i];bv=J['bufferViews'][a['bufferView']];off=bv.get('byteOffset',0)+a.get('byteOffset',0);return a,off,np.frombuffer(bytes(B[off:off+a['count']*n*np.dtype(dt).itemsize]),dt).reshape(-1,n).astype(float)
def put(a,off,arr,mm=False):
    B[off:off+arr.size*4]=arr.astype(np.float32).tobytes()
    if mm or 'min' in a:a['min']=[float(v) for v in arr.min(0)];a['max']=[float(v) for v in arr.max(0)]
aP,oP,P=view(p['attributes']['POSITION'],3);aN,oN,N=view(p['attributes']['NORMAL'],3)
_,_,Jn=view(p['attributes']['JOINTS_0'],4,np.uint16);_,_,Wt=view(p['attributes']['WEIGHTS_0'],4)
skin=J['skins'][0];names=[J['nodes'][j]['name'] for j in skin['joints']]
# joint world positions from the inverse bind matrices
_,_,IB=view(skin['inverseBindMatrices'],16);pos={n:np.linalg.inv(IB[i].reshape(4,4).T)[:3,3] for i,n in enumerate(names)}
T=[view(t['POSITION'],3) for t in p.get('targets',[])];TN=[view(t['NORMAL'],3) if 'NORMAL' in t else None for t in p.get('targets',[])]
ss=lambda t:np.clip(t,0,1)**2*(3-2*np.clip(t,0,1))
for side,sg in (('Left',1),('Right',-1)):
    E=pos['mixamorig:'+side+'ForeArm'];H=pos['mixamorig:'+side+'Hand'];ax=(H-E);ln=np.linalg.norm(ax);ax/=ln
    sel=np.array([any(k in n for k in ('ForeArm','Hand')) and side in n for n in names])
    w=(Wt*sel[Jn.astype(int)]).sum(1);t=((P-E)@ax)/ln
    ang=np.radians(deg)*sg*ss((t+0.05)/0.95)*np.clip(w*2,0,1)
    c,s=np.cos(ang)[:,None],np.sin(ang)[:,None]
    rot=lambda V:V*c+np.cross(ax,V)*s+ax*(V@ax)[:,None]*(1-c)
    P=E+rot(P-E);N=rot(N)
    for k,(a,off,D) in enumerate(T):T[k]=(a,off,rot(D))
    for k,x in enumerate(TN):
        if x:TN[k]=(x[0],x[1],rot(x[2]))
    print(side,'verts turned',int((np.abs(ang)>0.01).sum()))
put(aP,oP,P,True);put(aN,oN,N)
for a,off,D in T:put(a,off,D,True)
for x in TN:
    if x:put(x[0],x[1],x[2])
js=json.dumps(J,separators=(',',':')).encode()
while len(js)%4:js+=b' '
open(dst,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(B))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(B),0x004E4942)+bytes(B))
print(dst)
