// The face: printed-on details (flat, never ink-outlined) that sit exactly on the head surface, whatever its shape.
// Eyes, brows and the mouth are small groups the animation drives (blink, raise, smile, open).
import * as THREE from 'three';
import { Part, sphere, torusGeo, shapeOf, faceMatrix, faceZ, faceNormal, radiusAlong, rimAt, darker, mixHex, clamp, lerp, smooth, TAU } from './bodies-geo.js';
import { LAYER_SOFT, toon } from './toon.js';
import { buildStyledEyes, EYE_STYLES } from './bodies-eyes.js';
export { EYE_STYLES };

export const EYES = ['dot', 'oval', 'wide', 'happy', 'sleepy', 'lash'];
export const BROWS = ['plain', 'thick', 'arched', 'angry', 'soft', 'none'];
export const NOSES = ['small', 'round', 'long', 'button', 'none'];
export const MOUTHS = ['smile', 'grin', 'toothy', 'flat', 'o', 'cat', 'smirk', 'tiny'];
export const FACIAL_HAIR = ['none', 'stubble', 'mustache', 'goatee', 'beard', 'scruff', 'vandyke', 'boxed', 'chinstrap', 'longbeard', 'muttonchops']; // append only. scruff: a goatee joined to the moustache over stubble. vandyke: a moustache and a pointed chin beard, not joined. boxed: a short neat full beard. chinstrap: a band along the jaw. longbeard: hangs well below the chin. muttonchops: big sideburns joined to the moustache, the chin bare.
export const GLASSES = ['none', 'round', 'square', 'shades'];

const INK = '#231a2a', MOUTH = '#5c2431', TONGUE = '#e8707a';

// A group laid on the face at (x, y): local +z is the surface normal, so its children are drawn "flat on the skin".
function stick(sh, x, y, { lift = 0, roll = 0 } = {}) {
  const g = new THREE.Group();
  const m = faceMatrix(sh, x, y, { lift, roll });
  g.matrixAutoUpdate = true;
  m.decompose(g.position, g.quaternion, g.scale);
  return g;
}
const soft = grp => { grp.traverse(o => { if (o.isMesh) { o.layers.set(LAYER_SOFT); o.castShadow = false; } }); return grp; };

// Build the face into `head`. Returns the animatable bits.
export function buildFace(head, o) {
  const sh = shapeOf(o.faceShape);
  const k = sh.rx / 0.368; // features scale a little with the head width
  const ex = 0.142 * k, ey = -0.006, brY = 0.108, noseY = -0.078, mouthY = -0.168 * (sh.ry / 0.335);
  const styled = !!o.eyeStyle && o.eyeStyle !== 'button'; // real eyes come from bodies-eyes.js, 'button' is the printed eyes below
  const F = { sh, eyeL: null, eyeR: null, browL: null, browR: null, mouth: null, ex, ey, mouthY, blinks: styled || o.eyes !== 'happy', styled: null };
  const skin = o.skin;

  // ---- eyes (a group per eye, so they can blink and wink)
  const eyeColor = o.eyeColor || INK;
  const makeEye = side => {
    const g = stick(sh, side * ex, ey, { lift: 0 });
    if (styled) { head.add(g); return g; } // (bodies-eyes.js fills it)
    const p = new Part();
    const S = sphere(8, 6);
    switch (o.eyes) {
      case 'oval':
        p.add(S, eyeColor, { sx: 0.043, sy: 0.062, sz: 0.02, z: -0.003 });
        p.add(S, '#ffffff', { sx: 0.014, sy: 0.016, sz: 0.01, x: 0.011, y: 0.022, z: 0.014 });
        p.add(S, '#ffffff', { sx: 0.007, sy: 0.008, sz: 0.008, x: -0.011, y: -0.02, z: 0.014 });
        break;
      case 'wide':
        p.add(S, '#ffffff', { sx: 0.054, sy: 0.064, sz: 0.018, z: -0.004 });
        p.add(S, eyeColor === INK ? '#4a7bb5' : eyeColor, { sx: 0.038, sy: 0.05, sz: 0.014, z: 0.004 });
        p.add(S, INK, { sx: 0.021, sy: 0.028, sz: 0.012, z: 0.009 });
        p.add(S, '#ffffff', { sx: 0.013, sy: 0.014, sz: 0.01, x: 0.012, y: 0.02, z: 0.016 });
        break;
      case 'happy':
        p.add(torusGeo(0.038, 0.0095, Math.PI, 5, 12), INK, { y: -0.012, z: 0.002, sz: 0.7 });
        break;
      case 'sleepy':
        p.add(S, eyeColor, { sx: 0.042, sy: 0.05, sz: 0.018, z: -0.003 });
        p.add(S, '#ffffff', { sx: 0.011, sy: 0.011, sz: 0.008, x: 0.011, y: -0.004, z: 0.013 });
        p.add(S, skin, { sx: 0.048, sy: 0.03, sz: 0.024, y: 0.026, z: 0.004 }); // the lid
        p.add(torusGeo(0.042, 0.0055, Math.PI, 4, 12), darker(skin, 0.5), { y: 0.0, z: 0.012, sy: 0.32, sz: 0.5 });
        break;
      case 'lash':
        p.add(S, eyeColor, { sx: 0.036, sy: 0.054, sz: 0.019, z: -0.003 });
        p.add(S, '#ffffff', { sx: 0.012, sy: 0.014, sz: 0.01, x: 0.01, y: 0.02, z: 0.013 });
        p.rod([side * 0.02, 0.05, 0.004], [side * 0.052, 0.068, 0.004], 0.0048, INK);
        p.rod([side * 0.03, 0.036, 0.004], [side * 0.062, 0.042, 0.004], 0.0048, INK);
        break;
      default: // dot
        p.add(S, eyeColor, { sx: 0.034, sy: 0.05, sz: 0.019, z: -0.003 });
        p.add(S, '#ffffff', { sx: 0.012, sy: 0.014, sz: 0.01, x: 0.009, y: 0.02, z: 0.013 });
    }
    const built = soft(p.build({ onSoft: true }));
    built.scale.setScalar(1.18);
    g.add(built);
    head.add(g);
    return g;
  };
  F.eyeL = makeEye(1); F.eyeR = makeEye(-1);
  if (styled) F.styled = buildStyledEyes(F, o, o.faceShape);

  // ---- brows
  const browColor = o.browColor;
  const makeBrow = side => {
    const g = stick(sh, side * ex, brY);
    const p = new Part();
    switch (o.brows) {
      case 'none': return null;
      case 'thick': if (o.hat === 'sagehood') { p.rod([-side * 0.04, 0.002, 0], [side * 0.02, 0.008, 0], 0.021, browColor); p.rod([side * 0.004, 0.007, 0], [side * 0.06, -0.016, 0], 0.017, browColor); break; } // (the sage's: big, bushy, drooping at the ends)
        p.rod([-0.036, 0, 0], [0.036, 0, 0], 0.0175, browColor); break;
      case 'arched': p.add(torusGeo(0.055, 0.0105, 1.15, 5, 10), browColor, { rz: Math.PI / 2 - 0.575, y: -0.045, sz: 0.8 }); break;
      case 'angry': p.rod([-0.04, 0, 0], [0.04, 0, 0], 0.0125, browColor); g.userData.base = 0.42; break;
      case 'soft': p.rod([-0.04, 0, 0], [0.04, 0, 0], 0.0075, browColor); break;
      default: p.rod([-0.036, 0, 0], [0.036, 0, 0], 0.0115, browColor);
    }
    g.add(soft(p.build({ onSoft: true })));
    g.userData.side = side;
    head.add(g);
    return g;
  };
  F.browL = makeBrow(1); F.browR = makeBrow(-1);

  // ---- nose, cheeks, glasses: static printed bits, one soft mesh
  const fixed = new Part();
  const noseCol = mixHex(skin, '#b8624d', 0.28);
  const S8 = sphere(8, 6);
  const nose = (sx, sy, sz, y = noseY, lift = 0.004) => fixed.add(S8, noseCol, { matrix: faceMatrix(sh, 0, y, { lift, sx, sy, sz }) });
  switch (o.nose) {
    case 'round': nose(0.036, 0.03, 0.026); break;
    case 'long': nose(0.026, 0.055, 0.03, noseY + 0.01); break;
    case 'button': nose(0.02, 0.018, 0.016); break;
    case 'none': break;
    default: nose(0.028, 0.02, 0.02);
  }
  if (o.blush) {
    const bc = mixHex(skin, '#ff5d7a', 0.42);
    for (const s of [-1, 1]) fixed.add(S8, bc, { matrix: faceMatrix(sh, s * 0.215 * k, -0.082, { lift: -0.006, sx: 0.05, sy: 0.03, sz: 0.012, roll: s * 0.25 }) });
  }
  if (o.glasses && o.glasses !== 'none') {
    const rim = o.glasses === 'shades' ? '#1c1a24' : '#2b2733';
    const lift = 0.024;
    for (const s of [-1, 1]) {
      if (o.glasses === 'round') fixed.add(torusGeo(0.064, 0.0085, TAU, 5, 20), rim, { matrix: faceMatrix(sh, s * ex, ey, { lift }) });
      else if (o.glasses === 'square') {
        const X0 = s * ex - 0.062, X1 = s * ex + 0.062, Y0 = ey - 0.046, Y1 = ey + 0.05;
        const pt = (x, y) => [x, y, faceZ(sh, x, y) + lift];
        fixed.rod(pt(X0, Y1), pt(X1, Y1), 0.0085, rim); fixed.rod(pt(X0, Y0), pt(X1, Y0), 0.0085, rim);
        fixed.rod(pt(X0, Y0), pt(X0, Y1), 0.0085, rim); fixed.rod(pt(X1, Y0), pt(X1, Y1), 0.0085, rim);
      } else fixed.add(S8, '#15131b', { matrix: faceMatrix(sh, s * ex, ey, { lift: lift - 0.006, sx: 0.07, sy: 0.052, sz: 0.01 }) });
      // arm going back to the ear
      const zf = faceZ(sh, s * (ex + 0.06), ey) + lift;
      fixed.rod([s * (ex + 0.062), ey + 0.002, zf], [s * sh.rx * 0.97, ey, 0.02], 0.0075, rim);
    }
    fixed.rod([-ex + 0.064, ey + 0.012, faceZ(sh, -ex + 0.064, ey + 0.012) + lift], [ex - 0.064, ey + 0.012, faceZ(sh, ex - 0.064, ey + 0.012) + lift], 0.008, rim);
  }
  if (o.lines) { // a life of squinting into the sun: crow's feet, smile lines, a furrowed brow
    const lc = mixHex(skin, '#6b3326', 0.38), pt = (x, y, l = 0.004) => [x, y, faceZ(sh, x, y) + l];
    for (const s of [-1, 1]) {
      const cx = s * (ex + 0.078 * k), cy = ey + 0.01;
      for (const a of [-0.35, 0.35]) fixed.rod(pt(cx, cy + a * 0.03), pt(cx + s * 0.026, cy + a * 0.055), 0.0034, lc);
      // smile lines framing the grin
      const n0 = pt(s * 0.05, noseY + 0.006), n1 = pt(s * 0.092, mouthY + 0.03), n2 = pt(s * 0.1, mouthY - 0.01);
      fixed.rod(n0, n1, 0.0042, lc); fixed.rod(n1, n2, 0.0042, lc);
    }
    for (const y of [0.175, 0.205]) fixed.rod(pt(-0.06, y), pt(0.06, y + 0.004), 0.0038, lc);
  }
  if (LIP_PATCH.has(o.facialHair) && o.hat !== 'sagehood') fixed.add(S8, skin, { matrix: faceMatrix(sh, 0, mouthY + 0.002, { lift: 0, sx: 0.068 * k, sy: 0.036, sz: 0.0085 }) }); // the lips, clear of the beard's hollow
  const staticMesh = fixed.build({ onSoft: true });
  head.add(soft(staticMesh));

  // ---- mouth
  const mLift = MOUTH_LIFT[o.facialHair] ?? 0.006;
  const mg = stick(sh, 0, mouthY, { lift: mLift });
  const arcP = new Part(), inP = new Part();
  const style = o.mouth;
  F.mouthStyle = style;
  F.mouthMinOpen = 0; F.mouthCurve = true; F.mouthW = 1;
  const arcGeo = (r, len) => torusGeo(r, 0.0088, len, 5, 14);
  switch (style) {
    case 'grin': arcP.add(arcGeo(0.058, 2.6), MOUTH, { rz: -Math.PI / 2 - 1.3 }); F.mouthMinOpen = 0.22; F.mouthOff = 0.0475; F.mouthW = 1.08; break;
    case 'toothy': F.mouthMinOpen = 0.7; F.mouthCurve = false; F.noArc = true; F.mouthW = 1.9; F.teeth = true; break; // a big open grin, top teeth showing
    case 'flat': arcP.rod([-0.03, 0, 0], [0.03, 0, 0], 0.0088, MOUTH); F.mouthCurve = false; break;
    case 'o': F.mouthMinOpen = 0.5; F.mouthCurve = false; F.noArc = true; break;
    case 'cat':
      arcP.add(arcGeo(0.024, Math.PI), MOUTH, { rz: Math.PI, x: -0.024, y: 0.006 });
      arcP.add(arcGeo(0.024, Math.PI), MOUTH, { rz: Math.PI, x: 0.024, y: 0.006 });
      F.mouthOff = 0.0; F.mouthW = 1.0; break;
    case 'smirk': arcP.add(arcGeo(0.058, 1.9), MOUTH, { rz: -Math.PI / 2 - 0.95 + 0.16 }); F.mouthOff = 0.036; break;
    case 'tiny': arcP.add(arcGeo(0.04, 2.1), MOUTH, { rz: -Math.PI / 2 - 1.05 }); F.mouthOff = 0.0224; F.mouthW = 0.8; break;
    default: arcP.add(arcGeo(0.055, 2.2), MOUTH, { rz: -Math.PI / 2 - 1.1 }); F.mouthOff = 0.0435;
  }
  F.mouthOff ??= 0;
  const S = sphere(10, 6);
  inP.add(S, '#4a1a26', { sx: 0.052, sy: 1, sz: 0.012 });
  inP.add(S, TONGUE, { sx: 0.03, sy: 0.5, sz: 0.011, y: -0.5, z: 0.004 });
  if (F.teeth) inP.add(S, '#fbf7ec', { sx: 0.05, sy: 0.42, sz: 0.012, y: 0.55, z: 0.006 });
  F.arc = arcP.by.size ? arcP.build({ onSoft: true }) : null;
  F.inner = inP.build({ onSoft: true });
  if (F.arc) mg.add(soft(F.arc));
  mg.add(soft(F.inner));
  F.inner.scale.set(0.9, 0.012, 1); F.inner.visible = false; // shut until the mouth opens
  F.mouth = mg;
  head.add(mg);
  return F;
}

// ------------------------------------------------------------------ facial hair
// Facial hair sits in the head's own outlined, vertex-coloured mesh, so it costs no draw call or material of its own.
// It is cut to the head AS DRAWN: fullHeadGeo's 28 x 16 flat facets lie up to a few mm inside the true surface, and a shell on
// the true surface dips under their corners. So every vertex is placed on the facets (facetR), lifted along the skin's normal,
// then nudged out wherever a facet still sits too close. Geometry is cached per head shape and style, only the colours are per
// character. The beard region follows Andrew's marked-up references (docs/refs/andrew-facialhair-*): sideburn, jaw and under
// it to the chin, cheeks below the cheekbone, never behind the ear. Moustaches sweep out and DOWN from under the nose.
export const FH_LIFT = 0.002;       // stubble's height off the skin
const RIM = 0.004;                  // where the thicker pieces start (above the stubble, so the two never fight)
const HP = 28, HT = 16;             // fullHeadGeo's grid (bodies-geo.js)
const fhCache = new Map();
const fhMemo = (key, make) => { let g = fhCache.get(key); if (!g) { g = make(); fhCache.set(key, g); } return g; };
// the mouth group's lift per style: above whatever hair surrounds the mouth, so talking never disappears into it
export const MOUTH_LIFT = { beard: 0.011, goatee: 0.009, vandyke: 0.009, scruff: 0.009, boxed: 0.011, longbeard: 0.011, muttonchops: 0.008 };
const LIP_PATCH = new Set(['beard', 'boxed', 'longbeard']); // the full beards: a skin-coloured lip patch in their hollow round the mouth
const NOSE_Y = -0.078;
export const mouthYOf = sh => -0.168 * (sh.ry / 0.335);

// The vertices of fullHeadGeo for a shape (same grid, same radii).
function headGrid(shapeId) {
  return fhMemo('grid|' + shapeId, () => {
    const sh = shapeOf(shapeId), v = new Float64Array((HP + 1) * (HT + 1) * 3);
    for (let i = 0; i <= HP; i++) for (let j = 0; j <= HT; j++) {
      const phi = (i / HP) * TAU, t = (j / HT) * Math.PI;
      const dx = Math.sin(t) * Math.sin(phi), dy = Math.cos(t), dz = Math.sin(t) * Math.cos(phi);
      const r = radiusAlong(sh, dx, dy, dz), o = (i * (HT + 1) + j) * 3;
      v[o] = dx * r; v[o + 1] = dy * r; v[o + 2] = dz * r;
    }
    return v;
  });
}
function rayTri(g, dx, dy, dz, ia, ib, ic) {
  const ax = g[ia], ay = g[ia + 1], az = g[ia + 2];
  const e1x = g[ib] - ax, e1y = g[ib + 1] - ay, e1z = g[ib + 2] - az, e2x = g[ic] - ax, e2y = g[ic + 1] - ay, e2z = g[ic + 2] - az;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return Infinity;
  const inv = 1 / det, sx = -ax, sy = -ay, sz = -az;
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < -1e-7 || u > 1 + 1e-7) return Infinity;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -1e-7 || u + v > 1 + 1e-7) return Infinity;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 0 ? t : Infinity;
}
// Distance from the head centre to the drawn (faceted) skin along the unit direction (dx, dy, dz).
export function facetR(shapeId, dx, dy, dz) {
  const g = headGrid(shapeId);
  let phi = Math.atan2(dx, dz); if (phi < 0) phi += TAU;
  const i0 = Math.floor(phi / TAU * HP), j0 = Math.floor(Math.acos(clamp(dy, -1, 1)) / Math.PI * HT);
  let best = Infinity;
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const i = ((i0 + di) % HP + HP) % HP, j = j0 + dj;
    if (j < 0 || j >= HT) continue;
    const a = (i * (HT + 1) + j) * 3, b = ((i + 1) * (HT + 1) + j) * 3;
    best = Math.min(best, rayTri(g, dx, dy, dz, a, a + 3, b), rayTri(g, dx, dy, dz, b, a + 3, b + 3));
  }
  return Number.isFinite(best) ? best : radiusAlong(shapeOf(shapeId), dx, dy, dz);
}

// A point `h` off the drawn skin in the direction (dx, dy, dz) from the head centre, pushed onto pos.
const _sn = new THREE.Vector3();
export function skinDir(shapeId, sh, dx, dy, dz, h, pos) {
  const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
  const r0 = radiusAlong(sh, dx, dy, dz), r = facetR(shapeId, dx, dy, dz);
  const n = faceNormal(sh, dx * r0, dy * r0, dz * r0, _sn);
  pos.push(dx * r + n.x * h, dy * r + n.y * h, dz * r + n.z * h);
}
// The same for a point (x, y) on the front of the face.
function skinXY(shapeId, sh, x, y, h, pos) { skinDir(shapeId, sh, x, y, Math.max(1e-4, faceZ(sh, x, y)), h, pos); }

// Index triangles over a grid of rows (each `w` vertices, starting at `base`).
function gridIdx(idx, base, rows, w) {
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < w - 1; j++) {
    const a = base + i * w + j, b = a + w;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
}
// Finish a piece: push it clear of the facets, wind it outward, normals, a blank uv (Part merges need the same attributes).
const BARY = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
function finish(shapeId, pos, idx, gap = FH_LIFT * 0.7) {
  const nv = pos.length / 3, push = new Float64Array(nv);
  for (let it = 0; it < 4; it++) {
    push.fill(0);
    let any = false;
    for (let f = 0; f < idx.length; f += 3) {
      const a = idx[f] * 3, b = idx[f + 1] * 3, c = idx[f + 2] * 3;
      for (const [wa, wb, wc] of BARY) {
        const x = pos[a] * wa + pos[b] * wb + pos[c] * wc, y = pos[a + 1] * wa + pos[b + 1] * wb + pos[c + 1] * wc, z = pos[a + 2] * wa + pos[b + 2] * wb + pos[c + 2] * wc;
        const l = Math.hypot(x, y, z), need = facetR(shapeId, x / l, y / l, z / l) + gap - l;
        if (need > 1e-6) { any = true; for (const k of [idx[f], idx[f + 1], idx[f + 2]]) push[k] = Math.max(push[k], need + 1e-5); }
      }
    }
    if (!any) break;
    for (let k = 0; k < nv; k++) if (push[k]) {
      const o = k * 3, l = Math.hypot(pos[o], pos[o + 1], pos[o + 2]), s = (l + push[k]) / l;
      pos[o] *= s; pos[o + 1] *= s; pos[o + 2] *= s;
    }
  }
  // wind outward: the faces should on the whole face away from the head centre
  let out = 0;
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f] * 3, b = idx[f + 1] * 3, c = idx[f + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    out += (uy * vz - uz * vy) * pos[a] + (uz * vx - ux * vz) * pos[a + 1] + (ux * vy - uy * vx) * pos[a + 2];
  }
  if (out < 0) for (let f = 0; f < idx.length; f += 3) { const t = idx[f + 1]; idx[f + 1] = idx[f + 2]; idx[f + 2] = t; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(nv * 2), 2));
  g.computeBoundingSphere();
  return g;
}

// The beard region (Andrew's references): in front of the ears (azimuth -JAW_P .. JAW_P from the front), from the cheek
// line / sideburn top (jawTop, a polar angle from the crown) down the face and under the jaw to the neckline (jawBot, well
// clear of the neck). The cheek line runs in a clean diagonal from the corner of the moustache up to the sideburn, and the
// sideburn ends at 1.27, just in front of the ear, where every short hairstyle's own sideburn comes down over it (bodies-gear cut()).
const JAW_P = 1.27;
const CHEEK = [[0, 1.9], [0.3, 1.93], [0.72, 1.76], [1.02, 1.54], [1.16, 1.4], [JAW_P, 1.37]];
const jawTop = phi => rimAt(CHEEK, phi);
const jawBot = sh => Math.PI - Math.asin(Math.min(0.9, 0.165 / sh.ry));

// The stubble film: the head's own facets (fullHeadGeo's grid cut K x K finer) over the beard region, lifted FH_LIFT off
// the skin. Every small triangle lies on one facet (the cut follows the facets' diagonals), so the film runs parallel to
// the skin as drawn and never dips into it from any angle. Its colour fades in over the region's edge (w per vertex), so
// the stepped outline of the cut never shows. -> { geo, w }
function filmGeo(shapeId) {
  return fhMemo('film|' + shapeId, () => {
    const sh = shapeOf(shapeId), g = headGrid(shapeId), K = 2, dP = TAU / HP / K, dT = Math.PI / HT / K, bot = jawBot(sh);
    const wAt = (phi, t) => smooth(Math.min((t - jawTop(phi)) / 0.09, (bot - t) / 0.14, (JAW_P - Math.abs(phi)) / 0.075));
    const I1 = Math.ceil(JAW_P / dP), I0 = -I1;
    const J0 = Math.floor((jawTop(JAW_P) - 0.02) / dT), J1 = Math.min(HT * K, Math.ceil((bot + 0.02) / dT));
    const nI = I1 - I0 + 1, nJ = J1 - J0 + 1;
    const W = new Float32Array(nI * nJ);
    for (let a = 0; a < nI; a++) for (let b = 0; b < nJ; b++) W[a * nJ + b] = Math.max(0, wAt((I0 + a) * dP, (J0 + b) * dT));
    const map = new Int32Array(nI * nJ).fill(-1), pos = [], w = [], idx = [];
    // a fine node, on head cell (ci, cj) at (s along azimuth, u along the polar angle); the cell's two facets are A B C and
    // C B D (bodies-geo winding: they share the B-C diagonal, s + u = 1)
    const vert = (a, b) => {
      const k = a * nJ + b;
      if (map[k] >= 0) return map[k];
      const I = I0 + a, J = J0 + b, ci = Math.floor(I / K), cj = Math.min(HT - 1, Math.floor(J / K)), s = I / K - ci, u = J / K - cj;
      const ii = ((ci % HP) + HP) % HP, A = (ii * (HT + 1) + cj) * 3, B = A + 3, C = ((ii + 1) * (HT + 1) + cj) * 3, D = C + 3;
      const p = [0, 0, 0];
      for (let e = 0; e < 3; e++) p[e] = s + u <= 1 ? g[A + e] + s * (g[C + e] - g[A + e]) + u * (g[B + e] - g[A + e]) : g[D + e] + (1 - s) * (g[B + e] - g[D + e]) + (1 - u) * (g[C + e] - g[D + e]);
      const l = Math.hypot(p[0], p[1], p[2]), r0 = radiusAlong(sh, p[0] / l, p[1] / l, p[2] / l);
      const n = faceNormal(sh, p[0] / l * r0, p[1] / l * r0, p[2] / l * r0, _sn);
      pos.push(p[0] + n.x * FH_LIFT, p[1] + n.y * FH_LIFT, p[2] + n.z * FH_LIFT);
      w.push(W[k]);
      return (map[k] = pos.length / 3 - 1);
    };
    for (let a = 0; a < nI - 1; a++) for (let b = 0; b < nJ - 1; b++) {
      if (Math.max(W[a * nJ + b], W[a * nJ + b + 1], W[(a + 1) * nJ + b], W[(a + 1) * nJ + b + 1]) < 0.04) continue; // (all but bare skin)
      const A = vert(a, b), B = vert(a, b + 1), C = vert(a + 1, b), D = vert(a + 1, b + 1);
      idx.push(A, B, C, C, B, D);
    }
    return { geo: finish(shapeId, pos, idx), w: new Float32Array(w) };
  });
}

// A beard laid over a patch of the face: columns of rows from a top line down to a bottom line (polar angles by
// azimuth, rimAt tables or functions), each point lifted off the drawn skin by thick(p) (p: a = |azimuth|, v = 0 at the top .. 1
// at the bottom, x y z on the skin, lower = how far down the face, front = how far forward, mouth = 0 in the mouth's hollow .. 1
// clear of it, edge = 0 at any edge .. 1 inside, side = the column's share from the middle to the sideburn). `a0` > 0: one cheek
// only (side s), from a0 out to JAW_P. Its thickness always runs out to the stubble's lift at every edge.
function regionGeo(shapeId, key, { top, bot, thick, a0 = 0, s = 1, nR = 10, soft = [0.14, 0.22, 0.09] }) {
  return fhMemo('region|' + shapeId + '|' + key, () => {
    const sh = shapeOf(shapeId), my = mouthYOf(sh), B = jawBot(sh);
    const at = (f, a) => (typeof f === 'function' ? f(a, sh, B) : rimAt(f, a));
    let cols;
    if (a0 > 0) { cols = []; for (let i = 0; i <= 10; i++) cols.push(s * lerp(a0, JAW_P, 1 - (1 - i / 10) ** 1.35)); }
    else { // wider over the cheeks, close together where the cheek line climbs into the sideburn (so no face is skewed)
      const side = [0, 0.16, 0.32, 0.48, 0.64, 0.8, 0.91, 0.99, 1.06, 1.12, 1.17, 1.22, JAW_P];
      cols = [...side.slice(1).reverse().map(a => -a), ...side];
    }
    const nC = cols.length - 1, pos = [], idx = [];
    for (let r = 0; r <= nR; r++) {
      const v = Math.pow(r / nR, 1.3);
      for (let c = 0; c <= nC; c++) {
        const phi = cols[c], a = Math.abs(phi), t = lerp(at(top, a), Math.min(B, at(bot, a)), v);
        const dx = Math.sin(t) * Math.sin(phi), dy = Math.cos(t), dz = Math.sin(t) * Math.cos(phi);
        const ea = a0 > 0 ? Math.min((a - a0) / (JAW_P - a0) / soft[2], (JAW_P - a) / (JAW_P - a0) / soft[2]) : (1 - a / JAW_P) / soft[2];
        const edge = smooth(Math.min(v / soft[0], (1 - v) / soft[1], ea));
        const r0 = radiusAlong(sh, dx, dy, dz), x = dx * r0, y = dy * r0, z = dz * r0;
        const p = { a, v, t, x, y, z, edge, lower: smooth((-0.1 - y) / 0.17), front: clamp(z / 0.3, 0, 1), side: a / JAW_P,
          mouth: smooth((Math.hypot(x / 0.085, (y - my - 0.002) / 0.052) - 0.8) / 0.75) };
        skinDir(shapeId, sh, dx, dy, dz, FH_LIFT + edge * Math.max(0, thick(p)), pos);
      }
    }
    gridIdx(idx, 0, nR + 1, nC + 1);
    return finish(shapeId, pos, idx);
  });
}
// the sideburn lies thin as far down as a hairstyle's own sideburn can come over it (bodies-gear cut(): to 1.85 rad), then thickens
const burnThin = p => 1 - 0.75 * smooth((p.a - 0.85) / 0.3) * (1 - smooth((p.t - 1.75) / 0.3));
// The full beard: volume at the chin and jaw, a hollow round the mouth, thin up the sideburns.
const beardGeo = shapeId => regionGeo(shapeId, 'beard', { top: CHEEK, bot: (a, sh, B) => B,
  thick: p => (0.1 + 0.9 * p.mouth) * burnThin(p) * (0.006 + 0.016 * p.lower + 0.022 * p.lower * p.front * p.front) });
// A short boxed beard: neat and even (about a centimetre), crisp edges, the cheek line a little lower, squared off under the chin.
const boxedGeo = shapeId => regionGeo(shapeId, 'boxed', { top: CHEEK.map(([a, t]) => [a, t + (a > 0.25 && a < 1.1 ? 0.09 : 0)]), bot: (a, sh, B) => B - 0.12,
  soft: [0.08, 0.1, 0.06], thick: p => (0.15 + 0.85 * p.mouth) * burnThin(p) * (0.006 + 0.006 * p.lower + 0.004 * p.lower * p.front) });
// A chin strap: a band along the jaw from one sideburn round under the chin to the other, the face above it bare.
const STRAP = [[0, 2.42], [0.5, 2.36], [0.85, 2.17], [1.1, 1.86], [JAW_P, 1.56]];
const strapGeo = shapeId => regionGeo(shapeId, 'chinstrap', { top: STRAP.map(([a, t]) => [a, t - (a > 1.05 ? 0.2 : 0.13)]), bot: (a, sh, B) => Math.min(B, rimAt(STRAP, a) + 0.14),
  nR: 6, soft: [0.25, 0.25, 0.06], thick: p => burnThin(p) * 0.0075 });
// Mutton chops: big sideburns flaring over the cheeks down to the jaw, sweeping forward to meet the moustache's tips; the chin bare.
const chopGeo = (shapeId, s) => regionGeo(shapeId, 'chops' + s, { a0: 0.24, s,
  top: [[0.24, 2.0], [0.42, 1.86], [0.75, 1.72], [1.02, 1.52], [1.16, 1.4], [JAW_P, 1.37]],
  bot: [[0.24, 2.12], [0.45, 2.3], [0.8, 2.42], [1.05, 2.35], [JAW_P, 2.2]], soft: [0.14, 0.2, 0.12],
  thick: p => burnThin(p) * (0.007 + 0.012 * smooth((p.y + 0.02) / -0.12) * (1 - 0.4 * smooth((0.5 - p.a) / 0.25))) });

// The long beard's fall: a rounded lock hanging from the chin in front of the neck and chest, tapering to a soft point (its top
// rows lie in the beard's own volume, pushed clear of the skin by finish()).
function fallGeo(shapeId) {
  return fhMemo('fall|' + shapeId, () => {
    const sh = shapeOf(shapeId), k = sh.rx / 0.368, R = 9, N = 16, pos = [], idx = [];
    const y0 = -sh.ry * 0.62, y1 = -sh.ry - 0.14, zc0 = faceZ(sh, 0, y0) - 0.02;
    for (let r = 0; r <= R; r++) {
      const v = r / R, y = lerp(y0, y1, v), w = Math.pow(Math.max(0, 1 - v), 0.62);
      const rx = (0.03 + 0.135 * w) * k, rz = 0.022 + 0.04 * w, zc = Math.max(zc0 + 0.03 * v, 0.104 + 0.02 + rz) + 0.04 * v * v;
      for (let j = 0; j < N; j++) { const a = (j / N) * TAU; pos.push(Math.sin(a) * rx * (r === R ? 0.2 : 1), y, zc + Math.cos(a) * rz * (r === R ? 0.2 : 1)); }
    }
    const tip = pos.length / 3; pos.push(0, y1 - 0.012, zc0 + 0.07 + 0.04);
    const cap = pos.length / 3; pos.push(0, y0 + 0.01, zc0 - 0.01); // (closed at the top too, inside the beard)
    for (let r = 0; r < R; r++) for (let j = 0; j < N; j++) { const a = r * N + j, b = r * N + (j + 1) % N; idx.push(a, b, a + N, b, b + N, a + N); }
    for (let j = 0; j < N; j++) { idx.push(R * N + j, R * N + (j + 1) % N, tip); idx.push((j + 1) % N, j, cap); }
    return finish(shapeId, pos, idx);
  });
}

// A tapered stroke of hair laid along a curve on the face: curve(q) -> [x, y] for q in -1..1, wid(q) its half-width
// across the skin, hgt(q) its height (both near 0 at the ends). The cross-section is a half-ellipse standing on the skin.
function strokeGeo(shapeId, key, curve, wid, hgt, { n = 14, m = 5, base = RIM } = {}) {
  return fhMemo('stroke|' + shapeId + '|' + key, () => {
    const sh = shapeOf(shapeId), pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const q = -1 + 2 * i / n, [x, y] = curve(q), [xa, ya] = curve(q - 0.01), [xb, yb] = curve(q + 0.01);
      const tl = Math.hypot(xb - xa, yb - ya) || 1, bx = -(yb - ya) / tl, by = (xb - xa) / tl;
      const W = wid(q), Hh = hgt(q);
      for (let j = 0; j <= m; j++) {
        const a = Math.PI * j / m;
        skinXY(shapeId, sh, x + bx * W * Math.cos(a), y + by * W * Math.cos(a), base + Hh * Math.sin(a), pos);
      }
    }
    gridIdx(idx, 0, n + 1, m + 1);
    return finish(shapeId, pos, idx);
  });
}

// A mound of hair on the face round (cx, cy): rim(a) -> [ox, oy], the rim point at angle a (0 = out to +x, pi/2 = up);
// hgt(r, a) its height, r = 0 at the centre .. 1 at the rim (keep it ~0 at the rim so the edge meets the skin).
function moundGeo(shapeId, key, cx, cy, rim, hgt, { K = 4, J = 16, base = RIM } = {}) {
  return fhMemo('mound|' + shapeId + '|' + key, () => {
    const sh = shapeOf(shapeId), pos = [], idx = [];
    skinXY(shapeId, sh, cx, cy, base + hgt(0, 0), pos);
    for (let k = 1; k <= K; k++) {
      const r = k / K;
      for (let j = 0; j < J; j++) {
        const a = TAU * j / J - Math.PI / 2, [ox, oy] = rim(a);
        skinXY(shapeId, sh, cx + ox * r, cy + oy * r, base + hgt(r, a), pos);
      }
    }
    for (let j = 0; j < J; j++) idx.push(0, 1 + j, 1 + (j + 1) % J);
    for (let k = 1; k < K; k++) for (let j = 0; j < J; j++) {
      const a = 1 + (k - 1) * J + j, b = 1 + (k - 1) * J + (j + 1) % J, c = a + J, d = b + J;
      idx.push(a, c, b, b, c, d);
    }
    return finish(shapeId, pos, idx);
  });
}

// The moustache: thickest under the nose, its wings sweeping out and DOWN to the corners of the mouth (a soft chevron).
// v: 'm' the plain one, 'b' over a beard (fuller), 'v' a Van Dyke's (longer, finer wings).
export function moustacheGeo(shapeId, v = 'm') {
  const sh = shapeOf(shapeId), my = mouthYOf(sh), k = sh.rx / 0.368;
  const y0 = (my + NOSE_Y) / 2 - 0.004;                                  // the middle, just under the nose
  const W = (v === 'v' ? 0.082 : v === 'b' ? 0.076 : 0.072) * k, D = v === 'v' ? 0.05 : 0.044;
  const curve = q => [q * W, y0 - D * Math.pow(Math.abs(q), 1.6)];
  const t = v === 'v' ? 0.75 : v === 'b' ? 1.15 : 1;
  const wid = q => 0.017 * t * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(q), 2.6)), 0.5) + 0.0015;
  const hgt = q => (v === 'b' ? 0.016 : 0.013) * Math.pow(Math.max(0, 1 - q * q), 0.5) + 0.001;
  return strokeGeo(shapeId, 'moustache|' + v, curve, wid, hgt);
}

// Chin pieces: the goatee (a rounded U under the lower lip), the scruff's (wider, lower), the Van Dyke's (pointed).
function chinGeo(shapeId, v) {
  const sh = shapeOf(shapeId), my = mouthYOf(sh), k = sh.rx / 0.368;
  const chin = -sh.ry;                                                   // the bottom of the head
  if (v === 'vandyke') {
    const top = my - 0.036, bottom = lerp(my, chin, 0.86), cy = lerp(top, bottom, 0.36); // the point ends on the chin
    const rx = 0.045 * k, up = top - cy, down = cy - bottom;
    const rim = a => { const s = Math.sin(a); return s >= 0 ? [rx * Math.cos(a), up * s] : [rx * Math.cos(a) * (1 - 0.7 * -s), down * s]; };
    return moundGeo(shapeId, 'vandyke', 0, cy, rim, (r, a) => 0.024 * Math.pow(1 - r * r, 0.6) * (1 + 0.6 * Math.max(0, -Math.sin(a)) * r));
  }
  const wide = v === 'scruff';
  const top = my - (wide ? 0.034 : 0.032), bottom = lerp(my, chin, wide ? 0.84 : 0.88), cy = (top + bottom) / 2;
  const rx = (wide ? 0.06 : 0.054) * k, ry = (top - bottom) / 2;
  const rim = a => { const c = Math.cos(a), s = Math.sin(a); const e = s < 0 ? 2.6 : 2; return [rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / e), ry * Math.sign(s) * Math.pow(Math.abs(s), 2 / e)]; };
  return moundGeo(shapeId, v, 0, cy, rim, (r, a) => (wide ? 0.014 : 0.016) * Math.pow(1 - r * r, 0.4) * (1 + 0.3 * Math.max(0, -Math.sin(a)) * r));
}

// The scruff's sides: from the moustache's tips down past the corners of the mouth to the chin piece.
function scruffSides(shapeId) {
  const sh = shapeOf(shapeId), my = mouthYOf(sh), k = sh.rx / 0.368;
  return [-1, 1].map(s => strokeGeo(shapeId, 'scruffside|' + s, q => { const u = (q + 1) / 2; return [s * lerp(0.07, 0.05, u * u) * k, lerp(my + 0.012, my - 0.07, u)]; },
    q => 0.011 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(q), 4)), 0.5) + 0.002, q => 0.009 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(q), 4)), 0.5) + 0.001, { n: 8, m: 4 }));
}

// Every piece of a style on a head shape: [{ geo, kind: 'film' (stubble: w = its colour weights) | 'hair', name }]
// (name: film, beard, moustache, chin, side). The tests read this too.
export function facialHairPieces(shapeId, style) {
  const hair = (name, geo) => ({ geo, kind: 'hair', name }), film = () => ({ ...filmGeo(shapeId), kind: 'film', name: 'film' });
  switch (style) {
    case 'stubble': return [film()];
    case 'mustache': return [hair('moustache', moustacheGeo(shapeId, 'm'))];
    case 'goatee': return [hair('chin', chinGeo(shapeId, 'goatee')), hair('moustache', moustacheGeo(shapeId, 'm'))];
    case 'scruff': return [film(), hair('chin', chinGeo(shapeId, 'scruff')), hair('moustache', moustacheGeo(shapeId, 'm')), ...scruffSides(shapeId).map(g => hair('side', g))];
    case 'beard': return [hair('beard', beardGeo(shapeId)), hair('moustache', moustacheGeo(shapeId, 'b'))];
    case 'vandyke': return [hair('moustache', moustacheGeo(shapeId, 'v')), hair('chin', chinGeo(shapeId, 'vandyke'))];
    case 'boxed': return [hair('beard', boxedGeo(shapeId)), hair('moustache', moustacheGeo(shapeId, 'm'))];
    case 'chinstrap': return [hair('beard', strapGeo(shapeId))];
    case 'longbeard': return [hair('beard', beardGeo(shapeId)), hair('fall', fallGeo(shapeId)), hair('moustache', moustacheGeo(shapeId, 'b'))];
    case 'muttonchops': return [hair('beard', chopGeo(shapeId, -1)), hair('beard', chopGeo(shapeId, 1)), hair('moustache', moustacheGeo(shapeId, 'b'))];
    default: return [];
  }
}

// Called with the head Part (one merged, outlined, vertex-coloured mesh).
export function addFacialHair(part, o) {
  const col = o.facialHairColor || o.hair;
  const film = o.facialHair === 'scruff' ? mixHex(o.skin, '#5e5a55', 0.3) : o.facialHairColor ? mixHex(o.skin, o.facialHairColor, 0.5) : mixHex(o.skin, '#2c2626', 0.34);
  for (const p of facialHairPieces(o.faceShape, o.facialHair)) {
    if (p.kind !== 'film') { part.add(p.geo, col); continue; }
    // the film's colour fades in from the skin at its edges (vertex colours on the head's own material)
    const g = p.geo.clone(), n = g.attributes.position.count, arr = new Float32Array(n * 3), a = _fa.set(o.skin), b = _fb.set(film);
    for (let i = 0; i < n; i++) { _fc.copy(a).lerp(b, p.w[i]); arr[i * 3] = _fc.r; arr[i * 3 + 1] = _fc.g; arr[i * 3 + 2] = _fc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    part.add(g, toon('#ffffff', { vertexColors: true }));
  }
}
const _fa = new THREE.Color(), _fb = new THREE.Color(), _fc = new THREE.Color();
