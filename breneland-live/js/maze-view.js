// Beneath Angell Street: the view below on a tall screen. An upright phone with 70 degrees up and down only sees 36 across, so
// corridors become slots. On a tall screen the view is set by its width instead (about 80 across). A wide screen keeps 70 up and
// down, no fish-eye on a PC. The lantern and hand sit lower, to the right and a bit smaller there (the grip itself is maze-hand.js's).
const D2R = Math.PI / 180;
export const VIEW = { fov: 70, wideAcross: 80, hand: { d: 0.62, x: 0.36, y: -0.3, k: 0.6 } };

// the vertical field of view (degrees) for this aspect: 70, or wider when the screen is tall enough that 70 would be under ~80 across
export function mazeFov(aspect) {
  const v = 2 * Math.atan(Math.tan(VIEW.wideAcross * D2R / 2) / Math.max(0.2, aspect)) / D2R;
  return Math.max(VIEW.fov, Math.round(v * 10) / 10);
}
// the horizontal field of view (degrees) a camera sees
export const acrossOf = cam => 2 * Math.atan(Math.tan(cam.fov * D2R / 2) * cam.aspect) / D2R;

// where the hand (its origin is the grip) sits in front of the camera on a tall screen, and its scale. Placed in screen terms (x right,
// y up, -1..1 at the hand's distance) so a wider view doesn't shrink it to a speck. out: { x, y, z, s }
export function tallHand(cam, out) {
  const h = VIEW.hand, hh = h.d * Math.tan(cam.fov * D2R / 2), hw = hh * cam.aspect;
  out.x = hw * h.x; out.y = hh * h.y; out.z = -h.d;
  out.s = Math.round(0.72 * hh / 0.434 * h.k * 1000) / 1000; // 0.72 at 70 degrees, where hh was 0.434, times k to go a bit smaller
  return out;
}
