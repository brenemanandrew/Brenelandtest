// Word Weave: a scripted run of the UI in the harness (Playwright, preinstalled). Run: node game-waves/tools/word-weave-ui-check.mjs [OUTDIR]
// At phone upright, phone sideways and PC: gives You a rack with a blank, then through real taps: picks the blank, puts it on
// the star (the letter picker comes up, pick C), adds A and T, checks the preview (CAT: 6 = (blank 0 + A 1 + T 1 on a 2L) x2 for the star; a real C would make 12), plays it and
// checks what was sent, the board (a lowercase c), the score and the drawn tile (shows C, marked blank, no value).
// Also: drag a rack tile onto another to reorder, and on the small board tap an empty square to zoom and back.
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path';
import { start } from './harness/server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2] || (await import('os')).tmpdir();
fs.mkdirSync(out, { recursive: true });
const srv = await start(0), port = srv.address().port, browser = await chromium.launch();
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL:', msg); } };
for (const [form, w, h] of [['portrait', 390, 844], ['phone', 844, 390], ['pc', 1280, 720]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: form !== 'pc' });
  await page.goto(`http://127.0.0.1:${port}/?game=word-weave&players=2&advance=0&seed=4`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  // your turn on an empty board, with a blank in the rack
  const fresh = await page.evaluate(() => { const S = window.__state(); S.racks[0] = ['?', 'A', 'T', 'E', 'R', 'S', 'O']; return S.turn === 0 && S.board.every(r => !/[A-Za-z]/.test(r)); });
  ok(fresh, `${form}: your turn on an empty board`);
  await page.evaluate(() => dispatchEvent(new Event('resize')));
  await page.waitForTimeout(300);
  const tap = sel => page.click(sel, { timeout: 3000 });
  const sq = (r, c) => `.ww-sq[data-r="${r}"][data-c="${c}"]`;
  // drag to reorder: the O (last) onto the first tile's left half
  const order0 = await page.$$eval('.ww-rack [data-ri]', a => a.map(e => e.getAttribute('aria-label')));
  const from = await page.locator('.ww-rt[aria-label^="O,"]').boundingBox(), to = await page.locator('.ww-rt[aria-label="Blank tile"]').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(from.x - 20, from.y, { steps: 4 }); await page.mouse.move(to.x + 4, to.y + to.height / 2, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(200);
  const order1 = await page.$$eval('.ww-rack [data-ri]', a => a.map(e => e.getAttribute('aria-label')));
  ok(order1[0] && order1[0].startsWith('O,') && order1.length === order0.length, `${form}: drag reorders the rack (${order1.map(x => x[0]).join('')})`);
  // zoom on the small board (phone sizes): tap an empty square with nothing picked, then zoom out
  const small = await page.evaluate(() => { const c = document.querySelector('.ww-frame'); return parseFloat(getComputedStyle(c).getPropertyValue('--cs')) < 24; });
  if (small) {
    await tap(sq(3, 3)); await page.waitForTimeout(300);
    ok(await page.locator('.ww-zoom').count() === 1, `${form}: tap zooms the small board`);
    await page.screenshot({ path: path.join(out, `ww-check-${form}-zoom.png`) });
    await tap('.ww-zoom'); await page.waitForTimeout(300);
    ok(await page.locator('.ww-zoom').count() === 0, `${form}: zoom out`);
  }
  // the blank onto the star: the picker comes up
  await tap('.ww-rt[aria-label="Blank tile"]'); await tap(sq(7, 7));
  ok(await page.locator('.ww-pick').count() === 1, `${form}: the letter picker opens`);
  await page.screenshot({ path: path.join(out, `ww-check-${form}-picker.png`) });
  await tap('.ww-pick-b[aria-label="Letter C"]');
  const t77 = await page.locator(sq(7, 7) + ' .ww-t').first();
  ok(await t77.evaluate(e => e.classList.contains('blank') && e.querySelector('b').textContent === 'C' && !e.querySelector('i')), `${form}: placed blank shows C, marked blank, no value`);
  await tap('.ww-rt[aria-label^="A,"]'); await tap(sq(7, 8));
  await tap('.ww-rt[aria-label^="T,"]'); await tap(sq(7, 9));
  const pv = await page.locator('.ww-pv').first().textContent().catch(() => '');
  ok(/CAT: 6 points/.test(pv), `${form}: preview says CAT: 6 points (got "${pv}")`);
  await page.screenshot({ path: path.join(out, `ww-check-${form}-placed.png`) });
  await tap('[data-act="play"]'); await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({ sent: window.__lastSent, beats: window.__lastBeats, row: window.__state().board[7], score: window.__state().scores[0], toasts: window.__toasts || [], errors: window.__errors }));
  ok(r.sent && r.sent.type === 'place' && JSON.stringify(r.sent.tiles[0]) === JSON.stringify({ r: 7, c: 7, letter: 'C', blank: true }), `${form}: sent the blank as { letter: C, blank: true }: ${JSON.stringify(r.sent)}`);
  ok(r.row.slice(7, 10) === 'cAT', `${form}: board row has cAT (got ${r.row.slice(7, 10)})`);
  const pb = (r.beats || []).find(b => b.kind === 'place');
  ok(pb && pb.score === 6 && r.score === 6, `${form}: scored 6 (blank 0, A 1, T 1x2, start x2): beat ${pb && pb.score}, total ${r.score}`);
  const drawn = await page.locator(sq(7, 7) + ' .ww-t').first().evaluate(e => ({ blank: e.classList.contains('blank'), L: e.querySelector('b').textContent, v: !!e.querySelector('i') }));
  ok(drawn.blank && drawn.L === 'C' && !drawn.v, `${form}: the played blank is drawn as a blank C`);
  ok(await page.locator(sq(7, 7)).getAttribute('aria-label').then(a => /C \(blank\)/.test(a)), `${form}: its label says blank`);
  ok(!r.errors.length, `${form}: page errors ${r.errors.slice(0, 3)}`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, `ww-check-${form}-played.png`) });
  await page.close();
}
await browser.close(); srv.close();
console.log(fails ? `${fails} FAILED` : 'word weave UI check: all passed');
process.exit(fails ? 1 : 0);
