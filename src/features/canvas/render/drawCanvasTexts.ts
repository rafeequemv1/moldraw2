/**
 * Free-text annotations placed by the user (the "T" tool). Each block can be
 * styled (size/color/bold/italic/underline) and can span multiple lines.
 */
import {
  buildCanvasTextFont,
  getCanvasTextBox,
  measureCanvasTextBox,
} from '../geometry';
import type { RenderContext } from './types';

export const drawCanvasTexts = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const list = R.renderedMolecule.canvasTexts ?? [];
  if (list.length === 0) return;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const t of list) {
    let x = t.x;
    let y = t.y;
    let boxW = t.boxWidth;
    let boxH = t.boxHeight;

    if (R.dragAction?.type === 'move_canvas_text' && R.dragAction.textId === t.id) {
      x = R.dragAction.origX + (R.dragAction.currentX - R.dragAction.startX);
      y = R.dragAction.origY + (R.dragAction.currentY - R.dragAction.startY);
    } else if (R.dragAction?.type === 'resize_canvas_text' && R.dragAction.textId === t.id) {
      const patchW = Math.max(48, R.dragAction.currentX - R.dragAction.anchorLeft);
      const patchH = Math.max(24, R.dragAction.currentY - R.dragAction.anchorTop);
      boxW = patchW;
      boxH = patchH;
      x = R.dragAction.anchorLeft + patchW / 2;
      y = R.dragAction.anchorTop + patchH / 2;
    }

    const ghost: typeof t = { ...t, x, y, boxWidth: boxW, boxHeight: boxH };
    const box = getCanvasTextBox(ctx, ghost);
    const { lineHeight, lines } = measureCanvasTextBox(ctx, ghost);

    if (R.selectedCanvasTextId === t.id) {
      const z = R.viewport.zoom;
      ctx.save();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1 / z;
      ctx.setLineDash([4 / z, 3 / z]);
      ctx.strokeRect(box.left, box.top, box.width, box.height);
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#3b82f6';
      const hs = Math.max(5, 6 / z);
      const hx = box.right;
      const hy = box.bottom;
      ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
      ctx.strokeRect(hx - hs, hy - hs, hs * 2, hs * 2);
      ctx.restore();
    }

    if (t.id === R.omitCanvasTextBodyId) continue;

    ctx.fillStyle = t.color;
    ctx.font = buildCanvasTextFont(ghost);
    const und = t.textDecoration === 'underline';
    lines.forEach((line, li) => {
      const ly = y + (li - (lines.length - 1) / 2) * lineHeight;
      ctx.fillText(line, x, ly);
      if (!und) return;
      const tw = ctx.measureText(line || ' ').width;
      ctx.save();
      ctx.strokeStyle = t.color;
      ctx.lineWidth = Math.max(1, t.fontSize * 0.07);
      ctx.lineCap = 'round';
      const uy = ly + t.fontSize * 0.38;
      ctx.beginPath();
      ctx.moveTo(x - tw / 2, uy);
      ctx.lineTo(x + tw / 2, uy);
      ctx.stroke();
      ctx.restore();
    });
  }
};
