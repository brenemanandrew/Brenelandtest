// The Pose Editor's light (pose-editor). The game's own day and night runs underneath (daynight.js: the sky, the sun or moon, the fog,
// the lamps for the hour), so the time of day is the town's; over it a camera tool's lights: the key (the sun's light, or aimed
// anywhere), a fill from the camera's side, a rim from behind, the scene's lamps on or off, haze and exposure. No light here has a
// visible source: this is a camera, not the world.
//
//   createLights(env) -> { state, set(patch), apply(), dispose() }   env = { THREE, scene, camera, renderer, world, daynight, shadows, weather, LIGHT, SUN_DIR, NIGHT_SPOTS, LAMPS, setHour }
import * as THREE from 'three';

export const WEATHERS = [['clear', 'Clear'], ['cloudy', 'Cloudy'], ['overcast', 'Overcast'], ['fog', 'Fog'], ['rain', 'Rain'], ['snow', 'Snow']];

export function blankLights(hour = 12) {
  return {
    hour, weather: 'clear',
    key: { follow: true, az: 225, el: 35, i: 1, color: '#ffffff' },   // az: compass bearing the light comes FROM (0 north, 90 east), el: degrees up
    fill: { i: 0.35, color: '#cfe0ff' },
    rim: { i: 0, color: '#ffe6c4' },
    lamps: true, haze: 0.5, exposure: 1,
  };
}

export function createLights(env) {
  const { scene, camera, renderer, world, daynight, shadows, SUN_DIR, NIGHT_SPOTS, LAMPS } = env;
  const state = blankLights();
  const fill = new THREE.DirectionalLight('#ffffff', 0), rim = new THREE.DirectionalLight('#ffffff', 0);
  fill.name = 'pose-fill'; rim.name = 'pose-rim';
  for (const l of [fill, rim]) { l.castShadow = false; scene.add(l); scene.add(l.target); }
  const keyCol = new THREE.Color(), tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
  const spotK = new Map(); // the lamps' own strengths while they are off
  let target = null; // what the fill and the rim light (the scene's middle, pose-mode.js sets it)

  const dirFrom = (out, bearing, elev) => {
    const b = THREE.MathUtils.degToRad(bearing), e = THREE.MathUtils.degToRad(elev);
    return out.set(Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e));
  };
  // over daynight's frame: the key's way, strength and colour, the exposure, the haze
  const dnUpdate = daynight.update;
  daynight.update = function (...a) {
    dnUpdate.apply(this, a);
    const S = state, sun = world.sun;
    if (!S.key.follow) dirFrom(SUN_DIR, S.key.az, S.key.el);
    sun.intensity *= S.key.i;
    sun.color.multiply(keyCol.set(S.key.color));
    renderer.toneMappingExposure *= S.exposure;
    const k = Math.pow(2, (0.5 - S.haze) * 4);
    scene.fog.near *= k; scene.fog.far *= k;
    if (!S.lamps) for (const [, l] of LAMPS) l.mat.color.copy(l.base);
  };
  // after main.js has parked its lamp lights (and before the sun's shadow box is placed): the lamps off, the fill and rim placed
  const place = shadows.place;
  shadows.place = function (cam) {
    if (!state.lamps) for (const o of scene.children) if (o.isPointLight && o.userData.lampLight) o.intensity = 0;
    camera.getWorldDirection(fwd); right.crossVectors(fwd, THREE.Object3D.DEFAULT_UP).normalize();
    const c = target || tmp.copy(camera.position).addScaledVector(fwd, 4);
    // the fill: from the camera's left, a little above; the rim: from behind the subject, high
    fill.position.copy(c).addScaledVector(fwd, -6).addScaledVector(right, -4).add(tmp.set(0, 3, 0)); fill.target.position.copy(c);
    rim.position.copy(c).addScaledVector(fwd, 6).addScaledVector(right, 1.5).add(tmp.set(0, 5, 0)); rim.target.position.copy(c);
    fill.color.set(state.fill.color); fill.intensity = state.fill.i;
    rim.color.set(state.rim.color); rim.intensity = state.rim.i * 2.2;
    fill.updateMatrixWorld(); rim.updateMatrixWorld(); fill.target.updateMatrixWorld(); rim.target.updateMatrixWorld();
    return place.call(this, cam);
  };

  function set(patch) {
    const S = state;
    if (patch.hour !== undefined) { S.hour = ((+patch.hour % 24) + 24) % 24; env.setHour(S.hour); }
    if (patch.weather !== undefined) { S.weather = patch.weather; env.weather?.set(patch.weather); }
    for (const k of ['key', 'fill', 'rim']) if (patch[k]) Object.assign(S[k], patch[k]);
    if (patch.lamps !== undefined && patch.lamps !== S.lamps) {
      S.lamps = !!patch.lamps;
      for (const s of NIGHT_SPOTS) { if (!S.lamps) { if (!spotK.has(s)) spotK.set(s, s.k); s.k = 0; } else if (spotK.has(s)) { s.k = spotK.get(s); } }
      if (S.lamps) spotK.clear();
    }
    if (patch.haze !== undefined) S.haze = +patch.haze;
    if (patch.exposure !== undefined) S.exposure = +patch.exposure;
    renderer.shadowMap.needsUpdate = true;
  }
  return {
    state, set,
    setTarget(v) { target = v; },
    toJSON: () => JSON.parse(JSON.stringify(state)),
    load(j) { const b = blankLights(); set({ ...b, ...j, key: { ...b.key, ...(j?.key || {}) }, fill: { ...b.fill, ...(j?.fill || {}) }, rim: { ...b.rim, ...(j?.rim || {}) } }); },
    lights: { fill, rim },
  };
}
