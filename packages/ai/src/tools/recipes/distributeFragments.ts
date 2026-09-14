import { CMD } from '@moldraw/core';
import { distributeFragmentsInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { dispatchCommand, toolOk } from '../types';
import { resolveMultiFragmentAtomIds } from './resolveFragment';

export const distributeFragmentsTool: RegisteredAiTool = {
  id: 'molecule.distribute_fragments',
  category: 'recipe',
  description:
    'Space two or more connected molecules: horizontal/vertical equal gaps, or rearrange into a grid or circle. For circle, optional radius sets ring size. Pass moleculeIndexes from get_canvas_state.',
  inputSchema: distributeFragmentsInputSchema,
  handler: (input, ctx) => {
    const { axis, moleculeIndexes, atomIds, useSelection, radius } = input as {
      axis: 'horizontal' | 'vertical' | 'grid' | 'circle';
      moleculeIndexes?: number[];
      atomIds?: string[];
      useSelection?: boolean;
      radius?: number;
    };
    const resolved = resolveMultiFragmentAtomIds(ctx, {
      moleculeIndexes,
      atomIds,
      useSelection,
      minFragments: 2,
    });
    if (!resolved.ok) return resolved.error;

    const result = dispatchCommand(ctx, CMD.DistributeSelectedFragments, {
      atomIds: resolved.data.atomIds,
      axis,
      ...(axis === 'circle' && radius != null ? { radius } : {}),
    });
    if (!result.ok) return result;
    return toolOk({
      fragmentCount: resolved.data.fragmentCount,
      atomCount: resolved.data.atomIds.length,
      axis,
      ...(radius != null ? { radius } : {}),
    });
  },
};
