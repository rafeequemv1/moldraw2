/**
 * In-app clipboard for atom/bond fragments (Ctrl+C / Ctrl+V).
 *
 * - **Copy**: snapshots the current selection (atoms + bonds wholly between
 *   them), normalised to the centroid so paste lands at the cursor / viewport
 *   centre.
 * - **Paste**: dispatches the `molecule.pasteFragment` command so the new
 *   atoms get fresh ids, the chosen translation, and the action goes through
 *   the undo stack like any other edit. Returns the new atom ids so the
 *   caller can auto-select them.
 *
 * Kept independent from the system clipboard on purpose — that's already
 * handled via context-menu "Copy SMILES" / "Paste SMILES" which round-trips
 * through RDKit. This hook is for fast in-canvas duplication.
 */
import { useCallback, useRef } from 'react';
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import type { CommandResult } from '@moldraw/core/commands';
import { CMD } from '@moldraw/core/commands';

interface FragmentSnapshot {
  atoms: Atom[];
  bonds: Bond[];
  /** Centroid of the snapshot — used by `paste` to translate to the target. */
  cx: number;
  cy: number;
}

export interface UseMoleculeClipboard {
  /** True when there is something to paste. */
  hasClipboard: boolean;
  /** Snapshot the given atoms (and any bond wholly between them). */
  copy: (molecule: Molecule, atomIds: string[]) => boolean;
  /**
   * Paste the snapshot translated so its centroid lands at (targetX, targetY).
   * Returns the AI command result; `extra.newAtomIds` lists the inserted ids.
   */
  paste: (
    targetX: number,
    targetY: number,
    applyCommand: (commandId: string, input: unknown) => CommandResult,
    view?: {
      viewport: { x: number; y: number; zoom: number };
      windowWidth: number;
      windowHeight: number;
      bondLengthPx?: number;
    },
  ) => string[];
}

export function useMoleculeClipboard(): UseMoleculeClipboard {
  const ref = useRef<FragmentSnapshot | null>(null);

  const copy = useCallback((molecule: Molecule, atomIds: string[]): boolean => {
    if (atomIds.length === 0) return false;
    const set = new Set(atomIds);
    const atoms = molecule.atoms.filter(a => set.has(a.id));
    if (atoms.length === 0) return false;
    const bonds = molecule.bonds.filter(b => set.has(b.fromAtomId) && set.has(b.toAtomId));
    const cx = atoms.reduce((s, a) => s + a.x, 0) / atoms.length;
    const cy = atoms.reduce((s, a) => s + a.y, 0) / atoms.length;
    ref.current = {
      atoms: atoms.map(a => ({ ...a })),
      bonds: bonds.map(b => ({ ...b })),
      cx,
      cy,
    };
    return true;
  }, []);

  const paste = useCallback(
    (
      targetX: number,
      targetY: number,
      applyCommand: (commandId: string, input: unknown) => CommandResult,
      view?: {
        viewport: { x: number; y: number; zoom: number };
        windowWidth: number;
        windowHeight: number;
        bondLengthPx?: number;
      },
    ): string[] => {
      const snap = ref.current;
      if (!snap) return [];
      const dx = targetX - snap.cx;
      const dy = targetY - snap.cy;
      const result = applyCommand(CMD.PasteFragment, {
        atoms: snap.atoms,
        bonds: snap.bonds,
        dx,
        dy,
        ...(view
          ? {
              viewport: view.viewport,
              windowWidth: view.windowWidth,
              windowHeight: view.windowHeight,
              bondLengthPx: view.bondLengthPx,
            }
          : {}),
      });
      if (!result.ok) return [];
      const extra = result.extra as { newAtomIds?: string[] } | undefined;
      return extra?.newAtomIds ?? [];
    },
    [],
  );

  return {
    get hasClipboard() {
      return ref.current !== null;
    },
    copy,
    paste,
  };
}
