import type { Molecule } from '@moldraw/domain';

/** Stable, coord-free snapshot for golden session tests. */
export function moleculeSnapshot(mol: Molecule): Record<string, unknown> {
  const atomsById = new Map(mol.atoms.map(a => [a.id, a]));
  const bonds = mol.bonds
    .map(b => {
      const from = atomsById.get(b.fromAtomId)?.element ?? '?';
      const to = atomsById.get(b.toAtomId)?.element ?? '?';
      const pair = [from, to].sort().join('-');
      return `${pair}:${b.order}${b.aromatic ? 'a' : ''}`;
    })
    .sort();
  const elements = mol.atoms.map(a => a.element).sort();
  const arrows = (mol.reactionArrows ?? []).map(a => a.kind ?? 'straight').sort();
  return {
    atomCount: mol.atoms.length,
    bondCount: mol.bonds.length,
    elements,
    bonds,
    arrows,
  };
}
