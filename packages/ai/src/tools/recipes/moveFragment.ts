import { CMD } from '@moldraw/core';
import { moveFragmentInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { dispatchCommand, toolOk } from '../types';
import { resolveFragmentAtomIds, type FragmentSelector } from './resolveFragment';

export const moveFragmentTool: RegisteredAiTool = {
  id: 'molecule.move_fragment',
  category: 'recipe',
  description:
    'Translate a connected molecule by (dx, dy). Prefer moleculeIndex from get_canvas_state (left=0) over inventing atom ids.',
  inputSchema: moveFragmentInputSchema,
  handler: (input, ctx) => {
    const { dx, dy, ...sel } = input as FragmentSelector & { dx: number; dy: number };
    const resolved = resolveFragmentAtomIds(ctx, sel);
    if (!resolved.ok) return resolved.error;

    const result = dispatchCommand(ctx, CMD.MoveAtoms, {
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
    });
  },
};
