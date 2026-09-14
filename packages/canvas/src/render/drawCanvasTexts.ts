/**
 * Free-text annotations (T tool). PowerPoint-style transform chrome when
 * selected; body omitted while the inline editor is focused.
 */
import {
  buildCanvasTextFont,
  canvasTextEffectiveFontSize,
  canvasTextResizePatch,
  canvasTextRotatePatch,
  getCanvasTextBox,
  getCanvasTextCornerWorld,
  getCanvasTextRotateHandleWorld,
  getCanvasTextTopMidWorld,
  measureCanvasTextBox,
  type CanvasTextResizeCorner,
} from '../geometry';
import type { CanvasText } from '@moldraw/domain';
import type { RenderContext } from './types';
import { transformChrome } from './transformChrome';

const CORNERS: CanvasTextResizeCorner[] = ['nw', 'ne', 'sw', 'se'];

function textWithDragPreview(t: CanvasText, R: RenderContext): CanvasText {
  const drag = R.dragAction;
  if (!drag) return t;
  if (drag.type === 'move_canvas_text' && drag.textId === t.id) {
    return {
      ...t,
      x: drag.origX + (drag.currentX - drag.startX),
      y: drag.origY + (drag.currentY - drag.startY),
    };
  }
  if (drag.type === 'resize_canvas_text' && drag.textId === t.id) {
    return {
      ...t,
      ...canvasTextResizePatch(drag.origText, drag.corner, drag.currentX, drag.currentY),
    };
  }
  if (drag.type === 'rotate_canvas_text' && drag.textId === t.id) {
    return {
      ...t,
      ...canvasTextRotatePatch(drag.origText, drag.startPointerAngle, drag.currentPointerAngle),
    };
  }
  return t;
}

function drawTransformChrome(
  ctx: CanvasRenderingContext2D,
  box: ReturnType<typeof getCanvasTextBox>,
  zoom: number,
  R: RenderContext,
): void {
  const chrome = transformChrome(R);
  const lw = 1.25 / zoom;
  const hs = Math.max(4.5, 5.5 / zoom);

  ctx.save();
  ctx.translate(box.cx, box.cy);
  ctx.rotate(box.rotationRad);
  ctx.strokeStyle = chrome.boxStroke;
  ctx.lineWidth = lw;
  ctx.setLineDash([]);
  ctx.strokeRect(-box.width / 2, -box.height / 2, box.width, box.height);

  ctx.fillStyle = chrome.handleFill;
  ctx.strokeStyle = chrome.handleStroke;
  for (const c of CORNERS) {
    const lx = c.includes('e') ? box.width / 2 : -box.width / 2;
    const ly = c.includes('s') ? box.height / 2 : -box.height / 2;
    ctx.fillRect(lx - hs, ly - hs, hs * 2, hs * 2);
    ctx.strokeRect(lx - hs, ly - hs, hs * 2, hs * 2);
  }
  ctx.restore();

  const topMid = getCanvasTextTopMidWorld(box);
  const rh = getCanvasTextRotateHandleWorld(box);
  ctx.save();
  ctx.strokeStyle = chrome.accent;
  ctx.fillStyle = chrome.handleFill;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(topMid.x, topMid.y);
  ctx.lineTo(rh.x, rh.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rh.x, rh.y, hs, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = chrome.handleStroke;
  ctx.stroke();
  ctx.restore();

  for (const c of CORNERS) {
    const p = getCanvasTextCornerWorld(box, c);
    ctx.save();
    ctx.fillStyle = chrome.handleFill;
    ctx.strokeStyle = chrome.handleStroke;
    ctx.lineWidth = lw;
    ctx.fillRect(p.x - hs, p.y - hs, hs * 2, hs * 2);
    ctx.strokeRect(p.x - hs, p.y - hs, hs * 2, hs * 2);
    ctx.restore();
  }
}

export const drawCanvasTexts = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const list = R.renderedMolecule.canvasTexts ?? [];
  if (list.length === 0) return;

  for (const raw of list) {
    const t = textWithDragPreview(raw, R);
    const box = getCanvasTextBox(ctx, t);
    const { lineHeight, lines } = measureCanvasTextBox(ctx, t);
    const selected =
      (R.selectedCanvasTextIds?.includes(raw.id) ?? false) ||
      R.selectedCanvasTextId === raw.id;
    const editing = raw.id === R.omitCanvasTextBodyId;

    // PowerPoint-style transform boundary when selected (also while editing).
    if (selected) {
      drawTransformChrome(ctx, box, R.viewport.zoom, R);
    }

    if (editing) continue;

    const fs = canvasTextEffectiveFontSize(t);
    const script = t.textScript ?? 'normal';
    const scriptDy =
      script === 'super' ? -fs * 0.35 : script === 'sub' ? fs * 0.28 : 0;

    ctx.save();
    ctx.translate(box.cx, box.cy);
    ctx.rotate(box.rotationRad);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = t.color;
    ctx.font = buildCanvasTextFont(t);
    const und = t.textDecoration === 'underline';
    lines.forEach((line, li) => {
      const ly = (li - (lines.length - 1) / 2) * lineHeight + scriptDy;
      ctx.fillText(line, 0, ly);
      if (!und) return;
      const tw = ctx.measureText(line || ' ').width;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = Math.max(1, fs * 0.07);
      ctx.lineCap = 'round';
      const uy = ly + fs * 0.38;
      ctx.beginPath();
      ctx.moveTo(-tw / 2, uy);
      ctx.lineTo(tw / 2, uy);
      ctx.stroke();
    });
    ctx.restore();
  }
};
