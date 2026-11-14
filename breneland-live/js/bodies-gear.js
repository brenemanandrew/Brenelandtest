// Things that sit on a person: hair, hats, accessories, and the things they hold (rod, treat, fish).
// Hair and hats are cut from the same shells as the head (bodies-geo shellGeo) so they hug every head shape.
// Hats are sized from the hair under them (hairReach): a dome sits a hair's breadth over it, a brim rests where the
// hair is as wide as the crown. Hair under a hat is held inside it (hatCover -> shellGeo cap) and eases back out below
// the rim, and the bits that stick out (bangs, buns, curls, tufts) move below the rim or stay home.
import * as THREE from 'three';
import {
  Part, sphere, capsuleGeo, cylGeo, coneGeo, torusGeo, shapeOf, shellGeo, surfacePoint, rimAt, radiusAlong, boxGeo,
  darker, lighter, mixHex, TAU, profileAt, lerp,
} from './bodies-geo.js';
import { TORSO_PROFILE } from './bodies-outfit.js';
import { buildPole } from './fish-gear-art.js';

export const HAIR_STYLES = ['short', 'buzz', 'spiky', 'side', 'bob', 'long', 'pony', 'pigtails', 'bun', 'curly', 'afro', 'mohawk', 'balding', 'wavy', 'sidepart', 'pompadour', 'shag', 'tiedback', 'bald']; // 'bald' stays last, and a look names its style, never its place
export const HATS = ['none', 'cap', 'capback', 'beanie', 'sunhat', 'bow', 'tophat', 'crown', 'fedora', 'party', 'straw', 'headband', 'chef'];
export const ACCESSORIES = ['none', 'scarf', 'backpack', 'bowtie', 'headphones', 'satchel'];

const HAIR_T = 1.075;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1), _up = new THREE.Vector3(0, 1, 0);

// A swinging bit (ponytail, pom-pom, scarf tail): a pivot group the spring solver rotates.
function swinger(parent, pivot, part, kind, opts = {}) {
  const node = new THREE.Group();
  node.position.set(pivot[0], pivot[1], pivot[2]);
  node.add(part.build());
  parent.add(node);
  return { node, kind, ax: 0, vx: 0, az: 0, vz: 0, ...opts };
}

// Aim a group so its local +z points along a surface direction (for bows, badges).
function facing(g, dir) { _v.set(dir[0], dir[1], dir[2]).normalize(); _q.setFromUnitVectors(_z, _v); g.quaternion.copy(_q); return g; }

// ------------------------------------------------------------------ hair volumes

// The shell of each style (head radii; see bodies-geo shellGeo), and the flatter "hat hair" version worn under a hat.
// Every shell is closed at its edges (`lip`: it sits ON the head, no hollow under the fringe or the nape) and eases
// down to lie flat where real hair does (`hug`: the nape, over the ears). A short cut's hairline is a table (bodies-geo rimAt): the
// forehead, the temple, a sideburn in front of the ear, up and over the ear (EAR_TOP: clear of its top), down behind it and to the
// nape, so nothing goes through an ear and no scalp shows at the temples or the nape. Long cuts (bob, long, afro, wavy, shag) cover
// the ears instead (the ear inside the hair).
const EAR_TOP = 1.34;   // the polar angle the hair keeps above the ear (its top is at about 1.40-1.42 on every head shape)
// a hairline round a short cut: forehead, temple, sideburn (in front of the ear), behind the ear, nape
// (level across the brows, down at the temple, the sideburn from 1.12 to 1.27 rad: just in front of the ear, whose front edge is at
// about 1.40 on every head shape; over the ear from 1.39 to 1.78)
const cut = (front, temple, burn, behind, nape, ear = EAR_TOP) => [[0, front], [0.55, front + 0.03], [0.88, temple], [1.12, burn], [1.27, burn], [1.39, ear], [1.78, ear], [2.08, behind], [Math.PI, nape]];
// a long cut's hairline: level across the brows (their outer ends are at about 0.62 rad), down the temples and over the ears
const FRAME = (side, back) => [[0, 1.0], [0.62, 1.12], [1.1, side - 0.22], [Math.PI / 2, side], [Math.PI, back]];
// the afro's: a round arch high over the forehead, clear of the brows' ends, down over the ears
const AFRO = [[0, 0.92], [0.62, 1.12], [1.2, 1.75], [Math.PI / 2, 2.05], [Math.PI, 2.1]];
const SHELLS = {
  short: { scale: HAIR_T, rim: cut(1.02, 1.2, 1.56, 1.88, 2.1), puff: 0.04, back: 0.02, hug: [0.001, 0.32, 0.45], lip: true },
  buzz: { scale: 1.03, rim: cut(1.14, 1.26, 1.56, 1.88, 2.12), hug: [0.15, 0.25, 0.3], lip: true },
  spiky: { scale: HAIR_T, rim: cut(1.02, 1.2, 1.5, 1.85, 2.05), puff: 0.03, hug: [0.001, 0.3, 0.4], lip: true },
  side: { scale: HAIR_T, rim: cut(0.98, 1.2, 1.56, 1.9, 2.1), puff: 0.05, hug: [0.001, 0.32, 0.45], lip: true },
  bob: { scale: 1.09, rim: FRAME(2.05, 2.25), back: 0.16, side: 0.1, puff: 0.05, nTh: 12, lip: true },
  long: { scale: 1.085, rim: FRAME(2.15, 2.4), back: 0.12, side: 0.08, puff: 0.05, nTh: 12, lip: true },
  pony: { scale: HAIR_T, rim: cut(1.02, 1.2, 1.5, 1.9, 2.08), puff: 0.04, hug: [0.001, 0.35, 0.5], lip: true },
  pigtails: { scale: HAIR_T, rim: cut(1.02, 1.2, 1.5, 1.9, 2.08), puff: 0.04, hug: [0.001, 0.35, 0.5], lip: true },
  bun: { scale: HAIR_T, rim: cut(1.02, 1.2, 1.5, 1.9, 2.08), puff: 0.04, hug: [0.001, 0.35, 0.5], lip: true },
  curly: { scale: 1.11, rim: cut(0.98, 1.22, 1.5, 1.9, 2.05), puff: 0.16, hug: [0.001, 0.22, 0.3], lip: true },
  afro: { scale: 1.36, rim: AFRO, puff: 0.08, side: 0.05, nPhi: 30, nTh: 12, lift: 0.03, hug: [0.14, 0.16, 0.5], lip: true }, // a rounded edge all round the face
  mohawk: { scale: 1.03, rim: cut(1.14, 1.26, 1.56, 1.88, 2.1), hug: [0.15, 0.25, 0.3], lip: true },
  // thin on top: a fringe of hair round the sides and back from the temples, over and behind the ears (not over them), the
  // crown mostly bare
  balding: { scale: 1.05, rim: [[0, 1.3], [1.0, 1.3], [1.12, 1.5], [1.27, 1.5], [1.39, EAR_TOP], [1.78, EAR_TOP], [2.08, 1.95], [Math.PI, 2.12]], from: [[0, 1.3], [1.05, 1.12], [1.6, 0.92], [Math.PI, 0.78]], cut: 1.0, jag: 0.08, back: 0.04, nPhi: 48, nTh: 9, hug: [0.1, 0.12, 0.3], lip: true, rimJag: [0.07, 24] },
  // a full feathered cut, swept back and layered down to the collar (no curls), the ears out, the hair over and behind them
  wavy: { scale: 1.1, rim: [[0, 1.0], [0.62, 1.12], [1.1, 1.6], [1.27, 1.66], [1.39, EAR_TOP + 0.02], [1.78, EAR_TOP + 0.02], [2.12, 2.0], [Math.PI, 2.05]], puff: 0.06, back: 0.05, side: 0.09, nTh: 11, hug: [0.001, 0.001, 0.25], lip: true },
  // a neat side part: short at the back and sides with sideburns down past the middle of the ear
  sidepart: { scale: HAIR_T, rim: cut(1.0, 1.2, 1.82, 1.9, 2.12), puff: 0.05, back: 0.02, hug: [0.001, 0.25, 0.45], lip: true },
  // a pompadour: the sides and back slicked close, long sideburns, the volume all in the quiff (built below)
  pompadour: { scale: 1.055, rim: cut(1.04, 1.22, 1.85, 1.88, 2.1), puff: 0.02, hug: [0.001, 0.25, 0.6], lip: true },
  // a shag: choppy layers over the ears to the collar, longer in front of the ears (its sideburns), a ragged fringe
  shag: { scale: 1.1, rim: [[0, 0.98], [0.6, 1.1], [1.15, 1.95], [1.6, 1.92], [Math.PI, 2.12]], puff: 0.07, side: 0.1, back: 0.07, nPhi: 56, nTh: 12, lip: true, rimJag: [0.11, 28] },
  // long hair pulled back flat and tied at the nape, sideburns in front of the ears
  tiedback: { scale: 1.05, rim: cut(0.98, 1.2, 1.78, 1.92, 2.1), puff: 0.03, hug: [0.001, 0.25, 0.4], lip: true },
};
const HATTED = {
  curly: { scale: HAIR_T, rim: cut(0.98, 1.22, 1.5, 1.9, 2.05), hug: [0.001, 0.22, 0.3], lip: true },
  afro: { scale: 1.13, rim: AFRO, nPhi: 30, nTh: 12, hug: [0.001, 0.001, 0.5], lip: true },
  shag: { scale: HAIR_T, rim: [[0, 0.98], [0.6, 1.1], [1.15, 1.95], [1.6, 1.92], [Math.PI, 2.12]], side: 0.06, back: 0.05, nPhi: 56, nTh: 12, lip: true, rimJag: [0.11, 28] },
};
export function hairShell(style, hatted) {
  const s = (hatted && HATTED[style]) || SHELLS[style] || SHELLS.short;
  return hatted ? { ...s, puff: 0, lift: 0 } : s;
}

// How far the hair reaches from the head centre along a direction, in head radii (1 = bare skin).
export function hairReach(style, shapeId, dx, dy, dz, hatted = false) {
  if (style === 'bald') return 1;
  const s = hairShell(style, hatted), l = Math.hypot(dx, dy, dz) || 1;
  dx /= l; dy /= l; dz /= l;
  const t = Math.acos(Math.max(-1, Math.min(1, dy))), th = rimAt(s.rim, Math.atan2(dx, dz));
  if (t > th || t < (s.from ? rimAt(s.from, Math.atan2(dx, dz)) : th * (s.start || 0))) return 1;
  if (s.cut && Math.abs(Math.atan2(dx, dz)) < s.cut) return 1;
  let r = s.scale * (1 + (s.puff || 0) * Math.max(0, dy) ** 2 + (s.back || 0) * Math.max(0, -dz) ** 1.5 + (s.side || 0) * dx * dx);
  if (s.lift) r += (s.lift * Math.max(0, dy) * dy) / radiusAlong(shapeOf(shapeId), dx, dy, dz); // (lifted on top only: bodies-geo shellGeo)
  if (style === 'curly' && !hatted) r += 0.05;   // the curls on top of the shell (between them it is the shell)
  if (style === 'balding' && !hatted) r = Math.max(r, 1.03);
  return r;
}

// Dome hats: their rim (polar angles [front, side, back] from the crown) and how far over the hair they sit.
const DOMES = {
  cap: [[1.15, 1.32, 1.5], 0.065], capback: [[1.15, 1.32, 1.5], 0.065], beanie: [[1.3, 1.42, 1.55], 0.075],
  sunhat: [[1.05, 1.25, 1.45], 0.065], straw: [[1.1, 1.3, 1.45], 0.065], mailcap: [[1.1, 1.28, 1.42], 0.075],
  flatcap: [[1.12, 1.3, 1.42], 0.055], hood: [[1.28, 1.9, 2.3], 0.1],
};
const FLAT = { flatcap: 0.2, mailcap: 0.1 };   // dome hats squashed flat on top (the hair under them is too)
// Brim hats: they rest ON the head, not on its tip top. The crown is cut to the head: its inner rim is the hair's own
// cross-section at the band (the band level all round, just over the brows: BAND_Y in head units, the brows are at 0.108), so a
// fedora, top hat, crown or chef's hat comes down round the skull whatever the head shape, hair or head size.
const BRIMS = new Set(['tophat', 'crown', 'fedora', 'chef']);
export const BAND_Y = 0.15;
const BAND_GAP = 0.012;   // the crown's inner rim this far (m at headSize 1) outside the hair it sits on

// The hair a hat sits on (head radii): the flattened "hat hair" shell. Any extra volume (a bob's back, curls) is held
// inside the hat by the shell's cap, so it does not make the hat grow.
function envelope(style) { return style === 'bald' ? 1 : style === 'balding' ? 1.02 : hairShell(style, true).scale; } // thinning hair: the hat sits on the scalp

// The distance from the head's axis to its surface (scaled by `scale`) at height y and azimuth phi (0 = the front): the head is a
// superellipsoid (bodies-geo HEAD_SHAPES), so a level cut through it is a superellipse, in closed form.
export function crossRadius(shapeId, y, phi, scale = 1) {
  const sh = shapeOf(shapeId), Y = y / scale, t = Math.min(1, Math.max(0, -Y / sh.ry)), w = 1 - sh.taper * Math.pow(t, 1.4);
  const c = 1 - Math.pow(Math.abs(Y) / sh.ry, sh.n);
  if (c <= 0) return 0;
  const k = Math.pow(Math.abs(Math.sin(phi)) / (sh.rx * w), sh.n) + Math.pow(Math.abs(Math.cos(phi)) / sh.rz, sh.n);
  return (Math.pow(c, 1 / sh.n) / Math.pow(k, 1 / sh.n)) * scale;
}

// What a hat covers: { rim, scale (how far out hair may reach inside it), env (the hair it sits on), y0 (brim hats) } or null.
export function hatCover(kind, shapeId, style) {
  const d = DOMES[kind];
  if (d) { const env = envelope(style); // squashed only as far as the hair under it allows (its top stays 3.5% of a head over the hair)
    const flat = FLAT[kind] ? Math.max(0, Math.min(FLAT[kind], 1 - (env + 0.035) / ((env + d[1]) * (kind === 'flatcap' ? 1.07 : 1)))) : 0;
    return { rim: d[0], env, scale: env + d[1] - 0.05, flat, dome: true, wide: kind === 'sunhat' || kind === 'straw' }; } // (the hair held 5% of a head inside it: on a boxy head the two shells' facets cross)
  if (BRIMS.has(kind)) {
    // the hair is held inside the crown from the band up (polar angle of the band at the front, side and back)
    const env = envelope(style), y0 = BAND_Y, at = phi => Math.atan2(crossRadius(shapeId, y0, phi, env), y0);
    return { rim: [at(0), at(Math.PI / 2), at(Math.PI)], env, scale: env, y0, brim: true, wide: kind === 'fedora' || kind === 'tophat' };
  }
  if (kind === 'party') { const env = envelope(style); return { rim: [0.42, 0.42, 0.42], env, scale: env }; }
  return null;
}

// ------------------------------------------------------------------ hair

// `cover` (from hatCover, or null) is the hat the hair has to fit under.
export function buildHair(head, part, o, cover) {
  const style = o.hairStyle, col = o.hair, id = o.faceShape, sh = shapeOf(id);
  const springs = [];
  if (style === 'bald') return springs;
  const S = sphere(12, 8), S8 = sphere(8, 6);
  const hatted = !!cover;
  const shell = s => part.add(shellGeo(id, cover ? { ...s, cap: cover.rim, capScale: cover.scale, capFlat: cover.flat || 0 } : s), col);
  // a headband pushes the hair back: nothing sticks out across its line; a bow keeps its spot clear
  const band = o.hat === 'headband', bowAt = o.hat === 'bow' ? new THREE.Vector3(0.5, 0.82, 0.3).normalize() : null;
  const inBand = (dx, dy, dz) => { if (!band) return false; const t = Math.acos(Math.max(-1, Math.min(1, dy / (Math.hypot(dx, dy, dz) || 1)))); return t > 0.72 && t < 1.34; };
  const atBow = (dx, dy, dz) => !!bowAt && _v.set(dx, dy, dz).normalize().dot(bowAt) > 0.93;
  const dark = darker(col, 0.82);
  const rx = sh.rx, rz = sh.rz, ry = sh.ry;
  // is a direction from the head centre under the hat (with an angular margin for the size of the bit)?
  const covered = (dx, dy, dz, margin = 0.12) => {
    if (!cover) return false;
    const l = Math.hypot(dx, dy, dz) || 1, t = Math.acos(Math.max(-1, Math.min(1, dy / l)));
    return t < rimAt(cover.rim, Math.atan2(dx, dz)) + margin;
  };
  // a polar angle just under the hat's rim (well under a wide brim, so nothing pokes up through it)
  const below = (phi, extra) => (cover ? rimAt(cover.rim, phi) + extra + (cover.wide ? 0.3 : 0) : 0);
  const dirAt = (t, phi) => [Math.sin(t) * Math.sin(phi), Math.cos(t), Math.sin(t) * Math.cos(phi)];
  // a shape laid ON the hair: at direction d from the head centre, its local y along the hair's normal there, its
  // local x along `along` (a direction, made tangent), its centre `h` off the hair's surface (negative: sunk into it)
  const onHair = (d, along, sx, sy, sz, h = 0) => {
    const l = Math.hypot(...d), u = [d[0] / l, d[1] / l, d[2] / l], r = hairReach(style, id, ...u, hatted) * radiusAlong(sh, ...u) + h;
    const n = new THREE.Vector3(...u), t = new THREE.Vector3(...along); t.addScaledVector(n, -t.dot(n)).normalize();
    const b = new THREE.Vector3().crossVectors(t, n);
    return new THREE.Matrix4().makeBasis(t.multiplyScalar(sx), n.multiplyScalar(sy), b.multiplyScalar(sz)).setPosition(u[0] * r, u[1] * r, u[2] * r);
  };
  // a cone laid on the hair (a point of hair): its axis along `along` (tip that way), `w` wide, `len` long, `thin` along the normal
  const layCone = (d, along, w, len, thin, h = 0) => {
    const l = Math.hypot(...d), u = [d[0] / l, d[1] / l, d[2] / l], r = hairReach(style, id, ...u, hatted) * radiusAlong(sh, ...u) + h;
    const n = new THREE.Vector3(...u), t = new THREE.Vector3(...along); t.addScaledVector(n, -t.dot(n)).normalize();
    const side = new THREE.Vector3().crossVectors(t, n);
    return new THREE.Matrix4().makeBasis(side.multiplyScalar(w), t.clone().multiplyScalar(len), n.multiplyScalar(thin)).setPosition(u[0] * r + t.x * len * 0.4, u[1] * r + t.y * len * 0.4, u[2] * r + t.z * len * 0.4);
  };
  // the front of the hair at (x, y) (a fringe's blobs sit on it)
  const faceTop = (x, y) => { const d = [x, y, Math.sqrt(Math.max(1e-4, 1 - (x / rx) ** 2 - (y / ry) ** 2)) * rz]; return surfacePoint(id, ...d, hairReach(style, id, ...d, hatted)).z; };
  // its lower edge clear of the brows' tops on every head
  const bangs = (w = 0.26, y = 0.19, z = 0.27) => { if (!covered(0, y, z, 0.1) && !inBand(0, y, z)) part.add(S, col, { sx: w, sy: 0.068, sz: 0.06, y: y * (ry / 0.335) + 0.01, z: z * (rz / 0.335), rx: -0.5 }); };
  const hooded = o.hat === 'hood';
  shell(hairShell(style, hatted));
  if (o.thin && !hatted && style !== 'balding') part.add(shellGeo(id, { scale: 1.014, rim: [0.68, 0.9, 0.95], nTh: 6 }), mixHex(o.skin, col, 0.42)); // thinning on top: the scalp shows through the crown

  switch (style) {
    case 'spiky': {
      const n = hatted ? 0 : 9;
      for (let i = 0; i < n; i++) {
        const ring = i < 1 ? 0 : i < 5 ? 0.62 : 1.05, phi = i < 1 ? 0 : i < 5 ? ((i - 1) / 4) * TAU + 0.4 : [1.05, 2.4, -2.4, -1.05][i - 5]; // the low ring only at the sides and back, so no spike comes down over a brow
        const d = [Math.sin(ring) * Math.sin(phi), Math.cos(ring), Math.sin(ring) * Math.cos(phi)];
        if (inBand(...d) || atBow(...d)) continue;
        const p = surfacePoint(id, d[0], d[1], d[2], 1.04);
        const len = i < 1 ? 0.27 : 0.23;
        const dir = new THREE.Vector3(d[0], d[1] * 0.9 + 0.35, d[2] * 0.9 - 0.05).normalize();
        _q.setFromUnitVectors(_up, dir);
        part.add(coneGeo(6), col, { matrix: new THREE.Matrix4().compose(new THREE.Vector3(p.x + dir.x * len * 0.35, p.y + dir.y * len * 0.35, p.z + dir.z * len * 0.35), _q.clone(), new THREE.Vector3(0.1, len, 0.1)) });
      }
      bangs(0.2, 0.2, 0.26);
      break;
    }
    case 'side': {
      const up = !hatted; // the big sweep only when nothing sits on it
      if (!covered(0.05, 0.2, 0.235, 0.2) && !inBand(0.05, 0.2, 0.235)) part.add(S, col, { sx: 0.25, sy: up ? 0.08 : 0.06, sz: 0.13, x: 0.05, y: (up ? 0.228 : 0.18) * (ry / 0.335), z: 0.235 * (rz / 0.335), rz: -0.28, rx: -0.55 }); // high and shallow, so its end stays off the brow and the temple
      // the sweep's end curling over the left temple, high enough to stay out of the forehead
      if (!covered(-0.17, 0.185, 0.235, 0.14) && !inBand(-0.17, 0.185, 0.235)) part.add(S, col, { sx: 0.105, sy: 0.062, sz: 0.085, x: -0.17, y: 0.188 * (ry / 0.335), z: 0.232 * (rz / 0.335), rz: -0.7 });
      break;
    }
    case 'bob': bangs(0.3, 0.19, 0.27); break;
    case 'long': {
      bangs(0.3, 0.19, 0.27);
      if (hooded) break; // tucked into the hood
      const tail = new Part();
      tail.add(S, col, { sx: 0.3 * (rx / 0.368), sy: 0.36, sz: 0.1, y: -0.3, z: -0.055 });
      tail.add(S, col, { sx: 0.24, sy: 0.16, sz: 0.09, y: -0.62, z: -0.045 });
      springs.push(swinger(head, [0, -0.05, -rz * 0.86], tail, 'tail', { gain: 1.0 }));
      break;
    }
    case 'pony': {
      bangs(0.24, 0.19, 0.27);
      if (hooded) break;
      const tail = new Part();
      tail.add(S, mixHex(col, '#ff6fa8', 0.7), { sx: 0.05, sy: 0.05, sz: 0.05 });
      tail.add(S, col, { sx: 0.078, sy: 0.24, sz: 0.078, y: -0.2, z: -0.02 });
      tail.add(S, col, { sx: 0.05, sy: 0.12, sz: 0.05, y: -0.42, z: -0.02 });
      // the tie sits at the back of the head, or just under the hat's back rim
      const t = Math.max(Math.acos(0.13 / 0.35), below(Math.PI, 0.14), band ? 1.36 : 0); // under a headband's line, not on it
      const p = surfacePoint(id, 0, Math.cos(t), -Math.sin(t), HAIR_T + 0.02);
      springs.push(swinger(head, [0, p.y, p.z], tail, 'tail', { gain: 1.0 }));
      break;
    }
    case 'pigtails': {
      bangs(0.24, 0.19, 0.27);
      if (hooded) break;
      for (const s of [-1, 1]) {
        const tail = new Part();
        tail.add(S, '#ff6fa8', { sx: 0.05, sy: 0.05, sz: 0.05 });
        tail.add(S, col, { sx: 0.075, sy: 0.22, sz: 0.075, y: -0.18 });
        tail.add(S, col, { sx: 0.05, sy: 0.1, sz: 0.05, y: -0.38 });
        const phi = s * 2.02, t = Math.max(1.55, below(phi, 0.14)); // tied behind the ears, so the tails hang clear of them
        const p = surfacePoint(id, ...dirAt(t, phi), HAIR_T + 0.02);
        springs.push(swinger(head, [p.x, p.y, p.z], tail, 'tail', { gain: 1.0, side: s }));
      }
      break;
    }
    case 'bun': {
      bangs(0.24, 0.19, 0.27);
      if (!covered(0, 1, -0.2, 0.3)) {
        part.add(S, col, { sx: 0.13, sy: 0.12, sz: 0.13, y: ry * 1.02 + 0.06, z: -0.06 });
        part.add(torusGeo(0.11, 0.022, TAU, 5, 12), dark, { y: ry * 1.02 - 0.02, z: -0.06, rx: Math.PI / 2 });
      } else if (!hooded) { // a low bun under the back of the hat
        const t = Math.max(1.5, below(Math.PI, 0.32));
        const p = surfacePoint(id, 0, Math.cos(t), -Math.sin(t), HAIR_T + 0.2);
        part.add(S, col, { sx: 0.12, sy: 0.11, sz: 0.1, y: p.y, z: p.z });
      }
      break;
    }
    case 'curly': {
      // curls all over, or a ring of them peeking out under the hat's rim
      const curls = [];
      if (!hatted) { for (const [th, n] of [[0.35, 4], [0.85, 7], [1.3, 9]]) for (let i = 0; i < n; i++) curls.push([th, (i / n) * TAU + th]); }
      else if (!hooded) for (let i = 0; i < 12; i++) { const phi = (i / 12) * TAU + 0.26; curls.push([below(phi, cover.dome ? 0.2 : 0.5), phi]); } // under a brim they sit below its level
      for (const [th, phi] of curls) {
        const a = Math.abs(((phi + Math.PI) % TAU) - Math.PI);
        if (!(a > 2.5 || th < 0.5) && !(hatted && a > 1.3)) continue; // keep the face clear
        const d = dirAt(th, phi);
        if ((hatted && covered(...d, 0.1)) || inBand(...d) || atBow(...d)) continue;
        const p = surfacePoint(id, d[0], d[1], d[2], hatted ? HAIR_T : 1.11);
        part.add(S, col, { sx: 0.09, sy: 0.09, sz: 0.09, x: p.x, y: p.y, z: p.z });
      }
      break;
    }
    case 'mohawk': {
      if (!hatted) for (let i = 0; i < 7; i++) { // a ridge of blobs from the forehead over the crown to the back of the head
        const a = -0.52 + i * 0.37; // angle from straight up (forward negative, back positive), no lower than the back of the head
        if (band && Math.abs(a) > 0.5 && Math.abs(a) < 1.55) continue; // none across a headband
        const dir = new THREE.Vector3(0, Math.cos(a), -Math.sin(a));
        const p = surfacePoint(id, 0, dir.y, dir.z, 1.03);
        const h = 0.15 + 0.06 * Math.sin((i / 6) * Math.PI);
        _q.setFromUnitVectors(_up, dir);
        part.add(S, col, { matrix: new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y + dir.y * h * 0.55, p.z + dir.z * h * 0.55), _q.clone(), new THREE.Vector3(0.045, h, 0.09)) });
      }
      break;
    }
    case 'balding': {
      // thin hair over the crown (a see-the-scalp tint)
      if (!hatted) part.add(shellGeo(id, { scale: 1.012, rim: [0.72, 0.95, 1.0], nTh: 6 }), mixHex(o.skin, col, 0.38));
      // the fringe's ragged edges (jag, rimJag) make it read as hair
      break;
    }
    case 'wavy': {
      bangs(0.28, 0.2, 0.27);
      if (hooded) break;
      // feathered layers down the back and sides: flat strands laid along the hair, each swept down and back, in two
      // tiers that overlap like roof tiles and end in a tidy line at the collar
      for (const [th, n, len] of [[1.42, 7, 0.17], [1.72, 8, 0.15]]) for (let i = 0; i < n; i++) {
        const phi = 2.05 + ((i + 0.5) / n) * (TAU - 4.1), d = dirAt(th, phi); // behind the ears
        if (covered(...d, 0.06)) continue;
        const p = surfacePoint(id, d[0], d[1], d[2], 1.09), q = surfacePoint(id, ...dirAt(th + 0.5, phi), 1.09);
        const dir = new THREE.Vector3(q.x - p.x, q.y - p.y, q.z - p.z).normalize(); // along the hair, downward
        const nrm = new THREE.Vector3(p.x, p.y, p.z).normalize(), side = new THREE.Vector3().crossVectors(dir, nrm).normalize();
        nrm.crossVectors(side, dir); // a true surface frame: the strand lies flat on the hair (thin along the normal)
        const m = new THREE.Matrix4().makeBasis(side.multiplyScalar(0.05), dir.clone().multiplyScalar(len * 0.55), nrm.multiplyScalar(0.016));
        m.setPosition(p.x + dir.x * len * 0.4, p.y + dir.y * len * 0.4, p.z + dir.z * len * 0.4);
        part.add(S8, i % 2 ? col : lighter(col, 0.08), { matrix: m }); // a flat strand needs fewer facets
      }
      break;
    }
    case 'sidepart': {
      // combed across from a parting over the left eye, a soft wave over the right brow
      // the wave: a low swell laid on the hair over the right brow, swept across from the parting
      const wd = dirAt(0.78, -0.3);
      if (!hatted && !inBand(...wd)) part.add(S, col, { matrix: onHair(wd, [-1, 0.15, 0.25], 0.2 * (rx / 0.368), 0.045, 0.13, -0.012) });
      break;
    }
    case 'pompadour': {
      // the quiff: swept up and back off the forehead in a roll, the sides and back slicked
      if (!hatted && !band) {
        const k = rx / 0.368, f = surfacePoint(id, 0, Math.cos(1.0), Math.sin(1.0), 1);
        part.add(S, col, { sx: 0.24 * k, sy: 0.13, sz: 0.2, y: f.y + 0.09, z: f.z - 0.07, rx: -0.42 });
        part.add(S, lighter(col, 0.06), { sx: 0.2 * k, sy: 0.09, sz: 0.11, y: f.y + 0.13, z: f.z + 0.01, rx: -0.75 });
        part.add(S, col, { sx: 0.25 * k, sy: 0.1, sz: 0.22, y: ry * 0.86, z: -0.04, rx: 0.2 });
      } else if (!covered(0, 0.42, 0.9, 0.08) && !inBand(0, 0.42, 0.9)) bangs(0.22, 0.17, 0.28);
      break;
    }
    case 'shag': break; // all in the shell: the long sides in front of the ears (its sideburns), the ragged locks (rimJag)
    case 'tiedback': {
      // pulled back flat and tied low at the nape, the tail down the back
      if (hooded) break;
      const tail = new Part();
      tail.add(torusGeo(0.045, 0.016, TAU, 5, 12), darker(col, 0.6), { rx: Math.PI / 2 - 0.3 });
      tail.add(S, col, { sx: 0.075, sy: 0.07, sz: 0.06, y: 0.015, z: -0.01 });
      tail.add(S, col, { sx: 0.078, sy: 0.27, sz: 0.06, y: -0.24, z: -0.03 });
      tail.add(S, col, { sx: 0.05, sy: 0.1, sz: 0.04, y: -0.5, z: -0.035 });
      const t = Math.max(1.98, below(Math.PI, 0.14));
      const p = surfacePoint(id, 0, Math.cos(t), -Math.sin(t), hairShell(style, hatted).scale + 0.01);
      springs.push(swinger(head, [0, p.y, p.z], tail, 'tail', { gain: 0.9 }));
      break;
    }
    case 'afro': case 'buzz': break;
    default: // short
      bangs(0.26, 0.19, 0.27);
      if (!hatted && !band) part.add(S, col, { sx: 0.13, sy: 0.07, sz: 0.09, x: 0.11, y: 0.235 * (ry / 0.335), z: 0.2, rz: -0.35, rx: -0.6 }); // not through a headband
  }
  return springs;
}

// ------------------------------------------------------------------ hats

// A soft brim that follows a dome's rim all the way round (the rim dips at the back, so a flat disc would float or cut
// through the dome): a solid ring `width` wide and `thick` deep, drooping a little toward its edge.
const brimCache = new Map();
function brimGeo(shapeId, rim, scale, width, droop = 0.05, thick = 0.03, n = 32) {
  const key = [shapeId, rim, scale, width, droop, thick, n].join('|');
  if (brimCache.has(key)) return brimCache.get(key);
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const phi = (i / n) * TAU, t = rimAt(rim, phi) - 0.02;
    const p = surfacePoint(shapeId, Math.sin(t) * Math.sin(phi), Math.cos(t), Math.sin(t) * Math.cos(phi), scale);
    const hx = Math.sin(phi), hz = Math.cos(phi), r0 = Math.hypot(p.x, p.z) * 0.92;
    const inner = [hx * r0, p.y, hz * r0], outer = [hx * (r0 + width), p.y - droop, hz * (r0 + width)];
    pos.push(...inner, ...outer, outer[0], outer[1] - thick, outer[2], inner[0], inner[1] - thick, inner[2]);
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
    const a = i * 4 + k, b = i * 4 + ((k + 1) % 4), c = a + 4, d = b + 4;
    idx.push(a, c, b, b, c, d);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  brimCache.set(key, g);
  return g;
}

// A brim hat's crown: a tube round the head from the band (height y0) up `h`, each row the band's cross-section (the hair's own
// superellipse + BAND_GAP) times prof(v) (v 0 at the band, 1 at the top), closed by a gently domed top (`dome`, 0 = flat) unless
// `open`, or left as a plain tube (`bare`: a ribbon, a band). An open crown gets an inner wall and a lip, so it needs no double-sided
// material (no extra draw call).
const crownCache = new Map();
// Every row also stays CROWN_CLEAR outside the hair's own cross-section at its height, and a closed crown's top clears the top
// of the hair, so no hair pokes through a tapered crown on a square or oval head.
const CROWN_CLEAR = 0.008;
const crownTall = (shapeId, env, y0, h) => Math.max(h, shapeOf(shapeId).ry * env + CROWN_CLEAR + 0.006 - y0);
function crownGeo(shapeId, env, y0, h, prof, { dome = 0, open = false, bare = false, n = 36, rows = 8, wall = 0.012 } = {}) {
  const key = [shapeId, env, y0, h, prof, dome, open, bare, n, rows, wall].join('|');
  if (crownCache.has(key)) return crownCache.get(key);
  if (!bare && !open) h = crownTall(shapeId, env, y0, h);
  const band = [];
  for (let i = 0; i < n; i++) band.push(crossRadius(shapeId, y0, (i / n) * TAU, env) + BAND_GAP);
  const pos = [], idx = [];
  const ring = (k, y, out) => { const b = pos.length / 3; for (let i = 0; i < n; i++) { const a = (i / n) * TAU, r = Math.max(band[i] * k, out >= 0 ? crossRadius(shapeId, y, a, env) + CROWN_CLEAR : 0) + out; pos.push(Math.sin(a) * r, y, Math.cos(a) * r); } return b; };
  const strip = (a, b, flip) => { for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (flip) idx.push(a + i, b + i, a + j, b + i, b + j, a + j); else idx.push(a + i, a + j, b + i, b + i, a + j, b + j); } }; // (b above a: faces outward)
  const rowsAt = [];
  for (let r = 0; r <= rows; r++) { const v = r / rows; rowsAt.push(ring(profileAt(prof, v), y0 + v * h, 0)); }
  for (let r = 0; r < rows; r++) strip(rowsAt[r], rowsAt[r + 1], false);
  const kTop = profileAt(prof, 1), yTop = y0 + h;
  if (bare) { /* a ribbon or a band: just the tube */ } else if (!open) { // the top: its own ring (a crisp edge for the ink) and a fan to a centre lifted `dome`
    const t0 = ring(kTop, yTop, 0), c = pos.length / 3;
    pos.push(0, yTop + dome, 0);
    for (let i = 0; i < n; i++) idx.push(t0 + i, t0 + ((i + 1) % n), c);
  } else { // the lip over the top edge and the inner wall back down to the band
    const l0 = ring(kTop, yTop, 0), l1 = ring(kTop, yTop + wall * 0.4, -wall * 0.5), l2 = ring(kTop, yTop, -wall), i0 = ring(profileAt(prof, 0), y0, -wall);
    strip(l0, l1, false); strip(l1, l2, false); strip(l2, i0, false);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  crownCache.set(key, g);
  return g;
}
// The radius of a crown's outer surface at the band and azimuth phi (for laying bands, pinches and points on it).
const crownR = (shapeId, env, y0, phi) => crossRadius(shapeId, y0, phi, env) + BAND_GAP;
// A brim round a crown's band: a solid ring from the crown's own rim out `width(phi)`, its edge lowered `droop(phi)` (negative turns
// it up), `thick` deep.
function brimRing(shapeId, env, y0, width, droop, thick = 0.026, n = 40) {
  const key = ['br', shapeId, env, y0, width, droop, thick, n].join('|');
  if (crownCache.has(key)) return crownCache.get(key);
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const phi = (i / n) * TAU, r0 = crownR(shapeId, env, y0, phi) - 0.004, r1 = r0 + width(phi), d = droop(phi);
    const hx = Math.sin(phi), hz = Math.cos(phi);
    pos.push(hx * r0, y0, hz * r0, hx * r1, y0 - d, hz * r1, hx * r1, y0 - d - thick, hz * r1, hx * r0, y0 - thick, hz * r0);
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
    const a = i * 4 + k, b = i * 4 + ((k + 1) % 4), c = a + 4, d = b + 4;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  crownCache.set(key, g);
  return g;
}

// Returns { group, springs }. `group` goes on the head group at the origin (the head centre), and is derived from the
// head shape and the hair under it (`style`): domes are shells over the hair, brims rest where the hair is as wide as the crown.
export function buildHat(kind, color, shapeId, style = 'short') {
  const group = new THREE.Group();
  const springs = [];
  const sh = shapeOf(shapeId), c = color || '#e0574f';
  const part = new Part(), S = sphere(12, 8);
  const cover = hatCover(kind, shapeId, style);
  const env = cover ? cover.env : envelope(style);
  const reach = (dx, dy, dz) => hairReach(style, shapeId, dx, dy, dz, false); // un-flattened hair (bows and headbands sit on top of it)
  const gap = DOMES[kind] ? DOMES[kind][1] : 0.065;
  const HT = env + gap;
  const dome = (opts, col = c) => part.add(shellGeo(shapeId, { scale: HT, rim: [1.15, 1.32, 1.5], ...opts }), col);
  const top = surfacePoint(shapeId, 0, 1, 0, HT);

  switch (kind) {
    case 'cap': case 'capback': {
      dome();
      const back = kind === 'capback';
      const rimPt = back ? surfacePoint(shapeId, 0, Math.cos(1.5), -Math.sin(1.5), HT) : surfacePoint(shapeId, 0, Math.cos(1.15), Math.sin(1.15), HT); // a backward cap's peak at its own back rim, clear of the hair
      part.add(S, darker(c, 0.8), { sx: 0.17, sy: 0.02, sz: 0.17, x: 0, y: rimPt.y - 0.012, z: rimPt.z + (back ? -0.12 : 0.12), rx: back ? -0.16 : 0.16 });
      part.add(S, darker(c, 0.7), { sx: 0.03, sy: 0.026, sz: 0.03, y: top.y + 0.005 });
      break;
    }
    case 'beanie': {
      dome({ rim: [1.3, 1.42, 1.55] });
      part.add(shellGeo(shapeId, { scale: HT + 0.025, rim: [1.3, 1.42, 1.55], start: 0.7 }), darker(c, 0.8));
      const pom = new Part();
      pom.add(S, '#ffffff', { sx: 0.085, sy: 0.085, sz: 0.085, y: 0.06 });
      springs.push(swinger(group, [0, top.y * 1.005 + 0.02, 0], pom, 'pom', { gain: 0.6 }));
      break;
    }
    case 'sunhat': {
      dome({ rim: [1.05, 1.25, 1.45] }, '#f3dca0');
      part.add(shellGeo(shapeId, { scale: HT + 0.015, rim: [1.05, 1.25, 1.45], start: 0.72 }), c);
      part.add(brimGeo(shapeId, [1.05, 1.25, 1.45], HT + 0.01, 0.24, 0.05), '#f3dca0');
      break;
    }
    case 'bow': {
      const d = [0.5, 0.82, 0.3], k = reach(...d);
      const p = surfacePoint(shapeId, d[0], d[1], d[2], k + 0.01);
      const bow = new THREE.Group();
      const bp = new Part();
      const cone = coneGeo(8);
      bp.add(cone, c, { sx: 0.11, sy: 0.17, sz: 0.06, x: -0.11, rz: Math.PI / 2 });
      bp.add(cone, c, { sx: 0.11, sy: 0.17, sz: 0.06, x: 0.11, rz: -Math.PI / 2 });
      bp.add(S, darker(c, 0.75), { sx: 0.055, sy: 0.055, sz: 0.05 });
      bow.add(bp.build());
      bow.position.set(p.x, p.y, p.z);
      facing(bow, [p.x, p.y, p.z]);
      group.add(bow);
      break;
    }
    case 'tophat': {
      // the crown is cut to the head and comes down to the band just over the brows, a ribbon round its foot and a brim turned up
      // at the sides
      const y0 = cover.y0, ink = '#2b2b35';
      part.add(crownGeo(shapeId, env, y0, 0.44, [[1, 0], [0.97, 0.5], [1.03, 1]]), ink);
      part.add(crownGeo(shapeId, env, y0 + 0.006, 0.075, [[1.014, 0], [1.012, 1]], { bare: true }), c);
      part.add(brimRing(shapeId, env, y0 + 0.004, phi => 0.085 + 0.025 * Math.cos(phi) ** 2, phi => -0.035 * Math.sin(phi) ** 2), ink);
      break;
    }
    case 'crown': {
      // a gold band round the head at the brows, its points on the top edge, a jewel in front. One material (an inner wall
      // instead of a double-sided one).
      const y0 = cover.y0 - 0.01, gold = '#f2c14e', prof = [[1, 0], [1.07, 1]];
      part.add(crownGeo(shapeId, env, y0, 0.11, prof, { open: true }), gold);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU, r = crownR(shapeId, env, y0, a) * 1.07 - 0.012;
        part.add(coneGeo(5), gold, { x: Math.sin(a) * r, y: y0 + 0.11 + 0.065, z: Math.cos(a) * r, sx: 0.055, sy: 0.13, sz: 0.055 });
        part.add(S, gold, { sx: 0.022, sy: 0.022, sz: 0.022, x: Math.sin(a) * r, y: y0 + 0.11 + 0.14, z: Math.cos(a) * r });
      }
      part.add(S, '#e0574f', { sx: 0.036, sy: 0.04, sz: 0.022, y: y0 + 0.05, z: crownR(shapeId, env, y0, 0) * 1.035 + 0.01 });
      break;
    }
    case 'fedora': {
      // a tapered crown with the crease down the top and two pinches at the front, a wide brim snapped down at the front, so it
      // reads as a fedora and not a bowler. Cut to the head, down to the band just over the brows.
      const y0 = cover.y0, h = crownTall(shapeId, env, cover.y0, 0.25), prof = [[1, 0], [0.98, 0.3], [0.9, 0.72], [0.83, 1]];
      part.add(crownGeo(shapeId, env, y0, h, prof, { dome: 0.03 }), c);
      part.add(crownGeo(shapeId, env, y0 + 0.004, 0.06, [[1.016, 0], [1.012, 1]], { bare: true }), '#1e1e24');
      part.add(S, darker(c, 0.75), { sx: 0.04, sy: 0.022, sz: crownR(shapeId, env, y0, 0) * 0.62, y: y0 + h + 0.012, z: -0.01 });
      const rf = crownR(shapeId, env, y0, 0) * profileAt(prof, 0.62);
      for (const s of [-1, 1]) part.add(S, darker(c, 0.9), { sx: 0.06, sy: 0.07, sz: 0.02, x: s * 0.1, y: y0 + h * 0.62, z: rf - 0.012, ry: s * 0.45 });
      // the brim: snapped down at the front, up a little at the back, narrower at the back (it stays clear of a chair back behind)
      part.add(brimRing(shapeId, env, y0 + 0.002, phi => 0.11 + 0.035 * Math.max(0, Math.cos(phi)) ** 2 - 0.02 * Math.max(0, -Math.cos(phi)) ** 2,
        phi => 0.05 * Math.max(0, Math.cos(phi)) ** 2 - 0.03 * Math.max(0, -Math.cos(phi)) ** 2 - 0.012 * Math.sin(phi) ** 2, 0.022), c);
      break;
    }
    case 'hood': {
      // the Cultist's cowl, which takes the head's place (human.js draws no head, face or hair under it): a closed rounded hood a
      // little fuller than a head, fuller still at the back, with a deep dark opening at the front framed by a turned edge, and two
      // soft glints in the dark for eyes. Rounded on top: no point (a pointed hood reads as something nobody wants in a kids' game)
      const sc = HT + 0.03, k = sh.rx / 0.368, cy = -0.05 * (sh.ry / 0.335);
      part.add(shellGeo(shapeId, { scale: sc, rim: [Math.PI, Math.PI, Math.PI], back: 0.05, side: 0.05, nTh: 16, nPhi: 32 }), c);
      const f = surfacePoint(shapeId, 0, cy / sh.ry, 1, sc), fz = f.z;
      part.add(S, '#150e16', { sx: 0.25 * k, sy: 0.27, sz: 0.13, y: cy, z: fz - 0.11 });                  // the shadow inside
      part.add(torusGeo(1, 0.2, TAU, 8, 28), darker(c, 0.72), { sx: 0.25 * k, sy: 0.27, sz: 0.25, y: cy, z: fz - 0.075 }); // the turned edge
      for (const s of [-1, 1]) part.add(S, '#f3e2a6', { sx: 0.032, sy: 0.042, sz: 0.012, x: s * 0.085 * k, y: cy + 0.04, z: fz + 0.012 });
      break;
    }
    case 'party': {
      const p = surfacePoint(shapeId, 0.12, 1, 0.05, env);
      const tip = new Part();
      tip.add(coneGeo(10), c, { sx: 0.14, sy: 0.42, sz: 0.14, y: 0.19 });
      tip.add(torusGeo(0.1, 0.014, TAU, 4, 12), '#fff27a', { y: 0.08, rx: Math.PI / 2 });
      tip.add(torusGeo(0.07, 0.014, TAU, 4, 12), '#ffffff', { y: 0.2, rx: Math.PI / 2 });
      tip.add(S, '#fff27a', { sx: 0.05, sy: 0.05, sz: 0.05, y: 0.42 });
      springs.push(swinger(group, [p.x, p.y - 0.008, p.z], tip, 'pom', { gain: 0.35 })); // the flat base sunk a little into the hair, so its rim rests on it all round
      break;
    }
    case 'straw': {
      dome({ rim: [1.1, 1.3, 1.45] }, '#e8cf7a');
      part.add(shellGeo(shapeId, { scale: HT + 0.015, rim: [1.1, 1.3, 1.45], start: 0.75 }), c);
      part.add(brimGeo(shapeId, [1.1, 1.3, 1.45], HT + 0.01, 0.27, 0.03), '#e8cf7a');
      break;
    }
    case 'mailcap': {
      dome({ rim: [1.1, 1.28, 1.42], flat: cover.flat });
      const rimPt = surfacePoint(shapeId, 0, Math.cos(1.1), Math.sin(1.1), HT);
      part.add(S, '#1e2a44', { sx: 0.18, sy: 0.02, sz: 0.17, y: rimPt.y - 0.02, z: rimPt.z + 0.12, rx: 0.16 });
      part.add(S, '#f2c14e', { sx: 0.05, sy: 0.05, sz: 0.012, y: rimPt.y + 0.09, z: rimPt.z + 0.03 });
      break;
    }
    case 'flatcap': {
      dome({ rim: [1.12, 1.3, 1.42], flat: cover.flat, puff: 0.07, side: 0.05 });
      const rimPt = surfacePoint(shapeId, 0, Math.cos(1.12), Math.sin(1.12), HT);
      part.add(S, c, { sx: 0.14, sy: 0.02, sz: 0.11, y: rimPt.y - 0.005, z: rimPt.z + 0.1, rx: 0.22 });
      break;
    }
    case 'headband': {
      // it sits on the hair, not under it: as far out as the hair reaches round the band's line
      let k = 1;
      for (let p = 0; p < TAU; p += TAU / 16) for (const t of [0.93, 1.05, 1.16]) k = Math.max(k, reach(Math.sin(t) * Math.sin(p), Math.cos(t), Math.sin(t) * Math.cos(p)));
      const sc = Math.max(1.1, k + 0.025);
      part.add(shellGeo(shapeId, { scale: sc, rim: [1.16, 1.16, 1.2], start: 0.8 }), c);
      const p = surfacePoint(shapeId, 0.98, Math.cos(1.06), 0.1, sc);
      part.add(S, darker(c, 0.85), { sx: 0.05, sy: 0.05, sz: 0.045, x: p.x, y: p.y, z: p.z });
      break;
    }
    case 'chef': {
      // a band round the head at the brows and the puff over it
      const y0 = cover.y0, rs = crownR(shapeId, env, y0, Math.PI / 2), rf = crownR(shapeId, env, y0, 0);
      let rm = 0; for (let a = 0; a < TAU; a += TAU / 36) rm = Math.max(rm, crossRadius(shapeId, y0 + 0.13, a, env) + CROWN_CLEAR, crownR(shapeId, env, y0, a) * 1.05);
      part.add(crownGeo(shapeId, env, y0, 0.13, [[1, 0], [1.05, 1]], { bare: true }), '#ffffff');
      // the puff overhangs the band all round, a square head's corners too, so no hair shows between the two
      part.add(S, '#ffffff', { sx: Math.max(rs * 1.22, rm * 1.18), sy: 0.2, sz: Math.max(rf * 1.22, rm * 1.18), y: y0 + 0.27 });
      part.add(S, '#ffffff', { sx: rs * 0.6, sy: 0.14, sz: rf * 0.6, y: y0 + 0.42, x: 0.06 });
      break;
    }
    default: return null;
  }
  group.add(part.build());
  return { group, springs, cover };
}

// ------------------------------------------------------------------ accessories

// `chest` is the torso group, `head` the head group. Returns springs to run. Everything is laid on the torso's real
// surface (straps go over the shoulders, not through the chest) and kept out of the arms' way.
export function buildAccessory(kind, o, dims, chest, head) {
  const springs = [];
  const col = o.accColor || '#3a3a48';
  const S = sphere(12, 8);
  const p = new Part();
  const T = dims.torsoTop, yb = -0.06, H = T - yb, wT = dims.wT, dT = dims.dT;
  const jacket = ['suit', 'blazer', 'tux', 'jacket', 'vest'].includes(o.outfit), k0 = jacket ? 1.04 : 1;
  // a point on the torso surface at height y, sideways x, on the front (zs = 1) or the back (zs = -1), lifted `out`
  const on = (x, y, zs = 1, out = 0.012) => {
    const r = profileAt(TORSO_PROFILE, Math.max(0, Math.min(1, (y - yb) / H))) * k0, rx = wT * r, rz = dT * r;
    return [x, y, zs * (rz * Math.sqrt(Math.max(0, 1 - (x / Math.max(1e-3, rx)) ** 2)) + out)];
  };
  const chain = (pts, r, c) => { for (let i = 0; i < pts.length - 1; i++) p.rod(pts[i], pts[i + 1], r, c); };
  // things on the torso bend with it (the body type's warp, human.js bodyDims); a pivot point is moved the same way
  const warp = dims.shape?.warp || null, onBody = () => { p.warp(warp); return p.build(); };
  const warpPt = q => (warp ? warp(q[0], q[1], q[2], [0, 0, 0]) : q);
  switch (kind) {
    case 'scarf': {
      // wound round the base of the neck, below the chin, the knot on the front and a tail down the back
      const sc = o.accColor || '#e0574f', yS = T - 0.07, r = profileAt(TORSO_PROFILE, (yS - yb) / H) * k0;
      const rx = wT * r + 0.028, rz = dT * r + 0.028;
      p.add(torusGeo(1, 0.26, TAU, 6, 22), sc, { y: yS, rx: Math.PI / 2, sx: rx, sy: rz, sz: 0.17 });
      // and one more turn snug round the neck above it
      const nr = (dims.neckR || 0.0875) + 0.026;
      p.add(torusGeo(1, 0.3, TAU, 6, 20), sc, { y: T + 0.004, rx: Math.PI / 2, sx: nr, sy: nr, sz: 0.1 });
      const kn = on(wT * 0.28, yS - 0.05, 1, 0.035);
      p.add(S, darker(sc, 0.85), { sx: 0.05, sy: 0.06, sz: 0.045, x: kn[0], y: kn[1], z: kn[2] });
      chest.add(onBody());
      const tail = new Part();
      tail.add(S, sc, { sx: 0.06, sy: 0.19, sz: 0.035, y: -0.16 });
      tail.add(S, darker(sc, 0.85), { sx: 0.06, sy: 0.02, sz: 0.036, y: -0.33 });
      const tb = warpPt(on(wT * 0.22, yS - 0.02, -1, 0.04));
      springs.push(swinger(chest, tb, tail, 'tail', { gain: 0.8 }));
      break;
    }
    case 'backpack': {
      const bc = o.accColor || '#e8743a', st = darker(bc, 0.7);
      const back = on(0, T - 0.26, -1, 0);
      // (seats-bodies) the pack itself on a pivot (springs.bag, human.js stepBag): lying on the back it comes round the side of the body
      // to lie on the tummy, face up (held there, as you would on a bed), instead of inside the mattress under the back; standing it
      // is on the back as built. On the body, not beside it: the beds are narrow at the outer side and a partner lies at the inner one
      const piv = new THREE.Group(), pk = new Part(), B0 = [0, T - 0.26, back[2] - 0.08], pv = warpPt(B0);
      piv.name = 'backpack-pack'; piv.position.set(pv[0], pv[1], pv[2]);
      pk.add(S, bc, { sx: 0.19, sy: 0.22, sz: 0.1 });
      pk.add(S, darker(bc, 0.8), { sx: 0.13, sy: 0.09, sz: 0.06, y: -0.1, z: -0.08 });
      piv.add(pk.build());
      const F0 = warpPt(on(0, T * 0.15, 1, 0)), Fy = F0[1], Fz = F0[2] + 0.05, Rx = -(wT + 0.2), Mz = (pv[2] + Fz) / 2, Hz = (pv[2] - Fz) / 2;
      piv.userData.pose = k => {
        const a = k * Math.PI;
        piv.position.set(Rx * Math.sin(a), pv[1] + (Fy - pv[1]) * k, Mz + Hz * Math.cos(a)); // (a half circle round the left side)
        piv.rotation.y = Math.PI * k; // (turned with it: the pocket ends up on top)
      };
      springs.bag = piv;
      chest.add(piv);
      for (const s of [-1, 1]) { // from the top of the pack, over the shoulder, down the front to the ribs
        const x = s * wT * 0.5;
        chain([on(s * 0.1, T - 0.12, -1, 0.01), on(x, T - 0.045, -1, 0.012), [x, T - 0.012, 0], on(x, T - 0.045, 1, 0.012), on(x * 1.05, T - 0.18, 1, 0.012), on(x * 1.1, T - 0.33, 1, 0.012)], 0.016, st);
      }
      chest.add(onBody());
      break;
    }
    case 'bowtie': {
      const bc = o.accColor || '#e0574f', q = on(0, T - 0.06, 1, 0.03);
      p.add(coneGeo(8), bc, { sx: 0.08, sy: 0.11, sz: 0.05, x: -0.09, y: q[1], z: q[2], rz: Math.PI / 2 });
      p.add(coneGeo(8), bc, { sx: 0.08, sy: 0.11, sz: 0.05, x: 0.09, y: q[1], z: q[2], rz: -Math.PI / 2 });
      p.add(S, darker(bc, 0.75), { sx: 0.04, sy: 0.04, sz: 0.04, y: q[1], z: q[2] });
      chest.add(onBody());
      break;
    }
    case 'headphones': {
      // the band goes over the hair (under a hat only the ear cups show)
      const sh = shapeOf(o.faceShape), hatted = !['none', 'bow', 'headband'].includes(o.hat);
      const k = Math.max(1.16, hairReach(o.hairStyle, o.faceShape, 0, 1, 0) + 0.06, hairReach(o.hairStyle, o.faceShape, 1, 0.4, 0) + 0.06);
      const R = sh.rx * k;
      if (!hatted) p.add(torusGeo(R, 0.024, Math.PI, 6, 24), col, { y: 0.0, sz: 1.0, sy: (sh.ry * k) / R, rz: 0 });
      const cx = Math.max(sh.rx * 1.06, R * 0.92);
      for (const s of [-1, 1]) {
        p.add(cylGeo(1, 1, 1, 14), col, { x: s * cx, y: -0.02, sx: 0.085, sy: 0.05, sz: 0.085, rz: Math.PI / 2 });
        p.add(cylGeo(1, 1, 1, 14), lighter(col, 0.35), { x: s * (cx + 0.06 * 0.5 + 0.01), y: -0.02, sx: 0.06, sy: 0.02, sz: 0.06, rz: Math.PI / 2 });
      }
      head.add(p.build());
      break;
    }
    case 'satchel': { const bag = buildSatchel(p, dims, on, chain, warpPt); chest.add(onBody()); chest.add(bag); springs.bag = bag; break; } // (springs.bag: the bag's pivot, for human.js: lying down it swings round beside the hip)
  }
  return springs;
}

// A messenger bag: the strap over the right shoulder, across the chest and the back, the bag at the back of the left
// hip (behind the arm, so the arm swings past it instead of through it). Pat the mail carrier wears one too.
// The straps go into `p` (on the body); the bag itself hangs from a pivot at the hip (returned: a Group on the chest), so lying on
// the back it can swing round to lie beside the hip on the quilt instead of inside the mattress (bodies-fix: human.js stepBag).
export function buildSatchel(p, dims, on, chain, warpPt = q => q) {
  const T = dims.torsoTop, wT = dims.wT, dT = dims.dT, st = '#6b4428';
  const by = -0.02, bag = [wT * 0.55, by, -(dT * 0.98 + 0.07)];
  const sx = -wT * 0.5;
  chain([on(sx, T - 0.045, 1), [sx, T - 0.012, 0], on(sx, T - 0.045, -1)], 0.022, st);
  chain([on(sx, T - 0.045, 1), on(-wT * 0.1, T - 0.2, 1), on(wT * 0.45, 0.06, 1), on(wT * 0.98, 0.02, 1, 0.02), [bag[0] + 0.1, bag[1] + 0.1, bag[2] + 0.03]], 0.02, st);
  chain([on(sx, T - 0.045, -1), on(0, T - 0.2, -1), [bag[0] - 0.08, bag[1] + 0.12, bag[2] + 0.02]], 0.02, st);
  // the bag on its pivot at the hip's side, with the last links of the straps down onto it (they swing with it)
  const piv = new THREE.Group(), pv = warpPt([bag[0], by, 0]), pb = new Part();
  piv.name = 'satchel-bag'; piv.position.set(pv[0], pv[1], pv[2]);
  const bz = bag[2];
  pb.add(sphere(12, 8), '#8a5a3a', { sx: 0.16, sy: 0.14, sz: 0.055, z: bz, ry: -0.35 });
  pb.add(sphere(10, 7), '#74492e', { sx: 0.165, sy: 0.06, sz: 0.058, y: 0.08, z: bz - 0.004, ry: -0.35 }); // the flap
  pb.rod([0.1, 0.1, bz + 0.03], [0.06, 0.06, bz], 0.02, st); pb.rod([-0.08, 0.12, bz + 0.02], [-0.04, 0.07, bz], 0.02, st);
  piv.add(pb.build());
  return piv;
}

// ------------------------------------------------------------------ held things (the right hand's anchor is the palm)

// A fishing pole in four joints (which pole: fish-gear-art.js buildPole; the stick rod by default). The butt sits in
// the fist; the pole runs along -y (the way the forearm points), `joints[i].rotation.x` bends it (positive = the tip
// droops) on top of `rest[i]`, the pole's own crook. `tip` is where the fishing line hangs from.
export function buildRod(tip, pole = 'stick') { return buildPole(pole, tip); }

// A little bone biscuit.
export function buildTreat() {
  const g = new THREE.Group();
  const p = new Part(), S = sphere(10, 8), c = '#e2b26a';
  p.add(capsuleGeo(0.03, 0.14, 3, 8), c, { rz: Math.PI / 2 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add(S, c, { sx: 0.04, sy: 0.04, sz: 0.04, x: sx * 0.09, z: sz * 0.026 });
  g.add(p.build());
  g.position.set(0, -0.02, 0.06);
  return g;
}

// A board game's box off the store's shelf (table-games), carried at your side by its top edge: a teal tin with a gold stripe and
// a little red engine on its end, our own look for Mexican Train.
export function buildGameBox() {
  const g = new THREE.Group();
  const p = new Part(), B = boxGeo();
  p.add(B, '#1f5560', { sx: 0.07, sy: 0.2, sz: 0.3, y: -0.1 });
  p.add(B, '#e3aa45', { sx: 0.074, sy: 0.035, sz: 0.304, y: -0.12 });
  p.add(B, '#163f47', { sx: 0.074, sy: 0.02, sz: 0.304, y: -0.006 });
  for (const k of [-1, 1]) p.add(B, '#e0463c', { sx: 0.012, sy: 0.05, sz: 0.07, x: k * 0.038, y: -0.07, z: 0.06 });
  g.add(p.build());
  return g;
}

// A cartoon fish, nose forward (+z), held across the palm.
export function buildFish(color = '#6fb8ff', size = 1) {
  const g = new THREE.Group();
  const p = new Part(), S = sphere(12, 8);
  p.add(S, color, { sx: 0.09, sy: 0.08, sz: 0.2 });
  p.add(S, lighter(color, 0.6), { sx: 0.07, sy: 0.05, sz: 0.16, y: -0.03, z: 0.02 });
  p.add(coneGeo(6), darker(color, 0.8), { sx: 0.08, sy: 0.14, sz: 0.02, z: -0.26, rx: -Math.PI / 2 });
  p.add(coneGeo(4), darker(color, 0.8), { sx: 0.04, sy: 0.08, sz: 0.02, y: 0.1, z: -0.02 });
  p.add(S, '#ffffff', { sx: 0.024, sy: 0.024, sz: 0.02, x: 0.062, y: 0.02, z: 0.12 });
  p.add(S, '#231a2a', { sx: 0.012, sy: 0.012, sz: 0.012, x: 0.07, y: 0.02, z: 0.125 });
  p.add(S, '#231a2a', { sx: 0.024, sy: 0.024, sz: 0.02, x: -0.062, y: 0.02, z: 0.12 });
  g.add(p.build());
  const w = new THREE.Group(); // wrap so the fish lies across the hand (nose to the character's left), showing its side
  g.rotation.y = Math.PI / 2;
  w.add(g);
  w.scale.setScalar(Number.isFinite(size) && size > 0 ? size : 1);
  w.position.set(0, -0.03, 0.02);
  return w;
}
