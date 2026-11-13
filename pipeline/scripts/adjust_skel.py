"""Move the shoulder pivots (mixamorig:LeftArm/RightArm) to the centre of the base body's shoulder ball.
The arm bone's bind turn is re-aimed so the elbow stays put and the forearm keeps Belinda's local direction (her clips,
which store absolute local turns, still point the arm the same way)."""
import json,struct,numpy as np,sys
src,dst=sys.argv[1],sys.argv[2]
NEWJ={'Left':np.array([0.185,1.215,-0.032]),'Right':np.array([-0.175,1.21,-0.032])}
if len(sys.argv)>3:NEWJ={k:np.array(v) for k,v in json.loads(sys.argv[3]).items()}
d=open(src,'rb').read();L=struct.unpack('<I',d[12:16])[0];J=json.loads(d[20:20+L]);B=bytearray(d[20+L+8:20+L+8+struct.unpack('<I',d[20+L:24+L])[0]])
N=J['nodes'];sk=J['skins'][0];joints=sk['joints'];a=J['accessors'][sk['inverseBindMatrices']];bv=J['bufferViews'][a['bufferView']];off=bv.get('byteOffset',0)+a.get('byteOffset',0)
IBM=np.frombuffer(bytes(B[off:off+64*a['count']]),np.float32).reshape(-1,4,4).transpose(0,2,1).copy()
byn={N[j]['name']:k for k,j in enumerate(joints)}
def q2m(q):
    x,y,z,w=q;return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
def m2q(m):
    t=np.trace(m)
    if t>0:s=np.sqrt(t+1)*2;return [(m[2,1]-m[1,2])/s,(m[0,2]-m[2,0])/s,(m[1,0]-m[0,1])/s,0.25*s]
    i=np.argmax(np.diag(m));j,k=(i+1)%3,(i+2)%3;s=np.sqrt(1+m[i,i]-m[j,j]-m[k,k])*2;q=[0,0,0,0];q[i]=0.25*s;q[j]=(m[j,i]+m[i,j])/s;q[k]=(m[k,i]+m[i,k])/s;q[3]=(m[k,j]-m[j,k])/s;return q
def rot_between(a,b):
    a=a/np.linalg.norm(a);b=b/np.linalg.norm(b);v=np.cross(a,b);c=a@b;vx=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]]);return np.eye(3)+vx+vx@vx/(1+c)
W=lambda n:np.linalg.inv(IBM[byn['mixamorig:'+n]])
orth=lambda m:m/np.linalg.norm(m,axis=0)
for s,Jn in NEWJ.items():
    C,A,F=W(s+'Shoulder'),W(s+'Arm'),W(s+'ForeArm');Rc,Ra,Rf=orth(C[:3,:3]),orth(A[:3,:3]),orth(F[:3,:3])
    Ra2=rot_between(F[:3,3]-A[:3,3],F[:3,3]-Jn)@Ra
    ia,iff=[j for j in joints if N[j]['name']=='mixamorig:'+s+'Arm'][0],[j for j in joints if N[j]['name']=='mixamorig:'+s+'ForeArm'][0]
    N[ia]['translation']=[float(x) for x in Rc.T@(Jn-C[:3,3])];N[ia]['rotation']=[float(x) for x in m2q(Rc.T@Ra2)]
    N[iff]['translation']=[float(x) for x in Ra2.T@(F[:3,3]-Jn)];N[iff]['rotation']=[float(x) for x in m2q(Ra2.T@Rf)]
    M=np.eye(4);M[:3,:3]=Ra2;M[:3,3]=Jn;IBM[byn['mixamorig:'+s+'Arm']]=np.linalg.inv(M)
    print(s,'arm pivot',A[:3,3].round(3),'->',Jn,'re-aimed %.1f deg'%np.degrees(np.arccos(np.clip(((F[:3,3]-A[:3,3])/np.linalg.norm(F[:3,3]-A[:3,3]))@((F[:3,3]-Jn)/np.linalg.norm(F[:3,3]-Jn)),-1,1))))
B[off:off+64*a['count']]=IBM.transpose(0,2,1).astype(np.float32).tobytes()
js=json.dumps(J,separators=(',',':')).encode()
while len(js)%4:js+=b' '
while len(B)%4:B.append(0)
open(dst,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(B))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(B),0x004E4942)+bytes(B))
