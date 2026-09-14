/**
 * Hit-test and transform helpers for canvas raster images.
 * Box is top-left (x,y) + size; rotation is about the center.
 */
import type { CanvasImage } from '@moldraw/domain';

const MIN_W = 24;
const MIN_H = 24;
const ROTATE_HANDLE_OFFSET = 28;
const RESIZE_HANDLE_R = 8;
const ROTATE_HANDLE_R = 10;

export type CanvasImageBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  rotationRad: number;
};

export const getCanvasImageBox = (image: CanvasImage): CanvasImageBox => {
  const width = Math.max(MIN_W, image.width);
  const height = Math.max(MIN_H, image.height);
  return {
    x: image.x,
    y: image.y,
    width,
    height,
    cx: image.x + width / 2,
    cy: image.y + height / 2,
    rotationRad: image.rotationRad ?? 0,
  };
};

/** World → local (unrotated, origin at image center). */
export const worldToImageLocal = (
  image: CanvasImage,
  wx: number,
  wy: number,
): { lx: number; ly: number } => {
  const box = getCanvasImageBox(image);
  const dx = wx - box.cx;
  const dy = wy - box.cy;
  const c = Math.cos(-box.rotationRad);
  const s = Math.sin(-box.rotationRad);
  return { lx: dx * c - dy * s, ly: dx * s + dy * c };
};

/** Local (center-origin) → world. */
export const imageLocalToWorld = (
  image: CanvasImage,
  lx: number,
  ly: number,
): { x: number; y: number } => {
  const box = getCanvasImageBox(image);
  const c = Math.cos(box.rotationRad);
  const s = Math.sin(box.rotationRad);
  return {
    x: box.cx + lx * c - ly * s,
    y: box.cy + lx * s + ly * c,
  };
};

export const hitCanvasImage = (image: CanvasImage, wx: number, wy: number): boolean => {
  const box = getCanvasImageBox(image);
  const { lx, ly } = worldToImageLocal(image, wx, wy);
  return (
    lx >= -box.width / 2 &&
    lx <= box.width / 2 &&
    ly >= -box.height / 2 &&
    ly <= box.height / 2
  );
};

export const pickCanvasImageAt = (
  images: CanvasImage[] | undefined,
  wx: number,
  wy: number,
): CanvasImage | null => {
  const list = images ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (hitCanvasImage(list[i]!, wx, wy)) return list[i]!;
  }
  return null;
};

/** Bottom-right resize handle in local/world space. */
export const getCanvasImageResizeHandleWorld = (
  image: CanvasImage,
): { x: number; y: number } => {
  const box = getCanvasImageBox(image);
  return imageLocalToWorld(image, box.width / 2, box.height / 2);
};

/** Rotate handle above the top edge (local). */
export const getCanvasImageRotateHandleWorld = (
  image: CanvasImage,
): { x: number; y: number } => {
  const box = getCanvasImageBox(image);
  return imageLocalToWorld(image, 0, -box.height / 2 - ROTATE_HANDLE_OFFSET);
};

export const pickCanvasImageResizeHandle = (
  image: CanvasImage,
  wx: number,
  wy: number,
  zoom: number,
): boolean => {
  const h = getCanvasImageResizeHandleWorld(image);
  const r = Math.max(RESIZE_HANDLE_R / 2, RESIZE_HANDLE_R / zoom);
  return Math.hypot(wx - h.x, wy - h.y) <= r;
};

export const pickCanvasImageRotateHandle = (
  image: CanvasImage,
  wx: number,
  wy: number,
  zoom: number,
): boolean => {
  const h = getCanvasImageRotateHandleWorld(image);
  const r = Math.max(ROTATE_HANDLE_R / 2, ROTATE_HANDLE_R / zoom);
  return Math.hypot(wx - h.x, wy - h.y) <= r;
};

/**
 * Resize from bottom-right; keep top-left of the *unrotated* box fixed and
 * preserve aspect ratio when `lockAspect` is true.
 */
export const canvasImageResizePatch = (
  orig: CanvasImage,
  pointerX: number,
  pointerY: number,
  lockAspect = false,
): Partial<CanvasImage> => {
  const box = getCanvasImageBox(orig);
  const { lx, ly } = worldToImageLocal(orig, pointerX, pointerY);
  // Local BR is at (w/2, h/2); top-left local is (-w/2, -h/2).
  let newW = Math.max(MIN_W, lx - -box.width / 2);
  let newH = Math.max(MIN_H, ly - -box.height / 2);
  if (lockAspect && box.width > 0 && box.height > 0) {
    const aspect = box.width / box.height;
    if (newW / newH > aspect) newH = newW / aspect;
    else newW = newH * aspect;
    newW = Math.max(MIN_W, newW);
    newH = Math.max(MIN_H, newH);
  }
  // Keep center fixed relative to top-left pivot in local space:
  // top-left world stays: recreate from old top-left by expanding BR only in local.
  // Simpler ChemDraw-like: keep top-left (x,y) fixed in world (unrotated convention).
  return {
    width: newW,
    height: newH,
    // When rotated, expanding width/height from top-left shifts the visual center.
    // Re-anchor so the local top-left corner stays fixed in world.
    ...(() => {
      const oldTl = imageLocalToWorld(orig, -box.width / 2, -box.height / 2);
      const rot = box.rotationRad;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      // New center = TL + R * (w/2, h/2)
      const ncx = oldTl.x + (newW / 2) * c - (newH / 2) * s;
      const ncy = oldTl.y + (newW / 2) * s + (newH / 2) * c;
      return { x: ncx - newW / 2, y: ncy - newH / 2 };
    })(),
  };
};

export const canvasImageRotatePatch = (
  orig: CanvasImage,
  startPointerAngle: number,
  currentPointerAngle: number,
): Partial<CanvasImage> => {
  const delta = currentPointerAngle - startPointerAngle;
  return { rotationRad: (orig.rotationRad ?? 0) + delta };
};

/** Preview image after an in-progress drag. */
export const canvasImageWithDragPreview = (
  image: CanvasImage,
  drag:
    | {
        type: 'move_canvas_image';
        imageId: string;
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
        origX: number;
        origY: number;
      }
    | {
        type: 'resize_canvas_image';
        imageId: string;
        currentX: number;
        currentY: number;
        origImage: CanvasImage;
        lockAspect?: boolean;
      }
    | {
        type: 'rotate_canvas_image';
        imageId: string;
        startPointerAngle: number;
        currentPointerAngle: number;
        origImage: CanvasImage;
      }
    | null
    | undefined,
): CanvasImage => {
  if (!drag || drag.imageId !== image.id) return image;
  if (drag.type === 'move_canvas_image') {
    return {
      ...image,
      x: drag.origX + (drag.currentX - drag.startX),
      y: drag.origY + (drag.currentY - drag.startY),
    };
  }
  if (drag.type === 'resize_canvas_image') {
    return {
      ...drag.origImage,
      ...canvasImageResizePatch(
        drag.origImage,
        drag.currentX,
        drag.currentY,
        drag.lockAspect === true,
      ),
    };
  }
  if (drag.type === 'rotate_canvas_image') {
    return {
      ...drag.origImage,
      ...canvasImageRotatePatch(
        drag.origImage,
        drag.startPointerAngle,
        drag.currentPointerAngle,
      ),
    };
  }
  return image;
};
