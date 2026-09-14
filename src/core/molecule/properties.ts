import type { Molecule } from '@moldraw/domain';
import { getEffectiveValencyForImplicitHydrogen } from '@moldraw/domain';
import { ATOMIC_MASS } from '@moldraw/domain';

export type MolecularData = {
  empirical: { order: string[]; counts: Record<string, number> };
  mw: number;
};

/**
 * Build empirical formula (with implicit H) and molecular weight for `mol`.
 * Hill order: C first, then H, then remaining elements alphabetically.
 */
export const getMolecularData = (mol: Molecule): MolecularData => {
  const counts: Record<string, number> = {};
  mol.atoms.forEach(atom => {
    counts[atom.element] = (counts[atom.element] || 0) + 1;
    const bondV = mol.bonds
      .filter(b => b.fromAtomId === atom.id || b.toAtomId === atom.id)
      .reduce((s, b) => s + b.order, 0);
    const maxV = getEffectiveValencyForImplicitHydrogen(atom.element, atom.charge ?? 0);
    const implH = Math.max(0, maxV - bondV - Math.abs(atom.charge ?? 0));
    if (implH > 0) counts['H'] = (counts['H'] || 0) + implH;
  });
  const elems = Object.keys(counts);
  const order = [
    ...(['C', 'H'].filter(e => elems.includes(e))),
    ...elems.filter(e => e !== 'C' && e !== 'H').sort(),
  ];
  const mw = elems.reduce((s, el) => s + (ATOMIC_MASS[el] ?? 0) * counts[el], 0);
  return { empirical: { order, counts }, mw };
};
