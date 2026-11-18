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
  return { id: id(), kind: 'selfie', pose, scene, face, desc: `${POSE[pose]}, ${WHERE[scene] || WHERE.street}${kind ? ', looking ' + kind : ''}` };
}
const THINGS = [[/dice/i, 'dice', 'a close-up of a handful of her dice'], [/coffee/i, 'coffee', 'her iced coffee'], [/cat|moth\b/i, 'cat', 'her black cat Moth, staring at the camera'], [/horror|movie/i, 'movie', 'an old horror movie poster she spotted'],
  [/thunder|storm|rain/i, 'storm', 'dark storm clouds rolling in'], [/thrift/i, 'thrift', 'a ridiculous thrift store find'], [/histor|medieval|book/i, 'book', 'a page of an old history book she is reading']];
export function thing(likes) {
  const fits = THINGS.filter(([re]) => (likes || []).some(l => re.test(l))), [, what, desc] = pick(fits.length ? fits : THINGS);
  return { id: id(), kind: 'thing', what, desc: 'a picture of ' + desc };
}
// how often: rare with a stranger, fairly regular once they are close (and a bit more if it is romance)
export const chatChance = (close, romance) => (0.008 + 0.06 * close * close) * (romance ? 1.6 : 1);
export const awayChance = (close, romance) => (0.1 + 0.3 * close * close) * (romance ? 1.3 : 1);
// ---- the picture pack: ready-made pictures on the server (see tools/picpack). Each has a theme, where it can be sent from,
// the scene it was taken in (selfies out), a minimum rapport and maybe the relationship path it belongs to.
// ctx: { home, scene, close 0..1, path, slip, recent: [files], ask }  ->  a spec, or null if nothing fits
export function fromPack(pack, ctx) {
  if (!pack || !pack.length) return null;
  const ok = pack.filter(p => (p.min || 0) <= ctx.close * 100 && (!p.path || p.path === ctx.path) && !(ctx.recent || []).includes(p.file)
    && (ctx.home ? p.where !== 'out' : p.where === 'out' ? p.scene === ctx.scene : p.where === 'any')
    && (!ctx.slip || (p.where === 'out' && p.scene === ctx.scene))            // a picture that gives her away has to show where she really is
    && (!ctx.ask || p.theme === 'selfie' || p.theme === 'cute' || (p.theme === 'relationship' && /selfie|picture of her/.test(p.desc))));
  if (!ok.length) return null;
  // her own pick: what she is, to him, pulls the choice (the pictures made for that path come up most)
  const weight = p => (p.theme === 'relationship' ? 3 : p.theme === 'selfie' || p.theme === 'cute' ? 1.3 + ctx.close : 1) * (ctx.home || p.where === 'out' ? 1 : 0.8);
  let r = Math.random() * ok.reduce((a, p) => a + weight(p), 0); const p = ok.find(p => (r -= weight(p)) < 0) || ok[0];
  return { id: id(), kind: 'pack', file: p.file, theme: p.theme, desc: p.desc };
}
export const picNote = p => p ? `*sends a picture: ${p.desc}* ` : '';
