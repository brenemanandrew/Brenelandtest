"""Read (and write) the game's baked MPFB characters (breneland-live/models/mpfb/ID.json + .bin, baked-character.js)."""
import json, numpy as np, os
T = {'float32': np.float32, 'uint8': np.uint8, 'uint16': np.uint16, 'uint32': np.uint32, 'int16': np.int16}
def sec(buf, s): return np.frombuffer(buf, dtype=T[s['type']], count=s['n'], offset=s['off']).copy()
def load(path_json):
    J = json.load(open(path_json)); buf = open(os.path.join(os.path.dirname(path_json), J['bin']), 'rb').read()
    def mesh(M):
        d = {k: sec(buf, M[k]) for k in ('pos', 'nor', 'uv', 'fuv', 'si', 'sw') if k in M}
        if 'ink' in M: d['ink'] = sec(buf, M['ink'])
        d['groups'] = {g: sec(buf, s) for g, s in M['groups'].items()}
        d['inkGroups'] = {g: sec(buf, s) for g, s in M.get('inkGroups', {}).items()}
        d['morphs'] = {n: (sec(buf, m['idx']), sec(buf, m['d'])) for n, m in M.get('morphs', {}).items()}
        d['verts'] = M['verts']; return d
    return J, buf, mesh(J['mesh']), mesh(J['lod'])
