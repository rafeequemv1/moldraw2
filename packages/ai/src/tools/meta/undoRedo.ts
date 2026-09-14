import { emptyInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

export const undoTool: RegisteredAiTool = {
  id: 'molecule.undo',
  category: 'meta',
  description: 'Undo the last molecule edit (same as the editor Undo button).',
  inputSchema: emptyInputSchema,
  handler: (_input, ctx) => {
    if (!ctx.undo) {
      return toolFail('NO_DISPATCHER', 'molecule.undo requires ctx.undo (in-app editor).');
    }
    if (ctx.canUndo && !ctx.canUndo()) {
      return toolFail('EXECUTION', 'Nothing to undo.');
    }
    ctx.undo();
    return toolOk({ undone: true });
  },
};

export const redoTool: RegisteredAiTool = {
  id: 'molecule.redo',
  category: 'meta',
  description: 'Redo the most recently undone molecule edit (same as the editor Redo button). No-op if nothing was undone.',
  inputSchema: emptyInputSchema,
  handler: (_input, ctx) => {
    if (!ctx.redo) {
      return toolFail('NO_DISPATCHER', 'molecule.redo requires ctx.redo (in-app editor).');
    }
    if (ctx.canRedo && !ctx.canRedo()) {
      return toolFail('EXECUTION', 'Nothing to redo.');
    }
    ctx.redo();
    return toolOk({ redone: true });
  },
};
