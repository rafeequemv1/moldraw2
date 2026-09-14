import type { Molecule, ReactionArrow } from '@moldraw/domain';
import { reactionArrowParticipatesInSmilesSplit } from '@moldraw/domain';

/** Subgraph containing only atoms in `ids` and bonds between them. */
export const subsetMoleculeByAtomIds = (mol: Molecule, ids: Set<string>): Molecule => ({
  atoms: mol.atoms.filter(a => ids.has(a.id)),
  bonds: mol.bonds.filter(b => ids.has(b.fromAtomId) && ids.has(b.toAtomId)),
});

/**
 * Split atoms into two sides of the directed arrow; reactants = side whose
 * centroid is closer to the tail.
 */
export const partitionAtomsAcrossArrow = (
  mol: Molecule,
  arrow: ReactionArrow,
): { reactants: Set<string>; products: Set<string> } | null => {
  const dx = arrow.x2 - arrow.x1;
  const dy = arrow.y2 - arrow.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-8) return null;
  const sidePos = new Set<string>();
  const sideNeg = new Set<string>();
  for (const a of mol.atoms) {
    const z = dx * (a.y - arrow.y1) - dy * (a.x - arrow.x1);
    if (z >= 0) sidePos.add(a.id);
    else sideNeg.add(a.id);
  }
  const centroid = (ids: Set<string>): { x: number; y: number } | null => {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const id of ids) {
      const at = mol.atoms.find(x => x.id === id);
      if (!at) continue;
      sx += at.x;
      sy += at.y;
      n++;
    }
    return n ? { x: sx / n, y: sy / n } : null;
  };
  const cPos = centroid(sidePos);
  const cNeg = centroid(sideNeg);
  if (!cPos || !cNeg) return null;
  const dTail = (p: { x: number; y: number }) => (p.x - arrow.x1) ** 2 + (p.y - arrow.y1) ** 2;
  if (dTail(cPos) <= dTail(cNeg)) {
    return { reactants: sidePos, products: sideNeg };
  }
  return { reactants: sideNeg, products: sidePos };
};

/**
 * If the first reaction arrow separates the drawing into two non-empty subgraphs,
 * return mol blocks for SMILES as `react>>prod`.
 */
export const reactionSmilesSplit = (
  mol: Molecule,
): { reactMol: Molecule; prodMol: Molecule } | null => {
  const arrows = mol.reactionArrows ?? [];
  const arr = arrows.find(a => reactionArrowParticipatesInSmilesSplit(a));
  if (!arr || mol.atoms.length === 0) return null;
  const part = partitionAtomsAcrossArrow(mol, arr);
  if (!part || part.reactants.size === 0 || part.products.size === 0) return null;
  const reactMol = subsetMoleculeByAtomIds(mol, part.reactants);
  const prodMol = subsetMoleculeByAtomIds(mol, part.products);
  if (reactMol.atoms.length === 0 || prodMol.atoms.length === 0) return null;
  return { reactMol, prodMol };
};
