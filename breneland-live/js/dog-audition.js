// The dog voices: every real dog clip Dax and Nala could use, a Play and a heart each, the moods as the game plays them, and a
// list of the hearted ones to copy. One module for two pages: the music page's Dog voices section (owner-tiles, Andrew's
// Music & SFX tile) and the old audition page, which still works for anything that links to it.
//   mountDogAudition({ list, status, count, copy, clear, copied, engine? })   the page's own elements; engine: () => an AudioEngine
//   (the music page shares its own), otherwise one is made on the first tap. Returns the test hook (clips, played, pickText, engine).
// Nothing plays until a tap.
import { CLIPS, SOURCES } from './dog-clips.js';
import { DOG_VOICE_MAP } from './dog-voice-map.js';
import { AudioEngine } from './audio.js';
import { loadDogBank, bankOf, LEVEL } from './dog-voice.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const DOGS = [['dax', 'Dax', 'A shepherd type: a sharp, high yap', '--dax'], ['nala', 'Nala', 'A pit bull: a deep, throaty bark', '--nala'], ['dog', 'Both dogs', 'Shared sounds', '--both']];
const KIND_ORDER = ['bark', 'volley', 'yip', 'woof', 'whine', 'whimper', 'growl', 'grumble', 'huff', 'pant', 'sniff'];
const MOODS = { dax: [['excited', 'Excited', 'BORK BORK!'], ['happy', 'Happy', '*happy wuff!*'], ['alert', 'Alert', 'BORK!'], ['sad', 'Sad', '*nervous whine*'], ['calm', 'Calm', '*soft wuff*']],
  nala: [['excited', 'Excited', 'BORK BORK!'], ['happy', 'Happy', 'BORK!'], ['alert', 'Alert', 'BORK! BORK!'], ['sad', 'Sad', 'BORK!'], ['calm', 'Calm', 'BORK!']] };
const KEY = 'breneland.dogPicks';
const HEART = String.fromCharCode(0x2665), HEART_OPEN = String.fromCharCode(0x2661);

export function mountDogAudition({ list, status: statusEl, count, copy, clear, copied, engine: shared = null }) {
  const inGame = new Set(Object.values(DOG_VOICE_MAP).flatMap(d => Object.values(d).flat()));
  let picks = [];
  try { picks = JSON.parse(localStorage.getItem(KEY) || '[]').filter(id => CLIPS[id]); } catch { picks = []; }
  const savePicks = () => { try { localStorage.setItem(KEY, JSON.stringify(picks)); } catch { /* private window: the hearts last this visit */ } };
  const status = t => { if (statusEl) statusEl.textContent = t; };

  // ---- sound: made on the first tap (browsers only play after one); the game's own engine, the dog 2 m in front
  let eng = null;
  function engine() {
    if (shared) { eng = shared(); return eng; }
    if (!eng) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { status('This browser cannot play sound.'); return null; }
      eng = new AudioEngine();
      eng.init(new AC(), { beds: false });
      eng.listener = { x: 0, y: 1.6, z: 0 };
    } else if (eng.ctx.state !== 'running') eng.ctx.resume();
    return eng;
  }
  const played = [];
  async function playClip(id) {
    const a = engine(); if (!a) return;
    status('Loading ' + id + '...');
    await loadDogBank(a.ctx, { ids: [id] });
    const c = bankOf(a.ctx).clips.get(id);
    if (!c) { status(id + ' did not load.'); return; }
    status('');
    const t = a.ctx.currentTime + 0.03, src = a.ctx.createBufferSource(), g = a.gain(1.45 * (LEVEL[CLIPS[id].dog] || LEVEL.dax));
    src.buffer = c.buf;
    src.connect(g).connect(a.atVoice(0, 0.9, -2));
    src.start(t, c.lead);
    played.push(id);
  }
  async function playMood(who, mood, text, out) {
    const a = engine(); if (!a) return;
    if (!a.dogBank) status('Fetching the barks...');
    await a.loadDogs(0);
    status('');
    const r = a.dogVoice(who, 0, 0.9, -2, text, mood);
    out.textContent = r ? (r.real ? 'Played: ' + r.ids.join(', ') : 'Nothing played (the clips did not load yet)') : '';
    played.push(who + ':' + mood);
  }

  // ---- the list
  function heartLabel(b, id) { b.textContent = picks.includes(id) ? HEART : HEART_OPEN; b.setAttribute('aria-pressed', picks.includes(id) ? 'true' : 'false'); b.setAttribute('aria-label', 'Heart ' + id); }
  function refreshCount() { count.textContent = picks.length + ' picked'; }
  for (const [dog, name, blurb, cvar] of DOGS) {
    const sec = el('section', 'dog-sec'); sec.style.setProperty('--c', `var(${cvar})`); sec.dataset.dog = dog;
    const h = el('h3', 'dog-h'); const dot = el('span', 'dot'); h.append(dot, el('span', null, name + ': ' + blurb)); sec.append(h);
    if (MOODS[dog]) {
      sec.append(el('h4', null, 'What the game plays now, by mood'));
      const box = el('div', 'moods'), out = el('p', 'played');
      for (const [mood, words, text] of MOODS[dog]) {
        const b = el('button', null, words); b.type = 'button'; b.dataset.mood = mood;
        b.addEventListener('click', () => playMood(dog, mood, text, out));
        box.append(b);
      }
      sec.append(box, out);
    }
    const ids = Object.keys(CLIPS).filter(id => CLIPS[id].dog === dog);
    const kinds = [...new Set(ids.map(id => CLIPS[id].kind))].sort((p, q) => KIND_ORDER.indexOf(p) - KIND_ORDER.indexOf(q));
    for (const kind of kinds) {
      const kw = kind === 'volley' ? 'volleys (a few barks in a row)' : kind + (kind.endsWith('h') ? 'es' : 's');
      sec.append(el('h4', null, kw[0].toUpperCase() + kw.slice(1)));
      const grid = el('div', 'clips');
      for (const id of ids.filter(i => CLIPS[i].kind === kind)) {
        const c = CLIPS[id], S = SOURCES[c.src] || {};
        const card = el('article', 'clip' + (inGame.has(id) ? ' inmap' : '')); card.dataset.id = id;
        const top = el('div', 'top'); top.append(el('span', 'id', id));
        if (inGame.has(id)) top.append(el('span', 'tag', 'in the game'));
        card.append(top, el('p', 'note', c.note));
        card.append(el('p', 'nums', `${c.dur.toFixed(2)} s, ${c.f0 ? 'pitch about ' + c.f0 + ' Hz' : 'no clear pitch'}, brightness ${c.cent} Hz`));
        const cr = el('p', 'credit'); cr.append('From ');
        const a = el('a', null, S.title || c.src); a.href = S.page || '#'; a.target = '_blank'; a.rel = 'noopener';
        cr.append(a, `, by ${S.author || 'unknown'} (${S.license || '?'})`);
        card.append(cr);
        const row = el('div', 'row');
        const play = el('button', 'play', 'Play'); play.type = 'button'; play.addEventListener('click', () => playClip(id));
        const heart = el('button', 'heart'); heart.type = 'button'; heartLabel(heart, id);
        heart.addEventListener('click', () => { picks = picks.includes(id) ? picks.filter(p => p !== id) : [...picks, id]; savePicks(); heartLabel(heart, id); refreshCount(); });
        row.append(play, heart); card.append(row);
        grid.append(card);
      }
      sec.append(grid);
    }
    list.append(sec);
  }
  refreshCount();

  const pickText = () => [...picks].sort().join(', ');
  copy.addEventListener('click', async () => {
    const text = pickText() || '(no hearts yet)';
    copied.value = text; copied.hidden = false;
    try { await navigator.clipboard.writeText(text); status('Copied: ' + text); }
    catch { copied.focus(); copied.select(); status('Copy the list from the box below.'); }
  });
  clear.addEventListener('click', () => { picks = []; savePicks(); list.querySelectorAll('.heart').forEach(b => heartLabel(b, b.closest('.clip').dataset.id)); refreshCount(); copied.hidden = true; });
  // (tools/dog-voices-test.mjs and tools-menu-test.mjs read this; nothing here plays a sound by itself)
  return { get clips() { return list.querySelectorAll('.clip').length; }, played, pickText, get engine() { return eng; } };
}
