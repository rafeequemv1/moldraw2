import { perceiveRings } from '@moldraw/engine';
import { findRingsInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { toolOk } from '../types';

export const findRingsTool: RegisteredAiTool = {
  id: 'molecule.find_rings',
  category: 'read',
  description:
    'Perceive rings (SSSR) and return ordered atomIds/bondIds per ring. Use before coloring rings or when the user refers to “rings”.',
  inputSchema: findRingsInputSchema,
  handler: (input, ctx) => {
    const { size } = (input ?? {}) as { size?: number };
    const mol = ctx.getMolecule();
    let rings = perceiveRings(mol).map((r, index) => ({
      index,
      size: r.size,
      atomIds: r.atomIds,
      bondIds: r.bondIds,
    }));
    if (size != null) rings = rings.filter(r => r.size === size);
    return toolOk({ ringCount: rings.length, rings });
  },
};
