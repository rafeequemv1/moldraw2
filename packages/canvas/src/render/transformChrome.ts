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
    handleStroke: t.transformHandleStroke ?? 'rgba(30, 58, 138, 0.95)',
    boxStroke: t.transformBoxStroke ?? 'rgba(30, 58, 138, 0.42)',
    accent: t.transformAccent ?? 'rgba(30, 58, 138, 0.85)',
    badgeFill: t.transformBadgeFill ?? 'rgba(241, 245, 249, 0.96)',
    badgeText: t.transformBadgeText ?? '#1e3a8a',
    guide: t.transformGuideStroke ?? 'rgba(148, 163, 184, 0.85)',
    marqueeStroke: t.marqueeStroke ?? 'rgba(30, 58, 138, 0.75)',
    marqueeFill: t.marqueeFill ?? 'rgba(30, 58, 138, 0.08)',
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
