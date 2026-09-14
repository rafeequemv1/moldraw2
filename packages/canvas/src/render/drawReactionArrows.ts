/**
 * Reaction arrows, endpoint handles when selected, reagent labels, and draw ghost.
 */
import type { ReactionArrow } from '@moldraw/domain';
import { reactionArrowSupportsReagentLabels } from '@moldraw/domain';
import { formatReagentLineForCanvas, resolveReactionArrowGeometry } from '@moldraw/core';
import {
  buildReactionArrowFromDrag,
  drawReactionArrowShape,
  listReactionArrowEditHandles,
  reactionArrowAfterDelta,
  reactionArrowEndpointResizePatch,
  reactionArrowReagentLabelAnchor,
  reactionArrowReagentSlotPositions,
} from '../geometry';
import type { RenderContext } from './types';

const ENDPOINT_HANDLE_R = 7.5;

const arrowWithDragPreview = (arr: ReactionArrow, R: RenderContext): ReactionArrow => {
  const d = R.dragAction;
  if (d?.type === 'move_reaction_arrow' && d.arrowId === arr.id) {
    const odx = d.currentX - d.startX;
    const ody = d.currentY - d.startY;
    return reactionArrowAfterDelta(d.origArrow, odx, ody);
  }
  if (d?.type === 'resize_reaction_arrow' && d.arrowId === arr.id) {
    const odx = d.currentX - d.startX;
    const ody = d.currentY - d.startY;
    return {
      ...d.origArrow,
      ...reactionArrowEndpointResizePatch(d.origArrow, d.endpoint, odx, ody, {
        vertexIndex: d.vertexIndex,
      }),
    } as ReactionArrow;
  }
  return arr;
};

const drawEditHandles = (
  ctx: CanvasRenderingContext2D,
  a: ReactionArrow,
  R: RenderContext,
): void => {
  const vz = R.viewport.zoom;
  const lw = 1.5 / vz;
  const r = ENDPOINT_HANDLE_R / vz;
  ctx.save();
  ctx.setLineDash([]);
  for (const h of listReactionArrowEditHandles(a)) {
    ctx.beginPath();
    ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = lw;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
};

const drawReagentLabels = (ctx: CanvasRenderingContext2D, a: ReactionArrow, R: RenderContext): void => {
  if (!a.reagentAbove?.trim() && !a.reagentBelow?.trim()) return;
  const { mx, my, nx, ny, angle: labelAngle } = reactionArrowReagentLabelAnchor(a);
  const fs = a.reagentFontSize ?? 14;
  const lineGap = fs * 1.18;
  const baseOff = 18 + fs * 0.45;
  const weight = a.reagentFontWeight === 'bold' ? 700 : 500;

  ctx.save();
  ctx.fillStyle = a.reagentColor ?? R.structureTheme.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${weight} ${fs}px system-ui, sans-serif`;

  const fmt = a.reagentFormat;
  const drawStack = (lines: string[], sign: 1 | -1) => {
    lines.forEach((line, li) => {
      const display = formatReagentLineForCanvas(line, fmt);
      const off = baseOff + li * lineGap;
      const px = mx + sign * nx * off;
      const py = my + sign * ny * off;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(labelAngle);
      ctx.fillText(display, 0, 0);
      ctx.restore();
    });
  };

  if (a.reagentAbove?.trim()) {
    drawStack(
      a.reagentAbove.split('\n').map(s => s.trim()).filter(Boolean),
      1,
    );
  }
  if (a.reagentBelow?.trim()) {
    drawStack(
      a.reagentBelow.split('\n').map(s => s.trim()).filter(Boolean),
      -1,
    );
  }
  ctx.restore();
};

const drawReagentSlotChips = (
  ctx: CanvasRenderingContext2D,
  a: ReactionArrow,
  R: RenderContext,
): void => {
  if (!reactionArrowSupportsReagentLabels(a.kind)) return;
  const slots = reactionArrowReagentSlotPositions(a);
  const vz = R.viewport.zoom;
  const r = 7 / vz;
  const lw = 1.25 / vz;
  const fs = 8 / vz;

  ctx.save();
  ctx.setLineDash([]);
  for (const slot of ['above', 'below'] as const) {
    const { x, y } = slots[slot];
    const hasText =
      slot === 'above' ? Boolean(a.reagentAbove?.trim()) : Boolean(a.reagentBelow?.trim());
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (hasText) {
      ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.45)';
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.55)';
    }
    ctx.lineWidth = lw;
    ctx.fill();
    ctx.stroke();
    if (!hasText) {
      ctx.fillStyle = '#2563eb';
      ctx.font = `600 ${fs}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', x, y + 0.5 / vz);
    }
  }
  ctx.restore();
};

export const drawReactionArrows = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const mol = R.renderedMolecule;
  (mol.reactionArrows ?? []).forEach(arr => {
    const previewed = arrowWithDragPreview(arr, R);
    const resizing =
      R.dragAction?.type === 'resize_reaction_arrow' && R.dragAction.arrowId === arr.id;
    // While dragging a handle, keep the live preview — do not re-resolve from
    // chemistry anchors (that would pin the dots and ignore the pointer).
    const drawn = resizing ? previewed : resolveReactionArrowGeometry(mol, previewed);
    const isSelected =
      (R.selectedReactionArrowIds?.includes(arr.id) ?? false) ||
      R.selectedReactionArrowId === arr.id;
    const col = isSelected ? '#2563eb' : R.structureTheme.ink;
    const lw = isSelected ? 2.25 : 2;
    drawReactionArrowShape(ctx, drawn, { color: col, lineWidth: drawn.strokeWidth ?? lw });
    if (drawn.reagentAbove?.trim() || drawn.reagentBelow?.trim()) {
      drawReagentLabels(ctx, drawn, R);
    }
    if (isSelected) {
      drawEditHandles(ctx, drawn, R);
      drawReagentSlotChips(ctx, drawn, R);
    }
  });
};

/**
 * In-progress drag ghost — must paint on the overlay layer so structure-cache
 * reuse during drag still shows a live preview.
 */
export const drawReactionArrowGhost = (
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
): void => {
  if (!R.drawingReactionArrow) return;
  const d = R.drawingReactionArrow;
  const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
  // Parked first click: show the start handle so the user knows to click the end.
  if (len < 6) {
    const vz = R.viewport.zoom;
    const r = ENDPOINT_HANDLE_R / vz;
    ctx.save();
    ctx.beginPath();
    ctx.arc(d.x1, d.y1, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5 / vz;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }
  const ghost = buildReactionArrowFromDrag(d, '_ghost');
  ctx.save();
  ctx.globalAlpha = 0.5;
  drawReactionArrowShape(ctx, ghost, {
    color: R.structureTheme.ink,
    lineWidth: 2,
    dashedGhost: true,
  });
  ctx.restore();
};
