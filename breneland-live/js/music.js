// The music: our own, in the Animal Crossing spirit (music-songs.js, played by music-band.js on recorded instruments from
// music-sampler.js, sparse and lo-fi), chosen by where you are and the time of day. A song's instruments are fetched when it's due
// (never before the sound is on, only that place's set). The song waits for them up to LOAD_WAIT seconds, then plays with whatever
// arrived (a missing instrument on its synthesised voice).
//   walking around   a song for the area and the hour (morning-yard, town-stroll, lakeshore, woods-path, porch-light, starlight),
//                    each played through once, then a minute or two of quiet (longer late at night) before the next. Never the
//                    same one twice running. The hour shapes it too (brighter mornings, mellower evenings, sparse late at night)
//   the Lovecraft house   parlour-waltz and lamplight-study, looping (twice round each, then the other), darker on storm days
//   the game store   counter-talk and high-score, the same way
//   fishing          line-out while your rod is out (and a little after you put it away). A catch makes it dip and answer
//   Kevin's boat     kevins-boat, bluegrass, while you're aboard (boat-music.js keeps the water, the creak and the loon)
// Going in or out, boarding or picking up the rod crossfades: the old music closes like a door behind you (a lowpass sweep) and
// the new one opens in. Step back out soon enough and the walking song you left comes back at its next section.
//   D&D night        the game store's back room: game-night-music.js plays the table's music and this steps aside, the store's
//                    song closing behind you like a door
//   Kevin's Tool Crib  his radio is the music in there (crib-sound.js, positioned at the set): this steps aside the same way,
//                    the walking song closing behind you at the door and coming back (at its next section) when you step out
//   a board game     at one of the store's tables, or while a game says so (api.game: 'start', 'tense', 'calm', 'over', 'end'):
//                    Cozy Table and Your Move by turns, Close Game for a tense moment, a sting for 'over'
// Never during the intro, the tutorial or a mini-game (main.js `blocker`). Faded out by the master mute, ducked under voice chat
// and the NPC babble (audio.update: MUSIC_DUCK_DB), with its own Music slider (Settings > Sound). The hour is Eastern, the shared
// clock's (LIGHT.hour). Sound is local, so Math.random is fine here.
import { SONGS, WALK, PLAYLISTS } from './music-songs.js';
import { createBand, instrumentsOf } from './music-band.js';
import { instBank } from './music-sampler.js';
import { easternParts } from './daytime.js';
import { LIGHT } from './daynight-mats.js';

export const SLOTS = ['morning', 'day', 'golden', 'evening', 'late'];
export function slotOf(h) { return h >= 6 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'golden' : h >= 20 && h < 23 ? 'evening' : 'late'; }
// the level (dB, on top of each song's own `db`) by scene and, walking, by the hour: measured with tools/audio-levels.mjs (group
// music): by day about the ambience bed's loudness, the evening a little softer, late at night softer still
export const LEVEL_DB = { walk: { morning: 0, day: 0, golden: -0.5, evening: -2, late: -4 }, lovecraft: -1, store: 0, fishing: -1, boat: 0,
  backroom: -2, boardgame: -1, 'boardgame-tense': -1 };   // the table's music sits under the DM's voice
export const GAP = [60, 120];          // seconds of quiet between walking songs
export const LATE_GAP = [150, 300];    // late at night
export const FIRST_GAP = [20, 40];     // after you step outside (the yard's own sounds first)
export const BACK_GAP = [10, 20];      // after something stopped it (a mini-game, the tutorial)
export const RESUME_WITHIN = 240;      // stepping back out within this, the walking song you left picks up again
export const FISH_LINGER = 15;         // seconds the fishing music stays after the rod goes away
export const LOOPS_EACH = 2;           // an interior's song goes round this often, then the other
export const XF = { out: 2.6, in: 2.8, door: 650, boat: 1600, open: 800 };   // crossfades: seconds, the lowpass's door (Hz)
const INDOOR = new Set(['store', 'lovecraft', 'backroom', 'crib']);
const GAME = new Set(['boardgame', 'boardgame-tense']);   // a board game's scenes crossfade softly, no door
export const TENSE_MAX = 90;           // a game's 'tense' lasts this long unless it says again (or 'calm')
export const GAME_LINGER = 30;         // after 'over' the board-game music stays this long unless the game starts again or ends
export const OVER_HOLD = 3.5;          // the sting of 'over' plays out before a tense song gives way
export const LOAD_WAIT = 6;            // seconds a song waits for its instruments before it plays with what it has
export const TRIM_AFTER = 300;         // an instrument no song has played for this long is let go (memory on phones)

/** the walking songs for an area and a time of day, best first (the hour counts most, the area next) */
export function walkChoices(area, slot) {
  const score = id => { const h = SONGS[id].home, k = h.slots.indexOf(slot); return k < 0 ? 0 : (k === 0 ? 3 : 2) + (h.areas.includes(area) ? 1.5 : 0); };
  return WALK.map(id => ({ id, score: score(id) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
}
/** the song to play: the best for the place and the hour that was not the last one played */
export function pickWalk(area, slot, recent = []) {
  const c = walkChoices(area, slot);
  if (!c.length) return 'porch-light';
  const last = recent[recent.length - 1];
  return (c.find(x => x.id !== last) || c[0]).id;
}
const rand = (a, b) => a + Math.random() * (b - a);

export function createMusic(audio) {
  let phase = 'idle', scene = null, band = null, track = null, nextAt = -1, lastBlock = null, suspended = null, fishUntil = -1;
  let pending = null, prefetched = null, lastNeed = [];
  let game = null, holdUntil = -1;   // a board game in play, from api.game; a scene held while a sting plays
  const gameLog = [];
  const history = [], log = [], plIdx = {};
  let dateMs = null, hourOverride = null, placeOverride = null;
  const now = () => audio.ctx.currentTime;

  // the hour and its slot, at most once a second (update() asks every frame; easternParts allocates)
  const W = { hour: 12, slot: 'day', at: -1e9, d: null, h: null };
  function when() {
    const ms = Date.now();
    if (ms - W.at < 1000 && W.d === dateMs && W.h === hourOverride) return W;
    const p = easternParts(dateMs ?? ms);
    W.hour = hourOverride ?? (Number.isFinite(LIGHT.hour) ? LIGHT.hour : p.h + p.mi / 60);
    W.slot = slotOf(W.hour); W.at = ms; W.d = dateMs; W.h = hourOverride;
    return W;
  }
  // where you are (main.js sets api.place: area, interior, fishing, storm, table), four times a second
  const P = { area: 'yard', interior: null, fishing: false, storm: false, table: null, at: -1e9 };
  function place() {
    const ms = Date.now();
    if (placeOverride) return Object.assign(P, { area: 'yard', interior: null, fishing: false, storm: false, table: null }, placeOverride);
    if (ms - P.at < 250) return P;
    P.at = ms;
    let p = null;
    try { p = api.place ? api.place() : null; } catch { p = null; }
    P.area = p?.area || 'yard'; P.interior = p?.interior || null; P.fishing = !!p?.fishing; P.storm = !!p?.storm; P.table = p?.table || null;
    return P;
  }
  // a board game in play: the game's word, else a seat at one of the store's tables
  function gameScene(t, p) {
    if (game && game.until !== null && t >= game.until) game = null;
    if (game) return game.mood === 'tense' && t < game.tenseUntil ? 'boardgame-tense' : 'boardgame';
    return p.table ? 'boardgame' : null;
  }
  function sceneNow(t) {
    if (audio.musicMode === 'boat') return 'boat';
    const p = place();
    if (p.interior === 'backroom') return 'backroom';   // game-night-music.js has the room
    if (p.interior === 'crib') return 'crib';           // Kevin's radio has the Tool Crib (crib-sound.js)
    if (p.interior === 'party') return 'party';         // the late party's music has Summit Slice (mall-staff-party-sound.js)
    if (GAME.has(scene) && t < holdUntil) return scene;
    const g = gameScene(t, p);
    if (g) return g;
    if (INDOOR.has(p.interior)) return p.interior;
    if (p.fishing) fishUntil = t + FISH_LINGER;
    return t < fishUntil ? 'fishing' : 'walk';
  }

  const bankNow = () => (api.useSamples && audio.ctx ? instBank(audio.ctx) : null);
  // a song is due: its instruments first (they load while the old song fades), then the band
  function startBand(id, at, o = {}) {
    const song = SONGS[id], bank = bankNow(), need = instrumentsOf(song);
    track = id;
    if (bank && !bank.settled(need)) { bank.load(need, api.loadOpts || {}); pending = { id, at, o, since: now(), need }; return; }
    playBand(id, at, o, bank, need);
  }
  function playBand(id, at, o, bank, need) {
    const song = SONGS[id];
    pending = null;
    if (bank) { bank.trim(need.concat(lastNeed), TRIM_AFTER, now()); lastNeed = need; }
    band = createBand(audio, song, { variant: o.variant || null, db: o.db || 0, start: o.start || 0, bank });
    band.start(Math.max(at, now() + 0.05), { fade: o.fade ?? XF.in, from: o.from || null });
    track = id;
    history.push(id); if (history.length > 12) history.shift();
    log.push({ id, scene, at, variant: o.variant || null, db: o.db || 0, start: o.start || 0, resumed: !!o.resumed });
    if (log.length > 40) log.shift();
  }
  function stopBand(fade, to) { pending = null; if (!band) { track = null; return; } band.stop(fade, { to }); band = null; track = null; }
  function startWalk(t, o = {}) {
    const w = when(), id = o.id || pickWalk(place().area, w.slot, history);
    startBand(id, t + 0.1, { variant: w.slot, db: LEVEL_DB.walk[w.slot], fade: o.fade ?? 4, from: o.from, start: o.start, resumed: o.resumed });
    phase = 'playing';
  }
  function startLooped(sc, t, from) {
    const list = PLAYLISTS[sc], i = (plIdx[sc] = ((plIdx[sc] ?? -1) + 1) % list.length);
    const variant = sc === 'lovecraft' && place().storm ? 'storm' : null;
    startBand(list[i], t, { variant, db: LEVEL_DB[sc] || 0, fade: from === null ? 3 : XF.in, from: from === null ? null : 1200 });
    phase = 'playing';
  }
  // a new scene: the old music fades and closes behind you, the new one opens in
  function enter(sc, t) {
    const from = scene;
    scene = sc;
    const soft = GAME.has(sc) && GAME.has(from), doorway = !GAME.has(sc) && !GAME.has(from) && (INDOOR.has(sc) || INDOOR.has(from));
    if (pending) { pending = null; track = null; }
    if (band) {
      if (from === 'walk' && phase === 'playing') {   // picked up at its next section, not when only the outro was left
        const bs = band.state(), nx = bs.bar > 0 ? bs.formIndex + 1 : bs.formIndex;
        suspended = nx < SONGS[band.id].form.length - 1 ? { id: band.id, at: t, start: nx } : null;
      }
      if (soft) stopBand(2.2, null);   // calm to tense and back: a plain crossfade
      else stopBand(XF.out, doorway ? XF.door : sc === 'boat' || from === 'boat' ? XF.boat : 1800);
    }
    if (sc === 'backroom' || sc === 'crib' || sc === 'party') { phase = 'yield'; return; }   // game-night-music.js plays the back room, Kevin's radio the Tool Crib, the party its own track
    if (soft) { startLooped(sc, t + 0.4, null); return; }
    if (sc === 'walk') {
      if (from === null) { phase = 'waiting'; nextAt = t + rand(...(lastBlock === null || lastBlock === 'no-sound' || lastBlock === 'intro' || lastBlock === 'not-playing' ? FIRST_GAP : BACK_GAP)); }
      else if (suspended && t - suspended.at < RESUME_WITHIN && SONGS[suspended.id]) { const s = suspended; suspended = null; startWalk(t + 0.8, { id: s.id, start: s.start, fade: 3.5, from: doorway ? XF.open : null, resumed: true }); }
      else { phase = 'waiting'; nextAt = t + rand(...BACK_GAP); }
    } else startLooped(sc, t + (from === null ? 0.3 : 0.9), from);
  }

  const api = {
    blocker: null,          // () -> a reason the music must not play now (main.js: the intro, the tutorial, a mini-game), or null
    useSamples: true,       // false: the synthesised voices only
    loadOpts: null,         // { fetchFn, decodeFn } for the instruments (tests)
    get loading() { return pending ? { id: pending.id, need: pending.need.slice(), waited: audio.ctx ? +(now() - pending.since).toFixed(2) : 0 } : null; },
    get bank() { return bankNow(); },
    place: null,            // () -> { area: 'yard'|'town'|'lake'|'woods', interior: 'store'|'lovecraft'|'backroom'|'crib'|null, fishing, storm } (main.js)
    get phase() { return phase; },
    get scene() { return scene; },
    get track() { return track; },
    get band() { return band; },
    get history() { return history.slice(); },
    get log() { return log.slice(); },
    /** why the music is quiet right now (or null): no sound yet, muted, a blocker */
    blockedBy() {
      if (!audio.ctx) return 'no-sound';
      if (audio.muted) return 'muted';
      const b = api.blocker ? api.blocker() : null;
      if (b === 'minigame' && game) return null;   // a board game that asked for its music
      return b || null;
    },
    /** a board game tells the music what's happening: 'start', 'tense' (a close moment: Close Game for up to TENSE_MAX s or
     *  o.secs), 'calm', 'over' (the song's sting, then GAME_LINGER s more unless it starts again), 'end'.
     *  o.id names the game (Mexican Train: 'mexican-train'). Returns what the music does with it. */
    game(ev, o = {}) {
      const t = audio.ctx ? now() : 0;
      if (ev === 'end') { game = null; gameLog.push({ ev, at: t }); return { ev, game: null }; }
      if (ev === 'start' || !game) game = { id: o.id || game?.id || 'game', mood: 'calm', tenseUntil: 0, until: null, since: t };
      game.until = null;
      if (o.id) game.id = o.id;
      let cued = false;
      if (ev === 'tense') { game.mood = 'tense'; game.tenseUntil = t + (o.secs || TENSE_MAX); }
      else if (ev === 'calm') game.mood = 'calm';
      else if (ev === 'over') { cued = band && GAME.has(scene) ? band.cue('over') : false; game.mood = 'calm'; game.until = t + GAME_LINGER; if (cued) holdUntil = t + OVER_HOLD; }
      gameLog.push({ ev, at: t, id: game.id, cued });
      if (gameLog.length > 30) gameLog.shift();
      return { ev, game: { ...game }, cued };
    },
    get gameState() { return game ? { ...game } : null; },
    get gameLog() { return gameLog.slice(); },
    // every frame (audio.update)
    update() {
      if (!audio.ctx || !audio.music) return;
      const t = now(), block = api.blockedBy();
      if (block) {
        if (band || pending) stopBand(1.5, null);
        if (phase !== 'blocked') { phase = 'blocked'; scene = null; suspended = null; }
        lastBlock = block;
        return;
      }
      const sc = sceneNow(t);
      if (sc !== scene) enter(sc, t);
      if (pending) {   // its instruments are loading
        const b = bankNow();
        if (!b || b.settled(pending.need) || t - pending.since > LOAD_WAIT) playBand(pending.id, pending.at, pending.o, b, pending.need);
      }
      if (scene === 'walk') {
        if (phase === 'waiting' && t >= nextAt) startWalk(t);
        else if (phase === 'waiting' && nextAt - t < 12 && api.useSamples) {   // the walking song likely next: its instruments ahead
          const id = pickWalk(place().area, when().slot, history);
          if (prefetched !== id) { prefetched = id; const b = bankNow(); if (b) b.load(instrumentsOf(SONGS[id]), api.loadOpts || {}); }
        }
        else if (phase === 'playing' && !pending && (!band || band.done)) { band = null; track = null; phase = 'waiting'; nextAt = t + rand(...(when().slot === 'late' ? LATE_GAP : GAP)); }
      } else if (band && PLAYLISTS[scene] && band.loops >= LOOPS_EACH && PLAYLISTS[scene].length > 1) {
        stopBand(4, null); startLooped(scene, t + 1.5, scene);   // round again: the other song of the place
      }
      if (band) band.pump(t);
    },
    /** a moment in the game the music answers (fishing: 'catch') */
    cue(name) { return band ? band.cue(name) : false; },
    state() {
      const w = audio.ctx ? when() : null, p = place(), b = band ? band.state() : null;
      return { phase, scene, track, slot: w?.slot, hour: w ? +w.hour.toFixed(2) : null, area: p.area, interior: p.interior, fishing: p.fishing, storm: p.storm, table: p.table, game: game ? game.id : null,
        nextIn: phase === 'waiting' && audio.ctx ? +(nextAt - now()).toFixed(1) : null, blocked: audio.ctx ? api.blockedBy() : 'no-sound',
        history: history.slice(), variant: b?.variant || null, section: b?.section || null, sections: b?.sections || [], loops: b?.loops || 0, gain: b ? b.gain : 0, err: b?.err || null,
        loading: pending ? pending.id : null, sampled: b?.sampled || 0, synth: b?.synth || 0 };
    },
    // tests, the audition page and the curious
    skipGap() { if (phase === 'waiting' && audio.ctx) nextAt = now(); },
    setDate(ms) { dateMs = ms ?? null; },
    setHour(h) { hourOverride = h ?? null; },
    setPlace(o) { placeOverride = o || null; P.at = -1e9; },
    clearHistory() { history.length = 0; },
    forgetFishing() { fishUntil = -1; },
    stop() { stopBand(0.3, null); phase = 'waiting'; suspended = null; if (audio.ctx) nextAt = now() + rand(...GAP); },
  };
  return api;
}
