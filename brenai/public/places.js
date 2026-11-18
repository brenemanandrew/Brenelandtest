// The two places you can be together, cel-shaded: Wizra's dorm room (built around the furniture she already uses) and your
// house. Both share the same layout of anchors (her seat at the origin, the low table in front of it, a bookshelf back left,
// a counter back right, the door on the right wall), so her routine works in either without knowing which it is.
//
//   const places = buildPlaces(THREE, anchors)   anchors: floorY, hip, feet, seatTop, tableTop, tableZ, backZ, SHELF, COUNTER, DOOR, tagged
//   places.dorm / places.house   groups to show or hide        places.toon(colour)   the cel material, for anything else
//   places.bounds[name]          the walls, for first person   places.blocks[name]   boxes you cannot walk into
//   places.spawn[name]           where you stand when you arrive, and places.seat[name] where you can sit
//   places.tick(night, t)        outside light and the TV
import { buildItem, footprint, perchOf } from './mapkit.js';
// cel shading: light falls in three flat bands instead of a smooth ramp, and big shapes get a dark outline
export function cel(THREE) {
  const ramp = new THREE.DataTexture(new Uint8Array([118, 118, 118, 255, 188, 188, 188, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat); ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  const toon = (c, o = {}) => new THREE.MeshToonMaterial({ color: c, gradientMap: ramp, ...o });
  const ink = new THREE.LineBasicMaterial({ color: '#1a1026' });
  const outline = m => { m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), ink)); return m; };
  return { toon, outline };
}
export function buildPlaces(THREE, A) {
  const { floorY, hip, feet, seatTop, tableTop, tableZ, backZ, SHELF, COUNTER, DOOR } = A;
  const { toon, outline } = A.cel || cel(THREE);
  let into = null, place = '', TAG = '';
  const reg = m => { m.traverse(o => { if (o.isMesh && TAG) { o.userData.tag = TAG; o.userData.place = place; A.tagged.push(o); } }); return m; };
  const box = (w, h, d, x, y, z, c, rx = 0, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(c)); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); if (Math.max(w, h, d) > 0.24) outline(m); into.add(m); return reg(m); };
  const cyl = (r1, r2, h, x, y, z, c, seg = 18) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), toon(c)); m.position.set(x, y, z); if (Math.max(r1, r2, h) > 0.2) outline(m); into.add(m); return reg(m); };
  const ball = (r, x, y, z, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), toon(c)); m.position.set(x, y, z); into.add(m); return reg(m); };
  const glow = (geo, c, x, y, z) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, y, z); into.add(m); return m; };
  const paint = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

  // ---- the world outside the windows: a painted panorama a few metres beyond each one ----
  const worldMats = [];
  function world(kind) {
    const tex = paint(1024, 512, (c, W, H) => {
      const sky = c.createLinearGradient(0, 0, 0, H * 0.7); sky.addColorStop(0, '#6fb7ff'); sky.addColorStop(1, '#d8f0ff'); c.fillStyle = sky; c.fillRect(0, 0, W, H);
      c.fillStyle = '#fff'; for (const [x, y, s] of [[140, 90, 1], [420, 60, 1.3], [760, 110, 0.9], [930, 50, 0.7]]) for (const [dx, dy, r] of [[0, 0, 34], [36, 8, 26], [-34, 10, 24], [10, -16, 24]]) { c.beginPath(); c.arc(x + dx * s, y + dy * s, r * s, 0, 7); c.fill(); }
      c.fillStyle = '#ffe680'; c.beginPath(); c.arc(860, 150, 38, 0, 7); c.fill();
      c.fillStyle = '#8fc98a'; c.beginPath(); c.moveTo(0, 330); for (let x = 0; x <= W; x += 40) c.lineTo(x, 300 + 34 * Math.sin(x / 130) + 18 * Math.sin(x / 47)); c.lineTo(W, H); c.lineTo(0, H); c.fill();
      if (kind === 'campus') { // brick halls across a quad
        for (const [x, w, h, col] of [[40, 210, 190, '#b5654a'], [300, 150, 150, '#c47a55'], [520, 260, 210, '#a85a44'], [840, 170, 160, '#bd6e50']]) {
          c.fillStyle = col; c.fillRect(x, 340 - h, w, h); c.fillStyle = '#5a3a30'; c.fillRect(x - 6, 340 - h - 12, w + 12, 14);
          c.fillStyle = '#fdf3c4'; for (let wy = 340 - h + 22; wy < 320; wy += 40) for (let wx = x + 16; wx < x + w - 22; wx += 36) c.fillRect(wx, wy, 18, 24);
        }
        c.fillStyle = '#e9e2cf'; c.beginPath(); c.moveTo(430, H); c.lineTo(500, 345); c.lineTo(540, 345); c.lineTo(640, H); c.fill();
      } else { // a quiet street: houses, a fence
        for (const [x, w, h, col, roof] of [[60, 200, 110, '#f1d9a8', '#b5523f'], [380, 180, 100, '#cfe3f2', '#5d6f8a'], [700, 220, 120, '#f4c9c0', '#7a4a3a']]) {
          c.fillStyle = col; c.fillRect(x, 345 - h, w, h); c.fillStyle = roof; c.beginPath(); c.moveTo(x - 14, 345 - h); c.lineTo(x + w / 2, 345 - h - 62); c.lineTo(x + w + 14, 345 - h); c.fill();
          c.fillStyle = '#7fb6dd'; c.fillRect(x + 22, 345 - h + 26, 34, 34); c.fillRect(x + w - 58, 345 - h + 26, 34, 34); c.fillStyle = '#6b4a35'; c.fillRect(x + w / 2 - 15, 345 - 56, 30, 56);
        }
        c.fillStyle = '#fff'; for (let x = 0; x < W; x += 22) c.fillRect(x, 372, 12, 46); c.fillRect(0, 384, W, 8);
      }
      for (const [x, y, s] of [[250, 350, 1], [660, 356, 1.1], [985, 348, 0.9], [20, 360, 0.8]]) { c.fillStyle = '#6b4a35'; c.fillRect(x - 6 * s, y, 12 * s, 70 * s); c.fillStyle = '#3f8f52'; c.beginPath(); c.arc(x, y - 6 * s, 44 * s, 0, 7); c.fill(); c.fillStyle = '#56ab66'; c.beginPath(); c.arc(x - 12 * s, y - 20 * s, 26 * s, 0, 7); c.fill(); }
      c.fillStyle = '#7dbd76'; c.fillRect(0, 430, W, H);
    });
    const m = new THREE.MeshBasicMaterial({ map: tex }); worldMats.push(m); return m;
  }
  // ---- walls: flat panels that face into the room, so the room is open to a camera outside it and closed from within ----
  const FACE = { N: [0, 1, 0, 0], S: [Math.PI, -1, 0, 0], W: [Math.PI / 2, 0, 0, 1], E: [-Math.PI / 2, 0, 0, -1] }; // facing: rotation, and which way "in" is
  function wall(face, fixed, from, to, height, colour, holes = [], worldMat = null, trim = '#f3ead8') {
    const [ry] = FACE[face], alongX = face === 'N' || face === 'S', mat = toon(colour);
    const piece = (a, b, y0, y1) => { if (b - a < 0.01 || y1 - y0 < 0.01) return; const m = new THREE.Mesh(new THREE.PlaneGeometry(b - a, y1 - y0), mat); const c = (a + b) / 2, y = floorY + (y0 + y1) / 2; m.position.set(alongX ? c : fixed, y, alongX ? fixed : c); m.rotation.y = ry; into.add(m); };
    const hs = [...holes].sort((p, q) => p.at - q.at); let u = from;
    for (const h of hs) { const a = h.at - h.w / 2, b = h.at + h.w / 2; piece(u, a, 0, height); piece(a, b, 0, h.y0); piece(a, b, h.y1, height); u = b;
      // the window: frame, sill, cross bars, a hint of glass, and the world beyond it
      const inward = face === 'N' ? [0, 0.03] : face === 'S' ? [0, -0.03] : face === 'W' ? [0.03, 0] : [-0.03, 0], out = [-inward[0] / 0.03 * 2.6, -inward[1] / 0.03 * 2.6];
      const at = (c, y, dx = 0, dz = 0) => [alongX ? c + dx : fixed + inward[0] + dx, floorY + y, alongX ? fixed + inward[1] + dz : c + dz];
      const bar = (len, thick, c, y, vertical) => { const g = vertical ? [thick, len, 0.07] : [len, thick, 0.07]; const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? g[0] : g[2], g[1], alongX ? g[2] : g[0]), toon(trim)); m.position.set(...at(c, y)); into.add(m); };
      bar(h.w + 0.14, 0.08, h.at, h.y1 + 0.02); bar(h.w + 0.2, 0.1, h.at, h.y0 - 0.03); bar(h.y1 - h.y0, 0.08, a - 0.02, (h.y0 + h.y1) / 2, true); bar(h.y1 - h.y0, 0.08, b + 0.02, (h.y0 + h.y1) / 2, true);
      bar(h.w, 0.04, h.at, (h.y0 + h.y1) / 2); bar(h.y1 - h.y0, 0.04, h.at, (h.y0 + h.y1) / 2, true);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(h.w, h.y1 - h.y0), new THREE.MeshBasicMaterial({ color: '#cfeaff', transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false })); glass.position.set(alongX ? h.at : fixed, floorY + (h.y0 + h.y1) / 2, alongX ? fixed : h.at); glass.rotation.y = ry; into.add(glass);
      if (worldMat) { const w = new THREE.Mesh(new THREE.PlaneGeometry(13, 6), worldMat); w.position.set(alongX ? h.at : fixed + out[0], floorY + 2.4, alongX ? fixed + out[1] : h.at); w.rotation.y = ry; into.add(w); }
    }
    piece(u, to, 0, height);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(alongX ? to - from : 0.03, 0.1, alongX ? 0.03 : to - from), toon(trim)); skirt.position.set(alongX ? (from + to) / 2 : fixed + (face === 'W' ? 0.015 : -0.015), floorY + 0.05, alongX ? fixed + (face === 'N' ? 0.015 : -0.015) : (from + to) / 2); into.add(skirt);
  }
  const flat = (w, d, x, y, z, mat, up) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2; m.position.set(x, y, z); into.add(m); return m; };
  const picture = (face, fixed, c, y, w, h, draw) => { const [ry] = FACE[face], alongX = face === 'N' || face === 'S', off = face === 'N' ? 0.02 : face === 'S' ? -0.02 : face === 'W' ? 0.02 : -0.02;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: paint(256, Math.round(256 * h / w), draw) })); m.position.set(alongX ? c : fixed + off, floorY + y, alongX ? fixed + off : c); m.rotation.y = ry; into.add(m); return m; };
  const shelfOfBooks = (x, z, wood, spines) => { TAG = 'shelf';
    box(0.9, 1.7, 0.04, x, floorY + 0.85, z - 0.13, wood); box(0.04, 1.7, 0.3, x - 0.45, floorY + 0.85, z, wood); box(0.04, 1.7, 0.3, x + 0.45, floorY + 0.85, z, wood);
    for (let i = 0; i < 5; i++) box(0.9, 0.035, 0.3, x, floorY + 0.05 + i * 0.41, z, wood);
    for (let row = 0; row < 4; row++) { let bx = x - 0.4, n = 0; while (bx < x + 0.36) { const wd = 0.03 + ((row * 7 + n * 5) % 4) * 0.009, ht = 0.25 + ((row * 3 + n * 11) % 5) * 0.022; if (!(row === 2 && n === 4)) box(wd, ht, 0.2, bx + wd / 2, floorY + 0.07 + row * 0.41 + ht / 2, z, spines[(row * 3 + n) % spines.length]); bx += wd + 0.006; n++; } } };
  const plant = (x, z, s = 1) => { TAG = ''; cyl(0.16 * s, 0.12 * s, 0.26 * s, x, floorY + 0.13 * s, z, '#c9744f'); for (const [dx, dy, dz, r] of [[0, 0.5, 0, 0.2], [0.12, 0.36, 0.05, 0.15], [-0.11, 0.4, -0.06, 0.16], [0.02, 0.68, 0.03, 0.13]]) ball(r * s, x + dx * s, floorY + dy * s + 0.1, z + dz * s, '#3f9a5a'); };

  // =================================== her dorm room ===================================
  const dorm = new THREE.Group(); into = dorm; place = 'dorm';
  const D = { x0: -2.05, x1: 3.1, z0: backZ - 0.32, z1: hip.z + 3.05, h: 2.5 }, campus = world('campus');
  TAG = 'floor'; reg(flat(D.x1 - D.x0, D.z1 - D.z0, (D.x0 + D.x1) / 2, floorY - 0.006, (D.z0 + D.z1) / 2, toon('#3a2f52'), true));
  TAG = ''; flat(D.x1 - D.x0, D.z1 - D.z0, (D.x0 + D.x1) / 2, floorY + D.h, (D.z0 + D.z1) / 2, toon('#efe9f5'), false);
  wall('N', D.z0, D.x0, D.x1, D.h, '#6d5a8f', [{ at: 0.1, w: 1.15, y0: 1.05, y1: 2.05 }], campus);
  wall('W', D.x0, D.z0, D.z1, D.h, '#7a669c', [{ at: hip.z + 0.55, w: 1.2, y0: 0.95, y1: 2.0 }], campus);
  wall('E', D.x1, D.z0, D.z1, D.h, '#7a669c'); wall('S', D.z1, D.x0, D.x1, D.h, '#6d5a8f');
  // her bed, along the left wall
  const bedX = D.x0 + 0.55, bedZ = hip.z + 2.0; TAG = 'bed';
  box(1.0, 0.28, 2.0, bedX, floorY + 0.2, bedZ, '#2a2038'); box(0.96, 0.2, 1.96, bedX, floorY + 0.42, bedZ, '#e8e0f0'); box(0.98, 0.08, 1.3, bedX, floorY + 0.53, bedZ + 0.32, '#4b2a6b');   // frame, mattress, blanket
  box(1.0, 0.75, 0.08, bedX, floorY + 0.55, bedZ - 1.0, '#2a2038'); box(0.6, 0.12, 0.36, bedX, floorY + 0.59, bedZ - 0.72, '#f6f1fa');                                       // headboard, pillow
  TAG = ''; ball(0.1, bedX - 0.36, floorY + 0.64, bedZ - 0.86, '#f2b6cf'); ball(0.065, bedX - 0.36, floorY + 0.77, bedZ - 0.86, '#f2b6cf'); ball(0.03, bedX - 0.41, floorY + 0.84, bedZ - 0.86, '#f2b6cf'); ball(0.03, bedX - 0.31, floorY + 0.84, bedZ - 0.86, '#f2b6cf'); // the plushie she would deny owning
  // desk and laptop under the front wall, mini fridge by the counter, a rug of her own
  const deskX = 0.6, deskZ = D.z1 - 0.38;
  box(1.3, 0.05, 0.6, deskX, floorY + 0.74, deskZ, '#3b2a1c'); for (const [dx, dz] of [[-0.6, -0.25], [0.6, -0.25], [-0.6, 0.25], [0.6, 0.25]]) box(0.05, 0.72, 0.05, deskX + dx, floorY + 0.36, deskZ + dz, '#2a1d14');
  box(0.36, 0.02, 0.25, deskX - 0.1, floorY + 0.78, deskZ - 0.02, '#2b2b33'); box(0.36, 0.24, 0.02, deskX - 0.1, floorY + 0.9, deskZ + 0.12, '#2b2b33', -0.2); glow(new THREE.PlaneGeometry(0.32, 0.2), '#b7a3ff', deskX - 0.1, floorY + 0.905, deskZ + 0.105).rotation.set(0.2, Math.PI, 0);
  for (const [dx, c] of [[0.3, '#e03131'], [0.36, '#7fd0ff'], [0.33, '#ffd166']]) box(0.03, 0.03, 0.03, deskX + dx, floorY + 0.782, deskZ - 0.12 + (dx * 7) % 0.1, c);                 // her dice
  box(0.45, 0.06, 0.45, deskX - 0.1, floorY + 0.46, deskZ - 0.62, '#4b2a6b'); box(0.45, 0.5, 0.06, deskX - 0.1, floorY + 0.74, deskZ - 0.84, '#4b2a6b'); cyl(0.04, 0.04, 0.44, deskX - 0.1, floorY + 0.22, deskZ - 0.62, '#1c1626');
  box(0.5, 0.82, 0.5, COUNTER.x + 0.75, floorY + 0.41, COUNTER.z + 0.02, '#d9d4e6'); box(0.03, 0.3, 0.03, COUNTER.x + 0.56, floorY + 0.55, COUNTER.z + 0.28, '#9a94a8');
  // posters, and fairy lights along the back wall
  picture('S', D.z1, 0.6, 1.62, 0.7, 0.95, (c, W, H) => { c.fillStyle = '#1b1030'; c.fillRect(0, 0, W, H); c.fillStyle = '#e03131'; c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 2; c.lineTo(W / 2 + 90 * Math.cos(a), H * 0.42 + 90 * Math.sin(a)); } c.fill(); c.fillStyle = '#fff'; c.font = 'bold 76px sans-serif'; c.textAlign = 'center'; c.fillText('20', W / 2, H * 0.42 + 26); c.font = 'bold 30px sans-serif'; c.fillText('ROLL FOR IT', W / 2, H - 40); });
  picture('E', D.x1, hip.z + 2.1, 1.6, 0.8, 0.6, (c, W, H) => { c.fillStyle = '#0d0b1a'; c.fillRect(0, 0, W, H); c.fillStyle = '#f5f0d0'; c.beginPath(); c.arc(W / 2, H / 2, 58, 0, 7); c.fill(); c.fillStyle = '#0d0b1a'; c.beginPath(); c.arc(W / 2 + 24, H / 2 - 8, 52, 0, 7); c.fill(); c.fillStyle = '#fff'; for (let i = 0; i < 26; i++) c.fillRect((i * 83) % W, (i * 47) % H, 3, 3); });
  picture('W', D.x0, hip.z - 0.75, 1.6, 0.6, 0.8, (c, W, H) => { c.fillStyle = '#2a0f1f'; c.fillRect(0, 0, W, H); c.strokeStyle = '#ff8fc0'; c.lineWidth = 10; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(W / 2, H / 2, 24 + i * 22, 0.4 * i, 0.4 * i + 4.2); c.stroke(); } });
  for (let i = 0; i < 16; i++) glow(new THREE.SphereGeometry(0.028, 8, 6), ['#ffd98a', '#ff9cc4', '#a8c8ff'][i % 3], D.x0 + 0.25 + i * (D.x1 - D.x0 - 0.5) / 15, floorY + 2.28 - 0.1 * Math.sin(i * Math.PI / 15 * 3) ** 2, D.z0 + 0.03);

  // =================================== your house: the living room ===================================
  const house = new THREE.Group(); into = house; place = 'house'; house.visible = false;
  const Hh = { x0: -4.5, x1: 3.1, z0: backZ - 0.36, z1: hip.z + 4.7, h: 2.75 }, yard = world('yard');
  const boards = paint(512, 512, (c, W, H) => { c.fillStyle = '#c99a63'; c.fillRect(0, 0, W, H); for (let y = 0; y < H; y += 64) { c.fillStyle = y % 128 ? '#c39258' : '#d1a46d'; c.fillRect(0, y, W, 62); c.fillStyle = '#9a6f3f'; c.fillRect(0, y + 62, W, 2); c.fillRect((y * 3) % W, y, 2, 62); c.fillRect((y * 5 + 200) % W, y, 2, 62); } }); boards.wrapS = boards.wrapT = THREE.RepeatWrapping; boards.repeat.set(4, 5);
  TAG = 'floor'; reg(flat(Hh.x1 - Hh.x0, Hh.z1 - Hh.z0, (Hh.x0 + Hh.x1) / 2, floorY - 0.006, (Hh.z0 + Hh.z1) / 2, toon('#ffffff', { map: boards }), true));
  TAG = ''; flat(Hh.x1 - Hh.x0, Hh.z1 - Hh.z0, (Hh.x0 + Hh.x1) / 2, floorY + Hh.h, (Hh.z0 + Hh.z1) / 2, toon('#fbf7ef'), false);
  wall('N', Hh.z0, Hh.x0, Hh.x1, Hh.h, '#f1dfc2', [{ at: -2.9, w: 1.5, y0: 0.95, y1: 2.15 }, { at: 0.1, w: 1.2, y0: 1.05, y1: 2.1 }], yard, '#ffffff');
  wall('W', Hh.x0, Hh.z0, Hh.z1, Hh.h, '#eed6b4', [{ at: hip.z + 1.7, w: 2.4, y0: 0.6, y1: 2.25 }], yard, '#ffffff');
  wall('E', Hh.x1, Hh.z0, Hh.z1, Hh.h, '#eed6b4', [], null, '#ffffff'); wall('S', Hh.z1, Hh.x0, Hh.x1, Hh.h, '#f1dfc2', [], null, '#ffffff');
  // the couch: she sits at its right-hand end (the same seat her armchair has in the dorm), with room beside her
  TAG = 'chair'; const cw = 2.5, cx = -0.88, baseH = seatTop - floorY - 0.12;
  box(cw, baseH, 0.66, cx, floorY + baseH / 2, hip.z - 0.02, '#3f6f8f'); box(cw, 0.95, 0.18, cx, seatTop + 0.3, hip.z - 0.37, '#4a82a6', -0.28);
  for (let i = 0; i < 3; i++) box(0.74, 0.15, 0.56, 0.02 - i * 0.78, seatTop - 0.07, hip.z + 0.03, '#5a9cc4');
  box(0.14, 0.32, 0.66, 0.42, seatTop + 0.08, hip.z - 0.02, '#4a82a6'); box(0.14, 0.32, 0.66, cx - cw / 2 + 0.02, seatTop + 0.08, hip.z - 0.02, '#4a82a6');
  TAG = ''; box(0.4, 0.4, 0.14, -1.6, seatTop + 0.22, hip.z - 0.2, '#ffd166', -0.3); box(0.36, 0.36, 0.14, -0.9, seatTop + 0.2, hip.z - 0.2, '#ff8fc0', -0.3);                              // cushions
  TAG = 'table'; box(1.5, 0.06, 0.5, -0.45, tableTop - 0.03, tableZ + 0.07, '#8a5a34'); for (const [dx, dz] of [[-0.68, -0.19], [0.68, -0.19], [-0.68, 0.19], [0.68, 0.19]]) box(0.06, tableTop - floorY - 0.06, 0.06, -0.45 + dx, (tableTop - 0.06 + floorY) / 2, tableZ + 0.07 + dz, '#6b4326');
  TAG = 'floor'; reg(flat(3.4, 2.5, -0.6, floorY + 0.004, hip.z + 1.0, toon('#d9534f'), true)); reg(flat(3.0, 2.1, -0.6, floorY + 0.008, hip.z + 1.0, toon('#f6e7c8'), true));                    // rug
  // TV on its stand, against the front wall, facing the couch
  const tvZ = Hh.z1 - 0.32, tvX = -0.7; TAG = 'tv';
  box(1.7, 0.5, 0.42, tvX, floorY + 0.25, tvZ, '#6b4326'); box(1.45, 0.84, 0.07, tvX, floorY + 1.02, tvZ + 0.06, '#1b1b22');
  const tvScreen = glow(new THREE.PlaneGeometry(1.36, 0.75), '#101018', tvX, floorY + 1.02, tvZ + 0.02); tvScreen.rotation.y = Math.PI; TAG = 'tv'; reg(tvScreen);
  // bookshelf and kitchen corner on her usual anchors, so fetching a book or a drink works here too
  shelfOfBooks(SHELF.x, SHELF.z, '#8a5a34', ['#d9534f', '#3f6f8f', '#56ab66', '#f0ad4e', '#8f6fc4', '#e8855a', '#3aa6b9', '#c94f7c']);
  TAG = 'counter'; const kx0 = COUNTER.x - 0.5, kLen = Hh.x1 - 0.05 - kx0, kMid = kx0 + kLen / 2;
  box(kLen, 0.9, 0.5, kMid, floorY + 0.45, COUNTER.z, '#f7f3ea'); box(kLen + 0.04, 0.05, 0.56, kMid, floorY + 0.925, COUNTER.z + 0.02, '#5a4636'); box(kLen, 0.6, 0.32, kMid, floorY + 1.95, COUNTER.z - 0.08, '#f7f3ea');
  for (let i = 0; i < 3; i++) box(0.02, 0.5, 0.02, kx0 + 0.3 + i * (kLen - 0.6) / 2, floorY + 1.95, COUNTER.z + 0.09, '#b9a78a');
  cyl(0.07, 0.085, 0.19, COUNTER.x + 0.15, floorY + 1.045, COUNTER.z, '#d9534f'); cyl(0.05, 0.05, 0.14, COUNTER.x - 0.2, floorY + 1.02, COUNTER.z - 0.05, '#8a5a34'); box(0.36, 0.03, 0.3, kx0 + kLen - 0.45, floorY + 0.955, COUNTER.z, '#9aa3ad');
  TAG = ''; box(0.7, 1.75, 0.66, Hh.x1 - 0.42, floorY + 0.875, hip.z - 0.42, '#dfe6ea'); box(0.03, 0.5, 0.03, Hh.x1 - 0.8, floorY + 1.2, hip.z - 0.14, '#9aa3ad');                              // fridge
  // the front door, dining table, plants, pictures, a standing lamp
  TAG = 'door'; box(0.08, 2.05, 1.0, 3.05, floorY + 1.02, DOOR[1], '#c9744f'); box(0.1, 2.15, 0.08, 3.04, floorY + 1.07, DOOR[1] - 0.54, '#ffffff'); box(0.1, 2.15, 0.08, 3.04, floorY + 1.07, DOOR[1] + 0.54, '#ffffff'); ball(0.035, 2.99, floorY + 1.0, DOOR[1] + 0.36, '#ffd166');
  TAG = ''; const dx = -3.25, dz = hip.z + 3.5; cyl(0.62, 0.62, 0.05, dx, floorY + 0.75, dz, '#8a5a34', 28); cyl(0.07, 0.2, 0.73, dx, floorY + 0.37, dz, '#6b4326');
  for (const [ax, az, ry] of [[-0.85, 0, Math.PI / 2], [0.85, 0, -Math.PI / 2]]) { box(0.42, 0.05, 0.42, dx + ax, floorY + 0.46, dz + az, '#f6e7c8'); box(0.42, 0.5, 0.05, dx + ax * 1.24, floorY + 0.73, dz + az, '#8a5a34', 0, ry); cyl(0.03, 0.03, 0.44, dx + ax, floorY + 0.22, dz + az, '#6b4326'); }
  plant(Hh.x0 + 0.4, Hh.z0 + 0.45, 1.5); plant(2.55, hip.z + 3.9, 1.2); plant(-2.3, tvZ - 0.05, 1);
  box(0.035, 1.55, 0.035, -2.15, floorY + 0.78, backZ + 0.05, '#5a4636'); box(0.3, 0.03, 0.3, -2.15, floorY + 0.015, backZ + 0.05, '#5a4636'); glow(new THREE.CylinderGeometry(0.12, 0.2, 0.26, 18, 1, true), '#ffe2ad', -2.15, floorY + 1.62, backZ + 0.05).material.side = THREE.DoubleSide;
  picture('E', Hh.x1, hip.z + 2.6, 1.6, 1.1, 0.75, (c, W, H) => { c.fillStyle = '#fbf7ef'; c.fillRect(0, 0, W, H); c.fillStyle = '#7fd0ff'; c.fillRect(14, 14, W - 28, H * 0.55); c.fillStyle = '#56ab66'; c.beginPath(); c.moveTo(14, H * 0.62); c.lineTo(90, 60); c.lineTo(160, H * 0.62); c.fill(); c.fillStyle = '#3f8f52'; c.beginPath(); c.moveTo(110, H * 0.62); c.lineTo(190, 40); c.lineTo(W - 14, H * 0.62); c.fill(); c.fillStyle = '#f0ad4e'; c.fillRect(14, H * 0.62, W - 28, H * 0.38 - 14); });
  picture('S', Hh.z1, 1.6, 1.65, 0.6, 0.6, (c, W, H) => { c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); for (let i = 0; i < 4; i++) { c.fillStyle = ['#d9534f', '#f0ad4e', '#5bc0de', '#56ab66'][i]; c.fillRect(20 + (i % 2) * 112, 20 + (i > 1) * 112, 104, 104); } });

  // ---- for first person: the room's edges, what is in the way, where you arrive and where you can sit ----
  const eyeH = floorY + 1.6;
  const blocks = {
    dorm: [[-0.62, 0.62, hip.z - 0.62, hip.z + 0.58], [-0.58, 0.58, tableZ - 0.42, tableZ + 0.42], [SHELF.x - 0.6, SHELF.x + 0.6, D.z0, SHELF.z + 0.35], [COUNTER.x - 0.5, D.x1, D.z0, COUNTER.z + 0.42], [D.x0, bedX + 0.6, bedZ - 1.1, bedZ + 1.1], [deskX - 0.75, deskX + 0.75, deskZ - 0.95, D.z1]],
    house: [[cx - cw / 2 - 0.1, 0.55, hip.z - 0.62, hip.z + 0.58], [-1.3, 0.4, tableZ - 0.4, tableZ + 0.48], [SHELF.x - 0.6, SHELF.x + 0.6, Hh.z0, SHELF.z + 0.35], [kx0 - 0.1, Hh.x1, Hh.z0, COUNTER.z + 0.45], [tvX - 0.95, tvX + 0.95, tvZ - 0.4, Hh.z1], [dx - 1.25, dx + 1.25, dz - 0.75, dz + 0.75], [Hh.x1 - 0.85, Hh.x1, hip.z - 0.85, hip.z - 0.05]],
  };
  // what she cannot walk through: the real footprints of the furniture [x0, x1, z0, z1] (her path finder pads them)
  const pot = (x, z, r) => [x - r, x + r, z - r, z + r];
  const solid = {
    dorm: [[-0.44, 0.44, hip.z - 0.5, hip.z + 0.3], [-0.4, 0.4, tableZ - 0.18, tableZ + 0.22], [SHELF.x - 0.47, SHELF.x + 0.47, D.z0, SHELF.z + 0.15], [COUNTER.x - 0.38, COUNTER.x + 0.38, D.z0, COUNTER.z + 0.25], [COUNTER.x + 0.5, COUNTER.x + 1.0, D.z0, COUNTER.z + 0.27],
      pot(0.75, backZ + 0.1, 0.04), [D.x0, bedX + 0.5, bedZ - 1.04, bedZ + 1.0], [deskX - 0.65, deskX + 0.65, deskZ - 0.3, D.z1], [deskX - 0.33, deskX + 0.13, deskZ - 0.87, deskZ - 0.4]],
    house: [[cx - cw / 2 - 0.05, 0.49, hip.z - 0.5, hip.z + 0.31], [-1.2, 0.3, tableZ - 0.18, tableZ + 0.32], [SHELF.x - 0.47, SHELF.x + 0.47, Hh.z0, SHELF.z + 0.15], [kx0, Hh.x1, Hh.z0, COUNTER.z + 0.28], [Hh.x1 - 0.77, Hh.x1, hip.z - 0.75, hip.z - 0.09],
      [tvX - 0.85, tvX + 0.85, tvZ - 0.21, Hh.z1], [dx - 1.1, dx + 1.1, dz - 0.62, dz + 0.62], pot(Hh.x0 + 0.4, Hh.z0 + 0.45, 0.3), pot(2.55, hip.z + 3.9, 0.24), pot(-2.3, tvZ - 0.05, 0.2), pot(-2.15, backZ + 0.05, 0.04)],
  };
  // ---- from the Studio's map editor: extra things placed in her dorm and your house, and whole new rooms.
  // A new room is her usual furniture (chair, table, shelf, counter, door: so her routine works) in a shell of its own size
  // and colours, plus whatever was placed in it.
  const maps = A.maps || {}, groups = { dorm, house }, names = { dorm: 'her dorm', house: 'your house' }, bounds = { dorm: D, house: Hh }, spawn = { dorm: [2.2, hip.z + 1.1], house: [-1.9, hip.z + 2.5] };
  const baseSolid = { dorm: solid.dorm.map(r => [...r]), house: solid.house.map(r => [...r]) };
  const alive = {}, bare = {}, dark = {}, perches = {};   // perches: the placed things she can go and sit or lie on   // alive: what moves in each room (flames, lights); bare: rooms without her dorm furniture
  function addItems(group, name, items) {
    const g = new THREE.Group(); g.position.y = floorY;
    for (const it of items || []) { try { const b = buildItem(THREE, toon, outline, it); g.add(b); if (b.userData.tick) (alive[name] = alive[name] || []).push(b.userData.tick); const pc = perchOf(it); if (pc && Math.hypot(it.x, it.z - hip.z) > 0.5) (perches[name] = perches[name] || []).push(pc); if (it.solid) { const f = footprint(it); solid[name].push(f); blocks[name].push(f); } } catch (e) { console.warn('map item', e); } }
    group.add(g);
  }
  addItems(dorm, 'dorm', (maps.dorm || {}).items); addItems(house, 'house', (maps.house || {}).items);
  for (const m of maps.custom || []) {
    if (!m || !m.id || groups[m.id]) continue;
    const g = new THREE.Group(); g.visible = false; into = g; place = m.id; TAG = '';
    const B = { x0: -2.05 - (+m.left || 0), x1: 3.1 + (+m.right || 0), z0: D.z0, z1: hip.z + 3.05 + (+m.front || 0), h: Math.max(2.3, +m.height || 2.6) }, out = world(m.outside === 'yard' ? 'yard' : 'campus');
    bare[m.id] = !!m.bare; dark[m.id] = m.open ? (m.sky === 'night' ? 1 : m.sky === 'dusk' ? 0.5 : 0) : Math.max(0, Math.min(1, +m.dim || 0));
    if (m.open) { // outdoors: ground to the horizon, a sky, no walls
      const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
      TAG = 'floor'; reg(flat(B.x1 - B.x0, B.z1 - B.z0, cx, floorY - 0.006, cz, toon(m.floor || '#4f8a55'), true)); TAG = '';
      const far = new THREE.Mesh(new THREE.CircleGeometry(30, 48), toon(m.floor || '#4f8a55')); far.rotation.x = -Math.PI / 2; far.position.set(cx, floorY - 0.012, cz); g.add(far);
      const SKY = { night: ['#070b24', '#1b2452', '#3a3f7a'], dusk: ['#2a2f6e', '#c76a8a', '#ffb27a'], day: ['#3f8fe0', '#8cc8ff', '#e6f6ff'] }[m.sky] || ['#3f8fe0', '#8cc8ff', '#e6f6ff'];
      const sky = new THREE.Mesh(new THREE.SphereGeometry(32, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, map: paint(64, 512, (c, W, H) => {
        const gr = c.createLinearGradient(0, 0, 0, H * 0.52); gr.addColorStop(0, SKY[0]); gr.addColorStop(0.6, SKY[1]); gr.addColorStop(1, SKY[2]); c.fillStyle = gr; c.fillRect(0, 0, W, H); c.fillStyle = SKY[2]; c.fillRect(0, H * 0.52, W, H); }) })); sky.position.set(cx, floorY, cz); g.add(sky);
      if (m.sky === 'night' || m.sky === 'dusk') {
        const n = m.sky === 'night' ? 420 : 90, pos = new Float32Array(n * 3); for (let k = 0; k < n; k++) { const a = (k * 2.399963) % (Math.PI * 2), e = 0.12 + 1.35 * ((k * 0.6180339) % 1), r = 30; pos[k * 3] = cx + r * Math.cos(e) * Math.cos(a); pos[k * 3 + 1] = floorY + r * Math.sin(e); pos[k * 3 + 2] = cz + r * Math.cos(e) * Math.sin(a); }
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true })); g.add(stars);
        const moon = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), new THREE.MeshBasicMaterial({ color: '#fff6d8' })); moon.position.set(cx - 9, floorY + 13, B.z0 - 22); moon.lookAt(cx, floorY + 1.5, cz); g.add(moon);
        const halo = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), new THREE.MeshBasicMaterial({ color: '#fff6d8', transparent: true, opacity: 0.16 })); halo.position.copy(moon.position); halo.position.z -= 0.1; halo.quaternion.copy(moon.quaternion); g.add(halo);
        (alive[m.id] = alive[m.id] || []).push(t => { stars.material.opacity = 0.8 + 0.2 * Math.sin(t / 900); });
      }
    } else {
    TAG = 'floor'; reg(flat(B.x1 - B.x0, B.z1 - B.z0, (B.x0 + B.x1) / 2, floorY - 0.006, (B.z0 + B.z1) / 2, toon(m.floor || '#3a2f52'), true));
    TAG = ''; flat(B.x1 - B.x0, B.z1 - B.z0, (B.x0 + B.x1) / 2, floorY + B.h, (B.z0 + B.z1) / 2, toon('#f2eef6'), false);
    const wc = m.wall || '#6d5a8f';
    wall('N', B.z0, B.x0, B.x1, B.h, wc, m.windows === false ? [] : [{ at: 0.1, w: 1.15, y0: 1.05, y1: 2.05 }], out);
    wall('W', B.x0, B.z0, B.z1, B.h, wc, m.windows === false ? [] : [{ at: (B.z0 + B.z1) / 2, w: 1.4, y0: 0.95, y1: 2.05 }], out); wall('E', B.x1, B.z0, B.z1, B.h, wc); wall('S', B.z1, B.x0, B.x1, B.h, wc);
    }
    groups[m.id] = g; names[m.id] = m.name || 'a new place'; bounds[m.id] = B; spawn[m.id] = [2.2, hip.z + 1.1];
    solid[m.id] = [solid.dorm[0], solid.dorm[1], solid.dorm[2], solid.dorm[3], solid.dorm[5]].map(r => [...r]); blocks[m.id] = blocks.dorm.slice(0, 4).map(r => [...r]);
    addItems(g, m.id, m.items);
  }
  return {
    groups, names, baseSolid, floorY,
    dorm, house, toon, outline, eyeH, solid,
    bounds, blocks, spawn, bare, dark, perches,
    live(name, t, night) { for (const f of alive[name] || []) f(t, night); },   // what moves in the room on screen
    seat: { dorm: { tag: 'bed', at: [bedX + 0.62, bedZ + 0.2], out: [bedX + 0.95, bedZ + 0.2], h: floorY + 1.12 }, house: { tag: 'chair', at: [-0.78, hip.z + 0.22], out: [-2.6, hip.z + 0.5], h: seatTop + 0.66 } },
    bed: { side: [bedX + 0.8, bedZ - 0.1], at: [bedX, bedZ - 0.1], top: floorY + 0.58 },
    mugAt: new THREE.Vector3(-0.55, tableTop + 0.045, tableZ + 0.16), lampAt: new THREE.Vector3(-2.15, floorY + 1.62, backZ + 0.05),
    tv: { screen: tvScreen, on: false, at: new THREE.Vector3(tvX, floorY + 1.02, tvZ) },
    tick(night, t) { // dusk and dark outside; the TV flickers when it is on
      const k = 1 - 0.72 * night; for (const m of worldMats) m.color.setRGB(k, k * (1 - 0.05 * night) + 0.03 * night, k + 0.12 * night);
      if (this.tv.on) this.tv.screen.material.color.setHSL((t / 9000) % 1, 0.55, 0.5 + 0.12 * Math.sin(t / 170)); else this.tv.screen.material.color.set('#101018');
    },
  };
}
