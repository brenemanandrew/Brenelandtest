// Real fantasy prints on the game store's walls: public-domain illustrations from Wikimedia Commons, each in a thin frame
// (a cream mat, four dark wood or gold strips) on a free stretch of wall at eye height. The frames go in the store's inside
// batch with everything else; each picture is its own plane, parchment coloured until its jpg arrives. The jpgs load after
// the store is built (one loader per image), so the store never waits on them. docs/refs/store-wall-art/CREDITS.md has the
// same nine with their Commons pages; the originals are not in the repo (public/img/wall-art is 512 px, jpg 78).
import * as THREE from 'three';
import { GEO } from './batch.js';

// title | artist, year | the Commons file | the licence tag on its page. w x h is the picture in metres.
export const PRINTS = [
  // the shop floor
  { file: 'rackham-siegfried-fafner', w: 0.66, h: 0.9, title: 'Siegfried kills Fafner', by: 'Arthur Rackham, 1911', src: 'File:Siegfried and the Twilight of the Gods p 056.jpg', lic: 'PD-old-70-1923' },
  { file: 'pyle-blackbeard', w: 0.95, h: 0.66, title: 'Blackbeard Buries His Treasure', by: 'Howard Pyle, 1887', src: 'File:Pyle pirates burying.jpg', lic: 'PD-US' },
  { file: 'bauer-trolls', w: 0.75, h: 0.75, title: 'The Princess and the Trolls', by: 'John Bauer, 1913', src: 'File:John Bauer - The Princess and the Trolls - Google Art Project.jpg', lic: 'PD-Art-two-auto (died 1918)' },
  { file: 'dore-windmills', w: 0.64, h: 0.8, title: 'Adventure with the Windmills (Don Quixote)', by: 'Gustave Dore, 1863', src: 'File:Adventure with the Windmills.jpg', lic: 'PD-Art | PD-old-auto-expired (died 1883)' },
  // the loft
  { file: 'wyeth-excalibur', w: 0.68, h: 0.845, title: 'King Arthur took it up (The Boy\'s King Arthur)', by: 'N. C. Wyeth, 1917', src: 'File:Boys King Arthur - N. C. Wyeth - p16.jpg', lic: 'PD-1923 (US, published before 1929)' },
  { file: 'beardsley-lady-of-the-lake', w: 0.6, h: 0.77, title: 'The Lady of the Lake telleth Arthur of the sword Excalibur', by: 'Aubrey Beardsley, 1893', src: 'File:The Lady of the Lake telleth Arthur of the sword Excalibur.jpg', lic: 'PD-Art | PD-old-100' },
  // the back room
  { file: 'rackham-fafner', w: 0.63, h: 0.9, title: 'In dragon\'s form Fafner now watches the hoard', by: 'Arthur Rackham, 1911', src: 'File:Siegfried and the Twilight of the Gods p 022.jpg', lic: 'PD-old-70-1923' },
  { file: 'dore-hippogriff', w: 0.68, h: 0.85, title: 'Ruggiero and the hippogriff (Orlando Furioso)', by: 'Gustave Dore, 1879', src: 'File:Orlando Furioso hippogriff battle.png', lic: 'PD-old' },
  { file: 'pyle-two-knights', w: 0.7, h: 0.83, title: 'Two Knights do Battle before Cameliard', by: 'Howard Pyle, 1903', src: 'File:Arthur-Pyle Two Knights do Battle before Cameliard.JPG', lic: 'PD-Scan | PD-old-100-1923' },
];

const C = { wood: '#3b2416', gold: '#c9a44a', mat: '#f1e8d2', parchment: '#e6d8b8' };
const turn = (x, z, yaw, lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

// Hang them. b: the inside batch, parent: the inside group (the pictures hide with it), P: the store's PLAN. Each spot is the
// wall's face at the picture's centre (x, y, z), yaw the way it faces (0 = +z), and the frame's colour. Every wall stretch here
// is free: no shelf, poster, window, door, mural or sign behind, and the frame's back is 1 mm off the wall.
export function hangPrints(b, parent, P) {
  const { sx, floorY: fy, iMinX, iMaxX, iMinZ, iMaxZ, zL, LY } = P, R = P.back.room;
  const eye = fy + 1.63, loftEye = LY + 1.65, roomEye = fy + 1.53; // the room's prints a little lower: its ceiling is the loft's floor
  const where = {
    'rackham-siegfried-fafner': [sx + 4.0, eye, zL - 0.121, Math.PI, C.wood],       // the back room's wall, shop side, east of the events board
    'pyle-blackbeard': [sx + 5.8, eye, zL - 0.121, Math.PI, C.wood],                 // beside it, by the east wall
    'bauer-trolls': [iMaxX - 0.031, eye, zL - 0.8, -Math.PI / 2, C.gold],            // the east wall between Clem's counter and the back room's wall
    'dore-windmills': [sx + 1.5, eye, iMinZ + 0.031, 0, C.wood],                     // the front wall between the door and the east window
    'wyeth-excalibur': [sx + 2.1, loftEye, iMaxZ - 0.031, Math.PI, C.gold],          // the loft's back wall, between the window seat and the puzzle poster
    'beardsley-lady-of-the-lake': [iMaxX - 0.031, loftEye, zL + 3.5, -Math.PI / 2, C.wood], // the loft's east wall, between the painting desk and the window
    'rackham-fafner': [R.minX + 0.031, roomEye, zL + 3.0, Math.PI / 2, C.wood],      // over the couch
    'dore-hippogriff': [sx - 1.0, roomEye, R.maxZ - 0.031, Math.PI, C.gold],         // the back wall, between the dragon and the map
    'pyle-two-knights': [sx + 4.4, roomEye, R.minZ + 0.031, 0, C.wood],              // the front wall, east of the Tuesday card
  };
  const mats = [], meshes = [];
  // the parchment is a one-pixel texture, not a plain colour: a material with a map is a different shader program, and
  // this way the program is compiled with everything else while the game loads, not the frame you first see the shop
  const blank = new THREE.DataTexture(new Uint8Array([230, 216, 184, 255]), 1, 1); blank.colorSpace = THREE.SRGBColorSpace; blank.needsUpdate = true;
  for (const p of PRINTS) {
    const [x, y, z, yaw, col] = where[p.file];
    const at = (lx, ly, lz, w, h, d, c) => { const [px, pz] = turn(x, z, yaw, lx, lz); b.add(GEO.box, c, { x: px, y: y + ly, z: pz, sx: w, sy: h, sz: d, ry: yaw }); };
    const mw = p.w + 0.08, mh = p.h + 0.08, S = 0.035;   // the mat round the picture, the strips round the mat
    at(0, 0, 0.007, mw, mh, 0.012, C.mat);
    for (const k of [-1, 1]) { at(0, k * (mh / 2 + S / 2), 0.016, mw + 2 * S, S, 0.03, col); at(k * (mw / 2 + S / 2), 0, 0.016, S, mh, 0.03, col); }
    const m = new THREE.MeshBasicMaterial({ map: blank, fog: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), m);
    const [px, pz] = turn(x, z, yaw, 0, 0.017);
    mesh.position.set(px, y, pz); mesh.rotation.y = yaw; mesh.name = 'store-print'; mesh.userData.print = p.file;
    mesh.castShadow = false; mesh.receiveShadow = false; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    parent.add(mesh); mats.push(m); meshes.push(mesh);
  }
  let loaded = 0;
  // renderer: each jpg goes to the GPU as it arrives (decoded then, a couple of ms each, while the loading screen is up or
  // on the walk), not all nine on the frame the shop first draws
  const load = (renderer = null) => PRINTS.forEach((p, i) => {
    new THREE.TextureLoader().load('/img/wall-art/' + p.file + '.jpg', t => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; // (mipmaps on by default: a print across the shop stays calm)
      try { renderer?.initTexture(t); } catch { /* an old renderer: uploaded on first draw as before */ }
      mats[i].map = t; loaded++;
    }, undefined, () => {}); // a failed fetch leaves the parchment
  });
  return { meshes, load, get loaded() { return loaded; }, spots: PRINTS.map(p => ({ file: p.file, w: p.w, h: p.h, x: where[p.file][0], y: where[p.file][1], z: where[p.file][2], yaw: where[p.file][3] })) };
}
