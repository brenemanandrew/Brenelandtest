// A small floating look at an outfit model: hover over a filled outfit slot in the Studio (or tap its name) and she turns slowly
// in a little window beside it. One renderer is shared; the last few models stay loaded so going back to one is instant.
//   import { pip } from './fitpip.js';   pip.attach(element, url, title)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
const W = 250, H = 360, KEEP = 4;
let box, label, renderer, scene, camera, holder, loader, raf = 0, want = '', shown = null, hideT = 0, last = 0; const cache = new Map();
function setup() {
  if (box) return;
  box = document.createElement('div'); box.style.cssText = `position:fixed;z-index:60;width:${W}px;height:${H}px;border-radius:18px;overflow:hidden;background:radial-gradient(circle at 50% 35%,#7a5fc0,#2a1d52);box-shadow:0 14px 40px rgba(20,10,50,.5);border:3px solid #fff;pointer-events:none;display:none`;
  label = document.createElement('div'); label.style.cssText = 'position:absolute;left:0;right:0;bottom:0;padding:6px 10px;font:600 14px Fredoka,system-ui,sans-serif;color:#fff;background:rgba(20,12,45,.6);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(W, H); box.append(renderer.domElement, label); document.body.append(box);
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(26, W / H, 0.05, 30); scene.add(new THREE.AmbientLight(0xffffff, 0.8)); const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(1.5, 3, 4); scene.add(sun);
  holder = new THREE.Group(); scene.add(holder); loader = new GLTFLoader(); loader.register(p => new VRMLoaderPlugin(p));
}
function frame(now) { raf = requestAnimationFrame(frame); const dt = Math.min(0.1, (now - last) / 1000); last = now; if (shown) { holder.rotation.y += dt * 0.7; shown.vrm.update(dt); } renderer.render(scene, camera); }
function fit(vrm) { const b = new THREE.Box3().setFromObject(vrm.scene), h = Math.max(0.5, b.max.y - b.min.y), mid = (b.max.y + b.min.y) / 2, d = h / 2 / Math.tan(13 * Math.PI / 180) * 1.12; camera.position.set(0, mid + h * 0.04, d); camera.lookAt(0, mid, 0); }
function drop(e) { holder.remove(e.vrm.scene); try { VRMUtils.deepDispose(e.vrm.scene); } catch {} }
async function show(url, title, near) {
  setup(); clearTimeout(hideT); want = url; label.textContent = 'Loading ' + title + '...';
  const r = near.getBoundingClientRect(); let x = r.right + 10, y = r.top - 40; if (x + W > innerWidth - 8) x = r.left - W - 10; if (x < 8) x = 8; y = Math.max(8, Math.min(innerHeight - H - 8, y)); box.style.left = x + 'px'; box.style.top = y + 'px'; box.style.display = 'block';
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  if (shown && shown.url !== url) { shown.vrm.scene.visible = false; shown = null; }
  let e = cache.get(url);
  if (!e) { try { const vrm = (await loader.loadAsync(url)).userData.vrm; VRMUtils.rotateVRM0(vrm); vrm.scene.traverse(o => { o.frustumCulled = false; }); e = { url, vrm, at: 0 }; cache.set(url, e); holder.add(vrm.scene); vrm.scene.visible = false; /* relaxed arms instead of a T */ const B = n => vrm.humanoid.getNormalizedBoneNode(n); if (B('leftUpperArm')) B('leftUpperArm').rotation.z = -1.2; if (B('rightUpperArm')) B('rightUpperArm').rotation.z = 1.2; }
    catch { if (want === url) label.textContent = 'This model could not be shown.'; return; } }
  e.at = performance.now(); if (cache.size > KEEP) { const old = [...cache.values()].filter(c => c.url !== want).sort((a, b) => a.at - b.at)[0]; if (old) { cache.delete(old.url); drop(old); } }
  if (want !== url) return; for (const c of cache.values()) c.vrm.scene.visible = c === e; shown = e; holder.rotation.y = 0.35; e.vrm.update(0); fit(e.vrm); label.textContent = title;
}
function hide() { want = ''; clearTimeout(hideT); hideT = setTimeout(() => { if (!box || want) return; box.style.display = 'none'; cancelAnimationFrame(raf); raf = 0; }, 120); }
export const pip = { attach(elm, url, title) { elm.addEventListener('pointerenter', () => show(url, title, elm)); elm.addEventListener('pointerleave', hide); elm.addEventListener('click', e => { if (e.target.closest('button')) return; if (want === url) hide(); else show(url, title, elm); }); }, hide, get state() { return { want, shown: shown && shown.url, visible: !!box && box.style.display !== 'none', label: label && label.textContent }; } };
