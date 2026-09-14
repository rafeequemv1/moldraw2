/**
 * Fold / unfold explicit hydrogens on the molecule graph (native).
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { buildGraph } from '../graph';
import { implicitHydrogensForMolecule } from './valence';
import { kekulize } from './aromaticity';

export type ExplicitHydrogenMode = 'fold' | 'unfold' | 'auto';

let hCounter = 0;
const newHId = (): string => `h_${++hCounter}_${Math.random().toString(36).slice(2, 7)}`;

/** Remove explicit H/D atoms; topology on heavy atoms unchanged. */
export const foldExplicitHydrogens = (mol: Molecule): Molecule => {
  const keep = new Set(
    mol.atoms.filter(a => a.element !== 'H' && a.element !== 'D').map(a => a.id),
  );
  return {
    ...mol,
    atoms: mol.atoms.filter(a => keep.has(a.id)),
    bonds: mol.bonds.filter(b => keep.has(b.fromAtomId) && keep.has(b.toAtomId)),
  };
};

/** Add explicit H atoms for implicit valence on heavy atoms. */
export const unfoldExplicitHydrogens = (mol: Molecule): Molecule => {
  const kek = kekulize(mol);
  const implicit = implicitHydrogensForMolecule(kek);
  const existingH = new Set(
    mol.atoms.filter(a => a.element === 'H' || a.element === 'D').map(a => a.id),
  );
  if ([...implicit.values()].every(n => n === 0) && existingH.size > 0) return mol;

  const atoms: Atom[] = [...mol.atoms];
  const bonds: Bond[] = [...mol.bonds];
  const g = buildGraph(kek);
  const bondLen = 20;

  for (const a of kek.atoms) {
    if (a.element === 'H' || a.element === 'D') continue;
    const need = implicit.get(a.id) ?? 0;
    const have = (g.nodes.get(a.id)?.neighbors ?? []).filter(nb => {
      const el = mol.atoms.find(x => x.id === nb)?.element ?? '';
      return el === 'H' || el === 'D';
    }).length;
    const add = Math.max(0, need - have);
    for (let i = 0; i < add; i++) {
      const angle = (2 * Math.PI * i) / Math.max(need, 1);
      const hId = newHId();
      atoms.push({
        id: hId,
        element: 'H',
        x: a.x + bondLen * Math.cos(angle),
        y: a.y + bondLen * Math.sin(angle),
        charge: 0,
      });
      bonds.push({
        id: `b_${hId}`,
        fromAtomId: a.id,
        toAtomId: hId,
        order: 1,
      });
    }
  }
  return { ...mol, atoms, bonds };
};

export const convertExplicitHydrogens = (
  mol: Molecule,
  mode: ExplicitHydrogenMode = 'auto',
): Molecule => {
  const hasExplicitH = mol.atoms.some(a => a.element === 'H' || a.element === 'D');
  const effective = mode === 'auto' ? (hasExplicitH ? 'fold' : 'unfold') : mode;
  return effective === 'fold' ? foldExplicitHydrogens(mol) : unfoldExplicitHydrogens(mol);
};
