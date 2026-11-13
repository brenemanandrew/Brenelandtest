"""Sculpt a short hairstyle to one body's skull: every point is kept between lo and hi metres off the head.  bvenv/bin/python conform_hair.py in.glb out.glb m|f lo hi"""
import sys,json,struct,numpy as np,bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
src,dst,body,lo,hi=sys.argv[-5],sys.argv[-4],sys.argv[-3],float(sys.argv[-2]),float(sys.argv[-1])
HF={'m':([0.0175,1.70,-0.025],[0.85,0.845,1.0],[0,1.706,0.025]),'f':([0.0175,1.5,-0.01],[1.025,1.035,1.045],[0.0175,1.504,-0.01])}[body]
def glb(f):
    d=open(f,'rb').read();L=struct.unpack('<I',d[12:16])[0];return json.loads(d[20:20+L]),bytearray(d[20+L+8:])
BJ,BB=glb('/home/claude/out/male-body-final.glb' if body=='m' else '/home/claude/out/base-plus-build.glb');bp=BJ['meshes'][0]['primitives'][0]
def acc(J,B,i,dt,n):
    a=J['accessors'][i];bv=J['bufferViews'][a['bufferView']];o=bv.get('byteOffset',0)+a.get('byteOffset',0);return a,o,np.frombuffer(bytes(B[o:o+a['count']*n*np.dtype(dt).itemsize]),dt).reshape(-1,n)
BP=acc(BJ,BB,bp['attributes']['POSITION'],np.float32,3)[2].astype(float);ia=BJ['accessors'][bp['indices']];BF=acc(BJ,BB,bp['indices'],np.uint32 if ia['componentType']==5125 else np.uint16,1)[2].reshape(-1,3).astype(int)
hf=(BP[:,1]>(1.42 if body=='m' else 1.3))[BF].all(1);head=BVHTree.FromPolygons([Vector(v) for v in BP],[tuple(int(i) for i in f) for f in BF[hf]])
J,B=glb(src)
for k,p in enumerate(J['meshes'][0]['primitives']):
    a,o,P=acc(J,B,p['attributes']['POSITION'],np.float32,3);P=(P.astype(float)-HF[0])*HF[1]+HF[2];l,h=(lo,hi) if k==0 else (0.002,0.004);mv=0
    for i in range(len(P)):
        loc,n,_,d=head.find_nearest(Vector(P[i]));v=Vector(P[i])-loc;s=d if v.dot(n)>=0 else -d;t=min(max(s,l),h)
        if abs(t-s)>1e-5:P[i]=np.array(loc)+np.array(n)*t;mv+=1
    B[o:o+P.size*4]=P.astype(np.float32).tobytes();a['min']=[float(x) for x in P.min(0)];a['max']=[float(x) for x in P.max(0)]
    if 'NORMAL' in p['attributes']:
        ia=J['accessors'][p['indices']];F=acc(J,B,p['indices'],np.uint32 if ia['componentType']==5125 else np.uint16,1)[2].reshape(-1,3).astype(int)
        fn=np.cross(P[F[:,1]]-P[F[:,0]],P[F[:,2]]-P[F[:,0]]);N=np.zeros_like(P)
        for q in range(3):np.add.at(N,F[:,q],fn)
        N/=np.linalg.norm(N,axis=1,keepdims=True).clip(1e-12);an,on,_=acc(J,B,p['attributes']['NORMAL'],np.float32,3);B[on:on+N.size*4]=N.astype(np.float32).tobytes()
    print('prim',k,'points moved',mv,'of',len(P))
js=json.dumps(J,separators=(',',':')).encode()
while len(js)%4:js+=b' '
open(dst,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(B))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(B),0x004E4942)+bytes(B))
