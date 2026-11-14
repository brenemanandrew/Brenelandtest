// One smooth arm for human.js: a single tube from the shoulder to the wrist, a little thicker up top and oval at the wrist, where it
// ends inside the hand's heel, bent smoothly at the elbow by skinning. The clothes are a shell over it, the same tube a few millimetres
// larger ending at its hem, and the bare arm is built only below the hem (nothing hidden under the cloth to z-fight). The shell's top
// is pressed onto the torso's shoulder line (read off its vertices at build), so sleeve and shirt read as one garment.
//
// The shoulder is a ball in a socket (bodies-fix, Andrew: "When they raise their arm the upper part of the arm pinches in. Arms don't
// work like that."): the sleeve's top is the shell's own rounded end, a ball of the shell's radius about the arm's axis, rigid with the
// upper arm and half buried in the torso, so it turns in the torso and looks the same however the arm is raised; its centre is dropped
// just enough for its top to sit on the torso's shoulder line (a ball stood up off it read as a puff). Every ring of the upper arm
// keeps its full width in every pose: nothing at the top blends toward the chest (a dome flattened onto the shoulder line and rings
// handed to the chest turned up as a horn and pinched the arm's top when it rose).
//
// Skinning: six bones per arm, plain Object3Ds whose world matrices map the arm's rest coordinates (the shoulder's frame, the arm
// hanging down -y) to the world, so their inverses are identity (rigid-merge's convention):
//   C   under the chest at the shoulder joint (kept for the arm copies: no vertex weighs on it now)
//   U   under the shoulder group: the upper arm and its ball
//   E1, E2, E3  under the elbow group: turned back 3/4, 1/2 and 1/4 of the elbow's turn. The rings round the elbow are handed from
//       one to the next a quarter of the bend apart, so no ring averages two far-apart turns (what pinches a skinned elbow).
//   F   under the elbow group, (0, Lu, 0) up it: the forearm
// Each vertex is weighted down that chain by how far down the arm it is. human.js turns the bones after the arm is posed
// (poseArmBones). rigid-merge draws the SkinnedMesh inside the body's one mesh (userData.armSkin), so the arm costs no draw call of
// its own.
import * as THREE from 'three';
import { toon } from './toon.js';
import { clamp, smooth } from './bodies-geo.js';

export const ARM_SEG = 12;          // vertices round the tube
export const SHELL = 0.085;        // a sleeve stands this much (arm radii) off the arm
export const ARM_TAPER = { top: 1.0, elbow: 0.9, wrist: 0.8, wristX: 0.78 }; // radius (arm radii) at the shoulder, the elbow, the wrist; the wrist's oval side to side
// the sleeves: where the hem is (a share of the upper arm, or down the forearm from the wrist), how thick the shell stands off the arm,
// the cuff's band
export function sleeveOf(SL, D) {
  const L = D.Lu + D.Lf;
  if (SL.robe) return { hem: L + 0.01, k: SHELL, flare: 0.55, cuff: 0.05, closed: true };
  if (SL.jacket) return { hem: L - 0.035, k: SHELL + 0.012, pad: 0.035, cuff: 0.045, shirtCuff: true };
  if (SL.long) return { hem: L - 0.004, k: SHELL, cuff: 0.045, closed: true };
  if (SL.cap) return { hem: D.Lu * 0.2, k: SHELL * 0.8 };
  return { hem: D.Lu * 0.55, k: SHELL }; // a short sleeve: half way down the upper arm
}

// The arm's radius at d (metres down it from the shoulder joint) and its oval: [side to side, front to back]
function radiusAt(d, D, out) {
  const r = D.armR, Lu = D.Lu, Lf = D.Lf, T = ARM_TAPER;
  let k, ox = 1;
  if (d <= Lu) k = T.top + (T.elbow - T.top) * smooth(d / Lu) + 0.03 * Math.sin(clamp(d / Lu, 0, 1) * Math.PI); // (a little fuller half way down the upper arm)
  else { const u = clamp((d - Lu) / Lf, 0, 1); k = T.elbow + 0.02 * Math.sin(u * Math.PI) + (T.wrist - T.elbow) * smooth(u); ox = 1 - (1 - T.wristX) * smooth((u - 0.5) / 0.5); }
  out[0] = r * k * ox; out[1] = r * k;
  return out;
}

// The arm's outside at d down it (metres): its own radius, or its sleeve's where the sleeve covers it: [side to side, front to back]
// (for the fit's tools: tools/avatar-fit-lib.mjs measures against this)
export function armOuterAt(d, D, SL, out = [0, 0]) {
  const S = sleeveOf(SL, D);
  radiusAt(d, D, out);
  if (d <= S.hem) { const k = 1 + S.k + (S.pad ? S.pad * (1 - smooth(d / (D.Lu * 0.45))) : 0) + (S.flare ? S.flare * smooth((d - D.Lu * 0.6) / (S.hem - D.Lu * 0.6)) : 0); out[0] *= k; out[1] *= k; }
  return out;
}

// the vertex weights at d down the arm for the bones [C, U, E1, E2, E3, F]: the two neighbours on the chain U, E1, E2, E3, F the
// vertex is between (index, weight): out = [i0, w0, i1, w1]. The ball and the whole upper arm are U's alone (full width in every pose).
const CHAIN = 5; // U, E1, E2, E3, F
function weights(d, D, out) {
  const b = D.armR * 1.5, t = smooth(clamp((d - (D.Lu - b)) / (2 * b), 0, 1)) * (CHAIN - 1), i = Math.min(CHAIN - 2, Math.floor(t)), f = t - i;
  out[0] = 1 + i; out[1] = 1 - f; out[2] = 2 + i; out[3] = f;
  return out;
}

// Build one arm. side +1 left, -1 right; D the body's dims; SL the outfit's sleeves (bodies-outfit outfitSpec); col { skin, sleeve,
// cuff, shirtCuff }; torsoTop(x, z) -> the torso's height there in the shoulder's frame (or -Infinity off it); bones [C, U, E1, E2, E3, F].
export function buildArmMesh(side, D, SL, col, torsoTop, bones, torsoNormal = null) {
  const S = sleeveOf(SL, D), L = D.Lu + D.Lf, r = D.armR, n = ARM_SEG;
  let shellTop = null, layer = null, hemFix = null, shellD = []; /* (hemFix: the hem's ring, its lip and the ring above: their normals made the sleeve's, below) */ const rings = []; // (rings: each ring down the arm, for tests: its first vertex, how far down, shell or skin)
  const pos = [], colr = [], si = [], sw = [], idx = [], rr = [0, 0], w = [0, 0, 0, 0];
  const cSkin = new THREE.Color(col.skin), cSleeve = new THREE.Color(col.sleeve), cCuff = new THREE.Color(col.cuff), cShirt = new THREE.Color(col.shirtCuff || col.cuff);
  const ring = (d, kx, kz, c, yAbove = null, rad = null) => { // a ring of n vertices at d down the arm (or yAbove over the joint, radius rad: the cap)
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      let x, y, z;
      if (yAbove !== null) { x = ca * rad; z = sa * rad; y = yAbove; if (i === 0) rings.push({ i: base, d: -yAbove, layer: 'cap' }); }
      else { radiusAt(d, D, rr); x = ca * rr[0] * kx; z = sa * rr[1] * kz; y = -d; if (i === 0 && layer) rings.push({ i: base, d, layer }); }
      pos.push(x, y, z); colr.push(c.r, c.g, c.b);
      weights(Math.max(0, -y), D, w);
      si.push(w[0], w[2], 0, 0); sw.push(w[1], w[3], 0, 0);
    }
    return base;
  };
  // wound so the faces look outward
  const strip = (a, b) => { for (let i = 0; i < n; i++) { const j = (i + 1) % n; idx.push(a + i, a + j, b + i, a + j, b + j, b + i); } };
  const fan = (a, apex, down) => { for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (down) idx.push(a + i, a + j, apex); else idx.push(apex, a + j, a + i); } };
  const point = (x, y, z, c) => { pos.push(x, y, z); colr.push(c.r, c.g, c.b); weights(Math.max(0, -y), D, w); si.push(w[0], w[2], 0, 0); sw.push(w[1], w[3], 0, 0); return pos.length / 3 - 1; };
  // the stations down the arm: denser round the elbow
  const stations = (d0, d1) => { const out = [d0]; let d = d0; while (d < d1 - 1e-4) { const near = Math.abs(d - D.Lu) < r * 1.5; d = Math.min(d1, d + (near ? r * 0.45 : r * 0.9)); out.push(d); } return out; };
  // ---- the sleeve: a shell from over the shoulder to its hem
  const K = 1 + S.k, shellK = d => K + (S.pad ? S.pad * (1 - smooth(d / (D.Lu * 0.45))) : 0) + (S.flare ? S.flare * smooth((d - D.Lu * 0.6) / (S.hem - D.Lu * 0.6)) : 0);
  {
    const R0 = r * shellK(0);
    // the ball: the shell's rounded end, a ball of its own radius about the arm's axis, its centre dropped just enough (capDrop) for
    // its top to sit on the torso's shoulder line (a ball stood up off it read as a puff), rigid with the upper arm: it turns in the
    // torso like a ball in its socket and keeps its round whatever the arm does. Its normals are turned to the torso's where it meets
    // the torso at rest (below), so the ink sees one surface there
    const t0 = torsoTop ? torsoTop(0, 0) : -Infinity, capDrop = t0 > -1e9 ? clamp(R0 - (t0 + 0.004), 0, R0 * 0.6) : 0;
    const top = point(0, R0 - capDrop, 0, cSleeve), caps = [];
    for (let k = 1; k <= 5; k++) { const al = (k / 5) * (Math.PI / 2); caps.push(ring(0, 1, 1, cSleeve, R0 * Math.cos(al) - capDrop, R0 * Math.sin(al))); }
    fan(caps[0], top, false);
    for (let k = 1; k < caps.length; k++) strip(caps[k - 1], caps[k]);
    let last = caps[caps.length - 1];
    layer = 'shell';
    const cuff0 = S.cuff ? S.hem - S.cuff : Infinity;
    shellD = stations(Math.max(r * 0.3, capDrop + r * 0.12), Math.min(S.hem, cuff0));
    for (const d of shellD) { const k = shellK(d), a = ring(d, k, k, cSleeve); strip(last, a); last = a; }
    if (S.cuff) { // (a hard colour edge at the cuff, the cuff a touch proud of the sleeve)
      const k = shellK(cuff0) * 1.03, a = ring(cuff0 + 0.001, k, k, cCuff); strip(last, a); last = a; shellD.push(cuff0 + 0.001);
      for (const d of stations(cuff0 + 0.001, S.hem).slice(1)) { const kk = shellK(d) * 1.03, b = ring(d, kk, kk, cCuff); strip(last, b); last = b; shellD.push(d); }
    }
    layer = null;
    // the hem: turned in to the arm under it (no gap to see up into), or closed (a long sleeve: the hand comes out of its middle)
    const hr = []; radiusAt(S.hem, D, hr);
    if (S.closed) { const lip = ring(S.hem + 0.001, 0.55, 0.55, S.cuff ? cCuff : cSleeve); strip(last, lip); fan(lip, point(0, -S.hem - 0.004, 0, S.cuff ? cCuff : cSleeve), true); }
    else { const lip = ring(S.hem + 0.0015, 1.0, 1.0, cSleeve); strip(last, lip); hemFix = [last, lip, rings.filter(q => q.layer === 'shell').slice(-2)[0]?.i ?? last]; }
    shellTop = { first: top, last: last + n }; // (every shell vertex but the hem's: those near the torso take its normal)
  }
  // ---- the bare arm (or the shirt's cuff under a jacket): from just inside the hem to the wrist, closed inside the hand's heel
  if (!S.closed) {
    const c = S.shirtCuff ? cShirt : cSkin, d0 = S.hem - Math.min(0.035, r * 0.6);
    let last = null;
    layer = 'skin';
    // inside the sleeve the bare arm's rings sit at the same heights as the sleeve's, so each pair bends by the same weights and the
    // arm stays inside the shell. Otherwise an elbow's bend pokes the arm out through the sleeve just over the hem.
    const inner = shellD.filter(d => d >= d0 && d < S.hem - 1e-4), ds = (inner.length ? inner : [d0]).concat(stations(S.hem, L));
    for (const d of ds) { const a = ring(d, 1, 1, c); if (last !== null) strip(last, a); last = a; }
    layer = null;
    const end = ring(L + 0.012, 0.75, 0.75, c); strip(last, end);
    fan(end, point(0, -(L + 0.026), 0, c), true);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the hem's ring and the lip turned in under it shade as the sleeve just above them, or the lip's downward faces pull the hem's
  // normals into a dark band that reads as a line. The hem is a clean change of colour, cloth to skin.
  if (hemFix) { const N = g.attributes.normal, [hr, lr, ar] = hemFix; for (let k = 0; k < n; k++) for (const v of [hr + k, lr + k]) N.setXYZ(v, N.getX(ar + k), N.getY(ar + k), N.getZ(ar + k)); }
  // (the shoulder: where the cap meets the torso, its normals turn to the torso's own there, so sleeve and shirt shade and ink as one)
  if (torsoNormal && shellTop) {
    const N = g.attributes.normal, P = g.attributes.position, tn = [0, 0, 0, 0];
    for (let v = shellTop.first; v < shellTop.last; v++) {
      if (P.getY(v) < -D.Lu * 0.3 || !torsoNormal(P.getX(v), P.getY(v), P.getZ(v), tn)) continue; // (round the shoulder only)
      const facing = N.getX(v) * tn[1] + N.getY(v) * tn[2] + N.getZ(v) * tn[3];
      if (facing < 0.05) continue; // (an arm's inner side faces the body: no blend with what faces it)
      const k = (1 - smooth(tn[0] / 0.024)) * smooth(facing / 0.4);
      const nx = N.getX(v) + (tn[1] - N.getX(v)) * k, ny = N.getY(v) + (tn[2] - N.getY(v)) * k, nz = N.getZ(v) + (tn[3] - N.getZ(v)) * k;
      const l = Math.hypot(nx, ny, nz) || 1; N.setXYZ(v, nx / l, ny / l, nz / l);
    }
  }
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -L * 0.45, 0), L * 1.25 + 0.2); // (any pose: the arm turns about the shoulder)
  const mesh = new THREE.SkinnedMesh(g, toon('#ffffff', { vertexColors: true }));
  mesh.name = 'arm';
  mesh.userData.armSkin = true; mesh.userData.rings = rings;
  mesh.bind(new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4())), new THREE.Matrix4());
  mesh.castShadow = true;
  return { mesh, sleeve: S };
}

// Each frame, after the arm is posed: C on the shoulder joint, E1-E3 turned back by 3/4, 1/2 and 1/4 of the elbow's turn about the joint.
// No allocation.
const _q = new THREE.Quaternion(), _qf = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _I = new THREE.Quaternion(), _t = new THREE.Matrix4();
export function poseArmBones(arm, Lu) {
  const B = arm.bones;
  if (!B) return;
  if (B.C) B.C.position.copy(arm.shoulder.position);
  _q.copy(arm.elbow.quaternion); _qi.copy(_q).invert();
  _t.makeTranslation(0, Lu, 0);
  for (let k = 0; k < 3; k++) {
    const e = B.E[k], f = (k + 1) / 4;
    _qf.copy(_I).slerp(_q, f).premultiply(_qi); // (back from the elbow's turn to f of it)
    e.matrix.makeRotationFromQuaternion(_qf).multiply(_t);
    e.matrixWorldNeedsUpdate = true;
  }
}

// The arm's bones on a person's shoulder, elbow and chest (human.js makeArm)
export function makeArmBones(chest, shoulder, elbow, Lu) {
  const C = new THREE.Object3D(); C.name = 'arm-C'; C.position.copy(shoulder.position); chest.add(C);
  const U = new THREE.Object3D(); U.name = 'arm-U'; shoulder.add(U);
  const E = [1, 2, 3].map(k => { const e = new THREE.Object3D(); e.name = 'arm-E' + k; e.matrixAutoUpdate = false; e.matrix.makeTranslation(0, Lu, 0); elbow.add(e); return e; });
  const F = new THREE.Object3D(); F.name = 'arm-F'; F.position.set(0, Lu, 0); elbow.add(F);
  const list = [C, U, ...E, F];
  for (const b of list) b.userData.armBone = b.name;
  return { C, U, E, F, list };
}

// A copy of a shoulder group (the intro's arm): its arm meshes take the copy's own bones (the chest's C is the copy itself). Returns the
// copy's U bone (the intro stretches it).
export function rebindArmCopy(copy) {
  const by = {};
  copy.traverse(o => { if (o.userData.armBone) by[o.userData.armBone] = o; });
  const U = by['arm-U'] || copy, E = ['arm-E1', 'arm-E2', 'arm-E3'].map(n => by[n] || U);
  copy.traverse(o => {
    if (!o.isSkinnedMesh || !o.userData.armSkin) return;
    const bones = [copy, U, ...E, by['arm-F'] || U];
    o.bind(new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4())), new THREE.Matrix4());
  });
  return { U, E };
}
