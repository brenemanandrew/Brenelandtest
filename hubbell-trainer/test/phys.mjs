// Solid things, the busy floor and its sound. node test/phys.mjs  (server on :8099)
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8099/index.html?test&amb=1'); await p.waitForFunction(() => window.TR); await p.waitForTimeout(800);
const ev = (f, a) => p.evaluate(f, a), w = ms => p.waitForTimeout(ms);
const walkInto = async (x, z, yaw, secs) => { await ev(([x, z, yaw]) => window.TR.placePlayer(x, z, yaw), [x, z, yaw]); await p.keyboard.down('KeyW'); await w(secs * 1000); await p.keyboard.up('KeyW'); return ev(() => [+window.TR.rig.position.x.toFixed(2), +window.TR.rig.position.z.toFixed(2)]); };
const out = {};
out.busyOn = await ev(() => window.TR.AMB.on);
out.intoThor = await walkInto(-10.2, -8.6, 0, 3);            // THOR 2 is parked at z -11.2: you stop short of it
out.intoRack = await walkInto(-17.7, -5, Math.PI / 2, 3);    // row A's face is at x -19.6
out.intoBench = await walkInto(1.3, 8.2, 0, 3.5);            // the packer stands in front of PK03 (z 6.25), bench at 5.4
out.openFloor = await walkInto(0, 10.4, Math.PI / 2, 2);     // nothing in the way along the main aisle: you do move
const before = await ev(() => window.TR.AMB.npcs.map(n => [n.o.position.x, n.o.position.z]));
await p.mouse.click(640, 300); await w(2500);
out.npcsMoved = await ev(b => window.TR.AMB.npcs.filter((n, i) => Math.hypot(n.o.position.x - b[i][0], n.o.position.z - b[i][1]) > .2).length + ' of ' + window.TR.AMB.npcs.length, before);
out.sound = await ev(() => ({ started: window.TR.SND.started, hasMaster: !!window.TR.SND.master }));
// a pedestrian is in the crosswalk and the truck does not slow down
out.crosswalk = await ev(async () => { const T = window.TR, F = T.F, wait = ms => new Promise(r => setTimeout(r, ms));
  T.startModule('pit'); T.mountTruck(); const ped = T.AMB.npcs.find(n => n.cross); ped.o.position.set(7.75, 0, 10.6); ped.wait = 30;
  F.pos.set(13, 0, 10.6); F.heading = -Math.PI / 2; F.v = 0; T.placeTruck(); T.setInput({ t: 1, s: 0, l: 0, q: 0 });
  for (let i = 0; i < 80 && F.pos.x > 7; i++) await wait(100);
  T.setInput(null); return { calls: T.S.viol.map(v => v.msg.split('.')[0]), stoppedAtX: +F.pos.x.toFixed(2), pedX: 7.75 }; });
// the pedestrian does not step out in front of a moving truck
out.pedWaits = await ev(async () => { const T = window.TR, F = T.F, wait = ms => new Promise(r => setTimeout(r, ms));
  const ped = T.AMB.npcs.find(n => n.cross); ped.o.position.set(7.75, 0, 8.3); ped.wait = 0; ped.i = 2; ped.dir = 1;
  F.pos.set(14, 0, 10.6); F.heading = -Math.PI / 2; F.v = 0; T.placeTruck(); T.setInput({ t: .4, s: 0, l: 0, q: 0 });
  await wait(1500); const z1 = ped.o.position.z; T.setInput({ t: 0, s: 0, l: 0, q: 0 }); F.v = 0; await wait(2500); const z2 = ped.o.position.z; T.setInput(null);
  return { whileTruckMoves: +z1.toFixed(2), afterTruckStops: +z2.toFixed(2) }; });
out.drawCalls = await ev(() => window.TR.renderer.info.render.calls);
console.log(JSON.stringify(out, null, 1)); console.log('ERRORS', JSON.stringify(errs));
await ev(() => { const T = window.TR; T.F.onboard = false; T.menu(); T.S.demo = true; T.placePlayer(-4.6, 9.6, .5); T.setLook(.5, -.08); document.querySelector('#hud').style.display = 'none'; }); await w(600); await p.screenshot({ path: 'busy1.png' });
await ev(() => { const T = window.TR; T.placePlayer(12.5, 10.6, Math.PI / 2); T.setLook(Math.PI / 2, -.08); }); await w(600); await p.screenshot({ path: 'busy2.png' });
await b.close();
