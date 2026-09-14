/**
 * Committed annotation shapes + live drag preview for the shape tool.
 */
import { siblingShapeIdsInCollection } from '@moldraw/core';
import {
  CONICAL_FLASK_DEFAULT_FILL,
  CONICAL_FLASK_DEFAULT_LEVEL,
  isLabGlasswareShape,
  isLiquidGlasswareShape,
  type CanvasShape,
} from '@moldraw/domain';
import { strokeShapeKind } from '../geometry';
import {
  canvasShapeWithDragPreview,
  getCanvasShapeBox,
  getCanvasShapeResizeHandleWorld,
  getCanvasShapeRotateHandleWorld,
  getShapesWorldAabb,
} from '../geometry/canvasShapeTransform';
import type { RenderContext } from './types';

const drawSelectionChrome = (
  ctx: CanvasRenderingContext2D,
  shape: CanvasShape,
  zoom: number,
): void => {
  const box = getCanvasShapeBox(shape);
  const lw = 1 / zoom;
  const hs = Math.max(5, 6 / zoom);

  ctx.save();
  ctx.translate(box.cx, box.cy);
  ctx.rotate(box.rotationRad);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = lw;
  ctx.setLineDash([4 / zoom, 3 / zoom]);
  ctx.strokeRect(-box.width / 2, -box.height / 2, box.width, box.height);
  ctx.setLineDash([]);
  ctx.restore();

  const rh = getCanvasShapeRotateHandleWorld(shape);
  const topMid = (() => {
    const c = Math.cos(box.rotationRad);
    const s = Math.sin(box.rotationRad);
    return {
      x: box.cx - (box.height / 2) * s,
      y: box.cy - (box.height / 2) * c,
    };
  })();
  ctx.save();
  ctx.strokeStyle = '#1e3a8a';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(topMid.x, topMid.y);
  ctx.lineTo(rh.x, rh.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rh.x, rh.y, hs, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const rw = getCanvasShapeResizeHandleWorld(shape);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = lw;
  ctx.fillRect(rw.x - hs, rw.y - hs, hs * 2, hs * 2);
  ctx.strokeRect(rw.x - hs, rw.y - hs, hs * 2, hs * 2);
  ctx.restore();
};

/** One AABB + corner marks for a multi-shape group (COF) — no per-shape handles. */
const drawGroupSelectionChrome = (
  ctx: CanvasRenderingContext2D,
  shapes: CanvasShape[],
  zoom: number,
): void => {
  const aabb = getShapesWorldAabb(shapes);
  if (!aabb) return;
  const lw = 1 / zoom;
  const hs = Math.max(5, 6 / zoom);
  const pad = 6 / zoom;

  ctx.save();
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = lw * 1.25;
  ctx.setLineDash([5 / zoom, 4 / zoom]);
  ctx.strokeRect(
    aabb.x1 - pad,
    aabb.y1 - pad,
    aabb.width + pad * 2,
    aabb.height + pad * 2,
  );
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = lw;
  const corners = [
    [aabb.x1 - pad, aabb.y1 - pad],
    [aabb.x2 + pad, aabb.y1 - pad],
    [aabb.x2 + pad, aabb.y2 + pad],
    [aabb.x1 - pad, aabb.y2 + pad],
  ] as const;
  for (const [x, y] of corners) {
    ctx.fillRect(x - hs, y - hs, hs * 2, hs * 2);
    ctx.strokeRect(x - hs, y - hs, hs * 2, hs * 2);
  }
  ctx.restore();
};

const drawOneShape = (
  ctx: CanvasRenderingContext2D,
  shape: CanvasShape,
  glassStroke: string,
): void => {
  const box = getCanvasShapeBox(shape);
  const rot = shape.rotationRad ?? 0;

  ctx.save();
  if (shape.kind === 'line') {
    if (Math.abs(rot) > 1e-6) {
      ctx.translate(box.cx, box.cy);
      ctx.rotate(rot);
      const a = { x: shape.x1 - box.cx, y: shape.y1 - box.cy };
      const b = { x: shape.x2 - box.cx, y: shape.y2 - box.cy };
      // Endpoints already in world; convert to local unrotated then draw after rotate
      const c = Math.cos(-rot);
      const s = Math.sin(-rot);
      const ax = a.x * c - a.y * s;
      const ay = a.x * s + a.y * c;
      const bx = b.x * c - b.y * s;
      const by = b.x * s + b.y * c;
      strokeShapeKind(ctx, 'line', ax, ay, bx, by, {
        strokeStyle: shape.color,
        lineWidth: shape.strokeWidth,
      });
    } else {
      strokeShapeKind(ctx, 'line', shape.x1, shape.y1, shape.x2, shape.y2, {
        strokeStyle: shape.color,
        lineWidth: shape.strokeWidth,
      });
    }
    ctx.restore();
    return;
  }

  ctx.translate(box.cx, box.cy);
  ctx.rotate(rot);
  const lx1 = -box.width / 2;
  const ly1 = -box.height / 2;
  const lx2 = box.width / 2;
  const ly2 = box.height / 2;
  const isGlass = isLabGlasswareShape(shape.kind);
  const isLiquid = isLiquidGlasswareShape(shape.kind);
  strokeShapeKind(ctx, shape.kind, lx1, ly1, lx2, ly2, {
    // Glassware outline follows structure ink (white in dark themes); liquid stays blue.
    strokeStyle: isGlass ? glassStroke : shape.color,
    lineWidth: shape.strokeWidth,
    fillStyle: !isGlass && shape.fillColor ? shape.fillColor : undefined,
    liquidFill: isLiquid
      ? {
          color: shape.fillColor ?? CONICAL_FLASK_DEFAULT_FILL,
          level: shape.fillLevel ?? CONICAL_FLASK_DEFAULT_LEVEL,
        }
      : undefined,
  });
  ctx.restore();
};

export const drawCommittedCanvasShapes = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const shapes = R.renderedMolecule.canvasShapes ?? [];
  const selectedIds = new Set([
    ...(R.selectedCanvasShapeIds ?? []),
    ...(R.selectedCanvasShapeId ? [R.selectedCanvasShapeId] : []),
  ]);
  const glassStroke = R.structureTheme.ink;

  const previewed: CanvasShape[] = [];
  for (const raw of shapes) {
    const drag =
      R.dragAction?.type === 'move_canvas_shape' ||
      R.dragAction?.type === 'resize_canvas_shape' ||
      R.dragAction?.type === 'rotate_canvas_shape'
        ? R.dragAction
        : null;
    const shape = canvasShapeWithDragPreview(raw, drag);
    previewed.push(shape);
    drawOneShape(ctx, shape, glassStroke);
  }

  if (selectedIds.size === 0) return;

  if (selectedIds.size === 1) {
    const selectedId = [...selectedIds][0]!;
    const groupIds = siblingShapeIdsInCollection(R.renderedMolecule, selectedId);
    const selectedGroupIds = groupIds.length > 0 ? new Set(groupIds) : null;
    const isMultiGroup = groupIds.length > 1;
    if (!selectedGroupIds) return;
    if (isMultiGroup) {
      const groupShapes = previewed.filter(s => selectedGroupIds.has(s.id));
      drawGroupSelectionChrome(ctx, groupShapes, R.viewport.zoom);
      return;
    }
    const alone = previewed.find(s => s.id === selectedId);
    if (alone) drawSelectionChrome(ctx, alone, R.viewport.zoom);
    return;
  }

  for (const id of selectedIds) {
    const shape = previewed.find(s => s.id === id);
    if (shape) drawSelectionChrome(ctx, shape, R.viewport.zoom);
  }
};

export const drawCanvasShapeGhost = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const g = R.drawingCanvasShape;
  if (!g) return;
  const ink = R.structureTheme.ink;
  const ghostStroke =
    ink.startsWith('#') && (ink === '#ffffff' || ink === '#ececec')
      ? 'rgba(255, 255, 255, 0.55)'
      : 'rgba(15, 23, 42, 0.45)';
  ctx.save();
  ctx.setLineDash([5, 5]);
  strokeShapeKind(ctx, g.kind, g.x1, g.y1, g.x2, g.y2, {
    strokeStyle: ghostStroke,
    lineWidth: Math.max(1, R.activeThickness - 0.5),
    liquidFill: isLiquidGlasswareShape(g.kind)
      ? { color: CONICAL_FLASK_DEFAULT_FILL, level: CONICAL_FLASK_DEFAULT_LEVEL }
      : undefined,
  });
  ctx.setLineDash([]);
  ctx.restore();
};
