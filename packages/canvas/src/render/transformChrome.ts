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
    boxStroke: t.transformBoxStroke ?? 'rgba(13, 148, 166, 0.92)',
    accent: t.transformAccent ?? '#2dd4bf',
    badgeFill: t.transformBadgeFill ?? 'rgba(240, 253, 250, 0.97)',
    badgeText: t.transformBadgeText ?? '#0f172a',
    guide: t.transformGuideStroke ?? 'rgba(45, 212, 191, 0.55)',
    marqueeStroke: t.marqueeStroke ?? 'rgba(13, 148, 136, 0.85)',
    marqueeFill: t.marqueeFill ?? 'rgba(45, 212, 191, 0.08)',
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
