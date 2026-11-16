// Screenshots of the game-waves games' pieces on a world table (table3d.html), mid-game and at the end, from a player's
// height and from above, and the draw-call / mesh counts. node table3d.mjs OUTDIR [games=all] [moves=per game] [table=store|picnic]
// Exit code 1 on any page error or if an unchanged update() rebuilt.
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path';
import { start } from './server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [out = 'out3d', games = 'word-weave,missing-pie,town-tycoon', adv = '', table = 'store'] = process.argv.slice(2);
const ADV = { 'word-weave': 10, 'missing-pie': 40, 'town-tycoon': 120, 'hearthfield': 120, 'pillow-forts': 120 };
const PLAYERS = { 'word-weave': 3, 'missing-pie': 4, 'town-tycoon': 4, 'hearthfield': 4, 'pillow-forts': 4 };
fs.mkdirSync(out, { recursive: true });
const srv = await start(0), port = srv.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let bad = 0;
for (const game of games.split(',')) {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('  [' + m.type() + ']', m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${port}/harness/table3d.html?game=${game}&players=${PLAYERS[game] || 3}&table=${table}`);
  try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }); } catch { console.log('NOT READY', game); bad++; await page.close(); continue; }
  const shoot = async tag => {
    for (const cam of ['player', 'above', 'low', 'passer']) {
      await page.evaluate(c => window.__cam(c), cam);
      for (let i = 0; i < 12; i++) { await page.waitForTimeout(60); await page.evaluate(() => window.__draw()); } // (let any walk finish)
      const f = path.join(out, `${game}-${table}-${tag}-${cam}.png`); await page.screenshot({ path: f }); console.log('wrote', f);
    }
  };
  await page.evaluate(k => window.__adv(k), Number(adv || ADV[game] || 40));
  console.log(game, 'mid', JSON.stringify(await page.evaluate(() => window.__stats())));
  const same = await page.evaluate(() => window.__same());
  console.log(game, 'unchanged update:', JSON.stringify(same)); if (same.before !== same.after) bad++;
  await shoot('mid');
  await page.evaluate(() => window.__end());
  console.log(game, 'end', JSON.stringify(await page.evaluate(() => window.__stats())));
  await shoot('end');
  const errs = await page.evaluate(() => window.__errors);
  if (errs.length) { bad++; console.log('ERRORS', game, errs.slice(0, 6)); }
  await page.close();
}
await browser.close(); srv.close();
process.exit(bad ? 1 : 0);
