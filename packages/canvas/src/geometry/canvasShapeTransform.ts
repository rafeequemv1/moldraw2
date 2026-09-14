/**
 * Move / resize / rotate helpers for annotation shapes (bbox + optional rotation).
 */
import type { CanvasShape } from '@moldraw/domain';
import { normalizeShapeBox } from './canvasShapes';

const MIN_SPAN = 16;
const ROTATE_HANDLE_OFFSET = 28;
const RESIZE_HANDLE_R = 8;
const ROTATE_HANDLE_R = 10;

export type CanvasShapeBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  rotationRad: number;
};

export const getCanvasShapeBox = (shape: CanvasShape): CanvasShapeBox => {
  if (shape.kind === 'line') {
    const x1 = Math.min(shape.x1, shape.x2);
    const y1 = Math.min(shape.y1, shape.y2);
    const x2 = Math.max(shape.x1, shape.x2);
    const y2 = Math.max(shape.y1, shape.y2);
    const width = Math.max(MIN_SPAN, x2 - x1);
    const height = Math.max(MIN_SPAN, y2 - y1);
    return {
      x1,
      y1,
      x2: x1 + width,
      y2: y1 + height,
      width,
      height,
      cx: (shape.x1 + shape.x2) / 2,
      cy: (shape.y1 + shape.y2) / 2,
      rotationRad: shape.rotationRad ?? 0,
    };
  }
  const B = normalizeShapeBox(shape.x1, shape.y1, shape.x2, shape.y2);
  const width = Math.max(MIN_SPAN, B.x2 - B.x1);
  const height = Math.max(MIN_SPAN, B.y2 - B.y1);
  return {
    x1: B.x1,
    y1: B.y1,
    x2: B.x1 + width,
    y2: B.y1 + height,
    width,
    height,
    cx: B.x1 + width / 2,
    cy: B.y1 + height / 2,
    rotationRad: shape.rotationRad ?? 0,
  };
};

export const worldToShapeLocal = (
  shape: CanvasShape,
  wx: number,
  wy: number,
): { lx: number; ly: number } => {
  const box = getCanvasShapeBox(shape);
  const dx = wx - box.cx;
  const dy = wy - box.cy;
  const c = Math.cos(-box.rotationRad);
  const s = Math.sin(-box.rotationRad);
  return { lx: dx * c - dy * s, ly: dx * s + dy * c };
};

export const shapeLocalToWorld = (
  shape: CanvasShape,
  lx: number,
  ly: number,
): { x: number; y: number } => {
  const box = getCanvasShapeBox(shape);
  const c = Math.cos(box.rotationRad);
  const s = Math.sin(box.rotationRad);
  return {
    x: box.cx + lx * c - ly * s,
    y: box.cy + lx * s + ly * c,
  };
};

export const getCanvasShapeResizeHandleWorld = (shape: CanvasShape): { x: number; y: number } => {
  const box = getCanvasShapeBox(shape);
  return shapeLocalToWorld(shape, box.width / 2, box.height / 2);
};

export const getCanvasShapeRotateHandleWorld = (shape: CanvasShape): { x: number; y: number } => {
  const box = getCanvasShapeBox(shape);
  return shapeLocalToWorld(shape, 0, -box.height / 2 - ROTATE_HANDLE_OFFSET);
};

/** Axis-aligned world bounds of one or more shapes (for grouped COF selection). */
export const getShapesWorldAabb = (
  shapes: CanvasShape[],
): { x1: number; y1: number; x2: number; y2: number; cx: number; cy: number; width: number; height: number } | null => {
  if (shapes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const shape of shapes) {
    const box = getCanvasShapeBox(shape);
    const hw = box.width / 2;
    const hh = box.height / 2;
    for (const [lx, ly] of [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ] as const) {
      const p = shapeLocalToWorld(shape, lx, ly);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  const width = Math.max(MIN_SPAN, maxX - minX);
  const height = Math.max(MIN_SPAN, maxY - minY);
  return {
    x1: minX,
    y1: minY,
    x2: minX + width,
    y2: minY + height,
    width,
    height,
    cx: minX + width / 2,
    cy: minY + height / 2,
  };
};

export const pickCanvasShapeResizeHandle = (
  shape: CanvasShape,
  wx: number,
  wy: number,
  zoom: number,
): boolean => {
  const h = getCanvasShapeResizeHandleWorld(shape);
  const r = Math.max(RESIZE_HANDLE_R / 2, RESIZE_HANDLE_R / zoom);
  return Math.hypot(wx - h.x, wy - h.y) <= r;
};

export const pickCanvasShapeRotateHandle = (
  shape: CanvasShape,
  wx: number,
  wy: number,
  zoom: number,
): boolean => {
  const h = getCanvasShapeRotateHandleWorld(shape);
  const r = Math.max(ROTATE_HANDLE_R / 2, ROTATE_HANDLE_R / zoom);
  return Math.hypot(wx - h.x, wy - h.y) <= r;
};

/** Hit-test shape including rotation (bbox for most; segment for line). */
export const hitCanvasShapeTransformed = (
  shape: CanvasShape,
  wx: number,
  wy: number,
  tol = 12,
): boolean => {
  const box = getCanvasShapeBox(shape);
  const { lx, ly } = worldToShapeLocal(shape, wx, wy);
  const t = tol + shape.strokeWidth * 0.5;

  if (shape.kind === 'line') {
    const a = worldToShapeLocal(shape, shape.x1, shape.y1);
    const b = worldToShapeLocal(shape, shape.x2, shape.y2);
    const dx = b.lx - a.lx;
    const dy = b.ly - a.ly;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-8) return Math.hypot(lx - a.lx, ly - a.ly) <= t;
    let u = ((lx - a.lx) * dx + (ly - a.ly) * dy) / len2;
    u = Math.max(0, Math.min(1, u));
    return Math.hypot(lx - (a.lx + u * dx), ly - (a.ly + u * dy)) <= t;
  }

  return (
    lx >= -box.width / 2 - t &&
    lx <= box.width / 2 + t &&
    ly >= -box.height / 2 - t &&
    ly <= box.height / 2 + t
  );
};

export const canvasShapeMovePatch = (
  shape: CanvasShape,
  dx: number,
  dy: number,
): Partial<CanvasShape> => ({
  x1: shape.x1 + dx,
  y1: shape.y1 + dy,
  x2: shape.x2 + dx,
  y2: shape.y2 + dy,
});

export const canvasShapeResizePatch = (
  orig: CanvasShape,
  pointerX: number,
  pointerY: number,
  lockAspect = false,
): Partial<CanvasShape> => {
  const box = getCanvasShapeBox(orig);
  const { lx, ly } = worldToShapeLocal(orig, pointerX, pointerY);
  let newW = Math.max(MIN_SPAN, lx - -box.width / 2);
  let newH = Math.max(MIN_SPAN, ly - -box.height / 2);
  if (lockAspect && box.width > 0 && box.height > 0) {
    const aspect = box.width / box.height;
    if (newW / newH > aspect) newH = newW / aspect;
    else newW = newH * aspect;
    newW = Math.max(MIN_SPAN, newW);
    newH = Math.max(MIN_SPAN, newH);
  }

  const oldTl = shapeLocalToWorld(orig, -box.width / 2, -box.height / 2);
  const rot = box.rotationRad;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const ncx = oldTl.x + (newW / 2) * c - (newH / 2) * s;
  const ncy = oldTl.y + (newW / 2) * s + (newH / 2) * c;
  const nx1 = ncx - newW / 2;
  const ny1 = ncy - newH / 2;
  const nx2 = ncx + newW / 2;
  const ny2 = ncy + newH / 2;

  if (orig.kind === 'line') {
    // Scale line endpoints relative to old center into new box.
    const a = worldToShapeLocal(orig, orig.x1, orig.y1);
    const b = worldToShapeLocal(orig, orig.x2, orig.y2);
    const sx = newW / box.width;
    const sy = newH / box.height;
    const aW = shapeLocalToWorld(
      { ...orig, x1: nx1, y1: ny1, x2: nx2, y2: ny2 },
      a.lx * sx,
      a.ly * sy,
    );
    const bW = shapeLocalToWorld(
      { ...orig, x1: nx1, y1: ny1, x2: nx2, y2: ny2 },
      b.lx * sx,
      b.ly * sy,
    );
    return { x1: aW.x, y1: aW.y, x2: bW.x, y2: bW.y };
  }

  return { x1: nx1, y1: ny1, x2: nx2, y2: ny2 };
};

export const canvasShapeRotatePatch = (
  orig: CanvasShape,
  startPointerAngle: number,
  currentPointerAngle: number,
): Partial<CanvasShape> => {
  const delta = currentPointerAngle - startPointerAngle;
  return { rotationRad: (orig.rotationRad ?? 0) + delta };
};

export const canvasShapeWithDragPreview = (
  shape: CanvasShape,
  drag:
    | {
        type: 'move_canvas_shape';
        shapeId: string;
        shapeIds?: string[];
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
        origX1: number;
        origY1: number;
        origX2: number;
        origY2: number;
        origById?: Record<string, { x1: number; y1: number; x2: number; y2: number }>;
      }
    | {
        type: 'resize_canvas_shape';
        shapeId: string;
        currentX: number;
        currentY: number;
        origShape: CanvasShape;
        lockAspect?: boolean;
      }
    | {
        type: 'rotate_canvas_shape';
        shapeId: string;
        startPointerAngle: number;
        currentPointerAngle: number;
        origShape: CanvasShape;
      }
    | null
    | undefined,
): CanvasShape => {
  if (!drag) return shape;
  if (drag.type === 'move_canvas_shape') {
    const inGroup =
      drag.shapeId === shape.id ||
      (drag.shapeIds?.includes(shape.id) ?? false) ||
      Boolean(drag.origById?.[shape.id]);
    if (!inGroup) return shape;
    const dx = drag.currentX - drag.startX;
    const dy = drag.currentY - drag.startY;
    const orig = drag.origById?.[shape.id] ??
      (drag.shapeId === shape.id
        ? { x1: drag.origX1, y1: drag.origY1, x2: drag.origX2, y2: drag.origY2 }
        : null);
    if (!orig) return shape;
    return {
      ...shape,
      x1: orig.x1 + dx,
      y1: orig.y1 + dy,
      x2: orig.x2 + dx,
      y2: orig.y2 + dy,
    };
  }
  if (drag.shapeId !== shape.id) return shape;
  if (drag.type === 'resize_canvas_shape') {
    return {
      ...drag.origShape,
      ...canvasShapeResizePatch(
        drag.origShape,
        drag.currentX,
        drag.currentY,
        drag.lockAspect === true,
      ),
    };
  }
  if (drag.type === 'rotate_canvas_shape') {
    return {
      ...drag.origShape,
      ...canvasShapeRotatePatch(
        drag.origShape,
        drag.startPointerAngle,
        drag.currentPointerAngle,
      ),
    };
  }
  return shape;
};
