// Names on the mailboxes (Andrew, 2026-11-06: "On mailboxes, maybe put people's names"). Every mailbox in the neighbourhoods
// (Maple Row and Summit Hill: world-town.js TOWN_MAILBOXES; the row across Breneland Rd: world.js STREET_HOUSES) gets a family
// name on both sides of its box, small and hand-lettered on a little cream plate, readable up close. A house where someone we
// know lives says so: the town folk who live there (town-life.js puts them in their houses by the same hash), Mabel (fish-shack.js),
// Buddy and Carol (buddy-day.js), Joyce (joyce-day.js); the rest get a made-up family name (deterministic per house). Kevin's
// old house on Maple Row is an ordinary house now. The Tool Crib's own little mailbox by its door says "Kevin".
// All the plates are one mesh cut from one canvas atlas (one draw call).
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { hash01, mulberry32 } from './util.js';
import { NPCS, TOWN_RESIDENTS } from './npc-looks.js';
import { CAROL_HOME, JOYCE_HOME } from './layout.js';
import { redrawWhenFontsLoad } from './toon.js';

export const FAMILIES = ['Hollister', 'Pemberton', 'Abernathy', 'Whitlock', 'Calloway', 'Fairweather', 'Dunmore', 'Thistlewood', 'Applegate', 'Huckabee',
  'Brightwater', 'Marchbanks', 'Pennywhistle', 'Larkspur', 'Mossgrove', 'Copperfield', 'Bramblewood', 'Fiddlesworth', 'Honeycutt', 'Puddleford'];

// The names for the town's houses (index of TOWN_HOUSES) and the street row's (index of STREET_HOUSES)
export function houseNames(town, street) {
  const tn = town.map(() => []), sn = street.map(() => []);
  // the town folk (town-life.js getRoster: TOWN_HOUSES[floor(hash01('home', name) * length)])
  for (const id of TOWN_RESIDENTS) { const nm = NPCS[id].name; if (town.length) tn[Math.floor(hash01('home', nm) * town.length)].push(nm); }
  const row = town.map((h, i) => [h, i]).filter(([h]) => h.facing === -1);
  if (row.length) {
    tn[row[Math.floor(hash01('home', 'Mabel') * row.length)][1]].push('Mabel');                         // (fish-shack.js)
    const bc = row.slice().sort((a, b) => Math.abs(a[0].x - CAROL_HOME.x) - Math.abs(b[0].x - CAROL_HOME.x))[0];   // (buddy-day.js homeOf)
    tn[bc[1]].push('Buddy & Carol');
  }
  street.forEach((h, i) => { if (Math.abs(h.x - JOYCE_HOME.x) < 1) sn[i].push('Joyce'); });
  // the rest: a family name each, none twice
  const rnd = mulberry32(4242), fam = FAMILIES.slice();
  for (let i = fam.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [fam[i], fam[j]] = [fam[j], fam[i]]; }
  let f = 0;
  const finish = list => list.map(names => (names.length ? names.join(' & ') : 'The ' + fam[f++ % fam.length] + 's'));
  return { town: finish(tn), street: finish(sn) };
}

// The plates: [{ x, y, z, nx, nz, name, w? }] (a point on the box's face and the way it faces) -> one mesh
export function buildNamePlates(parent, plates) {
  const names = [...new Set(plates.map(p => p.name))];
  const ROW = 64, W = 512, c = document.createElement('canvas');
  c.width = W; c.height = Math.max(64, 2 ** Math.ceil(Math.log2(names.length * ROW)));
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const draw = () => {
    names.forEach((nm, i) => {
      const y = i * ROW;
      g.fillStyle = '#f2e6c8'; g.fillRect(0, y, W, ROW);
      g.strokeStyle = '#5a3c26'; g.lineWidth = 3; g.strokeRect(3, y + 3, W - 6, ROW - 6);
      g.fillStyle = '#2b2340'; g.textAlign = 'center'; g.textBaseline = 'middle';
      let size = 32; const set = () => { g.font = `600 ${size}px "Fredoka", "Trebuchet MS", sans-serif`; };
      set(); while (g.measureText(nm).width > W - 28 && size > 14) { size -= 2; set(); }
      g.save(); g.translate(W / 2, y + ROW / 2 + 1); g.rotate(((i * 37) % 5 - 2) * 0.006); g.fillText(nm, 0, 0); g.restore(); // (a little hand-lettered wobble)
    });
    tex.needsUpdate = true;
  };
  draw(); redrawWhenFontsLoad(draw, ['600 32px "Fredoka"']);
  const geos = [];
  for (const p of plates) {
    const i = names.indexOf(p.name), w = p.w || 0.48, h = w * ROW / W;
    const q = new THREE.PlaneGeometry(w, h), uv = q.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) * ROW / c.height);
    q.rotateY(Math.atan2(p.nx, p.nz)); q.translate(p.x + p.nx * 0.004, p.y, p.z + p.nz * 0.004);
    geos.push(q);
  }
  const m = new THREE.Mesh(mergeGeometries(geos, false), new THREE.MeshBasicMaterial({ map: tex, fog: true }));
  geos.forEach(q => q.dispose());
  m.name = 'mailbox-names'; m.matrixAutoUpdate = false; m.updateMatrix(); parent.add(m);
  return { mesh: m, names, canvas: c };
}
