import * as THREE from 'three';
import { parseGlb } from './glbc.mjs';
import fs from 'node:fs';
const buf = fs.readFileSync(process.argv[2]); const d = await parseGlb(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const m = d.make(), U = m.root.getObjectByName('lowerarm_l'), q0 = U.quaternion.clone();
const mx = new THREE.AnimationMixer(m.root); mx.clipAction(m.clips.wave).play(); mx.setTime(1.5);
const q1 = U.quaternion.clone(); mx.stopAllAction(); const q2 = U.quaternion.clone();
console.log('posed by setTime:', !q1.equals(q0), '| after stopAllAction still posed:', q2.equals(q1), '| reverted to rest:', q2.equals(q0));
