/**
 * Native aromatize / dearomatize — bond aromatic flags without Indigo.
 */
import type { Molecule } from '@moldraw/domain';
import { perceiveAromaticity, kekulize } from './aromaticity';

export type AromatizeMode = 'aromatize' | 'dearomatize';

export const aromatizeMolecule = (mol: Molecule, mode: AromatizeMode = 'aromatize'): Molecule => {
  if (mol.atoms.length === 0) return mol;
  return mode === 'aromatize' ? perceiveAromaticity(mol) : kekulize(mol);
};
