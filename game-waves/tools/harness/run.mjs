// Screenshots of one game in the harness. node run.mjs GAME OUTDIR [players=3] [advance=30] [seed=7] [extra query, e.g. set=length:quick]
// Writes OUTDIR/GAME-<form>-<advance>.png for portrait 390x844, phone 844x390 and PC 1280x720, plus the end, and prints errors.
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path';
import { start } from './server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [game = 'word-weave', out = 'out', players = '3', advance = '30', seed = '7', extra = ''] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const srv = await start(0), port = srv.address().port;
const browser = await chromium.launch();
const sizes = [['portrait', 390, 844], ['phone', 844, 390], ['pc', 1280, 720]];
let bad = 0;
for (const adv of [advance, 'end']) for (const [form, w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const url = `http://127.0.0.1:${port}/?game=${game}&players=${players}&advance=${adv}&seed=${seed}${extra ? '&' + extra : ''}`;
  await page.goto(url);
  try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }); } catch { console.log('NOT READY', form, adv); }
  await page.waitForTimeout(700);
  const errs = await page.evaluate(() => window.__errors || []);
  if (errs.length) { bad++; console.log('ERRORS', form, adv, errs.slice(0, 5)); }
  const f = path.join(out, `${game}-${form}-${adv}.png`); await page.screenshot({ path: f }); console.log('wrote', f);
  await page.close();
}
await browser.close(); srv.close();
process.exit(bad ? 1 : 0);
