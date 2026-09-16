/**
 * Default InfiniteCanvas mutation handlers backed by {@link MoleculeEditor.applyCommand}.
 * Hosts (App) can override any handler via MoldrawCanvas props; use `onBondAdded`
 * for auto-cleanup without replacing `onAddBond`.
 */
import { useCallback, useState } from 'react';
import type {
  Atom,
  Bond,
  CanvasImage,
  CanvasOrbital,
  CanvasShape,
  CanvasText,
  ReactionArrow,
  ReactionArrowUpdatePatch,
  Stroke,
} from '@moldraw/domain';
import type { MoleculeEditor } from '@moldraw/core';
import { CMD } from '@moldraw/core';
import { normalizeHexColor, sruBracketBoxForAtoms } from '@moldraw/core';
import type { EraseHit } from '@moldraw/core';
import type { Point } from './geometry';
import type { InteractionContext } from './interaction';

export interface UseDefaultCanvasCommandsOptions {
  store: MoleculeEditor;
  activeTool?: string;
  placementElement?: string;
  bondLengthPx: number;
  /** Defaults for newly placed canvas text. */
  textDefaults?: {
    fontFamily?: string;
    fontSizePt?: number;
  };
  /** Subscript label for new polymer SRU brackets (toolbar preset). */
  sruBracketSubscript?: string;
  /** Fired after a successful addBond (e.g. auto-cleanup recording). */
  onBondAdded?: (fromAtomId: string, toAtomId: string) => void;
}

export function useDefaultCanvasCommands({
  store,
  activeTool = 'select',
  placementElement = 'C',
  bondLengthPx,
  textDefaults,
  sruBracketSubscript = 'n',
  onBondAdded,
}: UseDefaultCanvasCommandsOptions) {
  const [selectionFragmentRotationRad, setSelectionFragmentRotationRad] = useState(0);

  const applyCommand = useCallback(
    (commandId: string, input: unknown) => store.applyCommand(commandId, input),
    [store],
  );

  const onAddAtom = useCallback(
    (atom: Atom) => {
      applyCommand(CMD.AddAtom, { atom });
    },
    [applyCommand],
  );

  const onAddBond = useCallback(
    (bond: Bond) => {
      applyCommand(CMD.AddBond, { bond });
      onBondAdded?.(bond.fromAtomId, bond.toAtomId);
    },
    [applyCommand, onBondAdded],
  );

  const onUpdateBond = useCallback(
    (
      bondId: string,
      patch: Partial<
        Pick<Bond, 'order' | 'stereo' | 'orderCycleRamp' | 'dative' | 'dotted' | 'aromatic' | 'queryType' | 'bold'>
      >,
    ) => {
      // Zod strips `undefined`; send `null` to clear stereo / ramp / query.
      const input: {
        bondId: string;
        order?: number;
        stereo?: Bond['stereo'] | null;
        dative?: boolean;
        dotted?: boolean;
        aromatic?: boolean;
        queryType?: Bond['queryType'] | null;
        bold?: boolean;
        orderCycleRamp?: 'up' | 'down' | null;
      } = { bondId };
      if (patch.order !== undefined) input.order = patch.order;
      if ('stereo' in patch) input.stereo = patch.stereo ?? null;
      if ('orderCycleRamp' in patch) input.orderCycleRamp = patch.orderCycleRamp ?? null;
      if ('dative' in patch) input.dative = patch.dative;
      if ('dotted' in patch) input.dotted = patch.dotted;
      if ('aromatic' in patch) input.aromatic = patch.aromatic;
      if ('queryType' in patch) input.queryType = patch.queryType ?? null;
      if ('bold' in patch) input.bold = patch.bold;
      applyCommand(CMD.UpdateBond, input);
    },
    [applyCommand],
  );

  const onFlipBond = useCallback(
    (bondId: string) => {
      applyCommand(CMD.FlipBondEndpoints, { bondId });
    },
    [applyCommand],
  );

  const onAddRing = useCallback(
    (
      center: Point,
      numSides: number,
      isBenzene: boolean,
      angleOffset: number,
      rootAtomId?: string,
      attachedViaBond?: boolean,
      fusedBondId?: string,
      angleStep: number = (Math.PI * 2) / numSides,
      radius: number = bondLengthPx,
    ) => {
      applyCommand(CMD.AddRing, {
        center,
        numSides,
        isAromatic: isBenzene,
        isCyclopentadiene: activeTool === 'cyclopentadiene',
        angleOffset,
        rootAtomId,
        attachedViaBond,
        fusedBondId,
        angleStep,
        radius,
      });
    },
    [activeTool, applyCommand, bondLengthPx],
  );

  const onAddBoatRing = useCallback(
    (center: Point, rootAtomId?: string, attachedViaBond?: boolean) => {
      applyCommand(CMD.AddBoatRing, {
        center,
        bondLengthPx,
        rootAtomId,
        attachedViaBond,
      });
    },
    [applyCommand, bondLengthPx],
  );

  const onAddChairRing = useCallback(
    (center: Point, rootAtomId?: string, attachedViaBond?: boolean) => {
      applyCommand(CMD.AddChairRing, {
        center,
        bondLengthPx,
        rootAtomId,
        attachedViaBond,
      });
    },
    [applyCommand, bondLengthPx],
  );

  const onAddChain = useCallback(
    (points: Point[], startAtomId?: string) => {
      applyCommand(CMD.AddChain, {
        points,
        placementElement,
        startAtomId,
      });
    },
    [applyCommand, placementElement],
  );

  const onUpdateAtomCharge = useCallback(
    (atomId: string, delta: number) => {
      applyCommand(CMD.UpdateAtomCharge, { atomId, delta });
    },
    [applyCommand],
  );

  const onSetAtomCharge = useCallback(
    (atomId: string, charge: number, markStyle?: 'plain' | 'circled') => {
      applyCommand(CMD.SetAtomCharge, { atomId, charge, markStyle });
    },
    [applyCommand],
  );

  const onSetAtomDeltaCharge = useCallback(
    (atomId: string, deltaCharge: number) => {
      applyCommand(CMD.SetAtomDeltaCharge, { atomId, deltaCharge });
    },
    [applyCommand],
  );

  const onSetAtomChargeOffset = useCallback(
    (atomId: string, offset: { x: number; y: number } | null) => {
      applyCommand(CMD.SetAtomChargeOffset, { atomId, offset });
    },
    [applyCommand],
  );

  const onSetAtomDeltaChargeOffset = useCallback(
    (atomId: string, offset: { x: number; y: number } | null) => {
      applyCommand(CMD.SetAtomDeltaChargeOffset, { atomId, offset });
    },
    [applyCommand],
  );

  const onUpdateAtomLonePairs = useCallback(
    (atomId: string, delta: number) => {
      applyCommand(CMD.UpdateAtomLonePairs, { atomId, delta });
    },
    [applyCommand],
  );

  const onSetAtomRadical = useCallback(
    (atomId: string, radical: number) => {
      applyCommand(CMD.SetAtomRadical, { atomId, radical });
    },
    [applyCommand],
  );

  const onSetAtomRadicalIon = useCallback(
    (atomId: string, charge: number, radical: number) => {
      applyCommand(CMD.SetAtomRadicalIon, { atomId, charge, radical });
    },
    [applyCommand],
  );

  const onAddExplicitHydrogen = useCallback(
    (atomId: string): boolean => {
      const before = store.getMolecule();
      const result = applyCommand(CMD.AddExplicitHydrogens, {
        atomIds: [atomId],
        bondLengthPx,
        maxPerAtom: 1,
      });
      if (!result.ok) return false;
      return store.getMolecule() !== before;
    },
    [applyCommand, bondLengthPx, store],
  );

  const onUpdateAtomElement = useCallback(
    (atomId: string, element: string) => {
      // Never rewrite a heavy atom into bare H via palette relabel — that
      // destroys structures (Warwick: propanone “falls to bits”).
      if (element === 'H') return;
      applyCommand(CMD.UpdateAtomElement, { atomId, element });
    },
    [applyCommand],
  );

  const onApplyRingFill = useCallback(
    (ringAtomIds: string[], color: string, opacity: number) => {
      if (ringAtomIds.length < 3) return;
      applyCommand(CMD.ApplyRingFill, {
        ringAtomIds,
        color: normalizeHexColor(color),
        opacity,
      });
    },
    [applyCommand],
  );

  const onAddStroke = useCallback(
    (stroke: Stroke) => {
      applyCommand(CMD.AddStroke, { stroke });
    },
    [applyCommand],
  );

  const onTranslateStroke = useCallback(
    (id: string, dx: number, dy: number) => {
      applyCommand(CMD.TranslateStroke, { id, dx, dy });
    },
    [applyCommand],
  );

  const onSetMarqueeSelection = useCallback(
    (patch: Parameters<NonNullable<InteractionContext['onSetMarqueeSelection']>>[0]) => {
      store.setSelection(patch);
    },
    [store],
  );

  const onTranslateMarqueeSelection = useCallback(
    (opts: Parameters<NonNullable<InteractionContext['onTranslateMarqueeSelection']>>[0]) => {
      applyCommand(CMD.TranslateMarqueeSelection, {
        atomIds: opts.atomIds,
        arrowIds: opts.arrowIds,
        strokeIds: opts.strokeIds,
        textIds: opts.textIds,
        shapeIds: opts.shapeIds,
        imageIds: opts.imageIds,
        dx: opts.dx,
        dy: opts.dy,
      });
    },
    [applyCommand],
  );

  const onAddCanvasShape = useCallback(
    (shape: CanvasShape) => {
      applyCommand(CMD.AddCanvasShape, { shape });
    },
    [applyCommand],
  );

  const onAddCanvasOrbital = useCallback(
    (orbital: CanvasOrbital) => {
      applyCommand(CMD.AddCanvasOrbital, { orbital });
    },
    [applyCommand],
  );

  const onUpdateCanvasOrbital = useCallback(
    (
      id: string,
      patch: Partial<Omit<CanvasOrbital, 'id' | 'atomId'>> & { atomId?: string | null },
    ) => {
      applyCommand(CMD.UpdateCanvasOrbital, { id, patch });
    },
    [applyCommand],
  );

  const onUpdateCanvasShape = useCallback(
    (id: string, patch: Partial<Omit<CanvasShape, 'id'>>) => {
      applyCommand(CMD.UpdateCanvasShape, { id, patch });
    },
    [applyCommand],
  );

  const onTranslateCanvasShapes = useCallback(
    (ids: string[], dx: number, dy: number) => {
      applyCommand(CMD.TranslateCanvasShapes, { ids, dx, dy });
    },
    [applyCommand],
  );

  const onAddSruBracketAroundAtoms = useCallback(
    (atomIds: string[]) => {
      if (atomIds.length < 2) return;
      const mol = store.getMolecule();
      const box = sruBracketBoxForAtoms(mol, atomIds);
      if (!box) return;
      const id = Math.random().toString(36).substr(2, 9);
      applyCommand(CMD.AddSruBracket, {
        bracket: {
          id,
          atomIds: [...atomIds],
          ...box,
          subscript: sruBracketSubscript || 'n',
        },
      });
      store.setSelection({
        atomIds: [...atomIds],
        bondIds: [],
        canvasTextId: null,
        reactionArrowId: null,
        canvasImageId: null,
        sruBracketId: id,
      });
    },
    [applyCommand, store, sruBracketSubscript],
  );

  const onEraseAt = useCallback(
    (hit: EraseHit) => {
      applyCommand(CMD.Erase, hit);
      const sel = store.getSelection();
      if (hit.type === 'atom') {
        store.setSelection({ atomIds: sel.atomIds.filter(i => i !== hit.atomId) });
      } else if (hit.type === 'canvasText' && sel.canvasTextId === hit.id) {
        store.setSelection({ canvasTextId: null });
      } else if (hit.type === 'reactionArrow' && sel.reactionArrowId === hit.id) {
        store.setSelection({ reactionArrowId: null });
      } else if (hit.type === 'canvasImage' && sel.canvasImageId === hit.id) {
        store.setSelection({ canvasImageId: null });
      } else if (hit.type === 'stroke' && sel.colorEditStrokeId === hit.strokeId) {
        store.setSelection({ colorEditStrokeId: null });
      } else if (hit.type === 'sruBracket' && sel.sruBracketId === hit.id) {
        store.setSelection({ sruBracketId: null });
      }
    },
    [applyCommand, store],
  );

  const onAddReactionArrow = useCallback(
    (arrow: ReactionArrow) => {
      applyCommand(CMD.AddReactionArrow, { arrow });
    },
    [applyCommand],
  );

  const onUpdateReactionArrow = useCallback(
    (id: string, patch: ReactionArrowUpdatePatch) => {
      applyCommand(CMD.UpdateReactionArrow, { id, ...patch });
    },
    [applyCommand],
  );

  const onAddCanvasText = useCallback(
    (t: CanvasText) => {
      const fontFamily = textDefaults?.fontFamily ?? 'Arial';
      const fontSizePt = textDefaults?.fontSizePt ?? 12;
      const full: CanvasText = {
        fontStyle: 'normal',
        textDecoration: 'none',
        fontFamily,
        ...t,
        fontSize: t.fontSize ?? fontSizePt,
      };
      applyCommand(CMD.AddCanvasText, { text: full });
      store.setSelection({ canvasTextId: full.id });
    },
    [applyCommand, store, textDefaults?.fontFamily, textDefaults?.fontSizePt],
  );

  const onUpdateCanvasText = useCallback(
    (id: string, patch: Partial<CanvasText>) => {
      applyCommand(CMD.UpdateCanvasText, { id, patch });
    },
    [applyCommand],
  );

  const onUpdateCanvasImage = useCallback(
    (id: string, patch: Partial<Omit<CanvasImage, 'id' | 'dataUrl' | 'mimeType'>>) => {
      applyCommand(CMD.UpdateCanvasImage, { id, patch });
    },
    [applyCommand],
  );

  const onMoveAtoms = useCallback(
    (atomIds: string[], dx: number, dy: number) => {
      applyCommand(CMD.MoveAtoms, { atomIds, dx, dy });
    },
    [applyCommand],
  );

  const onRotateSelectionCommit = useCallback(
    (atomIds: string[], cx: number, cy: number, deltaRad: number) => {
      if (atomIds.length === 0 || Math.abs(deltaRad) < 1e-7) return;
      applyCommand(CMD.RotateAtoms, { atomIds, cx, cy, deltaRad });
      setSelectionFragmentRotationRad(prev => prev + deltaRad);
    },
    [applyCommand],
  );

  const onScaleSelectionCommit = useCallback(
    (atomIds: string[], anchorX: number, anchorY: number, factorX: number, factorY?: number) => {
      const fy = factorY ?? factorX;
      if (
        atomIds.length === 0 ||
        !Number.isFinite(factorX) ||
        !Number.isFinite(fy) ||
        (Math.abs(factorX - 1) < 1e-4 && Math.abs(fy - 1) < 1e-4)
      ) {
        return;
      }
      applyCommand(CMD.ScaleAtoms, { atomIds, cx: anchorX, cy: anchorY, factor: factorX, factorY: fy });
    },
    [applyCommand],
  );

  return {
    selectionFragmentRotationRad,
    setSelectionFragmentRotationRad,
    onAddAtom,
    onAddBond,
    onUpdateBond,
    onFlipBond,
    onAddRing,
    onAddBoatRing,
    onAddChairRing,
    onAddChain,
    onUpdateAtomCharge,
    onSetAtomCharge,
    onSetAtomDeltaCharge,
    onSetAtomChargeOffset,
    onSetAtomDeltaChargeOffset,
    onUpdateAtomLonePairs,
    onSetAtomRadical,
    onSetAtomRadicalIon,
    onAddExplicitHydrogen,
    onUpdateAtomElement,
    onApplyRingFill,
    onAddStroke,
    onTranslateStroke,
    onAddCanvasShape,
    onAddCanvasOrbital,
    onUpdateCanvasOrbital,
    onUpdateCanvasShape,
    onTranslateCanvasShapes,
    onAddSruBracketAroundAtoms,
    onEraseAt,
    onAddReactionArrow,
    onUpdateReactionArrow,
    onAddCanvasText,
    onUpdateCanvasText,
    onUpdateCanvasImage,
    onMoveAtoms,
    onRotateSelectionCommit,
    onScaleSelectionCommit,
    onSetMarqueeSelection,
    onTranslateMarqueeSelection,
  };
}
