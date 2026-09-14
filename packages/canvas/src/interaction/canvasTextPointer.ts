/**
 * Pointer-down on canvas text: rotate / resize / move / select.
 */
import {
  canvasTextResizePatch,
  canvasTextRotatePatch,
  getCanvasTextBox,
  pickCanvasTextAt,
  pickCanvasTextResizeHandle,
  pickCanvasTextRotateHandle,
} from '../geometry';
import type { InteractionContext } from './types';

function beginTextTransform(ctx: InteractionContext): void {
  // Hide the HTML overlay so canvas drag-preview letters move smoothly.
  ctx.onCanvasTextTransforming?.(true);
  const ae = document.activeElement;
  if (ae instanceof HTMLElement && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) {
    ae.blur();
  }
}

function beginResize(
  ctx: InteractionContext,
  textId: string,
  orig: import('@moldraw/domain').CanvasText,
  corner: 'nw' | 'ne' | 'sw' | 'se',
): void {
  beginTextTransform(ctx);
  ctx.setDragAction({
    type: 'resize_canvas_text',
    textId,
    startX: ctx.worldPos.x,
    startY: ctx.worldPos.y,
    currentX: ctx.worldPos.x,
    currentY: ctx.worldPos.y,
    origText: { ...orig },
    corner,
  });
}

function beginRotate(
  ctx: InteractionContext,
  canvasCtx: CanvasRenderingContext2D,
  text: import('@moldraw/domain').CanvasText,
): void {
  beginTextTransform(ctx);
  const box = getCanvasTextBox(canvasCtx, text);
  const ang0 = Math.atan2(ctx.worldPos.y - box.cy, ctx.worldPos.x - box.cx);
  ctx.setDragAction({
    type: 'rotate_canvas_text',
    textId: text.id,
    startX: ctx.worldPos.x,
    startY: ctx.worldPos.y,
    currentX: ctx.worldPos.x,
    currentY: ctx.worldPos.y,
    origText: { ...text },
    cx: box.cx,
    cy: box.cy,
    startPointerAngle: ang0,
    currentPointerAngle: ang0,
  });
}

export function handleCanvasTextPointerDown(
  ctx: InteractionContext,
  opts?: { allowMoveWithoutSelectTool?: boolean; handlesOnly?: boolean },
): boolean {
  const canvasCtx = ctx.getCanvasContext();
  const list = ctx.molecule.canvasTexts ?? [];
  if (!canvasCtx || !list.length) return false;

  const zoom = ctx.viewport?.zoom ?? 1;
  const isTextTool = ctx.activeTool === 'text';
  const isSelectTool = ctx.activeTool === 'select' || ctx.activeTool === 'lasso_select';
  if (!isTextTool && !isSelectTool && !opts?.allowMoveWithoutSelectTool) return false;

  const selectedId = ctx.selectedCanvasTextId;
  if (selectedId) {
    const selected = list.find(t => t.id === selectedId);
    if (selected) {
      if (pickCanvasTextRotateHandle(canvasCtx, selected, ctx.worldPos.x, ctx.worldPos.y, zoom)) {
        beginRotate(ctx, canvasCtx, selected);
        return true;
      }
      const corner = pickCanvasTextResizeHandle(
        canvasCtx,
        selected,
        ctx.worldPos.x,
        ctx.worldPos.y,
        zoom,
      );
      if (corner) {
        beginResize(ctx, selected.id, selected, corner);
        return true;
      }
    }
  }

  if (opts?.handlesOnly) return false;

  const picked = pickCanvasTextAt(canvasCtx, list, ctx.worldPos.x, ctx.worldPos.y);
  if (!picked) return false;

  ctx.setSelectedCanvasTextId?.(picked.id);
  ctx.setSelectedAtomIds?.([]);
  ctx.setSelectedReactionArrowId?.(null);
  ctx.setSelectedCanvasImageId?.(null);

  if (pickCanvasTextRotateHandle(canvasCtx, picked, ctx.worldPos.x, ctx.worldPos.y, zoom)) {
    beginRotate(ctx, canvasCtx, picked);
    return true;
  }

  const corner = pickCanvasTextResizeHandle(
    canvasCtx,
    picked,
    ctx.worldPos.x,
    ctx.worldPos.y,
    zoom,
  );
  if (corner) {
    beginResize(ctx, picked.id, picked, corner);
    return true;
  }

  beginTextTransform(ctx);
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
  if (!ctx.onUpdateCanvasText) return;

  if (dragAction?.type === 'resize_canvas_text') {
    const patch = canvasTextResizePatch(
      dragAction.origText,
      dragAction.corner,
      dragAction.currentX,
      dragAction.currentY,
    );
    ctx.onUpdateCanvasText(dragAction.textId, patch);
    return;
  }

  if (dragAction?.type === 'rotate_canvas_text') {
    const patch = canvasTextRotatePatch(
      dragAction.origText,
      dragAction.startPointerAngle,
      dragAction.currentPointerAngle,
    );
    ctx.onUpdateCanvasText(dragAction.textId, patch);
  }
}
