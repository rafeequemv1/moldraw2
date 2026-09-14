import type { Molecule } from '@moldraw/domain';
import type { CommandResult } from '../commands';

/** Embedder-facing selection (atoms, bonds, annotations, color-edit targets). */
export interface MoleculeSelection {
  atomIds: string[];
  bondIds: string[];
  canvasTextId: string | null;
  reactionArrowId: string | null;
  colorEditStrokeId: string | null;
  colorEditCanvasShapeId: string | null;
}

export interface MoleculeHistoryStacks {
  past: Molecule[];
  future: Molecule[];
}

/** Immutable snapshot for `useSyncExternalStore`. */
export interface MoleculeEditorSnapshot {
  molecule: Molecule;
  selection: MoleculeSelection;
  pastLength: number;
  futureLength: number;
}

export interface CreateMoleculeStoreOptions {
  initialMolecule?: Molecule;
  initialSelection?: Partial<MoleculeSelection>;
}

/**
 * tldraw-shaped editor surface: molecule history + selection.
 * React-free — hosts bind via `subscribe` / `getSnapshot`.
 */
export interface MoleculeEditor {
  getMolecule(): Molecule;
  /** Prefer this for all chemistry mutations (Zod-validated commands). */
  applyCommand(commandId: string, input: unknown): CommandResult;
  /**
   * Escape hatch for rare non-command updates. Prefer `applyCommand`.
   * Pushes onto the undo stack like a command commit.
   */
  updateMolecule(updater: Molecule | ((prev: Molecule) => Molecule)): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  getHistoryStacks(): MoleculeHistoryStacks;
  getSelection(): MoleculeSelection;
  setSelection(patch: Partial<MoleculeSelection>): void;
  clearSelection(): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): MoleculeEditorSnapshot;
}
