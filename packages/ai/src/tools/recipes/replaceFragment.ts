/**
 * Replace one connected molecule on the canvas with a new SMILES/name,
 * keeping roughly the same world position (individual edit without clearing others).
 */
import { CMD } from '@moldraw/core';
import { replaceFragmentInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { dispatchCommand, toolFail, toolOk } from '../types';
import { resolveFragmentAtomIds, type FragmentSelector } from './resolveFragment';

function fragmentCentroid(
  mol: { atoms: Array<{ id: string; x: number; y: number }> },
  atomIds: string[],
): { cx: number; cy: number } | null {
  const set = new Set(atomIds);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const a of mol.atoms) {
    if (!set.has(a.id)) continue;
    sx += a.x;
    sy += a.y;
    n += 1;
  }
  if (n === 0) return null;
  return { cx: sx / n, cy: sy / n };
}

export const replaceFragmentTool: RegisteredAiTool = {
  id: 'molecule.replace_fragment',
  category: 'recipe',
  description:
    'Replace ONE existing molecule with a new SMILES/name at the same spot. Pass moleculeIndex (from get_canvas_state, 0=leftmost) or smilesIncludes. Does not clear other molecules. Prefer this for “fix ethanol”, “replace leftmost with nicotine”.',
  inputSchema: replaceFragmentInputSchema,
  handler: async (input, ctx) => {
    const parsed = replaceFragmentInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolFail('VALIDATION', 'Invalid replace_fragment input', parsed.error.flatten());
    }
    if (!ctx.importSmiles && !ctx.applyCommand) {
      return toolFail(
        'NO_DISPATCHER',
        'molecule.replace_fragment requires ctx.importSmiles or ctx.applyCommand.',
      );
    }

    const { smiles, label, ...sel } = parsed.data;
    const resolved = resolveFragmentAtomIds(ctx, sel as FragmentSelector);
    if (!resolved.ok) return resolved.error;

    const before = ctx.getMolecule();
    const target = fragmentCentroid(before, resolved.data.atomIds);
    if (!target) {
      return toolFail('EXECUTION', 'Could not locate the target molecule.');
    }

    const del = dispatchCommand(ctx, CMD.DeleteAtoms, {
      atomIds: resolved.data.atomIds,
    });
    if (!del.ok) return del;

    let newAtomIds: string[] = [];
    if (ctx.importSmiles) {
      const r = await ctx.importSmiles(smiles.trim(), {
        mode: 'merge',
        placement: 'origin',
        useViewportGrid: false,
        compoundName: label?.trim() || undefined,
        focus: false,
      });
      if (!r.ok) {
        return toolFail('EXECUTION', r.error ?? 'Import of replacement failed');
      }
      newAtomIds = r.newAtomIds ?? [];
    } else {
      const r = ctx.applyCommand!('molecule.importSmiles', {
        smiles: smiles.trim(),
        mode: 'merge',
        placement: 'origin',
      });
      if (!r.ok) {
        return toolFail(
          (r.error?.code as 'VALIDATION' | 'EXECUTION') ?? 'EXECUTION',
          r.error?.message ?? 'Import of replacement failed',
        );
      }
      newAtomIds = (r.extra as { newAtomIds?: string[] } | undefined)?.newAtomIds ?? [];
    }

    if (newAtomIds.length === 0) {
      return toolFail('EXECUTION', 'Replacement imported but no new atoms were returned.');
    }

    const after = ctx.getMolecule();
    const placed = fragmentCentroid(after, newAtomIds);
    if (placed) {
      const dx = target.cx - placed.cx;
      const dy = target.cy - placed.cy;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        const moved = dispatchCommand(ctx, CMD.MoveAtoms, {
          atomIds: newAtomIds,
          dx,
          dy,
        });
        if (!moved.ok) return moved;
      }
    }

    if (newAtomIds.length > 0 && ctx.focusAtoms) {
      ctx.focusAtoms(newAtomIds);
    }

    return toolOk({
      replacedMoleculeIndex: resolved.data.moleculeIndex,
      deletedAtomCount: resolved.data.atomIds.length,
      newAtomIds,
      smiles: smiles.trim(),
      label: label?.trim() || undefined,
    });
  },
};
