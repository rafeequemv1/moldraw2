import {
  canvasImageResizePatch,
  canvasImageRotatePatch,
  getCanvasImageBox,
  pickCanvasImageAt,
  pickCanvasImageResizeHandle,
  pickCanvasImageRotateHandle,
} from '../geometry/canvasImages';
import type { InteractionContext } from './types';
import { isSelectTool } from './selectTools';

/**
 * Pointer-down on canvas image: rotate / resize / move (select tool).
 * Returns true when the event was consumed.
 */
export function handleCanvasImagePointerDown(
  ctx: InteractionContext,
  opts?: { handlesOnly?: boolean },
): boolean {
  const list = ctx.molecule.canvasImages ?? [];
  if (!list.length) return false;

  if (!isSelectTool(ctx.activeTool)) return false;

  const zoom = ctx.viewport?.zoom ?? 1;

  // Prefer handles on the already-selected image.
  const selectedId = ctx.selectedCanvasImageId ?? null;
  if (selectedId && ctx.onUpdateCanvasImage) {
    const selected = list.find(img => img.id === selectedId);
    if (selected) {
      if (pickCanvasImageRotateHandle(selected, ctx.worldPos.x, ctx.worldPos.y, zoom)) {
        const box = getCanvasImageBox(selected);
        const ang0 = Math.atan2(ctx.worldPos.y - box.cy, ctx.worldPos.x - box.cx);
        ctx.setDragAction({
          type: 'rotate_canvas_image',
          imageId: selected.id,
          startX: ctx.worldPos.x,
          startY: ctx.worldPos.y,
          currentX: ctx.worldPos.x,
          currentY: ctx.worldPos.y,
          origImage: { ...selected },
          cx: box.cx,
          cy: box.cy,
          startPointerAngle: ang0,
          currentPointerAngle: ang0,
        });
        return true;
      }
      if (pickCanvasImageResizeHandle(selected, ctx.worldPos.x, ctx.worldPos.y, zoom)) {
        ctx.setDragAction({
          type: 'resize_canvas_image',
          imageId: selected.id,
          startX: ctx.worldPos.x,
          startY: ctx.worldPos.y,
          currentX: ctx.worldPos.x,
          currentY: ctx.worldPos.y,
          origImage: { ...selected },
          lockAspect: ctx.e.shiftKey,
        });
        return true;
      }
    }
  }

  if (opts?.handlesOnly) return false;

  const picked = pickCanvasImageAt(list, ctx.worldPos.x, ctx.worldPos.y);
  if (!picked) return false;

  ctx.setSelectedCanvasImageId?.(picked.id);
  ctx.setSelectedCanvasTextId?.(null);
  ctx.setColorEditCanvasShapeId?.(null);
  ctx.setSelectedReactionArrowId?.(null);
  ctx.setSelectedAtomIds?.([]);
  ctx.setSelectedBondIds?.([]);

  if (pickCanvasImageRotateHandle(picked, ctx.worldPos.x, ctx.worldPos.y, zoom)) {
    const box = getCanvasImageBox(picked);
    const ang0 = Math.atan2(ctx.worldPos.y - box.cy, ctx.worldPos.x - box.cx);
    ctx.setDragAction({
      type: 'rotate_canvas_image',
      imageId: picked.id,
      startX: ctx.worldPos.x,
      startY: ctx.worldPos.y,
      currentX: ctx.worldPos.x,
      currentY: ctx.worldPos.y,
      origImage: { ...picked },
      cx: box.cx,
      cy: box.cy,
      startPointerAngle: ang0,
      currentPointerAngle: ang0,
    });
    return true;
  }

  if (pickCanvasImageResizeHandle(picked, ctx.worldPos.x, ctx.worldPos.y, zoom)) {
    ctx.setDragAction({
      type: 'resize_canvas_image',
      imageId: picked.id,
      startX: ctx.worldPos.x,
      startY: ctx.worldPos.y,
      currentX: ctx.worldPos.x,
      currentY: ctx.worldPos.y,
      origImage: { ...picked },
      lockAspect: ctx.e.shiftKey,
    });
    return true;
  }

  ctx.setDragAction({
    type: 'move_canvas_image',
    imageId: picked.id,
    startX: ctx.worldPos.x,
    startY: ctx.worldPos.y,
    currentX: ctx.worldPos.x,
    currentY: ctx.worldPos.y,
    origX: picked.x,
    origY: picked.y,
  });
  return true;
}

export function commitCanvasImageDrag(ctx: InteractionContext): void {
  const { dragAction } = ctx;
  if (!dragAction || !ctx.onUpdateCanvasImage) return;

  if (dragAction.type === 'move_canvas_image') {
    const dx = dragAction.currentX - dragAction.startX;
    const dy = dragAction.currentY - dragAction.startY;
    if (Math.hypot(dx, dy) > 0.5) {
      ctx.onUpdateCanvasImage(dragAction.imageId, {
        x: dragAction.origX + dx,
        y: dragAction.origY + dy,
      });
    }
    return;
  }

  if (dragAction.type === 'resize_canvas_image') {
    const patch = canvasImageResizePatch(
      dragAction.origImage,
      dragAction.currentX,
      dragAction.currentY,
      dragAction.lockAspect === true || ctx.e.shiftKey,
    );
    ctx.onUpdateCanvasImage(dragAction.imageId, patch);
    return;
  }

  if (dragAction.type === 'rotate_canvas_image') {
    const patch = canvasImageRotatePatch(
      dragAction.origImage,
      dragAction.startPointerAngle,
      dragAction.currentPointerAngle,
    );
    ctx.onUpdateCanvasImage(dragAction.imageId, patch);
  }
}
