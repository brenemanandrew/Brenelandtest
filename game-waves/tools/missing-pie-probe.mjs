// The Missing Pie: screenshots of the harness after some taps (the notebook, the pickers).
// node missing-pie-probe.mjs OUTDIR TAG "query" "click1|click2|..."   (clicks are CSS selectors, or js:code run in the page, done in order)
import { createRequire } from 'module';
import path from 'path';
import { start } from './harness/server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [out = '.', tag = 'probe', q = 'players=4&advance=12&seed=7', clicks = ''] = process.argv.slice(2);
const srv = await start(0), port = srv.address().port, browser = await chromium.launch();
for (const [form, w, h] of [['portrait', 390, 844], ['phone', 844, 390], ['pc', 1280, 720]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/?game=missing-pie&${q}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  for (const c of clicks.split('|').filter(Boolean)) { if (c.startsWith('js:')) { await page.evaluate(c.slice(3)); await page.waitForTimeout(250); continue; } await page.click(c, { timeout: 3000 }).catch(e => console.log('no', c, e.message.split('\n')[0])); await page.waitForTimeout(250); }
  const errs = (await page.evaluate(() => window.__errors || [])).filter(e => !/could not load (word-weave|town-tycoon)/.test(e));
  if (errs.length) console.log('ERRORS', form, errs.slice(0, 4));
  const f = path.join(out, `mp-${tag}-${form}.png`); await page.screenshot({ path: f }); console.log('wrote', f);
  await page.close();
}
await browser.close(); srv.close();
