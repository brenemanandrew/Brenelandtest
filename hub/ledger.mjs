/* The ledger: every job, what went out, what came back. One JSON file on the data volume. */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DIR = process.env.DATA_DIR || './data';
const FILE = path.join(DIR, 'hub.json');
let db = { jobs: [] };
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* first run */ }
const save = () => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 1)); fs.renameSync(FILE + '.tmp', FILE); };

/* status: waiting (needs OK) -> queued (for the PC) -> running -> done | failed | cancelled */
export function add(job) {
  const j = { id: crypto.randomBytes(5).toString('hex'), at: Date.now(), status: 'waiting', log: [], ...job };
  db.jobs.unshift(j); db.jobs = db.jobs.slice(0, 500); save(); return j;
}
export const get = id => db.jobs.find(j => j.id === id);
export const list = (n = 50) => db.jobs.slice(0, n);
export function update(id, patch, note) {
  const j = get(id); if (!j) return null;
  Object.assign(j, patch, { updated: Date.now() });
  if (note) j.log.push({ at: Date.now(), note });
  save(); return j;
}
/* the PC worker asks for the oldest queued job it can do */
export function next(can) {
  const j = [...db.jobs].reverse().find(x => x.status === 'queued' && can.includes(x.backend));
  if (j) update(j.id, { status: 'running' }, 'picked up by the PC');
  return j || null;
}
