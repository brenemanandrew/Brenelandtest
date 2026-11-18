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
export const picNote = p => p ? `*sends a picture: ${p.desc}* ` : '';
