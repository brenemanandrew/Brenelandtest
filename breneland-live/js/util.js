// Small shared helpers: deterministic hashing, noise, and 2D geometry.

// 32-bit string/number hash -> uint32. Same input gives the same value on every
// client, which is what keeps the NPCs in step for everyone.
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}
// hash01('npc', 3, 'k') -> [0,1)
export function hash01(...parts) {
  let h = 0x9e3779b9;
  for (const p of parts) {
    const v = typeof p === 'number' ? (p | 0) ^ Math.imul((p * 4096) | 0, 31) : hashStr(String(p));
    h = mix(h ^ v);
  }
  return h / 4294967296;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Value noise, smooth enough for rolling lawns.
function lattice(ix, iz) { return mix(Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263)) / 4294967296; }
export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = lattice(ix, iz), b = lattice(ix + 1, iz), c = lattice(ix, iz + 1), d = lattice(ix + 1, iz + 1);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}
export function fbm(x, z) {
  return noise2(x, z) * 0.6 + noise2(x * 2.1 + 17, z * 2.1 - 9) * 0.3 + noise2(x * 4.3 - 5, z * 4.3 + 3) * 0.1;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}
export function wrapAngle(a) { return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }

// ---- polygon / segment geometry (x,z pairs)

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Closest point on segment AB to P. Returns [x, z, distSq, t].
export function closestOnSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t, cz = az + dz * t;
  const ex = px - cx, ez = pz - cz;
  return [cx, cz, ex * ex + ez * ez, t];
}

// Closest point on a polygon's boundary (or an open polyline when closed=false).
export function closestOnPoly(px, pz, poly, closed = true) {
  let best = null;
  const n = poly.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const c = closestOnSeg(px, pz, a[0], a[1], b[0], b[1]);
    if (!best || c[2] < best[2]) best = [c[0], c[1], c[2], i, c[3]];
  }
  return best; // [x, z, distSq, segIndex, t]
}

export function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
// Point at distance d along a polyline -> [x, z, dirX, dirZ]
export function alongPolyline(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
    const seg = Math.hypot(bx - ax, bz - az);
    if (d <= seg || i === pts.length - 1) {
      const t = seg > 1e-6 ? clamp(d / seg, 0, 1) : 1;
      return [ax + (bx - ax) * t, az + (bz - az) * t, seg > 1e-6 ? (bx - ax) / seg : 0, seg > 1e-6 ? (bz - az) / seg : 1];
    }
    d -= seg;
  }
  const p = pts[pts.length - 1];
  return [p[0], p[1], 0, 1];
}

// Smooth a polyline with Catmull-Rom so trails don't look like rulers.
export function smoothPath(pts, perSeg = 6) {
  if (pts.length < 3) return pts.slice();
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

// ---- DOM helpers for features that build their own UI

// Load a stylesheet once: loadCss('/css/fishing.css'). Features ship their own CSS instead of editing style.css.
const loadedCss = new Set();
export function loadCss(href) {
  if (loadedCss.has(href) || typeof document === 'undefined') return;
  loadedCss.add(href);
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href;
  document.head.append(l);
}

// el('div', 'toast big', 'text', { id: 'x' }) -> element (text goes in through textContent, never innerHTML)
export function el(tag, cls = '', text = '', attrs = null) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
