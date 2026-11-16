// world-refresh: the Unstable Unicorns diorama's magic (areas.js loads it once the diorama is draped on its hill).
//   - the game's name in glowing letters along the rainbow
//   - the rainbow: a bright sweep running round the arc and sparkles streaming along the bands, dust drifting off it
//   - the portal at the top of the path: a swirling rainbow vortex with a glowing rim and sparkles spiralling into it
//   - the two little doorways: mirrors (a reflected camera renders the scene into each, only while you are near)
// Model coordinates (the diorama as exported, x across, y up, +z the path's front) are placed by the caller's L2W / Y.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const NAME = 'Unstable Unicorns';
// measured on the model (world-refresh/blender: front, top and back orthographic views with a 0.1 grid)
const ARCH = { x: 0.045, y: -0.22, z: -0.315, rOut: 0.85, rIn: 0.49, faceK: 0.047 };   // centre, radii; the face leans back faceK per unit x
const PORTAL = { x: 0.33, z: -0.5, y: 0.2, w: 0.19, h: 0.29, nx: -0.406, nz: 0.914 };    // y: middle above the ground; n: faces down the path
const MIRRORS = [{ x: -0.37, z: -0.235, nx: 0.617, nz: 0.786, w: 0.125, h: 0.215 }, { x: 0.245, z: 0.515, nx: -0.78, nz: 0.63, w: 0.12, h: 0.205 }];

export function unicornFx({ group, updaters, L2W, Y, US, yaw, ground, addNightSpot }) {
  const fx = new THREE.Group(); fx.name = 'unicorn-fx'; group.add(fx);
  const cam = () => (typeof window !== 'undefined' && window.breneland?.camera) || null;
  const [ax, az] = L2W(ARCH.x, ARCH.z), ay = Y(ARCH.y, ax, az);
  const arch = new THREE.Group(); arch.position.set(ax, ay, az); arch.rotation.y = yaw; fx.add(arch);
  const faceZ = lx => (-(0.31 + ARCH.faceK * (ARCH.x + lx / US)) - ARCH.z) * US;   // the rainbow's front face at local x (m)
  const U = { t: { value: 0 } };

  // ---- the name along the rainbow: one letter per plane, between the yellow and the green band
  const R = 0.675 * US, LH = 0.105 * US, span = 1.62, a0 = Math.PI / 2 + span / 2;
  const letters = [];
  [...NAME].forEach((ch, i) => {
    if (ch === ' ') return;
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.font = 'bold 104px "Fredoka One", "Baloo 2", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.shadowColor = '#ffffff'; g.shadowBlur = 16; g.lineWidth = 18; g.strokeStyle = '#7b3fd0'; g.strokeText(ch, 64, 70);
    g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.fillText(ch, 64, 70);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(LH, LH), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    const th = a0 - (i + 0.5) / NAME.length * span, lx = Math.cos(th) * R;
    m.position.set(lx, Math.sin(th) * R, faceZ(lx) + 0.1); m.rotation.z = th - Math.PI / 2; m.renderOrder = 3;
    arch.add(m); letters.push({ m, i, th });
  });

  // ---- the rainbow: a sweep of light round the arc (additive, over the bands) ...
  const sweep = new THREE.Mesh(new THREE.RingGeometry(ARCH.rIn * US, ARCH.rOut * US, 96, 1, 0, Math.PI), new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float t; varying vec2 vP;
      void main() { float a = atan(vP.y, vP.x) / 3.14159, r = length(vP);
        float s = fract(a * 1.2 + t * 0.22); float sw = smoothstep(0.0, 0.04, s) * (1.0 - smoothstep(0.04, 0.14, s));
        float s2 = fract(-a * 0.8 + t * 0.13 + 0.5); sw += 0.5 * smoothstep(0.0, 0.05, s2) * (1.0 - smoothstep(0.05, 0.2, s2));
        float glint = pow(max(0.0, sin(r * 9.0 - t * 2.0 + a * 20.0)), 24.0) * 0.5;
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * (sw * 0.22 + glint * 0.3), 1.0); }`,
  }));
  sweep.position.z = faceZ(0) + 0.06; sweep.renderOrder = 2; arch.add(sweep);

  // ... sparkles streaming along the bands, and dust drifting down off it (one Points cloud, moved in the shader)
  const N = 900, pa = new Float32Array(N * 3), pb = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const band = Math.floor(Math.random() * 6), r = (ARCH.rIn + (band + 0.5) / 6 * (ARCH.rOut - ARCH.rIn)) * US;
    pa.set([r, Math.random(), Math.random() < 0.22 ? 1 : 0], i * 3);                       // radius, phase, falls?
    pb.set([0.04 + Math.random() * 0.06, band, Math.random(), (Math.random() - 0.5) * 0.25], i * 4); // speed, band, twinkle, depth jitter
  }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  pg.setAttribute('aA', new THREE.BufferAttribute(pa, 3)); pg.setAttribute('aB', new THREE.BufferAttribute(pb, 4));
  pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), ARCH.rOut * US * 1.6);
  const sparkle = `float d = length(gl_PointCoord - 0.5); float core = smoothstep(0.5, 0.0, d); float star = max(0.0, 1.0 - abs(gl_PointCoord.x - 0.5) * 9.0) * max(0.0, 1.0 - abs(gl_PointCoord.y - 0.5) * 2.2) + max(0.0, 1.0 - abs(gl_PointCoord.y - 0.5) * 9.0) * max(0.0, 1.0 - abs(gl_PointCoord.x - 0.5) * 2.2);`;
  const pts = new THREE.Points(pg, new THREE.ShaderMaterial({
    uniforms: { ...U, fz: { value: faceZ(0) + 0.15 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float t, fz; attribute vec3 aA; attribute vec4 aB; varying vec3 vC; varying float vA;
      vec3 band(float b) { return b < 0.5 ? vec3(0.62, 0.45, 1.0) : b < 1.5 ? vec3(0.45, 0.75, 1.0) : b < 2.5 ? vec3(0.5, 1.0, 0.55) : b < 3.5 ? vec3(1.0, 0.97, 0.5) : b < 4.5 ? vec3(1.0, 0.75, 0.4) : vec3(1.0, 0.5, 0.55); }
      void main() { float p = fract(aA.y + t * aB.x); float a = 3.14159 * (1.0 - p); float r = aA.x;
        vec3 pos = vec3(cos(a) * r, sin(a) * r, fz + aB.w);
        if (aA.z > 0.5) { float f = fract(aA.y * 7.0 + t * 0.12); pos.y -= f * 3.5; pos.x += sin(t + aA.y * 30.0) * 0.4 * f; vA = 1.0 - f; } else vA = 1.0;
        vC = mix(band(aB.y), vec3(1.0), 0.55); vA *= 0.55 + 0.45 * sin(t * 6.0 + aB.z * 40.0);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (aA.z > 0.5 ? 70.0 : 110.0) / -mv.z; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main() { ${sparkle} float k = core * 0.6 + star; if (k < 0.02) discard; gl_FragColor = vec4(vC * k * vA, 1.0); }`,
  }));
  pts.renderOrder = 4; arch.add(pts);

  // ---- the portal: a swirling rainbow vortex in the arch at the top of the path, with a glowing rim
  const [px, pz] = L2W(PORTAL.x, PORTAL.z), py = ground(px, pz) + PORTAL.y * US;
  const portal = new THREE.Group(); portal.position.set(px, py, pz); portal.rotation.y = yaw + Math.atan2(PORTAL.nx, PORTAL.nz); fx.add(portal);
  const PW = PORTAL.w * US, PH = PORTAL.h * US;
  const vortex = new THREE.Mesh(new THREE.PlaneGeometry(PW * 1.25, PH * 1.2), new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: true, side: THREE.DoubleSide,   // (solid: writes depth, so the outlines of what is behind do not show through)
    vertexShader: 'varying vec2 vU; void main() { vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float t; varying vec2 vU;
      vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main() { vec2 q = vU * vec2(1.0, 1.0); float r = length(q * vec2(1.0, 0.85)), a = atan(q.y, q.x);
        if (r > 1.0) discard;
        float sw = sin(a * 3.0 + r * 11.0 - t * 3.2) * 0.5 + 0.5, sw2 = sin(-a * 5.0 + r * 17.0 - t * 4.5) * 0.5 + 0.5;
        vec3 c = mix(hue(fract(a / 6.2832 + t * 0.07 + r * 0.3)) * 0.9 + 0.1, vec3(1.0), 0.25 * sw2);
        float rim = smoothstep(0.75, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r));
        float core = 1.0 - smoothstep(0.0, 0.45, r);
        float k = (0.35 + 0.65 * sw) * (1.0 - smoothstep(0.85, 1.0, r)) * 0.75 + rim * 1.4 + core * (0.8 + 0.3 * sin(t * 2.5));
        gl_FragColor = vec4(min(c * k + 0.12, vec3(1.0)), 0.95); }`,
  }));
  vortex.renderOrder = 3; portal.add(vortex);
  // sparkles spiralling into it
  const M = 260, qa = new Float32Array(M * 3);
  for (let i = 0; i < M; i++) qa.set([Math.random(), Math.random() * TAU, 0.6 + Math.random() * 0.8], i * 3);
  const qg = new THREE.BufferGeometry(); qg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 3), 3)); qg.setAttribute('aA', new THREE.BufferAttribute(qa, 3));
  qg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), PH * 2);
  portal.add(Object.assign(new THREE.Points(qg, new THREE.ShaderMaterial({
    uniforms: { ...U, sz: { value: new THREE.Vector2(PW, PH) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float t; uniform vec2 sz; attribute vec3 aA; varying float vA; varying vec3 vC;
      void main() { float p = fract(aA.x + t * 0.18 * aA.z); float r = 1.0 - p; float a = aA.y + p * 7.0;
        vec3 pos = vec3(cos(a) * sz.x * 0.9 * r, sin(a) * sz.y * 0.75 * r, (1.0 - p) * 1.6 + 0.05);
        vA = smoothstep(0.0, 0.2, p) * (1.0 - smoothstep(0.85, 1.0, p)); vC = 0.6 + 0.4 * cos(vec3(0.0, 2.1, 4.2) + aA.y * 3.0 + t);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = 90.0 / -mv.z; }`,
    fragmentShader: `varying float vA; varying vec3 vC; void main() { ${sparkle} float k = core * 0.7 + star; if (k < 0.02) discard; gl_FragColor = vec4(mix(vC, vec3(1.0), 0.4) * k * vA, 1.0); }`,
  })), { renderOrder: 4 }));
  if (addNightSpot) addNightSpot({ x: px, y: py, z: pz, color: '#d6a4ff', pool: 4.5, poolK: 0.7, halo: 1.6, spread: 1 });

  // ---- the mirrors: an arched pane in each little doorway, its picture rendered from the camera reflected in its plane
  const mirrors = MIRRORS.map(d => {
    const [mx, mz] = L2W(d.x, d.z), my = ground(mx, mz) + 0.03, W = d.w * US, H = d.h * US;
    const sh = new THREE.Shape(); sh.moveTo(-W / 2, 0); sh.lineTo(W / 2, 0); sh.lineTo(W / 2, H - W / 2); sh.absarc(0, H - W / 2, W / 2, 0, Math.PI, false); sh.lineTo(-W / 2, 0);
    const geo = new THREE.ShapeGeometry(sh, 16);
    const rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType }); rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const tm = new THREE.Matrix4();
    const mat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: rt.texture }, tm: { value: tm }, ...U },
      vertexShader: 'uniform mat4 tm; varying vec4 vU; varying vec2 vP; void main() { vU = tm * vec4(position, 1.0); vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float t; varying vec4 vU; varying vec2 vP;
        void main() { vec3 c = texture2DProj(tDiffuse, vU).rgb; float g = pow(max(0.0, sin(vP.x * 2.0 + vP.y * 1.3 - t * 0.6)), 40.0) * 0.25;
          gl_FragColor = vec4(c * vec3(0.93, 0.95, 1.0) + vec3(0.04, 0.03, 0.06) + g, 1.0); }` });
    const pane = new THREE.Mesh(geo, mat); pane.position.set(mx, my, mz); pane.rotation.y = yaw + Math.atan2(d.nx, d.nz); pane.renderOrder = 1;
    const back = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#b9b4cf', side: THREE.BackSide })); pane.add(back);
    fx.add(pane);
    return { pane, rt, tm, vcam: new THREE.PerspectiveCamera(), frame: -1 };
  });
  const _n = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _v = new THREE.Vector3(), _l = new THREE.Vector3(0, 0, -1);
  const _pl = new THREE.Plane(), _cp = new THREE.Vector4(), _q = new THREE.Vector4(), _rm = new THREE.Matrix4();
  let toggle = 0;
  for (const m of mirrors) m.pane.onBeforeRender = (renderer, scene, camera) => {
    if (!camera.isPerspectiveCamera || scene.overrideMaterial || mirrors.some(o => o.vcam === camera)) return;   // (not the ink pass's normal render, not our own)
    const f = renderer.info.render.frame; if (m.frame === f) return; m.frame = f;
    _rm.extractRotation(m.pane.matrixWorld); _n.set(0, 0, 1).applyMatrix4(_rm); _p.setFromMatrixPosition(m.pane.matrixWorld); _c.setFromMatrixPosition(camera.matrixWorld);
    _v.subVectors(_p, _c); if (_v.dot(_n) > 0 || _v.length() > 32) return;                   // seen from behind, or too far: keep the last picture
    if ((toggle++ & 1) !== mirrors.indexOf(m)) return;                                         // (the two take turns, every other frame each)
    _v.reflect(_n).negate().add(_p);
    _rm.extractRotation(camera.matrixWorld); _l.set(0, 0, -1).applyMatrix4(_rm).add(_c); _t.subVectors(_p, _l).reflect(_n).negate().add(_p);
    const vc = m.vcam; vc.position.copy(_v); vc.up.set(0, 1, 0).applyMatrix4(_rm).reflect(_n); vc.lookAt(_t);
    vc.far = camera.far; vc.near = camera.near; vc.fov = camera.fov; vc.aspect = camera.aspect; vc.updateMatrixWorld(); vc.projectionMatrix.copy(camera.projectionMatrix);
    m.tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1); m.tm.multiply(vc.projectionMatrix); m.tm.multiply(vc.matrixWorldInverse); m.tm.multiply(m.pane.matrixWorld);
    // an oblique near plane on the mirror, so nothing behind it shows in the picture
    _pl.setFromNormalAndCoplanarPoint(_n, _p); _pl.applyMatrix4(vc.matrixWorldInverse);
    _cp.set(_pl.normal.x, _pl.normal.y, _pl.normal.z, _pl.constant); const pm = vc.projectionMatrix, e = pm.elements;
    _q.x = (Math.sign(_cp.x) + e[8]) / e[0]; _q.y = (Math.sign(_cp.y) + e[9]) / e[5]; _q.z = -1; _q.w = (1 + e[10]) / e[14];
    _cp.multiplyScalar(2 / _cp.dot(_q)); e[2] = _cp.x; e[6] = _cp.y; e[10] = _cp.z + 1 - 0.003; e[14] = _cp.w;
    const was = renderer.getRenderTarget(), xr = renderer.xr.enabled, sa = renderer.shadowMap.autoUpdate;
    for (const o of mirrors) o.pane.visible = false;
    renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(m.rt); renderer.clear(); renderer.render(scene, vc);
    renderer.setRenderTarget(was); renderer.xr.enabled = xr; renderer.shadowMap.autoUpdate = sa;
    for (const o of mirrors) o.pane.visible = true;
  };

  // ---- the clock, the letters' shimmer, and nothing at all from far away
  updaters.push((dt, t) => {
    U.t.value = t;
    const c = cam(); const far = c ? Math.hypot(c.position.x - ax, c.position.z - az) > 90 : false;
    fx.visible = !far; if (far) return;
    for (const L of letters) { const k = 1 + 0.07 * Math.max(0, Math.sin(t * 2.2 - L.i * 0.45)); L.m.scale.setScalar(k); }
  });
  return { fx, mirrors, portal: { x: px, y: py, z: pz } };
}
