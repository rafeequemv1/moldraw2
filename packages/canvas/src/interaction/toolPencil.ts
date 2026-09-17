import type { StrokeSample } from '../render/types';
import type { InteractionContext } from './types';
import { isSmartDrawTool } from './smartDrawSession';

/**
 * Pencil / Smart Draw stroke capture. Down seeds the array, move appends
 * each pointer position (so density follows pointer speed), up commits the
 * stroke via `onAddStroke` (annotate) or `onSmartDrawStroke` (Smart Draw).
 * Single-point taps are dropped.
 *
 * Stylus input also records per-sample pressure so the committed stroke can
 * render with a variable width (see `Stroke.pressures`).
 */

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const sampleFor = (ctx: InteractionContext): StrokeSample =>
  ctx.inputProfile === 'pen'
    ? { x: ctx.worldPos.x, y: ctx.worldPos.y, pressure: clamp01(ctx.e.pressure ?? 0.5) }
    : ctx.worldPos;

const samePos = (a: StrokeSample, b: StrokeSample): boolean =>
  Math.abs(a.x - b.x) <= 1e-6 && Math.abs(a.y - b.y) <= 1e-6;

/**
 * Pressure array for a committed stroke, or undefined when the stroke has no
 * usable pressure signal (mouse / touch, or a pen reporting a constant value).
 */
export const strokePressures = (samples: StrokeSample[]): number[] | undefined => {
  if (samples.length < 2) return undefined;
  let min = Infinity;
  let max = -Infinity;
  for (const s of samples) {
    if (s.pressure == null) return undefined;
    if (s.pressure < min) min = s.pressure;
    if (s.pressure > max) max = s.pressure;
  }
  if (max - min < 0.02) return undefined;
  return samples.map(s => clamp01(s.pressure ?? 0.5));
};

export const pencilToolMouseDown = (ctx: InteractionContext): boolean => {
  if (ctx.e.button !== 0) return false;
  // Drawing must not inherit / show transform chrome on an existing stroke.
  ctx.setColorEditStrokeId?.(null);
  ctx.setDrawingStroke([sampleFor(ctx)]);
  return true;
};

export const pencilToolMouseMove = (ctx: InteractionContext): boolean => {
  if (!ctx.drawingStroke) return false;
  const current = sampleFor(ctx);
  // Pen / touch: the browser may batch several samples into one pointermove.
  // Append them all (oldest first) so fast strokes stay smooth, then the
  // final dispatched position.
  const extra = ctx.coalescedWorldPositions;
  ctx.setDrawingStroke(prev => {
    if (!prev) return null;
    if (!extra || extra.length === 0) return [...prev, current];
    const next = prev.slice();
    let last = prev[prev.length - 1];
    for (const p of extra) {
      if (!last || !samePos(p, last)) {
        next.push(p);
        last = p;
      }
    }
    if (!last || !samePos(current, last)) {
      next.push(current);
    }
    return next;
  });
  return true;
};

export const pencilToolMouseUp = (ctx: InteractionContext): boolean => {
  const stroke = ctx.drawingStroke;
  if (!stroke) return false;
  if (stroke.length > 1) {
    if (isSmartDrawTool(ctx.activeTool) && ctx.onSmartDrawStroke) {
      ctx.onSmartDrawStroke(stroke.map(p => ({ x: p.x, y: p.y })));
    } else if (ctx.onAddStroke) {
      const pressures = strokePressures(stroke);
      ctx.onAddStroke({
        id: Math.random().toString(36).substr(2, 9),
        points: stroke.map(p => ({ x: p.x, y: p.y })),
        color: ctx.activeColor,
        thickness: ctx.activeThickness,
        ...(pressures ? { pressures } : {}),
      });
    }
  }
  ctx.setDrawingStroke(null);
  return true;
};
