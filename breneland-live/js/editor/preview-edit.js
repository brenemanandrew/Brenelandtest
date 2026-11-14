// Editing in the World Editor's 3D pane (main.js runs this in ?preview mode only). A tap or one-finger drag finds the
// ground under it and tells the editor, which runs the picked tool there as if you'd tapped the map. The camera: right-drag,
// wheel and WASD with a mouse, two fingers to pan, pinch and twist on touch.
// It also draws the editor's marks (selection ring, pins on points being drawn) and redraws the ground after a raise or dig.
import * as THREE from 'three';
import { groundHeight, WATER_Y, TERRAIN_BRUSHES, buildTerrain } from '../terrain.js';

export function createPreviewEdit({ canvas, camera, player, world, renderer }) {
  let on = true;
  const send = m => parent?.postMessage(m, location.origin);

  // ---- where a screen point meets the ground
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), p = new THREE.Vector3();
  const floorAt = (x, z) => Math.max(groundHeight(x, z), WATER_Y);
  function groundAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    let prev = 0;
    for (let t = 0.5; t < 700; t += t < 60 ? 0.5 : 2) {
      p.copy(o).addScaledVector(d, t);
      if (p.y <= floorAt(p.x, p.z)) {
        let a = prev, b = t; // bisect to a few cm
        for (let i = 0; i < 12; i++) { const m = (a + b) / 2; p.copy(o).addScaledVector(d, m); if (p.y <= floorAt(p.x, p.z)) b = m; else a = m; }
        p.copy(o).addScaledVector(d, b);
        return { x: p.x, z: p.z, dist: b };
      }
      prev = t;
    }
    return null;
  }
  // a thumb's width on the ground at that distance (what counts as "on" a thing)
  const tolAt = dist => Math.max(0.6, dist * Math.tan((camera.fov * Math.PI / 180) / 2) * 2 * (22 / canvas.clientHeight));

  // ---- one pointer edits; everything else is the camera
  let editPtr = null; // { id, x0, y0, moved }
  const touches = new Map();
  let two = null; // { mx, my, d, a, x, z, yaw, dist }
  function down(e) {
    if (!on) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return; // right-drag: the game's own look
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { cancelEdit(); startTwo(); return; }
      if (touches.size > 2) return;
    }
    const g = groundAt(e.clientX, e.clientY); if (!g) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* fine */ }
    editPtr = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
    send({ type: 'pick', phase: 'down', x: g.x, z: g.z, tol: tolAt(g.dist) });
  }
  function move(e) {
    if (!on) return;
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (two) { e.stopImmediatePropagation(); moveTwo(); return; } }
    if (!editPtr || e.pointerId !== editPtr.id) return;
    e.stopImmediatePropagation();
    if (Math.hypot(e.clientX - editPtr.x0, e.clientY - editPtr.y0) > 5) editPtr.moved = true;
    if (!editPtr.moved) return;
    const g = groundAt(e.clientX, e.clientY); if (g) send({ type: 'pick', phase: 'move', x: g.x, z: g.z });
  }
  function up(e) {
    if (e.pointerType === 'touch') { touches.delete(e.pointerId); if (touches.size < 2) two = null; }
    if (!editPtr || e.pointerId !== editPtr.id) return;
    e.stopImmediatePropagation();
    const g = groundAt(e.clientX, e.clientY);
    send({ type: 'pick', phase: 'up', moved: editPtr.moved, x: g?.x, z: g?.z });
    editPtr = null;
  }
  function cancelEdit() { if (editPtr) { send({ type: 'pick', phase: 'cancel' }); editPtr = null; } }
  const c = () => player.cam;
  function mid() { const [a, b] = [...touches.values()]; return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x) }; }
  function startTwo() { const m = mid(); two = { ...m, x: player.pos.x, z: player.pos.z, yaw: c().yaw, dist: c().targetDist }; }
  function moveTwo() {
    const m = mid(), cam = c();
    // pan: the ground follows the fingers
    const s = cam.dist * 0.0028, yaw = cam.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
    const dx = m.mx - two.mx, dy = m.my - two.my;
    const x = two.x - dx * s * rx + dy * s * fx, z = two.z - dx * s * rz + dy * s * fz;
    player.place(x, z, player.yaw);
    // twist turns, pinch zooms
    cam.yaw = two.yaw - (m.a - two.a);
    cam.targetDist = Math.max(4, Math.min(60, two.dist * two.d / Math.max(20, m.d)));
    cam.manualAt = performance.now() / 1000;
  }
  canvas.addEventListener('pointerdown', down, true);
  addEventListener('pointermove', move, true);
  addEventListener('pointerup', up, true);
  addEventListener('pointercancel', e => { touches.delete(e.pointerId); two = null; if (editPtr && e.pointerId === editPtr.id) cancelEdit(); }, true);
  // the game's touch joystick and look live on touch events: keep them off the 3D pane while editing
  for (const ev of ['touchstart', 'touchmove', 'touchend']) canvas.addEventListener(ev, e => { if (on) { e.stopImmediatePropagation(); e.preventDefault(); } }, { capture: true, passive: false });
  canvas.addEventListener('click', e => { if (on) e.stopImmediatePropagation(); }, true);

  // ---- marks from the editor: the selection ring and the points being drawn
  const ink = new THREE.MeshBasicMaterial({ color: '#e0463c', depthTest: false, transparent: true, opacity: 0.9 });
  const ringGeo = new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, ink); ring.renderOrder = 999; ring.visible = false; world.root.add(ring);
  const pinGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.2, 8).translate(0, 1.1, 0);
  const pins = new THREE.Group(); pins.renderOrder = 999; world.root.add(pins);
  const pinMat = new THREE.MeshBasicMaterial({ color: '#e0463c', depthTest: false });
  function marks(m) {
    if (m.sel && Number.isFinite(m.sel.x)) { ring.visible = true; ring.position.set(m.sel.x, floorAt(m.sel.x, m.sel.z) + 0.08, m.sel.z); const r = Math.max(0.8, m.sel.r || 1); ring.scale.set(r, 1, r); }
    else ring.visible = false;
    pins.clear();
    for (const [x, z] of m.pts || []) { const pin = new THREE.Mesh(pinGeo, pinMat); pin.position.set(x, floorAt(x, z), z); pin.renderOrder = 999; pins.add(pin); }
  }
  // ---- the ground, rebuilt when a raise or dig changes (grass and trees settle on Rebuild)
  function terrain(list) {
    TERRAIN_BRUSHES.length = 0;
    for (const b of list || []) if (b && b.r > 0.5) TERRAIN_BRUSHES.push({ x: +b.x, z: +b.z, r: Math.min(80, +b.r), dh: Math.max(-6, Math.min(12, +b.dh)) });
    const old = world.root.getObjectByName('terrain');
    const fresh = buildTerrain();
    if (old) { world.root.remove(old); old.traverse(o => { o.geometry?.dispose(); }); }
    world.root.add(fresh);
    fresh.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
    renderer.shadowMap.needsUpdate = true;
  }

  return {
    get on() { return on; },
    setOn(v) { on = !!v; cancelEdit(); touches.clear(); two = null; },
    marks, terrain,
  };
}
