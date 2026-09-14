import { buildReactionArrowFromDrag, snapSegmentEndpointToAngleStep } from '../geometry';
import type { InteractionContext } from './types';

const MIN_ARROW_LENGTH = 12;

/** Degrees between snap directions (horizontal, vertical, diagonals, …). Hold Shift while dragging to turn off. */
const DRAW_ARROW_ANGLE_SNAP_STEP_DEG = 15;

/**
 * Reaction-arrow tool: drag-to-create. Pointer-down seeds a zero-length arrow
 * at the cursor; pointer-move drags the head; pointer-up commits via
 * `onAddReactionArrow` if the arrow is at least `MIN_ARROW_LENGTH` long.
 * Arrow kind comes from `ctx.reactionArrowKind` (toolbar cycle).
 */
export const reactionArrowToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos } = ctx;
  if (e.button !== 0) return false;
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
  let x2 = worldPos.x;
  let y2 = worldPos.y;
  if (!e.shiftKey) {
    const s = snapSegmentEndpointToAngleStep(d.x1, d.y1, x2, y2, DRAW_ARROW_ANGLE_SNAP_STEP_DEG);
    x2 = s.x2;
    y2 = s.y2;
  }
  ctx.setDrawingReactionArrow(prev => (prev ? { ...prev, x2, y2 } : null));
  return true;
};

export const reactionArrowToolMouseUp = (ctx: InteractionContext): boolean => {
  const arrow = ctx.drawingReactionArrow;
  if (!arrow) return false;
  const d = Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1);
  if (d > MIN_ARROW_LENGTH && ctx.onAddReactionArrow) {
    const id = Math.random().toString(36).substring(2, 11);
    ctx.onAddReactionArrow(buildReactionArrowFromDrag(arrow, id));
  }
  ctx.setDrawingReactionArrow(null);
  return true;
};
