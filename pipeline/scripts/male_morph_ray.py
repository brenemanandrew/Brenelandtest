"""Rebuild his build shapes on the torso, hips and legs straight from the Meshy bodies: each base vertex is carried along its normal onto the
variant's surface (the part-by-part mapping stays only on the arms, whose pose differs).  bvenv/bin/python male_morph_ray.py in.glb out.glb"""
import json,struct,sys,numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
src,dst=sys.argv[-2],sys.argv[-1]
CT={5126:np.float32,5125:np.uint32,5123:np.uint16,5121:np.uint8};NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def load(f):
    d=open(f,'rb').read();L=struct.unpack('<I',d[12:16])[0];o=20+L;return json.loads(d[20:o]),bytearray(d[o+8:o+8+struct.unpack('<I',d[o:o+4])[0]])
def acc(J,B,i):
    a=J['accessors'][i];bv=J['bufferViews'][a['bufferView']];off=bv.get('byteOffset',0)+a.get('byteOffset',0);n=NC[a['type']];dt=CT[a['componentType']]
    return a,off,np.frombuffer(bytes(B[off:off+a['count']*n*np.dtype(dt).itemsize]),dt).reshape(-1,n)
J,B=load(src);me=J['meshes'][0];p=me['primitives'][0];names=me['extras']['targetNames']
P=acc(J,B,p['attributes']['POSITION'])[2].astype(float);N=acc(J,B,p['attributes']['NORMAL'])[2].astype(float);Jn=acc(J,B,p['attributes']['JOINTS_0'])[2].astype(int);Wt=acc(J,B,p['attributes']['WEIGHTS_0'])[2].astype(float)
F=acc(J,B,p['indices'])[2].reshape(-1,3).astype(int)
jn=[J['nodes'][j]['name'] for j in J['skins'][0]['joints']];arm=np.array([('Arm' in n or 'Hand' in n) for n in jn]);aw=(Wt*arm[Jn]).sum(1)
# smooth vertex normals over welded positions
_,inv=np.unique(np.round(P*1e5).astype(np.int64),axis=0,return_inverse=True);inv=inv.ravel();FU=inv[F];nw=inv.max()+1;U=np.zeros((nw,3));U[inv]=P
fn=np.cross(U[FU[:,1]]-U[FU[:,0]],U[FU[:,2]]-U[FU[:,0]]);vn=np.zeros((nw,3))
for k in range(3):np.add.at(vn,FU[:,k],fn)
vn/=np.linalg.norm(vn,axis=1,keepdims=True).clip(1e-12);Ns=vn[inv]
ss=lambda t:np.clip(t,0,1)**2*(3-2*np.clip(t,0,1))
_,_,IB=acc(J,B,J['skins'][0]['inverseBindMatrices']);JP={n:np.linalg.inv(IB[i].astype(float).reshape(4,4).T)[:3,3] for i,n in enumerate(jn)}
zref=np.median(P[(P[:,1]>0.9)&(P[:,1]<1.2)&(np.abs(P[:,0])<0.12)][:,2])
for nm in ('slim','heavy','athletic'):
    VJ,VB=load('/home/claude/out/mv_%s.glb'%nm);vp=VJ['meshes'][0]['primitives'][0];V=acc(VJ,VB,vp['attributes']['POSITION'])[2].astype(float);VF=acc(VJ,VB,vp['indices'])[2].reshape(-1,3).astype(int)
    s=1.70/(V[:,1].max()-V[:,1].min());V=(V-[ (V[:,0].max()+V[:,0].min())/2,V[:,1].min(),0])*s
    V[:,2]+=zref-np.median(V[(V[:,1]>0.9)&(V[:,1]<1.2)&(np.abs(V[:,0])<0.12)][:,2])
    bvh=BVHTree.FromPolygons([Vector(v) for v in V],[tuple(int(i) for i in f) for f in VF])
    a,off,Dold=acc(J,B,p['targets'][names.index(nm)]['POSITION']);Dold=Dold.astype(float);D=Dold.copy();hits=0;near=0
    for i in range(len(P)):
        if aw[i]>0.95 or P[i,1]>1.37:continue
        n=Vector(Ns[i]);o=Vector(P[i]);h=None
        loc,hn,_,dist=bvh.ray_cast(o+n*0.09,-n,0.2)
        if loc is not None and hn.dot(n)>0.35 and (loc-o).length<0.055:h=loc;hits+=1
        else:
            loc,hn,_,dist=bvh.find_nearest(o,0.05)
            if loc is not None and hn.dot(n)>0.3:h=loc;near+=1
        if h is not None:D[i]=np.array(h)-P[i]
    # the arms: thicken (or thin) the base arm round its own bones, most at the shoulder cap and upper arm, easing to nothing at the wrist
    prof={'heavy':(1.34,1.26,1.2,1.06,0.0),'athletic':(1.36,1.3,1.24,1.05,0.14),'slim':(0.9,0.9,0.92,0.98,0.0)}[nm];Darm=np.zeros_like(P)
    for side in ('Left','Right'):
        Sj,Ej,Hj=[JP['mixamorig:'+side+k] for k in ('Arm','ForeArm','Hand')];sel=np.array([side in n and ('Arm' in n or 'Hand' in n) for n in jn]);sw=(Wt*sel[Jn]).sum(1);hw=(Wt*np.array([side in n and 'Hand' in n for n in jn])[Jn]).sum(1)
        for A_,B_,f0,f1,seg in ((Sj,Ej,prof[0],prof[1],0),(Ej,Hj,prof[2],prof[3],1)):
            ax=B_-A_;ln=np.linalg.norm(ax);ax=ax/ln;t=(P-A_)@ax/ln;m=(sw>0.02)&((t<1) if seg==0 else (t>=1e-9))&((t>-0.6) if seg==0 else (t<1.6))
            if seg==1:m&=((P-Sj)@((Ej-Sj)/np.linalg.norm(Ej-Sj))/np.linalg.norm(Ej-Sj))>=1
            tc=np.clip(t,0,1);f=f0+(f1-f0)*tc+(prof[4]*np.exp(-((tc-0.45)/0.22)**2) if seg==0 else prof[4]*0.5*np.exp(-((tc-0.25)/0.2)**2))
            rv=(P-A_)-np.outer((P-A_)@ax,ax);Darm[m]=(rv*((f-1)*(1-hw)*np.clip(sw*1.6,0,1))[:,None])[m]
    Dold=Darm
    w=(1-ss((aw-0.15)/0.6))*(1-ss((P[:,1]-1.30)/0.06))        # torso, hips and legs; fading into the arms and out below the head
    D=Dold*(1-w[:,None])+D*w[:,None]
    B[off:off+D.size*4]=D.astype(np.float32).tobytes();a['min']=[float(v) for v in D.min(0)];a['max']=[float(v) for v in D.max(0)]
    print(nm,'ray hits',hits,'nearest',near,'of',len(P),'mean move %.4f -> %.4f max %.3f'%(np.abs(Dold).mean(),np.abs(D).mean(),np.linalg.norm(D,axis=1).max()))
js=json.dumps(J,separators=(',',':')).encode()
while len(js)%4:js+=b' '
open(dst,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(B))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(B),0x004E4942)+bytes(B))
