/**
 * Committed annotation shapes + live drag preview for the shape tool.
 */
import { strokeShapeKind } from '../geometry';
import type { RenderContext } from './types';

export const drawCommittedCanvasShapes = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const shapes = R.renderedMolecule.canvasShapes ?? [];
  for (const s of shapes) {
    strokeShapeKind(ctx, s.kind, s.x1, s.y1, s.x2, s.y2, {
      strokeStyle: s.color,
      lineWidth: s.strokeWidth,
    });
  }
};

export const drawCanvasShapeGhost = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const g = R.drawingCanvasShape;
  if (!g) return;
  ctx.save();
  ctx.setLineDash([5, 5]);
  strokeShapeKind(ctx, g.kind, g.x1, g.y1, g.x2, g.y2, {
    strokeStyle: 'rgba(15, 23, 42, 0.45)',
    lineWidth: Math.max(1, R.activeThickness - 0.5),
  });
  ctx.setLineDash([]);
  ctx.restore();
};
