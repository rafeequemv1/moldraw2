/**
 * Layout for implicit hydrogen stubs and "Hₙ" suffixes around an atom.
 * Picks directions that fall in the largest angular gap between bonded
 * neighbors so chains and ring corners look natural.
 */
import type { Atom, Molecule } from '@moldraw/domain';
import { angle0To2Pi } from './angles';
import type { Point } from './polygons';

/** Implicit H on carbon: label center distance from C (world px). */
export const IMPLICIT_H_LABEL_DIST = 30;
/** C–H bond line ends here (meets the H label wipe box; stroke starts at C). */
export const IMPLICIT_H_BOND_END = IMPLICIT_H_LABEL_DIST - 5;

/**
 * Decide whether an "Hₙ" suffix belongs to the left of a heteroatom symbol.
 * We sum the x-components of all neighbor directions; if neighbors lean right,
 * the free side is left.
 */
export const hGoesLeft = (atom: Atom, mol: Molecule): boolean => {
  const bonds = mol.bonds.filter(b => b.fromAtomId === atom.id || b.toAtomId === atom.id);
  if (bonds.length === 0) return false;
  let sumX = 0;
  for (const b of bonds) {
    const nId = b.fromAtomId === atom.id ? b.toAtomId : b.fromAtomId;
    const n = mol.atoms.find(a => a.id === nId);
    if (n) sumX += n.x - atom.x;
  }
  return sumX > 0;
};

/**
 * Unit vectors from `atom` toward implicit-H stub positions. Algorithm:
 * - 0 neighbors: spread evenly starting at the top.
 * - 1 neighbor: place opposite that bond, fanning out for multi-H.
 * - 2+ neighbors: drop H into the largest angular gap with a small margin.
 */
export const getHydrogenStubDirections = (
  atom: Atom,
  mol: Molecule,
  count: number,
): Point[] => {
  if (count <= 0) return [];

  const neighborAngles: number[] = [];
  for (const b of mol.bonds) {
    if (b.fromAtomId !== atom.id && b.toAtomId !== atom.id) continue;
    const nid = b.fromAtomId === atom.id ? b.toAtomId : b.fromAtomId;
    const n = mol.atoms.find(a => a.id === nid);
    if (n) neighborAngles.push(Math.atan2(n.y - atom.y, n.x - atom.x));
  }

  if (neighborAngles.length === 0) {
    return Array.from({ length: count }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
      return { x: Math.cos(a), y: Math.sin(a) };
    });
  }

  if (neighborAngles.length === 1) {
    const back = neighborAngles[0] + Math.PI;
    if (count === 1) return [{ x: Math.cos(back), y: Math.sin(back) }];
    const spread = Math.min(Math.PI / 3, (0.85 * Math.PI) / Math.max(count - 1, 1));
    return Array.from({ length: count }, (_, i) => {
      const a = back + (i - (count - 1) / 2) * spread;
      return { x: Math.cos(a), y: Math.sin(a) };
    });
  }

  const A = neighborAngles.map(angle0To2Pi).sort((x, y) => x - y);
  type Gap = { start: number; end: number; size: number };
  const gaps: Gap[] = [];
  for (let i = 0; i < A.length; i++) {
    const start = A[i];
    const end = i + 1 < A.length ? A[i + 1] : A[0] + 2 * Math.PI;
    gaps.push({ start, end, size: end - start });
  }
  const best = gaps.reduce((g, h) => (g.size >= h.size ? g : h));
  const margin = Math.min(best.size * 0.12, 0.35);
  const usable = Math.max(best.size - 2 * margin, best.size * 0.5);
  const lo = best.start + margin;
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? lo + usable / 2 : lo + (usable * (i + 1)) / (count + 1);
    return { x: Math.cos(t), y: Math.sin(t) };
  });
};
