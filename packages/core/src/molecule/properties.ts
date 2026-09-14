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
  // One pass over bonds; the previous per-atom `bonds.filter` was O(atoms × bonds)
  // and took ~1 s on a 5k-atom COF sheet every time the Objects outline refreshed.
  const bondValence = new Map<string, number>();
  for (const b of mol.bonds) {
    bondValence.set(b.fromAtomId, (bondValence.get(b.fromAtomId) ?? 0) + b.order);
    bondValence.set(b.toAtomId, (bondValence.get(b.toAtomId) ?? 0) + b.order);
  }
  mol.atoms.forEach(atom => {
    counts[atom.element] = (counts[atom.element] || 0) + 1;
    const bondV = bondValence.get(atom.id) ?? 0;
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
