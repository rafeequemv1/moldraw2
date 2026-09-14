import { emptyInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

export const checkStructureTool: RegisteredAiTool = {
  id: 'molecule.check_structure',
  category: 'async',
  description:
    'Validate the drawn structure (valence violations, odd charges / radicals, overlapping atoms, stereo issues) and return a list of problems with atom ids. Native engine in MCP / HTTP; worker (Indigo optional) in-app.',
  inputSchema: emptyInputSchema,
  handler: async (_input, ctx) => {
    if (!ctx.runCheckStructure) {
      return toolFail(
        'NO_DISPATCHER',
        'molecule.check_structure requires ctx.runCheckStructure (in-app worker).',
      );
    }
    const r = await ctx.runCheckStructure();
    if (!r.ok) return toolFail('EXECUTION', r.error ?? 'Structure check failed');
    return toolOk(r.data ?? {});
  },
};
