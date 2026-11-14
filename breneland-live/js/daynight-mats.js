// Day/night shared state and the materials that change with the hour (window glass, lamp bulbs). A leaf module:
// world.js, house.js, areas.js, campfire.js and intro.js import from here; daynight.js drives it every frame.
import * as THREE from 'three';
import { GRADIENT_3 } from './toon.js';

// Written by daynight.js once a frame; read by anyone who wants to know how dark it is.
export const LIGHT = {
  hour: 12, sun: 1, night: 0, twilight: 0, dawn: 0, dusk: 0, label: 'day', moonUp: 0,
  // the intro walk scales these (dark hallway, then the door opens onto the yard)
  introHemi: 1, introExposure: 1,
  woods: 0, // 0 in the open, 1 deep in Strickler woods (main.js sets it from where you stand): darker, closer fog
  flashColor: new THREE.Color('#fff6dc'), flashK: 1,
  moonDir: new THREE.Vector3(0, 1, 0), moonVis: 0, // where the moon is (a unit direction from anywhere: the sky is far) and how visible (0..1); the intro looks up at it
};

// The weather right now, 0..1 each and eased. weather.js writes it every frame from Arden, NC's real forecast or an
// override. `local` is how far inside the Arkham corner's own storm you stand. `frame` is weather.js's per-frame hook,
// called first thing by daynight.js so it runs in every mode, the start screen and intro included.
export const WEATHER = {
  condition: 'clear', cloud: 0, rain: 0, snow: 0, fog: 0, wind: 0, windDir: 0, storm: 0, tempC: null,
  local: 0, flash: 0, skyFlash: 0, gust: 0,
  skyCloud: new THREE.Color('#9fb5d6'), skyCloudI: 0.35, // what daynight.js tints the clouds with this frame (the deck follows)
  quality: 'high', frame: null,
};

// Window glass. By day every pane reflects the sky; at dusk the rooms light up in four waves and go dark again at
// different times of the night (bucket 0 stays up all night; bucket 4 is nobody home). Deterministic: callers pick the
// bucket from a hash of the window's position.
export const GLASS_DAY = '#b4dcf0', GLASS_EM_DAY = '#7fb8d8';
export const GLASS = [0, 1, 2, 3, 4].map(i => {
  const m = new THREE.MeshToonMaterial({ color: new THREE.Color(GLASS_DAY), gradientMap: GRADIENT_3, emissive: new THREE.Color(GLASS_EM_DAY), emissiveIntensity: 0.45 });
  m.name = 'window-glass-' + i;
  return m;
});
export function windowGlass(h) { return GLASS[h < 0.16 ? 4 : Math.min(3, Math.floor((h - 0.16) / 0.84 * 4))]; }

// Lamp bulbs: plain bright materials (like glow()) that are pale by day and burn at night.
export const LAMPS = new Map(); // colour -> { mat, base }
export function lampGlow(color) {
  let l = LAMPS.get(color);
  if (!l) {
    const base = new THREE.Color(color);
    l = { mat: new THREE.MeshBasicMaterial({ color: base.clone(), fog: true }), base };
    l.mat.name = 'lamp-' + color;
    LAMPS.set(color, l);
  }
  return l.mat;
}

// Places that give light at night: { x, y, z, color, pool (ground radius, 0 = none), gy (ground y), halo (size), flicker }.
// World pieces push to this while they build; daynight-fx.js turns them into light pools and halos.
export const NIGHT_SPOTS = [];
export function addNightSpot(spot) { NIGHT_SPOTS.push({ pool: 0, halo: 0.9, flicker: 0, gy: null, ...spot }); }
