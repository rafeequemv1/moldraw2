import { CMD } from '@moldraw/core';
import { alignFragmentsInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { dispatchCommand, toolOk } from '../types';
import { resolveMultiFragmentAtomIds } from './resolveFragment';

export const alignFragmentsTool: RegisteredAiTool = {
  id: 'molecule.align_fragments',
  category: 'recipe',
  description:
    'Align two or more connected molecules (toolbar Align). Pass moleculeIndexes from get_canvas_state, or select atoms spanning those molecules.',
  inputSchema: alignFragmentsInputSchema,
  handler: (input, ctx) => {
    const { mode, moleculeIndexes, atomIds, useSelection } = input as {
      mode: 'top' | 'center' | 'bottom' | 'left' | 'right' | 'centerX';
      moleculeIndexes?: number[];
      atomIds?: string[];
      useSelection?: boolean;
    };
    const resolved = resolveMultiFragmentAtomIds(ctx, {
      moleculeIndexes,
      atomIds,
      useSelection,
      minFragments: 2,
    });
    if (!resolved.ok) return resolved.error;

    const result = dispatchCommand(ctx, CMD.AlignSelectedFragments, {
      atomIds: resolved.data.atomIds,
      mode,
    });
    if (!result.ok) return result;
    return toolOk({
      fragmentCount: resolved.data.fragmentCount,
      atomCount: resolved.data.atomIds.length,
      mode,
    });
  },
};
