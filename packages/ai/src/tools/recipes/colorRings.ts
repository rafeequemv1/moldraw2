import { CMD } from '@moldraw/core';
import { perceiveRings } from '@moldraw/engine';
import { colorRingsInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { dispatchCommand, toolFail, toolOk } from '../types';

export const colorRingsTool: RegisteredAiTool = {
  id: 'molecule.color_rings',
  category: 'recipe',
  description:
    'Color/fill ALL rings on the canvas in one call (default blue #3b82f6). Use for “color all rings”, “add blue color in all rings”, “paint rings”. Do NOT call get_selection or color_selection — those need a selection and will not paint every ring.',
  inputSchema: colorRingsInputSchema,
  handler: (input, ctx) => {
    const {
      color = '#3b82f6',
      opacity = 0.35,
      size,
      colorAtoms = false,
      colorBonds = false,
    } = input as {
      color?: string;
      opacity?: number;
      size?: number;
      colorAtoms?: boolean;
      colorBonds?: boolean;
    };

    const mol = ctx.getMolecule();
    let rings = perceiveRings(mol);
    if (size != null) rings = rings.filter(r => r.size === size);
    if (rings.length === 0) {
      return toolFail('EXECUTION', size != null ? `No rings of size ${size}.` : 'No rings found.');
    }

    const selectedAtomIds = [...new Set(rings.flatMap(r => r.atomIds))];
    const result = dispatchCommand(ctx, CMD.ApplySelectionColor, {
      color,
      flags: {
        atomLabels: colorAtoms,
        bonds: colorBonds,
        ringFill: true,
        text: false,
        arrowLine: false,
        arrowReagent: false,
        strokes: false,
        canvasShapes: false,
      },
      selectedAtomIds,
      selectedCanvasTextId: null,
      selectedReactionArrowId: null,
      selectedStrokeId: null,
      selectedCanvasShapeId: null,
      ringFillOpacity: opacity,
    });
    if (!result.ok) return result;
    return toolOk({ ringCount: rings.length, atomCount: selectedAtomIds.length, color, opacity });
  },
};
