/* Vetting: the whole statement is read, whatever tag it starts with, and every part goes where it belongs.
   1. Tags at the start give the project, a focus and maybe a tool, as a head start, not a shortcut.
   2. The statement is cut into clauses and each clause is routed on its own.
   3. Clauses that land on the same tool are kept together; clauses too vague to route stay with the one before.
   4. One group: a normal job. Several groups: "Send as parts", one job per group, each still going through every check
      (keep-local split, private projects stay off the cloud, the Copilot fit check, OK gates).
      Code plus art or story for a game: the game Split (contract, slots, merge) is suggested instead. */
import { clauses, plan } from './parts.mjs';
import { ruleRoute } from './route.mjs';
import { resolve } from './tools.mjs';
import * as T from './tags.mjs';

export function vet(text) {
  const tg = T.read(text);
  const cs = clauses(tg.rest).map(c => c.text).filter(Boolean);
  const groups = [];
  for (const c of cs) {
    const r = ruleRoute(c);
    const strong = r.pick && r.confidence > 0;
    const key = strong ? r.pick.tool : null;
    const last = groups[groups.length - 1];
    if (!key || (last && last.tool === key)) { if (last) { last.text.push(c); continue; } }
    groups.push({ tool: key || (r.pick && r.pick.tool) || null, mode: r.pick && r.pick.mode, text: [c], why: r.why });
  }
  /* a tool tag decides the tool for the part that has none, and for a single-part statement */
  for (const g of groups) if (!g.tool && tg.tool) { g.tool = tg.tool; g.mode = tg.mode; }
  if (groups.length === 1 && tg.tool) { groups[0].tool = tg.tool; groups[0].mode = tg.mode || groups[0].mode; }
  /* merge neighbours that ended on the same tool, drop empty tools onto the planner as the safe default */
  const merged = [];
  for (const g of groups) { const l = merged[merged.length - 1]; if (l && l.tool === g.tool) l.text.push(...g.text); else merged.push({ ...g }); }
  const parts = merged.map(g => { const r = resolve(g.tool || 'planner', g.mode); return { tool: r.tool, mode: r.mode, label: r.label, text: g.text.join('. '), why: g.why }; });
  const gp = plan(tg.rest);
  const game = gp.mechanics.length && (gp.art.length || gp.story.length) && parts.some(p => p.tool === 'coder' || p.tool === 'make3d');
  return { tags: tg, parts, suggest: game ? 'split' : parts.length > 1 ? 'parts' : 'single' };
}
