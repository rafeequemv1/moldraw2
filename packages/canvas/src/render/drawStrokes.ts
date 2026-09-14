/**
 * User pencil-strokes (committed) plus the live ghost stroke being drawn.
 * Strokes are polylines with per-stroke color and thickness; pen-drawn
 * strokes may carry per-point pressure, rendered as a variable line width.
 */
import type { Point } from '../geometry';
import type { RenderContext, StrokeSample } from './types';

const strokeSelected = (R: RenderContext, id: string): boolean =>
  (R.selectedStrokeIds?.includes(id) ?? false) || R.selectedStrokeId === id;

/** Line-width multiplier for a pressure sample (0.5 ≙ nominal thickness). */
export const pressureWidthScale = (pressure: number): number => {
  const p = pressure < 0 ? 0 : pressure > 1 ? 1 : pressure;
  return 0.35 + 1.3 * p;
};

const strokePolyline = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  width: number,
): void => {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i]!.x, points[i]!.y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
};

/**
 * Variable-width polyline: each segment is stroked with the mean pressure of
 * its endpoints. Round caps make adjacent segments blend into one ribbon.
 */
const strokePressurePolyline = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  pressures: number[],
  color: string,
  thickness: number,
  extraWidth = 0,
): void => {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const p = ((pressures[i - 1] ?? 0.5) + (pressures[i] ?? 0.5)) / 2;
    ctx.lineWidth = thickness * pressureWidthScale(p) + extraWidth;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
};

export const drawCommittedStrokes = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const list = R.renderedMolecule.strokes;
  if (!list) return;
  list.forEach(stroke => {
    if (stroke.points.length < 2) return;
    const selected = strokeSelected(R, stroke.id);
    const color = selected ? '#2563eb' : stroke.color;
    const pressures = stroke.pressures;
    if (pressures && pressures.length === stroke.points.length) {
      strokePressurePolyline(
        ctx,
        stroke.points,
        pressures,
        color,
        stroke.thickness,
        selected ? 2 : 0,
      );
      return;
    }
    strokePolyline(ctx, stroke.points, color, selected ? stroke.thickness + 2 : stroke.thickness);
  });
};

/** Live stroke: variable width when every sample carries pen pressure. */
const drawLiveStroke = (
  ctx: CanvasRenderingContext2D,
  samples: StrokeSample[],
  color: string,
  thickness: number,
): void => {
  if (samples.length >= 2 && samples.every(s => s.pressure != null)) {
    strokePressurePolyline(
      ctx,
      samples,
      samples.map(s => s.pressure ?? 0.5),
      color,
      thickness,
    );
    return;
  }
  strokePolyline(ctx, samples, color, thickness);
};

export const drawPencilGhost = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const liveInk = R.activeTool === 'pencil' || R.activeTool === 'smart_draw';
  if (R.activeTool === 'smart_draw') {
    for (const stroke of R.smartDrawSessionStrokes) {
      strokePolyline(ctx, stroke.points, R.activeColor, R.activeThickness);
    }
  }
  if (!liveInk || !R.drawingStroke || R.drawingStroke.length <= 1) return;
  drawLiveStroke(ctx, R.drawingStroke, R.activeColor, R.activeThickness);
};
