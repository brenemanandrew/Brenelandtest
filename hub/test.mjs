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
console.log(`\n${pass}/${CASES.length} routed as expected`);
process.exit(pass === CASES.length ? 0 : 1);
