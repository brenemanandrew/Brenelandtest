// world-refresh: Andrew's own edits on the strip mall's four (Belinda, Mina, Zoe, Asha), made in staff-editor.html and used by the
// test game. A "look" per character and outfit: shape sliders (the face and the body, applied to the baked mesh's rest positions,
// before the skeleton binds it, so every clip plays on the new shape), the outfit (Zoe's and Asha's: the new uniforms or the
// originals) and colours (any of the sheet's palette swatches repainted).
//   const LOOKS = loadLooks()                       // localStorage 'staffLooks' over /models/staff-looks.json
//   applyLook(data, look)                           // data: from loadBakedCharacter (geometry changed in place; resets first)
//   paintLook(material, data, look)                 // the palette colours, on a copy of the sheet
export const SLIDERS = [
  // key, label, min, max, group
  ['head', 'Head size', -0.4, 0.4, 'Face'], ['faceW', 'Face width', -0.3, 0.3, 'Face'], ['jaw', 'Jaw (narrow - wide)', -0.5, 0.5, 'Face'],
  ['chin', 'Chin (soft - pointed)', -0.5, 0.5, 'Face'], ['chinLen', 'Chin length', -0.5, 0.5, 'Face'], ['cheek', 'Cheeks', -0.5, 0.5, 'Face'],
  ['bust', 'Bust', -0.6, 0.8, 'Body'], ['waist', 'Waist', -0.5, 0.5, 'Body'], ['hips', 'Hips', -0.5, 0.5, 'Body'],
  ['shoulders', 'Shoulders', -0.4, 0.4, 'Body'], ['legs', 'Leg thickness', -0.4, 0.4, 'Body'],
];
export const STAFF = { belinda: ['day'], mina: ['day'], zoe: ['day', 'night'], asha: ['day', 'night'] };
export const MODEL_ID = (who, when, variant) => ({ belinda: 'belinda', mina: 'mina' }[who] || `${who}_${when}`) + (variant === 'original' && (who === 'zoe' || who === 'asha') ? '_orig' : '');

export async function loadLooks() {
  let base = {};
  try { const r = await fetch('/models/staff-looks.json'); if (r.ok) base = await r.json(); } catch (e) { /* none yet */ }
  let mine = {};
  try { mine = JSON.parse(localStorage.getItem('staffLooks') || '{}'); } catch (e) { mine = {}; }
  const out = JSON.parse(JSON.stringify(base));
  for (const [who, o] of Object.entries(mine)) { out[who] = out[who] || {}; for (const [when, l] of Object.entries(o)) out[who][when] = l; }
  return out;
}
export const saveLooksLocal = looks => localStorage.setItem('staffLooks', JSON.stringify(looks));

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (x, s) => Math.exp(-(x * x) / (2 * s * s));

function boneWorld(J) {
  const out = [], q = (b) => b.quat;
  const rot = (qq, v) => { const [x, y, z, w] = qq, [vx, vy, vz] = v; const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]; };
  const mul = (a, b) => { const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b; return [ax * bw + aw * bx + ay * bz - az * by, ay * bw + aw * by + az * bx - ax * bz, az * bw + aw * bz + ax * by - ay * bx, aw * bw - ax * bx - ay * by - az * bz]; };
  J.bones.forEach((b, i) => {
    if (b.parent < 0) out[i] = { p: b.pos.slice(), q: q(b).slice() };
    else { const P = out[b.parent], r = rot(P.q, b.pos); out[i] = { p: [P.p[0] + r[0], P.p[1] + r[1], P.p[2] + r[2]], q: mul(P.q, q(b)) }; }
  });
  return Object.fromEntries(J.bones.map((b, i) => [b.name, out[i].p]));
}

/** the regions, measured once per character from its rest mesh and rig */
function measure(data, pos, si, sw) {
  const J = data.J, n = pos.length / 3, names = J.bones.map(b => b.name), W = boneWorld(J);
  const desc = new Set([names.indexOf('head')]); let ch = true;
  while (ch) { ch = false; J.bones.forEach((b, i) => { if (desc.has(b.parent) && !desc.has(i)) { desc.add(i); ch = true; } }); }
  const wHead = new Float32Array(n), wChest = new Float32Array(n);
  const chestB = new Set(['spine_03', 'spine_02', 'clavicle_l', 'clavicle_r'].map(x => names.indexOf(x)));
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { const b = si[i * 4 + k], w = sw[i * 4 + k] / 255; if (desc.has(b)) wHead[i] += w; if (chestB.has(b)) wChest[i] += w; }
  const h = J.head, eye = h.eye, chin = h.chin, top = h.top;
  // the bust: per side, the most forward point of the chest
  const spine3 = W.spine_03 || [0, 1, 0], shY = (W.clavicle_l || spine3)[1];
  const bust = [-1, 1].map(s => { let best = null;
    for (let i = 0; i < n; i++) { const x = pos[i * 3] * s, y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (x > 0.03 && x < 0.16 && y < shY && y > shY - 0.3 && wChest[i] > 0.3 && wHead[i] < 0.1 && (!best || z > best[2])) best = [pos[i * 3], y, z]; }
    return best; });
  const pel = W.pelvis || [0, 0.75, 0], th = W.thigh_l || [0.1, 0.7, 0];
  return { wHead, eye, chin, top, piv: [0, chin - 0.02, 0.01], bust, hipY: (pel[1] + th[1]) / 2, waistY: pel[1] + (shY - pel[1]) * 0.42, shY, legTop: th[1] - 0.05,
    faceZ: (() => { let m = -9; for (let i = 0; i < n; i++) if (wHead[i] > 0.9 && Math.abs(pos[i * 3]) < 0.04 && pos[i * 3 + 1] > chin && pos[i * 3 + 1] < eye) m = Math.max(m, pos[i * 3 + 2]); return m; })() };
}

function deform(data, look, geo) {
  const g = geo[''], A = g.attributes.position;
  if (!g.userData.orig) g.userData.orig = A.array.slice();
  const o = g.userData.orig, p = A.array; p.set(o);
  const L = look?.shape || {};
  if (!Object.values(L).some(v => v)) { A.needsUpdate = true; return; }
  const si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array;
  const R = g.userData.measure || (g.userData.measure = measure(data, o, si, sw));
  const v = k => L[k] || 0, n = o.length / 3;
  for (let i = 0; i < n; i++) {
    let x = o[i * 3], y = o[i * 3 + 1], z = o[i * 3 + 2]; const wh = Math.min(1, R.wHead[i]);
    if (wh > 0.01) {
      const H = R.top - R.chin, front = sm(-0.02, 0.1, z - (R.faceZ - 0.25));
      const below = sm(0, 1, (R.eye - 0.03 - y) / (R.eye - 0.03 - R.chin));           // 0 above the cheekbones, 1 at the chin
      x *= 1 + v('faceW') * 0.35 * wh;
      x *= 1 + v('jaw') * 0.45 * below ** 1.4 * front * wh;
      x += Math.sign(x) * v('cheek') * 0.03 * gauss((y - (R.eye - 0.07)) / H, 0.09) * front * wh;
      const chinM = sm(0.55, 1.0, below) * front * gauss(x / 0.07, 1);
      z += v('chin') * 0.03 * chinM * wh; y -= v('chinLen') * 0.04 * chinM * wh; z += v('chinLen') * 0.01 * chinM * wh;
      if (v('head')) { const k = 1 + v('head') * wh; x = R.piv[0] + (x - R.piv[0]) * k; y = R.piv[1] + (y - R.piv[1]) * k; z = R.piv[2] + (z - R.piv[2]) * k; }
    }
    if (wh < 0.5) {
      const bodyK = 1 - wh * 2;
      if (v('bust')) for (const c of R.bust) if (c) { const dx = x - c[0], dy = y - c[1], dz = z - (c[2] - 0.06), d = Math.hypot(dx, dy, dz), f = gauss(d, 0.075) * sm(-0.04, 0.02, z - (c[2] - 0.09));
        if (f > 1e-3) { const k = v('bust') * 0.55 * f * bodyK; x += dx * k; y += dy * k * 0.6; z += dz * k * 1.3; } }
      if (v('waist')) { const f = gauss((y - R.waistY) / 0.08, 1) * bodyK; x *= 1 + v('waist') * 0.25 * f; z *= 1 + v('waist') * 0.12 * f; }
      if (v('hips')) { const f = gauss((y - R.hipY) / 0.11, 1) * bodyK; x *= 1 + v('hips') * 0.3 * f; z *= 1 + v('hips') * 0.12 * f; }
      if (v('shoulders')) { const f = gauss((y - R.shY) / 0.07, 1) * bodyK; x *= 1 + v('shoulders') * 0.25 * f; }
      if (v('legs') && y < R.legTop) { const cx = x > 0 ? 0.1 : -0.1, f = sm(0.0, 0.15, R.legTop - y) * bodyK; x = cx + (x - cx) * (1 + v('legs') * 0.35 * f); z *= 1 + v('legs') * 0.3 * f; }
    }
    p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
  }
  A.needsUpdate = true;
}
export function applyLook(data, look) { deform(data, look, data.geo); deform(data, look, data.lod); }

/** repaint the palette swatches the look names: { index: '#rrggbb' } on a copy of the sheet; calls back with the new texture */
export function paintLook(mat, data, look, THREE) {
  const cols = look?.colors || {}; const map = mat.userData.origMap || (mat.userData.origMap = mat.map);
  if (!Object.keys(cols).length) { if (mat.map !== map) { mat.map = map; mat.needsUpdate = true; } return; }
  const go = () => {
    const img = map.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); const k = img.width / 2048;
    for (const [i, col] of Object.entries(cols)) { const n = +i, x = (1536 + (n % 16) * 32) * k, y = (1536 + Math.floor(n / 16) * 32) * k; g.fillStyle = col; g.fillRect(x, y, 32 * k, 32 * k); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = map.colorSpace; t.flipY = map.flipY; t.wrapS = map.wrapS; t.wrapT = map.wrapT; t.anisotropy = map.anisotropy;
    mat.map = t; mat.needsUpdate = true;
  };
  if (map.image && map.image.width) go(); else { const t0 = setInterval(() => { if (map.image && map.image.width) { clearInterval(t0); go(); } }, 100); }
}
