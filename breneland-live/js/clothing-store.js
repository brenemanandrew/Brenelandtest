// Peak Threads, the clothing store (clothing-store, Andrew 2026-11-09: like Animal Crossing's: "several random outfit pieces per week
// that players can buy and change into"). The week's seven pieces (clothing-catalog.js stockOf, the same for everyone, rolling over
// Sunday night Eastern) hang on the racks with a price tag in fish; walk up, E or tap: a card shows the piece on YOU, its price, Try on
// (the fitting room: you stand before the mirror and see yourself in it, turning with A / D or the buttons) and Buy (server-checked:
// lib/clothing.js: enough fish, in stock this week, not owned yet, standing in the shop). Bought is yours for good and worn at once;
// the wardrobe at home (wardrobe.js) changes you later.
//   The shop's room is the strip mall's Peak Threads (strip-mall-model.js anchors rack0-5, counter, mirror, mannequin0-3). Every
//   display sits where it physically can (threads-placement, Andrew 2026-11-10: "glasses floating in the air, skirts doing the
//   same"): tops, dresses and backpacks hang by the hanger model on a face-out arm from the rack's rail, the hanger's hook round
//   the arm's tube; bottoms hang by the waistband over the hanger's bar with a clip at each side; a dress gets the body's own skirt
//   under its bodice; hats, glasses and scarves sit on a BUST (the game's own head on a stubby neck) on a floor stand before the rack;
//   shoes stand on a low riser on the floor; the seventh piece stands on the counter (a bust for a hat or glasses, shoes on the top)
//   with a tent card. The window forms are the model's dress forms built to the game's body (plan `form`: chest and head anchors), so
//   the week's tops, dresses, hats and extras fit them as they fit a player. The catalogue's deco pieces (clothing-catalog.js `deco`:
//   designs not up to the polished bar, not for sale) dress the back form by the fitting room and the round racks' far sides, no tags.
//   Test hooks: feature.state, .displays, .card (open piece), .fitting, .tryOn(id), .buy(id), .openCard(id), .close(), .audit()
//   (every displayed piece's support: how it sits, the gap to its support, whether it is on it, its world box), .showWeek(w).
import * as THREE from 'three';
import { loadCss, el } from './util.js';
import { toon } from './toon.js';
import { Batcher } from './batch.js';
import { groundHeight } from './terrain.js';
import { lathe, fullHeadGeo, darker } from './bodies-geo.js';
import { SKIRT_PROFILE, SKIRT_TOP } from './bodies-outfit.js';
import { pieceOf, SLOT_KEY, KIND_NAMES, DECO, stockOf } from './clothing-catalog.js';
import { clothesReady, clothesModel, clothesMaterial, displayPiece, modelMesh, frameHeight, tintedPart } from './clothing-wear.js';
import { ICON, icon, iconBtn, applyLook, previewLook, restoreLook, mirrorTakeover, makeTiles, frameFor } from './clothing-ui.js';
import { peakOpenAt } from './mall-staff-day.js';   // (mall-staff: buying only while Peak Threads is open)

const REACH = 1.9;        // metres from a display the E offers it
const SHOW_DIST = 15;     // the displays are drawn within this of the shop's door (in the shop or on its walkway; not from the game store next door)
// the face-out arm: a chrome tube from the rail's middle (a straight rack; between two of its garments, which hang every 0.23 m) or
// from the round rack's pole, out toward the aisle; the piece hangs 4 cm short of its tip, its back clear of the rail's garments
// (0.21 m deep, their hooks 0.03 more) and of the ring's (0.6 m out to their corners); the hanger model's hook is a 3.6 cm ring
const ARM = { straight: 0.56, round: 0.92 };
const ARM_R = 0.011, ARM_DX = 0.115;
const HOOK_IN = 0.004, HANGER_TIP = 0.148, HANGER_BAR = 0.143, TIP_Y = 0.40; // the hanger model: its ring's inside top, its shoulder tips and its bar under its origin; a top's shoulder (chest frame) that rides the tips
const BUST_SH = 1.32;                          // a floor bust's shoulder line: its head 0.37 higher, so a sun hat's brim clears the rail's garments behind it
const BUST_OUT = { straight: 0.6, round: 1.0 }; // the bust stands this far before the rail (the pole): clear of the garments behind, and of the campfire ring before rack2
const RISER = { out: { straight: 0.5, round: 0.95 }, w: 0.56, d: 0.5, h: 0.12 }; // the shoes' low riser on the floor before the rack (the shoes this far out, the riser 7 cm further: they are longer forward)
const CLEAR = { straight: 0.25, round: 0.61 }; // how far from the rail (the pole) a displayed piece must stay: the rail's garments hang 0.21 deep with 3 cm hooks, the ring's reach 0.6 to their corners
const FX = { rack: '#3a3f47', chrome: '#c9ccd2', brass: '#c9a24a', mann: '#f4f2ea', ink: '#2b2340', shelf: '#8a6240' }; // the fixtures' colours (one vertex-colour draw)
const G = { rod: new THREE.CylinderGeometry(1, 1, 1, 10), ball: new THREE.SphereGeometry(1, 12, 8), box: new THREE.BoxGeometry(1, 1, 1), disc: new THREE.CylinderGeometry(1, 1, 1, 18), torus: new THREE.TorusGeometry(1, 0.03, 5, 28) };

export function createClothingStore(ctx) {
  const { scene, colliders, player, net, ui, audio, input, profile } = ctx;
  loadCss('/css/clothing.css');
  const hud = document.getElementById('hud');
  const state = { week: null, ends: 0, stock: [], owned: [], worn: {}, mall: false, anchors: null };
  const root = new THREE.Group(); root.name = 'peak-threads'; scene.add(root);
  const displays = []; // [{ piece, group, tag, x, z, y }]
  const dressed = [];  // the mannequins' groups
  let batched = null;  // every display's and mannequin's meshes merged per material (the tags stay their own: a texture each)
  const tiles = makeTiles(ctx);
  let spots = null;    // { stands: [{ pos, yaw, rail, counter? }], mirror: { pos, yaw }, fitting: { x, z, yaw } }
  let card = null, fitting = null, cardPiece = null, cardEl = null, barEl = null, dirty = true;

  // ---------------------------------------------------------------- where things are: the mall model's anchors
  async function mallSpots() {
    try {
      const M = await import('./strip-mall-model.js');
      const racks = [0, 1, 2, 3, 4, 5].map(i => M.stripMallAnchor('rack' + i)).filter(Boolean);
      const counter = M.stripMallAnchor('counter'), mirror = M.stripMallAnchor('mirror');
      const manns = [0, 1, 2, 3].map(i => M.stripMallAnchor('mannequin' + i)).filter(Boolean);
      if (!racks.length || !mirror) return null;
      // (turned to the door: the face-out arms point at whoever comes in; a round rack's turned a further 18 degrees, so its arm leaves
      // the ring between two of its ten garments)
      const stands = racks.map(a => ({ pos: a.pos.slice(), yaw: (a.yaw || 0) + Math.PI + (a.kind === 'round' ? Math.PI / 10 : 0), rail: a.h || 1.5, kind: a.kind, w: a.w || 1.2 }));
      if (counter) stands.push({ pos: [counter.pos[0] + 1.2, counter.pos[1], counter.pos[2]], yaw: Math.PI, rail: 0, counter: true });
      // the fitting spot: 1.8 m before the mirror, a little toward the east wall (clear of the rack beside it); the camera at the glass
      const f = { x: mirror.pos[0] + Math.sin(mirror.yaw) * 1.8 + 0.3, z: mirror.pos[2] + Math.cos(mirror.yaw) * 1.8, yaw: mirror.yaw + Math.PI };
      const door = M.stripMallAnchor('door-clothes');
      // the forms: the model's anchors say where their chest frame and head centre are over the plinth top (plan `form`)
      return { door: door ? [door.pos[0], door.pos[2]] : [stands[0].pos[0], stands[0].pos[2] - 3], stands, mannequins: manns.map(a => ({ pos: a.pos.slice(), yaw: a.yaw || 0, chest: a.chest ?? 1.19, head: a.head ?? 2.0304 })), mirror: { pos: mirror.pos.slice(), yaw: mirror.yaw, w: mirror.w, h: mirror.h }, fitting: f, floorY: racks[0].pos[1], stub: false };
    } catch { return null; }
  }
  async function placeSpots() { spots = await mallSpots(); dirty = true; }

  // ---------------------------------------------------------------- the displays: the week's pieces on the stands with their tags
  const TAG_CACHE = new Map();
  function tagTexture(price, owned) {
    const key = owned ? 'owned' : String(price);
    let t = TAG_CACHE.get(key);
    if (t) return t;
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 96;
    const g = cv.getContext('2d');
    g.fillStyle = '#fbf6e8'; g.strokeStyle = '#2b2340'; g.lineWidth = 6;
    g.beginPath(); g.roundRect(6, 6, 148, 84, 14); g.fill(); g.stroke();
    g.fillStyle = '#2b2340'; g.beginPath(); g.arc(80, 14, 5, 0, Math.PI * 2); g.fill();
    if (owned) {
      g.strokeStyle = '#3f7a4f'; g.lineWidth = 10; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(50, 52); g.lineTo(72, 72); g.lineTo(112, 30); g.stroke();
    } else {
      // a fish (the lobby's currency) and the price
      g.fillStyle = '#7fc4f0'; g.strokeStyle = '#2b2340'; g.lineWidth = 4; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(18, 52); g.quadraticCurveTo(36, 28, 58, 40); g.quadraticCurveTo(66, 46, 70, 52); g.quadraticCurveTo(62, 62, 50, 66); g.quadraticCurveTo(34, 70, 18, 52); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(70, 52); g.lineTo(84, 40); g.lineTo(84, 64); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#2b2340'; g.beginPath(); g.arc(32, 48, 3, 0, Math.PI * 2); g.fill();
      g.font = '800 44px Fredoka, Nunito, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#2b2340';
      g.fillText(String(price), 94, 54);
    }
    t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    TAG_CACHE.set(key, t);
    return t;
  }
  const TAG_GEO = new THREE.PlaneGeometry(0.2, 0.12);
  function tagMesh(price, owned) {
    const m = new THREE.Mesh(TAG_GEO, new THREE.MeshBasicMaterial({ map: tagTexture(price, owned), transparent: true, side: THREE.DoubleSide }));
    m.userData.noMerge = true; return m;
  }
  // ---------------------------------------------------------------- the fixtures the pieces hang on or sit on
  // (code-built here, merged into one vertex-colour draw with the displays' batch: `userData.vc` is the colour the batch bakes)
  const dims = () => clothesModel().ref.dims;
  const fx = (parent, geo, color, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0 } = {}) => {
    const m = new THREE.Mesh(geo, toon(color)); m.userData.vc = color; m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m;
  };
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _box = new THREE.Box3();
  const rodBetween = (parent, a, b, r, color) => { // a round rod from a to b (a tag's string)
    _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]);
    const m = fx(parent, G.rod, color, { sx: r, sy: _a.distanceTo(_b), sz: r });
    m.position.lerpVectors(_a, _b, 0.5); m.quaternion.setFromUnitVectors(_up, _b.sub(_a).normalize()); return m;
  };
  const partBox = (piece, frame) => { const geo = tintedPart(piece.model, frame, piece.cols); if (!geo) return null; if (!geo.boundingBox) geo.computeBoundingBox(); return geo.boundingBox; };
  const _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4();
  const pieceBox = (group, frame = null) => { // the piece's own meshes (the clothes sheet's, and a dress's code skirt), as a world box (or in `frame`'s own frame)
    group.updateMatrixWorld(true); const out = new THREE.Box3();
    if (frame) _inv.copy(frame.matrixWorld).invert();
    group.traverse(m => { if (m.isMesh && !m.userData.fixture && (m.material === clothesMaterial() || m.userData.piece)) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); _box.copy(m.geometry.boundingBox).applyMatrix4(frame ? _rel.multiplyMatrices(_inv, m.matrixWorld) : m.matrixWorld); out.union(_box); } });
    return out;
  };
  // a bust: the game's own head (the clothes were built on it, bodies-geo fullHeadGeo) on a stubby neck over a shoulder cap, so a hat,
  // glasses or a scarf sits on it as on a player; `sh` is the shoulder line in the parent's frame. Returns the head's centre height
  function bust(parent, x, z, sh) {
    const d = dims(), hc = sh + d.neckY + d.headY;
    fx(parent, G.ball, FX.mann, { x, y: sh - 0.03, z, sx: 0.25, sy: 0.06, sz: 0.17 });
    fx(parent, G.rod, FX.mann, { x, y: sh + 0.04, z, sx: 0.1, sy: 0.16, sz: 0.1 });
    fx(parent, fullHeadGeo('round'), FX.mann, { x, y: hc, z });
    return hc;
  }
  function bustStand(parent, x, z, sh, base = 0.2) { // on the floor or the counter: a weighted disc, a chrome pole up into the cap, the bust
    fx(parent, G.disc, FX.rack, { x, y: 0.015, z, sx: base, sy: 0.03, sz: base });
    fx(parent, G.rod, FX.chrome, { x, y: sh / 2, z, sx: 0.018, sy: sh - 0.03, sz: 0.018 });
    return bust(parent, x, z, sh);
  }
  // a hat or glasses are on a head whose centre is `hc` when the piece's low edge (a hat's rim, the glasses' lower rims) lies within the
  // head's height (a cap sits on the top third, a trapper's flaps reach the jaw) and it is centred on the head
  // and glasses when they hold the face's front (`face`: 0.3 before the centre)
  const onHeadAt = (box, hc, face, hat) => { const d = dims(); return hat ? box.min.y > hc.y - d.ry && box.min.y < hc.y + d.ry && Math.abs((box.min.x + box.max.x) / 2 - hc.x) < 0.08 && Math.abs((box.min.z + box.max.z) / 2 - hc.z) < 0.12 : box.containsPoint(face); };
  // a hat, glasses or a scarf on a bust whose head centre is at (x, hc, z): the head frame on the centre (a hat shrunk as on a bald head,
  // clothing-wear wearHead's way: no hair under it), the scarf's chest frame 0.47 under the shoulder line
  function onBust(parent, piece, x, hc, z) {
    const d = dims(), head = piece.kind === 'hat' || piece.where === 'head';
    const body = displayPiece(piece, head ? ['head'] : ['chest']); if (!body) return null;
    body.position.set(x, head ? hc - frameHeight('head') : hc - d.headY - d.neckY - d.torsoTop - frameHeight('chest'), z);
    if (piece.kind === 'hat') { const k = 1 / clothesModel().ref.hairEnv; body.children.forEach(m => m.scale.set(k, 0.5 + 0.5 * k, k)); }
    parent.add(body); return body;
  }
  // a dress's skirt, the body's own (bodies-outfit.js buildSkirt): from SKIRT_TOP over the hips frame, 0.3 m, in the dress's colour
  // with a darker hem band; a second skin turned inside out, since a hanging skirt is seen from below
  function skirt(body, piece) {
    const d = dims(), rx = d.hipX + 0.16, rz = d.dT + 0.06, len = 0.3, top = d.hipsY + SKIRT_TOP, col = piece.cols[0];
    for (const s of [1, -1]) fx(body, lathe('pt-skirt', SKIRT_PROFILE, 24), col, { y: top - len, sx: rx * s, sy: len, sz: rz }).userData.piece = true;
    fx(body, G.torus, darker(col, 0.85), { y: top - len, sx: rx * 1.42, sy: rz * 1.42, sz: 1, rx: Math.PI / 2 }).userData.piece = true;
  }
  // the face-out arm from the rail (the pole) at local x `ax`, `reach` toward the aisle: a clamp block, the tube, a brass tip
  function armOn(parent, ax, rail, reach) {
    fx(parent, G.box, FX.rack, { x: ax, y: rail, z: 0, sx: 0.05, sy: 0.05, sz: 0.05 });
    fx(parent, G.rod, FX.chrome, { x: ax, y: rail, z: reach / 2, sx: ARM_R, sy: reach + 0.02, sz: ARM_R, rx: Math.PI / 2 });
    fx(parent, G.ball, FX.brass, { x: ax, y: rail, z: reach + 0.012, sx: 0.022, sy: 0.022, sz: 0.022 });
  }
  // a piece on the hanger model, its hook's ring round the arm's tube at (ax, rail, hz): a top, a dress or a backpack by the shoulders
  // over the hanger's tips, pants and shorts by the waistband over its bar with a clip at each side. Returns { body, how, ...support }
  function hangOnArm(parent, piece, ax, rail, hz) {
    const d = dims(), hangerY = rail + ARM_R + HOOK_IN;
    const h = modelMesh('hanger'); if (h) { h.position.set(ax, hangerY, hz); h.userData.fixture = true; parent.add(h); }
    const dress = piece.kind === 'bot' && piece.legs === 'dress';
    if (piece.kind === 'bot' && !dress) {
      const hips = partBox(piece, 'hips'), body = displayPiece(piece); if (!body) return null;
      const barY = hangerY - HANGER_BAR;
      body.position.set(ax, barY + 0.012 - hips.max.y - d.hipsY, hz); parent.add(body);
      for (const s of [-1, 1]) fx(parent, G.box, FX.ink, { x: ax + s * (hips.max.x - 0.005), y: barY, z: hz, sx: 0.035, sy: 0.05, sz: 0.03 });
      return { body, how: 'clip', hangerY, barY, waist: barY + 0.012 };
    }
    const body = displayPiece(piece, ['chest']); if (!body) return null;
    body.position.set(ax, hangerY - HANGER_TIP - TIP_Y - frameHeight('chest'), hz);
    if (piece.model === 'backpack') body.rotation.y = Math.PI; // (the pack toward the aisle, the straps over the hanger's shoulders toward the rail)
    if (dress) skirt(body, piece);
    parent.add(body);
    return { body, how: 'arm', hangerY, tipY: hangerY - HANGER_TIP };
  }
  function tagOn(parent, piece, from, top) { // a price tag (a tick once yours) hung by a string from `from` to the tag's top edge at `top`
    const tag = tagMesh(piece.price, state.owned.includes(piece.id)); tag.position.set(top[0], top[1] - 0.06, top[2]); parent.add(tag);
    rodBetween(parent, from, top, 0.003, FX.ink); return tag;
  }
  function tentCard(parent, piece, x, y, z) { // a price card standing on a top at (x, y, z), leaning back, its bottom edge on the surface
    const lean = 0.4, tag = tagMesh(piece.price, state.owned.includes(piece.id));
    tag.position.set(x, y + 0.06 * Math.cos(lean), z - 0.06 * Math.sin(lean)); tag.rotation.x = -lean; parent.add(tag); return tag;
  }

  // ---------------------------------------------------------------- a piece at a stand (a rack or the counter), where it physically sits
  // Returns the display: { piece, group, tag, x, z, y (the piece's world spot, for the E), at, stand, deco, audit }. The audit says how
  // the piece is held (`how`), the gap between its supporting point and its support (hung: the hanger's ring over the tube; standing:
  // its lowest point over the top it stands on), whether it is on its support (`on`) and its world box, for clothing-store-test
  function placeDisplay(piece, s, deco = false) {
    const [x, y, z] = s.pos, rail = s.counter ? 0 : s.rail, kind = piece.kind, d = dims(), footY = d.hipsY - d.Lt - d.Ls;
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = s.yaw;
    const onHead = kind === 'hat' || (kind === 'acc' && piece.where === 'head'), scarf = piece.model === 'scarf';
    let body = null, tag = null, how = '', at = [0, 1, 0], gap = 0, on = true, head = null, top = null;
    const checkBust = (box, hcW, faceW) => onHead ? onHeadAt(box, hcW, faceW, kind === 'hat') : box.min.y < hcW.y - d.headY - d.neckY && box.max.y > hcW.y - d.headY - d.neckY - 0.1;
    if (s.counter) {
      const fb = kind === 'shoe' ? partBox(piece, 'foot') : null, cb = partBox(piece, 'chest');
      if (onHead || scarf || kind === 'top' || kind === 'bot') { // a bust (tall enough for a hem, were a top or a dress ever the week's small piece)
        const sh = scarf ? 0.46 : kind === 'top' ? 0.64 : kind === 'bot' ? 0.9 : 0.2, hc = bustStand(g, 0, 0.05, sh, 0.12);
        body = onBust(g, piece, 0, hc, 0.05); if (kind === 'bot' && body) skirt(body, piece);
        how = 'counter-bust'; at = [0, hc, 0.05]; head = [0, hc, 0.05];
      } else if (kind === 'shoe') { body = displayPiece(piece); body.position.set(0, 0.002 - footY - fb.min.y, 0.05); body.rotation.y = -0.4; how = 'counter'; at = [0, 0.15, 0.05]; top = 0; g.add(body); }
      else { body = displayPiece(piece, ['chest']); body.position.set(0, 0.002 - frameHeight('chest') - cb.min.y, 0.05); body.rotation.y = -0.4; how = 'counter'; at = [0, 0.3, 0.05]; top = 0; g.add(body); }
      if (!deco) tag = tentCard(g, piece, 0.3, 0, 0.16);
    } else if (onHead || scarf) {
      const out = BUST_OUT[s.kind] || BUST_OUT.straight, hc = bustStand(g, 0, out, BUST_SH);
      body = onBust(g, piece, 0, hc, out); how = 'bust'; at = [0, hc, out]; head = [0, hc, out];
      if (!deco) tag = tagOn(g, piece, [0.018, BUST_SH - 0.2, out], [0.1, BUST_SH - 0.3, out + 0.06]);
    } else if (kind === 'shoe') {
      const out = RISER.out[s.kind] || RISER.out.straight, fb = partBox(piece, 'foot');
      fx(g, G.box, FX.shelf, { y: RISER.h / 2, z: out + 0.07, sx: RISER.w, sy: RISER.h, sz: RISER.d });
      body = displayPiece(piece); body.position.set(0, RISER.h + 0.002 - footY - fb.min.y, out); g.add(body); how = 'riser'; at = [0, RISER.h + 0.15, out]; top = RISER.h;
      if (!deco) { tag = tagMesh(piece.price, state.owned.includes(piece.id)); tag.position.set(0.15, RISER.h / 2, out + 0.07 + RISER.d / 2 + 0.003); g.add(tag); }
    } else { // tops, dresses, bottoms, backpacks: the hanger on the face-out arm
      const dress = kind === 'bot' && piece.legs === 'dress';
      const reach = (ARM[s.kind] || ARM.straight) + (dress ? 0.12 : 0), ax = s.kind === 'round' ? 0 : ARM_DX, hz = reach - 0.04; // (a dress 12 cm further: its skirt's hem flares 0.37 m)
      armOn(g, ax, rail, reach);
      const r = hangOnArm(g, piece, ax, rail, hz); body = r && r.body; how = r ? r.how : 'arm'; at = [ax, rail - 0.4, hz];
      if (r) {
        gap = (r.hangerY - HOOK_IN) - (rail + ARM_R); // (the ring's inside top over the tube's top)
        if (r.how === 'clip') { const w = partBox(piece, 'hips'); on = Math.abs((r.waist) - (body.position.y + d.hipsY + w.max.y)) < 0.005; }
        else { g.updateMatrixWorld(true); const box = pieceBox(body); for (const sx of [-1, 1]) if (!box.containsPoint(g.localToWorld(new THREE.Vector3(ax + sx * 0.2, r.tipY, hz)))) on = false; }
      }
      if (!deco) tag = tagOn(g, piece, [ax, rail - ARM_R, hz + 0.05], [ax + 0.13, rail - 0.1, reach + 0.27]);
    }
    root.add(g); g.updateMatrixWorld(true);
    const box = body ? pieceBox(body) : new THREE.Box3(), atW = g.localToWorld(new THREE.Vector3(at[0], at[1], at[2]));
    if (head) { const hcW = g.localToWorld(new THREE.Vector3(head[0], head[1], head[2])), faceW = g.localToWorld(new THREE.Vector3(head[0], head[1], head[2] + 0.3)); on = checkBust(box, hcW, faceW); }
    if (top !== null) { gap = box.min.y - (y + top); on = Math.abs(gap) < 0.03; }
    // clear of the rack's own garments: the piece's box in the stand's frame starts beyond them (the arm points at +z), or hangs over
    // them whole (a bust's hat brim over the rail)
    const lb = s.counter || !body ? null : pieceBox(body, g);
    const clear = lb ? lb.min.z >= (CLEAR[s.kind] || CLEAR.straight) || lb.min.y >= rail + 0.06 : null;
    const audit = { id: piece.id, kind, how, gap: +gap.toFixed(4), on, clear, deco, box: [box.min.toArray(), box.max.toArray()] };
    return { piece, group: g, tag, x: atW.x, z: atW.z, y, at: atW.toArray(), stand: s, deco, audit };
  }
  // the window forms (the model's dress forms, the game's own body: plan `form`, anchors chest / head over the plinth top): the week's
  // tops, dresses, hats and extras go on them as on a player (no bottoms or shoes: a form has a pole for legs). The form by the
  // fitting room wears the deco designs, a different one each week
  const formAudits = [];
  function dressMannequins(stock) {
    for (const g of dressed) root.remove(g);
    dressed.length = 0; formAudits.length = 0;
    if (!spots.mannequins) return;
    const d = dims();
    const tops = stock.filter(p => p.kind === 'top' || (p.kind === 'bot' && p.legs === 'dress')), hats = stock.filter(p => p.kind === 'hat'), accs = stock.filter(p => p.kind === 'acc');
    const dTops = DECO.filter(p => p.kind === 'top' || (p.kind === 'bot' && p.legs === 'dress')), dHats = DECO.filter(p => p.kind === 'hat'), dAccs = DECO.filter(p => p.kind === 'acc');
    spots.mannequins.forEach((m, i) => {
      const g = new THREE.Group(); g.position.set(m.pos[0], m.pos[1], m.pos[2]); g.rotation.y = m.yaw;
      const CH = m.chest, HC = m.head, worn = [];
      const back = i === spots.mannequins.length - 1 && i >= 3;
      for (const list of back ? [dTops, dHats, dAccs] : [tops, hats, accs]) {
        if (!list.length) continue;
        const p = list[(back ? (state.week || 0) + i : i) % list.length];
        if (!back && i >= list.length && list.length < spots.mannequins.length && list !== tops) continue; // (a hat or extra goes on one form, not every form)
        const head = p.kind === 'hat' || (p.kind === 'acc' && p.where === 'head');
        let body;
        if (head || p.model === 'scarf') body = onBust(g, p, 0, HC, 0);
        else { body = displayPiece(p, ['chest']); if (body) { body.position.y = CH - frameHeight('chest'); if (p.kind === 'bot') skirt(body, p); g.add(body); } }
        if (body) worn.push({ p, body, head });
      }
      if (!worn.length) return;
      root.add(g); g.updateMatrixWorld(true); dressed.push(g);
      const hcW = g.localToWorld(new THREE.Vector3(0, HC, 0)), faceW = g.localToWorld(new THREE.Vector3(0, HC, 0.3)), shW = g.localToWorld(new THREE.Vector3(0.2, CH + 0.4, 0)), shW2 = g.localToWorld(new THREE.Vector3(-0.2, CH + 0.4, 0));
      for (const { p, body, head } of worn) {
        const box = pieceBox(body);
        const on = head ? onHeadAt(box, hcW, faceW, p.kind === 'hat') : p.model === 'scarf' ? box.min.y < hcW.y - d.headY - d.neckY && box.max.y > hcW.y - d.headY - d.neckY - 0.1 : box.containsPoint(shW) && box.containsPoint(shW2);
        formAudits.push({ id: p.id, kind: p.kind, how: 'form', form: i, gap: 0, on, deco: back, box: [box.min.toArray(), box.max.toArray()] });
      }
    });
    // the round racks' far sides (away from the door): a deco piece each, on an arm or a bust, no tag
    const far = DECO.filter(p => p.kind !== 'shoe' && p.kind !== 'acc');
    spots.stands.filter(s => s.kind === 'round').forEach((s, i) => {
      const p = far[((state.week || 0) + i) % far.length]; if (!p) return;
      const d = placeDisplay(p, { ...s, yaw: s.yaw + Math.PI }, true);
      dressed.push(d.group); formAudits.push(d.audit);
    });
  }
  function rebuild() {
    dirty = false;
    for (const d of displays) root.remove(d.group);
    displays.length = 0;
    if (!spots || !clothesReady()) return;
    if (batched) { root.remove(batched); batched.traverse(m => { if (m.isMesh) m.geometry.dispose(); }); batched = null; }
    dressMannequins(state.stock.map(pieceOf).filter(Boolean));
    const stock = state.stock.map(pieceOf).filter(Boolean);
    // the counter (the last stand) gets something small: glasses, else a hat, else the shoes, else the extra
    const order = stock.slice();
    if (spots.stands.some(s => s.counter)) { for (const pick of [p => p.kind === 'acc' && p.where === 'head', p => p.kind === 'hat', p => p.kind === 'shoe', p => p.kind === 'acc']) { const i = order.findIndex(pick); if (i >= 0) { order.push(...order.splice(i, 1)); break; } } }
    spots.stands.forEach((s, i) => { const p = order[i]; if (p) displays.push(placeDisplay(p, s)); });
    // two draw calls for the lot: the pieces and hangers share the clothes sheet, every fixture (arms, busts, stands, clips, skirts,
    // strings) one vertex-colour toon; the meshes are merged in world space and taken out of their groups; the price tags keep
    // their own canvas textures
    const b = new Batcher({ vertexColors: true }), take = [];
    root.updateMatrixWorld(true);
    for (const g of [...displays.map(d => d.group), ...dressed]) g.traverse(m => { if (m.isMesh && m !== g && !m.material.isMeshBasicMaterial) take.push(m); });
    for (const m of take) { b.add(m.geometry, m.userData.vc || m.material, { matrix: m.matrixWorld }); m.parent.remove(m); }
    batched = new THREE.Group(); batched.name = 'peak-threads-displays'; b.build(batched, 'peak-threads-displays'); root.add(batched);
  }

  // ---------------------------------------------------------------- the server
  net.on('cl', m => {
    state.week = m.week; state.ends = m.ends; state.stock = Array.isArray(m.stock) ? m.stock.filter(id => pieceOf(id)) : [];
    if (Array.isArray(m.owned)) state.owned = m.owned; if (m.worn) state.worn = m.worn;
    if (typeof m.mall === 'boolean') state.mall = m.mall;
    if (!spots) placeSpots(); else dirty = true;
  });
  net.on('cl-buy', m => {
    if (!m.ok) {
      const why = { fish: `You need ${m.need} fish for that. You have ${m.fish}.`, owned: 'You already have that one!', stock: 'That one is not in the shop this week.', guest: 'Come back with a name and PIN to buy clothes.', far: 'Come into the shop first.', closed: 'Peak Threads is closed. Open 11 am to 7:30 pm.', soon: 'One moment...', bad: 'Hmm, the till jammed. Try again.' }[m.why] || 'Not this time.';
      ui.toast(why, 2800); audio.ui?.('blip'); return;
    }
    if (Array.isArray(m.owned)) state.owned = m.owned; if (m.worn) state.worn = m.worn;
    dirty = true;
    const p = pieceOf(m.id);
    ui.toast(`Yours! ${p ? p.name : 'It'} is on. ${m.fish} fish left.`, 3000); audio.ui?.('pop'); input.rumble(0.4, 0.4, 100);
    if (fitting) endFitting(false);
    applyLook(ctx, m.look);
    if (card) openCard(m.id); // (the card now says Owned)
  });
  net.on('cl-wear', m => { if (m.ok) { if (Array.isArray(m.owned)) state.owned = m.owned; if (m.worn) state.worn = m.worn; dirty = true; } });

  // ---------------------------------------------------------------- the card and the fitting room
  function buildCard() {
    cardEl = el('div', 'cl-card', '', { role: 'dialog', 'aria-label': 'Peak Threads' }); cardEl.hidden = true;
    const x = el('button', 'cl-x', '', { type: 'button', 'aria-label': 'Close' }); x.innerHTML = ICON.close; x.onclick = () => close();
    const pic = el('div', 'cl-pic'), kind = el('div', 'cl-kind'), name = el('div', 'cl-name'), price = el('div', 'cl-price'), btns = el('div', 'cl-btns'), note = el('div', 'cl-note');
    const tryB = iconBtn('mirror', 'Try it on', 'try'), buyB = el('button', 'cl-btn buy', '', { type: 'button' });
    tryB.onclick = () => { if (cardPiece) tryOn(cardPiece.id); };
    buyB.onclick = () => { if (cardPiece) buy(cardPiece.id); };
    btns.append(tryB, buyB);
    cardEl.append(x, pic, kind, name, price, btns, note);
    cardEl.refs = { pic, kind, name, price, btns, note, tryB, buyB };
    ctx.hud.append(cardEl);
    // the fitting room's bar: turn, buy, done
    barEl = el('div', 'cl-bar', '', { role: 'toolbar', 'aria-label': 'Fitting room' }); barEl.hidden = true;
    const L = iconBtn('left', 'Turn left'), Rb = iconBtn('right', 'Turn right'), bname = el('div', 'cl-name'), bbuy = el('button', 'cl-btn buy', '', { type: 'button' }), done = iconBtn('check', 'Done', 'done');
    L.onclick = () => fitting?.take.turn(1); Rb.onclick = () => fitting?.take.turn(-1);
    bbuy.onclick = () => { if (fitting) buy(fitting.piece.id); };
    done.onclick = () => endFitting(true);
    barEl.append(L, bname, bbuy, done, Rb);
    barEl.refs = { bname, bbuy };
    ctx.hud.append(barEl);
  }
  function priceInto(node, piece) {
    node.replaceChildren();
    if (state.owned.includes(piece.id)) { node.classList.add('owned'); node.append(icon('check'), document.createTextNode(' Yours')); }
    else { node.classList.remove('owned'); node.append(icon('fish'), document.createTextNode(String(piece.price))); }
  }
  function buyInto(btn, piece) {
    btn.replaceChildren();
    const owned = state.owned.includes(piece.id);
    btn.disabled = owned; btn.setAttribute('aria-label', owned ? 'Already yours' : `Buy for ${piece.price} fish`); btn.title = btn.getAttribute('aria-label');
    btn.append(icon('fish'), document.createTextNode(owned ? '' : String(piece.price)));
  }
  function openCard(id) {
    const p = pieceOf(id); if (!p) return;
    if (!cardEl) buildCard();
    cardPiece = p; card = p.id;
    const r = cardEl.refs;
    r.kind.textContent = KIND_NAMES[p.kind] || ''; r.name.textContent = p.name;
    priceInto(r.price, p); buyInto(r.buyB, p);
    r.note.textContent = state.owned.includes(p.id) ? 'Change in your wardrobe at home.' : ctx.accounts?.guest ? 'Visitors can try things on. Sign in to buy.' : 'Try it on, or buy it and wear it now.';
    tiles.request({ [SLOT_KEY[p.kind]]: p.id }, frameFor(p), r.pic);
    cardEl.hidden = false;
    audio.ui?.('blip');
    setTimeout(() => r.tryB.focus(), 0);
  }
  function close() {
    if (fitting) endFitting(true);
    if (cardEl) cardEl.hidden = true;
    card = null; cardPiece = null;
  }
  function tryOn(id) {
    const p = pieceOf(id); if (!p || !spots) return;
    if (!ctx.playing) return;
    if (cardEl) cardEl.hidden = true;
    const f = spots.fitting;
    const mp = spots.mirror.pos, my = spots.mirror.yaw, floor = spots.floorY ?? groundHeight(f.x, f.z);
    const take = mirrorTakeover(ctx, f, [mp[0] + Math.sin(my) * 0.12, floor + 1.3, mp[2] + Math.cos(my) * 0.12]); // (the camera just in front of the glass: what the mirror shows)
    fitting = { piece: p, take, patch: { [SLOT_KEY[p.kind]]: p.id } };
    previewLook(ctx, fitting.patch);
    hud.classList.add('cl-fit');
    barEl.refs.bname.textContent = p.name; buyInto(barEl.refs.bbuy, p);
    barEl.hidden = false;
    ui.toast('Turn with A and D (or the arrows) to see yourself.', 2600);
    audio.ui?.('pop');
  }
  function endFitting(restore) {
    if (!fitting) return;
    fitting.take.end();
    if (restore) restoreLook(ctx);
    fitting = null;
    hud.classList.remove('cl-fit');
    if (barEl) barEl.hidden = true;
    if (card) { cardEl.hidden = false; }
  }
  function buy(id) {
    const p = pieceOf(id); if (!p) return;
    if (state.owned.includes(id)) { ui.toast('You already have that one!', 2200); return; }
    if (ctx.accounts?.guest) { ui.toast('Come back with a name and PIN to buy clothes.', 3000); audio.ui?.('blip'); return; }
    net.send({ t: 'cl-buy', id });
  }

  // ---------------------------------------------------------------- the feature
  const nearest = (px, pz) => {
    let best = null, bd = REACH;
    for (const d of displays) { const dd = Math.hypot(px - d.x, pz - d.z); if (dd < bd) { bd = dd; best = d; } }
    return best;
  };
  const api = {
    name: 'clothing-store',
    state, displays, dressed, get spots() { return spots; }, get card() { return card; }, get fitting() { return fitting ? { id: fitting.piece.id, yaw: fitting.take.yaw } : null; },
    openCard, close, tryOn, buy, endFitting, rebuild: () => { dirty = true; },
    audit: () => [...displays.map(d => d.audit), ...formAudits],   // (tests: every displayed piece's support)
    showWeek(w) { state.stock = stockOf(w); state.week = w; dirty = true; if (spots) rebuild(); }, // (tests and pictures: dress the shop for another week, on this client only)
    target(px, pz) {
      if (fitting) return null; // (the bar's buttons: E is nothing here)
      if (card) return { hint: 'E  Done', prio: 9, run: close };
      if (!peakOpenAt(ctx.net.serverNow() / 1000)) return null;   // (shut: the pieces are not offered)
      const d = nearest(px, pz);
      if (d) return { hint: `E  ${d.piece.name} (${d.piece.price} fish)`, prio: 7, run: () => openCard(d.piece.id) };
      return null;
    },
    onKey(code) {
      if (code === 'Escape' && (card || fitting)) { close(); return true; }
      return false;
    },
    help: [[['E'], 'at Peak Threads: look at a piece, try it on, buy it with fish']],
    update(dt) {
      tiles.pump(5);
      if (dirty && spots) rebuild();
      if (displays.length && spots) { const d = Math.hypot(player.pos.x - spots.door[0], player.pos.z - spots.door[1]); const vis = d < SHOW_DIST; if (root.visible !== vis) root.visible = vis; }
      if ((card || fitting) && ctx.mode !== 'play') close();
    },
  };
  // the stock also comes by HTTP for a page that joined before the module answered (and for the tests)
  fetch('/api/clothing').then(r => r.json()).then(m => { if (state.week === null && m && m.stock) { state.week = m.week; state.ends = m.ends; state.stock = m.stock; state.mall = !!m.mall; if (!spots) placeSpots(); } }).catch(() => {});
  return api;
}
