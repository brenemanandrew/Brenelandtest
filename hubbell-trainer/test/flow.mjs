import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.argv[2];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push('pageerror ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
await page.goto('http://localhost:8099/index.html?test', { waitUntil: 'load' });
await page.waitForFunction(() => window.TR, null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/0-menu.png' });

const res = await page.evaluate(async () => {
  const T = window.TR, log = [];
  const tick = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) T.tick(dt); };
  function runAuto(id) {
    T.startModule(id);
    let guard = 0;
    while (T.S.phase === 'run' && guard++ < 200) {
      const st = T.cur(); if (!st) break;
      const before = T.S.i;
      if (st.type === 'info') T.next();
      else if (st.type === 'choice') T.answer(Array.isArray(st.correct) ? st.correct[0] : st.correct);
      else if (st.type === 'keys') st.seq.forEach(k => T.pressKey(k));
      else if (st.type === 'interact') T.onInteract(Array.isArray(st.target) ? st.target[0] : st.target, T.camera);
      else if (st.type === 'scan') T.onInteract('bc:' + st.code, T.camera);
      else if (st.type === 'carry') { T.onInteract(Array.isArray(st.item) ? st.item[0] : st.item, T.camera); T.onInteract(Array.isArray(st.dest) ? st.dest[0] : st.dest, T.camera); }
      else if (st.type === 'order') st.seq.forEach(x => T.onInteract(x, T.camera));
      else if (st.type === 'inspect') { for (const it of T.INSP) T.onInteract(it.id, T.camera) || T.inspAnswer(it, T.F.defect === it.id); }
      else if (st.type === 'drive') return { stoppedAt: st.title };
      else if (st.type === 'rf') {
        const d = T.DEV[st.dev];
        for (const f of d.scr.fields) {
          if (f.ok) continue;
          const val = Array.isArray(f.expect) ? f.expect.find(v => !d.used.includes(v)) : f.expect;
          if (f.via === 'scan') {
            if (!T.S.tool) return { stuck: st.title, why: 'no scanner in hand' };
            const o = T.OBJ['bc:' + val]; if (!o) return { stuck: st.title, why: 'no barcode ' + val };
            T.onInteract('bc:' + val, T.camera, { point: o.getWorldPosition(new (T.camera.position.constructor)()) });
          } else { for (const ch of val) T.devKey(st.dev, ch); T.devKey(st.dev, 'ENT'); }
          if (T.cur() !== st) break;
        }
        if (T.cur() === st) { if (st.seq) st.seq.forEach(k => T.devKey(st.dev, k)); else if (st.key) T.devKey(st.dev, st.key); }
      }
      if (T.S.i === before && T.S.phase === 'run') return { stuck: st.title, type: st.type };
    }
    return { phase: T.S.phase, mistakes: T.S.mistakes.length, viol: T.S.viol.map(v => v.msg) };
  }
  /* wrong-input checks on the handheld */
  T.startModule('flow'); T.next(); T.onInteract('mc_cradle', T.camera); T.answer(0);
  for (const ch of '514') T.devKey('mc', ch); T.devKey('mc', 'ENT');
  const m1 = T.S.mistakes.length, msg1 = T.DEV.mc.scr.msg;
  for (const ch of '415') T.devKey('mc', ch); T.devKey('mc', 'ENT');
  T.devKey('mc', 'F4'); const m2 = T.S.mistakes.length;
  T.devKey('mc', 'F7'); for (const ch of 'D300') T.devKey('mc', ch); T.devKey('mc', 'ENT');
  T.onInteract('bc:T-20006', T.camera, { point: T.OBJ['bc:T-20006'].getWorldPosition(new (T.camera.position.constructor)()) });
  log.push(['wrong inputs', m1, msg1, m2, T.DEV.mc.scr.msg, 'mistakes', T.S.mistakes.length, T.cur().title]);
  for (const id of ['induct', 'pick', 'flow', 'pack', 'ship']) { const r = runAuto(id); log.push([id, r, T.panelState().title]); }

  /* forklift: steps until the first drive step */
  const r0 = runAuto('pit'); log.push(['pit-pre', r0, 'defect=' + T.F.defect, 'onboard=' + T.F.onboard]);
  const F = T.F, P = T.recvPallet;
  // step: drive to the pallet: place truck behind it
  F.pos.set(P.position.x, 0, P.position.z + 0.5 + 1.42 + 0.35); F.heading = Math.PI; F.h = .05; F.v = 0; T.placeTruck();
  tick(5); log.push(['after reach', T.cur().title]);
  T.setInput({ t: .25, s: 0, l: 0, q: 0 }); tick(240);
  const local = P.worldToLocal(T.TR_.carriage.localToWorld(new (T.camera.position.constructor)(0, -.31, .14)));
  log.push(['heel z in pallet', local.z.toFixed(2), 'inserted', !!F.inserted, 'pos.z', F.pos.z.toFixed(2)]);
  T.setInput({ t: 0, s: 0, l: 1, q: 0 }); tick(40);
  T.setInput({ t: 0, s: 0, l: 0, q: -1 }); tick(50);
  log.push(['loaded', F.load === P, 'h', F.h.toFixed(2), 'step', T.cur().title, 'viol', T.S.viol.length]);
  // go to the aisle: honk, then enter intersection and aisle
  F.pos.set(-3.0, 0, -11.5); F.heading = -Math.PI / 2; T.placeTruck(); tick(3);
  T.setInput({ t: 0, s: 0, l: 0, q: 0, horn: true }); tick(1);
  T.setInput({ t: .4, s: 0, l: 0, q: 0 }); tick(400);
  log.push(['aisle', 'x', F.pos.x.toFixed(2), 'step', T.cur().title, 'viol', T.S.viol.map(v => v.msg)]);
  // put away: square to P104, raise, ease in, lower
  const slot = T.SLOTS['P104-B'];
  F.v = 0; F.pos.set(slot.x, 0, -12.2); F.heading = Math.PI; T.placeTruck(); tick(3);
  T.setInput({ t: 0, s: 0, l: 1, q: 0 }); tick(260);
  log.push(['raised h', F.h.toFixed(2), 'pallet y', P.getWorldPosition(new (T.camera.position.constructor)()).y.toFixed(2)]);
  T.setInput({ t: .2, s: 0, l: 0, q: 0 }); tick(300);
  T.setInput({ t: 0, s: 0, l: -1, q: 0 }); tick(120);
  log.push(['placed', slot.filled === P, 'load', !!F.load, 'pos.z', F.pos.z.toFixed(2), 'step', T.cur().title]);
  // lower forks fully, back out, park
  T.setInput({ t: 0, s: 0, l: -1, q: 0 }); tick(300);
  T.setInput({ t: -.5, s: 0, l: 0, q: 0 }); tick(60);
  F.pos.set(-2, 0, 12); F.heading = Math.PI; F.v = 0; T.setInput({ t: 0, s: 0, l: 0, q: 0 }); T.placeTruck(); tick(30);
  log.push(['parked step', T.cur() && T.cur().title]);
  if (T.cur() && T.cur().type === 'choice') T.answer(0);
  T.setInput(null);
  log.push(['pit end', T.S.phase, T.panelState().title, 'viol', T.S.viol.map(v => v.msg), 'mistakes', T.S.mistakes.length]);
  /* hunt */
  T.startHunt(); for (const h of T.HUNT) { T.huntHit(h.id); const opts = T.panelState().btns; const j = opts.findIndex(b => h.answer.includes(b.label)); opts[j].fn(); }
  log.push(['hunt', T.panelState().title, T.panelState().sub]);
  return log;
});
console.log(JSON.stringify(res, null, 1));
/* views */
await page.evaluate(() => { const T = window.TR; T.startModule('pack'); T.next(); T.onInteract('pk_gun', T.camera); for (const ch of '01') T.devKey('pack', ch); });
await page.waitForTimeout(800); await page.screenshot({ path: OUT + '/1-pack.png' });
await page.evaluate(() => { const T = window.TR; T.startModule('pick'); for (let i = 0; i < 4; i++) { const st = T.cur(); st.type === 'choice' ? T.answer(st.correct) : st.type === 'interact' ? T.onInteract(st.target[0] || st.target, T.camera) : T.next(); } T.onInteract('thor2', T.camera); T.onInteract('thor2_gun', T.camera); for (const ch of '41') T.devKey('thor2', ch); });
await page.waitForTimeout(800); await page.screenshot({ path: OUT + '/5-thor.png' });
await page.evaluate(() => { const T = window.TR; T.startModule('flow'); T.next(); T.onInteract('mc_cradle', T.camera); T.answer(0); for (const ch of '415') T.devKey('mc', ch); T.devKey('mc','ENT'); T.devKey('mc','F7'); for (const ch of 'D300') T.devKey('mc', ch); T.devKey('mc','ENT'); });
await page.waitForTimeout(800); await page.screenshot({ path: OUT + '/6-handheld.png' });
await page.evaluate(() => { const T = window.TR; T.startModule('pick'); for (let i = 0; i < 12; i++) T.cur().type==='info'?T.next():null; });
await page.evaluate(() => { const T = window.TR; T.startModule('pit'); T.next(); T.answer(1); T.F.onboard = false; });
await page.waitForTimeout(800); await page.screenshot({ path: OUT + '/2-pit.png' });
await page.evaluate(() => { const T = window.TR; T.mountTruck(); const F = T.F; F.pos.set(-12.55, 0, -11.2); F.heading = Math.PI; F.h = 1.0; T.placeTruck(); });
await page.waitForTimeout(800); await page.screenshot({ path: OUT + '/3-seated.png' });
await page.evaluate(() => { const T = window.TR; T.F.onboard = false; T.startHunt(); });
await page.waitForTimeout(800); await page.screenshot({ path: OUT + '/4-hunt.png' });
console.log('ERRORS', JSON.stringify(errs));
await browser.close();
