/**
 * Reaction arrows, endpoint handles when selected, reagent labels, and draw ghost.
 */
import type { ReactionArrow } from '@moldraw/domain';
import { formatReagentLineForCanvas } from '@moldraw/core/chemistry/reagentFormat';
import {
  buildReactionArrowFromDrag,
  drawReactionArrowShape,
  getReactionArrowCurveHandleWorld,
  reactionArrowAfterDelta,
  reactionArrowEndpointResizePatch,
} from '../geometry';
import type { RenderContext } from './types';

const ENDPOINT_HANDLE_R = 4.5;
const CURVE_HANDLE_R = 4.25;

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
      ...reactionArrowEndpointResizePatch(d.origArrow, d.endpoint, odx, ody),
    } as ReactionArrow;
  }
  return arr;
};

const drawEndpointHandles = (
  ctx: CanvasRenderingContext2D,
  a: ReactionArrow,
  R: RenderContext,
): void => {
  const vz = R.viewport.zoom;
  const lw = 1.5 / vz;
  const r = ENDPOINT_HANDLE_R / vz;
  ctx.save();
  ctx.setLineDash([]);
  for (const [x, y] of [
    [a.x1, a.y1],
    [a.x2, a.y2],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = lw;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
};

const drawCurveHandle = (
  ctx: CanvasRenderingContext2D,
  a: ReactionArrow,
  R: RenderContext,
): void => {
  const h = getReactionArrowCurveHandleWorld(a);
  if (!h) return;
  const vz = R.viewport.zoom;
  const lw = 1.5 / vz;
  const r = CURVE_HANDLE_R / vz;
  ctx.save();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff7ed';
  ctx.strokeStyle = '#ea580c';
  ctx.lineWidth = lw;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};

const drawReagentLabels = (ctx: CanvasRenderingContext2D, a: ReactionArrow): void => {
  if (!a.reagentAbove?.trim() && !a.reagentBelow?.trim()) return;
  const dx = a.x2 - a.x1;
  const dy = a.y2 - a.y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const mx = (a.x1 + a.x2) / 2;
  const my = (a.y1 + a.y2) / 2;
  const fs = a.reagentFontSize ?? 14;
  const lineGap = fs * 1.18;
  const baseOff = 18 + fs * 0.45;
  const weight = a.reagentFontWeight === 'bold' ? 700 : 500;

  const shaftAngle = Math.atan2(dy, dx);
  let labelAngle = shaftAngle;
  if (Math.cos(labelAngle) < 0) {
    labelAngle += Math.PI;
  }

  ctx.save();
  ctx.fillStyle = a.reagentColor ?? '#475569';
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

export const drawReactionArrows = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  (R.renderedMolecule.reactionArrows ?? []).forEach(arr => {
    const drawn = arrowWithDragPreview(arr, R);
    const isSelected = R.selectedReactionArrowId === arr.id;
    const col = isSelected ? '#2563eb' : '#0f172a';
    const lw = isSelected ? 2.25 : 2;
    drawReactionArrowShape(ctx, drawn, { color: col, lineWidth: drawn.strokeWidth ?? lw });
    if (drawn.reagentAbove?.trim() || drawn.reagentBelow?.trim()) {
      drawReagentLabels(ctx, drawn);
    }
    if (isSelected) {
      drawEndpointHandles(ctx, drawn, R);
      drawCurveHandle(ctx, drawn, R);
    }
  });

  if (R.drawingReactionArrow) {
    const ghost = buildReactionArrowFromDrag(R.drawingReactionArrow, '_ghost');
    drawReactionArrowShape(ctx, ghost, {
      color: 'rgba(15, 23, 42, 0.5)',
      lineWidth: 2,
      dashedGhost: true,
    });
  }
};
