import { CMD } from '@moldraw/core';
import { duplicateFragmentInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { dispatchCommand, toolOk } from '../types';
import { resolveFragmentAtomIds, type FragmentSelector } from './resolveFragment';

export const duplicateFragmentTool: RegisteredAiTool = {
  id: 'molecule.duplicate_fragment',
  category: 'recipe',
  description:
    'Duplicate a connected molecule shifted by (dx, dy). Prefer moleculeIndex from get_canvas_state.',
  inputSchema: duplicateFragmentInputSchema,
  handler: (input, ctx) => {
    const { dx, dy, ...sel } = input as FragmentSelector & { dx: number; dy: number };
    const resolved = resolveFragmentAtomIds(ctx, sel);
    if (!resolved.ok) return resolved.error;

    const result = dispatchCommand(ctx, CMD.DuplicateAtoms, {
      atomIds: resolved.data.atomIds,
      dx,
      dy,
    });
    if (!result.ok) return result;
    return toolOk({
      atomCount: resolved.data.atomIds.length,
      moleculeIndex: resolved.data.moleculeIndex,
      dx,
      dy,
      ...(result.data && typeof result.data === 'object' ? result.data : {}),
    });
  },
};
