// Static geometry batching: many little boxes and cones share one draw call per
// material. Keeps the Surface Pro's GPU happy with a whole neighborhood on screen.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { toon } from './toon.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

// One shared material for every colour-string piece of a `vertexColors` batcher (see below).
const VC_MAT = toon('#ffffff', { vertexColors: true });
const _c = new THREE.Color();

export class Batcher {
  // vertexColors: pieces added with a colour STRING keep their colour in a vertex attribute and share one material, so the
  // whole batch is one draw call however many colours it uses (shadow, colour and normal passes each draw it).
  // Pieces added with a Material object (glow, emissive glass, flat) still group by it.
  // material: (crib-setpiece) a vertex-colour batch may name its own material for the colour-string pieces instead of the shared
  // one: a Blender set piece's baked sheet (vertexColors on, the code-built pieces' zero uvs at its white corner), so the model and
  // the pieces built round it stay one draw call.
  constructor({ castShadow = true, receiveShadow = true, vertexColors = false, material = null } = {}) {
    this.groups = new Map(); // material -> geometries[]
    this.castShadow = castShadow;
    this.receiveShadow = receiveShadow;
    this.vertexColors = vertexColors;
    this.material = material;
  }

  // Add a geometry with a transform. mat is a Material or a colour string (toon).
  // Rotation order is YXZ: tilt (rz, then rx) happens first, then the yaw (ry) turns it.
  add(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, matrix = null } = {}) {
    const bake = this.vertexColors && typeof mat === 'string';
    const material = bake ? (this.material || VC_MAT) : typeof mat === 'string' ? toon(mat) : mat;
    const own = bake && !!geo.attributes.color;   // (props-vehicles: a geometry with baked vertex colours, a Blender model's, is tinted by the colour, not painted over)
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && !(name === 'color' && (own || material.vertexColors))) g.deleteAttribute(name);
    }
    // (texture-sweep) in a batch with its own baked sheet, a code-built piece's uvs are zeroed so it samples the sheet's white
    // corner texel (constant uvs: always mip 0): GEO's primitives carry 0..1 uvs of their own, which laid the whole sheet over
    // every rag rug, box fan and crate in the Tool Crib. The set piece's own geometry (`userData.sheet`) keeps its layout.
    if (!g.attributes.uv || (bake && this.material && !geo.userData.sheet)) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (bake) {
      _c.set(mat);
      const n = g.attributes.position.count, col = new Float32Array(n * 3), a = own ? g.attributes.color : null;
      if (a) for (let i = 0; i < n; i++) { col[i * 3] = _c.r * a.getX(i); col[i * 3 + 1] = _c.g * a.getY(i); col[i * 3 + 2] = _c.b * a.getZ(i); }
      else for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    if (matrix) g.applyMatrix4(matrix);
    else {
      _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _s.set(sx, sy, sz); _p.set(x, y, z);
      g.applyMatrix4(_m.compose(_p, _q, _s));
    }
    if (!this.groups.has(material)) this.groups.set(material, []);
    this.groups.get(material).push(g);
    if (globalThis.__propAudit) { g.computeBoundingBox(); (this._audit || (this._audit = [])).push(g.boundingBox.clone()); } // for the tests' prop sweep
    return this;
  }

  // Axis-aligned box from min/max corners - handy for walls laid out in metres.
  boxMinMax(minX, minY, minZ, maxX, maxY, maxZ, mat, ry = 0) {
    const geo = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
    return this.add(geo, mat, { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2, ry });
  }

  build(parent, name = 'batch') {
    const out = [];
    for (const [material, geos] of this.groups) {
      if (!geos.length) continue;
      const merged = mergeGeometries(geos, false);
      geos.forEach(g => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = this.castShadow;
      mesh.receiveShadow = this.receiveShadow;
      mesh.name = name;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      out.push(mesh);
    }
    if (this._audit) { globalThis.__propAudit.push({ name, parent, boxes: this._audit }); this._audit = null; }
    this.groups.clear();
    return out;
  }
}

// Shared unit geometries (scaled per use).
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cyl12: new THREE.CylinderGeometry(1, 1, 1, 12),
  cone6: new THREE.ConeGeometry(1, 1, 6),
  cone8: new THREE.ConeGeometry(1, 1, 8),
  ico1: new THREE.IcosahedronGeometry(1, 1),
  ico0: new THREE.IcosahedronGeometry(1, 0),
  sphere: new THREE.SphereGeometry(1, 12, 8),
  dodec: new THREE.DodecahedronGeometry(1, 0),
};
