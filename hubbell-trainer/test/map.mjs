import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('playwright'); const fs = require('fs');
const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1500, height: 850 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8099/index.html?test'); await p.waitForFunction(() => window.TR); await p.waitForTimeout(1200);
const url = await p.evaluate(() => { const T = window.TR, THREE = T.THREE, r = T.renderer;
  const cam = new THREE.OrthographicCamera(-31, 31, 17.6, -17.6, .1, 60); cam.position.set(0, 7, 1); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 1); cam.updateProjectionMatrix();
  r.render(T.scene, cam); return r.domElement.toDataURL('image/png'); });
fs.writeFileSync('map.png', Buffer.from(url.split(',')[1], 'base64'));
for (const [name, x, z, yaw, pitch] of [['v-aisle', -17.7, 6.5, 0, -.05], ['v-strip', -5.2, 7.6, .35, -.12], ['v-main', 20, 10.3, Math.PI / 2, -.05], ['v-pack', 3, 11, 0, -.1]]) {
  await p.evaluate(([x, z, yaw, pitch]) => { const T = window.TR; T.S.demo = true; T.placePlayer(x, z, yaw); T.setLook(yaw, pitch); document.querySelector('#hud').style.display = 'none'; }, [x, z, yaw, pitch]);
  await p.waitForTimeout(500); await p.screenshot({ path: name + '.png' });
}
console.log('ERRORS', JSON.stringify(errs)); await b.close();
