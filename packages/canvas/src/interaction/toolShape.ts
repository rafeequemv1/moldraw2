import {
  CONICAL_FLASK_DEFAULT_FILL,
  CONICAL_FLASK_DEFAULT_LEVEL,
  isLiquidGlasswareShape,
  type CanvasShape,
} from '@moldraw/domain';
import { normalizeShapeBox } from '../geometry';
import type { InteractionContext } from './types';

const MIN_DRAG_WORLD = 6;

/**
 * Shape tool: click-drag places a rectangle / line / circle / triangle / star.
 * Kind comes from `ctx.canvasShapeKind` (toolbar dropdown).
 */
export const shapeToolMouseDown = (ctx: InteractionContext): boolean => {
  if (ctx.e.button !== 0) return false;
  const { worldPos } = ctx;
  ctx.setDrawingCanvasShape({
    kind: ctx.canvasShapeKind,
    x1: worldPos.x,
    y1: worldPos.y,
    x2: worldPos.x,
    y2: worldPos.y,
  });
  ctx.setMouseDownPos({ x: ctx.e.clientX, y: ctx.e.clientY });
  return true;
};

export const shapeToolMouseMove = (ctx: InteractionContext): boolean => {
  if (!ctx.drawingCanvasShape) return false;
  const { worldPos } = ctx;
  ctx.setDrawingCanvasShape(prev =>
    prev ? { ...prev, x2: worldPos.x, y2: worldPos.y } : null,
  );
  return true;
};

export const shapeToolMouseUp = (ctx: InteractionContext): boolean => {
  const drag = ctx.drawingCanvasShape;
  if (!drag) return false;

  const kind = drag.kind;
  let x1 = drag.x1;
  let y1 = drag.y1;
  let x2 = drag.x2;
  let y2 = drag.y2;

  if (kind !== 'line') {
    const B = normalizeShapeBox(drag.x1, drag.y1, drag.x2, drag.y2);
    x1 = B.x1;
    y1 = B.y1;
    x2 = B.x2;
    y2 = B.y2;
  }

  const span =
    kind === 'line'
      ? Math.hypot(x2 - x1, y2 - y1)
      : Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));

  if (span >= MIN_DRAG_WORLD && ctx.onAddCanvasShape) {
    const shape: CanvasShape = {
      id: Math.random().toString(36).substring(2, 11),
      kind,
      x1,
      y1,
      x2,
      y2,
      color: ctx.activeColor,
      strokeWidth: ctx.activeThickness,
      ...(isLiquidGlasswareShape(kind)
        ? { fillColor: CONICAL_FLASK_DEFAULT_FILL, fillLevel: CONICAL_FLASK_DEFAULT_LEVEL }
        : {}),
    };
    ctx.onAddCanvasShape(shape);
    ctx.setColorEditCanvasShapeId?.(shape.id);
  }

  ctx.setDrawingCanvasShape(null);
  return true;
};
