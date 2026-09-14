/**
 * VSEPR hydrogen placement for 3D conformers.
 *
 * Completes tetrahedral / trigonal / linear geometry around a heavy atom given
 * its existing heavy-neighbor bond directions and perceived hybridization.
 */
import { targetBondLengthA } from '@moldraw/core/chemistry/atomicData';
import { add, cross, dot, length, normalize, scale, sub, v, type Vec3 } from './vec';
import type { Hybridization } from './hybridization';

const H_BOND_TARGET: Record<string, number> = {};

export const hBondLength = (element: string): number => {
  if (H_BOND_TARGET[element] === undefined) {
    H_BOND_TARGET[element] = targetBondLengthA(element, 'H', 1);
  }
  return H_BOND_TARGET[element];
};

/** Rodrigues rotation of vector `vec` about unit axis through origin. */
const rotateVecAboutAxis = (vec: Vec3, axis: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const term1 = scale(vec, c);
  const term2 = scale(cross(axis, vec), s);
  const term3 = scale(axis, dot(axis, vec) * (1 - c));
  return add(add(term1, term2), term3);
};

const perpTo = (a: Vec3): Vec3 => {
  const ref = Math.abs(a.x) < 0.9 ? v(1, 0, 0) : v(0, 1, 0);
  return normalize(cross(a, ref));
};

/**
 * Place explicit hydrogens with VSEPR geometry (tetrahedral / trigonal / linear)
 * instead of a flat fan around the "away" vector.
 */
export const placeHydrogensVsepr = (
  center: Vec3,
  heavyNeighborPositions: Vec3[],
  count: number,
  element: string,
  hybrid: Hybridization,
): Vec3[] => {
  if (count <= 0) return [];
  const r = hBondLength(element);
  const bondDirs = heavyNeighborPositions.map(p => normalize(sub(p, center)));
  const n = bondDirs.length;
  const TET = (109.471 * Math.PI) / 180;
  const TRIG = (120 * Math.PI) / 180;

  const toWorld = (dir: Vec3): Vec3 => add(center, scale(normalize(dir), r));

  if (hybrid === 'sp') {
    const axis = n > 0 ? scale(bondDirs[0]!, -1) : v(1, 0, 0);
    return Array.from({ length: count }, () => toWorld(axis));
  }

  if (hybrid === 'sp2') {
    let normal = v(0, 0, 1);
    if (n >= 2) {
      const cr = cross(bondDirs[0]!, bondDirs[1]!);
      if (length(cr) > 1e-3) normal = normalize(cr);
    } else if (n === 1) {
      normal = perpTo(bondDirs[0]!);
    }
    let sum = v(0, 0, 0);
    for (const d of bondDirs) sum = add(sum, d);
    let away = length(sum) > 1e-3 ? scale(sum, -1) : cross(normal, bondDirs[0] ?? v(1, 0, 0));
    away = sub(away, scale(normal, dot(away, normal)));
    if (length(away) < 1e-3) away = cross(normal, bondDirs[0] ?? v(1, 0, 0));
    away = normalize(away);
    if (count === 1) return [toWorld(away)];
    const spread = TRIG;
    return Array.from({ length: count }, (_, k) => {
      const ang = (k - (count - 1) / 2) * spread;
      return toWorld(rotateVecAboutAxis(away, normal, ang));
    });
  }

  // sp³ — complete a tetrahedron around existing heavy bonds.
  if (n === 0) {
    const tetVerts = [v(1, 1, 1), v(1, -1, -1), v(-1, 1, -1), v(-1, -1, 1)].map(normalize);
    return tetVerts.slice(0, count).map(toWorld);
  }
  if (n === 1) {
    const u = bondDirs[0]!;
    const ref = perpTo(u);
    return Array.from({ length: count }, (_, k) => {
      const ang = k * ((2 * Math.PI) / count);
      const inPlane = rotateVecAboutAxis(ref, u, ang);
      const dir = add(scale(u, Math.cos(TET)), scale(inPlane, Math.sin(TET)));
      return toWorld(dir);
    });
  }
  if (n === 2) {
    const u = bondDirs[0]!;
    const v2 = bondDirs[1]!;
    const bis = normalize(add(u, v2));
    const cosHalf = dot(bis, u);
    if (Math.abs(cosHalf) < 1e-3) {
      const perp = perpTo(u);
      return count === 1
        ? [toWorld(perp)]
        : [toWorld(perp), toWorld(scale(perp, -1))].slice(0, count);
    }
    const along = 1 / (3 * cosHalf);
    const outPlane = Math.sqrt(Math.max(0, 1 - along * along));
    let perp = cross(bis, sub(u, v2));
    if (length(perp) < 1e-3) perp = perpTo(bis);
    perp = normalize(perp);
    const h1 = add(scale(bis, -along), scale(perp, outPlane));
    const h2 = add(scale(bis, -along), scale(perp, -outPlane));
    if (count === 1) return [toWorld(normalize(h1))];
    return [toWorld(h1), toWorld(h2)].slice(0, count);
  }
  // three heavy neighbors (≈CH): one H opposite their centroid
  let sum = v(0, 0, 0);
  for (const d of bondDirs) sum = add(sum, d);
  return [toWorld(scale(sum, -1))].slice(0, count);
};
