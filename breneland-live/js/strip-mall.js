// The strip mall on Summit Rd (strip-mall, 2026-11-09; layout.js STRIP_MALL, the plan in strip-mall-plan.js, the building in
// strip-mall-build.js): Summit Slice, the pizza place Pepperoni Pete delivers from (mailman.js parks his scooter in its lot and starts
// and ends every round at its door), and Peak Threads, the clothing store (the racks, mannequins, counter and mirror are built and
// anchored; the buying and wearing are being designed with Andrew: no shop logic yet). Each store keeps its own hours: its glass door
// swings in for anyone near while it is open (and for someone leaving after hours), its lights and sign burn while it is open and the
// windows go dark when it shuts. Both are dry rooms (indoor-rooms.js) with real windows (real-glass.js: see in from the walkway, see out
// from inside) and the shared indoor camera (indoor-view.js: first person or the follow camera kept inside the walls).
import * as THREE from 'three';
import { STRIP_MALL as L } from './layout.js';
import { GY, FY, T, TOP, CEIL, PIZZA, CLOTHES } from './strip-mall-plan.js';
import { buildStripMall } from './strip-mall-build.js';
import { LIGHT, GLASS, LAMPS } from './daynight-mats.js';
import { inHours } from './npcs-day.js';
import { addRoom } from './indoor-rooms.js';
import { createGlassView, insideInk } from './real-glass.js';
import { indoorView } from './indoor-view.js';
import { GFX } from './gfx.js';
import { LAYER_SOFT } from './toon.js';
import { frameHooks } from './perf-flags.js';
import { partyAt } from './mall-staff-day.js';   // (mall-staff: the party keeps Summit Slice open to 5 am and blacks its glass out)

export function createStripMall(ctx) {
  const { scene, player, colliders, ui, audio, camera } = ctx;
  const g = new THREE.Group(); g.name = 'strip-mall'; scene.add(g);
  // dry inside (indoor-rooms.js): one room per store, the walls' box, the floor to under the roof
  addRoom({ id: 'pizza', minX: L.minX, maxX: PIZZA.unit.maxX, minZ: L.minZ, maxZ: L.maxZ, y0: FY, y1: TOP - 0.4 });
  addRoom({ id: 'clothes', minX: CLOTHES.unit.minX, maxX: L.maxX, minZ: L.minZ, maxZ: L.maxZ, y0: FY, y1: TOP - 0.4 });
  const built = buildStripMall(g, colliders);
  const UNITS = [PIZZA, CLOTHES];
  const inUnit = (U, x, z) => x > U.unit.minX && x < U.unit.maxX && z > L.minZ + 0.2 && z < L.maxZ;
  const inside = (x, z) => UNITS.some(U => inUnit(U, x, z));
  const unitAt = (x, z) => UNITS.find(U => inUnit(U, x, z)) || null;
  let partyNow = false;
  const isOpen = U => inHours(LIGHT.hour, U.unit.hours[0], U.unit.hours[1] >= 24 ? U.unit.hours[1] - 24 : U.unit.hours[1]) || (U === PIZZA && partyNow);
  audio.registerSfx?.('bell', (a, x, y, z) => { const o = a.at(x, y, z, 4); const t = a.ctx.currentTime; a.tone(o, { f: 2100, t, d: 0.5, peak: 0.06, verb: 0.5 }); a.tone(o, { f: 2600, t: t + 0.05, d: 0.6, peak: 0.05, verb: 0.5 }); });

  // ---- the indoor camera (indoor-view.js): each store its own building with one room and four corner spots
  const iv = indoorView(ctx);
  const kTarget = new THREE.Vector3();
  const keepOut = cam => { // outside, the follow camera stays out of the walls (stepping out of a door it would sit inside them)
    const c = cam.position, pad = 0.35, minX = L.minX, maxX = L.maxX, minZ = L.minZ, maxZ = L.maxZ;
    if (inside(player.pos.x, player.pos.z) || !(c.x > minX - pad && c.x < maxX + pad && c.z > minZ - pad && c.z < maxZ + pad) || c.y > TOP + 0.6) return;
    kTarget.set(player.pos.x, player.pos.y + 1.6, player.pos.z);
    let t = 1;
    for (let i = 1; i <= 24; i++) { const u = i / 24, x = kTarget.x + (c.x - kTarget.x) * u, z = kTarget.z + (c.z - kTarget.z) * u; if (x > minX - pad && x < maxX + pad && z > minZ - pad && z < maxZ + pad) { t = (i - 1) / 24; break; } }
    c.lerpVectors(kTarget, c, Math.max(0.12, t)); cam.lookAt(kTarget);
  };
  const corners = (x0, z0, x1, z1, y, pad = 0.5) => [[x0 + pad, z0 + pad, y], [x1 - pad, z0 + pad, y], [x0 + pad, z1 - pad, y], [x1 - pad, z1 - pad, y]];
  const wall = (minX, maxX, minZ, maxZ, y0, y1) => ({ minX, maxX, minZ, maxZ, y0, y1 });
  const blds = {};
  for (const U of UNITS) {
    const u = U.unit;
    blds[u.id] = iv.register({
      id: 'mall-' + u.id, inside: (x, z) => inUnit(U, x, z), keepOut,
      rooms: [{ id: u.id, minX: U.x0, maxX: U.x1, minZ: L.minZ, maxZ: L.maxZ, y: FY, top: CEIL, cams: corners(U.x0, U.z0, U.x1, U.z1, FY + 3.0) }],
      walls: [wall(u.minX, u.maxX, L.minZ, L.minZ + T, GY, TOP), wall(u.minX, u.maxX, L.maxZ - T, L.maxZ, GY, TOP), wall(u.minX, u.minX + T, L.minZ, L.maxZ, GY, TOP), wall(u.maxX - T, u.maxX, L.minZ, L.maxZ, GY, TOP)],
    });
  }

  // ---- the glass (real-glass.js): see-through near either store, the lit pane far off; coloured by the hour with the town's, dark when shut
  const gv = createGlassView({ boxes: [{ minX: L.minX, maxX: L.maxX, minZ: L.minZ, maxZ: L.maxZ }], meshes: () => built.glassMeshes, mats: [built.glassReal], U: built.glassU });
  // the lights: each store's bulbs and lamps while it is open (a dim grey bulb and no pool when shut), the outside's with the night
  const lights = { pizza: null, clothes: null, in: null };
  const setLights = (pzOn, clOn, inNow) => {
    if (pzOn === lights.pizza && clOn === lights.clothes && inNow === lights.in) return;
    lights.pizza = pzOn; lights.clothes = clOn; lights.in = inNow;
    LAMPS.get('mall-bulbs-pizza').base.set(pzOn ? '#ffffff' : '#2e2a26'); LAMPS.get('mall-bulbs-clothes').base.set(clOn ? '#ffffff' : '#2e2a26');
    LAMPS.get('mall-sign-pizza').base.set(pzOn ? '#ffffff' : '#555555'); LAMPS.get('mall-sign-clothes').base.set(clOn ? '#ffffff' : '#555555');
    for (const s of built.lamps.pizza) { s.k = pzOn ? 1 : 0; s.day = inNow === 'pizza' && pzOn ? 0.55 : 0; }
    for (const s of built.lamps.clothes) { s.k = clOn ? 1 : 0; s.day = inNow === 'clothes' && clOn ? 0.55 : 0; }
  };
  const doorT = { pizza: 0, clothes: 0 };
  let showIn = true, inkFull = null, wasIn = null, nearShown = true, signsShown = true;
  const NEAR_DRAW = 70, SIGN_DRAW = 110; // metres from the building within which its small pieces (the door leaves, the hours cards) and its signs' faces are drawn at all
  // a warm-up draw (the game store's way): the mall's inside drawn once off screen soon after the game loads, so its HD material's program
  // and the big sheets' upload happen then and not in the frame you first come near enough to look in
  let warmPhase = 0, warmAt = performance.now() + 4500, warmLevel = null;
  const warmDraw = () => {
    const r = ctx.renderer, ink = ctx.ink;
    if (!r || !ink) return;
    const rt = new THREE.WebGLRenderTarget(16, 16), cam = new THREE.PerspectiveCamera(80, 1, 0.1, 300), target = r.getRenderTarget();
    cam.position.set(PIZZA.unit.door.x, FY + 1.6, L.minZ + 2.4); cam.lookAt(PIZZA.unit.door.x + 1, FY + 1.0, L.maxZ); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const wasVis = built.inside.visible; built.inside.visible = true; built.inside.updateMatrixWorld(true);
    try {
      r.setRenderTarget(rt); r.clear();
      cam.layers.enable(LAYER_SOFT); r.render(scene, cam);
      if (ink.normalMat) { cam.layers.disable(LAYER_SOFT); scene.overrideMaterial = ink.normalMat; r.render(scene, cam); scene.overrideMaterial = null; }
    } catch (e) { console.warn('[strip-mall] warm-up draw failed', e); }
    finally { r.setRenderTarget(target); built.inside.visible = wasVis; rt.dispose(); }
  };
  frameHooks.push(() => {
    if (ctx.below) return;
    const now = performance.now();
    if (warmLevel !== GFX.level) { warmLevel = GFX.level; warmPhase = 0; warmAt = Math.max(warmAt, now + 800); } // a new level: new programs
    if (warmPhase === 1 || now < warmAt) return;
    warmDraw(); warmPhase = 1;
  });

  return {
    name: 'strip-mall',
    plan: { L, PIZZA, CLOTHES }, seats: built.seats, doors: built.doors, signs: built.signs,
    get model() { return built.model; }, get replacedTris() { return built.replacedTris; },
    get open() { return { pizza: isOpen(PIZZA), clothes: isOpen(CLOTHES) }; }, hours: { pizza: PIZZA.unit.hours, clothes: CLOTHES.unit.hours }, get partyNow() { return partyNow; },
    get doorT() { return { ...doorT }; }, get lights() { return { pizza: lights.pizza, clothes: lights.clothes }; },
    get insideShown() { return showIn; }, get nearShown() { return nearShown; }, get warmed() { return warmPhase === 1; }, glassView: gv, glassMeshes: built.glassMeshes, glassReal: built.glassReal, glassMat: built.glass,
    inside: () => inside(player.pos.x, player.pos.z), unitAt,
    get view() { return iv.view; }, setView: v => iv.setView(v, true),
    update(dt) {
      const px = player.pos.x, pz = player.pos.z, c = camera.position;
      const here = unitAt(px, pz), inNow = here ? here.unit.id : null;
      // the doors: for anyone while the store is open; after hours only for someone leaving (and held while they pass)
      for (const U of UNITS) {
        const id = U.unit.id, D = built.doors[id], open = isOpen(U);
        const d = Math.hypot(px - D.x, pz - L.minZ);
        let near = d < 2.2 && (open || inUnit(U, px, pz) || (doorT[id] > 0.5 && d < 1.2));
        if (!near && open && ctx.remotes?.map) for (const r of ctx.remotes.map.values()) { const q = r.ch.root.position; if (Math.hypot(q.x - D.x, q.z - L.minZ) < 2.2) { near = true; break; } }
        doorT[id] += ((near ? 1 : 0) - doorT[id]) * Math.min(1, dt * 4);
        D.leaf.rotation.y = -1.45 * doorT[id]; // (hinged at the west jamb, the leaf swings into the store)
        D.col.off = doorT[id] > 0.3;
      }
      if (inNow !== wasIn) { if (inNow || wasIn) { const U = inNow ? here : (wasIn === 'pizza' ? PIZZA : CLOTHES); audio.play?.('bell', U.unit.door.x, GY + 2.3, L.minZ); } wasIn = inNow; }
      partyNow = !!partyAt(ctx.net.serverNow() / 1000);
      const pzOn = isOpen(PIZZA), clOn = isOpen(CLOTHES);
      setLights(pzOn, clOn, inNow);
      // the glass: lit with the town's while either store is open, nobody home when both are shut (both stores share one pane material);
      // on a party night the pizza place's panes read dark from the street (the blinds behind them, mall-staff.js)
      { const q = GLASS[(pzOn && !partyNow) || clOn ? 3 : 4], R = built.glassReal, S = built.glass; for (const m of [S, R]) { m.color.copy(q.color); m.emissive.copy(q.emissive); m.emissiveIntensity = q.emissiveIntensity; } }
      if (inNow && unitAt(c.x, c.z)) ui.indoors = true; // (the store sets it every frame before us: never clear what it, or a house, set)
      // far off the inside is not drawn (the panes are opaque); near, it is, for the windows and the open doors
      const camIn = !!unitAt(c.x, c.z) && c.y < TOP, looks = gv.update(dt, camera, camIn);
      const dMid = Math.hypot(px - (L.minX + L.maxX) / 2, pz - L.minZ);
      const showNow = !!inNow || camIn || looks || dMid < 16;
      if (showNow !== showIn) { showIn = showNow; built.inside.visible = showNow; }
      const nearNow = dMid < NEAR_DRAW || camIn;   // (the door leaves and the hours cards: six draws nobody can make out from down the road)
      if (nearNow !== nearShown) { nearShown = nearNow; built.near.visible = nearNow; }
      const signsNow = dMid < SIGN_DRAW;            // (the signs' faces: two more; their lit panels still show from afar in the shell's glow)
      if (signsNow !== signsShown) { signsShown = signsNow; built.signs.pizza.visible = built.signs.clothes.visible = signsNow; }
      if (showNow) { const full = !!inNow || camIn || GFX.cls === 'desktop'; if (full !== inkFull) { inkFull = full; insideInk([built.inside], full); } }
      iv.update();
    },
    target(px, pz) {
      for (const U of UNITS) {
        if (!isOpen(U) && !inUnit(U, px, pz) && Math.hypot(px - U.unit.door.x, pz - L.minZ) < 2.2) {
          const h = U.unit.hours, fmt = hh => { const x = hh % 24, n = Math.floor(x) % 12 === 0 ? 12 : Math.floor(x) % 12, m = Math.round((x % 1) * 60); return n + (m ? ':' + String(m).padStart(2, '0') : '') + (x < 12 ? ' am' : ' pm'); };
          return { hint: 'E  Try the door', prio: 5, run: () => { ui.toast(`${U.unit.name} is closed. Open ${fmt(h[0])} to ${fmt(h[1])}.`, 3200); audio.ui?.('blip'); } };
        }
      }
      return null;
    },
  };
}
