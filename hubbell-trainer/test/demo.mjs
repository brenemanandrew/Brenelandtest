import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: 'vid', size: { width: 1280, height: 720 } } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { try { localStorage.setItem('arden.trainer.name', 'Demo Trainee'); } catch (e) { } });
await p.goto('http://localhost:8099/index.html'); await p.waitForFunction(() => window.TR); 
await p.evaluate(() => {
  const T = window.TR; T.S.demo = true; window.__p = 0;
  window.look = (y, pt) => { window.__p = pt; T.setLook(y, pt); };
  window.glide = (x, z, yaw, pitch, ms) => new Promise(res => { const x0 = T.rig.position.x, z0 = T.rig.position.z, y0 = T.getYaw(), p0 = window.__p, t0 = performance.now();
    (function f() { const k = Math.min(1, (performance.now() - t0) / ms), e = k * k * (3 - 2 * k); T.rig.position.x = x0 + (x - x0) * e; T.rig.position.z = z0 + (z - z0) * e; window.look(y0 + (yaw - y0) * e, p0 + (pitch - p0) * e); k < 1 ? requestAnimationFrame(f) : res(); })(); });
  window.scan = code => { const o = T.OBJ['bc:' + code]; T.onInteract('bc:' + code, T.camera, { point: o.getWorldPosition(new T.THREE.Vector3()) }); };
  window.use = id => T.onInteract(id, T.camera);
  window.ok = () => { const st = T.cur(); T.answer(Array.isArray(st.correct) ? st.correct[0] : st.correct); };
});
const w = ms => p.waitForTimeout(ms), ev = (f, a) => p.evaluate(f, a);
const keys = async (dev, ks, gap = 380) => { for (const k of ks) { await ev(([d, k]) => window.TR.devKey(d, k), [dev, k]); await w(gap); } };
const hud = async n => { await p.click(`#hBtns button >> nth=${n}`); };
/* 1. tour and menu */
await w(2500); await hud(0); await w(3000); await hud(0); await w(3000); await ev(() => window.TR.menu()); await w(2500);
/* 2. Pallet Land pick on the THOR */
await hud(2); await w(2500); await ev(() => window.TR.next()); await w(1800); await ev(() => window.ok()); await w(900);
await ev(() => window.glide(-11.6, -9.6, 0, -.45, 1200)); await ev(() => window.use('thor1')); await w(2200); await ev(() => window.ok()); await w(1200);
await ev(() => window.use('thor2')); await w(600); await ev(() => window.glide(-10.2, -11.2, 0, -.5, 800)); await w(800); await ev(() => window.use('thor2_gun')); await w(1500);
await keys('thor2', ['4', '1', '5', 'ENT']); await w(1200); await keys('thor2', ['F7']); await w(900); await keys('thor2', ['P', '1', '0', '0', 'ENT']); await w(1000);
await ev(() => window.ok()); await w(900);
await ev(() => window.glide(-8.4, -12.4, 0, -.25, 2200)); await w(500);
await ev(() => window.scan('T-10232')); await w(2600);                       /* wrong tote: the device says so */
await ev(() => window.scan('T-10230')); await w(1200); await keys('thor2', ['F4']); await w(900);
await ev(() => { window.use('ind_tote0'); }); await w(900); await ev(() => window.use('thor2_pallet')); await w(900); await ev(() => window.ok()); await w(900);
await ev(() => window.glide(-9.4, 2.2, Math.PI / 2, -.15, 3000)); await ev(() => window.glide(-17.4, 2.2, Math.PI / 2, -.15, 2200)); await ev(() => window.glide(-17.4, -3.6, 0, -.15, 2200)); await ev(() => window.glide(-17.0, -5.5, Math.PI / 2, -.3, 1600)); await w(600);
await ev(() => window.scan('P104-01-A')); await w(1500); await ev(() => window.scan('HBL5262')); await w(1500); await ev(() => window.ok()); await w(1000);
await ev(() => window.use('stock:P104-A')); await w(1000); await ev(() => window.use('thor2_pallet')); await w(1200);
await ev(() => window.scan('T-10230')); await w(900); await keys('thor2', ['F4']); await w(1500);
/* 3. pack station */
await ev(() => { window.TR.startModule('pack'); window.look(0, -.2); }); await w(2200); await ev(() => window.TR.next()); await w(600); await ev(() => window.use('pk_gun')); await w(1200);
await ev(() => window.glide(4.9, 6.7, 0, -.25, 800));
await keys('pack', ['0', '1', '0', '3', 'ENT', 'P', 'K', '0', '4', 'F8'], 330); await w(900);
await ev(() => window.use('pk_scale')); await w(1000); await ev(() => window.ok()); await w(1000);
await ev(() => window.scan('HU8000451')); await w(1500); await ev(() => window.ok()); await w(1500); await ev(() => window.scan('HU8000452')); await w(800); await keys('pack', ['F8']); await w(800);
await keys('pack', ['Unpack HU']); await w(1300); await ev(() => window.ok()); await w(700); await keys('pack', ['Create HU', 'F8'], 600); await w(600);
await ev(() => window.use('box3')); await w(900); await ev(() => window.use('pk_tape')); await w(900); await ev(() => window.use('pk_scale')); await w(1500);
/* 4. forklift: real driving */
await ev(() => { const T = window.TR; T.startModule('pit'); T.F.defect = null; T.next(); T.answer(1); T.onInteract('fl_seat', T.camera);
  for (const it of T.INSP) { T.onInteract(it.id, T.camera); T.inspAnswer(it, false); } });
await w(400); await ev(() => { const T = window.TR; while (T.cur().type !== 'drive') { const st = T.cur(); if (st.type === 'choice') window.ok(); else if (st.type === 'interact') window.use('fl_seat'); else T.next(); } window.look(0, -.25); });
await ev(() => { const T = window.TR, F = T.F, P = T.recvPallet; F.pos.set(P.position.x, 0, P.position.z - 4.2); F.heading = 0; F.v = 0; T.placeTruck(); }); await w(1500);
await ev(() => window.TR.setInput({ t: .45, s: 0, l: 0, q: 0 }));
await p.waitForFunction(() => window.TR.F.inserted && Math.abs(window.TR.F.v) < .02, null, { timeout: 60000 }); 
await ev(() => window.TR.setInput({ t: 0, s: 0, l: 1, q: 0 })); await p.waitForFunction(() => window.TR.F.load && window.TR.F.h > .2, null, { timeout: 30000 });
await ev(() => window.TR.setInput({ t: 0, s: 0, l: 0, q: -1 })); await w(1200);
await ev(() => { const T = window.TR, F = T.F, s = T.SLOTS['P104-B']; T.setInput({ t: 0, s: 0, l: 0, q: 0 }); F.v = 0; F.pos.set(-17.7, 0, 7.0); F.heading = Math.PI; T.placeTruck(); T.setInput({ t: 0, s: 0, l: 0, q: 0, horn: true }); });
await w(300); await ev(() => window.TR.setInput({ t: .5, s: 0, l: 0, q: 0 })); await p.waitForFunction(() => window.TR.F.pos.z < 0.4, null, { timeout: 60000 });
await ev(() => { const T = window.TR, F = T.F, s = T.SLOTS['P104-B']; F.v = 0; F.pos.set(-18.1, 0, s.z); F.heading = -Math.PI / 2; T.placeTruck(); T.setInput({ t: 0, s: 0, l: 1, q: 0 }); window.look(0, .15); });
await p.waitForFunction(() => window.TR.F.h > 2.2, null, { timeout: 60000 });
await ev(() => window.TR.setInput({ t: .2, s: 0, l: 0, q: 0 })); await p.waitForFunction(() => window.TR.F.pos.x < -18.7 && Math.abs(window.TR.F.v) < .02, null, { timeout: 60000 });
await ev(() => window.TR.setInput({ t: 0, s: 0, l: -1, q: 0 })); await p.waitForFunction(() => !window.TR.F.load, null, { timeout: 60000 }); await w(1200);
await ev(() => window.TR.setInput({ t: -.5, s: 0, l: -1, q: 0 })); await w(2500); await ev(() => window.TR.setInput(null));
await w(800);
console.log('steps reached:', await ev(() => window.TR.cur().title), 'ERRORS', JSON.stringify(errs));
await ctx.close(); await b.close();
