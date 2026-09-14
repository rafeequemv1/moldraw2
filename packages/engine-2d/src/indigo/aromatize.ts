/**
 * Indigo aromatize / dearomatize — merge bond aromatic flags / Kekulé orders
 * onto the existing Molecule (coords, aliases, IDs preserved).
 */
import type { Bond, Molecule } from '@moldraw/domain';
import { moleculeToMolblock, parseMolblock } from '@moldraw/core';
import type { IndigoKetcher } from './types';
import { getIndigoOrNull, loadIndigo } from './loadIndigo';
import { makeIndigoOptions } from './options';

export type AromatizeMode = 'aromatize' | 'dearomatize';

/**
 * Apply bond order / aromatic flags from an Indigo molblock onto `mol`
 * by bond index (same order as moleculeToMolblock).
 */
export const mergeBondOrdersFromMolblock = (
  mol: Molecule,
  molblock: string,
): Molecule | null => {
  const parsed = parseMolblock(molblock);
  if (parsed.atoms.length === 0) return null;
  if (parsed.bonds.length !== mol.bonds.length) return null;

  const nextBonds: Bond[] = mol.bonds.map((b, i) => {
    const src = parsed.bonds[i]!;
    if (src.aromatic) {
      return { ...b, order: 1, aromatic: true };
    }
    const order = Math.max(1, Math.min(3, src.order || 1)) as 1 | 2 | 3;
    const { aromatic: _drop, ...rest } = b;
    void _drop;
    return { ...rest, order, aromatic: undefined };
  });

  return { ...mol, bonds: nextBonds };
};

export const indigoAromatizeMolblock = (
  molblock: string,
  indigo: IndigoKetcher,
  mode: AromatizeMode = 'aromatize',
): string | null => {
  const trimmed = molblock.trim();
  if (!trimmed) return null;
  const opts = makeIndigoOptions(indigo);
  try {
    const out =
      mode === 'dearomatize'
        ? indigo.dearomatize(trimmed, 'molfile', opts)
        : indigo.aromatize(trimmed, 'molfile', opts);
    return typeof out === 'string' && out.includes('V2000') ? out : null;
  } catch (err) {
    console.warn(`[indigo] ${mode} failed`, err);
    return null;
  }
};

export const aromatizeMoleculeIndigoSync = (
  mol: Molecule,
  mode: AromatizeMode,
  indigo?: IndigoKetcher | null,
): Molecule | null => {
  if (mol.atoms.length === 0) return mol;
  const eng = indigo ?? getIndigoOrNull();
  if (!eng) return null;
  const mb = moleculeToMolblock(mol);
  const out = indigoAromatizeMolblock(mb, eng, mode);
  if (!out) return null;
  return mergeBondOrdersFromMolblock(mol, out);
};

export const aromatizeMoleculeIndigo = async (
  mol: Molecule,
  mode: AromatizeMode = 'aromatize',
): Promise<Molecule> => {
  if (mol.atoms.length === 0) return mol;
  const eng = getIndigoOrNull() ?? (await loadIndigo());
  if (!eng) throw new Error('Indigo WASM is required for aromatize/dearomatize');
  const next = aromatizeMoleculeIndigoSync(mol, mode, eng);
  if (!next) throw new Error(`Indigo ${mode} failed`);
  return next;
};
