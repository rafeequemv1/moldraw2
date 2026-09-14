import {
  hitCanvasShapeTransformed,
  pickCanvasImageAt,
  pickCanvasTextAt,
  pickReactionArrowAt,
  arrowsForHitTest,
  pickSruBracketAt,
  pickCanvasOrbitalAt,
  pointSegDist,
} from '../geometry';
import { pickAtomAt, pickBondAt } from './hitTest';
import type { InteractionContext } from './types';
import { isPenEraser } from '../touch/penPriority';

const STROKE_HIT_BASE = 10;

/**
 * Erase tool: pointer-down hits the topmost element under the cursor and
 * forwards a typed `{ type, id }` to the parent. Hit priority:
 *   atom → bond → reaction arrow → canvas text → SRU → annotation shape → image → stroke.
 * Strokes use a thickness-aware tolerance so thick lines feel hit-friendly.
 */
export const eraseToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos, molecule, onEraseAt } = ctx;
  // Primary button, or the stylus eraser end (button 5 / buttons & 32).
  if ((e.button !== 0 && !isPenEraser(e)) || !onEraseAt) return false;

  const atom = pickAtomAt(molecule, worldPos, ctx.hit.atomHitRadius);
  if (atom) {
    onEraseAt({ type: 'atom', atomId: atom.id });
    return true;
  }

  const bond = pickBondAt(molecule, worldPos, ctx.hit.bondHitTolerance);
  if (bond) {
    onEraseAt({ type: 'bond', bondId: bond.id });
    return true;
  }

  const hitArrow = pickReactionArrowAt(arrowsForHitTest(molecule), worldPos.x, worldPos.y);
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

  const hitSru = pickSruBracketAt(molecule.sruBrackets, worldPos.x, worldPos.y);
  if (hitSru) {
    onEraseAt({ type: 'sruBracket', id: hitSru.bracket.id });
    return true;
  }

  const hitOrbital = pickCanvasOrbitalAt(molecule, worldPos.x, worldPos.y, { includeCenter: true });
  if (hitOrbital) {
    onEraseAt({ type: 'canvasOrbital', id: hitOrbital.id });
    return true;
  }

  {
    const list = molecule.canvasShapes ?? [];
    let hitShape = null as (typeof list)[number] | null;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]!;
      if (hitCanvasShapeTransformed(s, worldPos.x, worldPos.y)) {
        hitShape = s;
        break;
      }
    }
    if (hitShape) {
      onEraseAt({ type: 'canvasShape', id: hitShape.id });
      return true;
    }
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
