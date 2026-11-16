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
  ['eyeSize', 'Eye size', -0.4, 0.6, 'Eyes, nose, mouth'], ['eyeSpace', 'Eye spacing', -0.5, 0.5, 'Eyes, nose, mouth'], ['eyeHeight', 'Eye height', -0.5, 0.5, 'Eyes, nose, mouth'],
  ['eyeTilt', 'Eye tilt', -0.5, 0.5, 'Eyes, nose, mouth'], ['nose', 'Nose', -0.5, 1.0, 'Eyes, nose, mouth'], ['mouthSize', 'Mouth size', -0.4, 0.5, 'Eyes, nose, mouth'], ['mouthHeight', 'Mouth height', -0.5, 0.5, 'Eyes, nose, mouth'],
  ['bust', 'Bust', -0.6, 0.8, 'Body'], ['skirt', 'Skirt length (short - long)', -0.6, 0.6, 'Body'], ['waist', 'Waist', -0.5, 0.5, 'Body'], ['hips', 'Hips', -0.5, 0.5, 'Body'],
  ['shoulders', 'Shoulders', -0.4, 0.4, 'Body'], ['legs', 'Leg thickness', -0.4, 0.4, 'Body'],
];
export const FACE_SHAPES = {   // presets for the face sliders (the eyes, nose and mouth keep theirs)
  Round: { faceW: 0.1, jaw: 0.25, chin: -0.35, chinLen: -0.15, cheek: 0.3 }, Oval: { faceW: -0.08, jaw: -0.15, chin: 0.05, chinLen: 0.2, cheek: 0 },
  Heart: { faceW: 0.06, jaw: -0.42, chin: 0.4, chinLen: 0.1, cheek: 0.25 }, Square: { faceW: 0.05, jaw: 0.45, chin: -0.4, chinLen: -0.1, cheek: 0 },
  Long: { faceW: -0.15, jaw: -0.1, chin: 0.1, chinLen: 0.45, cheek: -0.1 }, Soft: { faceW: 0.05, jaw: 0.05, chin: -0.25, chinLen: 0, cheek: 0.4 },
};
export const FACE_IDS = { belinda: 'belinda', mina: 'mina', zoe: 'zoe_day', asha: 'asha_day' };   // whose painted face (eyes, brows, blush) a look wears
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
    if (best && Math.abs(best[0]) < 0.07) {   // (a flat chest: no clear fullest point, so where one would be, on the chest's front)
      const bx = s * 0.085, by = shY - 0.13; let bz = -9;
      for (let i = 0; i < n; i++) if (Math.abs(pos[i * 3] - bx) < 0.02 && Math.abs(pos[i * 3 + 1] - by) < 0.02 && wHead[i] < 0.1) bz = Math.max(bz, pos[i * 3 + 2]);
      if (bz > -9) best = [bx, by, bz];
    }
    return best; });
  const pel = W.pelvis || [0, 0.75, 0], th = W.thigh_l || [0.1, 0.7, 0];
  return { wHead, eye, chin, top, piv: [0, chin - 0.02, 0.01], bust, hipY: (pel[1] + th[1]) / 2, waistY: pel[1] + (shY - pel[1]) * 0.42, shY, legTop: th[1] - 0.05,
    faceZ: (() => { let m = -9; for (let i = 0; i < n; i++) if (wHead[i] > 0.9 && Math.abs(pos[i * 3]) < 0.04 && pos[i * 3 + 1] > chin && pos[i * 3 + 1] < eye) m = Math.max(m, pos[i * 3 + 2]); return m; })() };
}

/** where the painted eyes are: the centres of the iris tile's two irises (tile-local 0..1, v up); once per sheet */
export async function prepFace(data) {
  if (data.__eyeC) return data.__eyeC;
  const J = data.J, img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = '/models/mpfb/' + J.sheet.full; }).catch(() => null);
  if (!img) return null;
  const T = img.width / J.face.grid, ti = J.face.iris, x0 = (ti % J.face.grid) * T, y0 = Math.floor(ti / J.face.grid) * T;
  const c = document.createElement('canvas'); c.width = T; c.height = T; const g = c.getContext('2d'); g.drawImage(img, x0, y0, T, T, 0, 0, T, T);
  const d = g.getImageData(0, 0, T, T).data, acc = [[0, 0, 0], [0, 0, 0]];
  for (let y = 0; y < T; y += 2) for (let x = 0; x < T; x += 2) if (d[(y * T + x) * 4 + 3] > 128) { const s = x < T / 2 ? 0 : 1; acc[s][0] += x; acc[s][1] += y; acc[s][2]++; }
  data.__eyeC = acc.map(a => (a[2] ? [a[0] / a[2] / T, 1 - a[1] / a[2] / T] : null));
  return data.__eyeC;
}
function deformFace(data, look, g) {
  const A = g.attributes.aFaceUv; if (!A) return;
  if (!g.userData.origF) g.userData.origF = A.array.slice();
  const o = g.userData.origF, f = A.array; f.set(o);
  const L = look?.shape || {}, v = k => L[k] || 0, E = data.__eyeC;
  if (E && E[0] && E[1] && (v('eyeSize') || v('eyeSpace') || v('eyeHeight') || v('eyeTilt'))) {
    const s = 1 + v('eyeSize'), R = 0.17;
    for (let i = 0; i < f.length / 2; i++) {
      let u = o[i * 2], w = o[i * 2 + 1]; if (!(u > 0.0005)) continue;
      for (let e = 0; e < 2; e++) {
        const c = E[e], side = e === 0 ? -1 : 1;
        const cx = c[0] + side * v('eyeSpace') * 0.06, cy = c[1] + v('eyeHeight') * 0.06;           // where the eye goes
        const du = u - cx, dv = w - cy, d = Math.hypot(du, dv), k = Math.max(0, 1 - d / R); if (!k) continue;
        const kk = k * k * (3 - 2 * k), a = -side * v('eyeTilt') * 0.5 * kk, ca = Math.cos(a), sa = Math.sin(a);
        const ru = (du * ca - dv * sa) / (1 + (s - 1) * kk), rv = (du * sa + dv * ca) / (1 + (s - 1) * kk);  // (sample back toward the painted eye)
        u = u + ((c[0] + ru) - u) * kk; w = w + ((c[1] + rv) - w) * kk;
      }
      f[i * 2] = u; f[i * 2 + 1] = w;
    }
  }
  A.needsUpdate = true;
}
function deform(data, look, geo) {
  const g = geo[''], A = g.attributes.position;
  deformFace(data, look, g);
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
      // the bust, with gravity: the volume goes in mostly below the fullest point (the lower part drops and rounds out, the upper
      // part rises from the chest in a gentle slope), a little outward, nothing behind the chest's front
      if (v('bust')) for (const c of R.bust) if (c) {
        const dx = x - c[0], dy = y - c[1], front = sm(-0.09, -0.04, z - c[2]);
        const g = Math.exp(-(dx * dx) / (2 * 0.068 * 0.068) - (dy * dy) / (2 * (dy > 0 ? 0.085 : 0.058) ** 2)) * front * bodyK;
        if (g < 1e-3) continue;
        const A = v('bust') * 0.085, lower = sm(0.03, -0.035, dy), upperSlope = dy > 0 ? 0.5 + 0.5 * Math.exp(-(dy * dy) / (2 * 0.03 * 0.03)) : 1;
        z += A * g * upperSlope * (0.85 + 0.25 * lower);
        y -= A * g * (0.15 + 0.55 * lower) * (A > 0 ? 1 : 0.4);
        x += Math.sign(dx) * A * 0.22 * g * (0.5 + 0.5 * lower);
      }
      if (v('waist')) { const f = gauss((y - R.waistY) / 0.08, 1) * bodyK; x *= 1 + v('waist') * 0.25 * f; z *= 1 + v('waist') * 0.12 * f; }
      if (v('hips')) { const f = gauss((y - R.hipY) / 0.11, 1) * bodyK; x *= 1 + v('hips') * 0.3 * f; z *= 1 + v('hips') * 0.12 * f; }
      if (v('shoulders')) { const f = gauss((y - R.shY) / 0.07, 1) * bodyK; x *= 1 + v('shoulders') * 0.25 * f; }
      if (v('legs') && y < R.legTop) { const cx = x > 0 ? 0.1 : -0.1, f = sm(0.0, 0.15, R.legTop - y) * bodyK; x = cx + (x - cx) * (1 + v('legs') * 0.35 * f); z *= 1 + v('legs') * 0.3 * f; }
    }
    p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
  }
  // the skirt's length: below its waistband the skirt stretches or shortens toward the waist (the legs are modelled under it)
  if (v('skirt')) {
    if (R.skirt === undefined) {
      const J = data.J, uv = g.attributes.uv.array, id = J.id, pal = Object.fromEntries(Object.entries(J.palette || {}).map(([k2, c]) => [c, +k2]));
      const sk = ({ belinda: '#1f6b3a', mina: '#5d5c5e' })[J.cid];
      const rect = id.endsWith('_orig') ? null : /_day$/.test(id) ? [512, 1024] : /_night$/.test(id) ? [1024, 1536] : null;
      const kk = sk !== undefined ? pal[sk] : undefined, ids = [];
      for (let i = 0; i < n; i++) { const px = uv[i * 2] * 2048, py = (1 - uv[i * 2 + 1]) * 2048;
        const inPal = kk !== undefined && px >= 1536 + (kk % 16) * 32 && px < 1568 + (kk % 16) * 32 && py >= 1536 + Math.floor(kk / 16) * 32 && py < 1568 + Math.floor(kk / 16) * 32;
        const inRect = rect && py >= 1536 && px >= rect[0] && px < rect[1];
        const apron = /^asha_day/.test(id) && !id.endsWith('_orig') && pal['#c7392f'] !== undefined && px >= 1536 + (pal['#c7392f'] % 16) * 32 && px < 1568 + (pal['#c7392f'] % 16) * 32 && py >= 1536 + Math.floor(pal['#c7392f'] / 16) * 32 && py < 1568 + Math.floor(pal['#c7392f'] / 16) * 32;
        if (inPal || inRect || apron) ids.push(i); }
      let top = -9; for (const i of ids) top = Math.max(top, o[i * 3 + 1]);
      R.skirt = ids.length ? { ids, top: Math.min(top, R.waistY + 0.02) } : null;
    }
    if (R.skirt) { const k = 1 + v('skirt') * 0.9, T = R.skirt.top;
      for (const i of R.skirt.ids) { const y = p[i * 3 + 1]; if (y < T) p[i * 3 + 1] = T - (T - y) * k; } }
  }
  // the mouth (its own piece): size and height; the nose: how far it stands out
  const mi = geo['_mouth']?.index?.array;
  if (mi && (v('mouthSize') || v('mouthHeight'))) {
    const set = R.mouthSet || (R.mouthSet = [...new Set(mi)]);
    let cx = 0, cy = 0; for (const i of set) { cx += o[i * 3]; cy += o[i * 3 + 1]; } cx /= set.length; cy /= set.length;
    const k = 1 + v('mouthSize') * 0.6, dy = v('mouthHeight') * 0.03;
    for (const i of set) { p[i * 3] = cx + (p[i * 3] - cx) * k; p[i * 3 + 1] = cy + (p[i * 3 + 1] - cy) * k + dy; }
  }
  if (v('nose')) {
    if (!R.nose) { let best = -1; for (let i = 0; i < n; i++) if (R.wHead[i] > 0.9 && Math.abs(o[i * 3]) < 0.02 && o[i * 3 + 1] < R.eye - 0.02 && o[i * 3 + 1] > R.chin + 0.06 && (best < 0 || o[i * 3 + 2] > o[best * 3 + 2])) best = i; R.nose = best >= 0 ? [o[best * 3], o[best * 3 + 1], o[best * 3 + 2]] : null; }
    if (R.nose) for (let i = 0; i < n; i++) { if (R.wHead[i] < 0.5) continue; const d = Math.hypot(o[i * 3] - R.nose[0], (o[i * 3 + 1] - R.nose[1]) * 0.8, o[i * 3 + 2] - R.nose[2]); if (d < 0.05) p[i * 3 + 2] += v('nose') * 0.012 * Math.exp(-(d * d) / (2 * 0.016 * 0.016)); }
  }
  A.needsUpdate = true;
}
export function applyLook(data, look) { deform(data, look, data.geo); deform(data, look, data.lod); }

/** repaint the palette swatches the look names: { index: '#rrggbb' } on a copy of the sheet; calls back with the new texture */
const IMG = {};
const loadImg = src => IMG[src] || (IMG[src] = new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }));
export function paintLook(mat, data, look, THREE) {
  const cols = look?.colors || {}; const map = mat.userData.origMap || (mat.userData.origMap = mat.map);
  const faceFrom = look?.face && FACE_IDS[look.face] && FACE_IDS[look.face] !== data.J.cid && FACE_IDS[look.face] !== data.J.id.replace(/_orig$/, '') ? FACE_IDS[look.face] : null;
  if (!Object.keys(cols).length && !faceFrom) { if (mat.map !== map) { mat.map = map; mat.needsUpdate = true; } return; }
  const go = async () => {
    const img = map.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); const k = img.width / 2048;
    if (faceFrom) {   // another of the four's painted face: her face tiles (the expressions, the iris, the masks) over this sheet's
      const other = await loadImg('/models/mpfb/' + faceFrom + '.webp');
      if (other) { const T = 512 * k, ok = other.width / 2048; for (let i = 0; i < 8; i++) { const x = (i % 4) * 512, y = Math.floor(i / 4) * 512; g.clearRect(x * k, y * k, T, T); g.drawImage(other, x * ok, y * ok, 512 * ok, 512 * ok, x * k, y * k, T, T); } }
    }
    for (const [i, col] of Object.entries(cols)) { const n = +i, x = (1536 + (n % 16) * 32) * k, y = (1536 + Math.floor(n / 16) * 32) * k; g.fillStyle = col; g.fillRect(x, y, 32 * k, 32 * k); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = map.colorSpace; t.flipY = map.flipY; t.wrapS = map.wrapS; t.wrapT = map.wrapT; t.anisotropy = map.anisotropy;
    mat.map = t; mat.needsUpdate = true;
  };
  if (map.image && map.image.width) go(); else { const t0 = setInterval(() => { if (map.image && map.image.width) { clearInterval(t0); go(); } }, 100); }
}

/** Cloth-like motion for a skirt (Andrew: Belinda's skirt should behave like real cloth). On top of the baked clip: the hem trails
 * the body's movement on a damped spring (it lags when she sets off, swings past when she stops, sways with her hips) and soft waves
 * run round it. skirtColor: the palette colour of the skirt; the band from `top` (y) to the hem moves, more toward the hem.
 * Returns { step(dt) } (called after the character's own update each frame). */
export function addCloth(ch, data, THREE, { skirtColor, top = 0.62 } = {}) {
  const J = data.J, idx = Object.entries(J.palette || {}).find(([, c]) => c === skirtColor)?.[0];
  if (idx === undefined) return null;
  const k = +idx, sx = 1536 + (k % 16) * 32, sy = 1536 + Math.floor(k / 16) * 32;
  const mark = g => {
    if (!g || g.attributes.aSkirt) return;
    const uv = g.attributes.uv.array, p = g.attributes.position.array, n = uv.length / 2, a = new Float32Array(n);
    let hem = 9; for (let i = 0; i < n; i++) { const x = uv[i * 2] * 2048, y = (1 - uv[i * 2 + 1]) * 2048; if (x >= sx && x < sx + 32 && y >= sy && y < sy + 32) hem = Math.min(hem, p[i * 3 + 1]); }
    for (let i = 0; i < n; i++) { const x = uv[i * 2] * 2048, y = (1 - uv[i * 2 + 1]) * 2048;
      if (x >= sx && x < sx + 32 && y >= sy && y < sy + 32) a[i] = Math.max(0, Math.min(1, (top - p[i * 3 + 1]) / (top - hem))); }
    g.setAttribute('aSkirt', new THREE.BufferAttribute(a, 1));
  };
  mark(data.geo['']); mark(data.lod['']);
  const U = { uSkirt: { value: new THREE.Vector3() }, uSkirtW: { value: 0 }, uSkirtT: { value: 0 }, uSkirtR: { value: 0 } };
  const patch = m => {
    if (!m || m.userData.cloth) return; m.userData.cloth = true;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r); Object.assign(sh.uniforms, U);
      sh.vertexShader = 'attribute float aSkirt; uniform vec3 uSkirt; uniform float uSkirtW, uSkirtT, uSkirtR;\n' + sh.vertexShader.replace('#include <skinning_vertex>',
        `{ float s = aSkirt * aSkirt; vec2 rd = normalize(position.xz - vec2(0.0, 0.02) + 1e-5); float an = atan(rd.y, rd.x);
           transformed += uSkirt * s;
           transformed.xz += vec2(-rd.y, rd.x) * s * uSkirtR;   // (the swish: the hem lags her hips' turn)
           transformed.xz += rd * s * uSkirtW * (0.5 + 0.5 * sin(an * 3.0 - uSkirtT * 4.0)) * 0.6;
           transformed.y += s * uSkirtW * 0.25 * sin(an * 5.0 + uSkirtT * 3.0); }
        #include <skinning_vertex>`);
    };
    m.customProgramCacheKey = () => 'cloth-skirt'; m.needsUpdate = true;
  };
  patch(ch.mat); patch(ch.matBoth);
  for (const h of Object.values(ch.hulls || {})) { h.material = h.material.clone(); patch(h.material); }
  // the spring: the hem's lag behind the pelvis's own movement (in her local frame), and how much it ripples
  const pel = ch.byName?.get('pelvis'), prev = new THREE.Vector3(), cur = new THREE.Vector3(), vel = new THREE.Vector3(), lag = new THREE.Vector3(), lagV = new THREE.Vector3();
  const inv = new THREE.Matrix4(), pq = new THREE.Quaternion(); let first = true, t = 0, energy = 0, pyaw = null, rot = 0, rotV = 0;
  return {
    U,
    step(dt, fwd = 0) {
      if (!pel || !dt) return; t += dt;
      pel.getWorldPosition(cur); ch.root.updateMatrixWorld(); inv.copy(ch.root.matrixWorld).invert(); cur.applyMatrix4(inv);
      // (the root's own travel: its world move into her frame)
      const rp = ch.root.getWorldPosition(new THREE.Vector3()); ch.__rp = ch.__rp || rp.clone();
      const rootMove = rp.clone().sub(ch.__rp); ch.__rp.copy(rp);
      const q = ch.root.getWorldQuaternion(new THREE.Quaternion()).invert(); rootMove.applyQuaternion(q);
      if (first) { prev.copy(cur); first = false; }
      vel.copy(cur).sub(prev).add(rootMove).divideScalar(dt); prev.copy(cur);
      if (vel.length() > 4) vel.set(0, 0, 0);   // (a clip looping back, a teleport: not motion)
      vel.z += fwd;   // (walking on the spot, as in the editor: her own speed)
      pel.getWorldQuaternion(pq); const yaw = Math.atan2(2 * (pq.w * pq.y + pq.x * pq.z), 1 - 2 * (pq.y * pq.y + pq.x * pq.x)); let dy = yaw - (pyaw ?? yaw); dy = Math.atan2(Math.sin(dy), Math.cos(dy)); pyaw = yaw;
      rotV += (Math.max(-0.12, Math.min(0.12, -dy / dt * 0.05)) - rot) * 70 * dt; rotV *= Math.exp(-6 * dt); rot += rotV * dt;
      const target = vel.clone().multiplyScalar(-0.07); target.y *= 0.3; target.clampLength(0, 0.09);
      lagV.add(target.sub(lag).multiplyScalar(60 * dt)).multiplyScalar(Math.exp(-5.5 * dt)); lag.addScaledVector(lagV, dt);
      energy += (Math.min(1, vel.length() * 0.8) - energy) * Math.min(1, dt * 2);
      U.uSkirt.value.copy(lag); U.uSkirtW.value = 0.006 + 0.016 * energy; U.uSkirtT.value = t; U.uSkirtR.value = rot;
    },
  };
}

/** Bust jiggle (Andrew): the bust follows the chest on a soft, under-damped spring (lags, bounces, settles) as she walks, turns or
 * dances. How much is tied to the bust's size: her natural size (how far it stands off her breastbone) plus the Bust slider.
 * Returns { step(dt, fwd), setSize(look) } (step after the character's own update). */
export function addJiggle(ch, data, THREE, look) {
  const g0 = data.geo[''], o = g0.userData.orig || g0.attributes.position.array;
  const R = g0.userData.measure || (g0.userData.measure = measure(data, o, g0.attributes.skinIndex.array, g0.attributes.skinWeight.array));
  const cs = R.bust.filter(Boolean); if (!cs.length) return null;
  // natural size: the fullest point's distance in front of the breastbone at that height
  let sternum = -9; const by = cs[0][1];
  for (let i = 0; i < o.length / 3; i++) if (Math.abs(o[i * 3]) < 0.015 && Math.abs(o[i * 3 + 1] - by) < 0.02 && R.wHead[i] < 0.1) sternum = Math.max(sternum, o[i * 3 + 2]);
  const natural = Math.max(0, Math.min(1, (cs[0][2] - sternum) / 0.06));
  const mark = g => {
    if (!g || g.attributes.aBust) return;
    const p = g.userData.orig || g.attributes.position.array, n = p.length / 3, a = new Float32Array(n);
    for (let i = 0; i < n; i++) { let w = 0; const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      for (const c of cs) { const dx = x - c[0], dy = y - c[1]; if (z < c[2] - 0.08) continue; w = Math.max(w, Math.exp(-(dx * dx) / (2 * 0.06 * 0.06) - (dy * dy) / (2 * 0.065 * 0.065)) * Math.min(1, (z - (c[2] - 0.08)) / 0.06)); }
      a[i] = w < 0.02 ? 0 : w; }
    g.setAttribute('aBust', new THREE.BufferAttribute(a, 1));
  };
  mark(data.geo['']); mark(data.lod['']);
  const U = { uJig: { value: new THREE.Vector3() } };
  const patch = m => {
    if (!m || m.userData.jig) return; m.userData.jig = true;
    const prev = m.onBeforeCompile, key = m.customProgramCacheKey?.bind(m);
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r); Object.assign(sh.uniforms, U);
      sh.vertexShader = 'attribute float aBust; uniform vec3 uJig;\n' + sh.vertexShader.replace('#include <skinning_vertex>', 'transformed += uJig * aBust;\n#include <skinning_vertex>');
    };
    m.customProgramCacheKey = () => 'jig-' + (key ? key() : ''); m.needsUpdate = true;
  };
  patch(ch.mat); patch(ch.matBoth);
  for (const h of Object.values(ch.hulls || {})) { if (!h.material.userData.cloth) h.material = h.material.clone(); patch(h.material); }
  const sp = ch.byName?.get('spine_03') || ch.byName?.get('spine_02'); if (!sp) return null;
  const cur = new THREE.Vector3(), prev = new THREE.Vector3(), vel = new THREE.Vector3(), pvel = new THREE.Vector3(), off = new THREE.Vector3(), offV = new THREE.Vector3(), inv = new THREE.Matrix4();
  let first = true, amp = 0;
  const api = {
    U, natural,
    setSize(lk) { const s = 0.35 + natural * 0.65 + (lk?.shape?.bust || 0); amp = Math.max(0, Math.min(1.8, s)); },
    step(dt, fwd = 0) {
      if (!dt) return;
      sp.getWorldPosition(cur); ch.root.updateMatrixWorld(); inv.copy(ch.root.matrixWorld).invert(); cur.applyMatrix4(inv);
      if (first) { prev.copy(cur); first = false; }
      vel.copy(cur).sub(prev).divideScalar(dt); prev.copy(cur); if (vel.length() > 4) vel.set(0, 0, 0);
      vel.z += fwd;
      // the chest's acceleration pushes the bust the other way; a soft spring (about 4 Hz) with light damping brings it back
      const acc = vel.clone().sub(pvel).divideScalar(dt); pvel.copy(vel); acc.clampLength(0, 40);
      const K = 600, D = 9;
      offV.addScaledVector(acc, -0.05 * amp).addScaledVector(off, -K * dt).multiplyScalar(Math.exp(-D * dt));
      off.addScaledVector(offV, dt); off.clampLength(0, 0.02 * amp + 1e-4);
      U.uJig.value.set(off.x * 0.4, off.y, off.z * 0.6);
    },
  };
  api.setSize(look); return api;
}
