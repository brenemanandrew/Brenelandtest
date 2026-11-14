// Who can be put in a scene (pose-editor): the town's people with their looks as the game draws them (npc-looks.js, with what
// Andrew saved in the NPC Editor over the built-in looks: main.js loaded those at boot, read only here), the strip mall's four (their
// code-built looks, mall-staff.js), a few players' default bodies, and the dogs (dogs.js, their saved looks applied at boot too).
// The MPFB characters (pose-draw): the mall's four and the DM as the game loads them (baked-character.js, read only: imported, never
// changed), each a SkinnedPosable whose own pose for a preset is sampled from its clips; their meshes take the sculpt as a morph.
import * as THREE from 'three';
import { NPCS, lookOf } from '../../npc-looks.js';
import { loadBakedCharacter, BakedCharacter } from '../../baked-character.js';
import { PEOPLE as MALL } from '../../mall-staff.js';
import { DAX, NALA, MOLLY } from '../../dogs.js';
import { HumanPosable, DogPosable, SkinnedPosable, presetById } from './posable.js';

const GROUPS = { main: 'The main folk', town: 'The town', areas: 'The game tables', mall: 'The strip mall', mpfb: 'The modelled (MPFB)', players: 'Players', dogs: 'The dogs' };
// the players' default bodies (human.js resolveLook fills the rest): a grown-up of each build and a kid
const PLAYERS = {
  'player-a': { name: 'Player (tall)', look: { shirt: '#3f8fd9', pants: '#2e2e36', hair: '#4a3020', hairStyle: 'short', skin: '#e8b98f', body: 'm', height: 0.7, eyeStyle: 'natural' } },
  'player-b': { name: 'Player (short)', look: { shirt: '#f58ab0', pants: '#3f5f8f', hair: '#c9873a', hairStyle: 'pony', skin: '#f6d3b3', body: 'f', shape: 0.9, height: 0.5, eyeStyle: 'natural' } },
  'player-kid': { name: 'Player (kid)', look: { shirt: '#7ddc7a', pants: '#3f3f4a', hair: '#2e2420', hairStyle: 'spiky', skin: '#c98e62', scale: 0.8, height: 0.2, eyeStyle: 'natural' } },
};

// ---- the MPFB characters: their data loaded once (the same cache the game uses)
export const MPFB_IDS = [['belinda', 'Belinda (modelled)'], ['mina', 'Mina (modelled)'], ['zoe_day', 'Zoe (modelled)'], ['zoe_night', 'Zoe, night (modelled)'], ['asha_day', 'Asha (modelled)'], ['asha_night', 'Asha, night (modelled)'], ['dm_both', 'The DM (modelled)']];
const MPFB = {};
export async function preloadMpfb() {
  await Promise.all(MPFB_IDS.map(([id]) => loadBakedCharacter(id).then(d => { if (d) MPFB[id] = d; }).catch(() => {})));
  return Object.keys(MPFB).length;
}
// the editor's presets -> the character's own clips (what it has; else its idle)
const CLIP_OF = { stand: 'idle', sit: 'sit', walk: 'walk', run: 'walk', wave: 'wave', point: 'idle', cross: 'idle', hips: 'sass', cheer: 'dance', think: 'idle', shrug: 'idle', talk: 'idle', crouch: 'sit_low' };
function mpfbBody(id) {
  const d = MPFB[id]; if (!d) return null;
  const ch = new BakedCharacter(d, { name: 'pose-' + d.id });
  ch.mixer.stopAllAction();
  const meshes = ch.meshes, main = ch.main, keys = main.morphTargetDictionary || {};
  const model = {
    root: ch.root, skeleton: ch.skeleton, meshes, baked: ch,
    sample(preset, moment) {
      const P = presetById(preset), want = CLIP_OF[preset] || 'idle', name = d.clips[want] ? want : 'idle', C = d.clips[name];
      if (!C) return;
      const mx = new THREE.AnimationMixer(main), a = mx.clipAction(C.clip);
      a.play();
      const dur = C.clip.duration, t = P.speed ? (moment ?? P.cyc ?? 0.3) * dur : Math.min(dur, moment ?? P.t ?? Math.min(1, dur * 0.4));
      mx.setTime(t);
      ch.inner.position.y = -(d.floor || 0) + (name.startsWith('sit') && C.seat ? 0 : 0);
      mx.stopAllAction(); mx.uncacheRoot(main);
    },
    face(v) { // the mouth's morphs (smile, open, o, set) from the editor's face numbers
      const set = (k, x) => { const i = keys[k]; if (i === undefined) return; for (const m of Object.values(meshes)) if (m.morphTargetInfluences) m.morphTargetInfluences[i] = x; };
      set('smile', v ? Math.max(0, Math.min(1, v.smile ?? 0)) : 0); set('open', v ? Math.max(0, Math.min(1, v.open ?? 0)) : 0);
      set('o', v && (v.open ?? 0) > 0.3 && (v.mw ?? 1) < 0.85 ? 0.8 : 0); set('set', v ? Math.max(0, Math.min(1, -(v.smile ?? 0) * 1.5)) : 0);
    },
  };
  const P = new SkinnedPosable(model, { height: d.J.height || 1.7 });
  const dispose = P.dispose.bind(P);
  P.dispose = () => { dispose(); ch.dispose(); };
  return P;
}

export function rosterList() {
  const out = [];
  for (const [id, e] of Object.entries(NPCS)) if (e.kind === 'human') out.push({ id, name: e.name, group: GROUPS[e.group] || 'The town' });
  for (const [id, e] of Object.entries(MALL)) out.push({ id: 'mall-' + id, name: e.name, group: GROUPS.mall });
  for (const [id, name] of MPFB_IDS) if (MPFB[id]) out.push({ id: 'mpfb-' + id, name, group: GROUPS.mpfb });
  for (const [id, e] of Object.entries(PLAYERS)) out.push({ id, name: e.name, group: GROUPS.players });
  for (const [id, name] of [['dax', 'Dax'], ['nala', 'Nala'], ['molly', 'Molly']]) out.push({ id, name, group: GROUPS.dogs });
  return out;
}

// make one (null for an unknown id)
export function makeBody(id) {
  if (id === 'dax' || id === 'nala' || id === 'molly') return new DogPosable({ dax: DAX, nala: NALA, molly: MOLLY }[id]);
  if (id.startsWith('mpfb-')) return mpfbBody(id.slice(5));
  if (id.startsWith('mall-')) { const e = MALL[id.slice(5)]; return e ? new HumanPosable({ ...e.fallback, scale: e.scale || 1 }) : null; }
  if (PLAYERS[id]) return new HumanPosable(PLAYERS[id].look);
  const e = NPCS[id];
  if (!e || e.kind !== 'human') return null;
  return new HumanPosable(lookOf(id, e.look));
}
export const nameOf = id => (NPCS[id]?.name) || (id.startsWith('mpfb-') ? MPFB_IDS.find(x => x[0] === id.slice(5))?.[1] : null) || (id.startsWith('mall-') ? MALL[id.slice(5)]?.name : null) || PLAYERS[id]?.name || ({ dax: 'Dax', nala: 'Nala', molly: 'Molly' })[id] || id;
