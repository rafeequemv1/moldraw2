import type { Atom, Bond, Molecule } from '@moldraw/domain';
import type { Point } from '../geometry';

export const ATOM_HIT_RADIUS = 15;
export const BOND_HIT_TOLERANCE = 10;

/** Returns the atom whose center is within `radius` of `worldPos`, if any. */
export const pickAtomAt = (
  molecule: Molecule,
  worldPos: Point,
  radius = ATOM_HIT_RADIUS,
): Atom | null => {
  return (
    molecule.atoms.find(a => Math.hypot(a.x - worldPos.x, a.y - worldPos.y) < radius) ?? null
  );
};

/**
 * Bond-tool pointer routing: if a click lies on a bond segment *and* inside an
 * atom disk (common on short bonds), prefer the bond when the closest point on
 * the segment is not near an endpoint — so 1→2→3 cycling hits the shaft;
 * near endpoints, atoms win so drawing from an atom still works.
 */
export function pickAtomOrBondForBondTool(
  molecule: Molecule,
  worldPos: Point,
  atomRadius = ATOM_HIT_RADIUS,
  bondTol = BOND_HIT_TOLERANCE,
): { atom: Atom | null; bond: Bond | null } {
  const atom = pickAtomAt(molecule, worldPos, atomRadius);
  const bond = pickBondAt(molecule, worldPos, bondTol);
  if (!bond) return { atom, bond: null };
  if (!atom) return { atom: null, bond };

  const a1 = molecule.atoms.find(a => a.id === bond.fromAtomId);
  const a2 = molecule.atoms.find(a => a.id === bond.toAtomId);
  if (!a1 || !a2) return { atom, bond: null };

  const l2 = (a1.x - a2.x) ** 2 + (a1.y - a2.y) ** 2;
  if (l2 < 1e-12) return { atom, bond: null };

  let t = ((worldPos.x - a1.x) * (a2.x - a1.x) + (worldPos.y - a1.y) * (a2.y - a1.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const bondLen = Math.sqrt(l2);
  const distAlongFromNearestEnd = Math.min(t * bondLen, (1 - t) * bondLen);

  const endpointZonePx = Math.min(atomRadius + 3, bondLen * 0.34);

  if (distAlongFromNearestEnd <= endpointZonePx) {
    return { atom, bond: null };
  }
  return { atom: null, bond };
}

/** Returns the bond whose closest point on its segment is within `tol` of `worldPos`. */
export const pickBondAt = (
  molecule: Molecule,
  worldPos: Point,
  tol = BOND_HIT_TOLERANCE,
): Bond | null => {
  let best: Bond | null = null;
  let bestDist = tol;
  for (const b of molecule.bonds) {
    const a1 = molecule.atoms.find(a => a.id === b.fromAtomId);
    const a2 = molecule.atoms.find(a => a.id === b.toAtomId);
    if (!a1 || !a2) continue;
    const l2 = (a1.x - a2.x) ** 2 + (a1.y - a2.y) ** 2;
    if (l2 === 0) continue;
    let t = ((worldPos.x - a1.x) * (a2.x - a1.x) + (worldPos.y - a1.y) * (a2.y - a1.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = a1.x + t * (a2.x - a1.x);
    const projY = a1.y + t * (a2.y - a1.y);
    const d = Math.hypot(worldPos.x - projX, worldPos.y - projY);
    if (d < bestDist) {
      bestDist = d;
      best = b;
    }
  }
  return best;
};

/**
 * Ring-tool hit routing: prefer a bond mid-shaft for side-to-side fusion.
 * Near endpoints, atoms win so "click atom + drag" still attaches via a bond.
 */
export function pickAtomOrBondForRingTool(
  molecule: Molecule,
  worldPos: Point,
  atomRadius = ATOM_HIT_RADIUS,
  bondTol = BOND_HIT_TOLERANCE + 4,
): { atom: Atom | null; bond: Bond | null } {
  const atom = pickAtomAt(molecule, worldPos, atomRadius);
  const bond = pickBondAt(molecule, worldPos, bondTol);
  if (!bond) return { atom, bond: null };
  if (!atom) return { atom: null, bond };

  const a1 = molecule.atoms.find(a => a.id === bond.fromAtomId);
  const a2 = molecule.atoms.find(a => a.id === bond.toAtomId);
  if (!a1 || !a2) return { atom, bond: null };

  const l2 = (a1.x - a2.x) ** 2 + (a1.y - a2.y) ** 2;
  if (l2 < 1e-12) return { atom, bond: null };

  let t = ((worldPos.x - a1.x) * (a2.x - a1.x) + (worldPos.y - a1.y) * (a2.y - a1.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const bondLen = Math.sqrt(l2);
  const distAlongFromNearestEnd = Math.min(t * bondLen, (1 - t) * bondLen);
  // Mid-shaft → fuse on this bond; near ends → treat as atom for single-bond attach.
  const endpointZonePx = Math.min(atomRadius * 0.85, bondLen * 0.28);
  if (distAlongFromNearestEnd <= endpointZonePx) {
    return { atom, bond: null };
  }
  return { atom: null, bond };
}

/** Sum of bond orders incident on `atomId`. */
export const getAtomValency = (atomId: string, mol: Molecule): number => {
  return mol.bonds
    .filter(b => b.fromAtomId === atomId || b.toAtomId === atomId)
    .reduce((sum, b) => sum + b.order, 0);
};
