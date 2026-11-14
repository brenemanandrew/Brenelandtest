// Kevin's things for the shop and his odd jobs (kevin-boat.js kevinDress puts them on him for what kevin-day.js says he is
// doing): the shop apron (an overlay on his saved look, never a change to it: a bib that follows his chest and a skirt that hangs
// from his waist and swings forward with a stepping leg), the tool in his right hand (a hammer, a paint brush, an oil can, a
// wrench, a gutter scoop), his red toolbox in the left hand on the way to a job, and boards on his right shoulder.
import * as THREE from 'three';
import { toon } from './toon.js';
import { GEO } from './batch.js';
import { profileAt } from './bodies-geo.js';
import { TORSO_PROFILE } from './bodies-outfit.js';

const APRON = '#3c6a52', STITCH = '#e8dcc0', STRAP = '#2f5442';
// a strip that hugs the front of the torso (chest-local): rows y0..y1, half width at each row a share of the body's
const hug = (D, y0, y1, share, out) => {
  const yb = -0.06, Hh = D.torsoTop - yb, NX = 8, NY = 6, pos = [], idx = [];
  for (let j = 0; j <= NY; j++) {
    const y = y0 + (y1 - y0) * j / NY, r = profileAt(TORSO_PROFILE, Math.max(0, Math.min(1, (y - yb) / Hh))) * 1.04, rx = D.wT * r, rz = D.dT * r;
    for (let i = 0; i <= NX; i++) {
      const x = (i / NX * 2 - 1) * rx * share;
      pos.push(x, y, rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)) + out);
    }
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + NX + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
};
const mesh = (geo, col, sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Mesh(geo, toon(col)); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; return m;
};

// The apron: { bib (on the chest), skirt (a pivot at the waist on the hips) }, both hidden until shown
export function buildApron(body) {
  const D = body.dims, T = D.torsoTop, warp = D.shape?.warp;
  const bib = new THREE.Group(); bib.name = 'kevin-apron-bib';
  const g = hug(D, -0.05, T - 0.13, 0.62, 0.022);
  if (warp) { const p = g.attributes.position, o = [0, 0, 0]; for (let i = 0; i < p.count; i++) { warp(p.getX(i), p.getY(i), p.getZ(i), o); p.setXYZ(i, o[0], o[1], o[2]); } g.computeVertexNormals(); }
  const front = new THREE.Mesh(g, toon(APRON, { side: THREE.DoubleSide })); front.castShadow = true; bib.add(front);
  // the neck strap (over both shoulders round the back of the neck) and the ties at the waist
  const r = profileAt(TORSO_PROFILE, 0.97) * 1.04, top = T - 0.13, nx = D.wT * r * 0.38;
  for (const s of [-1, 1]) {
    bib.add(mesh(GEO.cyl6, STRAP, 0.012, 0.16, 0.012, s * nx * 0.9, top + 0.06, D.dT * 0.75, -0.75, 0, s * 0.25));
    bib.add(mesh(GEO.cyl6, STRAP, 0.012, 0.22, 0.012, s * D.wT * 0.62, -0.03, 0.0, Math.PI / 2, 0, 0));
  }
  bib.add(mesh(GEO.box, STITCH, 0.16, 0.012, 0.004, 0, top - 0.02, D.dT * profileAt(TORSO_PROFILE, 0.93) + 0.03)); // a pale band at its top
  bib.add(mesh(GEO.box, '#e0b54a', 0.012, 0.09, 0.012, D.wT * 0.18, top - 0.1, D.dT * profileAt(TORSO_PROFILE, 0.88) * 1.04 + 0.032)); // a pencil in the bib pocket
  bib.add(mesh(GEO.box, STRAP, 0.1, 0.08, 0.006, D.wT * 0.2, top - 0.13, D.dT * profileAt(TORSO_PROFILE, 0.86) * 1.04 + 0.027)); // the pocket
  body.chest.add(bib);
  // the skirt: from the waist to above the knee, a little proud of the thighs, with a pocket
  const skirt = new THREE.Group(); skirt.name = 'kevin-apron-skirt';
  const wy = D.waist - 0.05, len = D.legLen * 0.5, zf = D.dT * 1.02 + 0.05;
  skirt.position.set(0, wy, zf);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(D.wT * 1.5, len, 0.014), toon(APRON)); panel.position.set(0, -len / 2, 0.02); panel.rotation.x = -0.06; panel.castShadow = true; skirt.add(panel);
  skirt.add(mesh(GEO.box, STRAP, D.wT * 0.9, 0.12, 0.012, 0, -len * 0.45, 0.04));
  skirt.add(mesh(GEO.box, STITCH, D.wT * 1.5, 0.02, 0.018, 0, -len + 0.02, 0.04));
  body.hips.add(skirt);
  bib.visible = skirt.visible = false;
  return { bib, skirt };
}

// The tools in his right hand (the palm's anchor; the forearm runs along -y): each a group, one shown at a time
export function buildTools(body) {
  const T = {};
  const grp = name => { const g = new THREE.Group(); g.name = 'kevin-' + name; g.visible = false; body.handR.add(g); T[name] = g; return g; };
  // (bodies-fix) a tool whose handle runs through the fist, its business end at the thumb's end (+z), is userData.handle: human.js turns
  // the wrist so the head is never hung downward (Kevin waved with his hammer upside down); the oil can stands upright in the fist
  { const g = grp('hammer'); g.userData.handle = true; g.add(mesh(GEO.cyl8, '#b98a5a', 0.022, 0.34, 0.022, 0, 0, 0.12, Math.PI / 2)); g.add(mesh(GEO.box, '#5d636b', 0.05, 0.05, 0.16, 0, 0, 0.29, 0, Math.PI / 2)); }
  { const g = grp('brush'); g.userData.handle = true; g.add(mesh(GEO.cyl8, '#c0392b', 0.016, 0.2, 0.016, 0, 0, 0.09, Math.PI / 2)); g.add(mesh(GEO.box, '#c9ced4', 0.07, 0.03, 0.04, 0, 0, 0.2)); g.add(mesh(GEO.box, '#3f8a5a', 0.068, 0.028, 0.07, 0, 0, 0.255)); }
  { const g = grp('oilcan'); g.userData.upright = true; g.add(mesh(GEO.cyl12, '#c8a032', 0.06, 0.09, 0.06, 0, -0.02, 0.06)); g.add(mesh(GEO.cone8, '#c8a032', 0.06, 0.06, 0.06, 0, 0.05, 0.06)); g.add(mesh(GEO.cyl6, '#8a7020', 0.008, 0.2, 0.008, 0, 0.12, 0.13, 0.9)); }
  { const g = grp('wrench'); g.userData.handle = true; g.add(mesh(GEO.box, '#9aa3ad', 0.03, 0.012, 0.24, 0, 0, 0.1)); g.add(mesh(GEO.box, '#9aa3ad', 0.07, 0.014, 0.04, 0, 0, 0.23)); }
  { const g = grp('scoop'); g.userData.handle = true; g.add(mesh(GEO.cyl8, '#b98a5a', 0.018, 0.22, 0.018, 0, 0, 0.1, Math.PI / 2)); g.add(mesh(GEO.box, '#e0463c', 0.1, 0.04, 0.12, 0, 0.0, 0.25)); }
  for (const g of Object.values(T)) g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return T;
}

// His red toolbox, in the left hand on the way to a job
export function buildToolbox(body) {
  if (!body.handL) return null;
  const g = new THREE.Group(); g.name = 'kevin-toolbox';
  g.add(mesh(GEO.box, '#c0392b', 0.14, 0.18, 0.38, 0, -0.2, 0));
  g.add(mesh(GEO.box, '#8e2a20', 0.15, 0.03, 0.39, 0, -0.1, 0));
  g.add(mesh(GEO.box, '#2b2340', 0.03, 0.06, 0.16, 0, -0.05, 0));
  g.visible = false; g.userData.upright = 'hang'; body.handL.add(g); // (hangs level from the fist whatever the arm does: human.js)
  return g;
}
// (crib-move) His old open-face helmet for the Sunday ride: cream with a red stripe over the top, the goggles up on its brow. On the
// head group at y = 0 like a hat (CLAUDE.md: no hat offset), a shell a little bigger than the head, open at the face.
export function buildHelmet(body) {
  if (!body.head) return null;
  const g = new THREE.Group(); g.name = 'kevin-helmet';
  const R = 0.31;
  g.add(mesh(new THREE.SphereGeometry(R, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), '#ece4cf', 1, 0.96, 1.02, 0, 0.035, -0.015));
  g.add(mesh(new THREE.TorusGeometry(R + 0.003, 0.022, 4, 18, Math.PI), '#b8382c', 1, 0.96, 1, 0, 0.035, -0.015, 0, Math.PI / 2, 0));
  g.add(mesh(new THREE.TorusGeometry(R + 0.002, 0.012, 4, 20), '#4a3020', 1, 1, 1.02, 0, -0.01, -0.015, Math.PI / 2, 0, 0));   // the rim
  g.add(mesh(GEO.box, '#2b2b30', 0.3, 0.085, 0.07, 0, 0.1, R * 0.93));                                                          // the goggles, pushed up on the brow
  for (const s of [-1, 1]) g.add(mesh(GEO.cyl8, '#8fb8c8', 0.05, 0.02, 0.05, s * 0.075, 0.1, R * 0.93 + 0.03, Math.PI / 2));
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.visible = false; body.head.add(g);
  return g;
}
// Boards on his right shoulder (on the chest: they ride with it), long fore and aft
export function buildPlank(body) {
  const D = body.dims, g = new THREE.Group(); g.name = 'kevin-boards';
  for (let i = 0; i < 3; i++) g.add(mesh(GEO.box, i % 2 ? '#d9b47c' : '#c9a26b', 0.09, 0.022, 2.3, 0, i * 0.024, 0.0));
  g.position.set(-D.wT * 0.62, D.torsoTop + 0.03, 0.08); g.rotation.x = 0.08;
  g.visible = false; body.chest.add(g);
  return g;
}
