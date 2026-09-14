import type { RenderContext } from './types';

/** Screen-pixel size of the fingertip halo (independent of zoom). */
const HALO_SCREEN_RADIUS = 22;
const DOT_SCREEN_RADIUS = 2.5;

/**
 * Touch halo: a soft ring + centre dot at the active fingertip. A finger
 * hides ~40 px of the drawing, so without this the user cannot tell whether
 * the bond they are about to drag starts on an atom or in empty space. The
 * hover glow (atom / bond) is drawn separately and lights up inside it.
 *
 * Drawn in world space (caller has the world transform applied); radii are
 * divided by `effectiveZoom` so the halo stays a constant size on screen.
 */
export const drawTouchIndicator = (
  ctx: CanvasRenderingContext2D,
  R: RenderContext,
  effectiveZoom: number,
): void => {
  const p = R.touchPointerWorldPos;
  if (!p) return;
  const z = effectiveZoom > 0 ? effectiveZoom : 1;
  const r = HALO_SCREEN_RADIUS / z;
  const dot = DOT_SCREEN_RADIUS / z;
  const onTarget = !!(R.hoveredAtomCircleId || R.hoveredBondHighlightId || R.hoverAtomId || R.hoverBondId);

  ctx.save();
  ctx.lineWidth = 1.5 / z;
  ctx.strokeStyle = onTarget ? 'rgba(37, 99, 235, 0.85)' : 'rgba(15, 23, 42, 0.45)';
  ctx.fillStyle = onTarget ? 'rgba(37, 99, 235, 0.10)' : 'rgba(15, 23, 42, 0.05)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = onTarget ? 'rgba(37, 99, 235, 0.9)' : 'rgba(15, 23, 42, 0.7)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, dot, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};
