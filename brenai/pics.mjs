// Pictures she sends. The server only decides WHAT the picture is (a small spec); the page draws it: a selfie is a posed
// render of her 3D model in front of wherever she really is, a "thing" is a small drawing of something she likes.
//   spec = { id, kind: 'selfie', pose, scene, face, desc } | { id, kind: 'thing', what, desc }
const id = () => Math.random().toString(36).slice(2, 12);
const pick = a => a[Math.random() * a.length | 0];
const POSE = { plain: 'a plain selfie, looking into the camera', peace: 'a selfie throwing a peace sign', heart: 'a selfie making a little finger heart', wave: 'a selfie with a small wave', fox: 'a selfie making a fox sign', full: 'a full-length mirror picture showing her whole outfit', bed: 'a picture of her sprawled on her bed on her front, one boot kicked up', bed2: 'a picture of her lying back on her bed',
  knees: 'a picture of her sitting on the edge of her bed hugging her knees', knee: 'a picture of her sitting on her bed with one knee pulled up', hair: 'a picture of her sitting on her bed, one hand in her hair' };
const WHERE = { dorm: 'in her dorm room', classroom: 'in the back of a lecture hall', library: 'at a library table', cafe: 'behind the counter at work', gamestore: 'at the game store with shelves of games behind her', bar: 'in a bar, coloured lights and bottles behind her',
  rooftop: 'out on the fire escape at night with the city behind her', bedroom: 'in her dark bedroom', car: 'in her parked car', street: 'out on the street' };
const FACE = { tipsy: 'tipsy', high: 'high', groggy: 'tired', hyper: 'excited', upset: 'sad' };
// has he just asked for one?
export const wantsPic = text => /\b(send|show|take|snap|text|share)\b[^.?!]{0,40}\b(pic|pics|picture|photo|selfie|snap)\b|\b(pic|picture|photo|selfie)\b[^.?!]{0,14}\b(please|pls|plz)\b|\bpics?\s*\?|\bselfie\s*\?|what are you wearing|let me see you\b/i.test(String(text).replace(/\*[^*]*\*/g, ' '));
export function selfie(scene, kind, close) { // kind: how she is right now ('' or tipsy, high...); close 0..1: the closer, the more playful the pose
  const poses = scene === 'dorm' ? ['plain', 'peace', 'wave', 'full', 'bed', 'bed2', 'knees', 'knee', 'hair', ...(close > 0.6 ? ['heart', 'fox', 'heart'] : [])] : ['plain', 'plain', 'peace', 'wave', ...(close > 0.6 ? ['heart', 'fox'] : [])];
  const pose = pick(poses), face = FACE[kind] || pick(pose === 'plain' ? ['neutral', 'playful', 'happy'] : ['happy', 'playful', 'joy']);
  return { id: id(), kind: 'selfie', pose, scene, face, ...(pose === 'plain' ? { arm: pick(['R', 'L']) } : {}), desc: `${POSE[pose]}, ${WHERE[scene] || WHERE.street}${kind ? ', looking ' + kind : ''}` };
}
const THINGS = [[/dice/i, 'dice', 'a close-up of a handful of her dice'], [/coffee/i, 'coffee', 'her iced coffee'], [/cat|moth\b/i, 'cat', 'her black cat Moth, staring at the camera'], [/horror|movie/i, 'movie', 'an old horror movie poster she spotted'],
  [/thunder|storm|rain/i, 'storm', 'dark storm clouds rolling in'], [/thrift/i, 'thrift', 'a ridiculous thrift store find'], [/histor|medieval|book/i, 'book', 'a page of an old history book she is reading']];
export function thing(likes) {
  const fits = THINGS.filter(([re]) => (likes || []).some(l => re.test(l))), [, what, desc] = pick(fits.length ? fits : THINGS);
  return { id: id(), kind: 'thing', what, desc: 'a picture of ' + desc };
}
// He asked for a picture OF something. What can she actually photograph? -> a spec, 'self' (he means her: the usual selfie),
// { none: subject } when she has nothing like it in front of her, or null when no subject was named.
const VIEWS = [[/\b(whole |entire )?(room|dorm|place|space|apartment)\b/i, 'room', 'her dorm room, taken from the doorway'], [/book ?shel|\bshel(f|ves)\b|\bbooks\b|collection/i, 'shelf', 'her bookshelf'], [/\bbed\b|blanket|pillow/i, 'bed', 'her bed'], [/\bdesk\b|\btable\b|setup/i, 'table', 'her table with her things on it'],
  [/window|\bview\b|outside|campus|weather|sky/i, 'window', 'the view out of her window'], [/kitchen|counter|kettle|\bmug\b|\bcup\b/i, 'counter', 'her little counter with the kettle'], [/\bchair\b|armchair|\bseat\b/i, 'chair', 'her armchair']];
const SELF = /^(you|yourself|u|your (face|self|smile|eyes|hair|outfit|clothes|look|fit)|what you('re| are) wearing|you (right )?now)\b/i;
export function requested(text, pack, ctx) {
  const t = String(text).replace(/\*[^*]*\*/g, ' '), m = t.match(/\b(?:pic|pics|picture|photo|snap|shot)s?\s+of\s+((?:the |a |an |that |some |your |ur )?[a-z0-9' -]{2,40})/i) || t.match(/\b(?:show me|let me see|send me)\s+(your [a-z0-9' -]{2,40})/i);
  if (!m) return null; const subject = m[1].trim().replace(/\s+(please|pls|plz|now|for me|real quick).*$/i, ''), bare = subject.replace(/^(the|a|an|that|some|your|ur)\s+/i, '');
  if (SELF.test(subject) || SELF.test(bare)) return 'self';
  if (ctx.home) { const v = VIEWS.find(([re]) => re.test(bare)); if (v) return { id: id(), kind: 'view', target: v[1], desc: 'a picture of ' + v[2] }; }
  const th = THINGS.find(([re]) => re.test(bare)); if (th) return { id: id(), kind: 'thing', what: th[1], desc: 'a picture of ' + th[2] };
  const words = bare.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3), hit = (pack || []).filter(p => (p.lvl === undefined || p.lvl === (ctx.lvl | 0)) && p.theme !== 'selfie' && p.theme !== 'cute' && p.theme !== 'relationship' && (p.min || 0) <= ctx.close * 100 && words.some(w => p.desc.toLowerCase().includes(w.replace(/s$/, ''))));
  if (hit.length) { const p = pick(hit); return { id: id(), kind: 'pack', file: p.file, theme: p.theme, desc: p.desc }; }
  return { none: bare.slice(0, 40) };
}
// He asked for a picture of her doing something ("a selfie with your hands up", "a pic of you doing a tree pose"): which pose?
// -> { gest | clip, cam, label } or null. The Studio's Reactions count too: their phrases name poses the same way.
const POSED = [[/hands? (up|in the air)|reach(ing)? for the sky|arms up/i, 'handsup', 'full', 'with her hands up'], [/peace sign|\bpeace\b|v sign/i, 'peace', '', 'throwing a peace sign'], [/finger heart|little heart|heart (sign|hands?)/i, 'fingerheart', '', 'making a little finger heart'], [/\bfox\b/i, 'fox', '', 'making a fox sign'],
  [/wav(e|ing)/i, 'wave', 'half', 'waving'], [/arms? (crossed|folded)|cross(ing|ed)? (your|her) arms/i, 'crossarms', 'half', 'with her arms crossed'], [/hands? on (your|her) hips?|sass/i, 'hips', 'half', 'with her hands on her hips'], [/think(ing)?|ponder|chin/i, 'think', 'half', 'thinking, hand on her chin'],
  [/face ?palm/i, 'facepalm', 'half', 'facepalming'], [/pout|sulk|grumpy/i, 'pout', '', 'pouting'], [/tongue|bleh|raspberry|silly face|goofy face|funny face/i, 'tongue', '', 'sticking her tongue out'], [/cheer|celebrat|excited|victory/i, 'cheer', 'full', 'cheering with her arms up'], [/clap/i, 'clap', 'half', 'clapping'], [/shrug/i, 'shrug', 'half', 'shrugging'], [/yawn|sleepy|tired/i, 'yawn', 'half', 'mid yawn'],
  [/stretch/i, 'stretch', 'full', 'stretching'], [/eye ?roll|rolling (your|her) eyes/i, 'eyeroll', '', 'rolling her eyes'], [/scared|spooked|eep|startled|spider/i, 'eep', 'half', 'looking startled'], [/laugh|giggl/i, 'laugh', '', 'laughing'], [/flip(ping)? (me )?off|middle finger/i, 'flipoff', '', 'flipping him off'], [/\bok(ay)? sign/i, 'oksign', '', 'making an OK sign'], [/bow/i, 'bow', 'half', 'taking a bow']];
const POSED_CLIP = [[/tree pose/i, 'yoga_tree', 'in a tree pose'], [/warrior/i, 'yoga_warrior', 'in a warrior pose'], [/yoga|meditat|lotus|kneel/i, 'yoga_sit', 'kneeling in a yoga pose, palms together'], [/side (bend|stretch)|crescent/i, 'yoga_moon', 'in a standing side bend']];
export function posed(text, cues) {
  const t = String(text).replace(/\*[^*]*\*/g, ' ');
  const c = POSED_CLIP.find(([re]) => re.test(t)); if (c) return { clip: c[1], cam: 'full', label: c[2] };
  const g = POSED.find(([re]) => re.test(t)); if (g) return { gest: g[1], cam: g[2], label: g[3] };
  const low = ' ' + t.toLowerCase().replace(/[^a-z0-9!? ]+/g, ' ') + ' '; for (const q of cues || []) if (q.gesture && String(q.words).toLowerCase().split(',').some(w => w.trim() && low.includes(' ' + w.trim().replace(/[^a-z0-9!? ]+/g, ' ')))) return { gest: q.gesture, cam: 'half', label: q.label || 'striking a pose' };
  return null;
}
// how often: rare with a stranger, fairly regular once they are close (and a bit more if it is romance)
export const chatChance = (close, romance) => (0.008 + 0.06 * close * close) * (romance ? 1.6 : 1);
export const awayChance = (close, romance) => (0.1 + 0.3 * close * close) * (romance ? 1.3 : 1);
// ---- the picture pack: ready-made pictures on the server (see tools/picpack). Each has a theme, where it can be sent from,
// the scene it was taken in (selfies out), a minimum rapport and maybe the relationship path it belongs to.
// ctx: { home, scene, close 0..1, path, slip, recent: [files], ask }  ->  a spec, or null if nothing fits
export function fromPack(pack, ctx) {
  if (!pack || !pack.length) return null;
  /* a picture belongs to one romance level (lvl): it is only ever sent while they are at that level, never before and never after */
  const ok = pack.filter(p => (p.lvl === undefined || p.lvl === (ctx.lvl | 0)) && (p.min || 0) <= ctx.close * 100 && (!p.path || p.path === ctx.path) && !(ctx.recent || []).includes(p.file)
    && (ctx.home ? p.where !== 'out' : p.where === 'out' ? p.scene === ctx.scene : p.where === 'any')
    && (!ctx.slip || (p.where === 'out' && p.scene === ctx.scene))            // a picture that gives her away has to show where she really is
    && (!ctx.ask || p.theme === 'selfie' || p.theme === 'cute' || (p.theme === 'relationship' && /selfie|picture of her/.test(p.desc))));
  if (!ok.length) return null;
  // her own pick: what she is, to him, pulls the choice (the pictures made for that path come up most)
  const weight = p => (p.theme === 'relationship' ? 3 : p.theme === 'selfie' || p.theme === 'cute' ? 1.3 + ctx.close : 1) * (ctx.home || p.where === 'out' ? 1 : 0.8);
  let r = Math.random() * ok.reduce((a, p) => a + weight(p), 0); const p = ok.find(p => (r -= weight(p)) < 0) || ok[0];
  return { id: id(), kind: 'pack', file: p.file, theme: p.theme, desc: p.desc };
}
// a few different pictures that all fit, for her to choose between
export function candidates(pack, ctx, n = 4) {
  const out = [], recent = [...(ctx.recent || [])];
  for (let i = 0; i < n; i++) { const s = fromPack(pack, { ...ctx, recent }); if (!s) break; out.push(s); recent.push(s.file); }
  return out;
}
export const picNote = p => p ? `*sends a picture: ${p.desc}* ` : '';
