// Swimming and oyster diving. Wade in anywhere: the lakes, Oyster Cove, every shore, out to the map's edge. Oyster beds lie on
// the lake floor all over the water (the cove's own OYSTER_BEDS plus a fair scatter, a pure function of the map, so every
// visitor has the same beds). Sixty seconds of breath-and-legs at a time, shown as a draining stamina bar (diving drains it
// faster). Run it out and you're hauled to the nearest shore for a rest. An oyster brought up to the surface is one fish
// (ctx.reward('oyster'), the server caps it at 40 a day). The swim bar is what limits how far out you go.
import * as THREE from 'three';
import { OYSTER_BEDS, MAP, WALK, BEACH_TOWEL } from './layout.js';
import { terrainHeight, coastSigned, onSurface, WATER_Y } from './terrain.js';
import { toon, shadows } from './toon.js';
import { Batcher, GEO } from './batch.js';
import { pointInPoly, closestOnPoly, el, loadCss, clamp, hash01 } from './util.js';
import { SWIM_SPLASH } from './bodies-poses.js';

const MAX = 100, SURF_DRAIN = MAX / 60, DIVE_DRAIN = MAX / 34, REST = 26, SPEED = 2.3, DIVE_SPEED = 2.0;
const REGROW = 90;
const BED_CELL = 13, BED_KEEP = 0.75, MAX_DEPTH = 6;   // one bed per 13 m square of open water, three in four kept

// Where the oyster beds are: the cove's seven, then one per BED_CELL square of the map's open water (jittered, a hash of
// the square, so every client agrees), on a floor you can dive to, clear of the pier and of each other. BEDS_BOX is the map
// as it was before the woods grew west and south, so the beds stay put when the map grows.
const BEDS_BOX = { minX: -192, maxX: MAP.maxX, minZ: MAP.minZ, maxZ: 60 };
export function oysterBeds() {
  const beds = OYSTER_BEDS.map(b => [b[0], b[1]]);
  for (let gx = BEDS_BOX.minX; gx < BEDS_BOX.maxX; gx += BED_CELL) for (let gz = BEDS_BOX.minZ; gz < BEDS_BOX.maxZ; gz += BED_CELL) {
    if (hash01('oyster-bed', gx, gz) > BED_KEEP) continue;
    // up to three tries in the square, so the thin strip of water along the north shore (6 m to the map's edge) gets its share
    for (let k = 0; k < 3; k++) {
      const x = gx + BED_CELL * (0.1 + 0.8 * hash01('oyster-x', gx, gz, k)), z = gz + BED_CELL * (0.1 + 0.8 * hash01('oyster-z', gx, gz, k));
      if (x > BEDS_BOX.maxX - 1.2 || z > BEDS_BOX.maxZ - 1.2 || coastSigned(x, z) < 2.2 || onSurface(x, z)) continue;
      if (terrainHeight(x, z) < WATER_Y - MAX_DEPTH + 0.6) continue;
      if (beds.some(b => Math.hypot(b[0] - x, b[1] - z) < 7)) continue;
      beds.push([x, z]); break;
    }
  }
  return beds;
}
// The nearest dry, walkable spot to (x, z): where someone out of puff is brought back to (rings out from where they are).
export function nearestShore(x, z) {
  for (let r = 1.5; r < 140; r += 1.5) {
    const n = Math.max(12, Math.round(r * 3));
    let best = null, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
      if (coastSigned(sx, sz) > -1.2 || onSurface(sx, sz) || !pointInPoly(sx, sz, WALK)) continue;
      const d = Math.abs(coastSigned(sx, sz) + 1.6);   // just up the beach, not deep in the bushes
      if (d < bd) { bd = d; best = [sx, sz]; }
    }
    if (best) return best;
  }
  return null;
}

// A flat thing (a towel) laid over the ground: a little grid whose every vertex sits `lift` over the terrain there.
function drape(b, color, cx, cz, w, d, yaw, lift) {
  const g = new THREE.PlaneGeometry(w, d, 2, 6).rotateX(-Math.PI / 2).rotateY(yaw);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = cx + p.getX(i), z = cz + p.getZ(i); p.setXYZ(i, x, terrainHeight(x, z) + lift, z); }
  g.computeVertexNormals();
  b.add(g, color);
}

// the water round a swimmer, for everyone in it (you and the others): the hands' entries in the crawl splash and ring,
// the feet's kick throws a little foam, treading water leaves a slow ring now and then, wading a ring at each step. All from the
// fishing feature's pooled ripples and drops (fish-water.js WaterFx: no new meshes, so no new draw calls), only near the camera.
const FX_NEAR = 30;
function stepWaterFx(fx, h, st, dt, now, camera, mine) {
  const R = h.root.position;
  if (!fx || Math.abs(R.x - camera.position.x) > FX_NEAR || Math.abs(R.z - camera.position.z) > FX_NEAR) return null;
  const s = h.opts.scale, mv = Math.min(1, Math.max(0, (h.rootSpd / s - 0.3) / 1.0)), deep = R.y < WATER_Y - 0.9;
  const f = now * SWIM_SPLASH, nL = Math.floor(f / (Math.PI * 2)), nR = Math.floor((f + Math.PI) / (Math.PI * 2));
  let entered = null;
  if (mv > 0.4 && !deep) {
    if (st.nL !== undefined && nL !== st.nL) entered = h.armL; else if (st.nR !== undefined && nR !== st.nR) entered = h.armR;
    if (entered) {
      entered.wrist.getWorldPosition(_w);
      fx.splash(_w.x, _w.z, 4, 0.55, WATER_Y + 0.04, '#ffffff', WATER_Y, 0.04); fx.ring(_w.x, _w.z, 0.55, 0.8, 0, 0.7);
    }
    st.kick = (st.kick || 0) - dt;
    if (st.kick <= 0) { st.kick = 0.32; (st.k = !st.k ? 1 : 0) ? h.legL.ankle.getWorldPosition(_w) : h.legR.ankle.getWorldPosition(_w); fx.splash(_w.x, _w.z, 2, 0.35, WATER_Y + 0.03, '#ffffff', WATER_Y, 0.03); }
  } else if (!deep) {
    st.ring = (st.ring || 0) - dt;
    if (st.ring <= 0) { st.ring = mv > 0.1 ? 0.45 : 1.5; fx.ring(R.x, R.z, mv > 0.1 ? 0.6 : 0.9, 1.3, 0, 0.5); }
  }
  st.nL = nL; st.nR = nR;
  return mine && entered ? entered : null;
}
const _w = new THREE.Vector3();

export function createSwim(ctx) {
  const { scene, player, audio, ui, camera, colliders } = ctx;
  loadCss('/css/swim.css');
  const g = new THREE.Group(); g.name = 'oyster-cove'; scene.add(g);
  const b = new Batcher({ vertexColors: true });
  // the beach behind the house: a towel and a bucket, up on the dry sand where the beach is widest, the towel draped over the
  // sand and the bucket's foot at its lowest point
  const { x: tx, z: tz, yaw: tyaw } = BEACH_TOWEL;
  drape(b, '#ff8fb8', tx, tz, 0.9, 1.8, tyaw, 0.012);
  drape(b, '#ffffff', tx, tz, 0.3, 1.8, tyaw, 0.018);
  const bx = tx + Math.cos(tyaw) * 1.15, bz = tz - Math.sin(tyaw) * 1.15 - 0.35;
  let by = terrainHeight(bx, bz);
  for (let k = 0; k < 8; k++) by = Math.min(by, terrainHeight(bx + Math.cos(k * 0.785) * 0.2, bz + Math.sin(k * 0.785) * 0.2));
  b.add(GEO.cyl12, '#3f8fd9', { x: bx, y: by - 0.02 + 0.15, z: bz, sx: 0.2, sy: 0.3, sz: 0.2 });
  colliders.push({ type: 'circle', x: bx, z: bz, r: 0.25 });
  b.build(g, 'oyster-cove');
  // oysters on every bed, three to a cluster: two instanced meshes (shells, pearls). Only the oysters within NEAR metres
  // of the camera are drawn (packed into the first instances, redone when the camera has moved OVER_M or one is taken or
  // grows back), low-poly shapes, and they cast no shadow (they lie on the lake floor): 114 oysters over the whole lake
  // as full spheres in every pass cost ~220k triangles at the lake on phone Max (perf-budget-test).
  const NEAR = 30, OVER_M = 6;
  const beds = oysterBeds(), oysters = [];
  const shell = toon('#8f8a7c'), pearl = toon('#f7f3ea', { emissive: '#ffffff', emissiveIntensity: 0.35 });
  const N = beds.length * 3;
  const shells = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), shell, N), pearls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), pearl, N);
  shells.name = 'oysters'; pearls.name = 'oyster-pearls';
  const _o = new THREE.Object3D();
  beds.forEach(([bx, bz], i) => {
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + i, x = bx + Math.cos(a) * 0.7, z = bz + Math.sin(a) * 0.7, y = terrainHeight(x, z) + 0.08;
      _o.position.set(x, y, z); _o.rotation.set(0, a, 0); _o.scale.set(0.22, 0.08, 0.18); _o.updateMatrix();
      const mat = _o.matrix.clone();
      _o.position.set(x, y + 0.06, z + 0.04); _o.rotation.set(0, 0, 0); _o.scale.setScalar(0.05); _o.updateMatrix();
      oysters.push({ i: oysters.length, x, z, y, a, gone: 0, pearl: (i + k) % 3 === 0, mat, pmat: _o.matrix.clone() });
    }
  });
  let packedAt = null, dirty = true;
  // (show: false while it grows back after being taken; pearlOn: whether this one has a pearl showing)
  const put = (o, show, pearlOn) => { o.pearl = !!(show && pearlOn); dirty = true; };
  function pack(cx, cz) {
    let n = 0, m = 0;
    for (const o of oysters) {
      if (o.gone > 0 || Math.abs(o.x - cx) > NEAR || Math.abs(o.z - cz) > NEAR) continue;
      shells.setMatrixAt(n++, o.mat);
      if (o.pearl) pearls.setMatrixAt(m++, o.pmat);
    }
    shells.count = n; pearls.count = m;
    shells.visible = n > 0; pearls.visible = m > 0;
    shells.instanceMatrix.needsUpdate = pearls.instanceMatrix.needsUpdate = true;
    if (n) shells.computeBoundingSphere();
    if (m) pearls.computeBoundingSphere();
    packedAt = packedAt || [0, 0]; packedAt[0] = cx; packedAt[1] = cz; dirty = false;
  }
  g.add(shells, pearls);
  shadows(g);
  shells.castShadow = pearls.castShadow = false;
  pack(camera.position.x, camera.position.z);

  // ---- HUD
  const hud = el('div', 'swim-hud', '', { hidden: '' });
  const label = el('div', 'swim-label', 'Breath and legs'); const barW = el('div', 'swim-bar'); const bar = el('div', 'swim-bar-fill'); barW.append(bar);
  const tips = el('div', 'swim-tips', ''); const bDive = el('button', 'btn swim-btn', 'Dive');
  hud.append(label, barW, tips, bDive); ctx.hud.append(hud);
  const tint = el('div', 'swim-tint'); document.body.append(tint);
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  let tipDev = '', tipText = ['', ''];
  bDive.hidden = !touch;

  audio.registerSfx?.('splash', (a, x, y, z, o) => { const out = a.at(x, y, z, 5); a.burst(out, { dur: 0.5 * (o?.size || 1), f: 700, Q: 0.7, peak: 0.2, brown: true, attack: 0.02 }); });
  audio.registerSfx?.('bubbles', (a, x, y, z) => { const out = a.at(x, y, z, 4); const t = a.ctx.currentTime; for (let i = 0; i < 5; i++) a.tone(out, { f: 600 + Math.random() * 900, glide: 1400, t: t + i * 0.09, d: 0.08, peak: 0.04, type: 'sine' }); });
  audio.registerSfx?.('stroke', (a, x, y, z) => { const out = a.at(x, y, z, 4); a.burst(out, { dur: 0.3, f: 900, Q: 0.6, peak: 0.09, brown: true, attack: 0.05 }); });
  audio.registerSfx?.('pry', (a, x, y, z) => { const out = a.at(x, y, z, 3); a.burst(out, { dur: 0.08, f: 1900, Q: 3, peak: 0.12 }); a.tone(out, { f: 240, glide: 180, d: 0.15, peak: 0.06 }); });

  const S = { on: false, stam: MAX, diving: false, depth: 0, carrying: 0, rest: 0, stroke: 0, pryT: 0, prying: null, bubbleT: 0 };
  const fxOf = () => ctx.features?.find(f => f.name === 'fishing')?.fx; // (the fishing feature's pooled ripples and drops)
  const myFx = {}, theirFx = new WeakMap();
  // the water's height and the bed under a swimmer, for the swim pose (bodies-poses swim: where the body floats, wades or stands)
  const wet = h => { const R = h.root.position; h.params.waterY = WATER_Y; h.params.floorY = terrainHeight(R.x, R.z); };
  // any water is open to swimmers (not while catching your breath); the pier and other floors are not water
  player.waterOK = (x, z) => S.rest <= 0 && !onSurface(x, z);
  const P = player.pos;

  function start() {
    S.on = true; S.diving = false; S.depth = 0; S.carrying = 0; S.stroke = 0;
    hud.hidden = false;
    audio.play?.('splash', P.x, WATER_Y, P.z, { size: 1.2 });
    ui.toast(touch ? 'Swimming! Dive is on the right. Oysters lie all over the lake floor.' : 'Swimming! Space dives, E pries an oyster loose. Watch your breath bar.', 4200);
    player.takeover = { anim: 'swim', update(dt, now, inp, pl) { step(dt, now, inp, pl); } };
  }
  function stop(toBeach) {
    S.puffed = false;
    S.on = false; S.diving = false; S.depth = 0; hud.hidden = true; tint.style.opacity = 0;
    ctx.quests?.clear('swim');
    player.takeover = null; player.character.params.seatY = 0;
    if (toBeach) {   // hauled out at the nearest shore (the beach behind the house if somehow none is found), facing the water
      const s = nearestShore(P.x, P.z) || [tx - 1.2, tz], fx = P.x, fz = P.z;
      P.set(s[0], terrainHeight(s[0], s[1]), s[1]); player.grounded = true;
      player.yaw = Math.atan2(fx - s[0], fz - s[1]);
    }
    else { P.y = terrainHeight(P.x, P.z); }
    if (S.carrying) { S.carrying = 0; ui.toast('The oyster slipped away.', 2000); }
  }
  function surfaceReward() {
    if (!S.carrying) return;
    S.carrying = 0;
    ctx.reward('oyster').then(r => { if (r.ok) ui.toast(`An oyster! That is one fish. (${r.left} more today)`, 3600); else if (r.why === 'cap') ui.toast('That is all the oysters Kevin will trade today.', 3200); else if (r.why === 'soon') ui.toast('Catch your breath before the next one.', 2500); });
  }
  function step(dt, now, inp, pl) {
    if (S.puffed) return;   // out of puff: bobbing still while the fade hands you to the shore
    const mv = inp.move();
    const cy = pl.cam.yaw;
    const fx = -Math.sin(cy), fz = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
    const sp = S.diving ? SPEED * 0.75 : SPEED;
    let nx = P.x + (fx * mv.y + rx * mv.x) * sp * dt, nz = P.z + (fz * mv.y + rz * mv.x) * sp * dt;
    // the map's edge holds you in (beyond it the world is scenery), and you swim round the pier, not up through it
    if (!pointInPoly(nx, nz, WALK)) { const c = closestOnPoly(nx, nz, WALK); const dx = c[0] - nx, dz = c[1] - nz, d = Math.hypot(dx, dz) || 1; nx = c[0] + (dx / d) * 0.05; nz = c[1] + (dz / d) * 0.05; }
    if (onSurface(nx, nz) && coastSigned(nx, nz) > 0) { nx = P.x; nz = P.z; }
    P.x = nx; P.z = nz;
    const moving = Math.hypot(mv.x, mv.y) > 0.2;
    if (moving) pl.yaw = Math.atan2(fx * mv.y + rx * mv.x, fz * mv.y + rz * mv.x);
    // out onto the beach: the takeover ends
    if (coastSigned(P.x, P.z) < -0.35 || onSurface(P.x, P.z)) { stop(false); return; }
    // depth
    const bed = terrainHeight(P.x, P.z) + 0.45;
    const surfaceY = WATER_Y - 0.3; // the body lies flat, so the origin (the feet) sits just under the surface
    const targetY = S.diving ? Math.max(bed, WATER_Y - 6) : surfaceY;
    const wasDeep = P.y < surfaceY - 0.3;
    P.y += clamp(targetY - P.y, -DIVE_SPEED * dt, DIVE_SPEED * dt);
    if (wasDeep && P.y >= surfaceY - 0.3) { audio.play?.('splash', P.x, WATER_Y, P.z); surfaceReward(); }
    S.depth = clamp((surfaceY - P.y) / 4, 0, 1);
    pl.character.params.seatY = 0;
    wet(pl.character);
    // stamina
    S.stam -= (S.diving ? DIVE_DRAIN : SURF_DRAIN) * dt;
    // the stroke's sound as a hand goes in, the splash and ring there, and the kick's foam
    if (stepWaterFx(fxOf(), pl.character, myFx, dt, now, camera, true)) audio.play?.('stroke', P.x, WATER_Y, P.z);
    if (S.diving) { S.bubbleT -= dt; if (S.bubbleT <= 0) { S.bubbleT = 1.8 + Math.random() * 2; audio.play?.('bubbles', P.x, P.y + 0.5, P.z); } }
    // prying an oyster
    if (S.prying) { S.pryT += dt; if (S.pryT > 0.8) { const o = S.prying; S.prying = null; o.gone = REGROW; put(o, false, false); S.carrying++; audio.play?.('pry', o.x, o.y, o.z); ui.toast('Got one! Swim up to the surface.', 2600); } }
    bar.style.width = Math.round(S.stam) + '%'; bar.classList.toggle('low', S.stam < 22);
    label.textContent = S.diving ? (S.carrying ? 'Diving (carrying an oyster)' : 'Diving') : 'Swimming';
    ctx.quests?.set('swim', { title: label.textContent, text: S.carrying ? 'Swim up to the surface to bank the oyster (one fish).' : 'Dive down to the oyster beds and pry one loose with E.', progress: S.stam / MAX, prio: 5, color: '#5fb3e6' });
    if (tipDev !== ctx.input.lastDevice) { // the tips name A and X on a pad (built when the device changes, not every frame)
      tipDev = ctx.input.lastDevice;
      const g = w => ctx.input.glyph(w), quiet = touch && tipDev !== 'pad';
      tipText = quiet ? ['', ''] : [`${g('Space')} surfaces  ${g('E')} pries an oyster loose`, `${g('Space')} dives  walk to the beach to get out`];
    }
    const tip = S.diving ? tipText[0] : tipText[1];
    if (tips.textContent !== tip) tips.textContent = tip;
    tint.style.opacity = (S.depth * 0.55).toFixed(2);
    if (S.stam <= 0) {
      S.stam = 0; S.rest = 5; S.puffed = true;
      audio.play?.('splash', P.x, WATER_Y, P.z, { size: 1.5 });
      ui.fade?.(1, 300).then?.(() => { stop(true); ui.fade(0, 500); });
      if (!ui.fade) stop(true);
      ui.toast('Phew! Out of puff. Catch your breath on the shore.', 3600);
      player.playEmote?.('sit', now);
    }
  }
  function dive() { if (!S.on) return; S.diving = !S.diving; if (S.diving) audio.play?.('bubbles', P.x, WATER_Y, P.z); }
  bDive.onclick = dive;

  return {
    name: 'swim',
    update(dt, now) {
      if (S.rest > 0) { S.rest -= dt; if (S.rest <= 0) { ui.toast('Rested. Back in?', 1600); player.emote = null; } }
      if (!S.on) S.stam = Math.min(MAX, S.stam + REST * dt);
      for (const o of oysters) if (o.gone > 0) { o.gone -= dt; if (o.gone <= 0) put(o, true, Math.random() < 0.33); }
      { const c = camera.position; if (dirty || Math.abs(c.x - packedAt[0]) > OVER_M || Math.abs(c.z - packedAt[1]) > OVER_M) pack(c.x, c.z); }
      // wading in: once you are past the shore, anywhere, you swim
      if (!S.on && !player.takeover && ctx.playing && S.rest <= 0 && coastSigned(P.x, P.z) > 0.9 && !onSurface(P.x, P.z)) start();
      if (S.on) { const c = camera.position; tint.style.opacity = c.y < WATER_Y ? '0.55' : (S.depth * 0.35).toFixed(2); }
    },
    target(px, pz) {
      if (!S.on) return null;
      if (S.diving) {
        let best = null, bd = 1.7;
        for (const o of oysters) { if (o.gone > 0) continue; const d = Math.hypot(px - o.x, pz - o.z); if (d < bd && Math.abs(P.y - o.y) < 1.6) { bd = d; best = o; } }
        if (best) return { hint: S.prying ? 'Prying...' : 'E  Pry the oyster loose', prio: 7, run: () => { if (!S.prying) { S.prying = best; S.pryT = 0; audio.play?.('pry', best.x, best.y, best.z); } } };
        if (touch && bDive.textContent !== 'Up') bDive.textContent = 'Up';
        return { hint: touch ? '' : 'Space  Surface', prio: 6, run: dive }; // (a phone has the button for it: no pill over the swimmer)
      }
      if (touch && bDive.textContent !== 'Dive') bDive.textContent = 'Dive';
      return { hint: touch ? '' : 'Space  Dive', prio: 6, run: dive };
    },
    onKey(code) { if (S.on && code === 'Space') { dive(); return true; } return false; },
    // other swimmers: the water for their pose, and their splashes
    afterRemotes(dt, now) {
      const fx = fxOf();
      for (const r of ctx.remotes.map.values()) {
        if (r.ch.anim !== 'swim') continue;
        wet(r.ch);
        let st = theirFx.get(r.ch); if (!st) theirFx.set(r.ch, st = {});
        stepWaterFx(fx, r.ch, st, dt, now, camera, false);
      }
    },
    help: [[['Space'], 'swimming: dive for oysters anywhere on the lake floor (one oyster = one fish)']],
    oysters, beds,   // (tests: where the beds are, which oysters are taken)
    get stamina() { return S.stam; },
  };
}
