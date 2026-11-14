"""Cut the extra bits Meshy added (Andrew's picks). Writes models/trimmed/<name>.glb.
Rules are by height (fraction of the model's height from the bottom) and colour sampled from the texture."""
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); import meshlib as L
OUT = 'models/trimmed'; os.makedirs(OUT, exist_ok=True)
def near(rgb, col, d): return np.linalg.norm(rgb - np.array(col, float), axis=1) < d
def run(src, name, rule):
    m = L.load(src); c = m.triangles_center; rgb = L.face_rgb(m)
    y = c[:, 1]; y0, y1 = y.min(), y.max(); f = (y - y0) / (y1 - y0)
    vy = m.vertices[m.faces][:, :, 1].max(1); fmax = (vy - y0) / (y1 - y0)
    r = np.hypot(c[:, 0], c[:, 2])
    cut = rule(f=f, fmax=fmax, rgb=rgb, r=r)
    out = L.keep(m, ~cut); out.export(f'{OUT}/{name}.glb')
    print(f'{name}: removed {cut.sum()} of {len(cut)} faces')
M = 'models/01-plants-trees/'
run(M + 'birch.glb', 'birch', lambda f, fmax, rgb, r: (fmax < 0.012))                                   # flat grass disc at the foot
run(M + 'wave2/fern.glb', 'fern', lambda f, fmax, rgb, r: (f < 0.25) & near(rgb, (50, 67, 63), 40))     # dark rock base
run(M + 'v2/tomato_plants.glb', 'tomato_plants', lambda f, fmax, rgb, r: (fmax < 0.22) | ((f < 0.32) & near(rgb, (107, 96, 66), 32)))  # soil block and the bits left on it
run('models/03-large-props/firepit_circle.glb', 'firepit_circle',
    lambda f, fmax, rgb, r: (f > 0.25) & (rgb[:, 0] > 170) & (rgb[:, 0] - rgb[:, 2] > 90))                           # flames
