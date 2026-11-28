/* Update files: every Claude session that changes one of Andrew's projects leaves a short report, and Brenebase
   collects them on a timer, so the project cards always know what was done, tested, broken and still open.

   Where reports come from (all checked routinely):
     1. Repos: .brenebase/updates/*.md on the default branch and on recent claude/ branches of every project repo.
        Works from any Claude Code session: no key, no network, the file rides along with the commit.
     2. Drive / PC folders: e.g. G:\My Drive\Brenebase\updates, read by the PC worker. For claude.ai chats that can
        write to Drive, and for repos that only live on the PC (Breneland-Next on F:).
     3. Direct: POST /api/updates with the PC key, for sessions that can reach brenebase.fly.dev.
     4. Brenebase's own Claude Code jobs: a report is made from the job's reply when it finishes.

   Format (UPDATE-TEMPLATE.md):
     ---
     project: brenai            (card id: breneland, brenai, work, brenerig, valinfor; the repo is used if missing)
     by: Claude Code, cloud session
     date: 2026-11-21
     branch: claude/some-branch
     title: one line
     ---
     ## Done / ## Tested / ## Not tested / ## Broken / ## Open / ## Settings changed   (bullets under each) */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const FILE = path.join(process.env.DATA_DIR || './data', 'updates.json');
let db = { seen: {}, items: [] };
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* first run */ }
const save = () => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db, null, 1)); };

const SECTIONS = { done: /^done|^changed|^what (was )?(done|changed)/i, tested: /^tested|^verified/i, not_tested: /^not tested|^untested|^could not test/i, broken: /^broken|^known (issues|problems)|^bugs?/i, open: /^open|^next|^todo|^to do|^follow/i, settings: /^settings|^config/i };

export function parse(text, meta = {}) {
  const t = String(text || '').replace(/\r/g, '');
  const fm = {}; const m = t.match(/^---\n([\s\S]*?)\n---\n?/);
  if (m) for (const line of m[1].split('\n')) { const kv = line.match(/^(\w+):\s*(.*)$/); if (kv) fm[kv[1].toLowerCase()] = kv[2].trim(); }
  const body = m ? t.slice(m[0].length) : t;
  const out = { done: [], tested: [], not_tested: [], broken: [], open: [], settings: [] }; let cur = 'done';
  for (const line of body.split('\n')) {
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h) { cur = Object.keys(SECTIONS).find(k => SECTIONS[k].test(h[1].trim())) || null; continue; }
    const b = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
    if (b && cur) out[cur].push(b[1].trim().slice(0, 400));
  }
  const title = fm.title || (body.match(/^#\s+(.*)/m) || [])[1] || out.done[0] || 'Update';
  return { project: fm.project || meta.project || null, by: fm.by || meta.by || 'Claude', date: fm.date || meta.date || new Date().toISOString().slice(0, 10), branch: fm.branch || meta.branch || '', title: title.slice(0, 160), ...out, from: meta.from || '' };
}

/* add one report unless it was seen before (same source key and same content) */
export function add(text, meta) {
  const key = (meta.key || '') + ':' + crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 16);
  if (db.seen[key]) return null;
  const u = { id: crypto.randomBytes(4).toString('hex'), at: Date.now(), ...parse(text, meta) };
  if (!u.done.length && !u.broken.length && !u.open.length && !u.tested.length) return null;
  db.seen[key] = 1; db.items.unshift(u); db.items = db.items.slice(0, 500); save(); return u;
}
export const list = (project, n = 50) => db.items.filter(u => !project || u.project === project).slice(0, n);

/* ---- reading repos ---- */
async function gh(url) {
  const h = { 'user-agent': 'brenebase', accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  let r = await fetch(url, { headers: h });
  if ((r.status === 401 || r.status === 403) && h.authorization) { delete h.authorization; r = await fetch(url, { headers: h }); }
  return r;
}

/* every repo a card points at, with the project it belongs to */
export function repoMap(cards) {
  const m = {};
  for (const c of cards) {
    for (const r of [c.repo, ...Object.values(c.repos || {}), ...(c.sources || []).map(s => s.repo)]) if (r && /^[\w.-]+\/[\w.-]+$/.test(r)) m[r.toLowerCase()] ||= c.id;
  }
  return m;
}

export async function scanRepos(cards, { maxBranches = 8 } = {}) {
  const report = [], map = repoMap(cards);
  for (const [repo, project] of Object.entries(map)) {
    try {
      const br = await gh(`https://api.github.com/repos/${repo}/branches?per_page=100`);
      if (!br.ok) { report.push(`${repo}: branches ${br.status}`); continue; }
      const names = (await br.json()).map(b => b.name);
      const pick = names.filter(n => n === 'main' || n === 'master').concat(names.filter(n => /^claude\//.test(n)).slice(-maxBranches));
      let found = 0;
      for (const b of pick) {
        const d = await gh(`https://api.github.com/repos/${repo}/contents/.brenebase/updates?ref=${encodeURIComponent(b)}`);
        if (!d.ok) continue;
        for (const f of (await d.json()).filter(f => f.name.endsWith('.md'))) {
          const key = `gh:${repo}:${f.name}:${f.sha}`; if (db.seen[key + ':x']) continue;
          const raw = await gh(f.url); if (!raw.ok) continue;
          const j = await raw.json(); const text = Buffer.from(j.content || '', 'base64').toString('utf8');
          db.seen[key + ':x'] = 1;
          if (add(text, { key, project, branch: b, from: `${repo} ${b}` })) found++;
        }
      }
      save(); report.push(`${repo}: ${found} new update(s) across ${pick.length} branch(es)`);
    } catch (e) { report.push(`${repo}: ${e.message || e}`); }
  }
  return report;
}

/* files the PC worker sent back from an update folder */
export function fromPcFiles(files, folder) {
  let n = 0;
  for (const f of files || []) if (add(f.text, { key: `pc:${folder}:${f.name}:${f.mtime}`, from: `${folder}\\${f.name}` })) n++;
  return n;
}
