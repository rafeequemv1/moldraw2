import {
  quadraticControlAwayFromCentroid,
  snapArrowEndpointToStructure,
  moleculeCentroid,
} from '@moldraw/core';
import { buildReactionArrowFromDrag, snapSegmentEndpointToAngleStep } from '../geometry';
import type { InteractionContext } from './types';

const MIN_ARROW_LENGTH = 12;
const STRUCTURE_SNAP_TOL = 18;
/** Below this drag distance, treat the gesture as a click (park start / place end). */
const CLICK_PLACE_SLOP = 6;

/** Degrees between snap directions (horizontal, vertical, diagonals, …). Hold Shift while dragging to turn off. */
const DRAW_ARROW_ANGLE_SNAP_STEP_DEG = 15;

const isClickPlaceKind = (kind: string | undefined): boolean =>
  kind === 'electron_flow' || kind === 'curved' || kind === 's_curve' || kind === 'cycle_arc';

/**
 * Reaction-arrow tool — ChemDraw-style for curly arrows:
 *   1. Click → park the start (tail) handle
 *   2. Click → place the end (head) and commit with a default curve
 *   3. Select and drag the mid handle to bend (also works after drag-create)
 *
 * Drag-to-create still works: press and drag past MIN_ARROW_LENGTH, release to commit.
 * Electron-flow tips/tails snap to nearby atoms/bonds when possible.
 */
export const reactionArrowToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos } = ctx;
  if (e.button !== 0) return false;

  const pending = ctx.drawingReactionArrow;
  // Second click: finish the parked start → end chord.
  if (
    pending &&
    isClickPlaceKind(pending.kind) &&
    Math.hypot(pending.x2 - pending.x1, pending.y2 - pending.y1) < CLICK_PLACE_SLOP
  ) {
    ctx.setDrawingReactionArrow({
      ...pending,
      x2: worldPos.x,
      y2: worldPos.y,
    });
    ctx.setMouseDownPos({ x: e.clientX, y: e.clientY });
    return true;
  }

  ctx.setDrawingReactionArrow({
    x1: worldPos.x,
    y1: worldPos.y,
    x2: worldPos.x,
    y2: worldPos.y,
    kind: ctx.reactionArrowKind,
  });
  ctx.setMouseDownPos({ x: e.clientX, y: e.clientY });
  return true;
};

export const reactionArrowToolMouseMove = (ctx: InteractionContext): boolean => {
  if (!ctx.drawingReactionArrow) return false;
  const { worldPos, e } = ctx;
  const d = ctx.drawingReactionArrow;
  // Parked first click: keep the start marker until the second click / drag.
  if (
    isClickPlaceKind(d.kind) &&
    Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < CLICK_PLACE_SLOP &&
    e.buttons === 0
  ) {
    return true;
  }
  let x2 = worldPos.x;
  let y2 = worldPos.y;
  // Freeform curves keep free angle; others snap to compass steps.
  const freeAngle =
    d.kind === 'electron_flow' || d.kind === 'curved' || d.kind === 's_curve';
  if (!e.shiftKey && !freeAngle) {
    const s = snapSegmentEndpointToAngleStep(d.x1, d.y1, x2, y2, DRAW_ARROW_ANGLE_SNAP_STEP_DEG);
    x2 = s.x2;
    y2 = s.y2;
  }
  ctx.setDrawingReactionArrow(prev => (prev ? { ...prev, x2, y2 } : null));
  return true;
};

const commitDrawnArrow = (ctx: InteractionContext, arrow: NonNullable<InteractionContext['drawingReactionArrow']>): void => {
  if (!ctx.onAddReactionArrow) return;
  const id = Math.random().toString(36).substring(2, 11);
  let built = buildReactionArrowFromDrag(arrow, id);

  if (arrow.kind === 'electron_flow') {
    const fromSnap = snapArrowEndpointToStructure(
      ctx.molecule,
      arrow.x1,
      arrow.y1,
      STRUCTURE_SNAP_TOL,
    );
    const toSnap = snapArrowEndpointToStructure(
      ctx.molecule,
      arrow.x2,
      arrow.y2,
      STRUCTURE_SNAP_TOL,
    );
    if (fromSnap || toSnap) {
      const x1 = fromSnap?.point.x ?? built.x1;
      const y1 = fromSnap?.point.y ?? built.y1;
      const x2 = toSnap?.point.x ?? built.x2;
      const y2 = toSnap?.point.y ?? built.y2;
      const centroid = moleculeCentroid(ctx.molecule);
      const ctrl = quadraticControlAwayFromCentroid(x1, y1, x2, y2, centroid);
      built = {
        ...built,
        x1,
        y1,
        x2,
        y2,
        cx: ctrl.cx,
        cy: ctrl.cy,
        curveAmount: ctrl.curveAmount,
        bulgeSide: ctrl.bulgeSide,
        ...(fromSnap ? { fromAnchor: fromSnap.anchor } : {}),
        ...(toSnap ? { toAnchor: toSnap.anchor } : {}),
      };
    }
  }

  ctx.onAddReactionArrow(built);
  // Select so the three edit handles (tail / curve / head) are immediately usable.
  ctx.setSelectedReactionArrowId?.(built.id);
  ctx.setSelectedAtomIds?.([]);
  ctx.setSelectedBondIds?.([]);
  ctx.setSelectedCanvasTextId?.(null);
  ctx.setColorEditCanvasShapeId?.(null);
  ctx.setSelectedCanvasImageId?.(null);
  ctx.setSelectedSruBracketId?.(null);
};

export const reactionArrowToolMouseUp = (ctx: InteractionContext): boolean => {
  const arrow = ctx.drawingReactionArrow;
  if (!arrow) return false;
  const d = Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1);

  if (d > MIN_ARROW_LENGTH) {
    commitDrawnArrow(ctx, arrow);
    ctx.setDrawingReactionArrow(null);
    return true;
  }

  // Short release: park start for click→click curly arrows; otherwise cancel.
  if (isClickPlaceKind(arrow.kind)) {
    ctx.setDrawingReactionArrow({
      x1: arrow.x1,
      y1: arrow.y1,
      x2: arrow.x1,
      y2: arrow.y1,
      kind: arrow.kind,
    });
    return true;
  }

  ctx.setDrawingReactionArrow(null);
  return true;
};
