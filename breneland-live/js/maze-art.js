// Beneath Angell Street: the kit's printed surfaces, painted on small canvases with plain fills and strokes only (no 2D-canvas
// filters), the way lovecraft-art.js does the house's. Loaded only on the way down. The colour is drained on purpose: blue-grey wet
// stone, old brick, bone. The two loud colours are the lantern's amber and the glyphs' green.
import * as THREE from 'three';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// a small deterministic rng (the same canvases on every screen; the seed is the kit's, not the maze's)
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Each surface is painted at 512 px (so the same blocks and slabs, sharp up close) with grain inside every block, chisel marks,
// cracks, chipped corners, salt bloom and mineral stains, moss in the joints. With it goes a HEIGHT canvas (the mortar and the cracks
// low, the faces high) handed to the material as a bump map (tex.userData.bump, maze-kit.js makeMaterials), so the lantern rakes
// across real relief on the stepped toon light. The ink line is untouched: it's drawn from the geometry's own normals (toon.js
// normalMat), never the bump. The height only carries the broad features (mortar, cracks, chipped corners, faces standing proud,
// puddles' hollows). Fine grain and small chisel strokes are colour only: on the toon light they broke a band's edge into speckle
// and as a screen-derivative bump they shimmered as you walked. LEGACY.fine = true paints them into the height again (the old
// bump, for the tests' shimmer measure only). bakeRelief() below paints the height's darkness into a copy of the colour for Fast
// and phones (no bump there).
export const LEGACY = { fine: false };
const K = 2; // the canvases' scale over the 256 px layout coordinates
// the height at a quarter of the colour's size (HK): magnified, the bilinear filter turns every step (a face's edge, the mortar)
// into a short slope, so the bump gives a soft bevel the lantern rakes across instead of a one-pixel line that crawls as you walk.
// The bump scale is raised to match (BUMPK). The legacy height (the tests' "before") is full size.
const HK = 0.5, BUMPK = 2.2, GRAIN_K = 0.5;
function pair(w, h) { const hk = LEGACY.fine ? K : HK, [c, g] = canvas(w * K, h * K), [hc, hg] = canvas(w * hk, h * hk); g.scale(K, K); hg.scale(hk, hk); return { c, g, hc, hg }; }
function done(p, bumpScale) { const t = tex(p.c), b = tex(p.hc); b.colorSpace = THREE.NoColorSpace; t.userData.bump = b; t.userData.bumpScale = LEGACY.fine ? bumpScale : bumpScale * BUMPK; return t; }
// Fast and phones draw no bump: the height's darkness (the mortar, the cracks, the chips) is multiplied into a copy of the colour
// instead, so a small screen sees nearly the same stone. A face at its own height keeps its colour, what lies lower is darkened by
// k per unit of depth (the height drawn up to the colour's size first, the same soft slopes the bump sees).
export function bakeRelief(t, k = 0.3, top = 0.8) {
  const b = t.userData.bump; if (!b) return t;
  if (t.userData.flat) return t.userData.flat;
  const w = t.image.width, h = t.image.height, [c, g] = canvas(w, h), [hc, hg] = canvas(w, h);
  g.drawImage(t.image, 0, 0); hg.drawImage(b.image, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h), hp = hg.getImageData(0, 0, w, h).data, d = px.data;
  for (let i = 0; i < d.length; i += 4) { const f = 1 - k * Math.max(0, top - hp[i] / 255) / top; d[i] *= f; d[i + 1] *= f; d[i + 2] *= f; }
  g.putImageData(px, 0, 0);
  const f = tex(c); f.repeat.copy(t.repeat); f.userData.base = t;
  t.userData.flat = f;
  return f;
}
const grey = v => { const n = Math.max(0, Math.min(255, Math.round(v * 255))); return `rgb(${n},${n},${n})`; };
// grain: n specks of light or dark inside a box (both the colour and the height)
function grain(p, r, x, y, w, h, n, a, ha) {
  for (let k = 0; k < n; k++) {
    const px = x + r() * w, py = y + r() * h, s = 0.5 + r() * 1.3, lite = r() < 0.45;
    const ak = a * r(), ak2 = a * 1.4 * r();
    if (LEGACY.fine) { p.g.fillStyle = lite ? `rgba(220,230,240,${ak})` : `rgba(0,0,0,${ak2})`; p.g.fillRect(px, py, s, s); }
    // one speck in three, each a soft round dab twice the size, the light ones a dull grey, all fainter (at 1-2 m white specks read
    // as static and a phone's floor glittered)
    else if (k % 3 === 0) { p.g.fillStyle = lite ? `rgba(120,128,138,${ak * GRAIN_K})` : `rgba(0,0,0,${ak2 * GRAIN_K})`; p.g.beginPath(); p.g.arc(px, py, s * 1.1, 0, Math.PI * 2); p.g.fill(); }
    if (ha) { const hk = ha * r(); if (LEGACY.fine) { p.hg.fillStyle = lite ? `rgba(255,255,255,${hk})` : `rgba(0,0,0,${hk})`; p.hg.fillRect(px, py, s, s); } } // colour only. r() is still drawn so the layout stays the same
  }
}
// a crack: a wandering line, dark in the colour and low in the height
function crack(p, r, x, y, len, ang, w = 0.9) {
  p.g.strokeStyle = 'rgba(8,10,14,0.75)'; p.hg.strokeStyle = 'rgba(0,0,0,0.85)'; p.g.lineWidth = w; p.hg.lineWidth = w * 1.4;
  for (const g of [p.g, p.hg]) { g.beginPath(); g.moveTo(x, y); }
  let cx = x, cy = y;
  for (let i = 0; i < 6; i++) { ang += (r() - 0.5) * 0.9; cx += Math.cos(ang) * len / 6; cy += Math.sin(ang) * len / 6; p.g.lineTo(cx, cy); p.hg.lineTo(cx, cy); }
  p.g.stroke(); p.hg.stroke();
}

// cyclopean stone: big irregular blocks in courses, dark wet mortar, a chip of light on a few. One tile = 2 m of wall.
export function stoneBlocks() {
  const p = pair(256, 256), { g, hg } = p, r = rng(7);
  g.fillStyle = '#262b38'; g.fillRect(0, 0, 256, 256);
  hg.fillStyle = grey(0.12); hg.fillRect(0, 0, 256, 256);
  const tones = ['#4a5366', '#515a6e', '#434b5d', '#56607a', '#48516a', '#4d5568'];
  const rows = 5;
  for (let i = 0; i < rows; i++) {
    const y0 = Math.round(i * 256 / rows), h = Math.round(256 / rows) - 5;
    let x = (i % 2) * 30 - 18;
    while (x < 256) {
      const w = 40 + Math.floor(r() * 48), j = [r() * 3, r() * 4, r() * 3, r() * 3];
      const shape = gg => { gg.beginPath(); gg.moveTo(x + 2 + j[3], y0 + 1 + j[0]); gg.lineTo(x + w - 2 - j[1], y0 + 2); gg.lineTo(x + w - 3, y0 + h - 2 - j[2]); gg.lineTo(x + 3 + j[3], y0 + h - 1); gg.closePath(); };
      g.fillStyle = tones[Math.floor(r() * tones.length)]; shape(g); g.fill();
      hg.fillStyle = grey(0.62 + r() * 0.12); shape(hg); hg.fill();
      // the face: a bevel (lit top edge, shadowed foot), grain and tooling, a few chisel strokes across it
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 6, y0 + 4, w - 14, 3);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 4, y0 + h - 5, w - 10, 3);
      hg.fillStyle = grey(0.82); hg.fillRect(x + 8, y0 + 7, w - 18, h - 16);   // the face stands proud of its own edges
      grain(p, r, x + 3, y0 + 2, w - 6, h - 4, 70, 0.22, 0.35);
      g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 0.7; hg.strokeStyle = 'rgba(0,0,0,0.25)'; hg.lineWidth = 0.8;
      for (let k = 0; k < 4 + r() * 5; k++) { const sx = x + 6 + r() * (w - 14), sy = y0 + 6 + r() * (h - 14), a = 1.1 + r() * 0.4; for (const gg of LEGACY.fine ? [g, hg] : [g]) { gg.beginPath(); gg.moveTo(sx, sy); gg.lineTo(sx + Math.cos(a) * 6, sy + Math.sin(a) * 6); gg.stroke(); } } // the small tooling strokes, colour only
      if (r() < 0.3) { g.fillStyle = 'rgba(120,140,150,0.25)'; g.fillRect(x + 8 + r() * (w - 20), y0 + 8 + r() * (h - 16), 5, 4); } // a wet chip
      if (r() < 0.35) crack(p, r, x + 6 + r() * (w - 12), y0 + 3, h * 0.8, 1.4 + (r() - 0.5));            // a crack down the block
      if (r() < 0.25) { g.fillStyle = 'rgba(14,16,22,0.6)'; g.beginPath(); g.moveTo(x + w - 3, y0 + h - 2); g.lineTo(x + w - 12, y0 + h - 2); g.lineTo(x + w - 3, y0 + h - 12); g.fill(); hg.fillStyle = grey(0.2); hg.beginPath(); hg.moveTo(x + w - 3, y0 + h - 2); hg.lineTo(x + w - 12, y0 + h - 2); hg.lineTo(x + w - 3, y0 + h - 12); hg.fill(); } // a chipped corner
      x += w + 4;
    }
  }
  // mortar: gritty and recessed, moss in a few joints
  grain(p, r, 0, 0, 256, 256, 900, 0.12, 0);
  g.fillStyle = 'rgba(52,78,58,0.35)'; for (let k = 0; k < 26; k++) g.fillRect(r() * 256, Math.round(r() * rows) * 256 / rows - 3 + r() * 2, 4 + r() * 12, 2.5);
  // damp: streaks down the courses, salt bloom where it dried, a rust-dark mineral stain or two
  g.fillStyle = 'rgba(10,14,22,0.2)';
  for (let k = 0; k < 9; k++) { const x = r() * 256, w = 2 + r() * 4; g.fillRect(x, 0, w, 256); g.fillStyle = 'rgba(10,14,22,0.12)'; g.fillRect(x - 1, 0, w + 2, 120 + r() * 136); g.fillStyle = 'rgba(10,14,22,0.2)'; }
  for (let k = 0; k < 5; k++) { const x = r() * 256, y = r() * 256; g.fillStyle = LEGACY.fine ? 'rgba(200,205,195,0.09)' : 'rgba(150,155,150,0.07)'; for (let q = 0; q < 30; q++) { const bx = x + (r() - 0.5) * 30, by = y + r() * 18; if (LEGACY.fine) g.fillRect(bx, by, 1.5, 1.5); else if (q % 4 === 0) { g.beginPath(); g.arc(bx, by, 2.2, 0, Math.PI * 2); g.fill(); } } } // a soft bloom, not white grit
  for (let k = 0; k < 2; k++) { const x = r() * 256; g.fillStyle = 'rgba(90,60,40,0.14)'; g.fillRect(x, r() * 120, 7 + r() * 6, 60 + r() * 90); }
  return done(p, 2.2);
}

// old brick in a running bond, damp and dark: the vaults. One tile = 1 m.
export function brickVault() {
  const p = pair(256, 128), { g, hg } = p, r = rng(11);
  g.fillStyle = '#1e191c'; g.fillRect(0, 0, 256, 128);
  hg.fillStyle = grey(0.15); hg.fillRect(0, 0, 256, 128);
  const tones = ['#5a3a36', '#4e3230', '#63403a', '#55352f', '#4a2f2c', '#5e3d33'];
  for (let i = 0; i < 8; i++) {
    const y = i * 16, off = (i % 2) * 20;
    for (let x = -20 + off; x < 256; x += 40) {
      g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(x + 1, y + 1, 37, 13);
      hg.fillStyle = grey(0.7 + r() * 0.15); hg.fillRect(x + 2, y + 2, 35, 11);
      g.fillStyle = 'rgba(255,220,200,0.06)'; g.fillRect(x + 2, y + 2, 35, 2);    // the arris catching light
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 1, y + 11, 37, 3);
      grain(p, r, x + 1, y + 1, 37, 13, 26, 0.2, 0.3);
      if (r() < 0.2) { g.fillStyle = 'rgba(10,8,8,0.55)'; g.fillRect(x + (r() < 0.5 ? 1 : 32), y + 1, 6, 5); hg.fillStyle = grey(0.25); hg.fillRect(x + (r() < 0.5 ? 1 : 32), y + 1, 6, 5); } // a chipped end
      if (r() < 0.15) { g.fillStyle = 'rgba(10,10,12,0.35)'; g.fillRect(x + 1, y + 1, 37, 13); }                      // a soot-dark brick
    }
  }
  g.fillStyle = 'rgba(40,60,50,0.3)'; // moss in the joints here and there
  for (let k = 0; k < 26; k++) g.fillRect(r() * 256, Math.floor(r() * 8) * 16 - 1, 6 + r() * 12, 2.5);
  for (let k = 0; k < 6; k++) { const x = r() * 256, y = r() * 128; g.fillStyle = LEGACY.fine ? 'rgba(210,210,200,0.08)' : 'rgba(150,150,140,0.07)'; for (let q = 0; q < 40; q++) { const bx = x + (r() - 0.5) * 26, by = y + (r() - 0.5) * 14; if (LEGACY.fine) g.fillRect(bx, by, 1.5, 1.5); else if (q % 4 === 0) { g.beginPath(); g.arc(bx, by, 2, 0, Math.PI * 2); g.fill(); } } } // salt bloom: soft, not white grit
  return done(p, 1.6);
}

// wet flagstones: dark slabs, a sheen of light on the wet ones. One tile = 2 m.
export function flagstones() {
  const p = pair(256, 256), { g, hg } = p, r = rng(5);
  g.fillStyle = '#14161d'; g.fillRect(0, 0, 256, 256);
  hg.fillStyle = grey(0.1); hg.fillRect(0, 0, 256, 256);
  const tones = ['#2e3442', '#333a4a', '#2a303d', '#363d4f', '#30364a'];
  for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) {
    const w = 60 - r() * 6, h = 60 - r() * 6;
    g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(x + 2, y + 2, w, h);
    hg.fillStyle = grey(0.6 + r() * 0.15); hg.fillRect(x + 2, y + 2, w, h);
    hg.fillStyle = grey(0.78); hg.fillRect(x + 6, y + 6, w - 8, h - 8);      // worn round the edges, the middle high
    grain(p, r, x + 2, y + 2, w, h, 140, 0.22, 0.3);
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x + 3, y + 3, w - 2, 2);  // a worn arris
    if (r() < 0.45) { g.fillStyle = 'rgba(140,170,190,0.13)'; g.fillRect(x + 8, y + 8 + r() * 30, w - 16, 6 + r() * 10); } // the wet sheen
    if (r() < 0.4) crack(p, r, x + 4 + r() * (w - 8), y + 4 + r() * (h - 8), 22 + r() * 26, r() * 6.28, 0.8);
    if (r() < 0.3) { const px = x + 10 + r() * (w - 24), py = y + 10 + r() * (h - 24), pw = 10 + r() * 14; g.fillStyle = 'rgba(12,22,30,0.45)'; g.fillRect(px, py, pw, pw * 0.6); g.fillStyle = 'rgba(170,200,215,0.12)'; g.fillRect(px + 2, py + 1, pw - 6, 1.5); hg.fillStyle = grey(0.45); hg.fillRect(px, py, pw, pw * 0.6); } // a puddle in a hollow
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 2, y + h - 2, w, 4);
  }
  grain(p, r, 0, 0, 256, 256, 700, 0.14, 0); // grit in the joints
  return done(p, 1.8);
}

// a cobweb (the scenery pass): an orb web, sagging, torn on one side, pale grey on clear; strung across the top of a corner
export function cobweb() {
  const [c, g] = canvas(256, 256), r = rng(23), cx = 128, cy = 118;
  g.clearRect(0, 0, 256, 256);
  const spokes = 11, ang = [...Array(spokes)].map((_, i) => i / spokes * Math.PI * 2 + (r() - 0.5) * 0.35), len = ang.map(() => 105 + r() * 25);
  g.strokeStyle = 'rgba(225,228,232,0.7)'; g.lineWidth = 1.3;
  ang.forEach((a, i) => { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * len[i], cy + Math.sin(a) * len[i]); g.stroke(); });
  g.lineWidth = 0.9;
  for (let ringR = 12; ringR < 110; ringR += 9 + r() * 4) {
    g.strokeStyle = `rgba(225,228,232,${0.35 + r() * 0.3})`; g.beginPath();
    let first = true;
    for (let i = 0; i <= spokes; i++) {
      const k = i % spokes; if (ringR > len[k] - 4) { first = true; continue; }
      if (k > 7 && ringR > 60 && r() < 0.6) { first = true; continue; } // (torn on one side)
      const a = ang[k], x = cx + Math.cos(a) * ringR, y = cy + Math.sin(a) * ringR + ringR * 0.06; // (a little sag)
      if (first) { g.moveTo(x, y); first = false; } else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.fillStyle = 'rgba(200,205,210,0.18)'; for (let k = 0; k < 40; k++) g.fillRect(cx + (r() - 0.5) * 160, cy + (r() - 0.5) * 160, 2, 2); // dust caught in it
  return tex(c, false);
}

// a glyph: a green sigil glowing faintly on black (transparent round it), each a little different
export function glyph(kind = 0) {
  const [c, g] = canvas(128, 128), r = rng(100 + kind);
  g.clearRect(0, 0, 128, 128);
  // cut into the stone with the glow down in the cut: each stroke drawn first as a dark groove (wider, its lower edge a little
  // further), then the green inside it, so it reads as carved and lit from within, not a sticker on the wall
  const ang = [0, 1, 2, 3].map(() => r() * Math.PI * 2), n = 3 + (kind % 3);
  const shape = (w, dx, dy) => {
    g.lineWidth = w; g.beginPath(); g.arc(64 + dx, 64 + dy, 44, 0, Math.PI * 2); g.stroke();
    g.lineWidth = w - 1; g.beginPath();
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2 - Math.PI / 2, x = 64 + dx + Math.cos(a) * 34, y = 64 + dy + Math.sin(a) * 34; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    for (const a of ang) { g.beginPath(); g.moveTo(64 + dx, 64 + dy); g.lineTo(64 + dx + Math.cos(a) * 20, 64 + dy + Math.sin(a) * 20); g.stroke(); }
  };
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(0,0,0,0.6)'; shape(10, 0.8, 1.6);
  g.strokeStyle = '#7fd6a6'; shape(5, 0, 0);
  g.strokeStyle = 'rgba(210,255,230,0.55)'; shape(1.6, -0.6, -0.8); // the glow's brightest line, high in the cut
  g.fillStyle = '#7fd6a6'; g.beginPath(); g.arc(64, 64, 5, 0, Math.PI * 2); g.fill();
  return tex(c, false);
}

// an Elder Sign cut into the stone (the kit lights it with the lantern, a toon material): a dark groove for each stroke, its upper
// lip catching the light, its lower edge in shadow. Worn and faint
export function elderSign() {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  const strokes = (w, dx, dy) => {
    g.lineWidth = w;
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.moveTo(64 + dx, 64 + dy); g.lineTo(64 + dx + Math.cos(a) * 46, 64 + dy + Math.sin(a) * 46); g.stroke(); }
    g.beginPath(); g.ellipse(64 + dx, 64 + dy, 18, 10, 0, 0, Math.PI * 2); g.stroke();
  };
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(205,212,205,0.55)'; strokes(6.5, -1, -1.2);  // the lip the light catches
  g.strokeStyle = 'rgba(8,9,12,0.88)'; strokes(4.5, 0.4, 0.6);       // the groove
  g.fillStyle = 'rgba(8,9,12,0.88)'; g.beginPath(); g.arc(64, 64, 5, 0, Math.PI * 2); g.fill();
  return tex(c, false);
}

// the ritual chamber's floor sigil: a big double circle with runes between, glowing green
export function sigil() {
  const [c, g] = canvas(256, 256), r = rng(33);
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = '#7fd6a6'; g.lineWidth = 5;
  g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(128, 128, 92, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3;
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, x = 128 + Math.cos(a) * 105, y = 128 + Math.sin(a) * 105; g.beginPath(); g.moveTo(x - 4 + r() * 8, y - 6); g.lineTo(x + 4 - r() * 8, y + 6); if (r() < 0.5) g.lineTo(x + 5, y - 2); g.stroke(); }
  g.lineWidth = 4;
  g.beginPath(); for (let i = 0; i <= 7; i++) { const a = (i * 3 / 7) * Math.PI * 2 - Math.PI / 2, x = 128 + Math.cos(a) * 84, y = 128 + Math.sin(a) * 84; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
  g.fillStyle = '#7fd6a6'; g.beginPath(); g.arc(128, 128, 9, 0, Math.PI * 2); g.fill();
  return tex(c, false);
}

// a scratched arrow (navigation help: somebody came this way before you)
export function arrow() {
  const [c, g] = canvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(220,214,190,0.8)'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(10, 32); g.lineTo(52, 32); g.moveTo(38, 18); g.lineTo(52, 32); g.lineTo(38, 46); g.stroke();
  return tex(c, false);
}
