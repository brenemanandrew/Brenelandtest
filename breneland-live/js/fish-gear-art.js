// The fishing gear in 3D. Poles are built per person, one merged mesh per joint so the rod can bend. Lures are built once
// per kind and shared (userData.shared, so putting the rod away never frees them). Cartoon-big on purpose: the camera
// sees the end of the line from 5 to 17 m away. Each lure hangs from its tie point (the origin) down -y, facing +z.
// Budget: a pole is 300 to 700 triangles, a lure 150 to 450.
import * as THREE from 'three';
import { Part, sphere, cylGeo, coneGeo, torusGeo } from './bodies-geo.js';
import { lampGlow } from './daynight-mats.js';
import { poleOf } from './fish-gear.js';

const INK = '#2b2340';
const SILVER = '#d4dde6', STEEL = '#9aa6b2';
const S4 = () => sphere(6, 4), S6 = () => sphere(8, 5), S10 = () => sphere(10, 6);   // tiny bits get the coarse one: the ink hides the facets

// ------------------------------------------------------------------ poles

// The pole runs along its local -y from the fist (the butt sits `butt` behind it); joint i hangs off the end of joint
// i - 1 and its rotation.x bends it (human.js stepRod adds the bend to `rest`, the pole's own crook).
const POLE_SPEC = {
  stick: {
    L: [0.6, 0.5, 0.42, 0.34], r: [0.037, 0.03, 0.024, 0.018, 0.011], seg: 6, butt: 0.15,
    cols: ['#7e5130', '#8a5a34', '#946339', '#9c6d42'], rest: [[0, 0], [0.12, 0.24], [-0.1, -0.3], [0.12, 0.22]],
    deco(p, i, L, r0) {
      p.add(S4(), '#5e3b22', { sx: r0 * 1.4, sy: r0 * 1.2, sz: r0 * 1.4 });                               // a knot at every crook
      if (i === 0) for (const y of [-0.09, -0.15, -0.21]) p.add(torusGeo(0.037, 0.009, Math.PI * 2, 3, 7), '#f1e6c8', { y, rx: Math.PI / 2 }); // string wound round the grip
      if (i === 1) {                                                                                        // a twig stub with one leaf left on it
        p.add(coneGeo(5), '#7e5130', { x: 0.06, y: -0.22, sx: 0.016, sy: 0.17, sz: 0.016, rz: -1.0 });
        p.add(S6(), '#6fbf4f', { x: 0.15, y: -0.17, sx: 0.075, sy: 0.016, sz: 0.04, rz: -0.6, rx: 0.5 });
        p.add(S4(), '#7fcf5a', { x: -0.05, y: -0.4, z: 0.02, sx: 0.06, sy: 0.014, sz: 0.032, rz: 0.7, rx: -0.4 });   // and a second leaf on the other side, sprouting from the bark
      }
      if (i === 2) p.add(S4(), '#5e3b22', { x: -0.02, y: -0.22, sx: 0.016, sy: 0.026, sz: 0.016 });         // a bump of bark
      if (i === 3) p.add(S4(), '#f1e6c8', { y: -L + 0.01, sx: 0.018, sy: 0.018, sz: 0.018 });                // the string knotted round the tip
    },
  },
  bamboo: {
    L: [0.84, 0.72, 0.62, 0.52], r: [0.034, 0.027, 0.02, 0.014, 0.008], seg: 7, butt: 0.17,
    cols: ['#e3cf7a', '#dccf72', '#d2cd6a', '#b9cf68'], rest: [[0, 0], [0, 0], [0, 0], [0, 0]],
    deco(p, i, L, r0, r1) {
      const n = Math.max(2, Math.round(L / 0.22));                                                         // the nodes, a dark ring every hand's width
      for (let k = 0; k < n; k++) { const t = k / n, rr = (r0 + (r1 - r0) * t) * 1.24; p.add(cylGeo(rr, rr, 0.02, 7), '#9a8a3a', { y: -t * L - 0.01 }); }
      if (i === 0) p.add(cylGeo(0.04, 0.04, 0.26, 8), '#3d6b3a', { y: -0.17 });                             // a green cord grip
      if (i === 3) {                                                                                         // and a green tip with two leaves
        p.add(cylGeo(0.011, 0.007, 0.16, 6), '#5cae4a', { y: -L + 0.08 });
        p.add(S4(), '#6cc35a', { x: 0.04, y: -L + 0.14, sx: 0.05, sy: 0.01, sz: 0.022, rz: -0.6 });
        p.add(S4(), '#5cb04c', { x: -0.035, y: -L + 0.2, sx: 0.042, sy: 0.01, sz: 0.02, rz: 0.7 });
      }
    },
  },
  spinner: {
    L: [0.72, 0.56, 0.48, 0.4], r: [0.022, 0.017, 0.013, 0.009, 0.006], seg: 7, butt: 0.2,
    cols: ['#2f7fe0', '#3489ea', '#3a92f0', '#3f9af5'], rest: [[0, 0], [0, 0], [0, 0], [0, 0]],
    deco(p, i, L, r0) {
      if (i === 0) {
        p.add(cylGeo(0.033, 0.03, 0.3, 8), '#2a2a36', { y: -0.17 });                                         // black foam grip
        p.add(cylGeo(0.03, 0.03, 0.08, 8), '#2a2a36', { y: 0.04 });                                           // and the butt knob
        p.add(cylGeo(0.026, 0.026, 0.1, 8), '#c8d0d8', { y: -0.37 });                                         // the reel seat
        // the spinning reel under the rod: a stem, the body, the spool, the bail and the crank with its knob
        p.add(cylGeo(0.01, 0.012, 0.07, 6), '#c8d0d8', { y: -0.37, z: -0.05, rx: Math.PI / 2 });
        p.add(S6(), '#b9c3cd', { y: -0.34, z: -0.1, sx: 0.045, sy: 0.06, sz: 0.045 });
        p.add(cylGeo(0.05, 0.05, 0.06, 10), '#eef2f6', { y: -0.42, z: -0.1 });
        p.add(cylGeo(0.05, 0.05, 0.012, 10), '#ff7a1f', { y: -0.42, z: -0.1 });                              // the line on the spool
        p.add(torusGeo(0.058, 0.007, Math.PI, 4, 8), '#c8d0d8', { y: -0.455, z: -0.1, rx: Math.PI / 2 });
        p.add(cylGeo(0.008, 0.008, 0.09, 5), '#c8d0d8', { x: 0.06, y: -0.33, z: -0.1, rz: Math.PI / 2 });
        p.add(S4(), INK, { x: 0.105, y: -0.33, z: -0.12, sx: 0.02, sy: 0.02, sz: 0.03 });
      }
      p.add(cylGeo(r0 * 1.5, r0 * 1.5, 0.03, 7), '#ffffff', { y: -0.05 });                                   // white thread wraps
      // a guide under each joint, smaller toward the tip (the line runs through them)
      const gr = 0.03 - i * 0.006, gy = i === 0 ? -0.62 : -L * 0.55;
      p.add(cylGeo(0.004, 0.004, gr + 0.012, 4), STEEL, { y: gy, z: -(r0 + gr * 0.5), rx: Math.PI / 2 });
      p.add(torusGeo(gr, 0.005, Math.PI * 2, 3, 7), '#f4f7fa', { y: gy, z: -(r0 + gr * 1.3), rx: Math.PI / 2 });
      if (i === 3) p.add(cylGeo(0.009, 0.007, 0.06, 6), '#e0463c', { y: -L + 0.03 });                       // a red tip
    },
  },
  lucky: {
    L: [0.72, 0.55, 0.48, 0.42], r: [0.028, 0.022, 0.016, 0.011, 0.007], seg: 7, butt: 0.18,
    cols: ['#7a2e2a', '#80302b', '#86342e', '#8c3830'], rest: [[0, 0], [0, 0], [0, 0], [0, 0]],
    deco(p, i, L, r0) {
      const GOLD = '#e8b84a';
      if (i === 0) {
        p.add(cylGeo(0.037, 0.034, 0.34, 8), '#c9a26b', { y: -0.2 });                                       // a cork handle
        for (const y of [-0.1, -0.26]) p.add(cylGeo(0.0375, 0.0375, 0.01, 8), '#a9824e', { y });      // its rings
        p.add(S6(), GOLD, { y: 0.02, sx: 0.038, sy: 0.03, sz: 0.038 });                                    // a gold butt cap
        // a brass fly reel behind the fist, side on, with a crank knob
        p.add(cylGeo(0.012, 0.012, 0.06, 6), GOLD, { y: -0.03, z: -0.045, rx: Math.PI / 2 });
        p.add(cylGeo(0.075, 0.075, 0.035, 10), '#d9a63a', { y: -0.03, z: -0.105, rz: Math.PI / 2 });
        p.add(cylGeo(0.05, 0.05, 0.04, 8), '#7a2e2a', { y: -0.03, z: -0.105, rz: Math.PI / 2 });
        p.add(cylGeo(0.008, 0.008, 0.04, 5), GOLD, { x: 0.03, y: -0.06, z: -0.13, rz: Math.PI / 2 });
        p.add(S4(), '#f3e2b0', { x: 0.055, y: -0.06, z: -0.13, sx: 0.016, sy: 0.016, sz: 0.016 });
        // a four-leaf clover charm on a gold ring at the top of the handle
        p.add(torusGeo(0.014, 0.004, Math.PI * 2, 3, 6), GOLD, { x: 0.045, y: -0.39 });
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; p.add(S4(), '#3fae4a', { x: 0.045 + Math.cos(a) * 0.022, y: -0.44 + Math.sin(a) * 0.022, z: 0.006, sx: 0.019, sy: 0.019, sz: 0.007 }); }
      }
      p.add(cylGeo(r0 * 1.6, r0 * 1.6, 0.035, 7), GOLD, { y: -0.03 });                                       // gold thread wraps
      p.add(cylGeo(r0 * 1.5, r0 * 1.5, 0.012, 7), '#2b2340', { y: -0.055 });
      const gr = 0.026 - i * 0.005, gy = i === 0 ? -0.6 : -L * 0.55;                                         // gold guides
      p.add(cylGeo(0.004, 0.004, gr + 0.012, 4), GOLD, { y: gy, z: -(r0 + gr * 0.5), rx: Math.PI / 2 });
      p.add(torusGeo(gr, 0.0055, Math.PI * 2, 3, 7), GOLD, { y: gy, z: -(r0 + gr * 1.3), rx: Math.PI / 2 });
      if (i === 3) p.add(S4(), GOLD, { y: -L, sx: 0.013, sy: 0.016, sz: 0.013 });                            // a gold tip
    },
  },
};

export const POLE_LENGTH = id => { const s = POLE_SPEC[id] || POLE_SPEC.stick; return s.L.reduce((a, b) => a + b, 0); };

// Build a pole into a group (the right fist holds its origin). `tip` (an Object3D) is moved to the far end.
// Returns { group, joints, rest } for human.js (joints[i].rotation.x = rest[i][0] + bend).
export function buildPole(id, tip) {
  const s = POLE_SPEC[id] || POLE_SPEC.stick;
  const group = new THREE.Group(), joints = [], rest = [];
  let parent = group;
  for (let i = 0; i < s.L.length; i++) {
    const j = new THREE.Group();
    j.rotation.order = 'YXZ';
    j.position.y = i === 0 ? s.butt : -s.L[i - 1];
    j.rotation.set(s.rest[i][0], 0, s.rest[i][1]);
    rest.push(s.rest[i]);
    parent.add(j);
    const p = new Part();
    p.add(cylGeo(s.r[i], s.r[i + 1], s.L[i], s.seg), s.cols[i], { y: -s.L[i] / 2 });
    s.deco(p, i, s.L[i], s.r[i], s.r[i + 1]);
    j.add(p.build());
    joints.push(j);
    parent = j;
  }
  tip.position.set(0, -s.L[s.L.length - 1], 0);
  joints[joints.length - 1].add(tip);
  return { group, joints, rest };
}

// ------------------------------------------------------------------ lures

// How each one sits in the water: the tie point is lifted wetY above the water line, the lure tipped wetRx about x.
// glow: a night tip (a lamp-glow bead that brightens after dark, daynight.js); top: how far above the float's middle the line ties on.
export const LURE_FIT = {
  none:     { wetY: 0.3, wetRx: 0, ghost: '#ff5a4f', size: 0.24 },
  worms:    { wetY: 0.31, wetRx: 0, ghost: '#ff7a3a', size: 0.22 },
  crickets: { wetY: 0.21, wetRx: 0, ghost: '#ffd23f', size: 0.24 },
  spoon:    { wetY: 0.03, wetRx: Math.PI - 0.62, ghost: '#e6f2ff', size: 0.24, spin: 2.6 },
  frog:     { wetY: 0.155, wetRx: 0, ghost: '#7ddc6a', size: 0.24 },
};

function hook(p, y, k = 1) {     // a little silver hook hanging at y: the shank, the bend and the barb
  p.add(cylGeo(0.006 * k, 0.006 * k, 0.07 * k, 4), SILVER, { y: y + 0.035 * k });
  p.add(torusGeo(0.028 * k, 0.0065 * k, Math.PI * 1.15, 3, 6), SILVER, { x: 0.028 * k, y, rz: Math.PI });
  p.add(coneGeo(4), SILVER, { x: 0.055 * k, y: y + 0.012 * k, sx: 0.008 * k, sy: 0.024 * k, sz: 0.008 * k });
}
function snell(p, y0, y1) { p.add(cylGeo(0.005, 0.005, Math.abs(y1 - y0), 4), INK, { y: (y0 + y1) / 2 }); } // a bit of line between float and bait

const LURE_PARTS = {
  // the classic: red over white, a white stalk with a yellow bead on top, a bare hook below
  none(p) {
    const half = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    p.add(half, '#e0574f', { y: -0.3, sx: 0.17, sy: 0.17, sz: 0.17 });
    p.add(half, '#ffffff', { y: -0.3, sx: 0.17, sy: 0.17, sz: 0.17, rx: Math.PI });
    p.add(cylGeo(0.02, 0.02, 0.13, 6), '#ffffff', { y: -0.085 });
    p.add(sphere(8, 6), lampGlow('#ffe27a'), { y: -0.01, sx: 0.042, sy: 0.042, sz: 0.042 });
    snell(p, -0.46, -0.6);
    hook(p, -0.66, 1.3);
  },
  // worms: a tall, thin green pencil float with a white band and an orange tip, a pink worm wriggling on the hook
  worms(p) {
    p.add(cylGeo(0.06, 0.035, 0.3, 8), '#3fa34d', { y: -0.27 });
    p.add(coneGeo(8), '#3fa34d', { y: -0.465, sx: 0.035, sy: 0.09, sz: 0.035, rx: Math.PI });
    p.add(cylGeo(0.062, 0.062, 0.05, 8), '#ffffff', { y: -0.17 });
    p.add(cylGeo(0.05, 0.06, 0.1, 8), '#ff6a2a', { y: -0.075 });
    p.add(sphere(8, 6), lampGlow('#ffb347'), { y: -0.02, sx: 0.04, sy: 0.04, sz: 0.04 });
    snell(p, -0.5, -0.58);
    const W = [[0, -0.6], [0.035, -0.63], [0.05, -0.67], [0.03, -0.71], [-0.005, -0.735], [-0.04, -0.75], [-0.065, -0.78]];
    W.forEach(([x, y], k) => p.add(S4(), k === 2 ? '#e0607f' : '#ff8fb0', { x, y, sx: 0.034, sy: 0.034, sz: 0.034 }));
    p.add(S4(), '#ff8fb0', { x: 0.075, y: -0.6, sx: 0.03, sy: 0.026, sz: 0.03 });                             // the other end, flicking up
    p.add(S4(), '#ff8fb0', { x: 0.045, y: -0.6, sx: 0.034, sy: 0.03, sz: 0.034 });
    hook(p, -0.68, 1.1);
  },
  // crickets: a round bumblebee float (yellow, black stripes, little wings), a brown cricket with big hind legs below
  crickets(p) {
    p.add(S10(), '#f2c230', { y: -0.2, sx: 0.155, sy: 0.135, sz: 0.155 });
    p.add(cylGeo(0.152, 0.152, 0.035, 10, true), INK, { y: -0.16 });
    p.add(cylGeo(0.15, 0.15, 0.035, 10, true), INK, { y: -0.245 });
    for (const s of [-1, 1]) p.add(S4(), '#eef8ff', { x: s * 0.07, y: -0.07, z: -0.02, sx: 0.075, sy: 0.014, sz: 0.045, rz: s * 0.5 });
    p.add(cylGeo(0.012, 0.012, 0.06, 5), INK, { y: -0.04 });
    p.add(sphere(8, 6), lampGlow('#ffe27a'), { y: -0.005, sx: 0.034, sy: 0.034, sz: 0.034 });
    snell(p, -0.33, -0.5);
    const y = -0.56, B = '#7a5a2e', D = '#5a3f1e';
    p.add(S6(), B, { y, sx: 0.04, sy: 0.036, sz: 0.085 });
    p.add(S4(), D, { y: y + 0.01, z: 0.085, sx: 0.034, sy: 0.034, sz: 0.032 });
    for (const s of [-1, 1]) {
      p.add(S4(), D, { x: s * 0.05, y: y + 0.035, z: -0.03, sx: 0.016, sy: 0.016, sz: 0.075, rx: -0.6, ry: s * 0.25 });   // the big hind legs, folded up
      p.add(cylGeo(0.006, 0.004, 0.11, 4), D, { x: s * 0.06, y: y - 0.02, z: -0.08, rx: 0.9 });
      p.add(cylGeo(0.004, 0.004, 0.06, 4), D, { x: s * 0.03, y: y - 0.04, z: 0.04, rx: -0.3, rz: s * 0.4 });              // a front leg
      p.add(cylGeo(0.003, 0.003, 0.16, 3), D, { x: s * 0.03, y: y + 0.07, z: 0.15, rx: 0.9, rz: -s * 0.25 });             // the antennae
    }
    hook(p, y - 0.02, 1);
  },
  // the spoon: a big silver teardrop with a red stripe and a white glint, a split ring at the nose and a treble hook with a red tuft
  spoon(p) {
    p.add(torusGeo(0.022, 0.006, Math.PI * 2, 3, 6), STEEL, { y: -0.02 });
    p.add(S10(), SILVER, { y: -0.2, z: 0.006, sx: 0.09, sy: 0.17, sz: 0.026 });                              // the silver face
    p.add(S10(), '#e8b84a', { y: -0.2, z: -0.012, sx: 0.088, sy: 0.168, sz: 0.024 });                        // a gold back
    p.add(S6(), '#e0463c', { y: -0.2, z: 0.026, sx: 0.024, sy: 0.12, sz: 0.012 });                             // a red stripe
    p.add(S4(), '#ffffff', { x: 0.036, y: -0.14, z: 0.03, sx: 0.016, sy: 0.05, sz: 0.008, rz: 0.3 });          // a glint
    p.add(cylGeo(0.005, 0.005, 0.05, 4), STEEL, { y: -0.385 });
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3;
      p.add(torusGeo(0.022, 0.005, Math.PI * 1.1, 3, 5), STEEL, { x: Math.sin(a) * 0.022, z: Math.cos(a) * 0.022, y: -0.42, ry: a + Math.PI / 2, rz: Math.PI });
    }
    p.add(coneGeo(6), '#e0463c', { y: -0.41, sx: 0.035, sy: 0.07, sz: 0.035, rx: Math.PI });
  },
  // the rubber frog: green, a cream belly, big eyes on top, legs splayed, a hook sticking out of its bottom
  frog(p) {
    const G = '#5cc05a', DG = '#3f9a45';
    p.add(S10(), G, { y: -0.1, sx: 0.13, sy: 0.085, sz: 0.15 });
    p.add(S6(), '#e8f0a0', { y: -0.13, z: 0.01, sx: 0.115, sy: 0.06, sz: 0.13 });
    p.add(S6(), G, { y: -0.07, z: 0.1, sx: 0.1, sy: 0.07, sz: 0.08 });
    for (const s of [-1, 1]) {
      p.add(S6(), G, { x: s * 0.055, y: -0.02, z: 0.1, sx: 0.045, sy: 0.045, sz: 0.045 });
      p.add(S4(), '#ffffff', { x: s * 0.058, y: -0.015, z: 0.13, sx: 0.03, sy: 0.032, sz: 0.022 });
      p.add(S4(), INK, { x: s * 0.06, y: -0.012, z: 0.148, sx: 0.016, sy: 0.02, sz: 0.01 });
      p.add(S4(), '#ff9aa8', { x: s * 0.075, y: -0.075, z: 0.15, sx: 0.022, sy: 0.012, sz: 0.01 });          // pink cheeks
      p.add(S4(), DG, { x: s * 0.12, y: -0.13, z: -0.05, sx: 0.045, sy: 0.04, sz: 0.1, ry: s * 0.4 });           // folded back legs
      p.add(S4(), DG, { x: s * 0.17, y: -0.175, z: 0.02, sx: 0.055, sy: 0.012, sz: 0.05 });                     // big flat feet
      p.add(S4(), DG, { x: s * 0.08, y: -0.16, z: 0.13, sx: 0.022, sy: 0.05, sz: 0.022, rz: s * 0.4 });         // front legs
    }
    p.add(torusGeo(0.04, 0.0075, Math.PI * 1.15, 3, 6), SILVER, { y: -0.15, z: -0.17, ry: Math.PI / 2, rz: Math.PI * 0.5 });
    p.add(torusGeo(0.018, 0.005, Math.PI * 2, 3, 6), STEEL, { y: 0.0, z: 0.0 });
    p.add(sphere(6, 4), lampGlow('#ffe27a'), { y: -0.012, z: -0.02, sx: 0.03, sy: 0.03, sz: 0.03 });   // a night bead where the line ties on
  },
};

const lureCache = new Map();   // id -> [{ geometry, material }]
function lureSrc(id) {
  let src = lureCache.get(id);
  if (!src) {
    const p = new Part();
    (LURE_PARTS[id] || LURE_PARTS.none)(p);
    const g = p.build();
    src = g.children.map(m => ({ geometry: m.geometry, material: m.material }));
    lureCache.set(id, src);
  }
  return src;
}

// A new lure: a group (the tie point) holding a pivot (tipped when it sits on the water) of shared meshes.
export function buildLure(id) {
  const group = new THREE.Group(), pivot = new THREE.Group();
  group.add(pivot);
  for (const s of lureSrc(id)) {
    const m = new THREE.Mesh(s.geometry, s.material);
    m.userData.shared = true;          // the geometry belongs to the cache: never dispose it with a person's rod
    m.castShadow = true;
    pivot.add(m);
  }
  group.userData = { lure: id, pivot };
  return group;
}

// The bit of line that hangs from the rod tip while the rod is in hand, the lure on its end. The line is owned by the
// rod (disposed with it), the lure is shared. human.js keeps it hanging straight down and swinging.
export const DANGLE = 0.42;
const DANGLE_GEO = new THREE.CylinderGeometry(1, 1, 1, 4).translate(0, -0.5, 0);
const lineMats = new Map();
export const lineMat = color => { let m = lineMats.get(color); if (!m) lineMats.set(color, m = new THREE.MeshBasicMaterial({ color })); return m; };
export function buildDangle(id, pole) {
  const g = new THREE.Group();
  const P = poleOf(pole), r = Math.max(0.006, P.lineR * 0.55);
  const line = new THREE.Mesh(DANGLE_GEO, lineMat(P.line));
  line.userData.shared = true;
  line.scale.set(r, DANGLE, r);
  const lure = buildLure(id);
  lure.position.y = -DANGLE;
  lure.scale.setScalar(0.62);     // in hand it is nearer life size; on the water the line rig blows it up for the follow camera
  g.add(line, lure);
  g.userData = { line, lure, spin: (LURE_FIT[id] || LURE_FIT.none).spin || 0 };   // the spoon twirls on its line; the rest turn a little to and fro
  return g;
}
