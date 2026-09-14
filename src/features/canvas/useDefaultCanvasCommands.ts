/**
 * Default InfiniteCanvas mutation handlers backed by {@link MoleculeEditor.applyCommand}.
 * Hosts (App) can override any handler via MoldrawCanvas props; use `onBondAdded`
 * for auto-cleanup without replacing `onAddBond`.
 */
import { useCallback, useState } from 'react';
import type {
  Atom,
  Bond,
  CanvasShape,
  CanvasText,
  ReactionArrow,
  Stroke,
} from '@moldraw/domain';
import type { MoleculeEditor } from '@moldraw/core/editor';
import { CMD } from '@moldraw/core/commands/registry';
import { normalizeHexColor } from '@moldraw/core/color/selectionColor';
import type { EraseHit } from '@moldraw/core/molecule/mutations';
import type { Point } from './geometry';

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
  /** Fired after a successful addBond (e.g. auto-cleanup recording). */
  onBondAdded?: (fromAtomId: string, toAtomId: string) => void;
}

export function useDefaultCanvasCommands({
  store,
  activeTool = 'select',
  placementElement = 'C',
  bondLengthPx,
  textDefaults,
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
    (bondId: string, patch: Partial<Pick<Bond, 'order' | 'stereo' | 'orderCycleRamp'>>) => {
      applyCommand(CMD.UpdateBond, { bondId, ...patch });
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

  const onUpdateAtomLonePairs = useCallback(
    (atomId: string, delta: number) => {
      applyCommand(CMD.UpdateAtomLonePairs, { atomId, delta });
    },
    [applyCommand],
  );

  const onUpdateAtomElement = useCallback(
    (atomId: string, element: string) => {
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

  const onAddCanvasShape = useCallback(
    (shape: CanvasShape) => {
      applyCommand(CMD.AddCanvasShape, { shape });
    },
    [applyCommand],
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
    (id: string, patch: Partial<Omit<ReactionArrow, 'id'>>) => {
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
    onUpdateAtomLonePairs,
    onUpdateAtomElement,
    onApplyRingFill,
    onAddStroke,
    onAddCanvasShape,
    onEraseAt,
    onAddReactionArrow,
    onUpdateReactionArrow,
    onAddCanvasText,
    onUpdateCanvasText,
    onMoveAtoms,
    onRotateSelectionCommit,
  };
}
