/**
 * Hit-testing and canvas stroking for annotation shapes (rectangle, line, …).
 */
import type { CanvasShape, CanvasShapeKind } from '@moldraw/domain';
import { pointSegDist } from './angles';

/** Normalize drag corners to axis-aligned box (for non-line shapes). */
export const normalizeShapeBox = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x1: number; y1: number; x2: number; y2: number } => ({
  x1: Math.min(x1, x2),
  y1: Math.min(y1, y2),
  x2: Math.max(x1, x2),
  y2: Math.max(y1, y2),
});

const distToRectEdge = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
  const dx = Math.max(x1 - px, 0, px - x2);
  const dy = Math.max(y1 - py, 0, py - y2);
  if (dx === 0 && dy === 0) return 0;
  if (dx === 0) return dy;
  if (dy === 0) return dx;
  return Math.hypot(dx, dy);
};

/** Approximate hit: distance to shape outline ≤ tol (world px). */
export const hitCanvasShape = (shape: CanvasShape, wx: number, wy: number, tol = 12): boolean => {
  const sw = shape.strokeWidth * 0.5;
  const t = tol + sw;

  if (shape.kind === 'line') {
    return pointSegDist(wx, wy, shape.x1, shape.y1, shape.x2, shape.y2) <= t;
  }

  const { x1, y1, x2, y2 } = normalizeShapeBox(shape.x1, shape.y1, shape.x2, shape.y2);
  if (shape.kind === 'rectangle') {
    return distToRectEdge(wx, wy, x1, y1, x2, y2) <= t;
  }

  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2;
  const ry = Math.abs(y2 - y1) / 2;
  if (rx < 1e-6 || ry < 1e-6) return Math.hypot(wx - cx, wy - cy) <= t;

  if (shape.kind === 'circle') {
    const nx = (wx - cx) / rx;
    const ny = (wy - cy) / ry;
    const d = Math.abs(Math.hypot(nx, ny) - 1) * Math.min(rx, ry);
    return d <= t;
  }

  // Triangle / star: bbox hit with slightly generous tol (good enough for erase)
  return wx >= x1 - t && wx <= x2 + t && wy >= y1 - t && wy <= y2 + t;
};

export const pickCanvasShapeAt = (
  shapes: CanvasShape[] | undefined,
  wx: number,
  wy: number,
): CanvasShape | null => {
  const list = shapes ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (hitCanvasShape(list[i], wx, wy)) return list[i];
  }
  return null;
};

/** Build a 5-point star path centered in the box; outer radius = min(rx, ry). */
export const starPathInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void => {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2;
  const ry = Math.abs(y2 - y1) / 2;
  const outer = Math.min(rx, ry);
  const inner = outer * 0.38;
  const spikes = 5;
  const step = Math.PI / spikes;
  ctx.beginPath();
  for (let i = 0; i < 2 * spikes; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = i * step - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
};

export const trianglePathInBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void => {
  const apexX = (x1 + x2) / 2;
  const apexY = y1;
  const baseLeftX = x1;
  const baseLeftY = y2;
  const baseRightX = x2;
  const baseRightY = y2;
  ctx.beginPath();
  ctx.moveTo(apexX, apexY);
  ctx.lineTo(baseRightX, baseRightY);
  ctx.lineTo(baseLeftX, baseLeftY);
  ctx.closePath();
};

export const strokeShapeKind = (
  ctx: CanvasRenderingContext2D,
  kind: CanvasShapeKind,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { strokeStyle: string; lineWidth: number; fillStyle?: string },
): void => {
  ctx.save();
  ctx.strokeStyle = opts.strokeStyle;
  ctx.lineWidth = opts.lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (opts.fillStyle) {
    ctx.fillStyle = opts.fillStyle;
  }

  if (kind === 'line') {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const B = normalizeShapeBox(x1, y1, x2, y2);

  if (kind === 'rectangle') {
    ctx.beginPath();
    ctx.rect(B.x1, B.y1, B.x2 - B.x1, B.y2 - B.y1);
    if (opts.fillStyle) ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  const cx = (B.x1 + B.x2) / 2;
  const cy = (B.y1 + B.y2) / 2;
  const rx = Math.abs(B.x2 - B.x1) / 2;
  const ry = Math.abs(B.y2 - B.y1) / 2;

  if (kind === 'circle') {
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(rx, 1e-6), Math.max(ry, 1e-6), 0, 0, Math.PI * 2);
    if (opts.fillStyle) ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (kind === 'triangle') {
    trianglePathInBox(ctx, B.x1, B.y1, B.x2, B.y2);
    if (opts.fillStyle) ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  starPathInBox(ctx, B.x1, B.y1, B.x2, B.y2);
  if (opts.fillStyle) ctx.fill();
  ctx.stroke();
  ctx.restore();
};
