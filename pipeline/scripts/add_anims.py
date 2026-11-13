import json,struct,re,sys
src,clips,dst=sys.argv[1:4]
d=open(src,'rb').read();L=struct.unpack('<I',d[12:16])[0];J=json.loads(d[20:20+L]);BIN=bytearray(d[20+L+8:20+L+8+struct.unpack('<I',d[20+L:24+L])[0]])
san=lambda n:re.sub(r'[\[\]\.:/]','',re.sub(r'\s','_',n));byname={san(n.get('name','')):i for i,n in enumerate(J['nodes'])}
def add(data,typ,count,mn=None,mx=None):
    while len(BIN)%4:BIN.append(0)
    off=len(BIN);BIN.extend(data);J['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(data)})
    a={'bufferView':len(J['bufferViews'])-1,'componentType':5126,'type':typ,'count':count}
    if mn is not None:a['min']=mn;a['max']=mx
    J['accessors'].append(a);return len(J['accessors'])-1
C=json.load(open(clips));names=set(C)
J['animations']=[a for a in J.get('animations',[]) if a.get('name') not in names]
for nm,tracks in C.items():
    an={'name':nm,'channels':[],'samplers':[]};times=tracks[0]['times']
    ti=add(struct.pack('<%df'%len(times),*times),'SCALAR',len(times),[min(times)],[max(times)])
    for t in tracks:
        node,prop=t['name'].rsplit('.',1);q=prop=='quaternion'
        o=add(struct.pack('<%df'%len(t['values']),*t['values']),'VEC4' if q else 'VEC3',len(times))
        an['samplers'].append({'input':ti,'output':o,'interpolation':'LINEAR'})
        an['channels'].append({'sampler':len(an['samplers'])-1,'target':{'node':byname[node],'path':'rotation' if q else 'translation'}})
    J['animations'].append(an)
J['buffers'][0]['byteLength']=len(BIN)
while len(BIN)%4:BIN.append(0)
js=json.dumps(J,separators=(',',':')).encode()
while len(js)%4:js+=b' '
open(dst,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(BIN))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(BIN),0x004E4942)+bytes(BIN))
print(dst,round((28+len(js)+len(BIN))/1e6,2),'MB',[a['name'] for a in J['animations']])
