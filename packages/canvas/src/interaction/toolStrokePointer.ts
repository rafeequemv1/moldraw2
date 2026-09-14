import { pickStrokeAt } from '../geometry/strokes';
import type { InteractionContext } from './types';

/** Pointer-down on a pencil stroke (select tool): select + drag to move. */
export function handleStrokePointerDown(ctx: InteractionContext): boolean {
  const isSelectTool = ctx.activeTool === 'select' || ctx.activeTool === 'lasso_select';
  if (!isSelectTool) return false;

  const hit = pickStrokeAt(ctx.molecule, ctx.worldPos.x, ctx.worldPos.y);
  if (!hit || !ctx.setColorEditStrokeId) return false;

  ctx.setColorEditStrokeId(hit.id);
  ctx.setSelectedCanvasTextId?.(null);
  ctx.setColorEditCanvasShapeId?.(null);
  ctx.setSelectedCanvasImageId?.(null);
  ctx.setSelectedReactionArrowId?.(null);
  ctx.setSelectedSruBracketId?.(null);
  ctx.setSelectedAtomIds?.([]);
  ctx.setSelectedBondIds?.([]);
  ctx.setSelectedChargeAtomIds?.([]);
  ctx.setSelectedChargeMarkKind?.(null);

  if (ctx.onTranslateStroke) {
    ctx.setDragAction({
      type: 'move_canvas_stroke',
      strokeId: hit.id,
      startX: ctx.worldPos.x,
      startY: ctx.worldPos.y,
      currentX: ctx.worldPos.x,
      currentY: ctx.worldPos.y,
      origPoints: hit.points.map(p => ({ ...p })),
    });
  }
  return true;
}
