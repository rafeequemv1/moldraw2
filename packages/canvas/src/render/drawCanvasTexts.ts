/**
 * Free-text annotations (T tool). PowerPoint-style transform chrome when
 * selected; body omitted while the inline editor is focused.
 */
import {
  buildCanvasTextFont,
  buildCanvasTextFontAtSize,
  canvasTextEffectiveFontSize,
  canvasTextResizePatch,
  canvasTextRotatePatch,
  canvasTextScriptDy,
  CANVAS_TEXT_SCRIPT_SCALE,
  getCanvasTextBox,
  CANVAS_TEXT_RESIZE_HANDLES,
  getCanvasTextHandleWorld,
  getCanvasTextRotateHandleWorld,
  getCanvasTextTopMidWorld,
  measureCanvasTextBox,
  canvasTextHitPadWorld,
  pickCanvasTextAt,
  resolveCanvasTextInk,
  resolveCanvasTextScripts,
  scriptAtIndex,
  wrapCanvasTextLinesIndexed,
} from '../geometry';
import type { CanvasText } from '@moldraw/domain';
import type { RenderContext } from './types';
import { drawTransformHandleSquare, transformChrome } from './transformChrome';

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
      ...canvasTextResizePatch(
        drag.origText,
        drag.corner,
        drag.currentX,
        drag.currentY,
        drag.minW,
        drag.minH,
      ),
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
  editing: boolean,
): void {
  const chrome = transformChrome(R);
  const lw = 1 / zoom;
  const hs = Math.max(2.55, 3.1 / zoom);
  const rotateR = Math.max(3.4, 4.1 / zoom);

  // Frame: rotated with the text. While the inline editor is live the frame
  // picks up the accent so it reads as "typing here".
  ctx.save();
  ctx.translate(box.cx, box.cy);
  ctx.rotate(box.rotationRad);
  ctx.strokeStyle = editing ? chrome.accent : chrome.boxStroke;
  ctx.lineWidth = lw;
  ctx.setLineDash([]);
  ctx.strokeRect(-box.width / 2, -box.height / 2, box.width, box.height);
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
  ctx.arc(rh.x, rh.y, rotateR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = chrome.handleStroke;
  ctx.stroke();
  ctx.restore();

  for (const h of CANVAS_TEXT_RESIZE_HANDLES) {
    const p = getCanvasTextHandleWorld(box, h);
    drawTransformHandleSquare(ctx, p.x, p.y, hs, lw, chrome);
  }
}

const TEXT_HOVER_TOOLS = new Set(['select', 'lasso_select', 'fragment_select', 'text']);

/** Top-most label under the pointer (for the Figma-style hover outline). */
function hoveredTextId(ctx: CanvasRenderingContext2D, R: RenderContext): string | null {
  if (R.dragAction || !R.mouseWorldPos || !TEXT_HOVER_TOOLS.has(R.activeTool)) return null;
  const list = R.renderedMolecule.canvasTexts ?? [];
  const hit = pickCanvasTextAt(
    ctx,
    list,
    R.mouseWorldPos.x,
    R.mouseWorldPos.y,
    canvasTextHitPadWorld(R.viewport.zoom, 'idle'),
  );
  return hit?.id ?? null;
}

function drawHoverOutline(
  ctx: CanvasRenderingContext2D,
  box: ReturnType<typeof getCanvasTextBox>,
  zoom: number,
  R: RenderContext,
): void {
  const chrome = transformChrome(R);
  ctx.save();
  ctx.translate(box.cx, box.cy);
  ctx.rotate(box.rotationRad);
  ctx.strokeStyle = chrome.accent;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1.25 / zoom;
  ctx.setLineDash([]);
  ctx.strokeRect(-box.width / 2, -box.height / 2, box.width, box.height);
  ctx.restore();
}

/**
 * Overlay pass: light accent outline on the unselected label under the
 * pointer so labels read as grabbable objects (Figma-style hover). Lives on
 * the overlay layer because the structure bitmap is cached between frames.
 */
export const drawCanvasTextHover = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const id = hoveredTextId(ctx, R);
  if (!id || id === R.selectedCanvasTextId || R.selectedCanvasTextIds?.includes(id)) return;
  const t = (R.renderedMolecule.canvasTexts ?? []).find(x => x.id === id);
  if (!t) return;
  drawHoverOutline(ctx, getCanvasTextBox(ctx, t), R.viewport.zoom, R);
};

export const drawCanvasTexts = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const list = R.renderedMolecule.canvasTexts ?? [];
  if (list.length === 0) return;

  for (const raw of list) {
    const t = textWithDragPreview(raw, R);
    const box = getCanvasTextBox(ctx, t);
    const { lineHeight } = measureCanvasTextBox(ctx, t);
    const selected =
      (R.selectedCanvasTextIds?.includes(raw.id) ?? false) ||
      R.selectedCanvasTextId === raw.id;
    const editing = raw.id === R.omitCanvasTextBodyId;

    // PowerPoint-style transform boundary when selected — always, including
    // while the HTML editor is live so the frame + handles stay visible
    // during typing.
    if (selected) {
      drawTransformChrome(ctx, box, R.viewport.zoom, R, editing);
    }

    if (editing) continue;

    const fs = canvasTextEffectiveFontSize(t);
    const ranges = resolveCanvasTextScripts(t);

    // One object color only — never CPK / Color-menu / per-glyph atom paint.
    const ink = resolveCanvasTextInk(t, R.structureTheme.ink);
    const align = t.textAlign ?? 'left';
    const innerLeft = -box.width / 2 + 10;
    const innerRight = box.width / 2 - 10;
    const innerMax = t.boxWidth != null ? Math.max(8, t.boxWidth - 20) : Infinity;
    ctx.save();
    ctx.translate(box.cx, box.cy);
    ctx.rotate(box.rotationRad);
    ctx.beginPath();
    ctx.rect(-box.width / 2, -box.height / 2, box.width, box.height);
    ctx.clip();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    ctx.font = buildCanvasTextFont(t);
    const indexed = wrapCanvasTextLinesIndexed(ctx, t.text ?? '', innerMax);
    const und = t.textDecoration === 'underline';
    const count = Math.max(1, indexed.length);
    indexed.forEach((line, li) => {
      const ly = (li - (count - 1) / 2) * lineHeight;
      ctx.font = buildCanvasTextFont(t);
      const tw = ctx.measureText(line.text || ' ').width;
      let x = align === 'right' ? innerRight - tw : align === 'center' ? -tw / 2 : innerLeft;
      ctx.textAlign = 'left';
      let gi = line.start;
      for (const ch of line.text) {
        ctx.font = buildCanvasTextFont(t);
        const slotW = ctx.measureText(ch).width;
        const script = scriptAtIndex(ranges, gi);
        if (script === 'normal') {
          ctx.fillText(ch, x, ly);
        } else {
          const small = Math.max(8, fs * CANVAS_TEXT_SCRIPT_SCALE);
          ctx.font = buildCanvasTextFontAtSize(t, small);
          ctx.fillText(ch, x, ly + canvasTextScriptDy(fs, script));
        }
        x += slotW;
        gi += ch.length;
      }
      if (!und) return;
      ctx.font = buildCanvasTextFont(t);
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1, fs * 0.07);
      ctx.lineCap = 'round';
      const uy = ly + fs * 0.48;
      const x0 = align === 'right' ? innerRight - tw : align === 'center' ? -tw / 2 : innerLeft;
      ctx.beginPath();
      ctx.moveTo(x0, uy);
      ctx.lineTo(x0 + tw, uy);
      ctx.stroke();
    });
    ctx.restore();
  }
};
