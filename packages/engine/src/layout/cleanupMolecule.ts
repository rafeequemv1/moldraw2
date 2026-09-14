/**
 * Unified cleanup entry — native clean2d first, full rebuild when needed.
 * Indigo-free path for worker and sync command dispatch.
 */
import type { Molecule } from '@moldraw/domain';
import { hasLockedRingConformations } from '@moldraw/domain';
import { clean2d, type Clean2dOptions } from './clean2d';
import { cleanupStructureWithStatus, type CleanupStructureResult } from './cleanupStructure';
import { isLayoutCollapsed } from './refineInPlace';
import { passesHardGate, passesSoftGate, isChemDrawReady } from './layoutQuality';

export interface CleanupMoleculeOptions extends Clean2dOptions {
  /** Force full skeleton rebuild (skip soft clean2d). */
  forceFullRebuild?: boolean;
  maxRestarts?: number;
}

export type CleanupMoleculeResult = CleanupStructureResult & {
  source: 'native';
};

/**
 * Native-first cleanup: soft clean2d when coords are reasonable; full rebuild
 * when collapsed or soft path fails quality gates.
 */
export const cleanupMolecule = (
  mol: Molecule,
  options: CleanupMoleculeOptions,
): CleanupMoleculeResult => {
  const bondLen = options.bondLengthPx;
  if (mol.atoms.length === 0 || bondLen <= 0) {
    return { molecule: mol, status: 'certified', source: 'native' };
  }

  const useSoft =
    !options.forceFullRebuild &&
    !isLayoutCollapsed(mol) &&
    !hasLockedRingConformations(mol);

  if (useSoft) {
    const selected =
      options.selectedAtomIds && options.selectedAtomIds.size > 0
        ? options.selectedAtomIds
        : undefined;
    const soft = clean2d(mol, {
      bondLengthPx: bondLen,
      selectedAtomIds: selected,
      preserveOrientation: options.preserveOrientation ?? true,
    });
    if (
      passesHardGate(soft) ||
      isChemDrawReady(soft) ||
      passesSoftGate(soft)
    ) {
      return {
        molecule: soft,
        status: passesHardGate(soft) ? 'certified' : 'degraded',
        source: 'native',
      };
    }
  }

  const full = cleanupStructureWithStatus(mol, {
    bondLengthPx: bondLen,
    preserveOrientation: options.preserveOrientation ?? true,
    maxRestarts: options.maxRestarts,
  });
  return { ...full, source: 'native' };
};

export const cleanupMoleculeCoords = (
  mol: Molecule,
  options: CleanupMoleculeOptions,
): Molecule => cleanupMolecule(mol, options).molecule;
