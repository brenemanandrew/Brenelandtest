"""Rewrite a GLB with its morph targets stored sparse (only the vertices a shape moves) and drop unused buffer data."""
import json, struct, sys, numpy as np
src, dst = sys.argv[1], sys.argv[2]
d = open(src, 'rb').read(); L = struct.unpack('<I', d[12:16])[0]; o = 20 + L
J = json.loads(d[20:20 + L]); B = d[o + 8:o + 8 + struct.unpack('<I', d[o:o + 4])[0]]
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}; SZ = {5126: 4, 5125: 4, 5123: 2, 5122: 2, 5121: 1, 5120: 1}
# drop accessors nothing refers to (replaced clips leave theirs behind)
used = set()
for me in J['meshes']:
    for p in me['primitives']:
        used.update(p['attributes'].values()); used.add(p['indices']) if 'indices' in p else None
        for t in p.get('targets', []): used.update(t.values())
for sk in J.get('skins', []):
    if 'inverseBindMatrices' in sk: used.add(sk['inverseBindMatrices'])
for an in J.get('animations', []):
    for sm in an['samplers']: used.update((sm['input'], sm['output']))
order = sorted(used); amap = {o: n for n, o in enumerate(order)}; J['accessors'] = [J['accessors'][o] for o in order]
for me in J['meshes']:
    for p in me['primitives']:
        p['attributes'] = {k: amap[v] for k, v in p['attributes'].items()}
        if 'indices' in p: p['indices'] = amap[p['indices']]
        if 'targets' in p: p['targets'] = [{k: amap[v] for k, v in t.items()} for t in p['targets']]
for sk in J.get('skins', []):
    if 'inverseBindMatrices' in sk: sk['inverseBindMatrices'] = amap[sk['inverseBindMatrices']]
for an in J.get('animations', []):
    for sm in an['samplers']: sm['input'], sm['output'] = amap[sm['input']], amap[sm['output']]
target_acc = set()
for me in J['meshes']:
    for p in me['primitives']:
        for t in p.get('targets', []): target_acc.update(t.values())
out = bytearray(); views = []
def push(data, target=None):
    while len(out) % 4: out.append(0)
    off = len(out); out.extend(data); v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target: v['target'] = target
    views.append(v); return len(views) - 1
vmap = {}
for i, a in enumerate(J['accessors']):
    if 'bufferView' not in a:
        sp = a.get('sparse')
        if sp:
            for part, w in (('indices', SZ[sp['indices']['componentType']]), ('values', 12)):
                v0 = J['bufferViews'][sp[part]['bufferView']]; o0 = v0.get('byteOffset', 0) + sp[part].get('byteOffset', 0)
                sp[part]['bufferView'] = push(B[o0:o0 + sp['count'] * w]); sp[part].pop('byteOffset', None)
        continue
    bv = J['bufferViews'][a['bufferView']]; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); n = a['count'] * NC[a['type']] * SZ[a['componentType']]
    raw = B[off:off + n]
    if i in target_acc:
        arr = np.frombuffer(raw, np.float32).reshape(a['count'], 3); idx = np.where(np.abs(arr).max(1) > 1e-6)[0].astype(np.uint32)
        a.pop('bufferView'); a.pop('byteOffset', None)
        a['sparse'] = {'count': int(len(idx)), 'indices': {'bufferView': push(idx.tobytes()), 'componentType': 5125}, 'values': {'bufferView': push(arr[idx].astype(np.float32).tobytes())}}
        if len(idx) == 0: a['sparse']['count'] = 0
    elif 'images' in J and any(im.get('bufferView') == a['bufferView'] for im in J['images']):
        pass
    else:
        if 'byteStride' in bv:
            if a['bufferView'] not in vmap: vmap[a['bufferView']] = push(B[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']], bv.get('target'))
            views[vmap[a['bufferView']]]['byteStride'] = bv['byteStride']; a['bufferView'] = vmap[a['bufferView']]
        else:
            key = (a['bufferView'], off, n)
            if key not in vmap: vmap[key] = push(raw, bv.get('target'))
            a['bufferView'] = vmap[key]; a.pop('byteOffset', None)
for im in J.get('images', []):
    bv = J['bufferViews'][im['bufferView']]; im['bufferView'] = push(B[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])
J['bufferViews'] = views
while len(out) % 4: out.append(0)
J['buffers'] = [{'byteLength': len(out)}]
js = json.dumps(J, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(out)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out))
print(dst, '%.2f MB' % ((28 + len(js) + len(out)) / 1e6))
