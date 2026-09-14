/**
 * Angle and distance primitives used by canvas hit-testing and rotation logic.
 */

/** Normalize an angle to [0, 2π). */
export const angle0To2Pi = (a: number): number => {
  let t = a % (2 * Math.PI);
  if (t < 0) t += 2 * Math.PI;
  return t;
};

/** Snap `rad` to the nearest multiple of `stepRad` (e.g. bond-direction increments). */
export const snapAngleToStepRad = (rad: number, stepRad: number): number => {
  if (stepRad < 1e-9) return rad;
  return Math.round(rad / stepRad) * stepRad;
};

/** Shortest signed angle from `from` to `to` in radians. Result is in (-π, π]. */
export const shortestAngleDiff = (from: number, to: number): number => {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

/**
 * Keeps segment length from `(x1,y1)` to `(x2,y2)` and snaps direction to the
 * nearest multiple of `stepDeg` (e.g. 15° → horizontal, vertical, diagonals).
 */
export const snapSegmentEndpointToAngleStep = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stepDeg: number,
): { x2: number; y2: number } => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x2, y2 };
  const stepRad = (stepDeg * Math.PI) / 180;
  const ang = Math.atan2(dy, dx);
  const snapped = Math.round(ang / stepRad) * stepRad;
  return {
    x2: x1 + Math.cos(snapped) * len,
    y2: y1 + Math.sin(snapped) * len,
  };
};

/** Distance from point (px,py) to the line segment (x1,y1)-(x2,y2). */
export const pointSegDist = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
};
