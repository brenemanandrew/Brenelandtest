"""Helpers: load a Meshy GLB as one textured trimesh, per-face colour and centroid."""
import numpy as np, trimesh
def load(path):
    sc = trimesh.load(path, force='scene')
    geoms = list(sc.dump()) if hasattr(sc, 'dump') else [sc]
    m = geoms[0] if len(geoms) == 1 else trimesh.util.concatenate(geoms)
    return m
def face_rgb(m):
    v = m.visual
    tex = np.asarray(v.material.baseColorTexture.convert('RGB')) if getattr(v.material, 'baseColorTexture', None) is not None else None
    uv = v.uv[m.faces].mean(1)
    h, w = tex.shape[:2]
    x = np.clip((uv[:, 0] % 1) * (w - 1), 0, w - 1).astype(int); y = np.clip((1 - uv[:, 1] % 1) * (h - 1), 0, h - 1).astype(int)
    return tex[y, x].astype(float)
def keep(m, mask):
    m = m.copy(); m.update_faces(mask); m.remove_unreferenced_vertices(); return m
def flat_colours(v, f, rgb_face, k=4, smooth=6, seed=0):
    """A few clean flat colours per model: cluster the per-face colours, then let each face take its neighbours' majority
    (merges Meshy's painted brush strokes into solid areas). Returns one colour per face."""
    import numpy as np, trimesh
    from scipy.cluster.vq import kmeans2
    cent, lab = kmeans2(rgb_face.astype(float), k, seed=np.random.default_rng(seed), minit='++')
    adj = trimesh.Trimesh(v, f, process=True).face_adjacency
    for _ in range(smooth):
        votes = np.zeros((len(f), k))
        for a, b in ((adj[:, 0], adj[:, 1]), (adj[:, 1], adj[:, 0])): np.add.at(votes, (a, lab[b]), 1)
        votes[np.arange(len(f)), lab] += 1.5
        lab = votes.argmax(1)
    return cent[lab]
