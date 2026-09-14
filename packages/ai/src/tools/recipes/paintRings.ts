import { CMD } from '@moldraw/core';
import { perceiveRings } from '@moldraw/engine';
import { paintRingsInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { dispatchCommand, toolFail, toolOk } from '../types';
import { resolveFragmentAtomIds } from './resolveFragment';

export const paintRingsTool: RegisteredAiTool = {
  id: 'molecule.paint_rings',
  category: 'recipe',
  description:
    'Ring-tool style fill: color rings (optionally limited to one molecule via moleculeIndex). Prefer this for “paint rings on the left molecule”.',
  inputSchema: paintRingsInputSchema,
  handler: (input, ctx) => {
    const {
      color = '#3b82f6',
      opacity = 0.35,
      size,
      colorAtoms = false,
      colorBonds = false,
      moleculeIndex,
      smilesIncludes,
      atomIds,
    } = input as {
      color?: string;
      opacity?: number;
      size?: number;
      colorAtoms?: boolean;
      colorBonds?: boolean;
      moleculeIndex?: number;
      smilesIncludes?: string;
      atomIds?: string[];
    };

    let fragmentAtomIds: string[] | null = null;
    if (moleculeIndex != null || smilesIncludes != null || (atomIds && atomIds.length > 0)) {
      const resolved = resolveFragmentAtomIds(ctx, {
        moleculeIndex,
        smilesIncludes,
        atomIds,
        useSelection: false,
      });
      if (!resolved.ok) return resolved.error;
      fragmentAtomIds = resolved.data.atomIds;
    }

    const mol = ctx.getMolecule();
    let rings = perceiveRings(mol);
    if (size != null) rings = rings.filter(r => r.size === size);
    if (fragmentAtomIds) {
      const allowed = new Set(fragmentAtomIds);
      rings = rings.filter(r => r.atomIds.every(id => allowed.has(id)));
    }
    if (rings.length === 0) {
      const scope =
        moleculeIndex != null
          ? ` in molecule ${moleculeIndex}`
          : smilesIncludes
            ? ` matching "${smilesIncludes}"`
            : '';
      return toolFail(
        'EXECUTION',
        size != null ? `No rings of size ${size}${scope}.` : `No rings found${scope}.`,
      );
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

    return toolOk({
      ringCount: rings.length,
      atomCount: selectedAtomIds.length,
      color,
      opacity,
      moleculeIndex,
    });
  },
};
