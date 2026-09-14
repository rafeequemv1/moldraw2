/**
 * Embed-oriented canvas: molecule + selection from {@link MoleculeEditor},
 * default draw/mutate handlers via {@link useDefaultCanvasCommands}.
 * Host may override any InfiniteCanvas mutation prop; use `onBondAdded` for
 * auto-cleanup without replacing `onAddBond`.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type SetStateAction,
} from 'react';
import type { MoleculeEditor } from '@moldraw/core/editor';
import {
  InfiniteCanvas,
  type InfiniteCanvasHandle,
  type InfiniteCanvasProps,
} from './InfiniteCanvas';
import { useDefaultCanvasCommands } from './useDefaultCanvasCommands';

export type MoldrawCanvasProps = Omit<
  InfiniteCanvasProps,
  | 'molecule'
  | 'selectedAtomIds'
  | 'selectedBondIds'
  | 'selectedCanvasTextId'
  | 'selectedReactionArrowId'
  | 'setSelectedAtomIds'
  | 'setSelectedBondIds'
  | 'setSelectedCanvasTextId'
  | 'setSelectedReactionArrowId'
> & {
  store: MoleculeEditor;
  onMount?: (editor: MoleculeEditor) => void;
  /** After default addBond — e.g. auto-cleanup recording. */
  onBondAdded?: (fromAtomId: string, toAtomId: string) => void;
  /** Font defaults for newly placed canvas text. */
  canvasTextFontFamily?: string;
  canvasTextFontSizePt?: number;
};

export const MoldrawCanvas = forwardRef<InfiniteCanvasHandle, MoldrawCanvasProps>(
  function MoldrawCanvas(
    {
      store,
      onMount,
      onBondAdded,
      canvasTextFontFamily,
      canvasTextFontSizePt,
      activeTool,
      placementElement,
      displayPrefs,
      onAddAtom: onAddAtomOverride,
      onAddBond: onAddBondOverride,
      onUpdateBond: onUpdateBondOverride,
      onFlipBond: onFlipBondOverride,
      onAddRing: onAddRingOverride,
      onAddBoatRing: onAddBoatRingOverride,
      onAddChairRing: onAddChairRingOverride,
      onAddChain: onAddChainOverride,
      onUpdateAtomCharge: onUpdateAtomChargeOverride,
      onUpdateAtomLonePairs: onUpdateAtomLonePairsOverride,
      onUpdateAtomElement: onUpdateAtomElementOverride,
      onApplyRingFill: onApplyRingFillOverride,
      onAddStroke: onAddStrokeOverride,
      onAddCanvasShape: onAddCanvasShapeOverride,
      onEraseAt: onEraseAtOverride,
      onAddReactionArrow: onAddReactionArrowOverride,
      onUpdateReactionArrow: onUpdateReactionArrowOverride,
      onAddCanvasText: onAddCanvasTextOverride,
      onUpdateCanvasText: onUpdateCanvasTextOverride,
      onMoveAtoms: onMoveAtomsOverride,
      onRotateSelectionCommit: onRotateSelectionCommitOverride,
      selectionFragmentRotationRad: selectionFragmentRotationRadOverride,
      ...restCanvasProps
    },
    ref,
  ) {
    const snapshot = useSyncExternalStore(
      store.subscribe,
      store.getSnapshot,
      store.getSnapshot,
    );

    const onMountRef = useRef(onMount);
    onMountRef.current = onMount;
    useEffect(() => {
      onMountRef.current?.(store);
    }, [store]);

    const textDefaults = useMemo(
      () => ({
        fontFamily: canvasTextFontFamily,
        fontSizePt: canvasTextFontSizePt,
      }),
      [canvasTextFontFamily, canvasTextFontSizePt],
    );

    const defaults = useDefaultCanvasCommands({
      store,
      activeTool,
      placementElement,
      bondLengthPx: displayPrefs.bondLengthPx,
      textDefaults,
      onBondAdded,
    });

    const selectedAtomIdsKey = useMemo(
      () => [...snapshot.selection.atomIds].sort().join('|'),
      [snapshot.selection.atomIds],
    );
    useEffect(() => {
      defaults.setSelectionFragmentRotationRad(0);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on selection change only
    }, [selectedAtomIdsKey]);

    const setSelectedAtomIds = useCallback(
      (value: SetStateAction<string[]>) => {
        const prev = store.getSelection().atomIds;
        const next = typeof value === 'function' ? value(prev) : value;
        store.setSelection({ atomIds: next });
      },
      [store],
    );
    const setSelectedBondIds = useCallback(
      (value: SetStateAction<string[]>) => {
        const prev = store.getSelection().bondIds;
        const next = typeof value === 'function' ? value(prev) : value;
        store.setSelection({ bondIds: next });
      },
      [store],
    );
    const setSelectedCanvasTextId = useCallback(
      (value: SetStateAction<string | null>) => {
        const prev = store.getSelection().canvasTextId;
        const next = typeof value === 'function' ? value(prev) : value;
        store.setSelection({ canvasTextId: next });
      },
      [store],
    );
    const setSelectedReactionArrowId = useCallback(
      (value: SetStateAction<string | null>) => {
        const prev = store.getSelection().reactionArrowId;
        const next = typeof value === 'function' ? value(prev) : value;
        store.setSelection({ reactionArrowId: next });
      },
      [store],
    );

    return (
      <InfiniteCanvas
        ref={ref}
        {...restCanvasProps}
        activeTool={activeTool}
        placementElement={placementElement}
        displayPrefs={displayPrefs}
        onAddAtom={onAddAtomOverride ?? defaults.onAddAtom}
        onAddBond={onAddBondOverride ?? defaults.onAddBond}
        onUpdateBond={onUpdateBondOverride ?? defaults.onUpdateBond}
        onFlipBond={onFlipBondOverride ?? defaults.onFlipBond}
        onAddRing={onAddRingOverride ?? defaults.onAddRing}
        onAddBoatRing={onAddBoatRingOverride ?? defaults.onAddBoatRing}
        onAddChairRing={onAddChairRingOverride ?? defaults.onAddChairRing}
        onAddChain={onAddChainOverride ?? defaults.onAddChain}
        onUpdateAtomCharge={onUpdateAtomChargeOverride ?? defaults.onUpdateAtomCharge}
        onUpdateAtomLonePairs={
          onUpdateAtomLonePairsOverride ?? defaults.onUpdateAtomLonePairs
        }
        onUpdateAtomElement={onUpdateAtomElementOverride ?? defaults.onUpdateAtomElement}
        onApplyRingFill={onApplyRingFillOverride ?? defaults.onApplyRingFill}
        onAddStroke={onAddStrokeOverride ?? defaults.onAddStroke}
        onAddCanvasShape={onAddCanvasShapeOverride ?? defaults.onAddCanvasShape}
        onEraseAt={onEraseAtOverride ?? defaults.onEraseAt}
        onAddReactionArrow={onAddReactionArrowOverride ?? defaults.onAddReactionArrow}
        onUpdateReactionArrow={
          onUpdateReactionArrowOverride ?? defaults.onUpdateReactionArrow
        }
        onAddCanvasText={onAddCanvasTextOverride ?? defaults.onAddCanvasText}
        onUpdateCanvasText={onUpdateCanvasTextOverride ?? defaults.onUpdateCanvasText}
        onMoveAtoms={onMoveAtomsOverride ?? defaults.onMoveAtoms}
        onRotateSelectionCommit={
          onRotateSelectionCommitOverride ?? defaults.onRotateSelectionCommit
        }
        selectionFragmentRotationRad={
          selectionFragmentRotationRadOverride ?? defaults.selectionFragmentRotationRad
        }
        molecule={snapshot.molecule}
        selectedAtomIds={snapshot.selection.atomIds}
        selectedBondIds={snapshot.selection.bondIds}
        selectedCanvasTextId={snapshot.selection.canvasTextId}
        selectedReactionArrowId={snapshot.selection.reactionArrowId}
        setSelectedAtomIds={setSelectedAtomIds}
        setSelectedBondIds={setSelectedBondIds}
        setSelectedCanvasTextId={setSelectedCanvasTextId}
        setSelectedReactionArrowId={setSelectedReactionArrowId}
      />
    );
  },
);

export type { InfiniteCanvasHandle };
