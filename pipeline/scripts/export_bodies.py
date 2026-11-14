"""The four fixed builds as plain static models (no rig, no shapes), as she stands in the game: textured, shoulders raised 4 cm.
python3 export_bodies.py f|m [outdir]   -> body_<build>.glb  (for Meshy, Blender, or to send a garment maker a reference)"""
import sys,os,json,struct,numpy as np
R=os.path.dirname(os.path.abspath(__file__))+'/../out'
bid=sys.argv[1];OUT=sys.argv[2] if len(sys.argv)>2 else R+'/bodies_'+bid
SRC={'f':'base-plus-build.glb','m':'male-body-final.glb'}[bid];BUILDS={'f':['plus','average','slim','athletic'],'m':['average','slim','heavy','athletic']}[bid]
LABEL={'plus':'plus','average':'average','slim':'thin','athletic':'athletic','heavy':'plus'}
d=open(R+'/'+SRC,'rb').read();L=struct.unpack('<I',d[12:16])[0];J=json.loads(d[20:20+L]);B=d[20+L+8:]
CT={5126:np.float32,5125:np.uint32,5123:np.uint16,5121:np.uint8};NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
def acc(i):
    a=J['accessors'][i];bv=J['bufferViews'][a['bufferView']];return np.frombuffer(B,CT[a['componentType']],a['count']*NC[a['type']],bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
pr=J['meshes'][0]['primitives'][0];tn=J['meshes'][0]['extras']['targetNames']
P=acc(pr['attributes']['POSITION']).astype(float);UV=acc(pr['attributes']['TEXCOORD_0']).astype(np.float32);F=acc(pr['indices']).reshape(-1,3).astype(np.uint32)
JN=acc(pr['attributes']['JOINTS_0']).astype(int);WT=acc(pr['attributes']['WEIGHTS_0']).astype(float)
T={n:acc(pr['targets'][i]['POSITION']).astype(float) for i,n in enumerate(tn)}
jn=[J['nodes'][j]['name'] for j in J['skins'][0]['joints']];NJ=len(jn)
Wd=np.zeros((len(P),NJ));np.add.at(Wd,(np.repeat(np.arange(len(P)),4),JN.ravel()),WT.ravel())
LIFT=np.zeros(len(P))
if bid=='f':   # the game raises her shoulders 4 cm at load (arms fully, the collar 70%, eased into the shoulder)
    wt=np.zeros(NJ)
    for i_,n_ in enumerate(jn):
        if any(k in n_ for k in ('Arm','Hand')):wt[i_]=1
        elif n_.endswith('LeftShoulder') or n_.endswith('RightShoulder'):wt[i_]=0.7
    _,bi=np.unique(np.round(P*2e4).astype(np.int64),axis=0,return_inverse=True);bi=bi.ravel();nb=bi.max()+1;w0=np.zeros(nb);np.maximum.at(w0,bi,Wd@wt);FB=bi[F.astype(int)]
    E=np.unique(np.sort(np.r_[FB[:,[0,1]],FB[:,[1,2]],FB[:,[2,0]]],axis=1),axis=0);E=E[E[:,0]!=E[:,1]];dg=np.zeros(nb);np.add.at(dg,E[:,0],1);np.add.at(dg,E[:,1],1);cur=w0.copy()
    for _ in range(12):
        sm=np.zeros(nb);np.add.at(sm,E[:,0],cur[E[:,1]]);np.add.at(sm,E[:,1],cur[E[:,0]]);cur=np.maximum(w0*0.999,np.where(dg>0,0.5*cur+0.5*sm/np.maximum(dg,1),cur))
    LIFT=np.where((cur[bi]>0.002)&(P[:,1]<1.36),0.04*cur[bi],0.0)
def vnorm(X,Fc):
    fn=np.cross(X[Fc[:,1]]-X[Fc[:,0]],X[Fc[:,2]]-X[Fc[:,0]]);N=np.zeros_like(X)
    for k in range(3):np.add.at(N,Fc[:,k],fn)
    return N/np.linalg.norm(N,axis=1,keepdims=True).clip(1e-12)
imgs=[]
for im in J['images']:
    bv=J['bufferViews'][im['bufferView']];imgs.append((B[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']],im.get('mimeType','image/png')))
os.makedirs(OUT,exist_ok=True)
for b in BUILDS:
    X=P+(T[b] if b in T else 0);X[:,1]+=LIFT;X=X.astype(np.float32);N=vnorm(X.astype(float),F.astype(int)).astype(np.float32)
    BIN=bytearray();views=[];accs=[]
    def add(arr,comp,typ,mm=False,target=None):
        while len(BIN)%4:BIN.append(0)
        v={'buffer':0,'byteOffset':len(BIN),'byteLength':arr.nbytes};BIN.extend(arr.tobytes());views.append(v)
        a={'bufferView':len(views)-1,'componentType':comp,'type':typ,'count':int(arr.shape[0])}
        if mm:a['min']=[float(x) for x in arr.min(0)];a['max']=[float(x) for x in arr.max(0)]
        accs.append(a);return len(accs)-1
    pr2={'attributes':{'POSITION':add(X,5126,'VEC3',True),'NORMAL':add(N,5126,'VEC3'),'TEXCOORD_0':add(UV,5126,'VEC2')},'indices':add(F.reshape(-1),5125,'SCALAR'),'material':0}
    ims=[]
    for data,mt in imgs:
        while len(BIN)%4:BIN.append(0)
        views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':len(data)});BIN.extend(data);ims.append({'bufferView':len(views)-1,'mimeType':mt})
    while len(BIN)%4:BIN.append(0)
    mat=dict(J['materials'][0]);GJ={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':'body_'+LABEL[b],'mesh':0}],'meshes':[{'name':'body_'+LABEL[b],'primitives':[pr2]}],
        'materials':[mat],'textures':[{'source':i} for i in range(len(ims))],'images':ims,'bufferViews':views,'accessors':accs,'buffers':[{'byteLength':len(BIN)}]}
    js=json.dumps(GJ,separators=(',',':')).encode()
    while len(js)%4:js+=b' '
    out=f'{OUT}/body_{"female" if bid=="f" else "male"}_{LABEL[b]}.glb'
    open(out,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(BIN))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(BIN),0x004E4942)+bytes(BIN))
    print(out,'%.1f MB'%((28+len(js)+len(BIN))/1e6),'height %.2f m, hip width %.2f m'%(X[:,1].max()-X[:,1].min(),np.ptp(X[np.abs(X[:,1]-0.95)<0.02,0])))
