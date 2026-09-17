import { siblingShapeIdsInCollection } from '@moldraw/core';
import {
  canvasShapeResizePatch,
  canvasShapeRotatePatch,
  getCanvasShapeBox,
  hitCanvasShapeTransformed,
  pickCanvasShapeResizeHandle,
  pickCanvasShapeRotateHandle,
} from '../geometry/canvasShapeTransform';
import type { InteractionContext } from './types';
import { isSelectTool } from './selectTools';

/**
 * Pointer-down on canvas shape: rotate / resize / move (select tool).
 * Shapes in the same Objects collection (e.g. COF) select and move as one.
 */
export function handleCanvasShapePointerDown(
  ctx: InteractionContext,
  opts?: { handlesOnly?: boolean },
): boolean {
  const list = ctx.molecule.canvasShapes ?? [];
  if (!list.length) return false;

  if (!isSelectTool(ctx.activeTool)) return false;

  const zoom = ctx.viewport?.zoom ?? 1;
  const selectedId = ctx.selectedCanvasShapeId ?? null;

  // Per-shape resize/rotate only when the selection is a single shape (not a COF group).
  if (selectedId && ctx.onUpdateCanvasShape) {
    const selectedGroup = siblingShapeIdsInCollection(ctx.molecule, selectedId);
    if (selectedGroup.length <= 1) {
      const selected = list.find(s => s.id === selectedId);
      if (selected) {
        if (pickCanvasShapeRotateHandle(selected, ctx.worldPos.x, ctx.worldPos.y, zoom)) {
          const box = getCanvasShapeBox(selected);
          const ang0 = Math.atan2(ctx.worldPos.y - box.cy, ctx.worldPos.x - box.cx);
          ctx.setDragAction({
            type: 'rotate_canvas_shape',
            shapeId: selected.id,
            startX: ctx.worldPos.x,
            startY: ctx.worldPos.y,
            currentX: ctx.worldPos.x,
            currentY: ctx.worldPos.y,
            origShape: { ...selected },
            cx: box.cx,
            cy: box.cy,
            startPointerAngle: ang0,
            currentPointerAngle: ang0,
          });
          return true;
        }
        if (pickCanvasShapeResizeHandle(selected, ctx.worldPos.x, ctx.worldPos.y, zoom)) {
          ctx.setDragAction({
            type: 'resize_canvas_shape',
            shapeId: selected.id,
            startX: ctx.worldPos.x,
            startY: ctx.worldPos.y,
            currentX: ctx.worldPos.x,
            currentY: ctx.worldPos.y,
            origShape: { ...selected },
            lockAspect: ctx.e.shiftKey,
          });
          return true;
        }
      }
    }
  }

  if (opts?.handlesOnly) return false;

  let picked = null as (typeof list)[number] | null;
  for (let i = list.length - 1; i >= 0; i--) {
    if (hitCanvasShapeTransformed(list[i]!, ctx.worldPos.x, ctx.worldPos.y)) {
      picked = list[i]!;
      break;
    }
  }
  if (!picked) return false;

  const groupIds = siblingShapeIdsInCollection(ctx.molecule, picked.id);
  ctx.setColorEditCanvasShapeId?.(picked.id);
  ctx.setSelectedCanvasTextId?.(null);
  ctx.setSelectedCanvasImageId?.(null);
  ctx.setSelectedReactionArrowId?.(null);
  ctx.setSelectedSruBracketId?.(null);
  ctx.setSelectedAtomIds?.([]);
  ctx.setSelectedBondIds?.([]);

  // Multi-shape groups (COF): move only — no per-member resize/rotate.
  if (groupIds.length <= 1) {
    if (pickCanvasShapeRotateHandle(picked, ctx.worldPos.x, ctx.worldPos.y, zoom)) {
      const box = getCanvasShapeBox(picked);
      const ang0 = Math.atan2(ctx.worldPos.y - box.cy, ctx.worldPos.x - box.cx);
      ctx.setDragAction({
        type: 'rotate_canvas_shape',
        shapeId: picked.id,
        startX: ctx.worldPos.x,
        startY: ctx.worldPos.y,
        currentX: ctx.worldPos.x,
        currentY: ctx.worldPos.y,
        origShape: { ...picked },
        cx: box.cx,
        cy: box.cy,
        startPointerAngle: ang0,
        currentPointerAngle: ang0,
      });
      return true;
    }

    if (pickCanvasShapeResizeHandle(picked, ctx.worldPos.x, ctx.worldPos.y, zoom)) {
      ctx.setDragAction({
        type: 'resize_canvas_shape',
        shapeId: picked.id,
        startX: ctx.worldPos.x,
        startY: ctx.worldPos.y,
        currentX: ctx.worldPos.x,
        currentY: ctx.worldPos.y,
        origShape: { ...picked },
        lockAspect: ctx.e.shiftKey,
      });
      return true;
    }
  }

  const origById: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {};
  for (const id of groupIds) {
    const s = list.find(sh => sh.id === id);
    if (!s) continue;
    origById[id] = { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
  }

  ctx.setDragAction({
    type: 'move_canvas_shape',
    shapeId: picked.id,
    shapeIds: groupIds,
    startX: ctx.worldPos.x,
    startY: ctx.worldPos.y,
    currentX: ctx.worldPos.x,
    currentY: ctx.worldPos.y,
    origX1: picked.x1,
    origY1: picked.y1,
    origX2: picked.x2,
    origY2: picked.y2,
    origById,
  });
  return true;
}

export function commitCanvasShapeDrag(ctx: InteractionContext): void {
  const { dragAction } = ctx;
  if (!dragAction) return;

  if (dragAction.type === 'move_canvas_shape') {
    const dx = dragAction.currentX - dragAction.startX;
    const dy = dragAction.currentY - dragAction.startY;
    if (Math.hypot(dx, dy) <= 0.5) return;
    const ids =
      dragAction.shapeIds && dragAction.shapeIds.length > 0
        ? dragAction.shapeIds
        : [dragAction.shapeId];
    if (ids.length > 1 && ctx.onTranslateCanvasShapes) {
      ctx.onTranslateCanvasShapes(ids, dx, dy);
      return;
    }
    if (ctx.onUpdateCanvasShape) {
      ctx.onUpdateCanvasShape(dragAction.shapeId, {
        x1: dragAction.origX1 + dx,
        y1: dragAction.origY1 + dy,
        x2: dragAction.origX2 + dx,
        y2: dragAction.origY2 + dy,
      });
    }
    return;
  }

  if (!ctx.onUpdateCanvasShape) return;

  if (dragAction.type === 'resize_canvas_shape') {
    const patch = canvasShapeResizePatch(
      dragAction.origShape,
      dragAction.currentX,
      dragAction.currentY,
      dragAction.lockAspect === true || ctx.e.shiftKey,
    );
    ctx.onUpdateCanvasShape(dragAction.shapeId, patch);
    return;
  }

  if (dragAction.type === 'rotate_canvas_shape') {
    const patch = canvasShapeRotatePatch(
      dragAction.origShape,
      dragAction.startPointerAngle,
      dragAction.currentPointerAngle,
    );
    ctx.onUpdateCanvasShape(dragAction.shapeId, patch);
  }
}
