import {
  pickCanvasImageAt,
  pickCanvasShapeAt,
  pickCanvasTextAt,
  pickReactionArrowAt,
  pointSegDist,
} from '../geometry';
import { pickAtomAt, pickBondAt } from './hitTest';
import type { InteractionContext } from './types';

const STROKE_HIT_BASE = 10;

/**
 * Erase tool: pointer-down hits the topmost element under the cursor and
 * forwards a typed `{ type, id }` to the parent. Hit priority:
 *   atom → bond → reaction arrow → canvas text → annotation shape → image → stroke.
 * Strokes use a thickness-aware tolerance so thick lines feel hit-friendly.
 */
export const eraseToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos, molecule, onEraseAt } = ctx;
  if (e.button !== 0 || !onEraseAt) return false;

  const atom = pickAtomAt(molecule, worldPos);
  if (atom) {
    onEraseAt({ type: 'atom', atomId: atom.id });
    return true;
  }

  const bond = pickBondAt(molecule, worldPos);
  if (bond) {
    onEraseAt({ type: 'bond', bondId: bond.id });
    return true;
  }

  const hitArrow = pickReactionArrowAt(molecule.reactionArrows, worldPos.x, worldPos.y);
  if (hitArrow) {
    onEraseAt({ type: 'reactionArrow', id: hitArrow.id });
    return true;
  }

  const canvasCtx = ctx.getCanvasContext();
  if (canvasCtx && molecule.canvasTexts?.length) {
    const hitText = pickCanvasTextAt(canvasCtx, molecule.canvasTexts, worldPos.x, worldPos.y);
    if (hitText) {
      onEraseAt({ type: 'canvasText', id: hitText.id });
      return true;
    }
  }

  const hitShape = pickCanvasShapeAt(molecule.canvasShapes, worldPos.x, worldPos.y);
  if (hitShape) {
    onEraseAt({ type: 'canvasShape', id: hitShape.id });
    return true;
  }

  const hitImage = pickCanvasImageAt(molecule.canvasImages, worldPos.x, worldPos.y);
  if (hitImage) {
    onEraseAt({ type: 'canvasImage', id: hitImage.id });
    return true;
  }

  for (const s of molecule.strokes ?? []) {
    if (s.points.length < 2) continue;
    for (let i = 0; i < s.points.length - 1; i++) {
      const p0 = s.points[i];
      const p1 = s.points[i + 1];
      if (
        pointSegDist(worldPos.x, worldPos.y, p0.x, p0.y, p1.x, p1.y) <
        STROKE_HIT_BASE + s.thickness * 0.4
      ) {
        onEraseAt({ type: 'stroke', strokeId: s.id });
        return true;
      }
    }
  }

  return true;
};
