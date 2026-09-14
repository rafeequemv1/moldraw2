/**
 * Vanilla molecule editor store (history + selection + subscribe).
 * Future home of `@moldraw/core` editor API — no React imports.
 */
import type { Molecule } from '@moldraw/domain';
import { normalizeMoleculeRingFills } from '@moldraw/domain';
import { runCommand } from '../commands';
import type { CommandResult } from '../commands';
import type {
  CreateMoleculeStoreOptions,
  MoleculeEditor,
  MoleculeEditorSnapshot,
  MoleculeSelection,
} from './types';

const EMPTY_MOLECULE: Molecule = { atoms: [], bonds: [] };

const EMPTY_SELECTION: MoleculeSelection = {
  atomIds: [],
  bondIds: [],
  canvasTextId: null,
  reactionArrowId: null,
  colorEditStrokeId: null,
  colorEditCanvasShapeId: null,
};

function pruneSelection(mol: Molecule, sel: MoleculeSelection): MoleculeSelection {
  const atomSet = new Set(mol.atoms.map(a => a.id));
  const bondSet = new Set(mol.bonds.map(b => b.id));
  const textOk =
    sel.canvasTextId == null ||
    !!mol.canvasTexts?.some(t => t.id === sel.canvasTextId);
  const arrowOk =
    sel.reactionArrowId == null ||
    !!mol.reactionArrows?.some(a => a.id === sel.reactionArrowId);

  return {
    atomIds: sel.atomIds.filter(id => atomSet.has(id)),
    bondIds: sel.bondIds.filter(id => bondSet.has(id)),
    canvasTextId: textOk ? sel.canvasTextId : null,
    reactionArrowId: arrowOk ? sel.reactionArrowId : null,
    colorEditStrokeId: sel.colorEditStrokeId,
    colorEditCanvasShapeId: sel.colorEditCanvasShapeId,
  };
}

function selectionEqual(a: MoleculeSelection, b: MoleculeSelection): boolean {
  return (
    a.canvasTextId === b.canvasTextId &&
    a.reactionArrowId === b.reactionArrowId &&
    a.colorEditStrokeId === b.colorEditStrokeId &&
    a.colorEditCanvasShapeId === b.colorEditCanvasShapeId &&
    a.atomIds.length === b.atomIds.length &&
    a.bondIds.length === b.bondIds.length &&
    a.atomIds.every((id, i) => id === b.atomIds[i]) &&
    a.bondIds.every((id, i) => id === b.bondIds[i])
  );
}

export function createMoleculeStore(
  options: CreateMoleculeStoreOptions = {},
): MoleculeEditor {
  let past: Molecule[] = [];
  let present = normalizeMoleculeRingFills(options.initialMolecule ?? EMPTY_MOLECULE);
  let future: Molecule[] = [];
  let selection: MoleculeSelection = {
    ...EMPTY_SELECTION,
    ...options.initialSelection,
    atomIds: options.initialSelection?.atomIds ?? [],
    bondIds: options.initialSelection?.bondIds ?? [],
  };
  selection = pruneSelection(present, selection);

  const listeners = new Set<() => void>();
  let snapshot: MoleculeEditorSnapshot = {
    molecule: present,
    selection,
    pastLength: past.length,
    futureLength: future.length,
  };

  const rebuildSnapshot = (): void => {
    snapshot = {
      molecule: present,
      selection,
      pastLength: past.length,
      futureLength: future.length,
    };
  };

  const emit = (): void => {
    rebuildSnapshot();
    for (const listener of listeners) listener();
  };

  const commitMolecule = (nextRaw: Molecule): void => {
    const next = normalizeMoleculeRingFills(nextRaw);
    past = [...past, present];
    present = next;
    future = [];
    selection = pruneSelection(present, selection);
    emit();
  };

  const editor: MoleculeEditor = {
    getMolecule: () => present,

    applyCommand(commandId, input): CommandResult {
      const r = runCommand(present, commandId, input);
      if (!r.ok) return r;
      if (r.next === present) return r;
      commitMolecule(r.next);
      return r;
    },

    updateMolecule(updater) {
      const raw =
        typeof updater === 'function'
          ? (updater as (p: Molecule) => Molecule)(present)
          : updater;
      commitMolecule(raw);
    },

    undo() {
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      past = past.slice(0, -1);
      future = [present, ...future];
      present = normalizeMoleculeRingFills(previous);
      selection = pruneSelection(present, selection);
      emit();
    },

    redo() {
      if (future.length === 0) return;
      const [next, ...rest] = future;
      past = [...past, present];
      present = normalizeMoleculeRingFills(next);
      future = rest;
      selection = pruneSelection(present, selection);
      emit();
    },

    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,

    getHistoryStacks: () => ({ past: [...past], future: [...future] }),

    getSelection: () => selection,

    setSelection(patch) {
      const next: MoleculeSelection = {
        ...selection,
        ...patch,
        atomIds: patch.atomIds !== undefined ? [...patch.atomIds] : selection.atomIds,
        bondIds: patch.bondIds !== undefined ? [...patch.bondIds] : selection.bondIds,
      };
      const pruned = pruneSelection(present, next);
      if (selectionEqual(selection, pruned)) return;
      selection = pruned;
      emit();
    },

    clearSelection() {
      if (selectionEqual(selection, EMPTY_SELECTION)) return;
      selection = { ...EMPTY_SELECTION };
      emit();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: () => snapshot,
  };

  return editor;
}
