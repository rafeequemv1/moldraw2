/**
 * Perceive bonds from 3D (or 2D) coordinates using covalent radii.
 * Used by XYZ import (XYZ has no connectivity).
 *
 * 1. Connect atoms within a covalent-radius cutoff (singles).
 * 2. Upgrade to double/triple by distance vs {@link targetBondLengthA},
 *    greedily, without exceeding max valency (OpenBabel-style).
 */
import { covalentRadius, targetBondLengthA } from '../chemistry/atomicData';
import { getMaxValencyForElement, isCoordinationMetal } from '@moldraw/domain';
import type { MolblockAtomRow, MolblockBondRow } from './buildV2000Molblock';

/** OpenBabel-like scale on (r_a + r_b). Metals get a looser factor. */
const TOLERANCE_ORGANIC = 1.32;
const TOLERANCE_METAL = 1.55;
const MIN_DIST_A = 0.35;

const isH = (el: string): boolean => el === 'H' || el === 'D';
const isHalogen = (el: string): boolean =>
  el === 'F' || el === 'Cl' || el === 'Br' || el === 'I';

/**
 * Desired bond order from interatomic distance (1 / 2 / 3).
 * H–, halogen–, and metal– bonds stay single (coordination / terminal).
 */
const desiredOrderFromDistance = (
  elA: string,
  elB: string,
  dist: number,
): 1 | 2 | 3 => {
  if (isH(elA) || isH(elB)) return 1;
  if (isHalogen(elA) || isHalogen(elB)) return 1;
  if (isCoordinationMetal(elA) || isCoordinationMetal(elB)) return 1;

  const t1 = targetBondLengthA(elA, elB, 1);
  const t2 = targetBondLengthA(elA, elB, 2);
  const t3 = targetBondLengthA(elA, elB, 3);
  let best: 1 | 2 | 3 = 1;
  let bestErr = Math.abs(dist - t1);
  const e2 = Math.abs(dist - t2);
  if (e2 < bestErr) {
    best = 2;
    bestErr = e2;
  }
  const e3 = Math.abs(dist - t3);
  if (e3 < bestErr) {
    best = 3;
  }
  return best;
};

/**
 * Return 0-based bonds with perceived orders for atoms with Å coordinates.
 * Skips H–H; uses a looser cutoff when either atom is a metal.
 */
export const perceiveBondsFromAtomRows = (atoms: MolblockAtomRow[]): MolblockBondRow[] => {
  const n = atoms.length;
  if (n < 2) return [];

  type Edge = {
    from: number;
    to: number;
    dist: number;
    order: number;
    desired: 1 | 2 | 3;
  };

  const edges: Edge[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < n; i++) {
    const a = atoms[i]!;
    const ra = covalentRadius(a.element);
    const aMetal = isCoordinationMetal(a.element);
    for (let j = i + 1; j < n; j++) {
      const b = atoms[j]!;
      // Free H₂ is rare in XYZ of organics; skip H–H to avoid noise.
      if (isH(a.element) && isH(b.element)) continue;

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = (a.z ?? 0) - (b.z ?? 0);
      const dist = Math.hypot(dx, dy, dz);
      if (dist < MIN_DIST_A) continue;

      const rb = covalentRadius(b.element);
      const tol =
        aMetal || isCoordinationMetal(b.element) ? TOLERANCE_METAL : TOLERANCE_ORGANIC;
      const maxDist = (ra + rb) * tol;
      if (dist > maxDist) continue;

      const key = `${i}-${j}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const desired = desiredOrderFromDistance(a.element, b.element, dist);
      edges.push({ from: i, to: j, dist, order: 1, desired });
    }
  }

  // Greedy upgrade: strongest multiple-bond evidence first (shortest vs single target).
  const upgrades = edges
    .map((e, idx) => ({ idx, e }))
    .filter(({ e }) => e.desired > 1)
    .sort((A, B) => {
      const a = A.e;
      const b = B.e;
      const singleA = targetBondLengthA(atoms[a.from]!.element, atoms[a.to]!.element, 1);
      const singleB = targetBondLengthA(atoms[b.from]!.element, atoms[b.to]!.element, 1);
      // Larger (single − dist) ⇒ more compressed ⇒ prefer upgrade first.
      return singleB - b.dist - (singleA - a.dist);
    });

  const used = new Array<number>(n).fill(0);
  for (const e of edges) {
    used[e.from]! += e.order;
    used[e.to]! += e.order;
  }

  const maxV = (i: number): number =>
    getMaxValencyForElement(atoms[i]!.element, 0);

  for (const { e } of upgrades) {
    while (e.order < e.desired) {
      if (used[e.from]! + 1 > maxV(e.from) || used[e.to]! + 1 > maxV(e.to)) {
        break;
      }
      e.order += 1;
      used[e.from]! += 1;
      used[e.to]! += 1;
    }
  }

  return edges.map(e => ({ from: e.from, to: e.to, order: e.order }));
};
