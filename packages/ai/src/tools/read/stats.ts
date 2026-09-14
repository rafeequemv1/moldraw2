import { countDocumentMolecules, getMolecularData } from '@moldraw/core';
import {
  moleculeStatsInputSchema,
  moleculeStatsOutputSchema,
} from '../../schemas/moleculeStats';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

const formatEmpirical = (order: string[], counts: Record<string, number>): string =>
  order.map(el => `${el}${counts[el] > 1 ? counts[el] : ''}`).join('');

export const statsTool: RegisteredAiTool = {
  id: 'molecule.stats',
  category: 'read',
  description:
    'Return connected-molecule count, atom/bond counts, canvas annotation counts, empirical formula, and molecular weight.',
  inputSchema: moleculeStatsInputSchema,
  handler: (_input, ctx) => {
    const mol = ctx.getMolecule();
    const { empirical, mw } = getMolecularData(mol);
    const data = {
      moleculeCount: countDocumentMolecules(mol),
      atomCount: mol.atoms.length,
      bondCount: mol.bonds.length,
      strokeCount: mol.strokes?.length ?? 0,
      canvasTextCount: mol.canvasTexts?.length ?? 0,
      reactionArrowCount: mol.reactionArrows?.length ?? 0,
      empiricalFormula: formatEmpirical(empirical.order, empirical.counts),
      molecularWeight: Math.round(mw * 100) / 100,
    };
    const out = moleculeStatsOutputSchema.safeParse(data);
    if (!out.success) {
      return toolFail('EXECUTION', 'Stats output validation failed', out.error.flatten());
    }
    return toolOk(out.data);
  },
};
