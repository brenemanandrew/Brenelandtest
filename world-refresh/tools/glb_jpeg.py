"""Re-pack every PNG texture inside a GLB as JPEG (quality 85): the same model at a fraction of the download.
Usage: python3 glb_jpeg.py FILE.glb [...]   (rewrites in place)"""
import sys, json, struct, io
from PIL import Image
def pad(b, c=b'\x00'): return b + c * ((4 - len(b) % 4) % 4)
def run(path):
    d = open(path, 'rb').read(); n = struct.unpack('<I', d[12:16])[0]; J = json.loads(d[20:20 + n])
    bin0 = 20 + n; ln = struct.unpack('<I', d[bin0:bin0 + 4])[0]; B = d[bin0 + 8:bin0 + 8 + ln]
    views = J['bufferViews']; repl = {}
    for img in J.get('images', []):
        if img.get('mimeType') == 'image/png' and 'bufferView' in img:
            v = views[img['bufferView']]; raw = B[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
            o = io.BytesIO(); Image.open(io.BytesIO(raw)).convert('RGB').save(o, 'JPEG', quality=85); repl[img['bufferView']] = o.getvalue(); img['mimeType'] = 'image/jpeg'
    if not repl: return
    nb = b''
    for i, v in enumerate(views):
        chunk = repl.get(i, B[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])
        nb = pad(nb); v['byteOffset'] = len(nb); v['byteLength'] = len(chunk); nb += chunk
    nb = pad(nb); J['buffers'][0]['byteLength'] = len(nb)
    js = pad(json.dumps(J).encode(), b' ')
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(nb)) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(nb)) + b'BIN\x00' + nb
    open(path, 'wb').write(out)
if __name__ == '__main__':
    for p in sys.argv[1:]: run(p)
