// H. P. Lovecraft's house, with Arkham Horror in its parlour. The house is lovecraft-build.js (on the corner lot inside Breneland
// Rd's bend, layout.js LOVECRAFT_HOUSE). This is the feature: the front door that swings in as you come near, the Arkham table
// (games.json `venue: "lovecraft-house"`, no yard slot) and its four folk (the Detective, the Professor, the Reporter and the
// Cultist: looks in npc-looks.js, so the NPC Editor dresses them), the open days (lovecraft-days.js: Saturday, Monday and Thursday,
// all day, Eastern) with the brass plaque, the table's look and its card following them, and the camera inside (indoor-view.js).
// The roof stays on. The storm over the house on open days is weather.js's (it reads the same days).
import * as THREE from 'three';
import { buildLovecraftHouse } from './lovecraft-build.js';
import { houseGame, houseOpen, nextOpen, daysText, playDaysOf, todayName } from './lovecraft-days.js';
import { printed } from './lovecraft-art.js';
import { LIGHT, WEATHER } from './daynight-mats.js';
import { lovecraftSkin, setLovecraftSkin } from './lovecraft-model.js';
import { Human } from './human.js';
import { NPCS, lookOf, voiceOf, tagOf } from './npc-looks.js';
import { stintAt, hourAt } from './npcs-day.js';
import { el, loadCss, hash01 } from './util.js';
import { createScopeSky } from './lovecraft-scope.js';
import { PISGAH } from './layout.js';
import { frameHooks } from './perf-flags.js';
import { indoorView } from './indoor-view.js';
import { addRoom } from './indoor-rooms.js';
import { createGlassView, insideInk } from './real-glass.js';
import { GFX } from './gfx.js';

const FOLK = [['detective', 'Detective'], ['professor', 'Professor'], ['reporter', 'Reporter'], ['cultist', 'Cultist']];
const LINES_OPEN = ['Your turn, investigator.', 'Draw from the encounter deck.', 'Doom is rising!', 'A clue! Finally.', 'Keep the lantern lit.', 'Roll for will. Come on...',
  'The Mythos phase. Brace yourselves.', 'Who has the elder sign?', 'Ph\'nglui... what?', 'The stars are wrong tonight.'];
const LINES_SHUT = ['The Old Gentleman wrote at that desk upstairs.', 'Mind the stairs. They creak.', 'Something scratches in the walls.', 'Quiet house tonight. Too quiet.',
  'That portrait watches you, you know.', 'Did you hear that?', 'Back to the case files.'];
const NIGHT_IN = new THREE.Color('#1c2440'), GLASS_DAY = new THREE.Color('#5a7491'), GLASS_NIGHT = new THREE.Color('#1e2638'), GLASS_LAMP = new THREE.Color('#ffd27a'), FLASH_GLASS = new THREE.Color('#dfe6ff');

export function createLovecraftHouse(ctx) {
  const { scene, player, colliders, ui, audio, camera, net, config, store, input } = ctx;
  loadCss('/css/lovecraft.css');
  const built = buildLovecraftHouse(scene, colliders);
  const P = built.plan, I = P.inner;
  addRoom({ id: 'lovecraft', ...P.box, y0: P.FY, y1: P.EAVE }); // dry inside, even in its storm (indoor-rooms.js)
  const gm = houseGame(config?.games);
  const days = playDaysOf(gm);
  const inside = (x, z) => x > I.minX && x < I.maxX && z > I.minZ && z < I.maxZ;
  const now = () => net.serverNow();

  // ---- the plaque by the gate and the card on the table: their words follow the open days
  const plaqueMat = (open) => new THREE.MeshBasicMaterial({ fog: true, map: printed(['The Lovecraft House', '454 Angell Street', gm ? (open ? 'Arkham Horror: open today!' : `Arkham Horror: ${daysText(days)}`) : 'est. 1880'], { w: 384, h: 256, bg: '#3a2f22', fg: '#f3d98a', sub: '#e8d9b0', frame: '#c9a24a' }) });
  const plaqueOn = plaqueMat(true), plaqueOff = plaqueMat(false);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.31), plaqueOff); plaque.position.z = 0.012; built.plaque.add(plaque);
  const cardFaces = [];
  for (const k of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.17), built.cardOpen); m.position.set(0, 0, k * 0.04); m.rotation.x = k * 0.3; if (k < 0) m.rotation.y = Math.PI; built.card.add(m); cardFaces.push(m); }
  let cardShut = null;

  // ---- the people: built once, drawn only while the inside is (their state is a pure function of the shared clock)
  const folk = FOLK.map(([id, name], i) => {
    const h = new Human({ ...lookOf(id, NPCS[id].look) });
    h.root.visible = false; scene.add(h.root);
    // the tag and the speech bubble hang on an empty child that's shown only while no wall of the house stands between the camera and
    // them (the Detective's tag came through the hall's wall onto the board by the door)
    const vis = new THREE.Object3D(); vis.userData.tagAnchor = h.root.userData.tagAnchor; vis.visible = false; h.root.add(vis);
    const tag = ui.nameTag(vis, tagOf(id, name), '#ffffff'); tag.max = 12; tag.fade = 8;
    return { id, name, i, h, vis, voice: voiceOf(id, NPCS[id].voice), tag, here: false, s: null };
  });
  // where one of them is at shared time t (seconds): at the table on an open day, at their spot otherwise; the Reporter is off
  // filing the story 1-8 am and the Cultist only comes out after dark (npcs-day.js stints, as at the old table)
  function stateOf(f, t) {
    if (f.id === 'reporter' || f.id === 'cultist') { const st = stintAt(f.name, t); if (st && st.cur.place === 'away') return null; }
    const open = !!gm && houseOpen(gm, t * 1000);
    const slot = Math.floor(t / 9), r = hash01('lcfolk', f.id, slot);
    if (open) {
      const c = built.chairs[f.i];
      return { x: c.x, z: c.z, y: c.y, yaw: c.yaw, seatY: c.seatY, fold: c.fold, anim: r < 0.45 ? 'idle' : r < 0.65 ? 'talk' : r < 0.82 ? 'look' : 'point' };
    }
    const s = built.spots[f.id];
    // seated: 'sit' or a gesture bodies-poses.js does sitting (SEATED_OK). 'read' is a standing pose
    return { x: s.x, z: s.z, y: s.y, yaw: s.yaw, seatY: s.seatY || 0, fold: s.fold ?? null, chair: s.chair || null, anim: s.seatY ? (r < 0.75 ? 'sit' : r < 0.9 ? 'look' : 'talk') : r < 0.6 ? s.anim : 'idle' };
  }
  const say = (f, line) => { ui.say(f.vis, line, 3.6, 2.2); audio.speak(f.h.root.position.x, f.h.root.position.y + 1.5, f.h.root.position.z, line, f.voice); f.h.say?.(1.2); };
  const lineFor = (f, open, k) => {
    const pool = open ? LINES_OPEN : [...LINES_SHUT, gm ? `No game today. The table opens ${nextOpen(gm, now())}.` : 'Welcome to 454 Angell Street.'];
    return pool[Math.floor(hash01('lcline', f.id, k) * pool.length)];
  };

  // ---- the card (the table's E)
  const card = el('div', 'lc-card panel', '', { hidden: '', role: 'dialog' });
  const cTitle = el('div', 'lc-title'), cBlurb = el('div', 'lc-blurb'), cWhen = el('div', 'lc-when'), cStats = el('div', 'lc-stats');
  const cPlay = el('button', 'btn primary', 'Play'), cClose = el('button', 'btn', 'Not now');
  const cBtns = el('div', 'lc-btns'); cBtns.append(cPlay, cClose);
  card.append(cTitle, cBlurb, cWhen, cStats, cBtns); ctx.hud.append(card);
  function showCard() {
    if (!gm) return;
    card.hidden = false; player.controls = false;
    cTitle.textContent = gm.name; cBlurb.textContent = gm.blurb || '';
    cStats.textContent = '';
    fillWhen();
    audio.ui?.('pop');
    if (!String(ctx.profile.id).startsWith('guest-')) fetch('/api/stats?player=' + encodeURIComponent(ctx.profile.id), { cache: 'no-store', headers: ctx.accounts?.headers() || {} }).then(r => (r.ok ? r.json() : null)).then(j => { const s = j?.games?.[gm.id]; const k = s ? s.launches ?? s.plays ?? 0 : 0; if (s && !card.hidden) cStats.textContent = `You have launched it ${k} time${k === 1 ? '' : 's'} from Breneland.`; }).catch(() => {});
  }
  function fillWhen() {
    const on = open;
    cPlay.hidden = !on;
    cWhen.classList.toggle('closed', !on);
    cWhen.textContent = on ? `Open today (${todayName(now())}), all day. Pull up a chair!` : `Closed today. Open ${daysText(days)}. Next game: ${nextOpen(gm, now())}.`;
  }
  function hideCard() { card.hidden = true; if (ctx.playing) player.controls = true; }
  cClose.onclick = hideCard;
  cPlay.onclick = () => { hideCard(); ctx.play(gm.id); };

  // ---- open or closed: the table's two looks, the card, the plaque
  let open = null;
  function setOpen(on) {
    open = on;
    built.gameOn.visible = on; built.gameOff.visible = !on;
    plaque.material = on ? plaqueOn : plaqueOff;
    if (!on && gm) { cardShut?.map?.dispose(); cardShut?.dispose(); cardShut = new THREE.MeshBasicMaterial({ fog: false, map: printed(['Closed today', `open ${daysText(days)}`, `next: ${nextOpen(gm, now())}`], { w: 256, h: 160, bg: '#e8dcc0', fg: '#2a2530', sub: '#7a2232' }) }); }
    for (const m of cardFaces) m.material = on || !cardShut ? built.cardOpen : cardShut;
    if (!card.hidden) fillWhen();
  }
  setOpen(!!gm && houseOpen(gm, now()));

  // ---- the camera inside: first person or the room view, the toggle under the smiley, F and L3: indoor-view.js (shared with the
  // ranch house). The rooms are zones (the stairs by height). Just outside, the follow camera is kept out of the walls.
  const iv = indoorView(ctx);
  const kTarget = new THREE.Vector3();
  // the line from you to the camera, not only the camera, is kept out of the house's box (else the camera came in to the box's edge
  // and jumped 1.2 m back out the frame it cleared the corner). The clamp slides off the corner with the line, found exactly (a
  // bisection after the 24 samples), and as it lets go the camera eases back out over a moment instead of jumping. It comes in at
  // once (never into a wall)
  let kOut = 1;
  const inBox = (x, z, pad) => x > P.box.minX - pad && x < P.box.maxX + pad && z > P.box.minZ - pad && z < P.box.maxZ + pad;
  const keepOut = (cam, dt = 1 / 30, fresh = false) => { // just outside, the follow camera stays out of the walls (the roof and walls are on)
    const c = cam.position, pad = 0.35;
    if (fresh) kOut = 1; // the first frame out of the door: no easing from where it was the last time you were out
    if (inside(player.pos.x, player.pos.z) || c.y > P.topY + 1) { kOut = 1; return; }
    kTarget.set(player.pos.x, player.pos.y + 1.6, player.pos.z);
    const at = u => inBox(kTarget.x + (c.x - kTarget.x) * u, kTarget.z + (c.z - kTarget.z) * u, pad);
    // you yourself in the box's pad, by the wall: past the stretch of the line still in it near you, where the line goes back into it.
    // All the way in, with the camera behind you in the house: as close as it goes
    let i = 1, lo = 1;
    if (at(0)) { while (i <= 24 && at(i / 24)) i++; if (i > 24) lo = 0; }
    if (lo > 0) {
      while (i <= 24 && !at(i / 24)) i++;
      if (i <= 24) { lo = (i - 1) / 24; let hi = i / 24; for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (at(m)) hi = m; else lo = m; } }
    }
    kOut = lo < kOut ? lo : kOut + (lo - kOut) * Math.min(1, dt * 5);
    if (kOut > 0.999) return;
    c.lerpVectors(kTarget, c, Math.max(0.12, kOut)); cam.lookAt(kTarget);
  };
  // the porch, for the camera: coming out of the door you stay in the house's view on the porch (first person, or the room view's
  // porch shot from under its roof) and the cut to the follow camera comes as you step off it. Right at the door the follow camera
  // behind you had nowhere to stand but in the wall. The room view's porch shot stands out on the front walk, 2.6 m off the porch and
  // under its roof's line, looking in at the door (a corner of the porch was so near you that the way you walk turned every step)
  const PO = P.PORCH, X = u => P.HX + u, Z = v => P.HZ + v, CY = P.FY + 2.0, DU = P.DOOR.u;
  const porch = { id: 'porch', minX: X(PO.u0), maxX: X(PO.u1), minZ: Z(P.HD) - 0.3, maxZ: Z(PO.v1) + 0.05, y: P.FY, top: P.FY + 2.9,
    cams: [[X(DU - 1.6), Z(PO.v1) + 2.6, CY], [X(DU + 1.6), Z(PO.v1) + 2.6, CY]] };
  const onPorch = (x, z) => x > porch.minX && x < porch.maxX && z > porch.minZ && z < porch.maxZ;
  const bld = iv.register({
    id: 'lovecraft', inside, rooms: [...built.rooms, porch], walls: built.walls, keepOut, stayIn: onPorch,
    zoneHas: (r, x, y, z, depth = 0) => {
      if (r.stair) return x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ && y > P.FY + (depth ? 0.3 : 0.05) && y < P.UY - (depth ? 0.08 : 0.02); // on them from the first tread (0.05), so the room view cuts straight to the stairs' shot as you step on
      return x > r.minX + depth && x < r.maxX - depth && z > r.minZ + depth && z < r.maxZ - depth && Math.abs(y - r.y) < 1.2;
    },
    busy: () => scope.on,
    // the front door swung in (hinged on the west jamb) stands between a spot and you when the line between you crosses its leaf, so
    // not that spot while it's open (the hall's shot sat behind the open door with you hidden by it, at the foot of the stairs)
    camOK: (c, x, z) => {
      if (doorT < 0.15 || x === undefined) return true;
      const hx = built.door.position.x, hz = built.door.position.z, r = built.door.rotation.y, ex = hx + Math.cos(r) * (P.DOOR.w - 0.34), ez = hz - Math.sin(r) * (P.DOOR.w - 0.34); // its last 0.3 m let off: a line past its very edge still sees most of you
      const cr = (ax, az, bx, bz, px, pz) => (bx - ax) * (pz - az) - (bz - az) * (px - ax);
      { const lx = ex - hx, lz = ez - hz, t = Math.max(0, Math.min(1, ((x - hx) * lx + (z - hz) * lz) / (lx * lx + lz * lz))); if (Math.hypot(x - hx - lx * t, z - hz - lz * t) < 0.35) return true; } // you beside the leaf, going through the door: it hides nothing of you
      return !(cr(hx, hz, ex, ez, c[0], c[1]) * cr(hx, hz, ex, ez, x, z) < 0 && cr(c[0], c[1], x, z, hx, hz) * cr(c[0], c[1], x, z, ex, ez) < 0);
    },
  });

  // ---- the study's telescope, a working one: E at it puts you behind the eyepiece. The view starts just outside the west window's
  // glass, magnified (a narrow field), and pans within the window's arc and zooms a little (drag / mouse / right stick; wheel /
  // pinch / L3). E, Esc or B steps back. By night the stars, five constellations, the moon in its phase and a planet
  // (lovecraft-scope.js), by day the sky, the town's roofs and the water tower, a bird now and then. Local to you. While you look
  // the HUD is tucked away like the scenic view's, a round eyepiece rims the picture, the storm's cloud lid over the house parts and
  // the fog is pushed back (frameHooks: after daynight.js has set them this frame, before the draw).
  const SC = built.scope, ARC = 0.75, EL_MIN = 0.02, EL_MAX = 1.0, FOV0 = 13, FOV_MIN = 6, FOV_MAX = 22;
  const sky = createScopeSky(scene, { base: SC.base, arc: ARC });
  const scope = { on: false, yaw: SC.base, el: 0.3, fov: FOV0, savedFov: 55, since: 0 };
  const sEye = new THREE.Vector3(SC.eye.x, SC.eye.y, SC.eye.z), sAt = new THREE.Vector3();
  const lens = el('div', 'lc-scope', '', { hidden: '' });
  const lensTip = el('div', 'lc-scope-tip'); lens.append(lensTip); ctx.hud.append(lens);
  function scopeIn() {
    if (scope.on) return;
    hideCard();
    const night = LIGHT.night || 0;
    scope.on = true; scope.since = performance.now() / 1000;
    // by night up at the stars, by day on Mount Pisgah and its TV tower, past Strickler Woods to the west-south-west (that window looks
    // west: the town is behind the house, the lake to the south, the water tower a pan to the right, north-west). Aimed a little under
    // the summit so the tower shows.
    const pd = Math.hypot(PISGAH.x - sEye.x, PISGAH.z - sEye.z);
    scope.yaw = night > 0.4 ? SC.base + 0.24 : Math.atan2(PISGAH.x - sEye.x, PISGAH.z - sEye.z);
    scope.el = night > 0.4 ? 0.84 : Math.atan2(PISGAH.top - 22 - sEye.y, pd); scope.fov = night > 0.4 ? FOV0 : 17;
    scope.savedFov = camera.fov;
    player.place(SC.stand.x, SC.stand.z, SC.stand.yaw);
    player.takeover = {
      anim: 'look', scope: true,
      update(dt, now, inp, pl) { pl.pos.set(SC.stand.x, pl.pos.y, SC.stand.z); pl.yaw = SC.stand.yaw; },
      camera(dt, cam, inp) {
        const look = inp.takeLook();
        if (look.x || look.y) {
          const k = scope.fov / FOV0; // finer the more you zoom in
          scope.yaw = Math.max(SC.base - ARC, Math.min(SC.base + ARC, scope.yaw - look.x * 0.0022 * k));
          scope.el = Math.max(EL_MIN, Math.min(EL_MAX, scope.el - look.y * 0.0018 * k));
        }
        if (look.zoom) scope.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, scope.fov * (1 + look.zoom * 0.12)));
        if (look.cycle) scope.fov = scope.fov > 10 ? 7 : scope.fov > 6.5 ? 18 : FOV0; // the pad's L3 steps the zoom
        if (Math.abs(cam.fov - scope.fov) > 0.01) { cam.fov = scope.fov; cam.updateProjectionMatrix(); }
        const ce = Math.cos(scope.el);
        sAt.set(sEye.x + Math.sin(scope.yaw) * ce * 10, sEye.y + Math.sin(scope.el) * 10, sEye.z + Math.cos(scope.yaw) * ce * 10);
        cam.position.copy(sEye); cam.lookAt(sAt);
        sky.update(sEye, LIGHT.night || 0, now(), !!open, performance.now() / 1000);
        return true;
      },
    };
    sky.group.visible = true;
    lens.hidden = false;
    const pad = input?.lastDevice === 'pad', touch = ctx.hudLayout?.layout === 'phone';
    const D = '  ' + String.fromCharCode(183) + '  '; // a middle dot, built (see CLAUDE.md on escapes)
    lensTip.textContent = pad ? `Right stick: look${D}L3: zoom${D}B: step back` : touch ? `Drag: look${D}Pinch: zoom${D}E: step back` : `Drag: look${D}Wheel: zoom${D}E or Esc: step back`;
    ctx.hud.classList.add('lc-scoped');
    audio.ui?.('pop');
  }
  function scopeOut() {
    if (!scope.on) return;
    scope.on = false;
    if (player.takeover?.scope) player.takeover = null;
    camera.fov = scope.savedFov; camera.updateProjectionMatrix();
    sky.group.visible = false; lens.hidden = true;
    ctx.hud.classList.remove('lc-scoped');
    iv.resume(SC.stand.yaw);
    audio.ui?.('pop');
  }
  frameHooks.push(() => {
    if (!scope.on) return;
    if (scene.fog) { scene.fog.near *= 6; scene.fog.far *= 6; }               // daynight.js sets them again next frame
    const cap = ctx.weather?.fx?.cap?.group; if (cap) cap.visible = false;    // weather-fx.js shows it again next frame
  });
  const nearScope = (px, pz) => Math.hypot(px - SC.stand.x, pz - SC.stand.z) < 1.0 && player.pos.y > P.UY - 0.4;

  // ---- the house's sounds: the Arkham bed (a slow clock, whispers, a crow now and then) at the table
  audio.addTable?.('arkham', P.TABLE.x, P.TABLE.z);

  let doorT = 0, doorWas = false, showIn = true, wasInside = false, lampsOn = false, lastSlot = -1, glassNight = -1, flashing = false;
  // (lovecraft-setpiece) the set piece's seasonal skin (lovecraft-model.js lovecraftSkin: halloween, winter, spring, default), checked
  // once a minute against the shared clock so it turns over at midnight with everyone; the wreath and the pumpkins show in their season
  let skinNow = null, skinAt = -1e9;
  const applySkin = sk => {
    if (!built.model) return false;
    skinNow = sk; setLovecraftSkin(sk);
    for (const m of Object.values(built.seasonMeshes || {})) m.mesh.visible = m.season === sk;
    return true;
  };
  if (built.model) applySkin(lovecraftSkin(now()));
  const show = on => { showIn = on; built.inside.visible = on; for (const f of folk) if (!on) f.h.root.visible = f.vis.visible = false; };
  // the windows of the rooms you can walk in are see-through when the camera is near enough to look in (the inside, the folk and the
  // lamps drawn for it), the old panes far off. From inside you look out through them (real-glass.js). Seen through the windows
  // from outside the folk cast no shadow (the sun doesn't reach into the rooms, and a phone's lamp shadow needn't draw them six times
  // over). Inside, as usual. Each mesh's own setting is kept (rigid-merge's merged meshes cast).
  let folkCast = null, inkFull = null;
  const folkShadows = on => {
    if (on === folkCast) return;
    folkCast = on;
    for (const f of folk) f.h.root.traverse(o => {
      if (!o.isMesh) return;
      if (on) { if (o.userData.rwCast !== undefined) { o.castShadow = o.userData.rwCast; delete o.userData.rwCast; } else if (o.isSkinnedMesh) o.castShadow = true; }
      else if (o.userData.rwCast === undefined) { o.userData.rwCast = o.castShadow; o.castShadow = false; }
    });
  };
  const gv = built.glassU ? createGlassView({ boxes: [P.boxBay || P.box], meshes: () => built.glassMeshes, mats: [built.glassReal], U: built.glassU }) : null;
  show(false);
  const nearTable = (px, pz) => Math.hypot(px - P.TABLE.x, pz - P.TABLE.z) < 2.3;

  const api = {
    name: 'lovecraft',
    plan: P, built, folk, game: gm,
    get open() { return open; },
    get view() { return iv.view; },
    setView: v => iv.setView(v, true), toggle: () => iv.toggle(true),
    inside: () => inside(player.pos.x, player.pos.z),
    get room() { return iv.active === bld ? iv.room : null; },
    get walkFP() { return iv.walkFP(bld); },
    get roomCam() { return iv.roomCam(bld); },
    get insideShown() { return showIn; },
    glassView: gv,
    get cardOpen() { return !card.hidden; },
    get canPlay() { return !card.hidden && !cPlay.hidden; },
    get cardWhen() { return cWhen.textContent; },
    get skin() { return skinNow; }, setSkin: applySkin, // (lovecraft-setpiece: the seasonal skin; tests and pictures force one)
    look: (yaw, pitch = 0.08) => iv.look(yaw, pitch),
    stateOf: (id, t = now() / 1000) => { const f = folk.find(q => q.id === id); return f ? stateOf(f, t) : null; },
    get button() { return iv.button; },
    get cuts() { return iv.cuts; },
    get shot() { return iv.shot; },
    sees: (c, x, y, z) => iv.sees(bld, c, x, y, z),
    say: (id, line) => { const f = folk.find(q => q.id === id); if (f?.here) say(f, line); }, // tests and pictures
    get scope() { return scope.on ? { yaw: scope.yaw, el: scope.el, fov: camera.fov, base: SC.base, arc: ARC, elMin: EL_MIN, elMax: EL_MAX, sky: sky.state } : null; },
    scopeIn, scopeOut, scopeSky: sky, scopeAim(yaw, el) { scope.yaw = yaw; scope.el = el; }, // tests and pictures
    update(dt, nowS) {
      if (scope.on && player.takeover?.scope !== true) scopeOut(); // something else took you over
      const t = now() / 1000;
      const on = !!gm && houseOpen(gm, t * 1000);
      if (on !== open) setOpen(on);
      const px = player.pos.x, pz = player.pos.z, c = camera.position;
      // the door: swings in while you are near it (either side)
      const nearDoor = Math.hypot(px - P.door.x, pz - P.door.z) < 2.6;
      doorT += ((nearDoor ? 1 : 0) - doorT) * Math.min(1, dt * 4);
      built.door.rotation.y = 1.4 * doorT;
      built.doorCol.off = doorT > 0.3;
      if (nearDoor !== doorWas) { doorWas = nearDoor; if (ctx.playing) audio.door?.(nearDoor ? 'open' : 'close', P.door.x, P.FY + 1.2, P.door.z); }
      const inNow = inside(px, pz), camIn = inside(c.x, c.z) && c.y < P.topY;
      if (inNow !== wasInside) { wasInside = inNow; if (!inNow) iv.reset(); }
      if (inNow !== lampsOn) { lampsOn = inNow; for (const s of built.lamps) s.day = inNow ? 0.55 : 0; }
      if (inNow && camIn) ui.indoors = true; // the places' labels outside don't show through the walls (the store sets it false every frame before us)
      if (ctx.weather) ctx.weather.indoor = camIn;
      iv.update(); // the view button: shown inside, tucked while you look through the telescope
      const looks = gv ? gv.update(dt, camera, camIn) : false;
      const showNow = inNow || camIn || Math.hypot(px - P.door.x, pz - P.door.z) < 9 || looks;
      if (showNow !== showIn) show(showNow);
      // the glass from inside: daylight by day, a deep blue at night
      const night = Math.round((LIGHT.night || 0) * 20) / 20;
      if (nowS - skinAt > 60) { skinAt = nowS; if (built.model) { const sk = lovecraftSkin(now()); if (sk !== skinNow) applySkin(sk); } }
      // the storm's lightning lights the windows (lovecraft-setpiece): every pane goes pale for the flash, then back to the night's colour
      const lf = WEATHER.localFlash || 0;
      if (lf > 0.002) {
        flashing = true; glassNight = -1;
        built.glassDark.color.set(GLASS_DAY).lerp(GLASS_NIGHT, night).lerp(FLASH_GLASS, Math.min(1, lf * 0.9));
        built.glassLit.color.set(GLASS_DAY).lerp(GLASS_LAMP, night).lerp(FLASH_GLASS, Math.min(1, lf * 0.6));
        built.glassReal?.color.copy(built.glassLit.color);
      } else if (night !== glassNight || flashing) {
        glassNight = night; flashing = false;
        built.glassIn.color.set('#cfe4f2').lerp(NIGHT_IN, night * 0.9);
        built.glassDark.color.set(GLASS_DAY).lerp(GLASS_NIGHT, night);
        built.glassLit.color.set(GLASS_DAY).lerp(GLASS_LAMP, night);
        built.glassReal?.color.copy(built.glassLit.color);
      }
      if (!showIn) return;
      folkShadows(inNow || camIn);
      // looked into from outside on a phone or a tablet, the inside is drawn in colour only (real-glass.js insideInk)
      const full = inNow || camIn || GFX.cls === 'desktop';
      if (full !== inkFull) { inkFull = full; insideInk([built.inside], full); }
      // the people
      const present = [];
      for (const f of folk) {
        const s = stateOf(f, t);
        f.here = !!s; f.s = s;
        f.h.root.visible = !!s;
        f.vis.visible = !!s && (!camIn || iv.sees(bld, [c.x, c.z], s.x, s.y, s.z)); // no tag or bubble through a wall
        if (!s) continue;
        present.push(f);
        f.h.root.position.set(s.x, s.y, s.z); f.h.root.rotation.y = s.yaw;
        f.h.params.seatY = s.seatY; f.h.params.chair = s.chair || null;
        f.h.params.table = open ? P.TABLE : null; // hands on the top, nothing through it. Standing at it too: what a hand holds clears its edge
        f.h.update(dt, nowS, 0, s.anim);
      }
      // now and then one of them speaks (who and what: the shared clock; heard only near, inside)
      const slot = Math.floor(t / 14);
      if (slot !== lastSlot) {
        lastSlot = slot;
        if (inNow && present.length && hash01('lcspeak', slot) < 0.7) { const f = present[Math.floor(hash01('lcwho', slot) * present.length)]; say(f, lineFor(f, open, slot)); }
      }
    },
    target(px, pz) {
      if (!card.hidden) return { hint: 'E  Not now', prio: 9, run: hideCard };
      if (scope.on) return { hint: 'E  Step back', prio: 9, run: scopeOut };
      if (gm && Math.hypot(px - built.plaque.position.x, pz - (built.plaque.position.z + 0.6)) < 1.4) return { hint: 'E  Read the plaque', prio: 5, run: () => ui.toast(`The Lovecraft House, 454 Angell Street. H. P. Lovecraft was born here in 1890. Arkham Horror is played in the parlour: ${daysText(days)}.`, 5200) };
      if (!inside(px, pz)) return null;
      if (gm && nearTable(px, pz)) return { hint: open ? `E  Play ${gm.name}` : `E  ${gm.name} (closed today)`, prio: 6, run: showCard };
      if (nearScope(px, pz)) return { hint: 'E  Look through the telescope', prio: 6, run: scopeIn };
      let best = null, bd = 1.9;
      for (const f of folk) { if (!f.here) continue; const d = Math.hypot(px - f.h.root.position.x, pz - f.h.root.position.z); if (d < bd) { bd = d; best = f; } }
      if (best) return { hint: `E  Talk to the ${best.name}`, prio: 5, run: () => say(best, lineFor(best, open, Math.floor(Math.random() * 1e6))) };
      return null;
    },
    onKey(code) {
      if (scope.on && (code === 'Escape' || code === 'KeyE')) { scopeOut(); return true; }
      if (!card.hidden && (code === 'Escape' || code === 'KeyE' || code === 'Enter')) { if (code === 'Enter' && !cPlay.hidden) cPlay.click(); else hideCard(); return true; }
      if (iv.onKey(code)) return true;
      return false;
    },
    // back from Arkham Horror within three hours (main.js): you arrive in the parlour, beside the table
    returnSpot(last) {
      if (!gm || last?.slot !== 'lovecraft-house' || last.game !== gm.id) return null;
      const x = P.TABLE.x + 1.9, z = P.TABLE.z + 1.4;
      return { id: 'lovecraft-house', game: gm, slot: { name: 'the Lovecraft house' }, x: P.TABLE.x, z: P.TABLE.z, spot: { x, z, yaw: Math.atan2(P.TABLE.x - x, P.TABLE.z - z) } };
    },
    // the folk are drawn one skinned mesh per material (main.js's rigid merge: their name tags hang on a child, so they were never
    // listed). Seen through the windows from the street they cost what one townsperson does, not 55 draws each
    *characterRoots() { for (const f of folk) yield f.h.root; },
    bodies() { const out = []; for (const f of folk) if (f.here && f.h.root.visible && !f.s?.seatY) out.push({ x: f.h.root.position.x, z: f.h.root.position.z, r: 0.3 }); return out; },
    help: [[['E'], 'look through the telescope in the study of the Lovecraft house'], [['E'], `play Arkham Horror in the Lovecraft house's parlour (${gm ? daysText(days) : 'soon'})`], [['F'], 'in the Lovecraft house: first person or the room view']],
  };
  return api;
}
