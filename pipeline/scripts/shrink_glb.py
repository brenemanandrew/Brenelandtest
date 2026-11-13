"""Repack a GLB: base colour and normal textures as JPEG, metallic-roughness dropped (the editor does not use it)."""
import io, json, struct, sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
NORMAL_SIZE = int(sys.argv[3]) if len(sys.argv) > 3 else 1024

d = open(src, 'rb').read()
L = struct.unpack('<I', d[12:16])[0]
J = json.loads(d[20:20 + L])
B = d[20 + L + 8:]

mat = J['materials'][0]
pbr = mat.get('pbrMetallicRoughness', {})
pbr.pop('metallicRoughnessTexture', None)
keep_tex = {'base': pbr['baseColorTexture']['index'], 'normal': mat.get('normalTexture', {}).get('index')}

new_bin = bytearray()
new_views = []
remap = {}


def push(data):
    while len(new_bin) % 4:
        new_bin.append(0)
    off = len(new_bin)
    new_bin.extend(data)
    return off


img_views = {im['bufferView'] for im in J['images']}
for i, bv in enumerate(J['bufferViews']):
    if i in img_views:
        continue
    o = bv.get('byteOffset', 0)
    nb = dict(bv)
    nb['byteOffset'] = push(B[o:o + bv['byteLength']])
    remap[i] = len(new_views)
    new_views.append(nb)
for a in J['accessors']:
    if 'bufferView' in a:
        a['bufferView'] = remap[a['bufferView']]

images, textures = [], []
for role, ti in (('base', keep_tex['base']), ('normal', keep_tex['normal'])):
    if ti is None:
        continue
    im = J['images'][J['textures'][ti]['source']]
    bv = J['bufferViews'][im['bufferView']]
    o = bv.get('byteOffset', 0)
    I = Image.open(io.BytesIO(B[o:o + bv['byteLength']])).convert('RGB')
    if role == 'normal' and I.size[0] > NORMAL_SIZE:
        I = I.resize((NORMAL_SIZE, NORMAL_SIZE), Image.LANCZOS)
    buf = io.BytesIO()
    I.save(buf, 'JPEG', quality=88 if role == 'base' else 90)
    off = push(buf.getvalue())
    new_views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(buf.getvalue())})
    images.append({'bufferView': len(new_views) - 1, 'mimeType': 'image/jpeg', 'name': role})
    textures.append({'source': len(images) - 1, 'sampler': J['textures'][ti].get('sampler', 0)})
    if role == 'base':
        pbr['baseColorTexture']['index'] = len(textures) - 1
    else:
        mat['normalTexture']['index'] = len(textures) - 1

J['images'], J['textures'], J['bufferViews'] = images, textures, new_views
while len(new_bin) % 4:
    new_bin.append(0)
J['buffers'] = [{'byteLength': len(new_bin)}]
js = json.dumps(J, separators=(',', ':')).encode()
while len(js) % 4:
    js += b' '
total = 12 + 8 + len(js) + 8 + len(new_bin)
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js +
                      struct.pack('<II', len(new_bin), 0x004E4942) + bytes(new_bin))
print(dst, round(total / 1e6, 2), 'MB')
