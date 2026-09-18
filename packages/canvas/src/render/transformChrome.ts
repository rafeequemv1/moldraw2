import type { RenderContext } from './types';

export type TransformChrome = {
  handleFill: string;
  handleStroke: string;
  boxStroke: string;
  accent: string;
  badgeFill: string;
  badgeText: string;
  guide: string;
  marqueeStroke: string;
  marqueeFill: string;
};

export const transformChrome = (R: RenderContext): TransformChrome => {
  const t = R.structureTheme;
  return {
    handleFill: t.transformHandleFill ?? '#ffffff',
    handleStroke: t.transformHandleStroke ?? '#0f172a',
    boxStroke: t.transformBoxStroke ?? 'rgba(148, 163, 184, 0.72)',
    accent: t.transformAccent ?? '#2dd4bf',
    badgeFill: t.transformBadgeFill ?? 'rgba(240, 253, 250, 0.97)',
    badgeText: t.transformBadgeText ?? '#0f172a',
    guide: t.transformGuideStroke ?? 'rgba(45, 212, 191, 0.55)',
    marqueeStroke: t.marqueeStroke ?? 'rgba(148, 163, 184, 0.75)',
    marqueeFill: t.marqueeFill ?? 'rgba(148, 163, 184, 0.06)',
  };
};

export const drawTransformHandleDisc = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  lineWidth: number,
  chrome: TransformChrome,
): void => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = chrome.handleFill;
  ctx.fill();
  ctx.strokeStyle = chrome.handleStroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
};

/** Small, slightly rounded square — text / shape box handles. */
export const drawTransformHandleSquare = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  half: number,
  lineWidth: number,
  chrome: TransformChrome,
): void => {
  const s = half * 2;
  const left = x - half;
  const top = y - half;
  const r = Math.min(half * 0.38, 1.05);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(left, top, s, s, r);
  } else {
    const rr = Math.max(0.35, r);
    ctx.moveTo(left + rr, top);
    ctx.arcTo(left + s, top, left + s, top + s, rr);
    ctx.arcTo(left + s, top + s, left, top + s, rr);
    ctx.arcTo(left, top + s, left, top, rr);
    ctx.arcTo(left, top, left + s, top, rr);
    ctx.closePath();
  }
  ctx.fillStyle = chrome.handleFill;
  ctx.fill();
  ctx.strokeStyle = chrome.boxStroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
};
