import type { Viewport } from '../geometry';
import {
  TOUCH_LOUPE_MAGNIFICATION,
  TOUCH_LOUPE_OFFSET_PX,
  TOUCH_LOUPE_RADIUS_PX,
} from '../touch/constants';
import type { RenderContext } from './types';

/**
 * Whether the loupe should be visible for this frame: a finger is down and it
 * is doing precision work (dragging a bond / ring / chain, or resting on an
 * atom / bond). Idle taps on empty canvas and marquee drags do not show it.
 */
export const shouldShowTouchLoupe = (R: RenderContext): boolean => {
  if (!R.touchPointerWorldPos) return false;
  if (R.drawingBond || R.drawingRing || R.drawingChain) return true;
  return !!(R.hoveredAtomCircleId || R.hoveredBondHighlightId || R.hoverAtomId || R.hoverBondId);
};

/**
 * Touch loupe: a magnified copy of the region under the fingertip, drawn above
 * the finger so the user can see the atom / bond the finger is covering.
 *
 * Works in device pixels on the overlay canvas *after* the world-space overlay
 * pass: it samples the structure bitmap and the overlay bitmap (ghost bond,
 * hover glow) around the finger and blits them at `TOUCH_LOUPE_MAGNIFICATION`
 * inside a circular clip. Must be called with the identity transform.
 */
export const drawTouchLoupe = (
  octx: CanvasRenderingContext2D,
  overlayCanvas: HTMLCanvasElement,
  structureCanvas: HTMLCanvasElement,
  viewport: Viewport,
  displayScale: number,
  R: RenderContext,
): void => {
  const p = R.touchPointerWorldPos;
  if (!p || !shouldShowTouchLoupe(R)) return;

  const W = overlayCanvas.width;
  const H = overlayCanvas.height;
  const z = viewport.zoom * displayScale;
  // Mirror applyWorldTransform: world → device px.
  const sx = W / 2 + viewport.x + p.x * z;
  const sy = H / 2 + viewport.y + p.y * z;

  const r = TOUCH_LOUPE_RADIUS_PX * displayScale;
  const mag = TOUCH_LOUPE_MAGNIFICATION;
  const offset = TOUCH_LOUPE_OFFSET_PX * displayScale;
  const margin = 6 * displayScale;

  // Prefer above the finger; fall back below when clipped by the top edge.
  let cx = Math.min(Math.max(sx, r + margin), W - r - margin);
  let cy = sy - offset;
  if (cy - r < margin) cy = sy + offset;
  if (cy + r > H - margin) cy = Math.max(r + margin, H - r - margin);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;

  const srcHalf = r / mag;
  const srcX = sx - srcHalf;
  const srcY = sy - srcHalf;
  const srcSize = srcHalf * 2;
  const dstX = cx - r;
  const dstY = cy - r;
  const dstSize = r * 2;

  octx.save();
  octx.setTransform(1, 0, 0, 1, 0, 0);

  // Drop shadow ring.
  octx.beginPath();
  octx.arc(cx, cy, r + 1.5 * displayScale, 0, Math.PI * 2);
  octx.fillStyle = 'rgba(15, 23, 42, 0.18)';
  octx.fill();

  octx.beginPath();
  octx.arc(cx, cy, r, 0, Math.PI * 2);
  octx.clip();
  octx.fillStyle = '#ffffff';
  octx.fillRect(dstX, dstY, dstSize, dstSize);

  // Structure (bonds, atoms, grid) then live overlay (ghost bond, hover glow).
  // Drawing the overlay onto itself is allowed: the source is snapshotted first.
  try {
    octx.drawImage(structureCanvas, srcX, srcY, srcSize, srcSize, dstX, dstY, dstSize, dstSize);
    octx.drawImage(overlayCanvas, srcX, srcY, srcSize, srcSize, dstX, dstY, dstSize, dstSize);
  } catch {
    // Zero-sized or detached canvases — skip the loupe for this frame.
  }

  // Crosshair at the sampled fingertip.
  const cross = 7 * displayScale;
  octx.strokeStyle = 'rgba(37, 99, 235, 0.9)';
  octx.lineWidth = 1 * displayScale;
  octx.beginPath();
  octx.moveTo(cx - cross, cy);
  octx.lineTo(cx + cross, cy);
  octx.moveTo(cx, cy - cross);
  octx.lineTo(cx, cy + cross);
  octx.stroke();
  octx.restore();

  // Rim + stem pointing at the finger.
  octx.save();
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
  octx.lineWidth = 1.5 * displayScale;
  octx.beginPath();
  octx.arc(cx, cy, r, 0, Math.PI * 2);
  octx.stroke();

  cx = cx || 0;
  cy = cy || 0;
  const stemFrom = cy < sy ? cy + r : cy - r;
  const stemTo = cy < sy ? sy - 26 * displayScale : sy + 26 * displayScale;
  if ((cy < sy && stemTo > stemFrom) || (cy > sy && stemTo < stemFrom)) {
    octx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
    octx.beginPath();
    octx.moveTo(cx, stemFrom);
    octx.lineTo(sx, stemTo);
    octx.stroke();
  }
  octx.restore();
};
