// The wooden champion sign beside the swing tree. The face is a canvas texture, redrawn only when the words change.
import * as THREE from 'three';
import { GEO } from './batch.js';
import { toon } from './toon.js';
import { terrainHeight } from './terrain.js';
import { hillXZ } from './swing-hill.js';

const W = 640, H = 368;

export function createSign(scene, colliders) {
  // stands on the hill's top behind the swing, on the trunk's side of where the park trail comes up, turned to face people
  // arriving along it: clear of the tire's arc (3.6 m to its side), of the pushers behind it and of the trails
  const { x, z } = hillXZ(-4.5, -3.6);
  const y = terrainHeight(x, z);
  const yaw = Math.atan2(-58.5 - x, 5 - z);
  const g = new THREE.Group();
  g.position.set(x, y, z); g.rotation.y = yaw;

  const wood = toon('#b98a52'), dark = toon('#7a532f'), light = toon('#d4a96a'), roof = toon('#8f4a35');
  const box = (m, sx, sy, sz, px, py, pz, rz = 0) => { const b = new THREE.Mesh(GEO.box, m); b.scale.set(sx, sy, sz); b.position.set(px, py, pz); b.rotation.z = rz; g.add(b); return b; };
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(GEO.cyl8, dark); post.scale.set(0.075, 2.05, 0.075); post.position.set(s * 0.82, 1.02, -0.02); g.add(post);
    const cap = new THREE.Mesh(GEO.sphere, dark); cap.scale.setScalar(0.1); cap.position.set(s * 0.82, 2.08, -0.02); g.add(cap);
  }
  box(dark, 1.86, 1.1, 0.09, 0, 1.5, 0);          // frame
  box(wood, 1.7, 0.94, 0.11, 0, 1.5, 0.01);       // board
  for (const dy of [-0.3, 0, 0.3]) box(light, 1.7, 0.012, 0.115, 0, 1.5 + dy, 0.012); // plank seams
  // a little shingle roof so the sign looks loved
  box(roof, 1.16, 0.06, 0.5, -0.54, 2.22, 0.02, 0.34);   // each slab rises toward the ridge: a gable, not a valley
  box(roof, 1.16, 0.06, 0.5, 0.54, 2.22, 0.02, -0.34);
  box(dark, 0.09, 0.09, 0.5, 0, 2.36, 0.02);
  // a small "new record" flag pole with a ribbon
  const pole = new THREE.Mesh(GEO.cyl6, dark); pole.scale.set(0.02, 0.7, 0.02); pole.position.set(0.95, 2.35, 0); g.add(pole);
  const flag = new THREE.Mesh(GEO.box, toon('#ff6fa8')); flag.scale.set(0.3, 0.16, 0.015); flag.position.set(1.1, 2.6, 0); g.add(flag);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 0.9), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.set(0, 1.5, 0.072);
  g.add(face);

  g.traverse(m => { if (m.isMesh) { m.castShadow = m !== face; m.receiveShadow = false; } });
  scene.add(g);
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  for (const s of [-1, 1]) colliders.push({ type: 'circle', x: x + right.x * s * 0.82, z: z + right.z * s * 0.82, r: 0.14 });

  let data = null, shown = '', fontReady = false;
  const FONT = '"Fredoka", "Trebuchet MS", system-ui, sans-serif';
  function fit(text, max, size, weight = 700) {
    let s = size;
    c.font = `${weight} ${s}px ${FONT}`;
    while (c.measureText(text).width > max && s > 14) { s -= 2; c.font = `${weight} ${s}px ${FONT}`; }
    return s;
  }
  function draw() {
    const d = data || {};
    const key = JSON.stringify(d) + fontReady;
    if (key === shown) return;
    shown = key;
    // painted wood
    c.fillStyle = '#c89a5e'; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(122, 83, 47, 0.22)';
    for (const y of [92, 184, 276]) c.fillRect(0, y, W, 4);
    c.strokeStyle = '#7a532f'; c.lineWidth = 12; c.strokeRect(6, 6, W - 12, H - 12);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const ink = '#3d2614', red = '#b8433c';
    c.fillStyle = red; c.font = `700 40px ${FONT}`;
    c.fillText('SWING CHAMPION', W / 2, 52);
    if (d.champ) {
      c.fillStyle = ink;
      const s = fit(d.champ.name, W - 90, 66); c.font = `700 ${s}px ${FONT}`;
      c.fillText(d.champ.name, W / 2, 128);
      c.fillStyle = red; c.font = `700 62px ${FONT}`;
      c.fillText(d.champ.h.toFixed(1) + ' m high', W / 2, 200);
    } else {
      c.fillStyle = ink; c.font = `700 44px ${FONT}`;
      c.fillText('Nobody yet!', W / 2, 130);
      c.fillStyle = red; c.font = `700 34px ${FONT}`;
      c.fillText('Hop on and swing high', W / 2, 190);
    }
    c.fillStyle = 'rgba(61, 38, 20, 0.35)'; c.fillRect(70, 234, W - 140, 3);
    c.fillStyle = ink;
    const fl = d.fly ? `Longest flight: ${d.fly.name}, ${d.fly.d.toFixed(0)} m` : 'Longest flight: none yet';
    const s2 = fit(fl, W - 70, 32); c.font = `700 ${s2}px ${FONT}`;
    c.fillText(fl, W / 2, 268);
    const mine = d.mine && (d.mine.best > 0 || d.mine.flight > 0)
      ? `You: ${d.mine.best.toFixed(1)} m high, ${d.mine.flight.toFixed(0)} m flight` : 'You: no swings yet';
    c.fillStyle = '#5b3a1e';
    const s3 = fit(mine, W - 70, 28); c.font = `700 ${s3}px ${FONT}`;
    c.fillText(mine, W / 2, 322);
    tex.needsUpdate = true;
  }
  draw();
  if (document.fonts?.load) document.fonts.load('700 40px Fredoka').then(() => { fontReady = true; draw(); }).catch(() => {});

  return {
    group: g, x, z, yaw,
    update(next) { data = next; draw(); },
    flagWave(t) { flag.rotation.y = Math.sin(t * 3) * 0.35; flag.position.x = 1.1 + Math.abs(Math.sin(t * 3)) * -0.02; },
  };
}
