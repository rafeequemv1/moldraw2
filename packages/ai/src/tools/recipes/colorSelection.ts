import { CMD } from '@moldraw/core';
import { colorSelectionInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { dispatchCommand, toolFail, toolOk } from '../types';
import { resolveNamedHexColor } from './namedColor';

export const colorSelectionTool: RegisteredAiTool = {
  id: 'molecule.color_selection',
  category: 'recipe',
  description:
    'Apply a color to the current selection (atoms, bonds, and/or ring fills). ' +
    'For “all oxygen” use molecule.color_by_element; for “all double bonds” use molecule.color_by_bond_order.',
  inputSchema: colorSelectionInputSchema,
  handler: (input, ctx) => {
    const {
      color: rawColor,
      atomLabels = true,
      bonds = true,
      ringFill = false,
      ringFillOpacity = 0.35,
    } = input as {
      color: string;
      atomLabels?: boolean;
      bonds?: boolean;
      ringFill?: boolean;
      ringFillOpacity?: number;
    };

    const color = resolveNamedHexColor(rawColor);
    if (!color) {
      return toolFail(
        'VALIDATION',
        `Could not resolve color "${rawColor}". Use a hex like #2563eb or a name like blue.`,
      );
    }

    const sel = ctx.getSelection?.();
    const selectedAtomIds = sel?.atomIds ?? [];
    const selectedBondIds = sel?.bondIds ?? [];
    const hasOther =
      Boolean(sel?.canvasTextId) ||
      Boolean(sel?.reactionArrowId) ||
      Boolean(sel?.colorEditStrokeId) ||
      Boolean(sel?.colorEditCanvasShapeId);

    if (selectedAtomIds.length === 0 && selectedBondIds.length === 0 && !hasOther) {
      return toolFail(
        'EXECUTION',
        'Nothing selected. Use molecule.color_by_element, molecule.color_by_bond_order, or molecule.color_rings — or select atoms/bonds first.',
      );
    }

    const result = dispatchCommand(ctx, CMD.ApplySelectionColor, {
      color,
      flags: {
        atomLabels: atomLabels && selectedAtomIds.length > 0,
        bonds: bonds && (selectedBondIds.length > 0 || selectedAtomIds.length > 0),
        ringFill,
        text: Boolean(sel?.canvasTextId),
        arrowLine: Boolean(sel?.reactionArrowId),
        arrowReagent: false,
        strokes: Boolean(sel?.colorEditStrokeId),
        canvasShapes: Boolean(sel?.colorEditCanvasShapeId),
      },
      selectedAtomIds,
      selectedBondIds: selectedBondIds.length > 0 ? selectedBondIds : undefined,
      selectedCanvasTextId: sel?.canvasTextId ?? null,
      selectedReactionArrowId: sel?.reactionArrowId ?? null,
      selectedStrokeId: sel?.colorEditStrokeId ?? null,
      selectedCanvasShapeId: sel?.colorEditCanvasShapeId ?? null,
      ringFillOpacity,
    });
    if (!result.ok) return result;
    return toolOk({
      color,
      atomCount: selectedAtomIds.length,
      bondCount: selectedBondIds.length,
    });
  },
};
