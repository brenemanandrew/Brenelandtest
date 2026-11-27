// What can be placed in a room, shared by the game (places.js) and the Studio's map editor (dev.html).
// A placed thing: { id, kind, x, z, y (lift off the floor), rot (radians, about up), sx, sy, sz (scale), color, solid }
// CATALOG[kind] = { name, group, size [w, h, d] in metres at scale 1, parts: [[shape, w, h, d, x, y, z, colour], ...] }
// A part's colour is a fixed colour, or 'c' for the thing's own colour, 'c2' for a darker shade of it.
import { PROPS, kit } from './props.js';
const P = (name, group, size, parts, color = '#8a5a34') => ({ name, group, size, parts, color });
export const CATALOG = {
  // plain shapes
  box: P('Box', 'Shapes', [1, 1, 1], [['box', 1, 1, 1, 0, 0.5, 0, 'c']], '#9a8fb3'),
  slab: P('Slab', 'Shapes', [1, 0.1, 1], [['box', 1, 0.1, 1, 0, 0.05, 0, 'c']], '#9a8fb3'),
  wall: P('Wall piece', 'Shapes', [2, 2.4, 0.12], [['box', 2, 2.4, 0.12, 0, 1.2, 0, 'c']], '#d9cfe6'),
  cylinder: P('Cylinder', 'Shapes', [1, 1, 1], [['cyl', 0.5, 1, 0.5, 0, 0.5, 0, 'c']], '#9a8fb3'),
  sphere: P('Ball', 'Shapes', [1, 1, 1], [['ball', 0.5, 0, 0, 0, 0.5, 0, 'c']], '#9a8fb3'),
  cone: P('Cone', 'Shapes', [1, 1, 1], [['cone', 0.5, 1, 0, 0, 0.5, 0, 'c']], '#9a8fb3'),
  // furniture
  chair: P('Chair', 'Furniture', [0.5, 0.95, 0.5], [['box', 0.5, 0.06, 0.5, 0, 0.46, 0, 'c'], ['box', 0.5, 0.5, 0.06, 0, 0.72, -0.22, 'c'], ['box', 0.05, 0.44, 0.05, -0.21, 0.22, -0.21, 'c2'], ['box', 0.05, 0.44, 0.05, 0.21, 0.22, -0.21, 'c2'], ['box', 0.05, 0.44, 0.05, -0.21, 0.22, 0.21, 'c2'], ['box', 0.05, 0.44, 0.05, 0.21, 0.22, 0.21, 'c2']]),
  armchair: P('Armchair', 'Furniture', [0.86, 0.95, 0.8], [['box', 0.86, 0.4, 0.8, 0, 0.2, 0, 'c2'], ['box', 0.62, 0.14, 0.6, 0, 0.47, 0.06, 'c'], ['box', 0.86, 0.6, 0.16, 0, 0.66, -0.32, 'c'], ['box', 0.13, 0.28, 0.7, -0.37, 0.54, 0.02, 'c'], ['box', 0.13, 0.28, 0.7, 0.37, 0.54, 0.02, 'c']], '#5b3570'),
  sofa: P('Sofa', 'Furniture', [2.0, 0.9, 0.85], [['box', 2.0, 0.38, 0.85, 0, 0.19, 0, 'c2'], ['box', 1.7, 0.14, 0.62, 0, 0.45, 0.08, 'c'], ['box', 2.0, 0.56, 0.18, 0, 0.62, -0.33, 'c'], ['box', 0.15, 0.28, 0.8, -0.92, 0.52, 0.02, 'c'], ['box', 0.15, 0.28, 0.8, 0.92, 0.52, 0.02, 'c']], '#4a82a6'),
  stool: P('Stool', 'Furniture', [0.4, 0.5, 0.4], [['cyl', 0.2, 0.06, 0.2, 0, 0.47, 0, 'c'], ['cyl', 0.03, 0.44, 0.03, 0, 0.22, 0, 'c2']]),
  table: P('Table', 'Furniture', [1.2, 0.75, 0.7], [['box', 1.2, 0.06, 0.7, 0, 0.72, 0, 'c'], ['box', 0.06, 0.69, 0.06, -0.54, 0.345, -0.29, 'c2'], ['box', 0.06, 0.69, 0.06, 0.54, 0.345, -0.29, 'c2'], ['box', 0.06, 0.69, 0.06, -0.54, 0.345, 0.29, 'c2'], ['box', 0.06, 0.69, 0.06, 0.54, 0.345, 0.29, 'c2']]),
  lowtable: P('Coffee table', 'Furniture', [1.0, 0.4, 0.55], [['box', 1.0, 0.06, 0.55, 0, 0.37, 0, 'c'], ['box', 0.06, 0.34, 0.06, -0.44, 0.17, -0.22, 'c2'], ['box', 0.06, 0.34, 0.06, 0.44, 0.17, -0.22, 'c2'], ['box', 0.06, 0.34, 0.06, -0.44, 0.17, 0.22, 'c2'], ['box', 0.06, 0.34, 0.06, 0.44, 0.17, 0.22, 'c2']]),
  roundtable: P('Round table', 'Furniture', [1.1, 0.76, 1.1], [['cyl', 0.55, 0.05, 0.55, 0, 0.735, 0, 'c'], ['cyl', 0.06, 0.71, 0.16, 0, 0.355, 0, 'c2']]),
  bed: P('Bed', 'Furniture', [1.0, 0.9, 2.0], [['box', 1.0, 0.3, 2.0, 0, 0.15, 0, 'c2'], ['box', 0.96, 0.2, 1.96, 0, 0.4, 0, '#e8e0f0'], ['box', 0.98, 0.08, 1.3, 0, 0.52, 0.32, 'c'], ['box', 1.0, 0.75, 0.08, 0, 0.52, -1.0, 'c2'], ['box', 0.6, 0.12, 0.36, 0, 0.56, -0.72, '#f6f1fa']], '#4b2a6b'),
  shelf: P('Bookshelf', 'Furniture', [0.9, 1.7, 0.3], [['box', 0.9, 1.7, 0.04, 0, 0.85, -0.13, 'c2'], ['box', 0.04, 1.7, 0.3, -0.43, 0.85, 0, 'c'], ['box', 0.04, 1.7, 0.3, 0.43, 0.85, 0, 'c'], ['box', 0.9, 0.04, 0.3, 0, 0.05, 0, 'c'], ['box', 0.9, 0.04, 0.3, 0, 0.46, 0, 'c'], ['box', 0.9, 0.04, 0.3, 0, 0.87, 0, 'c'], ['box', 0.9, 0.04, 0.3, 0, 1.28, 0, 'c'], ['box', 0.9, 0.04, 0.3, 0, 1.68, 0, 'c'],
    ['box', 0.5, 0.28, 0.2, -0.12, 0.21, 0, '#7a1f3a'], ['box', 0.6, 0.3, 0.2, 0.06, 0.63, 0, '#2f4a7a'], ['box', 0.44, 0.27, 0.2, -0.16, 1.03, 0, '#3d6b4f'], ['box', 0.56, 0.29, 0.2, 0.1, 1.44, 0, '#8a6a2a']]),
  counter: P('Counter', 'Furniture', [1.4, 0.94, 0.55], [['box', 1.4, 0.9, 0.5, 0, 0.45, 0, 'c'], ['box', 1.46, 0.05, 0.56, 0, 0.925, 0, 'c2']], '#f7f3ea'),
  desk: P('Desk', 'Furniture', [1.3, 0.77, 0.6], [['box', 1.3, 0.05, 0.6, 0, 0.74, 0, 'c'], ['box', 0.05, 0.72, 0.5, -0.6, 0.36, 0, 'c2'], ['box', 0.05, 0.72, 0.5, 0.6, 0.36, 0, 'c2'], ['box', 0.36, 0.02, 0.25, 0, 0.78, 0, '#2b2b33'], ['box', 0.36, 0.24, 0.02, 0, 0.9, 0.13, '#2b2b33']]),
  tv: P('TV on a stand', 'Furniture', [1.7, 1.45, 0.42], [['box', 1.7, 0.5, 0.42, 0, 0.25, 0, 'c'], ['box', 1.45, 0.84, 0.07, 0, 1.02, 0, '#1b1b22'], ['box', 1.36, 0.75, 0.02, 0, 1.02, 0.04, '#3a4a6a']]),
  crate: P('Crate', 'Furniture', [0.5, 0.5, 0.5], [['box', 0.5, 0.5, 0.5, 0, 0.25, 0, 'c'], ['box', 0.52, 0.06, 0.52, 0, 0.03, 0, 'c2'], ['box', 0.52, 0.06, 0.52, 0, 0.47, 0, 'c2']], '#b08a4a'),
  fridge: P('Fridge', 'Furniture', [0.7, 1.75, 0.66], [['box', 0.7, 1.75, 0.66, 0, 0.875, 0, 'c'], ['box', 0.03, 0.5, 0.03, -0.26, 1.2, 0.34, '#9aa3ad']], '#dfe6ea'),
  // decoration
  plant: P('Plant', 'Decor', [0.5, 1.0, 0.5], [['cyl', 0.16, 0.26, 0.12, 0, 0.13, 0, '#c9744f'], ['ball', 0.2, 0, 0, 0, 0.6, 0, 'c'], ['ball', 0.15, 0, 0, 0.12, 0.46, 0.05, 'c'], ['ball', 0.16, 0, 0, -0.11, 0.5, -0.06, 'c'], ['ball', 0.13, 0, 0, 0.02, 0.8, 0.03, 'c']], '#3f9a5a'),
  tree: P('Indoor tree', 'Decor', [0.9, 2.0, 0.9], [['cyl', 0.2, 0.3, 0.16, 0, 0.15, 0, '#c9744f'], ['cyl', 0.05, 1.0, 0.06, 0, 0.8, 0, '#6b4a35'], ['ball', 0.42, 0, 0, 0, 1.55, 0, 'c'], ['ball', 0.3, 0, 0, 0.24, 1.3, 0.1, 'c'], ['ball', 0.3, 0, 0, -0.22, 1.36, -0.1, 'c']], '#3f8f52'),
  lamp: P('Floor lamp', 'Decor', [0.4, 1.7, 0.4], [['box', 0.3, 0.03, 0.3, 0, 0.015, 0, 'c2'], ['cyl', 0.018, 1.5, 0.018, 0, 0.77, 0, 'c2'], ['glow', 0.12, 0.26, 0.2, 0, 1.6, 0, '#ffe2ad']], '#3a3044'),
  rug: P('Rug', 'Decor', [2.0, 0.02, 1.4], [['box', 2.0, 0.012, 1.4, 0, 0.008, 0, 'c2'], ['box', 1.76, 0.014, 1.16, 0, 0.012, 0, 'c']], '#d9534f'),
  roundrug: P('Round rug', 'Decor', [1.8, 0.02, 1.8], [['cyl', 0.9, 0.014, 0.9, 0, 0.008, 0, 'c']], '#7b4fd1'),
  artwork: P('Artwork', 'Decor', [0.9, 0.9, 0.08], [], '#2b2118'),   /* a real picture in a frame: the item carries img (a file in /art), aw and ah (its size in metres), title, by, date, about. With stand: true it sits on a plinth instead of hanging */
  picture: P('Picture', 'Decor', [0.8, 0.6, 0.05], [['box', 0.8, 0.6, 0.03, 0, 0.3, 0, 'c2'], ['box', 0.7, 0.5, 0.035, 0, 0.3, 0.004, 'c']], '#7fd0ff'),
  pillar: P('Pillar', 'Decor', [0.4, 2.5, 0.4], [['cyl', 0.2, 2.5, 0.2, 0, 1.25, 0, 'c'], ['box', 0.5, 0.1, 0.5, 0, 0.05, 0, 'c2'], ['box', 0.5, 0.1, 0.5, 0, 2.45, 0, 'c2']], '#e9e2cf'),
  cushion: P('Cushion', 'Decor', [0.4, 0.14, 0.4], [['box', 0.4, 0.14, 0.4, 0, 0.07, 0, 'c']], '#ffd166'),
  bookstack: P('Stack of books', 'Decor', [0.3, 0.2, 0.22], [['box', 0.3, 0.06, 0.22, 0, 0.03, 0, '#7a1f3a'], ['box', 0.27, 0.06, 0.2, 0.01, 0.09, 0, '#2f4a7a'], ['box', 0.29, 0.06, 0.21, -0.01, 0.15, 0.01, 'c']], '#3d6b4f'),
  candle: P('Candle', 'Decor', [0.1, 0.25, 0.1], [['cyl', 0.04, 0.18, 0.04, 0, 0.09, 0, 'c'], ['glow', 0.02, 0.06, 0.005, 0, 0.21, 0, '#ffd98a']], '#f3ead8'),
  arcade: P('Arcade cabinet', 'Decor', [0.7, 1.8, 0.75], [['box', 0.7, 1.8, 0.7, 0, 0.9, -0.02, 'c'], ['box', 0.56, 0.44, 0.04, 0, 1.3, 0.34, '#7dff9a'], ['box', 0.7, 0.1, 0.3, 0, 0.92, 0.42, 'c2'], ['box', 0.7, 0.24, 0.06, 0, 1.68, 0.34, '#ffd166']], '#2a2350'),
};
Object.assign(CATALOG, PROPS);   // the modelled props (props.js) sit in the same catalogue
export const shade = (hex, k = 0.72) => { const n = parseInt(hex.slice(1), 16); return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * k).toString(16).padStart(2, '0')).join(''); };
export const fresh = (kind, x = 0, z = 0) => ({ id: Math.random().toString(36).slice(2, 9), kind, x, z, y: 0, rot: 0, sx: 1, sy: 1, sz: 1, color: CATALOG[kind].color, solid: !CATALOG[kind].flat && !['rug', 'roundrug', 'picture', 'cushion', 'candle', 'bookstack'].includes(kind) });
// One placed thing as a THREE group standing on y = 0 (the caller puts the group at floor height). toon(colour) makes a material.
export function buildItem(THREE, toon, outline, item) {
  const def = CATALOG[item.kind] || CATALOG.box, g = new THREE.Group(), col = item.color || def.color;
  if (def.make) { const K = kit(THREE, toon, outline, col, g); def.make(K); if (K.ticks.length) g.userData.tick = (t, night) => { for (const f of K.ticks) f(t, night); }; }
  for (const [shape, w, h, d, x, y, z, c] of def.parts || []) {
    const colour = c === 'c' ? col : c === 'c2' ? shade(col) : c;
    const geo = shape === 'box' ? new THREE.BoxGeometry(w, h, d) : shape === 'cyl' ? new THREE.CylinderGeometry(w, d, h, 20) : shape === 'ball' ? new THREE.SphereGeometry(w, 16, 12) : shape === 'cone' ? new THREE.ConeGeometry(w, h, 20) : new THREE.CylinderGeometry(w, d, h, 18, 1, true);
    const m = new THREE.Mesh(geo, shape === 'glow' ? new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide }) : toon(colour)); m.position.set(x, y, z);
    if (outline && shape !== 'glow' && Math.max(w, h, d) > 0.24) outline(m); g.add(m);
  }
  if (item.kind === 'artwork' && item.img) { const w = +item.aw || 0.9, h = +item.ah || 0.7, base = item.stand ? 0.95 : 0, frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.045), toon(item.stand ? '#1c1a22' : col)); frame.position.set(0, base + h / 2, 0); g.add(frame);
    const tex = new THREE.TextureLoader().load(item.img); tex.colorSpace = THREE.SRGBColorSpace; const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex })); pic.position.set(0, base + h / 2, 0.024); g.add(pic);
    if (item.stand) { const back = pic.clone(); back.rotation.y = Math.PI; back.position.z = -0.024; g.add(back); const pl = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.93, 0.46), toon('#e9e3d6')); pl.position.set(0, 0.465, 0); if (outline) outline(pl); g.add(pl); }
    else { const tag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.012), toon('#f4efe4')); tag.position.set(w / 2 + 0.2, h * 0.18, 0.006); g.add(tag); } }
  place(g, item); g.userData.item = item; return g;
}
export function place(g, item) { g.position.set(item.x, item.y || 0, item.z); g.rotation.y = item.rot || 0; g.scale.set(item.sx || 1, item.sy || 1, item.sz || 1); }
// What she can settle on by herself: sit (seat height in metres) or lie (surface height). f: how far in front of the middle she sits.
export const PERCH = { beanbag: { sit: 0.4, f: 0.05, name: 'the bean bag' }, campchair: { sit: 0.41, name: 'the camp chair' }, logseat: { sit: 0.41, name: 'the log' }, chair: { sit: 0.47, name: 'a chair' }, armchair: { sit: 0.52, f: 0.05, name: 'the armchair' }, sofa: { sit: 0.52, f: 0.08, name: 'the sofa' }, stool: { sit: 0.5, name: 'a stool' },
  bed: { lie: 0.52, name: 'the bed' }, sleepingbag: { lie: 0.14, f: 0.15, name: 'the sleeping bag' }, picnic: { lie: 0.02, name: 'the picnic blanket' }, blanketfort: { lie: 0.08, name: 'the blanket fort' } };
export function perchOf(item) {
  const P = PERCH[item.kind]; if (!P || Math.abs((item.sy || 1) - 1) > 0.15 || (item.y || 0) > 0.05) return null;
  const def = CATALOG[item.kind], r = item.rot || 0, fx = Math.sin(r), fz = Math.cos(r), f = P.f || 0, out = def.size[2] * (item.sz || 1) / 2 + 0.42, lie = P.lie !== undefined;
  return { lie, name: P.name, top: lie ? P.lie : P.sit, yaw: r, at: [item.x + fx * f, item.z + fz * f], from: lie ? [item.x + Math.cos(r) * (def.size[0] * (item.sx || 1) / 2 + 0.4), item.z - Math.sin(r) * (def.size[0] * (item.sx || 1) / 2 + 0.4)] : [item.x + fx * out, item.z + fz * out] };
}
// the floor area a thing takes up, as a box along the room's axes: [x0, x1, z0, z1]
export function footprint(item) {
  const def = CATALOG[item.kind] || CATALOG.box, w = def.size[0] * (item.sx || 1) / 2, d = def.size[2] * (item.sz || 1) / 2, c = Math.abs(Math.cos(item.rot || 0)), s = Math.abs(Math.sin(item.rot || 0)), ex = w * c + d * s, ez = w * s + d * c;
  return [item.x - ex, item.x + ex, item.z - ez, item.z + ez];
}
// the same, but true to a thing that is turned: a long thing at an angle is covered by a row of small squares along it,
// not by one big square round the whole of it (which walled off far more floor than the thing takes up)
export function footprints(item) {
  const def = CATALOG[item.kind] || CATALOG.box, w = def.size[0] * (item.sx || 1), d = def.size[2] * (item.sz || 1), r = item.rot || 0, c = Math.cos(r), s = Math.sin(r);
  if (Math.abs(s) < 0.2 || Math.abs(c) < 0.2 || Math.max(w, d) / Math.min(w, d) < 1.35) { if (Math.abs(s) >= 0.2 && Math.abs(c) >= 0.2) { const h = (w + d) / 4 * 1.1; return [[item.x - h, item.x + h, item.z - h, item.z + h]]; } return [footprint(item)]; }
  const long = Math.max(w, d), short = Math.min(w, d), n = Math.max(2, Math.ceil(long / short)), ax = w >= d ? [c, -s] : [s, c], h = short / 2 * 1.05, out = [];
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n - 0.5, x = item.x + ax[0] * t * long, z = item.z + ax[1] * t * long; out.push([x - h, x + h, z - h, z + h]); }
  return out;
}
