import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 412, height: 880 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8099/index.html'); await p.waitForFunction(() => window.TR); await p.waitForTimeout(1000);
// name dialog: fill and save
await p.fill('#nm', 'Test Trainee'); await p.tap('#nmOk'); await p.waitForTimeout(300);
await p.screenshot({ path: 'ph0-tour.png' });
await p.tap('#hBtns button >> nth=0'); await p.waitForTimeout(200);
console.log('tour card 2 text:', (await p.textContent('#hText')).slice(0, 60));
await p.evaluate(() => window.TR.menu()); await p.waitForTimeout(200); await p.screenshot({ path: 'ph1-menu.png' });
await p.tap('#hBtns button >> nth=4'); await p.waitForTimeout(300);   // Pack
await p.tap('#hBtns button >> nth=0'); await p.waitForTimeout(300);   // Continue
// tap the scanner in the 3D view: project its position to the screen
const pt = await p.evaluate(() => { const T = window.TR, v = T.OBJ.pk_gun.getWorldPosition(new T.THREE.Vector3()).project(T.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; });
await p.touchscreen.tap(pt.x, pt.y); await p.waitForTimeout(300);
console.log('after tapping the scanner:', await p.evaluate(() => JSON.stringify({ tool: window.TR.S.tool, step: window.TR.cur().title })));
// drag to look, joystick to walk
const y0 = await p.evaluate(() => window.TR.getYaw()), pos0 = await p.evaluate(() => window.TR.rig.position.z);
const cdp = await ctx.newCDPSession(p);
const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i })) });
await touch('touchStart', [[200, 600]]); for (let i = 1; i <= 6; i++) await touch('touchMove', [[200 + i * 15, 600]]); await touch('touchEnd', []);
const r = await p.evaluate(() => { const q = document.querySelector('#joy').getBoundingClientRect(); return [q.left + 60, q.top + 60]; });
await touch('touchStart', [r]); await touch('touchMove', [[r[0], r[1] - 40]]); await p.waitForTimeout(1200); await touch('touchEnd', []);
console.log('look/walk:', await p.evaluate(([y0, z0]) => JSON.stringify({ yawChanged: +(window.TR.getYaw() - y0).toFixed(2), moved: +Math.abs(window.TR.rig.position.z - z0).toFixed(2), joy: getComputedStyle(document.querySelector('#joy')).display }), [y0, pos0]));
await p.screenshot({ path: 'ph2-pack.png' });
console.log('ERRORS', JSON.stringify(errs)); await b.close();
