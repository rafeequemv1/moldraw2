/** Minimal 3D vector math for the native conformer engine. Å units throughout. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

export const length = (a: Vec3): number => Math.sqrt(dot(a, a));

export const normalize = (a: Vec3): Vec3 => {
  const len = length(a);
  return len < 1e-9 ? v(0, 0, 0) : scale(a, 1 / len);
};

export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));

/** Any unit vector orthogonal to `a` (stable regardless of `a`'s direction). */
export const anyPerpendicular = (a: Vec3): Vec3 => {
  const ref = Math.abs(a.x) < 0.9 ? v(1, 0, 0) : v(0, 1, 0);
  return normalize(cross(a, ref));
};

/**
 * Natural Extension Reference Frame (NeRF) placement: given three placed atoms
 * a-b-c, position a new atom d at bond length `bond` from c, making bond angle
 * `angle` (radians) with b-c, and dihedral `dihedral` (radians) about b-c.
 *
 * This is the standard internal-coordinate → Cartesian step used to build 3D
 * structures atom by atom.
 */
export const placeNeRF = (
  a: Vec3,
  b: Vec3,
  c: Vec3,
  bond: number,
  angle: number,
  dihedral: number,
): Vec3 => {
  const bc = normalize(sub(c, b));
  const n = normalize(cross(sub(b, a), bc));
  const m = cross(n, bc);

  const d2 = {
    x: -bond * Math.cos(angle),
    y: bond * Math.sin(angle) * Math.cos(dihedral),
    z: bond * Math.sin(angle) * Math.sin(dihedral),
  };

  return {
    x: c.x + bc.x * d2.x + m.x * d2.y + n.x * d2.z,
    y: c.y + bc.y * d2.x + m.y * d2.y + n.y * d2.z,
    z: c.z + bc.z * d2.x + m.z * d2.y + n.z * d2.z,
  };
};

/**
 * Place `d` from only two references b-c (no dihedral frame yet). Puts d in the
 * plane containing b-c using a stable perpendicular, at the given bond/angle.
 */
export const placeFromTwo = (b: Vec3, c: Vec3, bond: number, angle: number): Vec3 => {
  const bc = normalize(sub(c, b));
  const perp = anyPerpendicular(bc);
  const dir = normalize(add(scale(bc, -Math.cos(angle)), scale(perp, Math.sin(angle))));
  return add(c, scale(dir, bond));
};
