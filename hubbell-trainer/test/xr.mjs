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
await page.waitForSelector('#vrBtn:not([hidden])', { timeout: 5000 }); const btn = await page.$('#vrBtn'); console.log('vr button text:', await btn.textContent());
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
  const rows = Math.ceil(T.panelState().btns.length / 2); const btnLocal = new (T.camera.position.constructor)(-.4 + (24 + 220) / 1024 * .8, .4 - (1024 - 70 - rows * 86 + 37) / 1024 * .8, 0);
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
const r3 = await page.evaluate(async () => {
  const T = window.TR, d = window.__dev, THREE = T.THREE;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  T.startModule('flow'); T.next(); T.onInteract('mc_cradle', T.camera); T.answer(0);
  await wait(400);
  const mc = T.DEV.mc; mc.mesh.updateMatrixWorld(true);
  const out = { tool: T.S.tool, heldBy: mc.group.parent === T.ctrls[0] ? 'ctrl0' : mc.group.parent === T.ctrls[1] ? 'ctrl1' : mc.group.parent && mc.group.parent.type };
  const press = async (k) => {
    const r = mc.rects.find(q => q.k === k); const u = (r.x + r.w / 2) / mc.W, v = 1 - (r.y + r.h / 2) / mc.H;
    const pos = mc.mesh.geometry.attributes.position; const w = .09, h = .135;
    const tgtW = mc.mesh.localToWorld(new THREE.Vector3((u - .5) * w, (v - .5) * h, 0));
    const nrm = new THREE.Vector3(0, 0, 1).transformDirection(mc.mesh.matrixWorld);
    const eyeW = tgtW.clone().add(nrm.multiplyScalar(.25));
    const tgt = T.rig.worldToLocal(tgtW.clone()), eye = T.rig.worldToLocal(eyeW.clone());
    const m = new THREE.Matrix4().lookAt(eye, tgt, new THREE.Vector3(0, 1, 0)); const q = new THREE.Quaternion().setFromRotationMatrix(m);
    const left = d.controllers.left; left.position.set(eye.x, eye.y, eye.z); left.quaternion.set(q.x, q.y, q.z, q.w);
    await wait(250); left.updateButtonValue('trigger', 1); await wait(120); left.updateButtonValue('trigger', 0); await wait(250);
    mc.mesh.updateMatrixWorld(true);
  };
  for (const k of ['4', '1', '5', 'ENT']) await press(k);
  out.after = T.cur().title; out.screen = T.DEV.mc.scr.head; out.mistakes = T.S.mistakes.length;
  return out;
});
console.log('handheld keys in VR', JSON.stringify(r3));
const r4 = await page.evaluate(async () => {
  const T = window.TR, d = window.__dev, THREE = T.THREE, wait = ms => new Promise(r => setTimeout(r, ms));
  const head = () => T.camera.getWorldPosition(new THREE.Vector3());
  d.position.set(.6, 1.6, -.4); await wait(300);                       /* stand off-centre in the play space */
  T.startModule('pit'); await wait(200); T.mountTruck(); await wait(400);
  const seat = T.truck.localToWorld(new THREE.Vector3(0, .95, -.35)), h = head();
  const out = { seatErr: +Math.hypot(h.x - seat.x, h.z - seat.z).toFixed(3), eyeY: +h.y.toFixed(2) };
  T.F.onboard = false; T.startModule('pick'); await wait(200);
  const t2 = T.OBJ.thor2.parent, tp = t2.getWorldPosition(new THREE.Vector3()); T.ride(t2); await wait(300);
  const h2 = head(), tp2 = t2.getWorldPosition(new THREE.Vector3());
  out.thorHeadErr = +Math.hypot(h2.x - tp.x, h2.z - tp.z).toFixed(3); out.thorMoved = +tp.distanceTo(tp2).toFixed(3);
  out.calls = T.renderer.info.render.calls;
  return out;
});
console.log('VR offsets', JSON.stringify(r4));
const r5 = await page.evaluate(async () => {
  const T = window.TR, d = window.__dev, THREE = T.THREE, wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  d.position.set(0, 1.6, 0); d.quaternion.set(0, 0, 0, 1); T.S.riding = null; T.menu(); await wait(200); T.placePanelVR(true); await wait(200);
  const head = T.camera.getWorldPosition(new THREE.Vector3()), pp = T.panel.getWorldPosition(new THREE.Vector3());
  out.boardDist = +Math.hypot(pp.x - head.x, pp.z - head.z).toFixed(2);
  const gaze = T.camera.getWorldDirection(new THREE.Vector3()), to = pp.clone().sub(head); to.y = 0; to.normalize();
  out.boardAngleDeg = Math.round(Math.acos(to.dot(gaze)) * 57.3); out.boardWidth = +(0.8 * T.panel.getWorldScale(new THREE.Vector3()).x).toFixed(2);
  /* poke: push the right controller tip through the first menu button from the front, no trigger */
  T.panel.updateMatrixWorld(true);
  const rows = Math.ceil(T.panelState().btns.length / 2);
  const local = new THREE.Vector3(-.4 + (24 + 220) / 1024 * .8, .4 - (1024 - 70 - rows * 86 + 37) / 1024 * .8, 0);
  const nrm = new THREE.Vector3(0, 0, 1).transformDirection(T.panel.matrixWorld), at = T.panel.localToWorld(local.clone());
  const c = d.controllers.right, q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(at.clone().add(nrm), at, new THREE.Vector3(0, 1, 0)));
  c.quaternion.set(q.x, q.y, q.z, q.w);
  for (const back of [.12, .09, .07, .055, .045, .03]) { const p = T.rig.worldToLocal(at.clone().add(nrm.clone().multiplyScalar(back))); c.position.set(p.x, p.y, p.z); await wait(120); }
  out.pokeStarted = T.S.mod && T.S.mod.id; out.phase = T.S.phase;
  /* wrist: raise the left hand in view, press Menu twice with the pointer */
  T.wrist.updateMatrixWorld(true); const l = d.controllers.left;
  l.position.set(-.12, 1.38, -.38); l.quaternion.setFromEuler ? l.quaternion.setFromEuler(new THREE.Euler(.9, 0, 0)) : (() => { const e = new THREE.Quaternion().setFromEuler(new THREE.Euler(.9, 0, 0)); l.quaternion.set(e.x, e.y, e.z, e.w); })();
  await wait(400); out.wristVisible = T.wrist.visible;
  return out;
});
console.log('board, poke, wrist', JSON.stringify(r5)); await page.screenshot({ path: 'xr2.png' });
await page.screenshot({ path: 'xr.png' });
console.log('ERRORS', JSON.stringify(errs.slice(0, 8)));
await browser.close();
