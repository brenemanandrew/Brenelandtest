// Dog affection levels: four paw outlines under Dax's, Nala's and Molly's name tags, filled as you bond with each dog. The
// server (lib/paws.js) keeps the counts and the rules, this file only draws what it's told: the paws, the "Pet Owner" popup at
// the first paw, the sign by the toy basket, and the rewards on the dogs for your view only:
//   paw 2  the dog's collar glows at night           paw 3  a holiday headband in each holiday's season
//   paw 4  a cosy striped sweater
// The rewards are extra meshes on top of the dog as built (Andrew's saved looks are never read or written), shown or hidden
// per viewer, and nothing here touches the shared simulation. Other players see their own paws and none of your rewards, except
// while a dog is out walking with someone: then it wears its walker's rewards on every screen ({ t: 'pawsOn', dog, lvl }, `on`
// in the join message for late joiners, null when the walk ends). Guests have paws too, in the server's memory only.
//
// What goes up: { t: 'pawev', e: 'ate', dog, x, z } when my treat is eaten (dogs-sync.js onFx), { t: 'pawev', e: 'fetch', dog }
// when a dog takes the toy I threw. The walk ticks ({ t: 'walk', dog, ms }) come from the walk-with-me piece.
// Test hooks: breneland.features 'paws' -> .api { state, night, season, setDay('YYYY-MM-DD' | null), popup(), sign, rewards(id) }.
// ?day=YYYY-MM-DD pins the holiday calendar (daytime.js ?hour= pins the clock).
import * as THREE from 'three';
import { loadCss } from './util.js';
import { toon, soft, shadows, glow, redrawWhenFontsLoad } from './toon.js';
import { paint, merge, blob } from './skin.js';
import { GEO } from './batch.js';
import { PAW_SIGN } from './layout.js';
import { terrainHeight } from './terrain.js';
import { dayPhase, easternParts } from './daytime.js';

const DOGS = ['nala', 'dax', 'molly'];   // (molly: Joyce's dog)
const VC = () => toon('#ffffff', { vertexColors: true });   // (the dogs' own vertex-colour toon material: the parts merge with theirs)
// one geometry from several painted parts (indexed or not: three's merge wants them alike)
const joined = parts => merge(parts.map(g => { if (!g.attributes.normal) g.computeVertexNormals(); return g.index ? g.toNonIndexed() : g; }));
// the holidays and their seasons (Eastern calendar): Halloween, Christmas, Valentine's, St Patrick's, the 4th of July
export const SEASONS = [
  { id: 'halloween', from: [10, 15], to: [10, 31] },
  { id: 'christmas', from: [12, 1], to: [12, 26] },
  { id: 'valentines', from: [2, 7], to: [2, 14] },
  { id: 'stpatricks', from: [3, 10], to: [3, 17] },
  { id: 'july4', from: [6, 28], to: [7, 4] },
];
export function seasonOf(mo, d) {
  const v = mo * 100 + d;
  for (const s of SEASONS) if (v >= s.from[0] * 100 + s.from[1] && v <= s.to[0] * 100 + s.to[1]) return s.id;
  return null;
}
const PAW_PATH = 'M12 21.5c-3.6 0-6.4-2-6.4-4.8 0-1.9 1.3-3.2 2.7-4.3C9.6 11.4 10.4 10 12 10s2.4 1.4 3.7 2.4c1.4 1.1 2.7 2.4 2.7 4.3 0 2.8-2.8 4.8-6.4 4.8z';
const TOES = [[4.6, 10.2], [8.6, 5.4], [15.4, 5.4], [19.4, 10.2]];
// one paw print as an inline SVG (static markup, no user text)
function pawSvg(cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', PAW_PATH); s.appendChild(p);
  for (const [x, y] of TOES) { const c = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse'); c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('rx', 2.5); c.setAttribute('ry', 2.9); s.appendChild(c); }
  return s;
}
function pawRow(n, cls) {
  const row = document.createElement('div'); row.className = cls;
  for (let i = 0; i < 4; i++) row.appendChild(pawSvg('paw' + (i < n ? ' on' : '')));
  return row;
}
const mixHex = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

export function createPaws(ctx) {
  const { scene, npcs, net, ui, colliders } = ctx;
  loadCss('/css/paws.css');
  const S = { dogs: { nala: { lvl: 0 }, dax: { lvl: 0 }, molly: { lvl: 0 } }, on: { nala: null, dax: null, molly: null }, guest: false, day: null, night: false, season: null };   // (on: the walker's level while a dog is out, else null)
  try { const q = new URLSearchParams(location.search).get('day'); if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) S.day = q; } catch { /* no location */ }
  const dogs = {};   // id -> { d, dog, row, rewards }
  for (const id of DOGS) {
    const d = npcs.dog(id);
    if (!d || !d.body) continue;
    const tag = [...ui.items].find(it => it.tag && it.obj === d.body.root);
    const row = pawRow(0, 'paws');
    if (tag) tag.node.appendChild(row);
    dogs[id] = { d, dog: d.body, row, shown: -1, rewards: null };
  }

  // ---------------------------------------------------------------- the paws under the tags
  function refresh() {
    for (const id of DOGS) {
      const e = dogs[id]; if (!e) continue;
      const lvl = S.dogs[id] ? S.dogs[id].lvl : 0;
      if (lvl === e.shown) continue;
      e.shown = lvl;
      e.row.querySelectorAll('.paw').forEach((p, i) => p.classList.toggle('on', i < lvl));
      e.row.classList.remove('gain'); if (lvl > 0) { void e.row.offsetWidth; e.row.classList.add('gain'); }
    }
  }

  // ---------------------------------------------------------------- the popup: "You're a Pet Owner! Gratz!"
  let pop = null;
  function popup(dogId) {
    if (pop) return;
    const d = dogs[dogId] && dogs[dogId].d, name = d ? (d.tag || d.name) : 'The dogs';
    pop = document.createElement('div'); pop.className = 'paws-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true'); pop.setAttribute('aria-labelledby', 'paws-pop-title');
    const conf = document.createElement('div'); conf.className = 'paws-confetti'; conf.setAttribute('aria-hidden', 'true');
    const cols = ['#ffd34d', '#ff8fb8', '#8fd0ee', '#a8e06b', '#b48cff', '#ff9f4a'];
    for (let i = 0; i < 36; i++) {
      const s = document.createElement('span');
      s.style.setProperty('--x', (3 + (i * 37) % 94) + '%'); s.style.setProperty('--d', (0.9 + (i % 7) * 0.22).toFixed(2) + 's'); s.style.setProperty('--w', (0.1 + (i % 5) * 0.11).toFixed(2) + 's');
      s.style.setProperty('--c', cols[i % cols.length]); s.style.setProperty('--r', ((i * 53) % 360) + 'deg'); s.style.setProperty('--s', (0.7 + (i % 4) * 0.2).toFixed(2));
      conf.appendChild(s);
    }
    const card = document.createElement('div'); card.className = 'paws-card';
    card.appendChild(pawRow(1, 'paws-card-paws'));
    const h = document.createElement('h2'); h.id = 'paws-pop-title'; h.textContent = "You're a Pet Owner!"; card.appendChild(h);
    const g = document.createElement('div'); g.className = 'paws-gratz'; g.textContent = 'Gratz!'; card.appendChild(g);
    const p = document.createElement('p'); p.textContent = `${name} thinks you are the best.`; card.appendChild(p);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn paws-ok'; b.textContent = 'Woohoo!'; b.addEventListener('click', closePopup); card.appendChild(b);
    pop.appendChild(conf); pop.appendChild(card);
    document.body.appendChild(pop);
    ctx.audio?.ui?.('pop');
    void pop.offsetWidth;   // (a reflow first, so the card's pop-in still animates; not a rAF: a stepped or hidden page would leave it at opacity 0)
    pop.classList.add('in');
    try { b.focus({ preventScroll: true }); } catch { /* fine */ }
  }
  function closePopup() {
    if (!pop) return;
    const n = pop; pop = null;
    n.classList.remove('in'); n.classList.add('out');
    setTimeout(() => n.remove(), 320);
    ctx.canvas?.focus?.();
  }

  // ---------------------------------------------------------------- the server's word
  net.on('paws', m => {
    if (!m || !m.dogs) return;
    S.dogs = m.dogs; S.guest = !!m.guest;
    if (m.on) for (const id of DOGS) S.on[id] = Number.isInteger(m.on[id]) ? m.on[id] : null;
    refresh();
    if (m.gain) {
      const name = dogs[m.gain.dog] ? (dogs[m.gain.dog].d.tag || dogs[m.gain.dog].d.name) : 'The dog';
      if (m.gain.lvl === 2) ui.toast(`${name}'s collar will glow for you at night.`, 4200);
      else if (m.gain.lvl === 3) ui.toast(`${name} will wear holiday headbands for you.`, 4200);
      else if (m.gain.lvl === 4) ui.toast(`${name} has a sweater now, just for you.`, 4200);
    }
    if (m.pop) popup(m.gain ? m.gain.dog : 'nala');
    applyRewards(true);
  });

  // a dog out walking wears its walker's rewards for everyone; null when it is back to each viewer's own
  net.on('pawsOn', m => {
    if (!m || !DOGS.includes(m.dog)) return;
    S.on[m.dog] = Number.isInteger(m.lvl) ? m.lvl : null;
    applyRewards(true);
  });

  // my treat eaten by a dog (the simulation says so once, dogs-sync.js fx -> onFx)
  const sync = npcs.dogSync;
  if (sync) {
    const prev = sync.onFx;
    sync.onFx = (kind, a, b, c, d, e) => {
      if (prev) prev(kind, a, b, c, d, e);
      if (kind === 'ate' && b != null && String(b) === sync.myKey && net.status === 'online') net.send({ t: 'pawev', e: 'ate', dog: a, x: d, z: e });
    };
  }
  // my toy taken by a dog: dog-toys' ball (its fields are copied from the simulation while it is loose)
  let toys = null, lastState = null, fetchSent = false;
  function watchFetch() {
    if (!toys) { toys = (ctx.features || []).find(f => f.name === 'dogtoys') || null; if (!toys) return; }
    const b = toys.ball;
    if (b.state !== lastState) { if (b.state === 'loose') fetchSent = false; lastState = b.state; }
    if (b.state === 'loose' && !fetchSent && b.holder && DOGS.includes(b.holder)) {
      fetchSent = true;
      if (net.status === 'online') net.send({ t: 'pawev', e: 'fetch', dog: b.holder });
    }
  }

  // ---------------------------------------------------------------- the rewards (per viewer, on top of the dog as built)
  function buildRewards(e) {
    const dog = e.dog, D = dog.D, look = dog.look;
    const R = { glow: [], bands: {}, sweater: [] };
    // the collar glows: a shell over the collar's own skinned geometry (so it hugs the neck in every pose), bright and unlit,
    // and a soft halo round it
    if (dog.collar && dog.collar.skeleton) {
      const shell = (k, mat, cast) => {
        const g = dog.collar.geometry.clone();
        const P = g.attributes.position, N = g.attributes.normal;
        for (let i = 0; i < P.count; i++) P.setXYZ(i, P.getX(i) + N.getX(i) * k, P.getY(i) + N.getY(i) * k, P.getZ(i) + N.getZ(i) * k);
        const m = new THREE.SkinnedMesh(g, mat);
        m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = false; m.visible = false; m.name = 'paws-glow';
        dog.body.add(m);
        m.bind(dog.collar.skeleton, dog.collar.bindMatrix);
        return m;
      };
      const bright = mixHex(look.collar || '#8fc4ee', '#ffffff', 0.55);
      R.glow.push(shell(0.0035, glow(bright), false));
      const halo = new THREE.MeshBasicMaterial({ color: new THREE.Color(mixHex(look.collar || '#8fc4ee', '#ffffff', 0.2)), transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
      R.glow.push(soft(shell(0.022, halo, false)));
    }
    // holiday headbands on the head group (origin at the poll, +z the nose; the head's own scale sizes them per dog)
    {
      const F = D.F, hw = D.B.headW || 1, top = F.top;
      const w = 0.096 * hw, Rb = w + 0.014, yc = top + 0.014 - Rb, zb = -0.032;   // (behind the ears, over the crown: measured on both heads)
      const tip = [0, yc + Rb, zb];   // the top of the band
      const band = (color, arcDeg = 200) => {
        const arc = arcDeg * Math.PI / 180;
        const g = new THREE.TorusGeometry(Rb, 0.011, 6, 26, arc);
        g.rotateZ(Math.PI / 2 - arc / 2); g.translate(0, yc, zb);
        return paint(g, color);
      };
      const cyl = (color, p, r, h, rot) => { const g = GEO.cyl8.clone(); g.scale(r, h, r); g.translate(0, h / 2, 0); if (rot) g.rotateZ(rot.z || 0); if (rot && rot.x) g.rotateX(rot.x); g.translate(p[0], p[1], p[2]); return paint(g, color); };
      const flat = (shape, color, depth, p, rot = 0, sc = 1) => {
        const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
        g.translate(0, 0, -depth / 2); g.scale(sc, sc, 1); if (rot) g.rotateZ(rot); g.translate(p[0], p[1], p[2]);
        return paint(g, color);
      };
      const heart = () => { const s = new THREE.Shape(); s.moveTo(0, -0.55); s.bezierCurveTo(-0.3, -0.25, -0.62, 0.0, -0.62, 0.22); s.bezierCurveTo(-0.62, 0.52, -0.38, 0.62, -0.26, 0.62); s.bezierCurveTo(-0.1, 0.62, 0, 0.5, 0, 0.38); s.bezierCurveTo(0, 0.5, 0.1, 0.62, 0.26, 0.62); s.bezierCurveTo(0.38, 0.62, 0.62, 0.52, 0.62, 0.22); s.bezierCurveTo(0.62, 0.0, 0.3, -0.25, 0, -0.55); return s; };
      const star = () => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.42 : 1; if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } s.closePath(); return s; };
      const wires = (color, xs, lean, h) => xs.map((x, i) => cyl(color, [x, tip[1] - 0.006, tip[2]], 0.0028, h, { z: -Math.sign(x) * lean }));
      const tipOf = (x, lean, h) => [x - Math.sin(-Math.sign(x) * lean) * h * 0 + Math.sign(x) * Math.sin(lean) * h, tip[1] - 0.006 + Math.cos(lean) * h, tip[2]];
      const kinds = {
        halloween: () => {
          const parts = [band('#2b2340')];
          const pc = [tip[0], tip[1] + 0.028, tip[2]];
          parts.push(blob('#f08a2a', pc, [0.034, 0.028, 0.03]));
          parts.push(cyl('#4f8a3a', [pc[0], pc[1] + 0.02, pc[2]], 0.005, 0.014));
          for (const s of [-1, 1]) { const g = GEO.cone6.clone(); g.scale(0.0065, 0.009, 0.0065); g.rotateX(Math.PI / 2); g.translate(pc[0] + s * 0.011, pc[1] + 0.005, pc[2] + 0.026); parts.push(paint(g, '#2b2340')); }
          const mouth = GEO.box.clone(); mouth.scale(0.022, 0.005, 0.006); mouth.translate(pc[0], pc[1] - 0.009, pc[2] + 0.027); parts.push(paint(mouth, '#2b2340'));
          return parts;
        },
        christmas: () => {
          const parts = [band('#d8343a')];
          for (const s of [-1, 1]) {
            const base = [s * 0.045, tip[1] - 0.012, tip[2]];
            parts.push(cyl('#7a4a24', base, 0.008, 0.095, { z: -s * 0.42 }));
            const mid = [base[0] + s * Math.sin(0.42) * 0.045, base[1] + Math.cos(0.42) * 0.045, base[2]];
            parts.push(cyl('#7a4a24', mid, 0.0065, 0.04, { z: s * 0.5 }));
            const hi = [base[0] + s * Math.sin(0.42) * 0.068, base[1] + Math.cos(0.42) * 0.068, base[2]];
            parts.push(cyl('#7a4a24', hi, 0.006, 0.032, { z: -s * 1.2 }));
          }
          for (let i = 0; i < 5; i++) { const a = Math.PI / 2 + (i - 2) * 0.42; parts.push(blob('#fff3dc', [Math.cos(a) * Rb, yc + Math.sin(a) * Rb, zb], [0.007, 0.007, 0.007], null, 'tiny')); }
          return parts;
        },
        valentines: () => {
          const parts = [band('#ff8fb8')];
          const lean = 0.35, h = 0.055;
          parts.push(...wires('#2b2340', [-0.03, 0.03], lean, h));
          parts.push(flat(heart(), '#e0463c', 0.009, tipOf(-0.03, lean, h), -0.3, 0.034));
          parts.push(flat(heart(), '#ff5c8a', 0.009, tipOf(0.03, lean, h), 0.3, 0.034));
          return parts;
        },
        stpatricks: () => {
          const parts = [band('#2f8a3e')];
          const c = [tip[0], tip[1] + 0.05, tip[2]];
          parts.push(cyl('#2f8a3e', [c[0], c[1] - 0.05, c[2]], 0.0035, 0.045));
          for (let i = 0; i < 3; i++) { const a = Math.PI / 2 + i * Math.PI * 2 / 3; const g = GEO.cyl12.clone(); g.scale(0.017, 0.007, 0.017); g.rotateX(Math.PI / 2); g.translate(c[0] + Math.cos(a) * 0.016, c[1] + Math.sin(a) * 0.016, c[2]); parts.push(paint(g, '#3fae4a')); }
          return parts;
        },
        july4: () => {
          const stripes = (x, y) => { const a = Math.atan2(y - yc, x); return Math.floor(a / 0.26) % 2 ? '#fff3dc' : '#e0463c'; };
          const parts = [band(stripes)];
          const lean = 0.4, h = 0.05;
          parts.push(...wires('#2b2340', [-0.034, 0.034], lean, h), cyl('#2b2340', [0, tip[1] - 0.006, tip[2]], 0.0028, 0.066));
          parts.push(flat(star(), '#e0463c', 0.008, tipOf(-0.034, lean, h), 0, 0.022));
          parts.push(flat(star(), '#fff3dc', 0.008, [0, tip[1] - 0.006 + 0.066, tip[2]], 0, 0.026));
          parts.push(flat(star(), '#3f5fd9', 0.008, tipOf(0.034, lean, h), 0, 0.022));
          return parts;
        },
      };
      for (const [id, make] of Object.entries(kinds)) {
        const m = new THREE.Mesh(joined(make()), VC());
        m.name = 'paws-band-' + id; m.visible = false; m.castShadow = true; m.receiveShadow = false;
        dog.head.add(m);
        R.bands[id] = m;
      }
    }
    // the sweater: the dog's own body shell, a knit's thickness out, cut off ahead of the hips, a ribbed hem at the cut and a
    // turtleneck round the root of the neck (skinned on the neck's first bone, as the collar is)
    if (dog.barrel && dog.barrel.geometry) {
      const l = D.B.len, zCut = -0.09 * l, THICK = 0.012;
      const base = look.points ? '#ff7fb6' : look.earStyle === 'rose' ? '#8c5bd6' : '#e0463c', stripe = '#fff3dc';   // (Molly's pink, to go with her collar)
      const col = (x, y, z) => (Math.floor((z - zCut) / 0.055) % 2 ? stripe : base);
      const src = dog.barrel.geometry.index ? dog.barrel.geometry.toNonIndexed() : dog.barrel.geometry.clone();
      const P = src.attributes.position, N = src.attributes.normal, pos = [], nrm = [], edge = [];
      const v = (i) => [P.getX(i), P.getY(i), P.getZ(i), N.getX(i), N.getY(i), N.getZ(i)];
      for (let i = 0; i < P.count; i += 3) {
        const tri = [v(i), v(i + 1), v(i + 2)], poly = [];
        for (let k = 0; k < 3; k++) {
          const a = tri[k], b = tri[(k + 1) % 3], ia = a[2] >= zCut, ib = b[2] >= zCut;
          if (ia) poly.push(a);
          if (ia !== ib) { const t = (zCut - a[2]) / (b[2] - a[2]); const q = a.map((c, j) => c + (b[j] - c) * t); q[2] = zCut; poly.push(q); edge.push(q); }
        }
        for (let k = 1; k + 1 < poly.length; k++) for (const q of [poly[0], poly[k], poly[k + 1]]) {
          const nl = Math.hypot(q[3], q[4], q[5]) || 1, nx = q[3] / nl, ny = q[4] / nl, nz = q[5] / nl;
          pos.push(q[0] + nx * THICK, q[1] + ny * THICK, q[2] + nz * THICK); nrm.push(nx, ny, nz);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      const parts = [paint(g, col)];
      if (edge.length) {   // the hem: a ribbed ring fitted to the cut's outline
        let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
        for (const q of edge) { const nl = Math.hypot(q[3], q[4], q[5]) || 1, x = q[0] + q[3] / nl * THICK, y = q[1] + q[4] / nl * THICK; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        const hem = new THREE.TorusGeometry(1, 0.015, 7, 30);
        hem.scale((maxX - minX) / 2 + 0.002, (maxY - minY) / 2 + 0.002, 1); hem.translate((minX + maxX) / 2, (minY + maxY) / 2, zCut + 0.004);
        parts.push(paint(hem, stripe));
      }
      const m = new THREE.Mesh(joined(parts), VC());
      m.name = 'paws-sweater'; m.visible = false; m.castShadow = true; m.receiveShadow = false;
      dog.barrel.add(m);
      R.sweater.push(m);
      if (dog.collar && dog.collar.skeleton && D.NECK && D.neckR) {   // the turtleneck
        const curve = new THREE.CatmullRomCurve3(D.NECK.map(([y, z]) => new THREE.Vector3(0, y, z)), false, 'centripetal');
        const t = 0.1, p = curve.getPointAt(t), T = curve.getTangentAt(t).normalize();
        const f = t * (D.neckR.length - 1), k = Math.floor(f), u = f - k, rr = D.neckR[k] + (D.neckR[k + 1] - D.neckR[k]) * u;
        const ring = new THREE.TorusGeometry(rr * 1.06 * (1 + (look.points ? (look.fluff || 0) * 0.18 : 0)) + 0.012, 0.016, 7, 26);   // (round Molly's ruff)
        ring.scale(1, 1, 1.5);
        ring.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), T));
        ring.translate(p.x, p.y, p.z);
        paint(ring, stripe);
        const n = ring.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) { si[i * 4 + 1] = 1; si[i * 4 + 2] = 2; si[i * 4 + 3] = 3; sw[i * 4] = 1; }
        ring.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); ring.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
        const rm = new THREE.SkinnedMesh(ring, VC());
        rm.frustumCulled = false; rm.name = 'paws-sweater-neck'; rm.visible = false; rm.castShadow = true; rm.receiveShadow = false;
        dog.body.add(rm);
        rm.bind(dog.collar.skeleton, dog.collar.bindMatrix);
        R.sweater.push(rm);
      }
    }
    return R;
  }
  for (const id of DOGS) if (dogs[id]) { try { dogs[id].rewards = buildRewards(dogs[id]); } catch (e) { console.error('[paws] rewards for', id, e); } }

  // what the clock says: night (the glow) and the holiday (the headband), looked up every half second or so
  function clock() {
    const ms = net.serverNow();
    S.night = dayPhase(ms).night > 0.5;
    let mo, d;
    if (S.day) { const q = S.day.split('-'); mo = +q[1]; d = +q[2]; } else { const p = easternParts(ms); mo = p.mo; d = p.d; }
    S.season = seasonOf(mo, d);
  }
  const applied = { nala: '', dax: '', molly: '' };
  function applyRewards(force) {
    for (const id of DOGS) {
      const e = dogs[id]; if (!e || !e.rewards) continue;
      const lvl = S.on[id] != null ? S.on[id] : S.dogs[id] ? S.dogs[id].lvl : 0;   // (out walking: the walker's level, for everyone)
      const key = lvl + '|' + (S.night ? 1 : 0) + '|' + (S.season || '');
      if (!force && key === applied[id]) continue;
      applied[id] = key;
      const R = e.rewards;
      for (const m of R.glow) m.visible = lvl >= 2 && S.night;
      for (const [k, m] of Object.entries(R.bands)) m.visible = lvl >= 3 && S.season === k;
      for (const m of R.sweater) m.visible = lvl >= 4;
      if (e.dog.gear) e.dog.gear.visible = lvl < 4;   // (Molly's shaggy tufts and harness go under her sweater)
    }
  }
  clock(); applyRewards(true);

  // ---------------------------------------------------------------- the sign by the toy basket
  const SIGN_WORDS = ['Best friends', 'Dax, Nala and Molly have affection levels!', 'Gratz!', 'A glowing collar', 'Holiday headbands', 'A cosy sweater', 'A big Gratz!', 'Make friends with them and see.'];
  const SIGN_SHORT = ['A big Gratz!', 'Glowing collar', 'Headbands', 'Cosy sweater'];
  const sign = buildSign();
  function buildSign() {
    const { x, z, yaw } = PAW_SIGN, y = terrainHeight(x, z);
    const g = new THREE.Group(); g.name = 'paws-sign'; g.position.set(x, y, z); g.rotation.y = yaw;
    const wood = toon('#8a6240'), dark = toon('#5a3a22');
    // the post stands behind the board and the words are printed on the front only (a plain wood back), so nothing is ever in
    // front of the face from the lawn
    const W = 1.15, H = 0.86, T = 0.07, face = new THREE.MeshBasicMaterial({ map: signTexture(), fog: true });
    const post = new THREE.Mesh(GEO.box, dark); post.scale.set(0.11, 1.62, 0.11); post.position.set(0, 0.81, -T / 2 - 0.056); g.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), [wood, wood, wood, wood, face, wood]); board.position.set(0, 1.27, 0); g.add(board);
    for (const s of [-1, 1]) { const brace = new THREE.Mesh(GEO.box, wood); brace.scale.set(0.5, 0.05, 0.05); brace.position.set(s * 0.28, 1.27 - H / 2 + 0.05, -T / 2 - 0.026); g.add(brace); }   // (cross braces on the back)
    const topper = new THREE.Mesh(GEO.sphere, toon('#ffd34d')); topper.scale.set(0.07, 0.07, 0.07); topper.position.set(0, 0.81 + 0.81 + 0.06, -T / 2 - 0.056); g.add(topper);
    shadows(g); scene.add(g);
    colliders.push({ type: 'circle', x, z, r: 0.42 });
    return { x, z, yaw, group: g, paws: 4, pictures: ['popup', 'collar', 'headband', 'sweater'], words: SIGN_WORDS.slice() };
  }
  function signTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 384;
    const g = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const ink = '#2b2340';
    const paw = (x, y, s, fill) => {
      g.save(); g.translate(x, y); g.scale(s, s); g.lineWidth = 2.2 / s * 1.6; g.strokeStyle = ink; g.fillStyle = fill || 'rgba(0,0,0,0)';
      g.beginPath(); g.ellipse(0, 4, 6.4, 5, 0, 0, Math.PI * 2); if (fill) g.fill(); g.stroke();
      for (const [tx, ty] of [[-7.4, -2], [-3.4, -6.6], [3.4, -6.6], [7.4, -2]]) { g.beginPath(); g.ellipse(tx, ty, 2.5, 2.9, 0, 0, Math.PI * 2); if (fill) g.fill(); g.stroke(); }
      g.restore();
    };
    const draw = () => {
      // paper, a wood-coloured frame and a doodle border
      g.fillStyle = '#fff8ec'; g.fillRect(0, 0, 512, 384);
      g.strokeStyle = ink; g.lineWidth = 9; g.strokeRect(10, 10, 492, 364);
      g.fillStyle = '#ffd34d'; g.fillRect(14, 14, 484, 70); g.fillStyle = ink; g.fillRect(14, 84, 484, 5);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink;
      g.font = '700 46px "Fredoka", "Trebuchet MS", sans-serif'; g.fillText(SIGN_WORDS[0], 256, 50);
      g.font = '700 22px "Nunito", "Fredoka", sans-serif'; g.fillText(SIGN_WORDS[1], 256, 116, 470);
      // the four paws, empty
      for (let i = 0; i < 4; i++) paw(130 + i * 84, 170, 2.6, i === 0 ? '#ffd34d' : null);
      // the rewards, one picture each with its name under it
      const cx = [80, 197, 315, 432], py = 262;
      // 1. the popup card
      g.save(); g.translate(cx[0], py); g.fillStyle = '#fff'; g.strokeStyle = ink; g.lineWidth = 4; g.beginPath(); g.roundRect(-34, -26, 68, 48, 9); g.fill(); g.stroke();
      g.fillStyle = '#ffd34d'; g.fillRect(-34, -26, 68, 10); g.fillStyle = ink; g.font = '700 22px "Fredoka", sans-serif'; g.fillText(SIGN_WORDS[2], 0, 4);
      for (const [dx, dy, col] of [[-42, -32, '#ff8fb8'], [40, -30, '#8fd0ee'], [-40, 26, '#a8e06b'], [44, 22, '#b48cff'], [0, -38, '#e0463c']]) { g.fillStyle = col; g.beginPath(); g.arc(dx, dy, 4, 0, 7); g.fill(); }
      g.restore();
      // 2. the glowing collar
      g.save(); g.translate(cx[1], py); g.strokeStyle = '#ffd34d'; g.lineWidth = 4;
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 36, Math.sin(a) * 28); g.lineTo(Math.cos(a) * 46, Math.sin(a) * 37); g.stroke(); }
      g.strokeStyle = ink; g.lineWidth = 12; g.beginPath(); g.ellipse(0, 0, 30, 21, 0, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = '#8c5bd6'; g.lineWidth = 7; g.beginPath(); g.ellipse(0, 0, 30, 21, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#d9d9d9'; g.strokeStyle = ink; g.lineWidth = 3; g.beginPath(); g.arc(0, 26, 8, 0, 7); g.fill(); g.stroke();
      g.restore();
      // 3. a headband (with a heart on it)
      g.save(); g.translate(cx[2], py + 6); g.strokeStyle = ink; g.lineWidth = 10; g.beginPath(); g.arc(0, 10, 34, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      g.strokeStyle = '#ff8fb8'; g.lineWidth = 5; g.beginPath(); g.arc(0, 10, 34, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      g.strokeStyle = ink; g.lineWidth = 3; g.beginPath(); g.moveTo(-10, -22); g.lineTo(-14, -40); g.moveTo(10, -22); g.lineTo(14, -40); g.stroke();
      const heartAt = (hx, hy, col) => { g.save(); g.translate(hx, hy); g.fillStyle = col; g.strokeStyle = ink; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 9); g.bezierCurveTo(-12, -2, -8, -12, 0, -6); g.bezierCurveTo(8, -12, 12, -2, 0, 9); g.fill(); g.stroke(); g.restore(); };
      heartAt(-14, -44, '#e0463c'); heartAt(14, -44, '#ff5c8a');
      g.restore();
      // 4. the sweater
      g.save(); g.translate(cx[3], py); g.fillStyle = '#8c5bd6'; g.strokeStyle = ink; g.lineWidth = 4;
      g.beginPath(); g.roundRect(-26, -22, 52, 50, 8); g.fill(); g.stroke();
      g.beginPath(); g.roundRect(-44, -20, 20, 22, 6); g.fill(); g.stroke(); g.beginPath(); g.roundRect(24, -20, 20, 22, 6); g.fill(); g.stroke();
      g.fillStyle = '#fff3dc'; for (const sy of [-8, 8]) g.fillRect(-24, sy, 48, 6); g.fillRect(-42, -10, 16, 5); g.fillRect(26, -10, 16, 5);
      g.strokeStyle = ink; g.lineWidth = 4; g.fillStyle = '#fff3dc'; g.beginPath(); g.roundRect(-14, -30, 28, 12, 5); g.fill(); g.stroke();
      g.restore();
      g.fillStyle = ink; g.font = '700 16px "Nunito", sans-serif';
      for (let i = 0; i < 4; i++) g.fillText(SIGN_SHORT[i], cx[i], 322);
      g.font = '600 15px "Nunito", sans-serif'; g.fillStyle = '#6d6480'; g.fillText(SIGN_WORDS[7], 256, 356);
      tex.needsUpdate = true;
    };
    draw();
    redrawWhenFontsLoad(draw, ['700 46px "Fredoka"', '700 25px "Nunito"']);
    return tex;
  }

  // ---------------------------------------------------------------- per frame
  let frame = 0;
  return {
    name: 'paws',
    update() {
      if ((++frame & 15) === 0) { clock(); applyRewards(false); }
      watchFetch();
    },
    onKey(code) {
      if (!pop) return false;
      if (code === 'Escape' || code === 'Enter' || code === 'Space' || code === 'KeyE') { closePopup(); return true; }
      return false;
    },
    api: {
      get state() { return S; },
      get night() { return S.night; },
      get season() { return S.season; },
      setDay(day) { S.day = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null; clock(); applyRewards(true); },
      popup: id => popup(id || 'nala'),
      get popupOpen() { return !!pop; },
      closePopup,
      sign,
      rewards(id) {
        const e = dogs[id]; if (!e || !e.rewards) return null;
        const R = e.rewards;
        return { glow: R.glow.map(m => m.visible), bands: Object.fromEntries(Object.entries(R.bands).map(([k, m]) => [k, m.visible])), sweater: R.sweater.map(m => m.visible), paws: e.shown, on: S.on[id] };
      },
    },
  };
}
