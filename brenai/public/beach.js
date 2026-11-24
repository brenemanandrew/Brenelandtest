// The beach for the heart game: a cel-shaded strip of shore that she runs along, in the shallow wash at the water's edge.
// Everything is made here from simple shapes: no files. She runs along +x at z = RUN_Z; the sea is on the -z side, the land on +z.
//   const b = buildBeach(THREE, { toon, outline, floorY });   scene.add(b.group);
//   b.tick(seconds, herX, camera)   moves the sea, keeps sky, sand and water under her, and wraps the palms and rocks round as she passes
// The water is a mirror (three.js Reflector, so she and the sky really are reflected) drawn with a cartoon shader: the reflection wobbles,
// the colour comes in flat bands, and lines of foam slide in and out at the edge.
import { Reflector } from 'three/addons/objects/Reflector.js';

export const RUN_Z = -1.5, SHORE_Z = -0.6;

export function buildBeach(THREE, { toon, outline, floorY }) {
  const group = new THREE.Group(); group.visible = false; group.name = 'beach';
  const follow = new THREE.Group(); group.add(follow);   // what stays under and around her: sky, sand, sea

  // sky: a dome in three flat bands, a sun, and a few flat clouds
  const sky = new THREE.Mesh(new THREE.SphereGeometry(170, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#79b6ff') }, mid: { value: new THREE.Color('#c7b9ff') }, low: { value: new THREE.Color('#ffdbe9') } },   /* a dream of a sky: blue going to lilac going to pink at the horizon */
    vertexShader: 'varying float h; void main() { h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying float h; void main() { vec3 c = h > 0.5 ? top : h > 0.34 ? mix(mid, top, 0.5) : h > 0.2 ? mid : h > 0.09 ? mix(low, mid, 0.5) : low; gl_FragColor = vec4(c, 1.0); }' }));
  sky.renderOrder = -10; follow.add(sky);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: '#fff6c9', fog: false })); sun.position.set(-60, 70, -130); sun.lookAt(0, 0, 0); follow.add(sun);
  const cloudMat = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }), clouds = [];
  for (let i = 0; i < 7; i++) { const c = new THREE.Group(); for (let k = 0; k < 4; k++) { const p = new THREE.Mesh(new THREE.CircleGeometry(5 + Math.random() * 5, 20), cloudMat); p.position.set(k * 6 - 9 + Math.random() * 3, Math.random() * 2.5, 0); p.scale.y = 0.55; c.add(p); }
    c.position.set(-140 + i * 45 + Math.random() * 20, 32 + Math.random() * 26, -150); c.userData.sp = 0.4 + Math.random() * 0.5; follow.add(c); clouds.push(c); }
  // far islands on the horizon
  for (const [x, w, h] of [[-70, 30, 7], [40, 46, 10], [110, 22, 5]]) { const isl = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon('#5fae7a')); isl.scale.set(w, h, 8); isl.position.set(x, floorY - 0.2, -140); follow.add(isl); }

  // sand: dry sand on the land side, a darker wet band at the water's edge
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(420, 90), toon('#f3dfa6')); sand.rotation.x = -Math.PI / 2; sand.position.set(0, floorY - 0.012, 44); follow.add(sand);
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(420, 3.4), toon('#d8c088')); wet.rotation.x = -Math.PI / 2; wet.position.set(0, floorY - 0.008, SHORE_Z + 1.1); follow.add(wet);
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(420, 200), toon('#cdb67e')); bed.rotation.x = -Math.PI / 2; bed.position.set(0, floorY - 0.06, -100); follow.add(bed);   // the sea floor under the shallows

  // the sea: a mirror with a cartoon shader
  const water = new Reflector(new THREE.PlaneGeometry(420, 200), { textureWidth: 768, textureHeight: 768, clipBias: 0.003, color: 0x7fd6ff,
    shader: { name: 'CelWater',
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, time: { value: 0 }, shore: { value: SHORE_Z }, deep: { value: new THREE.Color('#4f8fe6') }, shallow: { value: new THREE.Color('#9fe8f2') }, foam: { value: new THREE.Color('#ffffff') } },
      vertexShader: 'uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW; void main() { vUv = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform vec3 color; uniform sampler2D tDiffuse; uniform float time; uniform float shore; uniform vec3 deep; uniform vec3 shallow; uniform vec3 foam; varying vec4 vUv; varying vec3 vW;
        void main() {
          float out_ = shore - vW.z;                                   // metres out from the edge of the water
          vec2 wob = vec2(sin(vW.z * 3.1 + time * 1.7) + sin(vW.x * 1.3 - time * 1.1), cos(vW.x * 2.3 + time * 1.3)) * 0.012 * vUv.w;
          vec3 refl = texture2DProj(tDiffuse, vUv + vec4(wob, 0.0, 0.0)).rgb;
          refl = floor(refl * 5.0 + 0.5) / 5.0;                         // the reflection in flat steps of colour
          float band = out_ < 2.5 ? 0.0 : out_ < 9.0 ? 0.5 : 1.0;       // three flat bands: shallows, middle, deep
          vec3 base = mix(shallow, deep, band);
          float glint = step(0.93, sin(vW.x * 0.9 + sin(vW.z * 0.7 + time * 0.6) * 2.0) * sin(vW.z * 1.7 - time * 0.9));   // flat sparkles further out
          vec3 c = mix(base, refl, out_ < 2.5 ? 0.62 : 0.45) + glint * 0.25 * band;
          float edge = shore + 0.25 * sin(time * 0.9 + vW.x * 0.35) + 0.12 * sin(time * 1.6 + vW.x * 1.1);   // the waterline breathes in and out
          float d = edge - vW.z;
          float f = step(d, 0.11) + step(abs(d - 0.75 - 0.3 * sin(time * 0.7 + vW.x * 0.5)), 0.045) + step(abs(d - 1.9 - 0.4 * sin(time * 0.5 + vW.x * 0.3)), 0.035);   // foam at the edge and two thin lines behind it
          c = mix(c, foam, clamp(f, 0.0, 1.0));
          float a = d < 0.0 ? 0.0 : (out_ < 2.5 ? 0.82 : 0.96);        // past the waterline there is only wet sand
          gl_FragColor = vec4(c, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` } });
  water.material.transparent = true; water.rotation.x = -Math.PI / 2; water.position.set(0, floorY + 0.035, -100 + SHORE_Z + 0.5); follow.add(water);

  // things on the land that slide past: palms, rocks, a parasol and towel, beach grass. They are laid out along a stretch and wrapped round her.
  const props = [], SPAN = 96, rnd = (a, b) => a + Math.random() * (b - a);
  const palm = () => { const g = new THREE.Group(), h = rnd(3.2, 4.6), trunk = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, h, 7), toon('#9a6b3f'))); trunk.position.y = h / 2; trunk.rotation.z = rnd(-0.12, 0.12); g.add(trunk);
    for (let i = 0; i < 7; i++) { const leaf = outline(new THREE.Mesh(new THREE.ConeGeometry(0.28, 2.1, 4), toon(i % 2 ? '#3f9e55' : '#58b866'))); leaf.position.y = h; leaf.rotation.set(1.15 + rnd(-0.15, 0.25), i * Math.PI * 2 / 7, 0, 'YXZ'); leaf.translateY(1.0); g.add(leaf); } return g; };
  const rock = () => { const m = outline(new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.3, 0.75), 0), toon('#9aa0ab'))); m.scale.y = 0.65; m.position.y = 0.12; m.rotation.y = rnd(0, 6); return m; };
  const parasol = () => { const g = new THREE.Group(), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.1, 6), toon('#f5f5f5')); pole.position.y = 1.05; pole.rotation.z = 0.12; g.add(pole);
    const top = outline(new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.5, 8), toon(['#ff6b8a', '#ffd166', '#6bcBff'][Math.floor(rnd(0, 3))]))); top.position.set(-0.12, 2.15, 0); g.add(top);
    const towel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), toon(['#7bdff2', '#f7aef8', '#b2f7ef'][Math.floor(rnd(0, 3))])); towel.rotation.x = -Math.PI / 2; towel.position.set(0.5, 0.012, 0.2); g.add(towel); return g; };
  const grass = () => { const g = new THREE.Group(); for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.05, rnd(0.35, 0.7), 4), toon('#86b860')); b.position.set(rnd(-0.25, 0.25), 0.25, rnd(-0.2, 0.2)); b.rotation.z = rnd(-0.3, 0.3); g.add(b); } return g; };
  const shell = () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), toon(['#ffd6e0', '#fff1c1', '#ffffff'][Math.floor(rnd(0, 3))])); m.scale.y = 0.5; return m; };
  const add = (make, x, z) => { const o = make(); o.position.x = x; o.position.z = z; o.position.y += floorY; o.userData.x0 = x; group.add(o); props.push(o); };
  for (let i = 0; i < 9; i++) add(palm, i * (SPAN / 9) + rnd(-2, 2), rnd(5.5, 12));
  for (let i = 0; i < 12; i++) add(rock, rnd(0, SPAN), rnd(2.6, 9));
  for (let i = 0; i < 4; i++) add(parasol, i * (SPAN / 4) + rnd(4, 14), rnd(3.2, 5.5));
  for (let i = 0; i < 16; i++) add(grass, rnd(0, SPAN), rnd(6, 14));
  for (let i = 0; i < 22; i++) add(shell, rnd(0, SPAN), rnd(0.4, 2.4));
  for (let i = 0; i < 3; i++) add(rock, rnd(0, SPAN), rnd(-7, -3.2));   // a few rocks standing in the water

  // water thrown up as she runs: a pool of drops that fly up and fall slowly (it is a dream: gravity is gentle), and motes of light that drift in the air round her
  const DROPS = 420, drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshBasicMaterial({ color: '#e9fbff', transparent: true, opacity: 0.9, fog: false }), DROPS), dp = [], m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), q0 = new THREE.Quaternion(), sc = new THREE.Vector3(); let dn = 0;
  drops.frustumCulled = false; drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < DROPS; i++) { dp.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, size: 0 }); m4.makeScale(0, 0, 0); drops.setMatrixAt(i, m4); } group.add(drops);
  function splash(at, n, power = 1, forward = 0) { for (let i = 0; i < n; i++) { const d = dp[dn++ % DROPS], a = Math.random() * 6.283, out = (0.25 + Math.random() * 0.9) * power; d.p.set(at.x + Math.cos(a) * 0.06, floorY + 0.04, at.z + Math.sin(a) * 0.06); d.v.set(Math.cos(a) * out + forward * (0.6 + Math.random()), (1.3 + Math.random() * 2.1) * power, Math.sin(a) * out); d.life = 1.2 + Math.random() * 1.1; d.size = (0.005 + Math.random() * 0.012) * (0.8 + power * 0.3); } }
  const MOTES = 140, moteGeo = new THREE.BufferGeometry(), mp = new Float32Array(MOTES * 3), ms = []; for (let i = 0; i < MOTES; i++) { mp[i * 3] = rnd(-9, 9); mp[i * 3 + 1] = floorY + rnd(0.2, 3.4); mp[i * 3 + 2] = rnd(-6, 5); ms.push([rnd(0, 6.28), rnd(0.2, 0.6)]); }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3)); const moteTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,240,250,.7)'); gr.addColorStop(1, 'rgba(255,220,240,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ map: moteTex, size: 0.11, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); motes.frustumCulled = false; follow.add(motes);
  const feetWas = [1, 1]; let last = 0, wave = 0;
  // feet: world positions of her two feet (or null); running: she is moving. A foot coming down into the water throws up a burst; every so often a bigger sheet goes up ahead of her and falls across her.
  function tick(sec, x, feet, running) { const dt = Math.min(0.05, Math.max(0, sec - last)); last = sec;
    if (feet && running) { feet.forEach((f, i) => { const h = f.y - floorY; if (h < 0.11 && feetWas[i] >= 0.11) splash(f, 34, 1, 0.9); feetWas[i] = h; }); wave -= dt; if (wave <= 0) { wave = 1.1 + Math.random() * 1.3; v3.set(x + 0.25, 0, feet[0].z - 0.55); splash(v3, 90, 1.7, 0.75); }   /* a bigger sheet from the sea side, carried along with her and falling across her */ }
    for (let i = 0; i < DROPS; i++) { const d = dp[i]; if (d.life <= 0) continue; d.life -= dt; d.v.y -= 4.2 * dt; d.p.addScaledVector(d.v, dt); const k = d.life <= 0 || d.p.y < floorY ? 0 : d.size * Math.min(1, d.life * 2.5); if (!k) d.life = 0; sc.set(k, k * 1.5, k); m4.compose(d.p, q0, sc); drops.setMatrixAt(i, m4); } drops.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < MOTES; i++) { mp[i * 3 + 1] += Math.sin(sec * ms[i][1] + ms[i][0]) * 0.0016; mp[i * 3] -= 0.004 * ms[i][1]; if (mp[i * 3] < -9) mp[i * 3] = 9; } moteGeo.attributes.position.needsUpdate = true; motes.material.opacity = 0.6 + 0.25 * Math.sin(sec * 1.3);
    follow.position.x = x; water.material.uniforms.time.value = sec;
    for (const c of clouds) c.position.x = ((c.position.x + 150 + c.userData.sp * 0.016) % 300) - 150;
    for (const o of props) o.position.x = o.userData.x0 + Math.round((x - o.userData.x0) / SPAN) * SPAN;   // each thing sits in whichever copy of the stretch is nearest her
  }
  return { group, tick, splash, water, skyColor: '#c7b9ff' };
}
