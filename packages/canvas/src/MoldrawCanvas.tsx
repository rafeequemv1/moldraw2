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
import { hasPerspectivePose, projectPerspectiveForDisplay, type MoleculeEditor } from '@moldraw/core';
import {
  InfiniteCanvas,
  type InfiniteCanvasHandle,
  type InfiniteCanvasProps,
} from './InfiniteCanvas';
import { useDefaultCanvasCommands } from './useDefaultCanvasCommands';
import { applyCanvasVisibility, type HiddenCanvasIds } from './canvasVisibility';

export type MoldrawCanvasProps = Omit<
  InfiniteCanvasProps,
  | 'molecule'
  | 'selectedAtomIds'
  | 'selectedBondIds'
  | 'selectedCanvasTextId'
  | 'selectedReactionArrowId'
  | 'selectedCanvasImageId'
  | 'selectedSruBracketId'
  | 'setSelectedAtomIds'
  | 'setSelectedBondIds'
  | 'setSelectedCanvasTextId'
  | 'setColorEditCanvasShapeId'
  | 'setColorEditStrokeId'
  | 'selectedCanvasShapeId'
  | 'selectedStrokeId'
  | 'setSelectedReactionArrowId'
  | 'setSelectedCanvasImageId'
  | 'setSelectedSruBracketId'
> & {
  store: MoleculeEditor;
  onMount?: (editor: MoleculeEditor) => void;
  /** After default addBond — e.g. auto-cleanup recording. */
  onBondAdded?: (fromAtomId: string, toAtomId: string) => void;
  /** Font defaults for newly placed canvas text. */
  canvasTextFontFamily?: string;
  canvasTextFontSizePt?: number;
  /** Session hide keys — filters display/hit-test only (store stays full). */
  hiddenObjectIds?: HiddenCanvasIds;
  /** Subscript preset for new polymer SRU brackets. */
  sruBracketSubscript?: string;
  /** Formal-charge mark selection (Delete clears charge). */
  selectedChargeAtomIds?: string[];
  setSelectedChargeAtomIds?: (ids: string[]) => void;
};

export const MoldrawCanvas = forwardRef<InfiniteCanvasHandle, MoldrawCanvasProps>(
  function MoldrawCanvas(
    {
      store,
      onMount,
      onBondAdded,
      canvasTextFontFamily,
      canvasTextFontSizePt,
      hiddenObjectIds,
      activeTool,
      placementElement,
      displayPrefs,
      sruBracketSubscript,
      onAddAtom: onAddAtomOverride,
      onAddBond: onAddBondOverride,
      onUpdateBond: onUpdateBondOverride,
      onFlipBond: onFlipBondOverride,
      onAddRing: onAddRingOverride,
      onAddBoatRing: onAddBoatRingOverride,
      onAddChairRing: onAddChairRingOverride,
      onAddChain: onAddChainOverride,
      onUpdateAtomCharge: onUpdateAtomChargeOverride,
      onSetAtomCharge: onSetAtomChargeOverride,
      onSetAtomDeltaCharge: onSetAtomDeltaChargeOverride,
      onSetAtomChargeOffset: onSetAtomChargeOffsetOverride,
      onSetAtomDeltaChargeOffset: onSetAtomDeltaChargeOffsetOverride,
      onUpdateAtomLonePairs: onUpdateAtomLonePairsOverride,
      onSetAtomRadical: onSetAtomRadicalOverride,
      onSetAtomRadicalIon: onSetAtomRadicalIonOverride,
      onAddExplicitHydrogen: onAddExplicitHydrogenOverride,
      onUpdateAtomElement: onUpdateAtomElementOverride,
      onApplyRingFill: onApplyRingFillOverride,
      onAddStroke: onAddStrokeOverride,
      onTranslateStroke: onTranslateStrokeOverride,
      onAddCanvasShape: onAddCanvasShapeOverride,
      onAddCanvasOrbital: onAddCanvasOrbitalOverride,
      onUpdateCanvasOrbital: onUpdateCanvasOrbitalOverride,
      onUpdateCanvasShape: onUpdateCanvasShapeOverride,
      onTranslateCanvasShapes: onTranslateCanvasShapesOverride,
      onAddSruBracketAroundAtoms: onAddSruBracketAroundAtomsOverride,
      onEraseAt: onEraseAtOverride,
      onAddReactionArrow: onAddReactionArrowOverride,
      onUpdateReactionArrow: onUpdateReactionArrowOverride,
      onAddCanvasText: onAddCanvasTextOverride,
      onUpdateCanvasText: onUpdateCanvasTextOverride,
      onUpdateCanvasImage: onUpdateCanvasImageOverride,
      onMoveAtoms: onMoveAtomsOverride,
      onRotateSelectionCommit: onRotateSelectionCommitOverride,
      onScaleSelectionCommit: onScaleSelectionCommitOverride,
      onRotate3DPoseCommit: onRotate3DPoseCommitProp,
      onPerspectivePosePreview: onPerspectivePosePreviewProp,
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

    const perspectiveOn = hasPerspectivePose(snapshot.molecule);
    // Hit-testing uses projected coords while a pose is active.
    const displayMolecule = useMemo(() => {
      const base = perspectiveOn
        ? projectPerspectiveForDisplay(snapshot.molecule).molecule
        : snapshot.molecule;
      return applyCanvasVisibility(base, hiddenObjectIds);
    }, [snapshot.molecule, perspectiveOn, hiddenObjectIds]);

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
      sruBracketSubscript,
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
    const setColorEditCanvasShapeId = useCallback(
      (value: SetStateAction<string | null>) => {
        const prev = store.getSelection().colorEditCanvasShapeId;
        const next = typeof value === 'function' ? value(prev) : value;
        store.setSelection({ colorEditCanvasShapeId: next });
      },
      [store],
    );
    const setColorEditStrokeId = useCallback(
      (value: SetStateAction<string | null>) => {
        const prev = store.getSelection().colorEditStrokeId;
        const next = typeof value === 'function' ? value(prev) : value;
        store.setSelection({ colorEditStrokeId: next });
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
    const setSelectedCanvasImageId = useCallback(
      (value: SetStateAction<string | null>) => {
        const prev = store.getSelection().canvasImageId;
        const next = typeof value === 'function' ? value(prev) : value;
        store.setSelection({ canvasImageId: next });
      },
      [store],
    );
    const setSelectedSruBracketId = useCallback(
      (value: SetStateAction<string | null>) => {
        const prev = store.getSelection().sruBracketId;
        const next = typeof value === 'function' ? value(prev) : value;
        store.setSelection({ sruBracketId: next });
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
        onSetAtomCharge={onSetAtomChargeOverride ?? defaults.onSetAtomCharge}
        onSetAtomDeltaCharge={
          onSetAtomDeltaChargeOverride ?? defaults.onSetAtomDeltaCharge
        }
        onSetAtomChargeOffset={
          onSetAtomChargeOffsetOverride ?? defaults.onSetAtomChargeOffset
        }
        onSetAtomDeltaChargeOffset={
          onSetAtomDeltaChargeOffsetOverride ?? defaults.onSetAtomDeltaChargeOffset
        }
        onUpdateAtomLonePairs={
          onUpdateAtomLonePairsOverride ?? defaults.onUpdateAtomLonePairs
        }
        onSetAtomRadical={onSetAtomRadicalOverride ?? defaults.onSetAtomRadical}
        onSetAtomRadicalIon={
          onSetAtomRadicalIonOverride ?? defaults.onSetAtomRadicalIon
        }
        onAddExplicitHydrogen={
          onAddExplicitHydrogenOverride ?? defaults.onAddExplicitHydrogen
        }
        onUpdateAtomElement={onUpdateAtomElementOverride ?? defaults.onUpdateAtomElement}
        onApplyRingFill={onApplyRingFillOverride ?? defaults.onApplyRingFill}
        onAddStroke={onAddStrokeOverride ?? defaults.onAddStroke}
        onTranslateStroke={onTranslateStrokeOverride ?? defaults.onTranslateStroke}
        onAddCanvasShape={onAddCanvasShapeOverride ?? defaults.onAddCanvasShape}
        onAddCanvasOrbital={onAddCanvasOrbitalOverride ?? defaults.onAddCanvasOrbital}
        onUpdateCanvasOrbital={onUpdateCanvasOrbitalOverride ?? defaults.onUpdateCanvasOrbital}
        selectedCanvasOrbitalIds={snapshot.selection.canvasOrbitalIds}
        setSelectedCanvasOrbitalIds={ids => store.setSelection({ canvasOrbitalIds: ids })}
        onUpdateCanvasShape={onUpdateCanvasShapeOverride ?? defaults.onUpdateCanvasShape}
        onTranslateCanvasShapes={
          onTranslateCanvasShapesOverride ?? defaults.onTranslateCanvasShapes
        }
        onAddSruBracketAroundAtoms={
          onAddSruBracketAroundAtomsOverride ?? defaults.onAddSruBracketAroundAtoms
        }
        onEraseAt={onEraseAtOverride ?? defaults.onEraseAt}
        onAddReactionArrow={onAddReactionArrowOverride ?? defaults.onAddReactionArrow}
        onUpdateReactionArrow={
          onUpdateReactionArrowOverride ?? defaults.onUpdateReactionArrow
        }
        onAddCanvasText={onAddCanvasTextOverride ?? defaults.onAddCanvasText}
        onUpdateCanvasText={onUpdateCanvasTextOverride ?? defaults.onUpdateCanvasText}
        onUpdateCanvasImage={onUpdateCanvasImageOverride ?? defaults.onUpdateCanvasImage}
        onMoveAtoms={onMoveAtomsOverride ?? defaults.onMoveAtoms}
        onSetMarqueeSelection={defaults.onSetMarqueeSelection}
        onTranslateMarqueeSelection={defaults.onTranslateMarqueeSelection}
        onRotateSelectionCommit={
          onRotateSelectionCommitOverride ?? defaults.onRotateSelectionCommit
        }
        onScaleSelectionCommit={
          onScaleSelectionCommitOverride ?? defaults.onScaleSelectionCommit
        }
        onRotate3DPoseCommit={onRotate3DPoseCommitProp}
        onPerspectivePosePreview={onPerspectivePosePreviewProp}
        selectionFragmentRotationRad={
          selectionFragmentRotationRadOverride ?? defaults.selectionFragmentRotationRad
        }
        molecule={displayMolecule}
        selectedAtomIds={snapshot.selection.atomIds}
        selectedBondIds={snapshot.selection.bondIds}
        selectedCanvasTextId={snapshot.selection.canvasTextId}
        selectedReactionArrowId={snapshot.selection.reactionArrowId}
        selectedReactionArrowIds={snapshot.selection.reactionArrowIds}
        selectedCanvasImageId={snapshot.selection.canvasImageId}
        selectedCanvasImageIds={snapshot.selection.canvasImageIds}
        selectedCanvasShapeId={snapshot.selection.colorEditCanvasShapeId}
        selectedCanvasShapeIds={snapshot.selection.canvasShapeIds}
        selectedStrokeId={snapshot.selection.colorEditStrokeId}
        selectedStrokeIds={snapshot.selection.strokeIds}
        selectedCanvasTextIds={snapshot.selection.canvasTextIds}
        selectedSruBracketId={snapshot.selection.sruBracketId}
        setSelectedAtomIds={setSelectedAtomIds}
        setSelectedBondIds={setSelectedBondIds}
        setSelectedCanvasTextId={setSelectedCanvasTextId}
        setColorEditCanvasShapeId={setColorEditCanvasShapeId}
        setColorEditStrokeId={setColorEditStrokeId}
        setSelectedReactionArrowId={setSelectedReactionArrowId}
        setSelectedCanvasImageId={setSelectedCanvasImageId}
        setSelectedSruBracketId={setSelectedSruBracketId}
      />
    );
  },
);

export type { InfiniteCanvasHandle };
