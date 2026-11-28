/* Tags: a word or two at the start of a request that says what it is about, so it is sorted at once.
     "SUI: the bag frame overlaps the minimap"      -> the SUI project
     "Hubbell Kaizen: too much walking at receiving" -> the work project, Expert in Kaizen mode
     "Vent: ..."                                     -> the Companion in Vent mode
   A tag can set a project, a focus inside it, an area, and a tool + mode. Several can be chained before the colon.
   Without a colon, a known tag as the first word still counts. Andrew can add, change and remove tags on the Tools tab;
   they are kept in DATA_DIR/tags.json, and these are the defaults. */
import fs from 'fs';
import path from 'path';

export const DEFAULT_TAGS = [
  { tag: 'SUI', project: 'sui', note: 'the WoW addon' },
  { tag: 'WoW', project: 'sui', note: 'the WoW addon' },
  { tag: 'Hubbell', project: 'work', area: 'work', note: 'work or a work tool' },
  { tag: 'Arden', project: 'work', area: 'work', note: 'work or a work tool' },
  { tag: 'Work', project: 'work', area: 'work', note: 'work or a work tool' },
  { tag: 'Staging Lane', project: 'work', area: 'work', focus: 'Staging Lane Health', note: 'the staging lane dashboard' },
  { tag: 'Pack', project: 'work', area: 'work', focus: 'Arden Pack', note: 'the pack board' },
  { tag: 'Kiosk', project: 'work', area: 'work', focus: 'Weekend Overtime kiosk (ardenot)', repo: 'brenemanandrew/ardenot', note: 'the overtime kiosk' },
  { tag: 'OT', project: 'work', area: 'work', focus: 'Weekend Overtime kiosk (ardenot)', repo: 'brenemanandrew/ardenot', note: 'the overtime kiosk' },
  { tag: 'Arden Hub', project: 'work', area: 'work', focus: 'Arden Hub', repo: 'brenemanandrew/Arden-hub', note: 'the floor dashboard hub' },
  { tag: 'Wizra', project: 'brenai', note: 'your AI companion and her tools' },
  { tag: 'Brenai', project: 'brenai', note: 'your AI companion and her tools' },
  { tag: 'Breneland', project: 'breneland', note: 'Breneland or one of its games' },
  { tag: 'Builder', project: 'breneland', focus: 'character builder test', note: 'the character builder' },
  { tag: 'Rig', project: 'brenerig', note: 'Brenerig, rigging and posing' },
  { tag: 'Brenerig', project: 'brenerig', note: 'Brenerig, rigging and posing' },
  { tag: 'Brenebase', project: 'brenebase', note: 'this hub' },
  { tag: 'Valinfor', project: 'valinfor', note: 'Valinfor' },
  { tag: 'KVM', project: 'home-kvm', note: 'archived: Home KVM' },
  { tag: 'IFP', project: 'ifp-tv-panel', note: 'archived: IFP TV panel' },
  { tag: 'OptiPlex', project: 'optiplex-cleanup', note: 'archived: OptiPlex PC cleanup' },
  { tag: 'Vent', tool: 'companion', mode: 'vent', area: 'personal', note: 'let off steam (PC model)' },
  { tag: 'Roleplay', tool: 'companion', mode: 'roleplay', area: 'personal', note: 'roleplay (PC model)' },
  { tag: 'RP', tool: 'companion', mode: 'roleplay', area: 'personal', note: 'roleplay (PC model)' },
  { tag: 'Kaizen', tool: 'expert', mode: 'kaizen', note: 'lean / kaizen expert' },
  { tag: 'Plan', tool: 'planner', mode: 'plan', note: 'project plan' },
  { tag: 'Fix', tool: 'coder', mode: 'fix', note: 'fix a bug' },
  { tag: 'Build', tool: 'coder', mode: 'build', note: 'build a feature' },
  { tag: 'Script', tool: 'coder', mode: 'script', note: 'a small script' },
  { tag: 'Copilot', tool: 'copilot', mode: 'summarize', note: 'plain safe work in Copilot' },
  { tag: '3D', tool: 'make3d', note: '3D (mode picked by the rules)' },
  { tag: 'Mocap', tool: 'motion', mode: 'capture', note: 'motion capture' },
];

const FILE = path.join(process.env.DATA_DIR || './data', 'tags.json');
export function tags() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return DEFAULT_TAGS; } }
export function saveTags(list) {
  const clean = (list || []).filter(t => t && t.tag && String(t.tag).trim()).map(t => ({ ...t, tag: String(t.tag).trim().slice(0, 30) }));
  fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(clean, null, 1)); return clean;
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* text -> { found: [tags], project, focus, area, tool, mode, rest } */
export function read(text) {
  const all = tags().slice().sort((a, b) => b.tag.length - a.tag.length);
  let rest = String(text || '').trimStart(), found = [];
  const colon = rest.match(/^([^:\n]{1,60}):\s*/);
  if (colon) {
    /* everything before the colon must be known tags, else it is ordinary text ("Note: ...") */
    let head = colon[1].trim(), ok = true;
    while (head) {
      const t = all.find(t => new RegExp(`^${esc(t.tag)}(\\s+|[,+/&]\\s*|$)`, 'i').test(head));
      if (!t) { ok = false; break; }
      found.push(t); head = head.replace(new RegExp(`^${esc(t.tag)}[\\s,+/&]*`, 'i'), '');
    }
    if (ok && found.length) rest = rest.slice(colon[0].length); else found = [];
  }
  if (!found.length) {
    /* no colon: a known tag as the first word(s) still counts, and the words stay in the text */
    const t = all.find(t => new RegExp(`^${esc(t.tag)}\\b`, 'i').test(rest));
    if (t) found.push(t);
  }
  const tg = all.filter(t => found.includes(t));
  const ordered = found.map(f => tg.find(t => t === f));
  const project = (ordered.find(t => t.project) || {}).project;
  const same = ordered.filter(t => !t.project || t.project === project);
  const pick = k => (same.find(t => t[k]) || {})[k];
  const projects = [...new Set(ordered.map(t => t.project).filter(Boolean))];
  return { found: found.map(t => t.tag), project, projects, focus: pick('focus'), repo: pick('repo'), area: pick('area'), tool: pick('tool'), mode: pick('mode'), rest };
}
