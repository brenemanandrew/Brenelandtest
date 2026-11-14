// The gates in the yard fence (layout.js GATES): a picket gate on a hinge post in each opening. Press E to open or close one. An open
// gate closes itself once nobody has been near it for a while, and a closed one is solid (a box collider that goes `off` while open).
// The dogs never get through, they live inside layout.js YARD. Gates are local to each visitor, but one swings open on its own for
// another player walking through, so nobody is seen walking through a closed gate.
import * as THREE from 'three';
import { GATES } from './layout.js';
import { terrainHeight } from './terrain.js';
import { toon } from './toon.js';
import { GEO } from './batch.js';

const OPEN = 1.75;       // radians the gate swings open
const REACH = 2.3;       // how close you must be to work it
const AUTO_CLOSE = 7;    // seconds with nobody near before an open gate swings shut

export function createGates(ctx) {
  const { scene, player, colliders, audio, remotes } = ctx;
  audio.registerSfx?.('gate', (a, x, y, z, o) => {
    const out = a.at(x, y, z, 4);
    const t = a.ctx.currentTime;
    // a latch click and a short wooden creak
    a.burst(out, { t, dur: 0.03, f: 2400, Q: 4, peak: 0.16 });
    a.tone(out, { f: o.open ? 210 : 260, glide: o.open ? 320 : 170, t: t + 0.04, d: 0.32, peak: 0.05, type: 'sawtooth' });
    if (!o.open) a.burst(out, { t: t + 0.36, dur: 0.05, f: 900, Q: 2, peak: 0.2, brown: true });
  });

  const white = toon('#fbfaf5'), trim = toon('#f1efe6'), iron = toon('#3a3f47');
  const gates = GATES.map(g => {
    const alongX = g.axis === 'x';
    // hinge at the low end of the opening; the gate leaf runs along the fence to the other post
    const hx = alongX ? g.x - g.w / 2 : g.x, hz = alongX ? g.z : g.z - g.w / 2;
    const y = terrainHeight(g.x, g.z);
    const hinge = new THREE.Group();
    hinge.position.set(hx, y, hz);
    // leaf built along local +x; turned to lie along the fence
    const leaf = new THREE.Group();
    const L = g.w - 0.06;
    for (let i = 0; i < 5; i++) {
      const px = 0.15 + (i * (L - 0.3)) / 4;
      const p = new THREE.Mesh(GEO.box, white); p.scale.set(0.26, 1.02, 0.05); p.position.set(px, 0.6, 0); leaf.add(p);
      const tip = new THREE.Mesh(GEO.cone6, white); tip.scale.set(0.13, 0.15, 0.04); tip.position.set(px, 1.18, 0); tip.rotation.y = Math.PI / 6; leaf.add(tip);
    }
    for (const ry of [0.32, 0.88]) { const r = new THREE.Mesh(GEO.box, trim); r.scale.set(L, 0.09, 0.06); r.position.set(L / 2, ry, 0.05); leaf.add(r); }
    const brace = new THREE.Mesh(GEO.box, trim); brace.scale.set(Math.hypot(L, 0.56) - 0.1, 0.07, 0.05); brace.position.set(L / 2, 0.6, 0.05);
    brace.rotation.z = Math.atan2(0.56, L); leaf.add(brace);
    const latch = new THREE.Mesh(GEO.box, iron); latch.scale.set(0.14, 0.05, 0.1); latch.position.set(L - 0.05, 0.92, 0.06); leaf.add(latch); // (2 cm up, like the top hinge: its top was level with the fence rail's)
    for (const hy of [0.3, 0.92]) { const h = new THREE.Mesh(GEO.box, iron); h.scale.set(0.16, 0.05, 0.08); h.position.set(0.06, hy, 0.05); leaf.add(h); } // (the top hinge 2 cm up: its top was level with the fence rail's and flickered)
    leaf.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    hinge.add(leaf);
    // closed: the leaf lies along the fence. North gate: along +x. West gate: along +z (turn -90 degrees about y).
    const base = alongX ? 0 : -Math.PI / 2;
    // it swings OUT of the yard: north gate toward -z, west gate toward -x
    const dir = alongX ? 1 : -1;
    hinge.rotation.y = base;
    scene.add(hinge);
    const col = alongX
      ? { type: 'box', minX: g.x - g.w / 2, maxX: g.x + g.w / 2, minZ: g.z - 0.09, maxZ: g.z + 0.09, gate: g.id }
      : { type: 'box', minX: g.x - 0.09, maxX: g.x + 0.09, minZ: g.z - g.w / 2, maxZ: g.z + g.w / 2, gate: g.id };
    colliders.push(col);
    return { g, hinge, base, dir, col, open: false, t: 0, idle: 0 };
  });

  const near = (st, x, z, r) => Math.hypot(x - st.g.x, z - st.g.z) < r;
  function set(st, open) {
    if (st.open === open) return;
    // do not slam it on someone standing in the opening
    if (!open && (near(st, player.pos.x, player.pos.z, 0.75) || [...(remotes?.map.values() || [])].some(r => near(st, r.ch.root.position.x, r.ch.root.position.z, 0.75)))) return;
    st.open = open; st.idle = 0;
    st.col.off = open;
    audio.play?.('gate', st.g.x, 1, st.g.z, { open });
  }

  return {
    name: 'gates',
    gates,
    isOpen: id => !!gates.find(s => s.g.id === id)?.open,
    update(dt) {
      const px = player.pos.x, pz = player.pos.z;
      for (const st of gates) {
        // someone else walking through: swing it open for them
        for (const r of remotes?.map.values() || []) {
          const p = r.ch.root.position;
          if (!st.open && near(st, p.x, p.z, 1.2)) set(st, true);
        }
        for (const d of ctx.npcs?.npcs || []) { // neighbours heading home through it (the dogs never come this close: they stay in YARD)
          const p = d.body.root.position;
          if (!st.open && (d.kind === 'human' || d._escape) && d.body.root.visible && near(st, p.x, p.z, d._escape ? 3.4 : 1.6)) set(st, true); // and Nala slipping out (dogs-mail.js)
        }
        const busy = near(st, px, pz, 3) || [...(remotes?.map.values() || [])].some(r => near(st, r.ch.root.position.x, r.ch.root.position.z, 3)) || (ctx.npcs?.npcs || []).some(d => (d.kind === 'human' || d._escape) && d.body.root.visible && near(st, d.body.root.position.x, d.body.root.position.z, 2.5));
        if (st.open) { st.idle = busy ? 0 : st.idle + dt; if (st.idle > AUTO_CLOSE) set(st, false); }
        const goal = st.open ? 1 : 0;
        st.t += Math.sign(goal - st.t) * Math.min(Math.abs(goal - st.t), dt * (st.open ? 2.4 : 3.2));
        const e = st.t * st.t * (3 - 2 * st.t);
        st.hinge.rotation.y = st.base + st.dir * OPEN * e;
      }
    },
    target(px, pz) {
      let best = null, bd = REACH;
      for (const st of gates) { const d = Math.hypot(px - st.g.x, pz - st.g.z); if (d < bd) { bd = d; best = st; } }
      if (!best) return null;
      // right at the gate it outranks the built-in prompts (prio 5). The front gate is 2 m from the mailbox, and "Check the mail" used
      // to take E from anyone standing at the gate on the yard side
      return { hint: `E  ${best.open ? 'Close' : 'Open'} ${best.g.name}`, prio: bd < 1.6 ? 5 : 2, run: () => set(best, !best.open) };
    },
    help: [[['E'], 'open and close the yard gates']],
  };
}
