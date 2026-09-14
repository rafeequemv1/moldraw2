/**
 * UI overlays for the "select" tool:
 *  - the rotate handle above selected atoms
 *  - the move handle below selected atoms
 *  - the dashed marquee rectangle while box-selecting
 *  - the dashed lasso path while lasso-selecting
 *  - ChemDraw-style angle protractor while rotating
 */
import {
  MOVE_HANDLE_R,
  ROTATE_HANDLE_R,
  SCALE_HANDLE_R,
  atomIdsForSelectionTransform,
  getSelectionCentroid,
  getMarqueeSelectionTransformLayout,
  hasMarqueeSelectionContent,
  type MarqueeSelectionBoundsInput,
  shortestAngleDiff,
} from '../geometry';
import type { RenderContext } from './types';
import { drawTransformHandleDisc, transformChrome } from './transformChrome';

/** Navy chrome — matches image / shape / 3D selection handles (fallback icons). */
const NAVY_SOFT = 'rgba(30, 58, 138, 0.85)';

/** Screen-stable stroke width (avoids hairline pixelation when zooming). */
const screenLw = (invZ: number, px: number) => Math.max(1.25 * invZ, px * invZ);

/** Dual curved arrows (clockwise) — toolbar-style rotate glyph. */
const drawRotateIcon = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  color: string,
): void => {
  const r = 5.2 * scale;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.55 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const drawHalf = (start: number, sweep: number) => {
    const end = start - sweep;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end, true);
    ctx.stroke();
    const ex = cx + Math.cos(end) * r;
    const ey = cy + Math.sin(end) * r;
    const tx = Math.sin(end);
    const ty = -Math.cos(end);
    const ah = 2.8 * scale;
    const aw = 2.1 * scale;
    ctx.beginPath();
    ctx.moveTo(ex + tx * ah, ey + ty * ah);
    ctx.lineTo(ex - ty * aw, ey - tx * aw);
    ctx.lineTo(ex + ty * aw, ey + tx * aw);
    ctx.closePath();
    ctx.fill();
  };

  drawHalf(-Math.PI * 0.15, Math.PI * 0.95);
  drawHalf(Math.PI * 0.85, Math.PI * 0.95);
  ctx.restore();
};

/** Four-way move (pan) icon centered at (cx, cy). */
const drawMoveIcon = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  color: string,
): void => {
  const arm = 5.6 * scale;
  const tip = 2.7 * scale;
  const half = 1.55 * scale;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.8 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(cx, cy - arm);
  ctx.lineTo(cx, cy + arm);
  ctx.moveTo(cx - arm, cy);
  ctx.lineTo(cx + arm, cy);
  ctx.stroke();

  const heads: Array<[number, number, number, number, number, number]> = [
    [cx, cy - arm, cx - half, cy - arm + tip, cx + half, cy - arm + tip],
    [cx + arm, cy, cx + arm - tip, cy - half, cx + arm - tip, cy + half],
    [cx, cy + arm, cx - half, cy + arm - tip, cx + half, cy + arm - tip],
    [cx - arm, cy, cx - arm + tip, cy - half, cx - arm + tip, cy + half],
  ];
  for (const [ax, ay, bx, by, cx2, cy2] of heads) {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx2, cy2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};

/** Hairline rounded AABB around any selected objects. */
const drawIdleSelectionRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  invZ: number,
  chrome: ReturnType<typeof transformChrome>,
): void => {
  if (!(w > 0) || !(h > 0)) return;
  const radius = Math.min(5 * invZ, w * 0.5, h * 0.5);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, radius);
  else ctx.rect(x, y, w, h);
  ctx.strokeStyle = chrome.boxStroke;
  ctx.lineWidth = screenLw(invZ, 1.05);
  ctx.setLineDash([]);
  ctx.stroke();
};

/** White disc + navy ring (theme-aware). */
const drawHandleDisc = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  invZ: number,
  R: RenderContext,
): void => {
  const chrome = transformChrome(R);
  drawTransformHandleDisc(ctx, x, y, r, screenLw(invZ, 1.7), chrome);
};

/** Pivot crosshair at selection centroid. */
const drawPivotCrosshair = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  invZ: number,
  color = NAVY_SOFT,
): void => {
  const arm = 7 * invZ;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = screenLw(invZ, 1.35);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy);
  ctx.lineTo(cx + arm, cy);
  ctx.moveTo(cx, cy - arm);
  ctx.lineTo(cx, cy + arm);
  ctx.stroke();
  ctx.restore();
};

/** ChemDraw-style dashed protractor + live degrees at the grab handle only. */
const drawRotationAngleCircle = (
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
  invZ: number,
): void => {
  const da = R.dragAction;
  if (!da || da.type !== 'rotate_selection') return;

  const { cx, cy, startPointerAngle, currentPointerAngle } = da;
  const chrome = transformChrome(R);
  const delta = shortestAngleDiff(startPointerAngle, currentPointerAngle);
  const deg = Math.round((delta * 180) / Math.PI);

  const L = getMarqueeSelectionTransformLayout(
    R.renderedMolecule,
    {
      atomIds: atomIdsForSelectionTransform(R.renderedMolecule, R.selectedAtomIds, R.selectedBondIds),
      reactionArrowIds: R.selectedReactionArrowIds,
      strokeIds: R.selectedStrokeIds,
      canvasTextIds: R.selectedCanvasTextIds,
      canvasShapeIds: R.selectedCanvasShapeIds,
      canvasImageIds: R.selectedCanvasImageIds,
    },
    null,
  );
  const boxDiag = L ? Math.hypot(L.boxW, L.boxH) / 2 : 60;
  const handleDist = L ? Math.hypot(L.handleX - cx, L.handleY - cy) : boxDiag;
  const radius = Math.max(boxDiag * 0.95, handleDist, 48 * invZ);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Dashed protractor ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = chrome.guide;
  ctx.lineWidth = screenLw(invZ, 1.35);
  ctx.setLineDash([5 * invZ, 4 * invZ]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Degree tick labels (relative to grab = 0°)
  const labelAngles = [0, 30, 45, 60, 90, 120, 135, 150, 180, -30, -45, -60, -90, -120, -135];
  const fontPx = Math.max(9, 11 * invZ);
  ctx.font = `${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = chrome.guide;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const d of labelAngles) {
    const a = startPointerAngle + (d * Math.PI) / 180;
    const lx = cx + Math.cos(a) * (radius + 14 * invZ);
    const ly = cy + Math.sin(a) * (radius + 14 * invZ);
    const nearHandle = Math.abs(shortestAngleDiff(a, currentPointerAngle)) < 0.18;
    if (nearHandle) continue;
    ctx.fillText(`${d}°`, lx, ly);
  }

  // Solid arc from start → current
  if (Math.abs(delta) > 0.01) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startPointerAngle, currentPointerAngle, delta < 0);
    ctx.strokeStyle = chrome.accent;
    ctx.lineWidth = screenLw(invZ, 2.4);
    ctx.stroke();
  }

  // Radial dashed guide to current handle
  const hx = cx + Math.cos(currentPointerAngle) * radius;
  const hy = cy + Math.sin(currentPointerAngle) * radius;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(hx, hy);
  ctx.strokeStyle = chrome.accent;
  ctx.lineWidth = screenLw(invZ, 1.4);
  ctx.setLineDash([4.5 * invZ, 3.5 * invZ]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Grab handle — white disc + navy ring + rotate glyph (same as idle)
  const hr = Math.max(ROTATE_HANDLE_R * 0.92 * invZ, 7 * invZ);
  drawHandleDisc(ctx, hx, hy, hr, invZ, R);
  drawRotateIcon(ctx, hx, hy, invZ, chrome.badgeText);

  // Live degree badge only at the grab handle (not duplicated at top)
  const badge = `${deg}°`;
  ctx.font = `600 ${Math.max(10, 12 * invZ)}px ui-sans-serif, system-ui, sans-serif`;
  const tw = ctx.measureText(badge).width;
  const padX = 5 * invZ;
  const padY = 3.5 * invZ;
  const bx = hx + hr + 8 * invZ;
  const by = hy;
  const bw = tw + padX * 2;
  const bh = fontPx + padY * 2;
  ctx.fillStyle = chrome.badgeFill;
  ctx.strokeStyle = chrome.accent;
  ctx.lineWidth = screenLw(invZ, 1);
  ctx.fillRect(bx - padX, by - bh / 2, bw, bh);
  ctx.strokeRect(bx - padX, by - bh / 2, bw, bh);
  ctx.fillStyle = chrome.badgeText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(badge, bx, by);

  drawPivotCrosshair(ctx, cx, cy, invZ, chrome.accent);

  ctx.restore();
};

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
  const marqueeBounds: MarqueeSelectionBoundsInput = {
    atomIds: transformIds,
    reactionArrowIds: R.selectedReactionArrowIds,
    strokeIds: R.selectedStrokeIds,
    canvasTextIds: R.selectedCanvasTextIds,
    canvasShapeIds: R.selectedCanvasShapeIds,
    canvasImageIds: R.selectedCanvasImageIds,
  };
  if (!hasMarqueeSelectionContent(marqueeBounds)) return;
  if (R.dragAction?.type === 'box_select' || R.dragAction?.type === 'lasso_select') return;

  const L = getMarqueeSelectionTransformLayout(R.renderedMolecule, marqueeBounds, null);
  if (!L) return;

  const canRotate = transformIds.length > 0 && R.hasRotateCommit;

  const {
    boxMinX,
    boxMinY,
    boxW,
    boxH,
    handleX,
    handleY,
    moveHandleX,
    moveHandleY,
    scaleHandleX,
    scaleHandleY,
  } = L;
  const invZ = 1 / Math.max(1e-6, R.viewport.zoom);
  const rotating = R.dragAction?.type === 'rotate_selection';
  const scaling = R.dragAction?.type === 'scale_selection';
  const chrome = transformChrome(R);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  drawIdleSelectionRect(ctx, boxMinX, boxMinY, boxW, boxH, invZ, chrome);

  if (rotating) {
    drawRotationAngleCircle(ctx, R, invZ);
    ctx.restore();
    return;
  }
  if (scaling) {
    ctx.restore();
    return;
  }

  const canScale = transformIds.length > 0 && R.hasScaleCommit;

  if (canRotate) {
    // Idle rotate: stem + white/navy disc + rotate icon
    ctx.beginPath();
    ctx.moveTo(handleX, boxMinY);
    ctx.lineTo(handleX, handleY + ROTATE_HANDLE_R * 0.35);
    ctx.strokeStyle = chrome.accent;
    ctx.lineWidth = screenLw(invZ, 1.5);
    ctx.setLineDash([4 * invZ, 3.25 * invZ]);
    ctx.stroke();
    ctx.setLineDash([]);

    drawHandleDisc(ctx, handleX, handleY, ROTATE_HANDLE_R * 0.92, invZ, R);
    drawRotateIcon(ctx, handleX, handleY, invZ, chrome.badgeText);

    const cen = getSelectionCentroid(R.renderedMolecule, transformIds);
    if (cen) drawPivotCrosshair(ctx, cen.cx, cen.cy, invZ, chrome.accent);
  }

  // Idle move: stem + circular badge below the box, icon inside the circle
  const moveDiscR = MOVE_HANDLE_R * 0.95;
  const moveIconScale = Math.min(1, invZ);
  ctx.beginPath();
  ctx.moveTo(moveHandleX, boxMinY + boxH);
  ctx.lineTo(moveHandleX, moveHandleY - moveDiscR * 0.55);
  ctx.strokeStyle = chrome.accent;
  ctx.lineWidth = screenLw(invZ, 1.5);
  ctx.setLineDash([4 * invZ, 3.25 * invZ]);
  ctx.stroke();
  ctx.setLineDash([]);

  drawHandleDisc(ctx, moveHandleX, moveHandleY, moveDiscR, invZ, R);
  drawMoveIcon(ctx, moveHandleX, moveHandleY, moveIconScale, chrome.badgeText);

  if (canScale) {
    drawHandleDisc(ctx, scaleHandleX, scaleHandleY, SCALE_HANDLE_R * 0.85, invZ, R);
    drawScaleIcon(ctx, scaleHandleX, scaleHandleY, invZ, chrome.badgeText);
  }

  ctx.restore();
};

const drawScaleIcon = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  color: string,
): void => {
  const arm = 4.4 * scale;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy + arm);
  ctx.lineTo(cx + arm, cy - arm);
  ctx.moveTo(cx + arm - 2.2 * scale, cy - arm);
  ctx.lineTo(cx + arm, cy - arm);
  ctx.lineTo(cx + arm, cy - arm + 2.2 * scale);
  ctx.moveTo(cx - arm + 2.2 * scale, cy + arm);
  ctx.lineTo(cx - arm, cy + arm);
  ctx.lineTo(cx - arm, cy + arm - 2.2 * scale);
  ctx.stroke();
  ctx.restore();
};

export const drawMarquee = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const da = R.dragAction;
  if (!da) return;
  const invZ = 1 / Math.max(1e-6, R.viewport.zoom);
  const chrome = transformChrome(R);

  if (da.type === 'box_select') {
    ctx.strokeStyle = chrome.marqueeStroke;
    ctx.lineWidth = screenLw(invZ, 1.6);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([5.5 * invZ, 3.75 * invZ]);
    const rectX = da.startX;
    const rectY = da.startY;
    const rectW = da.currentX - da.startX;
    const rectH = da.currentY - da.startY;
    ctx.strokeRect(rectX, rectY, rectW, rectH);
    ctx.fillStyle = chrome.marqueeFill;
    ctx.fillRect(rectX, rectY, rectW, rectH);
    ctx.setLineDash([]);
    return;
  }

  if (da.type === 'lasso_select' && da.points.length > 0) {
    ctx.strokeStyle = chrome.marqueeStroke;
    ctx.lineWidth = screenLw(invZ, 1.6);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([5 * invZ, 3.5 * invZ]);
    ctx.beginPath();
    ctx.moveTo(da.points[0].x, da.points[0].y);
    for (let i = 1; i < da.points.length; i++) ctx.lineTo(da.points[i].x, da.points[i].y);
    ctx.lineTo(da.currentX, da.currentY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
};
