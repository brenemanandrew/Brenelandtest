// The Pose Editor's handles (pose-editor): a dot on every joint of the chosen person, a cube on each hand and foot to drag (IK), a
// cone for each IK'd elbow or knee to say which way it bends, a ring on the ground to move the person and a knob on it to turn them,
// and the rotation gizmo (three rings, red x, green y, blue z) on the chosen joint. They live in their own scene, drawn over the
// picture after the ink pass and never in a Shot. Each keeps the same size on screen.
import * as THREE from 'three';

const COL = { joint: '#ffffff', jointOn: '#ffd24a', ik: '#f58ab0', ikOn: '#ff4f8a', pole: '#8fd0ee', move: '#7dd36a', turn: '#ffd24a', x: '#ff5a4f', y: '#5fd35a', z: '#4f8fff', look: '#c8b1f5' };
const mat = (c, o = 0.95) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false, toneMapped: false });
const SPH = new THREE.SphereGeometry(1, 14, 10), BOX = new THREE.BoxGeometry(1.6, 1.6, 1.6), CONE = new THREE.ConeGeometry(0.9, 2, 12);
const RING = new THREE.TorusGeometry(1, 0.035, 6, 64), RING_HIT = new THREE.TorusGeometry(1, 0.14, 4, 48);
const FLAT = new THREE.TorusGeometry(1, 0.04, 4, 64), KNOB = new THREE.SphereGeometry(1, 12, 8);

export function createHandles() {
  const scene = new THREE.Scene();
  scene.name = 'pose-handles';
  const joints = new Map(), iks = new Map(), poles = new Map();
  const group = new THREE.Group(); scene.add(group);
  // the move ring on the ground and its turn knob
  const ring = new THREE.Mesh(FLAT, mat(COL.move, 0.85)); ring.rotation.x = Math.PI / 2; ring.userData.h = { kind: 'move' };
  const ringHit = new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 4, 40), mat('#000', 0)); ringHit.rotation.x = Math.PI / 2; ringHit.userData.h = { kind: 'move' };
  const knob = new THREE.Mesh(KNOB, mat(COL.turn)); knob.userData.h = { kind: 'turn' };
  const base = new THREE.Group(); base.add(ring, ringHit, knob); group.add(base);
  // the gizmo
  const giz = new THREE.Group(); group.add(giz);
  const axes = {};
  for (const a of ['x', 'y', 'z']) {
    const r = new THREE.Mesh(RING, mat(COL[a])), hit = new THREE.Mesh(RING_HIT, mat('#000', 0));
    const g = new THREE.Group(); g.add(r, hit);
    if (a === 'x') g.rotation.y = Math.PI / 2; else if (a === 'y') g.rotation.x = Math.PI / 2;
    r.userData.h = hit.userData.h = { kind: 'ring', axis: a };
    giz.add(g); axes[a] = r;
  }
  // the look target's marker (a small lilac diamond where the eyes are aimed)
  const look = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mat(COL.look)); look.visible = false; group.add(look);

  let char = null, sel = null, axisHot = null;
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion();
  const size = (cam, p, px) => { const d = cam.position.distanceTo(p); return d * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 2 * px / 900; };

  function dot(map, key, geo, col, data) {
    let m = map.get(key);
    if (!m) { m = new THREE.Mesh(geo, mat(col)); m.userData.h = data; map.set(key, m); group.add(m); }
    return m;
  }
  // build (or hide) the handles for one person
  function setChar(c) {
    char = c;
    for (const m of [...joints.values(), ...iks.values(), ...poles.values()]) m.visible = false;
    if (!c) { base.visible = false; giz.visible = false; return; }
    base.visible = true;
    for (const j of c.joints) dot(joints, j.id, SPH, COL.joint, { kind: 'joint', id: j.id }).visible = true;
    for (const k of c.chains) dot(iks, k, BOX, COL.ik, { kind: 'ik', id: k }).visible = true;
  }
  function setJoint(id) { sel = id; }
  function frame(cam, ikState) {
    if (!char) { giz.visible = false; return; }
    const r = char.root;
    r.updateWorldMatrix(true, true);
    const s0 = size(cam, r.position, 60) * char.scale;
    base.position.copy(r.position); base.position.y += 0.02;
    const rr = Math.max(0.42 * char.scale, s0 * 0.5);
    ring.scale.setScalar(rr); ringHit.scale.setScalar(rr);
    const yaw = r.rotation.y;
    knob.position.set(Math.sin(yaw) * rr, 0, Math.cos(yaw) * rr); knob.scale.setScalar(size(cam, r.position, 9));
    for (const j of char.joints) {
      const o = char.jointObject(j.id), m = joints.get(j.id);
      if (!o || !m) continue;
      o.getWorldPosition(m.position);
      if (j.id === 'body') m.position.y = r.position.y + (char.dims ? char.dims.legLen * 0.55 * char.scale : 0.5); // (the whole body's dot: low on the hips, apart from the hips' own)
      m.scale.setScalar(size(cam, m.position, j.id === sel ? 9 : 6.5));
      m.material.color.set(j.id === sel ? COL.jointOn : COL.joint);
    }
    for (const k of char.chains) {
      const m = iks.get(k);
      if (!m) continue;
      const on = ikState?.[k];
      if (on) m.position.set(on.t[0], on.t[1], on.t[2]).applyMatrix4(r.matrixWorld); else char.effector(k, m.position);
      m.scale.setScalar(size(cam, m.position, 7));
      m.material.color.set(on ? COL.ikOn : COL.ik);
      const p = dot(poles, k, CONE, COL.pole, { kind: 'pole', id: k });
      p.visible = !!on;
      if (on) { p.position.set(on.p[0], on.p[1], on.p[2]).applyMatrix4(r.matrixWorld); p.scale.setScalar(size(cam, p.position, 6)); p.lookAt(m.position); p.rotateX(Math.PI / 2); }
    }
    const o = sel ? char.jointObject(sel) : null;
    giz.visible = !!o;
    if (o) {
      const pos = sel === 'body' ? joints.get('body').position : o.getWorldPosition(_p);
      giz.position.copy(pos); o.getWorldQuaternion(_q); giz.quaternion.copy(_q);
      giz.scale.setScalar(size(cam, pos, 70));
      for (const a of ['x', 'y', 'z']) { axes[a].material.opacity = axisHot && axisHot !== a ? 0.35 : 0.95; axes[a].scale.setScalar(axisHot === a ? 1.04 : 1); }
    }
  }
  function setLook(p, cam) { look.visible = !!p; if (p) { look.position.copy(p); look.scale.setScalar(size(cam, p, 7)); } }
  // what is under the pointer (the closest handle the ray meets)
  const ray = new THREE.Raycaster();
  function pick(ndc, cam) {
    ray.setFromCamera(ndc, cam);
    const hits = ray.intersectObjects(group.children, true).filter(h => h.object.userData.h && h.object.visible && visibleUp(h.object));
    if (!hits.length) return null;
    const pri = h => ({ ring: 0, ik: 1, pole: 1, joint: 2, turn: 2, move: 3 })[h.object.userData.h.kind] ?? 4; // (the gizmo's rings first: they are what a drag over the chosen joint means)
    hits.sort((a, b) => pri(a) - pri(b) || a.distance - b.distance);
    return { ...hits[0].object.userData.h, point: hits[0].point };
  }
  const visibleUp = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  return {
    scene, setChar, setJoint, frame, pick, setLook,
    get gizmo() { return giz; },
    hot(a) { axisHot = a; },
    set visible(v) { group.visible = v; }, get visible() { return group.visible; },
  };
}
