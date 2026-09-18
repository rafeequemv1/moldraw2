/**
 * Pointer-down on canvas text: rotate / resize / move / select.
 */
import {
  canvasTextHitPadWorld,
  canvasTextResizePatch,
  canvasTextRotatePatch,
  getCanvasTextBox,
  hitCanvasTextBox,
  measureCanvasTextContentSize,
  pickCanvasTextAt,
  pickCanvasTextResizeHandle,
  pickCanvasTextRotateHandle,
  type CanvasTextResizeHandle,
} from '../geometry';
import type { InteractionContext } from './types';
import { isSelectTool } from './selectTools';

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
  canvasCtx: CanvasRenderingContext2D,
  orig: import('@moldraw/domain').CanvasText,
  corner: CanvasTextResizeHandle,
): void {
  beginTextTransform(ctx);
  // Snapshot the *measured* box so auto-sized labels resize from their real
  // extent (not the minimum box). Corners scale font with the box; sides
  // wrap and grow height to content so glyphs never clip.
  const box = getCanvasTextBox(canvasCtx, orig);
  const content = measureCanvasTextContentSize(canvasCtx, orig);
  ctx.setDragAction({
    type: 'resize_canvas_text',
    textId: orig.id,
    startX: ctx.worldPos.x,
    startY: ctx.worldPos.y,
    currentX: ctx.worldPos.x,
    currentY: ctx.worldPos.y,
    origText: { ...orig, boxWidth: box.width, boxHeight: box.height },
    corner,
    minW: 56,
    minH: Math.min(content.height, 28),
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
  const isSelectToolActive = isSelectTool(ctx.activeTool);
  if (!isTextTool && !isSelectToolActive && !opts?.allowMoveWithoutSelectTool) return false;

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
        beginResize(ctx, canvasCtx, selected, corner);
        return true;
      }
    }
  }

  if (opts?.handlesOnly) return false;

  const idlePad = canvasTextHitPadWorld(zoom, 'idle');
  const grabPad = canvasTextHitPadWorld(zoom, 'selected');
  const exactOrIdle = pickCanvasTextAt(canvasCtx, list, ctx.worldPos.x, ctx.worldPos.y, idlePad);
  const selectedGrab =
    selectedId &&
    pickCanvasTextAt(
      canvasCtx,
      list.filter(t => t.id === selectedId),
      ctx.worldPos.x,
      ctx.worldPos.y,
      grabPad,
    );
  const picked = exactOrIdle ?? selectedGrab ?? null;
  if (!picked) return false;

  const alreadySelected = picked.id === selectedId;
  const insideExact = hitCanvasTextBox(
    getCanvasTextBox(canvasCtx, picked),
    ctx.worldPos.x,
    ctx.worldPos.y,
    0,
  );

  // Already typing inside the box: a click on the letters stays in edit.
  // Frame slop still starts a move.
  if (alreadySelected && insideExact && ctx.canvasTextEditing) {
    ctx.onRequestCanvasTextEdit?.(picked.id);
    return true;
  }

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
    beginResize(ctx, canvasCtx, picked, corner);
    return true;
  }

  // Drag anywhere on the box/slop to move. Click (no drag) inside a
  // already-selected box opens the editor on pointer-up.
  beginCanvasTextMove(ctx, picked, { clickOpensEdit: alreadySelected && insideExact });
  return true;
}

/** Translate a canvas text; hides the HTML overlay so chrome stays glued to the letters. */
export function beginCanvasTextMove(
  ctx: InteractionContext,
  text: import('@moldraw/domain').CanvasText,
  opts?: { clickOpensEdit?: boolean },
): void {
  beginTextTransform(ctx);
  ctx.setDragAction({
    type: 'move_canvas_text',
    textId: text.id,
    startX: ctx.worldPos.x,
    startY: ctx.worldPos.y,
    currentX: ctx.worldPos.x,
    currentY: ctx.worldPos.y,
    origX: text.x,
    origY: text.y,
    clickOpensEdit: opts?.clickOpensEdit,
  });
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
      dragAction.minW,
      dragAction.minH,
      ctx.getCanvasContext(),
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
