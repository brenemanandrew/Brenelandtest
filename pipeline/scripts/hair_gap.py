import sys,json,struct,numpy as np,bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
def glb(f):
    d=open(f,'rb').read();L=struct.unpack('<I',d[12:16])[0];return json.loads(d[20:20+L]),bytearray(d[20+L+8:])
def acc(J,B,i,dt,n):
    a=J['accessors'][i];bv=J['bufferViews'][a['bufferView']];o=bv.get('byteOffset',0)+a.get('byteOffset',0);return np.frombuffer(bytes(B[o:o+a['count']*n*np.dtype(dt).itemsize]),dt).reshape(-1,n)
for body in 'fm':
    HF={'m':([0.0175,1.70,-0.025],[0.85,0.845,1.0],[0,1.706,0.025]),'f':([0.0175,1.5,-0.01],[1.025,1.035,1.045],[0.0175,1.504,-0.01])}[body]
    BJ,BB=glb('/home/claude/out/male-body-final.glb' if body=='m' else '/home/claude/out/base-plus-build.glb');bp=BJ['meshes'][0]['primitives'][0]
    BP=acc(BJ,BB,bp['attributes']['POSITION'],np.float32,3).astype(float);ia=BJ['accessors'][bp['indices']];BF=acc(BJ,BB,bp['indices'],np.uint32 if ia['componentType']==5125 else np.uint16,1).reshape(-1,3).astype(int)
    ycut=1.42 if body=='m' else 1.3;hf=(BP[:,1]>ycut)[BF].all(1);head=BVHTree.FromPolygons([Vector(v) for v in BP],[tuple(int(i) for i in f) for f in BF[hf]]);top=BP[:,1].max()
    print(body,'head top',round(top,3))
    for k in sys.argv[1:]:
        J,B=glb('/home/claude/out/hairfinal/%s.glb'%k);P=acc(J,B,J['meshes'][0]['primitives'][0]['attributes']['POSITION'],np.float32,3).astype(float);P=(P-HF[0])*HF[1]+HF[2]
        up=P[P[:,1]>top-0.10];up=up[::max(1,len(up)//3000)];d=[]
        for q in up:
            loc,n,_,dd=head.find_nearest(Vector(q));d.append(dd if (Vector(q)-loc).dot(n)>=0 else -dd)
        d=np.array(d);print('  %-9s n=%5d  inside %4.1f%%  p5 %.3f  p25 %.3f  p50 %.3f  p90 %.3f  max %.3f  top+%.3f'%(k,len(P),100*(d<0).mean(),*np.percentile(d,[5,25,50,90]),d.max(),P[:,1].max()-top))
