"""Sculpt a short hairstyle to one body's skull: every point is kept between lo and hi metres off the head.  bvenv/bin/python conform_hair.py in.glb out.glb m|f lo hi"""
import sys,json,struct,numpy as np,bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
src,dst,body=sys.argv[-5],sys.argv[-4],sys.argv[-3]
HF={'m':([0.0175,1.70,-0.025],[0.85,0.845,1.0],[0,1.706,0.025]),'f':([0.0175,1.5,-0.01],[1.025,1.035,1.045],[0.0175,1.504,-0.01])}[body]
def glb(f):
    d=open(f,'rb').read();L=struct.unpack('<I',d[12:16])[0];return json.loads(d[20:20+L]),bytearray(d[20+L+8:])
BJ,BB=glb('/home/claude/out/male-body-final.glb' if body=='m' else '/home/claude/out/base-plus-build.glb');bp=BJ['meshes'][0]['primitives'][0]
def acc(J,B,i,dt,n):
    a=J['accessors'][i];bv=J['bufferViews'][a['bufferView']];o=bv.get('byteOffset',0)+a.get('byteOffset',0);return a,o,np.frombuffer(bytes(B[o:o+a['count']*n*np.dtype(dt).itemsize]),dt).reshape(-1,n)
BP=acc(BJ,BB,bp['attributes']['POSITION'],np.float32,3)[2].astype(float);ia=BJ['accessors'][bp['indices']];BF=acc(BJ,BB,bp['indices'],np.uint32 if ia['componentType']==5125 else np.uint16,1)[2].reshape(-1,3).astype(int)
hf=(BP[:,1]>(1.42 if body=='m' else 1.3))[BF].all(1);head=BVHTree.FromPolygons([Vector(v) for v in BP],[tuple(int(i) for i in f) for f in BF[hf]])
J,B=glb(src)
TOP=BP[:,1].max();TGT=float(sys.argv[-1]);PAR=None
for k,p in enumerate(J['meshes'][0]['primitives']):
    a,o,P=acc(J,B,p['attributes']['POSITION'],np.float32,3);P=(P.astype(float)-HF[0])*HF[1]+HF[2];mv=0
    L=np.zeros((len(P),3));Nn=np.zeros((len(P),3));S=np.zeros(len(P))
    for i in range(len(P)):
        loc,n,_,d=head.find_nearest(Vector(P[i]));v=Vector(P[i])-loc;L[i]=loc;S[i]=d if v.dot(n)>=0 else -d;Nn[i]=(np.array(v)/d) if d>1e-6 else np.array(n)
    if PAR is None:   # how far this style stands off the crown now, and the squeeze that brings its middle to the target
        up=S[P[:,1]>TOP-0.10];p5,p50=np.percentile(up,[5,50]);lo=float(sys.argv[-2]);PAR=(p5,lo,min(1.0,(TGT-lo)/max(p50-p5,1e-4)));print('  off the crown: p5 %.3f p50 %.3f -> squeeze %.2f'%(p5,p50,PAR[2]))
    p5,lo,sq=PAR;w=np.clip((L[:,1]-(TOP-0.24))/0.10,0,1);w=w*w*(3-2*w)   # full on the scalp, fading out by the jaw so hanging hair keeps its fall
    S2=np.where(S>p5,lo+(S-p5)*sq,np.minimum(S,lo)+0*S);S2=np.maximum(S2,0.004);D=(S2-S)*w
    V=Nn*D[:,None]   # neighbouring points move together, so strands and fringes keep their shape instead of breaking into shards
    ia_=J['accessors'][p['indices']];F_=acc(J,B,p['indices'],np.uint32 if ia_['componentType']==5125 else np.uint16,1)[2].reshape(-1,3).astype(int)
    _,gi=np.unique(np.round(P*2e4).astype(np.int64),axis=0,return_inverse=True);gi=gi.ravel();gn=gi.max()+1;GF=gi[F_];E=np.unique(np.sort(np.r_[GF[:,[0,1]],GF[:,[1,2]],GF[:,[2,0]]],axis=1),axis=0);E=E[E[:,0]!=E[:,1]]
    dg=np.zeros(gn);np.add.at(dg,E[:,0],1);np.add.at(dg,E[:,1],1);cn=np.zeros(gn);np.add.at(cn,gi,1);Vw=np.zeros((gn,3));np.add.at(Vw,gi,V);Vw/=cn[:,None]
    for _ in range(int(sys.argv[-3]) if sys.argv[-3].isdigit() else 25):
        nb=np.zeros((gn,3));np.add.at(nb,E[:,0],Vw[E[:,1]]);np.add.at(nb,E[:,1],Vw[E[:,0]]);Vw=np.where(dg[:,None]>0,0.4*Vw+0.6*nb/np.maximum(dg,1)[:,None],Vw)
    P=P+Vw[gi];mv=int((np.abs(D)>1e-4).sum())
    for i in range(len(P)):   # and nothing is left under the skin
        loc,n,_,d=head.find_nearest(Vector(P[i]));v=Vector(P[i])-loc
        if v.dot(n)<0 or d<0.004:P[i]=np.array(loc)+np.array(n)*0.005
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
