"""Shrink a very dense Meshy model without Blender (which runs out of memory on it): vertices are merged on a grid.  cluster_glb.py in.glb out.glb cells"""
import json,struct,sys,numpy as np
src,dst,cells=sys.argv[1],sys.argv[2],int(sys.argv[3])
d=open(src,'rb').read();L=struct.unpack('<I',d[12:16])[0];J=json.loads(d[20:20+L]);B=memoryview(d)[20+L+8:]
CT={5126:np.float32,5125:np.uint32,5123:np.uint16};NC={'SCALAR':1,'VEC2':2,'VEC3':3}
def acc(i):
    a=J['accessors'][i];bv=J['bufferViews'][a['bufferView']];return np.frombuffer(B,CT[a['componentType']],a['count']*NC[a['type']],bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
p=J['meshes'][0]['primitives'][0];P=acc(p['attributes']['POSITION']);UV=acc(p['attributes']['TEXCOORD_0']);F=acc(p['indices']).reshape(-1,3)
print('verts',len(P),'tris',len(F));mn=P.min(0);sz=(P.max(0)-mn).max()/cells
c=np.floor((P-mn)/sz).astype(np.int64);uq=np.floor(np.clip(UV,0,0.9999)*48).astype(np.int64);k=c[:,0]+c[:,1]*2000+c[:,2]*4000000+(uq[:,0]+uq[:,1]*48)*8000000000   # merge only points close in space and on the texture
_,first,inv=np.unique(k,return_index=True,return_inverse=True);inv=inv.ravel();F2=inv[F].astype(np.uint32)
F2=F2[(F2[:,0]!=F2[:,1])&(F2[:,1]!=F2[:,2])&(F2[:,0]!=F2[:,2])];P2=np.ascontiguousarray(P[first]);U2=np.ascontiguousarray(UV[first]);print('->',len(P2),len(F2))
mat=J['materials'][p['material']];im=J['images'][J['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']];bv=J['bufferViews'][im['bufferView']];ib=bytes(B[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])
BIN=bytearray();views=[];accs=[]
def add(b,comp=None,typ=None,n=0,mm=None):
    while len(BIN)%4:BIN.append(0)
    views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':len(b)});BIN.extend(b)
    if comp:
        a={'bufferView':len(views)-1,'componentType':comp,'type':typ,'count':n}
        if mm is not None:a['min']=[float(x) for x in mm.min(0)];a['max']=[float(x) for x in mm.max(0)]
        accs.append(a);return len(accs)-1
    return len(views)-1
pr={'attributes':{'POSITION':add(P2.tobytes(),5126,'VEC3',len(P2),P2),'TEXCOORD_0':add(U2.tobytes(),5126,'VEC2',len(U2))},'indices':add(F2.tobytes(),5125,'SCALAR',F2.size),'material':0}
iv=add(ib)
while len(BIN)%4:BIN.append(0)
G={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],'meshes':[{'primitives':[pr]}],'materials':[{'pbrMetallicRoughness':{'baseColorTexture':{'index':0}}}],'textures':[{'source':0}],'images':[{'bufferView':iv,'mimeType':im.get('mimeType','image/png')}],'bufferViews':views,'accessors':accs,'buffers':[{'byteLength':len(BIN)}]}
js=json.dumps(G,separators=(',',':')).encode()
while len(js)%4:js+=b' '
open(dst,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(BIN))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(BIN),0x004E4942)+bytes(BIN))
