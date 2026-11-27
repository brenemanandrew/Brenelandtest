// Tests the library side of the relay off the PC: a made-up VaM folder (loose scenes, looks, poses, and .var packages built
// with Python's zipfile, stored and deflated), a stand-in Hub API with downloads, and the plugin's command round trip.
// Run: node vam/test/library.test.mjs   (needs python3; writes only to a temp folder)
// --shots <dir> also takes phone and PC pictures of the page with Playwright.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RELAY = path.join(HERE, '..', 'relay', 'brene-relay.mjs');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'brene-lib-')), VAM = path.join(T, 'VaM');

// a small coloured JPEG per item, so thumbnails are real images (made with Python, no packages: a 1x1 baseline JPEG is fixed bytes)
let JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=', 'base64');
try { JPG = execFileSync('python3', ['-I', '-c', "import io,sys;from PIL import Image,ImageDraw\nim=Image.new('RGB',(256,256));d=ImageDraw.Draw(im)\nfor y in range(256): d.line([(0,y),(255,y)],fill=(40+y//2,60,160-y//3))\nd.ellipse([70,50,186,166],fill=(250,200,120))\nb=io.BytesIO();im.save(b,'JPEG');sys.stdout.buffer.write(b.getvalue())"]); } catch { /* no PIL: the 1x1 image */ }
const put = (rel, data) => { const f = path.join(VAM, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
put('Saves/scene/Beach Day.json', '{}'); put('Saves/scene/Beach Day.jpg', JPG);
put('Saves/scene/Studio/Night Club.json', '{}');
put('Custom/Atom/Person/Appearance/Preset_Goth.vap', '{}'); put('Custom/Atom/Person/Appearance/Preset_Goth.jpg', JPG);
put('Custom/Atom/Person/Pose/Preset_Wave.vap', '{}');
put('Custom/Atom/Person/Hair/Preset_Bob.vap', '{}'); put('Custom/Atom/Person/Hair/Preset_Bob.jpg', JPG); put('Custom/Atom/Person/Clothing/Preset_Hoodie.vap', '{}'); put('Custom/Atom/Person/Skin/Preset_Pale.vap', '{}');
put('Saves/scene/notes.txt', 'not a scene');
const mkVar = (name, files, deflate) => execFileSync('python3', ['-I', '-c', `
import sys, zipfile, json
out, files, d = sys.argv[1], json.loads(sys.argv[2]), sys.argv[3] == '1'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED if d else zipfile.ZIP_STORED) as z:
    for n, t in files.items(): z.writestr(n, bytes.fromhex(t))
`, path.join(VAM, 'AddonPackages', name), JSON.stringify(files), deflate ? '1' : '0']);
fs.mkdirSync(path.join(VAM, 'AddonPackages', 'Sub'), { recursive: true });
mkVar('Maker.CityScenes.3.var', { 'meta.json': Buffer.from('{}').toString('hex'), 'Saves/scene/Rooftop.json': Buffer.from('{"a":1}').toString('hex'), 'Saves/scene/Rooftop.jpg': JPG.toString('hex'), 'Saves/scene/Alley.json': '7b7d' }, true);
mkVar('Sub/Other.Looks.1.var', { 'Custom/Atom/Person/Appearance/Preset_Elf.vap': '7b7d', 'Custom/Atom/Person/Appearance/Preset_Elf.jpg': JPG.toString('hex') }, false);
fs.writeFileSync(path.join(VAM, 'AddonPackages', 'Broken.Pkg.1.var'), 'not a zip at all');

// stand-in Hub: the API and two downloads (one good package, one that answers with a web page like a login wall)
const varBytes = fs.readFileSync(path.join(VAM, 'AddonPackages', 'Sub', 'Other.Looks.1.var'));
let hubCalls = [], sawConsent = '';
const hub = await new Promise(r => { const s = http.createServer(async (req, res) => {
  let b = ''; for await (const c of req) b += c;
  if (req.url === '/api') { const j = JSON.parse(b); hubCalls.push(j); res.writeHead(200, { 'content-type': 'application/json' });
    if (j.action === 'getResources') return res.end(JSON.stringify({ status: 'success', pagination: { page: '1', total_pages: 3, total_found: 70 }, resources: [{ resource_id: '11', title: 'Sunset Pier', username: 'maker', type: 'Scenes', tag_line: 'A pier', image_url: '/img.jpg', download_count: '1200', rating_avg: '4.6', rating_count: '9', hub_hosted: '1' }] }));
    if (j.action === 'getResourceDetail') return res.end(JSON.stringify({ resource_id: j.resource_id, title: 'Sunset Pier', username: 'maker', type: 'Scenes', tag_line: 'A pier', image_url: '/img.jpg', version_string: 'v2', download_count: '1200', rating_avg: '4.6', tags: 'scene,pier', hubDownloadable: 'true',
      hubFiles: [{ filename: j.resource_id === '13' ? 'Evil.Pkg.1.var' : 'Maker.Pier.2.var', file_size: String(varBytes.length), urlHosted: j.resource_id === '13' ? 'https://evil.example.com/x.var' : 'https://hub.virtamate.com/dl/pier' }],
      dependencies: { 'Maker.Pier.2': [{ filename: 'Maker.CityScenes.3', file_size: '10', downloadUrl: 'https://hub.virtamate.com/dl/city' }, { filename: j.resource_id === '12' ? 'Locked.Pkg.1' : 'Dep.Thing.1', file_size: '10', downloadUrl: 'https://hub.virtamate.com/dl/' + (j.resource_id === '12' ? 'locked' : 'dep') }] } })); }
  if (req.url.startsWith('/dl/')) { sawConsent = String(req.headers.cookie || ''); if (req.url === '/dl/locked') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html>log in</html>'); } res.writeHead(200); return res.end(varBytes); }
  res.writeHead(404); res.end();
}); s.listen(0, '127.0.0.1', () => r(s)); });
const H = `http://127.0.0.1:${hub.address().port}`;
// the relay only downloads from hub.virtamate.com; the test points that host at the stand-in through a fetch shim loaded with --import
const shim = path.join(T, 'shim.mjs');
fs.writeFileSync(shim, `const real = globalThis.fetch; globalThis.fetch = (u, o) => { const s = String(u); return real(s.startsWith('https://hub.virtamate.com/') ? '${H}' + s.slice('https://hub.virtamate.com'.length) : s, o); };`);

const PORT = 18781, B = `http://127.0.0.1:${PORT}`;
const relay = spawn('node', ['--import', shim, RELAY, '--port', String(PORT), '--bridge', 'ws://127.0.0.1:18799', '--data', path.join(T, 'data.json'), '--hub-api', H + '/api'], { stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; relay.stdout.on('data', d => out += d); relay.stderr.on('data', d => out += d);
const get = async p => { const r = await fetch(B + p); return r.headers.get('content-type')?.includes('json') ? r.json() : r; };
const post = async (p, o) => (await fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) })).json();

try {
  await sleep(700);
  let s = await get('/lib/state'); ok(s.folder === '' && !s.vam.connected, 'no folder set yet, VaM not connected');
  let r = await post('/lib/folder', { folder: path.join(T, 'nope') }); ok(r.error && /AddonPackages/.test(r.error), 'a wrong folder is refused in plain words');
  r = await post('/lib/folder', { folder: VAM }); ok(r.ok, 'VaM folder set and read');
  s = await get('/lib/state'); ok(s.counts.scene === 4 && s.counts.look === 2 && s.counts.pose === 1 && s.counts.hair === 1 && s.counts.clothing === 1 && s.counts.skin === 1, `counts: ${JSON.stringify(s.counts)} (4 scenes, 2 looks, 1 pose)`);
  ok(/1 package/.test(s.error), 'the broken package is reported, not fatal: ' + s.error);
  let l = await get('/lib/items?kind=scene'); const names = l.items.map(i => i.name).sort().join(',');
  ok(names === 'Alley,Beach Day,Night Club,Rooftop', 'scenes from loose files, a subfolder and a package: ' + names);
  const roof = l.items.find(i => i.name === 'Rooftop'); ok(roof.path === 'Maker.CityScenes.3:/Saves/scene/Rooftop.json' && roof.creator === 'Maker', 'package scenes use VaM\'s package path');
  let t = await get('/lib/thumb?p=' + encodeURIComponent(roof.thumb)); let buf = Buffer.from(await t.arrayBuffer());
  ok(t.status === 200 && buf.equals(JPG), 'thumbnail read out of a deflated package');
  const elf = (await get('/lib/items?kind=look')).items.find(i => i.name === 'Elf');
  t = await get('/lib/thumb?p=' + encodeURIComponent(elf.thumb)); buf = Buffer.from(await t.arrayBuffer()); ok(buf.equals(JPG), 'thumbnail read out of a stored package in a subfolder');
  t = await get('/lib/thumb?p=' + encodeURIComponent('Saves/scene/Beach Day.jpg')); ok(t.status === 200, 'loose thumbnail served');
  t = await get('/lib/thumb?p=' + encodeURIComponent('../../etc/passwd.jpg')); ok(t.status === 404, 'paths out of the VaM folder refused');
  l = await get('/lib/items?kind=hair&limit=1'); ok(l.items.length === 1 && l.items[0].name === 'Bob' && l.items[0].thumb, 'hair presets listed with thumbnails (for the Character panel)');
  r = await post('/lib/open', { kind: 'clothing', path: 'Custom/Atom/Person/Clothing/Preset_Hoodie.vap', person: 'Person' }); ok(r.id, 'clothing can be sent to VaM'); await post('/vam', { done: r.id });
  l = await get('/lib/items?kind=scene&q=roof'); ok(l.items.length === 1 && l.items[0].name === 'Rooftop', 'search');
  l = await get('/lib/items?kind=scene&filter=mine'); ok(l.items.length === 2, 'filter Mine (loose files only)');
  await post('/lib/fav', { path: roof.path, on: true }); l = await get('/lib/items?kind=scene&filter=favs'); ok(l.items.length === 1 && l.items[0].fav, 'favourites saved');
  l = await get('/lib/items?kind=scene'); ok(l.items[0].name === 'Rooftop', 'favourites sort first');

  // the plugin round trip
  await post('/vam', { people: ['Person', 'Person#2'], selected: 'Person#2' });
  s = await get('/lib/state'); ok(s.vam.connected && s.vam.people.length === 2 && s.vam.selected === 'Person#2', 'the plugin\'s report shows people and the selected one');
  r = await post('/lib/open', { kind: 'look', path: elf.path, person: 'Person' }); ok(r.id && r.vam, 'look queued'); ok(r.id > 100000, 'command ids start from the clock, so a restarted relay cannot repeat an id VaM already ran: ' + r.id);
  let st = await get('/state'); ok(st.cmd && st.cmd.kind === 'look' && st.cmd.person === 'Person' && st.cmd.path === elf.path, '/state hands the command to the plugin');
  st = await get('/state'); ok(st.cmd && st.cmd.id === r.id, 'a look stays queued until the plugin reports it done');
  await post('/vam', { people: ['Person'], done: r.id, error: 'This VaM version names the preset path differently' });
  let res = await get('/lib/result?id=' + r.id); ok(res.ok === false && /preset path/.test(res.error), 'the plugin\'s error comes back to the page');
  st = await get('/state'); ok(!st.cmd, 'queue empty after done');
  r = await post('/lib/open', { kind: 'scene', path: roof.path }); st = await get('/state'); const st2 = await get('/state');
  ok(st.cmd && st.cmd.kind === 'scene' && !st2.cmd, 'a scene load is handed over once (a reloading scene cannot repeat it)');
  l = await get('/lib/items?kind=scene&filter=recent'); ok(l.items[0].name === 'Rooftop', 'recent list');
  r = await post('/lib/open', { kind: 'evil', path: 'x' }); ok(r.error, 'unknown command kinds refused');

  // the Hub
  let h = await get('/lib/hub?sort=Rating&type=Scenes&q=pier'); const call = hubCalls.at(-1);
  ok(h.items.length === 1 && h.items[0].title === 'Sunset Pier' && h.items[0].downloads === 1200 && h.pages === 3, 'hub list mapped');
  ok(call.sort === 'Rating' && call.type === 'Scenes' && call.search === 'pier' && call.category === 'Free', 'hub list asks the Hub with sort, type, search, Free');
  let d = await get('/lib/hub/item?id=11'); ok(d.canInstall && d.files[0].filename === 'Maker.Pier.2.var' && d.deps.length === 2, 'hub detail with files and dependencies');
  ok(d.deps.find(x => x.filename === 'Maker.CityScenes.3.var').installed && !d.deps.find(x => x.filename === 'Dep.Thing.1.var').installed, 'already-installed dependency recognised');
  let { job } = await post('/lib/hub/install', { id: '11' }); let j;
  for (let i = 0; i < 30; i++) { await sleep(150); j = await get('/lib/hub/job?id=' + job); if (j.state === 'done' || j.state === 'failed') break; }
  ok(j.state === 'done' && j.got.sort().join(',') === 'Dep.Thing.1.var,Maker.Pier.2.var', 'install downloads the package and the missing dependency only: ' + (j.error || j.got.join(',')));
  ok(fs.existsSync(path.join(VAM, 'AddonPackages', 'Maker.Pier.2.var')) && !fs.readdirSync(path.join(VAM, 'AddonPackages')).some(f => f.endsWith('.part')), 'written into AddonPackages, no leftovers');
  ok(sawConsent.includes('vamhubconsent=yes'), 'downloads send the Hub consent cookie');
  st = await get('/state'); ok(st.cmd && st.cmd.kind === 'rescan', 'VaM is asked to rescan its packages');
  ({ job } = await post('/lib/hub/install', { id: '12' }));
  for (let i = 0; i < 30; i++) { await sleep(150); j = await get('/lib/hub/job?id=' + job); if (j.state === 'done' || j.state === 'failed') break; }
  ok(j.state === 'failed' && /did not download as a package/.test(j.error) && !fs.existsSync(path.join(VAM, 'AddonPackages', 'Locked.Pkg.1.var')), 'a web page instead of a package is refused and not saved');
  ({ job } = await post('/lib/hub/install', { id: '13' }));
  for (let i = 0; i < 30; i++) { await sleep(150); j = await get('/lib/hub/job?id=' + job); if (j.state === 'done' || j.state === 'failed') break; }
  ok(j.state === 'failed' && /not from the Hub/.test(j.error), 'downloads from anywhere but the Hub refused');

  const page = await (await fetch(B + '/library')).text(); ok(page.includes('Brene <span>Library</span>') && page.includes('/lib/items'), 'library page served');

  // pictures
  const si = process.argv.indexOf('--shots');
  if (si > 0) {
    const dir = process.argv[si + 1]; fs.mkdirSync(dir, { recursive: true });
    const { chromium } = (await import('node:module')).createRequire(import.meta.url)('playwright'); const br = await chromium.launch();
    for (const [name, vp, tab] of [['phone-scenes', { width: 390, height: 844 }, 'scene'], ['phone-hub', { width: 390, height: 844 }, 'hub'], ['pc-looks', { width: 1280, height: 800 }, 'look']]) {
      const p = await br.newPage({ viewport: vp });
      await p.route('**/img.jpg', rt => rt.fulfill({ contentType: 'image/jpeg', body: JPG }));
      await p.addInitScript(() => { if (!location.hash) localStorage.breneTour = '1'; });
      await p.goto(B + '/library'); await p.waitForTimeout(600);
      if (tab !== 'scene') { await p.click(`.tab[data-tab="${tab}"]`); await p.waitForTimeout(700); }
      await p.screenshot({ path: path.join(dir, name + '.png') });
      if (name === 'phone-scenes') { await p.click('.tile'); await p.waitForTimeout(400); await p.screenshot({ path: path.join(dir, 'phone-sheet.png') }); }
      await p.close();
    }
    { const p = await br.newPage({ viewport: { width: 390, height: 844 } }); await p.goto(B + '/library#tour'); await p.waitForTimeout(1600);
      const shown = await p.$('.tour-card'); ok(!!shown, 'first visit starts the tour'); await p.screenshot({ path: path.join(dir, 'phone-tour1.png') });
      await p.click('#tn'); await p.click('#tn'); await p.click('#tn'); await p.waitForTimeout(400); await p.screenshot({ path: path.join(dir, 'phone-tour4.png') });
      for (let i = 0; i < 3; i++) await p.click('#tn'); ok(!(await p.$('.tour-card')) && await p.evaluate(() => localStorage.breneTour === '1'), 'Finish closes the tour and it does not come back'); await p.close(); }
    await br.close(); console.log('pictures in ' + dir);
  }
} catch (e) { fail++; console.log('FAIL ' + (e.stack || e)); console.log(out); }
finally { relay.kill(); hub.close(); fs.rmSync(T, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
