// Headless checks for mesh cloth (public/meshcloth.js), as listed in the mesh cloth spec.
//   node tools/meshcloth-test.cjs <site> <cookie jar> <out dir>
// The site needs her 3D model with a skirt, and visits allowed (a local server with VISIT_TEST=1 VISIT_TEST_ANSWER=yes).
// Runs twice, mesh cloth off then on, at PC size, plus the pictures again at phone size. Writes PNGs and results.json to <out dir>.
const { chromium } = require('playwright'); const fs = require('fs');
const [SITE, JAR, OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const cookies = fs.readFileSync(JAR, 'utf8').split('\n').filter(l => l && (!l.startsWith('#') || l.startsWith('#HttpOnly_'))).map(l => { const f = l.replace(/^#HttpOnly_/, '').split('\t'); return { name: f[5], value: f[6], domain: new URL(SITE).hostname, path: f[2] }; });
const results = {};

async function run(browser, mode, vp, full) {
  const ctx = await browser.newContext({ viewport: vp }); await ctx.addCookies(cookies);
  await ctx.addInitScript(off => { window.WIZRA_STILL = 1; window.WIZRA_CLOTH = { mesh: off ? { off: 1 } : { budget: 1e9 } }; }, mode === 'off');
  const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(SITE, { timeout: 180000 });
  await p.waitForFunction(() => typeof avatar !== 'undefined' && avatar.canVisit && avatar.canVisit(), null, { timeout: 240000 });
  await p.waitForTimeout(3000);
  // pictures come from the photo studio: its camera is aimed at her hips from in front and a little to the side, she holds still, and the cloth keeps simulating
  const shot = async (name, turn = 0.45) => { await p.evaluate(t => { WizraPhoto.open(); avatar.photoAim('hips'); const y = window.WIZRA_T.vrm.scene.rotation.y; avatar.photoCam({ dist: 1.9, pitch: 0.1, yaw: y + t, fov: 34 }); document.body.classList.add('phclean'); }, turn); await p.waitForTimeout(1500);
    await p.screenshot({ path: `${OUT}/${name}-${mode}-${vp.width}.png`, timeout: 60000 }); await p.evaluate(() => WizraPhoto.close()); await p.waitForTimeout(400); };
  const R = {};
  await p.waitForTimeout(10000); await shot('seated');
  if (mode === 'on' && full) {
    R.settle = await p.evaluate(() => { const m = window.WIZRA_T.mcloth; return Object.assign(m.peek(), { speedPerStep: m.speed(), dbg: m.dbg }); });
    // poke-through, seated: how deep is the deepest loose particle inside a thigh or shin capsule
    R.poke = await p.evaluate(() => { const T = window.WIZRA_T, m = T.mcloth, caps = T.cloth.caps(), V = caps[0][0].constructor, a = new V(), d = new V(), e = new V(); let deep = 0, where = '';
      let deepBack = 0; m.points().forEach(([x, y, z, pin, back]) => { if (pin >= 0.999) return; a.set(x, y, z); for (const k of caps) { if (k[4]) continue; d.copy(k[1]).sub(k[0]); const tr = e.copy(a).sub(k[0]).dot(d) / d.lengthSq(), t = Math.max(0, Math.min(1, tr)); if (k[3] && tr < 0.12) continue; e.copy(k[0]).addScaledVector(d, t); const inside = k[2] - 0.012 - a.distanceTo(e); if (back) deepBack = Math.max(deepBack, inside); else if (inside > deep) { deep = inside; where = k[3] ? 'thigh' : 'shin'; } } });
      return { frontSidesDeepestCm: +(deep * 100).toFixed(2), where, backUnderHerCm: +(deepBack * 100).toFixed(2), note: 'the back of the skirt lies on the seat under her thighs by design (as bone cloth does); the hip end of the thigh is the seat test, not the thigh' }; });
  }
  // she gets up and walks: a picture mid-walk, then standing
  await p.evaluate(() => { const s = window.WIZRA_T.vrm.scene, y = s.rotation.y; avatar.walkTo(s.position.x + Math.sin(y) * 1.3, s.position.z + Math.cos(y) * 1.3); });
  let walkPeak = 0; const walkTrace = []; for (let i = 0; i < 28; i++) { await p.waitForTimeout(250); if (mode === 'on') { const h = await p.evaluate(() => window.WIZRA_T.mcloth.hemOffset()); walkTrace.push(+(h * 100).toFixed(1)); walkPeak = Math.max(walkPeak, h); } }
  await p.waitForTimeout(12000); await shot('standing'); await shot('orbit', 2.2); if (mode === 'on') R.walkTraceCm = walkTrace;
  if (mode === 'on' && full) {
    R.walkHemPeakCm = +(walkPeak * 100).toFixed(2);
    // a quick 90 degree turn: the cloth is carried 80% of the way at once (FOLLOW), so it is left 18 degrees behind and swings after her
    R.turn = await p.evaluate(async () => { const m = window.WIZRA_T.mcloth, b0 = m.offsets(), dev = () => { const { o, hemIdx } = m.offsets(); let mx = 0; for (const n of hemIdx) { const k = n * 3; mx = Math.max(mx, Math.hypot(o[k] - b0.o[k], o[k + 1] - b0.o[k + 1], o[k + 2] - b0.o[k + 2])); } return mx; };
      m.kick(-Math.PI / 2 * 0.15); const trace = []; for (let i = 0; i < 30; i++) { m.stepFor(0.1); trace.push(+(dev() * 100).toFixed(2)); } return { peakCm: Math.max(...trace), after2sCm: trace[19], after3sCm: trace[29], traceCm: trace, note: 'the cloth swung 13.5 degrees round her hips at once, as a quick 90 degree turn leaves it behind; change in the hem offset against just before; traced in simulated time, 0.1 s a sample' }; });
    // a tap on the hem pushes the cloth there
    R.touch = await p.evaluate(async () => { const m = window.WIZRA_T.mcloth, pts = m.points(), hem = pts.map((q, i) => [q, i]).filter(([q]) => q[3] < 0.2 && !q[4]); if (!hem.length) return 'no hem'; const [q] = hem[0], V = window.WIZRA_T.vrm.scene.position.constructor, before = m.points();
      m.push(new V(q[0], q[1], q[2]), new V(0, 0, 0.0015), 0.08); let mx = 0; for (let i = 0; i < 6; i++) { await new Promise(r => setTimeout(r, 60)); m.points().forEach((w, k) => { mx = Math.max(mx, Math.hypot(w[0] - before[k][0], w[1] - before[k][1], w[2] - before[k][2])); }); } return { movedCm: +(mx * 100).toFixed(2) }; });
    R.timing = await p.evaluate(() => ({ msPerFrame: +window.WIZRA_T.mcloth.peek().ms.toFixed(2) }));
  }
  if (mode === 'off') R.fallback = await p.evaluate(() => { const T = window.WIZRA_T; let patched = 0; T.vrm.scene.traverse(o => { if (o.isMesh) for (const mt of [].concat(o.material)) if (mt && mt.__mc) patched++; }); return { meshCloth: T.mcloth ? 'present' : 'absent', patchedMaterials: patched }; });
  R.errors = errs.slice(0, 5); await ctx.close(); return R;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  results.pc_off = await run(browser, 'off', { width: 1280, height: 800 }, true);
  results.pc_on = await run(browser, 'on', { width: 1280, height: 800 }, true);
  results.phone_off = await run(browser, 'off', { width: 390, height: 844 }, false);
  results.phone_on = await run(browser, 'on', { width: 390, height: 844 }, false);
  fs.writeFileSync(OUT + '/results.json', JSON.stringify(results, null, 1)); console.log(JSON.stringify(results, null, 1)); await browser.close();
})();
