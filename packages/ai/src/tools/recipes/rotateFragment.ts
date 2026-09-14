import { CMD } from '@moldraw/core';
import { rotateFragmentInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { dispatchCommand, toolFail, toolOk } from '../types';
import { resolveFragmentAtomIds, type FragmentSelector } from './resolveFragment';

export const rotateFragmentTool: RegisteredAiTool = {
  id: 'molecule.rotate_fragment',
  category: 'recipe',
  description:
    'Rotate a connected molecule by degrees around its bbox center (or cx/cy). Prefer moleculeIndex from get_canvas_state.',
  inputSchema: rotateFragmentInputSchema,
  handler: (input, ctx) => {
    const { degrees, cx, cy, ...sel } = input as FragmentSelector & {
      degrees: number;
      cx?: number;
      cy?: number;
    };
    const resolved = resolveFragmentAtomIds(ctx, sel);
    if (!resolved.ok) return resolved.error;

    let pivotX = cx;
    let pivotY = cy;
    if (pivotX == null || pivotY == null) {
      if (resolved.data.bbox) {
        pivotX = resolved.data.bbox.cx;
        pivotY = resolved.data.bbox.cy;
      } else {
        const mol = ctx.getMolecule();
        const idSet = new Set(resolved.data.atomIds);
        const atoms = mol.atoms.filter(a => idSet.has(a.id));
        if (atoms.length === 0) {
          return toolFail('EXECUTION', 'No atoms found for rotation.');
        }
        const xs = atoms.map(a => a.x);
        const ys = atoms.map(a => a.y);
        pivotX = (Math.min(...xs) + Math.max(...xs)) / 2;
        pivotY = (Math.min(...ys) + Math.max(...ys)) / 2;
      }
    }

    const deltaRad = (degrees * Math.PI) / 180;
    const result = dispatchCommand(ctx, CMD.RotateAtoms, {
      atomIds: resolved.data.atomIds,
      cx: pivotX,
      cy: pivotY,
      deltaRad,
    });
    if (!result.ok) return result;
    return toolOk({
      atomCount: resolved.data.atomIds.length,
      moleculeIndex: resolved.data.moleculeIndex,
      degrees,
      cx: pivotX,
      cy: pivotY,
    });
  },
};
