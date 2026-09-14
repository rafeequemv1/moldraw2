import { CMD } from '@moldraw/core';
import { deleteFragmentInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { dispatchCommand, toolOk } from '../types';
import { resolveFragmentAtomIds, type FragmentSelector } from './resolveFragment';

export const deleteFragmentTool: RegisteredAiTool = {
  id: 'molecule.delete_fragment',
  category: 'recipe',
  description:
    'Delete a connected molecule (and its bonds). Prefer moleculeIndex from get_canvas_state, or current selection.',
  inputSchema: deleteFragmentInputSchema,
  handler: (input, ctx) => {
    const sel = (input ?? {}) as FragmentSelector;
    const resolved = resolveFragmentAtomIds(ctx, sel);
    if (!resolved.ok) return resolved.error;

    const result = dispatchCommand(ctx, CMD.DeleteAtoms, {
      atomIds: resolved.data.atomIds,
    });
    if (!result.ok) return result;
    return toolOk({
      deletedAtomCount: resolved.data.atomIds.length,
      moleculeIndex: resolved.data.moleculeIndex,
    });
  },
};
