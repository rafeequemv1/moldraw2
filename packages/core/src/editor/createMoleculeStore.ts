/**
 * Vanilla molecule editor store (history + selection + subscribe).
 * Future home of `@moldraw/core` editor API — no React imports.
 */
import type { Molecule } from '@moldraw/domain';
import { normalizeMoleculeRingFills } from '@moldraw/domain';
import {
  expandInstanceArrays,
  hasInstanceArrays,
  isValidInstanceAtomId,
  isValidInstanceBondId,
  pruneEmptyInstanceArrays,
  remapInstanceIdsInCommandInput,
} from '../molecule/instanceArrays';
import { ensureFragmentIds } from '../molecule/fragmentIds';
import { runCommand } from '../commands';

/** Cap undo depth so large hex/circular arrays cannot balloon memory unchecked. */
const MAX_UNDO_DEPTH = 80;

/**
 * Only engine / explicit-expand commands materialize copies. Parent edits stay
 * instanced so children update until Ungroup.
 */
const FORCE_INSTANCE_EXPAND = new Set([
  'molecule.expandInstanceArrays',
  'molecule.cleanup',
  'molecule.applyCleanupResult',
  'molecule.aromatize',
]);
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
  canvasImageId: null,
  sruBracketId: null,
  colorEditStrokeId: null,
  colorEditCanvasShapeId: null,
  reactionArrowIds: [],
  strokeIds: [],
  canvasTextIds: [],
  canvasShapeIds: [],
  canvasImageIds: [],
  canvasOrbitalIds: [],
};

const syncSingularAnnotationFields = (sel: MoleculeSelection): MoleculeSelection => ({
  ...sel,
  reactionArrowId: sel.reactionArrowIds[0] ?? null,
  colorEditStrokeId: sel.strokeIds[0] ?? null,
  canvasTextId: sel.canvasTextIds[0] ?? null,
  colorEditCanvasShapeId: sel.canvasShapeIds[0] ?? null,
  canvasImageId: sel.canvasImageIds[0] ?? null,
});

function pruneSelection(mol: Molecule, sel: MoleculeSelection): MoleculeSelection {
  const atomSet = new Set(mol.atoms.map(a => a.id));
  const bondSet = new Set(mol.bonds.map(b => b.id));
  const textOk =
    sel.canvasTextId == null ||
    !!mol.canvasTexts?.some(t => t.id === sel.canvasTextId);
  const arrowOk =
    sel.reactionArrowId == null ||
    !!mol.reactionArrows?.some(a => a.id === sel.reactionArrowId);
  const imageOk =
    sel.canvasImageId == null ||
    !!mol.canvasImages?.some(img => img.id === sel.canvasImageId);
  const sruOk =
    sel.sruBracketId == null ||
    !!mol.sruBrackets?.some(b => b.id === sel.sruBracketId);
  const strokeOk =
    sel.colorEditStrokeId == null ||
    !!mol.strokes?.some(s => s.id === sel.colorEditStrokeId);
  const shapeOk =
    sel.colorEditCanvasShapeId == null ||
    !!mol.canvasShapes?.some(s => s.id === sel.colorEditCanvasShapeId);

  const pruned = syncSingularAnnotationFields({
    atomIds: sel.atomIds.filter(id => atomSet.has(id) || isValidInstanceAtomId(mol, id)),
    bondIds: sel.bondIds.filter(id => bondSet.has(id) || isValidInstanceBondId(mol, id)),
    canvasTextId: textOk ? sel.canvasTextId : null,
    reactionArrowId: arrowOk ? sel.reactionArrowId : null,
    canvasImageId: imageOk ? sel.canvasImageId : null,
    sruBracketId: sruOk ? sel.sruBracketId : null,
    colorEditStrokeId: strokeOk ? sel.colorEditStrokeId : null,
    colorEditCanvasShapeId: shapeOk ? sel.colorEditCanvasShapeId : null,
    reactionArrowIds: sel.reactionArrowIds.filter(
      id => mol.reactionArrows?.some(a => a.id === id),
    ),
    strokeIds: sel.strokeIds.filter(id => mol.strokes?.some(s => s.id === id)),
    canvasTextIds: sel.canvasTextIds.filter(id => mol.canvasTexts?.some(t => t.id === id)),
    canvasShapeIds: sel.canvasShapeIds.filter(id =>
      mol.canvasShapes?.some(s => s.id === id),
    ),
    canvasImageIds: sel.canvasImageIds.filter(id =>
      mol.canvasImages?.some(img => img.id === id),
    ),
    canvasOrbitalIds: (sel.canvasOrbitalIds ?? []).filter(id =>
      mol.orbitals?.some(o => o.id === id),
    ),
  });
  return pruned;
}

const MOLECULE_COLLECTION_KEYS = [
  'atoms',
  'bonds',
  'strokes',
  'reactionArrows',
  'canvasTexts',
  'canvasShapes',
  'canvasImages',
  'sruBrackets',
  'orbitals',
  'ringFills',
  'objectCollections',
  'instanceArrays',
] as const;

/**
 * Cheap structural no-op detection: a mutation that rebuilt the top-level
 * arrays (e.g. `filter` with no matches, `map` returning the same items)
 * without changing any element reference did not change the document.
 * Falls back to `false` (assume changed) as soon as an element differs.
 */
export function moleculesStructurallyEqual(a: Molecule, b: Molecule): boolean {
  if (a === b) return true;
  const ra = a as unknown as Record<string, unknown>;
  const rb = b as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  for (const key of keys) {
    const va = ra[key];
    const vb = rb[key];
    if (va === vb) continue;
    if ((va == null || (Array.isArray(va) && va.length === 0)) &&
        (vb == null || (Array.isArray(vb) && vb.length === 0))) {
      continue;
    }
    if (!(MOLECULE_COLLECTION_KEYS as readonly string[]).includes(key)) return false;
    if (!Array.isArray(va) || !Array.isArray(vb) || va.length !== vb.length) return false;
    for (let i = 0; i < va.length; i++) {
      if (va[i] !== vb[i] && !shallowRecordEqual(va[i], vb[i])) return false;
    }
  }
  return true;
}

/**
 * One-level value comparison for atoms / bonds / annotations that were rebuilt
 * by a mutation without actually changing (e.g. `updateAtomElement` to the same
 * element). `undefined` and `null` are treated as equal; arrays compare by items.
 */
function shallowRecordEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  for (const key of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    const x = ra[key];
    const y = rb[key];
    if (x === y || (x == null && y == null)) continue;
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length) return false;
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i] && !shallowRecordEqual(x[i], y[i])) return false;
      continue;
    }
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      if (!shallowRecordEqual(x, y)) return false;
      continue;
    }
    return false;
  }
  return true;
}

function selectionEqual(a: MoleculeSelection, b: MoleculeSelection): boolean {
  const eqArr = (x: string[], y: string[]) =>
    x.length === y.length && x.every((id, i) => id === y[i]);
  return (
    a.canvasTextId === b.canvasTextId &&
    a.reactionArrowId === b.reactionArrowId &&
    a.canvasImageId === b.canvasImageId &&
    a.sruBracketId === b.sruBracketId &&
    a.colorEditStrokeId === b.colorEditStrokeId &&
    a.colorEditCanvasShapeId === b.colorEditCanvasShapeId &&
    eqArr(a.reactionArrowIds, b.reactionArrowIds) &&
    eqArr(a.strokeIds, b.strokeIds) &&
    eqArr(a.canvasTextIds, b.canvasTextIds) &&
    eqArr(a.canvasShapeIds, b.canvasShapeIds) &&
    eqArr(a.canvasImageIds, b.canvasImageIds) &&
    eqArr(a.canvasOrbitalIds ?? [], b.canvasOrbitalIds ?? []) &&
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
  let selection: MoleculeSelection = syncSingularAnnotationFields({
    ...EMPTY_SELECTION,
    ...options.initialSelection,
    atomIds: options.initialSelection?.atomIds ?? [],
    bondIds: options.initialSelection?.bondIds ?? [],
    reactionArrowIds: options.initialSelection?.reactionArrowIds ?? [],
    strokeIds: options.initialSelection?.strokeIds ?? [],
    canvasTextIds: options.initialSelection?.canvasTextIds ?? [],
    canvasShapeIds: options.initialSelection?.canvasShapeIds ?? [],
    canvasImageIds: options.initialSelection?.canvasImageIds ?? [],
    canvasOrbitalIds: options.initialSelection?.canvasOrbitalIds ?? [],
  });
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
    const next = pruneEmptyInstanceArrays(
      ensureFragmentIds(normalizeMoleculeRingFills(nextRaw)),
    );
    past = [...past, present];
    if (past.length > MAX_UNDO_DEPTH) {
      past = past.slice(past.length - MAX_UNDO_DEPTH);
    }
    present = next;
    future = [];
    selection = pruneSelection(present, selection);
    emit();
  };

  const editor: MoleculeEditor = {
    getMolecule: () => present,

    applyCommand(commandId, input): CommandResult {
      const remapped = remapInstanceIdsInCommandInput(present, input);
      const base =
        hasInstanceArrays(present) && FORCE_INSTANCE_EXPAND.has(commandId)
          ? expandInstanceArrays(present)
          : present;
      const r = runCommand(base, commandId, remapped);
      if (!r.ok) return r;
      // Mutations that reject (e.g. valency) return the same molecule reference.
      if (r.next === present) return r;
      // No-op on an expanded copy — keep compact InstanceArray present.
      if (r.next === base && base !== present) return { ...r, next: present };
      // Rebuilt-but-identical arrays (filter/map with no hits) are not a change:
      // keep `present` so undo history and `changed` flags stay truthful.
      if (base === present && moleculesStructurallyEqual(r.next, present)) {
        return { ...r, next: present };
      }
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

    replacePresentWithoutHistory(updater) {
      const raw =
        typeof updater === 'function'
          ? (updater as (p: Molecule) => Molecule)(present)
          : updater;
      const next = normalizeMoleculeRingFills(raw);
      if (next === present) return;
      present = next;
      selection = pruneSelection(present, selection);
      emit();
    },

    resetMolecule(nextRaw = EMPTY_MOLECULE) {
      const next = ensureFragmentIds(normalizeMoleculeRingFills(nextRaw));
      past = [];
      future = [];
      present = next;
      selection = { ...EMPTY_SELECTION };
      emit();
    },

    commitUndoFromBaseline(baseline) {
      if (baseline === present) return;
      past = [...past, normalizeMoleculeRingFills(baseline)];
      future = [];
      emit();
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
      const reactionArrowIds =
        patch.reactionArrowIds !== undefined
          ? [...patch.reactionArrowIds]
          : patch.reactionArrowId !== undefined
            ? patch.reactionArrowId
              ? [patch.reactionArrowId]
              : []
            : selection.reactionArrowIds;
      const strokeIds =
        patch.strokeIds !== undefined
          ? [...patch.strokeIds]
          : patch.colorEditStrokeId !== undefined
            ? patch.colorEditStrokeId
              ? [patch.colorEditStrokeId]
              : []
            : selection.strokeIds;
      const canvasTextIds =
        patch.canvasTextIds !== undefined
          ? [...patch.canvasTextIds]
          : patch.canvasTextId !== undefined
            ? patch.canvasTextId
              ? [patch.canvasTextId]
              : []
            : selection.canvasTextIds;
      const canvasShapeIds =
        patch.canvasShapeIds !== undefined
          ? [...patch.canvasShapeIds]
          : patch.colorEditCanvasShapeId !== undefined
            ? patch.colorEditCanvasShapeId
              ? [patch.colorEditCanvasShapeId]
              : []
            : selection.canvasShapeIds;
      const canvasImageIds =
        patch.canvasImageIds !== undefined
          ? [...patch.canvasImageIds]
          : patch.canvasImageId !== undefined
            ? patch.canvasImageId
              ? [patch.canvasImageId]
              : []
            : selection.canvasImageIds;
      const canvasOrbitalIds =
        patch.canvasOrbitalIds !== undefined
          ? [...patch.canvasOrbitalIds]
          : selection.canvasOrbitalIds;

      const next: MoleculeSelection = syncSingularAnnotationFields({
        ...selection,
        ...patch,
        atomIds: patch.atomIds !== undefined ? [...patch.atomIds] : selection.atomIds,
        bondIds: patch.bondIds !== undefined ? [...patch.bondIds] : selection.bondIds,
        reactionArrowIds,
        strokeIds,
        canvasTextIds,
        canvasShapeIds,
        canvasImageIds,
        canvasOrbitalIds,
      });
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
