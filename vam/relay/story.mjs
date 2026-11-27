// Little Shepersville: the relay's story side. Brenai's server is every character's mind; VaM is the body and the town.
// PROVISIONAL: the Brenai routes below are the shape Brenebase proposed (2026-11-27). The Brenai session will send its own
// route spec; only the three Brenai calls at the bottom (brenaiState, brenaiSay, brenaiChoose) should need to change.
//
// Relay routes for the VaM plugin (all local):
//   GET  /story/state            {live, day, time, place, cast{}, pending{id, question, answers[]}, places{}, note}
//   POST /story/say              {who, text, place, present[], voice} -> {text, voice, who} | {error}
//   POST /story/choose           {id, answer} -> {ok} | {error}
//   GET  /story/places           {places: {name: scene path}};  POST {place, scene} sets one
//   POST /story/goto             {place} -> loads that place's scene in VaM (through the library's command queue)
//   GET  /story/margo            margo.json (her selfies and call faces, JPG)
//   GET  /story/media?p=         a picture from the story folder (JPG or PNG only, inside the folder)
//   GET  /story/personality?who=  {traits{}, mood, feeling}: Wizra from Brenai's robot panel (owner only), others from the story routes
//   POST /story/touch            {who, zone} -> tells her (Brenai's touch notes: Wizra's pat and poke today, the rest through the story routes)
//   GET  /story/writing          {title, text, words, at};  POST {title, text} saves it (on this PC; also sent to Brenai when it has a route)
import fs from 'node:fs';
import path from 'node:path';

// traits as a list too ({name, value}), which the VaM plugin can walk
const withList = o => ({ ...o, traitList: Object.entries(o.traits || {}).map(([name, value]) => ({ name, value: +value || 0 })) });
export const CAST = ['wizra', 'zoe', 'belinda', 'margo'];
// the parts she can be touched on: Brenai's own touch areas plus the head; chest, hips and thighs stay off limits there
export const ZONES = ['head', 'face', 'hair', 'shoulder', 'arm', 'hand', 'belly', 'knee'];
export const PLACES = ['Rental cabin', 'Peak Pizza', 'Casa Belinda', 'Main Street', 'Library', "Wizra's flat", 'Lodge', 'Trail', 'Lake'];

export function story({ dataDir, storyDir, lib, brenai, askWizra, makeVoice, spokenOf }) {
  const file = path.join(dataDir, 'story.json');
  let s = { places: {}, place: '', writing: null };
  try { Object.assign(s, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch {}
  const save = () => { try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(s, null, 1)); } catch {} };
  let live = null;   // null = not tried, true / false = Brenai has (or lacks) the story routes

  // ---- Brenai (provisional route shapes) ----
  async function call(method, p, body, again = true) {
    if (!brenai.signedIn()) await brenai.signIn();
    const r = await fetch(brenai.url + p, { method, headers: { 'content-type': 'application/json', cookie: brenai.cookie() }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 404) { live = false; const e = new Error('Brenai has no story routes yet'); e.notYet = true; throw e; }
    if (r.status === 401 && again) { await brenai.signIn(); return call(method, p, body, false); }   // the sign-in ran out: sign in and ask once more
    const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'Brenai answered ' + r.status);
    live = true; return j;
  }
  const brenaiState = () => call('GET', '/api/story/state');
  const brenaiSay = b => call('POST', '/api/story/say', b);
  const brenaiChoose = b => call('POST', '/api/story/choose', b);

  // the plugin asks for the state every 2 seconds. Brenai is asked at most every 1.5 s while it answers; after a failure the
  // relay waits before asking again (a wrong PIN must not be tried every 2 s, and missing story routes will not appear in a minute)
  let last = { at: 0, j: null, wait: 1500 };
  return async function route(req, res, url, { send, readBody }) {
    const p = url.pathname;
    if (p === '/story/state') {
      let j = null, note = '';
      if (brenai.enabled && Date.now() - last.at > last.wait) { try { j = await brenaiState(); last = { at: Date.now(), j, wait: 1500 }; } catch (e) { note = e.message; last = { at: Date.now(), j: null, note, wait: e.notYet ? 60000 : 15000 }; } }
      else { j = last.j; note = last.note || (brenai.enabled ? '' : 'Set BRENAI_PIN on this PC for the story'); }
      return send(res, 200, { live: !!j, ...(j || {}), place: s.place || (j && j.place) || '', places: s.places, note: j ? '' : note });
    }
    if (p === '/story/say' && req.method === 'POST') {
      const b = await readBody(req), who = CAST.includes(b.who) ? b.who : 'wizra', text = String(b.text || '').trim().slice(0, 4000);
      if (!text) return send(res, 400, { error: 'Say something first' });
      const present = (Array.isArray(b.present) ? b.present : []).filter(x => CAST.includes(x)), place = String(b.place || s.place || '').slice(0, 60);
      let reply;
      try { reply = brenai.enabled ? (await brenaiSay({ who, text, place, present })).text : null; }
      catch (e) { if (!e.notYet) return send(res, 200, { error: e.message }); reply = null; }
      if (reply == null) {   // the story routes are not there yet: Wizra still answers through her normal chat; the others wait
        if (who !== 'wizra') return send(res, 200, { error: `${who[0].toUpperCase() + who.slice(1)} isn't connected yet: Brenai's story routes aren't built. Wizra works now.` });
        try { reply = await askWizra(text); } catch (e) { return send(res, 200, { error: e.message }); }
      }
      let voice = null; const spoken = spokenOf(reply);
      if (b.voice && brenai.enabled && spoken) voice = makeVoice(spoken, who === 'wizra' ? '' : who);
      return send(res, 200, { text: reply, voice, who });
    }
    if (p === '/story/choose' && req.method === 'POST') {
      const b = await readBody(req);
      try { await brenaiChoose({ id: String(b.id || ''), answer: b.answer }); last.at = 0; return send(res, 200, { ok: true }); }
      catch (e) { return send(res, 200, { error: e.message }); }
    }
    if (p === '/story/places') {
      if (req.method === 'POST') { const b = await readBody(req); if (!PLACES.includes(b.place)) return send(res, 400, { error: 'unknown place' }); if (b.scene) s.places[b.place] = String(b.scene); else delete s.places[b.place]; save(); }
      return send(res, 200, { places: s.places, all: PLACES });
    }
    if (p === '/story/goto' && req.method === 'POST') {
      const b = await readBody(req), scene = s.places[b.place];
      if (!PLACES.includes(b.place)) return send(res, 400, { error: 'unknown place' });
      s.place = b.place; save();
      if (!scene) return send(res, 200, { ok: true, note: 'No scene set for ' + b.place + ' yet: pick one in the Places list.' });
      const c = lib.queue({ kind: 'scene', path: scene }); return send(res, 200, { ok: true, id: c.id });
    }
    if (p === '/story/personality') {
      const who = CAST.includes(url.searchParams.get('who')) ? url.searchParams.get('who') : 'wizra';
      if (!brenai.enabled) return send(res, 200, { error: 'Set BRENAI_PIN on this PC to read her personality from Brenai' });
      try {
        if (who === 'wizra') { const j = await call('GET', '/api/robot'); return send(res, 200, withList({ traits: (j.sheet && j.sheet.traits) || j.traitsDefault || {}, mood: j.mood || '', feeling: j.feeling || '' })); }
        const j = await call('GET', '/api/story/personality?who=' + who); return send(res, 200, withList({ traits: j.traits || {}, mood: j.mood || '', feeling: j.feeling || '' }));
      } catch (e) { return send(res, 200, { error: e.notYet ? `${who[0].toUpperCase() + who.slice(1)}'s personality isn't in Brenai yet (the story routes aren't built).` : /owner/i.test(e.message) ? 'Brenai only shows her personality to the game\'s owner: sign the relay in with the owner\'s PIN.' : e.message }); }
    }
    if (p === '/story/touch' && req.method === 'POST') {
      const b = await readBody(req), who = CAST.includes(b.who) ? b.who : 'wizra', zone = ZONES.includes(b.zone) ? b.zone : null;
      if (!zone) return send(res, 400, { error: 'unknown part' });
      if (!brenai.enabled) return send(res, 200, { ok: false, note: 'Not told: set BRENAI_PIN on this PC.' });
      // Wizra's own touch notes in Brenai today: a pat on the head, a poke on the cheek
      const kind = who === 'wizra' ? { head: 'pat', face: 'poke' }[zone] : null;
      try {
        if (kind) { await call('POST', '/api/touch', { kind }); return send(res, 200, { ok: true }); }
        await call('POST', '/api/story/touch', { who, zone }); return send(res, 200, { ok: true });
      } catch (e) { return send(res, 200, { ok: false, note: e.notYet ? `She reacted, but Brenai can't be told about a touch on the ${zone} yet (needs the story routes). Head and face work for Wizra now.` : e.message }); }
    }
    if (p === '/story/margo') { try { return send(res, 200, JSON.parse(fs.readFileSync(path.join(storyDir, 'margo', 'margo.json'), 'utf8'))); } catch { return send(res, 404, { error: 'no margo.json in ' + storyDir }); } }
    if (p === '/story/media') {
      const rel = String(url.searchParams.get('p') || ''), full = path.resolve(storyDir, rel);
      if (!/\.(jpe?g|png)$/i.test(rel) || !full.startsWith(path.resolve(storyDir) + path.sep) || !fs.existsSync(full)) return send(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': /png$/i.test(rel) ? 'image/png' : 'image/jpeg', 'cache-control': 'max-age=3600' }); return res.end(fs.readFileSync(full));
    }
    if (p === '/story/writing') {
      if (req.method === 'POST') {
        const b = await readBody(req), text = String(b.text || '').slice(0, 400000), title = String(b.title || 'Untitled').slice(0, 120);
        const words = (text.match(/\S+/g) || []).length; s.writing = { title, text, words, at: Date.now() }; save();
        // a dated copy too, so nothing he writes is ever lost to a later save
        try { const d = path.join(dataDir, 'writing'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, new Date().toISOString().replace(/[:.]/g, '-') + '.md'), `# ${title}\n\n${text}\n`); } catch {}
        let sent = false; if (brenai.enabled) { try { await call('POST', '/api/story/writing', { title, text, words }); sent = true; } catch {} }
        return send(res, 200, { ok: true, words, sentToBrenai: sent });
      }
      return send(res, 200, s.writing || { title: '', text: '', words: 0, at: 0 });
    }
    return send(res, 404, { error: 'not found' });
  };
}
