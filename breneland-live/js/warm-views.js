// The first time a thing is drawn, ANGLE on a PC finishes its shader program then (about 20 ms each on Direct3D, after the
// link itself), and its geometry and textures go to the GPU: the first sight of Mama Carol's booth or the swing's numbers
// was a long frame in play (store-perf, 2026-11-02: half a second arriving at the game store's street). So in the first
// seconds after loading, while the start screen is up, the town is drawn once off screen from a few places (perf-lib's
// measuring spots: the yard, the park, Maple Row, the shops' street, the woods, the lake), one place a frame, into a
// 16 x 16 target nobody sees. The walk-in buildings warm their own insides (game-store.js). Computers only: a phone's
// compiles are slower and its programs fewer, and it would spend the start screen stuttering.
import * as THREE from 'three';
import { LAYER_SOFT } from './toon.js';
import { frameHooks } from './perf-flags.js';
import { GFX } from './gfx.js';

// [x, z, yaw]: standing there, looking that way (0 = +z); drawn facing that way and the opposite way
const VIEWS = [[2, -19, Math.PI - 0.3], [-50, -9, -Math.PI / 2 - 0.25], [-5, -120.5, -Math.PI / 2], [-152, -127, 0], [-150, -42, -Math.PI / 2], [47, -19, Math.PI / 2]];

export function createWarmViews(ctx) {
  const { scene, renderer: r } = ctx;
  let i = 0, level = GFX.level, at = performance.now() + 3500, rt = null; // (3.5 s: rigid-merge has merged the people by then, and a merged person is drawn differently)
  const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.3, 500);
  function draw([x, z, yaw], back) {
    const ink = ctx.ink;
    cam.position.set(x, 1.6, z); cam.lookAt(x + Math.sin(yaw + (back ? Math.PI : 0)) * 10, 1.4, z + Math.cos(yaw + (back ? Math.PI : 0)) * 10);
    cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const target = r.getRenderTarget();
    try {
      r.setRenderTarget(rt || (rt = new THREE.WebGLRenderTarget(16, 16))); r.clear();
      cam.layers.enable(LAYER_SOFT); r.render(scene, cam);
      if (ink?.normalMat) { cam.layers.disable(LAYER_SOFT); scene.overrideMaterial = ink.normalMat; r.render(scene, cam); scene.overrideMaterial = null; }
    } catch (e) { console.warn('[warm-views] draw failed', e); i = VIEWS.length * 2; }
    finally { r.setRenderTarget(target); }
  }
  frameHooks.push(() => {
    if (GFX.cls === 'phone' || ctx.below) return;
    if (level !== GFX.level) { level = GFX.level; i = 0; at = performance.now() + 1500; } // a new level: every program is new
    if (i >= VIEWS.length * 2 || performance.now() < at) return;
    draw(VIEWS[i >> 1], i & 1); i++;
    if (i >= VIEWS.length * 2 && rt) { rt.dispose(); rt = null; }
  });
  return { get done() { return i >= VIEWS.length * 2; }, get views() { return VIEWS.length; } };
}
