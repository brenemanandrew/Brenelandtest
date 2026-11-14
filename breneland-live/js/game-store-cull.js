// Inside the game store the walls are solid, but three still walks and draws the whole town through them: at Clem's counter
// about 1000 draw calls a frame, 32 of them the store's own (store-perf, 2026-11-02).
// While the camera is inside, a thing outside is drawn only if it could be seen through an opening: the front door, the back
// room's glass door and (store-windows) every window. Each opening is a wedge from the camera through its rectangle; an outside thing
// whose bounding sphere misses every wedge is hidden for the colour and ink passes and shown again after them. The shadow
// maps are drawn with everything shown (the hiding is lifted round them), so no shadow changes. Nothing here moves or
// re-dresses anything, and prop-merge's checks and the world-matrix walk run before the passes, so they never see it.
//
//   const cull = createStoreCull({ scene, camera, renderer, box, keep, portals, groups });   then cull.install(ink)
//     box      { minX, maxX, minZ, maxZ, y0, y1 }: the building; the cull is on while the camera is in it
//     keep(o)  true for a top-level object that is never hidden (the store itself, the people in it, the lamps' pools)
//     portals  () -> the openings: [{ z, lo, hi, y0, y1, out }] a rectangle on a wall at z, x from lo to hi, y from y0 to
//              y1; out +1 when the outside is beyond it (z > wall), -1 when before it. Or { x, lo, hi, ... }: a wall at x,
//              z from lo to hi (store-windows: the side walls' windows). edge { z, y } (optional): a floor's edge along x
//              that hides the opening's lower view from a camera in front of it (z < edge.z) and below it: the wedge gets a
//              sixth plane, through the camera and that edge (the loft's windows, seen from the shop floor over the loft)
//     groups   { name: radius }: a top-level group whose children are tested one by one (the town folk, the cars: they
//              move), each as a sphere of that radius about its position; 0 = a cached bounding sphere (the world's parts)
import * as THREE from 'three';
import { view } from './perf-flags.js';

const MARGIN = 1.5;      // m added to a cached bounding sphere: things that sway or swing inside their group
const DEPTH = 3;         // how far down into a group's children the test goes (the world, its yard, a table on it)
const REFRESH = 300;     // frames before a cached sphere is worked out again (one a frame, so no long frame)
const _box = new THREE.Box3(), _s = new THREE.Sphere(), _c = new THREE.Vector3(), _mid = new THREE.Vector3();
const _corner = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

export function createStoreCull({ scene, camera, renderer, box, keep, portals, groups = {} }) {
  const wedges = [];       // [{ planes: Plane[5] }] built once, reused
  for (let i = 0; i < 12; i++) wedges.push({ planes: Array.from({ length: 6 }, () => new THREE.Plane()), n: 5 });
  let nW = 0;
  const hidden = [];
  let nH = 0, on = false, frame = 0, lastHidden = 0, refreshed = 0;
  const cache = new WeakMap(); // o -> { s: Sphere, m: Float64Array(16), at }

  // the wedge from the camera c through a portal p: the wall's plane facing out, then a plane through c and each edge
  function wedge(p, c, w) {
    const X = p.x !== undefined, at = X ? p.x : p.z;
    if (((X ? c.x : c.z) - at) * p.out >= 0) return false; // the camera is not on the inside of this wall
    const P = w.planes;
    if (X) P[0].normal.set(p.out, 0, 0); else P[0].normal.set(0, 0, p.out);
    P[0].constant = -p.out * at;
    if (X) { _corner[0].set(at, p.y0, p.lo); _corner[1].set(at, p.y0, p.hi); _corner[2].set(at, p.y1, p.hi); _corner[3].set(at, p.y1, p.lo); _mid.set(at, (p.y0 + p.y1) / 2, (p.lo + p.hi) / 2); }
    else { _corner[0].set(p.lo, p.y0, at); _corner[1].set(p.hi, p.y0, at); _corner[2].set(p.hi, p.y1, at); _corner[3].set(p.lo, p.y1, at); _mid.set((p.lo + p.hi) / 2, (p.y0 + p.y1) / 2, at); }
    for (let i = 0; i < 4; i++) {
      const pl = P[i + 1];
      pl.setFromCoplanarPoints(c, _corner[i], _corner[(i + 1) % 4]);
      if (pl.distanceToPoint(_mid) < 0) pl.negate(); // the inside of the wedge is where the portal's middle is
    }
    w.n = 5;
    const E = p.edge;
    if (E && c.z < E.z && c.y < E.y) { // the floor's edge: only what is seen over it (above the plane through the camera and the edge)
      _corner[0].set(c.x, E.y, E.z); _corner[1].set(c.x + 1, E.y, E.z);
      P[5].setFromCoplanarPoints(c, _corner[0], _corner[1]);
      _mid.set(c.x, E.y + 1, E.z);
      if (P[5].distanceToPoint(_mid) < 0) P[5].negate();
      w.n = 6;
    }
    return true;
  }
  const hits = (w, s) => { const P = w.planes; for (let i = 0; i < w.n; i++) if (P[i].distanceToPoint(s.center) < -s.radius) return false; return true; };
  const inBox = s => s.center.x + s.radius > box.minX && s.center.x - s.radius < box.maxX && s.center.z + s.radius > box.minZ && s.center.z - s.radius < box.maxZ && s.center.y + s.radius > box.y0 && s.center.y - s.radius < box.y1;
  const sees = s => { if (inBox(s)) return true; for (let i = 0; i < nW; i++) if (hits(wedges[i], s)) return true; return false; }; // (a world sphere: would it be drawn?)
  const sameM = (a, e) => { for (let i = 0; i < 16; i++) if (a[i] !== e[i]) return false; return true; };

  // a static thing's bounding sphere, cached; worked out again when its matrix changed, or now and then (one a frame).
  // null for a thing with nothing to draw, or one holding a light (the firepit, the water tower, the house): hiding a light
  // changes the lights every shader is built for, and three links every program again
  function bounds(o) {
    let c = cache.get(o);
    const e = o.matrixWorld.elements;
    const stale = c && (!sameM(c.m, e) || (frame - c.at > REFRESH && refreshed < 1));
    if (c && !stale) return c.skip ? null : c.s;
    if (c) refreshed++;
    if (!c) { c = { s: new THREE.Sphere(), m: new Float64Array(16), at: 0, skip: false }; cache.set(o, c); }
    c.m.set(e); c.at = frame;
    let light = false;
    o.traverse(q => { if (q.isLight) light = true; });
    _box.setFromObject(o);
    c.skip = light || _box.isEmpty();
    if (!c.skip) { _box.getBoundingSphere(c.s); c.s.radius += MARGIN; }
    return c.skip ? null : c.s;
  }
  // r > 0: a mover, a sphere of that radius where it stands. Else its cached bounds: a thing whose sphere no wedge
  // touches hides; a group that is touched (the world's yard, the town: huge) is looked into, down to DEPTH levels
  function test(o, r, depth) {
    if (r > 0) { const e = o.matrixWorld.elements; _s.center.set(e[12], e[13], e[14]); _s.radius = r; }
    else { const b = bounds(o); if (!b) { if (depth < DEPTH && !o.isMesh) for (const ch of o.children) if (ch.visible) test(ch, 0, depth + 1); return; } _s.copy(b); }
    if (inBox(_s)) return;                      // in the store (a dog that followed you in): drawn
    for (let i = 0; i < nW; i++) if (hits(wedges[i], _s)) { if (r === 0 && depth < DEPTH && !o.isMesh && o.children.length > 1) for (const ch of o.children) if (ch.visible) test(ch, 0, depth + 1); return; }
    o.visible = false; hidden[nH++] = o;
  }
  const show = () => { for (let i = 0; i < nH; i++) hidden[i].visible = true; };
  const hide = () => { for (let i = 0; i < nH; i++) hidden[i].visible = false; };

  // before the passes (the shadow maps are placed, not yet drawn): hide what no opening shows from where the camera is
  function cull(c = camera.position) {
    frame++; refreshed = 0; nH = 0;
    on = c.x > box.minX && c.x < box.maxX && c.z > box.minZ && c.z < box.maxZ && c.y > box.y0 && c.y < box.y1;
    if (!on) { lastHidden = 0; return; }
    view.indoorCull = 2; view.indoorSees = sees; // (world-trees.js: next frame the woods weigh their cells by what these wedges show)
    nW = 0;
    for (const p of portals()) if (nW < wedges.length && wedge(p, c, wedges[nW])) nW++;
    for (const o of scene.children) {
      if (o.isLight || o.isCamera || !o.visible || keep(o)) continue;
      const r = groups[o.name];
      if (r !== undefined) { for (const ch of o.children) if (ch.visible) test(ch, r, 1); }
      else test(o, 0, 0);
    }
    lastHidden = nH;
  }

  let installed = false;
  return {
    get state() { return { on, hidden: lastHidden, wedges: on ? nW : 0 }; },
    get hiddenNames() { return hidden.slice(0, lastHidden).map(o => { let p = o; while (p.parent && p.parent !== scene) p = p.parent; return (p === o ? '' : (p.name || p.type) + '/') + (o.name || o.type); }); }, // (tests)
    // a render of your own from a camera standing at p (the warm-up draw): hide for it, draw, then show()
    hideFor(p) { cull(p); return nH; },
    show() { show(); nH = 0; on = false; lastHidden = 0; },
    // round the ink pass: hide before the colour and normal passes, show for the shadow maps' own draws, show after
    install(ink) {
      if (installed || !ink) return;
      installed = true;
      const prevB = ink.beforePasses, prevA = ink.afterPasses;
      ink.beforePasses = (s, c) => { prevB?.(s, c); cull(); };
      ink.afterPasses = (s, c) => { show(); nH = 0; prevA?.(s, c); };
      const sm = renderer.shadowMap, prev = sm.render;
      sm.render = function (lights, s, c) { if (nH) show(); try { return prev.call(this, lights, s, c); } finally { if (nH) hide(); } };
    },
  };
}
