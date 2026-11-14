// Fitting a camera round a few points (a body sitting or lying, and whoever is beside it) so all of them are in the picture.
// Pure maths, no THREE, no allocation per call: house-rest.js frames you on the sofa or the bed with it, the camera-view test
// checks it in Node.
//
// The camera looks at a target from the direction (yaw, pitch): dir = (sin yaw cos pitch, sin pitch, cos yaw cos pitch) is the
// way from the target to the camera (player.js's convention), so the camera is target + dir * d. For a point q (relative to
// the target) its sideways x, its upward y and its depth z = d + q.fwd in the camera's frame have to satisfy |x| + r <= tanH z
// and |y| + r <= tanV z: so d >= (|x| + r) / tanH - q.fwd and the same for y. The largest of those is the nearest distance
// that holds every point (spheres of radius r round each).

// fitDist(pts, n, tx, ty, tz, yaw, pitch, tanV, tanH, r, near) -> the nearest d that frames every point. pts = [x, y, z, ...]
export function fitDist(pts, n, tx, ty, tz, yaw, pitch, tanV, tanH, r = 0, near = 0.3) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
  // fwd = -dir; right = fwd x up (normalised: (cy, 0, -sy)); up' = right x fwd
  const fx = -sy * cp, fy = -sp, fz = -cy * cp;
  const rx = cy, rz = -sy;                            // (ry = 0)
  const ux = -sp * sy, uy = cp, uz = -sp * cy;        // right x fwd
  let d = near;
  for (let i = 0; i < n; i++) {
    const qx = pts[i * 3] - tx, qy = pts[i * 3 + 1] - ty, qz = pts[i * 3 + 2] - tz;
    const x = Math.abs(qx * rx + qz * rz) + r, y = Math.abs(qx * ux + qy * uy + qz * uz) + r, f = qx * fx + qy * fy + qz * fz;
    const need = Math.max(x / tanH, y / tanV, near) - f;
    if (need > d) d = need;
  }
  return d;
}

// How much of the picture's height the points take from (yaw, pitch, d): 0..1+ (the test's "readable size", and a tie-breaker)
export function heightShare(pts, n, tx, ty, tz, yaw, pitch, d, tanV) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
  const fx = -sy * cp, fy = -sp, fz = -cy * cp, ux = -sp * sy, uy = cp, uz = -sp * cy;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const qx = pts[i * 3] - tx, qy = pts[i * 3 + 1] - ty, qz = pts[i * 3 + 2] - tz;
    const z = Math.max(0.05, d + qx * fx + qy * fy + qz * fz), y = (qx * ux + qy * uy + qz * uz) / (z * tanV);
    if (y < lo) lo = y; if (y > hi) hi = y;
  }
  return (hi - lo) / 2;
}

// Where the points' projected middle sits from (yaw, pitch, d), as tangents off the view's centre: [x (right), y (up)]. Aiming that
// much further along right / up (times d) centres them (perspective makes the middle of a box not the middle of its picture).
const _c = [0, 0];
export function centreOff(pts, n, tx, ty, tz, yaw, pitch, d) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
  const fx = -sy * cp, fy = -sp, fz = -cy * cp, rx = cy, rz = -sy, ux = -sp * sy, uy = cp, uz = -sp * cy;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const qx = pts[i * 3] - tx, qy = pts[i * 3 + 1] - ty, qz = pts[i * 3 + 2] - tz, z = Math.max(0.05, d + qx * fx + qy * fy + qz * fz);
    const x = (qx * rx + qz * rz) / z, y = (qx * ux + qy * uy + qz * uz) / z;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  _c[0] = (x0 + x1) / 2; _c[1] = (y0 + y1) / 2;
  return _c;
}
