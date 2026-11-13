"""Bring a T-pose body's arms down to the A-pose (rotating each arm about its shoulder), positions only."""
import json,struct,sys,numpy as np
src,dst,deg=sys.argv[1],sys.argv[2],float(sys.argv[3])
d=open(src,'rb').read();L=struct.unpack('<I',d[12:16])[0];o=20+L;J=json.loads(d[20:o]);B=bytearray(d[o+8:o+8+struct.unpack('<I',d[o:o+4])[0]])
p=J['meshes'][0]['primitives'][0];a=J['accessors'][p['attributes']['POSITION']];bv=J['bufferViews'][a['bufferView']];off=bv.get('byteOffset',0)+a.get('byteOffset',0)
P=np.frombuffer(bytes(B[off:off+a['count']*12]),np.float32).reshape(-1,3).astype(float)
h=P[:,1].max()-P[:,1].min();s=1.70/h;cx=(P[:,0].max()+P[:,0].min())/2
arm=P[np.abs(P[:,0]-cx)*s>0.4];ay=arm[:,1].mean();az=arm[:,2].mean();th=(arm[:,1].max()-arm[:,1].min())/2
px=0.185/s;ss=lambda t:np.clip(t,0,1)**2*(3-2*np.clip(t,0,1))
for g in (1,-1):
    piv=np.array([cx+g*px,ay,az]);dx=(P[:,0]-piv[0])*g;w=ss((dx+0.02/s)/(0.1/s))*(np.abs(P[:,1]-ay)<th*2.2)
    ang=-g*np.radians(deg)*w;c,sn=np.cos(ang),np.sin(ang);x=P[:,0]-piv[0];y=P[:,1]-piv[1]
    P[:,0]=piv[0]+c*x-sn*y;P[:,1]=piv[1]+sn*x+c*y
B[off:off+a['count']*12]=P.astype(np.float32).tobytes();a['min']=[float(v) for v in P.min(0)];a['max']=[float(v) for v in P.max(0)]
js=json.dumps(J,separators=(',',':')).encode()
while len(js)%4:js+=b' '
open(dst,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(B))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(B),0x004E4942)+bytes(B))
print(dst,'arm y %.3f'%((ay-P[:,1].min())*s))
