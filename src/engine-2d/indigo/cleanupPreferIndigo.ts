/**
 * Preferred cleanup: Indigo when available / requested, else native layout.
 *
 * Always merges coordinates onto the original Molecule so IDs, aliases, charges,
 * strokes, and annotations survive. Topology must not change.
 */
import type { Molecule } from '@moldraw/domain';
import {
  cleanupWithIndigo,
  layoutMoleculeIndigoSync,
  scaleMoleculeBonds,
} from './layoutMolecule';
import { isIndigoReady, loadIndigo } from './loadIndigo';
import type { IndigoLayoutOptions } from './layout2d';
import { resolveCleanupBondLength } from '@moldraw/core/io/localCleanup';
import { cleanupStructure } from '@moldraw/engine';

export interface CleanupPreferIndigoOptions {
  bondLengthPx?: number;
  /**
   * When true (default), try Indigo first (load if needed). When false, use
   * native layout only. If Indigo fails or is unavailable, native is used.
   */
  preferIndigo?: boolean;
  indigo?: IndigoLayoutOptions;
  preserveOrientation?: boolean;
}

export type CleanupPreferIndigoResult = {
  molecule: Molecule;
  source: 'indigo' | 'native';
};

const nativeCleanup = (
  mol: Molecule,
  bondLen: number,
  preserveOrientation?: boolean,
): CleanupPreferIndigoResult => ({
  molecule: cleanupStructure(mol, {
    bondLengthPx: bondLen,
    preserveOrientation: preserveOrientation ?? true,
  }),
  source: 'native',
});

/**
 * Async cleanup — Indigo when preferred and available, else native.
 */
export const cleanupPreferIndigo = async (
  mol: Molecule,
  options: CleanupPreferIndigoOptions = {},
): Promise<CleanupPreferIndigoResult> => {
  const bondLen = resolveCleanupBondLength(mol, options.bondLengthPx);
  const preferIndigo = options.preferIndigo !== false;

  if (preferIndigo) {
    try {
      await loadIndigo();
      if (isIndigoReady()) {
        const result = await cleanupWithIndigo(mol, {
          bondLengthPx: bondLen,
          mode: options.indigo?.mode ?? 'layout',
          selectedAtomIndices: options.indigo?.selectedAtomIndices,
        });
        return { molecule: result.molecule, source: 'indigo' };
      }
    } catch (err) {
      console.warn('[cleanupPreferIndigo] Indigo failed, using native:', err);
    }
  }

  return nativeCleanup(mol, bondLen, options.preserveOrientation);
};

/**
 * Sync cleanup: Indigo if already loaded, else native. Never returns null for
 * missing WASM (native always available).
 */
export const cleanupIndigoSyncOrNull = (
  mol: Molecule,
  bondLengthPx?: number,
): Molecule | null => {
  const bondLen = resolveCleanupBondLength(mol, bondLengthPx);
  if (isIndigoReady()) {
    const laid = layoutMoleculeIndigoSync(mol, { bondLengthPx: bondLen });
    if (laid) return laid;
  }
  return cleanupStructure(mol, { bondLengthPx: bondLen, preserveOrientation: true });
};

export { isIndigoReady, loadIndigo, scaleMoleculeBonds };
