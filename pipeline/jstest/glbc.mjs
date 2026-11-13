// A skinned .glb character (meshy-belinda, 2026-11-11): one skinned mesh, its bones and its clips, read straight from the file
// with no loader dependency (no GLTFLoader, no npm). The bones carry the MPFB game-rig names (root, pelvis, spine_01-03, neck_01,
// head, clavicle/upperarm/lowerarm/hand, thigh/calf/foot/ball), so the Pose Editor's SkinnedPosable poses it like the baked ones.
//
// loadGlbCharacter(url) -> Promise<data | null> (cached per url)
// data.make() -> { root, skeleton, mesh, clips: { name: AnimationClip } }: a fresh copy (its own bones), geometry and
// materials shared, so the same character can stand in a scene more than once.
import * as THREE from 'three';

const cache = new Map();
export function loadGlbCharacter(url) {
  if (!cache.has(url)) cache.set(url, fetch(url).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => (b ? parseGlb(b) : null)).catch(() => null));
  return cache.get(url);
}

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export async function parseGlb(ab) {
  const dv = new DataView(ab);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  let off = 12, json = null, bin = null;
  while (off < ab.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true), s = off + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, s, len)));
    else if (type === 0x004e4942) bin = ab.slice(s, s + len);
    off = s + len;
  }
  const acc = (i, float = false) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], T = COMP[a.componentType], n = SIZE[a.type];
    const el = n * T.BYTES_PER_ELEMENT, stride = v.byteStride || el, base = (v.byteOffset || 0) + (a.byteOffset || 0);
    let arr;
    if (stride === el) arr = new T(bin.slice(base, base + a.count * el));
    else { // interleaved: copy out element by element
      arr = new T(a.count * n);
      const src = new DataView(bin), get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
      for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) arr[k * n + c] = src[get](base + k * stride + c * T.BYTES_PER_ELEMENT, true);
    }
    if (float && !(arr instanceof Float32Array)) arr = Float32Array.from(arr, x => (a.normalized ? x / NORM[a.componentType] : x));
    return { arr, n };
  };
  const view = i => { const v = json.bufferViews[i]; return new Uint8Array(bin, v.byteOffset || 0, v.byteLength); };

  // ---- textures (decoded once; skipped where the platform cannot decode images)
  const tex = new Map();
  const texture = async (ti, srgb) => {
    if (ti === undefined || typeof createImageBitmap === 'undefined') return null;
    const key = ti + (srgb ? 's' : 'l');
    if (tex.has(key)) return tex.get(key);
    const img = json.images[json.textures[ti].source];
    const bmp = await createImageBitmap(new Blob([view(img.bufferView)], { type: img.mimeType }), { imageOrientation: 'none' });
    const t = new THREE.Texture(bmp);
    t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true;
    tex.set(key, t);
    return t;
  };
  const materials = await Promise.all((json.materials || []).map(async m => {
    const pbr = m.pbrMetallicRoughness || {};
    const mat = new THREE.MeshStandardMaterial({ name: m.name || '', metalness: pbr.metallicFactor ?? 0, roughness: pbr.roughnessFactor ?? 0.8, side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide });
    if (pbr.baseColorFactor) mat.color.setRGB(...pbr.baseColorFactor.slice(0, 3));
    mat.map = await texture(pbr.baseColorTexture?.index, true);
    mat.normalMap = await texture(m.normalTexture?.index, false);
    return mat;
  }));

  // ---- the skinned mesh's geometry (shared by every copy)
  const meshIdx = json.nodes.findIndex(n => n.mesh !== undefined && n.skin !== undefined);
  const mnode = json.nodes[meshIdx], prim = json.meshes[mnode.mesh].primitives[0], at = prim.attributes;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(acc(at.POSITION).arr, 3));
  if (at.NORMAL !== undefined) geo.setAttribute('normal', new THREE.BufferAttribute(acc(at.NORMAL).arr, 3));
  if (at.TEXCOORD_0 !== undefined) geo.setAttribute('uv', new THREE.BufferAttribute(acc(at.TEXCOORD_0, true).arr, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(Uint16Array.from(acc(at.JOINTS_0).arr), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(acc(at.WEIGHTS_0, true).arr, 4));
  geo.setIndex(new THREE.BufferAttribute(acc(prim.indices).arr, 1));
  geo.computeBoundingSphere();
  const material = materials[prim.material ?? 0] || new THREE.MeshStandardMaterial();
  const skin = json.skins[mnode.skin], ibm = acc(skin.inverseBindMatrices).arr;
  const scene = json.scenes[json.scene || 0];

  // ---- the clips, by node name (three binds tracks by the objects' names)
  const clips = (json.animations || []).map(an => {
    const tracks = [];
    for (const ch of an.channels) {
      const s = an.samplers[ch.sampler], name = json.nodes[ch.target.node].name, times = acc(s.input).arr, vals = acc(s.output, true).arr;
      const interp = s.interpolation === 'STEP' ? THREE.InterpolateDiscrete : THREE.InterpolateLinear;
      if (ch.target.path === 'rotation') tracks.push(new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, vals, interp));
      else if (ch.target.path === 'translation') tracks.push(new THREE.VectorKeyframeTrack(name + '.position', times, vals, interp));
      else if (ch.target.path === 'scale') tracks.push(new THREE.VectorKeyframeTrack(name + '.scale', times, vals, interp));
    }
    return new THREE.AnimationClip(an.name, -1, tracks);
  });

  function make() {
    const joints = new Set(skin.joints), objs = [];
    json.nodes.forEach((n, i) => {
      const o = i === meshIdx ? new THREE.SkinnedMesh(geo, material) : joints.has(i) ? new THREE.Bone() : new THREE.Group();
      o.name = n.name || '';
      if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
      if (n.translation) o.position.fromArray(n.translation);
      if (n.rotation) o.quaternion.fromArray(n.rotation);
      if (n.scale) o.scale.fromArray(n.scale);
      objs.push(o);
    });
    json.nodes.forEach((n, i) => (n.children || []).forEach(c => objs[i].add(objs[c])));
    const root = new THREE.Group();
    root.name = 'glb-character';
    for (const i of scene.nodes) root.add(objs[i]);
    root.updateMatrixWorld(true);
    const bones = skin.joints.map(i => objs[i]);
    const inv = bones.map((_, k) => new THREE.Matrix4().fromArray(ibm, k * 16));
    const mesh = objs[meshIdx];
    mesh.frustumCulled = false; // (a posed limb can leave the rest pose's bounds)
    const skeleton = new THREE.Skeleton(bones, inv);
    mesh.bind(skeleton, mesh.matrixWorld);
    return { root, skeleton, mesh, clips: Object.fromEntries(clips.map(c => [c.name, c])) };
  }
  return { make, clips: clips.map(c => c.name) };
}
