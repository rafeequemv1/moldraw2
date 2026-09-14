import type { CanvasImage } from '@moldraw/domain';
import type { RenderContext } from './types';

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

export const drawCanvasImages = (ctx: CanvasRenderingContext2D, R: RenderContext): void => {
  const images = R.renderedMolecule.canvasImages ?? [];
  for (const image of images) {
    const img = getImageElement(image);
    if (!img.complete || img.naturalWidth === 0) continue;
    ctx.save();
    ctx.drawImage(img, image.x, image.y, image.width, image.height);
    ctx.restore();
  }
};
