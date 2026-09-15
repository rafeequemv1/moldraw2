/**
 * `CanvasRenderingContext2D.drawImage` throws InvalidStateError when the
 * source is a canvas with width or height 0. That crash unmounts the SPA
 * (white page, only the chat bubble left). Skip instead.
 */
export const canvasHasBitmap = (source: CanvasImageSource): boolean => {
  if (source instanceof HTMLCanvasElement) {
    return source.width >= 1 && source.height >= 1;
  }
  if (typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas) {
    return source.width >= 1 && source.height >= 1;
  }
  return true;
};

export const safeDrawImage = (
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  ...args: number[]
): void => {
  if (!canvasHasBitmap(image)) return;
  try {
    // Overloads: (img, dx, dy) | (img, dx, dy, dw, dh) | (img, sx, sy, sw, sh, dx, dy, dw, dh)
    (ctx.drawImage as (image: CanvasImageSource, ...rest: number[]) => void)(image, ...args);
  } catch {
    /* zero-size / tainted / detached */
  }
};
