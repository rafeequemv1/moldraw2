/**
 * Marquee / lasso helpers for non-atom canvas objects (arrows, shapes, strokes, …).
 */
import type { Molecule } from '@moldraw/domain';
import type { Point } from './polygons';
import { segmentIntersectsRect } from './polygons';
import { canvasTextBbox, estimateCanvasTextAabb } from './canvasText';
import { getCanvasShapeBox, hitCanvasShapeTransformed } from './canvasShapeTransform';
import { sampleReactionArrowPolyline } from './reactionArrow';
import { collectStrokesInRect, collectStrokesInPolygon } from './strokes';
import { pointInPolygon } from './polygons';

export type MarqueeAnnotationSet = {
  reactionArrowIds: string[];
  strokeIds: string[];
  canvasTextIds: string[];
  canvasShapeIds: string[];
  canvasImageIds: string[];
};

const rectsOverlap = (
  aMinX: number,
  aMinY: number,
  aMaxX: number,
  aMaxY: number,
  bMinX: number,
  bMinY: number,
  bMaxX: number,
  bMaxY: number,
): boolean => !(aMaxX < bMinX || aMinX > bMaxX || aMaxY < bMinY || aMinY > bMaxY);

const pointInRect = (x: number, y: number, minX: number, minY: number, maxX: number, maxY: number) =>
  x >= minX && x <= maxX && y >= minY && y <= maxY;

const collectArrowsInRect = (
  mol: Molecule,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): string[] => {
  const ids: string[] = [];
  for (const a of mol.reactionArrows ?? []) {
    const pts = sampleReactionArrowPolyline(a);
    if (pts.length === 0) continue;
    let hit = pts.some(p => pointInRect(p.x, p.y, minX, minY, maxX, maxY));
    if (!hit) {
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i]!;
        const p1 = pts[i + 1]!;
        if (segmentIntersectsRect(p0.x, p0.y, p1.x, p1.y, minX, minY, maxX, maxY)) {
          hit = true;
          break;
        }
      }
    }
    if (!hit) {
      const xs = pts.map(p => p.x);
      const ys = pts.map(p => p.y);
      hit = rectsOverlap(
        Math.min(...xs),
        Math.min(...ys),
        Math.max(...xs),
        Math.max(...ys),
        minX,
        minY,
        maxX,
        maxY,
      );
    }
    if (hit) ids.push(a.id);
  }
  return ids;
};

const collectShapesInRect = (
  mol: Molecule,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): string[] => {
  const ids: string[] = [];
  for (const s of mol.canvasShapes ?? []) {
    const box = getCanvasShapeBox(s);
    if (
      rectsOverlap(box.x1, box.y1, box.x2, box.y2, minX, minY, maxX, maxY) ||
      hitCanvasShapeTransformed(s, (minX + maxX) * 0.5, (minY + maxY) * 0.5)
    ) {
      ids.push(s.id);
    }
  }
  return ids;
};

const collectImagesInRect = (
  mol: Molecule,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): string[] => {
  const ids: string[] = [];
  for (const img of mol.canvasImages ?? []) {
    const iMinX = img.x;
    const iMinY = img.y;
    const iMaxX = img.x + img.width;
    const iMaxY = img.y + img.height;
    if (rectsOverlap(iMinX, iMinY, iMaxX, iMaxY, minX, minY, maxX, maxY)) {
      ids.push(img.id);
    }
  }
  return ids;
};

const collectTextsInRect = (
  mol: Molecule,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  canvasCtx: CanvasRenderingContext2D | null,
): string[] => {
  const ids: string[] = [];
  for (const t of mol.canvasTexts ?? []) {
    let overlaps = false;
    if (canvasCtx) {
      const b = canvasTextBbox(canvasCtx, t);
      overlaps = !(b.right < minX || b.left > maxX || b.bottom < minY || b.top > maxY);
    } else {
      const b = estimateCanvasTextAabb(t);
      overlaps = !(b.maxX < minX || b.minX > maxX || b.maxY < minY || b.minY > maxY);
    }
    if (overlaps) ids.push(t.id);
  }
  return ids;
};

/** All annotations whose geometry intersects the marquee rectangle. */
export const collectAnnotationsInRect = (
  mol: Molecule,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  canvasCtx: CanvasRenderingContext2D | null,
): MarqueeAnnotationSet => ({
  canvasTextIds: collectTextsInRect(mol, minX, minY, maxX, maxY, canvasCtx),
  canvasImageIds: collectImagesInRect(mol, minX, minY, maxX, maxY),
  canvasShapeIds: collectShapesInRect(mol, minX, minY, maxX, maxY),
  strokeIds: collectStrokesInRect(mol, minX, minY, maxX, maxY).map(s => s.id),
  reactionArrowIds: collectArrowsInRect(mol, minX, minY, maxX, maxY),
});

const collectArrowsInPolygon = (mol: Molecule, loop: Point[]): string[] => {
  const ids: string[] = [];
  for (const a of mol.reactionArrows ?? []) {
    const pts = sampleReactionArrowPolyline(a);
    if (pts.some(p => pointInPolygon(p.x, p.y, loop))) {
      ids.push(a.id);
      continue;
    }
    const cx = (a.x1 + a.x2) * 0.5;
    const cy = (a.y1 + a.y2) * 0.5;
    if (pointInPolygon(cx, cy, loop)) ids.push(a.id);
  }
  return ids;
};

const collectShapesInPolygon = (mol: Molecule, loop: Point[]): string[] => {
  const ids: string[] = [];
  for (const s of mol.canvasShapes ?? []) {
    const box = getCanvasShapeBox(s);
    if (pointInPolygon(box.cx, box.cy, loop)) ids.push(s.id);
  }
  return ids;
};

const collectImagesInPolygon = (mol: Molecule, loop: Point[]): string[] => {
  const ids: string[] = [];
  for (const img of mol.canvasImages ?? []) {
    const cx = img.x + img.width * 0.5;
    const cy = img.y + img.height * 0.5;
    if (pointInPolygon(cx, cy, loop)) ids.push(img.id);
  }
  return ids;
};

const collectTextsInPolygon = (
  mol: Molecule,
  loop: Point[],
  canvasCtx: CanvasRenderingContext2D | null,
): string[] => {
  if (!canvasCtx) return [];
  const ids: string[] = [];
  for (const t of mol.canvasTexts ?? []) {
    if (pointInPolygon(t.x, t.y, loop)) ids.push(t.id);
  }
  return ids;
};

export const collectAnnotationsInPolygon = (
  mol: Molecule,
  loop: Point[],
  canvasCtx: CanvasRenderingContext2D | null,
): MarqueeAnnotationSet => ({
  canvasTextIds: collectTextsInPolygon(mol, loop, canvasCtx),
  canvasImageIds: collectImagesInPolygon(mol, loop),
  canvasShapeIds: collectShapesInPolygon(mol, loop),
  strokeIds: collectStrokesInPolygon(mol, loop).map(s => s.id),
  reactionArrowIds: collectArrowsInPolygon(mol, loop),
});

/** @deprecated Use collectAnnotationsInRect — returns first hit only. */
export type AnnotationPick =
  | { kind: 'text'; id: string }
  | { kind: 'image'; id: string }
  | { kind: 'shape'; id: string }
  | { kind: 'arrow'; id: string }
  | { kind: 'stroke'; id: string };

export const pickAnnotationInRect = (
  mol: Molecule,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  canvasCtx: CanvasRenderingContext2D | null,
): AnnotationPick | null => {
  const all = collectAnnotationsInRect(mol, minX, minY, maxX, maxY, canvasCtx);
  if (all.canvasTextIds[0]) return { kind: 'text', id: all.canvasTextIds[0] };
  if (all.canvasImageIds[0]) return { kind: 'image', id: all.canvasImageIds[0] };
  if (all.canvasShapeIds[0]) return { kind: 'shape', id: all.canvasShapeIds[0] };
  if (all.strokeIds[0]) return { kind: 'stroke', id: all.strokeIds[0] };
  if (all.reactionArrowIds[0]) return { kind: 'arrow', id: all.reactionArrowIds[0] };
  return null;
};

export const pickAnnotationInPolygon = (
  mol: Molecule,
  loop: Point[],
  canvasCtx: CanvasRenderingContext2D | null,
): AnnotationPick | null => {
  const all = collectAnnotationsInPolygon(mol, loop, canvasCtx);
  if (all.canvasTextIds[0]) return { kind: 'text', id: all.canvasTextIds[0] };
  if (all.canvasImageIds[0]) return { kind: 'image', id: all.canvasImageIds[0] };
  if (all.canvasShapeIds[0]) return { kind: 'shape', id: all.canvasShapeIds[0] };
  if (all.strokeIds[0]) return { kind: 'stroke', id: all.strokeIds[0] };
  if (all.reactionArrowIds[0]) return { kind: 'arrow', id: all.reactionArrowIds[0] };
  return null;
};
