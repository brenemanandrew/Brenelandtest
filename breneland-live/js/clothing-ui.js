// What Peak Threads (clothing-store.js) and the wardrobe at home (wardrobe.js) share: the icons (fish, mirror, the kinds), putting a
// look the server confirmed onto yourself (and telling everyone), the mirror camera (you stand still and see yourself from in front,
// turning with A / D, the left stick or the turn buttons), and the pictures of you wearing a piece (avatar-tiles.js, drawn on your
// own character). Everything a player sees goes in through textContent; the icons are constant SVG.
import * as THREE from 'three';
import { el } from './util.js';
import { createTiles } from './avatar-tiles.js';
import { SLOT_KEY, KINDS } from './clothing-catalog.js';
import { avatarLook } from './human.js';

const INK = '#2b2340';
export const ICON = {
  fish: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 32 q14 -18 32 -14 q10 2 18 14 q-8 12 -18 14 q-18 4 -32 -14z" fill="#7fc4f0" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M56 32 l8 -10 v20z" fill="#5aa6d8" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><circle cx="20" cy="28" r="3" fill="${INK}"/><path d="M28 24 q6 -6 12 -2" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  mirror: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="16" y="6" width="32" height="46" rx="14" fill="#cfe6f2" stroke="${INK}" stroke-width="4"/><path d="M24 40 L40 16" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M22 56 h20" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M32 52 v4" stroke="${INK}" stroke-width="4"/></svg>`,
  check: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 34 l14 13 l26 -30" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  close: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M18 18 L46 46 M46 18 L18 46" stroke="${INK}" stroke-width="6" stroke-linecap="round"/></svg>`,
  left: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M40 12 L20 32 L40 52" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  right: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M24 12 L44 32 L24 52" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  none: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="32" cy="32" r="22" fill="none" stroke="${INK}" stroke-width="5"/><path d="M18 46 L46 18" stroke="${INK}" stroke-width="5" stroke-linecap="round"/></svg>`,
  hat: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M16 38 q0 -22 16 -22 q16 0 16 22z" fill="#c7392f" stroke="${INK}" stroke-width="4"/><rect x="8" y="36" width="48" height="10" rx="5" fill="#f1e5d0" stroke="${INK}" stroke-width="4"/></svg>`,
  top: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M22 10 h20 l14 10 l-6 10 l-6 -4 v28 H20 V26 l-6 4 l-6 -10z" fill="#3fa09a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/></svg>`,
  bot: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M18 10 h28 l2 44 h-12 l-4 -26 l-4 26 H16z" fill="#3f5f8f" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/></svg>`,
  shoe: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 40 q8 -4 14 -14 q6 4 14 6 q12 2 16 10 v6 H10z" fill="#c7392f" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M10 48 h44" stroke="#fff" stroke-width="4"/></svg>`,
  acc: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="20" cy="34" r="10" fill="#cfe6f2" stroke="${INK}" stroke-width="4"/><circle cx="44" cy="34" r="10" fill="#cfe6f2" stroke="${INK}" stroke-width="4"/><path d="M30 34 h4 M8 30 l4 2 M56 30 l-4 2" stroke="${INK}" stroke-width="4" stroke-linecap="round"/></svg>`,
};
export const KIND_LABEL = { hat: 'Hats', top: 'Tops', bot: 'Bottoms', shoe: 'Shoes', acc: 'Extras' };
export function icon(name, cls = 'cl-ic') { const s = el('span', cls); s.innerHTML = ICON[name] || ''; return s; } // (constant markup, never a player's text)
export function iconBtn(name, label, cls = '') { const b = el('button', 'cl-btn ' + cls, '', { type: 'button', 'aria-label': label, title: label }); b.append(icon(name)); return b; }

/** A profile copy wearing `patch` ({ wTop: id } or { wTop: null }) over the player's look (a picture, a try-on). */
export function lookWith(profile, patch) {
  const look = { ...(profile.look || {}) };
  for (const [k, v] of Object.entries(patch)) { if (v) look[k] = v; else delete look[k]; }
  return { ...profile, look };
}
/** The look the server confirmed (cl-buy / cl-wear replies carry `look`): on yourself, saved, and told to everyone. */
export function applyLook(ctx, look) {
  const { profile, player, net, store } = ctx;
  const next = { ...(profile.look || {}) };
  for (const k of KINDS) { const key = SLOT_KEY[k]; if (look && look[key]) next[key] = look[key]; else delete next[key]; }
  profile.look = next;
  player.setProfile({ ...profile });
  ctx.refreshTag?.();
  if (!ctx.accounts?.guest) store.set('profile', profile);
  net.updateProfile(profile);
}

/** Try a look on yourself only (nothing sent, nothing saved): the fitting room's mirror. `restore()` puts your own look back. */
export function previewLook(ctx, patch) {
  const { profile, player } = ctx;
  player.setProfile(lookWith(profile, patch));
  ctx.refreshTag?.();
}
export function restoreLook(ctx) { ctx.player.setProfile({ ...ctx.profile }); ctx.refreshTag?.(); }

/** Stand still at `at` ({ x, z, yaw }) and see yourself from `cam` ([x, y, z], the mirror): a player takeover. A / D, the left and
 * right arrows, the left stick or `turn(dir)` turn you on the spot. Returns { end(), turn(dir) }. */
export function mirrorTakeover(ctx, at, cam) {
  const { player } = ctx;
  let yaw = at.yaw, spin = 0;
  const look = new THREE.Vector3();
  player.place(at.x, at.z, yaw);
  const to = {
    anim: 'idle', mirror: true,
    update(dt, now, input, pl) {
      const mv = input.move?.() || { x: 0, y: 0 };
      let turn = -mv.x;
      if (input.down.has('KeyA') || input.down.has('ArrowLeft')) turn += 1;
      if (input.down.has('KeyD') || input.down.has('ArrowRight')) turn -= 1;
      spin += (Math.max(-1, Math.min(1, turn)) * 2.6 - spin) * Math.min(1, dt * 8);
      yaw += spin * dt;
      pl.pos.set(at.x, pl.pos.y, at.z); pl.yaw = yaw;
      if (!pl.character.root.visible) pl.character.root.visible = true; // (first person indoors hides you: in a mirror you are seen)
    },
    camera(dt, camera) {
      camera.position.set(cam[0], cam[1], cam[2]);
      look.set(player.pos.x, player.pos.y + 0.95, player.pos.z);
      camera.lookAt(look);
      return true;
    },
  };
  player.takeover = to;
  return {
    end() { if (player.takeover === to) { player.takeover = null; player.snapCameraBehind(); } },
    turn(dir) { yaw += dir * 0.6; },
    get yaw() { return yaw; },
    active: () => player.takeover === to,
  };
}

/** Pictures of you wearing things (avatar-tiles.js): `request(patch, frame, node)` fills `node` with the canvas when it is drawn;
 * call `pump()` every frame while a panel is open. frame: 'head' (hats, glasses) | 'torso' (tops, bags) | 'body' (the rest). */
export function makeTiles(ctx) {
  let tiles = null;
  const get = () => (tiles ||= createTiles(() => ctx.renderer));
  return {
    request(patch, frame, node) {
      node.replaceChildren();
      const prof = lookWith(ctx.profile, patch);
      prof.rawLook = avatarLook(prof); // (the tile's cache key is the whole look: a head picture changes with the hat worn)
      prof.yaw = frame === 'head' ? 0.3 : 0.45;
      get().request(prof, frame, cv => { const c = cv.cloneNode(); c.getContext('2d').drawImage(cv, 0, 0); node.replaceChildren(c); }, node);
    },
    pump(ms = 5) { if (tiles) tiles.pump(ms); },
    cancel() { tiles?.cancel(); },
    get waiting() { return tiles ? tiles.waiting : 0; },
  };
}
export const frameOf = kind => (kind === 'hat' || (kind === 'acc' && true) ? 'head' : kind === 'top' ? 'torso' : 'body');
export const frameFor = piece => (piece.kind === 'hat' || (piece.kind === 'acc' && piece.where === 'head') ? 'head' : piece.kind === 'top' || piece.kind === 'acc' ? 'torso' : 'body');
