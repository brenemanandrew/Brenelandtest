// Tess and Rudy's day (kids-roam.js, patch_kids_roam.py), checked in the built test game:
//   node kids_roam_test.cjs PORT        (a test game served by testserver.py on PORT; NODE_PATH=$(npm root -g) for playwright)
// Two pages load the game. On the first the kids' schedule is walked over the next 24 hours of the real clock, every 0.5 s:
// every kid place visible must be off the tar (except on a zebra crossing), out of every collider (a 0.18 m margin; open gates
// and other floors aside), out of the water and out of the house, never more than 3 m from where it was half a second before,
// and the kids never inside each other. The same is done for six hours on a page with the clock pinned (?hour=14, the
// back-to-back plans). Both pages must give the same answer for the same shared time. No console errors.
const { chromium } = require('playwright');
const port = process.argv[2] || 8841;
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

async function open(br, q) {
  const p = await br.newPage({ viewport: { width: 400, height: 300 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(`http://localhost:${port}/?preview&q=low${q}`, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction(() => document.querySelector('#loading')?.hidden, null, { timeout: 480000 });
  return { p, errs };
}

const SIM = async ({ t0, hours, step }) => {
  const B = window.breneland, K = B.features.find(f => f.name === 'kids-roam').api;
  const T = await import('/js/terrain.js'), L = await import('/js/layout.js');
  const cols = B.ctx.colliders.filter(c => !c.gate && !c.moves && !(c.minY > 0.3));
  const CROSS = [...L.CROSSINGS.map(c => [c.x, c.z])];
  const bad = [], stats = { samples: 0, shown: 0, games: {}, spots: {}, days: new Set(), maxJump: 0, minApart: 9 };
  const G = new Map(), C = 4, big = [];   // the colliders in 4 m cells (a huge one is checked everywhere)
  for (const c of cols) {
    const x0 = c.type === 'circle' ? c.x - c.r : c.minX, x1 = c.type === 'circle' ? c.x + c.r : c.maxX, z0 = c.type === 'circle' ? c.z - c.r : c.minZ, z1 = c.type === 'circle' ? c.z + c.r : c.maxZ;
    if (!Number.isFinite(x0 + x1 + z0 + z1) || (x1 - x0) * (z1 - z0) > 4000) { big.push(c); continue; }
    for (let i = Math.floor((x0 - 1) / C); i <= Math.floor((x1 + 1) / C); i++) for (let j = Math.floor((z0 - 1) / C); j <= Math.floor((z1 + 1) / C); j++) { const k = i + ',' + j; if (!G.has(k)) G.set(k, []); G.get(k).push(c); }
  }
  const hit = (c, x, z, m) => !c.off && (c.type === 'circle' ? Math.hypot(x - c.x, z - c.z) < c.r + m : x > c.minX - m && x < c.maxX + m && z > c.minZ - m && z < c.maxZ + m);
  const inCol = (x, z, m) => (G.get(Math.floor(x / C) + ',' + Math.floor(z / C)) || []).some(c => hit(c, x, z, m)) || big.some(c => hit(c, x, z, m));
  const why = (x, z) => {
    if (T.roadEdgeDist(x, z) < 0 && !CROSS.some(([cx, cz]) => Math.abs(x - cx) < 2.2 && Math.abs(z - cz) < 7)) return 'road';
    if (inCol(x, z, 0.18)) return 'collider';
    if (T.coastSigned(x, z) > -0.2 && !T.onSurface(x, z)) return 'water';
    if (L.inHouseBox(x, z, 0.2)) return 'house';
    return null;
  };
  let prev = null;
  for (let t = t0; t < t0 + hours * 3600; t += step) {
    const s = K.stateAt(t); stats.samples++;
    if (s.hidden) { prev = null; continue; }
    stats.shown++;
    const key = s.seg.kind === 'play' ? s.seg.g.kind + '@' + s.seg.spot.id : 'walk';
    stats.games[key] = (stats.games[key] || 0) + step;
    for (const [n, q] of [['Tess', s.A], ['Rudy', s.B]]) { const w = why(q[0], q[1]); if (w && bad.length < 40) bad.push({ t, n, w, x: +q[0].toFixed(2), z: +q[1].toFixed(2), at: key }); }
    const apart = Math.hypot(s.A[0] - s.B[0], s.A[1] - s.B[1]); stats.minApart = Math.min(stats.minApart, apart);
    if (apart < 0.3 && bad.length < 40) bad.push({ t, w: 'overlap', apart, at: key });
    if (prev) for (const i of [0, 1]) { const a = i ? s.B : s.A, b = i ? prev.B : prev.A, j = Math.hypot(a[0] - b[0], a[1] - b[1]); stats.maxJump = Math.max(stats.maxJump, j); if (j > 3 && bad.length < 40) bad.push({ t, w: 'jump', j, at: key }); }
    prev = s;
  }
  stats.days = undefined;
  for (const k in stats.games) stats.games[k] = Math.round(stats.games[k] / 60) + ' min';
  return { bad, stats };
};

(async () => {
  const br = await chromium.launch({ args: ARGS });
  const A = await open(br, '');   // (one page at a time: swiftshader is slow, and a page loading beside a running one times out)
  let fail = 0;
  const now = Math.floor(await A.p.evaluate(() => window.breneland.net.serverNow() / 1000));
  const t0 = now - (now % 60);
  const real = await A.p.evaluate(SIM, { t0, hours: 24, step: 0.5 });
  console.log('real clock, 24 h from', new Date(t0 * 1000).toISOString(), JSON.stringify(real.stats, null, 1));
  if (real.bad.length) { fail++; console.log('PROBLEMS', JSON.stringify(real.bad, null, 1)); }
  if (real.stats.shown === 0) { fail++; console.log('the kids never came out'); }
  // the same shared time on two pages: the same kids, the same ball, the same rope
  const probe = ts => window.breneland.features.find(f => f.name === 'kids-roam').api && ts.map(t => { const s = window.breneland.features.find(f => f.name === 'kids-roam').api.stateAt(t); return s.hidden ? 'hidden' : JSON.stringify([s.A, s.B, s.ball || null, s.rope || null, s.line?.key || null]); });
  const ts = Array.from({ length: 400 }, (_, i) => t0 + i * 217.3);
  const ra = await A.p.evaluate(probe, ts); await A.p.close();
  const Bp = await open(br, ''); const rb = await Bp.p.evaluate(probe, ts); await Bp.p.close();
  const diff = ra.filter((x, i) => x !== rb[i]).length;
  console.log('two pages, 400 shared times:', diff ? diff + ' DIFFER' : 'all the same', '(' + ra.filter(x => x !== 'hidden').length + ' with the kids out)');
  if (diff) fail++;
  // pinned clock (?hour=14): back-to-back day plans
  const P = await open(br, '&hour=14');
  const pin = await P.p.evaluate(SIM, { t0, hours: 6, step: 0.5 }); await P.p.close();
  console.log('pinned 14:00, 6 h', JSON.stringify(pin.stats, null, 1));
  if (pin.bad.length) { fail++; console.log('PROBLEMS (pinned)', JSON.stringify(pin.bad, null, 1)); }
  for (const [n, x] of [['page A', A], ['page B', Bp], ['pinned page', P]]) if (x.errs.length) { fail++; console.log(n, 'console errors', x.errs.slice(0, 10)); }
  console.log(fail ? 'FAIL' : 'PASS');
  await br.close();
  process.exit(fail ? 1 : 0);
})();
