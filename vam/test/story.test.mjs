// Tests the relay's story side (Little Shepersville) against two stand-in Brenai servers: one with the proposed story routes,
// one without them yet (Wizra must still work, the others say plainly that they are not connected). Run: node vam/test/story.test.mjs
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), RELAY = path.join(HERE, '..', 'relay', 'brene-relay.mjs');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms)); const procs = [], servers = [];
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'brene-story-'));

function brenai(withStory) {
  const seen = { say: [], tts: [], choose: [], writing: [] };
  return new Promise(r => { const s = http.createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c; const b = raw ? JSON.parse(raw) : {}; const j = (code, o) => { res.writeHead(code, { 'content-type': 'application/json', ...(o.cookie ? { 'set-cookie': o.cookie } : {}) }); res.end(JSON.stringify(o)); };
    if (req.url === '/api/login') return j(200, { ok: true, cookie: 'brenai=t; Path=/' });
    if (req.url === '/api/pin') return j(200, { ok: true, cookie: 'brenai_u=p.s; Path=/' });
    if (req.url === '/api/chat') { res.writeHead(200, { 'content-type': 'text/event-stream' }); return res.end(`data: {"t":"done","text":"*grins* chat says ${b.text}"}\n\n`); }
    if (req.url === '/api/tts') { seen.tts.push(b); res.writeHead(200, { 'content-type': 'audio/wav' }); return res.end(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(40)])); }
    if (req.url === '/api/touch') { seen.touch = (seen.touch || []).concat(b); return j(200, { ok: true }); }
    if (req.url === '/api/robot') return j(200, { sheet: { traits: { warmth: 65, sarcasm: 45 } }, mood: 'cozy', feeling: '' });
    if (!withStory) return j(404, { error: 'not found' });
    if (req.url === '/api/story/personality?who=zoe') return j(200, { traits: { dryness: 90 }, mood: 'busy' });
    if (req.url === '/api/story/touch') { seen.stouch = (seen.stouch || []).concat(b); return j(200, { ok: true }); }
    if (req.url === '/api/story/state') return j(200, { day: 3, time: 'evening', place: 'Peak Pizza', cast: { zoe: { mood: 'dry', where: 'Peak Pizza' } }, pending: { id: 'tp4', question: 'Stay for one more slice?', answers: ['Stay', 'Head home'] } });
    if (req.url === '/api/story/say') { seen.say.push(b); return j(200, { text: `*shrugs* ${b.who} heard: ${b.text}` }); }
    if (req.url === '/api/story/choose') { seen.choose.push(b); return j(200, { ok: true }); }
    if (req.url === '/api/story/writing') { seen.writing.push(b); return j(200, { ok: true }); }
    j(404, { error: 'not found' });
  }); s.listen(0, '127.0.0.1', () => { servers.push(s); r({ url: `http://127.0.0.1:${s.address().port}`, seen }); }); });
}
const relay = (port, b, extra = []) => { const p = spawn('node', [RELAY, '--port', String(port), '--bridge', 'ws://127.0.0.1:18799', '--brenai', b.url, '--data', path.join(T, port + '.json'), ...extra], { env: { ...process.env, BRENAI_PIN: '1234' }, stdio: ['ignore', 'pipe', 'pipe'] }); procs.push(p); return p; };
const get = async (port, p) => (await fetch(`http://127.0.0.1:${port}${p}`)).json();
const post = async (port, p, o) => (await fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) })).json();

try {
  const A = await brenai(true), B = await brenai(false);
  relay(18791, A); relay(18792, B); await sleep(800);

  // with the story routes
  let s = await get(18791, '/story/state');
  ok(s.live && s.day === 3 && s.pending.id === 'tp4' && s.pending.answers.length === 2, 'state comes from Brenai, with the pending turning point');
  let r = await post(18791, '/story/say', { who: 'zoe', text: 'Hi', place: 'Peak Pizza', present: ['zoe', 'nobody'], voice: true });
  ok(r.text === '*shrugs* zoe heard: Hi' && r.who === 'zoe' && r.voice, 'say: Zoe answers through the story route, voice started');
  const sent = A.seen.say[0]; ok(sent.who === 'zoe' && sent.place === 'Peak Pizza' && sent.present.join() === 'zoe', 'say: who, place and who is present reach Brenai (unknown names dropped)');
  await sleep(300); ok(A.seen.tts[0] && A.seen.tts[0].cast === 'zoe' && A.seen.tts[0].text === 'heard: Hi'.replace('heard', 'zoe heard'), 'voice: her own voice (cast) and only spoken words: ' + JSON.stringify(A.seen.tts[0]));
  r = await post(18791, '/story/say', { who: 'wizra', text: 'Hey', voice: true }); await sleep(300);
  ok(r.text.includes('wizra heard') && !('cast' in A.seen.tts[1]), "say: Wizra through the story route keeps her usual voice (no cast)");
  r = await post(18791, '/story/choose', { id: 'tp4', answer: 0 }); ok(r.ok && A.seen.choose[0].id === 'tp4' && A.seen.choose[0].answer === 0, 'choose: the answer reaches Brenai');
  r = await post(18791, '/story/say', { who: 'zoe', text: '' }); ok(r.error, 'say: empty refused');

  // places
  r = await post(18791, '/story/places', { place: 'Peak Pizza', scene: 'Saves/scene/pizza.json' }); ok(r.places['Peak Pizza'] === 'Saves/scene/pizza.json' && r.all.length === 9, 'places: a scene set for a place (9 places)');
  r = await post(18791, '/story/places', { place: 'Mars', scene: 'x' }); ok(r.error, 'places: unknown place refused');
  r = await post(18791, '/story/goto', { place: 'Peak Pizza' }); let st = await get(18791, '/state');
  ok(r.ok && st.cmd && st.cmd.kind === 'scene' && st.cmd.path === 'Saves/scene/pizza.json', 'goto: VaM is told to load that place\'s scene');
  s = await get(18791, '/story/state'); ok(s.place === 'Peak Pizza', 'goto: the relay remembers where you are');
  r = await post(18791, '/story/goto', { place: 'Lake' }); ok(r.ok && /No scene set/.test(r.note), 'goto: a place with no scene says so');

  // Margo and writing
  const m = await get(18791, '/story/margo'); ok(m.selfies.length > 5 && m.call.every(c => c.file.endsWith('.jpg')), 'Margo: her pictures listed, all JPG (VaM cannot read WebP)');
  const img = await fetch('http://127.0.0.1:18791/story/media?p=margo/' + m.call[0].file); const buf = Buffer.from(await img.arrayBuffer());
  ok(img.status === 200 && buf[0] === 0xff && buf[1] === 0xd8, 'Margo: a call face is served as a JPEG');
  ok((await fetch('http://127.0.0.1:18791/story/media?p=../relay/brene-relay.mjs')).status === 404 && (await fetch('http://127.0.0.1:18791/story/media?p=margo/margo.json')).status === 404, 'media: only pictures inside the story folder');
  r = await post(18791, '/story/writing', { title: 'Chapter 1', text: 'It was a cold night in the cabin.' }); ok(r.ok && r.words === 8 && r.sentToBrenai && A.seen.writing[0].words === 8, 'writing: saved, words counted, sent to Brenai');
  s = await get(18791, '/story/writing'); ok(s.title === 'Chapter 1' && s.words === 8, 'writing: the last save comes back');
  ok(fs.readdirSync(path.join(T, 'writing')).length === 1, 'writing: a dated copy kept on the PC');

  // personality and touch
  let pz = await get(18791, '/story/personality?who=wizra'); ok(pz.traits.warmth === 65 && pz.traitList.find(x => x.name === 'warmth').value === 65 && pz.mood === 'cozy', "personality: Wizra's traits from Brenai's robot panel");
  pz = await get(18791, '/story/personality?who=zoe'); ok(pz.traits.dryness === 90, "personality: Zoe's from the story route");
  r = await post(18791, '/story/touch', { who: 'wizra', zone: 'head' }); ok(r.ok && A.seen.touch[0].kind === 'pat', 'touch: a pat on Wizra\'s head goes to Brenai as her own "pat"');
  r = await post(18791, '/story/touch', { who: 'zoe', zone: 'hand' }); ok(r.ok && A.seen.stouch[0].who === 'zoe' && A.seen.stouch[0].zone === 'hand', 'touch: others go through the story route');
  r = await post(18791, '/story/touch', { who: 'wizra', zone: 'chest' }); ok(r.error && !A.seen.stouch.some(x => x.zone === 'chest'), 'touch: parts Brenai keeps off limits are refused');

  // without the story routes yet
  s = await get(18792, '/story/state'); ok(!s.live && /no story routes/i.test(s.note), 'no story routes: state says so plainly');
  r = await post(18792, '/story/say', { who: 'wizra', text: 'yo', voice: true }); ok(r.text === '*grins* chat says yo' && r.voice, 'no story routes: Wizra still answers through her chat, with voice');
  r = await post(18792, '/story/touch', { who: 'wizra', zone: 'face' }); ok(r.ok && B.seen.touch[0].kind === 'poke', 'no story routes: Wizra\'s face poke still reaches her');
  r = await post(18792, '/story/touch', { who: 'wizra', zone: 'hand' }); ok(!r.ok && /needs the story routes/.test(r.note), 'no story routes: other parts say plainly they cannot be told yet');
  r = await post(18792, '/story/say', { who: 'belinda', text: 'hola' }); ok(r.error && /Belinda isn't connected yet/.test(r.error), 'no story routes: Belinda says she is not connected yet');
} catch (e) { fail++; console.log('FAIL ' + (e.stack || e)); }
finally { for (const p of procs) p.kill(); for (const s of servers) s.close(); fs.rmSync(T, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
