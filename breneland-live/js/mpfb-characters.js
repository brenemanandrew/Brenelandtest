// The MPFB characters in the game (mpfb-in-game, 2026-11-10): Belinda and Mina of Peak Threads, Zoe and Asha of Summit Slice (each in
// her day and night outfit), as baked characters (baked-character.js: their own Blender clips, sampled every frame, never the town's
// procedural motion). The per-character config (which clip a state plays, the seat heights, the held things) is here; the schedule
// (mall-staff-day.js) knows nothing of it. The DM (dm_both: hood down and up as mesh groups, his book) loads here too; dnd.js builds
// and drives him (seated idle, the gesture, reading, a dice roll, the hood up and down).
//
//   loadMpfbCharacters()  fetch the four at boot (main.js), unless PERF.bakedCharacters is off or ?baked=off; mpfbReady() -> any loaded
//   mpfbLoaded(who)       -> the loaded data for 'belinda' | 'mina' | 'zoe' | 'asha' (both outfits for the pizza girls) or null
//   new MpfbStaffBody(who, { outfit }) -> the body mall-staff.js hangs on its NPC: { root, params, h (the active character: say, lookAt,
//     attn), update(dt, now, speed, anim), say(), dispose(), setOutfit('day'|'night'), play(clip), items(set), model: true, baked: true }
//
// Which clip a state plays (every state without its own clip falls back to the nearest authored one, never to procedural motion;
// FELL_BACK lists any that did):
//   walking (speed > 0)       walk (its timeScale from the speed; 'start' when setting off, 'stop' on arriving; with the tray or the bag shown)
//   sit, read                 sit (a 0.45 m seat: the booths, Summit Square) or sit_low (0.30: the mall's bench), by params.seatY
//   greet (Belinda)           wave, then the clip her state asks for
//   sass (Belinda at a rack)  sass, browse or adjust, one per rack (picked from where she stands, the same on every client)
//   sketch, fold, dress       Mina's job loops
//   work                      Zoe's and Asha's counter and oven loop
//   tray (at a table)         set_down once (the tray put down), then idle;  carry (at the door): handover once, then idle
//   rave                      Zoe's and Asha's glow-stick dance loop;  dance, hiphop, ballet: Belinda's party dance loop
//   look, idle, laugh, talk   idle (laugh and talk are the face layer's: an expression, the talk loop)
import { loadBakedCharacter, bakedCharactersOn, BakedCharacter, FADE } from './baked-character.js';
import { CLOTHES } from './strip-mall-plan.js';

export const STAFF_MODELS = { belinda: { day: 'belinda' }, mina: { day: 'mina' }, zoe: { day: 'zoe_day', night: 'zoe_night' }, asha: { day: 'asha_day', night: 'asha_night' }, dm: { day: 'dm_both' } };   // (dm: the Dungeon Master, dnd.js builds him)
// the state's held things -> the mesh groups (export_game.py GROUP_OF): Zoe's bag, Asha's tray, Mina's books
const ITEM_GROUP = { zoe: { R: ['bag'] }, asha: { R: ['tray', 'bag'] }, mina: { R: ['books'], L: ['books'] } };   // (Asha: the tray at night, her delivery bag by day)
// a seated state's clip by the seat's height
const SEATS = [['sit_low', 0.30], ['sit', 0.45]];
// the states and job clips (mall-staff.js CLIP_ANIM, mall-staff-day.js) -> a body clip that exists, else idle
const STATE_CLIP = { sit: 'sit', read: 'sit', greet: 'wave', dance: 'dance', hiphop: 'dance', ballet: 'dance', sass: 'sass', sketch: 'sketch', fold: 'fold', dress: 'dress', work: 'work', tray: 'set_down', carry: 'handover', rave: 'rave', laugh: 'idle', talk: 'idle', look: 'idle', idle: 'idle' };
const ONE_SHOT = new Set(['set_down', 'handover']);   // (played once on arriving at the job, then idle)
const RACK_CLIPS = ['sass', 'browse', 'adjust'];
// (browse and adjust reach into a rack: only where one is in front of her, 1.3 m or less from its middle; at the window or the door: sass)
const atRack = p => CLOTHES.racks.some(r => Math.hypot(p.x - r.x, p.z - r.z) < 1.3);
export const FELL_BACK = new Set();   // (which states played idle for want of their own clip: the report)

const LOADED = {};
let READY = false;
export async function loadMpfbCharacters() {
  if (!bakedCharactersOn()) return false;
  const jobs = [];
  for (const [who, outfits] of Object.entries(STAFF_MODELS)) for (const [k, id] of Object.entries(outfits)) jobs.push(loadBakedCharacter(id).then(d => { if (d) (LOADED[who] = LOADED[who] || {})[k] = d; }));
  await Promise.all(jobs);
  READY = Object.keys(LOADED).length > 0;
  return READY;
}
export const mpfbReady = () => READY;
export const mpfbLoaded = who => (LOADED[who] && LOADED[who].day ? LOADED[who] : null);

export class MpfbStaffBody {
  constructor(who, opts = {}) {
    this.who = who; this.kind = 'human'; this.model = true; this.baked = true;
    const data = LOADED[who];
    this.chars = {};
    for (const [k, d] of Object.entries(data)) {
      const ch = new BakedCharacter(d, { name: 'mall-staff-' + d.id });
      this.chars[k] = ch;
    }
    this.outfit = opts.outfit && this.chars[opts.outfit] ? opts.outfit : 'day';
    this.h = this.chars[this.outfit];
    this.root = this.h.root;   // (the active character's root is the NPC's root: npcs.js moves it; the other outfit's stays off the scene)
    this.params = {};          // (one object for both outfits: the NPC writes seatY into it)
    this.onSwap = opts.onSwap || null;   // (called with the new root when the outfit changes: the name tag and the NPC's body follow)
    this.clip = null; this.clipT = 0; this.cyc = null; this.greetUntil = 0;
    this.moving = false; this.lastYaw = null; this.stopT = 0;
    this.seenOnce = false;
    this.root.userData.mallStaff = this;
  }
  setOutfit(k) {
    if (!this.chars[k] || k === this.outfit) { this.outfit = this.chars[k] ? k : this.outfit; return; }
    const old = this.h, nw = this.chars[k];
    // the new outfit's root takes the old one's place in the scene and its transform
    nw.root.position.copy(old.root.position); nw.root.rotation.copy(old.root.rotation); nw.root.visible = old.root.visible;
    const parent = old.root.parent;
    if (parent) { parent.remove(old.root); parent.add(nw.root); }
    nw.root.userData.npc = old.root.userData.npc; nw.root.userData.mallStaff = this;
    this.outfit = k; this.h = nw; this.root = nw.root;
    nw.play('idle', { fade: 0 });
    const npc = nw.root.userData.npc; if (npc && npc.body) npc.body.root = nw.root;   // (npcs.js reads def.body.root each frame)
    this.items(this._items);
    if (this.onSwap) this.onSwap(nw.root, old.root);
  }
  /** show a held thing on a hand: the state's { L, R } (mall-staff-day.js items) */
  items(set) {
    this._items = set || null;
    const map = ITEM_GROUP[this.who] || {}, groups = {};
    for (const side of ['L', 'R']) if (set?.[side] && map[side]) { const g = map[side].find(g => g in this.h.shown); if (g) groups[g] = true; }
    this.h.items(groups);
  }
  /** the job clip the state wants (mall-staff.js dress): kept; update() plays what exists */
  play(name, t = 0, cyc = null) { this.clip = name || null; this.clipT = t || 0; this.cyc = cyc; }
  say(secs, to) { return this.h.say(secs, to); }
  lookAt(t, s) { return this.h.lookAt(t, s); }
  watch(t, s) { return this.h.watch(t, s); }
  get attn() { return this.h.attn; }
  // the state -> the clip: npcs.js calls this every frame with the speed along the path and the state's anim (null for idle)
  update(dt, now, speed = 0, anim = null) {
    const ch = this.h, moving = speed > 0.05;
    let want;
    if (moving) want = 'walk';
    else if (this.greetUntil > now && ch.has('wave')) want = 'wave';
    else {
      const seatY = this.params.seatY || 0;
      if (anim === 'sit' || anim === 'read' || seatY > 0.1) {
        let best = SEATS[0];
        for (const s of SEATS) if (Math.abs(s[1] - seatY) < Math.abs(best[1] - seatY)) best = s;
        want = ch.has(best[0]) ? best[0] : 'sit';
        ch.inner.position.y = -(ch.data.floor || 0) + (seatY - best[1]);   // (the few cm between the authored seat and this one)
      } else {
        ch.inner.position.y = -(ch.data.floor || 0);
        let job = this.clip && STATE_CLIP[this.clip] ? STATE_CLIP[this.clip] : null;
        if (job === 'sass') { const p = this.root.position; job = atRack(p) ? RACK_CLIPS[Math.abs(Math.round(p.x * 7 + p.z * 13)) % RACK_CLIPS.length] : 'sass'; }   // (one of her rack poses per rack)
        want = (anim && anim !== 'look' && STATE_CLIP[anim]) || job || 'idle';
        if (!ch.has(want)) { FELL_BACK.add(want); want = 'idle'; }
        if (ONE_SHOT.has(want)) {
          // once per arrival: after it has played (or while it plays) she stands
          if (this.shotFor === want) want = ch.current === this.shotFor ? ch.current : 'idle';
          else { this.shotFor = want; ch.play(want, { then: 'idle' }); return ch.update(dt, now, speed); }
        }
        if (anim === 'laugh' && ch.has('idle') && !ch.face.clip) ch.expression(ch.J.exprs[2], 1.6);
      }
    }
    if (moving) this.shotFor = null;
    // setting off and arriving: the authored ramps, then the loop
    if (want === 'walk' && !this.moving) { this.moving = true; if (ch.has('start')) ch.play('start', { fade: FADE.start, then: 'walk' }); else ch.play('walk'); }
    else if (want === 'walk') { if (ch.current !== 'walk' && ch.current !== 'start') ch.play('walk'); }
    else if (this.moving) { this.moving = false; if (ch.has('stop') && want === 'idle') ch.play('stop', { fade: FADE.start, then: 'idle' }); else ch.play(want); }
    else if (ch.current !== want && !(ch.current === 'stop' && want === 'idle') && !(ch.current === 'wave' && want === 'idle' && ch.after)) ch.play(want);
    ch.update(dt, now, speed);
  }
  dispose() { for (const ch of Object.values(this.chars)) ch.dispose(); }
}
