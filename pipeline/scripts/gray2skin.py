"""A gray mannequin under a hairstyle -> skin-coloured, so the hair fitter (which looks for skin) can find the head and ears.  gray2skin.py in.glb out.glb"""
import json,struct,sys,io,numpy as np
sys.path.append('/home/claude/pylib')
from PIL import Image
d=open(sys.argv[1],'rb').read();L=struct.unpack('<I',d[12:16])[0];J=json.loads(d[20:20+L]);B=bytearray(d[20+L+8:])
im=J['images'][J['textures'][J['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']];bv=J['bufferViews'][im['bufferView']]
T=np.array(Image.open(io.BytesIO(bytes(B[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']]))).convert('RGB')).astype(int)
lum=T.mean(2);sat=T.max(2)-T.min(2);g=(lum>95)&(sat<28);T[g]=(np.array([239,184,146])[None,:]*(lum[g][:,None]/max(1,np.median(lum[g])))).clip(0,255);print('gray texels recoloured %.0f%%'%(100*g.mean()))
buf=io.BytesIO();Image.fromarray(T.astype(np.uint8)).save(buf,'PNG');ib=buf.getvalue()
while len(B)%4:B.append(0)
J['bufferViews'].append({'buffer':0,'byteOffset':len(B),'byteLength':len(ib)});B.extend(ib)
while len(B)%4:B.append(0)
im['bufferView']=len(J['bufferViews'])-1;im['mimeType']='image/png';J['buffers']=[{'byteLength':len(B)}]
js=json.dumps(J,separators=(',',':')).encode()
while len(js)%4:js+=b' '
open(sys.argv[2],'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(B))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(B),0x004E4942)+bytes(B))
