import {
  canvasTextResizePatch,
  getCanvasTextBox,
  pickCanvasTextAt,
  pickCanvasTextResizeHandle,
} from '../geometry';
import type { InteractionContext } from './types';

/**
 * Pointer-down on canvas text: resize handle, move, or select.
 * Returns true when the event was consumed.
 */
export function handleCanvasTextPointerDown(
  ctx: InteractionContext,
  opts?: { allowMoveWithoutSelectTool?: boolean },
): boolean {
  const canvasCtx = ctx.getCanvasContext();
  const list = ctx.molecule.canvasTexts ?? [];
  if (!canvasCtx || !list.length) return false;

  const picked = pickCanvasTextAt(canvasCtx, list, ctx.worldPos.x, ctx.worldPos.y);
  if (!picked) return false;

  const isTextTool = ctx.activeTool === 'text';
  const isSelectTool = ctx.activeTool === 'select' || ctx.activeTool === 'lasso_select';
  if (!isTextTool && !isSelectTool && !opts?.allowMoveWithoutSelectTool) return false;

  ctx.setSelectedCanvasTextId?.(picked.id);
  ctx.setSelectedAtomIds?.([]);
  ctx.setSelectedReactionArrowId?.(null);

  const box = getCanvasTextBox(canvasCtx, picked);
  if (
    pickCanvasTextResizeHandle(canvasCtx, picked, ctx.worldPos.x, ctx.worldPos.y, 1)
  ) {
    ctx.setDragAction({
      type: 'resize_canvas_text',
      textId: picked.id,
      startX: ctx.worldPos.x,
      startY: ctx.worldPos.y,
      currentX: ctx.worldPos.x,
      currentY: ctx.worldPos.y,
      origText: { ...picked },
      anchorLeft: box.left,
      anchorTop: box.top,
    });
    return true;
  }

  ctx.setDragAction({
    type: 'move_canvas_text',
    textId: picked.id,
    startX: ctx.worldPos.x,
    startY: ctx.worldPos.y,
    currentX: ctx.worldPos.x,
    currentY: ctx.worldPos.y,
    origX: picked.x,
    origY: picked.y,
  });
  return true;
}

export function commitCanvasTextResize(ctx: InteractionContext): void {
  const { dragAction } = ctx;
  if (dragAction?.type !== 'resize_canvas_text' || !ctx.onUpdateCanvasText) return;
  const patch = canvasTextResizePatch(
    dragAction.origText,
    dragAction.anchorLeft,
    dragAction.anchorTop,
    dragAction.currentX,
    dragAction.currentY,
  );
  ctx.onUpdateCanvasText(dragAction.textId, patch);
}
