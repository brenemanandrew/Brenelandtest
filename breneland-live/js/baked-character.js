// A character that plays its own Blender animation (mpfb-in-game, 2026-11-10). Andrew: "don't change the animation for the
// characters. Let them inherit the animation that they're built for and interpret that in the game. I don't want to lose frames of
// animation on them, because I think this might be where I want to go with all the characters at some point in the future."
//
// What this is: one skinned mesh per character (assets/blender/scripts/mpfb_game/export_game.py: the MPFB preview build joined,
// decimated, with the mouth's expression keys and the hair's correctives as morph targets), its rig, and its clips sampled every
// frame at the rate they were made (24 fps, every bone, no key reduction), played by a three.js AnimationMixer. The town's procedural
// human.js motion never touches it. The game only picks the clip by state and crossfades (0.15-0.3 s, both clips keep playing through
// the blend, so no frame is cut). The walk's root motion is the clip's own: `walkSpeed` (m/s) is what the character was authored to
// cover, and whoever moves the root along a path at that speed gets feet that do not slide (the action's timeScale follows any
// difference). Secondary motion (skirts, hair, the bag) is BAKED INTO EACH CLIP: the preview's spring chains were stepped while the
// clip was made and their bones sampled like any other, with the pose-space corrective keys as morph tracks; a crossfade blends two
// settled states, which holds up (the alternative, the same springs run live, was not needed for the four).
//
// The face: the eyes are painted (face_paint.py's per-expression tiles on the character's own sheet); the iris is its own tile, slid
// by the yaw and pitch gaze.js computes (this class quacks like a Human for gaze.js: root, headC, attn, say, lookAt, watch, talkT), so
// she looks at whoever talks or passes. The mouth is the modelled lips, teeth and tongue, moved by the expression shape keys
// (morph targets 'smile', 'smirk', 'open', 'o', 'set', 'tongue'). The FACE LAYER plays the face clips (talk, blink, the expressions:
// per frame a face tile, the mouth keys and a nod) on top of whatever body clip runs, crossfading tiles and keys over 0.15 s.
//
//   const data = await loadBakedCharacter('belinda');       // /models/mpfb/belinda.json + .bin + .webp, cached and shared
//   const ch = new BakedCharacter(data, { name: 'mall-staff-belinda' });  scene.add(ch.root)
//   ch.play('walk'); ch.update(dt, now, speed); ch.say(1.5, whom); ch.expression('laugh', 2.5); ch.items({ R: true })
//   ch.setLod(far) / ch.far ... see update(): past FAR_ANIM the mixer stops, past FAR_HIDE she is hidden, like the townsfolk
//
// Test hooks: ch.mixer, ch.clips, ch.current (the body clip's name), ch.face (the layer's state), ch.lookInfo (gaze.js's lookInfo
// works on it), ch.meshes.
import * as THREE from 'three';
import { GRADIENT_3, LAYER_SOFT } from './toon.js';
import { GFX } from './gfx.js';
import { view, PERF } from './perf-flags.js';
import { touch as gazeTouch, targetOf, GAZE } from './gaze.js';
import { ATTN } from './human.js';

export const FAR_ANIM = 90, FAR_HIDE = 150, LOD_D = 28;   // m: like the town's people (mall-staff-model.js); LOD_D: the lighter mesh beyond (on every device)
export const FADE = { body: 0.22, start: 0.15, face: 0.15 };
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- loading
const CACHE = new Map();
let HD = null;
export function bakedCharactersOn() {
  if (!PERF.bakedCharacters) return false;
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  return q?.get('baked') !== 'off';   // (the kill switch: ?baked=off gives the code-built looks)
}
/** Fetch one character's json + bin once; null when it is not there (the caller keeps the code-built look). */
export function loadBakedCharacter(id) {
  if (CACHE.has(id)) return CACHE.get(id);
  const p = (async () => {
    if (!bakedCharactersOn()) return null;
    try {
      const r = await fetch(`/models/mpfb/${id}.json`);
      if (!r.ok) return null;
      const J = await r.json();
      const rb = await fetch(`/models/mpfb/${J.bin}`);
      if (!rb.ok) return null;
      const buf = await rb.arrayBuffer();
      if (!J.bones || !J.mesh || !J.clips) return null;
      return build(J, buf);
    } catch (e) { console.warn('baked character', id, 'did not load', e); return null; }
  })();
  CACHE.set(id, p);
  return p;
}
export const bakedHD = () => HD || (HD = (new URLSearchParams(location.search).get('mpfbhd') || 'full'));

function section(buf, s) {
  const T = { float32: Float32Array, uint8: Uint8Array, uint16: Uint16Array, uint32: Uint32Array, int16: Int16Array }[s.type];
  return new T(buf, s.off, s.n);
}
function geometry(buf, M, morphNames, bones) {
  const n = M.verts;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(section(buf, M.pos).slice(), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(section(buf, M.nor).slice(), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(section(buf, M.uv).slice(), 2));
  g.setAttribute('aFaceUv', new THREE.BufferAttribute(section(buf, M.fuv).slice(), 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from(section(buf, M.si)), 4));
  g.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(section(buf, M.sw).slice(), 4, true));
  // (mpfb-fidelity) the v8 ink line: each vertex's inverted-hull offset (its smooth normal times the part's ink width, 0.01 mm)
  if (M.ink) { const d = section(buf, M.ink), a = new Float32Array(d.length); for (let i = 0; i < d.length; i++) a[i] = d[i] / 100000; g.setAttribute('aInk', new THREE.BufferAttribute(a, 3)); }
  // morph targets: sparse deltas expanded (relative)
  g.morphTargetsRelative = true;
  const pos = [];
  g.morphTargetDictionary = {};
  for (const name of morphNames) {
    const m = M.morphs[name];
    const a = new Float32Array(n * 3);
    if (m) {
      const idx = section(buf, m.idx), d = section(buf, m.d);
      for (let i = 0; i < idx.length; i++) { const k = idx[i] * 3; a[k] = d[i * 3] / 10000; a[k + 1] = d[i * 3 + 1] / 10000; a[k + 2] = d[i * 3 + 2] / 10000; }
    }
    const at = new THREE.BufferAttribute(a, 3); at.name = name;
    pos.push(at);
  }
  if (pos.length) g.morphAttributes.position = pos;
  // one geometry per group (the base, the held things): the same vertex buffers (shared, uploaded once), their own index
  const share = () => { const h = new THREE.BufferGeometry(); for (const [k, a] of Object.entries(g.attributes)) h.setAttribute(k, a); h.morphAttributes = g.morphAttributes; h.morphTargetsRelative = true; h.morphTargetDictionary = g.morphTargetDictionary; return h; };
  const out = {};
  for (const [grp, s] of Object.entries(M.groups)) {
    const gg = grp === '' ? g : share();
    gg.setIndex(new THREE.BufferAttribute(section(buf, s).slice(), 1));
    gg.computeBoundingSphere(); gg.boundingSphere.radius += 0.5;   // (the clips swing the limbs off the rest pose)
    gg.computeBoundingBox();
    out[grp] = gg;
    // the ink hull's triangles (those with ink at a corner), on the same buffers
    const ih = M.inkGroups?.[grp];
    if (ih && g.attributes.aInk) { const h = share(); h.setIndex(new THREE.BufferAttribute(section(buf, ih).slice(), 1)); h.boundingSphere = gg.boundingSphere.clone(); h.boundingBox = gg.boundingBox.clone(); gg.userData.ink = h; }
  }
  return out;
}
function makeClips(J, buf) {
  const nb = J.bones.length, fps = J.fps, clips = {};
  for (const [name, C] of Object.entries(J.clips)) {
    const d = section(buf, C.sec), F = C.frames, loop = C.loop;
    const nT = loop ? F + 1 : F, times = new Float32Array(nT);
    for (let i = 0; i < nT; i++) times[i] = i / fps;
    const tracks = [];
    for (let b = 0; b < nb; b++) {
      const bn = J.bones[b].name, pv = new Float32Array(nT * 3), qv = new Float32Array(nT * 4);
      for (let i = 0; i < nT; i++) {
        const f = i % F, o = (f * nb + b) * 7;
        pv[i * 3] = d[o] / 1000; pv[i * 3 + 1] = d[o + 1] / 1000; pv[i * 3 + 2] = d[o + 2] / 1000;
        qv[i * 4] = d[o + 3] / 32767; qv[i * 4 + 1] = d[o + 4] / 32767; qv[i * 4 + 2] = d[o + 5] / 32767; qv[i * 4 + 3] = d[o + 6] / 32767;
      }
      tracks.push(new THREE.VectorKeyframeTrack(bn + '.position', times, pv), new THREE.QuaternionKeyframeTrack(bn + '.quaternion', times, qv));
    }
    if (C.morphs && J.clipMorphs?.length) {
      const m = section(buf, C.morphs), nm = J.clipMorphs.length;
      J.clipMorphs.forEach((mn, k) => {
        const v = new Float32Array(nT);
        for (let i = 0; i < nT; i++) v[i] = m[(i % F) * nm + k] / 1000;
        tracks.push(new THREE.NumberKeyframeTrack(`.morphTargetInfluences[${mn}]`, times, v));
      });
    }
    const clip = new THREE.AnimationClip(name, nT > 1 ? (nT - 1) / fps : 1 / fps, tracks);
    clips[name] = { clip, loop, speed: C.speed || 0, seat: C.seat, frames: F, switch: C.switch };   // (switch: the frame a one-shot swaps its mesh groups at, the DM's hood)
  }
  const faceClips = {};
  for (const [name, C] of Object.entries(J.faceClips || {})) {
    const d = section(buf, C.sec), w = J.faceRow.length, rows = [];
    for (let f = 0; f < C.frames; f++) { const r = []; for (let k = 0; k < w; k++) r.push(k === 0 ? d[f * w] : d[f * w + k] / 1000); rows.push(r); }
    faceClips[name] = { rows, loop: C.loop, frames: C.frames };
  }
  return { clips, faceClips };
}
function build(J, buf) {
  const geo = geometry(buf, J.mesh, J.morphs, J.bones), lod = geometry(buf, J.lod, J.morphs, J.bones);
  const { clips, faceClips } = makeClips(J, buf);
  return { J, geo, lod, clips, faceClips, id: J.id, cid: J.cid, tris: J.tris, lodTris: J.lodTris, walkSpeed: J.walkSpeed, floor: J.floor || 0, material: null };
}

// ---------------------------------------------------------------- the material: the sheet's palette, the painted face layered on the head
const UNI = J => {
  const g = J.face.grid, t = i => new THREE.Vector2((i % g) / g, 1 - (Math.floor(i / g) + 1) / g);
  return { uTile: { value: 1 / g }, uTileA: { value: t(0) }, uTileB: { value: t(0) }, uFaceK: { value: 0 }, uIris: { value: t(J.face.iris) },
    uMaskA: { value: t(6) }, uMaskChA: { value: new THREE.Vector4(1, 0, 0, 0) }, uMaskB: { value: t(6) }, uMaskChB: { value: new THREE.Vector4(1, 0, 0, 0) },
    uLook: { value: new THREE.Vector2(0, 0) }, uGlow: { value: 0 }, uGlowT: { value: J.face.glow ? t(J.face.glow[0]) : t(0) }, uGlowCh: { value: J.face.glow ? new THREE.Vector4(...[0, 1, 2, 3].map(i => (i === J.face.glow[1] ? 1 : 0))) : new THREE.Vector4() },
    uShadow: { value: 0 } };
};
const VERT_PARS = /* glsl */`attribute vec2 aFaceUv; varying vec2 vFaceUv;`;
const FRAG_PARS = /* glsl */`uniform float uTile, uFaceK, uGlow, uShadow; uniform vec2 uTileA, uTileB, uIris, uMaskA, uMaskB, uLook, uGlowT; uniform vec4 uMaskChA, uMaskChB, uGlowCh; varying vec2 vFaceUv; float bcGlow = 0.0;`;
const FRAG_MAP = /* glsl */`
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  if ( vFaceUv.x > 0.0005 ) {
    vec2 fu = clamp( vFaceUv, 0.004, 0.996 ) * uTile;
    vec4 fa = texture2D( map, uTileA + fu ), fb = texture2D( map, uTileB + fu );
    fa.rgb *= fa.a; fb.rgb *= fb.a;   // (premultiplied here, after the sRGB decode: premultiplied before it, the blush and the soft edges went dark)
    vec4 f = mix( fa, fb, uFaceK );
    vec2 iu = clamp( vFaceUv - uLook, 0.004, 0.996 ) * uTile;
    vec4 ir = texture2D( map, uIris + iu );
    ir.rgb *= ir.a;
    float m = mix( dot( texture2D( map, uMaskA + fu ), uMaskChA ), dot( texture2D( map, uMaskB + fu ), uMaskChB ), uFaceK );
    f = f * ( 1.0 - ir.a * m ) + ir * m;
    sampledDiffuseColor.rgb = sampledDiffuseColor.rgb * ( 1.0 - f.a ) + f.rgb;
    sampledDiffuseColor.rgb *= mix( 1.0, 0.32, uShadow );
    bcGlow = dot( texture2D( map, uGlowT + fu ), uGlowCh ) * uGlow;
  }
  diffuseColor *= sampledDiffuseColor;
`;
const TEX = new Map();
function sheetTexture(J) {
  const file = bakedHD() === 'half' ? J.sheet.half : J.sheet.full;
  let t = TEX.get(file);
  if (t) return t;
  t = new THREE.TextureLoader().load('/models/mpfb/' + file);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.premultiplyAlpha = false;   // (straight: the shader premultiplies after the sRGB decode; the export bleeds the painted colour out under the clear texels, so no dark fringes)
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  TEX.set(file, t);
  return t;
}
function material(data, U = UNI(data.J), side = THREE.FrontSide) {
  const J = data.J;
  const m = new THREE.MeshToonMaterial({ color: '#ffffff', map: sheetTexture(J), gradientMap: GRADIENT_3 });
  m.name = 'mpfb-' + J.id;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_PARS).replace('#include <uv_vertex>', '#include <uv_vertex>\n  vFaceUv = aFaceUv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_PARS).replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3( bcGlow );');
  };
  m.side = side;
  m.customProgramCacheKey = () => 'mpfb-baked';
  m.userData.uniforms = U;
  return m;
}

// ---------------------------------------------------------------- the ink line (mpfb-fidelity): v8's inverted hull
// The preview drew each part's outline as a flipped shell a few millimetres outside it (an 'ink' solidify modifier: 9 mm on the
// body, 7 on the hair, 3 on the lips; masked round the mouth). The game draws the same shell from the same mesh: a second skinned
// draw whose vertices move out along their skinned offset (aInk), back faces only, in the ink colour. It sits on the soft layer
// (the ink pass's normal render skips it) and is drawn only up close (the full mesh); far off the screen-space ink does it alone.
export const INK = { color: '#2a2233', on: true };
let HULL = null;
function hullMaterial() {
  if (HULL) return HULL;
  HULL = new THREE.MeshBasicMaterial({ color: INK.color, side: THREE.BackSide });
  // (pushed a little back in depth: where the hull runs just under another part, the jaw's over the neck, it no longer pokes
  // through it in a dotted line; the silhouettes, with nothing close behind them, are untouched)
  HULL.polygonOffset = true; HULL.polygonOffsetFactor = 2; HULL.polygonOffsetUnits = 8;
  HULL.name = 'mpfb-ink';
  HULL.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aInk;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n#ifdef USE_SKINNING\n  transformed += ( skinMatrix * vec4( aInk, 0.0 ) ).xyz;\n#else\n  transformed += aInk;\n#endif');
  };
  HULL.customProgramCacheKey = () => 'mpfb-ink';
  return HULL;
}
const inkWanted = () => INK.on && (typeof location === 'undefined' || new URLSearchParams(location.search).get('mpfbink') !== 'off');

// ---------------------------------------------------------------- the character
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _x = new THREE.Vector3(1, 0, 0), _y = new THREE.Vector3(0, 1, 0);
let seq = 0;

export class BakedCharacter {
  /** data: from loadBakedCharacter; opts: { name (the mesh's name, 'mall-staff-<id>'), tag (name tag height over the head, m) } */
  constructor(data, opts = {}) {
    this.data = data; const J = this.J = data.J;
    this.kind = 'human'; this.id = J.id; this.cid = J.cid;
    this.root = new THREE.Group(); this.root.name = opts.name || ('baked-' + J.id);
    this.root.userData.baked = this;
    this.params = {};
    this.phase = Math.random() * TAU;
    // everything hangs under `inner`, lifted so the shoes (a shell proud of the sole) stand on the ground the root is set to
    this.inner = new THREE.Group(); this.inner.name = 'baked-inner'; this.inner.position.y = -(data.floor || 0); this.root.add(this.inner);
    // the rig
    this.bones = []; this.byName = new Map();
    for (const b of J.bones) {
      const bone = new THREE.Bone(); bone.name = b.name;
      bone.position.set(b.pos[0], b.pos[1], b.pos[2]); bone.quaternion.set(b.quat[0], b.quat[1], b.quat[2], b.quat[3]);
      (b.parent >= 0 ? this.bones[b.parent] : this.inner).add(bone);
      this.bones.push(bone); this.byName.set(b.name, bone);
    }
    this.inner.position.y = 0; this.root.updateMatrixWorld(true);   // (the rest pose at the origin for the bone inverses; the lift after)
    this.skeleton = new THREE.Skeleton(this.bones);   // (bone inverses from the rest pose just set)
    this.mat = material(data); this.U = this.mat.userData.uniforms;
    // (mpfb-fidelity) the clothes, hair and held things both sides, as Blender drew them: the inside of a shirt's neck or sleeve,
    // of a skirt or the hood, culled, let the room behind show through it (the 'brown blocks' at Asha's collar in v265 were the shop
    // behind her, seen through her neckline as she lifted the tray). The face and the mouth stay one-sided (their insides never show).
    this.matBoth = material(data, this.U, THREE.DoubleSide);
    // the meshes: the base and each held-thing group, full and LOD, all on the one skeleton
    this.meshes = {}; this.lodMeshes = {};
    const name = opts.name || ('mpfb-' + J.id);
    const matOf = grp => (grp.startsWith('_') ? this.mat : this.matBoth);
    for (const [grp, g] of Object.entries(data.geo)) this.meshes[grp] = this.mesh(g, grp === '' ? name : grp.startsWith('_') ? 'mpfb' + grp : 'mpfb-item-' + grp, matOf(grp));
    for (const [grp, g] of Object.entries(data.lod)) this.lodMeshes[grp] = this.mesh(g, grp === '' ? name : grp.startsWith('_') ? 'mpfb' + grp : 'mpfb-item-' + grp, matOf(grp));
    this.main = this.meshes['']; this.lodMain = this.lodMeshes[''];
    // the ink hulls: one per group of the full mesh that has ink widths
    this.hulls = {}; this.ink = inkWanted();
    if (this.ink) for (const [grp, g] of Object.entries(data.geo)) if (g.userData.ink) {
      const h = this.mesh(g.userData.ink, 'mpfb-ink' + (grp || '-base'), hullMaterial());
      h.castShadow = false; h.layers.set(LAYER_SOFT); this.hulls[grp] = h;
    }
    this.inner.position.y = -(data.floor || 0);
    this.shown = {}; for (const grp of Object.keys(data.geo)) if (grp && !grp.startsWith('_')) this.shown[grp] = false;   // ('_face', '_mouth': always shown)
    // ('_face', '_mouth' stay on the outlined layer: taken off it, the normal pass saw the hair and the head's inside through the
    // face's hole and drew creases there; with the smooth-head normals exported the face has no creases of its own)
    this.lod = false; this.far = false; this.hidden = false;
    this.applyVisibility();
    // the mixer on the main mesh: bone tracks by name through the skeleton, morph tracks by name on the mesh
    this.mixer = new THREE.AnimationMixer(this.main);
    this.actions = {}; this.current = null; this.currentAction = null; this.after = null;
    this.mixer.addEventListener('finished', e => this.onFinished(e.action));
    // the head: where the eyes are, for gaze.js (headC's z is the face's forward); the name tag over the crown
    const head = this.byName.get('head') || this.bones[this.bones.length - 1];
    this.headBone = head; this.neckBone = this.byName.get('neck_01') || null;
    this.headC = new THREE.Object3D(); head.add(this.headC); this.head = this.headC;   // (dnd.js and the tests read h.head)
    _v.set(0, J.head.eye, -J.head.hcy); head.worldToLocal(this.headC.position.copy(_v)); // (the eye line, forward of the head's centre)
    // the rig's head and neck bones point their own way (MPFB's: the bone's Y is not the face's forward); headC is turned so that at
    // rest its frame is the character's (z forward, y up), and the look is added about the character's up and right axes as they lie
    // in each bone's own frame
    const qh = new THREE.Quaternion(), qn = new THREE.Quaternion();
    head.getWorldQuaternion(qh); this.headC.quaternion.copy(qh).invert();
    this.headUp = new THREE.Vector3(0, 1, 0).applyQuaternion(_q.copy(qh).invert()); this.headRight = new THREE.Vector3(1, 0, 0).applyQuaternion(_q);
    if (this.neckBone) { this.neckBone.getWorldQuaternion(qn); this.neckUp = new THREE.Vector3(0, 1, 0).applyQuaternion(_q.copy(qn).invert()); this.neckRight = new THREE.Vector3(1, 0, 0).applyQuaternion(_q); }
    // what the look added last frame and what it left in each bone: three's mixer skips a bone whose track value did not change
    // since the last frame, so the addition would pile up; when a bone still holds what we left, last frame's addition is taken off
    this.lookAdd = { head: new THREE.Quaternion(), neck: new THREE.Quaternion(), headLeft: new THREE.Quaternion(), neckLeft: new THREE.Quaternion(), on: false };
    this.tagAnchor = new THREE.Object3D(); head.add(this.tagAnchor);
    _v.set(0, J.height + 0.12, 0); head.worldToLocal(this.tagAnchor.position.copy(_v));
    this.root.userData.tagAnchor = this.tagAnchor;
    // the look (gaze.js): the same state and limits as a Human's attention
    this.attn = { on: false, w: 0, tgt: null, why: '', fresh: false, to: null, watch: null, watchUntil: 0, force: null, forceUntil: 0, talkUntil: 0, hy: 0, hx: 0, vhy: 0, vhx: 0, ey: 0, ex: 0, vey: 0, vex: 0, sy: 0, lag: 0, ny: 0, nx: 0, err: 0 };
    this.talkT = 0; this.voiceLevel = 0;
    this.gaze = { x: 0, y: 0, tx: 0, ty: 0, t: 0.5 + Math.random() * 2 };   // the idle wander of the eyes while nobody talks
    // the face layer
    this.mouth = J.mouthKeys.map(k => this.main.morphTargetDictionary[k] ?? -1);
    this.face = { clip: null, t: 0, rows: null, loop: false, until: 0, hold: null, tile: 0, tileB: 0, k: 1, keys: new Float32Array(J.mouthKeys.length), from: new Float32Array(J.mouthKeys.length), blend: 1, nod: 0, nodV: 0 };
    this.exprIndex = {}; J.exprs.forEach((e, i) => { this.exprIndex[e] = i; });
    this.blinkT = 1 + Math.random() * 3;
    this.setTile(0, 0, 1);
    this.play('idle', { fade: 0 });
    this.seq = ++seq;
  }
  mesh(g, name, mat = this.mat) {
    const m = new THREE.SkinnedMesh(g, mat);
    m.name = name; m.castShadow = true; m.receiveShadow = false; m.userData.noMerge = true; m.frustumCulled = true;
    m.bind(this.skeleton, new THREE.Matrix4());
    // the bounds in the root's own frame (three would skin the rest pose through the bones' world matrices, then move it by the
    // mesh's world matrix again: a sphere twice as far out, and the mesh culled); the clips swing the limbs, so some room
    m.boundingSphere = g.boundingSphere.clone();
    m.boundingBox = g.boundingBox.clone().expandByScalar(0.45);   // (shadows.js measures its units by Box3.setFromObject, which would skin the box once and keep it)
    if (!m.morphTargetInfluences) { m.morphTargetInfluences = new Array(this.J.morphs.length).fill(0); m.morphTargetDictionary = {}; this.J.morphs.forEach((k, i) => { m.morphTargetDictionary[k] = i; }); }
    this.inner.add(m);
    return m;
  }
  applyVisibility() {
    const show = !this.hidden && !this.far;
    for (const [grp, m] of Object.entries(this.meshes)) m.visible = show && !this.lod && (grp === '' || grp.startsWith('_') || this.shown[grp]);
    for (const [grp, m] of Object.entries(this.lodMeshes)) m.visible = show && this.lod && (grp === '' || grp.startsWith('_') || this.shown[grp]);
    for (const [grp, m] of Object.entries(this.hulls || {})) m.visible = this.meshes[grp].visible;
  }
  /** show a held thing (its mesh group: 'bag', 'tray', 'books') */
  items(set) {
    for (const grp of Object.keys(this.shown)) this.shown[grp] = !!set?.[grp];
    this.applyVisibility();
  }
  has(name) { return !!this.data.clips[name]; }
  action(name) {
    let a = this.actions[name];
    if (a) return a;
    const c = this.data.clips[name];
    if (!c) return null;
    a = this.mixer.clipAction(c.clip);
    if (c.loop) a.setLoop(THREE.LoopRepeat, Infinity); else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    this.actions[name] = a;
    return a;
  }
  /** play a body clip by name: a loop keeps going; a one-shot runs then `then` (default: back to the loop it came from).
   *  opts: { fade (s), timeScale, then, force (restart even if it is the current clip) } */
  play(name, opts = {}) {
    const a = this.action(name);
    if (!a) return false;
    if (this.current === name && !opts.force) { if (opts.timeScale !== undefined) a.timeScale = opts.timeScale; return true; }
    const fade = opts.fade ?? FADE.body, old = this.currentAction;
    a.enabled = true; a.reset(); a.timeScale = opts.timeScale ?? 1; a.setEffectiveWeight(1);
    if (old && old !== a && fade > 0) { old.enabled = true; a.crossFadeFrom(old, fade, false); } else if (old && old !== a) old.stop();
    a.play();
    this.after = this.data.clips[name].loop ? null : (opts.then || (this.current && this.data.clips[this.current]?.loop ? this.current : 'idle'));
    this.current = name; this.currentAction = a;
    return true;
  }
  onFinished(action) {
    if (action !== this.currentAction || !this.after) return;
    const next = this.after; this.after = null;
    this.play(next, { fade: FADE.start });
  }
  // ---- the face layer
  setTile(a, b, k) {
    const J = this.J, g = J.face.grid, t = (i, v) => v.set((i % g) / g, 1 - (Math.floor(i / g) + 1) / g);
    const ea = J.exprs[a], eb = J.exprs[b], ma = J.face.masks[ea], mb = J.face.masks[eb];
    t(J.face.faces[ea], this.U.uTileA.value); t(J.face.faces[eb], this.U.uTileB.value);
    t(ma[0], this.U.uMaskA.value); this.U.uMaskChA.value.set(ma[1] === 0 ? 1 : 0, ma[1] === 1 ? 1 : 0, ma[1] === 2 ? 1 : 0, ma[1] === 3 ? 1 : 0);
    t(mb[0], this.U.uMaskB.value); this.U.uMaskChB.value.set(mb[1] === 0 ? 1 : 0, mb[1] === 1 ? 1 : 0, mb[1] === 2 ? 1 : 0, mb[1] === 3 ? 1 : 0);
    this.U.uFaceK.value = k;
  }
  /** play a face clip (talk, blink, expr_<name>) for `secs` (a loop) or once (held on its last frame until released) */
  playFace(name, secs = 0) {
    const fc = this.data.faceClips[name];
    if (!fc) return false;
    const F = this.face;
    if (F.clip !== name) { F.from.set(F.keys); F.blend = 0; F.tileB = F.tile; }
    F.clip = name; F.rows = fc.rows; F.loop = fc.loop; F.t = 0; F.until = secs > 0 ? secs : (fc.loop ? 0 : fc.frames / this.J.fps);
    return true;
  }
  /** an expression ('laugh', 'surprised', 'wink'...: the character's own three) held for secs */
  expression(name, secs = 2.5) { return this.playFace('expr_' + name, secs); }
  say(secs = 1.5, to = undefined) { this.talkT = Math.max(this.talkT, secs); if (to !== undefined) this.attn.to = to; this.playFace('talk', Math.max(this.talkT, secs)); }
  lookAt(target, secs = 1) { const A = this.attn; A.force = target; A.forceUntil = GAZE.frame + secs * 30; }
  watch(target, secs = 1) { const A = this.attn; A.watch = target; A.watchUntil = GAZE.frame + secs * 30; }
  stepFace(dt) {
    const F = this.face, J = this.J, fps = J.fps, nk = J.mouthKeys.length;
    this.talkT = Math.max(0, this.talkT - dt);
    // blinks on their own clock (the preview's: every 2-5 s, now and then a double)
    this.blinkT -= dt;
    if (this.blinkT <= 0 && !F.clip) { this.blinkT = Math.random() < 0.18 ? 0.3 : 1.8 + Math.random() * 3.6; this.playFace('blink'); }
    else if (this.blinkT <= 0) this.blinkT = 0.4;
    let tile = this.exprIndex.neutral || 0, nod = 0;
    const target = new Float32Array(nk);
    const neutral = J.exprKeys[J.exprs[0]];
    J.mouthKeys.forEach((k, i) => { target[i] = neutral[k] || 0; });
    if (F.clip && F.rows) {
      F.t += dt;
      let f = Math.floor(F.t * fps);
      const n = F.rows.length;
      if (F.loop) f = ((f % n) + n) % n; else f = Math.min(n - 1, f);
      const row = F.rows[f];
      tile = row[0];
      for (let i = 0; i < nk; i++) target[i] = row[1 + i];
      nod = row[1 + nk] || 0;
      const done = F.until > 0 ? F.t >= F.until : (!F.loop && F.t * fps >= n);
      if (done && !(F.clip === 'talk' && this.talkT > 0)) { F.clip = null; F.rows = null; F.from.set(F.keys); F.blend = 0; F.tileB = F.tile; }
    }
    if (tile !== F.tile) { F.tileB = F.tile; F.tile = tile; F.k = 0; }
    F.k = Math.min(1, F.k + dt / FADE.face);
    F.blend = Math.min(1, F.blend + dt / FADE.face);
    const b = F.blend;
    for (let i = 0; i < nk; i++) {
      F.keys[i] = lerp(F.from[i], target[i], b);
      const mi = this.mouth[i];
      if (mi >= 0) { this.main.morphTargetInfluences[mi] = F.keys[i]; if (this.lodMain) this.lodMain.morphTargetInfluences[mi] = F.keys[i]; }
    }
    this.setTile(F.tile, F.tileB, 1 - F.k);
    F.nod += (nod - F.nod) * Math.min(1, dt * 30);
  }
  // ---- the look: the target in the head's frame, the eyes first and furthest, the head after (Human.stepAttention's numbers)
  stepAttention(dt) {
    const A = this.attn, on = A.on, e = on ? targetOf(A.tgt) : null, LA = this.lookAdd;
    if (LA.on) {
      if (this.headBone.quaternion.equals(LA.headLeft)) this.headBone.quaternion.multiply(_q.copy(LA.head).invert());
      if (this.neckBone && this.neckBone.quaternion.equals(LA.neckLeft)) this.neckBone.quaternion.multiply(_q.copy(LA.neck).invert());
      LA.on = false;
    }
    let ny = 0, nx = 0;
    if (e) {
      // the head's frame as the clip left it this frame (before the look is added): headC's, z forward, y up
      this.headC.updateWorldMatrix(true, false);
      _m.copy(this.headC.matrixWorld).invert();
      const pt = e.length === 16;
      _v.set(pt ? e[12] : e.x, pt ? e[13] : e.y, pt ? e[14] : e.z).applyMatrix4(_m);
      const hd = Math.hypot(_v.x, _v.z);
      if (hd > 0.05) { ny = Math.atan2(_v.x, _v.z); nx = -Math.atan2(_v.y, hd); }
    }
    if (A.fresh || (on && Math.abs(ny - A.ny) > 0.5)) A.lag = ATTN.lag;
    A.fresh = false; A.ny = ny; A.nx = nx;
    A.w = on ? Math.min(1, A.w + dt / 0.35) : Math.max(0, A.w - dt / 0.6);
    const hyT = on ? clamp(ny - clamp(ny * 0.12, -0.1, 0.1), -ATTN.headYaw, ATTN.headYaw) : 0;
    const hxT = on ? clamp(nx, -ATTN.headUp, ATTN.headDown) : 0;
    if (A.lag > 0) A.lag -= dt;
    else { spring(A, 'hy', 'vhy', hyT, ATTN.headK, ATTN.headV, dt); spring(A, 'hx', 'vhx', hxT, ATTN.headK, ATTN.headV, dt); }
    const eyT = on ? clamp(ny - A.hy, -ATTN.eyeYaw, ATTN.eyeYaw) : 0, exT = on ? clamp(A.hx - nx, -ATTN.eyePitch, ATTN.eyePitch) : 0;
    spring(A, 'ey', 'vey', eyT, ATTN.eyeK, ATTN.eyeV, dt); spring(A, 'ex', 'vex', exT, ATTN.eyeK, ATTN.eyeV, dt);
    A.err = on ? Math.abs(ny - A.hy - A.ey) : 0;
    // the eyes wander a little on their own while nobody has them (the preview's glances), else they take the look's share
    const G = this.gaze;
    G.t -= dt;
    if (G.t <= 0) { G.t = 1.5 + Math.random() * 3; G.tx = (Math.random() - 0.5) * 0.5; G.ty = (Math.random() - 0.5) * 0.3; if (Math.random() < 0.4) { G.tx = 0; G.ty = 0; } }
    G.x += (G.tx - G.x) * Math.min(1, dt * 12); G.y += (G.ty - G.y) * Math.min(1, dt * 12);
    const w = A.w, ey = lerp(G.x, A.ey, w), ex = lerp(G.y, A.ex, w);
    // the painted iris slides as the preview's did (roster_v6 set_look: the full look at 40 deg yaw, 25 deg pitch)
    const yaw = clamp(ey * 180 / Math.PI / 40, -1, 1), pitch = clamp(ex * 180 / Math.PI / 25, -1, 1);
    this.U.uLook.value.set(yaw * 0.24 * 0.22 / 1.2, pitch * 0.155 * 0.25 / 1.2);
    // the head and the neck take the turn on top of the clip's pose (40 / 60, as human.js splits it); a nod from the face layer too
    const hy = A.hy * w, hx = A.hx * w + this.face.nod * Math.PI / 180;
    if (Math.abs(hy) > 1e-4 || Math.abs(hx) > 1e-4) {
      if (this.neckBone) { _q.setFromAxisAngle(this.neckUp, hy * 0.4); _q2.setFromAxisAngle(this.neckRight, hx * 0.4); LA.neck.copy(_q).multiply(_q2); this.neckBone.quaternion.multiply(LA.neck); LA.neckLeft.copy(this.neckBone.quaternion); }
      _q.setFromAxisAngle(this.headUp, hy * (this.neckBone ? 0.6 : 1)); _q2.setFromAxisAngle(this.headRight, hx * (this.neckBone ? 0.6 : 1));
      LA.head.copy(_q).multiply(_q2); this.headBone.quaternion.multiply(LA.head); LA.headLeft.copy(this.headBone.quaternion);
      LA.on = true;
    }
  }
  /** once a frame: speed (m/s along the root's path, 0 standing) sets the walk's timeScale so the feet keep up with the ground */
  update(dt, now, speed = 0) {
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.05);
    const c = view.camera, p = this.root.position;
    const d = c ? Math.abs(c.position.x - p.x) + Math.abs(c.position.z - p.z) : 0;
    const far = d > FAR_HIDE, lod = d > LOD_D;   // (phones too draw the full mesh up close: v262's phones always drew the lighter one, faceted, the hands and caps lost)
    if (far !== this.far || lod !== this.lod) { this.far = far; this.lod = lod; this.applyVisibility(); }
    if (d > FAR_ANIM) return;
    if (this.current === 'walk' && this.data.walkSpeed > 0 && speed > 0) this.currentAction.timeScale = clamp(speed / this.data.walkSpeed, 0.5, 2);
    this.mixer.update(dt);
    gazeTouch(this);
    this.stepFace(dt);
    this.stepAttention(dt);
    // the held things and the LOD mesh share the main mesh's morphs (the mixer writes only the main one's)
    const inf = this.main.morphTargetInfluences;
    for (const m of this.lod ? Object.values(this.lodMeshes) : Object.values(this.meshes)) if (m !== this.main && m.visible) for (let i = 0; i < inf.length; i++) m.morphTargetInfluences[i] = inf[i];
    if (!this.lod) for (const m of Object.values(this.hulls)) if (m.visible) for (let i = 0; i < inf.length; i++) m.morphTargetInfluences[i] = inf[i];
  }
  dispose() {
    this.mixer.stopAllAction();
    for (const m of [...Object.values(this.meshes), ...Object.values(this.lodMeshes), ...Object.values(this.hulls)]) m.parent?.remove(m);
    this.root.parent?.remove(this.root);
  }
}
function spring(A, k, v, to, K, vmax, dt) {
  let s = A[v] + (K * (to - A[k]) - 2 * Math.sqrt(K) * A[v]) * dt;
  s = clamp(s, -vmax, vmax);
  A[k] += s * dt; A[v] = s;
}
