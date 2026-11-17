// Wizra's comings and goings. When she says she is leaving, she really goes: she is out for a real stretch of time, and
// what she said she was doing is not always what she did. Pure logic here; server.mjs keeps the state and does the talking.
//
//   detectLeave(text)  her reply -> { where, minutes, cover } if she is leaving right now, else null
//   outcome(leave)     what really happened while she was out -> { kind, lying, truth, tells } (kind '' = nothing to see)
//   glowNote(glow, user)  the private line for her prompt while it still shows

// She is going NOW (not "later I have class"): a goodbye, an "I have to go", or walking out in an action.
const GOING = [
  /\b(i'?m|i am|i'?ll be) (off|out|heading (out|off|to|over)|leaving|going to (go|head|run)|out of here|gonna (go|head|run|bounce|dip))\b/i,
  /\bi('?ve| have)? ?(gotta|got to|have to|need to|should|better|must) (go|run|head (out|off|to)|get going|get to|leave|bounce|dip|jet|split)\b/i,
  /\b(see|catch|talk to) (you|ya|u) (later|soon|tomorrow|tonight|in a (bit|few|while)|after|when i'?m back)\b/i,
  /\b(brb|be right back|i'?ll be back|back (in|soon|later|after))\b/i,
  /\b(good ?night|nighty? night|bye+)\b|\blaters?[.!]*\s*$/im,
  /\*[^*]*\b(heads? (out|off|for the door|to the door)|walks? out|slips? out|leaves|ducks? out|rushes? out|grabs? her (bag|backpack|keys|coat|jacket|hoodie) and)\b[^*]*\*/i,
];
// Not a real departure: talking about someone else leaving, hypotheticals, or coming back.
const NOT_GOING = /\b(don'?t|do not|not) (go|leave)|if i (go|leave|have to)|when i (go|leave)|(i'?m|i am) back\b|just got back|\bwas (out|gone|leaving)\b/i;

// Where she says she is going -> how long that takes (minutes: [min, max]) and whether it is the kind of story that can be a cover.
const WHERE = [
  [/\b(bathroom|restroom|pee|brb|be right back|one sec|two secs?|a sec(ond)?|a minute)\b/i, 'the bathroom', [3, 6], false],
  [/\b(sleep|bed|crash(ing)?|good ?night|nighty?|pass out|turn(ing)? in)\b/i, 'bed', 'sleep', false],
  [/\b(study group|library|study session|group project|office hours|tutoring|lab partner)\b/i, 'her study group', [70, 130], true],
  [/\b(class|lecture|lab|seminar|exam|midterm|quiz|final)\b/i, 'class', [60, 100], true],
  [/\b(work|shift|job)\b/i, 'work', [120, 200], true],
  [/\b(d&d|dnd|campaign|session|game night|one-?shot|dungeon)\b/i, 'her D&D game', [150, 210], false],
  [/\b(party|bar|club|concert|show|gig|date|friends?|roommate|hang(ing)? out)\b/i, 'out with friends', [110, 190], false],
  [/\b(food|lunch|dinner|breakfast|eat|taco|pizza|coffee|store|groceries|errand|laundry|shower|gym|walk)\b/i, 'an errand', [18, 40], false],
];
const STATED = [[/\b(\d{1,3}) ?(min|mins|minutes)\b/i, m => +m[1]], [/\b(a|an|one) hour\b|\b1 ?(hr|hour)\b/i, () => 60], [/\b(half an hour|half hour|30)\b/i, () => 30],
  [/\b(a )?couple (of )?hours\b|\b2 ?(hrs|hours)\b/i, () => 120], [/\b(a )?few hours\b|\b3 ?(hrs|hours)\b/i, () => 180], [/\b(a|one) (sec|second|minute|min)\b|\ba few (minutes|mins)\b/i, () => 5]];
const between = ([a, b], r = Math.random()) => Math.round(a + (b - a) * r);

// ---- plans: "my next class starts at seven", "I'll be back around 9 or 10" ----
// detectPlan(text, now) -> { leaveAt?, backAt?, where? } in ms. A start time means she heads out about ten minutes before.
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, noon: 12, midnight: 0 };
const T = "(\\d{1,2}(?::\\d{2})?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|noon|midnight)(?:\\s*o'?clock)?\\s*(am|pm|a\\.m\\.|p\\.m\\.|tonight|this evening|(?:tomorrow |this |in the )(?:morning|evening|afternoon|night))?";
const EVENT = '(class|lecture|lab|seminar|exam|midterm|quiz|study group|study session|work|shift|session|game|campaign|d&d|dnd|practice|appointment|meeting|rehearsal|date)';
const RE_START = new RegExp('\\b' + EVENT + "\\b[^.!?*]{0,40}?\\b(?:starts?|begins?|is|'s|kicks off)?\\s*(?:at|by|around)\\s+" + T + '(?![\\d:]|\\s*(?:minutes|mins|hours|hrs|percent|%|pages|people|of))', 'i');
const RE_GO = new RegExp("\\b(?:leave|leaving|head(?:ing)? out|heading (?:to|over)|take off|taking off|out of here|gotta go|have to go|need to go|go)\\b[^.!?*]{0,24}?\\b(?:at|by|around)\\s+" + T + '(?![\\d:]|\\s*(?:minutes|mins|hours|hrs|percent|%))', 'i');
const RE_BACK = new RegExp("\\b(?:back|home|done|finished|free|out)\\b[^.!?*]{0,18}?\\b(?:around|at|by|about|until|til|till|like)\\s+" + T + "(?:\\s*(?:or|to|-)\\s*" + T + ')?(?![\\d:]|\\s*(?:minutes|mins|hours|hrs|percent|%))', 'i');
const ET = 'America/New_York';
// the next time the clock (Eastern) shows this hour and minute after `after`; with no am/pm it is whichever comes first
function nextAt(tok, half, after) {
  if (!tok) return null;
  const w = tok.toLowerCase(); let h, m = 0;
  if (NUM[w] !== undefined) h = NUM[w]; else { const p = w.split(':'); h = +p[0]; m = +(p[1] || 0); }
  if (!(h >= 0 && h <= 23) || !(m >= 0 && m < 60)) return null;
  const hf = (half || '').toLowerCase().replace(/\./g, '');
  let hours = h > 12 || w === 'midnight' || w === 'noon' ? [h] : /^am|morning/.test(hf) ? [h % 12] : /^pm|tonight|evening|afternoon|night/.test(hf) ? [h % 12 + 12] : [h % 12, h % 12 + 12];
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(after));
  const nowMin = (+parts.find(x => x.type === 'hour').value % 24) * 60 + +parts.find(x => x.type === 'minute').value;
  let best = null;
  for (const hh of hours) { let d = hh * 60 + m - nowMin; if (d <= 0) d += 1440; const t = after + d * 60000; if (best === null || t < best) best = t; }
  return best - (best % 60000);
}
export function detectPlan(text, now = Date.now()) {
  const t = String(text || ''), out = {};
  const s = t.match(RE_START), g = t.match(RE_GO);
  if (s) { const at = nextAt(s[2], s[3], now); if (at) { out.leaveAt = Math.max(now + 60000, at - 10 * 60000); out.startsAt = at; } for (const [re, name] of WHERE) if (re.test(s[1])) { out.where = name; break; } }
  else if (g) { const at = nextAt(g[1], g[2], now); if (at) out.leaveAt = at; for (const [re, name] of WHERE) if (re.test(t)) { out.where = name; break; } }
  const b = t.match(RE_BACK);
  if (b) { const from = out.startsAt || out.leaveAt || now, a = nextAt(b[1], b[2], from), z = b[3] ? nextAt(b[3], b[4] || b[2], from) : null; if (a) out.backAt = z && z > a ? Math.round((a + (z - a) * Math.random()) / 60000) * 60000 : a; }
  return out.leaveAt || out.backAt ? out : null;
}

export function detectLeave(text, now = new Date()) {
  const t = String(text || '');
  if (!GOING.some(re => re.test(t)) || NOT_GOING.test(t)) return null;
  let where = 'somewhere', minutes = between([35, 60]), cover = false;
  for (const [re, name, span, canCover] of WHERE) if (re.test(t)) {
    where = name; cover = canCover;
    if (span === 'sleep') { // until about 8 the next morning, Eastern; at least five hours
      const h = Number(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })) % 24;
      minutes = Math.max(300, ((8 - h + 24) % 24 || 24) * 60 - now.getMinutes() + between([0, 40]));
    } else minutes = between(span);
    break;
  }
  for (const [re, fn] of STATED) { const m = t.match(re); if (m && where !== 'bed') { minutes = Math.max(2, Math.min(480, fn(m))); break; } }
  return { where, minutes, cover };
}

// What she was really up to when the story was a cover. tells = what gives it away; talk = how it leaks into her speech.
const LIES = [
  { kind: 'tipsy', w: 3, truth: 'you skipped it and went for drinks with your roommate and her friends; you are two and a half vodka cranberries in', tells: 'flushed cheeks, a bit too loud, giggly, swaying slightly, smelling faintly of cranberry and vodka', talk: 'slightly sloppy typing, an occasional slurred or repeated word, giggles at things that are not funny, overly sincere' },
  { kind: 'high', w: 3, truth: 'you skipped it and smoked with your roommate on the fire escape', tells: 'red, heavy-lidded eyes, moving slowly, a dopey little smile, very interested in snacks', talk: 'slow and spacey, loses her thread mid-sentence, finds small things deeply funny or profound, keeps bringing up food' },
  { kind: 'groggy', w: 2, truth: 'you went home "for five minutes" and napped straight through it', tells: 'a pillow crease on your cheek, hair flattened on one side, yawning, squinting at the light', talk: 'short, mumbly, yawns mid-sentence, slow to follow' },
  { kind: 'hyper', w: 2, truth: 'you blew it off for a one-shot at the game store and had three energy drinks', tells: 'talking fast, bouncing your leg, cannot sit still, dice in your hoodie pocket', talk: 'fast, run-on, jumps topics, too many exclamation points for you' },
  { kind: 'upset', w: 2, truth: 'you never made it; you had a fight with your roommate and sat in your car for an hour', tells: 'puffy eyes, quiet, hood up, forcing a normal voice', talk: 'short, flat, says she is fine too quickly' },
];
// Honest outings can still show: a night out means she comes home a little buzzed and says so.
const HONEST = { 'out with friends': { kind: 'tipsy', chance: 0.6, truth: 'you had a few drinks while you were out, which you are not hiding', tells: 'flushed cheeks, cheerful and loose, a little wobbly', talk: 'relaxed, chatty, a little silly' },
  'her D&D game': { kind: 'hyper', chance: 0.5, truth: 'the session went great and you are still buzzing from it', tells: 'grinning, talking with your hands, cannot wait to tell someone what happened', talk: 'excited, fast, wants to tell the whole story' },
  bed: { kind: 'groggy', chance: 0.7, truth: 'you just woke up', tells: 'messy hair, yawning, not fully awake', talk: 'sleepy, short, needs coffee' } };

export function outcome(leave, r = Math.random(), r2 = Math.random()) {
  if (leave.cover && leave.minutes >= 40 && r < 0.38) {
    let pick = r2 * LIES.reduce((a, l) => a + l.w, 0);
    const lie = LIES.find(l => (pick -= l.w) < 0) || LIES[0];
    return { kind: lie.kind, lying: true, truth: lie.truth, tells: lie.tells, talk: lie.talk };
  }
  const h = HONEST[leave.where];
  if (h && r2 < h.chance) return { kind: h.kind, lying: false, truth: h.truth, tells: h.tells, talk: h.talk };
  return { kind: '', lying: false, truth: '', tells: '', talk: '' };
}

export function glowNote(glow, user) {
  if (!glow || !glow.kind) return '';
  return glow.lying
    ? `- SECRET, right now and for the next hour or so: you told ${user} you were at ${glow.where}. You were not: ${glow.truth}. You are trying to act completely normal and you came back in hoping he would not notice. It shows anyway: ${glow.tells}. How it leaks into the way you talk: ${glow.talk}. If he asks, deny it and stick to your story ("I was at ${glow.where}, why?"), badly. Only crack if he clearly has you, or teases it out of you; then you can be sheepish about it. Never announce it yourself.`
    : `- Right now and for the next hour or so: you just got back from ${glow.where}, and ${glow.truth}. It shows: ${glow.tells}. How it comes out when you talk: ${glow.talk}.`;
}

export const clock = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });

// ---- video calls while she is out ----
// Where she really is decides what is behind her on the call. sceneFor(away) -> a backdrop name the page knows how to draw.
const SCENE_OF = { class: 'classroom', 'her study group': 'library', work: 'cafe', 'her D&D game': 'gamestore', 'out with friends': 'bar', 'an errand': 'street', bed: 'bedroom', 'the bathroom': 'street', somewhere: 'street' };
const SCENE_LIE = { tipsy: 'bar', high: 'rooftop', groggy: 'bedroom', hyper: 'gamestore', upset: 'car' };
export const sceneFor = a => (a.out && a.out.lying ? SCENE_LIE[a.out.kind] : SCENE_OF[a.where]) || 'street';
// Does she pick up? Not from the bathroom, rarely mid-lecture, usually otherwise. With something to hide she is less keen.
export function picksUp(a, r = Math.random()) {
  const lying = a.out && a.out.lying;
  const p = a.where === 'the bathroom' ? 0 : lying ? 0.62 : a.where === 'class' ? 0.22 : a.where === 'bed' ? 0.35 : a.where === 'work' ? 0.45 : a.where === 'her study group' ? 0.6 : 0.88;
  return r < p;
}
const PLACE = { classroom: 'in the back row of a lecture hall, whispering', library: 'at a library table with your study group, keeping your voice down', cafe: 'on a quick break at work', gamestore: 'at the game store, with your group at the table behind you',
  bar: 'in a loud bar, with coloured lights and music behind you', rooftop: 'out on the fire escape at night, with the city behind you', bedroom: 'in your dark bedroom, in bed', car: 'sitting alone in your parked car', street: 'out walking, on the pavement' };
export function callNote(a, user) {
  const scene = sceneFor(a), o = a.out || {};
  const base = `- RIGHT NOW you are not in the room with ${user}: you are out, and he is VIDEO CALLING you. You picked up on your phone. You are ${PLACE[scene]}; he can see your face and a bit of what is behind you. This is a spoken call: say only what you would say out loud, one or two short sentences, no stage directions. Start by asking what he wants. Talk like a real call: react to what he says, do not recite. When the call has run its course, or you need to go, end it yourself with a goodbye like "talk to you later".`;
  if (o.lying) return base + ` You told him you were at ${a.where}, and that is NOT where you are (${o.truth}). You are trying to keep the camera tight on your face and the call short, and to sound normal. It shows a little anyway: ${o.tells}. If he asks where you are, stick to your story; if he points out what he can see or hear behind you, squirm, make an excuse, and only admit it if he clearly has you.`;
  return base + (o.kind ? ` ${o.truth[0].toUpperCase() + o.truth.slice(1)}, and it shows: ${o.tells}.` : ` You really are where you said (${a.where}); you have nothing to hide and may be a little short on time.`);
}
export const HANGUP = /\b(talk to (you|ya) (later|soon|tomorrow|tonight)|see (you|ya) (later|soon|tonight|in a bit|when i'?m back)|i('?ve| have)? ?(gotta|got to|have to|need to|should) (go|run|get back|hang up)|bye+\b|good ?night|hanging up|later[.!]?\s*$)/i;
export const COMING = /\b(on my way|heading (back|home|over)( now)?|coming (back|home|over)( now)?|i'?ll (come|head) (back|home|over)( now)?|be (right )?there( soon| in)?|leaving now|omw)\b/i;
