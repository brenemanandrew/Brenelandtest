// Makes her picture pack by romance level: about 27 pictures for each of the five levels, every one a posed render of her in the
// outfit that level wears for that kind of moment. A picture belongs to one level only ("lvl" in the manifest).
//   node gen2.cjs <outDir> <baseUrl> <cookieFile> [only]     baseUrl: a running Brenai that has the outfit models (the live one);
//   cookieFile: a curl cookie jar for a logged-in player; only: "L2" or a file-name fragment, to make just those (for trying poses)
// The shots are in shots2.cjs. Needs Playwright.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const [out, base, jar, only = ''] = process.argv.slice(2); const SHOTS = require('./shots2.cjs');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const cookies = fs.readFileSync(jar, 'utf8').split('\n').filter(l => l && (!l.startsWith('#') || l.startsWith('#HttpOnly_'))).map(l => l.replace(/^#HttpOnly_/, '').split('\t')).filter(p => p.length >= 7).map(p => ({ name: p[5], value: p[6], domain: p[0].replace(/^\./, ''), path: p[2], secure: p[3] === 'TRUE' }));
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 430, height: 880 } }); await ctx.addCookies(cookies); await ctx.addInitScript(() => { window.WIZRA_STILL = true; });
  const of = await (await ctx.request.get(base + '/api/outfits')).json();
  const items = SHOTS.filter(s => !only || ('L' + s.lvl) === only || s.file.includes(only)), groups = {}; for (const s of items.filter(s => !fs.existsSync(path.join(out, s.file + '.webp'))))   /* (a picture already in the folder is kept: a stopped run picks up where it left off) */ (groups[s.lvl + '|' + s.wear] = groups[s.lvl + '|' + s.wear] || []).push(s);
  let n = 0; const made = [];
  for (const key of Object.keys(groups)) { const slot = of.slots[key]; if (!slot) { console.log('NO OUTFIT', key); continue; }
    const p = await ctx.newPage(); p.on('pageerror', e => console.log('page error:', e.message.slice(0, 120)));
    try { await p.goto(base + '/?wear=' + slot.file); await p.waitForFunction(() => document.querySelector('#stage canvas') && typeof avatar !== 'undefined' && avatar.canVisit && avatar.canVisit(), null, { timeout: 150000 }); await p.waitForTimeout(2500);
      await p.addScriptTag({ path: path.join(__dirname, 'paint.js') });
      for (const it of groups[key]) { const url = await p.evaluate(async it => { if (it.shot.bg) { const c = document.createElement('canvas'); c.width = 384; c.height = 704; PAINT[it.shot.bg](c.getContext('2d'), 384, 704); window.WIZRA_BG = c; } return await avatar.snapshot({ kind: 'selfie', id: 'x', ...it.shot }); }, it);
        if (!url || url.length < 2000) { console.log('FAILED', it.file); continue; } fs.writeFileSync(path.join(out, it.file + '.webp'), Buffer.from(url.split(',')[1], 'base64')); n++; made.push(it); console.log(n, it.file); }
    } catch (e) { console.log('GROUP FAILED', key, String(e.message).slice(0, 100)); } await p.close(); }
  fs.writeFileSync(path.join(out, 'manifest' + (only ? '-' + only : '') + '.json'), JSON.stringify(items.filter(s => fs.existsSync(path.join(out, s.file + '.webp'))).map(({ shot, wear, file, ...keep }) => ({ file: file + '.webp', ...keep }))));
  console.log(`made ${n} of ${items.length}`); await b.close();
})();
