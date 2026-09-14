import { handleCanvasTextPointerDown } from './canvasTextPointer';
import { pickAtomAt } from './hitTest';
import type { InteractionContext } from './types';

/**
 * Text tool: pointer-down on existing text starts move/resize; empty canvas creates a label.
 */
export const textToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos, molecule } = ctx;
  if (e.button !== 0) return false;

  if (handleCanvasTextPointerDown(ctx)) return true;

  const atom = pickAtomAt(molecule, worldPos);
  if (!atom && ctx.onAddCanvasText) {
    const id = Math.random().toString(36).substring(2, 11);
    ctx.onAddCanvasText({
      id,
      x: worldPos.x,
      y: worldPos.y,
      text: 'Text',
      fontSize: 22,
      color: '#0f172a',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
    });
  }
  return true;
};
