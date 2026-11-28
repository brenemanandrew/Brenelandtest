/* Routing check: node test.mjs. Each line is a thought and the tool:mode it should land on. */
import { ruleRoute } from './route.mjs';
import { split, rejoin } from './split.mjs';
const CASES = [
  ['My supervisor changed the overtime rules again without telling anyone, I am so pissed', 'companion:vent'],
  ['Plan a kaizen event for the receiving dock, too much walking between stations', 'expert:kaizen'],
  ['Do a 5 whys on why the cross training roster keeps getting out of date', 'expert:kaizen'],
  ['Make a cel shaded oak tree model for Breneland', 'make3d:generate'],
  ['Turn this photo of my dog into a 3d model', 'make3d:generate'],
  ['Retexture the tavern sign so it looks cel shaded', 'make3d:retexture'],
  ['Decimate wizra_hoodie.glb to about 20k tris', 'make3d:process'],
  ['Auto rig the new goblin model', 'make3d:rig'],
  ['Check the sweater for clipping and holes', 'make3d:check'],
  ['I want Wizra to do the little dance I do, I can act it out on camera', 'motion:capture'],
  ['Get a walk cycle for the Breneland townsfolk', 'motion:library'],
  ['Retarget the sitting clip onto the other rig', 'motion:retarget'],
  ['Add a small fidget gesture when she is idle', 'motion:handkey'],
  ['Fix the bug where the chat bar disappears on my phone', 'coder:fix'],
  ['Write a powershell script to back up my Bionic models folder', 'coder:script'],
  ['Break down the shell clothes project into steps', 'planner:breakdown'],
  ['Lets roleplay, you are my manager and I am asking for a raise', 'companion:roleplay'],
  ['What makes a good core loop for a cozy life sim', 'expert:game'],
  ['Deploy brenai', 'ship:deploy'],
  ['Open the overtime kiosk', 'workapp:open'],
];
let pass = 0;
for (const [t, want] of CASES) {
  const r = ruleRoute(t), got = r.pick ? `${r.pick.tool}:${r.pick.mode}` : 'none';
  const ok = got === want; if (ok) pass++;
  console.log(`${ok ? 'ok  ' : 'MISS'} ${got.padEnd(20)} ${Math.round(r.confidence * 100)}% ${r.area || '-'}  ${t}${ok ? '' : `  (wanted ${want})`}`);
}
const s = split('use the persona [[local]]she is 22 and goth[[/local]] with token: abc123456 and sk-ant-api03-xxxxxxxxxxxxxxxx');
console.log('\nsplit out:', s.out, '\nsecrets removed:', s.secrets, '\nrejoined:', rejoin('code uses [[KEPT-LOCAL-1: x]] here', s.held));
import * as P from './parts.mjs';
const sp = P.plan('Make me a game where you run a tavern, guests come in and order drinks, you serve them and get paid, and use cel shaded visuals like my Breneland trees. The barkeep is named Grum and he is grumpy but kind.');
const brief = P.codeBrief(sp, { id: 'x', repo: 'me/game' });
const SPLIT = [
  ['rules go to code', sp.mechanics.length === 3],
  ['look goes to art', sp.art.length === 1 && /cel shaded/.test(sp.art[0])],
  ['Grum goes to story', sp.story.length === 1 && /Grum/.test(sp.story[0])],
  ['no art or story words in the brief', !/grum|grumpy|barkeep|cel shaded|trees/i.test(brief)],
  ['brief asks for the merge manifest', /hub-merge\.json/.test(brief) && /```hub-merge/.test(brief)],
  ['slots found: character, place, dialogue, names', ['character', 'environment', 'dialogue', 'names'].every(t => sp.slots.some(x => x.type === t))],
  ['labelled lines go where they say', (() => { const q = P.plan('code: a timer counts down\nart: neon city\nstory: the courier is late'); return q.mechanics.length === 1 && q.art.length === 1 && q.story.length === 1; })()],
  ['proper names in rules become ids', (() => { const q = P.plan('Make a game where you chase Vexa through the market'); return q.mechanics[0].includes('entity_1') && !q.mechanics[0].includes('Vexa'); })()],
  ['style words are stripped from rules', (() => { const q = P.plan('Make a game where a cute toon frog jumps between lily pads'); return !/cute|toon/.test(q.mechanics[0]); })()],
  ['bad files are rejected at merge', P.checkFile('character', Buffer.from('nope')) && P.checkFile('names', Buffer.from('{}')) && !P.checkFile('names', Buffer.from('{"entities":[]}'))],
];
import { vet } from './vet.mjs';
const v1 = vet('Hubbell: fix the bug where the kiosk shows the old build, plan the kaizen event for receiving next week, and I am so pissed at my supervisor');
const v2 = vet('SUI: the bag frame overlaps the minimap');
const v3 = vet('Note: buy milk');
SPLIT.push(
  ['tag sets the project (Hubbell -> work)', v1.tags.project === 'work'],
  ['whole statement vetted into 3 parts', v1.suggest === 'parts' && v1.parts.map(p => p.tool).join() === 'coder,expert,companion'],
  ['SUI tag -> sui project, tag removed from text', v2.tags.project === 'sui' && !/SUI/.test(v2.tags.rest)],
  ['a colon after ordinary words is not a tag', !v3.tags.found.length],
  ['game with art suggests Split', vet('Breneland: make a fishing minigame where you cast and reel, and use cel shaded visuals like my trees').suggest === 'split'],
);
let sOk = 0; for (const [n, ok] of SPLIT) { if (ok) sOk++; console.log(`${ok ? 'ok  ' : 'MISS'} split: ${n}`); }
pass += sOk; const total = CASES.length + SPLIT.length;
console.log(`\n${pass}/${total} as expected`);
process.exit(pass === total ? 0 : 1);
