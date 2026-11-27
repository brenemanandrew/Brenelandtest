import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errs = [];
page.on('pageerror', e => errs.push('pageerror ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
const fs = require('fs');
await page.addInitScript({ content: fs.readFileSync('iwer.min.js','utf8') + ';window.__dev=new IWER.XRDevice(IWER.metaQuest3);window.__dev.installRuntime({forceInstall:true});' });
await page.goto('http://localhost:8099/index.html?test', { waitUntil: 'load' });
await page.waitForFunction(() => window.TR, null, { timeout: 30000 });
await page.waitForTimeout(1500);
const btn = await page.$('#VRButton'); console.log('vr button text:', await btn.textContent());
await btn.click(); await page.waitForTimeout(2000);
const r = await page.evaluate(async () => {
  const T = window.TR, d = window.__dev, out = {};
  out.presenting = T.camera.parent && document.querySelector('#hud').style.display === 'none';
  const sess = d.activeSession; out.session = !!sess;
  // aim right controller at the panel's first button, press trigger
  const ps = T.panelState(); out.title = ps.title;
  // let frames run
  await new Promise(r => setTimeout(r, 800));
  out.presenting2 = document.querySelector('#hud').style.display === 'none';
  // walk the right controller ray to the panel and press the first button (Forklift)
  const panelPos = new (T.camera.position.constructor)();
  out.panelVisible = T.truck.parent && true;
  return out;
});
console.log(JSON.stringify(r));

// aim: put controller where the head is, pointing at the panel's first button and pull trigger
const r2 = await page.evaluate(async () => {
  const T = window.TR, d = window.__dev;
  const sc = T.camera.parent.parent; // scene
  let panel = null; sc.traverse(o => { if (o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.width === .8 && o.material.map && o.geometry.parameters.height === .8) panel = o; });
  const res = { panelVisible: panel && panel.visible };
  if (!panel) return res;
  panel.updateMatrixWorld();
  const btnLocal = new (T.camera.position.constructor)(-.4 + (24 + 220) / 1024 * .8, .4 - (1024 - 70 - 3 * 86 + 37) / 1024 * .8, 0);
  const target = panel.localToWorld(btnLocal.clone());
  const rig = T.camera.parent;
  const tl = rig.worldToLocal(target.clone());
  const c = d.controllers.right;
  c.position.set(tl.x + .0, tl.y, tl.z + .5);
  c.quaternion.set(0, 0, 0, 1);
  await new Promise(r => setTimeout(r, 400));
  c.updateButtonValue('trigger', 1); await new Promise(r => setTimeout(r, 200)); c.updateButtonValue('trigger', 0);
  await new Promise(r => setTimeout(r, 500));
  res.after = T.panelState().title; res.phase = T.S.phase; res.mod = T.S.mod && T.S.mod.id;
  return res;
});
console.log('panel press', JSON.stringify(r2));
await page.screenshot({ path: 'xr.png' });
console.log('ERRORS', JSON.stringify(errs.slice(0, 8)));
await browser.close();
