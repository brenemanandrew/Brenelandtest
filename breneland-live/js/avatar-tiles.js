// The avatar creator's picture tiles: each option drawn small on the player's own character, with the game's renderer (a render
// target read back, like fish-board.js's portraits). Kept cheap: a lite Human (no arm fit), a few pictures a frame (pump), only
// what's asked for, cached by what each frame shows (a head picture doesn't change when the trousers do).
import * as THREE from 'three';
import { Human, avatarLook } from './human.js';

export const TILE_PX = 160;
// what each frame shows, for the cache key: the profile fields that change a picture of that kind (the rest are left out)
const HEAD_KEYS = ['face', 'eyes', 'eyeCol', 'eyeStyle', 'brows', 'nose', 'mouth', 'blush', 'lines', 'glasses', 'facial', 'hair', 'hairStyle', 'hatColor', 'skinCol', 'outfit'];
const FRAMES = {
  head: { keys: HEAD_KEYS, top: true },
  hair: { keys: HEAD_KEYS, top: true },
  body: { keys: null },
  torso: { keys: null },   // the figure: neck to knees, turned a little more so the side's curves show
  run: { keys: null },     // the whole person mid-stride, side-on and a little from the front (the run style's slider)
};

export function createTiles(getRenderer, { decorate = null } = {}) { // decorate(human, profile) runs after it's built, e.g. cloth textures
  let rt = null, scene = null, cam = null;
  const cache = new Map(), queue = [];
  let made = 0;
  const rig = () => {
    if (rt) return;
    rt = new THREE.WebGLRenderTarget(TILE_PX, TILE_PX, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff6e6', '#8fa3b8', 1.7));
    const sun = new THREE.DirectionalLight('#ffffff', 2.1); sun.position.set(1.4, 2.2, 2.6); scene.add(sun);
    cam = new THREE.PerspectiveCamera(26, 1, 0.05, 30);
    cam.layers.enableAll();
  };
  const keyOf = (profile, frame) => {
    const F = FRAMES[frame] || FRAMES.body, L = profile.look || {};
    const pick = F.keys ? Object.fromEntries(F.keys.map(k => [k, L[k]])) : L;
    if (profile.rawLook) return frame + '|raw|' + (profile.yaw ?? '') + '|' + (profile.tex || '') + '|' + JSON.stringify(profile.rawLook); // a whole Human look, not a player's profile
    return frame + '|' + profile.color + '|' + profile.hat + '|' + profile.skin + '|' + JSON.stringify(pick);
  };
  const v = new THREE.Vector3(), px = new Uint8Array(TILE_PX * TILE_PX * 4);
  function draw(job) {
    const renderer = getRenderer();
    if (!renderer) return null;
    rig();
    const h = new Human(job.profile.rawLook || avatarLook(job.profile), { lite: true });
    h.phase = 0; h.blinkT = 99;
    if (decorate) { try { decorate(h, job.profile); } catch (e) { console.error(e); } }
    if (job.frame === 'run') {
      h.lastSpeed = 6;
      for (let i = 0; i < 8; i++) h.update(1 / 30, i / 30, 6, 'run');
      h.cyc = 0.42; h.update(1e-4, 0.3, 6, 'run'); // just before the foot lands: the legs split, the arms near the ends of their swing
    } else for (let i = 0; i < 3; i++) h.update(1 / 30, i / 30, 0, 'idle');
    scene.add(h.root);
    h.root.rotation.y = job.yaw ?? job.profile.yaw ?? (job.frame === 'body' ? 0.32 : job.frame === 'torso' ? 0.62 : job.frame === 'run' ? 1.15 : 0.38);
    h.root.updateMatrixWorld(true);
    const s = h.root.scale.y || 1;
    if (job.frame === 'torso') {
      const a = h.hips.getWorldPosition(new THREE.Vector3()), n = h.neck.getWorldPosition(new THREE.Vector3()), top = n.y + 0.06 * s, bot = a.y - 0.32 * s, hgt = top - bot;
      const dist = (hgt * 0.6) / Math.tan((cam.fov * Math.PI) / 360), cy = (top + bot) / 2;
      cam.position.set(a.x, cy + 0.05 * s, a.z + dist); cam.lookAt(a.x, cy, a.z);
    } else if (job.frame === 'body' || job.frame === 'run') {
      const box = new THREE.Box3().setFromObject(h.root), c = box.getCenter(new THREE.Vector3()), hgt = box.max.y - box.min.y;
      const dist = (hgt * 0.56) / Math.tan((cam.fov * Math.PI) / 360);
      cam.position.set(c.x + 0.25 * dist * 0.2, c.y + hgt * 0.06, c.z + dist); cam.lookAt(c.x, c.y, c.z);
    } else {
      h.headC.getWorldPosition(v);
      const hs = (h.opts.headSize || 1) * s, dist = 2.05 * hs, up = job.frame === 'hair' ? 0.06 : 0.0;
      cam.position.set(v.x, v.y + (0.1 + up) * hs, v.z + dist); cam.lookAt(v.x, v.y + (0.02 + up) * hs, v.z);
    }
    const prevT = renderer.getRenderTarget(), prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevAuto = renderer.autoClear;
    try {
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.autoClear = true;
      renderer.clear(); renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, TILE_PX, TILE_PX, px);
    } finally {
      renderer.setRenderTarget(prevT); renderer.setClearColor(prevC, prevA); renderer.autoClear = prevAuto;
      scene.remove(h.root); h.dispose();
    }
    const cv = document.createElement('canvas'); cv.width = cv.height = TILE_PX;
    const g = cv.getContext('2d'), img = g.createImageData(TILE_PX, TILE_PX);
    for (let y = 0; y < TILE_PX; y++) img.data.set(px.subarray((TILE_PX - 1 - y) * TILE_PX * 4, (TILE_PX - y) * TILE_PX * 4), y * TILE_PX * 4); // (GL rows are bottom-up)
    g.putImageData(img, 0, 0);
    made++;
    return cv;
  }
  return {
    // ask for a picture of `profile` in `frame` ('head' | 'hair' | 'body'): cb(canvas) now if cached, else when it is made. A newer
    // ask for the same target element replaces an older one still waiting (tag).
    request(profile, frame, cb, tag = null) {
      const k = keyOf(profile, frame), hit = cache.get(k);
      if (hit) { cache.delete(k); cache.set(k, hit); cb(hit); return true; }
      if (tag !== null) { const i = queue.findIndex(j => j.tag === tag); if (i >= 0) queue.splice(i, 1); }
      queue.push({ k, profile: JSON.parse(JSON.stringify(profile)), frame, cb, tag });
      return false;
    },
    // drop everything still waiting (the section changed)
    cancel() { queue.length = 0; },
    // make pictures for up to `ms` (at least one), in the order asked (the top of the section first)
    pump(ms = 6) {
      if (!queue.length) return 0;
      const t0 = performance.now();
      let n = 0;
      while (queue.length && (n === 0 || performance.now() - t0 < ms)) {
        const job = queue.shift();
        let cv = cache.get(job.k);
        if (!cv) { cv = draw(job); if (!cv) { queue.unshift(job); break; } cache.set(job.k, cv); while (cache.size > 360) cache.delete(cache.keys().next().value); }
        job.cb(cv); n++;
      }
      return n;
    },
    get waiting() { return queue.length; },
    get made() { return made; },
    get cached() { return cache.size; },
    dispose() { queue.length = 0; cache.clear(); rt?.dispose(); rt = null; },
  };
}
