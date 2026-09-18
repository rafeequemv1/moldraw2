import { DEFAULT_ATOM_INK } from '@moldraw/domain';
import { handleCanvasTextPointerDown } from './canvasTextPointer';
import { pickAtomAt } from './hitTest';
import type { InteractionContext } from './types';

/**
 * Text tool: pointer-down on existing text starts move/resize; first empty
 * click creates a label. While a box is selected or the editor is open,
 * a click on empty canvas switches to the select/move tool instead of
 * spawning another box.
 *
 * Figma-style: the new label starts *empty* with the frame + caret showing
 * immediately (the host focuses the inline editor on selection). A label
 * that is still empty when it loses selection is discarded by the host, so
 * stray clicks never litter the canvas with placeholder words.
 */
export const textToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos, molecule } = ctx;
  if (e.button !== 0) return false;

  if (handleCanvasTextPointerDown(ctx)) return true;

  // Selected or typing: empty-canvas click exits the text tool (does not
  // spawn another box) so the user can move / select.
  if (ctx.selectedCanvasTextId || ctx.canvasTextEditing) {
    ctx.onSetActiveTool?.('select');
    return true;
  }

  const atom = pickAtomAt(molecule, worldPos, ctx.hit.atomHitRadius);
  if (!atom && ctx.onAddCanvasText) {
    const id = Math.random().toString(36).substring(2, 11);
    ctx.onAddCanvasText({
      id,
      x: worldPos.x,
      y: worldPos.y,
      text: '',
      fontSize: 22,
      // Document default ink — never the Color-menu / atom–bond paint color.
      color: DEFAULT_ATOM_INK,
      fontWeight: 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'left',
      boxWidth: 200,
      boxHeight: 40,
    });
  }
  return true;
};
