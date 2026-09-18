import {
  quadraticControlAwayFromCentroid,
  moleculeCentroid,
} from '@moldraw/core';
import type { ArrowHeadStyle, ArrowTailStyle } from '@moldraw/domain';
import {
  CURVED_ARROW_DEFAULT_HEAD_SCALE,
  ELECTRON_FLOW_DEFAULT_HEAD_SCALE,
  reactionArrowSupportsReagentLabels,
} from '@moldraw/domain';
import {
  buildReactionArrowFromDrag,
  pickReactionArrowReagentSlot,
  reagentSlotChipHitTolWorld,
  snapSegmentEndpointToAngleStep,
} from '../geometry';
import type { DrawingReactionArrowState } from '../render/types';
import type { InteractionContext } from './types';

const MIN_ARROW_LENGTH = 12;
/** Below this drag distance, treat the gesture as a click (park start / place end). */
const CLICK_PLACE_SLOP = 6;

/** Degrees between snap directions (horizontal, vertical, diagonals, …). Hold Shift while dragging to turn off. */
const DRAW_ARROW_ANGLE_SNAP_STEP_DEG = 15;

const isClickPlaceKind = (kind: string | undefined): boolean =>
  kind === 'electron_flow' ||
  kind === 'curved' ||
  kind === 's_curve' ||
  kind === 'cycle_arc' ||
  kind === 'straight' ||
  kind === 'retrosynthetic' ||
  kind === 'path' ||
  kind === 'row_wrap';

const electronFlowHeadStyle = (ctx: InteractionContext): ArrowHeadStyle =>
  ctx.reactionArrowHeadStyle ?? 'pair';

const electronFlowTailStyle = (ctx: InteractionContext): ArrowTailStyle =>
  ctx.reactionArrowTailStyle ?? 'none';

const electronFlowHeadScale = (ctx: InteractionContext): number =>
  ctx.reactionArrowHeadScale ?? ELECTRON_FLOW_DEFAULT_HEAD_SCALE;

/** Curved scheme arrows start at 1.3 unless the user has set a different head size. */
const curvedHeadScale = (ctx: InteractionContext): number => {
  const s = ctx.reactionArrowHeadScale;
  if (s == null || s === ELECTRON_FLOW_DEFAULT_HEAD_SCALE) return CURVED_ARROW_DEFAULT_HEAD_SCALE;
  return s;
};

const seedElectronFlow = (
  ctx: InteractionContext,
  x: number,
  y: number,
): DrawingReactionArrowState => ({
  x1: x,
  y1: y,
  x2: x,
  y2: y,
  kind: 'electron_flow',
  headStyle: electronFlowHeadStyle(ctx),
  tailStyle: electronFlowTailStyle(ctx),
  headScale: electronFlowHeadScale(ctx),
});

/**
 * Reaction-arrow tool — ChemDraw-style for curly arrows:
 *   1. Click → park the start (tail) handle
 *   2. Click → place the end (head) and commit with a default curve
 *   3. Select and drag the mid handle to bend (also works after drag-create)
 *
 * Drag-to-create still works: press and drag past MIN_ARROW_LENGTH, release to commit.
 * Curved, S-curve, and mechanism (electron-flow / fishhook) tips follow the pointer
 * with no snap.
 */
export const reactionArrowToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos } = ctx;
  if (e.button !== 0) return false;

  if (ctx.selectedReactionArrowId && ctx.onRequestArrowReagentEdit && !ctx.drawingReactionArrow) {
    const selArrow = ctx.molecule.reactionArrows?.find(a => a.id === ctx.selectedReactionArrowId);
    if (selArrow && reactionArrowSupportsReagentLabels(selArrow.kind)) {
      const zoom = ctx.viewport?.zoom ?? 1;
      const slotHit = pickReactionArrowReagentSlot(
        selArrow,
        worldPos.x,
        worldPos.y,
        reagentSlotChipHitTolWorld(zoom),
      );
      if (slotHit) {
        ctx.setSelectedReactionArrowId?.(selArrow.id);
        ctx.setSelectedCanvasTextId?.(null);
        ctx.setColorEditCanvasShapeId?.(null);
        ctx.setSelectedCanvasImageId?.(null);
        ctx.setSelectedSruBracketId?.(null);
        ctx.setSelectedAtomIds?.([]);
        ctx.setSelectedBondIds?.([]);
        ctx.onRequestArrowReagentEdit(slotHit.arrowId, slotHit.slot);
        return true;
      }
    }
  }

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

  if (ctx.reactionArrowKind === 'electron_flow') {
    ctx.setDrawingReactionArrow(seedElectronFlow(ctx, worldPos.x, worldPos.y));
  } else {
    ctx.setDrawingReactionArrow({
      x1: worldPos.x,
      y1: worldPos.y,
      x2: worldPos.x,
      y2: worldPos.y,
      kind: ctx.reactionArrowKind,
      ...(ctx.reactionArrowKind === 'curved' ? { headScale: curvedHeadScale(ctx) } : {}),
    });
  }
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
  if (d.kind === 'electron_flow') {
    ctx.setDrawingReactionArrow(prev =>
      prev
        ? {
            ...prev,
            x2,
            y2,
            headStyle: prev.headStyle ?? electronFlowHeadStyle(ctx),
            tailStyle: prev.tailStyle ?? electronFlowTailStyle(ctx),
            headScale: prev.headScale ?? electronFlowHeadScale(ctx),
          }
        : null,
    );
    return true;
  }
  ctx.setDrawingReactionArrow(prev => (prev ? { ...prev, x2, y2 } : null));
  return true;
};

const commitDrawnArrow = (
  ctx: InteractionContext,
  arrow: NonNullable<InteractionContext['drawingReactionArrow']>,
): void => {
  if (!ctx.onAddReactionArrow) return;
  const id = Math.random().toString(36).substring(2, 11);
  let built = buildReactionArrowFromDrag(arrow, id);
  if (arrow.kind === 'curved' && built.headScale == null) {
    built = { ...built, headScale: curvedHeadScale(ctx) };
  }

  if (arrow.kind === 'electron_flow') {
    const centroid = moleculeCentroid(ctx.molecule);
    const ctrl = quadraticControlAwayFromCentroid(arrow.x1, arrow.y1, arrow.x2, arrow.y2, centroid);
    built = {
      ...built,
      x1: arrow.x1,
      y1: arrow.y1,
      x2: arrow.x2,
      y2: arrow.y2,
      cx: ctrl.cx,
      cy: ctrl.cy,
      curveAmount: ctrl.curveAmount,
      bulgeSide: ctrl.bulgeSide,
      headStyle: arrow.headStyle ?? electronFlowHeadStyle(ctx),
      tailStyle: arrow.tailStyle ?? electronFlowTailStyle(ctx),
      headScale: arrow.headScale ?? electronFlowHeadScale(ctx),
    };
  }

  ctx.onAddReactionArrow(built);
  // Select so the edit handles are immediately usable. Reagent text is opt-in
  // via the on-canvas + chips — do not auto-open an editor.
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
      headStyle: arrow.headStyle,
      tailStyle: arrow.tailStyle,
      headScale: arrow.headScale,
    });
    return true;
  }

  ctx.setDrawingReactionArrow(null);
  return true;
};
