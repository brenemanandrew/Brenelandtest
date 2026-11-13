import json,struct,io,sys
from PIL import Image
src,dst=sys.argv[1],sys.argv[2]
d=open(src,'rb').read();L=struct.unpack('<I',d[12:16])[0];J=json.loads(d[20:20+L]);B=d[20+L+8:]
mat=J['materials'][0];nt=mat.get('normalTexture',{}).get('index');normimg=J['textures'][nt]['source'] if nt is not None else -1
imgviews={im['bufferView']:k for k,im in enumerate(J['images'])}
out=bytearray();views=[]
for i,bv in enumerate(J['bufferViews']):
    o=bv.get('byteOffset',0);data=B[o:o+bv['byteLength']]
    if i in imgviews:
        k=imgviews[i];I=Image.open(io.BytesIO(data)).convert('RGB');S=1024 if k==normimg else 2048
        if I.size[0]>S:I=I.resize((S,S),Image.LANCZOS)
        b=io.BytesIO();I.save(b,'JPEG',quality=85);data=b.getvalue();J['images'][k]['mimeType']='image/jpeg';print('image',k,I.size,len(data))
    while len(out)%4:out.append(0)
    nb=dict(bv);nb['byteOffset']=len(out);nb['byteLength']=len(data);out.extend(data);views.append(nb)
J['bufferViews']=views
while len(out)%4:out.append(0)
J['buffers']=[{'byteLength':len(out)}]
js=json.dumps(J,separators=(',',':')).encode()
while len(js)%4:js+=b' '
open(dst,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(out))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(out),0x004E4942)+bytes(out))
print(dst,len(out)/1e6)
