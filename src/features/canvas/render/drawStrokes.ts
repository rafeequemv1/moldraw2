/**
 * User pencil-strokes (committed) plus the live ghost stroke being drawn.
 * Strokes are simple polylines with per-stroke color and thickness.
 */
import type { RenderContext } from './types';

export const drawCommittedStrokes = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const list = R.renderedMolecule.strokes;
  if (!list) return;
  list.forEach(stroke => {
    if (stroke.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.thickness;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  });
};

export const drawPencilGhost = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  if (R.activeTool !== 'pencil' || !R.drawingStroke || R.drawingStroke.length <= 1) return;
  ctx.beginPath();
  ctx.moveTo(R.drawingStroke[0].x, R.drawingStroke[0].y);
  for (let i = 1; i < R.drawingStroke.length; i++) {
    ctx.lineTo(R.drawingStroke[i].x, R.drawingStroke[i].y);
  }
  ctx.strokeStyle = R.activeColor;
  ctx.lineWidth = R.activeThickness;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
};
