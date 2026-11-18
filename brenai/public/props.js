// The modelled props: things built from rounded, turned and swept shapes rather than plain boxes, for the rooms made in the Studio.
// PROPS[kind] = { name, group, size [w, h, d] (metres), color, flat (she can walk over it), make(K) }
// make(K) builds the prop standing on y = 0, facing +z, with the kit below. Colours: 'c' the prop's own colour, 'c2' darker, 'c3' lighter.
// K.anim(fn) registers fn(t, night) to run every frame the room is on screen (flames, twinkling lights, screens).
const lerpHex = (hex, to, k) => { const n = parseInt(hex.slice(1), 16), m = parseInt(to.slice(1), 16); return '#' + [16, 8, 0].map(s => Math.round(((n >> s) & 255) * (1 - k) + ((m >> s) & 255) * k).toString(16).padStart(2, '0')).join(''); };
export function kit(THREE, toon, outline, col, g) {
  const ticks = [], inkMat = outline ? new THREE.MeshBasicMaterial({ color: '#1a1026', side: THREE.BackSide }) : null;
  const colour = c => c === 'c' ? col : c === 'c2' ? lerpHex(col, '#000000', 0.28) : c === 'c3' ? lerpHex(col, '#ffffff', 0.35) : c;
  // a smooth shape gets an inked shell (the anime line that follows its silhouette); a hard-edged one gets inked edges
  const hull = (m, w = 0.008) => { const geo = m.geometry.clone(), p = geo.attributes.position, n = geo.attributes.normal; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * w, p.getY(i) + n.getY(i) * w, p.getZ(i) + n.getZ(i) * w); const h = new THREE.Mesh(geo, inkMat); m.add(h); };
  function add(geo, c, x = 0, y = 0, z = 0, o = {}) {
    const mat = o.mat || (o.glow ? new THREE.MeshBasicMaterial({ color: colour(c), side: o.two ? THREE.DoubleSide : THREE.FrontSide, transparent: o.alpha !== undefined, opacity: o.alpha === undefined ? 1 : o.alpha }) : toon(colour(c), { ...(o.map ? { map: o.map } : {}), ...(o.two ? { side: THREE.DoubleSide } : {}), ...(o.alpha !== undefined ? { transparent: true, opacity: o.alpha } : {}) }));
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (o.r) m.rotation.set(o.r[0] || 0, o.r[1] || 0, o.r[2] || 0); if (o.s) m.scale.set(o.s[0], o.s[1], o.s[2]);
    if (outline && !o.glow && !o.noink && o.alpha === undefined) { if (o.hard) outline(m); else if (o.ink !== false) hull(m, o.inkW); }
    (o.into || g).add(m); return m;
  }
  const K = {
    THREE, g, col, colour, toon, mesh: add,
    box: (w, h, d, c, x, y, z, o = {}) => add(new THREE.BoxGeometry(w, h, d), c, x, y, z, { hard: true, ...o }),
    // a box with its corners and edges rounded off by r
    rbox(w, h, d, r, c, x, y, z, o = {}) {
      r = Math.min(r, w / 2, h / 2, d / 2); const seg = o.seg || 5, geo = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = geo.attributes.position, v = new THREE.Vector3(), q = new THREE.Vector3(), nrm = [];
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); q.set(Math.max(-w / 2 + r, Math.min(w / 2 - r, v.x)), Math.max(-h / 2 + r, Math.min(h / 2 - r, v.y)), Math.max(-d / 2 + r, Math.min(d / 2 - r, v.z))); const n = v.clone().sub(q); if (n.lengthSq() > 1e-10) { n.normalize(); v.copy(q).addScaledVector(n, r); p.setXYZ(i, v.x, v.y, v.z); nrm.push(n.x, n.y, n.z); } else { const a = geo.attributes.normal; nrm.push(a.getX(i), a.getY(i), a.getZ(i)); } }
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); return add(geo, c, x, y, z, o);
    },
    cyl: (rt, rb, h, c, x, y, z, o = {}) => add(new THREE.CylinderGeometry(rt, rb, h, o.seg || 24, 1, !!o.open, 0, o.arc || Math.PI * 2), c, x, y, z, o),
    ball: (r, c, x, y, z, o = {}) => add(new THREE.SphereGeometry(r, o.seg || 20, o.seg ? Math.ceil(o.seg * 0.7) : 14), c, x, y, z, o),
    cone: (r, h, c, x, y, z, o = {}) => add(new THREE.ConeGeometry(r, h, o.seg || 24), c, x, y, z, o),
    torus: (R, r, c, x, y, z, o = {}) => add(new THREE.TorusGeometry(R, r, 10, o.seg || 28, o.arc || Math.PI * 2), c, x, y, z, o),
    ico: (r, c, x, y, z, o = {}) => add(new THREE.IcosahedronGeometry(r, o.detail || 0), c, x, y, z, { hard: true, ...o }),
    // turned on a lathe: pts are [radius, height] pairs from the bottom up
    lathe: (pts, c, x, y, z, o = {}) => add(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(r, 0.0001), h)), o.seg || 28), c, x, y, z, { two: true, ...o }),
    // a round bar swept along points
    tube: (pts, r, c, o = {}) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'catmullrom', o.tension === undefined ? 0.5 : o.tension), o.steps || pts.length * 6, r, 8, false), c, 0, 0, 0, o),
    // a flat panel (faces +z unless rotated); give it a painted texture with o.map
    plane: (w, h, c, x, y, z, o = {}) => add(new THREE.PlaneGeometry(w, h), c, x, y, z, { ink: false, two: true, ...o }),
    disc: (r, c, x, y, z, o = {}) => add(new THREE.CircleGeometry(r, o.seg || 32), c, x, y, z, { ink: false, r: [-Math.PI / 2, 0, 0], ...o }),
    paint(w, h, draw) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; },
    light(c, power, reach, x, y, z) { const l = new THREE.PointLight(c, power, reach, 1.7); l.position.set(x, y, z); g.add(l); return l; },
    // a living flame: two nested teardrops that lick and sway
    flame(x, y, z, s = 1, seed = 0) {
      const tear = [[0, 0], [0.05, 0.02], [0.075, 0.07], [0.06, 0.13], [0.03, 0.19], [0, 0.25]], grp = new THREE.Group(); grp.position.set(x, y, z); grp.scale.setScalar(s); g.add(grp);
      const a = add(new THREE.LatheGeometry(tear.map(([r, h]) => new THREE.Vector2(Math.max(r, 0.0001), h)), 14), '#ff8a3c', 0, 0, 0, { glow: true, into: grp }), b = add(new THREE.LatheGeometry(tear.map(([r, h]) => new THREE.Vector2(Math.max(r * 0.55, 0.0001), h * 0.7)), 12), '#ffe27a', 0, 0.01, 0, { glow: true, into: grp });
      ticks.push(t => { const k = t / 1000 + seed * 7.3, f = 1 + 0.16 * Math.sin(k * 9.1) + 0.1 * Math.sin(k * 15.7 + 1); a.scale.set(1 - 0.08 * Math.sin(k * 11), f, 1 - 0.08 * Math.cos(k * 13)); b.scale.set(1, 1 + 0.2 * Math.sin(k * 12.3 + 2), 1); grp.rotation.z = 0.07 * Math.sin(k * 5.3); grp.rotation.x = 0.06 * Math.sin(k * 4.1 + 1); });
      return grp;
    },
    anim: fn => ticks.push(fn), ticks,
  };
  return K;
}
const TAU = Math.PI * 2, ring = (n, fn) => { for (let i = 0; i < n; i++) fn(i / n * TAU, i); };
const P = (name, group, size, color, make, flat = false) => ({ name, group, size, color, make, flat });
const wood = '#8a5a34', dark = '#2b2433', cream = '#f5ecd9', steel = '#aab2bd';

export const PROPS = {
  // ---------- hanging out ----------
  beanbag: P('Bean bag', 'Hangout', [0.95, 0.7, 0.95], '#e0567a', K => {
    K.lathe([[0, 0.02], [0.3, 0.0], [0.44, 0.06], [0.47, 0.18], [0.42, 0.32], [0.3, 0.4], [0.16, 0.42], [0, 0.4]], 'c', 0, 0, 0);
    K.ball(0.34, 'c', 0, 0.44, -0.2, { s: [1.15, 0.85, 0.6] }); K.ball(0.05, 'c2', 0, 0.42, 0.02, { s: [1, 0.35, 1], ink: false });
  }),
  pouf: P('Floor cushion', 'Hangout', [0.7, 0.24, 0.7], '#7b4fd1', K => {
    K.lathe([[0, 0], [0.26, 0], [0.34, 0.05], [0.35, 0.12], [0.3, 0.2], [0.18, 0.23], [0, 0.22]], 'c', 0, 0, 0); K.torus(0.345, 0.012, 'c3', 0, 0.115, 0, { r: [Math.PI / 2, 0, 0], ink: false }); K.ball(0.035, 'c3', 0, 0.225, 0, { s: [1, 0.4, 1], ink: false });
  }, true),
  cushions: P('Pile of cushions', 'Hangout', [0.9, 0.4, 0.8], '#ffb347', K => {
    K.rbox(0.5, 0.14, 0.5, 0.07, 'c', -0.12, 0.07, 0.02, { r: [0, 0.3, 0] }); K.rbox(0.46, 0.13, 0.46, 0.065, '#e0567a', 0.14, 0.09, -0.1, { r: [0.1, -0.4, 0.12] }); K.rbox(0.42, 0.12, 0.42, 0.06, '#6fc3df', -0.02, 0.24, -0.04, { r: [-0.12, 0.8, 0.1] }); K.rbox(0.3, 0.3, 0.1, 0.05, cream, 0.26, 0.2, 0.2, { r: [-0.5, -0.5, 0] });
  }, true),
  recordplayer: P('Record player', 'Hangout', [0.7, 0.75, 0.45], '#8a5a34', K => {
    K.rbox(0.7, 0.42, 0.42, 0.03, 'c', 0, 0.33, 0); for (const x of [-0.28, 0.28]) for (const z of [-0.15, 0.15]) K.cyl(0.02, 0.012, 0.13, 'c2', x, 0.065, z, { r: [0, 0, x > 0 ? -0.12 : 0.12] });
    K.box(0.62, 0.16, 0.01, dark, 0, 0.36, 0.212, { noink: true }); for (let i = 0; i < 9; i++) K.box(0.012, 0.15, 0.012, ['#e0567a', '#ffd166', '#6fc3df', cream, '#7b4fd1'][i % 5], -0.26 + i * 0.065, 0.36, 0.216, { noink: true });
    K.rbox(0.44, 0.05, 0.36, 0.015, dark, -0.08, 0.565, 0); const disc = K.cyl(0.15, 0.15, 0.012, '#15131c', -0.12, 0.598, 0); K.cyl(0.05, 0.05, 0.014, '#e0567a', -0.12, 0.6, 0, { ink: false }); K.box(0.012, 0.012, 0.2, steel, 0.08, 0.61, -0.02, { r: [0, 0.35, 0], noink: true }); K.cyl(0.022, 0.022, 0.03, steel, 0.11, 0.605, -0.11, { ink: false });
    K.anim(t => { disc.rotation.y = t / 500; });
  }),
  guitar: P('Guitar on a stand', 'Hangout', [0.45, 1.1, 0.4], '#c9744f', K => {
    const G = new K.THREE.Group(); G.position.set(0, 0.12, 0.02); G.rotation.x = -0.2; K.g.add(G); const o = { into: G };
    K.cyl(0.19, 0.19, 0.09, 'c', 0, 0.2, 0, { ...o, r: [Math.PI / 2, 0, 0], s: [1, 1, 1.05] }); K.cyl(0.145, 0.145, 0.09, 'c', 0, 0.45, 0, { ...o, r: [Math.PI / 2, 0, 0] }); K.cyl(0.05, 0.05, 0.092, '#1b1420', 0, 0.36, 0.001, { ...o, r: [Math.PI / 2, 0, 0], ink: false });
    K.box(0.05, 0.5, 0.03, '#3a2a22', 0, 0.8, 0.03, { ...o }); K.rbox(0.08, 0.15, 0.03, 0.012, 'c2', 0, 1.1, 0.03, o); K.box(0.1, 0.02, 0.02, cream, 0, 0.16, 0.05, { ...o, noink: true }); for (let i = 0; i < 4; i++) K.box(0.003, 0.9, 0.003, '#e8e8f0', -0.015 + i * 0.01, 0.62, 0.05, { ...o, noink: true });
    K.tube([[-0.18, 0, 0.16], [0, 0.14, -0.06], [0.18, 0, 0.16]], 0.012, dark, { ink: false }); K.tube([[0, 0.14, -0.06], [0, 0, -0.2]], 0.012, dark, { ink: false }); K.tube([[0, 0.14, -0.06], [0, 0.95, -0.2]], 0.012, dark, { ink: false });
  }),
  projector: P('Movie screen', 'Hangout', [2.2, 1.9, 0.5], '#f4f1ea', K => {
    for (const x of [-1.02, 1.02]) { K.cyl(0.02, 0.02, 1.86, dark, x, 0.93, 0, { ink: false }); K.tube([[x - 0.02, 0, 0.22], [x, 0.12, 0], [x + 0.02, 0, -0.22]], 0.014, dark, { ink: false }); }
    K.box(2.1, 1.22, 0.02, dark, 0, 1.22, 0); const scr = K.plane(2.0, 1.12, '#dfe6f5', 0, 1.22, 0.012, { glow: true }); K.cyl(0.035, 0.035, 2.14, steel, 0, 1.85, 0, { r: [0, 0, Math.PI / 2] });
    K.anim(t => { const k = t / 1000; scr.material.color.setHSL((0.58 + 0.12 * Math.sin(k * 0.23) + (Math.sin(k * 1.7) > 0.93 ? 0.3 : 0)) % 1, 0.45, 0.62 + 0.1 * Math.sin(k * 2.9) * Math.sin(k * 0.7)); });
  }),
  lavalamp: P('Lava lamp', 'Hangout', [0.16, 0.42, 0.16], '#c44fd1', K => {
    K.lathe([[0.075, 0], [0.07, 0.03], [0.045, 0.1]], steel, 0, 0, 0); K.lathe([[0.045, 0.1], [0.062, 0.2], [0.04, 0.34]], 'c', 0, 0, 0, { glow: true, alpha: 0.75 }); K.lathe([[0.04, 0.34], [0.03, 0.4], [0, 0.41]], steel, 0, 0, 0);
    const blobs = [0, 1, 2].map(i => K.ball(0.022 - i * 0.004, '#ffe27a', 0, 0.2, 0, { glow: true })); K.anim(t => blobs.forEach((b, i) => { const k = t / 2600 + i * 2.1; b.position.set(0.012 * Math.sin(k * 1.3), 0.22 + 0.085 * Math.sin(k), 0.012 * Math.cos(k * 0.9)); b.scale.y = 1.2 + 0.3 * Math.sin(k * 2); }));
  }, true),
  // ---------- study session ----------
  whiteboard: P('Whiteboard', 'Study', [1.5, 1.8, 0.5], '#f7f8fb', K => {
    const tex = K.paint(512, 320, (c, W, H) => { c.fillStyle = '#fbfcff'; c.fillRect(0, 0, W, H); c.lineWidth = 4; c.lineCap = 'round';
      c.strokeStyle = '#2f4a7a'; c.font = 'bold 34px sans-serif'; c.fillStyle = '#2f4a7a'; c.fillText('MIDTERM: FRI', 24, 48); c.beginPath(); c.moveTo(24, 62); c.lineTo(250, 62); c.stroke();
      c.strokeStyle = '#d9534f'; c.beginPath(); c.moveTo(40, 250); c.lineTo(40, 110); c.moveTo(40, 250); c.lineTo(220, 250); c.stroke(); c.strokeStyle = '#3f9a5a'; c.beginPath(); c.moveTo(40, 240); c.bezierCurveTo(100, 235, 130, 120, 215, 112); c.stroke();
      c.fillStyle = '#1a1026'; c.font = '26px sans-serif'; ['1. read ch. 7', '2. flash cards', '3. snacks!!', '4. sleep (lol)'].forEach((s, i) => c.fillText(s, 280, 120 + i * 44)); c.strokeStyle = '#7b4fd1'; c.beginPath(); c.arc(340, 196, 62, 0, 7); c.stroke(); });
    K.rbox(1.46, 0.96, 0.04, 0.015, steel, 0, 1.28, 0); K.plane(1.38, 0.88, '#ffffff', 0, 1.28, 0.022, { map: tex }); K.box(1.3, 0.03, 0.07, steel, 0, 0.8, 0.04); for (const [x, c] of [[-0.3, '#d9534f'], [-0.2, '#2f4a7a'], [-0.1, '#3f9a5a']]) K.cyl(0.011, 0.011, 0.09, c, x, 0.83, 0.05, { r: [0, 0, Math.PI / 2], ink: false });
    for (const x of [-0.66, 0.66]) { K.cyl(0.018, 0.018, 1.7, dark, x, 0.87, 0, { ink: false }); K.box(0.04, 0.03, 0.5, dark, x, 0.035, 0); for (const z of [-0.22, 0.22]) K.ball(0.03, '#15131c', x, 0.03, z, { ink: false }); }
  }),
  desklamp: P('Desk lamp', 'Study', [0.2, 0.45, 0.3], '#ffd166', K => {
    K.cyl(0.07, 0.08, 0.02, 'c2', 0, 0.01, 0); K.tube([[0, 0.02, 0], [0, 0.2, -0.05], [0, 0.36, 0.02]], 0.01, 'c2', { ink: false }); K.ball(0.016, steel, 0, 0.2, -0.05, { ink: false });
    K.lathe([[0.02, 0.06], [0.05, 0.04], [0.075, 0]], 'c', 0, 0.32, 0.07, { r: [0.9, 0, 0] }); K.ball(0.03, '#fff3c4', 0, 0.335, 0.085, { glow: true }); K.light('#ffe2ad', 0.7, 2.2, 0, 0.25, 0.16);
  }, true),
  laptop: P('Laptop and notes', 'Study', [0.6, 0.26, 0.4], '#aab2bd', K => {
    K.rbox(0.34, 0.016, 0.24, 0.006, 'c', -0.1, 0.008, 0.02, { seg: 2 }); K.box(0.3, 0.002, 0.12, dark, -0.1, 0.017, 0, { noink: true }); K.rbox(0.34, 0.23, 0.012, 0.005, 'c', -0.1, 0.12, -0.13, { r: [-0.25, 0, 0], seg: 2 });
    const scr = K.plane(0.31, 0.2, '#9fd0ff', -0.1, 0.121, -0.122, { r: [-0.25, 0, 0], glow: true }); K.anim(t => scr.material.color.setHSL(0.58, 0.6, 0.72 + 0.04 * Math.sin(t / 900)));
    K.box(0.2, 0.012, 0.27, cream, 0.2, 0.006, 0.03, { r: [0, -0.2, 0] }); K.box(0.2, 0.004, 0.27, '#ffe680', 0.19, 0.014, 0.02, { r: [0, 0.1, 0], noink: true }); K.cyl(0.006, 0.006, 0.15, '#d9534f', 0.22, 0.022, 0.05, { r: [Math.PI / 2, 0, 0.5], ink: false });
  }, true),
  backpack: P('Backpack', 'Study', [0.38, 0.48, 0.3], '#3d6b8f', K => {
    K.rbox(0.34, 0.44, 0.2, 0.09, 'c', 0, 0.22, 0); K.rbox(0.26, 0.2, 0.08, 0.04, 'c2', 0, 0.15, 0.11); K.torus(0.05, 0.012, 'c2', 0, 0.45, 0, { ink: false }); K.box(0.2, 0.012, 0.012, '#ffd166', 0, 0.3, 0.102, { noink: true });
    for (const x of [-0.1, 0.1]) K.tube([[x, 0.4, -0.09], [x * 1.2, 0.25, -0.15], [x, 0.06, -0.1]], 0.016, 'c2', { ink: false });
  }),
  coffeecart: P('Coffee station', 'Study', [0.9, 1.25, 0.5], '#6b4a35', K => {
    K.rbox(0.9, 0.05, 0.5, 0.02, 'c', 0, 0.86, 0, { seg: 3 }); K.rbox(0.86, 0.04, 0.46, 0.015, 'c', 0, 0.3, 0, { seg: 3 }); for (const x of [-0.4, 0.4]) for (const z of [-0.2, 0.2]) { K.cyl(0.02, 0.02, 0.84, dark, x, 0.44, z, { ink: false }); K.ball(0.035, '#15131c', x, 0.035, z, { ink: false }); }
    K.rbox(0.3, 0.34, 0.26, 0.04, '#d9534f', -0.22, 1.055, -0.04); K.box(0.2, 0.1, 0.02, dark, -0.22, 1.1, 0.092, { noink: true }); K.cyl(0.05, 0.04, 0.09, '#f7f3ea', -0.22, 0.93, 0.1); K.ball(0.012, '#7dff9a', -0.12, 1.18, 0.092, { glow: true });
    ring(3, (a, i) => { K.cyl(0.04, 0.032, 0.08, ['#f7f3ea', '#6fc3df', '#ffd166'][i], 0.2 + 0.1 * Math.cos(a), 0.925, 0.02 + 0.1 * Math.sin(a)); }); K.cyl(0.06, 0.06, 0.16, '#3a2a22', 0.3, 0.4, 0); K.cyl(0.062, 0.062, 0.02, cream, 0.3, 0.49, 0, { ink: false }); K.rbox(0.3, 0.12, 0.2, 0.03, '#f4c9c0', -0.15, 0.38, 0);
  }),
  bookpile: P('Tower of books', 'Study', [0.4, 0.75, 0.34], '#7a1f3a', K => {
    const cols = ['c', '#2f4a7a', '#3d6b4f', '#8a6a2a', '#5b3570', '#c9744f', '#2b6b6b', '#d9534f', '#3a3044']; let y = 0;
    cols.forEach((c, i) => { const h = 0.05 + (i * 7 % 4) * 0.012, w = 0.3 - (i % 3) * 0.03; K.rbox(w, h, 0.22, 0.008, c, ((i * 5) % 3 - 1) * 0.02, y + h / 2, 0, { r: [0, ((i * 3) % 5 - 2) * 0.12, 0], seg: 2 }); K.box(w - 0.02, h - 0.014, 0.01, cream, ((i * 5) % 3 - 1) * 0.02, y + h / 2, 0.106, { r: [0, ((i * 3) % 5 - 2) * 0.12, 0], noink: true }); y += h; });
    K.cyl(0.04, 0.032, 0.08, '#f7f3ea', 0.02, y + 0.04, 0);
  }),
  // ---------- D&D night ----------
  gametable: P('Battle map table', 'Game night', [1.7, 0.82, 1.1], '#6b4a35', K => {
    const tex = K.paint(512, 320, (c, W, H) => { c.fillStyle = '#cdbf9a'; c.fillRect(0, 0, W, H); c.fillStyle = '#8fb27a'; c.fillRect(0, 0, W, 140); c.fillStyle = '#7d8a99'; c.fillRect(190, 90, 200, 190); c.fillStyle = '#5d6f8a'; c.fillRect(230, 130, 120, 110); c.fillStyle = '#6fa8dc'; c.beginPath(); c.moveTo(0, 200); c.bezierCurveTo(60, 180, 90, 260, 170, 250); c.lineTo(170, 320); c.lineTo(0, 320); c.fill();
      c.strokeStyle = 'rgba(40,30,20,.35)'; c.lineWidth = 1.5; for (let x = 0; x <= W; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } for (let y = 0; y <= H; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      c.fillStyle = '#3f8f52'; for (const [x, y] of [[60, 50], [110, 90], [440, 40], [470, 110], [420, 260]]) { c.beginPath(); c.arc(x, y, 16, 0, 7); c.fill(); } c.strokeStyle = '#b5523f'; c.lineWidth = 5; c.setLineDash([10, 8]); c.beginPath(); c.moveTo(20, 150); c.lineTo(180, 150); c.lineTo(200, 180); c.stroke(); });
    K.rbox(1.7, 0.08, 1.1, 0.03, 'c', 0, 0.76, 0, { seg: 3 }); K.box(1.5, 0.004, 0.9, '#2b6b4f', 0, 0.802, 0, { noink: true }); K.plane(1.1, 0.7, '#ffffff', 0.05, 0.806, 0.02, { map: tex, r: [-Math.PI / 2, 0, 0] });
    for (const x of [-0.72, 0.72]) for (const z of [-0.42, 0.42]) K.lathe([[0.05, 0], [0.035, 0.1], [0.05, 0.3], [0.04, 0.6], [0.06, 0.72]], 'c2', x, 0, z);
    for (const [x, z, c] of [[-0.1, 0.12, '#d9534f'], [0.08, -0.05, '#2f4a7a'], [0.3, 0.1, '#7b4fd1'], [0.2, -0.2, '#3f9a5a'], [0.42, -0.08, '#3a3044']]) { K.cyl(0.022, 0.026, 0.008, '#15131c', x, 0.812, z, { ink: false }); K.cone(0.018, 0.05, c, x, 0.84, z, { ink: false }); K.ball(0.013, c, x, 0.873, z, { ink: false }); }
    for (const [x, z, c, r] of [[-0.62, 0.3, '#e0567a', 0.022], [-0.56, 0.36, '#6fc3df', 0.018], [-0.66, 0.38, '#ffd166', 0.016], [0.66, -0.3, '#7dff9a', 0.022]]) K.ico(r, c, x, 0.8 + r, z, { r: [x * 9, z * 7, 1], noink: true });
    K.box(0.2, 0.004, 0.27, cream, -0.55, 0.804, -0.2, { r: [0, 0.3, 0], noink: true }); K.box(0.2, 0.004, 0.27, cream, 0.6, 0.804, 0.25, { r: [0, -0.2, 0], noink: true }); K.cyl(0.005, 0.005, 0.14, '#ffd166', -0.5, 0.81, -0.16, { r: [Math.PI / 2, 0, 0.8], ink: false });
  }),
  dmscreen: P('Game master screen', 'Game night', [0.9, 0.3, 0.3], '#5b1f2e', K => {
    const tex = K.paint(256, 128, (c, W, H) => { c.fillStyle = '#5b1f2e'; c.fillRect(0, 0, W, H); c.strokeStyle = '#d9b25a'; c.lineWidth = 4; c.strokeRect(8, 8, W - 16, H - 16); c.fillStyle = '#d9b25a'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 16 : 40; c.lineTo(W / 2 + r * Math.cos(a), H / 2 + r * Math.sin(a)); } c.fill(); });
    for (const [x, ry] of [[-0.29, 0.5], [0, 0], [0.29, -0.5]]) { const z = x ? 0.07 : 0; K.box(0.3, 0.28, 0.012, 'c', x, 0.14, z, { r: [0, ry, 0] }); K.plane(0.28, 0.26, '#ffffff', x + Math.sin(ry) * 0.008, 0.14, z + Math.cos(ry) * 0.008, { map: tex, r: [0, ry, 0], two: false }); K.plane(0.26, 0.22, cream, x - Math.sin(ry) * 0.008, 0.14, z - Math.cos(ry) * 0.008, { r: [0, ry + Math.PI, 0], two: false }); }
  }, true),
  dice: P('Giant dice', 'Game night', [0.5, 0.3, 0.4], '#e0567a', K => {
    K.ico(0.15, 'c', -0.08, 0.13, 0, { r: [0.55, 0.3, 0] }); K.box(0.16, 0.16, 0.16, '#6fc3df', 0.14, 0.08, 0.1, { r: [0, 0.6, 0] }); K.ico(0.07, '#ffd166', 0.08, 0.06, -0.12, { r: [1, 0.2, 0.4] });
    for (const [dx, dz] of [[0, 0], [-0.04, -0.04], [0.04, 0.04]]) K.ball(0.016, cream, 0.14 + dx * Math.cos(0.6) + dz * Math.sin(0.6), 0.162, 0.1 - dx * Math.sin(0.6) + dz * Math.cos(0.6), { s: [1, 0.3, 1], ink: false });
  }, true),
  chest: P('Treasure chest', 'Game night', [0.7, 0.6, 0.45], '#7a4a2a', K => {
    K.rbox(0.7, 0.3, 0.44, 0.02, 'c', 0, 0.15, 0, { seg: 3 }); const lid = new K.THREE.Group(); lid.position.set(0, 0.3, -0.22); lid.rotation.x = -0.75; K.g.add(lid);
    K.cyl(0.22, 0.22, 0.7, 'c', 0, 0, 0.22, { into: lid, r: [0, 0, Math.PI / 2], arc: Math.PI, two: true, hard: true }); for (const x of [-0.3, 0, 0.3]) { K.torus(0.224, 0.014, '#d9b25a', x, 0, 0.22, { into: lid, r: [0, Math.PI / 2, 0], ink: false }); K.box(0.04, 0.3, 0.45, '#d9b25a', x, 0.15, 0, { noink: true }); }
    K.rbox(0.09, 0.1, 0.03, 0.01, '#d9b25a', 0, 0.26, 0.225, { seg: 2 }); ring(9, (a, i) => K.cyl(0.035, 0.035, 0.01, '#ffd166', 0.2 * Math.cos(a) * (0.5 + (i % 3) * 0.25), 0.3 + (i % 2) * 0.012, 0.12 * Math.sin(a), { r: [0.3 * Math.sin(a * 3), 0, 0.3 * Math.cos(a * 2)], ink: false }));
    K.ico(0.04, '#e0567a', 0.1, 0.34, 0.02, { noink: true }); K.ico(0.035, '#6fc3df', -0.14, 0.335, -0.04, { noink: true }); const sp = K.ball(0.02, '#fff7c2', 0, 0.42, 0, { glow: true }); K.anim(t => { sp.scale.setScalar(0.6 + 0.6 * Math.abs(Math.sin(t / 700))); sp.position.x = 0.15 * Math.sin(t / 1900); });
  }),
  snacks: P('Snacks and soda', 'Game night', [0.6, 0.2, 0.45], '#d9534f', K => {
    K.lathe([[0.05, 0], [0.1, 0.02], [0.15, 0.09], [0.155, 0.1]], 'c', -0.12, 0, 0); ring(11, (a, i) => K.ball(0.03, i % 3 ? '#f2c14e' : '#f6dd8a', -0.12 + 0.085 * Math.cos(a) * (i % 2 ? 1 : 0.4), 0.1 + (i % 2 ? 0 : 0.02), 0.085 * Math.sin(a) * (i % 2 ? 1 : 0.4), { s: [1, 0.5, 1], ink: false }));
    for (const [x, z, c] of [[0.14, -0.08, '#d9534f'], [0.23, 0.02, '#3f9a5a'], [0.12, 0.1, '#7b4fd1']]) { K.cyl(0.033, 0.033, 0.12, c, x, 0.06, z); K.cyl(0.03, 0.03, 0.004, steel, x, 0.122, z, { ink: false }); }
  }, true),
  pizza: P('Pizza box', 'Game night', [0.45, 0.4, 0.45], '#c9a36a', K => {
    K.box(0.42, 0.04, 0.42, 'c', 0, 0.02, 0); K.box(0.42, 0.012, 0.42, 'c', 0, 0.22, -0.26, { r: [1.15, 0, 0] }); K.cyl(0.18, 0.18, 0.016, '#e8b860', 0, 0.05, 0, { ink: false }); K.cyl(0.16, 0.16, 0.018, '#d9534f', 0, 0.052, 0, { ink: false }); K.cyl(0.15, 0.15, 0.02, '#f6dd8a', 0, 0.053, 0, { ink: false });
    ring(7, (a, i) => K.cyl(0.022, 0.022, 0.022, '#b5352f', 0.09 * Math.cos(a + i) * (0.5 + (i % 2) * 0.5), 0.056, 0.09 * Math.sin(a + i) * (0.5 + (i % 2) * 0.5), { ink: false }));
  }, true),
  // ---------- romantic ----------
  dinner: P('Table for two', 'Romantic', [1.0, 1.05, 1.0], '#f4f1ea', K => {
    K.lathe([[0.22, 0], [0.2, 0.03], [0.04, 0.06], [0.035, 0.68], [0.1, 0.72]], dark, 0, 0, 0); K.lathe([[0, 0.745], [0.46, 0.745], [0.47, 0.73], [0.47, 0.7], [0.5, 0.52], [0.47, 0.5]], 'c', 0, 0, 0, { seg: 40 }); K.disc(0.46, 'c', 0, 0.746, 0);
    for (const z of [-0.26, 0.26]) { K.lathe([[0.04, 0], [0.1, 0.006], [0.125, 0.02]], '#ffffff', 0, 0.75, z); K.box(0.012, 0.004, 0.13, steel, 0.16, 0.752, z, { noink: true }); K.box(0.012, 0.004, 0.13, steel, -0.16, 0.752, z, { noink: true }); const x = z > 0 ? 0.2 : -0.2; K.lathe([[0.03, 0], [0.006, 0.01], [0.006, 0.09], [0.035, 0.12], [0.038, 0.17], [0.03, 0.19]], '#e9f4ff', x, 0.75, z * 0.55, { alpha: 0.55 }); K.cyl(0.03, 0.02, 0.04, '#8a1f3a', x, 0.89, z * 0.55, { ink: false }); }
    K.lathe([[0.03, 0], [0.045, 0.03], [0.02, 0.1], [0.025, 0.12]], '#6fc3df', 0.05, 0.75, 0.02); K.cyl(0.004, 0.004, 0.16, '#3f9a5a', 0.05, 0.93, 0.02, { ink: false }); K.ball(0.03, '#d9304f', 0.05, 1.02, 0.02, { s: [1, 0.9, 1] });
    K.cyl(0.018, 0.018, 0.16, cream, -0.07, 0.83, -0.02, { ink: false }); K.cyl(0.03, 0.035, 0.012, '#d9b25a', -0.07, 0.756, -0.02, { ink: false }); K.flame(-0.07, 0.91, -0.02, 0.3, 1); K.light('#ffc27a', 1.4, 2.6, -0.07, 1.05, -0.02);
  }),
  roses: P('Vase of roses', 'Romantic', [0.3, 0.6, 0.3], '#d9304f', K => {
    K.lathe([[0.05, 0], [0.09, 0.05], [0.1, 0.14], [0.05, 0.24], [0.06, 0.28]], '#6fc3df', 0, 0, 0); ring(7, (a, i) => { const r = i ? 0.09 : 0, h = 0.5 - (i % 3) * 0.05; K.tube([[0, 0.2, 0], [r * 0.5 * Math.cos(a), 0.36, r * 0.5 * Math.sin(a)], [r * Math.cos(a), h, r * Math.sin(a)]], 0.005, '#3f8f52', { ink: false }); K.ball(0.038, 'c', r * Math.cos(a), h + 0.02, r * Math.sin(a), { s: [1, 0.85, 1], seg: 10 }); K.ball(0.02, 'c2', r * Math.cos(a), h + 0.04, r * Math.sin(a), { ink: false, seg: 8 }); });
    ring(4, a => K.ball(0.04, '#3f8f52', 0.07 * Math.cos(a + 0.4), 0.33, 0.07 * Math.sin(a + 0.4), { s: [1, 0.25, 0.5], r: [0, -a, 0.5], ink: false, seg: 8 }));
  }, true),
  candles: P('Cluster of candles', 'Romantic', [0.4, 0.4, 0.4], '#f3ead8', K => {
    K.lathe([[0.17, 0], [0.18, 0.012], [0.16, 0.02]], '#d9b25a', 0, 0, 0); [[0, 0, 0.26], [0.09, 0.05, 0.17], [-0.08, 0.06, 0.2], [0.02, -0.1, 0.12], [-0.07, -0.07, 0.09]].forEach(([x, z, h], i) => { K.cyl(0.032, 0.034, h, 'c', x, 0.02 + h / 2, z); K.flame(x, 0.03 + h, z, 0.32, i); });
    const l = K.light('#ffb866', 1.0, 3.2, 0, 0.45, 0); K.anim(t => { l.intensity = 1.0 + 0.2 * Math.sin(t / 130) * Math.sin(t / 370); });
  }, true),
  stringlights: P('String lights', 'Romantic', [3.0, 0.5, 0.1], '#ffe2ad', K => {
    const pts = []; for (let i = 0; i <= 12; i++) { const u = i / 12, x = -1.5 + 3 * u, sag = 0.28 * Math.sin(u * Math.PI * 2 % Math.PI) ; pts.push([x, 0.45 - sag, 0]); } K.tube(pts, 0.006, dark, { ink: false, steps: 60 });
    const bulbs = pts.slice(1, -1).map(([x, y], i) => { K.cyl(0.012, 0.012, 0.025, dark, x, y - 0.015, 0, { ink: false }); return K.ball(0.03, i % 3 === 1 ? '#ffc7d9' : 'c', x, y - 0.05, 0, { glow: true, seg: 10 }); });
    K.light('#ffd9a0', 0.7, 3.5, 0, 0.2, 0.3); K.anim(t => bulbs.forEach((b, i) => { b.scale.setScalar(0.85 + 0.2 * Math.sin(t / 600 + i * 1.9)); }));
  }, true),
  lanterns: P('Paper lanterns', 'Romantic', [1.6, 0.7, 0.4], '#ff9a6b', K => {
    [[-0.6, 0.38, '#ff9a6b', 0.17], [0, 0.26, '#ffd166', 0.21], [0.58, 0.42, '#ff7a9a', 0.15]].forEach(([x, y, c, r], i) => { K.cyl(0.003, 0.003, 0.7 - y, dark, x, y + (0.7 - y) / 2 + r * 0.8, 0, { ink: false }); const b = K.ball(r, i ? c : 'c', x, y, 0, { glow: true, s: [1, 0.86, 1] }); for (const k of [-0.5, 0, 0.5]) K.torus(r * Math.cos(k) * 1.005, 0.004, '#b5523f', x, y + r * 0.86 * Math.sin(k), 0, { r: [Math.PI / 2, 0, 0], ink: false }); K.cyl(r * 0.35, r * 0.35, 0.02, dark, x, y + r * 0.84, 0, { ink: false }); K.cyl(r * 0.35, r * 0.35, 0.02, dark, x, y - r * 0.84, 0, { ink: false }); K.anim(t => b.material.color.setHSL(i === 1 ? 0.12 : i ? 0.96 : 0.06, 0.95, 0.66 + 0.05 * Math.sin(t / 800 + i * 2))); });
    K.light('#ffb27a', 0.9, 4, 0, 0.2, 0.3);
  }, true),
  fireplace: P('Fireplace', 'Romantic', [1.6, 1.35, 0.5], '#b5654a', K => {
    const tex = K.paint(256, 256, (c, W, H) => { c.fillStyle = '#7a4033'; c.fillRect(0, 0, W, H); for (let y = 0; y < 8; y++) for (let x = -1; x < 4; x++) { c.fillStyle = ['#b5654a', '#c47a55', '#a85a44', '#bd6e50'][(x * 3 + y * 5 + 8) % 4]; c.fillRect(x * 64 + (y % 2) * 32 + 2, y * 32 + 2, 60, 28); } });
    for (const x of [-0.6, 0.6]) K.box(0.4, 1.1, 0.46, '#ffffff', x, 0.55, 0, { map: tex }); K.box(0.8, 0.4, 0.46, '#ffffff', 0, 0.9, 0, { map: tex }); K.box(0.8, 0.7, 0.04, '#1b1420', 0, 0.35, -0.2, { noink: true }); K.rbox(1.76, 0.1, 0.58, 0.025, '#5a3a2a', 0, 1.15, 0.02, { seg: 3 }); K.box(1.7, 0.06, 0.7, '#6f6a78', 0, 0.03, 0.1);
    K.cyl(0.05, 0.05, 0.55, '#5a3a2a', 0, 0.1, 0.02, { r: [0, 0.3, Math.PI / 2] }); K.cyl(0.045, 0.045, 0.5, '#6b4a35', 0.02, 0.17, 0, { r: [0, -0.4, Math.PI / 2] });
    K.flame(-0.12, 0.18, 0.02, 1.25, 1); K.flame(0.1, 0.18, 0, 1.5, 2); K.flame(0.0, 0.2, 0.06, 1.0, 3); const l = K.light('#ff9a4a', 3, 5.5, 0, 0.5, 0.5); K.anim(t => { l.intensity = 3 + 0.8 * Math.sin(t / 110) * Math.sin(t / 290) + 0.3 * Math.sin(t / 53); });
    K.rbox(0.14, 0.2, 0.03, 0.01, '#d9b25a', -0.5, 1.3, 0, { seg: 2 }); K.lathe([[0.03, 0], [0.05, 0.06], [0.02, 0.14]], '#6fc3df', 0.5, 1.2, 0);
  }),
  blanketfort: P('Blanket fort', 'Romantic', [2.2, 1.45, 1.8], '#c9a3e6', K => {
    const T = K.THREE, geo = new T.PlaneGeometry(2.2, 2.6, 16, 16), p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), u = x / 1.1; p.setXYZ(i, x, 1.4 - 1.25 * Math.pow(Math.abs(y) / 1.3, 1.6) - 0.1 * (1 - u * u) + 0.03 * Math.sin(x * 9 + y * 5), y * 0.68); } geo.computeVertexNormals();
    const stripes = K.paint(128, 128, (c, W, H) => { c.fillStyle = K.col; c.fillRect(0, 0, W, H); c.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 4; i++) c.fillRect(i * 32, 0, 14, H); }); stripes.wrapS = stripes.wrapT = T.RepeatWrapping; stripes.repeat.set(4, 4); K.mesh(geo, '#ffffff', 0, 0, 0, { map: stripes, two: true, ink: false });
    K.plane(2.2, 1.3, 'c2', 0, 0.72, -0.86, { r: [0.12, 0, 0] }); K.cyl(0.02, 0.02, 2.3, wood, 0, 1.4, 0, { r: [Math.PI / 2, 0, 0], ink: false, s: [1, 0.78, 1] });
    K.rbox(1.9, 0.08, 1.5, 0.04, '#f6f1fa', 0, 0.04, 0, { seg: 3 }); K.rbox(0.5, 0.14, 0.34, 0.07, '#e0567a', -0.5, 0.15, -0.45, { r: [0.2, 0.3, 0] }); K.rbox(0.5, 0.14, 0.34, 0.07, '#ffd166', 0.45, 0.15, -0.5, { r: [0.2, -0.2, 0] });
    const bulbs = []; for (let i = 0; i < 9; i++) { const u = i / 8, x = -0.95 + 1.9 * u; bulbs.push(K.ball(0.025, '#ffe2ad', x, 1.22 - 0.5 * Math.pow(Math.abs(x) / 0.95, 2), 0.82, { glow: true, seg: 8 })); } K.light('#ffd9a0', 1.6, 3, 0, 0.8, 0.1); K.anim(t => bulbs.forEach((b, i) => b.scale.setScalar(0.8 + 0.3 * Math.sin(t / 500 + i * 2.3))));
  }, true),
  balloons: P('Heart balloons', 'Romantic', [0.7, 1.9, 0.5], '#ff5c8a', K => {
    K.rbox(0.14, 0.1, 0.14, 0.03, '#d9b25a', 0, 0.05, 0); const hs = [[-0.2, 1.5, 0, 'c', 0.2], [0.18, 1.68, 0.05, '#ff9ab8', -0.15], [0.0, 1.32, -0.08, '#d9304f', 0.05]].map(([x, y, z, c, tilt], i) => {
      const G = new K.THREE.Group(); G.position.set(x, y, z); G.rotation.z = tilt; K.g.add(G); const o = { into: G }; K.ball(0.12, c, -0.075, 0.05, 0, { ...o, s: [1, 1.05, 0.7] }); K.ball(0.12, c, 0.075, 0.05, 0, { ...o, s: [1, 1.05, 0.7] }); K.cone(0.165, 0.22, c, 0, -0.1, 0, { ...o, r: [Math.PI, 0, 0], s: [1, 1, 0.62] }); K.ball(0.03, '#ffffff', -0.1, 0.1, 0.075, { ...o, glow: true, alpha: 0.7, s: [1, 1.5, 0.3] });
      K.tube([[x, y - 0.2, z], [x * 0.5, 0.8, z * 0.5], [0, 0.1, 0]], 0.003, cream, { ink: false }); K.anim(t => { G.position.x = x + 0.03 * Math.sin(t / 1300 + i * 2); G.position.y = y + 0.025 * Math.sin(t / 900 + i); G.rotation.z = tilt + 0.06 * Math.sin(t / 1100 + i * 3); }); return G; });
  }, true),
  // ---------- camping, outdoors ----------
  tent: P('Tent', 'Camping', [2.2, 1.5, 2.4], '#e07a4f', K => {
    const T = K.THREE, tri = (pts, c, two) => { const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pts.flat(), 3)); geo.computeVertexNormals(); return K.mesh(geo, c, 0, 0, 0, { two: true, hard: true }); };
    const w = 1.05, h = 1.45, f = 1.15, b = -1.15;
    tri([[-w, 0, b], [-w, 0, f], [0, h, f], [-w, 0, b], [0, h, f], [0, h, b]], 'c'); tri([[w, 0, f], [w, 0, b], [0, h, b], [w, 0, f], [0, h, b], [0, h, f]], 'c'); tri([[w, 0, b], [-w, 0, b], [0, h, b]], 'c2');
    tri([[-w, 0, f], [-0.42, 0, f], [0, h, f]], 'c3'); tri([[0.42, 0, f], [w, 0, f], [0, h, f]], 'c3'); tri([[-0.42, 0, f + 0.01], [-0.75, 0, f + 0.3], [-0.14, h * 0.7, f + 0.01]], 'c2'); tri([[0.42, 0, f + 0.01], [0.75, 0, f + 0.3], [0.14, h * 0.7, f + 0.01]], 'c2');
    K.box(2.0, 0.03, 2.25, '#3a4a6a', 0, 0.015, 0, { noink: true }); K.rbox(0.62, 0.12, 1.7, 0.06, '#6fc3df', -0.4, 0.09, -0.15); K.rbox(0.62, 0.12, 1.7, 0.06, '#e0567a', 0.4, 0.09, -0.15); for (const x of [-0.4, 0.4]) K.rbox(0.42, 0.1, 0.28, 0.05, cream, x, 0.2, -0.85);
    K.cyl(0.02, 0.02, 2.5, steel, 0, h + 0.01, 0, { r: [Math.PI / 2, 0, 0], ink: false }); for (const [x, z] of [[-1.35, 1.3], [1.35, 1.3], [-1.35, -1.3], [1.35, -1.3]]) { K.tube([[Math.sign(x) * w, 0.02, Math.sign(z) * 1.15], [x, 0.02, z]], 0.005, cream, { ink: false }); K.cyl(0.012, 0.004, 0.14, steel, x, 0.05, z, { r: [0.3 * Math.sign(z), 0, -0.3 * Math.sign(x)], ink: false }); }
    const glow = K.ball(0.06, '#ffe2ad', 0, 1.05, 0.2, { glow: true }); K.light('#ffd9a0', 1.6, 3.2, 0, 0.9, 0.2); K.anim(t => glow.scale.setScalar(1 + 0.08 * Math.sin(t / 700)));
  }),
  campfire: P('Campfire', 'Camping', [1.0, 0.9, 1.0], '#8d8794', K => {
    ring(9, (a, i) => K.rbox(0.2, 0.13 + (i % 3) * 0.02, 0.16, 0.06, i % 2 ? 'c' : 'c2', 0.4 * Math.cos(a), 0.06, 0.4 * Math.sin(a), { r: [0, -a + 0.3, 0], seg: 3 })); K.disc(0.36, '#2a2026', 0, 0.006, 0);
    ring(5, (a, i) => { K.cyl(0.04, 0.045, 0.5, i % 2 ? '#6b4a35' : '#5a3a2a', 0.11 * Math.cos(a), 0.2, 0.11 * Math.sin(a), { r: [0.62 * Math.sin(a), 0, -0.62 * Math.cos(a)], seg: 10 }); });
    K.flame(0, 0.12, 0, 2.2, 1); K.flame(0.08, 0.1, 0.05, 1.5, 2); K.flame(-0.07, 0.1, -0.04, 1.7, 3); K.flame(0.02, 0.1, -0.09, 1.2, 4);
    const sparks = [0, 1, 2, 3, 4].map(() => K.ball(0.012, '#ffd98a', 0, 0.4, 0, { glow: true, seg: 6 })), l = K.light('#ff9a4a', 4.5, 8, 0, 0.6, 0);
    K.anim(t => { l.intensity = 4.5 + 1.2 * Math.sin(t / 120) * Math.sin(t / 310) + 0.4 * Math.sin(t / 47); sparks.forEach((s, i) => { const k = ((t / 1800 + i * 0.21) % 1); s.position.set(0.12 * Math.sin(i * 2.4 + k * 5), 0.35 + k * 0.9, 0.12 * Math.cos(i * 1.7 + k * 4)); s.scale.setScalar(1 - k); }); });
  }),
  logseat: P('Log bench', 'Camping', [1.5, 0.42, 0.45], '#7a5236', K => {
    K.cyl(0.2, 0.21, 1.5, 'c', 0, 0.2, 0, { r: [0, 0, Math.PI / 2], seg: 14 }); for (const x of [-0.752, 0.752]) { K.cyl(0.185, 0.185, 0.004, '#e2c08d', x, 0.2, 0, { r: [0, 0, Math.PI / 2], ink: false }); K.torus(0.11, 0.006, '#b08a5a', x, 0.2, 0, { r: [0, Math.PI / 2, 0], ink: false }); K.torus(0.05, 0.006, '#b08a5a', x, 0.2, 0, { r: [0, Math.PI / 2, 0], ink: false }); }
    K.cyl(0.035, 0.045, 0.14, 'c2', 0.3, 0.36, -0.12, { r: [-0.6, 0, 0.2], seg: 8 }); K.ball(0.05, '#3f8f52', -0.4, 0.38, 0.05, { s: [1.6, 0.3, 1.1], ink: false });
  }),
  campchair: P('Camp chair', 'Camping', [0.62, 0.85, 0.6], '#3f9a8a', K => {
    for (const x of [-0.27, 0.27]) { K.tube([[x, 0, 0.24], [x, 0.4, -0.2], [x, 0.84, -0.3]], 0.013, steel, { ink: false, tension: 0 }); K.tube([[x, 0, -0.24], [x, 0.42, 0.24], [x, 0.56, 0.26]], 0.013, steel, { ink: false, tension: 0 }); K.rbox(0.05, 0.03, 0.42, 0.012, dark, x, 0.57, 0.04, { seg: 2 }); }
    K.rbox(0.54, 0.03, 0.46, 0.012, 'c', 0, 0.4, 0.02, { seg: 3, r: [0.06, 0, 0] }); K.rbox(0.54, 0.4, 0.03, 0.012, 'c', 0, 0.66, -0.26, { seg: 3, r: [-0.2, 0, 0] }); K.box(0.54, 0.05, 0.005, 'c3', 0, 0.76, -0.262, { r: [-0.2, 0, 0], noink: true });
  }),
  lantern: P('Camp lantern', 'Camping', [0.2, 0.36, 0.2], '#d9534f', K => {
    K.cyl(0.08, 0.09, 0.05, 'c', 0, 0.025, 0); K.cyl(0.06, 0.06, 0.16, '#fff0c2', 0, 0.13, 0, { glow: true }); for (let i = 0; i < 4; i++) K.cyl(0.004, 0.004, 0.16, dark, 0.064 * Math.cos(i * 1.57 + 0.78), 0.13, 0.064 * Math.sin(i * 1.57 + 0.78), { ink: false });
    K.lathe([[0.085, 0], [0.05, 0.04], [0.02, 0.06]], 'c', 0, 0.21, 0); K.torus(0.07, 0.005, steel, 0, 0.27, 0, { arc: Math.PI, ink: false }); const l = K.light('#ffd28a', 1.1, 4.5, 0, 0.3, 0); K.anim(t => { l.intensity = 1.1 + 0.1 * Math.sin(t / 300); });
  }, true),
  sleepingbag: P('Sleeping bag', 'Camping', [0.7, 0.2, 1.9], '#4a82a6', K => {
    K.rbox(0.66, 0.14, 1.5, 0.07, 'c', 0, 0.07, 0.15); K.rbox(0.68, 0.04, 0.5, 0.02, 'c3', 0, 0.13, -0.35, { r: [0.05, 0, 0] }); K.rbox(0.5, 0.12, 0.34, 0.06, cream, 0, 0.08, -0.74); K.box(0.01, 0.008, 1.3, '#ffd166', 0.31, 0.1, 0.2, { noink: true });
  }, true),
  picnic: P('Picnic blanket', 'Camping', [1.9, 0.3, 1.5], '#d9534f', K => {
    const tex = K.paint(256, 256, (c, W, H) => { c.fillStyle = '#fbf6ee'; c.fillRect(0, 0, W, H); c.fillStyle = K.col; c.globalAlpha = 0.55; for (let i = 0; i < 8; i += 2) { c.fillRect(i * 32, 0, 32, H); c.fillRect(0, i * 32, W, 32); } });
    K.plane(1.9, 1.5, '#ffffff', 0, 0.012, 0, { map: tex, r: [-Math.PI / 2, 0, 0.04] }); K.rbox(0.4, 0.24, 0.28, 0.05, '#c9a36a', -0.5, 0.13, -0.35, { r: [0, 0.3, 0] }); K.torus(0.14, 0.012, '#a8834f', -0.5, 0.25, -0.35, { arc: Math.PI, r: [0, 0.3, 0], ink: false }); K.box(0.36, 0.02, 0.14, cream, -0.47, 0.255, -0.3, { r: [0.1, 0.3, 0], noink: true });
    K.lathe([[0.04, 0], [0.1, 0.006], [0.12, 0.018]], '#ffffff', 0.3, 0.014, 0.2); for (const [x, z, c] of [[0.27, 0.18, '#d9304f'], [0.34, 0.22, '#d9304f'], [0.3, 0.26, '#8fc98a']]) K.ball(0.03, c, x, 0.05, z, { ink: false, seg: 10 });
    K.cyl(0.035, 0.035, 0.22, '#3d6b4f', 0.55, 0.12, -0.3); K.cyl(0.013, 0.02, 0.08, '#3d6b4f', 0.55, 0.27, -0.3, { ink: false }); K.rbox(0.3, 0.1, 0.22, 0.05, '#ffd166', -0.1, 0.07, 0.4, { r: [0, -0.4, 0] });
  }, true),
  telescope: P('Telescope', 'Camping', [0.8, 1.5, 0.8], '#2f4a7a', K => {
    ring(3, a => K.tube([[0, 0.95, 0], [0.36 * Math.cos(a), 0, 0.36 * Math.sin(a)]], 0.014, dark, { ink: false })); K.cyl(0.04, 0.04, 0.08, steel, 0, 0.98, 0);
    const G = new K.THREE.Group(); G.position.set(0, 1.08, 0); G.rotation.set(-0.7, 0.4, 0); K.g.add(G); const o = { into: G, r: [Math.PI / 2, 0, 0] };
    K.cyl(0.07, 0.07, 0.75, 'c', 0, 0, 0.1, o); K.cyl(0.08, 0.08, 0.08, 'c3', 0, 0, 0.46, o); K.cyl(0.04, 0.045, 0.2, dark, 0, 0, -0.36, o); K.cyl(0.02, 0.02, 0.3, steel, 0.06, 0.07, 0, { ...o, ink: false }); K.cyl(0.065, 0.065, 0.004, '#9fd0ff', 0, 0, 0.502, { ...o, glow: true });
  }),
  cooler: P('Cooler', 'Camping', [0.62, 0.48, 0.4], '#3f8fd1', K => {
    K.rbox(0.6, 0.32, 0.38, 0.04, 'c', 0, 0.16, 0); K.rbox(0.62, 0.1, 0.4, 0.035, '#f7f8fb', 0, 0.37, 0); K.torus(0.2, 0.012, steel, 0, 0.32, 0, { arc: Math.PI, r: [0, Math.PI / 2, 0], s: [1, 0.7, 1.5], ink: false }); K.box(0.1, 0.04, 0.01, '#f7f8fb', 0, 0.26, 0.192, { noink: true });
  }),
  pine: P('Pine tree', 'Camping', [1.5, 3.2, 1.5], '#2f7a52', K => {
    K.cyl(0.09, 0.13, 0.7, '#6b4a35', 0, 0.35, 0, { seg: 10 }); [[0.74, 0.95, 0.55], [0.6, 0.9, 1.15], [0.46, 0.85, 1.72], [0.3, 0.75, 2.28]].forEach(([r, h, y], i) => K.cone(r, h, i % 2 ? 'c3' : 'c', 0, y + h / 2, 0, { seg: 9, r: [0, i * 0.5, 0], inkW: 0.012 }));
  }),
  bush: P('Bush', 'Camping', [1.0, 0.7, 0.9], '#3f9a5a', K => {
    [[0, 0.3, 0, 0.36], [0.28, 0.24, 0.08, 0.26], [-0.28, 0.26, -0.04, 0.28], [0.06, 0.48, -0.08, 0.24], [-0.1, 0.22, 0.24, 0.22]].forEach(([x, y, z, r], i) => K.ball(r, i % 2 ? 'c3' : 'c', x, y, z, { seg: 10 })); for (const [x, y, z] of [[0.2, 0.44, 0.24], [-0.24, 0.42, 0.2], [0.02, 0.62, 0.1]]) K.ball(0.035, '#ff9ab8', x, y, z, { ink: false, seg: 8 });
  }),
  boulder: P('Boulder', 'Camping', [0.9, 0.55, 0.75], '#8d8794', K => {
    const m = K.ico(0.4, 'c', 0, 0.22, 0, { detail: 1, s: [1.1, 0.68, 0.9], r: [0.3, 0.5, 0.1] }); K.ico(0.2, 'c2', 0.38, 0.1, 0.2, { detail: 1, s: [1, 0.7, 1], r: [1, 0.2, 0] }); K.ball(0.08, '#56ab66', -0.1, 0.46, 0.05, { s: [1.8, 0.25, 1.3], ink: false, seg: 8 });
  }),
  fence: P('Wooden fence', 'Camping', [2.0, 0.95, 0.12], '#c9a36a', K => {
    for (const x of [-0.9, 0, 0.9]) { K.rbox(0.1, 0.92, 0.1, 0.02, 'c2', x, 0.46, 0, { seg: 2 }); K.cone(0.075, 0.08, 'c2', x, 0.95, 0, { seg: 4, r: [0, Math.PI / 4, 0], ink: false }); } for (const y of [0.3, 0.68]) K.rbox(1.96, 0.1, 0.04, 0.012, 'c', 0, y, 0.03, { seg: 2 });
  }),
};
