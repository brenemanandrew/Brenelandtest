"""Store rotation animation keys as normalized int16 instead of float32 (halves clip size)."""
import json,struct,sys,numpy as np
src,dst=sys.argv[1],sys.argv[2]
d=open(src,'rb').read();L=struct.unpack('<I',d[12:16])[0];o=20+L;J=json.loads(d[20:o]);B=d[o+8:o+8+struct.unpack('<I',d[o:o+4])[0]]
outs=set()
for an in J.get('animations',[]):
    for ch in an['channels']:
        if ch['target']['path']=='rotation':outs.add(an['samplers'][ch['sampler']]['output'])
other=set(range(len(J['accessors'])))-outs
shared=set(J['accessors'][i].get('bufferView') for i in other)
out=bytearray(B)
while len(out)%4:out.append(0)
n=0
for i in sorted(outs):
    a=J['accessors'][i]
    if a['componentType']!=5126 or 'bufferView' not in a:continue
    bv=J['bufferViews'][a['bufferView']];off=bv.get('byteOffset',0)+a.get('byteOffset',0)
    q=np.frombuffer(B[off:off+a['count']*16],np.float32).reshape(-1,4)
    q16=np.round(np.clip(q,-1,1)*32767).astype(np.int16)
    J['bufferViews'].append({'buffer':0,'byteOffset':len(out),'byteLength':q16.nbytes});out.extend(q16.tobytes())
    while len(out)%4:out.append(0)
    a['bufferView']=len(J['bufferViews'])-1;a.pop('byteOffset',None);a['componentType']=5122;a['normalized']=True;a.pop('min',None);a.pop('max',None);n+=1
J['buffers']=[{'byteLength':len(out)}]
js=json.dumps(J,separators=(',',':')).encode()
while len(js)%4:js+=b' '
open(dst,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(out))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(out),0x004E4942)+bytes(out))
print(dst,n,'%.2f MB'%((28+len(js)+len(out))/1e6))
