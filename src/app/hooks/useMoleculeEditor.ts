/**
 * React bridge for {@link createMoleculeStore} / {@link MoleculeEditor}.
 * Replaces useMoleculeHistory + most of useSelectionState.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { CanvasText, Molecule, ReactionArrow } from '@moldraw/domain';
import {
  circularArrayAtoms,
  collectAtomsAsObjectCollection,
  dendrimerArrayAtoms,
  generateCofInMolecule,
  linearArrayAtoms,
} from '@moldraw/core';
import { CMD } from '@moldraw/core/commands';
import type { MoleculeEditor, MoleculeSelection } from '@moldraw/core/editor';
import {
  expandAtomIdsToConnectedFragments,
  getSelectionAabb,
} from '@moldraw/canvas/geometry';
import { selectedDocumentFragmentBoxes } from '@moldraw/core/align/selectionArrange';
import type {
  CircularArrayParams,
  DendrimerArrayParams,
  GrapheneGenerateParams,
  LinearArrayParams,
  SelectionArrangeAction,
  SelectionArrangeOptions,
} from '../components/SelectionAlignToolbar';
import type { SelectionReflectAxis } from '../components/SelectionActionToolbar';
import type { CofGenerateParams, CofGenerateResult } from '../cofs';

function makeIdSetter(
  store: MoleculeEditor,
  key: 'atomIds' | 'bondIds',
): Dispatch<SetStateAction<string[]>> {
  return value => {
    const prev = store.getSelection()[key];
    const next = typeof value === 'function' ? value(prev) : value;
    store.setSelection({ [key]: next });
  };
}

function makeNullableIdSetter(
  store: MoleculeEditor,
  key:
    | 'canvasTextId'
    | 'reactionArrowId'
    | 'canvasImageId'
    | 'sruBracketId'
    | 'colorEditStrokeId'
    | 'colorEditCanvasShapeId',
): Dispatch<SetStateAction<string | null>> {
  return value => {
    const prev = store.getSelection()[key];
    const next = typeof value === 'function' ? value(prev) : value;
    store.setSelection({ [key]: next });
  };
}

export function useMoleculeEditor(store: MoleculeEditor) {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  const { molecule, selection, pastLength, futureLength } = snapshot;

  const selectedAtomIds = selection.atomIds;
  const selectedBondIds = selection.bondIds;
  const selectedCanvasTextId = selection.canvasTextId;
  const selectedReactionArrowId = selection.reactionArrowId;
  const selectedCanvasImageId = selection.canvasImageId;
  const selectedSruBracketId = selection.sruBracketId;
  const colorEditStrokeId = selection.colorEditStrokeId;
  const colorEditCanvasShapeId = selection.colorEditCanvasShapeId;

  const selectedAtomIdsRef = useRef(selectedAtomIds);
  selectedAtomIdsRef.current = selectedAtomIds;

  const setSelectedAtomIds = useMemo(() => makeIdSetter(store, 'atomIds'), [store]);
  const setSelectedBondIds = useMemo(() => makeIdSetter(store, 'bondIds'), [store]);
  const setSelectedCanvasTextId = useMemo(
    () => makeNullableIdSetter(store, 'canvasTextId'),
    [store],
  );
  const setSelectedReactionArrowId = useMemo(
    () => makeNullableIdSetter(store, 'reactionArrowId'),
    [store],
  );
  const setSelectedCanvasImageId = useMemo(
    () => makeNullableIdSetter(store, 'canvasImageId'),
    [store],
  );
  const setSelectedSruBracketId = useMemo(
    () => makeNullableIdSetter(store, 'sruBracketId'),
    [store],
  );
  const setColorEditStrokeId = useMemo(
    () => makeNullableIdSetter(store, 'colorEditStrokeId'),
    [store],
  );
  const setColorEditCanvasShapeId = useMemo(
    () => makeNullableIdSetter(store, 'colorEditCanvasShapeId'),
    [store],
  );

  const applyCommand = useCallback(
    (commandId: string, input: unknown) => store.applyCommand(commandId, input),
    [store],
  );
  const undo = useCallback(() => store.undo(), [store]);
  const redo = useCallback(() => store.redo(), [store]);
  const clearSelection = useCallback(() => store.clearSelection(), [store]);
  const setSelection = useCallback(
    (patch: Partial<MoleculeSelection>) => store.setSelection(patch),
    [store],
  );

  const [selectionFragmentRotationRad, setSelectionFragmentRotationRad] = useState(0);
  const selectedAtomIdsKey = useMemo(
    () => [...selectedAtomIds].sort().join('|'),
    [selectedAtomIds],
  );
  useEffect(() => {
    setSelectionFragmentRotationRad(0);
  }, [selectedAtomIdsKey]);

  const arrangeSelectionAtomIds = useMemo(
    () => expandAtomIdsToConnectedFragments(molecule, selectedAtomIds),
    [molecule, selectedAtomIds],
  );
  const selectedFragmentCount = useMemo(
    () => selectedDocumentFragmentBoxes(molecule, arrangeSelectionAtomIds).length,
    [molecule, arrangeSelectionAtomIds],
  );
  const selectedAnnotationCount =
    (selection.reactionArrowIds?.length ?? 0) +
    (selection.strokeIds?.length ?? 0) +
    (selection.canvasTextIds?.length ?? 0) +
    (selection.canvasShapeIds?.length ?? 0) +
    (selection.canvasImageIds?.length ?? 0) +
    (selection.canvasOrbitalIds?.length ?? 0) +
    (selectedSruBracketId ? 1 : 0);
  const selectedObjectCount = selectedFragmentCount + selectedAnnotationCount;
  const canArrangeSelection = selectedFragmentCount > 1 || selectedObjectCount > 1;
  const canCircularArray =
    arrangeSelectionAtomIds.length > 0 ||
    selectedAtomIds.some(id => id.startsWith('ia:')) ||
    Boolean(
      molecule.instanceArrays?.some(a =>
        a.seedAtomIds.some(id => selectedAtomIds.includes(id)),
      ),
    );

  const circularScrubBaselineRef = useRef<Molecule | null>(null);
  const cofScrubBaselineRef = useRef<Molecule | null>(null);

  const handleArrangeSelection = useCallback(
    (action: SelectionArrangeAction, options?: SelectionArrangeOptions) => {
      if (!canArrangeSelection) return;
      const alignMode =
        action === 'alignTop'
          ? 'top'
          : action === 'alignBottom'
            ? 'bottom'
            : action === 'alignCenter'
              ? 'center'
              : action === 'alignLeft'
                ? 'left'
                : action === 'alignRight'
                  ? 'right'
                  : action === 'alignCenterX'
                    ? 'centerX'
                    : null;
      if (alignMode) {
        applyCommand(CMD.AlignSelectedFragments, {
          atomIds: arrangeSelectionAtomIds,
          mode: alignMode,
        });
        return;
      }
      const axis =
        action === 'distributeHorizontal'
          ? 'horizontal'
          : action === 'distributeVertical'
            ? 'vertical'
            : action === 'layoutGrid'
              ? 'grid'
              : action === 'layoutCircle'
                ? 'circle'
                : null;
      if (!axis) return;
      applyCommand(CMD.DistributeSelectedFragments, {
        atomIds: arrangeSelectionAtomIds,
        axis,
        ...(axis === 'circle' && options?.radius != null
          ? { radius: options.radius }
          : {}),
      });
      if (axis === 'grid' || axis === 'circle') {
        applyCommand(CMD.GroupSelection, {
          atomIds: arrangeSelectionAtomIds,
          name: axis === 'grid' ? 'Grid' : 'Circle',
        });
      }
    },
    [applyCommand, arrangeSelectionAtomIds, canArrangeSelection],
  );

  const handleReflectSelection = useCallback(
    (axis: SelectionReflectAxis) => {
      if (colorEditCanvasShapeId) {
        applyCommand(CMD.ReflectCanvasShape, { id: colorEditCanvasShapeId, axis });
        return;
      }
      const ids =
        arrangeSelectionAtomIds.length > 0 ? arrangeSelectionAtomIds : selectedAtomIds;
      if (ids.length === 0) return;
      const aabb = getSelectionAabb(molecule, ids);
      if (!aabb) return;
      applyCommand(CMD.ReflectAtoms, {
        atomIds: ids,
        cx: aabb.cx,
        cy: aabb.cy,
        axis,
      });
    },
    [
      applyCommand,
      arrangeSelectionAtomIds,
      molecule,
      selectedAtomIds,
      colorEditCanvasShapeId,
    ],
  );

  const handleCircularArray = useCallback(
    (params: CircularArrayParams): string[] => {
      const atomIds = params.atomIds.length > 0 ? params.atomIds : arrangeSelectionAtomIds;

      if (params.commitLive) {
        const baseline = circularScrubBaselineRef.current;
        circularScrubBaselineRef.current = null;
        if (baseline) store.commitUndoFromBaseline(baseline);
        return [];
      }

      if (atomIds.length === 0) return [];

      const selectSeed = () => {
        setSelection({
          atomIds,
          bondIds: [],
          canvasTextId: null,
          reactionArrowId: null,
        });
      };

      if (params.live) {
        if (!circularScrubBaselineRef.current) {
          circularScrubBaselineRef.current = store.getMolecule();
        }
        let virtualIds: string[] = [];
        store.replacePresentWithoutHistory(prev => {
          const r = circularArrayAtoms(prev, atomIds, {
            count: params.count,
            radius: params.radius,
            ...(params.spacingDeg != null ? { spacingDeg: params.spacingDeg } : {}),
            rotate: params.rotate,
          });
          virtualIds = r.newAtomIds;
          return collectAtomsAsObjectCollection(r.molecule, atomIds, 'Circular array');
        });
        selectSeed();
        return virtualIds;
      }

      const result = applyCommand(CMD.CircularArraySelection, {
        atomIds,
        count: params.count,
        radius: params.radius,
        ...(params.spacingDeg != null ? { spacingDeg: params.spacingDeg } : {}),
        rotate: params.rotate,
        ...(params.replaceAtomIds?.length ? { replaceAtomIds: params.replaceAtomIds } : {}),
      });
      if (
        result.ok &&
        result.extra &&
        typeof result.extra === 'object' &&
        'newAtomIds' in result.extra
      ) {
        const extra = result.extra as { allAtomIds: string[]; newAtomIds: string[] };
        selectSeed();
        return extra.newAtomIds ?? [];
      }
      return [];
    },
    [applyCommand, arrangeSelectionAtomIds, setSelection, store],
  );

  const handleLinearArray = useCallback(
    (params: LinearArrayParams): string[] => {
      const atomIds = params.atomIds.length > 0 ? params.atomIds : arrangeSelectionAtomIds;

      if (params.commitLive) {
        const baseline = circularScrubBaselineRef.current;
        circularScrubBaselineRef.current = null;
        if (baseline) store.commitUndoFromBaseline(baseline);
        return [];
      }

      if (atomIds.length === 0) return [];

      const selectSeed = () => {
        setSelection({
          atomIds,
          bondIds: [],
          canvasTextId: null,
          reactionArrowId: null,
        });
      };

      if (params.live) {
        if (!circularScrubBaselineRef.current) {
          circularScrubBaselineRef.current = store.getMolecule();
        }
        let virtualIds: string[] = [];
        store.replacePresentWithoutHistory(prev => {
          const r = linearArrayAtoms(prev, atomIds, {
            count: params.count,
            spacingPx: params.spacingPx,
            rotate: params.rotate,
          });
          virtualIds = r.newAtomIds;
          return collectAtomsAsObjectCollection(r.molecule, atomIds, 'Linear array');
        });
        selectSeed();
        return virtualIds;
      }

      const result = applyCommand(CMD.LinearArraySelection, {
        atomIds,
        count: params.count,
        spacingPx: params.spacingPx,
        rotate: params.rotate,
        ...(params.replaceAtomIds?.length ? { replaceAtomIds: params.replaceAtomIds } : {}),
      });
      if (
        result.ok &&
        result.extra &&
        typeof result.extra === 'object' &&
        'newAtomIds' in result.extra
      ) {
        const extra = result.extra as { allAtomIds: string[]; newAtomIds: string[] };
        selectSeed();
        return extra.newAtomIds ?? [];
      }
      return [];
    },
    [applyCommand, arrangeSelectionAtomIds, setSelection, store],
  );

  const handleDendrimerArray = useCallback(
    (params: DendrimerArrayParams): string[] => {
      const atomIds = params.atomIds.length > 0 ? params.atomIds : arrangeSelectionAtomIds;

      if (params.commitLive) {
        const baseline = circularScrubBaselineRef.current;
        circularScrubBaselineRef.current = null;
        if (baseline) store.commitUndoFromBaseline(baseline);
        return [];
      }

      if (atomIds.length === 0) return [];

      const selectGroup = (ids: string[]) => {
        setSelection({
          atomIds: ids,
          bondIds: [],
          canvasTextId: null,
          reactionArrowId: null,
        });
      };

      if (params.live) {
        if (!circularScrubBaselineRef.current) {
          circularScrubBaselineRef.current = store.getMolecule();
        }
        let virtualIds: string[] = [];
        let groupIds = atomIds;
        store.replacePresentWithoutHistory(prev => {
          const r = dendrimerArrayAtoms(prev, atomIds, { foldCount: params.foldCount });
          virtualIds = r.newAtomIds;
          groupIds = r.allAtomIds;
          return r.molecule;
        });
        selectGroup(groupIds);
        return virtualIds;
      }

      const result = applyCommand(CMD.DendrimerArraySelection, {
        atomIds,
        foldCount: params.foldCount,
      });
      if (
        result.ok &&
        result.extra &&
        typeof result.extra === 'object' &&
        'newAtomIds' in result.extra
      ) {
        const extra = result.extra as { allAtomIds: string[]; newAtomIds: string[] };
        selectGroup(extra.allAtomIds?.length ? extra.allAtomIds : atomIds);
        return extra.newAtomIds ?? [];
      }
      return [];
    },
    [applyCommand, arrangeSelectionAtomIds, setSelection, store],
  );

  const handleGenerateGraphene = useCallback(
    (params: GrapheneGenerateParams): string[] => {
      const result = applyCommand(CMD.GenerateGraphene, {
        cols: params.cols,
        rows: params.rows,
        shape: params.shape,
        bondLengthPx: params.bondLengthPx,
        cx: params.cx,
        cy: params.cy,
        ...(params.replaceAtomIds?.length ? { replaceAtomIds: params.replaceAtomIds } : {}),
      });
      if (
        result.ok &&
        result.extra &&
        typeof result.extra === 'object' &&
        'allAtomIds' in result.extra
      ) {
        const extra = result.extra as { allAtomIds: string[]; newAtomIds: string[] };
        setSelection({
          atomIds: extra.allAtomIds,
          bondIds: [],
          canvasTextId: null,
          reactionArrowId: null,
        });
        // The whole sheet — the toolbar feeds this back as `replaceAtomIds`
        // so the next size change grows the same sheet incrementally.
        return extra.allAtomIds ?? [];
      }
      return [];
    },
    [applyCommand, setSelection],
  );

  const handleGenerateCof = useCallback(
    (params: CofGenerateParams): CofGenerateResult => {
      const empty: CofGenerateResult = { atomIds: [] };

      const input = {
        presetId: params.presetId,
        cols: params.cols,
        rows: params.rows,
        layers: params.layers ?? 1,
        bondLength: params.bondLengthPx,
        cx: params.cx,
        cy: params.cy,
        ...(params.replaceAtomIds?.length ? { replaceAtomIds: params.replaceAtomIds } : {}),
        ...(params.latticeId ? { latticeId: params.latticeId } : {}),
      };

      if (params.commitLive) {
        const baseline = cofScrubBaselineRef.current;
        cofScrubBaselineRef.current = null;
        if (!baseline) return { atomIds: params.replaceAtomIds ?? [] };
        let extra: CofGenerateResult = empty;
        store.replacePresentWithoutHistory(prev => {
          const r = generateCofInMolecule(prev, input);
          extra = { atomIds: r.allAtomIds, latticeId: r.latticeId };
          return r.molecule;
        });
        store.commitUndoFromBaseline(baseline);
        if (extra.atomIds.length) {
          setSelection({
            atomIds: extra.atomIds,
            bondIds: [],
            canvasTextId: null,
            reactionArrowId: null,
          });
        }
        return extra;
      }

      if (params.live) {
        if (!cofScrubBaselineRef.current) {
          cofScrubBaselineRef.current = store.getMolecule();
        }
        let extra: CofGenerateResult = empty;
        store.replacePresentWithoutHistory(prev => {
          // Same incremental path as commit: existing lattice atoms keep their
          // ids and positions, so pointer-up never re-instances the sheet.
          const r = generateCofInMolecule(prev, input);
          extra = { atomIds: r.allAtomIds, latticeId: r.latticeId };
          return r.molecule;
        });
        return extra;
      }

      const result = applyCommand(CMD.GenerateCof, {
        presetId: params.presetId,
        cols: params.cols,
        rows: params.rows,
        layers: params.layers ?? 1,
        bondLengthPx: params.bondLengthPx,
        cx: params.cx,
        cy: params.cy,
        ...(params.replaceAtomIds?.length ? { replaceAtomIds: params.replaceAtomIds } : {}),
        ...(params.latticeId ? { latticeId: params.latticeId } : {}),
      });
      if (
        result.ok &&
        result.extra &&
        typeof result.extra === 'object' &&
        'allAtomIds' in result.extra
      ) {
        const extra = result.extra as {
          allAtomIds: string[];
          newAtomIds: string[];
          latticeId?: string;
        };
        setSelection({
          atomIds: extra.allAtomIds,
          bondIds: [],
          canvasTextId: null,
          reactionArrowId: null,
        });
        return { atomIds: extra.allAtomIds, latticeId: extra.latticeId };
      }
      return empty;
    },
    [applyCommand, setSelection, store],
  );

  const handleGenerateDendrimer = useCallback(
    (params: { presetId: string; bondLengthPx: number; cx: number; cy: number }): string[] => {
      const result = applyCommand(CMD.GenerateDendrimer, {
        presetId: params.presetId,
        bondLengthPx: params.bondLengthPx,
        cx: params.cx,
        cy: params.cy,
      });
      if (
        result.ok &&
        result.extra &&
        typeof result.extra === 'object' &&
        'allAtomIds' in result.extra
      ) {
        const extra = result.extra as { allAtomIds: string[]; newAtomIds: string[] };
        setSelection({
          atomIds: extra.allAtomIds,
          bondIds: [],
          canvasTextId: null,
          reactionArrowId: null,
        });
        return extra.newAtomIds ?? [];
      }
      return [];
    },
    [applyCommand, setSelection],
  );

  const handleGeneratePolymer = useCallback(
    (params: { presetId: string; bondLengthPx: number; cx: number; cy: number }): string[] => {
      const result = applyCommand(CMD.GeneratePolymer, {
        presetId: params.presetId,
        bondLengthPx: params.bondLengthPx,
        cx: params.cx,
        cy: params.cy,
      });
      if (
        result.ok &&
        result.extra &&
        typeof result.extra === 'object' &&
        'allAtomIds' in result.extra
      ) {
        const extra = result.extra as { allAtomIds: string[]; newAtomIds: string[] };
        setSelection({
          atomIds: extra.allAtomIds,
          bondIds: [],
          canvasTextId: null,
          reactionArrowId: null,
        });
        return extra.newAtomIds ?? [];
      }
      return [];
    },
    [applyCommand, setSelection],
  );

  const selectedCanvasText = useMemo((): CanvasText | null => {
    if (!selectedCanvasTextId) return null;
    return molecule.canvasTexts?.find(t => t.id === selectedCanvasTextId) ?? null;
  }, [selectedCanvasTextId, molecule.canvasTexts]);

  const selectedReactionArrow = useMemo((): ReactionArrow | null => {
    if (!selectedReactionArrowId) return null;
    return molecule.reactionArrows?.find(a => a.id === selectedReactionArrowId) ?? null;
  }, [selectedReactionArrowId, molecule.reactionArrows]);

  return {
    store,
    molecule,
    selection,
    applyCommand,
    undo,
    redo,
    canUndo: pastLength > 0,
    canRedo: futureLength > 0,
    /** Compatibility with TopBar that previously read history.past.length. */
    historyPastLength: pastLength,
    historyFutureLength: futureLength,

    selectedAtomIds,
    setSelectedAtomIds,
    selectedBondIds,
    setSelectedBondIds,
    selectedAtomIdsRef,
    selectedAtomIdsKey,
    arrangeSelectionAtomIds,
    selectedFragmentCount,
    selectedObjectCount,
    canArrangeSelection,
    canCircularArray,
    handleArrangeSelection,
    handleCircularArray,
    handleLinearArray,
    handleDendrimerArray,
    handleGenerateGraphene,
    handleGenerateDendrimer,
    handleGeneratePolymer,
    handleGenerateCof,
    handleReflectSelection,
    selectionFragmentRotationRad,
    setSelectionFragmentRotationRad,
    selectedCanvasTextId,
    setSelectedCanvasTextId,
    selectedCanvasText,
    colorEditStrokeId,
    setColorEditStrokeId,
    colorEditCanvasShapeId,
    setColorEditCanvasShapeId,
    selectedReactionArrowId,
    setSelectedReactionArrowId,
    selectedCanvasImageId,
    setSelectedCanvasImageId,
    selectedSruBracketId,
    setSelectedSruBracketId,
    selectedReactionArrow,
    clearSelection,
    setSelection,
  };
}

export type UseMoleculeEditor = ReturnType<typeof useMoleculeEditor>;
