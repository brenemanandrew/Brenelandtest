// Game-night music: the D&D table's music in the game store's back room. What mood the table is in, what space a scene sounds in,
// and the band that plays it.
//   the mood     the tavern (The Hearth and Hound) while nobody plays or before the adventure begins. Then the DM's scene: a mood
//                the scene names (`mood` on the state or the module's scene, for when set_scene learns one), else ours for the three
//                adventures (SCENE_MOODS), else words in the scene's name, else the module's tone. A fight is the combat song, and a
//                won fight gets the victory piece for a while (VICTORY_HOLD) or until the next scene
//   layers       songs play in layers (music-band.js setLayer): base, rhythm, lead. A fight starts on the strings alone, the drums
//                join from round 2, the tune when a hero is low on HP or a boss is in it. While a check is asked (a d20 in the
//                air) the other moods thin to their base
//   crossfades   a new mood waits for the next bar line of the old song (at most QUANT_MAX s), then the two cross over XF s. The
//                old one never stops before the new one is in, so no gap. A fight comes in faster, behind its drum roll
//   the space    each scene has acoustics (SPACES: the tavern a small warm room, a forest soft and open, stone halls, a cave's big
//                echo, a crypt's cold long tail). dnd-sound.js builds the reverb and fades between them
// dnd-sound.js owns the room's output (where you are, the duck under the DM's voice, the reverb) and calls this. music.js steps
// aside in the back room. Sound is local, so Math.random is fine here.
import { SONGS, TABLE_SONGS } from './music-songs.js';
import { createBand, instrumentsOf } from './music-band.js';
import { instBank } from './music-sampler.js';
import { LEVEL_DB } from './music.js';

export const MOODS = ['tavern', 'explore', 'tension', 'combat', 'spooky', 'victory'];
export const MOOD_NAMES = { tavern: 'Tavern and table talk', explore: 'Exploring and travelling', tension: 'Tension in the dungeon', combat: 'Combat', spooky: 'Spooky and haunted', victory: 'Victory and rest' };
export const VICTORY_HOLD = 100;   // seconds the victory piece plays after a won fight (its fanfare and a round by the fire)
export const XF = 3.2;             // a mood's crossfade (s)
export const XF_COMBAT = 1.4;      // into a fight (behind the drum roll)
export const QUANT_MAX = 2.6;      // the longest a crossfade waits for the bar line
export const LOAD_WAIT = 6;        // the longest it waits for the new song's instruments
export const LAYER_FADE = 2.5;     // a layer's fade (s)

// the three adventures: the module's tone (its default) and each scene's mood and space
export const MODULE_TONE = { mossbrook: 'explore', 'swarm-spore-root': 'spooky', 'waifs-in-white': 'spooky' };
export const SCENE_MOODS = {
  mossbrook: { s1: ['explore', 'forest'], s2: ['explore', 'forest'], s3: ['explore', 'hall'], s4: ['tension', 'cave'], s5: ['tension', 'cave'], s6: ['victory', 'forest'] },
  'swarm-spore-root': { s1: ['spooky', 'forest'], s2: ['tension', 'forest'], s3: ['tension', 'cave'], s4: ['spooky', 'cave'], s5: ['tension', 'hall'], s6: ['spooky', 'hall'], s7: ['tension', 'hall'],
    s8: ['tension', 'hall'], s9: ['spooky', 'hall'], s10: ['tension', 'hall'], s11: ['tension', 'crypt'], s12: ['victory', 'hall'], s13: ['tension', 'cave'] },
  'waifs-in-white': { s1: ['spooky', 'forest'], s2: ['tavern', 'tavern'], s3: ['spooky', 'crypt'], s4: ['tension', 'cave'], s5: ['spooky', 'crypt'], s6: ['spooky', 'crypt'], s7: ['tension', 'hall'] },
};
// the acoustics (dnd-sound.js makes an impulse response of each): the tail (s), how dark it is (the high cut it decays to, Hz),
// the wet level, the early echoes (s: discrete repeats, the cave's slap off the far wall) and the pre-delay
export const SPACES = {
  tavern: { name: 'a small warm room', tail: 0.9, dark: 3800, wet: 0.22, echoes: [], pre: 0.008 },
  forest: { name: 'soft and open', tail: 1.3, dark: 6500, wet: 0.16, echoes: [0.11], pre: 0.02 },
  hall: { name: 'a stone hall', tail: 2.2, dark: 4200, wet: 0.3, echoes: [0.07, 0.15], pre: 0.018 },
  cave: { name: 'a cave, a big echo', tail: 3.6, dark: 3000, wet: 0.42, echoes: [0.19, 0.38, 0.57], pre: 0.03 },
  crypt: { name: 'a crypt, a cold long tail', tail: 4.6, dark: 2200, wet: 0.38, echoes: [0.13, 0.29], pre: 0.025 },
};
export const MOOD_SPACE = { tavern: 'tavern', explore: 'forest', tension: 'hall', combat: 'hall', spooky: 'crypt', victory: 'tavern' };
const WORDS = [
  [/tavern|inn\b|diner|kitchen|camp|feast|home|village|market|rest\b/i, 'tavern', 'tavern'],
  [/cave|cavern|aquifer|tunnel|warren|mine\b|grotto/i, 'tension', 'cave'],
  [/crypt|tomb|grave|haunt|ghost|catacomb|ossuary|mausoleum/i, 'spooky', 'crypt'],
  [/dungeon|tower|chamber|vault|hall\b|shrine|temple|cellar|basement|sealed|room\b/i, 'tension', 'hall'],
  [/road|path|forest|wood|river|reed|hill|field|bog|marsh|lake|travel|journey/i, 'explore', 'forest'],
];
/** a mood and a space from words (a scene's name or area): [mood, space] or null */
export function moodOfWords(text) {
  for (const [re, mood, space] of WORDS) if (re.test(String(text || ''))) return [mood, space];
  return null;
}
/** the scene's own mood and space: what the state or the module says, ours, the words, the module's tone */
export function sceneMood(s, sceneInfo = null) {
  const mod = s?.module?.id, sc = s?.scene, info = sceneInfo || {};
  const named = MOODS.includes(s?.mood) ? s.mood : MOODS.includes(info.mood) ? info.mood : null;
  const ours = SCENE_MOODS[mod]?.[sc] || null, words = moodOfWords((s?.sceneName || '') + ' ' + (info.area || ''));
  const mood = named || ours?.[0] || words?.[0] || MODULE_TONE[mod] || (/teen|mature|13|16/i.test(s?.module?.rating || '') ? 'tension' : 'explore');
  const space = (SPACES[info.space] ? info.space : null) || ours?.[1] || words?.[1] || MOOD_SPACE[mood];
  return { mood, space, why: named ? 'the scene says' : ours ? 'the adventure\'s scene' : words ? 'the scene\'s name' : MODULE_TONE[mod] ? 'the module\'s tone' : 'the default' };
}
/** what the table plays now: { mood, space, why } from the shared D&D state (lib/dnd.js pub()) and the victory window */
export function tableMood(s, { now = 0, victoryUntil = -1, sceneInfo = null } = {}) {
  if (!s || !s.module || !s.started) return { mood: 'tavern', space: 'tavern', why: s?.module ? 'the adventure has not begun' : 'nobody is playing' };
  const sm = sceneMood(s, sceneInfo);
  if (s.combat) return { mood: 'combat', space: sm.space, why: 'a fight' };
  if (now < victoryUntil) return { mood: 'victory', space: sm.space, why: 'the fight is won' };
  return sm;
}
/** the fight's layers from the state: the drums from round 2, the tune when a hero is low or a boss is in it */
export function combatLayers(s) {
  const C = s?.combat; if (!C) return { base: 1, rhythm: 1, lead: 1, why: 'no fight' };
  const heroes = (s.seats || []).filter(x => x && x.char && x.char.maxHp), low = heroes.some(x => x.char.hp <= Math.max(1, x.char.maxHp * 0.35));
  const mons = s.monsters || [], boss = mons.some(m => m.maxHp >= 45) || (mons.length === 1 && mons[0].maxHp >= 30) || !!s.boss;
  const going = C.round > 1 || C.turn >= Math.min(2, Math.max(1, (C.order || []).length - 1));
  return { base: 1, rhythm: going || low || boss ? 1 : 0, lead: low || boss ? 1 : 0, why: [going ? 'the fight goes on' : 'the fight begins', low ? 'a hero is low' : '', boss ? 'a boss' : ''].filter(Boolean).join(', ') };
}

/** the table's band: createTableMusic(audio, { out, send }) -> api; update(t, want) every frame with
 *  want = { mood, layers: { base, rhythm, lead }, fast } or null (silent) */
export function createTableMusic(audio, { out, send = null, useSamples = true, loadOpts = null } = {}) {
  let band = null, mood = null, pend = null, lastLayers = {}, lastWant;
  const log = [], old = [];
  const bankNow = () => (useSamples && audio.ctx ? instBank(audio.ctx) : null);
  function startSong(m, at, fade) {
    const id = TABLE_SONGS[m], song = SONGS[id], bank = bankNow();
    const b = createBand(audio, song, { out, send, db: LEVEL_DB.backroom || 0, bank, layers: { ...lastLayers } });
    b.start(at, { fade });
    return b;
  }
  const api = {
    get mood() { return mood; },
    get band() { return band; },
    get track() { return band ? band.id : null; },
    get pending() { return pend ? { mood: pend.mood, at: +pend.at.toFixed(2), quantised: pend.quantised } : null; },
    get log() { return log.slice(); },
    /** every frame; `want` is looked at again only when it is a new object (dnd-sound.js makes one when something changed) */
    update(t, want) {
      if (old.length) for (let i = old.length - 1; i >= 0; i--) if (t > old[i].until) old.splice(i, 1);
      const fresh = want !== lastWant; lastWant = want;
      if (!want) {   // silent: fade out what plays
        if (band) { band.stop(2.5); old.push({ band, until: t + 3 }); log.push({ ev: 'out', mood, at: +t.toFixed(2) }); band = null; mood = null; }
        pend = null; return;
      }
      if (fresh) api._want(t, want);
      api._switch(t);
      if (band) band.pump(t);
      for (const o of old) o.band.pump(t);
    },
    _want(t, want) {
      if (want.layers) lastLayers = want.layers;
      if (want.mood === mood && pend) pend = null;   // it changed its mind before the bar line
      if (want.mood !== mood && (!pend || pend.mood !== want.mood)) {
        const bank = bankNow(), need = instrumentsOf(SONGS[TABLE_SONGS[want.mood]]);
        if (bank) bank.load(need, loadOpts || {});
        const fast = want.mood === 'combat' || want.fast;
        let at = t + 0.05, quantised = false;
        if (band && !fast) { const nb = band.nextBar(t); if (nb - t <= QUANT_MAX) { at = nb; quantised = true; } else at = t + QUANT_MAX; }
        if (fast && want.at) at = Math.max(t + 0.05, want.at);
        pend = { mood: want.mood, at, quantised, since: t, need, xf: band ? (fast ? XF_COMBAT : XF) : 2.5 };
      }
      if (band && want.layers) for (const k in want.layers) if (band.layers[k] !== want.layers[k]) { band.setLayer(k, want.layers[k], want.layerFade ?? LAYER_FADE); log.push({ ev: 'layer', layer: k, v: want.layers[k], at: +t.toFixed(2) }); }
    },
    _switch(t) {
      if (pend && t >= pend.at - 0.03) {
        const bank = bankNow();
        if (bank && !bank.settled(pend.need) && t - pend.since < LOAD_WAIT) { /* its instruments are on their way */ }
        else {
          const from = mood, at = Math.max(t + 0.03, pend.at);
          const nb = startSong(pend.mood, at, pend.xf);
          // the old one fades only as the new one rises, from the same moment, never a gap between them
          if (band) { const ob = band; ob.stop(pend.xf * 1.15); old.push({ band: ob, until: t + pend.xf + 3 }); }
          band = nb; mood = pend.mood;
          log.push({ ev: 'xfade', from, to: mood, at: +at.toFixed(2), quantised: pend.quantised, xf: pend.xf, waited: +(at - pend.since).toFixed(2) });
          if (log.length > 40) log.shift();
          pend = null;
          for (const k in lastLayers) band.setLayer(k, lastLayers[k], 0.05);
        }
      }
    },
    /** the bands' gains now (the crossfade check: the sum never dips) */
    gains() { return { now: band ? band.gain : 0, old: old.reduce((a, o) => a + (o.band.stopped ? o.band.gain : 0), 0) }; },
    stop() { if (band) { band.stop(1); band = null; } mood = null; pend = null; },
  };
  return api;
}
