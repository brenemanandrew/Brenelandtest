import * as THREE from 'three';
import { parseGlb } from './glbc.mjs';
import fs from 'node:fs';
const buf = fs.readFileSync(process.argv[2]); const d = await parseGlb(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const a = d.make(), b = d.make(); const q0 = b.root.getObjectByName('head').quaternion.clone();
a.root.getObjectByName('head').rotateY(1);
console.log('copies independent:', b.root.getObjectByName('head').quaternion.equals(q0) && !a.root.getObjectByName('head').quaternion.equals(q0), 'shared geometry:', a.mesh.geometry === b.mesh.geometry);
// the Pose Editor's two-bone IK on her real arm (the same solver logic as posable.js twoBone, inlined minimal: reach check)
const U = a.root.getObjectByName('upperarm_r'), M = a.root.getObjectByName('lowerarm_r'), E = a.root.getObjectByName('hand_r');
a.root.updateMatrixWorld(true);
const l1 = U.getWorldPosition(new THREE.Vector3()).distanceTo(M.getWorldPosition(new THREE.Vector3())), l2 = M.getWorldPosition(new THREE.Vector3()).distanceTo(E.getWorldPosition(new THREE.Vector3()));
console.log('arm segments (m):', l1.toFixed(3), l2.toFixed(3));
