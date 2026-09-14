/**
 * UI overlays for the "select" tool:
 *  - the rotate handle above selected atoms
 *  - the move handle below selected atoms
 *  - the dashed marquee rectangle while box-selecting
 *  - the dashed lasso path while lasso-selecting
 */
import {
  MOVE_HANDLE_R,
  ROTATE_HANDLE_R,
  atomIdsForSelectionTransform,
  getSelectionTransformLayout,
} from '../geometry';
import type { RenderContext } from './types';

export const drawSelectionTransformHandle = (
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
): void => {
  if (R.activeTool !== 'select') return;
  const transformIds = atomIdsForSelectionTransform(
    R.renderedMolecule,
    R.selectedAtomIds,
    R.selectedBondIds,
  );
  if (transformIds.length === 0) return;
  if (!R.hasRotateCommit) return;
  if (R.dragAction?.type === 'box_select' || R.dragAction?.type === 'lasso_select') return;

  const L = getSelectionTransformLayout(R.renderedMolecule, transformIds);
  if (!L) return;

  const { boxMinX, boxMinY, boxW, boxH, handleX, handleY, moveHandleX, moveHandleY } = L;
  const invZ = 1 / R.viewport.zoom;
  ctx.save();
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5 * invZ;
  ctx.setLineDash([5 * invZ, 4 * invZ]);
  ctx.strokeRect(boxMinX, boxMinY, boxW, boxH);
  ctx.setLineDash([]);

  // Rotate handle (top)
  ctx.beginPath();
  ctx.moveTo(handleX, boxMinY);
  ctx.lineTo(handleX, handleY + ROTATE_HANDLE_R * 0.4);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.2 * invZ;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(handleX, handleY, ROTATE_HANDLE_R * 0.92, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(59, 130, 246, 0.18)';
  ctx.fill();
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5 * invZ;
  ctx.stroke();

  const rArc = ROTATE_HANDLE_R * 0.45;
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 1.8 * invZ;
  ctx.beginPath();
  ctx.arc(handleX, handleY, rArc, -0.2, Math.PI * 1.25);
  ctx.stroke();

  // Move handle (bottom) — four-way arrows
  ctx.beginPath();
  ctx.moveTo(moveHandleX, boxMinY + boxH);
  ctx.lineTo(moveHandleX, moveHandleY - MOVE_HANDLE_R * 0.4);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.2 * invZ;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(moveHandleX, moveHandleY, MOVE_HANDLE_R * 0.92, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(59, 130, 246, 0.18)';
  ctx.fill();
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5 * invZ;
  ctx.stroke();

  const arm = MOVE_HANDLE_R * 0.42;
  const tip = MOVE_HANDLE_R * 0.22;
  ctx.strokeStyle = '#1d4ed8';
  ctx.fillStyle = '#1d4ed8';
  ctx.lineWidth = 1.7 * invZ;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Cross arms
  ctx.beginPath();
  ctx.moveTo(moveHandleX, moveHandleY - arm);
  ctx.lineTo(moveHandleX, moveHandleY + arm);
  ctx.moveTo(moveHandleX - arm, moveHandleY);
  ctx.lineTo(moveHandleX + arm, moveHandleY);
  ctx.stroke();

  // Arrowheads (N E S W)
  const heads: Array<[number, number, number, number, number, number]> = [
    [moveHandleX, moveHandleY - arm, moveHandleX - tip * 0.7, moveHandleY - arm + tip, moveHandleX + tip * 0.7, moveHandleY - arm + tip],
    [moveHandleX + arm, moveHandleY, moveHandleX + arm - tip, moveHandleY - tip * 0.7, moveHandleX + arm - tip, moveHandleY + tip * 0.7],
    [moveHandleX, moveHandleY + arm, moveHandleX - tip * 0.7, moveHandleY + arm - tip, moveHandleX + tip * 0.7, moveHandleY + arm - tip],
    [moveHandleX - arm, moveHandleY, moveHandleX - arm + tip, moveHandleY - tip * 0.7, moveHandleX - arm + tip, moveHandleY + tip * 0.7],
  ];
  for (const [ax, ay, bx, by, cx, cy] of heads) {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
};

export const drawMarquee = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const da = R.dragAction;
  if (!da) return;

  if (da.type === 'box_select') {
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1 / R.viewport.zoom;
    ctx.setLineDash([5 / R.viewport.zoom, 5 / R.viewport.zoom]);
    const rectX = da.startX;
    const rectY = da.startY;
    const rectW = da.currentX - da.startX;
    const rectH = da.currentY - da.startY;
    ctx.strokeRect(rectX, rectY, rectW, rectH);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
    ctx.fillRect(rectX, rectY, rectW, rectH);
    ctx.setLineDash([]);
    return;
  }

  if (da.type === 'lasso_select' && da.points.length > 0) {
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1 / R.viewport.zoom;
    ctx.setLineDash([4 / R.viewport.zoom, 4 / R.viewport.zoom]);
    ctx.beginPath();
    ctx.moveTo(da.points[0].x, da.points[0].y);
    for (let i = 1; i < da.points.length; i++) ctx.lineTo(da.points[i].x, da.points[i].y);
    ctx.lineTo(da.currentX, da.currentY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
};
