import { buildCanvasStateSnapshot } from '@moldraw/core';
import { getCanvasStateInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { toolOk } from '../types';

const EMPTY_SELECTION = {
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

export const getCanvasStateTool: RegisteredAiTool = {
  id: 'molecule.get_canvas_state',
  category: 'read',
  description:
    'Primary canvas snapshot for agents: connected-molecule count, per-molecule SMILES/atomIds/bbox/coords (left-to-right), selection, annotations, optional reaction roles. Prefer this before move/rotate/align/color on existing content.',
  inputSchema: getCanvasStateInputSchema,
  handler: (input, ctx) => {
    const opts = (input ?? {}) as {
      includeCoords?: boolean;
      includeSmiles?: boolean;
      includeAnnotations?: boolean;
      maxAtomsPerMolecule?: number;
    };
    const snapshot = buildCanvasStateSnapshot(ctx.getMolecule(), opts);
    return toolOk({
      ...snapshot,
      selection: ctx.getSelection?.() ?? EMPTY_SELECTION,
    });
  },
};
