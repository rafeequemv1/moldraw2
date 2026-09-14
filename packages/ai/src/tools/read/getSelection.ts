import { getSelectionInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { toolOk } from '../types';

const EMPTY = {
  atomIds: [] as string[],
  bondIds: [] as string[],
  canvasTextId: null as string | null,
  reactionArrowId: null as string | null,
  canvasImageId: null as string | null,
  sruBracketId: null as string | null,
  colorEditStrokeId: null as string | null,
  colorEditCanvasShapeId: null as string | null,
  reactionArrowIds: [] as string[],
  strokeIds: [] as string[],
  canvasTextIds: [] as string[],
  canvasShapeIds: [] as string[],
  canvasImageIds: [] as string[],
  canvasOrbitalIds: [] as string[],
};

export const getSelectionTool: RegisteredAiTool = {
  id: 'molecule.get_selection',
  category: 'read',
  description:
    'Return the current UI selection (atom/bond/annotation ids). Empty when nothing is selected or in headless MCP.',
  inputSchema: getSelectionInputSchema,
  handler: (_input, ctx) => {
    const sel = ctx.getSelection?.() ?? EMPTY;
    return toolOk({ ...sel });
  },
};
