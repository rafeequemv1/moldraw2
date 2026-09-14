import type { CanvasImage } from '@moldraw/domain';
import {
  canvasImageWithDragPreview,
  getCanvasImageBox,
  getCanvasImageResizeHandleWorld,
  getCanvasImageRotateHandleWorld,
} from '../geometry/canvasImages';
import type { RenderContext } from './types';
import { transformChrome } from './transformChrome';

const IMAGE_LOAD_EVENT = 'moldraw:canvas-image-loaded';
const imageCache = new Map<string, HTMLImageElement>();

const getImageElement = (image: CanvasImage): HTMLImageElement => {
  let img = imageCache.get(image.dataUrl);
  if (img) return img;
  img = new Image();
  img.onload = () => window.dispatchEvent(new Event(IMAGE_LOAD_EVENT));
  img.src = image.dataUrl;
  imageCache.set(image.dataUrl, img);
  return img;
};

export const CANVAS_IMAGE_LOAD_EVENT = IMAGE_LOAD_EVENT;

const drawSelectionChrome = (
  ctx: CanvasRenderingContext2D,
  image: CanvasImage,
  zoom: number,
  R: RenderContext,
): void => {
  const chrome = transformChrome(R);
  const box = getCanvasImageBox(image);
  const lw = 1 / zoom;
  const hs = Math.max(5, 6 / zoom);

  ctx.save();
  ctx.translate(box.cx, box.cy);
  ctx.rotate(box.rotationRad);
  ctx.strokeStyle = chrome.boxStroke;
  ctx.lineWidth = lw;
  ctx.setLineDash([4 / zoom, 3 / zoom]);
  ctx.strokeRect(-box.width / 2, -box.height / 2, box.width, box.height);
  ctx.setLineDash([]);

  ctx.fillStyle = chrome.handleFill;
  ctx.strokeStyle = chrome.handleStroke;
  ctx.lineWidth = lw;
  const brx = box.width / 2;
  const bry = box.height / 2;
  ctx.fillRect(brx - hs, bry - hs, hs * 2, hs * 2);
  ctx.strokeRect(brx - hs, bry - hs, hs * 2, hs * 2);
  ctx.restore();

  // Rotate handle + stem (world).
  const rh = getCanvasImageRotateHandleWorld(image);
  const topMid = (() => {
    const b = getCanvasImageBox(image);
    // top-middle local (0, -h/2)
    const c = Math.cos(b.rotationRad);
    const s = Math.sin(b.rotationRad);
    return {
      x: b.cx - (b.height / 2) * s,
      y: b.cy - (b.height / 2) * c,
    };
  })();
  ctx.save();
  ctx.strokeStyle = chrome.accent;
  ctx.fillStyle = chrome.handleFill;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(topMid.x, topMid.y);
  ctx.lineTo(rh.x, rh.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rh.x, rh.y, hs, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = chrome.handleStroke;
  ctx.stroke();
  ctx.restore();

  const rw = getCanvasImageResizeHandleWorld(image);
  ctx.save();
  ctx.fillStyle = chrome.handleFill;
  ctx.strokeStyle = chrome.handleStroke;
  ctx.lineWidth = lw;
  ctx.fillRect(rw.x - hs, rw.y - hs, hs * 2, hs * 2);
  ctx.strokeRect(rw.x - hs, rw.y - hs, hs * 2, hs * 2);
  ctx.restore();
};

export const drawCanvasImages = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const images = R.renderedMolecule.canvasImages ?? [];
  for (const raw of images) {
    const drag =
      R.dragAction?.type === 'move_canvas_image' ||
      R.dragAction?.type === 'resize_canvas_image' ||
      R.dragAction?.type === 'rotate_canvas_image'
        ? R.dragAction
        : null;
    const image = canvasImageWithDragPreview(raw, drag);
    const img = getImageElement(image);
    if (!img.complete || img.naturalWidth === 0) continue;

    const box = getCanvasImageBox(image);
    ctx.save();
    ctx.translate(box.cx, box.cy);
    ctx.rotate(box.rotationRad);
    ctx.drawImage(img, -box.width / 2, -box.height / 2, box.width, box.height);
    ctx.restore();

    const imageSelected =
      (R.selectedCanvasImageIds?.includes(raw.id) ?? false) ||
      R.selectedCanvasImageId === raw.id;
    if (imageSelected) {
      drawSelectionChrome(ctx, image, R.viewport.zoom, R);
    }
  }
};
