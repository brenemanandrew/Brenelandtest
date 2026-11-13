"""Which hidden skin is not actually behind cloth, and why: for each such skin point, is the nearest cloth far away (a hole) or under the skin (pushed through)?"""
import sys,json,struct,numpy as np,bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
def glb(f):
    d=open(f,'rb').read();L=struct.unpack('<I',d[12:16])[0];return json.loads(d[20:20+L]),d[20+L+8:]
CT={5126:np.float32,5125:np.uint32,5123:np.uint16,5121:np.uint8};NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def mk(J,B):
    def a(i):
        A=J['accessors'][i];bv=J['bufferViews'][A['bufferView']];o=bv.get('byteOffset',0)+A.get('byteOffset',0);n=NC[A['type']];return np.frombuffer(B,CT[A['componentType']],A['count']*n,o).reshape(-1,n) if n>1 else np.frombuffer(B,CT[A['componentType']],A['count'],o)
    return a
body=sys.argv[-1];BJ,BB=glb('/home/claude/out/male-body-final.glb' if body=='m' else '/home/claude/out/base-plus-build.glb');ba=mk(BJ,BB);bp=BJ['meshes'][0]['primitives'][0];BP=ba(bp['attributes']['POSITION']).astype(float);BF=ba(bp['indices']).reshape(-1,3).astype(int)
fn=np.cross(BP[BF[:,1]]-BP[BF[:,0]],BP[BF[:,2]]-BP[BF[:,0]]);_,bi=np.unique(np.round(BP*1e5).astype(np.int64),axis=0,return_inverse=True);bi=bi.ravel();N=np.zeros((bi.max()+1,3))
for k in range(3):np.add.at(N,bi[BF[:,k]],fn)
N=(N/np.linalg.norm(N,axis=1,keepdims=True).clip(1e-12))[bi]
for f in sys.argv[sys.argv.index('--')+1:-1]:
    J,B=glb('/home/claude/out/wear/%s.glb'%f);a=mk(J,B);p=J['meshes'][0]['primitives'][0];P=a(p['attributes']['POSITION']).astype(float);F=a(p['indices']).reshape(-1,3).astype(int);ex=J['meshes'][0]['extras'];cov=a(ex['cover']).astype(int)
    t=BVHTree.FromPolygons([Vector(v) for v in P],[tuple(int(i) for i in q) for q in F]);hole=0;thru=0;pts=[]
    for i in cov[::2]:
        if t.ray_cast(Vector(BP[i])+Vector(N[i])*0.0005,Vector(N[i]),0.3)[0] is not None:continue
        loc,n,_,d=t.find_nearest(Vector(BP[i]))
        if loc is None or d>0.02:hole+=1;pts.append(BP[i])
        else:thru+=1
    pts=np.array(pts) if pts else np.zeros((0,3))
    print('%-18s faces %5d  hidden skin pts %5d  not behind cloth: %4d through-cloth, %4d over a hole  %s'%(f,len(F),len(cov)//2,thru,hole,('hole y %.2f..%.2f'%(pts[:,1].min(),pts[:,1].max())) if len(pts) else ''))
