/**
 * Helpers for measuring, drawing-font-building, and hit-testing free-text
 * labels (`CanvasText`) drawn on top of the molecule.
 */
import type { CanvasText } from '@moldraw/domain';

const PAD_X = 6;
const PAD_Y = 4;
const MIN_BOX_W = 48;
const MIN_BOX_H = 24;

export type CanvasTextBox = {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/** Build a CSS font shorthand from a `CanvasText`'s style fields. */
export const buildCanvasTextFont = (t: CanvasText): string => {
  const italic = t.fontStyle === 'italic' ? 'italic ' : '';
  const w = t.fontWeight === 'bold' ? 'bold ' : '';
  const family = t.fontFamily?.trim() || 'Inter';
  return `${italic}${w}${t.fontSize}px ${family}, sans-serif`;
};

/**
 * Measure a multi-line `CanvasText` block. Returns the largest line width,
 * total height, the per-line height, and the split lines themselves.
 * Note: mutates `ctx.font`.
 */
export const measureCanvasTextBox = (
  ctx: CanvasRenderingContext2D,
  t: CanvasText,
): { maxW: number; totalH: number; lineHeight: number; lines: string[] } => {
  ctx.font = buildCanvasTextFont(t);
  const lines = t.text.split(/\r?\n/);
  const lineHeight = t.fontSize * 1.2;
  let maxW = 8;
  for (const line of lines) {
    const tw = ctx.measureText(line || ' ').width;
    if (tw > maxW) maxW = tw;
  }
  const totalH = Math.max(1, lines.length) * lineHeight;
  return { maxW, totalH, lineHeight, lines };
};

/** Selection / hit box (explicit size or content + padding). */
export const getCanvasTextBox = (
  ctx: CanvasRenderingContext2D,
  t: CanvasText,
): CanvasTextBox => {
  const { maxW, totalH } = measureCanvasTextBox(ctx, t);
  const width = Math.max(MIN_BOX_W, t.boxWidth ?? maxW + PAD_X * 2);
  const height = Math.max(MIN_BOX_H, t.boxHeight ?? totalH + PAD_Y * 2);
  const left = t.x - width / 2;
  const right = t.x + width / 2;
  const top = t.y - height / 2;
  const bottom = t.y + height / 2;
  return { width, height, left, right, top, bottom };
};

/** Top-most label whose box contains the world-space point. */
export const pickCanvasTextAt = (
  ctx: CanvasRenderingContext2D,
  texts: CanvasText[],
  wx: number,
  wy: number,
): CanvasText | null => {
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    const box = getCanvasTextBox(ctx, t);
    if (wx >= box.left && wx <= box.right && wy >= box.top && wy <= box.bottom) {
      return t;
    }
  }
  return null;
};

/** Bottom-right resize handle when pointer is near the box corner. */
export const pickCanvasTextResizeHandle = (
  ctx: CanvasRenderingContext2D,
  t: CanvasText,
  wx: number,
  wy: number,
  zoom: number,
): boolean => {
  const box = getCanvasTextBox(ctx, t);
  const r = Math.max(5, 7 / zoom);
  const hx = box.right;
  const hy = box.bottom;
  return Math.hypot(wx - hx, wy - hy) <= r;
};

/** Padded world-space bbox of a `CanvasText` label. */
export const canvasTextBbox = (
  ctx: CanvasRenderingContext2D,
  t: CanvasText,
): { left: number; right: number; top: number; bottom: number } => {
  const box = getCanvasTextBox(ctx, t);
  return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
};

/** Top-most label whose bbox intersects a world-space rectangle (marquee select). */
export const pickTopCanvasTextInRect = (
  ctx: CanvasRenderingContext2D,
  texts: CanvasText[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): CanvasText | null => {
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    const b = canvasTextBbox(ctx, t);
    if (b.right < minX || b.left > maxX || b.bottom < minY || b.top > maxY) continue;
    return t;
  }
  return null;
};

/** Resize from bottom-right handle; top-left corner of box stays fixed. */
export const canvasTextResizePatch = (
  _orig: CanvasText,
  anchorLeft: number,
  anchorTop: number,
  pointerX: number,
  pointerY: number,
): Partial<CanvasText> => {
  const width = Math.max(MIN_BOX_W, pointerX - anchorLeft);
  const height = Math.max(MIN_BOX_H, pointerY - anchorTop);
  return {
    boxWidth: width,
    boxHeight: height,
    x: anchorLeft + width / 2,
    y: anchorTop + height / 2,
  };
};
