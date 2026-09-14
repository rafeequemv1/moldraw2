import { setSelectionInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

export const setSelectionTool: RegisteredAiTool = {
  id: 'molecule.set_selection',
  category: 'meta',
  description:
    'Set or clear the editor selection (atom/bond/annotation ids). Use clear:true to deselect all.',
  inputSchema: setSelectionInputSchema,
  handler: (input, ctx) => {
    if (!ctx.setSelection) {
      return toolFail('NO_DISPATCHER', 'molecule.set_selection requires ctx.setSelection (in-app editor).');
    }
    const {
      clear,
      atomIds,
      bondIds,
      canvasTextId,
      reactionArrowId,
      canvasImageId,
    } = input as {
      clear?: boolean;
      atomIds?: string[];
      bondIds?: string[];
      canvasTextId?: string | null;
      reactionArrowId?: string | null;
      canvasImageId?: string | null;
    };

    if (clear) {
      ctx.setSelection({
        atomIds: [],
        bondIds: [],
        canvasTextId: null,
        reactionArrowId: null,
        canvasImageId: null,
        sruBracketId: null,
        colorEditStrokeId: null,
        colorEditCanvasShapeId: null,
      });
      return toolOk({ cleared: true });
    }

    const patch: Record<string, unknown> = {};
    if (atomIds !== undefined) patch.atomIds = atomIds;
    if (bondIds !== undefined) patch.bondIds = bondIds;
    if (canvasTextId !== undefined) patch.canvasTextId = canvasTextId;
    if (reactionArrowId !== undefined) patch.reactionArrowId = reactionArrowId;
    if (canvasImageId !== undefined) patch.canvasImageId = canvasImageId;
    ctx.setSelection(patch);
    return toolOk({ selection: patch });
  },
};
