import { exportSmilesInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

export const exportSmilesTool: RegisteredAiTool = {
  id: 'molecule.export_smiles',
  category: 'async',
  description:
    'Export the current structure as isomeric SMILES (disconnected fragments joined with "."). Native engine in MCP / HTTP sessions; worker in-app. Also available as the moldraw://molecule.smiles resource.',
  inputSchema: exportSmilesInputSchema,
  handler: async (_input, ctx) => {
    if (!ctx.exportSmiles) {
      return toolFail(
        'NO_DISPATCHER',
        'molecule.export_smiles requires ctx.exportSmiles (in-app worker).',
      );
    }
    const r = await ctx.exportSmiles();
    if (!r.ok) {
      return toolFail('EXECUTION', r.error ?? 'SMILES export failed');
    }
    return toolOk(r.data ?? {});
  },
};
