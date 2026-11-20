// Mixamo FBX -> small JSON clips already retargeted to VRM humanoid bone names (rotations for the normalized bones).
import fs from 'node:fs'; import path from 'node:path';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
const [src, out] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const MAP = { Hips: 'hips', Spine: 'spine', Spine1: 'chest', Spine2: 'upperChest', Neck: 'neck', Head: 'head', LeftShoulder: 'leftShoulder', LeftArm: 'leftUpperArm', LeftForeArm: 'leftLowerArm', LeftHand: 'leftHand', RightShoulder: 'rightShoulder', RightArm: 'rightUpperArm', RightForeArm: 'rightLowerArm', RightHand: 'rightHand',
  LeftUpLeg: 'leftUpperLeg', LeftLeg: 'leftLowerLeg', LeftFoot: 'leftFoot', LeftToeBase: 'leftToes', RightUpLeg: 'rightUpperLeg', RightLeg: 'rightLowerLeg', RightFoot: 'rightFoot', RightToeBase: 'rightToes' };
for (const side of ['Left', 'Right']) for (const [m, v] of [['Thumb', 'Thumb'], ['Index', 'Index'], ['Middle', 'Middle'], ['Ring', 'Ring'], ['Pinky', 'Little']]) for (const [i, j] of [[1, v === 'Thumb' ? 'Metacarpal' : 'Proximal'], [2, v === 'Thumb' ? 'Proximal' : 'Intermediate'], [3, 'Distal']]) MAP[`${side}Hand${m}${i}`] = side.toLowerCase() + v + j;
const loader = new FBXLoader(), r = v => Math.round(v * 10000) / 10000;
for (const f of fs.readdirSync(src).filter(f => /\.fbx$/i.test(f))) {
  let asset; try { const b = fs.readFileSync(path.join(src, f)); asset = loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), ''); } catch (e) { console.log('FAIL', f, e.message); continue; }
  const clip = asset.animations.sort((a, b) => b.duration - a.duration)[0]; if (!clip || clip.duration < 0.01) { console.log('no motion:', f, asset.animations.length); continue; }
  asset.updateMatrixWorld(true);
  const hipsNode = asset.getObjectByName('mixamorigHips'); if (!hipsNode) { console.log('no mixamo rig:', f); continue; }
  const hipH = hipsNode.position.y, fps = 30, n = Math.max(1, Math.round(clip.duration * fps)) + 1, bones = {}; let hips = null;
  const q = new THREE.Quaternion(), restInv = new THREE.Quaternion(), parentRest = new THREE.Quaternion();
  for (const tr of clip.tracks) {
    const [node, prop] = tr.name.split('.'), vb = MAP[node.replace('mixamorig', '')]; if (!vb) continue;
    const it = tr.createInterpolant();
    if (prop === 'quaternion') {
      const obj = asset.getObjectByName(node); obj.getWorldQuaternion(restInv).invert(); obj.parent.getWorldQuaternion(parentRest);
      const arr = []; for (let i = 0; i < n; i++) { const v = it.evaluate(Math.min(clip.duration, i / fps)); q.set(v[0], v[1], v[2], v[3]).premultiply(parentRest).multiply(restInv); arr.push(r(q.x), r(q.y), r(q.z), r(q.w)); }
      bones[vb] = arr;
    } else if (prop === 'position' && vb === 'hips') { hips = []; for (let i = 0; i < n; i++) { const v = it.evaluate(Math.min(clip.duration, i / fps)); hips.push(r(v[0] / hipH), r(v[1] / hipH), r(v[2] / hipH)); } }
  }
  const name = f.replace(/\.fbx$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ name, dur: r(clip.duration), fps, n, bones, hips }));
  const travel = hips ? [hips.at(-3) - hips[0], hips.at(-1) - hips[2]].map(v => (v * hipH / 100).toFixed(2)) : '-';
  console.log(name.padEnd(34), 'dur', clip.duration.toFixed(2).padStart(6), 'bones', String(Object.keys(bones).length).padStart(3), 'travel x,z m', travel, 'hipH', hipH.toFixed(0));
}
