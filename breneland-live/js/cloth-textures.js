// Cloth, leather, felt and hair textures for figures that should read as more real up close. Each is a near-white pattern
// multiplied into the toon colour, so the colour holds from across a room and the weave shows up close. Drawn once per kind
// on a small canvas, tiled and shared.
//   dress(human, slots)   slots: { '#a3875a': 'twill', ... } colour -> kind. Materials are cached per colour + kind.
import * as THREE from 'three';

const SIZE = 128;
const texCache = new Map(), matCache = new Map();
// a seeded noise so every load draws the same weave
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// each kind: (g, r) draws on a SIZE x SIZE canvas already filled white; repeat: tiles across a part's UVs. Colour only, no bump.
const KINDS = {
  // a diagonal twill (trench coats, trousers): fine 45-degree ribs
  twill: { repeat: 7, draw(g, r) { blotch(g, r, 24, 18, 0.05); for (let i = -SIZE; i < SIZE * 2; i += 4) { line(g, i, 0, i - SIZE, SIZE, 1.2, 0.14 + r() * 0.05); } speckle(g, r, 900, 0.06); } },
  // wool suiting: a soft mottle and a faint cross-hatch
  wool: { repeat: 8, draw(g, r) { blotch(g, r, 60, 10, 0.12); for (let i = 0; i < SIZE; i += 3) { line(g, i, 0, i, SIZE, 0.7, 0.1); line(g, 0, i, SIZE, i, 0.7, 0.085); } speckle(g, r, 1100, 0.1); } },
  // pinstripe wool (the Rogue's trousers)
  pinstripe: { repeat: 3, draw(g, r) { KINDS.wool.draw(g, r); for (let x = 6; x < SIZE; x += 16) line(g, x, 0, x, SIZE, 1, -0.22); } },
  // tweed: a herringbone of short slanted strokes and flecks
  tweed: { repeat: 8, draw(g, r) { for (let y = 0; y < SIZE; y += 4) for (let x = 0; x < SIZE; x += 8) { const flip = ((x / 8) | 0) % 2; line(g, x, y, x + 8, y + (flip ? 4 : -4), 1.4, 0.16 + r() * 0.08); } speckle(g, r, 800, 0.16, true); } },
  // knit (cardigans, scarves): rows of little Vs
  knit: { repeat: 10, draw(g, r) { for (let y = 0; y < SIZE; y += 8) for (let x = 0; x < SIZE; x += 8) { line(g, x, y, x + 4, y + 7, 2, 0.17); line(g, x + 8, y, x + 4, y + 7, 2, 0.17); } speckle(g, r, 400, 0.04); } },
  // velvet (the Mystic's gown): a deep soft mottle, no weave
  velvet: { repeat: 2, draw(g, r) { blotch(g, r, 46, 22, 0.16); speckle(g, r, 1600, 0.07); } },
  // plain cotton (shirts under coats): barely there
  cotton: { repeat: 8, draw(g, r) { for (let i = 0; i < SIZE; i += 2) { line(g, i, 0, i, SIZE, 0.5, 0.05); line(g, 0, i, SIZE, i, 0.5, 0.05); } speckle(g, r, 400, 0.05); } },
  // silk (ties): faint diagonal sheen bands
  silk: { repeat: 3, draw(g) { for (let i = -SIZE; i < SIZE * 2; i += 22) line(g, i, 0, i - SIZE, SIZE, 7, -0.08); } },
  // felt (hats, caps): a fine fuzz
  felt: { repeat: 4, draw(g, r) { speckle(g, r, 2600, 0.07); blotch(g, r, 30, 8, 0.04); } },
  // leather (shoes, satchels, boots): a crackle of fine creases and mottle
  leather: { repeat: 3, draw(g, r) { blotch(g, r, 50, 14, 0.08); for (let k = 0; k < 60; k++) { const x = r() * SIZE, y = r() * SIZE, a = r() * 6.28, L = 4 + r() * 10; line(g, x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, 0.8, 0.12); } } },
  // hair: long fine strands one way
  hair: { repeat: 4, draw(g, r) { for (let k = 0; k < 220; k++) { const x = r() * SIZE; line(g, x, 0, x + (r() - 0.5) * 6, SIZE, 0.7, 0.06 + r() * 0.12); } } },
};
// strength > 0 darkens, < 0 lightens
function line(g, x0, y0, x1, y1, w, strength) {
  g.strokeStyle = strength >= 0 ? `rgba(0,0,0,${strength})` : `rgba(255,255,255,${-strength})`;
  g.lineWidth = w; g.beginPath();
  for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) { g.moveTo(x0 + ox, y0 + oy); g.lineTo(x1 + ox, y1 + oy); } // (drawn wrapped: the tile has no seam)
  g.stroke();
}
function speckle(g, r, n, a, light = false) { for (let k = 0; k < n; k++) { g.fillStyle = (light && r() < 0.4) ? `rgba(255,255,255,${a * 1.5})` : `rgba(0,0,0,${a * (0.4 + r())})`; g.fillRect((r() * SIZE) | 0, (r() * SIZE) | 0, 1, 1); } }
function blotch(g, r, n, rad, a) {
  for (let k = 0; k < n; k++) {
    const x = r() * SIZE, y = r() * SIZE, R = rad * (0.5 + r());
    for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, R);
      gr.addColorStop(0, `rgba(0,0,0,${a * r()})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x + ox - R, y + oy - R, R * 2, R * 2);
    }
  }
}

export function clothTexture(kind) {
  const K = KINDS[kind];
  if (!K || typeof document === 'undefined') return null;
  let t = texCache.get(kind);
  if (t) return t;
  const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, SIZE, SIZE);
  K.draw(g, rng([...kind].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)));
  t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(K.repeat, K.repeat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(kind, t);
  return t;
}
export const CLOTH_KINDS = Object.keys(KINDS);

// ---- the atlas: every kind in one texture (4 x 3 cells), for merged meshes with baked vertex colours (bodies-geo.js Part).
// `aCloth` per vertex (0 none, k + 1 the k-th kind) picks the cell the shader tiles over the part's UVs.
const ATLAS_COLS = 4, ATLAS_ROWS = 3;
let atlas = null;
function clothAtlas() {
  if (atlas || typeof document === 'undefined') return atlas;
  const cv = document.createElement('canvas'); cv.width = SIZE * ATLAS_COLS; cv.height = SIZE * ATLAS_ROWS;
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  CLOTH_KINDS.forEach((k, i) => { const t = clothTexture(k); g.drawImage(t.image, (i % ATLAS_COLS) * SIZE, Math.floor(i / ATLAS_COLS) * SIZE); });
  atlas = new THREE.CanvasTexture(cv); atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.generateMipmaps = false; atlas.minFilter = atlas.magFilter = THREE.LinearFilter; // (no mip seams at the cells' edges)
  return atlas;
}
const vcMats = new Map();
function vcClothMaterial(base) {
  let m = vcMats.get(base.uuid);
  if (m) return m;
  m = base.clone();
  m.defines = { ...(m.defines || {}), USE_UV: '' };
  const reps = CLOTH_KINDS.map(k => KINDS[k].repeat * 0.9); // (finer than this shimmers on a figure's small parts: the atlas has no mips)
  m.onBeforeCompile = sh => {
    sh.uniforms.uClothAtlas = { value: clothAtlas() };
    sh.uniforms.uClothRep = { value: reps };
    sh.vertexShader = 'attribute float aCloth;\nvarying float vCloth;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCloth = aCloth;');
    sh.fragmentShader = `uniform sampler2D uClothAtlas;\nuniform float uClothRep[${reps.length}];\nvarying float vCloth;\n` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  if (vCloth > 0.5) {
    int k = int(vCloth + 0.5) - 1;
    float rep = 1.0;
    for (int i = 0; i < ${reps.length}; i++) if (i == k) rep = uClothRep[i];
    vec2 cell = vec2(mod(float(k), ${ATLAS_COLS}.0), floor(float(k) / ${ATLAS_COLS}.0));
    vec2 t = fract(vUv * rep);
    vec2 auv = (cell + 0.01 + t * 0.98) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
    auv.y = 1.0 - auv.y;
    diffuseColor.rgb *= texture2D(uClothAtlas, auv).rgb;
  }`);
  };
  m.customProgramCacheKey = () => 'cloth-atlas-v2';
  m.needsUpdate = true;
  vcMats.set(base.uuid, m);
  return m;
}

// put the textures on a built figure. slots: colour (hex, any case) -> kind
export function dress(human, slots) {
  if (!human?.root || !slots) return 0;
  const want = new Map(Object.entries(slots).filter(([c, k]) => c && KINDS[k]).map(([c, k]) => [new THREE.Color(c).getHexString(), k]));
  const list = [...want.entries()].map(([hex, kind]) => ({ c: new THREE.Color('#' + hex), idx: CLOTH_KINDS.indexOf(kind) + 1 }));
  let n = 0;
  human.root.traverse(o => {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    const m = o.material;
    if (!m.isMeshToonMaterial || m.map || !m.color) return;
    // a merged part with baked colours: tag each vertex with the cloth its colour is (the nearest slot colour within a little,
    // so a shaded cuff of the same cloth counts; the skin, the eyes and the buttons are nowhere near one and stay plain)
    if (m.vertexColors) {
      const geo = o.geometry, col = geo?.attributes?.color;
      if (!col || o.userData.shared || geo.userData?.shared) return;
      if (!geo.attributes.uv) { // (a part merged from pieces without UVs, e.g. a vest's own shapes: a box projection from its position, in metres)
        const P = geo.attributes.position, nrm = geo.attributes.normal, u = new Float32Array(P.count * 2);
        for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), ax = nrm ? Math.abs(nrm.getX(i)) : 0; u[i * 2] = ax > 0.6 ? z : x; u[i * 2 + 1] = y; }
        geo.setAttribute('uv', new THREE.BufferAttribute(u, 2));
      }
      const k = new Float32Array(col.count); let any = false;
      for (let i = 0; i < col.count; i++) {
        const r = col.getX(i), g = col.getY(i), b = col.getZ(i);
        let best = 0, bd = 0.0035; // (squared distance in linear rgb)
        for (const s of list) { const d = (s.c.r - r) ** 2 + (s.c.g - g) ** 2 + (s.c.b - b) ** 2; if (d < bd) { bd = d; best = s.idx; } }
        k[i] = best; if (best) any = true;
      }
      if (!any) return;
      geo.setAttribute('aCloth', new THREE.BufferAttribute(k, 1));
      o.material = vcClothMaterial(m); n++;
      return;
    }
    const kind = want.get(m.color.getHexString());
    if (!kind) return;
    const key = m.uuid + '|' + kind;
    let c = matCache.get(key);
    if (!c) { c = m.clone(); c.map = clothTexture(kind); c.needsUpdate = true; matCache.set(key, c); } // (no bump: as relief the weave broke the toon bands into speckle)
    o.material = c; n++;
  });
  return n;
}
