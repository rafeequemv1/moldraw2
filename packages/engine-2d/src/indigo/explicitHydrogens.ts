/**
 * Indigo convert_explicit_hydrogens — fold / unfold / auto (fold↔unfold).
 * Mutates the molblock graph (adds or removes real H atoms).
 */
import type { Molecule } from '@moldraw/domain';
import {
  moleculeToMolblock,
  mergeExplicitHydrogensFromMolblock,
} from '@moldraw/core';
import type { IndigoKetcher } from './types';
import { getIndigoOrNull, loadIndigo } from './loadIndigo';
import { makeIndigoOptions } from './options';

export type ExplicitHydrogenMode = 'fold' | 'unfold' | 'auto';

export {
  mergeExplicitHydrogensFromMolblock,
  moleculeHasExplicitHydrogens,
} from '@moldraw/core';

export const indigoConvertExplicitHydrogensMolblock = (
  molblock: string,
  indigo: IndigoKetcher,
  mode: ExplicitHydrogenMode = 'auto',
): string | null => {
  const trimmed = molblock.trim();
  if (!trimmed) return null;
  const opts = makeIndigoOptions(indigo);
  if (typeof indigo.convert_explicit_hydrogens !== 'function') {
    console.warn('[indigo] convert_explicit_hydrogens is not available in this WASM build');
    return null;
  }
  try {
    const out = indigo.convert_explicit_hydrogens(trimmed, mode, 'molfile', opts);
    return typeof out === 'string' && out.includes('V2000') ? out : null;
  } catch (err) {
    console.warn(`[indigo] convert_explicit_hydrogens(${mode}) failed`, err);
    return null;
  }
};

export const convertExplicitHydrogensMolecule = async (
  mol: Molecule,
  mode: ExplicitHydrogenMode = 'auto',
): Promise<Molecule> => {
  if (mol.atoms.length === 0) return mol;
  const eng = getIndigoOrNull() ?? (await loadIndigo());
  if (!eng) throw new Error('Indigo WASM is required for convert_explicit_hydrogens');
  const mb = moleculeToMolblock(mol);
  const out = indigoConvertExplicitHydrogensMolblock(mb, eng, mode);
  if (!out) throw new Error(`Indigo convert_explicit_hydrogens (${mode}) failed`);
  const next = mergeExplicitHydrogensFromMolblock(mol, out);
  if (!next) throw new Error('Could not merge explicit-hydrogen result');
  return next;
};
