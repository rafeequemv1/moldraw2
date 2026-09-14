/**
 * Background grid: light minor lines, slightly darker every 5 cells, and a
 * solid pair through the world origin. Sized in world units so it follows
 * pan/zoom naturally.
 */
import type { Viewport } from '../geometry';

const GRID_SIZE = 50;
const MAJOR_STEP = 5;

export const drawGrid = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: Viewport,
): void => {
  const left = (-width / 2 - viewport.x) / viewport.zoom;
  const right = (width / 2 - viewport.x) / viewport.zoom;
  const top = (-height / 2 - viewport.y) / viewport.zoom;
  const bottom = (height / 2 - viewport.y) / viewport.zoom;

  const startX = Math.floor(left / GRID_SIZE) * GRID_SIZE;
  const endX = Math.ceil(right / GRID_SIZE) * GRID_SIZE;
  const startY = Math.floor(top / GRID_SIZE) * GRID_SIZE;
  const endY = Math.ceil(bottom / GRID_SIZE) * GRID_SIZE;

  ctx.lineWidth = 1 / viewport.zoom;

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
  ctx.beginPath();
  for (let x = startX; x <= endX; x += GRID_SIZE) {
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
  }
  for (let y = startY; y <= endY; y += GRID_SIZE) {
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
  ctx.beginPath();
  for (let x = startX; x <= endX; x += GRID_SIZE * MAJOR_STEP) {
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
  }
  for (let y = startY; y <= endY; y += GRID_SIZE * MAJOR_STEP) {
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = 2 / viewport.zoom;
  ctx.beginPath();
  if (0 >= startY && 0 <= endY) {
    ctx.moveTo(startX, 0);
    ctx.lineTo(endX, 0);
  }
  if (0 >= startX && 0 <= endX) {
    ctx.moveTo(0, startY);
    ctx.lineTo(0, endY);
  }
  ctx.stroke();
};
