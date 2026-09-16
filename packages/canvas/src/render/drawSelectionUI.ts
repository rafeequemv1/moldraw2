/**
 * UI overlays for the "select" tool:
 *  - rotate handle above the selection
 *  - slim grey dotted AABB (no scale handles on molecules)
 *  - marquee + lasso while selecting
 *  - protractor while rotating
 */
import {
  ROTATE_HANDLE_R,
  atomIdsForSelectionTransform,
  getMarqueeSelectionTransformLayout,
  hasMarqueeSelectionContent,
  type MarqueeSelectionBoundsInput,
  shortestAngleDiff,
} from '../geometry';
import type { RenderContext } from './types';
import { drawTransformHandleDisc, transformChrome } from './transformChrome';

/** 1 CSS-pixel stroke in world space. */
const screenLw = (invZ: number, px = 1) => px * invZ;

/** Dual curved arrows — rotate glyph. */
const drawRotateIcon = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  color: string,
): void => {
  const r = 4.4 * scale;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.35 * scale;
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
    const ah = 2.4 * scale;
    const aw = 1.7 * scale;
    ctx.beginPath();
    ctx.moveTo(ex + tx * ah, ey + ty * ah);
    ctx.lineTo(ex - ty * aw, ey - tx * aw);
    ctx.lineTo(ex + ty * aw, ey + tx * aw);
    ctx.closePath();
    ctx.fill();
  };

  drawHalf(-Math.PI * 0.12, Math.PI * 0.92);
  drawHalf(Math.PI * 0.88, Math.PI * 0.92);
  ctx.restore();
};

/** Dotted AABB — molecule halo already marks the selection. */
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
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.strokeStyle = chrome.boxStroke;
  ctx.lineWidth = screenLw(invZ, 1);
  ctx.setLineDash([2.8 * invZ, 2.5 * invZ]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
};

const drawHandleDisc = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  invZ: number,
  R: RenderContext,
): void => {
  const chrome = transformChrome(R);
  drawTransformHandleDisc(ctx, x, y, r, screenLw(invZ, 1.35), chrome);
};

const drawTealHandleDot = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  invZ: number,
  chrome: ReturnType<typeof transformChrome>,
): void => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = chrome.accent;
  ctx.fill();
  ctx.strokeStyle = chrome.handleStroke;
  ctx.lineWidth = screenLw(invZ, 1.15);
  ctx.stroke();
};

const drawPivotCrosshair = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  invZ: number,
  color: string,
): void => {
  const arm = 6 * invZ;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = screenLw(invZ, 1.2);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy);
  ctx.lineTo(cx + arm, cy);
  ctx.moveTo(cx, cy - arm);
  ctx.lineTo(cx, cy + arm);
  ctx.stroke();
  ctx.restore();
};

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

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = chrome.guide;
  ctx.lineWidth = screenLw(invZ, 1.25);
  ctx.setLineDash([5 * invZ, 4 * invZ]);
  ctx.stroke();
  ctx.setLineDash([]);

  if (Math.abs(delta) > 0.01) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startPointerAngle, currentPointerAngle, delta < 0);
    ctx.strokeStyle = chrome.accent;
    ctx.lineWidth = screenLw(invZ, 2.2);
    ctx.stroke();
  }

  const hx = cx + Math.cos(currentPointerAngle) * radius;
  const hy = cy + Math.sin(currentPointerAngle) * radius;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(hx, hy);
  ctx.strokeStyle = chrome.handleStroke;
  ctx.lineWidth = screenLw(invZ, 1.15);
  ctx.setLineDash([4.5 * invZ, 3.5 * invZ]);
  ctx.stroke();
  ctx.setLineDash([]);

  const hr = Math.max(ROTATE_HANDLE_R * 0.82 * invZ, 6.5 * invZ);
  drawHandleDisc(ctx, hx, hy, hr, invZ, R);
  drawRotateIcon(ctx, hx, hy, invZ, chrome.handleStroke);

  const badge = `${deg}°`;
  const fontPx = Math.max(10, 12 * invZ);
  ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  const tw = ctx.measureText(badge).width;
  const padX = 5 * invZ;
  const padY = 3.5 * invZ;
  const bx = hx + hr + 8 * invZ;
  const by = hy;
  const bw = tw + padX * 2;
  const bh = fontPx + padY * 2;
  ctx.fillStyle = chrome.badgeFill;
  ctx.strokeStyle = chrome.handleStroke;
  ctx.lineWidth = screenLw(invZ, 1);
  ctx.fillRect(bx - padX, by - bh / 2, bw, bh);
  ctx.strokeRect(bx - padX, by - bh / 2, bw, bh);
  ctx.fillStyle = chrome.badgeText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(badge, bx, by);

  drawPivotCrosshair(ctx, cx, cy, invZ, chrome.handleStroke);
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
  const exclusiveText =
    transformIds.length === 0 &&
    (R.selectedCanvasTextIds?.length ?? 0) > 0 &&
    (R.selectedReactionArrowIds?.length ?? 0) === 0 &&
    (R.selectedStrokeIds?.length ?? 0) === 0 &&
    (R.selectedCanvasShapeIds?.length ?? 0) === 0 &&
    (R.selectedCanvasImageIds?.length ?? 0) === 0;
  if (exclusiveText) return;

  const L = getMarqueeSelectionTransformLayout(R.renderedMolecule, marqueeBounds, null);
  if (!L) return;

  const canRotate = transformIds.length > 0 && R.hasRotateCommit;

  const { boxMinX, boxMinY, boxW, boxH, handleX, handleY } = L;
  const invZ = 1 / Math.max(1e-6, R.viewport.zoom);
  const rotating = R.dragAction?.type === 'rotate_selection';
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

  if (canRotate) {
    const stemR = 2.4 * invZ;
    const rotateR = Math.max(ROTATE_HANDLE_R * 0.72 * invZ, 6.2 * invZ);
    drawTealHandleDot(ctx, handleX, boxMinY, stemR, invZ, chrome);

    ctx.beginPath();
    ctx.moveTo(handleX, boxMinY);
    ctx.lineTo(handleX, handleY + rotateR);
    ctx.strokeStyle = chrome.handleStroke;
    ctx.lineWidth = screenLw(invZ, 1.05);
    ctx.setLineDash([3.2 * invZ, 2.6 * invZ]);
    ctx.stroke();
    ctx.setLineDash([]);

    drawHandleDisc(ctx, handleX, handleY, rotateR, invZ, R);
    drawRotateIcon(ctx, handleX, handleY, invZ, chrome.handleStroke);
  }

  ctx.restore();
};

export const drawMarquee = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const da = R.dragAction;
  if (!da) return;
  const invZ = 1 / Math.max(1e-6, R.viewport.zoom);
  const chrome = transformChrome(R);

  if (da.type === 'box_select') {
    ctx.save();
    ctx.strokeStyle = chrome.marqueeStroke;
    ctx.fillStyle = chrome.marqueeFill;
    ctx.lineWidth = screenLw(invZ, 1);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.setLineDash([2.8 * invZ, 2.5 * invZ]);
    const rectX = da.startX;
    const rectY = da.startY;
    const rectW = da.currentX - da.startX;
    const rectH = da.currentY - da.startY;
    ctx.fillRect(rectX, rectY, rectW, rectH);
    ctx.strokeRect(rectX, rectY, rectW, rectH);
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  if (da.type === 'lasso_select' && da.points.length > 0) {
    ctx.strokeStyle = chrome.marqueeStroke;
    ctx.lineWidth = screenLw(invZ, 1);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.setLineDash([2.8 * invZ, 2.5 * invZ]);
    ctx.beginPath();
    ctx.moveTo(da.points[0].x, da.points[0].y);
    for (let i = 1; i < da.points.length; i++) ctx.lineTo(da.points[i].x, da.points[i].y);
    ctx.lineTo(da.currentX, da.currentY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
};
