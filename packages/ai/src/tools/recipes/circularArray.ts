import { CMD } from '@moldraw/core';
import { circularArrayInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { dispatchCommand, toolOk } from '../types';
import { resolveFragmentAtomIds, type FragmentSelector } from './resolveFragment';

export const circularArrayTool: RegisteredAiTool = {
  id: 'molecule.circular_array',
  category: 'recipe',
  description:
    'Create a circular (polar) array of a molecule: count copies on a ring, optional angular spacing in degrees, and whether each copy rotates with its angle. Prefer moleculeIndex from get_canvas_state or useSelection.',
  inputSchema: circularArrayInputSchema,
  handler: (input, ctx) => {
    const { count, radius, spacingDeg, rotate, ...sel } = input as FragmentSelector & {
      count: number;
      radius: number;
      spacingDeg?: number;
      rotate?: boolean;
    };
    const resolved = resolveFragmentAtomIds(ctx, sel);
    if (!resolved.ok) return resolved.error;

    const result = dispatchCommand(ctx, CMD.CircularArraySelection, {
      atomIds: resolved.data.atomIds,
      count,
      radius,
      ...(spacingDeg != null ? { spacingDeg } : {}),
      rotate: rotate ?? true,
    });
    if (!result.ok) return result;
    return toolOk({
      atomCount: resolved.data.atomIds.length,
      moleculeIndex: resolved.data.moleculeIndex,
      count,
      radius,
      ...(spacingDeg != null ? { spacingDeg } : {}),
      rotate: rotate ?? true,
      ...(result.data && typeof result.data === 'object' ? result.data : {}),
    });
  },
};
