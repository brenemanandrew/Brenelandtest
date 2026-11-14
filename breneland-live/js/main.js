// Breneland: boot, the frame loop, and everything that happens when you walk up to things.
import * as THREE from 'three';
import { InkPass } from './toon.js';
import { createCameraFade } from './camera-fade.js';
import { createShadows } from './shadows.js';
import { createRigidMerge } from './rigid-merge.js';
import { createPropMerge } from './prop-merge.js';
import { createWarmViews } from './warm-views.js';
import { createOcclusion } from './occlusion.js';
import { view as lodView } from './perf-flags.js'; // the far lawn reads the camera
import { buildWorld, SUN_DIR } from './world.js';
import { loadWorldEdits, applyWorldEdits, buildWorldProps, normaliseProps, PREVIEW } from './world-edits.js';
import { loadBoatModels } from './rowboats.js';
import { loadStaticProps } from './props-static.js';
import { loadVehicleModels } from './vehicle-models.js';
import { loadCribModel } from './crib-model.js';
import { loadLovecraftModel } from './lovecraft-model.js';
import { loadFishShackModel } from './fish-shack-model.js';
import { loadStripMallModel } from './strip-mall-model.js';
import { loadClothesModel } from './clothing-wear.js'; // (clothing-store) Peak Threads' catalogue: the Blender clothes the characters wear
import { loadMallStaffModel } from './mall-staff-model.js'; // (mall-staff) Belinda, Mina, Zoe and Asha as Blender models on the human.js-driven rig
import { loadMpfbCharacters } from './mpfb-characters.js'; // (mpfb-in-game) the MPFB characters with their own baked animation; the code-built looks if they don't load
import { createPreviewEdit } from './editor/preview-edit.js';
import { buildHouse } from './house.js';
import { buildAreas } from './areas.js';
import { setFlatZones, surfaceAt, roadEdgeDist, setGroundTints, groundHeight } from './terrain.js';
import { IK_WORLD } from './bodies-ik.js';
import { NpcSystem } from './npcs.js';
import { applySavedLooks } from './dogs.js';
import { loadNpcLooks } from './npc-looks.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { dogMood } from './dog-voice.js';
import { registerQolSfx, stepSurface, playStep } from './qol-sfx.js';
import { musicPlace } from './music-place.js';   // the music follows where you are
import { backroomSource } from './dnd-sound.js';   // the D&D back room's sound follows the table
import { Net, Remotes } from './net.js';
import { UI } from './ui.js';
import { Intro } from './intro.js';
import { SPAWN, MAILBOX, HOUSE, PORCH, CLEARINGS, NEIGHBORHOODS, SHOPS, STORE_LOT, SIDEWALK_W, WOODS_X, MAP, FENCE_WEST_X, regionAt, gardenBlock, picnicBlock, inFrisbeeField } from './layout.js';
import { LIGHT, NIGHT_SPOTS, WEATHER } from './daynight-mats.js';
import { createGates } from './gates.js';
import { createDogToys } from './dog-toys.js';
import { createDogWalk } from './dog-walk.js';   // walk with me: hold E on a dog and it walks with you
import { createSwim } from './swim.js';
import { createScouts } from './scouts.js';
import { createGarden } from './garden.js';
import { createPicnic } from './picnic.js';
import { createLawn } from './lawn.js';   // the frisbee field and the hedges
import { createPieContest } from './pie.js';   // the pie eating contest
import { createWaterTower } from './water-tower.js';
import { createGameStore } from './game-store.js';
import { createStripMall } from './strip-mall.js';
import { createToolCrib } from './tool-crib.js';
import { createSummitSquare } from './summit-square.js'; // the small paved park where the Tool Crib stood (crib-move)
import { createTableGames } from './table-games/index.js'; // board games off the store's free shelf, set up on any table (table-games)
import { createDnd } from './dnd.js';   // D&D night in the game store's back room
import { createLovecraftHouse } from './lovecraft-house.js';
import { createMaze } from './maze.js';   // Beneath Angell Street, down the door in the Lovecraft house's hall
import { createMazeBoard } from './maze-board.js';   // the board by the door in the Lovecraft hall
import { createFires } from './fires.js';             // real fires in the fireplaces, real flames on the candles
import { createMazeResult } from './maze-result.js'; // the escape and taken cards
import { createAchievements } from './achievements.js'; // the toast and the list in Settings > You
import { createMainHouse } from './main-house.js';
import { createFishShack } from './fish-shack.js';
import { createTownLife } from './town-life.js';
import { createPark } from './park.js';
import { updateBalloons, anyNear, passer, balloonState, BAL, balloons as balloonList } from './balloons.js';
import { createCars } from './cars.js';
import { createBus } from './bus.js';
import { createPorchSwing } from './porch-swing.js';
import { createDogBeds } from './dog-beds.js';
import { createHouseRest } from './house-rest.js';
import { createFirepit } from './firepit.js';
import { createScenic } from './scenic.js';
import { createPaws } from './paws.js';
import { createKevinCrew } from './kevin-crew.js';
import { createCrowd } from './crowd.js';
import { createHaptics } from './haptics.js';
import { createBuddyCarol } from './buddy-carol.js';
import { createParkLot } from './park-lot.js';
import { createJoyceCart } from './joyce-cart.js'; // Joyce's pink golf cart and her house
import { createJoyceHouse } from './joyce-house.js'; // Joyce's house from Andrew's photo: the garage, the sun room, the back yard and her evenings
import { AvatarEditor, SHIRTS, randomLook } from './avatar-editor.js';
import { createInventory } from './inventory.js';
import { createFishing } from './fishing.js';
import { createSwing } from './swing.js';
import { createBocce, bocceFlatZones, bocceClear } from './bocce.js';
import { mountMixer } from './audio-mixer.js';
import { createSettings } from './settings.js';
import { mountControls } from './settings-controls.js';
import { createDayNight } from './daynight.js';
import { dayPhase } from './daytime.js';
import { greeting } from './intro.js';
import { createAccounts } from './accounts.js';
import { toolsMenu } from './tools-menu.js'; // Andrew's menu after he signs in
import { createQuests } from './hud-quests.js';
import { createCurrency } from './hud-currency.js';
import { createEmotes } from './hud-emotes.js';
import { createDancePair } from './dance-pair.js';
const HIGHFIVE_TURN = 0.44; // rad: a high five turns you left of the person you high-five
import { createTools } from './hud-tools.js';
import { createHudLayout, loadHudLayouts } from './hud-layout.js';
import { createHudEdit } from './hud-edit.js';
import { createHudLiveEdit } from './hud-live-edit.js'; // (owner-tiles: the owner moves HUD pieces in the game; everyone gets saves live)
import { createClothingStore } from './clothing-store.js'; // (clothing-store: Peak Threads, the week's pieces bought with fish)
import { createMallStaff } from './mall-staff.js'; // (mall-staff: the strip mall's people and the late party)
import { createWardrobe } from './wardrobe.js';             // (clothing-store: the wardrobe at home)
import { createMinimap } from './hud-minimap.js';
import { createPadHud } from './hud-pad.js';
import { createWeather } from './weather.js';
import { createVoice } from './voice.js';
import { createGaze, GAZE } from './gaze.js';   // everyone looks at who is talking
import { GFX, detectDevice, initGraphics, setLevel, describe, createFrameSample, createRunningCheck, levelAfterSample, startLevel, LEVEL_NAMES, LEVELS } from './gfx.js';

const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem('breneland.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('breneland.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem('breneland.' + k); } catch { /* private mode */ } },
};

// Used when the page is opened without the server (e.g. straight from disk).
const FALLBACK_CONFIG = {
  world: 'backyard',
  slots: [
    { id: 'woods-corner', name: 'Woods Corner', x: -116, z: -36, placeholder: 'mushrooms' }, // Unstable Unicorns' lawn
    { id: 'garden', name: 'Community Garden', x: -48.65, z: -29.2, placeholder: 'garden' }, // its own block west of the yard fence (layout.js GARDEN_BLOCK)
    { id: 'campfire', name: 'Lakeside Firepit', x: -31.5, z: 22, placeholder: 'firepit' }, // behind the house by Lake Rufallia
    { id: 'north-lawn', name: 'Picnic Lawn', x: -25, z: -29.8, placeholder: 'picnic' }, // the pink block west of the main path (layout.js PICNIC_BLOCK)
    { id: 'boat-dock', name: 'Boat Dock', x: 45, z: -19, placeholder: 'dock' },
    // (no east-lawn slot: the unicorns are in the woods corner and the East Lawn is plain lawn)
  ],
  games: [
    { id: 'arkham', name: 'Arkham Horror', slot: null, venue: 'lovecraft-house', playDays: [6, 1, 4], theme: 'arkham', url: 'https://arkhamhorrortable.fly.dev/', blurb: '1920s Arkham. Fog, lanterns, and something in the walls. Played in the parlour of the Lovecraft house on Mon, Thu and Sat.' },
    { id: 'unicorns', name: 'Unstable Unicorns', slot: 'woods-corner', theme: 'unicorns', url: 'https://unstable-unicorns-table.fly.dev/', blurb: 'Build a unicorn army. Betray your friends.' },
    // store-only: no yard table (slot null), a box in the game store and its demo table on playtest days (game-store.js)
    { id: 'bookwyrm', name: 'Bookwyrm', slot: null, venue: 'store', playtestDays: [0, 2, 3, 6], theme: 'bookwyrm', url: 'https://bookwyrm-table.fly.dev/', blurb: 'Hoard books. Tidy shelves. Mind the cat. Playtests Sun, Tue, Wed, Sat at the demo table.' },
  ],
};

// Player voices for the Sims-style babble.
const VOICES = [
  { label: 'Low', pitch: 112, formant: 0.95 },
  { label: 'Medium', pitch: 162, formant: 1.03 },
  { label: 'High', pitch: 232, formant: 1.14 },
];
const voiceOf = i => VOICES[i] || VOICES[1];

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

// Yield so the loading bar can paint (timers when the tab is in the background,
// where animation frames never fire).
const frame = () => new Promise(r => (document.hidden ? setTimeout(r, 0) : requestAnimationFrame(() => r())));
function progress(p, text) {
  $('#loading .loading-bar span').style.width = Math.round(p * 100) + '%';
  if (text) $('#loading-text').textContent = text;
}

async function boot() {
  const canvas = $('#scene');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch {
    $('#loading-text').textContent = 'This browser could not start 3D graphics (WebGL). Try Chrome, Edge or Safari.';
    return;
  }
  // Fast / High / Max, picked for this device unless the player chose (gfx.js): the class (phone, tablet, computer) also
  // scales what each level means, so Max on a phone is a phone-sized Max.
  // ?fast (or ?q=low|high|max) forces a graphics level and remembers it: a way out for a device that cannot get through loading
  const qp = new URLSearchParams(location.search);
  const forcedQ = qp.has('fast') ? 'low' : ['low', 'high', 'max'].includes(qp.get('q')) ? qp.get('q') : null;
  const gfxInfo = detectDevice(renderer, qp);
  let quality = initGraphics(gfxInfo, store, forcedQ);
  const applyPixelRatio = () => renderer.setPixelRatio(Math.min(devicePixelRatio, GFX.s.pr));
  applyPixelRatio();
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor('#f3dcc0');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2200);
  lodView.camera = camera;
  IK_WORLD.ground = groundHeight; // people's feet find the real ground (bodies-ik.js)
  camera.position.set(30, 18, 10);
  const ink = new InkPass(renderer, { quality });
  ink.samples = GFX.s.msaa; // (MSAA in the ink pass by class: 2x on a phone)
  ink.setSize(innerWidth, innerHeight);

  progress(0.1, 'Checking which games are set up...');
  let config;
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    config = await res.json();
  } catch { config = FALLBACK_CONFIG; }
  const serverOffset = config.now ? config.now - Date.now() : 0;
  // Andrew's World Editor edits (world-edits.js): applied to the layout before anything is built from it
  const worldEdits = applyWorldEdits(await loadWorldEdits());
  await loadHudLayouts(); // Andrew's HUD Editor layouts (hud-layout.js): laid over the built-in ones piece by piece
  await loadBoatModels(); // the Blender rowboats at the dock (rowboats.js); the dock builds plain ones if they don't load
  await loadStaticProps(); // the Blender lamps, lanterns, benches, tables, shelter and board (props-static.js); code-built ones if they don't load
  await loadVehicleModels(); // the Blender cars, bus, golf cart and motorcycle (vehicle-models.js); the code-built ones if they don't load
  await loadCribModel(); // Kevin's Tool Crib as a Blender set piece (crib-model.js); the code-built crib if it doesn't load
  await loadLovecraftModel(); // the Lovecraft house as a Blender set piece (lovecraft-model.js); the code-built house if it doesn't load
  await loadFishShackModel(); // the Fish Shack and the pier as a Blender set piece (fish-shack-model.js); the code-built shed and pier if it doesn't load
  await loadStripMallModel(); // the strip mall (Summit Slice, Peak Threads) as a Blender set piece (strip-mall-model.js); the code-built mall if it doesn't load
  await loadClothesModel(); // Peak Threads' clothes (clothing-wear.js); without it a bought piece shows as the code's base cloth in its colour
  await loadMallStaffModel(); // the strip mall's people (mall-staff-model.js); without it they are code-built
  await loadMpfbCharacters(); // the strip mall's people as MPFB characters playing their own clips (mpfb-characters.js, baked-character.js); without them the above

  setFlatZones([...config.slots.map(s => (s.id === 'garden' ? { ...gardenBlock(s), y: 0.34, fall: 3 } : s.id === 'north-lawn' ? { ...picnicBlock(s), y: 0.36, fall: 3 } : { x: s.x, z: s.z, r: 6.8, y: 0.45 })), ...bocceFlatZones()]); // the bocce court is flat too (the garden's block: flat at the town's level)
  // the ground round a game takes on its mood: grey, sickly and trampled round Arkham, bright and clover-green round the unicorns
  setGroundTints(config.games.flatMap(g => {
    const s = config.slots.find(x => x.id === g.slot);
    if (!s) return [];
    if (g.theme === 'arkham') return [{ x: s.x, z: s.z, r: 22, color: '#6f7458', k: 0.75 }];
    if (g.theme === 'unicorns') return [{ x: s.x, z: s.z, r: 18, color: '#9be070', k: 0.45 }];
    return [];
  }));
  progress(0.2, 'Raising the mountains...'); await frame();
  const world = buildWorld(scene, config.slots);
  progress(0.5, 'Building the house...'); await frame();
  const house = buildHouse(world.root);
  progress(0.6, 'Setting the game tables...'); await frame();
  const built = buildAreas(world.root, config);
  const areas = built.areas;
  const colliders = [...world.colliders, ...house.colliders, ...built.colliders];
  buildWorldProps(world.root, colliders, worldEdits); // the editor's doodads, houses and fences (their colliders join the list)

  const isClear = (x, z, pad) => {
    if (x > HOUSE.minX - 1.5 && x < HOUSE.maxX + 1.5 && z > PORCH.minZ - 2.4 && z < HOUSE.maxZ + 1) return false;
    for (const a of areas) if (a.rect ? x > a.rect.minX - pad && x < a.rect.maxX + pad && z > a.rect.minZ - pad && z < a.rect.maxZ + pad : Math.hypot(x - a.x, z - a.z) < 6.8 + pad) return false; // (a.rect: the garden's block)
    if (world.onTrail(x, z, pad)) return false;
    if (inFrisbeeField(x, z, pad)) return false; // the frisbee field is mown
    if (Math.hypot(x - MAILBOX.x, z - MAILBOX.z) < 1.2) return false;
    if (!bocceClear(x, z, pad)) return false; // no grass on the bocce court
    for (const c of CLEARINGS) if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return false;
    if (roadEdgeDist(x, z) < SIDEWALK_W + 1 + pad) return false; // roads and sidewalks
    if (z < -40 - pad && z > -58 - pad && x > -97 - pad && x < 58) return false; // the street in front of the fence
    for (const r of [...NEIGHBORHOODS, SHOPS, STORE_LOT]) if (x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad) return false;
    for (const c of colliders) {
      if (c.type === 'circle' && Math.abs(x - c.x) < c.r + pad && Math.abs(z - c.z) < c.r + pad && Math.hypot(x - c.x, z - c.z) < c.r + pad) return false;
      if (c.type === 'box' && x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return false;
    }
    return true;
  };
  progress(0.7, 'Growing the woods...'); await frame();
  world.scatter(isClear, colliders, (x, z, pad) => isClear(x, z, pad) && !areas.some(a => a.lawnR && Math.hypot(x - a.x, z - a.z) < a.lawnR + pad)); // the woods' trunks join the colliders (no tree on a game's lawn, a.lawnR: the unicorns' in the woods corner)
  world.setQuality?.(quality); // world.js thins the grass in Fast mode

  const ui = new UI();
  progress(0.8, 'Waking up the neighbors...'); await frame();
  applySavedLooks(await loadNpcLooks()); // the NPC Editor's saved looks (npc-looks.js keeps the people's and unicorns'; the dogs' merge over DAX / NALA). Nothing saved: as built in
  const npcs = new NpcSystem(scene, areas, world.trailPaths, ui);
  for (const d of npcs.npcs) { const tg = ui.nameTag(d.body.root, d.tag || d.name, '#ffffff'); tg.max = 16; tg.fade = 11; }
  for (const a of areas) {
    if (a.place) continue; // the dock names itself (Kevin's sign); no "coming soon" label
    const text = a.game ? a.game.name : a.slot.name;
    ui.areaLabel(new THREE.Vector3(a.x, 4.6, a.z), text, a.game ? a.game.theme : 'soon');
  }

  progress(0.84, 'Tuning the sounds...'); await frame();
  const audio = new AudioEngine();
  npcs.audio = audio; // the dogs register their own sound effects (yipe, crunch, thump) on it
  registerQolSfx(audio); // the basket, pickups, the porch swing, footsteps by surface, menus (qol-sfx.js)
  mountMixer(audio, store); // Master / Effects / Ambience / Voices / Music sliders on Settings > Sound (saved levels applied here)
  // the yard's music (music.js) keeps out of the intro, the tutorial and the mini-games (a takeover with `minigame`); the boat has its own
  audio.musicApi.blocker = () => (mode === 'intro' ? 'intro' : mode !== 'play' ? 'not-playing' : tutorial?.active ? 'tutorial' : player.takeover?.minigame ? 'minigame' : null);
  progress(0.86, 'Painting the sky...'); await frame();
  const daynight = createDayNight({ scene, renderer, world, ink, npcs, audio }); // the sky and the light follow Eastern time
  // a few real lights that follow the nearest lamps, so people (not just the ground) are lit under them at night
  const lampLights = Array.from({ length: 4 }, () => { const l = new THREE.PointLight('#ffd98e', 0, 26, 2); l.userData.lampLight = true; scene.add(l); return l; }); // the flag: Max gives them shadows (daynight.js)
  let lampPick = 0;
  // characters talk out loud: people babble, the dogs bark or whine, unicorns neigh
  npcs.onSay = (d, text, hint) => {
    const p = d.body.root.position;
    if (d.kind === 'dog') audio.dogVoice(d.id, p.x, p.y + 0.6, p.z, text, dogMood(d.id, text, hint, d._frame?.r?.anim ?? d._s?.anim)); // (the mood: dog-voice.js)
    else if (d.kind === 'unicorn') audio.neigh(p.x, p.y + 1.4, p.z, d.voice?.pitch || 1);
    else {
      let h = 0;
      for (const ch of d.id) h = (h * 31 + ch.charCodeAt(0)) % 997;
      audio.speak(p.x, p.y + 1.6, p.z, text, d.voice || { pitch: 120 + (h % 110) });
      d.body.say?.(0.8 + text.length * 0.05);
    }
  };
  for (const a of areas) audio.addTable(a.game ? (a.game.theme === 'arkham' || a.game.theme === 'unicorns' ? a.game.theme : 'generic') : a.theme, a.x, a.z);

  // ---------------------------------------------------------------- profile

  let profile = store.get('profile', null);
  if (!profile || !profile.id) profile = { id: uuid(), name: '', ...randomLook() };
  if (profile.voice === undefined) profile.voice = 1;
  if (!profile.look) profile.look = {};
  const playerLook = () => ({ ...profile }); // avatarLook() turns skin indices into colours
  const player = new Player(scene, playerLook(), colliders);
  player.place(SPAWN.x, SPAWN.z, SPAWN.yaw);
  const selfTag = ui.nameTag(player.character.root, profile.name || 'You', profile.color);
  player.onStep = (x, z) => playStep(audio, stepSurface(x, z, world.onTrail(x, z, 0.1))); // (stone, gravel, leaves, water, snow, puddles too: qol-sfx.js)
  player.onVault = () => { audio.ui('whoosh'); ui.hint(null); };
  player.onVault = () => { audio.ui('whoosh'); ui.hint(null); };
  // everybody has a body: you bump into the neighbours, the dogs, the unicorns and the other players instead of
  // walking through them (seated folk and anything hidden are skipped)
  const bodies = [];
  player.dynamic = () => {
    bodies.length = 0;
    const px = player.pos.x, pz = player.pos.z;
    for (const d of npcs.npcs) {
      const p = d.body.root.position;
      if (!d.body.root.visible || Math.abs(p.x - px) > 3 || Math.abs(p.z - pz) > 3) continue;
      if (d.kind === 'dog' && npcs.dogSync.mine?.(d.id)) continue;   // the dog walking with you never blocks your way
      bodies.push({ x: p.x, z: p.z, r: d.kind === 'unicorn' ? 0.55 : d.kind === 'dog' ? Math.max(0.4, (d.body.halfLen || 0) * 0.95) : 0.3 });
    }
    for (const r of remotes.map.values()) {
      const p = r.ch.root.position;
      if (Math.abs(p.x - px) < 3 && Math.abs(p.z - pz) < 3) bodies.push({ x: p.x, z: p.z, r: 0.3 });
    }
    for (const f of features) for (const b of f.bodies?.() || []) bodies.push(b); // feature NPCs (scouts, Joyce, residents)
    return bodies;
  };

  const input = new Input(canvas, $('#joystick'));
  input.toast = m => ui.toast(m); // controller connected / unplugged
  ui.glyphs = w => input.glyph(w); // hints say X instead of E when the last input came from a pad
  input.onDevice = () => ui.syncGlyphs();
  const remotes = new Remotes(scene, ui);

  // the morning (intro.js): first person from the bed to the porch. Seen once (this device, or this account on the
  // server: lib/intro.js), it may be skipped with a tap, a click, any key or a pad button (handleKeys, the pointerdown below)
  const intro = new Intro({
    player, house, camera, ink, scene, hemi: world.hemi, ui, audio, renderer, profile,
    onDone: () => {
      mode = 'play'; showHud();
      store.set('introSeen', true); net.send({ t: 'intro', seen: 1 }); // (the server keeps it for a signed-in player's other devices)
      ui.hint(input.lastDevice === 'pad' ? 'Left stick to walk, right stick to look' : 'WASD to walk, right-drag to look, Enter to chat'); setTimeout(() => ui.hint(null), 6000); maybeTutorial();
    },
  });
  let mode = 'attract'; // (up here: the intro's skip listeners just below can hear a click or a pad waking while the world is still loading)
  let introHeard = false; // the server says this account has seen the morning (it comes before the welcome)
  const introSeen = () => introHeard || store.get('introSeen', false) === true;
  const skipWords = () => input.lastDevice === 'pad' ? 'Press any button to skip' : input.lastDevice === 'touch' || matchMedia('(pointer: coarse)').matches ? 'Tap to skip' : 'Press any key or click to skip';
  const showSkip = () => { const sk = $('#skip'); sk.classList.add('intro-skip'); sk.textContent = skipWords(); sk.hidden = !(mode === 'intro' && intro.running && intro.skippable); };
  // a plain tap or left click skips (a drag to look round or a right click does not)
  { let down = null;
    addEventListener('pointerdown', e => { down = mode === 'intro' && e.button === 0 ? { x: e.clientX, y: e.clientY, at: performance.now() } : null; }, true);
    addEventListener('pointerup', e => { if (down && mode === 'intro' && e.button === 0 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12 && performance.now() - down.at < 700) intro.trySkip(); down = null; }, true); }
  { const prev = input.onDevice; input.onDevice = d => { prev?.(d); if (mode === 'intro') showSkip(); }; } // (the words follow the device in your hands)

  // ---------------------------------------------------------------- network

  let online = 1;
  const net = new Net({
    status: s => ui.setOnline(online, s),
    welcome: m => {
      Object.assign(selfExt, m.ext || {});
      remotes.clear();
      for (const p of m.players) remotes.add(p);
      online = m.players.length + 1;
      ui.setOnline(online, 'online');
      if (!seenChat) for (const c of m.chat) ui.chatLine(c.name, c.color, c.text);
      seenChat = true;
    },
    join: m => { remotes.add(m.p); online++; ui.setOnline(online, net.status); ui.chatLine(null, null, `${m.p.name} wandered in.`, true); },
    leave: m => {
      const r = remotes.map.get(m.sid);
      if (r) ui.chatLine(null, null, `${r.name} headed home.`, true);
      remotes.remove(m.sid); online = Math.max(1, online - 1); ui.setOnline(online, net.status);
    },
    snap: m => remotes.snap(m),
    ext: m => { if (m.sid === net.sid) Object.assign(selfExt, m.ext); else remotes.ext(m); },
    profile: m => { if (m.sid !== net.sid) remotes.profile(m); },
    chat: m => {
      ui.chatLine(m.name, m.color, m.text);
      const who = m.sid === net.sid ? player.character.root : remotes.map.get(m.sid)?.ch.root;
      if (who) {
        ui.say(who, m.text, 6, 2.3, m.sid === net.sid ? 'player' : '');
        (m.sid === net.sid ? player.character : remotes.map.get(m.sid)?.ch)?.say?.(0.8 + m.text.length * 0.05); // the mouth moves while they talk
        const v = m.sid === net.sid ? voiceOf(profile.voice) : voiceOf(remotes.map.get(m.sid)?.voice);
        audio.speak(who.position.x, who.position.y + 1.6, who.position.z, m.text, v);
      }
    },
    emote: m => {
      const r = remotes.emote(m.sid, m.e, performance.now() / 1000);
      if (!r) return;
      r.mateSid = m.e === 'highfive' ? m.to : null; // the hand meets that person's (dance-pair.js)
      { const A = r.ch.attn; A.talkUntil = GAZE.now + 1.2; A.to = m.to === net.sid ? player.character : remotes.map.get(m.to)?.ch || null; } // (the voice: the look goes to them, gaze.js)
      ui.say(r.ch.root, EMOJI[m.e] || '!', 1.8, 2.3);
      const rp = r.ch.root.position;
      audio.emoteVoice(m.e, rp.x, rp.y + 1.6, rp.z, voiceOf(r.voice));
      if (m.to === net.sid) { ui.toast(`${r.name} ${m.e === 'highfive' ? 'high-fived' : m.e === 'wave' ? 'waved at' : 'cheered for'} you!`); audio.ui('pop'); }
    },
    sys: m => ui.chatLine(null, null, m.text, true),
    account: m => accounts.onServer(m), // the server made you a guest, or kept a claimed name from you
    full: () => ui.toast('Breneland is full right now - you can still look around.'),
    disconnected: () => { remotes.clear(); online = 1; ui.setOnline(1, 'offline'); },
  });
  net.offset = serverOffset;
  npcs.dogSync.attach(net); // the dogs' reactions are shared events on the lobby connection (dogs-sync.js, lib/dogs.js)
  let seenChat = false;
  const selfExt = {}; // what the server publishes about you (features fill it; see server.js feature modules)

  // ---------------------------------------------------------------- features
  // Features (inventory, fishing, the tire swing) are plug-ins. See docs/CONTRACTS.md. Each one is
  //   { name, update?(dt, now), target?(px, pz, yaw) -> {hint, prio, run} | null, onKey?(code) -> bool, help?: [[['Tab'], 'text']] }
  const ctx = {
    THREE, scene, camera, renderer, world, house, areas, colliders, player, npcs, remotes, net, audio, ui, input, profile, store,
    selfExt, hud: $('#hud'), canvas, config, // config.games has every game, store-only ones too (they have no area)
    get accounts() { return accounts; }, // headers() carries the session token (/api/stats and /api/launch want it for a claimed name)
    refreshTag: () => { selfTag.remove(); Object.assign(selfTag, ui.nameTag(player.character.root, profile.name || 'You', profile.color)); }, // (clothing-store: the tag follows a rebuilt character)
    get mode() { return mode; },
    get playing() { return mode === 'play'; },
    inventory: null,
    quests: null,   // the quest tracker (hud-quests.js): ctx.quests.set(id, { title, text, progress, done }) / clear(id)
    currency: null, // the currencies strip (hud-currency.js): fish and treats
    // Earn fish for an activity (server: lib/rewards.js decides, with daily caps). Resolves { ok, n, left, why }.
    reward(kind) {
      return new Promise(res => {
        if (net.status !== 'online') return res({ ok: false, why: 'offline' }); // guests earn too (kept for the visit only)
        const t = setTimeout(() => { off(); res({ ok: false, why: 'timeout' }); }, 5000);
        const off = net.on('reward', m => { if (m.kind === kind) { clearTimeout(t); off(); res(m); } });
        net.send({ t: 'reward', kind });
      });
    },
    // Launch one of Andrew's games by id (the game store's shelves use this), exactly like walking up to its table.
    play(gameId) {
      const a = areas.find(x => x.game?.id === gameId);
      if (a) return play(a);
      const g = config.games.find(x => x.id === gameId);
      if (g) return play({ id: g.slot || g.venue || 'store', game: g }); // a game with no yard slot leaves from its venue (the game store, the Lovecraft house)
    },
  };
  ctx.quests = createQuests(ctx);
  ctx.currency = createCurrency(ctx);
  ui.occluder = (ax, ay, az, bx, by, bz) => !!ctx.indoorView?.blocked(ax, ay, az, bx, by, bz); // no name tags through a house's walls
  progress(0.88, 'Unpacking the pockets...'); await frame();
  ctx.inventory = createInventory(ctx);
  const emotes = createEmotes(ctx, { play: e => doEmote(e) }); // the emotes: the smiley's wheel, the pad's L2 wheel, keys 1-8
  // the HUD: Andrew's saved layouts placed by hud-layout.js (ctx.hudLayout); the tool radial (hud-tools.js);
  // the pad's own pieces (hud-pad.js: the X and Y slots, the tool picker, the log off card; first, so its picker gets A and B)
  const features = [createPadHud(ctx), ctx.inventory, emotes, ctx.quests, createFishing(ctx), createSwing(ctx), createBocce(ctx), createTools(ctx), createHudLayout(ctx)];
  ctx.features = features; // known while the makers run, so a feature can find one made before it: the bus finds the cars
  // the town-sized map's features (each one its own file; a feature that fails to start is skipped, not fatal)
  const makers = [createGaze, createGates, createDogToys, createDogWalk, createSwim, createScouts, createGarden, createPicnic, createLawn, createPieContest, createWaterTower, createGameStore, createStripMall, createToolCrib, createSummitSquare, createDnd, createFishShack, createTownLife, createPark, createCars, createBus, createVoice, createPorchSwing, createDogBeds, createHaptics, createKevinCrew, createBuddyCarol, createParkLot, createJoyceCart, createJoyceHouse, createFirepit, createScenic, createPaws, createLovecraftHouse, createMainHouse, createHouseRest, createDancePair, createMaze, createMazeBoard, createFires, createMazeResult, createAchievements, createTableGames, createHudLiveEdit, createClothingStore, createWardrobe, createMallStaff];
  for (const [i, make] of makers.entries()) {
    // one loading step per feature, painted before it runs: a device that dies during loading tells the next load where (boot-guard.js)
    progress(0.9 + i * 0.005, 'Starting the ' + make.name.replace(/^create/, '').replace(/([A-Z])/g, ' $1').trim().toLowerCase() + '...'); await frame();
    try { const f = make(ctx); if (f) features.push(f); } catch (e) { console.error('[feature] could not start', make.name, e); }
  }
  progress(0.97, 'Drawing the map...'); await frame();
  try { features.push(createMinimap(ctx)); } catch (e) { console.error('[feature] could not start the minimap', e); }
  progress(0.98, 'Checking the weather...'); await frame();
  try { features.push(createWeather(ctx)); } catch (e) { console.error('[feature] could not start weather', e); } // Arden, NC's real weather (weather.js)
  ctx.features = features;
  audio.musicApi.place = musicPlace(ctx);   // the area, the store or the Lovecraft house, fishing: music.js chooses by it
  audio.backroom.source = backroomSource(ctx, { weather: WEATHER, light: LIGHT }); audio.backroom.wire(ctx);
  const dogWalk = features.find(f => f.name === 'dog-walk') || null;   // the E prompt's words by a dog on a walk
  // whatever stands between the follow camera and you fades out of the way (camera-fade.js); not a feature: it runs after
  // the camera and every body has moved, just before the labels and the render
  const cameraFade = createCameraFade(ctx);
  // politeness physics: NPCs never stand inside each other, a player or a prop (crowd.js), after every body has moved
  const crowd = createCrowd(ctx);
  ctx.cameraFade = cameraFade;
  // every shadow map, drawn just before the colour pass: the sun's box follows the view, static casters as cell proxies
  // (shadows.js)
  const shadows = createShadows({ renderer, scene, camera, sun: world.sun, ink });
  ink.beforePasses = () => shadows.render(); ink.afterPasses = () => shadows.afterPasses();
  // a scenic view hides what's behind your head through shadows.js and raises the graphics while it lasts (gfx.js setView, then this)
  ctx.occlusion = createOcclusion({ renderer, scene, camera, ink, player }); // what the opaque world hides is not drawn (occlusion.js)
  ctx.shadows = shadows; ctx.ink = ink; ctx.regraphics = () => setQuality(quality, 'auto');
  // every character's rigid parts drawn as one skinned mesh per material (rigid-merge.js): people, dogs, unicorns
  const rigid = createRigidMerge({ scene, roots: function* () {
    for (const d of npcs.npcs) yield d.body.root;
    for (const r of remotes.map.values()) yield r.ch.root;
    yield player.character.root;
    for (const it of ui.items) if (it.tag && it.obj) yield it.obj;
    for (const f of features) if (f.characterRoots) yield* f.characterRoots(); // a feature's own people, e.g. the Lovecraft house's folk
  } });
  createPropMerge({ scene, characters: rigid.api.roots }); // the still loose props, one mesh per material and cell (prop-merge.js)
  ctx.warmViews = createWarmViews(ctx); // the town drawn once off screen in the first seconds, so first sights are not long frames (warm-views.js)
  for (const f of features) for (const [keys, text] of f.help || []) ui.addHelp(keys, text);
  for (const [keys, text] of input.helpLines || []) ui.addHelp(keys, text);

  // ---------------------------------------------------------------- start screen

  const returning = (() => {
    const last = store.get('last', null);
    if (!last || Date.now() - last.ts > 3 * 3600 * 1000) return null;
    return areas.find(a => (last.game ? a.game?.id === last.game : a.id === last.slot)) || features.map(f => f.returnSpot?.(last)).find(Boolean) || null; // a feature may take you back to its own table: the Lovecraft house's parlour. By the game, not the slot: a table that moved (the unicorns to the woods corner) still welcomes you back at it, and a slot's new game never welcomes you back from its old one
  })();
  // ?signin=<game>: one of Andrew's games sent them here to sign in. The start screen does its job and then,
  // instead of the morning walk, they go straight to that game's table as themselves (see play()).
  const signinTo = (() => {
    const id = qp.get('signin');
    const g = id && !areas.some(x => x.game && x.game.id === id) ? config.games.find(x => x.id === id) : null; // a store-only game
    const a = id ? areas.find(x => x.game && x.game.id === id) || (g ? { id: 'store', game: g } : null) : null;
    if (a) history.replaceState(null, '', location.pathname + location.hash);
    return a || null;
  })();

  const editor = new AvatarEditor({
    profile, voices: VOICES,
    onChange: () => refreshPreview(),
    onVoice: i => { audio.start(); const c = camera.position; audio.speak(c.x, c.y, c.z + 0.5, 'Hi there, nice to meet you!', voiceOf(i)); },
  });
  // name + PIN accounts on the start screen (accounts.js; server side lib/accounts.js)
  const accounts = createAccounts({
    store, profile, input, ui,
    enter: editing => enterAs(editing), refresh: () => refreshPreview(), remount: () => editor.mount($('#avatar-editor')),
    fresh: () => ({ id: uuid(), name: '', ...randomLook() }),
  });
  net.helloExtra = () => accounts.hello(); // the session token (or guest: true) rides along with the hello
  function buildStart() {
    const nameIn = $('#name-input');
    nameIn.value = profile.name || '';
    editor.mount($('#avatar-editor'));
  }
  function refreshPreview() {
    player.setProfile(playerLook());
    selfTag.remove();
    Object.assign(selfTag, ui.nameTag(player.character.root, profile.name || 'You', profile.color));
  }

  // the owner signing in gets his tools menu first (once a page: Play goes on into the game); everyone else, and a
  // sign in for one of the games (?signin), goes straight in as before
  function enterAs(editing) {
    if (!editing && accounts.owner && !signinTo && !toolsMenu.played) {
      $('#start').hidden = true;
      toolsMenu.open(accounts.auth.name).then(() => begin(false));
      return;
    }
    begin(editing);
  }

  function showStart(editing = false) {
    buildStart();
    $('#start').hidden = false;
    $('#go').textContent = editing ? 'Back outside' : signinTo ? `Go play ${signinTo.game.name}` : returning ? 'Back to the yard' : 'Step outside';
    setTimeout(() => $('#name-input').focus(), 50);
    $('#go').onclick = () => accounts.go(editing);
    accounts.show(editing);
  }

  async function begin(editing) {
    const name = $('#name-input').value.replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!name) { $('#name-input').focus(); $('#name-input').placeholder = 'Pick a name first!'; return; }
    profile.name = name;
    if (!accounts.guest) store.set('profile', profile); // a guest's visit is not saved
    refreshPreview();
    $('#start').hidden = true;
    audio.start();
    if (editing) { net.updateProfile(profile); mode = 'play'; player.controls = true; return; }
    net.connect(profile, () => ({ x: player.pos.x, y: player.pos.y, z: player.pos.z, r: player.yaw }));
    if (signinTo) { await ui.fade(1, 10); await play(signinTo); return; }
    if (returning) {
      store.del('last');
      await ui.fade(1, 10);
      const stop = returning.spot || npcs.stopFor(returning);
      player.place(stop.x, stop.z, returning.spot ? returning.spot.yaw : Math.atan2(stop.x - returning.x, stop.z - returning.z));
      player.houseSolid = true; player.controls = true; player.snapCameraBehind();
      mode = 'play'; showHud();
      ui.fade(0, 900);
      ui.toast(`Welcome back from ${returning.game ? returning.game.name : returning.slot.name}!`);
      return;
    }
    runIntro();
  }

  async function runIntro(replay = false) {
    ui.el.fade.style.background = '#1c1a2e';
    await ui.fade(1, 500);
    $('#hud').hidden = true;
    ui.hidePrompt(); ui.hideStats();
    mode = 'intro';
    intro.start({ skippable: replay || introSeen() }); // the first visit always plays it
    showSkip();
    // a device still in the 8 s intro after 30 s is struggling: tell the server log (boot-guard's endpoint) how fast it ran
    const introAt = performance.now(), introFrames = { n: 0 };
    const countFrames = () => { introFrames.n++; if (mode === 'intro') requestAnimationFrame(countFrames); };
    requestAnimationFrame(countFrames);
    setTimeout(() => {
      if (mode !== 'intro') return;
      const fps = introFrames.n / ((performance.now() - introAt) / 1000);
      fetch('/api/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({
        kind: 'slow', msg: `intro still running after 30 s at ${fps.toFixed(1)} fps`, stage: 'intro', secs: 30, q: quality,
        ua: navigator.userAgent.slice(0, 200), w: innerWidth, h: innerHeight }) }).catch(() => {});
    }, 30000);
    await ui.fade(0, 150); // (the eyelids are closed: the morning opens them itself)
    ui.el.fade.style.background = '';
  }

  function showHud() { $('#hud').hidden = false; }

  // ---------------------------------------------------------------- interactions

  const EMOJI = { wave: '\u{1F44B}', cheer: '\u{1F389}', dance: '\u{1F483}', laugh: '\u{1F602}', highfive: '✋', sit: '\u{1FA91}', point: '\u{1F449}', shrug: '\u{1F937}', ballet: '\u{1FA70}', ballroom: '\u{1F339}', hiphop: '\u{1F3A7}' };
  const dismissed = new Set();
  let statsCache = { at: 0, data: null, loading: false };
  let target = null; // what E does right now

  async function refreshStats() {
    if (statsCache.loading || Date.now() - statsCache.at < 30000 || accounts.guest) return;
    statsCache.loading = true;
    try {
      const r = await fetch('/api/stats?player=' + encodeURIComponent(profile.id), { cache: 'no-store', headers: accounts.headers() });
      if (r.ok) statsCache = { at: Date.now(), data: (await r.json()).games, loading: false };
      else statsCache = { at: Date.now(), data: null, loading: false };
    } catch { statsCache = { at: Date.now(), data: null, loading: false }; }
  }

  async function play(area) {
    const g = area.game;
    if (!g) return;
    mode = 'leaving';
    player.controls = false;
    ui.hidePrompt(); ui.hideStats();
    audio.ui('whoosh');
    player.playEmote('cheer', performance.now() / 1000);
    store.set('last', { slot: area.id, game: g.id, ts: Date.now() });
    if (!accounts.guest) fetch('/api/launch', {
      method: 'POST', keepalive: true, headers: { 'content-type': 'application/json', ...accounts.headers() },
      body: JSON.stringify({ player: profile.id, name: profile.name, game: g.id }),
    }).catch(() => {});
    // Signed in: a one-time code goes along, and the game's server trades it for who you are and how you look
    // (lib/handoff.js). A guest just arrives; the game treats them as a visitor.
    const minted = accounts.guest ? null : fetch('/api/handoff/mint', {
      method: 'POST', headers: { 'content-type': 'application/json', ...accounts.headers() },
      body: JSON.stringify({ game: g.id }), signal: AbortSignal.timeout(2500),
    }).then(r => r.json()).then(j => (j && typeof j.code === 'string' ? j.code : null)).catch(() => null);
    ui.el.fade.style.background = g.theme === 'arkham' ? '#0e0c12' : '#fff6dc';
    await ui.fade(1, 900);
    const code = minted ? await minted : null;
    const url = new URL(g.url);
    url.searchParams.set('from', 'breneland');
    url.searchParams.set('bl_player', profile.id);
    if (code) url.searchParams.set('bl', code);
    location.href = url.toString();
  }

  function doEmote(e) {
    if (mode !== 'play') return;
    const now = performance.now() / 1000;
    player.playEmote(e, now);
    ui.say(player.character.root, EMOJI[e] || '!', 1.8, 2.3, 'player');
    audio.emoteVoice(e, player.pos.x, player.pos.y + 1.6, player.pos.z, voiceOf(profile.voice));
    const near = remotes.nearest(player.pos.x, player.pos.z, 4);
    net.emote(e, near ? near.sid : null);
    { const A = player.character.attn; A.talkUntil = GAZE.now + 1.2; A.to = near ? near.ch : null; } // (the voice: the look goes to them, gaze.js)
    if (near && (e === 'wave' || e === 'highfive')) player.yaw = Math.atan2(near.ch.root.position.x - player.pos.x, near.ch.root.position.z - player.pos.z);
    // a high five turns you a little to the left of them, so the hands meet beside both big heads (bodies-poses highfive)
    if (near && e === 'highfive') player.yaw += HIGHFIVE_TURN;
    player.emoteMate = e === 'highfive' ? near : null;
    if (e === 'ballet' || e === 'ballroom' || e === 'hiphop') audio.play('dance-' + e, player.pos.x, player.pos.y, player.pos.z); // (a hook for a dance's own music: 'dance-ballet', 'dance-ballroom', 'dance-hiphop'; silent until sfx-music registers one)
  }

  function interact() {
    if (mode !== 'play') return;
    if (ui.promptOpen && currentArea?.game) return play(currentArea);
    if (!target) return;
    const now = performance.now() / 1000;
    if (target.kind === 'feature') { target.c.run?.(); return; }
    if (target.kind === 'npc') {
      const npc = target.npc;
      player.playEmote('wave', now);
      audio.speak(player.pos.x, player.pos.y + 1.6, player.pos.z, npc.kind === 'dog' ? 'Hey buddy!' : 'Hi!', voiceOf(profile.voice));
      setTimeout(() => npcs.poke(npc, performance.now() / 1000), 550);
      player.yaw = Math.atan2(npc.body.root.position.x - player.pos.x, npc.body.root.position.z - player.pos.z);
      audio.ui('pop');
    } else if (target.kind === 'remote') {
      doEmote('wave');
      ui.toast(`You waved at ${target.remote.name}.`);
    } else if (target.kind === 'mail') {
      openLetter();
    } else if (target.kind === 'home') {
      goHome();
    } else if (target.kind === 'soon') {
      ui.toast(`${target.area.slot.name}: a game will live here someday.`);
    }
  }

  // Log off: the bed (the house: E at the main bed calls ctx.logOff('bed')), Menu > Log off (Settings' "Head home",
  // the pad's log off card: ctx.goHome) and closing the game (pagehide) all let go the same way, through release(): the socket
  // is closed on purpose, at once, so the server's leave hooks run the moment you go (lib/dogs.js sends a walked dog home with
  // why 'left'; Kevin's boat seats, the tire swing, the bocce court and the voice room let go; everyone sees you leave). The
  // bed and the menu then show the card and start over at the start screen (your name is remembered; a claimed name asks for
  // its PIN again).
  function release() {
    if (released) return;
    released = true;
    net.profile = null; // no reconnecting
    try { net.ws?.close(1000, 'bye'); } catch { /* already closed */ }
  }
  let released = false;
  async function logOff(why = 'menu') {
    if (mode !== 'play') return;
    mode = 'leaving';
    loggedOff = why;
    player.controls = false;
    ui.hidePrompt(); ui.hideStats(); ui.hint(null);
    if (why === 'menu') player.yaw = 0; // face the door
    audio.ui('whoosh');
    store.del('last');
    const card = document.createElement('div');
    card.className = 'home-card';
    card.textContent = why === 'bed' ? `Sweet dreams, ${profile.name || 'friend'}! See you next time.` : `Home sweet home. See you next time, ${profile.name || 'friend'}!`;
    ui.el.fade.style.background = '#1c1a2e';
    await ui.fade(1, 900);
    document.body.append(card);
    release();
    setTimeout(() => location.reload(), 1800);
  }
  let loggedOff = null; // (tests: which way you went)
  const goHome = (opts = {}) => logOff(opts.bed ? 'bed' : 'menu'); // the house's bed calls goHome({ bed: true }); ctx.logOff('bed') is the same
  // closing the game (the tab, the window, the app swiped away, or leaving for a game's page): the same release, right now
  // (not 25-50 s later when the server's ping notices); back from the browser's page cache, the page starts over
  addEventListener('pagehide', () => { if (net.profile) { loggedOff ||= 'close'; release(); } });
  addEventListener('pageshow', e => { if (e.persisted && released) location.reload(); });

  function openLetter() {
    const body = $('#letter-body');
    body.replaceChildren();
    const p1 = document.createElement('p');
    p1.textContent = `Dear ${profile.name}, welcome to Breneland! Every table in the yard is a game. Walk up to one and it will ask if you want to play.`;
    const ul = document.createElement('ul');
    for (const a of areas) {
      const li = document.createElement('li');
      li.textContent = a.game ? `${a.game.name} - ${a.slot.name}` : a.place ? `${a.slot.name} - ${a.letter || 'a place to visit'}` : `${a.slot.name} - waiting for a game`;
      ul.append(li);
    }
    const p2 = document.createElement('p');
    p2.textContent = 'Dax and Nala are out in the yard. Nala will run right over; Dax is shy, so walk up slowly and say hi (E) and he will warm up to you. Say hi to the neighbors with E, press Enter to chat with anyone else who is here, and 1 to 8 for a wave, a cheer and more (3 opens the dances). The ? button shows every control.';
    body.append(p1, ul, p2);
    $('#letter').hidden = false;
    player.controls = false;
    audio.ui('chime');
  }

  $('#letter-close').onclick = () => { $('#letter').hidden = true; if (mode === 'play') player.controls = true; };
  $('#btn-help').onclick = () => toggleHelp();
  // ---- Settings (settings.js): Sound, Graphics, Controls (the picture), Voice (the voice piece fills it), You
  const settings = createSettings({ root: $('#help'), input, audio });
  ui.settings = settings; // ui.settings.addSection('voice', { title, summary }) -> { body, setSummary, open }
  const controlsPage = mountControls($('#help [data-page="controls"]'), { input, ui, store });
  settings.onShow('controls', () => controlsPage.onShow());
  const syncSettings = () => { // the words that follow the device you are using
    settings.setSummary('controls', controlsPage.deviceName(controlsPage.deviceNow()));
    const tip = $('#help .set-tip-text'), d = controlsPage.deviceNow();
    tip.textContent = `Walk up to a table to play a game. Say hi to everyone with ${d === 'touch' ? 'the E button' : input.glyph('E')}.`;
    $('#help [data-page="sound"] .set-line-t small').textContent = d === 'kbm' ? 'M on the keyboard' : 'On or off for the whole game';
  };
  settings.onShow('top', syncSettings);
  for (const id of ['sound', 'graphics', 'controls', 'voice', 'you']) settings.onShow(id, () => { if (!$('#help').hidden) audio.play('menu-page'); }); // a page turns (qol-sfx.js)
  { const prev = input.onDevice; input.onDevice = d => { prev?.(d); if (!$('#help').hidden) { syncSettings(); controlsPage.markUsing(); } }; }
  settings.onShow('you', () => {
    $('#help .you-name').textContent = profile.name || 'You';
    $('#help .you-dot').style.setProperty('--c', profile.color || '#ffd34d');
    $('#help .you-status').textContent = accounts.guest ? 'Visiting as a guest: nothing is saved' : accounts.signedIn ? 'Your account (name and PIN)' : '';
  });
  for (const b of $('#help').querySelectorAll('[data-close]')) b.onclick = () => toggleHelp(false);
  $('#help-close').onclick = () => toggleHelp(false);
  for (const b of $('#help').querySelectorAll('[data-mute]')) b.onclick = () => toggleSound();
  $('#btn-edit').onclick = () => { toggleHelp(false); player.controls = false; mode = 'menu'; showStart(true); };
  $('#btn-intro').onclick = () => { toggleHelp(false); runIntro(true); }; // (a replay may always be skipped)
  $('#btn-tutorial').onclick = () => { toggleHelp(false); startTutorial(); }; // (tutorial.js; /tutorial in the chat does the same)
  $('#btn-home').onclick = () => { toggleHelp(false); goHome(); }; // log off, like walking back in through the front door
  ctx.goHome = goHome; ctx.logOff = logOff; ctx.openSettings = () => toggleHelp(true); // (the pad's log off card: hud-pad.js; the house's bed: ctx.logOff('bed'))
  // the PC's small key hint caps on the HUD's buttons (E, Space, G, Tab, N, J, H, Z X C V): Settings > Controls switches them off
  { const kb = $('#btn-keyhints'); const setKc = on => { $('#hud').classList.toggle('no-kc', !on); if (kb) { kb.setAttribute('aria-checked', String(on)); kb.firstElementChild.textContent = on ? 'On' : 'Off'; } };
    setKc(store.get('keyHints', true) !== false);
    if (kb) kb.onclick = () => { const on = $('#hud').classList.contains('no-kc'); store.set('keyHints', on); setKc(on); audio.ui?.('blip'); }; }
  const qBtns = [...$('#btn-quality').querySelectorAll('[data-q]')];
  // the line under Graphics: what this device is, what auto picked and why (gfx.js), and "Pick for me" back to auto
  const gfxLine = $('#gfx-auto .set-gfx-t'), gfxPick = $('#btn-gfx-auto');
  const setQualityLabel = () => {
    for (const b of qBtns) b.setAttribute('aria-checked', b.dataset.q === quality ? 'true' : 'false');
    const scaled = GFX.cls !== 'desktop' ? ` (${GFX.cls})` : '';
    settings.setSummary('graphics', quality === 'low' ? 'Fast: smooth on older computers' : quality === 'max' ? (scaled ? `Max${scaled}: scaled to this ${GFX.cls}` : 'Max: soft shadows, needs a strong one') : `High${scaled}: the full look`);
    if (gfxLine) {
      const what = describe(GFX.info);
      const checked = GFX.why ? ` ${GFX.why}${GFX.fps ? ` (${GFX.fps} fps)` : ''}.` : '';
      gfxLine.textContent = GFX.mode === 'auto'
        ? `Picked for you: ${GFX.label}. ${what}.${checked}`
        : GFX.dropped ? `You picked ${LEVEL_NAMES[GFX.dropped]}; this visit dropped to ${LEVEL_NAMES[quality]} at ${GFX.fps} fps. ${what}.`
          : `You picked ${GFX.label}. ${what}. Pick for me starts on ${LEVEL_NAMES[startLevel(GFX.info)]}.`;
    }
    if (gfxPick) { gfxPick.setAttribute('aria-pressed', GFX.mode === 'auto' ? 'true' : 'false'); gfxPick.textContent = GFX.mode === 'auto' && gfxSample.running ? 'Checking...' : 'Pick for me'; }
  };
  // auto: a short frame sample decides whether the device can keep the level it was given (the start screen at first run)
  const gfxSample = createFrameSample({ onDone: fps => {
    if (GFX.mode !== 'auto') return;
    // (one step at most here: the start screen is drawn while the world is still settling, so its sample is the weaker one;
    // only the walk-out check below can take a device the rest of the way to Fast)
    const to = LEVELS[Math.max(LEVELS.indexOf(levelAfterSample(quality, fps)), LEVELS.indexOf(quality) - 1)];
    GFX.fps = fps; GFX.sampled = true;
    GFX.why = to === quality ? 'The frame check kept it' : `The frame check moved it down from ${LEVEL_NAMES[quality]}`;
    if (to !== quality) setQuality(to, 'auto'); else setQualityLabel();
    store.set('gfxAuto', { sig: GFX.info.sig, level: to, why: GFX.why, fps });
  } });
  if (GFX.mode === 'auto' && !GFX.sampled) gfxSample.start();
  if (gfxPick) gfxPick.onclick = () => {
    GFX.mode = 'auto'; store.set('gfxMode', 'auto'); store.del('gfxAuto');
    GFX.why = ''; GFX.fps = null;
    const q = startLevel(GFX.info);
    if (q !== quality) setQuality(q, 'auto');
    gfxSample.start(); setQualityLabel();
  };
  for (const b of qBtns) b.onclick = () => { if (b.dataset.q !== quality || GFX.mode === 'auto') setQuality(b.dataset.q); };
  // how: 'auto' (gfx.js or the running check picked it), 'init' (the level at load) or nothing (the player chose it: it
  // wins from now on)
  function setQuality(q, how) {
    if (how !== 'auto') GFX.dropped = null;
    if (!how) { GFX.mode = 'manual'; store.set('gfxMode', 'manual'); gfxSample.stop(); }
    setLevel(q);
    quality = q; store.set('quality', q); applyPixelRatio(); ink.quality = q; ink.samples = GFX.s.msaa; fitW = 0; setQualityLabel(); world.setQuality?.(q);
    const sm = GFX.s.sun;
    world.sun.shadow.mapSize.set(sm, sm);
    world.sun.shadow.map?.dispose(); world.sun.shadow.map = null;
  }
  // the E button: a press is the E key held down (so a hold winds up a throw, dog-toys.js) and letting go releases it;
  // a click with no pointer behind it (keyboard focus, the pad's HUD focus) still interacts at once
  { const act = $('#btn-act'); let held = null;
    const up = e => { if (held !== null && e.pointerId === held) { held = null; input.padKey('KeyE', false); } };
    act.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button !== 0) return; held = e.pointerId; input.padKey('KeyE', true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) act.addEventListener(ev, up);
    act.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') up(e); });
    act.onclick = e => { if (!e.detail) interact(); }; }
  // a controller in hand: the HUD grows for couch distance (style.css body.pad); the layout itself follows in hud-layout.js
  { const prevDev = input.onDevice; input.onDevice = d => { prevDev?.(d); document.body.classList.toggle('pad', input.lastDevice === 'pad'); }; }

  function toggleHelp(force) {
    const h = $('#help');
    const show = force ?? h.hidden;
    if (show && h.hidden) { syncSettings(); settings.opened(); }
    if (show === h.hidden) audio.play(show ? 'menu-open' : 'menu-close');
    h.hidden = !show;
    if (mode === 'play') player.controls = !show;
  }
  let muted = store.get('muted', false);
  audio.setMuted(muted);
  const soundIcon = () => {
    for (const b of $('#help').querySelectorAll('[data-mute]')) { b.setAttribute('aria-checked', muted ? 'false' : 'true'); b.firstElementChild.textContent = muted ? 'Off' : 'On'; }
    settings.setSummary('sound', muted ? 'Sound is off' : Object.values(audio.levels || {}).every(v => v === 1) ? 'Every level as mixed' : 'Your own mix');
  };
  soundIcon();
  $('#help [data-page="sound"]').addEventListener('input', soundIcon); // the summary follows the sliders
  $('#help [data-page="sound"]').addEventListener('click', e => { if (e.target.closest('.mix-reset')) setTimeout(soundIcon, 0); });
  function toggleSound() { muted = !muted; store.set('muted', muted); audio.setMuted(muted); soundIcon(); }

  // chat
  const chatIn = ui.el.chatInput;
  chatIn.addEventListener('focus', () => { input.typing = true; ui.el.chat.classList.add('open'); ui.wakeChat(); });
  chatIn.addEventListener('blur', () => { input.typing = false; ui.el.chat.classList.remove('open'); ui.wakeChat(); });
  // the heart pill: who is here right now
  const who = $('#who');
  $('#online').onclick = () => {
    if (!who.hidden) { who.hidden = true; return; }
    who.replaceChildren();
    const t = document.createElement('div'); t.className = 'who-title'; t.textContent = online === 1 ? 'Just you right now' : 'Here right now'; who.append(t);
    const row = (name, color, me) => { const r = document.createElement('div'); r.className = 'who-row' + (me ? ' me' : ''); const i = document.createElement('i'); i.style.setProperty('--c', color || '#ffd34d'); const n = document.createElement('span'); n.textContent = me ? (name || 'You') + ' (you)' : name; r.append(i, n); who.append(r); return r; };
    row(profile.name, profile.color, true);
    const voice = features.find(f => f.name === 'voice'); // voice.js adds a Mute button to each row
    for (const r of remotes.map.values()) { const el = row(r.ext?.maze ? r.name + ' (in the maze)' : r.name, r.color, false); voice?.whoRow?.(el, r); } // a row says who is below
    who.hidden = false;
    audio.ui('blip');
    clearTimeout(who._t); who._t = setTimeout(() => { who.hidden = true; }, 6000);
  };
  ui.el.chatForm.addEventListener('submit', e => {
    e.preventDefault();
    const text = chatIn.value.trim();
    chatIn.value = '';
    chatIn.blur();
    if (!text) return;
    if (text[0] === '/') { chatCommand(text); return; } // a command stays on this screen: nothing is sent
    if (net.status === 'online') net.chat(text);
    else {
      ui.chatLine(profile.name, profile.color, text);
      ui.say(player.character.root, text, 6, 2.3, 'player');
      audio.speak(player.pos.x, player.pos.y + 1.6, player.pos.z, text, voiceOf(profile.voice));
    }
  });
  chatIn.addEventListener('keydown', e => { if (e.key === 'Escape') { chatIn.value = ''; chatIn.blur(); } });

  // chat commands (typed in the chat box, never sent): /tutorial, /help; anything else gets a hint
  function chatCommand(text) {
    const cmd = text.slice(1).trim().split(/\s+/)[0].toLowerCase();
    if (cmd === 'tutorial') startTutorial();
    else if (cmd === 'help') toggleHelp(true);
    else ui.chatLine(null, null, cmd ? `There's no /${cmd.slice(0, 20)} here. Try /tutorial or /help.` : 'Try /tutorial or /help.', true);
  }

  // ---- the first-time tutorial (tutorial.js, loaded only when it runs): after the morning walk, once per browser
  // (localStorage) and per record on the server (lib/tutorial.js: a signed-in player's other devices skip it)
  let tutorial = null, tutHeard = false;
  net.on('tut', m => { if (m.done) { tutHeard = true; store.set('tutorialDone', true); } });
  // the morning, seen on this account (lib/intro.js): this device remembers it too, and a morning already running may be skipped
  net.on('intro', m => { if (m.seen) { introHeard = true; store.set('introSeen', true); if (mode === 'intro' && intro.running && !intro.skippable) { intro.skippable = true; showSkip(); } } });
  net.on('welcome', () => { // (the server's 'tut' comes before its welcome) done here but not on the record yet: tell it
    if (!tutHeard && store.get('tutorialDone', false) && !accounts.guest) net.send({ t: 'tut', done: 1 });
    tutHeard = false;
    if (!introHeard && store.get('introSeen', false) === true && !accounts.guest) net.send({ t: 'intro', seen: 1 }); // (seen here, not on the record yet)
    if (tutorial?.active) net.send({ t: 'tut', on: 1 }); // the badge again after a reconnect
  });
  async function maybeTutorial() {
    if (store.get('tutorialDone', false)) return;
    if (navigator.webdriver && !store.get('tutorialTest', false)) return; // test browsers never meet it unless they ask (like the voice question)
    for (let i = 0; i < 30 && accounts.signedIn && net.status !== 'online'; i++) await new Promise(r => setTimeout(r, 100)); // the record's word
    if (!store.get('tutorialDone', false)) startTutorial();
  }
  async function startTutorial() {
    if (mode !== 'play' || tutorial?.active) return;
    try {
      if (!tutorial) {
        const { createTutorial } = await import('./tutorial.js');
        tutorial ||= createTutorial(ctx, { selfTag: () => selfTag, done: () => { store.set('tutorialDone', true); net.send({ t: 'tut', done: 1 }); } });
      }
      if (mode === 'play' && !tutorial.active) tutorial.start();
    } catch (e) { console.error('[tutorial] could not start', e); }
  }

  function handleKeys() {
    for (const code of input.takePressed()) {
      if (mode === 'intro') { intro.trySkip(); continue; } // any key or pad button, on a visit that may skip
      if (mode !== 'play') continue;
      if (tutorial?.active) { tutorial.onKey(code); continue; } // the click-through has the keys (tutorial.js)
      if (!$('#letter').hidden) { if (code === 'Escape' || code === 'KeyE' || code === 'Enter') $('#letter-close').click(); continue; }
      if (!$('#help').hidden) { // Esc / B back one page (closes at the top), H closes, arrows move like the D-pad
        if (code === 'Escape') { if (!settings.back()) toggleHelp(false); }
        else if (code === 'KeyH') toggleHelp(false);
        else if (code === 'KeyM') toggleSound();
        else if (/^Arrow/.test(code)) input.menuMove(code.slice(5).toLowerCase());
        continue;
      }
      if (!$('#map').hidden && (code === 'Escape' || code === 'KeyN')) { features.find(f => f.name === 'minimap')?.hide(); continue; } // (a popout: everything else still works)
      if (!$('#logoff').hidden) { if (code === 'Escape' || code === 'PadStart') features.find(f => f.name === 'pad-hud')?.logoff.hide(); continue; }
      if (input.hudFocus) { if (code === 'Escape') input.setHudFocus(false); continue; } // the pad is pointing at the HUD (hold View)
      if (features.some(f => f.onKey?.(code))) continue;
      switch (code) {
        case 'Enter': case 'NumpadEnter': case 'KeyT':
          if (ui.promptOpen && code !== 'KeyT') { play(currentArea); break; }
          setTimeout(() => chatIn.focus(), 0); break;
        case 'KeyE': interact(); break;
        case 'Space': player.jump(); break;
        case 'Escape':
          if (ui.promptOpen && currentArea) { dismissed.add(currentArea.id); ui.hidePrompt(); } else toggleHelp(); break;
        case 'KeyH': toggleHelp(); break;
        case 'KeyM': toggleSound(); break;
      }
    }
  }

  // ---------------------------------------------------------------- per-frame proximity

  let currentArea = null;
  function proximity() {
    const px = player.pos.x, pz = player.pos.z;
    let near = null, nd = Infinity;
    for (const a of areas) {
      const d = Math.hypot(a.x - px, a.z - pz);
      if (d < nd) { nd = d; near = a; }
    }
    currentArea = near && nd < near.statsR ? near : null;

    // play prompt
    if (near?.game && nd < near.promptR) {
      if (!dismissed.has(near.id) && !ui.promptOpen) {
        ui.showPrompt(near, () => play(near), () => { dismissed.add(near.id); ui.hidePrompt(); });
        audio.ui('chime');
      }
    } else if (ui.promptOpen) ui.hidePrompt();
    for (const id of dismissed) {
      const a = areas.find(x => x.id === id);
      if (a && Math.hypot(a.x - px, a.z - pz) > a.promptR + 2.5) dismissed.delete(id);
    }

    // stats window when you are close to a game
    if (near?.game && nd < near.statsR) {
      refreshStats();
      const s = statsCache.data?.[near.game.id];
      if (s) ui.showStats(near.game, s); else ui.hideStats();
    } else ui.hideStats();

    // what would E do?
    target = null;
    let hint = null;
    if (!ui.promptOpen) {
      const npc = npcs.nearest(px, pz, 2.8, player.yaw);
      const rem = remotes.nearest(px, pz, 3.2);
      if (rem) { target = { kind: 'remote', remote: rem }; hint = `E  Wave at ${rem.name}`; }
      else if (npc) { target = { kind: 'npc', npc }; hint = dogWalk?.hint(npc) || (npc.personality && npcs.dogDozing?.(npc.id) ? `E  Wake up ${npc.name}` : `E  Say hi to ${npc.name}`); }   // a dog on a walk, a napping dog
      else if (Math.hypot(MAILBOX.x - px, MAILBOX.z - pz) < 2.4) { target = { kind: 'mail' }; hint = 'E  Check the mail'; }
      else if (near && !near.game && !near.place && nd < near.promptR) { target = { kind: 'soon', area: near }; hint = `${near.slot.name}: a game is coming soon`; }
    }
    // a feature (talk to Kevin, hop on the swing, stop fishing) can outrank everything above with prio >= 5
    let best = null;
    for (const f of features) {
      const c = f.target?.(px, pz, player.yaw);
      if (c && (!best || (c.prio || 1) > (best.prio || 1) || ((c.prio || 1) === (best.prio || 1) && c.d < (best.d ?? Infinity)))) best = c; // (seats-bodies: equal prio, the nearer thing (c.d, m) wins)
    }
    if (best && (best.prio || 1) >= 5 && !ui.promptOpen) { target = { kind: 'feature', c: best }; hint = best.hint; }
    // any feature's E beats a wave at a friend standing near: friends sit together, so "Wave at Sam" would hide the picnic table,
    // the logs, the benches and Joyce's chair (prio 4) whenever one was within 3.2 m. An NPC's hello still wins over those
    // (seats-bodies) ...and a seat nearer than the NPC (best.d, m) wins over their hello: a dog or a bus rider beside the bench took E
    // from the bench you stood at (Dax's hello reaches 4.4 m)
    else if (best && !ui.promptOpen && (!target || (target.kind === 'remote' && /^E\s/.test(best.hint)) || (target.kind === 'npc' && /^E\s/.test(best.hint) && best.d < Math.hypot(target.npc.body.root.position.x - px, target.npc.body.root.position.z - pz)))) { target = { kind: 'feature', c: best }; hint = best.hint; }
    ui.hint(hint); // an "E  ..." hint lights the interact button instead of showing mid-screen (ui.js, hud-layout.js)

    // place name in the corner
    let place = null;
    if (near && nd < near.radius + 1.5) place = near.game ? near.game.name : near.slot.name;
    else place = ctx.placeAt?.(px, pz) || regionAt(px, pz); // a feature may name a spot the 2D regions can't: the back room under the loft
    ui.setPlace(place);
  }

  // ---------------------------------------------------------------- loop

  let last = performance.now();
  let checkedPerf = quality === 'low';
  const runCheck = createRunningCheck({ onDone: fps => {
    checkedPerf = true;
    const to = levelAfterSample(quality, fps);
    if (to === quality) return;
    // auto: the lower level from now on; a level the player chose stays theirs (saved) and comes back next visit
    const mine = GFX.mode === 'manual' ? quality : null;
    setQuality(to, 'auto');
    if (mine) { store.set('quality', mine); GFX.dropped = mine; GFX.fps = fps; setQualityLabel(); }
    else { GFX.fps = fps; GFX.why = `It dropped to ${LEVEL_NAMES[to]} on the walk out`; store.set('gfxAuto', { sig: GFX.info.sig, level: to, why: GFX.why, fps }); setQualityLabel(); }
    ui.toast(`Switched to ${LEVEL_NAMES[to]} graphics for a smoother walk (change it in Settings).`, 5000);
  } });
  const sunFocus = new THREE.Vector3();
  const attract = { a: 0.6 };

  function fitToWindow() {
    const w = innerWidth, h = innerHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    ink.setSize(w, h);
    fitW = w; fitH = h;
  }
  let fitW = 0, fitH = 0;
  // the level at load, everywhere: the day/night lights (Max's lamp shadows, soft shadows) and the sun's map were only
  // set when the level was changed in Settings, so a saved Max started without them
  setQuality(quality, 'init');

  function loop() {
    requestAnimationFrame(loop);
    tick();
  }

  // One frame. fakeDt lets the console step time by hand when the tab is throttled.
  const balPassers = [];
  function tick(fakeDt) {
    if (innerWidth !== fitW || innerHeight !== fitH) fitToWindow();
    const nowMs = fakeDt ? Math.max(last, performance.now()) + fakeDt * 1000 : performance.now();
    // a stepped frame is exactly fakeDt long: under CPU load the real clock ran ahead and stretched it to 0.05 s, so the
    // same steps gave different results on two clients (and nibbles came early in the fishing tests)
    const dt = fakeDt ? Math.min(0.05, fakeDt) : Math.max(0, Math.min(0.05, (nowMs - last) / 1000));
    // the real frame time (up to 0.25 s): the scripted intro runs on it so a slow device still gets out of the house in
    // about 12 s instead of crawling through it in slow motion (it looked like a lock-up on a phone)
    const realDt = fakeDt ? dt : Math.max(0, Math.min(0.25, (nowMs - last) / 1000));
    last = Math.max(last, nowMs);
    const now = nowMs / 1000;
    const shared = net.serverNow() / 1000;
    // below Angell Street: the maze scene runs and draws instead of the yard, which is paused (nothing of it updates or
    // draws; the shared clock carries on, so it resumes where the world is); the keys and the chat still work
    if (mode === 'play' && ctx.below) { input.update(dt, now); handleKeys(); if (ctx.below) ctx.below.frame(dt, now, realDt); return; }

    for (const u of world.updaters) u(dt, now);
    for (const u of built.updaters) u(dt, now);
    house.update(dt);
    // during the intro the dogs just watch you leave the house
    npcs.update(dt, shared, now, mode === 'play' || mode === 'leaving' ? player.pos : null);
    input.update(dt, now);
    if (mode === 'play' || mode === 'pose') for (const f of features) f.update?.(dt, now); // (pose: the Pose Editor's town runs, its people hidden)
    handleKeys();

    if (mode === 'attract') {
      if (!$('#start').hidden && editor.frame(dt, now, camera, player)) sunFocus.copy(player.pos);
      else {
        attract.a += dt * 0.035;
        camera.position.set(Math.sin(attract.a) * 34, 15 + Math.sin(attract.a * 0.7) * 3, -16 + Math.cos(attract.a) * 26);
        camera.lookAt(0, 2, -14);
        sunFocus.set(0, 0, -14);
      }
    } else if (mode === 'intro') {
      for (const f of features) f.introUpdate?.(realDt, now); // (a feature the morning walks through: the house's inside, its doors)
      intro.update(realDt, now);
      sunFocus.copy(player.pos);
    } else {
      player.update(dt, now, input);
      player.updateCamera(dt, camera, input, now);
      if (mode === 'menu' && !$('#start').hidden) editor.frame(dt, now, camera, player);
      sunFocus.copy(player.pos);
      if (mode === 'play') proximity();
      net.sendState(player.pos.x, player.pos.y, player.pos.z, player.yaw, player.animCode, nowMs, player.heldCode);
    }
    remotes.update(dt, now);
    if (mode === 'play') for (const f of features) f.afterRemotes?.(dt, now); // (the porch swing seats a remote sitter on itself)
    crowd.update(dt, now);
    // the party balloons: the sway on the shared clock, a bounce off whoever runs through them (local), only near the
    // camera (balloons.js)
    if (anyNear(camera.position.x, camera.position.z)) {
      balPassers.length = 0;
      if (mode === 'play' || mode === 'menu') passer(balPassers, player, player.pos.x, player.pos.z, 0.3, dt);
      for (const d of npcs.npcs) { const r = d.body.root, p = r.position; if (r.visible) passer(balPassers, d, p.x, p.z, d.kind === 'unicorn' ? 0.55 : d.kind === 'dog' ? 0.4 : 0.3, dt); }
      for (const rm of remotes.map.values()) { const p = rm.ch.root.position; passer(balPassers, rm, p.x, p.z, 0.3, dt); }
      if (mode === 'play') for (const f of features) for (const bd of f.bodies?.() || []) passer(balPassers, null, bd.x, bd.z, bd.r || 0.3, dt);
    }
    updateBalloons(dt, shared, camera.position.x, camera.position.z, balPassers);

    // how deep in Strickler woods you are (0 in the open, 1 at the tree line): the light and the fog close in
    { const px = player.pos.x, pz = player.pos.z; const inPark = pz > -96 && pz < MAP.maxZ && px < FENCE_WEST_X; const d = inPark ? Math.min(1, Math.max(0, (WOODS_X + 8 - px) / (WOODS_X + 8 + 164))) : 0; /* deepest from x -164 on; MAP.maxZ: the woods by the lake's west shore */ LIGHT.woods += (d * d * (3 - 2 * d) - LIGHT.woods) * Math.min(1, dt * 1.2); }
    daynight.update(dt, net.serverNow(), camera); // sun or moon, sky, fog, lamps for the shared hour (moves SUN_DIR)
    lampPick -= dt;
    if (lampPick <= 0) {
      lampPick = 0.4;
      const px = player.pos.x, pz = player.pos.z;
      const near = NIGHT_SPOTS.filter(s => (s.pool > 0 || s.halo > 0) && (LIGHT.night > 0.02 || s.day > 0)).map(s => [Math.hypot(s.x - px, s.z - pz), s]).sort((a, b) => a[0] - b[0]).slice(0, 4); // (s.day: a lamp that is on by day too, e.g. the game store's while you are in it)
      lampLights.forEach((l, i) => { const s = near[i]; if (!s || s[0] > 34) { l.intensity = 0; return; } l.position.set(s[1].x, s[1].y, s[1].z); l.color.set(s[1].color || '#ffd98e'); l.intensity = 16 * Math.max(LIGHT.night, s[1].day || 0) * (s[1].k ?? 1) * (s[1].lightK ?? 1); });   // (k: a spot's own strength, e.g. the firepit's lantern; lightK: its light only, not its pool or bulb: living-light.js)
    }
    // the sun's shadow box follows what the camera looks at (shadows.js)
    shadows.place(camera);
    world.sky.position.copy(camera.position);

    audio.update(dt, now, camera, mode === 'attract' ? sunFocus : player.pos);
    rigid.update(); // (before camera-fade: a fade swaps the merged meshes' materials too)
    cameraFade.update(dt, now);
    ui.update(camera, innerWidth, innerHeight);
    ink.render(scene, camera);
    gfxSample.frame(realDt); // (auto graphics: the first seconds' frame times, gfx.js)

    // a level down once if this device struggles (gfx.js createRunningCheck, the median frame after a warm-up)
    if (!checkedPerf && (mode === 'play' || mode === 'intro')) runCheck.frame(realDt); // (from the morning on, so a struggling device switches early)
  }

  addEventListener('pageshow', e => {
    if (!e.persisted) return;
    // came back with the browser's Back button
    ui.fade(0, 600);
    if (mode === 'leaving') { mode = 'play'; player.controls = true; player.emote = null; }
    net.open();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) net.open(); });

  progress(1, greeting(dayPhase(net.serverNow()).hour) + '!');
  loop();
  await frame(); await frame();
  const toolsBack = !!(await toolsMenu.early); // back from one of Andrew's tools: the menu is up already
  await accounts.prepare(returning || toolsBack); // back from a game within 3 hours the saved session skips the PIN (otherwise it just brings the current name)
  const ownerMenu = !PREVIEW && !signinTo && accounts.owner; // the owner's session came back: his menu, not the start screen
  if (ownerMenu) toolsMenu.beforeLoadingHides(accounts.auth.name); else toolsMenu.dismiss(); // (dismiss: the session ran out after the menu went up)
  $('#loading').hidden = true;
  if (PREVIEW && qp.has('pose')) {
    // The Pose Editor (public/editor/pose.html, owner only; editor/pose/pose-mode.js): the real town with nobody in it, no HUD and no
    // sound; the editor takes the camera (a takeover) and runs as the last feature. Mode 'pose': the features update, the keys do nothing.
    profile.name = 'Editor';
    $('#start').hidden = true; $('#hud').hidden = true;
    player.houseSolid = true; player.controls = false; player.character.root.visible = false; selfTag.remove();
    mode = 'pose';
    import('./editor/pose/pose-mode.js').then(m => m.startPose(ctx, { ink, daynight, shadows })).catch(e => console.error('[pose] could not start', e));
  } else if (PREVIEW && qp.has('hud-edit')) {
    // The HUD Editor's pane (public/editor/hud.html): no start screen, no presence, the real HUD over the yard with sample
    // words; the editor drives it by postMessage (hud-edit.js)
    profile.name = 'Editor';
    $('#start').hidden = true; $('#hud').hidden = false;
    player.houseSolid = true; player.controls = true;
    player.place(SPAWN.x, SPAWN.z, SPAWN.yaw); player.snapCameraBehind();
    mode = 'play';
    features.push(createHudEdit(ctx));
  } else if (PREVIEW) {
    // The World Editor's 3D pane (public/editor/world.html): no start screen, no presence, no HUD; the editor drives it by
    // postMessage: { type: 'goto', x, z } puts the camera over a spot, { type: 'props', props } redraws the doodads live,
    // { type: 'terrain' } redraws the ground, { type: 'marks' } the selection ring and drawing pins, { type: 'edit', on }
    // turns tapping the 3D view into using the editor's tool there (editor/preview-edit.js). Roads, trails and ponds are
    // built once, so those changes reload this frame (the editor's Rebuild).
    profile.name = 'Editor';
    $('#start').hidden = true; $('#hud').hidden = true;
    player.houseSolid = true; player.controls = true; player.character.root.visible = false; selfTag.remove();
    const goto = (x, z) => { player.place(x, z, player.yaw); player.snapCameraBehind(); player.cam.targetDist = player.cam.dist = 14; player.cam.pitch = 0.62; };
    goto(SPAWN.x, SPAWN.z);
    mode = 'play';
    const pe = createPreviewEdit({ canvas, camera, player, world, renderer });
    addEventListener('message', e => {
      if (e.origin !== location.origin) return;
      const m = e.data; if (!m || typeof m !== 'object') return;
      if (m.type === 'goto' && Number.isFinite(m.x) && Number.isFinite(m.z)) goto(m.x, m.z);
      else if (m.type === 'edit') pe.setOn(m.on);
      else if (m.type === 'marks') pe.marks(m);
      else if (m.type === 'terrain') pe.terrain(m.terrain);
      else if (m.type === 'props') { buildWorldProps(world.root, [], { props: normaliseProps(m.props, false) }); renderer.shadowMap.needsUpdate = true; }
    });
    parent?.postMessage({ type: 'preview-ready' }, location.origin);
  } else if (ownerMenu) toolsMenu.wait().then(() => { buildStart(); begin(false); });
  else showStart(false);

  // handy for debugging from the console
  window.breneland = { gfx: GFX, scene, camera, player, npcs, areas, net, audio, remotes, world, ink, renderer, intro, input, ui, tick, ctx, features, editor, daynight, accounts, cameraFade, shadows, rigid, crowd, get tutorial() { return tutorial; }, startTutorial, get loggedOff() { return loggedOff; }, areaUpdaters: built.updaters, balloons: { state: balloonState, BAL, list: balloonList }, get mode() { return mode; } };
}

boot();
