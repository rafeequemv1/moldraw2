/**
 * Live drag preview for marquee selections (atoms are offset in useCanvasRenderer;
 * annotations are shifted here so arrows, strokes, text, etc. move together).
 */
import type { Molecule } from '@moldraw/domain';
import { reactionArrowAfterDelta } from './reactionArrow';

export type MarqueeMovePreviewIds = {
  reactionArrowIds: string[];
  strokeIds: string[];
  canvasTextIds: string[];
  canvasShapeIds: string[];
  canvasImageIds: string[];
};

export const applyMarqueeMovePreview = (
  mol: Molecule,
  ids: MarqueeMovePreviewIds,
  dx: number,
  dy: number,
): Molecule => {
  if (dx === 0 && dy === 0) return mol;

  let m = mol;

  if (ids.reactionArrowIds.length > 0) {
    const want = new Set(ids.reactionArrowIds);
    m = {
      ...m,
      reactionArrows: (m.reactionArrows ?? []).map(a =>
        want.has(a.id) ? reactionArrowAfterDelta(a, dx, dy) : a,
      ),
    };
  }

  if (ids.strokeIds.length > 0) {
    const want = new Set(ids.strokeIds);
    m = {
      ...m,
      strokes: (m.strokes ?? []).map(s =>
        want.has(s.id)
          ? { ...s, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
          : s,
      ),
    };
  }

  if (ids.canvasTextIds.length > 0) {
    const want = new Set(ids.canvasTextIds);
    m = {
      ...m,
      canvasTexts: (m.canvasTexts ?? []).map(t =>
        want.has(t.id) ? { ...t, x: t.x + dx, y: t.y + dy } : t,
      ),
    };
  }

  if (ids.canvasShapeIds.length > 0) {
    const want = new Set(ids.canvasShapeIds);
    m = {
      ...m,
      canvasShapes: (m.canvasShapes ?? []).map(s =>
        want.has(s.id)
          ? { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy }
          : s,
      ),
    };
  }

  if (ids.canvasImageIds.length > 0) {
    const want = new Set(ids.canvasImageIds);
    m = {
      ...m,
      canvasImages: (m.canvasImages ?? []).map(img =>
        want.has(img.id) ? { ...img, x: img.x + dx, y: img.y + dy } : img,
      ),
    };
  }

  return m;
};
