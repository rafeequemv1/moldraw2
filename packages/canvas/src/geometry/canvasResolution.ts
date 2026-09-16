/**
 * HiDPI backing-store helpers.
 *
 * Pointer / pan / world math stays in CSS pixels (getBoundingClientRect).
 * Raster drawing uses a larger bitmap (`css * dpr`) plus `ctx.setTransform(dpr)`
 * so strokes and labels sample like a vector SVG on retina phones and 2× desktops.
 */

/** iOS / GPU canvas size ceiling; keep backing stores under this on each edge. */
const MAX_BACKING_EDGE = 8192;

/** Cap so 3× phones stay sharp without exploding VRAM (structure + overlay + cache). */
export const MAX_CANVAS_DEVICE_PIXEL_RATIO = 3;

export type CssSize = { w: number; h: number };

/** Layout size used for hit-testing and the world camera — not `canvas.width`. */
export const canvasCssSize = (canvas: HTMLCanvasElement): CssSize => {
  const rect = typeof canvas.getBoundingClientRect === 'function' ? canvas.getBoundingClientRect() : null;
  const w = canvas.clientWidth || Math.round(rect?.width ?? 0) || canvas.width;
  const h = canvas.clientHeight || Math.round(rect?.height ?? 0) || canvas.height;
  return { w: Math.max(1, w), h: Math.max(1, h) };
};

/** Backing pixels per CSS pixel for a canvas already sized with `syncCanvasBackingStore`. */
export const canvasBackingDpr = (canvas: HTMLCanvasElement): number => {
  const { w } = canvasCssSize(canvas);
  if (w < 1) return 1;
  const dpr = canvas.width / w;
  return Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
};

export const readDevicePixelRatio = (): number => {
  if (typeof window === 'undefined') return 1;
  const dpr = window.devicePixelRatio || 1;
  return Math.min(MAX_CANVAS_DEVICE_PIXEL_RATIO, Math.max(1, dpr));
};

export const clampBackingDpr = (cssW: number, cssH: number, dpr: number): number => {
  const edge = Math.max(cssW, cssH, 1);
  if (edge * dpr <= MAX_BACKING_EDGE) return dpr;
  return Math.max(1, MAX_BACKING_EDGE / edge);
};

export const syncCanvasBackingStore = (
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
  dpr: number,
): boolean => {
  const scale = clampBackingDpr(cssW, cssH, dpr);
  const w = Math.max(1, Math.round(cssW * scale));
  const h = Math.max(1, Math.round(cssH * scale));
  let changed = false;
  if (canvas.width !== w) {
    canvas.width = w;
    changed = true;
  }
  if (canvas.height !== h) {
    canvas.height = h;
    changed = true;
  }
  return changed;
};
