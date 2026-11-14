// The house as a feature: the front door that swings in as you come near (either side), the garage's roll-up door, the inside drawn
// only while someone's near or in it, the indoor lamps by day while you're inside, and the panes' colour from inside by the hour.
// The house itself is house.js / house-inside.js (built by main.js as ctx.house), the layout is layout.js HOUSE_PLAN.
import * as THREE from 'three';
import { HOUSE, GARAGE, HOUSE_PLAN, inHouseBox } from './layout.js';
import { LIGHT } from './daynight-mats.js';
import { indoorView } from './indoor-view.js';
import { createGlassView, insideInk } from './real-glass.js';
import { GFX } from './gfx.js';
import { updateLivingLight } from './living-light.js';

const NIGHT_IN = new THREE.Color('#1c2440');

export function createMainHouse(ctx) {
  const { player, camera, audio, ui, house } = ctx;
  if (!house?.inside) return null;
  const P = HOUSE_PLAN, D = P.door, GD = P.garageDoor;
  // inside the house or the garage (the walls' inner faces)
  const inside = (x, z) => (x > HOUSE.minX + 0.15 && x < HOUSE.maxX - 0.15 && z > HOUSE.minZ + 0.15 && z < HOUSE.maxZ - 0.15)
    || (x > GARAGE.minX + 0.1 && x < GARAGE.maxX && z > GARAGE.minZ + 0.1 && z < GARAGE.maxZ - 0.1);
  const roomAt = (x, z) => house.rooms.find(r => x > r.minX - 0.06 && x < r.maxX + 0.06 && z > r.minZ - 0.06 && z < r.maxZ + 0.06) || null;
  // the camera inside (indoor-view.js, shared with the Lovecraft house): first person or the room view, the toggle under the smiley,
  // F or the pad's L3. Just outside, the follow camera is kept out of the house and garage walls
  const iv = indoorView(ctx);
  const BOXES = [HOUSE, GARAGE], kT = new THREE.Vector3();
  const inBox = (B, x, z, pad) => x > B.minX - pad && x < B.maxX + pad && z > B.minZ - pad && z < B.maxZ + pad;
  const keepOut = cam => {
    const c = cam.position, p = player.pos;
    if (inside(p.x, p.z) || c.y > HOUSE.eaveY + 1.2) return;
    const B = BOXES.find(b => inBox(b, c.x, c.z, 0.35));
    if (!B) return;
    kT.set(p.x, p.y + 1.6, p.z);
    let t = 1;
    for (let i = 1; i <= 24; i++) { const u = i / 24, x = kT.x + (c.x - kT.x) * u, z = kT.z + (c.z - kT.z) * u; if (BOXES.some(b => inBox(b, x, z, 0.35))) { t = (i - 1) / 24; break; } }
    c.lerpVectors(kT, c, Math.max(0.12, t)); cam.lookAt(kT);
  };
  const bld = iv.register({ id: 'main-house', inside, rooms: house.rooms, walls: house.walls, keepOut });
  let doorWas = false, garWas = false, showIn = true, lampsOn = false, glassNight = -1, wasInside = false, inkFull = null;
  const show = on => { showIn = on; house.inside.group.visible = on; };
  // our living room's main light: off 10 pm-7 am, the fire the only light then (living-light.js); our fire's flame from fires.js
  let firesF = null;
  const living = dt => {
    if (!firesF) firesF = ctx.features?.find(f => f.name === 'fires') || null;
    const ours = firesF?.fires?.find(f => !f.always);
    const c = camera.position;
    updateLivingLight(dt, house, ours ? ours.flame || 0 : 0, c.y < HOUSE.eaveY && roomAt(c.x, c.z)?.id === 'living');
  };
  // the panes seen from inside: daylight by day, the dark at night
  const glass = () => {
    const night = Math.round((LIGHT.night || 0) * 20) / 20;
    if (night !== glassNight) { glassNight = night; house.inside.glassIn.color.set('#cfe4f2').lerp(NIGHT_IN, night * 0.9); house.doorGlass?.color.copy(house.inside.glassIn.color); }
    // the see-through panes wear the hour's colours of the town panes they copy (daynight.js lights those)
    for (const m of house.glassMats || []) { const g = m.userData.src; if (g) { m.color.copy(g.color); m.emissive.copy(g.emissive); m.emissiveIntensity = g.emissiveIntensity; } }
  };
  // the panes are see-through when the camera is near enough to look in (and the inside is drawn for it), the town's panes far off.
  // From inside you look out through them (real-glass.js)
  const gv = house.glassU ? createGlassView({ boxes: [HOUSE], meshes: () => house.glassMeshes, mats: house.glassMats, U: house.glassU }) : null;
  show(false);

  // ---- the bed log-off, one of three ways to log off that all do the same thing. E by the main bedroom's bed sits you on its edge,
  // then it's the same log-off as Menu > Log off (main.js goHome: the socket closes, so the server lets go of a dog you were walking
  // and anything else you held, just as for the menu and for closing the game)
  const BED = P.bed, bx0 = BED.x - BED.w / 2, bx1 = BED.x + BED.w / 2, bz0 = BED.z - BED.l / 2, bz1 = BED.z + BED.l / 2;
  const bedDist = (x, z) => Math.hypot(Math.max(bx0 - x, 0, x - bx1), Math.max(bz0 - z, 0, z - bz1));
  const nearBed = (x, z) => roomAt(x, z)?.id === 'main' && bedDist(x, z) < 0.85;
  let asleep = false;
  function goToBed() {
    if (asleep || !ctx.playing) return;
    asleep = true;
    const side = player.pos.x > BED.x ? 1 : -1, sx = BED.x + side * (BED.w / 2 - 0.12), // (on its edge: house-scale)
      sz = Math.max(bz0 + 0.4, Math.min(bz1 - 0.6, player.pos.z)), yaw = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    player.place(sx, sz, yaw);
    player.character.params.seatY = BED.top - HOUSE.floorY + 0.01; // (the mattress's top, the quilt's edge a little soft)
    player.takeover = { anim: 'sit', bed: true, update(dt, now, inp, pl) { pl.pos.set(sx, HOUSE.floorY, sz); pl.yaw = yaw; },
      // your own eyes, sitting on the bed's edge, looking into the room as the lights go down
      camera(dt, cam) { cam.position.set(sx + side * 0.05, BED.top + 0.9, sz); cam.lookAt(sx + side * 3, HOUSE.floorY + 0.9, sz - 0.6); return true; } };
    player.character.root.visible = false;
    audio.ui?.('pop');
    ui.toast('Time for bed. Goodnight!', 1600);
    setTimeout(() => ctx.goHome?.({ bed: true }), 700);
  }

  const api = {
    name: 'main-house',
    plan: P, house,
    inside: () => inside(player.pos.x, player.pos.z),
    roomAt,
    get room() { return roomAt(player.pos.x, player.pos.z)?.id || null; },
    get insideShown() { return showIn; },
    glassView: gv,
    get view() { return iv.view; },
    setView: v => iv.setView(v, true), toggle: () => iv.toggle(true),
    get walkFP() { return iv.walkFP(bld); },
    get roomCam() { return iv.roomCam(bld); },
    get shot() { return iv.active === bld ? iv.shot : null; },
    get cuts() { return iv.cuts; },
    look: (yaw, pitch = 0.08) => iv.look(yaw, pitch),
    sees: (c, x, y, z) => iv.sees(bld, c, x, y, z),
    onKey(code) { return iv.onKey(code); },
    get asleep() { return asleep; },
    nearBed: (x, z) => nearBed(x, z), goToBed,
    target(px, pz) {
      if (!asleep && nearBed(px, pz)) return { hint: 'E  Go to bed (log off)', prio: 6, run: goToBed };
      return null;
    },
    help: [[['F'], 'in the house: first person or the room view'], [['E'], 'by the bed in the main bedroom: go to bed (log off)']],
    update(dt) {
      living(dt);
      const px = player.pos.x, pz = player.pos.z, c = camera.position;
      // the front door: swings in while you are near it, inside or out
      // Dax and Nala go in and out through it to their big bed in the living room, so it opens for them too
      let dogAt = false;
      for (const dg of ctx.npcs?.npcs || []) { if (dg.kind !== 'dog') continue; const q = dg.body.root.position; if (Math.abs(q.x - D.x) < 1.3 && q.z > D.z - 1.6 && q.z < D.z + 1.6) { dogAt = true; break; } }
      const nearDoor = (Math.abs(px - D.x) < 1.6 && pz > D.z - 2.2 && pz < D.z + 2.0) || dogAt;
      house.setDoor(nearDoor);
      if (nearDoor !== doorWas) { doorWas = nearDoor; audio.door?.(nearDoor ? 'open' : 'close', D.x, HOUSE.floorY + 1.2, D.z); }
      // the deck's door and the garage's door into the house: the same, each within reach of its opening
      const sl = P.slider, hd = P.houseDoor;
      house.setSideDoor('deck', Math.abs(px - sl.x) < 1.5 && Math.abs(pz - sl.z) < 1.9);
      house.setSideDoor('garage', Math.abs(pz - hd.z) < 1.5 && Math.abs(px - hd.x) < 1.9);
      // the garage door rolls up while you are in front of it or in the garage
      const nearGar = px > GD.minX - 1.5 && px < GD.maxX + 1.5 && pz > GD.z - 4.5 && pz < GARAGE.maxZ;
      house.setGarage(nearGar);
      if (nearGar !== garWas) { garWas = nearGar; audio.ui?.('whoosh'); }
      const inNow = inside(px, pz), camIn = inside(c.x, c.z) && c.y < HOUSE.eaveY;
      if (inNow !== wasInside) { wasInside = inNow; if (!inNow) iv.reset(); }
      iv.update();
      if (inNow !== lampsOn) { lampsOn = inNow; for (const s of house.lamps) s.day = inNow ? 0.55 : 0; }
      if (inNow && camIn) ui.indoors = true; // the places' labels outside don't show through the walls
      if (ctx.weather && camIn) ctx.weather.indoor = true;
      const looks = gv ? gv.update(dt, camera, camIn) : false;
      const showNow = inNow || camIn || inHouseBox(px, pz, 5) || looks;
      if (showNow !== showIn) show(showNow);
      // looked into from outside on a phone or tablet, the inside is drawn in colour only (real-glass.js insideInk)
      const full = camIn || GFX.cls === 'desktop';
      if (full !== inkFull) { inkFull = full; insideInk([house.inside.group], full); }
      glass();
    },
    // the morning walks you through the house before this feature first updates (or the panes showed daylight at night)
    introUpdate(dt) { living(dt || 1 / 30); glass(); gv?.update(dt || 1 / 30, camera, inside(camera.position.x, camera.position.z) && camera.position.y < HOUSE.eaveY); },
  };
  return api;
}
