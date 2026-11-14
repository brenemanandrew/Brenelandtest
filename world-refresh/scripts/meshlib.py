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
