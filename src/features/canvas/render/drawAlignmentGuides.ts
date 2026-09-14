/**
 * Subtle full-span alignment guides (world space), clipped to the visible area.
 */
import type { AlignmentGuides } from '../geometry/alignmentGuides';
import type { Viewport } from '../geometry';

const GUIDE_COLOR = 'rgba(37, 99, 235, 0.38)';

const visibleWorldBounds = (
  width: number,
  height: number,
  viewport: Viewport,
  effectiveZoom: number,
): { left: number; right: number; top: number; bottom: number } => {
  const left = (-width / 2 - viewport.x) / effectiveZoom;
  const right = (width / 2 - viewport.x) / effectiveZoom;
  const top = (-height / 2 - viewport.y) / effectiveZoom;
  const bottom = (height / 2 - viewport.y) / effectiveZoom;
  return { left, right, top, bottom };
};

export const drawAlignmentGuides = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: Viewport,
  effectiveZoom: number,
  guides: AlignmentGuides,
): void => {
  if (guides.verticalX.length === 0 && guides.horizontalY.length === 0) return;

  const { left, right, top, bottom } = visibleWorldBounds(width, height, viewport, effectiveZoom);

  ctx.save();
  ctx.strokeStyle = GUIDE_COLOR;
  ctx.lineWidth = 1 / effectiveZoom;
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';

  ctx.beginPath();
  for (const x of guides.verticalX) {
    if (x < left - 1 || x > right + 1) continue;
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  for (const y of guides.horizontalY) {
    if (y < top - 1 || y > bottom + 1) continue;
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();
  ctx.restore();
};
