// D&D night: a small tabletop adventure the two of them play at a table, with a Dungeon Master sitting across from them.
// The server owns everything that has to be true: whose turn, which scene, what check, the dice, hit points. The language model
// only puts it into words (the DM's narration and what Wizra says at the table), so a small model cannot derail the game.
// Rules are a light d20 game written for this (roll d20, add a modifier, meet the number); the adventure below is our own.
export const CHARS = {
  fighter: { cls: 'Fighter', icon: '\u{1F6E1}️', hp: 12, mods: { fight: 4, sneak: 0, talk: 1, look: 1, magic: -1 }, blurb: 'steady, strong, first through the door' },
  rogue: { cls: 'Rogue', icon: '\u{1F5E1}️', hp: 9, mods: { fight: 2, sneak: 5, talk: 2, look: 3, magic: 0 }, blurb: 'quick hands, quicker tongue' },
  wizard: { cls: 'Wizard', icon: '\u{1F52E}', hp: 7, mods: { fight: 0, sneak: 1, talk: 1, look: 3, magic: 5 }, blurb: 'clever, fragile, dangerous' },
  cleric: { cls: 'Cleric', icon: '✨', hp: 10, mods: { fight: 2, sneak: 0, talk: 4, look: 2, magic: 3 }, blurb: 'kind, stubborn, hard to scare' },
};
export const SKILLS = { fight: 'Fight', sneak: 'Sneak', talk: 'Talk', look: 'Look', magic: 'Magic' };
// what he typed -> which skill it is
const WORDS = [['fight', /\b(attack|fight|hit|strike|stab|swing|charge|kick|punch|shoot|tackle|grapple|smash|break|force|push|shove|climb|lift|jump)\b/i], ['sneak', /\b(sneak|hide|creep|quiet|steal|pick|lock|slip|tiptoe|shadow|disarm|dodge|dart)\b/i],
  ['magic', /\b(spell|magic|cast|enchant|ward|rune|light|fire ?bolt|heal|bless|pray|dispel|charm)\b/i], ['talk', /\b(talk|ask|persuade|convince|bribe|bargain|trick|lie|bluff|threaten|calm|sing|offer|plead|greet|joke|flatter|trade)\b/i],
  ['look', /\b(look|search|listen|inspect|examine|study|read|track|smell|notice|check|watch|peer|investigate)\b/i]];
export const skillOf = text => (WORDS.find(([, re]) => re.test(String(text))) || [''])[0];
// The Lantern at Mossbrook: five scenes. Each has what the DM knows, the number to beat, what is good at it, and how it turns out.
export const ADVENTURE = { id: 'mossbrook', title: 'The Lantern at Mossbrook', rating: 'cartoon peril, nobody has to die',
  intro: 'The village of Mossbrook has one treasure: the great lantern on the green, which has burned for two hundred years and keeps the marsh fog out. Three nights ago it went dark. The fog is coming in, the goats are missing, and the miller swears he saw small lights moving up at the old well house. The village has scraped together a purse of silver and two adventurers who said yes.',
  scenes: [
    { id: 'road', title: 'The fog road', dc: 10, best: 'look', notes: 'Dusk on the marsh road to the well house. Thick fog, a broken cart, goat tracks, and tiny clawed footprints. Something watches from the reeds: a nervous kobold scout named Pip, more scared than dangerous.',
      pass: 'they spot Pip before Pip bolts, and learn the kobolds took the lantern flame because their dragon is cold', fail: 'Pip throws a mud ball, shrieks and runs; they get muddy and follow the tracks the slow way', hurt: 1 },
    { id: 'bridge', title: 'The toll bridge', dc: 12, best: 'talk', notes: 'A rope bridge over a black stream. Three kobolds in pot-lid helmets demand a toll of "one shiny, each" and are very proud of their sign, which is spelled wrong. They can be paid, tricked, flattered, sneaked past or scattered.',
      pass: 'the kobolds are won over or outwitted and wave them across, one even salutes', fail: 'the bridge is cut loose at one end and they get across wet, bruised and laughed at', hurt: 2 },
    { id: 'cellar', title: 'The well house cellar', dc: 12, best: 'sneak', notes: 'Under the well house: a damp cellar full of stolen goats (fine, annoyed), giant rats, and a tripwire tied to a rack of pans. Beyond, warm orange light and loud snoring.',
      pass: 'they get past the rats and the tripwire without a sound and free the goats on the way', fail: 'the pans come down like a thunderstorm, rats everywhere, a short ugly scuffle', hurt: 2 },
    { id: 'dragon', title: 'Ember', dc: 14, best: 'talk', notes: 'A small, grumpy, very young dragon named Ember is curled around the stolen lantern flame, which sits in a cracked pot. Ember has a cold and cannot make fire, which is embarrassing for a dragon. The kobolds stole the flame to keep Ember warm. Ember can be reasoned with, soothed, healed with magic, or fought (a bad idea, but possible).',
      pass: 'Ember sneezes a real flame for the first time, is delighted, and gives the lantern fire back', fail: 'Ember panics, the cellar fills with smoke and flailing tail; they grab the pot and run', hurt: 3 },
    { id: 'home', title: 'The lantern', dc: 8, best: 'magic', notes: 'Back on the village green at dawn, fog at the edges, the whole village watching. The flame has to be set back in the great lantern, which is high, old and fiddly.',
      pass: 'the lantern roars back to life, the fog rolls away, the village cheers, and the miller cries', fail: 'it takes three tries and one singed eyebrow, but the lantern lights', hurt: 0 }] };
const d = n => 1 + Math.floor(Math.random() * n), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// a new game. his: his class; hers is chosen to go well with it (she likes rogues and wizards)
export function newGame(his) { const mine = CHARS[his] ? his : 'fighter', hers = ['rogue', 'wizard', 'cleric', 'fighter'].find(c => c !== mine);
  return { on: true, adv: ADVENTURE.id, scene: 0, step: 'intro', tries: 0, me: { cls: mine, hp: CHARS[mine].hp }, her: { cls: hers, hp: CHARS[hers].hp }, pending: null, last: null, at: Date.now(), turns: 0 }; }
export const sceneOf = g => ADVENTURE.scenes[clamp(g.scene | 0, 0, ADVENTURE.scenes.length - 1)];
// what the page shows
export function view(g) { if (!g || !g.on) return null; const s = sceneOf(g), C = k => ({ cls: CHARS[k.cls].cls, icon: CHARS[k.cls].icon, hp: k.hp, max: CHARS[k.cls].hp });
  return { title: ADVENTURE.title, scene: s.title, n: g.scene + 1, of: ADVENTURE.scenes.length, step: g.step, me: C(g.me), her: C(g.her), pending: g.pending ? { skill: SKILLS[g.pending.skill], mod: g.pending.mod, dc: g.pending.dc } : null, last: g.last, done: g.step === 'done' }; }
// he says what he does: that sets up a roll (the page shows the die). Returns what the DM should say while he reaches for it.
export function declare(g, text) { const s = sceneOf(g), skill = skillOf(text) || s.best, mod = CHARS[g.me.cls].mods[skill], dc = s.dc - (skill === s.best ? 2 : 0);   /* the clever approach for the scene is a little easier */
  g.pending = { skill, mod, dc, what: String(text).slice(0, 160) }; g.step = 'roll'; return { skill, mod, dc }; }
// he throws the die. Hers is thrown too (she helps, in her own way). Returns everything the DM needs to tell it.
export function roll(g) { const p = g.pending; if (!p) return null; const s = sceneOf(g), r = d(20), total = r + p.mod, hersSkill = Object.entries(CHARS[g.her.cls].mods).sort((a, b) => b[1] - a[1])[0][0], hr = d(20), hTotal = hr + CHARS[g.her.cls].mods[hersSkill];
  const helped = hTotal >= s.dc, ok = r === 20 || (r !== 1 && total + (helped ? 2 : 0) >= p.dc);
  g.last = { r, mod: p.mod, total, dc: p.dc, ok, skill: SKILLS[p.skill], hers: { r: hr, total: hTotal, skill: SKILLS[hersSkill], helped }, crit: r === 20, fumble: r === 1 }; g.pending = null; g.turns++;
  let outcome; if (ok) { outcome = s.pass; g.tries = 0; g.scene++; } else { g.tries++; const who = Math.random() < 0.5 ? g.me : g.her; who.hp = Math.max(1, who.hp - s.hurt);   /* nobody dies at this table: one hit point is as low as it goes */
    if (g.tries >= 2) { outcome = s.fail; g.tries = 0; g.scene++; } else outcome = 'it does not work this time, and it costs them a little; the problem is still in front of them and they need another idea'; }
  const over = g.scene >= ADVENTURE.scenes.length; if (over) { g.scene = ADVENTURE.scenes.length - 1; g.step = 'done'; } else g.step = ok || outcome === s.fail ? 'scene' : 'ask';
  return { ...g.last, outcome, moved: ok || outcome === s.fail, over, was: s }; }
// ---- what the model is asked to write. The form never changes: the Dungeon Master's lines start with "DM:", in quotes; then one or
// two lines of her own, as herself at the table playing her character. The page gives the DM a chip and a voice of his own. ----
const FORM = (g, user) => `Write it as tabletop play, exactly in this form: first the Dungeon Master, as one or two lines that each start with  DM: "  and end with a quote mark (two to four sentences in all, vivid, second person, addressed to both players). Then one or two short lines of your own with no name in front: you, at the table, playing your ${CHARS[g.her.cls].cls}, excited and in your element, talking to ${user}. Do not roll dice, do not say numbers, do not decide what happens next: the game does that.`;
const cast = (g, user) => `${user} plays a ${CHARS[g.me.cls].cls} (${CHARS[g.me.cls].blurb}); you play a ${CHARS[g.her.cls].cls} (${CHARS[g.her.cls].blurb}).`;
export const PROMPT = {
  intro: (g, user) => `(D&D night. ${user} set this whole game up as a surprise for you and you are thrilled. A Dungeon Master sits across the table. ${cast(g, user)} Tonight's adventure is "${ADVENTURE.title}". Its opening: ${ADVENTURE.intro} The first scene: ${sceneOf(g).notes}) The DM sets the scene and ends by asking what they do. ${FORM(g, user)}`,
  scene: (g, user) => `(D&D night, scene ${g.scene + 1}: ${sceneOf(g).title}. ${cast(g, user)} What the DM knows: ${sceneOf(g).notes}) The DM describes the new scene and ends by asking what they do. ${FORM(g, user)}`,
  declare: (g, user, text, c) => `(D&D night, ${sceneOf(g).title}. ${user} says his ${CHARS[g.me.cls].cls} does this: "${text}". That is a ${SKILLS[c.skill]} roll.) The DM reacts to the plan in one line and tells him to roll. ${FORM(g, user)}`,
  result: (g, user, r) => `(D&D night, ${r.was.title}. ${user} rolled a ${r.r} on the die${r.crit ? ', a natural twenty' : r.fumble ? ', a natural one' : ''}: ${r.ok ? 'a success' : 'a failure'}. Your own ${CHARS[g.her.cls].cls} ${r.hers.helped ? 'helped and it made a difference' : 'tried to help and it did not go to plan'}. What happens: ${r.outcome}.${r.over ? ' That is the end of the adventure: the DM wraps it up warmly.' : r.moved ? ` Then the next scene opens: ${sceneOf(g).notes}` : ''}) The DM narrates what happens${r.over ? ' and ends the night' : r.moved ? ', then the new place, and asks what they do' : ' and asks what they try next'}. ${FORM(g, user)}`,
  talk: (g, user, text) => `(D&D night, ${sceneOf(g).title}. Table talk, out of character: ${user} says "${text}".) Answer him yourself in one or two lines, no DM line this time. The game waits for him to say what his ${CHARS[g.me.cls].cls} does.`,
};
