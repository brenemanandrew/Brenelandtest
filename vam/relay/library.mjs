// Brene Library: the data side of the library page (scenes, looks, poses on this PC, and the VaM Hub).
//   Your files    reads the VaM folder: loose files under Saves/scene and Custom/Atom/Person/{Appearance,Pose}, and the same
//                 inside every .var package in AddonPackages (a .var is a zip; only its index and thumbnails are read).
//   The Hub       hub.virtamate.com's own API (the one VaM's Hub browser uses), only while the Hub tab is open.
//                 Install downloads the package and any missing dependencies into AddonPackages, then asks VaM to rescan.
//   VaM           "Load" and "Apply" queue a command; the plugin picks it up on its next poll and reports back.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

export const HUB_API = 'https://hub.virtamate.com/citizenx/api.php';
const HUB_HOSTS = new Set(['hub.virtamate.com']);
const KINDS = [
  { kind: 'scene', dir: 'Saves/scene/', ext: '.json' },
  { kind: 'look', dir: 'Custom/Atom/Person/Appearance/', ext: '.vap' },
  { kind: 'pose', dir: 'Custom/Atom/Person/Pose/', ext: '.vap' },
];
const kindOf = name => { const n = name.replace(/\\/g, '/'); for (const k of KINDS) if (n.startsWith(k.dir) && n.toLowerCase().endsWith(k.ext)) return k.kind; return null; };

// ---- .var (zip) reading: the central directory only, then single entries on demand ----
export async function zipIndex(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const size = (await fh.stat()).size, tail = Math.min(size, 66000), buf = Buffer.alloc(tail);
    await fh.read(buf, 0, tail, size - tail);
    let eocd = -1; for (let i = tail - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('not a zip');
    const count = buf.readUInt16LE(eocd + 10), cdSize = buf.readUInt32LE(eocd + 12), cdOff = buf.readUInt32LE(eocd + 16);
    if (cdOff === 0xffffffff) throw new Error('zip64 not supported');
    const cd = Buffer.alloc(cdSize); await fh.read(cd, 0, cdSize, cdOff);
    const out = []; let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break;
      const method = cd.readUInt16LE(p + 10), csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
      const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32), off = cd.readUInt32LE(p + 42);
      out.push({ name: cd.toString('utf8', p + 46, p + 46 + nl), method, csize, usize, off });
      p += 46 + nl + xl + cl;
    }
    return out;
  } finally { await fh.close(); }
}
export async function zipRead(file, e) {
  const fh = await fsp.open(file, 'r');
  try {
    const h = Buffer.alloc(30); await fh.read(h, 0, 30, e.off);
    if (h.readUInt32LE(0) !== 0x04034b50) throw new Error('bad entry');
    const start = e.off + 30 + h.readUInt16LE(26) + h.readUInt16LE(28), data = Buffer.alloc(e.csize);
    await fh.read(data, 0, e.csize, start);
    if (e.method === 0) return data;
    if (e.method === 8) return zlib.inflateRawSync(data);
    throw new Error('unsupported compression ' + e.method);
  } finally { await fh.close(); }
}

export class Library {
  constructor({ dataFile, vamDir, fetchImpl, hubApi }) {
    this.dataFile = dataFile; this.fetch = fetchImpl || fetch; this.hubApi = hubApi || HUB_API;
    this.data = { vam: '', favs: [], recent: [] };
    try { Object.assign(this.data, JSON.parse(fs.readFileSync(dataFile, 'utf8'))); } catch {}
    if (vamDir) this.data.vam = vamDir;
    this.items = []; this.scanned = 0; this.scanning = null; this.scanError = '';
    this.zips = new Map();    // var path -> { mtime, entries }
    this.cmds = []; this.nextCmd = 1; this.vam = { at: 0, people: [], selected: '' }; this.results = new Map();
    this.jobs = new Map(); this.nextJob = 1;
  }
  save() { try { fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 1)); } catch {} }
  get vamDir() { return this.data.vam; }
  setVam(dir) {
    dir = String(dir || '').trim().replace(/^"|"$/g, '');
    if (!dir || !fs.existsSync(path.join(dir, 'Saves')) && !fs.existsSync(path.join(dir, 'AddonPackages'))) throw new Error('That folder has no Saves or AddonPackages folder: pick the folder that holds VaM.exe');
    this.data.vam = dir; this.save(); this.items = []; this.scanned = 0; return this.scan();
  }

  // ---- scanning ----
  scan() {
    if (this.scanning) return this.scanning;
    this.scanning = this._scan().catch(e => { this.scanError = String(e.message || e); }).finally(() => { this.scanning = null; });
    return this.scanning;
  }
  async _scan() {
    const root = this.data.vam; if (!root) { this.scanError = 'Set your VaM folder first'; return; }
    const items = [];
    // loose files
    const walk = async (rel, kind, ext) => {
      let list = []; try { list = await fsp.readdir(path.join(root, rel), { withFileTypes: true }); } catch { return; }
      for (const d of list) {
        const r = rel + d.name;
        if (d.isDirectory()) await walk(r + '/', kind, ext);
        else if (d.name.toLowerCase().endsWith(ext)) {
          const st = await fsp.stat(path.join(root, r)).catch(() => null); if (!st) continue;
          const jpg = r.slice(0, -ext.length) + '.jpg';
          items.push({ kind, name: d.name.slice(0, -ext.length).replace(/^Preset_/i, ''), path: r, pkg: '', creator: 'Mine', folder: rel.split('/').slice(-2, -1)[0] || '', thumb: fs.existsSync(path.join(root, jpg)) ? jpg : '', mtime: st.mtimeMs });
        }
      }
    };
    for (const k of KINDS) await walk(k.dir, k.kind, k.ext);
    // packages
    const adir = path.join(root, 'AddonPackages'), vars = [];
    const findVars = async d => { let l = []; try { l = await fsp.readdir(d, { withFileTypes: true }); } catch { return; } for (const e of l) { const f = path.join(d, e.name); if (e.isDirectory()) await findVars(f); else if (e.name.toLowerCase().endsWith('.var')) vars.push(f); } };
    await findVars(adir);
    let bad = 0;
    for (const f of vars) {
      const st = await fsp.stat(f).catch(() => null); if (!st) continue;
      let z = this.zips.get(f);
      if (!z || z.mtime !== st.mtimeMs) { try { z = { mtime: st.mtimeMs, entries: await zipIndex(f) }; this.zips.set(f, z); } catch { bad++; continue; } }
      const pkg = path.basename(f).slice(0, -4), creator = pkg.split('.')[0] || '';
      const names = new Set(z.entries.map(e => e.name));
      for (const e of z.entries) {
        const kind = kindOf(e.name); if (!kind) continue;
        const ext = path.extname(e.name), jpg = e.name.slice(0, -ext.length) + '.jpg';
        items.push({ kind, name: path.basename(e.name, ext).replace(/^Preset_/i, ''), path: pkg + ':/' + e.name, pkg, creator, folder: '', thumb: names.has(jpg) ? pkg + ':/' + jpg : '', mtime: st.mtimeMs });
      }
    }
    this.items = items; this.scanned = Date.now(); this.scanError = bad ? `${bad} package(s) could not be read` : '';
  }

  list({ kind = 'scene', q = '', filter = 'all', limit = 600 } = {}) {
    const words = String(q).toLowerCase().split(/\s+/).filter(Boolean), favs = new Set(this.data.favs);
    let l = this.items.filter(i => i.kind === kind && words.every(w => (i.name + ' ' + i.creator + ' ' + i.pkg + ' ' + i.folder).toLowerCase().includes(w)));
    if (filter === 'favs') l = l.filter(i => favs.has(i.path));
    if (filter === 'mine') l = l.filter(i => !i.pkg);
    if (filter === 'packages') l = l.filter(i => i.pkg);
    if (filter === 'recent') { const order = this.data.recent; l = l.filter(i => order.includes(i.path)).sort((a, b) => order.indexOf(a.path) - order.indexOf(b.path)); }
    else l.sort((a, b) => (favs.has(b.path) - favs.has(a.path)) || b.mtime - a.mtime);
    return { total: l.length, items: l.slice(0, limit).map(i => ({ ...i, fav: favs.has(i.path) })), scanned: this.scanned, scanning: !!this.scanning, error: this.scanError, vam: this.data.vam };
  }

  async thumb(p) {
    const root = this.data.vam; if (!root || typeof p !== 'string' || !p.toLowerCase().endsWith('.jpg')) return null;
    const m = p.match(/^([^:/\\]+):\/(.+)$/);
    if (m) {
      const f = [...this.zips.keys()].find(k => path.basename(k) === m[1] + '.var');   // packages may sit in subfolders
      return f ? this._entry(f, m[2]) : null;
    }
    if (p.includes('..') || path.isAbsolute(p)) return null;
    try { return await fsp.readFile(path.join(root, p)); } catch { return null; }
  }
  async _entry(f, name) { const z = this.zips.get(f), e = z && z.entries.find(x => x.name === name); return e ? zipRead(f, e).catch(() => null) : null; }

  fav(p, on) { const s = new Set(this.data.favs); on ? s.add(p) : s.delete(p); this.data.favs = [...s]; this.save(); return on; }

  // ---- commands for the VaM plugin ----
  queue(cmd) {
    const c = { id: this.nextCmd++, ...cmd, at: Date.now() }; this.cmds.push(c); while (this.cmds.length > 20) this.cmds.shift();
    if (cmd.path) { this.data.recent = [cmd.path, ...this.data.recent.filter(x => x !== cmd.path)].slice(0, 40); this.save(); }
    return c;
  }
  nextFor() {
    const now = Date.now(); this.cmds = this.cmds.filter(c => now - c.at < 60000);
    const c = this.cmds[0] || null;
    // a scene load replaces the scene (and may restart a scene plugin before it can report), so it is handed over once and counted done
    if (c && (c.kind === 'scene' || c.kind === 'rescan')) { this.cmds.shift(); this.results.set(c.id, { ok: true }); }
    return c;
  }
  report(r) {
    this.vam = { at: Date.now(), people: Array.isArray(r.people) ? r.people.map(String).slice(0, 50) : [], selected: String(r.selected || '') };
    if (r.done != null) { const i = this.cmds.findIndex(c => c.id === +r.done); if (i >= 0) { this.results.set(+r.done, { ok: !r.error, error: String(r.error || '') }); this.cmds.splice(i, 1); } }
  }
  vamState() { return { connected: Date.now() - this.vam.at < 3000, people: this.vam.people, selected: this.vam.selected, pending: this.cmds.length }; }

  // ---- the Hub ----
  async hub(body) {
    const r = await this.fetch(this.hubApi, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: 'VaM', latest_image: 'Y', ...body }) });
    if (!r.ok) throw new Error('The Hub answered ' + r.status);
    const j = await r.json(); if (j.status && j.status !== 'success') throw new Error(j.error || 'The Hub said no');
    return j;
  }
  installed(filename) { const root = this.data.vam; if (!root) return false; const n = String(filename).replace(/\.var$/i, '') + '.var'; return [...this.zips.keys()].some(k => path.basename(k) === n) || fs.existsSync(path.join(root, 'AddonPackages', n)); }
  async hubList({ q = '', sort = 'Hot Picks', type = '', page = 1, category = 'Free' } = {}) {
    const j = await this.hub({ action: 'getResources', location: 'Hub And Dependencies', category, sort, type, search: q, searchall: 'true', page: String(page), perpage: '36' });
    return { page: +j.pagination.page, pages: j.pagination.total_pages, total: j.pagination.total_found, items: (j.resources || []).map(r => ({ id: r.resource_id, title: r.title, by: r.username, type: r.type, tag: r.tag_line, img: r.image_url, downloads: +r.download_count || 0, rating: +r.rating_avg || 0, ratings: +r.rating_count || 0, hub: r.hub_hosted === '1' || r.hubDownloadable === 'true' })) };
  }
  async hubItem(id) {
    const d = await this.hub({ action: 'getResourceDetail', resource_id: String(id) });
    const files = (d.hubFiles || []).map(f => ({ filename: f.filename, size: +f.file_size || 0, url: f.urlHosted, installed: this.installed(f.filename) }));
    const deps = []; const seen = new Set();
    for (const list of Object.values(d.dependencies || {})) for (const x of list || []) { if (seen.has(x.filename)) continue; seen.add(x.filename); deps.push({ filename: x.filename + '.var', size: +x.file_size || 0, url: x.downloadUrl, installed: this.installed(x.filename) }); }
    return { id: d.resource_id, title: d.title, by: d.username, type: d.type, tag: d.tag_line, img: d.image_url, version: d.version_string, downloads: +d.download_count || 0, rating: +d.rating_avg || 0, tags: String(d.tags || '').split(',').filter(Boolean), canInstall: d.hubDownloadable === 'true' && files.length > 0, files, deps };
  }
  install(id) {
    const job = { id: this.nextJob++, state: 'starting', done: 0, total: 0, file: '', error: '', got: [] }; this.jobs.set(job.id, job);
    (async () => {
      const root = this.data.vam; if (!root) throw new Error('Set your VaM folder first');
      const item = await this.hubItem(id); if (!item.canInstall) throw new Error('This one is not downloadable from the Hub');
      const todo = [...item.files, ...item.deps].filter(f => !f.installed); job.total = todo.length; job.state = 'downloading';
      const dir = path.join(root, 'AddonPackages'); await fsp.mkdir(dir, { recursive: true });
      for (const f of todo) {
        job.file = f.filename;
        const name = path.basename(f.filename); if (!/^[\w.\-]+\.var$/.test(name)) throw new Error('Odd file name from the Hub: ' + name);
        const u = new URL(f.url); if (u.protocol !== 'https:' || !HUB_HOSTS.has(u.hostname)) throw new Error('Download not from the Hub: ' + u.hostname);
        const r = await this.fetch(f.url, { headers: { cookie: 'vamhubconsent=yes' }, redirect: 'follow' });
        if (!r.ok) throw new Error(`Download failed (${r.status}) for ${name}`);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error(`${name} did not download as a package (the Hub may want a login for it)`);
        const tmp = path.join(dir, name + '.part'); await fsp.writeFile(tmp, buf); await fsp.rename(tmp, path.join(dir, name));
        job.got.push(name); job.done++;
      }
      job.state = 'done'; job.file = '';
      if (job.got.length) { this.queue({ kind: 'rescan' }); this.scan(); }
    })().catch(e => { job.state = 'failed'; job.error = String(e.message || e); });
    return job;
  }
}
