import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const errs = [];
for (const [name, url] of [['old', 'http://localhost:8098/index.html?test'], ['new', 'http://localhost:8099/index.html?test']]) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); p.on('pageerror', e => errs.push(name + ' ' + e.message));
  await p.goto(url); await p.waitForFunction(() => window.TR); await p.waitForTimeout(1200);
  console.log(name, await p.evaluate(() => { const T = window.TR; const r = T.renderer || null; if (!r) { const c = document.querySelector('canvas'); return 'no renderer hook'; } T.menu(); r.render(T.camera.parent.parent, T.camera); return JSON.stringify(r.info.render); }));
  if (name === 'new') {
    await p.screenshot({ path: 'n0-menu.png' });
    console.log(await p.evaluate(() => {
      const T = window.TR, out = {};
      T.startModule('pack'); T.next(); T.onInteract('pk_gun', T.camera);
      for (const ch of '0103') T.devKey('pack', ch); T.devKey('pack', 'ENT'); for (const ch of 'PK04') T.devKey('pack', ch);
      T.devKey('pack', 'F8'); out.f8AcceptsTyped = T.cur().title; out.mist = T.S.mistakes.length;
      T.startModule('induct'); T.next(); T.onInteract('ind_gun', T.camera); T.devKey('ind', 'Tote Induct (ZEWM_INDUCT)');
      for (const ch of '0103') T.devKey('ind', ch); T.devKey('ind', 'ENT'); T.devKey('ind', 'ENT'); out.entNeutral = [T.DEV.ind.scr.msg, T.S.mistakes.length];
      return JSON.stringify(out);
    }));
    await p.waitForTimeout(500); await p.screenshot({ path: 'n1-step.png' });
    console.log('tour/chip:', await p.evaluate(() => {
      const T = window.TR, out = {}; localStorage.removeItem('arden.trainer.tourOff');
      T.menu(); T.tour(0); out.t0 = [T.panelState().title, T.panelState().btns.map(b => b.label)];
      T.panelState().btns[0].fn(); T.panelState().btns[0].fn(); out.t2 = T.panelState().title; out.spot = document.querySelector('.spot') && document.querySelector('.spot').id;
      T.panelState().btns.find(b => /Don't show/.test(b.label)).fn(); out.tick = [localStorage.getItem('arden.trainer.tourOff'), T.panelState().btns.find(b => /Don't show/.test(b.label)).icon];
      T.panelState().btns.find(b => /Don't show/.test(b.label)).fn(); out.untick = localStorage.getItem('arden.trainer.tourOff');
      T.panelState().btns.find(b => /Skip/.test(b.label)).fn(); out.after = [T.S.phase, document.querySelectorAll('.spot').length];
      document.querySelector('#hMin').click(); out.chip = [getComputedStyle(document.querySelector('#chip')).display, getComputedStyle(document.querySelector('#hud')).display];
      T.startModule('induct'); out.chipText = document.querySelector('#chip').textContent;
      return JSON.stringify(out);
    }));
    await p.waitForTimeout(300); await p.screenshot({ path: 'n3-chip.png' });
    await p.mouse.move(43, 757); await p.mouse.down(); await p.mouse.move(400, 300, { steps: 4 }); await p.mouse.up();
    console.log('chip dragged to', await p.evaluate(() => { const c = document.querySelector('#chip'); return c.offsetLeft + ',' + c.offsetTop + ' saved ' + localStorage.getItem('arden.trainer.chip'); }));
    await p.mouse.click(400, 300); console.log('chip click ->', await p.evaluate(() => getComputedStyle(document.querySelector('#hud')).display + ' / chip ' + getComputedStyle(document.querySelector('#chip')).display));
    await p.evaluate(() => { const T = window.TR; T.menu(); T.tour(2); }); await p.waitForTimeout(300); await p.screenshot({ path: 'n4-tour.png' });
    await p.evaluate(() => window.TR.menu()); await p.waitForTimeout(300); await p.screenshot({ path: 'n0-menu.png' });
    // name modal must swallow game keys
    await p.evaluate(() => { window.TR.menu(); document.querySelector('#nameBtn').click(); });
    await p.keyboard.type('Dee 3 e'); await p.waitForTimeout(200);
    console.log('modal typing:', await p.evaluate(() => JSON.stringify({ val: document.querySelector('#nm').value, phase: window.TR.S.phase })));
    await p.keyboard.press('Enter'); console.log('who:', await p.evaluate(() => document.querySelector('#who').textContent + ' | modal hidden ' + document.querySelector('#modal').classList.contains('hidden')));
    await p.evaluate(() => { const T = window.TR; T.startModule('flow'); for (let i = 0; i < 99 && T.S.phase === 'run'; i++) { const st = T.cur(); if (st.type === 'info') T.next(); else break; } T.S.i = T.S.mod.steps.length; T.next(); });
    await p.waitForTimeout(300); await p.screenshot({ path: 'n2-done.png' });
  }
  await p.close();
}
console.log('ERRORS', JSON.stringify(errs)); await b.close();
