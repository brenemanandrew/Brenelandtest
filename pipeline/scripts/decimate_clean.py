# decimate a Meshy GLB (positions only) to N triangles and save as npz; also front/side silhouettes
import sys,json,struct,numpy as np,fast_simplification as fs
from PIL import Image,ImageDraw
f,out,N=sys.argv[1],sys.argv[2],int(sys.argv[3])
d=open(f,'rb').read();L=struct.unpack('<I',d[12:16])[0];J=json.loads(d[20:20+L]);B=d[20+L+8:]
p=J['meshes'][0]['primitives'][0];a=J['accessors'][p['attributes']['POSITION']];bv=J['bufferViews'][a['bufferView']]
P=np.frombuffer(B,np.float32,a['count']*3,bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,3).astype(np.float32)
ia=J['accessors'][p['indices']];iv=J['bufferViews'][ia['bufferView']];T={5125:np.uint32,5123:np.uint16}[ia['componentType']]
F=np.frombuffer(B,T,ia['count'],iv.get('byteOffset',0)+ia.get('byteOffset',0)).reshape(-1,3).astype(np.int64)
P2,F2=fs.simplify(P,F,target_reduction=1-N/len(F)) if len(F)>N else (P,F)
np.savez(out,P=P2,F=F2);print(f,'->',len(P2),'verts',len(F2),'tris')
im=Image.new('RGB',(1000,500),'white');dr=ImageDraw.Draw(im)
for k,(ax,off) in enumerate(((0,0),(2,500))):
    for t in F2[::1]:
        q=P2[t];dr.polygon([(off+250+v[ax]*240,250-v[1]*240) for v in q],outline=(60,60,60))
im.save(out.replace('.npz','.png'))
