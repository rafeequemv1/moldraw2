/**
 * Background grid: light minor lines, slightly darker every 5 cells, and a
 * solid pair through the world origin. Spacing adapts with zoom so the whole
 * canvas stays filled at every scale (no grey wash when zoomed out, no empty
 * regions when zoomed in).
 */
import type { Viewport } from '../geometry';
import { DEFAULT_GRID_SIZE } from '../geometry/alignmentGuides';
import type { StructureThemeColors } from './types';
import { DEFAULT_STRUCTURE_THEME } from './types';

const MAJOR_STEP = 5;
/** Keep on-screen cell size in this band (device pixels). */
const MIN_SCREEN_STEP = 24;
const MAX_SCREEN_STEP = 96;
const MAX_LINES_PER_AXIS = 256;

/**
 * World-space minor-cell size whose projected screen pitch stays readable.
 * Snapping still uses the settings `gridSizePx`; this is display-only.
 */
export const gridWorldStepForZoom = (baseSize: number, zoom: number): number => {
  const z = Math.max(1e-6, zoom);
  let step = Number.isFinite(baseSize) && baseSize > 0 ? baseSize : DEFAULT_GRID_SIZE;
  let screen = step * z;
  while (screen < MIN_SCREEN_STEP) {
    step *= 2;
    screen *= 2;
    if (step > 1e8) break;
  }
  while (screen > MAX_SCREEN_STEP && step > 1) {
    const next = step / 2;
    if (next < 1) break;
    step = next;
    screen = step * z;
  }
  return step;
};

const worldBounds = (
  width: number,
  height: number,
  viewport: Viewport,
): { left: number; right: number; top: number; bottom: number } => {
  const z = Math.max(1e-6, viewport.zoom);
  return {
    left: (-width / 2 - viewport.x) / z,
    right: (width / 2 - viewport.x) / z,
    top: (-height / 2 - viewport.y) / z,
    bottom: (height / 2 - viewport.y) / z,
  };
};

export const drawGrid = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: Viewport,
  theme: StructureThemeColors = DEFAULT_STRUCTURE_THEME,
  gridSizePx: number = DEFAULT_GRID_SIZE,
): void => {
  if (!(width >= 1 && height >= 1)) return;
  const { left, right, top, bottom } = worldBounds(width, height, viewport);
  let step = gridWorldStepForZoom(gridSizePx, viewport.zoom);

  let iMin = Math.floor(left / step) - 1;
  let iMax = Math.ceil(right / step) + 1;
  let jMin = Math.floor(top / step) - 1;
  let jMax = Math.ceil(bottom / step) + 1;

  while (iMax - iMin > MAX_LINES_PER_AXIS || jMax - jMin > MAX_LINES_PER_AXIS) {
    step *= 2;
    iMin = Math.floor(left / step) - 1;
    iMax = Math.ceil(right / step) + 1;
    jMin = Math.floor(top / step) - 1;
    jMax = Math.ceil(bottom / step) + 1;
  }

  const z = Math.max(1e-6, viewport.zoom);

  // 1 device pixel after the world-scale transform, at every zoom.
  ctx.lineWidth = 1 / z;
  ctx.lineCap = 'butt';
  ctx.setLineDash([]);

  ctx.strokeStyle = theme.gridMinor;
  ctx.beginPath();
  for (let i = iMin; i <= iMax; i++) {
    if (i % MAJOR_STEP === 0) continue;
    const x = i * step;
    ctx.moveTo(x, jMin * step);
    ctx.lineTo(x, jMax * step);
  }
  for (let j = jMin; j <= jMax; j++) {
    if (j % MAJOR_STEP === 0) continue;
    const y = j * step;
    ctx.moveTo(iMin * step, y);
    ctx.lineTo(iMax * step, y);
  }
  ctx.stroke();

  ctx.strokeStyle = theme.gridMajor;
  ctx.beginPath();
  for (let i = iMin; i <= iMax; i++) {
    if (i % MAJOR_STEP !== 0 || i === 0) continue;
    const x = i * step;
    ctx.moveTo(x, jMin * step);
    ctx.lineTo(x, jMax * step);
  }
  for (let j = jMin; j <= jMax; j++) {
    if (j % MAJOR_STEP !== 0 || j === 0) continue;
    const y = j * step;
    ctx.moveTo(iMin * step, y);
    ctx.lineTo(iMax * step, y);
  }
  ctx.stroke();

  ctx.strokeStyle = theme.gridAxis;
  ctx.lineWidth = 1.5 / z;
  ctx.beginPath();
  if (0 >= jMin * step && 0 <= jMax * step) {
    ctx.moveTo(iMin * step, 0);
    ctx.lineTo(iMax * step, 0);
  }
  if (0 >= iMin * step && 0 <= iMax * step) {
    ctx.moveTo(0, jMin * step);
    ctx.lineTo(0, jMax * step);
  }
  ctx.stroke();
};
