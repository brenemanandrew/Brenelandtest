// D&D night in the game store's back room. The room is built with the store (game-store-backroom.js). This runs the table:
// E at a chair joins (lib/dnd.js seats you), you pick a character, and the overlay opens with your card, the dice tray, the
// party, the narration and a line to talk, typed or by voice. The DM's lines are read aloud with speechSynthesis.
// Claude sits in the DM's chair as the Dungeon Master, and town folk fill empty chairs. When Andrew's account takes the DM's
// chair he's the DM, with a panel of tools and Claude as a private assistant.
import * as THREE from 'three';
import { el, loadCss } from './util.js';
import { battleMat, MDOT } from './dnd-art.js';
import { makeDie, dieMaterial, setDieColor, dieGlow, restingQuat, throwPath, shownBy } from './dnd-dice.js';
import { autoScroll } from './dnd-scroll.js';
import { Human } from './human.js';
import { NPCS, lookOf, tagOf } from './npc-looks.js';
import { BACK_ROOM } from './voice-space.js';
import { DM_CHAIR } from './game-store-backroom.js';
import { createRoomLight, gameOn } from './dnd-lighting.js';
import { mpfbLoaded } from './mpfb-characters.js';            // (mpfb-in-game) the DM as a baked character playing his own clips
import { BakedCharacter } from './baked-character.js';
import { createTableGaze } from './dnd-gaze.js';
import { lookInfo } from './gaze.js';
import { ICON, SEAL, ico } from './dnd-icons.js';
import { formOf, layoutFor, applyLayout, loadSaved, faceFraction } from './dnd-layout.js';
import { createDmVoicePlayer } from './dnd-dm-voice.js';

const CHECKS = ['perception', 'investigation', 'insight', 'stealth', 'athletics', 'acrobatics', 'arcana', 'history', 'nature', 'religion', 'medicine', 'survival', 'persuasion', 'deception', 'intimidation', 'performance', 'sleight of hand', 'animal handling',
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma', 'strength save', 'dexterity save', 'constitution save', 'intelligence save', 'wisdom save', 'charisma save', 'attack', 'initiative'];
const SKILL_ABIL = { acrobatics: 'dex', 'animal handling': 'wis', arcana: 'int', athletics: 'str', deception: 'cha', history: 'int', insight: 'wis', intimidation: 'cha', investigation: 'int', medicine: 'wis', nature: 'int', perception: 'wis', performance: 'cha', persuasion: 'cha', religion: 'int', 'sleight of hand': 'dex', stealth: 'dex', survival: 'wis' };
const DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
const sign = n => (n >= 0 ? '+' + n : String(n));
const mod = v => Math.floor((v - 10) / 2);
const cap = s => String(s || '').replace(/\b\w/g, c => c.toUpperCase());
// each class's ink on the parchment (a player's lines in the log, their chip, their name on the sheet): dark enough to read
const CLASS_INK = { fighter: '#a3281f', rogue: '#25633f', wizard: '#2d5c96', cleric: '#8a5f0c', ranger: '#6b4128', bard: '#7d2244' };
const inkOf = c => CLASS_INK[c?.cls] || c?.color || '#4a3a6a';
// (dnd-said) who is talking: every spoken line reads "Name manner" over its words in quotation marks. The server sends the
// manner (lib/dnd-dm.js mannerOf); an older line without one gets it from its punctuation here the same way
const MANNERS = ['says', 'replies', 'asks', 'exclaims', 'whispers', 'shouts', 'mutters', 'growls', 'laughs'];
const QUOTES = '"\'' + String.fromCharCode(8220, 8221, 8216, 8217), LQ = String.fromCharCode(8220), RQ = String.fromCharCode(8221);
const trimQ = t => { let s = String(t || '').trim(); while (s && QUOTES.includes(s[0])) s = s.slice(1); while (s && QUOTES.includes(s[s.length - 1])) s = s.slice(0, -1); return s.trim(); };
const mannerOf = e => { const m = String(e.manner || '').toLowerCase(); if (MANNERS.includes(m)) return m; const end = trimQ(e.text).replace(/[\s)\]]+$/, '').slice(-1); return end === '?' ? 'asks' : end === '!' ? 'exclaims' : 'says'; };
const quoted = t => LQ + trimQ(t) + RQ;
// the tag over a line: an NPC's ("Old Croak whispers"), a player's ("Mira says", to the DM "Mira asks the DM")
const tagOfLine = e => { const m = mannerOf(e); if (e.k === 'dm') return `${e.speaker} ${m}`; return `${e.name} ${e.dm ? (m === 'asks' ? 'asks the DM' : m + ' to the DM') : m}`; };
const VOICE_KEY = 'breneland.dndVoice', VOICE_NAME_KEY = 'breneland.dndVoiceName', LISTEN_KEY = 'breneland.dndListen', VOICE_WHO_KEY = 'breneland.dndVoiceWho';
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };
const word = t => el('span', 'dnd-word', t);

export function createDnd(ctx) {
  const { net, ui, player, audio, camera } = ctx;
  const store = ctx.features?.find(f => f.name === 'store');
  if (!store || !store.back) return null;
  loadCss('/css/dnd.css');
  const B = store.back, BP = B.plan, LY = store.plan.LY, room = BP.room;
  const seatObjs = B.seats; // the store's seat objects for the back room (dnd: 0..6)
  BACK_ROOM.door = () => (store.backDoor || 0) > 0.3; // (voice chat: the half-glass door open lets a little more through, voice-space.js)
  const inside = B.door.parent; // the store's inside group (hidden out on the street)
  const roomLight = createRoomLight({ inside, plan: BP, leaf: B.leaf, leaves: [store.outDoor?.leaf], scene: ctx.scene, camera, ink: () => ctx.ink }); // the room dims round the lit table while a game runs
  const S = { s: null, log: [], premades: [], classes: [], races: {}, modules: [], you: { host: false, char: null, chars: [] }, seat: -1, hello: false, spoken: [], utterances: [], open: false, view: 'table', replies: [] };

  // ---------------------------------------------------------------- 3D: the map on the table, the DM's card, the dice
  const matTex = battleMat();
  const mapMat = roomLight.add(new THREE.MeshBasicMaterial({ map: matTex, fog: true })); // (in the lamp's light, like the rest of the room)
  const mapMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mapMat);
  mapMesh.rotation.x = -Math.PI / 2; mapMesh.position.set(BP.mat.x, BP.mat.y, BP.mat.z); mapMesh.scale.set(BP.mat.w, BP.mat.d, 1); mapMesh.name = 'dnd-map';
  inside.add(mapMesh);
  const loader = new THREE.TextureLoader();
  let mapShown = null;
  function showMap(url) {
    if (url === mapShown) return; mapShown = url;
    if (!url) { mapMat.map = matTex; mapMat.needsUpdate = true; mapMesh.rotation.z = 0; mapMesh.scale.set(BP.mat.w, BP.mat.d, 1); return; }
    loader.load(url, t => {
      if (mapShown !== url) { t.dispose(); return; }
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      const a = t.image.width / t.image.height, portrait = a < 1, A = portrait ? 1 / a : a; // (a portrait map lies along the table)
      let w = BP.mat.w, d = w / A; if (d > BP.mat.d) { d = BP.mat.d; w = d * A; }
      if (mapMat.map && mapMat.map !== matTex) mapMat.map.dispose();
      mapMat.map = t; mapMat.needsUpdate = true;
      mapMesh.rotation.z = portrait ? Math.PI / 2 : 0;
      mapMesh.scale.set(portrait ? d : w, portrait ? w : d, 1);
    });
  }
  // the DM's tent card in front of the screen: who runs the table ("The DM is away tonight" without a key)
  const tentC = document.createElement('canvas'); tentC.width = 512; tentC.height = 192;
  const tentT = new THREE.CanvasTexture(tentC); tentT.colorSpace = THREE.SRGBColorSpace;
  const tent = new THREE.Group(); tent.name = 'dnd-dm-card';
  for (const k of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.13), roomLight.add(new THREE.MeshBasicMaterial({ map: tentT, fog: true }))); m.rotation.order = 'YXZ'; m.rotation.y = k < 0 ? -Math.PI / 2 : Math.PI / 2; m.rotation.x = -0.36; m.position.set(k * 0.024, 0.062, 0); tent.add(m); } // (an A of card: one face to the players, one to the DM)
  tent.position.set(BP.screen.x - 0.13, BP.felt.y, BP.screen.z); inside.add(tent);
  let tentText = '';
  function drawTent(line1, line2, col) {
    const key = line1 + '|' + line2; if (key === tentText) return; tentText = key;
    const g = tentC.getContext('2d');
    g.fillStyle = '#f3e3c3'; g.fillRect(0, 0, 512, 192); g.strokeStyle = col; g.lineWidth = 12; g.strokeRect(10, 10, 492, 172);
    g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 50px Georgia, "Times New Roman", serif'; g.fillText(line1, 256, 74, 470);
    g.font = '500 32px Georgia, "Times New Roman", serif'; g.fillStyle = '#3a3226'; g.fillText(line2, 256, 138, 470);
    tentT.needsUpdate = true;
  }
  drawTent('The DM is away', 'tonight', '#7a2140');
  // the bubble anchor: over the DM's chair, at a seated head's height
  const dmSeat = seatObjs.find(s => s.dm);
  const dmAnchor = new THREE.Object3D(); dmAnchor.position.set(dmSeat.x, dmSeat.y + 0.7, dmSeat.z); inside.add(dmAnchor);
  // the DM's face: the Dungeon Master's head when he sits there, else where a seated head would be in his chair
  const _fv = new THREE.Vector3();
  function dmFace(v) {
    if (dmAv && dmAv.h.root.visible && dmAv.h.head) { dmAv.h.head.updateWorldMatrix(true, false); dmAv.h.head.getWorldPosition(v); }
    else v.set(dmSeat.x, dmSeat.y + dmSeat.seatY + 0.8, dmSeat.z);
    return v;
  }
  // where the DM's face should sit in the view, as a fraction from its top: upright the view is the part above the panel with
  // the party strip across its top; sideways the whole screen with the boxes along its bottom and the dice area over them
  const faceAt = () => faceFraction(FORM, DL);
  // your first look from a seat: turned to the DM (as far as the seat's head turn allows) with his face in the clear part
  function lookAtDm(seat) {
    const f = dmFace(_fv), ex = seat.x + Math.sin(seat.yaw) * 0.14, ez = seat.z + Math.cos(seat.yaw) * 0.14, ey = seat.y + seat.seatY + 1.0; // (your eyes: a seated head, game-store.js eyeOf)
    let d = Math.atan2(f.x - ex, f.z - ez) - seat.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); // (the turn from the seat's own way, wrapped)
    const down = Math.atan2(ey - f.y, Math.hypot(f.x - ex, f.z - ez)); // (the line to his face: positive = below your eyes)
    const up = Math.atan((1 - 2 * faceAt()) * Math.tan((camera.fov || 55) * Math.PI / 360)); // (from the middle of the view up to where his face goes)
    return { yaw: seat.yaw + d, pitch: Math.max(-0.75, Math.min(0.95, down + up)) }; // (pitch > 0 looks down: past his face, so it sits high in the view)
  }
  // The three-quarter shot from a chair (game-store.js sit: the room view's toggle while you're seated): up behind the chair and off
  // to the side away from the DM, over your far shoulder, 1.6 m up and 1.4 m back, turned between him and the table so he sits
  // near the middle with you, the table and the dice in the picture, his face where faceAt puts it (clear of the boxes). Upright
  // (the view is the squarish part above the panel) a little higher and turned more on him, and turned off you if need be so your
  // head is at the picture's edge (a shoulder, the back of your head), never over its middle. The DM's own chair looks down the
  // table at the players.
  function threeQuarter(seat) {
    const T = BP.table, portrait = root.classList.contains('portrait');
    const aim = seat.dm ? _fv.set(T.x - T.w / 2 + 0.4, T.top + 0.5, T.z) : dmFace(_fv);
    const fx = Math.sin(seat.yaw), fz = Math.cos(seat.yaw), rx = Math.cos(seat.yaw), rz = -Math.sin(seat.yaw);
    const k = (aim.x - seat.x) * rx + (aim.z - seat.z) * rz > 0 ? -1 : 1; // the side away from him
    const pad = 0.3, back = portrait ? 1.5 : 1.4, side = portrait ? 0.8 : 0.75;
    const x = Math.max(room.minX + pad, Math.min(room.maxX - pad, seat.x - fx * back + rx * k * side)), z = Math.max(room.minZ + pad, Math.min(room.maxZ - pad, seat.z - fz * back + rz * k * side));
    const y = Math.min(room.ceil - 0.2, seat.y + (portrait ? 1.8 : 1.6));
    if (seat.dm) return { x, y, z, lx: aim.x * 0.6 + T.x * 0.4, ly: (aim.y + T.top) / 2, lz: aim.z * 0.6 + T.z * 0.4 };
    const w = portrait ? 0.8 : 0.6, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    let yaw = Math.atan2(aim.x * w + T.x * (1 - w) - x, aim.z * w + T.z * (1 - w) - z);
    const vf = (camera.fov || 55) * Math.PI / 360, hh = Math.atan(Math.tan(vf) * (camera.aspect || 1)); // (half the picture's height and width, as angles)
    if (portrait) {
      const hx = seat.x + fx * 0.1, hz = seat.z + fz * 0.1, dHead = Math.hypot(hx - x, hz - z), off = wrap(Math.atan2(hx - x, hz - z) - yaw);
      const edge = Math.atan(0.5 * Math.tan(hh)) + Math.atan(0.45 / Math.max(0.3, dHead)); // (the head's inner side half way out from the middle)
      if (Math.abs(off) < edge) { const turned = yaw + off - Math.sign(off || 1) * edge; if (Math.abs(wrap(Math.atan2(aim.x - x, aim.z - z) - turned)) < hh - 0.12) yaw = turned; }
    }
    const d = Math.hypot(aim.x - x, aim.z - z), up = Math.atan((1 - 2 * faceAt()) * Math.tan(vf));
    const el = Math.atan2(aim.y - y, d) - up, ce = Math.cos(el) * 3;
    return { x, y, z, lx: x + Math.sin(yaw) * ce, ly: y + Math.sin(el) * 3, lz: z + Math.cos(yaw) * ce };
  }
  // dice thrown with the power and aim that came with the roll: every client computes the same path (dnd-dice.js throwPath)
  // and the die rests showing the server's number. A few meshes, reused.
  // a gem set, one colour a chair (the DM's last): ruby, emerald, sapphire, topaz, amber, pearl, amethyst
  const DIE_COL = ['#a30d3c', '#0b7a4a', '#1a4fb4', '#e3b60e', '#d0700c', '#efe7d4', '#5f33b0'];
  const DIE_R = 0.017; // m: a chunky d20, about 2.7 cm across its faces
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dice = [];
  const dieMesh = () => { const m = new THREE.Mesh(makeDie(20).geo, roomLight.add(dieMaterial(DIE_COL[0]))); m.visible = false; m.castShadow = false; m.name = 'dnd-die'; inside.add(m); return { m, t: 9, die: null, value: 0, path: null, qF: new THREE.Quaternion(), axis: new THREE.Vector3(1, 0, 0), spin: 0, said: true, settled: true, text: '', dur: 1, seat: -1, id: 0, s: 1, lit: 0, at: 0 }; };
  for (let i = 0; i < 6; i++) dice.push(dieMesh());
  let throws = 0;
  const _qs = new THREE.Quaternion();
  function throwDie(e) {
    const d = dice.reduce((a, b) => (b.at < a.at ? b : a)); // (the die thrown longest ago: a die's clock stops once it's put away, so it can't say)
    const sides = (e.dice && e.dice[0] && e.dice[0][0]) || 20, die = makeDie(sides);
    const value = e.keep ?? (e.dice && e.dice[0] ? e.dice[0][1] : e.total);
    d.die = die; d.value = value; d.seat = e.seat ?? 6; d.id = e.id || 0;
    d.m.geometry = die.geo; setDieColor(d.m.material, e.ok === false ? '#b9b2a6' : DIE_COL[d.seat % DIE_COL.length]); dieGlow(d.m.material, 0);
    d.s = DIE_R / die.r; d.m.scale.setScalar(d.s);
    const thr = e.throw || { p: 0.15, a: 0, s: e.id || 0 };
    d.path = throwPath(BP, d.seat, thr, DIE_R, die.rest * d.s); d.dur = reduced ? 0.5 : d.path.dur;
    restingQuat(die, value, d.path.yaw, d.qF);
    const sd = thr.s || 0; d.axis.set(Math.sin(sd), 0.6, Math.cos(sd * 1.7)).normalize(); d.spin = reduced ? Math.PI * 0.5 : (5 + 7 * (thr.p || 0)) * Math.PI;
    d.power = thr.p || 0; d.t = 0; d.at = ++throws; d.lit = 0; d.said = false; d.settled = false; d.text = String(e.total) + (e.nat === 20 ? '!' : ''); d.m.visible = true;
    place(d, 0);
  }
  // where a die is k (0..1) of the way through its throw: down from the hand, bouncing lower each time, off the rail if it hit it
  function place(d, k) {
    const P = d.path, [fx, fy, fz] = P.from, [tx, ty, tz] = P.to, e = 1 - (1 - k) * (1 - k), pos = d.m.position;
    if (reduced) pos.set(fx + (tx - fx) * e, ty + Math.min(0.06, fy - ty) * (1 - e), fz + (tz - fz) * e); // (a short, gentle slide)
    else {
      if (P.hit) {
        const [hx, hz] = P.hit, d1 = Math.hypot(hx - fx, hz - fz), d2 = Math.hypot(tx - hx, tz - hz), split = d1 / (d1 + d2 || 1);
        if (e < split) { const q = e / split; pos.x = fx + (hx - fx) * q; pos.z = fz + (hz - fz) * q; } else { const q = (e - split) / (1 - split || 1); pos.x = hx + (tx - hx) * q; pos.z = hz + (tz - hz) * q; }
      } else { pos.x = fx + (tx - fx) * e; pos.z = fz + (tz - fz) * e; }
      pos.y = ty + Math.abs(Math.cos(k * Math.PI * 2.5)) * (fy - ty) * (1 - k) * (1 - k);
    }
    _qs.setFromAxisAngle(d.axis, d.spin * (1 - k) * (1 - k)); d.m.quaternion.copy(d.qF).multiply(_qs);
  }
  function stepDice(dt) {
    for (const d of dice) {
      if (d.t > 6) { if (d.m.visible) d.m.visible = false; continue; }
      d.t += dt;
      const k = Math.min(1, d.t / d.dur);
      if (!d.settled) { place(d, k); d.settled = k >= 1; }
      if (k >= 1 && !d.said) { d.said = true; if (inside.visible) { ui.say(d.m, d.text, 4, 0.045 / d.s - 0.35, 'dnd-dice-tag'); audio.backroom?.playDice?.(d.power, d.path?.inTray ? 'tray' : 'felt'); } } // (the clatter: dnd-sound.js; the tag 4.5 cm over the die)
      if (k >= 1) landed(d, d.t - d.dur);
    }
  }
  // once it lands: a little pop (it swells and settles back, its foot on the felt) and a warm glow on the face that came up,
  // fading over two seconds (a d4 glows all over: its number is on three faces). With reduced motion only the glow.
  function landed(d, u) {
    const lit = u < 2 ? (1 - u / 2) * (1 - u / 2) * Math.min(1, u * 8) : 0;
    if (lit !== d.lit) { d.lit = lit; dieGlow(d.m.material, lit, d.die.sides === 4 ? 0 : d.value); }
    if (reduced || u > 0.4) { if (d.m.scale.x !== d.s) { d.m.scale.setScalar(d.s); d.m.position.y = d.path.to[1]; } return; }
    const k = 1 + 0.22 * Math.sin(Math.PI * u / 0.4) * (1 - u / 0.4 * 0.5);
    d.m.scale.setScalar(d.s * k); d.m.position.y = d.path.ground + (d.path.to[1] - d.path.ground) * k;
  }

  // ---------------------------------------------------------------- speech (the DM's lines read aloud)
  // The whole passage is queued at once in as few utterances as possible (split at sentence ends under ~200 characters, since
  // Chrome stalls on long ones), so there are no odd pauses. Ellipses, dashes, brackets and asterisks become commas. The voice
  // is the device's best (natural or neural first), or the one picked in the overlay.
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  let voiceOn = lsGet(VOICE_KEY) !== 'off';
  let voicePick = lsGet(VOICE_NAME_KEY) || '';
  let voiceWho = lsGet(VOICE_WHO_KEY) === 'browser' ? 'browser' : 'andrew'; // (dm-voice) whose voice reads the DM: Andrew's (the server's clips) or this browser's
  let voice = null;
  const NOVELTY = /(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Zarvox|Trinoids|Whisper|Jester|Organ|Superstar|Good News|Junior|Princess|Ralph|Fred|Grandma|Grandpa|Rocko|Shelley|Flo|Eddy|Reed|Sandy)/i;
  const voiceScore = v => {
    const n = v.name || '', u = v.voiceURI || ''; let sc = 0;
    if (/natural|neural|online|premium|enhanced|wavenet|studio/i.test(n)) sc += 8;
    if (/Google UK English Male/i.test(n)) sc += 5;
    if (/network/i.test(u)) sc += 3;   // (Android's higher-quality voices)
    if (/(Guy|Ryan|Thomas|Christopher|Eric|Davis|Brian|Daniel|George|Arthur|Oliver|Andrew|Roger|Steffan|William|Liam|Male)/i.test(n)) sc += 3;
    if (/en[-_]GB/i.test(v.lang)) sc += 2; else if (/en[-_](US|AU|IE|CA)/i.test(v.lang)) sc += 1;
    if (NOVELTY.test(n)) sc -= 9;
    if (/compact|eloquence/i.test(n + u)) sc -= 3;
    return sc;
  };
  const enVoices = () => (synth?.getVoices ? synth.getVoices().filter(v => /^en/i.test(v.lang)) : []);
  const pickVoice = () => {
    const vs = enVoices();
    if (voicePick) { const m = vs.find(v => v.name === voicePick); if (m) return m; }
    let best = null, bs = -1e9; for (const v of vs) { const sc = voiceScore(v); if (sc > bs) { bs = sc; best = v; } }
    return best;
  };
  if (synth && 'onvoiceschanged' in synth) synth.addEventListener?.('voiceschanged', () => { voice = pickVoice(); fillVoices(); });
  // how well you hear the DM: fully in the room, quieter in the shop (louder with the door open), not at all outside.
  // The browser's voice can't be filtered, only turned down.
  const hearLevel = () => { const q = player.pos; if (S.seat >= 0 || inRoom(q.x, q.y, q.z)) return 1; if (store.inside?.()) return (store.backDoor || 0) > 0.3 ? 0.5 : 0.3; return 0; };
  const DASH = new RegExp('\\s*[' + String.fromCharCode(8212, 8211) + ']\\s*|\\s+-\\s+', 'g'), ELLIPSIS = new RegExp('\\.{3,}|' + String.fromCharCode(8230), 'g');
  const smooth = t => String(t).replace(ELLIPSIS, ',').replace(DASH, ', ').replace(/[*_#~`]+/g, '').replace(/\s*[()[\]]\s*/g, ', ').replace(/\s*,\s*(,\s*)+/g, ', ').replace(/\s*,\s*([.!?;:])/g, '$1').replace(/\s+/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '').trim();
  function partsOf(text, max = 200) {
    const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text], out = [];
    let cur = '';
    const push = x => { x = x.trim(); if (x) out.push(x); };
    for (let snt of sentences) {
      while (snt.length > max) { // (a very long sentence: at a comma, else a space)
        let cut = snt.lastIndexOf(', ', max); if (cut < max * 0.4) cut = snt.lastIndexOf(' ', max); if (cut < 1) cut = max;
        push(cur); cur = ''; push(snt.slice(0, cut + 1)); snt = snt.slice(cut + 1);
      }
      if ((cur + snt).length > max) { push(cur); cur = ''; }
      cur += snt;
    }
    push(cur);
    return out;
  }
  const speech = { left: 0, until: 0, t0: 0, on: false, lines: new Map() }; // lines: text -> { at (characters read), len, t0, est }
  const quiet = () => { if (speech.on) { speech.on = false; audio.backroom?.onEvent?.('speak', { on: false }); } };
  const secs = () => performance.now() / 1000;
  // (dnd-said) a character's own pitch: a little above the DM's, a touch different for each name, so two voices are two people
  const pitchOf = (speaker, natural) => { if (!speaker) return natural ? 1 : 0.9; let h = 0; for (const ch of String(speaker).toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return (natural ? 1.06 : 1.1) + ((h % 1000) / 1000 - 0.5) * 0.16; };
  const duckOn = () => { if (!speech.on) { speech.on = true; audio.backroom?.onEvent?.('speak', { on: true, secs: Math.max(5, speech.until - secs()) }); } }; // (the music ducks under the real voice)
  // speak(text, speaker, tag, line): a DM line (line = its log id) in Andrew's voice when that is picked (dnd-dm-voice.js: the
  // server's clips, the browser's voice whenever they don't come), else in the browser's
  function speak(text, speaker, tag = '', line = null) {
    if (!voiceOn || audio.muted || hearLevel() <= 0) return false;
    if (line != null && voiceWho === 'andrew' && dmv.expect(line, text, speaker, tag)) { S.spoken.push(text); if (S.spoken.length > 20) S.spoken.shift(); return true; }
    return speakBrowser(text, speaker, tag);
  }
  // speakBrowser(text, speaker, tag, key): with a tag the DM's own voice says it first ("Old Croak whispers:", its own utterance,
  // so a short pause follows), then the words in the speaker's pitch. key: the line the bubble follows (the whole line's text
  // when this reads only the rest of it)
  function speakBrowser(text, speaker, tag = '', key = text) {
    const lvl = hearLevel();
    if (!voiceOn || !synth || audio.muted || lvl <= 0) return false;
    const vol = Math.max(0, Math.min(1, (audio.volume ?? 1) * (audio.levels?.master ?? 1) * (audio.levels?.voices ?? 1))) * lvl;
    if (vol <= 0.01) return false;
    try {
      voice = voice || pickVoice();
      const natural = !!voice && voiceScore(voice) >= 8, parts = partsOf(smooth(text));
      if (!parts.length) return false;
      const duck = duckOn;
      const said = tag ? smooth(tag) + ':' : '', tagEst = said ? said.length / 14.5 / 0.97 + 0.35 : 0;
      if (said) {
        const u = new SpeechSynthesisUtterance(said);
        if (voice) { u.voice = voice; u.lang = voice.lang; }
        u.rate = 0.97; u.pitch = pitchOf('', natural); u.volume = vol; u.onstart = duck;
        u.onend = u.onerror = () => { speech.left = Math.max(0, speech.left - 1); if (!speech.left) quiet(); };
        synth.speak(u); speech.left++;
        S.utterances.push(said);
      }
      const t = secs(), line = { at: 0, len: parts.reduce((a, q) => a + q.length + 1, 0), t0: Math.max(t, speech.until) + tagEst, est: 0, parts: parts.length, ended: 0 };
      let off = 0;
      for (const part of parts) {
        const u = new SpeechSynthesisUtterance(part), o = off;
        if (voice) { u.voice = voice; u.lang = voice.lang; }
        u.rate = 0.97; u.pitch = pitchOf(speaker, natural); u.volume = vol;
        u.onstart = () => { line.at = Math.max(line.at, o); duck(); };
        u.onboundary = ev => { line.at = Math.max(line.at, o + (ev.charIndex || 0)); };
        const done = () => { speech.left = Math.max(0, speech.left - 1); line.at = Math.max(line.at, o + part.length); line.ended++; if (!speech.left) quiet(); };
        u.onend = done; u.onerror = done;
        synth.speak(u); speech.left++;
        off += part.length + 1;
      }
      line.est = line.len / 14.5 / 0.97; speech.until = line.t0 + line.est; speech.t0 = line.t0;
      speech.lines.set(key, line); if (speech.lines.size > 8) speech.lines.delete(speech.lines.keys().next().value);
      if (key === text) { S.spoken.push(text); if (S.spoken.length > 20) S.spoken.shift(); }
      S.utterances.push(...parts); if (S.utterances.length > 40) S.utterances.splice(0, S.utterances.length - 40);
      return true;
    } catch { return false; }
  }
  // the DM's voice is playing now (its own events, or by the clock when the engine sends none)
  // (a phone's voice can get stuck "speaking" with no end event: well past the line's expected end it is let go, so the mic
  // is not kept waiting on it for ever)
  const dmSpeaking = () => {
    if (speech.left > 0 && speech.until && secs() > speech.until + 8 + 0.6 * (speech.until - speech.t0)) { try { synth?.cancel?.(); } catch { /* fine */ } speech.left = 0; speech.until = 0; quiet(); return false; }
    return !!(synth && synth.speaking && speech.left > 0) || (speech.left > 0 && secs() < speech.until + 0.4);
  };
  const dmv = createDmVoicePlayer({ audio, net, speech, secs, level: hearLevel, duck: duckOn, quiet, browser: speakBrowser });
  // how far the speech is through a line (0..1), null when it is not being read
  function speechAt(text) {
    { const a = text ? dmv.at(text) : undefined; if (a !== undefined) return a; } // (Andrew's voice: its real playback)
    const L = text && speech.lines.get(text); if (!L || L.ended >= L.parts) return null; // (not spoken, or finished)
    const t = secs();
    if (L.at > 0) return Math.min(1, L.at / L.len);
    if (t < L.t0) return 0;
    return t > L.t0 + L.est + 1.5 ? null : Math.min(1, (t - L.t0) / L.est);
  }

  // ---------------------------------------------------------------- the overlay
  // Andrew's doodle (docs/refs/ui-revamp/doodle-dnd.jpg). Upright (a phone in portrait) the 3D view fits the top of the screen
  // (fitView) with the party strip across it, and a solid panel under it: the log, the dice area, your character, the chat bar
  // with the wax seal that opens the tools wheel. Sideways (a PC, a tablet, a phone on its side) the view fills the screen: the
  // party strip on top, the dice area in the middle, the log bottom left, your character bottom right, the chat bar along the
  // bottom with the tools as a toolbar at its right end. Parchment and tooled leather (dnd.css).
  const root = el('div', 'dnd', '', { hidden: '', role: 'dialog', 'aria-label': 'D&D night' });
  const top = el('div', 'dnd-top'), party = el('div', 'dnd-party'), dmChip = el('div', 'dnd-dmchip');
  top.append(dmChip, party);
  // every button is a glyph (the HUD's style) with its word beside or under it where there's room; each has a title for the PC
  // and an aria-label
  const btn = (cls, icon, text, attrs = {}) => { const b = el('button', 'dnd-btn ' + cls, '', { type: 'button', title: text, 'aria-label': text, ...attrs }); b.append(ico(icon), word(text)); return b; };
  // the tools: round brass buttons, a toolbar sideways and the wheel upright
  const tools = el('div', 'dnd-topbtns dnd-tools', '', { role: 'toolbar', 'aria-label': 'Table tools' });
  const mkTool = (cls, icon, text, attrs) => btn('dnd-tool ' + cls, icon, text, attrs);
  const bAdv = mkTool('', 'book', 'Adventure'), bBegin = mkTool('gold', 'star', 'Begin', { hidden: '' }), bMap = mkTool('', 'map', 'Map', { hidden: '' });
  const bSheet = mkTool('sheet-btn', 'scroll', 'Character sheet', { 'aria-pressed': 'false' }), bEnd = mkTool('', 'moon', 'End the night');
  const endWord = bEnd.lastChild;
  // the mic's three ways (today's Auto mic, and always on): listen on your turn, off, or always; the button is the old
  // listening light (its colour shows listening, waiting, off)
  const light = el('button', 'dnd-btn dnd-tool dnd-listen', '', { type: 'button', hidden: '', 'aria-pressed': 'false', title: 'The mic: listens on your turn' });
  const lightIco = ico('micDot'), lightTxt = el('span', 'dnd-word', 'Mic');
  light.append(lightIco, lightTxt);
  const bSet = mkTool('dnd-settings-btn', 'cog', 'Game settings', { 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
  tools.append(bAdv, bBegin, bMap, bSheet, light, bEnd, bSet);
  // the wax seal at the chat bar's far right (upright only) opens the wheel
  const seal = el('button', 'dnd-seal', '', { type: 'button', 'aria-label': 'Tools', title: 'Tools', 'aria-haspopup': 'true', 'aria-expanded': 'false' });
  seal.innerHTML = SEAL;
  const toolsOpen = on => { root.classList.toggle('tools-open', on); seal.setAttribute('aria-expanded', on ? 'true' : 'false'); if (on) layWheel(); };
  seal.onclick = () => toolsOpen(!root.classList.contains('tools-open'));
  tools.addEventListener('click', e => { const b = e.target.closest('button'); if (b && b !== light && !(b === bEnd && endAsked)) toolsOpen(false); }); // (the mic's ways and End's second tap keep it open)
  // the wheel: the shown tools on a quarter circle or two up and to the left of the seal, nearest first
  function layWheel() {
    const W = DL.wheel || { r: 196, a0: 152, a1: 97 }; // (the layout's: Andrew sizes it in the HUD Editor)
    const shown = [...tools.children].filter(b => !b.hidden), n = shown.length, inner = n > 4 ? Math.floor(n / 2) : n;
    shown.forEach((b, i) => {
      const ring = i < inner ? 0 : 1, k = ring ? i - inner : i, m = ring ? n - inner : inner;
      const r = ring || n <= 4 ? W.r * (n <= 4 && !ring ? 0.72 : 1) : W.r * 0.57, a = (m === 1 ? (W.a0 + W.a1) / 2 : W.a0 + k * ((W.a1 - W.a0) / (m - 1))) * Math.PI / 180;
      b.style.setProperty('--wx', Math.round(Math.cos(a) * r) + 'px'); b.style.setProperty('--wy', Math.round(-Math.sin(a) * r) + 'px');
      b.style.setProperty('--wd', (i * 0.025).toFixed(3) + 's');
    });
  }
  // Game settings: a small card (the DM's voice and its picker, the three-quarter view, town folk for empty chairs, Stand up)
  const setCard = el('div', 'dnd-settings', '', { role: 'dialog', 'aria-label': 'Game settings', hidden: '' });
  const setX = el('button', 'dnd-x', '', { type: 'button', 'aria-label': 'Close the settings', title: 'Close' }); setX.append(ico('x'));
  const bVoice = el('button', 'dnd-btn dnd-voice-btn', '', { type: 'button', 'aria-pressed': 'true' });
  const voiceIco = ico('speaker'), voiceWord = word(''); bVoice.append(voiceIco, voiceWord);
  // (dm-voice) whose voice: Andrew's (made on the server) or this browser's own; remembered on this device
  const bWho = el('button', 'dnd-btn dnd-voice-who', '', { type: 'button' }), whoWord = word(''); bWho.append(ico('speaker'), whoWord);
  const vSel = el('select', 'dnd-sel dnd-voice-sel', '', { 'aria-label': 'The DM\'s voice', title: 'The DM\'s voice (this device)' });
  const bView = el('button', 'dnd-btn dnd-view-btn', '', { type: 'button', 'aria-pressed': 'false', 'data-key': 'F', title: 'First person or over your shoulder (F)' }), viewWord = word('');
  bView.append(ico('eye'), viewWord);
  const bUp = btn('red', 'chairUp', 'Stand up', { 'data-key': 'W A S D' });
  // town folk for empty chairs: how many (0-3), the suggestion (up to three players) in gold
  const fillBox = el('div', 'dnd-fill', '', { hidden: '' });
  fillBox.append(el('span', '', 'Fill seats with town folk:'));
  const fillBtns = [0, 1, 2, 3].map(n => { const b = el('button', 'dnd-btn small', String(n), { type: 'button', 'data-n': String(n), 'aria-label': `${n} town folk` }); b.onclick = () => net.send({ t: 'dnd-fill', n }); fillBox.append(b); return b; });
  setCard.append(el('div', 'dnd-h', 'Game settings'), setX, bVoice, bWho, vSel, bView, fillBox, bUp);
  const setOpen = on => { setCard.hidden = !on; root.classList.toggle('settings-open', on); bSet.setAttribute('aria-expanded', on ? 'true' : 'false'); if (on) paintView(); };
  bSet.onclick = () => setOpen(setCard.hidden);
  setX.onclick = () => setOpen(false);
  const seatView = () => store.seatView?.view === 'room';
  const paintView = () => { const on = seatView(); viewWord.textContent = on ? 'Three-quarter view: on' : 'Three-quarter view: off'; bView.setAttribute('aria-pressed', on ? 'true' : 'false'); bView.title = (on ? 'Over your shoulder' : 'First person') + ': tap to switch (F)'; bView.hidden = !store.sitting?.tq; };
  bView.onclick = () => { store.setView?.(seatView() ? 'fp' : 'normal'); paintView(); }; // (the indoor toggle's pair since camera-view: the shot at the seat, the normal view on your feet)

  const log = el('div', 'dnd-log'), logHead = el('div', 'dnd-log-head'), logTitle = el('b', '', 'D&D night'), logSub = el('small', '', '');
  logHead.append(ico('book'), logTitle, logSub);
  const narr = el('div', 'dnd-narr', '', { role: 'log', 'aria-live': 'polite' });
  log.append(logHead, narr);
  // the dice area: the DM's check as the Roll (a brass-rimmed d20 plate), the free dice tray from the d20 at its edge, a roll's
  // result for a moment
  const pop = el('div', 'dnd-pop');
  const askBox = el('div', 'dnd-ask', '', { hidden: '' }), askText = el('div', 'dnd-ask-text'), askRoll = el('button', 'dnd-roll-big', '', { type: 'button' });
  askBox.append(askRoll, askText);
  const result = el('div', 'dnd-result', '', { hidden: '', 'aria-live': 'polite' }), lastRoll = el('div', 'dnd-last');
  const tray = el('div', 'dnd-tray');
  const bDice = el('button', 'dnd-btn dnd-dice-btn', '', { type: 'button', 'aria-expanded': 'false', 'aria-label': 'Dice: open the tray', title: 'Dice' });
  bDice.append(ico('d20'));
  pop.append(askBox, result, lastRoll, tray, bDice);
  const card = el('div', 'dnd-card');
  // Holding a die (or the check's Roll) charges the throw: a ring fills over about a second, and a longer hold throws further
  // over the felt. A quick tap is a short roll. Mouse, touch, or Space / Enter held. The number stays the server's.
  const CHARGE = 1.0;
  let charging = null; // { btn, t0 }
  const powerOf = held => (held < 0.15 ? 0.06 : 0.1 + 0.9 * (1 - (1 - Math.min(1, held / CHARGE)) ** 2));
  function chargeable(btn, fire) {
    let byPointer = 0;
    const start = () => { if (charging || btn.disabled) return; charging = { btn, t0: performance.now() }; btn.classList.add('charging'); };
    const end = () => { btn.classList.remove('charging'); btn.style.setProperty('--pow', '0'); };
    const release = () => { if (!charging || charging.btn !== btn) return; const held = (performance.now() - charging.t0) / 1000; charging = null; end(); fire({ p: Math.round(powerOf(held) * 100) / 100, a: Math.round((Math.random() - 0.5) * 40) / 100 }); };
    btn.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button !== 0) return; start(); try { btn.setPointerCapture(e.pointerId); } catch { /* fine */ } });
    btn.addEventListener('pointerup', () => { if (charging?.btn === btn) { byPointer = performance.now(); release(); } });
    btn.addEventListener('pointercancel', () => { if (charging?.btn === btn) { charging = null; end(); } });
    btn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) start(); } e.stopPropagation(); });
    btn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); } e.stopPropagation(); });
    btn.addEventListener('click', () => { if (performance.now() - byPointer < 700 || charging) return; fire({ p: 0.06, a: 0 }); }); // (a click with no press first: assistive tech, a script)
  }
  const pendingMine = () => (S.s?.pending || []).find(x => x.seat === S.seat);
  // the tray folds away behind the d20: a tap opens it in the dice area, it folds back after the throw or on a tap outside
  const trayOpen = on => { root.classList.toggle('tray-open', on); bDice.setAttribute('aria-expanded', on ? 'true' : 'false'); };
  bDice.onclick = () => trayOpen(!root.classList.contains('tray-open'));
  // each die is its shape (a triangle, a cube's face, an octahedron, a kite, a dodecagon, the d20) with its number over it
  for (const d of DICE) { const b = el('button', 'dnd-die', '', { type: 'button', 'data-die': d, 'aria-label': 'Roll a ' + d + ' (hold to throw further)', title: 'Roll a ' + d + ' (hold to throw further)' }); b.append(ico(d === 'd20' ? 'die20' : d), el('b', 'n', d.slice(1))); chargeable(b, thr => { const p = d === 'd20' && pendingMine(); net.send(p ? { t: 'dnd-roll', check: p.id, throw: thr } : { t: 'dnd-roll', die: d, throw: thr }); trayOpen(false); }); tray.append(b); } // (the d20 rolls the check the DM asked for, when there is one)
  chargeable(askRoll, thr => { const p = pendingMine(); if (!p) return; net.send({ t: 'dnd-roll', check: p.id, throw: thr }); askRoll.disabled = true; setTimeout(() => { askRoll.disabled = false; }, 900); });
  // a tap outside the open tray, wheel or settings card folds it
  document.addEventListener('pointerdown', e => {
    const t = e.target;
    if (root.classList.contains('tray-open') && !tray.contains(t) && !bDice.contains(t)) trayOpen(false);
    if (root.classList.contains('tools-open') && !tools.contains(t) && !seal.contains(t)) toolsOpen(false);
    if (!setCard.hidden && !setCard.contains(t) && !bSet.contains(t)) setOpen(false);
    if (root.classList.contains('reading') && !log.contains(t) && !wstrip.contains(t)) readOpen(false);
  }, true);
  const talk = el('div', 'dnd-talk');
  // To the DM / table talk: a small pill on the text box's left edge
  const toDM = el('button', 'dnd-to on', '', { type: 'button', 'aria-pressed': 'true', title: 'Talking to the DM (in character); tap for table talk' });
  const toIco = ico('swords'), toShort = el('span', 'short'); toDM.append(toIco, toShort);
  const setTo = on => { toDM.classList.toggle('on', on); toIco.innerHTML = ICON[on ? 'swords' : 'mug']; toShort.textContent = on ? 'DM' : 'table'; toDM.setAttribute('aria-pressed', on ? 'true' : 'false'); toDM.setAttribute('aria-label', on ? 'To the DM' : 'Table talk'); toDM.title = on ? 'Talking to the DM (in character); tap for table talk' : 'Table talk (out of character); tap to talk to the DM'; }; // (crossed swords for the DM, a mug for table talk)
  setTo(true);
  const input = el('input', 'dnd-input', '', { type: 'text', maxlength: '300', placeholder: 'What do you do?', 'aria-label': 'Say something at the table', 'data-key': 'Enter' });
  // hold to talk: the mic at the text box's right end (hold, talk, let go to send)
  const mic = el('button', 'dnd-mic', '', { type: 'button', 'aria-label': 'Hold to talk', title: 'Hold to talk, let go to send; a tap listens once', hidden: '' });
  mic.append(ico('mic'));
  const send = el('button', 'dnd-send', '', { type: 'button', 'aria-label': 'Send', title: 'Send (Enter)', 'data-key': 'Enter' });
  send.append(ico('send'));
  const heardEl = el('div', 'dnd-heard', '', { hidden: '', 'aria-live': 'polite' });
  const say = el('div', 'dnd-say'); say.append(toDM, input, mic);
  talk.append(say, send);
  // your character: the strip (the name, HP, AC, the six abilities) and, a tap away, the whole sheet with its corner circle
  const me = el('div', 'dnd-me');
  const strip = el('button', 'dnd-me-strip', '', { type: 'button', 'aria-expanded': 'false', title: 'Your character: tap for the whole sheet' });
  const full = el('div', 'dnd-full');
  const shut = el('button', 'dnd-sheet-close', '', { type: 'button', 'aria-label': 'Fold the sheet away', title: 'Fold the sheet away' }); shut.append(ico('fold'));
  card.append(strip, full, shut); me.append(card);
  const sheetOpen = on => { root.classList.toggle('sheet-open', on); strip.setAttribute('aria-expanded', on ? 'true' : 'false'); bSheet.setAttribute('aria-pressed', on ? 'true' : 'false'); if (on) full.scrollTop = 0; };
  strip.onclick = () => { if (S.seat !== 6 && !myChar()) { openModal('char'); return; } sheetOpen(!root.classList.contains('sheet-open')); };
  shut.onclick = () => sheetOpen(false);
  bSheet.onclick = () => strip.onclick();
  // upright the parts sit in one solid panel under the view; sideways they're boxes over the view
  const panel = el('div', 'dnd-panel'); panel.append(log, pop, me, heardEl, talk);
  const modal = el('div', 'dnd-modal', '', { hidden: '' });
  const watchNote = el('div', 'dnd-watch', 'Watching D&D night. Sit at a free chair to join.', { hidden: '' });
  log.append(watchNote);
  // (dnd-room-ui) watching, the table is a strip docked above the chat bar: the book and the newest line (gold for a moment when a
  // line comes, a dot till you read it); a tap opens the reader (the log as a sheet: big type, the newest line lit, a close); the
  // HUD pieces under the open reader step back till it closes. Never over the middle of the view or a HUD piece (placeStrip).
  const wstrip = el('button', 'dnd-wstrip', '', { type: 'button', hidden: '', 'aria-expanded': 'false', 'aria-label': 'D&D night: read the story', title: 'Read the story' });
  const wText = el('span', 'dnd-wtext'), wDot = el('i', 'dnd-wdot', '', { hidden: '', 'aria-hidden': 'true' });
  wstrip.append(ico('book'), wText, wDot);
  const rdClose = el('button', 'dnd-x dnd-rd-close', '', { type: 'button', 'aria-label': 'Close the story', title: 'Close' }); rdClose.append(ico('x'));
  logHead.append(rdClose);
  let freshT = 0;
  const readOpen = on => {
    root.classList.toggle('reading', on); wstrip.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) { wDot.hidden = true; const L1 = narr.querySelector('.dnd-line.latest'); nsc.show(L1 ? Math.max(0, L1.offsetTop - 6) : narr.scrollHeight); }
    hideUnder(on);
  };
  wstrip.onclick = () => readOpen(!root.classList.contains('reading'));
  rdClose.onclick = () => { readOpen(false); wstrip.focus?.({ preventScroll: true }); };
  // the strip's words: the newest DM line (a spoken one as "Name: words"), else the adventure's title, else "No adventure yet"
  function paintStrip(fresh) {
    const e = [...S.log].reverse().find(x => x.k === 'dm'), m = S.s?.module;
    wText.textContent = e ? (e.speaker ? `${e.speaker}: ${quoted(e.text)}` : e.text) : m ? m.title : 'No adventure yet';
    if (fresh && S.open === 'watch') {
      if (!root.classList.contains('reading')) wDot.hidden = false;
      wstrip.classList.remove('fresh'); void wstrip.offsetWidth; wstrip.classList.add('fresh');
      clearTimeout(freshT); freshT = setTimeout(() => wstrip.classList.remove('fresh'), 6000);
    }
  }
  // the HUD's pieces: what the strip keeps clear of, what steps back under the open reader, what the name tags keep clear of
  const HUD_PIECES = '#quests .qt-head, #quests .qt-body, #minimap, #place, #hud-time, #hud-wx, #online, #btn-help, #currency .cur, #chat-form, #mic-toggle, #tg-emotes, #tg-tools, #btn-act, #btn-act .act-name, #hint, .lc-view, #crosspad .cp-arm, #pad-name, .pad-slot, #quest-flare';
  const DND_PIECES = '.dnd-wstrip, .dnd-top, .dnd-log, .dnd-pop, .dnd-me, .dnd-talk, .dnd-tools, .dnd-seal, .dnd-panel-bg';
  const shown = n => { if (!n || n.closest('.dnd-under')) return null; const r = n.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return null; for (let q = n; q && q !== document.body; q = q.parentElement) { const cs = getComputedStyle(q); if (cs.display === 'none' || cs.visibility === 'hidden' || q.hidden) return null; } return r; };
  // the strip: on the chat bar, its left end at the bar's, as wide as the room up to the first piece in its band (the smiley, the
  // E, the words...), 520 px at most; with no chat bar, the bottom left corner
  function placeStrip() {
    if (S.open !== 'watch') return;
    const Z = parseFloat(getComputedStyle(hudEl).zoom) || 1, H = 46 * Z, gap = 8 * Z;
    const chat = shown(hudEl.querySelector('#chat-form'));
    const left = chat ? chat.left : 10 * Z, bottom = chat ? chat.top - gap : innerHeight - 10 * Z, top = bottom - H;
    let right = Math.min(innerWidth - 10 * Z, left + 520 * Z);
    for (const n of hudEl.querySelectorAll(HUD_PIECES)) {
      if (n.closest('#chat-form')) continue;
      const r = shown(n); if (!r || r.bottom <= top - 2 || r.top >= bottom + 2 || r.right <= left) continue;
      right = Math.min(right, r.left - gap);
    }
    const s = wstrip.style;
    s.left = (left / Z).toFixed(1) + 'px'; s.top = (top / Z).toFixed(1) + 'px'; s.width = (Math.max(140 * Z, right - left) / Z).toFixed(1) + 'px';
  }
  // the reader open: the HUD pieces it covers step back (visibility) till it closes
  function hideUnder(on) {
    for (const n of hudEl.querySelectorAll('.dnd-under')) n.classList.remove('dnd-under');
    if (!on) return;
    const R = log.getBoundingClientRect();
    for (const n of hudEl.querySelectorAll(HUD_PIECES + ', #chat-log')) { const r = shown(n); if (r && r.left < R.right && r.right > R.left && r.top < R.bottom && r.bottom > R.top) n.classList.add('dnd-under'); }
  }
  // the name tags in the room keep clear of the HUD and the table's pieces (ui.js clearOf), the boxes taken twice a second
  let tidyAt = 0;
  function tidy(now) {
    if (now - tidyAt < 0.5) return; tidyAt = now;
    if (S.open === 'watch') placeStrip();
    if (root.classList.contains('reading')) hideUnder(true); // (a piece that came since: the words pill, a chat line)
    const out = [];
    for (const n of hudEl.querySelectorAll(HUD_PIECES + ', ' + DND_PIECES)) { const r = shown(n); if (r) out.push([r.left, r.top, r.right, r.bottom]); }
    ui.clearOf = out;
  }
  const panelBg = el('div', 'dnd-panel-bg'); // (upright: the solid leather under the view)
  root.append(panelBg, top, panel, seal, tools, setCard, modal, wstrip);
  ctx.hud.append(root);
  const hudEl = ctx.hud;
  // portrait or landscape (a phone turned while you sit): the tools are the wheel by the seal or the toolbar on the bar
  // the layout is data (dnd-layout.js): the built-in per form with what Andrew saved in the HUD Editor laid over it
  let SAVED = null, FORM = 'pc', DL = layoutFor('pc', null), layoutKey = '';
  loadSaved().then(d => { SAVED = d; layoutKey = ''; if (S.open) placeParts(); });
  function placeParts() {
    const form = formOf(innerWidth, innerHeight, hudEl.dataset.layout), k = form + innerWidth + 'x' + innerHeight;
    if (k === layoutKey) return false; layoutKey = k;
    FORM = form; DL = layoutFor(form, SAVED);
    const p = form === 'portrait';
    root.classList.toggle('portrait', p); root.classList.toggle('landscape', !p); root.dataset.form = form;
    applyLayout(root, hudEl, form, DL);
    if (!p) { toolsOpen(false); for (const b of tools.children) { b.style.removeProperty('--wx'); b.style.removeProperty('--wy'); } }
    else if (root.classList.contains('tools-open')) layWheel();
    return true;
  }

  const setVoiceBtn = () => { const t = voiceOn ? 'Voice on' : 'Voice off'; voiceIco.innerHTML = ICON[voiceOn ? 'speaker' : 'speakerOff']; voiceWord.textContent = t === 'Voice on' ? 'The DM\'s voice: on' : 'The DM\'s voice: off'; bVoice.title = t + (voiceOn ? ': tap to quiet the DM' : ': tap to hear the DM'); bVoice.setAttribute('aria-label', t); bVoice.setAttribute('aria-pressed', voiceOn ? 'true' : 'false'); };
  setVoiceBtn();
  const setWhoBtn = () => { const a = voiceWho === 'andrew'; whoWord.textContent = a ? 'DM voice: Andrew' : 'DM voice: browser'; bWho.title = a ? "Andrew's own voice reads the DM: tap for this device's voice" : "This device's voice reads the DM: tap for Andrew's voice"; bWho.setAttribute('aria-label', whoWord.textContent); bWho.setAttribute('aria-pressed', a ? 'true' : 'false'); vSel.disabled = a; };
  const setWho = w => { voiceWho = w === 'browser' ? 'browser' : 'andrew'; lsSet(VOICE_WHO_KEY, voiceWho); if (voiceWho === 'browser') dmv.stopAll(); else synth?.cancel?.(); speech.left = 0; speech.until = 0; quiet(); setWhoBtn(); };
  bWho.onclick = () => setWho(voiceWho === 'andrew' ? 'browser' : 'andrew');
  setWhoBtn();
  bVoice.onclick = () => { voiceOn = !voiceOn; lsSet(VOICE_KEY, voiceOn ? 'on' : 'off'); if (!voiceOn) { dmv.stopAll(); synth?.cancel?.(); speech.left = 0; speech.until = 0; quiet(); } setVoiceBtn(); };
  // the voice list: Auto (the best this device has) and every English voice; the pick is remembered on this device
  function fillVoices() {
    const vs = enVoices(); vSel.hidden = !synth || !vs.length;
    const keep = voicePick; vSel.textContent = '';
    const best = (() => { const v0 = voicePick; voicePick = ''; const b = pickVoice(); voicePick = v0; return b; })();
    vSel.append(el('option', '', best ? `Auto voice (${best.name.replace(/^(Microsoft|Google)\s+/, '').replace(/\s*\(.*\)\s*$/, '').replace(/\s+Online$/, '')})` : 'Auto voice', { value: '' }));
    for (const v of vs.slice().sort((a, b) => voiceScore(b) - voiceScore(a))) vSel.append(el('option', '', `${v.name} (${v.lang})`, { value: v.name }));
    vSel.value = keep && vs.some(v => v.name === keep) ? keep : '';
  }
  vSel.onchange = () => { voicePick = vSel.value; lsSet(VOICE_NAME_KEY, voicePick); voice = pickVoice(); if (voiceOn && synth) { synth.cancel(); speech.left = 0; speech.until = 0; quiet(); speak('Welcome, adventurers. Pull up a chair.'); } };
  fillVoices();
  toDM.onclick = () => { const on = !toDM.classList.contains('on'); setTo(on); input.placeholder = on ? 'What do you do?' : 'Say something to the table'; };
  const doSend = () => {
    const text = input.value.trim(); if (!text) return;
    if (S.seat === 6) { const sp = hostSpeaker.value.trim(); net.send({ t: 'dnd-dm-say', text, speaker: sp || undefined, manner: sp && hostManner.value ? hostManner.value : undefined }); }
    else net.send({ t: 'dnd-say', text, dm: toDM.classList.contains('on') });
    input.value = '';
  };
  send.onclick = doSend;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSend(); } else if (e.key === 'Escape') input.blur(); e.stopPropagation(); });
  bUp.onclick = () => { setOpen(false); store.stand(); };
  bEnd.onclick = () => { if (confirmEnd()) net.send({ t: 'dnd-end' }); };
  let endAsked = 0; const confirmEnd = () => { const t = performance.now(); if (t - endAsked < 4000) { endAsked = 0; endWord.textContent = 'End the night'; return true; } endAsked = t; endWord.textContent = 'Tap again to end'; setTimeout(() => { if (endAsked) endWord.textContent = 'End the night'; }, 4000); return false; };
  bBegin.onclick = () => net.send({ t: 'dnd-start' });
  bAdv.onclick = () => openModal('adventure');
  bMap.onclick = () => openModal('map');
  // voice to text (where the browser has it). Seated with a character, the mic listens by itself on your turn, or whenever the
  // table is quiet outside a fight, and sends after ~2.5 s of quiet. Never while the DM's voice plays (it'd hear itself), the
  // game's mic is muted, or you're typing. The Mic tool has three ways: on your turn (auto), off, or always (a fight's other
  // turns and the DM thinking too); off, the bar's mic still listens while you hold it.
  const Rec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const MODE0 = lsGet(LISTEN_KEY), L = { rec: null, mode: MODE0 === 'off' || MODE0 === 'always' ? MODE0 : 'auto', userOff: MODE0 === 'off', denied: false, buf: '', interim: '', lastAt: 0, restartAt: 0, skip: 0, n: 0, sent: [], state: 'off',
    armed: false, startedAt: 0, heardSince: false, fails: 0, needTap: false };
  // A phone only lets the mic start from a tap, so it waits for one, and that tap asks for permission (getUserMedia). A session
  // that ends at once hearing nothing is a failure: restarts back off (0.35 s up to 15 s), and after three it asks for a tap
  // again. Android hears a phrase at a time, since continuous listening is shaky there.
  const ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
  let oneOff = null;
  if (Rec) {
    light.hidden = false;
    mic.onclick = () => {
      if (performance.now() - holdUp < 500 || hold) return; // (a hold just ended, or is on: not a tap)
      if (oneOff) { oneOff.stop(); return; }
      try { oneOff = new Rec(); oneOff.lang = 'en-US'; oneOff.interimResults = false; oneOff.onresult = ev => { input.value = (input.value + ' ' + ev.results[0][0].transcript).trim(); input.focus(); }; oneOff.onend = () => { oneOff = null; mic.classList.remove('on'); }; oneOff.start(); mic.classList.add('on'); } catch { oneOff = null; }
    };
  }
  // a tap: the first one lets the mic start (a phone asks for it), then auto, off, always, auto...
  const NEXT = { auto: 'off', off: 'always', always: 'auto' };
  light.onclick = () => {
    if (Rec && (L.needTap || !L.armed || L.denied) && !L.userOff) { armMic(); return; }
    L.mode = NEXT[L.mode] || 'auto'; L.userOff = L.mode === 'off'; lsSet(LISTEN_KEY, L.mode === 'auto' ? 'on' : L.mode); if (L.userOff) stopRec(); paintLight();
  };
  // Hold to talk: the Mic button held down listens from that touch (the surest way on a phone: the recognizer starts inside the
  // tap itself), shows what it hears, and sends it to the DM when the button is let go. A short tap is the one-off above.
  let hold = null, holdUp = 0;
  const PHONEISH = ANDROID || (typeof navigator !== 'undefined' && /iPhone|iPad/i.test(navigator.userAgent || ''));
  function startHold() {
    if (hold || !Rec) return;
    stopRec();
    try {
      const r = new Rec(); r.lang = 'en-US'; r.continuous = false; r.interimResults = true;
      const h = { r, err: '', text: '' };
      r.onresult = ev => { h.text = [...(ev.results || [])].map(x => x[0].transcript).join(' ').trim(); heardEl.classList.remove('note'); heardEl.hidden = !h.text; heardEl.textContent = h.text; };
      r.onerror = ev => { h.err = (ev && ev.error) || 'error'; };
      r.onend = () => {
        if (hold === h) hold = null;
        mic.classList.remove('on'); heardEl.hidden = true;
        const t = h.text.slice(0, 300);
        if (t) { if (S.seat >= 0 && S.seat !== 6) { net.send({ t: 'dnd-say', text: t, dm: toDM.classList.contains('on') }); L.sent.push(t); if (L.sent.length > 10) L.sent.shift(); } else { input.value = (input.value + ' ' + t).trim(); } }
        else note(h.err === 'not-allowed' ? 'The browser blocked the mic: allow it by the address bar' : h.err ? 'Mic error: ' + h.err : 'The mic heard nothing while you held the button');
        // the hold was the tap the mic needed (a phone has no light to tap): the listening on your turn may start by itself now
        if (h.err === 'not-allowed' || h.err === 'service-not-allowed') { L.denied = true; L.needTap = true; }
        else if (!L.armed || L.needTap || L.denied) { L.armed = true; L.needTap = false; L.denied = false; L.fails = 0; L.restartAt = 0; }
        paintLight();
      };
      hold = h; r.start(); mic.classList.add('on'); heardEl.classList.add('note'); heardEl.textContent = 'Listening... let go to send'; heardEl.hidden = false;
    } catch { hold = null; }
  }
  function endHold() { holdUp = performance.now(); if (hold) { try { hold.r.stop(); } catch { /* gone */ } } }
  mic.addEventListener('pointerdown', e => { if (e.button) return; e.preventDefault(); try { mic.setPointerCapture(e.pointerId); } catch { /* fine */ } startHold(); });
  mic.addEventListener('pointerup', endHold); mic.addEventListener('pointercancel', endHold);
  mic.addEventListener('contextmenu', e => e.preventDefault());
  // a note under the light (a phone: why nothing was heard), gone after a few seconds unless real words replace it
  let noteT = 0;
  function note(text) {
    heardEl.classList.add('note'); heardEl.textContent = text; heardEl.hidden = false;
    clearTimeout(noteT); noteT = setTimeout(() => { if (heardEl.classList.contains('note')) { heardEl.hidden = true; heardEl.classList.remove('note'); } }, 4000);
  }
  // what the recognizer did, for a phone that hears nothing: a timeline a session (audio in? sound? speech? results? error?),
  // shown under the light and sent to the server log (/api/client-error, three a page at most) so it can be read from afar
  let reports = 0;
  function report(d, err) {
    if (!PHONEISH || reports >= 3) return;
    reports++;
    try { fetch('/api/client-error', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'dndmic', msg: "the table's mic heard nothing: " + (err || 'no error') + ' (seat ' + S.seat + ')', timeline: d, ua: navigator.userAgent, w: innerWidth, h: innerHeight }) }).catch(() => {}); } catch { /* offline */ }
  }
  function armMic() { // (from the tap: Chrome asks for the mic here, then the listening may start by itself)
    const go = () => { L.armed = true; L.denied = false; L.needTap = false; L.fails = 0; L.restartAt = 0; paintLight(); };
    const md = navigator.mediaDevices;
    if (md && md.getUserMedia) md.getUserMedia({ audio: true }).then(st => { st.getTracks().forEach(t => t.stop()); go(); }).catch(() => { L.denied = true; L.needTap = true; paintLight(); });
    else go();
  }
  function myTurn() {
    const s = S.s; if (!s || S.seat < 0 || S.seat === 6 || !myChar()) return false;
    if (s.dm?.busy) return false;                                   // (the DM is thinking)
    if (s.combat) return s.combat.order[s.combat.turn]?.seat === S.seat; // (a fight: only on your turn)
    return true;                                                     // (otherwise: whenever the table is quiet and you are seated)
  }
  // why not (L.why): a hard reason stops the recognizer; a soft one (the DM talking or thinking, a fight's other turn, typing)
  // lets it run on, since on a phone every stop and start is a beep and a lost first word
  const SOFT = new Set(['dm speaking', 'dm thinking', 'not your turn', 'typing']);
  function wantListen() {
    L.why = '';
    const no = w => { L.why = w; return false; };
    if (!Rec) return no('none'); if (L.userOff) return no('off'); if (L.denied) return no('denied'); if (!L.armed || L.needTap) return no('tap');
    if (S.open !== 'seat') return no('stood'); if (oneOff || hold) return no('held');
    const s = S.s; if (!s || S.seat < 0 || S.seat === 6 || !myChar()) return no('no character');
    if (dmSpeaking()) return no('dm speaking');
    if (document.activeElement === input && input.value.trim()) return no('typing');
    if (L.mode === 'always') return true; // (always on: the DM thinking and a fight's other turns too)
    if (s.dm?.busy) return no('dm thinking');
    if (s.combat && s.combat.order[s.combat.turn]?.seat !== S.seat) return no('not your turn');
    return true;
  }
  function startRec() {
    if (L.rec || performance.now() < L.restartAt) return;
    try {
      const r = new Rec(); r.lang = 'en-US'; r.continuous = !ANDROID; r.interimResults = true;
      const d = [], t0 = performance.now(); let err = '', got = 0;
      const mark = s => { if (d.length < 40) d.push([Math.round(performance.now() - t0), s]); }; L.mark = mark;
      r.onaudiostart = () => mark('audio in'); r.onsoundstart = () => mark('sound'); r.onspeechstart = () => mark('speech'); r.onspeechend = () => mark('speech end');
      r.onresult = ev => { if (L.rec !== r) return; L.heardSince = true; got++; mark('result ' + (ev.results ? ev.results.length : 0)); onHeard(ev); };
      r.onerror = ev => {
        const e = ev && ev.error; err = e || 'error'; mark('error ' + err);
        if (e === 'not-allowed' || e === 'service-not-allowed') { L.denied = true; L.needTap = true; paintLight(); }
        else if (e === 'no-speech') L.heardSince = true; // (a quiet stretch is fine: not a failure, just start again)
      };
      r.onend = () => {
        mark('end');
        if (L.rec !== r) return;
        L.rec = null;
        if (!got && PHONEISH) { note(err === 'no-speech' || !err ? 'The mic heard nothing. Hold the Mic button to talk.' : 'Mic error: ' + err + '. Hold the Mic button to talk.'); report(d, err); }
        const quick = !L.heardSince && performance.now() - L.startedAt < 1500;
        L.fails = quick ? L.fails + 1 : 0;
        if (L.fails >= 3) { L.needTap = true; L.fails = 0; paintLight(); return; }
        L.restartAt = performance.now() + (quick ? Math.min(15000, 350 * 4 ** L.fails) : 350);
      };
      L.skip = 0; L.n = 0; L.heardSince = false; L.startedAt = performance.now(); r.start(); mark('start'); L.rec = r;
    } catch { L.fails++; L.restartAt = performance.now() + 2500; if (L.fails >= 3) { L.needTap = true; L.fails = 0; } }
  }
  function stopRec() { const r = L.rec; L.rec = null; if (r) L.mark?.('stop: ' + (L.why || 'stopped')); L.buf = ''; L.interim = ''; heardEl.hidden = true; if (r) { try { r.abort ? r.abort() : r.stop(); } catch { /* gone */ } } }
  function onHeard(ev) {
    let fin = '', inter = '';
    const res = ev.results || [];
    L.n = res.length;
    for (let i = Math.max(ev.resultIndex || 0, L.skip); i < res.length; i++) { const r = res[i]; if (r.isFinal) fin += ' ' + r[0].transcript; else inter += ' ' + r[0].transcript; }
    if (fin.trim()) { L.buf = (L.buf + fin).trim(); L.skip = Math.max(L.skip, [...res].map((r, i) => (r.isFinal ? i + 1 : 0)).reduce((a, b) => Math.max(a, b), 0)); }
    L.interim = inter.trim(); L.lastAt = performance.now();
    const t = (L.buf + ' ' + L.interim).trim(); heardEl.classList.remove('note'); heardEl.hidden = !t; heardEl.textContent = t;
  }
  let micHeld = false;
  function stepListen() {
    if (!Rec) return;
    // seated, the table's listening has the mic: voice chat lets go of it till you stand (a phone won't share it)
    const hold = S.open === 'seat' && !L.userOff;
    if (hold !== micHeld) { micHeld = hold; ctx.features?.find(f => f && f.name === 'voice')?.api?.holdMic?.('dnd', hold); }
    const w = wantListen();
    if (w && !L.rec) startRec();
    else if (!w && L.rec && !SOFT.has(L.why) && !L.buf && !L.interim) stopRec();
    // the DM's voice plays from the speaker, or you're typing: what the mic hears meanwhile is dropped, not sent
    if (!w && (L.why === 'dm speaking' || L.why === 'typing') && (L.buf || L.interim)) { L.buf = ''; L.interim = ''; L.skip = L.n; heardEl.hidden = true; }
    if ((L.buf || L.interim) && performance.now() - L.lastAt > 2500) { // ~2.5 s of quiet: off to the DM (Andrew, 2026-11-10: 1.2 s cut him off)
      const text = (L.buf + ' ' + L.interim).trim().slice(0, 300);
      L.buf = ''; L.interim = ''; L.skip = L.n; heardEl.hidden = true;
      if (text && S.seat >= 0 && S.seat !== 6) { net.send({ t: 'dnd-say', text, dm: toDM.classList.contains('on') }); L.sent.push(text); if (L.sent.length > 10) L.sent.shift(); }
      if (!w && !SOFT.has(L.why)) stopRec();
    }
    paintLight(w);
  }
  const LIGHT_STATES = ['on', 'off', 'wait', 'tap', 'blocked', 'none'];
  function paintLight(w = false) {
    mic.hidden = !Rec; light.hidden = !Rec;
    const st = !Rec ? 'none' : L.userOff ? 'off' : L.denied && !L.needTap ? 'blocked' : (L.needTap || !L.armed) ? 'tap' : w && (L.rec || performance.now() < L.restartAt + 400) ? 'on' : 'wait'; // (between quick restarts the light stays on)
    const key = st + L.mode; if (key === L.painted) return; L.painted = key; L.state = st;
    for (const k of LIGHT_STATES) light.classList.toggle(k, k === st);
    light.dataset.mode = L.mode; light.setAttribute('aria-pressed', st === 'on' ? 'true' : 'false');
    mic.dataset.listen = st; // (the bar's mic shows it too: green listening, amber waiting, grey off)
    const modeWord = L.mode === 'always' ? 'Mic: always on' : L.mode === 'off' ? 'Mic: off' : 'Mic: on your turn';
    lightTxt.textContent = st === 'tap' ? (L.denied ? 'Tap to allow the mic' : 'Tap to use the mic') : st === 'blocked' ? 'No mic' : modeWord;
    light.setAttribute('aria-label', lightTxt.textContent + (st === 'on' ? ' (listening)' : ''));
    light.title = st === 'blocked' ? 'The browser blocked the mic' : modeWord + ': tap for ' + { auto: 'off', off: 'always on', always: 'on your turn' }[L.mode];
    lightIco.innerHTML = ICON[L.mode === 'off' ? 'micOff' : 'micDot'];
  }
  paintLight();

  // the host's panel (Andrew in the DM's chair): say as an NPC, the quick tools, Claude privately
  const hostBox = el('div', 'dnd-host');
  const hostSpeaker = el('input', 'dnd-input small', '', { type: 'text', maxlength: '40', placeholder: 'Speaking as (optional NPC)', 'aria-label': 'Speak as an NPC' });
  // (dnd-said) how the NPC says it: shown and read before the words ("Old Croak whispers"); Auto goes by the punctuation
  const hostManner = el('select', 'dnd-sel dnd-manner', '', { 'aria-label': 'How they say it', title: 'How they say it' });
  hostManner.append(el('option', '', 'Auto', { value: '' })); for (const m of MANNERS) hostManner.append(el('option', '', m, { value: m }));
  const mannerOn = () => { hostManner.disabled = !hostSpeaker.value.trim(); };
  hostSpeaker.addEventListener('input', mannerOn); mannerOn();
  const hcWho = el('select', 'dnd-sel', '', { 'aria-label': 'Which character' }), hcWhat = el('select', 'dnd-sel', '', { 'aria-label': 'Which check' }), hcDc = el('input', 'dnd-input tiny', '', { type: 'number', min: '5', max: '30', value: '12', 'aria-label': 'DC' });
  for (const c of CHECKS) hcWhat.append(el('option', '', cap(c), { value: c }));
  const hcAsk = el('button', 'dnd-btn gold', 'Ask for a check', { type: 'button' });
  const hdAmt = el('input', 'dnd-input tiny', '', { type: 'number', min: '1', max: '99', value: '4', 'aria-label': 'Amount' });
  const hdHit = el('button', 'dnd-btn red', 'Damage', { type: 'button' }), hdHeal = el('button', 'dnd-btn', 'Heal', { type: 'button' }), hdNext = el('button', 'dnd-btn', 'Next turn', { type: 'button' });
  const hScene = el('select', 'dnd-sel', '', { 'aria-label': 'Scene' }), hGo = el('button', 'dnd-btn', 'Go to scene', { type: 'button' });
  const hAsk = el('input', 'dnd-input', '', { type: 'text', maxlength: '400', placeholder: 'Ask Claude privately: voice an NPC, a rule, what next?', 'aria-label': 'Ask Claude privately' });
  const hAskGo = el('button', 'dnd-btn gold', 'Ask', { type: 'button' }), hReplies = el('div', 'dnd-replies');
  const row = (...k) => { const r = el('div', 'dnd-row'); r.append(...k); return r; };
  // the town folk at the table: act for one (a line or what they do, as their character), or ask Claude what they would do
  const hBot = el('select', 'dnd-sel', '', { 'aria-label': 'Which town folk' }), hBotText = el('input', 'dnd-input', '', { type: 'text', maxlength: '300', placeholder: 'They say or do...', 'aria-label': 'What the town folk says or does' });
  const hBotGo = el('button', 'dnd-btn', 'Act for them', { type: 'button' }), hBotAsk = el('button', 'dnd-btn', 'What would they do?', { type: 'button' });
  const hBotRow = row(hBot, hBotText, hBotGo, hBotAsk); hBotRow.hidden = true;
  hBotGo.onclick = () => { const t = hBotText.value.trim(); if (!t || !hBot.value) return; net.send({ t: 'dnd-bot-act', seat: Number(hBot.value), text: t }); hBotText.value = ''; };
  hBotAsk.onclick = () => { const st = S.s?.seats?.[Number(hBot.value)]; if (!st?.bot || !st.char) return; const q = `What would ${st.char.name} (${st.name}, a town-folk bot at the table) do right now? One or two sentences, in character.`; net.send({ t: 'dnd-assist', q }); reply('You', q); };
  hBotText.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); hBotGo.click(); } e.stopPropagation(); });
  hostBox.append(el('div', 'dnd-h', 'You are the DM'), row(hostSpeaker, hostManner), row(hcWho, hcWhat, hcDc, hcAsk), row(hdAmt, hdHit, hdHeal, hdNext), row(hScene, hGo), hBotRow, el('div', 'dnd-h small', 'Claude, behind the screen'), row(hAsk, hAskGo), hReplies);
  const tool = (name, input) => net.send({ t: 'dnd-dm-tool', name, input });
  hcAsk.onclick = () => tool('request_check', { character: hcWho.value, check: hcWhat.value, dc: Number(hcDc.value) || 12, why: 'the DM asks' });
  hdHit.onclick = () => tool('damage', { target: hcWho.value, amount: Number(hdAmt.value) || 1 });
  hdHeal.onclick = () => tool('heal', { target: hcWho.value, amount: Number(hdAmt.value) || 1 });
  hdNext.onclick = () => tool('next_turn', {});
  hGo.onclick = () => tool('set_scene', { scene_id: hScene.value });
  const askClaude = () => { const q = hAsk.value.trim(); if (!q) return; net.send({ t: 'dnd-assist', q }); hAsk.value = ''; reply('You', q); };
  hAskGo.onclick = askClaude; hAsk.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); askClaude(); } e.stopPropagation(); });
  hostSpeaker.addEventListener('keydown', e => e.stopPropagation());
  function reply(who, text) { const r = el('div', 'dnd-reply'); r.append(el('b', '', who + ': '), document.createTextNode(text)); hReplies.prepend(r); while (hReplies.childNodes.length > 8) hReplies.lastChild.remove(); S.replies.unshift({ who, text }); }

  // ---------------------------------------------------------------- drawing the overlay from the state
  function renderParty() {
    party.textContent = '';
    const s = S.s; if (!s) return;
    for (const st of s.seats.slice(0, 6)) {
      if (!st) continue;
      const c = st.char, chip = el('div', 'dnd-chip' + (st.seat === S.seat ? ' me' : '') + (st.bot ? ' bot' : '') + (s.combat && s.combat.order[s.combat.turn]?.seat === st.seat ? ' turn' : ''));
      chip.style.setProperty('--c', c ? inkOf(c) : '#5b4a8a');
      chip.append(el('b', '', c ? c.name.split(' ')[0] : st.name));
      if (c) { const bar = el('i', 'hp'), fill = el('i', 'fill'); fill.style.width = Math.round(100 * Math.max(0, c.hp) / c.maxHp) + '%'; bar.append(fill); chip.append(bar, el('small', '', `${c.hp}/${c.maxHp}`)); if (c.conditions?.length) chip.append(el('em', 'cond', c.conditions.join(', '))); }
      else chip.append(el('small', '', st.name));
      chip.title = c ? `${c.name} (${st.name}${st.bot ? ', town folk' : ''}): ${c.hp}/${c.maxHp} HP, AC ${c.ac}${c.conditions?.length ? ', ' + c.conditions.join(', ') : ''}` : st.name;
      party.append(chip);
    }
    for (const m of s.monsters || []) { const chip = el('div', 'dnd-chip mon' + (m.hp <= 0 ? ' down' : '')); chip.append(el('b', '', m.label), el('small', '', m.hp > 0 ? `${m.hp}/${m.maxHp}` : 'down')); party.append(chip); }
  }
  function renderDm() {
    const d = S.s?.dm; if (!d) return;
    dmChip.textContent = '';
    const label = d.mode === 'claude' ? (d.busy ? 'DM (Claude) is thinking...' : 'DM: Claude') : d.mode === 'host' ? 'DM: ' + d.name : d.mode === 'resting' ? 'The DM is on a break' : 'The DM is away tonight';
    dmChip.append(el('b', '', label));
    dmChip.classList.toggle('away', d.mode === 'away' || d.mode === 'resting'); dmChip.classList.toggle('busy', !!d.busy);
    const m = S.s.module;
    logTitle.textContent = m ? m.title : 'No adventure yet'; logSub.textContent = m ? m.rating : 'pick one with Adventure';
    if (d.mode === 'claude') drawTent('DM: Claude', m ? m.title : 'pick an adventure', '#7a2140');
    else if (d.mode === 'host') drawTent('DM: ' + d.name, 'running the table', '#2f6b4f');
    else if (d.mode === 'resting') drawTent('The DM is on', 'a break', '#7a2140');
    else drawTent('The DM is away', 'tonight', '#7a2140');
  }
  function myChar() { const st = S.s?.seats?.[S.seat]; return st?.char || null; }
  // the strip (always there) and the whole sheet (a tap away): the host gets the DM's tools in the sheet's place
  function renderCard() {
    strip.textContent = ''; full.textContent = '';
    if (S.seat === 6) {
      strip.style.removeProperty('--c');
      strip.append(el('b', 'dnd-name', 'You are the DM'), el('span', 'dnd-sub', 'Tap for your tools: checks, damage, scenes, Claude'));
      full.append(hostBox); fillHost(); return;
    }
    const c = myChar();
    if (!c) { strip.style.removeProperty('--c'); strip.append(el('b', 'dnd-name', 'Who are you tonight?'), el('span', 'dnd-pick-now', 'Pick a character')); return; }
    strip.style.setProperty('--c', inkOf(c));
    const low = c.hp <= Math.ceil(c.maxHp / 3);
    const nm = el('div', 'dnd-strip-top'); nm.append(el('b', 'dnd-name', c.name), el('span', 'dnd-hp' + (low ? ' low' : ''), `HP ${c.hp}/${c.maxHp}`), el('span', 'dnd-acv', `AC ${c.ac}`));
    const mods = el('div', 'dnd-mods');
    for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) { const m = el('span', 'dnd-mini'); m.append(el('small', '', k.toUpperCase()), el('b', '', sign(mod(c.abil[k])))); mods.append(m); }
    strip.append(nm, mods);
    const head = el('div', 'dnd-card-head'); head.style.setProperty('--c', inkOf(c));
    head.append(el('div', 'dnd-name', c.name), el('div', 'dnd-sub', `Level ${c.level} ${c.raceName} ${c.clsName}`));
    if (c.conditions?.length) head.append(el('div', 'dnd-cond', c.conditions.join(', ')));
    const stats = el('div', 'dnd-stats');
    const box = (k, v, cls = '') => { const d = el('div', 'dnd-stat ' + cls); d.append(el('small', '', k), el('b', '', v)); return d; };
    stats.append(box('HP', `${c.hp}/${c.maxHp}`, low ? 'low' : ''), box('AC', String(c.ac)), box('Speed', c.speed + ' ft'));
    const ab = el('div', 'dnd-abil');
    for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) { const d = el('button', 'dnd-ab', '', { type: 'button', title: 'Roll ' + k.toUpperCase() }); d.append(el('small', '', k.toUpperCase()), el('b', '', sign(mod(c.abil[k]))), el('i', '', String(c.abil[k]))); d.onclick = () => net.send({ t: 'dnd-roll', die: 'd20', as: { str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' }[k] }); ab.append(d); }
    const acts = el('div', 'dnd-acts');
    for (const a of c.attacks) { const b = el('button', 'dnd-act', '', { type: 'button' }); b.append(el('b', '', a.name), el('small', '', `${a.save ? 'save' : sign(a.bonus)} ${MDOT} ${a.dmg} ${a.type}`)); b.onclick = () => { net.send({ t: 'dnd-say', text: `I use ${a.name.replace(/ \(.*\)$/, '')}.`, dm: true }); }; acts.append(b); }
    const sk = el('div', 'dnd-skills'); for (const [k, v] of Object.entries(c.skills)) { const b = el('button', 'dnd-skill', `${cap(k)} ${sign(v)}`, { type: 'button' }); b.onclick = () => net.send({ t: 'dnd-roll', die: 'd20', as: k }); sk.append(b); }
    const h = t => el('div', 'dnd-h small', t);
    full.append(head, stats, h('Abilities (tap to roll)'), ab, h('Attacks'), acts, h('Skills'), sk);
    if (c.spells?.length) full.append(h('Spells'), el('div', 'dnd-list', c.spells.join(', ')));
    if (c.features?.length) full.append(h('Features'), el('div', 'dnd-list', c.features.join('. ') + '.'));
    full.append(h('Carrying'), el('div', 'dnd-list', c.items.join(', ')));
  }
  function fillHost() {
    const keep = hcWho.value; hcWho.textContent = '';
    for (const st of (S.s?.seats || []).slice(0, 6)) if (st?.char) hcWho.append(el('option', '', st.char.name, { value: st.char.name }));
    for (const m of S.s?.monsters || []) hcWho.append(el('option', '', m.label, { value: m.label }));
    if (keep) hcWho.value = keep;
    const sk = hScene.value; hScene.textContent = '';
    for (const sc of S.scenes || []) hScene.append(el('option', '', sc.name, { value: sc.id }));
    if (sk) hScene.value = sk;
    const kb = hBot.value; hBot.textContent = '';
    for (const st of (S.s?.seats || []).slice(0, 6)) if (st?.bot && st.char) hBot.append(el('option', '', `${st.char.name} (${st.name})`, { value: String(st.seat) }));
    hBotRow.hidden = !hBot.options.length; if (kb) hBot.value = kb;
  }
  // the DM's check: the Roll plate (d20 and your modifier, big), what it's for beside it
  function renderAsk() {
    const p = (S.s?.pending || []).find(x => x.seat === S.seat);
    askBox.hidden = !p; root.classList.toggle('asking', !!p);
    if (!p) return;
    const c = myChar(); const m = c ? checkMod(c, p.check) : 0;
    askText.textContent = '';
    askText.append(el('b', '', cap(p.check) + (p.mode !== 'normal' ? ' with ' + p.mode : '')), el('span', '', p.why ? 'The DM asks: ' + p.why : 'The DM asks for a roll'), el('small', '', 'Hold the d20 to throw further'));
    askRoll.textContent = ''; askRoll.append(ico('die20'), word('Roll '), el('b', 'dnd-roll-n', `d20 ${sign(m)}`));
    askRoll.title = 'Roll d20 ' + sign(m) + ' (hold to throw further)'; askRoll.setAttribute('aria-label', askRoll.title);
  }
  function checkMod(c, k) {
    if (k in (c.skills || {})) return c.skills[k];
    const A = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
    if (A[k]) return mod(c.abil[A[k]]);
    const sv = /^(\w+) save$/.exec(k); if (sv && A[sv[1]]) { const a = A[sv[1]]; return mod(c.abil[a]) + (c.saves.includes(a) ? c.prof : 0); }
    if (k === 'attack') return c.attacks[0]?.bonus ?? 0;
    if (k === 'initiative') return c.init;
    return SKILL_ABIL[k] ? mod(c.abil[SKILL_ABIL[k]]) : 0;
  }
  // the class colour of whoever sits at seat i (or once sat there under that name): the ink a player's lines are written in
  const seatInk = e => { const c = S.s?.seats?.[e.seat]?.char; if (c && (!e.name || c.name === e.name)) return inkOf(c); const o = (S.s?.seats || []).find(x => x?.char?.name === e.name); return o ? inkOf(o.char) : ''; };
  // (dnd-said) a character at the table (a town folk the DM voices, or a player) by name: their class colour for their words
  const speakerInk = name => { const n = normN(name); if (!n) return ''; const o = (S.s?.seats || []).find(x => x?.char && (normN(x.char.name) === n || normN(x.char.name).split(' ')[0] === n.split(' ')[0])); return o ? inkOf(o.char) : ''; };
  // a spoken line: the tag as a small header, the words in quotation marks on their own line (the log and the DM's bubble)
  const spoken = (into, e) => { into.classList.add('spoken'); into.append(el('b', 'dnd-said', tagOfLine(e)), el('span', 'dnd-words', quoted(e.text))); return into; };
  function lineEl(e) {
    const d = el('div', 'dnd-line k-' + e.k);
    if (e.k === 'dm') { d.classList.toggle('npc', !!e.speaker); if (e.speaker) { const ink = speakerInk(e.speaker); if (ink) d.style.setProperty('--c', ink); spoken(d, e); } else { if (e.name && e.name !== 'DM') d.append(el('b', '', 'DM: ')); d.append(document.createTextNode(e.text)); } }
    else if (e.k === 'say') { d.classList.toggle('to-dm', !!e.dm); const ink = seatInk(e); if (ink) d.style.setProperty('--c', ink); spoken(d, e); }
    else if (e.k === 'roll') { d.classList.toggle('ok', e.ok === true); d.classList.toggle('fail', e.ok === false); const ink = e.seat !== 6 && seatInk(e); if (ink) d.style.setProperty('--c', ink); d.append(el('i', 'dnd-d20', ''), document.createTextNode(e.text)); }
    else d.textContent = e.text;
    return d;
  }
  // the narration box scrolls itself (dnd-scroll.js): a long DM line shows from its top and scrolls at reading speed
  const nsc = autoScroll(narr, { speed: 20 });
  let nscText = '';
  function renderLog() {
    narr.textContent = '';
    for (const e of S.log.slice(-60)) narr.append(lineEl(e));
    markLatest();
    nsc.end();
    paintStrip(false);
  }
  // the newest DM line is lit in the reader
  function markLatest() { const all = narr.querySelectorAll('.dnd-line.k-dm'); for (const n of narr.querySelectorAll('.latest')) n.classList.remove('latest'); all[all.length - 1]?.classList.add('latest'); }
  function addLine(e) {
    S.log.push(e); if (S.log.length > 80) S.log.shift();
    const atEnd = narr.scrollHeight - narr.scrollTop - narr.clientHeight < 60;
    const d = lineEl(e);
    narr.append(d); while (narr.childNodes.length > 60) narr.firstChild.remove();
    if (e.k === 'dm') { markLatest(); paintStrip(true); }
    if (e.k === 'dm' && !nsc.user && !nsc.active) { nscText = e.text; nsc.show(Math.max(0, d.offsetTop - 6)); } // (a passage still scrolling runs on through the lines after it)
    else if (atEnd && !nsc.active && !nsc.user) nsc.end();
  }
  // a roll lands: its number big in the dice area for a few seconds, then a quiet line there till the next one
  let resultT = 0;
  function showResult(e) {
    const first = String(e.name || '').split(' ')[0], what = e.what && !/^d\d+$/.test(e.what) ? cap(e.what) : (e.dice?.[0] ? 'd' + e.dice[0][0] : 'Roll');
    const verdict = e.dc ? ` vs DC ${e.dc}: ${e.ok ? 'success' : 'failure'}` : '';
    result.textContent = '';
    result.className = 'dnd-result' + (e.ok === true ? ' ok' : e.ok === false ? ' fail' : '') + (e.seat === S.seat ? ' mine' : '') + (e.nat === 20 ? ' crit' : e.nat === 1 ? ' fumble' : '');
    const ink = e.seat !== 6 && seatInk(e); if (ink) result.style.setProperty('--c', ink); else result.style.removeProperty('--c');
    result.append(el('b', 'dnd-result-n', String(e.total) + (e.nat === 20 ? '!' : '')), el('span', '', `${first}: ${what}${verdict}`));
    result.hidden = false; root.classList.add('result-on');
    lastRoll.textContent = `Last roll: ${first} ${what} ${e.total}${e.dc ? (e.ok ? ', success' : ', failure') : ''}`;
    clearTimeout(resultT); resultT = setTimeout(() => { result.hidden = true; root.classList.remove('result-on'); }, 3600);
  }
  function renderFill() {
    const s = S.s; if (!s) { fillBox.hidden = true; return; }
    const seats = (s.seats || []).slice(0, 6), real = seats.filter(x => x && !x.bot).length, bots = seats.filter(x => x && x.bot).length;
    fillBox.hidden = !(S.seat >= 0 && (bots > 0 || (real < 3 && !s.started)));
    const suggest = Math.max(0, Math.min(3, 3 - real, 6 - real));
    fillBtns.forEach((b, n) => { b.classList.toggle('on', n === bots); b.classList.toggle('gold', n === suggest && n !== bots); b.disabled = n > 6 - real; });
    bSet.classList.toggle('dot', !fillBox.hidden && !s.started && bots === 0); // (a gold dot on Game settings: town folk could fill the table)
  }
  function renderTop() {
    const s = S.s; if (!s) return;
    bBegin.hidden = !(S.seat >= 0 && s.module && !s.started);
    bMap.hidden = !(s.module && (s.module.maps || []).length);
    bEnd.hidden = !(S.seat >= 0 && s.module && s.started);
    bAdv.hidden = S.seat < 0;
    const host = S.seat === 6; bSheet.lastChild.textContent = host ? 'DM tools' : 'Character sheet'; bSheet.title = host ? 'Your DM tools' : 'Your character sheet'; bSheet.setAttribute('aria-label', bSheet.title);
    if (root.classList.contains('tools-open')) layWheel();
  }
  function renderAll() { renderDm(); renderParty(); renderTop(); renderFill(); renderCard(); renderAsk(); }

  // ---------------------------------------------------------------- the pickers (characters, adventures), the map, handouts
  function openModal(kind, arg) {
    modal.textContent = ''; modal.hidden = false; S.view = kind;
    const close = el('button', 'dnd-btn red dnd-close', 'Close', { type: 'button' }); close.onclick = closeModal;
    if (kind === 'char') {
      modal.append(el('div', 'dnd-h', 'Pick a character'), close);
      const grid = el('div', 'dnd-grid');
      for (const p of S.premades) {
        const c = el('button', 'dnd-pick', '', { type: 'button' }); c.style.setProperty('--c', p.color);
        c.append(el('b', '', p.name), el('small', '', `${p.raceName} ${p.clsName}${MDOT}HP ${p.maxHp}${MDOT}AC ${p.ac}`), el('span', '', p.look), el('i', '', p.hook));
        c.onclick = () => { net.send({ t: 'dnd-char', premade: p.id }); closeModal(); };
        grid.append(c);
      }
      const own = el('div', 'dnd-pick own'), nm = el('input', 'dnd-input', '', { type: 'text', maxlength: '24', placeholder: 'Your hero\'s name', 'aria-label': 'Your character\'s name' }), cl = el('select', 'dnd-sel', '', { 'aria-label': 'Class' });
      for (const c of S.classes) cl.append(el('option', '', c.name, { value: c.id }));
      const go = el('button', 'dnd-btn gold', 'Make my own', { type: 'button' });
      go.onclick = () => { net.send({ t: 'dnd-char', cls: cl.value, name: nm.value.trim() }); closeModal(); };
      nm.addEventListener('keydown', e => e.stopPropagation());
      own.append(el('b', '', 'Make your own'), el('small', '', 'Pick a class and a name; the rest is filled in.'), nm, cl, go);
      grid.append(own);
      if (S.you.chars?.length) for (const ch of S.you.chars.filter(x => !S.premades.some(p => p.id === x.id))) { const b = el('button', 'dnd-pick mine', '', { type: 'button' }); b.style.setProperty('--c', ch.color); b.append(el('b', '', ch.name), el('small', '', `Yours: ${ch.raceName} ${ch.clsName}${MDOT}HP ${ch.hp}/${ch.maxHp}`)); b.onclick = () => { net.send({ t: 'dnd-char', keep: ch.id }); closeModal(); }; grid.append(b); }
      modal.append(grid);
    } else if (kind === 'adventure') {
      modal.append(el('div', 'dnd-h', 'Pick an adventure'), close);
      const list = el('div', 'dnd-grid one');
      for (const m of S.modules) {
        const c = el('div', 'dnd-adv' + (S.s?.module?.id === m.id ? ' on' : ''));
        if (m.cover) { const im = el('img', 'dnd-cover', '', { alt: '', loading: 'lazy', src: m.cover }); c.append(im); }
        const tx = el('div', 'dnd-adv-text');
        tx.append(el('b', '', m.title), el('div', 'dnd-rating', `${m.rating}${MDOT}levels ${m.levels}${MDOT}${m.sessions} session${m.sessions === '1' ? '' : 's'}`), el('div', 'dnd-notes', 'Content: ' + m.contentNotes), el('p', '', m.pitch));
        if (m.licence && !m.original) { const cr = el('small', 'dnd-credit', m.licence.attribution); tx.append(cr); }
        const go = el('button', 'dnd-btn gold', S.s?.module?.id === m.id ? 'Picked' : 'Play this', { type: 'button' });
        go.onclick = () => { net.send({ t: 'dnd-module', id: m.id }); closeModal(); };
        tx.append(go); c.append(tx); list.append(c);
      }
      modal.append(list);
    } else if (kind === 'handoff') { // a town folk gave you their chair: keep their character, or play your own
      modal.append(el('div', 'dnd-h', `${arg.from} hands you ${arg.name}`), close);
      const keep = el('button', 'dnd-btn gold big', `Play ${arg.name}`, { type: 'button' }), own = el('button', 'dnd-btn big', 'Play my own character', { type: 'button' });
      keep.onclick = closeModal; own.onclick = () => openModal('char');
      modal.append(el('p', 'dnd-cap', `${arg.from} slides the character sheet over and heads to the snack table. Keep going as ${arg.name}, or bring your own hero.`), row(keep, own));
    } else if (kind === 'map' || kind === 'handout') {
      const m = S.s?.module; let img = null, title = '', cap2 = '';
      if (kind === 'map') { const mp = (m?.maps || []).find(x => x.id === (S.s.map || m.maps[0]?.id)) || m?.maps?.[0]; img = mp?.img; title = mp?.title || 'Map'; }
      else { const h = (m?.handouts || []).find(x => x.id === arg); img = h?.img; title = h?.title || ''; cap2 = h?.caption || ''; }
      modal.append(el('div', 'dnd-h', title), close);
      if (img) modal.append(el('img', 'dnd-big', '', { alt: title, src: img }));
      if (cap2) modal.append(el('p', 'dnd-cap', cap2));
      if (m?.licence && !m.original) modal.append(el('small', 'dnd-credit', m.licence.attribution));
    }
  }
  function closeModal() { modal.hidden = true; modal.textContent = ''; S.view = 'table'; }

  // ---------------------------------------------------------------- open / close
  function open(mode) {
    S.open = mode;
    root.hidden = false; root.classList.toggle('watching', mode === 'watch'); root.classList.toggle('hosting', S.seat === 6);
    watchNote.hidden = mode !== 'watch'; wstrip.hidden = mode !== 'watch'; readOpen(false); wDot.hidden = true;
    hudEl.classList.toggle('dnd-strip', mode === 'watch'); // (hud-clear.js: the chat log keeps clear of the strip)
    hudEl.classList.toggle('dnd-on', mode === 'seat'); hudEl.classList.add('dnd-open'); // (dnd-open: the fish and treat pills step back while the card is up, seated or watching)
    layoutKey = ''; placeParts(); trayOpen(false); toolsOpen(false); setOpen(false); sheetOpen(false);
    renderAll(); renderLog();
    fitView(true);
    tidyAt = -1; tidy(0);
  }
  function close() { readOpen(false); wstrip.hidden = true; ui.clearOf = null; S.open = false; root.hidden = true; hudEl.classList.remove('dnd-on', 'dnd-open', 'dnd-strip'); closeModal(); trayOpen(false); toolsOpen(false); setOpen(false); sheetOpen(false); input.blur(); fitView(true); }
  // Upright and seated, the 3D view is drawn into the part of the screen above the panel: the camera's aspect is that part's and
  // a view offset puts its picture there (the rest of the frame runs on under the panel, where the ink pass skips drawing it), so
  // the DM and the table are framed in the clear part, never under the panel. Sideways the view is the whole screen again.
  const fit = { on: false, w: 0, h: 0, v: 0, at: 0 };
  function fitView(force) {
    const want = S.open === 'seat' && root.classList.contains('portrait');
    const W = innerWidth, H = innerHeight, ink = ctx.ink;
    if (!want) {
      if (fit.on) { fit.on = false; camera.clearViewOffset(); camera.aspect = W / H; camera.updateProjectionMatrix(); if (ink) ink.clip = 1; }
      return;
    }
    const t = performance.now();
    if (force || !fit.on || fit.w !== W || fit.h !== H || t - fit.at > 500) { fit.v = Math.max(120, Math.round(DL.view.h * H)); fit.at = t; } // (the panel's top: the layout's split)
    const v = Math.min(H, fit.v);
    if (!force && fit.on && fit.w === W && fit.h === H && camera.view?.enabled && camera.view.fullHeight === v && Math.abs(camera.aspect - W / v) < 1e-9) return;
    fit.on = true; fit.w = W; fit.h = H;
    camera.aspect = W / v; camera.setViewOffset(W, v, 0, 0, W, H); // (setViewOffset updates the projection)
    if (ink) ink.clip = Math.min(1, (v + 24) / H); // (a little past the panel's top edge: its corners)
  }

  // ---------------------------------------------------------------- the server
  const take = s => {
    const prevHandout = S.s?.handout, prevMod = S.s?.module?.id;
    S.s = s;
    if (s.module?.id !== prevMod) fetchScenes(s.module?.id);
    const mod0 = s.module, mp = mod0 && s.map ? (mod0.maps || []).find(x => x.id === s.map) : null;
    showMap(mp ? mp.img : null);
    if (B.leaf?.userData?.letters) B.leaf.userData.letters.set(s.day?.days ? s.day.days.toUpperCase() : 'TUESDAYS');
    if (S.open) { renderAll(); if (s.handout && s.handout !== prevHandout) openModal('handout', s.handout); }
    else renderDm();
    syncBots();
  };
  function fetchScenes(id) { S.scenes = []; if (!id) return; fetch('/dnd/modules/' + encodeURIComponent(id) + '.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => { if (j && S.s?.module?.id === id) { S.scenes = (j.scenes || []).map(x => ({ id: x.id, name: x.name })); if (S.seat === 6) fillHost(); } }).catch(() => {}); }
  net.on('dnd-state', m => {
    S.log = Array.isArray(m.log) ? m.log : []; S.premades = m.premades || []; S.classes = m.classes || []; S.races = m.races || {}; S.modules = m.modules || []; S.you = m.you || S.you;
    take(m.s);
    B.art?.setCredits?.(S.modules.filter(x => !x.original).map(x => ({ title: x.title, rating: x.rating, contentNotes: x.contentNotes, attribution: x.licence?.attribution || '' })));
    if (S.open) renderLog();
  });
  net.on('dnd', m => take(m.s));
  net.on('dnd-log', ({ e }) => {
    if (!e) return;
    addLine(e);
    if (e.k === 'roll') { throwDie(e); if (S.open === 'seat') showResult(e); }
    if (e.k !== 'dm') heard.who = ''; // (a player's line, a roll: someone else came between, so the next NPC line is tagged again)
    if (e.k === 'dm') {
      const tag = e.speaker ? tagOfLine(e) : '', t =e.speaker ? `${tag} ${quoted(e.text)}` : e.text;
      // (dnd-said) the tag is said first, unless the same speaker carries on within a few seconds of their last words
      const again = !!e.speaker && heard.who === normN(e.speaker) && secs() < heard.until + 4;
      speak(e.text, e.speaker, tag && !again ? tag : '', e.id);
      heard.who = normN(e.speaker); heard.until = Math.max(secs(), speech.until);
      // a line in the bubble: narration as it is, a spoken line as the log has it (the tag over the words)
      const part = (cls, text) => { const p = el(cls === 'more' ? 'p' : 'div', cls === 'more' ? 'dnd-bubble-more' : 'dnd-bubble-text', e.speaker ? '' : text); if (e.speaker) { const ink = speakerInk(e.speaker); const w = cls === 'more' ? p : p.appendChild(el('div', 'dnd-bubble-line')); if (ink) w.style.setProperty('--c', ink); spoken(w, e); } return p; };
      if (inside.visible) { // the whole line in the bubble, scrolling itself when it's long;
        // a line that comes while a long one is still being read joins it in the same bubble
        const secsFor = n => Math.min(45, 5 + n / 13);
        if (bubble.inner?.isConnected && bubble.sc && (bubble.sc.active || speechAt(bubble.text) !== null) && bubble.item) {
          bubble.inner.append(part('more', t)); bubble.item.until = Math.max(bubble.item.until, performance.now() + secsFor(t.length) * 1000 + 4000);
        } else {
          const it = ui.say(dmAnchor, t, secsFor(t.length), 0.9, 'dnd-dm-bubble');
          if (it && it.node) { it.node.textContent = ''; const inner = part('first', t); it.node.append(inner); bubble.sc = autoScroll(inner, { speed: 16, pause: 1.6 }); bubble.text = e.text; bubble.inner = inner; bubble.item = it; bubble.fresh = true; }
        }
      }
      const bot = e.speaker && botPeople.size ? [...botPeople.values()].find(b => normN(S.s?.seats?.[b.seatNo]?.char?.name) === normN(e.speaker) || normN(S.s?.seats?.[b.seatNo]?.char?.name).split(' ')[0] === normN(e.speaker).split(' ')[0]) : null;
      if (bot) { bot.h.say(Math.min(6, 1 + e.text.length / 18)); bot.talkUntil = performance.now() / 1000 + Math.min(6, 1 + e.text.length / 18); }
    }
    if (e.k === 'say' && e.bot) { const b = botPeople.get(e.seat); if (b) { ui.say(b.h.root, e.text, 4); b.h.say(2); } }
    if (e.k === 'say') { const st = S.s?.seats?.[e.seat]; const who = st ? (st.sid === net.sid ? player.character.root : ctx.remotes?.map?.get(st.sid)?.ch?.root) : null; if (who && st.sid !== net.sid) ui.say(who, e.text, 4); }
    if (e.k === 'say') { tg.said(e.seat); const h = e.bot ? null : seatOf(e.seat); if (h) h.say(Math.min(5, 0.8 + e.text.length * 0.05), dmAv?.h.root.visible ? dmAv.h : seatOf(6)); } // (the mouth, and the look to the DM; dnd-gaze.js)
  });
  net.on('dnd-sat', m => {
    if (!m.ok) { if (m.why) ui.toast(m.why, 3200); return; }
    const seat = seatObjs.find(s => s.dnd === m.seat); if (!seat) return;
    S.seat = m.seat;
    open('seat'); // (first: upright, the view is fitted above the panel, and the shots below are framed for it)
    aimSeat(seat);
    store.sit(seat);
    if (m.handoff) { setTimeout(() => { if (S.seat === m.seat) openModal('handoff', m.handoff); }, 200); return; }
    if (S.seat !== 6 && !myChar() && !S.you.char) setTimeout(() => { if (S.seat >= 0 && !myChar()) openModal('char'); }, 250);
  });
  // where your eyes start, turned to the DM with his face in the clear part of the view (lookAtDm), and the three-quarter shot
  // for the view toggle while you sit; again when a phone turns
  function aimSeat(seat) {
    if (seat.dm) { seat.fpYaw = undefined; seat.fpPitch = 0.35; } // (the DM's own chair: down the table at the players)
    else { const v = lookAtDm(seat); seat.fpYaw = v.yaw; seat.fpPitch = v.pitch; }
    seat.tq = threeQuarter(seat);
  }
  net.on('dnd-sfx', m => { if (m && m.ev === 'monster') audio.backroom?.onEvent?.('monster', { name: m.name, boss: !!m.boss }); });
  net.on('dnd-you', m => { S.you.char = m.char; if (S.open) renderCard(); });
  net.on('dnd-assist-reply', m => reply(m.tool ? 'Done' : 'Claude', m.a));
  const hello = () => { if (S.hello) return; S.hello = true; net.send({ t: 'dnd-hello' }); };
  net.on?.('welcome', () => { S.hello = false; }); // (a reconnect: ask again when near)

  // ---------------------------------------------------------------- the town folk and the Dungeon Master in 3D
  // The town folk walk in through the door to their chairs and talk when the DM voices them. Claude sits in the DM's chair as
  // the Dungeon Master whenever it runs the table (npc-looks.js 'dm'), hidden when someone takes the chair.
  const normN = x => String(x || '').trim().toLowerCase();
  const T3 = BP.table, tableP = { y: T3.top, minX: T3.x - T3.w / 2, maxX: T3.x + T3.w / 2, minZ: T3.z - T3.d / 2, maxZ: T3.z + T3.d / 2 };
  const botPeople = new Map(); // seat -> { h, tag, id, seat (the seat object), seatNo, path, along, talkUntil }
  // who sits at seat i, as a Human (you, another player, a town folk), for the looks round the table (dnd-gaze.js)
  const seatOf = i => { const st = S.s?.seats?.[i]; if (!st) return null; if (st.bot) return botPeople.get(i)?.h || null; return st.sid === net.sid ? player.character : ctx.remotes?.map?.get(st.sid)?.ch || null; };
  const tg = createTableGaze({ dmSeat, tableTop: T3.top, seatOf, dice });
  const bubble = { sc: null, text: '', inner: null, item: null, fresh: false };
  const heard = { who: '', until: 0 }; // (dnd-said) the last speaker read aloud and when their words end (the tag once a run)
  let firstState = true;
  function walkIn(seat) { // the door, the lane, behind the chair, the chair (never across the table)
    const D = BP.door, dx = (D.x0 + D.x1) / 2, lane = T3.x - T3.w / 2 - 1.0, front = D.z + 0.55;
    const behind = [seat.x - Math.sin(seat.yaw) * 0.5, seat.z - Math.cos(seat.yaw) * 0.5];
    const OD = store.plan.outDoor;
    if (OD && store.open === false) { // after the shop shuts they come in by the back door: along the back lane, round the west end
      const bx = (OD.x0 + OD.x1) / 2, backLane = room.maxZ - 0.6;
      const pts = [[bx, OD.z + 0.7], [bx, backLane]];
      if (seat.z > T3.z + 0.1) pts.push([behind[0], backLane]);
      else pts.push([lane, backLane], [lane, behind[1]]);
      pts.push(behind, [seat.x, seat.z]);
      return pts;
    }
    const pts = [[dx, D.z - 0.6], [dx, front]];
    if (seat.z < T3.z - 0.1) pts.push([behind[0], front]);
    else { pts.push([lane, front], [lane, behind[1]]); }
    pts.push(behind, [seat.x, seat.z]);
    return pts;
  }
  function syncBots() {
    const want = new Map();
    for (const st of (S.s?.seats || []).slice(0, 6)) if (st?.bot && NPCS[st.bot]) want.set(st.seat, st.bot);
    for (const [seatNo, b] of botPeople) if (want.get(seatNo) !== b.id) { inside.remove(b.h.root); b.tag.remove?.(); b.h.dispose?.(); botPeople.delete(seatNo); }
    for (const [seatNo, id] of want) {
      if (botPeople.has(seatNo)) continue;
      const n = NPCS[id], seat = seatObjs.find(q => q.dnd === seatNo); if (!seat) continue;
      const h = new Human({ ...lookOf(id, n.look) }); h.root.name = 'dnd-bot-' + id; inside.add(h.root);
      const tag = ui.nameTag(h.root, tagOf(id, n.name), '#ffffff'); tag.max = 12; tag.fade = 8;
      const path = walkIn(seat), b = { h, tag, id, seat, seatNo, path, along: firstState ? 1e9 : 0, talkUntil: 0 };
      botPeople.set(seatNo, b);
    }
    firstState = false;
  }
  const BOT_WALK = 1.15; // m/s
  function stepBots(dt, now) {
    for (const b of botPeople.values()) {
      const h = b.h, P = b.path, r = h.root;
      let left = b.along, moving = false;
      for (let i = 1; i < P.length; i++) {
        const [ax, az] = P[i - 1], [bx, bz] = P[i], seg = Math.hypot(bx - ax, bz - az);
        if (left <= seg) { const q = seg ? left / seg : 1; r.position.set(ax + (bx - ax) * q, b.seat.y, az + (bz - az) * q); r.rotation.y = Math.atan2(bx - ax, bz - az); moving = true; break; }
        left -= seg;
      }
      if (moving && inside.visible) { b.along += BOT_WALK * dt; h.params.seatY = 0; h.params.table = null; h.update(dt, now, BOT_WALK, 'walk'); continue; }
      r.position.set(b.seat.x, b.seat.y, b.seat.z); r.rotation.y = b.seat.yaw;
      h.params.seatY = b.seat.seatY; h.params.table = tableP;
      if (inside.visible) h.update(dt, now, 0, now < b.talkUntil ? 'talk' : 'sit');
    }
  }
  let dmAv = null;
  function dmAvatar() {
    if (dmAv) return dmAv;
    const n = NPCS.dm, baked = mpfbLoaded('dm');
    if (baked) {
      // (mpfb-in-game) the MPFB Dungeon Master: his own seated clips (dm_sit, gesture, read, dice, hood_up / hood_down), the hood
      // down until a game runs, the book while he reads; the room's light sinks a little more with the hood
      const h = new BakedCharacter(baked.day, { name: 'dnd-dm-avatar' }); h.root.name = 'dnd-dm-avatar'; inside.add(h.root);
      const tag = ui.nameTag(h.root, tagOf('dm', n.name), '#e3b04a'); tag.max = 14; tag.fade = 9;
      h.root.position.set(dmSeat.x, dmSeat.y, dmSeat.z); h.root.rotation.y = dmSeat.yaw;
      const sitClip = h.data.clips.dm_sit; h.inner.position.y = -(h.data.floor || 0) + (sitClip && sitClip.seat !== undefined ? dmSeat.seatY - sitClip.seat : 0);
      h.items({ hood_down: true, hood_up: false, book: false });
      h.play('dm_sit', { fade: 0 });
      dmAv = { h, tag, anim: 'sit', handAt: 0, baked: true, hood: false, hoodK: 0, hoodClip: null, lastDie: 0, gestureAt: 0, readUntil: 0 };
      return dmAv;
    }
    const h = new Human({ ...lookOf('dm', n.look) }); h.root.name = 'dnd-dm-avatar'; inside.add(h.root);
    const tag = ui.nameTag(h.root, tagOf('dm', n.name), '#e3b04a'); tag.max = 14; tag.fade = 9;
    h.root.position.set(dmSeat.x, dmSeat.y, dmSeat.z); h.root.rotation.y = dmSeat.yaw; h.params.seatY = dmSeat.seatY;
    // his forearms on his armchair's arms (the table's end is out of reach from his chair)
    const sc = h.root.scale.y || 1; h.params.chair = { armX: DM_CHAIR.armX / sc, elbowDrop: DM_CHAIR.elbowDrop, armY: DM_CHAIR.armY / sc };
    dmAv = { h, tag, anim: 'sit', handAt: 0 };
    return dmAv;
  }
  function stepDm(dt, now) {
    const s = S.s, on = !!s && s.dm?.mode === 'claude' && !s.seats?.[6];
    if (!on) { if (dmAv) dmAv.h.root.visible = false; return; }
    if (!inside.visible && !dmAv) return; // (built the first time anyone near sees him)
    const a = dmAvatar(), h = a.h; h.root.visible = true;
    { const off = S.open === 'seat'; if (a.tagOff !== off) { a.tagOff = off; a.tag.node.style.visibility = off ? 'hidden' : ''; } } // (seated, the party strip's chip says "DM: Claude": his tag over the table would say it twice)
    if (!inside.visible) return;
    const talking = dmSpeaking(), check = (s.pending || []).length > 0;
    if (a.baked) { stepBakedDm(a, s, dt, now, talking, check); return; }
    let anim = 'sit';
    if (talking) { h.say(0.35); anim = now % 7 < 1.3 ? 'point' : 'talk'; }       // (narrating: talking, a hand raised now and then)
    else if (check) anim = 'look';                                               // (a check: leaning in to see the roll)
    else if (s.dm.busy) anim = 'look';                                           // (thinking: over his notes)
    else anim = Math.floor(now / 6) % 3 === 1 ? 'look' : 'sit';                 // (idle: his notes, the table)
    h.params.lean = check ? 0.45 : 0;
    tg.dm(h, s, now, talking); // (where he looks: dnd-gaze.js)
    a.anim = anim;
    h.update(dt, now, 0, anim);
  }

  // (mpfb-in-game) the baked DM's clips by what the table is doing: the hood goes up when the game begins (hood_up once, the meshes
  // swapped at the clip's switch frame, the face in shadow and the eyes alight) and down when it ends; narrating he sits and gestures
  // now and then (the talk face clip moves his mouth); a die of his thrown plays the roll; a check pending or thinking, he reads his
  // book; idle, a glance at the book every so often. Where he looks is dnd-gaze.js's, as before.
  function stepBakedDm(a, s, dt, now, talking, check) {
    const h = a.h, hoodUp = gameOn(s);
    const cur = h.current, inHood = cur === 'hood_up' || cur === 'hood_down';
    if (inHood) {
      const c = h.data.clips[cur], f = h.currentAction ? h.currentAction.time * h.J.fps : 0;
      if (c.switch !== undefined && f >= c.switch && a.hood !== (cur === 'hood_up')) { a.hood = cur === 'hood_up'; h.items({ hood_down: !a.hood, hood_up: a.hood, book: false }); }
    } else if (hoodUp !== a.hood && h.has(hoodUp ? 'hood_up' : 'hood_down')) {
      h.play(hoodUp ? 'hood_up' : 'hood_down', { then: 'dm_sit' });
    } else if (hoodUp !== a.hood) { a.hood = hoodUp; h.items({ hood_down: !hoodUp, hood_up: hoodUp, book: false }); }
    a.hoodK += ((a.hood ? 1 : 0) - a.hoodK) * Math.min(1, dt / 0.6);
    h.U.uShadow.value = a.hoodK; h.U.uGlow.value = a.hoodK;
    // a die of his: the roll
    const die = dice.find(d => d.m.visible && d.seat === 6 && !d.settled && d.at > a.lastDie);
    if (die && !inHood && h.has('dice')) { a.lastDie = die.at; h.play('dice', { then: 'dm_sit' }); }
    let anim = 'sit';
    if (talking) {
      h.say(0.35);
      if (!inHood && cur === 'dm_sit' && now - a.gestureAt > 5.5 && h.has('gesture')) { a.gestureAt = now; h.play('gesture', { then: 'dm_sit' }); }
      anim = cur === 'gesture' ? 'point' : 'talk';
    } else if (check || s.dm.busy) anim = 'look';
    else anim = Math.floor(now / 6) % 3 === 1 ? 'look' : 'sit';
    const read = anim === 'look' && !talking;
    if (!inHood && cur !== 'gesture' && cur !== 'dice') {
      if (read && cur !== 'read' && h.has('read')) h.play('read');
      else if (!read && cur !== 'dm_sit') h.play('dm_sit');
    }
    const book = h.current === 'read';
    if (book !== a.book) { a.book = book; h.items({ hood_down: !a.hood, hood_up: a.hood, book }); }
    tg.dm(h, s, now, talking);
    a.anim = anim;
    h.update(dt, now, 0);
  }

  // ---------------------------------------------------------------- where you are
  const inRoom = (x, y, z) => x > room.minX && x < room.maxX && z > room.minZ - 0.05 && z < room.maxZ && y < LY - 1;
  const seatNear = (px, pz) => { let best = null, bd = 0.75; for (const s of seatObjs) { const d = Math.hypot(px - s.x, pz - s.z); if (d < bd) { bd = d; best = s; } } return best; };
  let watching = false;
  { const prev = ctx.placeAt; ctx.placeAt = (x, z) => (inRoom(x, player.pos.y, z) ? 'The Back Room' : prev?.(x, z) || null); } // (the place pill: not "Game Store Loft" under the loft)

  return {
    name: 'dnd',
    get lighting() { return roomLight.state; },
    get state() { return S.s; }, get seat() { return S.seat; }, get log() { return S.log; }, get spoken() { return S.spoken; }, get replies() { return S.replies; }, get open() { return S.open; },
    plan: BP, seats: seatObjs, map: mapMesh, tent, dice: dice.map(d => d.m), get voiceOn() { return voiceOn; },
    overlay: root,
    // (test hooks) upright or sideways, and the part of the screen the 3D view is fitted into (px from the top) when it is
    get layout() { return { portrait: root.classList.contains('portrait'), fit: fit.on ? { top: 0, bottom: fit.v, aspect: camera.aspect } : null, clip: ctx.ink?.clip ?? 1 }; },
    // (test hooks) the dice's throws and what they show, the listening, the speech, the scrollers, the people
    get diceInfo() { return dice.map(d => ({ visible: d.m.visible, settled: d.settled, x: d.m.position.x, y: d.m.position.y, z: d.m.position.z, value: d.value, shown: d.die ? shownBy(d.die, d.m.quaternion) : 0, restY: d.path ? d.path.to[1] : 0, ground: d.path ? d.path.ground : 0, glow: d.lit, sides: d.die ? d.die.sides : 0, seat: d.seat, id: d.id, t: d.t, inTray: !!d.path?.inTray, bounced: !!d.path?.bounced })); },
    get listen() { return { state: L.state, on: !!L.rec, sent: L.sent.slice(), want: wantListen(), buf: L.buf }; },
    get speech() { return { left: speech.left, speaking: dmSpeaking(), utterances: S.utterances.slice(), voice: voice ? voice.name : null, level: hearLevel() }; },
    speak, hearLevel, voiceScore, partsOf: t => partsOf(smooth(t)),
    get dmVoice() { return { who: voiceWho, ...dmv.info }; }, setVoiceWho: w => setWho(w), speechAt, // (dm-voice test hooks)
    get scroll() { return { narr: { active: nsc.active, user: nsc.user, top: narr.scrollTop, max: narr.scrollHeight - narr.clientHeight }, bubble: bubble.inner && bubble.sc ? { active: bubble.sc.active, top: bubble.inner.scrollTop, max: bubble.inner.scrollHeight - bubble.inner.clientHeight } : null }; },
    get bots() { return [...botPeople.values()].map(b => ({ id: b.id, seat: b.seatNo, x: b.h.root.position.x, z: b.h.root.position.z, visible: b.h.root.visible, sitting: b.h.params.seatY > 0 })); },
    get dmAvatar() { return dmAv ? { visible: dmAv.h.root.visible, anim: dmAv.anim, x: dmAv.h.root.position.x, z: dmAv.h.root.position.z, look: 'dm', baked: !!dmAv.baked, clip: dmAv.baked ? dmAv.h.current : null, hood: dmAv.baked ? dmAv.hood : null, hoodK: dmAv.baked ? +dmAv.hoodK.toFixed(3) : null, book: dmAv.baked ? !!dmAv.book : null, face: dmAv.baked ? dmAv.h.face.clip : null } : null; },
    // (test hook) as if the last player's line were long past (dnd-gaze.js ANSWER_S): the DM's next words go to the whole table
    forgetLine() { tg.said(-1); },
    // (test hook) the looks round the table (gaze.js lookInfo): the DM's and each seat's, with whom each looks at by seat (-1 the DM, -2 a thing)
    get looks() {
      const who = t => (t === dmAv?.h ? -1 : t && t.headC ? [0, 1, 2, 3, 4, 5, 6].find(i => seatOf(i) === t) ?? -3 : t ? -2 : null);
      const one = h => (h ? { ...lookInfo(h), at: who(h.attn.tgt) } : null);
      return { dm: dmAv && dmAv.h.root.visible ? one(dmAv.h) : null, seats: [0, 1, 2, 3, 4, 5].map(i => one(seatOf(i))), notes: tg.notes };
    },
    get tablePeople() { return { dm: dmAv ? dmAv.h : null, seats: [0, 1, 2, 3, 4, 5].map(seatOf) }; }, // (test hook: the Humans themselves)
    // (test hook) where the DM's face is on the screen, as fractions from the top left (z > 1: behind the camera)
    dmOnScreen() { const p = dmFace(_fv).project(camera); return { x: (p.x + 1) / 2, y: (1 - p.y) / 2, z: p.z }; },
    bodies() { const out = []; for (const b of botPeople.values()) out.push({ x: b.h.root.position.x, z: b.h.root.position.z, r: 0.25 }); return out; },
    update(dt, now) {
      const p = player.pos;
      const near = Math.abs(p.x - BP.table.x) < 14 && Math.abs(p.z - BP.table.z) < 16;
      if (near) hello();
      stepDice(dt);
      dmv.step(); // (dm-voice: the room's hearing as you move)
      const tNow = typeof now === 'number' ? now : performance.now() / 1000;
      if (botPeople.size) stepBots(dt, tNow);
      stepDm(dt, tNow);
      tg.step(tNow); // (a rolling die has every eye at the table on it)
      roomLight.update(dt, S.s, dmAv && dmAv.baked ? dmAv.hoodK : 0);
      if (S.open) {
        nsc.follow(speechAt(nscText)); nsc.step(dt);
        if (placeParts()) { fitView(true); const seat = seatObjs.find(q => q.dnd === S.seat); if (seat && S.open === 'seat') seat.tq = threeQuarter(seat); } // (a phone turned: the layout, the view and the shot follow)
        else fitView();
        if (!setCard.hidden) paintView();
        tidy(tNow);
      }
      if (bubble.sc) { if (!bubble.inner.isConnected) bubble.sc = null; else { if (bubble.fresh) { bubble.fresh = false; bubble.sc.show(0); } bubble.sc.follow(speechAt(bubble.text)); bubble.sc.step(dt); } }
      stepListen();
      if (charging) charging.btn.style.setProperty('--pow', (1 - (1 - Math.min(1, (performance.now() - charging.t0) / 1000 / CHARGE)) ** 2).toFixed(3));
      // got up (move, E, Space, the Stand up button) or something else took you over
      if (S.seat >= 0 && store.sitting?.dnd !== S.seat) { net.send({ t: 'dnd-stand' }); S.seat = -1; close(); }
      const w = S.seat < 0 && inRoom(p.x, p.y, p.z);
      if (w !== watching) { watching = w; net.send({ t: 'dnd-watch', on: w }); if (w) open('watch'); else if (S.open === 'watch') close(); }
    },
    target(px, pz) {
      if (S.seat >= 0 || player.pos.y > LY - 1 || !inRoom(px, player.pos.y, pz)) return null;
      const s = seatNear(px, pz); if (!s) return null;
      if (ctx.features?.find(f => f.name === 'table-games')?.state?.tables?.has('store:backroom')) return { hint: 'D&D night: a board game is on the table', prio: 6, run: () => ui.toast('A board game is set out on this table. Put it away first, then D&D night can start.', 3200) }; // (lib/back-room.js: one thing on the table at a time)
      const st = S.s?.seats?.[s.dnd];
      if (st && st.bot) return { hint: `E  Take ${st.name}'s seat`, prio: 7, run: () => net.send({ t: 'dnd-sit', seat: s.dnd }) }; // (a town folk gives up the chair)
      if (st && st.sid !== net.sid) return { hint: `${st.char?.name || st.name} sits here`, prio: 7, run: () => ui.toast(`${st.name} is sitting there.`, 2000) };
      if (s.dm) return { hint: S.you.host ? "E  Take the DM's chair" : "E  The DM's chair", prio: 7, run: () => net.send({ t: 'dnd-sit', seat: s.dnd }) };
      return { hint: 'E  Join D&D night', prio: 7, run: () => net.send({ t: 'dnd-sit', seat: s.dnd }) };
    },
    onKey(code) {
      if (S.open === 'seat' && code === 'Enter' && document.activeElement !== input) { input.focus(); return true; }
      if (code === 'Escape' && (root.classList.contains('tray-open') || root.classList.contains('tools-open') || !setCard.hidden)) { trayOpen(false); toolsOpen(false); setOpen(false); return true; }
      if (code === 'Escape' && root.classList.contains('sheet-open') && modal.hidden) { sheetOpen(false); return true; }
      if (code === 'Escape' && root.classList.contains('reading')) { readOpen(false); return true; }
      if (!modal.hidden && code === 'Escape') { closeModal(); return true; }
      return false;
    },
    help: [[['E'], 'D&D night: sit at the table in the game store\'s back room']],
  };
}
