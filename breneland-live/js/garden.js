// The Community Garden: help Joyce with her daily jobs. Each finished job pays a fish (ctx.reward('garden'), the server caps it at
// 6 a day). The day's jobs are picked from a pool by the Eastern calendar day (hash01), so everyone gets the same list. Your
// progress is yours (localStorage per day). Joyce herself is the garden's NPC (areas.js PLACEHOLDERS.garden), garden-build.js
// builds the block (beds, paths, shed, butt...), and this adds the things to do, what they change in the garden, their glow, and
// Joyce's chalkboard.
//
// Each job has its own place (PLAN in garden-build.js), and the item you can use next glows (a soft cel-shaded rim, see the glow
// below). The game works when Joyce is away, at twice the work for the same fish: every step takes two goes (a weed needs two
// tugs, a bed two cans...) and the compost six turns, not three. Progress counts half-steps ("units", two per item), and with
// Joyce in a go is worth two.
import * as THREE from 'three';
import { hash01, el, loadCss } from './util.js';
import { terrainHeight } from './terrain.js';
import { toon, LAYER_SOFT } from './toon.js';
import { GEO } from './batch.js';
import { REGIONS, gardenBlock, gardenSpot } from './layout.js';
import { PLAN, BED } from './garden-build.js';

const KEY = 'breneland.garden';
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private window */ } },
};
const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayOf = ms => DAY_FMT.format(ms); // one formatter: building one each frame cost ~0.2 ms a frame
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// The pool. Each job: how many things to do, the words for it, and (away) what the first of the two goes is called.
const POOL = [
  { id: 'water', name: 'Water the beds', need: 4, hint: 'Water this bed', half: 'one more can', done: 'The beds are watered.' },
  { id: 'weeds', name: 'Pull the weeds', need: 6, hint: 'Pull the weed', half: "it's stubborn, tug again", done: 'All the weeds are pulled.' },
  { id: 'pick', name: 'Pick the ripe vegetables', need: 5, hint: 'Pick it', half: 'nearly loose', done: 'The basket is full.' },
  { id: 'seeds', name: 'Plant a row of seeds', need: 4, hint: 'Plant seeds here', half: 'dig the hole first', done: 'A new row is planted.' },
  { id: 'birds', name: 'Fill the bird feeder', need: 1, hint: 'Fill the feeder', half: 'one more scoop', done: 'The birds will be pleased.' },
  { id: 'compost', name: 'Turn the compost', need: 3, hint: 'Turn the compost', done: 'The compost is turned.' },
  { id: 'crows', name: 'Shoo the crows off the lettuce', need: 3, hint: 'Shoo!', half: 'it came back', done: 'The crows have gone.' },
];
const JOBS_PER_DAY = 4;
const AWAY_LINE = "Joyce isn't in, so every job takes twice the work. Same fish!";

export function createGarden(ctx) {
  const { scene, player, areas, audio, ui, net, npcs } = ctx;
  const area = areas.find(a => a.id === 'garden');
  if (!area) return null;
  loadCss('/css/garden.css');
  const gx = area.x, gz = area.z, R = gardenBlock(area), chair = gardenSpot(area, 'chair');
  REGIONS.unshift({ name: area.slot.name, minX: R.minX, maxX: R.maxX, minZ: R.minZ, maxZ: R.maxZ }); // the place pill, end to end
  ctx.world.addTrailStop?.({ minX: R.minX, maxX: R.maxX, minZ: R.minZ, maxZ: R.maxZ }); // no trail draws into the block, the garden has its own paths
  const W = p => [gx + p.u, gz + p.v];
  const bedAt = id => { const [x, z] = W(PLAN.beds[id]); return { x, z, y: terrainHeight(x, z), top: terrainHeight(x, z) + BED.top }; };
  const group = new THREE.Group(); group.name = 'garden-jobs'; scene.add(group);

  // ---- props that the jobs use
  const mk = (geo, col, x, y, z, sx = 1, sy = 1, sz = 1, parent = group) => { const m = new THREE.Mesh(geo, typeof col === 'string' ? toon(col) : col); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m; };
  // water: the four beds of rows B and C (beside the water butt); the wet soil darkens half a bed per can when Joyce is away
  const waterBeds = ['carrots', 'strawberries', 'tomatoes', 'pumpkins'].map(bedAt);
  const wet = waterBeds.map(b => { const m = mk(GEO.box, toon('#33200f', { polygonOffset: true }), b.x, b.top + 0.006, b.z, BED.w, 0.02, BED.d); m.visible = false; return m; });
  // weeds: three in the carrots, three in the strawberries; a yellow flower on top so you can spot them
  const weeds = [];
  { const c = bedAt('carrots'), s = bedAt('strawberries');
    const spots = [[c, -0.55, -0.33], [c, 0.55, 0.33], [c, 1.25, 0], [s, -0.83, 0], [s, 0.28, 0], [s, 1.25, -0.33]];
    for (const [b, ox, oz] of spots) {
      const g = new THREE.Group(); g.position.set(b.x + ox, b.top, b.z + oz); group.add(g);
      mk(GEO.cone6, '#6f9a3a', 0, 0.17, 0, 0.12, 0.4, 0.12, g); const m2 = mk(GEO.cone6, '#8ab54a', 0.07, 0.13, -0.04, 0.1, 0.32, 0.1, g); m2.rotation.z = 0.55;
      mk(GEO.ico1, '#5f8a30', -0.06, 0.06, 0.05, 0.12, 0.06, 0.1, g); mk(GEO.sphere, '#ffd34d', 0.02, 0.4, 0, 0.06, 0.04, 0.06, g);
      const root = mk(GEO.cyl6, '#c9a26b', 0, -0.04, 0, 0.03, 0.12, 0.03, g); root.visible = false;
      weeds.push({ x: g.position.x, z: g.position.z, g, root });
    }
  }
  // ripe vegetables: three tomatoes on the stakes, two small squashes in the pumpkin patch
  const veg = [];
  { const t = bedAt('tomatoes'), p = bedAt('pumpkins');
    const spots = [[t, -1.1, 0.12, 0.72, '#e8483c', 0.11], [t, 0.0, 0.14, 0.86, '#e8483c', 0.11], [t, 1.1, 0.12, 0.66, '#ff6a3a', 0.11], [p, -0.2, 0.25, 0.14, '#ff9f2a', 0.15], [p, 0.45, -0.05, 0.14, '#ffc23a', 0.14]];
    for (const [b, ox, oz, oy, col, r] of spots) {
      const m = mk(GEO.sphere, toon(col, { emissive: col, emissiveIntensity: 0.3 }), b.x + ox, b.top + oy, b.z + oz, r, r * 0.92, r);
      veg.push({ x: m.position.x, z: m.position.z, y: m.position.y, r, m });
    }
  }
  // seeds: four mounds along the tilled bed's ridges (a hole when dug, a sprout when sown)
  const seedSpots = [0, 1, 2, 3].map(i => { const b = bedAt('tilled'), sx = b.x - 1.05 + i * 0.62, sz = b.z;
    const sprout = mk(GEO.cone6, '#58a348', sx, b.top + 0.1, sz, 0.07, 0.2, 0.07); sprout.visible = false;
    const hole = mk(GEO.cyl8, toon('#24160b', { polygonOffset: true }), sx, b.top + 0.045, sz, 0.11, 0.01, 0.09); hole.visible = false;
    return { x: sx, z: sz, y: b.top, m: sprout, hole, mound: mk(GEO.sphere, '#5a3c26', sx, b.top + 0.02, sz, 0.18, 0.06, 0.13) }; });
  // the bird feeder on its post, by the gate (the seed sack is garden-build.js's)
  const [fx, fz] = W(PLAN.feeder), fy = terrainHeight(fx, fz);
  mk(GEO.cyl8, '#8a6240', fx, fy + 0.9, fz, 0.05, 1.8, 0.05); mk(GEO.box, '#c9a26b', fx, fy + 1.85, fz, 0.42, 0.28, 0.42); mk(GEO.box, '#c94f4f', fx, fy + 2.05, fz, 0.58, 0.06, 0.58);
  mk(GEO.box, '#8a6240', fx, fy + 1.7, fz, 0.6, 0.03, 0.6); // the tray round it
  const seedPile = mk(GEO.box, '#e8c97a', fx, fy + 1.74, fz, 0.5, 0.04, 0.5); seedPile.visible = false;
  ctx.colliders.push({ type: 'circle', x: fx, z: fz, r: 0.22 });
  // the compost heap in the first bay (it turns when you turn it; garden-build.js builds the slatted bays)
  const [cpx, cpz] = W(PLAN.compost), cpy = terrainHeight(cpx, cpz);
  const compostTop = mk(GEO.ico1, '#4a3a2a', cpx, cpy + 0.62, cpz, 0.5, 0.34, 0.5);
  mk(GEO.cone6, '#8ab54a', cpx + 0.2, cpy + 0.95, cpz - 0.1, 0.05, 0.14, 0.05, compostTop.parent); mk(GEO.sphere, '#e8483c', cpx - 0.2, cpy + 0.9, cpz + 0.15, 0.05, 0.05, 0.05);
  // crows on the lettuce (row A, west)
  const lb = bedAt('lettuce');
  const crowHome = i => [lb.x - 0.9 + i * 0.9, lb.top + 0.12, lb.z + (i % 2 ? 0.32 : -0.32)];
  const crows = [0, 1, 2].map(i => { const c = new THREE.Group(); mk(GEO.sphere, '#1e1a1e', 0, 0.12, 0, 0.14, 0.11, 0.2, c); mk(GEO.sphere, '#1e1a1e', 0, 0.24, 0.15, 0.08, 0.08, 0.08, c); const beak = mk(GEO.cone6, '#3a3a3a', 0, 0.23, 0.24, 0.03, 0.08, 0.03, c); beak.rotation.x = Math.PI / 2; c.position.set(...crowHome(i)); c.rotation.y = i * 2; c.visible = false; group.add(c); return { c, flying: 0, hop: 0 }; });

  // ---- the glow: a soft cel-shaded rim round the item you can use next (an inverted hull: back faces only, a little
  // larger than the item, drawn in colour but never inked), two bands, pulsing gently (steady with reduced motion)
  const glowMat = (col, op, add) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col), side: THREE.BackSide, transparent: true, opacity: op, depthWrite: false, fog: true,
    blending: add ? THREE.AdditiveBlending : THREE.CustomBlending });
    if (!add) { m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor; } // keeps the ink pass's alpha
    return m; };
  const GLOW_IN = glowMat('#ffe14d', 0.8, false), GLOW_OUT = glowMat('#fff2a8', 0.32, true);
  const glows = {};
  // (x, y, z) = the hull's foot: every band's bottom sits there, just off the ground, so the rim shows on the near side too
  // (a hull sunk into the ground only lit up behind the thing); h = the unit geometry's half height (box 0.5, sphere 1)
  const hull = (id, geo, h, x, y, z, sx, sy, sz, pad = 0.06) => {
    const g = new THREE.Group(); g.name = 'garden-glow-' + id; g.position.set(x, y, z); g.visible = false;
    for (const [mat, k] of [[GLOW_IN, 1], [GLOW_OUT, 2.6]]) {
      const m = new THREE.Mesh(geo, mat); m.scale.set(sx + pad * k, sy + pad * k, sz + pad * k); m.position.y = (sy + pad * k) * h;
      m.layers.set(LAYER_SOFT); m.userData.noMerge = true; m.castShadow = m.receiveShadow = false; m.renderOrder = 2; g.add(m);
    }
    group.add(g); glows[id] = g; return g;
  };
  hull('water', GEO.box, 0.5, 0, 0, 0, BED.w + 0.32, 0.44, BED.d + 0.24, 0.14);
  hull('weeds', GEO.sphere, 1, 0, 0, 0, 0.2, 0.25, 0.2, 0.08);
  hull('pick', GEO.sphere, 1, 0, 0, 0, 0.15, 0.14, 0.15, 0.07);
  hull('seeds', GEO.sphere, 1, 0, 0, 0, 0.2, 0.07, 0.15, 0.07);
  hull('birds', GEO.box, 0.5, fx, fy + 1.62, fz, 0.62, 0.5, 0.62, 0.1);
  hull('compost', GEO.box, 0.5, cpx, cpy + 0.03, cpz, 1.26, 0.96, 1.26, 0.12);
  hull('crows', GEO.sphere, 1, 0, 0, 0, 0.17, 0.15, 0.24, 0.07);

  // ---- today's jobs and progress (n = units: two per item; a go is worth two with Joyce in, one when she is away)
  let day = '', jobs = [], prog = null, today = [];
  function loadDay() {
    const d = dayOf(net.serverNow());
    if (d === day) return;
    day = d;
    const picked = [];
    for (let i = 0; i < 40 && picked.length < JOBS_PER_DAY; i++) { const j = POOL[Math.floor(hash01('garden', d, i) * POOL.length)]; if (!picked.includes(j)) picked.push(j); }
    jobs = picked; today = picked.map(j => j.id);
    prog = store.get();
    if (!prog || prog.day !== d) prog = { day: d, done: {}, n: {}, v: 2 };
    if (prog.v !== 2) { for (const k of Object.keys(prog.n)) prog.n[k] *= 2; prog.v = 2; } // saved before the units, so whole items
    for (const j of jobs) if (!prog.n[j.id]) prog.n[j.id] = 0;
    apply();
  }
  const has = id => jobs.some(j => j.id === id);
  const n = id => prog.n[id] | 0;
  const item = id => Math.floor(n(id) / 2), half = id => n(id) % 2 === 1;
  const units = job => job.need * 2;
  // what the list shows: whole items with Joyce in; the units of work (twice as many) while she is away
  const count = job => (awayNow ? [n(job.id), units(job)] : [item(job.id), job.need]);

  // Is Joyce in? Her shared-clock state (npcs.js: the same on every client) puts her inside the block, not hidden. Whatever moves her,
  // this reads where she is. api.away forces it for tests.
  const joyce = () => npcs.npcs.find(d => d.name === 'Joyce');
  function joyceIn() {
    if (api.away != null) return !api.away;
    const d = joyce(), s = d && (d._s || null);
    if (!d || !s || s.hidden) return false;
    if (s.joyce && s.joyce.mode !== 'garden') return false; // joyce-day.js: her garden hours, not sat in the cart on its pad, not passing
    return s.x > R.minX - 1.5 && s.x < R.maxX + 1.5 && s.z > R.minZ - 1.5 && s.z < R.maxZ + 1.5;
  }
  let awayNow = false;

  function apply() {
    const W2 = BED.w / 2;
    wet.forEach((m, i) => { const full = has('water') && i < item('water'), part = has('water') && i === item('water') && half('water'); m.visible = full || part; m.scale.x = part ? W2 : BED.w; m.position.x = waterBeds[i].x - (part ? W2 / 2 : 0); }); // (half a bed per can while Joyce is away)
    weeds.forEach((w, i) => { const v = has('weeds') && i >= item('weeds'), loose = i === item('weeds') && half('weeds'); w.g.visible = v; w.g.rotation.z = loose ? 0.55 : 0; w.g.position.y = terrainHeight(w.x, w.z) + BED.top + (loose ? 0.07 : 0); w.root.visible = loose; });
    veg.forEach((v, i) => { v.m.visible = has('pick') && i >= item('pick'); v.loose = i === item('pick') && half('pick'); v.m.rotation.z = v.loose ? 0.6 : 0; });
    seedSpots.forEach((s, i) => { s.m.visible = has('seeds') && i < item('seeds'); s.hole.visible = has('seeds') && i === item('seeds') && half('seeds'); s.mound.visible = has('seeds') && !s.hole.visible; });
    seedPile.visible = has('birds') && n('birds') > 0; seedPile.scale.y = item('birds') > 0 || prog.done.birds ? 0.04 : 0.02; seedPile.position.y = fy + 1.73 + seedPile.scale.y / 2;
    crows.forEach((c, i) => { c.c.visible = has('crows') && (i >= item('crows') || c.flying > 0); }); // a shooed crow stays drawn while it flies off
    hud();
  }

  // ---- HUD list
  const card = el('div', 'garden-card', '', { hidden: '' });
  const title = el('div', 'garden-title', "Joyce's jobs today");
  const list = el('ul', 'garden-list');
  const note = el('div', 'garden-note', '');
  card.append(title, list, note);
  ctx.hud.append(card);
  let showUntil = 0;
  function hud() {
    list.replaceChildren();
    for (const j of jobs) {
      const [a, t] = count(j);
      list.append(el('li', prog.done[j.id] ? 'done' : '', `${j.name}${t > 1 && !prog.done[j.id] ? ` (${a}/${t})` : ''}`));
    }
    note.textContent = awayNow ? AWAY_LINE : '';
    note.hidden = !awayNow;
    paintBoard();
  }

  // ---- Joyce's chalkboard at the head of the aisle: today's jobs, ticked off as you go, and whether she is in
  const boardCanvas = document.createElement('canvas'); boardCanvas.width = 256; boardCanvas.height = 320;
  const boardTex = new THREE.CanvasTexture(boardCanvas); boardTex.colorSpace = THREE.SRGBColorSpace; boardTex.anisotropy = 4;
  { const [bx, bz] = W(PLAN.board), by = terrainHeight(bx, bz);
    const easel = new THREE.Group(); easel.position.set(bx, by, bz); easel.rotation.y = PLAN.board.yaw || 0; easel.name = 'garden-board';
    const wood = toon('#8a5a30'), face = new THREE.MeshBasicMaterial({ map: boardTex, fog: true });
    const slate = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.08, 0.05), [wood, wood, wood, wood, face, wood]); slate.position.set(0, 1.12, 0); slate.rotation.x = -0.12; easel.add(slate);
    for (const s of [-1, 1]) { const leg = new THREE.Mesh(GEO.box, wood); leg.scale.set(0.06, 1.7, 0.06); leg.position.set(s * 0.4, 0.82, -0.07); leg.rotation.x = -0.12; easel.add(leg); }
    const back = new THREE.Mesh(GEO.box, wood); back.scale.set(0.06, 1.6, 0.06); back.position.set(0, 0.76, -0.38); back.rotation.x = 0.35; easel.add(back);
    const tray = new THREE.Mesh(GEO.box, wood); tray.scale.set(0.9, 0.04, 0.1); tray.position.set(0, 0.5, 0.1); easel.add(tray);
    const chalk = new THREE.Mesh(GEO.box, toon('#fff8e8')); chalk.scale.set(0.08, 0.02, 0.02); chalk.position.set(0.2, 0.53, 0.1); easel.add(chalk);
    easel.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(easel);
    ctx.colliders.push({ type: 'circle', x: bx, z: bz, r: 0.45 }); }
  let boardKey = '';
  function paintBoard() {
    const key = jobs.map(j => j.id + (prog.done[j.id] ? '+' : '')).join(',') + '|' + awayNow;
    if (key === boardKey) return;
    boardKey = key;
    const g = boardCanvas.getContext('2d');
    g.fillStyle = '#2f3b34'; g.fillRect(0, 0, 256, 320);
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(10 + i * 30, 300); g.lineTo(40 + i * 25, 40); g.stroke(); } // old chalk smudges
    g.fillStyle = '#fdf6e3'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 30px "Fredoka", "Trebuchet MS", sans-serif'; g.fillText("Today's jobs", 128, 32);
    g.textAlign = 'left'; g.font = '500 19px "Fredoka", "Trebuchet MS", sans-serif';
    jobs.forEach((j, i) => {
      const y = 78 + i * 44;
      g.strokeStyle = '#fdf6e3'; g.lineWidth = 2.5; g.strokeRect(14, y - 10, 18, 18);
      if (prog.done[j.id]) { g.strokeStyle = '#9be070'; g.lineWidth = 4; g.beginPath(); g.moveTo(16, y); g.lineTo(23, y + 7); g.lineTo(36, y - 12); g.stroke(); }
      g.fillStyle = prog.done[j.id] ? 'rgba(253,246,227,0.55)' : '#fdf6e3';
      wrap(g, j.name, 42, y, 204, 20);
    });
    g.textAlign = 'center';
    g.fillStyle = awayNow ? '#ffb3c7' : '#ffe27a'; g.font = '700 19px "Fredoka", "Trebuchet MS", sans-serif';
    if (awayNow) { g.fillText("Joyce isn't in.", 128, 262); g.font = '500 17px "Fredoka", "Trebuchet MS", sans-serif'; g.fillText('Twice the work, same fish!', 128, 290); }
    else { g.fillText('Joyce is in.', 128, 262); g.font = '500 17px "Fredoka", "Trebuchet MS", sans-serif'; g.fillText('Ask her what needs doing!', 128, 290); }
    boardTex.needsUpdate = true;
  }
  const wrap = (g, text, x, y, w, lh) => { const words = text.split(' '); let line = '', yy = y; for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (g.measureText(t).width > w && line) { g.fillText(line, x, yy); line = wd; yy += lh; } else line = t; } g.fillText(line, x, yy); };
  try { document.fonts?.load('700 30px "Fredoka"').then(() => { boardKey = ''; paintBoard(); }, () => {}); } catch { /* no font API */ }

  audio.registerSfx?.('garden-ding', (a, x, y, z) => { const o = a.at(x, y, z, 4); const t = a.ctx.currentTime; a.tone(o, { f: 880, t, d: 0.3, peak: 0.07, verb: 0.3 }); a.tone(o, { f: 1174, t: t + 0.1, d: 0.4, peak: 0.06, verb: 0.3 }); });
  audio.registerSfx?.('rustle', (a, x, y, z) => { const o = a.at(x, y, z, 4); a.burst(o, { dur: 0.22, f: 1800, Q: 0.8, peak: 0.1 }); });
  audio.registerSfx?.('splash-can', (a, x, y, z) => { const o = a.at(x, y, z, 4); a.burst(o, { dur: 0.6, f: 900, Q: 0.6, peak: 0.1, brown: true, attack: 0.1 }); });
  audio.registerSfx?.('caw', (a, x, y, z) => { const o = a.at(x, y, z, 6); const t = a.ctx.currentTime; a.tone(o, { f: 520, glide: 380, t, d: 0.22, peak: 0.09, type: 'sawtooth' }); a.tone(o, { f: 500, glide: 360, t: t + 0.26, d: 0.2, peak: 0.08, type: 'sawtooth' }); });

  function joyceSays(text) { const d = joyce(); if (!d || !joyceIn()) { ui.toast(text, 3500); return; } npcs.say(d, text, 4); }

  function step(job, x, z) {
    const before = n(job.id);
    prog.n[job.id] = before + (awayNow ? 1 : 2 - (before % 2)); // with Joyce in, a go finishes a half-done item too
    audio.play?.(job.id === 'water' ? 'splash-can' : job.id === 'crows' ? 'caw' : 'rustle', x, 0.6, z);
    if (job.id === 'water' || job.id === 'seeds') player.playEmote?.('garden', performance.now() / 1000);
    if (job.id === 'crows') { const c = crows[item('crows') - (half('crows') ? 0 : 1)]; if (c) { if (half('crows')) c.hop = 0.7; else c.flying = 2.5; } }
    if (job.id === 'compost') compostTop.rotation.y += 1;
    if (n(job.id) >= units(job)) {
      prog.done[job.id] = true; store.set(prog); apply();
      joyceSays(job.done + (joyceIn() ? ' Thank you, dear.' : ' Joyce will be pleased.'));
      ctx.reward('garden').then(r => {
        if (r.ok) { ui.toast(`${joyceIn() ? 'Joyce gave you' : 'Joyce left you'} a fish! (${r.left} more today)`, 4000); audio.play?.('garden-ding', gx, 1.5, gz); }
        else if (r.why === 'cap') ui.toast('Joyce has handed out all her fish for today.', 3600);
        else ui.toast('Could not reach Joyce\'s ledger (' + (r.why || 'offline') + ').', 3200);
      });
    } else { store.set(prog); apply(); }
    showUntil = performance.now() / 1000 + 6;
  }

  function talk() {
    if (!joyceIn()) { readBoard(); return; } // she's not in the block: nobody to ask, and nobody speaks from her last spot
    const left = jobs.filter(j => !prog.done[j.id]);
    if (!left.length) joyceSays('Everything is done for today! Come back tomorrow, there is always more to do.');
    else joyceSays(`Could you ${left[0].name.toLowerCase()}? ${left.length > 1 ? `Then there is ${left.length - 1} more thing${left.length > 2 ? 's' : ''} on the list.` : 'That is the last one.'}`);
    showUntil = performance.now() / 1000 + 10;
  }
  function readBoard() {
    const left = jobs.filter(j => !prog.done[j.id]);
    ui.toast(left.length ? `${AWAY_LINE} Next: ${left[0].name.toLowerCase()}.` : "Everything on Joyce's list is done for today!", 4500);
    showUntil = performance.now() / 1000 + 10;
  }

  const inBlock = (x, z, pad = 0) => x > R.minX - pad && x < R.maxX + pad && z > R.minZ - pad && z < R.maxZ + pad;
  let toldAway = -1e9, wasIn = false;
  const api = { away: null, joyceIn: () => joyceIn(), glowing: () => Object.entries(glows).filter(([, g]) => g.visible).map(([id, g]) => ({ id, x: g.position.x, y: g.position.y, z: g.position.z })), units: id => n(id), jobs: () => jobs.map(j => ({ id: j.id, need: j.need, n: n(j.id), done: !!prog.done[j.id] })), reset: () => { prog = { day, done: {}, n: {}, v: 2 }; for (const j of jobs) prog.n[j.id] = 0; store.set(prog); apply(); },
    setJobs: ids => { jobs = ids.map(id => POOL.find(j => j.id === id)).filter(Boolean); api.reset(); }, // pictures and tests: any jobs, fresh. The next day puts the real list back
    plan: PLAN, rect: R, board: () => boardCanvas, today: () => today.slice() };

  // where the next go of each unfinished job is: { x, y, z } of its glow, or null
  function nextOf(job) { // the glow's foot: see hull
    const k = item(job.id);
    if (job.id === 'water') { const b = waterBeds[k]; return b && { x: b.x, y: b.y + 0.03, z: b.z }; }
    if (job.id === 'weeds') { const w = weeds[k]; return w && { x: w.x, y: w.g.position.y + 0.01, z: w.z }; }
    if (job.id === 'pick') { const v = veg[k]; return v && { x: v.x, y: v.y - v.r * 0.95, z: v.z }; }
    if (job.id === 'seeds') { const s = seedSpots[k]; return s && { x: s.x, y: s.y + 0.005, z: s.z }; }
    if (job.id === 'birds') return { x: fx, y: fy + 1.62, z: fz };
    if (job.id === 'compost') return { x: cpx, y: cpy + 0.03, z: cpz };
    if (job.id === 'crows') { const c = crows[k]; return c && c.flying <= 0 && { x: c.c.position.x, y: c.c.position.y - 0.02, z: c.c.position.z }; }
    return null;
  }

  loadDay();
  awayNow = !joyceIn(); apply();
  const feature = {
    name: 'garden', api,
    update(dt, now) {
      loadDay();
      const away = !joyceIn();
      if (away !== awayNow) { awayNow = away; apply(); }
      const near = Math.hypot(player.pos.x - gx, player.pos.z - gz) < 30, inside = inBlock(player.pos.x, player.pos.z, 1);
      if (inside && !wasIn && awayNow && jobs.some(j => !prog.done[j.id]) && now - toldAway > 120) { toldAway = now; ui.toast(AWAY_LINE, 4200); }
      wasIn = inside;
      const show = now < showUntil || (inside && jobs.some(j => !prog.done[j.id]));
      card.hidden = !show;
      if (show) { const left = jobs.filter(j => !prog.done[j.id]); const k = left[0]; const [a, t] = k ? count(k) : [0, 0]; ctx.quests?.set('garden', { title: awayNow ? "Joyce's jobs (Joyce is out)" : "Joyce's jobs", text: k ? `${k.name}${t > 1 ? ` (${a}/${t})` : ''}${left.length > 1 ? `, then ${left.length - 1} more` : ', the last one'}.` : 'All done for today!', progress: (jobs.length - left.length) / jobs.length, done: !k, prio: 3, color: '#7dd36a' }); }
      else ctx.quests?.clear('garden');
      for (const c of crows) {
        if (c.flying > 0) { c.flying -= dt; c.c.position.y += dt * 3; c.c.position.x += dt * 2; c.c.rotation.z = Math.sin(now * 20) * 0.4; if (c.flying <= 0) { c.c.visible = false; c.c.position.set(...crowHome(crows.indexOf(c))); c.c.rotation.z = 0; } }
        else if (c.hop > 0) { c.hop = Math.max(0, c.hop - dt); const f = c.hop / 0.7; c.c.position.y = crowHome(crows.indexOf(c))[1] + Math.sin(f * Math.PI) * 0.7; c.c.rotation.z = Math.sin(now * 20) * 0.3 * f; }
      }
      for (const v of veg) if (v.m.visible) { const s = v.r + Math.sin(now * 3) * v.r * 0.08; v.m.scale.set(s, s * 0.92, s); if (v.loose) v.m.rotation.z = 0.6 + Math.sin(now * 9) * 0.08; }
      // the glow: on the next item of each unfinished job while you are near enough to see the garden
      const pulse = calm() ? 1 : 0.78 + 0.22 * Math.sin(now * 2.6);
      GLOW_IN.opacity = 0.8 * pulse; GLOW_OUT.opacity = 0.32 * pulse;
      for (const id of Object.keys(glows)) {
        const job = near && jobs.find(j => j.id === id && !prog.done[j.id]);
        const at = job ? nextOf(job) : null, g = glows[id];
        if (at) { if (id !== 'birds' && id !== 'compost') g.position.set(at.x, at.y, at.z); if (id === 'crows' || id === 'pick') g.rotation.copy((id === 'crows' ? crows[item('crows')].c : veg[item('pick')].m).rotation); }
        if (!!at !== g.visible) g.visible = !!at;
      }
    },
    target(px, pz) {
      if (!inBlock(px, pz, 0.6)) return null;
      const near = (x, z, r) => Math.hypot(px - x, pz - z) < r;
      const hit = jobAt(px, pz), job = hit && hit.c;
      if (awayNow || !joyceIn()) { // asked live: never "Ask Joyce" while she's home or out, even between two updates
        if (job) return job;
        const [bx, bz] = W(PLAN.board);
        return near(bx, bz, 2.2) || near(gx, gz, 3.6) ? { hint: "E  Read Joyce's chalkboard", prio: 5, run: readBoard } : null;
      }
      // Joyce wanders round the plot: she takes E only when she is nearer than the job item you are standing at
      const d = joyce(), dj = d ? Math.hypot(px - d.body.root.position.x, pz - d.body.root.position.z) : Infinity;
      if (dj < 2.6 && !(hit && hit.d < dj)) return { hint: 'E  Ask Joyce what needs doing', prio: 5, run: talk };
      if (job) return job;
      // anywhere else in the plot: ask Joyce (so the garden never says "a game is coming soon", it is a game)
      if (Math.hypot(px - chair.x, pz - chair.z) > 1.6) return { hint: 'E  Ask Joyce what needs doing', prio: 5, run: talk }; // not by her chair: that E sits you down
      return null;
    },
    help: [[['E'], "do Joyce's garden jobs (a fish each)"]],
  };
  return feature;

  // the next go of an unfinished job within reach of the player: the nearest of them (a weed sits in a bed that may need
  // watering too; the nearer thing wins, a bed counts from its planks).
  function jobAt(px, pz) {
    let best = null, bestD = Infinity;
    const offer = (d, c) => { if (d < bestD) { bestD = d; best = c; } };
    for (const job of jobs) {
      if (prog.done[job.id]) continue;
      const k = item(job.id), h2 = half(job.id);
      const say = () => 'E  ' + job.hint + (awayNow && job.half ? (h2 ? ` (${job.half})` : ' (1 of 2)') : '');
      const at = (x, z, r, edge = 0) => { const d = Math.hypot(px - x, pz - z); return d < r ? d - edge : Infinity; };
      if (job.id === 'water') { const b = waterBeds[k]; if (b) { const e = Math.hypot(Math.max(Math.abs(px - b.x) - 1.55, 0), Math.max(Math.abs(pz - b.z) - 0.86, 0)); if (e < 1.3) offer(e + 0.6, { hint: say(), prio: 5, run: () => step(job, b.x, b.z) }); } } // (from the planks: anywhere along the bed)
      if (job.id === 'weeds') { const w = weeds[k]; if (w) offer(at(w.x, w.z, 1.7), { hint: say(), prio: 5, run: () => step(job, w.x, w.z) }); }
      if (job.id === 'pick') { const v = veg[k]; if (v) offer(at(v.x, v.z, 1.7), { hint: say(), prio: 5, run: () => step(job, v.x, v.z) }); }
      if (job.id === 'seeds') { const s = seedSpots[k]; if (s) offer(at(s.x, s.z, 1.7), { hint: say(), prio: 5, run: () => step(job, s.x, s.z) }); }
      if (job.id === 'birds') offer(at(fx, fz, 1.8), { hint: say(), prio: 5, run: () => step(job, fx, fz) });
      if (job.id === 'compost') { const turn = awayNow ? n('compost') + 1 : item('compost') + 1, of = awayNow ? units(job) : job.need; offer(at(cpx, cpz, 1.9), { hint: `E  ${job.hint} (${turn}/${of})`, prio: 5, run: () => step(job, cpx, cpz) }); } // (the old names shadowed the player's px/pz: the hint showed everywhere)
      if (job.id === 'crows') { const c = crows[k]; if (c && c.flying <= 0) offer(at(c.c.position.x, c.c.position.z, 3, 1), { hint: say(), prio: 5, run: () => step(job, c.c.position.x, c.c.position.z) }); }
    }
    return best && { c: best, d: bestD };
  }
}
