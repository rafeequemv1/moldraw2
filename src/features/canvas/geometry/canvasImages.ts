import type { CanvasImage } from '@moldraw/domain';

export const hitCanvasImage = (image: CanvasImage, wx: number, wy: number): boolean =>
  wx >= image.x &&
  wx <= image.x + image.width &&
  wy >= image.y &&
  wy <= image.y + image.height;

export const pickCanvasImageAt = (
  images: CanvasImage[] | undefined,
  wx: number,
  wy: number,
): CanvasImage | null => {
  const list = images ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (hitCanvasImage(list[i], wx, wy)) return list[i];
  }
  return null;
};
