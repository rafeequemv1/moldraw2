import type { InteractionContext } from './types';

/**
 * Pencil tool: free-hand stroke capture. Down seeds the array, move appends
 * each pointer position (so density follows pointer speed), up commits the
 * stroke via `onAddStroke`. Single-point taps are dropped.
 */
export const pencilToolMouseDown = (ctx: InteractionContext): boolean => {
  if (ctx.e.button !== 0) return false;
  ctx.setDrawingStroke([ctx.worldPos]);
  return true;
};

export const pencilToolMouseMove = (ctx: InteractionContext): boolean => {
  if (!ctx.drawingStroke) return false;
  const { worldPos } = ctx;
  ctx.setDrawingStroke(prev => (prev ? [...prev, worldPos] : null));
  return true;
};

export const pencilToolMouseUp = (ctx: InteractionContext): boolean => {
  const stroke = ctx.drawingStroke;
  if (!stroke) return false;
  if (stroke.length > 1 && ctx.onAddStroke) {
    ctx.onAddStroke({
      id: Math.random().toString(36).substr(2, 9),
      points: stroke,
      color: ctx.activeColor,
      thickness: ctx.activeThickness,
    });
  }
  ctx.setDrawingStroke(null);
  return true;
};
