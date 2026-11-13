"""Fit the shared skeleton to the male base body: key joints placed from his measurements, each bone's bind turn re-aimed
so the clips (absolute local turns) still point his limbs the same way."""
import json,struct,numpy as np,sys
src,dst=sys.argv[1],sys.argv[2]
T={'Hips':(0,0.834,0),'Spine2':(0,1.22,0.01),'Neck':(0,1.33,-0.015),'Head':(0,1.41,0.01),'HeadTop_End':(0,1.70,0.03)}
for s,g in (('Left',1),('Right',-1)):
    T.update({s+'Shoulder':(g*0.045,1.28,-0.01),s+'Arm':(g*0.185,1.265,-0.015),s+'ForeArm':(g*0.255,0.985,-0.005),s+'Hand':(g*0.315,0.80,0.027),s+'HandMiddle1':(g*0.35,0.735,0.04),
              s+'UpLeg':(g*0.088,0.75,0.0),s+'Leg':(g*0.096,0.42,-0.025),s+'Foot':(g*0.085,0.095,-0.04),s+'ToeBase':(g*0.09,0.02,0.07)})
d=open(src,'rb').read();L=struct.unpack('<I',d[12:16])[0];J=json.loads(d[20:20+L]);B=bytearray(d[20+L+8:20+L+8+struct.unpack('<I',d[20+L:24+L])[0]])
N=J['nodes'];sk=J['skins'][0];joints=sk['joints'];a=J['accessors'][sk['inverseBindMatrices']];bv=J['bufferViews'][a['bufferView']];off=bv.get('byteOffset',0)+a.get('byteOffset',0)
IBM=np.frombuffer(bytes(B[off:off+64*a['count']]),np.float32).reshape(-1,4,4).transpose(0,2,1).astype(float)
W={j:np.linalg.inv(IBM[k]) for k,j in enumerate(joints)};par={c:i for i,n in enumerate(N) for c in n.get('children',[])}
nm={j:N[j]['name'].replace('mixamorig:','') for j in joints};byn={v:k for k,v in nm.items()}
MAIN={'Hips':'Spine','Spine':'Spine1','Spine1':'Spine2','Spine2':'Neck','Neck':'Head','Head':'HeadTop_End'}
for s in ('Left','Right'):MAIN.update({s+'Shoulder':s+'Arm',s+'Arm':s+'ForeArm',s+'ForeArm':s+'Hand',s+'Hand':s+'HandMiddle1',s+'UpLeg':s+'Leg',s+'Leg':s+'Foot',s+'Foot':s+'ToeBase'})
# spine joints between hips and spine2 keep their fractions
h0,s0=W[byn['Hips']][:3,3],W[byn['Spine2']][:3,3]
for k in ('Spine','Spine1'):
    f=(W[byn[k]][1,3]-h0[1])/(s0[1]-h0[1]);T[k]=tuple(np.array(T['Hips'])+f*(np.array(T['Spine2'])-np.array(T['Hips'])))
def m2q(m):
    t=np.trace(m)
    if t>0:s=np.sqrt(t+1)*2;return [(m[2,1]-m[1,2])/s,(m[0,2]-m[2,0])/s,(m[1,0]-m[0,1])/s,0.25*s]
    i=int(np.argmax(np.diag(m)));j,k=(i+1)%3,(i+2)%3;s=np.sqrt(1+m[i,i]-m[j,j]-m[k,k])*2;q=[0,0,0,0];q[i]=0.25*s;q[j]=(m[j,i]+m[i,j])/s;q[k]=(m[k,i]+m[i,k])/s;q[3]=(m[k,j]-m[j,k])/s;return q
def rb(a,b):
    a=a/np.linalg.norm(a);b=b/np.linalg.norm(b);v=np.cross(a,b);c=a@b;vx=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]]);return np.eye(3)+vx+vx@vx/(1+c)
orth=lambda m:m/np.linalg.norm(m,axis=0)
NP={};D={};K={};NR={}
def walk(j,first=False):
    n=nm[j];p=par.get(j)
    if n in T:NP[j]=np.array(T[n],float)
    else:NP[j]=NP[p]+D[p]@(W[j][:3,3]-W[p][:3,3])*K[p]
    c=byn.get(MAIN.get(n,''))
    if c is not None and MAIN[n] in T:
        o=W[c][:3,3]-W[j][:3,3];t=np.array(T[MAIN[n]],float)-NP[j];D[j]=rb(o,t);K[j]=np.linalg.norm(t)/np.linalg.norm(o)
    else:D[j]=D[p] if p in D else np.eye(3);K[j]=K[p] if p in K else 1.0
    NR[j]=D[j]@orth(W[j][:3,:3])
    for ch in N[j].get('children',[]):
        if ch in W:walk(ch)
walk(byn['Hips'])
for j in joints:
    p=par.get(j);M=np.eye(4);M[:3,:3]=NR[j];M[:3,3]=NP[j];IBM[joints.index(j)]=np.linalg.inv(M)
    if p in NR:N[j]['translation']=[float(x) for x in NR[p].T@(NP[j]-NP[p])];N[j]['rotation']=[float(x) for x in m2q(NR[p].T@NR[j])]
    else:
        pw=W[p] if p in W else None  # hips: parent is the armature node (unchanged)
        N[j]['translation']=[float(x) for x in (np.array(N[j]['translation'])+(NP[j]-W[j][:3,3]))] if True else None
B[off:off+64*a['count']]=IBM.transpose(0,2,1).astype(np.float32).tobytes()
js=json.dumps(J,separators=(',',':')).encode()
while len(js)%4:js+=b' '
while len(B)%4:B.append(0)
open(dst,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(B))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(B),0x004E4942)+bytes(B))
print('male skeleton written; arm scale %.2f leg scale %.2f'%(K[byn['LeftArm']],K[byn['LeftUpLeg']]))
