"""Paint out the base body's painted eyes, brows and lips (inpainting from the surrounding skin) so the face selector's
drawn features sit on clean skin. Writes the new base colour texture into the GLB."""
import json, struct, io, sys, numpy as np, cv2
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
M = 0.0175                                      # her face's midline (the nose tip)
d = open(SRC, 'rb').read(); L = struct.unpack('<I', d[12:16])[0]; o = 20 + L
J = json.loads(d[20:20 + L]); B = bytearray(d[o + 8:o + 8 + struct.unpack('<I', d[o:o + 4])[0]])
pr = J['meshes'][0]['primitives'][0]


def acc(i, n, dt=np.float32):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(bytes(B), dt, a['count'] * n, bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], n)


P = acc(pr['attributes']['POSITION'], 3); UV = acc(pr['attributes']['TEXCOORD_0'], 2); F = acc(pr['indices'], 1, np.uint32).reshape(-1, 3)
img_i = J['textures'][J['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
bv = J['bufferViews'][J['images'][img_i]['bufferView']]
tex = np.array(Image.open(io.BytesIO(bytes(B[bv['byteOffset']:bv['byteOffset'] + bv['byteLength']]))).convert('RGB'))
H, W = tex.shape[:2]
# the face's triangles, drawn into texture space
import os
RG = [float(v) for v in os.environ.get('FACERG', '0.0175,1.37,1.61,0.0,0.15').split(',')]; M = RG[0]
face = (P[:, 1] > RG[1]) & (P[:, 1] < RG[2]) & (P[:, 2] > RG[3]) & (np.abs(P[:, 0] - M) < RG[4])
region = np.zeros((H, W), np.uint8)
for t in F:
    if face[t].any():
        pts = np.round(np.c_[UV[t, 0] * W, UV[t, 1] * H]).astype(np.int32)
        cv2.fillConvexPoly(region, pts, 1)
region = cv2.dilate(region, np.ones((5, 5), np.uint8))
skin = np.median(tex[region > 0].reshape(-1, 3), 0)
dist = np.abs(tex.astype(int) - skin).sum(2)
feat = ((dist > float(os.environ.get('FACETH', '45'))) & (region > 0)).astype(np.uint8)
feat = cv2.morphologyEx(feat, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
feat = cv2.dilate(feat, np.ones((7, 7), np.uint8))
print('skin', skin, 'feature texels', int(feat.sum()), 'of face', int(region.sum()))
work = tex.copy(); work[region == 0] = skin.astype(np.uint8)          # gaps between texture islands would bleed in dark
clean = cv2.inpaint(work[:, :, ::-1].copy(), feat * 255, 9, cv2.INPAINT_TELEA)[:, :, ::-1]
clean = np.where((feat > 0)[:, :, None], clean, tex)
clean = np.where(feat[:, :, None] > 0, cv2.GaussianBlur(clean, (9, 9), 0), clean)   # no streaks in the filled skin
if os.environ.get('FLAT'):   # even the whole front of the face to one skin colour (no baked socket or lip shading left to show beside the drawn features), feathered in 3D
    fx, fy0, fy1, fz = [float(v) for v in os.environ['FLAT'].split(',')]
    sm = lambda t: np.clip(t, 0, 1) ** 2 * (3 - 2 * np.clip(t, 0, 1))
    wv = sm((fx + 0.03 - np.abs(P[:, 0] - M)) / 0.03) * sm((P[:, 1] - fy0) / 0.025) * sm((fy1 + 0.025 - P[:, 1]) / 0.025) * sm((P[:, 2] - fz) / 0.03)
    wm = np.zeros((H, W), np.float32)
    for t in F:
        if wv[t].max() <= 0: continue
        pts = np.c_[UV[t, 0] * W, UV[t, 1] * H]; x0, y0 = np.floor(pts.min(0)).astype(int) - 1; x1, y1 = np.ceil(pts.max(0)).astype(int) + 1
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W - 1), min(y1, H - 1)
        if x1 < x0 or y1 < y0: continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        v0, v1 = pts[1] - pts[0], pts[2] - pts[0]; den = v0[0] * v1[1] - v1[0] * v0[1]
        if abs(den) < 1e-9: continue
        b1 = ((gx - pts[0, 0]) * v1[1] - v1[0] * (gy - pts[0, 1])) / den; b2 = (v0[0] * (gy - pts[0, 1]) - (gx - pts[0, 0]) * v0[1]) / den; b0 = 1 - b1 - b2
        ins = (b0 >= -0.6) & (b1 >= -0.6) & (b2 >= -0.6)                     # a little past the edges, so island seams are covered
        val = np.clip(b0, 0, 1) * wv[t[0]] + np.clip(b1, 0, 1) * wv[t[1]] + np.clip(b2, 0, 1) * wv[t[2]]
        sub = wm[y0:y1 + 1, x0:x1 + 1]; sub[ins] = np.maximum(sub[ins], np.clip(val, 0, 1)[ins])
    core = clean[wm > 0.9].reshape(-1, 3); flat = np.median(core, 0)
    clean = (clean * (1 - wm[:, :, None]) + flat * wm[:, :, None]).astype(np.uint8)
    print('flattened texels', int((wm > 0.5).sum()), 'to', flat)
Image.fromarray(clean).save(OUT + '.tex.png')
buf = io.BytesIO(); Image.fromarray(clean).save(buf, 'JPEG', quality=90); data = buf.getvalue()
while len(B) % 4: B.append(0)
off = len(B); B.extend(data); J['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
J['images'][img_i]['bufferView'] = len(J['bufferViews']) - 1     # (the old texture's bytes stay unused; the sparse pass drops them)
J['buffers'][0]['byteLength'] = len(B)
while len(B) % 4: B.append(0)
js = json.dumps(J, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
open(OUT, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(B)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(B), 0x004E4942) + bytes(B))
print(OUT)
