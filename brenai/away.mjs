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
