/* Projects: what the hub knows about each of Andrew's projects, so a request can be checked against what already
   exists, what is broken and what the rules are, before anything is built twice.

   Two layers per project:
     1. The card (projects/<id>.json): curated. What it is, where it lives, tools, settings, what works, what is broken,
        what is open, rules for agents, things not to redo, and SOURCES.
     2. Live notes (data/projects-live.json): read from the sources on a timer. Sections of those files headed like
        "known issues", "not done", "open", "wishlist", "next", "gaps" are pulled out, and what was added since the last
        read is kept as a change log. So when a repo's README or HANDOFF gets a new known issue, the hub knows.

   Source kinds
     github          a file in a repo (public works without a token; private needs GITHUB_TOKEN on the hub)
     github-commits  the latest commit messages of a repo
     url             a public page
     pc-file         a file on Andrew's PC (Google Drive for desktop, F:\Projects); read by the PC worker,
                     only inside the folders in its READ_ROOTS setting */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as U from './updates.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CARDS = path.join(HERE, 'projects');
const LIVE = path.join(process.env.DATA_DIR || './data', 'projects-live.json');
let live = {};
try { live = JSON.parse(fs.readFileSync(LIVE, 'utf8')); } catch { /* first run */ }
const saveLive = () => { fs.mkdirSync(path.dirname(LIVE), { recursive: true }); fs.writeFileSync(LIVE, JSON.stringify(live, null, 1)); };

export function cards() {
  return fs.readdirSync(CARDS).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(CARDS, f), 'utf8')));
}
export const card = id => cards().find(c => c.id === id);
export const liveFor = id => live[id] || { sources: {}, changes: [] };

/* ---- reading sources ---- */
const srcKey = s => s.kind + ':' + (s.repo || '') + ':' + (s.path || s.url || '');
const WANT = /(known|gaps?\b|not done|broken|bugs?\b|issues?\b|problems?\b|todo|to do|open items|open questions|wishlist|next steps?|up next|state of|missing|parked|lessons?\b|not tested|still|blocked|risks?\b|recent changes)/i;

/* pull the useful lines out of a markdown file: bullets and table rows under headings that sound like problems or plans */
export function extract(text) {
  /* a WoW addon .toc: the ## lines are the useful part */
  if (/^##\s*Interface:/m.test(text)) return String(text).split('\n').map(l => l.match(/^##\s*(Title|Notes|Version|Interface|Author|SavedVariables\w*|Dependencies|X-[\w-]+):\s*(.*)$/i)).filter(Boolean).map(m => ({ section: 'Addon info', text: `${m[1]}: ${m[2].replace(/\|c[0-9a-f]{8}|\|r/gi, '').trim()}` }));
  const items = []; let section = '', keep = false;
  for (const raw of String(text).split('\n')) {
    const h = raw.match(/^#{1,4}\s+(.*)/);
    if (h) { section = h[1].replace(/[*`]/g, '').trim(); keep = WANT.test(section); continue; }
    if (!keep) continue;
    const b = raw.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
    const row = !b && raw.match(/^\|\s*([^|]+?)\s*\|/);
    const t = (b ? b[1] : row && !/^[-:\s]+$/.test(row[1]) && !/^(lesson|what|item|name)$/i.test(row[1]) ? row[1] : '').replace(/\*\*/g, '').trim();
    if (t && t.length > 8) items.push({ section, text: t.slice(0, 300) });
  }
  return items;
}

/* a refused token (expired, or the wrong one) should not stop public repos from syncing: try once without it */
async function ghFetch(url, headers) {
  let r = await fetch(url, { headers });
  if ((r.status === 401 || r.status === 403) && headers.authorization) { const { authorization, ...rest } = headers; r = await fetch(url, { headers: rest }); }
  return r;
}
async function fetchSource(s) {
  const gh = { 'user-agent': 'hub', accept: 'application/vnd.github.raw+json', ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  if (s.kind === 'github') { const r = await ghFetch(`https://api.github.com/repos/${s.repo}/contents/${s.path}`, gh); if (!r.ok) throw new Error(`GitHub ${r.status}${r.status === 404 ? ' (private repo needs GITHUB_TOKEN, or the path moved)' : ''}`); return r.text(); }
  if (s.kind === 'github-commits') { const r = await ghFetch(`https://api.github.com/repos/${s.repo}/commits?per_page=${s.count || 10}`, { ...gh, accept: 'application/vnd.github+json' }); if (!r.ok) throw new Error(`GitHub ${r.status}${r.status === 404 ? ' (private repo needs GITHUB_TOKEN)' : ''}`); const j = await r.json(); return '## Recent changes\n' + j.map(c => `- ${c.commit.message.split('\n')[0]} (${c.commit.author.date.slice(0, 10)})`).join('\n'); }
  if (s.kind === 'url') { const r = await fetch(s.url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }
  return null;
}

/* store one source's text; returns what was added since last time */
export function record(projectId, s, text) {
  const p = live[projectId] ||= { sources: {}, changes: [] };
  const key = srcKey(s), hash = crypto.createHash('sha1').update(text).digest('hex');
  const old = p.sources[key];
  if (old && old.hash === hash && !old.error) { old.checked = Date.now(); saveLive(); return []; }
  const items = extract(text);
  const before = new Set((old && old.items || []).map(i => i.text));
  const added = old ? items.filter(i => !before.has(i.text)) : [];
  p.sources[key] = { label: s.path || s.url || s.repo, hash, items, checked: Date.now(), changed: Date.now(), error: null };
  if (added.length) { p.changes.unshift({ at: Date.now(), source: s.path || s.repo, added: added.map(i => i.text).slice(0, 20) }); p.changes = p.changes.slice(0, 40); }
  saveLive(); return added;
}
function recordError(projectId, s, err) {
  const p = live[projectId] ||= { sources: {}, changes: [] };
  const key = srcKey(s); p.sources[key] = { ...(p.sources[key] || { label: s.path || s.url || s.repo, items: [] }), checked: Date.now(), error: String(err) };
  saveLive();
}

/* sync every cloud-readable source now; pc-file sources are handed back for the PC worker */
export async function sync(onlyId) {
  const pcJobs = [], report = [];
  for (const c of cards()) {
    if (onlyId && c.id !== onlyId) continue;
    for (const s of c.sources || []) {
      if (s.kind === 'pc-file') { pcJobs.push({ project: c.id, source: s }); continue; }
      try { const t = await fetchSource(s); const added = record(c.id, s, t); report.push(`${c.id}: ${s.path || s.repo} ${added.length ? added.length + ' new' : 'up to date'}`); }
      catch (e) { recordError(c.id, s, e.message || e); report.push(`${c.id}: ${s.path || s.repo} FAILED ${e.message || e}`); }
    }
  }
  return { report, pcJobs };
}
export function recordPc(projectId, s, ok, text, error) { return ok ? record(projectId, s, text) : (recordError(projectId, s, error), []); }

/* ---- using what is known ---- */
const lc = s => ' ' + String(s || '').toLowerCase().replace(/[^a-z0-9.\- ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
const STOP = new Set('a an and the of to in on for with you your my me it its is are be as at by or so this that then them they their there have has use make like get some one when what will can just also more very not but from into out was were been than only does doesnt dont need want should would could about after before over under each every all any'.split(' '));
const words = s => new Set(lc(s).trim().split(' ').filter(w => w.length > 3 && !STOP.has(w)));

/* which project a thought is about */
export function match(text) {
  const t = lc(text);
  const scored = cards().filter(c => !c.archived).map(c => ({ c, s: (c.keywords || []).reduce((n, k) => n + (t.includes(' ' + k.toLowerCase() + ' ') || t.includes(' ' + k.toLowerCase()) ? (k.includes(' ') ? 2 : 1) : 0), 0) + (t.includes(' ' + c.id + ' ') ? 2 : 0) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  return scored[0] ? scored[0].c : null;
}

/* what the hub already knows that touches this request: broken things, open work, things not to redo, tools that exist */
export function hints(c, text, n = 6) {
  if (!c) return [];
  const w = words(text), out = [];
  const consider = (kind, t) => { const shared = [...words(t)].filter(x => w.has(x)); if (shared.length >= 2 || (shared.length === 1 && w.size <= 4)) out.push({ kind, text: t, score: shared.length }); };
  for (const t of c.broken || []) consider('known problem', t);
  for (const t of c.open || []) consider('already planned', t);
  for (const t of c.avoid_redoing || []) consider('do not redo', t);
  for (const t of c.working || []) consider('already works', t);
  for (const tl of c.tools || []) consider('existing tool', `${tl.name}: ${tl.what}`);
  for (const s of Object.values(liveFor(c.id).sources)) for (const i of s.items || []) consider(`from ${s.label}`, i.text);
  for (const u of U.list(c.id, 15)) { for (const t of u.broken) consider(`broken, update ${u.date}`, t); for (const t of u.open) consider(`open, update ${u.date}`, t); for (const t of u.done) consider(`done ${u.date}`, t); }
  /* the same issue often sits in the card and in the project's own notes: keep the first of near-duplicates */
  const kept = [];
  for (const h of out.sort((a, b) => b.score - a.score)) { const hw = words(h.text); if (!kept.some(k => { const kw = words(k.text); const same = [...hw].filter(x => kw.has(x)).length; return same / Math.min(hw.size, kw.size || 1) >= 0.7; })) kept.push(h); }
  return kept.slice(0, n);
}

/* project context for an agent. The amount depends on who gets it:
     code   (Claude Code): only the rules and the do-not-redo list, plus the hints for this request
     cloud  (Claude API) : the card without settings values; nothing at all for a private (work) project
     local  (PC model)   : everything */
export function context(c, who, text) {
  if (!c) return '';
  if (who === 'cloud' && c.private) return '';
  const L = (title, arr) => arr && arr.length ? `${title}:\n${arr.map(x => `- ${typeof x === 'string' ? x : x.name ? `${x.name}${x.what ? ': ' + x.what : ''}${x.value && who === 'local' ? ' = ' + x.value : ''}` : x.text}`).join('\n')}` : '';
  const h = hints(c, text || '');
  if (who === 'code') return [`Project: ${c.name}.`, L('Rules', c.rules), L('Already exists or was decided, do not redo', c.avoid_redoing), h.length ? L('Known about this request', h.map(x => `${x.kind}: ${x.text}`)) : ''].filter(Boolean).join('\n\n');
  const recent = liveFor(c.id).changes.slice(0, 3).flatMap(x => x.added).slice(0, 8);
  const ups = U.list(c.id, 5).map(u => `${u.date} ${u.title}${u.broken.length ? ' (broken: ' + u.broken.slice(0, 2).join('; ') + ')' : ''}`);
  return [`Project: ${c.name}. ${c.what}`, L('Where', c.where), L('Tools', c.tools), L('Settings', c.settings), L('Works', c.working), L('Known problems', c.broken), L('Open', c.open), L('Rules', c.rules), L('Do not redo', c.avoid_redoing), recent.length ? L('Recently added to its notes', recent) : '', ups.length ? L('Latest updates from Claude sessions', ups) : '', h.length ? L('Most relevant to this request', h.map(x => `${x.kind}: ${x.text}`)) : ''].filter(Boolean).join('\n\n');
}
