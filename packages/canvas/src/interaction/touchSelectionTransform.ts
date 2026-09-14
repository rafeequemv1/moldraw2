/**
 * Two-finger touch transform of the current selection.
 *
 * When both fingers land inside the selection's transform box (select / lasso
 * tool), the gesture drives the selection instead of the viewport: the finger
 * midpoint translates it, twisting rotates it about its centroid and pinching
 * scales it. Preview goes through the `transform_selection` drag action; on
 * release the accumulated rotate / scale / translate are committed through the
 * regular selection commands (each an undo step).
 */
import type { Molecule } from '@moldraw/domain';
import { expandAtomIdsToObjectCollections } from '@moldraw/core';
import {
  atomIdsForSelectionTransform,
  getSelectionCentroid,
  isInsideSelectionTransformBox,
  type MarqueeSelectionBoundsInput,
  type Point,
} from '../geometry';
import type { DragActionState } from '../render/types';
import { SELECTION_PINCH_START_RATIO, SELECTION_TWIST_START_RAD } from '../touch/constants';
import type { PinchPanDelta } from '../touch/types';
import type { InteractionContext } from './types';

export type TouchSelectionTransformCallbacks = Pick<
  InteractionContext,
  | 'onTranslateMarqueeSelection'
  | 'onMoveAtoms'
  | 'onRotateSelectionCommit'
  | 'onScaleSelectionCommit'
  | 'selectedReactionArrowIds'
  | 'selectedStrokeIds'
  | 'selectedCanvasTextIds'
  | 'selectedCanvasShapeIds'
  | 'selectedCanvasImageIds'
>;

export type TransformSelectionDrag = Extract<DragActionState, { type: 'transform_selection' }>;

/** Atoms that move with the selection (selected atoms, bond endpoints, grouped arrays). */
export const touchTransformAtomIds = (
  molecule: Molecule,
  selectedAtomIds: string[],
  selectedBondIds: string[],
): string[] =>
  expandAtomIdsToObjectCollections(
    molecule,
    atomIdsForSelectionTransform(molecule, selectedAtomIds, selectedBondIds),
  );

/**
 * Start a two-finger selection transform if the fingers' midpoint is inside the
 * selection box. Returns the initial drag action or null (→ viewport pan/zoom).
 */
export const beginTouchSelectionTransform = (
  molecule: Molecule,
  selectedAtomIds: string[],
  selectedBondIds: string[],
  cb: TouchSelectionTransformCallbacks,
  focalWorld: Point,
  canvasCtx: CanvasRenderingContext2D | null,
): TransformSelectionDrag | null => {
  const canTransform =
    !!cb.onRotateSelectionCommit ||
    !!cb.onScaleSelectionCommit ||
    !!cb.onTranslateMarqueeSelection ||
    !!cb.onMoveAtoms;
  if (!canTransform) return null;
  const atomIds = touchTransformAtomIds(molecule, selectedAtomIds, selectedBondIds);
  if (atomIds.length === 0) return null;
  const marquee: MarqueeSelectionBoundsInput = {
    atomIds,
    reactionArrowIds: cb.selectedReactionArrowIds ?? [],
    strokeIds: cb.selectedStrokeIds ?? [],
    canvasTextIds: cb.selectedCanvasTextIds ?? [],
    canvasShapeIds: cb.selectedCanvasShapeIds ?? [],
    canvasImageIds: cb.selectedCanvasImageIds ?? [],
  };
  if (
    !isInsideSelectionTransformBox(
      focalWorld.x,
      focalWorld.y,
      molecule,
      atomIds,
      marquee,
      canvasCtx,
    )
  ) {
    return null;
  }
  const cen = getSelectionCentroid(molecule, atomIds);
  if (!cen) return null;
  const snap: Record<string, Point> = {};
  const idSet = new Set(atomIds);
  for (const a of molecule.atoms) {
    if (idSet.has(a.id)) snap[a.id] = { x: a.x, y: a.y };
  }
  return {
    type: 'transform_selection',
    cx: cen.cx,
    cy: cen.cy,
    snap,
    dx: 0,
    dy: 0,
    deltaRad: 0,
    factor: 1,
    rawRad: 0,
    rawFactor: 1,
  };
};

/**
 * Fold a two-finger delta into the drag action. Pan is in screen px (divide by
 * zoom); twist / pinch only engage once past their start thresholds so a plain
 * two-finger drag does not wobble the selection.
 */
export const updateTouchSelectionTransform = (
  prev: TransformSelectionDrag,
  delta: PinchPanDelta,
  zoom: number,
): TransformSelectionDrag => {
  const z = zoom > 0 ? zoom : 1;
  const rawRad = prev.rawRad + delta.rotateRad;
  const rawFactor = Math.max(0.05, Math.min(20, prev.rawFactor * delta.scale));
  const rotating = prev.deltaRad !== 0 || Math.abs(rawRad) >= SELECTION_TWIST_START_RAD;
  const scaling =
    prev.factor !== 1 || Math.abs(rawFactor - 1) >= SELECTION_PINCH_START_RATIO;
  return {
    ...prev,
    dx: prev.dx + delta.panDx / z,
    dy: prev.dy + delta.panDy / z,
    rawRad,
    rawFactor,
    deltaRad: rotating ? rawRad : 0,
    factor: scaling ? rawFactor : 1,
  };
};

/** Commit the accumulated transform through the selection commands. */
export const commitTouchSelectionTransform = (
  molecule: Molecule,
  selectedAtomIds: string[],
  selectedBondIds: string[],
  cb: TouchSelectionTransformCallbacks,
  drag: TransformSelectionDrag,
): void => {
  const atomIds = touchTransformAtomIds(molecule, selectedAtomIds, selectedBondIds);
  if (atomIds.length === 0) return;
  if (Math.abs(drag.deltaRad) > 1e-6 && cb.onRotateSelectionCommit) {
    cb.onRotateSelectionCommit(atomIds, drag.cx, drag.cy, drag.deltaRad);
  }
  if (Math.abs(drag.factor - 1) > 1e-4 && cb.onScaleSelectionCommit) {
    cb.onScaleSelectionCommit(atomIds, drag.cx, drag.cy, drag.factor);
  }
  if (Math.hypot(drag.dx, drag.dy) > 1) {
    if (cb.onTranslateMarqueeSelection) {
      cb.onTranslateMarqueeSelection({
        atomIds,
        arrowIds: cb.selectedReactionArrowIds ?? [],
        strokeIds: cb.selectedStrokeIds ?? [],
        textIds: cb.selectedCanvasTextIds ?? [],
        shapeIds: cb.selectedCanvasShapeIds ?? [],
        imageIds: cb.selectedCanvasImageIds ?? [],
        dx: drag.dx,
        dy: drag.dy,
      });
    } else if (cb.onMoveAtoms) {
      cb.onMoveAtoms(atomIds, drag.dx, drag.dy);
    }
  }
};
